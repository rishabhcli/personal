const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/narratives";
const STORE_RELATIVE_PATH = path.join("var", "narrative-grounding-receipts.json");
const maxReceipts = 50;

function narrativeGroundingPlan() {
  return {
    mode: "evidence-narrative-grounding-plan",
    command: "npm run ground:narratives",
    endpoint: ENDPOINT,
    supportedAudiences: ["recruiter", "professor", "founder"],
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe narrative grounding endpoints, writes a local receipt under var/, and does not send outreach, submit applications, publish copy, approve private artifacts, contact third parties, or enable private cockpit data.",
  };
}

function buildNarrativeGroundingReport({
  packets,
  claims,
  artifactCatalog,
  opportunities,
  routeManifest = { publicApiRoutes: [] },
  refreshPlan = { endpoints: [] },
  packageManifest = { scripts: {} },
  receipts = [],
}) {
  const narratives = packets.packets.map((packet) => buildGroundedNarrative({ packet, claims, artifactCatalog, opportunities }));
  const checks = reportChecks({ narratives, routeManifest, refreshPlan, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-narrative-grounding-report",
    sourceBoundary:
      "Narratives are generated only from public-safe packets, claims, artifacts, opportunities, and uncertainty disclosures already modeled by the app. They do not infer external decisions, applications, funding, admissions, interviews, or private document contents.",
    rules: [
      "Lead with the strongest evidence-backed project before broad biography.",
      "Every audience narrative must include claims used, artifacts used, caveats, and manual review boundaries.",
      "Private references remain public-safe summaries unless a local approval workflow changes their projection.",
      "Outreach and application language stays draft-only and must never be sent automatically.",
    ],
    summary: {
      audiences: narratives.length,
      averageGroundingScore: average(narratives.map((narrative) => narrative.groundingScore)),
      lowConfidenceNarratives: narratives.filter((narrative) => narrative.confidenceBand === "low" || narrative.confidenceBand === "insufficient").length,
      totalClaimsUsed: new Set(narratives.flatMap((narrative) => narrative.claimsUsed)).size,
      totalArtifactsUsed: new Set(narratives.flatMap((narrative) => narrative.artifactsUsed)).size,
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      latestReceiptId: receipts[0]?.id || null,
    },
    narratives,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    plan: narrativeGroundingPlan(),
    nonClaims: [
      "Does not approve narrative copy for sending, publishing, applications, submissions, or outreach.",
      "Does not infer external decisions, recipient interest, hiring, admissions, funding, or research acceptance.",
      "Does not expose private repositories, private documents, or unpublished source material.",
      "Does not replace manual review before external use.",
    ],
    nextAction:
      failing[0]?.repairAction ||
      narratives.find((narrative) => narrative.repairActions.length)?.repairActions[0] ||
      "Narratives are grounded in public-safe evidence; rerun after packet, claim, artifact, or opportunity changes.",
    verificationCommand: "npm run ground:narratives && npm run check && npm run verify",
  };
}

function selectGroundedNarrative(value, report) {
  const normalized = normalizeAudience(value);
  return report.narratives.find((narrative) => narrative.id === normalized) || null;
}

function buildNarrativeGroundingResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      narrativeGroundingPayloadPolicy: {
        fullDetail: true,
        narrativesReturned: report.narratives?.length || 0,
        fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      },
    };
  }

  return {
    generatedAt: report.generatedAt,
    mode: report.mode,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    sourceBoundaryAvailable: Boolean(report.sourceBoundary),
    ruleSummary: {
      count: (report.rules || []).length,
      fullRulesAvailable: true,
    },
    summary: report.summary || {},
    narratives: (report.narratives || []).map(summarizeGroundedNarrative),
    checkSummary: summarizeNarrativeReportChecks(report.checks || []),
    repairActionSummary: summarizeNarrativeRepairActions(report.repairActions || []),
    plan: summarizeNarrativeGroundingPlan(),
    nonClaimCount: (report.nonClaims || []).length,
    manualReviewBoundaryAvailable: (report.nonClaims || []).some((line) => /manual review/i.test(line)),
    nextActionAvailable: Boolean(report.nextAction),
    verificationCommandAvailable: Boolean(report.verificationCommand),
    narrativeGroundingPayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
      omittedFromSummaryCount: 6,
    },
  };
}

