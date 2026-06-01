const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/narrative-sequence";
const STORE_RELATIVE_PATH = path.join("var", "narrative-sequence-receipts.json");
const maxReceipts = 50;
const historyWindowCache = new Map();

function narrativeSequencePlan() {
  return {
    mode: "evidence-narrative-sequence-plan",
    command: "npm run sequence:narratives",
    endpoint: ENDPOINT,
    supportedAudiences: ["recruiter", "professor", "founder"],
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing audience packets, grounded narratives, contrast guidance, objections, tailored variants, disclosures, proof quality, or route/refresh coverage.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe narrative sequencing endpoints, writes a local receipt under var/, and does not publish copy, send outreach, submit applications, approve private artifacts, collect analytics, or contact third parties.",
  };
}

function buildNarrativeSequenceReport({
  narratives,
  contrastReport,
  objectionReport,
  tailorReport,
  disclosureReport,
  packets,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const packetMap = new Map((packets.packets || []).map((packet) => [packet.id, packet]));
  const switchboardMap = new Map((contrastReport.switchboard || []).map((entry) => [entry.id, entry]));
  const objectionMap = new Map((objectionReport.audiences || []).map((audience) => [audience.id, audience]));
  const tailorMap = new Map((tailorReport.audiences || []).map((audience) => [audience.id, audience]));
  const disclosureMap = new Map((disclosureReport.bundles || []).map((bundle) => [bundle.id, bundle]));
  const sequences = (narratives.narratives || []).map((narrative) =>
    audienceSequence({
      narrative,
      packet: packetMap.get(narrative.id),
      switchboard: switchboardMap.get(narrative.id),
      objections: objectionMap.get(narrative.id),
      tailoring: tailorMap.get(narrative.id),
      disclosure: disclosureMap.get(narrative.id),
    }),
  );
  const checks = reportChecks({ sequences, routeManifest, refreshPlan, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore([
    ...sequences.map((sequence) => ({ score: sequence.score, weight: 1.2 })),
    ...checks.map((check) => ({ score: check.passed ? 100 : 0, weight: check.severity === "high" ? 1.4 : 1 })),
  ]);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-narrative-sequence",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report sequences only public-safe narrative outputs already modeled by the app: audience packets, grounded narratives, contrast guidance, objections, tailored variants, disclosure bundles, claim IDs, artifact IDs, and caveats. It does not infer recipient interest, interviews, admissions, funding, hiring, applications, or private document contents.",
    sideEffectBoundary:
      "This endpoint reads public-safe in-memory reports and local receipt history only. It does not publish narrative copy, send outreach, submit applications, approve private artifacts, enable private routes, collect analytics, or contact third parties.",
    plan: narrativeSequencePlan(),
    sequenceContract: narrativeSequenceContract(),
    summary: {
      score,
      band: bandFor(score),
      audiences: sequences.length,
      totalBeats: sequences.reduce((sum, sequence) => sum + sequence.beats.length, 0),
      averageSequenceScore: average(sequences.map((sequence) => sequence.score)),
      highRiskSequences: sequences.filter((sequence) => sequence.riskLevel === "high").length,
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      routeCovered: requiredRoutes().every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      latestReceiptId: latestReceipt?.id || null,
    },
    sequences,
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
    nonClaims: narrativeSequenceNonClaims(),
    nextAction:
      failing[0]?.repairAction ||
      sequences.find((sequence) => sequence.nextAction)?.nextAction ||
      "Narrative sequencing is public-safe and ordered; rerun after packet, narrative, objection, tailor, disclosure, or proof changes.",
    verificationCommand: "npm run sequence:narratives && npm run check && npm run verify",
  };
}

function buildNarrativeSequenceReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-narrative-sequence-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "evidence-narrative-sequence" ||
    !report.summary ||
    !report.sequenceContract ||
    !Array.isArray(report.sequences) ||
    !report.sequences.every(
      (sequence) =>
        sequence.id &&
        sequence.label &&
        Array.isArray(sequence.beats) &&
        sequence.beats.length >= 7 &&
        sequence.beats.every((beat) => beat.id && beat.text && Array.isArray(beat.evidenceIds) && beat.evidenceIds.length && beat.verificationCommand) &&
        Array.isArray(sequence.checks) &&
        sequence.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand) &&
        sequence.verificationCommand,
    ) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand) ||
    !Array.isArray(report.repairQueue) ||
    !Array.isArray(report.nonClaims) ||
    !report.nextAction ||
    !report.verificationCommand
  ) {
    return null;
  }

  const sequences = report.sequences.map((sequence) => ({
    ...sequence,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}/${sequence.id}?refresh=1`,
    checkedAt: receipt.checkedAt || null,
    beats: (sequence.beats || []).map((beat) => ({
      ...beat,
      evidenceIds: beat.evidenceIds || [`cached.sequence.${sequence.id}.${beat.id || "beat"}`],
      claimsUsed: beat.claimsUsed || [],
      artifactsUsed: beat.artifactsUsed || [],
      caveats: beat.caveats || [],
      repairGuidance: beat.repairGuidance || [],
      manualUseBoundary: beat.manualUseBoundary || "Manual review required before external use.",
      verificationCommand: beat.verificationCommand || "npm run sequence:narratives",
      passed: typeof beat.passed === "boolean" ? beat.passed : true,
    })),
    checks: (sequence.checks || []).map(cachedCheck),
    verificationCommand: sequence.verificationCommand || `npm run sequence:narratives && node server.js # then open /api/narrative-sequence/${sequence.id}`,
  }));
  const checks = (report.checks || []).map(cachedCheck);
  const failing = checks.filter((check) => !check.passed);

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "evidence-narrative-sequence",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs narrative sequencing from the latest local receipt. It is a fast public-safe cached report, not approval to publish, send outreach, submit applications, or infer external outcomes.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || narrativeSequencePlan().sideEffectBoundary,
    plan: narrativeSequencePlan(),
    sequenceContract: report.sequenceContract || narrativeSequenceContract(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    sequences,
    checks,
    repairQueue:
      report.repairQueue ||
      failing.map((check) => ({
        id: check.id,
        priority: check.severity,
        action: check.repairAction,
        verificationCommand: check.verificationCommand,
      })),
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passing: receipt.summary?.passing || 0,
      checks: receipt.summary?.checks || checks.length,
    },
    nonClaims: report.nonClaims || narrativeSequenceNonClaims(),
    nextAction:
      report.nextAction ||
      failing[0]?.repairAction ||
      sequences.find((sequence) => sequence.nextAction)?.nextAction ||
      "Narrative sequencing is served from the latest local receipt; run npm run sequence:narratives or ?refresh=1 after packet, narrative, objection, tailor, disclosure, or proof changes.",
    verificationCommand: report.verificationCommand || "npm run sequence:narratives && npm run check && npm run verify",
  };
}

