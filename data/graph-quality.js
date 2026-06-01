const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/graph-quality";
const RECEIPT_RELATIVE_PATH = path.join("var", "graph-quality-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function graphQualityPlan() {
  return {
    mode: "evidence-graph-quality-plan",
    command: "npm run audit:graph-quality",
    endpoint: ENDPOINT,
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server, reads the public-safe graph-quality report, writes a local receipt under var/, and does not crawl private files, contact third parties, load credentials, publish graph changes, or mutate external systems.",
  };
}

function buildGraphQualityReport({ graph, projects, claims, opportunities, artifactCatalog, routeManifest = {}, packageManifest = {}, receipts = [] }) {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const duplicateNodeIds = duplicates(graph.nodes.map((node) => node.id));
  const danglingEdges = graph.edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target));
  const unexplainedEdges = graph.edges.filter((edge) => !edge.relation || !edge.explanation);
  const projectNodeIds = new Set(projects.map((project) => project.slug));
  const projectNodesMissing = projects.filter((project) => !nodeIds.has(project.slug)).map((project) => project.slug);
  const projectClaimsMissingEdges = claims
    .filter((claim) => claim.relatedProject)
    .filter((claim) => graph.nodes.some((node) => node.id === claim.id))
    .filter((claim) => !graph.edges.some((edge) => edge.source === claim.relatedProject && edge.target === claim.id))
    .map((claim) => claim.id);
  const opportunityNodes = (opportunities.opportunities || []).map((opportunity) => `opportunity-${opportunity.id}`);
  const opportunityNodesMissing = opportunityNodes.filter((id) => !nodeIds.has(id));
  const projectsWithoutArtifact = projects
    .filter((project) => !(artifactCatalog.artifacts || []).some((artifact) => artifact.project === project.slug))
    .map((project) => project.slug);
  const orphanProjects = [...projectNodeIds].filter(
    (id) => !graph.edges.some((edge) => edge.source === "rishabh" && edge.target === id),
  );
  const checks = [
    check("unique-node-ids", duplicateNodeIds.length === 0, `${duplicateNodeIds.length} duplicate node id(s).`),
    check("no-dangling-edges", danglingEdges.length === 0, `${danglingEdges.length} dangling edge(s).`),
    check("edge-explanations", unexplainedEdges.length === 0, `${unexplainedEdges.length} edge(s) missing relation or explanation.`),
    check("project-node-coverage", projectNodesMissing.length === 0, `${projectNodesMissing.length} project node(s) missing.`),
    check("claim-edge-coverage", projectClaimsMissingEdges.length === 0, `${projectClaimsMissingEdges.length} graph claim node(s) missing project edge(s).`),
    check("opportunity-node-coverage", opportunityNodesMissing.length === 0, `${opportunityNodesMissing.length} opportunity node(s) missing.`),
    check("artifact-coverage", projectsWithoutArtifact.length === 0, `${projectsWithoutArtifact.length} project(s) missing artifact records.`),
    check("person-project-edges", orphanProjects.length === 0, `${orphanProjects.length} project(s) missing person-built edge.`),
    check("public-safe-graph-text", !JSON.stringify(graph).includes("/Users/"), "Graph text contains no local user paths."),
  ];
  if (routeManifest.publicApiRoutes) {
    checks.push(
      check(
        "public-route-manifest",
        ["/api/graph-quality", "/api/graph-quality/plan", "/api/graph-quality/history"].every((route) =>
          routeManifest.publicApiRoutes.includes(route),
        ),
        `${["/api/graph-quality", "/api/graph-quality/plan", "/api/graph-quality/history"].filter((route) => routeManifest.publicApiRoutes.includes(route)).length}/3 graph-quality route(s).`,
        "high",
        "Declare graph-quality report, plan, and history routes in the public route manifest.",
      ),
    );
  }
  if (packageManifest.scripts) {
    checks.push(
      check(
        "package-script",
        Boolean(packageManifest.scripts["audit:graph-quality"]),
        `audit:graph-quality=${Boolean(packageManifest.scripts["audit:graph-quality"])}`,
        "high",
        "Add the audit:graph-quality package script.",
      ),
    );
  }
  const failing = checks.filter((item) => !item.passed);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-graph-quality-report",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "Graph quality checks validate public-safe node and edge structure. They do not assert that every real-world relationship is exhaustively modeled.",
    sideEffectBoundary: graphQualityPlan().sideEffectBoundary,
    plan: graphQualityPlan(),
    summary: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      checks: checks.length,
      passing: checks.filter((item) => item.passed).length,
      failing: failing.length,
      auditCoverageScore: weightedCheckScore(checks),
      latestReceiptId: latestReceipt?.id || null,
    },
    checks,
    gaps: {
      duplicateNodeIds,
      danglingEdges,
      unexplainedEdges: unexplainedEdges.slice(0, 8),
      projectNodesMissing,
      projectClaimsMissingEdges,
      opportunityNodesMissing,
      projectsWithoutArtifact,
      orphanProjects,
    },
    repairActions: failing.map((item) => ({
      id: item.id,
      priority: item.severity,
      action: item.repairAction,
      verificationCommand: item.verificationCommand,
    })),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          nodes: latestReceipt.summary?.nodes || 0,
          edges: latestReceipt.summary?.edges || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
  };
}

function buildGraphQualityReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-graph-quality-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "evidence-graph-quality-report" ||
    !report.summary ||
    !report.gaps ||
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
      "This response reconstructs graph quality from the latest local receipt. It is not fresh graph analysis and does not prove private graph state, production deployment facts, or third-party account state.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || graphQualityPlan().sideEffectBoundary,
    plan: graphQualityPlan(),
    summary: {
      ...report.summary,
      latestReceiptId: receipt.id,
    },
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      nodes: receipt.summary?.nodes || report.summary.nodes || 0,
      edges: receipt.summary?.edges || report.summary.edges || 0,
      passing: receipt.summary?.passing || report.summary.passing || 0,
      checks: receipt.summary?.checks || report.summary.checks || 0,
    },
  };
}

function buildGraphQualityResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const policy = graphQualityPayloadPolicy(report, { fullDetail });
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      graphQualityPayloadPolicy: policy,
    };
  }

  return {
    generatedAt: report.generatedAt,
    checkedAt: report.checkedAt,
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy,
    refreshEndpoint: report.refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    sourceBoundaryAvailable: Boolean(report.sourceBoundary),
    sideEffectBoundaryAvailable: Boolean(report.sideEffectBoundary),
    plan: {
      command: report.plan?.command || graphQualityPlan().command,
      endpoint: ENDPOINT,
    },
    summary: report.summary,
    checks: (report.checks || []).map(({ id, passed }) => ({
      id,
      passed: Boolean(passed),
    })),
    checkSummary: summarizeGraphQualityChecks(report.checks || []),
    gapSummary: summarizeGraphQualityGaps(report.gaps || {}),
    repairActions: (report.repairActions || []).map(({ id, priority }) => ({ id, priority })),
    latestReceipt: report.latestReceipt,
    graphQualityPayloadPolicy: policy,
  };
}

