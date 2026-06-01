const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/graph-depth-score";
const STORE_RELATIVE_PATH = path.join("var", "graph-depth-score-receipts.json");
const maxReceipts = 50;
const COMPACT_LANE_PREVIEW_IDS = ["normalization-horizon", "manual-narrative-gate-depth", "artifact-gap-repair-depth"];
const COMPACT_DEPTH_PREVIEW_IDS = ["narrative-gate-to-repair", "artifact-gap-to-opportunity-repair"];
const COMPACT_CHECK_PREVIEW_IDS = [
  "manual-narrative-gates",
  "artifact-gap-repair-graph-depth",
  "depth-summary-cards",
  "normalization-repair-visible",
];

function graphDepthScorePlan() {
  return {
    mode: "evidence-graph-depth-score-plan",
    command: "npm run audit:graph-depth",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing graph quality, graph scoreboard, lineage, disclosure links, confidence guards, narrative sequencing, route manifests, or refresh coverage.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe graph depth endpoints, writes a local receipt under var/, and does not publish, deploy, enable private data, contact third parties, collect analytics, mutate graph storage, or infer external outcomes.",
  };
}

function buildGraphDepthScoreReport({
  graphQuality,
  graphScoreboard,
  graphLineage,
  graphDisclosureLinks,
  graphConfidence,
  narrativeTailor = {},
  narrativeSequence,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const lanes = depthLanes({ graphQuality, graphScoreboard, graphLineage, graphDisclosureLinks, graphConfidence, narrativeTailor, narrativeSequence });
  const depthMap = buildDepthMap({ graphScoreboard, graphLineage, graphDisclosureLinks, graphConfidence, narrativeTailor, narrativeSequence });
  const depthSummaries = buildDepthSummaries({ lanes, depthMap, narrativeTailor });
  const checks = reportChecks({
    lanes,
    depthSummaries,
    graphQuality,
    graphScoreboard,
    graphLineage,
    graphDisclosureLinks,
    graphConfidence,
    narrativeTailor,
    narrativeSequence,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore([
    ...lanes.map((lane) => ({ score: lane.score, weight: lane.weight })),
    ...checks.map((check) => ({ score: check.passed ? 100 : 0, weight: check.severity === "high" ? 1.35 : 1 })),
  ]);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-graph-depth-score",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report scores the depth of local public-safe graph evidence across structure, normalized coverage, narrative objection lineage, disclosure relationship projection, confidence policy, and narrative sequence bridges. It does not claim production graph persistence, private graph storage, external validation, audience outcomes, or complete real-world relationship coverage.",
    sideEffectBoundary:
      "This endpoint reads public-safe in-memory graph reports and local receipt history only. It does not publish, deploy, mutate graph storage, enable private routes, contact third parties, send messages, or collect analytics.",
    plan: graphDepthScorePlan(),
    depthPolicy: graphDepthPolicy(),
    summary: {
      score,
      band: bandFor(score),
      lanes: lanes.length,
      passingLanes: lanes.filter((lane) => lane.passed).length,
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      renderedNodes: graphScoreboard.summary?.renderedNodes || graphQuality.summary?.nodes || 0,
      renderedEdges: graphScoreboard.summary?.renderedEdges || graphQuality.summary?.edges || 0,
      lineagePaths: graphLineage.summary?.lineagePaths || 0,
      artifactGapRepairPaths: graphLineage.summary?.artifactGapRepairPaths || 0,
      graphResolvedArtifactGapRepairPaths: graphLineage.summary?.graphResolvedArtifactGapRepairPaths || 0,
      disclosureRelationships: graphDisclosureLinks.summary?.relationships || 0,
      confidenceRelationships: graphConfidence.summary?.relationships || 0,
      manualNarrativeReadinessScore: narrativeTailor.summary?.averageManualReadinessScore || 0,
      manualNarrativeLocalReviewScore: narrativeTailor.summary?.averageLocalReviewReadinessScore || 0,
      manualNarrativeLocalReviewReady: narrativeTailor.summary?.localReviewReady || 0,
      manualNarrativeReady: narrativeTailor.summary?.manualReadinessReady || 0,
      manualNarrativeRestricted: narrativeTailor.summary?.manualReadinessRestricted || 0,
      manualNarrativeBlocked: narrativeTailor.summary?.manualReadinessBlocked || 0,
      manualNarrativeRepairItems: narrativeTailor.summary?.manualRepairPlanItems || 0,
      narrativeSequenceBeats: narrativeSequence.summary?.totalBeats || 0,
      normalizationScore: graphScoreboard.summary?.score || 0,
      routeCovered: requiredRoutes().every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      latestReceiptId: latestReceipt?.id || null,
    },
    lanes,
    depthMap,
    depthSummaries,
    checks,
    repairActions: [
      ...failing.map((check) => ({
        id: check.id,
        priority: check.severity,
        action: check.repairAction,
        verificationCommand: check.verificationCommand,
      })),
      ...((graphScoreboard.repairActions || []).slice(0, 6).map((action, index) => ({
        id: `scoreboard-repair-${index + 1}`,
        priority: action.severity || "medium",
        action: action.action || action.detail || String(action),
        verificationCommand: action.verificationCommand || "npm run check && node server.js # then open /api/graph-scoreboard",
      }))),
    ],
    nonClaims: graphDepthNonClaims(),
    nextAction:
      failing[0]?.repairAction ||
      (graphScoreboard.repairActions || [])[0]?.action ||
      "Graph depth is scored across public-safe evidence lanes; rerun after graph, narrative, claim, artifact, route, or refresh changes.",
    verificationCommand: "npm run audit:graph-depth && npm run check && npm run verify",
  };
}

function buildGraphDepthScoreReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-graph-depth-score-receipt" || !receipt.summary) return null;
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || "Cached graph depth receipt check.",
    repairAction: check.passed ? "No cached graph depth repair needed." : "Refresh graph depth and repair the failing cached check.",
    verificationCommand: "npm run audit:graph-depth",
  }));
  const lanes = (receipt.lanes || []).map((lane) => ({
    id: lane.id,
    label: titleize(lane.id),
    score: lane.score || 0,
    band: lane.band || bandFor(lane.score || 0),
    weight: 1,
    passed: Boolean(lane.passed),
    evidence: `Cached graph depth receipt lane ${lane.id} scored ${lane.score || 0}/100.`,
    repairAction: lane.passed ? "No cached lane repair needed." : "Refresh graph depth and inspect the failing lane.",
    verificationCommand: "npm run audit:graph-depth",
  }));
  const depthSummaries = (receipt.depthSummaries || []).map((summary) => ({
    id: summary.id,
    pathShape: "cached graph depth path",
    depth: 0,
    score: summary.score || 0,
    status: summary.status || "cached",
    evidenceCount: summary.evidenceCount || 0,
    summary: `Cached graph depth path ${summary.id} retained ${summary.evidenceCount || 0} evidence signal(s) at ${summary.score || 0}/100.`,
    linkedLane: null,
    repairAction: "Run npm run audit:graph-depth to refresh the full graph depth path summary.",
    verificationCommand: "npm run audit:graph-depth",
  }));

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "evidence-graph-depth-score",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs graph depth from the latest local receipt. It is a fast public-safe cached report, not a live recomputation, production graph proof, hosted deploy proof, or external validation.",
    sideEffectBoundary: receipt.sideEffectBoundary || graphDepthScorePlan().sideEffectBoundary,
    plan: graphDepthScorePlan(),
    depthPolicy: graphDepthPolicy(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    lanes,
    depthMap: depthSummaries.map((summary) => ({
      id: summary.id,
      pathShape: summary.pathShape,
      depth: summary.depth,
      evidenceCount: summary.evidenceCount,
      score: summary.score,
      repairAction: summary.repairAction,
    })),
    depthSummaries,
    checks,
    repairActions: checks
      .filter((check) => !check.passed)
      .map((check) => ({
        id: check.id,
        priority: check.severity,
        action: check.repairAction,
        verificationCommand: check.verificationCommand,
      })),
    nonClaims: graphDepthNonClaims(),
    nextAction: checks.some((check) => !check.passed)
      ? "Refresh graph depth and repair the first failing cached check."
      : "Graph depth is served from the latest local receipt; use npm run audit:graph-depth or ?refresh=1 after graph, narrative, claim, artifact, route, or refresh changes.",
    verificationCommand: "npm run audit:graph-depth && npm run check && npm run verify",
  };
}

function buildGraphDepthScoreResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      graphDepthPayloadPolicy: graphDepthPayloadPolicy({ report, fullDetail }),
    };
  }

  const lanePreview = selectPreviewById(report.lanes || [], COMPACT_LANE_PREVIEW_IDS, COMPACT_LANE_PREVIEW_IDS.length);
  const depthSummaryPreview = selectPreviewById(report.depthSummaries || [], COMPACT_DEPTH_PREVIEW_IDS, COMPACT_DEPTH_PREVIEW_IDS.length);
  const checkPreview = selectPreviewById(report.checks || [], COMPACT_CHECK_PREVIEW_IDS, COMPACT_CHECK_PREVIEW_IDS.length);

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    refreshEndpoint: report.refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: report.summary,
    lanes: lanePreview.map(summarizeGraphDepthLane),
    depthSummaries: depthSummaryPreview.map(summarizeGraphDepthSummary),
    checks: checkPreview.map(summarizeGraphDepthCheck),
    ...((report.repairActions || []).length
      ? {
          repairActions: (report.repairActions || []).slice(0, 3).map((action) => ({
            id: action.id,
            priority: action.priority,
            verificationCommandAvailable: Boolean(action.verificationCommand),
          })),
        }
      : {}),
    nonClaimCount: (report.nonClaims || []).length,
    nonClaimsAvailable: (report.nonClaims || []).length > 0,
    graphDepthPayloadPolicy: graphDepthPayloadPolicy({
      report,
      fullDetail,
      returned: {
        lanes: lanePreview.length,
        depthSummaries: depthSummaryPreview.length,
        checks: checkPreview.length,
      },
    }),
  };
}

