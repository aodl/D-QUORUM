#![forbid(unsafe_code)]
pub mod evidence;
pub mod governance;
pub mod ledger;
use candid::{CandidType, Deserialize, Principal};
use ic_cdk::call::Call;
pub const GOVERNANCE: Principal = Principal::from_slice(&[0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
pub const LEDGER: Principal = Principal::from_slice(&[0, 0, 0, 0, 0, 0, 0, 2, 1, 1]);
pub const MAX_REPLY: usize = 1_900_000;
// Private transport: destinations and methods are selected only by the typed adapters.
async fn call<A: CandidType, R: for<'de> Deserialize<'de> + CandidType>(
    to: Principal,
    method: &str,
    arg: A,
) -> Result<R, String> {
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
    candid::decode_one_with_config(&b, &cfg).map_err(|e| bounded(format!("decode: {e}")))
}
pub fn bounded(s: String) -> String {
    s.chars().take(256).collect()
}
