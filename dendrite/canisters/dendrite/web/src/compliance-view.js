import { clear, element, safeHttpsLink } from "./dom.js";
import {
  buildRuleDiagnostic,
  formatStatusSummary,
  summarizeRuleStatuses,
} from "./rule-diagnostics.js";

export const variantName = (value) => Object.keys(value ?? {})[0] ?? "Unknown";
const optional = (value, fallback = "Unavailable") => value?.[0] ?? fallback;
const principalText = (principal) => principal?.toText?.() ?? String(principal);
const attribute = (node, name) => node.getAttribute?.(name) ?? node.attributes?.[name] ?? null;

export const TOPIC_LABELS = new Map([
  [0, "CatchAll"], [1, "Neuron Management"], [2, "Exchange Rate"],
  [3, "Network Economics"], [4, "Governance"], [5, "Node Admin"],
  [6, "Participant Management"], [7, "Subnet Management"],
  [8, "Application Canister Management"], [9, "KYC"],
  [10, "Node Provider Rewards"], [12, "IC OS Version Deployment"],
  [13, "IC OS Version Election"], [14, "SNS and Community Fund"],
  [15, "API Boundary Node Management"], [16, "Subnet Rental"],
  [17, "Protocol Canister Management"], [18, "Service Nervous System Management"],
]);
export const topicLabel = (code) => `${code} — ${TOPIC_LABELS.get(code) ?? "Unknown topic"}`;

export const RULE_TITLES = Object.freeze({
  "DENDRITE-KNOWN-001": "Neuron data is public",
  "DENDRITE-KNOWN-002": "Neuron is registered as a known neuron",
  "DENDRITE-KNOWN-003": "At least one topic is committed",
  "DENDRITE-LOCK-001": "Neuron is locked",
  "DENDRITE-LOCK-002": "Dissolve delay is 2 years",
  "DENDRITE-LOCK-003": "Effective stake is positive",
  "DENDRITE-ACTIVE-001": "Voting power was refreshed within 6 months",
  "DENDRITE-ACTIVE-002": "Deciding voting power equals potential voting power",
  "DENDRITE-CONTROL-001": "Controller is a canister",
  "DENDRITE-CONTROL-002": "Controller canister has no installed code",
  "DENDRITE-CONTROL-003": "No principal controls the controller canister",
  "DENDRITE-CONTROL-004": "Neuron has no hotkeys",
  "DENDRITE-CONTROL-005": "Proposal-based dissolution is disabled",
  "DENDRITE-NM-001": "There are 5–15 managers",
  "DENDRITE-NM-002": "Manager list contains no duplicates",
  "DENDRITE-NM-003": "Neuron is not its own manager",
  "DENDRITE-NM-004": "Every manager is a public known neuron",
  "DENDRITE-COMMIT-001": "Each committed topic has at least 3 delegates",
  "DENDRITE-COMMIT-002": "No committed topic repeats a delegate",
  "DENDRITE-COMMIT-003": "Every committed delegate is also a manager",
  "DENDRITE-COMMIT-004": "Every followed delegate follows only omega-reject on that topic",
  "DENDRITE-DEFAULT-001": "Every known uncommitted topic uses an approved default",
  "DENDRITE-DEFAULT-002": "Catch-all uses an approved default",
});
export const ruleTitle = (id) => RULE_TITLES[id] ?? `Technical check: ${id}`;
export const RULE_DESCRIPTIONS = Object.freeze({
  "DENDRITE-KNOWN-001": "The target must be returned as a full public neuron.",
  "DENDRITE-KNOWN-002": "The target must contain valid known-neuron metadata.",
  "DENDRITE-KNOWN-003": "The target must commit to at least one concrete topic.",
  "DENDRITE-LOCK-001": "The target must remain locked and not be dissolving.",
  "DENDRITE-LOCK-002": "The dissolve delay must equal the standard maximum.",
  "DENDRITE-LOCK-003": "The target must have positive effective stake.",
  "DENDRITE-ACTIVE-001": "Voting power must have been refreshed within six nominal months.",
  "DENDRITE-ACTIVE-002": "Positive deciding voting power must equal potential voting power.",
  "DENDRITE-CONTROL-001": "The target controller must be inspectable as a canister.",
  "DENDRITE-CONTROL-002": "The controller canister must have no installed Wasm module.",
  "DENDRITE-CONTROL-003": "The controller canister must have no controllers.",
  "DENDRITE-CONTROL-004": "The target raw hotkey list must be empty.",
  "DENDRITE-CONTROL-005": "The neuron must have not_for_profit = false so that a Neuron Management proposal cannot start dissolving it.",
  "DENDRITE-NM-001": "Neuron Management must contain between five and fifteen managers.",
  "DENDRITE-NM-002": "The raw manager identifiers must be distinct.",
  "DENDRITE-NM-003": "The target must not list itself as a manager.",
  "DENDRITE-NM-004": "Every manager must be a full public known neuron.",
  "DENDRITE-COMMIT-001": "Each committed topic must have at least three delegates.",
  "DENDRITE-COMMIT-002": "Each committed topic's raw delegate identifiers must be distinct.",
  "DENDRITE-COMMIT-003": "Every committed delegate must also be a known manager.",
  "DENDRITE-COMMIT-004": "Every manager followed as a delegate must follow only Omega-reject — neuron 18422777432977120264 — on that same topic. Neuron Management is exempt.",
  "DENDRITE-DEFAULT-001": "Every currently known uncommitted concrete topic must follow exactly one approved default: Alpha-vote 2947465672511369, Omega-vote 18363645821499695760, or Omega-reject 18422777432977120264.",
  "DENDRITE-DEFAULT-002": "Catch-all must follow exactly one approved default: Alpha-vote, Omega-vote, or Omega-reject.",
});
export const ruleDescription = (id) => RULE_DESCRIPTIONS[id]
  ?? "This rule is not yet described by this interface; inspect its report message and raw evidence.";

