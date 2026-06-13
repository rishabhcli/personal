# Deci-Centennial System Evolution & Integrity Audit

**Target:** `/Users/m3-max/Documents/GitHub/personal` — "Rishabh Personal Command Center"
**Audited:** 2026-06-12 · Node v25.9.0 · against the live, running system
**Auditor verdict:** The single largest systemic problem is not any one bug — it is that a **personal portfolio site has grown into a 78,000-line, 232-route, 75 MB self-referential "institution."** Every category-A through category-E finding below is downstream of that one decision. The findings are real and verified against the running code; the "enterprise / existential threat" framing is the exercise's, and I've kept each finding technically honest rather than inflating it.

## Evidence base (everything below is measured, not asserted)

| Fact | Value | How verified |
|---|---|---|
| `server.js` size | 7,453 lines | `wc -l` |
| Route dispatch branches | 232 sequential `if (pathname …)` | `grep -c` |
| `data/` + `scripts/` size | 70,633 lines, ~90 modules, 66 scripts | `wc -l` |
| `var/` receipt store | 75 MB, 68 JSON files, **untracked by git** | `du`, `git ls-files` |
| Largest receipt file | `graph-confidence-receipts.json` 8.4 MB = 22 receipts × **414 KB each** | `node -e` |
| Event-loop blocking | trivial GET **1 ms → 954 ms** under 30 concurrent `/api/graph?refresh=1` | live load test |
| Malformed URL `/%E0%A4%A` | returns **HTTP 500** (should be 400) | `curl` |
| Rate limiting | **none** (0 matches) | `grep` |
| Server request/socket timeouts | **none** (only a 4.5 s outbound-fetch abort) | `grep` |
| CSP | `script-src 'self' 'unsafe-inline'` | source |
| Inline runtime | `command-center.mjs` bundled into `index.html` lines 922–5059 (4,137 lines) | source |
| Contract tests | **9 total**, 2 are network-bound (~4.5 s each) | `node --test` |
| Search index | in-memory `node:sqlite` `:memory:`, rebuilt per process | source |

---

# Phase 1 — The 50-Point Critique

## Category A: Architecture, State Management & Scaling Anti-Patterns

> ### Issue #1: Synchronous multi-megabyte read-modify-write inside the request path
> * **Category:** A
> * **Systemic Impact:** A single Node process serializes all work. Any endpoint that appends a receipt parses *and* re-serializes the entire history file (up to 8.4 MB) synchronously, freezing the event loop for every other connected client.
> * **Technical Breakdown:** `data/verification-receipts.js:47-49` (and ~60 sibling modules) do `readStatusReceipts()` → `history.unshift(receipt)` → `writeFileSync(...JSON.stringify(history))`. `writeFileSync` and `JSON.parse`/`JSON.stringify` are blocking. With `graph-confidence-receipts.json` at 8.4 MB, every append is an 8 MB parse + 8 MB serialize + 8 MB fsync on the main thread.
> * **Remediation Paradigm:** Move persistence to an append-only log or embedded DB (SQLite WAL, or a real datastore) with async I/O. Never serialize whole-history blobs per write. Offload any unavoidable CPU/serialization to a worker thread or queue.

> ### Issue #2: 232-branch linear `if (pathname === …)` router
> * **Category:** A
> * **Systemic Impact:** Request routing is O(routes). The static-file fallback only runs after evaluating up to 232 string comparisons, and new routes are appended to a 2,300-line dispatch function that no one can hold in their head.
> * **Technical Breakdown:** `server.js:5108-7435` is one giant `createServer` callback of sequential equality/`startsWith` checks. There is no route table, no method-based map, no parameterized matcher.
> * **Remediation Paradigm:** Replace with a declarative route table (`Map<method+pattern, handler>`) or a minimal router. Routes become data, enabling middleware, automatic method/`405` handling, and a generated OpenAPI surface.

> ### Issue #3: 7,453-line god-module server with ~150 top-of-file imports
> * **Category:** A
> * **Systemic Impact:** The server file imports nearly every data module eagerly, couples HTTP concerns to domain synthesis, and forces a full re-read of the file for any change. Cold start pays for every module whether or not its route is hit.
> * **Technical Breakdown:** `server.js:1-569` is import boilerplate; the same file contains routing, ranking, graph synthesis, SVG rendering, the terminal interpreter, and the cockpit gate.
> * **Remediation Paradigm:** Split into `routes/`, `services/`, `render/`, lazy-load route handlers, and treat `server.js` as a thin composition root. Enforce a max-file-size lint.

