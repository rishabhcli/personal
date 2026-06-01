const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/trust-blockade";
const STORE_RELATIVE_PATH = path.join("var", "trust-blockade-receipts.json");

function trustBlockadePlan() {
  return {
    mode: "public-safe-trust-blockade-plan",
    command: "npm run audit:trust-blockade",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run manually after proof-model, graph, opportunity, runtime, or review-surface changes, and before publishing a new proof narrative.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe blocker endpoints, writes a local receipt under var/, and does not capture media, approve private artifacts, send outreach, submit applications, publish changes, or contact third parties.",
  };
}

function readTrustBlockadeReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function appendTrustBlockadeReceipt(root, receipt) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  const receipts = readTrustBlockadeReceipts(root);
  receipts.unshift(receipt);
  writeFileSync(storePath, `${JSON.stringify({ receipts: receipts.slice(0, 50) }, null, 2)}\n`);
  return receipt;
}

function buildTrustBlockadeHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const response = {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "public-safe-trust-blockade-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: trustBlockadeHistoryPayloadPolicy({ fullDetail, returnedReceipts: limited.length }),
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      ...(fullDetail
        ? {
            latestReceiptId: latest?.id || null,
            latestCheckedAt: latest?.checkedAt || null,
            latestScore: latest?.summary?.score || 0,
            latestFrontierItems: latest?.summary?.frontierItems || 0,
            latestFamilies: latest?.summary?.families || 0,
            latestHighPriority: latest?.summary?.highPriority || 0,
            latestGraphResolvedRepairPaths: latest?.summary?.graphResolvedRepairPaths || 0,
            latestGraphRepairPaths: latest?.summary?.graphRepairPaths || 0,
            latestPassing: latest?.summary?.passing || 0,
            latestFailing: latest?.summary?.failing || 0,
          }
        : {}),
    },
    definitions: undefined,
    receipts: fullDetail ? limited : limited.map((receipt, index) => (index === 0 ? summarizeTrustBlockadeReceipt(receipt) : summarizeTrustBlockadeTrendReceipt(receipt))),
  };

  if (fullDetail) {
    return {
      ...response,
      sourceBoundary:
        "This endpoint returns full local trust-blockade receipts. It does not capture media, approve private artifacts, send outreach, submit applications, publish changes, or contact third parties.",
      sideEffectBoundary:
        "The history endpoint reads local trust-blockade receipts only. It does not capture media, approve private artifacts, send outreach, submit applications, publish changes, or contact third parties.",
      receiptStore: STORE_RELATIVE_PATH,
      nextAction: latest
        ? "Trust blockade history is available; run npm run audit:trust-blockade after proof-model, graph, opportunity, runtime, or review-surface changes."
        : "Run npm run audit:trust-blockade to create trust blockade history.",
      verificationCommand: "npm run audit:trust-blockade && node --test test/api-contract.test.mjs",
    };
  }

  return {
    ...response,
    nextActionAvailable: undefined,
    verificationCommandAvailable: undefined,
  };
}

function trustBlockadeHistoryPayloadPolicy({ fullDetail, returnedReceipts }) {
  return {
    fullDetail,
    fullDetailAvailable: true,
    ...(fullDetail
      ? {
          returnedReceipts,
          latestFrontierPreviewLimit: "all",
          latestCheckPreviewLimit: "all",
        }
      : {}),
  };
}

function summarizeTrustBlockadeHistoryDefinitions(receipt) {
  return {
    evidenceAccess: {
      fullReportAvailable: true,
      fullHistoryAvailable: true,
    },
    latestCounts: {
      families: receipt?.families?.length || 0,
      checks: receipt?.checks?.length || 0,
      frontierItems: receipt?.frontier?.length || 0,
    },
  };
}

function summarizeTrustBlockadeTrendReceipt(receipt) {
  return {
    id: receipt.id,
    summary: summarizeTrustBlockadeTrendSummary(receipt.summary),
    familyCount: receipt.families?.length || 0,
    frontierCount: receipt.frontier?.length || 0,
    checkCount: receipt.checks?.length || 0,
  };
}

function summarizeTrustBlockadeSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    frontierItems: summary.frontierItems || 0,
    families: summary.families || 0,
    highPriority: summary.highPriority || 0,
    graphResolvedRepairPaths: summary.graphResolvedRepairPaths || 0,
    graphRepairPaths: summary.graphRepairPaths || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
  };
}

function summarizeTrustBlockadeTrendSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    passing: summary.passing || 0,
    failing: summary.failing || 0,
  };
}

function summarizeTrustBlockadeReceipt(receipt) {
  return {
    id: receipt.id,
    summary: summarizeTrustBlockadeTrendSummary(receipt.summary),
    familyCount: receipt.families?.length || 0,
    frontierCount: receipt.frontier?.length || 0,
    checkCount: receipt.checks?.length || 0,
    frontierPreview: (receipt.frontier || []).slice(0, 3).map(({ family, priority, score }) => ({
      family,
      priority,
      score,
    })),
    checks: (receipt.checks || []).slice(0, 4).map(({ id, passed }) => ({
      id,
      passed,
    })),
  };
}

function buildTrustBlockadeReport({
  claims = [],
  trust = {},
  artifactCatalog = {},
  artifactGapRepair = {},
  graphLineage = {},
  opportunityBoard = {},
  opportunityQuality = {},
  runtimeEvidenceChain = {},
  selfReview = {},
  changeHistory = {},
  routeManifest = {},
  refreshPlan = {},
  packageManifest = {},
  receipts = [],
}) {
  const frontier = trustFrontier({
    claims,
    trust,
    artifactCatalog,
    artifactGapRepair,
    graphLineage,
    opportunityBoard,
    opportunityQuality,
    runtimeEvidenceChain,
    selfReview,
    changeHistory,
  });
  const checks = trustBlockadeChecks({ frontier, routeManifest, refreshPlan, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;
  const families = [...new Set(frontier.map((item) => item.family))];

  return {
    generatedAt: new Date().toISOString(),
    mode: "public-safe-trust-blockade-frontier",
    sourceBoundary:
      "This frontier ranks public-safe trust blockers already modeled by the app. It does not read private documents, user analytics, inboxes, school portals, provider dashboards, or third-party systems.",
    sideEffectBoundary: trustBlockadePlan().sideEffectBoundary,
    plan: trustBlockadePlan(),
    summary: {
      score,
      band: bandFor(score),
      frontierItems: frontier.length,
      families: families.length,
      highPriority: frontier.filter((item) => item.priority === "high").length,
      weakClaims: trust.counts?.needsSourceClaims || 0,
      screenshotGaps: artifactCatalog.counts?.screenshotGaps || 0,
      artifactRepairItems: artifactGapRepair.summary?.repairItems || 0,
      graphRepairPaths: graphLineage.summary?.artifactGapRepairPaths || 0,
      graphResolvedRepairPaths: graphLineage.summary?.graphResolvedArtifactGapRepairPaths || 0,
      opportunityBlockers: opportunityBoard.summary?.blockerQueue || 0,
      runtimeBlockingLinks: runtimeEvidenceChain.summary?.blockingLinks || 0,
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      latestReceiptId: latestReceipt?.id || null,
      routeCovered: (routeManifest.publicApiRoutes || []).includes(ENDPOINT),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
    },
    families: families.map((family) => ({
      id: family,
      items: frontier.filter((item) => item.family === family).length,
      maxSeverity: maxSeverity(frontier.filter((item) => item.family === family)),
    })),
    frontier,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nonClaims: trustBlockadeNonClaims(),
    nextAction: frontier[0]?.action || "Keep trust blockers explicit and rerun the trust blockade audit after proof-model changes.",
    verificationCommand: "npm run audit:trust-blockade && npm run check && npm run test",
  };
}

function buildTrustBlockadeReportFromReceipt(receipt) {
  if (!receipt) return null;
  const plan = trustBlockadePlan();
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || `Cached ${check.id} check from ${receipt.id}.`,
    repairAction: check.repairAction || "Rerun the full trust blockade audit to refresh this cached check.",
    verificationCommand: check.verificationCommand || plan.command,
  }));
  const frontier = (receipt.frontier || []).map((item) => ({
    id: item.id,
    family: item.family,
    priority: item.priority || "medium",
    score: item.score || 0,
    label: item.label || `${item.family || "trust"} blocker ${item.id || ""}`.trim(),
    action: item.action || `Refresh the full trust blockade frontier with ${plan.command}.`,
    evidence: item.evidence || `Cached from ${receipt.id}; run ${plan.command} for full frontier evidence.`,
    verificationCommand: item.verificationCommand || plan.command,
  }));
  return {
    generatedAt: receipt.checkedAt || new Date().toISOString(),
    mode: "public-safe-trust-blockade-frontier",
    cachedFromReceipt: true,
    cachePolicy: {
      receiptId: receipt.id,
      checkedAt: receipt.checkedAt || null,
      refreshEndpoint: `${ENDPOINT}?refresh=1`,
      refreshCommand: plan.command,
    },
    sourceBoundary:
      "This fast response is reconstructed from the latest local trust-blockade receipt. Use ?refresh=1 or the audit command to recompute the full frontier.",
    sideEffectBoundary: receipt.sideEffectBoundary || plan.sideEffectBoundary,
    plan,
    summary: {
      ...(receipt.summary || {}),
      latestReceiptId: receipt.id,
      checks: receipt.summary?.checks ?? checks.length,
      passing: receipt.summary?.passing ?? checks.filter((check) => check.passed).length,
      failing: receipt.summary?.failing ?? checks.filter((check) => !check.passed).length,
    },
    families: receipt.families || [],
    frontier,
    checks,
    repairActions: checks
      .filter((check) => !check.passed)
      .map((check) => ({
        id: check.id,
        priority: check.severity,
        action: check.repairAction,
        verificationCommand: check.verificationCommand,
      })),
    nonClaims: trustBlockadeNonClaims(),
    nextAction: frontier[0]?.action || `Refresh the full trust blockade frontier with ${plan.command}.`,
    verificationCommand: `${plan.command} && npm run check && npm run test`,
  };
}

function buildTrustBlockadeReportResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      trustBlockadePayloadPolicy: trustBlockadePayloadPolicy({
        fullDetail,
        report,
        returnedFrontier: report.frontier?.length || 0,
        returnedRepairActions: report.repairActions?.length || 0,
      }),
    };
  }

  const frontier = report.frontier || [];
  const checks = report.checks || [];
  const repairActions = report.repairActions || [];
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    summary: report.summary,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    families: (report.families || []).map(({ id }) => ({ id })),
    frontierPreview: frontier.slice(0, 3).map(({ family, priority, score }) => ({
      family,
      priority,
      score,
    })),
    checks: checks.slice(0, 4).map(({ id, passed }) => ({
      id,
      passed,
    })),
    nonClaimTopics: trustBlockadeNonClaimTopics(report.nonClaims || []),
    nextActionAvailable: undefined,
    verificationCommandAvailable: undefined,
    trustBlockadePayloadPolicy: trustBlockadePayloadPolicy({
      fullDetail,
      report,
      returnedFrontier: Math.min(frontier.length, 3),
      returnedRepairActions: repairActions.length,
      returnedChecks: Math.min(checks.length, 4),
    }),
  };
}

function summarizeTrustBlockadeCachePolicy(cachePolicy) {
  if (!cachePolicy || cachePolicy === "live-refresh") return "live-refresh";
  return {
    receiptId: cachePolicy.receiptId || null,
    checkedAt: cachePolicy.checkedAt || null,
  };
}

function summarizeTrustBlockadePlan(plan = trustBlockadePlan()) {
  return {
    receiptStoreAvailable: Boolean(plan.receiptStore),
    commandAvailable: Boolean(plan.command),
  };
}

