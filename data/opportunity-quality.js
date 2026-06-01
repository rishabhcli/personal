const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/evaluation/opportunity-quality";
const STORE_RELATIVE_PATH = path.join("var", "opportunity-quality-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function opportunityQualityPlan() {
  return {
    mode: "opportunity-engine-quality-plan",
    command: "npm run audit:opportunity-quality",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing opportunities, opportunity packages, requirements, missing-proof blockers, effort/upside labels, artifacts, weakness maps, or maintenance issues.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe opportunity quality endpoints, writes a local receipt under var/, and does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems.",
  };
}

function buildOpportunityQualityEvaluation({
  opportunities,
  packages,
  packets,
  artifactCatalog,
  weaknessMap,
  maintenance,
  routeManifest = { publicApiRoutes: [] },
  refreshPlan = { endpoints: [] },
  packageManifest = { scripts: {} },
  receipts = [],
}) {
  const opportunityItems = opportunities.opportunities || [];
  const packageItems = packages.packages || [];
  const dimensions = [
    dimension({
      id: "fit-explainability",
      label: "Fit explainability",
      score: percent(
        opportunityItems.filter((item) => item.rankExplanation && item.sourceTrace?.length && item.relatedProof?.length).length,
        opportunityItems.length,
      ),
      weight: 0.18,
      detail: `${opportunityItems.filter((item) => item.rankExplanation && item.sourceTrace?.length && item.relatedProof?.length).length}/${opportunityItems.length} opportunity route(s) explain fit with source traces and related proof.`,
    }),
    dimension({
      id: "package-readiness",
      label: "Package readiness",
      score: average(packageItems.map((item) => item.readinessScore)),
      weight: 0.18,
      detail: `${packages.summary.averageReadiness}/100 average package readiness; ${packages.summary.readyForManualUse} ready for manual use.`,
    }),
    dimension({
      id: "requirement-coverage",
      label: "Requirement coverage",
      score: requirementCoverageScore(packageItems),
      weight: 0.18,
      detail: `${coveredRequirements(packageItems)}/${totalRequirements(packageItems)} package requirement(s) are directly covered.`,
    }),
    dimension({
      id: "missing-proof-actionability",
      label: "Missing-proof actionability",
      score: percent(packageItems.filter((item) => item.blockers.length && item.nextAction && item.verificationCommand).length, packageItems.length),
      weight: 0.14,
      detail: `${packageItems.filter((item) => item.blockers.length && item.nextAction && item.verificationCommand).length}/${packageItems.length} package(s) expose blockers, next action, and verification command.`,
    }),
    dimension({
      id: "repair-plan-actionability",
      label: "Repair plan actionability",
      score: repairPlanActionabilityScore(packageItems),
      weight: 0.12,
      detail: `${repairPlanStepCount(packageItems)} verification-backed local repair step(s) across ${packageItems.length} package(s).`,
    }),
    dimension({
      id: "evidence-bundle-depth",
      label: "Evidence bundle depth",
      score: evidenceBundleScore(packageItems),
      weight: 0.14,
      detail: `${bundleArtifactCount(packageItems)} artifact reference(s) and ${bundleClaimCount(packageItems)} claim reference(s) across opportunity packages.`,
    }),
    dimension({
      id: "effort-upside-calibration",
      label: "Effort/upside calibration",
      score: percent(opportunityItems.filter((item) => item.estimatedEffort && item.expectedUpside).length, opportunityItems.length),
      weight: 0.1,
      detail: `${opportunityItems.filter((item) => item.estimatedEffort && item.expectedUpside).length}/${opportunityItems.length} opportunity route(s) include effort and upside labels.`,
    }),
    dimension({
      id: "manual-safety",
      label: "Manual-only safety",
      score: manualSafetyScore({ packages, packageItems }),
      weight: 0.08,
      detail: `${packageItems.filter((item) => item.trackingBoundary?.livePostingKnown === false && item.trackingBoundary?.applicationStateKnown === false).length}/${packageItems.length} package(s) preserve archetype/application-state boundaries.`,
    }),
  ];
  const score = weightedScore(dimensions);
  const packageBenchmarks = packageItems.map((item) => packageBenchmark({ item, artifactCatalog, weaknessMap, maintenance })).sort((left, right) => right.score - left.score);
  const weakestDimensions = dimensions.slice().sort((left, right) => left.score - right.score).slice(0, 3);
  const checks = qualityChecks({ opportunities, opportunityItems, packageItems, packages, packageBenchmarks, routeManifest, refreshPlan, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "opportunity-engine-quality-evaluation",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This evaluation grades local public-safe opportunity radar and package quality. It does not claim real postings, deadlines, applications, interviews, scholarships, grants, funding, recipient interest, or external outreach status.",
    sideEffectBoundary:
      "The endpoint reads local public-safe opportunity, package, artifact, weakness, maintenance, route, and refresh data only. It does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems.",
    methodology: {
      scale: "0-100 weighted score",
      bandPolicy: "high >= 85, medium >= 65, low < 65",
      dimensions: dimensions.map((item) => ({ id: item.id, weight: item.weight })),
      manualUseRule: "A high score means the package is better prepared for manual review, not that it should be sent or submitted automatically.",
    },
    plan: opportunityQualityPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      opportunities: opportunityItems.length,
      packages: packageItems.length,
      readyForManualUse: packages.summary.readyForManualUse,
      totalMissingProof: packages.summary.totalMissingProof,
      repairPlanItems: packages.summary.repairPlanItems || repairPlanStepCount(packageItems),
      manualOnlyPackages:
        packages.summary.manualOnlyPackages ||
        packageItems.filter((item) => item.packageReadiness?.manualOnly && item.packageReadiness?.externalWrite === false).length,
      averageReadiness: packages.summary.averageReadiness,
      packetCount: packets.packets?.length || 0,
      artifactCount: artifactCatalog.counts.artifacts,
      maintenanceIssues: maintenance.summary.issues,
      highRiskPackages: packageBenchmarks.filter((item) => item.riskBand === "high").length,
      routeCovered: (routeManifest.publicApiRoutes || []).includes(ENDPOINT),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      latestReceiptId: latestReceipt?.id || null,
    },
    dimensions,
    packageBenchmarks,
    checks,
    topRisks: weakestDimensions.map((item) => ({
      id: item.id,
      label: item.label,
      score: item.score,
      recommendation: recommendationForDimension(item.id),
    })),
    recommendations: [
      ...weakestDimensions.map((item) => recommendationForDimension(item.id)),
      "Keep opportunity routes archetype-only until a real posting, deadline, and application source are ingested.",
    ],
    limitations: [
      "The radar is archetype-based and has no live posting ingestion yet.",
      "Scores use local deterministic heuristics, not recruiter, professor, grant, or investor feedback.",
      "Manual outreach, submissions, scheduling, and application status must happen outside this app.",
    ],
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
      (weakestDimensions[0]
        ? recommendationForDimension(weakestDimensions[0].id)
        : "Keep opportunity quality refreshed after opportunity evidence changes."),
    verificationCommand: "npm run audit:opportunity-quality && npm run check && npm run verify",
  };
}

function buildOpportunityQualityEvaluationFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "opportunity-engine-quality-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "opportunity-engine-quality-evaluation" ||
    !report.summary ||
    !report.sourceBoundary ||
    !report.methodology ||
    !Array.isArray(report.dimensions) ||
    !report.dimensions.every((dimension) => dimension.id && dimension.label && Number.isFinite(dimension.score) && dimension.detail) ||
    !Array.isArray(report.packageBenchmarks) ||
    !report.packageBenchmarks.every((benchmark) => benchmark.id && benchmark.label && benchmark.verificationCommand && Number.isInteger(benchmark.repairPlanItems)) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand) ||
    !Array.isArray(report.topRisks) ||
    !Array.isArray(report.recommendations) ||
    !Array.isArray(report.limitations) ||
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
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs opportunity quality from the latest local receipt. It is cached local scoring, not live posting, application, outreach, schedule, recipient-interest, or third-party account state.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || opportunityQualityPlan().sideEffectBoundary,
    plan: opportunityQualityPlan(),
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
    verificationCommand: report.verificationCommand || "npm run audit:opportunity-quality && npm run check",
  };
}

function buildOpportunityQualityResponse(
  report,
  { detail = "summary", dimensionPreviewLimit = 2, packageBenchmarkPreviewLimit = 2, checkPreviewLimit = 3 } = {},
) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const dimensions = report.dimensions || [];
  const packageBenchmarks = report.packageBenchmarks || [];
  const checks = report.checks || [];
  const repairActions = report.repairActions || [];
  const dimensionLimit = boundedPreviewLimit(dimensionPreviewLimit, 2, 8);
  const packageBenchmarkLimit = boundedPreviewLimit(packageBenchmarkPreviewLimit, 2, 8);
  const checkLimit = boundedPreviewLimit(checkPreviewLimit, 3, 12);
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      opportunityQualityPayloadPolicy: opportunityQualityPayloadPolicy({ report, fullDetail }),
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachedFromReceipt ? undefined : report.cachePolicy,
    detail: "summary",
    compact: true,
    refreshEndpoint: report.refreshEndpoint,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeOpportunityQualityCompactSummary(report.summary),
    dimensionSummary: summarizeOpportunityQualityDimensionSummary(dimensions),
    dimensions: dimensions.slice(0, dimensionLimit).map(summarizeOpportunityQualityDimension),
    packageSummary: summarizeOpportunityQualityPackageSummary(packageBenchmarks, report.summary),
    packageBenchmarks: packageBenchmarks.slice(0, packageBenchmarkLimit).map(summarizeOpportunityQualityBenchmark),
    checkSummary: summarizeOpportunityQualityCheckSummary(checks, report.summary),
    checks: selectOpportunityQualityChecks(checks, checkLimit).map(summarizeOpportunityQualityCheck),
    repairActions: repairActions.length > 0 ? repairActions.slice(0, 3).map(({ id, priority }) => ({ id, priority })) : undefined,
    opportunityQualityPayloadPolicy: opportunityQualityPayloadPolicy({
      report,
      fullDetail,
    }),
  };
}

