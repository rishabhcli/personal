const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/evaluation/integrity";
const STORE_RELATIVE_PATH = path.join("var", "evaluation-integrity-receipts.json");
const maxReceipts = 50;
const COMPACT_DOMAIN_PREVIEW_IDS = ["truthfulness", "accessibility-performance", "runtime-stress"];
const COMPACT_CHECK_PREVIEW_IDS = [
  "truthfulness-calibration",
  "accessibility-performance-receipts",
  "runtime-stress-coherence",
  "route-refresh-coverage",
];

function evaluationIntegrityPlan() {
  return {
    mode: "research-grade-evaluation-integrity-plan",
    command: "npm run audit:evaluation-integrity",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing proof-quality, search-quality, opportunity-quality, usability/design, accessibility, performance, runtime truth, or research-stress evaluators.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe evaluation endpoints and local receipt summaries, writes a local receipt under var/, and does not collect visitor analytics, enable private cockpit data, call external services, deploy, publish, or mutate third-party systems.",
  };
}

function buildEvaluationIntegrityReport({
  proofQuality,
  searchQuality,
  opportunityQuality,
  usabilityQuality,
  designStability,
  researchStress,
  runtimeReconciliation,
  accessibilityReports = [],
  performanceReports = [],
  visualReports = [],
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const checks = integrityChecks({
    proofQuality,
    searchQuality,
    opportunityQuality,
    usabilityQuality,
    designStability,
    researchStress,
    runtimeReconciliation,
    accessibilityReports,
    performanceReports,
    visualReports,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const domains = evaluationDomains({
    proofQuality,
    searchQuality,
    opportunityQuality,
    usabilityQuality,
    designStability,
    researchStress,
    runtimeReconciliation,
    accessibilityReports,
    performanceReports,
    visualReports,
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: "research-grade-evaluation-integrity",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report grades the app's local public-safe evaluation stack. It checks whether existing evaluators stay source-traced, receipt-backed, uncertainty-aware, route-covered, and repeatable. It is not external peer review, live user research, production RUM, screen-reader certification, or a comprehensive audit of private materials.",
    sideEffectBoundary:
      "This endpoint reads public-safe in-memory reports and local receipt files only. It does not start recorders, collect analytics, enable private routes, contact external services, deploy, publish, or write to third-party systems.",
    plan: evaluationIntegrityPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      domains: domains.length,
      passingDomains: domains.filter((domain) => domain.passed).length,
      latestReceiptId: receipts[0]?.id || null,
      proofScore: proofQuality.summary?.score || 0,
      usabilityScore: usabilityQuality.summary?.score || 0,
      designScore: designStability.summary?.score || 0,
      researchStressScore: researchStress.summary?.score || 0,
      runtimeReconciliationScore: runtimeReconciliation.summary?.score || 0,
    },
    domains,
    checks,
    calibrationMatrix: buildCalibrationMatrix({ checks, domains }),
    repeatabilityContract: evaluationIntegrityRepeatabilityContract(),
    nonClaims: evaluationIntegrityNonClaims(),
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nextAction:
      failing[0]?.repairAction ||
      "Evaluation integrity is calibrated across proof, search, opportunity, usability/design, accessibility, performance, runtime, and stress reports; rerun after evaluator or route changes.",
    verificationCommand: "npm run audit:evaluation-integrity && npm run check && npm run verify",
  };
}

function buildEvaluationIntegrityReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "research-grade-evaluation-integrity-receipt" || !receipt.summary) return null;
  const domains = (receipt.domains || []).map((domain) => ({
    id: domain.id,
    label: domain.label || titleize(domain.id),
    score: domain.score || 0,
    band: domain.band || bandFor(domain.score || 0),
    passed: Boolean(domain.passed),
    evidence: domain.evidence || [`cached receipt ${receipt.id}`],
    verificationCommand: domain.verificationCommand || "npm run audit:evaluation-integrity",
  }));
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || `Cached evaluation integrity check from ${receipt.id}.`,
    repairAction: check.passed ? "No cached evaluation integrity repair needed." : "Refresh evaluation integrity and repair the failing cached check.",
    verificationCommand: "npm run audit:evaluation-integrity",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "research-grade-evaluation-integrity",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs evaluation integrity from the latest local receipt. It is a fast public-safe cached report, not external peer review, live user research, production monitoring, screen-reader certification, or private-material audit.",
    sideEffectBoundary: receipt.sideEffectBoundary || evaluationIntegrityPlan().sideEffectBoundary,
    plan: evaluationIntegrityPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    domains,
    checks,
    calibrationMatrix: buildCalibrationMatrix({ checks, domains }),
    repeatabilityContract: evaluationIntegrityRepeatabilityContract(),
    nonClaims: evaluationIntegrityNonClaims(),
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passing: receipt.summary?.passing || 0,
      checks: receipt.summary?.checks || checks.length,
    },
    nextAction:
      failing[0]?.repairAction ||
      "Evaluation integrity is served from the latest local receipt; run npm run audit:evaluation-integrity or ?refresh=1 after evaluator, route, runtime, or receipt changes.",
    verificationCommand: "npm run audit:evaluation-integrity && npm run check && npm run verify",
  };
}

function buildEvaluationIntegrityResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "summary").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      summaryEndpoint: ENDPOINT,
    };
  }

  const domainPreview = selectPreviewById(report.domains || [], COMPACT_DOMAIN_PREVIEW_IDS, COMPACT_DOMAIN_PREVIEW_IDS.length);
  const checkPreview = selectPreviewById(report.checks || [], COMPACT_CHECK_PREVIEW_IDS, COMPACT_CHECK_PREVIEW_IDS.length);

  return {
    generatedAt: report.generatedAt,
    checkedAt: report.checkedAt || null,
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy || "live-refresh",
    detail: "summary",
    compact: true,
    refreshEndpoint: report.refreshEndpoint || `${ENDPOINT}?refresh=1`,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    sourceBoundaryAvailable: Boolean(report.sourceBoundary),
    sideEffectBoundaryAvailable: Boolean(report.sideEffectBoundary),
    summary: report.summary,
    domains: domainPreview.map(summarizeEvaluationIntegrityDomain),
    checks: checkPreview.map(summarizeEvaluationIntegrityCheck),
    calibrationMatrixCount: (report.calibrationMatrix || []).length,
    repeatabilityContract: summarizeEvaluationIntegrityRepeatabilityContract(report.repeatabilityContract),
    repairActionCount: (report.repairActions || []).length,
    nonClaimCount: (report.nonClaims || []).length,
    nextActionAvailable: Boolean(report.nextAction),
    verificationCommandAvailable: Boolean(report.verificationCommand),
    evaluationIntegrityPayloadPolicy: {
      fullDetail: false,
      domainsReturned: domainPreview.length,
      checksReturned: checkPreview.length,
      totalDomains: report.domains?.length || 0,
      totalChecks: report.checks?.length || 0,
      fullDetailAvailable: true,
    },
  };
}

