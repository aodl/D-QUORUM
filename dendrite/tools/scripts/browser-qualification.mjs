import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import puppeteer from "puppeteer-core";

const frontend = process.env.DENDRITE_BROWSER_FRONTEND;
const evidenceDirectory = process.env.DENDRITE_BROWSER_EVIDENCE;
const baseUrl = process.env.DENDRITE_BROWSER_BASE_URL ?? "http://127.0.0.1:4173";
const governanceCanister = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const productionMapping = JSON.parse(readFileSync(".icp/data/mappings/ic.ids.json", "utf8"));
const dendriteCanister = productionMapping.dendrite;
assert.equal(dendriteCanister, "hp4av-oiaaa-aaaar-qcaha-cai",
  "reviewed production mapping drifted");
const neuronId = "2947465672511369";
assert(frontend && evidenceDirectory, "browser frontend and evidence directories are required");
mkdirSync(evidenceDirectory, { recursive: true });

const manifest = JSON.parse(readFileSync(join(frontend, "asset-manifest.json"), "utf8"));
for (const logical of ["app.js", "styles.css"]) {
  const relative = manifest[logical].replace(/^\//, "");
  assert.match(relative, new RegExp(`^generated/${logical.replace(".", "\\.") .replace("js", "[0-9a-f]{16}\\.js").replace("css", "[0-9a-f]{16}\\.css")}$`));
  const content = readFileSync(join(frontend, relative));
  const embedded = basename(relative).split(".")[1];
  assert.equal(createHash("sha256").update(content).digest("hex").slice(0, 16), embedded);
}

const browser = await puppeteer.launch({
  executablePath: process.env.DENDRITE_CHROMIUM_BIN ?? "/home/pptruser/.cache/puppeteer/chrome/linux-144.0.7559.96/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking"],
});
const browserVersion = await browser.version();
const bounded = (values, maximum = 40) => values.slice(0, maximum).map((value) => String(value).slice(0, 500));
const results = [];
try {
  for (const scenario of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "desktop-actual-page-scale-200-percent", width: 1440, height: 1000, pageScaleFactor: 2 },
    { name: "desktop-200-percent-equivalent-reflow", width: 720, height: 500 },
    { name: "mobile", width: 390, height: 844 },
    { name: "narrow-320-css-pixels", width: 320, height: 844 },
  ]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({
      width: scenario.width,
      height: scenario.height,
      deviceScaleFactor: scenario.deviceScaleFactor ?? 1,
    });
    const consoleErrors = [], pageErrors = [], requests = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = request.url();
      if (request.method() === "POST" || /\/api\/v[23]\/canister\//.test(url)) requests.push({
        url,
        method: request.method(),
        authorization: request.headers().authorization ?? null,
        cookie: request.headers().cookie ?? null,
        bodyBytes: request.postData()?.length ?? 0,
      });
    });
    await page.goto(`${baseUrl}/#/neuron/${neuronId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("#overview .status-icon", { timeout: 45_000 });
    if (scenario.pageScaleFactor) {
      const session = await page.createCDPSession();
      await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: scenario.pageScaleFactor });
      await page.waitForFunction((scale) => Math.abs((visualViewport?.scale ?? 1) - scale) < 0.01,
        { timeout: 5_000 }, scenario.pageScaleFactor);
    }
    const text = await page.$eval("main", (node) => node.innerText);
    assert.match(text, /NNS Dendrite Standard/);
    assert.doesNotMatch(text, /Live analysis|Verify on-chain|Refresh live analysis|Consensus verified|Attention only|Technical evidence|on live evidence/);
    const controllerPrincipal = await page.$eval(".raw-report-json", (node) =>
      JSON.parse(node.textContent).target?.[0]?.controller?.[0]);
    assert.match(controllerPrincipal, /^[a-z0-9-]+$/,
      `${scenario.name} omitted the target controller principal`);
    const hierarchy = await page.evaluate(() => ({
      managers: document.querySelector("#managers")?.getBoundingClientRect().top,
      delegation: document.querySelector("#delegation")?.getBoundingClientRect().top,
      rules: document.querySelector("#rules")?.getBoundingClientRect().top,
      characteristics: document.querySelector("#characteristics")?.getBoundingClientRect().top,
      rawReport: document.querySelector("#raw-report")?.getBoundingClientRect().top,
      management: document.querySelector("#management")?.getBoundingClientRect().top,
      ruleCount: document.querySelectorAll(".rule-summary-row").length,
      distinctRuleCount: new Set([...document.querySelectorAll(".rule-summary-row")]
        .map((node) => node.getAttribute("data-rule-id"))).size,
    }));
    assert.equal(hierarchy.ruleCount, hierarchy.distinctRuleCount, "primary rows are not distinct by rule ID");
    assert(hierarchy.ruleCount > 0, "complete rules view is missing");
    assert(hierarchy.managers < hierarchy.delegation
      && hierarchy.delegation < hierarchy.rules
      && hierarchy.rules < hierarchy.characteristics
      && hierarchy.characteristics < hierarchy.rawReport
      && hierarchy.rawReport < hierarchy.management,
      `unexpected section hierarchy: ${JSON.stringify(hierarchy)}`);
    const initialRequestCount = requests.length;
    const routeBeforeNavigation = page.url();
    const presentation = await page.evaluate(() => {
      const disclosure = document.querySelector(".rule-toggle");
      const disclosureStyle = getComputedStyle(disclosure);
      const result = document.querySelector(".rule-result-cell");
      const resultStyle = getComputedStyle(result);
      const passFilter = document.querySelector(".rule-filter-pass");
      const failFilter = document.querySelector(".rule-filter-fail");
      const groupPass = document.querySelector(".rule-group-counts .status-pass");
      const groupFail = document.querySelector(".rule-group-counts .status-fail");
      const verdict = document.querySelector("#overview h2");
      const passProbe = document.createElement("span");
      passProbe.className = "status-pass";
      const failProbe = document.createElement("span");
      failProbe.className = "status-fail";
      const indeterminateProbe = document.createElement("span");
      indeterminateProbe.className = "status-indeterminate";
      const warningProbe = document.createElement("span");
      warningProbe.className = "status-warning";
      document.body.append(passProbe, failProbe, indeterminateProbe, warningProbe);
      const simpleRow = document.querySelector(".rule-summary-row");
      const before = simpleRow.getBoundingClientRect();
      simpleRow.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      const after = simpleRow.getBoundingClientRect();
      return {
        disclosureBackground: disclosureStyle.backgroundColor,
        disclosureBorderWidth: disclosureStyle.borderWidth,
        disclosureBorderColor: disclosureStyle.borderColor,
        hasChevron: Boolean(disclosure.querySelector(".chevron")),
        plusMinusText: [...document.querySelectorAll(".rule-toggle")]
          .some((node) => /^[+-]$/.test(node.textContent.trim())),
        publicActionToolbars: document.querySelectorAll(".report-actions, .report-action-toolbar").length,
        resultAlignment: resultStyle.textAlign,
        passFilterColor: getComputedStyle(passFilter).color,
        failFilterColor: getComputedStyle(failFilter).color,
        groupPassColor: getComputedStyle(groupPass).color,
        groupFailColor: getComputedStyle(groupFail).color,
        verdictColor: getComputedStyle(verdict).color,
        verdictKind: [...document.querySelector("#overview").classList]
          .find((name) => name.startsWith("status-")),
        passTokenColor: getComputedStyle(passProbe).color,
        failTokenColor: getComputedStyle(failProbe).color,
        indeterminateTokenColor: getComputedStyle(indeterminateProbe).color,
        warningTokenColor: getComputedStyle(warningProbe).color,
        hoverShift: Math.max(
          Math.abs(before.x - after.x), Math.abs(before.y - after.y),
          Math.abs(before.width - after.width), Math.abs(before.height - after.height),
        ),
        nestedRuleDisclosures: document.querySelectorAll(".rule-detail-row details").length,
        ruleRegions: document.querySelectorAll(".rule-detail-row [role=region]").length,
        stickyNavigation: document.querySelectorAll(".section-navigation").length,
        filterCount: document.querySelectorAll(".rule-filter").length,
        selectedFilters: document.querySelectorAll('.rule-filter[aria-pressed="true"]').length,
        nestedGroupButtons: document.querySelectorAll(".rule-group-toggle button").length,
      };
    });
    assert.match(presentation.disclosureBackground, /rgba?\(0, 0, 0, 0\)/);
    assert(
      presentation.disclosureBorderWidth === "0px"
        || /rgba?\(0, 0, 0, 0\)/.test(presentation.disclosureBorderColor),
      `resting disclosure border was visible: ${presentation.disclosureBorderWidth} ${presentation.disclosureBorderColor}`,
    );
    assert.equal(presentation.hasChevron, true);
    assert.equal(presentation.plusMinusText, false);
    assert.equal(presentation.publicActionToolbars, 0);
    assert.equal(presentation.passFilterColor, presentation.passTokenColor);
    assert.equal(presentation.failFilterColor, presentation.failTokenColor);
    assert.equal(presentation.groupPassColor, presentation.passTokenColor);
    assert.equal(presentation.groupFailColor, presentation.failTokenColor);
    const expectedVerdictColor = {
      "status-pass": presentation.passTokenColor,
      "status-fail": presentation.failTokenColor,
      "status-indeterminate": presentation.indeterminateTokenColor,
      "status-standardupdaterequired": presentation.warningTokenColor,
    }[presentation.verdictKind];
    assert.equal(presentation.verdictColor, expectedVerdictColor);
    assert.equal(presentation.nestedRuleDisclosures, 0);
    assert.equal(presentation.ruleRegions, 0);
    assert.equal(presentation.stickyNavigation, 0);
    assert(presentation.filterCount >= 3);
    assert.equal(presentation.selectedFilters, 1);
    assert.equal(presentation.nestedGroupButtons, 0);
    assert(presentation.hoverShift <= 0.1, `row hover shifted layout: ${presentation.hoverShift}`);
    if (scenario.width >= 720) assert.equal(presentation.resultAlignment, "right");
    const defaultSelector = '.rule-summary-row[data-rule-id="DENDRITE-DEFAULT-001"]';
    const defaultSummary = await page.$eval(`${defaultSelector} .rule-reason`, (node) => node.textContent);
    assert.match(defaultSummary, /\d+ topic evaluations/);
    await page.$eval(defaultSelector, (node) => {
      const toggle = node.closest(".rule-group")?.querySelector(".rule-group-toggle");
      if (toggle?.getAttribute("aria-expanded") === "false") toggle.click();
    });
    await page.focus(`${defaultSelector} .rule-toggle`);
    await page.keyboard.press("Enter");
    assert.equal(await page.$eval(`${defaultSelector} .rule-toggle`, (node) => node.getAttribute("aria-expanded")), "true");
    const defaultInstances = await page.$$eval(`${defaultSelector} + .rule-detail-row .rule-instance-table tbody tr`,
      (nodes) => nodes.length);
    assert(defaultInstances > 1, "default rule did not expose all topic instances");
    await page.keyboard.press("Space");
    assert.equal(await page.$eval(`${defaultSelector} .rule-toggle`, (node) => node.getAttribute("aria-expanded")), "false");
    const simpleSelector = ".rule-summary-row";
    await page.$eval(simpleSelector, (node) => {
      const toggle = node.closest(".rule-group")?.querySelector(".rule-group-toggle");
      if (toggle?.getAttribute("aria-expanded") === "false") toggle.click();
    });
    await page.click(`${simpleSelector} .rule-name-cell`);
    assert.equal(await page.$eval(`${simpleSelector} .rule-toggle`, (node) => ({
      expanded: node.getAttribute("aria-expanded"),
      focused: document.activeElement === node,
    })).then(({ expanded, focused }) => `${expanded}:${focused}`), "true:true");
    const nestedLink = await page.$(`${simpleSelector} + .rule-detail-row a`);
    if (nestedLink) {
      const beforeNested = await page.$eval(`${simpleSelector} .rule-toggle`, (node) => node.getAttribute("aria-expanded"));
      await nestedLink.evaluate((node) => {
        node.addEventListener("click", (event) => event.preventDefault(), { once: true });
        node.click();
      });
      assert.equal(await page.$eval(`${simpleSelector} .rule-toggle`, (node) => node.getAttribute("aria-expanded")),
        beforeNested, "nested link toggled its rule row");
    }
    const copy = await page.$(".copy-button");
    if (copy) await copy.click();
    const initialGroupCount = await page.$$eval(".rule-group:not([hidden])", (nodes) => nodes.length);
    assert.equal(await page.$eval(".rule-filter-all", (node) => node.getAttribute("aria-pressed")), "true");
    await page.$eval(".rule-filter-pass", (node) => node.click());
    assert.equal(await page.$eval(".rule-filter-pass", (node) => node.getAttribute("aria-pressed")), "true");
    assert(await page.$$eval(".rule-summary-row:not([hidden])", (nodes) => nodes.length) > 0);
    assert.equal(await page.$$eval(".rule-summary-row[hidden], .rule-detail-row[hidden]", (rows) =>
      rows.flatMap((row) => [...row.querySelectorAll("a, button, input, select, textarea")])
        .filter((node) => node.getClientRects().length > 0).length), 0);
    assert.equal(await page.$$eval(".rule-summary-row[hidden] .rule-toggle", (nodes) =>
      nodes.filter((node) => node.getAttribute("aria-expanded") !== "false").length), 0);
    const filteredGroups = await page.$$eval(".rule-group", (nodes) => nodes.map((node) => ({
      heading: node.querySelector("h3")?.textContent,
      hidden: node.hidden,
      visibleRows: node.querySelectorAll(".rule-summary-row:not([hidden])").length,
    })));
    assert(filteredGroups.every((group) => group.hidden || group.visibleRows > 0),
      `an empty filtered group heading remained visible: ${JSON.stringify(filteredGroups)}`);
    await page.$eval(".rule-filter-fail", (node) => node.click());
    assert.equal(await page.$eval(".rule-filter-fail", (node) => node.getAttribute("aria-pressed")), "true");
    await page.$eval(".rule-filter-all", (node) => node.click());
    assert.equal(await page.$eval(".rule-filter-all", (node) => node.getAttribute("aria-pressed")), "true");
    assert.equal(await page.$$eval(".rule-group:not([hidden])", (nodes) => nodes.length), initialGroupCount);
    const preliminaryControllers = await page.$$eval(".rule-summary-row", (nodes) => nodes
      .filter((node) => /Controller canister/.test(node.textContent))
      .map((node) => node.textContent));
    assert(preliminaryControllers.length >= 3);
    for (const controllerText of preliminaryControllers) {
      assert.match(controllerText, /\b(?:Pass|Fail|Indeterminate)\b/);
    }
    const preliminaryControllerPasses = preliminaryControllers
      .filter((controllerText) => /\bPass\b/.test(controllerText)).length;
    for (const id of ["managers", "delegation", "characteristics"]) {
      const selector = `#${id} .section-toggle`;
      await page.focus(selector);
      await page.keyboard.press("Enter");
      const changed = await page.$eval(selector, (node) => node.getAttribute("aria-expanded"));
      assert.match(changed, /^(?:true|false)$/);
    }
    assert.equal(await page.$eval("#raw-report .section-toggle", (node) => node.getAttribute("aria-expanded")), "false");
    await page.focus("#raw-report .section-toggle");
    await page.keyboard.press("Enter");
    assert.equal(await page.$eval("#raw-report .section-toggle", (node) => node.getAttribute("aria-expanded")), "true");
    await page.click('[aria-label="Copy raw report JSON"]');
    assert.equal(await page.$eval("#management .section-toggle", (node) => node.getAttribute("aria-expanded")), "false");
    await page.$eval("#management .section-toggle", (node) => node.click());
    assert.equal(await page.$eval("#management .section-toggle", (node) => node.getAttribute("aria-expanded")), "true");
    await page.$eval("#management .section-toggle", (node) => node.click());
    assert.equal(page.url(), routeBeforeNavigation, "presentation interactions changed the neuron route");
    if (scenario.name === "desktop") {
      await page.evaluate(() => {
        const filter = document.querySelector(".rule-filter-all");
        if (filter?.getAttribute("aria-pressed") !== "true") filter.click();
        for (const toggle of document.querySelectorAll(".rule-toggle[aria-expanded=true]")) toggle.click();
        for (const toggle of document.querySelectorAll(".section-toggle[aria-expanded=true]")) toggle.click();
      });
      for (const [name, setup] of [
        ["header-overall", async () => page.evaluate(() => scrollTo(0, 0))],
        ["all-rules-collapsed", async () => {
          await page.evaluate(() => document.querySelector("#rules").scrollIntoView());
        }],
        ["simple-rule-expanded", async () => {
          await page.click(`${simpleSelector} .rule-toggle`);
          await page.evaluate(() => document.querySelector(".rule-summary-row").scrollIntoView());
        }],
        ["multi-topic-rule-expanded", async () => {
          await page.click(`${defaultSelector} .rule-toggle`);
          await page.evaluate((selector) => document.querySelector(selector).scrollIntoView(), defaultSelector);
        }],
        ["pass-filter", async () => page.$eval(".rule-filter-pass", (node) => node.click())],
        ["fail-filter", async () => page.$eval(".rule-filter-fail", (node) => node.click())],
        ["all-filter", async () => page.$eval(".rule-filter-all", (node) => node.click())],
        ["managers-expanded", async () => {
          await page.$eval("#managers .section-toggle", (node) => {
            if (node.getAttribute("aria-expanded") === "false") node.click();
          });
          await page.evaluate(() => document.querySelector("#managers").scrollIntoView());
        }],
        ["topic-delegation-expanded", async () => {
          await page.$eval("#delegation .section-toggle", (node) => {
            if (node.getAttribute("aria-expanded") === "false") node.click();
          });
          await page.evaluate(() => document.querySelector("#delegation").scrollIntoView());
        }],
        ["characteristics-expanded", async () => {
          await page.$eval("#characteristics .section-toggle", (node) => {
            if (node.getAttribute("aria-expanded") === "false") node.click();
          });
          await page.evaluate(() => document.querySelector("#characteristics").scrollIntoView());
        }],
        ["raw-report-expanded", async () => {
          await page.$eval("#raw-report .section-toggle", (node) => {
            if (node.getAttribute("aria-expanded") === "false") node.click();
          });
          await page.evaluate(() => document.querySelector("#raw-report").scrollIntoView());
        }],
        ["management-collapsed", async () => {
          await page.$eval("#management .section-toggle", (node) => {
            if (node.getAttribute("aria-expanded") === "true") node.click();
          });
          await page.evaluate(() => document.querySelector("#management").scrollIntoView());
        }],
      ]) {
        await setup();
        await page.screenshot({ path: join(evidenceDirectory, `desktop-${name}.png`) });
      }
    }
    assert.equal(requests.length, initialRequestCount,
      "rendering, filtering, expansion, or section navigation triggered a network request");
    const measurements = await page.evaluate(() => ({
      screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight },
      cssViewport: { width: innerWidth, height: innerHeight },
      layoutBoxes: Object.fromEntries(["HTML", "BODY", "MAIN"].map((tag) => {
        const node = document.querySelector(tag.toLowerCase());
        const box = node.getBoundingClientRect();
        return [tag, { left: box.left, right: box.right, width: box.width, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }];
      })),
      devicePixelRatio,
      pageScale: visualViewport?.scale ?? 1,
      visualViewport: visualViewport ? {
        width: visualViewport.width,
        height: visualViewport.height,
        scale: visualViewport.scale,
      } : null,
      overflow: {
        document: document.documentElement.scrollWidth - innerWidth,
        body: document.body.scrollWidth - innerWidth,
      },
      overflowSources: [...document.querySelectorAll("main *")].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.right > document.documentElement.clientWidth + 1 || box.left < -1;
      }).sort((left, right) => left.getBoundingClientRect().right - right.getBoundingClientRect().right)
        .slice(0, 20).map((node) => ({
        tag: node.tagName,
        className: node.className,
        right: node.getBoundingClientRect().right,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      })),
      visibleText: document.querySelector("main")?.innerText.length ?? 0,
      visibleControls: [...document.querySelectorAll("button")].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }).length,
      minimumFrequentTarget: Math.min(...[...document.querySelectorAll(".rule-toggle, .copy-button")]
        .filter((node) => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        }).map((node) => {
          const box = node.getBoundingClientRect();
          return Math.min(box.width, box.height);
        })),
    }));
    const overflow = measurements.overflow;
    assert(overflow.document <= 1 && overflow.body <= 1,
      `${scenario.name} material horizontal overflow: ${JSON.stringify({
        cssViewport: measurements.cssViewport,
        layoutBoxes: measurements.layoutBoxes,
        overflow,
        sources: measurements.overflowSources,
      })}`);
    assert(measurements.visibleText > 0 && measurements.visibleControls > 0, "text or controls are not visible");
    assert(measurements.minimumFrequentTarget >= 44,
      `frequent icon target below 44 CSS pixels: ${measurements.minimumFrequentTarget}`);
    if (scenario.pageScaleFactor) {
      assert(measurements.pageScale >= 1.99 && measurements.pageScale <= 2.01,
        `actual page scale was not 200%: ${measurements.pageScale}`);
    } else {
      assert(measurements.pageScale >= 0.99 && measurements.pageScale <= 1.01,
        `unexpected page scale: ${measurements.pageScale}`);
    }
    const focusEvidence = [];
    const requiredFocus = new Set(["Copy neuron ID"]);
    for (let index = 0; index < 200 && requiredFocus.size; index += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        text: document.activeElement?.textContent?.trim().slice(0, 80),
        name: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.getAttribute("name"),
      }));
      focusEvidence.push(focused);
      for (const required of requiredFocus) {
        if (focused.text === required || focused.name?.startsWith(required)) requiredFocus.delete(required);
      }
    }
    assert.deepEqual([...requiredFocus], []);
    await page.screenshot({ path: join(evidenceDirectory, `${scenario.name}.png`), fullPage: true });
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
    assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
    const interactionRequests = requests.length - initialRequestCount;
    assert.equal(interactionRequests, 0,
      "rendering, filtering, copying, disclosure, or section interaction triggered a request");
    assert.equal(await page.$(".action-refresh"), null);
    assert.equal(await page.$(".action-verify"), null);
    assert.equal(await page.$(".attention-filter"), null);
    assert.equal(await page.$("#evidence"), null);
    results.push({
      ...scenario,
      consoleErrors: bounded(consoleErrors),
      pageErrors: bounded(pageErrors),
      overflow,
      measurements,
      hierarchy,
      presentation,
      defaultSummary,
      defaultInstances,
      interactionRequests,
      focusEvidence: bounded(focusEvidence.map((entry) => JSON.stringify(entry)), 80),
      canisterRequests: requests,
      controllerPrincipal,
      preliminaryControllerPasses,
      screenshot: `${scenario.name}.png`,
    });
    await context.close();

    const scenarioQueries = requests.filter((request) => /\/query$/.test(request.url));
    const scenarioReadStates = requests.filter((request) => /\/read_state$/.test(request.url));
    assert(scenarioQueries.length >= 1, `${scenario.name} made no Governance query`);
    assert(scenarioReadStates.length >= 1,
      `${scenario.name} made no signature-verification read_state request: ${JSON.stringify(requests)}`);
    for (const request of requests) {
      assert.match(request.url, new RegExp(`/api/v3/canister/(?:${governanceCanister}|${controllerPrincipal})/(?:query|read_state)$`));
      assert(!request.url.includes(dendriteCanister), `${scenario.name} contacted Dendrite`);
      assert(!/\/call$/.test(request.url), `${scenario.name} invoked an update endpoint`);
      if (request.url.includes(controllerPrincipal)) {
        assert.match(request.url, /\/read_state$/, `${scenario.name} sent a non-read_state controller request`);
      }
    }
    assert(requests.some((request) => request.url.includes(controllerPrincipal)),
      `${scenario.name} made no certified controller read`);
    assert.equal(requests.length, initialRequestCount,
      `${scenario.name} ordinary interactions triggered a new analysis`);
  }
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const failureRequests = [], failureErrors = [];
  page.on("request", (request) => {
    if (request.method() === "POST" || /\/api\/v[23]\/canister\//.test(request.url())) {
      failureRequests.push(request.url());
    }
  });
  page.on("pageerror", (error) => failureErrors.push(error.message));
  await page.goto(`${baseUrl}/test-failure.html`, { waitUntil: "networkidle0" });
  assert.equal(failureErrors.length, 0, failureErrors.join("\n"));
  assert.match(await page.$eval("#overview", (node) => node.textContent),
    /Neuron 42 is not compliant with the NNS Dendrite Standard/);
  assert.match(await page.$eval(".rule-filter-pass", (node) => node.textContent), /2 pass/);
  assert.match(await page.$eval(".rule-filter-fail", (node) => node.textContent), /2 fail/);
  assert.equal(await page.$eval(".rule-filter-all", (node) => node.getAttribute("aria-pressed")), "true");
  const knownGroup = await page.$('.rule-group-toggle[aria-label^="Neuron identity and commitments"]');
  assert.equal(await knownGroup.evaluate((node) => node.getAttribute("aria-expanded")), "false");
  const controllerGroup = await page.$('.rule-group-toggle[aria-label^="Control and immutability"]');
  assert.equal(await controllerGroup.evaluate((node) => node.getAttribute("aria-expanded")), "false");
  await controllerGroup.click();
  assert.equal(await controllerGroup.evaluate((node) => node.getAttribute("aria-expanded")), "true");
  for (const id of ["DENDRITE-CONTROL-002", "DENDRITE-CONTROL-003"]) {
    const selector = `.rule-summary-row[data-rule-id="${id}"]`;
    assert.match(await page.$eval(`${selector} .rule-reason`, (node) => node.textContent),
      id.endsWith("002") ? /installed Wasm module/ : /retains 1 controller/);
    await page.click(`${selector} .rule-toggle`);
  }
  const controllerLink = await page.$eval(
    '.rule-summary-row[data-rule-id="DENDRITE-CONTROL-002"] + .rule-detail-row a',
    (node) => ({ href: node.href, label: node.getAttribute("aria-label"), title: node.title }),
  );
  assert.equal(controllerLink.href, "https://dashboard.internetcomputer.org/canister/uuc56-gyb");
  assert.match(controllerLink.label, /Open controller canister uuc56-gyb/);
  assert.equal(controllerLink.title, "uuc56-gyb");
  const failureText = await page.$eval("main", (node) => node.innerText);
  assert.match(failureText, /Why it failed/);
  assert.match(failureText, /requirement/i);
  assert.match(failureText, /2vxsx-fae/);
  await page.click('.rule-group-toggle[aria-label^="Control and immutability"]');
  assert.equal(await page.$eval('.rule-summary-row[data-rule-id="DENDRITE-CONTROL-002"] .rule-toggle',
    (node) => node.getAttribute("aria-expanded")), "false");
  assert.equal(failureRequests.length, 0, "failure-fixture disclosures triggered a network request");
  await page.$eval(".rule-filter-fail", (node) => node.click());
  assert.equal(await page.$$eval(".rule-summary-row:not([hidden])", (nodes) => nodes.length), 2);
  await page.$eval(".rule-filter-all", (node) => node.click());
  await page.$eval("#raw-report .section-toggle", (node) => node.click());
  await page.click('[aria-label="Copy raw report JSON"]');
  assert.equal(failureRequests.length, 0, "failure-fixture filters or Raw report triggered a request");
  await page.screenshot({ path: join(evidenceDirectory, "deterministic-controller-failures.png"), fullPage: true });
  await page.goto(`${baseUrl}/test-failure.html?status=compliant`, { waitUntil: "networkidle0" });
  assert.match(await page.$eval("#overview", (node) => node.textContent),
    /Neuron 42 is compliant with the NNS Dendrite Standard/);
  assert.equal(await page.$eval("#overview", (node) => getComputedStyle(node.querySelector("h2")).color),
    await page.$eval(".rule-filter-pass", (node) => getComputedStyle(node).color));
  await page.screenshot({ path: join(evidenceDirectory, "deterministic-compliant-verdict.png"), fullPage: true });
  await context.close();
} finally {
  await browser.close();
}

