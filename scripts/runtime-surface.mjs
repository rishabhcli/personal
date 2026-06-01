import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runtimeRouteManifest } = require("../data/runtime-attestation");
const {
  appendRuntimeSurfaceReceipt,
  buildRuntimeSurfaceProbes,
  buildRuntimeSurfaceReport,
  runtimeSurfacePlan,
} = require("../data/runtime-surface");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const port = await openPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), ENABLE_PRIVATE_COCKPIT: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk).trim()));
  child.stderr.on("data", (chunk) => logs.push(String(chunk).trim()));

  try {
    await waitForReady(baseUrl);
    const routeManifest = runtimeRouteManifest();
    const checks = [];
    for (const probe of buildRuntimeSurfaceProbes(routeManifest)) {
      checks.push(await checkProbe(baseUrl, probe));
    }
    const report = buildRuntimeSurfaceReport({ baseUrl, routeManifest, checks });
    appendRuntimeSurfaceReceipt(root, report);
    console.log(
      `${report.id} ${report.summary.passing}/${report.summary.total} passed; ${report.summary.privateGatePassing}/${report.groups["private-gate"]?.total || 0} private gate probe(s); wrote ${runtimeSurfacePlan(routeManifest).receiptStore}`,
    );
    if (report.summary.failing > 0) process.exitCode = 1;
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

async function checkProbe(baseUrl, probe) {
  const started = Date.now();
  try {
    const options =
      probe.method === "POST"
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(probe.body || {}),
          }
        : { method: probe.method };
    const response = await fetch(`${baseUrl}${probe.target}`, options);
    const contentType = response.headers.get("content-type") || "";
    const detail = await summarizeResponse(probe, response, contentType);
    return {
      id: probe.id,
      route: probe.route,
      target: probe.target,
      group: probe.group,
      method: probe.method,
      expectedStatus: probe.expectedStatus,
      status: response.status,
      responseOk: response.ok,
      ms: Date.now() - started,
      contentType,
      detail,
    };
  } catch (error) {
    return {
      id: probe.id,
      route: probe.route,
      target: probe.target,
      group: probe.group,
      method: probe.method,
      expectedStatus: probe.expectedStatus,
      status: "offline",
      responseOk: false,
      ms: Date.now() - started,
      contentType: "offline",
      detail: error.message,
    };
  }
}

async function summarizeResponse(probe, response, contentType) {
  if (!contentType.includes("application/json")) {
    return `${contentType.split(";")[0] || "non-json"} ${response.status}`;
  }
  try {
    const body = await response.json();
    if (body.error) return body.error;
    if (body.mode) return body.mode;
    if (Array.isArray(body.receipts)) return `${body.receipts.length} receipt(s)`;
    if (body.projects) return `${body.projects.length} project(s)`;
    if (body.output) return `terminal output ${String(body.output).split("\n").length} line(s)`;
    return `${probe.target} json`;
  } catch {
    return "json parse failed";
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
