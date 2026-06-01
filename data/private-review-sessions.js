const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/private/review-sessions";
const STORE_RELATIVE_PATH = path.join("var", "private-review-session-receipts.json");
const maxReceipts = 50;

function privateReviewSessionsPlan() {
  return {
    mode: "local-private-review-sessions-plan",
    command: "npm run review:private",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local review-sessions endpoint, writes a local receipt under var/, and does not create calendar events, reminders, emails, DMs, submissions, approvals, deployments, payments, or third-party writes.",
  };
}

function buildPrivateReviewSessions({ nextActionPlan, taskTracker, outreachDrafts, privacyApprovalAudit, routeManifest = {}, packageManifest = {}, receipts = [] }) {
  const highPriorityTasks = taskTracker.tasks.filter((task) => task.priority === "high" && task.tracking.status !== "done");
  const pendingApprovals = privacyApprovalAudit.approvalQueue.filter((item) => item.decision === "pending").slice(0, 8);
  const draftQueue = outreachDrafts.drafts.filter((draft) => !["used", "archived"].includes(draft.tracking.status)).slice(0, 8);
  const sessions = [
    session({
      id: "proof-repair-sprint",
      label: "Proof repair sprint",
      durationMinutes: 35,
      goal: "Move the highest-impact evidence gaps from open to reviewed.",
      items: highPriorityTasks.slice(0, 6).map(taskItem),
      fallbackItems: nextActionPlan.actions.slice(0, 4).map(actionItem),
      verificationCommand: "npm run check && npm run verify",
    }),
    session({
      id: "privacy-approval-review",
      label: "Privacy approval review",
      durationMinutes: 25,
      goal: "Review public-safe private references without publishing or exposing source material.",
      items: pendingApprovals.map(approvalItem),
      fallbackItems: [],
      verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/approvals locally",
    }),
    session({
      id: "draft-outreach-review",
      label: "Draft outreach review",
      durationMinutes: 30,
      goal: "Review draft-only outreach without sending, submitting, emailing, or DMing anyone.",
      items: draftQueue.map(draftItem),
      fallbackItems: [],
      verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/outreach-drafts locally",
    }),
  ];
  const decisionGates = reviewDecisionGates(sessions);
  const checks = reviewSessionChecks({ sessions, decisionGates, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "local-private-review-sessions",
    privacyBoundary:
      "Review sessions are generated from local private cockpit state. They do not read calendars, inboxes, school portals, CRM systems, private documents, or external application sites.",
    schedulingPolicy:
      "No calendar events, reminders, emails, DMs, applications, submissions, or approvals are created automatically.",
    operatingPolicy:
      "Sessions can guide local review decisions only. They cannot publish, send, schedule, submit, approve, deploy, purchase, sync, contact third parties, or mark external outcomes as real.",
    plan: privateReviewSessionsPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      sessions: sessions.length,
      totalMinutes: sessions.reduce((sum, item) => sum + item.durationMinutes, 0),
      agendaItems: sessions.reduce((sum, item) => sum + item.items.length, 0),
      highPriorityTasks: highPriorityTasks.length,
      pendingApprovals: pendingApprovals.length,
      draftQueue: draftQueue.length,
      decisionGates: decisionGates.summary.gates,
      manualOnlyDecisionGates: decisionGates.summary.manualOnlyGates,
      blockedExternalActionSlots: decisionGates.summary.blockedExternalActionSlots,
      latestReceiptId: latestReceipt?.id || null,
    },
    decisionGates,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    sessions,
  };
}

function session({ id, label, durationMinutes, goal, items, fallbackItems, verificationCommand }) {
  const agendaItems = items.length ? items : fallbackItems;
  return {
    id,
    label,
    durationMinutes,
    goal,
    items: agendaItems.map((item, index) => ({
      ...item,
      order: index + 1,
      reviewPrompt: reviewPromptFor(item),
    })),
    exitCriteria: [
      "Mark each reviewed item as done, doing, archived, approved, rejected, used, or intentionally left open.",
      "Run the verification command or document why it is not applicable yet.",
      "Do not publish, send, submit, schedule, or approve anything outside the local private route.",
    ],
    verificationCommand,
  };
}

