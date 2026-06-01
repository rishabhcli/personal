const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/opportunity-derisking";
const STORE_RELATIVE_PATH = path.join("var", "opportunity-derisking-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function opportunityDeRiskingPlan() {
  return {
    mode: "proof-backed-opportunity-derisking-plan",
    command: "npm run derisk:opportunities",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe opportunity de-risking endpoints, writes a local receipt under var/, and does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems.",
  };
}

function buildOpportunityDeRiskingReport({
  opportunities,
  packages,
  board,
  opportunityQuality,
  artifactGapWorkbench = null,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const opportunityById = new Map((opportunities.opportunities || []).map((item) => [item.id, item]));
  const boardById = new Map((board.gates || []).flatMap((gate) => gate.packages.map((item) => [item.id, { ...item, gateLabel: gate.label }])));
  const benchmarkById = new Map((opportunityQuality.packageBenchmarks || []).map((item) => [item.id, item]));
  const artifactGapByProject = new Map((artifactGapWorkbench?.gaps || []).map((gap) => [gap.project, gap]));
  const plans = (packages.packages || []).map((item) =>
    deRiskPackage({
      item,
      opportunity: opportunityById.get(item.id),
      boardItem: boardById.get(item.id),
      benchmark: benchmarkById.get(item.id),
      artifactGaps: artifactGapsForPackage(item, artifactGapByProject),
    }),
  );
  const artifactGapQueue = buildArtifactGapQueue(plans);
  const checks = deRiskingChecks({ plans, packages, board, artifactGapWorkbench, artifactGapQueue, routeManifest, refreshPlan, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const highRiskPlans = plans.filter((plan) => plan.riskBand === "high");
  const assumptionAudits = plans.reduce((sum, plan) => sum + plan.assumptionAudit.assumptions.length, 0);
  const unverifiedAssumptions = plans.reduce((sum, plan) => sum + plan.assumptionAudit.assumptions.filter((assumption) => assumption.status !== "verified-public-safe").length, 0);
  const blockedExternalClaims = plans.reduce((sum, plan) => sum + plan.claimFirewall.blockedClaims.length, 0);
  const artifactGapWorkItems = plans.reduce((sum, plan) => sum + plan.artifactGapPressure.items.length, 0);

  return {
    generatedAt: new Date().toISOString(),
    mode: "proof-backed-opportunity-derisking",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report reduces risk for local public-safe opportunity packages. It does not claim live postings, deadlines, applications, interviews, scholarships, grants, funding, recipient interest, outreach status, or external availability.",
    manualUsePolicy:
      "Use this report to decide what to repair before manual review. The app must not send messages, submit applications, schedule meetings, claim recipient interest, or write to third-party systems automatically.",
    plan: opportunityDeRiskingPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      plans: plans.length,
      highRiskPlans: highRiskPlans.length,
      totalSteps: plans.reduce((sum, plan) => sum + plan.deRiskSteps.length, 0),
      highPrioritySteps: plans.reduce((sum, plan) => sum + plan.deRiskSteps.filter((step) => step.priority === "high").length, 0),
      readyAfterRepairs: plans.filter((plan) => plan.manualReviewGate.readyAfterRepairs).length,
      assumptionAudits,
      unverifiedAssumptions,
      blockedExternalClaims,
      artifactGapWorkItems,
      artifactGapHighPriorityItems: plans.reduce((sum, plan) => sum + plan.artifactGapPressure.items.filter((item) => item.priority === "high").length, 0),
      artifactGapNarrativeBlockers: plans.reduce((sum, plan) => sum + plan.artifactGapPressure.narrativeBlockingItems, 0),
      artifactGapQueueItems: artifactGapQueue.length,
      repairFirstPlans: plans.filter((plan) => plan.manualGoNoGo.status === "repair-first").length,
      manualReviewOnlyPlans: plans.filter((plan) => plan.manualGoNoGo.status === "manual-review-only").length,
      internalOnlyPlans: plans.filter((plan) => plan.manualGoNoGo.status === "internal-only").length,
      blockers: plans.reduce((sum, plan) => sum + plan.current.blockers, 0),
      latestReceiptId: receipts[0]?.id || null,
    },
    checks,
    plans,
    priorityQueue: buildPriorityQueue(plans),
    artifactGapQueue,
    artifactGapPolicy: {
      source: artifactGapWorkbench?.plan?.endpoint || "/api/artifact-gaps",
      routingRule: "Only artifact gaps for projects already present in an opportunity evidence bundle become opportunity de-risking work.",
      sideEffectBoundary:
        "Artifact-gap opportunity work is local proof repair only. It must not capture private screenshots, publish missing media, send outreach, submit applications, or claim external proof exists.",
    },
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nextAction: buildPriorityQueue(plans)[0]?.action || failing[0]?.repairAction || "Review the highest-risk opportunity plan manually before external use.",
    verificationCommand: "npm run derisk:opportunities && npm run check && npm run verify",
  };
}

function buildOpportunityDeRiskingReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "proof-backed-opportunity-derisking-receipt" || !receipt.summary) return null;
  if (!Array.isArray(receipt.plans) || !receipt.plans.every((plan) => Array.isArray(plan.deRiskSteps) && plan.assumptionAudit && plan.claimFirewall)) {
    return null;
  }
  const plans = receipt.plans.map((plan) => ({
    ...plan,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}/${plan.id}?refresh=1`,
  }));
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || `Cached opportunity de-risking check from ${receipt.id}.`,
    repairAction: check.repairAction || (check.passed ? "No cached opportunity de-risking repair needed." : "Refresh opportunity de-risking and repair the failing check."),
    verificationCommand: check.verificationCommand || "npm run derisk:opportunities",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "proof-backed-opportunity-derisking",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs opportunity de-risking from the latest local receipt. It is a fast public-safe cached report, not live posting ingestion, application state proof, recipient-interest evidence, outreach automation, scheduling, or third-party writing.",
    manualUsePolicy:
      "Use this cached report to decide what to repair before manual review. The app must not send messages, submit applications, schedule meetings, claim recipient interest, or write to third-party systems automatically.",
    plan: opportunityDeRiskingPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    checks,
    plans,
    priorityQueue: receipt.priorityQueue || buildPriorityQueue(plans),
    artifactGapQueue: receipt.artifactGapQueue || buildArtifactGapQueue(plans),
    artifactGapPolicy: receipt.artifactGapPolicy || {
      source: "/api/artifact-gaps",
      routingRule: "Cached opportunity de-risking preserves only the last recorded artifact-gap routing.",
      sideEffectBoundary:
        "Artifact-gap opportunity work is local proof repair only. It must not capture private screenshots, publish missing media, send outreach, submit applications, or claim external proof exists.",
    },
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
    nextAction:
      (receipt.priorityQueue || buildPriorityQueue(plans))[0]?.action ||
      failing[0]?.repairAction ||
      "Opportunity de-risking is served from the latest local receipt; run npm run derisk:opportunities or ?refresh=1 after opportunity, proof, artifact, or board changes.",
    verificationCommand: "npm run derisk:opportunities && npm run check && npm run verify",
  };
}

function selectOpportunityDeRisking(value, report) {
  const normalized = String(value || "").toLowerCase().trim();
  return (report.plans || []).find((item) => item.id === normalized || item.packageId === normalized || item.opportunityId === normalized) || null;
}

function buildOpportunityDeRiskingResponse(report, { detail = "summary", checkPreviewLimit = 4 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const plans = report.plans || [];
  const checks = report.checks || [];
  const checkLimit = boundedPreviewLimit(checkPreviewLimit, 4, 12);
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      deRiskingPayloadPolicy: deRiskingPayloadPolicy({ fullDetail, plans, returnedPlans: plans.length }),
    };
  }

  const selectedPlans = selectCompactOpportunityPlans(plans);
  const summarizedPlans = selectedPlans.map((plan) => summarizeOpportunityDeRiskingPlan(plan, { reportPreview: true }));
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    summary: summarizeOpportunityDeRiskingSummary(report.summary),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    checkSummary: summarizeOpportunityDeRiskingChecks(checks),
    checks: checks.slice(0, checkLimit).map(summarizeCheck),
    planSummary: summarizeOpportunityDeRiskingPlanDirectory(plans),
    plans: summarizedPlans,
    priorityQueueSummary: summarizeOpportunityHistoryQueue(report.priorityQueue || []),
    artifactGapQueueSummary: summarizeOpportunityQueue(report.artifactGapQueue || []),
    repairActionSummary: summarizeRepairActions(report.repairActions || []),
    sharedSafetyPolicy: summarizeSharedSafetyPolicy(plans),
    deRiskingPayloadPolicy: deRiskingPayloadPolicy({
      fullDetail,
      plans,
      returnedPlans: summarizedPlans.length,
      checkPreviewLimit: checkLimit,
      checksAvailable: checks.length,
    }),
  };
}

function buildOpportunityDeRiskingPlanResponse(plan, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = `${ENDPOINT}/${plan.id}?detail=full`;
  if (fullDetail) {
    return {
      ...plan,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      deRiskingPlanPayloadPolicy: deRiskingPlanPayloadPolicy({ fullDetail, plan }),
    };
  }

  return {
    ...summarizeOpportunityDeRiskingPlan(plan),
    detail: "summary",
    compact: true,
    refreshEndpoint: plan.refreshEndpoint,
    fullDetailEndpoint,
    deRiskingPlanPayloadPolicy: deRiskingPlanPayloadPolicy({ fullDetail, plan }),
  };
}

function deRiskPackage({ item, opportunity, boardItem, benchmark, artifactGaps = [] }) {
  const missingRequirements = (item.requirementCoverage || []).filter((requirement) => requirement.status !== "covered");
  const highRisks = (item.riskRegister || []).filter((risk) => risk.severity === "high");
  const blockerScore = Math.min(45, item.blockers.length * 7);
  const requirementScore = Math.min(25, missingRequirements.length * 8);
  const riskScore = Math.min(30, highRisks.length * 12 + (benchmark?.riskBand === "high" ? 15 : benchmark?.riskBand === "medium" ? 8 : 0));
  const artifactGapPressure = artifactGapPressureFor({ item, artifactGaps });
  const artifactGapScore = Math.min(24, artifactGapPressure.items.length * 4 + artifactGapPressure.highPriorityItems * 5 + artifactGapPressure.narrativeBlockingItems * 4);
  const rawRisk = clamp(Math.round(blockerScore + requirementScore + riskScore + artifactGapScore + (boardItem?.gate === "blocked-until-proof" ? 12 : 0) - item.readinessScore * 0.28), 0, 100);
  const deRiskSteps = stepsForPackage({ item, opportunity, boardItem, benchmark, missingRequirements, highRisks, artifactGapPressure, rawRisk });
  const residualRisk = clamp(rawRisk - deRiskSteps.filter((step) => step.priority === "high").length * 10 - deRiskSteps.filter((step) => step.sideEffect === "read-only").length * 3, 0, 100);
  const assumptionAudit = opportunityAssumptionAudit({ item, opportunity, boardItem, benchmark, missingRequirements, highRisks });
  const claimFirewall = opportunityClaimFirewall({ item, assumptionAudit });
  const manualGoNoGo = manualGoNoGoGate({ item, residualRisk, assumptionAudit, claimFirewall });

  return {
    id: item.id,
    packageId: item.packageId,
    opportunityId: item.opportunityId,
    label: item.label,
    audience: item.audience,
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}/${item.id}?refresh=1`,
    current: {
      fitScore: item.fitScore,
      readinessScore: item.readinessScore,
      readinessBand: item.readinessBand,
      qualityScore: benchmark?.score || item.readinessScore,
      qualityBand: benchmark?.band || bandFor(item.readinessScore),
      gate: boardItem?.gate || (item.decisionGate.readyForManualUse ? "ready-for-manual-review" : "proof-repair-required"),
      blockers: item.blockers.length,
      missingRequirements: missingRequirements.length,
      highRisks: highRisks.length,
      artifactGaps: artifactGapPressure.items.length,
      narrativeBlockingArtifactGaps: artifactGapPressure.narrativeBlockingItems,
      unverifiedAssumptions: assumptionAudit.summary.unverified,
      blockedExternalClaims: claimFirewall.blockedClaims.length,
      estimatedEffort: opportunity?.estimatedEffort || "unknown",
      expectedUpside: opportunity?.expectedUpside || "unknown",
    },
    riskScore: rawRisk,
    residualRisk,
    riskBand: riskBandFor(rawRisk),
    riskFactors: riskFactorsFor({ item, missingRequirements, highRisks, benchmark, boardItem, artifactGapPressure }),
    artifactGapPressure,
    deRiskSteps,
    assumptionAudit,
    claimFirewall,
    manualGoNoGo,
    manualReviewGate: {
      readyAfterRepairs: residualRisk <= 45 && item.readinessScore >= 55,
      goNoGoStatus: manualGoNoGo.status,
      reason:
        residualRisk <= 45 && item.readinessScore >= 55
          ? "After the listed repairs, this package can be manually reviewed with caveats and automatic sending disabled."
          : "Keep internal until the high-priority proof, requirement, or risk steps are completed.",
      forbiddenActions: ["send-message", "submit-application", "schedule-meeting", "claim-recipient-interest", "write-third-party-system"],
      evidenceToRecheck: orderedUnique([
        ...item.evidenceBundle.map((project) => project.slug),
        ...artifactGapPressure.items.map((gap) => gap.project),
        ...missingRequirements.map((requirement) => requirement.requirement),
      ]).slice(0, 8),
    },
    sourceTrace: [
      { type: "opportunity-package", id: item.packageId, label: item.label },
      { type: "opportunity-board-gate", id: boardItem?.gate || "unknown", label: boardItem?.gateLabel || "unknown" },
      ...(opportunity?.sourceTrace || []).slice(0, 4),
      ...(benchmark ? [{ type: "opportunity-quality-benchmark", id: benchmark.id, label: benchmark.label, score: benchmark.score }] : []),
      ...artifactGapPressure.items.slice(0, 3).map((gap) => ({
        type: "artifact-gap-workbench",
        id: gap.gapId,
        label: gap.projectTitle,
        priority: gap.priority,
      })),
    ],
    verificationCommand: `npm run check && node server.js # then open /api/opportunity-derisking/${item.id}`,
    nextAction: deRiskSteps[0]?.action || item.nextAction,
  };
}

function stepsForPackage({ item, opportunity, boardItem, benchmark, missingRequirements, highRisks, artifactGapPressure, rawRisk }) {
  const primaryRequirement = missingRequirements[0];
  const primaryBlocker = item.blockers[0];
  const strongestProof = item.evidenceBundle.slice().sort((left, right) => right.evidenceScore - left.evidenceScore)[0];
  const artifactGapSteps = artifactGapPressure.items.slice(0, 3).map((gap, index) =>
    step({
      id: `repair-artifact-gap-${slugify(gap.project)}`,
      priority: gap.priority === "high" || gap.narrativeBlocking ? "high" : index === 0 ? "medium" : "low",
      action: `Repair ${gap.projectTitle} proof media before manual use of ${item.label}: ${gap.action}`,
      evidence: gap.gapId,
      source: "artifact-gap-workbench",
      sideEffect: "local-only",
      verificationCommand: gap.verificationCommand,
    }),
  );
  const steps = [
    step({
      id: "confirm-archetype-boundary",
      priority: rawRisk >= 70 ? "high" : "medium",
      action: `Confirm ${item.label} is still an archetype and not a live posting before any manual reuse.`,
      evidence: opportunity?.sourceTrace?.[0]?.id || item.id,
      source: "opportunity-radar",
      sideEffect: "read-only",
      verificationCommand: `npm run check && node server.js # then open /api/opportunity-packages/${item.id}`,
    }),
    step({
      id: "repair-primary-blocker",
      priority: primaryBlocker ? "high" : "low",
      action: primaryBlocker || "No blocker is currently selected; keep proof receipts fresh before manual review.",
      evidence: primaryRequirement?.requirement || strongestProof?.slug || item.id,
      source: "opportunity-package-blocker",
      sideEffect: "local-only",
      verificationCommand: item.verificationCommand,
    }),
    step({
      id: "cover-missing-requirement",
      priority: primaryRequirement ? "high" : "medium",
      action: primaryRequirement
        ? primaryRequirement.repairAction
        : "Recheck requirement coverage and keep every covered requirement tied to public-safe evidence.",
      evidence: primaryRequirement?.requirement || "requirement-coverage",
      source: "requirement-coverage",
      sideEffect: "local-only",
      verificationCommand: item.verificationCommand,
    }),
    step({
      id: "strengthen-proof-bundle",
      priority: strongestProof?.evidenceScore < 70 || highRisks.length ? "high" : "medium",
      action: strongestProof
        ? `Strengthen ${strongestProof.title} proof with a fresh artifact, transcript, or receipt before manual use.`
        : "Attach at least one public-safe proof project before manual use.",
      evidence: strongestProof?.slug || "proof-bundle",
      source: "evidence-bundle",
      sideEffect: "local-only",
      verificationCommand: "npm run check && node server.js # then open /api/artifacts",
    }),
    ...artifactGapSteps,
    step({
      id: "manual-review-stop-rule",
      priority: boardItem?.gate === "blocked-until-proof" || benchmark?.riskBand === "high" ? "high" : "medium",
      action: "Stop before any outreach, application, scheduling, or recipient-specific claim until the de-risk steps are manually reviewed.",
      evidence: boardItem?.gate || benchmark?.id || "manual-boundary",
      source: "manual-boundary",
      sideEffect: "manual-only",
      verificationCommand: "npm run check && node server.js # then open /api/opportunity-board",
    }),
    step({
      id: "clear-external-assumptions",
      priority: "high",
      action:
        "Before manual reuse, label this as archetype-only and recheck live posting, deadline, application state, recipient interest, effort, and upside outside the app.",
      evidence: "opportunity-assumption-audit",
      source: "opportunity-assumption-audit",
      sideEffect: "read-only",
      verificationCommand: `npm run check && node server.js # then open /api/opportunity-derisking/${item.id}`,
    }),
  ];
  return steps;
}

function opportunityAssumptionAudit({ item, opportunity, boardItem, benchmark, missingRequirements, highRisks }) {
  const assumptions = [
    assumption({
      id: "live-posting",
      label: "Live posting exists",
      status: item.trackingBoundary?.livePostingKnown === true ? "verified-public-safe" : "unverified-external",
      severity: "critical",
      evidence: item.trackingBoundary?.reason || "Radar is archetype-based.",
      blockedClaim: "Do not claim a live posting exists.",
      verificationCommand: "npm run check && node server.js # then open /api/opportunities",
    }),
    assumption({
      id: "deadline",
      label: "Deadline is known",
      status: opportunity?.deadline ? "verified-public-safe" : "unverified-external",
      severity: "high",
      evidence: opportunity?.deadline || "No deadline is modeled.",
      blockedClaim: "Do not claim a deadline, closing date, or urgency.",
      verificationCommand: "npm run check && node server.js # then open /api/opportunities",
    }),
    assumption({
      id: "application-state",
      label: "Application state is known",
      status: item.trackingBoundary?.applicationStateKnown === true ? "verified-public-safe" : "unverified-external",
      severity: "critical",
      evidence: item.trackingBoundary?.reason || "No external application state is ingested.",
      blockedClaim: "Do not claim applied, invited, accepted, rejected, funded, or interviewed.",
      verificationCommand: `npm run check && node server.js # then open /api/opportunity-packages/${item.id}`,
    }),
    assumption({
      id: "recipient-interest",
      label: "Recipient interest exists",
      status: "unverified-external",
      severity: "critical",
      evidence: "No recipient, professor, recruiter, judge, funder, or maintainer response is ingested.",
      blockedClaim: "Do not claim recipient interest, reply likelihood, sponsorship, mentorship, or invitation.",
      verificationCommand: `npm run check && node server.js # then open /api/opportunity-derisking/${item.id}`,
    }),
    assumption({
      id: "requirement-fit",
      label: "Requirements are covered",
      status: missingRequirements.length === 0 ? "verified-public-safe" : "needs-local-proof",
      severity: missingRequirements.length > 1 ? "high" : "medium",
      evidence: `${item.requirementCoverage.length - missingRequirements.length}/${item.requirementCoverage.length} requirement(s) covered.`,
      blockedClaim: "Do not claim requirements are satisfied until missing coverage is repaired.",
      verificationCommand: item.verificationCommand,
    }),
    assumption({
      id: "risk-register",
      label: "High risks are cleared",
      status: highRisks.length === 0 && benchmark?.riskBand !== "high" ? "verified-public-safe" : "needs-local-proof",
      severity: highRisks.length || benchmark?.riskBand === "high" ? "high" : "medium",
      evidence: `${highRisks.length} high-risk register item(s); benchmark risk ${benchmark?.riskBand || "unknown"}.`,
      blockedClaim: "Do not imply this package is low-risk before risk register repairs are complete.",
      verificationCommand: "npm run audit:opportunity-quality && npm run derisk:opportunities",
    }),
    assumption({
      id: "effort-upside",
      label: "Effort and upside are calibrated",
      status: opportunity?.estimatedEffort && opportunity?.expectedUpside ? "verified-public-safe" : "unverified-external",
      severity: "medium",
      evidence: `effort=${opportunity?.estimatedEffort || "unknown"}; upside=${opportunity?.expectedUpside || "unknown"}.`,
      blockedClaim: "Do not claim exact time cost, likelihood, award value, compensation, funding, or upside.",
      verificationCommand: "npm run audit:opportunity-quality && node server.js # then open /api/evaluation/opportunity-quality",
    }),
  ];
  const unverified = assumptions.filter((item) => item.status !== "verified-public-safe");

  return {
    mode: "public-safe-opportunity-assumption-audit",
    summary: {
      assumptions: assumptions.length,
      verified: assumptions.length - unverified.length,
      unverified: unverified.length,
      criticalOpen: unverified.filter((item) => item.severity === "critical").length,
      localProofOpen: unverified.filter((item) => item.status === "needs-local-proof").length,
      externalOpen: unverified.filter((item) => item.status === "unverified-external").length,
      gate: boardItem?.gate || "unknown",
    },
    assumptions,
  };
}

function opportunityClaimFirewall({ item, assumptionAudit }) {
  const blockedClaims = assumptionAudit.assumptions
    .filter((assumption) => assumption.status !== "verified-public-safe")
    .map((assumption) => ({
      id: `blocked-${assumption.id}`,
      assumptionId: assumption.id,
      severity: assumption.severity,
      claim: assumption.blockedClaim,
      replacement: replacementClaimFor(assumption.id, item),
      verificationCommand: assumption.verificationCommand,
    }));

  return {
    mode: "opportunity-external-claim-firewall",
    externalWrite: false,
    publicSafeAllowedClaims: [
      `${item.label} is an archetype-derived preparation package.`,
      "Manual review is required before any outreach, application, scheduling, or recipient-specific reuse.",
      "Evidence comes from local public-safe portfolio metadata and generated receipts.",
    ],
    blockedClaims,
    forbiddenAutomation: ["send-message", "submit-application", "schedule-meeting", "claim-recipient-interest", "write-third-party-system"],
    verificationCommand: `npm run check && node server.js # then open /api/opportunity-derisking/${item.id}`,
  };
}

function manualGoNoGoGate({ item, residualRisk, assumptionAudit, claimFirewall }) {
  const criticalOpen = assumptionAudit.summary.criticalOpen;
  const localProofOpen = assumptionAudit.summary.localProofOpen;
  const status =
    residualRisk > 70 || localProofOpen >= 2
      ? "internal-only"
      : localProofOpen > 0 || item.blockers.length > 4
        ? "repair-first"
        : "manual-review-only";

  return {
    status,
    reason:
      status === "manual-review-only"
        ? "Local proof is strong enough for human review, but external facts remain unverified and automatic actions remain forbidden."
        : status === "repair-first"
          ? "Repair local proof or requirement gaps before manual external adaptation."
          : "Keep internal until residual risk and local proof gaps are reduced.",
    criticalOpen,
    localProofOpen,
    blockedExternalClaims: claimFirewall.blockedClaims.length,
    requiredBeforeManualUse: claimFirewall.blockedClaims.slice(0, 5).map((claim) => claim.replacement),
    allowedDecision: ["keep-internal", "repair-local-proof", "manual-review-with-caveats"],
    forbiddenDecision: ["send", "submit", "schedule", "claim-interest", "claim-live-posting", "claim-deadline"],
    verificationCommand: `npm run check && node server.js # then open /api/opportunity-derisking/${item.id}`,
  };
}

function assumption({ id, label, status, severity, evidence, blockedClaim, verificationCommand }) {
  return {
    id,
    label,
    status,
    severity,
    evidence,
    blockedClaim,
    verificationCommand,
  };
}

function replacementClaimFor(id, item) {
  if (id === "live-posting") return `${item.label} is an archetype package until a real posting source is manually attached.`;
  if (id === "deadline") return "No deadline is modeled; treat timing as unknown.";
  if (id === "application-state") return "No application state is known or claimed.";
  if (id === "recipient-interest") return "No recipient interest is known or claimed.";
  if (id === "requirement-fit") return "Requirement coverage is partial until local proof repairs pass.";
  if (id === "risk-register") return "Risk status remains caveated until high-risk items are repaired.";
  return "Effort and upside are coarse local labels, not real-world guarantees.";
}

function riskFactorsFor({ item, missingRequirements, highRisks, benchmark, boardItem, artifactGapPressure }) {
  return [
    item.blockers.length
      ? {
          id: "blockers",
          severity: item.blockers.length > 5 ? "high" : "medium",
          detail: `${item.blockers.length} blocker(s), first: ${item.blockers[0]}`,
        }
      : null,
    missingRequirements.length
      ? {
          id: "requirements",
          severity: missingRequirements.length > 1 ? "high" : "medium",
          detail: `${missingRequirements.length} requirement(s) not covered.`,
        }
      : null,
    highRisks.length
      ? {
          id: "risk-register",
          severity: "high",
          detail: `${highRisks.length} high-risk register item(s).`,
        }
      : null,
    benchmark?.riskBand === "high"
      ? {
          id: "quality-benchmark",
          severity: "high",
          detail: `${benchmark.label} quality benchmark is high risk at ${benchmark.score}/100.`,
        }
      : null,
    boardItem?.gate === "blocked-until-proof"
      ? {
          id: "board-gate",
          severity: "high",
          detail: "Opportunity board keeps this package blocked until proof is repaired.",
        }
      : null,
    artifactGapPressure.items.length
      ? {
          id: "artifact-gap-pressure",
          severity: artifactGapPressure.highPriorityItems || artifactGapPressure.narrativeBlockingItems ? "high" : "medium",
          detail: `${artifactGapPressure.items.length} artifact gap(s), ${artifactGapPressure.narrativeBlockingItems} narrative blocker(s), routed from /api/artifact-gaps.`,
        }
      : null,
  ].filter(Boolean);
}

function artifactGapsForPackage(item, artifactGapByProject) {
  const bundleSlugs = new Set((item.evidenceBundle || []).map((proof) => proof.slug));
  return [...bundleSlugs].map((slug) => artifactGapByProject.get(slug)).filter(Boolean);
}

function artifactGapPressureFor({ item, artifactGaps }) {
  const audienceKey = audienceKeyFor(item.audience);
  const items = artifactGaps
    .map((gap) => ({
      gapId: gap.id,
      project: gap.project,
      projectTitle: gap.projectTitle,
      gapType: gap.gapType,
      neededArtifact: gap.neededArtifact,
      priority: gap.priority || "medium",
      priorityScore: gap.priorityScore || 0,
      narrativeBlocking: (gap.narrativeBlockingAudiences || []).includes(audienceKey),
      narrativeBlockingAudiences: gap.narrativeBlockingAudiences || [],
      closureArtifactId: gap.closureArtifactId || null,
      replayId: gap.replayId || null,
      action: gap.nextAction || `Repair ${gap.projectTitle} artifact gap.`,
      forbiddenClaims: gap.forbiddenClaims || [],
      verificationCommand: gap.verificationCommand || "npm run audit:artifact-gaps",
    }))
    .sort((left, right) => Number(right.narrativeBlocking) - Number(left.narrativeBlocking) || priorityRank(left.priority) - priorityRank(right.priority) || right.priorityScore - left.priorityScore || left.projectTitle.localeCompare(right.projectTitle));

  return {
    mode: "artifact-gap-opportunity-pressure",
    audienceKey,
    items,
    routedGaps: items.length,
    highPriorityItems: items.filter((gap) => gap.priority === "high").length,
    narrativeBlockingItems: items.filter((gap) => gap.narrativeBlocking).length,
    closurePlans: items.filter((gap) => gap.closureArtifactId).length,
    replayPaths: items.filter((gap) => gap.replayId).length,
    forbiddenClaimGuards: items.filter((gap) => gap.forbiddenClaims.length >= 3).length,
    nextAction: items[0]?.action || "Keep artifact gap pressure visible before manual opportunity use.",
  };
}

function audienceKeyFor(value) {
  const text = String(value || "").toLowerCase();
  if (/research|professor|publication|lab|mentor/.test(text)) return "professor";
  if (/founder|startup|hackathon|civic|partnership|judge|collaborator/.test(text)) return "founder";
  return "recruiter";
}

function buildPriorityQueue(plans) {
  return plans
    .flatMap((plan) =>
      plan.deRiskSteps
        .filter((step) => step.priority === "high")
        .map((step) => ({
          id: `${plan.id}.${step.id}`,
          planId: plan.id,
          priority: step.priority,
          riskBand: plan.riskBand,
          action: step.action,
          sideEffect: step.sideEffect,
          verificationCommand: step.verificationCommand,
        })),
    )
    .sort((left, right) => riskRank(left.riskBand) - riskRank(right.riskBand) || left.id.localeCompare(right.id))
    .slice(0, 12);
}

function buildArtifactGapQueue(plans) {
  return plans
    .flatMap((plan) =>
      plan.artifactGapPressure.items.map((gap) => ({
        id: `${plan.id}.${gap.gapId}`,
        planId: plan.id,
        opportunityId: plan.opportunityId,
        priority: gap.narrativeBlocking ? "high" : gap.priority,
        riskBand: plan.riskBand,
        project: gap.project,
        projectTitle: gap.projectTitle,
        narrativeBlocking: gap.narrativeBlocking,
        action: `For ${plan.label}: ${gap.action}`,
        sideEffect: "local-only",
        verificationCommand: gap.verificationCommand,
      })),
    )
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || riskRank(left.riskBand) - riskRank(right.riskBand) || left.id.localeCompare(right.id))
    .slice(0, 12);
}

