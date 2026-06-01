import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendRuntimeExplainReceipt, runtimeExplainPlan } = require("../data/runtime-explain");

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
    const plan = runtimeExplainPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}?refresh=1&detail=full`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    if (report.detail !== "full" || report.compact !== false || !Array.isArray(report.proofClaims) || !report.proofClaims.every((claim) => claim.verificationCommand)) {
      throw new Error(`${plan.endpoint}?refresh=1&detail=full returned a compact runtime explanation payload`);
    }
    const receipt = appendRuntimeExplainReceipt(root, {
      id: `runtime-explain-${Date.now().toString(36)}`,
      mode: "runtime-truth-explanation-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      report,
      plan: report.plan || plan,
      quickRead: report.quickRead,
      identityExplanation: report.identityExplanation,
      receiptExplanations: report.receiptExplanations,
      routeExplanation: report.routeExplanation,
      boundaryExplanation: report.boundaryExplanation,
      claimFirewall: report.claimFirewall,
      auditLadder: report.auditLadder,
      proofClaims: report.proofClaims,
      checks: report.checks,
      nonClaims: report.nonClaims,
      repairActions: report.repairActions,
      sourceBoundary: report.sourceBoundary,
      sideEffectBoundary: report.sideEffectBoundary || plan.sideEffectBoundary,
      nextAction: report.nextAction,
      verificationCommand: report.verificationCommand,
      generatedAt: report.generatedAt,
    });
    console.log(
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; ${receipt.summary.proofClaims} proof claim(s); ${receipt.summary.claimFirewallBlockedClaims} blocked claim(s); ${receipt.summary.auditLadderSteps} audit step(s); score ${receipt.summary.score}/100; wrote ${plan.receiptStore}`,
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
