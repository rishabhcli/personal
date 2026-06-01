const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/artifact-gaps";
const RECEIPT_RELATIVE_PATH = path.join("var", "artifact-gap-receipts.json");
const maxReceipts = 50;

function artifactGapWorkbenchPlan() {
  return {
    mode: "artifact-gap-workbench-plan",
    command: "npm run audit:artifact-gaps",
    endpoint: ENDPOINT,
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server, reads public-safe artifact gap triage, writes a local receipt under var/, and does not capture screenshots, approve private material, inspect private files, publish media, contact third parties, or mutate external systems.",
  };
}

function buildArtifactGapWorkbench({ artifactCatalog, artifactReplays, narrativeTailor, routeManifest = {}, packageManifest = {}, receipts = [] }) {
  const gaps = (artifactCatalog.gaps || []).map((gap) =>
    gapItem({
      gap,
      artifacts: (artifactCatalog.artifacts || []).filter((artifact) => artifact.project === gap.project),
      replay: (artifactReplays.replays || []).find((replay) => replay.project === gap.project),
      narrativeTailor,
    }),
  );
  const rankedGaps = gaps.slice().sort((left, right) => right.priorityScore - left.priorityScore || left.projectTitle.localeCompare(right.projectTitle));
  const checks = workbenchChecks({ gaps: rankedGaps, artifactCatalog, artifactReplays, narrativeTailor, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "artifact-gap-workbench",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This workbench ranks explicit public-safe artifact gaps and their repair paths. It does not claim screenshots, videos, private files, live recordings, third-party uptime, or external proof exist until a served artifact with source trace is attached.",
    sideEffectBoundary: artifactGapWorkbenchPlan().sideEffectBoundary,
    plan: artifactGapWorkbenchPlan(),
    summary: {
      gaps: rankedGaps.length,
      projects: new Set(rankedGaps.map((gap) => gap.project)).size,
      screenshotGaps: rankedGaps.filter((gap) => gap.gapType === "screenshot").length,
      narrativeBlockingGaps: rankedGaps.filter((gap) => gap.narrativeBlockingAudiences.length > 0).length,
      highPriorityGaps: rankedGaps.filter((gap) => gap.priority === "high").length,
      closurePlans: rankedGaps.filter((gap) => gap.closureArtifactId).length,
      replayPaths: rankedGaps.filter((gap) => gap.replayId).length,
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      auditCoverageScore: weightedCheckScore(checks),
      latestReceiptId: latestReceipt?.id || null,
    },
    gapPolicy: {
      publicSafeRule: "A missing screenshot remains a gap record until the repo serves an approved artifact with source trace.",
      blockerRule: "Narrative blockers raise priority but do not authorize private material or fake media.",
      closureRule: "Gap closure plans are repair instructions and forbidden-claim guards, not proof that media already exists.",
    },
    gaps: rankedGaps,
    checks,
    repairQueue: rankedGaps.slice(0, 8).map((gap, index) => ({
      rank: index + 1,
      gapId: gap.id,
      priority: gap.priority,
      action: gap.nextAction,
      verificationCommand: gap.verificationCommand,
    })),
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nextAction: rankedGaps[0]?.nextAction || "Keep artifact gaps explicit until public-safe media is attached.",
    verificationCommand: "npm run audit:artifact-gaps && npm run check && npm run verify",
  };
}

function buildArtifactGapWorkbenchFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "artifact-gap-workbench-receipt" || !receipt.summary) return null;
  if (!Array.isArray(receipt.gaps)) return null;
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "info",
    detail: check.detail || `Cached artifact gap check from ${receipt.id}.`,
    repairAction: check.repairAction || (check.passed ? "No cached artifact gap repair needed." : "Refresh artifact gaps and repair the failing check."),
    verificationCommand: check.verificationCommand || "npm run audit:artifact-gaps",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "artifact-gap-workbench",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs the artifact gap workbench from the latest local receipt. It is a fast public-safe cached report, not new screenshot capture, private-file inspection, media publication, external proof, or third-party contact.",
    sideEffectBoundary: receipt.sideEffectBoundary || artifactGapWorkbenchPlan().sideEffectBoundary,
    plan: artifactGapWorkbenchPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    gapPolicy: receipt.gapPolicy || {
      publicSafeRule: "Cached gaps remain explicit repair records until public-safe served artifacts with source trace are attached.",
      blockerRule: "Cached narrative blockers raise priority but do not authorize private material or fake media.",
      closureRule: "Cached closure plans are repair instructions and forbidden-claim guards, not proof that media already exists.",
    },
    gaps: receipt.gaps,
    checks,
    repairQueue:
      receipt.repairQueue ||
      receipt.gaps.slice(0, 8).map((gap, index) => ({
        rank: index + 1,
        gapId: gap.id,
        priority: gap.priority,
        action: gap.nextAction,
        verificationCommand: gap.verificationCommand,
      })),
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
      passing: receipt.summary?.passing || 0,
      checks: receipt.summary?.checks || checks.length,
      gaps: receipt.summary?.gaps || receipt.gaps.length,
    },
    nextAction:
      receipt.gaps[0]?.nextAction ||
      failing[0]?.repairAction ||
      "Artifact gaps are served from the latest local receipt; run npm run audit:artifact-gaps or ?refresh=1 after artifact, replay, or narrative changes.",
    verificationCommand: "npm run audit:artifact-gaps && npm run check && npm run verify",
  };
}

function buildArtifactGapWorkbenchResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const totalGaps = (report.gaps || []).length;
  const totalRepairQueue = (report.repairQueue || []).length;
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      gapPayloadPolicy: artifactGapPayloadPolicy({
        fullDetail,
        gapsReturned: totalGaps,
        totalGaps,
        repairQueueReturned: totalRepairQueue,
        totalRepairQueue,
      }),
    };
  }

  const gapPreview = (report.gaps || []).slice(0, 4);
  const repairQueuePreview = (report.repairQueue || []).slice(0, 4);
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    detail: "summary",
    compact: true,
    refreshEndpoint: report.refreshEndpoint || `${ENDPOINT}?refresh=1`,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeArtifactGapSummary(report.summary),
    gaps: gapPreview.map(summarizeArtifactGapForIndex),
    checkSummary: {
      total: (report.checks || []).length,
      passing: (report.checks || []).filter((check) => check.passed).length,
      failing: (report.checks || []).filter((check) => !check.passed).length,
    },
    gapPayloadPolicy: artifactGapPayloadPolicy({
      fullDetail,
      gapsReturned: gapPreview.length,
      totalGaps,
      repairQueueReturned: repairQueuePreview.length,
      totalRepairQueue,
    }),
  };
}

function gapItem({ gap, artifacts, replay, narrativeTailor }) {
  const closureArtifact = artifacts.find((artifact) => artifact.artifactType === "gap-closure-plan");
  const narrativeMatches = narrativeMatchesFor({ gap, narrativeTailor });
  const dependencyChecks = [
    dependency("gap-record", true, gap.id, "Keep the explicit gap record visible."),
    dependency("gap-closure-plan", Boolean(closureArtifact), closureArtifact?.id || null, `Maintain ${gap.projectTitle} gap closure plan artifact.`),
    dependency("artifact-replay", Boolean(replay), replay?.id || null, `Maintain ${gap.projectTitle} artifact replay path.`),
    dependency(
      "forbidden-claim",
      Boolean(replay?.gapClosurePlan?.every((item) => item.forbiddenClaim)),
      replay?.id || null,
      "Every closure plan must forbid screenshot/video/private-file claims until served media exists.",
    ),
  ];
  const priorityScore = clamp(
    45 +
      narrativeMatches.length * 18 +
      (closureArtifact ? 8 : 0) +
      (replay ? 7 : 0) +
      (artifacts.some((artifact) => artifact.approvalRequired) ? 8 : 0),
    0,
    100,
  );
  const priority = priorityScore >= 80 ? "high" : priorityScore >= 60 ? "medium" : "low";

  return {
    id: gap.id,
    project: gap.project,
    projectTitle: gap.projectTitle,
    gapType: gap.gapType,
    label: gap.label,
    neededArtifact: gap.neededArtifact,
    sourceStatus: gap.sourceStatus,
    priority,
    priorityScore,
    narrativeBlockingAudiences: narrativeMatches.map((match) => match.audience),
    narrativeBlockers: narrativeMatches,
    closureArtifactId: closureArtifact?.id || null,
    replayId: replay?.id || null,
    replayStatus: replay?.status || null,
    dependencyChecks,
    acceptanceCriteria: [
      `Serve a public-safe ${gap.neededArtifact} artifact with source trace for ${gap.projectTitle}.`,
      "Keep raw private material blocked unless the privacy approval workflow explicitly changes projection.",
      "Rerun artifact gaps, artifact museum, narrative tailor, graph depth, runtime surface, and full verification after attaching media.",
    ],
    forbiddenClaims: [
      "Do not claim a screenshot exists while sourceStatus remains missing.",
      "Do not present generated previews, replays, transcripts, or gap closure plans as real screenshots.",
      "Do not expose private files or raw local captures as public artifacts without approval.",
    ],
    nextAction: gap.suggestedRepair,
    verificationCommand: `npm run audit:artifact-gaps && node server.js # then open /api/artifact-replays/${gap.project}`,
    publicSafe: true,
  };
}

