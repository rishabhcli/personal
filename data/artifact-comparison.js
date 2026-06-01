const ENDPOINT = "/api/artifact-compare";
const COMPACT_ARTIFACT_PREVIEW_LIMIT = 1;
const COMPACT_ARTIFACT_TYPE_PREVIEW_LIMIT = 2;
const COMPACT_NEXT_ACTION_PREVIEW_LIMIT = 1;

function compareProjectArtifacts({ leftSlug, rightSlug, projects, artifactCatalog, claims, detail = "summary" }) {
  const leftProject = projects.find((project) => project.slug === leftSlug) || projects[0];
  const rightProject = projects.find((project) => project.slug === rightSlug) || projects.find((project) => project.slug !== leftProject.slug) || projects[0];
  const left = artifactSummary(leftProject, artifactCatalog, claims);
  const right = artifactSummary(rightProject, artifactCatalog, claims);
  const sharedArtifactTypes = left.artifactTypes.filter((type) => right.artifactTypes.includes(type));
  const leftOnlyArtifactTypes = left.artifactTypes.filter((type) => !right.artifactTypes.includes(type));
  const rightOnlyArtifactTypes = right.artifactTypes.filter((type) => !left.artifactTypes.includes(type));
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const comparison = {
    sharedArtifactTypes,
    leftOnlyArtifactTypes,
    rightOnlyArtifactTypes,
    strongerProof: strongerProofSide(left, right),
    cleanerPublicSurface: cleanerSurfaceSide(left, right),
    gapDelta: left.gaps.length - right.gaps.length,
    confidenceDelta: left.averageConfidence - right.averageConfidence,
  };
  const fullDetailEndpoint = artifactCompareFullDetailEndpoint(left.slug, right.slug);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "public-artifact-comparison",
    detail: "full",
    compact: false,
    fullDetailEndpoint,
    sourceBoundary:
      "Artifact comparisons use public-safe artifact catalog and claim metadata. They do not imply missing screenshots/videos exist, and they do not load private files.",
    left,
    right,
    comparison,
    nextActions: nextActions(left, right),
    artifactComparePayloadPolicy: artifactComparePayloadPolicy({ left, right, fullDetail: true }),
  };
  if (fullDetail) return report;
  return {
    mode: report.mode,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    left: summarizeArtifactComparisonSide(left),
    right: summarizeArtifactComparisonSide(right),
    comparison: summarizeArtifactComparison(comparison),
    nextActions: report.nextActions.slice(0, COMPACT_NEXT_ACTION_PREVIEW_LIMIT).map((action) => ({
      actionAvailable: Boolean(action),
    })),
    artifactComparePayloadPolicy: artifactComparePayloadPolicy({ left, right, fullDetail: false }),
  };
}

function artifactSummary(project, artifactCatalog, claims) {
  const artifacts = (artifactCatalog.artifacts || []).filter((artifact) => artifact.project === project.slug);
  const gaps = (artifactCatalog.gaps || []).filter((gap) => gap.project === project.slug);
  const projectClaims = claims.filter((claim) => claim.relatedProject === project.slug);
  return {
    slug: project.slug,
    title: project.title,
    tier: project.tier,
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      mediaKind: artifact.mediaKind,
      proofStrength: artifact.proofStrength,
      privacyLevel: artifact.privacyLevel,
      approvalRequired: artifact.approvalRequired,
      url: artifact.url,
      command: artifact.command,
    })),
    artifactTypes: [...new Set(artifacts.map((artifact) => artifact.artifactType))].sort(),
    gaps: gaps.map((gap) => ({
      id: gap.id,
      gapType: gap.gapType,
      suggestedRepair: gap.suggestedRepair,
    })),
    averageConfidence: average(projectClaims.map((claim) => claim.confidenceScore)),
    needsSourceClaims: projectClaims.filter((claim) => claim.evidenceStrength === "needs-source").length,
    privateReferences: projectClaims.filter((claim) => claim.privacyLevel !== "public").length,
    approvalRequiredArtifacts: artifacts.filter((artifact) => artifact.approvalRequired).length,
  };
}