function selectNarrativeSequence(value, report) {
  const normalized = normalizeAudience(value);
  return (report.sequences || []).find((sequence) => sequence.id === normalized || sequence.audience.toLowerCase() === normalized) || null;
}

function buildNarrativeSequenceResponse(report, { detail = "summary" } = {}) {
  const fullDetail = detail === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      summaryEndpoint: ENDPOINT,
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    detail: "summary",
    compact: true,
    refreshEndpoint: report.refreshEndpoint || `${ENDPOINT}?refresh=1`,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeNarrativeSequenceSummary(report.summary),
    sequences: (report.sequences || []).map(summarizeNarrativeSequence),
    checks: selectNarrativeSequenceCheckPreview(report.checks || []).map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
    })),
    nonClaimCount: (report.nonClaims || []).length,
  };
}

function buildNarrativeSequenceAudienceResponse(sequence, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "summary").toLowerCase() === "full";
  const fullDetailEndpoint = `${ENDPOINT}/${sequence.id}?detail=full`;
  if (fullDetail) {
    return {
      ...sequence,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      summaryEndpoint: ENDPOINT,
    };
  }

  const beats = sequence.beats || [];
  const checks = sequence.checks || [];
  return {
    id: sequence.id,
    label: sequence.label,
    audience: sequence.audience,
    detail: "summary",
    compact: true,
    cachedFromReceipt: Boolean(sequence.cachedFromReceipt),
    refreshEndpoint: sequence.refreshEndpoint || `${ENDPOINT}/${sequence.id}?refresh=1`,
    fullDetailEndpoint,
    sourceBoundaryAvailable: true,
    summary: summarizeNarrativeSequenceAudienceSummary({ sequence, beats, checks }),
    beats: beats.map(summarizeNarrativeSequenceAudienceBeat),
    checks: selectNarrativeSequenceAudienceCheckPreview(checks).map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
      verificationCommandAvailable: Boolean(check.verificationCommand),
    })),
    nextActionAvailable: Boolean(sequence.nextAction),
    verificationCommandAvailable: Boolean(sequence.verificationCommand),
    narrativeSequenceAudiencePayloadPolicy: {
      fullDetail: false,
      beatsReturned: beats.length,
      checksReturned: selectNarrativeSequenceAudienceCheckPreview(checks).length,
      totalChecks: checks.length,
      fullDetailAvailable: true,
      omittedFromSummaryCount: 10,
    },
  };
}

