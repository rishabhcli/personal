const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/runtime-evidence-chain";
const STORE_RELATIVE_PATH = path.join("var", "runtime-evidence-chain-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function runtimeEvidenceChainPlan() {
  return {
    mode: "runtime-evidence-chain-plan",
    command: "npm run audit:runtime-chain",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing runtime truth, route manifests, evidence refresh coverage, public/private gates, deploy-readiness checks, or any route that could affect local proof chain custody.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe runtime evidence chain endpoints, writes a local receipt under var/, and does not deploy, publish, mutate git history, enable private cockpit data, query provider dashboards, inspect CDN state, or contact third parties.",
    componentEndpoints: [
      "/api/runtime-truth/fingerprint",
      "/api/runtime-truth/attestation",
      "/api/runtime-surface/latest",
      "/api/runtime-boundary",
      "/api/runtime-reconciliation",
      "/api/runtime-explain",
      "/api/runtime-deploy-readiness",
    ],
  };
}

function buildRuntimeEvidenceChainReport({
  runtimeReport,
  runtimeAttestation,
  runtimeSurface,
  runtimeBoundary,
  runtimeReconciliation,
  runtimeExplanation,
  runtimeDeployReadiness,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const receiptMatrix = runtimeReconciliation.receiptMatrix || [];
  const chainLinks = buildChainLinks({
    runtimeReport,
    runtimeAttestation,
    runtimeSurface,
    runtimeBoundary,
    runtimeReconciliation,
    runtimeExplanation,
    runtimeDeployReadiness,
    receiptMatrix,
  });
  const parityTripwires = buildParityTripwires({
    runtimeReport,
    runtimeSurface,
    runtimeExplanation,
    runtimeDeployReadiness,
  });
  const nonClaims = evidenceChainNonClaims();
  const checks = evidenceChainChecks({
    chainLinks,
    parityTripwires,
    receiptMatrix,
    runtimeReport,
    runtimeAttestation,
    runtimeSurface,
    runtimeBoundary,
    runtimeReconciliation,
    runtimeExplanation,
    runtimeDeployReadiness,
    routeManifest,
    refreshPlan,
    packageManifest,
    nonClaims,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-evidence-chain",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This chain audits local public-safe runtime proof custody across fingerprint, attestation, route-surface, boundary, reconciliation, explanation, and deploy-readiness reports. It proves local receipt coherence only; it does not prove production provider identity, CDN cache state, DNS propagation, external uptime, private cockpit contents, or third-party account state.",
    sideEffectBoundary:
      "This endpoint reads in-memory runtime reports and local receipt files only. It does not start recorders, deploy, publish, mutate git history, enable private routes, query provider dashboards, inspect CDN caches, or contact third parties.",
    plan: runtimeEvidenceChainPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      chainLinks: chainLinks.length,
      blockingLinks: chainLinks.filter((link) => link.blocking).length,
      parityTripwires: parityTripwires.length,
      blockedParityClaims: parityTripwires.filter((tripwire) => tripwire.status === "blocked-until-hosted-proof").length,
      manualParityChecks: parityTripwires.filter((tripwire) => tripwire.manualReadRequired).length,
      freshReceiptKinds: receiptMatrix.filter((receipt) => receipt.freshness === "fresh").length,
      receiptKinds: receiptMatrix.length,
      staleReceiptKinds: runtimeReconciliation.summary?.staleReceiptKinds || 0,
      publicApiRoutes: (routeManifest.publicApiRoutes || []).length,
      privateApiRoutes: (routeManifest.privateApiRoutes || []).length,
      refreshEndpoints: (refreshPlan.endpoints || []).length,
      latestReceiptId: latestReceipt?.id || null,
      identityHash: runtimeReport.current.identityHash,
      readyForManualRuntimeComparison: failing.filter((check) => check.severity === "high").length === 0,
    },
    custodyPacket: {
      packetId: `runtime-chain-${runtimeReport.current.identityHash}`,
      identityHash: runtimeReport.current.identityHash,
      volatileHash: runtimeReport.current.volatileHash,
      runtimeReceiptId: runtimeReconciliation.summary?.runtimeReceiptId || null,
      surfaceReceiptId: runtimeReconciliation.summary?.surfaceReceiptId || null,
      refreshReceiptId: runtimeReconciliation.summary?.refreshReceiptId || null,
      explanationReceiptId: runtimeExplanation.summary?.latestReceiptId || null,
      deployReadinessReceiptId: runtimeDeployReadiness.summary?.latestReceiptId || null,
      chainRule:
        "Treat the runtime as coherent only when fingerprint, surface, refresh, boundary, reconciliation, explanation, and deploy-readiness links are high-confidence and public-safe.",
      parityTripwireRule:
        "Passing local receipts still cannot prove hosted production parity; production, CDN, provider, DNS, uptime, and private-route claims stay blocked until a human reads hosted public runtime truth.",
      manualComparisonRule:
        "A hosted runtime still needs a human read of its public runtime truth endpoint before claiming parity with this local packet.",
    },
    chainLinks,
    parityTripwires,
    receiptMatrix,
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
    nonClaims,
    nextAction:
      failing[0]?.repairAction ||
      "Runtime evidence chain is coherent locally; rerun after route, build, runtime, refresh, private-gate, or deploy-readiness changes.",
    verificationCommand:
      "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence && npm run explain:runtime && npm run audit:runtime-deploy && npm run audit:runtime-chain && npm run verify",
  };
}

function buildRuntimeEvidenceChainReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "runtime-evidence-chain-receipt" || !receipt.summary || !receipt.custodyPacket) return null;
  if (
    !Array.isArray(receipt.chainLinks) ||
    !receipt.chainLinks.every((link) => link.id && link.endpoint && link.nonClaim && link.verificationCommand && link.evidence) ||
    !Array.isArray(receipt.parityTripwires) ||
    !receipt.parityTripwires.every(
      (tripwire) =>
        tripwire.id &&
        tripwire.status &&
        tripwire.blockedClaim &&
        tripwire.localEvidence &&
        tripwire.missingHostedEvidence &&
        tripwire.replacementClaim &&
        tripwire.verificationCommand &&
        Array.isArray(tripwire.forbiddenAutomation),
    ) ||
    !Array.isArray(receipt.checks) ||
    !receipt.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand)
  ) {
    return null;
  }

  const checks = receipt.checks.map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail,
    repairAction: check.repairAction,
    verificationCommand: check.verificationCommand,
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "runtime-evidence-chain",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      receipt.sourceBoundary ||
      "This response reconstructs the runtime evidence chain from the latest local receipt. It proves local public-safe receipt custody only; it is not fresh hosted production, CDN, DNS, provider, uptime, private-cockpit, or third-party account proof.",
    sideEffectBoundary: receipt.sideEffectBoundary || runtimeEvidenceChainPlan().sideEffectBoundary,
    plan: runtimeEvidenceChainPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    custodyPacket: receipt.custodyPacket,
    chainLinks: receipt.chainLinks.map((link) => ({
      id: link.id,
      label: link.label || link.id,
      endpoint: link.endpoint,
      score: clamp(Math.round(link.score || 0), 0, 100),
      band: link.band || bandFor(link.score || 0),
      receiptId: link.receiptId || null,
      freshness: link.freshness || "recorded",
      blocking: Boolean(link.blocking),
      evidence: link.evidence,
      nonClaim: link.nonClaim,
      verificationCommand: link.verificationCommand,
    })),
    parityTripwires: receipt.parityTripwires.map((tripwire) => ({
      id: tripwire.id,
      status: tripwire.status,
      blockedClaim: tripwire.blockedClaim,
      localEvidence: tripwire.localEvidence,
      missingHostedEvidence: tripwire.missingHostedEvidence,
      replacementClaim: tripwire.replacementClaim,
      manualReadRequired: Boolean(tripwire.manualReadRequired),
      forbiddenAutomation: tripwire.forbiddenAutomation,
      verificationCommand: tripwire.verificationCommand,
    })),
    receiptMatrix: Array.isArray(receipt.receiptMatrix) ? receipt.receiptMatrix : [],
    checks,
    repairActions:
      receipt.repairActions ||
      failing.map((check) => ({
        id: check.id,
        priority: check.severity,
        action: check.repairAction,
        verificationCommand: check.verificationCommand,
      })),
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passing: receipt.summary?.passing || 0,
      checks: receipt.summary?.checks || checks.length,
    },
    nonClaims: receipt.nonClaims || evidenceChainNonClaims(),
    nextAction:
      receipt.nextAction ||
      failing[0]?.repairAction ||
      "Runtime evidence chain is served from the latest local receipt; run npm run audit:runtime-chain or /api/runtime-evidence-chain?refresh=1 after runtime, route, refresh, or deploy-readiness changes.",
    verificationCommand:
      receipt.verificationCommand ||
      "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence && npm run explain:runtime && npm run audit:runtime-deploy && npm run audit:runtime-chain && npm run verify",
  };
}

function buildRuntimeEvidenceChainResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      runtimeEvidenceChainPayloadPolicy: runtimeEvidenceChainPayloadPolicy({ report, fullDetail }),
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy,
    boundaryAvailable: Boolean(report.sourceBoundary && report.sideEffectBoundary),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeRuntimeEvidenceChainResponseSummary(report.summary),
    custodyPacket: summarizeCustodyPacket(report.custodyPacket),
    chainLinkSummary: summarizeChainLinks(report.chainLinks || []),
    chainLinks: priorityPreview(report.chainLinks || [], ["runtime-surface-contract", "runtime-reconciliation", "runtime-explanation"], 4).map(
      summarizeChainLinkForResponse,
    ),
    parityTripwireSummary: summarizeParityTripwires(report.parityTripwires || []),
    parityTripwires: priorityPreview(report.parityTripwires || [], ["cdn-dns-uptime-parity", "provider-identity-parity", "private-cockpit-parity"], 3).map(
      summarizeParityTripwireForResponse,
    ),
    receiptMatrixSummary: summarizeReceiptMatrix(report.receiptMatrix || []),
    checkSummary: summarizeHistoryChecks(report.checks || [], report.summary),
    checks: priorityPreview(report.checks || [], ["route-manifest", "surface-contract-fingerprint", "production-parity-tripwires", "refresh-plan"], 4).map(
      summarizeCheckForResponse,
    ),
    repairActionSummary: summarizeResponseRepairActions(report.repairActions || []),
    nonClaimCount: (report.nonClaims || []).length,
    nextActionAvailable: Boolean(report.nextAction),
    verificationCommandAvailable: Boolean(report.verificationCommand),
    runtimeEvidenceChainPayloadPolicy: runtimeEvidenceChainPayloadPolicy({ report, fullDetail }),
  };
}

