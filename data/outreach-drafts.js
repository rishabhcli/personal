const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const STORE_RELATIVE_PATH = path.join("var", "outreach-draft-store.json");
const RECEIPT_RELATIVE_PATH = path.join("var", "outreach-draft-receipts.json");
const allowedStatuses = new Set(["draft", "reviewing", "used", "archived"]);
const maxReceipts = 50;

function outreachDraftPlan() {
  return {
    mode: "local-private-outreach-drafts-plan",
    command: "npm run outreach:private",
    endpoint: "/api/private/outreach-drafts",
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local outreach-drafts endpoint, writes a local receipt under var/, and does not send email, DMs, applications, forms, payments, submissions, calendar events, reminders, or third-party writes.",
  };
}

function buildOutreachDraftCatalog({ opportunities, packets, projects, claims, storeInfo, routeManifest = {}, packageManifest = {}, receipts = [] }) {
  const drafts = generatedDrafts({ opportunities, packets, projects, claims }).map((draft) => {
    const tracking = storeInfo.store.drafts[draft.id] || defaultTracking();
    return {
      ...draft,
      tracking,
    };
  });
  const sendPrevention = outreachSendPreventionGates(drafts);
  const checks = outreachChecks({ drafts, sendPrevention, storeInfo, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "local-private-outreach-drafts",
    privacyBoundary:
      "Drafts are local/private planning artifacts. The app never sends email, DMs, applications, payments, forms, or external submissions automatically.",
    storage: {
      relativePath: storeInfo.relativePath,
      exists: storeInfo.exists,
      localOnly: true,
      publicRoutesExposeStore: false,
    },
    sendPolicy: "draft-only; manual review required; automatic sending and submission are forbidden",
    plan: outreachDraftPlan(),
    counts: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      drafts: drafts.length,
      reviewing: drafts.filter((draft) => draft.tracking.status === "reviewing").length,
      used: drafts.filter((draft) => draft.tracking.status === "used").length,
      archived: drafts.filter((draft) => draft.tracking.status === "archived").length,
      sendPreventionGates: sendPrevention.summary.gates,
      manualOnlySendPreventionGates: sendPrevention.summary.manualOnlyGates,
      blockedExternalActionSlots: sendPrevention.summary.blockedExternalActionSlots,
      auditLogEntries: (storeInfo.store.auditLog || []).length,
      latestReceiptId: latestReceipt?.id || null,
    },
    sendPrevention,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    drafts,
    auditLog: storeInfo.store.auditLog || [],
  };
}

function readOutreachDraftStore(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) {
    return { store: defaultOutreachDraftStore(), exists: false, relativePath: STORE_RELATIVE_PATH };
  }
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return { store: normalizeStore(parsed), exists: true, relativePath: STORE_RELATIVE_PATH };
  } catch {
    return { store: defaultOutreachDraftStore(), exists: true, relativePath: STORE_RELATIVE_PATH };
  }
}

