const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/evaluation/claim-calibration";
const STORE_RELATIVE_PATH = path.join("var", "claim-calibration-receipts.json");
const maxReceipts = 50;
const COMPACT_HISTORY_ROW_LIMIT = 5;
const COMPACT_HISTORY_MATRIX_PREVIEW_LIMIT = 2;
const COMPACT_HISTORY_REPAIR_PREVIEW_LIMIT = 2;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function claimCalibrationPlan() {
  return {
    mode: "claim-calibration-benchmark-plan",
    command: "npm run audit:claim-calibration",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe claim/evaluation endpoints, writes a local receipt under var/, and does not contact external services, collect visitor analytics, enable private cockpit data, publish, deploy, or mutate third-party systems.",
  };
}

function buildClaimCalibrationReport({
  claims,
  projects,
  trust,
  proofQuality,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const calibrations = claims.map((claim) => calibrateClaim(claim, projects));
  const checks = calibrationChecks({ claims, calibrations, trust, proofQuality, routeManifest, refreshPlan, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const byBand = countBy(calibrations, "calibrationBand");

  return {
    generatedAt: new Date().toISOString(),
    mode: "claim-calibration-benchmark",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This benchmark grades local public-safe claim records against their modeled evidence strength, source material, freshness, privacy projection, and repair guidance. It is not external fact-checking, legal review, academic peer review, live website verification, or private-document inspection.",
    sideEffectBoundary: claimCalibrationPlan().sideEffectBoundary,
    plan: claimCalibrationPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      claims: claims.length,
      projects: projects.length,
      averageClaimScore: average(calibrations.map((item) => item.score)),
      publishReady: byBand["publish-ready"] || 0,
      caveatRequired: byBand["caveat-required"] || 0,
      repairRequired: byBand["repair-required"] || 0,
      privateReferences: trust.counts?.privateReferences || 0,
      latestReceiptId: receipts[0]?.id || null,
    },
    checks,
    calibrationPolicy: {
      publishReady: "Allowed only for link-backed or source-backed public-safe claims with source material, no stale freshness, no contradiction, and no absolute wording risk.",
      caveatRequired: "Used when a claim has evidence but should retain public-safe caveats because it is private-referenced, older, or wording-sensitive.",
      repairRequired: "Used for needs-source claims, missing source material, non-public-safe private projection, stale evidence, or contradiction pressure.",
      forbiddenPromotion: "needs-source claims must never be labeled publish-ready.",
    },
    calibrationMatrix: calibrations,
    repairQueue: calibrations
      .filter((item) => item.calibrationBand !== "publish-ready")
      .sort((left, right) => right.riskScore - left.riskScore || left.id.localeCompare(right.id))
      .slice(0, 12)
      .map((item) => ({
        claimId: item.id,
        project: item.project,
        calibrationBand: item.calibrationBand,
        riskScore: item.riskScore,
        repairAction: item.repairAction,
        verificationCommand: item.verificationCommand,
      })),
    nonClaims: [
      "Does not assert every claim is externally verified; it grades the current local evidence model.",
      "Does not inspect private files, inboxes, credentials, dashboards, or unpublished documents.",
      "Does not replace manual fact-checking before applications, outreach, publication, or legal use.",
      "Does not promote needs-source or private-reference claims beyond their modeled evidence.",
    ],
    nextAction: failing[0]?.repairAction || "Claim calibration is locally benchmarked; rerun after claim, proof, route, or refresh changes.",
    latestReceipt: receipts[0]
      ? {
          id: receipts[0].id,
          checkedAt: receipts[0].checkedAt,
          score: receipts[0].summary?.score || 0,
          passing: receipts[0].summary?.passing || 0,
          checks: receipts[0].summary?.checks || 0,
        }
      : null,
    verificationCommand: "npm run audit:claim-calibration && npm run check && npm run verify",
  };
}

function buildClaimCalibrationReportFromReceipt(receipt) {
  if (!isUsableClaimCalibrationReceipt(receipt)) return null;
  const report = receipt.report;

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs claim calibration from the latest local receipt. It is not fresh external fact-checking, legal review, academic peer review, live website verification, or private-document inspection.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || claimCalibrationPlan().sideEffectBoundary,
    plan: claimCalibrationPlan(),
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
    verificationCommand: report.verificationCommand || "npm run audit:claim-calibration && npm run check && npm run verify",
  };
}

function buildClaimCalibrationResponse(report, { detail = "summary", matrixPreviewLimit = 3, repairPreviewLimit = 1 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedMatrixLimit = Math.max(3, Math.min(Number(matrixPreviewLimit) || 8, 100));
  const boundedRepairLimit = Math.max(1, Math.min(Number(repairPreviewLimit) || 4, 50));
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      claimCalibrationPayloadPolicy: {
        fullDetail: true,
        matrixPreviewLimit: boundedMatrixLimit,
        repairPreviewLimit: boundedRepairLimit,
        calibrationRowsReturned: report.calibrationMatrix?.length || 0,
        repairQueueReturned: report.repairQueue?.length || 0,
      },
    };
  }

  const matrixPreview = selectCalibrationMatrixPreview(report.calibrationMatrix || [], boundedMatrixLimit);
  const repairPreview = (report.repairQueue || []).slice(0, boundedRepairLimit);
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    refreshEndpoint: report.refreshEndpoint,
    summary: summarizeClaimCalibrationCompactSummary(report.summary),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    calibrationPolicySummary: summarizeClaimCalibrationPolicy(report.calibrationPolicy),
    claimCalibrationPayloadPolicy: {
      fullDetail: false,
      fullCalibrationRows: report.calibrationMatrix?.length || 0,
      fullRepairQueueRows: report.repairQueue?.length || 0,
      fullDetailAvailable: true,
    },
    checks: selectClaimCalibrationCheckPreview(report.checks || []).map(summarizeClaimCalibrationCheck),
    calibrationMatrix: matrixPreview.map(summarizeCalibrationMatrixItem),
    repairQueue: repairPreview.map(summarizeClaimCalibrationRepairQueueItem),
    nonClaimCount: report.nonClaims?.length || 0,
  };
}

