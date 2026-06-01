const backlogThemes = [
  {
    id: "evidence-graph",
    label: "Evidence graph depth",
    verbs: ["normalize", "cross-link", "score", "quarantine", "summarize"],
    acceptance: "Adds one verifiable relationship, confidence rule, or projection guard to the evidence graph.",
  },
  {
    id: "artifact-museum",
    label: "Artifact museum",
    verbs: ["capture", "index", "compare", "annotate", "replay"],
    acceptance: "Adds or validates one public-safe artifact type, screenshot, transcript, replay, or gap record.",
  },
  {
    id: "private-chief-of-staff",
    label: "Private chief of staff",
    verbs: ["prioritize", "track", "draft", "review", "schedule"],
    acceptance: "Improves local/private planning without exposing private documents or sending anything automatically.",
  },
  {
    id: "opportunity-engine",
    label: "Opportunity engine",
    verbs: ["rank", "source", "score", "package", "de-risk"],
    acceptance: "Improves opportunity fit, requirements, missing proof, effort, or upside from public-safe evidence.",
  },
  {
    id: "runtime-truth",
    label: "Runtime truth",
    verbs: ["fingerprint", "verify", "diff", "record", "explain"],
    acceptance: "Adds a local or deploy-aware truth check with a receipt, API surface, or terminal explanation.",
  },
  {
    id: "design-system",
    label: "Design ambition",
    verbs: ["polish", "compress", "navigate", "adapt", "stabilize"],
    acceptance: "Improves dense, accessible, mobile-safe, keyboard-first UI without hiding uncertainty.",
  },
  {
    id: "research-evaluation",
    label: "Research-grade evaluation",
    verbs: ["benchmark", "audit", "sample", "stress", "grade"],
    acceptance: "Adds a repeatable evaluation for truthfulness, usability, performance, accessibility, or proof quality.",
  },
  {
    id: "narrative-intelligence",
    label: "Narrative intelligence",
    verbs: ["ground", "sequence", "contrast", "tailor", "disclose"],
    acceptance: "Generates or validates narrative output from evidence with uncertainty and repair guidance.",
  },
];

const sharedAcceptanceCriteria = [
  "Includes a public-safe API, command, script, validator, test, receipt, or documented blocker.",
  "Records evidence in .codex-maygoals-progress.md before moving to the next wave.",
];
const sharedSafetyBoundary = "No credentials, private documents, production writes, external submissions, or unsupported claims may be introduced.";
const sharedVerificationCommands = ["npm run check", "npm run verify"];

function buildWaveBacklog() {
  const waves = [];
  for (let number = 41; number <= 400; number += 1) {
    const theme = backlogThemes[(number - 41) % backlogThemes.length];
    const verb = theme.verbs[Math.floor((number - 41) / backlogThemes.length) % theme.verbs.length];
    const phase = Math.floor((number - 41) / backlogThemes.length) + 1;
    waves.push({
      number,
      id: `wave-${number}-${theme.id}-${verb}`,
      title: `Wave ${number}: ${capitalize(verb)} ${theme.label.toLowerCase()} phase ${phase}`,
      theme: theme.id,
      verb,
      phase,
      rationale: `Derived after completing the first 40 maygoals implementation waves. This continues the ${theme.label} pillar without assuming external credentials or private data access.`,
      acceptanceCriteria: [theme.acceptance, ...sharedAcceptanceCriteria],
      safetyBoundary: sharedSafetyBoundary,
      verificationCommands: sharedVerificationCommands,
      dependsOn: number === 41 ? ["wave-40-change-history"] : [`wave-${number - 1}`],
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    mode: "derived-maygoals-wave-backlog",
    sourceBoundary:
      "This backlog is generated from the implemented wave patterns after item 40. It is a planning artifact, not a claim that the 360 future waves are already complete.",
    range: { start: 41, end: 400, count: waves.length },
    themes: backlogThemes.map(({ id, label, acceptance }) => ({ id, label, acceptance })),
    waves,
  };
}

function buildWaveBacklogIndex(catalog = buildWaveBacklog(), { detail = "index" } = {}) {
  if (detail === "summary") return buildWaveBacklogSummary(catalog);

  return {
    generatedAt: catalog.generatedAt,
    mode: catalog.mode,
    detail: "index",
    compact: true,
    fullDetailEndpoint: "/api/waves/:number",
    sourceBoundary: catalog.sourceBoundary,
    range: catalog.range,
    themes: catalog.themes,
    sharedAcceptanceCriteria,
    sharedSafetyBoundary,
    sharedVerificationCommands,
    waveFields: ["number", "theme", "verb", "phase", "detailEndpoint"],
    detailEndpointTemplate: "/api/waves/:number",
    waves: catalog.waves.map(({ number, theme, verb, phase }) => ({
      number,
      theme,
      verb,
      phase,
      detailEndpoint: `/api/waves/${number}`,
    })),
    nextAction: "Use /api/waves/:number for full rationale, acceptance criteria, safety boundary, and verification commands for a specific wave.",
  };
}

function buildWaveBacklogSummary(catalog = buildWaveBacklog()) {
  const phaseCount = Math.max(...catalog.waves.map((wave) => wave.phase));
  const previewLimit = 5;
  return {
    mode: catalog.mode,
    detail: "summary",
    compact: true,
    fullIndexEndpoint: "/api/waves?detail=full-index",
    fullDetailEndpoint: "/api/waves/:number",
    sourceBoundaryAvailable: Boolean(catalog.sourceBoundary),
    range: catalog.range,
    themeCount: catalog.themes.length,
    phaseCount,
    themeIds: catalog.themes.map(({ id }) => id),
    waveFields: ["number", "theme", "verb", "phase", "detailEndpoint"],
    wavePreview: catalog.waves.slice(0, previewLimit).map(({ number, theme, verb, phase }) => ({
      number,
      theme,
      verb,
      phase,
      detailEndpoint: `/api/waves/${number}`,
    })),
  };
}

function selectWave(value, catalog) {
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  return catalog.waves.find((wave) => wave.number === number) || null;
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

module.exports = {
  buildWaveBacklogIndex,
  buildWaveBacklog,
  buildWaveBacklogSummary,
  selectWave,
};
