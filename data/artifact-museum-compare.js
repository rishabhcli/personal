const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/artifact-museum-compare";
const STORE_RELATIVE_PATH = path.join("var", "artifact-museum-compare-receipts.json");
const maxReceipts = 50;

function artifactMuseumComparisonPlan() {
  return {
    mode: "artifact-museum-comparison-plan",
    command: "npm run compare:artifact-museum",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing artifact collections, transcripts, replays, museum capture records, comparison routes, or explicit media gap records.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe artifact museum comparison endpoints, writes a local receipt under var/, and does not publish, deploy, inspect private files, create screenshots, call external services, or mutate third-party systems.",
  };
}

function buildArtifactMuseumComparisonAudit({
  artifactCatalog,
  collections,
  transcripts,
  museum,
  replays,
  routeManifest,
  refreshPlan,
  packageManifest = {},
  receipts = [],
}) {
  const lanes = (collections.collections || []).map((collection) =>
    collectionLane({
      collection,
      transcripts,
      replays,
      totalProjects: artifactCatalog.counts.projects,
    }),
  );
  const comparisonMatrix = pairwiseLanes(lanes);
  const checks = museumComparisonChecks({ lanes, comparisonMatrix, artifactCatalog, routeManifest, refreshPlan, packageManifest });
  const dimensions = museumComparisonDimensions({ lanes, comparisonMatrix, artifactCatalog, museum, checks });
  const score = weightedScore(dimensions);
  const focusPairs = comparisonMatrix
    .filter((pair) => pair.recommendationPriority >= 70)
    .sort((left, right) => right.recommendationPriority - left.recommendationPriority || right.comparisonScore - left.comparisonScore)
    .slice(0, 8);
  const latestReceipt = receipts[0] || null;
  const coveredProjects = unique(lanes.flatMap((lane) => lane.projects));
  const artifactsCompared = lanes.reduce((sum, lane) => sum + lane.artifacts, 0);
  const gapRecords = lanes.reduce((sum, lane) => sum + lane.gaps, 0);

  return {
    generatedAt: new Date().toISOString(),
    mode: "artifact-museum-comparison-audit",
    sourceBoundary:
      "This comparison audit reads public-safe artifact collections, transcripts, replay records, museum readiness, source traces, and explicit gap records. It does not infer missing screenshots, videos, private files, external uptime, or unpublished media.",
    sideEffectBoundary:
      "This endpoint reads in-memory public-safe artifact reports and local receipt history only. It does not publish, deploy, inspect private files, create screenshots, call external services, or mutate third-party systems.",
    plan: artifactMuseumComparisonPlan(),
    summary: {
      score,
      band: bandFor(score),
      collections: lanes.length,
      comparisonPairs: comparisonMatrix.length,
      focusPairs: focusPairs.length,
      projectsCovered: coveredProjects.length,
      totalProjects: artifactCatalog.counts.projects,
      artifactsCompared,
      gapRecords,
      transcriptBackedProjects: unique(lanes.flatMap((lane) => lane.transcriptBackedProjects)).length,
      replayBackedProjects: unique(lanes.flatMap((lane) => lane.replayBackedProjects)).length,
      museumScore: museum.summary?.score || 0,
      checks: checks.length,
      passing: checks.filter((check) => check.passed).length,
      failing: checks.filter((check) => !check.passed).length,
      routeCovered: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      latestReceiptId: latestReceipt?.id || null,
    },
    dimensions,
    collectionLanes: lanes,
    comparisonMatrix,
    focusPairs,
    checks,
    curatorContrastPlan: curatorContrastPlan(focusPairs, lanes),
    nextAction:
      focusPairs[0]?.nextAction ||
      "Keep collection comparisons, replay coverage, transcript coverage, and explicit artifact gaps fresh after evidence changes.",
    verificationCommand: "npm run compare:artifact-museum && npm run check && npm run verify",
  };
}

function selectArtifactMuseumComparisonPair(leftId, rightId, report) {
  const left = normalizeId(leftId);
  const right = normalizeId(rightId);
  return (
    (report.comparisonMatrix || []).find((pair) => {
      const pairLeft = normalizeId(pair.left.id);
      const pairRight = normalizeId(pair.right.id);
      return (pairLeft === left && pairRight === right) || (pairLeft === right && pairRight === left) || pair.id === `${left}__vs__${right}`;
    }) || null
  );
}

function buildArtifactMuseumComparisonResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      comparisonPayloadPolicy: {
        fullDetail: true,
        lanesReturned: report.collectionLanes?.length || 0,
        pairsReturned: report.comparisonMatrix?.length || 0,
        focusPairsReturned: report.focusPairs?.length || 0,
        fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      },
    };
  }

  const comparisonPreview = selectComparisonPairPreview(report.comparisonMatrix || [], report.focusPairs || []);
  const lanePreview = (report.collectionLanes || []).slice(0, 2);
  return {
    mode: report.mode,
    summary: summarizeComparisonSummary(report.summary),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    dimensionSummary: summarizeDimensionSummary(report.dimensions || []),
    collectionLanes: lanePreview.map(summarizeLane),
    comparisonMatrix: comparisonPreview.map(summarizePair),
    focusPairSummary: summarizeFocusPairSummary(report.focusPairs || []),
    checks: selectMuseumComparisonCheckPreview(report.checks || []).map(summarizeCheck),
    curatorContrastPlan: summarizeCuratorContrastPlan(report.curatorContrastPlan),
    comparisonPayloadPolicy: {
      fullDetail: false,
      pairsReturned: comparisonPreview.length,
      totalPairs: report.comparisonMatrix?.length || 0,
      focusPairsReturned: 0,
    },
  };
}

function summarizeComparisonSummary(summary = {}) {
  return {
    score: summary.score || 0,
    comparisonPairs: summary.comparisonPairs || 0,
    focusPairs: summary.focusPairs || 0,
    routeCovered: summary.routeCovered === true,
    refreshCovered: summary.refreshCovered === true,
  };
}

function summarizeComparisonPlan(plan = {}) {
  return {
    mode: plan.mode,
    command: plan.command,
    endpoint: plan.endpoint,
    receiptStore: plan.receiptStore,
    scheduleRecommendationAvailable: Boolean(plan.scheduleRecommendation),
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
  };
}

function selectComparisonPairPreview(pairs = [], focusPairs = []) {
  const selected = [];
  const seen = new Set();
  const push = (pair) => {
    if (!pair || seen.has(pair.id)) return;
    selected.push(pair);
    seen.add(pair.id);
  };
  push(pairs.find((pair) => pair.id === "proof-strongest__vs__media-replay"));
  for (const pair of focusPairs.slice(0, 2)) push(pair);
  for (const pair of pairs.slice(0, 4)) push(pair);
  for (const pair of pairs) {
    if (selected.length >= 3) break;
    push(pair);
  }
  return selected.slice(0, 3);
}

function summarizeLane(lane) {
  return {
    id: lane.id,
    score: lane.score,
    projectCount: lane.projects.length,
  };
}

function summarizePair(pair) {
  return {
    id: pair.id,
    comparisonScore: pair.comparisonScore,
    recommendationPriority: pair.recommendationPriority,
    sharedProjects: pair.sharedProjects.length,
  };
}

function summarizeFocusPairSummary(focusPairs = []) {
  return {
    total: focusPairs.length,
  };
}

function summarizePairLaneReference(lane) {
  return {
    id: lane.id,
    score: lane.score,
  };
}

function summarizeDimension(dimension) {
  return {
    id: dimension.id,
    score: dimension.score,
    band: dimension.band,
  };
}

function summarizeDimensionSummary(dimensions = []) {
  return {
    total: dimensions.length,
    highScoring: dimensions.filter((dimension) => (dimension.score || 0) >= 85).length,
  };
}

function summarizeCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function selectMuseumComparisonCheckPreview(checks) {
  const seen = new Set();
  return checks.filter((check) => {
    const keep = !check.passed || check.id === "script-coverage";
    if (!keep || seen.has(check.id)) return false;
    seen.add(check.id);
    return true;
  });
}

