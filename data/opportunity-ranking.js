const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/opportunity-ranking";
const STORE_RELATIVE_PATH = path.join("var", "opportunity-ranking-receipts.json");
const maxReceipts = 50;
const COMPACT_HISTORY_TOP_RANKINGS_LIMIT = 1;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function opportunityRankingPlan() {
  return {
    mode: "proof-backed-opportunity-ranking-plan",
    command: "npm run rank:opportunities",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing opportunities, packages, proof bundles, de-risking plans, requirement coverage, or opportunity quality scoring.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe opportunity ranking endpoints, writes a local receipt under var/, and does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems.",
  };
}

function buildOpportunityRankingReport({
  opportunities,
  packages,
  board,
  deRisking,
  opportunityQuality,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const opportunityById = new Map((opportunities.opportunities || []).map((item) => [item.id, item]));
  const boardById = new Map((board.gates || []).flatMap((gate) => gate.packages.map((item) => [item.id, { ...item, gateLabel: gate.label }])));
  const benchmarkById = new Map((opportunityQuality.packageBenchmarks || []).map((item) => [item.id, item]));
  const deRiskById = new Map((deRisking.plans || []).map((item) => [item.id, item]));
  const proofBundleById = new Map((board.proofBundles || []).map((bundle) => [bundle.opportunityId, bundle]));
  const rankings = (packages.packages || [])
    .map((item) =>
      rankOpportunityPackage({
        item,
        opportunity: opportunityById.get(item.id),
        boardItem: boardById.get(item.id),
        benchmark: benchmarkById.get(item.id),
        deRiskPlan: deRiskById.get(item.id),
        proofBundle: proofBundleById.get(item.id),
      }),
    )
    .sort((left, right) => right.priorityScore - left.priorityScore || left.id.localeCompare(right.id))
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const decisionLanes = buildDecisionLanes(rankings);
  const missingProofQueue = buildMissingProofQueue(rankings);
  const requirementMatrix = buildRequirementMatrix(rankings);
  const opportunityPortfolio = buildOpportunityPortfolio(rankings);
  const checks = rankingChecks({
    rankings,
    decisionLanes,
    missingProofQueue,
    requirementMatrix,
    opportunityPortfolio,
    packages,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "proof-backed-opportunity-ranking",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report ranks local public-safe opportunity packages using existing radar, package, board, de-risking, requirement, quality, effort, upside, and proof data. It does not claim live postings, deadlines, applications, interviews, scholarships, grants, funding, recipient interest, outreach status, or external availability.",
    manualUsePolicy:
      "Use this ranking to pick the next local proof repair or manual review target only. The app must not send outreach, submit applications, schedule meetings, claim recipient interest, write to third-party systems, or treat archetype opportunities as live postings.",
    plan: opportunityRankingPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      rankings: rankings.length,
      decisionLanes: decisionLanes.length,
      missingProofActions: missingProofQueue.length,
      packageRepairActions: missingProofQueue.filter((item) => item.source === "opportunity-package-repair-plan").length,
      requirementRows: requirementMatrix.length,
      portfolioSlots: opportunityPortfolio.length,
      portfolioItems: opportunityPortfolio.reduce((sum, slot) => sum + slot.items.length, 0),
      manualOnlyPortfolioItems: opportunityPortfolio.reduce((sum, slot) => sum + slot.items.filter((item) => item.manualOnly).length, 0),
      blockedExternalPortfolioActions: opportunityPortfolio.reduce((sum, slot) => sum + slot.items.filter((item) => item.externalWrite === false).length, 0),
      averagePriorityScore: average(rankings.map((item) => item.priorityScore)),
      topOpportunityId: rankings[0]?.id || null,
      topPriorityScore: rankings[0]?.priorityScore || 0,
      lowEffortHighUpside: rankings.filter((item) => item.estimatedEffort === "small" && item.expectedUpside === "high").length,
      blockedUntilProof: rankings.filter((item) => item.manualUseGate === "blocked-until-proof").length,
      latestReceiptId: latestReceipt?.id || null,
    },
    decisionLanes,
    opportunityPortfolio,
    rankings,
    missingProofQueue,
    requirementMatrix,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nextAction:
      missingProofQueue[0]?.action ||
      failing[0]?.repairAction ||
      "Review the top ranked opportunity package manually and keep external writes disabled.",
    verificationCommand: "npm run rank:opportunities && npm run check && npm run verify",
  };
}

function buildOpportunityRankingReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "proof-backed-opportunity-ranking-receipt" || !receipt.summary) return null;
  const rankings = (receipt.rankings || receipt.topRankings || []).map((item) => ({
    ...item,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}/${item.id}?refresh=1`,
    checkedAt: receipt.checkedAt || null,
    missingProofPlan: item.missingProofPlan || [],
    requirementGaps: item.requirementGaps || [],
    sourceTrace: item.sourceTrace || [],
    decisionBoundary: item.decisionBoundary || {
      manualOnly: true,
      externalWrite: false,
      forbiddenActions: forbiddenActions(),
      useRule: "Cached ranking requires refresh before external use.",
    },
    nextAction: item.nextAction || item.recommendedAction || "Refresh opportunity rankings before manual use.",
    verificationCommand: item.verificationCommand || "npm run rank:opportunities",
  }));
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || `Cached opportunity ranking check from ${receipt.id}.`,
    repairAction: check.passed ? "No cached opportunity ranking repair needed." : "Refresh opportunity rankings and repair the failing cached check.",
    verificationCommand: "npm run rank:opportunities",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "proof-backed-opportunity-ranking",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs opportunity rankings from the latest local receipt. It is a fast public-safe cached report, not live posting, deadline, application, outreach, interview, funding, or recipient-interest proof.",
    sideEffectBoundary: receipt.sideEffectBoundary || opportunityRankingPlan().sideEffectBoundary,
    manualUsePolicy:
      "Use cached rankings to choose local proof repair or manual review targets only. The app must not send outreach, submit applications, schedule meetings, claim recipient interest, write to third-party systems, or treat archetype opportunities as live postings.",
    plan: opportunityRankingPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    decisionLanes: receipt.fullDecisionLanes || receipt.decisionLanes || buildDecisionLanes(rankings),
    opportunityPortfolio: receipt.fullOpportunityPortfolio || receipt.opportunityPortfolio || buildOpportunityPortfolio(rankings),
    rankings,
    missingProofQueue: receipt.missingProofQueue || buildMissingProofQueue(rankings),
    requirementMatrix: receipt.requirementMatrix || buildRequirementMatrix(rankings),
    checks,
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
      (receipt.missingProofQueue || [])[0]?.action ||
      rankings[0]?.missingProofPlan?.[0]?.action ||
      failing[0]?.repairAction ||
      "Opportunity rankings are served from the latest local receipt; run npm run rank:opportunities or ?refresh=1 after opportunity, proof, de-risking, package, or route changes.",
    verificationCommand: "npm run rank:opportunities && npm run check && npm run verify",
  };
}

function buildOpportunityRankingResponse(report, { detail = "summary", previewLimit = 1 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedPreview = Math.max(1, Math.min(Number(previewLimit) || 1, 10));
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      opportunityRankingPayloadPolicy: {
        fullDetail: true,
        rankingsReturned: report.rankings?.length || 0,
        decisionLaneItemsReturned: (report.decisionLanes || []).reduce((sum, lane) => sum + (lane.items?.length || 0), 0),
        portfolioItemsReturned: (report.opportunityPortfolio || []).reduce((sum, slot) => sum + (slot.items?.length || 0), 0),
      },
    };
  }

  const summarizedRankings = (report.rankings || []).slice(0, boundedPreview).map(summarizeOpportunityRanking);
  const failingChecks = (report.checks || []).filter((check) => !check.passed);
  const queuePreviewLimit = 1;
  const requirementPreviewLimit = 1;
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    refreshEndpoint: report.refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeOpportunityRankingCompactSummary(report.summary),
    opportunityRankingPayloadPolicy: {
      fullDetail: false,
      rankingsReturned: summarizedRankings.length,
      fullRankings: report.rankings?.length || 0,
    },
    portfolioPolicy: {
      manualOnly: true,
      externalWrite: false,
      items: report.summary?.portfolioItems || 0,
    },
    decisionLanes: (report.decisionLanes || []).map(summarizeDecisionLane),
    opportunityPortfolio: (report.opportunityPortfolio || []).map(summarizePortfolioSlot),
    rankings: summarizedRankings,
    missingProofQueue: (report.missingProofQueue || []).slice(0, queuePreviewLimit).map(summarizeMissingProofQueueItem),
    requirementMatrix: (report.requirementMatrix || []).slice(0, requirementPreviewLimit).map(summarizeRequirementRow),
    checkSummary: summarizeCheckState(report.checks),
    ...(failingChecks.length ? { checks: failingChecks.slice(0, 3).map(summarizeRankingCheck) } : {}),
    ...(failingChecks.length
      ? { repairActions: (report.repairActions || []).slice(0, 4).map(({ id, priority }) => ({ id, priority, actionAvailable: true })) }
      : {}),
  };
}

function buildOpportunityRankingDetailResponse(item, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = `${ENDPOINT}/${item.id}?detail=full`;
  if (fullDetail) {
    return {
      ...item,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      opportunityRankingDetailPayloadPolicy: {
        fullDetail: true,
        missingProofStepsReturned: item.missingProofPlan?.length || 0,
        requirementGapsReturned: item.requirementGaps?.length || 0,
        sourceTraceRowsReturned: item.sourceTrace?.length || 0,
      },
    };
  }

  return {
    id: item.id,
    rank: item.rank,
    priorityScore: item.priorityScore,
    recommendation: item.recommendation,
    manualUseGate: item.manualUseGate,
    cachedFromReceipt: Boolean(item.cachedFromReceipt),
    refreshEndpoint: item.refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    scoreSummary: {
      fitScore: item.fitScore,
      readinessScore: item.readinessScore,
      qualityScore: item.qualityScore,
      residualRisk: item.residualRisk,
      riskBand: item.riskBand,
      estimatedEffort: item.estimatedEffort,
      expectedUpside: item.expectedUpside,
    },
    countSummary: {
      requirementGaps: item.requirementGaps?.length || 0,
      missingProofSteps: item.missingProofPlan?.length || 0,
      packageRepairActions: (item.missingProofPlan || []).filter((step) => step.source === "opportunity-package-repair-plan").length,
      sourceTraceRows: item.sourceTrace?.length || 0,
      forbiddenActions: item.decisionBoundary?.forbiddenActions?.length || 0,
    },
    evidenceProfile: summarizeEvidenceProfile(item.evidenceProfile),
    requirementGaps: (item.requirementGaps || []).slice(0, 2).map(summarizeRequirementGap),
    missingProofPlan: (item.missingProofPlan || []).slice(0, 2).map(summarizeMissingProofStep),
    sourceTracePreview: (item.sourceTrace || []).slice(0, 2).map(summarizeSourceTrace),
    decisionBoundarySummary: summarizeDecisionBoundary(item.decisionBoundary),
    deRisking: summarizeRankingDeRisking(item.deRisking),
  };
}

function compactOpportunityRankingPlan(plan = opportunityRankingPlan()) {
  return {
    mode: plan.mode,
    command: plan.command,
    endpoint: plan.endpoint || ENDPOINT,
    receiptStore: plan.receiptStore,
    scheduleRecommendationAvailable: Boolean(plan.scheduleRecommendation),
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
  };
}

function selectOpportunityRanking(value, report) {
  const normalized = String(value || "").toLowerCase().trim();
  return (
    (report.rankings || []).find((item) => item.id === normalized || item.packageId === normalized || item.opportunityId === normalized) ||
    null
  );
}

function rankOpportunityPackage({ item, opportunity, boardItem, benchmark, deRiskPlan, proofBundle }) {
  const missingRequirements = (item.requirementCoverage || []).filter((requirement) => requirement.status !== "covered");
  const evidenceDepth = evidenceDepthScore(item);
  const fitContribution = Math.round(item.fitScore * 0.24);
  const readinessContribution = Math.round(item.readinessScore * 0.18);
  const qualityContribution = Math.round((benchmark?.score || item.readinessScore) * 0.16);
  const proofDepthContribution = Math.round(evidenceDepth * 0.12);
  const upsideContribution = Math.round(upsideScore(opportunity?.expectedUpside) * 0.12);
  const effortContribution = Math.round(effortScore(opportunity?.estimatedEffort) * 0.08);
  const residualRiskContribution = Math.round((100 - (deRiskPlan?.residualRisk ?? 70)) * 0.08);
  const gateAdjustment = gateAdjustmentFor(boardItem?.gate || "unknown");
  const blockerPenalty = Math.min(18, item.blockers.length * 2);
  const requirementPenalty = Math.min(16, missingRequirements.length * 4);
  const priorityScore = clamp(
    Math.round(
      fitContribution +
        readinessContribution +
        qualityContribution +
        proofDepthContribution +
        upsideContribution +
        effortContribution +
        residualRiskContribution +
        gateAdjustment -
        blockerPenalty -
        requirementPenalty,
    ),
    0,
    100,
  );
  const strongestProof = (item.evidenceBundle || []).slice().sort((left, right) => right.evidenceScore - left.evidenceScore)[0] || null;
  const requirementGaps = missingRequirements.map((requirement) => ({
    requirement: requirement.requirement,
    status: requirement.status,
    repairAction: requirement.repairAction,
    verificationCommand: item.verificationCommand,
  }));
  const missingProofPlan = missingProofPlanFor({ item, deRiskPlan, requirementGaps });
  const manualUseGate = boardItem?.gate || (item.decisionGate.readyForManualUse ? "ready-for-manual-review" : "proof-repair-required");

  return {
    id: item.id,
    packageId: item.packageId,
    opportunityId: item.opportunityId,
    label: item.label,
    audience: item.audience,
    type: item.type,
    priorityScore,
    priorityBand: priorityBandFor(priorityScore),
    recommendation: recommendationFor({ priorityScore, manualUseGate, deRiskPlan, item }),
    fitScore: item.fitScore,
    readinessScore: item.readinessScore,
    qualityScore: benchmark?.score || item.readinessScore,
    residualRisk: deRiskPlan?.residualRisk ?? null,
    riskScore: deRiskPlan?.riskScore ?? null,
    riskBand: deRiskPlan?.riskBand || "unknown",
    estimatedEffort: opportunity?.estimatedEffort || "unknown",
    expectedUpside: opportunity?.expectedUpside || "unknown",
    manualUseGate,
    gateLabel: boardItem?.gateLabel || manualUseGate,
    rankFactors: {
      fitContribution,
      readinessContribution,
      qualityContribution,
      proofDepthContribution,
      upsideContribution,
      effortContribution,
      residualRiskContribution,
      gateAdjustment,
      blockerPenalty,
      requirementPenalty,
      blockers: item.blockers.length,
      missingRequirements: missingRequirements.length,
      evidenceDepth,
      packageRepairPlanItems: item.proofRepairPlan?.length || 0,
    },
    whyRanked: `${item.label} ranks from fit ${item.fitScore}/100, readiness ${item.readinessScore}/100, quality ${benchmark?.score || item.readinessScore}/100, ${item.blockers.length} blocker(s), ${missingRequirements.length} requirement gap(s), ${opportunity?.estimatedEffort || "unknown"} effort, and ${opportunity?.expectedUpside || "unknown"} upside.`,
    evidenceProfile: {
      proofProjects: item.evidenceBundle.length,
      artifacts: item.evidenceBundle.reduce((sum, project) => sum + project.artifacts.length, 0),
      claims: item.evidenceBundle.reduce((sum, project) => sum + project.claims.length, 0),
      completeTrialDescriptors: item.evidenceBundle.filter((project) => project.proofTrial?.descriptorComplete).length,
      strongestProofProject: strongestProof
        ? {
            slug: strongestProof.slug,
            title: strongestProof.title,
            evidenceScore: strongestProof.evidenceScore,
          }
        : null,
      proofBundleId: proofBundle?.id || null,
    },
    requirementGaps,
    missingProofPlan,
    decisionBoundary: {
      manualOnly: true,
      externalWrite: false,
      automaticSubmission: false,
      livePostingKnown: item.trackingBoundary.livePostingKnown,
      applicationStateKnown: item.trackingBoundary.applicationStateKnown,
      forbiddenActions: forbiddenActions(),
      useRule: "Repair or review locally only; a human must verify a real posting and decide any external action outside this app.",
    },
    deRisking: deRiskPlan
      ? {
          planId: deRiskPlan.id,
          riskScore: deRiskPlan.riskScore,
          residualRisk: deRiskPlan.residualRisk,
          riskBand: deRiskPlan.riskBand,
          readyAfterRepairs: deRiskPlan.manualReviewGate.readyAfterRepairs,
          nextStep: deRiskPlan.deRiskSteps[0]?.action || null,
        }
      : null,
    sourceTrace: [
      { type: "opportunity-package", id: item.packageId, label: item.label },
      { type: "opportunity-radar", id: opportunity?.id || item.id, label: opportunity?.label || item.label },
      { type: "opportunity-board-gate", id: manualUseGate, label: boardItem?.gateLabel || manualUseGate },
      ...(benchmark ? [{ type: "opportunity-quality-benchmark", id: benchmark.id, label: benchmark.label, score: benchmark.score }] : []),
      ...(deRiskPlan ? [{ type: "opportunity-derisking-plan", id: deRiskPlan.id, label: deRiskPlan.label, residualRisk: deRiskPlan.residualRisk }] : []),
      ...(item.proofRepairPlan?.length
        ? [{ type: "opportunity-package-repair-plan", id: `${item.id}.proof-repair-plan`, label: "Package proof repair plan", steps: item.proofRepairPlan.length }]
        : []),
    ],
    nextAction: missingProofPlan[0]?.action || item.nextAction,
    verificationCommand: `npm run rank:opportunities && npm run check && node server.js # then open /api/opportunity-ranking/${item.id}`,
  };
}

