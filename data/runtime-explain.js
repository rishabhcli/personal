const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/runtime-explain";
const STORE_RELATIVE_PATH = path.join("var", "runtime-explain-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function runtimeExplainPlan() {
  return {
    mode: "runtime-truth-explanation-plan",
    command: "npm run explain:runtime",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The explainer recorder starts a temporary local server, reads public-safe runtime truth endpoints, writes a local receipt under var/, and does not deploy, publish, mutate git history, enable private cockpit data, query provider dashboards, or contact third parties.",
  };
}

function buildRuntimeExplanationReport({
  runtimeReport,
  runtimeAttestation,
  runtimeSurface,
  runtimeBoundary,
  runtimeReconciliation,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const proofClaims = buildProofClaims({ runtimeReport, runtimeAttestation, runtimeSurface, runtimeBoundary, runtimeReconciliation });
  const receiptExplanations = (runtimeReconciliation.receiptMatrix || []).map(explainReceipt);
  const claimFirewall = runtimeClaimFirewall({ proofClaims, runtimeReport, runtimeSurface, runtimeReconciliation, routeManifest });
  const auditLadder = runtimeAuditLadder({ proofClaims, receiptExplanations, runtimeReport, runtimeSurface, runtimeReconciliation, claimFirewall });
  const checks = explanationChecks({
    proofClaims,
    receiptExplanations,
    claimFirewall,
    auditLadder,
    runtimeReconciliation,
    runtimeAttestation,
    runtimeBoundary,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);

  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-truth-explanation",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This explainer translates local public-safe runtime receipts into human-readable proof claims. It proves local runtime coherence only; it does not prove CDN cache state, deploy-provider identity, external uptime, private cockpit contents, or third-party account state.",
    sideEffectBoundary:
      "This endpoint reads in-memory runtime reports and local receipt files only. It does not start recorders, deploy, publish, mutate git history, enable private routes, query provider dashboards, or contact third parties.",
    plan: runtimeExplainPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      proofClaims: proofClaims.length,
      receiptKinds: runtimeReconciliation.summary?.receiptKinds || 0,
      staleReceiptKinds: runtimeReconciliation.summary?.staleReceiptKinds || 0,
      publicApiRoutes: routeManifest.publicApiRoutes?.length || 0,
      privateApiRoutes: routeManifest.privateApiRoutes?.length || 0,
      refreshEndpoints: refreshPlan.endpoints?.length || 0,
      receiptExplanations: receiptExplanations.length,
      auditLadderSteps: auditLadder.steps.length,
      claimFirewallBlockedClaims: claimFirewall.blockedClaims.length,
      safeLocalClaims: claimFirewall.allowedLocalClaims.length,
      latestReceiptId: receipts[0]?.id || null,
    },
    quickRead: [
      `Runtime identity hash ${runtimeReport.current.identityHash} covers package, build, git, Node major, and domain declarations.`,
      `Surface contract covers ${runtimeReport.current.identity.publicApiRoutes || 0} public routes, ${runtimeReport.current.identity.privateApiRoutes || 0} private routes, and ${runtimeReport.current.identity.refreshEndpoints || 0} refresh endpoints.`,
      `Volatile hash ${runtimeReport.current.volatileHash} isolates host, PID, port, and Node patch-level runtime details.`,
      `Reconciliation is ${runtimeReconciliation.summary?.score}/100 with ${runtimeReconciliation.summary?.staleReceiptKinds} stale receipt kind(s).`,
      "This is local proof, not production-provider or CDN proof.",
    ],
    identityExplanation: {
      identityHash: runtimeReport.current.identityHash,
      volatileHash: runtimeReport.current.volatileHash,
      identityInputs: runtimeReport.current.hashInputs.identity,
      volatileInputs: runtimeReport.current.hashInputs.volatile,
      currentInterpretation: runtimeReport.diff.interpretation,
      previousReceiptId: runtimeReport.previous?.id || null,
    },
    receiptExplanations,
    routeExplanation: {
      publicApiRoutes: routeManifest.publicApiRoutes?.length || 0,
      privateApiRoutes: routeManifest.privateApiRoutes?.length || 0,
      staticRoutes: routeManifest.staticRoutes?.length || 0,
      surfaceProbeTargets: runtimeSurface.plan?.routeInventory?.probeTargets || 0,
      privateGate: routeManifest.privateGate,
      proof: "Runtime surface receipts compare declared public, static, and private-gated routes against a temporary local server.",
      limit: "Route probes do not prove production CDN rewrites, provider dashboards, or third-party API availability.",
    },
    boundaryExplanation: {
      score: runtimeBoundary.summary?.score || 0,
      privateGateProbeTargets: runtimeBoundary.summary?.privateGateProbeTargets || 0,
      privateGatePassing: runtimeSurface.latest?.summary?.privateGatePassing || 0,
      rule: "Private routes must return the public default status unless ENABLE_PRIVATE_COCKPIT=1 is set from localhost.",
      limit: "The public runtime never exposes private cockpit payloads by default; this explainer also does not read private stores.",
    },
    auditLadder,
    claimFirewall,
    proofClaims,
    checks,
    nonClaims: [
      "Does not prove the current production deploy hash unless production exposes the same runtime endpoint and receipt chain.",
      "Does not prove CDN cache, DNS propagation, provider dashboard settings, or external uptime.",
      "Does not inspect private cockpit contents, private files, calendars, inboxes, credentials, or third-party accounts.",
      "Does not replace live verification after route, build, domain, private-gate, or deployment changes.",
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
    nextAction: failing[0]?.repairAction || "Runtime truth is explainable and current; rerun explain:runtime after runtime, route, build, or receipt changes.",
    verificationCommand: "npm run explain:runtime && npm run audit:runtime-chain && npm run verify",
  };
}

function buildRuntimeExplanationReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "runtime-truth-explanation-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "runtime-truth-explanation" ||
    !report.summary ||
    !Array.isArray(report.quickRead) ||
    !report.identityExplanation ||
    !report.identityExplanation.identityHash ||
    !Array.isArray(report.receiptExplanations) ||
    !report.receiptExplanations.every((item) => item.id && item.receiptId && item.proves && item.limit && item.repairCommand) ||
    !report.routeExplanation ||
    !report.boundaryExplanation ||
    !report.auditLadder ||
    report.auditLadder.mode !== "runtime-truth-audit-ladder" ||
    !Array.isArray(report.auditLadder.steps) ||
    !report.auditLadder.steps.every((step) => step.id && step.manualOnly === true && step.externalWrite === false && step.nonClaim && step.verificationCommand) ||
    !report.claimFirewall ||
    report.claimFirewall.mode !== "runtime-truth-claim-firewall" ||
    !Array.isArray(report.claimFirewall.blockedClaims) ||
    !report.claimFirewall.blockedClaims.every((claim) => claim.id && claim.claim && claim.reason && claim.replacement && claim.verificationCommand) ||
    !Array.isArray(report.proofClaims) ||
    !report.proofClaims.every((claim) => claim.id && claim.statement && claim.limit && claim.verificationCommand) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand) ||
    !Array.isArray(report.nonClaims) ||
    !report.nextAction
  ) {
    return null;
  }

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs runtime truth explanation from the latest local receipt. It proves local receipt-backed explanation only; it is not fresh hosted production, CDN, DNS, provider, uptime, private-cockpit, or third-party account proof.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || runtimeExplainPlan().sideEffectBoundary,
    plan: runtimeExplainPlan(),
    summary: {
      ...report.summary,
      latestReceiptId: receipt.id,
    },
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || report.summary.score || 0,
      passing: receipt.summary?.passing || report.summary.passing || 0,
      checks: receipt.summary?.checks || report.summary.checks || 0,
    },
    verificationCommand: report.verificationCommand || "npm run explain:runtime && npm run audit:runtime-chain && npm run verify",
  };
}

function buildRuntimeExplanationResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      runtimeExplanationPayloadPolicy: runtimeExplanationPayloadPolicy({ report, fullDetail }),
    };
  }

  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy,
    boundariesAvailable: Boolean(report.sourceBoundary && report.sideEffectBoundary),
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeRuntimeExplanationSummaryForResponse(report.summary),
    identityExplanation: summarizeIdentityExplanation(report.identityExplanation),
    receiptExplanationSummary: summarizeReceiptExplanationsForResponse(report.receiptExplanations || []),
    routeExplanation: summarizeRouteExplanation(report.routeExplanation),
    boundaryExplanation: summarizeBoundaryExplanation(report.boundaryExplanation),
    auditLadder: summarizeAuditLadderForResponse(report.auditLadder),
    claimFirewall: summarizeClaimFirewallForResponse(report.claimFirewall),
    proofClaims: selectProofClaimPreview(report.proofClaims || []).map(summarizeProofClaimForResponse),
    checks: selectRuntimeExplanationCheckPreview(report.checks || []).map(summarizeCheckForResponse),
    nonClaimCount: (report.nonClaims || []).length,
    nonClaimsAvailable: Boolean((report.nonClaims || []).length),
    latestReceiptId: report.latestReceipt?.id || report.summary?.latestReceiptId || null,
    nextActionAvailable: Boolean(report.nextAction),
    verificationCommandAvailable: Boolean(report.verificationCommand),
    runtimeExplanationPayloadPolicy: runtimeExplanationPayloadPolicy({ report, fullDetail }),
  };
}

