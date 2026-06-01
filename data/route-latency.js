const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { buildRuntimeSurfaceProbes } = require("./runtime-surface");

const ENDPOINT = "/api/route-latency";
const STORE_RELATIVE_PATH = path.join("var", "route-latency-receipts.json");
const ROUTE_WARN_MS = 1000;
const TERMINAL_WARN_MS = 1200;
const MAX_RECEIPTS = 50;
const COMPACT_PLAN_ROUTE_PROBE_PREVIEW_LIMIT = 4;
const MAX_PLAN_ROUTE_PROBE_PREVIEW_LIMIT = 40;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function routeLatencyPlan(routeManifest = emptyRouteManifest()) {
  const routeProbes = buildRuntimeSurfaceProbes(routeManifest).filter((probe) => probe.group === "public-api");
  const terminalCommands = routeLatencyTerminalCommands();
  return {
    mode: "route-latency-heatmap-plan",
    command: "npm run record:route-latency",
    endpoint: ENDPOINT,
    historyEndpoint: `${ENDPOINT}/history`,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after route, terminal, receipt, cache, or heavy audit endpoint changes, and before deciding which public surface should become receipt-backed next.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, performs local public-route GET/POST probes and local terminal POST probes, may trigger read-only public-domain checks through existing local endpoints, writes a local receipt under var/, and does not deploy, publish, mutate external systems, enable private cockpit data, submit applications, send outreach, or change billing.",
    thresholds: {
      routeWarnMs: ROUTE_WARN_MS,
      terminalWarnMs: TERMINAL_WARN_MS,
    },
    routeProbeCount: routeProbes.length,
    terminalCommandCount: terminalCommands.length,
    routeProbes: routeProbes.map(({ id, route, target, method, expectedStatus, body }) => ({
      id,
      route,
      target,
      method,
      expectedStatus,
      body,
    })),
    terminalCommands,
  };
}

function routeLatencyTerminalCommands() {
  return [
    "help",
    "proof",
    "evaluate",
    "graph-scoreboard",
    "graph-lineage",
    "graph-depth",
    "trust-blockade",
    "opportunity-board",
    "opportunity-derisking",
    "opportunity-ranking",
    "opportunity-scorecard",
    "research-stress",
    "design-ambition",
    "runtime-surface",
    "runtime-reconciliation",
    "runtime-chain",
    "artifact-gap-repair",
    "artifact-museum",
    "narrative-tailor recruiter",
    "review weekly",
    "route-latency",
  ];
}

function buildRouteLatencyPlanResponse(plan, { detail = "summary", previewLimit = COMPACT_PLAN_ROUTE_PROBE_PREVIEW_LIMIT } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedPreview = Math.max(
    4,
    Math.min(Number(previewLimit) || COMPACT_PLAN_ROUTE_PROBE_PREVIEW_LIMIT, MAX_PLAN_ROUTE_PROBE_PREVIEW_LIMIT),
  );
  if (fullDetail) {
    return {
      ...plan,
      detail: "full",
      fullPlanEndpoint: `${ENDPOINT}/plan?detail=full`,
      planPayloadPolicy: {
        fullDetail: true,
        routeProbesReturned: plan.routeProbes.length,
        terminalCommandsReturned: plan.terminalCommands.length,
      },
    };
  }

  const routeProbePreview = selectRouteProbePreview(plan.routeProbes, boundedPreview);
  return {
    mode: plan.mode,
    command: plan.command,
    endpoint: plan.endpoint,
    historyEndpoint: plan.historyEndpoint,
    detail: "summary",
    fullPlanEndpoint: `${ENDPOINT}/plan?detail=full`,
    scheduleRecommendationAvailable: Boolean(plan.scheduleRecommendation),
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
    thresholds: plan.thresholds,
    routeProbeCount: plan.routeProbeCount,
    terminalCommandCount: plan.terminalCommandCount,
    routeProbeSummary: summarizeRouteProbeCorpus(plan.routeProbes),
    routeProbePreview,
    terminalCommandPreview: selectTerminalCommandPreview(plan.terminalCommands),
    planPayloadPolicy: {
      fullDetail: false,
      routeProbePreviewLimit: boundedPreview,
      routeProbesReturned: routeProbePreview.length,
      terminalCommandsAvailable: plan.terminalCommands.length,
      omittedRouteProbes: Math.max(0, plan.routeProbes.length - routeProbePreview.length),
    },
  };
}

