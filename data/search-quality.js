const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/evaluation/search-quality";
const RECEIPT_RELATIVE_PATH = path.join("var", "search-quality-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function searchQualityPlan() {
  return {
    mode: "proof-backed-search-quality-plan",
    command: "npm run audit:search-quality",
    endpoint: ENDPOINT,
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server, reads the public-safe search-quality evaluation, writes a local receipt under var/, and does not collect visitor analytics, private queries, credentials, private documents, external search traffic, third-party account state, or mutate external systems.",
  };
}

const benchmarkQueries = [
  {
    id: "agent-infra-proof",
    query: "Show me agent infrastructure proof",
    expectedSlugs: ["qagent", "flowpr", "repro"],
    expectedSignals: ["agent", "browser", "qa", "verification"],
  },
  {
    id: "production-maturity",
    query: "What proves production maturity",
    expectedSlugs: ["flowpr", "qagent", "repro", "navio"],
    expectedSignals: ["production", "verification", "live", "status"],
  },
  {
    id: "live-demos",
    query: "What has live demos",
    expectedSlugs: ["anchormesh", "qagent", "flowpr", "fairvalue"],
    expectedSignals: ["live", "demo", "link"],
  },
  {
    id: "bluetooth-work",
    query: "Which projects involve Bluetooth",
    expectedSlugs: ["smartcane"],
    expectedSignals: ["bluetooth", "hardware", "assistive"],
  },
  {
    id: "professor-path",
    query: "What should I show a professor",
    expectedSlugs: ["smartcane", "qagent", "repro", "anchormesh"],
    expectedSignals: ["research", "paper", "methodology", "limitations"],
  },
  {
    id: "ship-proof",
    query: "What proves I can ship",
    expectedSlugs: ["qagent", "flowpr", "anchormesh", "fairvalue"],
    expectedSignals: ["shipped", "built", "demo", "repo"],
  },
  {
    id: "stale-proof",
    query: "What is stale",
    expectedSlugs: ["qagent", "flowpr", "smartcane", "anchormesh"],
    expectedSignals: ["stale", "freshness", "source", "repair"],
  },
];

function searchQualityBenchmarks() {
  return benchmarkQueries.map((query) => ({ ...query }));
}

function buildSearchQualityEvaluation({ benchmarkInputs, claims, artifactCatalog, opportunities, routeManifest = {}, packageManifest = {}, receipts = [] }) {
  const cases = benchmarkInputs.map((input) => gradeCase({ input, claims, artifactCatalog, opportunities }));
  const averageScore = average(cases.map((item) => item.score));
  const failing = cases.filter((item) => item.score < 65);
  const checks = searchQualityChecks({ cases, benchmarkInputs, routeManifest, packageManifest });
  const auditFailing = checks.filter((check) => !check.passed);
  const latestReceipt = receipts[0] || null;
  return {
    generatedAt: new Date().toISOString(),
    mode: "proof-backed-search-quality-evaluation",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This benchmark grades local search results against public-safe claim, artifact, confidence, and opportunity signals. It does not infer visitor analytics, private queries, remote embeddings, or production search traffic.",
    sideEffectBoundary: searchQualityPlan().sideEffectBoundary,
    plan: searchQualityPlan(),
    summary: {
      score: averageScore,
      band: bandFor(averageScore),
      cases: cases.length,
      passing: cases.length - failing.length,
      failing: failing.length,
      averageResultCount: average(cases.map((item) => item.results.length)),
      claimLinkedCases: cases.filter((item) => item.dimensions.claimLinks.passed).length,
      expectedHitCases: cases.filter((item) => item.dimensions.expectedHit.passed).length,
      checks: checks.length,
      auditPassing: checks.length - auditFailing.length,
      auditFailing: auditFailing.length,
      auditCoverageScore: weightedCheckScore(checks),
      latestReceiptId: latestReceipt?.id || null,
    },
    cases,
    recommendations: recommendationsFor(cases),
    checks,
    repairActions: auditFailing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          cases: latestReceipt.summary?.cases || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    nextAction:
      auditFailing[0]?.repairAction ||
      failing[0]?.nextRepair ||
      "Search quality is passing; rerun npm run audit:search-quality after search ranking, claim, artifact, or route changes.",
    verificationCommand: "npm run audit:search-quality && npm run check",
  };
}

function buildSearchQualityEvaluationFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "proof-backed-search-quality-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "proof-backed-search-quality-evaluation" ||
    !report.summary ||
    !report.sourceBoundary ||
    !Array.isArray(report.cases) ||
    !report.cases.every((item) => item.id && item.query && Array.isArray(item.results) && item.results.length > 0) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand) ||
    !Array.isArray(report.recommendations) ||
    !Array.isArray(report.repairActions) ||
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
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs search quality from the latest local receipt. It is cached local benchmark scoring, not visitor analytics, private queries, remote embeddings, or production search traffic.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || searchQualityPlan().sideEffectBoundary,
    plan: searchQualityPlan(),
    summary: {
      ...report.summary,
      latestReceiptId: receipt.id,
    },
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || report.summary.score || 0,
      passing: receipt.summary?.passing || report.summary.passing || 0,
      cases: receipt.summary?.cases || report.summary.cases || 0,
      checks: receipt.summary?.checks || report.summary.checks || 0,
    },
    nextAction:
      report.nextAction ||
      "Search quality is served from the latest local receipt; run npm run audit:search-quality or ?refresh=1 after search ranking, claim, artifact, or route changes.",
    verificationCommand: report.verificationCommand || "npm run audit:search-quality && npm run check",
  };
}

function buildSearchQualityResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const cases = report.cases || [];
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      searchQualityPayloadPolicy: searchQualityPayloadPolicy({ fullDetail, cases, returnedCases: cases.length }),
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy || "live-refresh",
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    boundaryAvailable: Boolean(report.sourceBoundary && report.sideEffectBoundary),
    plan: {
      command: report.plan?.command || searchQualityPlan().command,
    },
    summary: summarizeSearchQualityResponseSummary(report.summary),
    cases: cases.map(summarizeSearchQualityCase),
    checks: (report.checks || []).map(summarizeSearchQualityCheck),
    recommendationCount: (report.recommendations || []).length,
    searchQualityPayloadPolicy: searchQualityPayloadPolicy({ fullDetail, cases, returnedCases: cases.length }),
  };
}

function summarizeSearchQualityCase(item) {
  const dimensionEntries = Object.entries(item.dimensions || {});
  const failingDimensions = dimensionEntries.filter(([, dimension]) => !dimension.passed).map(([id]) => id);
  const compact = {
    id: item.id,
    score: item.score,
    passed: Boolean(item.passed),
    dimensionSummary: {
      passing: dimensionEntries.length - failingDimensions.length,
      failing: failingDimensions,
    },
    results: (item.results || []).slice(0, 1).map(summarizeSearchQualityResult),
  };
  if (!item.passed && item.nextRepair) compact.nextRepairAvailable = true;
  return compact;
}

function summarizeSearchQualityResult(result) {
  return {
    slug: result.slug,
  };
}

function summarizeSearchQualityCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function searchQualityPayloadPolicy({ fullDetail, cases, returnedCases }) {
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail,
    casesReturned: returnedCases,
    totalCases: cases.length,
    defaultResultLimit: null,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
  };
}

function summarizeSearchQualityResponseSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    cases: summary.cases || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function appendSearchQualityReceipt(root, receipt) {
  const receipts = readSearchQualityReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readSearchQualityReceipts(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestSearchQualityReceipt(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
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

function readSearchQualityHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readSearchQualityReceipts(root);
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

function buildSearchQualityHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "proof-backed-search-quality-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "This endpoint returns full local search-quality receipts. It does not run benchmarks, collect analytics, contact external search providers, deploy, publish, or mutate external systems."
      : undefined,
    sourceBoundaryAvailable: fullDetail ? undefined : true,
    sideEffectBoundary: fullDetail
      ? "The history endpoint reads local search-quality receipts only and does not run benchmarks, collect analytics, contact external search providers, deploy, publish, or mutate external systems."
      : undefined,
    sideEffectBoundaryAvailable: fullDetail ? undefined : true,
    receiptStore: fullDetail ? RECEIPT_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    reportEndpoint: fullDetail ? undefined : ENDPOINT,
    historyPayloadPolicy: fullDetail
      ? {
          fullDetail: true,
          fullHistoryEndpoint: `${ENDPOINT}/history?detail=full`,
          fullReportEndpoint: `${ENDPOINT}?detail=full`,
          returnedReceipts: limited.length,
          latestReceiptPreview: "raw",
          olderReceiptPreview: "raw",
        }
      : {
          fullDetail: false,
          returnedReceipts: limited.length,
          fullDetailAvailable: true,
          olderReceiptPreview: "trend-summary-only",
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      latestCheckedAt: fullDetail ? latest?.checkedAt || null : undefined,
      latestScore: latest?.summary?.score || 0,
      latestPassing: latest?.summary?.passing || 0,
      latestCases: latest?.summary?.cases || 0,
      latestAuditPassing: latest?.summary?.auditPassing || 0,
      latestAuditCoverageScore: latest?.summary?.auditCoverageScore || 0,
    },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeSearchQualityReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? latest
        ? "Search-quality history is available; rerun after search ranking, claim, artifact, route, or receipt changes."
        : "Run npm run audit:search-quality to create search quality history."
      : undefined,
    nextActionAvailable: fullDetail ? undefined : Boolean(latest),
    verificationCommand: fullDetail ? "npm run audit:search-quality && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: fullDetail ? undefined : true,
  };
}

function summarizeSearchQualityReceipt(receipt, { includePreview = false } = {}) {
  const cases = receipt.cases || receipt.report?.cases || [];
  const checks = receipt.checks || receipt.report?.checks || [];
  const compact = {
    id: receipt.id,
    summary: summarizeSearchQualityHistorySummary(receipt.summary),
    caseCount: receipt.summary?.cases || cases.length,
    checkCount: receipt.summary?.checks || checks.length,
  };
  if (!includePreview) {
    return {
      id: receipt.id,
      summary: compact.summary,
      latestReceiptPreviewOnly: true,
    };
  }
  return {
    ...compact,
    checkedAt: receipt.checkedAt,
    casePreview: cases.slice(0, 3).map(({ id, score, passed }) => ({
      id,
      score,
      passed,
    })),
  };
}

function summarizeSearchQualityHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    cases: summary.cases || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 5, 50));
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