function appendOpportunityQualityReceipt(root, receipt) {
  const receipts = readOpportunityQualityReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readOpportunityQualityReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readOpportunityQualityHistoryWindow(root, { limit = 5 } = {}) {
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

function buildOpportunityQualityHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const latestReport = reportForReceipt(latest);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "opportunity-engine-quality-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "Full local opportunity-quality receipt history. It does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems."
      : undefined,
    sourceBoundaryAvailable: fullDetail ? undefined : true,
    sideEffectBoundary: fullDetail ? "Reads local opportunity-quality receipts only; no live posting ingestion, outreach, applications, scheduling, or third-party writes." : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: opportunityQualityHistoryPayloadPolicy({ fullDetail, returnedReceipts: limited.length }),
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      latestScore: latest?.summary?.score || 0,
    },
    definitions: fullDetail ? undefined : summarizeOpportunityQualityDefinitions(latestReport),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeOpportunityQualityReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? latest
        ? "History available; rerun after opportunity, package, artifact, weakness, or maintenance changes."
        : "Run npm run audit:opportunity-quality to create opportunity-quality history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:opportunity-quality && node --test test/api-contract.test.mjs" : undefined,
  };
}

function opportunityQualityHistoryPayloadPolicy({ fullDetail, returnedReceipts }) {
  if (!fullDetail) {
    return {
      fullDetail: false,
      fullDetailAvailable: true,
      historyRowsReturned: returnedReceipts,
    };
  }
  return {
    fullDetail: true,
    fullReportEndpoint: ENDPOINT,
    fullHistoryEndpoint: `${ENDPOINT}/history?detail=full`,
    returnedReceipts,
    latestReceiptPreview: "raw",
    olderReceiptPreview: "raw",
  };
}

