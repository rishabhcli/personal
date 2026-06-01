import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendPrivateScheduleReceipt, privateSchedulePlan } = require("../data/private-schedule");

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
    const plan = privateSchedulePlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    const receipt = appendPrivateScheduleReceipt(root, {
      id: `private-schedule-${Date.now().toString(36)}`,
      mode: "local-private-chief-of-staff-schedule-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      calendarFirewall: {
        mode: report.calendarFirewall.mode,
        blockedActionSlots: report.calendarFirewall.blockedActionSlots,
        protectedReviewWindows: report.calendarFirewall.protectedReviewWindows,
        externalWriteCapability: report.calendarFirewall.externalWriteCapability,
      },
      reviewWindows: report.reviewWindows.map((window) => ({
        id: window.id,
        laneId: window.laneId,
        pressureScore: window.pressureScore,
        pressureBand: window.pressureBand,
        staleProofPressure: window.staleProofPressure,
        manualOnly: window.manualOnly,
        calendarWrite: window.calendarWrite,
        externalWrite: window.externalWrite,
        blockedExternalActions: window.blockedExternalActions.length,
        verificationCommand: window.verificationCommand,
      })),
      blocks: report.schedule.map((block) => ({
        id: block.id,
        kind: block.kind,
        laneId: block.laneId,
        minutes: block.minutes,
        calendarWrite: block.calendarWrite,
        externalWrite: block.externalWrite,
        verificationCommand: block.verificationCommand,
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
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; ${receipt.summary.blocks} block(s); ${receipt.summary.reviewWindows} review window(s); ${receipt.summary.blockedExternalWrites} blocked external write slot(s); ${receipt.summary.totalMinutes} minute(s); score ${receipt.summary.score}/100; wrote ${plan.receiptStore}`,
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
