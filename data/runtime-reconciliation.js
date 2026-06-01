const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const RECONCILIATION_ENDPOINT = "/api/runtime-reconciliation";
const STORE_RELATIVE_PATH = path.join("var", "runtime-reconciliation-receipts.json");
const maxReceipts = 50;

function runtimeReconciliationPlan() {
  return {
    mode: "runtime-reconciliation-plan",
    command: "npm run audit:runtime-reconciliation",
    endpoint: RECONCILIATION_ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The reconciliation recorder starts a temporary local server, reads the public-safe runtime reconciliation endpoint, writes a local receipt under var/, and does not deploy, publish, mutate git history, enable private cockpit data, query provider dashboards, or contact third parties.",
  };
}

function buildRuntimeReconciliationReport({
  runtimeReport,
  runtimeAttestation,
  runtimeSurface,
  runtimeBoundary,
  refreshPlan,
  runtimePlan,
  routeManifest,
  runtimeTruthReceipts,
  runtimeSurfaceReceipts,
  evidenceRefreshReceipts,
  packageManifest,
  receipts = [],
}) {
  const latestRuntime = runtimeTruthReceipts[0] || null;
  const latestSurface = runtimeSurfaceReceipts[0] || runtimeSurface.latest || null;
  const latestRefresh = evidenceRefreshReceipts[0] || null;
  const receiptMatrix = buildReceiptMatrix({
    runtimeReport,
    runtimeSurface,
    refreshPlan,
    runtimePlan,
    latestRuntime,
    latestSurface,
    latestRefresh,
  });
  const checks = reconciliationChecks({
    runtimeReport,
    runtimeAttestation,
    runtimeSurface,
    runtimeBoundary,
    refreshPlan,
    runtimePlan,
    routeManifest,
    latestRuntime,
    latestSurface,
    latestRefresh,
    packageManifest,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-truth-reconciliation",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${RECONCILIATION_ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report reconciles local public-safe runtime truth, runtime surface, evidence refresh, route manifest, boundary, and attestation receipts. It proves local receipt coherence only; it does not inspect production provider dashboards, CDN cache state, private cockpit contents, or external uptime.",
    sideEffectBoundary:
      "The endpoint reads local receipt files and public-safe runtime reports only. It does not start recorders, deploy, publish, mutate git history, enable private cockpit data, or contact third parties.",
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      receiptKinds: receiptMatrix.length,
      staleReceiptKinds: receiptMatrix.filter((receipt) => receipt.freshness !== "fresh").length,
      publicApiRoutes: (routeManifest.publicApiRoutes || []).length,
      privateApiRoutes: (routeManifest.privateApiRoutes || []).length,
      refreshEndpoints: (refreshPlan.endpoints || []).length,
      surfaceProbeTargets: runtimeSurface.plan?.routeInventory?.probeTargets || 0,
      runtimeReceiptId: latestRuntime?.id || null,
      surfaceReceiptId: latestSurface?.id || null,
      refreshReceiptId: latestRefresh?.id || null,
      latestReceiptId: latestReceipt?.id || null,
    },
    plan: runtimeReconciliationPlan(),
    receiptMatrix,
    driftMatrix: {
      runtimeIdentity: {
        currentHash: runtimeReport.current.identityHash,
        latestReceiptHash: latestRuntime?.fingerprint?.identityHash || null,
        changedSinceLatestReceipt:
          latestRuntime?.fingerprint?.identityHash ? latestRuntime.fingerprint.identityHash !== runtimeReport.current.identityHash : null,
        interpretation: runtimeReport.diff.interpretation,
      },
      routeSurface: {
        expectedProbeTargets: runtimeSurface.plan?.routeInventory?.probeTargets || 0,
        latestProbeTargets: latestSurface?.summary?.total || latestSurface?.manifest?.probeTargets || 0,
        latestFailing: latestSurface?.summary?.failing ?? null,
        interpretation: latestSurface?.diff?.interpretation || "No runtime surface receipt has been recorded yet.",
      },
      evidenceRefresh: {
        expectedEndpoints: (refreshPlan.endpoints || []).length,
        latestEndpoints: latestRefresh?.summary?.total || 0,
        latestFailing: latestRefresh?.summary?.failing ?? null,
        missingEndpoints: missingRefreshEndpoints(refreshPlan, latestRefresh),
      },
    },
    routeLedger: {
      requiredPublicTruthRoutes: requiredTruthRoutes(),
      presentPublicTruthRoutes: requiredTruthRoutes().filter((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      privateGate: routeManifest.privateGate,
      manifestCounts: {
        publicApiRoutes: (routeManifest.publicApiRoutes || []).length,
        privateApiRoutes: (routeManifest.privateApiRoutes || []).length,
        staticRoutes: (routeManifest.staticRoutes || []).length,
      },
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
    nextAction: failing[0]?.repairAction || "Runtime truth receipts reconcile; rerun recorders after route, build, domain, or private-gate changes.",
    verificationCommand:
      "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence && npm run check && node server.js # then open /api/runtime-reconciliation",
  };
}

function buildRuntimeReconciliationReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "runtime-truth-reconciliation-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "runtime-truth-reconciliation" ||
    !report.summary ||
    !Array.isArray(report.receiptMatrix) ||
    !report.receiptMatrix.every((item) => item.id && item.label && item.command && item.freshness && item.detail) ||
    !report.driftMatrix ||
    !report.driftMatrix.runtimeIdentity ||
    !report.driftMatrix.routeSurface ||
    !report.driftMatrix.evidenceRefresh ||
    !report.routeLedger ||
    !Array.isArray(report.routeLedger.requiredPublicTruthRoutes) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.label && check.detail && check.repairAction && check.verificationCommand) ||
    !Array.isArray(report.repairActions) ||
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
    refreshEndpoint: `${RECONCILIATION_ENDPOINT}?refresh=1`,
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs runtime reconciliation from the latest local receipt. It proves local receipt-backed coherence only; it is not fresh hosted production, CDN, DNS, provider, uptime, private-cockpit, or third-party account proof.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || runtimeReconciliationPlan().sideEffectBoundary,
    plan: runtimeReconciliationPlan(),
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
    verificationCommand:
      report.verificationCommand ||
      "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence && npm run audit:runtime-reconciliation && npm run check",
  };
}

