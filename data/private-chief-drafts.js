const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/private/chief-of-staff/drafts";
const STORE_RELATIVE_PATH = path.join("var", "private-chief-drafts-receipts.json");
const maxReceipts = 50;

function privateChiefDraftsPlan() {
  return {
    mode: "local-private-chief-of-staff-draft-plan",
    command: "npm run draft:private",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local chief-of-staff draft endpoint, writes a local receipt under var/, and does not read inboxes, calendars, private documents, credentials, portals, send messages, schedule events, submit applications, approve publication, deploy, spend money, or mutate external systems.",
  };
}

function buildPrivateChiefDraftsReport({
  chiefReadiness,
  schedule,
  priorities,
  briefingDrafts,
  reviewSessions,
  privacyApprovalAudit,
  outreachDrafts,
  routeManifest,
  packageManifest = {},
  receipts = [],
}) {
  const drafts = buildDrafts({
    chiefReadiness,
    schedule,
    priorities,
    briefingDrafts,
    reviewSessions,
    privacyApprovalAudit,
    outreachDrafts,
  });
  const checks = draftChecks({ drafts, chiefReadiness, schedule, priorities, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "local-private-chief-of-staff-draft-packets",
    privacyBoundary:
      "Draft packets are localhost/private planning artifacts. They derive from public-safe metadata and local-only cockpit state; they do not read inboxes, calendars, private documents, credentials, portals, or external application systems.",
    operatingPolicy:
      "Draft packets can frame local work only. They must not send messages, schedule events, submit applications, approve publication, deploy production, spend money, contact third parties, or mark external outcomes as real.",
    plan: privateChiefDraftsPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      drafts: drafts.length,
      lanesCovered: new Set(drafts.map((draft) => draft.laneId).filter(Boolean)).size,
      linkedPriorities: new Set(drafts.map((draft) => draft.priorityId).filter(Boolean)).size,
      linkedScheduleBlocks: new Set(drafts.map((draft) => draft.scheduleBlockId).filter(Boolean)).size,
      linkedBriefs: new Set(drafts.map((draft) => draft.briefId).filter(Boolean)).size,
      pendingApprovals: privacyApprovalAudit.counts.pending,
      outreachDrafts: outreachDrafts.drafts.length,
      sendableDrafts: drafts.filter((draft) => draft.externalUseAllowed).length,
      externalWritesEnabled: false,
      reviewRequired: true,
      routeCovered: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`, `${ENDPOINT}/:id`].every((route) => (routeManifest.privateApiRoutes || []).includes(route)),
      latestReceiptId: latestReceipt?.id || null,
    },
    checks,
    drafts,
    selectedDraft: drafts[0] || null,
    dailyScript: dailyScript(drafts[0], chiefReadiness),
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nextAction: failing[0]?.repairAction || drafts[0]?.nextAction || "Review the top local/private chief-of-staff draft and run its verification command.",
    verificationCommand: "npm run draft:private && npm run check && npm run verify",
  };
}

function selectPrivateChiefDraft(value, report) {
  const normalized = String(value || "").toLowerCase().trim();
  return (report.drafts || []).find((draft) => draft.id === normalized || draft.aliases.includes(normalized)) || null;
}

function appendPrivateChiefDraftsReceipt(root, receipt) {
  const receipts = readPrivateChiefDraftsReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readPrivateChiefDraftsReceipts(root) {
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

function buildDrafts({ chiefReadiness, schedule, priorities, briefingDrafts, reviewSessions, privacyApprovalAudit, outreachDrafts }) {
  const nowItems = priorities.decisionLanes.find((lane) => lane.id === "now")?.items || priorities.priorityItems.slice(0, 5);
  const blocksByLane = new Map((schedule.schedule || []).map((block) => [block.laneId, block]));
  const briefsByLane = new Map((briefingDrafts.drafts || []).map((brief) => [laneForBrief(brief), brief]));
  const sessionsByLane = new Map((reviewSessions.sessions || []).map((session) => [laneForSession(session.id), session]));
  const lanes = chiefReadiness.lanes.length ? chiefReadiness.lanes : [];

  return lanes.slice(0, 5).map((lane, index) => {
    const priority = nowItems.find((item) => item.laneId === lane.id) || priorities.priorityItems.find((item) => item.laneId === lane.id) || priorities.priorityItems[index];
    const block = blocksByLane.get(lane.id) || schedule.schedule[index] || null;
    const brief = briefsByLane.get(lane.id) || briefingDrafts.drafts[index % Math.max(1, briefingDrafts.drafts.length)] || null;
    const session = sessionsByLane.get(lane.id) || reviewSessions.sessions[index % Math.max(1, reviewSessions.sessions.length)] || null;
    const approval = privacyApprovalAudit.approvalQueue[index] || privacyApprovalAudit.approvalQueue[0] || null;
    const outreach = outreachDrafts.drafts.find((draft) => draft.tracking.status !== "archived") || outreachDrafts.drafts[0] || null;
    return draftPacket({
      rank: index + 1,
      lane,
      priority,
      block,
      brief,
      session,
      approval,
      outreach,
    });
  });
}

function draftPacket({ rank, lane, priority, block, brief, session, approval, outreach }) {
  const id = `chief-draft-${lane.id}`;
  const objective = priority?.objective || lane.nextAction;
  const verificationCommand = priority?.verificationCommand || block?.verificationCommand || lane.verificationCommand;
  const sourceTrace = unique([
    "local-private-chief-of-staff-readiness",
    lane.id,
    priority?.id,
    block?.id,
    brief?.id,
    session?.id,
    approval?.id,
    outreach?.id,
  ]);

  return {
    id,
    aliases: [lane.id, lane.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), `draft-${rank}`],
    rank,
    laneId: lane.id,
    label: `${lane.label} chief-of-staff draft`,
    kind: "local-private-operating-draft",
    status: "review-only",
    objective,
    priorityId: priority?.id || null,
    scheduleBlockId: block?.id || null,
    briefId: brief?.id || null,
    reviewSessionId: session?.id || null,
    readinessScore: lane.score,
    priorityScore: priority?.score || 0,
    estimatedMinutes: block?.minutes || brief?.estimatedMinutes || 25,
    externalUseAllowed: false,
    manualOnly: true,
    reviewRequired: true,
    externalWrite: false,
    forbiddenActions: forbiddenActions(),
    sections: [
      section("opening", `${lane.label}: choose one local/private action, then stop expansion until verification is recorded.`),
      section("focus", objective),
      section("schedule", block ? `${block.day} ${block.startWindow}: ${block.title} for ${block.minutes} minute(s).` : "Use the next local focus block; do not create a calendar event."),
      section("brief", brief ? `${brief.label}: ${brief.objective}` : "Use the nearest chief-of-staff brief as context only."),
      section("review", session ? `${session.label}: ${session.goal}` : "Manual review is required before using this draft."),
      section("privacy", approval ? `${approval.label}: ${approval.requiredApproval}` : "Keep private material withheld or summary-only until approval exists."),
      section("boundary", "This is not an email, DM, application, calendar invite, approval, deployment, purchase, or external instruction."),
    ],
    sourceTrace,
    exitCriteria: [
      "Pick one action from the focus section.",
      "Run or record the verification command.",
      "Leave all sending, scheduling, approval, submission, deployment, and payment work outside this app.",
    ],
    manualUseBoundary:
      "Review locally before acting. Do not send, schedule, submit, approve, deploy, purchase, or contact anyone from this draft.",
    nextAction: objective,
    verificationCommand,
  };
}

function dailyScript(draft, chiefReadiness) {
  return {
    draftId: draft?.id || null,
    posture: "single-action-local-review",
    readAloud:
      draft?.sections?.map((section) => `${section.label}: ${section.text}`).slice(0, 4) || [
        "Focus: choose one local/private action.",
        "Boundary: no external write is allowed.",
      ],
    readinessBand: chiefReadiness.summary?.band || "unknown",
    manualUseBoundary:
      "This script is a local planning prompt only. It does not authorize browser actions, emails, DMs, applications, calendar writes, approvals, deployments, purchases, or publication.",
  };
}

function draftChecks({ drafts, chiefReadiness, schedule, priorities, routeManifest, packageManifest }) {
  const privateRoutes = routeManifest.privateApiRoutes || [];
  const scripts = packageManifest.scripts || {};
  const routeCovered = [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`, `${ENDPOINT}/:id`].every((route) => privateRoutes.includes(route));
  return [
    check("local-private-boundary", routeCovered && chiefReadiness.summary?.externalWritesEnabled === false, "high", `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`, `${ENDPOINT}/:id`].filter((route) => privateRoutes.includes(route)).length}/4 draft route(s).`, "Declare chief draft report, plan, history, and selected draft routes in the private route manifest."),
    check("draft-depth", drafts.length >= 5 && drafts.every((draft) => draft.sections.length >= 6), "high", `${drafts.length} draft(s).`, "Generate draft packets for the core chief-of-staff lanes."),
    check("priority-linkage", drafts.every((draft) => draft.priorityId) && priorities.priorityItems.length >= 18, "medium", `${drafts.filter((draft) => draft.priorityId).length}/${drafts.length} draft(s) linked to priorities.`, "Link every chief draft to a private priority item."),
    check("schedule-linkage", drafts.every((draft) => draft.scheduleBlockId) && schedule.schedule.length >= 8, "medium", `${drafts.filter((draft) => draft.scheduleBlockId).length}/${drafts.length} draft(s) linked to schedule blocks.`, "Link every chief draft to a local schedule block."),
    check("source-trace-coverage", drafts.every((draft) => draft.sourceTrace.length >= 4), "high", `${drafts.filter((draft) => draft.sourceTrace.length >= 4).length}/${drafts.length} traced draft(s).`, "Attach source traces from readiness, priority, schedule, brief, and review surfaces."),
    check("manual-only-guard", drafts.every((draft) => draft.manualOnly && draft.reviewRequired && draft.externalWrite === false && draft.externalUseAllowed === false), "high", "Every draft is manual-only, review-required, and not externally usable.", "Keep chief drafts local-only and non-sendable."),
    check("forbidden-actions", drafts.every((draft) => ["send-email", "schedule-event", "submit-application", "deploy-production"].every((action) => draft.forbiddenActions.includes(action))), "high", "Every draft carries forbidden action guardrails.", "Attach forbidden external actions to every private chief draft."),
    check("verification-commands", drafts.every((draft) => draft.verificationCommand && draft.exitCriteria.length >= 3), "medium", `${drafts.filter((draft) => draft.verificationCommand).length}/${drafts.length} draft(s) with verification.`, "Attach verification commands and exit criteria to every draft packet."),
    check("receipt-route-coverage", routeCovered, "medium", "Chief draft report, plan, selected draft, and receipt history routes should all be private routes.", "Declare all chief draft receipt routes in runtime attestation."),
    check("package-script", Boolean(scripts["draft:private"]), "high", `draft:private=${Boolean(scripts["draft:private"])}`, "Add the draft:private package script so chief drafts can create receipts."),
  ];
}

function selectSection(draft, id) {
  return draft.sections.find((section) => section.id === id)?.text || "";
}

function section(id, text) {
  return {
    id,
    label: id
      .split("-")
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
      .join(" "),
    text,
  };
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

function forbiddenActions() {
  return ["send-email", "send-dm", "schedule-event", "submit-application", "approve-publication", "deploy-production", "spend-money"];
}

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: id === "package-script" ? "npm run draft:private" : "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/chief-of-staff/drafts locally",
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

module.exports = {
  ENDPOINT,
  appendPrivateChiefDraftsReceipt,
  buildPrivateChiefDraftsReport,
  privateChiefDraftsPlan,
  readPrivateChiefDraftsReceipts,
  selectPrivateChiefDraft,
};