function buildProofClaims({ runtimeReport, runtimeAttestation, runtimeSurface, runtimeBoundary, runtimeReconciliation }) {
  return [
    {
      id: "identity-fingerprint",
      statement: "The local runtime identity is fingerprinted and can be compared with the latest receipt.",
      evidence: [`identity=${runtimeReport.current.identityHash}`, `readiness=${runtimeReport.readiness.score}/100`, `previous=${runtimeReport.previous?.id || "none"}`],
      limit: "Identity drift still needs human review before treating two deployments as equivalent.",
      confidence: runtimeReport.readiness.score,
      verificationCommand: "npm run record:runtime",
    },
    {
      id: "surface-contract",
      statement: "The runtime identity includes route counts, refresh coverage, private-gate policy, and critical verification scripts.",
      evidence: [
        `publicRoutes=${runtimeReport.current.identity.publicApiRoutes || 0}`,
        `privateRoutes=${runtimeReport.current.identity.privateApiRoutes || 0}`,
        `refreshEndpoints=${runtimeReport.current.identity.refreshEndpoints || 0}`,
        `privateGate=${runtimeReport.current.identity.privateGateDefaultStatus || "missing"}`,
      ],
      limit: "Counts prove local contract shape only; route probes and hosted parity still need separate receipts.",
      confidence: runtimeReport.checks.find((check) => check.id === "surface-contract")?.passed ? 100 : 50,
      verificationCommand: "npm run record:runtime && npm run record:runtime-surface",
    },
    {
      id: "surface-manifest",
      statement: "The declared route manifest has a matching local probe receipt.",
      evidence: [
        `${runtimeSurface.latest?.summary?.passing || 0}/${runtimeSurface.latest?.summary?.total || 0} probe(s) passing`,
        `private gate ${runtimeSurface.latest?.summary?.privateGatePassing || 0}/${runtimeSurface.plan?.routeInventory?.privateApiRoutes || 0}`,
      ],
      limit: "Local route probes do not prove CDN/provider route rewrites.",
      confidence: runtimeSurface.latest?.summary?.score || 0,
      verificationCommand: "npm run record:runtime-surface",
    },
    {
      id: "refresh-coherence",
      statement: "Public-safe evidence refresh coverage matches the current refresh plan.",
      evidence: [`refresh=${runtimeReconciliation.summary?.refreshReceiptId || "missing"}`, `stale=${runtimeReconciliation.summary?.staleReceiptKinds || 0}`],
      limit: "Refresh receipts do not call private routes or external provider dashboards.",
      confidence: runtimeReconciliation.summary?.score || 0,
      verificationCommand: "npm run refresh:evidence",
    },
    {
      id: "boundary-gate",
      statement: "Private routes are modeled as gated localhost-only surfaces.",
      evidence: [`boundary=${runtimeBoundary.summary?.score || 0}/100`, `attestation=${runtimeAttestation.summary?.score || 0}/100`],
      limit: "This proves default local gating, not authorization for external systems.",
      confidence: Math.min(runtimeBoundary.summary?.score || 0, runtimeAttestation.summary?.score || 0),
      verificationCommand: "npm run record:runtime-surface && npm run check",
    },
    {
      id: "reconciliation",
      statement: "Runtime truth, route surface, and evidence refresh receipts currently reconcile.",
      evidence: (runtimeReconciliation.receiptMatrix || []).map((item) => `${item.id}:${item.freshness}:${item.receiptId || "missing"}`),
      limit: "Reconciliation is only current until the next meaningful route, build, runtime, or evidence change.",
      confidence: runtimeReconciliation.summary?.score || 0,
      verificationCommand: "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence",
    },
  ];
}

function explainReceipt(receipt) {
  return {
    id: receipt.id,
    label: receipt.label,
    receiptId: receipt.receiptId,
    freshness: receipt.freshness,
    score: receipt.score,
    band: receipt.band,
    proves: receipt.freshness === "fresh" ? `${receipt.label} matches its current expected value.` : `${receipt.label} needs to be regenerated before it can be treated as current.`,
    limit: receipt.id === "runtime-truth" ? "Does not prove remote deploy identity by itself." : receipt.id === "runtime-surface" ? "Does not prove CDN/provider routing." : "Does not refresh private or third-party systems.",
    repairCommand: receipt.command,
    detail: receipt.detail,
  };
}

