import { expect, test } from "@playwright/test";

function trackConsole(page) {
  const issues = [];
  page.on("console", (message) => {
    if (message.type() === "error") issues.push(message.text());
  });
  page.on("pageerror", (error) => issues.push(error.message));
  return issues;
}

async function expectCanvasNonBlank(page) {
  const nonBlankPixels = await page.locator("#constellation-canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return 0;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let nonBlank = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 0 && (pixels[index] > 0 || pixels[index + 1] > 0 || pixels[index + 2] > 0)) {
        nonBlank += 1;
      }
    }
    return nonBlank;
  });
  expect(nonBlankPixels).toBeGreaterThan(1000);
}

test("desktop command center supports search, case study, terminal, status, and graph controls", async ({ page }) => {
  test.setTimeout(60_000);
  const consoleIssues = trackConsole(page);
  await page.goto("/");

  await expect(page).toHaveTitle(/Rishabh Bansal/);
  await expect(page.locator("#command-title")).toBeVisible();
  await expect(page.locator(".command-jump")).toContainText("Graph");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link[href='#command-search']")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#command-search")).toBeInViewport();
  await expect(page.locator(".skip-link[href='#command-ledger']")).toHaveCount(1);
  await expect(page.locator(".skip-link[href='#command-graph']")).toHaveCount(1);

  await page.goto("/");
  await expect(page.locator("#command-title")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link[href='#command-ledger']")).toBeFocused();
  await page.locator(".skip-link[href='#command-ledger']").press("Enter");
  await expect(page).toHaveURL(/#command-ledger$/);
  await expect(page.locator("#command-ledger")).toBeInViewport();

  await page.goto("/");
  await expect(page.locator("#command-title")).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link[href='#command-graph']")).toBeFocused();
  await page.locator(".skip-link[href='#command-graph']").press("Enter");
  await expect(page).toHaveURL(/#command-graph$/);
  await expect(page.locator("#command-graph")).toBeInViewport();
  await page.keyboard.press("Slash");
  await expect(page.locator("#portfolio-query")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backquote");
  await expect(page.locator("#terminal-input")).toBeFocused();
  await expect(page.locator("#project-list [data-project='qagent']")).toBeVisible();
  await expect(page.locator("#trust-metrics")).toContainText("Claims");
  await expect(page.locator("#trust-list")).toContainText(/link-backed|source-backed/i);
  await expect(page.locator("#graph-fallback")).toContainText("Claims");
  await expect(page.locator("#graph-fallback")).toContainText("Proof repairs");
  await expect(page.locator("#graph-fallback")).toContainText("proof repair paths");
  await expect(page.locator("#graph-fallback")).toContainText("Opportunities");
  await expect(page.locator("#guide-answer")).toContainText("Recruiter proof path");
  await expect(page.locator("#guide-answer")).toContainText("CTA");
  await expect(page.locator("#proof-ribbon")).toContainText("claims");
  await expect(page.locator("#proof-ribbon")).toContainText("blockade", { timeout: 5_000 });
  await expect(page.locator("#proof-ribbon")).toContainText("runtime");
  await expect(page.locator("#proof-ribbon [data-proof-command='trust-blockade']")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#proof-ribbon [data-proof-command='runtime-chain']")).toBeVisible();
  await page.locator("#proof-ribbon [data-proof-command='runtime-chain']").click();
  await expect(page.locator("#terminal-output")).toContainText("runtime-chain");
  await expect(page.locator("#truth-ledger")).toContainText("Runtime reconciliation");
  await expect(page.locator("#truth-ledger")).toContainText("Trust blockade", { timeout: 5_000 });
  await expect(page.locator("#truth-ledger")).toContainText("Opportunity gates");
  await expect(page.locator("#truth-ledger")).toContainText("missing proof");
  await expect(page.locator("#artifact-summary")).toContainText("13 of 13 artifacts");
  await page.locator("#artifact-type-filter").selectOption("repo");
  await expect(page.locator("#artifact-summary")).toContainText("Repo");
  await expect(page.locator("#preview-wall")).toContainText("QAgent");
  await expect(page.locator("#preview-wall")).toContainText("source trace");
  await expect(page.locator("#preview-wall")).toContainText("case-study replay");
  await page.locator("#artifact-proof-filter").selectOption("link-backed");
  await expect(page.locator("#artifact-summary")).toContainText("Link-backed");
  await page.locator("#artifact-privacy-filter").selectOption("private");
  await expect(page.locator("#artifact-summary")).toContainText("Public-safe private");
  await page.locator("#reset-artifact-filters").click();
  await expect(page.locator("#artifact-summary")).toContainText("All signals");

  await page.locator("#portfolio-query").fill("agent");
  await page.locator("#search-form button").click();
  await expect(page.locator("#ranked-results")).toContainText("QAgent");
  await expect(page.locator("#ranked-results")).toContainText(/signal|Matches/i);

  await page.locator("#project-list [data-project='qagent']").click();
  await expect(page.locator("#project-list [data-project='qagent']")).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#case-study")).toContainText("QAgent");
  await expect(page.locator("#case-study")).toContainText("Evidence trail");
  await page.locator("#project-list [data-project='qagent']").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#project-list [data-project='flowpr']")).toBeFocused();
  await expect(page.locator("#case-study")).toContainText("FlowPR");

  await page.locator("#terminal-input").fill("open qagent");
  await page.locator("#terminal-form button").click();
  await expect(page.locator("#terminal-output")).toContainText("https://github.com/rishabhcli/QAgent");
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='runtime-attestation']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='runtime-surface']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='runtime-chain']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='runtime-reconciliation']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='research-stress']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='research-rigor']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='narrative-grounding']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='narrative-sequence']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='narrative-tailor']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='narrative-disclosure']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='graph-disclosures']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='graph-confidence']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='graph-depth']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='trust-blockade']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='claim-calibration']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='graph-guard']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='artifact-replays']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='artifact-gap-repair']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='artifact-museum-compare']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='opportunity-board']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='opportunity-derisking']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='opportunity-ranking']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='runtime-explain']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='runtime-deploy']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='keyboard-readiness']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='keyboard-readiness']")).toHaveAttribute("aria-label", /Run keyboard-readiness/);
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='design-stability']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='design-ambition']")).toBeVisible();
  await expect(page.locator("#terminal-shortcuts [data-terminal-command='evaluation-integrity']")).toBeVisible();
  await page.locator("#truth-ledger [data-ledger-command='runtime-reconciliation']").click();
  await expect(page.locator("#terminal-output")).toContainText("runtime-truth-reconciliation");
  await expect(page.locator("#terminal-input")).toHaveValue("runtime-reconciliation");

  await page.locator("[data-graph-mode='rank']").click();
  await expect(page.locator("[data-graph-mode='rank']")).toHaveClass(/is-active/);
  await expect(page.locator("[data-graph-mode='rank']")).toHaveAttribute("aria-pressed", "true");
  await page.locator(".command-jump a[href='#command-graph']").click();
  await expect(page.locator("#command-graph")).toBeInViewport();
  await page.locator("#graph-fallback [data-graph-type='opportunity']").first().click();
  await expect(page.locator("#graph-node-copy")).toContainText(/Opportunity route/);
  await page.locator("#graph-fallback [data-graph-type='artifact-gap-repair']").first().click();
  await expect(page.locator("#graph-node-copy")).toContainText("Proof-media repair plan");
  await expect(page.locator("#graph-fallback [data-graph-relation='unblocks-opportunity-proof']").first()).toBeVisible();
  await expectCanvasNonBlank(page);

  await page.locator("#refresh-status").click();
  await expect(page.locator("#status-list")).toContainText("Home page");

  await page.screenshot({ path: "/tmp/personal-command-desktop.png", fullPage: false });
  expect(consoleIssues).toEqual([]);
});

test("mobile command center renders without horizontal overflow", async ({ page }) => {
  const consoleIssues = trackConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator(".hero-name")).toContainText("Rishabh");
  await expect(page.locator("#command-title")).toBeVisible();
  await expect(page.locator("#proof-ribbon")).toContainText("runtime");
  await expect(page.locator("#proof-ribbon [data-proof-command='trust-blockade']")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#proof-ribbon [data-proof-command='opportunity-scorecard']")).toBeVisible();
  await expect(page.locator("#truth-ledger")).toContainText("Runtime reconciliation");
  await expect(page.locator("#project-list [data-project='qagent']")).toBeVisible();

  const hasNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(hasNoHorizontalOverflow).toBe(true);

  await page.screenshot({ path: "/tmp/personal-command-mobile.png", fullPage: false });
  expect(consoleIssues).toEqual([]);
});