function appendEvaluationIntegrityReceipt(root, receipt) {
  const receipts = readEvaluationIntegrityReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function buildEvaluationIntegrityHistory({ receipts = [], limit = 20, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "research-grade-evaluation-integrity-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary:
      fullDetail
        ? "This endpoint returns full local evaluation-integrity receipts. It does not run evaluators, collect analytics, enable private routes, contact external services, deploy, publish, or mutate third-party systems."
        : undefined,
    ...(fullDetail
      ? {
          sideEffectBoundary:
            "The history endpoint reads local evaluation-integrity receipts only. It does not run evaluators, collect analytics, enable private routes, contact external services, deploy, publish, or mutate third-party systems.",
        }
      : {}),
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail: true,
          defaultLimit: 5,
          fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
        }
      : {
          fullDetail: false,
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      latestScore: latest?.summary?.score || 0,
      latestChecks: latest?.summary?.checks || 0,
      ...(fullDetail
        ? {
            latestBand: latest?.summary?.band || "unknown",
            latestPassing: latest?.summary?.passing || 0,
            latestDomains: latest?.summary?.domains || 0,
            latestPassingDomains: latest?.summary?.passingDomains || 0,
          }
        : {}),
    },
    definitions: fullDetail ? undefined : summarizeEvaluationIntegrityDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeEvaluationIntegrityReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Evaluation-integrity history is available; run npm run audit:evaluation-integrity after evaluator, route, runtime, design, proof, or receipt changes."
        : "Run npm run audit:evaluation-integrity to create evaluation-integrity history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:evaluation-integrity && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeEvaluationIntegrityDefinitions(receipt) {
  return {
    fullReportAvailable: true,
    fullHistoryAvailable: true,
    domainCount: (receipt?.domains || []).length,
    checkCount: (receipt?.checks || []).length,
  };
}

function summarizeEvaluationIntegrityReceipt(receipt, { includePreview = false } = {}) {
  const summary = summarizeEvaluationIntegrityReceiptSummary(receipt.summary);
  const compact = {
    id: receipt.id,
    score: summary.score,
    domainSummary: summarizeIntegrityDomains(receipt.domains || [], receipt.summary),
    checkSummary: summarizeIntegrityChecks(receipt.checks || [], receipt.summary),
  };
  if (includePreview) {
    compact.domains = selectPreviewById(
      receipt.domains || [],
      COMPACT_DOMAIN_PREVIEW_IDS,
      COMPACT_DOMAIN_PREVIEW_IDS.length,
    ).map(({ id, score, passed }) => ({
      id,
      score: clamp(Math.round(score || 0), 0, 100),
      passed: Boolean(passed),
    }));
    compact.checks = selectPreviewById(
      receipt.checks || [],
      COMPACT_CHECK_PREVIEW_IDS,
      COMPACT_CHECK_PREVIEW_IDS.length,
    ).map(({ id, passed }) => ({
      id,
      passed: Boolean(passed),
    }));
  }
  if (includePreview) return compact;
  return {
    id: receipt.id,
    trendOnly: true,
    score: summary.score,
    passing: compact.checkSummary.passing,
    failing: compact.checkSummary.failing,
    domains: compact.domainSummary.total,
  };
}

function summarizeEvaluationIntegrityReceiptSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    checks: summary.checks || 0,
    domains: summary.domains || 0,
    passingDomains: summary.passingDomains || 0,
  };
}

function summarizeIntegrityDomains(domains, summary = {}) {
  return {
    total: summary?.domains || domains.length,
    passing: summary?.passingDomains || domains.filter((domain) => domain.passed).length,
    lowestScore: domains.reduce((lowest, domain) => Math.min(lowest, clamp(Math.round(domain.score || 0), 0, 100)), 100),
  };
}

function summarizeIntegrityChecks(checks, summary = {}) {
  return {
    total: summary?.checks || checks.length,
    passing: summary?.passing || checks.filter((check) => check.passed).length,
    failing: summary?.failing || checks.filter((check) => !check.passed).length,
  };
}

function summarizeEvaluationIntegrityDomain(domain) {
  return {
    id: domain.id,
    score: clamp(Math.round(domain.score || 0), 0, 100),
    passed: Boolean(domain.passed),
    verificationCommandAvailable: Boolean(domain.verificationCommand),
  };
}

function summarizeEvaluationIntegrityCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
    detailAvailable: Boolean(check.detail),
  };
}

function selectPreviewById(items, preferredIds, limit) {
  const selected = [];
  const seen = new Set();
  const add = (item) => {
    if (!item || seen.has(item.id)) return;
    selected.push(item);
    seen.add(item.id);
  };
  for (const id of preferredIds) add(items.find((item) => item.id === id));
  for (const item of items) {
    if (selected.length >= limit) break;
    add(item);
  }
  return selected.slice(0, limit);
}