function missingProofPlanFor({ item, deRiskPlan, requirementGaps }) {
  const packageRepairSteps = (item.proofRepairPlan || []).slice(0, 4).map((step) => ({
    id: `package.${step.id}`,
    priority: step.priority,
    action: step.action,
    evidence: step.evidence,
    sideEffect: step.sideEffect,
    source: "opportunity-package-repair-plan",
    verificationCommand: step.verificationCommand,
  }));
  const deRiskSteps = (deRiskPlan?.deRiskSteps || [])
    .filter((step) => step.sideEffect !== "manual-only")
    .slice(0, 4)
    .map((step) => ({
      id: `derisk.${step.id}`,
      priority: step.priority,
      action: step.action,
      evidence: step.evidence,
      sideEffect: step.sideEffect,
      source: "opportunity-derisking",
      verificationCommand: step.verificationCommand,
    }));
  const blockerSteps = (item.blockers || []).slice(0, 4).map((blocker, index) => ({
    id: `blocker.${index + 1}`,
    priority: index === 0 ? "high" : "medium",
    action: blocker,
    evidence: item.id,
    sideEffect: "local-only",
    source: "opportunity-package",
    verificationCommand: item.verificationCommand,
  }));
  const requirementSteps = requirementGaps.slice(0, 4).map((requirement, index) => ({
    id: `requirement.${index + 1}`,
    priority: requirement.status === "missing" ? "high" : "medium",
    action: requirement.repairAction,
    evidence: requirement.requirement,
    sideEffect: "local-only",
    source: "requirement-coverage",
      verificationCommand: requirement.verificationCommand,
    }));
  return orderedUniqueByAction([...packageRepairSteps, ...deRiskSteps, ...blockerSteps, ...requirementSteps]).slice(0, 6);
}

