const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/evaluation/usability";
const STORE_RELATIVE_PATH = path.join("var", "usability-quality-receipts.json");
const USABILITY_DIMENSION_PREVIEW_LIMIT = 3;
const USABILITY_CONTROL_PREVIEW_LIMIT = 3;
const USABILITY_TOP_RISK_PREVIEW_LIMIT = 2;
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function usabilityQualityPlan() {
  return {
    mode: "command-center-usability-quality-plan",
    command: "npm run audit:usability-quality",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads the public-safe usability quality endpoint, writes a local receipt under var/, and does not deploy, publish, collect visitor analytics, enable private cockpit data, run user research, or contact third parties.",
  };
}

function buildUsabilityQualityEvaluation({
  trust,
  graphScoreboard,
  runtimeSurface,
  opportunityQuality,
  proofQuality,
  searchQuality,
  accessibilityReports = [],
  performanceReports = [],
  visualReports = [],
  refreshPlan,
  routeManifest,
  sourceSignals,
  receipts = [],
}) {
  const latestA11y = accessibilityReports[0] || null;
  const latestPerformance = performanceReports[0] || null;
  const latestVisual = visualReports[0] || null;
  const latestRuntimeSurface = runtimeSurface.latest || runtimeSurface;
  const dimensions = [
    dimension({
      id: "first-screen-proof-orientation",
      label: "First-screen proof orientation",
      score: firstScreenProofOrientationScore({ trust, graphScoreboard, runtimeSurface: latestRuntimeSurface, opportunityQuality, sourceSignals }),
      weight: 0.18,
      detail: proofOrientationDetail({ trust, graphScoreboard, runtimeSurface: latestRuntimeSurface, opportunityQuality, sourceSignals }),
      evidence: ["#proof-ribbon source", "trust summary", "graph scoreboard", "runtime surface latest", "opportunity quality"],
    }),
    dimension({
      id: "keyboard-workflow",
      label: "Keyboard workflow",
      score: keyboardWorkflowScore({ sourceSignals, latestA11y }),
      weight: 0.16,
      detail: keyboardWorkflowDetail({ sourceSignals, latestA11y }),
      evidence: ["project index keydown handler", "focus preservation source", "accessibility audit"],
    }),
    dimension({
      id: "uncertainty-disclosure",
      label: "Uncertainty disclosure",
      score: uncertaintyDisclosureScore({ trust, graphScoreboard, opportunityQuality, proofQuality, sourceSignals }),
      weight: 0.18,
      detail: uncertaintyDisclosureDetail({ trust, graphScoreboard, opportunityQuality, proofQuality, sourceSignals }),
      evidence: ["ribbon weak-signal copy", "proof-quality limitations", "graph quarantine summary", "opportunity missing proof"],
    }),
    dimension({
      id: "inspection-depth",
      label: "Inspection depth",
      score: inspectionDepthScore({ routeManifest, refreshPlan, sourceSignals, searchQuality }),
      weight: 0.16,
      detail: inspectionDepthDetail({ routeManifest, refreshPlan, sourceSignals, searchQuality }),
      evidence: ["route manifest", "terminal shortcuts", "refresh plan", "search benchmark"],
    }),
    dimension({
      id: "verification-receipts",
      label: "Verification receipts",
      score: receiptScore({ latestA11y, latestPerformance, latestVisual, latestRuntimeSurface }),
      weight: 0.16,
      detail: receiptDetail({ latestA11y, latestPerformance, latestVisual, latestRuntimeSurface }),
      evidence: ["accessibility report", "performance report", "visual report", "runtime surface receipt"],
    }),
    dimension({
      id: "mobile-resilience",
      label: "Mobile resilience",
      score: mobileResilienceScore({ sourceSignals, latestA11y, latestVisual }),
      weight: 0.16,
      detail: mobileResilienceDetail({ sourceSignals, latestA11y, latestVisual }),
      evidence: ["responsive CSS", "mobile overflow audit", "mobile visual snapshot"],
    }),
  ];
  const score = weightedScore(dimensions);
  const weakestDimensions = dimensions.slice().sort((left, right) => left.score - right.score).slice(0, 3);
  const controlBenchmarks = buildControlBenchmarks({
    sourceSignals,
    trust,
    graphScoreboard,
    runtimeSurface: latestRuntimeSurface,
    opportunityQuality,
    latestA11y,
    latestPerformance,
    latestVisual,
  });
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "command-center-usability-quality-evaluation",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This evaluation grades the local command-center source, public-safe proof APIs, and local verification receipts. It does not claim production browser analytics, real visitor comprehension, screen-reader parity, or cross-browser production quality.",
    sideEffectBoundary: usabilityQualityPlan().sideEffectBoundary,
    plan: usabilityQualityPlan(),
    methodology: {
      scale: "0-100 weighted score",
      bandPolicy: "high >= 85, medium >= 65, low < 65",
      dimensions: dimensions.map((item) => ({ id: item.id, weight: item.weight, evidence: item.evidence })),
      repeatability: "Run npm run check, npm run audit:a11y, npm run audit:performance, npm run audit:visual, and npm run record:runtime-surface to refresh the underlying receipts.",
    },
    summary: {
      score,
      band: bandFor(score),
      dimensions: dimensions.length,
      controlBenchmarks: controlBenchmarks.length,
      passingControls: controlBenchmarks.filter((item) => item.passed).length,
      failingControls: controlBenchmarks.filter((item) => !item.passed).length,
      receiptBackedDimensions: dimensions.filter((item) => item.evidence.some((source) => /report|receipt|audit/i.test(source))).length,
      proofRibbonSignals: sourceSignals.proofRibbonSignals || 0,
      keyboardShortcuts: sourceSignals.keyboardProjectKeys || 0,
      latestRuntimeSurfaceScore: latestRuntimeSurface?.summary?.score || 0,
      latestReceiptId: latestReceipt?.id || null,
    },
    dimensions,
    controlBenchmarks,
    topRisks: weakestDimensions.map((item) => ({
      id: item.id,
      label: item.label,
      score: item.score,
      recommendation: recommendationForDimension(item.id),
    })),
    recommendations: [
      ...weakestDimensions.map((item) => recommendationForDimension(item.id)),
      "Keep the proof ribbon honest: weak claim counts, missing proof counts, and graph coverage should stay visible instead of being hidden behind positive badges.",
    ],
    limitations: [
      "The score uses deterministic local heuristics and receipts, not live user research.",
      "The accessibility input is scripted and should still be paired with manual keyboard and screen-reader review.",
      "Visual and performance receipts are local snapshots; production CDN, browser, and device diversity are not covered.",
    ],
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passingControls: latestReceipt.summary?.passingControls || 0,
          controlBenchmarks: latestReceipt.summary?.controlBenchmarks || 0,
        }
      : null,
    verificationCommand:
      "npm run audit:usability-quality && npm run audit:a11y && npm run audit:performance && npm run audit:visual && npm run record:runtime-surface",
  };
}

function buildUsabilityQualityEvaluationFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "command-center-usability-quality-receipt" || !receipt.summary) return null;
  if (
    !Array.isArray(receipt.dimensions) ||
    !receipt.dimensions.every((dimension) => dimension.id && dimension.label && dimension.detail && Array.isArray(dimension.evidence)) ||
    !Array.isArray(receipt.controlBenchmarks) ||
    !receipt.controlBenchmarks.every((benchmark) => benchmark.id && benchmark.label && benchmark.detail && benchmark.nextAction && benchmark.verificationCommand) ||
    !Array.isArray(receipt.topRisks) ||
    !Array.isArray(receipt.recommendations) ||
    !Array.isArray(receipt.limitations)
  ) {
    return null;
  }

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "command-center-usability-quality-evaluation",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      receipt.sourceBoundary ||
      "This response reconstructs usability quality from the latest local receipt. It is a fast public-safe cached report, not fresh UI inspection, live user research, production analytics, screen-reader parity, or browser/device-lab validation.",
    sideEffectBoundary: receipt.sideEffectBoundary || usabilityQualityPlan().sideEffectBoundary,
    plan: usabilityQualityPlan(),
    methodology:
      receipt.methodology || {
        scale: "0-100 weighted score",
        bandPolicy: "high >= 85, medium >= 65, low < 65",
        repeatability: "Run npm run audit:usability-quality or /api/evaluation/usability?refresh=1 to refresh this cached report.",
      },
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    dimensions: receipt.dimensions.map((dimension) => ({
      id: dimension.id,
      label: dimension.label,
      score: clamp(Math.round(dimension.score || 0), 0, 100),
      band: dimension.band || bandFor(dimension.score || 0),
      weight: Number.isFinite(dimension.weight) ? dimension.weight : 0,
      detail: dimension.detail,
      evidence: dimension.evidence,
    })),
    controlBenchmarks: receipt.controlBenchmarks.map((benchmark) => ({
      id: benchmark.id,
      label: benchmark.label,
      passed: Boolean(benchmark.passed),
      detail: benchmark.detail,
      nextAction: benchmark.nextAction,
      verificationCommand: benchmark.verificationCommand || verificationCommandForControl(benchmark.id),
    })),
    topRisks: receipt.topRisks,
    recommendations: receipt.recommendations,
    limitations: receipt.limitations,
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passingControls: receipt.summary?.passingControls || 0,
      controlBenchmarks: receipt.summary?.controlBenchmarks || 0,
    },
    verificationCommand:
      receipt.verificationCommand ||
      "npm run audit:usability-quality && npm run audit:a11y && npm run audit:performance && npm run audit:visual && npm run record:runtime-surface",
  };
}

