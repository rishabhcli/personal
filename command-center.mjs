import * as THREE from "three";

const app = {
  projects: [],
  archiveNotes: [],
  profile: null,
  trust: null,
  claims: [],
  claimProjectSummary: [],
  artifactCatalog: null,
  graphScoreboard: null,
  opportunityQuality: null,
  opportunityBoard: null,
  runtimeSurface: null,
  runtimeReconciliation: null,
  trustBlockade: null,
  activeSlug: "anchormesh",
  graphMode: "orbit",
  previewFilters: {
    type: "all",
    audience: "all",
    year: "all",
    proof: "all",
    privacy: "all",
  },
  scene: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  bootLine: $("#boot-line"),
  statProjects: $("#stat-projects"),
  searchForm: $("#search-form"),
  query: $("#portfolio-query"),
  guideAnswer: $("#guide-answer"),
  rankedResults: $("#ranked-results"),
  projectList: $("#project-list"),
  caseStudy: $("#case-study"),
  previewWall: $("#preview-wall"),
  artifactSummary: $("#artifact-summary"),
  resetArtifactFilters: $("#reset-artifact-filters"),
  proofRibbon: $("#proof-ribbon"),
  terminalForm: $("#terminal-form"),
  terminalInput: $("#terminal-input"),
  terminalOutput: $("#terminal-output"),
  terminalShortcuts: $("#terminal-shortcuts"),
  statusList: $("#status-list"),
  refreshStatus: $("#refresh-status"),
  trustMetrics: $("#trust-metrics"),
  trustList: $("#trust-list"),
  truthLedger: $("#truth-ledger"),
  heroGrade: $("#hero-grade"),
  archiveLane: $("#archive-lane"),
  graphTitle: $("#graph-node-title"),
  graphCopy: $("#graph-node-copy"),
  graphOpenCase: $("#graph-open-case"),
  graphOverlay: $("#constellation-overlay"),
  graphFallback: $("#graph-fallback"),
  canvas: $("#constellation-canvas"),
  shufflePreviews: $("#shuffle-previews"),
};

const orbitLabelOffsets = {
  qagent: [76, -18],
  masterbuild: [-78, 18],
  fairvalue: [-170, 20],
  flowpr: [48, 16],
};

const artifactTypeLabels = {
  "repo-live": "Repo + live",
  repo: "Repo",
  live: "Live demo",
  "private-ref": "Private reference",
  generated: "Generated preview",
};

const artifactAudienceLabels = {
  "agent-infra": "Agent infra",
  research: "Research",
  civic: "Civic",
  tools: "Tools",
  product: "Product",
  portfolio: "Portfolio",
};

const proofStrengthLabels = {
  "link-backed": "Link-backed",
  "source-backed": "Source-backed",
  "needs-source": "Needs source",
};

init();

async function init() {
  document.documentElement.classList.add("js-enabled");
  activateRevealItems();
  typeBootLine();
  wireSkipLinks();
  await loadData();
  decorateTerminalShortcutButtons();
  wireEvents();
  renderEverything();
  realignCurrentSkipTarget();
  await runGuide(els.query.value);
  realignCurrentSkipTarget();
  await Promise.all([runTerminal("proof"), refreshStatus()]);
  realignCurrentSkipTarget();
  initConstellation();
  realignCurrentSkipTarget();
  scheduleTrustBlockadeHydration();
}

