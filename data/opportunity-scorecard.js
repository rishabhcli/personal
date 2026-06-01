const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/opportunity-scorecard";
const STORE_RELATIVE_PATH = path.join("var", "opportunity-scorecard-receipts.json");
const maxReceipts = 50;
const historyWindowCache = new Map();

function opportunityScorecardPlan() {
  return {
    mode: "proof-backed-opportunity-scorecard-plan",
    command: "npm run score:opportunities",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing opportunity radar entries, packages, rankings, quality benchmarks, de-risking plans, proof bundles, requirement coverage, or manual-use gates.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe opportunity scorecard endpoints, writes a local receipt under var/, and does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems.",
  };
}

function buildOpportunityScorecardReport({
  opportunities,
  packages,
  board,
  deRisking,
  ranking,
  opportunityQuality,
  routeManifest,
  refreshPlan,
  packageManifest = {},
  receipts = [],
}) {
  const scorecards = (packages.packages || [])
    .map((item) =>
      scoreOpportunity({
        item,
        opportunity: findById(opportunities.opportunities, item.id),
        board,
        deRiskPlan: findById(deRisking.plans, item.id),
        ranking: findById(ranking.rankings, item.id),
        benchmark: findById(opportunityQuality.packageBenchmarks, item.id),
      }),
    )
    .sort((left, right) => right.overallScore - left.overallScore || left.id.localeCompare(right.id))
    .map((item, index) => ({ ...item, scoreRank: index + 1 }));
  const dimensions = scorecardDimensions({ scorecards, opportunities, packages, ranking, opportunityQuality, deRisking });
  const checks = scorecardChecks({ scorecards, packages, ranking, opportunityQuality, deRisking, routeManifest, refreshPlan, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks.map((check) => ({ score: check.passed ? 100 : 0, weight: check.severity === "high" ? 1.4 : 1 })));
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "proof-backed-opportunity-scorecard",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This scorecard combines local public-safe opportunity radar, packages, quality benchmarks, de-risking plans, board gates, rankings, requirement coverage, and proof bundles. It does not claim live postings, deadlines, applications, interviews, scholarships, grants, funding, recipient interest, outreach status, or external availability.",
    manualUsePolicy:
      "Use scorecards to choose local proof repair or manual review targets only. The app must not send outreach, submit applications, schedule meetings, claim recipient interest, write to third-party systems, or treat archetype opportunities as live postings.",
    plan: opportunityScorecardPlan(),
    summary: {
      score,
      band: bandFor(score),
      engineScore: average(scorecards.map((item) => item.overallScore)),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      opportunities: opportunities.opportunities?.length || 0,
      packages: packages.packages?.length || 0,
      scorecards: scorecards.length,
      readyForManualReview: scorecards.filter((item) => item.decision.manualUseGate === "ready-for-manual-review").length,
      blockedUntilProof: scorecards.filter((item) => item.decision.manualUseGate === "blocked-until-proof").length,
      averageResidualRisk: average(scorecards.map((item) => item.risk.residualRisk).filter(Number.isFinite)),
      repairPlanItems: packages.summary.repairPlanItems || (packages.packages || []).reduce((sum, item) => sum + (item.proofRepairPlan?.length || 0), 0),
      topOpportunityId: scorecards[0]?.id || null,
      topOverallScore: scorecards[0]?.overallScore || 0,
      latestReceiptId: latestReceipt?.id || null,
      routeCovered: [ENDPOINT, `${ENDPOINT}/:id`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
    },
    dimensions,
    scorecards,
    scoreBands: scoreBands(scorecards),
    checks,
    repairQueue: scorecards
      .flatMap((item) => item.repairActions.map((action) => ({ ...action, opportunityId: item.id, scoreRank: item.scoreRank, overallScore: item.overallScore })))
      .sort((left, right) => priorityRank(right.priority) - priorityRank(left.priority) || right.overallScore - left.overallScore)
      .slice(0, 12),
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nextAction:
      failing[0]?.repairAction ||
      scorecards[0]?.repairActions[0]?.action ||
      "Review the top opportunity scorecard manually and keep external writes disabled.",
    verificationCommand: "npm run score:opportunities && npm run check && npm run verify",
  };
}

function buildOpportunityScorecardReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "proof-backed-opportunity-scorecard-receipt" || !receipt.summary) return null;
  const scorecards = (receipt.scorecards || receipt.topScorecards || []).map((item) => ({
    ...item,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}/${item.id}?refresh=1`,
    checkedAt: receipt.checkedAt || null,
    repairActions: item.repairActions || [],
    requirementGaps: item.requirementGaps || [],
    sourceTrace: item.sourceTrace || [],
    decision: item.decision || {
      manualUseGate: item.manualUseGate || "cached",
      readyForManualUse: false,
      manualOnly: true,
      externalWrite: false,
      forbiddenActions: forbiddenActions(),
      useRule: "Cached scorecard requires refresh before external use.",
    },
    risk: item.risk || {
      residualRisk: item.residualRisk ?? null,
      riskBand: "cached",
    },
    evidence: item.evidence || {
      projects: 0,
      artifacts: 0,
      claims: 0,
      depthScore: 0,
    },
    nextAction: item.nextAction || "Refresh opportunity scorecards before manual use.",
    verificationCommand: item.verificationCommand || "npm run score:opportunities",
  }));
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || `Cached opportunity scorecard check from ${receipt.id}.`,
    repairAction: check.passed ? "No cached opportunity scorecard repair needed." : "Refresh opportunity scorecards and repair the failing cached check.",
    verificationCommand: "npm run score:opportunities",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "proof-backed-opportunity-scorecard",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs opportunity scorecards from the latest local receipt. It is a fast public-safe cached report, not live posting, deadline, application, outreach, interview, funding, or recipient-interest proof.",
    sideEffectBoundary: receipt.sideEffectBoundary || opportunityScorecardPlan().sideEffectBoundary,
    manualUsePolicy:
      "Use cached scorecards to choose local proof repair or manual review targets only. The app must not send outreach, submit applications, schedule meetings, claim recipient interest, write to third-party systems, or treat archetype opportunities as live postings.",
    plan: opportunityScorecardPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    dimensions: receipt.dimensions || [],
    scorecards,
    scoreBands: receipt.scoreBands || scoreBands(scorecards),
    checks,
    repairQueue:
      receipt.repairQueue ||
      scorecards
        .flatMap((item) =>
          (item.repairActions || []).map((action) => ({
            ...action,
            opportunityId: item.id,
            scoreRank: item.scoreRank,
            overallScore: item.overallScore,
          })),
        )
        .slice(0, 12),
    repairActions: failing.map((check) => ({
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
    nextAction:
      failing[0]?.repairAction ||
      scorecards[0]?.repairActions?.[0]?.action ||
      "Opportunity scorecards are served from the latest local receipt; run npm run score:opportunities or ?refresh=1 after opportunity, ranking, de-risking, proof, or route changes.",
    verificationCommand: "npm run score:opportunities && npm run check && npm run verify",
  };
}

function selectOpportunityScorecard(value, report) {
  const normalized = String(value || "").toLowerCase().trim();
  return (report.scorecards || []).find((item) => item.id === normalized || item.packageId === normalized || item.opportunityId === normalized) || null;
}

function buildOpportunityScorecardResponse(
  report,
  { detail = "summary", scorecardPreviewLimit = 1, scorecardIndexPreviewLimit = 3, checkPreviewLimit = 4, dimensionPreviewLimit = 3 } = {},
) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const scorecards = report.scorecards || [];
  const checks = report.checks || [];
  const dimensions = report.dimensions || [];
  const scorecardLimit = boundedPreviewLimit(scorecardPreviewLimit, 1, 6);
  const scorecardIndexLimit = boundedPreviewLimit(scorecardIndexPreviewLimit, 3, 6);
  const checkLimit = boundedPreviewLimit(checkPreviewLimit, 4, 12);
  const dimensionLimit = boundedPreviewLimit(dimensionPreviewLimit, 3, 8);
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      scorecardPayloadPolicy: {
        fullDetail: true,
        scorecardsReturned: report.scorecards?.length || 0,
        repairQueueReturned: report.repairQueue?.length || 0,
        fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      },
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    refreshEndpoint: report.refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    boundaryAvailable: Boolean(report.sourceBoundary || report.manualUsePolicy),
    summary: summarizeOpportunityScorecardCompactSummary(report.summary),
    dimensions: dimensions.slice(0, dimensionLimit).map((dimension) => ({
      id: dimension.id,
      score: dimension.score,
    })),
    scorecardIndex: scorecards.slice(0, scorecardIndexLimit).map(summarizeOpportunityScorecardIndexRow),
    scorecards: scorecards.slice(0, scorecardLimit).map(summarizeOpportunityScorecardForResponse),
    checkSummary: summarizeOpportunityScorecardChecks(checks),
    checks: checks.slice(0, checkLimit).map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
    })),
    repairActions:
      report.repairActions?.length > 0
        ? report.repairActions.map((action) => ({
            id: action.id,
            priority: action.priority,
          }))
        : undefined,
    scorecardPayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
    },
  };
}

function buildOpportunityScorecardDetailResponse(scorecard, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const refreshEndpoint = `${ENDPOINT}/${scorecard.id}?refresh=1`;
  const fullDetailEndpoint = `${ENDPOINT}/${scorecard.id}?detail=full`;
  if (fullDetail) {
    return {
      ...scorecard,
      refreshEndpoint: scorecard.refreshEndpoint || refreshEndpoint,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      scorecardPayloadPolicy: {
        fullDetail: true,
        fullDetailEndpoint,
      },
    };
  }

  const packageRepair = (scorecard.repairActions || []).find((action) => action.source === "opportunity-package-repair-plan");
  const firstRepair = packageRepair || (scorecard.repairActions || [])[0];
  return {
    id: scorecard.id,
    cachedFromReceipt: Boolean(scorecard.cachedFromReceipt),
    refreshEndpoint: scorecard.refreshEndpoint || refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    scoreRank: scorecard.scoreRank || null,
    overallScore: scorecard.overallScore || 0,
    band: scorecard.band || "unknown",
    scoreBreakdown: {
      fit: scorecard.fitScore || 0,
      readiness: scorecard.readinessScore || 0,
      quality: scorecard.qualityScore || 0,
      ranking: scorecard.rankingScore || 0,
      evidenceDepth: scorecard.evidence?.depthScore || 0,
      residualRisk: scorecard.risk?.residualRisk ?? null,
    },
    factorCount: scorecard.factors ? Object.keys(scorecard.factors).length : 0,
    evidence: {
      projects: scorecard.evidence?.projects || 0,
      artifacts: scorecard.evidence?.artifacts || 0,
      claims: scorecard.evidence?.claims || 0,
      depthScore: scorecard.evidence?.depthScore || 0,
    },
    risk: {
      residualRisk: scorecard.risk?.residualRisk ?? null,
      riskBand: scorecard.risk?.riskBand || "unknown",
    },
    decision: {
      manualUseGate: scorecard.decision?.manualUseGate || "unknown",
      readyForManualUse: Boolean(scorecard.decision?.readyForManualUse),
      manualOnly: scorecard.decision?.manualOnly !== false,
      externalWrite: Boolean(scorecard.decision?.externalWrite),
      livePostingKnown: Boolean(scorecard.decision?.livePostingKnown),
      applicationStateKnown: Boolean(scorecard.decision?.applicationStateKnown),
      forbiddenActionCount: (scorecard.decision?.forbiddenActions || []).length,
    },
    requirementGapCount: (scorecard.requirementGaps || []).length,
    repairActions: firstRepair
      ? [
          {
            id: firstRepair.id,
            priority: firstRepair.priority,
            source: firstRepair.source,
          },
        ]
      : [],
    repairActionCount: (scorecard.repairActions || []).length,
    sourceTracePreview: selectOpportunityScorecardSourceTracePreview(scorecard.sourceTrace),
    sourceTraceCount: (scorecard.sourceTrace || []).length,
    scorecardPayloadPolicy: {
      fullDetail: false,
    },
  };
}

function selectOpportunityScorecardSourceTracePreview(sourceTrace = []) {
  const traces = Array.isArray(sourceTrace) ? sourceTrace : [];
  const rankingTrace = traces.find((trace) => trace.type === "opportunity-ranking");
  const selected = rankingTrace || traces[0];
  return selected ? [{ type: selected.type, id: selected.id }] : [];
}

function summarizeOpportunityScorecardPlan() {
  const plan = opportunityScorecardPlan();
  return {
    planEndpoint: `${ENDPOINT}/plan`,
    commandAvailable: Boolean(plan.command),
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
  };
}

function appendOpportunityScorecardReceipt(root, receipt) {
  const receipts = readOpportunityScorecardReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readOpportunityScorecardReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readOpportunityScorecardHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readOpportunityScorecardReceipts(root);
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

function buildOpportunityScorecardHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "proof-backed-opportunity-scorecard-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary:
      fullDetail
        ? "This endpoint returns full local opportunity-scorecard receipts. It is still not a live posting, deadline, application, outreach, interview, funding, or recipient-interest proof."
        : undefined,
    boundaryAvailable: fullDetail ? undefined : true,
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local opportunity-scorecard receipts only. It does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems."
        : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          fullDetail: true,
          defaultLimit: 5,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
        }
      : {
          fullDetail: false,
          fullDetailAvailable: true,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      ...(fullDetail
        ? {
            latestReceiptId: latest?.id || null,
            latestCheckedAt: latest?.checkedAt || null,
            latestScore: latest?.summary?.score || 0,
            latestBand: latest?.summary?.band || "unknown",
            latestScorecards: latest?.summary?.scorecards || 0,
            latestTopOpportunityId: latest?.summary?.topOpportunityId || null,
          }
        : {}),
    },
    definitions: fullDetail ? undefined : summarizeOpportunityScorecardDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeOpportunityScorecardReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? latest
        ? "Opportunity scorecard history is available; run npm run score:opportunities after opportunity, ranking, de-risking, quality, proof, or route changes."
        : "Run npm run score:opportunities to create opportunity scorecard history."
      : undefined,
    nextActionAvailable: fullDetail ? undefined : Boolean(latest),
    verificationCommand: fullDetail ? "npm run score:opportunities && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: fullDetail ? undefined : true,
  };
}

function summarizeOpportunityScorecardDefinitions(receipt) {
  return {
    evidenceAccess: {
      fullReportEndpoint: ENDPOINT,
    },
    counts: {
      dimensions: (receipt?.dimensions || []).length,
      checks: (receipt?.checks || []).length,
    },
    checkIds: selectScorecardCheckIds(receipt?.checks || []),
  };
}

function summarizeOpportunityScorecardReceipt(receipt, { includePreview = true } = {}) {
  const scorecards = Array.isArray(receipt.scorecards) && receipt.scorecards.length ? receipt.scorecards : receipt.topScorecards || [];
  const checks = receipt.checks || [];
  const summary = {
    id: receipt.id,
    summary: summarizeOpportunityScorecardHistorySummary(receipt.summary),
    scorecardCount: scorecards.length,
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).map((check) => check.id),
    },
  };
  if (!includePreview) {
    return {
      id: receipt.id,
      trendSummary: summary.summary,
      scorecardCount: summary.scorecardCount,
    };
  }
  return {
    ...summary,
    topScorecards: scorecards.slice(0, 3).map(summarizeOpportunityScorecardHistoryRow),
  };
}

function selectScorecardCheckIds(checks = []) {
  const preferred = ["scorecard-coverage", "manual-boundary", "source-trace-coverage", "script-coverage"];
  const selected = [];
  for (const id of preferred) {
    if (checks.some((check) => check.id === id) && !selected.includes(id)) selected.push(id);
  }
  for (const check of checks) {
    if (selected.length >= 4) break;
    if (check.id && !selected.includes(check.id)) selected.push(check.id);
  }
  return selected;
}

function summarizeOpportunityScorecardSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    scorecards: summary.scorecards || 0,
    readyForManualReview: summary.readyForManualReview || 0,
    blockedUntilProof: summary.blockedUntilProof || 0,
    repairPlanItems: summary.repairPlanItems || 0,
    topOpportunityId: summary.topOpportunityId || null,
    topOverallScore: summary.topOverallScore || 0,
    latestReceiptId: summary.latestReceiptId || null,
    routeCovered: Boolean(summary.routeCovered),
    refreshCovered: Boolean(summary.refreshCovered),
  };
}

function summarizeOpportunityScorecardCompactSummary(summary = {}) {
  return {
    score: summary.score || 0,
    scorecards: summary.scorecards || 0,
    repairPlanItems: summary.repairPlanItems || 0,
    routeCovered: Boolean(summary.routeCovered),
    refreshCovered: Boolean(summary.refreshCovered),
  };
}

function summarizeOpportunityScorecardChecks(checks = []) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.passed).length,
    failed: checks.filter((check) => !check.passed).length,
  };
}

function summarizeOpportunityScorecardHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    scorecards: summary.scorecards || 0,
    blockedUntilProof: summary.blockedUntilProof || 0,
    topOpportunityId: summary.topOpportunityId || null,
  };
}

function summarizeOpportunityScorecardHistoryRow(item) {
  return {
    id: item.id,
    repairs: (item.repairActions || []).length,
  };
}

function summarizeOpportunityScorecardRow(item) {
  return {
    id: item.id,
    rank: item.scoreRank || null,
    score: item.overallScore || 0,
    band: item.band || "unknown",
    gate: item.decision?.manualUseGate || item.manualUseGate || "cached",
    residualRisk: item.risk?.residualRisk ?? item.residualRisk ?? null,
    repairs: (item.repairActions || []).length,
  };
}

function summarizeOpportunityScorecardForResponse(item) {
  const packageRepair = (item.repairActions || []).find((action) => action.source === "opportunity-package-repair-plan");
  const firstRepair = packageRepair || (item.repairActions || [])[0];
  return {
    id: item.id,
    scoreRank: item.scoreRank || null,
    overallScore: item.overallScore || 0,
    band: item.band || "unknown",
    factorCount: item.factors ? Object.keys(item.factors).length : 0,
    decision: {
      manualUseGate: item.decision?.manualUseGate || "unknown",
      manualOnly: item.decision?.manualOnly !== false,
      externalWrite: Boolean(item.decision?.externalWrite),
    },
    requirementGapCount: (item.requirementGaps || []).length,
    repairActions: firstRepair
      ? [
          {
            id: firstRepair.id,
            priority: firstRepair.priority,
            source: firstRepair.source,
          },
        ]
      : [],
    repairActionCount: (item.repairActions || []).length,
    sourceTraceCount: (item.sourceTrace || []).length,
    detailEndpoint: `${ENDPOINT}/${item.id}`,
  };
}

function summarizeOpportunityScorecardIndexRow(item) {
  return {
    id: item.id,
    rank: item.scoreRank || null,
    score: item.overallScore || 0,
    gate: item.decision?.manualUseGate || "unknown",
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function scoreOpportunity({ item, opportunity, board, deRiskPlan, ranking, benchmark }) {
  const evidence = evidenceProfile(item);
  const risk = {
    riskScore: deRiskPlan?.riskScore ?? null,
    residualRisk: deRiskPlan?.residualRisk ?? null,
    riskBand: deRiskPlan?.riskBand || "unknown",
    readyAfterRepairs: deRiskPlan?.manualReviewGate?.readyAfterRepairs || false,
  };
  const gate = boardGate(board, item.id) || ranking?.manualUseGate || (item.decisionGate.readyForManualUse ? "ready-for-manual-review" : "proof-repair-required");
  const manualSafetyScore = manualSafety({ item, gate });
  const factors = {
    fit: Math.round(item.fitScore * 0.18),
    readiness: Math.round(item.readinessScore * 0.16),
    ranking: Math.round((ranking?.priorityScore || item.fitScore) * 0.16),
    quality: Math.round((benchmark?.score || item.readinessScore) * 0.14),
    risk: Math.round((100 - (risk.residualRisk ?? 70)) * 0.12),
    proofDepth: Math.round(evidence.depthScore * 0.12),
    requirementCoverage: Math.round(requirementCoverageScore(item.requirementCoverage) * 0.08),
    manualSafety: Math.round(manualSafetyScore * 0.04),
    blockerPenalty: Math.min(18, item.blockers.length * 2),
    requirementPenalty: Math.min(14, (item.requirementCoverage || []).filter((requirement) => requirement.status !== "covered").length * 3),
  };
  const overallScore = clamp(
    Math.round(
      factors.fit +
        factors.readiness +
        factors.ranking +
        factors.quality +
        factors.risk +
        factors.proofDepth +
        factors.requirementCoverage +
        factors.manualSafety -
        factors.blockerPenalty -
        factors.requirementPenalty,
    ),
    0,
    100,
  );

  return {
    id: item.id,
    packageId: item.packageId,
    opportunityId: item.opportunityId,
    label: item.label,
    audience: item.audience,
    overallScore,
    band: bandFor(overallScore),
    fitScore: item.fitScore,
    readinessScore: item.readinessScore,
    qualityScore: benchmark?.score || item.readinessScore,
    rankingScore: ranking?.priorityScore || null,
    factors,
    evidence,
    risk,
    decision: {
      manualUseGate: gate,
      readyForManualUse: item.decisionGate.readyForManualUse,
      manualOnly: true,
      externalWrite: false,
      livePostingKnown: item.trackingBoundary.livePostingKnown,
      applicationStateKnown: item.trackingBoundary.applicationStateKnown,
      forbiddenActions: forbiddenActions(),
      useRule: "Local proof repair and manual review only; a human must verify a real posting before any external action outside this app.",
    },
    requirementGaps: (item.requirementCoverage || [])
      .filter((requirement) => requirement.status !== "covered")
      .map((requirement) => ({
        requirement: requirement.requirement,
        status: requirement.status,
        repairAction: requirement.repairAction,
      })),
    repairActions: repairActionsFor({ item, ranking, deRiskPlan }),
    sourceTrace: [
      { type: "opportunity-package", id: item.packageId, label: item.label },
      { type: "opportunity-radar", id: opportunity?.id || item.id, label: opportunity?.label || item.label },
      ...(item.proofRepairPlan?.length
        ? [{ type: "opportunity-package-repair-plan", id: `${item.id}.proof-repair-plan`, steps: item.proofRepairPlan.length }]
        : []),
      ...(ranking ? [{ type: "opportunity-ranking", id: ranking.id, rank: ranking.rank, priorityScore: ranking.priorityScore }] : []),
      ...(benchmark ? [{ type: "opportunity-quality-benchmark", id: benchmark.id, score: benchmark.score }] : []),
      ...(deRiskPlan ? [{ type: "opportunity-derisking-plan", id: deRiskPlan.id, residualRisk: deRiskPlan.residualRisk }] : []),
    ],
    nextAction: ranking?.nextAction || item.nextAction,
    verificationCommand: `npm run score:opportunities && npm run check && node server.js # then open /api/opportunity-scorecard/${item.id}`,
  };
}

