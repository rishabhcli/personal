const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/narrative-contrast";
const STORE_RELATIVE_PATH = path.join("var", "narrative-contrast-receipts.json");
const NARRATIVE_CONTRAST_PREVIEW_LIMIT = 1;
const NARRATIVE_SWITCHBOARD_PREVIEW_LIMIT = 2;
const maxReceipts = 50;

const audiencePairs = [
  ["recruiter", "professor"],
  ["recruiter", "founder"],
  ["professor", "founder"],
];

function narrativeContrastPlan() {
  return {
    mode: "evidence-narrative-contrast-plan",
    command: "npm run contrast:narratives",
    endpoint: ENDPOINT,
    supportedContrasts: audiencePairs.map(([left, right]) => `${left}-vs-${right}`),
    supportedAudiences: ["recruiter", "professor", "founder"],
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing audience packets, grounded narratives, opportunity archetypes, claim IDs, artifact IDs, caveats, route coverage, or refresh coverage.",
    sideEffectBoundary:
      "The narrative contrast recorder starts a temporary local server, reads public-safe contrast endpoints, writes a local receipt under var/, and does not publish copy, send outreach, submit applications, approve private artifacts, collect analytics, infer external interest, or contact third parties.",
  };
}

function buildNarrativeContrastReport({
  narratives,
  packets,
  opportunities,
  routeManifest = {},
  refreshPlan = {},
  packageManifest = {},
  receipts = [],
}) {
  const narrativeMap = new Map((narratives.narratives || []).map((narrative) => [narrative.id, narrative]));
  const packetMap = new Map((packets.packets || []).map((packet) => [packet.id, packet]));
  const contrasts = audiencePairs
    .map(([left, right]) => contrastPair({ left: narrativeMap.get(left), right: narrativeMap.get(right), packets: packetMap, opportunities }))
    .filter(Boolean);
  const switchboard = [...narrativeMap.values()].map((narrative) => audienceSwitch(narrative, packetMap.get(narrative.id), opportunities));
  const checks = contrastChecks({
    narratives: [...narrativeMap.values()],
    contrasts,
    switchboard,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = checks.filter((item) => !item.passed);
  const score = scoreChecks(checks);
  const latestReceipt = receipts[0] || null;
  const plan = narrativeContrastPlan();

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-narrative-contrast-report",
    sourceBoundary:
      "This report compares only generated public-safe narratives, audience packets, opportunity archetypes, claim IDs, artifact IDs, and caveats. It does not infer hiring, admissions, funding, research acceptance, recipient interest, applications, or private document contents.",
    sideEffectBoundary: plan.sideEffectBoundary,
    plan,
    methodology: {
      pairPolicy: "Generate all recruiter/professor/founder pairwise contrasts and a switchboard for individual audience pivots.",
      separationPolicy: "Score audience separation by unique claims, unique artifacts, confidence differences, and shared-claim pressure.",
      repairPolicy: "Every failing report check must produce a concrete repair action and verification command.",
      receiptCommand: plan.command,
    },
    summary: {
      audiences: narrativeMap.size,
      contrasts: contrasts.length,
      switchboardEntries: switchboard.length,
      averageSeparationScore: average(contrasts.map((item) => item.separationScore)),
      checks: checks.length,
      passing: checks.filter((item) => item.passed).length,
      failing: failing.length,
      highRiskFailures: failing.filter((item) => item.severity === "high").length,
      score,
      band: bandFor(score),
      routeCovered: requiredRoutes().every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      scriptCovered: Boolean((packageManifest.scripts || {})["contrast:narratives"]),
      latestReceiptId: latestReceipt?.id || null,
    },
    rules: [
      "Every audience needs a distinct lead frame.",
      "Shared claims are allowed, but the reason for using them must differ by audience.",
      "Private, stale, weak, or under-sourced evidence must remain caveated.",
      "No narrative may claim external decisions, outcomes, applications, funding, admissions, or recipient interest.",
    ],
    contrasts,
    switchboard,
    checks,
    repairQueue: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    nonClaims: [
      "Does not approve narrative copy for automatic sending, publication, applications, submissions, or outreach.",
      "Does not infer hiring, admissions, funding, interviews, external recipient interest, or application outcomes.",
      "Does not read private cockpit data or convert private references into public artifacts.",
      "Does not replace manual review before any external use.",
    ],
    nextAction:
      failing[0]?.repairAction ||
      "Narrative contrast is public-safe and route-backed; rerun after packet, narrative, opportunity, caveat, refresh, or route changes.",
    verificationCommand: "npm run contrast:narratives && npm run check && npm run verify",
  };
}

function buildNarrativeContrastResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      detailPolicy: {
        detail: "full",
        fullDetail: true,
        compactEndpoint: ENDPOINT,
      },
    };
  }

  return {
    mode: report.mode,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    detailPolicy: {
      fullDetail: false,
      totalContrasts: report.contrasts?.length || 0,
      totalSwitchboardEntries: report.switchboard?.length || 0,
      contrastPreviewLimit: NARRATIVE_CONTRAST_PREVIEW_LIMIT,
      switchboardPreviewLimit: 1,
    },
    summary: summarizeNarrativeContrastReportSummary(report.summary),
    rulesCount: report.rules?.length || 0,
    contrasts: (report.contrasts || []).slice(0, NARRATIVE_CONTRAST_PREVIEW_LIMIT).map(summarizeNarrativeContrast),
    switchboard: (report.switchboard || []).slice(0, 1).map(summarizeNarrativeSwitchboard),
    checkSummary: summarizeNarrativeContrastChecks(report.checks || []),
    repairQueueCount: (report.repairQueue || []).length,
    nonClaimCount: report.nonClaims?.length || 0,
  };
}

