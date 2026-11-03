import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(".");
const productionId = "hp4av-oiaaa-aaaar-qcaha-cai";
const productionOrigin = `https://${productionId}.icp0.io`;
const productionEnvironment = {
  DENDRITE_CANISTER_ID: productionId,
  DENDRITE_DERIVATION_ORIGIN: productionOrigin,
  DENDRITE_ALTERNATIVE_ORIGINS_JSON: '{"alternativeOrigins":[]}',
  DENDRITE_API_HOST: "https://icp-api.io",
  DENDRITE_IDENTITY_PROVIDER: "https://id.ai/authorize",
  DENDRITE_FETCH_ROOT_KEY: "false",
  SOURCE_DATE_EPOCH: "0",
};

const run = (command, args = [], options = {}) =>
  spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });

test("canonical release inputs are mandatory and exact", () => {
  for (const missing of Object.keys(productionEnvironment).filter((key) => key !== "DENDRITE_FETCH_ROOT_KEY")) {
    const environment = { ...process.env, ...productionEnvironment };
    delete environment[missing];
    const result = run("tools/scripts/docker-build-release.sh", [], { env: environment });
    assert.notEqual(result.status, 0, missing);
  }
  const wrong = run("tools/scripts/docker-build-release.sh", [], {
    env: { ...process.env, ...productionEnvironment, DENDRITE_CANISTER_ID: "aaaaa-aa" },
  });
  assert.notEqual(wrong.status, 0);
});

test("production mapping, cache exclusion, manifest, and release sums are strict", () => {
  assert.equal(JSON.parse(readFileSync(".icp/data/mappings/ic.ids.json")).dendrite, productionId);
  assert.match(readFileSync(".gitignore", "utf8"), /^\/\.icp\/cache\/$/m);
  const yaml = readFileSync("icp.yaml", "utf8");
  assert.match(yaml, /type: "@dfinity\/prebuilt@v2\.0\.0"/);
  assert.match(yaml, /path: dist\/release\/dendrite\.wasm/);
  assert.match(yaml, /sha256: 74f6090a729fa467908985c8ef8adc415e237fdf2e6eda8fa7d6a68a0aade972/);
  assert.doesNotMatch(yaml, /\b(reinstall|build:|source:)\b/);
});

test("navbar SVG and document icon handling are CSP-safe in real browsers", () => {
  const app = readFileSync("canisters/dendrite/web/src/app.js", "utf8");
  const template = readFileSync("canisters/dendrite/web/index.template.html", "utf8");
  assert.match(app, /svg\.setAttribute\("class", "brand-icon"\)/);
  assert.doesNotMatch(app, /svg\.className\s*=/);
  assert.match(app, /icon\.setAttribute\("class", "brand-icon loading-spinner"\)/);
  assert.match(readFileSync("canisters/dendrite/web/src/styles.css", "utf8"), /@keyframes dendrite-spin/);
  assert.doesNotMatch(template, /data:/);
});