function buildGroundedNarrativeDetailResponse(narrative, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...narrative,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}/${narrative.id}?detail=full`,
      narrativeIndexEndpoint: ENDPOINT,
      narrativeDetailPayloadPolicy: {
        fullDetail: true,
        compactEndpoint: `${ENDPOINT}/${narrative.id}`,
        fullDetailEndpoint: `${ENDPOINT}/${narrative.id}?detail=full`,
      },
    };
  }

  const sourceTrailSummary = summarizeNarrativeSourceTrail(narrative.sourceTrail || []);
  const auditChecks = narrative.auditChecks || [];
  return {
    id: narrative.id,
    label: narrative.label,
    audience: narrative.audience,
    decisionQuestion: narrative.decisionQuestion,
    mode: "evidence-grounded-narrative-detail",
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}/${narrative.id}?detail=full`,
    narrativeIndexEndpoint: ENDPOINT,
    sourceBoundary:
      "Compact audience narrative summary. Full thesis, sequence text, source trails, caveats, prohibited overclaims, audit detail, and repair prose remain available with detail=full.",
    groundingScore: narrative.groundingScore,
    confidenceBand: narrative.confidenceBand,
    thesisAvailable: Boolean(narrative.thesis),
    evidenceSummary: {
      claimsUsed: (narrative.claimsUsed || []).length,
      artifactsUsed: (narrative.artifactsUsed || []).length,
      sourceTrailCount: sourceTrailSummary.count,
      strongestProject: sourceTrailSummary.strongestProject,
      totalTrailClaims: sourceTrailSummary.totalClaims,
      totalTrailArtifacts: sourceTrailSummary.totalArtifacts,
      strengths: sourceTrailSummary.strengths,
    },
    sequenceSummary: {
      stepCount: (narrative.sequence || []).length,
      steps: (narrative.sequence || []).map(({ step, label, evidence }) => ({ step, label, evidence })),
    },
    uncertaintyDisclosure: {
      confidenceScore: narrative.uncertaintyDisclosure?.confidenceScore || 0,
      confidenceBand: narrative.uncertaintyDisclosure?.confidenceBand || "unknown",
      caveatCount: narrative.uncertaintyDisclosure?.caveats?.length || 0,
      noExternalInferenceAvailable: Boolean(narrative.uncertaintyDisclosure?.noExternalInference),
    },
    prohibitedOverclaimCount: (narrative.prohibitedOverclaims || []).length,
    auditCheckSummary: {
      total: auditChecks.length,
      passing: auditChecks.filter((check) => check.passed).length,
      failing: auditChecks.filter((check) => !check.passed).length,
    },
    repairActionCount: (narrative.repairActions || []).length,
    narrativeDetailPayloadPolicy: {
      fullDetail: false,
      fullDetailEndpoint: `${ENDPOINT}/${narrative.id}?detail=full`,
      omittedFromSummary: [
        "thesis text",
        "sequence text",
        "source trail rows",
        "caveat prose",
        "prohibited overclaim prose",
        "audit check detail",
        "repair action prose",
      ],
    },
  };
}