function summarizeEvaluationIntegrityRepeatabilityContract(contract = {}) {
  return {
    commandAvailable: Boolean(contract.command),
    coveredEndpoint: contract.coveredEndpoint || ENDPOINT,
    expectedRefreshEndpoint: contract.expectedRefreshEndpoint || ENDPOINT,
    localOnly: contract.localOnly === true,
    publicSafe: contract.publicSafe === true,
    forbiddenActionCount: contract.forbiddenActions?.length || 0,
  };
}

function readEvaluationIntegrityReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function integrityChecks({
  proofQuality,
  searchQuality,
  opportunityQuality,
  usabilityQuality,
  designStability,
  researchStress,
  runtimeReconciliation,
  accessibilityReports,
  performanceReports,
  visualReports,
  routeManifest,
  refreshPlan,
  packageManifest,
}) {
  const latestA11y = accessibilityReports[0] || null;
  const latestPerformance = performanceReports[0] || null;
  const latestVisual = visualReports[0] || null;
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const scripts = packageManifest.scripts || {};
  const requiredEvaluationRoutes = [
    "/api/evaluation/proof-quality",
    "/api/evaluation/search-quality",
    "/api/evaluation/opportunity-quality",
    "/api/evaluation/usability",
    "/api/design-stability",
    "/api/evaluation/research-stress",
    ENDPOINT,
  ];

  return [
    check({
      id: "truthfulness-calibration",
      severity: "high",
      passed:
        (proofQuality.summary?.score || 0) >= 50 &&
        dimensionScore(proofQuality, "claim-traceability") >= 50 &&
        (proofQuality.limitations || []).length >= 3 &&
        (proofQuality.topRisks || []).every((risk) => risk.recommendation),
      detail: `proof=${proofQuality.summary?.score || 0}/100; claim traceability=${dimensionScore(proofQuality, "claim-traceability")}/100; limitations=${proofQuality.limitations?.length || 0}.`,
      repairAction: "Keep proof-quality scoring paired with claim traceability, visible limitations, and repair recommendations.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/proof-quality",
    }),
    check({
      id: "retrieval-repeatability",
      severity: "medium",
      passed:
        (searchQuality.summary?.cases || 0) >= 7 &&
        (searchQuality.summary?.failing || 0) === 0 &&
        (searchQuality.cases || []).every((item) => item.nextRepair && item.results?.every((result) => result.sourceTrace?.length)),
      detail: `${searchQuality.summary?.passing || 0}/${searchQuality.summary?.cases || 0} search case(s); score=${searchQuality.summary?.score || 0}/100.`,
      repairAction: "Keep every search benchmark result source-traced with next-repair guidance.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/search-quality",
    }),
    check({
      id: "manual-opportunity-calibration",
      severity: "high",
      passed:
        (opportunityQuality.summary?.packages || 0) >= 5 &&
        (opportunityQuality.dimensions || []).some((dimension) => dimension.id === "manual-safety" && dimension.score >= 80) &&
        (opportunityQuality.limitations || []).some((item) => /live posting/i.test(item)),
      detail: `${opportunityQuality.summary?.packages || 0} package(s); manual safety=${dimensionScore(opportunityQuality, "manual-safety")}/100; missing proof=${opportunityQuality.summary?.totalMissingProof || 0}.`,
      repairAction: "Keep opportunity evaluators archetype-bound, manual-only, and explicit about missing proof and non-live-posting limits.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/opportunity-quality",
    }),
    check({
      id: "usability-design-calibration",
      severity: "medium",
      passed:
        (usabilityQuality.summary?.score || 0) >= 65 &&
        dimensionScore(usabilityQuality, "keyboard-workflow") >= 85 &&
        dimensionScore(usabilityQuality, "uncertainty-disclosure") >= 85 &&
        (designStability.summary?.score || 0) >= 85,
      detail: `usability=${usabilityQuality.summary?.score || 0}/100; keyboard=${dimensionScore(usabilityQuality, "keyboard-workflow")}/100; uncertainty=${dimensionScore(usabilityQuality, "uncertainty-disclosure")}/100; design=${designStability.summary?.score || 0}/100.`,
      repairAction: "Keep usability and design-stability evaluators aligned around keyboard, mobile, dense controls, and visible uncertainty.",
      verificationCommand: "npm run audit:design-stability && npm run test:e2e",
    }),
    check({
      id: "accessibility-performance-receipts",
      severity: "high",
      passed:
        latestA11y?.summary?.failing === 0 &&
        latestPerformance?.summary?.failing === 0 &&
        latestVisual?.summary?.failing === 0 &&
        latestVisual?.summary?.changed === 0,
      detail: `a11y=${receiptDetail(latestA11y)}; performance=${receiptDetail(latestPerformance)}; visual=${receiptDetail(latestVisual)} changed=${latestVisual?.summary?.changed ?? "missing"}.`,
      repairAction: "Refresh and repair accessibility, performance, and visual receipts before claiming evaluation integrity.",
      verificationCommand: "npm run audit:a11y && npm run audit:performance && npm run audit:visual",
    }),
    check({
      id: "runtime-stress-coherence",
      severity: "high",
      passed:
        (runtimeReconciliation.summary?.score || 0) >= 85 &&
        runtimeReconciliation.summary?.staleReceiptKinds === 0 &&
        (researchStress.summary?.score || 0) >= 85 &&
        (researchStress.summary?.failing || 0) === 0,
      detail: `runtime=${runtimeReconciliation.summary?.score || 0}/100 stale=${runtimeReconciliation.summary?.staleReceiptKinds ?? "unknown"}; stress=${researchStress.summary?.score || 0}/100 failing=${researchStress.summary?.failing || 0}.`,
      repairAction: "Refresh runtime, surface, evidence, and stress receipts until runtime truth and research stress agree.",
      verificationCommand: "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence && npm run stress:evaluation",
    }),
    check({
      id: "route-refresh-coverage",
      severity: "high",
      passed:
        requiredEvaluationRoutes.every((route) => publicRoutes.includes(route)) &&
        ["/api/evaluation/usability", "/api/design-stability", "/api/evaluation/research-stress", ENDPOINT].every((route) => refreshEndpoints.includes(route)),
      detail: `${requiredEvaluationRoutes.filter((route) => publicRoutes.includes(route)).length}/${requiredEvaluationRoutes.length} evaluation route(s); refresh has ${refreshEndpoints.includes(ENDPOINT) ? "integrity" : "no integrity"} endpoint.`,
      repairAction: "Add evaluation-integrity to the runtime route manifest and safe evidence refresh plan.",
      verificationCommand: "npm run record:runtime-surface && npm run refresh:evidence",
    }),
    check({
      id: "script-coverage",
      severity: "medium",
      passed: Boolean(scripts["audit:evaluation-integrity"]),
      detail: `audit:evaluation-integrity=${Boolean(scripts["audit:evaluation-integrity"])}`,
      repairAction: "Add the audit:evaluation-integrity package script.",
      verificationCommand: "npm run audit:evaluation-integrity",
    }),
  ];
}

