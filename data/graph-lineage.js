const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const RECEIPT_RELATIVE_PATH = path.join("var", "graph-lineage-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function graphLineagePlan() {
  return {
    mode: "evidence-graph-lineage-plan",
    command: "npm run audit:graph-lineage",
    endpoint: "/api/graph-lineage",
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server, reads the public-safe graph-lineage report, writes a local receipt under var/, and does not contact audiences, infer private objections, load private artifacts, send outreach, publish claims, or mutate external systems.",
  };
}

function buildGraphLineageReport({
  graph,
  graphCrosslinks,
  narratives,
  narrativeObjections,
  packets,
  projects,
  claims,
  artifactCatalog,
  routeManifest = {},
  packageManifest = {},
  receipts = [],
}) {
  const renderedIds = new Set((graph.nodes || []).map((node) => node.id));
  const edgeIds = new Set((graph.edges || []).map((edge) => `${edge.source}->${edge.target}:${edge.relation}`));
  const crosslinkIds = new Set((graphCrosslinks.crosslinks || []).map((link) => `${link.source}->${link.target}:${link.relation}`));
  const indexes = {
    claims: new Map((claims || []).map((claim) => [claim.id, claim])),
    artifacts: new Map((artifactCatalog.artifacts || []).map((artifact) => [artifact.id, artifact])),
    projects: new Map((projects || []).map((project) => [project.slug, project])),
    narratives: new Map((narratives.narratives || []).map((narrative) => [narrative.id, narrative])),
    packets: new Map((packets?.packets || []).map((packet) => [packet.id, packet])),
  };
  const audiences = (narrativeObjections.audiences || []).map((audience) =>
    audienceLineage({ audience, renderedIds, edgeIds, crosslinkIds, indexes }),
  );
  const objections = audiences.flatMap((audience) => audience.objections);
  const paths = objections.flatMap((objection) => objection.lineagePaths);
  const unresolvedEvidence = objections.flatMap((objection) => objection.unresolvedEvidence);
  const artifactGapRepairLineage = artifactGapRepairLineageFor({ graph, renderedIds, edgeIds });
  const checks = lineageChecks({ renderedIds, audiences, objections, paths, unresolvedEvidence, artifactGapRepairLineage });
  if (routeManifest.publicApiRoutes) {
    checks.push(
      check(
        "public-route-manifest",
        ["/api/graph-lineage", "/api/graph-lineage/plan", "/api/graph-lineage/history"].every((route) =>
          routeManifest.publicApiRoutes.includes(route),
        ),
        `${["/api/graph-lineage", "/api/graph-lineage/plan", "/api/graph-lineage/history"].filter((route) => routeManifest.publicApiRoutes.includes(route)).length}/3 graph-lineage route(s).`,
        "high",
        "Declare graph-lineage report, plan, and history routes in the public route manifest.",
        "npm run audit:graph-lineage && npm run check",
      ),
    );
  }
  if (packageManifest.scripts) {
    checks.push(
      check(
        "package-script",
        Boolean(packageManifest.scripts["audit:graph-lineage"]),
        `audit:graph-lineage=${Boolean(packageManifest.scripts["audit:graph-lineage"])}`,
        "high",
        "Add the audit:graph-lineage package script.",
        "npm run audit:graph-lineage",
      ),
    );
  }
  const score = weightedScore([
    { score: percent(objections.filter((item) => item.rendered).length, objections.length), weight: 0.22 },
    { score: percent(paths.filter((path) => path.graphResolved).length, paths.length), weight: 0.24 },
    { score: percent(paths.filter((path) => path.crosslinkResolved).length, paths.length), weight: 0.18 },
    { score: average(objections.map((item) => item.answerabilityScore)), weight: 0.18 },
    { score: percent(objections.filter((item) => item.repairAction && item.caveats.length).length, objections.length), weight: 0.18 },
  ]);
  const failing = checks.filter((check) => !check.passed);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-graph-lineage-report",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: "/api/graph-lineage?refresh=1",
    sourceBoundary:
      "This report explains public-safe graph paths from grounded narratives to skeptical objections and answer evidence. It does not claim a human recipient raised the objection, that private artifacts are public, or that any external decision was made.",
    sideEffectBoundary: graphLineagePlan().sideEffectBoundary,
    plan: graphLineagePlan(),
    summary: {
      score,
      band: bandFor(score),
      audiences: audiences.length,
      objections: objections.length,
      renderedObjections: objections.filter((item) => item.rendered).length,
      lineagePaths: paths.length,
      graphResolvedPaths: paths.filter((path) => path.graphResolved).length,
      crosslinkResolvedPaths: paths.filter((path) => path.crosslinkResolved).length,
      artifactGapRepairNodes: artifactGapRepairLineage.nodes.length,
      artifactGapRepairPaths: artifactGapRepairLineage.paths.length,
      graphResolvedArtifactGapRepairPaths: artifactGapRepairLineage.paths.filter((path) => path.graphResolved).length,
      unresolvedEvidenceRefs: unresolvedEvidence.length,
      checks: checks.length,
      passing: checks.filter((check) => check.passed).length,
      failing: failing.length,
      auditCoverageScore: weightedCheckScore(checks),
      latestReceiptId: latestReceipt?.id || null,
    },
    methodology: {
      pathShape: "narrative -> objection -> claim/artifact/project/packet/model disclosure",
      graphResolved: "Every node in the path is visible in /api/graph and the final edge is rendered.",
      crosslinkResolved: "The objection has an explicit public-safe relationship in /api/graph-crosslinks.",
      unresolvedPolicy:
        "Policy rules and model disclosures may be valid evidence without being rendered graph nodes; unknown references are flagged separately.",
    },
    audiences,
    artifactGapRepairLineage,
    checks,
    unresolvedEvidence,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    nextAction: nextActionFor({ objections, unresolvedEvidence, paths }),
  };
}

