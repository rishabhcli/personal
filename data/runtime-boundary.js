const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/runtime-boundary";
const HISTORY_ENDPOINT = `${ENDPOINT}/history`;
const STORE_RELATIVE_PATH = path.join("var", "runtime-boundary-receipts.json");
const MAX_RECEIPTS = 50;
const historyWindowCache = new Map();

function runtimeBoundaryPlan() {
  return {
    mode: "runtime-boundary-audit-plan",
    command: "npm run audit:runtime-boundary",
    endpoint: ENDPOINT,
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The boundary recorder starts a temporary local server, reads the public-safe runtime boundary endpoint, writes a local receipt under var/, and does not deploy, publish, mutate git history, enable private cockpit data, query provider dashboards, or contact third parties.",
  };
}

function buildRuntimeBoundaryReport({
  routeManifest,
  refreshPlan,
  runtimePlan,
  runtimeSurface,
  runtimeAttestation,
  packageManifest,
  sourceSignals = {},
  receipts = [],
}) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const privateRoutes = routeManifest.privateApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const surfaceProbes = runtimeSurface?.plan?.probes || [];
  const attestationMap = new Map((runtimeAttestation.attestations || []).map((item) => [item.id, item]));
  const checks = [
    publicPrivateSeparation({ publicRoutes, privateRoutes }),
    privateGateShape(routeManifest),
    refreshStaysPublic({ refreshEndpoints }),
    runtimePlanStaysPublic({ runtimePlan }),
    surfaceProbeCoverage({ privateRoutes, surfaceProbes, routeManifest }),
    latestSurfacePrivateGate(runtimeSurface, routeManifest),
    attestationPrivateGate(attestationMap),
    sourceGateSignals(sourceSignals, privateRoutes),
    documentationDisclosure(sourceSignals),
    packageScriptCoverage(packageManifest),
  ];
  const score = weightedScore(checks);
  const failing = checks.filter((check) => !check.passed);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-public-private-boundary-audit",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This audit reconciles local route declarations, refresh plans, runtime-surface probes, runtime attestation, package scripts, docs, and source signals. It proves the local default boundary only; it does not inspect private cockpit contents or production provider policy.",
    sideEffectBoundary:
      "This endpoint reads public-safe route manifests, runtime receipt summaries, package scripts, docs, and source signals only. It does not start recorders, deploy, publish, mutate git history, enable private cockpit data, query provider dashboards, or contact third parties.",
    plan: runtimeBoundaryPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      publicApiRoutes: publicRoutes.length,
      privateApiRoutes: privateRoutes.length,
      refreshEndpoints: refreshEndpoints.length,
      privateGateProbeTargets: surfaceProbes.filter((probe) => probe.group === "private-gate").length,
      sourceGuardMentions: sourceSignals.privateRouteGuardCount || 0,
      latestReceiptId: latestReceipt?.id || null,
    },
    boundary: {
      privateGate: routeManifest.privateGate,
      publicRouteRule: "Public API routes must never start with /api/private.",
      refreshRule: "Evidence refresh and runtime truth plans must stay public-safe and must not call private cockpit routes.",
      probeRule: "Runtime surface probes must expect private routes to return the public default status unless the local env gate is explicitly enabled.",
    },
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    nextAction: failing[0]?.repairAction || "Keep public/private boundary receipts fresh after route, refresh, runtime, or private cockpit changes.",
    verificationCommand: "npm run audit:runtime-boundary && npm run check && node --test test/api-contract.test.mjs",
  };
}

function buildRuntimeBoundaryReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "runtime-boundary-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "runtime-public-private-boundary-audit" ||
    !report.summary ||
    !report.boundary ||
    !report.boundary.privateGate ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.label && check.detail && check.repairAction && check.verificationCommand) ||
    !Array.isArray(report.repairActions) ||
    !report.nextAction
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
      "This response reconstructs the runtime public/private boundary audit from the latest local receipt. It proves local receipt-backed boundary coherence only; it is not fresh hosted production, provider, private-cockpit, or third-party account proof.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || runtimeBoundaryPlan().sideEffectBoundary,
    plan: runtimeBoundaryPlan(),
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
    verificationCommand: report.verificationCommand || "npm run audit:runtime-boundary && npm run check && node --test test/api-contract.test.mjs",
  };
}

function buildRuntimeBoundaryReportResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      runtimeBoundaryPayloadPolicy: runtimeBoundaryPayloadPolicy({ report, fullDetail }),
    };
  }

  const checks = report.checks || [];
  const repairActions = report.repairActions || [];
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy || "live-refresh",
    refreshEndpoint: report.refreshEndpoint || `${ENDPOINT}?refresh=1`,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: report.summary,
    boundary: {
      privateGate: summarizeRuntimeBoundaryPrivateGate(report.boundary?.privateGate),
    },
    checkSummary: summarizeRuntimeBoundaryChecks(checks),
    repairActionCount: repairActions.length,
    runtimeBoundaryPayloadPolicy: runtimeBoundaryPayloadPolicy({ report, fullDetail }),
  };
}

function summarizeRuntimeBoundaryChecks(checks = []) {
  return {
    total: checks.length,
    passing: checks.filter((check) => check.passed).length,
    failing: checks.filter((check) => !check.passed).length,
    highSeverity: checks.filter((check) => check.severity === "high").length,
    mediumSeverity: checks.filter((check) => check.severity === "medium").length,
    sentinelIds: checks
      .filter((check) => ["refresh-public-only", "private-surface-probe-coverage"].includes(check.id))
      .map((check) => check.id),
  };
}

function runtimeBoundaryPayloadPolicy({ report, fullDetail }) {
  const checks = report.checks || [];
  const repairActions = report.repairActions || [];
  return {
    fullDetail,
    checksAvailable: checks.length,
    repairActionsAvailable: repairActions.length,
  };
}

function publicPrivateSeparation({ publicRoutes, privateRoutes }) {
  const publicPrivate = publicRoutes.filter((route) => route.startsWith("/api/private"));
  const privateNonPrivate = privateRoutes.filter((route) => !route.startsWith("/api/private"));
  return check({
    id: "public-private-route-separation",
    label: "Public and private routes are separated",
    passed: publicPrivate.length === 0 && privateNonPrivate.length === 0 && publicRoutes.length >= 40 && privateRoutes.length >= 5,
    severity: "high",
    detail: `${publicRoutes.length} public route(s), ${privateRoutes.length} private route(s), ${publicPrivate.length} private route(s) in public manifest.`,
    repairAction: publicPrivate.length
      ? `Move public manifest route(s) out of public API list: ${publicPrivate.join(", ")}.`
      : "Keep /api/private routes only in routeManifest.privateApiRoutes.",
    verificationCommand: "npm run check && node server.js # then open /api/runtime-boundary",
  });
}

function privateGateShape(routeManifest) {
  const gate = routeManifest.privateGate || {};
  return check({
    id: "private-gate-shape",
    label: "Private gate shape is explicit",
    passed:
      gate.envVar === "ENABLE_PRIVATE_COCKPIT" &&
      gate.requiredValue === "1" &&
      gate.networkBoundary === "localhost-only" &&
      gate.publicDefaultStatus === 404,
    severity: "high",
    detail: `${gate.envVar || "missing"}=${gate.requiredValue || "missing"}; ${gate.networkBoundary || "missing"}; default ${gate.publicDefaultStatus || "missing"}.`,
    repairAction: "Restore routeManifest.privateGate to ENABLE_PRIVATE_COCKPIT=1, localhost-only, public 404 default.",
    verificationCommand: "npm run check && node server.js # then open /api/runtime-truth/attestation",
  });
}

function refreshStaysPublic({ refreshEndpoints }) {
  const privateEndpoints = refreshEndpoints.filter((endpoint) => endpoint.startsWith("/api/private"));
  return check({
    id: "refresh-public-only",
    label: "Evidence refresh stays public-only",
    passed: privateEndpoints.length === 0 && refreshEndpoints.includes("/api/runtime-boundary"),
    severity: "high",
    detail: `${refreshEndpoints.length} refresh endpoint(s); private endpoints: ${privateEndpoints.join(", ") || "none"}.`,
    repairAction: privateEndpoints.length
      ? `Remove private refresh endpoint(s): ${privateEndpoints.join(", ")}.`
      : "Keep /api/runtime-boundary in safe evidence refresh so boundary drift gets a receipt.",
    verificationCommand: "npm run refresh:evidence",
  });
}