function summarizeGraphDepthLane(lane) {
  return {
    id: lane.id,
    passed: lane.passed,
  };
}

function summarizeGraphDepthSummary(summary) {
  return {
    id: summary.id,
    score: summary.score,
  };
}

function summarizeGraphDepthCheck(check) {
  return {
    id: check.id,
    passed: check.passed,
  };
}

function graphDepthPayloadPolicy({ report, fullDetail, returned = {} }) {
  if (!fullDetail) {
    return {
      fullDetail,
      lanesReturned: returned.lanes || 0,
      depthSummariesReturned: returned.depthSummaries || 0,
      checksReturned: returned.checks || 0,
      totalLanes: report.lanes?.length || 0,
      totalChecks: report.checks?.length || 0,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail,
    compact: !fullDetail,
    lanesReturned: report.lanes?.length || 0,
    depthPathsReturned: report.depthMap?.length || 0,
    depthSummariesReturned: report.depthSummaries?.length || 0,
    checksReturned: report.checks?.length || 0,
    repairActionsAvailable: report.repairActions?.length || 0,
    repairActionsReturned: fullDetail ? report.repairActions?.length || 0 : Math.min(report.repairActions?.length || 0, 6),
    nonClaimsAvailable: report.nonClaims?.length || 0,
    nonClaimsReturned: fullDetail ? report.nonClaims?.length || 0 : 0,
    compactOmissionCount: fullDetail ? 0 : 6,
    compactShape: fullDetail ? "full graph-depth report" : "ids-scores-counts-and-state",
  };
}

function selectPreviewById(items, preferredIds, limit) {
  const selected = [];
  const seen = new Set();
  const add = (item) => {
    if (!item || seen.has(item.id)) return;
    selected.push(item);
    seen.add(item.id);
  };
  for (const id of preferredIds) add(items.find((item) => item.id === id));
  for (const item of items) {
    if (selected.length >= limit) break;
    add(item);
  }
  return selected.slice(0, limit);
}

function appendGraphDepthScoreReceipt(root, receipt) {
  const receipts = readGraphDepthScoreReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readGraphDepthScoreReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readGraphDepthScoreHistoryWindow(root, { limit = 5 } = {}) {
  const receipts = readGraphDepthScoreReceipts(root);
  const boundedLimit = boundedHistoryLimit(limit);
  return {
    receipts: receipts.slice(0, boundedLimit),
    totalAvailable: receipts.length,
  };
}

function buildGraphDepthScoreHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "evidence-graph-depth-score-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail ? { sourceBoundary: "Full local graph-depth-score receipts." } : { sourceBoundaryAvailable: true }),
    sideEffectBoundaryAvailable: true,
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
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      latestScore: latest?.summary?.score || 0,
      latestLanes: latest?.summary?.lanes || 0,
      latestChecks: latest?.summary?.checks || 0,
    },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeGraphDepthScoreReceipt(receipt, { includePreview: index === 0 })),
    nextActionAvailable: true,
    verificationCommandAvailable: true,
  };
}

function summarizeGraphDepthScoreReceipt(receipt, { includePreview = true } = {}) {
  const lanes = receipt.lanes || [];
  const depthSummaries = receipt.depthSummaries || [];
  const checks = receipt.checks || [];
  const compact = {
    id: receipt.id,
    summary: includePreview ? summarizeGraphDepthReceiptSummary(receipt.summary) : summarizeGraphDepthTrendSummary(receipt.summary),
    laneSummary: summarizeGraphDepthLaneSet(lanes, receipt.summary),
    depthSummary: summarizeGraphDepthSummarySet(depthSummaries, receipt.summary),
    checkSummary: summarizeGraphDepthCheckSet(checks, receipt.summary),
  };
  if (!includePreview) {
    return {
      id: compact.id,
      summary: compact.summary,
      depthSummary: {
        total: compact.depthSummary.total,
      },
      latestReceiptPreviewOnly: true,
    };
  }
  return {
    ...compact,
    lanePreview: selectPreviewById(lanes, COMPACT_LANE_PREVIEW_IDS, 3).map(({ id, score, passed }) => ({ id, score, passed })),
    depthSummaryPreview: selectPreviewById(depthSummaries, COMPACT_DEPTH_PREVIEW_IDS, 2).map(({ id, score }) => ({
      id,
      score,
    })),
    failingCheckPreview: checks.filter((check) => !check.passed).slice(0, 6).map(({ id, passed, severity }) => ({
      id,
      passed,
      severity,
    })),
  };
}

