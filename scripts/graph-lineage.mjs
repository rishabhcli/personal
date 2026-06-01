import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendGraphLineageReceipt, graphLineagePlan } = require("../data/graph-lineage");

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
    const plan = graphLineagePlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}?refresh=1&detail=full`);
    if (!response.ok) throw new Error(`${plan.endpoint} returned ${response.status}`);
    const report = await response.json();
    if (report.detail !== "full" || report.lineagePayloadPolicy?.fullDetail !== true) {
      throw new Error(`${plan.endpoint} returned a compact lineage payload; recorder requires detail=full`);
    }
    const reportLineagePaths = report.audiences.reduce(
      (sum, audience) => sum + audience.objections.reduce((inner, objection) => inner + objection.lineagePaths.length, 0),
      0,
    );
    if (reportLineagePaths !== report.summary.lineagePaths) {
      throw new Error(`${plan.endpoint} returned ${reportLineagePaths}/${report.summary.lineagePaths} lineage path(s); recorder requires full lineage`);
    }
    if (report.artifactGapRepairLineage.paths.length !== report.summary.artifactGapRepairPaths) {
      throw new Error(`${plan.endpoint} returned compact artifact-gap repair lineage; recorder requires full repair paths`);
    }
    const receipt = appendGraphLineageReceipt(root, {
      id: `graph-lineage-${Date.now().toString(36)}`,
      mode: "evidence-graph-lineage-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: report.summary,
      report,
      audienceSummaries: report.audiences.map((audience) => ({
        id: audience.id,
        objections: audience.summary.objections,
        paths: audience.summary.paths,
        unresolvedEvidence: audience.summary.unresolvedEvidence,
      })),
      checks: report.checks,
      unresolvedEvidence: report.unresolvedEvidence,
      sampleObjections: report.audiences.flatMap((audience) =>
        audience.objections.slice(0, 2).map((objection) => ({
          audience: audience.id,
          id: objection.id,
          paths: objection.lineagePaths.length,
          evidenceTargets: objection.evidenceTargets.length,
          answerabilityScore: objection.answerabilityScore,
        })),
      ),
      repairActions: report.repairActions,
      sourceBoundary: report.sourceBoundary,
      sideEffectBoundary: report.sideEffectBoundary || plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.summary.passing}/${receipt.summary.checks} check(s) passed; score ${receipt.summary.score}/100 ${receipt.summary.band}; ${receipt.summary.objections} objection(s); ${receipt.summary.graphResolvedPaths}/${receipt.summary.lineagePaths} graph path(s); ${receipt.summary.graphResolvedArtifactGapRepairPaths || 0}/${receipt.summary.artifactGapRepairPaths || 0} artifact gap repair path(s); audit ${receipt.summary.auditCoverageScore}/100; wrote ${plan.receiptStore}`,
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