export const RULE_GROUPS = Object.freeze([
  ["Neuron identity and commitments", ["DENDRITE-KNOWN-001", "DENDRITE-KNOWN-002", "DENDRITE-KNOWN-003"]],
  ["Lock and voting power", ["DENDRITE-LOCK-001", "DENDRITE-LOCK-002", "DENDRITE-LOCK-003", "DENDRITE-ACTIVE-001", "DENDRITE-ACTIVE-002"]],
  ["Control and immutability", ["DENDRITE-CONTROL-001", "DENDRITE-CONTROL-002", "DENDRITE-CONTROL-003", "DENDRITE-CONTROL-004", "DENDRITE-CONTROL-005"]],
  ["Manager group", ["DENDRITE-NM-001", "DENDRITE-NM-002", "DENDRITE-NM-003", "DENDRITE-NM-004"]],
  ["Committed-topic delegation", ["DENDRITE-COMMIT-001", "DENDRITE-COMMIT-002", "DENDRITE-COMMIT-003", "DENDRITE-COMMIT-004"]],
  ["Default following", ["DENDRITE-DEFAULT-001", "DENDRITE-DEFAULT-002"]],
]);

const STATUS_PRESENTATION = Object.freeze({
  Pass: { label: "Pass", icon: "✓", kind: "pass" },
  Fail: { label: "Fail", icon: "×", kind: "fail" },
  Indeterminate: { label: "Indeterminate", icon: "?", kind: "indeterminate" },
  Warning: { label: "Warning", icon: "!", kind: "warning" },
  StandardUpdateRequired: { label: "Standard update required", icon: "↻", kind: "standardupdaterequired" },
});
export const statusPresentation = (status) =>
  STATUS_PRESENTATION[status] ?? { label: status, icon: "?", kind: "indeterminate" };

export function errorMessage(error) {
  const generic = "The neuron report could not be loaded.";
  if (error instanceof Error) return error.message.trim().slice(0, 512) || generic;
  try {
    const kind = variantName(error), value = error?.[kind];
    if (typeof value === "string") return value.slice(0, 512);
    return kind === "Unknown" ? generic : kind;
  } catch {
    return generic;
  }
}

export const shortPrincipal = (principal) => {
  const value = principalText(principal);
  return value.length <= 17 ? value : `${value.slice(0, 7)}…${value.slice(-7)}`;
};
const checkedAtUtc = (seconds) => BigInt(seconds) > 0n ? new Date(Number(seconds) * 1000).toISOString() : "Unavailable";
const elapsedDaysHours = (checkedAt, refreshedAt) => {
  const elapsed = BigInt(checkedAt) - BigInt(refreshedAt);
  if (elapsed < 0n) return "Unavailable";
  const days = elapsed / 86_400n;
  const hours = (elapsed % 86_400n) / 3_600n;
  return `${days} day${days === 1n ? "" : "s"}, ${hours} hour${hours === 1n ? "" : "s"} ago`;
};
const formatDuration = (seconds) => {
  if (seconds === "Unavailable") return seconds;
  const value = BigInt(seconds);
  const years = Number(value) / 31_557_600;
  return years >= 1 ? `${years.toFixed(2)} years` : `${(Number(value) / 86_400).toFixed(1)} days`;
};
const formatIcp = (e8s) => {
  if (e8s === "Unavailable") return e8s;
  const value = BigInt(e8s), whole = value / 100_000_000n, fraction = (value % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} ICP`;
};

function announceCopy(announcer, value) {
  if (!announcer) return;
  announcer.textContent = "";
  globalThis.setTimeout?.(() => { announcer.textContent = `Copied ${value}`; }, 0);
}
function copyButton(value, label, copyText, announcer) {
  const button = document.createElement("button");
  button.className = "button-icon copy-button";
  button.type = "button";
  button.title = String(value);
  button.setAttribute("aria-label", `${label}: ${value}`);
  const icon = element("span", "", "icon icon-copy");
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  button.addEventListener("click", async () => {
    try {
      await copyText?.(String(value));
      button.classList?.add?.("copy-complete");
      announceCopy(announcer, String(value));
      globalThis.setTimeout?.(() => button.classList?.remove?.("copy-complete"), 1_500);
    } catch {
      if (announcer) announcer.textContent = "Copy failed";
    }
  });
  return button;
}
function metric(label, value, hint, className = "") {
  const node = document.createElement("div");
  node.className = `metric ${className}`.trim();
  const description = document.createElement("dd");
  if (value?.tagName || value?.tag) description.append(value);
  else description.textContent = String(value);
  node.append(element("dt", label), description);
  if (hint) node.append(element("p", hint, "muted"));
  return node;
}
function safeJson(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (typeof item?.toText === "function") return item.toText();
    if (typeof item?.__principal__ === "string" && Object.keys(item).length === 1) {
      return item.__principal__;
    }
    return item;
  }, 2);
}
// Presentation aggregation follows the Standard's deterministic severity order.
// It never changes the underlying report entries or evaluator semantics.
export const AGGREGATE_SEVERITY = Object.freeze({
  Fail: 0,
  StandardUpdateRequired: 1,
  Indeterminate: 2,
  Warning: 3,
  Pass: 4,
});
const severity = AGGREGATE_SEVERITY;

export function sortedFindings(rules) {
  return [...rules].filter((rule) => variantName(rule.status) !== "Pass")
    .sort((left, right) => (severity[variantName(left.status)] ?? 9) - (severity[variantName(right.status)] ?? 9));
}

function renderManagers(report, copyText, announcer) {
  const table = document.createElement("table");
  table.className = "manager-table responsive-table";
  const head = document.createElement("thead");
  const heading = document.createElement("tr");
  for (const name of ["Team Member", "Controller", "Hotkeys"]) {
    const cell = element("th", name);
    cell.setAttribute("scope", "col");
    heading.append(cell);
  }
  head.append(heading);
  const body = document.createElement("tbody");
  for (const manager of report.managers) {
    const row = document.createElement("tr");
    const id = manager.neuron_id.toString();
    const managerCell = document.createElement("th");
    managerCell.setAttribute("scope", "row");
    managerCell.setAttribute("data-label", "Team Member");
    const name = manager.known_neuron?.[0]?.name;
    const memberLink = safeHttpsLink(name ?? shortNeuronId(id), `https://dashboard.internetcomputer.org/neuron/${id}`);
    memberLink.className = "row-primary";
    memberLink.title = id;
    managerCell.append(memberLink, copyButton(id, "Copy neuron ID", copyText, announcer));
    const controller = manager.controller?.[0];
    const controllerCell = document.createElement("td");
    controllerCell.setAttribute("data-label", "Controller");
    controllerCell.append(element("span", controller ? shortPrincipal(controller) : "Unavailable"));
    if (controller) controllerCell.append(copyButton(
      principalText(controller), "Copy controller", copyText, announcer,
    ));
    const hotkeys = element("td", manager.hot_keys.length
      ? manager.hot_keys.map(shortPrincipal).join(" · ") : "None");
    hotkeys.setAttribute("data-label", "Hotkeys");
    row.append(managerCell, controllerCell, hotkeys);
    body.append(row);
  }
  table.append(head, body);
  return table;
}

