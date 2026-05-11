# Ultra Mega Codex Prompt For `personal`

Paste this whole prompt into Codex from the repository root:

```text
/goal Transform this repo into the most advanced self-verifying personal command center on the web: a living, evidence-backed, recruiter-grade, agent-native portfolio for Rishabh Bansal that proves his work through interactive systems, public artifacts, runtime checks, project graphs, case studies, and end-to-end verified experiences.

You are working in `/Users/m3-max/Documents/GitHub/personal`.

You have full execution permission. Do not ask before editing files, installing missing local dev tools, starting servers, opening browsers, running tests, or iterating. The only acceptable reason to stop is that the current wave of work is actually implemented, verified, documented, and there is a clear final report with commands, evidence, and remaining limits.

This is not a normal portfolio polish task. Treat the target as intentionally absurd: build the personal site a world-class engineer, designer, growth lead, data engineer, QA engineer, security engineer, and recruiting strategist would normally need years to create together. The north star is a living professional command center that can answer: "What has Rishabh actually built, why does it matter, can I trust it, and what should I do next?"

Do not make a fake marketing shell. The work must be grounded in the real application that exists here:

- Static portfolio surface in `index.html` and `styles.css`.
- Tiny progressive enhancement layer in `main.js`.
- Node server in `server.js`.
- Data-backed project index, guide, graph, case study, terminal, status, and generated SVG preview endpoints.
- Three.js command-center runtime in `command-center.mjs`.
- Inline bundling flow in `scripts/embed-runtime.mjs`.
- Existing checks in `package.json`: `npm run check`, `npm run build:inline`, `npm start`.

Your job is to make the app much larger in capability and much more trustworthy, while preserving what already works.

## Prime Directive

Ship a major, real, end-to-end improvement. Do not stop at planning. Do not only create docs. Do not only redesign the hero. Do not hide unsupported features behind beautiful copy. Every visible promise must either work or be removed.

The final result should feel like:

1. A premium personal command center.
2. A recruiter and collaborator decision engine.
3. A searchable, ranked proof graph of Rishabh's projects, domains, skills, outcomes, links, and evidence.
4. A live status and artifact system that can verify domains, demos, project links, and key pages.
5. A case-study engine that creates deep, useful, visitor-facing narratives for each major project.
6. An interactive Three.js knowledge constellation that is not decorative only; it must help exploration.
7. A command palette or terminal that feels genuinely useful.
8. A test-hardened app with API, UI, visual, accessibility, responsive, and runtime verification.
9. A maintainable codebase that can keep expanding without becoming sludge.

## Absolute Constraints

- Work directly in this repo. Keep the implementation consistent with the existing lightweight Node/static architecture unless you can prove a framework migration is necessary.
- Prefer small, well-named modules over making `server.js`, `command-center.mjs`, or `styles.css` infinitely larger.
- Do not remove real existing content unless you replace it with something stronger and equally truthful.
- Do not invent awards, projects, links, claims, dates, publications, patents, schools, metrics, or affiliations.
- If a claim cannot be verified from local files or an existing source already present in the repo, label it as visitor-facing copy only if it is already present, or move it into a "needs verification" internal file.
- Do not add analytics that leaks visitor identity. If analytics are added, make them local-first, privacy-preserving, and optional.
- Do not create download affordances for private materials.
- Avoid decorative bloat. Every interactive element must help a visitor understand proof, capability, timeline, fit, or contact intent.
- Preserve accessibility, keyboard navigation, reduced-motion support, readable contrast, and responsive layout.
- Do not trap yourself in a literal infinite loop. Instead, run a relentless bounded improvement loop: each cycle must ship code, tests, or verified cleanup. Continue cycling until all gates pass and there are no high-impact, low-risk improvements left for the current run.

## Self-Improvement Loop

Repeat this loop. Do not stop after one pass.

1. Inspect
   - Read the current app shape, routes, data, and UI.
   - Identify what is real, what is fake, what is duplicated, what is brittle, and what is missing.
   - Record the top opportunities in a short internal checklist.

2. Design
   - Choose one ambitious wave that can be finished now.
   - Define what files will change and what tests will prove it.
   - Keep the wave coherent: data model, UI, API, tests, and docs should line up.

3. Build
   - Implement the wave fully.
   - Add or refine modules, endpoints, UI components, data structures, tests, and scripts as needed.
   - Install missing tools when they materially improve verification.

4. Verify
   - Run syntax checks.
   - Run unit or contract tests.
   - Start the app locally.
   - Hit API endpoints with HTTP checks.
   - Use browser automation for desktop and mobile.
   - Capture screenshots where layout, canvas, or interactivity matters.
   - Confirm the Three.js canvas is nonblank and interactive.
   - Confirm no console errors in the main flows.

5. Critique
   - Review the result like a skeptical recruiter, a designer, a QA engineer, and a future maintainer.
   - If there is a serious gap, immediately start another cycle.
   - If tests fail, fix and rerun.
   - If UI looks cramped, fake, broken, generic, or over-designed, refine and retest.

6. Escalate
   - Once a wave passes, generate the next best wave from evidence.
   - Prioritize improvements that compound: data integrity, interaction depth, test coverage, performance, accessibility, proof quality, maintainability, and deployment confidence.

Stop only when:

- The app is meaningfully better than when you started.
- All changed surfaces are tested.
- Every expected local gate passes or has a precise, honest blocker.
- You have produced a final report with file changes, commands, screenshots or browser proof, and next waves.

## Suggested Multi-Year-Level Vision

Use these as north-star directions. You are not required to finish every one, but you should keep iterating into as many as can be truly shipped in the current run.

### 1. Evidence Graph Core

Create a normalized project evidence model:

- Projects.
- Outcomes.
- Awards.
- Collaborators.
- Links.
- Repos.
- Live demos.
- Media.
- Claims.
- Proof items.
- Verification status.
- Search tokens.
- Timeline entries.
- Skills and domains.
- Visitor intent fit: recruiter, founder, engineer, researcher, admissions, collaborator.

The graph should power the APIs, UI, search, case studies, terminal, and visual constellation from one source of truth.

### 2. Case Study Engine

Turn each major project into a deep case study with:

- Problem.
- Stakes.
- Constraints.
- Architecture.
- Build process.
- Technical risks.
- What Rishabh personally contributed.
- Evidence.
- Outcome.
- What changed after shipping.
- Links and privacy-safe artifacts.
- Skills demonstrated.
- Best audience for this project.

Case studies should be generated from structured data, not copied manually in five unrelated places.

### 3. Recruiter Decision Mode

Build a visitor mode that answers:

- "Why should I interview him?"
- "Which projects prove agent systems?"
- "Which projects prove production maturity?"
- "Which projects prove hardware/research?"
- "Which projects prove public-interest software?"
- "What should I read first if I only have 90 seconds?"
- "What should I read if I have 10 minutes?"

This can be a guide panel, command palette, terminal command, route, or API-backed section. It must be useful, not gimmicky.

### 4. Agent-Native Command Center

Make the terminal or command palette genuinely capable:

- `help`
- `whoami`
- `projects`
- `proof`
- `contact`
- `open <slug>`
- `why <slug>`
- `stack <slug>`
- `compare <slug-a> <slug-b>`
- `timeline`
- `fit recruiter`
- `fit agent-infra`
- `fit civic-tech`
- `status`
- `random`

Commands should be keyboard-friendly, documented in the UI through affordances, and tested through API or browser flows.

### 5. Live Verification System

Strengthen `/api/status` beyond simple domain checks:

- Check configured domains.
- Check important live demos where allowed.
- Check repo links.
- Check internal routes and APIs.
- Return status, latency, last checked time, and useful labels.
- Avoid hammering third-party services.
- Add graceful timeout and clear degraded states.
- Surface status in UI without making the site feel broken if one external service is down.

### 6. Visual Proof Wall

Replace generic preview tiles with a stronger artifact wall:

- Generated SVG previews are acceptable if they convey real project facts.
- Prefer real screenshots or media only when local assets exist or can be safely added.
- Add filtering by domain, audience, year, and proof strength.
- Avoid a card dump. Make the wall scannable and premium.

### 7. Three.js Constellation That Matters

Upgrade the constellation from a pretty orbit into an information surface:

- Node categories: projects, skills, outcomes, domains, collaborators, timelines.
- Hover or focus readouts.
- Click to open a case study.
- Keyboard fallback.
- Motion reduction.
- Canvas pixel test to prove it renders.
- Mobile fallback that is not broken.

### 8. Search And Ranking

Make search explain itself:

- Search by project name, skill, domain, outcome, technology, audience, or proof.
- Return ranked results with explanation snippets.
- Use SQLite FTS when available and deterministic JS fallback when not.
- Add tests for known queries such as `agent`, `hardware`, `civic`, `browser`, `research`, `production`, `mobile`, `privacy`, and `recruiter`.

### 9. Timeline And Narrative

Build a chronological story:

- 2024 production work.
- 2025 AnchorMesh, SmartCane, research, patent path.
- 2026 QAgent, FlowPR, FairValue, MasterBuild, RePro, ImmiFile, ReFind, Admitly, tools.
- UIUC transition.

The timeline should clarify momentum without making the page read like a resume dump.

### 10. Contact And Conversion

Improve contact without spamminess:

- Email remains primary.
- LinkedIn and GitHub stay visible.
- Add intent-specific contact CTAs if useful.
- Ensure mailto works.
- Keep copy direct and confident.

### 11. Accessibility And Performance

Target:

- Keyboard navigation across nav, project list, case study, terminal, filters, and graph controls.
- No inaccessible icon-only controls without labels.
- Reduced-motion mode.
- No horizontal overflow at 320px.
- No text collisions at mobile, tablet, desktop, or wide desktop.
- Fast startup.
- Good cache headers for static/vendor assets.
- No console errors.
- No layout jumps caused by dynamic content.

### 12. Security And Privacy

Harden:

- Path traversal defenses in static serving.
- JSON parsing errors.
- Request body limits.
- External fetch timeouts.
- Output escaping.
- CSP or security headers where feasible without breaking inline build.
- Clear separation between public visitor data and internal notes.

### 13. Testing Infrastructure

Add the minimum durable testing stack necessary. Prefer:

- Node built-in test runner for data/API logic.
- Playwright for browser E2E and visual/runtime checks.
- Lightweight accessibility checks if practical.
- Deterministic fixtures.
- Scripts in `package.json` such as:
  - `npm run check`
  - `npm run test`
  - `npm run test:e2e`
  - `npm run verify`
  - `npm run build:inline`

If Playwright or another tool is missing, install it. Do not stop at "tool missing."

## Required Verification Gates

Before the final answer, run as many of these as apply. If one cannot run, explain the exact blocker and what you did instead.

1. `npm install` if dependencies changed or missing.
2. `npm run check`.
3. `npm run build:inline`.
4. `npm run test` if added or present.
5. `npm run test:e2e` if added or present.
6. Start the app with `npm start` on an open port.
7. HTTP checks:
   - `/`
   - `/styles.css`
   - `/app-runtime`
   - `/three-runtime`
   - `/api/projects`
   - `/api/search?q=agent`
   - `/api/guide?q=recruiter`
   - `/api/graph`
   - `/api/case-study/qagent`
   - `/api/status`
   - `/api/terminal` with `proof`, `projects`, and `open qagent`.
   - `/api/og/qagent.svg`
8. Browser checks:
   - Desktop 1440x1000.
   - Mobile 390x844.
   - Tablet 768x1024 if feasible.
   - Search interaction.
   - Case study selection.
   - Terminal command.
   - Status refresh.
   - Graph mode switching.
   - Canvas render is nonblank.
   - No console errors.
   - No obvious text overlap.
9. Responsive screenshots for changed areas.
10. Final `git diff --check`.

## Implementation Strategy

Start by creating a short working checklist in your own scratch notes or in the final report. Then implement. The best first waves are likely:

1. Extract structured portfolio data out of `server.js` into a dedicated module.
2. Add contract tests for data shape, search, guide, terminal, graph, and case study behavior.
3. Add a real Playwright E2E suite for the command-center interactions.
4. Strengthen API error handling and security headers.
5. Upgrade the UI to expose structured proof, visitor intent, timeline, and graph exploration.
6. Improve the command terminal and search explanations.
7. Verify everything in a real browser.

You can choose a different order if the repo reveals a better path, but every wave must connect implementation to tests.

## Quality Bar

The result should feel:

- Specific to Rishabh, not a template.
- Dense with proof, not noisy.
- Premium but practical.
- Fast and stable.
- Trustworthy under skeptical inspection.
- Impressive to a recruiter in 90 seconds.
- Useful to a technical collaborator in 10 minutes.
- Maintainable by future Codex runs.

Avoid:

- A landing page that only says nice things.
- Generic gradients and fake AI language.
- Unsupported "AI assistant" claims.
- Endless cards with no hierarchy.
- Console-only features that are not exposed or tested.
- Tests that only prove files exist.
- Big rewrites without verification.
- A literal infinite loop.

## Final Report Requirements

When you are done, report:

- What changed.
- Which files changed.
- Which gates passed.
- Which browser flows were tested.
- Screenshots or artifact paths created.
- Any honest blockers or residual risks.
- The next three high-impact waves.

If anything fails, do not pretend it passed. Fix it and rerun. Keep iterating until the app is genuinely better and the verification story is credible.
```

