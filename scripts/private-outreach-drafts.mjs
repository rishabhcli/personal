import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendOutreachDraftReceipt, outreachDraftPlan } = require("../data/outreach-drafts");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const port = await openPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, ENABLE_PRIVATE_COCKPIT: "1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk).trim()));
  child.stderr.on("data", (chunk) => logs.push(String(chunk).trim()));

  try {
    await waitForReady(baseUrl);
    const plan = outreachDraftPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    const receipt = appendOutreachDraftReceipt(root, {
      id: `private-outreach-${Date.now().toString(36)}`,
      mode: "local-private-outreach-drafts-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      counts: report.counts,
      sendPrevention: {
        mode: report.sendPrevention.mode,
        gates: report.sendPrevention.summary.gates,
        manualOnlyGates: report.sendPrevention.summary.manualOnlyGates,
        blockedExternalActionSlots: report.sendPrevention.summary.blockedExternalActionSlots,
        sendableDrafts: report.sendPrevention.summary.sendableDrafts,
        externalWritesEnabled: report.sendPrevention.summary.externalWritesEnabled,
      },
      checks: report.checks.map((check) => ({
        id: check.id,
        passed: check.passed,
        severity: check.severity,
        detail: check.detail,
      })),
      sideEffectBoundary: plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.counts.passing}/${receipt.counts.checks} check(s) passed; ${receipt.counts.drafts} draft(s); ${receipt.sendPrevention.manualOnlyGates}/${receipt.sendPrevention.gates} send gate(s); sendable ${receipt.sendPrevention.sendableDrafts}; score ${receipt.counts.score}/100; wrote ${plan.receiptStore}`,
    );
    if (receipt.counts.failing > 0) process.exitCode = 1;
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
      // Keep waiting until the temporary private localhost server is reachable.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Temporary server did not become ready at ${baseUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
