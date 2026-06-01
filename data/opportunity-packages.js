function buildOpportunityPackages({
  opportunities,
  packets,
  artifactCatalog,
  weaknessMap,
  maintenance,
  proofTrials,
  claims,
}) {
  const packages = (opportunities.opportunities || []).map((opportunity) =>
    buildPackage({
      opportunity,
      packets,
      artifactCatalog,
      weaknessMap,
      maintenance,
      proofTrials,
      claims,
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    mode: "proof-backed-opportunity-packages",
    sourceBoundary:
      "Packages are generated from local public-safe opportunity, packet, claim, artifact, weakness, maintenance, and proof-trial data. They do not claim live postings, deadlines, applications, acceptances, scholarships, grants, funding, or outreach status.",
    manualOnlyPolicy:
      "Every package is a preparation artifact only. The app must not send messages, submit applications, schedule meetings, claim recipient interest, or write to third-party systems automatically.",
    summary: {
      packages: packages.length,
      readyForManualUse: packages.filter((item) => item.decisionGate.readyForManualUse).length,
      needsProofRepair: packages.filter((item) => !item.decisionGate.readyForManualUse).length,
      averageReadiness: average(packages.map((item) => item.readinessScore)),
      totalMissingProof: packages.reduce((sum, item) => sum + item.blockers.length, 0),
      repairPlanItems: packages.reduce((sum, item) => sum + item.proofRepairPlan.length, 0),
      highPriorityRepairItems: packages.reduce(
        (sum, item) => sum + item.proofRepairPlan.filter((step) => step.priority === "high").length,
        0,
      ),
      manualOnlyPackages: packages.filter((item) => item.packageReadiness.manualOnly && item.packageReadiness.externalWrite === false).length,
      topPackageId: packages[0]?.id || null,
    },
    packages,
  };
}

function selectOpportunityPackage(value, catalog) {
  const normalized = String(value || "").toLowerCase().trim();
  return (
    catalog.packages.find((item) => item.id === normalized || item.opportunityId === normalized || item.packageId === normalized) ||
    null
  );
}

function buildOpportunityPackagesResponse(catalog, { fullDetail = false } = {}) {
  if (fullDetail) {
    return {
      ...catalog,
      detail: "full",
      compact: false,
      packagePayloadPolicy: {
        fullDetail: true,
        packagesReturned: catalog.packages?.length || 0,
        fullDetailEndpoint: "/api/opportunity-packages?detail=full",
      },
    };
  }

  const packages = (catalog.packages || []).map(compactOpportunityPackageIndex);
  const totals = (catalog.packages || []).reduce(
    (counts, item) => ({
      evidenceBundle: counts.evidenceBundle + item.evidenceBundle.length,
      requirementCoverage: counts.requirementCoverage + item.requirementCoverage.length,
      deRiskingChecklist: counts.deRiskingChecklist + item.deRiskingChecklist.length,
      riskRegister: counts.riskRegister + item.riskRegister.length,
      blockers: counts.blockers + item.blockers.length,
      proofRepairPlan: counts.proofRepairPlan + item.proofRepairPlan.length,
      sourceTrace: counts.sourceTrace + item.sourceTrace.length,
    }),
    {
      evidenceBundle: 0,
      requirementCoverage: 0,
      deRiskingChecklist: 0,
      riskRegister: 0,
      blockers: 0,
      proofRepairPlan: 0,
      sourceTrace: 0,
    },
  );
  const returned = { evidenceBundle: 0 };

  return {
    mode: catalog.mode,
    manualOnlyPolicySummary: {
      manualOnly: true,
      externalWrite: false,
      blocksSendMessage: true,
    },
    summary: compactOpportunityPackageSummary(catalog.summary),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: "/api/opportunity-packages?detail=full",
    packagePayloadPolicy: {
      fullDetail: false,
      packagesReturned: packages.length,
      totals: { evidenceBundle: totals.evidenceBundle },
      returned: { evidenceBundle: returned.evidenceBundle },
    },
    packages,
  };
}

function compactOpportunityPackageIndex(item) {
  return {
    id: item.id,
    readiness: item.readinessScore,
    counts: packageIndexCounts(item),
    repairAvailable: Boolean(item.proofRepairPlan?.[0]?.action),
  };
}

function compactOpportunityPackageSummary(summary = {}) {
  return {
    packages: summary.packages || 0,
    repairPlanItems: summary.repairPlanItems || 0,
    manualOnlyPackages: summary.manualOnlyPackages || 0,
    topPackageId: summary.topPackageId || null,
  };
}

function packageIndexCounts(item) {
  return {
    projects: item.evidenceBundle?.length || 0,
    claims: (item.evidenceBundle || []).reduce((sum, project) => sum + (project.claims?.length || 0), 0),
    artifacts: (item.evidenceBundle || []).reduce((sum, project) => sum + (project.artifacts?.length || 0), 0),
    deRisk: item.deRiskingChecklist?.length || 0,
    repairs: item.proofRepairPlan?.length || 0,
    traces: item.sourceTrace?.length || 0,
  };
}

function summarizeTopPackageEvidence(bundle = []) {
  const topProject = bundle[0] || null;
  return {
    slug: topProject?.slug || null,
    score: topProject?.evidenceScore || 0,
    trialReady: topProject?.proofTrial?.descriptorComplete === true,
    weaknessRisk: topProject?.weakness?.riskLevel || null,
  };
}

function summarizeFirstPackageProofRepair(plan = []) {
  const first = plan[0] || null;
  return {
    actionAvailable: Boolean(first?.action),
  };
}

function buildOpportunityPackageDetailResponse(item, { detail = "summary" } = {}) {
  const fullDetail = ["1", "true", "full"].includes(String(detail || "").toLowerCase());
  const fullDetailEndpoint = `/api/opportunity-packages/${item.id}?detail=full`;
  if (fullDetail) {
    return {
      ...item,
      detail: "full",
      compact: false,
      summaryEndpoint: `/api/opportunity-packages/${item.id}`,
      fullDetailEndpoint,
      packagePayloadPolicy: {
        fullDetail: true,
        fullDetailEndpoint,
        summaryEndpoint: `/api/opportunity-packages/${item.id}`,
        fullFieldsPreserved: [
          "trackingBoundary.reason",
          "evidenceBundle.claims",
          "evidenceBundle.artifacts.url",
          "requirementCoverage.evidence",
          "requirementCoverage.repairAction",
          "deRiskingChecklist.reason",
          "deRiskingChecklist.verificationCommand",
          "proofRepairPlan.action",
          "proofRepairPlan.verificationCommand",
          "executionPlan",
          "decisionGate.reason",
        ],
      },
    };
  }

  const compact = compactOpportunityPackage(item);
  return {
    ...compact,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    packagePayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
    },
  };
}

function compactOpportunityPackage(item) {
  return {
    id: item.id,
    label: item.label,
    audience: item.audience,
    fitScore: item.fitScore,
    readinessScore: item.readinessScore,
    readinessBand: item.readinessBand,
    packetConfidence: compactPacketConfidence(item.packetConfidence),
    trackingBoundary: compactTrackingBoundary(item.trackingBoundary),
    evidenceBundle: item.evidenceBundle.slice(0, 1).map(compactEvidenceBundleIndexProject),
    requirementCoverage: item.requirementCoverage.slice(0, 3).map(compactRequirementCoverage),
    deRiskingChecklist: item.deRiskingChecklist.slice(0, 4).map(compactChecklistItem),
    blockerCount: item.blockers.length,
    packageReadiness: compactPackageReadinessSummary(item.packageReadiness),
    proofRepairPlan: item.proofRepairPlan.slice(0, 2).map(compactProofRepairStep),
    executionPlanStepCount: item.executionPlan.length,
    decisionGate: compactDecisionGate(item.decisionGate),
  };
}

function compactEvidenceBundleProject(project) {
  return {
    slug: project.slug,
    title: project.title,
    evidenceScore: project.evidenceScore,
    evidenceStrength: project.evidenceStrength,
    matchedTermCount: project.matchedTerms?.length || 0,
    claims: project.claims.slice(0, 1).map((claim) => ({
      id: claim.id,
      privacyLevel: claim.privacyLevel,
      confidenceScore: claim.confidenceScore,
    })),
    artifacts: project.artifacts.slice(0, 1).map((artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      label: artifact.label,
    })),
    proofTrial: project.proofTrial
      ? {
          id: project.proofTrial.id,
          mode: project.proofTrial.mode,
          descriptorComplete: project.proofTrial.descriptorComplete,
        }
      : null,
    weakness: project.weakness
      ? {
          riskLevel: project.weakness.riskLevel,
          weakClaims: project.weakness.weakClaims,
          missingArtifacts: project.weakness.missingArtifacts,
        }
      : null,
  };
}

