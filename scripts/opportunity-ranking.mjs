import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendOpportunityRankingReceipt, opportunityRankingPlan } = require("../data/opportunity-ranking");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const port = await openPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk).trim()));
  child.stderr.on("data", (chunk) => logs.push(String(chunk).trim()));

  try {
    await waitForReady(baseUrl);
    const plan = opportunityRankingPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}?refresh=1&detail=full`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    if (report.detail !== "full" || report.opportunityRankingPayloadPolicy?.fullDetail !== true) {
      throw new Error(`${plan.endpoint} returned a compact opportunity-ranking payload; recorder requires detail=full`);
    }
    if (!report.rankings.every((ranking) => ranking.rankFactors && ranking.evidenceProfile && ranking.sourceTrace?.length >= 4)) {
      throw new Error(`${plan.endpoint} returned partial ranking rows; recorder requires full ranking detail`);
    }
    const receipt = appendOpportunityRankingReceipt(root, {
      id: `opportunity-ranking-${Date.now().toString(36)}`,
      mode: "proof-backed-opportunity-ranking-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      fullDecisionLanes: report.decisionLanes,
      fullOpportunityPortfolio: report.opportunityPortfolio,
      rankings: report.rankings,
      missingProofQueue: report.missingProofQueue,
      requirementMatrix: report.requirementMatrix,
      decisionLanes: report.decisionLanes.map((lane) => ({
        id: lane.id,
        count: lane.count,
        averagePriorityScore: lane.averagePriorityScore,
        manualOnly: lane.manualOnly,
        externalWrite: lane.externalWrite,
      })),
      opportunityPortfolio: report.opportunityPortfolio.map((slot) => ({
        id: slot.id,
        count: slot.count,
        manualOnly: slot.manualOnly,
        externalWrite: slot.externalWrite,
        itemIds: slot.items.map((item) => item.id),
      })),
      topRankings: report.rankings.slice(0, 8).map((item) => ({
        id: item.id,
        rank: item.rank,
        priorityScore: item.priorityScore,
        recommendation: item.recommendation,
        estimatedEffort: item.estimatedEffort,
        expectedUpside: item.expectedUpside,
        residualRisk: item.residualRisk,
        manualUseGate: item.manualUseGate,
      })),
      checks: report.checks.map((check) => ({
        id: check.id,
        passed: check.passed,
        severity: check.severity,
        detail: check.detail,
      })),
      sideEffectBoundary: plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; ${receipt.summary.rankings} ranking(s); ${receipt.summary.portfolioSlots} portfolio slot(s); top ${receipt.summary.topOpportunityId}; score ${receipt.summary.score}/100; wrote ${plan.receiptStore}`,
    );
    if (receipt.summary.failing > 0) process.exitCode = 1;
  } finally {
    child.kill();
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