function appendRuntimeEvidenceChainReceipt(root, receipt) {
  const receipts = readRuntimeEvidenceChainReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function buildRuntimeEvidenceChainHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const compactRows = fullDetail ? limited : limited.slice(0, 1);
  const latest = limited[0] || null;
  const summary = {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
    latestScore: latest?.summary?.score || 0,
  };
  const fullSummary = {
    ...summary,
    latestCheckedAt: latest?.checkedAt || null,
    latestBand: latest?.summary?.band || "unknown",
    latestChainLinks: latest?.summary?.chainLinks || 0,
    latestParityTripwires: latest?.summary?.parityTripwires || 0,
    latestReceiptKinds: latest?.summary?.receiptKinds || 0,
    latestReadyForManualRuntimeComparison: latest?.summary?.readyForManualRuntimeComparison === true,
  };
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "runtime-evidence-chain-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "Full local runtime evidence-chain receipt history; this is still local proof custody only, not hosted production, CDN, DNS, provider, uptime, private-cockpit, or third-party account proof."
      : undefined,
    sourceBoundaryAvailable: undefined,
    sideEffectBoundary: fullDetail
      ? "Reads local runtime evidence-chain receipts only; no deploys, publishing, git mutation, private data, provider dashboards, CDN inspection, or third-party calls."
      : undefined,
    sideEffectBoundaryAvailable: undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail,
          fullReportEndpoint: `${ENDPOINT}?detail=full`,
          fullHistoryEndpoint: `${ENDPOINT}/history?detail=full`,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
        }
      : {
          fullDetail,
          historyRowsReturned: compactRows.length,
        },
    summary: fullDetail ? fullSummary : summary,
    definitions: undefined,
    receipts: fullDetail ? limited : compactRows.map((receipt, index) => summarizeRuntimeEvidenceChainReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "History available; rerun after runtime, route, refresh, private-gate, deploy-readiness, or proof-custody changes."
        : "Run npm run audit:runtime-chain to create runtime evidence-chain history."
      : undefined,
    nextActionAvailable: undefined,
    verificationCommand: fullDetail ? "npm run audit:runtime-chain && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: undefined,
  };
}

function summarizeRuntimeEvidenceChainDefinitions(receipt) {
  const chainLinks = priorityPreview(receipt?.chainLinks || [], ["runtime-surface-contract"], 1);
  const parityTripwires = priorityPreview(receipt?.parityTripwires || [], ["cdn-dns-uptime-parity"], 1);
  return {
    evidenceAccess: {
      fullReportEndpoint: `${ENDPOINT}?detail=full`,
    },
    chainLinkCount: (receipt?.chainLinks || []).length,
    chainLinks: chainLinks.map((link) => ({
      id: link.id,
      endpoint: link.endpoint,
    })),
    parityTripwireCount: (receipt?.parityTripwires || []).length,
    parityTripwires: parityTripwires.map((tripwire) => ({
      id: tripwire.id,
      forbiddenAutomationCount: (tripwire.forbiddenAutomation || []).length,
    })),
    checks: priorityPreview(receipt?.checks || [], ["route-manifest", "surface-contract-fingerprint", "production-parity-tripwires"], 3).map((check) => ({
      id: check.id,
      severity: check.severity,
    })),
    nonClaimCount: (receipt?.nonClaims || []).length,
  };
}

function readRuntimeEvidenceChainReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestRuntimeEvidenceChainReceipt(root) {
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

function readRuntimeEvidenceChainHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const window = readReceiptWindow(storePath, boundedLimit);
    historyWindowCache.set(storePath, { cacheKey, window });
    return window;
  } catch {
    return { receipts: [], totalAvailable: 0 };
  }
}

function summarizeRuntimeEvidenceChainReceipt(receipt, { includePreview = false } = {}) {
  const chainLinks = receipt.chainLinks || [];
  const parityTripwires = receipt.parityTripwires || [];
  const checks = receipt.checks || [];
  const compact = {
    id: receipt.id,
    score: receipt.summary?.score || 0,
    custodyPacket: receipt.custodyPacket
      ? {
          identityHash: receipt.custodyPacket.identityHash || null,
        }
      : null,
    chainLinkSummary: {
      total: chainLinks.length,
    },
    parityTripwireSummary: {
      total: parityTripwires.length,
    },
    checkSummary: {
      total: checks.length,
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    },
    nonClaimCount: (receipt.nonClaims || []).length,
  };
  if (!includePreview) {
    return {
      id: receipt.id,
      latestReceiptPreviewOnly: true,
      trendSummary: {
        score: receipt.summary?.score || 0,
        failing: receipt.summary?.failing || 0,
      },
    };
  }
  if (includePreview) {
    compact.chainLinks = priorityPreview(chainLinks, ["runtime-surface-contract"], 1).map((link) => ({
      id: link.id,
    }));
    compact.parityTripwires = priorityPreview(parityTripwires, ["cdn-dns-uptime-parity"], 1).map((tripwire) => ({
      id: tripwire.id,
    }));
  }
  return compact;
}

function priorityPreview(items, priorityIds, limit) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const preview = [];
  for (const id of priorityIds) {
    const item = byId.get(id);
    if (item && !preview.includes(item)) preview.push(item);
    if (preview.length >= limit) return preview;
  }
  for (const item of items) {
    if (!preview.includes(item)) preview.push(item);
    if (preview.length >= limit) return preview;
  }
  return preview;
}

function summarizeRuntimeEvidenceChainSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    readyForManualRuntimeComparison: summary.readyForManualRuntimeComparison === true,
  };
}

function summarizeRuntimeEvidenceChainResponseSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    chainLinks: summary.chainLinks || 0,
    parityTripwires: summary.parityTripwires || 0,
    latestReceiptId: summary.latestReceiptId || null,
    readyForManualRuntimeComparison: summary.readyForManualRuntimeComparison === true,
  };
}

function summarizeRuntimeEvidenceChainPlan(plan = {}) {
  return {
    mode: plan.mode,
    command: plan.command,
    endpoint: plan.endpoint,
    receiptStore: plan.receiptStore,
    componentEndpointCount: (plan.componentEndpoints || []).length,
    scheduleRecommendationAvailable: Boolean(plan.scheduleRecommendation),
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
  };
}

function summarizeCustodyPacket(packet = {}) {
  return {
    identityHash: packet.identityHash || null,
    parityTripwireRuleAvailable: Boolean(packet.parityTripwireRule),
  };
}

function summarizeChainLinkForResponse(link = {}) {
  return {
    id: link.id,
    endpoint: link.endpoint,
  };
}

function summarizeParityTripwireForResponse(tripwire = {}) {
  return {
    id: tripwire.id,
    status: tripwire.status,
  };
}

function summarizeReceiptMatrixItemForResponse(item = {}) {
  return {
    id: item.id,
    freshness: item.freshness || "unknown",
    score: item.score || 0,
    receiptId: item.receiptId || null,
  };
}

function summarizeCheckForResponse(check = {}) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function summarizeResponseRepairActions(actions = []) {
  return {
    total: actions.length,
    high: actions.filter((action) => action.priority === "high").length,
    medium: actions.filter((action) => action.priority === "medium").length,
    low: actions.filter((action) => action.priority === "low").length,
  };
}

function runtimeEvidenceChainPayloadPolicy({ report, fullDetail }) {
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    chainLinks: (report.chainLinks || []).length,
    parityTripwires: (report.parityTripwires || []).length,
    receiptMatrixItems: (report.receiptMatrix || []).length,
    checks: (report.checks || []).length,
    omittedFromSummary: fullDetail ? [] : undefined,
    omittedFromSummaryCount: fullDetail ? 0 : 7,
  };
}

function readReceiptWindow(storePath, limit) {
  const text = readFileSync(storePath, "utf8");
  const receiptsIndex = text.indexOf('"receipts"');
  const arrayStart = receiptsIndex === -1 ? -1 : text.indexOf("[", receiptsIndex);
  if (arrayStart === -1) return { receipts: [], totalAvailable: 0 };

  const receipts = [];
  let totalAvailable = 0;
  let index = arrayStart + 1;
  while (index < text.length) {
    while (index < text.length && /[\s,]/.test(text[index])) index += 1;
    if (text[index] === "]") break;
    if (text[index] !== "{") break;
    const objectEnd = findJsonObjectEnd(text, index);
    if (objectEnd === -1) break;
    totalAvailable += 1;
    if (receipts.length < limit) {
      receipts.push(JSON.parse(text.slice(index, objectEnd + 1)));
    }
    index = objectEnd + 1;
  }

  return { receipts, totalAvailable };
}

function summarizeChainLinks(chainLinks) {
  return {
    total: chainLinks.length,
    blocking: chainLinks.filter((link) => link.blocking).length,
    fresh: chainLinks.filter((link) => link.freshness === "fresh").length,
    derived: chainLinks.filter((link) => link.freshness === "derived").length,
    averageScore: average(chainLinks.map((link) => link.score || 0)),
  };
}

function summarizeParityTripwires(parityTripwires) {
  return {
    total: parityTripwires.length,
    blocked: parityTripwires.filter((tripwire) => tripwire.status === "blocked-until-hosted-proof").length,
    manualReadRequired: parityTripwires.filter((tripwire) => tripwire.manualReadRequired).length,
  };
}

function summarizeReceiptMatrix(receiptMatrix) {
  return {
    total: receiptMatrix.length,
    fresh: receiptMatrix.filter((item) => item.freshness === "fresh").length,
    stale: receiptMatrix.filter((item) => item.freshness === "stale").length,
  };
}

function summarizeHistoryChecks(checks, summary = {}) {
  const failing = checks.filter((check) => !check.passed);
  return {
    total: summary.checks || checks.length,
    passed: summary.passing || checks.length - failing.length,
    failed: summary.failing || failing.length,
    failing: failing.map(({ id }) => id),
  };
}

