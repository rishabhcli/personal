const TRANSCRIPT_DIRECTORY_PREVIEW_LIMIT = 5;
const SELECTED_LINE_PREVIEW_KINDS = ["command", "summary", "boundary"];

function buildArtifactTranscriptLibrary({ projects, claims, artifactCatalog }) {
  const transcripts = projects.map((project) =>
    transcriptForProject({
      project,
      claims: claims.filter((claim) => claim.relatedProject === project.slug),
      artifacts: (artifactCatalog.artifacts || []).filter((artifact) => artifact.project === project.slug),
      gaps: (artifactCatalog.gaps || []).filter((gap) => gap.project === project.slug),
    }),
  );
  const sorted = transcripts.slice().sort((left, right) => right.transcriptScore - left.transcriptScore || left.projectTitle.localeCompare(right.projectTitle));

  return {
    generatedAt: new Date().toISOString(),
    mode: "public-artifact-transcript-library",
    sourceBoundary:
      "Transcripts are generated from public-safe local project, claim, artifact, and gap records. They are replayable evidence summaries, not raw shell history, private logs, production traces, or proof that an external command was executed.",
    summary: {
      projects: projects.length,
      transcripts: transcripts.length,
      publicSafeTranscripts: transcripts.filter((transcript) => transcript.publicSafe).length,
      averageTranscriptScore: average(transcripts.map((transcript) => transcript.transcriptScore)),
      readyTranscripts: transcripts.filter((transcript) => transcript.status === "ready").length,
      reviewTranscripts: transcripts.filter((transcript) => transcript.status === "review").length,
      weakTranscripts: transcripts.filter((transcript) => transcript.status === "weak").length,
      totalLines: transcripts.reduce((sum, transcript) => sum + transcript.lines.length, 0),
    },
    comparison: {
      strongest: sorted.slice(0, 5).map(transcriptSummary),
      weakest: sorted.slice(-5).reverse().map(transcriptSummary),
      scoreSpread: sorted.length ? sorted[0].transcriptScore - sorted[sorted.length - 1].transcriptScore : 0,
      commonRepair: commonRepair(transcripts),
    },
    transcripts,
  };
}

function selectArtifactTranscript(value, library) {
  const slug = String(value || "").toLowerCase().trim();
  return library.transcripts.find((transcript) => transcript.project === slug || transcript.id === `${slug}.terminal-transcript`) || null;
}

function buildArtifactTranscriptLibraryResponse(library, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...library,
      detail: "full",
      fullDetailEndpoint: "/api/artifact-transcripts?detail=full",
      transcriptPayloadPolicy: transcriptPayloadPolicy({ fullDetail, transcripts: library.transcripts || [] }),
    };
  }

  return {
    generatedAt: library.generatedAt,
    mode: library.mode,
    detail: "summary",
    fullDetailEndpoint: "/api/artifact-transcripts?detail=full",
    sourceBoundaryAvailable: Boolean(library.sourceBoundary),
    summary: library.summary,
    comparison: summarizeTranscriptComparison(library.comparison),
    transcripts: (library.transcripts || [])
      .slice()
      .sort((left, right) => right.transcriptScore - left.transcriptScore || left.project.localeCompare(right.project))
      .slice(0, TRANSCRIPT_DIRECTORY_PREVIEW_LIMIT)
      .map(summarizeArtifactTranscript),
    transcriptPayloadPolicy: transcriptPayloadPolicy({ fullDetail, transcripts: library.transcripts || [] }),
  };
}

function buildArtifactTranscriptDetailResponse(transcript, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...transcript,
      detail: "full",
      fullDetailEndpoint: selectedTranscriptFullDetailEndpoint(transcript),
      transcriptPayloadPolicy: selectedTranscriptPayloadPolicy({ fullDetail, transcript }),
    };
  }

  return {
    id: transcript.id,
    project: transcript.project,
    projectTitle: transcript.projectTitle,
    artifactType: transcript.artifactType,
    mediaKind: transcript.mediaKind,
    detail: "summary",
    fullDetailEndpoint: selectedTranscriptFullDetailEndpoint(transcript),
    publicProjection: transcript.publicProjection,
    publicSafe: transcript.publicSafe,
    transcriptScore: transcript.transcriptScore,
    status: transcript.status,
    confidenceScore: transcript.confidenceScore,
    proofStrength: transcript.proofStrength,
    lineCount: transcript.lineCount,
    linePreview: summarizeTranscriptLines(transcript),
    sourceTraceCount: (transcript.sourceTrace || []).length,
    caveatCount: (transcript.caveats || []).length,
    nextActionAvailable: Boolean(transcript.nextAction),
    transcriptPayloadPolicy: selectedTranscriptPayloadPolicy({ fullDetail, transcript }),
  };
}