function appendNarrativeSequenceReceipt(root, receipt) {
  const receipts = readNarrativeSequenceReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function buildNarrativeSequenceHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "evidence-narrative-sequence-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary:
      fullDetail
        ? "This endpoint returns full local narrative-sequence receipts. It does not publish copy, send outreach, submit applications, approve private artifacts, collect analytics, or contact third parties."
        : undefined,
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local narrative sequence receipts only. It does not publish copy, send outreach, submit applications, approve private artifacts, collect analytics, or contact third parties."
        : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          fullDetail,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
        }
      : {
          fullDetail,
          historyRowsReturned: limited.length,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
    },
    definitions: undefined,
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeNarrativeSequenceReceipt(receipt, { includeDetail: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Narrative sequence history is available; run npm run sequence:narratives after packet, narrative, objection, tailor, disclosure, or proof changes."
        : "Run npm run sequence:narratives to create narrative sequence history."
      : undefined,
    nextActionAvailable: undefined,
    verificationCommand: fullDetail ? "npm run sequence:narratives && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: undefined,
  };
}

function readNarrativeSequenceReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readNarrativeSequenceHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readNarrativeSequenceReceipts(root);
    const window = {
      receipts: receipts.slice(0, boundedLimit),
      totalAvailable: receipts.length,
    };
    historyWindowCache.set(storePath, { cacheKey, window });
    return window;
  } catch {
    return { receipts: [], totalAvailable: 0 };
  }
}

function summarizeNarrativeSequenceReceipt(receipt, { includeDetail = true } = {}) {
  const report = receipt.report || {};
  const sequences = sequencesWithBeats(receipt.sequences) || sequencesWithBeats(report.sequences) || receipt.sequences || report.sequences || [];
  const checks = receipt.checks || report.checks || [];
  const nonClaims = receipt.nonClaims || report.nonClaims || [];
  const summary = summarizeNarrativeSequenceSummary(receipt.summary || report.summary);
  const historySummary = summarizeNarrativeSequenceHistoryReceiptSummary(summary);
  if (!includeDetail) {
    return {
      id: receipt.id,
      trendSummary: historySummary,
    };
  }

  const failedChecks = checks.filter((check) => !check.passed).slice(0, 6);
  const compact = {
    id: receipt.id,
    summary: historySummary,
    sequences: sequences.map(summarizeNarrativeSequenceHistorySequence),
  };
  if (failedChecks.length) {
    compact.checkPreview = failedChecks.map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
    }));
  }
  if (!sequences.length && nonClaims.length) compact.nonClaimCount = nonClaims.length;
  return compact;
}

function sequencesWithBeats(value) {
  return Array.isArray(value) && value.some((sequence) => Array.isArray(sequence.beats) && sequence.beats.length) ? value : null;
}

function summarizeAudienceSequence(sequence) {
  const beats = sequence.beats || [];
  const checks = sequence.checks || [];
  return {
    id: sequence.id,
    label: sequence.label,
    audience: sequence.audience,
    score: sequence.score || 0,
    band: sequence.band || "unknown",
    riskLevel: sequence.riskLevel || "unknown",
    beatCount: sequence.beatCount || beats.length,
    leadFrameCount: sequence.leadFrame?.length || 0,
    primaryDisclosure: sequence.primaryDisclosure || null,
    beats: beats.map((beat) => ({
      order: beat.order,
      id: beat.id,
      stage: beat.stage,
      passed: Boolean(beat.passed),
      evidenceCount: beat.evidenceIds?.length || 0,
      claimCount: beat.claimsUsed?.length || 0,
      artifactCount: beat.artifactsUsed?.length || 0,
      caveatCount: beat.caveats?.length || 0,
      mustDiscloseCount: beat.mustDisclose?.length || 0,
      repairGuidanceCount: beat.repairGuidance?.length || 0,
      verificationCommand: beat.verificationCommand,
    })),
    checks: checks.map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
      severity: check.severity,
      detail: check.passed ? undefined : check.detail,
      verificationCommand: check.verificationCommand,
    })),
    verificationCommand: sequence.verificationCommand,
  };
}

