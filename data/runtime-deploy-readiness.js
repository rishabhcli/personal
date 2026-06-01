const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/runtime-deploy-readiness";
const STORE_RELATIVE_PATH = path.join("var", "runtime-deploy-readiness-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function runtimeDeployReadinessPlan() {
  return {
    mode: "runtime-deploy-readiness-plan",
    command: "npm run audit:runtime-deploy",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after build, route, domain, private-gate, runtime receipt, or deploy-target changes and before manually comparing a hosted runtime.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe runtime truth endpoints, writes a local receipt under var/, and does not deploy, publish, mutate git history, query provider dashboards, inspect CDN state, enable private cockpit data, or contact third parties.",
  };
}

function buildRuntimeDeployReadinessReport({
  runtimeReport,
  runtimeAttestation,
  runtimeSurface,
  runtimeBoundary,
  runtimeReconciliation,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const gates = readinessGates({
    runtimeReport,
    runtimeAttestation,
    runtimeSurface,
    runtimeBoundary,
    runtimeReconciliation,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const comparisonPacket = deployComparisonPacket({
    runtimeReport,
    runtimeSurface,
    runtimeReconciliation,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const checklist = handoffChecklist({ comparisonPacket });
  const nonClaims = deployNonClaims();
  const checks = deployReadinessChecks({
    gates,
    comparisonPacket,
    checklist,
    nonClaims,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-deploy-readiness",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report turns local public-safe runtime fingerprints, route-surface probes, private-boundary checks, reconciliation receipts, and package scripts into a deploy-readiness packet. It proves local readiness to compare a runtime; it does not prove production provider identity, CDN cache state, DNS propagation, external uptime, or any private cockpit payload.",
    sideEffectBoundary:
      "This endpoint reads in-memory runtime reports and local receipt files only. It does not start recorders, deploy, publish, mutate git history, enable private routes, query provider dashboards, inspect CDN caches, or contact third parties.",
    plan: runtimeDeployReadinessPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      gates: gates.length,
      passingGates: gates.filter((gate) => gate.passed).length,
      blockingGates: gates.filter((gate) => !gate.passed && gate.severity === "high").length,
      publicApiRoutes: (routeManifest.publicApiRoutes || []).length,
      privateApiRoutes: (routeManifest.privateApiRoutes || []).length,
      refreshEndpoints: (refreshPlan.endpoints || []).length,
      surfaceProbeTargets: runtimeSurface.plan?.routeInventory?.probeTargets || 0,
      latestReceiptId: latestReceipt?.id || null,
      readyForManualDeployComparison: failing.filter((check) => check.severity === "high").length === 0,
    },
    gates,
    comparisonPacket,
    handoffChecklist: checklist,
    checks,
    nonClaims,
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
    nextAction:
      failing[0]?.repairAction ||
      "Local deploy-readiness truth packet is current; manually compare any hosted runtime against the identity and route packet before claiming deployment parity.",
    verificationCommand:
      "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence && npm run audit:runtime-deploy && npm run verify",
  };
}

function buildRuntimeDeployReadinessReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "runtime-deploy-readiness-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "runtime-deploy-readiness" ||
    !report.summary ||
    !Array.isArray(report.gates) ||
    !report.gates.every((gate) => gate.id && gate.label && gate.evidence && gate.repairAction && gate.verificationCommand) ||
    !report.comparisonPacket ||
    !report.comparisonPacket.packetId ||
    !report.comparisonPacket.identityHash ||
    report.comparisonPacket.identityHash.length < 12 ||
    !report.comparisonPacket.routeSurface ||
    !report.comparisonPacket.surfaceContract ||
    report.comparisonPacket.surfaceContract.privateGateDefaultStatus !== 404 ||
    report.comparisonPacket.surfaceContract.privateRefreshEndpoints !== 0 ||
    !report.comparisonPacket.receipts ||
    !Array.isArray(report.handoffChecklist) ||
    !report.handoffChecklist.every((step) => step.step && step.phase && step.action && Array.isArray(step.forbiddenAutomation) && step.verificationCommand) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand) ||
    !report.checks.some((check) => check.id === "surface-contract" && check.passed) ||
    !Array.isArray(report.nonClaims) ||
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
      "This response reconstructs runtime deploy readiness from the latest local receipt. It proves local receipt-backed readiness only; it is not fresh hosted production, CDN, DNS, provider, uptime, private-cockpit, or third-party account proof.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || runtimeDeployReadinessPlan().sideEffectBoundary,
    plan: runtimeDeployReadinessPlan(),
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
      "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence && npm run audit:runtime-deploy && npm run verify",
  };
}

function buildRuntimeDeployReadinessResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const policy = runtimeDeployReadinessPayloadPolicy({ fullDetail, report });
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      deployReadinessPayloadPolicy: policy,
    };
  }
  return {
    mode: report.mode,
    detail: "summary",
    compact: true,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    ...(report.cachedFromReceipt ? {} : { cachePolicy: report.cachePolicy }),
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeRuntimeDeployReadinessSummary(report.summary || {}),
    gateSummary: summarizeRuntimeDeployReadinessGateSummary(report.gates || []),
    comparisonPacket: summarizeComparisonPacket(report.comparisonPacket || {}),
    handoffSummary: {
      steps: (report.handoffChecklist || []).length,
    },
    checkSummary: summarizeRuntimeDeployReadinessCheckSummary(report.checks || []),
    nonClaimSummary: summarizeRuntimeDeployReadinessNonClaims(report.nonClaims || []),
    deployReadinessPayloadPolicy: policy,
  };
}