function compactEvidenceBundleIndexProject(project) {
  return {
    slug: project.slug,
    evidenceScore: project.evidenceScore,
    claimCount: project.claims?.length || 0,
    artifactCount: project.artifacts?.length || 0,
    proofTrialReady: project.proofTrial?.descriptorComplete === true,
    weaknessRisk: project.weakness?.riskLevel || null,
  };
}

function compactPacketConfidence(packetConfidence) {
  return {
    score: packetConfidence?.score || 0,
    band: packetConfidence?.band || "insufficient",
  };
}

function compactTrackingBoundary(boundary) {
  return {
    livePostingKnown: boundary?.livePostingKnown === true,
    applicationStateKnown: boundary?.applicationStateKnown === true,
  };
}

function compactRequirementCoverage(item) {
  return {
    requirement: item.requirement,
    status: item.status,
  };
}

function compactChecklistItem(item) {
  return {
    id: item.id,
    status: item.status,
  };
}

function compactPackageReadiness(readiness) {
  return {
    requirementsCovered: readiness.requirementsCovered,
    requirementsTotal: readiness.requirementsTotal,
    missingRequirements: readiness.missingRequirements,
    proofProjects: readiness.proofProjects,
    averageProofScore: readiness.averageProofScore,
    repairPlanItems: readiness.repairPlanItems,
    highPriorityRepairItems: readiness.highPriorityRepairItems,
    estimatedEffort: readiness.estimatedEffort,
    expectedUpside: readiness.expectedUpside,
    manualOnly: readiness.manualOnly,
    externalWrite: readiness.externalWrite,
    livePostingKnown: readiness.livePostingKnown,
    applicationStateKnown: readiness.applicationStateKnown,
    requirementsReady: readiness.requirementsReady,
    proofReady: readiness.proofReady,
  };
}

