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
  const consoleIssues = trackConsole(page);
  await page.goto("/");

  await expect(page).toHaveTitle(/Rishabh Bansal/);
  await expect(page.locator("#command-title")).toBeVisible();
  await expect(page.locator("#project-list [data-project='qagent']")).toBeVisible();

  await page.locator("#portfolio-query").fill("agent");
  await page.locator("#search-form button").click();
  await expect(page.locator("#ranked-results")).toContainText("QAgent");
  await expect(page.locator("#ranked-results")).toContainText(/signal|Matches/i);

  await page.locator("#project-list [data-project='qagent']").click();
  await expect(page.locator("#case-study")).toContainText("QAgent");
  await expect(page.locator("#case-study")).toContainText("Evidence trail");

  await page.locator("#terminal-input").fill("open qagent");
  await page.locator("#terminal-form button").click();
  await expect(page.locator("#terminal-output")).toContainText("https://github.com/rishabhcli/QAgent");

  await page.locator("[data-graph-mode='rank']").click();
  await expect(page.locator("[data-graph-mode='rank']")).toHaveClass(/is-active/);
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
  await expect(page.locator("#project-list [data-project='qagent']")).toBeVisible();

  const hasNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(hasNoHorizontalOverflow).toBe(true);

  await page.screenshot({ path: "/tmp/personal-command-mobile.png", fullPage: false });
  expect(consoleIssues).toEqual([]);
});
