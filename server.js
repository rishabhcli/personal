const { createReadStream, existsSync } = require("node:fs");
const { stat } = require("node:fs/promises");
const { createServer } = require("node:http");
const path = require("node:path");

let sqlite = null;
try {
  sqlite = require("node:sqlite");
} catch {
  sqlite = null;
}

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const publicStaticRoutes = new Set([
  "/index.html",
  "/styles.css",
  "/main.js",
  "/favicon.svg",
  "/desktop-hero.png",
]);

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self' mailto:",
    "frame-ancestors 'none'",
  ].join("; "),
};

const projects = [
  {
    slug: "anchormesh",
    title: "AnchorMesh",
    kind: "Disaster mesh network",
    tier: "Hero",
    score: 99,
    visibility: "Private mobile + web demo",
    repoUrl: null,
    liveUrl: "https://aether-sos.vercel.app",
    timeline: "Alameda Hacks, 2025",
    outcome: "First place at Alameda Hacks with 900+ submissions.",
    summary:
      "A mobile-first emergency system that turns phones into Bluetooth SOS relays when LTE coverage fails.",
    why:
      "It converts a scary infrastructure failure into a local-first rescue channel, and it is the clearest proof that Rishabh can mix hardware thinking, mobile constraints, maps, realtime dashboards, and public-safety stakes.",
    stack: ["Next.js", "React", "Supabase", "Mapbox", "Bluetooth LE", "Dart", "Swift"],
    tags: ["bluetooth", "mesh", "first responders", "civic tech", "hackathon winner", "mobile"],
    proof: [
      "Reverse-engineered Bluetooth mesh behavior for SOS propagation.",
      "Dashboard shows priority alerts, hop counts, relay chains, and map triage.",
      "Built with Jerry Wen and Aditya Das; repo evidence found in AnchorMesh web/mobile repos.",
    ],
    gradient: ["#31d0aa", "#ef4444"],
  },
  {
    slug: "qagent",
    title: "QAgent",
    kind: "Self-healing QA agent",
    tier: "Hero",
    score: 98,
    visibility: "Public + private unified system",
    repoUrl: "https://github.com/rishabhcli/QAgent",
    liveUrl: null,
    timeline: "WeaveHacks, 2026",
    outcome: "Best Use of Browserbase at WeaveHacks.",
    summary:
      "An autonomous QA loop that browses real web apps, finds UI bugs, applies fixes, verifies them, and leaves receipts.",
    why:
      "This is the strongest software thesis: Rishabh builds agents that do work in the browser, not chatbots that describe work.",
    stack: ["TypeScript", "Python", "Browserbase", "Stagehand", "Redis", "Weave", "Vercel"],
    tags: ["AI agents", "frontend QA", "browser automation", "pull requests", "observability"],
    proof: [
      "Public repo describes tester, triage, fixer, and verifier agents.",
      "Unified private version adds local-first execution, signed packages, benchmarks, and governance.",
      "GitHub shows QAgent as one of the most recently updated core repos.",
    ],
    gradient: ["#60a5fa", "#f59e0b"],
  },
  {
    slug: "flowpr",
    title: "FlowPR",
    kind: "Agentic frontend repair",
    tier: "Hero",
    score: 96,
    visibility: "Public",
    repoUrl: "https://github.com/rishabhcli/FlowPR",
    liveUrl: null,
    timeline: "Ship to Prod AWS Hackathon, 2026",
    outcome: "Finalist project built around real frontend testing and PR creation.",
    summary:
      "A frontend quality agent that opens a real app, tests an important flow, captures evidence, diagnoses the bug, patches code, verifies, and opens a PR.",
    why:
      "It makes the QAgent thesis product-shaped: command center, live run state, worker loop, health gates, artifacts, and proof packets.",
    stack: ["TypeScript", "Next.js", "Redis", "InsForge", "TinyFish", "GitHub", "Guild.ai"],
    tags: ["PR automation", "QA", "frontend", "SSE", "browser evidence", "developer tools"],
    proof: [
      "README documents dashboard, worker, demo target, Redis streams, and run detail pages.",
      "Recent local memory confirms live local run proof and sponsor-clutter cleanup.",
      "Repo description is unusually clear and product-ready.",
    ],
    gradient: ["#22c55e", "#38bdf8"],
  },
  {
    slug: "fairvalue",
    title: "FairValue",
    kind: "Real estate prediction market",
    tier: "Hero",
    score: 94,
    visibility: "Public teammate repo",
    repoUrl: "https://github.com/seanchiuai/FairValue",
    liveUrl: null,
    timeline: "Cognee AI-Memory Hackathon, 2026",
    outcome: "First place at Cognee AI-Memory Hackathon.",
    summary:
      "A multiplayer real-estate prediction market where players trade Over/Under appraisals with an LMSR market maker and live room dashboards.",
    why:
      "It shows mathematical product taste: markets, live odds, Qdrant/Cognee memory, WebSockets, and social multiplayer mechanics.",
    stack: ["React 19", "TypeScript", "Express", "WebSocket", "Neon", "Qdrant", "Cognee"],
    tags: ["prediction market", "real estate", "LMSR", "multiplayer", "AI memory"],
    proof: [
      "LinkedIn post describes the multiplayer app, LMSR market maker, QR join flow, and leaderboard.",
      "Repo lives under teammate seanchiuai/FairValue and has a detailed architecture README.",
      "Uses real-time room state and market history endpoints.",
    ],
    gradient: ["#a3e635", "#14b8a6"],
  },
  {
    slug: "masterbuild",
    title: "MasterBuild",
    kind: "Multi-agent build planner",
    tier: "Hero",
    score: 92,
    visibility: "Private",
    repoUrl: null,
    liveUrl: null,
    timeline: "Who Is the Agent Master Hackathon, 2026",
    outcome: "Best Use of InsForge.",
    summary:
      "Six research/build agents browse YouTube, X, Reddit, Substack, Brave, and InsForge to turn raw product ideas into validated build plans.",
    why:
      "It is a clean command-center story: real-time agent dashboard, shared memory, trend synthesis, and an auto-builder path.",
    stack: ["Python asyncio", "Next.js", "InsForge", "MiniMax", "Browser Use", "Brave Search"],
    tags: ["multi-agent", "research", "InsForge", "Browser Use", "market intelligence"],
    proof: [
      "LinkedIn post reports the $500 InsForge track win and stack.",
      "Repo README describes six agents, shared memory, realtime channels, and 3D command center.",
      "Good website candidate because the story is visual and understandable.",
    ],
    gradient: ["#f97316", "#06b6d4"],
  },
  {
    slug: "repro",
    title: "RePro",
    kind: "Incident remediation agent",
    tier: "Strong",
    score: 89,
    visibility: "Public",
    repoUrl: "https://github.com/rishabhcli/zerotoagent",
    liveUrl: null,
    timeline: "Zero to Agent, 2026",
    outcome: "Built for Vercel x Google DeepMind hackathon.",
    summary:
      "A verification-first incident response agent that ingests evidence, reproduces failures in a sandbox, patches, gates, and opens proof-backed PRs.",
    why:
      "It is another strong proof point for accountable autonomy: not only diagnosing incidents, but proving the fix before escalating to a PR.",
    stack: ["Next.js", "Vercel Workflow", "Vercel Sandbox", "Supabase", "Sentry", "ElevenLabs"],
    tags: ["incident response", "sandbox", "verification", "PRs", "SRE"],
    proof: [
      "README shows an ingest, triage, reproduce, patch, gate, ship, trace workflow.",
      "The project explicitly treats observability as the trust surface.",
    ],
    gradient: ["#facc15", "#e11d48"],
  },
  {
    slug: "immifile",
    title: "ImmiFile",
    kind: "Immigration filing agent",
    tier: "Strong",
    score: 87,
    visibility: "Public + private",
    repoUrl: "https://github.com/rishabhcli/immi-file",
    liveUrl: "https://immi-file.vercel.app",
    timeline: "Browser Use Hackathon at YC, 2026",
    outcome: "Built at YC with Browser Use, Supermemory, Convex, Dedalus, MongoDB, Laminar, and AgentMail.",
    summary:
      "A human-in-the-loop browser agent for immigration filing that navigates portals, extracts documents, pauses for sensitive steps, and stores reusable profile memory.",
    why:
      "It adds a high-stakes domain to the portfolio while showing Rishabh understands review gates, PII handling, and compliance boundaries.",
    stack: ["Next.js", "FastAPI", "Convex", "Browser Use", "Supermemory", "MongoDB", "Laminar"],
    tags: ["browser agent", "immigration", "PII safety", "human in loop", "YC"],
    proof: [
      "LinkedIn post confirms YC Browser Use hackathon and project story.",
      "README documents PII redaction, DOM-level sensitive data injection, and review gates.",
    ],
    gradient: ["#2dd4bf", "#818cf8"],
  },
  {
    slug: "refind",
    title: "ReFind",
    kind: "Second-hand shopping assistant",
    tier: "Strong",
    score: 82,
    visibility: "Public",
    repoUrl: "https://github.com/rishabhcli/ReFind",
    liveUrl: null,
    timeline: "Multimodal Frontier Hackathon, 2026",
    outcome: "Finalist project.",
    summary:
      "An AI-powered second-hand shopping assistant that searches marketplaces, analyzes prices, and scores deals through a streaming conversational UI.",
    why:
      "Good consumer-facing example: real-time market data, conversational orchestration, and a problem normal people immediately understand.",
    stack: ["Python", "FastAPI", "Next.js", "React 19", "Railtracks", "SSE"],
    tags: ["shopping", "market data", "assistant", "deal scoring", "consumer AI"],
    proof: [
      "README documents multi-marketplace search, SSE streaming, and pricing context.",
      "Resume connects ReFind to the Multimodal Frontier Hackathon.",
    ],
    gradient: ["#fb7185", "#fbbf24"],
  },
  {
    slug: "smartcane",
    title: "SmartCane Research",
    kind: "Assistive hardware + mobile",
    tier: "Hero",
    score: 91,
    visibility: "Private research + app repo",
    repoUrl: null,
    liveUrl: null,
    timeline: "Dec 2024 - Oct 2025",
    outcome:
      "First place at Alameda County Science and Engineering Fair and Stem4All; COSITE 2025 paper; provisional utility patent accepted.",
    summary:
      "An Arduino-powered cane with ultrasonic obstacle sensing, fall detection, thermoelectric LEDs, and a Bluetooth Android caregiver app.",
    why:
      "It rounds out the site beyond web apps: embedded systems, mobile Bluetooth, safety research, published writing, and real-world assistive technology.",
    stack: ["Arduino", "React Native", "Expo", "Firebase", "Kotlin", "Bluetooth HC-05", "Sensors"],
    tags: ["hardware", "research", "assistive tech", "Bluetooth", "science fair", "paper"],
    proof: [
      "Resume cites first-place awards, state presentation, patent acceptance, and paper publication.",
      "Connections repo README describes dual-role SmartCane app for users and caregivers.",
    ],
    gradient: ["#84cc16", "#0f766e"],
  },
  {
    slug: "heyblue",
    title: "Hey, Blue!",
    kind: "Production software role",
    tier: "Strong",
    score: 86,
    visibility: "Private company work",
    repoUrl: null,
    liveUrl: "https://heyblue.us",
    timeline: "Jul 2024 - Sep 2025",
    outcome: "Shipped app and website features supporting 500+ police-community connections in 14 states.",
    summary:
      "Mobile and web engineering across verification, profile-picture safety, live map connections, app stability, and iOS distribution.",
    why:
      "This is the production counterweight to hackathons: longer-term maintenance, security/usability work, and shipped mobile releases.",
    stack: ["React", "Expo", "Firebase", "Supabase", "iOS distribution", "Maps"],
    tags: ["production", "mobile", "community", "security", "maps"],
    proof: [
      "LinkedIn confirms Software Engineer internship at Hey, Blue! for 2 years 3 months.",
      "Resume cites crash fix, verification, map data visualization, and 500+ connections.",
    ],
    gradient: ["#38bdf8", "#1d4ed8"],
  },
  {
    slug: "freeyt-navio",
    title: "FreeYT + Navio",
    kind: "Privacy utility extensions",
    tier: "Tools",
    score: 78,
    visibility: "Public",
    repoUrl: "https://github.com/rishabhcli/FreeYT",
    liveUrl: null,
    timeline: "Spring 2026",
    outcome: "FreeYT has 3 GitHub stars; Navio has 1.",
    summary:
      "Local-first Safari extensions: one redirects YouTube through no-cookie embeds, another routes Google Maps links into Apple Maps.",
    why:
      "They show native-platform taste and privacy instincts, but should support the main story rather than dominate it.",
    stack: ["Swift", "Safari Web Extensions", "JavaScript", "MV3", "SwiftUI"],
    tags: ["Safari", "privacy", "iOS", "macOS", "extension"],
    proof: [
      "FreeYT README documents no accounts, no analytics, shared app-group state, and redirect coverage.",
      "Navio README documents Google Maps to Apple Maps conversion and zero data storage.",
    ],
    gradient: ["#f472b6", "#22d3ee"],
  },
  {
    slug: "admitly",
    title: "Admitly",
    kind: "Admissions operating system",
    tier: "Tools",
    score: 80,
    visibility: "Private",
    repoUrl: null,
    liveUrl: null,
    timeline: "2026",
    outcome: "B2B-shaped college admissions platform with AI observability and multi-tenant staff workflows.",
    summary:
      "A Next.js product for schools, counselors, students, and parents with AI counselor workflows, RBAC, audit logs, scoring, and staff operations.",
    why:
      "It is valuable as a product-systems example, especially for AI governance and operational depth, but less tied to a public hackathon proof loop.",
    stack: ["Next.js 15", "React 19", "Postgres", "Drizzle", "Auth.js", "Codex GPT-5.5"],
    tags: ["edtech", "AI safety", "multi-tenant", "RBAC", "staff console"],
    proof: [
      "Private README describes tenant-scoped access, AI run logging, safety scanning, staff copilots, and eval fixtures.",
    ],
    gradient: ["#c084fc", "#22c55e"],
  },
  {
    slug: "stockpulse",
    title: "StockPulse",
    kind: "Market scoring app",
    tier: "Archive",
    score: 67,
    visibility: "Public/private variants",
    repoUrl: "https://github.com/rishabhcli/StockPulse",
    liveUrl: "https://stockpulse26.vercel.app",
    timeline: "Daytona Hack Sprint, 2026",
    outcome: "Algorithmic market prediction app.",
    summary:
      "A stock and ETF analysis tool with a 1-100 investment score, indicators, fundamentals, sentiment, and screener endpoints.",
    why:
      "Useful supporting evidence for market-data interest, but the project family has duplicate repos and should not outrank the agent systems.",
    stack: ["Python", "Flask", "Technical indicators", "Docker", "Daytona"],
    tags: ["finance", "market data", "prediction", "Python", "analytics"],
    proof: [
      "README documents technical analysis, fundamentals, sentiment, screener, and deployment files.",
    ],
    gradient: ["#4ade80", "#f97316"],
  },
];

