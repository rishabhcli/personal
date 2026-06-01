const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const RECEIPT_RELATIVE_PATH = path.join("var", "proof-trial-receipts.json");
const PROOF_TRIAL_INDEX_PREVIEW_LIMIT = 3;
const maxReceipts = 50;

function proofTrialsPlan() {
  return {
    mode: "safe-live-proof-trials-plan",
    command: "npm run trial:proofs",
    endpoint: "/api/proof-trials",
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server, reads the public-safe proof-trials catalog, runs deterministic local trial assertions through public-safe data only, writes a local receipt under var/, and does not use credentials, private documents, production writes, submissions, messages, payments, deployments, approvals, calendar writes, portal automation, or third-party mutation.",
  };
}

function buildProofTrials({ projects, claims, artifactCatalog, routeManifest = {}, packageManifest = {}, receipts = [] }) {
  const trials = projects.map((project) => buildProjectTrial(project, claims, artifactCatalog));
  const sandboxFirewall = proofTrialSandboxFirewall(trials);
  const checks = proofTrialChecks({ trials, sandboxFirewall, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;
  return {
    generatedAt: new Date().toISOString(),
    mode: "safe-live-proof-trials",
    sourceBoundary:
      "Proof trials are deterministic local replays over public-safe API, artifact, and terminal surfaces. They do not use credentials, mutate production, submit forms, or impersonate users.",
    executionBoundary:
      "A proof trial is a read-only sandbox descriptor plus deterministic assertions. It is not a production demo runner and must not be upgraded to one without a separate approval gate.",
    guardrails: trialGuardrails(),
    plan: proofTrialsPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      totalTrials: trials.length,
      deterministicReplays: trials.filter((trial) => trial.mode === "deterministic-local-replay").length,
      approvalGatedTrials: trials.filter((trial) => trial.sandbox.approvalGateRequired).length,
      writeEnabledTrials: trials.filter((trial) => trial.sandbox.allowedWrites !== "none").length,
      sandboxLocks: sandboxFirewall.summary.locks,
      readOnlySandboxLocks: sandboxFirewall.summary.readOnlyLocks,
      blockedExternalActionSlots: sandboxFirewall.summary.blockedExternalActionSlots,
      credentialsEnabled: sandboxFirewall.summary.credentialsEnabled,
      externalWritesEnabled: sandboxFirewall.summary.externalWritesEnabled,
      latestReceiptId: latestReceipt?.id || null,
    },
    sandboxFirewall,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    trials,
  };
}

function buildProofTrialsIndex(catalog) {
  const trials = selectProofTrialIndexPreview(catalog.trials).map(compactProofTrial);
  return {
    mode: catalog.mode,
    detail: "proof-trial-index",
    compact: true,
    fullDetailEndpoint: "/api/proof-trials/:slug?detail=full",
    fullCatalogEndpoint: "/api/proof-trials?detail=full",
    trialPayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
      detailEndpointTemplate: "/api/proof-trials/:slug",
      trialPreviewLimit: PROOF_TRIAL_INDEX_PREVIEW_LIMIT,
      trialsReturned: trials.length,
      totalTrials: catalog.trials.length,
    },
    executionBoundaryAvailable: Boolean(catalog.executionBoundary),
    guardrailCount: (catalog.guardrails || []).length,
    summary: summarizeProofTrialsIndexSummary(catalog.summary),
    sandboxFirewall: compactSandboxFirewall(catalog.sandboxFirewall),
    checks: selectProofTrialCheckPreview(catalog.checks).map(compactProofTrialCheck),
    trials,
  };
}

function buildProofTrialHistory({ receipts = [], limit = 5, detail = "summary" } = {}) {
  const boundedLimit = boundedReceiptLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "safe-live-proof-trials-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail ? { receiptStore: RECEIPT_RELATIVE_PATH } : {}),
    fullDetailEndpoint: "/api/proof-trials/history?detail=full",
    historyPayloadPolicy: proofTrialHistoryPayloadPolicy({
      fullDetail,
      boundedLimit,
      returned: limited.length,
      totalAvailable: receipts.length,
    }),
    summary: summarizeProofTrialHistory({ limited, latest, totalAvailable: receipts.length, boundedLimit, fullDetail }),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeProofTrialReceipt(receipt, { latest: index === 0 })),
  };
}

