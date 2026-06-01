const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const STORE_RELATIVE_PATH = path.join("var", "accessibility-audit-reports.json");
const maxReports = 50;
const latestReportCache = new Map();
const historyWindowCache = new Map();
const COMPACT_CHECK_PREVIEW_LIMIT = 3;

function accessibilityAuditPlan() {
  return {
    mode: "scripted-accessibility-audit-plan",
    command: "npm run audit:a11y",
    scope: "Homepage command center at desktop and mobile widths.",
    checks: [
      "document title",
      "main landmark",
      "image alt text",
      "interactive accessible names",
      "form labels",
      "unique element ids",
      "canvas accessible label",
      "mobile horizontal overflow",
    ],
    limitation:
      "This is a deterministic scripted audit, not a complete manual WCAG review. It records issues and should be paired with human keyboard/screen-reader review for final claims.",
    reportStore: STORE_RELATIVE_PATH,
  };
}

function readAccessibilityAuditReports(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.reports) ? parsed.reports : [];
  } catch {
    return [];
  }
}

function appendAccessibilityAuditReport(root, report) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  const reports = readAccessibilityAuditReports(root);
  reports.unshift(report);
  writeFileSync(storePath, `${JSON.stringify({ reports: reports.slice(0, maxReports) }, null, 2)}\n`);
  return report;
}

function readLatestAccessibilityAuditReport(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return null;
  try {
    const cacheKey = reportCacheKey(storePath);
    const cached = latestReportCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.report;
    const text = readFileSync(storePath, "utf8");
    const reportsIndex = text.indexOf('"reports"');
    const arrayStart = reportsIndex === -1 ? -1 : text.indexOf("[", reportsIndex);
    const objectStart = arrayStart === -1 ? -1 : text.indexOf("{", arrayStart);
    if (objectStart === -1) return null;
    const objectEnd = findJsonObjectEnd(text, objectStart);
    if (objectEnd === -1) return null;
    const report = JSON.parse(text.slice(objectStart, objectEnd + 1));
    latestReportCache.set(storePath, { cacheKey, report });
    return report;
  } catch {
    return null;
  }
}

function readAccessibilityAuditHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { reports: [], totalAvailable: 0 };
  try {
    const storeKey = reportCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const reports = readAccessibilityAuditReports(root);
    const window = {
      reports: reports.slice(0, boundedLimit),
      totalAvailable: reports.length,
    };
    historyWindowCache.set(storePath, { cacheKey, window });
    return window;
  } catch {
    return { reports: [], totalAvailable: 0 };
  }
}

function buildAccessibilityAuditHistory({ reports = [], limit = 20, totalAvailable = reports.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = reports.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: new Date().toISOString(),
    mode: "scripted-accessibility-audit-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local scripted accessibility audit reports. It is not a complete manual WCAG review or screen-reader certification.",
          sideEffectBoundary:
            "The history endpoint reads local accessibility audit reports only. It does not run a browser audit, publish results, collect analytics, contact third parties, or mutate external systems.",
          reportStore: STORE_RELATIVE_PATH,
        }
      : {
          sourceBoundaryAvailable: true,
          sideEffectBoundaryAvailable: true,
          reportStoreAvailable: true,
        }),
    fullDetailEndpoint: "/api/accessibility-audit/history?detail=full",
    historyPayloadPolicy: {
      fullDetail,
      defaultLimit: 20,
      fullDetailAvailable: true,
      latestCheckPreviewLimit: fullDetail ? "all" : COMPACT_CHECK_PREVIEW_LIMIT,
      historyRowsReturned: limited.length,
    },
    summary: {
      reports: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReportId: limited[0]?.id || null,
      latestCheckedAt: limited[0]?.checkedAt || null,
      latestPassing: limited[0]?.summary?.passing || 0,
      latestTotal: limited[0]?.summary?.total || 0,
      latestFailing: limited[0]?.summary?.failing || 0,
    },
    reports: fullDetail ? limited : limited.map((report, index) => summarizeAccessibilityAuditReport(report, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Accessibility audit history is available; run npm run audit:a11y after UI, content, layout, canvas, or interaction changes."
        : "Run npm run audit:a11y to create accessibility audit history."
      : undefined,
    nextActionAvailable: Boolean(limited[0]),
    verificationCommand: fullDetail ? "npm run audit:a11y && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: true,
  };
}

function summarizeAccessibilityAuditReport(report, { includePreview = true } = {}) {
  const compact = {
    id: report.id,
    checkedAt: report.checkedAt,
    summary: summarizeAccessibilityAuditSummary(report.summary),
    checkCount: (report.checks || []).length || report.summary?.total || 0,
    scopeAvailable: Boolean(report.scope),
    limitationAvailable: Boolean(report.limitation),
  };
  if (!includePreview) {
    return {
      ...compact,
      latestReportPreviewOnly: true,
    };
  }
  return {
    ...compact,
    checkPreview: (report.checks || []).slice(0, COMPACT_CHECK_PREVIEW_LIMIT).map(({ id, passed, severity, detail }) => ({
      id,
      passed,
      severity,
      detailAvailable: Boolean(detail),
    })),
  };
}

function summarizeAccessibilityAuditSummary(summary = {}) {
  return {
    total: summary.total || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, maxReports));
}

function reportCacheKey(storePath) {
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
  accessibilityAuditPlan,
  appendAccessibilityAuditReport,
  buildAccessibilityAuditHistory,
  readAccessibilityAuditHistoryWindow,
  readAccessibilityAuditReports,
  readLatestAccessibilityAuditReport,
};