> ### Issue #4: Heavy domain reports rebuilt from scratch on every request
> * **Category:** A
> * **Systemic Impact:** Expensive synthesis runs per-request with no memoization, so traffic linearly multiplies CPU on already-heavy operations.
> * **Technical Breakdown:** `currentMaintenanceReport()` (`server.js:2439`), `currentProofTrials()` (`:2449`), `currentAudiencePackets()` (`:2473`), and `currentArtifactGapWorkbench()` (`:2366`) construct full reports on each call with no cache, and several call each other transitively (e.g. the opportunity board pulls radar → packages → quality → packets → catalog → weakness → maintenance → proof trials each request).
> * **Remediation Paradigm:** Introduce a memoization layer keyed on input version/hash with explicit invalidation, or precompute on a schedule and serve materialized views.

> ### Issue #5: Inconsistent caching — permanent singletons that never invalidate
> * **Category:** A
> * **Systemic Impact:** The few caches that exist (`opportunityRadarCache`, `artifactCatalogCache`, etc., 13 module-level `…Cache = null` singletons) are populated once and never invalidated, so underlying data changes are never reflected without a process restart — the opposite failure mode from Issue #4.
> * **Technical Breakdown:** `server.js:626-639`. Mixed strategy: some reports are cached forever, others not at all, with no coherent cache policy or TTL.
> * **Remediation Paradigm:** One caching strategy with versioned keys and TTL/invalidation hooks tied to data mutations. Make staleness a deliberate, observable choice.

> ### Issue #6: In-memory-only SQLite search index, rebuilt per process
> * **Category:** A
> * **Systemic Impact:** The FTS5 index is created in `:memory:` and rebuilt at every boot. It cannot be shared across processes or instances, so the system can never scale beyond one process without N redundant index builds and divergent results.
> * **Technical Breakdown:** `server.js:642-714` `new sqlite.DatabaseSync(":memory:")`; wrapped in `try{require("node:sqlite")}catch{null}` so on any Node without the experimental module it silently degrades to JS ranking with *different* scoring.
> * **Remediation Paradigm:** Use a persisted, file-backed index (SQLite on disk with WAL, or a dedicated search service) built once and shared; pin the runtime so the search path is deterministic.

> ### Issue #7: Whole-file JSON parse on every receipt read
> * **Category:** A
> * **Systemic Impact:** Read paths (history endpoints, `preferReceipt` caches) `JSON.parse` the entire file each call; an 8 MB parse to return a 5-item history window is pure waste and a latency cliff.
> * **Technical Breakdown:** `readStatusReceipts()` and siblings read+parse the full file then `.slice(0, limit)`.
> * **Remediation Paradigm:** Store history as queryable rows (DB) or an index + per-receipt files so reads touch only the rows requested.

> ### Issue #8: Non-atomic writes with no locking → corruption under concurrency
> * **Category:** A
> * **Systemic Impact:** Two overlapping writers both read the old array, both unshift, and the second `writeFileSync` clobbers the first — silent lost updates. A crash mid-write leaves a truncated, unparseable file.
> * **Technical Breakdown:** Read-modify-write with no temp-file-and-rename, no advisory lock, no fsync barrier (`writeReceipts` in every store module).
> * **Remediation Paradigm:** Atomic write (`write tmp` → `fsync` → `rename`), or single-writer queue, or transactional DB. Append-only logs sidestep the read-modify-write entirely.

> ### Issue #9: Receipts embed full snapshots → unbounded storage growth
> * **Category:** A
> * **Systemic Impact:** Each "receipt" stores a complete copy of the artifact it describes (the entire relationship graph, 414 KB), so the store grows by megabytes per recorded run; `var/` is already 75 MB for a personal site.
> * **Technical Breakdown:** `graph-confidence-receipts.json` = 22 × 414 KB. `maxReceipts = 50` bounds *count*, not *size*; 50 × 414 KB ≈ 20 MB per concern × 68 concerns.
> * **Remediation Paradigm:** Store deltas/hashes, not full snapshots; content-address large payloads once and reference them; compress and tier cold history.

> ### Issue #10: Ephemeral, gitignored local files used as the system of record
> * **Category:** A
> * **Systemic Impact:** The entire "self-verifying evidence archive" lives in `var/`, which is `.gitignore`d (0 files tracked) and per-machine. A fresh clone or a new instance has *no* history, so durability, reproducibility, and any multi-instance future are impossible.
> * **Technical Breakdown:** `.gitignore` line `var/`; `git ls-files var/` → 0.
> * **Remediation Paradigm:** Promote durable state to a real datastore with backups; keep `var/` only as a local cache. Decide explicitly what is source-of-truth vs. derived.

## Category B: Cognitive Friction, Interaction Flow & Next-Gen UX Debt

> ### Issue #11: First paint blocked on 10 parallel heavy synthesis calls
> * **Category:** B
> * **Systemic Impact:** The UI shows nothing useful until ten of the most expensive endpoints all resolve; one slow/failed call stalls the whole boot.
> * **Technical Breakdown:** `command-center.mjs:137-160` `await Promise.all([... 10 fetches ...])` including `/api/graph`, `/api/opportunity-board`, `/api/runtime-reconciliation` — all uncached synthesis.
> * **Remediation Paradigm:** Stream a static first paint (the HTML already has content), then progressively hydrate each panel independently with its own loading/error boundary. Prioritize above-the-fold data.

