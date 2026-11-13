//! Narrow verification of root-subnet Governance MakeProposal refusal replies.
//! No caller can select a network key, destination, method or outcome class.
use crate::model::*;
use candid::{CandidType, Deserialize, Principal, Reserved};
use ic_certification::{Certificate, LookupResult};
use sha2::{Digest, Sha256};

fn hash(bytes: impl AsRef<[u8]>) -> Vec<u8> {
    Sha256::digest(bytes.as_ref()).to_vec()
}
fn leb(mut n: u64) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let b = (n & 127) as u8;
        n >>= 7;
        out.push(b | if n > 0 { 128 } else { 0 });
        if n == 0 {
            return out;
        }
    }
}
fn nat(bytes: &[u8]) -> Result<u64, String> {
    if bytes.is_empty() || bytes.len() > 10 {
        return Err("Invalid certificate timestamp".into());
    }
    let mut value = 0u64;
    for (i, b) in bytes.iter().enumerate() {
        if i == 9 && *b > 1 {
            return Err("Certificate timestamp overflow".into());
        }
        value |= u64::from(b & 127) << (7 * i);
        if b & 128 == 0 {
            return if i + 1 == bytes.len() && leb(value) == bytes {
                Ok(value)
            } else {
                Err("Noncanonical timestamp".into())
            };
        }
    }
    Err("Unterminated timestamp".into())
}
fn request_id(s: &State, p: &ProposalRefusalProof) -> Vec<u8> {
    let gov = Principal::from_text("rrkah-fqaaa-aaaaa-aaaaq-cai").expect("fixed Governance");
    let mut fields = vec![
        ("request_type", hash(b"call")),
        ("canister_id", hash(gov.as_slice())),
        ("method_name", hash(b"manage_neuron")),
        ("arg", hash(&p.argument)),
        ("sender", hash(s.plan.owner.as_slice())),
        ("ingress_expiry", hash(leb(p.ingress_expiry))),
    ];
    if let Some(nonce) = &p.nonce {
        fields.push(("nonce", hash(nonce)));
    }
    let mut fields: Vec<_> = fields.into_iter().map(|(k, v)| (hash(k), v)).collect();
    fields.sort_by(|a, b| a.0.cmp(&b.0));
    hash(
        fields
            .into_iter()
            .flat_map(|(k, v)| k.into_iter().chain(v))
            .collect::<Vec<_>>(),
    )
}
#[derive(CandidType, Deserialize)]
struct Request {
    id: Option<Id>,
    neuron_id_or_subaccount: Option<Selector>,
    command: Option<Command>,
}
#[derive(CandidType, Deserialize)]
struct Id {
    id: u64,
}
#[derive(CandidType, Deserialize)]
enum Selector {
    NeuronId(Id),
    Subaccount(Reserved),
}
#[derive(CandidType, Deserialize)]
enum Command {
    MakeProposal(Reserved),
}
#[derive(CandidType, Deserialize)]
struct Response {
    command: Option<Reply>,
}
#[derive(CandidType, Deserialize)]
enum Reply {
    Error(Error),
}
#[derive(CandidType, Deserialize)]
struct Error {
    error_type: i32,
    error_message: String,
}