function activateRevealItems() {
  const revealItems = $$(".reveal");
  if (!revealItems.length) return;
  revealItems.forEach((item, index) => {
    item.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 55}ms`);
    item.classList.add("is-in");
  });
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
  );
  revealItems.forEach((item) => observer.observe(item));
}

async function loadData() {
  const [
    projectsResponse,
    graphResponse,
    trustResponse,
    claimsResponse,
    artifactsResponse,
    graphScoreboardResponse,
    opportunityQualityResponse,
    opportunityBoardResponse,
    runtimeSurfaceResponse,
    runtimeReconciliationResponse,
  ] = await Promise.all([
    fetch("/api/projects?detail=ui"),
    fetch("/api/graph"),
    fetch("/api/trust"),
    fetch("/api/claims"),
    fetch("/api/artifacts?detail=ui"),
    fetch("/api/graph-scoreboard"),
    fetch("/api/evaluation/opportunity-quality"),
    fetch("/api/opportunity-board"),
    fetch("/api/runtime-surface/latest"),
    fetch("/api/runtime-reconciliation"),
  ]);
  const payload = await projectsResponse.json();
  app.projects = payload.projects;
  app.archiveNotes = payload.archiveNotes;
  app.profile = payload.profile;
  app.graph = await graphResponse.json();
  app.trust = await trustResponse.json();
  const claimsPayload = await claimsResponse.json();
  app.claims = claimsPayload.claims || [];
  app.claimProjectSummary = claimsPayload.projectClaimSummary || [];
  app.artifactCatalog = await artifactsResponse.json();
  app.graphScoreboard = await graphScoreboardResponse.json();
  app.opportunityQuality = await opportunityQualityResponse.json();
  app.opportunityBoard = await opportunityBoardResponse.json();
  app.runtimeSurface = await runtimeSurfaceResponse.json();
  app.runtimeReconciliation = await runtimeReconciliationResponse.json();
  app.trustBlockade = deriveTrustBlockadePreview();
  els.statProjects.textContent = app.projects.length;
}

function deriveTrustBlockadePreview() {
  const graphRepair = graphRepairSummaryFromGraph();
  const weakClaims = app.trust?.counts?.needsSourceClaims || 0;
  const screenshotGaps = app.artifactCatalog?.counts?.screenshotGaps || 0;
  const artifactRepairItems = Math.max(graphRepair.nodes, screenshotGaps);
  const opportunityBlockers = app.opportunityBoard?.summary?.blockerQueue || 0;
  const runtimeBlockingLinks = runtimeBlockingLinksFromLoadedSummaries();
  const families = [weakClaims, artifactRepairItems, graphRepair.paths, opportunityBlockers, runtimeBlockingLinks].filter(
    (value) => value > 0,
  ).length;
  const frontierItems =
    (weakClaims > 0 ? 1 : 0) +
    Math.min(4, artifactRepairItems) +
    (graphRepair.paths > 0 ? 1 : 0) +
    Math.min(4, opportunityBlockers) +
    Math.min(3, runtimeBlockingLinks);
  const highPriority =
    (weakClaims >= 3 ? 1 : 0) +
    Math.min(4, artifactRepairItems) +
    Math.min(4, opportunityBlockers) +
    Math.min(3, runtimeBlockingLinks);
  const graphResolutionScore = graphRepair.paths ? Math.round((graphRepair.resolvedPaths / graphRepair.paths) * 100) : 100;
  const score = clamp(
    Math.round(
      average([
        graphResolutionScore,
        app.opportunityQuality?.summary?.score || 85,
        app.runtimeReconciliation?.summary?.score || 85,
      ]),
    ),
    70,
    99,
  );

  return {
    generatedAt: new Date().toISOString(),
    mode: "public-safe-trust-blockade-preview",
    preview: true,
    sourceBoundary:
      "This preview is derived only from first-screen public-safe graph, opportunity, artifact, claim, and runtime summaries. The full /api/trust-blockade audit replaces it when available.",
    summary: {
      score,
      band: score >= 85 ? "high" : "medium",
      frontierItems,
      families,
      highPriority,
      weakClaims,
      screenshotGaps,
      artifactRepairItems,
      graphRepairPaths: graphRepair.paths,
      graphResolvedRepairPaths: graphRepair.resolvedPaths,
      opportunityBlockers,
      runtimeBlockingLinks,
      checks: 0,
      passing: 0,
      failing: 0,
      latestReceiptId: null,
      routeCovered: true,
      refreshCovered: true,
    },
  };
}

function runtimeBlockingLinksFromLoadedSummaries() {
  const reconciliation = app.runtimeReconciliation?.summary || {};
  const routeSurface = app.runtimeReconciliation?.driftMatrix?.routeSurface || {};
  const evidenceRefresh = app.runtimeReconciliation?.driftMatrix?.evidenceRefresh || {};
  return [
    reconciliation.failing || 0,
    reconciliation.staleReceiptKinds || 0,
    routeSurface.latestFailing || 0,
    evidenceRefresh.latestFailing || 0,
    (evidenceRefresh.missingEndpoints || []).length,
  ].reduce((sum, value) => sum + value, 0);
}

function scheduleTrustBlockadeHydration() {
  let hydrated = false;
  let lastInteractionAt = performance.now();
  const interactionEvents = ["keydown", "pointerdown", "input", "submit"];
  const markInteraction = () => {
    lastInteractionAt = performance.now();
  };
  const removeInteractionListeners = () => {
    interactionEvents.forEach((eventName) => window.removeEventListener(eventName, markInteraction, true));
  };
  const hydrateWhenIdle = () => {
    if (hydrated) return;
    const quietForMs = performance.now() - lastInteractionAt;
    if (quietForMs < 4000) {
      window.setTimeout(hydrateWhenIdle, 4000);
      return;
    }
    hydrated = true;
    removeInteractionListeners();
    const hydrate = () => refreshTrustBlockade();
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(hydrate, { timeout: 2500 });
      return;
    }
    window.setTimeout(hydrate, 0);
  };

  interactionEvents.forEach((eventName) => window.addEventListener(eventName, markInteraction, true));
  window.setTimeout(hydrateWhenIdle, 6000);
}

async function refreshTrustBlockade() {
  try {
    const response = await fetch("/api/trust-blockade");
    if (!response.ok) return;
    app.trustBlockade = await response.json();
    renderProofRibbon();
    renderTruthLedger();
  } catch {
    // The core command center should remain usable even if this heavier audit is unavailable.
  }
}

function wireEvents() {
  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runGuide(els.query.value);
  });

  $$(".query-presets button").forEach((button) => {
    button.addEventListener("click", () => {
      els.query.value = button.dataset.query;
      runGuide(button.dataset.query);
    });
  });

  els.projectList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project]");
    if (!button) return;
    openCase(button.dataset.project);
  });

  els.projectList.addEventListener("keydown", handleProjectListKeydown);

  els.previewWall.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preview-case]");
    if (!button) return;
    document.querySelector("#command-cases").scrollIntoView({ behavior: "smooth", block: "start" });
    openCase(button.dataset.previewCase);
  });

  $$("[data-artifact-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      app.previewFilters[select.dataset.artifactFilter] = select.value;
      renderPreviewWall();
    });
  });

  els.resetArtifactFilters?.addEventListener("click", () => {
    app.previewFilters = {
      type: "all",
      audience: "all",
      year: "all",
      proof: "all",
      privacy: "all",
    };
    renderArtifactFilters();
    renderPreviewWall();
  });

  els.terminalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = els.terminalInput.value.trim();
    if (!command) return;
    runTerminal(command);
    els.terminalInput.value = "";
  });

  els.terminalShortcuts?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-terminal-command]");
    if (!button) return;
    const command = button.dataset.terminalCommand;
    els.terminalInput.value = command;
    runTerminal(command);
  });

  els.proofRibbon?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-proof-command]");
    if (!button) return;
    const command = button.dataset.proofCommand;
    document.querySelector("#command-terminal").scrollIntoView({ behavior: "smooth", block: "start" });
    els.terminalInput.value = command;
    runTerminal(command);
  });

  els.truthLedger?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ledger-command]");
    if (!button) return;
    const command = button.dataset.ledgerCommand;
    document.querySelector("#command-terminal").scrollIntoView({ behavior: "smooth", block: "start" });
    els.terminalInput.value = command;
    runTerminal(command);
  });

  els.refreshStatus.addEventListener("click", refreshStatus);

  els.graphOpenCase.addEventListener("click", () => {
    document.querySelector("#command-cases").scrollIntoView({ behavior: "smooth", block: "start" });
    openCase(app.activeSlug);
  });

  $("[aria-label='Graph modes']").addEventListener("click", (event) => {
    const button = event.target.closest("[data-graph-mode]");
    if (!button) return;
    app.graphMode = button.dataset.graphMode;
    $$("[data-graph-mode]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
      item.setAttribute("aria-pressed", item === button ? "true" : "false");
    });
    updateConstellationLabels();
  });

  els.graphFallback?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-graph-node]");
    if (!button) return;
    focusGraphNode(button.dataset.graphNode);
  });

  els.shufflePreviews.addEventListener("click", () => {
    app.projects.sort(() => Math.random() - 0.5);
    renderPreviewWall();
  });

  window.addEventListener("resize", () => {
    resizeConstellation();
    updateConstellationLabels();
  });

  window.addEventListener("keydown", handleGlobalKeyboardShortcuts);
}

function decorateTerminalShortcutButtons() {
  $$("[data-terminal-command]").forEach((button) => {
    const command = button.dataset.terminalCommand;
    button.setAttribute("title", `Run ${command}`);
    button.setAttribute("aria-label", `Run ${command} in terminal`);
  });
}

function wireSkipLinks() {
  $$(".skip-link[href^='#']").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      const target = getSkipTarget(href);
      if (!target) return;
      event.preventDefault();
      activateSkipTarget(href, target, { updateHistory: true });
    });
  });
}

function realignCurrentSkipTarget() {
  const target = getSkipTarget(window.location.hash);
  if (target) activateSkipTarget(window.location.hash, target);
}

function getSkipTarget(href) {
  if (!href?.startsWith("#")) return null;
  return document.getElementById(href.slice(1));
}

function activateSkipTarget(href, target, { updateHistory = false } = {}) {
  target.setAttribute("tabindex", "-1");
  alignSkipTarget(target);
  if (updateHistory) history.replaceState(null, "", href);
  target.focus({ preventScroll: true });
  window.setTimeout(() => alignSkipTarget(target), 50);
  window.setTimeout(() => alignSkipTarget(target), 300);
}

function alignSkipTarget(target) {
  target.scrollIntoView({ behavior: "auto", block: "start" });
}

function handleGlobalKeyboardShortcuts(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const editable = isEditableTarget(event.target);

  if (event.key === "/" && !editable) {
    event.preventDefault();
    document.querySelector("#command-search")?.scrollIntoView({ behavior: "smooth", block: "start" });
    focusAndSelect(els.query);
    return;
  }

  if (event.key === "`" && !editable) {
    event.preventDefault();
    document.querySelector("#command-terminal")?.scrollIntoView({ behavior: "smooth", block: "start" });
    focusAndSelect(els.terminalInput);
    return;
  }

  if (event.key === "Escape" && editable) {
    event.target.blur();
  }
}

function isEditableTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

function focusAndSelect(input) {
  input?.focus({ preventScroll: true });
  input?.select?.();
}

function renderEverything() {
  renderProofRibbon();
  renderProjectList();
  renderArtifactFilters();
  renderPreviewWall();
  renderCuration();
  renderTrustConsole();
  renderTruthLedger();
  renderGraphFallback();
  openCase(app.activeSlug);
}

function renderProofRibbon() {
  if (!els.proofRibbon) return;
  const counts = app.trust?.counts || {};
  const graphSummary = app.graphScoreboard?.summary || {};
  const graphScore = graphSummary.score;
  const graphCoverage = graphSummary.modeledEntities ? Math.round((graphSummary.renderedEntityReferences / graphSummary.modeledEntities) * 100) : 0;
  const graphRepairSummary = graphRepairSummaryFromGraph();
  const runtimeReceipt = app.runtimeSurface?.latest;
  const opportunitySummary = app.opportunityQuality?.summary || {};
  const blockadeSummary = app.trustBlockade?.summary || null;
  const items = [
    {
      label: "claims",
      value: String(counts.linkBackedClaims || 0),
      detail: `${counts.needsSourceClaims || 0} need source`,
      state: counts.needsSourceClaims > 0 ? "warn" : "good",
      command: "claim-calibration",
      actionLabel: "audit claims",
    },
    {
      label: "graph",
      value: graphScore ? `${graphScore}/100` : "missing",
      detail: `${graphCoverage}% refs · ${graphRepairSummary.paths} repair paths`,
      state: graphScore >= 85 ? "good" : "warn",
      command: "graph-confidence",
      actionLabel: "inspect graph",
    },
    {
      label: "runtime",
      value: runtimeReceipt ? `${runtimeReceipt.summary.score}/100` : "record",
      detail: runtimeReceipt ? `${runtimeReceipt.summary.passing}/${runtimeReceipt.summary.total} probes` : "surface receipt missing",
      state: runtimeReceipt?.summary?.failing === 0 ? "good" : "warn",
      command: "runtime-chain",
      actionLabel: "trace runtime",
    },
    ...(blockadeSummary
      ? [
          {
            label: "blockade",
            value: blockadeSummary.frontierItems ? String(blockadeSummary.frontierItems) : "rank",
            detail: `${blockadeSummary.families || 0} families · ${blockadeSummary.highPriority || 0} high`,
            state: blockadeSummary.score >= 85 ? "good" : "warn",
            command: "trust-blockade",
            actionLabel: "rank blockers",
          },
        ]
      : []),
    {
      label: "opportunities",
      value: `${opportunitySummary.readyForManualUse || 0}/${opportunitySummary.packages || 0}`,
      detail: `${opportunitySummary.totalMissingProof || 0} missing proof`,
      state: opportunitySummary.readyForManualUse > 0 ? "good" : "warn",
      command: "opportunity-scorecard",
      actionLabel: "score packages",
    },
  ];

  els.proofRibbon.innerHTML = items
    .map(
      (item) => `
        <div class="proof-ribbon-item" data-state="${escapeHtml(item.state)}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.detail)}</small>
          <button class="proof-ribbon-action" type="button" data-proof-command="${escapeHtml(item.command)}" aria-label="Run ${escapeHtml(item.command)} for ${escapeHtml(item.label)} proof">${escapeHtml(item.actionLabel)}</button>
        </div>
      `,
    )
    .join("");
}

function renderProjectList({ focusSlug = null } = {}) {
  els.projectList.innerHTML = app.projects
    .map((project) => {
      const selected = project.slug === app.activeSlug ? "is-selected" : "";
      return `
        <button class="project-row ${selected}" type="button" data-project="${project.slug}" ${selected ? `aria-current="true"` : ""}>
          <span class="project-dot" style="--dot-a:${project.gradient[0]};--dot-b:${project.gradient[1]}"></span>
          <span>
            <strong>${escapeHtml(project.title)}</strong>
            <small>${escapeHtml(project.kind)} · ${escapeHtml(project.tier)}</small>
          </span>
          <em>${project.score}</em>
        </button>
      `;
    })
    .join("");
  if (focusSlug) {
    els.projectList.querySelector(`[data-project="${CSS.escape(focusSlug)}"]`)?.focus();
  }
}

function handleProjectListKeydown(event) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const rows = $$("#project-list [data-project]");
  if (!rows.length) return;
  const current = event.target.closest("[data-project]");
  const currentIndex = Math.max(0, rows.indexOf(current));
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? rows.length - 1
        : event.key === "ArrowDown"
          ? Math.min(rows.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
  const next = rows[nextIndex];
  if (!next) return;
  event.preventDefault();
  openCase(next.dataset.project, { focusProject: true });
}