function summarizeGraphDepthTrendSummary(summary = {}) {
  return {
    score: summary.score || 0,
    failing: summary.failing || 0,
    artifactGapRepairPaths: summary.artifactGapRepairPaths || 0,
  };
}

function summarizeGraphDepthLaneSet(lanes, summary = {}) {
  return {
    total: summary.lanes || lanes.length,
    passing: summary.passingLanes || lanes.filter((lane) => lane.passed).length,
    failing: Math.max(0, (summary.lanes || lanes.length) - (summary.passingLanes || lanes.filter((lane) => lane.passed).length)),
  };
}

function summarizeGraphDepthSummarySet(depthSummaries, summary = {}) {
  return {
    total: depthSummaries.length,
    artifactGapRepairPaths: summary.artifactGapRepairPaths || 0,
    lowScoreCount: depthSummaries.filter((item) => (item.score || 0) < 90).length,
  };
}

function summarizeGraphDepthCheckSet(checks, summary = {}) {
  return {
    total: summary.checks || checks.length,
    passed: summary.passing || checks.filter((check) => check.passed).length,
    failed: checks.filter((check) => !check.passed).map((check) => check.id),
  };
}

function summarizeGraphDepthReceiptSummary(summary = {}) {
  return {
    score: summary.score || 0,
    lanes: summary.lanes || 0,
    checks: summary.checks || 0,
    failing: summary.failing || 0,
    artifactGapRepairPaths: summary.artifactGapRepairPaths || 0,
    normalizationScore: summary.normalizationScore || 0,
  };
}