function summarizeArtifactTranscript(transcript) {
  return {
    project: transcript.project,
    artifactType: transcript.artifactType,
    transcriptScore: transcript.transcriptScore,
    status: transcript.status,
    lineCount: transcript.lineCount,
  };
}

function summarizeTranscriptComparison(comparison = {}) {
  return {
    strongest: (comparison.strongest || []).slice(0, 3).map(summarizeTranscriptScoreRow),
    weakest: (comparison.weakest || []).slice(0, 3).map(summarizeTranscriptScoreRow),
    scoreSpread: comparison.scoreSpread || 0,
    commonRepairAvailable: Boolean(comparison.commonRepair),
  };
}

function summarizeTranscriptScoreRow(transcript = {}) {
  return {
    project: transcript.project,
    transcriptScore: transcript.transcriptScore,
    status: transcript.status,
    lineCount: transcript.lineCount,
  };
}

function transcriptPayloadPolicy({ fullDetail, transcripts }) {
  return {
    fullDetail,
    totalTranscripts: transcripts.length,
    previewedTranscripts: fullDetail ? transcripts.length : Math.min(transcripts.length, TRANSCRIPT_DIRECTORY_PREVIEW_LIMIT),
    fullDetailEndpoint: "/api/artifact-transcripts?detail=full",
    defaultTranscriptFields: fullDetail ? "full" : "compact-directory",
    selectedTranscriptEndpointTemplate: "/api/artifact-transcripts/:project",
  };
}

function selectedTranscriptPayloadPolicy({ fullDetail, transcript }) {
  const lines = transcript.lines || [];
  return {
    fullDetail,
    fullDetailEndpoint: selectedTranscriptFullDetailEndpoint(transcript),
    defaultTranscriptFields: fullDetail ? "full" : "metadata, score, counts, line-preview",
    linePreviewKinds: fullDetail ? "all" : SELECTED_LINE_PREVIEW_KINDS.join(","),
    fullLineCount: lines.length,
    sourceTraceCount: (transcript.sourceTrace || []).length,
  };
}

function summarizeTranscriptLines(transcript) {
  const lines = transcript.lines || [];
  return SELECTED_LINE_PREVIEW_KINDS.map((kind) => lines.find((line) => line.kind === kind)).filter(Boolean);
}

function selectedTranscriptFullDetailEndpoint(transcript) {
  return `/api/artifact-transcripts/${transcript.project}?detail=full`;
}