function summarizeNarrativeSequenceAudienceBeat(beat) {
  return {
    id: beat.id,
    stage: beat.stage,
    evidenceCount: beat.evidenceIds?.length || 0,
    textAvailable: Boolean(beat.text),
    manualUseBoundaryAvailable: Boolean(beat.manualUseBoundary),
  };
}

function summarizeNarrativeSequenceAudienceSummary({ sequence, beats, checks }) {
  return {
    score: sequence.score || 0,
    band: sequence.band || "unknown",
    riskLevel: sequence.riskLevel || "unknown",
    beatCount: sequence.beatCount || beats.length,
    evidenceReferenceCount: beats.reduce((sum, beat) => sum + (beat.evidenceIds?.length || 0), 0),
    checks: checks.length,
    passing: checks.filter((check) => check.passed).length,
    failing: checks.filter((check) => !check.passed).length,
  };
}

function selectNarrativeSequenceAudienceCheckPreview(checks = []) {
  const required = new Set(["beat-depth", "evidence-grounding", "disclosure-before-action", "objection-before-tailor"]);
  const selected = [];
  const seen = new Set();
  const add = (check) => {
    if (!check || seen.has(check.id) || selected.length >= 4) return;
    seen.add(check.id);
    selected.push(check);
  };
  checks.filter((check) => !check.passed || required.has(check.id)).forEach(add);
  checks.filter((check) => check.severity === "high").forEach(add);
  checks.forEach(add);
  return selected;
}

function summarizeNarrativeSequence(sequence) {
  const beats = sequence.beats || [];
  return {
    id: sequence.id,
    audience: sequence.audience,
    score: sequence.score || 0,
    beatCount: sequence.beatCount || beats.length,
    beatPreview: beats.map((beat) => ({
      evidenceCount: beat.evidenceIds?.length || 0,
    })),
    verificationCommandAvailable: Boolean(sequence.verificationCommand),
  };
}

function selectNarrativeSequenceCheckPreview(checks) {
  const seen = new Set();
  const selected = checks.filter((check) => {
    const keep = !check.passed || check.severity === "high" || check.id === "script-coverage";
    if (!keep || seen.has(check.id)) return false;
    seen.add(check.id);
    return true;
  });
  return selected.slice(0, 2);
}

function summarizeNarrativeSequenceHistorySequence(sequence) {
  const beats = sequence.beats || [];
  return {
    id: sequence.id,
    beatCount: sequence.beatCount || beats.length,
    evidenceReferenceCount: beats.reduce((sum, beat) => sum + (beat.evidenceIds?.length || 0), 0),
  };
}

function summarizeNarrativeSequenceSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    audiences: summary.audiences || 0,
    totalBeats: summary.totalBeats || 0,
    failing: summary.failing || 0,
  };
}

function summarizeNarrativeSequenceHistoryReceiptSummary(summary = {}) {
  const compact = {
    score: summary.score || 0,
    totalBeats: summary.totalBeats || 0,
  };
  if (summary.failing) compact.failing = summary.failing;
  return compact;
}

function summarizeSequenceContract(contract = {}) {
  return {
    orderingRuleAvailable: Boolean(contract.orderingRule),
    safetyRuleAvailable: Boolean(contract.safetyRule),
    evidenceRuleAvailable: Boolean(contract.evidenceRule),
  };
}