function buildNarrativeGroundingHistory({ receipts = [], limit, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const fullDetail = String(detail || "summary").toLowerCase() === "full";
  const boundedLimit = boundedHistoryLimit(limit ?? (fullDetail ? 20 : 5));
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const historyPayloadPolicy = fullDetail
    ? {
        fullDetail: true,
        fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
        receiptsReturned: limited.length,
        totalAvailable,
        latestReceiptPreview: "full-receipt",
        olderReceiptPreview: "full-receipt",
      }
    : {
        fullDetail: false,
        fullDetailAvailable: true,
        receiptsReturned: limited.length,
      };

  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "evidence-narrative-grounding-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local narrative-grounding receipts. It is not fresh narrative generation, external validation, outreach approval, or private-document review.",
          sideEffectBoundary:
            "The history endpoint reads local narrative-grounding receipts only. It does not send outreach, submit applications, publish copy, approve private artifacts, contact third parties, or enable private cockpit data.",
          receiptStore: STORE_RELATIVE_PATH,
        }
      : {
          receiptStoreAvailable: true,
        }),
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      ...(fullDetail ? { latestCheckedAt: latest?.checkedAt || null } : {}),
      latestAverageGroundingScore: latest?.summary?.averageGroundingScore || 0,
      latestChecks: latest?.summary?.checks || 0,
      latestFailing: latest?.summary?.failing || 0,
    },
    definitions: fullDetail
      ? undefined
      : {
          evidenceAccess: {
            fullReportEndpoint: `${ENDPOINT}?detail=full`,
            fullHistoryEndpoint: `${ENDPOINT}/history?detail=full`,
            planEndpoint: `${ENDPOINT}/plan`,
          },
        },
    receipts: fullDetail
      ? limited
      : limited.map((receipt, index) => (index === 0 ? summarizeNarrativeGroundingReceipt(receipt) : summarizeNarrativeGroundingTrendReceipt(receipt))),
    nextAction: fullDetail
      ? limited[0]
        ? "Narrative-grounding history is compact; run npm run ground:narratives after packet, claim, artifact, opportunity, or audience changes."
        : "Run npm run ground:narratives to create narrative-grounding history."
      : undefined,
    verificationCommand: fullDetail ? "npm run ground:narratives && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeGroundedNarrative(narrative) {
  return {
    id: narrative.id,
    label: narrative.label,
    audience: narrative.audience,
    groundingScore: narrative.groundingScore,
    confidenceBand: narrative.confidenceBand,
    claimCount: (narrative.claimsUsed || []).length,
    artifactCount: (narrative.artifactsUsed || []).length,
    sourceTrailCount: (narrative.sourceTrail || []).length,
    sequenceStepCount: (narrative.sequence || []).length,
    detailEndpoint: `${ENDPOINT}/${narrative.id}`,
  };
}

function summarizeNarrativeGroundingReceipt(receipt) {
  const checks = receipt.checks || [];
  return {
    id: receipt.id,
    summary: summarizeNarrativeGroundingSummary(receipt.summary),
    audiences: (receipt.audiences || []).map((audience) => ({
      id: audience.id,
      groundingScore: audience.groundingScore,
    })),
    checkSummary: summarizeNarrativeGroundingChecks(checks),
  };
}

function summarizeNarrativeGroundingTrendReceipt(receipt) {
  return {
    id: receipt.id,
    score: receipt.summary?.averageGroundingScore || 0,
    failing: receipt.summary?.failing || 0,
    audienceCount: (receipt.audiences || []).length,
    previewOnly: true,
  };
}

function summarizeNarrativeGroundingSummary(summary = {}) {
  return {
    audiences: summary.audiences || 0,
    averageGroundingScore: summary.averageGroundingScore || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
  };
}

function summarizeNarrativeGroundingTrendSummary(summary = {}) {
  return {
    audiences: summary.audiences || 0,
    score: summary.averageGroundingScore || 0,
    checks: summary.checks || 0,
    failing: summary.failing || 0,
  };
}

function summarizeNarrativeGroundingChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.passed).length,
    failed: checks.filter((check) => !check.passed).map((check) => check.id),
  };
}

function summarizeNarrativeReportChecks(checks) {
  return {
    total: checks.length,
    passing: checks.filter((check) => check.passed).length,
    failing: checks.filter((check) => !check.passed).length,
    highSeverity: checks.filter((check) => check.severity === "high").length,
    verificationCommandsAvailable: checks.some((check) => check.verificationCommand),
  };
}

function summarizeNarrativeRepairActions(actions) {
  return {
    total: actions.length,
    high: actions.filter((action) => action.priority === "high").length,
    medium: actions.filter((action) => action.priority === "medium").length,
  };
}

function summarizeNarrativeGroundingPlan() {
  const plan = narrativeGroundingPlan();
  return {
    command: plan.command,
    endpoint: plan.endpoint,
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
  };
}

