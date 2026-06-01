// Source-of-truth portfolio records for the command center.
// Keep this module data-only; behavior belongs in server.js or dedicated model modules.

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

module.exports = {
  projects,
  archiveNotes,
  domains,
  internalChecks,
  liveDemoChecks,
  profile,
};
