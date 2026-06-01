const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/evaluation/research-rigor";
const STORE_RELATIVE_PATH = path.join("var", "research-rigor-receipts.json");
const maxReceipts = 50;
const COMPACT_GRADEBOOK_PREVIEW_IDS = ["proof-quality", "runtime-evidence-chain", "research-stress", "evaluation-integrity"];
const COMPACT_CHECK_PREVIEW_IDS = ["methodology-repeatability", "gradebook-floor-coverage", "route-manifest"];
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function researchRigorPlan() {
  return {
    mode: "research-grade-rigor-plan",
    command: "npm run audit:research-rigor",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing proof/search/opportunity evaluators, design ambition, runtime evidence chain, research stress, evaluation integrity, route manifests, or refresh coverage.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe research rigor endpoints, writes a local receipt under var/, and does not conduct live user research, contact external services, deploy, publish, collect analytics, enable private cockpit data, or mutate third-party systems.",
  };
}

function buildResearchRigorReport({
  proofQuality,
  searchQuality,
  opportunityQuality,
  usabilityQuality,
  designAmbition,
  runtimeEvidenceChain,
  researchStress,
  evaluationIntegrity,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const evaluationGradebook = buildEvaluationGradebook({
    proofQuality,
    searchQuality,
    opportunityQuality,
    usabilityQuality,
    designAmbition,
    runtimeEvidenceChain,
    researchStress,
    evaluationIntegrity,
  });
  const dimensions = rigorDimensions({
    proofQuality,
    searchQuality,
    opportunityQuality,
    usabilityQuality,
    designAmbition,
    runtimeEvidenceChain,
    researchStress,
    evaluationIntegrity,
    evaluationGradebook,
  });
  const checks = rigorChecks({
    dimensions,
    evaluationGradebook,
    proofQuality,
    searchQuality,
    opportunityQuality,
    usabilityQuality,
    designAmbition,
    runtimeEvidenceChain,
    researchStress,
    evaluationIntegrity,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "research-grade-rigor",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This audit grades the local public-safe evaluation stack for methodology, source traceability, repeatability, adversarial stress, runtime/design coherence, and visible limitations. It is not live user research, academic peer review, production RUM, screen-reader certification, external credential verification, or a private-document audit.",
    sideEffectBoundary:
      "This endpoint reads public-safe in-memory reports and local receipt history only. It does not start recorders, collect analytics, enable private routes, contact external services, deploy, publish, or write to third-party systems.",
    plan: researchRigorPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      dimensions: dimensions.length,
      passingDimensions: dimensions.filter((dimension) => dimension.passed).length,
      gradebookItems: evaluationGradebook.length,
      passingGradebookItems: evaluationGradebook.filter((item) => item.passed).length,
      failingGradebookItems: evaluationGradebook.filter((item) => !item.passed).length,
      minimumGrade: minimumGrade(evaluationGradebook),
      averageGradeScore: average(evaluationGradebook.map((item) => item.score)),
      methodologyScore: dimensionById(dimensions, "methodology").score,
      stressScore: researchStress.summary?.score || 0,
      integrityScore: evaluationIntegrity.summary?.score || 0,
      runtimeChainScore: runtimeEvidenceChain.summary?.score || 0,
      designAmbitionScore: designAmbition.summary?.score || 0,
      latestReceiptId: latestReceipt?.id || null,
      routeCovered: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
    },
    researchContract: researchRigorContract(),
    gradingRubric: researchRigorRubric(),
    evaluationGradebook,
    dimensions,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nonClaims: researchRigorNonClaims(),
    nextAction:
      failing[0]?.repairAction ||
      "Research rigor is locally calibrated; rerun after evaluator, runtime, design, proof, route, or receipt changes.",
    verificationCommand:
      "npm run audit:research-rigor && npm run stress:evaluation && npm run audit:evaluation-integrity && npm run audit:design-ambition && npm run verify",
  };
}

function buildResearchRigorReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "research-grade-rigor-receipt" || !receipt.summary) return null;
  const dimensions = (receipt.dimensions || []).map((item) => ({
    id: item.id,
    label: titleize(item.id),
    score: item.score || 0,
    band: item.band || bandFor(item.score || 0),
    passed: Boolean(item.passed),
    detail: `Cached dimension from ${receipt.id}. Refresh to recompute supporting evaluator detail.`,
    verificationCommand: item.verificationCommand || "npm run audit:research-rigor",
  }));
  const evaluationGradebook = (receipt.evaluationGradebook || []).map((item) => ({
    id: item.id,
    label: titleize(item.id),
    score: item.score || 0,
    floor: item.floor || 0,
    grade: item.grade || letterGrade(item.score || 0),
    passed: Boolean(item.passed),
    evidence: [
      evidenceItem("cached-floor", (item.score || 0) >= (item.floor || 0), `${item.score || 0}/100 score against floor ${item.floor || 0}`),
      evidenceItem("cached-pass-state", Boolean(item.passed), `receipt pass=${Boolean(item.passed)}`),
    ],
    failureMode: "A cached gradebook row may be stale after evaluator, runtime, design, route, or receipt changes.",
    repairAction: item.passed ? "No cached gradebook repair needed." : "Refresh research rigor and repair the failing gradebook row.",
    verificationCommand: item.verificationCommand || "npm run audit:research-rigor",
  }));
  const checks = (receipt.checks || []).map((item) => ({
    id: item.id,
    passed: Boolean(item.passed),
    severity: item.severity || "medium",
    detail: item.detail || `Cached check from ${receipt.id}.`,
    repairAction: item.passed ? "No cached check repair needed." : "Refresh research rigor and repair the failing cached check.",
    verificationCommand: "npm run audit:research-rigor",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "research-grade-rigor",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs the research rigor audit from the latest local receipt. It is a fast public-safe cached report, not live user research, peer review, production monitoring, or private-document audit.",
    sideEffectBoundary: receipt.sideEffectBoundary || researchRigorPlan().sideEffectBoundary,
    plan: researchRigorPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passing: receipt.summary?.passing || 0,
      checks: receipt.summary?.checks || checks.length,
    },
    researchContract: researchRigorContract(),
    gradingRubric: researchRigorRubric(),
    evaluationGradebook,
    dimensions,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nonClaims: researchRigorNonClaims(),
    nextAction:
      failing[0]?.repairAction ||
      "Research rigor is served from the latest local receipt; run npm run audit:research-rigor or ?refresh=1 after evaluator, runtime, design, proof, route, or receipt changes.",
    verificationCommand:
      "npm run audit:research-rigor && npm run stress:evaluation && npm run audit:evaluation-integrity && npm run audit:design-ambition && npm run verify",
  };
}