const archiveNotes = [
  {
    name: "losaltoshacks",
    reason: "README still reads as a Palantir OSDK pilot template; keep only if rebuilt into the MarketPulse story.",
  },
  {
    name: "ai-memory-hackathon",
    reason: "Mostly the provided Cognee/Qdrant hackathon scaffold; promote FairValue instead.",
  },
  {
    name: "qagent-live-pr-smoke-*",
    reason: "Useful internal proof, not a visitor-facing project.",
  },
  {
    name: "stockpulse/daytona duplicates",
    reason: "One consolidated StockPulse story is enough.",
  },
  {
    name: "personal-web / personal-tech",
    reason: "Supporting domains; the .dev command center should point outward, not advertise its scaffolding.",
  },
];

const domains = [
  { label: "rishabhb.dev", url: "https://rishabhb.dev", role: "main command center" },
  { label: "rishabhb.me", url: "https://rishabhb.me", role: "traditional portfolio/resume" },
  { label: "rishabhb.tech", url: "https://www.rishabhb.tech", role: "technical/tools side" },
  { label: "GitHub profile", url: "https://github.com/rishabhcli", role: "repo graph" },
];

const internalChecks = [
  { label: "Home page", url: "/", role: "internal route" },
  { label: "Project API", url: "/api/projects", role: "internal data" },
  { label: "Graph API", url: "/api/graph", role: "knowledge graph" },
  { label: "QAgent case study", url: "/api/case-study/qagent", role: "case engine" },
  { label: "QAgent SVG preview", url: "/api/og/qagent.svg", role: "artifact preview" },
];

