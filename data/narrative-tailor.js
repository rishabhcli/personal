const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const TAILOR_ENDPOINT = "/api/narrative-tailor";
const STORE_RELATIVE_PATH = path.join("var", "narrative-tailor-receipts.json");
const AUDIENCE_VARIANT_PREVIEW_LIMIT = 1;
const historyWindowCache = new Map();
const historyResponseCache = new Map();

function narrativeTailorPlan() {
  return {
    mode: "evidence-backed-narrative-tailor-plan",
    command: "npm run tailor:narratives",
    endpoint: TAILOR_ENDPOINT,
    supportedAudiences: ["recruiter", "professor", "founder"],
    scheduleRecommendation: "Run manually after changing claims, artifacts, audience packets, narrative objections, opportunity gates, or stress evaluations.",
    sideEffectBoundary:
      "The narrative tailor runner starts a temporary local server, reads public-safe narrative endpoints, writes a local receipt under var/, and does not send outreach, submit applications, approve private artifacts, publish copy, or contact external services.",
    receiptStore: STORE_RELATIVE_PATH,
  };
}

function readNarrativeTailorReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readNarrativeTailorHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readNarrativeTailorReceipts(root);
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

function appendNarrativeTailorReceipt(root, receipt) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  const receipts = readNarrativeTailorReceipts(root);
  receipts.unshift(receipt);
  writeFileSync(storePath, `${JSON.stringify({ receipts: receipts.slice(0, 50) }, null, 2)}\n`);
  return receipt;
}

function buildNarrativeTailorHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const cacheKey = `${fullDetail ? "full" : "summary"}:${boundedLimit}:${totalAvailable}:${limited.map((receipt) => `${receipt.id}:${receipt.checkedAt || ""}`).join("|")}`;
  const cached = historyResponseCache.get(cacheKey);
  if (cached) return cached;
  const history = {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "evidence-backed-narrative-tailor-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "This endpoint returns full local narrative-tailor receipts. It is not fresh tailoring, outreach approval, application submission, recipient-interest evidence, or private-document review."
      : undefined,
    sideEffectBoundary: fullDetail
      ? "The history endpoint reads local narrative-tailor receipts only. It does not send outreach, submit applications, approve private artifacts, publish copy, or contact external services."
      : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${TAILOR_ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: narrativeTailorHistoryPayloadPolicy({ fullDetail, limited, totalAvailable }),
    summary: summarizeNarrativeTailorHistoryTopline({ latest, limited, totalAvailable, boundedLimit }),
    definitions: fullDetail ? undefined : summarizeNarrativeTailorDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeNarrativeTailorReceipt(receipt, { latest: index === 0 })),
    nextAction: fullDetail
      ? latest
        ? "Narrative-tailor history is available; run npm run tailor:narratives after proof, artifact, opportunity, objection, audience, or stress changes."
        : "Run npm run tailor:narratives to create narrative-tailor history."
      : undefined,
    verificationCommand: fullDetail ? "npm run tailor:narratives && node --test test/api-contract.test.mjs" : undefined,
  };
  historyResponseCache.set(cacheKey, history);
  return history;
}

function narrativeTailorHistoryPayloadPolicy({ fullDetail, limited, totalAvailable }) {
  if (fullDetail) {
    return {
      detail: "full",
      fullDetail: true,
      defaultLimit: 5,
      fullDetailEndpoint: `${TAILOR_ENDPOINT}/history?detail=full`,
      receiptsReturned: limited.length,
      totalAvailable,
    };
  }

  return {
    fullDetail: false,
    receiptsReturned: limited.length,
    fullDetailAvailable: true,
  };
}

function summarizeNarrativeTailorHistoryTopline({ latest, limited, totalAvailable, boundedLimit }) {
  return {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
    latestScore: latest?.summary?.score || 0,
    latestBand: latest?.summary?.band || "unknown",
  };
}

function summarizeNarrativeTailorDefinitions(receipt) {
  const audiences = receipt?.audiences || [];
  const limitations = receipt?.limitations || [];
  const checks = receipt?.checks || [];
  const variants = uniqueById(audiences.flatMap((audience) => (Array.isArray(audience.variants) ? audience.variants : [])));
  return {
    evidenceAccess: {
      fullHistoryEndpoint: `${TAILOR_ENDPOINT}/history?detail=full`,
    },
    limitationSummary: {
      count: limitations.length,
    },
    reportCheckSummary: {
      total: checks.length,
      failing: checks.filter((check) => !check.passed).length,
    },
    variantKindSummary: {
      hasProofFirst: variants.some((variant) => variant.id === "proof-first"),
      count: variants.length,
    },
  };
}

function summarizeNarrativeTailorReceipt(receipt, { latest = false } = {}) {
  const audiences = receipt.audiences || [];
  const checks = receipt.checks || [];
  const repairQueue = receipt.repairQueue || [];
  if (!latest) {
    return {
      id: receipt.id,
      score: receipt.summary?.score || 0,
      variants: receipt.summary?.variants || 0,
      previewOnly: true,
    };
  }
  return {
    id: receipt.id,
    audienceSummary: summarizeTailoredAudienceSet(audiences),
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
    },
    repairQueueSummary: {
      total: repairQueue.length,
    },
    audiences: audiences.map(summarizeTailoredAudience),
  };
}

function summarizeNarrativeTailorSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    audiences: summary.audiences || 0,
    variants: summary.variants || 0,
    manualReadinessBlocked: summary.manualReadinessBlocked || 0,
    localReviewReady: summary.localReviewReady || 0,
    manualRepairPlanItems: summary.manualRepairPlanItems || 0,
  };
}

function summarizeNarrativeTailorTrendSummary(summary = {}) {
  return {
    score: summary.score || 0,
    variants: summary.variants || 0,
  };
}

function summarizeTailoredAudience(audience) {
  const gate = audience.manualReadinessGate || {};
  const variants = Array.isArray(audience.variants) ? audience.variants : [];
  const variantCount = variants.length || Number(audience.variants) || 0;
  const checks = Array.isArray(audience.checks) ? audience.checks : [];
  return {
    id: audience.id,
    variantCount,
    variants: [],
    omittedVariants: Math.max(0, variantCount - 1),
    manualReadinessGate: {
      repairPlanCount: (gate.repairPlan || []).length || audience.manualRepairPlanItems || 0,
    },
  };
}

function summarizeTailoredAudienceSet(audiences) {
  const audienceList = Array.isArray(audiences) ? audiences : [];
  return {
    total: audienceList.length,
    variants: audienceList.reduce((sum, audience) => {
      const variants = Array.isArray(audience.variants) ? audience.variants.length : Number(audience.variants) || 0;
      return sum + variants;
    }, 0),
  };
}

function buildNarrativeTailorReport({
  narratives,
  contrastReport,
  objectionReport,
  packets,
  opportunityBoard,
  researchStress,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const plan = narrativeTailorPlan();
  const audienceReports = (packets.packets || []).map((packet) =>
    tailorAudience({
      packet,
      narrative: selectById(narratives.narratives, packet.id),
      switchboard: selectById(contrastReport.switchboard, packet.id),
      objections: selectById(objectionReport.audiences, packet.id),
      opportunityBoard,
      researchStress,
    }),
  );
  const checks = reportChecks({ audienceReports, routeManifest, refreshPlan, packageManifest, researchStress });
  const manualReadinessScores = audienceReports.map((audience) => audience.manualReadinessGate.score);
  const localReviewReadinessScores = audienceReports.map((audience) => audience.manualReadinessGate.localReviewScore);
  const score = weightedScore([
    ...audienceReports.map((audience) => ({ score: audience.score, weight: 1 })),
    ...manualReadinessScores.map((readinessScore) => ({ score: readinessScore, weight: 1.2 })),
    ...localReviewReadinessScores.map((readinessScore) => ({ score: readinessScore, weight: 0.7 })),
    ...checks.map((check) => ({ score: check.passed ? 100 : 0, weight: check.severity === "high" ? 1.4 : 1 })),
  ]);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-backed-narrative-tailor",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${TAILOR_ENDPOINT}?refresh=1`,
    sourceBoundary:
      "Tailored narratives are generated only from public-safe audience packets, narrative source trails, contrast guidance, objection answers, opportunity gates, and local stress evaluations. They do not infer hiring, admissions, funding, research acceptance, recipient interest, applications, or private document contents.",
    sideEffectBoundary: plan.sideEffectBoundary,
    methodology: {
      variantPolicy: "Each audience receives proof-first, caveat-forward, and ask-ready variants.",
      groundingPolicy: "Every variant must carry claim IDs, artifact IDs, caveats, repair guidance, and a manual-use boundary.",
      bandPolicy: "high >= 85, medium >= 70, low < 70",
      receiptCommand: plan.command,
    },
    summary: {
      score,
      band: bandFor(score),
      audiences: audienceReports.length,
      variants: audienceReports.reduce((sum, audience) => sum + audience.variants.length, 0),
      checks: checks.length,
      passing: checks.filter((check) => check.passed).length,
      highRiskFailures: checks.filter((check) => !check.passed && check.severity === "high").length,
      averageAudienceScore: average(audienceReports.map((audience) => audience.score)),
      averageManualReadinessScore: average(manualReadinessScores),
      averageLocalReviewReadinessScore: average(localReviewReadinessScores),
      manualReadinessReady: audienceReports.filter((audience) => audience.manualReadinessGate.status === "manual-review-ready").length,
      manualReadinessRestricted: audienceReports.filter((audience) => audience.manualReadinessGate.status === "restricted-draft").length,
      manualReadinessBlocked: audienceReports.filter((audience) => audience.manualReadinessGate.status === "repair-before-use").length,
      localReviewReady: audienceReports.filter((audience) => audience.manualReadinessGate.localReviewReady).length,
      localReviewBlocked: audienceReports.filter((audience) => !audience.manualReadinessGate.localReviewReady).length,
      manualRepairPlanItems: audienceReports.reduce((sum, audience) => sum + audience.manualReadinessGate.repairPlan.length, 0),
      routeCovered: (routeManifest.publicApiRoutes || []).includes(TAILOR_ENDPOINT),
      refreshCovered: (refreshPlan.endpoints || []).includes(TAILOR_ENDPOINT),
      latestReceiptId: latestReceipt?.id || null,
    },
    audiences: audienceReports,
    checks,
    repairQueue: repairQueueFor({ audienceReports, checks }),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    limitations: narrativeTailorLimitations(),
    nextAction: nextActionFor({ audienceReports, checks }),
    verificationCommand: "npm run tailor:narratives && npm run check && npm run verify",
  };
}

function buildNarrativeTailorReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-backed-narrative-tailor-receipt" || !receipt.summary) return null;
  if (!Array.isArray(receipt.audiences) || !receipt.audiences.every((audience) => Array.isArray(audience.variants) && audience.manualReadinessGate)) {
    return null;
  }
  const audiences = receipt.audiences.map((audience) => ({
    ...audience,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${TAILOR_ENDPOINT}/${audience.id}?refresh=1`,
    checks: (audience.checks || []).map((check) => ({
      ...check,
      passed: Boolean(check.passed),
      verificationCommand: check.verificationCommand || "npm run tailor:narratives",
    })),
  }));
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    label: check.label || labelFor(check.id),
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || `Cached narrative tailor check from ${receipt.id}.`,
    verificationCommand: check.verificationCommand || "npm run tailor:narratives",
  }));

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "evidence-backed-narrative-tailor",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${TAILOR_ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs tailored narratives from the latest local receipt. It is a fast public-safe cached report, not fresh narrative generation, external validation, outreach approval, application submission, recipient-interest evidence, or private-document review.",
    sideEffectBoundary: receipt.sideEffectBoundary || narrativeTailorPlan().sideEffectBoundary,
    methodology: receipt.methodology || {
      variantPolicy: "Cached audience variants preserve the last recorded proof-first, caveat-forward, and ask-ready drafts.",
      groundingPolicy: "Run npm run tailor:narratives or ?refresh=1 to recompute claim IDs, artifact IDs, caveats, repair guidance, and manual-use boundaries.",
      bandPolicy: "high >= 85, medium >= 70, low < 70",
      receiptCommand: narrativeTailorPlan().command,
    },
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    audiences,
    checks,
    repairQueue: receipt.repairQueue || repairQueueFor({ audienceReports: audiences, checks }),
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passing: receipt.summary?.passing || 0,
      checks: receipt.summary?.checks || checks.length,
    },
    limitations: receipt.limitations || narrativeTailorLimitations(),
    nextAction:
      receipt.nextAction ||
      nextActionFor({ audienceReports: audiences, checks }) ||
      "Narrative tailoring is served from the latest local receipt; run npm run tailor:narratives or ?refresh=1 after proof, artifact, opportunity, objection, or stress changes.",
    verificationCommand: "npm run tailor:narratives && npm run check && npm run verify",
  };
}

function selectNarrativeTailoring(value, report) {
  const normalized = normalizeAudience(value);
  return report.audiences.find((audience) => audience.id === normalized) || null;
}

function buildNarrativeTailorAudienceResponse(audience, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...audience,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${TAILOR_ENDPOINT}/${audience.id}?detail=full`,
    };
  }

  return {
    id: audience.id,
    cachedFromReceipt: Boolean(audience.cachedFromReceipt),
    refreshEndpoint: audience.refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${TAILOR_ENDPOINT}/${audience.id}?detail=full`,
    score: audience.score,
    groundingScore: audience.groundingScore,
    answerabilityScore: audience.answerabilityScore,
    leadFrameCount: (audience.leadFrame || []).length,
    avoidCount: (audience.avoid || []).length,
    variantCount: (audience.variants || []).length,
    variants: (audience.variants || []).slice(0, AUDIENCE_VARIANT_PREVIEW_LIMIT).map(summarizeNarrativeTailorVariantForAudience),
    omittedVariants: Math.max(0, (audience.variants || []).length - AUDIENCE_VARIANT_PREVIEW_LIMIT),
    manualReadinessGate: summarizeManualReadinessGateForAudience(audience.manualReadinessGate),
    checkSummary: {
      total: (audience.checks || []).length,
      passing: (audience.checks || []).filter((check) => check.passed).length,
      failing: (audience.checks || []).filter((check) => !check.passed).length,
    },
    weakestVariant: audience.weakestVariant
      ? {
          id: audience.weakestVariant.id,
          groundingScore: audience.weakestVariant.groundingScore || 0,
        }
      : null,
    narrativeTailorPayloadPolicy: {
      fullDetail: false,
      variantsReturned: Math.min((audience.variants || []).length, AUDIENCE_VARIANT_PREVIEW_LIMIT),
      variantsAvailable: (audience.variants || []).length,
      variantPreviewLimit: AUDIENCE_VARIANT_PREVIEW_LIMIT,
    },
  };
}

function buildNarrativeTailorResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${TAILOR_ENDPOINT}?detail=full`,
      narrativeTailorPayloadPolicy: narrativeTailorPayloadPolicy({ report, fullDetail }),
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${TAILOR_ENDPOINT}?detail=full`,
    summary: summarizeNarrativeTailorResponseSummary(report.summary),
    audiences: (report.audiences || []).map(summarizeNarrativeTailorAudienceForResponse),
    checkSummary: summarizeNarrativeTailorCheckSummary(report.checks || []),
    repairQueueSummary: summarizeNarrativeTailorRepairQueue(report.repairQueue || []),
    narrativeTailorPayloadPolicy: narrativeTailorPayloadPolicy({ report, fullDetail }),
  };
}

function narrativeTailorPayloadPolicy({ report, fullDetail }) {
  if (!fullDetail) {
    return {
      fullDetail: false,
      audiencesReturned: report.audiences?.length || 0,
      variantsAvailable: (report.audiences || []).reduce((sum, audience) => sum + (audience.variants?.length || 0), 0),
      fullDetailAvailable: true,
    };
  }

  return {
    fullDetail: true,
    audiencesReturned: report.audiences?.length || 0,
    variantsReturned: (report.audiences || []).reduce((sum, audience) => sum + (audience.variants?.length || 0), 0),
    variantsAvailable: (report.audiences || []).reduce((sum, audience) => sum + (audience.variants?.length || 0), 0),
    repairQueueReturned: report.repairQueue?.length || 0,
    repairQueueAvailable: report.repairQueue?.length || 0,
    fullDetailEndpoint: `${TAILOR_ENDPOINT}?detail=full`,
  };
}

function summarizeNarrativeTailorResponseSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    audiences: summary.audiences || 0,
    variants: summary.variants || 0,
    averageManualReadinessScore: summary.averageManualReadinessScore || 0,
    averageLocalReviewReadinessScore: summary.averageLocalReviewReadinessScore || 0,
    manualReadinessReady: summary.manualReadinessReady || 0,
    manualReadinessRestricted: summary.manualReadinessRestricted || 0,
    manualReadinessBlocked: summary.manualReadinessBlocked || 0,
    localReviewReady: summary.localReviewReady || 0,
    localReviewBlocked: summary.localReviewBlocked || 0,
    manualRepairPlanItems: summary.manualRepairPlanItems || 0,
  };
}

function summarizeNarrativeTailorCheckSummary(checks) {
  return {
    total: checks.length,
    passing: checks.filter((check) => check.passed).length,
    failing: checks.filter((check) => !check.passed).length,
  };
}

function summarizeNarrativeTailorRepairQueue(repairQueue) {
  return {
    total: repairQueue.length,
    highSeverity: repairQueue.filter((item) => item.severity === "high").length,
  };
}

function summarizeNarrativeTailorVariantForAudience(variant) {
  return {
    id: variant.id,
    groundingScore: variant.groundingScore,
    claimCount: (variant.claimsUsed || []).length,
    artifactCount: (variant.artifactsUsed || []).length,
    caveatCount: (variant.caveats || []).length,
    repairGuidanceCount: (variant.repairGuidance || []).length,
    prohibitedOverclaimCount: (variant.prohibitedOverclaims || []).length,
    manualUseBoundary: variant.manualUseBoundary,
    bodyAvailable: Boolean(variant.body),
    verificationCommandAvailable: Boolean(variant.verificationCommand),
  };
}

function summarizeManualReadinessGateForAudience(gate = {}) {
  return {
    status: gate.status,
    readyForManualExternalUse: gate.readyForManualExternalUse === true,
    localReviewReady: gate.localReviewReady === true,
    localReviewScore: gate.localReviewScore || 0,
    localReviewBoundaryAvailable: Boolean(gate.localReviewBoundary),
    riskLevel: gate.riskLevel,
    score: gate.score || 0,
    blockerCount: gate.blockerCount || 0,
    reviewChecklistCount: (gate.reviewChecklist || []).length,
    mustDiscloseCount: (gate.mustDisclose || []).length,
    repairPlanCount: (gate.repairPlan || []).length,
    evidenceCount: (gate.evidenceIds || []).length,
    forbiddenActionCount: (gate.forbiddenActions || []).length,
    forbiddenActionsPreview: (gate.forbiddenActions || []).slice(0, 1),
  };
}

function summarizeNarrativeTailorAudienceForResponse(audience) {
  const gate = audience.manualReadinessGate || {};
  const variants = audience.variants || [];
  return {
    id: audience.id,
    score: audience.score,
    variantCount: variants.length,
    variants: variants.slice(0, 1).map((variant) => ({
      id: variant.id,
      claimCount: (variant.claimsUsed || []).length,
      artifactCount: (variant.artifactsUsed || []).length,
    })),
    manualReadinessGate: {
      status: gate.status,
      localReviewReady: gate.localReviewReady === true,
      localReviewScore: gate.localReviewScore || 0,
      reviewChecklistCount: (gate.reviewChecklist || []).length,
      repairPlanCount: (gate.repairPlan || []).length,
    },
  };
}

function tailorAudience({ packet, narrative, switchboard, objections, opportunityBoard, researchStress }) {
  const variants = buildVariants({ packet, narrative, switchboard, objections, opportunityBoard, researchStress });
  const boardLane = laneFor(packet, opportunityBoard);
  const manualReadinessGate = manualReadinessGateFor({ packet, narrative, objections, variants, boardLane, researchStress });
  const checks = audienceChecks({ packet, narrative, objections, variants, manualReadinessGate });
  const score = weightedScore([
    { score: narrative?.groundingScore || 0, weight: 1.1 },
    { score: packet?.uncertaintyDisclosure?.confidenceScore || 0, weight: 1 },
    { score: objections?.answerabilityScore || 0, weight: 1 },
    { score: average(variants.map((variant) => variant.groundingScore)), weight: 1 },
    { score: manualReadinessGate.score, weight: 0.9 },
    ...checks.map((check) => ({ score: check.passed ? 100 : 0, weight: check.severity === "high" ? 1.3 : 1 })),
  ]);
  const weakestVariant = variants.slice().sort((left, right) => left.groundingScore - right.groundingScore)[0];

  return {
    id: packet.id,
    label: packet.label,
    audience: packet.audience,
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${TAILOR_ENDPOINT}/${packet.id}?refresh=1`,
    decisionQuestion: packet.decisionQuestion,
    score,
    band: bandFor(score),
    groundingScore: narrative?.groundingScore || 0,
    confidenceBand: narrative?.confidenceBand || packet.uncertaintyDisclosure.confidenceBand,
    answerabilityScore: objections?.answerabilityScore || 0,
    leadFrame: switchboard?.emphasize || [],
    avoid: switchboard?.avoid || [],
    variants,
    manualReadinessGate,
    checks,
    weakestVariant: weakestVariant
      ? {
          id: weakestVariant.id,
          groundingScore: weakestVariant.groundingScore,
          repairGuidance: weakestVariant.repairGuidance[0],
      }
      : null,
    nextAction:
      manualReadinessGate.repairPlan[0]?.action ||
      weakestVariant?.repairGuidance?.[0] ||
      packet.nextActions?.[0] ||
      `Review the ${packet.audience} narrative manually.`,
  };
}

