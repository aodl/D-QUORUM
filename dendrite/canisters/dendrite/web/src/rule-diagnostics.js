const variantName = (value) => Object.keys(value ?? {})[0] ?? "Unknown";
const option = (value) => value?.[0];
const principalText = (value) => value?.toText?.() ?? String(value);
const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const OUTCOME_LABELS = Object.freeze({
  Pass: "Why it passed",
  Fail: "Why it failed",
  Indeterminate: "Why this could not be determined",
  Warning: "Why this needs attention",
  StandardUpdateRequired: "Why a Standard update is required",
});

const statusLabel = (status) =>
  status === "StandardUpdateRequired" ? "Standard update required" : status;

const sourceFailureText = (report, relatedIds) => {
  const related = new Set(relatedIds.map(String));
  const failures = (report.source_failures ?? []).filter((failure) =>
    !failure.affected_neuron_ids?.length
    || failure.affected_neuron_ids.some((id) => related.has(String(id))));
  return failures.map((failure) => {
    const kind = variantName(failure.kind);
    const affected = failure.affected_neuron_ids?.length
      ? ` for neuron${failure.affected_neuron_ids.length === 1 ? "" : "s"} ${failure.affected_neuron_ids.join(", ")}`
      : "";
    return `${failure.method} ${kind}: ${String(failure.message).slice(0, 512)}${affected}`;
  });
};

