const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const BOARD_ENDPOINT = "/api/opportunity-board";
const STORE_RELATIVE_PATH = path.join("var", "opportunity-board-receipts.json");
const maxReceipts = 50;

function opportunityBoardPlan() {
  return {
    mode: "proof-backed-opportunity-board-plan",
    command: "npm run audit:opportunity-board",
    endpoint: BOARD_ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads the public-safe opportunity board with refresh=1, writes a local receipt under var/, and does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems.",
  };
}

function buildOpportunityBoard({
  opportunities,
  packages,
  opportunityQuality,
  packets,
  artifactCatalog,
  weaknessMap,
  maintenance,
  proofTrials,
  claims,
  routeManifest,
  refreshPlan,
  receipts = [],
}) {
  const opportunityItems = opportunities.opportunities || [];
  const packageItems = packages.packages || [];
  const benchmarkById = new Map((opportunityQuality.packageBenchmarks || []).map((benchmark) => [benchmark.id, benchmark]));
  const weaknessBySlug = new Map((weaknessMap.projects || []).map((project) => [project.slug, project]));
  const trialBySlug = new Map((proofTrials.trials || []).map((trial) => [trial.slug, trial]));
  const claimById = new Map((claims || []).map((claim) => [claim.id, claim]));
  const artifactById = new Map((artifactCatalog.artifacts || []).map((artifact) => [artifact.id, artifact]));

  const boardPackages = packageItems.map((item) =>
    boardPackage({ item, benchmark: benchmarkById.get(item.id), weaknessBySlug, trialBySlug }),
  );
  const gates = buildGates(boardPackages);
  const proofBundles = packageItems.map((item) =>
    proofBundleFor({ item, benchmark: benchmarkById.get(item.id), claimById, artifactById, weaknessBySlug, trialBySlug }),
  );
  const blockerQueue = buildBlockerQueue({ packageItems, boardPackages, weaknessBySlug });
  const audienceLanes = buildAudienceLanes({ boardPackages, packages: packageItems, packets, proofBundles, opportunityItems });
  const checks = boardChecks({
    packages,
    boardPackages,
    gates,
    proofBundles,
    blockerQueue,
    audienceLanes,
    routeManifest,
    refreshPlan,
  });
  const score = boardScore({ boardPackages, proofBundles, audienceLanes, checks, blockerQueue, opportunityQuality });
  const weakestGate = gates.slice().sort((left, right) => left.averageReadiness - right.averageReadiness)[0] || null;
  const highestBlocker = blockerQueue[0] || null;
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "proof-backed-opportunity-board",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${BOARD_ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This board organizes local public-safe opportunity packages into manual review gates. It does not claim live postings, deadlines, applications, interviews, scholarships, grants, funding, recipient interest, or external outreach status.",
    manualUsePolicy:
      "The board is a preparation surface only. It must not send outreach, submit applications, schedule meetings, claim recipient interest, write to third-party systems, or treat archetype opportunities as live postings.",
    sideEffectBoundary:
      "The endpoint reads local public-safe opportunity, evidence, proof, route, and refresh data only. It does not ingest live postings, send outreach, submit applications, schedule meetings, claim recipient interest, or write to third-party systems.",
    plan: opportunityBoardPlan(),
    summary: {
      score,
      band: bandFor(score),
      opportunities: opportunityItems.length,
      packages: boardPackages.length,
      gates: gates.length,
      readyForManualReview: gates.find((gate) => gate.id === "ready-for-manual-review")?.packages.length || 0,
      needsProofRepair: gates.find((gate) => gate.id === "proof-repair-required")?.packages.length || 0,
      blockedUntilProof: gates.find((gate) => gate.id === "blocked-until-proof")?.packages.length || 0,
      proofBundles: proofBundles.length,
      blockerQueue: blockerQueue.length,
      audienceLanes: audienceLanes.length,
      checks: checks.length,
      passing: checks.filter((check) => check.passed).length,
      averageReadiness: average(boardPackages.map((item) => item.readinessScore)),
      opportunityQualityScore: opportunityQuality.summary?.score || 0,
      latestReceiptId: latestReceipt?.id || null,
    },
    gates,
    proofBundles,
    blockerQueue,
    audienceLanes,
    operatingRules: [
      "Use this board to decide what to repair or review manually, not to automate applications or outreach.",
      "Keep every opportunity as an archetype until a real posting, deadline, and source are explicitly ingested.",
      "Do not use a package externally while it is in blocked-until-proof.",
      "Manual review must include caveats, selected packet confidence, and the first unresolved blocker.",
      "Refresh evidence before publishing screenshots, sharing claims, or adapting a package for a real human.",
    ],
    checks,
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    nextAction: highestBlocker
      ? `${highestBlocker.priority} priority: ${highestBlocker.repairAction}`
      : weakestGate?.nextAction || "Manually review ready packages and keep automatic sending disabled.",
    verificationCommand: "npm run check && node server.js # then open /api/opportunity-board",
  };
}

function buildOpportunityBoardFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "proof-backed-opportunity-board-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "proof-backed-opportunity-board" ||
    !report.summary ||
    !report.sourceBoundary ||
    !report.manualUsePolicy ||
    !Array.isArray(report.gates) ||
    report.gates.length !== 3 ||
    !report.gates.every((gate) => gate.id && gate.label && gate.intent && Array.isArray(gate.packages) && gate.nextAction && gate.verificationCommand) ||
    !Array.isArray(report.proofBundles) ||
    !report.proofBundles.every((bundle) => bundle.id && Array.isArray(bundle.projects) && bundle.projects.length > 0 && bundle.useBoundary && bundle.verificationCommand) ||
    !Array.isArray(report.blockerQueue) ||
    !report.blockerQueue.every((blocker) => blocker.id && blocker.repairAction && blocker.verificationCommand && blocker.sideEffectBoundary) ||
    !Array.isArray(report.audienceLanes) ||
    !report.audienceLanes.every((lane) => lane.id && lane.label && lane.safetyRule && lane.nextManualAction) ||
    !Array.isArray(report.operatingRules) ||
    report.operatingRules.length < 4 ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand) ||
    !report.nextAction ||
    !report.verificationCommand
  ) {
    return null;
  }

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${BOARD_ENDPOINT}?refresh=1`,
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs the opportunity board from the latest local receipt. It is cached local proof of manual review readiness, not live posting, application, outreach, schedule, recipient-interest, or third-party account state.",
    manualUsePolicy:
      report.manualUsePolicy ||
      "Use this cached board for manual review planning only. The app must not send messages, submit applications, schedule meetings, claim recipient interest, or write to third-party systems automatically.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || opportunityBoardPlan().sideEffectBoundary,
    plan: opportunityBoardPlan(),
    summary: {
      ...report.summary,
      latestReceiptId: receipt.id,
    },
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || report.summary.score || 0,
      passing: receipt.summary?.passing || report.summary.passing || 0,
      checks: receipt.summary?.checks || report.summary.checks || 0,
    },
    verificationCommand: report.verificationCommand || "npm run audit:opportunity-board && npm run check",
  };
}

function buildOpportunityBoardResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${BOARD_ENDPOINT}?detail=full`,
      boardPayloadPolicy: boardPayloadPolicy({ report, fullDetail }),
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy,
    refreshEndpoint: report.refreshEndpoint,
    detail: "summary",
    compact: true,
    manualUsePolicy: compactManualUsePolicy(report.manualUsePolicy),
    plan: compactBoardPlan(report.plan),
    summary: summarizeCompactBoardSummary(report.summary),
    fullDetailEndpoint: `${BOARD_ENDPOINT}?detail=full`,
    gates: (report.gates || []).map(summarizeBoardGate),
    proofBundleSummary: summarizeProofBundlePortfolio(report.proofBundles || []),
    blockerQueue: (report.blockerQueue || []).slice(0, 2).map(summarizeBoardBlockerQueueItem),
    audienceLanes: (report.audienceLanes || []).slice(0, 3).map(summarizeBoardAudienceLane),
    checks: selectBoardCheckPreview(report.checks || []).map(({ id, passed }) => ({ id, passed })),
    boardPayloadPolicy: boardPayloadPolicy({ report, fullDetail }),
  };
}

