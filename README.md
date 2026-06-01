# Rishabh Personal Command Center

This repo is a lightweight static-plus-Node personal command center. It serves a public portfolio shell, evidence-oriented APIs, generated SVG previews, a terminal command surface, live status checks, and a bundled Three.js constellation.

## Runtime Shape

- `index.html` and `styles.css` provide the public page.
- `main.js` handles small progressive enhancements such as reveal motion, greeting text, and the footer year.
- `command-center.mjs` powers the command-center UI and Three.js graph.
- `server.js` serves static assets and API endpoints.
- `scripts/embed-runtime.mjs` bundles `command-center.mjs` into `index.html` between the runtime markers.
- `test/api-contract.test.mjs` covers API behavior.
- `tests/e2e/command-center.spec.mjs` covers rendered command-center behavior.

## Commands

```sh
npm install
npm start
npm run check
npm run build:inline
npm run refresh:evidence
npm run stress:evaluation
npm run audit:research-rigor
npm run sample:evaluation
npm run ground:narratives
npm run contrast:narratives
npm run sequence:narratives
npm run tailor:narratives
npm run disclose:narratives
npm run audit:graph-disclosures
npm run audit:graph-confidence
npm run audit:graph-depth
npm run audit:graph-guard
npm run audit:artifact-museum
npm run compare:artifact-museum
npm run chief:private
npm run draft:private
npm run schedule:private
npm run prioritize:private
npm run audit:opportunity-quality
npm run derisk:opportunities
npm run rank:opportunities
npm run score:opportunities
npm run explain:runtime
npm run audit:design-stability
npm run audit:keyboard-readiness
npm run audit:design-ambition
npm run audit:claim-calibration
npm run audit:evaluation-integrity
npm run record:runtime
npm run diff:runtime
npm run record:runtime-surface
npm run record:route-latency
npm run audit:runtime-deploy
npm run audit:runtime-chain
npm run audit:a11y
npm run audit:performance
npm run audit:visual
ACCEPT_VISUAL_CHANGES=1 npm run audit:visual
npm run record:changes
npm test
npm run test:e2e
npm run verify
```

`npm run test:e2e` starts `server.js` automatically through Playwright on port `4173` unless `E2E_PORT` is set.

## Core Endpoints

