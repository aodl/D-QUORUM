import { parseNeuronId, formatNeuronId } from "./ids.js";
import { clear, element, safeHttpsLink } from "./dom.js";
import { createAnonymousActor } from "./actor.js";
import { errorMessage, renderReport } from "./compliance-view.js";
import { checkLive } from "./live-check.js";
import { createBrowserAuthSession } from "./auth.js";
import { renderManagerAuthority } from "./authority.js";
import { createAuthenticatedNnsActor } from "./nns-actor.js";
import { renderControlPanel } from "./control-panel.js";
import { createTransactionPipeline } from "./transaction.js";
import { createAnonymousGovernanceReadActor } from "./governance-read-actor.js";
import { createPreliminaryAnalyzer, STANDARD_VERSION } from "./preliminary-evaluator.js";

function resources() {
  const node = document.createElement("p");
  node.append(
    safeHttpsLink("Standard", "https://github.com/aodl/NNS_Dendrite_Standard/blob/main/docs/standard/NNS_DENDRITE_STANDARD.md"),
    document.createTextNode(" · "),
    safeHttpsLink("Source", "https://github.com/aodl/NNS_Dendrite_Standard"),
    document.createTextNode(" · "),
    safeHttpsLink("Reproducible builds", "https://github.com/aodl/NNS_Dendrite_Standard/blob/main/docs/operations/reproducible-builds.md"),
    document.createTextNode(" · "),
    safeHttpsLink("Security model", "https://github.com/aodl/NNS_Dendrite_Standard/blob/main/docs/security.md"),
  );
  return node;
}

function showError(root, message) {
  const box = element("div", message, "error");
  box.tabIndex = -1;
  root.append(box);
  box.focus();
}

const MAX_AUTHENTICATION_ERROR_LENGTH = 512;
const MAX_RECEIPT_OPERATION_LENGTH = 256;
const MAX_RECEIPT_MESSAGE_LENGTH = 512;
const boundedReceiptField = (value, maximum) => String(value ?? "").slice(0, maximum);

export function boundedAuthenticationError(error, fallback) {
  const message = error instanceof Error ? error.message : fallback;
  return String(message || fallback).slice(0, MAX_AUTHENTICATION_ERROR_LENGTH);
}