function scorecardDimensions({ scorecards, opportunities, packages, ranking, opportunityQuality, deRisking }) {
  return [
    dimension("scorecard-coverage", "Scorecard coverage", percent(scorecards.length, packages.packages?.length || 0), 0.16, `${scorecards.length}/${packages.packages?.length || 0} package scorecard(s).`),
    dimension("ranking-alignment", "Ranking alignment", percent(scorecards.filter((item) => Number.isInteger(item.rankingScore)).length, scorecards.length), 0.16, `${scorecards.filter((item) => Number.isInteger(item.rankingScore)).length}/${scorecards.length} scorecard(s) align to ranking rows.`),
    dimension("quality-alignment", "Quality alignment", percent(scorecards.filter((item) => Number.isInteger(item.qualityScore)).length, scorecards.length), 0.14, `${opportunityQuality.packageBenchmarks?.length || 0} quality benchmark(s).`),
    dimension("risk-alignment", "Risk alignment", percent(scorecards.filter((item) => Number.isInteger(item.risk.residualRisk)).length, scorecards.length), 0.14, `${deRisking.plans?.length || 0} de-risking plan(s).`),
    dimension("proof-depth", "Proof depth", average(scorecards.map((item) => item.evidence.depthScore)), 0.14, `${scorecards.reduce((sum, item) => sum + item.evidence.artifacts, 0)} artifact reference(s), ${scorecards.reduce((sum, item) => sum + item.evidence.claims, 0)} claim reference(s).`),
    dimension("repair-plan-propagation", "Repair plan propagation", percent(scorecards.filter((item) => item.repairActions.some((action) => action.source === "opportunity-package-repair-plan")).length, scorecards.length), 0.12, "Scorecards pull their first repair actions from package proof repair plans."),
    dimension("manual-safety", "Manual safety", percent(scorecards.filter((item) => item.decision.manualOnly && item.decision.externalWrite === false).length, scorecards.length), 0.14, "Scorecards preserve manual-only, no-external-write boundaries."),
    dimension("radar-package-parity", "Radar/package parity", percent(packages.packages?.length || 0, opportunities.opportunities?.length || 0), 0.12, `${packages.packages?.length || 0}/${opportunities.opportunities?.length || 0} package/radar parity.`),
  ];
}