function buildVariants({ packet, narrative, switchboard, objections, opportunityBoard, researchStress }) {
  const sourceClaims = (narrative?.claimsUsed || []).slice(0, 6);
  const sourceArtifacts = (narrative?.artifactsUsed || []).slice(0, 6);
  const topObjection = (objections?.objections || []).slice().sort((left, right) => right.answerabilityScore - left.answerabilityScore)[0];
  const riskiestObjection = (objections?.objections || []).find((objection) => objection.riskLevel === "high") || (objections?.objections || [])[0];
  const boardLane = laneFor(packet, opportunityBoard);
  const common = {
    claimsUsed: sourceClaims,
    artifactsUsed: sourceArtifacts,
    manualUseBoundary: packet.draftOnlyOutreach.sendPolicy,
    prohibitedOverclaims: narrative?.prohibitedOverclaims || [],
    verificationCommand: `npm run check && node server.js # then open /api/narrative-tailor/${packet.id}`,
  };

  return [
    variant({
      ...common,
      id: "proof-first",
      label: "Proof-first narrative",
      body: `${packet.thesis} Start with ${projectSequence(packet)} and inspect ${sourceArtifacts.slice(0, 3).join(", ") || "the artifact trail"} before broad claims.`,
      caveats: orderedUnique([...(packet.uncertaintyDisclosure.caveats || []).slice(0, 2), switchboard?.disclose?.[0]]),
      objectionAnswer: topObjection?.answer || "No objection answer generated yet.",
      repairGuidance: orderedUnique([...(narrative?.repairActions || []), packet.nextActions?.[0], boardLane?.nextManualAction]).slice(0, 4),
      groundingScore: average([narrative?.groundingScore || 0, percent(sourceClaims.length, 6), percent(sourceArtifacts.length, 6), topObjection?.answerabilityScore || 0]),
    }),
    variant({
      ...common,
      id: "caveat-forward",
      label: "Caveat-forward narrative",
      body: `${packet.label} is strongest when it states the limits first: ${packet.uncertaintyDisclosure.caveats.slice(0, 2).join(" ")} Then use ${projectSequence(packet)} as the proof path.`,
      caveats: orderedUnique([...(packet.uncertaintyDisclosure.caveats || []), ...(riskiestObjection?.caveats || [])]).slice(0, 4),
      objectionAnswer: riskiestObjection?.answer || "No high-risk objection answer generated yet.",
      repairGuidance: orderedUnique([riskiestObjection?.repairAction, ...(narrative?.repairActions || []), boardLane?.nextManualAction]).slice(0, 4),
      groundingScore: average([packet.uncertaintyDisclosure.confidenceScore, objections?.answerabilityScore || 0, researchStress?.summary?.score || 0]),
    }),
    variant({
      ...common,
      id: "ask-ready-draft",
      label: "Ask-ready draft",
      body: `${packet.draftOnlyOutreach.opening} The ask stays manual: review ${packet.audience} fit, disclose confidence ${packet.uncertaintyDisclosure.confidenceScore}/100, and do not send automatically.`,
      caveats: orderedUnique([packet.draftOnlyOutreach.uncertaintyLine, ...(switchboard?.disclose || [])]).slice(0, 4),
      objectionAnswer: topObjection?.answer || packet.uncertaintyDisclosure.noExternalInference,
      repairGuidance: orderedUnique([...(packet.nextActions || []), boardLane?.nextManualAction, "Refresh narrative tailor receipts before external use."]).slice(0, 4),
      groundingScore: average([packet.uncertaintyDisclosure.confidenceScore, boardLane?.averageReadiness || 0, researchStress?.summary?.score || 0]),
    }),
  ];
}

