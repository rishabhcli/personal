const packetProfiles = [
  {
    id: "recruiter",
    label: "Recruiter evidence packet",
    audience: "recruiter",
    intentId: "recruiter",
    opportunityAudiences: ["agent-infrastructure engineer", "engineering manager", "hackathon judge"],
    decisionQuestion: "Would this person be credible in an engineering internship or builder role?",
    leadFrame: "shipped software, agent systems, product judgment, and public proof",
  },
  {
    id: "professor",
    label: "Professor or research mentor packet",
    audience: "professor",
    intentId: "research",
    opportunityAudiences: ["professor", "research mentor"],
    decisionQuestion: "Is there enough evidence for a serious research mentorship or lab conversation?",
    leadFrame: "research-shaped systems, accountable autonomy, assistive hardware, and limitations-aware engineering",
  },
  {
    id: "founder",
    label: "Founder or collaborator packet",
    audience: "founder",
    intentId: "founder",
    opportunityAudiences: ["founder", "hackathon judge", "civic technologist"],
    decisionQuestion: "Would this person be useful in a small team building and validating product ideas fast?",
    leadFrame: "operator energy, prototypes with receipts, market/product range, and pragmatic demo discipline",
  },
];

function buildAudiencePackets({ projects, claims, artifactCatalog, intentPaths, opportunities, trust }) {
  const packets = packetProfiles.map((profile) =>
    buildPacket({ profile, projects, claims, artifactCatalog, intentPaths, opportunities, trust }),
  );

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-audience-packets",
    sourceBoundary:
      "Packets are generated from local public-safe project, claim, artifact, intent, opportunity, and trust data. They do not infer external hiring, admissions, research, funding, or application status.",
    uncertaintyPolicy:
      "Every packet must disclose confidence, missing proof, stale/private references, artifact gaps, and a draft-only outreach boundary.",
    supportedAudiences: packetProfiles.map((profile) => profile.id),
    packets,
  };
}

function buildAudiencePacketsResponse(catalog, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...catalog,
      detail: "full",
      compact: false,
      fullDetailEndpoint: "/api/packets?detail=full",
      packetPayloadPolicy: packetPayloadPolicy({ fullDetail, packets: catalog.packets || [] }),
    };
  }

  return {
    mode: catalog.mode,
    detail: "summary",
    compact: true,
    supportedAudiences: catalog.supportedAudiences,
    fullDetailEndpoint: "/api/packets?detail=full",
    packets: (catalog.packets || []).map(summarizeAudiencePacket),
    packetPayloadPolicy: packetPayloadPolicy({ fullDetail, packets: catalog.packets || [] }),
  };
}

function buildAudiencePacketDetailResponse(packet, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const summaryEndpoint = `/api/packets/${packet.id}`;
  const fullDetailEndpoint = `${summaryEndpoint}?detail=full`;
  if (fullDetail) {
    return {
      ...packet,
      detail: "full",
      compact: false,
      summaryEndpoint,
      fullDetailEndpoint,
      packetPayloadPolicy: selectedPacketPayloadPolicy({ packet, fullDetail }),
    };
  }

  return {
    ...summarizeSelectedAudiencePacket(packet),
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    packetPayloadPolicy: selectedPacketPayloadPolicy({ packet, fullDetail }),
  };
}

function summarizeAudiencePacket(packet) {
  const recommendedProjects = packet.recommendedProjectOrder || [];
  const evidenceBriefs = packet.evidenceBriefs || [];
  return {
    id: packet.id,
    recommendedProjectPreview: recommendedProjects.slice(0, 1).map(({ rank, slug }) => ({
      rank,
      slug,
    })),
    evidenceBriefSummary: summarizeEvidenceBriefs(evidenceBriefs),
    draftOnlyOutreach: {
      automaticSendForbidden: /never send/i.test(packet.draftOnlyOutreach?.sendPolicy || ""),
    },
    uncertaintyDisclosure: summarizePacketUncertainty(packet.uncertaintyDisclosure),
    nextActionAvailable: (packet.nextActions || []).length > 0,
  };
}

function packetPayloadPolicy({ fullDetail, packets }) {
  if (!fullDetail) return { fullDetail };
  return {
    fullDetail,
    packetsReturned: packets.length,
    fullDetailEndpoint: "/api/packets?detail=full",
    defaultPacketFields: "full",
    selectedPacketEndpointTemplate: "/api/packets/:audience",
  };
}

