const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/design-ambition";
const STORE_RELATIVE_PATH = path.join("var", "design-ambition-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function designAmbitionPlan() {
  return {
    mode: "command-center-design-ambition-plan",
    command: "npm run audit:design-ambition",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing command-center layout, terminal shortcuts, proof ribbon, truth ledger, keyboard routes, runtime proof controls, or responsive control density.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe design ambition endpoints, writes a local receipt under var/, and does not deploy, publish, collect visitor analytics, enable private cockpit data, contact third parties, or mutate external systems.",
  };
}

function buildDesignAmbitionReport({
  designStability,
  keyboardReadiness,
  usabilityQuality,
  runtimeEvidenceChain,
  routeManifest,
  refreshPlan,
  packageManifest,
  sourceSignals,
  receipts = [],
}) {
  const controlFamilies = buildControlFamilies({ sourceSignals, designStability, keyboardReadiness, usabilityQuality, runtimeEvidenceChain });
  const checks = ambitionChecks({
    controlFamilies,
    designStability,
    keyboardReadiness,
    usabilityQuality,
    runtimeEvidenceChain,
    routeManifest,
    refreshPlan,
    packageManifest,
    sourceSignals,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "command-center-design-ambition",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This audit compresses local command-center design ambition into proof orientation, runtime truth access, keyboard density, responsive resilience, and uncertainty-preserving control families. It does not claim live visitor comprehension, production analytics, full assistive-technology parity, CDN behavior, or cross-browser device-lab coverage.",
    sideEffectBoundary:
      "This endpoint reads public-safe source signals, in-memory evaluation reports, and local receipt history only. It does not mutate UI state, collect analytics, start recorders, deploy, enable private cockpit data, or contact third parties.",
    plan: designAmbitionPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      controlFamilies: controlFamilies.length,
      passingFamilies: controlFamilies.filter((family) => family.passed).length,
      terminalShortcuts: sourceSignals.terminalShortcutsCount || 0,
      proofRibbonSignals: sourceSignals.proofRibbonSignals || 0,
      proofRibbonActions: sourceSignals.proofRibbonActionCount || 0,
      runtimeChainScore: runtimeEvidenceChain.summary?.score || 0,
      usabilityScore: usabilityQuality.summary?.score || 0,
      designStabilityScore: designStability.summary?.score || 0,
      keyboardReadinessScore: keyboardReadiness.summary?.score || 0,
      stabilityMatrixItems: designStability.summary?.stabilityMatrixItems || designStability.controlStabilityMatrix?.length || 0,
      stabilityMatrixPassing:
        designStability.summary?.stabilityMatrixPassing ||
        (designStability.controlStabilityMatrix || []).filter((item) => item.passed).length,
      responsiveFallbacks: designStability.summary?.responsiveFallbacks || 0,
      keyboardSafeSurfaces: designStability.summary?.keyboardSafeSurfaces || 0,
      latestReceiptId: latestReceipt?.id || null,
      routeCovered: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
    },
    ambitionContract: {
      northStar:
        "Every high-stakes proof, runtime, design, and opportunity surface should be reachable from the command center without hiding uncertainty or requiring private data.",
      compressionRule:
        "Keep first-screen proof health, truth-ledger drilldowns, terminal shortcuts, keyboard navigation, mobile control geometry, and the stability matrix in one coherent control system.",
      publicSafetyRule:
        "Design ambition may make evidence easier to inspect, but must not imply external outcomes, private access, analytics insight, or production parity.",
    },
    controlFamilies,
    checks,
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
    nonClaims: [
      "Does not prove live visitor comprehension, conversion, admissions, hiring, funding, interviews, or audience interest.",
      "Does not prove full screen-reader or assistive-technology parity; manual review is still required.",
      "Does not prove production CDN, DNS, provider dashboard, or cross-browser device-lab behavior.",
      "Does not collect analytics, keystrokes, private cockpit data, or third-party account state.",
    ],
    nextAction:
      failing[0]?.repairAction ||
      "Design ambition is locally compressed into a commandable proof surface; rerun after UI, shortcut, runtime, proof, or responsive layout changes.",
    verificationCommand:
      "npm run audit:design-ambition && npm run audit:design-stability && npm run audit:keyboard-readiness && npm run test:e2e && npm run verify",
  };
}

function buildDesignAmbitionReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "command-center-design-ambition-receipt" || !receipt.summary) return null;
  if (
    !Array.isArray(receipt.controlFamilies) ||
    !receipt.controlFamilies.every((family) => family.id && family.label && family.evidence && family.verificationCommand) ||
    !Array.isArray(receipt.checks) ||
    !receipt.checks.every((check) => check.id && check.detail && check.verificationCommand)
  ) {
    return null;
  }

  const checks = receipt.checks.map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail,
    repairAction: check.repairAction || "Run npm run audit:design-ambition or /api/design-ambition?refresh=1 to refresh this cached check.",
    verificationCommand: check.verificationCommand || "npm run audit:design-ambition",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "command-center-design-ambition",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs command-center design ambition from the latest local receipt. It is a fast public-safe cached report, not fresh UI inspection, live visitor comprehension, analytics evidence, assistive-technology parity, production CDN proof, or cross-browser device-lab validation.",
    sideEffectBoundary: receipt.sideEffectBoundary || designAmbitionPlan().sideEffectBoundary,
    plan: designAmbitionPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    ambitionContract: receipt.ambitionContract || {
      northStar:
        "Every high-stakes proof, runtime, design, and opportunity surface should be reachable from the command center without hiding uncertainty or requiring private data.",
      compressionRule:
        "Cached receipts preserve the last recorded first-screen proof health, truth-ledger drilldowns, terminal shortcuts, keyboard navigation, mobile control geometry, and stability matrix.",
      publicSafetyRule:
        "Design ambition may make evidence easier to inspect, but must not imply external outcomes, private access, analytics insight, or production parity.",
    },
    controlFamilies: receipt.controlFamilies.map((family) => ({
      id: family.id,
      label: family.label,
      score: clamp(Math.round(family.score || 0), 0, 100),
      band: family.band || bandFor(family.score || 0),
      passed: Boolean(family.passed),
      evidence: family.evidence,
      verificationCommand: family.verificationCommand || "npm run audit:design-ambition",
    })),
    checks,
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
    nonClaims:
      receipt.nonClaims || [
        "Does not prove live visitor comprehension, conversion, admissions, hiring, funding, interviews, or audience interest.",
        "Does not prove full screen-reader or assistive-technology parity; manual review is still required.",
        "Does not prove production CDN, DNS, provider dashboard, or cross-browser device-lab behavior.",
        "Does not collect analytics, keystrokes, private cockpit data, or third-party account state.",
      ],
    nextAction:
      receipt.nextAction ||
      failing[0]?.repairAction ||
      "Design ambition is served from the latest local receipt; run npm run audit:design-ambition or /api/design-ambition?refresh=1 after UI, shortcut, runtime, proof, or responsive layout changes.",
    verificationCommand:
      receipt.verificationCommand ||
      "npm run audit:design-ambition && npm run audit:design-stability && npm run audit:keyboard-readiness && npm run test:e2e && npm run verify",
  };
}

function buildDesignAmbitionResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      designAmbitionPayloadPolicy: designAmbitionPayloadPolicy({ report, fullDetail }),
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    boundariesAvailable: Boolean(report.sourceBoundary && report.sideEffectBoundary),
    planAvailable: Boolean(report.plan),
    summary: summarizeDesignAmbitionSummary(report.summary),
    ambitionContractAvailable: Boolean(report.ambitionContract),
    controlFamilies: compactDesignAmbitionFamilies(report.controlFamilies || []),
    controlFamilyCount: (report.controlFamilies || []).length,
    checks: compactDesignAmbitionChecks(report.checks || []),
    checkCount: (report.checks || []).length,
    repairActionCount: (report.repairActions || []).length,
    latestReceiptId: report.latestReceipt?.id || report.summary?.latestReceiptId || null,
    nonClaimCount: (report.nonClaims || []).length,
    nonClaimsAvailable: (report.nonClaims || []).length > 0,
    nextActionAvailable: Boolean(report.nextAction),
    verificationCommandAvailable: Boolean(report.verificationCommand),
    designAmbitionPayloadPolicy: designAmbitionPayloadPolicy({ report, fullDetail }),
  };
}

function summarizeDesignAmbitionPlan(plan = designAmbitionPlan()) {
  return {
    command: plan.command,
    endpoint: plan.endpoint,
  };
}