function summarizeCuratorContrastPlan(plan = {}) {
  return {
    contrastOrder: (plan.contrastOrder || []).slice(0, 1).map((item) => ({
      pairId: item.pairId,
    })),
    manualGateAvailable: Boolean(plan.manualGate),
    verificationCommandAvailable: Boolean(plan.verificationCommand),
  };
}

function appendArtifactMuseumComparisonReceipt(root, receipt) {
  const receipts = readArtifactMuseumComparisonReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readArtifactMuseumComparisonReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function buildArtifactMuseumComparisonHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const response = {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "artifact-museum-comparison-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: artifactMuseumComparisonHistoryPayloadPolicy({ fullDetail, returnedReceipts: limited.length }),
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      latestScore: latest?.summary?.score || 0,
      latestComparisonPairs: latest?.summary?.comparisonPairs || 0,
      latestFocusPairs: latest?.summary?.focusPairs || 0,
      ...(fullDetail ? { latestBand: latest?.summary?.band || "unknown" } : {}),
    },
    receipts: fullDetail ? limited : limited.map(summarizeArtifactMuseumComparisonReceipt),
  };

  if (fullDetail) {
    return {
      ...response,
      sourceBoundary:
        "This endpoint returns full local artifact museum comparison receipts. It does not publish, deploy, inspect private files, create screenshots, call external services, or mutate third-party systems.",
      sideEffectBoundary:
        "The history endpoint reads local artifact museum comparison receipts only. It does not publish, deploy, inspect private files, create screenshots, call external services, or mutate third-party systems.",
      receiptStore: STORE_RELATIVE_PATH,
      nextAction: limited[0]
        ? "Artifact museum comparison history is available; run npm run compare:artifact-museum after collection, transcript, replay, museum, or gap-record changes."
        : "Run npm run compare:artifact-museum to create artifact museum comparison history.",
      verificationCommand: "npm run compare:artifact-museum && node --test test/api-contract.test.mjs",
    };
  }

  return {
    ...response,
    receiptStoreAvailable: true,
  };
}

function artifactMuseumComparisonHistoryPayloadPolicy({ fullDetail, returnedReceipts }) {
  if (fullDetail) {
    return {
      fullDetail,
      fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
      fullReportEndpoint: `${ENDPOINT}?detail=full`,
      returnedReceipts,
      latestReceiptPreview: "full",
      olderReceiptPreview: "full",
    };
  }
  return {
    fullDetail,
    fullDetailAvailable: true,
    olderReceiptPreview: "trend-summary-only",
  };
}

function summarizeArtifactMuseumComparisonReceipt(receipt) {
  const dimensions = receipt.dimensions || [];
  const focusPairs = receipt.focusPairs || [];
  const checks = receipt.checks || [];
  return {
    id: receipt.id,
    summary: summarizeArtifactMuseumComparisonReceiptSummary(receipt.summary),
    dimensionSummary: summarizeArtifactMuseumComparisonDimensionSummary(dimensions, receipt.summary),
    focusPairSummary: summarizeArtifactMuseumComparisonFocusPairSummary(focusPairs, receipt.summary),
    checkSummary: summarizeArtifactMuseumComparisonCheckSummary(checks, receipt.summary),
  };
}

function summarizeArtifactMuseumComparisonDimensionSummary(dimensions = [], summary = {}) {
  return {
    total: dimensions.length || summary?.dimensions || 0,
    highScoring: dimensions.filter((dimension) => (dimension.score || 0) >= 85).length,
  };
}

function summarizeArtifactMuseumComparisonFocusPairSummary(focusPairs = [], summary = {}) {
  return {
    total: focusPairs.length || summary?.focusPairs || 0,
  };
}

function summarizeArtifactMuseumComparisonCheckSummary(checks = [], summary = {}) {
  return {
    total: checks.length || summary?.checks || 0,
    passing: checks.filter((check) => check.passed).length || summary?.passing || 0,
    failing: checks.filter((check) => !check.passed).length || summary?.failing || 0,
  };
}

function summarizeArtifactMuseumComparisonSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    collections: summary.collections || 0,
    comparisonPairs: summary.comparisonPairs || 0,
    focusPairs: summary.focusPairs || 0,
    projectsCovered: summary.projectsCovered || 0,
    totalProjects: summary.totalProjects || 0,
    artifactsCompared: summary.artifactsCompared || 0,
    gapRecords: summary.gapRecords || 0,
    transcriptBackedProjects: summary.transcriptBackedProjects || 0,
    replayBackedProjects: summary.replayBackedProjects || 0,
    museumScore: summary.museumScore || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    routeCovered: Boolean(summary.routeCovered),
    refreshCovered: Boolean(summary.refreshCovered),
  };
}

function summarizeArtifactMuseumComparisonReceiptSummary(summary = {}) {
  return {
    score: summary.score || 0,
    comparisonPairs: summary.comparisonPairs || 0,
    focusPairs: summary.focusPairs || 0,
    checks: summary.checks || 0,
    failing: summary.failing || 0,
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function collectionLane({ collection, transcripts, replays, totalProjects }) {
  const transcriptMap = new Map((transcripts.transcripts || []).map((transcript) => [transcript.project, transcript]));
  const replayMap = new Map((replays.replays || []).map((replay) => [replay.project, replay]));
  const artifacts = collection.artifacts || [];
  const gaps = collection.gaps || [];
  const projectIds = unique([...artifacts.map((artifact) => artifact.project), ...gaps.map((gap) => gap.project)]);
  const artifactTypes = countBy(artifacts.map((artifact) => artifact.artifactType));
  const mediaKinds = countBy(artifacts.map((artifact) => artifact.mediaKind));
  const audiences = countBy(artifacts.map((artifact) => artifact.audience).filter(Boolean));
  const transcriptBackedProjects = projectIds.filter((project) => transcriptMap.get(project)?.publicSafe !== false);
  const replayBackedProjects = projectIds.filter((project) => replayMap.get(project)?.publicSafe !== false);
  const sourceTracedArtifacts = artifacts.filter((artifact) => artifact.sourceTrace?.length).length;
  const replayableArtifacts = artifacts.filter((artifact) => artifact.url || artifact.command).length;
  const proofArtifacts = artifacts.filter((artifact) => artifact.proofStrength !== "needs-source").length;
  const approvalRequiredArtifacts = artifacts.filter((artifact) => artifact.approvalRequired).length;
  const score = clamp(
    Math.round(
      (collection.score || 0) * 0.24 +
        percent(projectIds.length, totalProjects) * 0.16 +
        percent(transcriptBackedProjects.length, Math.max(1, projectIds.length)) * 0.16 +
        percent(replayBackedProjects.length, Math.max(1, projectIds.length)) * 0.16 +
        percent(sourceTracedArtifacts, Math.max(1, artifacts.length)) * 0.12 +
        percent(replayableArtifacts, Math.max(1, artifacts.length)) * 0.1 +
        percent(proofArtifacts, Math.max(1, artifacts.length)) * 0.06,
    ),
    0,
    100,
  );

  return {
    id: collection.id,
    label: collection.label,
    axis: collection.axis,
    score,
    sourceCollectionScore: collection.score || 0,
    band: bandFor(score),
    artifacts: artifacts.length,
    gaps: gaps.length,
    projects: projectIds,
    transcriptBackedProjects,
    replayBackedProjects,
    artifactTypes,
    mediaKinds,
    audiences,
    sourceTracedArtifacts,
    replayableArtifacts,
    proofArtifacts,
    approvalRequiredArtifacts,
    curatorNote: collection.curatorNote,
    suggestedPath: collection.suggestedPath || [],
    nextAction: laneNextAction({ collection, projectIds, transcriptBackedProjects, replayBackedProjects, artifacts, gaps }),
  };
}

function pairwiseLanes(lanes) {
  const pairs = [];
  for (let leftIndex = 0; leftIndex < lanes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < lanes.length; rightIndex += 1) {
      pairs.push(compareLanes(lanes[leftIndex], lanes[rightIndex]));
    }
  }
  return pairs.sort((left, right) => right.comparisonScore - left.comparisonScore || left.id.localeCompare(right.id));
}

function compareLanes(left, right) {
  const sharedProjects = intersection(left.projects, right.projects);
  const leftOnlyProjects = difference(left.projects, right.projects);
  const rightOnlyProjects = difference(right.projects, left.projects);
  const leftTypes = Object.keys(left.artifactTypes);
  const rightTypes = Object.keys(right.artifactTypes);
  const sharedArtifactTypes = intersection(leftTypes, rightTypes);
  const leftOnlyArtifactTypes = difference(leftTypes, rightTypes);
  const rightOnlyArtifactTypes = difference(rightTypes, leftTypes);
  const combinedProjects = unique([...left.projects, ...right.projects]);
  const replayContinuity = average([
    percent(left.replayBackedProjects.length, Math.max(1, left.projects.length)),
    percent(right.replayBackedProjects.length, Math.max(1, right.projects.length)),
  ]);
  const transcriptContinuity = average([
    percent(left.transcriptBackedProjects.length, Math.max(1, left.projects.length)),
    percent(right.transcriptBackedProjects.length, Math.max(1, right.projects.length)),
  ]);
  const sourceTraceContinuity = average([
    percent(left.sourceTracedArtifacts, Math.max(1, left.artifacts)),
    percent(right.sourceTracedArtifacts, Math.max(1, right.artifacts)),
  ]);
  const coverageContrast = percent(leftOnlyProjects.length + rightOnlyProjects.length, Math.max(1, combinedProjects.length));
  const typeContrast = percent(leftOnlyArtifactTypes.length + rightOnlyArtifactTypes.length, Math.max(1, unique([...leftTypes, ...rightTypes]).length));
  const gapHonesty = left.gaps || right.gaps ? 100 : 80;
  const comparisonScore = clamp(
    Math.round(
      coverageContrast * 0.2 +
        typeContrast * 0.18 +
        replayContinuity * 0.2 +
        transcriptContinuity * 0.2 +
        sourceTraceContinuity * 0.12 +
        gapHonesty * 0.1,
    ),
    0,
    100,
  );
  const gapPressure = left.gaps + right.gaps;
  const recommendationPriority = clamp(Math.round(comparisonScore + Math.min(18, gapPressure * 3) + Math.min(12, Math.abs(left.score - right.score) / 2)), 0, 100);

  return {
    id: `${left.id}__vs__${right.id}`,
    left: laneReference(left),
    right: laneReference(right),
    comparisonScore,
    band: bandFor(comparisonScore),
    recommendationPriority,
    sharedProjects,
    leftOnlyProjects,
    rightOnlyProjects,
    sharedArtifactTypes,
    leftOnlyArtifactTypes,
    rightOnlyArtifactTypes,
    gapDelta: left.gaps - right.gaps,
    scoreDelta: left.score - right.score,
    replayContinuity,
    transcriptContinuity,
    sourceTraceContinuity,
    useCase: pairUseCase(left, right, { gapPressure, leftOnlyProjects, rightOnlyProjects }),
    nextAction: pairNextAction(left, right, { gapPressure, leftOnlyProjects, rightOnlyProjects }),
    verificationCommand: "npm run compare:artifact-museum",
  };
}

function museumComparisonDimensions({ lanes, comparisonMatrix, artifactCatalog, museum, checks }) {
  const coveredProjects = unique(lanes.flatMap((lane) => lane.projects));
  const replayContinuity = average(
    lanes.map((lane) => percent(lane.replayBackedProjects.length, Math.max(1, lane.projects.length))),
  );
  const transcriptContinuity = average(
    lanes.map((lane) => percent(lane.transcriptBackedProjects.length, Math.max(1, lane.projects.length))),
  );
  const sourceTraceContinuity = average(lanes.map((lane) => percent(lane.sourceTracedArtifacts, Math.max(1, lane.artifacts))));
  const routeChecks = checks.filter((check) => ["route-manifest", "refresh-plan", "script-coverage", "receipt-route-coverage"].includes(check.id));
  return [
    dimension({
      id: "comparison-matrix-depth",
      label: "Comparison matrix depth",
      score: percent(comparisonMatrix.length, Math.max(10, lanes.length * 2)),
      weight: 0.17,
      detail: `${comparisonMatrix.length} collection pair(s) generated from ${lanes.length} lane(s).`,
    }),
    dimension({
      id: "collection-lane-coverage",
      label: "Collection lane coverage",
      score: percent(lanes.length, 7),
      weight: 0.15,
      detail: `${lanes.length} curated lane(s) participate in museum comparison.`,
    }),
    dimension({
      id: "project-coverage",
      label: "Project coverage",
      score: percent(coveredProjects.length, artifactCatalog.counts.projects),
      weight: 0.15,
      detail: `${coveredProjects.length}/${artifactCatalog.counts.projects} project(s) appear in at least one comparison lane.`,
    }),
    dimension({
      id: "replay-continuity",
      label: "Replay continuity",
      score: replayContinuity,
      weight: 0.13,
      detail: `${replayContinuity}/100 average replay-backed coverage across comparison lanes.`,
    }),
    dimension({
      id: "transcript-continuity",
      label: "Transcript continuity",
      score: transcriptContinuity,
      weight: 0.13,
      detail: `${transcriptContinuity}/100 average transcript-backed coverage across comparison lanes.`,
    }),
    dimension({
      id: "gap-honesty",
      label: "Gap honesty",
      score: lanes.some((lane) => lane.gaps > 0) ? 100 : 60,
      weight: 0.1,
      detail: `${lanes.reduce((sum, lane) => sum + lane.gaps, 0)} explicit gap record(s) stay available for comparison.`,
    }),
    dimension({
      id: "public-safety",
      label: "Public safety",
      score: sourceTraceContinuity,
      weight: 0.1,
      detail: `${sourceTraceContinuity}/100 average source-trace continuity across lanes.`,
    }),
    dimension({
      id: "repeatable-verification",
      label: "Repeatable verification",
      score: percent(routeChecks.filter((check) => check.passed).length, routeChecks.length),
      weight: 0.07,
      detail: `${routeChecks.filter((check) => check.passed).length}/${routeChecks.length} route, refresh, receipt, and script control(s) pass; museum score ${museum.summary?.score || 0}/100.`,
    }),
  ];
}

function museumComparisonChecks({ lanes, comparisonMatrix, artifactCatalog, routeManifest, refreshPlan, packageManifest }) {
  const routeCovered = [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => (routeManifest.publicApiRoutes || []).includes(route));
  return [
    check("collection-lane-coverage", lanes.length >= 6, "high", `${lanes.length} collection lane(s) available for comparison.`),
    check("comparison-matrix-depth", comparisonMatrix.length >= 10, "high", `${comparisonMatrix.length} collection pair(s) generated.`),
    check("project-coverage", unique(lanes.flatMap((lane) => lane.projects)).length >= Math.min(12, artifactCatalog.counts.projects), "high", "Comparison lanes should cover nearly every project."),
    check("replay-continuity", lanes.some((lane) => lane.replayBackedProjects.length >= Math.min(5, lane.projects.length || 1)), "medium", "At least one comparison lane should be replay-backed."),
    check("transcript-continuity", lanes.some((lane) => lane.transcriptBackedProjects.length >= Math.min(5, lane.projects.length || 1)), "medium", "At least one comparison lane should be transcript-backed."),
    check("gap-honesty", lanes.some((lane) => lane.gaps > 0), "high", "Explicit media gaps must remain in at least one comparison lane."),
    check("public-safe-source-trace", lanes.every((lane) => lane.artifacts === 0 || lane.sourceTracedArtifacts === lane.artifacts), "high", "All compared artifacts should carry source traces."),
    check("route-manifest", routeCovered, "medium", `${ENDPOINT}, ${ENDPOINT}/plan, and ${ENDPOINT}/history route manifest coverage.`),
    check("refresh-plan", (refreshPlan.endpoints || []).includes(ENDPOINT), "medium", `${ENDPOINT} refresh coverage.`),
    check("receipt-route-coverage", routeCovered, "medium", "Museum comparison report, plan, and receipt history routes should all be public API routes."),
    check("script-coverage", Boolean(packageManifest.scripts?.["compare:artifact-museum"]), "medium", `compare:artifact-museum=${Boolean(packageManifest.scripts?.["compare:artifact-museum"])}`),
  ];
}

function curatorContrastPlan(focusPairs, lanes) {
  const fallbackPairs = focusPairs.length ? focusPairs : pairwiseLanes(lanes).slice(0, 5);
  return {
    contrastOrder: fallbackPairs.slice(0, 5).map((pair, index) => ({
      step: index + 1,
      pairId: pair.id,
      lanes: [pair.left.id, pair.right.id],
      score: pair.comparisonScore,
      useCase: pair.useCase,
      nextAction: pair.nextAction,
    })),
    manualGate:
      "Use these comparisons to decide what public-safe artifact to improve next; do not expose raw private media, screenshots, or external traces without local approval.",
    verificationCommand: "npm run compare:artifact-museum",
  };
}

function laneReference(lane) {
  return {
    id: lane.id,
    label: lane.label,
    axis: lane.axis,
    score: lane.score,
    band: lane.band,
    artifacts: lane.artifacts,
    gaps: lane.gaps,
    projects: lane.projects.length,
  };
}

function laneNextAction({ collection, projectIds, transcriptBackedProjects, replayBackedProjects, artifacts, gaps }) {
  if (gaps[0]) return gaps[0].suggestedRepair || `${collection.label}: repair the highest priority missing artifact.`;
  if (projectIds.length && transcriptBackedProjects.length < projectIds.length) return `${collection.label}: add transcript backing for the missing project(s).`;
  if (projectIds.length && replayBackedProjects.length < projectIds.length) return `${collection.label}: add replay backing for the missing project(s).`;
  if (!artifacts.length) return `${collection.label}: add public-safe artifacts before using this lane as proof.`;
  return `${collection.label}: keep comparison lane fresh after artifact, transcript, replay, or gap changes.`;
}

function pairUseCase(left, right, { gapPressure, leftOnlyProjects, rightOnlyProjects }) {
  if (gapPressure) return `Compare ${left.label} against ${right.label} to see which missing media repair unlocks the most proof.`;
  if (left.axis !== right.axis) return `Contrast ${left.axis} curation with ${right.axis} curation across ${leftOnlyProjects.length + rightOnlyProjects.length} distinct project slot(s).`;
  return `Compare two ${left.axis} lanes for proof balance, replayability, and project coverage.`;
}

function pairNextAction(left, right, { gapPressure, leftOnlyProjects, rightOnlyProjects }) {
  if (gapPressure) return `${left.gaps >= right.gaps ? left.label : right.label}: repair the top explicit gap before claiming richer museum media.`;
  if (leftOnlyProjects.length + rightOnlyProjects.length) return `Use ${left.label} and ${right.label} to pick the next underrepresented project for a replay or transcript pass.`;
  return `Keep ${left.label} and ${right.label} synchronized after artifact catalog changes.`;
}

function dimension({ id, label, score, weight, detail }) {
  const normalized = clamp(Math.round(score), 0, 100);
  return {
    id,
    label,
    score: normalized,
    band: bandFor(normalized),
    weight,
    detail,
  };
}

function check(id, passed, severity, detail) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction: passed ? "Keep this artifact museum comparison control current." : `Repair artifact museum comparison control ${id}.`,
    verificationCommand: "npm run compare:artifact-museum",
  };
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function intersection(left, right) {
  const rightSet = new Set(right);
  return unique(left.filter((value) => rightSet.has(value)));
}

function difference(left, right) {
  const rightSet = new Set(right);
  return unique(left.filter((value) => !rightSet.has(value)));
}

function weightedScore(dimensions) {
  const totalWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (!totalWeight) return 0;
  return clamp(Math.round(dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / totalWeight), 0, 100);
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function percent(value, total) {
  if (!total) return 0;
  return clamp(Math.round((value / total) * 100), 0, 100);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeId(value) {
  return String(value || "").toLowerCase().trim();
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 5, 100));
}

module.exports = {
  ENDPOINT,
  appendArtifactMuseumComparisonReceipt,
  artifactMuseumComparisonPlan,
  buildArtifactMuseumComparisonAudit,
  buildArtifactMuseumComparisonHistory,
  buildArtifactMuseumComparisonResponse,
  readArtifactMuseumComparisonReceipts,
  selectArtifactMuseumComparisonPair,
  summarizeArtifactMuseumComparisonPair: summarizePair,
};