export function createApplication({
  root,
  location,
  onHashChange,
  actorFactory = createAnonymousActor,
  governanceActorFactory = createAnonymousGovernanceReadActor,
  preliminaryAnalyzerFactory = (governanceActor) => createPreliminaryAnalyzer({ governanceActor }),
  trustInjectedPreliminaryForTests = false,
  nnsActorFactory = createAuthenticatedNnsActor,
  authSession,
  copyText = (value) => globalThis.navigator.clipboard.writeText(value),
}) {
  let browserAuth;
  try {
    browserAuth = authSession ?? createBrowserAuthSession();
  } catch (error) {
    browserAuth = {
      configuration: { derivationOrigin: "Unavailable" },
      originError: error,
      restore: async () => null,
    };
  }
  let actorPromise;
  let governanceActorPromise;
  let preliminaryAnalyzer;
  let authenticatedPrincipal;
  let authenticatedSession;
  let authenticatedNnsActor;
  let authenticationTransition = "none";
  const permanentAuthenticationError = browserAuth.originError
    ? boundedAuthenticationError(browserAuth.originError, "Internet Identity origin configuration is invalid.")
    : undefined;
  let recoverableAuthenticationError;
  let currentPreliminaryReport;
  let currentPreliminaryProvenance;
  let currentPreliminaryNeuronId;
  let preliminaryLoading = false;
  let preliminaryError;
  let currentView = "unselected";
  let routeGeneration = 0;
  let operationSequence = 0;
  let preliminaryOperation;
  let currentTransactionReceipt;
  let currentTransactionNotices;

  const newOperation = (kind, neuronId, generation) => Object.freeze({
    kind,
    neuronId,
    generation,
    id: ++operationSequence,
  });
  const ownsOperation = (owner, current) => current === owner
    && owner.generation === routeGeneration
    && location.hash === `#/neuron/${owner.neuronId}`;
  function invalidatePreliminaryOperation() {
    preliminaryOperation = undefined;
    preliminaryLoading = false;
    root.removeAttribute("aria-busy");
  }
  function invalidateUnsubmittedWork() {
    transactionPipeline.discardUnsubmittedReview();
  }
  function invalidateAuthoritativeEvidence(neuronId) {
    invalidateUnsubmittedWork();
  }
  function supersedeRouteOperations() {
    invalidatePreliminaryOperation();
    invalidateUnsubmittedWork();
  }

  function transactionNotices() {
    const notices = document.createElement("section");
    notices.className = "transaction-notices";
    if (currentTransactionReceipt) {
      const receipt = currentTransactionReceipt;
      const known = document.createElement("section");
      known.className = receipt.kind === "Success" ? "status" : "error";
      known.append(
        element("h2", "Current transaction receipt"),
        element("p", `Operation: ${boundedReceiptField(receipt.operation, MAX_RECEIPT_OPERATION_LENGTH)}.`),
      );
      if (receipt.kind === "Success") {
        known.append(
          element("p", `Dendrite context neuron: ${boundedReceiptField(receipt.dendriteContextNeuronId, 20)}. Mutation or managed neuron: ${boundedReceiptField(receipt.mutationOrManagedNeuronId, 20)}.`),
          element("p", `Request SHA-256: ${boundedReceiptField(receipt.requestDigest, 64)}.`),
        );
        if (receipt.proposalId !== undefined) {
          known.append(
            element("p", `Proposal ID: ${boundedReceiptField(receipt.proposalId, 20)}.`),
            safeHttpsLink("View proposal on the Internet Computer dashboard", `https://dashboard.internetcomputer.org/proposal/${receipt.proposalId}`),
            element("p", "Proposal creation is not adoption or execution. Dendrite does not poll for either."),
          );
        }
        known.append(element("p", "Any later management action requires new transaction preflights."));
      } else if (receipt.kind === "GovernanceRejection") {
        known.append(
          element("p", `Request SHA-256: ${boundedReceiptField(receipt.requestDigest, 64)}.`),
          element("p", `Governance rejection: ${boundedReceiptField(receipt.message, MAX_RECEIPT_MESSAGE_LENGTH)}`),
          element("p", "Governance returned a known rejection; this is not an ambiguous transaction result."),
        );
      } else {
        known.append(
          element("p", `Reason: ${boundedReceiptField(receipt.message, MAX_RECEIPT_MESSAGE_LENGTH)}`),
          element("p", "Final preflight failed. No NNS update call was made."),
        );
      }
      known.append(element("p", `Browser timestamp (display only): ${new Date(receipt.timestampMilliseconds).toISOString()}.`));
      const dismiss = element("button", "Dismiss transaction receipt");
      dismiss.type = "button";
      dismiss.addEventListener("click", () => {
        currentTransactionReceipt = undefined;
        refreshTransactionNotices();
      });
      known.append(dismiss);
      notices.append(known);
    }
    if (transactionPipeline.state === "outcome-unknown") {
      const summary = transactionPipeline.outcomeUnknown;
      notices.append(
        element("h2", "Unresolved NNS transaction outcome", "error"),
        element("p", `Operation: ${boundedReceiptField(summary.operation, MAX_RECEIPT_OPERATION_LENGTH)}. Dendrite context neuron: ${boundedReceiptField(summary.dendriteContextNeuronId, 20)}. Mutation or managed neuron: ${boundedReceiptField(summary.mutationOrManagedNeuronId, 20)}.`, "error"),
        element("p", `Request SHA-256: ${boundedReceiptField(summary.requestDigest, 64)}. The prior operation may have succeeded. A full browser reload loses this heap-only marker.`, "error"),
      );
    }
    return notices;
  }

  function refreshTransactionNotices() {
    if (!currentTransactionNotices) return;
    const replacement = transactionNotices();
    currentTransactionNotices.replaceChildren(...replacement.children);
  }
  async function activateAuthenticatedSession(session) {
    // Compatibility for injected read-only test sessions; production auth always
    // returns the private { principal, signingIdentity } object.
    const principal = session?.principal ?? session;
    if (!principal?.toText) throw new Error("Internet Identity returned a malformed session.");
    const nextActor = session?.signingIdentity
      ? await nnsActorFactory(session.signingIdentity)
      : undefined;
    authenticatedPrincipal = principal;
    authenticatedSession = session?.signingIdentity ? session : undefined;
    authenticatedNnsActor = nextActor;
  }
  const actor = () => {
    if (actorPromise) return actorPromise;
    let pending;
    try {
      pending = Promise.resolve(actorFactory());
    } catch (error) {
      pending = Promise.reject(error);
    }
    actorPromise = pending;
    pending.catch(() => {
      if (actorPromise === pending) actorPromise = undefined;
    });
    return pending;
  };
  const governanceActor = () => {
    if (governanceActorPromise) return governanceActorPromise;
    let pending;
    try {
      pending = Promise.resolve(governanceActorFactory());
    } catch (error) {
      pending = Promise.reject(error);
    }
    governanceActorPromise = pending;
    pending.catch(() => {
      if (governanceActorPromise === pending) governanceActorPromise = undefined;
    });
    return pending;
  };
  const analyzer = async () => {
    preliminaryAnalyzer ??= preliminaryAnalyzerFactory(
      trustInjectedPreliminaryForTests ? undefined : await governanceActor(),
    );
    return preliminaryAnalyzer;
  };
  const transactionPipeline = createTransactionPipeline({
    getSession: async () => {
      if (authenticationTransition !== "none") throw new Error("Authentication is changing; create a new review after it completes.");
      return authenticatedSession;
    },
    getNnsActor: async () => {
      if (authenticationTransition !== "none") throw new Error("Authentication is changing; NNS access is unavailable.");
      if (!authenticatedNnsActor) throw new Error("A current authenticated NNS actor is required.");
      return authenticatedNnsActor;
    },
    checkNeuron: async (targetId) => checkLive(await actor(), targetId.toString()),
  });

  function authenticationPanel() {
    const panel = document.createElement("div");
    panel.className = "nav-auth";
    if (permanentAuthenticationError) {
      panel.append(element("p", permanentAuthenticationError, "error"));
      return panel;
    }
    if (recoverableAuthenticationError) {
      panel.append(element("p", recoverableAuthenticationError, "error"));
    }
    if (authenticationTransition !== "none") {
      panel.append(element("p", authenticationTransition === "signing-in" ? "Internet Identity sign-in is in progress…" : "Internet Identity sign-out is in progress…", "status"));
      return panel;
    }
    if (!authenticatedPrincipal) {
      panel.setAttribute("aria-label", "Signed out");
      const signIn = element(
        "button",
        recoverableAuthenticationError ? "Try again" : "Sign in with Internet Identity",
      );
      signIn.title = `Canonical origin: ${browserAuth.configuration.derivationOrigin}`;
      signIn.addEventListener("click", async () => {
        if (authenticationTransition !== "none") {
          recoverableAuthenticationError = "Another authentication transition is already in progress.";
          renderCurrent();
          return;
        }
        authenticationTransition = "signing-in";
        renderCurrent();
        try {
          await activateAuthenticatedSession(await browserAuth.signIn());
          recoverableAuthenticationError = undefined;
        } catch (error) {
          recoverableAuthenticationError = boundedAuthenticationError(
            error,
            "Internet Identity sign-in failed.",
          );
        } finally {
          authenticationTransition = "none";
        }
        renderCurrent();
      });
      panel.append(signIn);
      return panel;
    }
    const principalText = authenticatedPrincipal.toText();
    panel.append(element("p", `Dendrite principal: ${principalText}`));
    const copy = element("button", "Copy principal");
    copy.addEventListener("click", () => copyText(principalText));
    const signOut = element("button", "Sign out");
    signOut.addEventListener("click", async () => {
      if (transactionPipeline.state === "in-flight") {
        recoverableAuthenticationError = "Sign-out is unavailable while an NNS transaction is in flight. Wait for its outcome.";
        renderCurrent();
        return;
      }
      if (authenticationTransition !== "none") {
        recoverableAuthenticationError = "Another authentication transition is already in progress.";
        renderCurrent();
        return;
      }
      authenticationTransition = "signing-out";
      transactionPipeline.discardUnsubmittedReview();
      renderCurrent();
      try {
        await browserAuth.signOut();
        authenticatedPrincipal = undefined;
        authenticatedSession = undefined;
        authenticatedNnsActor = undefined;
        recoverableAuthenticationError = undefined;
      } catch (error) {
        recoverableAuthenticationError = boundedAuthenticationError(
          error,
          "Internet Identity sign-out failed.",
        );
      } finally {
        authenticationTransition = "none";
      }
      renderCurrent();
    });
    panel.append(copy, signOut);
    return panel;
  }

  const svgNode = (name) => document.createElementNS?.("http://www.w3.org/2000/svg", name)
    ?? document.createElement(name);
  function brandIcon() {
    const svg = svgNode("svg");
    svg.setAttribute("class", "brand-icon");
    svg.setAttribute("viewBox", "0 0 1254 1254");
    svg.setAttribute("aria-hidden", "true");
    const defs = svgNode("defs");
    const person = svgNode("g"); person.setAttribute("id", "person"); person.setAttribute("fill", "currentColor");
    const personPath = "M503 70C495 62 495 50 505 45C515 39 527 41 535 49C559 73 579 95 594 112C603 122 614 128 626.5 131C639 128 650 122 659 112C674 95 694 73 718 49C726 41 738 39 748 45C758 50 758 62 750 70C733 88 715 100 699 111C675 126 662 142 661 164C659 192 667 227 679 260C693 301 705 346 690 440C682 392 663 336 639 281C635 271 630 264 626.5 262C623 264 618 271 614 281C590 336 571 392 563 440C548 346 560 301 574 260C586 227 594 192 592 164C591 142 578 126 554 111C538 100 520 88 503 70Z";
    const path = svgNode("path"); path.setAttribute("d", personPath);
    const head = svgNode("circle"); head.setAttribute("cx", "626.5"); head.setAttribute("cy", "67.5"); head.setAttribute("r", "37.5");
    person.append(path, head);
    const sector = svgNode("clipPath"); sector.setAttribute("id", "sector");
    const sectorPath = svgNode("path"); sectorPath.setAttribute("d", "M627 627L256.180-514.268A1200 1200 0 0 1 997.820-514.268Z"); sector.append(sectorPath);
    const badge = svgNode("clipPath"); badge.setAttribute("id", "badge");
    const badgeCircle = svgNode("circle"); badgeCircle.setAttribute("cx", "627"); badgeCircle.setAttribute("cy", "627"); badgeCircle.setAttribute("r", "612"); badge.append(badgeCircle);
    defs.append(person, sector, badge);
    const background = svgNode("circle"); background.setAttribute("cx", "627"); background.setAttribute("cy", "627"); background.setAttribute("r", "612"); background.setAttribute("fill", "#fff");
    const people = svgNode("g"); people.setAttribute("clip-path", "url(#badge)");
    for (const [color, rotations] of [["#8f8f8f", [36, 108, 180, 252, 324]], ["#000", [0, 72, 144, 216, 288]]]) {
      const group = svgNode("g"); group.setAttribute("color", color);
      for (const rotation of rotations) {
        const use = svgNode("use");
        use.setAttribute("href", "#person"); use.setAttribute("clip-path", "url(#sector)");
        if (rotation) use.setAttribute("transform", `rotate(${rotation} 627 627)`);
        group.append(use);
      }
      people.append(group);
    }
    svg.append(defs, background, people);
    return svg;
  }

  function navigationBar() {
    const nav = document.createElement("nav");
    nav.className = "site-nav";
    nav.setAttribute("aria-label", "Dendrite");
    const brand = document.createElement("a");
    brand.className = "site-brand";
    brand.href = "#";
    brand.append(brandIcon(), element("span", "DENDRITE"));
    nav.append(brand, authenticationPanel());
    return nav;
  }

  function loadingIndicator(id) {
    const indicator = document.createElement("div");
    indicator.className = "status loading-status";
    indicator.setAttribute("role", "status");
    const icon = brandIcon();
    icon.setAttribute("class", "brand-icon loading-spinner");
    indicator.append(icon, element("span", `Checking neuron ${id}…`));
    return indicator;
  }

  function loadingReportHeader(id) {
    const announcer = element("p", "", "sr-only copy-announcer");
    announcer.setAttribute("aria-live", "polite");
    const header = document.createElement("header");
    header.className = "report-header loading-report-header";
    const idLine = document.createElement("p");
    idLine.className = "neuron-id";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "button-icon copy-button";
    copy.title = id;
    copy.setAttribute("aria-label", `Copy neuron ID: ${id}`);
    const copyIcon = element("span", "", "icon icon-copy");
    copyIcon.setAttribute("aria-hidden", "true");
    copy.append(copyIcon);
    copy.addEventListener("click", async () => {
      try {
        await copyText(id);
        announcer.textContent = "Neuron ID copied";
      } catch {
        announcer.textContent = "Copy failed";
      }
    });
    idLine.append(element("span", id), copy);
    header.append(
      element("p", `NNS Dendrite Standard · ${STANDARD_VERSION}`, "eyebrow report-eyebrow"),
      element("h1", "Loading…", "report-title"),
      element("h2", "Compliant", "header-verdict loading-placeholder"),
      idLine,
      element("p", "Raw Report", "raw-report-link loading-placeholder"),
    );
    return [announcer, header];
  }

  function managementSection(report) {
    const section = document.createElement("section");
    section.className = "account-workspace";
    currentTransactionNotices = transactionNotices();
    if (currentTransactionNotices.children.length) section.append(currentTransactionNotices);
    if (authenticatedPrincipal && report
      && transactionPipeline.state !== "outcome-unknown") {
      renderManagerAuthority(section, report, authenticatedPrincipal);
      if (authenticationTransition === "none" && authenticatedSession && authenticatedNnsActor) renderControlPanel(section, {
        report,
        session: authenticatedSession,
        nnsActor: authenticatedNnsActor,
        pipeline: transactionPipeline,
        onSettlement: settleTransaction,
      });
    }
    return section;
  }

  function appendChrome(report) {
    root.append(navigationBar());
    const workspace = managementSection(report);
    if (workspace.children.length) root.append(workspace);
  }

  function renderCurrent() {
    const match = /^#\/neuron\/([1-9][0-9]*)$/.exec(location.hash);
    if (match && currentView === "report" && currentPreliminaryReport && currentPreliminaryNeuronId === match[1]) {
      const id = match[1];
      const content = document.createElement("div");
      renderReport(content, {
        verificationKind: "Preliminary",
        report: currentPreliminaryReport,
        provenance: currentPreliminaryProvenance,
      }, { copyText });
      clear(root);
      appendChrome(currentPreliminaryReport);
      root.append(...content.children, resources());
    } else if (!match) {
      renderLanding();
    }
  }

  function renderLanding() {
    currentView = "landing";
    clear(root);
    appendChrome();
    root.append(
      element("h1", "Dendrite"),
      element("p", "Check an NNS neuron against the NNS Dendrite Standard."),
    );
    const form = document.createElement("form");
    const label = element("label", "NNS neuron ID ");
    const input = document.createElement("input");
    const button = element("button", "Check neuron");
    input.name = "neuron";
    input.inputMode = "numeric";
    input.required = true;
    label.append(input);
    form.append(label, button);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      input.setCustomValidity("");
      try {
        location.hash = `#/neuron/${formatNeuronId(parseNeuronId(input.value))}`;
      } catch (error) {
        input.setCustomValidity(error.message);
        input.reportValidity();
      }
    });
    root.append(
      form,
      element("p", "Committed topics use selected managers; known uncommitted topics use alpha-vote, omega-vote, or omega-reject, while committed delegates follow omega-reject exactly."),
      resources(),
    );
  }

  function landing(generation = ++routeGeneration) {
    if (generation !== routeGeneration) return;
    supersedeRouteOperations();
    preliminaryAnalyzer?.clear();
    currentPreliminaryReport = undefined;
    currentPreliminaryProvenance = undefined;
    currentPreliminaryNeuronId = undefined;
    preliminaryError = undefined;
    renderLanding();
  }

  async function loadNeuron(id, generation = ++routeGeneration) {
    supersedeRouteOperations();
    preliminaryAnalyzer?.clear();
    const owner = newOperation("preliminary", id, generation);
    preliminaryOperation = owner;
    if (!ownsOperation(owner, preliminaryOperation)) return;
    currentView = "loading";
    preliminaryLoading = true;
    preliminaryError = undefined;
    clear(root);
    root.setAttribute("aria-busy", "true");
    appendChrome();
    root.append(...loadingReportHeader(id), loadingIndicator(id));
    try {
      if (trustInjectedPreliminaryForTests) preliminaryAnalyzer ??= preliminaryAnalyzerFactory();
      const analyzed = await (trustInjectedPreliminaryForTests
        ? preliminaryAnalyzer.analyze(id)
        : (await analyzer()).analyze(id));
      if (!ownsOperation(owner, preliminaryOperation)) return;
      const report = analyzed?.report ?? analyzed;
      currentPreliminaryReport = report;
      currentPreliminaryProvenance = analyzed?.provenance;
      currentPreliminaryNeuronId = id;
      currentView = "report";
      preliminaryLoading = false;
      renderCurrent();
    } catch (error) {
      if (!ownsOperation(owner, preliminaryOperation)) return;
      currentPreliminaryReport = undefined;
      currentPreliminaryProvenance = undefined;
      currentPreliminaryNeuronId = undefined;
      preliminaryError = errorMessage(error);
      currentView = "error";
      clear(root);
      appendChrome();
      root.append(element("h1", `Neuron ${id}`));
      showError(root, preliminaryError);
      const retry = element("button", "Retry");
      retry.addEventListener("click", () => loadNeuron(id));
      root.append(retry, resources());
    } finally {
      if (preliminaryOperation === owner) {
        preliminaryOperation = undefined;
        preliminaryLoading = false;
        root.removeAttribute("aria-busy");
      }
    }
  }

  function route() {
    const generation = ++routeGeneration;
    const match = /^#\/neuron\/([1-9][0-9]*)$/.exec(location.hash);
    if (!match) return landing(generation);
    try {
      return loadNeuron(formatNeuronId(parseNeuronId(match[1])), generation);
    } catch {
      return landing(generation);
    }
  }

  async function settleTransaction(review, outcome) {
    if (review && outcome) {
      const common = {
        kind: outcome.kind,
        operation: boundedReceiptField(review.operation || "NNS transaction", MAX_RECEIPT_OPERATION_LENGTH),
        dendriteContextNeuronId: review.dendriteContextNeuronId,
        mutationOrManagedNeuronId: review.kind === "SubmitManageNeuronProposal" ? review.managedNeuronId : review.mutationNeuronId,
        requestDigest: boundedReceiptField(review.requestDigest, 64),
        timestampMilliseconds: Date.now(),
      };
      currentTransactionReceipt = Object.freeze(outcome.kind === "Success"
        ? { ...common, proposalId: outcome.result.proposalId }
        : { ...common, message: boundedReceiptField(outcome.message, MAX_RECEIPT_MESSAGE_LENGTH) });
    }
    const contextId = review?.dendriteContextNeuronId?.toString();
    if (transactionPipeline.state === "outcome-unknown" && contextId) {
      invalidateAuthoritativeEvidence(contextId);
    }
    const match = /^#\/neuron\/([1-9][0-9]*)$/.exec(location.hash);
    if (!match) {
      refreshTransactionNotices();
      return;
    }
    const id = formatNeuronId(parseNeuronId(match[1]));
    if (outcome?.kind === "Success" && review?.dendriteContextNeuronId.toString() === id) {
      supersedeRouteOperations();
      currentPreliminaryReport = undefined;
      currentPreliminaryNeuronId = undefined;
      await loadNeuron(id);
      return;
    }
    if (currentView === "report" && currentPreliminaryNeuronId === id) renderCurrent();
    else refreshTransactionNotices();
  }

  return {
    landing,
    loadNeuron,
    route,
    async start() {
      onHashChange("hashchange", route);
      if (!permanentAuthenticationError) {
        try {
          const restored = await browserAuth.restore();
          if (restored) await activateAuthenticatedSession(restored);
          recoverableAuthenticationError = undefined;
        } catch (error) {
          recoverableAuthenticationError = boundedAuthenticationError(
            error,
            "Stored Internet Identity session is unavailable.",
          );
        }
      }
      return route();
    },
  };
}