function compactDesignAmbitionFamilies(families = []) {
  const priorityIds = ["proof-orientation", "runtime-truth-access", "stability-matrix"];
  return selectDefinitionIds(families, priorityIds)
    .map((id) => families.find((family) => family.id === id))
    .filter(Boolean)
    .map(summarizeDesignAmbitionFamily);
}

function summarizeDesignAmbitionFamily(family) {
  return {
    id: family.id,
    passed: Boolean(family.passed),
  };
}

function compactDesignAmbitionChecks(checks = []) {
  const priorityIds = ["first-screen-proof-compression", "runtime-chain-visible", "stability-matrix-visible"];
  return selectDefinitionIds(checks, priorityIds)
    .map((id) => checks.find((check) => check.id === id))
    .filter(Boolean)
    .map(summarizeDesignAmbitionCheck);
}

function summarizeDesignAmbitionCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function designAmbitionPayloadPolicy({ report, fullDetail }) {
  const controlFamilies = report.controlFamilies || [];
  const checks = report.checks || [];
  const repairActions = report.repairActions || [];
  const nonClaims = report.nonClaims || [];
  if (!fullDetail) {
    return {
      fullDetail,
      compact: true,
      fullDetailAvailable: true,
      controlFamilyPreviewReturned: Math.min(controlFamilies.length, 3),
      checksPreviewReturned: Math.min(checks.length, 3),
      familyDetailAvailable: controlFamilies.some((family) => Boolean(family.evidence || family.verificationCommand)),
      checkDetailAvailable: checks.some((check) => Boolean(check.detail || check.repairAction || check.verificationCommand)),
    };
  }
  return {
    fullDetail,
    compact: false,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    controlFamiliesReturned: controlFamilies.length,
    checksReturned: checks.length,
    repairActionsReturned: repairActions.length,
    nonClaimsReturned: nonClaims.length,
    familyEvidenceAvailable: controlFamilies.some((family) => Boolean(family.evidence)),
    familyVerificationCommandAvailable: controlFamilies.some((family) => Boolean(family.verificationCommand)),
    checkDetailAvailable: checks.some((check) => Boolean(check.detail)),
    checkRepairActionAvailable: checks.some((check) => Boolean(check.repairAction)),
    checkVerificationCommandAvailable: checks.some((check) => Boolean(check.verificationCommand)),
  };
}

