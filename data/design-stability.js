const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/design-stability";
const STORE_RELATIVE_PATH = path.join("var", "design-stability-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function designStabilityPlan() {
  return {
    mode: "command-center-design-stability-plan",
    command: "npm run audit:design-stability",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe UI and verification endpoints, writes a local receipt under var/, and does not deploy, publish, enable private cockpit data, collect visitor analytics, or contact third parties.",
  };
}

function buildDesignStabilityReport({
  usabilityQuality,
  runtimeSurface,
  routeManifest,
  refreshPlan,
  packageManifest,
  sourceSignals,
  receipts = [],
}) {
  const dimensions = dimensionsFromUsability(usabilityQuality);
  const checks = designChecks({ usabilityQuality, runtimeSurface, routeManifest, refreshPlan, packageManifest, sourceSignals });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const denseControls = buildDenseControlLedger({ sourceSignals });
  const controlStabilityMatrix = buildControlStabilityMatrix({ sourceSignals });
  const keyboardContract = buildKeyboardContract({ sourceSignals, dimensions });
  const mobileContract = buildMobileContract({ sourceSignals, dimensions });

  return {
    generatedAt: new Date().toISOString(),
    mode: "command-center-design-stability",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report audits local command-center source, CSS control geometry, API route declarations, refresh coverage, and local Playwright/audit receipts. It does not claim live visitor research, screen-reader parity, production CDN behavior, or cross-browser device-lab coverage.",
    sideEffectBoundary:
      "This endpoint reads public-safe in-memory reports, source signals, and local receipt history only. It does not mutate UI state, collect analytics, start recorders, enable private cockpit data, or contact third parties.",
    plan: designStabilityPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      terminalShortcuts: sourceSignals.terminalShortcutsCount || 0,
      proofRibbonActions: sourceSignals.proofRibbonActionCount || 0,
      stableControlSignals: denseControls.filter((item) => item.passed).length,
      stabilityMatrixItems: controlStabilityMatrix.length,
      stabilityMatrixPassing: controlStabilityMatrix.filter((item) => item.passed).length,
      responsiveFallbacks: controlStabilityMatrix.filter((item) => item.responsiveFallback).length,
      keyboardSafeSurfaces: controlStabilityMatrix.filter((item) => item.keyboardSafe).length,
      keyboardScore: dimensions.keyboardWorkflow,
      mobileScore: dimensions.mobileResilience,
      uncertaintyScore: dimensions.uncertaintyDisclosure,
      latestReceiptId: receipts[0]?.id || null,
      browserPluginFallback: sourceSignals.browserPluginFallback || "playwright",
    },
    checks,
    denseControls,
    controlStabilityMatrix,
    keyboardContract,
    mobileContract,
    uncertaintyContract: {
      score: dimensions.uncertaintyDisclosure,
      requiredSignals: [
        "Proof ribbon exposes weak claims.",
        "Graph coverage and quarantine pressure stay visible.",
        "Opportunity readiness keeps missing proof visible.",
      ],
      passed: dimensions.uncertaintyDisclosure >= 85 && sourceSignals.exposesNeedsSource && sourceSignals.exposesGraphCoverage && sourceSignals.exposesMissingProof,
      verificationCommand: "npm run test:e2e && node server.js # then open /api/evaluation/usability",
    },
    nonClaims: [
      "Does not prove every assistive technology workflow; scripted checks need manual keyboard and screen-reader review.",
      "Does not prove production browser/device diversity; Playwright verifies the local Chromium path.",
      "Does not hide weak proof or stale receipts behind design polish.",
      "Does not collect visitor behavior or personalize the UI from private data.",
    ],
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    latestReceipt: receipts[0]
      ? {
          id: receipts[0].id,
          checkedAt: receipts[0].checkedAt,
          score: receipts[0].summary?.score || 0,
          passing: receipts[0].summary?.passing || 0,
          checks: receipts[0].summary?.checks || 0,
        }
      : null,
    nextAction: failing[0]?.repairAction || "Command-center design stability is locally verified; rerun after shortcut, CSS, proof-ribbon, or route changes.",
    verificationCommand: "npm run audit:design-stability && npm run test:e2e && npm run check",
  };
}

function buildDesignStabilityReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "command-center-design-stability-receipt" || !receipt.summary) return null;
  if (
    !Array.isArray(receipt.checks) ||
    !receipt.checks.every((check) => check.id && check.detail && check.verificationCommand) ||
    !Array.isArray(receipt.denseControls) ||
    !receipt.denseControls.every((control) => control.id && control.label && control.evidence && control.verificationCommand) ||
    !Array.isArray(receipt.controlStabilityMatrix) ||
    !receipt.controlStabilityMatrix.every((surface) => surface.id && surface.label && surface.evidence && surface.verificationCommand) ||
    !receipt.keyboardContract ||
    !receipt.mobileContract ||
    !receipt.uncertaintyContract
  ) {
    return null;
  }

  const checks = receipt.checks.map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail,
    repairAction: check.repairAction || "Run npm run audit:design-stability or /api/design-stability?refresh=1 to refresh this cached check.",
    verificationCommand: check.verificationCommand || "npm run audit:design-stability",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "command-center-design-stability",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      receipt.sourceBoundary ||
      "This response reconstructs design stability from the latest local receipt. It is a fast public-safe cached report, not fresh UI inspection, visitor research, screen-reader parity, production CDN proof, or browser/device-lab validation.",
    sideEffectBoundary: receipt.sideEffectBoundary || designStabilityPlan().sideEffectBoundary,
    plan: designStabilityPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    checks,
    denseControls: receipt.denseControls.map((control) => ({
      id: control.id,
      label: control.label,
      passed: Boolean(control.passed),
      evidence: control.evidence,
      verificationCommand: control.verificationCommand || "npm run test:e2e",
    })),
    controlStabilityMatrix: receipt.controlStabilityMatrix.map((surface) => ({
      id: surface.id,
      label: surface.label,
      passed: Boolean(surface.passed),
      fixedGeometry: Boolean(surface.fixedGeometry),
      responsiveFallback: Boolean(surface.responsiveFallback),
      keyboardSafe: Boolean(surface.keyboardSafe),
      evidence: surface.evidence,
      verificationCommand: surface.verificationCommand || "npm run test:e2e",
    })),
    keyboardContract: {
      ...receipt.keyboardContract,
      passed: Boolean(receipt.keyboardContract.passed),
      verificationCommand: receipt.keyboardContract.verificationCommand || "npm run test:e2e",
    },
    mobileContract: {
      ...receipt.mobileContract,
      passed: Boolean(receipt.mobileContract.passed),
      verificationCommand: receipt.mobileContract.verificationCommand || "npm run test:e2e",
    },
    uncertaintyContract: {
      ...receipt.uncertaintyContract,
      passed: Boolean(receipt.uncertaintyContract.passed),
      verificationCommand: receipt.uncertaintyContract.verificationCommand || "npm run audit:design-stability",
    },
    nonClaims:
      receipt.nonClaims || [
        "Does not prove every assistive technology workflow; scripted checks need manual keyboard and screen-reader review.",
        "Does not prove production browser/device diversity; Playwright verifies the local Chromium path.",
        "Does not hide weak proof or stale receipts behind design polish.",
        "Does not collect visitor behavior or personalize the UI from private data.",
      ],
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
    nextAction:
      receipt.nextAction ||
      failing[0]?.repairAction ||
      "Design stability is served from the latest local receipt; run npm run audit:design-stability or /api/design-stability?refresh=1 after shortcut, CSS, proof-ribbon, or route changes.",
    verificationCommand: receipt.verificationCommand || "npm run audit:design-stability && npm run test:e2e && npm run check",
  };
}

function buildDesignStabilityResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      designStabilityPayloadPolicy: designStabilityPayloadPolicy({ fullDetail, report }),
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachedFromReceipt ? undefined : report.cachePolicy,
    refreshEndpoint: report.refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeDesignStabilityCompactSummary(report.summary),
    checks: selectDesignStabilityPreview(report.checks || [], ["dense-shortcut-geometry", "proof-ribbon-actionability", "control-stability-matrix"], 3).map(({ id, passed }) => ({ id, passed: Boolean(passed) })),
    denseControls: selectDesignStabilityPreview(report.denseControls || [], ["proof-ribbon-action-buttons", "visible-design-shortcut"], 2).map(({ id, passed }) => ({ id, passed: Boolean(passed) })),
    controlStabilityMatrix: selectDesignStabilityPreview(report.controlStabilityMatrix || [], ["artifact-filter-controls", "proof-ribbon-actions"], 2).map(({ id, passed }) => ({ id, passed: Boolean(passed) })),
    keyboardContract: summarizeDesignStabilityContract(report.keyboardContract),
    mobileContract: summarizeDesignStabilityContract(report.mobileContract),
    uncertaintyContract: summarizeDesignStabilityContract(report.uncertaintyContract),
    nonClaims: (report.nonClaims || []).filter((item) => /visitor behavior|analytics/i.test(item)).slice(0, 1),
    repairActions:
      report.repairActions?.length > 0 ? report.repairActions.slice(0, 4).map(({ id, priority }) => ({ id, priority, actionAvailable: true })) : undefined,
    designStabilityPayloadPolicy: designStabilityPayloadPolicy({ fullDetail, report }),
  };
}