function runtimeClaimFirewall({ proofClaims, runtimeReport, runtimeSurface, runtimeReconciliation, routeManifest }) {
  const blockedClaims = [
    blockedClaim({
      id: "production-deploy-identity",
      claim: "Do not claim this proves the current production deploy hash or Vercel dashboard state.",
      reason: "The report is generated from the currently queried local or hosted runtime endpoint and local receipt files only.",
      replacement: "This proves the local runtime identity and receipt chain for the server that answered the request.",
      verificationCommand: "npm run record:runtime && npm run audit:runtime-deploy",
    }),
    blockedClaim({
      id: "cdn-cache",
      claim: "Do not claim CDN cache, edge rewrites, or DNS propagation are correct.",
      reason: "Surface probes run against a temporary local server unless a separate hosted probe is implemented.",
      replacement: "Local route declarations and local probe receipts are coherent.",
      verificationCommand: "npm run record:runtime-surface",
    }),
    blockedClaim({
      id: "external-uptime",
      claim: "Do not claim external uptime, third-party API health, or provider availability.",
      reason: "Runtime receipts avoid contacting external services or provider dashboards.",
      replacement: "Local endpoints and public-safe generated reports are reachable in the tested runtime.",
      verificationCommand: "npm run record:runtime-surface && npm run refresh:evidence",
    }),
    blockedClaim({
      id: "private-cockpit-contents",
      claim: "Do not claim private cockpit data, private files, credentials, calendars, or inboxes were inspected.",
      reason: "The explainer reads public-safe runtime reports and local receipt history only.",
      replacement: `Private route count and default gate policy are modeled: ${routeManifest.privateApiRoutes?.length || 0} private route(s), default ${routeManifest.privateGate?.publicDefaultStatus || "unknown"}.`,
      verificationCommand: "npm run record:runtime-surface && npm run check",
    }),
    blockedClaim({
      id: "provider-dashboard",
      claim: "Do not claim provider settings, deployment protection, domains, or secrets match the local model.",
      reason: "No provider dashboard, account, or secret store is queried.",
      replacement: "The app exposes declared domain and route models for manual comparison.",
      verificationCommand: "npm run audit:runtime-deploy",
    }),
    blockedClaim({
      id: "future-drift",
      claim: "Do not claim this explanation remains current after future route, build, runtime, or receipt changes.",
      reason: `Current reconciliation score is ${runtimeReconciliation.summary?.score || 0}/100 with ${runtimeReconciliation.summary?.staleReceiptKinds || 0} stale receipt kind(s).`,
      replacement: "Rerun the runtime receipt chain after meaningful runtime changes.",
      verificationCommand: "npm run record:runtime && npm run record:runtime-surface && npm run refresh:evidence && npm run explain:runtime",
    }),
  ];

  return {
    mode: "runtime-truth-claim-firewall",
    externalWrite: false,
    allowedLocalClaims: proofClaims.map((claim) => ({
      id: claim.id,
      statement: claim.statement,
      confidence: claim.confidence,
      verificationCommand: claim.verificationCommand,
    })),
    blockedClaims,
    runtimeContext: {
      identityHash: runtimeReport.current.identityHash,
      surfaceScore: runtimeSurface.latest?.summary?.score || 0,
      reconciliationScore: runtimeReconciliation.summary?.score || 0,
      privateGateDefaultStatus: routeManifest.privateGate?.publicDefaultStatus || null,
    },
    verificationCommand: "npm run explain:runtime && npm run audit:runtime-chain",
  };
}