function buildMissingProofQueue(rankings) {
  return rankings
    .flatMap((ranking) =>
      ranking.missingProofPlan.map((step) => ({
        id: `${ranking.id}.${step.id}`,
        opportunityId: ranking.id,
        packageId: ranking.packageId,
        rank: ranking.rank,
        priorityScore: ranking.priorityScore,
        priority: step.priority,
        action: step.action,
        sideEffect: step.sideEffect,
        source: step.source,
        verificationCommand: step.verificationCommand,
        boundary: "local proof repair only; no sending, submitting, scheduling, or third-party writes",
      })),
    )
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || right.priorityScore - left.priorityScore || left.id.localeCompare(right.id))
    .slice(0, 18);
}

function buildRequirementMatrix(rankings) {
  return rankings.map((ranking) => {
    const covered = ranking.rankFactors.missingRequirements === 0;
    return {
      id: `${ranking.id}.requirements`,
      opportunityId: ranking.id,
      packageId: ranking.packageId,
      coveredRequirements: covered ? "all" : "partial",
      missingRequirements: ranking.rankFactors.missingRequirements,
      blockerCount: ranking.rankFactors.blockers,
      gaps: ranking.requirementGaps,
      verificationCommand: ranking.verificationCommand,
    };
  });
}

function buildOpportunityPortfolio(rankings) {
  const primaryManual = rankings.filter((item) => item.manualUseGate !== "blocked-until-proof").slice(0, 2);
  const proofRepair = rankings.filter((item) => item.missingProofPlan.length > 0).slice(0, 4);
  const highUpside = rankings
    .filter((item) => item.expectedUpside === "high" || item.priorityScore >= 45)
    .sort((left, right) => right.priorityScore - left.priorityScore || (left.residualRisk || 0) - (right.residualRisk || 0))
    .slice(0, 4);
  const doNotAutomate = rankings.slice(0, 6);

  return [
    portfolioSlot({
      id: "primary-manual-review",
      label: "Primary manual review bets",
      allocationRule: "Top non-blocked packages that deserve human review after local proof checks.",
      items: primaryManual,
    }),
    portfolioSlot({
      id: "proof-repair-sprint",
      label: "Proof repair sprint",
      allocationRule: "Highest-ranked packages with concrete local proof repair steps.",
      items: proofRepair,
    }),
    portfolioSlot({
      id: "high-upside-watchlist",
      label: "High-upside watchlist",
      allocationRule: "High-upside or high-priority packages that stay internal until risk and live-posting proof improve.",
      items: highUpside,
    }),
    portfolioSlot({
      id: "do-not-automate-boundary",
      label: "Do-not-automate boundary",
      allocationRule: "All visible bets remain manual-only and external-write blocked until a human verifies a real opportunity.",
      items: doNotAutomate,
    }),
  ];
}