function selectTerminalCommandPreview(commands = []) {
  const selected = [];
  const add = (command) => {
    if (command && !selected.includes(command)) selected.push(command);
  };
  ["help", "proof", "evaluate", "route-latency"].forEach((command) => add(commands.find((item) => item === command)));
  return selected;
}

function buildRouteLatencyReport({
  baseUrl,
  routeManifest = emptyRouteManifest(),
  refreshPlan = { endpoints: [] },
  packageManifest = { scripts: {} },
  routeSamples = [],
  terminalSamples = [],
  previousReceipts = [],
}) {
  const plan = routeLatencyPlan(routeManifest);
  const normalizedRoutes = routeSamples.map(normalizeRouteSample);
  const normalizedTerminal = terminalSamples.map(normalizeTerminalSample);
  const routeHeatmap = sortByLatency(normalizedRoutes).map((sample, index) => ({ rank: index + 1, ...sample }));
  const terminalHeatmap = sortByLatency(normalizedTerminal).map((sample, index) => ({ rank: index + 1, ...sample }));
  const checks = routeLatencyChecks({
    plan,
    routeSamples: normalizedRoutes,
    terminalSamples: normalizedTerminal,
    routeHeatmap,
    terminalHeatmap,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = checks.filter((check) => !check.passed);
  const slowRoutes = normalizedRoutes.filter((sample) => sample.ms >= ROUTE_WARN_MS);
  const slowTerminalCommands = normalizedTerminal.filter((sample) => sample.ms >= TERMINAL_WARN_MS);
  const previous = previousReceipts[0] || null;
  const totalMeasuredMs = sumMs(normalizedRoutes) + sumMs(normalizedTerminal);

  return {
    id: `route-latency-${Date.now().toString(36)}`,
    checkedAt: new Date().toISOString(),
    mode: "route-latency-heatmap",
    baseUrl,
    sourceBoundary:
      "This receipt measures local public API route and terminal command latency through a temporary local server. It is local performance evidence only, not production CDN, provider, DNS, or user analytics proof.",
    sideEffectBoundary: plan.sideEffectBoundary,
    plan,
    summary: {
      score: weightedScore(checks),
      band: bandFor(weightedScore(checks)),
      routeSamples: normalizedRoutes.length,
      terminalSamples: normalizedTerminal.length,
      totalSamples: normalizedRoutes.length + normalizedTerminal.length,
      routeWarnMs: ROUTE_WARN_MS,
      terminalWarnMs: TERMINAL_WARN_MS,
      slowRoutes: slowRoutes.length,
      slowTerminalCommands: slowTerminalCommands.length,
      routeP50Ms: percentile(normalizedRoutes, 50),
      routeP95Ms: percentile(normalizedRoutes, 95),
      terminalP50Ms: percentile(normalizedTerminal, 50),
      terminalP95Ms: percentile(normalizedTerminal, 95),
      slowestRouteMs: routeHeatmap[0]?.ms || 0,
      slowestTerminalMs: terminalHeatmap[0]?.ms || 0,
      totalMeasuredMs,
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      previousReceiptId: previous?.id || null,
      previousTotalMeasuredMs: previous?.summary?.totalMeasuredMs || null,
      measuredDeltaMs:
        typeof previous?.summary?.totalMeasuredMs === "number" ? totalMeasuredMs - previous.summary.totalMeasuredMs : null,
    },
    heatmap: {
      routes: routeHeatmap,
      terminalCommands: terminalHeatmap,
    },
    slowRouteFrontier: routeHeatmap.filter((sample) => sample.ms >= ROUTE_WARN_MS).slice(0, 12),
    slowTerminalFrontier: terminalHeatmap.filter((sample) => sample.ms >= TERMINAL_WARN_MS).slice(0, 12),
    checks,
    repairActions: recommendedRepairs({ routeHeatmap, terminalHeatmap }),
    nonClaims: [
      "Does not claim production latency, CDN latency, hosted deploy performance, visitor analytics, or browser rendering speed.",
      "Does not mutate external systems, submit applications, send outreach, publish changes, deploy, approve private data, or change billing.",
      "Does not prove a slow endpoint is broken; it identifies local recomputation pressure for follow-up cache, receipt, or query work.",
      "Does not include private cockpit content or enable private routes.",
    ],
    nextAction: nextLatencyAction({ routeHeatmap, terminalHeatmap }),
    verificationCommand: "npm run record:route-latency && npm run check && node --test test/api-contract.test.mjs",
  };
}

function buildRouteLatencyLatest({ routeManifest = emptyRouteManifest(), receipts = [], detail = "summary", previewLimit = 2 }) {
  const latest = receipts[0] || null;
  const plan = routeLatencyPlan(routeManifest);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedPreview = Math.max(1, Math.min(Number(previewLimit) || 2, 50));
  const routeHeatmap = latest?.heatmap?.routes || [];
  const terminalHeatmap = latest?.heatmap?.terminalCommands || [];
  const sourceBoundary = "This endpoint returns the latest local route-latency receipt and does not run latency probes during the request.";
  return {
    mode: "route-latency-heatmap",
    cachedFromReceipt: Boolean(latest),
    detail: fullDetail ? "full" : "summary",
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    ...(fullDetail
      ? {
          generatedAt: new Date().toISOString(),
          cachePolicy: latest ? "latest-local-receipt" : "missing-local-receipt",
          sourceBoundary,
          sideEffectBoundary: plan.sideEffectBoundary,
        }
      : {}),
    plan: fullDetail ? plan : summarizeRouteLatencyPlan(plan),
    planPolicy: fullDetail
      ? {
          fullDetail,
          routeProbesReturned: plan.routeProbes.length,
          terminalCommandsReturned: plan.terminalCommands.length,
        }
      : {
          fullDetail,
        },
    summary: fullDetail ? latest?.summary || missingRouteLatencySummary() : summarizeRouteLatencyLatestSummary(latest?.summary),
    latestReceiptId: latest?.id || null,
    checkedAt: latest?.checkedAt || null,
    heatmap: fullDetail
      ? latest?.heatmap || { routes: [], terminalCommands: [] }
      : {
          routes: routeHeatmap.slice(0, boundedPreview).map(summarizeRouteSample),
          terminalCommands: terminalHeatmap.slice(0, boundedPreview).map(summarizeTerminalSample),
        },
    heatmapPolicy: {
      fullDetail,
      ...(fullDetail
        ? {
            previewLimit: boundedPreview,
            routeSamplesReturned: routeHeatmap.length,
            terminalSamplesReturned: terminalHeatmap.length,
            fullDetailEndpoint: `${ENDPOINT}?detail=full`,
          }
        : {}),
    },
    slowRouteFrontier: fullDetail ? latest?.slowRouteFrontier || [] : undefined,
    slowTerminalFrontier: fullDetail
      ? latest?.slowTerminalFrontier || []
      : undefined,
    checks: fullDetail ? latest?.checks || [] : undefined,
    checkSummary: fullDetail ? undefined : summarizeRouteLatencyChecks(latest?.checks || [], latest?.summary),
    repairActions: fullDetail ? latest?.repairActions || [] : undefined,
    repairActionSummary: fullDetail ? undefined : summarizeRepairActions(latest?.repairActions || []),
    nonClaims: fullDetail ? latest?.nonClaims || [] : undefined,
    nonClaimCount: fullDetail ? undefined : (latest?.nonClaims || []).length,
    nextAction: fullDetail ? latest?.nextAction || "Run npm run record:route-latency to create the first local route and terminal latency heatmap." : undefined,
    verificationCommand: fullDetail ? "npm run record:route-latency" : undefined,
  };
}

function missingRouteLatencySummary() {
  return {
    score: 0,
    band: "missing",
    routeSamples: 0,
    terminalSamples: 0,
    totalSamples: 0,
    slowRoutes: 0,
    slowTerminalCommands: 0,
    routeP50Ms: 0,
    routeP95Ms: 0,
    terminalP50Ms: 0,
    terminalP95Ms: 0,
    latestReceiptId: null,
  };
}

function buildRouteLatencyHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "route-latency-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary:
      fullDetail
        ? "This endpoint returns full local route-latency receipts and heatmaps. It is local performance evidence only, not production CDN, provider, DNS, hosted latency, or user analytics proof."
        : undefined,
    sourceBoundaryAvailable: undefined,
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local route-latency receipts only and does not run probes, start servers, deploy, publish, contact third parties, or mutate external systems."
        : undefined,
    sideEffectBoundaryAvailable: undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail,
          defaultLimit: 5,
          heatmapPreviewLimit: "all",
          fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
          compactReceiptFields: "full-receipt",
        }
      : {
          fullDetail,
          historyRowsReturned: limited.length,
          heatmapPreviewLimit: 1,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: limited[0]?.id || null,
    },
    receipts: fullDetail
      ? limited
      : limited.map((receipt, index) => summarizeRouteLatencyReceipt(receipt, { includePreview: index === 0, previewLimit: 1 })),
    nextAction: fullDetail ? limited[0]?.nextAction || "Run npm run record:route-latency to create route latency history." : undefined,
    nextActionAvailable: undefined,
    verificationCommand: fullDetail ? "npm run record:route-latency && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: undefined,
  };
}

