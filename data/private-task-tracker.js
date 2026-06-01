const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const STORE_RELATIVE_PATH = path.join("var", "private-task-store.json");
const RECEIPT_RELATIVE_PATH = path.join("var", "private-task-receipts.json");
const allowedStatuses = new Set(["open", "doing", "done", "archived"]);
const maxReceipts = 50;

function privateTaskTrackerPlan() {
  return {
    mode: "local-private-task-tracker-plan",
    command: "npm run tasks:private",
    endpoint: "/api/private/tasks",
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local task tracker endpoint, writes a local receipt under var/, and does not sync tasks, create calendar events, send messages, submit applications, approve publication, deploy, spend money, or mutate third-party systems.",
  };
}

function buildPrivateTaskTracker({ nextActionPlan, storeInfo, receipts = [] }) {
  const tasks = nextActionPlan.actions.map((action) => {
    const tracking = storeInfo.store.tasks[action.id] || defaultTracking();
    return {
      id: action.id,
      rank: action.rank,
      priority: action.priority,
      workstream: action.workstream,
      title: action.title,
      detail: action.detail,
      verificationCommand: action.verificationCommand,
      manualOnly: true,
      externalWrite: false,
      tracking,
    };
  });
  const auditLog = storeInfo.store.auditLog || [];
  const mutationGuard = privateTaskMutationGuard({ tasks, auditLog });
  const checks = trackerChecks({ tasks, storeInfo, mutationGuard });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "local-private-task-tracker",
    privacyBoundary:
      "This tracker is local/private and derived from the private next-action plan. It does not sync externally, create calendar events, send messages, or submit applications.",
    operatingPolicy:
      "Task status changes are local bookkeeping only. They cannot send, schedule, submit, approve, deploy, purchase, sync, or claim that an external outcome happened.",
    plan: privateTaskTrackerPlan(),
    storage: {
      relativePath: storeInfo.relativePath,
      exists: storeInfo.exists,
      localOnly: true,
      publicRoutesExposeStore: false,
    },
    counts: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      tasks: tasks.length,
      open: tasks.filter((task) => task.tracking.status === "open").length,
      doing: tasks.filter((task) => task.tracking.status === "doing").length,
      done: tasks.filter((task) => task.tracking.status === "done").length,
      archived: tasks.filter((task) => task.tracking.status === "archived").length,
      mutationLocks: mutationGuard.summary.locks,
      manualOnlyMutationLocks: mutationGuard.summary.manualOnlyLocks,
      blockedExternalActionSlots: mutationGuard.summary.blockedExternalActionSlots,
      auditLogEntries: auditLog.length,
      latestReceiptId: latestReceipt?.id || null,
    },
    mutationGuard,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    tasks,
    auditLog,
  };
}

function readPrivateTaskStore(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) {
    return { store: defaultPrivateTaskStore(), exists: false, relativePath: STORE_RELATIVE_PATH };
  }
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return { store: normalizeStore(parsed), exists: true, relativePath: STORE_RELATIVE_PATH };
  } catch {
    return { store: defaultPrivateTaskStore(), exists: true, relativePath: STORE_RELATIVE_PATH };
  }
}