function appendRuntimeDeployReadinessReceipt(root, receipt) {
  const receipts = readRuntimeDeployReadinessReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readRuntimeDeployReadinessReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestRuntimeDeployReadinessReceipt(root) {
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

function readRuntimeDeployReadinessHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readRuntimeDeployReadinessReceipts(root);
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

function buildRuntimeDeployReadinessHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "runtime-deploy-readiness-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "This endpoint returns full local runtime deploy-readiness receipts. It proves local receipt-backed deploy-readiness only, not production provider identity, CDN cache state, DNS propagation, uptime, or private cockpit payload."
      : undefined,
    sideEffectBoundary: fullDetail
      ? "The history endpoint reads local runtime deploy-readiness receipts only. It does not deploy, publish, mutate git history, query provider dashboards, inspect CDN state, enable private cockpit data, or contact third parties."
      : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail,
          defaultLimit: 5,
          fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
          fullReportEndpoint: `${ENDPOINT}?detail=full`,
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
      latestReceiptId: latest?.id || null,
      ...(fullDetail
        ? {
            latestScore: latest?.summary?.score || 0,
            latestGates: latest?.summary?.gates || 0,
            latestBlockingGates: latest?.summary?.blockingGates || 0,
            latestReadyForManualDeployComparison: latest?.summary?.readyForManualDeployComparison === true,
          }
        : {}),
    },
    definitions: fullDetail ? undefined : summarizeRuntimeDeployReadinessDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeRuntimeDeployReadinessReceipt(receipt, { includeDetails: index === 0 })),
    ...(fullDetail
      ? {
          nextAction: limited[0]
            ? "Runtime deploy-readiness history is available; run npm run audit:runtime-deploy after runtime, route, domain, private-gate, surface, refresh, or deploy-target changes."
            : "Run npm run audit:runtime-deploy to create runtime deploy-readiness history.",
          verificationCommand: "npm run audit:runtime-deploy && node --test test/api-contract.test.mjs",
        }
      : {}),
  };
}