function runtimePlanStaysPublic({ runtimePlan }) {
  const privateEndpoints = (runtimePlan.endpoints || []).filter((endpoint) => endpoint.startsWith("/api/private"));
  return check({
    id: "runtime-plan-public-only",
    label: "Runtime truth plan stays public-only",
    passed: privateEndpoints.length === 0 && (runtimePlan.endpoints || []).includes("/api/runtime-truth/attestation"),
    severity: "medium",
    detail: `${(runtimePlan.endpoints || []).length} runtime truth endpoint(s); private endpoints: ${privateEndpoints.join(", ") || "none"}.`,
    repairAction: "Keep runtime truth fingerprinting on public-safe runtime identity endpoints only.",
    verificationCommand: "npm run record:runtime",
  });
}

function surfaceProbeCoverage({ privateRoutes, surfaceProbes, routeManifest }) {
  const expectedStatus = routeManifest.privateGate?.publicDefaultStatus || 404;
  const missing = privateRoutes.filter(
    (route) => !surfaceProbes.some((probe) => probe.group === "private-gate" && probe.route === route && probe.expectedStatus === expectedStatus),
  );
  return check({
    id: "private-surface-probe-coverage",
    label: "Runtime surface probes cover private defaults",
    passed: missing.length === 0 && privateRoutes.length > 0,
    severity: "high",
    detail: `${privateRoutes.length - missing.length}/${privateRoutes.length} private route(s) have ${expectedStatus} probe coverage.`,
    repairAction: missing.length
      ? `Add runtime surface private probe(s): ${missing.join(", ")}.`
      : "Keep runtime surface probes aligned with private route manifest.",
    verificationCommand: "npm run record:runtime-surface",
  });
}

function latestSurfacePrivateGate(runtimeSurface, routeManifest) {
  const latest = runtimeSurface?.latest;
  const expected = (routeManifest.privateApiRoutes || []).length;
  const passing = latest?.summary?.privateGatePassing || 0;
  return check({
    id: "latest-private-gate-receipt",
    label: "Latest surface receipt preserves private gate",
    passed: latest ? passing === expected : true,
    severity: "medium",
    detail: latest ? `${passing}/${expected} private gate probe(s) passed in ${latest.id}.` : "No runtime surface receipt yet; plan coverage still exists.",
    repairAction: latest
      ? "Rerun runtime surface recording after private route changes and inspect failing private probes."
      : "Run npm run record:runtime-surface to create a private-gate receipt.",
    verificationCommand: "npm run record:runtime-surface",
  });
}

function attestationPrivateGate(attestationMap) {
  const gate = attestationMap.get("private-gate");
  const surface = attestationMap.get("runtime-surface-diff");
  return check({
    id: "attestation-private-gate",
    label: "Runtime attestation includes private gate",
    passed: Boolean(gate?.passed && surface?.passed),
    severity: "high",
    detail: `private-gate=${gate?.passed ? "pass" : "missing/fail"}; runtime-surface-diff=${surface?.passed ? "pass" : "missing/fail"}.`,
    repairAction: "Repair runtime attestation private-gate or runtime-surface-diff checks before publishing runtime proof.",
    verificationCommand: "npm run check && node server.js # then open /api/runtime-truth/attestation",
  });
}

function sourceGateSignals(sourceSignals, privateRoutes) {
  return check({
    id: "source-gate-signals",
    label: "Source code contains private gate signals",
    passed:
      sourceSignals.hasPrivateCockpitGateFunction &&
      sourceSignals.gateRequiresEnv &&
      sourceSignals.gateChecksLoopback &&
      sourceSignals.privateRouteGuardCount >= privateRoutes.length,
    severity: "high",
    detail: `${sourceSignals.privateRouteGuardCount || 0} private route guard mention(s); env=${Boolean(sourceSignals.gateRequiresEnv)}; loopback=${Boolean(
      sourceSignals.gateChecksLoopback,
    )}.`,
    repairAction: "Keep every private route behind privateCockpitEnabled(req), with env and localhost checks.",
    verificationCommand: "npm run check",
  });
}

function documentationDisclosure(sourceSignals) {
  return check({
    id: "documentation-boundary-disclosure",
    label: "Docs disclose the private boundary",
    passed: sourceSignals.readmeMentionsPrivateOnly && sourceSignals.readmeMentionsPrivateEnv,
    severity: "medium",
    detail: `README private-only=${Boolean(sourceSignals.readmeMentionsPrivateOnly)}; env=${Boolean(sourceSignals.readmeMentionsPrivateEnv)}.`,
    repairAction: "Document private endpoints as local/private only with ENABLE_PRIVATE_COCKPIT=1.",
    verificationCommand: "npm run check",
  });
}