function summarizeRouteLatencyReceipt(receipt, { includePreview = true, previewLimit = 1 } = {}) {
  const routeHeatmap = receipt?.heatmap?.routes || [];
  const terminalHeatmap = receipt?.heatmap?.terminalCommands || [];
  const slowRoutes = receipt.slowRouteFrontier?.length || 0;
  const slowTerminalCommands = receipt.slowTerminalFrontier?.length || 0;
  const compact = {
    id: receipt.id,
    summary: summarizeRouteLatencyTrendSummary(receipt.summary),
  };
  if (slowRoutes || slowTerminalCommands) {
    compact.slowFrontierSummary = {
      routes: slowRoutes,
      terminalCommands: slowTerminalCommands,
    };
  }
  if (!includePreview) {
    return compact;
  }
  return {
    ...compact,
    checkSummary: summarizeRouteLatencyChecks(receipt.checks || [], receipt.summary),
    heatmapPreview: {
      routes: routeHeatmap.slice(0, previewLimit).map(summarizeHistoryRouteSample),
      terminalCommands: terminalHeatmap.slice(0, previewLimit).map(summarizeHistoryTerminalSample),
    },
  };
}

function summarizeRouteLatencySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    routeSamples: summary.routeSamples || 0,
    terminalSamples: summary.terminalSamples || 0,
    totalSamples: summary.totalSamples || 0,
    slowRoutes: summary.slowRoutes || 0,
    slowTerminalCommands: summary.slowTerminalCommands || 0,
    routeP50Ms: summary.routeP50Ms || 0,
    routeP95Ms: summary.routeP95Ms || 0,
    terminalP50Ms: summary.terminalP50Ms || 0,
    terminalP95Ms: summary.terminalP95Ms || 0,
    slowestRouteMs: summary.slowestRouteMs || 0,
    slowestTerminalMs: summary.slowestTerminalMs || 0,
    totalMeasuredMs: summary.totalMeasuredMs || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    previousReceiptId: summary.previousReceiptId || null,
    previousTotalMeasuredMs: summary.previousTotalMeasuredMs || null,
    measuredDeltaMs: typeof summary.measuredDeltaMs === "number" ? summary.measuredDeltaMs : null,
  };
}

