const ENDPOINT = "/api/weaknesses";

function buildProjectWeaknessMap({ projects, claims, artifactCatalog, maintenance, proofTrials }) {
  const projectMaps = projects.map((project) => weaknessForProject({ project, claims, artifactCatalog, maintenance, proofTrials }));
  return {
    generatedAt: new Date().toISOString(),
    mode: "public-project-weakness-map",
    sourceBoundary:
      "Weakness maps use public-safe claim, artifact, maintenance, and proof-trial metadata. They disclose gaps without exposing private source documents or credentials.",
    summary: {
      projects: projectMaps.length,
      projectsWithHighRisk: projectMaps.filter((item) => item.riskLevel === "high").length,
      totalWeakClaims: projectMaps.reduce((sum, item) => sum + item.weakClaims.length, 0),
      totalMissingArtifacts: projectMaps.reduce((sum, item) => sum + item.missingArtifacts.length, 0),
      totalImprovementActions: projectMaps.reduce((sum, item) => sum + item.improvementActions.length, 0),
    },
    projects: projectMaps,
  };
}

function selectProjectWeakness(value, catalog) {
  const slug = String(value || "").toLowerCase().trim();
  return catalog.projects.find((project) => project.slug === slug) || null;
}

function buildProjectWeaknessMapResponse(catalog, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...catalog,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      projectPayloadPolicy: projectPayloadPolicy({ fullDetail, catalog, returnedProjects: catalog.projects.length }),
    };
  }

  const projects = (catalog.projects || []).map(summarizeProjectWeakness);
  return {
    mode: catalog.mode,
    sourceBoundaryAvailable: Boolean(catalog.sourceBoundary),
    summary: catalog.summary,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    projects,
    projectPayloadPolicy: projectPayloadPolicy({ fullDetail, catalog, returnedProjects: projects.length }),
  };
}

function buildProjectWeaknessDetailResponse(project, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = `${ENDPOINT}/${project.slug}?detail=full`;
  if (fullDetail) {
    return {
      ...project,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      weaknessDetailPayloadPolicy: weaknessDetailPayloadPolicy({ project, fullDetail }),
    };
  }

  return {
    slug: project.slug,
    title: project.title,
    tier: project.tier,
    riskLevel: project.riskLevel,
    evidenceScore: project.evidenceScore,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    weaknessIndexEndpoint: ENDPOINT,
    counts: weaknessCounts(project),
    proofTrial: project.proofTrial
      ? {
          id: project.proofTrial.id,
          mode: project.proofTrial.mode,
          approvalGateRequired: Boolean(project.proofTrial.approvalGateRequired),
          writesDisabled: project.proofTrial.allowedWrites === "none",
        }
      : null,
    missingArtifactPreview: (project.missingArtifacts || []).slice(0, 1).map((artifact) => ({
      id: artifact.id,
      gapType: artifact.gapType,
      label: artifact.label,
      suggestedRepairAvailable: Boolean(artifact.suggestedRepair),
    })),
    maintenanceIssuePreview: (project.maintenanceIssues || []).slice(0, 2).map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      verificationCommandAvailable: Boolean(issue.verificationCommand),
    })),
    improvementActions: (project.improvementActions || []).slice(0, 3).map((action) => ({
      priority: action.priority,
      actionAvailable: Boolean(action.action),
      reasonAvailable: Boolean(action.reason),
      verificationCommandAvailable: Boolean(action.verificationCommand),
    })),
    weaknessDetailPayloadPolicy: weaknessDetailPayloadPolicy({ project, fullDetail }),
  };
}

function weaknessForProject({ project, claims, artifactCatalog, maintenance, proofTrials }) {
  const projectClaims = claims.filter((claim) => claim.relatedProject === project.slug);
  const weakClaims = projectClaims.filter((claim) => claim.evidenceStrength === "needs-source");
  const staleClaims = projectClaims.filter((claim) => claim.freshnessScore < 55);
  const privateReferences = projectClaims.filter((claim) => claim.privacyLevel !== "public");
  const missingArtifacts = (artifactCatalog.gaps || []).filter((gap) => gap.project === project.slug);
  const maintenanceIssues = (maintenance.issues || []).filter((issue) => issue.project === project.slug);
  const proofTrial = (proofTrials.trials || []).find((trial) => trial.slug === project.slug);
  const riskPoints =
    weakClaims.length * 3 +
    staleClaims.length * 2 +
    privateReferences.length * 2 +
    missingArtifacts.length * 2 +
    maintenanceIssues.filter((issue) => issue.severity === "high").length * 4;
  const riskLevel = riskPoints >= 12 ? "high" : riskPoints >= 5 ? "medium" : "low";
  const improvementActions = actionsForProject({
    project,
    weakClaims,
    staleClaims,
    privateReferences,
    missingArtifacts,
    maintenanceIssues,
    proofTrial,
  });

  return {
    slug: project.slug,
    title: project.title,
    tier: project.tier,
    riskLevel,
    evidenceScore: projectClaims.length ? average(projectClaims.map((claim) => claim.confidenceScore)) : project.score,
    weakClaims: weakClaims.map(publicClaimSummary),
    staleClaims: staleClaims.map(publicClaimSummary),
    privateReferences: privateReferences.map(publicClaimSummary),
    missingArtifacts: missingArtifacts.map((gap) => ({
      id: gap.id,
      gapType: gap.gapType,
      label: gap.label,
      suggestedRepair: gap.suggestedRepair,
    })),
    proofTrial: proofTrial
      ? {
          id: proofTrial.id,
          mode: proofTrial.mode,
          approvalGateRequired: proofTrial.sandbox.approvalGateRequired,
          allowedWrites: proofTrial.sandbox.allowedWrites,
        }
      : null,
    maintenanceIssues: maintenanceIssues.slice(0, 5).map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      title: issue.title,
      verificationCommand: issue.verificationCommand,
    })),
    improvementActions,
  };
}

