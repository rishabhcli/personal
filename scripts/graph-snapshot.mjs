import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appendGraphSnapshotReceipt, graphSnapshotPlan } = require("../data/graph-snapshot");

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
    const plan = graphSnapshotPlan();
    const response = await fetch(`${baseUrl}${plan.endpoint}?refresh=1&detail=full`);
    if (!response.ok) throw new Error(`${plan.endpoint}?refresh=1 returned ${response.status}`);
    const graph = await response.json();
    const receipt = appendGraphSnapshotReceipt(root, {
      id: `graph-snapshot-${Date.now().toString(36)}`,
      mode: "public-evidence-graph-snapshot-receipt",
      checkedAt: new Date().toISOString(),
      baseUrl,
      summary: graph.summary,
      graph,
      sourceBoundary: graph.sourceBoundary,
      sideEffectBoundary: graph.sideEffectBoundary || plan.sideEffectBoundary,
    });
    console.log(
      `${receipt.id} ${receipt.summary.nodes} node(s), ${receipt.summary.edges} edge(s), ${receipt.summary.nodeTypes} node type(s), ${receipt.summary.edgeRelations} relation(s); wrote ${plan.receiptStore}`,
    );
    if (!receipt.summary.publicSafeShape) process.exitCode = 1;
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