function buildResearchRigorResponse(
  report,
  { detail = "summary", dimensionPreviewLimit = 2, gradebookPreviewLimit = 2, checkPreviewLimit = 2 } = {},
) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const dimensionLimit = Math.max(2, Math.min(Number(dimensionPreviewLimit) || 6, 25));
  const gradebookLimit = Math.max(2, Math.min(Number(gradebookPreviewLimit) || 8, 25));
  const checkLimit = Math.max(2, Math.min(Number(checkPreviewLimit) || 11, 40));
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      researchRigorPayloadPolicy: researchRigorPayloadPolicy({
        fullDetail,
        report,
        dimensionLimit,
        gradebookLimit,
        checkLimit,
      }),
    };
  }

  const dimensions = selectResearchRigorDimensionPreview(report.dimensions || [], dimensionLimit);
  const gradebook = selectResearchRigorGradebookPreview(report.evaluationGradebook || [], gradebookLimit);
  const checks = selectResearchRigorCheckPreview(report.checks || [], checkLimit);
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    detail: "summary",
    compact: true,
    refreshEndpoint: report.refreshEndpoint,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeResearchRigorCompactSummary(report.summary),
    gradingRubric: summarizeResearchRigorRubric(report.gradingRubric),
    evaluationGradebook: gradebook.map(summarizeResearchRigorGradebookItem),
    dimensions: dimensions.map(summarizeResearchRigorDimension),
    checks: checks.map(summarizeResearchRigorCheck),
    nonClaims: summarizeResearchRigorNonClaims(report.nonClaims || []),
    nonClaimCount: (report.nonClaims || []).length,
    researchRigorPayloadPolicy: researchRigorPayloadPolicy({
      fullDetail,
      report,
      dimensionLimit,
      gradebookLimit,
      checkLimit,
      dimensionsReturned: dimensions.length,
      gradebookReturned: gradebook.length,
      checksReturned: checks.length,
    }),
  };
}

function summarizeResearchRigorCompactSummary(summary = {}) {
  return {
    score: summary.score || 0,
    failing: summary.failing || 0,
    dimensions: summary.dimensions || 0,
    gradebookItems: summary.gradebookItems || 0,
    passingGradebookItems: summary.passingGradebookItems || 0,
    failingGradebookItems: summary.failingGradebookItems || 0,
    minimumGrade: summary.minimumGrade || null,
  };
}

