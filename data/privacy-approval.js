const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const STORE_RELATIVE_PATH = path.join("var", "private-approval-store.json");
const RECEIPT_RELATIVE_PATH = path.join("var", "private-approval-receipts.json");
const allowedDecisions = new Set(["approved", "rejected", "withheld"]);
const maxReceipts = 50;

function privacyApprovalPlan() {
  return {
    mode: "local-private-approval-plan",
    command: "npm run approve:private",
    endpoint: "/api/private/approvals",
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local approvals endpoint, writes a local receipt under var/, and does not publish private material, send messages, submit forms, create calendar events, deploy, pay, sync tasks, open portals, or mutate third-party systems.",
  };
}

function defaultPrivacyApprovalStore() {
  return {
    version: 1,
    records: {},
    auditLog: [],
  };
}

function privacyApprovalStorePath(root) {
  return path.join(root, STORE_RELATIVE_PATH);
}

function readPrivacyApprovalStore(root) {
  const storePath = privacyApprovalStorePath(root);
  if (!existsSync(storePath)) {
    return { store: defaultPrivacyApprovalStore(), exists: false, relativePath: STORE_RELATIVE_PATH };
  }
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return {
      store: normalizeStore(parsed),
      exists: true,
      relativePath: STORE_RELATIVE_PATH,
    };
  } catch {
    return { store: defaultPrivacyApprovalStore(), exists: true, relativePath: STORE_RELATIVE_PATH, corrupt: true };
  }
}

function ensurePrivacyApprovalStore(root) {
  const current = readPrivacyApprovalStore(root);
  if (!current.exists || current.corrupt) {
    writePrivacyApprovalStore(root, current.store);
    return { ...current, exists: true, corrupt: false };
  }
  return current;
}