function scorecardChecks({ scorecards, packages, ranking, opportunityQuality, deRisking, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const requiredRoutes = [ENDPOINT, `${ENDPOINT}/:id`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`];
  return [
    check("scorecard-coverage", scorecards.length === (packages.packages || []).length && scorecards.length > 0, "high", `${scorecards.length}/${packages.packages?.length || 0} scorecard(s).`, "Score every opportunity package."),
    check("factor-math", scorecards.every((item) => Number.isInteger(item.overallScore) && Object.keys(item.factors).length >= 10), "high", `${scorecards.length} scorecard(s) expose factor math.`, "Expose factor math for every opportunity scorecard."),
    check("ranking-alignment", scorecards.every((item) => Number.isInteger(item.rankingScore)) && (ranking.rankings || []).length === scorecards.length, "high", `${ranking.rankings?.length || 0}/${scorecards.length} ranking row(s).`, "Align every scorecard with opportunity ranking."),
    check("quality-alignment", (opportunityQuality.packageBenchmarks || []).length === scorecards.length, "medium", `${opportunityQuality.packageBenchmarks?.length || 0}/${scorecards.length} quality benchmark(s).`, "Align every scorecard with opportunity quality benchmarks."),
    check("derisk-alignment", (deRisking.plans || []).length === scorecards.length && scorecards.every((item) => Number.isInteger(item.risk.residualRisk)), "high", `${deRisking.plans?.length || 0}/${scorecards.length} de-risking plan(s).`, "Attach residual risk to every scorecard."),
    check("manual-boundary", scorecards.every((item) => item.decision.manualOnly && item.decision.externalWrite === false && item.decision.forbiddenActions.includes("submit-application")), "high", "Every scorecard is manual-only and forbids external actions.", "Restore manual-only scorecard boundaries."),
    check(
      "package-repair-plan",
      (packages.packages || []).every((item) => (item.proofRepairPlan || []).length >= 3) &&
        scorecards.every((item) => item.repairActions.some((action) => action.source === "opportunity-package-repair-plan")),
      "high",
      `${(packages.packages || []).reduce((sum, item) => sum + (item.proofRepairPlan?.length || 0), 0)} package repair plan step(s).`,
      "Propagate package proof repair plans into every opportunity scorecard.",
    ),
    check("repair-actionability", scorecards.every((item) => item.repairActions.length > 0 && item.repairActions.every((action) => action.verificationCommand)), "medium", `${scorecards.reduce((sum, item) => sum + item.repairActions.length, 0)} repair action(s).`, "Attach verification-backed repair actions to every scorecard."),
    check("source-trace-coverage", scorecards.every((item) => item.sourceTrace.length >= 4), "high", `${scorecards.filter((item) => item.sourceTrace.length >= 4).length}/${scorecards.length} traced scorecard(s).`, "Trace scorecards to package, radar, ranking, quality, and de-risking sources."),
    check("route-manifest", requiredRoutes.every((route) => publicRoutes.includes(route)), "high", `${requiredRoutes.filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes.length} route(s) declared.`, "Add scorecard report, selection, plan, and history routes to runtimeRouteManifest."),
    check("refresh-plan", (refreshPlan.endpoints || []).includes(ENDPOINT), "medium", `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"} in refresh plan.`, "Add opportunity scorecard to safe evidence refresh."),
    check("script-coverage", Boolean(packageManifest.scripts?.["score:opportunities"]), "medium", `score:opportunities=${Boolean(packageManifest.scripts?.["score:opportunities"])}`, "Add the score:opportunities package script and recorder."),
  ];
}

function repairActionsFor({ item, ranking, deRiskPlan }) {
  const packageSteps = (item.proofRepairPlan || []).slice(0, 3).map((step) => ({
    id: `package.${step.id}`,
    priority: step.priority,
    action: step.action,
    source: "opportunity-package-repair-plan",
    sideEffect: step.sideEffect,
    expectedImpact: step.expectedImpact,
    verificationCommand: step.verificationCommand,
  }));
  const rankingSteps = (ranking?.missingProofPlan || []).slice(0, 3).map((step) => ({
    id: `ranking.${step.id}`,
    priority: step.priority,
    action: step.action,
    source: step.source,
    verificationCommand: step.verificationCommand,
  }));
  const riskSteps = (deRiskPlan?.deRiskSteps || []).slice(0, 2).map((step) => ({
    id: `derisk.${step.id}`,
    priority: step.priority,
    action: step.action,
    source: "opportunity-derisking",
    verificationCommand: step.verificationCommand,
  }));
  const blockerSteps = (item.blockers || []).slice(0, 2).map((blocker, index) => ({
    id: `blocker.${index + 1}`,
    priority: index === 0 ? "high" : "medium",
    action: blocker,
    source: "opportunity-package",
    verificationCommand: item.verificationCommand,
  }));
  return uniqueByAction([...packageSteps, ...rankingSteps, ...riskSteps, ...blockerSteps]).slice(0, 6);
}

function evidenceProfile(item) {
  const artifacts = item.evidenceBundle.reduce((sum, project) => sum + project.artifacts.length, 0);
  const claims = item.evidenceBundle.reduce((sum, project) => sum + project.claims.length, 0);
  const trials = item.evidenceBundle.filter((project) => project.proofTrial?.descriptorComplete).length;
  return {
    projects: item.evidenceBundle.length,
    artifacts,
    claims,
    completeTrialDescriptors: trials,
    depthScore: clamp(Math.round(artifacts * 5 + claims * 3 + trials * 8), 0, 100),
  };
}

function boardGate(board, id) {
  for (const gate of board.gates || []) {
    if (gate.packages.some((item) => item.id === id)) return gate.id;
  }
  return null;
}

function findById(items = [], id) {
  return items.find((item) => item.id === id || item.packageId === id || item.opportunityId === id) || null;
}

function manualSafety({ item, gate }) {
  const boundaries = [item.trackingBoundary?.livePostingKnown === false, item.trackingBoundary?.applicationStateKnown === false, !/ready-to-send|auto/i.test(gate || "")];
  return percent(boundaries.filter(Boolean).length, boundaries.length);
}

function requirementCoverageScore(requirements = []) {
  if (!requirements.length) return 0;
  return Math.round(
    requirements.reduce((sum, requirement) => sum + (requirement.status === "covered" ? 100 : requirement.status === "partial" ? 55 : 15), 0) /
      requirements.length,
  );
}

function scoreBands(scorecards) {
  return ["high", "medium", "low"].map((band) => ({
    band,
    count: scorecards.filter((item) => item.band === band).length,
    averageScore: average(scorecards.filter((item) => item.band === band).map((item) => item.overallScore)),
  }));
}

function dimension(id, label, score, weight, detail) {
  const normalized = clamp(Math.round(score), 0, 100);
  return { id, label, score: normalized, band: bandFor(normalized), weight, detail };
}

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: "npm run score:opportunities",
  };
}