function deRiskingChecks({ plans, packages, board, artifactGapWorkbench, artifactGapQueue, routeManifest, refreshPlan, packageManifest }) {
  const routeCovered = (routeManifest.publicApiRoutes || []).includes(ENDPOINT);
  const refreshCovered = (refreshPlan.endpoints || []).includes(ENDPOINT);
  const scripts = packageManifest.scripts || {};
  const checks = [
    check("package-coverage", plans.length === (packages.packages || []).length && plans.length > 0, "high", `${plans.length}/${packages.packages?.length || 0} package(s) planned.`, "Generate one de-risking plan for every opportunity package."),
    check(
      "step-depth",
      plans.every((plan) => plan.deRiskSteps.length >= 6 && plan.deRiskSteps.every((step) => step.verificationCommand)),
      "high",
      `${plans.reduce((sum, plan) => sum + plan.deRiskSteps.length, 0)} step(s) with verification commands.`,
      "Attach at least six verified de-risk steps to every opportunity package, including external-assumption review.",
    ),
    check(
      "manual-boundary",
      /must not send|submit applications|schedule meetings|third-party/i.test(packages.manualOnlyPolicy || "") &&
        /must not send|submit applications|schedule meetings|third-party/i.test(board.manualUsePolicy || "") &&
        plans.every((plan) => plan.manualReviewGate.forbiddenActions.length >= 5),
      "high",
      "Package, board, and de-risk gates keep external writes disabled.",
      "Restore manual-only policy and forbidden external actions across opportunity reports.",
    ),
    check(
      "high-risk-actionability",
      plans.filter((plan) => plan.riskBand === "high").every((plan) => plan.deRiskSteps.some((step) => step.priority === "high" && step.sideEffect !== "manual-only")),
      "medium",
      `${plans.filter((plan) => plan.riskBand === "high").length} high-risk plan(s).`,
      "Ensure high-risk plans have local proof or requirement repairs, not only a stop rule.",
    ),
    check(
      "assumption-audit-depth",
      plans.every((plan) => plan.assumptionAudit.assumptions.length >= 7 && plan.assumptionAudit.assumptions.every((assumption) => assumption.verificationCommand)),
      "high",
      `${plans.reduce((sum, plan) => sum + plan.assumptionAudit.assumptions.length, 0)} assumption audit item(s).`,
      "Attach a verification-backed assumption audit to every opportunity plan.",
    ),
    check(
      "external-claim-firewall",
      plans.every((plan) => plan.claimFirewall.externalWrite === false && plan.claimFirewall.blockedClaims.length >= 4 && plan.claimFirewall.forbiddenAutomation.includes("claim-recipient-interest")),
      "high",
      `${plans.reduce((sum, plan) => sum + plan.claimFirewall.blockedClaims.length, 0)} blocked external claim(s).`,
      "Block live posting, deadline, application-state, recipient-interest, and other unverified external claims.",
    ),
    check(
      "manual-go-no-go",
      plans.every((plan) => ["manual-review-only", "repair-first", "internal-only"].includes(plan.manualGoNoGo.status) && plan.manualGoNoGo.forbiddenDecision.includes("claim-live-posting")),
      "medium",
      `${plans.filter((plan) => plan.manualGoNoGo.status === "manual-review-only").length} manual-review-only plan(s).`,
      "Add a go/no-go gate that permits only manual review, local repair, or internal hold states.",
    ),
    check(
      "effort-upside-recheck",
      plans.every((plan) => plan.assumptionAudit.assumptions.some((assumption) => assumption.id === "effort-upside" && assumption.status === "verified-public-safe")),
      "medium",
      "Every plan includes a public-safe effort/upside assumption recheck.",
      "Keep effort and upside labels present but prevent exact value or likelihood claims.",
    ),
    check("public-route-manifest", routeCovered, "high", `${ENDPOINT} ${routeCovered ? "is" : "is not"} declared.`, `Add ${ENDPOINT} to runtimeRouteManifest public routes.`),
    check("refresh-plan-coverage", refreshCovered, "medium", `${ENDPOINT} ${refreshCovered ? "is" : "is not"} refreshed.`, `Add ${ENDPOINT} to the safe evidence refresh plan.`),
    check("package-script", Boolean(scripts["derisk:opportunities"]), "medium", `derisk:opportunities=${Boolean(scripts["derisk:opportunities"])}`, "Add the derisk:opportunities package script and recorder receipt."),
  ];
  if (artifactGapWorkbench) {
    checks.push(
      check(
        "artifact-gap-routing",
        artifactGapQueue.length > 0 &&
          plans.some((plan) => plan.artifactGapPressure.items.length > 0) &&
          plans.every((plan) => plan.artifactGapPressure.items.length === 0 || plan.deRiskSteps.some((step) => step.source === "artifact-gap-workbench")),
        "high",
        `${artifactGapQueue.length} artifact-gap opportunity repair item(s) routed from ${artifactGapWorkbench.plan?.endpoint || "/api/artifact-gaps"}.`,
        "Route artifact-gap workbench priorities into local-only opportunity de-risking steps.",
      ),
      check(
        "artifact-gap-claim-guards",
        plans
          .flatMap((plan) => plan.artifactGapPressure.items)
          .every((gap) => gap.forbiddenClaims.length >= 3 && gap.verificationCommand),
        "high",
        `${plans.reduce((sum, plan) => sum + plan.artifactGapPressure.forbiddenClaimGuards, 0)} artifact gap(s) preserve screenshot/video/private-file forbidden claims.`,
        "Keep artifact gap forbidden-claim guards attached when routing gaps into opportunity work.",
      ),
    );
  }
  return checks;
}