function writePrivacyApprovalStore(root, store) {
  const storePath = privacyApprovalStorePath(root);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(normalizeStore(store), null, 2)}\n`);
}

function buildPrivacyApprovalAudit({ claims, artifactCatalog, storeInfo, routeManifest = {}, packageManifest = {}, receipts = [] }) {
  const store = normalizeStore(storeInfo?.store || defaultPrivacyApprovalStore());
  const candidates = approvalCandidates({ claims, artifactCatalog }).map((candidate) => {
    const record = store.records[candidate.id];
    const decision = record?.decision || "pending";
    return {
      ...candidate,
      decision,
      decidedAt: record?.decidedAt || null,
      reviewer: record?.reviewer || null,
      publicProjection: decision === "approved" ? "approved-public-projection" : "withheld-private-material",
    };
  });
  const approvalDecisionGates = privacyApprovalDecisionGates(candidates);
  const checks = privacyApprovalChecks({ candidates, approvalDecisionGates, storeInfo, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;
  const counts = {
    score,
    band: bandFor(score),
    checks: checks.length,
    passing: checks.length - failing.length,
    failing: failing.length,
    candidates: candidates.length,
    pending: candidates.filter((candidate) => candidate.decision === "pending").length,
    approved: candidates.filter((candidate) => candidate.decision === "approved").length,
    rejected: candidates.filter((candidate) => candidate.decision === "rejected").length,
    withheld: candidates.filter((candidate) => candidate.decision === "withheld").length,
    localRecords: Object.keys(store.records).length,
    approvalDecisionGates: approvalDecisionGates.summary.gates,
    manualOnlyApprovalDecisionGates: approvalDecisionGates.summary.manualOnlyGates,
    blockedExternalActionSlots: approvalDecisionGates.summary.blockedExternalActionSlots,
    auditLogEntries: store.auditLog.length,
    latestReceiptId: latestReceipt?.id || null,
  };

  return {
    mode: "local-privacy-approval-audit",
    generatedAt: new Date().toISOString(),
    privacyBoundary:
      "Private claims and artifacts require a local approval record before stronger public projection. Pending items stay public-safe summaries or withheld private material.",
    storage: {
      relativePath: storeInfo?.relativePath || STORE_RELATIVE_PATH,
      exists: storeInfo?.exists === true,
      localOnly: true,
      publicRoutesExposeStore: false,
      corrupt: storeInfo?.corrupt === true,
    },
    counts,
    publicProjectionGate: {
      rule: "Only public items and locally approved private items can be promoted beyond public-safe summaries.",
      defaultPrivateDecision: "pending",
      approvedProjection: "approved-public-projection",
      unapprovedProjection: "withheld-private-material",
    },
    decisionPolicy: "manual-only local approval records; external writes and automatic publication are forbidden",
    plan: privacyApprovalPlan(),
    approvalQueue: candidates
      .filter((candidate) => candidate.decision === "pending")
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 24),
    decisions: candidates.filter((candidate) => candidate.decision !== "pending"),
    approvalDecisionGates,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    recentAuditLog: store.auditLog.slice(-20).reverse(),
  };
}

function recordPrivacyDecision({
  root,
  id,
  decision,
  reviewer = "local-private",
  note = "",
  claims,
  artifactCatalog,
  routeManifest = {},
  packageManifest = {},
  receipts = [],
}) {
  if (!allowedDecisions.has(decision)) {
    const error = new Error("Invalid privacy decision");
    error.statusCode = 400;
    throw error;
  }
  const storeInfo = ensurePrivacyApprovalStore(root);
  const candidates = approvalCandidates({ claims, artifactCatalog });
  const candidate = candidates.find((item) => item.id === id);
  if (!candidate) {
    const error = new Error("Unknown privacy approval candidate");
    error.statusCode = 404;
    throw error;
  }
  const record = {
    id,
    decision,
    reviewer: sanitizeText(reviewer).slice(0, 80) || "local-private",
    note: sanitizeText(note).slice(0, 240),
    decidedAt: new Date().toISOString(),
  };
  const store = normalizeStore(storeInfo.store);
  store.records[id] = record;
  store.auditLog.push({
    at: record.decidedAt,
    id,
    itemType: candidate.itemType,
    project: candidate.project,
    decision,
    reviewer: record.reviewer,
    localOnly: true,
    externalWrite: false,
    mutationPolicy: "local-private-approval-record-only",
    blockedExternalActions: blockedExternalActions(),
  });
  writePrivacyApprovalStore(root, store);
  return buildPrivacyApprovalAudit({
    claims,
    artifactCatalog,
    storeInfo: { store, exists: true, relativePath: STORE_RELATIVE_PATH },
    routeManifest,
    packageManifest,
    receipts,
  });
}

function appendPrivacyApprovalReceipt(root, receipt) {
  const receipts = readPrivacyApprovalReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readPrivacyApprovalReceipts(root) {
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

function approvalCandidates({ claims, artifactCatalog }) {
  const privateClaims = claims
    .filter((claim) => claim.privacyLevel !== "public")
    .map((claim) => ({
      id: `claim.${claim.id}`,
      itemType: "claim",
      sourceId: claim.id,
      project: claim.relatedProject,
      label: claim.text,
      privacyLevel: claim.privacyLevel,
      evidenceStrength: claim.evidenceStrength,
      priority: Number(claim.confidenceScore || 0),
      proposedProjection: "public-safe claim summary",
      requiredApproval: "local approval required before any stronger public projection",
    }));

  const privateArtifacts = (artifactCatalog.artifacts || [])
    .filter((artifact) => artifact.approvalRequired || artifact.privacyLevel !== "public")
    .map((artifact) => ({
      id: `artifact.${artifact.id}`,
      itemType: "artifact",
      sourceId: artifact.id,
      project: artifact.project,
      label: artifact.label,
      privacyLevel: artifact.privacyLevel,
      evidenceStrength: artifact.proofStrength,
      priority: Number(artifact.confidenceScore || 0),
      proposedProjection: artifact.publicProjection || "public-safe artifact summary",
      requiredApproval: "local approval required before exposing private artifact material",
    }));

  return [...privateClaims, ...privateArtifacts];
}

function normalizeStore(value) {
  const store = value && typeof value === "object" ? value : defaultPrivacyApprovalStore();
  return {
    version: 1,
    records: store.records && typeof store.records === "object" ? store.records : {},
    auditLog: Array.isArray(store.auditLog) ? store.auditLog.slice(-200) : [],
  };
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/\/Users\/[A-Za-z0-9_.-]+/g, "[local-user]")
    .replace(/(api[_-]?key|secret|token|password)\s*[:=]\s*[^,\s]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim();
}

function privacyApprovalDecisionGates(candidates) {
  const gates = candidates.map((candidate) => privacyApprovalDecisionGate(candidate));
  const blockedActions = blockedExternalActions();
  return {
    mode: "local-private-approval-decision-gates",
    localOnly: true,
    manualOnly: true,
    externalWriteCapability: false,
    publicProjectionWriteCapability: false,
    allowedDecisions: [...allowedDecisions],
    blockedExternalActions: blockedActions,
    summary: {
      gates: gates.length,
      manualOnlyGates: gates.filter((gate) => gate.manualOnly && gate.localOnly && gate.externalWrite === false).length,
      blockedExternalActionSlots: gates.length * blockedActions.length,
      externalWritesEnabled: false,
      publicProjectionWritesEnabled: false,
      approvedProjectionCandidates: candidates.filter((candidate) => candidate.decision === "approved").length,
      withheldProjectionCandidates: candidates.filter((candidate) => candidate.publicProjection === "withheld-private-material").length,
    },
    policy:
      "Approval gates can only record local reviewer decisions. They cannot publish private material, send messages, submit applications, schedule events, deploy, pay, sync tasks, open portals, mutate third-party systems, or claim that a public projection happened.",
    gates,
    verificationCommand: "npm run approve:private",
  };
}

function privacyApprovalDecisionGate(candidate) {
  return {
    id: `privacy-approval-gate.${candidate.id}`,
    candidateId: candidate.id,
    itemType: candidate.itemType,
    sourceId: candidate.sourceId,
    project: candidate.project,
    privacyLevel: candidate.privacyLevel,
    decision: candidate.decision,
    manualOnly: true,
    localOnly: true,
    externalWrite: false,
    publicProjectionWrite: false,
    allowedDecisions: [...allowedDecisions],
    blockedActions: blockedExternalActions(),
    replacementLocalAction: `Review ${candidate.id} locally; record only approved, rejected, or withheld in the local approval store.`,
    localVerificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/approvals locally",
    sourceTrace: ["local-privacy-approval-audit", candidate.itemType, candidate.sourceId],
    status: candidate.decision === "pending" ? "pending-review-only" : "decision-recorded-local-only",
  };
}

function privacyApprovalChecks({ candidates, approvalDecisionGates, storeInfo, routeManifest, packageManifest }) {
  const privateRoutes = routeManifest.privateApiRoutes || null;
  const scripts = packageManifest.scripts || null;
  const requiredBlockedActions = ["publish-private-material", "send-email", "submit-application", "create-calendar-event", "sync-task", "mutate-third-party-system"];
  const checks = [
    check("local-store", storeInfo?.relativePath === STORE_RELATIVE_PATH && storeInfo?.store && storeInfo?.localOnly !== false, "high", storeInfo?.relativePath || "missing", "Keep privacy decisions in the local private approval store."),
    check("candidate-depth", candidates.length > 0, "medium", `${candidates.length} approval candidate(s).`, "Keep private claims and artifacts represented as approval candidates."),
    check(
      "public-projection-guard",
      candidates.every((candidate) => candidate.decision === "approved" || candidate.publicProjection === "withheld-private-material"),
      "high",
      `${candidates.filter((candidate) => candidate.publicProjection === "withheld-private-material").length}/${candidates.length} candidate(s) withheld unless approved.`,
      "Keep unapproved private material withheld from public projection.",
    ),
    check("decision-gate-depth", approvalDecisionGates.summary.gates === candidates.length, "high", `${approvalDecisionGates.summary.gates}/${candidates.length} approval decision gate(s).`, "Attach one local approval gate to every candidate."),
    check(
      "decision-gate-manual-only",
      approvalDecisionGates.externalWriteCapability === false &&
        approvalDecisionGates.publicProjectionWriteCapability === false &&
        approvalDecisionGates.summary.manualOnlyGates === approvalDecisionGates.summary.gates,
      "high",
      `${approvalDecisionGates.summary.manualOnlyGates}/${approvalDecisionGates.summary.gates} manual-only gate(s).`,
      "Keep every approval gate local-only, manual-only, and external-write disabled.",
    ),
    check(
      "blocked-external-actions",
      requiredBlockedActions.every((action) => approvalDecisionGates.blockedExternalActions.includes(action)),
      "high",
      `${approvalDecisionGates.summary.blockedExternalActionSlots} blocked external action slot(s).`,
      "Block publication, outreach, calendar, task-sync, and third-party mutations from approval gates.",
    ),
  ];
  if (privateRoutes) {
    checks.push(
      check(
        "private-route-manifest",
        ["/api/private/approvals", "/api/private/approvals/plan", "/api/private/approvals/history"].every((route) => privateRoutes.includes(route)),
        "high",
        `${["/api/private/approvals", "/api/private/approvals/plan", "/api/private/approvals/history"].filter((route) => privateRoutes.includes(route)).length}/3 approval private route(s).`,
        "Declare approval report, plan, and history routes in the private route manifest.",
      ),
    );
  }
  if (scripts) {
    checks.push(check("package-script", Boolean(scripts["approve:private"]), "high", `approve:private=${Boolean(scripts["approve:private"])}`, "Add the approve:private package script."));
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
    verificationCommand: id === "package-script" ? "npm run approve:private" : "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/approvals locally",
  };
}

function blockedExternalActions() {
  return [
    "publish-private-material",
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
  appendPrivacyApprovalReceipt,
  buildPrivacyApprovalAudit,
  defaultPrivacyApprovalStore,
  ensurePrivacyApprovalStore,
  privacyApprovalPlan,
  readPrivacyApprovalReceipts,
  readPrivacyApprovalStore,
  recordPrivacyDecision,
};
