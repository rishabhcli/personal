const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/artifact-gap-repair";
const STORE_RELATIVE_PATH = path.join("var", "artifact-gap-repair-receipts.json");
const maxReceipts = 50;
const HISTORY_REPAIR_ITEM_PREVIEW_LIMIT = 2;

function artifactGapProofRepairPlan() {
  return {
    mode: "artifact-gap-proof-repair-plan",
    command: "npm run repair:proof-gaps",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server, reads public-safe artifact gap repair queue endpoints, writes a local receipt under var/, and does not capture screenshots, approve private material, send outreach, submit applications, or write to third-party systems.",
  };
}

function buildArtifactGapProofRepairQueue({
  gapWorkbench,
  opportunityPackages,
  deRisking,
  narrativeTailor,
  routeManifest,
  refreshPlan = {},
  packageManifest,
  receipts = [],
}) {
  const gaps = gapWorkbench.gaps || [];
  const packages = opportunityPackages.packages || [];
  const deRiskPlans = deRisking.plans || [];

  const repairItems = gaps.map((gap) => repairItem({ gap, packages, deRiskPlans, narrativeTailor }));
  const sorted = repairItems.slice().sort((a, b) => b.unlockScore - a.unlockScore || b.gap.priorityScore - a.gap.priorityScore);

  const checks = repairQueueChecks({ repairItems: sorted, gapWorkbench, routeManifest, refreshPlan, packageManifest });
  const failing = checks.filter((c) => !c.passed);
  const allUnlockedOpps = [...new Set(sorted.flatMap((item) => item.linkedOpportunityIds))];
  const allAdvancedPlans = [...new Set(sorted.flatMap((item) => item.linkedDeRiskPlanIds))];

  return {
    generatedAt: new Date().toISOString(),
    mode: "artifact-gap-proof-repair",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This queue maps public-safe artifact gap repair priorities into concrete opportunity unlock actions. It does not claim screenshots exist, imply external proof, or authorize outreach, applications, or recipient contact.",
    sideEffectBoundary: artifactGapProofRepairPlan().sideEffectBoundary,
    plan: artifactGapProofRepairPlan(),
    summary: {
      repairItems: sorted.length,
      narrativeBlockingGaps: sorted.filter((item) => item.blockedAudiences.length > 0).length,
      opportunityUnlocks: allUnlockedOpps.length,
      deRiskAdvances: allAdvancedPlans.length,
      highPriorityItems: sorted.filter((item) => item.priority === "high").length,
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      auditScore: weightedCheckScore(checks),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      latestReceiptId: receipts[0]?.id || null,
    },
    repairQueue: sorted.slice(0, 10),
    repairActions: failing.map((c) => ({
      id: c.id,
      priority: c.severity,
      action: c.repairAction,
      verificationCommand: c.verificationCommand,
    })),
    checks,
    nextAction:
      sorted[0]?.nextAction ||
      "Keep artifact gap repair queue connected to opportunity unlock planning.",
    verificationCommand: "npm run repair:proof-gaps && npm run check && npm run verify",
  };
}

function buildArtifactGapProofRepairQueueFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "artifact-gap-proof-repair-receipt" || !receipt.summary) return null;
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "info",
    detail: check.detail || "Cached artifact gap repair check.",
    repairAction: check.passed ? "No cached artifact gap repair needed." : "Refresh proof gap repair and address the failing cached check.",
    verificationCommand: "npm run repair:proof-gaps",
  }));
  const repairQueue = (receipt.topRepairItems || []).map((item) => ({
    gapId: item.gapId,
    project: item.project || "cached",
    projectTitle: item.projectTitle || item.gapId,
    gapType: item.gapType || "cached-gap",
    neededArtifact: item.neededArtifact || "public-safe proof artifact",
    gapPriority: item.priority || "medium",
    priority: item.priority || "medium",
    unlockScore: item.unlockScore || 0,
    blockedAudiences: item.blockedAudiences || [],
    linkedOpportunityIds: [],
    linkedDeRiskPlanIds: [],
    opportunityUnlockCount: item.opportunityUnlockCount || 0,
    deRiskAdvanceCount: item.deRiskAdvanceCount || 0,
    repairPath: {
      step1: "Inspect the cached proof gap repair item.",
      step2: "Rerun artifact gap audit: npm run audit:artifact-gaps",
      step3: "Rerun opportunity derisking: npm run derisk:opportunities",
      step4: "Refresh proof gap repair: npm run repair:proof-gaps",
    },
    nextAction: `Refresh proof gap repair and inspect ${item.gapId}.`,
    verificationCommand: "npm run repair:proof-gaps",
    forbiddenClaims: forbiddenRepairClaims(),
    gap: {
      id: item.gapId,
      priorityScore: item.unlockScore || 0,
      closureArtifactId: null,
      replayId: null,
      sourceStatus: "cached-receipt",
    },
  }));

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "artifact-gap-proof-repair",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs proof gap repair from the latest local receipt. It is a fast public-safe cached queue, not proof that missing media exists, not external validation, and not authorization to contact anyone.",
    sideEffectBoundary: receipt.sideEffectBoundary || artifactGapProofRepairPlan().sideEffectBoundary,
    plan: artifactGapProofRepairPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    repairQueue,
    repairActions: checks
      .filter((check) => !check.passed)
      .map((check) => ({
        id: check.id,
        priority: check.severity,
        action: check.repairAction,
        verificationCommand: check.verificationCommand,
      })),
    checks,
    nextAction: repairQueue[0]?.nextAction || "Proof gap repair is served from the latest local receipt; run npm run repair:proof-gaps or ?refresh=1 after artifact, opportunity, narrative, route, or refresh changes.",
    verificationCommand: "npm run repair:proof-gaps && npm run check && npm run verify",
  };
}

function buildArtifactGapProofRepairResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      artifactGapRepairPayloadPolicy: artifactGapRepairPayloadPolicy({ report, fullDetail }),
    };
  }

  const { repairQueue = [], checks = [] } = report;
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    summary: summarizeArtifactGapRepairCompactSummary(report.summary),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    repairQueue: repairQueue.slice(0, 3).map(summarizeArtifactGapRepairItem),
    checks: checks.map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
    })),
    artifactGapRepairPayloadPolicy: artifactGapRepairPayloadPolicy({ report, fullDetail }),
  };
}

function summarizeArtifactGapRepairPlan(plan = {}) {
  return {
    commandAvailable: Boolean(plan.command),
  };
}

function summarizeArtifactGapRepairItem(item) {
  return {
    gapId: item.gapId,
    priority: item.priority,
    blockedAudienceCount: (item.blockedAudiences || []).length,
    opportunityUnlockCount: item.opportunityUnlockCount || 0,
    deRiskAdvanceCount: item.deRiskAdvanceCount || 0,
    forbiddenClaimCount: (item.forbiddenClaims || []).length,
  };
}

function artifactGapRepairPayloadPolicy({ report, fullDetail }) {
  if (!fullDetail) {
    return {
      fullDetail,
      repairItemsReturned: Math.min(report.repairQueue?.length || 0, 3),
      totalRepairItems: report.repairQueue?.length || 0,
      checksReturned: report.checks?.length || 0,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail,
    repairItemsReturned: report.repairQueue?.length || 0,
    checksReturned: report.checks?.length || 0,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    omittedFromSummaryCount: 0,
    omittedFromSummary: [],
  };
}

function summarizeArtifactGapRepairCompactSummary(summary = {}) {
  return {
    repairItems: summary.repairItems || 0,
    opportunityUnlocks: summary.opportunityUnlocks || 0,
    deRiskAdvances: summary.deRiskAdvances || 0,
    auditScore: summary.auditScore || 0,
    refreshCovered: summary.refreshCovered === true,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function buildArtifactGapRepairHistory({ receipts = [], limit = 2, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;

  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "artifact-gap-proof-repair-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local artifact gap repair receipts. It is not proof that missing artifacts exist, external validation, outreach approval, or application submission.",
          sideEffectBoundary:
            "The history endpoint reads local artifact gap repair receipts only. It does not capture screenshots, approve private material, send outreach, submit applications, or write to third-party systems.",
          receiptStore: STORE_RELATIVE_PATH,
        }
      : {}),
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail,
          defaultLimit: 5,
          fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
        }
      : {
          fullDetail,
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
          latestRepairItemPreviewLimit: HISTORY_REPAIR_ITEM_PREVIEW_LIMIT,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
    },
    definitions: fullDetail ? undefined : summarizeArtifactGapRepairHistoryDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeArtifactGapRepairReceipt(receipt, { latest: index === 0 })),
    ...(fullDetail
      ? {
          nextAction: latest
            ? "Artifact gap repair history is available; run npm run repair:proof-gaps after artifact, opportunity, narrative, route, or refresh changes."
            : "Run npm run repair:proof-gaps to create artifact gap repair history.",
          verificationCommand: "npm run repair:proof-gaps && node --test test/api-contract.test.mjs",
        }
      : {
          nextActionAvailable: true,
          verificationCommandAvailable: true,
        }),
  };
}

function summarizeArtifactGapRepairHistoryDefinitions(receipt) {
  const checks = receipt?.checks || [];
  return {
    fullReportEndpoint: `${ENDPOINT}?detail=full`,
    checks: {
      count: checks.length,
      refreshPlanCovered: checks.some((check) => check.id === "refresh-plan"),
      detailAvailable: checks.every((check) => Boolean(check.detail)),
    },
  };
}