const controllerReason = ({ report, entry, status, verificationKind, provenance }) => {
  const principal = option(report.target)?.controller?.[0];
  const principalString = principal ? principalText(principal) : undefined;
  const controller = option(report.controller);
  const source = verificationKind === "Preliminary"
    ? provenance?.controllerEvidence?.kind === "certified-system-state"
      ? "IC-certified system state"
      : "IC-certified system state was unavailable"
    : "the Dendrite canister";
  const failureReason = provenance?.controllerEvidence?.kind === "unavailable"
    ? String(provenance.controllerEvidence.reason).slice(0, 512)
    : sourceFailureText(report, entry.related_neuron_ids ?? [])[0];
  const result = {
    principal: principalString,
    source,
    failureReason,
    links: principalString ? [{
      kind: "controller-canister",
      principal: principalString,
      href: `https://dashboard.internetcomputer.org/canister/${principalString}`,
    }] : [],
  };
  if (entry.rule_id === "DENDRITE-CONTROL-001") {
    if (!principalString) {
      result.reason = "The target neuron did not report a controller canister.";
    } else if (status === "Pass") {
      result.reason = `Controller state was obtained for controller canister ${principalString} from ${source}.`;
    } else {
      result.reason = `Controller state for ${principalString} could not be obtained from ${source}${failureReason ? `: ${failureReason}` : ""}.`;
    }
  } else if (entry.rule_id === "DENDRITE-CONTROL-002") {
    const hash = controller?.module_hash?.[0];
    if (status === "Pass") {
      result.reason = `Controller canister ${principalString} has no installed Wasm module.`;
    } else if (status === "Fail" && hash) {
      const full = typeof hash?.[Symbol.iterator] === "function"
        ? [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("")
        : String(option(entry.observed) ?? hash).replace(/^module hash /, "");
      result.reason = `Controller canister ${principalString} has an installed Wasm module (${full.slice(0, 8)}…${full.slice(-8)}); the expected state is no module.`;
    } else {
      result.reason = `The module state for controller canister ${principalString ?? "reported by the target"} could not be determined${failureReason ? `: ${failureReason}` : ""}.`;
    }
  } else if (entry.rule_id === "DENDRITE-CONTROL-003") {
    const controllers = controller?.controllers?.map(principalText) ?? [];
    if (status === "Pass") {
      result.reason = `Controller canister ${principalString} has an empty controller list.`;
    } else if (status === "Fail") {
      result.reason = `Controller canister ${principalString} retains ${plural(controllers.length, "controller")}, ${controllers.join(", ")}. The controller list must be empty.`;
    } else {
      result.reason = `The controller list for canister ${principalString ?? "reported by the target"} could not be determined${failureReason ? `: ${failureReason}` : ""}.`;
    }
  }
  return result;
};

const genericReason = ({ report, entry, status }) => {
  const observed = option(entry.observed);
  const expected = option(entry.expected);
  if (status === "Pass") return entry.message || `${entry.rule_id} satisfied its requirement.`;
  if (status === "StandardUpdateRequired") {
    return `${entry.message}${observed ? ` Observed: ${observed}.` : ""}`;
  }
  const failures = sourceFailureText(report, entry.related_neuron_ids ?? []);
  if (status === "Indeterminate" && failures.length) {
    return `${entry.message} Source failure: ${failures.join("; ")}.`;
  }
  if (observed && expected) return `${observed}; expected ${expected}.`;
  if (observed) return `${entry.message} Observed: ${observed}.`;
  if (expected) return `${entry.message} Expected: ${expected}.`;
  return entry.message || `${entry.rule_id} produced ${status}.`;
};

export function buildOutcomeExplanation({
  status,
  ruleId,
  report,
  observedItems,
  expectedItems,
  relatedNeurons,
}) {
  const failures = sourceFailureText(report, relatedNeurons);
  if (ruleId === "DENDRITE-KNOWN-002") {
    const known = option(report.target)?.known_neuron?.[0];
    if (status === "Pass" && known) {
      return `Governance returned valid known-neuron metadata for ${known.name}.`;
    }
    if (status === "Indeterminate") {
      return `Known-neuron metadata could not be retrieved${failures.length ? `: ${failures.join("; ")}` : ""}. No failure was inferred.`;
    }
    return `Governance confirmed that no known-neuron metadata is registered for neuron ${report.neuron_id}.`;
  }
  if (ruleId === "DENDRITE-CONTROL-005") {
    const setting = option(report.target)?.not_for_profit?.[0];
    if (status === "Pass") {
      return "Proposal-based dissolution is disabled because not_for_profit is false.";
    }
    if (status === "Fail" && setting === true) {
      return "Proposal-based dissolution is enabled because not_for_profit is true. The manager group could vote to start dissolving the neuron.";
    }
    return "The not_for_profit setting was unavailable, so proposal-based dissolution could not be assessed.";
  }
  if (status === "Fail" && observedItems.length && expectedItems.length) {
    return `${observedItems.join("; ")}; expected ${expectedItems.join("; ")}.`;
  }
  if (status === "Indeterminate" && failures.length) {
    return `The required data could not be retrieved: ${failures.join("; ")}.`;
  }
  return undefined;
}

const duplicates = (values) => {
  const seen = new Set();
  return values.map(String).filter((value) => seen.has(value) || !seen.add(value));
};

const structuredValues = (report, entry) => {
  const target = option(report.target);
  const controller = option(report.controller);
  const managers = report.managers?.map((manager) => String(manager.neuron_id)) ?? [];
  const observed = entry.observed?.length ? [...entry.observed] : [];
  const expected = entry.expected?.length ? [...entry.expected] : [];
  const set = (values, fallback) => values.length ? values : [fallback];
  switch (entry.rule_id) {
    case "DENDRITE-KNOWN-001":
      return [set(observed, target ? `full public neuron ${report.neuron_id} returned` : `target neuron ${report.neuron_id} not returned`), set(expected, "full public neuron data returned")];
    case "DENDRITE-KNOWN-002":
      return [set(observed, target?.known_neuron?.length
        ? `Governance metadata: ${target.known_neuron[0].name}`
        : sourceFailureText(report, [report.neuron_id]).length
          ? `metadata unavailable: ${sourceFailureText(report, [report.neuron_id]).join("; ")}`
          : "Governance confirmed no known-neuron metadata"),
      set(expected, "valid known-neuron metadata")];
    case "DENDRITE-LOCK-001":
      return [set(observed, target?.dissolving?.length ? (target.dissolving[0] ? "dissolving" : "locked and not dissolving") : "dissolving state unavailable"), set(expected, "locked and not dissolving")];
    case "DENDRITE-LOCK-002":
      return [set(observed, target?.dissolve_delay_seconds?.length ? `${target.dissolve_delay_seconds[0]} seconds` : "dissolve delay unavailable"), set(expected, "63115200 seconds")];
    case "DENDRITE-LOCK-003":
      return [set(observed, target?.effective_stake_e8s?.length ? `${target.effective_stake_e8s[0]} e8s` : "effective stake unavailable"), set(expected, "positive effective stake")];
    case "DENDRITE-ACTIVE-001":
      return [set(observed, target?.voting_power_refreshed_timestamp_seconds?.length ? `refreshed at ${target.voting_power_refreshed_timestamp_seconds[0]}; evidence at ${report.checked_at_timestamp_seconds}` : "voting-power refresh timestamp unavailable"), set(expected, "age no greater than 15778800 seconds")];
    case "DENDRITE-ACTIVE-002":
      return [set(observed, `potential ${option(target?.potential_voting_power) ?? "unavailable"}; deciding ${option(target?.deciding_voting_power) ?? "unavailable"}`), set(expected, "equal positive potential and deciding voting power")];
    case "DENDRITE-CONTROL-001":
      return [set(observed, target?.controller?.length ? `controller canister ${principalText(target.controller[0])}` : "no controller canister principal reported"), set(expected, "controller canister state available")];
    case "DENDRITE-CONTROL-002": {
      const hash = controller?.module_hash?.[0];
      const hex = hash ? typeof hash?.[Symbol.iterator] === "function"
        ? [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("")
        : String(option(entry.observed) ?? hash).replace(/^module hash /, "")
        : "no installed Wasm module";
      return [set(observed, hash ? `module hash ${hex}` : hex), set(expected, "no installed Wasm module")];
    }
    case "DENDRITE-CONTROL-003": {
      const retained = controller?.controllers?.map(principalText) ?? [];
      return [set(observed, retained.length ? `${plural(retained.length, "controller")}: ${retained.join(", ")}` : "no controllers"), set(expected, "no controllers")];
    }
    case "DENDRITE-CONTROL-004":
      return [set(observed, `${plural(target?.hot_keys?.length ?? 0, "hotkey")}${target?.hot_keys?.length ? `: ${target.hot_keys.map(principalText).join(", ")}` : ""}`), set(expected, "no hotkeys")];
    case "DENDRITE-CONTROL-005":
      return [set(observed, target?.not_for_profit?.length ? `not_for_profit = ${target.not_for_profit[0]}` : "not_for_profit = unavailable"), set(expected, "not_for_profit = false")];
    case "DENDRITE-NM-001":
      return [set(observed, plural(managers.length, "manager")), set(expected, "5 to 15 managers")];
    case "DENDRITE-NM-002": {
      const repeated = duplicates(managers);
      return [set(observed, repeated.length ? `duplicate manager IDs: ${repeated.join(", ")}` : "manager IDs are distinct"), set(expected, "distinct manager IDs")];
    }
    case "DENDRITE-NM-003":
      return [set(observed, managers.includes(String(report.neuron_id)) ? `target neuron ${report.neuron_id} appears as a manager` : "target is absent from manager list"), set(expected, "target is not its own manager")];
    default:
      return [observed, expected];
  }
};

export function buildRuleDiagnostic({
  report,
  aggregate,
  entry,
  verificationKind = "Consensus",
  provenance,
  requirement,
}) {
  const status = variantName(entry.status);
  const controller = entry.rule_id.startsWith("DENDRITE-CONTROL-")
    ? controllerReason({ report, entry, status, verificationKind, provenance }) : undefined;
  const [observedItems, expectedItems] = structuredValues(report, entry);
  const relatedNeurons = [...(entry.related_neuron_ids ?? [])];
  const explanation = controller?.reason ?? buildOutcomeExplanation({
    status,
    ruleId: entry.rule_id,
    report,
    observedItems,
    expectedItems,
    relatedNeurons,
  }) ?? genericReason({ report, entry, status });
  return Object.freeze({
    status,
    presentationStatus: statusLabel(status),
    outcomeLabel: OUTCOME_LABELS[status] ?? "Why this result occurred",
    conciseReason: explanation,
    explanationParts: Object.freeze([explanation]),
    requirement,
    observedItems: Object.freeze(observedItems),
    expectedItems: Object.freeze(expectedItems),
    links: Object.freeze(controller?.links ?? []),
    relatedNeurons: Object.freeze(relatedNeurons),
    relevantTopic: option(entry.relevant_topic),
    technicalRuleId: entry.rule_id,
    evaluationCount: aggregate?.evaluationCount ?? 1,
  });
}

export function summarizeRuleStatuses(aggregatedRules, verificationKind = "Consensus") {
  const counts = {
    Pass: 0,
    Fail: 0,
    Indeterminate: 0,
    Warning: 0,
    "Standard update required": 0,
  };
  let policyEvaluations = 0;
  for (const rule of aggregatedRules) {
    const status = variantName(rule.status);
    const label = statusLabel(status);
    counts[label] = (counts[label] ?? 0) + 1;
    policyEvaluations += rule.evaluationCount ?? rule.entries?.length ?? 1;
  }
  return Object.freeze({
    ...counts,
    totalDistinctRules: aggregatedRules.length,
    totalPolicyEvaluations: policyEvaluations,
  });
}

export function formatStatusSummary(summary) {
  const labels = ["Pass", "Fail", "Indeterminate", "Warning", "Standard update required"];
  return labels.filter((label) => summary[label] > 0)
    .map((label) => `${summary[label]} ${label.toLowerCase()}`).join(" · ");
}