function audienceSequence({ narrative, packet, switchboard, objections, tailoring, disclosure }) {
  const beats = sequenceBeats({ narrative, packet, switchboard, objections, tailoring, disclosure });
  const checks = sequenceChecks({ beats, narrative, packet, objections, tailoring, disclosure });
  const score = weightedScore([
    { score: narrative.groundingScore || 0, weight: 1.2 },
    { score: tailoring?.score || 0, weight: 1 },
    { score: disclosure?.score || 0, weight: 1 },
    { score: objections?.answerabilityScore || 0, weight: 0.8 },
    ...checks.map((check) => ({ score: check.passed ? 100 : 0, weight: check.severity === "high" ? 1.3 : 1 })),
  ]);
  const failing = checks.filter((check) => !check.passed);
  const riskLevel = score >= 85 ? "low" : score >= 70 ? "medium" : "high";

  return {
    id: narrative.id,
    label: narrative.label,
    audience: narrative.audience,
    decisionQuestion: packet?.decisionQuestion || narrative.decisionQuestion,
    thesis: narrative.thesis,
    score,
    band: bandFor(score),
    riskLevel,
    beatCount: beats.length,
    leadFrame: switchboard?.emphasize || [],
    primaryDisclosure: disclosure?.mustDisclose?.[0] || narrative.uncertaintyDisclosure?.noExternalInference || null,
    beats,
    checks,
    nextAction:
      failing[0]?.repairAction ||
      disclosure?.repairGuidance?.[0] ||
      packet?.nextActions?.[0] ||
      `Review the ${narrative.audience} sequence manually before use.`,
    verificationCommand: `npm run sequence:narratives && node server.js # then open /api/narrative-sequence/${narrative.id}`,
  };
}