function summarizeRuntimeDeployReadinessDefinitions(receipt) {
  const report = receipt?.report || receipt || {};
  const gates = nonEmptyArray(receipt?.gates) || nonEmptyArray(report.gates) || [];
  const checklist = nonEmptyArray(receipt?.handoffChecklist) || nonEmptyArray(report.handoffChecklist) || [];
  const checks = nonEmptyArray(receipt?.checks) || nonEmptyArray(report.checks) || [];
  const nonClaims = receipt?.nonClaims || report.nonClaims || [];
  return {
    gates: {
      total: gates.length,
      verificationCommandCount: gates.filter((gate) => Boolean(gate.verificationCommand)).length,
      sentinelIds: gates.filter((gate) => gate.id === "runtime-identity").slice(0, 1).map((gate) => gate.id),
    },
    handoffChecklist: {
      total: checklist.length,
      verificationCommandCount: checklist.filter((step) => Boolean(step.verificationCommand)).length,
    },
    checks: {
      total: checks.length,
      verificationCommandCount: checks.filter((check) => Boolean(check.verificationCommand)).length,
      sentinelIds: checks.filter((check) => check.id === "surface-contract").slice(0, 1).map((check) => check.id),
    },
    nonClaimCount: nonClaims.length,
  };
}

function summarizeRuntimeDeployReadinessPlan() {
  const plan = runtimeDeployReadinessPlan();
  return {
    mode: plan.mode,
    command: plan.command,
    endpoint: plan.endpoint,
    receiptStore: plan.receiptStore,
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function summarizeRuntimeDeployReadinessReceipt(receipt, { includeDetails = true } = {}) {
  const report = receipt.report || {};
  const gates = nonEmptyArray(receipt.gates) || nonEmptyArray(report.gates) || [];
  const checklist = nonEmptyArray(receipt.handoffChecklist) || nonEmptyArray(report.handoffChecklist) || [];
  const checks = nonEmptyArray(receipt.checks) || nonEmptyArray(report.checks) || [];
  const nonClaims = nonEmptyArray(receipt.nonClaims) || nonEmptyArray(report.nonClaims) || [];
  const summary = {
    id: receipt.id,
    summary: summarizeRuntimeDeployReadinessHistorySummary(receipt.summary || report.summary || {}),
    handoffStepCount: checklist.length,
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    },
    nonClaimCount: nonClaims.length,
  };
  if (!includeDetails) {
    return {
      id: receipt.id,
      trendOnly: true,
      score: summary.summary.score,
      gates: summary.summary.gates,
      blockingGates: summary.summary.blockingGates,
      readyForManualDeployComparison: summary.summary.readyForManualDeployComparison,
    };
  }
  return {
    ...summary,
    gateSummary: {
      total: gates.length,
      passing: gates.filter((gate) => gate.passed).length,
    },
    identityHash: (receipt.comparisonPacket || report.comparisonPacket || {}).identityHash || null,
    repairActionCount: (receipt.repairActions || report.repairActions || []).length,
  };
}

function summarizeRuntimeDeployReadinessSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    gates: summary.gates || 0,
    passingGates: summary.passingGates || 0,
    blockingGates: summary.blockingGates || 0,
    publicApiRoutes: summary.publicApiRoutes || 0,
    privateApiRoutes: summary.privateApiRoutes || 0,
    refreshEndpoints: summary.refreshEndpoints || 0,
    surfaceProbeTargets: summary.surfaceProbeTargets || 0,
    readyForManualDeployComparison: summary.readyForManualDeployComparison === true,
  };
}

function summarizeRuntimeDeployReadinessHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    gates: summary.gates || 0,
    blockingGates: summary.blockingGates || 0,
    readyForManualDeployComparison: summary.readyForManualDeployComparison === true,
  };
}

function summarizeRuntimeDeployReadinessGateSummary(gates) {
  const failing = gates.filter((gate) => !gate.passed).map((gate) => gate.id);
  const blocking = gates.filter((gate) => !gate.passed && gate.severity === "high").map((gate) => gate.id);
  const summary = {
    total: gates.length,
    passing: gates.filter((gate) => gate.passed).length,
    blocking: blocking.length,
  };
  if (failing.length) summary.failing = failing;
  if (blocking.length) summary.blockingIds = blocking;
  return summary;
}

