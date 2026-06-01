const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const RECEIPT_RELATIVE_PATH = path.join("var", "private-next-action-receipts.json");
const maxReceipts = 50;

function privateNextActionsPlan() {
  return {
    mode: "local-private-next-action-plan-recorder",
    command: "npm run plan:private",
    endpoint: "/api/private/next-actions",
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local next-action endpoint, writes a local receipt under var/, and does not execute tasks, send messages, submit forms, create calendar events, deploy, pay, sync tasks, open portals, approve publication, or mutate third-party systems.",
  };
}

function buildPrivateNextActionPlan({
  projects,
  claims,
  maintenance,
  opportunities,
  packets,
  selfReviews,
  artifactCatalog,
  proofTrials,
  privacyApprovalAudit,
  routeManifest = {},
  packageManifest = {},
  receipts = [],
}) {
  const actions = [
    ...maintenanceActions(maintenance),
    ...privacyActions(privacyApprovalAudit),
    ...packetActions(packets),
    ...opportunityActions(opportunities),
    ...selfReviewActions(selfReviews),
    ...artifactActions(artifactCatalog),
    ...proofTrialActions(proofTrials),
    ...evidenceGapActions(projects, claims),
  ];
  const prioritized = dedupeActions(actions)
    .sort((left, right) => priorityRank(right.priority) - priorityRank(left.priority) || right.impactScore - left.impactScore)
    .slice(0, 18)
    .map((action, index) => ({
      ...action,
      rank: index + 1,
      manualOnly: true,
      localOnly: true,
      externalWrite: false,
      forbiddenActions: blockedExternalActions(),
    }));
  const actionExecutionLocks = privateNextActionExecutionLocks(prioritized);
  const checks = privateNextActionChecks({ prioritized, actionExecutionLocks, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    mode: "local-private-next-action-plan",
    generatedAt: new Date().toISOString(),
    privacyBoundary:
      "This plan is for localhost/private cockpit use only. It derives from public-safe metadata, local approval state, and generated review data; it must not expose credentials, private documents, inbox content, or automatic outreach.",
    planningInputs: {
      projects: projects.length,
      claims: claims.length,
      maintenanceIssues: maintenance.summary.issues,
      opportunities: opportunities.opportunities.length,
      packets: packets.packets.length,
      selfReviewReports: selfReviews.reports.length,
      artifactGaps: artifactCatalog.gaps.length,
      proofTrials: proofTrials.summary.totalTrials,
      pendingPrivacyApprovals: privacyApprovalAudit.counts.pending,
    },
    plan: privateNextActionsPlan(),
    goals: [
      "Increase public proof density without leaking private material.",
      "Turn weak claims into source-backed or link-backed evidence.",
      "Prepare audience-specific packets only when uncertainty is disclosed.",
      "Keep local receipts fresh enough that the public portfolio can explain itself.",
      "Protect against uncontrolled writes, automatic outreach, and credential use.",
    ],
    actions: prioritized,
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      totalActions: prioritized.length,
      highPriority: prioritized.filter((action) => action.priority === "high").length,
      mediumPriority: prioritized.filter((action) => action.priority === "medium").length,
      lowPriority: prioritized.filter((action) => action.priority === "low").length,
      estimatedSmallActions: prioritized.filter((action) => action.effort === "small").length,
      actionExecutionLocks: actionExecutionLocks.summary.locks,
      manualOnlyActionExecutionLocks: actionExecutionLocks.summary.manualOnlyLocks,
      blockedExternalActionSlots: actionExecutionLocks.summary.blockedExternalActionSlots,
      replacementLocalActions: actionExecutionLocks.summary.replacementLocalActions,
      externalWritesEnabled: actionExecutionLocks.summary.externalWritesEnabled,
      latestReceiptId: latestReceipt?.id || null,
    },
    actionExecutionLocks,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
  };
}