function sequenceBeats({ narrative, packet, switchboard, objections, tailoring, disclosure }) {
  const topObjection = topObjectionFor(objections);
  const proofVariant = (tailoring?.variants || []).find((variant) => variant.id === "proof-first") || (tailoring?.variants || [])[0];
  const caveatVariant = (tailoring?.variants || []).find((variant) => variant.id === "caveat-forward") || proofVariant;
  const askVariant = (tailoring?.variants || []).find((variant) => variant.id === "ask-ready-draft") || proofVariant;
  const firstTrail = narrative.sourceTrail?.[0] || {};
  const manualBoundary = askVariant?.manualUseBoundary || packet?.draftOnlyOutreach?.sendPolicy || "Manual review required before use.";
  const baseCommand = `npm run check && node server.js # then open /api/narrative-sequence/${narrative.id}`;

  return [
    beat({
      order: 1,
      id: "lead-thesis",
      label: "Lead thesis",
      stage: "orient",
      text: narrative.thesis,
      evidenceIds: [`narrative.${narrative.id}`, `packet.${narrative.id}`],
      claimsUsed: narrative.claimsUsed.slice(0, 2),
      artifactsUsed: narrative.artifactsUsed.slice(0, 2),
      caveats: (narrative.uncertaintyDisclosure?.caveats || []).slice(0, 1),
      repairGuidance: narrative.repairActions?.slice(0, 1) || [],
      manualUseBoundary: "Draft-only narrative orientation.",
      verificationCommand: baseCommand,
    }),
    beat({
      order: 2,
      id: "proof-path",
      label: "Proof path",
      stage: "prove",
      text: firstTrail.title ? `Use ${firstTrail.title} first, then show claim and artifact IDs before broader biography.` : "Use the strongest source trail before broader biography.",
      evidenceIds: orderedUnique([...(firstTrail.claimIds || []), ...(firstTrail.artifactIds || []), `sourceTrail.${narrative.id}`]),
      claimsUsed: (firstTrail.claimIds || narrative.claimsUsed).slice(0, 4),
      artifactsUsed: (firstTrail.artifactIds || narrative.artifactsUsed).slice(0, 4),
      caveats: firstTrail.caveats || [],
      repairGuidance: narrative.repairActions?.slice(0, 2) || [],
      manualUseBoundary: "Proof must stay attached to inspectable public-safe IDs.",
      verificationCommand: baseCommand,
    }),
    beat({
      order: 3,
      id: "audience-contrast",
      label: "Audience contrast",
      stage: "differentiate",
      text: switchboard ? `Emphasize ${switchboard.emphasize.slice(0, 3).join(", ")}; avoid ${switchboard.avoid.slice(0, 2).join(", ")}.` : "Keep the audience frame distinct before drafting.",
      evidenceIds: [`contrast.switchboard.${narrative.id}`],
      claimsUsed: narrative.claimsUsed.slice(0, 2),
      artifactsUsed: narrative.artifactsUsed.slice(0, 2),
      caveats: switchboard?.disclose || [],
      repairGuidance: switchboard?.avoid || [],
      manualUseBoundary: "Audience framing is guidance, not an external outcome prediction.",
      verificationCommand: baseCommand,
    }),
    beat({
      order: 4,
      id: "objection-pressure",
      label: "Objection pressure",
      stage: "pressure-test",
      text: topObjection ? `${topObjection.challenge} ${topObjection.answer}` : "Hold the sequence until objection coverage is generated.",
      evidenceIds: orderedUnique([`objection.${narrative.id}.${topObjection?.id || "missing"}`, ...(topObjection?.evidence || [])]),
      claimsUsed: (topObjection?.evidence || []).filter((item) => String(item).startsWith("claim-")).slice(0, 3),
      artifactsUsed: (topObjection?.evidence || []).filter((item) => String(item).startsWith("artifact-")).slice(0, 3),
      caveats: topObjection?.caveats || [],
      repairGuidance: topObjection?.repairAction ? [topObjection.repairAction] : [],
      manualUseBoundary: "Objections must be visible before any audience-facing draft.",
      verificationCommand: baseCommand,
    }),
    beat({
      order: 5,
      id: "disclosure-gate",
      label: "Disclosure gate",
      stage: "disclose",
      text: disclosure ? disclosure.mustDisclose.slice(0, 3).join(" ") : narrative.uncertaintyDisclosure?.noExternalInference || "Disclose uncertainty before action.",
      evidenceIds: [`disclosure.${narrative.id}`],
      claimsUsed: disclosure?.evidenceGrounding?.claimsUsed?.slice(0, 3) || narrative.claimsUsed.slice(0, 3),
      artifactsUsed: disclosure?.evidenceGrounding?.artifactsUsed?.slice(0, 3) || narrative.artifactsUsed.slice(0, 3),
      caveats: disclosure?.mustDisclose || [],
      mustDisclose: disclosure?.mustDisclose || narrative.uncertaintyDisclosure?.caveats || [],
      repairGuidance: disclosure?.repairGuidance?.slice(0, 3) || narrative.repairActions?.slice(0, 3) || [],
      manualUseBoundary: disclosure?.safeUse || "Manual review required before external use.",
      verificationCommand: baseCommand,
    }),
    beat({
      order: 6,
      id: "tailored-draft",
      label: "Tailored draft",
      stage: "draft",
      text: proofVariant?.body || caveatVariant?.body || narrative.thesis,
      evidenceIds: [`tailor.${narrative.id}.${proofVariant?.id || "missing"}`],
      claimsUsed: proofVariant?.claimsUsed || narrative.claimsUsed.slice(0, 4),
      artifactsUsed: proofVariant?.artifactsUsed || narrative.artifactsUsed.slice(0, 4),
      caveats: orderedUnique([...(proofVariant?.caveats || []), ...(caveatVariant?.caveats || [])]).slice(0, 4),
      repairGuidance: orderedUnique([...(proofVariant?.repairGuidance || []), tailoring?.nextAction]).slice(0, 4),
      manualUseBoundary: proofVariant?.manualUseBoundary || manualBoundary,
      verificationCommand: baseCommand,
    }),
    beat({
      order: 7,
      id: "manual-next-step",
      label: "Manual next step",
      stage: "act",
      text: packet?.nextActions?.[0] || disclosure?.safeUse || "Review manually before use.",
      evidenceIds: [`packet.${narrative.id}.nextActions`, `manualBoundary.${narrative.id}`],
      claimsUsed: askVariant?.claimsUsed || narrative.claimsUsed.slice(0, 2),
      artifactsUsed: askVariant?.artifactsUsed || narrative.artifactsUsed.slice(0, 2),
      caveats: orderedUnique([...(askVariant?.caveats || []), disclosure?.safeUse]).filter(Boolean).slice(0, 4),
      repairGuidance: orderedUnique([...(askVariant?.repairGuidance || []), disclosure?.repairGuidance?.[0], packet?.nextActions?.[0]]).slice(0, 4),
      manualUseBoundary: manualBoundary,
      verificationCommand: baseCommand,
    }),
  ];
}

function beat({
  order,
  id,
  label,
  stage,
  text,
  evidenceIds,
  claimsUsed = [],
  artifactsUsed = [],
  caveats = [],
  mustDisclose = [],
  repairGuidance = [],
  manualUseBoundary,
  verificationCommand,
}) {
  const normalizedEvidence = orderedUnique(evidenceIds || []);
  const normalizedClaims = orderedUnique(claimsUsed || []);
  const normalizedArtifacts = orderedUnique(artifactsUsed || []);
  return {
    order,
    id,
    label,
    stage,
    text,
    evidenceIds: normalizedEvidence,
    claimsUsed: normalizedClaims,
    artifactsUsed: normalizedArtifacts,
    caveats: orderedUnique(caveats || []).slice(0, 5),
    mustDisclose: orderedUnique(mustDisclose || []).slice(0, 6),
    repairGuidance: orderedUnique(repairGuidance || []).slice(0, 5),
    manualUseBoundary,
    verificationCommand,
    passed: Boolean(text && normalizedEvidence.length && verificationCommand),
  };
}

