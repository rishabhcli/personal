const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const STORE_RELATIVE_PATH = path.join("var", "performance-budget-reports.json");

function performanceBudgetPlan() {
  return {
    mode: "local-performance-budget-plan",
    command: "npm run audit:performance",
    scope: "Temporary local server, key JSON endpoints, and homepage render readiness.",
    budgets: [
      { id: "api-projects", target: "/api/projects", budgetMs: 250 },
      { id: "api-graph", target: "/api/graph", budgetMs: 400 },
      { id: "api-artifacts", target: "/api/artifacts", budgetMs: 400 },
      { id: "api-maintenance", target: "/api/maintenance", budgetMs: 600 },
      { id: "api-runtime-truth", target: "/api/runtime-truth", budgetMs: 250 },
      { id: "home-load", target: "/", budgetMs: 3000 },
      { id: "guide-ready", target: "#guide-answer", budgetMs: 3500 },
    ],
    limitation:
      "Local timing budgets catch obvious regressions but do not replace production RUM, CDN timing, or low-end-device profiling.",
    reportStore: STORE_RELATIVE_PATH,
  };
}

function readPerformanceBudgetReports(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.reports) ? parsed.reports : [];
  } catch {
    return [];
  }
}

function appendPerformanceBudgetReport(root, report) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  const reports = readPerformanceBudgetReports(root);
  reports.unshift(report);
  writeFileSync(storePath, `${JSON.stringify({ reports: reports.slice(0, 50) }, null, 2)}\n`);
  return report;
}

module.exports = {
  appendPerformanceBudgetReport,
  performanceBudgetPlan,
  readPerformanceBudgetReports,
};