function evaluationDomains({
  proofQuality,
  searchQuality,
  opportunityQuality,
  usabilityQuality,
  designStability,
  researchStress,
  runtimeReconciliation,
  accessibilityReports,
  performanceReports,
  visualReports,
}) {
  const latestA11y = accessibilityReports[0] || null;
  const latestPerformance = performanceReports[0] || null;
  const latestVisual = visualReports[0] || null;
  return [
    domain("truthfulness", proofQuality.summary?.score || 0, (proofQuality.limitations || []).length >= 3, "Proof quality exposes limitations and claim traceability.", "npm run check && node server.js # then open /api/evaluation/proof-quality"),
    domain("retrieval", searchQuality.summary?.score || 0, (searchQuality.summary?.failing || 0) === 0, "Search benchmarks are source-traced and repeatable.", "npm run check && node server.js # then open /api/evaluation/search-quality"),
    domain("opportunity", opportunityQuality.summary?.score || 0, dimensionScore(opportunityQuality, "manual-safety") >= 80, "Opportunity scoring stays manual-only and caveated.", "npm run check && node server.js # then open /api/evaluation/opportunity-quality"),
    domain("usability-design", Math.round(((usabilityQuality.summary?.score || 0) + (designStability.summary?.score || 0)) / 2), (designStability.summary?.failing || 0) === 0, "Usability and design stability align around keyboard, mobile, and uncertainty.", "npm run audit:design-stability"),
    domain("accessibility-performance", average([receiptScore(latestA11y), receiptScore(latestPerformance), receiptScore(latestVisual)]), latestA11y?.summary?.failing === 0 && latestPerformance?.summary?.failing === 0 && latestVisual?.summary?.failing === 0, "A11y, performance, and visual local receipts are passing.", "npm run audit:a11y && npm run audit:performance && npm run audit:visual"),
    domain("runtime-stress", Math.round(((runtimeReconciliation.summary?.score || 0) + (researchStress.summary?.score || 0)) / 2), runtimeReconciliation.summary?.staleReceiptKinds === 0 && (researchStress.summary?.failing || 0) === 0, "Runtime truth and stress scenarios reconcile.", "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence && npm run stress:evaluation"),
  ];
}

