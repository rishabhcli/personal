const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/runtime-diff";
const STORE_RELATIVE_PATH = path.join("var", "runtime-diff-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function runtimeDiffPlan() {
  return {
    mode: "runtime-diff-plan",
    command: "npm run diff:runtime",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after recording runtime truth, changing inline builds, route manifests, private gates, Node major versions, domain declarations, or receipt reconciliation inputs.",
    sideEffectBoundary:
      "The diff recorder starts a temporary local server, reads public-safe runtime diff endpoints, writes a local receipt under var/, and does not deploy, publish, mutate git history, enable private cockpit data, query provider dashboards, or contact third parties.",
  };
}

function buildRuntimeDiffReport({
  runtimeReport,
  runtimeTruthReceipts = [],
  runtimeAttestation,
  runtimeReconciliation,
  runtimeSurface,
  refreshPlan,
  routeManifest,
  packageManifest = {},
  receipts = [],
}) {
  const historyWindow = buildHistoryWindow(runtimeTruthReceipts, runtimeReport);
  const classifiedChanges = classifyChanges(runtimeReport.diff?.changes || []);
  const lanes = driftLanes({
    runtimeReport,
    runtimeAttestation,
    runtimeReconciliation,
    runtimeSurface,
    refreshPlan,
    routeManifest,
    packageManifest,
    historyWindow,
    classifiedChanges,
  });
  const checks = runtimeDiffChecks({
    runtimeReport,
    runtimeReconciliation,
    runtimeSurface,
    refreshPlan,
    routeManifest,
    packageManifest,
    historyWindow,
    classifiedChanges,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-diff",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report classifies local runtime fingerprint drift using public-safe runtime truth receipts, route-surface receipts, reconciliation state, route manifests, refresh plans, and package scripts. It does not prove CDN cache state, deploy-provider identity, hosted uptime, private cockpit contents, or third-party account state.",
    sideEffectBoundary:
      "This endpoint reads local public-safe runtime reports and receipt files only. It does not start recorders, deploy, publish, mutate git history, enable private routes, query provider dashboards, or contact third parties.",
    plan: runtimeDiffPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      lanes: lanes.length,
      passingLanes: lanes.filter((lane) => lane.passed).length,
      identityChanges: runtimeReport.diff?.summary?.identityChanged || 0,
      volatileChanges: runtimeReport.diff?.summary?.volatileChanged || 0,
      changed: runtimeReport.diff?.summary?.changed || 0,
      staleReceiptKinds: runtimeReconciliation.summary?.staleReceiptKinds || 0,
      historyReceipts: historyWindow.length,
      latestRuntimeReceiptId: runtimeReport.previous?.id || null,
      latestReceiptId: latestReceipt?.id || null,
      routeCovered: requiredRoutes().every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
    },
    current: {
      identityHash: runtimeReport.current.identityHash,
      volatileHash: runtimeReport.current.volatileHash,
      readinessScore: runtimeReport.readiness.score,
      readinessBand: runtimeReport.readiness.band,
      interpretation: runtimeReport.diff?.interpretation || "No runtime diff interpretation available.",
    },
    previous: runtimeReport.previous,
    driftMatrix: {
      classification: classifySummary(runtimeReport),
      changes: classifiedChanges,
      identityInputs: runtimeReport.current.hashInputs.identity,
      volatileInputs: runtimeReport.current.hashInputs.volatile,
      receiptFreshness: runtimeReconciliation.receiptMatrix || [],
      routeSurface: runtimeReconciliation.driftMatrix?.routeSurface || null,
      evidenceRefresh: runtimeReconciliation.driftMatrix?.evidenceRefresh || null,
    },
    lanes,
    historyWindow,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nonClaims: [
      "Does not prove remote deploy-provider identity unless the hosted runtime exposes comparable public endpoints.",
      "Does not prove CDN cache, DNS propagation, uptime, dashboards, private cockpit data, or third-party account state.",
      "Does not treat volatile local PID, port, host, or Node patch changes as production identity drift.",
      "Does not deploy, publish, contact external services, submit forms, or enable private routes.",
    ],
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    nextAction: failing[0]?.repairAction || "Runtime diff is classified and current; rerun after runtime, route, build, domain, or receipt changes.",
    verificationCommand: "npm run diff:runtime && npm run check && npm run verify",
  };
}

function buildRuntimeDiffReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "runtime-diff-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "runtime-diff" ||
    !report.summary ||
    !report.current ||
    !report.current.identityHash ||
    !report.driftMatrix ||
    !Array.isArray(report.lanes) ||
    !report.lanes.every((lane) => lane.id && lane.label && lane.detail && lane.verificationCommand) ||
    !Array.isArray(report.historyWindow) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand) ||
    !Array.isArray(report.nonClaims) ||
    !report.nextAction ||
    !report.verificationCommand
  ) {
    return null;
  }

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs runtime diff from the latest local receipt. It proves local receipt-backed drift classification only; it is not fresh hosted production, CDN, DNS, provider, uptime, private-cockpit, or third-party account proof.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || runtimeDiffPlan().sideEffectBoundary,
    plan: runtimeDiffPlan(),
    summary: {
      ...report.summary,
      latestReceiptId: receipt.id,
    },
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || report.summary.score || 0,
      passing: receipt.summary?.passing || report.summary.passing || 0,
      checks: receipt.summary?.checks || report.summary.checks || 0,
    },
    verificationCommand: report.verificationCommand || "npm run diff:runtime && npm run check && npm run verify",
  };
}

function buildRuntimeDiffResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      runtimeDiffPayloadPolicy: runtimeDiffPayloadPolicy({ report, fullDetail }),
    };
  }

  const historySummary = summarizeRuntimeHistoryWindow(report.historyWindow || []);
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy,
    refreshEndpoint: report.refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeRuntimeDiffResponseSummary(report.summary),
    current: summarizeRuntimeDiffCurrent(report.current),
    driftSummary: summarizeRuntimeDriftMatrix(report.driftMatrix || {}),
    laneSummary: summarizeRuntimeDiffLanes(report.lanes || [], { includeProof: true }),
    historySummary,
    checkSummary: summarizeRuntimeDiffChecks(report.checks || []),
    nonClaimCount: (report.nonClaims || []).length,
    runtimeDiffPayloadPolicy: runtimeDiffPayloadPolicy({ report, fullDetail }),
  };
}

function summarizeRuntimeDiffCurrent(current = {}) {
  return {
    identityHash: current.identityHash || null,
    readinessScore: current.readinessScore || 0,
  };
}

function summarizeRuntimeDiffLane(lane) {
  return {
    id: lane.id,
    passed: Boolean(lane.passed),
  };
}

function summarizeRuntimeDiffCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function summarizeRuntimeDiffChecks(checks = []) {
  const failed = checks.filter((check) => !check.passed);
  return {
    total: checks.length,
    passing: checks.length - failed.length,
    failing: failed.length,
    changeClassificationPassed: Boolean(checks.find((check) => check.id === "change-classification")?.passed),
    routeManifestPassed: Boolean(checks.find((check) => check.id === "route-manifest")?.passed),
    detailAvailable: checks.some((check) => Boolean(check.detail)),
    repairActionAvailable: checks.some((check) => Boolean(check.repairAction)),
    commandAvailable: checks.some((check) => Boolean(check.verificationCommand)),
  };
}

function runtimeDiffPayloadPolicy({ report, fullDetail }) {
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
      lanesAvailable: report.lanes?.length || 0,
      historyRowsAvailable: report.historyWindow?.length || 0,
      checksAvailable: report.checks?.length || 0,
      repairActionsAvailable: report.repairActions?.length || 0,
      nonClaimsAvailable: report.nonClaims?.length || 0,
    };
  }
  return {
    fullDetail,
    compact: false,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    lanesReturned: report.lanes?.length || 0,
    historyWindowRowsAvailable: report.historyWindow?.length || 0,
    historyWindowRowsReturned: report.historyWindow?.length || 0,
    checksReturned: report.checks?.length || 0,
    repairActionsAvailable: report.repairActions?.length || 0,
    repairActionsReturned: report.repairActions?.length || 0,
    nonClaimsAvailable: report.nonClaims?.length || 0,
    nonClaimsReturned: report.nonClaims?.length || 0,
    omittedFromSummary: [],
  };
}