function buildNarrativeContrastDetailResponse(contrast, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = `${ENDPOINT}/${contrast.id}?detail=full`;
  if (fullDetail) {
    return {
      ...contrast,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      detailPolicy: {
        detail: "full",
        fullDetail: true,
        compactEndpoint: `${ENDPOINT}/${contrast.id}`,
      },
    };
  }

  return {
    id: contrast.id,
    audiences: contrast.audiences,
    separationScore: contrast.separationScore,
    band: contrast.band,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    left: summarizeNarrativeContrastSide(contrast.left),
    right: summarizeNarrativeContrastSide(contrast.right),
    sharedClaimCount: contrast.sharedClaims.length,
    uniqueClaimCounts: Object.fromEntries(Object.entries(contrast.uniqueClaims || {}).map(([audience, claims]) => [audience, claims.length])),
    sharedArtifactCount: contrast.sharedArtifacts.length,
    uniqueArtifactCounts: Object.fromEntries(Object.entries(contrast.uniqueArtifacts || {}).map(([audience, artifacts]) => [audience, artifacts.length])),
    contrastGuidanceCount: contrast.contrastGuidance.length,
    disclosureCount: contrast.disclosure.length,
    repairGuidanceCount: contrast.repairGuidance.length,
    verificationCommandAvailable: Boolean(contrast.verificationCommand),
    detailPolicy: {
      detail: "summary",
      fullDetail: false,
      fullDetailEndpoint,
      omittedFromSummaryCount: 8,
    },
  };
}

function summarizeNarrativeContrastPlan(plan = narrativeContrastPlan()) {
  return {
    endpoint: plan.endpoint,
    commandAvailable: Boolean(plan.command),
    supportedContrastCount: plan.supportedContrasts?.length || 0,
    supportedAudienceCount: plan.supportedAudiences?.length || 0,
  };
}

function summarizeNarrativeContrastChecks(checks) {
  return {
    total: checks.length,
    passing: checks.filter((check) => check.passed).length,
    failing: checks.filter((check) => !check.passed).length,
  };
}

function summarizeNarrativeContrastReportSummary(summary = {}) {
  return {
    score: summary.score || 0,
    contrasts: summary.contrasts || 0,
    switchboardEntries: summary.switchboardEntries || 0,
    routeCovered: summary.routeCovered === true,
    refreshCovered: summary.refreshCovered === true,
    scriptCovered: summary.scriptCovered === true,
  };
}

function selectNarrativeContrast(value, report) {
  const normalized = String(value || "").toLowerCase().trim();
  return (report.contrasts || []).find((item) => item.id === normalized || item.audiences.includes(normalized)) || null;
}