function summarizeTrustBlockadeFrontierDirectory(frontier = []) {
  return {
    total: frontier.length,
    families: [...new Set(frontier.map((item) => item.family))],
  };
}

function trustBlockadeNonClaimTopics(nonClaims = []) {
  const text = nonClaims.join(" ").toLowerCase();
  return {
    blocksMissingArtifactClaims: /missing screenshots|missing media|artifacts already exist|videos|demos/.test(text),
    blocksExternalOutcomeClaims: /outreach|applications|interviews|offers|funding|admissions|recipient interest/.test(text),
    blocksExternalSideEffects: /publish|deploy|contact third parties|mutate external systems|approve private media/.test(text),
    requiresHumanReview: /human review|private source material|opportunity postings|deadlines/.test(text),
  };
}

function trustBlockadePayloadPolicy({ fullDetail, report, returnedFrontier, returnedRepairActions, returnedChecks }) {
  const frontier = report.frontier || [];
  const checks = report.checks || [];
  const repairActions = report.repairActions || [];
  if (!fullDetail) {
    return {
      fullDetail,
      returnedFrontierItems: returnedFrontier,
      returnedChecks,
    };
  }
  return {
    fullDetail,
    fullDetailAvailable: true,
    fullHistoryAvailable: true,
    totals: {
      frontierItems: frontier.length,
      checks: checks.length,
      repairActions: repairActions.length,
      families: report.families?.length || 0,
      nonClaims: report.nonClaims?.length || 0,
    },
    returned: {
      frontierItems: returnedFrontier,
      checks: checks.length,
      repairActions: returnedRepairActions,
    },
    compactOmissionAvailable: !fullDetail,
  };
}

function trustBlockadeNonClaims() {
  return [
    "Does not claim missing screenshots, videos, demos, or artifacts already exist.",
    "Does not claim outreach, applications, interviews, offers, funding, admissions, or recipient interest.",
    "Does not publish, deploy, approve private media, contact third parties, or mutate external systems.",
    "Does not replace human review of real opportunity postings, deadlines, or private source material.",
  ];
}

