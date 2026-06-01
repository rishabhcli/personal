const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/narrative-disclosure";
const STORE_RELATIVE_PATH = path.join("var", "narrative-disclosure-receipts.json");
const maxReceipts = 50;
const historyWindowCache = new Map();
const historyResponseCache = new Map();

function narrativeDisclosurePlan() {
  return {
    mode: "evidence-narrative-disclosure-plan",
    command: "npm run disclose:narratives",
    endpoint: ENDPOINT,
    supportedAudiences: ["recruiter", "professor", "founder"],
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing claims, artifacts, audience packets, narrative grounding, objections, tailoring, proof quality, or opportunity gates.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe narrative endpoints, writes a local receipt under var/, and does not publish copy, send outreach, submit applications, approve private artifacts, collect analytics, or contact third parties.",
  };
}

function buildNarrativeDisclosureReport({
  narratives,
  objectionReport,
  tailorReport,
  packets,
  proofQuality,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const bundles = (narratives.narratives || []).map((narrative) =>
    disclosureBundle({
      narrative,
      packet: selectById(packets.packets, narrative.id),
      objections: selectById(objectionReport.audiences, narrative.id),
      tailoring: selectById(tailorReport.audiences, narrative.id),
      proofQuality,
    }),
  );
  const checks = reportChecks({ bundles, routeManifest, refreshPlan, packageManifest, tailorReport });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore([
    ...bundles.map((bundle) => ({ score: bundle.score, weight: 1 })),
    ...checks.map((check) => ({ score: check.passed ? 100 : 0, weight: check.severity === "high" ? 1.4 : 1 })),
  ]);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-narrative-disclosure",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This disclosure report validates public-safe narrative outputs against modeled claims, artifacts, caveats, objections, tailored variants, and proof-quality risks. It does not infer interviews, admissions, funding, hiring, recipient interest, real application state, or private document contents.",
    sideEffectBoundary:
      "This endpoint reads public-safe in-memory reports and local receipt history only. It does not publish narrative copy, send outreach, submit applications, approve private artifacts, enable private routes, collect analytics, or contact third parties.",
    plan: narrativeDisclosurePlan(),
    summary: {
      score,
      band: bandFor(score),
      audiences: bundles.length,
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      highRiskBundles: bundles.filter((bundle) => bundle.riskLevel === "high").length,
      totalRepairActions: bundles.reduce((sum, bundle) => sum + bundle.repairGuidance.length, 0),
      totalMustDisclose: bundles.reduce((sum, bundle) => sum + bundle.mustDisclose.length, 0),
      routeCovered: (routeManifest.publicApiRoutes || []).includes(ENDPOINT),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      latestReceiptId: latestReceipt?.id || null,
    },
    bundles,
    checks,
    disclosureQueue: disclosureQueueFor(bundles),
    repairActions: failing.map((check) => ({
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
    nonClaims: narrativeDisclosureNonClaims(),
    nextAction:
      failing[0]?.repairAction ||
      bundles.find((bundle) => bundle.repairGuidance.length)?.repairGuidance[0] ||
      "Narrative disclosures are evidence-grounded; rerun after narrative, proof, artifact, or opportunity changes.",
    verificationCommand: "npm run disclose:narratives && npm run check && npm run verify",
  };
}

function buildNarrativeDisclosureReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-narrative-disclosure-receipt" || !receipt.summary) return null;
  if (!Array.isArray(receipt.bundles) || !receipt.bundles.every((bundle) => Array.isArray(bundle.mustDisclose) && bundle.evidenceGrounding)) {
    return null;
  }
  const bundles = receipt.bundles.map((bundle) => ({
    ...bundle,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}/${bundle.id}?refresh=1`,
    checks: (bundle.checks || []).map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
      severity: check.severity || "medium",
      detail: check.detail || `Cached bundle check from ${receipt.id}.`,
      verificationCommand: check.verificationCommand || "npm run disclose:narratives",
    })),
  }));
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || `Cached narrative disclosure check from ${receipt.id}.`,
    repairAction: check.repairAction || (check.passed ? "No cached disclosure repair needed." : "Refresh narrative disclosure and repair the failing check."),
    verificationCommand: check.verificationCommand || "npm run disclose:narratives",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "evidence-narrative-disclosure",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs narrative disclosure from the latest local receipt. It is a fast public-safe cached report, not fresh narrative generation, external validation, recipient-interest inference, private-document review, or approval for sending.",
    sideEffectBoundary: receipt.sideEffectBoundary || narrativeDisclosurePlan().sideEffectBoundary,
    plan: narrativeDisclosurePlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    bundles,
    checks,
    disclosureQueue: receipt.disclosureQueue || disclosureQueueFor(bundles),
    repairActions:
      receipt.repairActions ||
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
    nonClaims: receipt.nonClaims || narrativeDisclosureNonClaims(),
    nextAction:
      failing[0]?.repairAction ||
      bundles.find((bundle) => bundle.repairGuidance.length)?.repairGuidance[0] ||
      "Narrative disclosures are served from the latest local receipt; run npm run disclose:narratives or ?refresh=1 after narrative, proof, artifact, or opportunity changes.",
    verificationCommand: "npm run disclose:narratives && npm run check && npm run verify",
  };
}

function selectNarrativeDisclosure(value, report) {
  const normalized = normalizeAudience(value);
  return (report.bundles || []).find((bundle) => bundle.id === normalized || bundle.audience.toLowerCase() === normalized) || null;
}

function buildNarrativeDisclosureAudienceResponse(bundle, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...bundle,
      detail: "full",
      compact: false,
      summaryEndpoint: ENDPOINT,
      fullDetailEndpoint: `${ENDPOINT}/${bundle.id}?detail=full`,
      audiencePayloadPolicy: narrativeDisclosureAudiencePayloadPolicy({ bundle, fullDetail }),
    };
  }

  return summarizeNarrativeDisclosureAudience(bundle);
}

function buildNarrativeDisclosureResponse(report, { detail = "summary" } = {}) {
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
    sourceBoundary: undefined,
    summary: summarizeNarrativeDisclosureSummary(report.summary),
    bundles: (report.bundles || []).map(summarizeDisclosureBundle),
    nonClaimCount: (report.nonClaims || []).length,
  };
}

function summarizeNarrativeDisclosureAudience(bundle) {
  const evidence = bundle.evidenceGrounding || {};
  const objections = bundle.objectionCoverage?.objections || [];
  const variants = bundle.tailoredOutput?.variants || [];
  const checks = bundle.checks || [];
  return {
    id: bundle.id,
    cachedFromReceipt: Boolean(bundle.cachedFromReceipt),
    refreshEndpoint: bundle.refreshEndpoint || `${ENDPOINT}/${bundle.id}?refresh=1`,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}/${bundle.id}?detail=full`,
    score: bundle.score || 0,
    evidenceGrounding: {
      claimCount: (evidence.claimsUsed || []).length,
      artifactCount: (evidence.artifactsUsed || []).length,
      claimsUsedPreview: (evidence.claimsUsed || []).slice(0, 1),
    },
    objectionCoverage: {
      answerabilityScore: bundle.objectionCoverage?.answerabilityScore || 0,
      objectionCount: objections.length,
      mustDiscloseCount: objections.filter((item) => item.mustDisclose).length,
      highRiskCount: objections.filter((item) => item.riskLevel === "high").length,
    },
    tailoredOutput: {
      variantCount: variants.length,
    },
    mustDiscloseCount: (bundle.mustDisclose || []).length,
    repairGuidanceCount: (bundle.repairGuidance || []).length,
    checkSummary: {
      total: checks.length,
      passing: checks.filter((check) => check.passed).length,
      failing: checks.filter((check) => !check.passed).length,
    },
    audiencePayloadPolicy: narrativeDisclosureAudiencePayloadPolicy({ bundle, fullDetail: false }),
  };
}

function narrativeDisclosureAudiencePayloadPolicy({ bundle, fullDetail }) {
  const evidence = bundle?.evidenceGrounding || {};
  const objections = bundle?.objectionCoverage?.objections || [];
  const variants = bundle?.tailoredOutput?.variants || [];
  return {
    fullDetail,
    compact: !fullDetail,
    claimsAvailable: (evidence.claimsUsed || []).length,
    claimsReturned: fullDetail ? (evidence.claimsUsed || []).length : Math.min((evidence.claimsUsed || []).length, 1),
    artifactsAvailable: (evidence.artifactsUsed || []).length,
    artifactsReturned: fullDetail ? (evidence.artifactsUsed || []).length : 0,
    sourceTrailReturned: fullDetail ? (evidence.sourceTrail || []).length : 0,
    objectionsReturned: fullDetail ? objections.length : 0,
    variantsReturned: fullDetail ? variants.length : 0,
    ...(fullDetail
      ? {
          fullDetailEndpoint: `${ENDPOINT}/${bundle.id}?detail=full`,
          omittedFromSummary: [],
        }
      : {}),
  };
}

function appendNarrativeDisclosureReceipt(root, receipt) {
  const receipts = readNarrativeDisclosureReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readNarrativeDisclosureReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readNarrativeDisclosureHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readNarrativeDisclosureReceipts(root);
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

function buildNarrativeDisclosureHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const cacheKey = `${fullDetail ? "full" : "summary"}:${boundedLimit}:${totalAvailable}:${limited.map((receipt) => `${receipt.id}:${receipt.checkedAt || ""}`).join("|")}`;
  const cached = historyResponseCache.get(cacheKey);
  if (cached) return cached;
  const history = {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "evidence-narrative-disclosure-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "This endpoint returns full local narrative-disclosure receipts. It is not fresh narrative generation, outreach approval, application submission, recipient-interest evidence, or private-document review."
      : undefined,
    sideEffectBoundary: fullDetail
      ? "The history endpoint reads local narrative-disclosure receipts only. It does not publish narrative copy, send outreach, submit applications, approve private artifacts, collect analytics, or contact third parties."
      : undefined,
    sideEffectBoundaryAvailable: undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: narrativeDisclosureHistoryPayloadPolicy({ fullDetail, returnedReceipts: limited.length }),
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
    },
    definitions: undefined,
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeNarrativeDisclosureReceipt(receipt, { latest: index === 0 })),
    nextAction: fullDetail
      ? latest
        ? "Narrative-disclosure history is compact; run npm run disclose:narratives after narrative, proof, artifact, objection, tailor, or opportunity changes."
        : "Run npm run disclose:narratives to create narrative-disclosure history."
      : undefined,
    nextActionAvailable: undefined,
    verificationCommand: fullDetail ? "npm run disclose:narratives && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: undefined,
  };
  historyResponseCache.set(cacheKey, history);
  return history;
}

function narrativeDisclosureHistoryPayloadPolicy({ fullDetail, returnedReceipts }) {
  if (fullDetail) {
    return {
      fullDetail: true,
      fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
      returnedReceipts,
    };
  }
  return {
    fullDetail: false,
    returnedReceipts,
  };
}

function summarizeNarrativeDisclosureDefinitions(receipt) {
  const bundles = receipt?.bundles || [];
  const reportChecks = receipt?.checks || [];
  const bundleChecks = uniqueById(bundles.flatMap((bundle) => bundle.checks || []));
  return {
    evidenceAccess: {
      fullReportAvailable: true,
      fullHistoryAvailable: true,
    },
    reportChecks: {
      total: reportChecks.length,
      verificationCommandsAvailable: reportChecks.some((check) => check.verificationCommand),
    },
    bundleChecks: {
      total: bundleChecks.length,
      verificationCommandsAvailable: bundleChecks.some((check) => check.verificationCommand),
    },
  };
}

function summarizeNarrativeDisclosureReceipt(receipt, { latest = false } = {}) {
  const bundles = receipt.bundles || [];
  const checks = receipt.checks || [];
  const failedChecks = checks.filter((check) => !check.passed);
  const summary = {
    id: receipt.id,
    summary: summarizeNarrativeDisclosureHistorySummary(receipt.summary),
  };
  if (failedChecks.length) {
    summary.checkSummary = {
      total: checks.length,
      passed: checks.length - failedChecks.length,
      failed: failedChecks.length,
    };
  }
  if (!latest) {
    return {
      id: receipt.id,
      trendSummary: summary.summary,
    };
  }
  return {
    ...summary,
    bundles: bundles.map(summarizeDisclosureBundleForHistory),
  };
}

function summarizeNarrativeDisclosureHistorySummary(summary = {}) {
  const compact = {
    score: summary.score || 0,
  };
  if (summary.failing) compact.failing = summary.failing;
  return compact;
}

function summarizeNarrativeDisclosureSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    audiences: summary.audiences || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
  };
}

