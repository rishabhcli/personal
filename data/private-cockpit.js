const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const RECEIPT_RELATIVE_PATH = path.join("var", "private-cockpit-receipts.json");
const maxReceipts = 50;

function privateCockpitPlan() {
  return {
    mode: "local-private-cockpit-plan",
    command: "npm run cockpit:private",
    endpoint: "/api/private/cockpit",
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server with ENABLE_PRIVATE_COCKPIT=1, reads the gated local private cockpit endpoint, writes a local receipt under var/, and does not export private cockpit data, publish private material, send messages, submit forms, create calendar events, deploy, pay, sync tasks, open portals, or mutate third-party systems.",
  };
}

function buildPrivateCockpit({ projects, claims, trust, embeddedReports = {}, routeManifest = {}, packageManifest = {}, receipts = [] }) {
  const publicClaims = claims.map((claim) => ({
    id: claim.id,
    text: claim.text,
    claimType: claim.claimType,
    evidenceStrength: claim.evidenceStrength,
    confidenceScore: claim.confidenceScore,
    freshnessScore: claim.freshnessScore,
    privacyLevel: claim.privacyLevel,
    relatedProject: claim.relatedProject,
    suggestedRepair: claim.suggestedRepair,
  }));

  const evidenceGaps = publicClaims
    .filter((claim) => claim.evidenceStrength === "needs-source" || claim.privacyLevel !== "public")
    .sort((left, right) => left.confidenceScore - right.confidenceScore);

  const projectWeaknessMap = projects.map((project) => {
    const projectClaims = publicClaims.filter((claim) => claim.relatedProject === project.slug);
    const weakClaims = projectClaims.filter((claim) => claim.evidenceStrength === "needs-source");
    const privateClaims = projectClaims.filter((claim) => claim.privacyLevel !== "public");
    const averageConfidence = average(projectClaims.map((claim) => claim.confidenceScore));
    return {
      slug: project.slug,
      title: project.title,
      tier: project.tier,
      averageConfidence,
      weakClaimCount: weakClaims.length,
      privateReferenceCount: privateClaims.length,
      nextAction: nextActionFor(project, weakClaims, privateClaims),
    };
  });

  const prioritizedProjects = projectWeaknessMap
    .slice()
    .sort((left, right) => right.privateReferenceCount + right.weakClaimCount - (left.privateReferenceCount + left.weakClaimCount))
    .slice(0, 8);
  const queues = {
    claimApprovalQueue: evidenceGaps.filter((claim) => claim.privacyLevel !== "public").slice(0, 12),
    evidenceRepairQueue: evidenceGaps.slice(0, 12),
    demoRepairQueue: projects
      .filter((project) => project.liveUrl)
      .map((project) => ({
        slug: project.slug,
        title: project.title,
        liveUrl: project.liveUrl,
        nextAction: "Keep live status receipt fresh and attach a screenshot or replay artifact.",
      })),
  };
  const maps = {
    projectWeaknessMap,
    prioritizedProjects,
  };
  const nextActions = [
    "Attach public-safe screenshots or replay artifacts to the highest-value private references.",
    "Promote link-backed claims into case-study evidence sections.",
    "Add dated verification receipts for live demos and configured domains.",
    "Create opportunity records only after a real source, deadline, and fit rationale exist.",
  ];
  const embeddedReportSummary = summarizeEmbeddedReports(embeddedReports);
  const surfaceFirewall = privateCockpitSurfaceFirewall({ queues, maps, nextActions, embeddedReportSummary });
  const checks = privateCockpitChecks({ queues, maps, nextActions, embeddedReportSummary, surfaceFirewall, routeManifest, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    mode: "local-private-cockpit",
    generatedAt: new Date().toISOString(),
    privacyBoundary:
      "This payload is disabled by default and intended only for local/private operation. It derives from public-safe claim metadata and does not include credentials, private documents, emails, tokens, or personal communications.",
    dailyDigest: [
      `${trust.counts.totalClaims} claims are tracked across ${trust.counts.projectEvidencePackets} project evidence packets.`,
      `${trust.counts.needsSourceClaims} claims need stronger source attachments.`,
      `${trust.counts.privateReferences} private references need approval, redaction, or public-safe artifact links before promotion.`,
    ],
    plan: privateCockpitPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      claimApprovalQueue: queues.claimApprovalQueue.length,
      evidenceRepairQueue: queues.evidenceRepairQueue.length,
      demoRepairQueue: queues.demoRepairQueue.length,
      projectWeaknesses: maps.projectWeaknessMap.length,
      prioritizedProjects: maps.prioritizedProjects.length,
      embeddedReports: embeddedReportSummary.total,
      surfaceExportLocks: surfaceFirewall.summary.locks,
      manualOnlySurfaceExportLocks: surfaceFirewall.summary.manualOnlyLocks,
      blockedExternalActionSlots: surfaceFirewall.summary.blockedExternalActionSlots,
      externalWritesEnabled: surfaceFirewall.summary.externalWritesEnabled,
      publicExportsEnabled: surfaceFirewall.summary.publicExportsEnabled,
      latestReceiptId: latestReceipt?.id || null,
    },
    queues,
    maps,
    nextActions,
    embeddedReportSummary,
    surfaceFirewall,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
  };
}