function narrativeMatchesFor({ gap, narrativeTailor }) {
  const genericTitleTokens = new Set(["research", "project", "system", "platform", "tool", "app"]);
  const projectTokens = [
    gap.project,
    ...String(gap.projectTitle)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length > 4 && !genericTitleTokens.has(part)),
  ];
  return (narrativeTailor.audiences || [])
    .map((audience) => {
      const gate = audience.manualReadinessGate || {};
      const blockers = gate.blockers || [];
      const repairPlan = gate.repairPlan || [];
      const text = JSON.stringify({
        blockers,
        repairPlan,
        mustDisclose: gate.mustDisclose || [],
        nextAction: audience.nextAction,
      }).toLowerCase();
      const explicitProjectMatch = projectTokens.some((part) => text.includes(part));
      if (!explicitProjectMatch) return null;
      return {
        audience: audience.id,
        status: gate.status,
        localReviewReady: Boolean(gate.localReviewReady),
        externalUseReady: Boolean(gate.readyForManualExternalUse),
        blockerIds: blockers.filter((blocker) => /screenshot|artifact|proof|private/i.test(`${blocker.id} ${blocker.repairAction}`)).map((blocker) => blocker.id),
        topRepairAction: repairPlan[0]?.action || gate.blockers?.[0]?.repairAction || gap.suggestedRepair,
      };
    })
    .filter(Boolean);
}

function workbenchChecks({ gaps, artifactCatalog, artifactReplays, narrativeTailor, routeManifest, packageManifest }) {
  return [
    check("gap-inventory", gaps.length >= (artifactCatalog.counts?.projects || 0), "high", `${gaps.length} gap record(s) for ${artifactCatalog.counts?.projects || 0} project(s).`, "Keep one explicit screenshot gap per project until served media exists.", "npm run audit:artifact-gaps"),
    check("narrative-blocker-trace", gaps.some((gap) => gap.narrativeBlockingAudiences.length > 0), "high", `${gaps.filter((gap) => gap.narrativeBlockingAudiences.length > 0).length} gap(s) block tailored narrative readiness.`, "Trace screenshot gaps back to narrative tailor blockers.", "npm run tailor:narratives && npm run audit:artifact-gaps"),
    check("closure-plan-coverage", gaps.every((gap) => gap.closureArtifactId), "high", `${gaps.filter((gap) => gap.closureArtifactId).length}/${gaps.length} gap(s) have closure artifacts.`, "Create gap-closure-plan artifacts before treating gaps as repairable.", "npm run audit:artifact-museum"),
    check("replay-path-coverage", gaps.every((gap) => gap.replayId), "medium", `${gaps.filter((gap) => gap.replayId).length}/${gaps.length} gap(s) have replay paths.`, "Attach artifact replay paths to every gap.", "npm run check && node server.js # then open /api/artifact-replays"),
    check("forbidden-claim-guards", gaps.every((gap) => gap.forbiddenClaims.length >= 3 && gap.dependencyChecks.find((item) => item.id === "forbidden-claim")?.passed), "high", "Every gap carries forbidden screenshot/video/private-file claims.", "Keep forbidden-claim guards on gap closure plans.", "npm run audit:artifact-gaps"),
    check("local-review-link", (narrativeTailor.summary?.localReviewReady || 0) >= 1, "medium", `${narrativeTailor.summary?.localReviewReady || 0} local-review-ready tailored draft(s).`, "Keep artifact gap triage connected to local-review-ready narrative drafts.", "npm run tailor:narratives"),
    check("route-manifest", [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => (routeManifest.publicApiRoutes || []).includes(route)), "medium", `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => (routeManifest.publicApiRoutes || []).includes(route)).length}/3 artifact gap route(s) declared.`, "Declare artifact gap report, plan, and history routes.", "npm run record:runtime-surface"),
    check("package-script", Boolean(packageManifest.scripts?.["audit:artifact-gaps"]), "medium", `audit:artifact-gaps=${Boolean(packageManifest.scripts?.["audit:artifact-gaps"])}`, "Add the audit:artifact-gaps package script.", "npm run audit:artifact-gaps"),
  ];
}

