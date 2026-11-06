import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AGGREGATE_SEVERITY,
  aggregateRules,
  aggregateSummary,
  canonicalRules,
  renderReport,
  ruleDescription,
  ruleTitle,
  statusPresentation,
} from "../src/compliance-view.js";
import {
  buildRuleDiagnostic,
  formatStatusSummary,
  summarizeRuleStatuses,
} from "../src/rule-diagnostics.js";

class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.textContent = "";
    this.listeners = {};
    this.attributes = {};
    this.hidden = false;
    this.className = "";
    this.focused = false;
    this.classList = {
      add: (name) => { if (!this.className.split(" ").includes(name)) this.className = `${this.className} ${name}`.trim(); },
      remove: (name) => { this.className = this.className.split(" ").filter((item) => item !== name).join(" "); },
    };
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node && typeof node === "object") node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  addEventListener(name, listener) { (this.listeners[name] ??= []).push(listener); }
  dispatch(name, event = { preventDefault() {} }) {
    let result;
    for (const listener of this.listeners[name] ?? []) result = listener(event);
    return result;
  }
  click() { return this.dispatch("click", { target: this, preventDefault() {} }); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  focus() { this.focused = true; }
  closest(selector) {
    const tags = selector.split(",").map((item) => item.trim());
    return tags.includes(this.tag) ? this : this.parentNode?.closest?.(selector);
  }
}

const walk = (node, predicate, result = []) => {
  if (node === undefined || node === null) return result;
  if (predicate(node)) result.push(node);
  for (const child of node.children ?? []) walk(child, predicate, result);
  return result;
};
const byText = (root, text) => walk(root, (node) => node.textContent === text);
const byAttribute = (root, name, value) => walk(root, (node) => node.attributes?.[name] === value);
const statusRule = (rule_id, status, overrides = {}) => ({
  rule_id,
  status: { [status]: null },
  message: `${status} reason for ${rule_id}`,
  observed: [],
  expected: [],
  relevant_topic: [],
  related_neuron_ids: [],
  ...overrides,
});
const rules = [
  statusRule("DENDRITE-LOCK-001", "Pass"),
  statusRule("DENDRITE-COMMIT-001", "Pass", { relevant_topic: [4] }),
  statusRule("DENDRITE-CONTROL-001", "Indeterminate"),
  statusRule("DENDRITE-KNOWN-002", "Fail", {
    observed: ["missing metadata"],
    expected: ["valid known_neuron_data"],
    relevant_topic: [4],
    related_neuron_ids: [18422777432977120264n],
  }),
  statusRule("DENDRITE-NM-001", "Warning"),
  statusRule("DENDRITE-DEFAULT-001", "StandardUpdateRequired"),
  statusRule("DENDRITE-KNOWN-001", "Pass"),
  statusRule("FUTURE-RULE-900", "Pass"),
];
const report = () => ({
  neuron_id: 42n,
  overall_status: { NonCompliant: null },
  standard_version: "nns-dendrite/1.1-draft",
  source_revision: "d55a0f4d4edfabe49d8fd543aff473084cb741f2",
  checked_at_timestamp_seconds: 100n,
  quorum_threshold: [3],
  target: [{
    known_neuron: [{ name: "Target", links: [] }],
    controller: [],
    hot_keys: [],
    not_for_profit: [false],
    dissolving: [false],
    dissolve_delay_seconds: [63115200n],
    effective_stake_e8s: [100000000n],
    voting_power_refreshed_timestamp_seconds: [90n],
  }],
  managers: [{ neuron_id: 9n, evidence_status: { Unavailable: null }, known_neuron: [], controller: [], hot_keys: [] }],
  committed_topics: [{ topic: 4, delegate_ids: [9n] }],
  non_committed_topics: [{ topic: 17, followee_ids: [2947465672511369n] }],
  controller: [],
  rules: rules.map((rule) => ({ ...rule })),
  source_failures: [{ method: "list_neurons", kind: { Rejected: null }, message: "unavailable", affected_neuron_ids: [9n] }],
});
const parityFixtures = JSON.parse(readFileSync(
  "canisters/dendrite/web/test/fixtures/evaluator.json",
  "utf8",
));
const decimalFields = new Set([
  "neuron_id", "checked_at_timestamp_seconds", "id", "dissolve_delay_seconds",
  "effective_stake_e8s", "minted_stake_e8s", "voting_power_refreshed_timestamp_seconds",
  "potential_voting_power", "deciding_voting_power",
]);
const decimalArrays = new Set([
  "related_neuron_ids", "affected_neuron_ids", "delegate_ids", "followee_ids",
  "neuron_management_followees",
]);
const optionFields = new Set([
  "target", "known_neuron", "controller", "not_for_profit", "dissolve_delay_seconds",
  "dissolving", "effective_stake_e8s", "voting_power_refreshed_timestamp_seconds",
  "potential_voting_power", "deciding_voting_power", "minted_stake_e8s", "module_hash",
  "observed", "expected", "relevant_topic", "quorum_threshold", "principal",
]);
const variantFields = new Set(["overall_status", "status", "evidence_status", "kind"]);
function reviveProjection(value, field) {
  if (value === null) return optionFields.has(field) ? [] : value;
  if (variantFields.has(field)) return { [value]: null };
  if (decimalFields.has(field)) {
    const revived = BigInt(value);
    return optionFields.has(field) ? [revived] : revived;
  }
  if (decimalArrays.has(field)) return value.map(BigInt);
  if (Array.isArray(value)) return value.map((item) => reviveProjection(item));
  if (typeof value === "object") {
    const revived = Object.fromEntries(Object.entries(value)
      .map(([name, item]) => [name, reviveProjection(item, name)]));
    return optionFields.has(field) ? [revived] : revived;
  }
  return optionFields.has(field) ? [value] : value;
}
const fullyCompliantReport = () => reviveProjection(
  parityFixtures.find((fixture) => fixture.name === "fully_compliant").projection,
);
const cssSource = readFileSync("canisters/dendrite/web/src/styles.css", "utf8");
const hexToken = (name) => cssSource.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))[1];
const luminance = (hex) => {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
};
const contrast = (left, right) => {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
};