function depthLanes({ graphQuality, graphScoreboard, graphLineage, graphDisclosureLinks, graphConfidence, narrativeTailor, narrativeSequence }) {
  const manualGateCoverage =
    (narrativeTailor.summary?.manualReadinessReady || 0) +
    (narrativeTailor.summary?.manualReadinessRestricted || 0) +
    (narrativeTailor.summary?.manualReadinessBlocked || 0);
  const manualGateScore = average([
    narrativeTailor.summary?.averageManualReadinessScore || 0,
    narrativeTailor.summary?.averageLocalReviewReadinessScore || 0,
    percent(manualGateCoverage, narrativeTailor.summary?.audiences || 0),
    (narrativeTailor.summary?.manualRepairPlanItems || 0) >= (narrativeTailor.summary?.audiences || 0) ? 100 : 0,
    (narrativeTailor.summary?.localReviewReady || 0) === (narrativeTailor.summary?.audiences || -1) ? 100 : 0,
    (narrativeTailor.summary?.manualReadinessBlocked || 0) > 0 ? 100 : 85,
  ]);
  return [
    lane({
      id: "structural-spine",
      label: "Structural graph spine",
      score: percent(graphQuality.summary?.passing || 0, graphQuality.summary?.checks || 0),
      weight: 1.2,
      passed: (graphQuality.summary?.failing || 0) === 0,
      evidence: `${graphQuality.summary?.nodes || 0} node(s), ${graphQuality.summary?.edges || 0} edge(s), ${graphQuality.summary?.passing || 0}/${graphQuality.summary?.checks || 0} quality check(s).`,
      repairAction: "Repair dangling, duplicate, or unexplained graph nodes/edges before trusting graph depth.",
      verificationCommand: "npm run check && node server.js # then open /api/graph-quality",
    }),
    lane({
      id: "normalization-horizon",
      label: "Normalization and repair horizon",
      score: graphScoreboard.summary?.score || 0,
      weight: 0.95,
      passed:
        (graphScoreboard.summary?.modeledEntityTypes || 0) >= 18 &&
        (graphScoreboard.summary?.crosslinksCanonicalCovered || 0) === (graphScoreboard.summary?.crosslinks || -1) &&
        (graphScoreboard.summary?.repairActions || 0) >= 6,
      evidence: `score=${graphScoreboard.summary?.score || 0}/100; ${graphScoreboard.summary?.renderedEntityReferences || 0}/${graphScoreboard.summary?.modeledEntities || 0} rendered references; ${graphScoreboard.summary?.repairActions || 0} repair action(s).`,
      repairAction: "Use graph-scoreboard repair actions to promote high-value hidden entities without pretending coverage is complete.",
      verificationCommand: "npm run check && node server.js # then open /api/graph-scoreboard",
    }),
    lane({
      id: "objection-lineage-depth",
      label: "Narrative objection lineage depth",
      score: graphLineage.summary?.score || 0,
      weight: 1.1,
      passed:
        (graphLineage.summary?.failing || 0) === 0 &&
        (graphLineage.summary?.lineagePaths || 0) >= 100 &&
        (graphLineage.summary?.crosslinkResolvedPaths || 0) === (graphLineage.summary?.lineagePaths || -1),
      evidence: `${graphLineage.summary?.lineagePaths || 0} lineage path(s); ${graphLineage.summary?.graphResolvedPaths || 0} graph-resolved; ${graphLineage.summary?.crosslinkResolvedPaths || 0} crosslink-resolved.`,
      repairAction: "Repair unresolved narrative objection paths before promoting objection evidence as graph depth.",
      verificationCommand: "npm run check && node server.js # then open /api/graph-lineage",
    }),
    lane({
      id: "disclosure-relationship-depth",
      label: "Disclosure relationship depth",
      score: graphDisclosureLinks.summary?.score || 0,
      weight: 1.05,
      passed:
        (graphDisclosureLinks.summary?.failing || 0) === 0 &&
        (graphDisclosureLinks.summary?.relationships || 0) >= 100 &&
        (graphDisclosureLinks.summary?.relationshipTypes || 0) >= 5 &&
        graphDisclosureLinks.summary?.confidenceCapped === true,
      evidence: `${graphDisclosureLinks.summary?.relationships || 0} disclosure relationship(s), ${graphDisclosureLinks.summary?.relationshipTypes || 0} type(s), confidence capped=${Boolean(graphDisclosureLinks.summary?.confidenceCapped)}.`,
      repairAction: "Regenerate disclosure graph links until narratives, claims, artifacts, objections, and repair guidance are all represented.",
      verificationCommand: "npm run audit:graph-disclosures",
    }),
    lane({
      id: "confidence-policy-depth",
      label: "Confidence policy depth",
      score: graphConfidence.summary?.score || 0,
      weight: 1,
      passed:
        (graphConfidence.summary?.failing || 0) === 0 &&
        (graphConfidence.summary?.families || 0) >= 3 &&
        (graphConfidence.summary?.relationships || 0) >= 500 &&
        (graphConfidence.summary?.cappedRelationships || 0) === (graphConfidence.summary?.relationships || -1),
      evidence: `${graphConfidence.summary?.relationships || 0} confidence relationship(s), ${graphConfidence.summary?.families || 0} family/families, ${graphConfidence.summary?.cappedRelationships || 0} capped.`,
      repairAction: "Keep graph confidence caps and public-safe explanations attached to every relationship family.",
      verificationCommand: "npm run audit:graph-confidence",
    }),
    lane({
      id: "narrative-sequence-bridge",
      label: "Narrative sequence bridge",
      score: narrativeSequence.summary?.score || 0,
      weight: 0.9,
      passed:
        (narrativeSequence.summary?.failing || 0) === 0 &&
        (narrativeSequence.summary?.audiences || 0) >= 3 &&
        (narrativeSequence.summary?.totalBeats || 0) >= 21,
      evidence: `${narrativeSequence.summary?.audiences || 0} audience sequence(s), ${narrativeSequence.summary?.totalBeats || 0} beat(s), ${narrativeSequence.summary?.averageSequenceScore || 0}/100 average sequence score.`,
      repairAction: "Keep narrative sequence beats attached to graph-inspectable evidence, disclosures, and manual gates.",
      verificationCommand: "npm run sequence:narratives",
    }),
    lane({
      id: "manual-narrative-gate-depth",
      label: "Manual narrative gate depth",
      score: manualGateScore,
      weight: 0.95,
      passed:
        (narrativeTailor.summary?.audiences || 0) >= 3 &&
        manualGateCoverage === (narrativeTailor.summary?.audiences || -1) &&
        (narrativeTailor.summary?.manualRepairPlanItems || 0) >= (narrativeTailor.summary?.audiences || 0),
      evidence: `${manualGateCoverage}/${narrativeTailor.summary?.audiences || 0} audience gate(s); external readiness ${narrativeTailor.summary?.averageManualReadinessScore || 0}/100; local review ${narrativeTailor.summary?.averageLocalReviewReadinessScore || 0}/100; blocked ${narrativeTailor.summary?.manualReadinessBlocked || 0}; ${narrativeTailor.summary?.manualRepairPlanItems || 0} repair item(s).`,
      repairAction: narrativeTailor.nextAction || "Keep tailored narrative manual gates attached to blockers and repair plans.",
      verificationCommand: "npm run tailor:narratives",
    }),
    lane({
      id: "artifact-gap-repair-depth",
      label: "Artifact gap repair graph depth",
      score: average([
        percent(graphLineage.summary?.graphResolvedArtifactGapRepairPaths || 0, graphLineage.summary?.artifactGapRepairPaths || 0),
        (graphLineage.summary?.artifactGapRepairNodes || 0) > 0 ? 100 : 0,
        (graphLineage.summary?.artifactGapRepairPaths || 0) >= 6 ? 100 : 70,
      ]),
      weight: 0.9,
      passed:
        (graphLineage.summary?.artifactGapRepairNodes || 0) > 0 &&
        (graphLineage.summary?.artifactGapRepairPaths || 0) > 0 &&
        (graphLineage.summary?.graphResolvedArtifactGapRepairPaths || 0) === (graphLineage.summary?.artifactGapRepairPaths || -1),
      evidence: `${graphLineage.summary?.artifactGapRepairNodes || 0} artifact gap repair node(s); ${graphLineage.summary?.graphResolvedArtifactGapRepairPaths || 0}/${graphLineage.summary?.artifactGapRepairPaths || 0} graph-resolved repair path(s).`,
      repairAction: "Keep screenshot/proof repair pressure represented as graph-visible gap repair nodes and opportunity unlock edges.",
      verificationCommand: "npm run audit:graph-lineage && npm run audit:graph-depth",
    }),
  ];
}