function buildRuntimeReconciliationResponse(report, { detail = "summary", checkPreviewLimit = 4 } = {}) {
  const fullDetail = String(detail || "summary").toLowerCase() === "full";
  const checks = report.checks || [];
  const boundedCheckPreviewLimit = boundedPreviewLimit(checkPreviewLimit, 4, 8);
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${RECONCILIATION_ENDPOINT}?detail=full`,
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy || "live-refresh",
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${RECONCILIATION_ENDPOINT}?detail=full`,
    boundariesAvailable: Boolean(report.sourceBoundary && report.sideEffectBoundary),
    summary: summarizeRuntimeReconciliationSummary(report.summary),
    planAvailable: Boolean(report.plan),
    receiptMatrix: (report.receiptMatrix || []).map(summarizeReceiptMatrixItem),
    driftSummary: summarizeRuntimeReconciliationDrift(report.driftMatrix),
    routeLedger: summarizeRuntimeReconciliationRouteLedger(report.routeLedger),
    checkSummary: summarizeRuntimeReconciliationChecks(checks),
    checks: checks.slice(0, boundedCheckPreviewLimit).map(summarizeRuntimeReconciliationCheck),
    repairActionCount: (report.repairActions || []).length,
    nextActionAvailable: Boolean(report.nextAction),
    verificationCommandAvailable: Boolean(report.verificationCommand),
    runtimeReconciliationPayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
      checkPreviewLimit: boundedCheckPreviewLimit,
      checksAvailable: checks.length,
      receiptMatrixReturned: report.receiptMatrix?.length || 0,
    },
  };
}