function step({ id, priority, action, evidence, source, sideEffect, verificationCommand }) {
  return {
    id,
    priority,
    action,
    evidence,
    source: source || "opportunity-derisking",
    sideEffect,
    allowedAutomation: sideEffect === "read-only" ? "read local public-safe data only" : sideEffect === "local-only" ? "local evidence repair only" : "human manual action outside this app only",
    forbiddenAutomation: ["send", "submit", "schedule", "purchase", "claim-recipient-interest", "write-third-party-system"],
    verificationCommand,
  };
}

function appendOpportunityDeRiskingReceipt(root, receipt) {
  const receipts = readOpportunityDeRiskingReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readOpportunityDeRiskingReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestOpportunityDeRiskingReceipt(root) {
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

function readOpportunityDeRiskingHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readOpportunityDeRiskingReceipts(root);
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

function buildOpportunityDeRiskingHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "proof-backed-opportunity-derisking-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary:
      fullDetail
        ? "This endpoint returns full local opportunity de-risking receipts. It does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems."
        : undefined,
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local opportunity de-risking receipts only. It does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems."
        : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail: true,
          defaultLimit: 5,
          fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
        }
        : {
          fullDetail: false,
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
        },
    summary: summarizeOpportunityDeRiskingHistoryTopline({ limited, totalAvailable, boundedLimit, fullDetail }),
    receipts: fullDetail ? limited : limited.map((receipt, index) => (index === 0 ? summarizeOpportunityDeRiskingReceipt(receipt) : summarizeOpportunityDeRiskingTrendReceipt(receipt))),
    nextAction: fullDetail
      ? limited[0]
        ? "Opportunity de-risking history is available; run npm run derisk:opportunities after opportunity, proof, artifact, or board changes."
        : "Run npm run derisk:opportunities to create opportunity de-risking history."
      : undefined,
    verificationCommand: fullDetail ? "npm run derisk:opportunities && node --test test/api-contract.test.mjs" : undefined,
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function summarizeOpportunityDeRiskingReceipt(receipt) {
  const plans = receipt.plans || [];
  const priorityQueue = receipt.priorityQueue || [];
  const artifactGapQueue = receipt.artifactGapQueue || [];
  const checks = receipt.checks || [];
  return {
    id: receipt.id,
    summary: summarizeOpportunityDeRiskingHistorySummary(receipt.summary),
    planPreview: plans
      .slice()
      .sort((left, right) => (right.riskScore || 0) - (left.riskScore || 0) || left.id.localeCompare(right.id))
      .slice(0, 2)
      .map((plan) => ({
        id: plan.id,
        riskScore: plan.riskScore,
        goNoGoStatus: plan.manualGoNoGo?.status || null,
      })),
    planCount: plans.length,
    prioritySummary: summarizeOpportunityHistoryQueue(priorityQueue),
    artifactGapSummary: summarizeArtifactGapHistoryQueue(artifactGapQueue),
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    },
  };
}