function render(verificationKind = "Consensus", options = {}) {
  const prior = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  const root = new FakeNode("main");
  try {
    renderReport(root, { report: report(), verificationKind }, options);
    return root;
  } finally {
    globalThis.document = prior;
  }
}

test("policy status vocabulary has distinct visible text and decorative icons", () => {
  assert.deepEqual(
    ["Pass", "Fail", "Indeterminate", "Warning", "StandardUpdateRequired"]
      .map((status) => statusPresentation(status).label),
    ["Pass", "Fail", "Indeterminate", "Warning", "Standard update required"],
  );
  const root = render();
  assert.ok(byText(root, "Target").length);
  const subtitle = walk(root, (node) => node.className === "neuron-id")[0];
  assert.ok(byText(subtitle, "42").length);
  for (const [label, icon] of [
    ["Pass", "✓"], ["Fail", "×"], ["Indeterminate", "?"],
    ["Warning", "!"], ["Standard update required", "↻"],
  ]) {
    assert.ok(byText(root, label).length, label);
    const icons = byText(root, icon);
    assert.ok(icons.length, icon);
    assert.ok(icons.every((node) => node.attributes["aria-hidden"] === "true"));
  }
});

test("visual tokens meet text, icon, control, and focus contrast requirements", () => {
  const canvas = hexToken("canvas"), surface = hexToken("surface");
  for (const name of ["text", "text-muted", "accent", "pass", "fail", "warning", "indeterminate"]) {
    assert(contrast(hexToken(name), name === "text" ? canvas : surface) >= 4.5, name);
  }
  for (const name of ["divider-strong", "accent", "pass", "fail", "warning", "indeterminate", "focus"]) {
    assert(contrast(hexToken(name), surface) >= 3, name);
  }
  assert.match(cssSource, /prefers-reduced-motion/);
  assert.match(cssSource, /forced-colors:\s*active/);
  assert.match(cssSource, /\.rule-filter\[aria-pressed="true"\][^{]*\{[^}]*border-width:\s*2px[^}]*box-shadow:/s);
  assert.match(cssSource, /\.rule-filter-pass\s*\{[^}]*color:\s*var\(--pass\)/s);
  assert.match(cssSource, /\.rule-filter-fail\s*\{[^}]*color:\s*var\(--fail\)/s);
  assert.match(cssSource, /\.rule-group-counts \.status-pass\s*\{[^}]*color:\s*var\(--pass\)/s);
  assert.match(cssSource, /\.rule-group-counts \.status-fail\s*\{[^}]*color:\s*var\(--fail\)/s);
  assert.match(cssSource, /\.section-summary\s*\{[^}]*justify-self:\s*end;[^}]*text-align:\s*right/s);
  assert.match(cssSource, /\.rule-group-counts\s*\{[^}]*justify-self:\s*end;[^}]*text-align:\s*right/s);
});

