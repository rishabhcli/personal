const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/evaluation/sample";
const STORE_RELATIVE_PATH = path.join("var", "evaluation-sample-receipts.json");
const maxReceipts = 50;
const COMPACT_SAMPLE_PREVIEW_IDS = ["truthfulness-risk-sample", "runtime-chain-sample", "route-refresh-sample"];
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function evaluationSamplePlan() {
  return {
    mode: "research-grade-evaluation-sample-plan",
    command: "npm run sample:evaluation",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing proof/search/opportunity/usability/runtime/design evaluators, route manifests, or safe evidence refresh coverage.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe evaluation endpoints, writes a local receipt under var/, and does not collect analytics, contact external services, enable private cockpit data, deploy, publish, submit, approve, schedule, or mutate third-party systems.",
    samplePolicy:
      "Deterministically sample one representative item from each evaluation family: weakest visible proof risk, weakest search case, opportunity gate disclosure, usability repair visibility, runtime evidence chain, design ambition family, and route/refresh/script coverage.",
  };
}

function buildEvaluationSampleReport({
  proofQuality,
  searchQuality,
  opportunityQuality,
  usabilityQuality,
  designAmbition,
  runtimeEvidenceChain,
  researchStress,
  evaluationIntegrity,
  researchRigor,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const plan = evaluationSamplePlan();
  const samples = buildSamples({
    proofQuality,
    searchQuality,
    opportunityQuality,
    usabilityQuality,
    designAmbition,
    runtimeEvidenceChain,
    researchStress,
    evaluationIntegrity,
    researchRigor,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = samples.filter((sample) => !sample.passed);
  const score = weightedScore(samples);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "research-grade-evaluation-sample",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report samples only local public-safe evaluation outputs already modeled by the app. It is not live user research, external peer review, recruiter review, production monitoring, screen-reader certification, or private-document audit.",
    sideEffectBoundary:
      "This endpoint reads public-safe in-memory reports and local receipt history only. It does not start recorders, collect analytics, enable private routes, contact external services, deploy, publish, or write to third-party systems.",
    plan,
    summary: {
      score,
      band: bandFor(score),
      samples: samples.length,
      passing: samples.length - failing.length,
      failing: failing.length,
      highRiskFailing: failing.filter((sample) => sample.severity === "high").length,
      domains: new Set(samples.map((sample) => sample.domain)).size,
      sampleSeed: sampleSeed(samples),
      latestReceiptId: latestReceipt?.id || null,
      routeCovered: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) =>
        (routeManifest.publicApiRoutes || []).includes(route),
      ),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      commandCovered: Boolean(packageManifest.scripts?.["sample:evaluation"]),
    },
    methodology: {
      scale: "0-100 weighted sample score",
      bandPolicy: "high >= 85, medium >= 70, low < 70",
      passPolicy:
        "Each sampled evaluator must expose source traces or evidence, visible limitations/non-claims, expected failure modes or repair actions, and a repeatable verification command.",
      samples: samples.map((sample) => ({
        id: sample.id,
        domain: sample.domain,
        severity: sample.severity,
        weight: sample.weight,
        source: sample.source,
      })),
    },
    samples,
    sampleMatrix: buildSampleMatrix(samples),
    repairQueue: failing.map((sample) => ({
      id: sample.id,
      domain: sample.domain,
      severity: sample.severity,
      repairAction: sample.repairAction,
      verificationCommand: sample.verificationCommand,
    })),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          samples: latestReceipt.summary?.samples || 0,
        }
      : null,
    nonClaims: evaluationSampleNonClaims(),
    nextAction:
      failing[0]?.repairAction ||
      "Evaluation sampling is passing; rerun npm run sample:evaluation after evaluator, runtime, design, route, or receipt changes.",
    verificationCommand:
      "npm run sample:evaluation && npm run audit:evaluation-integrity && npm run audit:research-rigor && npm run check && npm run verify",
  };
}

function buildEvaluationSampleReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "research-grade-evaluation-sample-receipt" || !receipt.summary) return null;
  const samples = (receipt.samples || []).map((sample) => ({
    id: sample.id,
    domain: sample.domain || "cached",
    label: titleize(sample.id),
    source: "evaluation-sample receipt",
    severity: sample.severity || "medium",
    weight: 1,
    score: sample.score || 0,
    band: bandFor(sample.score || 0),
    passed: Boolean(sample.passed),
    sampledItem: {
      id: sample.id,
      receiptId: receipt.id,
    },
    detail: sample.detail || "Cached evaluation sample detail.",
    expectedFailureMode: "A cached evaluation sample may be stale after evaluator, runtime, route, or receipt changes.",
    evidence: ["evaluation sample receipt", receipt.id],
    repairAction: sample.passed ? "No cached sample repair needed." : "Refresh evaluation sampling and repair the failing sample.",
    verificationCommand: "npm run sample:evaluation",
  }));
  const failing = samples.filter((sample) => !sample.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "research-grade-evaluation-sample",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs the evaluation sampler from the latest local receipt. It is a fast public-safe cached report, not live user research, external peer review, production monitoring, or private-document audit.",
    sideEffectBoundary: receipt.sideEffectBoundary || evaluationSamplePlan().sideEffectBoundary,
    plan: evaluationSamplePlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    methodology: {
      scale: "0-100 weighted sample score",
      bandPolicy: "high >= 85, medium >= 70, low < 70",
      passPolicy: "Cached samples preserve the latest receipt's pass/fail state until the explicit refresh command recomputes them.",
      samples: samples.map((sample) => ({
        id: sample.id,
        domain: sample.domain,
        severity: sample.severity,
        weight: sample.weight,
        source: sample.source,
      })),
    },
    samples,
    sampleMatrix: buildSampleMatrix(samples),
    repairQueue: failing.map((sample) => ({
      id: sample.id,
      domain: sample.domain,
      severity: sample.severity,
      repairAction: sample.repairAction,
      verificationCommand: sample.verificationCommand,
    })),
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passing: receipt.summary?.passing || 0,
      samples: receipt.summary?.samples || 0,
    },
    nonClaims: evaluationSampleNonClaims(),
    nextAction: failing[0]?.repairAction || "Evaluation sampling is served from the latest local receipt; run npm run sample:evaluation or ?refresh=1 after evaluator, runtime, design, route, or receipt changes.",
    verificationCommand:
      "npm run sample:evaluation && npm run audit:evaluation-integrity && npm run audit:research-rigor && npm run check && npm run verify",
  };
}

function buildEvaluationSampleResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      evaluationSamplePayloadPolicy: {
        fullDetail: true,
        samplesReturned: report.samples?.length || 0,
        repairQueueReturned: report.repairQueue?.length || 0,
        fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      },
    };
  }

  const samplePreview = selectPreviewById(report.samples || [], COMPACT_SAMPLE_PREVIEW_IDS, COMPACT_SAMPLE_PREVIEW_IDS.length);

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    refreshEndpoint: report.refreshEndpoint || `${ENDPOINT}?refresh=1`,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeEvaluationSampleSummary(report.summary),
    samples: samplePreview.map(summarizeEvaluationSample),
    repairQueueCount: (report.repairQueue || []).length,
    nonClaimsAvailable: Boolean((report.nonClaims || []).length),
    nonClaimCount: (report.nonClaims || []).length,
    evaluationSamplePayloadPolicy: {
      fullDetail: false,
      samplesReturned: samplePreview.length,
      totalSamples: report.samples?.length || 0,
    },
  };
}

