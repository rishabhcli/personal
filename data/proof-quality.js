const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/evaluation/proof-quality";
const RECEIPT_RELATIVE_PATH = path.join("var", "proof-quality-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();
const historyResponseCache = new Map();
const COMPACT_DIMENSION_PREVIEW_IDS = ["maintenance-risk", "claim-traceability", "artifact-coverage", "graph-integrity"];
const COMPACT_CHECK_PREVIEW_IDS = ["public-route-manifest", "package-script", "dimension-depth", "proof-trial-guardrails"];

function proofQualityPlan() {
  return {
    mode: "research-grade-proof-quality-plan",
    command: "npm run audit:proof-quality",
    endpoint: ENDPOINT,
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server, reads the public-safe proof-quality evaluation, writes a local receipt under var/, and does not change claims, publish private material, contact third parties, deploy, pay, submit forms, use credentials, or mutate external systems.",
  };
}

function buildProofQualityEvaluation({
  projects,
  claims,
  trust,
  artifactCatalog,
  maintenance,
  proofTrials,
  contradictions,
  graphQuality,
  opportunities,
  routeManifest = {},
  packageManifest = {},
  receipts = [],
}) {
  const dimensions = [
    dimension({
      id: "claim-traceability",
      label: "Claim traceability",
      score: percent(trust.counts.linkBackedClaims + trust.counts.sourceBackedClaims, trust.counts.totalClaims),
      weight: 0.22,
      detail: `${trust.counts.linkBackedClaims + trust.counts.sourceBackedClaims}/${trust.counts.totalClaims} claims are link-backed or source-backed.`,
      evidence: ["claim ledger", "trust summary"],
    }),
    dimension({
      id: "artifact-coverage",
      label: "Artifact coverage",
      score: percent(artifactCatalog.counts.availableArtifacts, artifactCatalog.counts.artifacts + artifactCatalog.gaps.length),
      weight: 0.16,
      detail: `${artifactCatalog.counts.availableArtifacts} available artifact(s); ${artifactCatalog.gaps.length} explicit gap(s).`,
      evidence: ["artifact catalog", "artifact gap map"],
    }),
    dimension({
      id: "graph-integrity",
      label: "Graph integrity",
      score: percent(graphQuality.summary.passing, graphQuality.summary.checks),
      weight: 0.16,
      detail: `${graphQuality.summary.passing}/${graphQuality.summary.checks} evidence-graph quality checks pass.`,
      evidence: ["graph quality report"],
    }),
    dimension({
      id: "proof-trial-guardrails",
      label: "Proof-trial guardrails",
      score: proofTrials.summary.writeEnabledTrials === 0 ? percent(proofTrials.summary.deterministicReplays, proofTrials.summary.totalTrials) : 0,
      weight: 0.14,
      detail: `${proofTrials.summary.deterministicReplays}/${proofTrials.summary.totalTrials} deterministic replay(s); ${proofTrials.summary.writeEnabledTrials} write-enabled trial(s).`,
      evidence: ["safe proof trials"],
    }),
    dimension({
      id: "privacy-safety",
      label: "Privacy safety",
      score: privacyScore({ claims, contradictions }),
      weight: 0.14,
      detail: `${trust.counts.privateReferences} private reference(s), ${contradictions.summary.conflicts} contradiction(s), ${contradictions.summary.quarantinedClaims} quarantined claim(s).`,
      evidence: ["public claim projection", "contradiction report"],
    }),
    dimension({
      id: "opportunity-explainability",
      label: "Opportunity explainability",
      score: percent(opportunities.opportunities.filter((opportunity) => opportunity.rankExplanation && opportunity.sourceTrace?.length).length, opportunities.opportunities.length),
      weight: 0.1,
      detail: `${opportunities.opportunities.filter((opportunity) => opportunity.rankExplanation && opportunity.sourceTrace?.length).length}/${opportunities.opportunities.length} opportunity route(s) expose rank explanations and source traces.`,
      evidence: ["opportunity radar"],
    }),
    dimension({
      id: "maintenance-risk",
      label: "Maintenance risk",
      score: maintenanceScore(maintenance),
      weight: 0.08,
      detail: `${maintenance.summary.issues} open maintenance issue(s); ${maintenance.summary.highSeverity} high severity.`,
      evidence: ["maintenance report"],
    }),
  ];
  const overallScore = weightedScore(dimensions);
  const projectBenchmarks = projects
    .map((project) => projectBenchmark({ project, claims, artifactCatalog, maintenance }))
    .sort((left, right) => right.score - left.score || left.slug.localeCompare(right.slug));
  const weakestDimensions = dimensions
    .slice()
    .sort((left, right) => left.score - right.score)
    .slice(0, 3);
  const checks = proofQualityChecks({ projects, claims, dimensions, projectBenchmarks, proofTrials, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "research-grade-proof-quality-evaluation",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This evaluation grades only public-safe local evidence already modeled by the app. It is not an external peer review, admissions review, production uptime claim, or comprehensive audit of every real-world artifact.",
    sideEffectBoundary: proofQualityPlan().sideEffectBoundary,
    plan: proofQualityPlan(),
    methodology: {
      scale: "0-100 weighted score",
      bandPolicy: "high >= 85, medium >= 70, low < 70",
      dimensions: dimensions.map((item) => ({ id: item.id, weight: item.weight, evidence: item.evidence })),
    },
    summary: {
      projects: projects.length,
      claims: claims.length,
      artifacts: artifactCatalog.counts.artifacts,
      score: overallScore,
      band: bandFor(overallScore),
      dimensions: dimensions.length,
      highRiskDimensions: dimensions.filter((item) => item.band === "low").length,
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      auditCoverageScore: weightedCheckScore(checks),
      latestReceiptId: latestReceipt?.id || null,
    },
    dimensions,
    projectBenchmarks,
    topRisks: weakestDimensions.map((item) => ({
      id: item.id,
      label: item.label,
      score: item.score,
      recommendation: recommendationForDimension(item.id),
    })),
    recommendations: [
      ...weakestDimensions.map((item) => recommendationForDimension(item.id)),
      "Keep running npm run verify and npm run audit:visual after every portfolio evidence or layout change.",
    ],
    limitations: [
      "Scores are deterministic local heuristics, not third-party validation.",
      "Private material is counted only as public-safe references until manually approved.",
      "External availability and deploy-provider identity still require live provider checks.",
    ],
    checks,
    repairActions: failing.map((check) => ({
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
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    verificationCommand: "npm run audit:proof-quality && npm run check",
  };
}

function buildProofQualityEvaluationFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "research-grade-proof-quality-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "research-grade-proof-quality-evaluation" ||
    !report.summary ||
    !report.methodology ||
    !Array.isArray(report.dimensions) ||
    !report.dimensions.every((dimension) => dimension.id && dimension.label && dimension.detail && Array.isArray(dimension.evidence)) ||
    !Array.isArray(report.projectBenchmarks) ||
    !Array.isArray(report.topRisks) ||
    !Array.isArray(report.recommendations) ||
    !Array.isArray(report.limitations) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.verificationCommand) ||
    !Array.isArray(report.repairActions)
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
      "This response reconstructs proof quality from the latest local receipt. It is not fresh evaluation, external peer review, admissions review, production uptime proof, or comprehensive third-party artifact audit.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || proofQualityPlan().sideEffectBoundary,
    plan: proofQualityPlan(),
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
    verificationCommand: report.verificationCommand || "npm run audit:proof-quality && npm run check",
  };
}

function buildProofQualityEvaluationResponse(evaluation, { detail = "summary", benchmarkLimit = 3 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const policy = proofQualityPayloadPolicy({ fullDetail, evaluation, benchmarkLimit });
  if (fullDetail) {
    return {
      ...evaluation,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      proofQualityPayloadPolicy: policy,
    };
  }
  const dimensions = evaluation.dimensions || [];
  const projectBenchmarks = evaluation.projectBenchmarks || [];
  const checks = evaluation.checks || [];
  return {
    mode: evaluation.mode,
    detail: "summary",
    compact: true,
    cachedFromReceipt: Boolean(evaluation.cachedFromReceipt),
    cachePolicy: evaluation.cachePolicy,
    refreshEndpoint: evaluation.refreshEndpoint || `${ENDPOINT}?refresh=1`,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    plan: summarizeProofQualityPlan(evaluation.plan || proofQualityPlan()),
    summary: summarizeProofQualityCompactSummary(evaluation.summary || {}),
    dimensions: selectProofQualityDimensionPreview(dimensions).map(summarizeProofQualityDimension),
    projectBenchmarkPreview: projectBenchmarks.slice(0, benchmarkLimit).map(summarizeProofQualityProjectBenchmark),
    checks: selectProofQualityCheckPreview(checks).map(summarizeProofQualityCheck),
    proofQualityPayloadPolicy: policy,
  };
}

function appendProofQualityReceipt(root, receipt) {
  const receipts = readProofQualityReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function buildProofQualityHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const cacheKey = `${fullDetail ? "full" : "summary"}:${boundedLimit}:${totalAvailable}:${limited.map((receipt) => `${receipt.id}:${receipt.checkedAt || ""}`).join("|")}`;
  const cached = historyResponseCache.get(cacheKey);
  if (cached) return cached;
  const history = {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "research-grade-proof-quality-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local proof-quality receipts. It does not change claims, publish private material, contact third parties, deploy, pay, submit forms, use credentials, or mutate external systems.",
          sideEffectBoundary:
            "The history endpoint reads local proof-quality receipts only. It does not change claims, publish private material, contact third parties, deploy, pay, submit forms, use credentials, or mutate external systems.",
        }
      : {}),
    receiptStore: fullDetail ? RECEIPT_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: proofQualityHistoryPayloadPolicy({ fullDetail, rowsReturned: limited.length }),
    summary: proofQualityHistorySummary({ limited, totalAvailable, boundedLimit, fullDetail }),
    definitions: fullDetail ? undefined : summarizeProofQualityDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeProofQualityReceipt(receipt, { latest: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Proof-quality history is available; run npm run audit:proof-quality after claim, artifact, graph, opportunity, maintenance, or proof-trial changes."
        : "Run npm run audit:proof-quality to create proof-quality history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:proof-quality && node --test test/api-contract.test.mjs" : undefined,
  };
  historyResponseCache.set(cacheKey, history);
  return history;
}

function proofQualityHistoryPayloadPolicy({ fullDetail, rowsReturned = 0 }) {
  if (fullDetail) {
    return {
      detail: "full",
      fullDetail,
      defaultLimit: 5,
      fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
      latestReceiptPreview: "full-receipt",
      olderReceiptPreview: "full-receipt",
    };
  }
  return {
    fullDetail,
    fullDetailAvailable: true,
    historyRowsReturned: rowsReturned,
  };
}

function proofQualityHistorySummary({ limited, totalAvailable, boundedLimit, fullDetail = false }) {
  const latest = limited[0] || null;
  const summary = {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
  };
  if (!fullDetail) return summary;
  return {
    ...summary,
    latestCheckedAt: latest?.checkedAt || null,
    latestScore: latest?.summary?.score || 0,
    latestBand: latest?.summary?.band || "unknown",
    latestDimensions: latest?.summary?.dimensions || 0,
    latestProjects: latest?.summary?.projects || 0,
    latestAuditCoverageScore: latest?.summary?.auditCoverageScore || 0,
  };
}

function summarizeProofQualityDefinitions(receipt) {
  const report = receipt?.report || receipt || {};
  const methodology = receipt?.methodology || report.methodology || {};
  const dimensions = receipt?.dimensions || report.dimensions || [];
  const benchmarks = receipt?.projectBenchmarks || report.projectBenchmarks || [];
  const checks = receipt?.checks || report.checks || [];
  return {
    fullReportAvailable: true,
    fullHistoryAvailable: true,
    planCommand: proofQualityPlan().command,
    dimensionSummary: {
      total: dimensions.length,
      claimTraceability: dimensions.some((dimension) => dimension.id === "claim-traceability"),
      weights: dimensions.filter((dimension) => Number.isFinite(dimension.weight)).length,
      recommendations: dimensions.filter((dimension) => recommendationForDimension(dimension.id)).length,
    },
    projectBenchmarkSummary: {
      total: benchmarks.length,
      nextActions: benchmarks.filter((benchmark) => benchmark.nextAction).length,
    },
    recommendationCount: (receipt?.recommendations || report.recommendations || []).length,
    limitationCount: (receipt?.limitations || report.limitations || []).length,
    checkSummary: {
      total: checks.length,
      commands: checks.filter((check) => check.verificationCommand).length,
      publicRouteManifest: checks.some((check) => check.id === "public-route-manifest"),
    },
  };
}

function readProofQualityReceipts(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestProofQualityReceipt(root) {
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

function readProofQualityHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readProofQualityReceipts(root);
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

function summarizeProofQualityReceipt(receipt, { latest = false } = {}) {
  const report = receipt.report || {};
  const summary = receipt.summary || report.summary || {};
  const dimensions = receipt.dimensions || report.dimensions || [];
  const benchmarks = receipt.projectBenchmarks || report.projectBenchmarks || [];
  const checks = receipt.checks || report.checks || [];
  const topRisks = receipt.topRisks || report.topRisks || [];
  const repairActions = receipt.repairActions || report.repairActions || [];
  const summarized = {
    id: receipt.id,
    score: summary.score || 0,
    band: summary.band || "unknown",
    auditCoverageScore: summary.auditCoverageScore || 0,
    dimensionSummary: summarizeProofQualityDimensions(dimensions),
    projectBenchmarkSummary: summarizeProjectBenchmarks(benchmarks),
    recommendationCount: (receipt.recommendations || report.recommendations || []).length,
    limitationCount: (receipt.limitations || report.limitations || []).length,
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    },
    repairActionCount: repairActions.length,
  };
  if (!latest) {
    return {
      id: receipt.id,
      trendOnly: true,
      trendSummary: {
        score: summarized.score,
        auditCoverageScore: summarized.auditCoverageScore,
      },
    };
  }
  return summarized;
}

function summarizeProofQualityDimensions(dimensions = []) {
  const low = dimensions.filter((dimension) => dimension.band === "low").length;
  const medium = dimensions.filter((dimension) => dimension.band === "medium").length;
  const high = dimensions.filter((dimension) => dimension.band === "high").length;
  return {
    total: dimensions.length,
    high,
    medium,
    low,
    lowestScore: dimensions.length ? Math.min(...dimensions.map((dimension) => dimension.score || 0)) : 0,
  };
}

function summarizeProofQualityMethodology(methodology = {}, dimensions = []) {
  return {
    scaleAvailable: Boolean(methodology.scale),
    bandPolicyAvailable: Boolean(methodology.bandPolicy),
    dimensionCount: dimensions.length,
    evidenceReferenceCount: dimensions.reduce((sum, dimension) => sum + (Array.isArray(dimension.evidence) ? dimension.evidence.length : 0), 0),
  };
}

function summarizeProofQualityPlan(plan = {}) {
  return {
    command: plan.command,
  };
}

function summarizeProofQualityCompactSummary(summary = {}) {
  return {
    projects: summary.projects || 0,
    claims: summary.claims || 0,
    artifacts: summary.artifacts || 0,
    score: summary.score || 0,
    band: summary.band || "unknown",
    auditCoverageScore: summary.auditCoverageScore || 0,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function summarizeProofQualityDimension(dimension) {
  return {
    id: dimension.id,
    score: dimension.score || 0,
    band: dimension.band || "unknown",
  };
}

function selectProofQualityDimensionPreview(dimensions) {
  const selected = [];
  const seen = new Set();
  for (const id of COMPACT_DIMENSION_PREVIEW_IDS) pushUniqueProofQualityItem(selected, seen, dimensions.find((dimension) => dimension.id === id));
  for (const dimension of dimensions) {
    if (selected.length >= COMPACT_DIMENSION_PREVIEW_IDS.length) break;
    pushUniqueProofQualityItem(selected, seen, dimension);
  }
  return selected.slice(0, COMPACT_DIMENSION_PREVIEW_IDS.length);
}

function selectProofQualityCheckPreview(checks) {
  const selected = [];
  const seen = new Set();
  for (const check of checks.filter((item) => !item.passed)) pushUniqueProofQualityItem(selected, seen, check);
  for (const id of COMPACT_CHECK_PREVIEW_IDS) pushUniqueProofQualityItem(selected, seen, checks.find((check) => check.id === id));
  for (const check of checks) {
    if (selected.length >= COMPACT_CHECK_PREVIEW_IDS.length) break;
    pushUniqueProofQualityItem(selected, seen, check);
  }
  return selected.slice(0, COMPACT_CHECK_PREVIEW_IDS.length);
}

function pushUniqueProofQualityItem(selected, seen, item) {
  if (!item || seen.has(item.id)) return;
  selected.push(item);
  seen.add(item.id);
}

function summarizeProofQualityProjectBenchmark(benchmark) {
  return {
    slug: benchmark.slug,
    score: benchmark.score || 0,
  };
}

function summarizeProofQualityCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function proofQualityPayloadPolicy({ fullDetail, evaluation, benchmarkLimit }) {
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
      dimensionsReturned: Math.min((evaluation.dimensions || []).length, COMPACT_DIMENSION_PREVIEW_IDS.length),
      totalDimensions: (evaluation.dimensions || []).length,
      projectBenchmarksReturned: Math.min((evaluation.projectBenchmarks || []).length, benchmarkLimit),
      checksReturned: Math.min((evaluation.checks || []).length, COMPACT_CHECK_PREVIEW_IDS.length),
      totalChecks: (evaluation.checks || []).length,
    };
  }
  return {
    detail: fullDetail ? "full" : "summary",
    fullDetail,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    dimensionsReturned: (evaluation.dimensions || []).length,
    projectBenchmarksReturned: fullDetail ? (evaluation.projectBenchmarks || []).length : Math.min((evaluation.projectBenchmarks || []).length, benchmarkLimit),
    checksReturned: (evaluation.checks || []).length,
    compactFieldProfile: fullDetail ? "full" : "ids-scores-counts-availability",
    fullFieldGroupsPreserved: fullDetail ? 6 : undefined,
  };
}

function summarizeProjectBenchmarks(benchmarks = []) {
  return {
    total: benchmarks.length,
    high: benchmarks.filter((benchmark) => benchmark.band === "high").length,
    medium: benchmarks.filter((benchmark) => benchmark.band === "medium").length,
    low: benchmarks.filter((benchmark) => benchmark.band === "low").length,
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

function proofQualityChecks({ projects, claims, dimensions, projectBenchmarks, proofTrials, routeManifest, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || null;
  const scripts = packageManifest.scripts || null;
  const dimensionIds = new Set(dimensions.map((dimension) => dimension.id));
  const checks = [
    check("dimension-depth", dimensions.length >= 6, "high", `${dimensions.length} proof-quality dimension(s).`, "Keep proof quality multi-dimensional."),
    check("project-coverage", projectBenchmarks.length === projects.length, "high", `${projectBenchmarks.length}/${projects.length} project benchmark(s).`, "Keep every project in the proof-quality benchmark table."),
    check("claim-coverage", claims.length > 0 && dimensions.some((dimension) => dimension.id === "claim-traceability"), "medium", `${claims.length} claim(s) covered.`, "Keep claim traceability in the proof-quality score."),
    check("proof-trial-guardrails", proofTrials.summary.writeEnabledTrials === 0 && proofTrials.summary.deterministicReplays === proofTrials.summary.totalTrials, "high", `${proofTrials.summary.deterministicReplays}/${proofTrials.summary.totalTrials} deterministic trial(s); writes=${proofTrials.summary.writeEnabledTrials}.`, "Keep proof trials deterministic and write-disabled inside proof quality."),
    check("privacy-safety-dimension", dimensionIds.has("privacy-safety"), "high", "Privacy safety dimension present.", "Keep public/private projection safety in proof quality."),
    check("recommendations-present", projectBenchmarks.every((benchmark) => benchmark.nextAction) && dimensions.every((dimension) => dimension.detail), "medium", `${projectBenchmarks.length} project next action(s).`, "Keep repair guidance attached to dimensions and project benchmarks."),
  ];
  if (publicRoutes) {
    checks.push(
      check(
        "public-route-manifest",
        ["/api/evaluation/proof-quality", "/api/evaluation/proof-quality/plan", "/api/evaluation/proof-quality/history"].every((route) => publicRoutes.includes(route)),
        "high",
        `${["/api/evaluation/proof-quality", "/api/evaluation/proof-quality/plan", "/api/evaluation/proof-quality/history"].filter((route) => publicRoutes.includes(route)).length}/3 proof-quality route(s).`,
        "Declare proof-quality evaluation, plan, and history routes in the public route manifest.",
      ),
    );
  }
  if (scripts) {
    checks.push(check("package-script", Boolean(scripts["audit:proof-quality"]), "high", `audit:proof-quality=${Boolean(scripts["audit:proof-quality"])}`, "Add the audit:proof-quality package script."));
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
    verificationCommand: id === "package-script" ? "npm run audit:proof-quality" : "npm run audit:proof-quality && npm run check",
  };
}

function projectBenchmark({ project, claims, artifactCatalog, maintenance }) {
  const projectClaims = claims.filter((claim) => claim.relatedProject === project.slug);
  const strongClaims = projectClaims.filter((claim) => claim.evidenceStrength !== "needs-source");
  const artifacts = artifactCatalog.artifacts.filter((artifact) => artifact.project === project.slug);
  const gaps = artifactCatalog.gaps.filter((gap) => gap.project === project.slug);
  const issues = maintenance.issues.filter((issue) => issue.project === project.slug);
  const score = Math.round(
    percent(strongClaims.length, Math.max(projectClaims.length, 1)) * 0.45 +
      percent(artifacts.length, artifacts.length + gaps.length) * 0.3 +
      Math.max(0, 100 - issues.length * 12) * 0.25,
  );
  return {
    slug: project.slug,
    title: project.title,
    score,
    band: bandFor(score),
    claims: projectClaims.length,
    strongClaims: strongClaims.length,
    artifacts: artifacts.length,
    gaps: gaps.length,
    issues: issues.length,
    nextAction: nextActionForProject({ project, gaps, issues, strongClaims, projectClaims }),
  };
}

function dimension({ id, label, score, weight, detail, evidence }) {
  const normalized = clamp(Math.round(score), 0, 100);
  return {
    id,
    label,
    score: normalized,
    band: bandFor(normalized),
    weight,
    detail,
    evidence,
  };
}

function privacyScore({ claims, contradictions }) {
  const publicSafePrivate = claims.filter((claim) => claim.privacyLevel !== "public").every((claim) => claim.publicVisibility === "public-safe-reference");
  const contradictionPenalty = Math.min(60, (contradictions.summary.conflicts || 0) * 20);
  return clamp((publicSafePrivate ? 100 : 65) - contradictionPenalty, 0, 100);
}

function maintenanceScore(maintenance) {
  const highPenalty = maintenance.summary.highSeverity * 18;
  const issuePenalty = Math.min(45, maintenance.summary.issues * 2);
  return clamp(100 - highPenalty - issuePenalty, 0, 100);
}

function weightedScore(dimensions) {
  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function weightedCheckScore(checks) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
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

function recommendationForDimension(id) {
  return {
    "claim-traceability": "Attach stronger public sources to needs-source claims or lower the claim wording.",
    "artifact-coverage": "Replace explicit screenshot/media gaps with approved public-safe artifacts.",
    "graph-integrity": "Repair dangling, duplicate, or unexplained graph relationships before expanding the graph.",
    "proof-trial-guardrails": "Keep proof trials deterministic, read-only, and credential-free before adding live runners.",
    "privacy-safety": "Resolve contradictions and keep private references public-safe until reviewed locally.",
    "opportunity-explainability": "Keep every opportunity tied to matched projects, claims, missing proof, and source traces.",
    "maintenance-risk": "Prioritize high-severity maintenance issues and rerun verification receipts after repair.",
  }[id];
}

function nextActionForProject({ project, gaps, issues, strongClaims, projectClaims }) {
  if (gaps.length) return gaps[0].suggestedRepair;
  if (issues.length) return issues[0].suggestedFix;
  if (strongClaims.length < projectClaims.length) return `Attach stronger sources to remaining weak claims for ${project.title}.`;
  return `Keep ${project.title} evidence fresh with the next status and visual receipt.`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  appendProofQualityReceipt,
  buildProofQualityEvaluation,
  buildProofQualityEvaluationFromReceipt,
  buildProofQualityEvaluationResponse,
  buildProofQualityHistory,
  proofQualityPlan,
  readLatestProofQualityReceipt,
  readProofQualityHistoryWindow,
  readProofQualityReceipts,
};
