const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const REPORT_STORE_RELATIVE_PATH = path.join("var", "visual-regression-reports.json");
const BASELINE_STORE_RELATIVE_PATH = path.join("var", "visual-regression-baselines.json");
const SCREENSHOT_DIR_RELATIVE_PATH = path.join("var", "visual-regression-screenshots");

function visualRegressionPlan() {
  return {
    mode: "visual-regression-plan",
    command: "npm run audit:visual",
    acceptCommand: "ACCEPT_VISUAL_CHANGES=1 npm run audit:visual",
    scope: "Temporary local server with stable element screenshots for core command-center flows.",
    snapshots: [
      {
        id: "desktop-guide-answer",
        label: "Desktop guide answer",
        viewport: { width: 1280, height: 900 },
        selector: "#guide-answer",
        action: "initial-guide",
      },
      {
        id: "desktop-qagent-case",
        label: "Desktop QAgent case study",
        viewport: { width: 1280, height: 900 },
        selector: "#case-study",
        action: "open-qagent-case",
      },
      {
        id: "desktop-packet-terminal",
        label: "Desktop packet terminal output",
        viewport: { width: 1280, height: 900 },
        selector: "#terminal-output",
        action: "run-packet-recruiter",
      },
      {
        id: "mobile-preview-wall",
        label: "Mobile artifact preview wall",
        viewport: { width: 390, height: 844 },
        selector: "#preview-wall",
        action: "mobile-preview-wall",
      },
    ],
    limitation:
      "This compares local element screenshots and text signatures against local baselines. It catches large UI regressions but does not replace human visual review across browsers, devices, and production assets.",
    reportStore: REPORT_STORE_RELATIVE_PATH,
    baselineStore: BASELINE_STORE_RELATIVE_PATH,
    screenshotDirectory: SCREENSHOT_DIR_RELATIVE_PATH,
  };
}

function readVisualRegressionReports(root) {
  const storePath = path.join(root, REPORT_STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.reports) ? parsed.reports : [];
  } catch {
    return [];
  }
}

function buildVisualRegressionHistory({ reports = [], limit = 5, totalAvailable = reports.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = reports.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const compactRows = fullDetail ? limited : limited.slice(0, 1);
  const latest = limited[0] || null;
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "visual-regression-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary:
      fullDetail
        ? "This endpoint returns full local visual-regression reports. It is local screenshot evidence only and does not replace human visual review across production browsers, devices, or assets."
        : undefined,
    sourceBoundaryAvailable: undefined,
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local visual-regression reports only. It does not start browsers, update baselines, write screenshots, deploy, publish, or contact third-party services."
        : undefined,
    sideEffectBoundaryAvailable: undefined,
    reportStore: fullDetail ? REPORT_STORE_RELATIVE_PATH : undefined,
    reportStoreAvailable: undefined,
    fullDetailEndpoint: "/api/visual-regression/history?detail=full",
    historyPayloadPolicy: visualHistoryPayloadPolicy({ fullDetail, reportsReturned: compactRows.length }),
    summary: {
      reports: compactRows.length,
      totalAvailable,
      limit: boundedLimit,
      latestReportId: latest?.id || null,
      ...(fullDetail ? { latestCheckedAt: latest?.checkedAt || null } : {}),
      latestTotal: latest?.summary?.total || 0,
      latestPassing: latest?.summary?.passing || 0,
      latestFailing: latest?.summary?.failing || 0,
      latestChanged: latest?.summary?.changed || 0,
    },
    definitionsAvailable: undefined,
    omittedDetailAvailable: undefined,
    reports: fullDetail ? limited : compactRows.map((report) => summarizeVisualRegressionReport(report)),
    nextAction: fullDetail
      ? latest
        ? "Visual-regression history is available; run npm run audit:visual after visual, layout, copy, or screenshot target changes."
        : "Run npm run audit:visual to create visual-regression history."
      : undefined,
    nextActionAvailable: undefined,
    verificationCommand: fullDetail ? "npm run audit:visual && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: undefined,
  };
}

function summarizeVisualRegressionReport(report, { includePreview = true } = {}) {
  const checks = report.checks || [];
  const compact = {
    id: report.id,
    checkSummary: summarizeVisualRegressionChecks(checks, report.summary),
    checkCount: checks.length,
  };
  if (!includePreview) {
    return {
      ...compact,
      latestReportPreviewOnly: true,
    };
  }
  return {
    ...compact,
    checkPreview: selectVisualRegressionPreview(checks, 2).map(({ id, comparison, passed }) => ({
      id,
      comparison,
      passed: Boolean(passed),
    })),
  };
}

function visualHistoryPayloadPolicy({ fullDetail, reportsReturned }) {
  if (fullDetail) {
    return {
      detail: "full",
      fullDetail: true,
      defaultLimit: 5,
      fullDetailEndpoint: "/api/visual-regression/history?detail=full",
      latestReportPreview: "full-report",
      olderReportPreview: "full-report",
      reportsReturned,
    };
  }
  return {
    fullDetail: false,
    reportsReturned,
  };
}

function selectVisualRegressionPreview(checks = [], limit = 2) {
  const selected = [];
  for (const check of checks) {
    if (selected.length >= limit) break;
    if (!check.passed || check.comparison === "changed") selected.push(check);
  }
  for (const check of checks) {
    if (selected.length >= limit) break;
    if (!selected.includes(check)) selected.push(check);
  }
  return selected;
}

function summarizeVisualRegressionChecks(checks, summary = {}) {
  return {
    total: summary.total || checks.length,
    passing: summary.passing || checks.filter((check) => check.passed).length,
    failing: summary.failing || checks.filter((check) => !check.passed).length,
    changed: summary.changed || checks.filter((check) => check.comparison === "changed").length,
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 5, 50));
}

function appendVisualRegressionReport(root, report) {
  const storePath = path.join(root, REPORT_STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  const reports = readVisualRegressionReports(root);
  reports.unshift(report);
  writeFileSync(storePath, `${JSON.stringify({ reports: reports.slice(0, 50) }, null, 2)}\n`);
  return report;
}

function readVisualRegressionBaselines(root) {
  const storePath = path.join(root, BASELINE_STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return parsed && typeof parsed.baselines === "object" ? parsed.baselines : {};
  } catch {
    return {};
  }
}

function writeVisualRegressionBaselines(root, baselines) {
  const storePath = path.join(root, BASELINE_STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ baselines }, null, 2)}\n`);
}

module.exports = {
  appendVisualRegressionReport,
  buildVisualRegressionHistory,
  readVisualRegressionBaselines,
  readVisualRegressionReports,
  visualRegressionPlan,
  writeVisualRegressionBaselines,
};