function portfolioSlot({ id, label, allocationRule, items }) {
  return {
    id,
    label,
    allocationRule,
    count: items.length,
    manualOnly: true,
    externalWrite: false,
    forbiddenActions: forbiddenActions(),
    items: items.map((item) => ({
      id: item.id,
      rank: item.rank,
      priorityScore: item.priorityScore,
      manualUseGate: item.manualUseGate,
      residualRisk: item.residualRisk,
      expectedUpside: item.expectedUpside,
      estimatedEffort: item.estimatedEffort,
      recommendedAction: item.nextAction,
      allocationReason: item.whyRanked,
      manualOnly: true,
      externalWrite: false,
      verificationCommand: item.verificationCommand,
    })),
  };
}

function buildDecisionLanes(rankings) {
  const definitions = [
    {
      id: "repair-now",
      label: "Repair now",
      intent: "Highest-fit packages where local proof repair is the best next move.",
    },
    {
      id: "repair-next",
      label: "Repair next",
      intent: "Useful packages that should wait behind stronger local proof-repair targets.",
    },
    {
      id: "hold-until-proof",
      label: "Hold until proof",
      intent: "Packages that stay internal until blocked gates, residual risk, or requirement gaps improve.",
    },
  ];
  return definitions.map((definition) => {
    const items = rankings.filter((item) => decisionLaneFor(item) === definition.id);
    return {
      ...definition,
      items,
      count: items.length,
      averagePriorityScore: average(items.map((item) => item.priorityScore)),
      manualOnly: true,
      externalWrite: false,
      nextAction: items[0]?.nextAction || "No package currently sits in this lane.",
    };
  });
}