function buildUsabilityQualityEvaluationResponse(evaluation, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...evaluation,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      usabilityQualityPayloadPolicy: usabilityQualityPayloadPolicy({ evaluation, fullDetail }),
    };
  }

  const dimensions = evaluation.dimensions || [];
  const controls = evaluation.controlBenchmarks || [];
  return {
    mode: evaluation.mode,
    cachedFromReceipt: Boolean(evaluation.cachedFromReceipt),
    cachePolicy: evaluation.cachePolicy,
    refreshEndpoint: evaluation.refreshEndpoint || `${ENDPOINT}?refresh=1`,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeUsabilityQualityEvaluationSummary(evaluation.summary),
    dimensions: selectUsabilityQualityPreview(dimensions, USABILITY_DIMENSION_PREVIEW_LIMIT, ["keyboard-workflow"]).map(summarizeUsabilityQualityDimension),
    controlBenchmarks: selectUsabilityQualityPreview(controls, USABILITY_CONTROL_PREVIEW_LIMIT, ["runtime-surface-shortcut"]).map(summarizeUsabilityQualityControl),
    topRisks: (evaluation.topRisks || []).slice(0, USABILITY_TOP_RISK_PREVIEW_LIMIT).map(({ id, score }) => ({ id, score })),
    recommendationCount: (evaluation.recommendations || []).length,
    limitationCount: (evaluation.limitations || []).length,
    usabilityQualityPayloadPolicy: usabilityQualityPayloadPolicy({ evaluation, fullDetail }),
  };
}

function summarizeUsabilityQualityPlan(plan = usabilityQualityPlan()) {
  return {
    command: plan.command,
    endpoint: plan.endpoint,
    planEndpoint: `${ENDPOINT}/plan`,
  };
}

function summarizeUsabilityQualityMethodology(methodology = {}) {
  return {
    dimensionCount: (methodology.dimensions || []).length,
    repeatabilityAvailable: Boolean(methodology.repeatability),
  };
}

function summarizeUsabilityQualityEvaluationSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    dimensions: summary.dimensions || 0,
    controlBenchmarks: summary.controlBenchmarks || 0,
    passingControls: summary.passingControls || 0,
    failingControls: summary.failingControls || 0,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function summarizeUsabilityQualityDimension(dimension) {
  return {
    id: dimension.id,
    score: dimension.score,
  };
}

function summarizeUsabilityQualityControl(benchmark) {
  return {
    id: benchmark.id,
    passed: Boolean(benchmark.passed),
  };
}

function usabilityQualityPayloadPolicy({ evaluation, fullDetail }) {
  const dimensions = evaluation.dimensions?.length || 0;
  const controls = evaluation.controlBenchmarks?.length || 0;
  if (!fullDetail) {
    return {
      fullDetail: false,
      fullDetailAvailable: true,
      dimensionsReturned: Math.min(dimensions, USABILITY_DIMENSION_PREVIEW_LIMIT),
      controlBenchmarksReturned: Math.min(controls, USABILITY_CONTROL_PREVIEW_LIMIT),
    };
  }
  return {
    fullDetail: true,
    compact: false,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    dimensionsReturned: dimensions,
    controlBenchmarksReturned: controls,
    recommendationsReturned: evaluation.recommendations?.length || 0,
    limitationsReturned: evaluation.limitations?.length || 0,
    compactShape: "full",
  };
}

function selectUsabilityQualityPreview(items, limit, requiredIds = []) {
  const selected = [];
  for (const id of requiredIds) {
    const match = items.find((item) => item.id === id);
    if (match && !selected.includes(match)) selected.push(match);
  }
  for (const item of items) {
    if (selected.length >= limit) break;
    if (!selected.includes(item)) selected.push(item);
  }
  return selected.slice(0, limit);
}

function summarizeUsabilityLatestReceipt(receipt) {
  return {
    id: receipt.id,
    score: receipt.score,
    passingControls: receipt.passingControls,
    controlBenchmarks: receipt.controlBenchmarks,
  };
}

function appendUsabilityQualityReceipt(root, receipt) {
  const receipts = readUsabilityQualityReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readUsabilityQualityReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestUsabilityQualityReceipt(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return null;
  try {
    const cacheKey = receiptCacheKey(storePath);
    const cached = latestReceiptCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.receipt;
    const text = readFileSync(storePath, "utf8");
    const receiptsIndex = text.indexOf('"receipts"');
    const arrayStart = receiptsIndex === -1 ? -1 : text.indexOf("[", receiptsIndex);
    const objectStart = arrayStart === -1 ? -1 : text.indexOf("{", arrayStart);
    if (objectStart === -1) return null;
    const objectEnd = findJsonObjectEnd(text, objectStart);
    if (objectEnd === -1) return null;
    const receipt = JSON.parse(text.slice(objectStart, objectEnd + 1));
    latestReceiptCache.set(storePath, { cacheKey, receipt });
    return receipt;
  } catch {
    return null;
  }
}

function readUsabilityQualityHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readUsabilityQualityReceipts(root);
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

function buildUsabilityQualityHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const compactRows = fullDetail ? limited : limited.slice(0, 1);
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "command-center-usability-quality-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "This endpoint returns full local usability-quality receipts. It does not deploy, publish, run user research, collect analytics, enable private cockpit data, or contact third parties."
      : undefined,
    sideEffectBoundary: fullDetail
      ? "The history endpoint reads local usability-quality receipts only. It does not deploy, publish, run user research, collect analytics, enable private cockpit data, or contact third parties."
      : undefined,
    boundaryAvailable: undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: usabilityQualityHistoryPayloadPolicy({ fullDetail, returnedReceipts: compactRows.length }),
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
    },
    definitions: undefined,
    receipts: fullDetail ? limited : compactRows.map((receipt, index) => summarizeUsabilityQualityReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Usability quality history is available; run npm run audit:usability-quality after UI, proof ribbon, keyboard, runtime-surface, a11y, performance, or visual changes."
        : "Run npm run audit:usability-quality to create usability quality history."
      : undefined,
    nextActionAvailable: undefined,
    verificationCommand: fullDetail ? "npm run audit:usability-quality && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: undefined,
  };
}