function summarizeNarrativeSourceTrail(sourceTrail) {
  const strengths = sourceTrail.reduce((counts, trail) => {
    counts[trail.evidenceStrength] = (counts[trail.evidenceStrength] || 0) + 1;
    return counts;
  }, {});
  return {
    count: sourceTrail.length,
    projectCount: new Set(sourceTrail.map((trail) => trail.project).filter(Boolean)).size,
    strongestProject: sourceTrail.slice().sort((left, right) => (right.confidenceScore || 0) - (left.confidenceScore || 0))[0]?.project || null,
    totalClaims: sourceTrail.reduce((sum, trail) => sum + (trail.claimIds || []).length, 0),
    totalArtifacts: sourceTrail.reduce((sum, trail) => sum + (trail.artifactIds || []).length, 0),
    strengths,
  };
}

function buildGroundedNarrative({ packet, claims, artifactCatalog, opportunities }) {
  const claimsUsed = unique(packet.evidenceBriefs.flatMap((brief) => brief.claims.map((claim) => claim.id)));
  const artifactsUsed = unique(packet.evidenceBriefs.flatMap((brief) => brief.artifacts.map((artifact) => artifact.id)));
  const sourceTrail = buildSourceTrail({ packet, claims, artifactCatalog });
  const relatedOpportunities = (opportunities.opportunities || []).filter((opportunity) =>
    packet.generatedFrom.opportunityIds.includes(opportunity.id),
  );
  const groundingScore = scoreNarrative({ packet, claimsUsed, artifactsUsed, sourceTrail, relatedOpportunities });
  const confidenceBand = confidenceBandFor(Math.min(groundingScore, packet.uncertaintyDisclosure.confidenceScore));

  return {
    id: packet.id,
    label: packet.label,
    audience: packet.audience,
    decisionQuestion: packet.decisionQuestion,
    groundingScore,
    confidenceBand,
    thesis: packet.thesis,
    sequence: narrativeSequence({ packet, relatedOpportunities }),
    claimsUsed,
    artifactsUsed,
    sourceTrail,
    uncertaintyDisclosure: {
      confidenceScore: packet.uncertaintyDisclosure.confidenceScore,
      confidenceBand: packet.uncertaintyDisclosure.confidenceBand,
      caveats: packet.uncertaintyDisclosure.caveats,
      noExternalInference: packet.uncertaintyDisclosure.noExternalInference,
    },
    prohibitedOverclaims: [
      "Do not claim interview readiness, admissions probability, funding likelihood, or external application status.",
      "Do not imply private repositories, papers, patents, or awards are public artifacts unless the approval/audit surface says so.",
      "Do not turn draft-only outreach into an automated send or submission.",
    ],
    auditChecks: auditChecksFor({ packet, claimsUsed, artifactsUsed, sourceTrail }),
    repairActions: repairActionsFor({ packet, sourceTrail }),
  };
}

function buildSourceTrail({ packet, claims, artifactCatalog }) {
  const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
  const artifactMap = new Map((artifactCatalog.artifacts || []).map((artifact) => [artifact.id, artifact]));
  return packet.evidenceBriefs.map((brief, index) => {
    const briefClaims = brief.claims.map((claim) => claimMap.get(claim.id)).filter(Boolean);
    const briefArtifacts = brief.artifacts.map((artifact) => artifactMap.get(artifact.id)).filter(Boolean);
    return {
      rank: index + 1,
      project: brief.slug,
      title: brief.title,
      evidenceStrength: brief.evidenceStrength,
      confidenceScore: brief.confidenceScore,
      claimIds: briefClaims.map((claim) => claim.id),
      artifactIds: briefArtifacts.map((artifact) => artifact.id),
      caveats: brief.caveats,
      sourceTypes: unique([
        ...briefClaims.flatMap((claim) => claim.sourceMaterial.map((source) => source.type)),
        ...briefArtifacts.flatMap((artifact) => artifact.sourceTrace.map((source) => source.type)),
      ]),
    };
  });
}

