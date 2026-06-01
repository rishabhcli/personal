const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const STORE_RELATIVE_PATH = path.join("var", "private-priority-receipts.json");
const ENDPOINT = "/api/private/priorities";
const maxReceipts = 50;

function privatePrioritizationPlan() {
  return {
    mode: "local-private-chief-of-staff-prioritization-plan",
    command: "npm run prioritize:private",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local priority endpoint, writes a local receipt under var/, and does not read inboxes, calendars, private documents, credentials, portals, or mutate external systems.",
  };
}

function buildPrivatePrioritizationReport({
  chiefReadiness,
  nextActionPlan,
  taskTracker,
  schedule,
  reviewSessions,
  briefingDrafts,
  privacyApprovalAudit,
  outreachDrafts,
  artifactGapRepair = null,
  routeManifest,
  packageManifest,
  receipts = [],
}) {
  const priorityItems = prioritizeItems({
    chiefReadiness,
    nextActionPlan,
    taskTracker,
    schedule,
    reviewSessions,
    briefingDrafts,
    privacyApprovalAudit,
    outreachDrafts,
    artifactGapRepair,
  });
  const decisionLanes = laneGroups(priorityItems);
  const executionFirewall = privateExecutionFirewall({ priorityItems, decisionLanes });
  const checks = reportChecks({ priorityItems, decisionLanes, executionFirewall, schedule, artifactGapRepair, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "local-private-chief-of-staff-prioritization",
    privacyBoundary:
      "This priority report is local/private and derives from public-safe metadata, local planning stores, and gated chief-of-staff outputs. It does not expose private documents, emails, calendars, credentials, school portals, external application state, or raw private artifacts.",
    operatingPolicy:
      "The report may rank local work only. It must not send messages, schedule events, submit applications, approve publication, deploy production, spend money, contact third parties, or mark external outcomes as real.",
    plan: privatePrioritizationPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      priorityItems: priorityItems.length,
      lanes: decisionLanes.length,
      immediateItems: decisionLanes.find((lane) => lane.id === "now")?.items.length || 0,
      lanesCovered: new Set(priorityItems.map((item) => item.laneId)).size,
      topScore: priorityItems[0]?.score || 0,
      pendingApprovals: privacyApprovalAudit.counts.pending,
      outreachDrafts: outreachDrafts.drafts.length,
      artifactGapRepairItems: artifactGapRepair?.summary?.repairItems || 0,
      artifactGapRepairPriorities: priorityItems.filter((item) => item.kind === "artifact-gap-proof-repair").length,
      scheduleBlocks: schedule.schedule.length,
      executionLocks: executionFirewall.locks.length,
      manualOnlyExecutionLocks: executionFirewall.summary.manualOnlyLocks,
      blockedExternalActionSlots: executionFirewall.summary.blockedExternalActionSlots,
      replacementLocalActions: executionFirewall.summary.replacementLocalActions,
      externalWritesEnabled: false,
      reviewRequired: true,
      latestReceiptId: latestReceipt?.id || null,
    },
    decisionLanes,
    executionFirewall,
    priorityItems,
    topPriority: priorityItems[0] || null,
    todayFocus: todayFocus({ priorityItems, schedule }),
    guardrails: [
      "Pick at most one now-lane item before expanding scope.",
      "Treat every item as manual-only local planning until Rishabh acts outside the app.",
      "Run the item verification command before marking any underlying task done.",
      "If an item touches private material, keep the public projection withheld or summary-only until approval.",
      "Treat the execution firewall replacement action as the only app-side action; any real-world send, schedule, submit, approve, deploy, or payment stays human-only outside the app.",
    ],
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nextAction: failing[0]?.repairAction || priorityItems[0]?.objective || "Review the top local/private priority and run its verification command.",
    verificationCommand: "npm run prioritize:private && npm run check && npm run verify",
  };
}