function summarizeRuntimeDeployReadinessCheckSummary(checks) {
  const failing = checks.filter((check) => !check.passed).map((check) => check.id);
  const summary = {
    total: checks.length,
    passing: checks.filter((check) => check.passed).length,
    failing: failing.length,
  };
  if (failing.length) summary.failingIds = failing;
  return summary;
}

function summarizeRuntimeDeployReadinessNonClaims(nonClaims) {
  return {
    total: nonClaims.length,
    deployBoundary: nonClaims.some((item) => /does not deploy/i.test(item)),
    providerBoundary: nonClaims.some((item) => /CDN|provider/i.test(item)),
  };
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length ? value : null;
}

function summarizeComparisonPacket(packet, { historyPreview = false } = {}) {
  if (historyPreview) {
    return {
      packetId: packet.packetId || null,
      identityHash: packet.identityHash || null,
      privateGateDefaultStatus: packet.surfaceContract?.privateGateDefaultStatus || null,
      privateRefreshEndpoints: packet.surfaceContract?.privateRefreshEndpoints || 0,
      receiptsAvailable: Boolean(packet.receipts),
    };
  }
  return {
    identityHash: packet.identityHash || null,
    surfaceContract: packet.surfaceContract
      ? {
          privateRefreshEndpoints: packet.surfaceContract.privateRefreshEndpoints,
          privateGateDefaultStatus: packet.surfaceContract.privateGateDefaultStatus,
        }
      : null,
  };
}

function runtimeDeployReadinessPayloadPolicy({ fullDetail, report }) {
  if (!fullDetail) {
    return {
      fullDetail,
    };
  }
  return {
    detail: "full",
    fullDetail,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    gatesReturned: (report.gates || []).length,
    checksReturned: (report.checks || []).length,
    handoffChecklistReturned: (report.handoffChecklist || []).length,
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 5, 100));
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