function summarizeOpportunityDeRiskingTrendReceipt(receipt) {
  const summary = summarizeOpportunityDeRiskingHistorySummary(receipt.summary);
  return {
    id: receipt.id,
    latestReceiptPreviewOnly: true,
    trendSummary: {
      score: summary.score,
      highPrioritySteps: summary.highPrioritySteps,
    },
  };
}

function summarizeOpportunityDeRiskingHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    plans: summary.plans || 0,
    highPrioritySteps: summary.highPrioritySteps || 0,
    blockedExternalClaims: summary.blockedExternalClaims || 0,
    artifactGapWorkItems: summary.artifactGapWorkItems || 0,
  };
}

function summarizeOpportunityDeRiskingHistoryTopline({ limited, totalAvailable, boundedLimit, fullDetail }) {
  const latest = limited[0];
  const base = {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
  };
  if (!fullDetail) return base;
  return {
    ...base,
    latestScore: latest?.summary?.score || 0,
    latestPlans: latest?.summary?.plans || 0,
    latestHighPrioritySteps: latest?.summary?.highPrioritySteps || 0,
    latestBlockedExternalClaims: latest?.summary?.blockedExternalClaims || 0,
    latestArtifactGapWorkItems: latest?.summary?.artifactGapWorkItems || 0,
  };
}

