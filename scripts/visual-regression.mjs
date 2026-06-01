import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const {
  appendVisualRegressionReport,
  readVisualRegressionBaselines,
  visualRegressionPlan,
  writeVisualRegressionBaselines,
} = require("../data/visual-regression");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const port = await openPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForReady(baseUrl);
    const plan = visualRegressionPlan();
    const baselines = readVisualRegressionBaselines(root);
    const acceptChanges = process.env.ACCEPT_VISUAL_CHANGES === "1";
    const browser = await chromium.launch();
    try {
      const checks = [];
      for (const snapshot of plan.snapshots) {
        checks.push(await captureAndCompare({ browser, baseUrl, snapshot, baselines, plan, acceptChanges }));
      }
      writeVisualRegressionBaselines(root, baselines);
      const summary = {
        total: checks.length,
        passing: checks.filter((check) => check.passed).length,
        failing: checks.filter((check) => !check.passed).length,
        baselinesCreated: checks.filter((check) => check.comparison === "baseline-created").length,
        baselinesUpdated: checks.filter((check) => check.comparison === "baseline-updated").length,
        changed: checks.filter((check) => check.comparison === "changed").length,
      };
      const report = appendVisualRegressionReport(root, {
        id: `visual-${Date.now()}`,
        mode: "local-visual-regression",
        checkedAt: new Date().toISOString(),
        baseUrl,
        limitation: plan.limitation,
        summary,
        checks,
      });
      console.log(
        `${report.id} ${summary.passing}/${summary.total} passed; ${summary.baselinesCreated} baseline(s) created; ${summary.baselinesUpdated} baseline(s) updated; ${summary.changed} changed; wrote ${plan.reportStore}`,
      );
      if (summary.failing > 0) process.exitCode = 1;
    } finally {
      await browser.close();
    }
  } finally {
    child.kill();
  }
}

async function captureAndCompare({ browser, baseUrl, snapshot, baselines, plan, acceptChanges }) {
  const page = await browser.newPage({ viewport: snapshot.viewport });
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("#guide-answer").waitFor({ state: "visible", timeout: 5000 });
    await applySnapshotAction(page, snapshot.action);
    const locator = page.locator(snapshot.selector).first();
    await locator.waitFor({ state: "visible", timeout: 5000 });
    const box = await locator.boundingBox();
    const screenshotPath = path.join(root, plan.screenshotDirectory, `${snapshot.id}.png`);
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    const image = await locator.screenshot({ animations: "disabled" });
    await writeFile(screenshotPath, image);
    const text = normalizeText(await locator.innerText().catch(() => ""));
    const current = {
      id: snapshot.id,
      label: snapshot.label,
      viewport: snapshot.viewport,
      selector: snapshot.selector,
      imageHash: sha256(image),
      textHash: sha256(Buffer.from(text)),
      byteLength: image.byteLength,
      textLength: text.length,
      width: Math.round(box?.width || 0),
      height: Math.round(box?.height || 0),
      screenshotPath: path.relative(root, screenshotPath),
    };
    const nonBlank = current.byteLength > 1000 && current.width > 20 && current.height > 20 && current.textLength > 12;
    const baseline = baselines[snapshot.id];
    if (!baseline) {
      baselines[snapshot.id] = current;
      return {
        ...current,
        comparison: "baseline-created",
        passed: nonBlank,
        detail: nonBlank ? "Created first local visual baseline." : "Screenshot or text looked blank while creating baseline.",
      };
    }
    const imageMatches = baseline.imageHash === current.imageHash;
    const textMatches = baseline.textHash === current.textHash;
    const byteDelta = Math.abs(Number(baseline.byteLength || 0) - current.byteLength);
    const byteDriftLimit = Math.max(2048, Math.round(Number(baseline.byteLength || current.byteLength) * 0.01));
    const dimensionsMatch = Number(baseline.width || 0) === current.width && Number(baseline.height || 0) === current.height;
    const minorImageDrift = !imageMatches && textMatches && dimensionsMatch && byteDelta <= byteDriftLimit;
    const passed = nonBlank && textMatches && (imageMatches || minorImageDrift);
    if (!passed && acceptChanges && nonBlank) {
      baselines[snapshot.id] = current;
      return {
        ...current,
        comparison: "baseline-updated",
        passed: true,
        baseline: {
          imageHash: baseline.imageHash,
          textHash: baseline.textHash,
          byteLength: baseline.byteLength,
        },
        detail: `Accepted intentional local visual change. Image match ${imageMatches}; text match ${textMatches}.`,
      };
    }
    return {
      ...current,
      comparison: imageMatches ? "matched" : minorImageDrift ? "minor-image-drift" : "changed",
      passed,
      baseline: {
        imageHash: baseline.imageHash,
        textHash: baseline.textHash,
        byteLength: baseline.byteLength,
      },
      detail: passed
        ? minorImageDrift
          ? `Text and dimensions match the local baseline with minor image-byte drift (${byteDelta}/${byteDriftLimit}).`
          : "Screenshot and text signature match the local baseline."
        : `Image match ${imageMatches}; text match ${textMatches}; nonblank ${nonBlank}.`,
    };
  } finally {
    await page.close();
  }
}

async function applySnapshotAction(page, action) {
  if (action === "open-qagent-case") {
    await page.locator(".project-row[data-project='qagent']").click();
    await page.locator("#case-study").getByText("QAgent").first().waitFor({ state: "visible", timeout: 5000 });
    return;
  }
  if (action === "run-packet-recruiter") {
    await page.locator("#terminal-input").fill("packet recruiter");
    await page.locator("#terminal-form").evaluate((form) => form.requestSubmit());
    await page.locator("#terminal-output").getByText("Recruiter evidence packet").waitFor({ state: "visible", timeout: 5000 });
    return;
  }
  if (action === "mobile-preview-wall") {
    await page.locator("#preview-wall img").first().waitFor({ state: "visible", timeout: 5000 });
  }
}

function normalizeText(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
