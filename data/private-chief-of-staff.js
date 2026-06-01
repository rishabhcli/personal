const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/private/chief-of-staff";
const STORE_RELATIVE_PATH = path.join("var", "private-chief-of-staff-receipts.json");
const maxReceipts = 50;

function privateChiefOfStaffPlan() {
  return {
    mode: "local-private-chief-of-staff-readiness-plan",
    command: "npm run chief:private",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local chief-of-staff readiness endpoint, writes a local receipt under var/, and does not read inboxes, calendars, private documents, credentials, portals, send messages, schedule events, submit applications, approve publication, deploy, spend money, or mutate external systems.",
  };
}

function buildPrivateChiefOfStaffReadiness({
  cockpit,
  nextActionPlan,
  taskTracker,
  reviewSessions,
  briefingDrafts,
  privacyApprovalAudit,
  outreachDrafts,
  routeManifest,
  packageManifest = {},
  receipts = [],
}) {
  const lanes = chiefLanes({ nextActionPlan, taskTracker, reviewSessions, briefingDrafts, privacyApprovalAudit, outreachDrafts });
  const reviewBoard = chiefReviewBoard({ lanes, taskTracker, reviewSessions, briefingDrafts, privacyApprovalAudit, outreachDrafts });
  const scheduleHandOff = chiefScheduleHandOff({ lanes, reviewBoard });
  const checks = readinessChecks({
    cockpit,
    nextActionPlan,
    taskTracker,
    reviewSessions,
    briefingDrafts,
    privacyApprovalAudit,
    outreachDrafts,
    routeManifest,
    packageManifest,
    reviewBoard,
    scheduleHandOff,
  });
  const score = weightedScore(checks);
  const failing = checks.filter((check) => !check.passed);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "local-private-chief-of-staff-readiness",
    privacyBoundary:
      "This readiness report is gated for localhost/private cockpit use. It derives from public-safe metadata and local-only planning stores; it does not read inboxes, calendars, private documents, portals, credentials, or external systems.",
    operatingPolicy:
      "The chief-of-staff surface can plan, review, and track local work only. It must not send messages, schedule events, submit applications, approve publication, deploy production, purchase anything, or mutate third-party systems.",
    plan: privateChiefOfStaffPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      lanes: lanes.length,
      actions: nextActionPlan.actions.length,
      tasks: taskTracker.tasks.length,
      reviewSessions: reviewSessions.sessions.length,
      briefingDrafts: briefingDrafts.drafts.length,
      pendingApprovals: privacyApprovalAudit.counts.pending,
      outreachDrafts: outreachDrafts.drafts.length,
      reviewBoardItems: reviewBoard.items.length,
      manualReviewGates: reviewBoard.items.filter((item) => item.manualOnly && item.externalWrite === false).length,
      scheduleHandOffItems: scheduleHandOff.items.length,
      scheduleHandOffBlockedExternalActions: scheduleHandOff.summary.blockedExternalActionSlots,
      externalWritesEnabled: false,
      reviewRequired: true,
      routeCovered: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => (routeManifest.privateApiRoutes || []).includes(route)),
      latestReceiptId: latestReceipt?.id || null,
    },
    checks,
    lanes,
    reviewBoard,
    scheduleHandOff,
    today: dailyOperatingPlan({ lanes, reviewSessions, briefingDrafts, reviewBoard }),
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nextAction: failing[0]?.repairAction || lanes[0]?.nextAction || "Review the top private chief-of-staff lane locally, then run the attached verification command.",
    verificationCommand: "npm run chief:private && npm run check && npm run verify",
  };
}