function summarizeDisclosureBundle(bundle) {
  const evidence = bundle.evidenceGrounding || {};
  const objectionCoverage = bundle.objectionCoverage || {};
  const objections = objectionCoverage.objections || [];
  const tailoredOutput = bundle.tailoredOutput || {};
  const variants = tailoredOutput.variants || [];
  const checks = bundle.checks || [];
  return {
    id: bundle.id,
    score: bundle.score || 0,
    evidenceGrounding: {
      groundingScore: evidence.groundingScore || 0,
      claimCount: (evidence.claimsUsed || []).length,
      artifactCount: (evidence.artifactsUsed || []).length,
    },
    objectionCoverage: {
      objectionCount: objections.length,
      mustDiscloseCount: objections.filter((item) => item.mustDisclose).length,
    },
    tailoredOutput: {
      variantCount: variants.length,
    },
    mustDiscloseCount: (bundle.mustDisclose || []).length,
    repairGuidanceCount: (bundle.repairGuidance || []).length,
    checkCount: checks.length,
  };
}

function summarizeDisclosureChecks(checks = []) {
  const passed = checks.filter((check) => check.passed).length;
  return {
    total: checks.length,
    passed,
    failing: Math.max(0, checks.length - passed),
  };
}

function summarizeDisclosureBundleForHistory(bundle) {
  const evidence = bundle.evidenceGrounding || {};
  const checks = summarizeDisclosureChecks(bundle.checks || []);
  const compact = {
    id: bundle.id,
    score: bundle.score || 0,
    claimCount: (evidence.claimsUsed || []).length,
    artifactCount: (evidence.artifactsUsed || []).length,
    mustDiscloseCount: (bundle.mustDisclose || []).length,
    repairGuidanceCount: (bundle.repairGuidance || []).length,
  };
  if (checks.failing) compact.failingChecks = checks.failing;
  return compact;
}

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.min(Math.trunc(numeric), maxReceipts));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

