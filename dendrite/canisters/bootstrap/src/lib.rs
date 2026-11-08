#![forbid(unsafe_code)]
mod engine;
pub mod model;
mod protocol;
use candid::{CandidType, Deserialize};
use model::*;
use std::cell::{Cell, RefCell};

thread_local! {
    static STATE: RefCell<Option<State>> = const { RefCell::new(None) };
    static BUSY: Cell<bool> = const { Cell::new(false) };
}
fn load() -> State {
    STATE.with_borrow(|s| s.as_ref().expect("bootstrap not initialized").clone())
}
fn save(s: &State) {
    let bytes = candid::encode_one(s).expect("bounded state encoding");
    assert!(
        bytes.len() <= MAX_STATE_BYTES,
        "bootstrap state bound exceeded"
    );
    ic_cdk::storage::stable_save((s,)).expect("cannot checkpoint bootstrap state");
    STATE.with_borrow_mut(|slot| *slot = Some(s.clone()));
}
fn caller() -> candid::Principal {
    ic_cdk::api::msg_caller()
}
#[ic_cdk::init]
fn init(plan: Plan) {
    assert_eq!(
        caller(),
        plan.owner,
        "installer must be the actual plan owner"
    );
    let state = State::new(plan, ic_cdk::api::canister_self()).expect("invalid creation plan");
    save(&state);
}
#[ic_cdk::post_upgrade]
fn post_upgrade() {
    let (s,): (State,) =
        ic_cdk::storage::stable_restore().expect("unsupported or corrupt bootstrap stable state");
    s.validate_restored(ic_cdk::api::canister_self())
        .expect("unsupported or corrupt bootstrap stable state");
    save(&s);
}
#[ic_cdk::update]
fn status(revision: u64) -> Result<State, String> {
    let s = load();
    s.authorize(caller(), revision)?;
    Ok(s)
}
#[ic_cdk::update]
fn replace_plan(revision: u64, plan: Plan) -> Result<State, String> {
    if BUSY.get() {
        return Err("Creation operation in progress".into());
    }
    let mut s = load();
    s.authorize(caller(), revision)?;
    s.replace(plan)?;
    save(&s);
    Ok(s)
}
#[derive(CandidType, Deserialize)]
pub struct Advance {
    pub revision: u64,
    pub step: Step,
}
struct Busy;
impl Drop for Busy {
    fn drop(&mut self) {
        BUSY.set(false);
    }
}
#[ic_cdk::update]
async fn advance(request: Advance) -> Result<State, String> {
    let mut s = load();
    s.authorize(caller(), request.revision)?;
    if ic_cdk::api::canister_cycle_balance() < u128::from(s.plan.cycle_reserve) {
        return Err("Cycle reserve insufficient; retain recoverable control".into());
    }
    if BUSY.replace(true) {
        return Err("Creation operation already in progress".into());
    }
    let _guard = Busy;
    let sequence = s.begin(request.step.clone(), ic_cdk::api::time())?;
    save(&s); // Durable intent precedes every asynchronous boundary.
    let result = engine::perform(&engine::Replica, &mut s, request.step).await;
    let current = load();
    if current.plan.revision != s.plan.revision || current.sequence != sequence {
        return Err("Stale creation completion".into());
    }
    match result {
        Ok(()) => {
            s.finish(sequence)?;
            save(&s);
            Ok(s)
        }
        Err(message) => {
            // A preflight/read failure dispatched nothing. A possibly executed
            // mutation retains its original effect and cannot be replaced.
            if s.pending.as_ref().is_some_and(|p| p.effect.is_none()) {
                s.pending = None;
            }
            s.last_error = Some(protocol::bounded(&message));
            save(&s);
            Err(protocol::bounded(message))
        }
    }
}
ic_cdk::export_candid!();
pub fn export_candid() -> String {
    __export_service()
}

#[cfg(test)]
mod tests;
