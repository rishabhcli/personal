const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const STRESS_ENDPOINT = "/api/evaluation/research-stress";
const STORE_RELATIVE_PATH = path.join("var", "research-evaluation-stress-receipts.json");
const historyWindowCache = new Map();

function researchEvaluationStressPlan() {
  return {
    mode: "research-grade-evaluation-stress-plan",
    command: "npm run stress:evaluation",
    endpoint: STRESS_ENDPOINT,
    scheduleRecommendation: "Run manually before publishing, after proof-model changes, and after major command-center UI changes.",
    sideEffectBoundary:
      "The stress runner starts a temporary local server, reads public-safe evaluation endpoints, writes a local receipt under var/, and does not contact external services, submit applications, send messages, approve private artifacts, or publish changes.",
    scenarios: [
      "unsupported claim pressure",
      "retrieval proof pressure",
      "manual opportunity gate pressure",
      "runtime drift pressure",
      "graph uncertainty pressure",
      "verification receipt pressure",
      "first-screen proof action pressure",
      "route and refresh coverage pressure",
    ],
    receiptStore: STORE_RELATIVE_PATH,
  };
}

function readResearchEvaluationStressReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readResearchEvaluationStressHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readResearchEvaluationStressReceipts(root);
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

function buildResearchEvaluationStressHistory({ receipts = [], limit = 20, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "research-grade-evaluation-stress-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary:
      fullDetail
        ? "This endpoint returns full local research stress receipts. It is still not a human research study, external peer review, production incident test, credentialed background check, or private-document audit."
        : undefined,
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local research stress receipts only. It does not start stress runners, contact external services, submit applications, send messages, approve private artifacts, or publish changes."
        : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${STRESS_ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: researchEvaluationStressHistoryPayloadPolicy({ fullDetail, limited }),
    summary: researchEvaluationStressHistorySummary({ limited, totalAvailable, boundedLimit, latest, fullDetail }),
    definitions: fullDetail ? undefined : summarizeResearchEvaluationStressDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeResearchEvaluationStressReceipt(receipt, { includePreviews: index === 0 })),
    ...(fullDetail
      ? {
          nextAction: limited[0]
            ? "Research stress history is available; run npm run stress:evaluation after evaluator, runtime, route, proof, or design changes."
            : "Run npm run stress:evaluation to create research stress history.",
          verificationCommand: "npm run stress:evaluation && node --test test/api-contract.test.mjs",
        }
      : {}),
  };
}

function researchEvaluationStressHistoryPayloadPolicy({ fullDetail, limited }) {
  if (!fullDetail) {
    return {
      fullDetail,
      receiptsReturned: limited.length,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail,
    latestReceiptPreview: "full-receipt",
    olderReceiptPreview: "full-receipt",
  };
}

function researchEvaluationStressHistorySummary({ limited, totalAvailable, boundedLimit, latest, fullDetail }) {
  return {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
    ...(fullDetail
      ? {
          latestScore: latest?.summary?.score || 0,
          latestBand: latest?.summary?.band || "unknown",
          latestScenarios: latest?.summary?.scenarios || 0,
        }
      : {}),
  };
}

function summarizeResearchEvaluationStressDefinitions(receipt) {
  const scenarios = Array.isArray(receipt?.scenarios) ? receipt.scenarios : [];
  const scenarioDefinitions = selectStressScenarioPreview(scenarios, 4);
  return {
    scenarios: {
      total: scenarios.length,
      verificationCommandCount: scenarios.filter((scenario) => Boolean(scenario.verificationCommand)).length,
      sentinelIds: scenarioDefinitions.slice(0, 2).map((scenario) => scenario.id),
    },
  };
}

function appendResearchEvaluationStressReceipt(root, receipt) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  const receipts = readResearchEvaluationStressReceipts(root);
  receipts.unshift(receipt);
  writeFileSync(storePath, `${JSON.stringify({ receipts: receipts.slice(0, 50) }, null, 2)}\n`);
  return receipt;
}