function buildEvaluationGradebook({
  proofQuality,
  searchQuality,
  opportunityQuality,
  usabilityQuality,
  designAmbition,
  runtimeEvidenceChain,
  researchStress,
  evaluationIntegrity,
}) {
  const searchCases = searchQuality.cases || [];
  const stressScenarios = researchStress.scenarios || [];
  return [
    gradebookItem({
      id: "proof-quality",
      label: "Proof quality",
      score: proofQuality.summary?.score || 0,
      floor: 50,
      evidence: [
        evidenceItem("claim-traceability", dimensionScore(proofQuality, "claim-traceability") >= 50, `${dimensionScore(proofQuality, "claim-traceability")}/100 claim traceability`),
        evidenceItem("limitations-visible", (proofQuality.limitations || []).length >= 3, `${proofQuality.limitations?.length || 0} limitation(s)`),
        evidenceItem(
          "repair-guidance",
          (proofQuality.topRisks || []).length > 0 && (proofQuality.topRisks || []).every((risk) => risk.recommendation),
          "top risks carry recommendations",
        ),
      ],
      failureMode: "Weak or unsupported proof becomes summarized as validated portfolio evidence.",
      repairAction: "Restore claim traceability, visible limitations, and repair guidance before raising proof confidence.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/proof-quality",
    }),
    gradebookItem({
      id: "search-quality",
      label: "Search quality",
      score: searchQuality.summary?.score || 0,
      floor: 75,
      evidence: [
        evidenceItem("cases-passing", (searchQuality.summary?.failing || 0) === 0, `${searchQuality.summary?.passing || 0}/${searchQuality.summary?.cases || 0} case(s) passing`),
        evidenceItem(
          "source-traces",
          searchCases.every((item) => (item.results || []).every((result) => result.sourceTrace?.length)),
          `${searchCases.length} case(s) source-traced`,
        ),
        evidenceItem("next-repair", searchCases.every((item) => item.nextRepair), "each case includes next repair guidance"),
      ],
      failureMode: "Search/retrieval looks plausible while losing source traceability or repair guidance.",
      repairAction: "Keep every benchmark case passing, source-traced, and paired with a next repair action.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/search-quality",
    }),
    gradebookItem({
      id: "opportunity-quality",
      label: "Opportunity quality",
      score: opportunityQuality.summary?.score || 0,
      floor: 70,
      evidence: [
        evidenceItem("manual-safety", dimensionScore(opportunityQuality, "manual-safety") >= 80, `${dimensionScore(opportunityQuality, "manual-safety")}/100 manual safety`),
        evidenceItem(
          "live-posting-limit",
          (opportunityQuality.limitations || []).some((item) => /live posting|deadline|application/i.test(item)),
          "live posting, deadline, and application limits disclosed",
        ),
        evidenceItem("package-depth", (opportunityQuality.summary?.packages || 0) >= 5, `${opportunityQuality.summary?.packages || 0} package(s)`),
      ],
      failureMode: "Archetypal opportunities drift into application-ready claims without manual proof gates.",
      repairAction: "Keep opportunity quality manual-only and explicit about live posting, deadline, and application limits.",
      verificationCommand: "npm run audit:opportunity-quality",
    }),
    gradebookItem({
      id: "usability-quality",
      label: "Usability quality",
      score: usabilityQuality.summary?.score || 0,
      floor: 85,
      evidence: [
        evidenceItem("keyboard-workflow", dimensionScore(usabilityQuality, "keyboard-workflow") >= 85, `${dimensionScore(usabilityQuality, "keyboard-workflow")}/100 keyboard workflow`),
        evidenceItem("uncertainty-disclosure", dimensionScore(usabilityQuality, "uncertainty-disclosure") >= 85, `${dimensionScore(usabilityQuality, "uncertainty-disclosure")}/100 uncertainty disclosure`),
        evidenceItem("limitations-visible", (usabilityQuality.limitations || []).length >= 3, `${usabilityQuality.limitations?.length || 0} limitation(s)`),
      ],
      failureMode: "The interface scores well while hiding uncertainty, keyboard gaps, or scripted-test limitations.",
      repairAction: "Repair keyboard and uncertainty dimensions before treating usability as research-grade.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/usability",
    }),
    gradebookItem({
      id: "design-ambition",
      label: "Design ambition",
      score: designAmbition.summary?.score || 0,
      floor: 85,
      evidence: [
        evidenceItem(
          "families-passing",
          (designAmbition.summary?.controlFamilies || 0) >= 6 &&
            (designAmbition.summary?.passingFamilies || 0) === (designAmbition.summary?.controlFamilies || 0),
          `${designAmbition.summary?.passingFamilies || 0}/${designAmbition.summary?.controlFamilies || 0} family/families`,
        ),
        evidenceItem("stability-matrix", (designAmbition.summary?.stabilityMatrixPassing || 0) >= 7, `${designAmbition.summary?.stabilityMatrixPassing || 0}/${designAmbition.summary?.stabilityMatrixItems || 0} stable surface(s)`),
        evidenceItem("non-claims", (designAmbition.nonClaims || []).some((item) => /analytics|keystrokes|private/i.test(item)), "analytics and private-data non-claims visible"),
      ],
      failureMode: "Design polish hides weak proof, private-data boundaries, or unstable dense controls.",
      repairAction: "Restore the design ambition family and stability-matrix gates.",
      verificationCommand: "npm run audit:design-ambition && npm run audit:design-stability",
    }),
    gradebookItem({
      id: "runtime-evidence-chain",
      label: "Runtime evidence chain",
      score: runtimeEvidenceChain.summary?.score || 0,
      floor: 85,
      evidence: [
        evidenceItem("chain-score", (runtimeEvidenceChain.summary?.score || 0) >= 85, `${runtimeEvidenceChain.summary?.score || 0}/100 runtime chain`),
        evidenceItem(
          "chain-links",
          (runtimeEvidenceChain.chainLinks || []).length >= 5 &&
            (runtimeEvidenceChain.chainLinks || []).every((link) => link.endpoint && link.nonClaim && link.verificationCommand),
          `${runtimeEvidenceChain.chainLinks?.length || 0} chain link(s)`,
        ),
        evidenceItem("production-non-claims", (runtimeEvidenceChain.nonClaims || []).some((item) => /CDN|provider|deploy/i.test(item)), "production/CDN/provider non-claims visible"),
      ],
      failureMode: "Local runtime proof is mistaken for production, provider, CDN, or external uptime proof.",
      repairAction: "Keep runtime chain links endpoint-backed, non-claim backed, and command-verifiable.",
      verificationCommand: "npm run audit:runtime-chain",
    }),
    gradebookItem({
      id: "research-stress",
      label: "Research stress",
      score: researchStress.summary?.score || 0,
      floor: 85,
      evidence: [
        evidenceItem("scenarios-passing", (researchStress.summary?.failing || 0) === 0, `${researchStress.summary?.passing || 0}/${researchStress.summary?.scenarios || 0} scenario(s)`),
        evidenceItem("failure-modes", stressScenarios.every((scenario) => scenario.expectedFailureMode), `${stressScenarios.length} expected failure mode(s)`),
        evidenceItem("verification-commands", stressScenarios.every((scenario) => scenario.verificationCommand), "each scenario command-backed"),
      ],
      failureMode: "Stress scenarios become high-level badges without adversarial failure modes or verification commands.",
      repairAction: "Restore failure modes, repair actions, and command-backed scenarios before trusting the stress score.",
      verificationCommand: "npm run stress:evaluation",
    }),
    gradebookItem({
      id: "evaluation-integrity",
      label: "Evaluation integrity",
      score: evaluationIntegrity.summary?.score || 0,
      floor: 85,
      evidence: [
        evidenceItem("integrity-score", (evaluationIntegrity.summary?.score || 0) >= 85 && (evaluationIntegrity.summary?.failing || 0) === 0, `${evaluationIntegrity.summary?.score || 0}/100 integrity; ${evaluationIntegrity.summary?.failing || 0} failing`),
        evidenceItem("repeatability-contract", Boolean(evaluationIntegrity.repeatabilityContract?.command), evaluationIntegrity.repeatabilityContract?.command || "missing repeatability command"),
        evidenceItem("non-claims", (evaluationIntegrity.nonClaims || []).some((item) => /peer review|user research|production/i.test(item)), "research and production non-claims visible"),
      ],
      failureMode: "The aggregate evaluator passes without repeatability, local-only boundaries, or external-validation non-claims.",
      repairAction: "Restore the integrity repeatability contract and non-claim boundary.",
      verificationCommand: "npm run audit:evaluation-integrity",
    }),
  ];
}