function designStabilityPayloadPolicy({ fullDetail, report }) {
  if (fullDetail) {
    return { fullDetail: true };
  }
  return {
    fullDetail: false,
    fullDetailAvailable: true,
  };
}

function summarizeDesignStabilityCompactSummary(summary = {}) {
  return {
    score: summary.score || 0,
    terminalShortcuts: summary.terminalShortcuts || 0,
    proofRibbonActions: summary.proofRibbonActions || 0,
    stabilityMatrixItems: summary.stabilityMatrixItems || 0,
    stabilityMatrixPassing: summary.stabilityMatrixPassing || 0,
    responsiveFallbacks: summary.responsiveFallbacks || 0,
    keyboardSafeSurfaces: summary.keyboardSafeSurfaces || 0,
  };
}

function appendDesignStabilityReceipt(root, receipt) {
  const receipts = readDesignStabilityReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function buildDesignStabilityHistory({ receipts = [], limit = 20, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      generatedAt: new Date().toISOString(),
      mode: "command-center-design-stability-history",
      detail: "full",
      compact: false,
      sourceBoundary:
        "This endpoint returns full local design-stability receipts. It is still not fresh UI inspection, visitor research, screen-reader parity, production CDN proof, or browser/device-lab validation.",
      sideEffectBoundary:
        "The history endpoint reads local design-stability receipts only. It does not mutate UI state, collect analytics, start recorders, enable private cockpit data, or contact third parties.",
      receiptStore: STORE_RELATIVE_PATH,
      fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
      historyPayloadPolicy: designStabilityHistoryPayloadPolicy({ fullDetail, boundedLimit }),
      summary: summarizeDesignStabilityHistoryTopline({ latest, limited, totalAvailable, boundedLimit }),
      receipts: limited,
      nextAction: limited[0]
        ? "Design stability history is available; run npm run audit:design-stability after shortcut, CSS, proof-ribbon, route, or responsive layout changes."
        : "Run npm run audit:design-stability to create design stability history.",
      verificationCommand: "npm run audit:design-stability && node --test test/api-contract.test.mjs",
    };
  }

  return {
    mode: "command-center-design-stability-history",
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: designStabilityHistoryPayloadPolicy({ fullDetail, boundedLimit }),
    summary: summarizeDesignStabilityHistoryTopline({ latest, limited, totalAvailable, boundedLimit }),
    receipts: limited.map((receipt, index) => summarizeDesignStabilityReceipt(receipt, { includePreview: index === 0 })),
  };
}

function designStabilityHistoryPayloadPolicy({ fullDetail, boundedLimit }) {
  return fullDetail
    ? {
        fullDetail: true,
        limit: boundedLimit,
        olderReceiptPreview: "full-receipt",
      }
    : {
        fullDetail: false,
      };
}

function summarizeDesignStabilityHistoryTopline({ latest, limited, totalAvailable, boundedLimit }) {
  return {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
    latestScore: latest?.summary?.score || 0,
    latestStabilityMatrixPassing: latest?.summary?.stabilityMatrixPassing || 0,
  };
}

function readDesignStabilityReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestDesignStabilityReceipt(root) {
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

function readDesignStabilityHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readDesignStabilityReceipts(root);
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

function summarizeDesignStabilityReceipt(receipt, { includePreview = true } = {}) {
  const summary = summarizeDesignStabilityHistorySummary(receipt.summary);
  const compact = {
    id: receipt.id,
    summary,
    nonClaimCount: (receipt.nonClaims || []).length,
  };
  if (!includePreview) {
    return {
      id: receipt.id,
      latestReceiptPreviewOnly: true,
      trendSummary: {
        score: summary.score,
        passing: summary.passing,
        stableSurfaces: summary.stabilityMatrixPassing,
      },
    };
  }
  return {
    ...compact,
    checkPreview: selectDesignStabilityPreview(receipt.checks || [], ["control-stability-matrix", "dense-shortcut-geometry", "proof-ribbon-actionability"], 3).map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
    })),
    denseControlPreview: selectDesignStabilityPreview(receipt.denseControls || [], ["proof-ribbon-action-buttons", "visible-design-shortcut"], 2).map((control) => ({
      id: control.id,
      passed: Boolean(control.passed),
    })),
    controlSurfacePreview: selectDesignStabilityPreview(
      receipt.controlStabilityMatrix || [],
      ["artifact-filter-controls", "proof-ribbon-actions", "terminal-shortcut-grid"],
      2,
    ).map((surface) => ({
      id: surface.id,
      passed: Boolean(surface.passed),
    })),
  };
}

function selectDesignStabilityPreview(items, preferredIds, limit) {
  const selected = [];
  const seen = new Set();
  const push = (item) => {
    if (!item || seen.has(item.id)) return;
    selected.push(item);
    seen.add(item.id);
  };
  for (const id of preferredIds) push(items.find((item) => item.id === id));
  for (const item of items) {
    if (selected.length >= limit) break;
    push(item);
  }
  return selected.slice(0, limit);
}

function summarizeDesignStabilityContract(contract) {
  if (!contract) return null;
  return {
    score: contract.score || 0,
    passed: Boolean(contract.passed),
    requiredSignalCount: (contract.requiredSignals || []).length,
  };
}

function summarizeDesignStabilityHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    stabilityMatrixPassing: summary.stabilityMatrixPassing || 0,
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, 50));
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

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function designChecks({ usabilityQuality, runtimeSurface, routeManifest, refreshPlan, packageManifest, sourceSignals }) {
  const dimensions = dimensionsFromUsability(usabilityQuality);
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const scripts = packageManifest.scripts || {};
  const stableControls =
    sourceSignals.hasTerminalShortcutGrid &&
    sourceSignals.hasStableShortcutGeometry &&
    sourceSignals.hasCommandJumpWrap &&
    sourceSignals.hasFocusVisible &&
    sourceSignals.hasZeroLetterSpacingForDenseControls;
  const controlStabilityMatrix = buildControlStabilityMatrix({ sourceSignals });

  return [
    check({
      id: "dense-shortcut-geometry",
      passed: stableControls && sourceSignals.terminalShortcutsCount >= 13,
      severity: "high",
      detail: `${sourceSignals.terminalShortcutsCount || 0} shortcut(s); grid=${sourceSignals.hasTerminalShortcutGrid}; stable=${sourceSignals.hasStableShortcutGeometry}; zero-letter-spacing=${sourceSignals.hasZeroLetterSpacingForDenseControls}.`,
      repairAction: "Keep terminal shortcuts on stable grid tracks with centered flex buttons, fixed minimum heights, wrapping text, and zero letter spacing.",
      verificationCommand: "npm run test:e2e",
    }),
    check({
      id: "proof-ribbon-actionability",
      passed:
        sourceSignals.hasProofRibbonActionButtons &&
        sourceSignals.hasProofRibbonActionGeometry &&
        (sourceSignals.proofRibbonActionCount || 0) >= 4,
      severity: "high",
      detail: `${sourceSignals.proofRibbonActionCount || 0} proof action(s); buttons=${sourceSignals.hasProofRibbonActionButtons}; geometry=${sourceSignals.hasProofRibbonActionGeometry}.`,
      repairAction: "Keep proof ribbon signals actionable with stable native buttons that run the matching proof terminal command.",
      verificationCommand: "npm run test:e2e",
    }),
    check({
      id: "keyboard-first-workflow",
      passed: dimensions.keyboardWorkflow >= 85 && sourceSignals.hasProjectKeyboardNav && sourceSignals.hasTerminalShortcutButtons,
      severity: "high",
      detail: `keyboard=${dimensions.keyboardWorkflow}/100; project nav=${sourceSignals.hasProjectKeyboardNav}; shortcut buttons=${sourceSignals.hasTerminalShortcutButtons}.`,
      repairAction: "Restore keyboard project navigation and keep terminal shortcuts as native buttons.",
      verificationCommand: "npm run test:e2e",
    }),
    check({
      id: "mobile-overflow-proof",
      passed: dimensions.mobileResilience >= 85 && sourceSignals.hasMobileOverflowE2E && sourceSignals.hasOverflowWrapGuards,
      severity: "high",
      detail: `mobile=${dimensions.mobileResilience}/100; overflow e2e=${sourceSignals.hasMobileOverflowE2E}; wrap guards=${sourceSignals.hasOverflowWrapGuards}.`,
      repairAction: "Restore mobile overflow Playwright coverage and wrapping guards for dense command controls.",
      verificationCommand: "npm run test:e2e",
    }),
    check({
      id: "control-stability-matrix",
      passed:
        controlStabilityMatrix.length >= 7 &&
        controlStabilityMatrix.every((item) => item.passed && item.verificationCommand) &&
        controlStabilityMatrix.filter((item) => item.responsiveFallback).length >= 5 &&
        controlStabilityMatrix.filter((item) => item.keyboardSafe).length >= 6,
      severity: "high",
      detail: `${controlStabilityMatrix.filter((item) => item.passed).length}/${controlStabilityMatrix.length} stable surface(s); responsive ${controlStabilityMatrix.filter((item) => item.responsiveFallback).length}; keyboard ${controlStabilityMatrix.filter((item) => item.keyboardSafe).length}.`,
      repairAction: "Keep proof, terminal, form, artifact, skip, focus, and mobile surfaces in one stable no-overflow matrix.",
      verificationCommand: "npm run audit:design-stability && npm run test:e2e",
    }),
    check({
      id: "uncertainty-visible",
      passed: dimensions.uncertaintyDisclosure >= 85 && sourceSignals.exposesNeedsSource && sourceSignals.exposesGraphCoverage && sourceSignals.exposesMissingProof,
      severity: "medium",
      detail: `uncertainty=${dimensions.uncertaintyDisclosure}/100; needs-source=${sourceSignals.exposesNeedsSource}; graph=${sourceSignals.exposesGraphCoverage}; missing-proof=${sourceSignals.exposesMissingProof}.`,
      repairAction: "Keep weak proof, graph coverage, and opportunity missing-proof signals visible in the first-screen proof ribbon.",
      verificationCommand: "npm run check && node server.js # then open /api/evaluation/usability",
    }),
    check({
      id: "route-manifest",
      passed: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => publicRoutes.includes(route)),
      severity: "high",
      detail: `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => publicRoutes.includes(route)).length}/3 design route(s) declared.`,
      repairAction: "Add design-stability routes to runtimeRouteManifest.",
      verificationCommand: "npm run record:runtime-surface",
    }),
    check({
      id: "refresh-plan",
      passed: (refreshPlan.endpoints || []).includes(ENDPOINT),
      severity: "medium",
      detail: `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"} in safe refresh plan.`,
      repairAction: "Add /api/design-stability to the safe evidence refresh plan.",
      verificationCommand: "npm run refresh:evidence",
    }),
    check({
      id: "script-coverage",
      passed: Boolean(scripts["audit:design-stability"]),
      severity: "medium",
      detail: `audit:design-stability=${Boolean(scripts["audit:design-stability"])}`,
      repairAction: "Add the audit:design-stability package script.",
      verificationCommand: "npm run audit:design-stability",
    }),
    check({
      id: "runtime-receipt-boundary",
      passed: (runtimeSurface.latest?.summary?.score || 0) >= 95 && (runtimeSurface.latest?.summary?.failing || 0) === 0,
      severity: "medium",
      detail: `surface=${runtimeSurface.latest?.summary?.score || 0}/100; failing=${runtimeSurface.latest?.summary?.failing ?? "missing"}.`,
      repairAction: "Refresh runtime surface receipts after route or UI verification surface changes.",
      verificationCommand: "npm run record:runtime-surface",
    }),
  ];
}