function ensureOutreachDraftStore(root) {
  const storeInfo = readOutreachDraftStore(root);
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(storeInfo.store, null, 2)}\n`);
  return { ...storeInfo, exists: true };
}

function recordOutreachDraftStatus({ root, id, status, reviewer = "local-owner", note = "", opportunities, packets, projects, claims }) {
  if (!id || !allowedStatuses.has(status)) {
    const error = new Error("Invalid outreach draft status update");
    error.statusCode = 400;
    throw error;
  }
  const storeInfo = ensureOutreachDraftStore(root);
  const catalog = buildOutreachDraftCatalog({ opportunities, packets, projects, claims, storeInfo });
  if (!catalog.drafts.some((draft) => draft.id === id)) {
    const error = new Error("Unknown outreach draft");
    error.statusCode = 404;
    throw error;
  }
  const now = new Date().toISOString();
  storeInfo.store.drafts[id] = {
    status,
    reviewer: String(reviewer || "local-owner").slice(0, 80),
    note: String(note || "").slice(0, 500),
    updatedAt: now,
  };
  storeInfo.store.auditLog.unshift({
    id: `outreach-${Date.now()}`,
    draftId: id,
    status,
    reviewer: storeInfo.store.drafts[id].reviewer,
    note: storeInfo.store.drafts[id].note,
    updatedAt: now,
    localOnly: true,
    externalWrite: false,
    mutationPolicy: "local-private-outreach-draft-status-only",
    blockedExternalActions: blockedExternalActions(),
  });
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  writeFileSync(storePath, `${JSON.stringify(storeInfo.store, null, 2)}\n`);
  return buildOutreachDraftCatalog({
    opportunities,
    packets,
    projects,
    claims,
    storeInfo: { store: storeInfo.store, exists: true, relativePath: STORE_RELATIVE_PATH },
  });
}

function appendOutreachDraftReceipt(root, receipt) {
  const receipts = readOutreachDraftReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readOutreachDraftReceipts(root) {
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

function outreachSendPreventionGates(drafts) {
  const gates = drafts.map((draft) => sendPreventionGate(draft));
  const blockedActions = blockedExternalActions();
  return {
    mode: "local-private-outreach-send-prevention-gates",
    localOnly: true,
    manualOnly: true,
    sendCapability: false,
    submitCapability: false,
    externalWriteCapability: false,
    allowedStatuses: [...allowedStatuses],
    blockedExternalActions: blockedActions,
    summary: {
      gates: gates.length,
      manualOnlyGates: gates.filter((gate) => gate.manualOnly && gate.externalWrite === false).length,
      blockedExternalActionSlots: gates.length * blockedActions.length,
      externalWritesEnabled: false,
      sendableDrafts: 0,
    },
    policy:
      "Outreach gates can only keep local draft review states. They cannot send, submit, schedule, approve, pay, sync, open portals, mutate third-party systems, or claim that outreach happened.",
    gates,
    verificationCommand: "npm run outreach:private",
  };
}

function sendPreventionGate(draft) {
  return {
    id: `outreach-gate.${draft.id}`,
    draftId: draft.id,
    opportunityId: draft.opportunityId,
    manualOnly: true,
    localOnly: true,
    externalWrite: false,
    sendAllowed: false,
    submitAllowed: false,
    allowedStatuses: [...allowedStatuses],
    blockedActions: blockedExternalActions(),
    replacementLocalAction: `Review ${draft.id} locally; any real outreach must be manually rewritten and sent outside this app.`,
    localVerificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/outreach-drafts locally",
    sourceTrace: ["local-private-outreach-drafts", draft.id, draft.opportunityId],
    status: "draft-only-unsent",
  };
}

function outreachChecks({ drafts, sendPrevention, storeInfo, routeManifest, packageManifest }) {
  const privateRoutes = routeManifest.privateApiRoutes || null;
  const scripts = packageManifest.scripts || null;
  const checks = [
    check("local-store", storeInfo.relativePath === STORE_RELATIVE_PATH && storeInfo.store && storeInfo.localOnly !== false, "high", storeInfo.relativePath, "Keep outreach draft tracking in the local var/ store."),
    check("draft-depth", drafts.length >= 3, "medium", `${drafts.length} outreach draft(s).`, "Keep generated opportunity-linked drafts available for manual review."),
    check("send-policy", drafts.every((draft) => /never send or submit automatically/i.test(draft.sendPolicy)) && sendPrevention.sendCapability === false && sendPrevention.submitCapability === false, "high", "Draft and catalog policies forbid automatic sending and submission.", "Keep outreach drafts draft-only with send and submit capability disabled."),
    check("manual-review-checklist", drafts.every((draft) => draft.manualReviewChecklist.some((item) => /Do not send|submit automatically/i.test(item))), "medium", `${drafts.length} draft checklist(s).`, "Attach manual send-prevention checklist items to every outreach draft."),
    check("send-prevention-depth", sendPrevention.summary.gates === drafts.length, "high", `${sendPrevention.summary.gates}/${drafts.length} send-prevention gate(s).`, "Attach one send-prevention gate to every outreach draft."),
    check("send-prevention-manual-only", sendPrevention.externalWriteCapability === false && sendPrevention.summary.manualOnlyGates === sendPrevention.summary.gates && sendPrevention.summary.sendableDrafts === 0, "high", `${sendPrevention.summary.manualOnlyGates}/${sendPrevention.summary.gates} manual-only gate(s); sendable=${sendPrevention.summary.sendableDrafts}.`, "Keep every outreach gate local-only, unsendable, and external-write disabled."),
    check("blocked-external-actions", ["send-email", "send-dm", "submit-application", "create-calendar-event", "auto-open-portal", "mutate-third-party-system"].every((action) => sendPrevention.blockedExternalActions.includes(action)), "high", `${sendPrevention.summary.blockedExternalActionSlots} blocked external action slot(s).`, "Block every external outreach side effect from local drafts."),
  ];
  if (privateRoutes) {
    checks.push(
      check(
        "private-route-manifest",
        ["/api/private/outreach-drafts", "/api/private/outreach-drafts/plan", "/api/private/outreach-drafts/history"].every((route) => privateRoutes.includes(route)),
        "high",
        `${["/api/private/outreach-drafts", "/api/private/outreach-drafts/plan", "/api/private/outreach-drafts/history"].filter((route) => privateRoutes.includes(route)).length}/3 outreach draft private route(s).`,
        "Declare outreach draft report, plan, and history routes in the private route manifest.",
      ),
    );
  }
  if (scripts) {
    checks.push(check("package-script", Boolean(scripts["outreach:private"]), "high", `outreach:private=${Boolean(scripts["outreach:private"])}`, "Add the outreach:private package script."));
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
    verificationCommand: id === "package-script" ? "npm run outreach:private" : "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/outreach-drafts locally",
  };
}

function generatedDrafts({ opportunities, packets, projects, claims }) {
  const projectBySlug = new Map(projects.map((project) => [project.slug, project]));
  const packetByAudience = new Map((packets.packets || []).map((packet) => [packet.id, packet]));
  return (opportunities.opportunities || []).slice(0, 6).map((opportunity) => {
    const audience = audienceForOpportunity(opportunity);
    const packet = packetByAudience.get(audience) || packetByAudience.get("recruiter");
    const proofProjects = (opportunity.suggestedProjectOrder || [])
      .map((slug) => projectBySlug.get(slug))
      .filter(Boolean)
      .slice(0, 3);
    const proofClaims = claims
      .filter((claim) => proofProjects.some((project) => project.slug === claim.relatedProject))
      .sort((left, right) => right.confidenceScore - left.confidenceScore)
      .slice(0, 4);
    return {
      id: `draft.${opportunity.id}`,
      opportunityId: opportunity.id,
      packetId: packet?.id || "recruiter",
      audience,
      label: `${opportunity.label} draft`,
      subject: `${opportunity.label}: ${proofProjects[0]?.title || "portfolio"} proof path`,
      opening: `Lead with ${proofProjects.map((project) => project.title).join(", ") || "the strongest current projects"} for ${opportunity.audience}.`,
      body: [
        opportunity.outreachAngle || opportunity.suggestedNarrative,
        proofClaims.length
          ? `Evidence to cite: ${proofClaims.map((claim) => `${claim.id} (${claim.evidenceStrength})`).join(", ")}.`
          : "Evidence to cite: no strong public-safe claim selected yet.",
        `Uncertainty to disclose: ${opportunity.risk}`,
      ].join(" "),
      proofPath: proofProjects.map((project) => ({
        slug: project.slug,
        title: project.title,
        score: project.score,
      })),
      claimsUsed: proofClaims.map((claim) => ({
        id: claim.id,
        evidenceStrength: claim.evidenceStrength,
        confidenceScore: claim.confidenceScore,
        privacyLevel: claim.privacyLevel,
      })),
      missingProof: opportunity.missingProof,
      manualReviewChecklist: [
        "Confirm all claims are public-safe.",
        "Replace generic wording with a specific recipient only outside this app.",
        "Do not send or submit automatically.",
        "Attach only approved public-safe artifacts.",
      ],
      sendPolicy: "draft-only; never send or submit automatically",
      suggestedNextAction: opportunity.nextAction,
    };
  });
}

function audienceForOpportunity(opportunity) {
  const text = `${opportunity.audience} ${opportunity.type} ${opportunity.label}`.toLowerCase();
  if (/professor|research|mentor|publication|lab/.test(text)) return "professor";
  if (/founder|startup|judge|collaborator|civic/.test(text)) return "founder";
  return "recruiter";
}

function defaultTracking() {
  return {
    status: "draft",
    reviewer: null,
    note: "",
    updatedAt: null,
  };
}

function defaultOutreachDraftStore() {
  return {
    drafts: {},
    auditLog: [],
  };
}

function normalizeStore(value) {
  return {
    drafts: value && typeof value.drafts === "object" ? value.drafts : {},
    auditLog: Array.isArray(value?.auditLog) ? value.auditLog : [],
  };
}

function blockedExternalActions() {
  return [
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
  appendOutreachDraftReceipt,
  buildOutreachDraftCatalog,
  defaultOutreachDraftStore,
  ensureOutreachDraftStore,
  outreachDraftPlan,
  readOutreachDraftReceipts,
  readOutreachDraftStore,
  recordOutreachDraftStatus,
};