function summarizeUsabilityQualityHistoryDefinitions(receipt) {
  return {
    evidenceAccess: {
      fullReportEndpoint: ENDPOINT,
    },
    receiptShapeAvailable: Boolean(receipt),
  };
}

function usabilityQualityHistoryPayloadPolicy({ fullDetail, returnedReceipts }) {
  if (!fullDetail) {
    return {
      fullDetail: false,
      historyRowsReturned: returnedReceipts,
    };
  }
  return {
    fullDetail: true,
    fullReportEndpoint: ENDPOINT,
    fullHistoryEndpoint: `${ENDPOINT}/history?detail=full`,
    returnedReceipts,
    latestReceiptPreview: "raw",
    olderReceiptPreview: "raw",
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function summarizeUsabilityQualityReceipt(receipt, { includePreview = true } = {}) {
  const summary = summarizeUsabilityQualitySummary(receipt.summary);
  const compactSummary = {
    score: summary.score,
    band: summary.band,
    passingControls: summary.passingControls,
    failingControls: summary.failingControls,
  };
  const dimensions = receipt.dimensions || [];
  const controlBenchmarks = receipt.controlBenchmarks || [];
  const dimensionScores = selectUsabilityQualityPreview(dimensions, 2, ["keyboard-workflow"]).map((dimension) => ({
    id: dimension.id,
    score: dimension.score,
  }));
  const controls = selectUsabilityQualityPreview(controlBenchmarks, 2, ["runtime-surface-shortcut"]).map((benchmark) => ({
    id: benchmark.id,
    passed: Boolean(benchmark.passed),
  }));
  const failingControlIds = controlBenchmarks.filter((benchmark) => !benchmark.passed).map((benchmark) => benchmark.id);
  const topRiskIds = (receipt.topRisks || []).map((risk) => risk.id);
  const compact = {
    id: receipt.id,
    summary: compactSummary,
    dimensionCount: dimensions.length,
    dimensionScores,
    controlCount: controlBenchmarks.length,
    controls,
    failingControlCount: failingControlIds.length,
    topRiskCount: topRiskIds.length,
    recommendationCount: (receipt.recommendations || []).length,
    limitationCount: (receipt.limitations || []).length,
  };
  if (!includePreview) {
    return {
      id: receipt.id,
      latestReceiptPreviewOnly: true,
      trendSummary: {
        score: summary.score,
        band: summary.band,
        passingControls: summary.passingControls,
        failingControls: summary.failingControls,
      },
    };
  }
  return compact;
}

function summarizeUsabilityQualitySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    dimensions: summary.dimensions || 0,
    controlBenchmarks: summary.controlBenchmarks || 0,
    passingControls: summary.passingControls || 0,
    failingControls: summary.failingControls || 0,
    receiptBackedDimensions: summary.receiptBackedDimensions || 0,
    proofRibbonSignals: summary.proofRibbonSignals || 0,
    keyboardShortcuts: summary.keyboardShortcuts || 0,
    latestRuntimeSurfaceScore: summary.latestRuntimeSurfaceScore || 0,
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 5, 100));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

function findJsonObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function buildControlBenchmarks({
  sourceSignals,
  trust,
  graphScoreboard,
  runtimeSurface,
  opportunityQuality,
  latestA11y,
  latestPerformance,
  latestVisual,
}) {
  return [
    controlBenchmark({
      id: "proof-ribbon",
      label: "Proof ribbon exposes current weak and strong signals",
      passed:
        sourceSignals.hasProofRibbon &&
        sourceSignals.proofRibbonSignals >= 4 &&
        trust.counts.needsSourceClaims > 0 &&
        graphScoreboard.summary.score < 100 &&
        opportunityQuality.summary.totalMissingProof > 0,
      detail: `${sourceSignals.proofRibbonSignals || 0} ribbon signal(s); ${trust.counts.needsSourceClaims} needs-source claim(s); ${opportunityQuality.summary.totalMissingProof} missing proof item(s).`,
      nextAction: "Keep #proof-ribbon connected to trust, graph, runtime surface, and opportunity quality data.",
    }),
    controlBenchmark({
      id: "keyboard-project-nav",
      label: "Project index supports keyboard navigation",
      passed: sourceSignals.hasProjectKeyboardNav && sourceSignals.keyboardProjectKeys >= 4 && sourceSignals.preservesProjectFocus,
      detail: `${sourceSignals.keyboardProjectKeys || 0} key path(s); focus preservation ${sourceSignals.preservesProjectFocus}.`,
      nextAction: "Preserve ArrowUp/ArrowDown/Home/End project navigation and focus after async case-study refresh.",
    }),
    controlBenchmark({
      id: "runtime-surface-shortcut",
      label: "Runtime surface proof is one command away",
      passed: sourceSignals.hasRuntimeSurfaceShortcut && runtimeSurface?.summary?.score >= 95,
      detail: `shortcut ${sourceSignals.hasRuntimeSurfaceShortcut}; runtime surface ${runtimeSurface?.summary?.score || 0}/100.`,
      nextAction: "Keep runtime-surface in terminal shortcuts and rerun npm run record:runtime-surface after route changes.",
    }),
    controlBenchmark({
      id: "scripted-accessibility",
      label: "Scripted accessibility pass is available",
      passed: latestA11y?.summary?.failing === 0 && latestA11y?.summary?.total >= 8,
      detail: latestA11y ? `${latestA11y.summary.passing}/${latestA11y.summary.total} a11y check(s) passing.` : "no a11y receipt",
      nextAction: "Run npm run audit:a11y after major rendered UI changes.",
    }),
    controlBenchmark({
      id: "performance-budget",
      label: "Performance budget receipt is passing",
      passed: latestPerformance?.summary?.failing === 0 && latestPerformance?.summary?.total >= 7,
      detail: latestPerformance ? `${latestPerformance.summary.passing}/${latestPerformance.summary.total} performance budget(s); slowest ${latestPerformance.summary.slowestMs}ms.` : "no performance receipt",
      nextAction: "Run npm run audit:performance after runtime bundle or API surface changes.",
    }),
    controlBenchmark({
      id: "visual-baseline",
      label: "Visual regression baseline is stable",
      passed: latestVisual?.summary?.failing === 0 && latestVisual?.summary?.changed === 0,
      detail: latestVisual ? `${latestVisual.summary.passing}/${latestVisual.summary.total} visual check(s); ${latestVisual.summary.changed} changed.` : "no visual receipt",
      nextAction: "Run npm run audit:visual after UI changes and accept only intentional visual changes.",
    }),
  ];
}

function firstScreenProofOrientationScore({ trust, graphScoreboard, runtimeSurface, opportunityQuality, sourceSignals }) {
  return average([
    sourceSignals.hasProofRibbon ? 100 : 0,
    percent(sourceSignals.proofRibbonSignals || 0, 4),
    trust?.counts?.totalClaims ? 100 : 0,
    graphScoreboard?.summary?.score ? 100 : 0,
    runtimeSurface?.summary?.score || 0,
    opportunityQuality?.summary?.packages ? 100 : 0,
  ]);
}

function proofOrientationDetail({ trust, graphScoreboard, runtimeSurface, opportunityQuality, sourceSignals }) {
  return `${sourceSignals.proofRibbonSignals || 0} ribbon signal(s); ${trust.counts.totalClaims} claim(s); graph ${graphScoreboard.summary.score}/100; runtime surface ${runtimeSurface?.summary?.score || 0}/100; ${opportunityQuality.summary.packages} opportunity package(s).`;
}