function readinessGates({
  runtimeReport,
  runtimeAttestation,
  runtimeSurface,
  runtimeBoundary,
  runtimeReconciliation,
  routeManifest,
  refreshPlan,
  packageManifest,
}) {
  const receiptFreshness = new Map((runtimeReconciliation.receiptMatrix || []).map((receipt) => [receipt.id, receipt.freshness]));
  const latestSurface = runtimeSurface.latest;
  return [
    gate({
      id: "runtime-identity",
      label: "Runtime identity is fingerprinted",
      passed: runtimeReport.readiness.score >= 85 && receiptFreshness.get("runtime-truth") === "fresh",
      severity: "high",
      evidence: `identity=${runtimeReport.current.identityHash}; readiness=${runtimeReport.readiness.score}/100; receipt=${receiptFreshness.get("runtime-truth") || "missing"}`,
      repairAction: "Run npm run record:runtime after build, package, domain, Node major, or git identity changes.",
      verificationCommand: "npm run record:runtime",
    }),
    gate({
      id: "route-surface",
      label: "Route surface matches manifest",
      passed:
        Boolean(latestSurface) &&
        latestSurface.summary?.failing === 0 &&
        latestSurface.summary?.total === runtimeSurface.plan?.routeInventory?.probeTargets &&
        receiptFreshness.get("runtime-surface") === "fresh",
      severity: "high",
      evidence: latestSurface
        ? `${latestSurface.summary.passing}/${latestSurface.summary.total} probe(s); receipt=${receiptFreshness.get("runtime-surface") || "missing"}`
        : "no runtime-surface receipt",
      repairAction: "Run npm run record:runtime-surface after route, static asset, or private-gate changes.",
      verificationCommand: "npm run record:runtime-surface",
    }),
    gate({
      id: "evidence-refresh",
      label: "Evidence refresh is current",
      passed: runtimeReconciliation.driftMatrix?.evidenceRefresh?.latestFailing === 0 && receiptFreshness.get("evidence-refresh") === "fresh",
      severity: "high",
      evidence: `refresh=${runtimeReconciliation.summary?.refreshReceiptId || "missing"}; receipt=${receiptFreshness.get("evidence-refresh") || "missing"}`,
      repairAction: "Run npm run refresh:evidence after changing public-safe endpoints or refresh coverage.",
      verificationCommand: "npm run refresh:evidence",
    }),
    gate({
      id: "private-boundary",
      label: "Private routes stay gated",
      passed:
        runtimeBoundary.summary?.score >= 85 &&
        latestSurface?.summary?.privateGatePassing === (routeManifest.privateApiRoutes || []).length &&
        routeManifest.privateGate?.publicDefaultStatus === 404,
      severity: "high",
      evidence: `boundary=${runtimeBoundary.summary?.score || 0}/100; privateGate=${latestSurface?.summary?.privateGatePassing || 0}/${(routeManifest.privateApiRoutes || []).length}`,
      repairAction: "Repair private gate, boundary, or surface receipts before comparing deploy readiness.",
      verificationCommand: "npm run record:runtime-surface && npm run check",
    }),
    gate({
      id: "attestation",
      label: "Runtime attestation is high-confidence",
      passed: runtimeAttestation.summary?.score >= 85 && runtimeAttestation.summary?.highFailing === 0,
      severity: "medium",
      evidence: `attestation=${runtimeAttestation.summary?.score || 0}/100; highFailing=${runtimeAttestation.summary?.highFailing || 0}`,
      repairAction: "Repair runtime attestation failures before treating the runtime packet as deploy-ready.",
      verificationCommand: "npm run check && node server.js # then open /api/runtime-truth/attestation",
    }),
    gate({
      id: "script-chain",
      label: "Verification command chain exists",
      passed:
        Boolean(packageManifest.scripts?.verify) &&
        Boolean(packageManifest.scripts?.["record:runtime"]) &&
        Boolean(packageManifest.scripts?.["record:runtime-surface"]) &&
        Boolean(packageManifest.scripts?.["refresh:evidence"]),
      severity: "medium",
      evidence: `verify=${Boolean(packageManifest.scripts?.verify)}; runtime=${Boolean(packageManifest.scripts?.["record:runtime"])}; surface=${Boolean(packageManifest.scripts?.["record:runtime-surface"])}; refresh=${Boolean(packageManifest.scripts?.["refresh:evidence"])}`,
      repairAction: "Keep verify, record:runtime, record:runtime-surface, and refresh:evidence package scripts available.",
      verificationCommand: "npm run verify",
    }),
  ];
}

function deployComparisonPacket({ runtimeReport, runtimeSurface, runtimeReconciliation, routeManifest, refreshPlan, packageManifest }) {
  return {
    packetId: `deploy-packet-${runtimeReport.current.identityHash}`,
    environment: runtimeReport.current.identity.environment,
    baseUrl: runtimeReport.current.volatile.baseUrl,
    identityHash: runtimeReport.current.identityHash,
    volatileHash: runtimeReport.current.volatileHash,
    package: {
      name: packageManifest.name,
      version: packageManifest.version,
      private: packageManifest.private === true,
    },
    build: {
      bundled: runtimeReport.current.identity.buildBundled,
      runtimeBytes: runtimeReport.current.identity.runtimeBytes,
      buildBytes: runtimeReport.current.identity.buildBytes,
    },
    routeSurface: {
      publicApiRoutes: (routeManifest.publicApiRoutes || []).length,
      privateApiRoutes: (routeManifest.privateApiRoutes || []).length,
      staticRoutes: (routeManifest.staticRoutes || []).length,
      expectedProbeTargets: runtimeSurface.plan?.routeInventory?.probeTargets || 0,
      latestProbeTargets: runtimeSurface.latest?.summary?.total || 0,
      latestFailing: runtimeSurface.latest?.summary?.failing ?? null,
    },
    surfaceContract: {
      publicApiRoutes: runtimeReport.current.identity.publicApiRoutes || 0,
      privateApiRoutes: runtimeReport.current.identity.privateApiRoutes || 0,
      staticRoutes: runtimeReport.current.identity.staticRoutes || 0,
      refreshEndpoints: runtimeReport.current.identity.refreshEndpoints || 0,
      privateRefreshEndpoints: runtimeReport.current.identity.privateRefreshEndpoints || 0,
      privateGateDefaultStatus: runtimeReport.current.identity.privateGateDefaultStatus || null,
      privateGateLocalhostOnly: runtimeReport.current.identity.privateGateLocalhostOnly === true,
      criticalRuntimeScripts: runtimeReport.current.identity.criticalRuntimeScripts || {},
      deployComparisonInputs: runtimeReport.current.identity.deployComparisonInputs || [],
    },
    receipts: {
      runtimeTruth: runtimeReconciliation.summary?.runtimeReceiptId || null,
      runtimeSurface: runtimeReconciliation.summary?.surfaceReceiptId || null,
      evidenceRefresh: runtimeReconciliation.summary?.refreshReceiptId || null,
    },
    refresh: {
      endpoints: (refreshPlan.endpoints || []).length,
      publicOnly: !(refreshPlan.endpoints || []).some((endpoint) => endpoint.startsWith("/api/private")),
    },
    comparisonRule:
      "A hosted runtime can only be called equivalent after a human reads its public runtime truth endpoint and compares identityHash, package, build, route counts, private-gate policy, and receipt freshness.",
  };
}