function buildDepthMap({ graphScoreboard, graphLineage, graphDisclosureLinks, graphConfidence, narrativeTailor, narrativeSequence }) {
  return [
    {
      id: "identity-to-proof",
      pathShape: "identity -> project -> claim/artifact",
      depth: 3,
      evidenceCount: graphScoreboard.summary?.renderedEntityReferences || 0,
      score: graphScoreboard.summary?.score || 0,
      repairAction: (graphScoreboard.repairActions || [])[0]?.action || "Promote high-value hidden claims and artifacts into rendered graph paths.",
    },
    {
      id: "narrative-to-objection",
      pathShape: "narrative -> objection -> claim/artifact/project",
      depth: 4,
      evidenceCount: graphLineage.summary?.lineagePaths || 0,
      score: graphLineage.summary?.score || 0,
      repairAction: graphLineage.nextAction || "Keep objection lineage resolved.",
    },
    {
      id: "disclosure-to-repair",
      pathShape: "disclosure -> claim/artifact/objection -> repair guidance",
      depth: 5,
      evidenceCount: graphDisclosureLinks.summary?.relationships || 0,
      score: graphDisclosureLinks.summary?.score || 0,
      repairAction: graphDisclosureLinks.nextAction || "Keep disclosure relationships confidence-capped.",
    },
    {
      id: "confidence-to-sequence",
      pathShape: "confidence policy -> narrative sequence -> manual action gate",
      depth: 6,
      evidenceCount: (graphConfidence.summary?.relationships || 0) + (narrativeSequence.summary?.totalBeats || 0),
      score: average([graphConfidence.summary?.score || 0, narrativeSequence.summary?.score || 0]),
      repairAction: narrativeSequence.nextAction || "Keep confidence caps and sequence gates in sync.",
    },
    {
      id: "narrative-gate-to-repair",
      pathShape: "narrative -> tailored draft -> manual readiness gate -> blocker -> repair",
      depth: 7,
      evidenceCount: narrativeTailor.summary?.manualRepairPlanItems || 0,
      score: average([
        narrativeTailor.summary?.averageManualReadinessScore || 0,
        narrativeTailor.summary?.averageLocalReviewReadinessScore || 0,
        (narrativeTailor.summary?.manualRepairPlanItems || 0) >= (narrativeTailor.summary?.audiences || 0) ? 100 : 0,
      ]),
      repairAction: narrativeTailor.nextAction || "Keep manual narrative gates repair-backed.",
    },
    {
      id: "artifact-gap-to-opportunity-repair",
      pathShape: "screenshot gap -> artifact gap repair -> opportunity proof",
      depth: 6,
      evidenceCount: graphLineage.summary?.artifactGapRepairPaths || 0,
      score: average([
        percent(graphLineage.summary?.graphResolvedArtifactGapRepairPaths || 0, graphLineage.summary?.artifactGapRepairPaths || 0),
        (graphLineage.summary?.artifactGapRepairNodes || 0) > 0 ? 100 : 0,
      ]),
      repairAction: graphLineage.artifactGapRepairLineage?.nextAction || "Keep artifact gap repair paths graph-resolved.",
    },
  ];
}

function buildDepthSummaries({ lanes, depthMap, narrativeTailor }) {
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  return depthMap.map((path) => {
    const lane = laneById.get(summaryLaneId(path.id));
    return {
      id: path.id,
      pathShape: path.pathShape,
      depth: path.depth,
      score: path.score,
      status: path.score >= 85 ? "strong" : path.score >= 65 ? "inspectable-with-repair" : "blocked-or-thin",
      evidenceCount: path.evidenceCount,
      summary: summaryTextFor(path, narrativeTailor),
      linkedLane: lane?.id || null,
      repairAction: path.repairAction,
      verificationCommand: lane?.verificationCommand || "npm run audit:graph-depth",
    };
  });
}