function sequenceChecks({ beats, narrative, packet, objections, tailoring, disclosure }) {
  const beatIndex = (id) => beats.findIndex((beat) => beat.id === id);
  const disclosureIndex = beatIndex("disclosure-gate");
  const draftIndex = beatIndex("tailored-draft");
  const actionIndex = beatIndex("manual-next-step");
  const objectionIndex = beatIndex("objection-pressure");
  return [
    check("beat-depth", beats.length >= 7, "high", `${beats.length} sequence beat(s).`, "Keep seven ordered narrative beats for thesis, proof, contrast, objection, disclosure, draft, and action."),
    check("evidence-grounding", beats.every((beat) => beat.passed), "high", `${beats.filter((beat) => beat.passed).length}/${beats.length} beat(s) have evidence IDs and verification commands.`, "Attach evidence IDs and verification commands to every sequence beat."),
    check("proof-before-action", beatIndex("proof-path") > -1 && beatIndex("proof-path") < actionIndex, "high", "Proof path must precede the manual action beat.", "Move proof before any action-oriented draft or next step."),
    check(
      "disclosure-before-action",
      disclosureIndex > -1 && disclosureIndex < draftIndex && disclosureIndex < actionIndex && /never send|draft-only|manual/i.test(beats[actionIndex]?.manualUseBoundary || ""),
      "high",
      `disclosure=${disclosureIndex + 1}; draft=${draftIndex + 1}; action=${actionIndex + 1}; boundary=${beats[actionIndex]?.manualUseBoundary || "missing"}.`,
      "Put disclosure and manual-use boundaries before draft/action beats.",
    ),
    check("objection-before-tailor", objectionIndex > -1 && objectionIndex < draftIndex && (objections?.objections || []).length >= 5, "medium", `${objections?.objections?.length || 0} objection(s); objection beat ${objectionIndex + 1}; draft beat ${draftIndex + 1}.`, "Pressure-test the narrative before using tailored variants."),
    check("claim-artifact-coverage", narrative.claimsUsed.length > 0 && narrative.artifactsUsed.length > 0 && beats.some((beat) => beat.claimsUsed.length && beat.artifactsUsed.length), "high", `${narrative.claimsUsed.length} claim(s), ${narrative.artifactsUsed.length} artifact(s).`, "Keep claim and artifact IDs attached to the sequence."),
    check("disclosure-depth", (disclosure?.mustDisclose || []).length >= 3 && beats.filter((beat) => beat.caveats.length || beat.mustDisclose.length).length >= 4, "medium", `${disclosure?.mustDisclose?.length || 0} must-disclose item(s).`, "Keep caveats visible across multiple beats."),
    check("tailor-depth", (tailoring?.variants || []).length >= 3 && /never send|draft-only/i.test(packet?.draftOnlyOutreach?.sendPolicy || ""), "medium", `${tailoring?.variants?.length || 0} tailored variant(s).`, "Keep all tailored drafts manual-only."),
  ];
}