function summarizeOpportunityQualityDefinitions(report) {
  const manualSafety = (report?.dimensions || []).find((dimension) => dimension.id === "manual-safety");
  return {
    dimensionIds: ["manual-safety"],
    manualSafetyWeight: manualSafety?.weight || 0,
    checkIds: ["proof-repair-plan"],
  };
}

function summarizeOpportunityQualityReceipt(receipt, { includePreview = false } = {}) {
  const report = reportForReceipt(receipt);
  const dimensions = receipt.dimensions || report?.dimensions || [];
  const packageBenchmarks = receipt.packageBenchmarks || report?.packageBenchmarks || [];
  const checks = receipt.checks || report?.checks || [];
  const historySummary = summarizeOpportunityQualityHistorySummary(receipt.summary || report?.summary);
  const compact = {
    id: receipt.id,
    score: historySummary.score,
    band: historySummary.band,
    checkCount: historySummary.checks,
    passedChecks: historySummary.passing,
    failedChecks: historySummary.failing,
    packages: historySummary.packages,
    totalMissingProof: historySummary.totalMissingProof,
    repairPlanItems: historySummary.repairPlanItems,
    highRiskPackages: historySummary.highRiskPackages,
  };
  if (!includePreview) {
    return {
      id: receipt.id,
      trendOnly: true,
      score: compact.score,
      totalMissingProof: compact.totalMissingProof,
    };
  }
  if (includePreview) {
    const dimensionSummary = summarizeDimensionScores(dimensions);
    const packageSummary = summarizePackageBenchmarks(packageBenchmarks, receipt.summary || report?.summary);
    const checkSummary = summarizeHistoryChecks(checks, receipt.summary || report?.summary);
    compact.dimensionCount = dimensionSummary.total;
    compact.averageDimensionScore = dimensionSummary.averageScore;
    compact.lowDimensions = dimensionSummary.low;
    compact.packageSummary = packageSummary;
    compact.passedChecks = checkSummary.passed;
    compact.failedChecks = checkSummary.failed;
    compact.dimensions = selectOpportunityQualityHistoryDimensions(dimensions).map((dimension) => ({ id: dimension.id }));
    compact.packageBenchmarks = packageBenchmarks.slice(0, 3).map((benchmark) => ({
      id: benchmark.id,
      score: benchmark.score || 0,
    }));
  }
  return compact;
}

function selectOpportunityQualityHistoryDimensions(dimensions) {
  const priority = ["manual-safety", "repair-plan-actionability"];
  const selected = [];
  const seen = new Set();
  for (const id of priority) {
    const dimension = dimensions.find((item) => item.id === id);
    if (dimension && !seen.has(dimension.id)) {
      selected.push(dimension);
      seen.add(dimension.id);
    }
  }
  return selected;
}

function summarizeOpportunityQualityHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    packages: summary.packages || 0,
    totalMissingProof: summary.totalMissingProof || 0,
    repairPlanItems: summary.repairPlanItems || 0,
    highRiskPackages: summary.highRiskPackages || 0,
  };
}

function summarizeOpportunityQualitySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    opportunities: summary.opportunities || 0,
    packages: summary.packages || 0,
    totalMissingProof: summary.totalMissingProof || 0,
    repairPlanItems: summary.repairPlanItems || 0,
    manualOnlyPackages: summary.manualOnlyPackages || 0,
    averageReadiness: summary.averageReadiness || 0,
    highRiskPackages: summary.highRiskPackages || 0,
    routeCovered: summary.routeCovered === true,
    refreshCovered: summary.refreshCovered === true,
  };
}

function summarizeOpportunityQualityCompactSummary(summary = {}) {
  return {
    packages: summary.packages || 0,
    passing: summary.passing || 0,
    repairPlanItems: summary.repairPlanItems || 0,
    manualOnlyPackages: summary.manualOnlyPackages || 0,
    routeCovered: summary.routeCovered === true,
    refreshCovered: summary.refreshCovered === true,
  };
}

function summarizeOpportunityQualityMethodology(methodology = {}) {
  return {
    scaleAvailable: Boolean(methodology.scale),
    bandPolicyAvailable: Boolean(methodology.bandPolicy),
    dimensionCount: methodology.dimensions?.length || 0,
    manualUseRuleAvailable: Boolean(methodology.manualUseRule),
  };
}

