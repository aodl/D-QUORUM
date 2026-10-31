#![forbid(unsafe_code)]
pub mod evidence;
pub mod governance;
pub mod ledger;
use candid::{CandidType, Deserialize, Principal};
use ic_cdk::call::Call;
thread_local! {static CALLS:std::cell::Cell<u64>=const{std::cell::Cell::new(0)};}
pub fn calls() -> u64 {
    CALLS.with(|x| x.get())
}
fn count_call() {
    CALLS.with(|x| x.set(x.get().checked_add(1).expect("call counter overflow")));
}
pub const GOVERNANCE: Principal = Principal::from_slice(&[0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
pub const LEDGER: Principal = Principal::from_slice(&[0, 0, 0, 0, 0, 0, 0, 2, 1, 1]);
pub const MAX_REPLY: usize = 1_900_000;
// Private transport: destinations and methods are selected only by the typed adapters.
async fn call<A: CandidType, R: for<'de> Deserialize<'de> + CandidType>(
    to: Principal,
    method: &str,
    arg: A,
) -> Result<R, String> {
    count_call();
    decode(
        Call::bounded_wait(to, method)
            .with_arg(arg)
            .await
            .map_err(|e| bounded(e.to_string()))?
            .into_bytes(),
    )
}
async fn no_args<R: for<'de> Deserialize<'de> + CandidType>(
    to: Principal,
    method: &str,
) -> Result<R, String> {
    count_call();
    decode(
        Call::bounded_wait(to, method)
            .with_args(&())
            .await
            .map_err(|e| bounded(e.to_string()))?
            .into_bytes(),
    )
}
fn decode<R: for<'de> Deserialize<'de> + CandidType>(b: Vec<u8>) -> Result<R, String> {
    if b.len() > MAX_REPLY {
        return Err("upstream response exceeds byte bound".into());
    }
    let mut cfg = candid::de::DecoderConfig::new();
    cfg.set_decoding_quota(20_000_000)
        .set_skipping_quota(20_000_000);
    // Candid diagnostics can contain raw input bytes, including readable private neuron data.
    candid::decode_one_with_config(&b, &cfg)
        .map_err(|_| "decode: incompatible or malformed Candid response".into())
}
pub fn bounded(s: String) -> String {
    s.chars().take(256).collect()
}

/// Poll exactly two independent reads concurrently, without an executor or spawned tasks.
pub async fn together<A: std::future::Future, B: std::future::Future>(
    a: A,
    b: B,
) -> (A::Output, B::Output) {
    use std::task::Poll;
    let (mut a, mut b) = (std::pin::pin!(a), std::pin::pin!(b));
    let (mut left, mut right) = (None, None);
    std::future::poll_fn(|cx| {
        if left.is_none()
            && let Poll::Ready(value) = a.as_mut().poll(cx)
        {
            left = Some(value);
        }
        if right.is_none()
            && let Poll::Ready(value) = b.as_mut().poll(cx)
        {
            right = Some(value);
        }
        match (left.take(), right.take()) {
            (Some(a), Some(b)) => Poll::Ready((a, b)),
            (a, b) => {
                left = a;
                right = b;
                Poll::Pending
            }
        }
    })
    .await
}

#[cfg(test)]
mod concurrent_reads {
    use super::*;
    use std::{
        cell::Cell,
        future::{Future, poll_fn},
        task::{Context, Poll, Waker},
    };
    #[test]
    fn both_reads_progress_without_repolling_a_completed_peer() {
        let left_polls = Cell::new(0);
        let right_polls = Cell::new(0);
        let left = poll_fn(|cx| {
            left_polls.set(left_polls.get() + 1);
            if left_polls.get() == 1 {
                cx.waker().wake_by_ref();
                Poll::Pending
            } else {
                Poll::Ready(7)
            }
        });
        let right = poll_fn(|_| {
            right_polls.set(right_polls.get() + 1);
            assert_eq!(right_polls.get(), 1);
            Poll::Ready(9)
        });
        let mut reads = std::pin::pin!(together(left, right));
        let mut cx = Context::from_waker(Waker::noop());
        assert!(reads.as_mut().poll(&mut cx).is_pending());
        assert_eq!(right_polls.get(), 1);
        assert_eq!(reads.as_mut().poll(&mut cx), Poll::Ready((7, 9)));
    }
}
