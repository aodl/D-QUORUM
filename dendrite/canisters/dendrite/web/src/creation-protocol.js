import { Actor, HttpAgent, Certificate, requestIdOf, LookupPathStatus } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { runtimeConfiguration } from "./actor.js";
import { ICP_LEDGER_CANISTER_ID, CMC_CANISTER_ID, CYCLES_LEDGER_CANISTER_ID, validateProvisioningDelegation } from "./auth.js";
import { idlFactory as bootstrapFactory, init as bootstrapInit } from "../../../../src/declarations/bootstrap/bootstrap.did.js";
import { idlFactory as nnsFactory } from "../../../../src/declarations/nns-governance/nns-governance.did.js";
import { bytesHex, hexBytes, stakingSubaccount } from "./creation-accounts.js";
import { normalizeCertifiedCanisterState } from "./certified-canister-state.js";

const opt = (value) => IDL.Opt(value), blob = IDL.Vec(IDL.Nat8), empty = IDL.Record({});
const account = IDL.Record({ owner: IDL.Principal, subaccount: opt(blob) });
const tokens = IDL.Record({ e8s: IDL.Nat64 });
const badFee = IDL.Record({ expected_fee: IDL.Nat });
const transferError = IDL.Variant({ BadFee: badFee, BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }), InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
  TooOld: IDL.Null, CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }), Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
  TemporarilyUnavailable: IDL.Null, GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }) });
const transferArgs = IDL.Record({ from_subaccount: opt(blob), to: account, fee: opt(IDL.Nat), amount: IDL.Nat, memo: opt(blob), created_at_time: opt(IDL.Nat64) });
const blocksArgs = IDL.Record({ start: IDL.Nat64, length: IDL.Nat64 });
const block = IDL.Record({ transaction: IDL.Record({ memo: IDL.Nat64, icrc1_memo: opt(blob), created_at_time: IDL.Record({ timestamp_nanos: IDL.Nat64 }),
  operation: opt(IDL.Variant({ Transfer: IDL.Record({ from: blob, to: blob, amount: tokens, fee: tokens }), Mint: IDL.Reserved, Burn: IDL.Reserved, Approve: IDL.Reserved })) }), timestamp: IDL.Record({ timestamp_nanos: IDL.Nat64 }) });
const range = IDL.Record({ blocks: IDL.Vec(block) });
const archived = IDL.Record({ start: IDL.Nat64, length: IDL.Nat64, callback: IDL.Func([blocksArgs], [IDL.Variant({ Ok: range, Err: IDL.Reserved })], ["query"]) });
const history = IDL.Record({ first_block_index: IDL.Nat64, chain_length: IDL.Nat64, blocks: IDL.Vec(block), archived_blocks: IDL.Vec(archived) });
const legacyTransferArgs=IDL.Record({from_subaccount:opt(blob),to:blob,fee:tokens,amount:tokens,memo:IDL.Nat64,created_at_time:opt(IDL.Record({timestamp_nanos:IDL.Nat64}))});
const legacyTransferError=IDL.Variant({BadFee:IDL.Record({expected_fee:tokens}),InsufficientFunds:IDL.Record({balance:tokens}),TxTooOld:IDL.Record({allowed_window_nanos:IDL.Nat64}),TxCreatedInFuture:IDL.Null,TxDuplicate:IDL.Record({duplicate_of:IDL.Nat64})});
const ledgerFactory = () => IDL.Service({
  icrc1_fee: IDL.Func([], [IDL.Nat], []), icrc1_balance_of: IDL.Func([account], [IDL.Nat], []),
  icrc1_transfer: IDL.Func([transferArgs], [IDL.Variant({ Ok: IDL.Nat, Err: transferError })], []), query_blocks: IDL.Func([blocksArgs], [history], []),
  transfer:IDL.Func([legacyTransferArgs],[IDL.Variant({Ok:IDL.Nat64,Err:legacyTransferError})],[]),
});
const settings = IDL.Record({ controllers: opt(IDL.Vec(IDL.Principal)), compute_allocation: opt(IDL.Nat), memory_allocation: opt(IDL.Nat), freezing_threshold: opt(IDL.Nat) });
const subnetSelection = IDL.Variant({ Subnet: IDL.Record({ subnet: IDL.Principal }), Filter: IDL.Record({ subnet_type: opt(IDL.Text) }) });
const createSettings = IDL.Record({ settings: opt(settings), subnet_selection: opt(subnetSelection) });
const createArgs = IDL.Record({ from_subaccount: opt(blob), created_at_time: opt(IDL.Nat64), amount: IDL.Nat, creation_args: opt(createSettings) });
const createError = IDL.Variant({ InsufficientFunds: IDL.Record({ balance: IDL.Nat }), TooOld: IDL.Null,
  CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }), TemporarilyUnavailable: IDL.Null,
  Duplicate: IDL.Record({ duplicate_of: IDL.Nat, canister_id: opt(IDL.Principal) }),
  FailedToCreate: IDL.Record({ fee_block: opt(IDL.Nat), refund_block: opt(IDL.Nat), error: IDL.Text }),
  GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }) });