function summarizeRouteLatencyTrendSummary(summary = {}) {
  const compact = {
    score: summary.score || 0,
    routeP95Ms: summary.routeP95Ms || 0,
    terminalP95Ms: summary.terminalP95Ms || 0,
  };
  if (summary.slowRoutes) compact.slowRoutes = summary.slowRoutes;
  if (summary.slowTerminalCommands) compact.slowTerminalCommands = summary.slowTerminalCommands;
  return compact;
}

function summarizeRouteLatencyLatestSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    routeSamples: summary.routeSamples || 0,
    terminalSamples: summary.terminalSamples || 0,
    slowRoutes: summary.slowRoutes || 0,
    slowTerminalCommands: summary.slowTerminalCommands || 0,
    routeP95Ms: summary.routeP95Ms || 0,
    terminalP95Ms: summary.terminalP95Ms || 0,
    totalMeasuredMs: summary.totalMeasuredMs || 0,
  };
}

function summarizeRouteLatencyChecks(checks, summary = {}) {
  const failed = checks.filter((check) => !check.passed).map((check) => check.id);
  const compact = {
    total: summary.checks || checks.length,
    passed: summary.passing || checks.filter((check) => check.passed).length,
  };
  if (failed.length) compact.failed = failed;
  return compact;
}

function summarizeRouteLatencyPlan(plan) {
  return {
    command: plan.command,
    routeProbeCount: plan.routeProbeCount,
    terminalCommandCount: plan.terminalCommandCount,
    fullPlanEndpoint: `${ENDPOINT}/plan?detail=full`,
  };
}