> ### Issue #12: 60+ terminal commands flattened into one help string
> * **Category:** B
> * **Systemic Impact:** The terminal — a headline feature — is undiscoverable. The `help` output is a single ~1,200-character run-on line of comma-separated commands.
> * **Technical Breakdown:** `server.js:3903` `const help = "Commands: help, whoami, projects, … random";`
> * **Remediation Paradigm:** Grouped, paginated, searchable command palette with categories, examples, and autocomplete; demote rarely used commands.

> ### Issue #13: Dozens of near-duplicate API concepts the visitor cannot rank
> * **Category:** B
> * **Systemic Impact:** `graph-quality`, `graph-confidence`, `graph-depth`, `graph-lineage`, `graph-scoreboard`, `graph-crosslinks`, `graph-guard`, `graph-disclosures` — plus parallel `narrative-*`, `opportunity-*`, `runtime-*`, `artifact-*` families. A human (or recruiter) cannot tell which signal matters or trust any of them.
> * **Technical Breakdown:** 232 routes; the terminal help and `npm` scripts enumerate ~30 overlapping "audit/score/quality" surfaces.
> * **Remediation Paradigm:** Collapse to a small set of first-class concepts with one canonical score each; everything else becomes a drill-down, not a peer endpoint.

> ### Issue #14: No loading, skeleton, or error states for the parallel fetches
> * **Category:** B
> * **Systemic Impact:** If any of the 10 boot fetches fails, the corresponding section renders blank or `undefined` with no recovery affordance.
> * **Technical Breakdown:** `loadData()` assigns `await response.json()` directly with no per-response `.ok` check or fallback (`command-center.mjs:161-176`).
> * **Remediation Paradigm:** Per-section state machine (loading/empty/error/loaded) with retry and graceful degradation.

> ### Issue #15: Constellation graph is an unreadable hairball at scale
> * **Category:** B
> * **Systemic Impact:** `graphPayload()` emits person + every project + skills + claims + opportunities + receipts + artifacts + gaps + repairs + repos + demos + awards + timeline + maintenance + weaknesses + packets + narratives + objections — hundreds of nodes and many edge families into one 3D scene. It impresses for two seconds, then conveys nothing.
> * **Technical Breakdown:** `server.js:1284-1775` builds a single mega-graph with ~20 node types and ~25 edge relations.
> * **Remediation Paradigm:** Progressive disclosure: start with ~10 hero nodes, expand on interaction, filter by intent (recruiter/research/etc.), and cap rendered nodes with semantic clustering.

> ### Issue #16: Two response shapes per endpoint (summary vs full) hand-maintained
> * **Category:** B
> * **Systemic Impact:** Every endpoint returns a different ad-hoc compact shape vs full shape, so consumers must special-case each one; field names appear/disappear by mode (see the WIP diff stripping `generatedAt`, `methodology`, `sampleMatrixSummary`).
> * **Technical Breakdown:** `summarizeX` / `buildXResponse({detail})` pairs in nearly every module; `git diff data/evaluation-sample.js` shows fields being manually deleted from the compact path.
> * **Remediation Paradigm:** One typed schema per resource with declarative field-selection (`fields=` / GraphQL-style projection), generated from a single source of truth.

> ### Issue #17: Client computes a "trust blockade preview," then swaps in the server's
> * **Category:** B
> * **Systemic Impact:** The UI renders a locally-derived score, then re-renders when `/api/trust-blockade` returns — visible flicker and a moment where the displayed "trust" number is a guess.
> * **Technical Breakdown:** `deriveTrustBlockadePreview()` (`command-center.mjs:180`) then `scheduleTrustBlockadeHydration()` (`:113`, `:289`).
> * **Remediation Paradigm:** Render the authoritative value once it arrives with a clear "computing…" state; don't show a throwaway estimate styled as a real metric.

> ### Issue #18: No empty-state design for a fresh checkout
> * **Category:** B
> * **Systemic Impact:** Because history lives in untracked `var/`, a clone with no receipts shows "none"/zeros across many panels, making a first run look broken.
> * **Technical Breakdown:** History endpoints return `latestReceiptId: null` and empty arrays with no UX affordance to seed data.
> * **Remediation Paradigm:** Ship seed receipts or a one-command bootstrap, and design explicit "no data yet — run X" empty states.