const cyclesValue=IDL.Rec();cyclesValue.fill(IDL.Variant({Int:IDL.Int,Nat:IDL.Nat,Nat64:IDL.Nat64,Text:IDL.Text,Blob:blob,Array:IDL.Vec(cyclesValue),Map:IDL.Vec(IDL.Tuple(IDL.Text,cyclesValue))}));
const cyclesBlocksArgs=IDL.Vec(IDL.Record({start:IDL.Nat,length:IDL.Nat})),cyclesBlocks=IDL.Rec();
cyclesBlocks.fill(IDL.Record({log_length:IDL.Nat,blocks:IDL.Vec(IDL.Record({id:IDL.Nat,block:cyclesValue})),archived_blocks:IDL.Vec(IDL.Record({args:cyclesBlocksArgs,callback:IDL.Func([cyclesBlocksArgs],[cyclesBlocks],["query"])}))}));
const cyclesFactory = () => IDL.Service({ icrc1_fee: IDL.Func([], [IDL.Nat], []), icrc1_balance_of: IDL.Func([account], [IDL.Nat], []),
  icrc3_get_blocks:IDL.Func([cyclesBlocksArgs],[cyclesBlocks],[]),
  create_canister: IDL.Func([createArgs], [IDL.Variant({ Ok: IDL.Record({ block_id: IDL.Nat, canister_id: IDL.Principal }), Err: createError })], []) });
const mintArgs = IDL.Record({ block_index: IDL.Nat64, to_subaccount: opt(blob), deposit_memo: opt(blob) });
const cmcFactory = () => IDL.Service({
  get_icp_xdr_conversion_rate: IDL.Func([], [IDL.Record({ data: IDL.Record({ timestamp_seconds: IDL.Nat64, xdr_permyriad_per_icp: IDL.Nat64 }), hash_tree: blob, certificate: blob })], []),
  notify_mint_cycles: IDL.Func([mintArgs], [IDL.Variant({ Ok: IDL.Record({ block_index: IDL.Nat, minted: IDL.Nat, balance: IDL.Nat }), Err: IDL.Variant({
    Refunded: IDL.Record({ reason: IDL.Text, block_index: opt(IDL.Nat64) }), InvalidTransaction: IDL.Text, TransactionTooOld: IDL.Nat64,
    Processing: IDL.Null, Other: IDL.Record({ error_code: IDL.Nat64, error_message: IDL.Text }),
  }) })], []),
});
const canisterArg = IDL.Record({ canister_id: IDL.Principal });
const installArgs = IDL.Record({ mode: IDL.Variant({ install: IDL.Null }), canister_id: IDL.Principal, wasm_module: blob, arg: blob, sender_canister_version: opt(IDL.Nat64) });
const uninstallArgs = IDL.Record({ canister_id: IDL.Principal, sender_canister_version: opt(IDL.Nat64) });
const updateSettingsArgs = IDL.Record({ canister_id: IDL.Principal, settings, sender_canister_version: opt(IDL.Nat64) });
const managementFactory = () => IDL.Service({
  canister_status: IDL.Func([canisterArg], [IDL.Record({ status: IDL.Variant({ running: IDL.Null, stopping: IDL.Null, stopped: IDL.Null }),
    settings: IDL.Record({ controllers: IDL.Vec(IDL.Principal), compute_allocation: IDL.Nat, memory_allocation: IDL.Nat, freezing_threshold: IDL.Nat }),
    module_hash: opt(blob), cycles: IDL.Nat, version: IDL.Nat64 })], []),
  install_code: IDL.Func([installArgs], [], []), stop_canister: IDL.Func([canisterArg], [], []), start_canister: IDL.Func([canisterArg], [], []),
  uninstall_code: IDL.Func([uninstallArgs], [], []), update_settings: IDL.Func([updateSettingsArgs], [], []),
});

// Exported types bind exact displayed arguments, their recovery intent and plan
// digest to the same Candid encoding sent by the supported actors.
export const creationArgumentTypes = Object.freeze({ transfer: transferArgs, mint: mintArgs, create: createArgs, install: installArgs, uninstall: uninstallArgs, updateSettings: updateSettingsArgs, canister: canisterArg,
  legacyTransfer:legacyTransferArgs,
  bootstrapAdvance:bootstrapFactory({IDL})._fields.find(([name])=>name==="advance")[1].argTypes[0],
  nns:nnsFactory({IDL})._fields.find(([name])=>name==="manage_neuron")[1].argTypes[0] });