function buildCalibrationMatrix({ checks, domains }) {
  return domains.map((domain) => ({
    id: domain.id,
    score: domain.score,
    band: domain.band,
    passed: domain.passed,
    blockingChecks: checks.filter((check) => !check.passed && check.detail.toLowerCase().includes(domain.id.split("-")[0])).map((check) => check.id),
    verificationCommand: domain.verificationCommand,
  }));
}

function domain(id, score, passed, detail, verificationCommand) {
  const normalized = clamp(Math.round(score), 0, 100);
  return {
    id,
    score: normalized,
    band: bandFor(normalized),
    passed: Boolean(passed),
    detail,
    verificationCommand,
  };
}

function check({ id, severity, passed, detail, repairAction, verificationCommand }) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function dimensionScore(report, id) {
  return (report.dimensions || []).find((dimension) => dimension.id === id)?.score || 0;
}

function receiptScore(receipt) {
  if (!receipt?.summary) return 0;
  if (typeof receipt.summary.score === "number") return receipt.summary.score;
  return percent(receipt.summary.passing || 0, receipt.summary.total || 0);
}

function receiptDetail(receipt) {
  if (!receipt?.summary) return "missing";
  if (typeof receipt.summary.score === "number") return `${receipt.summary.score}/100`;
  return `${receipt.summary.passing || 0}/${receipt.summary.total || 0}`;
}

function evaluationIntegrityRepeatabilityContract() {
  return {
    command: evaluationIntegrityPlan().command,
    coveredEndpoint: ENDPOINT,
    expectedRefreshEndpoint: ENDPOINT,
    localOnly: true,
    publicSafe: true,
    forbiddenActions: ["collect-analytics", "enable-private-cockpit", "call-external-services", "deploy", "publish", "write-third-party-system"],
  };
}

function evaluationIntegrityNonClaims() {
  return [
    "Does not prove independent human evaluation, academic peer review, or recruiter judgment.",
    "Does not replace manual keyboard and screen-reader review for accessibility claims.",
    "Does not prove production latency, CDN behavior, or real-user monitoring.",
    "Does not read private cockpit data, private documents, credentials, inboxes, calendars, or third-party accounts.",
  ];
}

function weightedScore(checks) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
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

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, maxReceipts));
}

function titleize(value) {
  return String(value || "evaluation-integrity")
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

module.exports = {
  appendEvaluationIntegrityReceipt,
  buildEvaluationIntegrityHistory,
  buildEvaluationIntegrityReportFromReceipt,
  buildEvaluationIntegrityReport,
  buildEvaluationIntegrityResponse,
  evaluationIntegrityPlan,
  readEvaluationIntegrityReceipts,
};
