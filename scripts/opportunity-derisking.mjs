import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendOpportunityDeRiskingReceipt, opportunityDeRiskingPlan } = require("../data/opportunity-derisking");

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
    const plan = opportunityDeRiskingPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}?refresh=1&detail=full`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    if (report.detail !== "full" || !Array.isArray(report.plans) || report.plans.length !== report.summary.plans) {
      throw new Error(`${plan.endpoint}?refresh=1&detail=full returned a compact opportunity de-risking payload`);
    }
    const receipt = appendOpportunityDeRiskingReceipt(root, {
      id: `opportunity-derisking-${Date.now().toString(36)}`,
      mode: "proof-backed-opportunity-derisking-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      plans: report.plans.map((item) => ({
        id: item.id,
        packageId: item.packageId,
        opportunityId: item.opportunityId,
        label: item.label,
        audience: item.audience,
        cachedFromReceipt: item.cachedFromReceipt,
        cachePolicy: item.cachePolicy,
        refreshEndpoint: item.refreshEndpoint,
        current: item.current,
        riskScore: item.riskScore,
        riskBand: item.riskBand,
        residualRisk: item.residualRisk,
        riskFactors: item.riskFactors,
        artifactGapPressure: item.artifactGapPressure,
        deRiskSteps: item.deRiskSteps,
        assumptionAudit: item.assumptionAudit,
        claimFirewall: item.claimFirewall,
        manualGoNoGo: item.manualGoNoGo,
        manualReviewGate: item.manualReviewGate,
        sourceTrace: item.sourceTrace,
        verificationCommand: item.verificationCommand,
        nextAction: item.nextAction,
      })),
      checks: report.checks.map((check) => ({
        id: check.id,
        passed: check.passed,
        severity: check.severity,
        detail: check.detail,
        repairAction: check.repairAction,
        verificationCommand: check.verificationCommand,
      })),
      priorityQueue: report.priorityQueue,
      artifactGapQueue: report.artifactGapQueue,
      artifactGapPolicy: report.artifactGapPolicy,
      repairActions: report.repairActions,
      sideEffectBoundary: plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; ${receipt.summary.plans} plan(s); ${receipt.summary.assumptionAudits} assumption audit item(s); ${receipt.summary.blockedExternalClaims} blocked external claim(s); ${receipt.summary.artifactGapWorkItems} artifact gap work item(s); ${receipt.summary.highPrioritySteps} high-priority step(s); score ${receipt.summary.score}/100; wrote ${plan.receiptStore}`,
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