test("rules render once in canonical order with a safe future-rule fallback", () => {
  const root = render();
  const headings = walk(root, (node) => node.tag === "h4" && (
    Object.values(Object.fromEntries(rules.map((rule) => [rule.rule_id, ruleTitle(rule.rule_id)]))).includes(node.textContent)
  )).map((node) => node.textContent);
  assert.deepEqual(headings, canonicalRules(rules).map((rule) => ruleTitle(rule.rule_id)));
  for (const rule of rules) assert.equal(headings.filter((title) => title === ruleTitle(rule.rule_id)).length, 1);
  assert.equal(ruleTitle("FUTURE-RULE-900"), "Technical check: FUTURE-RULE-900");
  assert.match(ruleDescription("FUTURE-RULE-900"), /not yet described/);
});

test("the 1.1 direct-rule title catalogue is exact", () => {
  const expected = {
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
  };
  for (const [id, title] of Object.entries(expected)) assert.equal(ruleTitle(id), title, id);
});

test("aggregation severity is documented and preserves every report entry", () => {
  assert.deepEqual(AGGREGATE_SEVERITY, {
    Fail: 0,
    StandardUpdateRequired: 1,
    Indeterminate: 2,
    Warning: 3,
    Pass: 4,
  });
  for (const [other, expected] of [
    ["Fail", "Fail"],
    ["Warning", "Warning"],
    ["Indeterminate", "Indeterminate"],
    ["StandardUpdateRequired", "StandardUpdateRequired"],
  ]) {
    const entries = [statusRule("FUTURE-RULE-900", "Pass"), statusRule("FUTURE-RULE-900", other)];
    const [aggregate] = aggregateRules(entries);
    assert.equal(Object.keys(aggregate.status)[0], expected);
    assert.deepEqual(new Set(aggregate.entries), new Set(entries));
  }
});

test("fully compliant parity report renders 23 rules from all 37 policy evaluations", () => {
  const source = fullyCompliantReport();
  assert.equal(source.rules.length, 37);
  const aggregates = aggregateRules(source.rules);
  assert.equal(aggregates.length, 23);
  const defaultRule = aggregates.find((rule) => rule.rule_id === "DENDRITE-DEFAULT-001");
  assert.equal(defaultRule.entries.length, 15);
  assert.equal(aggregateSummary(defaultRule, "Consensus"), "Pass · 15 of 15 topics pass");

  const prior = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  const root = new FakeNode("main");
  try { renderReport(root, { report: source, verificationKind: "Consensus" }); } finally { globalThis.document = prior; }
  assert.equal(walk(root, (node) => node.className?.includes?.("rule-summary-row")).length, 23);
  assert.equal(byText(root, "Every known uncommitted topic uses an approved default").length, 1);
  assert.ok(byText(root, "15 topic evaluations").length);
  const toggle = byAttribute(root, "aria-label", "Show details for Every known uncommitted topic uses an approved default")[0];
  const detail = walk(root, (node) => node.id === toggle.attributes["aria-controls"])[0];
  toggle.click();
  assert.equal(walk(detail, (node) => node.tag === "tbody")[0].children.length, 15);
  assert.equal(source.rules.length, 37);
  assert.ok(byText(root, "All 23").length);
  assert.ok(byText(root, "23 pass").length);
  assert.equal(byText(root, "0 fail").length, 0);
  for (const title of [
    "Neuron identity and commitments",
    "Lock and voting power",
    "Control and immutability",
    "Manager group",
    "Committed-topic delegation",
    "Default following",
  ]) assert.equal(byText(root, title).length, 1, title);
});