function uniqueById(items) {
  const seen = new Set();
  return (items || []).filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function disclosureBundle({ narrative, packet, objections, tailoring, proofQuality }) {
  const objectionItems = objections?.objections || [];
  const tailoredVariants = tailoring?.variants || [];
  const mustDisclose = orderedUnique([
    `Confidence: ${narrative.confidenceBand} (${narrative.uncertaintyDisclosure.confidenceScore}/100).`,
    ...(narrative.uncertaintyDisclosure.caveats || []).slice(0, 3),
    ...(objections?.disclosureChecklist || []).slice(0, 4),
    narrative.uncertaintyDisclosure.noExternalInference,
  ]).slice(0, 8);
  const repairGuidance = orderedUnique([
    ...(narrative.repairActions || []),
    ...(tailoring?.weakestVariant?.repairGuidance ? [tailoring.weakestVariant.repairGuidance] : []),
    ...objectionItems.filter((item) => item.mustDisclose).map((item) => item.repairAction),
    ...(proofQuality.topRisks || []).slice(0, 2).map((risk) => risk.recommendation),
    packet?.nextActions?.[0],
  ]).slice(0, 8);
  const checks = bundleChecks({ narrative, objections, tailoring, mustDisclose, repairGuidance });
  const score = weightedScore([
    { score: narrative.groundingScore || 0, weight: 1.2 },
    { score: objections?.answerabilityScore || 0, weight: 1 },
    { score: tailoring?.score || 0, weight: 1 },
    ...checks.map((check) => ({ score: check.passed ? 100 : 0, weight: check.severity === "high" ? 1.3 : 1 })),
  ]);
  const riskLevel = score >= 85 ? "low" : score >= 70 ? "medium" : "high";

  return {
    id: narrative.id,
    label: narrative.label,
    audience: narrative.audience,
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}/${narrative.id}?refresh=1`,
    score,
    band: bandFor(score),
    riskLevel,
    thesis: narrative.thesis,
    safeUse:
      riskLevel === "low"
        ? `Use the ${narrative.audience} narrative only after manual review with disclosures attached.`
        : `Keep the ${narrative.audience} narrative internal until the repair guidance is addressed.`,
    evidenceGrounding: {
      groundingScore: narrative.groundingScore,
      confidenceBand: narrative.confidenceBand,
      claimsUsed: narrative.claimsUsed,
      artifactsUsed: narrative.artifactsUsed,
      sourceTrail: narrative.sourceTrail.map((trail) => ({
        project: trail.project,
        evidenceStrength: trail.evidenceStrength,
        confidenceScore: trail.confidenceScore,
        claimIds: trail.claimIds,
        artifactIds: trail.artifactIds,
        caveats: trail.caveats,
      })),
    },
    objectionCoverage: {
      answerabilityScore: objections?.answerabilityScore || 0,
      objections: objectionItems.map((item) => ({
        id: item.id,
        riskLevel: item.riskLevel,
        mustDisclose: item.mustDisclose,
        answerabilityScore: item.answerabilityScore,
        caveats: item.caveats,
        repairAction: item.repairAction,
      })),
    },
    tailoredOutput: {
      score: tailoring?.score || 0,
      variants: tailoredVariants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        groundingScore: variant.groundingScore,
        caveats: variant.caveats,
        repairGuidance: variant.repairGuidance,
        manualUseBoundary: variant.manualUseBoundary,
      })),
    },
    mustDisclose,
    repairGuidance,
    prohibitedOverclaims: narrative.prohibitedOverclaims,
    checks,
    verificationCommand: `npm run disclose:narratives && node server.js # then open /api/narrative-disclosure/${narrative.id}`,
  };
}