function appendRuntimeDiffReceipt(root, receipt) {
  const receipts = readRuntimeDiffReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function buildRuntimeDiffHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "runtime-diff-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local runtime-diff receipts. It does not start recorders, deploy, publish, mutate git history, enable private routes, query provider dashboards, or contact third parties.",
        }
      : {}),
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local runtime-diff receipts only. It does not start recorders, deploy, publish, mutate git history, enable private routes, query provider dashboards, or contact third parties."
        : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          fullDetail,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
          omittedFromDefaultCount: 6,
        }
      : {
          fullDetail,
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
    },
    definitions: fullDetail ? undefined : summarizeRuntimeDiffDefinitions(latest),
    receipts: fullDetail
      ? limited
      : limited.map((receipt, index) => (index === 0 ? summarizeRuntimeDiffReceipt(receipt) : summarizeRuntimeDiffTrendReceipt(receipt))),
    nextAction: fullDetail
      ? limited[0]
        ? "Runtime diff history is available; run npm run diff:runtime after runtime, route, build, domain, or receipt changes."
        : "Run npm run diff:runtime to create runtime diff history."
      : undefined,
    verificationCommand: fullDetail ? "npm run diff:runtime && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeRuntimeDiffDefinitions(receipt) {
  const report = receipt?.report || receipt || {};
  const lanes = nonEmptyArray(receipt?.lanes) || nonEmptyArray(report.lanes) || [];
  const checks = nonEmptyArray(receipt?.checks) || nonEmptyArray(report.checks) || [];
  const nonClaims = nonEmptyArray(receipt?.nonClaims) || nonEmptyArray(report.nonClaims) || [];
  return {
    lanes: {
      total: lanes.length,
      sentinelIds: lanes.some((lane) => lane.id === "identity") ? ["identity"] : lanes.slice(0, 1).map((lane) => lane.id),
      verificationCommandCount: lanes.filter((lane) => Boolean(lane.verificationCommand)).length,
    },
    checks: {
      total: checks.length,
      sentinelIds: checks.some((check) => check.id === "route-manifest") ? ["route-manifest"] : checks.slice(0, 1).map((check) => check.id),
      verificationCommandCount: checks.filter((check) => Boolean(check.verificationCommand)).length,
    },
    nonClaimCount: nonClaims.length,
  };
}

function readRuntimeDiffReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestRuntimeDiffReceipt(root) {
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

function readRuntimeDiffHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readRuntimeDiffReceipts(root);
    const window = {
      receipts: receipts.slice(0, boundedLimit),
      totalAvailable: receipts.length,
    };
    historyWindowCache.set(storePath, { cacheKey, window });
    return window;
  } catch {
    return { receipts: [], totalAvailable: 0 };
  }
}

function summarizeRuntimeDiffReceipt(receipt) {
  const report = receipt.report || {};
  const summary = receipt.summary || report.summary || {};
  const current = receipt.current || report.current || {};
  const previous = receipt.previous || report.previous || null;
  const driftMatrix = receipt.driftMatrix || report.driftMatrix || {};
  const lanes = nonEmptyArray(receipt.lanes) || nonEmptyArray(report.lanes) || [];
  const historyWindow = Array.isArray(receipt.historyWindow) ? receipt.historyWindow : report.historyWindow || [];
  const checks = nonEmptyArray(receipt.checks) || nonEmptyArray(report.checks) || [];
  const nonClaims = nonEmptyArray(receipt.nonClaims) || nonEmptyArray(report.nonClaims) || [];
  return {
    id: receipt.id,
    summary: summarizeRuntimeDiffSummary(summary, { lanes, historyWindow }),
    current: {
      identityHash: current.identityHash || null,
      readinessScore: current.readinessScore || 0,
      previousIdentityMatches: previous
        ? (previous.identityHash || previous.fingerprint?.identityHash || null) === (current.identityHash || null)
        : false,
    },
    driftSummary: summarizeRuntimeDriftMatrixForHistory(driftMatrix),
    laneSummary: summarizeRuntimeDiffLanes(lanes),
    historySummary: summarizeRuntimeHistoryWindow(historyWindow),
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    },
    nonClaimCount: nonClaims.length,
  };
}

function summarizeRuntimeDiffTrendReceipt(receipt) {
  const report = receipt.report || {};
  const summary = receipt.summary || report.summary || {};
  return {
    id: receipt.id,
    trendOnly: true,
    ...summarizeRuntimeDiffTrendSummary(summary),
  };
}

function summarizeRuntimeDiffTrendSummary(summary = {}) {
  return {
    score: summary.score || 0,
    failing: summary.failing || 0,
    changed: summary.changed || 0,
    identityChanges: summary.identityChanges || 0,
    volatileChanges: summary.volatileChanges || 0,
  };
}