function gradebookItem({ id, label, score, floor, evidence, failureMode, repairAction, verificationCommand }) {
  const normalized = clamp(Math.round(score || 0), 0, 100);
  return {
    id,
    label,
    score: normalized,
    floor,
    grade: letterGrade(normalized),
    passed: normalized >= floor && evidence.every((item) => item.passed),
    evidence,
    failureMode,
    repairAction,
    verificationCommand,
  };
}

function evidenceItem(id, passed, detail) {
  return {
    id,
    passed: Boolean(passed),
    detail,
  };
}

function rigorDimensions({
  proofQuality,
  searchQuality,
  opportunityQuality,
  usabilityQuality,
  designAmbition,
  runtimeEvidenceChain,
  researchStress,
  evaluationIntegrity,
  evaluationGradebook,
}) {
  return [
    dimension({
      id: "methodology",
      label: "Methodology disclosure",
      score: average([
        proofQuality.methodology?.dimensions?.length ? 100 : 0,
        (searchQuality.cases || []).length ? 100 : 0,
        usabilityQuality.methodology?.dimensions?.length ? 100 : 0,
        researchStress.methodology?.scenarios?.length ? 100 : 0,
        evaluationIntegrity.repeatabilityContract?.command ? 100 : 0,
      ]),
      passed:
        Boolean(proofQuality.methodology?.dimensions?.length) &&
        Boolean((searchQuality.cases || []).length) &&
        Boolean(usabilityQuality.methodology?.dimensions?.length) &&
        Boolean(researchStress.methodology?.scenarios?.length) &&
        Boolean(evaluationIntegrity.repeatabilityContract?.command),
      detail: "Proof, search, usability, stress, and integrity reports expose methodology, cases, or repeatability contracts.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/research-rigor",
    }),
    dimension({
      id: "source-traceability",
      label: "Source traceability",
      score: average([
        proofQuality.summary?.score || 0,
        dimensionScore(proofQuality, "claim-traceability"),
        searchQuality.summary?.score || 0,
        percent((searchQuality.cases || []).filter((item) => (item.results || []).every((result) => result.sourceTrace?.length)).length, searchQuality.summary?.cases || 0),
      ]),
      passed:
        (proofQuality.summary?.score || 0) >= 50 &&
        dimensionScore(proofQuality, "claim-traceability") >= 50 &&
        (searchQuality.summary?.failing || 0) === 0 &&
        (searchQuality.cases || []).every((item) => (item.results || []).every((result) => result.sourceTrace?.length)),
      detail: `proof=${proofQuality.summary?.score || 0}/100; traceability=${dimensionScore(proofQuality, "claim-traceability")}/100; search=${searchQuality.summary?.score || 0}/100.`,
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/proof-quality and /api/evaluation/search-quality",
    }),
    dimension({
      id: "adversarial-stress",
      label: "Adversarial stress",
      score: average([
        researchStress.summary?.score || 0,
        evaluationIntegrity.summary?.score || 0,
        percent((researchStress.scenarios || []).filter((scenario) => scenario.expectedFailureMode && scenario.repairAction).length, researchStress.summary?.scenarios || 0),
      ]),
      passed:
        (researchStress.summary?.score || 0) >= 85 &&
        (researchStress.summary?.failing || 0) === 0 &&
        (evaluationIntegrity.summary?.score || 0) >= 85 &&
        (evaluationIntegrity.summary?.failing || 0) === 0 &&
        (researchStress.scenarios || []).every((scenario) => scenario.expectedFailureMode && scenario.repairAction && scenario.verificationCommand),
      detail: `stress=${researchStress.summary?.score || 0}/100; integrity=${evaluationIntegrity.summary?.score || 0}/100; scenarios=${researchStress.summary?.passing || 0}/${researchStress.summary?.scenarios || 0}.`,
      verificationCommand: "npm run stress:evaluation && npm run audit:evaluation-integrity",
    }),
    dimension({
      id: "gradebook-calibration",
      label: "Gradebook calibration",
      score: average([
        percent(evaluationGradebook.filter((item) => item.passed).length, evaluationGradebook.length),
        average(evaluationGradebook.map((item) => item.score)),
        evaluationGradebook.every((item) => item.evidence.every((evidence) => evidence.passed)) ? 100 : 0,
      ]),
      passed:
        evaluationGradebook.length >= 8 &&
        evaluationGradebook.every((item) => item.passed && item.verificationCommand && item.repairAction) &&
        evaluationGradebook.every((item) => item.evidence.length >= 2 && item.evidence.every((evidence) => evidence.passed)),
      detail: `${evaluationGradebook.filter((item) => item.passed).length}/${evaluationGradebook.length} evaluator grade(s) meet floors; minimum grade ${minimumGrade(evaluationGradebook)}.`,
      verificationCommand: "npm run audit:research-rigor && npm run audit:evaluation-integrity",
    }),
    dimension({
      id: "runtime-design-coherence",
      label: "Runtime and design coherence",
      score: average([
        runtimeEvidenceChain.summary?.score || 0,
        designAmbition.summary?.score || 0,
        usabilityQuality.summary?.score || 0,
        opportunityQuality.summary?.score || 0,
      ]),
      passed:
        (runtimeEvidenceChain.summary?.score || 0) >= 85 &&
        (designAmbition.summary?.score || 0) >= 85 &&
        (usabilityQuality.summary?.score || 0) >= 85 &&
        (opportunityQuality.summary?.score || 0) >= 70,
      detail: `runtime=${runtimeEvidenceChain.summary?.score || 0}/100; design=${designAmbition.summary?.score || 0}/100; usability=${usabilityQuality.summary?.score || 0}/100; opportunity=${opportunityQuality.summary?.score || 0}/100.`,
      verificationCommand: "npm run audit:runtime-chain && npm run audit:design-ambition",
    }),
    dimension({
      id: "public-safe-limitations",
      label: "Public-safe limitations",
      score: average([
        proofQuality.limitations?.length >= 3 ? 100 : 0,
        usabilityQuality.limitations?.length >= 3 ? 100 : 0,
        designAmbition.nonClaims?.length >= 4 ? 100 : 0,
        runtimeEvidenceChain.nonClaims?.length >= 4 ? 100 : 0,
        evaluationIntegrity.nonClaims?.length >= 4 ? 100 : 0,
      ]),
      passed:
        (proofQuality.limitations || []).length >= 3 &&
        (usabilityQuality.limitations || []).length >= 3 &&
        (designAmbition.nonClaims || []).length >= 4 &&
        (runtimeEvidenceChain.nonClaims || []).length >= 4 &&
        (evaluationIntegrity.nonClaims || []).length >= 4,
      detail: `limitations proof=${proofQuality.limitations?.length || 0}, usability=${usabilityQuality.limitations?.length || 0}; nonClaims design=${designAmbition.nonClaims?.length || 0}, runtime=${runtimeEvidenceChain.nonClaims?.length || 0}, integrity=${evaluationIntegrity.nonClaims?.length || 0}.`,
      verificationCommand: "npm run check",
    }),
  ];
}

