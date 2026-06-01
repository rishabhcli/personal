const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/artifact-museum";
const STORE_RELATIVE_PATH = path.join("var", "artifact-museum-receipts.json");
const maxReceipts = 50;

function artifactMuseumPlan() {
  return {
    mode: "artifact-museum-audit-plan",
    command: "npm run audit:artifact-museum",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing artifact catalog records, museum captures, transcripts, replays, comparison paths, screenshots, or explicit media gap records.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe artifact museum endpoints, writes a local receipt under var/, and does not publish, deploy, inspect private files, create screenshots, call external services, or mutate third-party systems.",
  };
}

function buildArtifactMuseumAudit({ artifactCatalog, collections, transcripts, comparisons, projects, routeManifest, refreshPlan, packageManifest = {}, receipts = [] }) {
  const collectionMembership = membershipByArtifact(collections.collections || []);
  const transcriptByProject = new Map((transcripts.transcripts || []).map((transcript) => [transcript.project, transcript]));
  const comparisonProjects = new Set((comparisons || []).flatMap((comparison) => [comparison.left.slug, comparison.right.slug]));
  const projectReadiness = projects.map((project) =>
    projectArtifactReadiness({
      project,
      artifactCatalog,
      transcript: transcriptByProject.get(project.slug),
      collectionMembership,
      comparisonProjects,
    }),
  );
  const checks = museumChecks({ artifactCatalog, collections, transcripts, comparisons, projectReadiness, routeManifest, refreshPlan, packageManifest });
  const dimensions = museumDimensions({ artifactCatalog, collections, transcripts, comparisons, projectReadiness, routeManifest, refreshPlan });
  const score = weightedScore(dimensions);
  const weakestProjects = projectReadiness.slice().sort((left, right) => left.score - right.score || left.title.localeCompare(right.title)).slice(0, 5);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "artifact-museum-quality-audit",
    sourceBoundary:
      "This audit scores public-safe artifact catalog, collections, transcripts, comparison paths, source traces, and declared gaps. It does not claim screenshots, videos, private files, third-party uptime, or external media exist unless modeled artifacts expose them.",
    sideEffectBoundary:
      "This endpoint reads public-safe in-memory artifact reports and local receipt history only. It does not publish, deploy, inspect private files, create screenshots, contact third parties, or collect analytics.",
    plan: artifactMuseumPlan(),
    summary: {
      score,
      band: bandFor(score),
      projects: projects.length,
      artifacts: artifactCatalog.counts.artifacts,
      museumCaptures: artifactCatalog.counts.museumCaptures || 0,
      curatorAnnotations: artifactCatalog.counts.curatorAnnotations || 0,
      gapClosurePlans: artifactCatalog.counts.gapClosurePlans || 0,
      collections: collections.summary.collections,
      transcripts: transcripts.summary.transcripts,
      comparisons: comparisons.length,
      averageProjectReadiness: average(projectReadiness.map((project) => project.score)),
      screenshotGaps: artifactCatalog.counts.screenshotGaps,
      checks: checks.length,
      passing: checks.filter((check) => check.passed).length,
      failing: checks.filter((check) => !check.passed).length,
      routeCovered: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      latestReceiptId: latestReceipt?.id || null,
    },
    dimensions,
    checks,
    projectReadiness,
    weakestProjects,
    curatorPlan: curatorPlan({ weakestProjects, collections, transcripts }),
    nextAction: weakestProjects[0]?.nextAction || "Keep artifact museum routes, transcripts, collections, and comparison paths fresh after evidence changes.",
    verificationCommand: "npm run audit:artifact-museum && npm run check && npm run verify",
  };
}

function buildArtifactMuseumResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      museumPayloadPolicy: {
        fullDetail: true,
        projectsReturned: report.projectReadiness?.length || 0,
        dimensionsReturned: report.dimensions?.length || 0,
        fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      },
    };
  }
  const dimensions = selectArtifactMuseumDimensionPreview(report.dimensions || []);
  const checks = selectArtifactMuseumCheckPreview(report.checks || []);
  const projectReadiness = (report.projectReadiness || []).slice(0, 4).map(summarizeProjectReadinessIndex);

  return {
    mode: report.mode,
    summary: summarizeArtifactMuseumCompactSummary(report.summary),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    dimensions: dimensions.map(({ id, score }) => ({
      id,
      score,
    })),
    checks: checks.map(({ id, passed }) => ({
      id,
      passed: Boolean(passed),
    })),
    projectReadiness,
    projectReadinessSummary: summarizeProjectReadinessPreview(report.projectReadiness || [], report.weakestProjects || []),
    curatorPlan: summarizeCuratorPlan(report.curatorPlan, { limit: 1 }),
    museumPayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
      dimensionsReturned: dimensions.length,
      checksReturned: checks.length,
      projectPreviewReturned: projectReadiness.length,
    },
  };
}

function appendArtifactMuseumReceipt(root, receipt) {
  const receipts = readArtifactMuseumReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readArtifactMuseumReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function buildArtifactMuseumHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const summary = {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
    latestCheckedAt: fullDetail ? latest?.checkedAt || null : undefined,
    latestScore: latest?.summary?.score || 0,
    latestArtifacts: latest?.summary?.artifacts || 0,
  };
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "artifact-museum-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "This endpoint returns local artifact museum receipts with full recorded dimension, weakest-project, and check detail. It does not create screenshots, inspect private files, publish media, contact third parties, or infer missing external proof."
      : undefined,
    sourceBoundaryAvailable: fullDetail ? undefined : true,
    sideEffectBoundary: fullDetail
      ? "The history endpoint reads local artifact museum receipts only. It does not publish, deploy, inspect private files, create screenshots, call external services, or mutate third-party systems."
      : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: artifactMuseumHistoryPayloadPolicy({ fullDetail, returnedReceipts: limited.length }),
    summary,
    definitions: fullDetail ? undefined : summarizeArtifactMuseumHistoryDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeArtifactMuseumReceipt(receipt, { includePreviews: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Artifact museum history is available; run npm run audit:artifact-museum after artifact catalog, collection, transcript, replay, route, or gap-record changes."
        : "Run npm run audit:artifact-museum to create artifact museum history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:artifact-museum && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeArtifactMuseumHistoryDefinitions(receipt) {
  return {
    dimensions: (receipt?.dimensions || []).length,
    checks: (receipt?.checks || []).length,
  };
}

function artifactMuseumHistoryPayloadPolicy({ fullDetail, returnedReceipts }) {
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
      historyRowsReturned: returnedReceipts,
    };
  }
  return {
    fullDetail,
    fullHistoryEndpoint: `${ENDPOINT}/history?detail=full`,
    returnedReceipts,
    latestReceiptPreview: fullDetail ? "full-receipt" : "dimension-project-check-preview",
    olderReceiptPreview: fullDetail ? "full-receipt" : "trend-summary-only",
  };
}

function summarizeArtifactMuseumReceipt(receipt, { includePreviews = true } = {}) {
  const summary = summarizeArtifactMuseumHistoryReceiptSummary(receipt.summary);
  const dimensions = receipt.dimensions || [];
  const checks = receipt.checks || [];
  const dimensionSummary = summarizeArtifactMuseumDimensionSet(dimensions);
  if (!includePreviews) {
    return {
      id: receipt.id,
      trendOnly: true,
      score: summary.score,
      artifacts: summary.artifacts,
      dimensions: dimensions.length || receipt.summary?.dimensions || 0,
      highScoringDimensions: dimensionSummary.highScoring,
      lowestDimensionScore: dimensionSummary.lowestScore,
      passingChecks: checks.filter((check) => check.passed).length || summary.passing,
      failingChecks: checks.filter((check) => !check.passed).length || summary.failing,
    };
  }
  return {
    id: receipt.id,
    score: summary.score,
    artifacts: summary.artifacts,
    dimensions: dimensions.slice(0, 4).map((dimension) => ({
      id: dimension.id,
      score: dimension.score,
    })),
    totalDimensions: dimensions.length,
    highScoringDimensions: dimensionSummary.highScoring,
    lowestDimensionScore: dimensionSummary.lowestScore,
    weakestProjects: (receipt.weakestProjects || []).slice(0, 2).map((project) => ({
      slug: project.slug,
      score: project.score,
      gaps: project.gaps,
    })),
    passingChecks: checks.filter((check) => check.passed).length,
    failingChecks: checks.filter((check) => !check.passed).length,
  };
}