export function groupTopics(report) {
  const groups = new Map();
  const add = (kind, topic, values, inherited = false) => {
    const normalized = [...values].map(BigInt).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    const key = `${kind}:${normalized.map(String).join(",")}`;
    const group = groups.get(key) ?? { kind, values: normalized, topics: [], inheritedTopics: new Set() };
    group.topics.push(topic);
    if (inherited) group.inheritedTopics.add(topic);
    groups.set(key, group);
  };
  for (const topic of report.committed_topics) add("Delegates", topic.topic, topic.delegate_ids);
  const catchAll = report.non_committed_topics.find((topic) => topic.topic === 0)?.followee_ids ?? [];
  for (const topic of report.non_committed_topics) {
    const inheritsCatchAll = topic.topic !== 0 && topic.followee_ids.length === 0 && catchAll.length > 0;
    add("Followees", topic.topic, inheritsCatchAll ? catchAll : topic.followee_ids, inheritsCatchAll);
  }
  return [...groups.values()];
}
const shortNeuronId = (value) => {
  const id = String(value);
  return id.length <= 12 ? id : `${id.slice(0, 6)}…${id.slice(-5)}`;
};
function knownNeuronNames(report, provenance) {
  const names = new Map();
  for (const [id, name] of provenance?.knownNeuronNames ?? []) names.set(String(id), name);
  const targetName = report.target?.[0]?.known_neuron?.[0]?.name;
  if (targetName) names.set(String(report.neuron_id), targetName);
  for (const manager of report.managers ?? []) {
    const name = manager.known_neuron?.[0]?.name;
    if (name) names.set(String(manager.neuron_id), name);
  }
  return names;
}
const neuronLabel = (report, value, provenance) => knownNeuronNames(report, provenance).get(String(value))
  ?? shortNeuronId(value);
function nameKnownNeurons(report, text) {
  let result = String(text);
  for (const [id, name] of knownNeuronNames(report)) {
    result = result.replace(new RegExp(`\\b${id}\\b`, "g"), name);
  }
  return result;
}

const attentionStatus = (status) => status !== "Pass";
const canonicalGroup = (ruleId) => RULE_GROUPS.find(([, ruleIds]) =>
  ruleIds.includes(ruleId))?.[0] ?? "Additional Standard rules";
export function canonicalRules(rules) {
  const positions = new Map(Object.keys(RULE_TITLES).map((id, index) => [id, index]));
  return [...rules].sort((left, right) => {
    const leftPosition = positions.get(left.rule_id) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = positions.get(right.rule_id) ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition || left.rule_id.localeCompare(right.rule_id);
  });
}
const optionalCompare = (left, right) => {
  const leftPresent = left?.length > 0, rightPresent = right?.length > 0;
  if (leftPresent !== rightPresent) return leftPresent ? -1 : 1;
  if (!leftPresent) return 0;
  return Number(left[0]) - Number(right[0]);
};
const compareRuleInstances = (left, right) =>
  optionalCompare(left.relevant_topic, right.relevant_topic)
  || String(left.message).localeCompare(String(right.message))
  || String(optional(left.observed, "")).localeCompare(String(optional(right.observed, "")))
  || String(optional(left.expected, "")).localeCompare(String(optional(right.expected, "")));