function handoffChecklist({ comparisonPacket }) {
  return [
    step(1, "before-deploy", "Run the local verification chain before any manual deploy decision.", "local-only", "npm run verify"),
    step(2, "before-deploy", "Record fresh runtime identity, route surface, and evidence refresh receipts.", "local-only", "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence"),
    step(3, "before-deploy", `Save the comparison packet id ${comparisonPacket.packetId} as the local reference in the deploy notes.`, "manual-only", "npm run audit:runtime-deploy"),
    step(4, "after-deploy", "Read the hosted public runtime truth endpoint and compare identity hash, package, build, and route counts manually.", "manual-read-only", "open hosted /api/runtime-truth/fingerprint"),
    step(5, "after-deploy", "Do not claim production parity if CDN, provider, private-gate, domain, or route evidence is missing.", "manual-only", "npm run audit:runtime-deploy"),
  ];
}

function deployReadinessChecks({ gates, comparisonPacket, checklist, nonClaims, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const requiredRoutes = [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`];
  return [
    check(
      "gate-pass",
      gates.every((gate) => gate.passed),
      "high",
      `${gates.filter((gate) => gate.passed).length}/${gates.length} deploy-readiness gate(s) passing.`,
      "Repair all deploy-readiness gates before comparing or claiming a runtime deploy surface.",
      "npm run audit:runtime-deploy",
    ),
    check(
      "comparison-packet",
      Boolean(
        comparisonPacket.identityHash &&
          comparisonPacket.package.name &&
          comparisonPacket.routeSurface.expectedProbeTargets &&
          comparisonPacket.surfaceContract.publicApiRoutes &&
          comparisonPacket.surfaceContract.privateGateDefaultStatus === 404 &&
          comparisonPacket.receipts.runtimeTruth,
      ),
      "high",
      `packet=${comparisonPacket.packetId}; identity=${comparisonPacket.identityHash}; probes=${comparisonPacket.routeSurface.expectedProbeTargets}.`,
      "Attach identity, package, route, and receipt data to the deploy comparison packet.",
      "npm run audit:runtime-deploy",
    ),
    check(
      "surface-contract",
      comparisonPacket.surfaceContract.publicApiRoutes === comparisonPacket.routeSurface.publicApiRoutes &&
        comparisonPacket.surfaceContract.privateApiRoutes === comparisonPacket.routeSurface.privateApiRoutes &&
        comparisonPacket.surfaceContract.refreshEndpoints === comparisonPacket.refresh.endpoints &&
        comparisonPacket.surfaceContract.privateRefreshEndpoints === 0 &&
        comparisonPacket.surfaceContract.privateGateDefaultStatus === 404 &&
        Object.values(comparisonPacket.surfaceContract.criticalRuntimeScripts || {}).every(Boolean),
      "high",
      `runtimeContract public=${comparisonPacket.surfaceContract.publicApiRoutes}; refresh=${comparisonPacket.surfaceContract.refreshEndpoints}; privateGate=${comparisonPacket.surfaceContract.privateGateDefaultStatus}.`,
      "Keep the runtime truth surface contract aligned with route, refresh, private-gate, and script declarations.",
      "npm run record:runtime && npm run audit:runtime-deploy",
    ),
    check(
      "manual-handoff",
      checklist.length >= 5 && checklist.every((item) => item.sideEffect !== "external-write" && item.verificationCommand),
      "medium",
      `${checklist.length} handoff step(s) with verification commands.`,
      "Keep deploy handoff steps manual/read-only and command-backed.",
      "npm run audit:runtime-deploy",
    ),
    check(
      "route-manifest",
      requiredRoutes.every((route) => publicRoutes.includes(route)),
      "high",
      `${requiredRoutes.filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes.length} route(s) declared.`,
      "Add runtime deploy-readiness routes to runtimeRouteManifest.",
      "npm run record:runtime-surface",
    ),
    check(
      "refresh-plan",
      (refreshPlan.endpoints || []).includes(ENDPOINT) && !(refreshPlan.endpoints || []).some((endpoint) => endpoint.startsWith("/api/private")),
      "medium",
      `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"}; publicOnly=${comparisonPacket.refresh.publicOnly}.`,
      "Add runtime deploy readiness to safe evidence refresh and keep private routes out.",
      "npm run refresh:evidence",
    ),
    check(
      "script-coverage",
      Boolean(packageManifest.scripts?.["audit:runtime-deploy"]),
      "medium",
      `audit:runtime-deploy=${Boolean(packageManifest.scripts?.["audit:runtime-deploy"])}`,
      "Add the audit:runtime-deploy package script and recorder.",
      "npm run audit:runtime-deploy",
    ),
    check(
      "non-claim-boundary",
      nonClaims.length >= 4 && nonClaims.some((item) => /does not deploy/i.test(item)) && nonClaims.some((item) => /CDN|provider/i.test(item)),
      "high",
      `${nonClaims.length} non-claim boundary item(s).`,
      "Keep deploy readiness explicit about what it does not prove.",
      "npm run check",
    ),
  ];
}