function appendDesignAmbitionReceipt(root, receipt) {
  const receipts = readDesignAmbitionReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function buildDesignAmbitionHistory({ receipts = [], limit = 20, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "command-center-design-ambition-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local design ambition receipts. It is still not fresh UI inspection, analytics evidence, assistive-technology parity, production proof, or cross-browser device-lab validation.",
          sideEffectBoundary:
            "The history endpoint reads local design ambition receipts only. It does not mutate UI state, collect analytics, start recorders, deploy, enable private cockpit data, or contact third parties.",
        }
      : {}),
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail,
          defaultLimit: 5,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
        }
      : {
          fullDetail,
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
        },
    summary: designAmbitionHistorySummary({ limited, totalAvailable, boundedLimit, latest, fullDetail }),
    definitions: fullDetail ? undefined : summarizeDesignAmbitionDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeDesignAmbitionReceipt(receipt, { includeOutcomes: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Design ambition history is available; run npm run audit:design-ambition after UI, shortcut, runtime, proof, or responsive layout changes."
        : "Run npm run audit:design-ambition to create design ambition history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:design-ambition && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeDesignAmbitionDefinitions(receipt) {
  const controlFamilies = receipt?.controlFamilies || [];
  const checks = receipt?.checks || [];
  return {
    counts: {
      controlFamilies: controlFamilies.length,
      checks: checks.length,
    },
    controlFamilyIds: selectDefinitionIds(controlFamilies, ["proof-orientation", "stability-matrix", "keyboard-density"]),
    checkIds: selectDefinitionIds(checks, ["first-screen-proof-compression", "critical-shortcut-compression", "runtime-chain-visible"]),
  };
}

function readDesignAmbitionReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestDesignAmbitionReceipt(root) {
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

function readDesignAmbitionHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readDesignAmbitionReceipts(root);
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

function summarizeDesignAmbitionReceipt(receipt, { includeOutcomes = true } = {}) {
  const controlFamilies = receipt.controlFamilies || [];
  const checks = receipt.checks || [];
  if (!includeOutcomes) {
    return {
      id: receipt.id,
      latestReceiptPreviewOnly: true,
      trendSummary: summarizeDesignAmbitionHistoryTrend(receipt.summary),
    };
  }

  const summary = {
    id: receipt.id,
    summary: summarizeDesignAmbitionHistoryReceiptSummary(receipt.summary),
    controlFamilySummary: {
      total: controlFamilies.length,
      failing: controlFamilies.filter((family) => !family.passed).length,
    },
    checkSummary: {
      total: checks.length,
      failing: checks.filter((check) => !check.passed).length,
    },
    nonClaimCount: (receipt.nonClaims || []).length,
  };
  return summary;
}

function designAmbitionHistorySummary({ limited, totalAvailable, boundedLimit, latest, fullDetail }) {
  const base = {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
  };
  if (!fullDetail) return base;
  return {
    ...base,
    latestScore: latest?.summary?.score || 0,
    latestControlFamilies: latest?.summary?.controlFamilies || 0,
    latestTerminalShortcuts: latest?.summary?.terminalShortcuts || 0,
    latestProofRibbonActions: latest?.summary?.proofRibbonActions || 0,
  };
}

function summarizeDesignAmbitionSummary(summary = {}) {
  return {
    score: summary.score || 0,
    checks: summary.checks || 0,
    failing: summary.failing || 0,
    controlFamilies: summary.controlFamilies || 0,
    terminalShortcuts: summary.terminalShortcuts || 0,
    proofRibbonActions: summary.proofRibbonActions || 0,
    stabilityMatrixItems: summary.stabilityMatrixItems || 0,
    stabilityMatrixPassing: summary.stabilityMatrixPassing || 0,
  };
}

function summarizeDesignAmbitionHistoryReceiptSummary(summary = {}) {
  return {
    score: summary.score || 0,
    controlFamilies: summary.controlFamilies || 0,
    terminalShortcuts: summary.terminalShortcuts || 0,
    proofRibbonActions: summary.proofRibbonActions || 0,
  };
}

function summarizeDesignAmbitionHistoryTrend(summary = {}) {
  return {
    score: summary.score || 0,
    controlFamilies: summary.controlFamilies || 0,
  };
}

function selectDefinitionIds(rows = [], ids = []) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const selected = ids.filter((id) => byId.has(id));
  for (const row of rows) {
    if (selected.length >= ids.length) break;
    if (!selected.includes(row.id)) selected.push(row.id);
  }
  return selected;
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 10, 50));
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