function disclosureQueueFor(bundles) {
  return bundles
    .flatMap((bundle) =>
      bundle.mustDisclose.map((item, index) => ({
        id: `${bundle.id}.disclosure.${index + 1}`,
        audience: bundle.audience,
        riskLevel: bundle.riskLevel,
        item,
        verificationCommand: bundle.verificationCommand,
      })),
    )
    .slice(0, 16);
}

function narrativeDisclosureNonClaims() {
  return [
    "Does not approve any narrative for automatic sending, publishing, applications, or submissions.",
    "Does not convert private references into public artifacts.",
    "Does not infer recipient interest, external acceptance, funding, admissions, interviews, or hiring outcomes.",
    "Does not replace manual review before external use.",
  ];
}

function bundleChecks({ narrative, objections, tailoring, mustDisclose, repairGuidance }) {
  return [
    check("claim-grounded", narrative.claimsUsed.length > 0, "high", `${narrative.claimsUsed.length} claim(s) used.`),
    check("artifact-grounded", narrative.artifactsUsed.length > 0, "high", `${narrative.artifactsUsed.length} artifact(s) used.`),
    check("uncertainty-disclosed", mustDisclose.length >= 3, "high", `${mustDisclose.length} disclosure item(s).`),
    check("repair-guidance", repairGuidance.length >= 2, "medium", `${repairGuidance.length} repair action(s).`),
    check("objection-covered", (objections?.objections || []).length >= 5 && (objections?.disclosureChecklist || []).length >= 3, "medium", `${objections?.objections?.length || 0} objection(s).`),
    check("tailored-variants", (tailoring?.variants || []).length >= 3 && (tailoring?.variants || []).every((variant) => /never send|draft-only/i.test(variant.manualUseBoundary)), "medium", `${tailoring?.variants?.length || 0} tailored variant(s).`),
  ];
}

