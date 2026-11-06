import { Principal } from "@icp-sdk/core/principal";
import { element } from "./dom.js";

const variantName = (value) => Object.keys(value ?? {})[0] ?? "Unavailable";
const principal = (value) => Principal.fromText(value.toText());
const matches = (left, right) => principal(left).compareTo(principal(right)) === "eq";

export function classifyManagerAuthority(manager, authenticatedPrincipal) {
  const status = variantName(manager.evidence_status);
  if (status === "Unavailable") return { role: "Unavailable", eligible: false };
  if (status === "ConfirmedMissing") return { role: "Manager not returned", eligible: false };
  const controller = manager.controller?.[0];
  const isController = Boolean(controller && matches(controller, authenticatedPrincipal));
  const isHotkey = manager.hot_keys.some((hotkey) => matches(hotkey, authenticatedPrincipal));
  const role = isController && isHotkey ? "Controller and hotkey"
    : isController ? "Controller"
      : isHotkey ? "Hotkey" : "No authority";
  return { role, eligible: isController || isHotkey, isController, isHotkey };
}

export function renderManagerAuthority(root, report, authenticatedPrincipal) {
  root.append(
    element("h2", "Read-only manager authority recognition"),
    element("p", "Roles in this table are computed locally from the current live report and are read-only. Transaction controls below can submit signed calls directly from this browser to NNS Governance after fresh preflight, exact review, and confirmation. Dendrite remains anonymous and stores no identity or transaction history."),
  );
  const table = document.createElement("table");
  table.append(element("caption", "Current principal and raw manager entries"));
  const head = document.createElement("tr");
  for (const label of ["Manager neuron", "Known name", "Evidence", "Your role", "Eligible proposer"]) head.append(element("th", label));
  table.append(head);
  for (const manager of report.managers) {
    const classification = classifyManagerAuthority(manager, authenticatedPrincipal);
    const row = document.createElement("tr");
    for (const value of [
      manager.neuron_id,
      manager.known_neuron?.[0]?.name ?? "None",
      variantName(manager.evidence_status),
      classification.role,
      classification.eligible ? "Yes — subject to fresh preflight and confirmation" : "No",
    ]) row.append(element("td", value));
    table.append(row);
  }
  root.append(
    table,
    element("p", "Only a manager neuron's controller may add this principal as a hotkey. An existing hotkey cannot add another hotkey. Never add a hotkey to the target Dendrite neuron. Onboarding is not complete until a later route-loaded report shows the principal."),
  );
}