function summaryLaneId(pathId) {
  return {
    "identity-to-proof": "normalization-horizon",
    "narrative-to-objection": "objection-lineage-depth",
    "disclosure-to-repair": "disclosure-relationship-depth",
    "confidence-to-sequence": "confidence-policy-depth",
    "narrative-gate-to-repair": "manual-narrative-gate-depth",
    "artifact-gap-to-opportunity-repair": "artifact-gap-repair-depth",
  }[pathId];
}

function summaryTextFor(path, narrativeTailor) {
  if (path.id === "narrative-gate-to-repair") {
    return `Manual narrative gates expose ${narrativeTailor.summary?.manualReadinessBlocked || 0} externally blocked audience(s), ${narrativeTailor.summary?.localReviewReady || 0} local-review-ready draft(s), ${narrativeTailor.summary?.manualRepairPlanItems || 0} repair item(s), and ${narrativeTailor.summary?.averageManualReadinessScore || 0}/100 external readiness instead of claiming send-ready copy.`;
  }
  if (path.id === "artifact-gap-to-opportunity-repair") {
    return `Artifact gap repair paths expose ${path.evidenceCount} screenshot/proof repair relationship(s) as graph-visible work instead of claiming the missing media already exists.`;
  }
  return `${path.pathShape} carries ${path.evidenceCount} inspectable signal(s) at ${path.score}/100 with repair guidance attached.`;
}

function reportChecks({
  lanes,
  depthSummaries,
  graphQuality,
  graphScoreboard,
  graphLineage,
  graphDisclosureLinks,
  graphConfidence,
  narrativeTailor,
  narrativeSequence,
  routeManifest,
  refreshPlan,
  packageManifest,
}) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const scripts = packageManifest.scripts || {};
  return [
    check("lane-coverage", lanes.length >= 8 && lanes.every((lane) => lane.passed), "high", `${lanes.filter((lane) => lane.passed).length}/${lanes.length} graph depth lane(s) passing.`, "Repair the first failing graph depth lane.", "npm run audit:graph-depth"),
    check("structural-quality", (graphQuality.summary?.failing || 0) === 0, "high", `${graphQuality.summary?.passing || 0}/${graphQuality.summary?.checks || 0} graph quality check(s) pass.`, "Repair graph structural quality failures before scoring depth.", "npm run check && node server.js # then open /api/graph-quality"),
    check("lineage-depth", (graphLineage.summary?.lineagePaths || 0) >= 100 && (graphLineage.summary?.unresolvedEvidenceRefs || 0) === 0, "high", `${graphLineage.summary?.lineagePaths || 0} lineage path(s); ${graphLineage.summary?.unresolvedEvidenceRefs || 0} unresolved evidence ref(s).`, "Repair unresolved lineage evidence before promoting deep graph paths.", "npm run check && node server.js # then open /api/graph-lineage"),
    check("disclosure-depth", (graphDisclosureLinks.summary?.relationships || 0) >= 100 && graphDisclosureLinks.summary?.confidenceCapped === true, "high", `${graphDisclosureLinks.summary?.relationships || 0} disclosure relationship(s); capped=${Boolean(graphDisclosureLinks.summary?.confidenceCapped)}.`, "Keep disclosure graph relationships deep and confidence-capped.", "npm run audit:graph-disclosures"),
    check("confidence-depth", (graphConfidence.summary?.relationships || 0) >= 500 && (graphConfidence.summary?.families || 0) >= 3, "high", `${graphConfidence.summary?.relationships || 0} confidence relationship(s) across ${graphConfidence.summary?.families || 0} family/families.`, "Keep crosslink, disclosure, and projection confidence families wired.", "npm run audit:graph-confidence"),
    check("sequence-bridge", (narrativeSequence.summary?.totalBeats || 0) >= 21 && (narrativeSequence.summary?.failing || 0) === 0, "medium", `${narrativeSequence.summary?.totalBeats || 0} narrative sequence beat(s).`, "Keep narrative sequencing available as a graph-depth bridge.", "npm run sequence:narratives"),
    check("manual-narrative-gates", (narrativeTailor.summary?.audiences || 0) >= 3 && (narrativeTailor.summary?.manualRepairPlanItems || 0) >= (narrativeTailor.summary?.audiences || 0), "high", `${narrativeTailor.summary?.manualReadinessBlocked || 0} blocked audience gate(s); ${narrativeTailor.summary?.manualRepairPlanItems || 0} repair item(s).`, "Keep narrative tailor gates visible in graph depth summaries instead of implying external-ready drafts.", "npm run tailor:narratives"),
    check(
      "artifact-gap-repair-graph-depth",
      (graphLineage.summary?.artifactGapRepairPaths || 0) > 0 &&
        (graphLineage.summary?.graphResolvedArtifactGapRepairPaths || 0) === (graphLineage.summary?.artifactGapRepairPaths || -1),
      "high",
      `${graphLineage.summary?.graphResolvedArtifactGapRepairPaths || 0}/${graphLineage.summary?.artifactGapRepairPaths || 0} artifact gap repair path(s) graph-resolved.`,
      "Represent proof-media gap repair pressure as graph-visible repair and opportunity-unlock relationships.",
      "npm run audit:graph-lineage && npm run audit:graph-depth",
    ),
    check("depth-summary-cards", depthSummaries.length >= 5 && depthSummaries.every((summary) => summary.summary && summary.repairAction && summary.verificationCommand), "medium", `${depthSummaries.length} graph depth summary card(s) generated.`, "Keep graph depth paths summarized with repair actions and verification commands.", "npm run audit:graph-depth"),
    check("normalization-repair-visible", (graphScoreboard.summary?.score || 0) >= 85 || (graphScoreboard.summary?.repairActions || 0) >= 6, "medium", `normalization=${graphScoreboard.summary?.score || 0}/100; repairActions=${graphScoreboard.summary?.repairActions || 0}.`, "Keep high graph normalization or expose actionable repairs instead of hiding coverage gaps.", "npm run check && node server.js # then open /api/graph-scoreboard"),
    check("route-manifest", requiredRoutes().every((route) => publicRoutes.includes(route)), "high", `${requiredRoutes().filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes().length} graph depth route(s) declared.`, "Add graph depth report, plan, and history routes to runtimeRouteManifest.", "npm run record:runtime-surface"),
    check("refresh-plan", refreshEndpoints.includes(ENDPOINT), "medium", `${ENDPOINT} ${refreshEndpoints.includes(ENDPOINT) ? "covered" : "missing"} in refresh plan.`, "Add graph depth score to safe evidence refresh.", "npm run refresh:evidence"),
    check("script-coverage", Boolean(scripts["audit:graph-depth"]), "medium", `audit:graph-depth=${Boolean(scripts["audit:graph-depth"])}`, "Add the audit:graph-depth package script.", "npm run audit:graph-depth"),
  ];
}