function buildControlFamilies({ sourceSignals, designStability, keyboardReadiness, usabilityQuality, runtimeEvidenceChain }) {
  const shortcuts = sourceSignals.terminalShortcutCommands || [];
  const stabilityMatrix = designStability.controlStabilityMatrix || [];
  const passingStableSurfaces = stabilityMatrix.filter((item) => item.passed).length;
  const responsiveFallbacks = designStability.summary?.responsiveFallbacks || stabilityMatrix.filter((item) => item.responsiveFallback).length;
  const keyboardSafeSurfaces = designStability.summary?.keyboardSafeSurfaces || stabilityMatrix.filter((item) => item.keyboardSafe).length;
  return [
    family({
      id: "proof-orientation",
      label: "First-screen proof orientation",
      score: average([
        sourceSignals.hasProofRibbon ? 100 : 0,
        percent(sourceSignals.proofRibbonSignals || 0, 4),
        sourceSignals.hasProofRibbonActionButtons ? 100 : 0,
        sourceSignals.hasTruthLedger ? 100 : 0,
        usabilityQuality.summary?.score || 0,
      ]),
      passed:
        sourceSignals.hasProofRibbon &&
        sourceSignals.hasTruthLedger &&
        (sourceSignals.proofRibbonSignals || 0) >= 4 &&
        sourceSignals.hasProofRibbonActionButtons,
      evidence: `${sourceSignals.proofRibbonSignals || 0} proof ribbon signal(s); ${sourceSignals.proofRibbonActionCount || 0} proof action(s); truth ledger ${Boolean(sourceSignals.hasTruthLedger)}.`,
      verificationCommand: "npm run test:e2e",
    }),
    family({
      id: "runtime-truth-access",
      label: "Runtime truth and deploy proof access",
      score: average([
        runtimeEvidenceChain.summary?.score || 0,
        shortcuts.includes("runtime-chain") ? 100 : 0,
        shortcuts.includes("runtime-deploy") ? 100 : 0,
        shortcuts.includes("runtime-explain") ? 100 : 0,
      ]),
      passed:
        (runtimeEvidenceChain.summary?.score || 0) >= 85 &&
        shortcuts.includes("runtime-chain") &&
        shortcuts.includes("runtime-deploy") &&
        shortcuts.includes("runtime-explain"),
      evidence: `runtime chain ${runtimeEvidenceChain.summary?.score || 0}/100; runtime shortcuts ${shortcuts.filter((item) => item.startsWith("runtime")).length}.`,
      verificationCommand: "npm run audit:runtime-chain && npm run test:e2e",
    }),
    family({
      id: "keyboard-density",
      label: "Keyboard and command density",
      score: average([
        keyboardReadiness.summary?.score || 0,
        designStability.summary?.score || 0,
        percent(sourceSignals.terminalShortcutsCount || 0, 24),
        sourceSignals.hasTerminalShortcutButtons ? 100 : 0,
      ]),
      passed:
        (keyboardReadiness.summary?.score || 0) >= 85 &&
        (designStability.summary?.score || 0) >= 85 &&
        (sourceSignals.terminalShortcutsCount || 0) >= 24 &&
        sourceSignals.hasTerminalShortcutButtons,
      evidence: `${sourceSignals.terminalShortcutsCount || 0} terminal shortcut(s); keyboard ${keyboardReadiness.summary?.score || 0}/100; design ${designStability.summary?.score || 0}/100.`,
      verificationCommand: "npm run audit:keyboard-readiness && npm run audit:design-stability",
    }),
    family({
      id: "stability-matrix",
      label: "Control stability matrix",
      score: average([
        percent(passingStableSurfaces, Math.max(stabilityMatrix.length, 1)),
        percent(responsiveFallbacks, Math.max(stabilityMatrix.length, 1)),
        percent(keyboardSafeSurfaces, Math.max(stabilityMatrix.length, 1)),
        designStability.checks?.some((check) => check.id === "control-stability-matrix" && check.passed) ? 100 : 0,
      ]),
      passed:
        stabilityMatrix.length >= 7 &&
        stabilityMatrix.every((item) => item.passed && item.verificationCommand) &&
        responsiveFallbacks >= 5 &&
        keyboardSafeSurfaces >= 6 &&
        Boolean(designStability.checks?.some((check) => check.id === "control-stability-matrix" && check.passed)),
      evidence: `${passingStableSurfaces}/${stabilityMatrix.length} stable control surface(s); ${responsiveFallbacks} responsive fallback(s); ${keyboardSafeSurfaces} keyboard-safe surface(s).`,
      verificationCommand: "npm run audit:design-stability && npm run test:e2e",
    }),
    family({
      id: "mobile-control-resilience",
      label: "Mobile control resilience",
      score: average([
        sourceSignals.hasMobileTerminalShortcutOverride ? 100 : 0,
        sourceSignals.hasMobileSingleColumnForms ? 100 : 0,
        sourceSignals.hasOverflowWrapGuards ? 100 : 0,
        designStability.mobileContract?.passed ? 100 : 0,
        keyboardReadiness.mobileContract?.passed ? 100 : 0,
      ]),
      passed:
        sourceSignals.hasMobileTerminalShortcutOverride &&
        sourceSignals.hasMobileSingleColumnForms &&
        sourceSignals.hasOverflowWrapGuards &&
        Boolean(designStability.mobileContract?.passed) &&
        Boolean(keyboardReadiness.mobileContract?.passed),
      evidence: `mobile shortcut override=${Boolean(sourceSignals.hasMobileTerminalShortcutOverride)}; single column forms=${Boolean(
        sourceSignals.hasMobileSingleColumnForms,
      )}; wrap guards=${Boolean(sourceSignals.hasOverflowWrapGuards)}.`,
      verificationCommand: "npm run test:e2e",
    }),
    family({
      id: "uncertainty-preservation",
      label: "Uncertainty stays visible",
      score: average([
        designStability.uncertaintyContract?.passed ? 100 : 0,
        keyboardReadiness.uncertaintyPreservation?.passed ? 100 : 0,
        sourceSignals.exposesNeedsSource ? 100 : 0,
        sourceSignals.exposesGraphCoverage ? 100 : 0,
        sourceSignals.exposesMissingProof ? 100 : 0,
      ]),
      passed:
        Boolean(designStability.uncertaintyContract?.passed) &&
        Boolean(keyboardReadiness.uncertaintyPreservation?.passed) &&
        sourceSignals.exposesNeedsSource &&
        sourceSignals.exposesGraphCoverage &&
        sourceSignals.exposesMissingProof,
      evidence: `needs-source=${Boolean(sourceSignals.exposesNeedsSource)}; graph=${Boolean(
        sourceSignals.exposesGraphCoverage,
      )}; missing-proof=${Boolean(sourceSignals.exposesMissingProof)}.`,
      verificationCommand: "npm run audit:design-stability && npm run audit:keyboard-readiness",
    }),
  ];
}