function appendArtifactGapReceipt(root, receipt) {
  const receipts = readArtifactGapReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readArtifactGapReceipts(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function buildArtifactGapHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      generatedAt: new Date().toISOString(),
      mode: "artifact-gap-workbench-history",
      detail: "full",
      compact: false,
      sourceBoundary:
        "This endpoint returns full local artifact-gap receipts. It does not capture screenshots, approve private material, inspect private files, publish media, contact third parties, or mutate external systems.",
      sideEffectBoundary:
        "The history endpoint reads local artifact-gap receipts only. It does not capture screenshots, approve private material, inspect private files, publish media, contact third parties, or mutate external systems.",
      receiptStore: RECEIPT_RELATIVE_PATH,
      fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
      summary: artifactGapHistorySummary({ limited, totalAvailable, boundedLimit, latest, includeCheckedAt: true }),
      definitions: summarizeArtifactGapDefinitions(latest, { fullDetail: true }),
      receipts: limited,
      historyPayloadPolicy: artifactGapHistoryPayloadPolicy({ fullDetail, limited, totalAvailable, boundedLimit }),
      nextAction: limited[0]
        ? "Artifact gap history is available; run npm run audit:artifact-gaps after artifact catalog, replay, narrative, route, or package-script changes."
        : "Run npm run audit:artifact-gaps to create artifact gap history.",
      verificationCommand: "npm run audit:artifact-gaps && node --test test/api-contract.test.mjs",
    };
  }
  return {
    mode: "artifact-gap-workbench-history",
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    summary: artifactGapHistorySummary({ limited, totalAvailable, boundedLimit, latest, includeLatestCounters: false }),
    definitions: summarizeArtifactGapDefinitions(latest, { fullDetail: false }),
    receipts: limited.map((receipt, index) => summarizeArtifactGapReceipt(receipt, { includePreviews: index === 0 })),
    historyPayloadPolicy: artifactGapHistoryPayloadPolicy({ fullDetail, limited, totalAvailable, boundedLimit }),
  };
}

function artifactGapHistorySummary({ limited, totalAvailable, boundedLimit, latest, includeCheckedAt = false, includeLatestCounters = true }) {
  return {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
    ...(includeLatestCounters
      ? {
          latestGaps: latest?.summary?.gaps || 0,
          latestNarrativeBlockingGaps: latest?.summary?.narrativeBlockingGaps || 0,
          latestHighPriorityGaps: latest?.summary?.highPriorityGaps || 0,
          latestAuditCoverageScore: latest?.summary?.auditCoverageScore || 0,
        }
      : {}),
    ...(includeCheckedAt ? { latestCheckedAt: latest?.checkedAt || null } : {}),
  };
}

function summarizeArtifactGapDefinitions(receipt, { fullDetail = false } = {}) {
  const checks = receipt?.checks || [];
  if (!fullDetail) {
    return {
      checks: {
        total: checks.length,
        verificationCommandCount: checks.filter((check) => Boolean(check.verificationCommand)).length,
        sentinelIds: checks.slice(0, 2).map((check) => check.id),
      },
    };
  }
  return {
    plan: artifactGapWorkbenchPlan(),
    evidenceAccess: {
      fullReportEndpoint: ENDPOINT,
      refreshEndpoint: `${ENDPOINT}?refresh=1`,
      receiptStore: RECEIPT_RELATIVE_PATH,
      fullHistoryEndpoint: `${ENDPOINT}/history?detail=full`,
    },
    gapPolicy: fullDetail ? receipt?.gapPolicy || {} : summarizeArtifactGapPolicy(receipt?.gapPolicy),
    checks: checks.map((check) => ({
      id: check.id,
      severity: check.severity,
      ...(fullDetail ? { verificationCommand: check.verificationCommand } : { verificationCommandAvailable: Boolean(check.verificationCommand) }),
    })),
  };
}

