function buildArtifactCatalog({ projects, claims }) {
  const artifacts = projects.flatMap((project) => artifactsForProject(project, claimsForProject(claims, project.slug)));
  const gaps = projects.flatMap((project) => artifactGapsForProject(project));
  const counts = {
    projects: projects.length,
    artifacts: artifacts.length,
    availableArtifacts: artifacts.filter((artifact) => artifact.sourceStatus === "available").length,
    generatedPreviews: artifacts.filter((artifact) => artifact.artifactType === "generated-preview").length,
    apiReplays: artifacts.filter((artifact) => artifact.artifactType === "api-replay").length,
    terminalReplays: artifacts.filter((artifact) => artifact.artifactType === "terminal-replay").length,
    terminalTranscripts: artifacts.filter((artifact) => artifact.artifactType === "terminal-transcript").length,
    museumCaptures: artifacts.filter((artifact) => artifact.artifactType === "museum-capture").length,
    curatorAnnotations: artifacts.filter((artifact) => artifact.artifactType === "curator-annotation").length,
    gapClosurePlans: artifacts.filter((artifact) => artifact.artifactType === "gap-closure-plan").length,
    approvalRequired: artifacts.filter((artifact) => artifact.approvalRequired).length,
    screenshotGaps: gaps.filter((gap) => gap.gapType === "screenshot").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    mode: "public-artifact-catalog",
    sourceBoundary:
      "This catalog lists only public-safe generated previews, links, API replays, terminal replays, museum capture records, and explicitly marked media gaps. It does not claim screenshots, videos, or live recordings exist unless the repo can serve or replay them.",
    counts,
    artifacts,
    gaps,
  };
}

function buildArtifactCatalogResponse(catalog, { detail = "summary" } = {}) {
  const normalizedDetail = String(detail || "summary").toLowerCase();
  const fullDetail = normalizedDetail === "full";
  const uiDetail = normalizedDetail === "ui";
  const topLevelPreviewLimit = uiDetail ? 9 : 4;
  const projectSummaryLimit = uiDetail ? Number.POSITIVE_INFINITY : 6;
  const projectPreviewLimit = uiDetail ? 2 : 0;
  const projectTypePreviewLimit = uiDetail ? 5 : 0;
  const gapPreviewLimit = uiDetail ? 6 : 1;
  if (fullDetail) {
    return {
      ...catalog,
      detail: "full",
      compact: false,
      summaryEndpoint: "/api/artifacts",
    };
  }
  const projectSummaries = summarizeArtifactProjects(catalog.artifacts || [], {
    projectPreviewLimit,
    projectTypePreviewLimit,
    includePreviewProject: uiDetail,
    includePreviewAccessFlags: uiDetail,
  });

  return {
    generatedAt: uiDetail ? catalog.generatedAt : undefined,
    mode: catalog.mode,
    detail: uiDetail ? "ui" : "summary",
    compact: true,
    sourceBoundary: uiDetail
      ? "This UI catalog keeps public-safe artifact previews and access flags for rendering. Full traces and policy prose remain at /api/artifacts?detail=full."
      : undefined,
    counts: uiDetail ? catalog.counts : summarizeArtifactCounts(catalog.counts),
    evidenceAccess: {
      fullDetailEndpoint: "/api/artifacts?detail=full",
      uiDetailEndpoint: "/api/artifacts?detail=ui",
    },
    projectSummary: uiDetail ? undefined : summarizeArtifactProjectSummary(projectSummaries, { compact: true }),
    projects: uiDetail ? projectSummaries : projectSummaries.slice(0, projectSummaryLimit).map(summarizeArtifactProjectRow),
    artifactTypes: summarizeArtifactTypes(catalog.artifacts || [], { includeMediaKinds: uiDetail, countOnly: !uiDetail }),
    sourceTraceTypes: uiDetail ? summarizeSourceTraceTypes(catalog) : undefined,
    sourceTraceSummary: uiDetail ? undefined : summarizeSourceTraceSummary(catalog),
    artifactDefaults: {
      sourceTraceMode: "count-only",
      gapPreviewLimit,
      omittedFromRowsAvailable: uiDetail ? true : undefined,
    },
    artifactPayloadPolicy: artifactPayloadPolicy({
      catalog,
      uiDetail,
      topLevelPreviewLimit,
      projectSummaryLimit,
      projectPreviewLimit,
      projectTypePreviewLimit,
      gapPreviewLimit,
      returnedProjects: Math.min(projectSummaries.length, projectSummaryLimit),
    }),
    artifacts: selectCatalogArtifactPreview(catalog.artifacts || [], topLevelPreviewLimit).map((artifact) =>
      summarizeArtifact(artifact, { includeProject: uiDetail, includeAccessFlags: uiDetail }),
    ),
    gaps: (catalog.gaps || []).slice(0, gapPreviewLimit).map((gap) => summarizeArtifactGap(gap, { compact: !uiDetail })),
  };
}

