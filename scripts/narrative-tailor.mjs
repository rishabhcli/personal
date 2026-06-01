import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendNarrativeTailorReceipt, narrativeTailorPlan } = require("../data/narrative-tailor");

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
    const plan = narrativeTailorPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}?refresh=1&detail=full`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    if (report.detail !== "full" || report.narrativeTailorPayloadPolicy?.fullDetail !== true) {
      throw new Error(`${plan.endpoint}?refresh=1&detail=full returned a compact narrative-tailor payload`);
    }
    const receipt = appendNarrativeTailorReceipt(root, {
      id: `narrative-tailor-${Date.now().toString(36)}`,
      mode: "evidence-backed-narrative-tailor-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      audiences: report.audiences.map((audience) => ({
        id: audience.id,
        label: audience.label,
        audience: audience.audience,
        cachedFromReceipt: audience.cachedFromReceipt,
        cachePolicy: audience.cachePolicy,
        refreshEndpoint: audience.refreshEndpoint,
        decisionQuestion: audience.decisionQuestion,
        score: audience.score,
        band: audience.band,
        groundingScore: audience.groundingScore,
        confidenceBand: audience.confidenceBand,
        answerabilityScore: audience.answerabilityScore,
        leadFrame: audience.leadFrame,
        avoid: audience.avoid,
        variants: audience.variants,
        manualReadinessGate: audience.manualReadinessGate,
        checks: audience.checks,
        weakestVariant: audience.weakestVariant,
        nextAction: audience.nextAction,
      })),
      checks: report.checks.map((check) => ({
        id: check.id,
        label: check.label,
        passed: check.passed,
        severity: check.severity,
        detail: check.detail,
        verificationCommand: check.verificationCommand,
      })),
      methodology: report.methodology,
      repairQueue: report.repairQueue,
      limitations: report.limitations,
      nextAction: report.nextAction,
      sideEffectBoundary: plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; ${receipt.summary.variants} variant(s); score ${receipt.summary.score}/100; wrote ${plan.receiptStore}`,
    );
    if (receipt.summary.highRiskFailures > 0) process.exitCode = 1;
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
