const intentProfiles = [
  {
    id: "recruiter",
    label: "Recruiter proof path",
    matchTerms: ["recruiter", "internship", "hiring", "engineer", "proof", "shipped", "built"],
    timeBox: "4 minutes",
    cta: "Open the strongest case study, then verify one repo or replay artifact before contacting.",
  },
  {
    id: "agent-infra",
    label: "Agent infrastructure path",
    matchTerms: ["agent", "browser", "qa", "automation", "sandbox", "developer tools", "pr"],
    timeBox: "5 minutes",
    cta: "Inspect QAgent or FlowPR first, then run the terminal evidence replay.",
  },
  {
    id: "civic-tech",
    label: "Civic technology path",
    matchTerms: ["civic", "public safety", "mesh", "first responder", "community", "maps"],
    timeBox: "3 minutes",
    cta: "Start with AnchorMesh, then read the risk disclosure before treating it as public-safety evidence.",
  },
  {
    id: "research",
    label: "Research mentor path",
    matchTerms: ["research", "hardware", "assistive", "paper", "patent", "bluetooth", "stats"],
    timeBox: "5 minutes",
    cta: "Start with SmartCane, then inspect source-backed claims and missing public artifacts.",
  },
  {
    id: "founder",
    label: "Founder or collaborator path",
    matchTerms: ["founder", "startup", "product", "market", "demo", "operator", "collaborator"],
    timeBox: "4 minutes",
    cta: "Compare one agent project with one product project, then open the relevant demo or replay.",
  },
];

function buildIntentPaths({ projects, claims, artifactCatalog, opportunities }) {
  const paths = intentProfiles.map((profile) => buildIntentPath(profile, projects, claims, artifactCatalog, opportunities));
  return {
    generatedAt: new Date().toISOString(),
    mode: "visitor-intent-paths",
    sourceBoundary:
      "Intent paths are generated from local project, claim, artifact, and opportunity evidence. They do not infer live visitor identity or external application status.",
    paths,
  };
}

function buildIntentPathsResponse(catalog, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...catalog,
      detail: "full",
      compact: false,
      fullDetailEndpoint: "/api/intents?detail=full",
      intentPayloadPolicy: {
        fullDetail: true,
        pathsReturned: catalog.paths?.length || 0,
        fullDetailEndpoint: "/api/intents?detail=full",
      },
    };
  }

  return {
    mode: catalog.mode,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: "/api/intents?detail=full",
    pathDetailEndpointTemplate: "/api/intents/:id",
    intentPayloadPolicy: {
      fullDetail: false,
      pathsReturned: catalog.paths?.length || 0,
    },
    paths: (catalog.paths || []).map(summarizeIntentPath),
  };
}

function buildIntentPathResponse(path, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = `/api/intents/${path.id}?detail=full`;
  if (fullDetail) {
    return {
      ...path,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      intentPayloadPolicy: selectedIntentPayloadPolicy(path, { fullDetail }),
    };
  }

  return {
    ...summarizeIntentPath(path),
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    intentPayloadPolicy: selectedIntentPayloadPolicy(path, { fullDetail }),
  };
}

function buildIntentPath(profile, projects, claims, artifactCatalog, opportunities) {
  const rankedProjects = projects
    .map((project) => scoreProjectForIntent(project, profile, claims))
    .filter((project) => project.intentScore > 0)
    .sort((left, right) => right.intentScore - left.intentScore)
    .slice(0, 4);
  const fallbackProjects = rankedProjects.length ? rankedProjects : projects.slice().sort((left, right) => right.score - left.score).slice(0, 4);
  const projectSlugs = new Set(fallbackProjects.map((project) => project.slug));
  const proofClaims = claims
    .filter((claim) => projectSlugs.has(claim.relatedProject))
    .sort((left, right) => right.confidenceScore - left.confidenceScore)
    .slice(0, 8);
  const demos = (artifactCatalog.artifacts || [])
    .filter((artifact) => projectSlugs.has(artifact.project))
    .filter((artifact) => ["live-demo-link", "repo-link", "api-replay", "terminal-replay", "generated-preview"].includes(artifact.artifactType))
    .slice(0, 8);
  const opportunity = (opportunities.opportunities || []).find((item) =>
    item.suggestedProjectOrder?.some((slug) => projectSlugs.has(slug)),
  );
  const risks = riskDisclosures(fallbackProjects, proofClaims, artifactCatalog);

  return {
    id: profile.id,
    label: profile.label,
    timeBox: profile.timeBox,
    bestProjects: fallbackProjects.map((project) => ({
      slug: project.slug,
      title: project.title,
      score: project.intentScore || project.score,
      why: project.explanation || project.summary,
      proofStrength: strongest(claims.filter((claim) => claim.relatedProject === project.slug).map((claim) => claim.evidenceStrength)),
    })),
    proofPath: proofClaims.map((claim) => ({
      id: claim.id,
      project: claim.relatedProject,
      text: claim.text,
      evidenceStrength: claim.evidenceStrength,
      confidenceScore: claim.confidenceScore,
    })),
    demos: demos.map((artifact) => ({
      id: artifact.id,
      project: artifact.project,
      label: artifact.label,
      artifactType: artifact.artifactType,
      url: artifact.url,
      command: artifact.command,
    })),
    riskDisclosure: risks,
    cta: opportunity ? `${profile.cta} Opportunity fit: ${opportunity.label}.` : profile.cta,
    timeBoxedPath: timeBoxedPath(profile, fallbackProjects, proofClaims, demos, risks),
  };
}