function trustFrontier({
  claims,
  trust,
  artifactCatalog,
  artifactGapRepair,
  graphLineage,
  opportunityBoard,
  opportunityQuality,
  runtimeEvidenceChain,
  selfReview,
  changeHistory,
}) {
  const frontier = [];
  const weakClaims = claims.filter((claim) => claim.evidenceStrength === "needs-source");
  if (weakClaims.length) {
    frontier.push(
      blockadeItem({
        family: "weak-claims",
        id: "weak-claims.need-source",
        priority: weakClaims.length >= 3 ? "high" : "medium",
        score: clamp(48 + weakClaims.length * 8, 0, 100),
        label: `${weakClaims.length} claim(s) need stronger source attachments`,
        action: weakClaims[0].suggestedRepair || "Attach stronger public-safe sources to weak claims.",
        evidence: `${trust.counts?.needsSourceClaims || weakClaims.length} needs-source claim(s); ${trust.counts?.staleClaims || 0} stale claim(s).`,
        verificationCommand: "npm run audit:claim-calibration && npm run audit:proof-quality",
      }),
    );
  }

  for (const item of (artifactGapRepair.repairQueue || []).slice(0, 4)) {
    frontier.push(
      blockadeItem({
        family: "artifact-gap-repair",
        id: `artifact-gap.${item.gapId}`,
        priority: item.priority === "high" ? "high" : "medium",
        score: item.unlockScore,
        label: `${item.gapId} blocks proof-media completeness`,
        action: item.nextAction,
        evidence: `${item.opportunityUnlockCount} opportunity unlock(s); ${item.blockedAudiences.length} narrative audience blocker(s).`,
        verificationCommand: "npm run repair:proof-gaps",
      }),
    );
  }

  const graphSummary = graphLineage.summary || {};
  if ((graphSummary.artifactGapRepairPaths || 0) > 0) {
    frontier.push(
      blockadeItem({
        family: "graph-repair-paths",
        id: "graph.artifact-gap-repair-paths",
        priority: graphSummary.graphResolvedArtifactGapRepairPaths === graphSummary.artifactGapRepairPaths ? "medium" : "high",
        score: percent(graphSummary.graphResolvedArtifactGapRepairPaths || 0, graphSummary.artifactGapRepairPaths || 0),
        label: "Graph-visible proof repair paths must stay resolved",
        action:
          graphLineage.artifactGapRepairLineage?.nextAction ||
          "Keep artifact gap repair paths graph-resolved before promoting proof-media completeness.",
        evidence: `${graphSummary.graphResolvedArtifactGapRepairPaths || 0}/${graphSummary.artifactGapRepairPaths || 0} graph-resolved repair path(s).`,
        verificationCommand: "npm run audit:graph-lineage && npm run audit:graph-depth",
      }),
    );
  }

  for (const blocker of (opportunityBoard.blockerQueue || []).slice(0, 4)) {
    frontier.push(
      blockadeItem({
        family: "opportunity-blockers",
        id: `opportunity.${blocker.packageId || blocker.id}`,
        priority: blocker.priority === "high" ? "high" : "medium",
        score: clamp(60 + (blocker.priority === "high" ? 24 : 10), 0, 100),
        label: blocker.label || blocker.packageId || "Opportunity blocker",
        action: blocker.repairAction,
        evidence: `board blockers=${opportunityBoard.summary?.blockerQueue || 0}; opportunity quality=${opportunityQuality.summary?.score || 0}/100.`,
        verificationCommand: blocker.verificationCommand || "npm run audit:opportunity-quality && npm run score:opportunities",
      }),
    );
  }

  for (const link of (runtimeEvidenceChain.chainLinks || []).filter((item) => item.blocking).slice(0, 3)) {
    frontier.push(
      blockadeItem({
        family: "runtime-receipts",
        id: `runtime.${link.id}`,
        priority: "high",
        score: clamp(100 - (link.score || 0), 0, 100),
        label: `${link.label || link.id} receipt blocks runtime trust`,
        action: `Refresh ${link.id} with ${link.verificationCommand}.`,
        evidence: `${link.freshness} receipt; score=${link.score}/100.`,
        verificationCommand: link.verificationCommand || "npm run audit:runtime-chain",
      }),
    );
  }

  const weeklyReview = (selfReview.reports || []).find((report) => report.id === "weekly");
  if (weeklyReview?.proofRepairReview?.repairItems > 0) {
    frontier.push(
      blockadeItem({
        family: "review-narrative",
        id: "review.weekly-proof-repair",
        priority: "medium",
        score: weeklyReview.proofRepairReview.repairItems * 8,
        label: "Weekly review must keep proof repair pressure visible",
        action: weeklyReview.proofRepairReview.topRepairs[0]?.nextAction || "Review proof repair pressure before public claims.",
        evidence: weeklyReview.proofRepairReview.narrative,
        verificationCommand: "node server.js # then open /api/self-review/weekly",
      }),
    );
  }

  if (changeHistory.proofRepairNarrative?.current) {
    frontier.push(
      blockadeItem({
        family: "change-history",
        id: "change-history.proof-repair-narrative",
        priority: changeHistory.proofRepairNarrative.changedSincePrevious ? "medium" : "low",
        score: changeHistory.proofRepairNarrative.changedSincePrevious ? 74 : 52,
        label: "Change history should preserve proof-repair drift",
        action: "Record changes after proof repair metrics move.",
        evidence: changeHistory.proofRepairNarrative.current,
        verificationCommand: "npm run record:changes",
      }),
    );
  }

  if (!frontier.length && (artifactCatalog.counts?.screenshotGaps || 0) > 0) {
    frontier.push(
      blockadeItem({
        family: "artifact-gap-repair",
        id: "artifact-gap.screenshot-count",
        priority: "medium",
        score: 58,
        label: `${artifactCatalog.counts.screenshotGaps} screenshot gap(s) remain explicit`,
        action: "Route screenshot gaps into proof repair queue and graph lineage.",
        evidence: `${artifactCatalog.counts.screenshotGaps} screenshot gap(s).`,
        verificationCommand: "npm run audit:artifact-gaps && npm run repair:proof-gaps",
      }),
    );
  }

  return frontier
    .map((item) => ({ ...item, score: clamp(Math.round(item.score || 0), 0, 100) }))
    .sort((left, right) => priorityWeight(right.priority) - priorityWeight(left.priority) || right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 18);
}