function proofTrialHistoryPayloadPolicy({ fullDetail, boundedLimit, returned, totalAvailable }) {
  if (fullDetail) {
    return {
      fullDetail: true,
      defaultLimit: 5,
      requestedLimit: boundedLimit,
      receiptsReturned: returned,
      totalAvailable,
      latestReceiptPreview: "full-receipt",
      olderReceiptPreview: "full-receipt",
    };
  }
  return {
    fullDetail: false,
    receiptsReturned: returned,
    totalAvailable,
    fullDetailAvailable: true,
    olderReceiptsTrendOnly: true,
  };
}

function summarizeProofTrialHistory({ limited, latest, totalAvailable, boundedLimit, fullDetail }) {
  return {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: latest?.id || null,
    ...(fullDetail ? { latestCheckedAt: latest?.checkedAt || null } : {}),
    latestScore: latest?.summary?.score || 0,
    latestPassing: latest?.summary?.passing || 0,
    latestChecks: latest?.summary?.checks || 0,
    latestTrials: latest?.summary?.totalTrials || 0,
    latestReadOnlyLocks: latest?.sandboxFirewall?.readOnlyLocks || 0,
    ...(fullDetail ? { latestSandboxLocks: latest?.sandboxFirewall?.locks || 0 } : {}),
  };
}

function summarizeProofTrialReceipt(receipt, { latest = false } = {}) {
  const checks = receipt.checks || [];
  const sampleTrials = receipt.sampleTrials || [];
  const summary = {
    id: receipt.id,
    score: receipt.summary?.score || 0,
    checks: receipt.summary?.checks || checks.length,
    passing: receipt.summary?.passing || checks.filter((check) => check.passed).length,
    failing: receipt.summary?.failing || checks.filter((check) => !check.passed).length,
    totalTrials: receipt.summary?.totalTrials || 0,
    readOnlyLocks: receipt.sandboxFirewall?.readOnlyLocks || 0,
    sampleTrials: sampleTrials.length,
    sampleTrialsPassed: sampleTrials.filter((trial) => trial.passed).length,
  };
  if (!latest) {
    return {
      id: summary.id,
      score: summary.score,
      checks: summary.checks,
      passing: summary.passing,
      failing: summary.failing,
      totalTrials: summary.totalTrials,
      trendOnly: true,
    };
  }
  return {
    ...summary,
    checkPreview: selectProofTrialCheckPreview(checks).map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
      severity: check.severity || "medium",
    })),
    sampleTrialPreview: sampleTrials.slice(0, 2).map((trial) => ({
      slug: trial.slug,
      passed: Boolean(trial.passed),
      checks: trial.checks || 0,
    })),
  };
}

function compactProofTrial(trial) {
  const artifacts = trial.artifacts || [];
  const approvalGatedArtifacts = artifacts.filter((artifact) => artifact.approvalRequired);
  return {
    slug: trial.slug,
    detailAvailable: true,
    counts: {
      surfaces: trial.publicSurface.length,
      steps: trial.steps.length,
      assertions: trial.assertions.length,
      artifacts: artifacts.length,
    },
    sandbox: {
      approvalGateRequired: trial.sandbox.approvalGateRequired,
    },
  };
}

function selectProofTrialIndexPreview(trials = []) {
  const selected = [];
  const required = trials.find((trial) => trial.slug === "qagent");
  if (required) selected.push(required);
  for (const trial of trials) {
    if (selected.length >= PROOF_TRIAL_INDEX_PREVIEW_LIMIT) break;
    if (!selected.includes(trial)) selected.push(trial);
  }
  return selected.slice(0, PROOF_TRIAL_INDEX_PREVIEW_LIMIT);
}

function boundedReceiptLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.min(Math.trunc(numeric), maxReceipts));
}

function compactProofTrialCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
  };
}

function compactSandboxFirewall(firewall) {
  return {
    mode: firewall.mode,
    credentialCapability: firewall.credentialCapability,
    externalWriteCapability: firewall.externalWriteCapability,
    blockedExternalActionCount: (firewall.blockedExternalActions || []).length,
    lockSummary: {
      locks: firewall.summary?.locks || 0,
      readOnlyLocks: firewall.summary?.readOnlyLocks || 0,
      credentialsForbidden: (firewall.locks || []).every((lock) => lock.credentials === "forbidden"),
      externalWritesDisabled: (firewall.locks || []).every((lock) => lock.externalWrite === false),
    },
  };
}

function summarizeProofTrialsIndexSummary(summary = {}) {
  return {
    score: summary.score || 0,
    checks: summary.checks || 0,
    totalTrials: summary.totalTrials || 0,
    writeEnabledTrials: summary.writeEnabledTrials || 0,
    sandboxLocks: summary.sandboxLocks || 0,
    readOnlySandboxLocks: summary.readOnlySandboxLocks || 0,
    credentialsEnabled: summary.credentialsEnabled === true,
    externalWritesEnabled: summary.externalWritesEnabled === true,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function selectProofTrialCheckPreview(checks = []) {
  const required = new Set(["public-route-manifest", "package-script", "blocked-external-actions"]);
  const selected = checks.filter((check) => !check.passed || required.has(check.id));
  return selected.length ? selected : checks.slice(0, 3);
}

function summarizeProofTrialsPlan(plan = {}) {
  return {
    endpoint: plan.endpoint,
    commandAvailable: Boolean(plan.command),
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
  };
}

function runProofTrial({ slug, projects, claims, artifactCatalog }) {
  const project = projects.find((item) => item.slug === slug);
  if (!project) return null;
  const trial = buildProjectTrial(project, claims, artifactCatalog);
  const projectClaims = claims.filter((claim) => claim.relatedProject === project.slug);
  const projectArtifacts = (artifactCatalog.artifacts || []).filter((artifact) => artifact.project === project.slug);
  const approvalGatedArtifacts = projectArtifacts.filter((artifact) => artifact.approvalRequired);
  const checks = [
    {
      id: "evidence-packet",
      passed: projectClaims.length >= 4,
      detail: `${projectClaims.length} claims found for ${project.title}.`,
    },
    {
      id: "generated-preview",
      passed: projectArtifacts.some((artifact) => artifact.artifactType === "generated-preview"),
      detail: `/api/og/${project.slug}.svg`,
    },
    {
      id: "case-study-replay",
      passed: projectArtifacts.some((artifact) => artifact.artifactType === "api-replay"),
      detail: `/api/case-study/${project.slug}`,
    },
    {
      id: "terminal-replay",
      passed: projectArtifacts.some((artifact) => artifact.artifactType === "terminal-replay"),
      detail: `evidence ${project.slug}`,
    },
    {
      id: "privacy-guardrail",
      passed: approvalGatedArtifacts.every((artifact) => artifact.publicProjection === "public-safe-summary"),
      detail: `${approvalGatedArtifacts.length} approval-gated artifact(s) remain summary-only.`,
    },
    {
      id: "sandbox-writes-disabled",
      passed: trial.sandbox.allowedWrites === "none" && trial.steps.every((step) => step.sideEffect === "read-only"),
      detail: "All trial steps are read-only descriptors with no production mutation.",
    },
    {
      id: "credentials-forbidden",
      passed: trial.sandbox.credentials === "forbidden" && trial.guardrails.some((guardrail) => /credentials/i.test(guardrail)),
      detail: "The trial explicitly forbids credentials, tokens, cookies, and private documents.",
    },
  ];

  return {
    ...trial,
    ranAt: new Date().toISOString(),
    result: {
      passed: checks.every((check) => check.passed),
      checks,
    },
  };
}

function buildProofTrialDetailResponse(trial, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = `/api/proof-trials/${trial.slug}?detail=full`;
  if (fullDetail) {
    return {
      ...trial,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
    };
  }

  const resultChecks = trial.result?.checks || [];
  const artifacts = trial.artifacts || [];
  return {
    slug: trial.slug,
    title: trial.title,
    mode: trial.mode,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    result: {
      passed: Boolean(trial.result?.passed),
      checks: resultChecks.length,
      passing: resultChecks.filter((check) => check.passed).length,
      checkPreview: resultChecks.map(summarizeProofTrialResultCheck),
    },
    counts: {
      publicSurfaces: (trial.publicSurface || []).length,
      guardrails: (trial.guardrails || []).length,
      steps: (trial.steps || []).length,
      assertions: (trial.assertions || []).length,
      artifacts: artifacts.length,
      approvalGatedArtifacts: artifacts.filter((artifact) => artifact.approvalRequired).length,
    },
    sandbox: {
      approvalGateRequired: Boolean(trial.sandbox?.approvalGateRequired),
      credentialsForbidden: trial.sandbox?.credentials === "forbidden",
      writesDisabled: trial.sandbox?.allowedWrites === "none",
    },
    proofTrialPayloadPolicy: {
      fullDetail: false,
      fullDetailEndpoint,
      defaultDetail: "result, counts, sandbox summary",
      omittedFromDefault: ["publicSurface", "guardrails", "steps", "assertions", "artifacts", "sandbox prose", "check detail prose"],
    },
  };
}

function summarizeProofTrialResultCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function buildProjectTrial(project, claims, artifactCatalog) {
  const projectClaims = claims.filter((claim) => claim.relatedProject === project.slug);
  const projectArtifacts = (artifactCatalog.artifacts || []).filter((artifact) => artifact.project === project.slug);
  const approvalGateRequired = projectArtifacts.some((artifact) => artifact.approvalRequired);
  const publicSurface = [
    `/api/evidence/${project.slug}`,
    `/api/case-study/${project.slug}`,
    `/api/og/${project.slug}.svg`,
    `evidence ${project.slug}`,
  ];
  return {
    id: `${project.slug}.local-evidence-replay`,
    slug: project.slug,
    title: `${project.title} local evidence replay`,
    mode: "deterministic-local-replay",
    riskLevel: project.visibility.toLowerCase().includes("private") ? "public-safe-private" : "public",
    publicSurface,
    sandbox: {
      runner: "local-http-and-terminal-replay",
      network: "loopback-http-plus-public-safe-linked-records",
      credentials: "forbidden",
      allowedWrites: "none",
      approvalGateRequired,
      approvalGate: approvalGateRequired
        ? "Private/public-safe-private artifacts stay summary-only until the local approval workflow records an explicit approval."
        : "No private artifact approval gate is required by the current public-safe projection.",
    },
    guardrails: trialGuardrails(),
    steps: [
      {
        id: "evidence-api",
        action: "Fetch public-safe evidence packet",
        method: "GET",
        target: `/api/evidence/${project.slug}`,
        sideEffect: "read-only",
        expected: `${projectClaims.length} claim(s), no private material exposure.`,
      },
      {
        id: "case-study-api",
        action: "Replay generated case-study packet",
        method: "GET",
        target: `/api/case-study/${project.slug}`,
        sideEffect: "read-only",
        expected: "Evidence trail and proof gaps are generated from source records.",
      },
      {
        id: "artifact-preview",
        action: "Render generated SVG preview",
        method: "GET",
        target: `/api/og/${project.slug}.svg`,
        sideEffect: "read-only",
        expected: "Public-safe generated visual artifact renders without external assets.",
      },
      {
        id: "terminal-evidence",
        action: "Run terminal evidence replay",
        method: "POST",
        target: `evidence ${project.slug}`,
        sideEffect: "read-only",
        expected: "Terminal output summarizes links, proof items, and confidence.",
      },
      {
        id: "privacy-approval-gate",
        action: "Assert public-safe projection boundary",
        method: "LOCAL_ASSERTION",
        target: "artifact approval metadata",
        sideEffect: "read-only",
        expected: approvalGateRequired
          ? "Approval-gated artifacts remain summary-only until a local approval record exists."
          : "No approval-gated artifacts are present for this project.",
      },
    ],
    assertions: [
      { id: "minimum-claims", expectation: "At least four evidence claims exist for the project." },
      { id: "preview-available", expectation: "A generated SVG preview artifact exists." },
      { id: "case-study-available", expectation: "A case-study API replay artifact exists." },
      { id: "terminal-replay-available", expectation: "A terminal evidence replay artifact exists." },
      { id: "no-uncontrolled-writes", expectation: "Every step is read-only and allowedWrites is none." },
      { id: "no-credential-use", expectation: "The sandbox forbids credentials, tokens, cookies, and private documents." },
    ],
    artifacts: projectArtifacts.map((artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      url: artifact.url,
      command: artifact.command,
      approvalRequired: artifact.approvalRequired,
      publicProjection: artifact.publicProjection,
    })),
  };
}

function trialGuardrails() {
  return [
    "No credentials, tokens, cookies, or private documents are loaded.",
    "No production writes, submissions, messages, payments, deployments, or approvals are performed.",
    "Private/public-safe-private artifacts remain summary-only unless a local approval record exists.",
    "The only permitted execution surfaces are local HTTP GET replays and read-only terminal output generation.",
    "Trial assertions are deterministic and derived from local project, claim, and artifact records.",
  ];
}

function appendProofTrialReceipt(root, receipt) {
  const receipts = readProofTrialReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readProofTrialReceipts(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function proofTrialSandboxFirewall(trials) {
  const locks = trials.map((trial) => proofTrialSandboxLock(trial));
  const blockedActions = blockedExternalActions();
  return {
    mode: "read-only-proof-trial-sandbox-firewall",
    localOnly: true,
    deterministicOnly: true,
    credentialCapability: false,
    externalWriteCapability: false,
    productionMutationCapability: false,
    blockedExternalActions: blockedActions,
    summary: {
      locks: locks.length,
      readOnlyLocks: locks.filter((lock) => lock.readOnly && lock.credentials === "forbidden" && lock.externalWrite === false).length,
      blockedExternalActionSlots: locks.length * blockedActions.length,
      credentialsEnabled: false,
      externalWritesEnabled: false,
      productionMutationsEnabled: false,
    },
    policy:
      "Proof trials are deterministic read-only local replays. They cannot use credentials, load private documents, perform production writes, send messages, submit forms, pay, deploy, approve publication, create calendar events, open portals, or mutate third-party systems.",
    locks,
    verificationCommand: "npm run trial:proofs",
  };
}

function proofTrialSandboxLock(trial) {
  return {
    id: `proof-trial-sandbox-lock.${trial.slug}`,
    trialId: trial.id,
    slug: trial.slug,
    readOnly: true,
    deterministicOnly: true,
    credentials: "forbidden",
    externalWrite: false,
    allowedWrites: "none",
    networkBoundary: trial.sandbox.network,
    blockedActions: blockedExternalActions(),
    replacementLocalAction: `Replay ${trial.slug} only through public-safe local assertions; any real demo run needs a separate manual approval gate.`,
    localVerificationCommand: `npm run trial:proofs # or inspect /api/proof-trials/${trial.slug}`,
    sourceTrace: ["safe-live-proof-trials", trial.id, trial.slug],
    status: "read-only-deterministic-replay",
  };
}

function proofTrialChecks({ trials, sandboxFirewall, routeManifest, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || null;
  const scripts = packageManifest.scripts || null;
  const requiredBlockedActions = ["use-credentials", "load-private-documents", "submit-application", "send-email", "deploy-production", "mutate-third-party-system"];
  const checks = [
    check("trial-depth", trials.length > 0, "medium", `${trials.length} proof trial(s).`, "Keep a proof trial descriptor for each modeled project."),
    check("deterministic-replays", trials.every((trial) => trial.mode === "deterministic-local-replay"), "high", `${trials.filter((trial) => trial.mode === "deterministic-local-replay").length}/${trials.length} deterministic replay(s).`, "Keep proof trials deterministic until a separate approved runner exists."),
    check("writes-disabled", trials.every((trial) => trial.sandbox.allowedWrites === "none" && trial.steps.every((step) => step.sideEffect === "read-only")), "high", "All trial steps are read-only descriptors.", "Keep proof-trial sandboxes write-disabled."),
    check("credentials-forbidden", trials.every((trial) => trial.sandbox.credentials === "forbidden" && trial.guardrails.some((guardrail) => /credentials/i.test(guardrail))), "high", `${trials.length} trial credential guardrail(s).`, "Keep credentials, tokens, cookies, and private documents forbidden."),
    check("privacy-approval-guardrails", trials.every((trial) => trial.steps.some((step) => step.id === "privacy-approval-gate")), "high", `${trials.length} trial privacy approval step(s).`, "Keep public/private projection checks inside every proof trial."),
    check("sandbox-lock-depth", sandboxFirewall.summary.locks === trials.length, "high", `${sandboxFirewall.summary.locks}/${trials.length} sandbox lock(s).`, "Attach one read-only sandbox lock to every proof trial."),
    check(
      "sandbox-lock-read-only",
      sandboxFirewall.credentialCapability === false &&
        sandboxFirewall.externalWriteCapability === false &&
        sandboxFirewall.productionMutationCapability === false &&
        sandboxFirewall.summary.readOnlyLocks === sandboxFirewall.summary.locks,
      "high",
      `${sandboxFirewall.summary.readOnlyLocks}/${sandboxFirewall.summary.locks} read-only lock(s).`,
      "Keep every proof-trial sandbox lock credential-free, read-only, and mutation-disabled.",
    ),
    check(
      "blocked-external-actions",
      requiredBlockedActions.every((action) => sandboxFirewall.blockedExternalActions.includes(action)),
      "high",
      `${sandboxFirewall.summary.blockedExternalActionSlots} blocked external action slot(s).`,
      "Block credentials, private documents, submissions, outreach, deploys, and third-party mutation from proof trials.",
    ),
  ];
  if (publicRoutes) {
    checks.push(
      check(
        "public-route-manifest",
        ["/api/proof-trials", "/api/proof-trials/:slug", "/api/proof-trials/plan", "/api/proof-trials/history"].every((route) => publicRoutes.includes(route)),
        "high",
        `${["/api/proof-trials", "/api/proof-trials/:slug", "/api/proof-trials/plan", "/api/proof-trials/history"].filter((route) => publicRoutes.includes(route)).length}/4 proof-trial public route(s).`,
        "Declare proof-trial catalog, selected trial, plan, and history routes in the public route manifest.",
      ),
    );
  }
  if (scripts) {
    checks.push(check("package-script", Boolean(scripts["trial:proofs"]), "high", `trial:proofs=${Boolean(scripts["trial:proofs"])}`, "Add the trial:proofs package script."));
  }
  return checks;
}

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: id === "package-script" ? "npm run trial:proofs" : "npm run trial:proofs && npm run check",
  };
}

function blockedExternalActions() {
  return [
    "use-credentials",
    "load-private-documents",
    "send-email",
    "send-dm",
    "submit-application",
    "schedule-event",
    "create-calendar-event",
    "create-reminder",
    "approve-publication",
    "deploy-production",
    "spend-money",
    "sync-task",
    "auto-open-portal",
    "mutate-third-party-system",
    "mark-external-outcome-real",
  ];
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
  appendProofTrialReceipt,
  buildProofTrialHistory,
  buildProofTrialDetailResponse,
  buildProofTrials,
  buildProofTrialsIndex,
  proofTrialsPlan,
  readProofTrialReceipts,
  runProofTrial,
};
