const ENDPOINT = "/api/projects";

function buildProjectCatalogResponse({ projects = [], profile = {}, archiveNotes = [] } = {}, { detail = "summary" } = {}) {
  const normalizedDetail = String(detail || "").toLowerCase();
  const fullDetail = normalizedDetail === "full";
  const uiDetail = normalizedDetail === "ui";
  const summary = summarizeProjectCatalog(projects);
  if (fullDetail) {
    return {
      mode: "public-project-catalog",
      detail: "full",
      compact: false,
      summaryEndpoint: ENDPOINT,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      projectPayloadPolicy: {
        fullDetail: true,
        summaryEndpoint: ENDPOINT,
      },
      summary,
      projects,
      profile,
      archiveNotes,
    };
  }

  if (uiDetail) {
    return {
      mode: "public-project-catalog",
      detail: "ui",
      compact: true,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      projectPayloadPolicy: {
        fullDetail: false,
        uiDetail: true,
        defaultSummaryEndpoint: ENDPOINT,
        fullDetailEndpoint: `${ENDPOINT}?detail=full`,
        omittedFromUi: ["stack", "proof"],
        perProjectFullEndpoint: "/api/case-study/:slug",
        retainedForFirstScreen: ["why", "tags", "summary", "outcome", "gradient", "repoUrl", "liveUrl"],
      },
      summary,
      projects: projects.map(summarizeProjectForCatalogUi),
      profile: summarizeProfileForCatalog(profile),
      archiveNotes,
    };
  }

  return {
    mode: "public-project-catalog",
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    uiDetailEndpoint: `${ENDPOINT}?detail=ui`,
    caseStudyEndpointTemplate: "/api/case-study/:slug",
    projectPayloadPolicy: {
      fullDetail: false,
      uiDetailAvailable: true,
      caseStudyDetailAvailable: true,
    },
    summary,
    projects: projects.map(summarizeProjectForCatalogDirectory),
    profile: summarizeProfileDirectory(profile),
    archiveNoteCount: archiveNotes.length,
  };
}

function summarizeProjectCatalog(projects) {
  return {
    projects: projects.length,
    hero: projects.filter((project) => project.tier === "Hero").length,
    strong: projects.filter((project) => project.tier === "Strong").length,
    tools: projects.filter((project) => project.tier === "Tools").length,
    archive: projects.filter((project) => project.tier === "Archive").length,
    withRepo: projects.filter((project) => project.repoUrl).length,
    withLiveDemo: projects.filter((project) => project.liveUrl).length,
    privateReference: projects.filter((project) => /private/i.test(project.visibility)).length,
    averageScore: average(projects.map((project) => project.score)),
  };
}

function summarizeProjectForCatalogUi(project) {
  return {
    slug: project.slug,
    title: project.title,
    kind: project.kind,
    tier: project.tier,
    score: project.score,
    visibility: project.visibility,
    repoUrl: project.repoUrl,
    liveUrl: project.liveUrl,
    timeline: project.timeline,
    outcome: project.outcome,
    summary: project.summary,
    why: project.why,
    tags: project.tags,
    stackCount: project.stack.length,
    proofCount: project.proof.length,
    caseStudyEndpoint: `/api/case-study/${project.slug}`,
    gradient: project.gradient,
  };
}

function summarizeProjectForCatalogDirectory(project) {
  return {
    slug: project.slug,
    title: project.title,
    tier: project.tier,
    score: project.score,
  };
}

function summarizeProfileForCatalog(profile) {
  return {
    name: profile.name,
    email: profile.email,
    location: profile.location,
    linkedin: profile.linkedin,
    github: profile.github,
    headline: profile.headline,
    educationCount: (profile.education || []).length,
    proofCount: (profile.proof || []).length,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
  };
}

function summarizeProfileDirectory(profile) {
  return {
    name: profile.name,
    headline: profile.headline,
    location: profile.location,
    email: profile.email,
  };
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
}

module.exports = {
  buildProjectCatalogResponse,
  summarizeProjectCatalog,
  summarizeProjectForCatalog: summarizeProjectForCatalogUi,
};