function keyboardWorkflowScore({ sourceSignals, latestA11y }) {
  return average([
    sourceSignals.hasProjectKeyboardNav ? 100 : 0,
    percent(sourceSignals.keyboardProjectKeys || 0, 4),
    sourceSignals.preservesProjectFocus ? 100 : 0,
    latestA11y?.summary?.failing === 0 ? 100 : 0,
  ]);
}

function keyboardWorkflowDetail({ sourceSignals, latestA11y }) {
  return `${sourceSignals.keyboardProjectKeys || 0}/4 project-navigation key(s); focus preserved ${sourceSignals.preservesProjectFocus}; a11y receipt ${latestA11y ? `${latestA11y.summary.passing}/${latestA11y.summary.total}` : "missing"}.`;
}

function uncertaintyDisclosureScore({ trust, graphScoreboard, opportunityQuality, proofQuality, sourceSignals }) {
  const weakSignals = [
    trust.counts.needsSourceClaims > 0 && sourceSignals.exposesNeedsSource,
    graphScoreboard.summary.score < 100 && sourceSignals.exposesGraphCoverage,
    opportunityQuality.summary.totalMissingProof > 0 && sourceSignals.exposesMissingProof,
    proofQuality.limitations?.length >= 3,
    graphScoreboard.summary.quarantineCandidates > 0,
  ];
  return percent(weakSignals.filter(Boolean).length, weakSignals.length);
}

function uncertaintyDisclosureDetail({ trust, graphScoreboard, opportunityQuality, proofQuality, sourceSignals }) {
  return `${trust.counts.needsSourceClaims} needs-source claim(s), ${graphScoreboard.summary.quarantineCandidates} graph quarantine candidate(s), ${opportunityQuality.summary.totalMissingProof} missing proof item(s), ${proofQuality.limitations?.length || 0} proof-quality limitation(s). Ribbon copy exposes weak signals: ${sourceSignals.exposesNeedsSource && sourceSignals.exposesGraphCoverage && sourceSignals.exposesMissingProof}.`;
}

function inspectionDepthScore({ routeManifest, refreshPlan, sourceSignals, searchQuality }) {
  const requiredRoutes = ["/api/evaluation/proof-quality", "/api/evaluation/search-quality", "/api/evaluation/opportunity-quality", "/api/evaluation/usability", "/api/runtime-surface/latest"];
  const routeCoverage = percent(requiredRoutes.filter((route) => routeManifest.publicApiRoutes.includes(route)).length, requiredRoutes.length);
  const refreshCoverage = percent(requiredRoutes.filter((route) => (refreshPlan.endpoints || []).includes(route)).length, requiredRoutes.length);
  return average([
    routeCoverage,
    refreshCoverage,
    percent(sourceSignals.terminalShortcuts || 0, 5),
    searchQuality.summary.score,
  ]);
}

function inspectionDepthDetail({ routeManifest, refreshPlan, sourceSignals, searchQuality }) {
  return `${routeManifest.publicApiRoutes.length} public route declaration(s); ${refreshPlan.endpoints.length} refresh endpoint(s); ${sourceSignals.terminalShortcuts || 0} terminal shortcut(s); search benchmark ${searchQuality.summary.score}/100.`;
}

function receiptScore({ latestA11y, latestPerformance, latestVisual, latestRuntimeSurface }) {
  return average([
    receiptPassScore(latestA11y),
    receiptPassScore(latestPerformance),
    receiptPassScore(latestVisual),
    latestRuntimeSurface?.summary?.score || 0,
  ]);
}

function receiptDetail({ latestA11y, latestPerformance, latestVisual, latestRuntimeSurface }) {
  return `a11y ${receiptSummary(latestA11y)}, performance ${receiptSummary(latestPerformance)}, visual ${receiptSummary(latestVisual)}, runtime surface ${latestRuntimeSurface?.summary?.score || 0}/100.`;
}