function variant({
  id,
  label,
  body,
  claimsUsed,
  artifactsUsed,
  caveats,
  objectionAnswer,
  repairGuidance,
  manualUseBoundary,
  prohibitedOverclaims,
  verificationCommand,
  groundingScore,
}) {
  const normalized = clamp(Math.round(groundingScore), 0, 100);
  return {
    id,
    label,
    body,
    groundingScore: normalized,
    band: bandFor(normalized),
    claimsUsed,
    artifactsUsed,
    caveats: orderedUnique(caveats || []).slice(0, 4),
    objectionAnswer,
    repairGuidance: orderedUnique(repairGuidance || []).slice(0, 4),
    manualUseBoundary,
    prohibitedOverclaims: orderedUnique(prohibitedOverclaims || []).slice(0, 4),
    verificationCommand,
  };
}

function manualReadinessGateFor({ packet, narrative, objections, variants, boardLane, researchStress }) {
  const objectionItems = objections?.objections || [];
  const highRiskObjections = objectionItems.filter((objection) => objection.riskLevel === "high");
  const disclosureObjections = objectionItems.filter((objection) => objection.mustDisclose);
  const weakVariants = variants.filter((variant) => variant.groundingScore < 70);
  const blockers = [
    ...highRiskObjections.map((objection) =>
      readinessBlocker({
        id: `objection-${objection.id}`,
        severity: "high",
        detail: objection.challenge,
        repairAction: objection.repairAction,
        evidenceIds: objection.evidence,
        verificationCommand: objection.verificationCommand || `npm run tailor:narratives && node server.js # then open /api/narrative-objections/${packet.id}`,
      }),
    ),
    ...weakVariants.map((variant) =>
      readinessBlocker({
        id: `variant-${variant.id}`,
        severity: "medium",
        detail: `${variant.label} is only ${variant.groundingScore}/100 grounded.`,
        repairAction: variant.repairGuidance[0],
        evidenceIds: [...variant.claimsUsed.slice(0, 2), ...variant.artifactsUsed.slice(0, 2)],
        verificationCommand: variant.verificationCommand,
      }),
    ),
  ];

  if ((researchStress.summary?.failing || 0) > 0) {
    blockers.push(
      readinessBlocker({
        id: "research-stress",
        severity: "high",
        detail: `${researchStress.summary.failing} research stress scenario(s) failing.`,
        repairAction: "Rerun and repair the research stress suite before using tailored narratives externally.",
        evidenceIds: ["research-stress.summary"],
        verificationCommand: "npm run stress:evaluation",
      }),
    );
  }
  if ((boardLane?.blockedPackageIds || []).length > 0) {
    blockers.push(
      readinessBlocker({
        id: "opportunity-proof-blockers",
        severity: "high",
        detail: `${boardLane.blockedPackageIds.length} opportunity package(s) blocked until proof improves.`,
        repairAction: boardLane.nextManualAction,
        evidenceIds: boardLane.blockedPackageIds,
        verificationCommand: "npm run check && node server.js # then open /api/opportunity-board",
      }),
    );
  }
  if ((packet.uncertaintyDisclosure.privateReferenceCount || 0) > 0) {
    blockers.push(
      readinessBlocker({
        id: "private-reference-review",
        severity: "medium",
        detail: `${packet.uncertaintyDisclosure.privateReferenceCount} public-safe private reference(s) remain summarized.`,
        repairAction: "Keep private references summarized unless approved in the local privacy cockpit.",
        evidenceIds: [`packet.${packet.id}.uncertaintyDisclosure`],
        verificationCommand: "npm run check && node server.js # then open /api/privacy-approvals",
      }),
    );
  }
  if ((packet.uncertaintyDisclosure.screenshotGapCount || 0) > 0) {
    blockers.push(
      readinessBlocker({
        id: "screenshot-gap-review",
        severity: "medium",
        detail: `${packet.uncertaintyDisclosure.screenshotGapCount} screenshot gap(s) remain in selected proof.`,
        repairAction: "Add approved public-safe screenshots before using this narrative in visual-heavy contexts.",
        evidenceIds: [`packet.${packet.id}.screenshotGapCount`],
        verificationCommand: "npm run check && node server.js # then open /api/artifacts",
      }),
    );
  }
  if (!/never send|draft-only/i.test(packet.draftOnlyOutreach.sendPolicy || "")) {
    blockers.push(
      readinessBlocker({
        id: "manual-boundary",
        severity: "high",
        detail: "Draft-only send policy is missing.",
        repairAction: "Restore a manual-only send policy before tailored narrative output is used.",
        evidenceIds: [`packet.${packet.id}.draftOnlyOutreach`],
        verificationCommand: "npm run check",
      }),
    );
  }

  const uniqueBlockers = uniqueBlockersById(blockers);
  const highRiskBlockers = uniqueBlockers.filter((blocker) => blocker.severity === "high").length;
  const status = highRiskBlockers ? "repair-before-use" : uniqueBlockers.length ? "restricted-draft" : "manual-review-ready";
  const score = clamp(
    Math.round(
      average([
        average(variants.map((variant) => variant.groundingScore)),
        objections?.answerabilityScore || 0,
        researchStress.summary?.score || 0,
        boardLane?.averageReadiness || packet.uncertaintyDisclosure.confidenceScore || 0,
      ]) -
        highRiskBlockers * 12 -
        (uniqueBlockers.length - highRiskBlockers) * 5,
    ),
    0,
    100,
  );
  const repairPlan = orderedUnique([
    ...uniqueBlockers.map((blocker) => blocker.repairAction),
    boardLane?.nextManualAction,
    ...(narrative?.repairActions || []),
    ...(packet.nextActions || []),
    "Refresh narrative tailor receipts before external use.",
  ])
    .slice(0, 6)
    .map((action, index) => ({
      rank: index + 1,
      action,
      verificationCommand: index === 0 ? "npm run tailor:narratives" : "npm run check",
    }));
  const reviewChecklist = orderedUnique([
    "Confirm the audience is correct before using this draft.",
    "Verify every claim ID and artifact ID still appears in the public-safe proof surface.",
    "Attach caveats and objection answers before sharing externally.",
    "Keep the draft manual-only; do not send, submit, schedule, or publish automatically.",
    boardLane?.safetyRule,
    packet.uncertaintyDisclosure.noExternalInference,
  ]).slice(0, 6);
  const mustDisclose = orderedUnique([
    ...(packet.uncertaintyDisclosure.caveats || []).slice(0, 3),
    ...disclosureObjections.map((objection) => `${objection.id}: ${objection.caveats[0] || objection.challenge}`),
    ...(boardLane?.caveats || []),
  ]).slice(0, 8);
  const evidenceIds = orderedUnique([
    `narrative.${packet.id}`,
    `packet.${packet.id}`,
    boardLane ? `opportunity-lane.${boardLane.id}` : null,
    "research-stress.summary",
    ...variants.flatMap((variant) => [...variant.claimsUsed.slice(0, 2), ...variant.artifactsUsed.slice(0, 2)]),
  ]).slice(0, 12);
  const forbiddenActions = ["send-outreach", "submit-application", "publish-copy", "claim-external-interest", "expose-private-material"];
  const localReviewReady =
    reviewChecklist.length >= 4 &&
    mustDisclose.length >= 1 &&
    repairPlan.length >= 1 &&
    evidenceIds.length >= 4 &&
    forbiddenActions.includes("send-outreach");
  const localReviewScore = clamp(
    Math.round(
      average([
        average(variants.map((variant) => variant.groundingScore)),
        objections?.answerabilityScore || 0,
        researchStress.summary?.score || 0,
        percent(reviewChecklist.length, 6),
        percent(repairPlan.length, 6),
        mustDisclose.length ? 100 : 0,
        localReviewReady ? 100 : 0,
      ]) - weakVariants.length * 3,
    ),
    0,
    100,
  );

  return {
    status,
    readyForManualExternalUse: status === "manual-review-ready",
    localReviewReady,
    localReviewScore,
    localReviewBoundary:
      "Ready for local manual inspection only. This does not permit sending, submitting, publishing, scheduling, claiming external interest, or exposing private material.",
    riskLevel: highRiskBlockers ? "high" : uniqueBlockers.length ? "medium" : "low",
    score,
    blockers: uniqueBlockers,
    blockerCount: uniqueBlockers.length,
    reviewChecklist,
    mustDisclose,
    repairPlan,
    evidenceIds,
    forbiddenActions,
    verificationCommand: `npm run tailor:narratives && node server.js # then open /api/narrative-tailor/${packet.id}`,
  };
}