function summarizeArtifactGapRepairReceipt(receipt, { latest = false } = {}) {
  const checks = receipt.checks || [];
  const topRepairItems = receipt.topRepairItems || [];
  const summary = {
    id: receipt.id,
    checkedAt: receipt.checkedAt || null,
    summary: latest ? summarizeArtifactGapRepairSummary(receipt.summary) : summarizeArtifactGapRepairTrendSummary(receipt.summary),
  };
  if (!latest) {
    return {
      ...summary,
      latestReceiptPreviewOnly: true,
    };
  }
  return {
    ...summary,
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    },
    topRepairItems: topRepairItems.slice(0, HISTORY_REPAIR_ITEM_PREVIEW_LIMIT).map((item) => ({
      gapId: item.gapId,
      priority: item.priority,
      blockedAudienceCount: (item.blockedAudiences || []).length,
      opportunityUnlockCount: item.opportunityUnlockCount || 0,
      deRiskAdvanceCount: item.deRiskAdvanceCount || 0,
    })),
  };
}

function summarizeArtifactGapRepairSummary(summary = {}) {
  return {
    repairItems: summary.repairItems || 0,
    opportunityUnlocks: summary.opportunityUnlocks || 0,
    deRiskAdvances: summary.deRiskAdvances || 0,
    auditScore: summary.auditScore || 0,
    refreshCovered: summary.refreshCovered === true,
  };
}

function summarizeArtifactGapRepairTrendSummary(summary = {}) {
  return {
    repairItems: summary.repairItems || 0,
    opportunityUnlocks: summary.opportunityUnlocks || 0,
    auditScore: summary.auditScore || 0,
  };
}

function repairItem({ gap, packages, deRiskPlans, narrativeTailor }) {
  const blockedAudiences = gap.narrativeBlockingAudiences || [];
  const linkedPackages = packages.filter((pkg) => audienceOverlaps(blockedAudiences, pkg.audience));
  const linkedDeRiskPlans = deRiskPlans.filter((plan) =>
    linkedPackages.some((pkg) => pkg.id === plan.id),
  );

  const unlockScore = clamp(
    blockedAudiences.length * 20 +
      linkedPackages.length * 10 +
      (gap.priority === "high" ? 25 : gap.priority === "medium" ? 15 : 5),
    0,
    100,
  );
  const priority = unlockScore >= 70 ? "high" : unlockScore >= 40 ? "medium" : "low";

  return {
    gapId: gap.id,
    project: gap.project,
    projectTitle: gap.projectTitle,
    gapType: gap.gapType,
    neededArtifact: gap.neededArtifact,
    gapPriority: gap.priority,
    priority,
    unlockScore,
    blockedAudiences,
    linkedOpportunityIds: linkedPackages.map((pkg) => pkg.id),
    linkedDeRiskPlanIds: linkedDeRiskPlans.map((plan) => plan.id),
    opportunityUnlockCount: linkedPackages.length,
    deRiskAdvanceCount: linkedDeRiskPlans.length,
    repairPath: {
      step1: gap.nextAction || `Attach a public-safe ${gap.neededArtifact} for ${gap.projectTitle}.`,
      step2: "Rerun artifact gap audit: npm run audit:artifact-gaps",
      step3: "Rerun opportunity derisking: npm run derisk:opportunities",
      step4: "Recheck narrative tailor readiness: npm run tailor:narratives",
    },
    nextAction:
      gap.nextAction ||
      `Provide a public-safe ${gap.neededArtifact} for ${gap.projectTitle} to unblock ${blockedAudiences.join(", ") || "catalog"} narrative readiness.`,
    verificationCommand:
      "npm run audit:artifact-gaps && npm run derisk:opportunities && npm run tailor:narratives",
    forbiddenClaims: [
      ...forbiddenRepairClaims(),
    ],
    gap: {
      id: gap.id,
      priorityScore: gap.priorityScore,
      closureArtifactId: gap.closureArtifactId,
      replayId: gap.replayId,
      sourceStatus: gap.sourceStatus,
    },
  };
}

function audienceOverlaps(blockedAudienceIds, packageAudience) {
  if (!blockedAudienceIds.length || !packageAudience) return false;
  const text = packageAudience.toLowerCase();
  return blockedAudienceIds.some((id) => {
    const normalized = String(id).toLowerCase();
    if (normalized === "recruiter") return /recruit/.test(text);
    if (normalized === "professor") return /professor|research|mentor|academic/.test(text);
    if (normalized === "founder") return /founder|startup|investor/.test(text);
    if (normalized === "agent-infra") return /agent|infra|developer/.test(text);
    if (normalized === "civic-tech") return /civic|public.interest|first.responder|community/.test(text);
    if (normalized === "accessibility") return /accessib|hardware|assistiv/.test(text);
    return text.includes(normalized);
  });
}