function buildGraphLineageReportFromReceipt(receipt) {
  if (!isUsableGraphLineageReceipt(receipt)) return null;
  const report = receipt.report;

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: "/api/graph-lineage?refresh=1",
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs graph lineage from the latest local receipt. It is not fresh graph analysis and does not prove private objections, private artifacts, external decisions, or third-party audience behavior.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || graphLineagePlan().sideEffectBoundary,
    plan: graphLineagePlan(),
    summary: {
      ...report.summary,
      latestReceiptId: receipt.id,
    },
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || report.summary.score || 0,
      passing: receipt.summary?.passing || report.summary.passing || 0,
      checks: receipt.summary?.checks || report.summary.checks || 0,
    },
  };
}

function buildGraphLineageResponse(report, { detail = "summary", previewLimit = 1 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedPreview = Math.max(1, Math.min(Number(previewLimit) || 3, 10));
  const objectionPreviewLimit = 1;
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: "/api/graph-lineage?detail=full",
      lineagePayloadPolicy: {
        fullDetail: true,
        previewLimit: boundedPreview,
        audienceObjectsReturned: report.audiences?.length || 0,
        lineagePathsReturned: report.summary?.lineagePaths || 0,
      },
    };
  }
  const audiences = (report.audiences || []).map((audience) => summarizeAudienceLineage(audience, boundedPreview, objectionPreviewLimit));
  const failingChecks = (report.checks || []).filter((check) => !check.passed);

  return {
    generatedAt: report.generatedAt,
    checkedAt: report.checkedAt,
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy,
    refreshEndpoint: report.refreshEndpoint,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: "/api/graph-lineage?detail=full",
    sourceBoundaryAvailable: Boolean(report.sourceBoundary),
    sideEffectBoundaryAvailable: Boolean(report.sideEffectBoundary),
    planEndpoint: "/api/graph-lineage/plan",
    summary: summarizeGraphLineageCompactSummary(report.summary),
    methodologyAvailable: Boolean(report.methodology),
    lineagePayloadPolicy: {
      fullDetail: false,
      objectionPreviewLimit,
      lineagePathsReturned: audiences.reduce(
        (sum, audience) =>
          sum +
          (audience.objections || []).reduce((inner, objection) => inner + Math.min((objection.lineagePaths || []).length, boundedPreview), 0),
        0,
      ),
      fullDetailAvailable: true,
    },
    audiences,
    artifactGapRepairLineage: summarizeArtifactGapRepairLineage(report.artifactGapRepairLineage, boundedPreview),
    checkSummary: summarizeLineageCheckState(report.checks),
    checks: failingChecks.slice(0, 3).map(({ id, passed, severity }) => ({
      id,
      passed: Boolean(passed),
      severity,
    })),
    unresolvedEvidence: (report.unresolvedEvidence || []).slice(0, boundedPreview),
    repairActions: (report.repairActions || []).slice(0, 3).map(({ id, priority }) => ({ id, priority, actionAvailable: true })),
    nextActionAvailable: Boolean(report.nextAction),
  };
}

