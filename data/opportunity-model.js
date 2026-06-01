const opportunityTracks = [
  {
    id: "agent-infra-internship",
    label: "Agent infrastructure internship",
    type: "internship",
    audience: "agent-infrastructure engineer",
    matchTerms: ["AI agents", "browser automation", "QA", "PR automation", "verification", "developer tools"],
    applicationRequirements: ["Public agent-system proof", "technical deep dive", "fresh repo/demo receipts"],
    outreachAngle: "Lead with QAgent, FlowPR, and RePro as evidence of browser-native autonomous engineering.",
    risk: "Claims need fresh demos and concrete artifacts because agent projects can otherwise read as hype.",
  },
  {
    id: "research-lab-accessibility",
    label: "Assistive technology research lab",
    type: "research lab",
    audience: "research mentor",
    matchTerms: ["hardware", "research", "assistive tech", "Bluetooth", "paper", "science fair"],
    applicationRequirements: ["Paper/patent proof", "hardware architecture", "field constraints", "accessibility framing"],
    outreachAngle: "Lead with SmartCane as applied research plus mobile/caregiver system work.",
    risk: "Private research artifacts need public-safe summaries and stronger source attachments.",
  },
  {
    id: "civic-tech-partnership",
    label: "Civic-tech or public-interest partnership",
    type: "civic-tech partnership",
    audience: "civic technologist",
    matchTerms: ["civic tech", "first responders", "community", "mobile", "maps", "public safety"],
    applicationRequirements: ["User story", "safety constraints", "demo replay", "clear public-benefit narrative"],
    outreachAngle: "Lead with AnchorMesh and Hey, Blue! to show public-safety and community software range.",
    risk: "Disaster-response claims must stay precise and avoid implying production emergency readiness.",
  },
  {
    id: "hackathon-demo-circuit",
    label: "High-signal hackathon/demo circuit",
    type: "hackathon",
    audience: "hackathon judge",
    matchTerms: ["hackathon winner", "multiplayer", "AI memory", "Browser Use", "InsForge", "market intelligence"],
    applicationRequirements: ["90-second pitch path", "live or replayable demo", "proof wall", "team boundary"],
    outreachAngle: "Use the portfolio as a judge-facing proof cockpit instead of a static resume.",
    risk: "The site must separate awards that are source-backed from claims that need stronger evidence.",
  },
  {
    id: "open-source-devtools",
    label: "Open source developer-tools contribution",
    type: "open source issue",
    audience: "engineering manager",
    matchTerms: ["developer tools", "Safari", "privacy", "frontend", "browser evidence", "SRE"],
    applicationRequirements: ["Repo links", "issue/PR examples", "maintainer-friendly technical writing"],
    outreachAngle: "Lead with QAgent/FlowPR plus FreeYT/Navio as proof of small shipped tools and larger agent loops.",
    risk: "Some high-value work is private; public contribution proof needs more first-class artifacts.",
  },
  {
    id: "publication-venue",
    label: "Applied AI or assistive-systems publication venue",
    type: "publication venue",
    audience: "professor",
    matchTerms: ["research", "paper", "verification", "AI safety", "assistive tech", "incident response"],
    applicationRequirements: ["Research question", "methodology", "evaluation", "limitations", "source-backed claims"],
    outreachAngle: "Frame the through-line as accountable autonomy: agents and hardware systems that leave receipts.",
    risk: "Narrative needs rigorous limitations and cannot overclaim deployed impact.",
  },
];

function buildOpportunityRadar({ projects, claims }) {
  const publicClaims = claims.map((claim) => ({
    id: claim.id,
    text: claim.text,
    relatedProject: claim.relatedProject,
    confidenceScore: claim.confidenceScore,
    evidenceStrength: claim.evidenceStrength,
    privacyLevel: claim.privacyLevel,
    suggestedRepair: claim.suggestedRepair,
  }));

  const opportunities = opportunityTracks
    .map((track) => scoreTrack(track, projects, publicClaims))
    .sort((left, right) => right.fitScore - left.fitScore);

  return {
    generatedAt: new Date().toISOString(),
    mode: "archetype-radar",
    sourceBoundary:
      "This radar ranks opportunity types from local project and claim evidence only. It does not invent live postings, deadlines, scholarships, grants, or application states.",
    opportunities,
    nextActions: opportunities.slice(0, 3).map((opportunity) => ({
      id: opportunity.id,
      action: opportunity.nextAction,
      missingProof: opportunity.missingProof.slice(0, 3),
    })),
  };
}

function buildOpportunityRadarResponse(radar, { detail = "summary" } = {}) {
  const fullDetail = ["1", "true", "full"].includes(String(detail || "").toLowerCase());
  if (fullDetail) {
    return {
      ...radar,
      detail: "full",
      compact: false,
      fullDetailEndpoint: "/api/opportunities?detail=full",
      opportunityPayloadPolicy: {
        fullDetail: true,
        fullDetailEndpoint: "/api/opportunities?detail=full",
        opportunitiesReturned: radar.opportunities?.length || 0,
        fullFieldsPreserved: [
          "whyItFits",
          "relatedProof.matchedTerms",
          "sourceTrace.label",
          "sourceTrace.matchedTerms",
          "sourceTrace.evidenceStrength",
          "missingProof",
          "applicationRequirements",
          "suggestedNarrative",
          "outreachAngle",
        ],
      },
    };
  }

  const previewLimit = 5;
  const opportunities = (radar.opportunities || []).slice(0, previewLimit).map(compactOpportunity);
  return {
    mode: radar.mode,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: "/api/opportunities?detail=full",
    deadlinePolicy: "archetype-only-no-live-deadlines",
    opportunities,
    opportunityPayloadPolicy: {
      fullDetail: false,
      opportunityPreviewLimit: previewLimit,
      opportunitiesReturned: opportunities.length,
      opportunitiesAvailable: radar.opportunities?.length || 0,
    },
  };
}