function summarizeProjectWeakness(project) {
  return {
    slug: project.slug,
    riskLevel: project.riskLevel,
    counts: {
      weakClaims: project.weakClaims.length,
      missingArtifacts: project.missingArtifacts.length,
    },
    actionCount: project.improvementActions.length,
  };
}

function weaknessCounts(project) {
  return {
    weakClaims: project.weakClaims?.length || 0,
    staleClaims: project.staleClaims?.length || 0,
    privateReferences: project.privateReferences?.length || 0,
    missingArtifacts: project.missingArtifacts?.length || 0,
    maintenanceIssues: project.maintenanceIssues?.length || 0,
    improvementActions: project.improvementActions?.length || 0,
  };
}

function weaknessDetailPayloadPolicy({ project, fullDetail }) {
  return {
    fullDetail,
    fullDetailEndpoint: `${ENDPOINT}/${project.slug}?detail=full`,
    compact: !fullDetail,
    weakClaimsReturned: fullDetail ? project.weakClaims?.length || 0 : 0,
    privateReferencesReturned: fullDetail ? project.privateReferences?.length || 0 : 0,
    improvementActionsReturned: fullDetail ? project.improvementActions?.length || 0 : Math.min(project.improvementActions?.length || 0, 3),
    omittedFromSummaryCount: fullDetail ? 0 : 6,
  };
}

function projectPayloadPolicy({ fullDetail, catalog, returnedProjects }) {
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
      directoryRowsOnly: true,
      projectRowsReturned: returnedProjects,
    };
  }
  return {
    fullDetail,
    returnedProjects,
    totalProjects: catalog.summary?.projects || (catalog.projects || []).length,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    projectDetailEndpointTemplate: `${ENDPOINT}/:slug`,
    directoryRowsOnly: !fullDetail,
    previewLimits: fullDetail
      ? null
      : {
          weakClaims: 0,
          staleClaims: 0,
          missingArtifacts: 0,
          maintenanceIssues: 0,
          improvementActions: 0,
        },
  };
}

function actionsForProject({ project, weakClaims, staleClaims, privateReferences, missingArtifacts, maintenanceIssues, proofTrial }) {
  const actions = [];
  if (weakClaims[0]) {
    actions.push({
      priority: "high",
      action: weakClaims[0].suggestedRepair,
      reason: `${weakClaims.length} claim(s) need stronger source evidence.`,
      verificationCommand: `npm run check && node server.js # then open /api/evidence/${project.slug}`,
    });
  }
  if (staleClaims[0]) {
    actions.push({
      priority: "medium",
      action: staleClaims[0].suggestedRepair,
      reason: `${staleClaims.length} stale claim(s) under the current freshness policy.`,
      verificationCommand: `npm run check && node server.js # then open /api/weaknesses/${project.slug}`,
    });
  }
  if (privateReferences.length) {
    actions.push({
      priority: "medium",
      action: `Create or approve public-safe artifacts for ${project.title}'s private references.`,
      reason: `${privateReferences.length} private reference(s) remain summary-only.`,
      verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then open /api/private/approvals locally",
    });
  }
  if (missingArtifacts[0]) {
    actions.push({
      priority: "medium",
      action: missingArtifacts[0].suggestedRepair,
      reason: `${missingArtifacts.length} missing artifact(s) are tracked.`,
      verificationCommand: "npm run audit:visual && npm run check",
    });
  }
  if (proofTrial && proofTrial.sandbox.allowedWrites !== "none") {
    actions.push({
      priority: "high",
      action: "Disable write-enabled proof-trial behavior.",
      reason: "Proof trials must remain read-only by default.",
      verificationCommand: "npm run check && node server.js # then open /api/proof-trials",
    });
  }
  for (const issue of maintenanceIssues.slice(0, 2)) {
    actions.push({
      priority: issue.severity === "high" ? "high" : "medium",
      action: issue.suggestedFix,
      reason: issue.title,
      verificationCommand: issue.verificationCommand,
    });
  }
  if (!actions.length) {
    actions.push({
      priority: "low",
      action: "Keep evidence fresh and add richer artifacts only when new public-safe proof exists.",
      reason: "No major weakness detected for this project by the current local ledger.",
      verificationCommand: "npm run check",
    });
  }
  return dedupe(actions).slice(0, 6);
}

function publicClaimSummary(claim) {
  return {
    id: claim.id,
    text: claim.text,
    evidenceStrength: claim.evidenceStrength,
    freshnessScore: claim.freshnessScore,
    confidenceScore: claim.confidenceScore,
    privacyLevel: claim.privacyLevel,
    suggestedRepair: claim.suggestedRepair,
  };
}

function dedupe(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = `${action.priority}:${action.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

module.exports = {
  buildProjectWeaknessDetailResponse,
  buildProjectWeaknessMap,
  buildProjectWeaknessMapResponse,
  selectProjectWeakness,
};