function summarizeClaimCalibrationPlan(plan = claimCalibrationPlan()) {
  return {
    mode: plan.mode,
    command: plan.command,
    endpoint: plan.endpoint,
    receiptStore: plan.receiptStore,
  };
}

function summarizeClaimCalibrationPolicy(policy = {}) {
  return {
    blocksNeedsSourcePromotion: /needs-source/i.test(policy.forbiddenPromotion || ""),
  };
}

function summarizeClaimCalibrationCompactSummary(summary = {}) {
  return {
    score: summary.score || 0,
    claims: summary.claims || 0,
    publishReady: summary.publishReady || 0,
    caveatRequired: summary.caveatRequired || 0,
    repairRequired: summary.repairRequired || 0,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function buildClaimCalibrationHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const compactRows = fullDetail ? limited : limited.slice(0, COMPACT_HISTORY_ROW_LIMIT);
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "claim-calibration-benchmark-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "Full local claim-calibration receipt history; this is not external fact-checking, private-file inspection, publishing, analytics, or claim mutation."
      : undefined,
    sideEffectBoundary: fullDetail
      ? "Reads local claim-calibration receipts only; no external fact-checking, private-file inspection, publishing, analytics, or claim mutation."
      : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail,
          defaultLimit: 5,
          historyRowLimit: boundedLimit,
          historyRowsReturned: limited.length,
          windowReceipts: limited.length,
          fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
          fullReportEndpoint: `${ENDPOINT}?detail=full`,
        }
      : {
          fullDetail,
          fullDetailAvailable: true,
          historyRowLimit: COMPACT_HISTORY_ROW_LIMIT,
          historyRowsReturned: compactRows.length,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
    },
    definitions: fullDetail ? undefined : {
      fullReportEndpoint: `${ENDPOINT}?detail=full`,
    },
    receipts: fullDetail
      ? limited
      : compactRows.map((receipt, index) => summarizeClaimCalibrationReceipt(receipt, { includePreview: index === 0, trendOnly: index > 0 })),
    nextAction: limited[0]
      ? fullDetail ? "History available; rerun after claim, proof-quality, route-manifest, or refresh-plan changes." : undefined
      : "Run npm run audit:claim-calibration to create claim calibration history.",
    verificationCommand: fullDetail ? "npm run audit:claim-calibration && node --test test/api-contract.test.mjs" : undefined,
  };
}