function appendNarrativeContrastReceipt(root, receipt) {
  const receipts = readNarrativeContrastReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readNarrativeContrastReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function buildNarrativeContrastHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 5, maxReceipts));
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "evidence-narrative-contrast-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "Full local narrative-contrast receipts. This does not publish copy, send outreach, submit applications, infer external interest, or contact third parties."
      : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: {
      fullDetail,
      fullDetailAvailable: fullDetail ? undefined : true,
      historyRowsReturned: fullDetail ? undefined : limited.length,
      defaultLimit: fullDetail ? 5 : undefined,
      fullDetailEndpoint: fullDetail ? `${ENDPOINT}/history?detail=full` : undefined,
      fullReportEndpoint: fullDetail ? `${ENDPOINT}?detail=full` : undefined,
      olderReceiptPreview: fullDetail ? "raw receipt" : undefined,
    },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      latestCheckedAt: fullDetail ? latest?.checkedAt || null : undefined,
      latestScore: latest?.summary?.score || 0,
      latestChecks: latest?.summary?.checks || 0,
      ...(fullDetail
        ? {
            latestContrasts: latest?.summary?.contrasts || 0,
            latestSwitchboardEntries: latest?.summary?.switchboardEntries || 0,
            latestPassing: latest?.summary?.passing || 0,
          }
        : {}),
    },
    definitions: fullDetail ? undefined : { fullReportEndpoint: `${ENDPOINT}?detail=full` },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeNarrativeContrastReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? latest ? "Narrative contrast history is available; rerun after packet, narrative, route, or refresh changes." : "Run npm run contrast:narratives to create narrative contrast history."
      : undefined,
    verificationCommand: fullDetail ? "npm run contrast:narratives && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeNarrativeContrastReceipt(receipt, { includePreview = false } = {}) {
  const summary = summarizeNarrativeContrastHistorySummary(receipt.summary);
  if (!includePreview) {
    return {
      id: receipt.id,
      score: summary.score,
      band: summary.band,
      checks: summary.checks,
      failing: summary.failing,
    };
  }

  const compact = {
    id: receipt.id,
    ...summary,
  };
  if (includePreview) {
    compact.contrasts = (receipt.contrasts || []).map(({ id, separationScore, band, sharedClaims, sharedArtifacts, repairGuidance }) => ({
      id,
      separationScore,
      band,
      sharedClaims,
      sharedArtifacts,
    }));
    compact.switchboard = (receipt.switchboard || []).map(({ id, disclose }) => ({ id, disclose }));
  }
  return compact;
}

function summarizeNarrativeContrastHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    contrasts: summary.contrasts || 0,
    switchboardEntries: summary.switchboardEntries || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
  };
}

function contrastPair({ left, right, packets, opportunities }) {
  if (!left || !right) return null;
  const leftPacket = packets.get(left.id);
  const rightPacket = packets.get(right.id);
  const sharedClaims = intersection(left.claimsUsed, right.claimsUsed);
  const leftUniqueClaims = difference(left.claimsUsed, right.claimsUsed).slice(0, 8);
  const rightUniqueClaims = difference(right.claimsUsed, left.claimsUsed).slice(0, 8);
  const sharedArtifacts = intersection(left.artifactsUsed, right.artifactsUsed);
  const leftUniqueArtifacts = difference(left.artifactsUsed, right.artifactsUsed).slice(0, 8);
  const rightUniqueArtifacts = difference(right.artifactsUsed, left.artifactsUsed).slice(0, 8);
  const separationScore = clamp(
    Math.round(
      45 +
        (leftUniqueClaims.length + rightUniqueClaims.length) * 3 +
        (leftUniqueArtifacts.length + rightUniqueArtifacts.length) * 2 +
        Math.abs((leftPacket?.uncertaintyDisclosure?.confidenceScore || 0) - (rightPacket?.uncertaintyDisclosure?.confidenceScore || 0)) * 0.4 -
        sharedClaims.length,
    ),
    0,
    100,
  );

  return {
    id: `${left.id}-vs-${right.id}`,
    audiences: [left.id, right.id],
    separationScore,
    band: bandFor(separationScore),
    left: sideSummary(left, leftPacket, opportunities),
    right: sideSummary(right, rightPacket, opportunities),
    sharedClaims,
    uniqueClaims: {
      [left.id]: leftUniqueClaims,
      [right.id]: rightUniqueClaims,
    },
    sharedArtifacts,
    uniqueArtifacts: {
      [left.id]: leftUniqueArtifacts,
      [right.id]: rightUniqueArtifacts,
    },
    contrastGuidance: guidanceFor(left, right, leftPacket, rightPacket),
    disclosure: orderedUnique([
      ...(left.prohibitedOverclaims || []),
      ...(right.prohibitedOverclaims || []),
      left.uncertaintyDisclosure?.noExternalInference,
      right.uncertaintyDisclosure?.noExternalInference,
    ]).slice(0, 6),
    repairGuidance: orderedUnique([...(left.repairActions || []), ...(right.repairActions || [])]).slice(0, 5),
    verificationCommand: `npm run contrast:narratives && node server.js # then open ${ENDPOINT}/${left.id}-vs-${right.id}`,
  };
}