test("browser qualification derives the reviewed Dendrite ID from the production mapping", () => {
  const qualification = readFileSync("tools/scripts/browser-qualification.mjs", "utf8");
  assert.match(qualification, /readFileSync\("\.icp\/data\/mappings\/ic\.ids\.json"/);
  assert.match(qualification, /productionMapping\.dendrite/);
  assert.match(qualification, new RegExp(productionId));
  assert.doesNotMatch(qualification, /k7w4r-zaaaa-aaaao-qkb2a-cai/);
});

test("repository contains no dfx project configuration", () => {
  for (const path of ["dfx.json", "canister_ids.json", ".dfx"]) {
    assert.equal(existsSync(path), false, `${path} must not exist`);
  }
  assert.equal(existsSync("tools/scripts/deploy-local.sh"), false);
});

test("production frontend manifest names existing generated assets", () => {
  const manifest = JSON.parse(readFileSync("canisters/dendrite/public/asset-manifest.json"));
  for (const path of Object.values(manifest)) {
    assert.ok(existsSync(join("canisters/dendrite/public", path)));
  }
});

test("removed public report actions and modes are absent from source and production assets", () => {
  const forbidden = /Refresh live analysis|Verify on-chain|Consensus verified|Consensus unavailable|Verification stale|Live analysis|Attention only|Technical evidence|Check again|Rerun current Dendrite report|report-action-toolbar|report-actions|nns-dendrite\/1\.0-draft|DENDRITE-DATA-00[123]|DENDRITE-NM-005|Voting anchors|voting anchors|Data completeness|Locked and active posture|Controller and target settings|Neuron Management managers|Non-committed following|Not-for-profit is disabled/;
  const sources = readdirSync("canisters/dendrite/web/src", { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => join("canisters/dendrite/web/src", entry.name));
  const manifest = JSON.parse(readFileSync("canisters/dendrite/public/asset-manifest.json"));
  const assets = [
    join("canisters/dendrite/public", manifest["app.js"]),
    join("canisters/dendrite/public", manifest["styles.css"]),
  ];
  for (const file of [...sources, ...assets]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, forbidden, file);
  }
  assert.match(readFileSync(assets[0], "utf8"), /nns-dendrite\/1\.1-draft/);
});

test("frontend documentation URLs resolve to retained documents", () => {
  const source = readFileSync("canisters/dendrite/web/src/app.js", "utf8");
  const manifest = JSON.parse(readFileSync("canisters/dendrite/public/asset-manifest.json"));
  const bundle = readFileSync(join("canisters/dendrite/public", manifest["app.js"]), "utf8");
  const retained = new Set([
    "docs/architecture.md",
    "docs/development/implementation-plan.md",
    "docs/development/testing.md",
    "docs/operations/deployment.md",
    "docs/operations/operator-gates.md",
    "docs/operations/production-record.md",
    "docs/operations/reproducible-builds.md",
    "docs/security.md",
    "docs/standard/NNS_DENDRITE_STANDARD.md",
    "docs/standard/SOURCE_BASELINE.md",
  ]);
  const required = [
    "docs/operations/reproducible-builds.md",
    "docs/security.md",
  ];
  const deleted = [
    "docs/development/reproducible-builds.md",
    "docs/security/threat-model.md",
  ];
  for (const path of required) {
    assert.match(source, new RegExp(path.replaceAll("/", "\\/")));
    assert.match(bundle, new RegExp(path.replaceAll("/", "\\/")));
  }
  for (const path of deleted) {
    assert.doesNotMatch(source, new RegExp(path.replaceAll("/", "\\/")));
    assert.doesNotMatch(bundle, new RegExp(path.replaceAll("/", "\\/")));
  }
  const repositoryDocumentationUrl =
    /https:\/\/github\.com\/aodl\/NNS_Dendrite_Standard\/blob\/main\/([^"'`)\s]+\.md)/g;
  const paths = [...source.matchAll(repositoryDocumentationUrl)].map((match) => match[1]);
  assert.ok(paths.length > 0);
  for (const path of paths) {
    assert.ok(retained.has(path), `frontend documentation URL is not retained: ${path}`);
    assert.ok(existsSync(path), `frontend documentation URL does not resolve: ${path}`);
  }
});

test("guard rejects unsafe modes, confirmation, IDs, dirty state, and artifacts", () => {
  const base = {
    ...process.env,
    ...productionEnvironment,
    DENDRITE_CONFIRM_MAINNET: productionId,
  };
  for (const mode of ["reinstall", "unknown"]) {
    assert.notEqual(run("tools/scripts/mainnet-deploy.sh", [mode], { env: base }).status, 0);
  }
  assert.notEqual(run("tools/scripts/mainnet-deploy.sh", ["dry-run"], {
    env: { ...base, DENDRITE_CONFIRM_MAINNET: "aaaaa-aa" },
  }).status, 0);
  assert.notEqual(run("tools/scripts/mainnet-deploy.sh", ["dry-run"], {
    env: { ...base, DENDRITE_CANISTER_ID: "aaaaa-aa" },
  }).status, 0);
  const dirty = join(root, ".release-tooling-dirty");
  writeFileSync(dirty, "test");
  try {
    assert.match(run("tools/scripts/mainnet-deploy.sh", ["dry-run"], { env: base }).stderr, /dirty Git worktree/);
  } finally {
    rmSync(dirty);
  }
});

test("release verifier rejects missing, corrupted, and manifest-mismatched Wasm", () => {
  const fixture = mkdtempSync(join(tmpdir(), "dendrite-artifact-"));
  try {
    mkdirSync(join(fixture, "tools/scripts"), { recursive: true });
    mkdirSync(join(fixture, "dist/release"), { recursive: true });
    cpSync(join(root, "tools/scripts/verify-release-artifacts.sh"), join(fixture, "tools/scripts/verify-release-artifacts.sh"));
    writeFileSync(join(fixture, "Cargo.lock"), "");
    const writeValid = () => {
      const wasm = Buffer.from("release-artifact");
      const hash = createHash("sha256").update(wasm).digest("hex");
      writeFileSync(join(fixture, "dist/release/dendrite.wasm"), wasm);
      writeFileSync(join(fixture, "dist/release/SHA256SUMS"), `${hash}  dendrite.wasm\n`);
      writeFileSync(join(fixture, "icp.yaml"), `canisters:\n  - name: dendrite\n    recipe:\n      type: "@dfinity/prebuilt@v2.0.0"\n      configuration:\n        path: dist/release/dendrite.wasm\n        sha256: ${hash}\n`);
    };
    const verify = () => spawnSync("tools/scripts/verify-release-artifacts.sh", [], { cwd: fixture });
    writeValid();
    assert.equal(verify().status, 0);
    rmSync(join(fixture, "dist/release/dendrite.wasm"));
    assert.notEqual(verify().status, 0);
    writeValid();
    writeFileSync(join(fixture, "dist/release/dendrite.wasm"), "corrupt");
    assert.notEqual(verify().status, 0);
    writeValid();
    writeFileSync(join(fixture, "icp.yaml"), readFileSync(join(fixture, "icp.yaml"), "utf8").replace(/[0-9a-f]{64}\n$/, `${"0".repeat(64)}\n`));
    assert.notEqual(verify().status, 0);
    writeValid();
    writeFileSync(join(fixture, "dist/release/SHA256SUMS"), `${hashFor("release-artifact")}  /dendrite.wasm\n`);
    assert.notEqual(verify().status, 0);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

const hashFor = (value) => createHash("sha256").update(value).digest("hex");

test("release checksum verification runs inside the release directory", () => {
  const fixture = mkdtempSync(join(tmpdir(), "dendrite-checksum-cwd-"));
  try {
    mkdirSync(join(fixture, "tools/scripts"), { recursive: true });
    mkdirSync(join(fixture, "dist/release"), { recursive: true });
    mkdirSync(join(fixture, "bin"), { recursive: true });
    cpSync(join(root, "tools/scripts/verify-release-artifacts.sh"), join(fixture, "tools/scripts/verify-release-artifacts.sh"));
    writeFileSync(join(fixture, "Cargo.lock"), "");
    const wasm = Buffer.from("release-artifact");
    const hash = hashFor(wasm);
    writeFileSync(join(fixture, "dist/release/dendrite.wasm"), wasm);
    writeFileSync(join(fixture, "dist/release/SHA256SUMS"), `${hash}  dendrite.wasm\n`);
    writeFileSync(join(fixture, "icp.yaml"), `canisters:\n  - name: dendrite\n    recipe:\n      type: "@dfinity/prebuilt@v2.0.0"\n      configuration:\n        path: dist/release/dendrite.wasm\n        sha256: ${hash}\n`);
    writeFileSync(join(fixture, "bin/sha256sum"), `#!/bin/sh
printf '%s\n' "$PWD" >> "$CHECKSUM_CWD_LOG"
exec /usr/bin/sha256sum "$@"
`);
    chmodSync(join(fixture, "bin/sha256sum"), 0o755);
    const cwdLog = join(fixture, "cwd.log");
    const result = spawnSync("tools/scripts/verify-release-artifacts.sh", [], {
      cwd: fixture,
      encoding: "utf8",
      env: { ...process.env, CHECKSUM_CWD_LOG: cwdLog, PATH: `${join(fixture, "bin")}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(cwdLog, "utf8"), new RegExp(`${fixture}/dist/release`));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("guarded dry-run reaches no lifecycle write", () => {
  const fixture = mkdtempSync(join(tmpdir(), "dendrite-release-"));
  try {
    mkdirSync(join(fixture, "tools/scripts"), { recursive: true });
    mkdirSync(join(fixture, ".icp/data/mappings"), { recursive: true });
    mkdirSync(join(fixture, "dist/release"), { recursive: true });
    mkdirSync(join(fixture, "bin"), { recursive: true });
    for (const script of ["mainnet-deploy.sh", "verify-release-artifacts.sh"]) {
      cpSync(join(root, "tools/scripts", script), join(fixture, "tools/scripts", script));
    }
    writeFileSync(join(fixture, "Cargo.lock"), "");
    writeFileSync(join(fixture, ".icp/data/mappings/ic.ids.json"), `{"dendrite":"${productionId}"}\n`);
    const wasm = Buffer.from("canonical-test-wasm");
    const hash = createHash("sha256").update(wasm).digest("hex");
    writeFileSync(join(fixture, "dist/release/dendrite.wasm"), wasm);
    writeFileSync(join(fixture, "dist/release/SHA256SUMS"), `${hash}  dendrite.wasm\n`);
    writeFileSync(join(fixture, "icp.yaml"), `canisters:\n  - name: dendrite\n    recipe:\n      type: "@dfinity/prebuilt@v2.0.0"\n      configuration:\n        path: dist/release/dendrite.wasm\n        sha256: ${hash}\n`);
    writeFileSync(
      join(fixture, "tools/scripts/mainnet-deploy.sh"),
      readFileSync(join(fixture, "tools/scripts/mainnet-deploy.sh"), "utf8")
        .replace(/canonical_wasm_hash=[0-9a-f]{64}/, `canonical_wasm_hash=${hash}`),
    );
    const log = join(fixture, "icp.log");
    writeFileSync(join(fixture, "bin/icp"), `#!/bin/sh
printf '%s\\n' "$*" >> "$ICP_TEST_LOG"
case "$*" in
  "--version") printf '%s\\n' "$ICP_VERSION_OUTPUT" ;;
  "identity default") echo "release-operator" ;;
  "identity principal") echo "aaaaa-aa" ;;
  "canister status dendrite -e ic --id-only") echo "${productionId}" ;;
  "canister status dendrite -e ic --json") echo '{"module_hash":null}' ;;
  "canister settings show dendrite -e ic") echo 'Caller is not a controller' >&2; exit 2 ;;
  *) exit 91 ;;
esac
`);
    chmodSync(join(fixture, "bin/icp"), 0o755);
    run("git", ["init", "-q"], { cwd: fixture });
    run("git", ["config", "user.email", "test@example.invalid"], { cwd: fixture });
    run("git", ["config", "user.name", "Release Test"], { cwd: fixture });
    run("git", ["add", "."], { cwd: fixture });
    run("git", ["commit", "-qm", "fixture"], { cwd: fixture });
    const environment = {
      ...process.env,
      ...productionEnvironment,
      DENDRITE_CONFIRM_MAINNET: productionId,
      ICP_TEST_LOG: log,
      ICP_VERSION_OUTPUT: "icp 1.2.0",
      PATH: `${join(fixture, "bin")}:${process.env.PATH}`,
    };
    for (const versionOutput of ["icp 0.2.6", "icp 1.1.0", "icp 1.2.1", "unexpected version output"]) {
      const rejected = spawnSync("tools/scripts/mainnet-deploy.sh", ["dry-run"], {
        cwd: fixture,
        encoding: "utf8",
        env: { ...environment, ICP_VERSION_OUTPUT: versionOutput },
      });
      assert.notEqual(rejected.status, 0, versionOutput);
      assert.match(rejected.stderr, /icp-cli 1\.2\.0 is required/);
      rmSync(log, { force: true });
    }
    const result = spawnSync("tools/scripts/mainnet-deploy.sh", ["dry-run"], {
      cwd: fixture,
      encoding: "utf8",
      env: environment,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /icp-cli executable: .*\/bin\/icp/);
    assert.match(result.stdout, /icp-cli version: icp 1\.2\.0/);
    assert.match(result.stdout, /dry-run complete; no write performed/);
    assert.match(result.stdout, /Controller-only settings unavailable/);
    assert.doesNotMatch(readFileSync(log, "utf8"), /canister install/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("documentation set is consolidated and links resolve", () => {
  const expected = [
    "README.md",
    "docs/architecture.md",
    "docs/development/implementation-plan.md",
    "docs/development/testing.md",
    "docs/operations/deployment.md",
    "docs/operations/operator-gates.md",
    "docs/operations/production-record.md",
    "docs/operations/reproducible-builds.md",
    "docs/security.md",
    "docs/standard/NNS_DENDRITE_STANDARD.md",
    "docs/standard/SOURCE_BASELINE.md",
  ];
  const markdown = (directory) => readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(entry.parentPath, entry.name));
  const actual = ["README.md", ...markdown("docs")].sort();
  assert.deepEqual(actual, expected.sort());
  const deployment = readFileSync("docs/operations/deployment.md", "utf8");
  assert.match(deployment, new RegExp(productionId));
  assert.match(deployment, new RegExp(productionOrigin.replaceAll(".", "\\.")));
  for (const file of actual) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:\/\//i.test(target)) continue;
      assert.ok(existsSync(resolve(dirname(file), target)), `${file}: ${target}`);
    }
  }
});

test("committed release material contains no secret-like content", () => {
  const files = [
    "README.md", "icp.yaml", ".icp/data/mappings/ic.ids.json",
    ...readdirSync("docs", { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name)),
    ...readdirSync("tools/scripts", { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name !== "security-scan.sh")
      .map((entry) => join("tools/scripts", entry.name)),
  ];
  const forbidden = new RegExp([
    "BEGIN (?:RSA |EC |OPENSSH )?PRIVATE" + " KEY",
    "seed" + " phrase",
    "authentication" + " cookie",
    "recovery" + " phrase",
  ].join("|"), "i");
  for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), forbidden, file);
});
