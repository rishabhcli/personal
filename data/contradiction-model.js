function detectContradictions({ projects, claims }) {
  const conflicts = [
    ...privacyVisibilityConflicts(claims),
    ...verificationResultConflicts(claims),
    ...duplicateUrlConflicts(projects),
    ...opposingClaimTextConflicts(claims),
  ];
  return {
    generatedAt: new Date().toISOString(),
    mode: "claim-contradiction-report",
    sourceBoundary:
      "Contradiction detection uses local public-safe project and claim metadata. It quarantines suspect claims from stronger presentation but does not delete source records.",
    rules: [
      "Private claims cannot be projected as unrestricted public claims.",
      "Claims marked needs-source cannot simultaneously claim source-backed verification.",
      "Different projects should not silently share the same repo/live URL.",
      "Opposing shipped/not-shipped or won/did-not-win claim text in one project is quarantined.",
    ],
    summary: {
      conflicts: conflicts.length,
      quarantinedClaims: [...new Set(conflicts.flatMap((conflict) => conflict.affectedClaims))].length,
      highSeverity: conflicts.filter((conflict) => conflict.severity === "high").length,
    },
    conflicts,
    quarantine: conflicts.map((conflict) => ({
      id: `quarantine.${conflict.id}`,
      conflictId: conflict.id,
      affectedClaims: conflict.affectedClaims,
      action: "Exclude affected claims from strongest/public proof ordering until reviewed.",
      suggestedResolution: conflict.suggestedResolution,
      verificationCommand: "npm run check && node server.js # then open /api/contradictions",
    })),
  };
}

function privacyVisibilityConflicts(claims) {
  return claims
    .filter((claim) => claim.privacyLevel !== "public" && claim.publicVisibility === "public")
    .map((claim) =>
      conflict({
        id: `privacy.${claim.id}`,
        severity: "high",
        project: claim.relatedProject,
        affectedClaims: [claim.id],
        reason: "Private-reference claim is projected as unrestricted public.",
        suggestedResolution: "Change publicVisibility to public-safe-reference or approve a public-safe artifact first.",
      }),
    );
}

function verificationResultConflicts(claims) {
  return claims
    .filter((claim) => claim.evidenceStrength === "needs-source" && claim.verificationResult === "source-backed")
    .map((claim) =>
      conflict({
        id: `verification.${claim.id}`,
        severity: "medium",
        project: claim.relatedProject,
        affectedClaims: [claim.id],
        reason: "Claim needs source evidence but verification result says source-backed.",
        suggestedResolution: "Either attach the source and update evidenceStrength, or downgrade verificationResult to needs-evidence.",
      }),
    );
}

function duplicateUrlConflicts(projects) {
  const byUrl = new Map();
  for (const project of projects) {
    for (const [field, value] of [
      ["repoUrl", project.repoUrl],
      ["liveUrl", project.liveUrl],
    ]) {
      if (!value) continue;
      const key = `${field}:${value}`;
      const list = byUrl.get(key) || [];
      list.push(project);
      byUrl.set(key, list);
    }
  }
  return [...byUrl.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) =>
      conflict({
        id: `duplicate-url.${slugify(key)}`,
        severity: "medium",
        project: null,
        affectedClaims: [],
        reason: `${list.length} projects share ${key}.`,
        suggestedResolution: "Confirm this is intentional, split the project records, or explain the shared URL.",
        affectedProjects: list.map((project) => project.slug),
      }),
    );
}

function opposingClaimTextConflicts(claims) {
  const byProject = new Map();
  for (const claim of claims) {
    if (!claim.relatedProject) continue;
    const list = byProject.get(claim.relatedProject) || [];
    list.push(claim);
    byProject.set(claim.relatedProject, list);
  }
  const conflicts = [];
  for (const [project, projectClaims] of byProject.entries()) {
    const shipped = projectClaims.filter((claim) => /\b(shipped|built|launched|won|first place)\b/i.test(claim.text));
    const negated = projectClaims.filter((claim) => /\b(not shipped|never shipped|did not win|lost|unbuilt)\b/i.test(claim.text));
    if (shipped.length && negated.length) {
      conflicts.push(
        conflict({
          id: `opposing-text.${project}`,
          severity: "high",
          project,
          affectedClaims: [...shipped.slice(0, 2), ...negated.slice(0, 2)].map((claim) => claim.id),
          reason: "Project has both positive shipped/won language and negating language.",
          suggestedResolution: "Review the claims, split time periods if both are true, or quarantine the weaker claim.",
        }),
      );
    }
  }
  return conflicts;
}

function conflict({ id, severity, project, affectedClaims, affectedProjects = [], reason, suggestedResolution }) {
  return {
    id,
    severity,
    project,
    affectedClaims,
    affectedProjects,
    reason,
    suggestedResolution,
  };
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

module.exports = {
  detectContradictions,
};
