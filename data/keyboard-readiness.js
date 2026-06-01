const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/keyboard-readiness";
const STORE_RELATIVE_PATH = path.join("var", "keyboard-readiness-receipts.json");
const maxReceipts = 50;
const historyWindowCache = new Map();

function keyboardReadinessPlan() {
  return {
    mode: "command-center-keyboard-readiness-plan",
    command: "npm run audit:keyboard-readiness",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe UI and verification endpoints, writes a local receipt under var/, and does not deploy, publish, collect visitor analytics, enable private cockpit data, or contact third parties.",
  };
}

function buildKeyboardReadinessReport({
  designStability,
  usabilityQuality,
  runtimeSurface,
  routeManifest,
  refreshPlan,
  packageManifest,
  sourceSignals,
  receipts = [],
}) {
  const checks = keyboardChecks({
    designStability,
    usabilityQuality,
    runtimeSurface,
    routeManifest,
    refreshPlan,
    packageManifest,
    sourceSignals,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);

  return {
    generatedAt: new Date().toISOString(),
    mode: "command-center-keyboard-readiness",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report audits local command-center source, CSS focus and mobile geometry, public route declarations, refresh coverage, and local receipt history. It does not claim screen-reader parity, human usability research, production CDN behavior, or every browser/device combination.",
    sideEffectBoundary:
      "This endpoint reads public-safe source signals, in-memory reports, and local receipt history only. It does not mutate visitor state, collect analytics, unlock private cockpit data, or contact third parties.",
    plan: keyboardReadinessPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      skipLinks: sourceSignals.skipLinkCount || 0,
      globalShortcuts: sourceSignals.globalShortcutCount || 0,
      terminalShortcuts: sourceSignals.terminalShortcutsCount || 0,
      proofRibbonActions: sourceSignals.proofRibbonActionCount || 0,
      mobileSafeControls: sourceSignals.mobileSafeControlSignals || 0,
      latestReceiptId: receipts[0]?.id || null,
    },
    checks,
    keyboardMap: [
      {
        id: "skip-search",
        label: "Skip to search",
        target: "#command-search",
        passed: sourceSignals.skipTargets.includes("command-search"),
        verificationCommand: "npm run test:e2e",
      },
      {
        id: "skip-ledger",
        label: "Skip to runtime ledger",
        target: "#command-ledger",
        passed: sourceSignals.skipTargets.includes("command-ledger"),
        verificationCommand: "npm run test:e2e",
      },
      {
        id: "skip-graph",
        label: "Skip to graph",
        target: "#command-graph",
        passed: sourceSignals.skipTargets.includes("command-graph"),
        verificationCommand: "npm run test:e2e",
      },
      {
        id: "skip-terminal",
        label: "Skip to terminal",
        target: "#command-terminal",
        passed: sourceSignals.skipTargets.includes("command-terminal"),
        verificationCommand: "npm run test:e2e",
      },
      {
        id: "proof-ribbon-actions",
        label: "Proof ribbon command buttons",
        target: "#proof-ribbon",
        passed: sourceSignals.hasProofRibbonActionButtons && sourceSignals.hasProofRibbonActionLabeling,
        verificationCommand: "npm run test:e2e",
      },
      {
        id: "global-search-shortcut",
        label: "Slash focuses project search",
        target: "#portfolio-query",
        passed: sourceSignals.focusesSearchShortcut,
        verificationCommand: "npm run test:e2e",
      },
      {
        id: "global-terminal-shortcut",
        label: "Backquote focuses terminal command input",
        target: "#terminal-input",
        passed: sourceSignals.focusesTerminalShortcut,
        verificationCommand: "npm run test:e2e",
      },
    ],
    mobileContract: {
      stableShortcutGeometry: Boolean(sourceSignals.hasStableShortcutGeometry),
      mobileShortcutOverride: Boolean(sourceSignals.hasMobileTerminalShortcutOverride),
      mobileFormSingleColumn: Boolean(sourceSignals.hasMobileSingleColumnForms),
      overflowWrapGuards: Boolean(sourceSignals.hasOverflowWrapGuards),
      passed:
        Boolean(sourceSignals.hasMobileTerminalShortcutOverride) &&
        Boolean(sourceSignals.hasMobileSingleColumnForms) &&
        Boolean(sourceSignals.hasOverflowWrapGuards) &&
        Boolean(designStability.mobileContract?.passed),
      verificationCommand: "npm run test:e2e",
    },
    uncertaintyPreservation: {
      proofRibbon: Boolean(sourceSignals.hasProofRibbon),
      truthLedger: Boolean(sourceSignals.hasTruthLedger),
      missingProofVisible: Boolean(sourceSignals.exposesMissingProof),
      designUncertaintyPassed: Boolean(designStability.uncertaintyContract?.passed),
      passed:
        Boolean(sourceSignals.hasProofRibbon) &&
        Boolean(sourceSignals.hasTruthLedger) &&
        Boolean(sourceSignals.exposesMissingProof) &&
        Boolean(designStability.uncertaintyContract?.passed),
      verificationCommand: "npm run audit:design-stability",
    },
    nonClaims: [
      "Does not prove full screen-reader parity; manual assistive technology review is still required.",
      "Does not prove production CDN or deploy-provider behavior; this is a local runtime and source audit.",
      "Does not hide weak proof, missing evidence, or stale receipts behind keyboard polish.",
      "Does not collect visitor behavior, keystrokes, analytics, or private cockpit data.",
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
    nextAction: failing[0]?.repairAction || "Keyboard readiness is locally verified; rerun after command-center markup, CSS, shortcut, or route changes.",
    verificationCommand: "npm run audit:keyboard-readiness && npm run test:e2e && npm run check",
  };
}

function buildKeyboardReadinessReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "command-center-keyboard-readiness-receipt" || !receipt.summary) return null;
  if (
    !Array.isArray(receipt.checks) ||
    !receipt.checks.every((check) => check.id && check.detail && check.verificationCommand) ||
    !Array.isArray(receipt.keyboardMap) ||
    !receipt.keyboardMap.every((item) => item.id && item.label && item.target && item.verificationCommand) ||
    !receipt.mobileContract ||
    !receipt.uncertaintyPreservation
  ) {
    return null;
  }

  const checks = receipt.checks.map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail,
    repairAction: check.repairAction || "Run npm run audit:keyboard-readiness or /api/keyboard-readiness?refresh=1 to refresh this cached check.",
    verificationCommand: check.verificationCommand || "npm run audit:keyboard-readiness",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "command-center-keyboard-readiness",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      receipt.sourceBoundary ||
      "This response reconstructs keyboard readiness from the latest local receipt. It is a fast public-safe cached report, not fresh keyboard testing, screen-reader parity, human usability research, production CDN proof, or browser/device-lab validation.",
    sideEffectBoundary: receipt.sideEffectBoundary || keyboardReadinessPlan().sideEffectBoundary,
    plan: keyboardReadinessPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    checks,
    keyboardMap: receipt.keyboardMap.map((item) => ({
      id: item.id,
      label: item.label,
      target: item.target,
      passed: Boolean(item.passed),
      verificationCommand: item.verificationCommand || "npm run test:e2e",
    })),
    mobileContract: {
      ...receipt.mobileContract,
      passed: Boolean(receipt.mobileContract.passed),
      verificationCommand: receipt.mobileContract.verificationCommand || "npm run test:e2e",
    },
    uncertaintyPreservation: {
      ...receipt.uncertaintyPreservation,
      passed: Boolean(receipt.uncertaintyPreservation.passed),
      verificationCommand: receipt.uncertaintyPreservation.verificationCommand || "npm run audit:design-stability",
    },
    nonClaims:
      receipt.nonClaims || [
        "Does not prove full screen-reader parity; manual assistive technology review is still required.",
        "Does not prove production CDN or deploy-provider behavior; this is a local runtime and source audit.",
        "Does not hide weak proof, missing evidence, or stale receipts behind keyboard polish.",
        "Does not collect visitor behavior, keystrokes, analytics, or private cockpit data.",
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
      "Keyboard readiness is served from the latest local receipt; run npm run audit:keyboard-readiness or /api/keyboard-readiness?refresh=1 after command-center markup, CSS, shortcut, or route changes.",
    verificationCommand: receipt.verificationCommand || "npm run audit:keyboard-readiness && npm run test:e2e && npm run check",
  };
}

function buildKeyboardReadinessResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      keyboardReadinessPayloadPolicy: {
        fullDetail: true,
        checksReturned: report.checks?.length || 0,
        keyboardMapReturned: report.keyboardMap?.length || 0,
        fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      },
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeKeyboardReadinessSummary(report.summary),
    checks: (report.checks || []).slice(0, 3).map(summarizeKeyboardReadinessCheck),
    checkCount: (report.checks || []).length,
    keyboardMap: (report.keyboardMap || []).map(summarizeKeyboardMapItem),
    mobileContract: summarizeKeyboardContract(report.mobileContract),
    uncertaintyPreservation: summarizeKeyboardContract(report.uncertaintyPreservation),
    nonClaimCount: (report.nonClaims || []).length,
    privacyBoundaryAvailable: compactKeyboardReadinessNonClaims(report.nonClaims || []).length > 0,
    repairActionCount: (report.repairActions || []).length,
    latestReceiptId: report.latestReceipt?.id || report.summary?.latestReceiptId || null,
    nextActionAvailable: Boolean(report.nextAction),
    verificationCommandAvailable: Boolean(report.verificationCommand),
    keyboardReadinessPayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
      checksPreviewReturned: Math.min((report.checks || []).length, 3),
      keyboardMapReturned: report.keyboardMap?.length || 0,
    },
  };
}