function writeReceipts(root, receipts) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function searchQualityChecks({ cases, benchmarkInputs, routeManifest, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || null;
  const scripts = packageManifest.scripts || null;
  const checks = [
    check("benchmark-depth", benchmarkInputs.length >= 6 && cases.length === benchmarkInputs.length, "high", `${cases.length}/${benchmarkInputs.length} benchmark case(s).`, "Keep a broad search benchmark set."),
    check("passing-cases", cases.filter((item) => item.passed).length >= Math.ceil(cases.length * 0.7), "high", `${cases.filter((item) => item.passed).length}/${cases.length} passing case(s).`, "Keep search-quality cases above the passing threshold."),
    check("expected-hit-coverage", cases.every((item) => item.dimensions.expectedHit.passed), "high", `${cases.filter((item) => item.dimensions.expectedHit.passed).length}/${cases.length} expected-hit case(s).`, "Keep expected proof projects discoverable in top search results."),
    check("claim-link-coverage", cases.every((item) => item.dimensions.claimLinks.passed), "high", `${cases.filter((item) => item.dimensions.claimLinks.passed).length}/${cases.length} claim-linked case(s).`, "Keep every search result tied to claim evidence."),
    check("inspection-path-coverage", cases.every((item) => item.dimensions.inspectionPath.passed), "medium", `${cases.filter((item) => item.dimensions.inspectionPath.passed).length}/${cases.length} inspection-path case(s).`, "Keep next inspection paths attached to search results."),
    check("analytics-boundary", true, "high", "Search quality uses local benchmark fixtures only.", "Do not collect visitor analytics, private queries, or remote search traffic for this benchmark."),
  ];
  if (publicRoutes) {
    checks.push(
      check(
        "public-route-manifest",
        ["/api/evaluation/search-quality", "/api/evaluation/search-quality/plan", "/api/evaluation/search-quality/history"].every((route) => publicRoutes.includes(route)),
        "high",
        `${["/api/evaluation/search-quality", "/api/evaluation/search-quality/plan", "/api/evaluation/search-quality/history"].filter((route) => publicRoutes.includes(route)).length}/3 search-quality route(s).`,
        "Declare search-quality evaluation, plan, and history routes in the public route manifest.",
      ),
    );
  }
  if (scripts) {
    checks.push(check("package-script", Boolean(scripts["audit:search-quality"]), "high", `audit:search-quality=${Boolean(scripts["audit:search-quality"])}`, "Add the audit:search-quality package script."));
  }
  return checks;
}

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: id === "package-script" ? "npm run audit:search-quality" : "npm run audit:search-quality && npm run check",
  };
}

