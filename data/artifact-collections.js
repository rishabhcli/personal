const ENDPOINT = "/api/artifact-collections";

function buildArtifactCollections({ artifactCatalog, projects, claims }) {
  const available = (artifactCatalog.artifacts || []).filter((artifact) => artifact.sourceStatus === "available");
  const collections = [
    collection("proof-strongest", "Strongest proof artifacts", "proof", available.filter((artifact) => artifact.proofStrength !== "needs-source")),
    collection("audience-agent-infra", "Agent infrastructure artifacts", "audience", available.filter((artifact) => artifact.audience === "agent-infra")),
    collection("audience-research", "Research and accessibility artifacts", "audience", available.filter((artifact) => artifact.audience === "research")),
    collection(
      "media-replay",
      "Replayable API, terminal, and transcript artifacts",
      "media",
      available.filter((artifact) => ["api-replay", "terminal-replay", "terminal-transcript"].includes(artifact.artifactType)),
    ),
    collection("museum-captures", "Museum capture records", "capture", available.filter((artifact) => artifact.artifactType === "museum-capture")),
    collection("curator-annotations", "Curator annotation records", "annotation", available.filter((artifact) => artifact.artifactType === "curator-annotation")),
    collection("privacy-review", "Public-safe private-reference artifacts", "privacy", available.filter((artifact) => artifact.approvalRequired)),
    repairCollection({ artifactCatalog, projects, claims }),
  ].filter((item) => item.artifacts.length > 0 || item.gaps.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    mode: "artifact-museum-collections",
    sourceBoundary:
      "Collections group only public-safe artifact records and explicit gaps. They do not claim missing screenshots, videos, papers, awards, or private files exist.",
    summary: {
      collections: collections.length,
      artifacts: available.length,
      gaps: artifactCatalog.gaps.length,
      featuredArtifacts: new Set(collections.flatMap((item) => item.artifacts.map((artifact) => artifact.id))).size,
      repairItems: collections.find((item) => item.id === "repair-priority")?.gaps.length || 0,
    },
    collections,
  };
}