function appendKeyboardReadinessReceipt(root, receipt) {
  const receipts = readKeyboardReadinessReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readKeyboardReadinessReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readKeyboardReadinessHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readKeyboardReadinessReceipts(root);
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

function buildKeyboardReadinessHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "command-center-keyboard-readiness-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local keyboard-readiness receipts. It is still not fresh keyboard testing, screen-reader parity, human usability research, production CDN proof, or browser/device-lab validation.",
          sideEffectBoundary:
            "The history endpoint reads local keyboard-readiness receipts only. It does not run browser tests, deploy, publish, collect analytics, enable private cockpit data, or contact third parties.",
        }
      : {
          boundariesAvailable: true,
        }),
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    receiptStoreAvailable: fullDetail ? undefined : true,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          fullDetail,
          olderReceiptPreview: "full-receipt",
        }
      : {
          fullDetail,
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
          olderReceiptPreview: "trend-summary-only",
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      latestScore: latest?.summary?.score || 0,
      latestChecks: latest?.summary?.checks || 0,
      latestSkipLinks: latest?.summary?.skipLinks || 0,
      ...(fullDetail
        ? {
            latestCheckedAt: latest?.checkedAt || null,
            latestBand: latest?.summary?.band || "unknown",
            latestPassing: latest?.summary?.passing || 0,
            latestGlobalShortcuts: latest?.summary?.globalShortcuts || 0,
            latestTerminalShortcuts: latest?.summary?.terminalShortcuts || 0,
            latestProofRibbonActions: latest?.summary?.proofRibbonActions || 0,
            latestMobileSafeControls: latest?.summary?.mobileSafeControls || 0,
          }
        : {}),
    },
    definitions: fullDetail ? undefined : summarizeKeyboardReadinessDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeKeyboardReadinessReceipt(receipt, { includeOutcomes: index === 0 })),
    nextAction: fullDetail
      ? latest
        ? "Keyboard-readiness history is available; run npm run audit:keyboard-readiness after command-center markup, CSS, shortcut, or route changes."
        : "Run npm run audit:keyboard-readiness to create keyboard-readiness history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:keyboard-readiness && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeKeyboardReadinessDefinitions(receipt) {
  const checks = receipt?.checks || [];
  const keyboardMap = receipt?.keyboardMap || [];
  return {
    evidenceAccess: {
      fullReportAvailable: true,
      fullHistoryAvailable: true,
    },
    counts: {
      checks: checks.length,
      keyboardMap: keyboardMap.length,
    },
    sentinels: {
      hasGlobalKeyboardShortcuts: checks.some((check) => check.id === "global-keyboard-shortcuts"),
      hasProofRibbonActions: keyboardMap.some((item) => item.id === "proof-ribbon-actions"),
    },
  };
}

function summarizeKeyboardReadinessReceipt(receipt, { includeOutcomes = true } = {}) {
  const checks = receipt.checks || [];
  const keyboardMap = receipt.keyboardMap || [];
  const summary = {
    id: receipt.id,
    summary: summarizeKeyboardReadinessTrendSummary(receipt.summary),
    checkSummary: {
      failing: checks.filter((check) => !check.passed).length,
      hasGlobalKeyboardShortcuts: checks.some((check) => check.id === "global-keyboard-shortcuts"),
    },
    keyboardMapSummary: {
      failing: keyboardMap.filter((item) => !item.passed).length,
      hasGlobalTerminalShortcut: keyboardMap.some((item) => item.id === "global-terminal-shortcut"),
    },
    nonClaimCount: (receipt.nonClaims || []).length,
  };
  if (!includeOutcomes) {
    return {
      id: receipt.id,
      score: receipt.summary?.score || 0,
      failing: receipt.summary?.failing || 0,
      previewOnly: true,
    };
  }
  return {
    ...summary,
    contracts: {
      mobilePassed: Boolean(receipt.mobileContract?.passed),
      uncertaintyPassed: Boolean(receipt.uncertaintyPreservation?.passed),
    },
    repairActionCount: (receipt.repairActions || []).length,
  };
}