function gradeCase({ input, claims, artifactCatalog, opportunities }) {
  const results = (input.results || []).slice(0, 5).map((result, index) =>
    resultSummary({ result, rank: index + 1, claims, artifactCatalog, opportunities }),
  );
  const topSlugs = results.slice(0, 3).map((result) => result.slug);
  const expectedHit = input.expectedSlugs.some((slug) => topSlugs.includes(slug));
  const dimensions = {
    expectedHit: dimension(expectedHit, expectedHit ? `Expected slug appeared in top 3: ${topSlugs.join(", ")}` : `Expected one of ${input.expectedSlugs.join(", ")} but got ${topSlugs.join(", ") || "no results"}`),
    evidenceSnippet: dimension(results.every((result) => result.evidenceSnippet.length >= 20), "Every result should carry a concrete evidence snippet."),
    claimLinks: dimension(results.every((result) => result.relatedClaims.length > 0), "Every result should expose related claim IDs."),
    confidence: dimension(results.length > 0 && average(results.map((result) => result.confidenceScore)) >= 55, "Average result confidence should stay above 55."),
    artifactCoverage: dimension(results.slice(0, 3).every((result) => result.artifactCount > 0), "Top results should have public-safe artifacts."),
    inspectionPath: dimension(results.every((result) => result.nextInspection), "Every result should name the next evidence inspection path."),
  };
  const score = clamp(
    Math.round(
      (dimensions.expectedHit.passed ? 26 : 0) +
        (dimensions.evidenceSnippet.passed ? 16 : 0) +
        (dimensions.claimLinks.passed ? 16 : 0) +
        (dimensions.confidence.passed ? 14 : 0) +
        (dimensions.artifactCoverage.passed ? 14 : 0) +
        (dimensions.inspectionPath.passed ? 14 : 0),
    ),
    0,
    100,
  );
  return {
    id: input.id,
    query: input.query,
    expectedSlugs: input.expectedSlugs,
    expectedSignals: input.expectedSignals,
    score,
    band: bandFor(score),
    passed: score >= 65,
    dimensions,
    results,
    nextRepair:
      score >= 65
        ? "Keep this search path covered as new evidence surfaces are added."
        : repairFor({ input, dimensions }),
  };
}

function resultSummary({ result, rank, claims, artifactCatalog, opportunities }) {
  const projectClaims = claims.filter((claim) => claim.relatedProject === result.slug);
  const artifacts = (artifactCatalog.artifacts || []).filter((artifact) => artifact.project === result.slug && artifact.sourceStatus === "available");
  const opportunityMatches = (opportunities.opportunities || [])
    .filter((opportunity) => (opportunity.suggestedProjectOrder || []).includes(result.slug))
    .map((opportunity) => opportunity.id)
    .slice(0, 3);
  return {
    rank,
    slug: result.slug,
    title: result.title,
    confidenceScore: Number(result.confidenceScore || 0),
    evidenceSnippet: result.evidenceSnippet || "",
    explanation: result.explanation || "",
    relatedClaims: (result.relatedClaims || []).filter(Boolean),
    claimCount: projectClaims.length,
    artifactCount: artifacts.length,
    opportunityMatches,
    nextInspection: result.slug ? `/api/evidence/${result.slug}` : null,
    sourceTrace: [
      { type: "search-result", id: result.slug, label: result.title },
      ...projectClaims.slice(0, 2).map((claim) => ({
        type: "claim",
        id: claim.id,
        label: claim.text,
        evidenceStrength: claim.evidenceStrength,
      })),
      ...artifacts.slice(0, 2).map((artifact) => ({
        type: "artifact",
        id: artifact.id,
        label: artifact.label,
        artifactType: artifact.artifactType,
      })),
    ],
  };
}

function dimension(passed, detail) {
  return { passed: Boolean(passed), detail };
}

function repairFor({ input, dimensions }) {
  if (!dimensions.expectedHit.passed) return `Tune search or add evidence text so ${input.expectedSlugs.join(", ")} can surface for "${input.query}".`;
  if (!dimensions.claimLinks.passed) return "Ensure every search result carries related claim IDs.";
  if (!dimensions.artifactCoverage.passed) return "Attach public-safe artifacts to the top-ranked projects for this query.";
  return "Improve evidence snippets, confidence, or inspection paths for this query.";
}

function recommendationsFor(cases) {
  const failing = cases.filter((item) => !item.passed);
  if (!failing.length) {
    return ["Search benchmark is passing; keep benchmark queries updated as the proof graph grows."];
  }
  return failing.slice(0, 5).map((item) => ({
    caseId: item.id,
    query: item.query,
    action: item.nextRepair,
    verificationCommand: "npm run check && node server.js # then open /api/evaluation/search-quality",
  }));
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

function weightedCheckScore(checks) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

module.exports = {
  appendSearchQualityReceipt,
  buildSearchQualityEvaluation,
  buildSearchQualityEvaluationFromReceipt,
  buildSearchQualityHistory,
  buildSearchQualityResponse,
  readLatestSearchQualityReceipt,
  readSearchQualityHistoryWindow,
  readSearchQualityReceipts,
  searchQualityBenchmarks,
  searchQualityPlan,
};
