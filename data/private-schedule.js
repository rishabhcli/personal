const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/private/schedule";
const STORE_RELATIVE_PATH = path.join("var", "private-schedule-receipts.json");
const maxReceipts = 50;

function privateSchedulePlan() {
  return {
    mode: "local-private-chief-of-staff-schedule-plan",
    command: "npm run schedule:private",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local schedule endpoint, writes a local receipt under var/, and does not create calendar events, reminders, emails, DMs, applications, submissions, approvals, deployments, payments, or third-party writes.",
  };
}

function buildPrivateSchedule({
  chiefReadiness,
  nextActionPlan,
  taskTracker,
  reviewSessions,
  briefingDrafts,
  privacyApprovalAudit,
  outreachDrafts,
  routeManifest,
  packageManifest,
  receipts = [],
}) {
  const schedule = scheduleBlocks({ chiefReadiness, nextActionPlan, taskTracker, reviewSessions, briefingDrafts, privacyApprovalAudit, outreachDrafts });
  const reviewWindows = scheduleReviewWindows({ schedule, chiefReadiness, taskTracker, reviewSessions, briefingDrafts, privacyApprovalAudit, outreachDrafts });
  const calendarFirewall = privateCalendarFirewall({ schedule, reviewWindows });
  const checks = scheduleChecks({ schedule, reviewWindows, calendarFirewall, chiefReadiness, reviewSessions, briefingDrafts, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const totalMinutes = schedule.reduce((sum, block) => sum + block.minutes, 0);
  const lanesCovered = new Set(schedule.map((block) => block.laneId).filter(Boolean)).size;
  const plan = privateSchedulePlan();

  return {
    generatedAt: new Date().toISOString(),
    mode: "local-private-chief-of-staff-schedule",
    privacyBoundary:
      "This schedule is a localhost/private planning artifact. It derives from public-safe metadata and local-only cockpit state; it does not read calendars, inboxes, school portals, private documents, credentials, or external application systems.",
    operatingPolicy:
      "This schedule can choose local focus windows only. It must not create calendar events, send reminders, contact people, submit applications, approve publication, deploy production, spend money, or mutate third-party systems.",
    plan,
    summary: {
      score: weightedScore(checks),
      band: bandFor(weightedScore(checks)),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      blocks: schedule.length,
      totalMinutes,
      lanesCovered,
      reviewSessionsCovered: reviewSessions.sessions.length,
      briefingDraftsCovered: briefingDrafts.drafts.length,
      pendingApprovals: privacyApprovalAudit.counts.pending,
      outreachDrafts: outreachDrafts.drafts.length,
      reviewWindows: reviewWindows.length,
      manualOnlyWindows: reviewWindows.filter((window) => window.manualOnly && window.externalWrite === false && window.calendarWrite === false).length,
      staleProofWindows: reviewWindows.filter((window) => window.staleProofPressure >= 70).length,
      highPressureWindows: reviewWindows.filter((window) => window.pressureBand === "high").length,
      blockedExternalWrites: calendarFirewall.blockedActionSlots,
      calendarEventsCreated: 0,
      remindersCreated: 0,
      externalWritesEnabled: false,
      reviewRequired: true,
      latestReceiptId: receipts[0]?.id || null,
    },
    guardrails: [
      "Keep this as a draft schedule until a human manually acts outside the app.",
      "Use block IDs for local focus tracking only; do not sync them to a calendar.",
      "Run the verification command attached to a block before marking its underlying task done.",
      "If a block requires private material, keep the public projection summary-only until approval.",
      "Treat review windows as private focus guidance, not calendar invites or reminders.",
    ],
    calendarFirewall,
    reviewWindows,
    checks,
    schedule,
    unscheduled: unscheduledWork({ nextActionPlan, schedule }),
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nextAction: failing[0]?.repairAction || schedule[0]?.objective || "Run the first local schedule block and record the verification command result.",
  };
}

function scheduleBlocks({ chiefReadiness, nextActionPlan, taskTracker, reviewSessions, briefingDrafts, privacyApprovalAudit, outreachDrafts }) {
  const blocks = [];
  const sessionByTheme = new Map(reviewSessions.sessions.map((session) => [session.id, session]));
  const pendingApprovals = privacyApprovalAudit.approvalQueue.slice(0, 4);
  const openTasks = taskTracker.tasks.filter((task) => task.tracking.status !== "done");
  const draftQueue = outreachDrafts.drafts.filter((draft) => draft.tracking.status !== "archived");

  for (const [index, lane] of chiefReadiness.lanes.entries()) {
    const session = sessionForLane(lane, sessionByTheme, reviewSessions.sessions);
    blocks.push(
      block({
        id: `lane-${lane.id}`,
        rank: blocks.length + 1,
        day: dayFor(index),
        startWindow: windowFor(index),
        minutes: lane.id === "proof-repair" ? 35 : 25,
        kind: "lane-triage",
        laneId: lane.id,
        title: `${lane.label} operating block`,
        objective: lane.nextAction,
        sourceTrace: [lane.id, session?.id, openTasks[index]?.id].filter(Boolean),
        linkedItems: [session?.id, openTasks[index]?.id, pendingApprovals[index]?.id, draftQueue[index]?.id].filter(Boolean).slice(0, 4),
        verificationCommand: lane.verificationCommand,
      }),
    );
  }

  for (const [index, session] of reviewSessions.sessions.entries()) {
    blocks.push(
      block({
        id: `session-${session.id}`,
        rank: blocks.length + 1,
        day: dayFor(index + 1),
        startWindow: windowFor(index + 2),
        minutes: session.durationMinutes,
        kind: "review-session",
        laneId: laneForSession(session.id),
        title: session.label,
        objective: session.goal,
        sourceTrace: ["local-private-review-sessions", session.id],
        linkedItems: session.items.map((item) => item.id).slice(0, 5),
        verificationCommand: session.verificationCommand,
      }),
    );
  }

  for (const [index, draft] of briefingDrafts.drafts.entries()) {
    blocks.push(
      block({
        id: `brief-${draft.id}`,
        rank: blocks.length + 1,
        day: dayFor(index + 2),
        startWindow: windowFor(index + 4),
        minutes: draft.estimatedMinutes,
        kind: "briefing-draft",
        laneId: laneForBrief(draft),
        title: draft.label,
        objective: draft.objective,
        sourceTrace: ["local-private-chief-of-staff-briefing-drafts", draft.id, ...draft.sourceTrace.slice(0, 2)],
        linkedItems: draft.agenda.map((item) => item.title).slice(0, 4),
        verificationCommand: draft.verificationCommand,
      }),
    );
  }

  return blocks.map((item, index) => ({ ...item, rank: index + 1 }));
}

function scheduleReviewWindows({ schedule, chiefReadiness, taskTracker, reviewSessions, briefingDrafts, privacyApprovalAudit, outreachDrafts }) {
  const firstBlockByLane = firstByLane(schedule);
  const pendingApprovals = (privacyApprovalAudit.approvalQueue || []).filter((item) => item.decision === "pending");
  const openDrafts = (outreachDrafts.drafts || []).filter((draft) => !["used", "archived"].includes(draft.tracking.status));
  const windows = (chiefReadiness.lanes || []).map((lane, index) => {
    const block = firstBlockByLane.get(lane.id) || schedule[index % Math.max(1, schedule.length)] || null;
    const laneTasks = (taskTracker.tasks || []).filter((task) => laneForWorkstream(task.workstream) === lane.id && !["done", "archived"].includes(task.tracking.status));
    const laneBriefs = (briefingDrafts.drafts || []).filter((draft) => laneForBrief(draft) === lane.id);
    const session = sessionForWindow(lane.id, reviewSessions.sessions || []);
    const pressureSignals = reviewPressureSignals({ lane, laneTasks, laneBriefs, pendingApprovals, openDrafts, session });
    const staleProofPressure = staleProofPressureFor({ lane, laneTasks, pressureSignals });
    const pressureScore = Math.max(staleProofPressure, Math.min(100, Math.round(lane.queueCount * 12 + pressureSignals.length * 9 + (100 - lane.score) * 0.35)));

    return {
      id: `window-${lane.id}`,
      rank: index + 1,
      laneId: lane.id,
      label: `${lane.label} review window`,
      day: block?.day || dayFor(index),
      startWindow: block?.startWindow || windowFor(index),
      minutes: Math.min(55, Math.max(25, (block?.minutes || 25) + (pressureScore >= 70 ? 10 : 0))),
      primaryBlockId: block?.id || null,
      sessionId: session?.id || null,
      briefingDraftIds: laneBriefs.map((draft) => draft.id).slice(0, 3),
      taskIds: laneTasks.map((task) => task.id).slice(0, 5),
      pressureScore,
      pressureBand: bandFor(pressureScore),
      staleProofPressure,
      pressureSignals,
      blockedExternalActions: blockedExternalActionsFor(lane.id),
      dependencies: windowDependencies({ lane, laneTasks, laneBriefs, pendingApprovals, openDrafts, session }),
      manualOnly: true,
      calendarWrite: false,
      reminderWrite: false,
      externalWrite: false,
      reviewRequired: true,
      writePolicy: "local-only review window; no calendar event, reminder, email, DM, submission, approval, deploy, or payment is created",
      exitCriteria: [
        "Pick one local review decision for this lane.",
        "Run or record the verification command before promoting work out of the window.",
        "Stop if the next step requires an external account, private document contents, calendar, inbox, school portal, payment, or production write.",
      ],
      sourceTrace: ["local-private-chief-of-staff-schedule", block?.id, "local-private-chief-of-staff-readiness", lane.id, session?.id].filter(Boolean),
      verificationCommand: block?.verificationCommand || lane.verificationCommand,
    };
  });

  return windows
    .sort((left, right) => right.pressureScore - left.pressureScore || left.rank - right.rank)
    .map((window, index) => ({ ...window, rank: index + 1 }));
}

function privateCalendarFirewall({ schedule, reviewWindows }) {
  const blockedExternalActions = [
    "create-calendar-event",
    "create-reminder",
    "send-email",
    "send-dm",
    "submit-application",
    "approve-publication",
    "deploy-production",
    "spend-money",
  ];
  return {
    mode: "local-private-calendar-firewall",
    localOnly: true,
    calendarWriteCapability: false,
    reminderWriteCapability: false,
    externalWriteCapability: false,
    protectedBlocks: schedule.length,
    protectedReviewWindows: reviewWindows.length,
    blockedExternalActions,
    blockedActionSlots: (schedule.length + reviewWindows.length) * blockedExternalActions.length,
    policy:
      "This firewall is declarative proof that the schedule can rank focus windows but cannot create calendar events, reminders, messages, submissions, approvals, deployments, payments, or third-party writes.",
    verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/schedule locally",
  };
}

function block({ id, rank, day, startWindow, minutes, kind, laneId, title, objective, sourceTrace, linkedItems, verificationCommand }) {
  return {
    id,
    rank,
    day,
    startWindow,
    minutes,
    kind,
    laneId,
    title,
    objective,
    linkedItems,
    sourceTrace,
    manualOnly: true,
    calendarWrite: false,
    externalWrite: false,
    reviewRequired: true,
    writePolicy: "local-only planning block; no calendar event, reminder, message, submission, approval, deployment, or payment is created",
    exitCriteria: [
      "Complete at most one concrete action from this block.",
      "Run or record the verification command before marking the underlying item done.",
      "Leave any external scheduling, sending, approval, or submission to manual human action outside this app.",
    ],
    verificationCommand,
  };
}

function scheduleChecks({ schedule, reviewWindows, calendarFirewall, chiefReadiness, reviewSessions, briefingDrafts, routeManifest, packageManifest }) {
  const privateRoutes = routeManifest.privateApiRoutes || [];
  const scripts = packageManifest.scripts || {};
  const laneIds = new Set((chiefReadiness.lanes || []).map((lane) => lane.id));
  const scheduledLanes = new Set(schedule.map((block) => block.laneId).filter(Boolean));
  const windowLanes = new Set(reviewWindows.map((window) => window.laneId).filter(Boolean));
  const missingLanes = [...laneIds].filter((id) => !scheduledLanes.has(id));
  const missingWindowLanes = [...laneIds].filter((id) => !windowLanes.has(id));
  return [
    check(
      "local-private-boundary",
      [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => privateRoutes.includes(route)),
      "high",
      `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => privateRoutes.includes(route)).length}/3 private schedule route(s).`,
      "Declare schedule report, plan, and history routes in the private route manifest.",
    ),
    check(
      "schedule-depth",
      schedule.length >= 8 && schedule.reduce((sum, block) => sum + block.minutes, 0) >= 180,
      "medium",
      `${schedule.length} block(s), ${schedule.reduce((sum, block) => sum + block.minutes, 0)} minute(s).`,
      "Build enough local focus blocks to cover lanes, sessions, and briefs.",
    ),
    check("lane-coverage", missingLanes.length === 0 && laneIds.size >= 5, "high", `missing lanes: ${missingLanes.join(", ") || "none"}.`, "Schedule every chief-of-staff lane at least once."),
    check(
      "review-session-coverage",
      reviewSessions.sessions.every((session) => schedule.some((block) => block.id === `session-${session.id}`)),
      "medium",
      `${reviewSessions.sessions.length} review session(s).`,
      "Add explicit schedule blocks for every private review session.",
    ),
    check(
      "briefing-draft-coverage",
      briefingDrafts.drafts.every((draft) => schedule.some((block) => block.id === `brief-${draft.id}`)),
      "medium",
      `${briefingDrafts.drafts.length} briefing draft(s).`,
      "Add explicit schedule blocks for every chief-of-staff briefing draft.",
    ),
    check(
      "calendar-writes-disabled",
      schedule.every((block) => block.calendarWrite === false && block.externalWrite === false && block.manualOnly === true),
      "high",
      `${schedule.filter((block) => block.calendarWrite || block.externalWrite || !block.manualOnly).length} unsafe block(s).`,
      "Keep every schedule block local-only, manual-only, and write-disabled.",
    ),
    check(
      "verification-commands",
      schedule.every((block) => block.verificationCommand && block.exitCriteria.length >= 3),
      "medium",
      `${schedule.filter((block) => block.verificationCommand).length}/${schedule.length} block(s) with verification.`,
      "Attach verification commands and exit criteria to every schedule block.",
    ),
    check(
      "review-window-depth",
      reviewWindows.length >= laneIds.size && missingWindowLanes.length === 0,
      "high",
      `${reviewWindows.length} review window(s); missing lanes: ${missingWindowLanes.join(", ") || "none"}.`,
      "Create one manual review window for every chief-of-staff lane.",
    ),
    check(
      "calendar-firewall",
      calendarFirewall.localOnly === true &&
        calendarFirewall.calendarWriteCapability === false &&
        calendarFirewall.reminderWriteCapability === false &&
        ["create-calendar-event", "create-reminder", "send-email", "submit-application"].every((action) => calendarFirewall.blockedExternalActions.includes(action)),
      "high",
      `${calendarFirewall.blockedActionSlots} blocked external action slot(s).`,
      "Keep schedule execution behind a declarative local-only calendar and external-write firewall.",
    ),
    check(
      "stale-proof-pressure-window",
      reviewWindows.some((window) => window.staleProofPressure >= 70 && window.verificationCommand),
      "medium",
      `${reviewWindows.filter((window) => window.staleProofPressure >= 70).length} stale-proof pressure window(s).`,
      "Add at least one verification-backed review window that explicitly handles stale proof pressure.",
    ),
    check(
      "window-source-trace",
      reviewWindows.every((window) => window.primaryBlockId && window.sourceTrace.length >= 4 && window.verificationCommand && window.blockedExternalActions.length >= 6),
      "medium",
      `${reviewWindows.filter((window) => window.primaryBlockId && window.verificationCommand).length}/${reviewWindows.length} traceable window(s).`,
      "Attach schedule block, chief lane, verification command, and blocked actions to every review window.",
    ),
    check(
      "package-script",
      Boolean(scripts["schedule:private"]),
      "high",
      `schedule:private=${Boolean(scripts["schedule:private"])}`,
      "Add the schedule:private package script so the private schedule can create a receipt.",
    ),
  ];
}

function firstByLane(schedule) {
  const byLane = new Map();
  for (const block of schedule) {
    if (block.laneId && !byLane.has(block.laneId)) byLane.set(block.laneId, block);
  }
  return byLane;
}

function sessionForWindow(laneId, sessions) {
  if (laneId === "privacy-approval") return sessions.find((session) => session.id === "privacy-approval-review") || null;
  if (laneId === "outreach-draft-review") return sessions.find((session) => session.id === "draft-outreach-review") || null;
  if (laneId === "proof-repair") return sessions.find((session) => session.id === "proof-repair-sprint") || null;
  return sessions[0] || null;
}

function reviewPressureSignals({ lane, laneTasks, laneBriefs, pendingApprovals, openDrafts, session }) {
  const signals = [];
  if (lane.queueCount >= 5) signals.push(`${lane.queueCount} queued lane item(s)`);
  if (lane.score < 85) signals.push(`lane score ${lane.score}/100`);
  if (laneTasks.some((task) => task.priority === "high")) signals.push(`${laneTasks.filter((task) => task.priority === "high").length} high-priority task(s)`);
  if (lane.id === "privacy-approval" && pendingApprovals.length) signals.push(`${pendingApprovals.length} pending privacy approval(s)`);
  if (lane.id === "outreach-draft-review" && openDrafts.length) signals.push(`${openDrafts.length} manual outreach draft(s)`);
  if (laneBriefs.length) signals.push(`${laneBriefs.length} briefing draft(s)`);
  if (session) signals.push(`paired review session ${session.id}`);
  return signals;
}

function staleProofPressureFor({ lane, laneTasks, pressureSignals }) {
  const proofTaskCount = laneTasks.filter((task) => ["proof-repair", "evidence-maintenance", "claim-ledger", "artifact-wall", "proof-trials"].includes(laneForWorkstream(task.workstream))).length;
  if (lane.id !== "proof-repair") return Math.min(65, proofTaskCount * 12 + pressureSignals.length * 8);
  return Math.min(100, 45 + proofTaskCount * 12 + pressureSignals.length * 8);
}

function windowDependencies({ lane, laneTasks, laneBriefs, pendingApprovals, openDrafts, session }) {
  const dependencies = [];
  if (session) dependencies.push({ type: "review-session", id: session.id, verificationCommand: session.verificationCommand });
  for (const task of laneTasks.slice(0, 3)) dependencies.push({ type: "private-task", id: task.id, verificationCommand: task.verificationCommand });
  for (const draft of laneBriefs.slice(0, 2)) dependencies.push({ type: "briefing-draft", id: draft.id, verificationCommand: draft.verificationCommand });
  if (lane.id === "privacy-approval") {
    for (const approval of pendingApprovals.slice(0, 3)) dependencies.push({ type: "privacy-approval", id: approval.id, verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/approvals locally" });
  }
  if (lane.id === "outreach-draft-review") {
    for (const draft of openDrafts.slice(0, 3)) dependencies.push({ type: "outreach-draft", id: draft.id, verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/outreach-drafts locally" });
  }
  return dependencies;
}

function blockedExternalActionsFor(laneId) {
  const shared = ["create-calendar-event", "create-reminder", "send-email", "send-dm", "submit-application", "deploy-production", "spend-money"];
  if (laneId === "privacy-approval") return [...shared, "approve-publication", "expose-private-document"];
  if (laneId === "outreach-draft-review") return [...shared, "auto-send-outreach", "mark-application-submitted"];
  return [...shared, "approve-publication"];
}

function laneForWorkstream(workstream) {
  if (workstream === "privacy-approval") return "privacy-approval";
  if (workstream === "audience-packets" || workstream === "opportunity-fit") return "outreach-draft-review";
  if (workstream === "self-review") return "review-sessions";
  if (workstream === "artifact-wall" || workstream === "proof-trials" || workstream === "claim-ledger" || workstream === "evidence-maintenance") return "proof-repair";
  return "proof-repair";
}

function unscheduledWork({ nextActionPlan, schedule }) {
  const scheduledText = new Set(schedule.flatMap((block) => [block.objective, ...block.linkedItems]).filter(Boolean));
  return nextActionPlan.actions
    .filter((action) => !scheduledText.has(action.id) && !scheduledText.has(action.detail))
    .slice(0, 6)
    .map((action) => ({
      id: action.id,
      priority: action.priority,
      title: action.title,
      reason: "Not selected for the first local schedule cycle.",
      verificationCommand: action.verificationCommand,
    }));
}

function sessionForLane(lane, sessionByTheme, sessions) {
  if (lane.id === "proof-repair") return sessionByTheme.get("proof-repair-sprint");
  if (lane.id === "privacy-approval") return sessionByTheme.get("privacy-approval-review");
  if (lane.id === "outreach-draft-review") return sessionByTheme.get("draft-outreach-review");
  return sessions[0] || null;
}

function laneForSession(id) {
  if (id.includes("privacy")) return "privacy-approval";
  if (id.includes("outreach") || id.includes("draft")) return "outreach-draft-review";
  return "proof-repair";
}

function laneForBrief(draft) {
  if (draft.id.includes("opportunity")) return "outreach-draft-review";
  if (draft.id.includes("artifact")) return "proof-repair";
  return "briefing-drafts";
}

function dayFor(index) {
  return ["today", "next-local-workday", "weekly-proof-reset", "opportunity-prep-day", "public-readiness-day"][index % 5];
}

function windowFor(index) {
  return ["local-morning", "local-midday", "local-afternoon", "local-evening", "local-review-window"][index % 5];
}

function appendPrivateScheduleReceipt(root, receipt) {
  const receipts = readPrivateScheduleReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readPrivateScheduleReceipts(root) {
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

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: id === "package-script" ? "npm run schedule:private" : "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/schedule locally",
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
  appendPrivateScheduleReceipt,
  buildPrivateSchedule,
  privateSchedulePlan,
  readPrivateScheduleReceipts,
};