function selectedPacketPayloadPolicy({ packet, fullDetail }) {
  if (!fullDetail) {
    return {
      fullDetail: false,
      fullDetailAvailable: true,
      evidenceBriefsReturned: Math.min(packet.evidenceBriefs.length, 3),
      recommendedProjectsReturned: Math.min(packet.recommendedProjectOrder.length, 3),
    };
  }
  return {
    fullDetail: true,
    evidenceBriefsReturned: packet.evidenceBriefs.length,
    totalEvidenceBriefs: packet.evidenceBriefs.length,
    recommendedProjectsReturned: packet.recommendedProjectOrder.length,
    proofPlanStepsAvailable: packet.proofPlan.length,
    nextActionsReturned: packet.nextActions.length,
  };
}

function summarizeSelectedAudiencePacket(packet) {
  return {
    id: packet.id,
    decisionQuestionAvailable: Boolean(packet.decisionQuestion),
    generatedFrom: {
      intentPath: packet.generatedFrom?.intentPath || null,
      opportunityCount: (packet.generatedFrom?.opportunityIds || []).length,
    },
    thesisAvailable: Boolean(packet.thesis),
    shortPitchAvailable: Boolean(packet.shortPitch),
    recommendedProjectOrder: (packet.recommendedProjectOrder || []).slice(0, 3).map(({ rank, slug }) => ({
      rank,
      slug,
    })),
    evidenceBriefs: (packet.evidenceBriefs || []).slice(0, 3).map((brief) => ({
      slug: brief.slug,
      confidenceScore: brief.confidenceScore,
      claimCount: (brief.claims || []).length,
      artifactCount: (brief.artifacts || []).length,
      caveatCount: (brief.caveats || []).length,
    })),
    evidenceBriefCount: (packet.evidenceBriefs || []).length,
    proofPlanCount: (packet.proofPlan || []).length,
    draftOnlyOutreach: {
      automaticSendForbidden: /never send/i.test(packet.draftOnlyOutreach?.sendPolicy || ""),
      subjectAvailable: Boolean(packet.draftOnlyOutreach?.subject),
    },
    uncertaintyDisclosure: {
      confidenceScore: packet.uncertaintyDisclosure?.confidenceScore || 0,
      confidenceBand: packet.uncertaintyDisclosure?.confidenceBand || "insufficient",
      caveatCount: (packet.uncertaintyDisclosure?.caveats || []).length,
      missingProofCount: packet.uncertaintyDisclosure?.missingProofCount || 0,
      privateReferenceCount: packet.uncertaintyDisclosure?.privateReferenceCount || 0,
      staleClaimCount: packet.uncertaintyDisclosure?.staleClaimCount || 0,
      screenshotGapCount: packet.uncertaintyDisclosure?.screenshotGapCount || 0,
    },
    nextActionCount: (packet.nextActions || []).length,
  };
}

function summarizePacketUncertainty(uncertainty = {}) {
  const caveats = uncertainty.caveats || [];
  return {
    confidenceBand: uncertainty.confidenceBand || "insufficient",
    caveatCount: caveats.length,
  };
}

function summarizeEvidenceBriefs(evidenceBriefs) {
  return {
    total: evidenceBriefs.length,
  };
}

function selectAudiencePacket(value, catalog) {
  const normalized = normalizeAudience(value);
  return catalog.packets.find((packet) => packet.id === normalized) || null;
}

function normalizeAudience(value) {
  const normalized = String(value || "recruiter").toLowerCase().trim();
  if (["recruiter", "hiring", "internship", "engineer"].includes(normalized)) return "recruiter";
  if (["professor", "research", "mentor", "lab"].includes(normalized)) return "professor";
  if (["founder", "vc", "collaborator", "startup"].includes(normalized)) return "founder";
  return normalized;
}