function summarizeRuntimeDiffResponseSummary(summary = {}) {
  return {
    score: summary.score || 0,
    checks: summary.checks || 0,
    failing: summary.failing || 0,
    lanes: summary.lanes || 0,
    identityChanges: summary.identityChanges || 0,
    volatileChanges: summary.volatileChanges || 0,
    changed: summary.changed || 0,
    staleReceiptKinds: summary.staleReceiptKinds || 0,
    historyReceipts: summary.historyReceipts || 0,
    latestReceiptId: summary.latestReceiptId || null,
    routeCovered: Boolean(summary.routeCovered),
    refreshCovered: Boolean(summary.refreshCovered),
  };
}

function summarizeRuntimeDiffLanes(lanes = [], { includeProof = false } = {}) {
  const lowBand = lanes.filter((lane) => lane.band === "low").length;
  const summary = {
    total: lanes.length,
    passing: lanes.filter((lane) => lane.passed).length,
    failing: lanes.filter((lane) => !lane.passed).length,
    ...(lowBand ? { lowBand } : {}),
  };
  if (!includeProof) return summary;
  return {
    ...summary,
    identityPassed: Boolean(lanes.find((lane) => lane.id === "identity")?.passed),
    detailAvailable: lanes.some((lane) => Boolean(lane.detail)),
    commandAvailable: lanes.some((lane) => Boolean(lane.verificationCommand)),
  };
}

function summarizeRuntimeDiffSummary(summary = {}, { lanes = [], historyWindow = [] } = {}) {
  return {
    score: summary.score || 0,
    failing: summary.failing || 0,
    identityChanges: summary.identityChanges || 0,
    volatileChanges: summary.volatileChanges || 0,
    changed: summary.changed || 0,
  };
}

function summarizeRuntimeHistoryWindow(historyWindow = []) {
  return {
    receipts: historyWindow.length,
    identityMatchesCurrent: historyWindow.filter((row) => row.identityMatchesCurrent === true).length,
  };
}

function summarizeRuntimeDriftMatrix(matrix = {}) {
  const freshness = Array.isArray(matrix.receiptFreshness) ? matrix.receiptFreshness : [];
  const changes = Array.isArray(matrix.changes) ? matrix.changes : [];
  return {
    classification: matrix.classification || "unknown",
    changes: changes.length,
    expectedChanges: changes.filter((change) => change.expected === true).length,
    staleReceipts: freshness.filter((item) => item.freshness === "stale").length,
    routeSurfaceFailing: matrix.routeSurface?.latestFailing || 0,
    evidenceRefreshMissing: (matrix.evidenceRefresh?.missingEndpoints || []).length,
  };
}

function summarizeRuntimeDriftMatrixForHistory(matrix = {}) {
  const changes = matrix.changes || [];
  const freshness = Array.isArray(matrix.receiptFreshness) ? matrix.receiptFreshness : [];
  const routeSurfaceFailing = matrix.routeSurface?.latestFailing || 0;
  const evidenceRefreshMissing = (matrix.evidenceRefresh?.missingEndpoints || []).length;
  return {
    classification: matrix.classification || "unknown",
    changes: changes.length,
    expectedChanges: changes.filter((change) => change.expected === true).length,
    staleReceipts: freshness.filter((item) => item.freshness === "stale").length,
    ...(routeSurfaceFailing ? { routeSurfaceFailing } : {}),
    ...(evidenceRefreshMissing ? { evidenceRefreshMissing } : {}),
  };
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length ? value : null;
}

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.min(Math.trunc(numeric), 50));
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

function buildHistoryWindow(receipts, runtimeReport) {
  return (receipts || []).slice(0, 8).map((receipt, index) => {
    const identityMatchesCurrent = receipt.fingerprint?.identityHash === runtimeReport.current.identityHash;
    return {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      index,
      identityHash: receipt.fingerprint?.identityHash || null,
      volatileHash: receipt.fingerprint?.volatileHash || null,
      identityMatchesCurrent,
      readinessScore: receipt.summary?.readinessScore || 0,
      readinessBand: receipt.summary?.readinessBand || "missing",
      identityChanged: receipt.summary?.identityChanged || 0,
      volatileChanged: receipt.summary?.volatileChanged || 0,
      changed: receipt.summary?.changed || 0,
      classification: identityMatchesCurrent ? "current-identity" : "older-identity",
    };
  });
}

