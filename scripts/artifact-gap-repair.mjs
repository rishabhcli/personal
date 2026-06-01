import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendArtifactGapRepairReceipt, artifactGapProofRepairPlan } = require("../data/artifact-gap-proof-repair");

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
    const plan = artifactGapProofRepairPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}?refresh=1&detail=full`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    if (report.detail !== "full" || report.artifactGapRepairPayloadPolicy?.fullDetail !== true) {
      throw new Error(`${plan.endpoint}?refresh=1&detail=full returned a compact artifact-gap repair payload`);
    }
    const receipt = appendArtifactGapRepairReceipt(root, {
      id: `artifact-gap-repair-${Date.now().toString(36)}`,
      mode: "artifact-gap-proof-repair-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      checks: report.checks.map((check) => ({
        id: check.id,
        passed: check.passed,
        severity: check.severity,
        detail: check.detail,
      })),
      topRepairItems: report.repairQueue.slice(0, 6).map((item) => ({
        gapId: item.gapId,
        priority: item.priority,
        unlockScore: item.unlockScore,
        blockedAudiences: item.blockedAudiences,
        opportunityUnlockCount: item.opportunityUnlockCount,
        deRiskAdvanceCount: item.deRiskAdvanceCount,
      })),
      sideEffectBoundary: plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; ${receipt.summary.repairItems} repair item(s); ${receipt.summary.opportunityUnlocks} opportunity unlock(s); ${receipt.summary.deRiskAdvances} de-risk advance(s); audit ${receipt.summary.auditScore}/100; wrote ${plan.receiptStore}`,
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
      // Keep waiting until the temporary localhost server is reachable.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Temporary server did not become ready at ${baseUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