function compactOpportunity(opportunity) {
  return {
    id: opportunity.id,
    label: opportunity.label,
    audience: opportunity.audience,
    fitScore: opportunity.fitScore,
    matchedProjectCount: opportunity.rankingFactors.matchedProjectCount,
    relatedClaimCount: opportunity.rankingFactors.relatedClaimCount,
    proofSlug: opportunity.relatedProof?.[0]?.slug || null,
    sourceTraceCount: opportunity.sourceTrace?.length || 0,
    missingProofCount: opportunity.missingProof?.length || 0,
  };
}

function scoreTrack(track, projects, claims) {
  const rankedProjects = projects
    .map((project) => {
      const haystack = `${project.title} ${project.kind} ${project.summary} ${project.why} ${project.outcome} ${project.stack.join(" ")} ${project.tags.join(" ")} ${project.proof.join(" ")}`.toLowerCase();
      const matches = track.matchTerms.filter((term) => haystack.includes(term.toLowerCase()));
      const projectClaims = claims.filter((claim) => claim.relatedProject === project.slug);
      const averageConfidence = average(projectClaims.map((claim) => claim.confidenceScore));
      const privatePenalty = projectClaims.filter((claim) => claim.privacyLevel !== "public").length * 2;
      return {
        slug: project.slug,
        title: project.title,
        score: Math.round(matches.length * 18 + project.score * 0.45 + averageConfidence * 0.25 - privatePenalty),
        matchedTerms: matches,
        evidenceStrength: strongest(projectClaims.map((claim) => claim.evidenceStrength)),
      };
    })
    .filter((project) => project.matchedTerms.length > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);

  const relatedSlugs = new Set(rankedProjects.map((project) => project.slug));
  const relatedClaims = claims
    .filter((claim) => relatedSlugs.has(claim.relatedProject))
    .sort((left, right) => right.confidenceScore - left.confidenceScore)
    .slice(0, 6);
  const missingProof = relatedClaims
    .filter((claim) => claim.evidenceStrength === "needs-source" || claim.privacyLevel !== "public")
    .map((claim) => claim.suggestedRepair);

  const fitScore = clamp(
    Math.round(average(rankedProjects.map((project) => project.score)) + relatedClaims.length * 2 - missingProof.length * 3),
    0,
    100,
  );
  const rankingFactors = {
    matchedProjectCount: rankedProjects.length,
    relatedClaimCount: relatedClaims.length,
    missingProofCount: missingProof.length,
    averageProjectScore: Math.round(average(rankedProjects.map((project) => project.score))),
    privateReferenceCount: relatedClaims.filter((claim) => claim.privacyLevel !== "public").length,
  };

  return {
    id: track.id,
    label: track.label,
    type: track.type,
    audience: track.audience,
    fitScore,
    rankingFactors,
    rankExplanation: rankedProjects.length
      ? `Fit is based on ${rankingFactors.matchedProjectCount} matched project(s), ${rankingFactors.relatedClaimCount} related claim(s), and ${rankingFactors.missingProofCount} missing-proof item(s).`
      : "Fit is low because no current project matched the track terms.",
    whyItFits: rankedProjects.length
      ? `${rankedProjects.map((project) => project.title).join(", ")} match ${track.matchTerms.slice(0, 4).join(", ")}.`
      : "No strong project match yet.",
    relatedProof: rankedProjects,
    sourceTrace: [
      { type: "opportunity-track", id: track.id, label: track.label },
      ...rankedProjects.map((project) => ({
        type: "project-match",
        id: project.slug,
        label: project.title,
        matchedTerms: project.matchedTerms,
      })),
      ...relatedClaims.slice(0, 4).map((claim) => ({
        type: "claim",
        id: claim.id,
        label: claim.text,
        evidenceStrength: claim.evidenceStrength,
      })),
    ],
    missingProof: [...new Set(missingProof)].slice(0, 6),
    deadline: null,
    applicationRequirements: track.applicationRequirements,
    suggestedNarrative: track.outreachAngle,
    suggestedProjectOrder: rankedProjects.map((project) => project.slug),
    outreachAngle: track.outreachAngle,
    risk: track.risk,
    nextAction: missingProof.length
      ? missingProof[0]
      : `Prepare a ${track.audience} packet using ${rankedProjects[0]?.title || "the strongest current project"}.`,
    estimatedEffort: missingProof.length > 3 ? "medium" : "small",
    expectedUpside: fitScore >= 80 ? "high" : fitScore >= 60 ? "medium" : "exploratory",
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function strongest(values) {
  if (values.includes("link-backed")) return "link-backed";
  if (values.includes("source-backed")) return "source-backed";
  return "needs-source";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  buildOpportunityRadar,
  buildOpportunityRadarResponse,
  opportunityTracks,
};