function buildArtifactCollectionsResponse(catalog, { detail = "summary", itemPreviewLimit = 1 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedLimit = Math.max(1, Math.min(Number(itemPreviewLimit) || 1, 12));
  if (fullDetail) {
    return {
      ...catalog,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      collectionPayloadPolicy: collectionPayloadPolicy({
        fullDetail,
        itemPreviewLimit: boundedLimit,
        collections: catalog.collections,
        returnedArtifacts: (catalog.collections || []).reduce((sum, collection) => sum + collection.artifacts.length, 0),
        returnedGaps: (catalog.collections || []).reduce((sum, collection) => sum + collection.gaps.length, 0),
      }),
    };
  }
  const collections = (catalog.collections || []).map((collection) => ({
    id: collection.id,
    score: collection.score,
    artifacts: collection.artifacts.length,
    gaps: collection.gaps.length,
    topArtifacts: collection.artifacts.slice(0, boundedLimit).map(summarizeCollectionArtifactIndex),
    topGaps: collection.gaps.slice(0, boundedLimit).map(summarizeCollectionGapIndex),
    pathCount: collection.suggestedPath.length,
  }));
  return {
    mode: catalog.mode,
    summary: summarizeArtifactCollectionsSummary(catalog.summary),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    collections,
    collectionPayloadPolicy: collectionPayloadPolicy({
      fullDetail,
      itemPreviewLimit: boundedLimit,
      collections: catalog.collections,
      returnedArtifacts: collections.reduce((sum, collection) => sum + collection.topArtifacts.length, 0),
      returnedGaps: collections.reduce((sum, collection) => sum + collection.topGaps.length, 0),
    }),
  };
}

function buildArtifactCollectionDetailResponse(collection, { detail = "summary", artifactPreviewLimit = 3, gapPreviewLimit = 3, pathPreviewLimit = 2 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedArtifactLimit = Math.max(1, Math.min(Number(artifactPreviewLimit) || 3, 12));
  const boundedGapLimit = Math.max(1, Math.min(Number(gapPreviewLimit) || 3, 12));
  const boundedPathLimit = Math.max(1, Math.min(Number(pathPreviewLimit) || 2, 6));
  if (fullDetail) {
    return {
      ...collection,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}/${collection.id}?detail=full`,
      collectionPayloadPolicy: collectionDetailPayloadPolicy({ collection, fullDetail }),
    };
  }

  return {
    id: collection.id,
    label: collection.label,
    axis: collection.axis,
    score: collection.score,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}/${collection.id}?detail=full`,
    curatorNoteAvailable: Boolean(collection.curatorNote),
    artifactSummary: summarizeCollectionArtifacts(collection.artifacts || []),
    gapSummary: summarizeCollectionGaps(collection.gaps || []),
    suggestedPathSummary: {
      total: (collection.suggestedPath || []).length,
      previewed: Math.min((collection.suggestedPath || []).length, boundedPathLimit),
    },
    artifacts: (collection.artifacts || []).slice(0, boundedArtifactLimit).map(summarizeCollectionArtifact),
    gaps: (collection.gaps || []).slice(0, boundedGapLimit).map(summarizeCollectionGap),
    suggestedPath: (collection.suggestedPath || []).slice(0, boundedPathLimit).map(({ step, artifactId }) => ({ step, artifactId })),
    collectionPayloadPolicy: collectionDetailPayloadPolicy({
      collection,
      fullDetail,
      artifactPreviewLimit: boundedArtifactLimit,
      gapPreviewLimit: boundedGapLimit,
      pathPreviewLimit: boundedPathLimit,
    }),
  };
}

function summarizeCollectionArtifact(artifact) {
  return {
    id: artifact.id,
    project: artifact.project,
    artifactType: artifact.artifactType,
    proofStrength: artifact.proofStrength,
    confidenceScore: artifact.confidenceScore,
    sourceTraceCount: (artifact.sourceTrace || []).length,
    hasUrl: Boolean(artifact.url),
    hasCommand: Boolean(artifact.command),
  };
}

function summarizeCollectionArtifacts(artifacts = []) {
  return {
    total: artifacts.length,
    availableUrls: artifacts.filter((artifact) => artifact.url).length,
    replayCommands: artifacts.filter((artifact) => artifact.command).length,
    approvalRequired: artifacts.filter((artifact) => artifact.approvalRequired).length,
    averageConfidence: average(artifacts.map((artifact) => artifact.confidenceScore || 0)),
  };
}

function summarizeCollectionGap(gap) {
  return {
    id: gap.id,
    project: gap.project,
    gapType: gap.gapType,
    priorityScore: gap.priorityScore || 0,
    sourceTraceCount: (gap.sourceTrace || []).length,
  };
}

function summarizeCollectionGaps(gaps = []) {
  return {
    total: gaps.length,
    highestPriority: gaps.length ? Math.max(...gaps.map((gap) => gap.priorityScore || 0)) : 0,
    sourceTraceCount: gaps.reduce((sum, gap) => sum + (gap.sourceTrace || []).length, 0),
  };
}

function summarizeCollectionArtifactIndex(artifact) {
  return {
    id: artifact.id,
    traces: (artifact.sourceTrace || []).length,
  };
}

function summarizeCollectionGapIndex(gap) {
  return {
    id: gap.id,
  };
}

function collectionPayloadPolicy({ fullDetail, itemPreviewLimit, collections, returnedArtifacts, returnedGaps }) {
  return {
    fullDetail,
    itemPreviewLimit,
    collectionsReturned: (collections || []).length,
    artifactsReturned: returnedArtifacts,
    gapsReturned: returnedGaps,
    totalArtifacts: fullDetail ? (collections || []).reduce((sum, collection) => sum + collection.artifacts.length, 0) : undefined,
    totalGaps: fullDetail ? (collections || []).reduce((sum, collection) => sum + collection.gaps.length, 0) : undefined,
    fullDetailEndpoint: fullDetail ? `${ENDPOINT}?detail=full` : undefined,
  };
}

function summarizeArtifactCollectionsSummary(summary = {}) {
  return {
    collections: summary.collections || 0,
    artifacts: summary.artifacts || 0,
    gaps: summary.gaps || 0,
    repairItems: summary.repairItems || 0,
  };
}

function collectionDetailPayloadPolicy({ collection, fullDetail, artifactPreviewLimit = collection.artifacts?.length || 0, gapPreviewLimit = collection.gaps?.length || 0, pathPreviewLimit = collection.suggestedPath?.length || 0 }) {
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
      artifactPreviewLimit,
      gapPreviewLimit,
      pathPreviewLimit,
      artifactsAvailable: collection.artifacts?.length || 0,
      gapsAvailable: collection.gaps?.length || 0,
    };
  }
  return {
    fullDetail,
    artifactsReturned: collection.artifacts?.length || 0,
    gapsReturned: collection.gaps?.length || 0,
    fullDetailEndpoint: `${ENDPOINT}/${collection.id}?detail=full`,
    omittedFromSummary: [],
  };
}

function selectArtifactCollection(value, catalog) {
  const normalized = String(value || "").toLowerCase().trim();
  return catalog.collections.find((collection) => collection.id === normalized) || null;
}