function compactPackageReadinessSummary(readiness) {
  return {
    requirementsCovered: readiness.requirementsCovered,
    requirementsTotal: readiness.requirementsTotal,
    missingRequirements: readiness.missingRequirements,
    repairPlanItems: readiness.repairPlanItems,
    highPriorityRepairItems: readiness.highPriorityRepairItems,
    manualOnly: readiness.manualOnly,
    externalWrite: readiness.externalWrite,
    proofReady: readiness.proofReady,
  };
}

function compactPackageReadinessIndex(readiness) {
  return {
    manualOnly: readiness.manualOnly,
    externalWrite: readiness.externalWrite,
  };
}

function compactProofRepairStep(step) {
  return {
    id: step.id,
    order: step.order,
    priority: step.priority,
  };
}

function compactProofRepairIndexStep(step) {
  return {
    id: step.id,
    priority: step.priority,
    actionAvailable: true,
    verificationCommandAvailable: true,
  };
}

function compactSourceTrace(trace) {
  return {
    type: trace.type,
    id: trace.id,
    readinessContribution: trace.readinessContribution,
    steps: trace.steps,
  };
}

function compactDecisionGate(gate) {
  return {
    readyForManualUse: gate.readyForManualUse,
    minimumBeforeOutreachCount: gate.minimumBeforeOutreach?.length || 0,
  };
}