function summarizeRouteProbeCorpus(routeProbes) {
  return {
    methods: countBy(routeProbes, (probe) => probe.method || "GET"),
    expectedStatuses: countBy(routeProbes, (probe) => String(probe.expectedStatus || "unknown")),
    postTargets: routeProbes.filter((probe) => probe.method === "POST").length,
    parameterizedRoutes: routeProbes.filter((probe) => String(probe.route || "").includes(":")).length,
  };
}

function selectRouteProbePreview(routeProbes, limit) {
  const selected = [];
  const seen = new Set();
  for (const target of [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`, "/api/terminal"]) {
    const match = routeProbes.find((probe) => probe.target === target);
    pushProbePreview(selected, seen, match);
  }
  for (const probe of routeProbes) {
    if (selected.length >= limit) break;
    pushProbePreview(selected, seen, probe);
  }
  return selected.map(({ target, method, expectedStatus }) => ({ target, method, expectedStatus }));
}

function pushProbePreview(selected, seen, probe) {
  if (!probe || seen.has(probe.id)) return;
  selected.push(probe);
  seen.add(probe.id);
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function summarizeRouteSample(sample) {
  return {
    rank: sample.rank,
    target: sample.target,
    ms: sample.ms,
    bytes: sample.bytes,
  };
}

function summarizeTerminalSample(sample) {
  return {
    rank: sample.rank,
    command: sample.command,
    ms: sample.ms,
    bytes: sample.bytes,
  };
}

function summarizeHistoryRouteSample(sample) {
  return {
    rank: sample.rank,
    target: sample.target,
    ms: sample.ms,
    bytes: sample.bytes,
  };
}

function summarizeHistoryTerminalSample(sample) {
  return {
    rank: sample.rank,
    command: sample.command,
    ms: sample.ms,
    bytes: sample.bytes,
  };
}

function summarizeRepairActions(actions = []) {
  return {
    total: actions.length,
  };
}

function appendRouteLatencyReceipt(root, receipt) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  const receipts = readRouteLatencyReceipts(root);
  receipts.unshift(receipt);
  writeFileSync(storePath, `${JSON.stringify({ receipts: receipts.slice(0, MAX_RECEIPTS) }, null, 2)}\n`);
  return receipt;
}

function readRouteLatencyReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestRouteLatencyReceipt(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return null;
  try {
    const cacheKey = receiptCacheKey(storePath);
    const cached = latestReceiptCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.receipt;
    const text = readFileSync(storePath, "utf8");
    const receiptsIndex = text.indexOf('"receipts"');
    const arrayStart = receiptsIndex === -1 ? -1 : text.indexOf("[", receiptsIndex);
    const objectStart = arrayStart === -1 ? -1 : text.indexOf("{", arrayStart);
    if (objectStart === -1) return null;
    const objectEnd = findJsonObjectEnd(text, objectStart);
    if (objectEnd === -1) return null;
    const receipt = JSON.parse(text.slice(objectStart, objectEnd + 1));
    latestReceiptCache.set(storePath, { cacheKey, receipt });
    return receipt;
  } catch {
    return null;
  }
}

function readRouteLatencyHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;

    const allReceipts = readRouteLatencyReceipts(root);
    const window = {
      receipts: allReceipts.slice(0, boundedLimit),
      totalAvailable: allReceipts.length,
    };
    historyWindowCache.set(storePath, { cacheKey, window });
    return window;
  } catch {
    return { receipts: [], totalAvailable: 0 };
  }
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 5, 50));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

function findJsonObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function routeLatencyChecks({ plan, routeSamples, terminalSamples, routeHeatmap, terminalHeatmap, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const scripts = packageManifest.scripts || {};
  return [
    check(
      "route-samples",
      routeSamples.length >= Math.min(50, plan.routeProbeCount) && routeSamples.every((sample) => Number.isFinite(sample.ms)),
      "high",
      `${routeSamples.length}/${plan.routeProbeCount} public route latency sample(s).`,
      "Run the route latency recorder against the declared public route surface.",
      "npm run record:route-latency",
    ),
    check(
      "terminal-samples",
      terminalSamples.length === plan.terminalCommandCount && terminalSamples.every((sample) => Number.isFinite(sample.ms)),
      "high",
      `${terminalSamples.length}/${plan.terminalCommandCount} terminal command latency sample(s).`,
      "Run the route latency recorder until every command in the terminal corpus is measured.",
      "npm run record:route-latency",
    ),
    check(
      "heatmap-sorted",
      isSortedByLatency(routeHeatmap) && isSortedByLatency(terminalHeatmap),
      "medium",
      "Route and terminal heatmaps are sorted by measured local latency.",
      "Sort latency heatmaps by descending ms so the next bottleneck is visible.",
      "npm run record:route-latency",
    ),
    check(
      "route-manifest",
      [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => publicRoutes.includes(route)),
      "high",
      `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => publicRoutes.includes(route)).length}/3 route-latency route(s) declared.`,
      "Add route latency report, plan, and history routes to the runtime manifest.",
      "npm run record:runtime-surface",
    ),
    check(
      "refresh-plan",
      refreshEndpoints.includes(ENDPOINT),
      "medium",
      `${ENDPOINT} ${refreshEndpoints.includes(ENDPOINT) ? "covered" : "missing"} in evidence refresh plan.`,
      "Add route latency to safe evidence refresh.",
      "npm run refresh:evidence",
    ),
    check(
      "script-coverage",
      Boolean(scripts["record:route-latency"]),
      "medium",
      `record:route-latency=${Boolean(scripts["record:route-latency"])}`,
      "Add the record:route-latency package script.",
      "npm run record:route-latency",
    ),
    check(
      "public-safe-boundary",
      routeSamples.every((sample) => !String(sample.target).startsWith("/api/private")) &&
        terminalSamples.every((sample) => !/outreach|approve|private/i.test(sample.command)),
      "high",
      "Latency corpus avoids private cockpit routes and private/write-like terminal commands.",
      "Keep route latency probes limited to public-safe route and terminal surfaces.",
      "npm run record:route-latency && npm run check",
    ),
  ];
}

function normalizeRouteSample(sample) {
  return {
    id: sample.id,
    route: sample.route,
    target: sample.target,
    method: sample.method || "GET",
    expectedStatus: sample.expectedStatus,
    status: sample.status,
    passed: Boolean(sample.passed),
    ms: Math.max(0, Math.round(sample.ms || 0)),
    bytes: sample.bytes || 0,
    detail: sample.detail || "",
  };
}

function normalizeTerminalSample(sample) {
  return {
    command: sample.command,
    status: sample.status,
    passed: Boolean(sample.passed),
    ms: Math.max(0, Math.round(sample.ms || 0)),
    bytes: sample.bytes || 0,
    detail: sample.detail || "",
  };
}

function sortByLatency(samples) {
  return [...samples].sort((left, right) => right.ms - left.ms || String(left.target || left.command).localeCompare(String(right.target || right.command)));
}

function percentile(samples, percentileValue) {
  const values = samples.map((sample) => sample.ms).filter(Number.isFinite).sort((left, right) => left - right);
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.ceil((percentileValue / 100) * values.length) - 1);
  return values[index];
}

function sumMs(samples) {
  return samples.reduce((sum, sample) => sum + (Number.isFinite(sample.ms) ? sample.ms : 0), 0);
}

function isSortedByLatency(samples) {
  return samples.every((sample, index) => index === 0 || samples[index - 1].ms >= sample.ms);
}

function recommendedRepairs({ routeHeatmap, terminalHeatmap }) {
  return [
    ...routeHeatmap.slice(0, 5).map((sample) => ({
      id: `route.${slugify(sample.target)}`,
      priority: sample.ms >= ROUTE_WARN_MS ? "high" : "medium",
      action: `Inspect ${sample.target} for synchronous recomputation or missing receipt-backed fast path.`,
      verificationCommand: "npm run record:route-latency && npm run record:runtime-surface",
    })),
    ...terminalHeatmap.slice(0, 5).map((sample) => ({
      id: `terminal.${slugify(sample.command)}`,
      priority: sample.ms >= TERMINAL_WARN_MS ? "high" : "medium",
      action: `Inspect terminal command "${sample.command}" for expensive report recomputation or missing cached summary output.`,
      verificationCommand: "npm run record:route-latency && node --test test/api-contract.test.mjs",
    })),
  ];
}

function nextLatencyAction({ routeHeatmap, terminalHeatmap }) {
  const slowestRoute = routeHeatmap[0];
  const slowestTerminal = terminalHeatmap[0];
  if (!slowestRoute && !slowestTerminal) return "Run npm run record:route-latency to collect the first route and terminal heatmap.";
  if ((slowestRoute?.ms || 0) >= (slowestTerminal?.ms || 0)) {
    return `Convert or optimize ${slowestRoute.target} next; it is the slowest measured route at ${slowestRoute.ms}ms.`;
  }
  return `Convert or optimize terminal command "${slowestTerminal.command}" next; it is the slowest measured command at ${slowestTerminal.ms}ms.`;
}

function check(id, passed, severity, detail, repairAction, verificationCommand) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function weightedScore(checks) {
  const weights = { high: 7, medium: 4, low: 2 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function slugify(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function emptyRouteManifest() {
  return {
    publicApiRoutes: [],
    privateApiRoutes: [],
    staticRoutes: [],
    privateGate: { publicDefaultStatus: 404 },
  };
}

module.exports = {
  appendRouteLatencyReceipt,
  buildRouteLatencyPlanResponse,
  buildRouteLatencyHistory,
  buildRouteLatencyLatest,
  buildRouteLatencyReport,
  readLatestRouteLatencyReceipt,
  readRouteLatencyHistoryWindow,
  readRouteLatencyReceipts,
  routeLatencyPlan,
  routeLatencyTerminalCommands,
};