function appendGraphQualityReceipt(root, receipt) {
  const receipts = readGraphQualityReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readGraphQualityReceipts(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestGraphQualityReceipt(root) {
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

function readGraphQualityHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readGraphQualityReceipts(root);
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

function buildGraphQualityHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const sourceBoundary =
    "This endpoint returns full local graph-quality receipts. It is still not fresh graph analysis and does not prove private graph state, production deployment facts, or third-party account state.";
  const compactSourceBoundary =
    "This endpoint returns compact local graph-quality receipt trends so history reads stay lightweight. Full graph quality reports remain available through the full-detail history.";
  const sideEffectBoundary =
    "The history endpoint reads local graph-quality receipts only. It does not crawl private files, contact third parties, load credentials, publish graph changes, or mutate external systems.";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "evidence-graph-quality-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? { sourceBoundary, sideEffectBoundary }
      : {
          sourceBoundaryAvailable: Boolean(compactSourceBoundary),
          sideEffectBoundaryAvailable: Boolean(sideEffectBoundary),
        }),
    receiptStore: fullDetail ? RECEIPT_RELATIVE_PATH : undefined,
    receiptStoreAvailable: fullDetail ? undefined : true,
    fullDetailEndpoint: "/api/graph-quality/history?detail=full",
    historyPayloadPolicy: graphQualityHistoryPayloadPolicy({ fullDetail }),
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: limited[0]?.id || null,
    },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeGraphQualityReceipt(receipt, { includeChecks: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Graph quality history is available; run npm run audit:graph-quality after graph, claim, artifact, opportunity, or route changes."
        : "Run npm run audit:graph-quality to create graph quality history."
      : undefined,
    nextActionAvailable: fullDetail ? undefined : Boolean(limited[0]),
    verificationCommand: fullDetail ? "npm run audit:graph-quality && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: fullDetail ? undefined : true,
  };
}

function graphQualityHistoryPayloadPolicy({ fullDetail }) {
  if (fullDetail) {
    return {
      detail: "full",
      fullDetail,
      defaultLimit: 5,
      latestReceiptPreview: "full-receipt",
      olderReceiptPreview: "full-receipt",
    };
  }
  return {
    fullDetail,
    fullDetailAvailable: true,
    checkPreviewLimit: 4,
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function summarizeGraphQualityReceipt(receipt, { includeChecks = true } = {}) {
  const report = receipt.report || {};
  const gaps = receipt.gaps || report.gaps || {};
  const summary = {
    id: receipt.id,
    summary: summarizeGraphQualityReceiptSummary(receipt.summary),
  };
  if (includeChecks) {
    summary.gapSummary = {
      duplicateNodeIds: (gaps.duplicateNodeIds || []).length,
      danglingEdges: (gaps.danglingEdges || []).length,
      unexplainedEdges: (gaps.unexplainedEdges || []).length,
      projectNodesMissing: (gaps.projectNodesMissing || []).length,
      projectClaimsMissingEdges: (gaps.projectClaimsMissingEdges || []).length,
      opportunityNodesMissing: (gaps.opportunityNodesMissing || []).length,
      projectsWithoutArtifact: (gaps.projectsWithoutArtifact || []).length,
      orphanProjects: (gaps.orphanProjects || []).length,
    };
    summary.checkPreview = (receipt.checks || report.checks || []).slice(0, 4).map(({ id, passed, severity }) => ({
      id,
      passed,
      severity,
    }));
  } else {
    summary.latestReceiptPreviewOnly = true;
  }
  return summary;
}

function summarizeGraphQualityReceiptSummary(summary = {}) {
  return {
    nodes: summary.nodes || 0,
    edges: summary.edges || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
  };
}

function summarizeGraphQualityChecks(checks) {
  const failing = checks.filter((check) => !check.passed);
  return {
    total: checks.length,
    passing: checks.length - failing.length,
    failing: failing.length,
    failingCheckIds: failing.map((check) => check.id),
  };
}

function summarizeGraphQualityGaps(gaps) {
  return {
    duplicateNodeIds: (gaps.duplicateNodeIds || []).length,
    danglingEdges: (gaps.danglingEdges || []).length,
    unexplainedEdges: (gaps.unexplainedEdges || []).length,
    projectNodesMissing: (gaps.projectNodesMissing || []).length,
    projectClaimsMissingEdges: (gaps.projectClaimsMissingEdges || []).length,
    opportunityNodesMissing: (gaps.opportunityNodesMissing || []).length,
    projectsWithoutArtifact: (gaps.projectsWithoutArtifact || []).length,
    orphanProjects: (gaps.orphanProjects || []).length,
  };
}

function graphQualityPayloadPolicy(report, { fullDetail }) {
  const checks = report.checks || [];
  const repairActions = report.repairActions || [];
  return {
    fullDetail,
    compactDefault: !fullDetail,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    checksReturned: checks.length,
    checkDetailAvailable: checks.some((check) => Boolean(check.detail)),
    checkRepairActionAvailable: checks.some((check) => Boolean(check.repairAction)),
    checkVerificationCommandAvailable: checks.some((check) => Boolean(check.verificationCommand)),
    gapDetailAvailable: Boolean(report.gaps && Object.keys(report.gaps).length),
    repairActionDetailAvailable: repairActions.some((action) => Boolean(action.action || action.verificationCommand)),
  };
}

function boundedHistoryLimit(limit) {
  const numericLimit = Number(limit);
  return Math.max(1, Math.min(Number.isFinite(numericLimit) && numericLimit > 0 ? numericLimit : 5, maxReceipts));
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

function check(id, passed, detail, severity = "high", repairAction = "Repair the graph-quality input and rerun the graph-quality audit.") {
  return {
    id,
    passed: Boolean(passed),
    severity: passed ? "info" : severity,
    detail,
    repairAction,
    verificationCommand: id === "package-script" ? "npm run audit:graph-quality" : "npm run audit:graph-quality && npm run check",
  };
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

function weightedCheckScore(checks) {
  const weights = { high: 18, medium: 11, low: 6, info: 4 };
  const max = checks.reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

module.exports = {
  appendGraphQualityReceipt,
  buildGraphQualityHistory,
  buildGraphQualityReport,
  buildGraphQualityReportFromReceipt,
  buildGraphQualityResponse,
  graphQualityPlan,
  readGraphQualityHistoryWindow,
  readGraphQualityReceipts,
  readLatestGraphQualityReceipt,
};
