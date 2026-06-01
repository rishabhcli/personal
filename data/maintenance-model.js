function buildMaintenanceReport({ projects, claims, trust, artifactCatalog, statusReceipts = [] }) {
  const issues = [
    ...staleClaimIssues(claims),
    ...needsSourceIssues(claims),
    ...artifactGapIssues(artifactCatalog.gaps || []),
    ...privateReferenceIssues(claims),
    ...statusReceiptIssues(statusReceipts),
  ].sort((left, right) => severityRank(right.severity) - severityRank(left.severity));

  return {
    generatedAt: new Date().toISOString(),
    mode: "self-healing-maintenance-report",
    summary: {
      projects: projects.length,
      totalClaims: trust.counts.totalClaims,
      staleClaims: trust.counts.staleClaims,
      needsSourceClaims: trust.counts.needsSourceClaims,
      artifactGaps: artifactCatalog.gaps.length,
      issues: issues.length,
      highSeverity: issues.filter((issue) => issue.severity === "high").length,
    },
    issues,
    nextSafeActions: issues.slice(0, 6).map((issue) => ({
      id: issue.id,
      action: issue.suggestedFix,
      verificationCommand: issue.verificationCommand,
    })),
  };
}

function buildMaintenanceReportResponse(report, { detail = "summary", issuePreviewLimit = 5 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedLimit = Math.max(1, Math.min(Number(issuePreviewLimit) || 12, 50));
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      summaryEndpoint: "/api/maintenance",
      maintenancePayloadPolicy: maintenancePayloadPolicy({ report, fullDetail, issuePreviewLimit: boundedLimit }),
    };
  }

  const issues = (report.issues || []).slice(0, boundedLimit).map(summarizeMaintenanceIssue);
  return {
    mode: report.mode,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: "/api/maintenance?detail=full",
    summary: report.summary,
    issues,
    nextSafeActionCount: (report.nextSafeActions || []).length,
    maintenancePayloadPolicy: maintenancePayloadPolicy({
      report,
      fullDetail,
      issuePreviewLimit: boundedLimit,
      issuesReturned: issues.length,
    }),
  };
}

function summarizeMaintenanceIssue(issue) {
  return {
    id: issue.id,
    type: issue.type,
    severity: issue.severity,
    ...(issue.project ? { project: issue.project } : {}),
    title: issue.title,
  };
}

function maintenancePayloadPolicy({ report, fullDetail, issuePreviewLimit, issuesReturned = report.issues?.length || 0 }) {
  return {
    fullDetail,
    issuePreviewLimit: fullDetail ? null : issuePreviewLimit,
    issuesReturned,
    totalIssues: report.issues?.length || 0,
  };
}

function staleClaimIssues(claims) {
  return claims
    .filter((claim) => claim.freshnessScore < 55)
    .map((claim) => ({
      id: `stale.${claim.id}`,
      type: "stale-claim",
      severity: claim.freshnessScore < 45 ? "high" : "medium",
      project: claim.relatedProject,
      title: `Refresh stale claim: ${claim.id}`,
      detail: claim.text,
      suggestedFix: claim.suggestedRepair || "Refresh the source, attach a newer artifact, or lower the claim.",
      verificationCommand: claim.relatedProject ? `npm run check && node server.js # then run terminal: evidence ${claim.relatedProject}` : "npm run check",
    }));
}

function needsSourceIssues(claims) {
  return claims
    .filter((claim) => claim.evidenceStrength === "needs-source")
    .map((claim) => ({
      id: `source.${claim.id}`,
      type: "needs-source",
      severity: "medium",
      project: claim.relatedProject,
      title: `Attach source for claim: ${claim.id}`,
      detail: claim.text,
      suggestedFix: claim.suggestedRepair,
      verificationCommand: claim.relatedProject ? `npm run check && node server.js # then open /api/evidence/${claim.relatedProject}` : "npm run check",
    }));
}

function artifactGapIssues(gaps) {
  return gaps.map((gap) => ({
    id: `artifact.${gap.id}`,
    type: "artifact-gap",
    severity: "medium",
    project: gap.project,
    title: gap.label,
    detail: gap.neededArtifact,
    suggestedFix: gap.suggestedRepair,
    verificationCommand: `npm run check && node server.js # then open /api/artifacts and inspect ${gap.project}`,
  }));
}

function privateReferenceIssues(claims) {
  const privateClaims = claims.filter((claim) => claim.privacyLevel !== "public");
  const byProject = new Map();
  privateClaims.forEach((claim) => byProject.set(claim.relatedProject || "profile", (byProject.get(claim.relatedProject || "profile") || 0) + 1));
  return [...byProject.entries()].map(([project, count]) => ({
    id: `privacy.${project}`,
    type: "privacy-review",
    severity: "low",
    project,
    title: `Review ${count} public-safe private reference(s)`,
    detail: "Private references stay public-safe until explicitly approved for stronger public projection.",
    suggestedFix: "Approve a public-safe artifact or keep the public-safe summary boundary.",
    verificationCommand: "npm run check && node server.js # then open /api/private/cockpit locally with ENABLE_PRIVATE_COCKPIT=1",
  }));
}

function statusReceiptIssues(receipts) {
  const latest = receipts[0];
  if (!latest || latest.summary.failing === 0) return [];
  return [
    {
      id: `status.${latest.id}`,
      type: "status-failure",
      severity: "high",
      project: null,
      title: "Resolve failing status checks",
      detail: `${latest.summary.failing} check(s) failed in latest status receipt.`,
      suggestedFix: "Inspect failing checks, repair the route/link, rerun status, and keep the receipt.",
      verificationCommand: "npm run verify && node server.js # then open /api/status",
    },
  ];
}

function severityRank(severity) {
  return { low: 1, medium: 2, high: 3 }[severity] || 0;
}

module.exports = {
  buildMaintenanceReport,
  buildMaintenanceReportResponse,
};
