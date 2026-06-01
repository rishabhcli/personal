const ENDPOINT = "/api/skill-gaps";
const DEFAULT_PREVIEW_LIMIT = 5;
const MAX_PREVIEW_LIMIT = 120;

function buildSkillGapMap({ projects, claims, artifactCatalog }) {
  const skills = collectSkills(projects).map((skill) => skillEvidence({ skill, projects, claims, artifactCatalog }));
  const sorted = skills.sort((left, right) => statusRank(right.status) - statusRank(left.status) || right.projectCount - left.projectCount);
  return {
    generatedAt: new Date().toISOString(),
    mode: "public-skill-gap-map",
    sourceBoundary:
      "Skill maps are derived from public-safe project tags, stacks, claims, and artifacts. They classify proof strength without inventing certifications, endorsements, or external assessments.",
    summary: {
      skills: sorted.length,
      proven: sorted.filter((skill) => skill.status === "proven").length,
      claimed: sorted.filter((skill) => skill.status === "claimed").length,
      weak: sorted.filter((skill) => skill.status === "weak").length,
      missingProof: sorted.filter((skill) => skill.status === "missing-proof").length,
    },
    skills: sorted,
  };
}

function selectSkill(value, catalog) {
  const normalized = slugify(value);
  return catalog.skills.find((skill) => skill.id === normalized || skill.aliases.includes(normalized)) || null;
}

function buildSkillGapMapResponse(catalog, { detail = "summary", previewLimit = DEFAULT_PREVIEW_LIMIT } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedPreview = resolvePreviewLimit(previewLimit);
  const skills = catalog.skills || [];
  if (fullDetail) {
    return {
      ...catalog,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      skillPayloadPolicy: skillPayloadPolicy({ fullDetail, previewLimit: boundedPreview, skills, returnedSkills: skills.length }),
    };
  }

  const summarizedSkills = skills.slice(0, boundedPreview).map(summarizeSkill);
  return {
    mode: catalog.mode,
    summary: catalog.summary,
    sourceBoundaryAvailable: Boolean(catalog.sourceBoundary),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    skills: summarizedSkills,
    skillPayloadPolicy: skillPayloadPolicy({ fullDetail, previewLimit: boundedPreview, skills, returnedSkills: summarizedSkills.length }),
  };
}

function collectSkills(projects) {
  const byId = new Map();
  for (const project of projects) {
    for (const raw of [...project.tags, ...project.stack]) {
      const label = normalizeLabel(raw);
      const id = slugify(label);
      if (!id || label.length < 2) continue;
      const entry = byId.get(id) || { id, label, aliases: new Set(), projectSlugs: new Set() };
      entry.aliases.add(slugify(raw));
      entry.projectSlugs.add(project.slug);
      byId.set(id, entry);
    }
  }
  return [...byId.values()].map((entry) => ({
    id: entry.id,
    label: entry.label,
    aliases: [...entry.aliases],
    projectSlugs: [...entry.projectSlugs],
  }));
}

function skillEvidence({ skill, projects, claims, artifactCatalog }) {
  const relatedProjects = skill.projectSlugs.map((slug) => projects.find((project) => project.slug === slug)).filter(Boolean);
  const relatedClaims = claims.filter(
    (claim) => relatedProjects.some((project) => project.slug === claim.relatedProject) && claimMentionsSkill(claim, skill),
  );
  const strongClaims = relatedClaims.filter((claim) => claim.evidenceStrength === "link-backed" || claim.evidenceStrength === "source-backed");
  const weakClaims = relatedClaims.filter((claim) => claim.evidenceStrength === "needs-source");
  const privateClaims = relatedClaims.filter((claim) => claim.privacyLevel !== "public");
  const staleClaims = relatedClaims.filter((claim) => claim.freshnessScore < 55);
  const relatedArtifacts = (artifactCatalog.artifacts || []).filter((artifact) => relatedProjects.some((project) => project.slug === artifact.project));
  const availableArtifacts = relatedArtifacts.filter((artifact) => artifact.sourceStatus === "available");
  const missingArtifacts = (artifactCatalog.gaps || []).filter((gap) => relatedProjects.some((project) => project.slug === gap.project));
  const status = classifyStatus({ strongClaims, weakClaims, privateClaims, staleClaims, availableArtifacts, missingArtifacts });
  const proofProjects = relatedProjects
    .map((project) => {
      const projectClaims = relatedClaims.filter((claim) => claim.relatedProject === project.slug);
      return {
        slug: project.slug,
        title: project.title,
        score: project.score,
        evidenceStrength: strongest(projectClaims.map((claim) => claim.evidenceStrength)),
        confidenceScore: average(projectClaims.map((claim) => claim.confidenceScore)),
      };
    })
    .sort((left, right) => right.confidenceScore - left.confidenceScore)
    .slice(0, 5);

  return {
    id: skill.id,
    label: skill.label,
    aliases: skill.aliases,
    status,
    projectCount: relatedProjects.length,
    provenProjects: proofProjects.filter((project) => project.evidenceStrength === "link-backed" || project.evidenceStrength === "source-backed"),
    claimedProjects: proofProjects,
    weakProjects: proofProjects.filter((project) => project.evidenceStrength === "needs-source"),
    evidence: {
      strongClaimCount: strongClaims.length,
      weakClaimCount: weakClaims.length,
      privateReferenceCount: privateClaims.length,
      staleClaimCount: staleClaims.length,
      artifactCount: availableArtifacts.length,
      missingArtifactCount: missingArtifacts.length,
      averageConfidence: average(relatedClaims.map((claim) => claim.confidenceScore)),
    },
    missingProof: missingProofFor({ skill, status, weakClaims, privateClaims, staleClaims, missingArtifacts, availableArtifacts }),
    improvementActions: improvementActionsFor({ skill, status, weakClaims, privateClaims, staleClaims, missingArtifacts, availableArtifacts }),
  };
}