const proposalType=creationArgumentTypes.nns.getType()._fields.find(([name])=>name==="command")[1]._type._fields.find(([name])=>name==="MakeProposal")[1];
export const encodeCreationRegistrationProposal=proposal=>IDL.encode([proposalType],[proposal]);
export const encodeBootstrapPlan = (plan) => IDL.encode(bootstrapInit({ IDL }), [plan]);
export const decodeBootstrapPlan = bytes => IDL.decode(bootstrapInit({IDL}),bytes)[0];

const utf8 = new TextEncoder();
const requestPath = (id, field) => [utf8.encode("request_status"), id, utf8.encode(field)];
const systemPath = (id, field) => [utf8.encode("canister"), id.toUint8Array(), utf8.encode(field)];
function publicRequest(request) {
  // CallRequest content only. Never retain the signed ingress envelope, an
  // identity, a delegation or its signatures in a recovery receipt.
  return { request_type: "call", canister_id: request.canister_id.toText(), method_name: request.method_name,
    arg: bytesHex(request.arg), sender: request.sender.toText(), ingress_expiry: request.ingress_expiry.toString(),
    nonce: request.nonce ? bytesHex(request.nonce) : null };
}
export function witnessRequestContent(request) {
  return { request_type: request.request_type, canister_id: Principal.fromText(request.canister_id), method_name: request.method_name,
    arg: hexBytes(request.arg), sender: Principal.fromText(request.sender), ingress_expiry: BigInt(request.ingress_expiry),
    ...(request.nonce === null ? {} : { nonce: hexBytes(request.nonce) }) };
}
async function witnessedUpdate(actor, methodName, args, includeSystemState) {
  const agent = Actor.agentOf(actor), canisterId = Actor.canisterIdOf(actor);
  const signature = Actor.interfaceOf(actor)._fields.find(([name]) => name === methodName)?.[1];
  if (!signature) throw Error("Unsupported creation evidence method.");
  const result = await agent.update(canisterId, { methodName, arg: IDL.encode(signature.argTypes, args), effectiveCanisterId: canisterId });
  if (!result.requestDetails || !result.reply) throw Error("Replicated creation response has no recoverable request evidence.");
  const request = publicRequest(result.requestDetails), requestId = requestIdOf(witnessRequestContent(request));
  let certificate = result.rawCertificate;
  if (includeSystemState) {
    certificate = (await agent.readState(canisterId, { paths: [requestPath(requestId, "status"), requestPath(requestId, "reply"),
      systemPath(canisterId, "module_hash"), systemPath(canisterId, "controllers"),systemPath(canisterId,"certified_data"), [utf8.encode("time")]] })).certificate;
  }
  const witness = { request, request_id: bytesHex(requestId), certificate: bytesHex(certificate) };
  await verifyCreationWitness(witness, { agent, canisterId, owner: result.requestDetails.sender, methodName, includeSystemState, historical: false });
  return { value: IDL.decode(signature.retTypes, result.reply)[0], witness };
}
export const createCanisterWithWitness = (cycles, args) => witnessedUpdate(cycles, "create_canister", [args], false);
export const bootstrapStatusWithWitness = (bootstrap, revision) => witnessedUpdate(bootstrap, "status", [revision], true);

export async function verifyOriginalCreationBurn(cycles,index,args,owner){
  const result=await cycles.icrc3_get_blocks([{start:BigInt(index),length:1n}]);
  if(result.archived_blocks.length||result.blocks.length!==1||result.blocks[0].id!==BigInt(index))throw Error("Original cycles creation burn is unavailable; do not create a replacement.");
  const map=value=>{if(!Array.isArray(value?.Map)||value.Map.length>16||new Set(value.Map.map(([k])=>k)).size!==value.Map.length)throw Error("Malformed cycles transaction map.");return new Map(value.Map);};
  const block=map(result.blocks[0].block),tx=map(block.get("tx")),from=tx.get("from")?.Array;
  if(tx.get("op")?.Text!=="burn"||tx.get("amt")?.Nat!==args.amount||tx.get("ts")?.Nat!==args.created_at_time[0]||tx.has("spender")
    ||!from||from.length!==2||bytesHex(from[0]?.Blob??[])!==bytesHex(Principal.from(owner).toUint8Array())||bytesHex(from[1]?.Blob??[])!==bytesHex(args.from_subaccount[0])
    ||bytesHex(tx.get("memo")?.Blob??[])!=="fe".repeat(32))throw Error("Cycles burn does not match the exact original creation identity/account/amount.");
  return result.blocks[0];
}