function runtimeAuditLadder({ proofClaims, receiptExplanations, runtimeReport, runtimeSurface, runtimeReconciliation, claimFirewall }) {
  const steps = [
    ladderStep({
      id: "runtime-fingerprint",
      label: "Fingerprint runtime identity",
      receiptId: runtimeReconciliation.summary?.runtimeReceiptId || runtimeReport.previous?.id || null,
      proves: "Package/build/git/domain/route-count identity is hashed.",
      doesNotProve: "Hosted provider identity or CDN state.",
      verificationCommand: "npm run record:runtime",
    }),
    ladderStep({
      id: "surface-probes",
      label: "Probe declared local routes",
      receiptId: runtimeReconciliation.summary?.surfaceReceiptId || runtimeSurface.latest?.id || null,
      proves: `${runtimeSurface.latest?.summary?.passing || 0}/${runtimeSurface.latest?.summary?.total || 0} local route probe(s) passed.`,
      doesNotProve: "External provider rewrites, edge cache, or DNS propagation.",
      verificationCommand: "npm run record:runtime-surface",
    }),
    ladderStep({
      id: "refresh-public-evidence",
      label: "Refresh public-safe evidence endpoints",
      receiptId: runtimeReconciliation.summary?.refreshReceiptId || null,
      proves: `${runtimeReconciliation.summary?.refreshReceiptId || "latest refresh receipt"} matches the public-safe refresh plan.`,
      doesNotProve: "Private cockpit or third-party system state.",
      verificationCommand: "npm run refresh:evidence",
    }),
    ladderStep({
      id: "reconcile-receipts",
      label: "Reconcile runtime receipt freshness",
      receiptId: runtimeReconciliation.summary?.latestReceiptId || null,
      proves: `${runtimeReconciliation.summary?.score || 0}/100 reconciliation with ${runtimeReconciliation.summary?.staleReceiptKinds || 0} stale receipt kind(s).`,
      doesNotProve: "Future drift after this report is generated.",
      verificationCommand: "npm run diff:runtime && npm run explain:runtime",
    }),
    ladderStep({
      id: "explain-non-claims",
      label: "Attach claim firewall",
      receiptId: null,
      proves: `${claimFirewall.blockedClaims.length} blocked claim(s) make limits explicit.`,
      doesNotProve: "That blocked claims are false; only that this report did not verify them.",
      verificationCommand: "npm run explain:runtime",
    }),
    ladderStep({
      id: "manual-handoff",
      label: "Manual compare handoff",
      receiptId: null,
      proves: `${proofClaims.length} local proof claim(s) have verification commands and limits.`,
      doesNotProve: "That a human has accepted production parity.",
      verificationCommand: "npm run audit:runtime-chain && npm run verify",
    }),
  ];

  return {
    mode: "runtime-truth-audit-ladder",
    summary: {
      steps: steps.length,
      receiptBackedSteps: steps.filter((step) => step.receiptId).length,
      manualOnly: steps.filter((step) => step.manualOnly && step.externalWrite === false).length,
      receiptExplanations: receiptExplanations.length,
    },
    steps,
  };
}

function blockedClaim({ id, claim, reason, replacement, verificationCommand }) {
  return {
    id,
    claim,
    reason,
    replacement,
    verificationCommand,
  };
}

function ladderStep({ id, label, receiptId, proves, doesNotProve, verificationCommand }) {
  return {
    id,
    label,
    receiptId,
    proves,
    doesNotProve,
    manualOnly: true,
    externalWrite: false,
    nonClaim: doesNotProve,
    verificationCommand,
  };
}

function explanationChecks({
  proofClaims,
  receiptExplanations,
  claimFirewall,
  auditLadder,
  runtimeReconciliation,
  runtimeAttestation,
  runtimeBoundary,
  routeManifest,
  refreshPlan,
  packageManifest,
}) {
  const routeCovered = (routeManifest.publicApiRoutes || []).includes(ENDPOINT);
  const refreshCovered = (refreshPlan.endpoints || []).includes(ENDPOINT);
  const scripts = packageManifest.scripts || {};
  return [
    check("reconciliation-current", runtimeReconciliation.summary?.score >= 85 && runtimeReconciliation.summary?.staleReceiptKinds === 0, "high", `${runtimeReconciliation.summary?.score}/100; stale=${runtimeReconciliation.summary?.staleReceiptKinds}.`, "Refresh runtime, surface, and evidence receipts before explaining runtime truth."),
    check("proof-claim-depth", proofClaims.length >= 5 && proofClaims.every((claim) => claim.statement && claim.limit && claim.verificationCommand), "medium", `${proofClaims.length} proof claim(s).`, "Keep proof claims paired with limits and verification commands."),
    check(
      "receipt-explanation-custody",
      receiptExplanations.length >= 3 && receiptExplanations.every((receipt) => receipt.receiptId && receipt.freshness === "fresh" && receipt.limit && receipt.repairCommand),
      "high",
      `${receiptExplanations.filter((receipt) => receipt.freshness === "fresh").length}/${receiptExplanations.length} fresh receipt explanation(s).`,
      "Keep runtime, surface, and refresh receipt explanations fresh and repairable.",
    ),
    check(
      "claim-firewall",
      claimFirewall.externalWrite === false &&
        claimFirewall.blockedClaims.length >= 6 &&
        ["production-deploy-identity", "cdn-cache", "external-uptime", "private-cockpit-contents"].every((id) => claimFirewall.blockedClaims.some((claim) => claim.id === id)),
      "high",
      `${claimFirewall.blockedClaims.length} blocked claim(s), ${claimFirewall.allowedLocalClaims.length} allowed local claim(s).`,
      "Pair runtime proof with explicit blocked claims about production, CDN, provider, private, and future-drift facts.",
    ),
    check(
      "audit-ladder",
      auditLadder.steps.length >= 6 && auditLadder.steps.every((step) => step.manualOnly === true && step.externalWrite === false && step.nonClaim && step.verificationCommand),
      "medium",
      `${auditLadder.steps.length} audit ladder step(s).`,
      "Expose the route from runtime fingerprint to manual production-parity handoff.",
    ),
    check("attestation-boundary", runtimeAttestation.summary?.score >= 85 && runtimeBoundary.summary?.score >= 85, "high", `attestation=${runtimeAttestation.summary?.score}; boundary=${runtimeBoundary.summary?.score}.`, "Repair attestation or boundary before publishing runtime explanations."),
    check("route-manifest", routeCovered, "high", `${ENDPOINT} ${routeCovered ? "declared" : "missing"}.`, `Add ${ENDPOINT} to the public runtime route manifest.`),
    check("refresh-plan", refreshCovered, "medium", `${ENDPOINT} ${refreshCovered ? "covered" : "missing"}.`, `Add ${ENDPOINT} to the safe evidence refresh plan.`),
    check("script-coverage", Boolean(scripts["explain:runtime"]), "medium", `explain:runtime=${Boolean(scripts["explain:runtime"])}`, "Add the explain:runtime recorder script."),
  ];
}