function summarizeArtifactMuseumDimensionSet(dimensions = []) {
  return {
    total: dimensions.length,
    highScoring: dimensions.filter((dimension) => (dimension.score || 0) >= 85).length,
    lowestScore: dimensions.reduce((lowest, dimension) => Math.min(lowest, dimension.score || 0), 100),
  };
}

function summarizeArtifactMuseumWeakestProjects(projects = []) {
  return {
    total: projects.length,
    lowestSlug: projects[0]?.slug || null,
    lowestScore: projects[0]?.score || 0,
  };
}

function summarizeArtifactMuseumHistoryReceiptSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    artifacts: summary.artifacts || 0,
    museumCaptures: summary.museumCaptures || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
  };
}

function summarizeProjectReadiness(project) {
  return {
    slug: project.slug,
    title: project.title,
    score: project.score,
    band: project.band,
    artifacts: project.artifacts,
    curatorAnnotations: project.curatorAnnotations,
    replayableArtifacts: project.replayableArtifacts,
    sourceTraceScore: project.sourceTraceScore,
    transcriptStatus: project.transcriptStatus,
    transcriptScore: project.transcriptScore,
    collectionCount: project.collectionCount,
    comparisonIncluded: Boolean(project.comparisonIncluded),
    gapCount: (project.gaps || []).length,
  };
}

function summarizeProjectReadinessIndex(project) {
  return {
    slug: project.slug,
    gapCount: (project.gaps || []).length,
  };
}

function summarizeProjectReadinessPreview(projects = [], weakestProjects = []) {
  return {
    total: projects.length,
    projectsWithGaps: projects.filter((project) => (project.gaps || []).length > 0).length,
    lowestSlug: weakestProjects[0]?.slug || projects[0]?.slug || null,
    lowestScore: weakestProjects[0]?.score || projects[0]?.score || 0,
  };
}

function selectArtifactMuseumDimensionPreview(dimensions = []) {
  return selectRowsById(dimensions, ["collection-curation", "comparison-readiness", "project-readiness", "catalog-depth"], 4);
}

function selectArtifactMuseumCheckPreview(checks = []) {
  return selectRowsById(
    checks,
    [
      "museum-capture-coverage",
      "curator-annotation-coverage",
      "gap-closure-plan-coverage",
      "inspection-route-coverage",
      "receipt-route-coverage",
      "script-coverage",
    ],
    6,
  );
}

function selectRowsById(rows = [], ids = [], limit = rows.length) {
  const selected = [];
  const seen = new Set();
  for (const id of ids) {
    const match = rows.find((row) => row.id === id);
    if (match && !seen.has(match.id)) {
      selected.push(match);
      seen.add(match.id);
    }
  }
  for (const row of rows) {
    if (selected.length >= limit) break;
    if (row?.id && !seen.has(row.id)) {
      selected.push(row);
      seen.add(row.id);
    }
  }
  return selected.slice(0, limit);
}

function summarizeCuratorPlan(plan = {}, { limit = 3 } = {}) {
  return {
    priorityProjects: (plan.priorityProjects || []).slice(0, limit).map(({ slug }) => ({
      slug,
    })),
  };
}

function summarizeArtifactMuseumSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    projects: summary.projects || 0,
    artifacts: summary.artifacts || 0,
    museumCaptures: summary.museumCaptures || 0,
    curatorAnnotations: summary.curatorAnnotations || 0,
    gapClosurePlans: summary.gapClosurePlans || 0,
    collections: summary.collections || 0,
    transcripts: summary.transcripts || 0,
    comparisons: summary.comparisons || 0,
    averageProjectReadiness: summary.averageProjectReadiness || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
  };
}