function appendPrivatePrioritizationReceipt(root, receipt) {
  const receipts = readPrivatePrioritizationReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readPrivatePrioritizationReceipts(root) {
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

function prioritizeItems(inputs) {
  const scored = dedupe([
    ...actionItems(inputs.nextActionPlan.actions || []),
    ...taskItems(inputs.taskTracker.tasks || []),
    ...scheduleItems(inputs.schedule.schedule || []),
    ...reviewItems(inputs.reviewSessions.sessions || []),
    ...briefItems(inputs.briefingDrafts.drafts || []),
    ...privacyItems(inputs.privacyApprovalAudit.approvalQueue || []),
    ...outreachItems(inputs.outreachDrafts.drafts || []),
    ...artifactGapRepairItems(inputs.artifactGapRepair?.repairQueue || []),
    ...laneItems(inputs.chiefReadiness.lanes || []),
  ])
    .map((item) => ({
      ...item,
      score: priorityScore(item),
      manualOnly: true,
      externalWrite: false,
      reviewRequired: true,
      forbiddenActions: forbiddenActions(),
      decisionRule: "Promote only after manual review and command-backed verification.",
    }))
    .sort((left, right) => right.score - left.score || priorityRank(right.priority) - priorityRank(left.priority) || left.id.localeCompare(right.id));
  const requiredLanes = ["proof-repair", "privacy-approval", "review-sessions", "briefing-drafts", "outreach-draft-review"];
  const selected = ensureKindCoverage(ensureLaneCoverage(scored, requiredLanes, 24), scored, "artifact-gap-proof-repair", requiredLanes, 24);
  return selected.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

function artifactGapRepairItems(items) {
  return items.slice(0, 8).map((item) => ({
    id: `artifact-gap-repair.${item.gapId}`,
    kind: "artifact-gap-proof-repair",
    priority: item.priority,
    laneId: "proof-repair",
    title: `Repair ${item.projectTitle || item.gapId} proof gap`,
    objective: item.nextAction,
    source: "artifact-gap-proof-repair",
    effort: item.priority === "high" ? "medium" : "small",
    impactScore: item.unlockScore || 72,
    statusSignal: `${item.opportunityUnlockCount || 0} opportunity unlock(s), ${item.deRiskAdvanceCount || 0} de-risk advance(s)`,
    sourceTrace: [
      "artifact-gap-proof-repair",
      item.gapId,
      ...(item.linkedOpportunityIds || []).slice(0, 3),
      ...(item.linkedDeRiskPlanIds || []).slice(0, 3),
    ],
    verificationCommand: item.verificationCommand,
  }));
}

function actionItems(actions) {
  return actions.map((action) => ({
    id: `action.${action.id}`,
    kind: "next-action",
    priority: action.priority,
    laneId: laneForWorkstream(action.workstream),
    title: action.title,
    objective: action.detail,
    source: action.source,
    effort: action.effort,
    impactScore: action.impactScore || 50,
    statusSignal: "open",
    sourceTrace: ["local-private-next-action-plan", action.id],
    verificationCommand: action.verificationCommand,
  }));
}

function taskItems(tasks) {
  return tasks
    .filter((task) => task.tracking.status !== "done" && task.tracking.status !== "archived")
    .map((task) => ({
      id: `task.${task.id}`,
      kind: "private-task",
      priority: task.priority,
      laneId: laneForWorkstream(task.workstream),
      title: task.title,
      objective: task.detail,
      source: task.workstream,
      effort: "small",
      impactScore: task.priority === "high" ? 86 : 64,
      statusSignal: task.tracking.status,
      sourceTrace: ["local-private-task-tracker", task.id],
      verificationCommand: task.verificationCommand,
    }));
}

function scheduleItems(blocks) {
  return blocks.slice(0, 10).map((block) => ({
    id: `schedule.${block.id}`,
    kind: "schedule-block",
    priority: block.kind === "lane-triage" ? "high" : "medium",
    laneId: block.laneId || "review-sessions",
    title: block.title,
    objective: block.objective,
    source: block.kind,
    effort: block.minutes <= 25 ? "small" : "medium",
    impactScore: Math.min(92, 55 + block.minutes),
    statusSignal: block.day,
    sourceTrace: ["local-private-chief-of-staff-schedule", block.id, ...block.sourceTrace.slice(0, 2)],
    verificationCommand: block.verificationCommand,
  }));
}

function reviewItems(sessions) {
  return sessions.map((session) => ({
    id: `review.${session.id}`,
    kind: "review-session",
    priority: session.items.some((item) => item.priority === "high") ? "high" : "medium",
    laneId: laneForSession(session.id),
    title: session.label,
    objective: session.goal,
    source: "local-private-review-sessions",
    effort: session.durationMinutes <= 25 ? "small" : "medium",
    impactScore: Math.min(90, 55 + session.items.length * 5),
    statusSignal: `${session.items.length} item(s)`,
    sourceTrace: ["local-private-review-sessions", session.id],
    verificationCommand: session.verificationCommand,
  }));
}

function briefItems(drafts) {
  return drafts.map((draft) => ({
    id: `brief.${draft.id}`,
    kind: "briefing-draft",
    priority: draft.agenda.some((item) => item.priority === "high") ? "high" : "medium",
    laneId: laneForBrief(draft),
    title: draft.label,
    objective: draft.objective,
    source: "local-private-chief-of-staff-briefing-drafts",
    effort: draft.estimatedMinutes <= 25 ? "small" : "medium",
    impactScore: Math.min(88, 50 + draft.agenda.length * 6),
    statusSignal: draft.cadence,
    sourceTrace: ["local-private-chief-of-staff-briefing-drafts", draft.id, ...draft.sourceTrace.slice(0, 2)],
    verificationCommand: draft.verificationCommand,
  }));
}

function privacyItems(items) {
  return items.slice(0, 8).map((item) => ({
    id: `privacy.${item.id}`,
    kind: "privacy-approval",
    priority: "high",
    laneId: "privacy-approval",
    title: item.label,
    objective: item.requiredApproval,
    source: "local-privacy-approval-audit",
    effort: "small",
    impactScore: 90,
    statusSignal: item.decision,
    sourceTrace: ["local-privacy-approval-audit", item.id],
    verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/approvals locally",
  }));
}

function outreachItems(drafts) {
  return drafts
    .filter((draft) => draft.tracking.status !== "archived" && draft.tracking.status !== "used")
    .slice(0, 8)
    .map((draft) => ({
      id: `outreach.${draft.id}`,
      kind: "outreach-draft",
      priority: draft.tracking.status === "reviewing" ? "high" : "medium",
      laneId: "outreach-draft-review",
      title: draft.subject,
      objective: draft.suggestedNextAction,
      source: "local-private-outreach-drafts",
      effort: "small",
      impactScore: 72,
      statusSignal: draft.tracking.status,
      sourceTrace: ["local-private-outreach-drafts", draft.id],
      verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/outreach-drafts locally",
    }));
}

function laneItems(lanes) {
  return lanes.map((lane) => ({
    id: `lane.${lane.id}`,
    kind: "chief-lane",
    priority: lane.queueCount > 0 ? "high" : "medium",
    laneId: lane.id,
    title: lane.label,
    objective: lane.nextAction,
    source: "local-private-chief-of-staff-readiness",
    effort: "small",
    impactScore: Math.max(40, 100 - lane.score + lane.queueCount),
    statusSignal: lane.band,
    sourceTrace: ["local-private-chief-of-staff-readiness", lane.id],
    verificationCommand: lane.verificationCommand,
  }));
}

function laneGroups(priorityItems) {
  return [
    laneGroup("now", "Do now", priorityItems.slice(0, 5)),
    laneGroup("next", "Queue next", priorityItems.slice(5, 13)),
    laneGroup("later", "Hold for later", priorityItems.slice(13, 24)),
  ];
}

function laneGroup(id, label, items) {
  return {
    id,
    label,
    items,
    score: items.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 0,
    manualOnly: true,
    externalWrite: false,
  };
}

function todayFocus({ priorityItems, schedule }) {
  const top = priorityItems[0];
  const scheduleBlock = top ? schedule.schedule.find((block) => block.laneId === top.laneId) || schedule.schedule[0] : null;
  return {
    priorityId: top?.id || null,
    laneId: top?.laneId || null,
    scheduleBlockId: scheduleBlock?.id || null,
    minutes: scheduleBlock?.minutes || 25,
    objective: top?.objective || "Review one local private priority.",
    verificationCommand: top?.verificationCommand || "npm run check",
    writePolicy: "manual-only local planning; no external write is performed",
  };
}

function privateExecutionFirewall({ priorityItems, decisionLanes }) {
  const locks = priorityItems.map((item) => executionLock(item));
  const blockedExternalActions = [...new Set(locks.flatMap((lock) => lock.blockedActions))].sort();
  return {
    mode: "local-private-priority-execution-firewall",
    localOnly: true,
    manualOnly: true,
    externalWriteCapability: false,
    endpoint: ENDPOINT,
    protectedPriorityItems: priorityItems.length,
    protectedDecisionLanes: decisionLanes.length,
    blockedExternalActions,
    summary: {
      locks: locks.length,
      manualOnlyLocks: locks.filter((lock) => lock.manualOnly && lock.externalWrite === false).length,
      replacementLocalActions: locks.filter((lock) => lock.replacementLocalAction && lock.localVerificationCommand).length,
      humanOnlyHandoffs: locks.filter((lock) => lock.humanOnlyHandoff === true).length,
      blockedExternalActionSlots: locks.reduce((sum, lock) => sum + lock.blockedActions.length, 0),
      externalWritesEnabled: false,
    },
    policy:
      "The firewall can rank and explain local work, but it cannot send, schedule, submit, approve, deploy, purchase, mutate third-party systems, or claim external outcomes. Each lock replaces external automation with a local verification command and a human-only handoff.",
    locks,
    verificationCommand: "npm run prioritize:private",
  };
}

function executionLock(item) {
  const blockedActions = [
    ...new Set([
      ...item.forbiddenActions,
      "create-calendar-event",
      "create-reminder",
      "auto-open-portal",
      "mutate-third-party-system",
      "mark-external-outcome-real",
    ]),
  ];
  return {
    id: `lock.${item.id}`,
    priorityId: item.id,
    rank: item.rank,
    laneId: item.laneId,
    kind: item.kind,
    manualOnly: true,
    localOnly: true,
    externalWrite: false,
    requiresHumanStart: true,
    humanOnlyHandoff: true,
    blockedActions,
    blockedActionCount: blockedActions.length,
    replacementLocalAction: `Review ${item.id} locally and run its verification command before any human action outside the app.`,
    localVerificationCommand: item.verificationCommand,
    sourceTrace: ["local-private-priority-execution-firewall", ...item.sourceTrace.slice(0, 3)],
    status: "locked-until-human-review",
  };
}

function reportChecks({ priorityItems, decisionLanes, executionFirewall, schedule, artifactGapRepair, routeManifest, packageManifest }) {
  const privateRoutes = routeManifest.privateApiRoutes || [];
  const scripts = packageManifest.scripts || {};
  const laneIds = new Set(priorityItems.map((item) => item.laneId));
  const checks = [
    check("local-private-route", privateRoutes.includes(ENDPOINT), "high", `${ENDPOINT} route declared=${privateRoutes.includes(ENDPOINT)}.`, "Declare /api/private/priorities in the private route manifest."),
    check("priority-depth", priorityItems.length >= 18 && decisionLanes.every((lane) => lane.items.length > 0), "high", `${priorityItems.length} priority item(s), ${decisionLanes.length} lane(s).`, "Generate enough private priorities to fill now, next, and later lanes."),
    check("lane-coverage", laneIds.size >= 5, "high", `${laneIds.size} lane(s) covered.`, "Cover proof, privacy, reviews, briefs, and outreach lanes in the priority stack."),
    check("schedule-alignment", priorityItems.slice(0, 5).every((item) => schedule.schedule.some((block) => block.laneId === item.laneId)), "medium", "Top five priorities should map to existing local schedule lanes.", "Align top priorities with local schedule blocks."),
    check("manual-only-guard", priorityItems.every((item) => item.manualOnly && item.externalWrite === false && item.reviewRequired), "high", "Every priority item is local-only, manual-only, and review-required.", "Keep private priorities local-only and write-disabled."),
    check("forbidden-actions", priorityItems.every((item) => ["send-email", "schedule-event", "submit-application", "deploy-production"].every((action) => item.forbiddenActions.includes(action))), "high", "Every priority item carries forbidden external actions.", "Attach forbidden action guardrails to every priority item."),
    check("verification-commands", priorityItems.every((item) => item.verificationCommand), "medium", `${priorityItems.filter((item) => item.verificationCommand).length}/${priorityItems.length} item(s) with verification.`, "Attach verification commands to every private priority."),
    check(
      "execution-firewall-depth",
      executionFirewall.protectedPriorityItems === priorityItems.length && executionFirewall.protectedDecisionLanes === decisionLanes.length && executionFirewall.locks.length === priorityItems.length,
      "high",
      `${executionFirewall.locks.length}/${priorityItems.length} priority execution lock(s), ${executionFirewall.protectedDecisionLanes}/${decisionLanes.length} decision lane(s).`,
      "Wrap every private priority and decision lane in the execution firewall.",
    ),
    check(
      "execution-lock-manual-only",
      executionFirewall.externalWriteCapability === false &&
        executionFirewall.summary.manualOnlyLocks === executionFirewall.locks.length &&
        executionFirewall.locks.every((lock) => lock.manualOnly === true && lock.localOnly === true && lock.externalWrite === false && lock.humanOnlyHandoff === true),
      "high",
      `${executionFirewall.summary.manualOnlyLocks}/${executionFirewall.locks.length} manual-only lock(s).`,
      "Keep every execution lock local-only, write-disabled, and human-handoff-only.",
    ),
    check(
      "blocked-external-action-slots",
      executionFirewall.summary.blockedExternalActionSlots >= priorityItems.length * 8 &&
        ["send-email", "schedule-event", "submit-application", "deploy-production", "mutate-third-party-system"].every((action) => executionFirewall.blockedExternalActions.includes(action)),
      "high",
      `${executionFirewall.summary.blockedExternalActionSlots} blocked external action slot(s).`,
      "Attach broad blocked external actions to every priority execution lock.",
    ),
    check(
      "replacement-local-actions",
      executionFirewall.summary.replacementLocalActions === executionFirewall.locks.length &&
        executionFirewall.locks.every((lock) => lock.replacementLocalAction && lock.localVerificationCommand && lock.status === "locked-until-human-review"),
      "medium",
      `${executionFirewall.summary.replacementLocalActions}/${executionFirewall.locks.length} replacement local action(s).`,
      "Give every lock a local replacement action and verification command instead of external automation.",
    ),
    check("package-script", Boolean(scripts["prioritize:private"]), "high", `prioritize:private=${Boolean(scripts["prioritize:private"])}`, "Add the prioritize:private package script."),
  ];
  if (artifactGapRepair) {
    checks.push(
      check(
        "artifact-gap-repair-priorities",
        priorityItems.some((item) => item.kind === "artifact-gap-proof-repair" && item.laneId === "proof-repair") &&
          priorityItems
            .filter((item) => item.kind === "artifact-gap-proof-repair")
            .every((item) => item.manualOnly && item.externalWrite === false && item.verificationCommand),
        "high",
        `${priorityItems.filter((item) => item.kind === "artifact-gap-proof-repair").length} artifact gap repair priority item(s).`,
        "Route artifact gap repair queue items into local/private proof-repair priorities.",
      ),
    );
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
    verificationCommand: id === "package-script" ? "npm run prioritize:private" : "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/priorities locally",
  };
}

function priorityScore(item) {
  const priority = { high: 42, medium: 28, low: 14 }[item.priority] || 12;
  const effortBoost = item.effort === "small" ? 10 : item.effort === "medium" ? 5 : 0;
  const statusBoost = item.statusSignal === "doing" || item.statusSignal === "reviewing" || item.statusSignal === "pending" ? 10 : 4;
  const verificationBoost = item.verificationCommand ? 8 : 0;
  return clamp(Math.round(priority + item.impactScore * 0.35 + effortBoost + statusBoost + verificationBoost), 0, 100);
}

function laneForWorkstream(workstream) {
  if (["privacy-approval"].includes(workstream)) return "privacy-approval";
  if (["artifact-wall", "claim-ledger", "evidence-maintenance", "proof-trials"].includes(workstream)) return "proof-repair";
  if (["opportunity-fit"].includes(workstream)) return "outreach-draft-review";
  if (["audience-packets", "self-review"].includes(workstream)) return "review-sessions";
  return "briefing-drafts";
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

function dedupe(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function ensureLaneCoverage(sorted, requiredLanes, limit) {
  const selected = sorted.slice(0, limit);
  const selectedIds = new Set(selected.map((item) => item.id));
  const covered = new Set(selected.map((item) => item.laneId));
  const protectedIds = new Set();
  for (const laneId of requiredLanes) {
    const existing = selected.find((item) => item.laneId === laneId);
    if (existing) protectedIds.add(existing.id);
  }
  for (const laneId of requiredLanes) {
    if (covered.has(laneId)) continue;
    const candidate = sorted.find((item) => item.laneId === laneId && !selectedIds.has(item.id));
    if (!candidate) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
    covered.add(laneId);
    protectedIds.add(candidate.id);
  }
  const ordered = selected.sort((left, right) => right.score - left.score || priorityRank(right.priority) - priorityRank(left.priority) || left.id.localeCompare(right.id));
  while (ordered.length > limit) {
    const removeIndex = findLastIndex(ordered, (item) => !protectedIds.has(item.id));
    ordered.splice(removeIndex >= 0 ? removeIndex : ordered.length - 1, 1);
  }
  return ordered;
}

function ensureKindCoverage(selected, sorted, kind, requiredLanes, limit) {
  if (selected.some((item) => item.kind === kind)) return selected;
  const candidate = sorted.find((item) => item.kind === kind);
  if (!candidate) return selected;
  const selectedIds = new Set(selected.map((item) => item.id));
  if (selectedIds.has(candidate.id)) return selected;
  const replacementIndex = findLastIndex(selected, (item) => item.laneId === candidate.laneId && item.kind !== kind);
  const next = selected.slice();
  if (replacementIndex >= 0) {
    next.splice(replacementIndex, 1, candidate);
  } else if (next.length >= limit) {
    const removableIndex = findLastIndex(next, (item) => !requiredLanes.includes(item.laneId));
    next.splice(removableIndex >= 0 ? removableIndex : next.length - 1, 1, candidate);
  } else {
    next.push(candidate);
  }
  return next.sort((left, right) => right.score - left.score || priorityRank(right.priority) - priorityRank(left.priority) || left.id.localeCompare(right.id));
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function forbiddenActions() {
  return ["send-email", "send-dm", "schedule-event", "submit-application", "approve-publication", "deploy-production", "spend-money"];
}

function priorityRank(priority) {
  return { low: 1, medium: 2, high: 3 }[priority] || 0;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  appendPrivatePrioritizationReceipt,
  buildPrivatePrioritizationReport,
  privatePrioritizationPlan,
  readPrivatePrioritizationReceipts,
};