function blockadeItem({ family, id, priority, score, label, action, evidence, verificationCommand }) {
  return {
    family,
    id,
    priority,
    score,
    label,
    action,
    evidence,
    verificationCommand,
  };
}

function trustBlockadeChecks({ frontier, routeManifest, refreshPlan, packageManifest }) {
  const families = new Set(frontier.map((item) => item.family));
  const scripts = packageManifest.scripts || {};
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  return [
    check(
      "frontier-depth",
      frontier.length >= 6 && frontier.every((item) => item.action && item.evidence && item.verificationCommand),
      "high",
      `${frontier.length} frontier item(s); ${frontier.filter((item) => item.verificationCommand).length} command-backed.`,
      "Keep at least six command-backed blockers on the trust frontier.",
      "npm run audit:trust-blockade",
    ),
    check(
      "family-coverage",
      ["weak-claims", "artifact-gap-repair", "graph-repair-paths", "opportunity-blockers", "review-narrative"].every((family) =>
        families.has(family),
      ),
      "high",
      `${families.size} blocker family/families: ${[...families].join(", ")}.`,
      "Wire weak claims, artifact gaps, graph repair, opportunities, and review narrative into the frontier.",
      "npm run audit:trust-blockade",
    ),
    check(
      "route-manifest",
      publicRoutes.includes(ENDPOINT) && publicRoutes.includes(`${ENDPOINT}/plan`) && publicRoutes.includes(`${ENDPOINT}/history`),
      "high",
      `${publicRoutes.filter((route) => route.startsWith(ENDPOINT)).length}/3 trust blockade route(s) declared.`,
      "Add trust blockade report, plan, and history routes to runtimeRouteManifest.",
      "npm run record:runtime-surface",
    ),
    check(
      "refresh-plan",
      refreshEndpoints.includes(ENDPOINT),
      "medium",
      `${ENDPOINT} ${refreshEndpoints.includes(ENDPOINT) ? "covered" : "missing"} in refresh plan.`,
      "Add trust blockade to safe evidence refresh.",
      "npm run refresh:evidence",
    ),
    check(
      "script-coverage",
      Boolean(scripts["audit:trust-blockade"]),
      "medium",
      `audit:trust-blockade=${Boolean(scripts["audit:trust-blockade"])}`,
      "Add the audit:trust-blockade package script.",
      "npm run audit:trust-blockade",
    ),
    check(
      "manual-boundary",
      frontier.every((item) => !/send outreach|submit application|contact recipient/i.test(`${item.action} ${item.evidence}`)),
      "high",
      "Frontier actions stay local/manual and avoid external-action claims.",
      "Keep trust blockers as local repair actions only.",
      "npm run audit:trust-blockade && npm run check",
    ),
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

function maxSeverity(items) {
  return items.some((item) => item.priority === "high") ? "high" : items.some((item) => item.priority === "medium") ? "medium" : "low";
}

function priorityWeight(priority) {
  return { high: 3, medium: 2, low: 1 }[priority] || 0;
}

function percent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function weightedScore(checks) {
  const weights = { high: 7, medium: 4, low: 2 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 5, 50));
}

module.exports = {
  appendTrustBlockadeReceipt,
  buildTrustBlockadeHistory,
  buildTrustBlockadeReport,
  buildTrustBlockadeReportFromReceipt,
  buildTrustBlockadeReportResponse,
  readTrustBlockadeReceipts,
  trustBlockadePlan,
};