test("shared status summaries count aggregate rules once and omit zero statuses", () => {
  const aggregates = aggregateRules([
    statusRule("DENDRITE-DEFAULT-001", "Pass", { relevant_topic: [2] }),
    statusRule("DENDRITE-DEFAULT-001", "Fail", { relevant_topic: [3] }),
    statusRule("DENDRITE-CONTROL-001", "Indeterminate"),
  ]);
  const summary = summarizeRuleStatuses(aggregates, "Preliminary");
  assert.equal(summary.totalDistinctRules, 2);
  assert.equal(summary.totalPolicyEvaluations, 3);
  assert.equal(summary.Fail, 1);
  assert.equal(summary.Indeterminate, 1);
  assert.equal(formatStatusSummary(summary), "1 fail · 1 indeterminate");
});

test("controller diagnostics use structured evidence, exact links, and factual outcomes", () => {
  const principal = (text) => ({ toText: () => text });
  const source = report();
  source.target[0].controller = [principal("uuc56-gyb")];
  source.controller = [{
    call_succeeded: true,
    principal: [principal("uuc56-gyb")],
    module_hash: [Uint8Array.from({ length: 32 }, (_, index) => index)],
    controllers: [principal("2vxsx-fae"), principal("aaaaa-aa")],
  }];
  const provenance = { controllerEvidence: { kind: "certified-system-state" } };
  for (const [id, phrase] of [
    ["DENDRITE-CONTROL-002", "installed Wasm module"],
    ["DENDRITE-CONTROL-003", "retains 2 controllers"],
  ]) {
    const diagnostic = buildRuleDiagnostic({
      report: source,
      entry: statusRule(id, "Fail"),
      verificationKind: "Preliminary",
      provenance,
      requirement: ruleDescription(id),
    });
    assert.match(diagnostic.conciseReason, new RegExp(phrase));
    assert.match(diagnostic.conciseReason, /uuc56-gyb/);
    assert.equal(diagnostic.links[0].href, "https://dashboard.internetcomputer.org/canister/uuc56-gyb");
    assert.notEqual(diagnostic.conciseReason, diagnostic.requirement);
    assert.equal(diagnostic.technicalRuleId, id);
    assert.ok(diagnostic.observedItems.length);
    assert.ok(diagnostic.expectedItems.length);
  }
  const module = buildRuleDiagnostic({
    report: source,
    entry: statusRule("DENDRITE-CONTROL-002", "Fail"),
    provenance,
    requirement: ruleDescription("DENDRITE-CONTROL-002"),
  });
  assert.match(module.observedItems[0], /00010203.*1e1f/);
  const retained = buildRuleDiagnostic({
    report: source,
    entry: statusRule("DENDRITE-CONTROL-003", "Fail"),
    provenance,
    requirement: ruleDescription("DENDRITE-CONTROL-003"),
  });
  assert.match(retained.conciseReason, /2vxsx-fae/);
  assert.match(retained.conciseReason, /list must be empty/);
});

test("controller unavailable and missing-controller diagnostics never infer a result", () => {
  const source = report();
  source.target[0].controller = [{ toText: () => "uuc56-gyb" }];
  const unavailable = buildRuleDiagnostic({
    report: source,
    entry: statusRule("DENDRITE-CONTROL-001", "Indeterminate"),
    verificationKind: "Preliminary",
    provenance: { controllerEvidence: { kind: "unavailable", reason: "certificate was stale" } },
    requirement: ruleDescription("DENDRITE-CONTROL-001"),
  });
  assert.match(unavailable.conciseReason, /certificate was stale/);
  assert.match(unavailable.conciseReason, /could not be obtained/);
  source.target[0].controller = [];
  const missing = buildRuleDiagnostic({
    report: source,
    entry: statusRule("DENDRITE-CONTROL-001", "Fail"),
    requirement: ruleDescription("DENDRITE-CONTROL-001"),
  });
  assert.match(missing.conciseReason, /did not report a controller canister/);
});

test("proposal-based dissolution diagnostics state the security consequence", () => {
  const source = report();
  for (const [value, status, phrase] of [
    [false, "Pass", "disabled because not_for_profit is false"],
    [true, "Fail", "could vote to start dissolving the neuron"],
    [undefined, "Indeterminate", "proposal-based dissolution could not be assessed"],
  ]) {
    source.target[0].not_for_profit = value === undefined ? [] : [value];
    const diagnostic = buildRuleDiagnostic({
      report: source,
      entry: statusRule("DENDRITE-CONTROL-005", status),
      requirement: ruleDescription("DENDRITE-CONTROL-005"),
    });
    assert.match(diagnostic.conciseReason, new RegExp(phrase));
    assert.equal(diagnostic.expectedItems[0], "not_for_profit = false");
  }
});