function boundedHistoryLimit(limit) {
  const numericLimit = Number(limit);
  if (!Number.isFinite(numericLimit)) return 5;
  return Math.max(1, Math.min(Math.trunc(numericLimit), 50));
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

function buildChainLinks({
  runtimeReport,
  runtimeAttestation,
  runtimeSurface,
  runtimeBoundary,
  runtimeReconciliation,
  runtimeExplanation,
  runtimeDeployReadiness,
  receiptMatrix,
}) {
  const receiptById = new Map(receiptMatrix.map((receipt) => [receipt.id, receipt]));
  const latestSurface = runtimeSurface.latest;
  return [
    link({
      id: "runtime-fingerprint",
      label: "Runtime identity fingerprint",
      endpoint: "/api/runtime-truth/fingerprint",
      score: runtimeReport.readiness.score,
      band: runtimeReport.readiness.band,
      receiptId: receiptById.get("runtime-truth")?.receiptId || runtimeReport.previous?.id || null,
      freshness: receiptById.get("runtime-truth")?.freshness || "derived",
      evidence: `identity=${runtimeReport.current.identityHash}; volatile=${runtimeReport.current.volatileHash}; readiness=${runtimeReport.readiness.score}/100`,
      nonClaim: "Does not prove remote deploy identity by itself.",
      verificationCommand: "npm run record:runtime",
    }),
    link({
      id: "runtime-attestation",
      label: "Runtime attestation",
      endpoint: "/api/runtime-truth/attestation",
      score: runtimeAttestation.summary?.score || 0,
      band: runtimeAttestation.summary?.band || "missing",
      receiptId: null,
      freshness: "derived",
      evidence: `${runtimeAttestation.summary?.passing || 0}/${runtimeAttestation.summary?.attestations || 0} attestation(s); high failing ${runtimeAttestation.summary?.highFailing || 0}`,
      nonClaim: "Does not inspect provider dashboards, CDN settings, or private cockpit payloads.",
      verificationCommand: "npm run check && node server.js # then open /api/runtime-truth/attestation",
    }),
    link({
      id: "runtime-surface-contract",
      label: "Runtime surface contract fingerprint",
      endpoint: "/api/runtime-truth/fingerprint",
      score:
        runtimeReport.current.identity.publicApiRoutes >= 80 &&
        runtimeReport.current.identity.privateApiRoutes >= 1 &&
        runtimeReport.current.identity.refreshEndpoints >= 20 &&
        runtimeReport.current.identity.privateRefreshEndpoints === 0 &&
        runtimeReport.current.identity.privateGateDefaultStatus === 404
          ? 100
          : 50,
      receiptId: receiptById.get("runtime-truth")?.receiptId || runtimeReport.previous?.id || null,
      freshness: receiptById.get("runtime-truth")?.freshness || "derived",
      evidence: `public=${runtimeReport.current.identity.publicApiRoutes || 0}; private=${runtimeReport.current.identity.privateApiRoutes || 0}; refresh=${runtimeReport.current.identity.refreshEndpoints || 0}; privateGate=${runtimeReport.current.identity.privateGateDefaultStatus || "missing"}`,
      nonClaim: "Does not prove hosted route behavior without route-surface and hosted runtime receipts.",
      verificationCommand: "npm run record:runtime && npm run record:runtime-surface",
    }),
    link({
      id: "route-surface",
      label: "Route surface receipt",
      endpoint: "/api/runtime-surface/latest",
      score: latestSurface?.summary?.score || 0,
      band: latestSurface?.summary?.band || "missing",
      receiptId: receiptById.get("runtime-surface")?.receiptId || latestSurface?.id || null,
      freshness: receiptById.get("runtime-surface")?.freshness || (latestSurface ? "unreconciled" : "missing"),
      evidence: latestSurface
        ? `${latestSurface.summary.passing}/${latestSurface.summary.total} probe(s); private gate ${latestSurface.summary.privateGatePassing}`
        : "No route surface receipt exists.",
      nonClaim: "Does not prove CDN/provider rewrites or external uptime.",
      verificationCommand: "npm run record:runtime-surface",
    }),
    link({
      id: "public-private-boundary",
      label: "Public/private boundary",
      endpoint: "/api/runtime-boundary",
      score: runtimeBoundary.summary?.score || 0,
      band: runtimeBoundary.summary?.band || "missing",
      receiptId: null,
      freshness: "derived",
      evidence: `${runtimeBoundary.summary?.publicApiRoutes || 0} public route(s), ${runtimeBoundary.summary?.privateApiRoutes || 0} private route(s), ${runtimeBoundary.summary?.privateGateProbeTargets || 0} private probe target(s)`,
      nonClaim: "Does not read private cockpit contents or authorize external systems.",
      verificationCommand: "npm run record:runtime-surface && npm run check",
    }),
    link({
      id: "receipt-reconciliation",
      label: "Receipt reconciliation",
      endpoint: "/api/runtime-reconciliation",
      score: runtimeReconciliation.summary?.score || 0,
      band: runtimeReconciliation.summary?.band || "missing",
      receiptId: null,
      freshness: runtimeReconciliation.summary?.staleReceiptKinds === 0 ? "fresh" : "stale",
      evidence: `${runtimeReconciliation.summary?.freshReceiptKinds || receiptMatrix.filter((item) => item.freshness === "fresh").length}/${receiptMatrix.length} fresh receipt kind(s); stale ${runtimeReconciliation.summary?.staleReceiptKinds || 0}`,
      nonClaim: "Does not start recorders or refresh evidence during the request.",
      verificationCommand: "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence",
    }),
    link({
      id: "human-explanation",
      label: "Human-readable proof explanation",
      endpoint: "/api/runtime-explain",
      score: runtimeExplanation.summary?.score || 0,
      band: runtimeExplanation.summary?.band || "missing",
      receiptId: runtimeExplanation.summary?.latestReceiptId || null,
      freshness: runtimeExplanation.summary?.staleReceiptKinds === 0 ? "fresh" : "stale",
      evidence: `${runtimeExplanation.summary?.proofClaims || 0} proof claim(s); stale ${runtimeExplanation.summary?.staleReceiptKinds || 0}`,
      nonClaim: "Does not claim production, CDN, DNS, or provider truth.",
      verificationCommand: "npm run explain:runtime",
    }),
    link({
      id: "deploy-readiness",
      label: "Manual deploy comparison packet",
      endpoint: "/api/runtime-deploy-readiness",
      score: runtimeDeployReadiness.summary?.score || 0,
      band: runtimeDeployReadiness.summary?.band || "missing",
      receiptId: runtimeDeployReadiness.summary?.latestReceiptId || null,
      freshness: runtimeDeployReadiness.summary?.readyForManualDeployComparison ? "fresh" : "blocked",
      evidence: `${runtimeDeployReadiness.summary?.passingGates || 0}/${runtimeDeployReadiness.summary?.gates || 0} deploy-readiness gate(s); ready=${Boolean(runtimeDeployReadiness.summary?.readyForManualDeployComparison)}`,
      nonClaim: "Does not deploy or prove hosted runtime parity without manual comparison.",
      verificationCommand: "npm run audit:runtime-deploy",
    }),
  ];
}

function buildParityTripwires({ runtimeReport, runtimeSurface, runtimeExplanation, runtimeDeployReadiness }) {
  const identityHash = runtimeReport.current.identityHash;
  const latestSurface = runtimeSurface.latest;
  const explanationClaims = runtimeExplanation.summary?.proofClaims || 0;
  const deployReady = Boolean(runtimeDeployReadiness.summary?.readyForManualDeployComparison);
  return [
    tripwire({
      id: "hosted-identity-parity",
      blockedClaim: "This local runtime identity hash proves the hosted production deployment is identical.",
      localEvidence: `local identity ${identityHash}; deploy-readiness ready=${deployReady}`,
      missingHostedEvidence: "Hosted /api/runtime-truth/fingerprint identityHash and package/build fields have not been read in this chain.",
      replacementClaim: "Local runtime identity is ready for a manual hosted identity comparison.",
      verificationCommand: "npm run record:runtime && npm run audit:runtime-deploy",
    }),
    tripwire({
      id: "provider-deploy-state",
      blockedClaim: "The deployment provider has the expected active build and settings.",
      localEvidence: `deploy-readiness gates ${runtimeDeployReadiness.summary?.passingGates || 0}/${runtimeDeployReadiness.summary?.gates || 0}`,
      missingHostedEvidence: "Provider dashboard/build metadata is intentionally not queried by this local chain.",
      replacementClaim: "Local deploy-readiness gates are passing; provider state still needs manual provider-side confirmation if claimed.",
      verificationCommand: "npm run audit:runtime-deploy",
    }),
    tripwire({
      id: "cdn-dns-uptime-parity",
      blockedClaim: "CDN cache, DNS propagation, and external uptime are verified.",
      localEvidence: `${latestSurface?.summary?.passing || 0}/${latestSurface?.summary?.total || 0} local route probe(s) passing`,
      missingHostedEvidence: "No CDN cache inspection, DNS propagation check, or external uptime probe is performed by this public-safe local chain.",
      replacementClaim: "Local route surface probes pass; CDN, DNS, and uptime remain non-claims.",
      verificationCommand: "npm run record:runtime-surface",
    }),
    tripwire({
      id: "hosted-route-surface-parity",
      blockedClaim: "Every hosted public route behaves exactly like the local route surface.",
      localEvidence: latestSurface
        ? `local surface receipt ${latestSurface.id}; ${latestSurface.summary.passing}/${latestSurface.summary.total} probe(s)`
        : "no local surface receipt",
      missingHostedEvidence: "Hosted public route probes have not been compared against this local packet.",
      replacementClaim: "Local route-surface receipt is coherent and ready for hosted route comparison.",
      verificationCommand: "npm run record:runtime-surface && npm run audit:runtime-chain",
    }),
    tripwire({
      id: "private-route-production-gate",
      blockedClaim: "Hosted private routes are gated exactly like local private routes.",
      localEvidence: `local private gate default ${runtimeReport.current.identity.privateGateDefaultStatus}; localhostOnly=${runtimeReport.current.identity.privateGateLocalhostOnly}`,
      missingHostedEvidence: "Hosted private-route probes are not run here and private cockpit contents are never inspected.",
      replacementClaim: "Local private-gate policy is modeled; hosted private-gate parity still requires manual public-safe verification.",
      verificationCommand: "npm run record:runtime-surface && npm run audit:runtime-chain",
    }),
    tripwire({
      id: "human-explanation-production-proof",
      blockedClaim: "The human-readable runtime explanation proves production parity.",
      localEvidence: `${explanationClaims} local proof explanation claim(s)`,
      missingHostedEvidence: "Runtime explanations summarize local receipts and do not read hosted production proof.",
      replacementClaim: "Runtime explanation is a local receipt explainer, not a hosted parity certificate.",
      verificationCommand: "npm run explain:runtime && npm run audit:runtime-chain",
    }),
  ];
}

function tripwire({ id, blockedClaim, localEvidence, missingHostedEvidence, replacementClaim, verificationCommand }) {
  return {
    id,
    status: "blocked-until-hosted-proof",
    blockedClaim,
    localEvidence,
    missingHostedEvidence,
    replacementClaim,
    manualReadRequired: true,
    forbiddenAutomation: ["deploy", "publish", "provider-dashboard-query", "cdn-cache-inspection", "private-cockpit-read"],
    verificationCommand,
  };
}

function evidenceChainChecks({
  chainLinks,
  parityTripwires,
  receiptMatrix,
  runtimeReport,
  runtimeAttestation,
  runtimeSurface,
  runtimeBoundary,
  runtimeReconciliation,
  runtimeExplanation,
  runtimeDeployReadiness,
  routeManifest,
  refreshPlan,
  packageManifest,
  nonClaims,
}) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const requiredRoutes = [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`];
  const scripts = packageManifest.scripts || {};
  const latestSurface = runtimeSurface.latest;
  return [
    check(
      "runtime-fingerprint-current",
      runtimeReport.readiness.score >= 85 && runtimeReport.current.identityHash.length >= 12,
      "high",
      `runtime readiness=${runtimeReport.readiness.score}/100; identity=${runtimeReport.current.identityHash}.`,
      "Run npm run record:runtime after package, build, git, domain, or Node identity changes.",
      "npm run record:runtime",
    ),
    check(
      "attestation-boundary-high",
      runtimeAttestation.summary?.score >= 85 && runtimeAttestation.summary?.highFailing === 0 && runtimeBoundary.summary?.score >= 85,
      "high",
      `attestation=${runtimeAttestation.summary?.score || 0}/100; highFailing=${runtimeAttestation.summary?.highFailing || 0}; boundary=${runtimeBoundary.summary?.score || 0}/100.`,
      "Repair runtime attestation or public/private boundary failures before trusting the chain.",
      "npm run check && node server.js # then open /api/runtime-truth/attestation and /api/runtime-boundary",
    ),
    check(
      "surface-receipt-current",
      Boolean(
        latestSurface &&
          latestSurface.summary?.score >= 95 &&
          latestSurface.summary?.failing === 0 &&
          latestSurface.summary?.total === runtimeSurface.plan?.routeInventory?.probeTargets,
      ),
      "high",
      latestSurface
        ? `surface=${latestSurface.id}; ${latestSurface.summary.passing}/${latestSurface.summary.total} probe(s); expected ${runtimeSurface.plan?.routeInventory?.probeTargets}.`
        : "No runtime surface receipt exists.",
      "Run npm run record:runtime-surface after route, static asset, or private-gate changes.",
      "npm run record:runtime-surface",
    ),
    check(
      "receipt-reconciliation-fresh",
      runtimeReconciliation.summary?.score >= 85 &&
        runtimeReconciliation.summary?.staleReceiptKinds === 0 &&
        receiptMatrix.length >= 3 &&
        receiptMatrix.every((receipt) => receipt.freshness === "fresh"),
      "high",
      `reconciliation=${runtimeReconciliation.summary?.score || 0}/100; stale=${runtimeReconciliation.summary?.staleReceiptKinds || 0}; receipts=${receiptMatrix
        .map((receipt) => `${receipt.id}:${receipt.freshness}`)
        .join(", ")}.`,
      "Refresh runtime truth, route surface, and evidence refresh receipts until reconciliation is fresh.",
      "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence",
    ),
    check(
      "explanation-nonclaims",
      runtimeExplanation.summary?.score >= 85 &&
        runtimeExplanation.summary?.staleReceiptKinds === 0 &&
        (runtimeExplanation.nonClaims || []).some((item) => /CDN|provider/i.test(item)),
      "high",
      `explanation=${runtimeExplanation.summary?.score || 0}/100; stale=${runtimeExplanation.summary?.staleReceiptKinds || 0}; nonClaims=${runtimeExplanation.nonClaims?.length || 0}.`,
      "Run explain:runtime and keep proof explanations paired with non-claim boundaries.",
      "npm run explain:runtime",
    ),
    check(
      "deploy-readiness-handoff",
      runtimeDeployReadiness.summary?.score >= 85 &&
        runtimeDeployReadiness.summary?.readyForManualDeployComparison === true &&
        (runtimeDeployReadiness.nonClaims || []).some((item) => /does not deploy/i.test(item)),
      "high",
      `deploy=${runtimeDeployReadiness.summary?.score || 0}/100; ready=${Boolean(runtimeDeployReadiness.summary?.readyForManualDeployComparison)}; gates=${runtimeDeployReadiness.summary?.passingGates || 0}/${runtimeDeployReadiness.summary?.gates || 0}.`,
      "Run audit:runtime-deploy and keep deploy parity as a manual read-only comparison.",
      "npm run audit:runtime-deploy",
    ),
    check(
      "chain-link-depth",
      chainLinks.length >= 8 && chainLinks.every((link) => link.endpoint && link.verificationCommand && link.nonClaim && Number.isInteger(link.score)),
      "medium",
      `${chainLinks.length} chain link(s); blocking ${chainLinks.filter((link) => link.blocking).length}.`,
      "Keep every chain link endpoint-backed, command-backed, scored, and paired with a non-claim.",
      "npm run audit:runtime-chain",
    ),
    check(
      "surface-contract-fingerprint",
      runtimeReport.checks.some((check) => check.id === "surface-contract" && check.passed) &&
        chainLinks.some((link) => link.id === "runtime-surface-contract" && !link.blocking),
      "high",
      `surfaceContract public=${runtimeReport.current.identity.publicApiRoutes || 0}; refresh=${runtimeReport.current.identity.refreshEndpoints || 0}; privateGate=${runtimeReport.current.identity.privateGateDefaultStatus || "missing"}.`,
      "Keep route, refresh, private-gate, and critical script contract fields inside the runtime truth fingerprint.",
      "npm run record:runtime && npm run audit:runtime-chain",
    ),
    check(
      "production-parity-tripwires",
      parityTripwires.length >= 6 &&
        parityTripwires.every(
          (tripwire) =>
            tripwire.status === "blocked-until-hosted-proof" &&
            tripwire.manualReadRequired &&
            tripwire.blockedClaim &&
            tripwire.missingHostedEvidence &&
            tripwire.replacementClaim &&
            tripwire.verificationCommand &&
            tripwire.forbiddenAutomation.includes("private-cockpit-read"),
        ),
      "high",
      `${parityTripwires.filter((tripwire) => tripwire.status === "blocked-until-hosted-proof").length}/${parityTripwires.length} hosted-parity claim(s) blocked.`,
      "Keep production, CDN, provider, DNS, hosted route, private-gate, and explanation-parity claims blocked until hosted proof is manually read.",
      "npm run audit:runtime-chain && npm run audit:runtime-deploy",
    ),
    check(
      "custody-receipt-ids",
      Boolean(
        runtimeReconciliation.summary?.runtimeReceiptId &&
          runtimeReconciliation.summary?.surfaceReceiptId &&
          runtimeReconciliation.summary?.refreshReceiptId &&
          runtimeExplanation.summary?.latestReceiptId &&
          runtimeDeployReadiness.summary?.latestReceiptId,
      ),
      "medium",
      `runtime=${runtimeReconciliation.summary?.runtimeReceiptId || "missing"}; surface=${runtimeReconciliation.summary?.surfaceReceiptId || "missing"}; refresh=${runtimeReconciliation.summary?.refreshReceiptId || "missing"}; explain=${runtimeExplanation.summary?.latestReceiptId || "missing"}; deploy=${runtimeDeployReadiness.summary?.latestReceiptId || "missing"}.`,
      "Record explanation and deploy-readiness receipts after the core runtime receipt set is fresh.",
      "npm run explain:runtime && npm run audit:runtime-deploy",
    ),
    check(
      "route-manifest",
      requiredRoutes.every((route) => publicRoutes.includes(route)),
      "high",
      `${requiredRoutes.filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes.length} runtime evidence chain route(s) declared.`,
      "Add runtime evidence chain report, plan, and history routes to runtimeRouteManifest.",
      "npm run record:runtime-surface",
    ),
    check(
      "refresh-plan",
      (refreshPlan.endpoints || []).includes(ENDPOINT) && !(refreshPlan.endpoints || []).some((endpoint) => endpoint.startsWith("/api/private")),
      "medium",
      `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"}; privateRefresh=${(refreshPlan.endpoints || []).filter((endpoint) => endpoint.startsWith("/api/private")).length}.`,
      "Add runtime evidence chain to safe evidence refresh and keep private routes out.",
      "npm run refresh:evidence",
    ),
    check(
      "script-coverage",
      Boolean(scripts["audit:runtime-chain"]),
      "medium",
      `audit:runtime-chain=${Boolean(scripts["audit:runtime-chain"])}`,
      "Add the audit:runtime-chain package script and recorder.",
      "npm run audit:runtime-chain",
    ),
    check(
      "overclaim-boundary",
      nonClaims.length >= 4 &&
        nonClaims.some((item) => /does not deploy/i.test(item)) &&
        nonClaims.some((item) => /CDN|provider|DNS/i.test(item)) &&
        nonClaims.some((item) => /private/i.test(item)),
      "high",
      `${nonClaims.length} non-claim boundary item(s).`,
      "Keep the runtime evidence chain explicit about what local receipts cannot prove.",
      "npm run check",
    ),
  ];
}

