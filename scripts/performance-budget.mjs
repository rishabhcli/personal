import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const { appendPerformanceBudgetReport, performanceBudgetPlan } = require("../data/performance-budget");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const port = await openPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForReady(baseUrl);
    const plan = performanceBudgetPlan();
    const endpointBudgets = plan.budgets.filter((budget) => budget.target.startsWith("/api/"));
    const checks = [];
    for (const budget of endpointBudgets) {
      checks.push(await endpointCheck(baseUrl, budget));
    }
    checks.push(...(await browserChecks(baseUrl, plan.budgets)));
    const summary = {
      total: checks.length,
      passing: checks.filter((check) => check.passed).length,
      failing: checks.filter((check) => !check.passed).length,
      slowestMs: Math.max(...checks.map((check) => check.ms)),
    };
    const report = appendPerformanceBudgetReport(root, {
      id: `perf-${Date.now()}`,
      mode: "local-performance-budget",
      checkedAt: new Date().toISOString(),
      baseUrl,
      limitation: plan.limitation,
      summary,
      checks,
    });
    console.log(`${report.id} ${summary.passing}/${summary.total} passed; slowest ${summary.slowestMs}ms; wrote ${plan.reportStore}`);
    if (summary.failing > 0) process.exitCode = 1;
  } finally {
    child.kill();
  }
}

async function endpointCheck(baseUrl, budget) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${budget.target}`);
    await response.arrayBuffer();
    const ms = Date.now() - started;
    return {
      id: budget.id,
      target: budget.target,
      budgetMs: budget.budgetMs,
      ms,
      passed: response.ok && ms <= budget.budgetMs,
      status: response.status,
    };
  } catch (error) {
    return {
      id: budget.id,
      target: budget.target,
      budgetMs: budget.budgetMs,
      ms: Date.now() - started,
      passed: false,
      status: "offline",
      detail: error.message,
    };
  }
}

async function browserChecks(baseUrl, budgets) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const homeBudget = budgets.find((budget) => budget.id === "home-load");
    const guideBudget = budgets.find((budget) => budget.id === "guide-ready");
    const loadStarted = Date.now();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const homeMs = Date.now() - loadStarted;
    const guideStarted = Date.now();
    await page.locator("#guide-answer").waitFor({ state: "visible", timeout: guideBudget.budgetMs });
    const guideMs = Date.now() - guideStarted;
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return {
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadEventMs: Math.round(nav.loadEventEnd),
        transferSize: nav.transferSize || 0,
      };
    });
    return [
      {
        id: homeBudget.id,
        target: homeBudget.target,
        budgetMs: homeBudget.budgetMs,
        ms: homeMs,
        passed: homeMs <= homeBudget.budgetMs,
        timing,
      },
      {
        id: guideBudget.id,
        target: guideBudget.target,
        budgetMs: guideBudget.budgetMs,
        ms: guideMs,
        passed: guideMs <= guideBudget.budgetMs,
      },
    ];
  } finally {
    await browser.close();
  }
}

function openPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForReady(baseUrl) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const response = await fetch(`${baseUrl}/api/projects`);
      if (response.ok) return;
    } catch {
      // Keep waiting until the temporary local server is reachable.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Temporary server did not become ready at ${baseUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