function appendPrivateReviewSessionReceipt(root, receipt) {
  const receipts = readPrivateReviewSessionReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readPrivateReviewSessionReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function reviewDecisionGates(sessions) {
  const gates = sessions.map((session) => decisionGate(session));
  const blockedActions = blockedExternalActions();
  return {
    mode: "local-private-review-decision-gates",
    localOnly: true,
    manualOnly: true,
    externalWriteCapability: false,
    allowedDecisions: ["reviewed-local-only", "deferred", "blocked", "left-open"],
    blockedExternalActions: blockedActions,
    summary: {
      gates: gates.length,
      manualOnlyGates: gates.filter((gate) => gate.manualOnly && gate.externalWrite === false).length,
      blockedExternalActionSlots: gates.length * blockedActions.length,
      externalWritesEnabled: false,
    },
    policy:
      "Decision gates convert session outcomes into local review states only. They block publishing, sending, scheduling, submitting, approving, deploying, spending, syncing, and third-party mutation.",
    gates,
    verificationCommand: "npm run review:private",
  };
}

function decisionGate(session) {
  return {
    id: `review-gate.${session.id}`,
    sessionId: session.id,
    label: session.label,
    manualOnly: true,
    localOnly: true,
    externalWrite: false,
    allowedDecisions: ["reviewed-local-only", "deferred", "blocked", "left-open"],
    blockedActions: blockedExternalActions(),
    replacementLocalAction: `Record only a local review state for ${session.id}, then run its verification command before promoting any work.`,
    localVerificationCommand: session.verificationCommand,
    exitCriteria: session.exitCriteria,
    sourceTrace: ["local-private-review-sessions", session.id],
    status: "review-only",
  };
}

function reviewSessionChecks({ sessions, decisionGates, routeManifest, packageManifest }) {
  const privateRoutes = routeManifest.privateApiRoutes || null;
  const scripts = packageManifest.scripts || null;
  const checks = [
    check("session-depth", sessions.length >= 3, "high", `${sessions.length} review session(s).`, "Keep proof, privacy, and outreach review sessions explicit."),
    check("agenda-depth", sessions.every((session) => session.items.length > 0), "medium", `${sessions.reduce((sum, session) => sum + session.items.length, 0)} agenda item(s).`, "Attach at least one local review agenda item to every session."),
    check("scheduling-disabled", sessions.every((session) => session.exitCriteria.some((item) => /publish|send|submit|schedule|approve/i.test(item))), "high", "Every session has external-action stop criteria.", "Keep review session exit criteria explicit about forbidden external actions."),
    check("verification-commands", sessions.every((session) => session.verificationCommand), "medium", `${sessions.filter((session) => session.verificationCommand).length}/${sessions.length} session(s) with verification.`, "Attach verification commands to every private review session."),
    check("decision-gate-depth", decisionGates.summary.gates === sessions.length, "high", `${decisionGates.summary.gates}/${sessions.length} decision gate(s).`, "Attach one local decision gate to every review session."),
    check("decision-gate-manual-only", decisionGates.externalWriteCapability === false && decisionGates.summary.manualOnlyGates === decisionGates.summary.gates, "high", `${decisionGates.summary.manualOnlyGates}/${decisionGates.summary.gates} manual-only gate(s).`, "Keep every review decision gate local-only and external-write disabled."),
    check("blocked-external-actions", ["create-calendar-event", "send-email", "submit-application", "approve-publication", "deploy-production", "mutate-third-party-system"].every((action) => decisionGates.blockedExternalActions.includes(action)), "high", `${decisionGates.summary.blockedExternalActionSlots} blocked external action slot(s).`, "Block every external side effect from private review sessions."),
  ];
  if (privateRoutes) {
    checks.push(
      check(
        "private-route-manifest",
        [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => privateRoutes.includes(route)),
        "high",
        `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => privateRoutes.includes(route)).length}/3 review session private route(s).`,
        "Declare review session report, plan, and history routes in the private route manifest.",
      ),
    );
  }
  if (scripts) {
    checks.push(check("package-script", Boolean(scripts["review:private"]), "high", `review:private=${Boolean(scripts["review:private"])}`, "Add the review:private package script."));
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
    verificationCommand: id === "package-script" ? "npm run review:private" : "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/review-sessions locally",
  };
}

function taskItem(task) {
  return {
    itemType: "private-task",
    id: task.id,
    priority: task.priority,
    title: task.title,
    detail: task.detail,
    status: task.tracking.status,
    source: task.source,
    suggestedAction: task.verificationCommand,
  };
}

function actionItem(action) {
  return {
    itemType: "next-action",
    id: action.id,
    priority: action.priority,
    title: action.title,
    detail: action.detail,
    status: "untracked",
    source: action.source,
    suggestedAction: action.verificationCommand,
  };
}

function approvalItem(item) {
  return {
    itemType: "privacy-approval",
    id: item.id,
    priority: item.privacyLevel === "private-reference" ? "high" : "medium",
    title: item.label,
    detail: item.publicProjection,
    status: item.decision,
    source: item.project || "profile",
    suggestedAction: "Approve only a public-safe projection or reject/keep withheld.",
  };
}

function draftItem(draft) {
  return {
    itemType: "outreach-draft",
    id: draft.id,
    priority: draft.tracking.status === "reviewing" ? "high" : "medium",
    title: draft.subject,
    detail: draft.opening,
    status: draft.tracking.status,
    source: draft.opportunityId,
    suggestedAction: draft.suggestedNextAction,
  };
}

function reviewPromptFor(item) {
  if (item.itemType === "privacy-approval") return "Can this become public-safe without exposing private source material?";
  if (item.itemType === "outreach-draft") return "Does this draft stay truthful, sourced, and manually reviewed?";
  return "Does this action repair a real evidence gap, and what command proves it?";
}

function blockedExternalActions() {
  return [
    "create-calendar-event",
    "create-reminder",
    "send-email",
    "send-dm",
    "submit-application",
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
  appendPrivateReviewSessionReceipt,
  buildPrivateReviewSessions,
  privateReviewSessionsPlan,
  readPrivateReviewSessionReceipts,
};
