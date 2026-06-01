const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/private/briefing-drafts";
const STORE_RELATIVE_PATH = path.join("var", "private-briefing-draft-receipts.json");
const maxReceipts = 50;

function privateBriefingDraftsPlan() {
  return {
    mode: "local-private-briefing-drafts-plan",
    command: "npm run brief:private",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local briefing-drafts endpoint, writes a local receipt under var/, and does not send messages, schedule events, submit applications, approve publication, deploy, spend money, or mutate third-party systems.",
  };
}

function buildPrivateBriefingDrafts({
  nextActionPlan,
  taskTracker,
  reviewSessions,
  outreachDrafts,
  opportunityPackages,
  selfReviews,
  graphScoreboard,
  artifactTranscripts,
  routeManifest = {},
  packageManifest = {},
  receipts = [],
}) {
  const drafts = [
    proofRepairBrief({ nextActionPlan, taskTracker, reviewSessions, graphScoreboard }),
    opportunityPrepBrief({ opportunityPackages, outreachDrafts, selfReviews }),
    artifactProofBrief({ artifactTranscripts, graphScoreboard, nextActionPlan }),
  ].map((draft, index) => ({ ...draft, rank: index + 1 }));
  const decisionGates = briefingDecisionGates(drafts);
  const checks = briefingChecks({ drafts, decisionGates, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "local-private-chief-of-staff-briefing-drafts",
    privacyBoundary:
      "Briefing drafts are localhost/private planning artifacts. They derive from public-safe metadata and local-only planning state; they do not read inboxes, calendars, private documents, school portals, or external application systems.",
    operatingPolicy:
      "No calendar events, reminders, emails, DMs, applications, approvals, deployments, purchases, or submissions are created automatically. Every brief is review-only until Rishabh acts outside this app.",
    plan: privateBriefingDraftsPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      drafts: drafts.length,
      totalAgendaItems: drafts.reduce((sum, draft) => sum + draft.agenda.length, 0),
      estimatedMinutes: drafts.reduce((sum, draft) => sum + draft.estimatedMinutes, 0),
      highPriorityItems: drafts.reduce((sum, draft) => sum + draft.agenda.filter((item) => item.priority === "high").length, 0),
      decisionGates: decisionGates.summary.gates,
      manualOnlyDecisionGates: decisionGates.summary.manualOnlyGates,
      blockedExternalActionSlots: decisionGates.summary.blockedExternalActionSlots,
      externalWritesEnabled: false,
      reviewRequired: true,
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
    drafts,
  };
}

function selectPrivateBriefingDraft(value, catalog) {
  const normalized = String(value || "").toLowerCase().trim();
  return catalog.drafts.find((draft) => draft.id === normalized || draft.aliases.includes(normalized)) || null;
}

function proofRepairBrief({ nextActionPlan, taskTracker, reviewSessions, graphScoreboard }) {
  const highActions = nextActionPlan.actions.filter((action) => action.priority === "high").slice(0, 5);
  const openTasks = taskTracker.tasks.filter((task) => task.tracking.status !== "done").slice(0, 5);
  const session = reviewSessions.sessions.find((item) => item.id === "proof-repair-sprint") || reviewSessions.sessions[0];
  const graphAction = graphScoreboard?.repairActions?.[0];
  return brief({
    id: "proof-repair-brief",
    aliases: ["proof", "daily", "repair"],
    label: "Proof repair chief-of-staff brief",
    cadence: "daily",
    estimatedMinutes: Math.min(50, session?.durationMinutes || 35),
    objective: "Pick the highest-impact evidence repair and leave the app with a verified artifact, claim, or receipt improvement.",
    agenda: [
      ...highActions.map((action) =>
        agendaItem({
          priority: action.priority,
          title: action.title,
          detail: action.detail,
          source: action.source,
          verificationCommand: action.verificationCommand,
        }),
      ),
      ...openTasks.slice(0, 2).map((task) =>
        agendaItem({
          priority: task.priority,
          title: task.title,
          detail: task.detail,
          source: task.workstream || "private-task-tracker",
          verificationCommand: task.verificationCommand,
        }),
      ),
      ...(graphAction
        ? [
            agendaItem({
              priority: graphAction.priority,
              title: `Graph repair: ${graphAction.area}`,
              detail: graphAction.action,
              source: "graph-scoreboard",
              verificationCommand: graphAction.verificationCommand,
            }),
          ]
        : []),
    ],
    sourceTrace: ["local-private-next-action-plan", "local-private-task-tracker", "local-private-review-sessions", "evidence-graph-normalization-scoreboard"],
    draftNotes: [
      `Start with ${session?.label || "proof repair sprint"} and keep the scope to one verified improvement.`,
      "If a task requires private source material, keep the public projection as summary-only until approval.",
      "Record evidence before changing narrative copy.",
    ],
    verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/briefing-drafts/proof-repair-brief locally",
  });
}

function opportunityPrepBrief({ opportunityPackages, outreachDrafts, selfReviews }) {
  const packageQueue = (opportunityPackages.packages || []).slice(0, 4);
  const draftQueue = (outreachDrafts.drafts || []).filter((draft) => draft.tracking.status !== "archived").slice(0, 4);
  const weekly = selfReviews.reports.find((report) => report.id === "weekly") || selfReviews.reports[0];
  return brief({
    id: "opportunity-prep-brief",
    aliases: ["opportunity", "outreach", "packet"],
    label: "Opportunity prep chief-of-staff brief",
    cadence: "twice-weekly",
    estimatedMinutes: 30,
    objective: "Prepare one opportunity package for manual review without sending outreach or claiming a live application state.",
    agenda: [
      ...packageQueue.map((item) =>
        agendaItem({
          priority: item.readinessBand === "blocked" ? "high" : "medium",
          title: item.label,
          detail: item.nextAction,
          source: "opportunity-packages",
          verificationCommand: item.verificationCommand,
        }),
      ),
      ...draftQueue.slice(0, 2).map((draft) =>
        agendaItem({
          priority: draft.tracking.status === "reviewing" ? "high" : "medium",
          title: draft.subject,
          detail: draft.suggestedNextAction,
          source: "outreach-drafts",
          verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/outreach-drafts locally",
        }),
      ),
    ],
    sourceTrace: ["proof-backed-opportunity-packages", "local-private-outreach-drafts", "evidence-self-review-reports"],
    draftNotes: [
      weekly?.nextActions?.[0]?.action || "Review the weekly self-review before choosing an opportunity.",
      "Use draft language only after manually checking claims, caveats, and public-safe artifacts.",
      "Do not send, submit, schedule, or mark an application as live from this app.",
    ],
    verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/briefing-drafts/opportunity-prep-brief locally",
  });
}

function artifactProofBrief({ artifactTranscripts, graphScoreboard, nextActionPlan }) {
  const transcriptQueue = (artifactTranscripts.transcripts || [])
    .slice()
    .sort((left, right) => statusRank(left.status) - statusRank(right.status) || left.transcriptScore - right.transcriptScore)
    .slice(0, 5);
  const artifactActions = nextActionPlan.actions.filter((action) => action.workstream === "artifact-wall").slice(0, 4);
  return brief({
    id: "artifact-proof-brief",
    aliases: ["artifact", "transcripts", "museum"],
    label: "Artifact proof chief-of-staff brief",
    cadence: "weekly",
    estimatedMinutes: 25,
    objective: "Turn the weakest artifact transcript or media gap into a stronger public-safe proof path.",
    agenda: [
      ...transcriptQueue.map((transcript) =>
        agendaItem({
          priority: transcript.status === "weak" ? "high" : "medium",
          title: `${transcript.projectTitle} transcript ${transcript.status}`,
          detail: transcript.nextAction,
          source: "artifact-transcripts",
          verificationCommand: transcript.verificationCommand,
        }),
      ),
      ...artifactActions.map((action) =>
        agendaItem({
          priority: action.priority,
          title: action.title,
          detail: action.detail,
          source: action.source,
          verificationCommand: action.verificationCommand,
        }),
      ),
    ],
    sourceTrace: ["public-artifact-transcript-library", "public-artifact-catalog", "evidence-graph-normalization-scoreboard"],
    draftNotes: [
      `Graph normalization next action: ${graphScoreboard?.nextAction || "Keep graph coverage fresh."}`,
      artifactTranscripts.comparison?.commonRepair || "Keep transcript artifacts fresh when evidence changes.",
      "Do not imply screenshots, videos, traces, papers, awards, or private files exist unless the catalog can serve them.",
    ],
    verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/briefing-drafts/artifact-proof-brief locally",
  });
}

function brief({ id, aliases, label, cadence, estimatedMinutes, objective, agenda, sourceTrace, draftNotes, verificationCommand }) {
  const normalizedAgenda = agenda.length
    ? agenda.slice(0, 8).map((item, index) => ({ ...item, order: index + 1 }))
    : [
        {
          ...agendaItem({
            priority: "low",
            title: "Keep proof fresh",
            detail: "No urgent item was generated for this brief; rerun after the next evidence change.",
            source: "fallback",
            verificationCommand: "npm run check",
          }),
          order: 1,
        },
      ];
  return {
    id,
    aliases,
    label,
    cadence,
    estimatedMinutes,
    objective,
    agenda: normalizedAgenda,
    draftNotes,
    sourceTrace,
    exitCriteria: [
      "Pick at most one concrete action to execute before the next review.",
      "Run or record the verification command for any changed proof surface.",
      "Leave external sending, scheduling, approvals, and submissions to manual human action outside this app.",
    ],
    forbiddenActions: [
      "send-email",
      "send-dm",
      "submit-application",
      "schedule-event",
      "approve-publication",
      "deploy-production",
      "spend-money",
    ],
    verificationCommand,
  };
}

function appendPrivateBriefingDraftReceipt(root, receipt) {
  const receipts = readPrivateBriefingDraftReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readPrivateBriefingDraftReceipts(root) {
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

function briefingDecisionGates(drafts) {
  const gates = drafts.map((draft) => briefingGate(draft));
  const blockedActions = blockedExternalActions();
  return {
    mode: "local-private-briefing-decision-gates",
    localOnly: true,
    manualOnly: true,
    externalWriteCapability: false,
    allowedDecisions: ["reviewed-local-only", "deferred", "blocked", "promote-to-chief-draft-review"],
    blockedExternalActions: blockedActions,
    summary: {
      gates: gates.length,
      manualOnlyGates: gates.filter((gate) => gate.manualOnly && gate.externalWrite === false).length,
      blockedExternalActionSlots: gates.length * blockedActions.length,
      externalWritesEnabled: false,
    },
    policy:
      "Briefing gates can promote a brief only to local chief-draft review. They block sending, scheduling, submitting, approving, deploying, spending, syncing, and third-party mutation.",
    gates,
    verificationCommand: "npm run brief:private",
  };
}

function briefingGate(draft) {
  return {
    id: `briefing-gate.${draft.id}`,
    draftId: draft.id,
    label: draft.label,
    manualOnly: true,
    localOnly: true,
    externalWrite: false,
    allowedDecisions: ["reviewed-local-only", "deferred", "blocked", "promote-to-chief-draft-review"],
    blockedActions: blockedExternalActions(),
    replacementLocalAction: `Review ${draft.id} locally and promote only to chief-draft review if the verification command passes.`,
    localVerificationCommand: draft.verificationCommand,
    exitCriteria: draft.exitCriteria,
    sourceTrace: ["local-private-chief-of-staff-briefing-drafts", draft.id],
    status: "brief-review-only",
  };
}

function briefingChecks({ drafts, decisionGates, routeManifest, packageManifest }) {
  const privateRoutes = routeManifest.privateApiRoutes || null;
  const scripts = packageManifest.scripts || null;
  const checks = [
    check("brief-depth", drafts.length >= 3, "high", `${drafts.length} briefing draft(s).`, "Keep proof, opportunity, and artifact briefs available."),
    check("agenda-depth", drafts.every((draft) => draft.agenda.length > 0), "medium", `${drafts.reduce((sum, draft) => sum + draft.agenda.length, 0)} agenda item(s).`, "Attach at least one local agenda item to every briefing draft."),
    check("forbidden-actions", drafts.every((draft) => ["send-email", "submit-application", "deploy-production"].every((action) => draft.forbiddenActions.includes(action))), "high", "Every brief carries forbidden external actions.", "Attach external action prohibitions to every briefing draft."),
    check("verification-commands", drafts.every((draft) => draft.verificationCommand && draft.agenda.every((item) => item.verificationCommand)), "medium", `${drafts.filter((draft) => draft.verificationCommand).length}/${drafts.length} draft(s) with verification.`, "Attach verification commands to every draft and agenda item."),
    check("decision-gate-depth", decisionGates.summary.gates === drafts.length, "high", `${decisionGates.summary.gates}/${drafts.length} decision gate(s).`, "Attach one local decision gate to every briefing draft."),
    check("decision-gate-manual-only", decisionGates.externalWriteCapability === false && decisionGates.summary.manualOnlyGates === decisionGates.summary.gates, "high", `${decisionGates.summary.manualOnlyGates}/${decisionGates.summary.gates} manual-only gate(s).`, "Keep every briefing decision gate local-only and external-write disabled."),
    check("blocked-external-actions", ["send-email", "schedule-event", "submit-application", "approve-publication", "deploy-production", "mutate-third-party-system"].every((action) => decisionGates.blockedExternalActions.includes(action)), "high", `${decisionGates.summary.blockedExternalActionSlots} blocked external action slot(s).`, "Block every external side effect from private briefing drafts."),
  ];
  if (privateRoutes) {
    checks.push(
      check(
        "private-route-manifest",
        [ENDPOINT, `${ENDPOINT}/:id`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => privateRoutes.includes(route)),
        "high",
        `${[ENDPOINT, `${ENDPOINT}/:id`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => privateRoutes.includes(route)).length}/4 briefing draft private route(s).`,
        "Declare briefing draft report, selection, plan, and history routes in the private route manifest.",
      ),
    );
  }
  if (scripts) {
    checks.push(check("package-script", Boolean(scripts["brief:private"]), "high", `brief:private=${Boolean(scripts["brief:private"])}`, "Add the brief:private package script."));
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
    verificationCommand: id === "package-script" ? "npm run brief:private" : "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/briefing-drafts locally",
  };
}

function agendaItem({ priority, title, detail, source, verificationCommand }) {
  return {
    priority,
    title,
    detail,
    source,
    verificationCommand,
    reviewPrompt: "What evidence changes if this is completed, and how will the app prove it?",
  };
}

function statusRank(status) {
  return { weak: 1, review: 2, ready: 3 }[status] || 9;
}

function blockedExternalActions() {
  return [
    "send-email",
    "send-dm",
    "schedule-event",
    "create-calendar-event",
    "create-reminder",
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
  appendPrivateBriefingDraftReceipt,
  buildPrivateBriefingDrafts,
  privateBriefingDraftsPlan,
  readPrivateBriefingDraftReceipts,
  selectPrivateBriefingDraft,
};