function reportChecks({ bundles, routeManifest, refreshPlan, packageManifest, tailorReport }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const scripts = packageManifest.scripts || {};
  return [
    reportCheck("audience-coverage", bundles.length >= 3, "high", `${bundles.length} disclosure bundle(s).`, "Generate disclosure bundles for recruiter, professor, and founder narratives.", "npm run disclose:narratives"),
    reportCheck("evidence-grounding", bundles.every((bundle) => bundle.evidenceGrounding.claimsUsed.length && bundle.evidenceGrounding.artifactsUsed.length), "high", "Every bundle must include claim and artifact IDs.", "Attach claim and artifact IDs to every narrative disclosure bundle.", "npm run check && node server.js # then open /api/narrative-disclosure"),
    reportCheck("uncertainty-and-repair", bundles.every((bundle) => bundle.mustDisclose.length >= 3 && bundle.repairGuidance.length >= 2), "high", "Every bundle must expose disclosure and repair guidance.", "Keep caveats, no-external-inference text, and repair guidance attached to narrative output.", "npm run check && node server.js # then open /api/narrative-disclosure"),
    reportCheck("objection-and-tailor-coherence", bundles.every((bundle) => bundle.objectionCoverage.objections.length >= 5 && bundle.tailoredOutput.variants.length >= 3), "medium", `${tailorReport.summary?.variants || 0} tailored variant(s).`, "Regenerate narrative objections and tailored variants before disclosure review.", "npm run tailor:narratives"),
    reportCheck("route-manifest", [ENDPOINT, `${ENDPOINT}/:audience`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => publicRoutes.includes(route)), "high", `${[ENDPOINT, `${ENDPOINT}/:audience`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => publicRoutes.includes(route)).length}/4 route(s) declared.`, "Add narrative disclosure routes to runtimeRouteManifest.", "npm run record:runtime-surface"),
    reportCheck("refresh-plan", (refreshPlan.endpoints || []).includes(ENDPOINT), "medium", `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"} in refresh plan.`, "Add narrative disclosure to the safe evidence refresh plan.", "npm run refresh:evidence"),
    reportCheck("script-coverage", Boolean(scripts["disclose:narratives"]), "medium", `disclose:narratives=${Boolean(scripts["disclose:narratives"])}`, "Add the disclose:narratives package script.", "npm run disclose:narratives"),
  ];
}

function check(id, passed, severity, detail) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    verificationCommand: "npm run check && node server.js # then open /api/narrative-disclosure",
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

function selectById(items = [], id) {
  return items.find((item) => item.id === id) || null;
}

function normalizeAudience(value) {
  const normalized = String(value || "").toLowerCase().trim();
  if (["recruiter", "hiring", "internship", "engineer"].includes(normalized)) return "recruiter";
  if (["professor", "research", "mentor", "lab"].includes(normalized)) return "professor";
  if (["founder", "vc", "collaborator", "startup"].includes(normalized)) return "founder";
  return normalized;
}

function weightedScore(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(items.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function orderedUnique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

module.exports = {
  appendNarrativeDisclosureReceipt,
  buildNarrativeDisclosureAudienceResponse,
  buildNarrativeDisclosureHistory,
  buildNarrativeDisclosureReportFromReceipt,
  buildNarrativeDisclosureReport,
  buildNarrativeDisclosureResponse,
  narrativeDisclosurePlan,
  readNarrativeDisclosureHistoryWindow,
  readNarrativeDisclosureReceipts,
  selectNarrativeDisclosure,
};