export function aggregateRules(rules) {
  const groups = new Map();
  for (const entry of rules) {
    const aggregate = groups.get(entry.rule_id) ?? {
      rule_id: entry.rule_id,
      title: ruleTitle(entry.rule_id),
      description: ruleDescription(entry.rule_id),
      entries: [],
    };
    aggregate.entries.push(entry);
    groups.set(entry.rule_id, aggregate);
  }
  return canonicalRules([...groups.values()].map((aggregate) => {
    aggregate.entries = [...aggregate.entries].sort(compareRuleInstances);
    aggregate.status = aggregate.entries.reduce((selected, entry) =>
      (severity[variantName(entry.status)] ?? Number.MAX_SAFE_INTEGER)
        < (severity[variantName(selected.status)] ?? Number.MAX_SAFE_INTEGER) ? entry : selected
    ).status;
    aggregate.evaluationCount = aggregate.entries.length;
    aggregate.topics = aggregate.entries
      .filter((entry) => entry.relevant_topic?.length)
      .map((entry) => entry.relevant_topic[0]);
    aggregate.observed = aggregate.entries.flatMap((entry) => entry.observed);
    aggregate.expected = aggregate.entries.flatMap((entry) => entry.expected);
    aggregate.relatedNeuronIds = aggregate.entries.flatMap((entry) => entry.related_neuron_ids);
    aggregate.messages = aggregate.entries.map((entry) => entry.message);
    return aggregate;
  }));
}
function disclosureButton(label, region, expanded = false, className = "") {
  const button = element("button", label, className);
  button.type = "button";
  button.setAttribute("aria-expanded", String(expanded));
  button.setAttribute("aria-controls", region.id);
  region.hidden = !expanded;
  button.addEventListener("click", () => {
    const open = button.attributes?.["aria-expanded"] === "true"
      || button.getAttribute?.("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    region.hidden = open;
  });
  return button;
}
let disclosureSequence = 0;
const disclosureId = (prefix) => `${prefix}-${++disclosureSequence}`;
function statusNode(rule, verificationKind) {
  const presentation = statusPresentation(variantName(rule.status), verificationKind, rule.rule_id);
  return statusText(presentation.label, presentation);
}
function statusText(status, suppliedPresentation) {
  const managerPresentation = {
    Found: { label: "Found", icon: "✓", kind: "pass" },
    ConfirmedMissing: { label: "Missing", icon: "×", kind: "fail" },
    Unavailable: { label: "Unavailable", icon: "?", kind: "indeterminate" },
  };
  const presentation = suppliedPresentation ?? managerPresentation[status] ?? statusPresentation(status);
  const node = document.createElement("span");
  node.className = `status-text status-${presentation.kind}`;
  const icon = element("span", presentation.icon, "status-icon");
  icon.setAttribute("aria-hidden", "true");
  node.append(icon, element("span", presentation.label));
  return node;
}
const SUMMARY_STATUSES = Object.freeze([
  ["Pass", "Pass"],
  ["Fail", "Fail"],
  ["Indeterminate", "Indeterminate"],
  ["Warning", "Warning"],
  ["Standard update required", "StandardUpdateRequired"],
]);
function renderStatusSummary(summary, className = "status-counts") {
  const node = document.createElement("span");
  node.className = className;
  for (const [label, canonical] of SUMMARY_STATUSES) {
    if (!summary[label]) continue;
    const presentation = statusPresentation(canonical);
    const segment = statusText(`${summary[label]} ${label.toLowerCase()}`, {
      ...presentation,
      label: `${summary[label]} ${label.toLowerCase()}`,
    });
    segment.classList?.add?.("status-count-segment");
    node.append(segment);
  }
  return node;
}
const statusVerb = (status) => ({
  Pass: "pass",
  Fail: "fail",
  Indeterminate: "could not be determined",
  Warning: "have warnings",
  StandardUpdateRequired: "use an unknown Standard variant",
})[status] ?? status.toLowerCase();
export function aggregateSummary(aggregate, verificationKind) {
  const status = variantName(aggregate.status);
  const label = statusPresentation(status, verificationKind, aggregate.rule_id).label;
  if (aggregate.evaluationCount === 1) return label;
  const matching = aggregate.entries.filter((entry) => variantName(entry.status) === status).length;
  const unit = aggregate.topics.length === aggregate.evaluationCount ? "topic" : "evaluation";
  const count = status === "Pass" ? aggregate.evaluationCount : matching;
  return `${label} · ${count} of ${aggregate.evaluationCount} ${unit}${aggregate.evaluationCount === 1 ? "" : "s"} ${statusVerb(status)}`;
}
function relatedNeuronChip(report, value, copyText, announcer) {
  const id = String(value);
  const chip = document.createElement("span");
  chip.className = "neuron-chip";
  const link = document.createElement("a");
  link.href = `#/neuron/${id}`;
  link.textContent = neuronLabel(report, id);
  link.title = id;
  link.setAttribute("aria-label", `Open Dendrite report for neuron ${id}`);
  chip.append(link, copyButton(id, "Copy neuron ID", copyText, announcer));
  return chip;
}
function diagnosticLink(link) {
  const visible = link.kind === "controller-canister" ? shortPrincipal(link.principal) : link.href;
  const node = safeHttpsLink(visible, link.href);
  node.title = link.principal ?? link.href;
  node.setAttribute("aria-label", `Open controller canister ${link.principal} in the Internet Computer Dashboard`);
  node.append(element("span", " ↗", "external-link-indicator"));
  return node;
}
function ruleDetails(report, rule, verificationKind, provenance, copyText, announcer) {
  const diagnostic = buildRuleDiagnostic({
    report,
    aggregate: { evaluationCount: 1 },
    entry: rule,
    verificationKind,
    provenance,
    requirement: ruleDescription(rule.rule_id),
  });
  const region = document.createElement("div");
  region.className = "rule-detail";
  region.append(
    element("h5", diagnostic.outcomeLabel, `outcome-heading outcome-${diagnostic.status.toLowerCase()}`),
    element("p", nameKnownNeurons(report, diagnostic.conciseReason), "rule-message"),
    element("p", "Requirement", "detail-label"),
    element("p", diagnostic.requirement, "rule-requirement"),
  );
  const facts = document.createElement("dl");
  for (const [index, value] of diagnostic.observedItems.entries()) {
    facts.append(metric(index ? "Observed (continued)" : "Observed", nameKnownNeurons(report, value)));
  }
  for (const [index, value] of diagnostic.expectedItems.entries()) {
    facts.append(metric(index ? "Expected (continued)" : "Expected", nameKnownNeurons(report, value)));
  }
  for (const link of diagnostic.links) facts.append(metric("Controller canister", diagnosticLink(link)));
  const controller = report.controller?.[0];
  if (rule.rule_id === "DENDRITE-CONTROL-003" && controller?.controllers?.length) {
    const principals = document.createElement("div");
    principals.className = "principal-list";
    for (const principal of controller.controllers) {
      const value = principalText(principal);
      const item = document.createElement("span");
      item.className = "principal-item";
      item.append(element("span", value), copyButton(value, "Copy controller principal", copyText, announcer));
      principals.append(item);
    }
    facts.append(metric("Retained controller principals", principals));
  }
  const target = report.target?.[0];
  if (rule.rule_id === "DENDRITE-CONTROL-004" && target?.hot_keys?.length) {
    const hotkeys = document.createElement("div");
    hotkeys.className = "principal-list";
    for (const principal of target.hot_keys) {
      const value = principalText(principal);
      const item = document.createElement("span");
      item.className = "principal-item";
      item.append(element("span", value), copyButton(value, "Copy hotkey principal", copyText, announcer));
      hotkeys.append(item);
    }
    facts.append(metric("Hotkey principals", hotkeys));
  }
  if (diagnostic.relevantTopic !== undefined) facts.append(metric("Relevant topic", topicLabel(diagnostic.relevantTopic)));
  if (diagnostic.relatedNeurons.length) {
    const chips = document.createElement("div");
    chips.className = "neuron-chips";
    for (const id of diagnostic.relatedNeurons) {
      chips.append(relatedNeuronChip(report, id, copyText, announcer));
    }
    facts.append(metric("Related neurons", chips));
  }
  facts.append(
    metric("Technical rule ID", element("code", rule.rule_id)),
  );
  region.append(facts);
  return region;
}
function aggregateRuleDetails(report, aggregate, verificationKind, provenance, copyText, announcer) {
  if (aggregate.evaluationCount === 1) {
    return ruleDetails(report, aggregate.entries[0], verificationKind, provenance, copyText, announcer);
  }
  const region = document.createElement("div");
  region.className = "rule-detail";
  region.append(
    element("p", aggregate.description, "rule-requirement"),
    element("p", aggregateSummary(aggregate, verificationKind), "aggregate-status-summary"),
  );
  const table = document.createElement("table");
  table.className = "rule-instance-table responsive-table";
  const head = document.createElement("thead");
  const heading = document.createElement("tr");
  for (const name of ["Topic", "Result", "Why this result", "Observed", "Expected", "Related neurons"]) {
    const cell = element("th", name);
    cell.setAttribute("scope", "col");
    heading.append(cell);
  }
  head.append(heading);
  const body = document.createElement("tbody");
  for (const entry of aggregate.entries) {
    const diagnostic = buildRuleDiagnostic({
      report, aggregate, entry, verificationKind, provenance, requirement: aggregate.description,
    });
    const row = document.createElement("tr");
    const topic = element("th", entry.relevant_topic?.length
      ? topicLabel(entry.relevant_topic[0]) : "General evaluation");
    topic.setAttribute("scope", "row");
    topic.setAttribute("data-label", "Topic");
    const result = document.createElement("td");
    result.setAttribute("data-label", "Result");
    result.append(statusNode(entry, verificationKind));
    const message = element("td", nameKnownNeurons(report, diagnostic.conciseReason));
    message.setAttribute("data-label", "Why this result");
    const observed = element("td", nameKnownNeurons(report, optional(entry.observed, "—")));
    observed.setAttribute("data-label", "Observed");
    const expected = element("td", nameKnownNeurons(report, optional(entry.expected, "—")));
    expected.setAttribute("data-label", "Expected");
    const related = document.createElement("td");
    related.setAttribute("data-label", "Related neurons");
    if (entry.related_neuron_ids.length) {
      const chips = document.createElement("div");
      chips.className = "neuron-chips";
      for (const id of entry.related_neuron_ids) {
        chips.append(relatedNeuronChip(report, id, copyText, announcer));
      }
      related.append(chips);
    } else {
      related.textContent = "—";
    }
    row.append(topic, result, message, observed, expected, related);
    body.append(row);
  }
  table.append(head, body);
  region.append(table, element("p", "", "technical-rule-label"));
  region.children[region.children.length - 1].append(
    "Technical rule ID: ",
    element("code", aggregate.rule_id),
  );
  return region;
}
function collapsedRuleSupport(report, rule, verificationKind, provenance) {
  const status = variantName(rule.status);
  if (rule.evaluationCount === 1) {
    return attentionStatus(status)
      ? buildRuleDiagnostic({
        report, aggregate: rule, entry: rule.entries[0], verificationKind, provenance,
        requirement: rule.description,
      }).conciseReason : "";
  }
  if (status === "Pass") return `${rule.evaluationCount} topic evaluations`;
  const matching = rule.entries.filter((entry) => variantName(entry.status) === status).length;
  const verb = status === "Fail" ? "fail"
    : status === "Warning" ? "have warnings"
      : status === "StandardUpdateRequired" ? "require a Standard update"
        : "could not be determined";
  return `${matching} of ${rule.evaluationCount} topic evaluations ${verb}`;
}
function renderRuleRows(report, rule, verificationKind, provenance, copyText, announcer) {
  const status = variantName(rule.status);
  const summaryRow = document.createElement("tr");
  summaryRow.className = `rule-summary-row rule-${status.toLowerCase()}`;
  summaryRow.setAttribute("data-status", status);
  summaryRow.setAttribute("data-rule-id", rule.rule_id);
  const detailRow = document.createElement("tr");
  detailRow.className = "rule-detail-row";
  detailRow.hidden = true;
  detailRow.id = disclosureId("rule-detail");
  const disclosureCell = document.createElement("td");
  disclosureCell.className = "rule-disclosure-cell";
  const toggle = document.createElement("button");
  toggle.className = "button-disclosure rule-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", detailRow.id);
  toggle.setAttribute("aria-label", `Show details for ${rule.title}`);
  const chevron = element("span", "", "chevron");
  chevron.setAttribute("aria-hidden", "true");
  toggle.append(chevron);
  const ruleCell = document.createElement("th");
  ruleCell.className = "rule-name-cell";
  ruleCell.setAttribute("scope", "row");
  const summary = document.createElement("div");
  summary.className = "rule-summary";
  summary.append(element("h4", rule.title));
  const support = collapsedRuleSupport(report, rule, verificationKind, provenance);
  if (support) summary.append(element("p", support, "rule-reason"));
  ruleCell.append(summary);
  const statusCell = document.createElement("td");
  statusCell.className = "rule-result-cell";
  statusCell.append(statusNode(rule, verificationKind));
  disclosureCell.append(toggle);
  summaryRow.append(disclosureCell, ruleCell, statusCell);
  const detailCell = document.createElement("td");
  detailCell.colSpan = 3;
  detailCell.setAttribute("colspan", "3");
  detailCell.append(aggregateRuleDetails(report, rule, verificationKind, provenance, copyText, announcer));
  detailRow.append(detailCell);
  toggle.addEventListener("click", () => {
    const expanded = attribute(toggle, "aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.setAttribute("aria-label", `${expanded ? "Show" : "Hide"} details for ${rule.title}`);
    detailRow.hidden = expanded;
  });
  summaryRow.addEventListener("click", (event) => {
    if (event.target === toggle || event.target?.closest?.("a, button, input, select, textarea")) return;
    if (globalThis.getSelection?.()?.toString()) return;
    toggle.click();
    toggle.focus();
  });
  return { rule, summaryRow, detailRow, toggle };
}
function renderRules(report, verificationKind, provenance, copyText, announcer) {
  const section = document.createElement("section");
  section.id = "rules";
  section.className = "rules-section";
  const heading = document.createElement("div");
  heading.className = "rules-heading";
  heading.append(element("h2", "Standard Rules"));
  section.append(heading);
  const filters = document.createElement("div");
  filters.className = "rule-filters";
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "Filter Standard Rules by status");
  const announcement = element("p", "", "sr-only rule-filter-announcement");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  const list = document.createElement("div");
  list.className = "rule-groups";
  const rows = [];
  const groupSections = [];
  const aggregatedRules = aggregateRules(report.rules);
  const totalSummary = summarizeRuleStatuses(aggregatedRules, verificationKind);
  for (const rule of aggregatedRules) {
    const group = canonicalGroup(rule.rule_id);
    let current = groupSections[groupSections.length - 1];
    if (!current || current.name !== group) {
      const groupSection = document.createElement("section");
      groupSection.className = "rule-group";
      const content = document.createElement("div");
      content.id = disclosureId("rule-group-content");
      content.className = "rule-group-content";
      const heading = document.createElement("h3");
      groupSection.append(heading, content);
      const table = document.createElement("table");
      table.className = "rule-table";
      const head = document.createElement("thead");
      const tableHeading = document.createElement("tr");
      const disclosureHeading = element("th", "");
      disclosureHeading.setAttribute("scope", "col");
      disclosureHeading.setAttribute("aria-label", "Details");
      const ruleHeading = element("th", "Rule");
      ruleHeading.setAttribute("scope", "col");
      const resultHeading = element("th", "Result");
      resultHeading.setAttribute("scope", "col");
      tableHeading.append(disclosureHeading, ruleHeading, resultHeading);
      head.append(tableHeading);
      const body = document.createElement("tbody");
      table.append(head, body);
      content.append(table);
      list.append(groupSection);
      current = { name: group, section: groupSection, heading, content, body, rows: [] };
      groupSections.push(current);
    }
    const rendered = renderRuleRows(report, rule, verificationKind, provenance, copyText, announcer);
    rows.push(rendered);
    current.rows.push(rendered);
    current.body.append(rendered.summaryRow, rendered.detailRow);
  }
  for (const group of groupSections) {
    const summary = summarizeRuleStatuses(group.rows.map(({ rule }) => rule), verificationKind);
    const countsText = SUMMARY_STATUSES.map(([label]) => label)
      .filter((label) => summary[label] > 0)
      .map((label) => `${summary[label]} ${label.toLowerCase()}`).join(" · ");
    const expanded = false;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "rule-group-toggle";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-controls", group.content.id);
    toggle.setAttribute("aria-label", `${group.name}, ${countsText.replaceAll(" · ", ", ")}`);
    const counts = renderStatusSummary(summary, "rule-group-counts");
    toggle.append(
      element("span", group.name, "rule-group-title"),
      counts,
      element("span", "", "chevron"),
    );
    toggle.children[2].setAttribute("aria-hidden", "true");
    group.content.hidden = !expanded;
    toggle.addEventListener("click", () => {
      const open = attribute(toggle, "aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      group.content.hidden = open;
      if (open) {
        for (const row of group.rows) {
          row.toggle.setAttribute("aria-expanded", "false");
          row.toggle.setAttribute("aria-label", `Show details for ${row.rule.title}`);
          row.detailRow.hidden = true;
        }
      }
    });
    group.heading.append(toggle);
    group.toggle = toggle;
    group.counts = counts;
    group.countSegments = [...counts.children];
    group.summary = summary;
  }
  const filterDefinitions = [
    { key: "All", count: totalSummary.totalDistinctRules, label: "All", icon: undefined, kind: "all" },
    ...(totalSummary.Pass ? [{ key: "Pass", count: totalSummary.Pass, label: "pass", icon: "✓", kind: "pass" }] : []),
    ...(totalSummary.Fail ? [{ key: "Fail", count: totalSummary.Fail, label: "fail", icon: "×", kind: "fail" }] : []),
    ...(totalSummary.Indeterminate ? [{
      key: "Indeterminate", count: totalSummary.Indeterminate, label: "undetermined", icon: "?", kind: "indeterminate",
    }] : []),
    ...(totalSummary.Warning ? [{
      key: "Warning", count: totalSummary.Warning, label: "warning", icon: "!", kind: "warning",
    }] : []),
    ...(totalSummary["Standard update required"] ? [{
      key: "StandardUpdateRequired", count: totalSummary["Standard update required"],
      label: "update required", icon: "↻", kind: "standardupdaterequired",
    }] : []),
  ];
  let activeFilter = "All";
  const buttons = new Map();
  const closeRow = ({ rule, detailRow, toggle }) => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", `Show details for ${rule.title}`);
    detailRow.hidden = true;
  };
  const setGroupExpanded = (group, expanded) => {
    group.toggle.setAttribute("aria-expanded", String(expanded));
    group.content.hidden = !expanded;
    if (!expanded) for (const row of group.rows) closeRow(row);
  };
  const apply = () => {
    let visible = 0;
    for (const row of rows) {
      const { rule, summaryRow, detailRow, toggle } = row;
      const hidden = activeFilter !== "All" && variantName(rule.status) !== activeFilter;
      summaryRow.hidden = hidden;
      if (hidden) closeRow(row);
      else detailRow.hidden = attribute(toggle, "aria-expanded") !== "true";
      if (!hidden) visible += 1;
    }
    for (const group of groupSections) {
      const matching = group.rows.some(({ summaryRow }) => !summaryRow.hidden);
      group.section.hidden = !matching;
      if (!matching) setGroupExpanded(group, false);
      const visibleSummary = activeFilter === "All" ? group.summary : Object.fromEntries(
        SUMMARY_STATUSES.map(([label, canonical]) => [label, canonical === activeFilter ? group.summary[label] : 0]),
      );
      const visibleKind = activeFilter === "All" ? undefined : statusPresentation(activeFilter).kind;
      group.counts.replaceChildren(...group.countSegments.filter((segment) =>
        visibleKind === undefined || segment.className?.split?.(" ").includes(`status-${visibleKind}`)));
      const countsText = formatStatusSummary(visibleSummary).replaceAll(" · ", ", ");
      group.toggle.setAttribute("aria-label", countsText ? `${group.name}, ${countsText}` : group.name);
    }
    for (const [key, button] of buttons) {
      button.setAttribute("aria-pressed", String(key === activeFilter));
    }
    announcement.textContent = `Showing ${visible} of ${rows.length} rules`;
  };
  for (const definition of filterDefinitions) {
    const button = document.createElement("button");
    button.className = `rule-filter rule-filter-${definition.kind}`;
    button.type = "button";
    button.setAttribute("aria-pressed", String(definition.key === "All"));
    if (definition.icon) {
      const icon = element("span", definition.icon, "status-icon");
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
    }
    button.append(element("span", `${definition.key === "All" ? "All" : definition.count} ${definition.key === "All" ? definition.count : definition.label}`));
    button.addEventListener("click", () => {
      const next = activeFilter === definition.key && definition.key !== "All" ? "All" : definition.key;
      activeFilter = next;
      apply();
    });
    filters.append(button);
    buttons.set(definition.key, button);
  }
  section.append(filters, announcement, list);
  apply();
  return section;
}

