import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const { accessibilityAuditPlan, appendAccessibilityAuditReport } = require("../data/accessibility-audit");

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
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      const desktopChecks = await page.evaluate(runPageAudit);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: "networkidle" });
      const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      const checks = [
        ...desktopChecks,
        {
          id: "mobile-horizontal-overflow",
          passed: mobileOverflow,
          severity: mobileOverflow ? "info" : "high",
          detail: mobileOverflow ? "No mobile horizontal overflow detected." : "Document scroll width exceeds viewport width.",
        },
      ];
      const summary = {
        total: checks.length,
        passing: checks.filter((check) => check.passed).length,
        failing: checks.filter((check) => !check.passed).length,
      };
      const report = appendAccessibilityAuditReport(root, {
        id: `a11y-${Date.now()}`,
        mode: "scripted-accessibility-audit",
        checkedAt: new Date().toISOString(),
        baseUrl,
        scope: accessibilityAuditPlan().scope,
        limitation: accessibilityAuditPlan().limitation,
        summary,
        checks,
      });
      console.log(`${report.id} ${summary.passing}/${summary.total} passed; wrote ${accessibilityAuditPlan().reportStore}`);
    } finally {
      await browser.close();
    }
  } finally {
    child.kill();
  }
}

function runPageAudit() {
  const visibleText = (element) => (element.innerText || element.textContent || "").trim();
  const hasAccessibleName = (element) => {
    if (element.getAttribute("aria-label")) return true;
    if (element.getAttribute("aria-labelledby")) return true;
    if (element.getAttribute("title")) return true;
    if (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) return true;
    if (element.closest("label")) return true;
    if (visibleText(element)) return true;
    return false;
  };
  const checks = [];
  const title = document.title.trim();
  checks.push({
    id: "document-title",
    passed: title.length > 0,
    severity: title ? "info" : "high",
    detail: title || "Missing document title.",
  });
  const mainCount = document.querySelectorAll("main").length;
  checks.push({
    id: "main-landmark",
    passed: mainCount === 1,
    severity: mainCount === 1 ? "info" : "medium",
    detail: `${mainCount} main landmark(s) found.`,
  });
  const imagesMissingAlt = [...document.querySelectorAll("img")].filter((image) => !image.hasAttribute("alt"));
  checks.push({
    id: "image-alt-text",
    passed: imagesMissingAlt.length === 0,
    severity: imagesMissingAlt.length === 0 ? "info" : "high",
    detail: `${imagesMissingAlt.length} image(s) missing alt text.`,
  });
  const interactive = [...document.querySelectorAll("a, button, input, select, textarea")];
  const unnamed = interactive.filter((element) => !hasAccessibleName(element));
  checks.push({
    id: "interactive-accessible-names",
    passed: unnamed.length === 0,
    severity: unnamed.length === 0 ? "info" : "high",
    detail: `${unnamed.length} interactive element(s) missing accessible names.`,
  });
  const formFields = [...document.querySelectorAll("input, select, textarea")];
  const unlabeled = formFields.filter((element) => !hasAccessibleName(element));
  checks.push({
    id: "form-labels",
    passed: unlabeled.length === 0,
    severity: unlabeled.length === 0 ? "info" : "high",
    detail: `${unlabeled.length} form field(s) missing labels.`,
  });
  const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  checks.push({
    id: "unique-ids",
    passed: duplicateIds.length === 0,
    severity: duplicateIds.length === 0 ? "info" : "medium",
    detail: `${new Set(duplicateIds).size} duplicate id value(s).`,
  });
  const unlabeledCanvas = [...document.querySelectorAll("canvas")].filter((canvas) => !canvas.getAttribute("aria-label") && !canvas.getAttribute("aria-labelledby"));
  checks.push({
    id: "canvas-accessible-label",
    passed: unlabeledCanvas.length === 0,
    severity: unlabeledCanvas.length === 0 ? "info" : "medium",
    detail: `${unlabeledCanvas.length} canvas element(s) missing accessible labels.`,
  });
  return checks;
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