function appendRuntimeExplainReceipt(root, receipt) {
  const receipts = readRuntimeExplainReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function buildRuntimeExplanationHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "runtime-truth-explanation-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail ? "Full local runtime-truth explanation receipts." : undefined,
    historyDetailAvailable: fullDetail ? undefined : true,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: runtimeExplanationHistoryPayloadPolicy({ fullDetail }),
    summary: runtimeExplanationHistorySummary({ limited, totalAvailable, boundedLimit, fullDetail }),
    definitions: fullDetail ? undefined : summarizeRuntimeExplanationDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeRuntimeExplanationReceipt(receipt, { includeDetail: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Runtime explanation history is available; run npm run explain:runtime after runtime, route, build, receipt, or claim-boundary changes."
        : "Run npm run explain:runtime to create runtime explanation history."
      : undefined,
    nextActionAvailable: fullDetail ? undefined : Boolean(limited[0]),
    verificationCommand: fullDetail ? "npm run explain:runtime && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: fullDetail ? undefined : true,
  };
}

function runtimeExplanationHistoryPayloadPolicy({ fullDetail }) {
  if (fullDetail) {
    return {
      detail: "full",
      fullDetail,
      defaultLimit: 5,
      fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
      latestReceiptPreview: "full-receipt",
      olderReceiptPreview: "full-receipt",
    };
  }
  return {
    fullDetail,
    fullDetailAvailable: true,
  };
}

function runtimeExplanationHistorySummary({ limited, totalAvailable, boundedLimit, fullDetail = false }) {
  const latest = limited[0] || null;
  const summary = {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
  };
  if (!fullDetail) return summary;
  return {
    ...summary,
    latestCheckedAt: latest?.checkedAt || null,
    latestScore: latest?.summary?.score || latest?.report?.summary?.score || 0,
    latestBand: latest?.summary?.band || latest?.report?.summary?.band || "unknown",
    latestProofClaims: latest?.summary?.proofClaims || latest?.report?.summary?.proofClaims || 0,
    latestReceiptExplanations: latest?.summary?.receiptExplanations || latest?.report?.summary?.receiptExplanations || 0,
    latestAuditLadderSteps: latest?.summary?.auditLadderSteps || latest?.report?.summary?.auditLadderSteps || 0,
    latestBlockedClaims: latest?.summary?.claimFirewallBlockedClaims || latest?.report?.summary?.claimFirewallBlockedClaims || 0,
  };
}

function summarizeRuntimeExplanationDefinitions(receipt) {
  const report = receipt?.report || receipt || {};
  const claimFirewall =
    claimFirewallWithArrays(receipt?.claimFirewall) || claimFirewallWithArrays(report.claimFirewall) || receipt?.claimFirewall || report.claimFirewall || {};
  const auditLadder = auditLadderWithSteps(receipt?.auditLadder) || auditLadderWithSteps(report.auditLadder) || receipt?.auditLadder || report.auditLadder || {};
  const proofClaims = nonEmptyArray(receipt?.proofClaims) || nonEmptyArray(report.proofClaims) || [];
  const checks = nonEmptyArray(receipt?.checks) || nonEmptyArray(report.checks) || [];
  return {
    fullReportAvailable: true,
    commandAvailable: Boolean(runtimeExplainPlan().command),
    receiptExplanationCount: (receipt?.receiptExplanations || report.receiptExplanations || []).length,
    blockedClaimCount: Array.isArray(claimFirewall.blockedClaims) ? claimFirewall.blockedClaims.length : 0,
    auditLadderStepCount: Array.isArray(auditLadder.steps) ? auditLadder.steps.length : 0,
    proofClaimCount: proofClaims.length,
    checkCount: checks.length,
    nonClaimCount: (receipt?.nonClaims || report.nonClaims || []).length,
  };
}

function readRuntimeExplainReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestRuntimeExplainReceipt(root) {
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

function readRuntimeExplainHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readRuntimeExplainReceipts(root);
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

function summarizeRuntimeExplanationReceipt(receipt, { includeDetail = true } = {}) {
  const report = receipt.report || {};
  const summary = receipt.summary || report.summary || {};
  const identity = receipt.identityExplanation || report.identityExplanation || {};
  const claimFirewall = claimFirewallWithArrays(receipt.claimFirewall) || claimFirewallWithArrays(report.claimFirewall) || receipt.claimFirewall || report.claimFirewall || {};
  const auditLadder = auditLadderWithSteps(receipt.auditLadder) || auditLadderWithSteps(report.auditLadder) || receipt.auditLadder || report.auditLadder || {};
  const receiptExplanations = nonEmptyArray(receipt.receiptExplanations) || nonEmptyArray(report.receiptExplanations) || [];
  const proofClaims = nonEmptyArray(receipt.proofClaims) || nonEmptyArray(report.proofClaims) || [];
  const checks = nonEmptyArray(receipt.checks) || nonEmptyArray(report.checks) || [];
  const nonClaims = nonEmptyArray(receipt.nonClaims) || nonEmptyArray(report.nonClaims) || [];
  const base = {
    id: receipt.id,
    checkedAt: receipt.checkedAt || null,
    trendSummary: {
      score: summary.score || 0,
      proofClaims: summary.proofClaims || proofClaims.length,
      blockedClaims: Array.isArray(claimFirewall.blockedClaims) ? claimFirewall.blockedClaims.length : 0,
      failingChecks: checks.filter((check) => !check.passed).length,
    },
  };

  if (!includeDetail) {
    return {
      id: receipt.id,
      checkedAt: receipt.checkedAt || null,
      trendSummary: {
        score: summary.score || 0,
        proofClaims: proofClaims.length,
        blockedClaims: Array.isArray(claimFirewall.blockedClaims) ? claimFirewall.blockedClaims.length : 0,
        failingChecks: checks.filter((check) => !check.passed).length,
      },
    };
  }

  return {
    ...base,
    identityHash: identity.identityHash || null,
    receiptExplanationSummary: {
      total: receiptExplanations.length,
      stale: receiptExplanations.filter((item) => item.freshness === "stale").length,
    },
    claimFirewallSummary: {
      blockedClaims: Array.isArray(claimFirewall.blockedClaims) ? claimFirewall.blockedClaims.length : 0,
    },
    auditLadderSummary: {
      steps: Array.isArray(auditLadder.steps) ? auditLadder.steps.length : 0,
    },
    proofClaimSummary: {
      total: proofClaims.length,
    },
    checkSummary: {
      total: checks.length,
      failing: checks.filter((check) => !check.passed).length,
    },
    nonClaimCount: nonClaims.length,
  };
}

function summarizeRuntimeExplanationPlan(plan = {}) {
  return {
    mode: plan.mode,
    command: plan.command,
    endpoint: plan.endpoint,
    receiptStore: plan.receiptStore,
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
  };
}

function summarizeIdentityExplanation(identity = {}) {
  return {
    identityHashAvailable: Boolean(identity.identityHash),
    identityInputCount: Array.isArray(identity.identityInputs) ? identity.identityInputs.length : 0,
    volatileInputCount: Array.isArray(identity.volatileInputs) ? identity.volatileInputs.length : 0,
    previousReceiptAvailable: Boolean(identity.previousReceiptId),
  };
}

function summarizeRuntimeExplanationSummaryForResponse(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    proofClaims: summary.proofClaims || 0,
    receiptExplanations: summary.receiptExplanations || 0,
    auditLadderSteps: summary.auditLadderSteps || 0,
    claimFirewallBlockedClaims: summary.claimFirewallBlockedClaims || 0,
    safeLocalClaims: summary.safeLocalClaims || 0,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function summarizeReceiptExplanationsForResponse(receipts = []) {
  return {
    total: receipts.length,
    fresh: receipts.filter((receipt) => receipt.freshness === "fresh").length,
    stale: receipts.filter((receipt) => receipt.freshness === "stale").length,
    repairCommandsAvailable: receipts.filter((receipt) => receipt.repairCommand).length,
  };
}

function summarizeRouteExplanation(route = {}) {
  return {
    publicApiRoutes: route.publicApiRoutes || 0,
    privateApiRoutes: route.privateApiRoutes || 0,
    privateGateAvailable: Boolean(route.privateGate),
  };
}

function summarizeBoundaryExplanation(boundary = {}) {
  return {
    score: boundary.score || 0,
    privateGateProbeTargets: boundary.privateGateProbeTargets || 0,
    privateGatePassing: boundary.privateGatePassing || 0,
  };
}

function summarizeAuditLadderForResponse(auditLadder = {}) {
  return {
    mode: auditLadder.mode || null,
    stepCount: (auditLadder.steps || []).length,
    steps: selectAuditLadderPreview(auditLadder.steps || []).map((step) => ({
      id: step.id,
      manualOnly: step.manualOnly === true,
      externalWrite: step.externalWrite === true ? true : false,
    })),
  };
}

function summarizeClaimFirewallForResponse(firewall = {}) {
  return {
    mode: firewall.mode || null,
    externalWrite: firewall.externalWrite === true ? true : false,
    allowedLocalClaimCount: (firewall.allowedLocalClaims || []).length,
    blockedClaimCount: (firewall.blockedClaims || []).length,
    blockedClaims: selectBlockedClaimPreview(firewall.blockedClaims || []).map((claim) => ({
      id: claim.id,
    })),
  };
}

function summarizeProofClaimForResponse(claim = {}) {
  return {
    id: claim.id,
    detailAvailable: Boolean(claim.statement && claim.limit && claim.verificationCommand),
  };
}

function summarizeCheckForResponse(check = {}) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function selectProofClaimPreview(claims = []) {
  return selectRowsById(claims, ["identity-fingerprint", "surface-contract", "reconciliation"], 3);
}

function selectAuditLadderPreview(steps = []) {
  return selectRowsById(steps, ["runtime-fingerprint", "manual-handoff"], 2);
}

function selectBlockedClaimPreview(claims = []) {
  return selectRowsById(claims, ["production-deploy-identity", "private-cockpit-contents"], 2);
}

function selectRuntimeExplanationCheckPreview(checks = []) {
  const required = selectRowsById(checks, ["claim-firewall", "audit-ladder"], 2);
  const failing = checks.filter((check) => !check.passed && !required.some((row) => row.id === check.id));
  return [...required, ...failing].slice(0, 4);
}

function selectRowsById(rows = [], ids = [], limit = ids.length) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const selected = ids.map((id) => byId.get(id)).filter(Boolean);
  for (const row of rows) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.id === row.id)) selected.push(row);
  }
  return selected.slice(0, limit);
}