function summarizeOpportunityHistoryQueue(queue = []) {
  return {
    total: queue.length,
    highPriority: queue.filter((item) => item.priority === "high").length,
  };
}

function summarizeArtifactGapHistoryQueue(queue = []) {
  return {
    total: queue.length,
    highPriority: queue.filter((item) => item.priority === "high").length,
    narrativeBlocking: queue.filter((item) => item.narrativeBlocking).length,
  };
}

function summarizeOpportunityQueue(queue = []) {
  return {
    total: queue.length,
    highPriority: queue.filter((item) => item.priority === "high").length,
    readOnly: queue.filter((item) => item.sideEffect === "read-only").length,
    localOnly: queue.filter((item) => item.sideEffect === "local-only").length,
    manualOnly: queue.filter((item) => item.sideEffect === "manual-only").length,
    planIds: orderedUnique(queue.map((item) => item.planId)).slice(0, 4),
  };
}

function summarizeArtifactGapQueue(queue = []) {
  return {
    total: queue.length,
    highPriority: queue.filter((item) => item.priority === "high").length,
    narrativeBlocking: queue.filter((item) => item.narrativeBlocking).length,
    localOnly: queue.filter((item) => item.sideEffect === "local-only").length,
    projects: orderedUnique(queue.map((item) => item.project)).slice(0, 5),
  };
}