- `/api/projects`
- `/api/search?q=agent`
- `/api/guide?q=recruiter`
- `/api/graph`
- `/api/graph/plan`
- `/api/graph/history`
- `/api/graph-quality`
- `/api/graph-crosslinks`
- `/api/graph-scoreboard`
- `/api/graph-lineage`
- `/api/graph-projection-guard`
- `/api/graph-projection-guard/plan`
- `/api/graph-projection-guard/history`
- `/api/graph-confidence`
- `/api/graph-confidence/plan`
- `/api/graph-confidence/history`
- `/api/graph-depth-score`
- `/api/graph-depth-score/plan`
- `/api/graph-depth-score/history`
- `/api/evaluation/proof-quality`
- `/api/evaluation/search-quality`
- `/api/evaluation/claim-calibration`
- `/api/evaluation/claim-calibration/plan`
- `/api/evaluation/claim-calibration/history`
- `/api/evaluation/opportunity-quality`
- `/api/evaluation/opportunity-quality/plan`
- `/api/evaluation/opportunity-quality/history`
- `/api/evaluation/usability`
- `/api/evaluation/usability/plan`
- `/api/evaluation/usability/history`
- `/api/evaluation/integrity`
- `/api/evaluation/integrity/plan`
- `/api/evaluation/integrity/history`
- `/api/evaluation/research-stress`
- `/api/evaluation/research-stress/plan`
- `/api/evaluation/research-stress/history`
- `/api/evaluation/research-rigor`
- `/api/evaluation/research-rigor/plan`
- `/api/evaluation/research-rigor/history`
- `/api/evaluation/sample`
- `/api/evaluation/sample/plan`
- `/api/evaluation/sample/history`
- `/api/claims`
- `/api/evidence/qagent`
- `/api/trust`
- `/api/opportunities`
- `/api/opportunity-packages`
- `/api/opportunity-packages/agent-infra-internship`
- `/api/opportunity-board`
- `/api/opportunity-derisking`
- `/api/opportunity-derisking/agent-infra-internship`
- `/api/opportunity-derisking/plan`
- `/api/opportunity-derisking/history`
- `/api/opportunity-ranking`
- `/api/opportunity-ranking/agent-infra-internship`
- `/api/opportunity-ranking/plan`
- `/api/opportunity-ranking/history`
- `/api/opportunity-scorecard`
- `/api/opportunity-scorecard/agent-infra-internship`
- `/api/opportunity-scorecard/plan`
- `/api/opportunity-scorecard/history`
- `/api/artifacts`
- `/api/artifact-collections`
- `/api/artifact-collections/proof-strongest`
- `/api/artifact-transcripts`
- `/api/artifact-transcripts/qagent`
- `/api/artifact-museum`
- `/api/artifact-museum/plan`
- `/api/artifact-museum/history`
- `/api/artifact-museum-compare`
- `/api/artifact-museum-compare/plan`
- `/api/artifact-museum-compare/history`
- `/api/artifact-replays`
- `/api/artifact-replays/qagent`
- `/api/artifact-compare?left=qagent&right=flowpr`
- `/api/intents`
- `/api/maintenance`
- `/api/runtime-truth`
- `/api/runtime-truth/plan`
- `/api/runtime-truth/fingerprint`
- `/api/runtime-truth/history`
- `/api/runtime-truth/attestation`
- `/api/runtime-surface/plan`
- `/api/runtime-surface`
- `/api/runtime-surface/latest`
- `/api/runtime-surface/history`
- `/api/route-latency`
- `/api/route-latency/plan`
- `/api/route-latency/history`
- `/api/runtime-boundary`
- `/api/runtime-reconciliation`
- `/api/runtime-diff`
- `/api/runtime-diff/plan`
- `/api/runtime-diff/history`
- `/api/runtime-explain`
- `/api/runtime-explain/plan`
- `/api/runtime-explain/history`
- `/api/runtime-deploy-readiness`
- `/api/runtime-deploy-readiness/plan`
- `/api/runtime-deploy-readiness/history`
- `/api/runtime-evidence-chain`
- `/api/runtime-evidence-chain/plan`
- `/api/runtime-evidence-chain/history`
- `/api/design-stability`
- `/api/design-stability/plan`
- `/api/design-stability/history`
- `/api/keyboard-readiness`
- `/api/keyboard-readiness/plan`
- `/api/keyboard-readiness/history`
- `/api/design-ambition`
- `/api/design-ambition/plan`
- `/api/design-ambition/history`
- `/api/evidence-refresh/plan`
- `/api/evidence-refresh/history`
- `/api/accessibility-audit/plan`
- `/api/accessibility-audit/history`
- `/api/performance-budget/plan`
- `/api/performance-budget/history`
- `/api/visual-regression/plan`
- `/api/visual-regression/history`
- `/api/proof-trials`
- `/api/proof-trials/qagent`
- `/api/packets`
- `/api/packets/professor`
- `/api/narratives`
- `/api/narratives/recruiter`
- `/api/narratives/plan`
- `/api/narratives/history`
- `/api/narrative-contrast`
- `/api/narrative-contrast/recruiter-vs-professor`
- `/api/narrative-contrast/plan`
- `/api/narrative-contrast/history`
- `/api/narrative-objections`
- `/api/narrative-objections/recruiter`
- `/api/narrative-tailor`
- `/api/narrative-tailor/recruiter`
- `/api/narrative-tailor/plan`
- `/api/narrative-tailor/history`
- `/api/narrative-disclosure`
- `/api/narrative-disclosure/recruiter`
- `/api/narrative-disclosure/plan`
- `/api/narrative-disclosure/history`
- `/api/narrative-sequence`
- `/api/narrative-sequence/recruiter`
- `/api/narrative-sequence/plan`
- `/api/narrative-sequence/history`
- `/api/graph-disclosure-links`
- `/api/graph-disclosure-links/plan`
- `/api/graph-disclosure-links/history`
- `/api/self-review`
- `/api/self-review/plan`
- `/api/self-review/history`
- `/api/self-review/weekly`
- `/api/weaknesses`
- `/api/weaknesses/qagent`
- `/api/skill-gaps`
- `/api/skill-gaps/ai-agents`
- `/api/contradictions`
- `/api/change-history/plan`
- `/api/change-history/history`
- `/api/change-history`
- `/api/waves`
- `/api/waves/41`
- `/api/case-study/qagent`
- `/api/status`
- `/api/status/plan`
- `/api/status/history`
- `/api/terminal`
- `/api/private/next-actions` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/chief-of-staff` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/chief-of-staff/plan` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/chief-of-staff/history` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/chief-of-staff/drafts` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/chief-of-staff/drafts/proof-repair` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/chief-of-staff/drafts/plan` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/chief-of-staff/drafts/history` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/schedule` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/priorities` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/tasks` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/review-sessions` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/briefing-drafts` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/outreach-drafts` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/private/approvals` (local/private only with `ENABLE_PRIVATE_COCKPIT=1`)
- `/api/og/qagent.svg`
- `/app-runtime`
- `/three-runtime`

## May Goals

`maygoals.md` is the intentionally impossible north-star specification. `.codex-maygoals-progress.md` is the working evidence ledger for converting that vision into checked implementation waves.