function runtimeExplanationPayloadPolicy({ report, fullDetail }) {
  const proofClaims = report.proofClaims || [];
  const blockedClaims = report.claimFirewall?.blockedClaims || [];
  const auditLadderSteps = report.auditLadder?.steps || [];
  const checks = report.checks || [];
  if (!fullDetail) {
    return {
      fullDetail: false,
      fullDetailAvailable: true,
      proofClaimsReturned: selectProofClaimPreview(proofClaims).length,
      blockedClaimsReturned: selectBlockedClaimPreview(blockedClaims).length,
      auditLadderStepsReturned: selectAuditLadderPreview(auditLadderSteps).length,
      checksReturned: selectRuntimeExplanationCheckPreview(checks).length,
    };
  }
  return {
    fullDetail: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    proofClaims: proofClaims.length,
    proofClaimsReturned: proofClaims.length,
    blockedClaims: blockedClaims.length,
    blockedClaimsReturned: blockedClaims.length,
    auditLadderSteps: auditLadderSteps.length,
    auditLadderStepsReturned: auditLadderSteps.length,
    receiptExplanations: (report.receiptExplanations || []).length,
    checks: checks.length,
    checksReturned: checks.length,
    omittedFromSummary: [],
    omittedFromSummaryCount: 0,
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: id === "script-coverage" ? "npm run explain:runtime" : "npm run check && node server.js # then open /api/runtime-explain",
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

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length ? value : null;
}

function claimFirewallWithArrays(value) {
  return value && Array.isArray(value.allowedLocalClaims) && Array.isArray(value.blockedClaims) ? value : null;
}

function auditLadderWithSteps(value) {
  return value && Array.isArray(value.steps) ? value : null;
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

module.exports = {
  appendRuntimeExplainReceipt,
  buildRuntimeExplanationHistory,
  buildRuntimeExplanationReportFromReceipt,
  buildRuntimeExplanationReport,
  buildRuntimeExplanationResponse,
  readLatestRuntimeExplainReceipt,
  readRuntimeExplainHistoryWindow,
  readRuntimeExplainReceipts,
  runtimeExplainPlan,
};