function classifyChanges(changes) {
  return changes.map((change) => {
    const scope = change.scope || (String(change.id || "").startsWith("identity.") ? "identity" : "volatile");
    const severity = scope === "identity" ? "high" : "low";
    return {
      id: change.id,
      scope,
      key: change.key,
      severity,
      previous: change.previous,
      current: change.current,
      expected: scope === "volatile",
      explanation:
        scope === "identity"
          ? "Stable runtime identity changed; review package, build, git, Node major, or domain intent before publishing."
          : "Volatile local runtime detail changed; this is expected across temporary local server runs.",
      verificationCommand: scope === "identity" ? "npm run record:runtime && npm run diff:runtime" : "npm run diff:runtime",
    };
  });
}

function classifySummary(runtimeReport) {
  const identityChanged = runtimeReport.diff?.summary?.identityChanged || 0;
  const volatileChanged = runtimeReport.diff?.summary?.volatileChanged || 0;
  if (!runtimeReport.previous) return "no-previous-runtime-receipt";
  if (identityChanged > 0) return "identity-drift";
  if (volatileChanged > 0) return "volatile-only-drift";
  return "no-drift";
}

function driftLanes({ runtimeReport, runtimeAttestation, runtimeReconciliation, runtimeSurface, refreshPlan, routeManifest, packageManifest, historyWindow, classifiedChanges }) {
  const identityChanged = runtimeReport.diff?.summary?.identityChanged || 0;
  const volatileChanged = runtimeReport.diff?.summary?.volatileChanged || 0;
  const latestSurface = runtimeSurface.latest || null;
  const scripts = packageManifest.scripts || {};
  return [
    lane("identity", "Identity drift", identityChanged === 0 && runtimeReport.readiness.score >= 85, identityChanged === 0 ? 100 : 55, `${identityChanged} stable identity change(s); readiness ${runtimeReport.readiness.score}/100.`, "npm run record:runtime"),
    lane("volatile", "Volatile drift isolation", runtimeReport.previous ? true : historyWindow.length > 0, volatileChanged > 0 ? 100 : 90, `${volatileChanged} volatile change(s) isolated from stable identity.`, "npm run diff:runtime"),
    lane("receipt-currentness", "Receipt currentness", (runtimeReconciliation.summary?.score || 0) >= 85 && (runtimeReconciliation.summary?.staleReceiptKinds || 0) === 0, runtimeReconciliation.summary?.score || 0, `${runtimeReconciliation.summary?.staleReceiptKinds || 0} stale receipt kind(s).`, "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence"),
    lane("route-surface", "Route surface", latestSurface?.summary?.failing === 0, latestSurface?.summary?.score || 0, `${latestSurface?.summary?.passing || 0}/${latestSurface?.summary?.total || 0} probe(s) passing.`, "npm run record:runtime-surface"),
    lane("refresh-coverage", "Refresh coverage", (refreshPlan.endpoints || []).includes(ENDPOINT), (refreshPlan.endpoints || []).includes(ENDPOINT) ? 100 : 40, `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"} in refresh plan.`, "npm run refresh:evidence"),
    lane("route-manifest", "Route manifest", requiredRoutes().every((route) => (routeManifest.publicApiRoutes || []).includes(route)), percent(requiredRoutes().filter((route) => (routeManifest.publicApiRoutes || []).includes(route)).length, requiredRoutes().length), `${requiredRoutes().filter((route) => (routeManifest.publicApiRoutes || []).includes(route)).length}/${requiredRoutes().length} runtime diff route(s).`, "npm run record:runtime-surface"),
    lane("script-coverage", "Script coverage", Boolean(scripts["diff:runtime"]), Boolean(scripts["diff:runtime"]) ? 100 : 0, `diff:runtime=${Boolean(scripts["diff:runtime"])}`, "npm run diff:runtime"),
    lane("boundary", "Public/private boundary", runtimeAttestation.summary?.score >= 85 && routeManifest.privateGate?.envVar === "ENABLE_PRIVATE_COCKPIT", Math.min(runtimeAttestation.summary?.score || 0, 100), `private gate=${routeManifest.privateGate?.envVar || "missing"}; attestation=${runtimeAttestation.summary?.score || 0}/100.`, "npm run check"),
    lane("change-classification", "Change classification", classifiedChanges.every((change) => change.explanation && change.verificationCommand), classifiedChanges.length ? 100 : 90, `${classifiedChanges.length} change(s) classified.`, "npm run diff:runtime"),
  ];
}