function summarizeResearchEvaluationStressReceipt(receipt, { includePreviews = true } = {}) {
  const scenarios = Array.isArray(receipt.scenarios) ? receipt.scenarios : [];
  const failing = scenarios.filter((scenario) => !scenario.passed);
  const summary = summarizeResearchEvaluationStressReceiptSummary(receipt.summary, scenarios);
  const compact = {
    id: receipt.id,
  };
  if (!includePreviews) {
    return {
      ...compact,
      trendOnly: true,
      scenarios: summary.scenarios,
      passing: summary.passing,
      failing: summary.failing,
      ...(summary.highRiskFailing ? { highRiskFailing: summary.highRiskFailing } : {}),
      ...(summary.failing ? { weakestScenario: weakestStressScenarioId(scenarios) } : {}),
      limitationCount: Array.isArray(receipt.limitations) ? receipt.limitations.length : 0,
    };
  }
  return {
    ...compact,
    scenarioPreview: selectStressScenarioPreview(scenarios, 4).map((scenario) => ({
      id: scenario.id,
      passed: Boolean(scenario.passed),
    })),
    scenarioSummary: {
      total: summary.scenarios,
      passing: summary.passing,
      failing: summary.failing,
      ...(summary.highRiskFailing ? { highRiskFailing: summary.highRiskFailing } : {}),
      ...(summary.failing ? { weakestScenario: weakestStressScenarioId(scenarios) } : {}),
    },
    stressMatrixSummary: summarizeStressMatrix(receipt.stressMatrix || stressMatrix(scenarios)),
    repairQueueCount: (receipt.repairQueue || failing).length,
    limitationCount: Array.isArray(receipt.limitations) ? receipt.limitations.length : 0,
  };
}

function summarizeResearchEvaluationStressHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    scenarios: summary.scenarios || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    highRiskFailing: summary.highRiskFailing || 0,
    proofActionMinimum: summary.proofActionMinimum || 0,
    proofActionScenarioPassing: summary.proofActionScenarioPassing === true,
  };
}

function summarizeResearchEvaluationStressReceiptSummary(summary = {}, scenarios = []) {
  const failing = scenarios.filter((scenario) => !scenario.passed);
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    scenarios: summary.scenarios || scenarios.length,
    passing: Number.isInteger(summary.passing) ? summary.passing : scenarios.filter((scenario) => scenario.passed).length,
    failing: Number.isInteger(summary.failing) ? summary.failing : failing.length,
    highRiskFailing: Number.isInteger(summary.highRiskFailing)
      ? summary.highRiskFailing
      : failing.filter((scenario) => scenario.severity === "high").length,
    proofActionMinimum: summary.proofActionMinimum || 0,
    proofActionScenarioPassing: summary.proofActionScenarioPassing === true,
    routeCovered: summary.routeCovered === true,
    refreshCovered: summary.refreshCovered === true,
  };
}

function selectStressScenarioPreview(scenarios, limit) {
  const priorityIds = [
    "runtime-drift-pressure",
    "first-screen-proof-action-pressure",
    "manual-opportunity-gate-pressure",
    "unsupported-claim-pressure",
  ];
  const selected = [];
  const add = (scenario) => {
    if (!scenario || selected.some((item) => item.id === scenario.id)) return;
    selected.push(scenario);
  };
  scenarios.filter((scenario) => !scenario.passed).forEach(add);
  priorityIds.forEach((id) => add(scenarios.find((scenario) => scenario.id === id)));
  scenarios
    .slice()
    .sort((left, right) => (left.score || 0) - (right.score || 0))
    .forEach(add);
  return selected.slice(0, limit);
}

function summarizeStressRepairQueue(items, limit) {
  return (items || []).slice(0, limit).map((item) => ({
    id: item.id,
    severity: item.severity,
  }));
}

function weakestStressScenarioId(scenarios) {
  return scenarios.slice().sort((left, right) => (left.score || 0) - (right.score || 0))[0]?.id || null;
}

