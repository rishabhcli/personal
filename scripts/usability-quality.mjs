import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendUsabilityQualityReceipt, usabilityQualityPlan } = require("../data/usability-quality");

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
    const plan = usabilityQualityPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}?refresh=1&detail=full`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    const receipt = appendUsabilityQualityReceipt(root, {
      id: `usability-quality-${Date.now().toString(36)}`,
      mode: "command-center-usability-quality-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      methodology: report.methodology,
      dimensions: report.dimensions,
      controlBenchmarks: report.controlBenchmarks,
      topRisks: report.topRisks,
      recommendations: report.recommendations,
      limitations: report.limitations,
      verificationCommand: report.verificationCommand,
      sourceBoundary: report.sourceBoundary,
      sideEffectBoundary: plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.summary.passingControls}/${receipt.summary.controlBenchmarks} control benchmark(s) passed; ${receipt.summary.dimensions} dimension(s); score ${receipt.summary.score}/100 ${receipt.summary.band}; wrote ${plan.receiptStore}`,
    );
    if (receipt.summary.failingControls > 0) process.exitCode = 1;
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