function classifyStatus({ strongClaims, weakClaims, privateClaims, staleClaims, availableArtifacts, missingArtifacts }) {
  if (strongClaims.length >= 4 && availableArtifacts.length >= 2 && weakClaims.length === 0) return "proven";
  if (strongClaims.length > 0 && (weakClaims.length > 0 || privateClaims.length > 0 || staleClaims.length > 0 || missingArtifacts.length > 0)) return "weak";
  if (strongClaims.length > 0) return "claimed";
  return "missing-proof";
}

function missingProofFor({ skill, status, weakClaims, privateClaims, staleClaims, missingArtifacts, availableArtifacts }) {
  const missing = [];
  if (status === "missing-proof") missing.push(`Attach a source-backed project artifact proving ${skill.label}.`);
  if (weakClaims.length) missing.push(`${weakClaims.length} claim(s) mentioning related projects need stronger source evidence.`);
  if (privateClaims.length) missing.push(`${privateClaims.length} private reference(s) need public-safe approval or redaction.`);
  if (staleClaims.length) missing.push(`${staleClaims.length} stale claim(s) should be refreshed.`);
  if (missingArtifacts.length) missing.push(`${missingArtifacts.length} screenshot/artifact gap(s) remain.`);
  if (!availableArtifacts.length) missing.push(`No available artifact currently anchors ${skill.label}.`);
  return [...new Set(missing)].slice(0, 5);
}

function improvementActionsFor({ skill, status, weakClaims, privateClaims, staleClaims, missingArtifacts, availableArtifacts }) {
  const actions = [];
  if (weakClaims[0]) actions.push(action("high", weakClaims[0].suggestedRepair, "weak claim", "npm run check"));
  if (privateClaims.length) actions.push(action("medium", `Approve or redact public-safe ${skill.label} private references.`, "private reference", "ENABLE_PRIVATE_COCKPIT=1 npm start # then open /api/private/approvals locally"));
  if (staleClaims[0]) actions.push(action("medium", staleClaims[0].suggestedRepair, "stale claim", "npm run check"));
  if (missingArtifacts[0]) actions.push(action("medium", missingArtifacts[0].suggestedRepair, "missing artifact", "npm run audit:visual && npm run check"));
  if (!availableArtifacts.length || status === "missing-proof") actions.push(action("high", `Attach a public-safe artifact proving ${skill.label}.`, "missing proof", "npm run check"));
  if (!actions.length) actions.push(action("low", `Keep ${skill.label} evidence fresh and add richer proof only when real artifacts exist.`, "maintenance", "npm run check"));
  return actions.slice(0, 5);
}

function action(priority, text, reason, verificationCommand) {
  return { priority, action: text, reason, verificationCommand };
}

function summarizeSkill(skill) {
  return {
    id: skill.id,
    label: skill.label,
    status: skill.status,
    projectCount: skill.projectCount,
    projectPreview: (skill.claimedProjects || []).slice(0, 1).map(({ slug }) => ({
      slug,
    })),
    evidenceSummary: summarizeSkillEvidence(skill.evidence),
    missingProofCount: (skill.missingProof || []).length,
    improvementActions: (skill.improvementActions || []).slice(0, 1).map(({ priority }) => ({
      priority,
      actionAvailable: true,
    })),
  };
}

function summarizeSkillEvidence(evidence = {}) {
  return {
    averageConfidence: evidence.averageConfidence || 0,
  };
}

function skillPayloadPolicy({ fullDetail, previewLimit, skills, returnedSkills }) {
  if (!fullDetail) {
    return {
      fullDetail: false,
      previewLimit,
      skillsReturned: returnedSkills,
      totalSkills: skills.length,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail: true,
    compact: false,
    previewLimit,
    skillsReturned: returnedSkills,
    totalSkills: skills.length,
    totalProjectReferences: skills.reduce(
      (sum, skill) => sum + (skill.provenProjects || []).length + (skill.claimedProjects || []).length + (skill.weakProjects || []).length,
      0,
    ),
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    skillDetailEndpointTemplate: `${ENDPOINT}/:skill`,
  };
}

function resolvePreviewLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_PREVIEW_LIMIT;
  return Math.min(Math.floor(numeric), MAX_PREVIEW_LIMIT);
}

function claimMentionsSkill(claim, skill) {
  const text = `${claim.text} ${claim.claimType} ${claim.sourceMaterial?.map((source) => source.label).join(" ") || ""}`.toLowerCase();
  const candidates = [skill.label, ...skill.aliases].map((value) => String(value).toLowerCase());
  return candidates.some((candidate) => {
    const tokens = candidate.match(/[a-z0-9+#.]+/g) || [];
    if (!tokens.length) return false;
    if (text.includes(candidate)) return true;
    return tokens.length > 1 && tokens.every((token) => token.length <= 2 || text.includes(token));
  });
}

function normalizeLabel(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

function statusRank(status) {
  return { proven: 4, claimed: 3, weak: 2, "missing-proof": 1 }[status] || 0;
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
  buildSkillGapMap,
  buildSkillGapMapResponse,
  selectSkill,
};