function renderPreviewWall() {
  const metas = app.projects.map((project) => artifactMeta(project));
  const visible = app.projects.filter((project) => artifactMatches(artifactMeta(project)));
  const activeFilters = activeArtifactFilterLabels();

  if (els.artifactSummary) {
    els.artifactSummary.textContent = `${visible.length} of ${app.projects.length} artifacts${
      activeFilters.length ? ` · ${activeFilters.join(" · ")}` : " · All signals"
    }`;
  }

  if (!visible.length) {
    els.previewWall.innerHTML = `<div class="artifact-empty">No artifacts match the current signal set.</div>`;
    return;
  }

  els.previewWall.innerHTML = visible
    .map(
      (project) => {
        const meta = metas.find((item) => item.slug === project.slug) || artifactMeta(project);
        return `
      <article class="preview-card">
        <div class="browser-chrome">
          <span></span><span></span><span></span>
          <strong>${escapeHtml(project.slug)}</strong>
        </div>
        <img src="/api/og/${project.slug}.svg" alt="${escapeHtml(project.title)} generated preview" loading="lazy" />
        <div class="preview-body">
          <div>
            <h3>${escapeHtml(project.title)}</h3>
            <p>${escapeHtml(project.summary)}</p>
          </div>
          <div class="artifact-meta">
            <span>${escapeHtml(meta.typeLabel)}</span>
            <span>${escapeHtml(meta.audienceLabel)}</span>
            <span>${escapeHtml(meta.yearLabel)}</span>
            <span>${escapeHtml(meta.proofLabel)}</span>
            <span>${escapeHtml(meta.privacyLabel)}</span>
          </div>
          ${artifactTraceMarkup(project.slug)}
          <div class="preview-actions">
            <button type="button" data-preview-case="${project.slug}">Case</button>
            ${
              project.repoUrl
                ? `<a href="${project.repoUrl}" target="_blank" rel="noreferrer">Repo</a>`
                : project.liveUrl
                  ? `<a href="${project.liveUrl}" target="_blank" rel="noreferrer">Live</a>`
                  : `<span>Private</span>`
            }
          </div>
        </div>
      </article>
    `;
      },
    )
    .join("");
}

function renderArtifactFilters() {
  const metas = app.projects.map((project) => artifactMeta(project));
  setArtifactFilterOptions("type", metas);
  setArtifactFilterOptions("audience", metas);
  setArtifactFilterOptions("year", metas);
  setArtifactFilterOptions("proof", metas);
  setArtifactFilterOptions("privacy", metas);
}

function artifactTraceMarkup(slug) {
  const artifacts = artifactsForProject(slug).slice(0, 3);
  if (!artifacts.length) return "";
  return `
    <div class="artifact-trace">
      <span class="muted-label">source trace</span>
      ${artifacts
        .map(
          (artifact) => `
          <p>
            <strong>${escapeHtml(artifactLabel(artifact))}</strong>
            <small>${escapeHtml(artifactTraceSummary(artifact))}</small>
          </p>
        `,
        )
        .join("")}
    </div>
  `;
}

function artifactsForProject(slug) {
  const priority = {
    "generated-preview": 1,
    "api-replay": 2,
    "terminal-replay": 3,
    "repo-link": 4,
    "live-demo-link": 5,
  };
  const projectPreview = app.artifactCatalog?.projects?.find((project) => project.id === slug)?.artifactPreview || [];
  const artifacts = [...projectPreview, ...(app.artifactCatalog?.artifacts || []).filter((artifact) => artifact.project === slug)];
  const seen = new Set();
  return artifacts
    .filter((artifact) => artifact.project === slug)
    .filter((artifact) => {
      if (seen.has(artifact.id)) return false;
      seen.add(artifact.id);
      return true;
    })
    .sort((left, right) => (priority[left.artifactType] || 99) - (priority[right.artifactType] || 99));
}

function artifactTraceSummary(artifact) {
  const replay = artifactReplayTarget(artifact);
  return `${artifactMediaKind(artifact)} · ${replay}`;
}

function artifactLabel(artifact) {
  const title = app.projects.find((project) => project.slug === artifact.project)?.title || artifact.project;
  const labels = {
    "generated-preview": `${title} generated preview`,
    "api-replay": `${title} case-study replay`,
    "terminal-replay": `${title} evidence terminal replay`,
    "terminal-transcript": `${title} evidence transcript`,
    "museum-capture": `${title} museum capture record`,
    "curator-annotation": `${title} curator annotation`,
    "gap-closure-plan": `${title} screenshot gap closure plan`,
    "repo-link": `${title} repository`,
    "live-demo-link": `${title} live demo`,
  };
  return artifact.label || labels[artifact.artifactType] || `${title} artifact`;
}

function artifactMediaKind(artifact) {
  const mediaKinds = {
    "generated-preview": "svg-card",
    "api-replay": "json",
    "terminal-replay": "terminal-command",
    "terminal-transcript": "terminal-text",
    "museum-capture": "audit-record",
    "curator-annotation": "museum-note",
    "gap-closure-plan": "repair-plan",
    "repo-link": "external-link",
    "live-demo-link": "external-link",
  };
  return artifact.mediaKind || mediaKinds[artifact.artifactType] || "artifact";
}

function artifactReplayTarget(artifact) {
  if (artifact.url) return artifact.url;
  if (artifact.command) return artifact.command;
  if (artifact.hasCommand) return artifactCommandFor(artifact);
  if (artifact.hasUrl) return artifactUrlFor(artifact);
  const source = artifact.sourceTrace?.at(-1);
  return source?.url || source?.command || source?.type || "source trace";
}

function artifactUrlFor(artifact) {
  const urls = {
    "generated-preview": `/api/og/${artifact.project}.svg`,
    "api-replay": `/api/case-study/${artifact.project}`,
    "terminal-transcript": `/api/artifact-transcripts/${artifact.project}`,
    "museum-capture": "/api/artifact-museum",
    "curator-annotation": "/api/artifact-museum",
    "gap-closure-plan": `/api/artifact-replays/${artifact.project}`,
  };
  return urls[artifact.artifactType] || "source trace";
}

function artifactCommandFor(artifact) {
  const commands = {
    "terminal-replay": `evidence ${artifact.project}`,
    "terminal-transcript": `evidence ${artifact.project}`,
    "museum-capture": "artifact-museum",
    "curator-annotation": "artifact-museum",
    "gap-closure-plan": `artifact-replays ${artifact.project}`,
  };
  return commands[artifact.artifactType] || "source trace";
}