function summarizeNarrativeContrast(contrast) {
  return {
    id: contrast.id,
    separationScore: contrast.separationScore,
    left: summarizeNarrativeContrastSide(contrast.left),
    right: summarizeNarrativeContrastSide(contrast.right),
    disclosureCount: contrast.disclosure.length,
    repairGuidanceCount: contrast.repairGuidance.length,
    detailEndpoint: `${ENDPOINT}/${contrast.id}`,
  };
}

function summarizeNarrativeContrastSide(side = {}) {
  return {
    id: side.id,
    opportunityMatchCount: (side.opportunityMatches || []).length,
    caveatCount: (side.caveats || []).length,
  };
}

function summarizeNarrativeSwitchboard(entry) {
  return {
    id: entry.id,
    emphasizeCount: (entry.emphasize || []).length,
    discloseCount: (entry.disclose || []).length,
    opportunityAngleCount: (entry.bestOpportunityAngles || []).length,
    detailEndpoint: `${ENDPOINT}/${entry.id}`,
  };
}

function sideSummary(narrative, packet, opportunities) {
  const opportunityMatches = (opportunities.opportunities || [])
    .filter((opportunity) => (packet?.generatedFrom?.opportunityIds || []).includes(opportunity.id))
    .map((opportunity) => ({
      id: opportunity.id,
      label: opportunity.label,
      fitScore: opportunity.fitScore,
    }));
  return {
    id: narrative.id,
    label: narrative.label,
    thesis: narrative.thesis,
    confidenceBand: narrative.confidenceBand,
    groundingScore: narrative.groundingScore,
    packetConfidence: packet?.uncertaintyDisclosure?.confidenceScore || 0,
    leadSequence: narrative.sequence?.[0]?.text || narrative.thesis,
    opportunityMatches,
    caveats: packet?.uncertaintyDisclosure?.caveats?.slice(0, 3) || [],
    repairActions: narrative.repairActions?.slice(0, 3) || [],
  };
}

function audienceSwitch(narrative, packet, opportunities) {
  const matches = (opportunities.opportunities || []).filter((opportunity) => (packet?.generatedFrom?.opportunityIds || []).includes(opportunity.id));
  return {
    id: narrative.id,
    label: narrative.label,
    leadWith: narrative.sequence?.[0]?.text || narrative.thesis,
    emphasize: emphasizeFor(narrative.id),
    avoid: avoidFor(narrative.id),
    disclose: (packet?.uncertaintyDisclosure?.caveats || narrative.prohibitedOverclaims || []).slice(0, 3),
    bestOpportunityAngles: matches.slice(0, 3).map((opportunity) => ({
      id: opportunity.id,
      label: opportunity.label,
      angle: opportunity.outreachAngle,
    })),
    verificationCommand: `npm run contrast:narratives && node server.js # then open ${ENDPOINT}`,
  };
}