function readinessBlocker({ id, severity, detail, repairAction, evidenceIds, verificationCommand }) {
  return {
    id,
    severity,
    detail,
    repairAction,
    evidenceIds: orderedUnique(evidenceIds || []).slice(0, 6),
    verificationCommand,
  };
}

function uniqueBlockersById(blockers) {
  const seen = new Set();
  return blockers.filter((blocker) => {
    if (!blocker.id || seen.has(blocker.id)) return false;
    seen.add(blocker.id);
    return true;
  });
}

function audienceChecks({ packet, narrative, objections, variants, manualReadinessGate }) {
  return [
    check("variant-depth", variants.length >= 3, `${variants.length} tailored variant(s).`, "high"),
    check("claim-grounding", variants.every((variant) => variant.claimsUsed.length > 0), "Every variant carries claim IDs.", "high"),
    check("artifact-grounding", variants.every((variant) => variant.artifactsUsed.length > 0), "Every variant carries artifact IDs.", "medium"),
    check("caveat-disclosure", variants.every((variant) => variant.caveats.length > 0), "Every variant carries caveats.", "high"),
    check("repair-guidance", variants.every((variant) => variant.repairGuidance.length > 0), "Every variant carries repair guidance.", "high"),
    check("manual-boundary", /never send|draft-only/i.test(packet.draftOnlyOutreach.sendPolicy), packet.draftOnlyOutreach.sendPolicy, "high"),
    check("objection-answer", (objections?.objections || []).length >= 5 && variants.every((variant) => variant.objectionAnswer), `${objections?.objections?.length || 0} objection(s) available.`, "medium"),
    check("narrative-source-trail", (narrative?.sourceTrail || []).length > 0, `${narrative?.sourceTrail?.length || 0} source trail item(s).`, "medium"),
    check(
      "manual-readiness-gate",
      manualReadinessGate.reviewChecklist.length >= 4 &&
        manualReadinessGate.repairPlan.length > 0 &&
        manualReadinessGate.evidenceIds.length >= 4 &&
        manualReadinessGate.forbiddenActions.includes("send-outreach") &&
        typeof manualReadinessGate.localReviewReady === "boolean" &&
        Number.isInteger(manualReadinessGate.localReviewScore),
      `${manualReadinessGate.status}; localReview=${manualReadinessGate.localReviewScore}/100; ${manualReadinessGate.blockerCount} blocker(s); ${manualReadinessGate.repairPlan.length} repair step(s).`,
      "high",
    ),
  ];
}