function summarizeOpportunityDeRiskingPlan(plan, { reportPreview = false } = {}) {
  const highPrioritySteps = (plan.deRiskSteps || []).filter((step) => step.priority === "high");
  const blockedClaims = plan.claimFirewall?.blockedClaims || [];
  const assumptions = plan.assumptionAudit?.assumptions || [];
  if (reportPreview) {
    return {
      id: plan.id,
      riskBand: plan.riskBand,
      artifactGapMode: plan.artifactGapPressure?.mode,
      deRiskStepCount: (plan.deRiskSteps || []).length,
      deRiskStepPreview: selectStepPreview(plan.deRiskSteps || []).map((step) => ({
        source: step.source,
        sideEffect: step.sideEffect,
      })),
      livePostingStatus: assumptions.find((assumption) => assumption.id === "live-posting")?.status || null,
      recipientInterestBlocked: blockedClaims.some((claim) => claim.assumptionId === "recipient-interest"),
    };
  }
  return {
    id: plan.id,
    riskBand: plan.riskBand,
    artifactGapPressure: {
      mode: plan.artifactGapPressure?.mode,
      routedGaps: plan.artifactGapPressure?.routedGaps || 0,
      narrativeBlockingItems: plan.artifactGapPressure?.narrativeBlockingItems || 0,
    },
    deRiskStepCount: (plan.deRiskSteps || []).length,
    highPriorityStepCount: highPrioritySteps.length,
    deRiskStepPreview: selectStepPreview(plan.deRiskSteps || []).map(summarizeStepPreview),
    assumptionAudit: {
      mode: plan.assumptionAudit?.mode,
      livePostingStatus: assumptions.find((assumption) => assumption.id === "live-posting")?.status || null,
      criticalOpen: plan.assumptionAudit?.summary?.criticalOpen || 0,
    },
    claimFirewall: {
      externalWrite: plan.claimFirewall?.externalWrite === true ? true : false,
      blockedClaimCount: blockedClaims.length,
      recipientInterestBlocked: blockedClaims.some((claim) => claim.assumptionId === "recipient-interest"),
    },
    detailEndpoint: `${ENDPOINT}/${plan.id}`,
  };
}