function packageScriptCoverage(packageManifest) {
  const scripts = packageManifest.scripts || {};
  return check({
    id: "boundary-script-coverage",
    label: "Boundary verification scripts are available",
    passed: Boolean(scripts.check && scripts["record:runtime-surface"] && scripts["refresh:evidence"] && scripts["audit:runtime-boundary"] && scripts.verify),
    severity: "medium",
    detail: `scripts: check=${Boolean(scripts.check)}, record:runtime-surface=${Boolean(scripts["record:runtime-surface"])}, refresh:evidence=${Boolean(
      scripts["refresh:evidence"],
    )}, audit:runtime-boundary=${Boolean(scripts["audit:runtime-boundary"])}, verify=${Boolean(scripts.verify)}.`,
    repairAction: "Keep check, refresh:evidence, record:runtime-surface, audit:runtime-boundary, and verify scripts declared.",
    verificationCommand: "npm run audit:runtime-boundary && npm run verify",
  });
}

function check({ id, label, passed, severity, detail, repairAction, verificationCommand }) {
  return {
    id,
    label,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function weightedScore(checks) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function appendRuntimeBoundaryReceipt(root, receipt) {
  const receipts = readRuntimeBoundaryReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, MAX_RECEIPTS));
  return receipt;
}

function buildRuntimeBoundaryHistory({ receipts = [], limit = 20, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const latestSummary = latest?.summary || latest?.report?.summary || {};
  const fullDetail = detail === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "runtime-boundary-history",
    detail: fullDetail ? "full" : "summary",
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns compact local runtime public/private boundary receipts. Full boundary audit reports remain in the local receipt store and /api/runtime-boundary.",
          sideEffectBoundary:
            "The history endpoint reads local runtime-boundary receipts only. It does not start recorders, deploy, publish, mutate git history, enable private routes, query provider dashboards, inspect private cockpit data, or contact third parties.",
        }
      : {
          sourceBoundaryAvailable: true,
          sideEffectBoundaryAvailable: true,
          fullDetailEndpoint: `${HISTORY_ENDPOINT}?detail=full`,
        }),
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      ...(fullDetail
        ? {
            latestReceiptId: latest?.id || null,
            latestCheckedAt: latest?.checkedAt || null,
            latestScore: latestSummary.score || 0,
            latestBand: latestSummary.band || "unknown",
            latestPublicApiRoutes: latestSummary.publicApiRoutes || 0,
            latestPrivateApiRoutes: latestSummary.privateApiRoutes || 0,
            latestPrivateGateProbeTargets: latestSummary.privateGateProbeTargets || 0,
          }
        : {}),
    },
    definitions: summarizeRuntimeBoundaryDefinitions(latest, { detail }),
    receipts: limited.map((receipt, index) => summarizeRuntimeBoundaryReceipt(receipt, { detail, latest: index === 0 })),
    ...(fullDetail
      ? {
          nextAction: limited[0]
            ? "Runtime boundary history is available; run npm run audit:runtime-boundary after route, refresh, runtime, or private cockpit changes."
            : "Run npm run audit:runtime-boundary to create runtime boundary history.",
          verificationCommand: "npm run audit:runtime-boundary && node --test test/api-contract.test.mjs",
        }
      : {
          nextActionAvailable: true,
          verificationCommandAvailable: true,
        }),
  };
}