function decisionLaneFor(item) {
  if (item.manualUseGate === "blocked-until-proof" || item.residualRisk > 45) return "hold-until-proof";
  if (item.priorityScore >= 50) return "repair-now";
  return "repair-next";
}

function rankingChecks({ rankings, decisionLanes, missingProofQueue, requirementMatrix, opportunityPortfolio, packages, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const requiredRoutes = [ENDPOINT, `${ENDPOINT}/:id`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`];
  const coveredRankings = decisionLanes.reduce((sum, lane) => sum + lane.items.length, 0);
  return [
    check(
      "package-coverage",
      rankings.length === (packages.packages || []).length && rankings.length > 0,
      "high",
      `${rankings.length}/${packages.packages?.length || 0} package(s) ranked.`,
      "Rank every opportunity package before exposing the ranking report.",
      "npm run check",
    ),
    check(
      "factor-depth",
      rankings.every((item) => Number.isInteger(item.priorityScore) && Object.keys(item.rankFactors || {}).length >= 10 && item.whyRanked && item.sourceTrace.length >= 4),
      "high",
      `${rankings.length} ranking row(s) include factor math, explanation, and source trace.`,
      "Attach inspectable ranking factors, explanations, and source traces to every opportunity ranking.",
      "npm run rank:opportunities",
    ),
    check(
      "manual-boundary",
      /must not send|submit applications|third-party/i.test(packages.manualOnlyPolicy || "") &&
        rankings.every((item) => item.decisionBoundary?.manualOnly === true && item.decisionBoundary?.externalWrite === false && item.decisionBoundary.forbiddenActions.includes("submit-application")),
      "high",
      "Package and ranking boundaries forbid external writes.",
      "Restore manual-only rules and forbidden external actions across opportunity ranking rows.",
      "npm run check",
    ),
    check(
      "derisk-alignment",
      rankings.every((item) => item.deRisking?.planId && Number.isInteger(item.residualRisk)),
      "high",
      `${rankings.filter((item) => item.deRisking?.planId).length}/${rankings.length} ranking row(s) align to de-risking plans.`,
      "Attach each ranking row to the matching opportunity de-risking plan and residual risk.",
      "npm run derisk:opportunities && npm run rank:opportunities",
    ),
    check(
      "proof-actionability",
      rankings.every((item) => item.missingProofPlan.length >= 3 && item.missingProofPlan.every((step) => step.verificationCommand)) &&
        missingProofQueue.length >= rankings.length &&
        rankings.every((item) => item.missingProofPlan.some((step) => step.source === "opportunity-package-repair-plan")),
      "high",
      `${missingProofQueue.length} queued proof repair action(s).`,
      "Give every ranked opportunity at least three local proof-repair actions with verification commands.",
      "npm run rank:opportunities",
    ),
    check(
      "requirement-matrix",
      requirementMatrix.length === rankings.length && requirementMatrix.every((row) => Number.isInteger(row.missingRequirements) && row.verificationCommand),
      "medium",
      `${requirementMatrix.length}/${rankings.length} requirement matrix row(s).`,
      "Expose requirement gaps for every ranked package.",
      "npm run check",
    ),
    check(
      "decision-lanes",
      decisionLanes.length === 3 && coveredRankings === rankings.length && decisionLanes.every((lane) => lane.manualOnly && lane.externalWrite === false),
      "medium",
      `${decisionLanes.length} lane(s) cover ${coveredRankings}/${rankings.length} ranking row(s).`,
      "Keep ranked opportunities grouped into manual-only decision lanes.",
      "npm run rank:opportunities",
    ),
    check(
      "portfolio-allocation",
      opportunityPortfolio.length >= 4 &&
        opportunityPortfolio.every(
          (slot) =>
            slot.manualOnly &&
            slot.externalWrite === false &&
            slot.forbiddenActions.includes("submit-application") &&
            slot.items.every((item) => item.manualOnly && item.externalWrite === false && item.verificationCommand),
        ) &&
        opportunityPortfolio.some((slot) => slot.id === "proof-repair-sprint" && slot.items.length >= 3) &&
        opportunityPortfolio.some((slot) => slot.id === "do-not-automate-boundary" && slot.items.length >= rankings.length),
      "high",
      `${opportunityPortfolio.reduce((sum, slot) => sum + slot.items.length, 0)} portfolio allocation item(s) across ${opportunityPortfolio.length} slot(s).`,
      "Keep opportunity portfolio slots manual-only, command-backed, and external-write blocked.",
      "npm run rank:opportunities",
    ),
    check(
      "route-manifest",
      requiredRoutes.every((route) => publicRoutes.includes(route)),
      "high",
      `${requiredRoutes.filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes.length} route(s) declared.`,
      "Add opportunity ranking routes to runtimeRouteManifest.",
      "npm run record:runtime-surface",
    ),
    check(
      "refresh-plan",
      (refreshPlan.endpoints || []).includes(ENDPOINT),
      "medium",
      `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"} in refresh plan.`,
      "Add opportunity ranking to the safe evidence refresh plan.",
      "npm run refresh:evidence",
    ),
    check(
      "script-coverage",
      Boolean(packageManifest.scripts?.["rank:opportunities"]),
      "medium",
      `rank:opportunities=${Boolean(packageManifest.scripts?.["rank:opportunities"])}`,
      "Add the rank:opportunities package script and recorder.",
      "npm run rank:opportunities",
    ),
  ];
}