function summarizeKeyboardReadinessTrendSummary(summary = {}) {
  return {
    score: summary.score || 0,
    checks: summary.checks || 0,
    failing: summary.failing || 0,
  };
}

function summarizeKeyboardReadinessSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    skipLinks: summary.skipLinks || 0,
    globalShortcuts: summary.globalShortcuts || 0,
    terminalShortcuts: summary.terminalShortcuts || 0,
    proofRibbonActions: summary.proofRibbonActions || 0,
    mobileSafeControls: summary.mobileSafeControls || 0,
  };
}

function summarizeKeyboardReadinessCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function summarizeKeyboardMapItem(item) {
  return {
    id: item.id,
    passed: Boolean(item.passed),
  };
}

function summarizeKeyboardContract(contract = {}) {
  return {
    passed: Boolean(contract.passed),
  };
}

function compactKeyboardReadinessNonClaims(nonClaims = []) {
  const privacy = nonClaims.find((item) => /keystrokes|analytics|private cockpit/i.test(item));
  return privacy ? [privacy] : nonClaims.slice(0, 1);
}

function boundedHistoryLimit(limit) {
  const numericLimit = Number(limit);
  return Math.max(1, Math.min(Number.isFinite(numericLimit) && numericLimit > 0 ? numericLimit : 5, maxReceipts));
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

function defaultKeyboardReadinessNonClaims() {
  return [
    "Does not prove full screen-reader parity; manual assistive technology review is still required.",
    "Does not prove production CDN or deploy-provider behavior; this is a local runtime and source audit.",
    "Does not hide weak proof, missing evidence, or stale receipts behind keyboard polish.",
    "Does not collect visitor behavior, keystrokes, analytics, or private cockpit data.",
  ];
}

function keyboardChecks({
  designStability,
  usabilityQuality,
  runtimeSurface,
  routeManifest,
  refreshPlan,
  packageManifest,
  sourceSignals,
}) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const scripts = packageManifest.scripts || {};

  return [
    check({
      id: "skip-targets",
      passed:
        sourceSignals.hasSkipLinkNav &&
        sourceSignals.skipTargets.includes("command-search") &&
        sourceSignals.skipTargets.includes("command-ledger") &&
        sourceSignals.skipTargets.includes("command-graph") &&
        sourceSignals.skipTargets.includes("command-terminal") &&
        sourceSignals.skipTargets.includes("works") &&
        sourceSignals.hasSkipLinkActivationHandler &&
        sourceSignals.hasSkipFocusVisible,
      severity: "high",
      detail: `${sourceSignals.skipLinkCount || 0} skip link(s): ${sourceSignals.skipTargets.join(", ") || "none"}; activation=${sourceSignals.hasSkipLinkActivationHandler}; focus-visible=${sourceSignals.hasSkipFocusVisible}.`,
      repairAction: "Restore focus-visible, activation-backed skip links to command search, runtime ledger, graph, terminal, and selected works.",
      verificationCommand: "npm run test:e2e",
    }),
    check({
      id: "global-keyboard-shortcuts",
      passed:
        sourceSignals.hasGlobalKeyboardHandler &&
        sourceSignals.focusesSearchShortcut &&
        sourceSignals.focusesTerminalShortcut &&
        sourceSignals.escapesEditableFocus &&
        sourceSignals.respectsEditableTargets,
      severity: "high",
      detail: `handler=${sourceSignals.hasGlobalKeyboardHandler}; search=${sourceSignals.focusesSearchShortcut}; terminal=${sourceSignals.focusesTerminalShortcut}; escape=${sourceSignals.escapesEditableFocus}; editable-safe=${sourceSignals.respectsEditableTargets}.`,
      repairAction: "Restore source-level slash/backquote/Escape keyboard handling while ignoring editable fields and modifier chords.",
      verificationCommand: "npm run test:e2e",
    }),
    check({
      id: "proof-ribbon-actions",
      passed:
        sourceSignals.hasProofRibbonActionButtons &&
        sourceSignals.hasProofRibbonActionLabeling &&
        (sourceSignals.proofRibbonActionCount || 0) >= 4,
      severity: "medium",
      detail: `${sourceSignals.proofRibbonActionCount || 0} proof action(s); buttons=${sourceSignals.hasProofRibbonActionButtons}; labels=${sourceSignals.hasProofRibbonActionLabeling}.`,
      repairAction: "Keep proof ribbon health tiles keyboard-actionable with aria-labeled native buttons.",
      verificationCommand: "npm run test:e2e",
    }),
    check({
      id: "terminal-button-semantics",
      passed:
        sourceSignals.hasTerminalShortcutButtons &&
        sourceSignals.hasTerminalShortcutLabeling &&
        (sourceSignals.terminalShortcutsCount || 0) >= 18,
      severity: "medium",
      detail: `${sourceSignals.terminalShortcutsCount || 0} shortcut(s); native buttons=${sourceSignals.hasTerminalShortcutButtons}; labels=${sourceSignals.hasTerminalShortcutLabeling}.`,
      repairAction: "Keep terminal commands as native buttons and decorate each with public-safe title and aria-label text.",
      verificationCommand: "npm run test:e2e",
    }),
    check({
      id: "mobile-command-geometry",
      passed:
        sourceSignals.hasMobileTerminalShortcutOverride &&
        sourceSignals.hasMobileSingleColumnForms &&
        sourceSignals.hasOverflowWrapGuards &&
        Boolean(designStability.mobileContract?.passed),
      severity: "high",
      detail: `mobile override=${sourceSignals.hasMobileTerminalShortcutOverride}; single-column forms=${sourceSignals.hasMobileSingleColumnForms}; wrap guards=${sourceSignals.hasOverflowWrapGuards}; design mobile=${Boolean(designStability.mobileContract?.passed)}.`,
      repairAction: "Restore mobile shortcut grid overrides, single-column command forms, and overflow wrapping guards.",
      verificationCommand: "npm run test:e2e",
    }),
    check({
      id: "visible-uncertainty-preserved",
      passed:
        Boolean(sourceSignals.hasProofRibbon) &&
        Boolean(sourceSignals.hasTruthLedger) &&
        Boolean(sourceSignals.exposesMissingProof) &&
        Boolean(designStability.uncertaintyContract?.passed) &&
        (usabilityQuality.summary?.score || 0) >= 85,
      severity: "medium",
      detail: `proof ribbon=${sourceSignals.hasProofRibbon}; truth ledger=${sourceSignals.hasTruthLedger}; missing proof=${sourceSignals.exposesMissingProof}; usability=${usabilityQuality.summary?.score || 0}/100.`,
      repairAction: "Keep proof ribbon, truth ledger, and missing-proof disclosures visible while improving keyboard density.",
      verificationCommand: "npm run audit:design-stability",
    }),
    check({
      id: "route-manifest",
      passed: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => publicRoutes.includes(route)),
      severity: "high",
      detail: `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => publicRoutes.includes(route)).length}/3 keyboard route(s) declared.`,
      repairAction: "Add keyboard-readiness routes to runtimeRouteManifest.",
      verificationCommand: "npm run record:runtime-surface",
    }),
    check({
      id: "refresh-plan",
      passed: (refreshPlan.endpoints || []).includes(ENDPOINT),
      severity: "medium",
      detail: `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"} in safe refresh plan.`,
      repairAction: "Add /api/keyboard-readiness to the safe evidence refresh plan.",
      verificationCommand: "npm run refresh:evidence",
    }),
    check({
      id: "script-coverage",
      passed: Boolean(scripts["audit:keyboard-readiness"]),
      severity: "medium",
      detail: `audit:keyboard-readiness=${Boolean(scripts["audit:keyboard-readiness"])}`,
      repairAction: "Add the audit:keyboard-readiness package script.",
      verificationCommand: "npm run audit:keyboard-readiness",
    }),
    check({
      id: "runtime-receipt-boundary",
      passed: (runtimeSurface.latest?.summary?.score || 0) >= 95 && (runtimeSurface.latest?.summary?.failing || 0) === 0,
      severity: "medium",
      detail: `surface=${runtimeSurface.latest?.summary?.score || 0}/100; failing=${runtimeSurface.latest?.summary?.failing ?? "missing"}.`,
      repairAction: "Refresh runtime surface receipts after adding keyboard-readiness routes.",
      verificationCommand: "npm run record:runtime-surface",
    }),
  ];
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
  appendKeyboardReadinessReceipt,
  buildKeyboardReadinessHistory,
  buildKeyboardReadinessReportFromReceipt,
  buildKeyboardReadinessReport,
  buildKeyboardReadinessResponse,
  keyboardReadinessPlan,
  readKeyboardReadinessHistoryWindow,
  readKeyboardReadinessReceipts,
};