function gate({ id, label, passed, severity, evidence, repairAction, verificationCommand }) {
  return {
    id,
    label,
    passed: Boolean(passed),
    severity,
    evidence,
    repairAction,
    verificationCommand,
  };
}

function step(stepNumber, phase, action, sideEffect, verificationCommand) {
  return {
    step: stepNumber,
    phase,
    action,
    sideEffect,
    allowedAutomation: sideEffect === "local-only" ? "local recorder or verification command only" : "human read/review only",
    forbiddenAutomation: ["deploy", "publish", "mutate-git-history", "query-provider-dashboard", "enable-private-cockpit", "contact-third-party"],
    verificationCommand,
  };
}

function deployNonClaims() {
  return [
    "This report does not deploy, publish, mutate git history, or change provider configuration.",
    "This report does not prove CDN cache state, DNS propagation, provider dashboard settings, or external uptime.",
    "This report does not inspect private cockpit contents, private files, credentials, calendars, inboxes, or third-party accounts.",
    "This report does not claim production parity unless a human compares the hosted public runtime truth endpoint with this local packet.",
  ];
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

module.exports = {
  appendRuntimeDeployReadinessReceipt,
  buildRuntimeDeployReadinessHistory,
  buildRuntimeDeployReadinessReportFromReceipt,
  buildRuntimeDeployReadinessReport,
  buildRuntimeDeployReadinessResponse,
  readLatestRuntimeDeployReadinessReceipt,
  readRuntimeDeployReadinessHistoryWindow,
  readRuntimeDeployReadinessReceipts,
  runtimeDeployReadinessPlan,
};
