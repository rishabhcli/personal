const currentYear = new Date().getFullYear();

function buildClaimLedger({ projects, profile }) {
  const claims = [];

  for (const project of projects) {
    const privacyLevel = privacyForProject(project);
    const base = {
      relatedProject: project.slug,
      relatedPeople: ["Rishabh Bansal"],
      relatedTimePeriod: project.timeline,
      privacyLevel,
      publicVisibility: privacyLevel === "private-reference" ? "public-safe-reference" : "public",
      contradictionStatus: "none-known",
      expirationPolicy: "Re-check quarterly, and immediately after any deploy, award, paper, or repo status change.",
    };

    claims.push(
      makeClaim({
        ...base,
        id: `project.${project.slug}.summary`,
        claimType: "project-summary",
        text: project.summary,
        project,
      }),
      makeClaim({
        ...base,
        id: `project.${project.slug}.outcome`,
        claimType: "outcome",
        text: project.outcome,
        project,
      }),
      makeClaim({
        ...base,
        id: `project.${project.slug}.positioning`,
        claimType: "positioning",
        text: project.why,
        project,
      }),
    );

    project.proof.forEach((text, index) => {
      claims.push(
        makeClaim({
          ...base,
          id: `project.${project.slug}.proof.${index + 1}`,
          claimType: "proof-item",
          text,
          project,
        }),
      );
    });
  }

  profile.proof.forEach((text, index) => {
    const matchingProject = projects.find((project) => text.toLowerCase().includes(project.title.toLowerCase()));
    claims.push(
      makeClaim({
        id: `profile.proof.${index + 1}`,
        claimType: "profile-proof",
        text,
        relatedProject: matchingProject?.slug || null,
        relatedPeople: ["Rishabh Bansal"],
        relatedTimePeriod: inferTimePeriod(text),
        privacyLevel: "public",
        publicVisibility: "public",
        contradictionStatus: "none-known",
        expirationPolicy: "Re-check quarterly against source artifacts.",
        project: matchingProject,
        sourceMaterial: [{ type: "profile-record", label: "Profile proof record" }],
      }),
    );
  });

  return claims;
}

function makeClaim(input) {
  const sourceMaterial = input.sourceMaterial || sourceMaterialForProject(input.project, input.text);
  const confidenceScore = confidenceForClaim(input.project, sourceMaterial);
  const freshnessScore = freshnessForTimePeriod(input.relatedTimePeriod);
  const evidenceStrength = strengthForClaim(input.project, sourceMaterial, confidenceScore);

  return {
    id: input.id,
    text: input.text,
    claimType: input.claimType,
    sourceMaterial,
    evidenceStrength,
    privacyLevel: input.privacyLevel,
    freshnessScore,
    confidenceScore,
    publicVisibility: input.publicVisibility,
    relatedProject: input.relatedProject,
    relatedPeople: input.relatedPeople,
    relatedTimePeriod: input.relatedTimePeriod,
    verificationMethod: verificationMethodFor(input.project),
    verificationResult: evidenceStrength === "needs-source" ? "needs-evidence" : "source-backed",
    contradictionStatus: input.contradictionStatus,
    expirationPolicy: input.expirationPolicy,
    suggestedRepair: suggestedRepairFor(input.project, evidenceStrength),
  };
}

function privacyForProject(project) {
  const text = `${project.visibility} ${project.repoUrl || ""} ${project.liveUrl || ""}`.toLowerCase();
  if (text.includes("private")) return "private-reference";
  return "public";
}

function sourceMaterialForProject(project, claimText) {
  if (!project) return [{ type: "portfolio-record", label: "Portfolio record" }];

  const sources = [{ type: "portfolio-record", label: `${project.title} structured record` }];
  if (project.repoUrl) sources.push({ type: "repo", label: `${project.title} repository`, url: project.repoUrl });
  if (project.liveUrl) sources.push({ type: "live-demo", label: `${project.title} live demo`, url: project.liveUrl });

  const proofMatch = project.proof.find((item) => claimText === item || overlaps(item, claimText));
  if (proofMatch) sources.push({ type: "proof-note", label: proofMatch });

  return sources;
}

function confidenceForClaim(project, sourceMaterial) {
  const sourceScore = Math.min(22, sourceMaterial.length * 7);
  const projectScore = project ? Math.round(project.score * 0.55) : 45;
  const publicLinkBoost = sourceMaterial.some((source) => source.url) ? 12 : 0;
  return clamp(projectScore + sourceScore + publicLinkBoost, 30, 98);
}