function narrativeSequence({ packet, relatedOpportunities }) {
  const topProjects = packet.recommendedProjectOrder.slice(0, 3).map((project) => project.title).join(" -> ");
  return [
    {
      step: "lead",
      label: "Lead with thesis",
      text: packet.thesis,
      evidence: packet.recommendedProjectOrder[0]?.slug || "packet",
    },
    {
      step: "sequence",
      label: "Sequence proof",
      text: topProjects ? `Use project order ${topProjects}.` : "Wait for a stronger project order before using this narrative.",
      evidence: "recommendedProjectOrder",
    },
    {
      step: "disclose",
      label: "Disclose uncertainty",
      text: packet.uncertaintyDisclosure.caveats.slice(0, 2).join(" "),
      evidence: "uncertaintyDisclosure",
    },
    {
      step: "act",
      label: "Manual next action",
      text: relatedOpportunities[0]?.nextAction || packet.nextActions[0] || "Review manually before use.",
      evidence: relatedOpportunities[0]?.id || "nextActions",
    },
  ];
}

function auditChecksFor({ packet, claimsUsed, artifactsUsed, sourceTrail }) {
  return [
    check("has-claims", claimsUsed.length > 0, `${claimsUsed.length} claim(s) used.`),
    check("has-artifacts", artifactsUsed.length > 0, `${artifactsUsed.length} artifact(s) used.`),
    check("has-caveats", packet.uncertaintyDisclosure.caveats.length > 0, `${packet.uncertaintyDisclosure.caveats.length} caveat(s) disclosed.`),
    check("has-source-trail", sourceTrail.every((trail) => trail.claimIds.length && trail.artifactIds.length), `${sourceTrail.length} project trail(s) generated.`),
    check("draft-only-boundary", /never send|draft-only/i.test(packet.draftOnlyOutreach.sendPolicy), packet.draftOnlyOutreach.sendPolicy),
  ];
}

function repairActionsFor({ packet, sourceTrail }) {
  const actions = [];
  const weakTrail = sourceTrail.find((trail) => trail.evidenceStrength === "needs-source" || trail.caveats.length);
  if (weakTrail) actions.push(`Strengthen ${weakTrail.title}: ${weakTrail.caveats[0] || "attach stronger public-safe source material."}`);
  if (packet.uncertaintyDisclosure.screenshotGapCount > 0) actions.push("Add approved screenshots before using this narrative in a visual-heavy context.");
  if (packet.uncertaintyDisclosure.privateReferenceCount > 0) actions.push("Keep private references summarized unless approved in the local privacy cockpit.");
  actions.push(`Manually review the ${packet.audience} narrative before using it outside this app.`);
  return unique(actions).slice(0, 4);
}