const liveDemoChecks = projects
  .filter((project) => project.liveUrl)
  .slice(0, 4)
  .map((project) => ({
    label: `${project.title} demo`,
    url: project.liveUrl,
    role: "live project demo",
  }));

const profile = {
  name: "Rishabh Bansal",
  email: "rishabh.rb@icloud.com",
  location: "Fremont, CA",
  linkedin: "https://www.linkedin.com/in/rb-rishabh/",
  github: "https://github.com/rishabhcli",
  headline: "Incoming @ UIUC | 4x hackathon winner",
  education: [
    "American High School, Class of 2026",
    "University of Illinois Urbana-Champaign, Class of 2030, Information Sciences + Data Science + Computer Science",
  ],
  proof: [
    "First Place, Alameda Hacks: AnchorMesh.",
    "Best Use of BrowserBase, WeaveHacks: QAgent.",
    "First Place, Cognee AI-Memory Hackathon: FairValue.",
    "Best Use of InsForge, Who Is the Agent Master Hackathon: MasterBuild.",
    "First place at Alameda County Science and Engineering Fair and Stem4All.",
    "COSITE 2025 research publication and provisional utility patent accepted.",
  ],
};

const db = buildIndex();

function buildIndex() {
  if (!sqlite) return null;
  try {
    const instance = new sqlite.DatabaseSync(":memory:");
    instance.exec(`
      CREATE TABLE projects (
        slug TEXT PRIMARY KEY,
        title TEXT,
        kind TEXT,
        tier TEXT,
        summary TEXT,
        why TEXT,
        outcome TEXT,
        stack TEXT,
        tags TEXT,
        score INTEGER
      );
      CREATE VIRTUAL TABLE project_fts USING fts5(
        slug UNINDEXED,
        title,
        kind,
        tier,
        summary,
        why,
        outcome,
        stack,
        tags
      );
    `);
    const insertProject = instance.prepare(`
      INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSearch = instance.prepare(`
      INSERT INTO project_fts(slug, title, kind, tier, summary, why, outcome, stack, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const project of projects) {
      const stack = project.stack.join(", ");
      const tags = project.tags.join(", ");
      insertProject.run(
        project.slug,
        project.title,
        project.kind,
        project.tier,
        project.summary,
        project.why,
        project.outcome,
        stack,
        tags,
        project.score,
      );
      insertSearch.run(
        project.slug,
        project.title,
        project.kind,
        project.tier,
        project.summary,
        project.why,
        project.outcome,
        stack,
        tags,
      );
    }
    return instance;
  } catch (error) {
    console.warn("SQLite index unavailable; falling back to JS ranking.", error.message);
    return null;
  }
}

function json(res, body, status = 200) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function svg(res, body) {
  res.writeHead(200, {
    ...securityHeaders,
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  });
  res.end(body);
}

function notFound(res) {
  json(res, { error: "Not found" }, 404);
}

function getBody(req, maxBytes = 64_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
      req.destroy();
    };
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        fail(error);
      }
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(body);
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function tokenize(query) {
  return String(query || "")
    .toLowerCase()
    .match(/[a-z0-9+#.]+/g) || [];
}

function rankProjects(query, limit = 6) {
  const terms = tokenize(query);
  if (!terms.length) {
    return projects
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((project) => withSearchExplanation(project, terms));
  }

  if (db) {
    try {
      const match = terms.map((term) => `${term.replace(/"/g, "")}*`).join(" OR ");
      const rows = db
        .prepare(
          `SELECT slug, bm25(project_fts, 7.0, 4.0, 2.5, 3.5, 3.0, 2.5, 1.2, 2.0) AS rank
           FROM project_fts
           WHERE project_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(match, limit);
      if (rows.length) {
        const bySlug = new Map(projects.map((project) => [project.slug, project]));
        return rows.map((row) => withSearchExplanation({ ...bySlug.get(row.slug), rank: row.rank }, terms));
      }
    } catch {
      // Fall through to deterministic JS ranking.
    }
  }

  return projects
    .map((project) => {
      const haystack = [
        project.title,
        project.kind,
        project.tier,
        project.summary,
        project.why,
        project.outcome,
        project.stack.join(" "),
        project.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      const hits = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
      const tierBoost = project.tier === "Hero" ? 14 : project.tier === "Strong" ? 8 : 2;
      return { ...project, rank: hits * 24 + tierBoost + project.score / 10 };
    })
    .filter((project) => project.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map((project) => withSearchExplanation(project, terms));
}

function withSearchExplanation(project, terms) {
  if (!terms.length) {
    return { ...project, explanation: `Ranked by proof score (${project.score}/100) and portfolio tier.` };
  }
  const fields = {
    title: project.title,
    kind: project.kind,
    outcome: project.outcome,
    stack: project.stack.join(" "),
    tags: project.tags.join(" "),
    summary: project.summary,
  };
  const matchedFields = Object.entries(fields)
    .filter(([, value]) => terms.some((term) => String(value).toLowerCase().includes(term)))
    .map(([field]) => field);
  const uniqueFields = [...new Set(matchedFields)].slice(0, 3);
  return {
    ...project,
    explanation: uniqueFields.length
      ? `Matches ${terms.join(", ")} in ${uniqueFields.join(", ")}; signal ${project.score}/100.`
      : `Closest proof match by tier and signal score (${project.score}/100).`,
  };
}

function buildGuideAnswer(query) {
  const normalized = String(query || "").toLowerCase();
  const results =
    /\b(actual|actually|ship|shipped|built|proof|recruiter)\b/.test(normalized)
      ? projects
          .filter((project) => project.tier === "Hero" || project.tier === "Strong")
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
      : rankProjects(query, 5);
  if (!results.length) {
    return {
      query,
      answer:
        "I did not find a tight match. The best default path is AnchorMesh, QAgent, FlowPR, FairValue, and SmartCane because they combine awards, technical depth, and clear outcomes.",
      results: rankProjects("", 5),
    };
  }
  const lead = results[0];
  const otherTitles = results
    .slice(1, 4)
    .map((project) => project.title)
    .join(", ");
  return {
    query,
    answer: `${lead.title} is the strongest match: ${lead.summary} ${lead.outcome} ${
      otherTitles ? `Also inspect ${otherTitles}.` : ""
    }`,
    results,
  };
}

function graphPayload() {
  const skillNodes = new Map();
  for (const project of projects) {
    for (const tag of project.tags.slice(0, 4)) {
      skillNodes.set(tag, { id: `skill-${slugify(tag)}`, label: tag, type: "skill" });
    }
  }
  const nodes = [
    { id: "rishabh", label: "Rishabh", type: "person", score: 100 },
    ...projects.map((project) => ({
      id: project.slug,
      label: project.title,
      type: "project",
      score: project.score,
      tier: project.tier,
      gradient: project.gradient,
    })),
    ...domains.map((domain) => ({
      id: `domain-${slugify(domain.label)}`,
      label: domain.label,
      type: "domain",
      url: domain.url,
    })),
    ...skillNodes.values(),
    { id: "uiuc", label: "UIUC 2030", type: "education" },
    { id: "ap-stats", label: "AP Stats", type: "course" },
    { id: "openclaw", label: "OpenClaw", type: "system" },
  ];

  const edges = [
    ...projects.map((project) => ({ source: "rishabh", target: project.slug, weight: project.score })),
    ...projects.flatMap((project) =>
      project.tags.slice(0, 3).map((tag) => ({
        source: project.slug,
        target: `skill-${slugify(tag)}`,
        weight: Math.max(20, project.score - 20),
      })),
    ),
    { source: "rishabh", target: "uiuc", weight: 80 },
    { source: "rishabh", target: "ap-stats", weight: 55 },
    { source: "rishabh", target: "openclaw", weight: 70 },
    { source: "flowpr", target: "domain-rishabhbtech", weight: 45 },
    { source: "admitly", target: "domain-rishabhbme", weight: 45 },
    { source: "anchormesh", target: "domain-rishabhbdev", weight: 50 },
  ];
  return { nodes, edges };
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
}

function caseStudy(slug) {
  const project = projects.find((item) => item.slug === slug) || projects[0];
  const primaryLink = project.repoUrl || project.liveUrl || "Private or local evidence only";
  return {
    ...project,
    sections: [
      {
        title: "Problem",
        body: project.why,
      },
      {
        title: "Stakes",
        body: `${project.title} matters because the outcome is concrete: ${project.outcome}`,
      },
      {
        title: "Constraints",
        body: `Visibility is ${project.visibility}. The public page only claims what can be supported by the project record, public links, or existing portfolio copy.`,
      },
      {
        title: "Architecture",
        body: `${project.title} uses ${project.stack.slice(0, 5).join(", ")}${
          project.stack.length > 5 ? ", and more" : ""
        }.`,
      },
      {
        title: "Rishabh's contribution",
        body: `The portfolio positions this as proof of ${project.tags.slice(0, 4).join(", ")} through shipped product work, not as a decorative resume bullet.`,
      },
      {
        title: "Proof",
        body: `${project.outcome} ${project.proof[0] || ""}`,
      },
      {
        title: "Evidence trail",
        body: project.proof.join(" "),
      },
      {
        title: "Link or artifact",
        body: primaryLink,
      },
      {
        title: "Website role",
        body:
          project.tier === "Hero"
            ? "Lead with this in the main command center because it combines technical depth and public signal."
            : project.tier === "Archive"
              ? "Keep this in the archive or supporting lane unless it gets a tighter demo and clearer differentiation."
              : "Use this as supporting proof after the hero projects establish the pattern.",
      },
      {
        title: "Best audience",
        body: audienceFor(project),
      },
    ],
  };
}

function audienceFor(project) {
  const text = `${project.kind} ${project.tags.join(" ")}`.toLowerCase();
  if (/agent|browser|qa|pr|sandbox|automation/.test(text)) return "Recruiters and engineering teams evaluating agent infrastructure or developer tools.";
  if (/civic|mesh|first responder|mobile|community/.test(text)) return "Public-interest software teams, civic technologists, and mobile engineers.";
  if (/hardware|research|assistive|paper|bluetooth/.test(text)) return "Research mentors, hardware teams, accessibility groups, and applied science reviewers.";
  if (/market|finance|real estate|shopping/.test(text)) return "Product teams looking for market mechanics, ranking systems, and real-time data work.";
  return "Recruiters, collaborators, and technical reviewers who want a fast proof path.";
}

function terminal(command) {
  const raw = String(command || "").trim();
  const [name, ...args] = raw.split(/\s+/);
  const normalized = (name || "help").toLowerCase();
  const help = "Commands: help, whoami, projects, proof, contact, open <slug>, why <slug>, stack <slug>, compare <slug-a> <slug-b>, timeline, fit recruiter|agent-infra|civic-tech|research, status, random";
  if (normalized === "help") {
    return help;
  }
  if (normalized === "whoami") {
    return `${profile.name}. ${profile.headline}. Builder of agentic QA systems, civic/mobile tools, assistive hardware, and market-data experiments.`;
  }
  if (normalized === "projects") {
    return projects
      .filter((project) => project.tier !== "Archive")
      .slice(0, 9)
      .map((project) => `${project.title} :: ${project.kind}`)
      .join("\n");
  }
  if (normalized === "domains") {
    return domains.map((domain) => `${domain.label} -> ${domain.role} (${domain.url})`).join("\n");
  }
  if (normalized === "shiplog") {
    return timelineLines().join("\n");
  }
  if (normalized === "timeline") {
    return timelineLines().join("\n");
  }
  if (normalized === "status") {
    return [
      "Status checks cover internal routes, configured domains, live demos, and the GitHub profile.",
      ...domains.map((domain) => `${domain.label} :: ${domain.role}`),
    ].join("\n");
  }
  if (normalized === "fit") {
    const intent = args.join(" ") || "recruiter";
    return buildGuideAnswer(intent).results
      .slice(0, 4)
      .map((project) => `${project.title} :: ${project.explanation || project.outcome}`)
      .join("\n");
  }
  if (normalized === "random") {
    const project = projects[Math.floor(Math.random() * projects.length)];
    return `${project.title} :: ${project.summary}`;
  }
  if (normalized === "why") {
    const project = findProject(args[0]);
    if (!project) return `No project named "${args[0] || ""}". Try: why qagent`;
    return `${project.title}: ${project.why}`;
  }
  if (normalized === "stack") {
    const project = findProject(args[0]);
    if (!project) return `No project named "${args[0] || ""}". Try: stack qagent`;
    return `${project.title}: ${project.stack.join(", ")}`;
  }
  if (normalized === "compare") {
    const left = findProject(args[0]);
    const right = findProject(args[1]);
    if (!left || !right) return "Compare needs two known slugs. Try: compare qagent flowpr";
    return [
      `${left.title} (${left.score}) :: ${left.kind}`,
      `${right.title} (${right.score}) :: ${right.kind}`,
      left.score >= right.score
        ? `${left.title} is the stronger lead proof; ${right.title} is the supporting comparator.`
        : `${right.title} is the stronger lead proof; ${left.title} is the supporting comparator.`,
    ].join("\n");
  }
  if (normalized === "proof") {
    return profile.proof.join("\n");
  }
  if (normalized === "contact") {
    return `${profile.email}\n${profile.linkedin}\n${profile.github}`;
  }
  if (normalized === "open") {
    const slug = args[0];
    const project = findProject(slug);
    if (!project) return `No project named "${slug || ""}". Try: open qagent`;
    return project.repoUrl || project.liveUrl || `${project.title} is currently private; open the case study instead.`;
  }
  return help;
}

function timelineLines() {
  return [
    "2026-05 :: rishabhb.dev command center rewrite",
    "2026-04 :: FlowPR/QAgent polish, live QA proof loops",
    "2026-03 :: MasterBuild, RePro, ReFind, FairValue, ImmiFile run",
    "2025-10 :: SmartCane research, patent, COSITE publication track",
    "2024-07 :: Hey, Blue! production software work begins",
  ];
}

function findProject(slug) {
  return projects.find((item) => item.slug === slug);
}

async function statusPayload(baseUrl) {
  const targets = [
    ...(baseUrl ? internalChecks : []),
    ...domains,
    ...liveDemoChecks,
  ];
  const checks = await Promise.all(targets.map((target) => checkTarget(target, baseUrl)));
  return {
    checkedAt: new Date().toISOString(),
    checks,
  };
}

async function checkTarget(target, baseUrl) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  const url = baseUrl ? new URL(target.url, baseUrl).toString() : target.url;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "RishabhCommandCenter/1.0" },
    });
    return {
      ...target,
      url,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ...target,
      url,
      ok: false,
      status: "offline",
      ms: Date.now() - started,
      detail: error.name === "AbortError" ? "timeout" : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function thumbnail(slug) {
  const project = projects.find((item) => item.slug === slug) || projects[0];
  const [a, b] = project.gradient;
  const title = escapeXml(project.title);
  const kind = escapeXml(project.kind);
  const tags = escapeXml(project.tags.slice(0, 3).join(" / "));
  const score = escapeXml(String(project.score));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760" role="img" aria-label="${title} preview">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="${a}" offset="0"/>
      <stop stop-color="${b}" offset="1"/>
    </linearGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="760" fill="#090d14"/>
  <rect width="1200" height="760" fill="url(#grid)" opacity=".75"/>
  <path d="M0 620 C240 500 360 730 590 560 C800 405 950 285 1200 360 L1200 760 L0 760 Z" fill="url(#g)" opacity=".42"/>
  <rect x="70" y="74" width="1060" height="612" rx="24" fill="rgba(11,17,27,.78)" stroke="rgba(255,255,255,.2)"/>
  <circle cx="112" cy="116" r="12" fill="#ef4444"/>
  <circle cx="150" cy="116" r="12" fill="#f59e0b"/>
  <circle cx="188" cy="116" r="12" fill="#22c55e"/>
  <text x="70" y="52" fill="rgba(255,255,255,.5)" font-family="IBM Plex Mono, monospace" font-size="22">rishabhb.dev / projects / ${escapeXml(slug)}</text>
  <text x="110" y="252" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="82" font-weight="900">${title}</text>
  <text x="114" y="314" fill="rgba(248,250,252,.72)" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="600">${kind}</text>
  <text x="114" y="414" fill="rgba(248,250,252,.72)" font-family="IBM Plex Mono, monospace" font-size="24">${tags}</text>
  <rect x="114" y="492" width="210" height="88" rx="14" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.16)"/>
  <text x="140" y="528" fill="rgba(255,255,255,.56)" font-family="IBM Plex Mono, monospace" font-size="18">SIGNAL</text>
  <text x="140" y="568" fill="#fff" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="900">${score}/100</text>
  <path d="M793 212 l146 84 v168 l-146 84 l-146-84 v-168 z" fill="none" stroke="url(#g)" stroke-width="5"/>
  <circle cx="793" cy="380" r="86" fill="url(#g)" opacity=".85"/>
  <path d="M735 380 h116 M793 322 v116" stroke="#081016" stroke-width="14" stroke-linecap="round"/>
</svg>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function serveStatic(req, res, pathname) {
  const route = pathname === "/" ? "/index.html" : pathname;
  let filePath;
  if (route === "/three-runtime" || route === "/vendor/three.module.js") {
    filePath = path.join(root, "node_modules", "three", "build", "three.module.js");
  } else if (route === "/app-runtime") {
    filePath = path.join(root, "command-center.mjs");
  } else {
    if (!publicStaticRoutes.has(route)) {
      notFound(res);
      return;
    }
    const relativeRoute = route.replace(/^\/+/, "");
    filePath = path.resolve(root, relativeRoute);
  }

  const relativePath = path.relative(root, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || !existsSync(filePath)) {
    notFound(res);
    return;
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    notFound(res);
    return;
  }

  const ext = route === "/three-runtime" || route === "/app-runtime" ? ".js" : path.extname(filePath);
  const contentType =
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    }[ext] || "application/octet-stream";

  res.writeHead(200, {
    ...securityHeaders,
    "Content-Type": contentType,
    "Cache-Control": route.startsWith("/vendor/") ? "public, max-age=31536000" : "no-cache",
  });
  createReadStream(filePath).pipe(res);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/projects") {
      json(res, { projects, profile, archiveNotes });
      return;
    }

    if (pathname === "/api/search") {
      json(res, { results: rankProjects(url.searchParams.get("q"), 8) });
      return;
    }

    if (pathname === "/api/guide") {
      json(res, buildGuideAnswer(url.searchParams.get("q")));
      return;
    }

    if (pathname === "/api/graph") {
      json(res, graphPayload());
      return;
    }

    if (pathname.startsWith("/api/case-study/")) {
      json(res, caseStudy(pathname.split("/").pop()));
      return;
    }

    if (pathname === "/api/status") {
      json(res, await statusPayload(`${url.protocol}//${url.host}`));
      return;
    }

    if (pathname === "/api/terminal" && req.method === "POST") {
      const body = await getBody(req);
      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        json(res, { error: "Invalid JSON" }, 400);
        return;
      }
      json(res, { command: parsed.command || "", output: terminal(parsed.command) });
      return;
    }

    if (pathname.startsWith("/api/og/") && pathname.endsWith(".svg")) {
      svg(res, thumbnail(path.basename(pathname, ".svg")));
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error(error);
    json(res, { error: status >= 500 ? "Internal server error" : error.message }, status);
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Rishabh Command Center running at http://localhost:${port}`);
});