function summarizeIntentPath(path) {
  return {
    id: path.id,
    bestProjects: (path.bestProjects || []).slice(0, 1).map((project) => ({
      slug: project.slug,
      score: project.score,
    })),
    proofPath: (path.proofPath || []).slice(0, 1).map((claim) => ({
      id: claim.id,
      evidenceStrength: claim.evidenceStrength,
    })),
    demos: (path.demos || []).slice(0, 1).map((artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      targetAvailable: Boolean(artifact.url || artifact.command),
    })),
    primaryRiskAvailable: Boolean(path.riskDisclosure?.[0]),
    timeBoxedStepCount: (path.timeBoxedPath || []).length,
  };
}

function selectedIntentPayloadPolicy(path, { fullDetail }) {
  const fullDetailEndpoint = `/api/intents/${path.id}?detail=full`;
  if (fullDetail) {
    return {
      fullDetail: true,
      bestProjectsReturned: (path.bestProjects || []).length,
      proofClaimsReturned: (path.proofPath || []).length,
      demosReturned: (path.demos || []).length,
      timeBoxedStepsReturned: (path.timeBoxedPath || []).length,
      fullDetailEndpoint,
    };
  }

  return {
    fullDetail: false,
    bestProjectsReturned: Math.min((path.bestProjects || []).length, 1),
    proofClaimsReturned: Math.min((path.proofPath || []).length, 1),
    demosReturned: Math.min((path.demos || []).length, 1),
    timeBoxedStepsReturned: 0,
    fullDetailEndpoint,
    omittedFromSummaryCount: 5,
  };
}

function selectIntentPath(value, catalog) {
  const normalized = String(value || "").toLowerCase();
  return (
    catalog.paths.find((path) => path.id === normalized) ||
    catalog.paths.find((path) => intentProfiles.find((profile) => profile.id === path.id)?.matchTerms.some((term) => normalized.includes(term))) ||
    catalog.paths[0]
  );
}

function scoreProjectForIntent(project, profile, claims) {
  const haystack = `${project.title} ${project.kind} ${project.summary} ${project.why} ${project.outcome} ${project.stack.join(" ")} ${project.tags.join(" ")} ${project.proof.join(" ")}`.toLowerCase();
  const matches = profile.matchTerms.filter((term) => haystack.includes(term.toLowerCase()));
  const projectClaims = claims.filter((claim) => claim.relatedProject === project.slug);
  const confidence = average(projectClaims.map((claim) => claim.confidenceScore));
  const intentScore = Math.round(matches.length * 20 + project.score * 0.45 + confidence * 0.25);
  return {
    ...project,
    intentScore,
    explanation: matches.length
      ? `Matches ${matches.slice(0, 3).join(", ")} with ${strongest(projectClaims.map((claim) => claim.evidenceStrength))} proof.`
      : "",
  };
}

function riskDisclosures(projects, claims, artifactCatalog) {
  const disclosures = [];
  const privateProjects = projects.filter((project) => String(project.visibility).toLowerCase().includes("private"));
  const weakClaims = claims.filter((claim) => claim.evidenceStrength === "needs-source");
  const screenshotGaps = (artifactCatalog.gaps || []).filter((gap) => projects.some((project) => project.slug === gap.project));
  if (privateProjects.length) disclosures.push(`${privateProjects.length} project(s) include private or public-safe-private references.`);
  if (weakClaims.length) disclosures.push(`${weakClaims.length} high-priority claim(s) still need stronger public source attachments.`);
  if (screenshotGaps.length) disclosures.push(`${screenshotGaps.length} project screenshot artifact(s) are recorded as missing, not faked.`);
  return disclosures.length ? disclosures : ["No major proof risk detected in the selected path."];
}

function timeBoxedPath(profile, projects, claims, demos, risks) {
  return [
    { minute: 0, action: "Start", target: projects[0]?.title || "Top project", detail: profile.label },
    { minute: 1, action: "Inspect proof", target: claims[0]?.project || projects[0]?.slug || "claims", detail: claims[0]?.text || "Open source-backed claims." },
    { minute: 2, action: "Replay", target: demos[0]?.label || "available artifact", detail: demos[0]?.url || demos[0]?.command || "Open a generated preview." },
    { minute: 3, action: "Check risk", target: "risk disclosure", detail: risks[0] },
    { minute: 4, action: "CTA", target: "next step", detail: profile.cta },
  ];
}

function strongest(values) {
  if (values.includes("link-backed")) return "link-backed";
  if (values.includes("source-backed")) return "source-backed";
  return "needs-source";
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

module.exports = {
  buildIntentPathResponse,
  buildIntentPaths,
  buildIntentPathsResponse,
  intentProfiles,
  selectIntentPath,
};
