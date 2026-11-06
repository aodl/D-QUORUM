use std::collections::{BTreeMap, VecDeque};

pub const GLOBAL_WINDOW_SECONDS: u64 = 60;
pub const MAX_CHECKS_PER_WINDOW: usize = 20;
pub const MAX_CONCURRENT_CHECKS: usize = 2;
pub const MAX_IN_FLIGHT_AGE_SECONDS: u64 = 300;
pub const MIN_CYCLE_RESERVE: u128 = 2_000_000_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Rejection {
    GlobalRate(u64),
    Concurrency,
    Duplicate,
    LowCycles,
}

#[derive(Default)]
pub struct CheckGuard {
    starts: VecDeque<u64>,
    in_flight: BTreeMap<u64, u64>,
}

impl CheckGuard {
    pub fn begin(&mut self, neuron_id: u64, now: u64, cycles: u128) -> Result<(), Rejection> {
        self.in_flight
            .retain(|_, started_at| started_at.saturating_add(MAX_IN_FLIGHT_AGE_SECONDS) > now);
        if cycles < MIN_CYCLE_RESERVE {
            return Err(Rejection::LowCycles);
        }
        if self.in_flight.contains_key(&neuron_id) {
            return Err(Rejection::Duplicate);
        }
        if self.in_flight.len() >= MAX_CONCURRENT_CHECKS {
            return Err(Rejection::Concurrency);
        }
        while self
            .starts
            .front()
            .is_some_and(|at| at.saturating_add(GLOBAL_WINDOW_SECONDS) <= now)
        {
            self.starts.pop_front();
        }
        if self.starts.len() >= MAX_CHECKS_PER_WINDOW {
            return Err(Rejection::GlobalRate(
                self.starts[0]
                    .saturating_add(GLOBAL_WINDOW_SECONDS)
                    .saturating_sub(now),
            ));
        }
        self.in_flight.insert(neuron_id, now);
        self.starts.push_back(now);
        Ok(())
    }

    pub fn finish(&mut self, neuron_id: u64) {
        self.in_flight.remove(&neuron_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cycle_duplicate_and_concurrency_limits_are_enforced() {
        let mut guard = CheckGuard::default();
        assert_eq!(
            guard.begin(1, 100, MIN_CYCLE_RESERVE - 1),
            Err(Rejection::LowCycles)
        );
        assert_eq!(guard.begin(1, 100, MIN_CYCLE_RESERVE), Ok(()));
        assert_eq!(
            guard.begin(1, 100, MIN_CYCLE_RESERVE),
            Err(Rejection::Duplicate)
        );
        assert_eq!(guard.begin(2, 100, MIN_CYCLE_RESERVE), Ok(()));
        assert_eq!(
            guard.begin(3, 100, MIN_CYCLE_RESERVE),
            Err(Rejection::Concurrency)
        );
        guard.finish(1);
        assert_eq!(guard.begin(3, 100, MIN_CYCLE_RESERVE), Ok(()));
    }

    #[test]
    fn global_window_is_bounded_and_expires() {
        let mut guard = CheckGuard::default();
        for id in 1..=MAX_CHECKS_PER_WINDOW as u64 {
            guard.begin(id, 100, MIN_CYCLE_RESERVE).unwrap();
            guard.finish(id);
        }
        assert_eq!(
            guard.begin(99, 100, MIN_CYCLE_RESERVE),
            Err(Rejection::GlobalRate(60))
        );
        assert_eq!(guard.begin(99, 160, MIN_CYCLE_RESERVE), Ok(()));
    }

    #[test]
    fn abandoned_in_flight_entries_expire_without_a_timer() {
        let mut guard = CheckGuard::default();
        guard.begin(1, 100, MIN_CYCLE_RESERVE).unwrap();
        guard.begin(2, 100, MIN_CYCLE_RESERVE).unwrap();
        assert_eq!(
            guard.begin(3, 399, MIN_CYCLE_RESERVE),
            Err(Rejection::Concurrency)
        );
        assert_eq!(guard.begin(1, 400, MIN_CYCLE_RESERVE), Ok(()));
        guard.finish(1);
        assert_eq!(guard.begin(3, 400, MIN_CYCLE_RESERVE), Ok(()));
    }
}