function reportChecks({ narratives, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const scripts = packageManifest.scripts || {};
  return [
    reportCheck({
      id: "audience-coverage",
      passed: ["recruiter", "professor", "founder"].every((id) => narratives.some((narrative) => narrative.id === id)),
      severity: "high",
      detail: `${narratives.length} narrative audience(s).`,
      repairAction: "Generate grounded narratives for recruiter, professor, and founder audiences.",
      verificationCommand: "npm run ground:narratives",
    }),
    reportCheck({
      id: "evidence-grounding",
      passed: narratives.every((narrative) => narrative.claimsUsed.length && narrative.artifactsUsed.length && narrative.sourceTrail.length),
      severity: "high",
      detail: `${narratives.filter((narrative) => narrative.claimsUsed.length && narrative.artifactsUsed.length && narrative.sourceTrail.length).length}/${narratives.length} narrative(s) include claim IDs, artifact IDs, and source trails.`,
      repairAction: "Keep every grounded narrative tied to claim IDs, artifact IDs, and source trails.",
      verificationCommand: "npm run ground:narratives",
    }),
    reportCheck({
      id: "uncertainty-and-repair",
      passed: narratives.every((narrative) => narrative.uncertaintyDisclosure.caveats.length && narrative.repairActions.length),
      severity: "high",
      detail: `${narratives.filter((narrative) => narrative.uncertaintyDisclosure.caveats.length && narrative.repairActions.length).length}/${narratives.length} narrative(s) include caveats and repair guidance.`,
      repairAction: "Attach caveats and repair guidance to every grounded narrative.",
      verificationCommand: "npm run ground:narratives",
    }),
    reportCheck({
      id: "manual-boundary",
      passed: narratives.every((narrative) => narrative.auditChecks.some((check) => check.id === "draft-only-boundary" && check.passed)),
      severity: "high",
      detail: `${narratives.filter((narrative) => narrative.auditChecks.some((check) => check.id === "draft-only-boundary" && check.passed)).length}/${narratives.length} narrative(s) keep draft-only boundaries.`,
      repairAction: "Keep narrative output draft-only and manually reviewed before external use.",
      verificationCommand: "npm run ground:narratives",
    }),
    reportCheck({
      id: "route-manifest",
      passed: [ENDPOINT, `${ENDPOINT}/:audience`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => publicRoutes.includes(route)),
      severity: "high",
      detail: `${[ENDPOINT, `${ENDPOINT}/:audience`, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => publicRoutes.includes(route)).length}/4 narrative grounding route(s) declared.`,
      repairAction: "Add narrative grounding plan/history routes to runtimeRouteManifest.",
      verificationCommand: "npm run record:runtime-surface",
    }),
    reportCheck({
      id: "refresh-plan",
      passed: refreshEndpoints.includes(ENDPOINT),
      severity: "medium",
      detail: `${ENDPOINT} ${refreshEndpoints.includes(ENDPOINT) ? "covered" : "missing"} in safe refresh plan.`,
      repairAction: "Add /api/narratives to the safe evidence refresh plan.",
      verificationCommand: "npm run refresh:evidence",
    }),
    reportCheck({
      id: "script-coverage",
      passed: Boolean(scripts["ground:narratives"]),
      severity: "medium",
      detail: `ground:narratives=${Boolean(scripts["ground:narratives"])}`,
      repairAction: "Add the ground:narratives package script.",
      verificationCommand: "npm run ground:narratives",
    }),
  ];
}

function appendNarrativeGroundingReceipt(root, receipt) {
  const receipts = readNarrativeGroundingReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readNarrativeGroundingReceipts(root) {
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

function reportCheck({ id, passed, severity, detail, repairAction, verificationCommand }) {
  return { id, passed: Boolean(passed), severity, detail, repairAction, verificationCommand };
}

function scoreNarrative({ packet, claimsUsed, artifactsUsed, sourceTrail, relatedOpportunities }) {
  const claimScore = percent(claimsUsed.length, Math.max(1, packet.evidenceBriefs.length * 3));
  const artifactScore = percent(artifactsUsed.length, Math.max(1, packet.evidenceBriefs.length * 2));
  const trailScore = percent(sourceTrail.filter((trail) => trail.claimIds.length && trail.artifactIds.length).length, sourceTrail.length);
  const caveatScore = packet.uncertaintyDisclosure.caveats.length ? 100 : 40;
  const opportunityScore = relatedOpportunities.length ? 100 : 70;
  const uncertaintyScore = packet.uncertaintyDisclosure.confidenceScore;
  return Math.round(claimScore * 0.22 + artifactScore * 0.18 + trailScore * 0.22 + caveatScore * 0.16 + opportunityScore * 0.1 + uncertaintyScore * 0.12);
}

function check(id, passed, detail) {
  return { id, passed: Boolean(passed), detail };
}

function normalizeAudience(value) {
  const normalized = String(value || "recruiter").toLowerCase().trim();
  if (["recruiter", "hiring", "internship", "engineer"].includes(normalized)) return "recruiter";
  if (["professor", "research", "mentor", "lab"].includes(normalized)) return "professor";
  if (["founder", "vc", "collaborator", "startup"].includes(normalized)) return "founder";
  return normalized;
}

function confidenceBandFor(score) {
  if (score >= 80) return "high";
  if (score >= 65) return "medium";
  if (score >= 45) return "low";
  return "insufficient";
}

function percent(value, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.min(Math.trunc(numeric), 100));
}

module.exports = {
  appendNarrativeGroundingReceipt,
  buildGroundedNarrativeDetailResponse,
  buildNarrativeGroundingHistory,
  buildNarrativeGroundingReport,
  buildNarrativeGroundingResponse,
  narrativeGroundingPlan,
  readNarrativeGroundingReceipts,
  selectGroundedNarrative,
};