export async function verifyCreationWitness(witness, { agent, canisterId, owner, methodName, includeSystemState, historical = true }) {
  const request = witnessRequestContent(witness.request), id = requestIdOf(request), target = Principal.from(canisterId);
  if (request.request_type !== "call" || request.method_name !== methodName || request.canister_id.toText() !== target.toText()
    || request.sender.toText() !== Principal.from(owner).toText() || bytesHex(id) !== witness.request_id
    || !["create_canister", "status"].includes(methodName)) throw Error("Creation witness request binding failed.");
  // Historical evidence has an explicit finite retention window. It proves a
  // past transition, never present authority. Current state is read separately
  // with the SDK's ordinary freshness limits. Expired provenance fails closed.
  const certificate = await Certificate.create({ certificate: hexBytes(witness.certificate), rootKey: agent.rootKey,
    principal: { canisterId: target }, agent, disableTimeVerification: false,
    ...(historical ? { maxAgeInMinutes: 30 * 24 * 60 } : {}) });
  const found = (field) => { const value = certificate.lookup_path(requestPath(id, field));
    if (value.status !== LookupPathStatus.Found || !(value.value instanceof Uint8Array)) throw Error("Creation reply is absent from certified history.");return value.value; };
  if (new TextDecoder().decode(found("status")) !== "replied") throw Error("Creation request has no certified successful reply.");
  const factory = methodName === "status" ? bootstrapFactory : cyclesFactory;
  const signature = factory({ IDL })._fields.find(([name]) => name === methodName)[1];
  const args = IDL.decode(signature.argTypes, request.arg), value = IDL.decode(signature.retTypes, found("reply"))[0];
  return { args, value, system: includeSystemState ? normalizeCertifiedCanisterState(certificate, target) : undefined };
}

export async function createProvisioningActors(session, options = {}) {
  if (!session?.profile) throw new TypeError("A named provisioning session is required.");
  validateProvisioningDelegation(session.signingIdentity, session.profile, session.bootstrapCanisterId);
  session.validate();
  const config = runtimeConfiguration(options);
  const agent = await HttpAgent.create({ host: config.host, shouldFetchRootKey: config.shouldFetchRootKey, identity: session.signingIdentity, verifyQuerySignatures: true, retryTimes: 0 });
  session.validate();
  const actor = (factory, canisterId, extra = {}) => Actor.createActor(factory, { agent, canisterId, ...extra });
  if (session.profile === "FundProvisioning") return Object.freeze({
    ledger: actor(ledgerFactory, ICP_LEDGER_CANISTER_ID), cmc: actor(cmcFactory, CMC_CANISTER_ID), cycles: actor(cyclesFactory, CYCLES_LEDGER_CANISTER_ID),
  });
  if (session.profile === "ManageBootstrap") return Object.freeze({ management: actor(managementFactory, Principal.managementCanister(), { effectiveCanisterId: Principal.fromText(session.bootstrapCanisterId) }) });
  return Object.freeze({ bootstrap: actor(bootstrapFactory, session.bootstrapCanisterId) });
}

export async function readCreationLedgerBlock(index, options = {}) {
  const config = runtimeConfiguration(options);
  const agent = await HttpAgent.create({ host: config.host, shouldFetchRootKey: config.shouldFetchRootKey, verifyQuerySignatures: true, retryTimes: 0 });
  const ledger = Actor.createActor(ledgerFactory, { agent, canisterId: ICP_LEDGER_CANISTER_ID });
  const h = await ledger.query_blocks({ start: BigInt(index), length: 1n });
  if (h.blocks.length === 1 && h.first_block_index === BigInt(index)) return h.blocks[0];
  if (h.blocks.length > 1 || h.archived_blocks.length > 1) throw new Error("Invalid bounded ledger history response.");
  const range = h.archived_blocks[0];
  if (!range || BigInt(index) < range.start || BigInt(index) >= range.start+range.length || range.callback[1] !== "get_blocks") throw new Error("Original block unavailable; retain unresolved recovery intent.");
  const archive = Actor.createActor(() => IDL.Service({ get_blocks: IDL.Func([blocksArgs], [IDL.Variant({ Ok: IDL.Record({ blocks: IDL.Vec(block) }), Err: IDL.Reserved })], []) }), { agent, canisterId: range.callback[0] });
  const result = await archive.get_blocks({ start: BigInt(index), length: 1n });
  if (!result.Ok || result.Ok.blocks.length !== 1) throw new Error("Original archive block is unavailable.");
  return result.Ok.blocks[0];
}

export async function readCreationStakeBalance(controller,nonce,options={}){
  const config=runtimeConfiguration(options),agent=await HttpAgent.create({host:config.host,shouldFetchRootKey:config.shouldFetchRootKey,verifyQuerySignatures:true,retryTimes:0});
  const ledger=Actor.createActor(ledgerFactory,{agent,canisterId:ICP_LEDGER_CANISTER_ID});
  return ledger.icrc1_balance_of({owner:Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),subaccount:[stakingSubaccount(controller,nonce)]});
}