function appendPrivateNextActionReceipt(root, receipt) {
  const receipts = readPrivateNextActionReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readPrivateNextActionReceipts(root) {
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

function privateNextActionExecutionLocks(actions) {
  const locks = actions.map((action) => privateNextActionExecutionLock(action));
  const blockedActions = blockedExternalActions();
  return {
    mode: "local-private-next-action-execution-locks",
    localOnly: true,
    manualOnly: true,
    externalWriteCapability: false,
    taskExecutionCapability: false,
    blockedExternalActions: blockedActions,
    summary: {
      locks: locks.length,
      manualOnlyLocks: locks.filter((lock) => lock.manualOnly && lock.localOnly && lock.externalWrite === false).length,
      blockedExternalActionSlots: locks.length * blockedActions.length,
      replacementLocalActions: locks.filter((lock) => lock.replacementLocalAction).length,
      externalWritesEnabled: false,
      executableActions: 0,
    },
    policy:
      "Next actions are planning objects only. They cannot execute tasks, send outreach, submit applications, create calendar events, deploy, pay, sync tasks, approve publication, open portals, or mutate third-party systems.",
    locks,
    verificationCommand: "npm run plan:private",
  };
}

function privateNextActionExecutionLock(action) {
  return {
    id: `next-action-lock.${action.id}`,
    actionId: action.id,
    rank: action.rank,
    workstream: action.workstream,
    priority: action.priority,
    manualOnly: true,
    localOnly: true,
    externalWrite: false,
    executable: false,
    blockedActions: blockedExternalActions(),
    replacementLocalAction: `Review ${action.id} locally; execute any real-world work manually outside this app after verification.`,
    localVerificationCommand: action.verificationCommand || "npm run check",
    sourceTrace: ["local-private-next-action-plan", action.source, action.id],
    status: "planning-only",
  };
}

function privateNextActionChecks({ prioritized, actionExecutionLocks, routeManifest, packageManifest }) {
  const privateRoutes = routeManifest.privateApiRoutes || null;
  const scripts = packageManifest.scripts || null;
  const requiredBlockedActions = ["send-email", "submit-application", "create-calendar-event", "deploy-production", "sync-task", "mutate-third-party-system"];
  const checks = [
    check("planning-depth", prioritized.length >= 12, "medium", `${prioritized.length} ranked private action(s).`, "Keep the private planner deep enough to feed downstream task/review systems."),
    check("action-verification-commands", prioritized.every((action) => action.verificationCommand), "medium", `${prioritized.filter((action) => action.verificationCommand).length}/${prioritized.length} action verification command(s).`, "Every private next action must tell the operator how to verify it locally."),
    check("planning-only-actions", prioritized.every((action) => action.manualOnly === true && action.localOnly === true && action.externalWrite === false), "high", `${prioritized.length} action(s) marked local/manual-only.`, "Keep generated next actions as local planning objects, not executable automation."),
    check("execution-lock-depth", actionExecutionLocks.summary.locks === prioritized.length, "high", `${actionExecutionLocks.summary.locks}/${prioritized.length} execution lock(s).`, "Attach one execution lock to every private next action."),
    check(
      "execution-lock-manual-only",
      actionExecutionLocks.externalWriteCapability === false &&
        actionExecutionLocks.taskExecutionCapability === false &&
        actionExecutionLocks.summary.manualOnlyLocks === actionExecutionLocks.summary.locks &&
        actionExecutionLocks.summary.executableActions === 0,
      "high",
      `${actionExecutionLocks.summary.manualOnlyLocks}/${actionExecutionLocks.summary.locks} manual-only lock(s); executable=${actionExecutionLocks.summary.executableActions}.`,
      "Keep every next-action lock manual-only and execution-disabled.",
    ),
    check(
      "blocked-external-actions",
      requiredBlockedActions.every((action) => actionExecutionLocks.blockedExternalActions.includes(action)),
      "high",
      `${actionExecutionLocks.summary.blockedExternalActionSlots} blocked external action slot(s).`,
      "Block outreach, submissions, calendar writes, deploys, task sync, and third-party mutation from next-action planning.",
    ),
  ];
  if (privateRoutes) {
    checks.push(
      check(
        "private-route-manifest",
        ["/api/private/next-actions", "/api/private/next-actions/plan", "/api/private/next-actions/history"].every((route) => privateRoutes.includes(route)),
        "high",
        `${["/api/private/next-actions", "/api/private/next-actions/plan", "/api/private/next-actions/history"].filter((route) => privateRoutes.includes(route)).length}/3 next-action private route(s).`,
        "Declare next-action report, plan, and history routes in the private route manifest.",
      ),
    );
  }
  if (scripts) {
    checks.push(check("package-script", Boolean(scripts["plan:private"]), "high", `plan:private=${Boolean(scripts["plan:private"])}`, "Add the plan:private package script."));
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
    verificationCommand: id === "package-script" ? "npm run plan:private" : "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/next-actions locally",
  };
}

function maintenanceActions(maintenance) {
  return maintenance.issues.slice(0, 8).map((issue) => ({
    id: `maintenance.${issue.id}`,
    priority: issue.severity === "high" ? "high" : "medium",
    workstream: "evidence-maintenance",
    title: issue.title,
    detail: issue.suggestedFix,
    source: "maintenance-report",
    impactScore: issue.severity === "high" ? 92 : 74,
    effort: issue.type === "artifact-gap" ? "medium" : "small",
    verificationCommand: issue.verificationCommand,
  }));
}

function privacyActions(privacyApprovalAudit) {
  return privacyApprovalAudit.approvalQueue.slice(0, 5).map((item) => ({
    id: `privacy.${item.id}`,
    priority: "high",
    workstream: "privacy-approval",
    title: `Review private projection candidate: ${item.label}`,
    detail: `${item.requiredApproval}; current public projection is ${item.publicProjection}.`,
    source: "privacy-approval-audit",
    impactScore: 88,
    effort: "small",
    verificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then open /api/private/approvals locally",
  }));
}

function packetActions(packets) {
  return packets.packets
    .filter((packet) => packet.uncertaintyDisclosure.confidenceScore < 65)
    .map((packet) => ({
      id: `packet.${packet.id}`,
      priority: "medium",
      workstream: "audience-packets",
      title: `Raise ${packet.label} confidence`,
      detail: packet.nextActions[0],
      source: "audience-packets",
      impactScore: 70 - packet.uncertaintyDisclosure.confidenceScore,
      effort: "medium",
      verificationCommand: `npm run check && node server.js # then open /api/packets/${packet.id}`,
    }));
}

function opportunityActions(opportunities) {
  return opportunities.nextActions.slice(0, 5).map((item) => ({
    id: `opportunity.${item.id}`,
    priority: "medium",
    workstream: "opportunity-fit",
    title: `Prepare opportunity packet: ${item.id}`,
    detail: item.action,
    source: "opportunity-radar",
    impactScore: 68,
    effort: item.missingProof?.length ? "medium" : "small",
    verificationCommand: "npm run check && node server.js # then open /api/opportunities",
  }));
}

function selfReviewActions(selfReviews) {
  const weekly = selfReviews.reports.find((report) => report.id === "weekly");
  return (weekly?.nextActions || []).slice(0, 4).map((action) => ({
    id: `review.${action.source}.${slugify(action.reason)}`,
    priority: action.priority,
    workstream: "self-review",
    title: `Act on weekly review: ${action.reason}`,
    detail: action.action,
    source: "self-review",
    impactScore: action.priority === "high" ? 86 : 62,
    effort: "small",
    verificationCommand: action.verificationCommand,
  }));
}

function artifactActions(artifactCatalog) {
  return (artifactCatalog.gaps || []).slice(0, 5).map((gap) => ({
    id: `artifact.${gap.id}`,
    priority: "low",
    workstream: "artifact-wall",
    title: gap.label,
    detail: gap.suggestedRepair,
    source: "artifact-catalog",
    impactScore: 50,
    effort: "medium",
    verificationCommand: "npm run audit:visual && npm run check",
  }));
}

function proofTrialActions(proofTrials) {
  if (proofTrials.summary.writeEnabledTrials === 0) return [];
  return [
    {
      id: "proof-trials.disable-writes",
      priority: "high",
      workstream: "proof-trials",
      title: "Disable write-enabled proof trials",
      detail: "Proof trials must remain read-only unless a separate approval gate exists.",
      source: "proof-trials",
      impactScore: 99,
      effort: "small",
      verificationCommand: "npm run check && node server.js # then open /api/proof-trials",
    },
  ];
}

function evidenceGapActions(projects, claims) {
  const projectBySlug = new Map(projects.map((project) => [project.slug, project]));
  return claims
    .filter((claim) => claim.evidenceStrength === "needs-source")
    .slice(0, 6)
    .map((claim) => {
      const project = projectBySlug.get(claim.relatedProject);
      return {
        id: `claim.${claim.id}`,
        priority: "medium",
        workstream: "claim-ledger",
        title: `Attach source for ${claim.id}`,
        detail: claim.suggestedRepair,
        source: "claim-ledger",
        impactScore: project ? project.score : 45,
        effort: "small",
        verificationCommand: claim.relatedProject ? `npm run check && node server.js # then open /api/evidence/${claim.relatedProject}` : "npm run check",
      };
    });
}

function dedupeActions(actions) {
  const seen = new Set();
  const result = [];
  for (const action of actions) {
    if (!action.id || seen.has(action.id)) continue;
    seen.add(action.id);
    result.push(action);
  }
  return result;
}

function priorityRank(priority) {
  return { low: 1, medium: 2, high: 3 }[priority] || 0;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
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
  appendPrivateNextActionReceipt,
  buildPrivateNextActionPlan,
  privateNextActionsPlan,
  readPrivateNextActionReceipts,
};
