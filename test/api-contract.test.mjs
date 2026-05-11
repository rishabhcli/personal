import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

let server;
let baseUrl;

async function getOpenPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const response = await fetch(`${url}/api/projects`);
      if (response.ok) return;
    } catch {
      // Keep polling until the child process finishes booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Server did not become ready");
}

async function json(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

describe("personal command center API", () => {
  before(async () => {
    const port = await getOpenPort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ["server.js"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForServer(baseUrl);
  });

  after(() => {
    server?.kill();
  });

  it("serves the named public API surfaces", async () => {
    const projects = await json("/api/projects");
    assert.equal(projects.response.status, 200);
    assert.ok(projects.body.projects.length >= 10);
    assert.ok(projects.body.projects.some((project) => project.slug === "qagent"));
    assert.equal(projects.body.profile.email, "rishabh.rb@icloud.com");

    const graph = await json("/api/graph");
    assert.equal(graph.response.status, 200);
    assert.ok(graph.body.nodes.some((node) => node.id === "qagent"));
    assert.ok(graph.body.edges.some((edge) => edge.source === "rishabh"));
  });

  it("returns explained search and guide results for agent/recruiter intents", async () => {
    const search = await json("/api/search?q=agent");
    assert.equal(search.response.status, 200);
    assert.ok(search.body.results.length > 0);
    assert.ok(search.body.results.some((project) => project.slug === "qagent"));
    assert.match(search.body.results[0].explanation, /signal|Matches/i);

    const guide = await json("/api/guide?q=recruiter");
    assert.equal(guide.response.status, 200);
    assert.match(guide.body.answer, /strongest match|AnchorMesh|QAgent/i);
    assert.ok(guide.body.results.length >= 4);
  });

  it("generates a structured QAgent case study and SVG artifact", async () => {
    const caseStudy = await json("/api/case-study/qagent");
    assert.equal(caseStudy.response.status, 200);
    assert.equal(caseStudy.body.slug, "qagent");
    assert.ok(caseStudy.body.sections.some((section) => section.title === "Evidence trail"));
    assert.ok(caseStudy.body.sections.some((section) => section.title === "Best audience"));

    const svg = await fetch(`${baseUrl}/api/og/qagent.svg`);
    assert.equal(svg.status, 200);
    assert.match(svg.headers.get("content-type"), /image\/svg\+xml/);
    assert.match(await svg.text(), /QAgent/);
  });

  it("runs terminal commands required by the plan", async () => {
    for (const command of ["proof", "projects", "open qagent", "why qagent", "stack qagent", "compare qagent flowpr", "fit recruiter"]) {
      const result = await json("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      assert.equal(result.response.status, 200);
      assert.equal(result.body.command, command);
      assert.ok(result.body.output.length > 12);
    }
  });

  it("reports internal, domain, and demo status checks", async () => {
    const status = await json("/api/status");
    assert.equal(status.response.status, 200);
    assert.match(status.body.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(status.body.checks.some((check) => check.label === "Home page"));
    assert.ok(status.body.checks.some((check) => check.role === "repo graph"));
    assert.ok(status.body.checks.some((check) => check.role === "live project demo"));
  });

  it("rejects invalid JSON and path traversal attempts", async () => {
    const invalid = await fetch(`${baseUrl}/api/terminal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    assert.equal(invalid.status, 400);

    const traversal = await fetch(`${baseUrl}/%2e%2e/server.js`);
    assert.equal(traversal.status, 404);
  });
});
