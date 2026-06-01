import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendNarrativeDisclosureReceipt, narrativeDisclosurePlan } = require("../data/narrative-disclosure");

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
    const plan = narrativeDisclosurePlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}?refresh=1&detail=full`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    const receipt = appendNarrativeDisclosureReceipt(root, {
      id: `narrative-disclosure-${Date.now().toString(36)}`,
      mode: "evidence-narrative-disclosure-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      bundles: report.bundles.map((bundle) => ({
        id: bundle.id,
        label: bundle.label,
        audience: bundle.audience,
        cachedFromReceipt: bundle.cachedFromReceipt,
        cachePolicy: bundle.cachePolicy,
        refreshEndpoint: bundle.refreshEndpoint,
        score: bundle.score,
        band: bundle.band,
        riskLevel: bundle.riskLevel,
        thesis: bundle.thesis,
        safeUse: bundle.safeUse,
        evidenceGrounding: bundle.evidenceGrounding,
        objectionCoverage: bundle.objectionCoverage,
        tailoredOutput: bundle.tailoredOutput,
        mustDisclose: bundle.mustDisclose,
        repairGuidance: bundle.repairGuidance,
        prohibitedOverclaims: bundle.prohibitedOverclaims,
        checks: bundle.checks,
        verificationCommand: bundle.verificationCommand,
      })),
      checks: report.checks.map((check) => ({
        id: check.id,
        passed: check.passed,
        severity: check.severity,
        detail: check.detail,
        repairAction: check.repairAction,
        verificationCommand: check.verificationCommand,
      })),
      disclosureQueue: report.disclosureQueue,
      repairActions: report.repairActions,
      nonClaims: report.nonClaims,
      sideEffectBoundary: plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; ${receipt.summary.audiences} audience(s); score ${receipt.summary.score}/100; wrote ${plan.receiptStore}`,
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
