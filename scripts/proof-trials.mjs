import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendProofTrialReceipt, proofTrialsPlan } = require("../data/proof-trials");

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
    const plan = proofTrialsPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    const fullResponse = await fetch(`${baseUrl}${plan.endpoint}?detail=full`);
    if (!fullResponse.ok) throw new Error(`${plan.endpoint}?detail=full returned ${fullResponse.status}`);
    const fullReport = await fullResponse.json();
    const sampleTrials = [];
    for (const trial of report.trials.slice(0, 5)) {
      const trialResponse = await fetch(`${baseUrl}/api/proof-trials/${trial.slug}?detail=full`);
      if (!trialResponse.ok) throw new Error(`/api/proof-trials/${trial.slug} returned ${trialResponse.status}`);
      const trialReport = await trialResponse.json();
      sampleTrials.push({
        slug: trial.slug,
        passed: trialReport.result.passed,
        checks: trialReport.result.checks.length,
      });
    }
    const receipt = appendProofTrialReceipt(root, {
      id: `proof-trials-${Date.now().toString(36)}`,
      mode: "safe-live-proof-trials-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: fullReport.summary,
      sandboxFirewall: {
        mode: fullReport.sandboxFirewall.mode,
        locks: fullReport.sandboxFirewall.summary.locks,
        readOnlyLocks: fullReport.sandboxFirewall.summary.readOnlyLocks,
        blockedExternalActionSlots: fullReport.sandboxFirewall.summary.blockedExternalActionSlots,
        credentialsEnabled: fullReport.sandboxFirewall.summary.credentialsEnabled,
        externalWritesEnabled: fullReport.sandboxFirewall.summary.externalWritesEnabled,
        productionMutationsEnabled: fullReport.sandboxFirewall.summary.productionMutationsEnabled,
      },
      sampleTrials,
      checks: fullReport.checks.map((check) => ({
        id: check.id,
        passed: check.passed,
        severity: check.severity,
        detail: check.detail,
      })),
      sideEffectBoundary: plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; ${receipt.summary.totalTrials} trial(s); ${receipt.sandboxFirewall.readOnlyLocks}/${receipt.sandboxFirewall.locks} read-only lock(s); samples ${receipt.sampleTrials.filter((trial) => trial.passed).length}/${receipt.sampleTrials.length}; score ${receipt.summary.score}/100; wrote ${plan.receiptStore}`,
    );
    if (receipt.summary.failing > 0 || receipt.sampleTrials.some((trial) => !trial.passed)) process.exitCode = 1;
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