function selectCompactOpportunityPlans(plans) {
  const selected = [];
  const seen = new Set();
  const push = (plan) => {
    if (!plan || seen.has(plan.id)) return;
    selected.push(plan);
    seen.add(plan.id);
  };
  const sorted = plans.slice().sort((left, right) => (right.riskScore || 0) - (left.riskScore || 0) || left.id.localeCompare(right.id));
  push(sorted.find((plan) => (plan.deRiskSteps || []).some((step) => step.source === "artifact-gap-workbench")));
  for (const plan of sorted) {
    if (selected.length >= 1) break;
    push(plan);
  }
  return selected;
}

function deRiskingPlanPayloadPolicy({ fullDetail, plan }) {
  return {
    fullDetail,
    fullDetailEndpoint: `${ENDPOINT}/${plan.id}?detail=full`,
    compactPlanFields: [
      "id",
      "label",
      "audience",
      "current",
      "riskScore",
      "residualRisk",
      "riskBand",
      "riskFactorCount",
      "artifactGapPressure",
      "deRiskStepPreview",
      "assumptionAudit",
      "claimFirewall",
      "manualGoNoGo",
      "manualReviewGate",
      "sourceTraceCount",
    ],
    omittedFromSummary: [
      "full risk factors",
      "full de-risk action text",
      "verification commands",
      "full assumption evidence",
      "blocked-claim replacement prose",
      "manual review forbidden action arrays",
      "full source trace labels",
    ],
    totals: {
      deRiskSteps: plan.deRiskSteps?.length || 0,
      assumptions: plan.assumptionAudit?.assumptions?.length || 0,
      blockedClaims: plan.claimFirewall?.blockedClaims?.length || 0,
      artifactGapItems: plan.artifactGapPressure?.items?.length || 0,
      sourceTrace: plan.sourceTrace?.length || 0,
    },
  };
}