function summarizeOpportunityQualityPlan(plan = {}) {
  return {
    planEndpoint: `${ENDPOINT}/plan`,
    commandAvailable: Boolean(plan.command),
  };
}

function summarizeOpportunityQualityDimension(dimension) {
  return {
    id: dimension.id,
    score: dimension.score,
  };
}

function summarizeOpportunityQualityBenchmark(benchmark) {
  return {
    id: benchmark.id,
    repairPlanItems: benchmark.repairPlanItems,
    manualOnly: benchmark.manualOnly,
    verificationCommandAvailable: Boolean(benchmark.verificationCommand),
  };
}

function summarizeOpportunityQualityCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function summarizeOpportunityQualityDimensionSummary(dimensions = []) {
  return {
    manualSafetyAvailable: dimensions.some((dimension) => dimension.id === "manual-safety"),
    repairPlanActionabilityAvailable: dimensions.some((dimension) => dimension.id === "repair-plan-actionability"),
  };
}

function summarizeOpportunityQualityPackageSummary(packageBenchmarks = [], summary = {}) {
  return {
    total: summary.packages || packageBenchmarks.length,
  };
}

function summarizeOpportunityQualityCheckSummary(checks = [], summary = {}) {
  const failing = checks.filter((check) => !check.passed);
  return {
    total: summary.checks || checks.length,
    passed: summary.passing || checks.length - failing.length,
    failed: summary.failing || failing.length,
  };
}

function selectOpportunityQualityChecks(checks = [], limit = 3) {
  const preferred = ["opportunity-source-coverage", "proof-repair-plan", "script-coverage"];
  const selected = [];
  const seen = new Set();
  const add = (check) => {
    if (!check || seen.has(check.id)) return;
    selected.push(check);
    seen.add(check.id);
  };
  for (const id of preferred) add(checks.find((check) => check.id === id));
  for (const check of checks) {
    if (selected.length >= limit) break;
    add(check);
  }
  return selected.slice(0, limit);
}