pub fn verify(
    s: &State,
    p: &ProposalRefusalProof,
    now_ns: u64,
) -> Result<ProposalRefusalAudit, String> {
    let r = s
        .external_proposal
        .as_ref()
        .ok_or("No original proposal reservation")?;
    if p.intent_id != r.intent_id
        || !r.dispatched
        || r.proposal_id.is_some()
        || hash(&p.argument) != r.request_digest
        || p.argument.len() > 8192
        || p.certificate.len() > 8192
        || p.nonce.as_ref().is_some_and(|n| n.len() > 64)
    {
        return Err("Refusal does not bind the original dispatched request".into());
    }
    let request: Request = candid::decode_one(&p.argument)
        .map_err(|_| "Refusal request is not a typed MakeProposal")?;
    let proposer = match request.neuron_id_or_subaccount {
        Some(Selector::NeuronId(id)) => Some(id.id),
        Some(Selector::Subaccount(_)) => None,
        None => request.id.map(|id| id.id),
    };
    if proposer != Some(r.proposer) || !matches!(request.command, Some(Command::MakeProposal(_))) {
        return Err("Refusal belongs to another proposer/operation".into());
    }
    let cert: Certificate =
        serde_cbor::from_slice(&p.certificate).map_err(|_| "Invalid refusal certificate")?;
    // Governance is on the root subnet. A delegated application-subnet certificate
    // is never a substitute for this destination's root-signed response.
    if cert.delegation.is_some() {
        return Err("Governance refusal requires a root-subnet certificate".into());
    }
    let key = match s.plan.network {
        Network::Ic => include_bytes!("../compat/ic-root-public.der").as_slice(),
        Network::Local => include_bytes!("../compat/pocketic-15-root-public.der").as_slice(),
    };
    let mut message = b"\x0dic-state-root".to_vec();
    message.extend(cert.tree.digest());
    ic_verify_bls_signature::verify_bls_signature(
        &cert.signature,
        &message,
        &key[key.len() - 96..],
    )
    .map_err(|_| "Refusal certificate signature failed")?;
    let lookup = |path: Vec<&[u8]>| -> Result<&[u8], String> {
        match cert.tree.lookup_path(path) {
            LookupResult::Found(bytes) => Ok(bytes),
            _ => Err("Refusal certificate path unavailable".into()),
        }
    };
    let gov = Principal::from_text("rrkah-fqaaa-aaaaa-aaaaq-cai").expect("fixed Governance");
    if !reviewed_refusal_module(lookup(vec![b"canister", gov.as_slice(), b"module_hash"])?) {
        return Err("Refusal certificate does not bind a reviewed Governance executable".into());
    }
    let time = nat(lookup(vec![b"time"])?)?;
    // Authentic historical refusal evidence remains valid. Bound its time to the
    // original request and replicated reservation, never to a replacement attempt.
    if p.ingress_expiry < r.created_at.saturating_mul(1_000_000_000)
        || time < p.ingress_expiry.saturating_sub(600_000_000_000)
        || time > now_ns.saturating_add(300_000_000_000)
    {
        return Err("Refusal certificate is outside the original request window".into());
    }
    let id = request_id(s, p);
    if r.request_id.as_deref() != Some(id.as_slice()) {
        return Err("Refusal is not the original reserved ingress request; argument equality alone cannot exclude an earlier successful submission".into());
    }
    if lookup(vec![b"request_status", &id, b"status"])? != b"replied" {
        return Err("Refusal has no certified reply".into());
    }
    let reply = lookup(vec![b"request_status", &id, b"reply"])?;
    let response: Response =
        candid::decode_one(reply).map_err(|_| "Certified response is not a typed refusal")?;
    let Some(Reply::Error(error)) = response.command else {
        return Err("Certified response has no refusal".into());
    };
    // Pinned governance.rs make_proposal checks these before charging/insertion.
    // After insertion it returns Ok(proposal_id), including execution failures.
    // External(12), malformed, unknown and future codes are deliberately unresolved.
    if !audited_no_creation_error(error.error_type) || error.error_message.len() > 8192 {
        return Err("Governance outcome is not an audited no-creation refusal".into());
    }
    Ok(ProposalRefusalAudit {
        reservation: r.clone(),
        request_id: id,
        certificate_digest: hash(&p.certificate),
        reply_digest: hash(reply),
        error_type: error.error_type,
    })
}

// Source audit: protocol-mainnet.json / production-record.md, 2026-11-13.
// Governance 98c898f8 and local 83f29e08 have identical make_proposal,
// manage_neuron and ErrorType definitions. All audited errors precede fee charge
// and insertion; post-insertion execution errors still return Ok(proposal_id).
// Keep the old executable for authentic historical proofs. A new Candid-compatible
// module alone must never extend this no-creation proof classification.
fn reviewed_refusal_module(module: &[u8]) -> bool {
    const REVIEWED: [[u8; 32]; 3] = [
        [
            219, 207, 151, 174, 135, 41, 169, 86, 82, 26, 10, 146, 143, 27, 27, 203, 147, 246, 233,
            192, 218, 253, 14, 66, 170, 152, 85, 136, 113, 59, 136, 192,
        ],
        [
            127, 133, 18, 78, 224, 140, 63, 89, 192, 5, 0, 9, 38, 136, 7, 199, 174, 162, 184, 14,
            226, 150, 194, 51, 56, 176, 84, 88, 136, 143, 25, 223,
        ],
        [
            93, 220, 17, 210, 197, 157, 1, 153, 196, 142, 80, 220, 194, 156, 90, 198, 209, 0, 17,
            218, 166, 167, 89, 78, 238, 149, 75, 252, 20, 14, 57, 68,
        ],
    ];
    REVIEWED.iter().any(|hash| module == hash)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refusal_keeps_original_executable_binding_across_reviewed_upgrades() {
        // The original local and mainnet encodings remain accepted independently
        // of the currently installed version. Unknown/malformed bytes stay closed.
        assert!(reviewed_refusal_module(&[
            219, 207, 151, 174, 135, 41, 169, 86, 82, 26, 10, 146, 143, 27, 27, 203, 147, 246, 233,
            192, 218, 253, 14, 66, 170, 152, 85, 136, 113, 59, 136, 192
        ]));
        assert!(reviewed_refusal_module(&[
            127, 133, 18, 78, 224, 140, 63, 89, 192, 5, 0, 9, 38, 136, 7, 199, 174, 162, 184, 14,
            226, 150, 194, 51, 56, 176, 84, 88, 136, 143, 25, 223
        ]));
        assert!(reviewed_refusal_module(&[
            93, 220, 17, 210, 197, 157, 1, 153, 196, 142, 80, 220, 194, 156, 90, 198, 209, 0, 17,
            218, 166, 167, 89, 78, 238, 149, 75, 252, 20, 14, 57, 68
        ]));
        assert!(!reviewed_refusal_module(&[0; 32]));
        assert!(!reviewed_refusal_module(&[0; 31]));
        assert!(!audited_no_creation_error(12));
        assert!(!audited_no_creation_error(99));
    }
}