function lane({ id, label, score, weight, passed, evidence, repairAction, verificationCommand }) {
  return {
    id,
    label,
    score: clamp(Math.round(score || 0), 0, 100),
    band: bandFor(clamp(Math.round(score || 0), 0, 100)),
    weight,
    passed: Boolean(passed),
    evidence,
    repairAction,
    verificationCommand,
  };
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

function requiredRoutes() {
  return [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`];
}

function graphDepthPolicy() {
  return {
    deepPathShape:
      "A high-value evidence path can travel from identity/project nodes to claims or artifacts, then through narratives, objections, disclosures, repairs, confidence caps, and manual sequence gates.",
    scoringRule:
      "Low normalized rendered coverage can still pass when the graph exposes repair actions, quarantine pressure, and enough public-safe deep paths for inspection.",
    safetyRule:
      "No graph depth score may hide weak coverage, private references, external outcome limits, or manual review boundaries.",
  };
}

function graphDepthNonClaims() {
  return [
    "Does not prove production graph persistence, hosted graph rendering, or deployed graph storage.",
    "Does not inspect private files, credentials, private dashboards, inboxes, or unapproved artifacts.",
    "Does not claim audience interest, admissions results, hiring outcomes, funding, interviews, or third-party validation.",
    "Does not hide low normalized graph coverage; repair actions remain part of the score.",
    "Does not treat artifact gap repair paths as completed screenshots, videos, outreach, applications, or external opportunity outcomes.",
  ];
}

function titleize(value) {
  return String(value || "graph-depth")
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function weightedScore(items) {
  const valid = items.filter((item) => Number.isFinite(item.score) && Number.isFinite(item.weight) && item.weight > 0);
  const max = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!max) return 0;
  return clamp(Math.round(valid.reduce((sum, item) => sum + item.score * item.weight, 0) / max), 0, 100);
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
  if (!Number.isFinite(numericLimit)) return 5;
  return Math.max(1, Math.min(Math.floor(numericLimit), 50));
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

module.exports = {
  appendGraphDepthScoreReceipt,
  buildGraphDepthScoreHistory,
  buildGraphDepthScoreReportFromReceipt,
  buildGraphDepthScoreReport,
  buildGraphDepthScoreResponse,
  graphDepthScorePlan,
  readGraphDepthScoreHistoryWindow,
  readGraphDepthScoreReceipts,
};