function setArtifactFilterOptions(key, metas) {
  const select = $(`[data-artifact-filter="${key}"]`);
  if (!select) return;
  const labelKey = `${key}Label`;
  const options = new Map();
  metas.forEach((meta) => options.set(meta[key], meta[labelKey]));
  const sorted = [...options.entries()].sort((left, right) => String(left[1]).localeCompare(String(right[1])));
  if (key === "year") sorted.sort((left, right) => Number(right[0]) - Number(left[0]));
  select.innerHTML = [
    `<option value="all">All ${escapeHtml(typeLabelForArtifactFilter(key))}</option>`,
    ...sorted.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`),
  ].join("");
  select.value = options.has(app.previewFilters[key]) ? app.previewFilters[key] : "all";
}

function artifactMatches(meta) {
  return Object.entries(app.previewFilters).every(([key, value]) => value === "all" || meta[key] === value);
}

function activeArtifactFilterLabels() {
  const metas = app.projects.map((project) => artifactMeta(project));
  return Object.entries(app.previewFilters)
    .filter(([, value]) => value !== "all")
    .map(([key, value]) => {
      const meta = metas.find((item) => item[key] === value);
      return meta?.[`${key}Label`] || value;
    });
}

function artifactMeta(project) {
  const proofSummary = app.claimProjectSummary.find((item) => item.slug === project.slug);
  const proof = proofSummary?.strongestEvidence || proofStrengthForClaims(claimsForProject(project.slug));
  const year = latestYear(project.timeline);
  const privacy = project.visibility.toLowerCase().includes("private") ? "private" : "public";
  const type = artifactType(project);
  const audience = artifactAudience(project);

  return {
    slug: project.slug,
    type,
    typeLabel: artifactTypeLabels[type],
    audience,
    audienceLabel: artifactAudienceLabels[audience],
    year,
    yearLabel: year,
    proof,
    proofLabel: proofStrengthLabels[proof],
    privacy,
    privacyLabel: privacy === "private" ? "Public-safe private" : "Public",
  };
}

function claimsForProject(slug) {
  return (app.claims || []).filter((claim) => claim.relatedProject === slug);
}

function proofStrengthForClaims(claims) {
  const strengths = claims.map((claim) => claim.evidenceStrength);
  if (strengths.includes("link-backed")) return "link-backed";
  if (strengths.includes("source-backed")) return "source-backed";
  return "needs-source";
}

function latestYear(value) {
  const years = String(value).match(/\b20\d{2}\b/g)?.map(Number) || [];
  return years.length ? String(Math.max(...years)) : "undated";
}

function artifactType(project) {
  if (project.repoUrl && project.liveUrl) return "repo-live";
  if (project.repoUrl) return "repo";
  if (project.liveUrl) return "live";
  if (project.visibility.toLowerCase().includes("private")) return "private-ref";
  return "generated";
}

function artifactAudience(project) {
  const text = `${project.kind} ${project.summary} ${project.why} ${project.tags.join(" ")}`.toLowerCase();
  if (/(agent|browser|qa|incident|frontend|developer|automation)/.test(text)) return "agent-infra";
  if (/(research|hardware|assistive|bluetooth|paper|patent|cane)/.test(text)) return "research";
  if (/(civic|public-safety|public safety|first responder|community|map|disaster)/.test(text)) return "civic";
  if (/(extension|privacy|utility|tool)/.test(text)) return "tools";
  if (/(admissions|immigration|market|shopping|real estate|startup|product)/.test(text)) return "product";
  return "portfolio";
}

function typeLabelForArtifactFilter(key) {
  return {
    type: "types",
    audience: "audiences",
    year: "years",
    proof: "proof",
    privacy: "privacy",
  }[key];
}

function renderCuration() {
  els.heroGrade.innerHTML = app.projects
    .filter((project) => project.tier === "Hero")
    .map((project) => `<li><strong>${escapeHtml(project.title)}</strong><span>${escapeHtml(project.outcome)}</span></li>`)
    .join("");

  els.archiveLane.innerHTML = app.archiveNotes
    .map((note) => `<li><strong>${escapeHtml(note.name)}</strong><span>${escapeHtml(note.reason)}</span></li>`)
    .join("");
}

function renderTrustConsole() {
  if (!els.trustMetrics || !els.trustList || !app.trust) return;
  const counts = app.trust.counts;
  const metrics = [
    ["Claims", counts.totalClaims],
    ["Link-backed", counts.linkBackedClaims],
    ["Need source", counts.needsSourceClaims],
    ["Private refs", counts.privateReferences],
  ];

  els.trustMetrics.innerHTML = metrics
    .map(
      ([label, value]) => `
        <div class="trust-metric">
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(label)}</span>
        </div>
      `,
    )
    .join("");

  els.trustList.innerHTML = app.trust.strongestClaims
    .slice(0, 4)
    .map(
      (claim) => `
        <article class="trust-claim">
          <span>${escapeHtml(claim.evidenceStrength)} · ${escapeHtml(String(claim.confidenceScore))}/100</span>
          <p>${escapeHtml(claim.text)}</p>
        </article>
      `,
    )
    .join("");
}

function renderTruthLedger() {
  if (!els.truthLedger) return;
  const reconciliation = app.runtimeReconciliation?.summary || {};
  const receiptMatrix = app.runtimeReconciliation?.receiptMatrix || [];
  const board = app.opportunityBoard?.summary || {};
  const graph = app.graphScoreboard?.summary || {};
  const opportunity = app.opportunityQuality?.summary || {};
  const blockade = app.trustBlockade?.summary || null;
  const rows = [
    {
      id: "runtime-reconciliation",
      label: "Runtime reconciliation",
      value: reconciliation.score ? `${reconciliation.score}/100` : "missing",
      detail: `${reconciliation.passing || 0}/${reconciliation.checks || 0} checks · ${reconciliation.staleReceiptKinds || 0} stale receipts`,
      state: reconciliation.failing === 0 ? "good" : "warn",
      command: "runtime-reconciliation",
    },
    {
      id: "runtime-surface",
      label: "Surface receipt",
      value: `${app.runtimeReconciliation?.driftMatrix?.routeSurface?.latestProbeTargets || 0}/${app.runtimeReconciliation?.driftMatrix?.routeSurface?.expectedProbeTargets || 0}`,
      detail: receiptFreshness(receiptMatrix, "runtime-surface"),
      state: receiptFreshness(receiptMatrix, "runtime-surface") === "fresh" ? "good" : "warn",
      command: "runtime-surface",
    },
    {
      id: "opportunity-board",
      label: "Opportunity gates",
      value: `${board.readyForManualReview || 0}/${board.packages || 0}`,
      detail: `${board.needsProofRepair || 0} proof-repair · ${board.blockerQueue || 0} blockers`,
      state: board.readyForManualReview > 0 ? "good" : "warn",
      command: "opportunity-board",
    },
    {
      id: "graph-scoreboard",
      label: "Graph normalization",
      value: graph.score ? `${graph.score}/100` : "missing",
      detail: `${graph.renderedEntityReferences || 0}/${graph.modeledEntities || 0} rendered refs`,
      state: graph.score >= 85 ? "good" : "warn",
      command: "graph-scoreboard",
    },
    {
      id: "opportunity-quality",
      label: "Opportunity quality",
      value: opportunity.score ? `${opportunity.score}/100` : "missing",
      detail: `${opportunity.totalMissingProof || 0} missing proof · ${opportunity.readyForManualUse || 0} ready`,
      state: opportunity.readyForManualUse > 0 ? "good" : "warn",
      command: "opportunity-quality",
    },
    ...(blockade
      ? [
          {
            id: "trust-blockade",
            label: "Trust blockade",
            value: blockade.score ? `${blockade.score}/100` : "missing",
            detail: `${blockade.frontierItems || 0} blockers · ${blockade.graphRepairPaths || 0} repair paths`,
            state: blockade.score >= 85 ? "good" : "warn",
            command: "trust-blockade",
          },
        ]
      : []),
  ];

  els.truthLedger.innerHTML = rows
    .map(
      (row) => `
        <article class="ledger-row" data-state="${escapeHtml(row.state)}">
          <div class="ledger-score">
            <strong>${escapeHtml(row.value)}</strong>
            <span>${escapeHtml(row.state === "good" ? "clear" : "review")}</span>
          </div>
          <div class="ledger-copy">
            <h4>${escapeHtml(row.label)}</h4>
            <p>${escapeHtml(row.detail)}</p>
          </div>
          <button type="button" data-ledger-command="${escapeHtml(row.command)}">${escapeHtml(row.command)}</button>
        </article>
      `,
    )
    .join("");
}

function receiptFreshness(receipts, id) {
  return receipts.find((receipt) => receipt.id === id)?.freshness || "missing";
}

function graphRepairSummaryFromGraph() {
  const nodes = app.graph?.nodes || [];
  const edges = app.graph?.edges || [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const repairNodeIds = new Set(nodes.filter((node) => node.type === "artifact-gap-repair").map((node) => node.id));
  const repairEdges = edges.filter((edge) => edge.relation === "unblocks-opportunity-proof" && repairNodeIds.has(edge.source));
  return {
    nodes: repairNodeIds.size,
    paths: repairEdges.length,
    resolvedPaths: repairEdges.filter((edge) => nodeIds.has(edge.target)).length,
  };
}

function renderGraphFallback() {
  if (!els.graphFallback || !app.graph?.nodes?.length) return;
  const nodes = app.graph.nodes;
  const counts = new Map();
  nodes.forEach((node) => counts.set(node.type, (counts.get(node.type) || 0) + 1));
  const countOrder = ["project", "claim", "artifact-gap-repair", "opportunity", "verification-receipt", "screenshot", "skill", "domain", "system"];
  const countTiles = countOrder
    .filter((type) => counts.has(type))
    .map(
      (type) => `
        <span>
          <strong>${escapeHtml(counts.get(type))}</strong>
          ${escapeHtml(typeLabel(type))}
        </span>
      `,
    )
    .join("");

  const claims = topGraphNodes("claim", 4);
  const repairs = topGraphNodes("artifact-gap-repair", 4);
  const opportunities = topGraphNodes("opportunity", 4);
  const receipts = topGraphNodes("verification-receipt", 3);
  const trails = graphRelationTrails(6);
  const repairTrails = graphRepairTrails(5);

  els.graphFallback.innerHTML = `
    <div class="graph-type-strip">${countTiles}</div>
    <div class="graph-fallback-grid">
      ${graphFallbackSection("Claims", claims)}
      ${graphFallbackSection("Proof repairs", repairs)}
      ${graphFallbackSection("Opportunities", opportunities)}
      ${graphFallbackSection("Receipts", receipts)}
    </div>
    ${
      repairTrails.length
        ? `<div class="graph-trails graph-trails--repair" aria-label="Proof repair graph paths">
            <span class="muted-label">proof repair paths</span>
            ${repairTrails.map(graphTrailRow).join("")}
          </div>`
        : ""
    }
    <div class="graph-trails" aria-label="Graph relation trails">
      <span class="muted-label">relation trails</span>
      ${trails.map(graphTrailRow).join("")}
    </div>
  `;
}

function topGraphNodes(type, limit) {
  return (app.graph?.nodes || [])
    .filter((node) => node.type === type)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, limit);
}

function graphFallbackSection(title, nodes) {
  if (!nodes.length) return "";
  return `
    <section class="graph-fallback-section">
      <h4>${escapeHtml(title)}</h4>
      <div class="graph-fallback-list">
        ${nodes.map(graphFallbackButton).join("")}
      </div>
    </section>
  `;
}

function graphFallbackButton(node) {
  const projectSlugs = relatedProjectSlugsForNode(node);
  const project = projectSlugs[0] ? projectBySlug(projectSlugs[0]) : null;
  const meta = graphNodeMeta(node, projectSlugs);
  return `
    <button
      class="graph-fallback-item"
      type="button"
      data-graph-node="${escapeHtml(node.id)}"
      data-graph-type="${escapeHtml(node.type)}"
      ${project ? `data-project="${escapeHtml(project.slug)}"` : ""}
    >
      <span>${escapeHtml(meta)}</span>
      <strong>${escapeHtml(node.label)}</strong>
      <small>${escapeHtml(describeGraphNode(node, projectSlugs))}</small>
    </button>
  `;
}

function graphRelationTrails(limit) {
  const usefulRelations = new Set([
    "supports-claim",
    "fits-opportunity",
    "recorded-receipt",
    "published-at",
    "unblocks-opportunity-proof",
  ]);
  return (app.graph?.edges || [])
    .filter((edge) => usefulRelations.has(edge.relation) && graphNodeById(edge.source) && graphNodeById(edge.target))
    .sort((left, right) => Number(right.weight || 0) - Number(left.weight || 0))
    .slice(0, limit);
}

function graphRepairTrails(limit) {
  const repairRelations = new Set(["has-artifact-gap-repair", "planned-by-gap-repair", "unblocks-opportunity-proof"]);
  return (app.graph?.edges || [])
    .filter((edge) => repairRelations.has(edge.relation) && graphNodeById(edge.source) && graphNodeById(edge.target))
    .sort((left, right) => Number(right.weight || 0) - Number(left.weight || 0))
    .slice(0, limit);
}

function graphTrailRow(edge) {
  const source = graphNodeById(edge.source);
  const target = graphNodeById(edge.target);
  return `
    <button class="graph-trail" type="button" data-graph-node="${escapeHtml(target.id)}" data-graph-relation="${escapeHtml(edge.relation)}">
      <strong>${escapeHtml(source.label)} -&gt; ${escapeHtml(target.label)}</strong>
      <span>${escapeHtml(edge.explanation || edge.relation)}</span>
    </button>
  `;
}

function focusGraphNode(nodeId) {
  const node = graphNodeById(nodeId);
  if (!node) return;
  const projectSlugs = relatedProjectSlugsForNode(node);
  if (projectSlugs[0]) app.activeSlug = projectSlugs[0];
  els.graphTitle.textContent = node.label;
  els.graphCopy.textContent = describeGraphNode(node, projectSlugs);
  renderProjectList();
  updateConstellationLabels();
}

function graphNodeById(id) {
  return (app.graph?.nodes || []).find((node) => node.id === id);
}

function projectBySlug(slug) {
  return app.projects.find((project) => project.slug === slug);
}

function relatedProjectSlugsForNode(node) {
  const projectSlugs = new Set(app.projects.map((project) => project.slug));
  if (projectSlugs.has(node.id)) return [node.id];
  const linked = (app.graph?.edges || [])
    .filter((edge) => edge.target === node.id && projectSlugs.has(edge.source))
    .sort((left, right) => Number(right.weight || 0) - Number(left.weight || 0))
    .map((edge) => edge.source);
  return [...new Set(linked)];
}

function graphNodeMeta(node, projectSlugs) {
  const score = Number.isFinite(Number(node.score)) ? `${Math.round(Number(node.score))}/100` : "linked";
  if (node.type === "claim") return `${node.evidenceStrength || "claim"} · ${score}`;
  if (node.type === "artifact-gap-repair") return `proof repair · ${score}`;
  if (node.type === "opportunity") return `${node.audience || "opportunity"} · ${score}`;
  if (node.type === "verification-receipt") return `receipt · ${score} passing`;
  return `${typeLabel(node.type)} · ${projectSlugs.length ? projectSlugs.length : "graph"} link`;
}

function describeGraphNode(node, projectSlugs = relatedProjectSlugsForNode(node)) {
  const projects = projectSlugs.map(projectBySlug).filter(Boolean);
  const projectTrail = projects.length
    ? ` Connected to ${projects.slice(0, 3).map((project) => project.title).join(", ")}${projects.length > 3 ? ` and ${projects.length - 3} more` : ""}.`
    : "";
  const score = Number.isFinite(Number(node.score)) ? `${Math.round(Number(node.score))}/100` : "unscored";

  if (node.type === "claim") {
    return `${node.evidenceStrength || "Source-backed"} claim at ${score} confidence.${projectTrail}`;
  }
  if (node.type === "opportunity") {
    return `Opportunity route for ${node.audience || "a portfolio reader"} at ${score} fit.${projectTrail}`;
  }
  if (node.type === "artifact-gap-repair") {
    const unlocks = Number(node.opportunityUnlocks || 0);
    return `Proof-media repair plan at ${score} unlock pressure for ${unlocks} opportunity path${unlocks === 1 ? "" : "s"}. It is not claiming the missing screenshot or video exists yet.${projectTrail}`;
  }
  if (node.type === "screenshot") {
    return `Missing screenshot artifact tracked as a public-safe repair target.${projectTrail}`;
  }
  if (node.type === "verification-receipt") {
    return `Verification receipt with ${score} passing checks from the trust console.`;
  }
  if (node.type === "project") {
    return `${node.tier || "Project"} node with ${score} signal in the selected-work graph.`;
  }
  return `${typeLabel(node.type)} node in the public semantic graph.${projectTrail}`;
}

function typeLabel(type) {
  return {
    project: "Projects",
    claim: "Claims",
    "artifact-gap-repair": "Proof repairs",
    opportunity: "Opportunities",
    "verification-receipt": "Receipts",
    screenshot: "Screenshot gaps",
    skill: "Skills",
    domain: "Domains",
    system: "Systems",
    person: "People",
    education: "Education",
    course: "Courses",
  }[type] || type;
}

async function openCase(slug, { focusProject = false } = {}) {
  app.activeSlug = slug;
  renderProjectList({ focusSlug: focusProject ? slug : null });
  const response = await fetch(`/api/case-study/${slug}`);
  const project = await response.json();
  const projectRecord = app.projects.find((item) => item.slug === slug) || app.projects[0] || {};
  const gradient = project.gradient || projectRecord.gradient || ["#38bdf8", "#f59e0b"];
  const stack = project.stack || project.stackPreview || projectRecord.stack || [];
  const proof = project.proof || projectRecord.proof || [];
  const tier = project.tier || projectRecord.tier || "Project";
  const visibility = project.visibility || projectRecord.visibility || "Public-safe";
  const title = project.title || projectRecord.title || slug;
  const summary = project.summary || projectRecord.summary || "Public-safe project summary is unavailable.";
  const timeline = project.timeline || projectRecord.timeline || "Timeline under review";
  const outcome = project.outcome || projectRecord.outcome || "Outcome under review";
  els.caseStudy.innerHTML = `
    <div class="case-hero" style="--case-a:${gradient[0]};--case-b:${gradient[1]}">
      <div>
        <span>${escapeHtml(tier)} / ${escapeHtml(visibility)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(summary)}</p>
      </div>
      <strong>${project.score || projectRecord.score || 0}</strong>
    </div>
    <div class="case-meta">
      <span>${escapeHtml(timeline)}</span>
      <span>${escapeHtml(outcome)}</span>
    </div>
    <div class="case-sections">
      ${project.sections
        .map(
          (section) => `
        <section>
          <h4>${escapeHtml(section.title)}</h4>
          <p>${escapeHtml(section.body)}</p>
        </section>
      `,
        )
        .join("")}
    </div>
    <div class="stack-strip">
      ${stack.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
    </div>
    <div class="proof-list">
      ${proof.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
    </div>
  `;
  setGraphReadout(project.slug, { focusProject });
}

async function runGuide(query) {
  const response = await fetch(`/api/guide?q=${encodeURIComponent(query)}`);
  const payload = await response.json();
  els.guideAnswer.innerHTML = `
    <span class="muted-label">retrieval guide</span>
    <p>${escapeHtml(payload.answer)}</p>
    ${payload.intentPath ? intentPathMarkup(payload.intentPath) : ""}
  `;
  els.rankedResults.innerHTML = payload.results
    .map(
      (project, index) => `
      <button type="button" class="result-pill" data-project="${project.slug}">
        <span>${index + 1}</span>
        <strong>${escapeHtml(project.title)}</strong>
        <small>${escapeHtml(project.explanation || project.kind)}</small>
      </button>
    `,
    )
    .join("");

  $$("#ranked-results [data-project]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#command-cases").scrollIntoView({ behavior: "smooth", block: "start" });
      openCase(button.dataset.project);
    });
  });
}

function intentPathMarkup(intentPath) {
  return `
    <div class="intent-path">
      <div>
        <strong>${escapeHtml(intentPath.label)}</strong>
        <span>${escapeHtml(intentPath.timeBox)}</span>
      </div>
      <ol>
        ${intentPath.timeBoxedPath
          .slice(0, 5)
          .map((step) => `<li><span>${escapeHtml(String(step.minute))}m</span>${escapeHtml(step.action)} · ${escapeHtml(step.target)}</li>`)
          .join("")}
      </ol>
      <p>${escapeHtml(intentPath.riskDisclosure[0])}</p>
      <small>CTA: ${escapeHtml(intentPath.cta)}</small>
    </div>
  `;
}

async function runTerminal(command) {
  appendTerminal(`rb@dev % ${command}`, "input");
  const response = await fetch("/api/terminal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  const payload = await response.json();
  appendTerminal(payload.output, "output");
}

function appendTerminal(text, type) {
  const block = document.createElement("pre");
  block.className = `terminal-line terminal-${type}`;
  block.textContent = text;
  els.terminalOutput.append(block);
  els.terminalOutput.scrollTop = els.terminalOutput.scrollHeight;
}

async function refreshStatus() {
  els.statusList.innerHTML = Array.from({ length: 4 })
    .map(() => `<div class="status-row loading"><span></span><strong>checking</strong><em>--</em></div>`)
    .join("");
  const response = await fetch("/api/status");
  const payload = await response.json();
  els.statusList.innerHTML = payload.checks
    .map(
      (check) => `
      <a class="status-row ${check.ok ? "is-up" : "is-down"}" href="${check.url}" target="_blank" rel="noreferrer">
        <span></span>
        <strong>${escapeHtml(check.label)}</strong>
        <small>${escapeHtml(check.role)}</small>
        <em>${check.ok ? check.status : check.detail || check.status} · ${check.ms}ms</em>
      </a>
    `,
    )
    .join("");
}

function initConstellation() {
  if (!els.canvas) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.z = 18;
  const renderer = new THREE.WebGLRenderer({
    canvas: els.canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const group = new THREE.Group();
  scene.add(group);

  const nodeMeshes = [];
  const linePositions = [];
  const geometry = new THREE.SphereGeometry(0.22, 24, 16);
  const projectNodes = app.projects.map((project, index) => {
    const angle = (index / app.projects.length) * Math.PI * 2;
    const ring = project.tier === "Hero" ? 6.2 : project.tier === "Strong" ? 7.6 : 9;
    const y = Math.sin(index * 1.7) * 2.2;
    const position = new THREE.Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
    const color = new THREE.Color(project.gradient[0]);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.7,
      roughness: 0.28,
      metalness: 0.15,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(project.tier === "Hero" ? 1.45 : project.tier === "Strong" ? 1.1 : 0.86);
    mesh.userData = { slug: project.slug };
    group.add(mesh);
    nodeMeshes.push(mesh);
    linePositions.push(0, 0, 0, position.x, position.y, position.z);
    return { project, mesh, position };
  });

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 1),
    new THREE.MeshStandardMaterial({
      color: "#f8fafc",
      emissive: "#38bdf8",
      emissiveIntensity: 0.35,
      roughness: 0.4,
    }),
  );
  group.add(core);

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
  const lines = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: "#8bd3ff", transparent: true, opacity: 0.23 }),
  );
  group.add(lines);

  scene.add(new THREE.AmbientLight("#ffffff", 0.9));
  const key = new THREE.PointLight("#7dd3fc", 90, 40);
  key.position.set(4, 5, 7);
  scene.add(key);
  const warm = new THREE.PointLight("#f59e0b", 40, 30);
  warm.position.set(-5, -4, 4);
  scene.add(warm);

  app.scene = { scene, camera, renderer, group, projectNodes, nodeMeshes };
  resizeConstellation();
  updateConstellationLabels();
  wireConstellationPointer();
  animateConstellation();
}

function wireConstellationPointer() {
  const { group } = app.scene;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  els.canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    els.canvas.setPointerCapture(event.pointerId);
  });

  els.canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    group.rotation.y += dx * 0.006;
    group.rotation.x += dy * 0.004;
    lastX = event.clientX;
    lastY = event.clientY;
    updateConstellationLabels();
  });

  els.canvas.addEventListener("pointerup", () => {
    dragging = false;
  });

  els.canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    app.scene.camera.position.z = clamp(app.scene.camera.position.z + event.deltaY * 0.01, 10, 24);
    resizeConstellation();
  });
}

function resizeConstellation() {
  if (!app.scene) return;
  const rect = els.canvas.getBoundingClientRect();
  app.scene.camera.aspect = rect.width / Math.max(rect.height, 1);
  app.scene.camera.updateProjectionMatrix();
  app.scene.renderer.setSize(rect.width, rect.height, false);
}

function animateConstellation() {
  const { scene, camera, renderer, group, nodeMeshes } = app.scene;
  let tick = 0;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function frame() {
    tick += 0.01;
    if (!reduced) {
      group.rotation.y += 0.0025;
      nodeMeshes.forEach((mesh, index) => {
        const pulse = 1 + Math.sin(tick * 3 + index) * 0.08;
        const base = mesh.userData.slug === app.activeSlug ? 1.45 : 1;
        mesh.scale.setScalar(base * pulse * (mesh.userData.slug === app.activeSlug ? 1.25 : 1));
      });
    }
    renderer.render(scene, camera);
    if (Math.floor(tick * 100) % 6 === 0) updateConstellationLabels();
    requestAnimationFrame(frame);
  }
  frame();
}

function updateConstellationLabels() {
  if (!app.scene) return;
  const { projectNodes, camera } = app.scene;
  const rect = els.canvas.getBoundingClientRect();
  const sorted = app.graphMode === "rank"
    ? [...projectNodes].sort((a, b) => b.project.score - a.project.score)
    : projectNodes;
  const labeledNodes =
    app.graphMode === "orbit"
      ? sorted.filter(({ project }) => project.tier === "Hero" || project.slug === app.activeSlug)
      : sorted;

  els.graphOverlay.innerHTML = labeledNodes
    .map(({ project, mesh }, index) => {
      const position = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      let x = ((position.x + 1) / 2) * rect.width;
      let y = ((-position.y + 1) / 2) * rect.height;

      if (app.graphMode === "rank") {
        x = 94 + (index % 4) * 170;
        y = 26 + Math.floor(index / 4) * 52;
      } else if (app.graphMode === "domain") {
        x = 112 + (index % 3) * 190;
        y = rect.height - 170 + Math.floor(index / 3) * 48;
      } else {
        const dx = x - rect.width / 2;
        const dy = y - rect.height / 2;
        const distance = Math.max(1, Math.hypot(dx, dy));
        x += (dx / distance) * 70;
        y += (dy / distance) * 44;
        const [offsetX, offsetY] = orbitLabelOffsets[project.slug] || [0, 0];
        x += offsetX;
        y += offsetY;
      }

      const active = project.slug === app.activeSlug ? "is-active" : "";
      return `
        <button class="node-label ${active}" type="button" data-node="${project.slug}" style="left:${x}px;top:${y}px">
          ${escapeHtml(project.title)}
        </button>
      `;
    })
    .join("");

  $$("#constellation-overlay [data-node]").forEach((button) => {
    button.addEventListener("click", () => {
      setGraphReadout(button.dataset.node);
    });
  });
}

function setGraphReadout(slug, { focusProject = false } = {}) {
  const project = app.projects.find((item) => item.slug === slug) || app.projects[0];
  app.activeSlug = project.slug;
  els.graphTitle.textContent = project.title;
  els.graphCopy.textContent = project.summary;
  renderProjectList({ focusSlug: focusProject ? project.slug : null });
  updateConstellationLabels();
}

function typeBootLine() {
  if (!els.bootLine) return;
  const lines = [
    "sqlite index warm",
    "github repositories scanned",
    "linkedin proof loaded",
    "constellation online",
  ];
  let index = 0;
  setInterval(() => {
    els.bootLine.textContent = lines[index % lines.length];
    index += 1;
  }, 2200);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (!numericValues.length) return 0;
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
