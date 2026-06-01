const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");

const STORE_RELATIVE_PATH = path.join("var", "evidence-refresh-receipts.json");
const historyWindowCache = new Map();
const COMPACT_SLOW_CHECK_PREVIEW_LIMIT = 2;
const COMPACT_FAILING_CHECK_PREVIEW_LIMIT = 2;
const COMPACT_SAMPLE_ENDPOINT_LIMIT = 2;

function evidenceRefreshPlan() {
  return {
    mode: "safe-evidence-refresh-plan",
    command: "npm run refresh:evidence",
    scheduleRecommendation: "Run manually before publishing, after a project/demo change, and weekly while actively using the portfolio.",
    sideEffectBoundary:
      "The refresh runner starts a temporary local server, calls public-safe endpoints, writes local refresh receipts under var/, and does not publish, deploy, approve private artifacts, or contact users.",
    endpoints: [
      "/api/projects",
      "/api/graph",
      "/api/status",
      "/api/maintenance",
      "/api/runtime-truth",
      "/api/runtime-truth/fingerprint",
      "/api/runtime-truth/attestation",
      "/api/runtime-surface/latest",
      "/api/route-latency",
      "/api/runtime-boundary",
      "/api/runtime-reconciliation",
      "/api/runtime-diff",
      "/api/runtime-explain",
      "/api/runtime-deploy-readiness",
      "/api/runtime-evidence-chain",
      "/api/graph-scoreboard",
      "/api/graph-lineage",
      "/api/graph-projection-guard",
      "/api/graph-confidence",
      "/api/graph-depth-score",
      "/api/trust-blockade",
      "/api/evaluation/claim-calibration",
      "/api/evaluation/opportunity-quality",
      "/api/opportunity-board",
      "/api/opportunity-derisking",
      "/api/opportunity-ranking",
      "/api/opportunity-scorecard",
      "/api/evaluation/usability",
      "/api/design-stability",
      "/api/keyboard-readiness",
      "/api/design-ambition",
      "/api/evaluation/integrity",
      "/api/evaluation/research-stress",
      "/api/evaluation/research-rigor",
      "/api/evaluation/sample",
      "/api/artifacts",
      "/api/artifact-transcripts",
      "/api/artifact-museum",
      "/api/artifact-museum-compare",
      "/api/artifact-replays",
      "/api/artifact-gaps",
      "/api/artifact-gap-repair",
      "/api/intents",
      "/api/narratives",
      "/api/narrative-contrast",
      "/api/narrative-objections",
      "/api/narrative-tailor",
      "/api/narrative-disclosure",
      "/api/narrative-sequence",
      "/api/graph-disclosure-links",
      "/api/self-review",
    ],
    receiptStore: STORE_RELATIVE_PATH,
  };
}

function readEvidenceRefreshReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readEvidenceRefreshHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readEvidenceRefreshReceipts(root);
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

function buildEvidenceRefreshHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "safe-evidence-refresh-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local public-safe evidence refresh receipts. It is still not a fresh refresh run, deploy, private artifact approval, analytics collection, or third-party system call.",
          sideEffectBoundary:
            "The history endpoint reads local evidence refresh receipts only. It does not start refresh runners, publish, deploy, approve private artifacts, contact users, collect analytics, or call third-party systems.",
          receiptStore: STORE_RELATIVE_PATH,
        }
      : {}),
    fullDetailEndpoint: "/api/evidence-refresh/history?detail=full",
    historyPayloadPolicy: fullDetail
      ? {
          fullDetail,
          defaultLimit: 5,
          fullDetailAvailable: true,
          latestSlowCheckPreviewLimit: "all",
          latestFailingCheckPreviewLimit: "all",
          latestSampleEndpointLimit: "all",
          historyRowsReturned: limited.length,
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
    },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeEvidenceRefreshReceipt(receipt, { includeSamples: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Evidence refresh history is available; run npm run refresh:evidence after project, route, proof, or artifact changes."
        : "Run npm run refresh:evidence to create safe evidence refresh history."
      : undefined,
    verificationCommand: fullDetail ? "npm run refresh:evidence && node --test test/api-contract.test.mjs" : undefined,
  };
}

function appendEvidenceRefreshReceipt(root, receipt) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  const receipts = readEvidenceRefreshReceipts(root);
  receipts.unshift(receipt);
  writeFileSync(storePath, `${JSON.stringify({ receipts: receipts.slice(0, 50) }, null, 2)}\n`);
  return receipt;
}

function summarizeEvidenceRefreshReceipt(receipt, { includeSamples = true } = {}) {
  const checks = Array.isArray(receipt.checks) ? receipt.checks : [];
  const failingChecks = checks.filter((check) => !check.ok);
  const slowChecks = checks
    .slice()
    .sort((left, right) => Number(right.ms || 0) - Number(left.ms || 0))
    .slice(0, COMPACT_SLOW_CHECK_PREVIEW_LIMIT);
  const summary = summarizeEvidenceRefreshReceiptSummary(receipt, checks, failingChecks, slowChecks);
  const compact = {
    id: receipt.id,
    total: summary.total,
    passing: summary.passing,
    failing: summary.failing,
    coverageDigest: summary.coverageDigest,
  };
  if (!includeSamples) {
    return {
      id: compact.id,
      trendOnly: true,
      total: compact.total,
      failing: compact.failing,
      coverageDigest: compact.coverageDigest,
    };
  }
  return {
    ...compact,
    slowestMs: summary.slowestMs,
    slowestEndpoint: summary.slowestEndpoint,
    statusCodes: countBy(checks, (check) => String(check.status || "unknown")),
    failingChecks: failingChecks.slice(0, COMPACT_FAILING_CHECK_PREVIEW_LIMIT).map(compactRefreshCheck),
    slowChecks: slowChecks.map(compactRefreshCheck),
    sampleEndpoints: checks.slice(0, COMPACT_SAMPLE_ENDPOINT_LIMIT).map((check) => check.endpoint),
  };
}

function summarizeEvidenceRefreshReceiptSummary(receipt, checks, failingChecks, slowChecks) {
  return {
    total: receipt.summary?.total || checks.length,
    passing: receipt.summary?.passing || checks.filter((check) => check.ok).length,
    failing: receipt.summary?.failing || failingChecks.length,
    slowestMs: slowChecks[0]?.ms || 0,
    slowestEndpoint: slowChecks[0]?.endpoint || null,
    coverageDigest: coverageDigest(checks),
  };
}

function compactRefreshCheck(check) {
  const compact = {
    endpoint: check.endpoint,
    ms: check.ms || 0,
  };
  if (!check.ok) {
    compact.status = check.status;
    compact.detailAvailable = Boolean(check.detail);
  }
  return compact;
}

function coverageDigest(checks) {
  return createHash("sha256")
    .update(
      checks
        .map((check) => `${check.endpoint}:${check.ok === true ? "ok" : "fail"}:${check.status || "unknown"}`)
        .join("|"),
    )
    .digest("hex")
    .slice(0, 16);
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function boundedHistoryLimit(limit) {
  const numericLimit = Number(limit);
  return Math.max(1, Math.min(Number.isFinite(numericLimit) && numericLimit > 0 ? numericLimit : 5, 50));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

module.exports = {
  appendEvidenceRefreshReceipt,
  buildEvidenceRefreshHistory,
  evidenceRefreshPlan,
  readEvidenceRefreshHistoryWindow,
  readEvidenceRefreshReceipts,
};