function transcriptForProject({ project, claims, artifacts, gaps }) {
  const strongClaims = claims.filter((claim) => claim.evidenceStrength === "link-backed" || claim.evidenceStrength === "source-backed");
  const weakClaims = claims.filter((claim) => claim.evidenceStrength === "needs-source");
  const privateClaims = claims.filter((claim) => claim.privacyLevel !== "public");
  const staleClaims = claims.filter((claim) => claim.freshnessScore < 55);
  const confidenceScore = average(claims.map((claim) => claim.confidenceScore)) || project.score;
  const caveats = [
    ...weakClaims.slice(0, 2).map((claim) => claim.suggestedRepair),
    ...(privateClaims.length ? [`${privateClaims.length} private reference(s) stay public-safe summaries.`] : []),
    ...(staleClaims.length ? [`${staleClaims.length} stale claim(s) need freshness review.`] : []),
    ...gaps.slice(0, 1).map((gap) => gap.suggestedRepair),
  ];
  const transcriptScore = clamp(Math.round(confidenceScore + strongClaims.length * 3 + artifacts.length * 2 - caveats.length * 6), 0, 100);
  const status = transcriptScore >= 82 && !weakClaims.length ? "ready" : transcriptScore >= 60 ? "review" : "weak";

  return {
    id: `${project.slug}.terminal-transcript`,
    project: project.slug,
    projectTitle: project.title,
    artifactType: "terminal-transcript",
    mediaKind: "terminal-text",
    command: `evidence ${project.slug}`,
    replayUrl: `/api/artifact-transcripts/${project.slug}`,
    publicProjection: project.visibility.toLowerCase().includes("private") ? "public-safe-summary" : "public",
    publicSafe: true,
    transcriptScore,
    status,
    confidenceScore,
    proofStrength: strongest(claims.map((claim) => claim.evidenceStrength)),
    lineCount: transcriptLines({ project, claims, artifacts, gaps, caveats, confidenceScore }).length,
    lines: transcriptLines({ project, claims, artifacts, gaps, caveats, confidenceScore }),
    sourceTrace: [
      source("project-record", `${project.title} structured record`, { id: project.slug }),
      source("terminal-command", "Evidence command transcript", { command: `evidence ${project.slug}` }),
      ...claims.slice(0, 4).map((claim) => source("claim", claim.text, { id: claim.id, evidenceStrength: claim.evidenceStrength })),
      ...artifacts.slice(0, 3).map((artifact) => source("artifact", artifact.label, { id: artifact.id, artifactType: artifact.artifactType })),
    ],
    caveats: caveats.length ? caveats : ["No major transcript caveat detected by the current public-safe artifact model."],
    nextAction: caveats[0] || `Keep ${project.title} transcript fresh when evidence, claims, or artifacts change.`,
    verificationCommand: `npm run check && node server.js # then open /api/artifact-transcripts/${project.slug}`,
  };
}

function transcriptLines({ project, claims, artifacts, gaps, caveats, confidenceScore }) {
  const topClaims = claims.slice().sort((left, right) => right.confidenceScore - left.confidenceScore).slice(0, 3);
  const topArtifacts = artifacts
    .slice()
    .sort((left, right) => artifactPriority(left.artifactType) - artifactPriority(right.artifactType) || right.confidenceScore - left.confidenceScore)
    .slice(0, 4);
  return [
    line("command", `$ evidence ${project.slug}`),
    line("summary", `${project.title} :: ${project.kind} :: confidence ${confidenceScore}/100`),
    line("outcome", project.outcome),
    ...topClaims.map((claim) => line("claim", `${claim.id} :: ${claim.evidenceStrength} :: ${truncate(claim.text, 150)}`)),
    ...topArtifacts.map((artifact) =>
      line("artifact", `${artifact.id} :: ${artifact.artifactType} :: ${artifact.url || artifact.command || artifact.mediaKind}`),
    ),
    ...(gaps[0] ? [line("gap", `${gaps[0].id} :: ${gaps[0].neededArtifact} :: ${gaps[0].suggestedRepair}`)] : []),
    line("caveat", caveats[0] || "No major caveat detected by the current artifact transcript model."),
    line("boundary", "Generated from public-safe local evidence; not raw shell history or a private terminal log."),
  ];
}

function transcriptSummary(transcript) {
  return {
    id: transcript.id,
    project: transcript.project,
    projectTitle: transcript.projectTitle,
    transcriptScore: transcript.transcriptScore,
    status: transcript.status,
    lineCount: transcript.lines.length,
    nextAction: transcript.nextAction,
  };
}

function commonRepair(transcripts) {
  const weak = transcripts.find((transcript) => transcript.status === "weak" || transcript.status === "review");
  if (!weak) return "Keep transcript artifacts fresh when claims, artifacts, or screenshots change.";
  return weak.nextAction;
}

function line(kind, text) {
  return { kind, text };
}

function source(type, label, extra = {}) {
  return { type, label, ...extra };
}

function artifactPriority(type) {
  return {
    "terminal-transcript": 0,
    "api-replay": 1,
    "terminal-replay": 2,
    "curator-annotation": 3,
    "museum-capture": 4,
    "repo-link": 5,
    "live-demo-link": 6,
    "generated-preview": 7,
  }[type] ?? 99;
}

function strongest(values) {
  if (values.includes("link-backed")) return "link-backed";
  if (values.includes("source-backed")) return "source-backed";
  return "needs-source";
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  buildArtifactTranscriptLibrary,
  buildArtifactTranscriptDetailResponse,
  buildArtifactTranscriptLibraryResponse,
  selectArtifactTranscript,
};