function chiefScheduleHandOff({ lanes, reviewBoard }) {
  const items = lanes.map((lane, index) => {
    const reviewItem = reviewBoard.items.find((item) => item.laneId === lane.id);
    return {
      id: `schedule-handoff.${lane.id}`,
      rank: index + 1,
      laneId: lane.id,
      label: lane.label,
      priority: reviewItem?.priority || (lane.score < 70 ? "high" : "medium"),
      objective: lane.nextAction,
      recommendedWindow: handoffWindowFor(index, lane),
      durationMinutes: lane.id === "proof-repair" ? 35 : 25,
      reviewItemId: reviewItem?.id || null,
      manualOnly: true,
      calendarWrite: false,
      reminderWrite: false,
      externalWrite: false,
      requiresHumanStart: true,
      blockedExternalActions: [
        "create-calendar-event",
        "create-reminder",
        "send-email",
        "send-dm",
        "submit-application",
        "approve-publication",
        "deploy-production",
        "spend-money",
      ],
      sourceTrace: ["local-private-chief-of-staff-readiness", lane.id, reviewItem?.id].filter(Boolean),
      verificationCommand: lane.verificationCommand,
    };
  });

  return {
    mode: "local-private-chief-schedule-handoff",
    privacyBoundary:
      "This handoff gives the private scheduler lane-level instructions only. It does not create calendar events, reminders, messages, submissions, approvals, deployments, payments, or external writes.",
    summary: {
      items: items.length,
      manualOnly: items.filter((item) => item.manualOnly).length,
      calendarWritesEnabled: false,
      reminderWritesEnabled: false,
      externalWritesEnabled: false,
      blockedExternalActionSlots: items.reduce((sum, item) => sum + item.blockedExternalActions.length, 0),
    },
    items,
  };
}