test("every parity failure produces a factual diagnostic with safe structured fallback", () => {
  let failures = 0;
  for (const fixture of parityFixtures) {
    const source = reviveProjection(fixture.projection);
    for (const aggregate of aggregateRules(source.rules)) {
      for (const entry of aggregate.entries.filter((item) => Object.keys(item.status)[0] === "Fail")) {
        const diagnostic = buildRuleDiagnostic({
          report: source,
          aggregate,
          entry,
          requirement: ruleDescription(entry.rule_id),
        });
        failures += 1;
        assert.ok(diagnostic.conciseReason.trim(), `${fixture.name} ${entry.rule_id}`);
        assert.notEqual(diagnostic.conciseReason, diagnostic.requirement, `${fixture.name} ${entry.rule_id}`);
        assert.equal(diagnostic.technicalRuleId, entry.rule_id);
        assert.doesNotMatch(diagnostic.conciseReason, /^Unknown$/i);
        if (entry.observed.length || entry.expected.length) {
          assert(diagnostic.observedItems.length || diagnostic.expectedItems.length,
            `${fixture.name} ${entry.rule_id} dropped structured evidence`);
        }
      }
    }
  }
  assert(failures > 20, "focused parity failures were not exercised");
});

test("mixed aggregates expose precedence, safe future IDs, and direct status terminology", () => {
  const preliminary = aggregateRules([
    statusRule("DENDRITE-CONTROL-001", "Pass"),
    statusRule("DENDRITE-CONTROL-001", "Indeterminate"),
  ])[0];
  assert.match(aggregateSummary(preliminary, "Preliminary"), /^Indeterminate/);
  const future = aggregateRules([
    statusRule("FUTURE-RULE-901", "Pass", { relevant_topic: [4] }),
    statusRule("FUTURE-RULE-901", "StandardUpdateRequired", { relevant_topic: [99] }),
  ])[0];
  assert.equal(Object.keys(future.status)[0], "StandardUpdateRequired");
  assert.equal(future.title, "Technical check: FUTURE-RULE-901");
  assert.match(aggregateSummary(future, "Consensus"), /^Standard update required/);
});

test("rule table has labelled columns, quiet chevrons, and no nested detail disclosure", async () => {
  let copied;
  const root = render("Consensus", { copyText: (value) => { copied = value; } });
  const toggle = byAttribute(root, "aria-label", "Show details for Neuron is registered as a known neuron")[0];
  assert.equal(toggle.tag, "button");
  assert.equal(toggle.type, "button");
  assert.equal(toggle.attributes["aria-expanded"], "false");
  const detail = walk(root, (node) => node.id === toggle.attributes["aria-controls"])[0];
  assert.equal(detail.hidden, true);
  assert.equal(walk(root, (node) => node.tag === "table" && node.className === "rule-table").length, 7);
  for (const heading of ["Rule", "Result"]) assert.ok(byText(root, heading).length);
  assert.ok(byAttribute(root, "aria-label", "Details").length);
  assert.equal(byText(root, "+").length + byText(root, "−").length, 0);
  assert.ok(walk(toggle, (node) => node.className === "chevron").length);
  toggle.click();
  assert.equal(toggle.attributes["aria-expanded"], "true");
  assert.equal(detail.hidden, false);
  assert.equal(walk(detail, (node) => node.tag === "details").length, 0);
  assert.equal(byAttribute(detail, "role", "region").length, 0);
  assert.ok(byText(detail, "missing metadata").length);
  assert.ok(byText(detail, "valid known_neuron_data").length);
  assert.ok(byText(detail, "4 — Governance").length);
  const link = byAttribute(detail, "aria-label", "Open Dendrite report for neuron 18422777432977120264")[0];
  assert.equal(link.href, "#/neuron/18422777432977120264");
  await byAttribute(detail, "aria-label", "Copy neuron ID: 18422777432977120264")[0].click();
  assert.equal(copied, "18422777432977120264");
  toggle.click();
  assert.equal(toggle.attributes["aria-expanded"], "false");
});

