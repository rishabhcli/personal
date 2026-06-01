const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const STORE_RELATIVE_PATH = path.join("var", "runtime-surface-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();
const summaryPlanEndpoint = "/api/runtime-surface/plan";
const fullPlanEndpoint = "/api/runtime-surface/plan?detail=full";
const planPreviewLimit = 4;
const planMilestoneTargets = [
  "/api/runtime-surface/latest",
  "/api/route-latency",
  "/api/terminal",
  "/api/private/cockpit",
];

function runtimeSurfacePlan(routeManifest = emptyRouteManifest()) {
  const probes = buildRuntimeSurfaceProbes(routeManifest);
  return {
    mode: "runtime-surface-diff-plan",
    command: "npm run record:runtime-surface",
    scheduleRecommendation:
      "Run after changing server routes, route manifests, private gates, runtime truth endpoints, static assets, or deploy rewrites.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, probes declared public/static routes, confirms private routes return 404 by default, writes a local receipt under var/, and does not deploy, publish, contact third parties, or enable private cockpit data.",
    receiptStore: STORE_RELATIVE_PATH,
    routeInventory: routeInventory(routeManifest, probes),
    probes: probes.map(serializePlanProbe),
  };
}

function buildRuntimeSurfacePlanResponse({ routeManifest = emptyRouteManifest(), detail = "summary" } = {}) {
  const plan = runtimeSurfacePlan(routeManifest);
  const isFullDetail = String(detail || "").toLowerCase() === "full";
  if (isFullDetail) {
    return {
      ...plan,
      detail: "full",
      compact: false,
      summaryPlanEndpoint,
    };
  }
  return summarizeRuntimeSurfacePlan(plan);
}

function buildRuntimeSurfaceProbes(routeManifest = emptyRouteManifest()) {
  const probes = [];
  for (const route of routeManifest.publicApiRoutes || []) {
    probes.push(probeForRoute({ group: "public-api", route, expectedStatus: 200 }));
  }
  for (const route of routeManifest.staticRoutes || []) {
    probes.push(probeForRoute({ group: "static", route, expectedStatus: 200 }));
  }
  for (const route of routeManifest.privateApiRoutes || []) {
    probes.push(probeForRoute({ group: "private-gate", route, expectedStatus: routeManifest.privateGate?.publicDefaultStatus || 404 }));
  }

  const seen = new Set();
  return probes.filter((probe) => {
    const key = `${probe.method} ${probe.target} ${probe.expectedStatus}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRuntimeSurfaceReport({ baseUrl, routeManifest = emptyRouteManifest(), checks = [] }) {
  const expectedProbes = buildRuntimeSurfaceProbes(routeManifest);
  const checksById = new Map(checks.map((check) => [check.id, check]));
  const normalizedChecks = expectedProbes.map((probe) => normalizeCheck(probe, checksById.get(probe.id)));
  const unexpectedChecks = checks.filter((check) => !expectedProbes.some((probe) => probe.id === check.id));
  const failing = normalizedChecks.filter((check) => !check.passed);
  const statusMismatches = normalizedChecks.filter((check) => check.actualStatus !== "missing" && check.actualStatus !== check.expectedStatus);
  const groups = summarizeGroups(normalizedChecks);
  const score = normalizedChecks.length ? Math.round((normalizedChecks.filter((check) => check.passed).length / normalizedChecks.length) * 100) : 0;

  return {
    id: `surface-${Date.now().toString(36)}`,
    mode: "runtime-surface-diff",
    checkedAt: new Date().toISOString(),
    baseUrl,
    sourceBoundary:
      "This report compares the declared route manifest with a temporary local server probe. It proves local reachability and default private gating, not CDN cache state, provider routing, or production deploy identity.",
    sideEffectBoundary: runtimeSurfacePlan(routeManifest).sideEffectBoundary,
    manifest: routeInventory(routeManifest, expectedProbes),
    summary: {
      score,
      band: score >= 95 ? "high" : score >= 80 ? "medium" : "low",
      total: normalizedChecks.length,
      passing: normalizedChecks.length - failing.length,
      failing: failing.length,
      unexpected: unexpectedChecks.length,
      publicApiPassing: groups["public-api"]?.passing || 0,
      staticPassing: groups.static?.passing || 0,
      privateGatePassing: groups["private-gate"]?.passing || 0,
    },
    diff: {
      declarationTargets: expectedProbes.length,
      probedTargets: checks.length,
      missingProbeTargets: normalizedChecks.filter((check) => check.actualStatus === "missing").map((check) => check.target),
      statusMismatches: statusMismatches.map(({ id, group, route, target, expectedStatus, actualStatus, detail }) => ({
        id,
        group,
        route,
        target,
        expectedStatus,
        actualStatus,
        detail,
      })),
      interpretation: interpretSurfaceDiff({ failing, statusMismatches, unexpectedChecks }),
    },
    groups,
    checks: normalizedChecks,
    unexpectedChecks,
    nextAction: failing.length
      ? `Repair ${failing[0].target}: expected ${failing[0].expectedStatus}, saw ${failing[0].actualStatus}.`
      : "Runtime surface matches the declared local route manifest; rerun after route or static asset changes.",
  };
}

function buildRuntimeSurfaceLatest({ routeManifest = emptyRouteManifest(), history = [], detail = "summary" } = {}) {
  const latest = history[0] || null;
  const plan = runtimeSurfacePlan(routeManifest);
  const evidence = runtimeSurfaceEvidenceIndex({ plan, latest });
  const isFullDetail = detail === "full";
  const sourceBoundary =
    "This endpoint reports the latest local runtime surface receipt. It does not perform live probes during the request and does not enable private cockpit routes.";

  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-surface-latest",
    detail: isFullDetail ? "full" : "summary",
    compact: !isFullDetail,
    ...(isFullDetail ? { sourceBoundary } : { sourceBoundaryAvailable: Boolean(sourceBoundary) }),
    plan: isFullDetail ? plan : summarizeRuntimeSurfaceLatestPlan(plan),
    latest: isFullDetail || !latest ? latest : summarizeRuntimeSurfaceLatestReceipt(latest),
    evidence: isFullDetail ? evidence : summarizeRuntimeSurfaceEvidenceIndex(evidence),
    nextAction: latest
      ? latest.nextAction
      : "Run npm run record:runtime-surface to create the first local route-manifest reachability receipt.",
  };
}

function summarizeRuntimeSurfacePlan(plan) {
  const probeGroups = plan.probes.reduce((groups, probe) => {
    if (!groups[probe.group]) {
      groups[probe.group] = {
        group: probe.group,
        targets: 0,
        expectedStatuses: {},
        methods: {},
      };
    }
    groups[probe.group].targets += 1;
    groups[probe.group].expectedStatuses[probe.expectedStatus] =
      (groups[probe.group].expectedStatuses[probe.expectedStatus] || 0) + 1;
    groups[probe.group].methods[probe.method] = (groups[probe.group].methods[probe.method] || 0) + 1;
    return groups;
  }, {});

  return {
    mode: plan.mode,
    command: plan.command,
    detail: "summary",
    compact: true,
    probeTargets: plan.probes.length,
    probeGroups: summarizeProbeGroups(probeGroups),
    probePreview: selectRuntimeSurfacePlanPreview(plan.probes),
    fullPlanEndpoint,
  };
}

function summarizeProbeGroups(groups) {
  const publicApi = groups["public-api"] || {};
  const staticRoutes = groups.static || {};
  const privateGate = groups["private-gate"] || {};
  return {
    publicApi: publicApi.targets || 0,
    static: staticRoutes.targets || 0,
    privateGate: privateGate.targets || 0,
    postTargets: Object.entries(groups).reduce((total, [, group]) => total + (group.methods?.POST || 0), 0),
    privateDefaultStatus: Number(Object.keys(privateGate.expectedStatuses || {})[0] || 404),
  };
}

function summarizeRuntimeSurfaceLatestPlan(plan) {
  return {
    mode: plan.mode,
    command: plan.command,
    detail: "summary",
    compact: true,
    receiptStore: plan.receiptStore,
    routeInventory: plan.routeInventory,
    probeTargets: plan.probes.length,
    fullPlanEndpoint,
  };
}

function runtimeSurfaceEvidenceIndex({ plan, latest }) {
  return {
    receiptStore: STORE_RELATIVE_PATH,
    summaryPlanEndpoint,
    fullProbePlanEndpoint: fullPlanEndpoint,
    summarizedHistoryEndpoint: "/api/runtime-surface/history",
    fullLatestEndpoint: "/api/runtime-surface/latest?detail=full",
    latestReceiptId: latest?.id || null,
    latestCheckedAt: latest?.checkedAt || null,
    fullCheckCount: latest?.checks?.length || 0,
    fullProbeCount: plan.probes.length,
    retainedLocalReceipts: maxReceipts,
    proofBoundaryAvailable: true,
  };
}

function summarizeRuntimeSurfaceEvidenceIndex(evidence) {
  return {
    fullProbePlanEndpoint: evidence.fullProbePlanEndpoint,
    fullLatestEndpoint: evidence.fullLatestEndpoint,
    latestReceiptId: evidence.latestReceiptId,
    fullCheckCount: evidence.fullCheckCount,
    fullProbeCount: evidence.fullProbeCount,
  };
}

function selectRuntimeSurfacePlanPreview(probes, limit = planPreviewLimit) {
  const selected = [];
  const seen = new Set();
  const add = (probe) => {
    if (!probe || seen.has(probe.id) || selected.length >= limit) return;
    seen.add(probe.id);
    selected.push(summarizePlanPreviewProbe(probe));
  };

  for (const target of planMilestoneTargets) {
    add(probes.find((probe) => probe.target === target));
  }

  for (const group of ["public-api", "static", "private-gate"]) {
    for (const probe of probes.filter((item) => item.group === group).slice(0, 4)) {
      add(probe);
    }
  }

  for (const probe of probes) add(probe);
  return selected;
}

function serializePlanProbe({ id, group, route, target, method, expectedStatus }) {
  return {
    id,
    group,
    route,
    target,
    method,
    expectedStatus,
  };
}

function summarizePlanPreviewProbe({ target, method, expectedStatus }) {
  return {
    target,
    method,
    expectedStatus,
  };
}

function buildRuntimeSurfaceHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const sourceBoundary =
    "This endpoint returns full local runtime-surface receipts. It reads local receipt history only and does not run probes.";
  const compactSourceBoundary =
    "This endpoint returns summarized local runtime-surface receipts so history reads stay lightweight. Full probe details remain in the local receipt store and /api/runtime-surface/history?detail=full.";
  const sideEffectBoundary =
    "The history endpoint reads local runtime-surface receipts only and does not run probes, start servers, deploy, publish, contact third parties, or enable private cockpit routes.";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "runtime-surface-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? { sourceBoundary, sideEffectBoundary }
      : {
          sourceBoundaryAvailable: Boolean(compactSourceBoundary),
          sideEffectBoundaryAvailable: Boolean(sideEffectBoundary),
        }),
    ...(fullDetail ? { receiptStore: STORE_RELATIVE_PATH } : {}),
    fullDetailEndpoint: "/api/runtime-surface/history?detail=full",
    historyPayloadPolicy: runtimeSurfaceHistoryPayloadPolicy({ fullDetail, returned: limited.length }),
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: limited[0]?.id || null,
      latestScore: limited[0]?.summary?.score || 0,
    },
    receipts: fullDetail ? limited : limited.map(summarizeRuntimeSurfaceHistoryReceipt),
    nextAction: fullDetail ? limited[0]?.nextAction || "Run npm run record:runtime-surface to create runtime surface history." : undefined,
    ...(fullDetail ? {} : { nextActionAvailable: Boolean(limited[0]?.nextAction) }),
    verificationCommand: fullDetail ? "npm run record:runtime-surface && node --test test/api-contract.test.mjs" : undefined,
    ...(fullDetail ? { verificationCommandAvailable: true } : {}),
  };
}

function runtimeSurfaceHistoryPayloadPolicy({ fullDetail, returned }) {
  if (fullDetail) {
    return {
      fullDetail: true,
      defaultLimit: 5,
      fullDetailDefaultLimit: 20,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail: false,
    receiptsReturned: returned,
    fullDetailAvailable: true,
    olderReceiptsTrendOnly: true,
  };
}

function summarizeRuntimeSurfaceHistoryReceipt(receipt, index) {
  if (index > 0) {
    return {
      id: receipt.id,
      summary: summarizeRuntimeSurfaceReceiptSummary(receipt.summary),
      trendOnly: true,
    };
  }
  return summarizeRuntimeSurfaceReceipt(receipt);
}

function summarizeRuntimeSurfaceReceipt(receipt) {
  const groups = receipt.groups || {};
  const diff = receipt.diff || {};
  return {
    id: receipt.id,
    summary: summarizeRuntimeSurfaceReceiptSummary(receipt.summary),
    groupSummary: {
      publicApi: summarizeGroup(groups["public-api"]),
      static: summarizeGroup(groups.static),
      privateGate: summarizeGroup(groups["private-gate"]),
    },
    diffSummary: {
      missingProbeTargetCount: (diff.missingProbeTargets || []).length,
      statusMismatchCount: (diff.statusMismatches || []).length,
      interpretationAvailable: Boolean(diff.interpretation),
    },
    unexpectedCheckCount: (receipt.unexpectedChecks || []).length,
    nextActionAvailable: Boolean(receipt.nextAction),
  };
}

function summarizeRuntimeSurfaceReceiptSummary(summary = {}) {
  return {
    score: summary.score || 0,
    passing: summary.passing || 0,
    total: summary.total || 0,
    failing: summary.failing || 0,
  };
}

function summarizeRuntimeSurfaceLatestReceipt(receipt) {
  const diff = receipt.diff || {};
  return {
    id: receipt.id,
    checkedAt: receipt.checkedAt,
    summary: receipt.summary,
    diffSummary: {
      declarationTargets: diff.declarationTargets || 0,
      probedTargets: diff.probedTargets || 0,
      missingProbeTargetCount: (diff.missingProbeTargets || []).length,
      statusMismatchCount: (diff.statusMismatches || []).length,
    },
    unexpectedCheckCount: (receipt.unexpectedChecks || []).length,
    nextActionAvailable: Boolean(receipt.nextAction),
  };
}

function summarizeGroup(group = {}) {
  return {
    total: group.total || 0,
    passing: group.passing || 0,
  };
}

function appendRuntimeSurfaceReceipt(root, report) {
  const receipts = readRuntimeSurfaceReceipts(root);
  receipts.unshift(report);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return report;
}

function readRuntimeSurfaceReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestRuntimeSurfaceReceipt(root) {
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

function readRuntimeSurfaceHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const allReceipts = readRuntimeSurfaceReceipts(root);
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
  return Math.max(1, Math.min(Number(limit) || 20, 50));
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

function probeForRoute({ group, route, expectedStatus }) {
  const method = route === "/api/terminal" ? "POST" : "GET";
  const target = concreteTarget(route);
  return {
    id: `${group}:${method}:${target}`,
    group,
    route,
    target,
    method,
    expectedStatus,
    body: route === "/api/terminal" ? { command: "runtime-surface" } : null,
  };
}

function concreteTarget(route) {
  const routeSamples = {
    "/api/evidence/:slug": "/api/evidence/qagent",
    "/api/claims/:id": "/api/claims/project.qagent.outcome",
    "/api/opportunity-packages/:id": "/api/opportunity-packages/agent-infra-internship",
    "/api/opportunity-board/:id": "/api/opportunity-board/agent-infra-internship",
    "/api/opportunity-derisking/:id": "/api/opportunity-derisking/agent-infra-internship",
    "/api/opportunity-ranking/:id": "/api/opportunity-ranking/agent-infra-internship",
    "/api/opportunity-scorecard/:id": "/api/opportunity-scorecard/agent-infra-internship",
    "/api/artifact-collections/:id": "/api/artifact-collections/proof-strongest",
    "/api/artifact-transcripts/:slug": "/api/artifact-transcripts/qagent",
    "/api/intents/:id": "/api/intents/recruiter",
    "/api/proof-trials/:slug": "/api/proof-trials/qagent",
    "/api/packets/:audience": "/api/packets/recruiter",
    "/api/narratives/:audience": "/api/narratives/recruiter",
    "/api/narrative-contrast/:id": "/api/narrative-contrast/recruiter-vs-professor",
    "/api/self-review/:cadence": "/api/self-review/weekly",
    "/api/weaknesses/:slug": "/api/weaknesses/qagent",
    "/api/skill-gaps/:skill": "/api/skill-gaps/ai-agents",
    "/api/waves/:number": "/api/waves/41",
    "/api/case-study/:slug": "/api/case-study/qagent",
    "/api/og/:slug.svg": "/api/og/qagent.svg",
    "/api/private/briefing-drafts/:id": "/api/private/briefing-drafts/proof-repair-brief",
  };
  if (routeSamples[route]) return routeSamples[route];
  return route
    .replace(":audience", "recruiter")
    .replace(":cadence", "weekly")
    .replace(":number", "41")
    .replace(":skill", "ai-agents")
    .replace(":slug.svg", "qagent.svg")
    .replace(":slug", "qagent")
    .replace(":id", "recruiter-vs-professor");
}

function normalizeCheck(probe, actual) {
  const actualStatus = actual ? actual.status : "missing";
  return {
    id: probe.id,
    group: probe.group,
    route: probe.route,
    target: probe.target,
    method: probe.method,
    expectedStatus: probe.expectedStatus,
    actualStatus,
    passed: actualStatus === probe.expectedStatus,
    responseOk: actual ? actual.responseOk : false,
    ms: actual ? actual.ms : 0,
    contentType: actual ? actual.contentType : "missing",
    detail: actual ? actual.detail : "Probe was not executed.",
  };
}

function summarizeGroups(checks) {
  return checks.reduce((groups, check) => {
    if (!groups[check.group]) {
      groups[check.group] = { total: 0, passing: 0, failing: 0 };
    }
    groups[check.group].total += 1;
    if (check.passed) groups[check.group].passing += 1;
    else groups[check.group].failing += 1;
    return groups;
  }, {});
}

function routeInventory(routeManifest, probes) {
  return {
    publicApiRoutes: (routeManifest.publicApiRoutes || []).length,
    privateApiRoutes: (routeManifest.privateApiRoutes || []).length,
    staticRoutes: (routeManifest.staticRoutes || []).length,
    probeTargets: probes.length,
    privateDefaultStatus: routeManifest.privateGate?.publicDefaultStatus || 404,
  };
}

function interpretSurfaceDiff({ failing, statusMismatches, unexpectedChecks }) {
  if (!failing.length && !unexpectedChecks.length) return "Declared runtime surface and local probe results match.";
  if (statusMismatches.some((check) => check.group === "private-gate")) {
    return "At least one private route did not return the expected public-default status. Recheck ENABLE_PRIVATE_COCKPIT and localhost gating before publishing.";
  }
  if (statusMismatches.length) return "At least one declared route returned an unexpected status. Update the route manifest or repair the server route.";
  return "The recorder did not execute every declared route probe. Rerun the recorder and inspect temporary server logs.";
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
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
  appendRuntimeSurfaceReceipt,
  buildRuntimeSurfacePlanResponse,
  buildRuntimeSurfaceHistory,
  buildRuntimeSurfaceLatest,
  buildRuntimeSurfaceProbes,
  buildRuntimeSurfaceReport,
  readLatestRuntimeSurfaceReceipt,
  readRuntimeSurfaceHistoryWindow,
  readRuntimeSurfaceReceipts,
  runtimeSurfacePlan,
};