function freshnessForTimePeriod(timePeriod) {
  const years = String(timePeriod || "").match(/\b20\d{2}\b/g)?.map(Number) || [];
  if (!years.length) return 58;
  const newest = Math.max(...years);
  return clamp(100 - Math.max(0, currentYear - newest) * 12, 35, 100);
}

function strengthForClaim(project, sourceMaterial, confidenceScore) {
  if (!project) return confidenceScore >= 70 ? "source-backed" : "needs-source";
  if (sourceMaterial.some((source) => source.type === "repo" || source.type === "live-demo")) return "link-backed";
  if (sourceMaterial.some((source) => source.type === "proof-note")) return "source-backed";
  return "needs-source";
}

function verificationMethodFor(project) {
  if (!project) return "Profile record review.";
  const methods = ["Structured portfolio record review"];
  if (project.repoUrl) methods.push("repository link check");
  if (project.liveUrl) methods.push("live demo status check");
  if (project.visibility.toLowerCase().includes("private")) methods.push("public-safe private reference review");
  return `${methods.join(", ")}.`;
}

function suggestedRepairFor(project, evidenceStrength) {
  if (evidenceStrength !== "needs-source") return "Keep source fresh and attach stronger artifacts when available.";
  if (!project) return "Attach a public source or private approved artifact.";
  return `Attach stronger evidence for ${project.title}: screenshot, repo link, demo receipt, paper, award page, or approved private artifact.`;
}

function publicClaim(claim) {
  return {
    id: claim.id,
    text: claim.text,
    claimType: claim.claimType,
    evidenceStrength: claim.evidenceStrength,
    privacyLevel: claim.privacyLevel,
    freshnessScore: claim.freshnessScore,
    confidenceScore: claim.confidenceScore,
    publicVisibility: claim.publicVisibility,
    relatedProject: claim.relatedProject,
    relatedTimePeriod: claim.relatedTimePeriod,
    verificationMethod: claim.verificationMethod,
    verificationResult: claim.verificationResult,
    contradictionStatus: claim.contradictionStatus,
    expirationPolicy: claim.expirationPolicy,
    suggestedRepair: claim.suggestedRepair,
    sourceMaterial: claim.sourceMaterial.map(publicSource),
  };
}

function publicSource(source) {
  return {
    type: source.type,
    label: source.label,
    ...(source.url ? { url: source.url } : {}),
  };
}

function claimsForProject(claims, slug) {
  return claims.filter((claim) => claim.relatedProject === slug);
}

function evidenceForProject(project, claims) {
  const projectClaims = claimsForProject(claims, project.slug);
  return {
    slug: project.slug,
    title: project.title,
    visibility: project.visibility,
    privacyLevel: privacyForProject(project),
    links: [
      ...(project.repoUrl ? [{ type: "repo", url: project.repoUrl }] : []),
      ...(project.liveUrl ? [{ type: "live-demo", url: project.liveUrl }] : []),
    ],
    proofItems: project.proof,
    claims: projectClaims.map(publicClaim),
    confidenceScore: average(projectClaims.map((claim) => claim.confidenceScore)),
    freshnessScore: average(projectClaims.map((claim) => claim.freshnessScore)),
    evidenceStrength: strongest(projectClaims.map((claim) => claim.evidenceStrength)),
  };
}

function buildProjectEvidenceResponse(evidence, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = `/api/evidence/${evidence.slug}?detail=full`;
  if (fullDetail) {
    return {
      ...evidence,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      evidencePayloadPolicy: {
        fullDetail: true,
        fullDetailEndpoint,
        claimsReturned: evidence.claims?.length || 0,
        proofItemsReturned: evidence.proofItems?.length || 0,
        linksReturned: evidence.links?.length || 0,
      },
    };
  }

  const claimPreview = (evidence.claims || []).slice(0, 4);
  return {
    slug: evidence.slug,
    title: evidence.title,
    visibility: evidence.visibility,
    privacyLevel: evidence.privacyLevel,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    linkCount: evidence.links?.length || 0,
    proofItemCount: evidence.proofItems?.length || 0,
    proofItemsAvailable: (evidence.proofItems || []).length > 0,
    claims: claimPreview.map(summarizeProjectEvidenceClaim),
    claimCount: evidence.claims?.length || 0,
    omittedClaimCount: Math.max(0, (evidence.claims?.length || 0) - claimPreview.length),
    confidenceScore: evidence.confidenceScore,
    freshnessScore: evidence.freshnessScore,
    evidenceStrength: evidence.evidenceStrength,
    evidencePayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
      claimsReturned: claimPreview.length,
      fullClaimCount: evidence.claims?.length || 0,
    },
  };
}