function buildResearchEvaluationStressReport({
  proofQuality,
  searchQuality,
  opportunityQuality,
  usabilityQuality,
  designStability = {},
  keyboardReadiness = {},
  designAmbition = {},
  graphScoreboard,
  runtimeReconciliation,
  opportunityBoard,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const plan = researchEvaluationStressPlan();
  const scenarios = buildStressScenarios({
    proofQuality,
    searchQuality,
    opportunityQuality,
    usabilityQuality,
    designStability,
    keyboardReadiness,
    designAmbition,
    graphScoreboard,
    runtimeReconciliation,
    opportunityBoard,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = scenarios.filter((item) => !item.passed);
  const highRiskFailing = failing.filter((item) => item.severity === "high");
  const score = weightedScore(scenarios);
  const latestReceipt = receipts[0] || null;
  const proofActionScenario = scenarios.find((item) => item.id === "first-screen-proof-action-pressure") || null;
  const proofActionMinimum = minimumFinite([
    designStability.summary?.proofRibbonActions,
    keyboardReadiness.summary?.proofRibbonActions,
    designAmbition.summary?.proofRibbonActions,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    mode: "research-grade-evaluation-stress-suite",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${STRESS_ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This suite stress-tests local public-safe evaluation outputs already modeled by the app. It is not a human research study, external peer review, production incident test, credentialed background check, or private-document audit.",
    sideEffectBoundary: plan.sideEffectBoundary,
    plan,
    methodology: {
      scale: "0-100 weighted stress score",
      bandPolicy: "high >= 85, medium >= 70, low < 70",
      passPolicy: "Each scenario defines the minimum evidence that must remain visible when the app is under adversarial review.",
      scenarios: scenarios.map((item) => ({
        id: item.id,
        severity: item.severity,
        weight: item.weight,
        expectedFailureMode: item.expectedFailureMode,
      })),
    },
    summary: {
      score,
      band: bandFor(score),
      scenarios: scenarios.length,
      passing: scenarios.length - failing.length,
      failing: failing.length,
      highRiskFailing: highRiskFailing.length,
      publicEndpoint: STRESS_ENDPOINT,
      latestReceiptId: latestReceipt?.id || null,
      routeCovered: (routeManifest.publicApiRoutes || []).includes(STRESS_ENDPOINT),
      refreshCovered: (refreshPlan.endpoints || []).includes(STRESS_ENDPOINT),
      proofActionMinimum,
      proofActionScenarioPassing: Boolean(proofActionScenario?.passed),
    },
    scenarios,
    stressMatrix: stressMatrix(scenarios),
    repairQueue: failing.map((item) => ({
      id: item.id,
      label: item.label,
      severity: item.severity,
      repairAction: item.repairAction,
      verificationCommand: item.verificationCommand,
    })),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          scenarios: latestReceipt.summary?.scenarios || 0,
        }
      : null,
    limitations: researchEvaluationStressLimitations(),
    nextAction: failing.length
      ? `Repair ${failing[0].label}: ${failing[0].repairAction}`
      : "Keep the stress suite in the refresh plan and rerun npm run stress:evaluation after evaluation, runtime, or proof-model changes.",
    verificationCommand: "npm run stress:evaluation && npm run check && npm run verify",
  };
}

function buildResearchEvaluationStressReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "research-grade-evaluation-stress-receipt" || !receipt.summary) return null;
  const scenarios = (receipt.scenarios || []).map((item) => {
    const defaults = stressScenarioDefaults()[item.id] || {};
    const score = Number.isFinite(item.score) ? item.score : 0;
    const severity = item.severity || defaults.severity || "medium";
    return {
      id: item.id,
      label: item.label || defaults.label || titleize(item.id),
      severity,
      weight: Number.isFinite(item.weight) ? item.weight : severity === "high" ? 1.4 : 1,
      score,
      band: item.band || bandFor(score),
      passed: Boolean(item.passed),
      detail: item.detail || `Cached research stress scenario from ${receipt.id}.`,
      expectedFailureMode:
        item.expectedFailureMode || defaults.expectedFailureMode || "A cached stress scenario may be stale after evaluator, route, runtime, or receipt changes.",
      evidence: item.evidence || defaults.evidence || [`cached receipt ${receipt.id}`],
      repairAction:
        item.repairAction ||
        (item.passed ? "No cached stress repair needed." : defaults.repairAction || "Refresh research stress and repair the failing cached scenario."),
      verificationCommand: item.verificationCommand || defaults.verificationCommand || "npm run stress:evaluation",
    };
  });
  const failing = scenarios.filter((item) => !item.passed);
  const summary = {
    ...receipt.summary,
    scenarios: receipt.summary.scenarios || scenarios.length,
    passing: Number.isInteger(receipt.summary.passing) ? receipt.summary.passing : scenarios.length - failing.length,
    failing: Number.isInteger(receipt.summary.failing) ? receipt.summary.failing : failing.length,
    highRiskFailing: Number.isInteger(receipt.summary.highRiskFailing)
      ? receipt.summary.highRiskFailing
      : failing.filter((item) => item.severity === "high").length,
    latestReceiptId: receipt.id,
  };

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "research-grade-evaluation-stress-suite",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${STRESS_ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs the research evaluation stress suite from the latest local receipt. It is a fast public-safe cached report, not live user research, peer review, production monitoring, credential verification, or private-document audit.",
    sideEffectBoundary: receipt.sideEffectBoundary || researchEvaluationStressPlan().sideEffectBoundary,
    plan: researchEvaluationStressPlan(),
    methodology: {
      scale: "0-100 weighted stress score",
      bandPolicy: "high >= 85, medium >= 70, low < 70",
      passPolicy: "Cached scenarios preserve the last recorded pass state; use ?refresh=1 or npm run stress:evaluation to recompute.",
      scenarios: scenarios.map((item) => ({
        id: item.id,
        severity: item.severity,
        weight: item.weight,
        expectedFailureMode: item.expectedFailureMode,
      })),
    },
    summary,
    scenarios,
    stressMatrix: receipt.stressMatrix || stressMatrix(scenarios),
    repairQueue:
      receipt.repairQueue ||
      failing.map((item) => ({
        id: item.id,
        label: item.label,
        severity: item.severity,
        repairAction: item.repairAction,
        verificationCommand: item.verificationCommand,
      })),
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passing: summary.passing,
      scenarios: summary.scenarios,
    },
    limitations: receipt.limitations || researchEvaluationStressLimitations(),
    nextAction:
      failing[0]?.repairAction ||
      "Research stress is served from the latest local receipt; run npm run stress:evaluation or ?refresh=1 after evaluator, runtime, design, proof, route, or receipt changes.",
    verificationCommand: "npm run stress:evaluation && npm run check && npm run verify",
  };
}

function buildResearchEvaluationStressResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const policy = researchEvaluationStressPayloadPolicy({ fullDetail, report });
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${STRESS_ENDPOINT}?detail=full`,
      researchStressPayloadPolicy: policy,
    };
  }
  const scenarios = Array.isArray(report.scenarios) ? report.scenarios : [];
  const summary = summarizeResearchEvaluationStressReceiptSummary(report.summary || {}, scenarios);
  return {
    mode: report.mode,
    detail: "summary",
    compact: true,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy,
    fullDetailEndpoint: `${STRESS_ENDPOINT}?detail=full`,
    boundariesAvailable: Boolean(report.sourceBoundary && report.sideEffectBoundary),
    planAvailable: Boolean(report.plan),
    methodologyAvailable: Boolean(report.methodology),
    summary,
    scenarioPreview: selectStressScenarioPreview(scenarios, 4).map((scenario) => ({
      id: scenario.id,
      passed: Boolean(scenario.passed),
    })),
    stressMatrixSummary: summarizeStressMatrix(report.stressMatrix || stressMatrix(scenarios)),
    repairQueueCount: (report.repairQueue || scenarios.filter((scenario) => !scenario.passed)).length,
    latestReceiptId: report.latestReceipt?.id || report.summary?.latestReceiptId || null,
    limitationCount: Array.isArray(report.limitations) ? report.limitations.length : 0,
    nextActionAvailable: Boolean(report.nextAction),
    verificationCommandAvailable: Boolean(report.verificationCommand),
    researchStressPayloadPolicy: policy,
  };
}

function buildStressScenarios({
  proofQuality,
  searchQuality,
  opportunityQuality,
  usabilityQuality,
  designStability,
  keyboardReadiness,
  designAmbition,
  graphScoreboard,
  runtimeReconciliation,
  opportunityBoard,
  routeManifest,
  refreshPlan,
  packageManifest,
}) {
  const claimTraceability = dimensionScore(proofQuality, "claim-traceability");
  const uncertaintyDisclosure = dimensionScore(usabilityQuality, "uncertainty-disclosure");
  const routeCovered = (routeManifest.publicApiRoutes || []).includes(STRESS_ENDPOINT);
  const refreshCovered = (refreshPlan.endpoints || []).includes(STRESS_ENDPOINT);
  const hasStressScript = Boolean(packageManifest.scripts?.["stress:evaluation"]);
  const receiptControls = ["scripted-accessibility", "performance-budget", "visual-baseline"].map((id) => controlById(usabilityQuality, id));
  const sourceTracedCases = (searchQuality.cases || []).filter((item) =>
    (item.results || []).every((result) => Array.isArray(result.sourceTrace) && result.sourceTrace.length > 0),
  ).length;
  const opportunityGateIds = new Set((opportunityBoard.gates || []).map((gate) => gate.id));
  const receiptMatrix = runtimeReconciliation.receiptMatrix || [];
  const freshReceipts = receiptMatrix.filter((receipt) => receipt.freshness === "fresh").length;
  const proofActionStress = proofActionStressSignals({ designStability, keyboardReadiness, designAmbition });

  return [
    scenario({
      id: "unsupported-claim-pressure",
      label: "Unsupported claim pressure",
      severity: "high",
      score: average([claimTraceability, uncertaintyDisclosure, proofQuality.limitations?.length >= 3 ? 100 : 0]),
      passed: claimTraceability >= 60 && uncertaintyDisclosure >= 80 && (proofQuality.limitations || []).length >= 3,
      detail: `${claimTraceability}/100 claim traceability; ${uncertaintyDisclosure}/100 uncertainty disclosure; ${(proofQuality.limitations || []).length} limitation(s).`,
      expectedFailureMode: "Weak claims become presented as fully verified or lose their repair guidance.",
      evidence: ["proof-quality claim-traceability", "usability uncertainty disclosure", "proof-quality limitations"],
      repairAction: "Expose needs-source claims, visible caveats, and concrete repair actions wherever high-level proof scores are shown.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/proof-quality and /api/evaluation/usability",
    }),
    scenario({
      id: "retrieval-proof-pressure",
      label: "Retrieval proof pressure",
      severity: "medium",
      score: average([
        searchQuality.summary?.score || 0,
        percent(searchQuality.summary?.passing || 0, searchQuality.summary?.cases || 0),
        percent(sourceTracedCases, searchQuality.summary?.cases || 0),
      ]),
      passed:
        (searchQuality.summary?.score || 0) >= 75 &&
        sourceTracedCases === (searchQuality.summary?.cases || 0) &&
        (searchQuality.cases || []).every((item) => item.nextRepair),
      detail: `${searchQuality.summary?.score || 0}/100 search score; ${sourceTracedCases}/${searchQuality.summary?.cases || 0} case(s) source-traced.`,
      expectedFailureMode: "Search results rank plausible projects without enough source trace or next-inspection guidance.",
      evidence: ["search-quality cases", "source traces", "next repair guidance"],
      repairAction: "Keep every benchmark result tied to claims, source traces, and a next inspection action.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/search-quality",
    }),
    scenario({
      id: "manual-opportunity-gate-pressure",
      label: "Manual opportunity gate pressure",
      severity: "high",
      score: average([
        opportunityBoard.summary?.score || 0,
        percent(opportunityBoard.summary?.passing || 0, opportunityBoard.summary?.checks || 0),
        opportunityBoard.summary?.blockerQueue > 0 ? 100 : 0,
        opportunityBoard.operatingRules?.some((rule) => /not to automate|Do not use/i.test(rule)) ? 100 : 0,
      ]),
      passed:
        ["ready-for-manual-review", "proof-repair-required", "blocked-until-proof"].every((id) => opportunityGateIds.has(id)) &&
        (opportunityBoard.summary?.blockerQueue || 0) > 0 &&
        (opportunityBoard.checks || []).every((check) => check.passed) &&
        (opportunityQuality.summary?.readyForManualUse || 0) <= (opportunityBoard.summary?.readyForManualReview || 0),
      detail: `${opportunityBoard.summary?.readyForManualReview || 0}/${opportunityBoard.summary?.packages || 0} ready; ${opportunityBoard.summary?.blockerQueue || 0} blocker(s); ${opportunityBoard.summary?.passing || 0}/${opportunityBoard.summary?.checks || 0} board check(s).`,
      expectedFailureMode: "The app converts archetypal opportunities into sendable/application-ready claims before proof repair.",
      evidence: ["opportunity board gates", "opportunity quality readiness", "manual-use policy"],
      repairAction: "Keep opportunity packages gated until proof blockers, caveats, and manual-review requirements are visible.",
      verificationCommand: "npm run check && node server.js # then open /api/opportunity-board and /api/evaluation/opportunity-quality",
    }),
    scenario({
      id: "runtime-drift-pressure",
      label: "Runtime drift pressure",
      severity: "high",
      score: average([
        runtimeReconciliation.summary?.score || 0,
        runtimeReconciliation.summary?.staleReceiptKinds === 0 ? 100 : 0,
        percent(freshReceipts, receiptMatrix.length || 0),
      ]),
      passed:
        (runtimeReconciliation.summary?.score || 0) >= 85 &&
        runtimeReconciliation.summary?.staleReceiptKinds === 0 &&
        receiptMatrix.length >= 3 &&
        receiptMatrix.every((receipt) => receipt.freshness === "fresh"),
      detail: `${runtimeReconciliation.summary?.score || 0}/100 reconciliation; ${runtimeReconciliation.summary?.staleReceiptKinds ?? "unknown"} stale receipt kind(s); ${freshReceipts}/${receiptMatrix.length} fresh receipts.`,
      expectedFailureMode: "The app shows current runtime confidence while route, refresh, or bundle receipts are stale.",
      evidence: ["runtime reconciliation summary", "receipt matrix", "drift matrix"],
      repairAction: "Rerun runtime, surface, and refresh receipts after route, runtime, or bundle changes.",
      verificationCommand: "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence",
    }),
    scenario({
      id: "graph-uncertainty-pressure",
      label: "Graph uncertainty pressure",
      severity: "medium",
      score: average([
        graphScoreboard.summary?.score || 0,
        (graphScoreboard.summary?.quarantineCandidates || 0) > 0 ? 100 : 70,
        (graphScoreboard.repairActions || []).length > 0 ? 100 : 0,
      ]),
      passed:
        (graphScoreboard.summary?.score || 0) >= 60 &&
        Number.isInteger(graphScoreboard.summary?.quarantineCandidates) &&
        (graphScoreboard.repairActions || []).length > 0,
      detail: `${graphScoreboard.summary?.score || 0}/100 graph normalization; ${graphScoreboard.summary?.quarantineCandidates || 0} quarantine candidate(s); ${(graphScoreboard.repairActions || []).length} repair action(s).`,
      expectedFailureMode: "Graph views appear complete even when modeled entities, rendered references, or quarantine candidates are incomplete.",
      evidence: ["graph scoreboard", "quarantine candidates", "repair actions"],
      repairAction: "Keep graph uncertainty visible until normalization and rendered-reference coverage improve.",
      verificationCommand: "npm run check && node server.js # then open /api/graph-scoreboard",
    }),
    scenario({
      id: "verification-receipt-pressure",
      label: "Verification receipt pressure",
      severity: "medium",
      score: average(receiptControls.map((control) => (control?.passed ? 100 : 0))),
      passed: receiptControls.length === 3 && receiptControls.every((control) => control?.passed && control.verificationCommand),
      detail: receiptControls.map((control) => `${control?.id || "missing"}:${control?.passed ? "pass" : "fail"}`).join(" "),
      expectedFailureMode: "Accessibility, performance, or visual claims remain in the UI after their local receipts go missing or fail.",
      evidence: ["usability control benchmarks", "a11y receipt", "performance receipt", "visual receipt"],
      repairAction: "Refresh a11y, performance, visual, and runtime-surface receipts after rendered UI changes.",
      verificationCommand: "npm run audit:a11y && npm run audit:performance && npm run audit:visual && npm run record:runtime-surface",
    }),
    scenario({
      id: "first-screen-proof-action-pressure",
      label: "First-screen proof action pressure",
      severity: "high",
      score: average([
        designStability.summary?.score || 0,
        keyboardReadiness.summary?.score || 0,
        designAmbition.summary?.score || 0,
        proofActionStress.minimumActions >= 4 ? 100 : 0,
        proofActionStress.stabilityPassed ? 100 : 0,
        proofActionStress.keyboardPassed ? 100 : 0,
        proofActionStress.keyboardMapPassed ? 100 : 0,
        proofActionStress.ambitionPassed ? 100 : 0,
        proofActionStress.proofOrientationPassed ? 100 : 0,
      ]),
      passed:
        proofActionStress.minimumActions >= 4 &&
        proofActionStress.stabilityPassed &&
        proofActionStress.keyboardPassed &&
        proofActionStress.keyboardMapPassed &&
        proofActionStress.ambitionPassed &&
        proofActionStress.proofOrientationPassed &&
        [designStability.summary?.score || 0, keyboardReadiness.summary?.score || 0, designAmbition.summary?.score || 0].every(
          (score) => score >= 85,
        ),
      detail: `${proofActionStress.minimumActions} minimum proof action(s); design=${designStability.summary?.score || 0}/100; keyboard=${
        keyboardReadiness.summary?.score || 0
      }/100; ambition=${designAmbition.summary?.score || 0}/100; checks ${proofActionStress.passingSignals}/5.`,
      expectedFailureMode:
        "Proof health remains visually present but can no longer be inspected from keyboard- and mobile-safe first-screen controls.",
      evidence: [
        "design-stability proof-ribbon-actionability",
        "keyboard-readiness proof-ribbon-actions",
        "keyboard readiness proof action map",
        "design-ambition first-screen-proof-compression",
        "design-ambition proof-orientation family",
      ],
      repairAction:
        "Restore aria-labeled proof ribbon command buttons, stable proof action geometry, first-screen proof compression, and e2e coverage for desktop and mobile.",
      verificationCommand:
        "npm run audit:design-stability && npm run audit:keyboard-readiness && npm run audit:design-ambition && npm run test:e2e",
    }),
    scenario({
      id: "route-refresh-coverage-pressure",
      label: "Route and refresh coverage pressure",
      severity: "high",
      score: average([routeCovered ? 100 : 0, refreshCovered ? 100 : 0, hasStressScript ? 100 : 0]),
      passed: routeCovered && refreshCovered && hasStressScript,
      detail: `route manifest ${routeCovered}; refresh plan ${refreshCovered}; stress script ${hasStressScript}.`,
      expectedFailureMode: "The new stress report exists but is not discoverable by route attestation, evidence refresh, or package scripts.",
      evidence: ["runtime route manifest", "evidence refresh plan", "package scripts"],
      repairAction: `Keep ${STRESS_ENDPOINT} in the route manifest and refresh plan, and keep npm run stress:evaluation available.`,
      verificationCommand: "npm run stress:evaluation && npm run refresh:evidence",
    }),
  ];
}

function researchEvaluationStressLimitations() {
  return [
    "The suite uses deterministic local heuristics and receipts, not live user studies or independent reviewers.",
    "It intentionally rewards visible uncertainty and blockers instead of hiding them behind high-level badges.",
    "External production uptime, private cockpit contents, and real-world opportunity deadlines remain outside this public-safe test.",
  ];
}

function stressScenarioDefaults() {
  return {
    "unsupported-claim-pressure": {
      label: "Unsupported claim pressure",
      severity: "high",
      expectedFailureMode: "Weak claims become presented as fully verified or lose their repair guidance.",
      evidence: ["proof-quality claim-traceability", "usability uncertainty disclosure", "proof-quality limitations"],
      repairAction: "Expose needs-source claims, visible caveats, and concrete repair actions wherever high-level proof scores are shown.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/proof-quality and /api/evaluation/usability",
    },
    "retrieval-proof-pressure": {
      label: "Retrieval proof pressure",
      severity: "medium",
      expectedFailureMode: "Search results rank plausible projects without enough source trace or next-inspection guidance.",
      evidence: ["search-quality cases", "source traces", "next repair guidance"],
      repairAction: "Keep every benchmark result tied to claims, source traces, and a next inspection action.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/search-quality",
    },
    "manual-opportunity-gate-pressure": {
      label: "Manual opportunity gate pressure",
      severity: "high",
      expectedFailureMode: "The app converts archetypal opportunities into sendable/application-ready claims before proof repair.",
      evidence: ["opportunity board gates", "opportunity quality readiness", "manual-use policy"],
      repairAction: "Keep opportunity packages gated until proof blockers, caveats, and manual-review requirements are visible.",
      verificationCommand: "npm run check && node server.js # then open /api/opportunity-board and /api/evaluation/opportunity-quality",
    },
    "runtime-drift-pressure": {
      label: "Runtime drift pressure",
      severity: "high",
      expectedFailureMode: "The app shows current runtime confidence while route, refresh, or bundle receipts are stale.",
      evidence: ["runtime reconciliation summary", "receipt matrix", "drift matrix"],
      repairAction: "Rerun runtime, surface, and refresh receipts after route, runtime, or bundle changes.",
      verificationCommand: "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence",
    },
    "graph-uncertainty-pressure": {
      label: "Graph uncertainty pressure",
      severity: "medium",
      expectedFailureMode: "Graph views appear complete even when modeled entities, rendered references, or quarantine candidates are incomplete.",
      evidence: ["graph scoreboard", "quarantine candidates", "repair actions"],
      repairAction: "Keep graph uncertainty visible until normalization and rendered-reference coverage improve.",
      verificationCommand: "npm run check && node server.js # then open /api/graph-scoreboard",
    },
    "verification-receipt-pressure": {
      label: "Verification receipt pressure",
      severity: "medium",
      expectedFailureMode: "Accessibility, performance, or visual claims remain in the UI after their local receipts go missing or fail.",
      evidence: ["usability control benchmarks", "a11y receipt", "performance receipt", "visual receipt"],
      repairAction: "Refresh a11y, performance, visual, and runtime-surface receipts after rendered UI changes.",
      verificationCommand: "npm run audit:a11y && npm run audit:performance && npm run audit:visual && npm run record:runtime-surface",
    },
    "first-screen-proof-action-pressure": {
      label: "First-screen proof action pressure",
      severity: "high",
      expectedFailureMode:
        "Proof health remains visually present but can no longer be inspected from keyboard- and mobile-safe first-screen controls.",
      evidence: [
        "design-stability proof-ribbon-actionability",
        "keyboard-readiness proof-ribbon-actions",
        "keyboard readiness proof action map",
        "design-ambition first-screen-proof-compression",
        "design-ambition proof-orientation family",
      ],
      repairAction:
        "Restore aria-labeled proof ribbon command buttons, stable proof action geometry, first-screen proof compression, and e2e coverage for desktop and mobile.",
      verificationCommand:
        "npm run audit:design-stability && npm run audit:keyboard-readiness && npm run audit:design-ambition && npm run test:e2e",
    },
    "route-refresh-coverage-pressure": {
      label: "Route and refresh coverage pressure",
      severity: "high",
      expectedFailureMode: "The new stress report exists but is not discoverable by route attestation, evidence refresh, or package scripts.",
      evidence: ["runtime route manifest", "evidence refresh plan", "package scripts"],
      repairAction: `Keep ${STRESS_ENDPOINT} in the route manifest and refresh plan, and keep npm run stress:evaluation available.`,
      verificationCommand: "npm run stress:evaluation && npm run refresh:evidence",
    },
  };
}

function titleize(value) {
  return String(value || "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function proofActionStressSignals({ designStability = {}, keyboardReadiness = {}, designAmbition = {} }) {
  const stabilityCheck = checkById(designStability, "proof-ribbon-actionability");
  const keyboardCheck = checkById(keyboardReadiness, "proof-ribbon-actions");
  const keyboardMap = mapById(keyboardReadiness, "proof-ribbon-actions");
  const ambitionCheck = checkById(designAmbition, "first-screen-proof-compression");
  const proofOrientation = familyById(designAmbition, "proof-orientation");
  const actionCounts = [
    designStability.summary?.proofRibbonActions,
    keyboardReadiness.summary?.proofRibbonActions,
    designAmbition.summary?.proofRibbonActions,
  ];
  const signals = [
    Boolean(stabilityCheck?.passed),
    Boolean(keyboardCheck?.passed),
    Boolean(keyboardMap?.passed),
    Boolean(ambitionCheck?.passed),
    Boolean(proofOrientation?.passed),
  ];

  return {
    minimumActions: minimumFinite(actionCounts),
    stabilityPassed: signals[0],
    keyboardPassed: signals[1],
    keyboardMapPassed: signals[2],
    ambitionPassed: signals[3],
    proofOrientationPassed: signals[4],
    passingSignals: signals.filter(Boolean).length,
  };
}

function scenario({ id, label, severity, score, passed, detail, expectedFailureMode, evidence, repairAction, verificationCommand }) {
  const normalized = clamp(Math.round(score), 0, 100);
  return {
    id,
    label,
    severity,
    weight: severity === "high" ? 1.4 : 1,
    score: normalized,
    band: bandFor(normalized),
    passed: Boolean(passed),
    detail,
    expectedFailureMode,
    evidence,
    repairAction,
    verificationCommand,
  };
}

function stressMatrix(scenarios) {
  return ["high", "medium"].map((severity) => {
    const scoped = scenarios.filter((item) => item.severity === severity);
    return {
      severity,
      scenarios: scoped.length,
      passing: scoped.filter((item) => item.passed).length,
      averageScore: average(scoped.map((item) => item.score)),
      weakestScenario: scoped.slice().sort((left, right) => left.score - right.score)[0]?.id || null,
    };
  });
}

function summarizeResearchStressMethodology(methodology = {}, scenarios = []) {
  return {
    scaleAvailable: Boolean(methodology.scale),
    bandPolicyAvailable: Boolean(methodology.bandPolicy),
    passPolicyAvailable: Boolean(methodology.passPolicy),
    scenarios: scenarios.length,
    scenarioIds: scenarios.map((scenario) => ({
      id: scenario.id,
    })),
  };
}

function researchEvaluationStressPayloadPolicy({ fullDetail, report }) {
  const scenarios = report.scenarios || [];
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
      defaultScenarioPreviewLimit: 4,
      scenarioRowsReturned: Math.min(scenarios.length, 4),
      scenarioDetailAvailable: scenarios.some((scenario) => Boolean(scenario.detail || scenario.repairAction || scenario.verificationCommand)),
      scenarioEvidenceAvailable: scenarios.some((scenario) => Array.isArray(scenario.evidence) && scenario.evidence.length > 0),
    };
  }
  return {
    detail: fullDetail ? "full" : "summary",
    fullDetail,
    fullDetailEndpoint: `${STRESS_ENDPOINT}?detail=full`,
    defaultScenarioPreviewLimit: 4,
    scenarioRowsReturned: fullDetail ? scenarios.length : Math.min(scenarios.length, 4),
    compactScenarioDetailAvailable: scenarios.some((scenario) => Boolean(scenario.detail)),
    compactScenarioRepairActionAvailable: scenarios.some((scenario) => Boolean(scenario.repairAction)),
    fullScenarioEvidenceAvailable: scenarios.some((scenario) => Array.isArray(scenario.evidence) && scenario.evidence.length > 0),
    fullScenarioVerificationCommandAvailable: scenarios.some((scenario) => Boolean(scenario.verificationCommand)),
    methodology: fullDetail ? "full-scenario-methodology" : "methodology-summary-plus-scenario-ids",
    limitationsReturned: fullDetail ? (report.limitations || []).length : 0,
    limitationCountReturned: !fullDetail,
  };
}

function summarizeStressMatrix(matrix = []) {
  return {
    rows: matrix.length,
    passing: matrix.reduce((sum, row) => sum + (row.passing || 0), 0),
  };
}

function dimensionScore(report, id) {
  return (report.dimensions || []).find((dimension) => dimension.id === id)?.score || 0;
}

function controlById(report, id) {
  return (report.controlBenchmarks || []).find((control) => control.id === id) || null;
}

function checkById(report, id) {
  return (report.checks || []).find((check) => check.id === id) || null;
}

function mapById(report, id) {
  return (report.keyboardMap || []).find((item) => item.id === id) || null;
}

function familyById(report, id) {
  return (report.controlFamilies || []).find((family) => family.id === id) || null;
}

function weightedScore(scenarios) {
  const totalWeight = scenarios.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(scenarios.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function minimumFinite(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.min(...numeric);
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, 50));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

module.exports = {
  STRESS_ENDPOINT,
  appendResearchEvaluationStressReceipt,
  buildResearchEvaluationStressHistory,
  buildResearchEvaluationStressReportFromReceipt,
  buildResearchEvaluationStressReport,
  buildResearchEvaluationStressResponse,
  readResearchEvaluationStressHistoryWindow,
  readResearchEvaluationStressReceipts,
  researchEvaluationStressPlan,
};