function forbiddenActions() {
  return ["send-email", "send-dm", "schedule-event", "submit-application", "approve-publication", "deploy-production", "spend-money"];
}

function uniqueByAction(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.action || seen.has(item.action)) return false;
    seen.add(item.action);
    return true;
  });
}

function weightedScore(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return clamp(Math.round(items.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight), 0, 100);
}

function priorityRank(priority) {
  return { high: 3, medium: 2, low: 1 }[priority] || 0;
}

function percent(value, total) {
  if (!total) return 0;
  return clamp(Math.round((value / total) * 100), 0, 100);
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

function boundedHistoryLimit(limit) {
  const numericLimit = Number(limit);
  return Math.max(1, Math.min(Number.isFinite(numericLimit) && numericLimit > 0 ? numericLimit : 5, 50));
}

function boundedPreviewLimit(limit, fallback, max) {
  const numericLimit = Number(limit);
  return Math.max(0, Math.min(Number.isFinite(numericLimit) && numericLimit >= 0 ? numericLimit : fallback, max));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

module.exports = {
  ENDPOINT,
  appendOpportunityScorecardReceipt,
  buildOpportunityScorecardDetailResponse,
  buildOpportunityScorecardHistory,
  buildOpportunityScorecardReportFromReceipt,
  buildOpportunityScorecardReport,
  buildOpportunityScorecardResponse,
  opportunityScorecardPlan,
  readOpportunityScorecardHistoryWindow,
  readOpportunityScorecardReceipts,
  selectOpportunityScorecard,
};