function appendClaimCalibrationReceipt(root, receipt) {
  const receipts = readClaimCalibrationReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readClaimCalibrationReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestClaimCalibrationReceipt(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return null;
  try {
    const cacheKey = receiptCacheKey(storePath);
    const cached = latestReceiptCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.receipt;
    const text = readFileSync(storePath, "utf8");
    const receiptsIndex = text.indexOf('"receipts"');
    const arrayStart = receiptsIndex === -1 ? -1 : text.indexOf("[", receiptsIndex);
    let objectStart = arrayStart === -1 ? -1 : text.indexOf("{", arrayStart);
    while (objectStart !== -1) {
      const objectEnd = findJsonObjectEnd(text, objectStart);
      if (objectEnd === -1) break;
      const receipt = JSON.parse(text.slice(objectStart, objectEnd + 1));
      if (isUsableClaimCalibrationReceipt(receipt)) {
        latestReceiptCache.set(storePath, { cacheKey, receipt });
        return receipt;
      }
      objectStart = text.indexOf("{", objectEnd + 1);
    }
    latestReceiptCache.set(storePath, { cacheKey, receipt: null });
    return null;
  } catch {
    return null;
  }
}

function readClaimCalibrationHistoryWindow(root, { limit = 20 } = {}) {
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

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function summarizeClaimCalibrationReceipt(receipt, { includePreview = false, trendOnly = false } = {}) {
  const summary = receipt.summary || receipt.report?.summary || {};
  const report = receipt.report || {};
  const matrix = receipt.calibrationMatrix || report.calibrationMatrix || [];
  const repairQueue = receipt.repairQueue || report.repairQueue || [];
  const checks = receipt.checks || report.checks || [];
  if (trendOnly) {
    return {
      id: receipt.id,
      checkedAt: receipt.checkedAt || null,
      summary: {
        score: summary.score || 0,
        claims: summary.claims || 0,
      },
    };
  }
  const compact = {
    id: receipt.id,
    checkedAt: receipt.checkedAt || null,
    cacheUsable: isUsableClaimCalibrationReceipt(receipt),
    summary: {
      score: summary.score || 0,
      band: summary.band || "unknown",
      checks: summary.checks || 0,
      passing: summary.passing || 0,
      failing: summary.failing || 0,
      claims: summary.claims || 0,
    },
    checkSummary: summarizeHistoryChecks(checks, summary),
    repairQueueSummary: summarizeRepairQueue(repairQueue, summary),
    matrixSummary: summarizeCalibrationMatrix(matrix, summary),
    nonClaimCount: (receipt.nonClaims || report.nonClaims || []).length,
  };
  if (includePreview) {
    compact.repairQueuePreview = repairQueue.slice(0, COMPACT_HISTORY_REPAIR_PREVIEW_LIMIT).map((item) => ({
      claimId: item.claimId,
      project: item.project,
      calibrationBand: item.calibrationBand,
      riskScore: item.riskScore,
    }));
    compact.matrixPreview = selectCalibrationMatrixPreview(matrix, COMPACT_HISTORY_MATRIX_PREVIEW_LIMIT).map(summarizeCalibrationHistoryMatrixItem);
  }
  return compact;
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

function summarizeHistoryChecks(checks, summary = {}) {
  const failing = checks.filter((check) => !check.passed);
  return {
    total: summary.checks || checks.length,
    passed: summary.passing || checks.length - failing.length,
    failed: summary.failing || failing.length,
  };
}

function summarizeRepairQueue(repairQueue, summary = {}) {
  const byBand = countBy(repairQueue, "calibrationBand");
  return {
    total: repairQueue.length || summary.repairRequired || 0,
    highestRisk: repairQueue.reduce((max, item) => Math.max(max, Number(item.riskScore || 0)), 0),
    byBand,
  };
}

function summarizeCalibrationMatrix(matrix, summary = {}) {
  return {
    total: summary.claims || matrix.length,
    byBand: {
      "publish-ready": summary.publishReady || matrix.filter((item) => item.calibrationBand === "publish-ready").length,
      "caveat-required": summary.caveatRequired || matrix.filter((item) => item.calibrationBand === "caveat-required").length,
      "repair-required": summary.repairRequired || matrix.filter((item) => item.calibrationBand === "repair-required").length,
    },
    averageScore: summary.averageClaimScore || average(matrix.map((item) => item.score)),
  };
}

function isUsableClaimCalibrationReceipt(receipt) {
  if (!receipt || receipt.mode !== "claim-calibration-benchmark-receipt" || !receipt.summary || !receipt.report) return false;
  const report = receipt.report;
  if (
    report.mode !== "claim-calibration-benchmark" ||
    (report.detail && report.detail !== "full") ||
    !report.summary ||
    !report.calibrationPolicy ||
    !Array.isArray(report.calibrationMatrix) ||
    !report.calibrationMatrix.every((item) => item.id && item.calibrationBand && item.repairAction && item.verificationCommand) ||
    !Array.isArray(report.repairQueue) ||
    !report.repairQueue.every((item) => item.claimId && item.calibrationBand && item.verificationCommand) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.verificationCommand) ||
    !Array.isArray(report.nonClaims) ||
    !report.nextAction ||
    !report.plan
  ) {
    return false;
  }
  return report.calibrationMatrix.length === report.summary.claims && report.repairQueue.length <= report.calibrationMatrix.length;
}

function selectCalibrationMatrixPreview(items, limit) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 36, items.length || 1));
  const priority = { "repair-required": 0, "caveat-required": 1, "publish-ready": 2 };
  return items
    .slice()
    .sort((left, right) => {
      const bandDelta = (priority[left.calibrationBand] ?? 9) - (priority[right.calibrationBand] ?? 9);
      return bandDelta || right.riskScore - left.riskScore || left.id.localeCompare(right.id);
    })
    .slice(0, boundedLimit);
}