function countBy(items, key) {
  return (items || []).reduce((counts, item) => {
    const value = item?.[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function buildPackage({ opportunity, packets, artifactCatalog, weaknessMap, maintenance, proofTrials, claims }) {
  const packet = selectPacketForOpportunity(opportunity, packets);
  const bundle = evidenceBundleFor({ opportunity, artifactCatalog, weaknessMap, proofTrials, claims });
  const requirementCoverage = coverageFor({ opportunity, bundle });
  const riskRegister = riskRegisterFor({ opportunity, bundle, maintenance });
  const deRiskingChecklist = checklistFor({ opportunity, bundle, requirementCoverage, packet, riskRegister });
  const blockers = orderedUnique([
    ...opportunity.missingProof,
    ...requirementCoverage.filter((item) => item.status !== "covered").map((item) => item.repairAction),
    ...deRiskingChecklist.filter((item) => item.status !== "complete").map((item) => item.repairAction),
  ]).slice(0, 8);
  const packetConfidence = packet?.uncertaintyDisclosure?.confidenceScore || 0;
  const readinessScore = clamp(
    Math.round(
      opportunity.fitScore * 0.36 +
        average(bundle.map((item) => item.evidenceScore)) * 0.26 +
        packetConfidence * 0.2 +
        coverageScore(requirementCoverage) * 0.18 -
        blockers.length * 3,
    ),
    0,
    100,
  );
  const readinessBand = readinessBandFor(readinessScore);
  const missingRequirements = requirementCoverage.filter((item) => item.status !== "covered");
  const proofRepairPlan = proofRepairPlanFor({
    opportunity,
    bundle,
    requirementCoverage,
    deRiskingChecklist,
    riskRegister,
    blockers,
  });
  const packageReadiness = {
    requirementsCovered: requirementCoverage.length - missingRequirements.length,
    requirementsTotal: requirementCoverage.length,
    missingRequirements: missingRequirements.length,
    proofProjects: bundle.length,
    averageProofScore: average(bundle.map((item) => item.evidenceScore)),
    repairPlanItems: proofRepairPlan.length,
    highPriorityRepairItems: proofRepairPlan.filter((step) => step.priority === "high").length,
    estimatedEffort: opportunity.estimatedEffort || "unknown",
    expectedUpside: opportunity.expectedUpside || "unknown",
    manualOnly: true,
    externalWrite: false,
    livePostingKnown: false,
    applicationStateKnown: false,
    requirementsReady: missingRequirements.length === 0,
    proofReady: bundle.length >= 3 && bundle.every((item) => item.artifacts.length > 0),
    verificationCommand: `npm run check && node server.js # then open /api/opportunity-packages/${opportunity.id}`,
  };

  return {
    id: opportunity.id,
    packageId: `opportunity-package-${opportunity.id}`,
    label: `${opportunity.label} package`,
    opportunityId: opportunity.id,
    type: opportunity.type,
    audience: opportunity.audience,
    fitScore: opportunity.fitScore,
    readinessScore,
    readinessBand,
    selectedPacketId: packet?.id || null,
    packetConfidence: packet
      ? {
          score: packet.uncertaintyDisclosure.confidenceScore,
          band: packet.uncertaintyDisclosure.confidenceBand,
          caveats: packet.uncertaintyDisclosure.caveats.slice(0, 3),
        }
      : {
          score: 0,
          band: "insufficient",
          caveats: ["No matching audience packet was generated for this opportunity yet."],
        },
    trackingBoundary: {
      deadline: opportunity.deadline,
      livePostingKnown: false,
      applicationStateKnown: false,
      reason: "The current opportunity radar is archetype-based. A real posting or deadline must be ingested before claiming application status.",
    },
    evidenceBundle: bundle,
    requirementCoverage,
    deRiskingChecklist,
    riskRegister,
    blockers,
    packageReadiness,
    proofRepairPlan,
    sourceTrace: [
      ...(opportunity.sourceTrace || []),
      ...(packet ? [{ type: "audience-packet", id: packet.id, label: packet.label }] : []),
      ...bundle.slice(0, 3).map((item) => ({
        type: "evidence-bundle-project",
        id: item.slug,
        label: item.title,
        readinessContribution: item.evidenceScore,
      })),
      {
        type: "proof-repair-plan",
        id: `proof-repair-${opportunity.id}`,
        label: "Verification-backed local proof repair plan",
        steps: proofRepairPlan.length,
      },
    ],
    executionPlan: executionPlanFor({ opportunity, bundle, blockers, readinessScore }),
    decisionGate: {
      readyForManualUse: readinessScore >= 70 && blockers.length <= 4,
      reason:
        readinessScore >= 70 && blockers.length <= 4
          ? "The package has enough public-safe proof for manual review, while still disclosing uncertainty."
          : "Repair the highest-impact missing proof before using this package in real outreach or applications.",
      minimumBeforeOutreach: proofRepairPlan.slice(0, 4).map((step) => step.action),
    },
    verificationCommand: `npm run check && node server.js # then open /api/opportunity-packages/${opportunity.id}`,
    nextAction:
      proofRepairPlan[0]?.action ||
      blockers[0] ||
      opportunity.nextAction ||
      `Manually review the ${opportunity.label} package and keep automatic sending disabled.`,
  };
}

function evidenceBundleFor({ opportunity, artifactCatalog, weaknessMap, proofTrials, claims }) {
  const weaknessBySlug = new Map((weaknessMap.projects || []).map((project) => [project.slug, project]));
  const trialBySlug = new Map((proofTrials.trials || []).map((trial) => [trial.slug, trial]));
  return (opportunity.relatedProof || []).slice(0, 4).map((proof) => {
    const projectClaims = claims
      .filter((claim) => claim.relatedProject === proof.slug)
      .sort((left, right) => right.confidenceScore - left.confidenceScore)
      .slice(0, 4);
    const artifacts = (artifactCatalog.artifacts || [])
      .filter((artifact) => artifact.project === proof.slug)
      .filter((artifact) => artifact.sourceStatus === "available")
      .sort((left, right) => right.confidenceScore - left.confidenceScore)
      .slice(0, 4);
    const weakness = weaknessBySlug.get(proof.slug);
    const trial = trialBySlug.get(proof.slug);
    const trialDescriptorComplete =
      Boolean(trial) &&
      trial.mode === "deterministic-local-replay" &&
      trial.sandbox?.allowedWrites === "none" &&
      trial.sandbox?.credentials === "forbidden" &&
      (trial.assertions || []).length >= 5;
    const missingArtifacts = (artifactCatalog.gaps || []).filter((gap) => gap.project === proof.slug);
    const evidenceScore = clamp(
      Math.round(
        proof.score * 0.35 +
          average(projectClaims.map((claim) => claim.confidenceScore)) * 0.35 +
          artifacts.length * 4 +
          (trialDescriptorComplete ? 8 : 0) -
          (weakness?.riskLevel === "high" ? 8 : weakness?.riskLevel === "medium" ? 4 : 0) -
          missingArtifacts.length * 2,
      ),
      0,
      100,
    );
    return {
      slug: proof.slug,
      title: proof.title,
      evidenceScore,
      matchedTerms: proof.matchedTerms || [],
      evidenceStrength: proof.evidenceStrength,
      claims: projectClaims.map((claim) => ({
        id: claim.id,
        evidenceStrength: claim.evidenceStrength,
        privacyLevel: claim.privacyLevel,
        confidenceScore: claim.confidenceScore,
      })),
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        artifactType: artifact.artifactType,
        label: artifact.label,
        url: artifact.url,
        command: artifact.command,
      })),
      proofTrial: trial
        ? {
            id: trial.id,
            mode: trial.mode,
            descriptorComplete: trialDescriptorComplete,
            resultKnown: false,
            allowedWrites: trial.sandbox.allowedWrites,
            credentials: trial.sandbox.credentials,
          }
        : null,
      weakness: weakness
        ? {
            riskLevel: weakness.riskLevel,
            weakClaims: weakness.weakClaims.length,
            privateReferences: weakness.privateReferences.length,
            missingArtifacts: weakness.missingArtifacts.length,
          }
        : null,
    };
  });
}

function coverageFor({ opportunity, bundle }) {
  return (opportunity.applicationRequirements || []).map((requirement, index) => {
    const normalized = requirement.toLowerCase();
    const matchingProject = bundle.find((item) =>
      [item.title, item.evidenceStrength, item.matchedTerms.join(" "), item.claims.map((claim) => claim.evidenceStrength).join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(normalized.split(/\s+/)[0]),
    );
    const hasStrongArtifacts = bundle.some((item) => item.artifacts.length >= 3 && item.proofTrial?.passed);
    const status = matchingProject ? "covered" : hasStrongArtifacts && index < 2 ? "partial" : "missing";
    return {
      requirement,
      status,
      evidence: matchingProject ? `${matchingProject.title} contributes direct evidence.` : hasStrongArtifacts ? "Existing artifact and replay coverage partially supports this requirement." : "No direct public-safe evidence matched this requirement yet.",
      repairAction:
        status === "covered"
          ? "Keep the supporting claim and artifact receipts fresh."
          : `Attach a public-safe artifact, case-study section, or claim that explicitly covers: ${requirement}.`,
    };
  });
}

function checklistFor({ opportunity, bundle, requirementCoverage, packet, riskRegister }) {
  return [
    {
      id: "proof-bundle",
      label: "Public-safe proof bundle",
      status: bundle.length >= 3 && bundle.every((item) => item.artifacts.length > 0) ? "complete" : "needs-repair",
      reason: `${bundle.length} project(s) selected; ${bundle.reduce((sum, item) => sum + item.artifacts.length, 0)} artifact(s) available.`,
      repairAction: "Add or approve public-safe artifacts for each selected proof project.",
      verificationCommand: "npm run check && node server.js # then open /api/artifacts",
    },
    {
      id: "requirements",
      label: "Requirement coverage",
      status: requirementCoverage.every((item) => item.status === "covered") ? "complete" : "needs-repair",
      reason: `${requirementCoverage.filter((item) => item.status === "covered").length}/${requirementCoverage.length} requirement(s) covered.`,
      repairAction: "Repair missing requirement coverage before using the package externally.",
      verificationCommand: `npm run check && node server.js # then open /api/opportunity-packages/${opportunity.id}`,
    },
    {
      id: "packet-confidence",
      label: "Audience packet confidence",
      status: packet?.uncertaintyDisclosure?.confidenceScore >= 65 ? "complete" : "needs-review",
      reason: packet
        ? `${packet.label} confidence is ${packet.uncertaintyDisclosure.confidenceScore}/100.`
        : "No matching audience packet exists.",
      repairAction: "Improve the matching audience packet or disclose low confidence before manual use.",
      verificationCommand: packet ? `npm run check && node server.js # then open /api/packets/${packet.id}` : "npm run check",
    },
    {
      id: "manual-boundary",
      label: "Manual-only execution boundary",
      status: "complete",
      reason: "The package forbids automatic sending, submissions, scheduling, and third-party writes.",
      repairAction: "Keep this boundary explicit if the package is reused in a private workflow.",
      verificationCommand: "npm run check",
    },
    {
      id: "risk-register",
      label: "Risk register reviewed",
      status: riskRegister.some((risk) => risk.severity === "high") ? "needs-review" : "complete",
      reason: `${riskRegister.length} risk item(s) generated from opportunity and proof weakness data.`,
      repairAction: "Resolve high-severity proof or privacy risks before manual outreach.",
      verificationCommand: "npm run check && node server.js # then open /api/maintenance",
    },
  ];
}

function riskRegisterFor({ opportunity, bundle, maintenance }) {
  const maintenanceByProject = new Map();
  for (const issue of maintenance.issues || []) {
    if (!issue.project) continue;
    const list = maintenanceByProject.get(issue.project) || [];
    list.push(issue);
    maintenanceByProject.set(issue.project, list);
  }
  return [
    {
      severity: opportunity.missingProof.length > 4 ? "high" : opportunity.missingProof.length ? "medium" : "low",
      risk: opportunity.risk,
      mitigation: opportunity.missingProof[0] || "Keep opportunity claims tied to current public-safe evidence.",
      source: "opportunity-radar",
    },
    ...bundle.slice(0, 3).map((item) => {
      const issues = maintenanceByProject.get(item.slug) || [];
      return {
        severity: item.weakness?.riskLevel || (issues.some((issue) => issue.severity === "high") ? "high" : "low"),
        risk: `${item.title} may underperform if weak claims, private references, or missing artifacts are not repaired.`,
        mitigation: issues[0]?.suggestedFix || `Keep ${item.title} proof receipts fresh and public-safe.`,
        source: item.slug,
      };
    }),
  ];
}

function executionPlanFor({ opportunity, bundle, blockers, readinessScore }) {
  const steps = [
    {
      step: 1,
      action: `Open the ${opportunity.label} package and confirm the opportunity is still an archetype, not a live posting.`,
      sideEffect: "read-only",
      evidence: opportunity.sourceTrace?.[0]?.id || opportunity.id,
    },
    {
      step: 2,
      action: `Review proof order: ${bundle.map((item) => item.title).join(", ") || "no proof projects selected"}.`,
      sideEffect: "read-only",
      evidence: bundle[0]?.slug || opportunity.id,
    },
    {
      step: 3,
      action: blockers.length ? `Repair first blocker: ${blockers[0]}` : "Confirm the de-risking checklist is still green.",
      sideEffect: "local-only",
      evidence: blockers[0] || "de-risking-checklist",
    },
    {
      step: 4,
      action:
        readinessScore >= 70
          ? "Manually adapt the package outside the app only after reviewing claims, caveats, and public-safe artifacts."
          : "Do not use externally yet; raise readiness by repairing missing proof first.",
      sideEffect: "manual-only",
      evidence: "decision-gate",
    },
  ];
  return steps;
}

function proofRepairPlanFor({ opportunity, bundle, requirementCoverage, deRiskingChecklist, riskRegister, blockers }) {
  const verificationCommand = `npm run check && node server.js # then open /api/opportunity-packages/${opportunity.id}`;
  const manualUseBoundary = "Local proof repair only; do not send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems.";
  const requirementSteps = requirementCoverage
    .filter((requirement) => requirement.status !== "covered")
    .map((requirement, index) => ({
      id: `requirement-${index + 1}`,
      priority: requirement.status === "missing" ? "high" : "medium",
      action: requirement.repairAction,
      source: "requirement-coverage",
      evidence: requirement.requirement,
      sideEffect: "local-only",
      effort: opportunity.estimatedEffort || "unknown",
      upside: opportunity.expectedUpside || "unknown",
      expectedImpact: "Turns an implicit opportunity requirement into explicit public-safe proof before manual use.",
      verificationCommand,
      manualUseBoundary,
    }));
  const checklistSteps = deRiskingChecklist
    .filter((item) => item.status !== "complete")
    .map((item) => ({
      id: `checklist-${slugify(item.id)}`,
      priority: item.status === "needs-repair" ? "high" : "medium",
      action: item.repairAction,
      source: "de-risking-checklist",
      evidence: item.label,
      sideEffect: "local-only",
      effort: opportunity.estimatedEffort || "unknown",
      upside: opportunity.expectedUpside || "unknown",
      expectedImpact: item.reason,
      verificationCommand: item.verificationCommand || verificationCommand,
      manualUseBoundary,
    }));
  const blockerSteps = blockers.map((blocker, index) => ({
    id: `blocker-${index + 1}`,
    priority: index < 2 ? "high" : "medium",
    action: blocker,
    source: "opportunity-package-blocker",
    evidence: opportunity.id,
    sideEffect: "local-only",
    effort: opportunity.estimatedEffort || "unknown",
    upside: opportunity.expectedUpside || "unknown",
    expectedImpact: "Removes a named blocker that currently prevents confident manual opportunity use.",
    verificationCommand,
    manualUseBoundary,
  }));
  const riskSteps = riskRegister
    .filter((risk) => risk.severity !== "low")
    .map((risk, index) => ({
      id: `risk-${index + 1}`,
      priority: risk.severity === "high" ? "high" : "medium",
      action: risk.mitigation,
      source: risk.source || "risk-register",
      evidence: risk.risk,
      sideEffect: "local-only",
      effort: opportunity.estimatedEffort || "unknown",
      upside: opportunity.expectedUpside || "unknown",
      expectedImpact: "Lowers residual proof, privacy, or maintenance risk before a human reviews the package.",
      verificationCommand,
      manualUseBoundary,
    }));
  const evidenceSteps = bundle
    .filter((item) => item.evidenceScore < 75 || item.artifacts.length < 2 || !item.proofTrial?.descriptorComplete)
    .map((item) => ({
      id: `evidence-${slugify(item.slug)}`,
      priority: item.evidenceScore < 55 ? "high" : "medium",
      action: `Strengthen ${item.title} with current public-safe artifact receipts, claim support, and deterministic replay notes.`,
      source: "evidence-bundle",
      evidence: item.slug,
      sideEffect: "local-only",
      effort: opportunity.estimatedEffort || "unknown",
      upside: opportunity.expectedUpside || "unknown",
      expectedImpact: `Raises evidence depth for ${item.title} without claiming private or live external status.`,
      verificationCommand: "npm run check && node server.js # then open /api/artifacts",
      manualUseBoundary,
    }));
  const fallbackSteps = [
    {
      id: "boundary-review",
      priority: "medium",
      action: `Re-open ${opportunity.label} and confirm it is still an archetype package with no live posting, deadline, or application-state claim.`,
      source: "tracking-boundary",
      evidence: opportunity.id,
      sideEffect: "read-only",
      effort: opportunity.estimatedEffort || "unknown",
      upside: opportunity.expectedUpside || "unknown",
      expectedImpact: "Prevents the package from drifting into unsupported live opportunity claims.",
      verificationCommand,
      manualUseBoundary,
    },
    {
      id: "proof-order-review",
      priority: "medium",
      action: `Review the selected proof order for ${opportunity.label}: ${bundle.map((item) => item.title).join(", ") || "no proof projects selected"}.`,
      source: "evidence-bundle",
      evidence: bundle[0]?.slug || opportunity.id,
      sideEffect: "read-only",
      effort: opportunity.estimatedEffort || "unknown",
      upside: opportunity.expectedUpside || "unknown",
      expectedImpact: "Keeps the strongest public-safe projects at the front of the opportunity package.",
      verificationCommand,
      manualUseBoundary,
    },
    {
      id: "manual-gate-review",
      priority: "medium",
      action: `Confirm ${opportunity.label} still forbids automatic sending, submissions, scheduling, and third-party writes.`,
      source: "manual-only-policy",
      evidence: "manual-only-policy",
      sideEffect: "read-only",
      effort: opportunity.estimatedEffort || "unknown",
      upside: opportunity.expectedUpside || "unknown",
      expectedImpact: "Preserves the human review boundary around opportunity work.",
      verificationCommand: "npm run check",
      manualUseBoundary,
    },
  ];

  return orderedUniqueSteps([...requirementSteps, ...checklistSteps, ...blockerSteps, ...riskSteps, ...evidenceSteps, ...fallbackSteps])
    .slice(0, 8)
    .map((step, index) => ({ ...step, order: index + 1 }));
}

function selectPacketForOpportunity(opportunity, packets) {
  const text = `${opportunity.audience} ${opportunity.type} ${opportunity.label}`.toLowerCase();
  const id = /research|professor|publication|lab|mentor/.test(text)
    ? "professor"
    : /founder|startup|hackathon|civic|collaborator/.test(text)
      ? "founder"
      : "recruiter";
  return (packets.packets || []).find((packet) => packet.id === id) || packets.packets?.[0] || null;
}

function coverageScore(items) {
  if (!items.length) return 0;
  return Math.round(
    (items.reduce((sum, item) => sum + (item.status === "covered" ? 100 : item.status === "partial" ? 55 : 15), 0) /
      items.length),
  );
}

function readinessBandFor(score) {
  if (score >= 78) return "strong";
  if (score >= 65) return "usable-with-review";
  if (score >= 45) return "needs-proof";
  return "blocked";
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

function orderedUniqueSteps(steps) {
  const seen = new Set();
  const result = [];
  for (const step of steps) {
    if (!step.action || seen.has(step.action)) continue;
    seen.add(step.action);
    result.push(step);
  }
  return result;
}

function slugify(value) {
  return (
    String(value || "step")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "step"
  );
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  buildOpportunityPackages,
  buildOpportunityPackageDetailResponse,
  buildOpportunityPackagesResponse,
  selectOpportunityPackage,
};