function opportunityQualityPayloadPolicy({ report, fullDetail, previewLimits = {} }) {
  if (!fullDetail) {
    return {
      fullDetail: false,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail: true,
    compact: false,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    dimensionsReturned: report.dimensions?.length || 0,
    packageBenchmarksReturned: report.packageBenchmarks?.length || 0,
    checksReturned: report.checks?.length || 0,
    defaultOmittedFieldCount: 0,
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

function summarizeDimensionScores(dimensions) {
  const low = dimensions.filter((dimension) => Number(dimension.score || 0) < 65);
  return {
    total: dimensions.length,
    averageScore: average(dimensions.map((dimension) => dimension.score || 0)),
    low: low.map(({ id, score }) => ({ id, score: score || 0 })),
  };
}

function summarizePackageBenchmarks(packageBenchmarks, summary = {}) {
  return {
    total: summary.packages || packageBenchmarks.length,
    highRisk: summary.highRiskPackages || packageBenchmarks.filter((benchmark) => benchmark.riskBand === "high").length,
    manualOnly: summary.manualOnlyPackages || packageBenchmarks.filter((benchmark) => benchmark.manualOnly === true).length,
    readyForManualUse: summary.readyForManualUse || packageBenchmarks.filter((benchmark) => benchmark.readyForManualUse === true).length,
    averageReadiness: summary.averageReadiness || average(packageBenchmarks.map((benchmark) => benchmark.readinessScore || 0)),
    repairPlanItems: summary.repairPlanItems || packageBenchmarks.reduce((sum, benchmark) => sum + (benchmark.repairPlanItems || 0), 0),
  };
}

function summarizeHistoryChecks(checks, summary = {}) {
  const failing = checks.filter((check) => !check.passed);
  return {
    total: summary.checks || checks.length,
    passed: summary.passing || checks.length - failing.length,
    failed: summary.failing || failing.length,
    failing: failing.map(({ id, severity }) => ({ id, severity: severity || "medium" })),
  };
}

function summarizeRepairActions(repairActions) {
  return {
    total: repairActions.length,
    highPriority: repairActions.filter((action) => action.priority === "high").length,
    mediumPriority: repairActions.filter((action) => action.priority === "medium").length,
  };
}

function reportForReceipt(receipt) {
  return receipt?.report || null;
}

function boundedHistoryLimit(limit) {
  const numericLimit = Number(limit);
  if (!Number.isFinite(numericLimit)) return 5;
  return Math.max(1, Math.min(Math.trunc(numericLimit), maxReceipts));
}

function boundedPreviewLimit(limit, fallback, max) {
  const numericLimit = Number(limit);
  return Math.max(0, Math.min(Number.isFinite(numericLimit) && numericLimit >= 0 ? Math.trunc(numericLimit) : fallback, max));
}

function readLatestOpportunityQualityReceipt(root) {
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

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function packageBenchmark({ item, artifactCatalog, weaknessMap, maintenance }) {
  const requirementScore = coverageScore(item.requirementCoverage);
  const artifactCount = item.evidenceBundle.reduce((sum, project) => sum + project.artifacts.length, 0);
  const claimCount = item.evidenceBundle.reduce((sum, project) => sum + project.claims.length, 0);
  const projectRisks = item.evidenceBundle.map((project) => project.weakness?.riskLevel).filter(Boolean);
  const maintenanceIssues = (maintenance.issues || []).filter((issue) => item.evidenceBundle.some((project) => project.slug === issue.project));
  const weaknessProjects = (weaknessMap.projects || []).filter((project) => item.evidenceBundle.some((bundleProject) => bundleProject.slug === project.slug));
  const blockerPenalty = Math.min(35, item.blockers.length * 4);
  const riskPenalty = Math.min(
    30,
    projectRisks.filter((risk) => risk === "high").length * 10 +
      maintenanceIssues.filter((issue) => issue.severity === "high").length * 8 +
      weaknessProjects.filter((project) => project.riskLevel === "medium").length * 3,
  );
  const score = clamp(Math.round(item.readinessScore * 0.42 + requirementScore * 0.26 + Math.min(100, (artifactCount + claimCount) * 6) * 0.22 - blockerPenalty - riskPenalty), 0, 100);
  return {
    id: item.id,
    label: item.label,
    audience: item.audience,
    fitScore: item.fitScore,
    readinessScore: item.readinessScore,
    score,
    band: bandFor(score),
    riskBand: item.riskRegister.some((risk) => risk.severity === "high") || item.blockers.length > 6 ? "high" : item.blockers.length > 3 ? "medium" : "low",
    requirementCoverageScore: requirementScore,
    coveredRequirements: item.requirementCoverage.filter((requirement) => requirement.status === "covered").length,
    requirements: item.requirementCoverage.length,
    evidenceProjects: item.evidenceBundle.length,
    artifactCount,
    claimCount,
    blockers: item.blockers.length,
    repairPlanItems: item.proofRepairPlan?.length || 0,
    highPriorityRepairItems: (item.proofRepairPlan || []).filter((step) => step.priority === "high").length,
    readyForManualUse: item.decisionGate.readyForManualUse,
    manualOnly: item.packageReadiness?.manualOnly === true,
    nextAction: item.nextAction,
    verificationCommand: item.verificationCommand,
  };
}

function requirementCoverageScore(packages) {
  const requirements = packages.flatMap((item) => item.requirementCoverage || []);
  return coverageScore(requirements);
}

function coverageScore(items) {
  if (!items.length) return 0;
  return Math.round(
    items.reduce((sum, item) => sum + (item.status === "covered" ? 100 : item.status === "partial" ? 55 : 15), 0) / items.length,
  );
}

function coveredRequirements(packages) {
  return packages.flatMap((item) => item.requirementCoverage || []).filter((item) => item.status === "covered").length;
}

function totalRequirements(packages) {
  return packages.reduce((sum, item) => sum + (item.requirementCoverage || []).length, 0);
}

function evidenceBundleScore(packages) {
  if (!packages.length) return 0;
  const perPackage = packages.map((item) => {
    const artifactCount = item.evidenceBundle.reduce((sum, project) => sum + project.artifacts.length, 0);
    const claimCount = item.evidenceBundle.reduce((sum, project) => sum + project.claims.length, 0);
    const trialDescriptors = item.evidenceBundle.filter((project) => project.proofTrial?.descriptorComplete).length;
    return clamp(Math.round(artifactCount * 6 + claimCount * 4 + trialDescriptors * 8), 0, 100);
  });
  return average(perPackage);
}

function bundleArtifactCount(packages) {
  return packages.reduce((sum, item) => sum + item.evidenceBundle.reduce((inner, project) => inner + project.artifacts.length, 0), 0);
}

function bundleClaimCount(packages) {
  return packages.reduce((sum, item) => sum + item.evidenceBundle.reduce((inner, project) => inner + project.claims.length, 0), 0);
}

function repairPlanStepCount(packages) {
  return packages.reduce((sum, item) => sum + (item.proofRepairPlan?.length || 0), 0);
}

function repairPlanActionabilityScore(packages) {
  return percent(
    packages.filter(
      (item) =>
        item.packageReadiness?.manualOnly === true &&
        item.packageReadiness?.externalWrite === false &&
        (item.proofRepairPlan || []).length >= 3 &&
        (item.proofRepairPlan || []).every(
          (step) =>
            step.action &&
            step.expectedImpact &&
            step.verificationCommand &&
            ["read-only", "local-only"].includes(step.sideEffect) &&
            /do not send|third-party/i.test(step.manualUseBoundary || ""),
        ),
    ).length,
    packages.length,
  );
}

function manualSafetyScore({ packages, packageItems }) {
  const policySafe = /must not send|automatic sending|submissions/i.test(packages.manualOnlyPolicy || "");
  const boundaryScore = percent(
    packageItems.filter(
      (item) =>
        item.trackingBoundary?.livePostingKnown === false &&
        item.trackingBoundary?.applicationStateKnown === false &&
        item.packageReadiness?.manualOnly === true &&
        item.packageReadiness?.externalWrite === false,
    ).length,
    packageItems.length,
  );
  return policySafe ? boundaryScore : Math.min(60, boundaryScore);
}

function qualityChecks({ opportunities, opportunityItems, packageItems, packages, packageBenchmarks, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const scripts = packageManifest.scripts || {};
  const requirementItems = packageItems.flatMap((item) => item.requirementCoverage || []);
  const blockerActionable = packageItems.filter((item) => item.blockers.length && item.nextAction && item.verificationCommand);
  const repairPlanActionable = packageItems.filter(
    (item) =>
      item.packageReadiness?.manualOnly === true &&
      item.packageReadiness?.externalWrite === false &&
      (item.proofRepairPlan || []).length >= 3 &&
      (item.proofRepairPlan || []).every((step) => step.verificationCommand && ["read-only", "local-only"].includes(step.sideEffect)),
  );
  return [
    check(
      "opportunity-source-coverage",
      opportunityItems.length > 0 && opportunityItems.every((item) => item.sourceTrace?.length && item.rankExplanation && item.relatedProof?.length),
      "high",
      `${opportunityItems.filter((item) => item.sourceTrace?.length && item.rankExplanation && item.relatedProof?.length).length}/${opportunityItems.length} opportunity route(s) explain fit from source traces.`,
      "Restore sourceTrace, rankExplanation, and relatedProof on every opportunity route.",
    ),
    check(
      "package-benchmark-coverage",
      packageBenchmarks.length === packageItems.length && packageItems.length === opportunityItems.length,
      "high",
      `${packageBenchmarks.length} benchmark(s), ${packageItems.length} package(s), ${opportunityItems.length} opportunity route(s).`,
      "Keep opportunity packages, benchmarks, and radar routes aligned one-to-one.",
    ),
    check(
      "requirement-status-coverage",
      requirementItems.length > 0 && requirementItems.every((item) => ["covered", "partial", "missing"].includes(item.status) && item.repairAction),
      "high",
      `${requirementItems.length} requirement row(s) with status and repair guidance.`,
      "Attach status and repair guidance to every opportunity requirement.",
    ),
    check(
      "missing-proof-actionability",
      blockerActionable.length === packageItems.length,
      "medium",
      `${blockerActionable.length}/${packageItems.length} package(s) expose blockers, next action, and verification command.`,
      "Every opportunity package with blockers needs a concrete next action and verification command.",
    ),
    check(
      "proof-repair-plan",
      repairPlanActionable.length === packageItems.length,
      "high",
      `${repairPlanActionable.length}/${packageItems.length} package(s) expose local verification-backed proof repair plans.`,
      "Attach a local-only proof repair plan with verification commands to every opportunity package.",
    ),
    check(
      "effort-upside-calibration",
      opportunityItems.every((item) => item.estimatedEffort && item.expectedUpside),
      "medium",
      `${opportunityItems.filter((item) => item.estimatedEffort && item.expectedUpside).length}/${opportunityItems.length} opportunity route(s) include effort and upside.`,
      "Keep estimated effort and expected upside labels explicit and conservative.",
    ),
    check(
      "manual-safety-boundary",
      /must not send|automatic sending|submissions/i.test(packages.manualOnlyPolicy || "") &&
        packageItems.every(
          (item) =>
            item.trackingBoundary?.livePostingKnown === false &&
            item.trackingBoundary?.applicationStateKnown === false &&
            item.packageReadiness?.manualOnly === true &&
            item.packageReadiness?.externalWrite === false,
        ),
      "high",
      "Opportunity packages preserve archetype-only tracking boundaries and manual-only policy.",
      "Restore manual-only opportunity boundaries before any opportunity output is used.",
    ),
    check("route-manifest", publicRoutes.includes(ENDPOINT), "medium", `${ENDPOINT} ${publicRoutes.includes(ENDPOINT) ? "declared" : "missing"} in route manifest.`, "Add opportunity quality to runtimeRouteManifest."),
    check("refresh-plan", (refreshPlan.endpoints || []).includes(ENDPOINT), "medium", `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"} in refresh plan.`, "Add opportunity quality to safe evidence refresh."),
    check("script-coverage", Boolean(scripts["audit:opportunity-quality"]), "medium", `audit:opportunity-quality=${Boolean(scripts["audit:opportunity-quality"])}`, "Add the audit:opportunity-quality package script."),
  ];
}

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: "npm run audit:opportunity-quality",
  };
}

function dimension({ id, label, score, weight, detail }) {
  const normalized = clamp(Math.round(score), 0, 100);
  return { id, label, score: normalized, band: bandFor(normalized), weight, detail };
}

function weightedScore(dimensions) {
  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function recommendationForDimension(id) {
  return {
    "fit-explainability": "Keep every opportunity tied to sourceTrace, rankExplanation, and relatedProof records.",
    "package-readiness": "Raise package readiness by repairing missing proof and improving packet confidence.",
    "requirement-coverage": "Attach explicit public-safe evidence for each application requirement before manual use.",
    "missing-proof-actionability": "Every package with blockers needs a concrete next action and verification command.",
    "repair-plan-actionability": "Keep each package repair plan local-only, verification-backed, and ordered by requirement gaps, blockers, and risk.",
    "evidence-bundle-depth": "Increase claim, artifact, and proof-trial descriptor density for each opportunity bundle.",
    "effort-upside-calibration": "Keep estimated effort and expected upside labels explicit and conservative.",
    "manual-safety": "Preserve the manual-only boundary and avoid claiming live postings or application status.",
  }[id];
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
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
  appendOpportunityQualityReceipt,
  buildOpportunityQualityHistory,
  buildOpportunityQualityEvaluation,
  buildOpportunityQualityEvaluationFromReceipt,
  buildOpportunityQualityResponse,
  opportunityQualityPlan,
  readOpportunityQualityHistoryWindow,
  readLatestOpportunityQualityReceipt,
  readOpportunityQualityReceipts,
};