function buildSamples({
  proofQuality,
  searchQuality,
  opportunityQuality,
  usabilityQuality,
  designAmbition,
  runtimeEvidenceChain,
  researchStress,
  evaluationIntegrity,
  researchRigor,
  routeManifest,
  refreshPlan,
  packageManifest,
}) {
  const weakestProofRisk = sortedByScore(proofQuality.topRisks || [])[0] || null;
  const weakestSearchCase = sortedByScore(searchQuality.cases || [])[0] || null;
  const weakestUsabilityRisk = sortedByScore(usabilityQuality.topRisks || [])[0] || null;
  const weakestDesignFamily = sortedByScore(designAmbition.controlFamilies || [])[0] || null;
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const scripts = packageManifest.scripts || {};

  return [
    sample({
      id: "truthfulness-risk-sample",
      domain: "truthfulness",
      label: "Weakest proof risk remains repairable",
      source: "proof-quality.topRisks[0]",
      severity: "high",
      weight: 1.35,
      score: average([
        proofQuality.summary?.score || 0,
        proofQuality.limitations?.length >= 3 ? 100 : 0,
        weakestProofRisk?.recommendation ? 100 : 0,
        proofQuality.methodology?.dimensions?.length ? 100 : 0,
      ]),
      passed:
        Boolean(weakestProofRisk?.recommendation) &&
        (proofQuality.limitations || []).length >= 3 &&
        Boolean(proofQuality.methodology?.dimensions?.length),
      sampledItem: compact({
        id: weakestProofRisk?.id,
        label: weakestProofRisk?.label,
        score: weakestProofRisk?.score,
        recommendation: weakestProofRisk?.recommendation,
      }),
      detail: `proof=${proofQuality.summary?.score || 0}/100; limitations=${proofQuality.limitations?.length || 0}; sampled risk=${weakestProofRisk?.id || "missing"}.`,
      expectedFailureMode: "A weak public claim appears trustworthy without visible limitation or repair guidance.",
      evidence: ["proof-quality methodology", "proof-quality limitations", "proof-quality topRisks"],
      repairAction: "Restore proof-quality methodology, limitations, and recommendation text for the weakest sampled proof risk.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/proof-quality",
    }),
    sample({
      id: "retrieval-case-sample",
      domain: "retrieval",
      label: "Weakest search benchmark remains source-traced",
      source: "search-quality.cases[weakest]",
      severity: "medium",
      weight: 1,
      score: average([
        weakestSearchCase?.score || 0,
        allResultsSourceTraced(weakestSearchCase) ? 100 : 0,
        weakestSearchCase?.nextRepair ? 100 : 0,
        (weakestSearchCase?.expectedSlugs || []).length ? 100 : 0,
      ]),
      passed:
        Boolean(weakestSearchCase?.nextRepair) &&
        allResultsSourceTraced(weakestSearchCase) &&
        (weakestSearchCase?.expectedSlugs || []).length > 0,
      sampledItem: compact({
        id: weakestSearchCase?.id,
        query: weakestSearchCase?.query,
        score: weakestSearchCase?.score,
        topResult: weakestSearchCase?.results?.[0]?.slug,
        nextRepair: weakestSearchCase?.nextRepair,
      }),
      detail: `search=${searchQuality.summary?.score || 0}/100; sampled case=${weakestSearchCase?.id || "missing"}; source traced=${allResultsSourceTraced(weakestSearchCase)}.`,
      expectedFailureMode: "Search looks plausible while the weakest benchmark loses source traces or inspection guidance.",
      evidence: ["search-quality cases", "search result sourceTrace", "search nextRepair"],
      repairAction: "Restore source traces and next-repair guidance for the weakest sampled search benchmark.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/search-quality",
    }),
    sample({
      id: "opportunity-gate-sample",
      domain: "opportunity",
      label: "Opportunity evaluator keeps manual gate visible",
      source: "opportunity-quality.summary + limitations",
      severity: "high",
      weight: 1.2,
      score: average([
        opportunityQuality.summary?.score || 0,
        dimensionScore(opportunityQuality, "manual-safety"),
        opportunityQuality.limitations?.some((item) => /live posting|deadline|application/i.test(item)) ? 100 : 0,
        Number.isInteger(opportunityQuality.summary?.totalMissingProof) ? 100 : 0,
      ]),
      passed:
        dimensionScore(opportunityQuality, "manual-safety") >= 70 &&
        (opportunityQuality.limitations || []).some((item) => /live posting|deadline|application/i.test(item)) &&
        Number.isInteger(opportunityQuality.summary?.totalMissingProof),
      sampledItem: compact({
        packages: opportunityQuality.summary?.packages,
        readyForManualUse: opportunityQuality.summary?.readyForManualUse,
        totalMissingProof: opportunityQuality.summary?.totalMissingProof,
        manualSafety: dimensionScore(opportunityQuality, "manual-safety"),
      }),
      detail: `manual safety=${dimensionScore(opportunityQuality, "manual-safety")}/100; missing proof=${opportunityQuality.summary?.totalMissingProof ?? "unknown"}; ready=${opportunityQuality.summary?.readyForManualUse ?? "unknown"}.`,
      expectedFailureMode: "Opportunity outputs imply live/application readiness without manual proof gates and caveats.",
      evidence: ["opportunity-quality manual-safety", "opportunity-quality limitations", "missing proof summary"],
      repairAction: "Restore manual-safety scoring, missing-proof counts, and live-posting/application caveats.",
      verificationCommand: "npm run audit:opportunity-quality && npm run check",
    }),
    sample({
      id: "usability-repair-sample",
      domain: "usability",
      label: "Weakest usability risk remains actionable",
      source: "usability-quality.topRisks[0]",
      severity: "medium",
      weight: 1,
      score: average([
        usabilityQuality.summary?.score || 0,
        weakestUsabilityRisk?.recommendation ? 100 : 0,
        usabilityQuality.limitations?.length >= 3 ? 100 : 0,
        dimensionScore(usabilityQuality, "keyboard-workflow"),
        dimensionScore(usabilityQuality, "uncertainty-disclosure"),
      ]),
      passed:
        Boolean(weakestUsabilityRisk?.recommendation) &&
        (usabilityQuality.limitations || []).length >= 3 &&
        dimensionScore(usabilityQuality, "keyboard-workflow") >= 70 &&
        dimensionScore(usabilityQuality, "uncertainty-disclosure") >= 70,
      sampledItem: compact({
        id: weakestUsabilityRisk?.id,
        label: weakestUsabilityRisk?.label,
        score: weakestUsabilityRisk?.score,
        recommendation: weakestUsabilityRisk?.recommendation,
      }),
      detail: `usability=${usabilityQuality.summary?.score || 0}/100; keyboard=${dimensionScore(usabilityQuality, "keyboard-workflow")}/100; uncertainty=${dimensionScore(usabilityQuality, "uncertainty-disclosure")}/100.`,
      expectedFailureMode: "A dense command-center surface passes visually while the weakest usability risk loses repair guidance.",
      evidence: ["usability-quality topRisks", "keyboard-workflow dimension", "uncertainty-disclosure dimension"],
      repairAction: "Restore keyboard and uncertainty usability dimensions plus a recommendation for the weakest sampled usability risk.",
      verificationCommand: "npm run audit:keyboard-readiness && npm run test:e2e",
    }),
    sample({
      id: "runtime-chain-sample",
      domain: "runtime",
      label: "Runtime and meta-evaluation receipts agree",
      source: "runtime-evidence-chain + research meta-evaluators",
      severity: "high",
      weight: 1.25,
      score: average([
        runtimeEvidenceChain.summary?.score || 0,
        researchStress.summary?.score || 0,
        evaluationIntegrity.summary?.score || 0,
        researchRigor.summary?.score || 0,
        researchStress.summary?.failing === 0 ? 100 : 0,
        evaluationIntegrity.summary?.failing === 0 ? 100 : 0,
      ]),
      passed:
        (runtimeEvidenceChain.summary?.score || 0) >= 85 &&
        (researchStress.summary?.score || 0) >= 85 &&
        (evaluationIntegrity.summary?.score || 0) >= 85 &&
        (researchRigor.summary?.score || 0) >= 85 &&
        (researchStress.summary?.failing || 0) === 0 &&
        (evaluationIntegrity.summary?.failing || 0) === 0,
      sampledItem: compact({
        runtimeChainScore: runtimeEvidenceChain.summary?.score,
        researchStressScore: researchStress.summary?.score,
        evaluationIntegrityScore: evaluationIntegrity.summary?.score,
        researchRigorScore: researchRigor.summary?.score,
      }),
      detail: `runtime=${runtimeEvidenceChain.summary?.score || 0}/100; stress=${researchStress.summary?.score || 0}/100; integrity=${evaluationIntegrity.summary?.score || 0}/100; rigor=${researchRigor.summary?.score || 0}/100.`,
      expectedFailureMode: "A current-looking evaluation score is shown while runtime or meta-evaluation receipts disagree.",
      evidence: ["runtime evidence chain", "research stress", "evaluation integrity", "research rigor"],
      repairAction: "Refresh runtime, stress, integrity, and rigor receipts until the sampled runtime chain agrees.",
      verificationCommand:
        "npm run audit:runtime-chain && npm run stress:evaluation && npm run audit:evaluation-integrity && npm run audit:research-rigor",
    }),
    sample({
      id: "design-family-sample",
      domain: "design",
      label: "Weakest design family keeps non-claims visible",
      source: "design-ambition.controlFamilies[weakest]",
      severity: "medium",
      weight: 0.9,
      score: average([
        designAmbition.summary?.score || 0,
        weakestDesignFamily?.score || 0,
        weakestDesignFamily?.evidence ? 100 : 0,
        designAmbition.nonClaims?.some((item) => /analytics|keystrokes|private/i.test(item)) ? 100 : 0,
      ]),
      passed:
        Boolean(weakestDesignFamily?.evidence) &&
        (weakestDesignFamily?.score || 0) >= 70 &&
        (designAmbition.nonClaims || []).some((item) => /analytics|keystrokes|private/i.test(item)),
      sampledItem: compact({
        id: weakestDesignFamily?.id,
        score: weakestDesignFamily?.score,
        evidence: weakestDesignFamily?.evidence,
      }),
      detail: `design=${designAmbition.summary?.score || 0}/100; sampled family=${weakestDesignFamily?.id || "missing"}; nonClaims=${designAmbition.nonClaims?.length || 0}.`,
      expectedFailureMode: "Design ambition becomes decorative and stops exposing uncertainty, public-safety limits, or evidence families.",
      evidence: ["design-ambition controlFamilies", "design-ambition nonClaims"],
      repairAction: "Restore evidence text and non-claims for the weakest sampled design-control family.",
      verificationCommand: "npm run audit:design-ambition && npm run audit:design-stability",
    }),
    sample({
      id: "route-refresh-sample",
      domain: "repeatability",
      label: "Evaluation sample is route, refresh, and script covered",
      source: "runtime route manifest + evidence refresh plan + package scripts",
      severity: "high",
      weight: 1.1,
      score: average([
        [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => publicRoutes.includes(route)) ? 100 : 0,
        refreshEndpoints.includes(ENDPOINT) ? 100 : 0,
        scripts["sample:evaluation"] ? 100 : 0,
        scripts.check?.includes("data/evaluation-sample.js") ? 100 : 0,
      ]),
      passed:
        [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => publicRoutes.includes(route)) &&
        refreshEndpoints.includes(ENDPOINT) &&
        Boolean(scripts["sample:evaluation"]) &&
        Boolean(scripts.check?.includes("data/evaluation-sample.js")),
      sampledItem: {
        endpoint: ENDPOINT,
        planEndpoint: `${ENDPOINT}/plan`,
        historyEndpoint: `${ENDPOINT}/history`,
        command: "npm run sample:evaluation",
      },
      detail: `route=${publicRoutes.includes(ENDPOINT)}; refresh=${refreshEndpoints.includes(ENDPOINT)}; script=${Boolean(scripts["sample:evaluation"])}; check=${Boolean(scripts.check?.includes("data/evaluation-sample.js"))}.`,
      expectedFailureMode: "The sampler exists as a report but cannot be repeated through routes, refresh coverage, package scripts, and syntax checks.",
      evidence: ["runtime route manifest", "safe evidence refresh plan", "package scripts"],
      repairAction: "Wire evaluation sample into the public route manifest, evidence refresh plan, package scripts, and check command.",
      verificationCommand: "npm run record:runtime-surface && npm run refresh:evidence && npm run check",
    }),
  ];
}