function collection(id, label, axis, artifacts) {
  const sorted = artifacts
    .slice()
    .sort((left, right) => right.confidenceScore - left.confidenceScore || left.projectTitle.localeCompare(right.projectTitle));
  return {
    id,
    label,
    axis,
    artifacts: sorted.slice(0, 12).map(projectArtifact),
    gaps: [],
    score: collectionScore(sorted, []),
    curatorNote: curatorNoteFor({ id, artifacts: sorted, gaps: [] }),
    suggestedPath: sorted.slice(0, 4).map((artifact, index) => ({
      step: index + 1,
      artifactId: artifact.id,
      label: artifact.label,
      reason: reasonForArtifact(artifact),
    })),
  };
}

function repairCollection({ artifactCatalog, projects, claims }) {
  const projectScores = new Map(projects.map((project) => [project.slug, project.score]));
  const claimCounts = new Map();
  claims.forEach((claim) => claimCounts.set(claim.relatedProject, (claimCounts.get(claim.relatedProject) || 0) + 1));
  const gaps = (artifactCatalog.gaps || [])
    .map((gap) => ({
      id: gap.id,
      project: gap.project,
      projectTitle: gap.projectTitle,
      gapType: gap.gapType,
      label: gap.label,
      neededArtifact: gap.neededArtifact,
      suggestedRepair: gap.suggestedRepair,
      priorityScore: (projectScores.get(gap.project) || 50) + (claimCounts.get(gap.project) || 0) * 2,
      sourceTrace: gap.sourceTrace,
    }))
    .sort((left, right) => right.priorityScore - left.priorityScore || left.projectTitle.localeCompare(right.projectTitle));

  return {
    id: "repair-priority",
    label: "Artifact repair priority",
    axis: "repair",
    artifacts: [],
    gaps: gaps.slice(0, 12),
    score: collectionScore([], gaps),
    curatorNote: curatorNoteFor({ id: "repair-priority", artifacts: [], gaps }),
    suggestedPath: gaps.slice(0, 4).map((gap, index) => ({
      step: index + 1,
      artifactId: gap.id,
      label: gap.label,
      reason: `${gap.projectTitle} has a high-signal missing ${gap.neededArtifact}.`,
    })),
  };
}

function projectArtifact(artifact) {
  return {
    id: artifact.id,
    project: artifact.project,
    projectTitle: artifact.projectTitle,
    artifactType: artifact.artifactType,
    mediaKind: artifact.mediaKind,
    label: artifact.label,
    url: artifact.url,
    command: artifact.command,
    audience: artifact.audience,
    proofStrength: artifact.proofStrength,
    privacyLevel: artifact.privacyLevel,
    approvalRequired: artifact.approvalRequired,
    confidenceScore: artifact.confidenceScore,
    sourceTrace: artifact.sourceTrace,
  };
}

function collectionScore(artifacts, gaps) {
  if (!artifacts.length && !gaps.length) return 0;
  if (gaps.length && !artifacts.length) return Math.max(0, 100 - Math.min(80, gaps.length * 8));
  const averageConfidence = average(artifacts.map((artifact) => artifact.confidenceScore));
  const proofBoost = Math.round((artifacts.filter((artifact) => artifact.proofStrength !== "needs-source").length / artifacts.length) * 15);
  const gapPenalty = Math.min(35, gaps.length * 5);
  return clamp(averageConfidence + proofBoost - gapPenalty, 0, 100);
}

function curatorNoteFor({ id, artifacts, gaps }) {
  if (id === "repair-priority") return `${gaps.length} missing artifact(s) should be repaired before this museum claims full media coverage.`;
  if (id === "curator-annotations") return "Curator annotations turn each project into a safer museum entry by pairing display guidance with explicit media gaps.";
  if (id === "museum-captures") return "Museum capture records prove each project has an inspectable public-safe audit path before richer media is claimed.";
  if (id === "privacy-review") return "These artifacts are public-safe private references; keep summaries unless the local approval workflow allows stronger projection.";
  if (id === "media-replay") return "Replay artifacts are useful for agents because they can be verified through API routes or terminal commands.";
  return `${artifacts.length} artifact(s) grouped for faster proof inspection.`;
}

function reasonForArtifact(artifact) {
  if (artifact.command) return `Replay with terminal command ${artifact.command}.`;
  if (artifact.url) return `Inspect public-safe URL ${artifact.url}.`;
  return `${artifact.label} stays public-safe under ${artifact.privacyLevel}.`;
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  buildArtifactCollectionDetailResponse,
  buildArtifactCollections,
  buildArtifactCollectionsResponse,
  selectArtifactCollection,
};