function selectOpportunityBoardPackage(value, report, { detail = "summary" } = {}) {
  const normalized = String(value || "").toLowerCase().trim();
  if (!normalized) return null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const gates = report.gates || [];
  for (const gate of gates) {
    const item = (gate.packages || []).find((candidate) => {
      return [candidate.id, candidate.packageId, candidate.opportunityId].filter(Boolean).some((id) => String(id).toLowerCase() === normalized);
    });
    if (!item) continue;
    const proofBundle =
      (report.proofBundles || []).find((bundle) => {
        return [bundle.id, bundle.packageId, bundle.opportunityId].filter(Boolean).some((id) => String(id).toLowerCase() === normalized);
      }) || null;
    const blockerQueue = (report.blockerQueue || []).filter((blocker) => {
      return [blocker.packageId, blocker.opportunityId].filter(Boolean).some((id) => String(id).toLowerCase() === normalized);
    });
    const audienceLane =
      (report.audienceLanes || []).find((lane) => {
        const ids = [...(lane.readyPackageIds || []), ...(lane.repairPackageIds || []), ...(lane.blockedPackageIds || [])];
        return ids.some((id) => String(id).toLowerCase() === normalized);
      }) || null;

    const selected = {
      generatedAt: report.generatedAt,
      checkedAt: report.checkedAt || null,
      mode: "proof-backed-opportunity-board-package",
      cachedFromReceipt: Boolean(report.cachedFromReceipt),
      cachePolicy: report.cachePolicy,
      refreshEndpoint: `${BOARD_ENDPOINT}/${item.id}?refresh=1`,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${BOARD_ENDPOINT}/${item.id}?detail=full`,
      fullBoardEndpoint: `${BOARD_ENDPOINT}?detail=full`,
      sourceBoundary: report.sourceBoundary,
      manualUsePolicy: report.manualUsePolicy,
      sideEffectBoundary: report.sideEffectBoundary,
      id: item.id,
      packageId: item.packageId,
      label: item.label,
      gate: {
        id: gate.id,
        label: gate.label,
        intent: gate.intent,
        nextAction: gate.nextAction,
      },
      package: item,
      proofBundle,
      blockerQueue,
      audienceLane,
      boardSummary: report.summary,
      verificationCommand: item.verificationCommand || proofBundle?.verificationCommand || report.verificationCommand,
    };
    if (fullDetail) {
      return {
        ...selected,
        boardPackagePayloadPolicy: boardPackagePayloadPolicy({ selected, fullDetail }),
      };
    }
    return summarizeSelectedBoardPackage(selected);
  }
  return null;
}

function summarizeSelectedBoardPackage(selected) {
  return {
    mode: selected.mode,
    cachedFromReceipt: selected.cachedFromReceipt,
    refreshEndpoint: selected.refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: selected.fullDetailEndpoint,
    id: selected.id,
    package: summarizeSelectedBoardPackageCore(selected.package || {}),
    proofBundle: selected.proofBundle ? summarizeSelectedProofBundle(selected.proofBundle) : null,
    blockerQueue: (selected.blockerQueue || []).slice(0, 1).map(summarizeSelectedBlockerQueueItem),
    blockerCount: selected.blockerQueue?.length || 0,
    audienceLane: selected.audienceLane ? summarizeSelectedAudienceLane(selected.audienceLane) : null,
    verificationCommandAvailable: Boolean(selected.verificationCommand),
    boardPackagePayloadPolicy: boardPackagePayloadPolicy({ selected, fullDetail: false }),
  };
}

function boardPackagePayloadPolicy({ selected, fullDetail }) {
  if (!fullDetail) {
    return {
      fullDetail: false,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail,
    compact: !fullDetail,
    packageReturned: Boolean(selected.package),
    proofBundleProjectCount: selected.proofBundle?.projects?.length || 0,
    proofBundleProjectsReturned: fullDetail ? selected.proofBundle?.projects?.length || 0 : Math.min(selected.proofBundle?.projects?.length || 0, 1),
    blockerQueueAvailable: selected.blockerQueue?.length || 0,
    blockerQueueReturned: fullDetail ? selected.blockerQueue?.length || 0 : Math.min(selected.blockerQueue?.length || 0, 2),
    audienceLaneReturned: Boolean(selected.audienceLane),
    omittedFromSummaryCount: fullDetail ? 0 : 6,
  };
}

function summarizeSelectedBoardPackageCore(item) {
  return {
    id: item.id,
    readinessScore: item.readinessScore,
    readinessBand: item.readinessBand,
    blockerCount: item.blockerCount,
    verificationCommandAvailable: Boolean(item.verificationCommand),
  };
}

function boardPayloadPolicy({ report, fullDetail }) {
  if (!fullDetail) {
    return {
      fullDetail: false,
      proofBundlesReturned: 0,
    };
  }
  return {
    fullDetail,
    compact: !fullDetail,
    proofBundlesReturned: fullDetail ? report.proofBundles?.length || 0 : 0,
    proofBundlesAvailable: report.proofBundles?.length || 0,
    blockerQueueReturned: fullDetail ? report.blockerQueue?.length || 0 : Math.min(report.blockerQueue?.length || 0, 2),
    blockerQueueAvailable: report.blockerQueue?.length || 0,
    audienceLanesReturned: fullDetail ? report.audienceLanes?.length || 0 : Math.min(report.audienceLanes?.length || 0, 3),
  };
}

function summarizeCompactBoardSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "low",
    packages: summary.packages || 0,
    proofBundles: summary.proofBundles || 0,
    gates: summary.gates || 0,
    blockerQueue: summary.blockerQueue || 0,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function compactBoardPlan(plan) {
  return {
    endpoint: plan?.endpoint || BOARD_ENDPOINT,
  };
}

function summarizeBoardGate(gate) {
  return {
    id: gate.id,
    count: gate.count,
    packages: (gate.packages || []).slice(0, 1).map(summarizeBoardPackage),
    nextActionAvailable: Boolean(gate.nextAction),
  };
}

function summarizeBoardPackage(item) {
  return {
    id: item.id,
    detailEndpoint: `${BOARD_ENDPOINT}/${item.id}`,
  };
}

function summarizeProofBundlePortfolio(bundles) {
  const totals = bundles.reduce(
    (acc, bundle) => {
      acc.projects += bundle.totals?.projects || bundle.projects?.length || 0;
      acc.artifacts += bundle.totals?.artifacts || 0;
      acc.claims += bundle.totals?.claims || 0;
      acc.completeTrialDescriptors += bundle.totals?.completeTrialDescriptors || 0;
      acc.weakProjects += bundle.totals?.weakProjects || 0;
      return acc;
    },
    { projects: 0, artifacts: 0, claims: 0, completeTrialDescriptors: 0, weakProjects: 0 },
  );
  return {
    available: bundles.length,
    returned: 0,
    totals: {
      projects: totals.projects,
    },
  };
}

function summarizeProofBundle(bundle) {
  return {
    id: bundle.id,
    opportunityId: bundle.opportunityId,
    manualUseGate: bundle.manualUseGate,
    readinessScore: bundle.readinessScore,
    qualityScore: bundle.qualityScore,
    totals: bundle.totals,
    projectCount: bundle.projects?.length || 0,
    projectPreview: (bundle.projects || []).slice(0, 1).map((project) => ({
      slug: project.slug,
      evidenceScore: project.evidenceScore,
      artifactCount: project.artifactCount,
      claimCount: project.claimCount,
      proofTrialMode: project.proofTrial?.mode || null,
      riskLevel: project.weakness?.riskLevel || "unknown",
    })),
    disclosureCount: bundle.disclosureItems?.length || 0,
    useBoundaryAvailable: Boolean(bundle.useBoundary),
    detailEndpoint: `${BOARD_ENDPOINT}/${bundle.opportunityId}`,
  };
}

function summarizeSelectedProofBundle(bundle) {
  return {
    id: bundle.id,
    readinessScore: bundle.readinessScore,
    projectCount: bundle.projects?.length || 0,
    artifactCount: bundle.totals?.artifacts || 0,
    claimCount: bundle.totals?.claims || 0,
    projectPreview: (bundle.projects || []).slice(0, 1).map((project) => ({
      slug: project.slug,
      evidenceScore: project.evidenceScore,
    })),
  };
}

function summarizeBlockerQueueItem(item) {
  return {
    id: item.id,
    opportunityId: item.opportunityId,
    gate: item.gate,
    priority: item.priority,
    affectedRequirementAvailable: Boolean(item.affectedRequirement),
    evidenceProjectCount: item.evidenceProjects?.length || 0,
    repairActionAvailable: Boolean(item.repairAction),
    detailEndpoint: `${BOARD_ENDPOINT}/${item.opportunityId}`,
  };
}

function summarizeSelectedBlockerQueueItem(item) {
  return {
    id: item.id,
    priority: item.priority,
    repairActionAvailable: Boolean(item.repairAction),
  };
}

function summarizeBoardBlockerQueueItem(item) {
  return {
    id: item.id,
    detailEndpoint: `${BOARD_ENDPOINT}/${item.opportunityId}`,
  };
}

function summarizeAudienceLane(lane) {
  return {
    id: lane.id,
    primaryPacketId: lane.primaryPacketId,
    audience: lane.audience,
    packageCount: lane.packageCount,
    averageReadiness: lane.averageReadiness,
    readyPackageCount: lane.readyPackageIds?.length || 0,
    repairPackageCount: lane.repairPackageIds?.length || 0,
    blockedPackageCount: lane.blockedPackageIds?.length || 0,
    proofBundleCount: lane.proofBundleIds?.length || 0,
    caveatCount: lane.caveats?.length || 0,
    nextManualActionAvailable: Boolean(lane.nextManualAction),
    safetyRuleAvailable: Boolean(lane.safetyRule),
  };
}

function summarizeSelectedAudienceLane(lane) {
  return {
    id: lane.id,
    proofBundleCount: lane.proofBundleIds?.length || 0,
  };
}

function summarizeBoardAudienceLane(lane) {
  return {
    id: lane.id,
    blockedPackageCount: lane.blockedPackageIds?.length || 0,
  };
}

function compactManualUsePolicy(policy = "") {
  return /must not send/i.test(policy) ? "Manual preparation only; must not send, submit, schedule, or write externally." : policy;
}

function selectBoardCheckPreview(checks) {
  const seen = new Set();
  const required = new Set(["manual-only-policy", "public-route-manifest", "refresh-plan-coverage"]);
  return checks.filter((check) => {
    const keep = !check.passed || check.severity === "high" || required.has(check.id);
    if (!keep || seen.has(check.id)) return false;
    seen.add(check.id);
    return true;
  });
}

function appendOpportunityBoardReceipt(root, receipt) {
  const receipts = readOpportunityBoardReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readOpportunityBoardReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function boardPackage({ item, benchmark, weaknessBySlug, trialBySlug }) {
  const blockerCount = item.blockers.length;
  const weakProjectCount = item.evidenceBundle.filter((project) => {
    const weakness = weaknessBySlug.get(project.slug);
    return weakness?.riskLevel === "high" || weakness?.riskLevel === "medium";
  }).length;
  const completeTrialCount = item.evidenceBundle.filter((project) => trialBySlug.get(project.slug)?.mode === "deterministic-local-replay").length;
  const artifactCount = item.evidenceBundle.reduce((sum, project) => sum + project.artifacts.length, 0);
  const claimCount = item.evidenceBundle.reduce((sum, project) => sum + project.claims.length, 0);
  const gate = gateIdFor(item, benchmark);

  return {
    id: item.id,
    packageId: item.packageId,
    label: item.label,
    audience: item.audience,
    type: item.type,
    gate,
    readinessScore: item.readinessScore,
    readinessBand: item.readinessBand,
    qualityScore: benchmark?.score || item.readinessScore,
    qualityBand: benchmark?.band || bandFor(item.readinessScore),
    fitScore: item.fitScore,
    readyForManualUse: item.decisionGate.readyForManualUse,
    selectedPacketId: item.selectedPacketId,
    blockerCount,
    highRisk: item.riskRegister.some((risk) => risk.severity === "high") || benchmark?.riskBand === "high",
    proofDepth: {
      projects: item.evidenceBundle.length,
      artifacts: artifactCount,
      claims: claimCount,
      deterministicTrials: completeTrialCount,
      weakProjects: weakProjectCount,
    },
    firstBlocker: item.blockers[0] || null,
    nextAction: item.nextAction,
    decisionReason: item.decisionGate.reason,
    verificationCommand: item.verificationCommand,
  };
}

function gateIdFor(item, benchmark) {
  if (item.decisionGate.readyForManualUse && item.readinessScore >= 70 && (benchmark?.riskBand || "low") !== "high") {
    return "ready-for-manual-review";
  }
  if ((item.readinessScore >= 40 || item.readinessBand === "needs-proof") && item.blockers.length <= 7) return "proof-repair-required";
  return "blocked-until-proof";
}

function buildGates(boardPackages) {
  const definitions = [
    {
      id: "ready-for-manual-review",
      label: "Ready for manual review",
      intent: "Packages with enough public-safe proof to be reviewed by the user before any external reuse.",
    },
    {
      id: "proof-repair-required",
      label: "Proof repair required",
      intent: "Packages that have useful direction but need missing-proof repairs before real-world use.",
    },
    {
      id: "blocked-until-proof",
      label: "Blocked until proof",
      intent: "Packages that should stay internal until evidence, requirements, or risk issues are repaired.",
    },
  ];

  return definitions.map((definition) => {
    const packages = boardPackages
      .filter((item) => item.gate === definition.id)
      .sort((left, right) => right.readinessScore - left.readinessScore || left.blockerCount - right.blockerCount);
    return {
      ...definition,
      count: packages.length,
      averageReadiness: average(packages.map((item) => item.readinessScore)),
      packages,
      nextAction: nextActionForGate(definition.id, packages),
      verificationCommand: "npm run check && node server.js # then open /api/opportunity-board",
    };
  });
}

function nextActionForGate(id, packages) {
  if (!packages.length) return "No packages currently sit in this gate.";
  if (id === "ready-for-manual-review") return `Manually review ${packages[0].label} with caveats and automatic sending disabled.`;
  if (id === "proof-repair-required") return packages[0].firstBlocker || packages[0].nextAction;
  return `Keep ${packages[0].label} internal until proof blockers are repaired.`;
}

function proofBundleFor({ item, benchmark, claimById, artifactById, weaknessBySlug, trialBySlug }) {
  const projects = item.evidenceBundle.map((project) => {
    const weakness = weaknessBySlug.get(project.slug);
    const trial = trialBySlug.get(project.slug);
    return {
      slug: project.slug,
      title: project.title,
      evidenceScore: project.evidenceScore,
      artifactCount: project.artifacts.length,
      claimCount: project.claims.length,
      strongestClaimScore: Math.max(0, ...project.claims.map((claim) => claim.confidenceScore || claimById.get(claim.id)?.confidenceScore || 0)),
      artifactTypes: orderedUnique(project.artifacts.map((artifact) => artifact.artifactType || artifactById.get(artifact.id)?.artifactType).filter(Boolean)),
      sampleArtifacts: project.artifacts.slice(0, 2).map((artifact) => ({
        id: artifact.id,
        label: artifact.label,
        artifactType: artifact.artifactType,
        url: artifact.url,
        command: artifact.command,
      })),
      proofTrial: trial
        ? {
            id: trial.id,
            mode: trial.mode,
            descriptorComplete: project.proofTrial?.descriptorComplete === true,
            writeBoundary: trial.sandbox?.allowedWrites || "unknown",
            credentialBoundary: trial.sandbox?.credentials || "unknown",
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
  const disclosureItems = [
    item.trackingBoundary.reason,
    item.packetConfidence.caveats[0],
    item.riskRegister[0]?.risk,
  ].filter(Boolean);

  return {
    id: `proof-bundle-${item.id}`,
    packageId: item.packageId,
    opportunityId: item.opportunityId,
    label: `${item.label} proof bundle`,
    audience: item.audience,
    manualUseGate: gateIdFor(item, benchmark),
    readinessScore: item.readinessScore,
    qualityScore: benchmark?.score || item.readinessScore,
    projects,
    totals: {
      projects: projects.length,
      artifacts: projects.reduce((sum, project) => sum + project.artifactCount, 0),
      claims: projects.reduce((sum, project) => sum + project.claimCount, 0),
      completeTrialDescriptors: projects.filter((project) => project.proofTrial?.descriptorComplete).length,
      weakProjects: projects.filter((project) => project.weakness?.riskLevel === "high" || project.weakness?.riskLevel === "medium").length,
    },
    disclosureItems,
    useBoundary: "Read-only and manual-only. This bundle can inform a draft or review, but it cannot submit, send, schedule, or claim live opportunity status.",
    verificationCommand: item.verificationCommand,
  };
}

function buildBlockerQueue({ packageItems, boardPackages, weaknessBySlug }) {
  const boardById = new Map(boardPackages.map((item) => [item.id, item]));
  const rows = [];
  for (const item of packageItems) {
    const boardItem = boardById.get(item.id);
    for (const [index, blocker] of item.blockers.entries()) {
      rows.push({
        id: `${item.id}-blocker-${index + 1}`,
        packageId: item.packageId,
        opportunityId: item.opportunityId,
        label: item.label,
        gate: boardItem?.gate || gateIdFor(item),
        priority: priorityForBlocker({ index, item, blocker, weaknessBySlug }),
        repairAction: blocker,
        affectedRequirement:
          item.requirementCoverage.find((requirement) => requirement.repairAction === blocker || blocker.includes(requirement.requirement))?.requirement ||
          null,
        evidenceProjects: item.evidenceBundle.map((project) => project.slug),
        verificationCommand: item.verificationCommand,
        sideEffectBoundary: "local-only repair; no external submission or outreach",
      });
    }
  }
  return rows.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function priorityForBlocker({ index, item, blocker, weaknessBySlug }) {
  const highRiskProject = item.evidenceBundle.some((project) => weaknessBySlug.get(project.slug)?.riskLevel === "high");
  if (index === 0 || highRiskProject || /public-safe artifact|missing requirement|before using/i.test(blocker)) return "high";
  if (item.readinessScore < 65 || /confidence|risk|privacy|source/i.test(blocker)) return "medium";
  return "low";
}

function priorityRank(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 3;
}

function buildAudienceLanes({ boardPackages, packages, packets, proofBundles, opportunityItems }) {
  const packetById = new Map((packets.packets || []).map((packet) => [packet.id, packet]));
  const packageById = new Map(packages.map((item) => [item.id, item]));
  const bundleByOpportunity = new Map(proofBundles.map((bundle) => [bundle.opportunityId, bundle]));
  const grouped = new Map();

  for (const item of boardPackages) {
    const laneId = laneIdFor(item, packageById.get(item.id), opportunityItems);
    const list = grouped.get(laneId) || [];
    list.push(item);
    grouped.set(laneId, list);
  }

  return [...grouped.entries()]
    .map(([id, items]) => {
      const sourcePackages = items.map((item) => packageById.get(item.id)).filter(Boolean);
      const packetIds = orderedUnique(sourcePackages.map((item) => item.selectedPacketId).filter(Boolean));
      const primaryPacket = packetIds.map((packetId) => packetById.get(packetId)).find(Boolean) || null;
      const bundles = items.map((item) => bundleByOpportunity.get(item.id)).filter(Boolean);
      return {
        id,
        label: laneLabelFor(id),
        primaryPacketId: primaryPacket?.id || null,
        audience: orderedUnique(items.map((item) => item.audience)).join("; "),
        packageCount: items.length,
        averageReadiness: average(items.map((item) => item.readinessScore)),
        readyPackageIds: items.filter((item) => item.gate === "ready-for-manual-review").map((item) => item.id),
        repairPackageIds: items.filter((item) => item.gate === "proof-repair-required").map((item) => item.id),
        blockedPackageIds: items.filter((item) => item.gate === "blocked-until-proof").map((item) => item.id),
        proofBundleIds: bundles.map((bundle) => bundle.id),
        strongestEvidence: strongestEvidenceFor(bundles),
        caveats: primaryPacket?.uncertaintyDisclosure?.caveats?.slice(0, 2) || ["No audience packet caveat was available."],
        nextManualAction: items.find((item) => item.gate !== "ready-for-manual-review")?.firstBlocker || items[0]?.nextAction || "Review lane manually.",
        safetyRule: "Draft, review, and decide manually. Never send, submit, schedule, or write externally from this board.",
      };
    })
    .sort((left, right) => right.averageReadiness - left.averageReadiness || left.id.localeCompare(right.id));
}

function laneIdFor(item, sourcePackage, opportunityItems) {
  const opportunity = opportunityItems.find((candidate) => candidate.id === item.id);
  const text = `${item.audience} ${item.type} ${item.label} ${sourcePackage?.selectedPacketId || ""} ${opportunity?.type || ""}`.toLowerCase();
  if (/professor|research|publication|lab|mentor/.test(text)) return "research-professor";
  if (/civic|public-interest|community|public safety/.test(text)) return "civic-public-interest";
  if (/hackathon|founder|startup|judge/.test(text)) return "founder-demo";
  if (/open source|developer-tools|manager/.test(text)) return "devtools-open-source";
  if (/agent|infrastructure|engineer|recruiter/.test(text)) return "agent-infrastructure";
  return "general-review";
}

function laneLabelFor(id) {
  return {
    "agent-infrastructure": "Agent infrastructure",
    "research-professor": "Research and professor review",
    "civic-public-interest": "Civic and public-interest",
    "founder-demo": "Founder and demo circuit",
    "devtools-open-source": "Developer-tools open source",
    "general-review": "General manual review",
  }[id];
}

function strongestEvidenceFor(bundles) {
  const projects = bundles.flatMap((bundle) => bundle.projects);
  const strongest = projects.slice().sort((left, right) => right.evidenceScore - left.evidenceScore)[0];
  if (!strongest) return "No proof bundle has been attached yet.";
  return `${strongest.title} at ${strongest.evidenceScore}/100 with ${strongest.artifactCount} artifact(s) and ${strongest.claimCount} claim(s).`;
}

function boardChecks({ packages, boardPackages, gates, proofBundles, blockerQueue, audienceLanes, routeManifest, refreshPlan }) {
  return [
    check({
      id: "manual-only-policy",
      label: "Manual-only policy is explicit",
      passed: /must not send|submit applications|third-party/i.test(packages.manualOnlyPolicy || ""),
      detail: packages.manualOnlyPolicy || "manual policy missing",
      repairAction: "Keep the package and board policies explicit about no sending, submissions, scheduling, or third-party writes.",
    }),
    check({
      id: "all-packages-gated",
      label: "All packages are assigned to gates",
      passed: boardPackages.length > 0 && boardPackages.every((item) => item.gate),
      detail: `${boardPackages.filter((item) => item.gate).length}/${boardPackages.length} package(s) have a gate.`,
      repairAction: "Assign every opportunity package to a manual review, proof repair, or blocked gate.",
    }),
    check({
      id: "proof-bundle-depth",
      label: "Proof bundles include evidence projects",
      passed: proofBundles.length === boardPackages.length && proofBundles.every((bundle) => bundle.projects.length > 0),
      detail: `${proofBundles.filter((bundle) => bundle.projects.length > 0).length}/${proofBundles.length} bundle(s) include project evidence.`,
      repairAction: "Attach public-safe project evidence to every opportunity proof bundle.",
    }),
    check({
      id: "blocker-queue-actionability",
      label: "Blocker queue is actionable",
      passed: blockerQueue.length > 0 && blockerQueue.every((item) => item.repairAction && item.verificationCommand),
      detail: `${blockerQueue.length} blocker(s) include repair action and verification command.`,
      repairAction: "Keep every blocker tied to a concrete local repair action and verification command.",
    }),
    check({
      id: "audience-lane-coverage",
      label: "Audience lanes cover packages",
      passed: audienceLanes.reduce((sum, lane) => sum + lane.packageCount, 0) === boardPackages.length,
      detail: `${audienceLanes.length} lane(s) cover ${audienceLanes.reduce((sum, lane) => sum + lane.packageCount, 0)}/${boardPackages.length} package(s).`,
      repairAction: "Group every package into an audience lane before using the board for review.",
    }),
    check({
      id: "public-route-manifest",
      label: "Route manifest includes board endpoint",
      passed: (routeManifest.publicApiRoutes || []).includes(BOARD_ENDPOINT),
      detail: `${BOARD_ENDPOINT} ${routeManifest.publicApiRoutes?.includes(BOARD_ENDPOINT) ? "is" : "is not"} in the public API route manifest.`,
      repairAction: `Add ${BOARD_ENDPOINT} to the runtime route manifest.`,
    }),
    check({
      id: "refresh-plan-coverage",
      label: "Evidence refresh covers board endpoint",
      passed: (refreshPlan.endpoints || []).includes(BOARD_ENDPOINT),
      detail: `${BOARD_ENDPOINT} ${refreshPlan.endpoints?.includes(BOARD_ENDPOINT) ? "is" : "is not"} in the safe evidence refresh plan.`,
      repairAction: `Add ${BOARD_ENDPOINT} to the safe evidence refresh plan.`,
    }),
  ];
}

function check({ id, label, passed, detail, repairAction }) {
  return {
    id,
    label,
    passed: Boolean(passed),
    severity: passed ? "info" : id.includes("policy") || id.includes("route") ? "high" : "medium",
    detail,
    repairAction,
    verificationCommand: "npm run check && node server.js # then open /api/opportunity-board",
  };
}

function boardScore({ boardPackages, proofBundles, audienceLanes, checks, blockerQueue, opportunityQuality }) {
  const readiness = average(boardPackages.map((item) => item.readinessScore));
  const quality = opportunityQuality.summary?.score || readiness;
  const gateCoverage = percent(boardPackages.filter((item) => item.gate).length, boardPackages.length);
  const checkCoverage = percent(checks.filter((check) => check.passed).length, checks.length);
  const proofCoverage = percent(proofBundles.filter((bundle) => bundle.projects.length && bundle.totals.artifacts > 0).length, boardPackages.length);
  const laneCoverage = percent(audienceLanes.reduce((sum, lane) => sum + lane.packageCount, 0), boardPackages.length);
  const blockerPenalty = Math.min(6, Math.round(percent(blockerQueue.filter((item) => item.priority === "high").length, blockerQueue.length) * 0.06));
  return clamp(
    Math.round(
      checkCoverage * 0.3 +
        gateCoverage * 0.18 +
        proofCoverage * 0.18 +
        laneCoverage * 0.14 +
        quality * 0.12 +
        readiness * 0.08 -
        blockerPenalty,
    ),
    0,
    100,
  );
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

module.exports = {
  appendOpportunityBoardReceipt,
  buildOpportunityBoard,
  buildOpportunityBoardFromReceipt,
  buildOpportunityBoardResponse,
  opportunityBoardPlan,
  readOpportunityBoardReceipts,
  selectOpportunityBoardPackage,
};