> ### Issue #19: Dynamic regions lack consistent live-region semantics
> * **Category:** B
> * **Systemic Impact:** The terminal output, search results, and status panels update asynchronously; without consistent `aria-live`/focus management, screen-reader users miss updates. (The HTML does set `lang`, alts, and 84 aria/role/alt usages — the foundation exists but isn't applied to all async regions.)
> * **Technical Breakdown:** `index.html` has good static a11y; the JS-injected regions (`#terminal-output`, `#ranked-results`) need verified live-region wiring.
> * **Remediation Paradigm:** Audit every JS-updated region for `aria-live`/`role=status`, manage focus on route/section changes, and add automated a11y tests to CI.

> ### Issue #20: No narrative spine — the maze has no front door
> * **Category:** B
> * **Systemic Impact:** A visitor with 30 seconds cannot find the 30-second path through 200+ endpoints, 60 commands, and dozens of scores. The system optimizes for breadth of machinery over a single clear story.
> * **Technical Breakdown:** Intent paths exist (`/api/intents`) but compete with everything else rather than framing the experience.
> * **Remediation Paradigm:** Design one opinionated default journey (hero proof → one demo → one verifiable receipt → contact) and make everything else opt-in depth.

## Category C: Boundary Conditions, Edge Cases & Data Corruption Faults

> ### Issue #21: Malformed percent-encoding returns 500 instead of 400
> * **Category:** C
> * **Systemic Impact:** Any crawler, scanner, or fuzzer hitting a bad URL triggers a 500 **and** a `console.error`, conflating client errors with server faults and amplifying log volume.
> * **Technical Breakdown:** `server.js:5106` `const pathname = decodeURIComponent(url.pathname);` throws `URIError` on `/%E0%A4%A`; the catch block (`:5436`) maps anything without `statusCode` to 500. **Verified live: returns `{"error":"Internal server error"}` 500.**
> * **Remediation Paradigm:** Wrap decoding, return 400 on `URIError`, and only `console.error` genuine 5xx. Add a malformed-input test (the existing suite checks path traversal but not this).

> ### Issue #22: Concurrent receipt writes lose data (no atomicity)
> * **Category:** C
> * **Systemic Impact:** Overlapping `record`/`refresh` requests corrupt or silently drop receipts — directly undermining the "evidence archive" thesis.
> * **Technical Breakdown:** Read-modify-`writeFileSync` with no lock (see Issue #8). Two writers race the same array.
> * **Remediation Paradigm:** Atomic temp+rename or single-writer serialization (see Issue #8).

> ### Issue #23: One corrupt byte silently erases all history
> * **Category:** C
> * **Systemic Impact:** A partial write (Issue #22) or disk hiccup makes `JSON.parse` throw; the `catch { return []; }` treats this as "no history," so corruption is indistinguishable from emptiness and the next write overwrites whatever survived.
> * **Technical Breakdown:** `readStatusReceipts()` `try{…}catch{return []}` (`data/verification-receipts.js:153-161`) — pattern repeated across all stores.
> * **Remediation Paradigm:** Distinguish "empty" from "unreadable"; on parse failure, quarantine the file, alert, and refuse destructive overwrite.

> ### Issue #24: POST bodies persisted with no schema validation
> * **Category:** C
> * **Systemic Impact:** `/api/private/tasks`, `/api/private/approvals`, `/api/private/outreach-drafts` accept arbitrary JSON; only `JSON.parse` failure is caught. Unknown fields, wrong types, or oversized strings flow into stored state.
> * **Technical Breakdown:** `server.js:7103-7122`, `:7346-7367` — `parsed.id/status/reviewer/note` consumed without validation.
> * **Remediation Paradigm:** Validate every body against a schema (zod/JSON-Schema), reject unknown fields, bound string lengths, return 422 with details.

> ### Issue #25: No server-side request/socket timeout (slowloris)
> * **Category:** C
> * **Systemic Impact:** A client that opens a connection and sends bytes slowly (or never finishes headers) ties up the single process indefinitely; `getBody` only caps total size at 64 KB, not duration.
> * **Technical Breakdown:** No `server.requestTimeout`/`headersTimeout`/`keepAliveTimeout` set (`grep` → none). Only outbound `fetch` has a 4.5 s `AbortController` (`server.js:4961`).
> * **Remediation Paradigm:** Set conservative `headersTimeout`, `requestTimeout`, and `keepAliveTimeout`; add an idle-socket reaper.

> ### Issue #26: Live status checks run inline on the request thread
> * **Category:** C
> * **Systemic Impact:** `/api/status?refresh=1` runs several outbound `fetch`es (each up to 4.5 s) before responding; a slow external target makes a user request hang for seconds. **Verified: the two status-touching contract tests take ~4.5 s each.**
> * **Technical Breakdown:** `statusPayload()` → `Promise.all(targets.map(checkTarget))` awaited in the handler (`server.js:4951`, `:7395`).
> * **Remediation Paradigm:** Probe on a background schedule, serve the last good result instantly, and never block a user request on third-party latency.

> ### Issue #27: `Date.now()`-based receipt IDs collide under concurrency
> * **Category:** C
> * **Systemic Impact:** Two receipts created in the same millisecond get the same ID, breaking dedup, history selection, and any "select by id" endpoint.
> * **Technical Breakdown:** `id: \`status-${Date.now().toString(36)}\`` (`data/verification-receipts.js:27`) and similar across modules.
> * **Remediation Paradigm:** Use `crypto.randomUUID()` or a monotonic counter + timestamp.

> ### Issue #28: First-request host gets cached for all later requests
> * **Category:** C
> * **Systemic Impact:** Several `currentX` helpers default `req = { headers: { host: \`localhost:${port}\` } }` or are memoized after the first call, so absolute URLs/`baseUrl` computed from the first request leak into responses for differently-hosted later requests.
> * **Technical Breakdown:** e.g. `currentOpportunityDeRiskingReport(req = { headers:{ host: … }})` (`server.js:2226`) combined with permanent caches (Issue #5).
> * **Remediation Paradigm:** Never capture request context in process-lifetime caches; derive host per request or use relative URLs.

> ### Issue #29: Search tokenizer silently drops non-ASCII queries
> * **Category:** C
> * **Systemic Impact:** A query of emoji, accented characters, or CJK tokenizes to `[]`, which the ranker treats as "no terms" and returns the default top-N — the user gets unrelated results with no signal that their query was ignored.
> * **Technical Breakdown:** `tokenize()` uses `/[a-z0-9+#.]+/g` (`server.js:770-774`); anything else is discarded.
> * **Remediation Paradigm:** Unicode-aware tokenization (`\p{L}\p{N}`), and surface "no matching terms" explicitly.

> ### Issue #30: Unbounded transitive recomputation can stack-amplify
> * **Category:** C
> * **Systemic Impact:** Because uncached reports call each other (board → derisking → ranking → scorecard, each pulling radar/packages/quality/packets), a single scorecard request can rebuild the radar and packages several times, multiplying CPU non-linearly.
> * **Technical Breakdown:** `currentOpportunityScorecardReport()` (`server.js:2272`) composes four other full reports, several of which independently rebuild the same uncached inputs.
> * **Remediation Paradigm:** Build a single request-scoped computation context that memoizes shared inputs once per request (dataloader pattern).

## Category D: Security Posture, Data Leakage & Zero-Trust Violations

> ### Issue #31: CSP permits `script-src 'unsafe-inline'`
> * **Category:** D
> * **Systemic Impact:** The headline XSS mitigation is neutralized: any injected inline script would execute. The site also *relies* on a 4,137-line inline script, so the unsafe directive can't be dropped without refactoring.
> * **Technical Breakdown:** `server.js:607-617` CSP `script-src 'self' 'unsafe-inline'`; `index.html:922-5059` is one inline module.
> * **Remediation Paradigm:** Externalize the inline bundle, adopt nonce/hash-based CSP, and remove `'unsafe-inline'` for scripts and styles.

> ### Issue #32: No rate limiting anywhere
> * **Category:** D
> * **Systemic Impact:** One client can issue unlimited `?refresh=1` graph rebuilds (each a full synthesis) and trivially exhaust the single-process CPU. **Verified: 30 concurrent rebuilds drove a 1 ms endpoint to 954 ms.**
> * **Technical Breakdown:** `grep` for rate-limit/throttle/429 → 0 matches.
> * **Remediation Paradigm:** Per-IP token-bucket limiting, stricter budgets on expensive/refresh/record endpoints, and a global concurrency cap on synthesis.

> ### Issue #33: Private data stored unencrypted; gate is a single env var
> * **Category:** D
> * **Systemic Impact:** "Private cockpit" data (schedule 150 KB, priorities 79 KB, chief-of-staff 75 KB, approvals, tasks) sits as plaintext JSON in `var/`. Access control is `ENABLE_PRIVATE_COCKPIT==="1"` plus a loopback `remoteAddress` check — no authentication, no authorization, no encryption at rest.
> * **Technical Breakdown:** `privateCockpitEnabled()` (`server.js:3868-3872`); `ls var/private-*.json` shows plaintext stores.
> * **Remediation Paradigm:** Real auth (session/token) for any private surface, encryption at rest for private stores, and per-record authorization rather than an all-or-nothing flag.

> ### Issue #34: Error messages for sub-500 errors are reflected to clients
> * **Category:** D
> * **Systemic Impact:** `error.message` is returned verbatim for any error with a `statusCode < 500`, leaking internal phrasing/paths to callers; 5xx paths also `console.error` full stacks.
> * **Technical Breakdown:** `server.js:7436-7440` `json(res, { error: status >= 500 ? "Internal server error" : error.message }, status)`.
> * **Remediation Paradigm:** Return curated, enumerated error codes; never reflect raw messages; log internally with correlation IDs.

> ### Issue #35: "Security attestation" is source-string grep, not behavior
> * **Category:** D
> * **Systemic Impact:** The system claims to *verify* its own security posture, but the check only asserts that certain substrings appear in `server.js`. Renaming a function breaks the "attestation" though behavior is unchanged; leaving the string in a comment passes it though the real gate is deleted. This is false assurance dressed as proof.
> * **Technical Breakdown:** `server.js:3583-3589` `serverSource.includes("function privateCockpitEnabled")`, `…includes('process.env.ENABLE_PRIVATE_COCKPIT !== "1"')`, regex-counts `privateCockpitEnabled(req)`.
> * **Remediation Paradigm:** Replace source-grep "attestation" with executable security tests (actually call private routes from a non-loopback context and assert 404/401) and dependency/secret scanning.

> ### Issue #36: No CSRF protection on state-changing POSTs
> * **Category:** D
> * **Systemic Impact:** The mutating endpoints rely solely on loopback for safety; there is no CSRF token or origin check, so any future non-loopback exposure (proxy, port-forward, container) immediately becomes forgeable.
> * **Technical Breakdown:** POST handlers (`server.js:7103`, `7258`, `7346`) check only `privateCockpitEnabled` (env+socket), no token/Origin/SameSite.
> * **Remediation Paradigm:** CSRF tokens or strict `Origin`/`Sec-Fetch` checks on all mutations, independent of network locality.

> ### Issue #37: SVG is assembled by string interpolation with partial escaping
> * **Category:** D
> * **Systemic Impact:** `thumbnail()` interpolates project fields into raw SVG/XML; `escapeXml` handles `& < > "` but not `'` and makes no distinction between attribute and text contexts. Today's inputs are trusted static data, but the pattern is an injection waiting for the first user-controlled field.
> * **Technical Breakdown:** `server.js:5033-5048`.
> * **Remediation Paradigm:** Build SVG via a safe builder or fully context-aware escaping; treat all interpolated values as untrusted by default.

> ### Issue #38: Reliance on experimental `node:sqlite` with silent failure
> * **Category:** D
> * **Systemic Impact:** A security/availability-relevant subsystem (search) depends on an unstable, version-gated API and *silently* degrades on failure, so a runtime change can alter ranking and hide problems without any signal.
> * **Technical Breakdown:** `server.js:571-576` `try { sqlite = require("node:sqlite"); } catch { sqlite = null; }`; `engines.node >=22` but the module is experimental and changes across versions (running Node 25 here).
> * **Remediation Paradigm:** Pin and assert the runtime, fail loudly if the index can't initialize, and add SCA/CVE scanning + lockfile audit to CI.

> ### Issue #39: No integrity protection on "receipts" despite the proof framing
> * **Category:** D
> * **Systemic Impact:** Receipts are presented as tamper-evident evidence, but they are plain mutable JSON with no hash chain or signature. Anyone with file access can rewrite history undetectably — fatal for a system whose entire value proposition is verifiable trust.
> * **Technical Breakdown:** `writeReceipts()` writes unsigned `{receipts}` JSON; no checksums, no chaining, `var/` untracked.
> * **Remediation Paradigm:** Hash-chain receipts (each references the prior hash), sign them, and anchor periodically to an external immutable store.

> ### Issue #40: No security headers test and `'unsafe-inline'` style too
> * **Category:** D
> * **Systemic Impact:** CSP also allows `style-src 'unsafe-inline'`; combined with no automated header regression test, a future edit can silently weaken headers with no alarm.
> * **Technical Breakdown:** `server.js:607-617`; no contract test asserts CSP/headers.
> * **Remediation Paradigm:** Nonce-based styles, and a header-contract test that fails CI on regression.

## Category E: Observability, Maintainability & Technical Decay

> ### Issue #41: 78k+ LOC of overlapping machinery for a personal site
> * **Category:** E
> * **Systemic Impact:** The codebase is far larger than its purpose justifies (~90 data modules, 66 scripts, 232 routes). This *is* the existential maintainability threat: no human or agent can safely change it because the blast radius is unknowable.
> * **Technical Breakdown:** `wc -l` data+scripts = 70,633; server 7,453; index.html 5,062.
> * **Remediation Paradigm:** Aggressively delete. Define the genuine product (proof + a few demos + verifiable status) and remove the parallel "audit/quality/score/lineage" layers that exist only to grade each other.

> ### Issue #42: Per-endpoint hand-written projection functions duplicate everywhere
> * **Category:** E
> * **Systemic Impact:** Every resource has bespoke `summarize*`/`compact*`/`buildXResponse` functions doing the same shaping by hand; "payload too big" is fixed by manually deleting fields (commit *"Compress visual regression history payload"*; current WIP diff strips fields from `evaluation-sample`). The work never ends because the cause (no shared projection layer) is untouched.
> * **Technical Breakdown:** `git diff data/evaluation-sample.js` removes `generatedAt`, `methodology`, `sampleMatrixSummary`, `repairQueue`, etc. by hand.
> * **Remediation Paradigm:** One declarative serialization layer with field selection; delete the hand-rolled summarizers.

> ### Issue #43: Source/served drift via inline bundling
> * **Category:** E
> * **Systemic Impact:** `command-center.mjs` is bundled into `index.html` (lines 922–5059). Edit the source, forget `npm run build:inline`, and production serves stale behavior with no warning — two sources of truth for one program.
> * **Technical Breakdown:** `scripts/embed-runtime.mjs` replaces a marked region; the 4,137-line inline `<script>` is the esbuild output of the 1,606-line source.
> * **Remediation Paradigm:** Serve the external module with proper caching (the route `/app-runtime` already exists), or make the inline build a verified, drift-detected CI step.

> ### Issue #44: 9 contract tests for 232 routes / 78k LOC
> * **Category:** E
> * **Systemic Impact:** Coverage is a rounding error against the surface; most assertions check response *shape*, not behavior/regressions, so refactors are unguarded. Two tests are network-bound (~4.5 s) and flaky offline.
> * **Technical Breakdown:** `test/api-contract.test.mjs` → "tests 9, pass 9"; status/demo tests hit live targets.
> * **Remediation Paradigm:** Hermetic tests (mock external probes), per-route behavioral coverage, property tests for ranking/score math, and coverage gates in CI.

> ### Issue #45: No structured logging, metrics, or tracing
> * **Category:** E
> * **Systemic Impact:** Production behavior is invisible: no request logs, latency histograms, error rates, or traces. The single-threaded blocking issues (#1, #26, #32) would be undiagnosable in the wild.
> * **Technical Breakdown:** Only `console.log` on boot and `console.error` on 5xx.
> * **Remediation Paradigm:** Structured logs with correlation IDs, RED metrics per route, and tracing around synthesis and I/O.

> ### Issue #46: "CI"/`check` is a 200-file `node --check` one-liner
> * **Category:** E
> * **Systemic Impact:** The `check` script is a single line chaining `node --check` over ~150 files plus `validate-data`. It verifies *syntax*, not types or correctness, fails opaquely (which file?), and there's no lint/type gate.
> * **Technical Breakdown:** `package.json:9` — one ~6 KB line.
> * **Remediation Paradigm:** Real toolchain: typecheck (TS or JSDoc+`tsc`), lint, unit/integration/e2e as separate fast jobs with clear failures.

> ### Issue #47: Circular self-grading presented as verification
> * **Category:** E
> * **Systemic Impact:** Self-review/quality/integrity scores are computed from the *same* local evidence they grade, then written as "receipts" and surfaced as proof. A metric that grades its own inputs cannot detect its own blind spots; the green dashboard is largely self-fulfilling.
> * **Technical Breakdown:** `buildSelfReviewReports()` (`data/self-review.js:42`) consumes the very projects/claims/trust/opportunities/maintenance it scores; output mode `evidence-self-review-receipt`.
> * **Remediation Paradigm:** Ground scores in *external*, falsifiable signals (real CI results, real uptime, real third-party link checks, real user events); separate the grader from the graded.

> ### Issue #48: No API versioning; inline client tightly coupled to 232 routes
> * **Category:** E
> * **Systemic Impact:** Any route/field change can break the bundled client, and there's no `/v1` boundary or contract, so the API cannot evolve safely.
> * **Technical Breakdown:** Routes are bare `/api/...`; the client hard-codes paths and field names (`command-center.mjs:150-176`).
> * **Remediation Paradigm:** Versioned, documented (OpenAPI) API generated from schemas; client consumes generated types.

> ### Issue #49: Concept sprawl with overlapping, unowned semantics
> * **Category:** E
> * **Systemic Impact:** "quality," "score," "confidence," "lineage," "guard," "scoreboard," "depth," "reconciliation," "attestation," "blockade" recur across graph/narrative/opportunity/runtime families with no canonical definition. Nobody can say which is authoritative, so the model rots.
> * **Technical Breakdown:** ~30 parallel `audit:*`/`record:*` npm scripts; dozens of `data/*-quality.js`, `*-score.js`, `*-guard.js`.
> * **Remediation Paradigm:** A small, documented domain glossary with one owner per concept; merge or delete synonyms.

> ### Issue #50: The architecture actively resists autonomous/agentic maintenance
> * **Category:** E
> * **Systemic Impact:** The stated 10-year goal is an AI-maintainable system, yet the current shape — 7.4k-line god-router, no types, no behavioral tests, ephemeral untracked state, self-referential metrics, source/served drift — is close to the worst case for safe automated change. An agent cannot reason about blast radius or verify its own edits against trustworthy signals.
> * **Technical Breakdown:** Synthesis of #1–#49.
> * **Remediation Paradigm:** Make the system *legible*: types, contracts, hermetic tests, materialized boundaries, and external ground-truth — then automation becomes safe. Legibility is the prerequisite for autonomy, not a later phase.

---

# Phase 2 — The 10-Year Strategic Master Blueprint

**Framing:** The decade goal ("globally distributed, edge-native, self-healing sovereign application") is aspirational language for a personal site. The honest translation is: *make the system small, legible, durable, and trustworthy enough that it stays alive and improvable for ten years with mostly automated upkeep.* The roadmap below honors the three-epoch structure while staying engineering-real.

## Years 1–2 — Foundation Remediation & Decoupling
*Goal: stop the bleeding, shrink the surface, make change safe.*

1. **Triage the 50.** Fix the correctness/security cliffs first: #21 (500→400), #22/#23 (atomic, non-destructive writes), #25 (timeouts), #32 (rate limit), #31 (CSP/inline), #33 (private auth+encryption). These are days, not quarters.
2. **Decouple persistence (#1, #7, #8, #9, #10).** Replace whole-file read-modify-write with an embedded DB (SQLite WAL on disk) or append-only log; store deltas not snapshots; make `var/` a cache and put source-of-truth somewhere durable and backed up.
3. **Decompose the monolith (#2, #3).** Declarative route table; split `server.js` into routes/services/render; enforce file-size and complexity lints.
4. **One projection layer (#16, #42).** Schema-per-resource with field selection; delete hand-rolled summarizers.
5. **Ruthless deletion (#41, #49).** Pick the real product. Remove the parallel grading layers that only grade each other. Target an order-of-magnitude smaller codebase.
6. **Real verification (#35, #39, #44, #47).** Hermetic behavioral tests; hash-chained/signed receipts; replace source-grep "attestation" with executed assertions; ground scores in external signals.
7. **Immutable/typed core.** Introduce types (TS or checked JSDoc) and immutable data structures for the domain model so refactors are mechanical and safe.

## Years 3–5 — Cognitive Automation & Edge Migration
*Goal: precompute, distribute, and observe.*

1. **Materialized views + scheduled synthesis (#4, #5, #26, #30).** Move heavy reports and status probes to background jobs; serve precomputed, versioned snapshots from cache/CDN. User requests never block on synthesis or third-party latency.
2. **Edge-friendly static-first delivery (#11, #43).** Pre-render the public surface; ship it from a CDN/edge; hydrate panels progressively. The dynamic API becomes a thin, cacheable read layer. (This is the realistic, honest version of "edge migration.")
3. **Observability everywhere (#45).** Structured logs, RED metrics, tracing, error aggregation, synthetic uptime checks — so behavior is measurable before it's automated.
4. **Predictive caching where it pays.** Cache by access pattern (recruiter path, research path) using real telemetry, not speculative warming of everything.
5. **API as product (#48).** Versioned, OpenAPI-documented contracts; generated client types; deprecation policy.

## Years 6–10 — The Sovereign Autonomous Era
*Goal: safe self-maintenance, grounded in external truth.*

1. **Legibility-gated autonomy (#50).** Only after types + contracts + hermetic tests + external ground-truth exist can agents safely propose/apply changes. Every automated change runs the full hermetic suite and a canary before merge.
2. **Self-healing within bounds.** Automated remediation for *well-characterized* failures (stale cache rebuild, failed external link → flagged, corrupt store → quarantine+restore), each with a receipt and a human-reversible audit trail — not open-ended "real-time structural refactoring."
3. **Load-shedding & graceful degradation.** Concurrency caps and circuit breakers on synthesis; shed to cached/static responses under pressure instead of collapsing the single process.
4. **External ground-truth loop.** The system's trust scores derive from real CI, real uptime, real third-party verification, and real visitor outcomes — closing the circular-grading gap (#47) permanently.
5. **Continuous deletion as a feature.** An ongoing "what is now unused / unverified / redundant?" pass keeps the system from re-accreting the sprawl this audit found. The healthiest long-lived version of this project is *smaller* than today's, not larger.

---

### Closing note
The machine is impressive in ambition and breadth, and several patterns (public-safe projections, explicit source boundaries, evidence framing) are genuinely thoughtful. But its dominant risk is self-inflicted scale: it has built a 78k-line apparatus to prove the trustworthiness of a portfolio, while the apparatus itself is unverifiable (ephemeral state, self-graded metrics, source-grep attestation) and operationally fragile (single-threaded blocking, no limits, no timeouts). The highest-leverage decade-one move is not to add the next wave — it is to **delete, decouple, and ground in external truth** so that the next decade is maintainable at all.