function appendPrivateChiefOfStaffReceipt(root, receipt) {
  const receipts = readPrivateChiefOfStaffReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readPrivateChiefOfStaffReceipts(root) {
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

function chiefLanes({ nextActionPlan, taskTracker, reviewSessions, briefingDrafts, privacyApprovalAudit, outreachDrafts }) {
  return [
    lane({
      id: "proof-repair",
      label: "Proof repair",
      score: laneScore([
        percent(nextActionPlan.actions.filter((action) => action.workstream === "evidence-maintenance" || action.workstream === "claim-ledger").length, 8),
        percent(taskTracker.tasks.filter((task) => task.priority === "high").length, 5),
        reviewSessions.sessions.some((session) => session.id === "proof-repair-sprint") ? 100 : 0,
      ]),
      queueCount: nextActionPlan.actions.filter((action) => action.priority === "high").length,
      nextAction: nextActionPlan.actions[0]?.detail || "Review the highest-ranked proof repair action.",
      verificationCommand: nextActionPlan.actions[0]?.verificationCommand || "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/next-actions locally",
    }),
    lane({
      id: "privacy-approval",
      label: "Privacy approval",
      score: laneScore([
        privacyApprovalAudit.counts.candidates ? 100 : 0,
        reviewSessions.sessions.some((session) => session.id === "privacy-approval-review") ? 100 : 0,
        privacyApprovalAudit.storage.localOnly && privacyApprovalAudit.storage.publicRoutesExposeStore === false ? 100 : 0,
      ]),
      queueCount: privacyApprovalAudit.counts.pending,
      nextAction: privacyApprovalAudit.approvalQueue[0]?.requiredApproval || "Keep private references withheld until review.",
      verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/approvals locally",
    }),
    lane({
      id: "review-sessions",
      label: "Review sessions",
      score: laneScore([
        percent(reviewSessions.sessions.length, 3),
        reviewSessions.schedulingPolicy.includes("No calendar events") ? 100 : 0,
        percent(reviewSessions.summary.totalMinutes, 90),
      ]),
      queueCount: reviewSessions.summary.agendaItems,
      nextAction: reviewSessions.sessions[0]?.goal || "Run the next local review session.",
      verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/review-sessions locally",
    }),
    lane({
      id: "briefing-drafts",
      label: "Briefing drafts",
      score: laneScore([
        percent(briefingDrafts.drafts.length, 3),
        briefingDrafts.summary.externalWritesEnabled === false ? 100 : 0,
        briefingDrafts.summary.reviewRequired === true ? 100 : 0,
      ]),
      queueCount: briefingDrafts.summary.totalAgendaItems,
      nextAction: briefingDrafts.drafts[0]?.objective || "Review the top chief-of-staff brief.",
      verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/briefing-drafts locally",
    }),
    lane({
      id: "outreach-draft-review",
      label: "Outreach draft review",
      score: laneScore([
        /automatic sending and submission are forbidden/i.test(outreachDrafts.sendPolicy || "") ? 100 : 0,
        percent(outreachDrafts.drafts.length, 3),
        reviewSessions.sessions.some((session) => session.id === "draft-outreach-review") ? 100 : 0,
      ]),
      queueCount: outreachDrafts.drafts.length,
      nextAction: outreachDrafts.drafts[0]?.suggestedNextAction || "Keep outreach drafts manual-only and unsent.",
      verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/outreach-drafts locally",
    }),
  ].sort((left, right) => left.score - right.score || right.queueCount - left.queueCount);
}

function chiefReviewBoard({ lanes, taskTracker, reviewSessions, briefingDrafts, privacyApprovalAudit, outreachDrafts }) {
  const items = lanes.map((lane, index) => {
    const inputs = reviewInputsForLane({ lane, taskTracker, reviewSessions, briefingDrafts, privacyApprovalAudit, outreachDrafts });
    return {
      id: `chief-review.${lane.id}`,
      rank: index + 1,
      laneId: lane.id,
      label: lane.label,
      score: lane.score,
      priority: lane.score < 70 || lane.queueCount >= 5 ? "high" : lane.queueCount ? "medium" : "low",
      objective: lane.nextAction,
      localInputs: inputs,
      inputCount: inputs.reduce((sum, input) => sum + input.count, 0),
      reviewPrompt: reviewPromptForLane(lane.id),
      allowedDecisions: ["reviewed-local-only", "deferred", "blocked", "left-open"],
      stopConditions: [
        "Needs email, DM, calendar, school portal, external account, payment, production deploy, or application submission.",
        "Needs raw private document contents instead of public-safe metadata.",
        "Cannot be verified with the local command attached to this lane.",
      ],
      manualOnly: true,
      externalWrite: false,
      publicProjectionAllowed: false,
      verificationCommand: lane.verificationCommand,
    };
  });

  return {
    mode: "local-private-chief-review-board",
    privacyBoundary:
      "The review board ranks only local/private chief-of-staff lanes and metadata. It does not expose private documents, read inboxes or calendars, or authorize external writes.",
    operatingPolicy:
      "Every item is manual-only. Decisions are local review states, not emails, calendar events, submissions, approvals, deployments, purchases, or third-party mutations.",
    summary: {
      items: items.length,
      highPriority: items.filter((item) => item.priority === "high").length,
      manualOnly: items.filter((item) => item.manualOnly).length,
      externalWritesEnabled: false,
      stopConditions: items.reduce((sum, item) => sum + item.stopConditions.length, 0),
      inputCount: items.reduce((sum, item) => sum + item.inputCount, 0),
    },
    items,
  };
}

function reviewInputsForLane({ lane, taskTracker, reviewSessions, briefingDrafts, privacyApprovalAudit, outreachDrafts }) {
  const laneId = lane.id;
  const inputs = [];
  const matchingTasks = taskTracker.tasks.filter((task) => laneForWorkstream(task.workstream) === laneId && task.tracking.status !== "done");
  if (matchingTasks.length) inputs.push(input("private-task", matchingTasks.length, matchingTasks[0].verificationCommand));
  const matchingSessions = reviewSessions.sessions.filter((session) => laneForSessionId(session.id) === laneId);
  if (matchingSessions.length) inputs.push(input("review-session", matchingSessions.length, matchingSessions[0].verificationCommand));
  const matchingBriefs = briefingDrafts.drafts.filter((draft) => laneForBriefDraft(draft) === laneId);
  if (matchingBriefs.length) inputs.push(input("briefing-draft", matchingBriefs.length, matchingBriefs[0].verificationCommand));
  if (laneId === "privacy-approval" && privacyApprovalAudit.counts.pending) {
    inputs.push(input("privacy-approval", privacyApprovalAudit.counts.pending, "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/approvals locally"));
  }
  const openDrafts = outreachDrafts.drafts.filter((draft) => !["used", "archived"].includes(draft.tracking.status));
  if (laneId === "outreach-draft-review" && openDrafts.length) {
    inputs.push(input("outreach-draft", openDrafts.length, "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/outreach-drafts locally"));
  }
  if (!inputs.length) inputs.push(input("lane-summary", lane.queueCount, lane.verificationCommand));
  return inputs;
}

function input(type, count, verificationCommand) {
  return {
    type,
    count,
    verificationCommand,
  };
}

function reviewPromptForLane(laneId) {
  if (laneId === "privacy-approval") return "Can this projection remain withheld or public-safe without exposing private source material?";
  if (laneId === "outreach-draft-review") return "Does the draft remain truthful, source-backed, manual-only, and unsent?";
  if (laneId === "briefing-drafts") return "Does the brief choose one local action and preserve all forbidden external actions?";
  if (laneId === "review-sessions") return "Can this review happen locally without scheduling or messaging anyone?";
  return "Which proof repair can be verified locally without widening public claims?";
}

function readinessChecks({
  cockpit,
  nextActionPlan,
  taskTracker,
  reviewSessions,
  briefingDrafts,
  privacyApprovalAudit,
  outreachDrafts,
  routeManifest,
  packageManifest,
  reviewBoard,
  scheduleHandOff,
}) {
  const privateRoutes = routeManifest.privateApiRoutes || [];
  const scripts = packageManifest.scripts || {};
  const hasRoute = privateRoutes.includes(ENDPOINT);
  const forbidden = new Set((briefingDrafts.drafts || []).flatMap((draft) => draft.forbiddenActions || []));
  return [
    check("local-private-boundary", /local\/private|localhost\/private/i.test(cockpit.privacyBoundary) && hasRoute, "high", `chief route declared=${hasRoute}.`, "Declare /api/private/chief-of-staff and keep the cockpit boundary local/private."),
    check("next-action-depth", nextActionPlan.actions.length >= 12 && nextActionPlan.summary.highPriority > 0, "high", `${nextActionPlan.actions.length} action(s), ${nextActionPlan.summary.highPriority} high priority.`, "Regenerate private next actions with maintenance, privacy, packet, artifact, and proof-trial inputs."),
    check("task-tracker-local-store", taskTracker.storage.localOnly && taskTracker.storage.publicRoutesExposeStore === false, "high", taskTracker.storage.relativePath, "Keep task tracker storage local-only and hidden from public routes."),
    check("review-session-coverage", reviewSessions.sessions.length >= 3 && reviewSessions.schedulingPolicy.includes("No calendar events"), "medium", `${reviewSessions.sessions.length} session(s), ${reviewSessions.summary.totalMinutes} minute(s).`, "Keep proof, privacy, and draft review sessions explicit and non-scheduling."),
    check("briefing-draft-safety", briefingDrafts.summary.externalWritesEnabled === false && briefingDrafts.summary.reviewRequired === true, "high", `${briefingDrafts.summary.drafts} draft(s), externalWrites=${briefingDrafts.summary.externalWritesEnabled}.`, "Keep chief-of-staff briefs review-only with external writes disabled."),
    check("forbidden-actions", ["send-email", "schedule-event", "submit-application", "deploy-production"].every((action) => forbidden.has(action)), "high", `${forbidden.size} forbidden action type(s).`, "Attach forbidden external actions to every chief-of-staff brief."),
    check("privacy-approval-queue", privacyApprovalAudit.counts.candidates > 0 && privacyApprovalAudit.publicProjectionGate.defaultPrivateDecision === "pending", "high", `${privacyApprovalAudit.counts.pending} pending approval(s).`, "Keep private projection candidates pending until a local decision exists."),
    check(
      "outreach-manual-only",
      /automatic sending and submission are forbidden/i.test(outreachDrafts.sendPolicy || "") && outreachDrafts.counts.used >= 0,
      "high",
      `${outreachDrafts.counts.drafts} draft(s), used=${outreachDrafts.counts.used}.`,
      "Keep outreach drafts manual-only and never auto-send from the app.",
    ),
    check(
      "review-board-coverage",
      reviewBoard.items.length >= 5 && reviewBoard.items.every((item) => item.manualOnly === true && item.externalWrite === false && item.verificationCommand),
      "high",
      `${reviewBoard.items.length} review board item(s), ${reviewBoard.summary.inputCount} local input(s).`,
      "Keep a manual-only review board item with verification command for every chief-of-staff lane.",
    ),
    check(
      "review-stop-conditions",
      reviewBoard.items.every((item) => item.stopConditions.some((condition) => /email|calendar|submission|deploy|payment/i.test(condition))),
      "high",
      `${reviewBoard.summary.stopConditions} stop condition(s) across review board items.`,
      "Attach explicit stop conditions for external systems to every private chief-of-staff review item.",
    ),
    check(
      "schedule-handoff",
      scheduleHandOff.items.length >= 5 &&
        scheduleHandOff.items.every((item) => item.manualOnly === true && item.calendarWrite === false && item.reminderWrite === false && item.externalWrite === false && item.verificationCommand),
      "high",
      `${scheduleHandOff.items.length} handoff item(s), ${scheduleHandOff.summary.blockedExternalActionSlots} blocked external action slot(s).`,
      "Give the private scheduler one manual-only handoff per chief lane with calendar, reminder, and external writes disabled.",
    ),
    check("verification-commands", nextActionPlan.actions.every((action) => action.verificationCommand) && reviewSessions.sessions.every((session) => session.verificationCommand), "medium", "Actions and sessions expose verification commands.", "Attach verification commands to every private action and session."),
    check(
      "receipt-route-coverage",
      [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => privateRoutes.includes(route)),
      "medium",
      `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => privateRoutes.includes(route)).length}/3 chief-of-staff private route(s) declared.`,
      "Declare chief-of-staff report, plan, and history routes in the private route manifest.",
    ),
    check("package-script", Boolean(scripts["chief:private"]), "high", `chief:private=${Boolean(scripts["chief:private"])}`, "Add the chief:private package script so chief-of-staff readiness can create a receipt."),
  ];
}

function handoffWindowFor(index, lane) {
  if (lane.id === "privacy-approval") return "local-review-window";
  if (lane.id === "outreach-draft-review") return "local-evening";
  return ["local-morning", "local-midday", "local-afternoon", "weekly-proof-reset", "public-readiness-day"][index % 5];
}

function dailyOperatingPlan({ lanes, reviewSessions, briefingDrafts, reviewBoard }) {
  const firstLane = lanes[0];
  const session = reviewSessions.sessions.find((item) => item.id.includes(firstLane?.id.split("-")[0])) || reviewSessions.sessions[0];
  const brief = briefingDrafts.drafts.find((item) => item.agenda.some((agenda) => agenda.source?.includes(firstLane?.id))) || briefingDrafts.drafts[0];
  const reviewItem = reviewBoard.items.find((item) => item.laneId === firstLane?.id) || reviewBoard.items[0];
  return {
    lane: firstLane?.id || "proof-repair",
    reviewItem: reviewItem?.id || null,
    session: session?.id || null,
    brief: brief?.id || null,
    minutes: Math.min(50, (session?.durationMinutes || 25) + 10),
    rules: [
      "Choose one local/private action only.",
      "Do not send, schedule, submit, approve, deploy, or purchase from this app.",
      "Run the verification command before marking the action done.",
    ],
  };
}

function laneForWorkstream(workstream) {
  if (workstream === "privacy-approval") return "privacy-approval";
  if (workstream === "audience-packets" || workstream === "opportunity-fit") return "outreach-draft-review";
  if (workstream === "self-review") return "review-sessions";
  if (workstream === "artifact-wall" || workstream === "proof-trials" || workstream === "claim-ledger" || workstream === "evidence-maintenance") return "proof-repair";
  return "proof-repair";
}

function laneForSessionId(sessionId) {
  if (/privacy/.test(sessionId)) return "privacy-approval";
  if (/draft|outreach/.test(sessionId)) return "outreach-draft-review";
  if (/proof|repair/.test(sessionId)) return "proof-repair";
  return "review-sessions";
}

function laneForBriefDraft(draft) {
  if (draft.id?.includes("privacy")) return "privacy-approval";
  if (draft.id?.includes("draft") || draft.id?.includes("outreach")) return "outreach-draft-review";
  if (draft.id?.includes("review")) return "review-sessions";
  if ((draft.agenda || []).some((item) => /privacy/.test(item.source || ""))) return "privacy-approval";
  return "proof-repair";
}

function lane({ id, label, score, queueCount, nextAction, verificationCommand }) {
  const normalized = Math.round(score);
  return {
    id,
    label,
    score: normalized,
    band: bandFor(normalized),
    queueCount,
    nextAction,
    verificationCommand,
  };
}

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/chief-of-staff locally",
  };
}

function laneScore(values) {
  return average(values.map((value) => Math.max(0, Math.min(100, value))));
}

function weightedScore(checks) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = checks.reduce((sum, check) => sum + weights[check.severity], 0);
  const earned = checks.filter((check) => check.passed).reduce((sum, check) => sum + weights[check.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function percent(value, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

module.exports = {
  appendPrivateChiefOfStaffReceipt,
  buildPrivateChiefOfStaffReadiness,
  privateChiefOfStaffPlan,
  readPrivateChiefOfStaffReceipts,
};