function contrastChecks({ narratives, contrasts, switchboard, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const scripts = packageManifest.scripts || {};
  return [
    check(
      "audience-coverage",
      ["recruiter", "professor", "founder"].every((id) => narratives.some((narrative) => narrative.id === id)),
      "high",
      `${narratives.length} audience narrative(s) available.`,
      "Generate recruiter, professor, and founder grounded narratives before contrast.",
      "npm run ground:narratives && npm run contrast:narratives",
    ),
    check(
      "pairwise-contrast",
      contrasts.length === audiencePairs.length && contrasts.every((item) => item.separationScore >= 45),
      "high",
      `${contrasts.length}/${audiencePairs.length} pairwise contrast(s) generated.`,
      "Generate all recruiter/professor/founder pairwise contrasts with minimum separation.",
      "npm run contrast:narratives",
    ),
    check(
      "switchboard",
      switchboard.length >= 3 && switchboard.every((item) => item.leadWith && item.disclose.length > 0),
      "high",
      `${switchboard.length} audience switchboard entrie(s).`,
      "Keep a lead frame and disclosure visible for every audience switchboard entry.",
      "npm run contrast:narratives",
    ),
    check(
      "overclaim-disclosure",
      narratives.every((narrative) => (narrative.prohibitedOverclaims || []).length >= 3),
      "high",
      "Every narrative must carry prohibited-overclaim disclosure.",
      "Attach prohibited-overclaim disclosure to every grounded narrative before contrast.",
      "npm run ground:narratives && npm run contrast:narratives",
    ),
    check(
      "repair-guidance",
      narratives.every((narrative) => (narrative.repairActions || []).length > 0) && contrasts.every((item) => item.repairGuidance.length > 0),
      "medium",
      "Every narrative contrast must produce repair guidance.",
      "Attach repair actions to each audience narrative and expose them in each pairwise contrast.",
      "npm run contrast:narratives",
    ),
    check(
      "route-manifest",
      requiredRoutes().every((route) => publicRoutes.includes(route)),
      "high",
      `${requiredRoutes().filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes().length} narrative contrast route(s) declared.`,
      "Add narrative contrast report, selected contrast, plan, and history routes to runtimeRouteManifest.",
      "npm run record:runtime-surface",
    ),
    check(
      "refresh-plan",
      refreshEndpoints.includes(ENDPOINT),
      "medium",
      `${ENDPOINT} ${refreshEndpoints.includes(ENDPOINT) ? "covered" : "missing"} in refresh plan.`,
      "Add narrative contrast to the safe evidence refresh plan.",
      "npm run refresh:evidence",
    ),
    check(
      "script-coverage",
      Boolean(scripts["contrast:narratives"]),
      "medium",
      `contrast:narratives=${Boolean(scripts["contrast:narratives"])}`,
      "Add the contrast:narratives package script.",
      "npm run contrast:narratives",
    ),
  ];
}

function check(id, passed, severity, detail, repairAction, verificationCommand) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function requiredRoutes() {
  return [ENDPOINT, `${ENDPOINT}/:id`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`];
}

function guidanceFor(left, right, leftPacket, rightPacket) {
  return [
    `${left.label}: lead with ${left.sequence?.[0]?.text || left.thesis}`,
    `${right.label}: lead with ${right.sequence?.[0]?.text || right.thesis}`,
    `Do not reuse the same ask: ${left.id} confidence ${leftPacket?.uncertaintyDisclosure?.confidenceScore || 0}/100 vs ${right.id} confidence ${rightPacket?.uncertaintyDisclosure?.confidenceScore || 0}/100.`,
  ];
}

function emphasizeFor(id) {
  if (id === "professor") return ["methodology", "limitations", "research framing", "evidence quality"];
  if (id === "founder") return ["speed", "product judgment", "demo discipline", "collaboration leverage"];
  return ["shipping proof", "technical ownership", "verification receipts", "public-safe artifacts"];
}

function avoidFor(id) {
  if (id === "professor") return ["unsupported deployment impact", "funding likelihood", "admissions probability"];
  if (id === "founder") return ["fake traction", "unverified users", "automatic outreach claims"];
  return ["interview readiness claims", "employment status claims", "private artifacts"];
}

function intersection(left, right) {
  const rightSet = new Set(right || []);
  return orderedUnique((left || []).filter((item) => rightSet.has(item)));
}

function difference(left, right) {
  const rightSet = new Set(right || []);
  return orderedUnique((left || []).filter((item) => !rightSet.has(item)));
}

function orderedUnique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function scoreChecks(checks) {
  if (!checks.length) return 0;
  return Math.round((checks.filter((item) => item.passed).length / checks.length) * 100);
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

module.exports = {
  appendNarrativeContrastReceipt,
  buildNarrativeContrastDetailResponse,
  buildNarrativeContrastHistory,
  buildNarrativeContrastReport,
  buildNarrativeContrastResponse,
  narrativeContrastPlan,
  readNarrativeContrastReceipts,
  selectNarrativeContrast,
};