function appendOpportunityRankingReceipt(root, receipt) {
  const receipts = readOpportunityRankingReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readOpportunityRankingReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestOpportunityRankingReceipt(root) {
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

function readOpportunityRankingHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readOpportunityRankingReceipts(root);
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

function buildOpportunityRankingHistory({ receipts = [], limit = 20, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "proof-backed-opportunity-ranking-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary:
      fullDetail
        ? "This endpoint returns full local opportunity-ranking receipts. It is still not a live posting, application, outreach, interview, deadline, funding, or recipient-interest proof."
        : undefined,
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local opportunity-ranking receipts only. It does not ingest live postings, submit applications, send outreach, schedule meetings, claim recipient interest, or write to third-party systems."
        : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          fullDetail,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
        }
      : {
          fullDetail,
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
          latestTopRankings: COMPACT_HISTORY_TOP_RANKINGS_LIMIT,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
    },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeOpportunityRankingReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Opportunity ranking history is available; run npm run rank:opportunities after opportunity, package, board, de-risking, quality, or proof changes."
        : "Run npm run rank:opportunities to create opportunity ranking history."
      : undefined,
    verificationCommand: fullDetail ? "npm run rank:opportunities && node --test test/api-contract.test.mjs" : undefined,
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function summarizeOpportunityRankingReceipt(receipt, { includePreview = true } = {}) {
  const failingChecks = (receipt.checks || []).filter((check) => !check.passed);
  const summary = {
    id: receipt.id,
    ...summarizeOpportunityRankingHistorySummary(receipt.summary),
  };
  if (!includePreview) {
    return {
      id: receipt.id,
      trendOnly: true,
      ...summarizeOpportunityRankingTrendSummary(receipt.summary),
    };
  }
  return {
    ...summary,
    topRankings: (receipt.topRankings || receipt.rankings || []).slice(0, COMPACT_HISTORY_TOP_RANKINGS_LIMIT).map(summarizeRankingPreview),
    ...(failingChecks.length
      ? {
          failingCheckSummary: failingChecks.slice(0, 6).map((check) => ({
            id: check.id,
            passed: Boolean(check.passed),
            severity: check.severity,
          })),
        }
      : {}),
  };
}

function summarizeOpportunityRankingHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    failing: summary.failing || 0,
    rankingCount: summary.rankings || 0,
    packageRepairActions: summary.packageRepairActions || 0,
    portfolioItems: summary.portfolioItems || 0,
    topOpportunityId: summary.topOpportunityId || null,
    topPriorityScore: summary.topPriorityScore || 0,
    blockedUntilProof: summary.blockedUntilProof || 0,
  };
}

function summarizeOpportunityRankingCompactSummary(summary = {}) {
  return {
    score: summary.score || 0,
    rankings: summary.rankings || 0,
    packageRepairActions: summary.packageRepairActions || 0,
    portfolioSlots: summary.portfolioSlots || 0,
    portfolioItems: summary.portfolioItems || 0,
    topOpportunityId: summary.topOpportunityId || null,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function summarizeOpportunityRankingTrendSummary(summary = {}) {
  return {
    score: summary.score || 0,
    rankingCount: summary.rankings || 0,
    packageRepairActions: summary.packageRepairActions || 0,
    failing: summary.failing || 0,
  };
}

function summarizeOpportunityRanking(item) {
  return {
    id: item.id,
    rank: item.rank,
    priorityScore: item.priorityScore,
    recommendation: item.recommendation,
    manualUseGate: item.manualUseGate,
    countSummary: {
      requirementGaps: item.requirementGaps?.length || 0,
      missingProofSteps: item.missingProofPlan?.length || 0,
      packageRepairActions: (item.missingProofPlan || []).filter((step) => step.source === "opportunity-package-repair-plan").length,
      forbiddenActions: item.decisionBoundary?.forbiddenActions?.length || 0,
    },
    detailEndpoint: `${ENDPOINT}/${item.id}`,
  };
}

function summarizeRankingPreview(item) {
  return {
    id: item.id,
    rank: item.rank,
    priorityScore: item.priorityScore,
    manualUseGate: item.manualUseGate,
  };
}

function summarizeDecisionLane(lane) {
  return {
    id: lane.id,
    count: lane.count,
    averagePriorityScore: lane.averagePriorityScore,
  };
}

function summarizePortfolioSlot(slot) {
  return {
    id: slot.id,
    count: slot.count,
  };
}

function summarizeMissingProofQueueItem(item) {
  return {
    opportunityId: item.opportunityId,
    rank: item.rank,
    priority: item.priority,
    sideEffect: item.sideEffect,
    source: item.source,
  };
}

function summarizeRequirementRow(row) {
  return {
    opportunityId: row.opportunityId,
    missingRequirements: row.missingRequirements,
    blockerCount: row.blockerCount,
  };
}

function summarizeCheckState(checks = []) {
  const passing = checks.filter((check) => check.passed).length;
  return {
    checks: checks.length,
    passing,
    failing: Math.max(0, checks.length - passing),
    portfolioAllocationPassed: checks.some((check) => check.id === "portfolio-allocation" && check.passed),
  };
}

function summarizeRankingCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity,
  };
}

function summarizeSourceTrace(trace) {
  return {
    type: trace.type,
    score: trace.score,
    residualRisk: trace.residualRisk,
    steps: trace.steps,
  };
}

function summarizeRequirementGap(gap) {
  return {
    requirement: gap.requirement,
    status: gap.status,
  };
}

function summarizeMissingProofStep(step) {
  return {
    priority: step.priority,
    sideEffect: step.sideEffect,
    source: step.source,
  };
}

function summarizeEvidenceProfile(profile = {}) {
  return {
    proofProjects: profile.proofProjects || 0,
    artifacts: profile.artifacts || 0,
    claims: profile.claims || 0,
    strongestProofProject: profile.strongestProofProject
      ? {
          slug: profile.strongestProofProject.slug,
          evidenceScore: profile.strongestProofProject.evidenceScore,
      }
      : null,
  };
}

function summarizeDecisionBoundary(boundary = {}) {
  return {
    manualOnly: boundary.manualOnly === true,
    externalWrite: boundary.externalWrite === true,
    forbiddenActionCount: (boundary.forbiddenActions || []).length,
  };
}

function summarizeRankingDeRisking(deRisking) {
  if (!deRisking) return null;
  return {
    residualRisk: deRisking.residualRisk,
    riskBand: deRisking.riskBand,
    readyAfterRepairs: deRisking.readyAfterRepairs,
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, 100));
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

function evidenceDepthScore(item) {
  const artifactCount = item.evidenceBundle.reduce((sum, project) => sum + project.artifacts.length, 0);
  const claimCount = item.evidenceBundle.reduce((sum, project) => sum + project.claims.length, 0);
  const trialDescriptors = item.evidenceBundle.filter((project) => project.proofTrial?.descriptorComplete).length;
  return clamp(Math.round(artifactCount * 6 + claimCount * 4 + trialDescriptors * 8), 0, 100);
}

function effortScore(effort) {
  return { small: 100, medium: 72, large: 42, unknown: 45 }[effort] ?? 45;
}

function upsideScore(upside) {
  return { high: 100, medium: 72, exploratory: 45, unknown: 40 }[upside] ?? 40;
}

function gateAdjustmentFor(gate) {
  if (gate === "ready-for-manual-review") return 8;
  if (gate === "proof-repair-required") return 4;
  if (gate === "blocked-until-proof") return -6;
  return 0;
}

function recommendationFor({ priorityScore, manualUseGate, deRiskPlan, item }) {
  if (manualUseGate === "ready-for-manual-review" && item.decisionGate.readyForManualUse) return "manual-review-candidate";
  if (manualUseGate === "blocked-until-proof" || (deRiskPlan?.residualRisk ?? 100) > 45) return "hold-until-proof";
  if (priorityScore >= 50) return "repair-primary-proof";
  return "repair-after-stronger-packages";
}

function forbiddenActions() {
  return ["send-message", "submit-application", "schedule-meeting", "claim-recipient-interest", "write-third-party-system"];
}

function priorityBandFor(score) {
  if (score >= 76) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function priorityRank(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 3;
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

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function orderedUniqueByAction(steps) {
  const seen = new Set();
  const result = [];
  for (const step of steps) {
    if (!step.action || seen.has(step.action)) continue;
    seen.add(step.action);
    result.push(step);
  }
  return result;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  appendOpportunityRankingReceipt,
  buildOpportunityRankingDetailResponse,
  buildOpportunityRankingHistory,
  buildOpportunityRankingReportFromReceipt,
  buildOpportunityRankingReport,
  buildOpportunityRankingResponse,
  opportunityRankingPlan,
  readLatestOpportunityRankingReceipt,
  readOpportunityRankingHistoryWindow,
  readOpportunityRankingReceipts,
  selectOpportunityRanking,
};