test("complete summary row toggles except for controls and text selection", () => {
  const root = render();
  const toggle = byAttribute(root, "aria-label", "Show details for Neuron is registered as a known neuron")[0];
  const row = walk(root, (node) => node.attributes?.["data-rule-id"] === "DENDRITE-KNOWN-002")[0];
  const nestedCopy = byAttribute(row.parentNode, "aria-label", "Copy neuron ID: 18422777432977120264")[0];
  row.dispatch("click", { target: nestedCopy });
  assert.equal(toggle.attributes["aria-expanded"], "false");
  const priorSelection = globalThis.getSelection;
  globalThis.getSelection = () => ({ toString: () => "selected text" });
  row.dispatch("click", { target: row });
  assert.equal(toggle.attributes["aria-expanded"], "false");
  globalThis.getSelection = () => ({ toString: () => "" });
  row.dispatch("click", { target: row });
  assert.equal(toggle.attributes["aria-expanded"], "true");
  assert.equal(toggle.focused, true);
  row.dispatch("click", { target: row });
  assert.equal(toggle.attributes["aria-expanded"], "false");
  globalThis.getSelection = priorSelection;
});

test("single-select status filters change only transient presentation state", () => {
  const source = report();
  const snapshot = JSON.stringify(source, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  const prior = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  const root = new FakeNode("main");
  try { renderReport(root, { report: source, verificationKind: "Consensus" }); } finally { globalThis.document = prior; }
  const rows = walk(root, (node) => node.className?.includes?.("rule-summary-row"));
  const filters = walk(root, (node) => node.className?.split?.(" ").includes("rule-filter"));
  assert.equal(filters.length, 6);
  const all = filters.find((node) => node.className.includes("rule-filter-all"));
  const pass = filters.find((node) => node.className.includes("rule-filter-pass"));
  const fail = filters.find((node) => node.className.includes("rule-filter-fail"));
  assert.equal(all.attributes["aria-pressed"], "true");
  assert.equal(pass.attributes["aria-pressed"], "false");
  assert.equal(fail.attributes["aria-pressed"], "false");
  const passRow = rows.find((row) => row.attributes["data-rule-id"] === "DENDRITE-LOCK-001");
  const passToggle = walk(passRow, (node) => node.className === "button-disclosure rule-toggle")[0];
  passToggle.click();
  assert.equal(passToggle.attributes["aria-expanded"], "true");
  fail.click();
  assert.equal(fail.attributes["aria-pressed"], "true");
  assert.equal(all.attributes["aria-pressed"], "false");
  assert.equal(rows.filter((row) => !row.hidden).length, 1);
  assert.equal(passToggle.attributes["aria-expanded"], "false");
  const groups = walk(root, (node) => node.className === "rule-group");
  const knownGroup = groups.find((group) => byText(group, "Neuron identity and commitments").length);
  assert.equal(knownGroup.hidden, false);
  assert.equal(walk(knownGroup, (node) => node.className === "rule-group-toggle")[0].attributes["aria-expanded"], "false");
  assert.equal(groups.find((group) => byText(group, "Manager group").length).hidden, true);
  assert.equal(byText(knownGroup, "1 pass").length, 0);
  assert.ok(byText(knownGroup, "1 fail").length);
  fail.click();
  assert.equal(all.attributes["aria-pressed"], "true");
  assert.equal(rows.filter((row) => !row.hidden).length, rules.length);
  assert.ok(groups.every((group) => !group.hidden));
  pass.click();
  assert.equal(rows.filter((row) => !row.hidden).length, 4);
  assert.ok(byText(knownGroup, "1 pass").length);
  assert.equal(byText(knownGroup, "1 fail").length, 0);
  all.click();
  assert.equal(rows.filter((row) => !row.hidden).length, rules.length);
  assert.equal(JSON.stringify(source, (_key, value) => typeof value === "bigint" ? value.toString() : value), snapshot);
});

test("all direct rule groups start collapsed and closing clears child expansion", () => {
  const root = render();
  const groups = walk(root, (node) => node.className === "rule-group");
  assert.equal(groups.length, 7);
  for (const group of groups) {
    const toggle = walk(group, (node) => node.className === "rule-group-toggle")[0];
    assert.equal(toggle.attributes["aria-expanded"], "false");
    assert.equal(walk(toggle, (node) => node !== toggle && node.tag === "button").length, 0);
  }
  const target = groups.find((group) => byText(group, "Neuron identity and commitments").length);
  const groupToggle = walk(target, (node) => node.className === "rule-group-toggle")[0];
  assert.match(groupToggle.attributes["aria-label"], /1 pass, 1 fail/);
  assert.ok(byText(target, "1 pass").length);
  assert.ok(byText(target, "1 fail").length);
  groupToggle.click();
  const child = byAttribute(target, "aria-label", "Show details for Neuron is registered as a known neuron")[0];
  child.click();
  assert.equal(child.attributes["aria-expanded"], "true");
  groupToggle.click();
  assert.equal(groupToggle.attributes["aria-expanded"], "false");
  assert.equal(child.attributes["aria-expanded"], "false");
  groupToggle.click();
  assert.equal(child.attributes["aria-expanded"], "false");
  assert.equal(byText(root, "Expand all").length + byText(root, "Collapse all").length, 0);
});

test("controller uncertainty is directly undetermined and never pass or fail", () => {
  const root = render("Preliminary");
  const row = walk(root, (node) => node.attributes?.["data-rule-id"] === "DENDRITE-CONTROL-001")[0];
  assert.ok(byText(row, "Indeterminate").length);
  assert.equal(byText(row, "Pass").length, 0);
  assert.equal(byText(row, "Fail").length, 0);
  assert.equal(byText(root, "A fresh transaction preflight is required before management actions.").length, 0);
});

test("source failures remain available from the copy-only raw report", async () => {
  const prior = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  try {
    const root = new FakeNode("main");
    let copied;
    renderReport(root, {
      report: report(),
      verificationKind: "Preliminary",
      provenance: {
        controllerEvidence: {
          kind: "certified-system-state",
          canisterId: "aaaaa-aa",
          certificateTime: "2026-07-29T00:00:00.000Z",
        },
      },
    }, { copyText: async (value) => { copied = value; } });
    assert.equal(byText(root, "Technical evidence").length, 0);
    for (const removed of [
      "Verification metadata", "Raw target evidence", "Controller blackhole evidence",
      "Complete rule table", "Source failures",
    ]) assert.equal(byText(root, removed).length, 0);
    assert.equal(walk(root, (node) => node.className === "raw-report-json").length, 0);
    await byAttribute(root, "aria-label", "Copy raw report")[0].click();
    assert.match(copied, /"source_failures"/);
    assert.match(copied, /"unavailable"/);
  } finally {
    globalThis.document = prior;
  }
});

test("report header has direct verdicts, no actions, and the final section hierarchy", async () => {
  const preliminary = render("Preliminary", {
    onRefreshPreliminary() {},
    onVerifyConsensus() {},
  });
  assert.equal(byText(preliminary, "Verify on-chain").length, 0);
  assert.equal(byText(preliminary, "Refresh live analysis").length, 0);
  assert.equal(walk(preliminary, (node) => node.className === "section-navigation").length, 0);
  const root = render();
  const sectionIds = walk(root, (node) => ["overview", "rules", "characteristics", "managers", "delegation", "raw-report"].includes(node.id))
    .map((node) => node.id);
  assert.deepEqual(sectionIds, ["rules", "managers", "delegation"]);
  assert.ok(byText(root, "Standard Rules").length);
  assert.ok(byText(root, "Topic Delegation").length);
  assert.equal(byText(root, "Neuron characteristics").length, 0);
  assert.equal(walk(root, (node) => node.className?.includes?.("header-metrics"))[0].children.length, 5);
  const sectionToggle = walk(root, (node) =>
    node.className === "section-title" && node.textContent === "Team Members")[0].parentNode;
  assert.equal(sectionToggle.attributes["aria-expanded"], "false");
  sectionToggle.click();
  assert.equal(sectionToggle.attributes["aria-expanded"], "true");
  let copied;
  const copyRoot = render("Preliminary", { copyText: async (value) => { copied = value; } });
  const copy = byAttribute(copyRoot, "aria-label", "Copy raw report")[0];
  await copy.click();
  assert.match(copied, /"standard_version"/);
  assert.equal(walk(copyRoot, (node) => node.className === "raw-report-json").length, 0);

  const empty = report();
  empty.managers = [];
  empty.committed_topics = [];
  empty.non_committed_topics = [];
  const prior = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  const emptyRoot = new FakeNode("main");
  try { renderReport(emptyRoot, empty); } finally { globalThis.document = prior; }
  assert.ok(byText(emptyRoot, "No team members are listed.").length);
  assert.ok(byText(emptyRoot, "No topic configurations are listed.").length);
});

test("all overall statuses use known-neuron names and semantic colour classes", () => {
  const cases = [
    ["Compliant", "Compliant", "status-pass"],
    ["NonCompliant", "Not Compliant", "status-fail"],
    ["Indeterminate", "Indeterminate", "status-indeterminate"],
    ["StandardUpdateRequired", "Standard Update Required", "status-standardupdaterequired"],
  ];
  const prior = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  try {
    for (const [status, wording, className] of cases) {
      const source = report();
      source.overall_status = { [status]: null };
      const root = new FakeNode("main");
      renderReport(root, { report: source, verificationKind: "Preliminary" });
      assert.ok(byText(root, wording).length, status);
      const verdict = walk(root, (node) => node.className?.includes?.("header-verdict"))[0];
      assert.ok(verdict.className.includes(className), status);
    }
  } finally {
    globalThis.document = prior;
  }
});

test("manager status and topic alert columns are absent", () => {
  const sourceWithNames = report();
  sourceWithNames.managers[0].known_neuron = [{ name: "Known manager nine", links: [] }];
  sourceWithNames.committed_topics[0].delegate_ids = [9n, 10n];
  sourceWithNames.non_committed_topics.push({ topic: 18, followee_ids: [2947465672511369n] });
  sourceWithNames.rules = sourceWithNames.rules.map((rule) => rule.rule_id === "DENDRITE-KNOWN-002"
    ? { ...rule, related_neuron_ids: [9n], message: "neuron 9 is not an eligible manager" }
    : rule);
  const prior = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  const root = new FakeNode("main");
  try { renderReport(root, sourceWithNames); } finally { globalThis.document = prior; }
  const managers = walk(root, (node) => node.id === "managers")[0];
  assert.ok(byText(managers, "1 team member · 1 unavailable").length);
  assert.equal(byText(managers, "Status").length, 0);
  const managerRows = walk(managers, (node) => node.tag === "tr");
  assert.ok(managerRows.every((row) => row.children.length === 3));
  assert.equal(byText(managers, "Readiness").length, 0);
  const memberLink = walk(managers, (node) => node.tag === "a" && node.className === "row-primary")[0];
  assert.equal(memberLink.textContent, "Known manager nine");
  assert.equal(byText(managers, "Dashboard").length, 0);
  const delegation = walk(root, (node) => node.id === "delegation")[0];
  assert.ok(byText(delegation, "2 configurations · 3 topics · 1 issue").length);
  assert.equal(byText(delegation, "Alerts").length, 0);
  assert.equal(byAttribute(delegation, "aria-label", "Warnings").length, 0);
  const delegationRows = walk(delegation, (node) => node.tag === "tr");
  assert.ok(delegationRows.every((row) => row.children.length === 2));
  assert.equal(walk(delegation, (node) => node.className === "delegation-value").length, 3);
  assert.ok(walk(delegation, (node) => node.className?.includes?.("topic-list"))
    .some((node) => node.textContent.includes("\n")));
  const source = report();
  source.rules = source.rules.map((rule) => ({ ...rule, status: { Pass: null } }));
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  const passing = new FakeNode("main");
  try { renderReport(passing, source); } finally { globalThis.document = prior; }
  const passingDelegation = walk(passing, (node) => node.id === "delegation")[0];
  assert.equal(byText(passingDelegation, "No alerts").length, 0);
  assert.equal(walk(passingDelegation, (node) => node.className === "topic-warning").length, 0);
  assert.equal(byText(passingDelegation, "Pass").length, 0);
});

test("topic delegation uses retrieved known names and explains CatchAll inheritance", () => {
  const source = report();
  const omegaVote = 18363645821499695760n;
  source.non_committed_topics = [
    { topic: 0, followee_ids: [omegaVote] },
    { topic: 2, followee_ids: [] },
  ];
  const prior = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  const root = new FakeNode("main");
  try {
    renderReport(root, {
      report: source,
      verificationKind: "Preliminary",
      provenance: { knownNeuronNames: [[omegaVote.toString(), "Ωmega-vote"]] },
    });
  } finally { globalThis.document = prior; }
  assert.ok(byText(root, "Ωmega-vote").length);
  assert.ok(walk(root, (node) => node.textContent?.includes?.("2 — Exchange Rate (inherited from CatchAll)")).length);
  assert.equal(byText(root, omegaVote.toString()).length, 0);
});