function appendPrivateCockpitReceipt(root, receipt) {
  const receipts = readPrivateCockpitReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readPrivateCockpitReceipts(root) {
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

function summarizeEmbeddedReports(embeddedReports) {
  const entries = Object.entries(embeddedReports || {}).filter(([, value]) => value && typeof value === "object");
  return {
    total: entries.length,
    reports: entries.map(([id, value]) => ({
      id,
      mode: value.mode || value.plan?.mode || "embedded-private-report",
      score: value.summary?.score ?? value.counts?.score ?? null,
      checks: value.summary?.checks ?? value.counts?.checks ?? null,
      externalWritesEnabled: value.summary?.externalWritesEnabled ?? value.counts?.externalWritesEnabled ?? false,
    })),
  };
}

function privateCockpitSurfaceFirewall({ queues, maps, nextActions, embeddedReportSummary }) {
  const baseSurfaceIds = [
    "dailyDigest",
    "queues.claimApprovalQueue",
    "queues.evidenceRepairQueue",
    "queues.demoRepairQueue",
    "maps.projectWeaknessMap",
    "maps.prioritizedProjects",
    "nextActions",
  ];
  const surfaceIds = [...baseSurfaceIds, ...embeddedReportSummary.reports.map((report) => `embedded.${report.id}`)];
  const locks = surfaceIds.map((surfaceId) => ({
    id: `cockpit-surface-lock.${surfaceId}`,
    surfaceId,
    manualOnly: true,
    localOnly: true,
    externalWrite: false,
    publicExport: false,
    downloadEnabled: false,
    blockedActions: blockedExternalActions(),
    replacementLocalAction: `Inspect ${surfaceId} locally through the private cockpit; export or publish only after separate manual approval outside this app.`,
    localVerificationCommand: "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/cockpit locally",
    status: "local-inspection-only",
  }));
  const blockedActions = blockedExternalActions();
  return {
    mode: "local-private-cockpit-surface-firewall",
    localOnly: true,
    manualOnly: true,
    externalWriteCapability: false,
    publicExportCapability: false,
    downloadCapability: false,
    blockedExternalActions: blockedActions,
    sourceCounts: {
      claimApprovalQueue: queues.claimApprovalQueue.length,
      evidenceRepairQueue: queues.evidenceRepairQueue.length,
      demoRepairQueue: queues.demoRepairQueue.length,
      projectWeaknesses: maps.projectWeaknessMap.length,
      nextActions: nextActions.length,
      embeddedReports: embeddedReportSummary.total,
    },
    summary: {
      locks: locks.length,
      manualOnlyLocks: locks.filter((lock) => lock.manualOnly && lock.localOnly && lock.externalWrite === false && lock.publicExport === false).length,
      blockedExternalActionSlots: locks.length * blockedActions.length,
      externalWritesEnabled: false,
      publicExportsEnabled: false,
      downloadsEnabled: false,
    },
    policy:
      "The cockpit is a local inspection surface only. It cannot export private data, publish private material, send outreach, submit applications, schedule events, deploy, pay, sync tasks, open portals, or mutate third-party systems.",
    locks,
    verificationCommand: "npm run cockpit:private",
  };
}

function privateCockpitChecks({ queues, maps, nextActions, embeddedReportSummary, surfaceFirewall, routeManifest, packageManifest }) {
  const privateRoutes = routeManifest.privateApiRoutes || null;
  const scripts = packageManifest.scripts || null;
  const requiredBlockedActions = ["export-private-cockpit", "publish-private-material", "send-email", "submit-application", "create-calendar-event", "mutate-third-party-system"];
  const checks = [
    check("digest-depth", nextActions.length >= 3, "medium", `${nextActions.length} next action prompt(s).`, "Keep the cockpit useful enough to guide private local work."),
    check("queue-depth", queues.claimApprovalQueue.length > 0 && queues.evidenceRepairQueue.length > 0, "high", `${queues.claimApprovalQueue.length} approval and ${queues.evidenceRepairQueue.length} evidence queue item(s).`, "Keep cockpit queues populated from claim and evidence gaps."),
    check("weakness-map-depth", maps.projectWeaknessMap.length > 0 && maps.prioritizedProjects.length > 0, "medium", `${maps.projectWeaknessMap.length} project weakness row(s).`, "Keep project weakness and prioritization maps available."),
    check("embedded-report-coverage", embeddedReportSummary.total === 0 || embeddedReportSummary.total >= 8, "high", `${embeddedReportSummary.total} embedded private report(s).`, "When building the full cockpit route, embed the hardened private subsystems."),
    check("surface-firewall-depth", surfaceFirewall.summary.locks >= 7, "high", `${surfaceFirewall.summary.locks} cockpit surface lock(s).`, "Attach local inspection locks to cockpit sections and embedded reports."),
    check(
      "surface-firewall-local-only",
      surfaceFirewall.externalWriteCapability === false &&
        surfaceFirewall.publicExportCapability === false &&
        surfaceFirewall.downloadCapability === false &&
        surfaceFirewall.summary.manualOnlyLocks === surfaceFirewall.summary.locks,
      "high",
      `${surfaceFirewall.summary.manualOnlyLocks}/${surfaceFirewall.summary.locks} local-only surface lock(s).`,
      "Keep cockpit surfaces local-only with exports/downloads/external writes disabled.",
    ),
    check(
      "blocked-external-actions",
      requiredBlockedActions.every((action) => surfaceFirewall.blockedExternalActions.includes(action)),
      "high",
      `${surfaceFirewall.summary.blockedExternalActionSlots} blocked external action slot(s).`,
      "Block private exports, publication, outreach, submissions, calendar writes, and third-party mutation from the cockpit.",
    ),
  ];
  if (privateRoutes) {
    checks.push(
      check(
        "private-route-manifest",
        ["/api/private/cockpit", "/api/private/cockpit/plan", "/api/private/cockpit/history"].every((route) => privateRoutes.includes(route)),
        "high",
        `${["/api/private/cockpit", "/api/private/cockpit/plan", "/api/private/cockpit/history"].filter((route) => privateRoutes.includes(route)).length}/3 cockpit private route(s).`,
        "Declare cockpit report, plan, and history routes in the private route manifest.",
      ),
    );
  }
  if (scripts) {
    checks.push(check("package-script", Boolean(scripts["cockpit:private"]), "high", `cockpit:private=${Boolean(scripts["cockpit:private"])}`, "Add the cockpit:private package script."));
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
    verificationCommand: id === "package-script" ? "npm run cockpit:private" : "ENABLE_PRIVATE_COCKPIT=1 npm start # then inspect /api/private/cockpit locally",
  };
}

function nextActionFor(project, weakClaims, privateClaims) {
  if (weakClaims.length > 0) return `Attach stronger source material for ${weakClaims[0].id}.`;
  if (privateClaims.length > 0) return `Create an approved public-safe artifact for ${project.title}.`;
  if (project.liveUrl) return "Refresh live demo receipt and screenshot artifact.";
  if (project.repoUrl) return "Refresh repository README/source citation.";
  return "Maintain current proof and add richer narrative only when new evidence exists.";
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function blockedExternalActions() {
  return [
    "export-private-cockpit",
    "download-private-cockpit",
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
  appendPrivateCockpitReceipt,
  buildPrivateCockpit,
  privateCockpitPlan,
  readPrivateCockpitReceipts,
};