function summarizeCalibrationMatrixItem(item) {
  return {
    id: item.id,
    project: item.project,
    calibrationBand: item.calibrationBand,
    score: item.score,
    riskScore: item.riskScore,
    absoluteWordingCount: item.absoluteWording?.length || 0,
    guidanceAvailable: Boolean(item.caveat || item.repairAction || item.verificationCommand),
  };
}

function summarizeClaimCalibrationCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function selectClaimCalibrationCheckPreview(checks) {
  const seen = new Set();
  return checks.filter((check) => {
    const keep = !check.passed || check.severity === "high" || check.id === "needs-source-not-promoted";
    if (!keep || seen.has(check.id)) return false;
    seen.add(check.id);
    return true;
  });
}

function summarizeClaimCalibrationRepairQueueItem(item) {
  return {
    claimId: item.claimId,
    project: item.project,
    calibrationBand: item.calibrationBand,
    riskScore: item.riskScore,
    verificationCommandAvailable: Boolean(item.verificationCommand),
  };
}

function summarizeCalibrationHistoryMatrixItem(item) {
  return {
    id: item.id,
    project: item.project,
    calibrationBand: item.calibrationBand,
    score: item.score,
    riskScore: item.riskScore,
    sourceCount: item.sourceCount,
  };
}

function boundedHistoryLimit(limit) {
  const numericLimit = Number(limit);
  if (!Number.isFinite(numericLimit)) return 20;
  return Math.max(1, Math.min(Math.trunc(numericLimit), 100));
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

function calibrateClaim(claim, projects) {
  const project = projects.find((item) => item.slug === claim.relatedProject);
  const sourceCount = claim.sourceMaterial?.length || 0;
  const hasPublicUrl = (claim.sourceMaterial || []).some((source) => Boolean(source.url));
  const absoluteWording = absoluteRiskWords(claim.text);
  const isPrivateSafe = claim.privacyLevel === "public" || claim.publicVisibility === "public-safe-reference";
  const needsSource = claim.evidenceStrength === "needs-source";
  const stale = Number(claim.freshnessScore || 0) < 55;
  const contradicted = claim.contradictionStatus && claim.contradictionStatus !== "none-known";
  const repairRequired = needsSource || sourceCount === 0 || !isPrivateSafe || stale || contradicted;
  const caveatRequired = !repairRequired && (claim.privacyLevel !== "public" || absoluteWording.length > 0 || !hasPublicUrl);
  const calibrationBand = repairRequired ? "repair-required" : caveatRequired ? "caveat-required" : "publish-ready";
  const supportScore = { "link-backed": 100, "source-backed": 82, "needs-source": 45 }[claim.evidenceStrength] || 40;
  const privacyScore = isPrivateSafe ? 100 : 20;
  const freshnessScore = Number(claim.freshnessScore || 0);
  const wordingScore = Math.max(35, 100 - absoluteWording.length * 22);
  const sourceScore = Math.min(100, sourceCount * 24 + (hasPublicUrl ? 28 : 0));
  const score = average([supportScore, privacyScore, freshnessScore, wordingScore, sourceScore]);
  const riskScore = Math.max(0, 100 - score + (needsSource ? 20 : 0) + (claim.privacyLevel !== "public" ? 8 : 0));

  return {
    id: claim.id,
    project: project?.slug || null,
    title: project?.title || "Profile",
    claimType: claim.claimType,
    evidenceStrength: claim.evidenceStrength,
    calibrationBand,
    score,
    riskScore: clamp(Math.round(riskScore), 0, 100),
    freshnessScore,
    confidenceScore: Number(claim.confidenceScore || 0),
    privacyLevel: claim.privacyLevel,
    publicVisibility: claim.publicVisibility,
    sourceCount,
    hasPublicUrl,
    absoluteWording,
    verificationResult: claim.verificationResult,
    caveat: caveatFor({ claim, calibrationBand, absoluteWording, hasPublicUrl }),
    repairAction: repairFor({ claim, calibrationBand, absoluteWording }),
    verificationCommand: claim.relatedProject ? `node server.js # then open /api/evidence/${claim.relatedProject}` : "node server.js # then open /api/trust",
  };
}

function calibrationChecks({ claims, calibrations, trust, proofQuality, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const scripts = packageManifest.scripts || {};
  const byId = new Map(calibrations.map((item) => [item.id, item]));
  const needsSource = claims.filter((claim) => claim.evidenceStrength === "needs-source");
  const privateClaims = claims.filter((claim) => claim.privacyLevel !== "public");

  return [
    check({
      id: "claim-coverage",
      severity: "high",
      passed: calibrations.length === claims.length && claims.length === (trust.counts?.totalClaims || claims.length),
      detail: `${calibrations.length}/${claims.length} claim(s) calibrated; trust total=${trust.counts?.totalClaims || 0}.`,
      repairAction: "Calibrate every public claim from the claim ledger and keep trust counts aligned.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/claim-calibration",
    }),
    check({
      id: "needs-source-not-promoted",
      severity: "high",
      passed: needsSource.every((claim) => byId.get(claim.id)?.calibrationBand === "repair-required"),
      detail: `${needsSource.filter((claim) => byId.get(claim.id)?.calibrationBand === "repair-required").length}/${needsSource.length} needs-source claim(s) are repair-required.`,
      repairAction: "Prevent needs-source claims from being labeled publish-ready or caveat-only.",
      verificationCommand: "npm run audit:claim-calibration",
    }),
    check({
      id: "private-reference-gate",
      severity: "high",
      passed: privateClaims.every((claim) => claim.publicVisibility === "public-safe-reference"),
      detail: `${privateClaims.filter((claim) => claim.publicVisibility === "public-safe-reference").length}/${privateClaims.length} private reference(s) stay public-safe.`,
      repairAction: "Keep private-reference claims projected only as public-safe references.",
      verificationCommand: "npm run check",
    }),
    check({
      id: "source-material-present",
      severity: "medium",
      passed: calibrations.every((item) => item.sourceCount > 0),
      detail: `${calibrations.filter((item) => item.sourceCount > 0).length}/${calibrations.length} calibrated claim(s) have source material.`,
      repairAction: "Attach at least structured source material to every claim before calibration.",
      verificationCommand: "npm run check",
    }),
    check({
      id: "repair-guidance-present",
      severity: "medium",
      passed: calibrations.every((item) => item.repairAction && item.verificationCommand),
      detail: `${calibrations.filter((item) => item.repairAction && item.verificationCommand).length}/${calibrations.length} calibrated claim(s) include repair and verification guidance.`,
      repairAction: "Give every calibrated claim an explicit repair action and verification command.",
      verificationCommand: "npm run audit:claim-calibration",
    }),
    check({
      id: "proof-quality-coherence",
      severity: "medium",
      passed:
        (proofQuality.summary?.claims || 0) === claims.length &&
        (proofQuality.dimensions || []).some((dimension) => dimension.id === "claim-traceability" && dimension.score >= 70),
      detail: `proof claims=${proofQuality.summary?.claims || 0}; ledger claims=${claims.length}; traceability=${dimensionScore(proofQuality, "claim-traceability")}/100.`,
      repairAction: "Keep claim calibration aligned with proof-quality claim traceability.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/proof-quality",
    }),
    check({
      id: "route-manifest",
      severity: "high",
      passed: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => publicRoutes.includes(route)),
      detail: `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => publicRoutes.includes(route)).length}/3 claim-calibration route(s) declared.`,
      repairAction: "Add claim-calibration routes to runtimeRouteManifest.",
      verificationCommand: "npm run record:runtime-surface",
    }),
    check({
      id: "refresh-plan",
      severity: "medium",
      passed: refreshEndpoints.includes(ENDPOINT),
      detail: `${ENDPOINT} ${refreshEndpoints.includes(ENDPOINT) ? "covered" : "missing"} in safe refresh plan.`,
      repairAction: "Add /api/evaluation/claim-calibration to the safe evidence refresh plan.",
      verificationCommand: "npm run refresh:evidence",
    }),
    check({
      id: "script-coverage",
      severity: "medium",
      passed: Boolean(scripts["audit:claim-calibration"]),
      detail: `audit:claim-calibration=${Boolean(scripts["audit:claim-calibration"])}`,
      repairAction: "Add the audit:claim-calibration package script.",
      verificationCommand: "npm run audit:claim-calibration",
    }),
  ];
}

function check({ id, severity, passed, detail, repairAction, verificationCommand }) {
  return { id, severity, passed: Boolean(passed), detail, repairAction, verificationCommand };
}

function absoluteRiskWords(text) {
  const words = String(text).toLowerCase().match(/\b(best|only|always|never|guaranteed|perfect|unbeatable|clearest)\b/g) || [];
  return [...new Set(words)];
}

function caveatFor({ claim, calibrationBand, absoluteWording, hasPublicUrl }) {
  if (calibrationBand === "repair-required") return `Keep as repair-required until stronger evidence is attached: ${claim.suggestedRepair}`;
  if (claim.privacyLevel !== "public") return "Public-safe private reference; do not expose private source material.";
  if (absoluteWording.length) return `Wording caveat required for absolute term(s): ${absoluteWording.join(", ")}.`;
  if (!hasPublicUrl) return "Source-backed local record; keep caveat until a public URL or approved artifact is attached.";
  return "Public-safe claim with modeled source support.";
}

function repairFor({ claim, calibrationBand, absoluteWording }) {
  if (calibrationBand === "publish-ready") return "Keep source fresh and rerun claim calibration after edits.";
  if (absoluteWording.length) return `Soften or source absolute wording: ${absoluteWording.join(", ")}.`;
  return claim.suggestedRepair || "Attach stronger source material or downgrade the claim.";
}

function dimensionScore(report, id) {
  return (report.dimensions || []).find((dimension) => dimension.id === id)?.score || 0;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    counts[item[key]] = (counts[item[key]] || 0) + 1;
    return counts;
  }, {});
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

module.exports = {
  appendClaimCalibrationReceipt,
  buildClaimCalibrationHistory,
  buildClaimCalibrationReportFromReceipt,
  buildClaimCalibrationReport,
  buildClaimCalibrationResponse,
  claimCalibrationPlan,
  readClaimCalibrationHistoryWindow,
  readClaimCalibrationReceipts,
  readLatestClaimCalibrationReceipt,
};
