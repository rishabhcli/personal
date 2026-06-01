import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendEvidenceRefreshReceipt, evidenceRefreshPlan } = require("../data/evidence-refresh");

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
    const checks = [];
    for (const endpoint of evidenceRefreshPlan().endpoints) {
      checks.push(await checkEndpoint(baseUrl, endpoint));
    }
    const summary = {
      total: checks.length,
      passing: checks.filter((check) => check.ok).length,
      failing: checks.filter((check) => !check.ok).length,
    };
    const receipt = appendEvidenceRefreshReceipt(root, {
      id: `refresh-${Date.now()}`,
      mode: "safe-evidence-refresh",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary,
      checks,
      sideEffectBoundary: evidenceRefreshPlan().sideEffectBoundary,
    });
    console.log(`${receipt.id} ${summary.passing}/${summary.total} passed; wrote ${evidenceRefreshPlan().receiptStore}`);
    if (summary.failing > 0) process.exitCode = 1;
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

async function checkEndpoint(baseUrl, endpoint) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${endpoint}`);
    let detail = "";
    try {
      const body = await response.json();
      detail = summarizeBody(endpoint, body);
    } catch {
      detail = "non-json response";
    }
    return {
      endpoint,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      detail,
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: "offline",
      ms: Date.now() - started,
      detail: error.message,
    };
  }
}

function summarizeBody(endpoint, body) {
  if (endpoint === "/api/projects") return `${body.projects?.length || 0} projects`;
  if (endpoint === "/api/status") return `${body.receiptSummary?.passing || 0}/${body.receiptSummary?.total || 0} status checks`;
  if (endpoint === "/api/maintenance") return `${body.summary?.issues || 0} maintenance issues`;
  if (endpoint === "/api/runtime-truth") return `${body.runtime?.environment || "unknown"} runtime`;
  if (endpoint === "/api/runtime-truth/fingerprint") return `${body.readiness?.score || 0}/100 runtime readiness`;
  if (endpoint === "/api/runtime-truth/attestation") return `${body.summary?.score || 0}/100 runtime attestation`;
  if (endpoint === "/api/runtime-surface/latest") return body.latest ? `${body.latest.summary?.score || 0}/100 runtime surface` : "runtime surface receipt missing";
  if (endpoint === "/api/route-latency") return `${body.summary?.score || 0}/100 route latency heatmap`;
  if (endpoint === "/api/runtime-boundary") return `${body.summary?.score || 0}/100 runtime boundary`;
  if (endpoint === "/api/runtime-reconciliation") return `${body.summary?.score || 0}/100 runtime reconciliation`;
  if (endpoint === "/api/runtime-diff") return `${body.summary?.score || 0}/100 runtime diff`;
  if (endpoint === "/api/runtime-explain") return `${body.summary?.score || 0}/100 runtime explanation`;
  if (endpoint === "/api/runtime-deploy-readiness") return `${body.summary?.score || 0}/100 runtime deploy readiness`;
  if (endpoint === "/api/runtime-evidence-chain") return `${body.summary?.score || 0}/100 runtime evidence chain`;
  if (endpoint === "/api/graph-scoreboard") return `${body.summary?.score || 0}/100 graph normalization`;
  if (endpoint === "/api/graph-lineage") return `${body.summary?.score || 0}/100 graph lineage`;
  if (endpoint === "/api/graph-projection-guard") return `${body.summary?.score || 0}/100 graph projection guard`;
  if (endpoint === "/api/graph-confidence") return `${body.summary?.score || 0}/100 graph confidence guard`;
  if (endpoint === "/api/graph-depth-score") return `${body.summary?.score || 0}/100 graph depth score`;
  if (endpoint === "/api/evaluation/claim-calibration") return `${body.summary?.score || 0}/100 claim calibration`;
  if (endpoint === "/api/evaluation/opportunity-quality") return `${body.summary?.score || 0}/100 opportunity quality`;
  if (endpoint === "/api/opportunity-board") return `${body.summary?.score || 0}/100 opportunity board`;
  if (endpoint === "/api/opportunity-derisking") return `${body.summary?.score || 0}/100 opportunity de-risking`;
  if (endpoint === "/api/opportunity-scorecard") return `${body.summary?.score || 0}/100 opportunity scorecard`;
  if (endpoint === "/api/evaluation/usability") return `${body.summary?.score || 0}/100 usability quality`;
  if (endpoint === "/api/design-stability") return `${body.summary?.score || 0}/100 design stability`;
  if (endpoint === "/api/keyboard-readiness") return `${body.summary?.score || 0}/100 keyboard readiness`;
  if (endpoint === "/api/design-ambition") return `${body.summary?.score || 0}/100 design ambition`;
  if (endpoint === "/api/evaluation/integrity") return `${body.summary?.score || 0}/100 evaluation integrity`;
  if (endpoint === "/api/evaluation/research-stress") return `${body.summary?.score || 0}/100 research stress`;
  if (endpoint === "/api/evaluation/research-rigor") return `${body.summary?.score || 0}/100 research rigor`;
  if (endpoint === "/api/artifacts") return `${body.counts?.artifacts || 0} artifacts`;
  if (endpoint === "/api/artifact-transcripts") return `${body.summary?.transcripts || 0} artifact transcripts`;
  if (endpoint === "/api/artifact-museum") return `${body.summary?.score || 0}/100 artifact museum`;
  if (endpoint === "/api/artifact-museum-compare") return `${body.summary?.score || 0}/100 artifact museum compare`;
  if (endpoint === "/api/artifact-replays") return `${body.summary?.score || 0}/100 artifact replays`;
  if (endpoint === "/api/intents") return `${body.paths?.length || 0} intent paths`;
  if (endpoint === "/api/narratives") return `${body.summary?.averageGroundingScore || 0}/100 narrative grounding`;
  if (endpoint === "/api/narrative-objections") return `${body.summary?.score || 0}/100 narrative objections`;
  if (endpoint === "/api/narrative-tailor") return `${body.summary?.score || 0}/100 narrative tailor`;
  if (endpoint === "/api/narrative-disclosure") return `${body.summary?.score || 0}/100 narrative disclosure`;
  if (endpoint === "/api/narrative-sequence") return `${body.summary?.score || 0}/100 narrative sequence`;
  if (endpoint === "/api/graph-disclosure-links") return `${body.summary?.score || 0}/100 graph disclosure links`;
  return body.mode || "ok";
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