function repairQueueChecks({ repairItems, gapWorkbench, routeManifest, refreshPlan, packageManifest }) {
  const gapTotal = gapWorkbench.summary?.gaps || 0;
  const narrativeBlockingTotal = gapWorkbench.summary?.narrativeBlockingGaps || 0;
  return [
    check(
      "gap-repair-coverage",
      repairItems.length >= gapTotal,
      "high",
      `${repairItems.length}/${gapTotal} gap(s) routed into proof repair queue.`,
      "Generate one repair queue item per gap in the workbench.",
      "npm run repair:proof-gaps",
    ),
    check(
      "opportunity-unlock-linkage",
      repairItems.some((item) => item.opportunityUnlockCount > 0),
      "high",
      `${repairItems.filter((item) => item.opportunityUnlockCount > 0).length}/${repairItems.length} repair item(s) linked to opportunity packages.`,
      "Link proof gap repairs to the opportunity packages they would unblock.",
      "npm run repair:proof-gaps && npm run derisk:opportunities",
    ),
    check(
      "narrative-blocker-routing",
      repairItems.filter((item) => item.blockedAudiences.length > 0).length >= narrativeBlockingTotal,
      "high",
      `${repairItems.filter((item) => item.blockedAudiences.length > 0).length}/${narrativeBlockingTotal} narrative-blocking repair item(s) routed.`,
      "Route all narrative-blocking gaps through the proof repair queue.",
      "npm run repair:proof-gaps && npm run tailor:narratives",
    ),
    check(
      "forbidden-claims",
      repairItems.every((item) => item.forbiddenClaims.length >= 3),
      "high",
      "Every repair queue item carries forbidden claim guards.",
      "Keep forbidden-claim guards on all proof repair queue items.",
      "npm run repair:proof-gaps",
    ),
    check(
      "repair-path-depth",
      repairItems.every((item) => Object.keys(item.repairPath).length >= 4),
      "medium",
      `${repairItems.filter((item) => Object.keys(item.repairPath).length >= 4).length}/${repairItems.length} item(s) have complete 4-step repair paths.`,
      "Attach a complete repair path to every queue item.",
      "npm run repair:proof-gaps",
    ),
    check(
      "route-manifest",
      [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) =>
        (routeManifest.publicApiRoutes || []).includes(route),
      ),
      "medium",
      `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => (routeManifest.publicApiRoutes || []).includes(route)).length}/3 artifact gap repair route(s) declared.`,
      "Declare artifact gap repair report, plan, and history routes in the runtime manifest.",
      "npm run record:runtime-surface",
    ),
    check(
      "refresh-plan",
      (refreshPlan.endpoints || []).includes(ENDPOINT),
      "medium",
      `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "is" : "is not"} included in safe evidence refresh.`,
      "Add artifact gap repair to the evidence refresh plan so proof-gap routing stays warm.",
      "npm run refresh:evidence",
    ),
    check(
      "package-script",
      Boolean(packageManifest.scripts?.["repair:proof-gaps"]),
      "medium",
      `repair:proof-gaps=${Boolean(packageManifest.scripts?.["repair:proof-gaps"])}`,
      "Add the repair:proof-gaps package script.",
      "npm run repair:proof-gaps",
    ),
  ];
}

function appendArtifactGapRepairReceipt(root, receipt) {
  const receipts = readArtifactGapRepairReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readArtifactGapRepairReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function check(id, passed, severity, detail, repairAction, verificationCommand) {
  return {
    id,
    passed: Boolean(passed),
    severity: passed ? "info" : severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function weightedCheckScore(checks) {
  const weights = { high: 18, medium: 11, low: 6, info: 4 };
  const max = checks.reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  const earned = checks
    .filter((item) => item.passed)
    .reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.min(Math.trunc(numeric), 50));
}

function forbiddenRepairClaims() {
  return [
    "Do not claim a screenshot or video exists while sourceStatus remains missing.",
    "Do not treat this repair queue item as proof that media has been captured.",
    "Do not send outreach or submit applications based on repair queue status alone.",
  ];
}

module.exports = {
  artifactGapProofRepairPlan,
  appendArtifactGapRepairReceipt,
  buildArtifactGapRepairHistory,
  buildArtifactGapProofRepairQueueFromReceipt,
  buildArtifactGapProofRepairQueue,
  buildArtifactGapProofRepairResponse,
  readArtifactGapRepairReceipts,
};