function summarizeArtifactMuseumCompactSummary(summary = {}) {
  return {
    score: summary.score || 0,
    projects: summary.projects || 0,
    museumCaptures: summary.museumCaptures || 0,
    curatorAnnotations: summary.curatorAnnotations || 0,
    gapClosurePlans: summary.gapClosurePlans || 0,
    routeCovered: summary.routeCovered === true,
    refreshCovered: summary.refreshCovered === true,
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function projectArtifactReadiness({ project, artifactCatalog, transcript, collectionMembership, comparisonProjects }) {
  const artifacts = (artifactCatalog.artifacts || []).filter((artifact) => artifact.project === project.slug);
  const gaps = (artifactCatalog.gaps || []).filter((gap) => gap.project === project.slug);
  const types = new Set(artifacts.map((artifact) => artifact.artifactType));
  const traceScore = percent(artifacts.filter((artifact) => artifact.sourceTrace?.length >= 2).length, artifacts.length);
  const routeArtifacts = artifacts.filter((artifact) => artifact.url?.startsWith("/api/") || artifact.command).length;
  const collectionCount = collectionMembership.get(project.slug)?.size || 0;
  const transcriptScore = transcript?.transcriptScore || 0;
  const score = clamp(
    Math.round(
      percent(types.size, 5) * 0.2 +
        percent(routeArtifacts, Math.max(1, artifacts.length)) * 0.18 +
        traceScore * 0.18 +
        transcriptScore * 0.18 +
        percent(collectionCount, 3) * 0.12 +
        (comparisonProjects.has(project.slug) ? 100 : 55) * 0.08 +
        (gaps.length ? 70 : 100) * 0.06,
    ),
    0,
    100,
  );
  return {
    slug: project.slug,
    title: project.title,
    score,
    band: bandFor(score),
    artifacts: artifacts.length,
    artifactTypes: [...types].sort(),
    curatorAnnotations: artifacts.filter((artifact) => artifact.artifactType === "curator-annotation").length,
    replayableArtifacts: routeArtifacts,
    sourceTraceScore: traceScore,
    transcriptStatus: transcript?.status || "missing",
    transcriptScore,
    collectionCount,
    comparisonIncluded: comparisonProjects.has(project.slug),
    gaps: gaps.map((gap) => ({
      id: gap.id,
      gapType: gap.gapType,
      suggestedRepair: gap.suggestedRepair,
    })),
    nextAction: nextActionForProject({ project, artifacts, gaps, transcript, collectionCount, comparisonProjects }),
  };
}

function museumDimensions({ artifactCatalog, collections, transcripts, comparisons, projectReadiness, routeManifest, refreshPlan }) {
  const artifactTypes = new Set((artifactCatalog.artifacts || []).map((artifact) => artifact.artifactType));
  const routeScore = routeCoverage({ routeManifest, refreshPlan }).score;
  return [
    dimension({
      id: "catalog-depth",
      label: "Catalog depth",
      score: Math.round((percent(artifactCatalog.counts.artifacts, artifactCatalog.counts.projects * 5) + percent(artifactTypes.size, 6)) / 2),
      weight: 0.18,
      detail: `${artifactCatalog.counts.artifacts} artifact(s) across ${artifactCatalog.counts.projects} project(s) and ${artifactTypes.size} artifact type(s).`,
    }),
    dimension({
      id: "transcript-readiness",
      label: "Transcript readiness",
      score: Math.round((percent(transcripts.summary.publicSafeTranscripts, artifactCatalog.counts.projects) + transcripts.summary.averageTranscriptScore) / 2),
      weight: 0.18,
      detail: `${transcripts.summary.publicSafeTranscripts}/${artifactCatalog.counts.projects} public-safe transcript(s), average ${transcripts.summary.averageTranscriptScore}/100.`,
    }),
    dimension({
      id: "collection-curation",
      label: "Collection curation",
      score: Math.round((percent(collections.summary.collections, 6) + percent(collections.summary.featuredArtifacts, artifactCatalog.counts.artifacts)) / 2),
      weight: 0.16,
      detail: `${collections.summary.collections} collection(s), ${collections.summary.featuredArtifacts} featured artifact(s).`,
    }),
    dimension({
      id: "capture-readiness",
      label: "Capture readiness",
      score: percent(artifactCatalog.counts.museumCaptures || 0, artifactCatalog.counts.projects),
      weight: 0.08,
      detail: `${artifactCatalog.counts.museumCaptures || 0}/${artifactCatalog.counts.projects} project(s) expose public-safe museum capture records.`,
    }),
    dimension({
      id: "annotation-readiness",
      label: "Annotation readiness",
      score: percent(artifactCatalog.counts.curatorAnnotations || 0, artifactCatalog.counts.projects),
      weight: 0.08,
      detail: `${artifactCatalog.counts.curatorAnnotations || 0}/${artifactCatalog.counts.projects} project(s) expose public-safe curator annotation records.`,
    }),
    dimension({
      id: "gap-closure-readiness",
      label: "Gap closure readiness",
      score: percent(artifactCatalog.counts.gapClosurePlans || 0, artifactCatalog.counts.projects),
      weight: 0.08,
      detail: `${artifactCatalog.counts.gapClosurePlans || 0}/${artifactCatalog.counts.projects} project(s) expose public-safe gap closure plan artifacts.`,
    }),
    dimension({
      id: "comparison-readiness",
      label: "Comparison readiness",
      score: percent(new Set(comparisons.flatMap((comparison) => [comparison.left.slug, comparison.right.slug])).size, Math.min(6, artifactCatalog.counts.projects)),
      weight: 0.09,
      detail: `${comparisons.length} comparison path(s) cover ${new Set(comparisons.flatMap((comparison) => [comparison.left.slug, comparison.right.slug])).size} project(s).`,
    }),
    dimension({
      id: "inspection-routes",
      label: "Inspection routes",
      score: routeScore,
      weight: 0.12,
      detail: routeCoverage({ routeManifest, refreshPlan }).detail,
    }),
    dimension({
      id: "public-safety",
      label: "Public safety",
      score: percent((artifactCatalog.artifacts || []).filter((artifact) => artifact.publicSafe && artifact.sourceTrace?.length).length, artifactCatalog.counts.artifacts),
      weight: 0.11,
      detail: `${(artifactCatalog.artifacts || []).filter((artifact) => artifact.publicSafe && artifact.sourceTrace?.length).length}/${artifactCatalog.counts.artifacts} artifact(s) are public-safe with source trace.`,
    }),
    dimension({
      id: "project-readiness",
      label: "Project readiness",
      score: average(projectReadiness.map((project) => project.score)),
      weight: 0.06,
      detail: `${projectReadiness.filter((project) => project.score >= 75).length}/${projectReadiness.length} project(s) are museum-ready.`,
    }),
  ];
}

function museumChecks({ artifactCatalog, collections, transcripts, comparisons, projectReadiness, routeManifest, refreshPlan, packageManifest }) {
  const route = routeCoverage({ routeManifest, refreshPlan });
  return [
    check("artifact-type-depth", new Set((artifactCatalog.artifacts || []).map((artifact) => artifact.artifactType)).size >= 5, "high", "Artifact catalog should expose generated previews, API replays, terminal replays, transcripts, and links."),
    check("project-artifact-coverage", projectReadiness.every((project) => project.artifacts >= 4), "high", "Every project should have at least generated, API, terminal, and transcript artifacts."),
    check("source-trace-coverage", (artifactCatalog.artifacts || []).every((artifact) => artifact.sourceTrace?.length), "high", "Every artifact should include source trace."),
    check("transcript-coverage", transcripts.summary.transcripts === artifactCatalog.counts.projects, "high", "Every project should have a generated artifact transcript."),
    check("collection-coverage", collections.summary.collections >= 6 && collections.summary.featuredArtifacts >= artifactCatalog.counts.projects, "medium", "Collections should curate audience, proof, media, privacy, and repair surfaces."),
    check("museum-capture-coverage", artifactCatalog.counts.museumCaptures >= artifactCatalog.counts.projects, "high", "Every project should have a public-safe museum capture artifact before richer media is claimed."),
    check("curator-annotation-coverage", artifactCatalog.counts.curatorAnnotations >= artifactCatalog.counts.projects, "high", "Every project should have a public-safe curator annotation before the museum claims a guided artifact path."),
    check("gap-closure-plan-coverage", artifactCatalog.counts.gapClosurePlans >= artifactCatalog.counts.projects, "high", "Every project should have a public-safe gap closure plan before missing screenshots are treated as replayable proof."),
    check("comparison-coverage", comparisons.length >= 3 && comparisons.every((comparison) => comparison.nextActions.length > 0), "medium", "Museum should expose multiple comparison paths with next actions."),
    check("gap-honesty", artifactCatalog.counts.screenshotGaps >= artifactCatalog.counts.projects, "medium", "Screenshot gaps should stay explicit until served screenshots exist."),
    check("inspection-route-coverage", route.score >= 85, "high", route.detail),
    check("public-safe-projection", (artifactCatalog.artifacts || []).every((artifact) => artifact.publicSafe), "high", "Every artifact projection should remain public-safe."),
    check("receipt-route-coverage", [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => (routeManifest.publicApiRoutes || []).includes(route)), "medium", "Artifact museum audit should expose report, plan, and receipt history routes."),
    check("script-coverage", Boolean(packageManifest.scripts?.["audit:artifact-museum"]), "medium", `audit:artifact-museum=${Boolean(packageManifest.scripts?.["audit:artifact-museum"])}`),
  ];
}

function curatorPlan({ weakestProjects, collections, transcripts }) {
  return {
    collectionOrder: (collections.collections || []).slice(0, 5).map((collection, index) => ({
      step: index + 1,
      collectionId: collection.id,
      label: collection.label,
      score: collection.score,
    })),
    transcriptRepair: transcripts.comparison.commonRepair,
    priorityProjects: weakestProjects.map((project, index) => ({
      rank: index + 1,
      slug: project.slug,
      score: project.score,
      nextAction: project.nextAction,
    })),
    verificationCommand: "npm run check && node server.js # then open /api/artifact-museum",
  };
}

function routeCoverage({ routeManifest, refreshPlan }) {
  const requiredRoutes = ["/api/artifacts", "/api/artifact-collections", "/api/artifact-collections/:id", "/api/artifact-transcripts", "/api/artifact-transcripts/:slug", "/api/artifact-compare", "/api/artifact-replays", "/api/artifact-replays/:slug", "/api/artifact-museum", "/api/artifact-museum/plan", "/api/artifact-museum/history"];
  const declared = requiredRoutes.filter((route) => (routeManifest.publicApiRoutes || []).includes(route));
  const refreshRequired = ["/api/artifacts", "/api/artifact-transcripts", "/api/artifact-replays", "/api/artifact-museum"];
  const refreshCovered = refreshRequired.filter((route) => (refreshPlan.endpoints || []).includes(route));
  const score = Math.round((percent(declared.length, requiredRoutes.length) + percent(refreshCovered.length, refreshRequired.length)) / 2);
  return {
    score,
    detail: `${declared.length}/${requiredRoutes.length} artifact route(s) declared, ${refreshCovered.length}/${refreshRequired.length} refresh route(s) covered.`,
  };
}

function nextActionForProject({ project, artifacts, gaps, transcript, collectionCount, comparisonProjects }) {
  if (gaps[0]) return gaps[0].suggestedRepair;
  if (!transcript || transcript.status !== "ready") return transcript?.nextAction || `Create a transcript for ${project.title}.`;
  if (collectionCount < 2) return `Add ${project.title} to another artifact collection with a curator note.`;
  if (!comparisonProjects.has(project.slug)) return `Add ${project.title} to a public-safe artifact comparison path.`;
  if (artifacts.length < 5) return `Add one richer public-safe artifact for ${project.title}.`;
  return `Keep ${project.title} artifacts fresh after claim or media changes.`;
}

function membershipByArtifact(collections) {
  const membership = new Map();
  for (const collection of collections) {
    for (const artifact of collection.artifacts || []) {
      if (!membership.has(artifact.project)) membership.set(artifact.project, new Set());
      membership.get(artifact.project).add(collection.id);
    }
  }
  return membership;
}

function dimension({ id, label, score, weight, detail }) {
  const normalized = clamp(Math.round(score), 0, 100);
  return { id, label, score: normalized, band: bandFor(normalized), weight, detail };
}

function check(id, passed, severity, detail) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction: passed ? "Keep this artifact museum control current." : `Repair artifact museum control ${id}.`,
    verificationCommand: "npm run audit:artifact-museum",
  };
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

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 20;
  return Math.max(1, Math.min(Math.trunc(numeric), maxReceipts));
}

module.exports = {
  appendArtifactMuseumReceipt,
  artifactMuseumPlan,
  buildArtifactMuseumAudit,
  buildArtifactMuseumHistory,
  buildArtifactMuseumResponse,
  readArtifactMuseumReceipts,
};
