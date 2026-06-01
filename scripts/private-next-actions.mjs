import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendPrivateNextActionReceipt, privateNextActionsPlan } = require("../data/private-planner");

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
    const plan = privateNextActionsPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    const receipt = appendPrivateNextActionReceipt(root, {
      id: `private-next-actions-${Date.now().toString(36)}`,
      mode: "local-private-next-action-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      actionExecutionLocks: {
        mode: report.actionExecutionLocks.mode,
        locks: report.actionExecutionLocks.summary.locks,
        manualOnlyLocks: report.actionExecutionLocks.summary.manualOnlyLocks,
        blockedExternalActionSlots: report.actionExecutionLocks.summary.blockedExternalActionSlots,
        externalWritesEnabled: report.actionExecutionLocks.summary.externalWritesEnabled,
        executableActions: report.actionExecutionLocks.summary.executableActions,
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
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; ${receipt.summary.totalActions} action(s); ${receipt.actionExecutionLocks.manualOnlyLocks}/${receipt.actionExecutionLocks.locks} execution lock(s); score ${receipt.summary.score}/100; wrote ${plan.receiptStore}`,
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