function buildPacket({ profile, projects, claims, artifactCatalog, intentPaths, opportunities, trust }) {
  const intentPath = (intentPaths.paths || []).find((path) => path.id === profile.intentId) || intentPaths.paths?.[0];
  const opportunityMatches = (opportunities.opportunities || [])
    .filter((opportunity) => profile.opportunityAudiences.includes(opportunity.audience))
    .slice(0, 3);
  const slugs = orderedUnique([
    ...(intentPath?.bestProjects || []).map((project) => project.slug),
    ...opportunityMatches.flatMap((opportunity) => opportunity.suggestedProjectOrder || []),
  ]).slice(0, 5);
  const selectedProjects = slugs
    .map((slug) => projects.find((project) => project.slug === slug))
    .filter(Boolean);
  const briefs = selectedProjects.map((project) => evidenceBriefFor({ profile, project, claims, artifactCatalog }));
  const selectedClaims = briefs.flatMap((brief) => brief.claims);
  const privateReferences = selectedClaims.filter((claim) => claim.privacyLevel !== "public");
  const staleClaims = selectedClaims.filter((claim) => claim.freshnessScore < 55);
  const screenshotGaps = (artifactCatalog.gaps || []).filter((gap) => slugs.includes(gap.project));
  const missingProof = orderedUnique(briefs.flatMap((brief) => brief.caveats));
  const confidenceScore = clamp(
    Math.round(average(briefs.map((brief) => brief.confidenceScore)) - missingProof.length * 2 - privateReferences.length),
    0,
    100,
  );
  const uncertaintyDisclosure = {
    confidenceScore,
    confidenceBand: confidenceBand(confidenceScore),
    caveats: missingProof.length ? missingProof : ["No major packet caveat detected by the current local ledger."],
    missingProofCount: missingProof.length,
    privateReferenceCount: privateReferences.length,
    staleClaimCount: staleClaims.length,
    screenshotGapCount: screenshotGaps.length,
    noExternalInference:
      "This packet does not claim interview readiness, admissions probability, funding likelihood, or external application state.",
  };

  return {
    id: profile.id,
    label: profile.label,
    audience: profile.audience,
    decisionQuestion: profile.decisionQuestion,
    generatedFrom: {
      intentPath: intentPath?.id || null,
      opportunityIds: opportunityMatches.map((opportunity) => opportunity.id),
      trustCounts: trust?.counts || {},
    },
    thesis: thesisFor(profile, briefs),
    shortPitch: shortPitchFor(profile, briefs, uncertaintyDisclosure),
    longPitch: longPitchFor(profile, briefs, uncertaintyDisclosure),
    recommendedProjectOrder: briefs.map((brief, index) => ({
      rank: index + 1,
      slug: brief.slug,
      title: brief.title,
      reason: brief.audienceFit,
      confidenceScore: brief.confidenceScore,
      evidenceStrength: brief.evidenceStrength,
    })),
    evidenceBriefs: briefs,
    proofPlan: intentPath?.timeBoxedPath || [],
    draftOnlyOutreach: outreachDraftFor(profile, briefs, uncertaintyDisclosure),
    uncertaintyDisclosure,
    nextActions: nextActionsFor(profile, briefs, uncertaintyDisclosure, opportunityMatches),
  };
}

function evidenceBriefFor({ profile, project, claims, artifactCatalog }) {
  const projectClaims = claims
    .filter((claim) => claim.relatedProject === project.slug)
    .sort((left, right) => right.confidenceScore - left.confidenceScore);
  const strongestClaims = projectClaims.slice(0, 4);
  const artifacts = (artifactCatalog.artifacts || [])
    .filter((artifact) => artifact.project === project.slug)
    .filter((artifact) => ["live-demo-link", "repo-link", "api-replay", "terminal-replay", "generated-preview"].includes(artifact.artifactType))
    .slice(0, 4);
  const gaps = (artifactCatalog.gaps || []).filter((gap) => gap.project === project.slug);
  const privateClaims = projectClaims.filter((claim) => claim.privacyLevel !== "public");
  const weakClaims = projectClaims.filter((claim) => claim.evidenceStrength === "needs-source");
  const caveats = [
    ...weakClaims.slice(0, 2).map((claim) => claim.suggestedRepair),
    ...(privateClaims.length ? [`${project.title} has ${privateClaims.length} public-safe private reference(s).`] : []),
    ...gaps.slice(0, 1).map((gap) => gap.suggestedRepair),
  ];
  const confidenceScore = average(projectClaims.map((claim) => claim.confidenceScore));

  return {
    slug: project.slug,
    title: project.title,
    audienceFit: audienceFitFor(profile, project),
    summary: project.summary,
    outcome: project.outcome,
    evidenceStrength: strongest(projectClaims.map((claim) => claim.evidenceStrength)),
    confidenceScore,
    confidenceBand: confidenceBand(confidenceScore),
    claims: strongestClaims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      evidenceStrength: claim.evidenceStrength,
      privacyLevel: claim.privacyLevel,
      freshnessScore: claim.freshnessScore,
      confidenceScore: claim.confidenceScore,
    })),
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      label: artifact.label,
      url: artifact.url,
      command: artifact.command,
      approvalRequired: artifact.approvalRequired,
    })),
    caveats: orderedUnique(caveats).slice(0, 4),
  };
}