function lane(id, label, passed, score, detail, verificationCommand) {
  const normalized = clamp(Math.round(score), 0, 100);
  return {
    id,
    label,
    passed: Boolean(passed),
    score: normalized,
    band: bandFor(normalized),
    detail,
    verificationCommand,
  };
}

function runtimeDiffChecks({ runtimeReport, runtimeReconciliation, runtimeSurface, refreshPlan, routeManifest, packageManifest, historyWindow, classifiedChanges }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const scripts = packageManifest.scripts || {};
  return [
    check("fingerprint-readiness", runtimeReport.readiness.score >= 85, "high", `${runtimeReport.readiness.score}/100 runtime readiness.`, "Repair runtime truth readiness before diffing."),
    check("previous-receipt", Boolean(runtimeReport.previous || historyWindow.length > 0), "medium", `${historyWindow.length} runtime truth receipt(s) in history window.`, "Run npm run record:runtime to establish runtime diff history."),
    check("change-classification", classifiedChanges.every((change) => change.scope && change.explanation && change.verificationCommand), "high", `${classifiedChanges.length} change(s) classified.`, "Classify every runtime fingerprint change as stable identity or volatile local drift."),
    check("identity-guard", (runtimeReport.diff?.summary?.identityChanged || 0) === 0, "high", `${runtimeReport.diff?.summary?.identityChanged || 0} identity change(s).`, "Run npm run record:runtime after intentional build/package/domain/git changes, then rerun diff:runtime."),
    check("reconciliation-current", (runtimeReconciliation.summary?.score || 0) >= 85 && (runtimeReconciliation.summary?.staleReceiptKinds || 0) === 0, "high", `${runtimeReconciliation.summary?.score || 0}/100; stale=${runtimeReconciliation.summary?.staleReceiptKinds || 0}.`, "Refresh runtime, surface, and evidence receipts before recording runtime diff."),
    check("surface-current", runtimeSurface.latest?.summary?.failing === 0 && runtimeSurface.latest?.summary?.total === runtimeSurface.plan?.routeInventory?.probeTargets, "high", `${runtimeSurface.latest?.summary?.passing || 0}/${runtimeSurface.latest?.summary?.total || 0} probe(s).`, "Run npm run record:runtime-surface after route or manifest changes."),
    check("route-manifest", requiredRoutes().every((route) => publicRoutes.includes(route)), "high", `${requiredRoutes().filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes().length} route(s).`, "Add runtime diff report, plan, and history routes to runtimeRouteManifest."),
    check("refresh-plan", (refreshPlan.endpoints || []).includes(ENDPOINT), "medium", `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"}.`, "Add runtime diff to the safe evidence refresh plan."),
    check("script-coverage", Boolean(scripts["diff:runtime"]), "medium", `diff:runtime=${Boolean(scripts["diff:runtime"])}`, "Add the diff:runtime package script and recorder."),
    check("private-boundary", routeManifest.privateGate?.envVar === "ENABLE_PRIVATE_COCKPIT" && !(refreshPlan.endpoints || []).some((endpoint) => endpoint.startsWith("/api/private")), "high", `private gate=${routeManifest.privateGate?.envVar || "missing"}; private refresh endpoints=${(refreshPlan.endpoints || []).filter((endpoint) => endpoint.startsWith("/api/private")).length}.`, "Keep runtime diff public-safe and leave private cockpit routes out of refresh plans."),
  ];
}

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: "npm run diff:runtime",
  };
}

function requiredRoutes() {
  return [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`];
}

function weightedScore(checks) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function percent(value, total) {
  if (!total) return 0;
  return clamp(Math.round((value / total) * 100), 0, 100);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

module.exports = {
  ENDPOINT,
  appendRuntimeDiffReceipt,
  buildRuntimeDiffHistory,
  buildRuntimeDiffReportFromReceipt,
  buildRuntimeDiffReport,
  buildRuntimeDiffResponse,
  readLatestRuntimeDiffReceipt,
  readRuntimeDiffHistoryWindow,
  readRuntimeDiffReceipts,
  runtimeDiffPlan,
};