function buildGraphLineageHistory({ receipts = [], limit = 20, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "evidence-graph-lineage-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary:
      fullDetail
        ? "This endpoint returns full local graph-lineage receipts. It does not infer private objections, publish evidence, contact audiences, collect analytics, or mutate graph storage."
        : undefined,
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local graph-lineage receipts only. It does not infer private objections, publish evidence, contact audiences, collect analytics, or mutate graph storage."
        : undefined,
    receiptStore: fullDetail ? RECEIPT_RELATIVE_PATH : undefined,
    fullDetailEndpoint: "/api/graph-lineage/history?detail=full",
    historyPayloadPolicy: fullDetail
      ? {
          fullDetail: true,
          defaultLimit: 5,
          fullDetailEndpoint: "/api/graph-lineage/history?detail=full",
        }
      : {
          fullDetail: false,
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      latestScore: latest?.summary?.score || 0,
      latestLineagePaths: latest?.summary?.lineagePaths || 0,
      ...(fullDetail
        ? {
            latestCheckedAt: latest?.checkedAt || null,
            latestBand: latest?.summary?.band || "unknown",
            latestObjections: latest?.summary?.objections || 0,
            latestGraphResolvedPaths: latest?.summary?.graphResolvedPaths || 0,
            latestArtifactGapRepairPaths: latest?.summary?.artifactGapRepairPaths || 0,
          }
        : {}),
    },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeGraphLineageReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Graph lineage history is available; run npm run audit:graph-lineage after narrative, objection, graph, artifact-gap repair, or audience-packet changes."
        : "Run npm run audit:graph-lineage to create graph lineage history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:graph-lineage && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeAudienceLineage(audience, previewLimit, objectionPreviewLimit = 2) {
  const objections = audience.objections || [];
  return {
    id: audience.id,
    objections: objections.slice(0, objectionPreviewLimit).map((objection) => ({
      id: objection.id,
      lineagePathCount: (objection.lineagePaths || []).length,
      lineagePaths: (objection.lineagePaths || []).slice(0, previewLimit).map(summarizeLineagePath),
    })),
  };
}

function summarizeEvidenceTarget(target) {
  return {
    rawId: target.rawId,
    targetId: target.targetId,
    targetType: target.targetType,
    resolutionStatus: target.resolutionStatus,
  };
}

function summarizeLineagePath(path) {
  return {
    targetId: path.targetId,
    targetType: path.targetType,
    graphResolved: path.graphResolved,
  };
}

function summarizeArtifactGapRepairLineage(lineage = {}, previewLimit = 3) {
  const nodePreviewLimit = Math.max(1, Number(previewLimit) || 1);
  const pathPreviewLimit = Math.max(1, Number(previewLimit) || 1);
  const nodes = lineage.nodes || [];
  const paths = lineage.paths || [];
  return {
    summary: {
      nodes: nodes.length,
      renderedNodes: nodes.filter((node) => node.rendered).length,
      paths: paths.length,
      graphResolvedPaths: paths.filter((path) => path.graphResolved).length,
    },
    nodes: nodes.slice(0, nodePreviewLimit).map((node) => ({
      id: node.id,
      rendered: Boolean(node.rendered),
    })),
    paths: paths.slice(0, pathPreviewLimit).map((path) => ({
      graphResolved: Boolean(path.graphResolved),
    })),
    omittedNodes: Math.max(0, nodes.length - nodePreviewLimit),
    omittedPaths: Math.max(0, paths.length - pathPreviewLimit),
    nextActionAvailable: Boolean(lineage.nextAction),
  };
}

function summarizeLineageCheckState(checks = []) {
  const passing = checks.filter((check) => check.passed).length;
  return {
    checks: checks.length,
    passing,
    failing: Math.max(0, checks.length - passing),
    artifactGapRepairLineagePassed: checks.some((check) => check.id === "artifact-gap-repair-lineage" && check.passed),
  };
}

function summarizeGraphLineageCompactSummary(summary = {}) {
  return {
    score: summary.score || 0,
    objections: summary.objections || 0,
    graphResolvedPaths: summary.graphResolvedPaths || 0,
    artifactGapRepairNodes: summary.artifactGapRepairNodes || 0,
    artifactGapRepairPaths: summary.artifactGapRepairPaths || 0,
    graphResolvedArtifactGapRepairPaths: summary.graphResolvedArtifactGapRepairPaths || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function audienceLineage({ audience, renderedIds, edgeIds, crosslinkIds, indexes }) {
  const narrativeNodeId = `narrative-${audience.id}`;
  const objections = audience.objections.map((objection) =>
    objectionLineage({ audience, objection, narrativeNodeId, renderedIds, edgeIds, crosslinkIds, indexes }),
  );
  return {
    id: audience.id,
    label: audience.label,
    audience: audience.audience,
    narrativeNodeId,
    renderedNarrative: renderedIds.has(narrativeNodeId),
    sourceProjects: audience.sourceProjects,
    answerabilityScore: audience.answerabilityScore,
    riskLevel: audience.riskLevel,
    objections,
    summary: {
      objections: objections.length,
      rendered: objections.filter((item) => item.rendered).length,
      paths: objections.reduce((sum, item) => sum + item.lineagePaths.length, 0),
      unresolvedEvidence: objections.reduce((sum, item) => sum + item.unresolvedEvidence.length, 0),
    },
  };
}

function objectionLineage({ audience, objection, narrativeNodeId, renderedIds, edgeIds, crosslinkIds, indexes }) {
  const objectionNodeId = `objection-${audience.id}-${objection.id}`;
  const evidenceTargets = (objection.evidence || []).map((evidenceId) => resolveEvidenceTarget({ evidenceId, audience, indexes }));
  const projectTargets = (audience.sourceProjects || [])
    .filter((slug) => indexes.projects.has(slug))
    .map((slug) => ({
      rawId: slug,
      targetId: slug,
      targetType: "project",
      label: indexes.projects.get(slug).title,
      resolutionStatus: "resolved",
    }));
  const targets = [...evidenceTargets, ...projectTargets].filter((target) => target.targetId);
  const lineagePaths = targets.map((target) =>
    lineagePath({
      audience,
      objection,
      narrativeNodeId,
      objectionNodeId,
      target,
      renderedIds,
      edgeIds,
      crosslinkIds,
    }),
  );
  const unresolvedEvidence = evidenceTargets
    .filter((target) => target.resolutionStatus === "unresolved")
    .map((target) => ({
      audience: audience.id,
      objection: objection.id,
      rawId: target.rawId,
      reason: target.reason,
      repairAction: objection.repairAction,
    }));

  return {
    id: objection.id,
    nodeId: objectionNodeId,
    rendered: renderedIds.has(objectionNodeId),
    challenge: objection.challenge,
    answerabilityScore: objection.answerabilityScore,
    riskLevel: objection.riskLevel,
    mustDisclose: objection.mustDisclose,
    caveats: objection.caveats,
    repairAction: objection.repairAction,
    evidenceTargets,
    lineagePaths,
    unresolvedEvidence,
  };
}

function resolveEvidenceTarget({ evidenceId, audience, indexes }) {
  if (indexes.claims.has(evidenceId)) {
    return {
      rawId: evidenceId,
      targetId: evidenceId,
      targetType: "claim",
      label: indexes.claims.get(evidenceId).text.slice(0, 90),
      resolutionStatus: "resolved",
    };
  }
  if (indexes.artifacts.has(evidenceId)) {
    return {
      rawId: evidenceId,
      targetId: evidenceId,
      targetType: "artifact",
      label: indexes.artifacts.get(evidenceId).label,
      resolutionStatus: "resolved",
    };
  }
  if (indexes.projects.has(evidenceId)) {
    return {
      rawId: evidenceId,
      targetId: evidenceId,
      targetType: "project",
      label: indexes.projects.get(evidenceId).title,
      resolutionStatus: "resolved",
    };
  }
  if (String(evidenceId).startsWith("packet.") && indexes.packets.has(audience.id)) {
    return {
      rawId: evidenceId,
      targetId: `packet-${audience.id}`,
      targetType: "audience-packet",
      label: indexes.packets.get(audience.id).label,
      resolutionStatus: "resolved",
    };
  }
  if (String(evidenceId).startsWith(`narrative.${audience.id}`) && indexes.narratives.has(audience.id)) {
    return {
      rawId: evidenceId,
      targetId: `narrative-${audience.id}`,
      targetType: "narrative",
      label: indexes.narratives.get(audience.id).label,
      resolutionStatus: "resolved",
    };
  }
  if (String(evidenceId).startsWith("opportunity-package.")) {
    return {
      rawId: evidenceId,
      targetId: null,
      targetType: "readiness-model",
      label: evidenceId,
      resolutionStatus: "modeled-only",
      reason: "Opportunity package readiness is modeled outside the rendered graph.",
    };
  }
  if (/^do not /i.test(String(evidenceId))) {
    return {
      rawId: evidenceId,
      targetId: null,
      targetType: "overclaim-rule",
      label: evidenceId,
      resolutionStatus: "policy-rule",
      reason: "Policy rules are valid guardrail evidence but not graph entities.",
    };
  }
  return {
    rawId: evidenceId,
    targetId: null,
    targetType: "unknown",
    label: evidenceId,
    resolutionStatus: "unresolved",
    reason: "No claim, artifact, project, packet, narrative, or modeled disclosure matched this evidence reference.",
  };
}

function lineagePath({ audience, objection, narrativeNodeId, objectionNodeId, target, renderedIds, edgeIds, crosslinkIds }) {
  const relation = relationForTarget(target.targetType);
  const edgeKey = `${objectionNodeId}->${target.targetId}:${relation.graph}`;
  const crosslinkKey = `${objectionNodeId}->${target.targetId}:${relation.crosslink}`;
  const narrativeEdgeKey = `${narrativeNodeId}->${objectionNodeId}:pressure-tested-by`;
  const graphResolved = renderedIds.has(narrativeNodeId) && renderedIds.has(objectionNodeId) && renderedIds.has(target.targetId) && edgeIds.has(edgeKey);
  return {
    id: `${audience.id}.${objection.id}.${target.targetType}.${target.targetId}`,
    audience: audience.id,
    objection: objection.id,
    targetId: target.targetId,
    targetType: target.targetType,
    targetLabel: target.label,
    path: [narrativeNodeId, objectionNodeId, target.targetId],
    relation: relation.crosslink,
    graphResolved,
    crosslinkResolved: crosslinkIds.has(crosslinkKey) || crosslinkIds.has(`${narrativeNodeId}->${objectionNodeId}:narrative-pressure-tested-by-objection`),
    narrativeEdgeRendered: edgeIds.has(narrativeEdgeKey),
    confidenceScore: confidenceFor({ objection, target }),
    explanation: `${audience.label} objection "${objection.id}" is traceable to ${target.targetType} ${target.targetId}.`,
  };
}

function artifactGapRepairLineageFor({ graph, renderedIds, edgeIds }) {
  const repairNodes = (graph.nodes || []).filter((node) => node.type === "artifact-gap-repair");
  const edges = graph.edges || [];
  const nodes = repairNodes.map((node) => {
    const projectEdge = edges.find((edge) => edge.target === node.id && edge.relation === "has-artifact-gap-repair");
    const gapEdge = edges.find((edge) => edge.target === node.id && edge.relation === "planned-by-gap-repair");
    const opportunityEdges = edges.filter((edge) => edge.source === node.id && edge.relation === "unblocks-opportunity-proof");
    return {
      id: node.id,
      label: node.label,
      project: node.project,
      gapId: node.gapId,
      rendered: renderedIds.has(node.id),
      projectEdgeRendered: Boolean(projectEdge) && edgeIds.has(`${projectEdge.source}->${projectEdge.target}:${projectEdge.relation}`),
      gapEdgeRendered: Boolean(gapEdge) && edgeIds.has(`${gapEdge.source}->${gapEdge.target}:${gapEdge.relation}`),
      opportunityUnlocks: opportunityEdges.length,
    };
  });
  const paths = repairNodes.flatMap((node) => {
    const gapEdge = edges.find((edge) => edge.target === node.id && edge.relation === "planned-by-gap-repair");
    const opportunityEdges = edges.filter((edge) => edge.source === node.id && edge.relation === "unblocks-opportunity-proof");
    return opportunityEdges.map((edge) => ({
      id: `${node.id}.${edge.target}`,
      repairNodeId: node.id,
      gapNodeId: gapEdge?.source || null,
      opportunityNodeId: edge.target,
      path: [gapEdge?.source || node.project, node.id, edge.target].filter(Boolean),
      relation: edge.relation,
      graphResolved:
        renderedIds.has(node.id) &&
        renderedIds.has(edge.target) &&
        (!gapEdge || renderedIds.has(gapEdge.source)) &&
        edgeIds.has(`${node.id}->${edge.target}:unblocks-opportunity-proof`) &&
        (!gapEdge || edgeIds.has(`${gapEdge.source}->${gapEdge.target}:planned-by-gap-repair`)),
      explanation: edge.explanation,
    }));
  });
  return {
    nodes,
    paths,
    nextAction:
      paths.find((path) => !path.graphResolved)?.id ||
      nodes.find((node) => !node.rendered)?.id ||
      "Artifact gap repair pressure is graph-visible.",
  };
}

function relationForTarget(targetType) {
  if (targetType === "claim") {
    return { graph: "answered-by-claim", crosslink: "narrative-objection-answered-by-claim" };
  }
  if (targetType === "artifact") {
    return { graph: "answered-by-artifact", crosslink: "narrative-objection-answered-by-artifact" };
  }
  if (targetType === "audience-packet") {
    return { graph: "uses-packet-disclosure", crosslink: "narrative-objection-uses-packet-disclosure" };
  }
  if (targetType === "narrative") {
    return { graph: "uses-narrative-disclosure", crosslink: "narrative-objection-uses-narrative-disclosure" };
  }
  return { graph: "concerns-project", crosslink: "narrative-objection-concerns-project" };
}

function confidenceFor({ objection, target }) {
  const base = target.targetType === "claim" || target.targetType === "artifact" ? 90 : target.targetType === "project" ? 82 : 78;
  return Math.max(45, Math.min(100, Math.round((base + objection.answerabilityScore) / 2)));
}

function lineageChecks({ renderedIds, audiences, objections, paths, unresolvedEvidence, artifactGapRepairLineage }) {
  return [
    check(
      "objection-nodes-rendered",
      objections.every((objection) => renderedIds.has(objection.nodeId)),
      `${objections.filter((objection) => renderedIds.has(objection.nodeId)).length}/${objections.length} objection node(s) rendered.`,
    ),
    check(
      "audience-lineage-coverage",
      audiences.every((audience) => audience.objections.every((objection) => objection.lineagePaths.length > 0)),
      "Every audience objection should have at least one inspectable lineage path.",
    ),
    check(
      "answer-evidence-crosslinked",
      paths.some((path) => path.relation === "narrative-objection-answered-by-claim") &&
        paths.some((path) => path.relation === "narrative-objection-answered-by-artifact"),
      "Objection lineage should include both claim and artifact answer paths.",
    ),
    check("graph-resolution", paths.filter((path) => path.graphResolved).length >= objections.length, "Rendered graph should resolve at least one path per objection."),
    check("repair-lineage", objections.every((objection) => objection.repairAction), "Every objection keeps a repair action attached to the lineage."),
    check("unresolved-evidence", unresolvedEvidence.length === 0, `${unresolvedEvidence.length} unknown evidence reference(s).`),
    check(
      "artifact-gap-repair-lineage",
      artifactGapRepairLineage.nodes.length > 0 &&
        artifactGapRepairLineage.paths.length > 0 &&
        artifactGapRepairLineage.paths.every((path) => path.graphResolved),
      `${artifactGapRepairLineage.nodes.length} artifact gap repair node(s); ${artifactGapRepairLineage.paths.filter((path) => path.graphResolved).length}/${artifactGapRepairLineage.paths.length} graph-resolved repair path(s).`,
    ),
  ];
}

function nextActionFor({ objections, unresolvedEvidence, paths }) {
  const unresolved = unresolvedEvidence[0];
  if (unresolved) return `${unresolved.audience}/${unresolved.objection}: model ${unresolved.rawId} or remove the stale reference.`;
  const hidden = paths.find((path) => !path.graphResolved && path.targetType !== "audience-packet");
  if (hidden) return `Render ${hidden.targetType} ${hidden.targetId} so ${hidden.objection} lineage is visible in /api/graph.`;
  const weakest = objections.slice().sort((left, right) => left.answerabilityScore - right.answerabilityScore)[0];
  return weakest ? `Strengthen ${weakest.nodeId}: ${weakest.repairAction}` : "Keep objection lineage refreshed with every narrative change.";
}

function appendGraphLineageReceipt(root, receipt) {
  const receipts = readGraphLineageReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readGraphLineageReceipts(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestGraphLineageReceipt(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  if (!existsSync(storePath)) return null;
  try {
    const cacheKey = receiptCacheKey(storePath);
    const cached = latestReceiptCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.receipt;
    const text = readFileSync(storePath, "utf8");
    const receiptsIndex = text.indexOf('"receipts"');
    const arrayStart = receiptsIndex === -1 ? -1 : text.indexOf("[", receiptsIndex);
    let objectStart = arrayStart === -1 ? -1 : text.indexOf("{", arrayStart);
    while (objectStart !== -1) {
      const objectEnd = findJsonObjectEnd(text, objectStart);
      if (objectEnd === -1) break;
      const receipt = JSON.parse(text.slice(objectStart, objectEnd + 1));
      if (isUsableGraphLineageReceipt(receipt)) {
        latestReceiptCache.set(storePath, { cacheKey, receipt });
        return receipt;
      }
      objectStart = text.indexOf("{", objectEnd + 1);
    }
    latestReceiptCache.set(storePath, { cacheKey, receipt: null });
    return null;
  } catch {
    return null;
  }
}

function readGraphLineageHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readGraphLineageReceipts(root);
    const window = {
      receipts: receipts.slice(0, boundedLimit),
      totalAvailable: receipts.length,
    };
    historyWindowCache.set(storePath, { cacheKey, window });
    return window;
  } catch {
    return { receipts: [], totalAvailable: 0 };
  }
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function summarizeGraphLineageReceipt(receipt, { includePreview = true } = {}) {
  const summary = receipt.summary || receipt.report?.summary || {};
  const report = receipt.report || {};
  const summarized = summarizeGraphLineageHistorySummary(summary);
  const compact = {
    id: receipt.id,
    cacheUsable: isUsableGraphLineageReceipt(receipt),
    score: summarized.score,
    lineagePaths: summarized.lineagePaths,
    graphResolvedPaths: summarized.graphResolvedPaths,
    artifactGapRepairPaths: summarized.artifactGapRepairPaths,
  };
  if (!includePreview) {
    return {
      id: receipt.id,
      trendOnly: true,
      score: compact.score,
      lineagePaths: compact.lineagePaths,
      graphResolvedPaths: compact.graphResolvedPaths,
      artifactGapRepairPaths: compact.artifactGapRepairPaths,
    };
  }
  const audienceSummaries =
    receipt.audienceSummaries ||
    (report.audiences || []).map((audience) => ({
      id: audience.id,
      objections: audience.summary?.objections || 0,
      paths: audience.summary?.paths || 0,
      unresolvedEvidence: audience.summary?.unresolvedEvidence || 0,
    }));
  const sampleObjections = (receipt.sampleObjections || []).slice(0, 2).map(({ audience, id, paths }) => ({
    audience,
    id,
    paths,
  }));
  return {
    ...compact,
    audienceSummary: summarizeGraphLineageAudienceHistory(audienceSummaries),
    checkSummary: summarizeLineageCheckState(receipt.checks || report.checks || []),
    unresolvedEvidenceCount: (receipt.unresolvedEvidence || report.unresolvedEvidence || []).length,
    ...(sampleObjections.length ? { sampleObjections } : {}),
    repairActionCount: (receipt.repairActions || report.repairActions || []).length,
  };
}

function summarizeGraphLineageAudienceHistory(audiences = []) {
  return {
    total: audiences.length,
    objections: audiences.reduce((sum, audience) => sum + (audience.objections || 0), 0),
    paths: audiences.reduce((sum, audience) => sum + (audience.paths || 0), 0),
    unresolvedEvidence: audiences.reduce((sum, audience) => sum + (audience.unresolvedEvidence || 0), 0),
  };
}

function summarizeGraphLineageHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    objections: summary.objections || 0,
    lineagePaths: summary.lineagePaths || 0,
    graphResolvedPaths: summary.graphResolvedPaths || 0,
    artifactGapRepairPaths: summary.artifactGapRepairPaths || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
  };
}

function isUsableGraphLineageReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-graph-lineage-receipt" || !receipt.summary || !receipt.report) return false;
  const report = receipt.report;
  if (
    report.mode !== "evidence-graph-lineage-report" ||
    (report.detail && report.detail !== "full") ||
    !report.summary ||
    !Array.isArray(report.audiences) ||
    !report.artifactGapRepairLineage ||
    !Array.isArray(report.artifactGapRepairLineage.paths) ||
    !Array.isArray(report.artifactGapRepairLineage.nodes) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.verificationCommand) ||
    !Array.isArray(report.unresolvedEvidence) ||
    !Array.isArray(report.repairActions)
  ) {
    return false;
  }
  const objections = report.audiences.reduce((sum, audience) => sum + (audience.objections || []).length, 0);
  const lineagePaths = report.audiences.reduce(
    (sum, audience) => sum + (audience.objections || []).reduce((inner, objection) => inner + (objection.lineagePaths || []).length, 0),
    0,
  );
  return (
    report.audiences.length === report.summary.audiences &&
    objections === report.summary.objections &&
    lineagePaths === report.summary.lineagePaths &&
    report.artifactGapRepairLineage.nodes.length === report.summary.artifactGapRepairNodes &&
    report.artifactGapRepairLineage.paths.length === report.summary.artifactGapRepairPaths
  );
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, 100));
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

function findJsonObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function check(
  id,
  passed,
  detail,
  severity = id === "unresolved-evidence" ? "high" : "medium",
  repairAction = "Repair graph lineage references and rerun the graph-lineage audit.",
  verificationCommand = "npm run check && node server.js # then open /api/graph-lineage",
) {
  return {
    id,
    passed: Boolean(passed),
    severity: passed ? "info" : severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function weightedScore(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return clamp(Math.round(items.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight), 0, 100);
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function percent(value, total) {
  if (!total) return 0;
  return clamp(Math.round((value / total) * 100), 0, 100);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function weightedCheckScore(checks) {
  const weights = { high: 18, medium: 11, low: 6, info: 4 };
  const max = checks.reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

module.exports = {
  appendGraphLineageReceipt,
  buildGraphLineageHistory,
  buildGraphLineageReport,
  buildGraphLineageReportFromReceipt,
  buildGraphLineageResponse,
  graphLineagePlan,
  readGraphLineageHistoryWindow,
  readGraphLineageReceipts,
  readLatestGraphLineageReceipt,
};