function audienceFitFor(profile, project) {
  if (profile.id === "professor") {
    return `${project.title} is useful when discussing methodology, limitations, and evidence quality.`;
  }
  if (profile.id === "founder") {
    return `${project.title} shows product judgment, fast iteration, or demo-driven execution.`;
  }
  return `${project.title} is usable as engineering proof because it connects a concrete build to public-safe evidence.`;
}

function thesisFor(profile, briefs) {
  const titles = briefs.slice(0, 3).map((brief) => brief.title).join(", ");
  return `Lead with ${titles || "the strongest verified projects"} as evidence of ${profile.leadFrame}.`;
}

function shortPitchFor(profile, briefs, uncertainty) {
  const top = briefs[0];
  if (!top) return `A ${profile.audience} packet cannot be generated until evidence briefs exist.`;
  return `${top.title} is the anchor: ${top.summary} Pair it with ${briefs
    .slice(1, 3)
    .map((brief) => brief.title)
    .join(" and ")}. Confidence is ${uncertainty.confidenceScore}/100 (${uncertainty.confidenceBand}) because ${uncertainty.caveats[0]}`;
}

function longPitchFor(profile, briefs, uncertainty) {
  const proofLine = briefs
    .slice(0, 4)
    .map((brief) => `${brief.title} (${brief.evidenceStrength}, ${brief.confidenceScore}/100)`)
    .join("; ");
  return `${profile.label}: answer "${profile.decisionQuestion}" with ${profile.leadFrame}. The current evidence order is ${proofLine}. Use the proof plan before outreach, and disclose uncertainty: ${uncertainty.caveats.slice(0, 3).join(" ")}`;
}

function outreachDraftFor(profile, briefs, uncertainty) {
  const top = briefs[0];
  return {
    sendPolicy: "draft-only; never send, submit, DM, email, or apply automatically",
    subject: top ? `${profile.label}: ${top.title} proof path` : `${profile.label}: proof path`,
    opening: top
      ? `I would lead with ${top.title}, then show ${briefs.slice(1, 3).map((brief) => brief.title).join(" and ")} as supporting evidence.`
      : "I would wait for stronger evidence before drafting outreach.",
    uncertaintyLine: `Current packet confidence is ${uncertainty.confidenceScore}/100; caveat: ${uncertainty.caveats[0]}`,
  };
}

function nextActionsFor(profile, briefs, uncertainty, opportunities) {
  const actions = [];
  if (uncertainty.missingProofCount > 0) actions.push(`Repair first caveat: ${uncertainty.caveats[0]}`);
  if (uncertainty.screenshotGapCount > 0) actions.push("Capture or approve public-safe screenshots for the selected proof path.");
  if (opportunities[0]) actions.push(`Use opportunity angle: ${opportunities[0].outreachAngle}`);
  actions.push(`Review the ${profile.audience} packet before using it; the app must not send anything automatically.`);
  return actions.slice(0, 4);
}

function orderedUnique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function strongest(values) {
  if (values.includes("link-backed")) return "link-backed";
  if (values.includes("source-backed")) return "source-backed";
  return "needs-source";
}

function confidenceBand(score) {
  if (score >= 80) return "high";
  if (score >= 65) return "medium";
  if (score >= 45) return "low";
  return "insufficient";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  buildAudiencePackets,
  buildAudiencePacketDetailResponse,
  buildAudiencePacketsResponse,
  packetProfiles,
  selectAudiencePacket,
};