function buildControlStabilityMatrix({ sourceSignals }) {
  return [
    stabilitySurface({
      id: "proof-ribbon-actions",
      label: "Proof ribbon action buttons",
      passed: sourceSignals.hasProofRibbonActionButtons && sourceSignals.hasProofRibbonActionGeometry && (sourceSignals.proofRibbonActionCount || 0) >= 4,
      fixedGeometry: Boolean(sourceSignals.hasProofRibbonActionGeometry),
      responsiveFallback: Boolean(sourceSignals.hasResponsiveProofRibbon),
      keyboardSafe: Boolean(sourceSignals.hasProofRibbonActionButtons),
      evidence: `${sourceSignals.proofRibbonActionCount || 0} proof command button(s) with stable action geometry.`,
      verificationCommand: "npm run test:e2e",
    }),
    stabilitySurface({
      id: "terminal-shortcut-grid",
      label: "Terminal shortcut grid",
      passed: sourceSignals.hasTerminalShortcutGrid && sourceSignals.hasStableShortcutGeometry && (sourceSignals.terminalShortcutsCount || 0) >= 24,
      fixedGeometry: Boolean(sourceSignals.hasStableShortcutGeometry),
      responsiveFallback: Boolean(sourceSignals.hasMobileTerminalShortcutOverride || sourceSignals.hasOverflowWrapGuards),
      keyboardSafe: Boolean(sourceSignals.hasTerminalShortcutButtons),
      evidence: `${sourceSignals.terminalShortcutsCount || 0} shortcut button(s) with grid tracks and wrapping text.`,
      verificationCommand: "npm run test:e2e",
    }),
    stabilitySurface({
      id: "command-jump-wrap",
      label: "Command jump navigation",
      passed: sourceSignals.hasCommandJumpWrap,
      fixedGeometry: Boolean(sourceSignals.hasCommandJumpWrap),
      responsiveFallback: Boolean(sourceSignals.hasCommandJumpWrap),
      keyboardSafe: true,
      evidence: "Jump controls wrap instead of overflowing narrow viewports.",
      verificationCommand: "npm run test:e2e",
    }),
    stabilitySurface({
      id: "search-terminal-forms",
      label: "Search and terminal forms",
      passed: sourceSignals.hasSearchTerminalFormStability && sourceSignals.hasMobileSingleColumnForms,
      fixedGeometry: Boolean(sourceSignals.hasSearchTerminalFormStability),
      responsiveFallback: Boolean(sourceSignals.hasMobileSingleColumnForms),
      keyboardSafe: true,
      evidence: "Search and terminal forms collapse to minmax(0, 1fr) on mobile.",
      verificationCommand: "npm run test:e2e",
    }),
    stabilitySurface({
      id: "artifact-filter-controls",
      label: "Artifact filter controls",
      passed: sourceSignals.hasArtifactControlStability && sourceSignals.hasArtifactControlMobileReflow,
      fixedGeometry: Boolean(sourceSignals.hasArtifactControlStability),
      responsiveFallback: Boolean(sourceSignals.hasArtifactControlMobileReflow),
      keyboardSafe: Boolean(sourceSignals.hasArtifactControlStability),
      evidence: "Artifact filters use fixed touch targets, min-width guards, and mobile reflow.",
      verificationCommand: "npm run test:e2e",
    }),
    stabilitySurface({
      id: "skip-link-rail",
      label: "Skip-link rail",
      passed: sourceSignals.hasSkipLinkWrap && sourceSignals.hasFocusVisible,
      fixedGeometry: Boolean(sourceSignals.hasSkipLinkWrap),
      responsiveFallback: Boolean(sourceSignals.hasSkipLinkWrap),
      keyboardSafe: true,
      evidence: "Skip links wrap within the viewport and expose visible focus.",
      verificationCommand: "npm run test:e2e",
    }),
    stabilitySurface({
      id: "focus-visible-ring",
      label: "Global focus ring",
      passed: sourceSignals.hasFocusVisible,
      fixedGeometry: true,
      responsiveFallback: true,
      keyboardSafe: Boolean(sourceSignals.hasFocusVisible),
      evidence: "Focus-visible outline keeps keyboard control state legible.",
      verificationCommand: "npm run test:e2e",
    }),
  ];
}

function stabilitySurface({ id, label, passed, fixedGeometry, responsiveFallback, keyboardSafe, evidence, verificationCommand }) {
  return {
    id,
    label,
    passed: Boolean(passed),
    fixedGeometry: Boolean(fixedGeometry),
    responsiveFallback: Boolean(responsiveFallback),
    keyboardSafe: Boolean(keyboardSafe),
    evidence,
    verificationCommand,
  };
}