function summarizeArtifactCounts(counts = {}) {
  return {
    projects: counts.projects || 0,
    artifacts: counts.artifacts || 0,
    terminalTranscripts: counts.terminalTranscripts || 0,
    museumCaptures: counts.museumCaptures || 0,
    curatorAnnotations: counts.curatorAnnotations || 0,
    screenshotGaps: counts.screenshotGaps || 0,
  };
}

function summarizeArtifactProjects(
  artifacts,
  { projectPreviewLimit = 1, projectTypePreviewLimit = 5, includePreviewProject = false, includePreviewAccessFlags = false } = {},
) {
  const projects = new Map();
  for (const artifact of artifacts) {
    if (projects.has(artifact.project)) continue;
    projects.set(artifact.project, {
      id: artifact.project,
      approvalRequired: Boolean(artifact.approvalRequired),
      artifactCount: 0,
      artifactTypes: new Set(),
      artifactPreview: [],
    });
  }
  for (const artifact of artifacts) {
    const project = projects.get(artifact.project);
    if (!project) continue;
    project.artifactCount += 1;
    project.artifactTypes.add(artifact.artifactType);
    if (project.artifactPreview.length < projectPreviewLimit) {
      project.artifactPreview.push(
        summarizeArtifact(artifact, {
          includeProject: includePreviewProject,
          includeAccessFlags: includePreviewAccessFlags,
        }),
      );
    }
  }
  return [...projects.values()].map((project) => compactObject({
    id: project.id,
    approvalRequired: project.approvalRequired ? true : undefined,
    artifactCount: project.artifactCount,
    artifactTypeCount: project.artifactTypes.size,
    artifactTypesPreview: projectTypePreviewLimit ? [...project.artifactTypes].slice(0, projectTypePreviewLimit) : undefined,
    artifactPreview: projectPreviewLimit ? project.artifactPreview : undefined,
  }));
}

function summarizeArtifactTypes(artifacts, { includeMediaKinds = false, countOnly = false } = {}) {
  return [...artifacts.reduce((types, artifact) => {
    if (!types.has(artifact.artifactType)) {
      types.set(artifact.artifactType, {
        id: artifact.artifactType,
        mediaKinds: new Set(),
        count: 0,
      });
    }
    const type = types.get(artifact.artifactType);
    type.count += 1;
    type.mediaKinds.add(artifact.mediaKind);
    return types;
  }, new Map()).values()].map((type) => compactObject({
    id: type.id,
    mediaKinds: includeMediaKinds ? [...type.mediaKinds] : undefined,
    count: countOnly ? undefined : type.count,
  }));
}

function summarizeArtifactProjectSummary(projects, { compact = false } = {}) {
  if (compact) {
    return {
      total: projects.length,
    };
  }
  return {
    total: projects.length,
    approvalRequired: projects.filter((project) => project.approvalRequired).length,
    artifactCount: projects.reduce((sum, project) => sum + project.artifactCount, 0),
  };
}

function summarizeArtifactProjectRow(project) {
  return {
    id: project.id,
    artifactTypeCount: project.artifactTypeCount,
  };
}

function artifactPayloadPolicy({ catalog, uiDetail, topLevelPreviewLimit, projectSummaryLimit, projectPreviewLimit, projectTypePreviewLimit, gapPreviewLimit, returnedProjects }) {
  if (!uiDetail) {
    return {
      fullDetail: false,
      fullDetailAvailable: true,
      totalGaps: catalog.gaps?.length || 0,
    };
  }
  return {
    fullDetail: false,
    fullDetailEndpoint: "/api/artifacts?detail=full",
    topLevelPreviewLimit,
    projectPreviewLimit,
    projectTypePreviewLimit,
    gapPreviewLimit,
    totalArtifacts: catalog.counts.artifacts,
    totalGaps: catalog.gaps?.length || 0,
    returnedGaps: Math.min(catalog.gaps?.length || 0, gapPreviewLimit),
    previewProfile: "ui",
    projectPreview: "two public-safe preview artifacts per project with type counts",
  };
}