function ensurePrivateTaskStore(root) {
  const storeInfo = readPrivateTaskStore(root);
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(storeInfo.store, null, 2)}\n`);
  return { ...storeInfo, exists: true };
}

function recordPrivateTaskStatus({ root, id, status, reviewer = "local-owner", note = "", nextActionPlan }) {
  if (!id || !allowedStatuses.has(status)) {
    const error = new Error("Invalid private task status update");
    error.statusCode = 400;
    throw error;
  }
  if (!nextActionPlan.actions.some((action) => action.id === id)) {
    const error = new Error("Unknown private task");
    error.statusCode = 404;
    throw error;
  }
  const storeInfo = ensurePrivateTaskStore(root);
  const previousStatus = storeInfo.store.tasks[id]?.status || "open";
  if (!transitionAllowed(previousStatus, status)) {
    const error = new Error("Invalid private task status transition");
    error.statusCode = 400;
    throw error;
  }
  const now = new Date().toISOString();
  storeInfo.store.tasks[id] = {
    status,
    reviewer: String(reviewer || "local-owner").slice(0, 80),
    note: String(note || "").slice(0, 500),
    updatedAt: now,
  };
  storeInfo.store.auditLog.unshift({
    id: `task-${Date.now()}`,
    taskId: id,
    previousStatus,
    status,
    reviewer: storeInfo.store.tasks[id].reviewer,
    note: storeInfo.store.tasks[id].note,
    updatedAt: now,
    localOnly: true,
    externalWrite: false,
    mutationPolicy: "local-private-task-status-only",
    blockedExternalActions: blockedExternalActions(),
  });
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  writeFileSync(storePath, `${JSON.stringify(storeInfo.store, null, 2)}\n`);
  return buildPrivateTaskTracker({
    nextActionPlan,
    storeInfo: { store: storeInfo.store, exists: true, relativePath: STORE_RELATIVE_PATH },
  });
}

function appendPrivateTaskReceipt(root, receipt) {
  const receipts = readPrivateTaskReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readPrivateTaskReceipts(root) {
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

function privateTaskMutationGuard({ tasks, auditLog }) {
  const locks = tasks.map((task) => taskMutationLock(task));
  const blockedActions = blockedExternalActions();
  return {
    mode: "local-private-task-mutation-guard",
    localOnly: true,
    manualOnly: true,
    statusWriteCapability: "local-json-store-only",
    externalWriteCapability: false,
    allowedStatuses: [...allowedStatuses],
    allowedTransitions: {
      open: ["open", "doing", "archived"],
      doing: ["doing", "done", "open", "archived"],
      done: ["done", "open", "archived"],
      archived: ["archived", "open"],
    },
    blockedExternalActions: blockedActions,
    summary: {
      locks: locks.length,
      manualOnlyLocks: locks.filter((lock) => lock.manualOnly && lock.externalWrite === false).length,
      blockedExternalActionSlots: locks.length * blockedActions.length,
      localAuditEntries: auditLog.length,
      invalidStatusEntries: tasks.filter((task) => !allowedStatuses.has(task.tracking.status)).length,
      externalWritesEnabled: false,
    },
    policy:
      "Task mutations can only update local JSON status metadata and append a local audit entry. The guard blocks task sync, reminders, messages, submissions, approvals, deployments, payments, and third-party writes.",
    locks,
    verificationCommand: "npm run tasks:private",
  };
}

function taskMutationLock(task) {
  return {
    id: `task-lock.${task.id}`,
    taskId: task.id,
    rank: task.rank,
    workstream: task.workstream,
    manualOnly: true,
    localOnly: true,
    externalWrite: false,
    allowedStatuses: [...allowedStatuses],
    blockedActions: blockedExternalActions(),
    replacementLocalAction: `Update ${task.id} only in ${STORE_RELATIVE_PATH}, then run its verification command before marking real progress.`,
    localVerificationCommand: task.verificationCommand,
    sourceTrace: ["local-private-task-tracker", task.id],
    status: "local-status-only",
  };
}

function trackerChecks({ tasks, storeInfo, mutationGuard }) {
  return [
    check("local-store", storeInfo.relativePath === STORE_RELATIVE_PATH && storeInfo.store && storeInfo.localOnly !== false, "high", storeInfo.relativePath, "Keep private task storage in the local var/ store."),
    check("task-depth", tasks.length >= 12, "medium", `${tasks.length} task(s).`, "Keep the private tracker populated from the next-action plan."),
    check("status-whitelist", tasks.every((task) => allowedStatuses.has(task.tracking.status)), "high", `${mutationGuard.summary.invalidStatusEntries} invalid status entrie(s).`, "Normalize private task statuses to the local whitelist."),
    check("verification-commands", tasks.every((task) => task.verificationCommand), "medium", `${tasks.filter((task) => task.verificationCommand).length}/${tasks.length} task(s) with verification.`, "Attach verification commands to every private task."),
    check("mutation-lock-depth", mutationGuard.summary.locks === tasks.length && mutationGuard.locks.every((lock) => lock.localVerificationCommand), "high", `${mutationGuard.summary.locks}/${tasks.length} mutation lock(s).`, "Attach one mutation lock to every private task."),
    check("mutation-lock-manual-only", mutationGuard.externalWriteCapability === false && mutationGuard.summary.manualOnlyLocks === mutationGuard.summary.locks, "high", `${mutationGuard.summary.manualOnlyLocks}/${mutationGuard.summary.locks} manual-only lock(s).`, "Keep task mutation locks local-only and external-write disabled."),
    check("blocked-external-actions", ["sync-task", "create-calendar-event", "send-email", "submit-application", "deploy-production", "mutate-third-party-system"].every((action) => mutationGuard.blockedExternalActions.includes(action)), "high", `${mutationGuard.summary.blockedExternalActionSlots} blocked external action slot(s).`, "Block every external task side effect from the local task tracker."),
    check("transition-policy", Object.keys(mutationGuard.allowedTransitions).every((status) => allowedStatuses.has(status)), "medium", `${Object.keys(mutationGuard.allowedTransitions).length} status transition bucket(s).`, "Keep task status transitions explicit and local-only."),
  ];
}

function check(id, passed, severity, detail, repairAction) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand: id === "local-store" ? "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/tasks locally" : "npm run tasks:private",
  };
}

function defaultTracking() {
  return {
    status: "open",
    reviewer: null,
    note: "",
    updatedAt: null,
  };
}

function defaultPrivateTaskStore() {
  return {
    tasks: {},
    auditLog: [],
  };
}

function normalizeStore(value) {
  return {
    tasks: normalizeTasks(value && typeof value.tasks === "object" ? value.tasks : {}),
    auditLog: Array.isArray(value?.auditLog) ? value.auditLog : [],
  };
}

function normalizeTasks(tasks) {
  return Object.fromEntries(
    Object.entries(tasks)
      .filter(([, tracking]) => tracking && typeof tracking === "object")
      .map(([id, tracking]) => [
        id,
        {
          status: allowedStatuses.has(tracking.status) ? tracking.status : "open",
          reviewer: typeof tracking.reviewer === "string" ? tracking.reviewer.slice(0, 80) : null,
          note: typeof tracking.note === "string" ? tracking.note.slice(0, 500) : "",
          updatedAt: typeof tracking.updatedAt === "string" ? tracking.updatedAt : null,
        },
      ]),
  );
}

function transitionAllowed(previousStatus, nextStatus) {
  const transitions = {
    open: ["open", "doing", "archived"],
    doing: ["doing", "done", "open", "archived"],
    done: ["done", "open", "archived"],
    archived: ["archived", "open"],
  };
  return transitions[previousStatus]?.includes(nextStatus) || false;
}

function blockedExternalActions() {
  return [
    "sync-task",
    "create-calendar-event",
    "create-reminder",
    "send-email",
    "send-dm",
    "submit-application",
    "approve-publication",
    "deploy-production",
    "spend-money",
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
  appendPrivateTaskReceipt,
  buildPrivateTaskTracker,
  defaultPrivateTaskStore,
  ensurePrivateTaskStore,
  privateTaskTrackerPlan,
  readPrivateTaskReceipts,
  readPrivateTaskStore,
  recordPrivateTaskStatus,
};