function sample({
  id,
  domain,
  label,
  source,
  severity,
  weight,
  score,
  passed,
  sampledItem,
  detail,
  expectedFailureMode,
  evidence,
  repairAction,
  verificationCommand,
}) {
  const normalized = clamp(Math.round(score), 0, 100);
  return {
    id,
    domain,
    label,
    source,
    severity,
    weight,
    score: normalized,
    band: bandFor(normalized),
    passed: Boolean(passed),
    sampledItem,
    detail,
    expectedFailureMode,
    evidence,
    repairAction,
    verificationCommand,
  };
}

function buildSampleMatrix(samples) {
  return Object.values(
    samples.reduce((groups, item) => {
      groups[item.domain] ||= {
        domain: item.domain,
        samples: 0,
        passing: 0,
        averageScore: 0,
        highRiskFailing: 0,
      };
      groups[item.domain].samples += 1;
      groups[item.domain].passing += item.passed ? 1 : 0;
      groups[item.domain].highRiskFailing += !item.passed && item.severity === "high" ? 1 : 0;
      return groups;
    }, {}),
  ).map((group) => ({
    ...group,
    averageScore: average(samples.filter((item) => item.domain === group.domain).map((item) => item.score)),
  }));
}

function appendEvaluationSampleReceipt(root, receipt) {
  const receipts = readEvaluationSampleReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readEvaluationSampleReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestEvaluationSampleReceipt(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return null;
  try {
    const cacheKey = receiptCacheKey(storePath);
    const cached = latestReceiptCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.receipt;
    const receipts = readEvaluationSampleReceipts(root);
    const receipt = receipts[0] || null;
    latestReceiptCache.set(storePath, { cacheKey, receipt });
    return receipt;
  } catch {
    return null;
  }
}

function readEvaluationSampleHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readEvaluationSampleReceipts(root);
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

function buildEvaluationSampleHistory({ receipts = [], limit = 20, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const summary = {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: limited[0]?.id || null,
    latestScore: limited[0]?.summary?.score || 0,
    latestPassing: limited[0]?.summary?.passing || 0,
    latestSamples: limited[0]?.summary?.samples || 0,
  };
  if (fullDetail) {
    return {
      generatedAt: new Date().toISOString(),
      mode: "research-grade-evaluation-sample-history",
      detail: "full",
      compact: false,
      sourceBoundary:
        "This endpoint returns full local evaluation-sample receipts. It does not run evaluators, contact external services, enable private routes, deploy, publish, or mutate third-party systems.",
      sideEffectBoundary:
        "The history endpoint reads local evaluation-sample receipts only and does not run evaluators, contact external services, enable private routes, deploy, publish, or mutate third-party systems.",
      receiptStore: STORE_RELATIVE_PATH,
      fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
      historyPayloadPolicy: {
        detail: "full",
        fullDetail: true,
        defaultLimit: 5,
        fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
      },
      summary,
      receipts: limited,
      nextAction: limited[0]?.nextAction || "Run npm run sample:evaluation to create evaluation sample history.",
      verificationCommand: "npm run sample:evaluation && node --test test/api-contract.test.mjs",
    };
  }

  return {
    mode: "research-grade-evaluation-sample-history",
    detail: "summary",
    compact: true,
    sourceBoundaryAvailable: true,
    sideEffectBoundaryAvailable: true,
    reportEndpoint: ENDPOINT,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: {
      fullDetail: false,
      latestReceiptPreviewOnly: true,
    },
    summary,
    receipts: limited.map((receipt, index) => summarizeEvaluationSampleReceipt(receipt, { includePreview: index === 0 })),
    nextActionAvailable: Boolean(limited[0]?.nextAction),
    verificationCommandAvailable: true,
  };
}

function summarizeEvaluationSampleReceipt(receipt, { includePreview = true } = {}) {
  if (!includePreview) {
    return {
      id: receipt.id,
      summary: summarizeEvaluationSampleTrendSummary(receipt.summary),
      latestReceiptPreviewOnly: true,
    };
  }
  const topRiskPreview = (receipt.repairQueue || []).slice(0, 2).map(({ id, domain, severity }) => ({
    id,
    domain,
    severity,
  }));
  return {
    id: receipt.id,
    checkedAt: receipt.checkedAt,
    summary: summarizeEvaluationSampleSummary(receipt.summary),
    samplePreview: selectPreviewById(receipt.samples || [], COMPACT_SAMPLE_PREVIEW_IDS, COMPACT_SAMPLE_PREVIEW_IDS.length).map(({ id, domain, passed, score }) => ({
      id,
      domain,
      passed,
      score,
    })),
    ...((receipt.repairQueue || []).length ? { topRiskCount: receipt.repairQueue.length } : {}),
    ...(topRiskPreview.length ? { topRiskPreview } : {}),
  };
}

function summarizeEvaluationSampleMethodology(methodology = {}, samples = []) {
  return {
    scale: methodology.scale,
    bandPolicy: methodology.bandPolicy,
    passPolicyAvailable: Boolean(methodology.passPolicy),
    sampleCount: samples.length || methodology.samples?.length || 0,
    domains: [...new Set((samples || methodology.samples || []).map((sample) => sample.domain).filter(Boolean))],
  };
}

function summarizeEvaluationSample(sample) {
  return {
    id: sample.id,
    domain: sample.domain,
    severity: sample.severity,
    score: sample.score,
    passed: Boolean(sample.passed),
  };
}

function selectPreviewById(items, preferredIds, limit) {
  const selected = [];
  const seen = new Set();
  const add = (item) => {
    if (!item || seen.has(item.id)) return;
    selected.push(item);
    seen.add(item.id);
  };
  for (const id of preferredIds) add(items.find((item) => item.id === id));
  for (const item of items) {
    if (selected.length >= limit) break;
    add(item);
  }
  return selected.slice(0, limit);
}

function summarizeEvaluationSampleMatrix(matrix = []) {
  return {
    domains: matrix.length,
    lowDomains: matrix.filter((item) => (item.averageScore || 0) < 70).length,
    highRiskFailingDomains: matrix.filter((item) => (item.highRiskFailing || 0) > 0).length,
  };
}

function compactEvaluationSampleNonClaims(nonClaims = []) {
  const privacy = nonClaims.find((item) => /analytics|keystrokes|private cockpit/i.test(item));
  return privacy ? [privacy] : nonClaims.slice(0, 1);
}

function summarizeSampledItem(item = {}) {
  return {
    id: item.id,
    endpoint: item.endpoint,
    planEndpoint: item.planEndpoint,
    historyEndpoint: item.historyEndpoint,
    commandAvailable: Boolean(item.command),
    score: item.score,
    topResult: item.topResult,
    packages: item.packages,
    readyForManualUse: item.readyForManualUse,
    totalMissingProof: item.totalMissingProof,
    runtimeChainScore: item.runtimeChainScore,
    researchStressScore: item.researchStressScore,
    evaluationIntegrityScore: item.evaluationIntegrityScore,
    researchRigorScore: item.researchRigorScore,
  };
}

function summarizeEvaluationSampleSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    samples: summary.samples || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    highRiskFailing: summary.highRiskFailing || 0,
    domains: summary.domains || 0,
    routeCovered: Boolean(summary.routeCovered),
    refreshCovered: Boolean(summary.refreshCovered),
    commandCovered: Boolean(summary.commandCovered),
  };
}

function summarizeEvaluationSampleTrendSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    samples: summary.samples || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, 50));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function sortedByScore(items) {
  return items.slice().sort((left, right) => Number(left.score || 0) - Number(right.score || 0));
}

function allResultsSourceTraced(searchCase) {
  const results = searchCase?.results || [];
  return results.length > 0 && results.every((result) => Array.isArray(result.sourceTrace) && result.sourceTrace.length > 0);
}

function dimensionScore(report, id) {
  return Number((report.dimensions || []).find((dimension) => dimension.id === id)?.score || 0);
}

function weightedScore(samples) {
  const totalWeight = samples.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(samples.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function sampleSeed(samples) {
  return samples.map((sample) => `${sample.id}:${sample.sampledItem?.id || sample.sampledItem?.endpoint || sample.domain}`).join("|");
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function evaluationSampleNonClaims() {
  return [
    "Does not prove independent human evaluation, academic peer review, hiring review, admissions review, or funding diligence.",
    "Does not collect visitor analytics, keystrokes, real-user monitoring, private cockpit data, credentials, inboxes, calendars, or third-party account state.",
    "Does not prove production CDN behavior, provider dashboard state, DNS propagation, or external uptime.",
    "Does not certify accessibility or screen-reader parity; scripted and sampled checks still need manual assistive-technology review.",
  ];
}

function titleize(value) {
  return String(value || "evaluation-sample")
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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

module.exports = {
  appendEvaluationSampleReceipt,
  buildEvaluationSampleHistory,
  buildEvaluationSampleReportFromReceipt,
  buildEvaluationSampleReport,
  buildEvaluationSampleResponse,
  evaluationSamplePlan,
  readEvaluationSampleHistoryWindow,
  readLatestEvaluationSampleReceipt,
  readEvaluationSampleReceipts,
};