function reportChecks({ audienceReports, routeManifest, refreshPlan, packageManifest, researchStress }) {
  return [
    check("audience-coverage", ["recruiter", "professor", "founder"].every((id) => audienceReports.some((audience) => audience.id === id)), `${audienceReports.length} audience tailoring report(s).`, "high"),
    check("variant-grounding", audienceReports.every((audience) => audience.checks.every((item) => item.passed)), "Every audience variant passes grounding checks.", "high"),
    check(
      "manual-readiness-gates",
      audienceReports.every(
        (audience) =>
          audience.manualReadinessGate &&
          audience.manualReadinessGate.reviewChecklist.length >= 4 &&
          audience.manualReadinessGate.repairPlan.length > 0 &&
          audience.manualReadinessGate.forbiddenActions.includes("send-outreach") &&
          typeof audience.manualReadinessGate.localReviewReady === "boolean" &&
          Number.isInteger(audience.manualReadinessGate.localReviewScore),
      ),
      `${audienceReports.filter((audience) => audience.manualReadinessGate?.localReviewReady).length}/${audienceReports.length} audience gate(s) are ready for local manual review.`,
      "high",
    ),
    check("stress-dependency", (researchStress.summary?.score || 0) >= 85 && (researchStress.summary?.failing || 0) === 0, `research stress ${researchStress.summary?.score || 0}/100 with ${researchStress.summary?.failing || 0} failing scenario(s).`, "high"),
    check("route-manifest", (routeManifest.publicApiRoutes || []).includes(TAILOR_ENDPOINT), `${TAILOR_ENDPOINT} route manifest coverage.`, "medium"),
    check("refresh-plan", (refreshPlan.endpoints || []).includes(TAILOR_ENDPOINT), `${TAILOR_ENDPOINT} refresh coverage.`, "medium"),
    check("script-coverage", Boolean(packageManifest.scripts?.["tailor:narratives"]), "npm run tailor:narratives script coverage.", "medium"),
  ].map((item) => ({
    ...item,
    verificationCommand: item.id === "stress-dependency" ? "npm run stress:evaluation" : "npm run tailor:narratives",
  }));
}