function mobileResilienceScore({ sourceSignals, latestA11y, latestVisual }) {
  const mobileOverflow = latestA11y?.checks?.find((check) => check.id === "mobile-horizontal-overflow");
  const mobileVisual = latestVisual?.checks?.find((check) => /mobile/i.test(check.id));
  return average([
    sourceSignals.hasResponsiveProofRibbon ? 100 : 0,
    mobileOverflow?.passed ? 100 : 0,
    mobileVisual?.passed ? 100 : 0,
    sourceSignals.hasOverflowWrapGuards ? 100 : 0,
  ]);
}

function mobileResilienceDetail({ sourceSignals, latestA11y, latestVisual }) {
  const mobileOverflow = latestA11y?.checks?.find((check) => check.id === "mobile-horizontal-overflow");
  const mobileVisual = latestVisual?.checks?.find((check) => /mobile/i.test(check.id));
  return `responsive ribbon ${sourceSignals.hasResponsiveProofRibbon}; mobile overflow ${mobileOverflow?.passed || false}; mobile visual ${mobileVisual?.passed || false}; wrap guards ${sourceSignals.hasOverflowWrapGuards}.`;
}

function controlBenchmark({ id, label, passed, detail, nextAction }) {
  return {
    id,
    label,
    passed: Boolean(passed),
    detail,
    nextAction,
    verificationCommand: verificationCommandForControl(id),
  };
}

function verificationCommandForControl(id) {
  return {
    "proof-ribbon": "npm run test:e2e",
    "keyboard-project-nav": "npm run test:e2e",
    "runtime-surface-shortcut": "npm run record:runtime-surface",
    "scripted-accessibility": "npm run audit:a11y",
    "performance-budget": "npm run audit:performance",
    "visual-baseline": "npm run audit:visual",
  }[id];
}

function recommendationForDimension(id) {
  return {
    "first-screen-proof-orientation": "Keep the first command-center viewport connected to proof health, graph coverage, runtime surface, and opportunity readiness.",
    "keyboard-workflow": "Preserve keyboard traversal for project selection and verify focus after async case-study rendering.",
    "uncertainty-disclosure": "Expose weak claims, graph quarantine pressure, and missing opportunity proof in visible UI copy.",
    "inspection-depth": "Keep evaluation, runtime, and evidence endpoints reachable through APIs, refresh receipts, and terminal shortcuts.",
    "verification-receipts": "Refresh a11y, performance, visual, and runtime-surface receipts after UI/runtime changes.",
    "mobile-resilience": "Maintain fixed responsive grid constraints, overflow guards, and mobile visual snapshots.",
  }[id];
}

function receiptPassScore(receipt) {
  if (!receipt?.summary) return 0;
  if (typeof receipt.summary.score === "number") return receipt.summary.score;
  return percent(receipt.summary.passing || 0, receipt.summary.total || 0);
}

function receiptSummary(receipt) {
  if (!receipt?.summary) return "missing";
  if (typeof receipt.summary.score === "number") return `${receipt.summary.score}/100`;
  return `${receipt.summary.passing || 0}/${receipt.summary.total || 0}`;
}

function dimension({ id, label, score, weight, detail, evidence }) {
  const normalized = clamp(Math.round(score), 0, 100);
  return {
    id,
    label,
    score: normalized,
    band: bandFor(normalized),
    weight,
    detail,
    evidence,
  };
}

function weightedScore(dimensions) {
  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
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

module.exports = {
  appendUsabilityQualityReceipt,
  buildUsabilityQualityHistory,
  buildUsabilityQualityEvaluationResponse,
  buildUsabilityQualityEvaluationFromReceipt,
  buildUsabilityQualityEvaluation,
  readLatestUsabilityQualityReceipt,
  readUsabilityQualityHistoryWindow,
  readUsabilityQualityReceipts,
  usabilityQualityPlan,
};
