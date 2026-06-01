import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendRuntimeEvidenceChainReceipt, runtimeEvidenceChainPlan } = require("../data/runtime-evidence-chain");

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
    const plan = runtimeEvidenceChainPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}?refresh=1&detail=full`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    if (report.detail !== "full" || report.compact !== false || !Array.isArray(report.chainLinks) || !report.chainLinks.every((link) => link.verificationCommand)) {
      throw new Error(`${plan.endpoint}?refresh=1&detail=full returned a compact runtime evidence-chain payload`);
    }
    const receipt = appendRuntimeEvidenceChainReceipt(root, {
      id: `runtime-chain-${Date.now().toString(36)}`,
      mode: "runtime-evidence-chain-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      custodyPacket: report.custodyPacket,
      chainLinks: report.chainLinks.map((link) => ({
        id: link.id,
        label: link.label,
        endpoint: link.endpoint,
        score: link.score,
        band: link.band,
        receiptId: link.receiptId,
        freshness: link.freshness,
        blocking: link.blocking,
        evidence: link.evidence,
        nonClaim: link.nonClaim,
        verificationCommand: link.verificationCommand,
      })),
      parityTripwires: report.parityTripwires.map((tripwire) => ({
        id: tripwire.id,
        status: tripwire.status,
        manualReadRequired: tripwire.manualReadRequired,
        blockedClaim: tripwire.blockedClaim,
        localEvidence: tripwire.localEvidence,
        missingHostedEvidence: tripwire.missingHostedEvidence,
        replacementClaim: tripwire.replacementClaim,
        forbiddenAutomation: tripwire.forbiddenAutomation,
        verificationCommand: tripwire.verificationCommand,
      })),
      receiptMatrix: report.receiptMatrix,
      checks: report.checks.map((check) => ({
        id: check.id,
        passed: check.passed,
        severity: check.severity,
        detail: check.detail,
        repairAction: check.repairAction,
        verificationCommand: check.verificationCommand,
      })),
      repairActions: report.repairActions,
      nonClaims: report.nonClaims,
      nextAction: report.nextAction,
      verificationCommand: report.verificationCommand,
      sourceBoundary: report.sourceBoundary,
      sideEffectBoundary: report.sideEffectBoundary || plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; ${receipt.summary.chainLinks} link(s); ${receipt.summary.blockedParityClaims}/${receipt.summary.parityTripwires} parity claim(s) blocked; score ${receipt.summary.score}/100; wrote ${plan.receiptStore}`,
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