function ambitionChecks({
  controlFamilies,
  designStability,
  keyboardReadiness,
  usabilityQuality,
  runtimeEvidenceChain,
  routeManifest,
  refreshPlan,
  packageManifest,
  sourceSignals,
}) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const requiredRoutes = [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`];
  const scripts = packageManifest.scripts || {};
  const shortcuts = sourceSignals.terminalShortcutCommands || [];
  const criticalShortcuts = [
    "runtime-chain",
    "runtime-deploy",
    "runtime-explain",
    "design-stability",
    "design-ambition",
    "keyboard-readiness",
    "evaluation-integrity",
    "graph-confidence",
  ];

  return [
    check(
      "design-system-scores",
      (designStability.summary?.score || 0) >= 85 && (keyboardReadiness.summary?.score || 0) >= 85 && (usabilityQuality.summary?.score || 0) >= 85,
      "high",
      `design=${designStability.summary?.score || 0}/100; keyboard=${keyboardReadiness.summary?.score || 0}/100; usability=${usabilityQuality.summary?.score || 0}/100.`,
      "Repair design stability, keyboard readiness, or usability quality before claiming design ambition.",
      "npm run audit:design-stability && npm run audit:keyboard-readiness",
    ),
    check(
      "runtime-chain-visible",
      (runtimeEvidenceChain.summary?.score || 0) >= 85 && shortcuts.includes("runtime-chain"),
      "high",
      `runtime chain=${runtimeEvidenceChain.summary?.score || 0}/100; visible shortcut=${shortcuts.includes("runtime-chain")}.`,
      "Keep runtime-chain as a visible terminal shortcut and refresh runtime chain receipts.",
      "npm run audit:runtime-chain && npm run test:e2e",
    ),
    check(
      "critical-shortcut-compression",
      criticalShortcuts.every((shortcut) => shortcuts.includes(shortcut)) && (sourceSignals.terminalShortcutsCount || 0) >= 24,
      "medium",
      `${criticalShortcuts.filter((shortcut) => shortcuts.includes(shortcut)).length}/${criticalShortcuts.length} critical shortcut(s); ${sourceSignals.terminalShortcutsCount || 0} total.`,
      "Keep runtime, design, keyboard, evaluation, and graph confidence commands visible without requiring typed discovery.",
      "npm run test:e2e",
    ),
    check(
      "first-screen-proof-compression",
      sourceSignals.hasProofRibbon &&
        sourceSignals.hasTruthLedger &&
        (sourceSignals.proofRibbonSignals || 0) >= 4 &&
        (sourceSignals.proofRibbonActionCount || 0) >= 4 &&
        sourceSignals.hasProofRibbonActionButtons &&
        sourceSignals.exposesMissingProof,
      "high",
      `proof ribbon=${Boolean(sourceSignals.hasProofRibbon)}; truth ledger=${Boolean(sourceSignals.hasTruthLedger)}; signals=${sourceSignals.proofRibbonSignals || 0}; actions=${sourceSignals.proofRibbonActionCount || 0}; missing-proof=${Boolean(sourceSignals.exposesMissingProof)}.`,
      "Restore proof ribbon, proof action buttons, and truth ledger as first-screen proof compression surfaces.",
      "npm run test:e2e",
    ),
    check(
      "responsive-density",
      sourceSignals.hasMobileTerminalShortcutOverride &&
        sourceSignals.hasMobileSingleColumnForms &&
        sourceSignals.hasOverflowWrapGuards &&
        Boolean(designStability.mobileContract?.passed) &&
        Boolean(keyboardReadiness.mobileContract?.passed),
      "high",
      `mobile override=${Boolean(sourceSignals.hasMobileTerminalShortcutOverride)}; single-column forms=${Boolean(
        sourceSignals.hasMobileSingleColumnForms,
      )}; wrap=${Boolean(sourceSignals.hasOverflowWrapGuards)}.`,
      "Keep dense controls responsive with mobile grid overrides, single-column forms, and overflow guards.",
      "npm run test:e2e",
    ),
    check(
      "control-family-depth",
      controlFamilies.length >= 6 && controlFamilies.every((family) => family.passed && family.verificationCommand),
      "medium",
      `${controlFamilies.filter((family) => family.passed).length}/${controlFamilies.length} control family/families passing.`,
      "Keep every design ambition control family scored, passing, and command-backed.",
      "npm run audit:design-ambition",
    ),
    check(
      "stability-matrix-visible",
      (designStability.controlStabilityMatrix || []).length >= 7 &&
        (designStability.controlStabilityMatrix || []).every((item) => item.passed && item.verificationCommand) &&
        (designStability.summary?.responsiveFallbacks || 0) >= 5 &&
        (designStability.summary?.keyboardSafeSurfaces || 0) >= 6,
      "high",
      `${designStability.summary?.stabilityMatrixPassing || 0}/${designStability.summary?.stabilityMatrixItems || 0} stable matrix surface(s); responsive=${designStability.summary?.responsiveFallbacks || 0}; keyboard=${designStability.summary?.keyboardSafeSurfaces || 0}.`,
      "Restore the design stability matrix before claiming dense command-center ambition.",
      "npm run audit:design-stability && npm run audit:design-ambition",
    ),
    check(
      "route-manifest",
      requiredRoutes.every((route) => publicRoutes.includes(route)),
      "high",
      `${requiredRoutes.filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes.length} design ambition route(s) declared.`,
      "Add design ambition report, plan, and history routes to runtimeRouteManifest.",
      "npm run record:runtime-surface",
    ),
    check(
      "refresh-plan",
      (refreshPlan.endpoints || []).includes(ENDPOINT) && !(refreshPlan.endpoints || []).some((endpoint) => endpoint.startsWith("/api/private")),
      "medium",
      `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"}; private refresh endpoints ${(refreshPlan.endpoints || []).filter((endpoint) => endpoint.startsWith("/api/private")).length}.`,
      "Add design ambition to safe evidence refresh and keep private routes out.",
      "npm run refresh:evidence",
    ),
    check(
      "script-coverage",
      Boolean(scripts["audit:design-ambition"]),
      "medium",
      `audit:design-ambition=${Boolean(scripts["audit:design-ambition"])}`,
      "Add the audit:design-ambition package script and recorder.",
      "npm run audit:design-ambition",
    ),
    check(
      "non-claim-boundary",
      designStability.nonClaims?.length >= 3 &&
        keyboardReadiness.nonClaims?.length >= 3 &&
        runtimeEvidenceChain.nonClaims?.some((item) => /does not deploy|provider|CDN/i.test(item)),
      "high",
      `design nonClaims=${designStability.nonClaims?.length || 0}; keyboard nonClaims=${keyboardReadiness.nonClaims?.length || 0}; runtime nonClaims=${runtimeEvidenceChain.nonClaims?.length || 0}.`,
      "Keep design ambition explicit about analytics, assistive-tech, production, and runtime-proof limits.",
      "npm run check",
    ),
  ];
}

function family({ id, label, score, passed, evidence, verificationCommand }) {
  const normalized = clamp(Math.round(score || 0), 0, 100);
  return {
    id,
    label,
    score: normalized,
    band: bandFor(normalized),
    passed: Boolean(passed),
    evidence,
    verificationCommand,
  };
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

function weightedScore(checks) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
}

function percent(value, total) {
  if (!total) return 0;
  return clamp(Math.round((value / total) * 100), 0, 100);
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
  appendDesignAmbitionReceipt,
  buildDesignAmbitionHistory,
  buildDesignAmbitionResponse,
  buildDesignAmbitionReportFromReceipt,
  buildDesignAmbitionReport,
  designAmbitionPlan,
  readDesignAmbitionHistoryWindow,
  readDesignAmbitionReceipts,
  readLatestDesignAmbitionReceipt,
};