function rigorChecks({
  dimensions,
  evaluationGradebook,
  proofQuality,
  searchQuality,
  opportunityQuality,
  designAmbition,
  runtimeEvidenceChain,
  researchStress,
  evaluationIntegrity,
  routeManifest,
  refreshPlan,
  packageManifest,
}) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const scripts = packageManifest.scripts || {};
  const requiredRoutes = [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`];
  const requiredScripts = [
    "audit:research-rigor",
    "stress:evaluation",
    "audit:evaluation-integrity",
    "audit:design-ambition",
    "audit:runtime-deploy",
    "verify",
  ];
  return [
    check(
      "dimension-pass",
      dimensions.length >= 5 && dimensions.every((dimension) => dimension.passed && dimension.verificationCommand),
      "high",
      `${dimensions.filter((dimension) => dimension.passed).length}/${dimensions.length} rigor dimension(s) passing.`,
      "Repair the first failing rigor dimension before treating the evaluation stack as research-grade.",
      "npm run audit:research-rigor",
    ),
    check(
      "methodology-repeatability",
      dimensionById(dimensions, "methodology").passed && Boolean(evaluationIntegrity.repeatabilityContract?.command),
      "high",
      `methodology=${dimensionById(dimensions, "methodology").score}/100; repeatability=${evaluationIntegrity.repeatabilityContract?.command || "missing"}.`,
      "Keep methodology and repeatability contracts visible across proof, search, usability, stress, and integrity reports.",
      "npm run audit:evaluation-integrity",
    ),
    check(
      "stress-and-integrity-current",
      (researchStress.summary?.score || 0) >= 85 &&
        (researchStress.summary?.failing || 0) === 0 &&
        (evaluationIntegrity.summary?.score || 0) >= 85 &&
        (evaluationIntegrity.summary?.failing || 0) === 0,
      "high",
      `stress=${researchStress.summary?.score || 0}/100 failing=${researchStress.summary?.failing || 0}; integrity=${evaluationIntegrity.summary?.score || 0}/100 failing=${evaluationIntegrity.summary?.failing || 0}.`,
      "Refresh research stress and evaluation integrity receipts until both are passing.",
      "npm run stress:evaluation && npm run audit:evaluation-integrity",
    ),
    check(
      "source-traceable-benchmarks",
      (searchQuality.summary?.failing || 0) === 0 &&
        (searchQuality.cases || []).every((item) => item.nextRepair && (item.results || []).every((result) => result.sourceTrace?.length)) &&
        dimensionScore(proofQuality, "claim-traceability") >= 50,
      "high",
      `search=${searchQuality.summary?.passing || 0}/${searchQuality.summary?.cases || 0}; claim traceability=${dimensionScore(proofQuality, "claim-traceability")}/100.`,
      "Keep search benchmark outputs source-traced and proof quality claim-traceability visible.",
      "npm run check && node server.js # then open /api/evaluation/search-quality",
    ),
    check(
      "gradebook-floor-coverage",
      evaluationGradebook.length >= 8 &&
        evaluationGradebook.every((item) => item.passed && item.score >= item.floor && item.evidence.every((evidence) => evidence.passed)) &&
        evaluationGradebook.every((item) => item.verificationCommand && item.failureMode && item.repairAction),
      "high",
      `${evaluationGradebook.filter((item) => item.passed).length}/${evaluationGradebook.length} evaluator grade(s) passing; minimum grade ${minimumGrade(evaluationGradebook)}.`,
      "Repair any evaluator grade below its floor before claiming research-grade rigor.",
      "npm run audit:research-rigor && npm run audit:evaluation-integrity",
    ),
    check(
      "manual-opportunity-boundary",
      (opportunityQuality.summary?.score || 0) >= 70 &&
        (opportunityQuality.limitations || []).some((item) => /live posting|deadline|application/i.test(item)) &&
        (opportunityQuality.summary?.readyForManualUse || 0) <= (opportunityQuality.summary?.packages || 0),
      "medium",
      `opportunity=${opportunityQuality.summary?.score || 0}/100; ready=${opportunityQuality.summary?.readyForManualUse || 0}/${opportunityQuality.summary?.packages || 0}; limitations=${opportunityQuality.limitations?.length || 0}.`,
      "Keep opportunities archetype-bound, manual-only, and explicit about live-posting/deadline limits.",
      "npm run audit:opportunity-quality",
    ),
    check(
      "runtime-design-coherence",
      (runtimeEvidenceChain.summary?.score || 0) >= 85 && (designAmbition.summary?.score || 0) >= 85,
      "high",
      `runtime chain=${runtimeEvidenceChain.summary?.score || 0}/100; design ambition=${designAmbition.summary?.score || 0}/100.`,
      "Refresh runtime chain and design ambition receipts after runtime, route, or UI control changes.",
      "npm run audit:runtime-chain && npm run audit:design-ambition",
    ),
    check(
      "non-claim-boundary",
      (evaluationIntegrity.nonClaims || []).some((item) => /peer review|user research|production/i.test(item)) &&
        (runtimeEvidenceChain.nonClaims || []).some((item) => /CDN|provider|deploy/i.test(item)) &&
        (designAmbition.nonClaims || []).some((item) => /analytics|assistive/i.test(item)),
      "high",
      `integrity nonClaims=${evaluationIntegrity.nonClaims?.length || 0}; runtime nonClaims=${runtimeEvidenceChain.nonClaims?.length || 0}; design nonClaims=${designAmbition.nonClaims?.length || 0}.`,
      "Keep research rigor explicit about external validation, production, analytics, accessibility, and runtime-proof limits.",
      "npm run check",
    ),
    check(
      "route-manifest",
      requiredRoutes.every((route) => publicRoutes.includes(route)),
      "high",
      `${requiredRoutes.filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes.length} research rigor route(s) declared.`,
      "Add research rigor report, plan, and history routes to runtimeRouteManifest.",
      "npm run record:runtime-surface",
    ),
    check(
      "refresh-plan",
      refreshEndpoints.includes(ENDPOINT) && !refreshEndpoints.some((endpoint) => endpoint.startsWith("/api/private")),
      "medium",
      `${ENDPOINT} ${refreshEndpoints.includes(ENDPOINT) ? "covered" : "missing"}; private refresh endpoints ${refreshEndpoints.filter((endpoint) => endpoint.startsWith("/api/private")).length}.`,
      "Add research rigor to safe evidence refresh and keep private routes out.",
      "npm run refresh:evidence",
    ),
    check(
      "script-coverage",
      requiredScripts.every((script) => scripts[script]),
      "medium",
      `${requiredScripts.filter((script) => scripts[script]).length}/${requiredScripts.length} research rigor script(s) declared.`,
      "Keep research rigor, stress, integrity, design ambition, runtime deploy, and verify scripts declared.",
      "npm run audit:research-rigor",
    ),
  ];
}

function dimension({ id, label, score, passed, detail, verificationCommand }) {
  const normalized = clamp(Math.round(score || 0), 0, 100);
  return {
    id,
    label,
    score: normalized,
    band: bandFor(normalized),
    passed: Boolean(passed),
    detail,
    verificationCommand,
  };
}

function check(id, passed, severity, detail, repairAction, verificationCommand) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function researchRigorContract() {
  return {
    stance:
      "Treat every local evaluator as a falsifiable instrument: it must declare evidence, limitations, expected failure modes, repair actions, and verification commands.",
    minimumEvidence:
      "A research-grade claim needs source-traced proof quality, repeatable search cases, manual opportunity gates, design/runtime coherence, stress scenarios, and integrity calibration.",
    gradingRule:
      "Every evaluator gets an explicit floor, letter grade, failure mode, repair action, and command. Passing the aggregate audit cannot hide a failing evaluator.",
    publicSafetyRule:
      "The audit must reward visible uncertainty and explicit non-claims instead of implying external validation, live outcomes, analytics insight, or private-document access.",
  };
}

function researchRigorRubric() {
  return {
    scale: "0-100 component score with fixed floors per evaluator",
    letterBands: [
      "A >= 93",
      "A- >= 90",
      "B+ >= 87",
      "B >= 83",
      "B- >= 80",
      "C+ >= 75",
      "C >= 70",
      "D >= 60",
      "F < 60",
    ],
    passPolicy:
      "Each gradebook row must meet its floor and pass its local evidence checklist; aggregate score alone is never sufficient.",
  };
}

function researchRigorNonClaims() {
  return [
    "Does not conduct live user research, independent peer review, admissions review, hiring review, funding diligence, or external credential verification.",
    "Does not prove production real-user monitoring, CDN behavior, provider dashboard state, DNS propagation, or external uptime.",
    "Does not certify accessibility or screen-reader parity; scripted checks still require manual assistive-technology review.",
    "Does not read private cockpit data, credentials, inboxes, calendars, private files, or third-party accounts.",
  ];
}

function appendResearchRigorReceipt(root, receipt) {
  const receipts = readResearchRigorReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readResearchRigorReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestResearchRigorReceipt(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return null;
  try {
    const cacheKey = receiptCacheKey(storePath);
    const cached = latestReceiptCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.receipt;
    const text = readFileSync(storePath, "utf8");
    const receiptsIndex = text.indexOf('"receipts"');
    const arrayStart = receiptsIndex === -1 ? -1 : text.indexOf("[", receiptsIndex);
    const objectStart = arrayStart === -1 ? -1 : text.indexOf("{", arrayStart);
    if (objectStart === -1) return null;
    const objectEnd = findJsonObjectEnd(text, objectStart);
    if (objectEnd === -1) return null;
    const receipt = JSON.parse(text.slice(objectStart, objectEnd + 1));
    latestReceiptCache.set(storePath, { cacheKey, receipt });
    return receipt;
  } catch {
    return null;
  }
}

function readResearchRigorHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readResearchRigorReceipts(root);
    const window = {
      receipts: receipts.slice(0, boundedLimit),
      totalAvailable: receipts.length,
    };
    historyWindowCache.set(storePath, { cacheKey, window });
    return window;
  } catch {
    return { receipts: [], totalAvailable: 0 };
  }
}

function buildResearchRigorHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "research-grade-rigor-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local research-rigor receipts. It does not run evaluators, collect analytics, contact external services, enable private routes, deploy, publish, or mutate third-party systems.",
          sideEffectBoundary:
            "The history endpoint reads local research-rigor receipts only and does not run evaluators, collect analytics, contact external services, enable private routes, deploy, publish, or mutate third-party systems.",
          receiptStore: STORE_RELATIVE_PATH,
        }
      : {}),
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          fullDetail,
          defaultLimit: 5,
          fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
        }
      : {
          fullDetail,
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      latestScore: latest?.summary?.score || 0,
      latestMinimumGrade: latest?.summary?.minimumGrade || null,
      ...(fullDetail
        ? {
            latestDimensions: latest?.summary?.dimensions || 0,
            latestGradebookItems: latest?.summary?.gradebookItems || 0,
            latestCheckedAt: latest?.checkedAt || null,
            latestPassing: latest?.summary?.passing || 0,
          }
        : {}),
    },
    definitions: fullDetail ? undefined : summarizeResearchRigorHistoryDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeResearchRigorReceipt(receipt, { includePreviews: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Research rigor history is available; run npm run audit:research-rigor after evaluator, runtime, design, proof, route, or receipt changes."
        : "Run npm run audit:research-rigor to create research rigor history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:research-rigor && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeResearchRigorHistoryDefinitions(receipt) {
  return {
    fullReportEndpoint: `${ENDPOINT}?detail=full`,
    receiptShapeAvailable: Boolean(receipt),
  };
}

function summarizeResearchRigorReceipt(receipt, { includePreviews = true } = {}) {
  const summary = summarizeResearchRigorReceiptSummary(receipt.summary);
  const compact = {
    id: receipt.id,
    score: summary.score,
    failing: summary.failing,
    dimensions: summary.dimensions,
    gradebookItems: summary.gradebookItems,
    minimumGrade: summary.minimumGrade,
  };
  if (!includePreviews) {
    return {
      id: receipt.id,
      score: summary.score,
      minimumGrade: summary.minimumGrade,
      failing: summary.failing,
    };
  }
  return {
    ...compact,
    dimensionPreview: (receipt.dimensions || []).slice(0, 3).map(({ id, score, passed }) => ({
      id,
      score,
      passed,
    })),
    gradebookPreview: (receipt.evaluationGradebook || []).slice(0, 3).map(({ id, score, grade, passed }) => ({
      id,
      score,
      grade,
      passed,
    })),
    checkPreview: (receipt.checks || []).slice(0, 3).map(({ id, passed }) => ({
      id,
      passed,
    })),
  };
}

function summarizeResearchRigorReceiptSummary(summary = {}) {
  return {
    score: summary.score || 0,
    checks: summary.checks || 0,
    failing: summary.failing || 0,
    dimensions: summary.dimensions || 0,
    gradebookItems: summary.gradebookItems || 0,
    minimumGrade: summary.minimumGrade || null,
  };
}

function summarizeResearchRigorPlan(plan = {}) {
  return {
    endpoint: plan.endpoint,
    commandAvailable: Boolean(plan.command),
  };
}

function summarizeResearchRigorContract(contract = {}) {
  return {
    stanceAvailable: Boolean(contract.stance),
    gradingRuleAvailable: Boolean(contract.gradingRule),
  };
}

function summarizeResearchRigorRubric(rubric = {}) {
  return {
    letterBandCount: rubric.letterBands?.length || 0,
    passPolicyAvailable: Boolean(rubric.passPolicy),
  };
}

function summarizeResearchRigorGradebookItem(item) {
  return {
    id: item.id,
    grade: item.grade,
    passed: Boolean(item.passed),
    evidenceCount: (item.evidence || []).length,
  };
}

function summarizeResearchRigorDimension(dimension) {
  return {
    id: dimension.id,
    score: dimension.score,
    passed: Boolean(dimension.passed),
  };
}

function summarizeResearchRigorCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function summarizeResearchRigorNonClaims(nonClaims = []) {
  const text = nonClaims.join(" ").toLowerCase();
  return [
    /live user research|peer review/.test(text)
      ? "No live user research or peer review."
      : "No external research validation.",
  ];
}

function selectResearchRigorDimensionPreview(dimensions, limit) {
  return selectPriorityRows(dimensions, ["adversarial-stress", "gradebook-calibration"], limit);
}

function selectResearchRigorGradebookPreview(gradebook, limit) {
  return selectPriorityRows(gradebook, COMPACT_GRADEBOOK_PREVIEW_IDS, limit);
}

function selectResearchRigorCheckPreview(checks, limit) {
  return selectPriorityRows(checks, COMPACT_CHECK_PREVIEW_IDS, limit);
}

function selectPriorityRows(rows, priorityIds, limit) {
  const selected = [];
  const seen = new Set();
  for (const id of priorityIds) {
    pushPriorityRow(selected, seen, rows.find((row) => row.id === id), limit);
  }
  for (const row of rows) {
    pushPriorityRow(selected, seen, row, limit);
  }
  return selected;
}

function pushPriorityRow(selected, seen, row, limit) {
  if (!row || seen.has(row.id) || selected.length >= limit) return;
  selected.push(row);
  seen.add(row.id);
}

function researchRigorPayloadPolicy({
  fullDetail,
  report,
  dimensionLimit,
  gradebookLimit,
  checkLimit,
  dimensionsReturned = (report.dimensions || []).length,
  gradebookReturned = (report.evaluationGradebook || []).length,
  checksReturned = (report.checks || []).length,
}) {
  if (!fullDetail) {
    return {
      fullDetail: false,
      fullDetailAvailable: true,
      dimensionsReturned,
      totalDimensions: (report.dimensions || []).length,
      gradebookReturned,
      totalGradebookItems: (report.evaluationGradebook || []).length,
      checksReturned,
      totalChecks: (report.checks || []).length,
    };
  }
  return {
    fullDetail: true,
    compact: false,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    dimensionsReturned,
    totalDimensions: (report.dimensions || []).length,
    gradebookReturned,
    totalGradebookItems: (report.evaluationGradebook || []).length,
    checksReturned,
    totalChecks: (report.checks || []).length,
    previewLimits: {
      dimensions: dimensionLimit,
      gradebookItems: gradebookLimit,
      checks: checkLimit,
      nonClaims: 2,
    },
  };
}

function dimensionScore(report, id) {
  return (report.dimensions || []).find((dimension) => dimension.id === id)?.score || 0;
}

function dimensionById(dimensions, id) {
  return dimensions.find((dimension) => dimension.id === id) || { score: 0, passed: false };
}

function weightedScore(checks) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
}

function percent(value, total) {
  if (!total) return 0;
  return clamp(Math.round((value / total) * 100), 0, 100);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function letterGrade(score) {
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 75) return "C+";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function titleize(value) {
  return String(value || "research-rigor")
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function minimumGrade(gradebook) {
  if (!gradebook.length) return "F";
  return letterGrade(Math.min(...gradebook.map((item) => item.score)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, 50));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

function findJsonObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

module.exports = {
  appendResearchRigorReceipt,
  buildResearchRigorHistory,
  buildResearchRigorReportFromReceipt,
  buildResearchRigorReport,
  buildResearchRigorResponse,
  readLatestResearchRigorReceipt,
  readResearchRigorHistoryWindow,
  readResearchRigorReceipts,
  researchRigorPlan,
};