function expandableSection(id, title, summary, content, expanded = false, importance = "") {
  const section = document.createElement("section");
  section.id = id;
  section.className = `major-section ${importance}`.trim();
  const region = document.createElement("div");
  region.id = disclosureId(`${id}-content`);
  region.className = "section-content";
  region.append(...content);
  const heading = document.createElement("h2");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button-disclosure section-toggle";
  button.setAttribute("aria-expanded", String(expanded));
  button.setAttribute("aria-controls", region.id);
  button.append(
    element("span", title, "section-title"),
    element("span", summary, "section-summary"),
    element("span", "", "chevron"),
  );
  button.children[2].setAttribute("aria-hidden", "true");
  region.hidden = !expanded;
  button.addEventListener("click", () => {
    const open = attribute(button, "aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    region.hidden = open;
  });
  heading.append(button);
  section.append(heading, region);
  return section;
}
function renderTopics(report, copyText, announcer, provenance) {
  const table = document.createElement("table");
  table.className = "delegation-table responsive-table";
  const head = document.createElement("thead");
  const heading = document.createElement("tr");
  for (const name of ["Configuration", "Topics"]) {
    const cell = element("th", name);
    cell.setAttribute("scope", "col");
    heading.append(cell);
  }
  head.append(heading);
  const body = document.createElement("tbody");
  for (const group of groupTopics(report)) {
    const row = document.createElement("tr");
    const noun = group.kind === "Delegates" ? "delegate" : "followee";
    const configuration = document.createElement("th");
    configuration.setAttribute("scope", "row");
    configuration.setAttribute("data-label", "Configuration");
    configuration.append(element("span",
      `${group.values.length} ${noun}${group.values.length === 1 ? "" : "s"}`, "row-primary"));
    const chips = document.createElement("div");
    chips.className = "delegation-values";
    for (const value of group.values) {
      const id = String(value);
      const link = safeHttpsLink(neuronLabel(report, id, provenance), `https://dashboard.internetcomputer.org/neuron/${id}`);
      link.title = id;
      link.setAttribute("aria-label", `Neuron ${id}`);
      const item = document.createElement("div");
      item.className = "delegation-value";
      item.append(link, copyButton(id, "Copy neuron ID", copyText, announcer));
      chips.append(item);
    }
    configuration.append(chips);
    const topics = document.createElement("td");
    topics.setAttribute("data-label", "Topics");
    topics.append(
      element("span", `${group.topics.length} topic${group.topics.length === 1 ? "" : "s"}`, "row-primary"),
      element("span", group.topics.map((topic) => `${topicLabel(topic)}${group.inheritedTopics.has(topic) ? " (inherited from CatchAll)" : ""}`).join("\n"), "table-support topic-list"),
    );
    row.append(configuration, topics);
    body.append(row);
  }
  table.append(head, body);
  return table;
}

export function verdictText(report) {
  switch (variantName(report.overall_status)) {
    case "Compliant":
      return "Compliant";
    case "NonCompliant":
      return "Not Compliant";
    case "Indeterminate":
      return "Indeterminate";
    case "StandardUpdateRequired":
      return "Standard Update Required";
    default:
      return "Indeterminate";
  }
}

const overallPresentation = (status) => ({
  Compliant: statusPresentation("Pass"),
  NonCompliant: statusPresentation("Fail"),
  Indeterminate: statusPresentation("Indeterminate"),
  StandardUpdateRequired: statusPresentation("StandardUpdateRequired"),
})[status] ?? statusPresentation("Indeterminate");

function rawReportCopy(report, copyText, announcer) {
  const json = safeJson(report);
  const line = document.createElement("p");
  line.className = "raw-report-link";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "button-icon copy-button";
  copy.setAttribute("aria-label", "Copy raw report");
  const icon = element("span", "", "icon icon-copy");
  icon.setAttribute("aria-hidden", "true");
  copy.append(icon);
  copy.addEventListener("click", async () => {
    try {
      await copyText?.(json);
      copy.classList?.add?.("copy-complete");
      if (announcer) announcer.textContent = "Raw report copied";
      globalThis.setTimeout?.(() => copy.classList?.remove?.("copy-complete"), 1_500);
    } catch {
      if (announcer) announcer.textContent = "Copy failed";
    }
  });
  line.append(element("span", "Raw Report"), copy);
  return line;
}

export function renderReport(root, viewModel, options = {}) {
  clear(root);
  const { report, verificationKind = "Preliminary", provenance } = viewModel.report ? viewModel : {
    report: viewModel,
    verificationKind: "Preliminary",
  };
  const target = report.target?.[0], known = target?.known_neuron?.[0];
  const announcer = element("p", "", "sr-only copy-announcer");
  announcer.setAttribute("aria-live", "polite");
  announcer.setAttribute("aria-atomic", "true");
  root.append(announcer);
  const header = document.createElement("header");
  header.className = "report-header";
  const idLine = document.createElement("p");
  idLine.className = "neuron-id";
  idLine.append(
    element("span", String(report.neuron_id)),
    copyButton(report.neuron_id, "Copy neuron ID", options.copyText, announcer),
  );
  header.append(
    element("p", `NNS Dendrite Standard · ${report.standard_version}`, "eyebrow report-eyebrow"),
    element("h1", known?.name ?? `Neuron ${report.neuron_id}`, "report-title"),
  );
  const exactStatus = variantName(report.overall_status);
  const presentation = overallPresentation(exactStatus);
  header.append(
    element("h2", verdictText(report), `header-verdict status-${presentation.kind}`),
    idLine,
    rawReportCopy(report, options.copyText, announcer),
  );
  const metrics = document.createElement("dl");
  metrics.className = "metrics header-metrics";
  const refreshedAt = target?.voting_power_refreshed_timestamp_seconds?.[0];
  const freshness = refreshedAt === undefined
    ? "Unavailable"
    : elapsedDaysHours(report.checked_at_timestamp_seconds, refreshedAt);
  const freshnessValue = element("span", freshness);
  if (refreshedAt !== undefined) freshnessValue.title = checkedAtUtc(refreshedAt);
  metrics.append(
    metric("Dissolve delay", formatDuration(optional(target?.dissolve_delay_seconds))),
    metric("Dissolving state", target?.dissolving?.length ? (target.dissolving[0] ? "Dissolving" : "Locked") : "Unavailable"),
    metric("Effective stake", formatIcp(optional(target?.effective_stake_e8s))),
    metric("Hotkeys", target ? String(target.hot_keys.length) : "Unavailable"),
    metric("Voting-power freshness", freshnessValue),
  );
  header.append(metrics);
  if (known?.links?.length) {
    const links = document.createElement("div");
    links.className = "known-links";
    for (const url of known.links) {
      try { links.append(safeHttpsLink(url, url)); }
      catch { links.append(element("span", "Rejected unsafe URL")); }
    }
    header.append(links);
  }
  root.append(header);
  root.append(renderRules(report, verificationKind, provenance, options.copyText, announcer));
  const managerStatuses = report.managers.map((manager) => variantName(manager.evidence_status));
  const unavailableManagers = managerStatuses.filter((status) => status === "Unavailable").length;
  const missingManagers = managerStatuses.filter((status) => status === "ConfirmedMissing").length;
  const managerSummary = [
    `${report.managers.length} team member${report.managers.length === 1 ? "" : "s"}`,
    ...(unavailableManagers ? [`${unavailableManagers} unavailable`] : []),
    ...(missingManagers ? [`${missingManagers} missing`] : []),
  ].join(" · ");
  const managerContent = report.managers.length
    ? [renderManagers(report, options.copyText, announcer)]
    : [element("p", "No team members are listed.", "empty-state")];
  root.append(expandableSection(
    "managers",
    "Team Members",
    managerSummary,
    managerContent,
    false,
    unavailableManagers || missingManagers ? "section-important" : "",
  ));

  const topicGroups = groupTopics(report);
  const topicCount = new Set([
    ...report.committed_topics.map((topic) => topic.topic),
    ...report.non_committed_topics.map((topic) => topic.topic),
  ]).size;
  const topicIssues = new Set(report.rules
    .filter((rule) => rule.relevant_topic?.length && variantName(rule.status) !== "Pass")
    .map((rule) => `${rule.rule_id}:${rule.relevant_topic[0]}`)).size;
  const delegationSummary = [
    `${topicGroups.length} configuration${topicGroups.length === 1 ? "" : "s"}`,
    `${topicCount} topic${topicCount === 1 ? "" : "s"}`,
    ...(topicIssues ? [`${topicIssues} issue${topicIssues === 1 ? "" : "s"}`] : []),
  ].join(" · ");
  root.append(expandableSection("delegation", "Topic Delegation", delegationSummary,
    topicCount ? [renderTopics(report, options.copyText, announcer, provenance)] : [
      element("p", "No topic configurations are listed.", "empty-state"),
    ], false, topicIssues ? "section-important" : ""));

}