function strongerProofSide(left, right) {
  if (left.averageConfidence === right.averageConfidence) return "tie";
  return left.averageConfidence > right.averageConfidence ? left.slug : right.slug;
}

function cleanerSurfaceSide(left, right) {
  const leftRisk = left.needsSourceClaims + left.privateReferences + left.gaps.length + left.approvalRequiredArtifacts;
  const rightRisk = right.needsSourceClaims + right.privateReferences + right.gaps.length + right.approvalRequiredArtifacts;
  if (leftRisk === rightRisk) return "tie";
  return leftRisk < rightRisk ? left.slug : right.slug;
}

function nextActions(left, right) {
  return [left, right].flatMap((side) => {
    const actions = [];
    if (side.gaps[0]) actions.push(`${side.title}: ${side.gaps[0].suggestedRepair}`);
    if (side.needsSourceClaims) actions.push(`${side.title}: attach stronger evidence for ${side.needsSourceClaims} needs-source claim(s).`);
    if (side.privateReferences) actions.push(`${side.title}: approve or keep summary-only ${side.privateReferences} private reference(s).`);
    if (!actions.length) actions.push(`${side.title}: keep artifacts fresh and add richer media only when public-safe proof exists.`);
    return actions.slice(0, 2);
  });
}

function summarizeArtifactComparisonSide(side) {
  return {
    slug: side.slug,
    title: side.title,
    artifactCount: side.artifacts.length,
    artifactTypeCount: side.artifactTypes.length,
    artifactTypePreview: side.artifactTypes.slice(0, COMPACT_ARTIFACT_TYPE_PREVIEW_LIMIT),
    artifacts: side.artifacts.slice(0, COMPACT_ARTIFACT_PREVIEW_LIMIT).map(({ id, artifactType, approvalRequired }) => ({
      id,
      artifactType,
      approvalRequired: Boolean(approvalRequired),
    })),
    gapCount: side.gaps.length,
    averageConfidence: side.averageConfidence,
    needsSourceClaims: side.needsSourceClaims,
    privateReferences: side.privateReferences,
    approvalRequiredArtifacts: side.approvalRequiredArtifacts,
  };
}

function summarizeArtifactComparison(comparison) {
  return {
    sharedArtifactTypes: comparison.sharedArtifactTypes.slice(0, COMPACT_ARTIFACT_TYPE_PREVIEW_LIMIT),
    strongerProof: comparison.strongerProof,
    cleanerPublicSurface: comparison.cleanerPublicSurface,
    gapDelta: comparison.gapDelta,
    confidenceDelta: comparison.confidenceDelta,
  };
}

function artifactComparePayloadPolicy({ left, right, fullDetail }) {
  if (!fullDetail) {
    return {
      fullDetail,
      leftArtifacts: left.artifacts.length,
      rightArtifacts: right.artifacts.length,
      leftArtifactsReturned: Math.min(left.artifacts.length, COMPACT_ARTIFACT_PREVIEW_LIMIT),
      rightArtifactsReturned: Math.min(right.artifacts.length, COMPACT_ARTIFACT_PREVIEW_LIMIT),
    };
  }
  return {
    fullDetail,
    fullDetailEndpoint: artifactCompareFullDetailEndpoint(left.slug, right.slug),
    leftArtifacts: left.artifacts.length,
    rightArtifacts: right.artifacts.length,
    leftGaps: left.gaps.length,
    rightGaps: right.gaps.length,
    omittedFromSummaryCount: fullDetail ? 0 : 4,
  };
}

function artifactCompareFullDetailEndpoint(leftSlug, rightSlug) {
  return `${ENDPOINT}?left=${encodeURIComponent(leftSlug)}&right=${encodeURIComponent(rightSlug)}&detail=full`;
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

module.exports = {
  compareProjectArtifacts,
};