function link({ id, label, endpoint, score, band, receiptId, freshness, evidence, nonClaim, verificationCommand }) {
  const normalizedScore = clamp(Math.round(score || 0), 0, 100);
  return {
    id,
    label,
    endpoint,
    score: normalizedScore,
    band: band || bandFor(normalizedScore),
    receiptId,
    freshness,
    blocking: normalizedScore < 85 || freshness === "stale" || freshness === "missing" || freshness === "blocked",
    evidence,
    nonClaim,
    verificationCommand,
  };
}

function evidenceChainNonClaims() {
  return [
    "This chain does not deploy, publish, mutate git history, change provider configuration, or contact third parties.",
    "This chain does not prove CDN cache state, DNS propagation, provider dashboard settings, external uptime, or hosted runtime parity.",
    "This chain does not inspect private cockpit contents, private files, credentials, calendars, inboxes, or third-party accounts.",
    "This chain does not replace a human read of hosted public runtime truth before claiming production equivalence.",
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

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
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
  appendRuntimeEvidenceChainReceipt,
  buildRuntimeEvidenceChainHistory,
  buildRuntimeEvidenceChainReport,
  buildRuntimeEvidenceChainReportFromReceipt,
  buildRuntimeEvidenceChainResponse,
  readLatestRuntimeEvidenceChainReceipt,
  readRuntimeEvidenceChainHistoryWindow,
  readRuntimeEvidenceChainReceipts,
  runtimeEvidenceChainPlan,
};