function artifactGapHistoryPayloadPolicy({ fullDetail, limited, totalAvailable, boundedLimit }) {
  if (!fullDetail) {
    return {
      fullDetail,
      receiptsReturned: limited.length,
      olderReceiptPreview: "trend-summary-only",
    };
  }
  return {
    fullDetail,
    compact: !fullDetail,
    receiptsReturned: limited.length,
    totalAvailable,
    limit: boundedLimit,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    previewLimits: fullDetail
      ? null
      : {
          latestTopGaps: 3,
          latestRepairQueue: 3,
          olderReceipts: "summary-only",
        },
  };
}

function summarizeArtifactGapPolicy(policy = {}) {
  return {
    publicSafeRuleAvailable: Boolean(policy.publicSafeRule),
    blockerRuleAvailable: Boolean(policy.blockerRule),
    closureRuleAvailable: Boolean(policy.closureRule),
  };
}

function summarizeArtifactGapReceipt(receipt, { includePreviews = true } = {}) {
  const gaps = receipt.gaps || [];
  const checks = receipt.checks || [];
  const summary = summarizeArtifactGapHistoryReceiptSummary(receipt.summary);
  const compact = {
    id: receipt.id,
    summary,
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    },
    repairQueueCount: (receipt.repairQueue || []).length,
    repairActionCount: (receipt.repairActions || []).length,
  };
  if (!includePreviews) {
    return {
      id: receipt.id,
      trendOnly: true,
      gaps: summary.gaps,
      narrativeBlockingGaps: summary.narrativeBlockingGaps,
      highPriorityGaps: summary.highPriorityGaps,
      auditCoverageScore: summary.auditCoverageScore,
      failing: summary.failing,
    };
  }
  return {
    ...compact,
    topGaps: (receipt.topGaps?.length ? receipt.topGaps : gaps).slice(0, 2).map((gap) => ({
      id: gap.id,
      priority: gap.priority,
      narrativeBlockingAudienceCount: (gap.narrativeBlockingAudiences || []).length,
    })),
  };
}

function summarizeArtifactGapForIndex(gap) {
  return {
    id: gap.id,
    priority: gap.priority,
    narrativeBlockingAudienceCount: (gap.narrativeBlockingAudiences || []).length,
    acceptanceCriteriaCount: (gap.acceptanceCriteria || []).length,
    forbiddenClaimCount: (gap.forbiddenClaims || []).length,
  };
}

function artifactGapPayloadPolicy({ fullDetail, gapsReturned, totalGaps, repairQueueReturned, totalRepairQueue }) {
  return {
    fullDetail,
    gapsReturned,
    repairQueueReturned,
  };
}

function summarizeArtifactGapHistoryReceiptSummary(summary = {}) {
  return {
    gaps: summary.gaps || 0,
    narrativeBlockingGaps: summary.narrativeBlockingGaps || 0,
    highPriorityGaps: summary.highPriorityGaps || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
  };
}

function summarizeArtifactGapSummary(summary = {}) {
  return {
    gaps: summary.gaps || 0,
    narrativeBlockingGaps: summary.narrativeBlockingGaps || 0,
    highPriorityGaps: summary.highPriorityGaps || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, 100));
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function dependency(id, passed, evidenceId, repairAction) {
  return { id, passed: Boolean(passed), evidenceId, repairAction };
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
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  artifactGapWorkbenchPlan,
  appendArtifactGapReceipt,
  buildArtifactGapHistory,
  buildArtifactGapWorkbenchResponse,
  buildArtifactGapWorkbenchFromReceipt,
  buildArtifactGapWorkbench,
  readArtifactGapReceipts,
};