function summarizeCurrentOpportunityState(current = {}) {
  return {
    fitScore: current.fitScore || 0,
    readinessScore: current.readinessScore || 0,
    blockers: current.blockers || 0,
    missingRequirements: current.missingRequirements || 0,
    artifactGaps: current.artifactGaps || 0,
  };
}

function summarizePriorityQueueItem(item) {
  return {
    id: item.id,
    planId: item.planId,
    priority: item.priority,
  };
}

function summarizeArtifactGapQueueItem(item) {
  return {
    id: item.id,
    priority: item.priority,
    sideEffect: item.sideEffect,
  };
}

function summarizeStepPreview(step) {
  return {
    id: step.id,
    priority: step.priority,
    source: step.source,
    sideEffect: step.sideEffect,
  };
}

function selectStepPreview(steps) {
  const selected = [];
  const seen = new Set();
  pushUniqueStep(selected, seen, steps.find((step) => step.source === "artifact-gap-workbench"));
  pushUniqueStep(selected, seen, steps.find((step) => step.id === "clear-external-assumptions"));
  for (const step of steps.filter((item) => item.priority === "high")) {
    if (selected.length >= 2) break;
    pushUniqueStep(selected, seen, step);
  }
  for (const step of steps) {
    if (selected.length >= 2) break;
    pushUniqueStep(selected, seen, step);
  }
  return selected;
}

function summarizeArtifactGapPolicy(policy = {}) {
  return {
    source: policy.source || "/api/artifact-gaps",
    routingRuleAvailable: Boolean(policy.routingRule),
    sideEffectBoundaryAvailable: Boolean(policy.sideEffectBoundary),
  };
}

function summarizeRepairActions(actions = []) {
  return {
    total: actions.length,
    high: actions.filter((action) => action.priority === "high").length,
  };
}

function pushUniqueStep(selected, seen, step) {
  if (!step || seen.has(step.id)) return;
  selected.push(step);
  seen.add(step.id);
}

function summarizeOpportunityDeRiskingSummary(summary = {}) {
  return {
    score: summary.score || 0,
    plans: summary.plans || 0,
    assumptionAudits: summary.assumptionAudits || 0,
    blockedExternalClaims: summary.blockedExternalClaims || 0,
    artifactGapWorkItems: summary.artifactGapWorkItems || 0,
    artifactGapQueueItems: summary.artifactGapQueueItems || 0,
    repairFirstPlans: summary.repairFirstPlans || 0,
    manualReviewOnlyPlans: summary.manualReviewOnlyPlans || 0,
    internalOnlyPlans: summary.internalOnlyPlans || 0,
  };
}

function summarizeOpportunityDeRiskingChecks(checks = []) {
  const failing = checks.filter((check) => !check.passed);
  const checkIds = new Set(checks.map((check) => check.id));
  return {
    total: checks.length,
    passed: checks.length - failing.length,
    failed: failing.length,
    assumptionAuditDepthAvailable: checkIds.has("assumption-audit-depth"),
    externalClaimFirewallAvailable: checkIds.has("external-claim-firewall"),
    manualGoNoGoAvailable: checkIds.has("manual-go-no-go"),
    artifactGapRoutingAvailable: checkIds.has("artifact-gap-routing"),
    artifactGapClaimGuardsAvailable: checkIds.has("artifact-gap-claim-guards"),
  };
}

function summarizeOpportunityDeRiskingPlanDirectory(plans = []) {
  return {
    total: plans.length,
    highRisk: plans.filter((plan) => plan.riskBand === "high").length,
  };
}

function deRiskingPayloadPolicy({ fullDetail, plans, returnedPlans, checkPreviewLimit = 0, checksAvailable = 0 }) {
  return {
    fullDetail,
    fullDetailAvailable: fullDetail ? undefined : true,
    plansReturned: returnedPlans,
    totalPlans: plans.length,
    checksReturned: fullDetail ? undefined : Math.min(checksAvailable, checkPreviewLimit),
  };
}

function summarizeCheck(item) {
  return {
    id: item.id,
    passed: Boolean(item.passed),
  };
}

function summarizeSharedSafetyPolicy(plans) {
  const firstPlan = plans[0] || {};
  const forbiddenAutomation = firstPlan.claimFirewall?.forbiddenAutomation || [];
  const forbiddenDecision = firstPlan.manualGoNoGo?.forbiddenDecision || [];
  const forbiddenActions = firstPlan.manualReviewGate?.forbiddenActions || [];
  return {
    blocksSendMessage: forbiddenActions.includes("send-message") || forbiddenAutomation.includes("send-message"),
    blocksRecipientInterest: forbiddenAutomation.includes("claim-recipient-interest") || forbiddenDecision.includes("claim-interest"),
    blocksLivePostingClaim: forbiddenDecision.includes("claim-live-posting"),
  };
}

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.min(Math.trunc(numeric), 50));
}

function boundedPreviewLimit(limit, fallback, max) {
  const numeric = Number(limit);
  return Math.max(0, Math.min(Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : fallback, max));
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

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: id === "package-script" ? "npm run derisk:opportunities" : "npm run check && node server.js # then open /api/opportunity-derisking",
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

function riskBandFor(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function riskRank(band) {
  return { high: 0, medium: 1, low: 2 }[band] ?? 3;
}

function priorityRank(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 3;
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "gap";
}

function orderedUnique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  appendOpportunityDeRiskingReceipt,
  buildOpportunityDeRiskingHistory,
  buildOpportunityDeRiskingReportFromReceipt,
  buildOpportunityDeRiskingReport,
  buildOpportunityDeRiskingPlanResponse,
  buildOpportunityDeRiskingResponse,
  opportunityDeRiskingPlan,
  readLatestOpportunityDeRiskingReceipt,
  readOpportunityDeRiskingHistoryWindow,
  readOpportunityDeRiskingReceipts,
  selectOpportunityDeRisking,
};
