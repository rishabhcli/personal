const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const receiptDir = path.join(__dirname, "..", "var");
const receiptPath = path.join(receiptDir, "status-receipts.json");
const maxReceipts = 50;
const endpoint = "/api/status";
const receiptStore = path.join("var", "status-receipts.json");
const COMPACT_HISTORY_CHECK_PREVIEW_LIMIT = 3;
const COMPACT_HISTORY_TARGET_PREVIEW_LIMIT = 3;

function statusPlan() {
  return {
    mode: "command-center-status-plan",
    command: "npm run record:status",
    endpoint,
    refreshEndpoint: `${endpoint}?refresh=1`,
    recordEndpoint: `${endpoint}?record=1`,
    receiptStore,
    sideEffectBoundary:
      "The recorder starts a temporary local server, runs public-safe internal route, configured domain, live demo, and GitHub profile checks, writes a local receipt under var/, and does not deploy, publish, unlock private cockpit data, collect analytics, or contact third-party write APIs.",
  };
}

function appendStatusReceipt(payload, context = {}) {
  const receipt = {
    id: `status-${Date.now().toString(36)}`,
    mode: "command-center-status-receipt",
    checkedAt: payload.checkedAt,
    baseUrl: context.baseUrl || null,
    summary: summarize(payload.checks),
    checks: payload.checks.map((check) => ({
      label: check.label,
      role: check.role,
      url: check.url,
      ok: check.ok,
      status: check.status,
      ms: check.ms,
      detail: check.detail || null,
    })),
    sourceBoundary:
      "Status receipts store public-safe internal route, configured domain, live demo, and GitHub profile check results from a local server run.",
    sideEffectBoundary: statusPlan().sideEffectBoundary,
    verificationCommand: statusPlan().command,
  };

  const history = readStatusReceipts();
  history.unshift(receipt);
  writeReceipts(history.slice(0, maxReceipts));
  return receipt;
}

function buildStatusResponse(payload, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = `${endpoint}?detail=full`;
  if (fullDetail) {
    return {
      ...payload,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      statusPayloadPolicy: {
        fullDetail: true,
        checksReturned: payload.checks?.length || 0,
      },
    };
  }

  return {
    checkedAt: payload.checkedAt,
    cachedFromReceipt: Boolean(payload.cachedFromReceipt),
    cachePolicy: payload.cachePolicy,
    refreshEndpoint: payload.refreshEndpoint,
    recordEndpoint: payload.recordEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    receiptRecorded: Boolean(payload.receiptRecorded),
    receiptId: payload.receiptId || null,
    receiptSummary: payload.receiptSummary,
    sourceBoundaryAvailable: Boolean(payload.sourceBoundary),
    sideEffectBoundaryAvailable: Boolean(payload.sideEffectBoundary),
    checks: (payload.checks || []).map(summarizeStatusCheck),
    statusPayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
      checksReturned: payload.checks?.length || 0,
    },
  };
}

function buildStatusHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "command-center-status-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "This endpoint returns full local status receipts. It does not run checks, deploy, publish, unlock private cockpit data, collect analytics, or contact third-party write APIs."
      : undefined,
    sourceBoundaryAvailable: undefined,
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local status receipts only. It does not run checks, deploy, publish, unlock private cockpit data, collect analytics, or contact third-party write APIs."
        : undefined,
    sideEffectBoundaryAvailable: undefined,
    boundaryAvailable: fullDetail ? undefined : true,
    receiptStore: fullDetail ? receiptStore : undefined,
    fullDetailEndpoint: `${endpoint}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail: true,
          defaultLimit: 5,
          fullDetailEndpoint: `${endpoint}/history?detail=full`,
        }
      : {
          fullDetail: false,
          fullDetailAvailable: true,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      ...(fullDetail
        ? {
            latestReceiptId: latest?.id || null,
            latestCheckedAt: latest?.checkedAt || null,
            latestTotal: latest?.summary?.total || 0,
            latestPassing: latest?.summary?.passing || 0,
            latestFailing: latest?.summary?.failing || 0,
            latestAverageMs: latest?.summary?.averageMs || 0,
          }
        : {}),
    },
    definitions: fullDetail ? undefined : summarizeStatusDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => (index === 0 ? summarizeStatusReceipt(receipt) : summarizeStatusTrendReceipt(receipt))),
    nextAction: fullDetail
      ? limited[0]
        ? "Status history is available; run npm run record:status after route, domain, demo, or status-check changes."
        : "Run npm run record:status to create status history."
      : undefined,
    verificationCommand: fullDetail ? `${statusPlan().command} && node --test test/api-contract.test.mjs` : undefined,
    nextActionAvailable: undefined,
    verificationCommandAvailable: undefined,
  };
}

function readStatusReceipts() {
  if (!existsSync(receiptPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(receiptPath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function summarize(checks) {
  const total = checks.length;
  const passing = checks.filter((check) => check.ok).length;
  const failing = total - passing;
  const averageMs = total ? Math.round(checks.reduce((sum, check) => sum + check.ms, 0) / total) : 0;
  return { total, passing, failing, averageMs };
}

function summarizeStatusDefinitions(receipt) {
  const checks = receipt?.checks || [];
  return {
    evidenceAccess: {
      statusEndpoint: endpoint,
    },
    checkDefinitions: {
      count: checks.length,
      targetPreview: checks.slice(0, COMPACT_HISTORY_TARGET_PREVIEW_LIMIT).map((check) => ({
        id: statusCheckId(check),
        target: normalizeStatusTarget(check.url, receipt?.baseUrl),
      })),
    },
  };
}

function summarizeStatusReceipt(receipt) {
  return {
    id: receipt.id,
    summary: receipt.summary,
    checkPreview: selectStatusCheckPreview(receipt.checks || [], COMPACT_HISTORY_CHECK_PREVIEW_LIMIT).map((check) => {
      const result = {
        id: statusCheckId(check),
        ok: Boolean(check.ok),
        status: check.status,
      };
      if (check.detail) result.detail = check.detail;
      return result;
    }),
  };
}

function summarizeStatusCheck(check) {
  const result = {
    label: check.label,
    role: check.role,
    ok: Boolean(check.ok),
    status: check.status,
  };
  if (check.detail) result.detail = check.detail;
  return result;
}

function selectStatusCheckPreview(checks, limit) {
  const failing = checks.filter((check) => !check.ok);
  const passing = checks.filter((check) => check.ok);
  return [...failing, ...passing].slice(0, limit);
}

function summarizeStatusTrendReceipt(receipt) {
  return {
    id: receipt.id,
    summary: receipt.summary,
  };
}

function statusCheckId(check) {
  return String(check.label || check.url || "status-check")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeStatusTarget(value, baseUrl) {
  const url = String(value || "");
  if (baseUrl && url.startsWith(baseUrl)) return url.slice(baseUrl.length) || "/";
  return url;
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 5, maxReceipts));
}

function writeReceipts(receipts) {
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

module.exports = {
  appendStatusReceipt,
  buildStatusHistory,
  buildStatusResponse,
  readStatusReceipts,
  statusPlan,
};