const capturedRequests = results.flatMap((result) => result.canisterRequests);
const requests = capturedRequests.filter((request) => request.method === "POST" && /\/query$/.test(request.url));
if (requests.length < 2) process.stderr.write(`${JSON.stringify(results, null, 2)}\n`);
assert(requests.length >= 2, "each viewport must perform an ordinary Governance read");
for (const request of capturedRequests) {
  assert(
    new RegExp(`/api/v3/canister/${governanceCanister}/(?:query|read_state)$`).test(request.url)
      || results.some((result) => request.url.includes(`/canister/${result.controllerPrincipal}/read_state`)),
    `unexpected canister request: ${request.url}`,
  );
  assert(!request.url.includes(dendriteCanister));
}
for (const request of requests) {
  assert.equal(request.method, "POST");
  assert.equal(request.authorization, null);
  assert.equal(request.cookie, null);
  assert(request.bodyBytes > 0);
}
assert(!requests.some((request) => /\/call$/.test(request.url)), "ordinary navigation invoked an update endpoint");
assert(!requests.some((request) => request.url.includes(dendriteCanister)), "ordinary navigation contacted Dendrite");

const evidence = {
  result: "PASS",
  engine: browserVersion,
  containerImage: process.env.DENDRITE_BROWSER_IMAGE,
  frontend,
  neuronId,
  assertions: {
    fixedGovernanceDestination: governanceCanister,
    requestEndpoint: "query",
    transportHeadersObservedWithoutAuthorizationOrCookies: true,
    ingressAnonymityProvedByIdentityConstructionUnitTest: true,
    dendriteCheckNeuronCalls: 0,
    unexpectedCanisterDestinations: 0,
    publicReportActionsPresent: false,
    assetManifestContentAddressesVerified: true,
    managersAndDelegationBeforeRules: true,
    characteristicsAndRawReportNearBottom: true,
    managementCollapsedAndIsolated: true,
    keyboardRuleExpansion: true,
    onePrimaryRowPerDistinctRuleId: true,
    multiTopicRuleSummaryAndInstances: true,
    statusCountFiltering: true,
    filteredGroupHeadingsHidden: true,
    semanticStatusColoursComputed: true,
    rawReportCopyAccessible: true,
    certifiedControllerStatusesObserved: true,
    sectionNavigationRouteChanges: 0,
    interactionNetworkRequests: 0,
    deterministicControllerFailureFixture: true,
  },
  scenarios: results,
};
writeFileSync(join(evidenceDirectory, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`browser qualification PASS: ${evidence.engine}; ${results.length} viewports; ${requests.length} anonymous Governance query requests; 0 Dendrite requests\n`);