function reportChecks({ sequences, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const scripts = packageManifest.scripts || {};
  return [
    reportCheck("audience-coverage", ["recruiter", "professor", "founder"].every((id) => sequences.some((sequence) => sequence.id === id)), "high", `${sequences.length} audience sequence(s).`, "Generate narrative sequences for recruiter, professor, and founder.", "npm run sequence:narratives"),
    reportCheck("sequence-depth", sequences.every((sequence) => sequence.beatCount >= 7), "high", `${sequences.reduce((sum, sequence) => sum + sequence.beatCount, 0)} total beat(s).`, "Keep each audience sequence at seven beats or more.", "npm run sequence:narratives"),
    reportCheck("beat-grounding", sequences.every((sequence) => sequence.beats.every((beat) => beat.passed)), "high", "Every sequence beat needs evidence IDs and verification commands.", "Repair ungrounded sequence beats.", "npm run sequence:narratives"),
    reportCheck("disclosure-ordering", sequences.every((sequence) => sequence.checks.find((check) => check.id === "disclosure-before-action")?.passed), "high", "Disclosure gates must appear before tailored drafts and manual next steps.", "Move caveats and manual-use boundaries before action beats.", "npm run sequence:narratives"),
    reportCheck("objection-tailor-coherence", sequences.every((sequence) => sequence.checks.find((check) => check.id === "objection-before-tailor")?.passed), "medium", "Objections should precede tailored drafts.", "Regenerate objection and tailor reports before sequencing.", "npm run tailor:narratives && npm run disclose:narratives"),
    reportCheck("route-manifest", requiredRoutes().every((route) => publicRoutes.includes(route)), "high", `${requiredRoutes().filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes().length} narrative sequence route(s) declared.`, "Add narrative sequence report, audience, plan, and history routes to runtimeRouteManifest.", "npm run record:runtime-surface"),
    reportCheck("refresh-plan", refreshEndpoints.includes(ENDPOINT), "medium", `${ENDPOINT} ${refreshEndpoints.includes(ENDPOINT) ? "covered" : "missing"} in refresh plan.`, "Add narrative sequence to the safe evidence refresh plan.", "npm run refresh:evidence"),
    reportCheck("script-coverage", Boolean(scripts["sequence:narratives"]), "medium", `sequence:narratives=${Boolean(scripts["sequence:narratives"])}`, "Add the sequence:narratives package script.", "npm run sequence:narratives"),
  ];
}

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: "npm run sequence:narratives",
  };
}

function reportCheck(id, passed, severity, detail, repairAction, verificationCommand) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function cachedCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || "Cached narrative sequence check.",
    repairAction: check.repairAction || (check.passed ? "No cached narrative sequence repair needed." : "Refresh narrative sequence and repair the failing cached check."),
    verificationCommand: check.verificationCommand || "npm run sequence:narratives",
  };
}

function narrativeSequenceContract() {
  return {
    orderingRule:
      "Each audience sequence must move from thesis to proof, contrast, objection pressure, disclosure, tailored draft, and manual action in that order.",
    safetyRule:
      "Disclosure and manual-use boundaries must appear before any action-oriented draft or next step.",
    evidenceRule:
      "Every beat must expose evidence IDs, verification commands, and repair guidance or caveats where the beat could be overread.",
  };
}

function narrativeSequenceNonClaims() {
  return [
    "Does not approve copy for automatic sending, publishing, applications, submissions, or outreach.",
    "Does not infer external recipient interest, admissions, funding, interviews, hiring, or application outcomes.",
    "Does not convert private references into public artifacts or read private cockpit data.",
    "Does not replace manual review before external use.",
  ];
}

function topObjectionFor(objections) {
  return (objections?.objections || [])
    .slice()
    .sort((left, right) => Number(right.mustDisclose) - Number(left.mustDisclose) || severityRank(right.riskLevel) - severityRank(left.riskLevel) || right.answerabilityScore - left.answerabilityScore)[0];
}

function requiredRoutes() {
  return [ENDPOINT, `${ENDPOINT}/:audience`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`];
}

function normalizeAudience(value) {
  const normalized = String(value || "").toLowerCase().trim();
  if (["prof", "research", "academic", "professor"].includes(normalized)) return "professor";
  if (["startup", "builder", "founder"].includes(normalized)) return "founder";
  if (["recruiting", "recruiter", "hiring"].includes(normalized)) return "recruiter";
  return normalized;
}

function severityRank(value) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function weightedScore(items) {
  const valid = items.filter((item) => Number.isFinite(item.score) && Number.isFinite(item.weight) && item.weight > 0);
  const max = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!max) return 0;
  return clamp(Math.round(valid.reduce((sum, item) => sum + item.score * item.weight, 0) / max), 0, 100);
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 5, 50));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

module.exports = {
  appendNarrativeSequenceReceipt,
  buildNarrativeSequenceHistory,
  buildNarrativeSequenceAudienceResponse,
  buildNarrativeSequenceReportFromReceipt,
  buildNarrativeSequenceReport,
  buildNarrativeSequenceResponse,
  narrativeSequencePlan,
  readNarrativeSequenceHistoryWindow,
  readNarrativeSequenceReceipts,
  selectNarrativeSequence,
};