function summarizeRuntimeBoundaryDefinitions(receipt, { detail = "summary" } = {}) {
  const report = receipt?.report || receipt || {};
  const boundary = receipt?.boundary || report.boundary || {};
  const checks = receipt?.checks || report.checks || [];
  if (detail === "full") {
    return {
      evidenceAccess: {
        fullReportEndpoint: ENDPOINT,
        refreshEndpoint: `${ENDPOINT}?refresh=1`,
        receiptStore: STORE_RELATIVE_PATH,
      },
      boundary: {
        privateGate: boundary.privateGate || null,
        publicRouteRule: boundary.publicRouteRule || null,
        refreshRule: boundary.refreshRule || null,
        probeRule: boundary.probeRule || null,
      },
      checks: checks.map((check) => ({
        id: check.id,
        label: check.label,
        severity: check.severity,
        verificationCommand: check.verificationCommand,
      })),
    };
  }
  return {
    boundary: {
      privateGate: summarizeRuntimeBoundaryPrivateGate(boundary.privateGate),
      publicRouteRuleAvailable: Boolean(boundary.publicRouteRule),
      refreshRuleAvailable: Boolean(boundary.refreshRule),
      probeRuleAvailable: Boolean(boundary.probeRule),
    },
    checks: {
      count: checks.length,
      ids: checks.map((check) => check.id),
      highSeverity: checks.filter((check) => check.severity === "high").length,
      mediumSeverity: checks.filter((check) => check.severity === "medium").length,
      verificationCommandsAvailable: checks.every((check) => Boolean(check.verificationCommand)),
    },
  };
}

function summarizeRuntimeBoundaryPrivateGate(privateGate) {
  if (!privateGate) return null;
  return {
    envVar: privateGate.envVar || null,
    publicDefaultStatus: privateGate.publicDefaultStatus || null,
  };
}

function summarizeRuntimeBoundaryReceipt(receipt, { detail = "summary", latest = false } = {}) {
  const report = receipt.report || {};
  const summary = receipt.summary || report.summary || {};
  const boundary = receipt.boundary || report.boundary || {};
  const checks = receipt.checks || report.checks || [];
  const checkIds = checks.length ? checks.map((check) => check.id) : Array.isArray(receipt.checkIds) ? receipt.checkIds : [];
  const failedCheckIds = checks.length
    ? checks.filter((check) => !check.passed).map((check) => check.id)
    : Array.isArray(receipt.failedCheckIds)
      ? receipt.failedCheckIds
      : [];
  const repairActionIds = (receipt.repairActions || report.repairActions || []).map((action) => action.id);
  if (detail === "full") {
    return {
      id: receipt.id,
      checkedAt: receipt.checkedAt || null,
      summary: {
        score: summary.score || 0,
        band: summary.band || "unknown",
        checks: summary.checks || checks.length,
        failing: summary.failing || failedCheckIds.length,
        publicApiRoutes: summary.publicApiRoutes || 0,
        privateApiRoutes: summary.privateApiRoutes || 0,
        refreshEndpoints: summary.refreshEndpoints || 0,
        privateGateProbeTargets: summary.privateGateProbeTargets || 0,
        sourceGuardMentions: summary.sourceGuardMentions || 0,
      },
      privateGate: {
        envVar: boundary.privateGate?.envVar || null,
        requiredValue: boundary.privateGate?.requiredValue || null,
        networkBoundary: boundary.privateGate?.networkBoundary || null,
        publicDefaultStatus: boundary.privateGate?.publicDefaultStatus || null,
      },
      checkIds,
      failedCheckIds,
      repairActionIds,
    };
  }
  if (latest) {
    return {
      id: receipt.id,
      checkedAt: receipt.checkedAt || null,
      summary: {
        score: summary.score || 0,
        band: summary.band || "unknown",
        checks: summary.checks || checks.length,
        failing: summary.failing || checks.filter((check) => !check.passed).length,
      },
      ...(failedCheckIds.length ? { failedCheckIds } : {}),
      ...(repairActionIds.length ? { repairActionIds } : {}),
    };
  }
  return {
    id: receipt.id,
    checkedAt: receipt.checkedAt || null,
    score: summary.score || 0,
    band: summary.band || "unknown",
    detailAvailable: true,
    ...(failedCheckIds.length ? { failedCheckIds } : {}),
    ...(repairActionIds.length ? { repairActionIds } : {}),
  };
}

function readRuntimeBoundaryReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readRuntimeBoundaryHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readRuntimeBoundaryReceipts(root);
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

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 20;
  return Math.max(1, Math.min(Math.trunc(numeric), 50));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

module.exports = {
  appendRuntimeBoundaryReceipt,
  buildRuntimeBoundaryHistory,
  buildRuntimeBoundaryReportFromReceipt,
  buildRuntimeBoundaryReport,
  buildRuntimeBoundaryReportResponse,
  readRuntimeBoundaryHistoryWindow,
  readRuntimeBoundaryReceipts,
  runtimeBoundaryPlan,
};