function summarizeArtifact(artifact, { includeProject = true, includeAccessFlags = true } = {}) {
  const sourceTrace = artifact.sourceTrace || [];
  const summary = {
    id: artifact.id,
    artifactType: artifact.artifactType,
    sourceTraceCount: sourceTrace.length,
  };
  if (includeProject) summary.project = artifact.project;
  if (includeAccessFlags && artifact.url) summary.hasUrl = true;
  if (includeAccessFlags && artifact.command) summary.hasCommand = true;
  if (artifact.sourceStatus !== "available") summary.sourceStatus = artifact.sourceStatus;
  if (includeAccessFlags && artifact.annotation?.displayGuidance) summary.hasAnnotationGuidance = true;
  if (includeAccessFlags && artifact.annotation?.gapRecord) summary.hasGapRecord = true;
  const policies = [
    artifact.capturePolicy ? "capture" : null,
    artifact.annotationPolicy ? "annotation" : null,
    artifact.gapClosurePolicy ? "gap-closure" : null,
  ].filter(Boolean);
  if (includeAccessFlags && policies.length) summary.policies = policies;
  return summary;
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function selectCatalogArtifactPreview(artifacts, limit) {
  const selected = [];
  const selectedIds = new Set();
  const add = (artifact) => {
    if (!artifact || selectedIds.has(artifact.id) || selected.length >= limit) return;
    selected.push(artifact);
    selectedIds.add(artifact.id);
  };
  const priorityTypes = [
    "generated-preview",
    "api-replay",
    "terminal-replay",
    "terminal-transcript",
    "museum-capture",
    "curator-annotation",
    "gap-closure-plan",
    "repo-link",
    "live-demo-link",
  ];
  for (const type of priorityTypes) add(artifacts.find((artifact) => artifact.artifactType === type));
  for (const artifact of artifacts) add(artifact);
  return selected;
}

function summarizeArtifactGap(gap, { compact = false } = {}) {
  if (compact) {
    return {
      id: gap.id,
      gapType: gap.gapType,
    };
  }
  const sourceTrace = gap.sourceTrace || [];
  return {
    id: gap.id,
    project: gap.project,
    gapType: gap.gapType,
    sourceStatus: gap.sourceStatus,
    sourceTraceCount: sourceTrace.length,
  };
}

function summarizeSourceTraceTypes(catalog) {
  const types = new Map();
  for (const item of [...(catalog.artifacts || []), ...(catalog.gaps || [])]) {
    for (const trace of item.sourceTrace || []) {
      if (!trace.type) continue;
      types.set(trace.type, (types.get(trace.type) || 0) + 1);
    }
  }
  return [...types.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([type, count]) => ({ type, count }));
}

function summarizeSourceTraceSummary(catalog) {
  const types = summarizeSourceTraceTypes(catalog);
  return {
    totalTypes: types.length,
    projectRecordAvailable: types.some((source) => source.type === "project-record"),
  };
}

function artifactsForProject(project, projectClaims) {
  const proofStrength = strongest(projectClaims.map((claim) => claim.evidenceStrength));
  const confidenceScore = average(projectClaims.map((claim) => claim.confidenceScore));
  const privacyLevel = privacyFor(project);
  const approvalRequired = privacyLevel !== "public";
  const base = {
    project: project.slug,
    projectTitle: project.title,
    audience: audienceFor(project),
    year: latestYear(project.timeline),
    proofStrength,
    privacyLevel,
    approvalRequired,
    publicProjection: approvalRequired ? "public-safe-summary" : "public",
    confidenceScore,
    publicSafe: true,
  };

  const artifacts = [
    {
      ...base,
      id: `${project.slug}.generated-preview`,
      artifactType: "generated-preview",
      mediaKind: "svg-card",
      label: `${project.title} generated preview`,
      url: `/api/og/${project.slug}.svg`,
      command: null,
      sourceStatus: "available",
      sourceTrace: [
        source("project-record", `${project.title} structured record`, { id: project.slug }),
        source("api-route", "Generated SVG preview route", { url: `/api/og/${project.slug}.svg` }),
      ],
    },
    {
      ...base,
      id: `${project.slug}.case-study-replay`,
      artifactType: "api-replay",
      mediaKind: "json",
      label: `${project.title} case-study replay`,
      url: `/api/case-study/${project.slug}`,
      command: null,
      sourceStatus: "available",
      sourceTrace: [
        source("project-record", `${project.title} structured record`, { id: project.slug }),
        ...projectClaims.slice(0, 3).map((claim) => source("claim", claim.text, { id: claim.id })),
        source("api-route", "Case-study API route", { url: `/api/case-study/${project.slug}` }),
      ],
    },
    {
      ...base,
      id: `${project.slug}.terminal-evidence`,
      artifactType: "terminal-replay",
      mediaKind: "terminal-command",
      label: `${project.title} evidence terminal replay`,
      url: null,
      command: `evidence ${project.slug}`,
      sourceStatus: "available",
      sourceTrace: [
        source("project-record", `${project.title} structured record`, { id: project.slug }),
        source("terminal-command", "Evidence command", { command: `evidence ${project.slug}` }),
      ],
    },
    {
      ...base,
      id: `${project.slug}.terminal-transcript`,
      artifactType: "terminal-transcript",
      mediaKind: "terminal-text",
      label: `${project.title} evidence transcript`,
      url: `/api/artifact-transcripts/${project.slug}`,
      command: `evidence ${project.slug}`,
      sourceStatus: "available",
      sourceTrace: [
        source("project-record", `${project.title} structured record`, { id: project.slug }),
        source("terminal-command", "Evidence command transcript", { command: `evidence ${project.slug}` }),
        ...projectClaims.slice(0, 3).map((claim) => source("claim", claim.text, { id: claim.id })),
        source("api-route", "Artifact transcript route", { url: `/api/artifact-transcripts/${project.slug}` }),
      ],
    },
    {
      ...base,
      id: `${project.slug}.museum-capture`,
      artifactType: "museum-capture",
      mediaKind: "audit-record",
      label: `${project.title} museum capture record`,
      url: "/api/artifact-museum",
      command: "artifact-museum",
      sourceStatus: "available",
      capturePolicy:
        "This artifact captures the public-safe museum readiness record for the project; it is not a screenshot, video, private file, or raw production trace.",
      sourceTrace: [
        source("project-record", `${project.title} structured record`, { id: project.slug }),
        source("api-route", "Artifact museum audit route", { url: "/api/artifact-museum" }),
        source("terminal-command", "Artifact museum command", { command: "artifact-museum" }),
      ],
    },
    {
      ...base,
      id: `${project.slug}.curator-annotation`,
      artifactType: "curator-annotation",
      mediaKind: "museum-note",
      label: `${project.title} curator annotation`,
      url: "/api/artifact-museum",
      command: "artifact-museum",
      sourceStatus: "available",
      annotationPolicy:
        "This artifact is a public-safe curatorial note for the museum; it is not a screenshot, video, private file, endorsement, or external usage claim.",
      annotation: {
        displayGuidance: annotationGuidanceFor(project),
        primaryCaveat:
          approvalRequired
            ? "Keep raw private material out of the public museum unless the local approval workflow changes projection."
            : "Keep the annotation tied to inspectable public-safe records instead of claiming richer media exists.",
        gapRecord: `${project.slug}.screenshot-gap`,
        verificationCommand: "npm run audit:artifact-museum",
      },
      sourceTrace: [
        source("project-record", `${project.title} structured record`, { id: project.slug }),
        source("api-route", "Artifact museum audit route", { url: "/api/artifact-museum" }),
        source("terminal-command", "Artifact museum command", { command: "artifact-museum" }),
        source("gap-record", `${project.title} screenshot gap`, { id: `${project.slug}.screenshot-gap` }),
      ],
    },
    {
      ...base,
      id: `${project.slug}.gap-closure-plan`,
      artifactType: "gap-closure-plan",
      mediaKind: "repair-plan",
      label: `${project.title} screenshot gap closure plan`,
      url: `/api/artifact-replays/${project.slug}`,
      command: `artifact-replays ${project.slug}`,
      sourceStatus: "available",
      gapClosurePolicy:
        "This artifact makes the missing screenshot replayable as a public-safe repair plan. It is not a screenshot, video, private file, or proof that richer media already exists.",
      sourceTrace: [
        source("project-record", `${project.title} structured record`, { id: project.slug }),
        source("gap-record", `${project.title} screenshot gap`, { id: `${project.slug}.screenshot-gap` }),
        source("api-route", "Artifact replay route", { url: `/api/artifact-replays/${project.slug}` }),
        source("terminal-command", "Artifact replay command", { command: `artifact-replays ${project.slug}` }),
      ],
    },
  ];

  if (project.repoUrl) {
    artifacts.push({
      ...base,
      id: `${project.slug}.repo-link`,
      artifactType: "repo-link",
      mediaKind: "external-link",
      label: `${project.title} repository`,
      url: project.repoUrl,
      command: null,
      sourceStatus: "available",
      sourceTrace: [
        source("project-record", `${project.title} repo URL field`, { id: project.slug }),
        source("external-url", "Repository link", { url: project.repoUrl }),
      ],
    });
  }

  if (project.liveUrl) {
    artifacts.push({
      ...base,
      id: `${project.slug}.live-demo-link`,
      artifactType: "live-demo-link",
      mediaKind: "external-link",
      label: `${project.title} live demo`,
      url: project.liveUrl,
      command: null,
      sourceStatus: "available",
      sourceTrace: [
        source("project-record", `${project.title} live URL field`, { id: project.slug }),
        source("external-url", "Live demo link", { url: project.liveUrl }),
      ],
    });
  }

  return artifacts;
}

function artifactGapsForProject(project) {
  return [
    {
      id: `${project.slug}.screenshot-gap`,
      project: project.slug,
      projectTitle: project.title,
      gapType: "screenshot",
      label: `${project.title} screenshot artifact not committed`,
      neededArtifact: "public-safe screenshot",
      sourceStatus: "missing",
      suggestedRepair: `Capture or approve a public-safe screenshot for ${project.title}, then attach it as a served artifact with source trace.`,
      sourceTrace: [source("project-record", `${project.title} structured record`, { id: project.slug })],
    },
  ];
}

function claimsForProject(claims, slug) {
  return claims.filter((claim) => claim.relatedProject === slug);
}

function source(type, label, extra = {}) {
  return { type, label, ...extra };
}

function privacyFor(project) {
  return project.visibility.toLowerCase().includes("private") ? "public-safe-private" : "public";
}

function audienceFor(project) {
  const text = `${project.kind} ${project.summary} ${project.why} ${project.tags.join(" ")}`.toLowerCase();
  if (/(agent|browser|qa|incident|frontend|developer|automation)/.test(text)) return "agent-infra";
  if (/(research|hardware|assistive|bluetooth|paper|patent|cane)/.test(text)) return "research";
  if (/(civic|public-safety|public safety|first responder|community|map|disaster)/.test(text)) return "civic";
  if (/(extension|privacy|utility|tool)/.test(text)) return "tools";
  if (/(admissions|immigration|market|shopping|real estate|startup|product)/.test(text)) return "product";
  return "portfolio";
}

function annotationGuidanceFor(project) {
  const text = `${project.kind} ${project.summary} ${project.why} ${project.tags.join(" ")}`.toLowerCase();
  if (/(agent|browser|qa|developer|automation)/.test(text)) return "Lead with replayability: API route, terminal command, transcript, then screenshot gap.";
  if (/(research|hardware|assistive|bluetooth|paper|patent|cane)/.test(text)) return "Lead with methodology and caveats before visual polish or outcome claims.";
  if (/(civic|public-safety|community|map|disaster)/.test(text)) return "Lead with public-safety context, data boundary, and repairable missing media.";
  if (/(extension|privacy|utility|tool)/.test(text)) return "Lead with privacy boundary, user-facing utility, and inspectable public-safe links.";
  if (/(admissions|immigration|market|shopping|real estate|startup|product)/.test(text)) return "Lead with product framing, proof path, and explicit missing screenshot record.";
  return "Lead with the strongest public-safe proof path and keep missing media explicit.";
}

function latestYear(value) {
  const years = String(value).match(/\b20\d{2}\b/g)?.map(Number) || [];
  return years.length ? String(Math.max(...years)) : "undated";
}

function strongest(values) {
  if (values.includes("link-backed")) return "link-backed";
  if (values.includes("source-backed")) return "source-backed";
  return "needs-source";
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

module.exports = {
  buildArtifactCatalog,
  buildArtifactCatalogResponse,
};