function summarizeProjectEvidenceClaim(claim) {
  return {
    id: claim.id,
    claimType: claim.claimType,
    evidenceStrength: claim.evidenceStrength,
    confidenceScore: claim.confidenceScore,
    sourceCount: claim.sourceMaterial?.length || 0,
  };
}

function trustSummary({ claims, projects, domains, internalChecks, liveDemoChecks }) {
  const publicClaims = claims.map(publicClaim);
  const counts = {
    totalClaims: publicClaims.length,
    linkBackedClaims: publicClaims.filter((claim) => claim.evidenceStrength === "link-backed").length,
    sourceBackedClaims: publicClaims.filter((claim) => claim.evidenceStrength === "source-backed").length,
    needsSourceClaims: publicClaims.filter((claim) => claim.evidenceStrength === "needs-source").length,
    staleClaims: publicClaims.filter((claim) => claim.freshnessScore < 55).length,
    privateReferences: publicClaims.filter((claim) => claim.privacyLevel !== "public").length,
    projectEvidencePackets: projects.length,
    liveDemosConfigured: liveDemoChecks.length,
    automatedChecksConfigured: domains.length + internalChecks.length + liveDemoChecks.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    counts,
    strongestClaims: publicClaims
      .slice()
      .sort((left, right) => right.confidenceScore - left.confidenceScore)
      .slice(0, 8),
    staleClaims: publicClaims
      .filter((claim) => claim.freshnessScore < 55)
      .sort((left, right) => left.freshnessScore - right.freshnessScore)
      .slice(0, 8),
    manualReviewPolicy:
      "Claims without public links remain public-safe references until a repo, demo, screenshot, paper, award page, or approved private artifact is attached.",
  };
}

function buildTrustSummaryResponse(summary, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...summary,
      mode: "public-trust-summary",
      detail: "full",
      compact: false,
      fullDetailEndpoint: "/api/trust?detail=full",
      trustPayloadPolicy: {
        fullDetail: true,
        fullDetailEndpoint: "/api/trust?detail=full",
        strongestClaimsReturned: summary.strongestClaims?.length || 0,
        staleClaimsReturned: summary.staleClaims?.length || 0,
      },
    };
  }

  return {
    generatedAt: summary.generatedAt,
    mode: "public-trust-summary",
    detail: "summary",
    compact: true,
    counts: summary.counts,
    strongestClaims: (summary.strongestClaims || []).slice(0, 4).map(summarizeTrustClaim),
    staleClaimCount: summary.staleClaims?.length || 0,
    staleClaimPreview: (summary.staleClaims || []).slice(0, 2).map((claim) => ({
      id: claim.id,
      relatedProject: claim.relatedProject,
      freshnessScore: claim.freshnessScore,
      evidenceStrength: claim.evidenceStrength,
    })),
    manualReviewPolicyAvailable: Boolean(summary.manualReviewPolicy),
    fullDetailEndpoint: "/api/trust?detail=full",
    trustPayloadPolicy: {
      fullDetail: false,
      fullDetailEndpoint: "/api/trust?detail=full",
      strongestClaimPreviewLimit: 4,
      staleClaimPreviewLimit: 2,
      compactStrongestClaimFields: ["id", "text", "evidenceStrength", "confidenceScore", "relatedProject", "sourceCount"],
      omittedFromSummary: [
        "source material labels and URLs",
        "verification method prose",
        "expiration policy prose",
        "suggested repair prose",
        "full stale claim text",
        "manual review policy text",
      ],
    },
  };
}

function summarizeTrustClaim(claim) {
  return {
    id: claim.id,
    text: claim.text,
    evidenceStrength: claim.evidenceStrength,
    confidenceScore: claim.confidenceScore,
    relatedProject: claim.relatedProject,
    sourceCount: claim.sourceMaterial?.length || 0,
  };
}

function inferTimePeriod(text) {
  const years = String(text).match(/\b20\d{2}\b/g);
  return years?.join(", ") || "undated";
}

function overlaps(left, right) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  let hits = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) hits += 1;
  }
  return hits >= Math.min(4, Math.max(2, Math.floor(leftTokens.size / 3)));
}

function tokenSet(value) {
  return new Set(
    String(value)
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length > 3) || [],
  );
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
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
  buildClaimLedger,
  buildProjectEvidenceResponse,
  buildTrustSummaryResponse,
  claimsForProject,
  evidenceForProject,
  publicClaim,
  trustSummary,
};