function appendRuntimeReconciliationReceipt(root, receipt) {
  const receipts = readRuntimeReconciliationReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readRuntimeReconciliationReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function buildReceiptMatrix({ runtimeReport, runtimeSurface, refreshPlan, runtimePlan, latestRuntime, latestSurface, latestRefresh }) {
  return [
    {
      id: "runtime-truth",
      label: "Runtime truth receipt",
      command: runtimePlan.command,
      receiptId: latestRuntime?.id || null,
      checkedAt: latestRuntime?.checkedAt || null,
      score: latestRuntime?.summary?.readinessScore || 0,
      band: latestRuntime?.summary?.readinessBand || "missing",
      freshness: latestRuntime?.fingerprint?.identityHash === runtimeReport.current.identityHash ? "fresh" : latestRuntime ? "stale" : "missing",
      expected: runtimeReport.current.identityHash,
      actual: latestRuntime?.fingerprint?.identityHash || null,
      detail: latestRuntime
        ? `${latestRuntime.summary.readinessScore}/100 readiness; ${latestRuntime.summary.changed} recorded drift item(s).`
        : "No runtime truth receipt exists.",
    },
    {
      id: "runtime-surface",
      label: "Runtime surface receipt",
      command: runtimeSurface.plan?.command || "npm run record:runtime-surface",
      receiptId: latestSurface?.id || null,
      checkedAt: latestSurface?.checkedAt || null,
      score: latestSurface?.summary?.score || 0,
      band: latestSurface?.summary?.band || "missing",
      freshness:
        latestSurface && latestSurface.summary?.total === runtimeSurface.plan?.routeInventory?.probeTargets && latestSurface.summary?.failing === 0
          ? "fresh"
          : latestSurface
            ? "stale"
            : "missing",
      expected: runtimeSurface.plan?.routeInventory?.probeTargets || 0,
      actual: latestSurface?.summary?.total || latestSurface?.manifest?.probeTargets || 0,
      detail: latestSurface
        ? `${latestSurface.summary.passing}/${latestSurface.summary.total} probe(s); private gate ${latestSurface.summary.privateGatePassing}/${runtimeSurface.plan?.routeInventory?.privateApiRoutes || 0}.`
        : "No runtime surface receipt exists.",
    },
    {
      id: "evidence-refresh",
      label: "Evidence refresh receipt",
      command: refreshPlan.command,
      receiptId: latestRefresh?.id || null,
      checkedAt: latestRefresh?.checkedAt || null,
      score: latestRefresh?.summary?.total ? Math.round((latestRefresh.summary.passing / latestRefresh.summary.total) * 100) : 0,
      band: latestRefresh?.summary?.failing === 0 ? "high" : latestRefresh ? "low" : "missing",
      freshness:
        latestRefresh && latestRefresh.summary?.total === (refreshPlan.endpoints || []).length && latestRefresh.summary?.failing === 0
          ? "fresh"
          : latestRefresh
            ? "stale"
            : "missing",
      expected: (refreshPlan.endpoints || []).length,
      actual: latestRefresh?.summary?.total || 0,
      detail: latestRefresh ? `${latestRefresh.summary.passing}/${latestRefresh.summary.total} public-safe endpoint(s) passed.` : "No evidence refresh receipt exists.",
    },
  ];
}

function reconciliationChecks({
  runtimeReport,
  runtimeAttestation,
  runtimeSurface,
  runtimeBoundary,
  refreshPlan,
  runtimePlan,
  routeManifest,
  latestRuntime,
  latestSurface,
  latestRefresh,
  packageManifest,
}) {
  return [
    check({
      id: "runtime-truth-receipt-current",
      label: "Runtime truth receipt matches current identity",
      passed: Boolean(latestRuntime?.fingerprint?.identityHash === runtimeReport.current.identityHash && latestRuntime.summary?.readinessScore >= 85),
      severity: "high",
      detail: latestRuntime
        ? `latest=${latestRuntime.id}; receipt identity=${latestRuntime.fingerprint?.identityHash}; current identity=${runtimeReport.current.identityHash}; readiness=${latestRuntime.summary?.readinessScore}.`
        : "No runtime truth receipt exists.",
      repairAction: "Run npm run record:runtime after build, package, domain, Node major, or git identity changes.",
      verificationCommand: "npm run record:runtime",
    }),
    check({
      id: "runtime-surface-receipt-current",
      label: "Runtime surface receipt matches route manifest",
      passed: Boolean(
        latestSurface &&
          latestSurface.summary?.total === runtimeSurface.plan?.routeInventory?.probeTargets &&
          latestSurface.summary?.failing === 0 &&
          latestSurface.summary?.privateGatePassing === (routeManifest.privateApiRoutes || []).length,
      ),
      severity: "high",
      detail: latestSurface
        ? `latest=${latestSurface.id}; ${latestSurface.summary?.passing}/${latestSurface.summary?.total} probe(s); expected ${runtimeSurface.plan?.routeInventory?.probeTargets}.`
        : "No runtime surface receipt exists.",
      repairAction: "Run npm run record:runtime-surface after changing routes, route manifests, static assets, or private gates.",
      verificationCommand: "npm run record:runtime-surface",
    }),
    check({
      id: "evidence-refresh-receipt-current",
      label: "Evidence refresh receipt matches public refresh plan",
      passed: Boolean(
        latestRefresh &&
          latestRefresh.summary?.total === (refreshPlan.endpoints || []).length &&
          latestRefresh.summary?.failing === 0 &&
          missingRefreshEndpoints(refreshPlan, latestRefresh).length === 0,
      ),
      severity: "high",
      detail: latestRefresh
        ? `latest=${latestRefresh.id}; ${latestRefresh.summary?.passing}/${latestRefresh.summary?.total} endpoint(s); missing ${missingRefreshEndpoints(refreshPlan, latestRefresh).join(", ") || "none"}.`
        : "No evidence refresh receipt exists.",
      repairAction: "Run npm run refresh:evidence after changing public-safe endpoints or refresh coverage.",
      verificationCommand: "npm run refresh:evidence",
    }),
    check({
      id: "attestation-and-boundary-high",
      label: "Attestation and boundary are high-confidence",
      passed: runtimeAttestation.summary?.score >= 85 && runtimeBoundary.summary?.score >= 85 && runtimeAttestation.summary?.highFailing === 0,
      severity: "high",
      detail: `attestation=${runtimeAttestation.summary?.score}/100; highFailing=${runtimeAttestation.summary?.highFailing}; boundary=${runtimeBoundary.summary?.score}/100.`,
      repairAction: "Repair runtime attestation or boundary failures before treating the runtime receipt set as coherent.",
      verificationCommand: "npm run check && node server.js # then open /api/runtime-truth/attestation and /api/runtime-boundary",
    }),
    check({
      id: "plans-stay-public-safe",
      label: "Runtime and refresh plans stay public-safe",
      passed:
        !(runtimePlan.endpoints || []).some((endpoint) => endpoint.startsWith("/api/private")) &&
        !(refreshPlan.endpoints || []).some((endpoint) => endpoint.startsWith("/api/private")),
      severity: "high",
      detail: `${(runtimePlan.endpoints || []).length} runtime endpoint(s), ${(refreshPlan.endpoints || []).length} refresh endpoint(s), no private endpoints expected.`,
      repairAction: "Remove private cockpit endpoints from public-safe runtime truth and evidence refresh plans.",
      verificationCommand: "npm run check",
    }),
    check({
      id: "truth-route-manifest-coverage",
      label: "Route manifest covers truth endpoints",
      passed: requiredTruthRoutes().every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      severity: "medium",
      detail: `${requiredTruthRoutes().filter((route) => (routeManifest.publicApiRoutes || []).includes(route)).length}/${requiredTruthRoutes().length} required truth route(s) declared.`,
      repairAction: `Add missing truth route(s) to the public route manifest: ${requiredTruthRoutes()
        .filter((route) => !(routeManifest.publicApiRoutes || []).includes(route))
        .join(", ") || "none"}.`,
      verificationCommand: "npm run check && node server.js # then open /api/runtime-truth/attestation",
    }),
    check({
      id: "reconciliation-refresh-coverage",
      label: "Evidence refresh covers reconciliation endpoint",
      passed: (refreshPlan.endpoints || []).includes(RECONCILIATION_ENDPOINT),
      severity: "medium",
      detail: `${RECONCILIATION_ENDPOINT} ${(refreshPlan.endpoints || []).includes(RECONCILIATION_ENDPOINT) ? "is" : "is not"} in the refresh plan.`,
      repairAction: `Add ${RECONCILIATION_ENDPOINT} to the safe evidence refresh plan.`,
      verificationCommand: "npm run refresh:evidence",
    }),
    check({
      id: "script-command-coverage",
      label: "Recorder commands are declared",
      passed: Boolean(
        packageManifest.scripts?.["record:runtime"] &&
          packageManifest.scripts?.["record:runtime-surface"] &&
          packageManifest.scripts?.["refresh:evidence"] &&
          packageManifest.scripts?.verify,
      ),
      severity: "medium",
      detail: `record:runtime=${Boolean(packageManifest.scripts?.["record:runtime"])}; record:runtime-surface=${Boolean(packageManifest.scripts?.["record:runtime-surface"])}; refresh:evidence=${Boolean(packageManifest.scripts?.["refresh:evidence"])}; verify=${Boolean(packageManifest.scripts?.verify)}.`,
      repairAction: "Keep runtime, surface, refresh, and verify scripts available for receipt reconciliation.",
      verificationCommand: "npm run verify",
    }),
  ];
}

function requiredTruthRoutes() {
  return [
    "/api/runtime-truth",
    "/api/runtime-truth/fingerprint",
    "/api/runtime-truth/attestation",
    "/api/runtime-surface/latest",
    "/api/runtime-boundary",
    RECONCILIATION_ENDPOINT,
    "/api/runtime-diff",
    "/api/runtime-explain",
    "/api/runtime-deploy-readiness",
    "/api/runtime-evidence-chain",
  ];
}

function missingRefreshEndpoints(refreshPlan, latestRefresh) {
  if (!latestRefresh?.checks) return refreshPlan.endpoints || [];
  const checked = new Set(latestRefresh.checks.map((item) => item.endpoint));
  return (refreshPlan.endpoints || []).filter((endpoint) => !checked.has(endpoint));
}

function summarizeRuntimeReconciliationPlan(plan = {}) {
  return {
    endpoint: plan.endpoint,
    commandAvailable: Boolean(plan.command),
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
  };
}

function summarizeReceiptMatrixItem(item) {
  return {
    id: item.id,
    receiptId: item.receiptId || null,
    score: item.score || 0,
    freshness: item.freshness,
  };
}

function summarizeRuntimeReconciliationSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    receiptKinds: summary.receiptKinds || 0,
    staleReceiptKinds: summary.staleReceiptKinds || 0,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function summarizeRuntimeReconciliationChecks(checks = []) {
  const failing = checks.filter((check) => !check.passed);
  return {
    total: checks.length,
    passed: checks.length - failing.length,
    failed: failing.length,
    detailAvailable: checks.some((check) => Boolean(check.detail)),
    commandAvailable: checks.some((check) => Boolean(check.verificationCommand)),
  };
}

function summarizeRuntimeReconciliationDrift(drift = {}) {
  return {
    identityChanged: drift.runtimeIdentity?.changedSinceLatestReceipt ?? null,
    routeSurfaceFailing: drift.routeSurface?.latestFailing ?? null,
    evidenceRefreshFailing: drift.evidenceRefresh?.latestFailing ?? null,
    missingRefreshEndpointCount: drift.evidenceRefresh?.missingEndpoints?.length || 0,
  };
}

function summarizeRuntimeReconciliationRouteLedger(ledger = {}) {
  const requiredRoutes = ledger.requiredPublicTruthRoutes || [];
  const presentRoutes = ledger.presentPublicTruthRoutes || [];
  return {
    requiredPublicTruthRouteCount: requiredRoutes.length,
    presentPublicTruthRouteCount: presentRoutes.length,
    allRequiredPublicTruthRoutesPresent: requiredRoutes.every((route) => presentRoutes.includes(route)),
    requiredPublicTruthRoutePreview: requiredRoutes
      .filter((route) => route === RECONCILIATION_ENDPOINT || route === "/api/runtime-diff" || route === "/api/runtime-truth/fingerprint")
      .slice(0, 3),
    privateGate: {
      publicDefaultStatus: ledger.privateGate?.publicDefaultStatus,
      localhostOnly: ledger.privateGate?.networkBoundary === "localhost-only",
    },
  };
}

function summarizeRuntimeReconciliationCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function boundedPreviewLimit(limit, fallback, max) {
  const numericLimit = Number(limit);
  return Math.max(0, Math.min(Number.isFinite(numericLimit) && numericLimit >= 0 ? Math.trunc(numericLimit) : fallback, max));
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
  const max = checks.reduce((sum, check) => sum + weights[check.severity], 0);
  const earned = checks.filter((check) => check.passed).reduce((sum, check) => sum + weights[check.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

module.exports = {
  appendRuntimeReconciliationReceipt,
  buildRuntimeReconciliationReport,
  buildRuntimeReconciliationReportFromReceipt,
  buildRuntimeReconciliationResponse,
  readRuntimeReconciliationReceipts,
  runtimeReconciliationPlan,
};
