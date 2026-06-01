import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { evidenceRefreshPlan } = require("../data/evidence-refresh");
const { runtimeRouteManifest } = require("../data/runtime-attestation");
const {
  appendRouteLatencyReceipt,
  buildRouteLatencyReport,
  readRouteLatencyReceipts,
  routeLatencyPlan,
} = require("../data/route-latency");
const packageManifest = require("../package.json");

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
    const plan = routeLatencyPlan(routeManifest);
    const routeSamples = [];
    const terminalSamples = [];

    for (const probe of plan.routeProbes) {
      routeSamples.push(await measureRouteProbe(baseUrl, probe));
    }
    for (const command of plan.terminalCommands) {
      terminalSamples.push(await measureTerminalCommand(baseUrl, command));
    }

    const report = buildRouteLatencyReport({
      baseUrl,
      routeManifest,
      refreshPlan: evidenceRefreshPlan(),
      packageManifest,
      routeSamples,
      terminalSamples,
      previousReceipts: readRouteLatencyReceipts(root),
    });
    appendRouteLatencyReceipt(root, report);
    console.log(
      `${report.id} ${report.summary.routeSamples} route sample(s), ${report.summary.terminalSamples} terminal sample(s); slow routes ${report.summary.slowRoutes}, slow terminal ${report.summary.slowTerminalCommands}; p95 route ${report.summary.routeP95Ms}ms, p95 terminal ${report.summary.terminalP95Ms}ms; wrote ${plan.receiptStore}`,
    );
    if (report.summary.failing > 0 || routeSamples.some((sample) => !sample.passed) || terminalSamples.some((sample) => !sample.passed)) {
      process.exitCode = 1;
    }
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

async function measureRouteProbe(baseUrl, probe) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${probe.target}`, fetchOptions(probe));
    const text = await response.text();
    return {
      id: probe.id,
      route: probe.route,
      target: probe.target,
      method: probe.method,
      expectedStatus: probe.expectedStatus,
      status: response.status,
      passed: response.status === probe.expectedStatus,
      ms: Date.now() - started,
      bytes: Buffer.byteLength(text),
      detail: summarizeRouteResponse(probe, response, text),
    };
  } catch (error) {
    return {
      id: probe.id,
      route: probe.route,
      target: probe.target,
      method: probe.method,
      expectedStatus: probe.expectedStatus,
      status: "offline",
      passed: false,
      ms: Date.now() - started,
      bytes: 0,
      detail: error.message,
    };
  }
}

async function measureTerminalCommand(baseUrl, command) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/terminal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    const body = await response.json();
    const output = String(body.output || "");
    return {
      command,
      status: response.status,
      passed: response.ok && output.length > 12,
      ms: Date.now() - started,
      bytes: Buffer.byteLength(output),
      detail: output.split("\n")[0] || "empty terminal output",
    };
  } catch (error) {
    return {
      command,
      status: "offline",
      passed: false,
      ms: Date.now() - started,
      bytes: 0,
      detail: error.message,
    };
  }
}

function fetchOptions(probe) {
  if (probe.method === "POST") {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(probe.body || {}),
    };
  }
  return { method: probe.method || "GET" };
}

function summarizeRouteResponse(probe, response, text) {
  const contentType = response.headers.get("content-type") || "unknown";
  if (!contentType.includes("application/json")) return `${contentType.split(";")[0]} ${response.status}`;
  try {
    const body = JSON.parse(text);
    if (body.error) return body.error;
    if (body.mode) return body.mode;
    if (body.summary?.score !== undefined) return `${body.summary.score}/100 ${probe.target}`;
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