function repairQueueFor({ audienceReports, checks }) {
  return [
    ...checks
      .filter((check) => !check.passed)
      .map((check) => ({
        id: check.id,
        label: check.label,
        severity: check.severity,
        repairAction: check.repairAction || check.detail,
        verificationCommand: check.verificationCommand,
      })),
    ...audienceReports.flatMap((audience) =>
      audience.manualReadinessGate.blockers.map((blocker) => ({
        id: `${audience.id}-manual-gate-${blocker.id}`,
        label: `${audience.label}: ${blocker.detail}`,
        severity: blocker.severity,
        repairAction: blocker.repairAction,
        verificationCommand: blocker.verificationCommand,
      })),
    ),
    ...audienceReports.flatMap((audience) =>
      audience.variants
        .filter((variant) => variant.groundingScore < 70)
        .map((variant) => ({
          id: `${audience.id}-${variant.id}`,
          label: `${audience.label}: ${variant.label}`,
          severity: "medium",
          repairAction: variant.repairGuidance[0],
          verificationCommand: variant.verificationCommand,
        })),
    ),
  ];
}

function nextActionFor({ audienceReports, checks }) {
  const failingCheck = checks.find((check) => !check.passed);
  if (failingCheck) return `${failingCheck.label}: ${failingCheck.detail}`;
  const blockedAudience = audienceReports.find((audience) => audience.manualReadinessGate.status !== "manual-review-ready");
  if (blockedAudience) return `${blockedAudience.label}: ${blockedAudience.manualReadinessGate.repairPlan[0]?.action}`;
  const weakestAudience = audienceReports.slice().sort((left, right) => left.score - right.score)[0];
  return weakestAudience ? `${weakestAudience.label}: ${weakestAudience.nextAction}` : "Keep tailored narratives refreshed.";
}

function narrativeTailorLimitations() {
  return [
    "Narrative variants are deterministic local drafts and still require manual review.",
    "The tailor can cite missing proof and objections; it cannot create real external validation.",
    "Private references remain public-safe summaries unless the local privacy workflow approves a different projection.",
  ];
}

function check(id, passed, detail, severity = "medium") {
  return {
    id,
    label: labelFor(id),
    passed: Boolean(passed),
    severity,
    detail,
  };
}

function laneFor(packet, opportunityBoard) {
  const audience = String(packet.audience || packet.id || "").toLowerCase();
  const laneHints = {
    recruiter: ["agent-infrastructure", "devtools-open-source"],
    professor: ["research-professor"],
    founder: ["founder-demo"],
  }[packet.id] || [packet.id];
  return (
    (opportunityBoard.audienceLanes || []).find((lane) => {
      const laneAudience = String(lane.audience || "").toLowerCase();
      return (
        lane.primaryPacketId === packet.id ||
        laneAudience.includes(audience) ||
        laneHints.includes(lane.id) ||
        lane.packages?.some((item) => item.selectedPacketId === packet.id || String(item.audience || "").toLowerCase() === audience)
      );
    }) || null
  );
}

function projectSequence(packet) {
  return (packet.recommendedProjectOrder || [])
    .slice(0, 3)
    .map((project) => project.title)
    .join(" -> ");
}

function selectById(items = [], id) {
  return items.find((item) => item.id === id) || null;
}

function normalizeAudience(value) {
  const normalized = String(value || "recruiter").toLowerCase().trim();
  if (["recruiter", "hiring", "internship", "engineer"].includes(normalized)) return "recruiter";
  if (["professor", "research", "mentor", "lab"].includes(normalized)) return "professor";
  if (["founder", "vc", "collaborator", "startup"].includes(normalized)) return "founder";
  return normalized;
}

function labelFor(id) {
  return id
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function weightedScore(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(items.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function percent(value, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
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
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.min(Math.trunc(numeric), 50));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

module.exports = {
  TAILOR_ENDPOINT,
  appendNarrativeTailorReceipt,
  buildNarrativeTailorAudienceResponse,
  buildNarrativeTailorHistory,
  buildNarrativeTailorReportFromReceipt,
  buildNarrativeTailorReport,
  buildNarrativeTailorResponse,
  narrativeTailorPlan,
  readNarrativeTailorHistoryWindow,
  readNarrativeTailorReceipts,
  selectNarrativeTailoring,
};