function buildDenseControlLedger({ sourceSignals }) {
  return [
    {
      id: "proof-ribbon-action-buttons",
      label: "Proof ribbon tiles expose command buttons",
      passed: sourceSignals.hasProofRibbonActionButtons && sourceSignals.hasProofRibbonActionGeometry,
      evidence: "command-center.mjs data-proof-command buttons and styles.css .proof-ribbon-action geometry",
      verificationCommand: "npm run test:e2e",
    },
    {
      id: "terminal-shortcut-grid",
      label: "Terminal shortcuts use stable grid tracks",
      passed: sourceSignals.hasTerminalShortcutGrid,
      evidence: "styles.css .terminal-shortcuts grid-template-columns",
      verificationCommand: "npm run test:e2e",
    },
    {
      id: "shortcut-button-geometry",
      label: "Shortcut buttons keep fixed touch target geometry",
      passed: sourceSignals.hasStableShortcutGeometry,
      evidence: "styles.css .terminal-shortcuts button min-height/flex/wrap rules",
      verificationCommand: "npm run test:e2e",
    },
    {
      id: "command-jump-wrap",
      label: "Jump navigation wraps instead of overflowing",
      passed: sourceSignals.hasCommandJumpWrap,
      evidence: "styles.css .command-jump flex-wrap",
      verificationCommand: "npm run test:e2e",
    },
    {
      id: "focus-visible",
      label: "Interactive controls expose keyboard focus",
      passed: sourceSignals.hasFocusVisible,
      evidence: "styles.css :focus-visible outline",
      verificationCommand: "npm run test:e2e",
    },
    {
      id: "visible-design-shortcut",
      label: "Design stability is one terminal shortcut away",
      passed: sourceSignals.hasDesignStabilityShortcut,
      evidence: "index.html data-terminal-command=design-stability",
      verificationCommand: "npm run test:e2e",
    },
  ];
}

function buildKeyboardContract({ sourceSignals, dimensions }) {
  return {
    score: dimensions.keyboardWorkflow,
    nativeControls: sourceSignals.hasTerminalShortcutButtons,
    projectKeyboardKeys: sourceSignals.keyboardProjectKeys || 0,
    preservesProjectFocus: sourceSignals.preservesProjectFocus,
    focusVisible: sourceSignals.hasFocusVisible,
    passed:
      dimensions.keyboardWorkflow >= 85 &&
      sourceSignals.hasTerminalShortcutButtons &&
      (sourceSignals.keyboardProjectKeys || 0) >= 4 &&
      sourceSignals.preservesProjectFocus &&
      sourceSignals.hasFocusVisible,
    verificationCommand: "npm run test:e2e",
  };
}

function buildMobileContract({ sourceSignals, dimensions }) {
  return {
    score: dimensions.mobileResilience,
    overflowWrapGuards: sourceSignals.hasOverflowWrapGuards,
    mobileOverflowE2E: sourceSignals.hasMobileOverflowE2E,
    stableShortcutGeometry: sourceSignals.hasStableShortcutGeometry,
    passed: dimensions.mobileResilience >= 85 && sourceSignals.hasMobileOverflowE2E && sourceSignals.hasOverflowWrapGuards,
    verificationCommand: "npm run test:e2e",
  };
}

function dimensionsFromUsability(usabilityQuality) {
  const byId = new Map((usabilityQuality.dimensions || []).map((dimension) => [dimension.id, dimension.score]));
  return {
    keyboardWorkflow: byId.get("keyboard-workflow") || 0,
    mobileResilience: byId.get("mobile-resilience") || 0,
    uncertaintyDisclosure: byId.get("uncertainty-disclosure") || 0,
    inspectionDepth: byId.get("inspection-depth") || 0,
  };
}

function check({ id, passed, severity, detail, repairAction, verificationCommand }) {
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

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

module.exports = {
  appendDesignStabilityReceipt,
  buildDesignStabilityHistory,
  buildDesignStabilityReportFromReceipt,
  buildDesignStabilityReport,
  buildDesignStabilityResponse,
  designStabilityPlan,
  readDesignStabilityHistoryWindow,
  readDesignStabilityReceipts,
  readLatestDesignStabilityReceipt,
};
