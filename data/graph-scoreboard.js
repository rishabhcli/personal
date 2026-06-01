const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const RECEIPT_RELATIVE_PATH = path.join("var", "graph-scoreboard-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function graphScoreboardPlan() {
  return {
    mode: "evidence-graph-scoreboard-plan",
    command: "npm run audit:graph-scoreboard",
    endpoint: "/api/graph-scoreboard",
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server, reads the public-safe graph-scoreboard report, writes a local receipt under var/, and does not infer private graph state, publish graph changes, load credentials, contact third parties, or mutate external systems.",
  };
}

function buildGraphScoreboard({
  graph,
  graphQuality,
  graphCrosslinks,
  projects,
  claims,
  artifactCatalog,
  opportunities,
  maintenance,
  weaknessMap,
  skillGapMap,
  contradictions,
  narratives,
  narrativeObjections,
  packets,
  routeManifest = {},
  packageManifest = {},
  receipts = [],
}) {
  const renderedIds = new Set((graph.nodes || []).map((node) => node.id));
  const renderedByType = countBy(graph.nodes || [], (node) => node.type);
  const entityTypes = buildEntityTypes({
    graph,
    projects,
    claims,
    artifactCatalog,
    opportunities,
    maintenance,
    weaknessMap,
    skillGapMap,
    narratives,
    narrativeObjections,
    packets,
  });
  const canonicalIds = new Set(entityTypes.flatMap((type) => type.ids));
  for (const node of graph.nodes || []) canonicalIds.add(node.id);

  const normalizedTypes = entityTypes.map((type) => normalizeType(type, renderedIds, renderedByType));
  const crosslinkCoverage = crosslinkEndpointCoverage(graphCrosslinks.crosslinks || [], canonicalIds, renderedIds);
  const quarantine = buildQuarantine({ graphQuality, graphCrosslinks, claims, contradictions, narrativeObjections, renderedIds });
  const repairActions = buildRepairActions({ normalizedTypes, crosslinkCoverage, quarantine, maintenance, weaknessMap });
  const normalizationLedger = buildNormalizationLedger(normalizedTypes);
  const checks = normalizationChecks({ normalizationLedger, crosslinkCoverage, quarantine, repairActions });
  if (routeManifest.publicApiRoutes) {
    checks.push(
      check({
        id: "public-route-manifest",
        passed: ["/api/graph-scoreboard", "/api/graph-scoreboard/plan", "/api/graph-scoreboard/history"].every((route) =>
          routeManifest.publicApiRoutes.includes(route),
        ),
        severity: "high",
        detail: `${["/api/graph-scoreboard", "/api/graph-scoreboard/plan", "/api/graph-scoreboard/history"].filter((route) => routeManifest.publicApiRoutes.includes(route)).length}/3 graph-scoreboard route(s).`,
        repairAction: "Declare graph-scoreboard report, plan, and history routes in the public route manifest.",
        verificationCommand: "npm run audit:graph-scoreboard && npm run check",
      }),
    );
  }
  if (packageManifest.scripts) {
    checks.push(
      check({
        id: "package-script",
        passed: Boolean(packageManifest.scripts["audit:graph-scoreboard"]),
        severity: "high",
        detail: `audit:graph-scoreboard=${Boolean(packageManifest.scripts["audit:graph-scoreboard"])}`,
        repairAction: "Add the audit:graph-scoreboard package script.",
        verificationCommand: "npm run audit:graph-scoreboard",
      }),
    );
  }
  const dimensions = [
    dimension({
      id: "canonical-entity-coverage",
      label: "Canonical entity coverage",
      score: weightedCoverage(normalizedTypes),
      weight: 0.22,
      detail: `${sum(normalizedTypes.map((item) => item.renderedCount))}/${sum(normalizedTypes.map((item) => item.inventoryCount))} modeled entity reference(s) are represented in the rendered graph.`,
    }),
    dimension({
      id: "canonical-crosslink-coverage",
      label: "Canonical crosslink coverage",
      score: crosslinkCoverage.canonicalScore,
      weight: 0.18,
      detail: `${crosslinkCoverage.canonicalCovered}/${crosslinkCoverage.total} crosslink(s) resolve to canonical evidence entities.`,
    }),
    dimension({
      id: "rendered-crosslink-coverage",
      label: "Rendered crosslink coverage",
      score: crosslinkCoverage.renderedScore,
      weight: 0.18,
      detail: `${crosslinkCoverage.renderedCovered}/${crosslinkCoverage.total} crosslink(s) have both endpoints visible in the rendered graph.`,
    }),
    dimension({
      id: "structural-integrity",
      label: "Structural integrity",
      score: percent(graphQuality.summary.passing, graphQuality.summary.checks),
      weight: 0.16,
      detail: `${graphQuality.summary.passing}/${graphQuality.summary.checks} graph quality check(s) pass.`,
    }),
    dimension({
      id: "quarantine-pressure",
      label: "Quarantine pressure",
      score: quarantineScore(quarantine),
      weight: 0.14,
      detail: `${quarantine.summary.total} quarantine candidate(s), ${quarantine.summary.blocking} blocking, ${quarantine.summary.visiblePressureTests} visible pressure-test, ${quarantine.summary.visibleGovernedRisks} governed risk.`,
    }),
    dimension({
      id: "repair-actionability",
      label: "Repair actionability",
      score: repairActions.length >= 6 ? 100 : percent(repairActions.length, 6),
      weight: 0.12,
      detail: `${repairActions.length} graph repair action(s) generated from weak coverage, quarantine, and maintenance signals.`,
    }),
  ];
  const score = weightedScore(dimensions);
  const failing = checks.filter((check) => !check.passed);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-graph-normalization-scoreboard",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: "/api/graph-scoreboard?refresh=1",
    sourceBoundary:
      "This scoreboard normalizes public-safe local graph, claim, artifact, opportunity, narrative, narrative-objection, weakness, maintenance, and crosslink data. It does not invent collaborators, awards, publications, patents, private documents, external uptime, or production deployment facts.",
    sideEffectBoundary: graphScoreboardPlan().sideEffectBoundary,
    plan: graphScoreboardPlan(),
    summary: {
      score,
      band: bandFor(score),
      renderedNodes: graph.nodes.length,
      renderedEdges: graph.edges.length,
      modeledEntityTypes: normalizedTypes.length,
      modeledEntities: sum(normalizedTypes.map((item) => item.inventoryCount)),
      renderedEntityReferences: sum(normalizedTypes.map((item) => item.renderedCount)),
      crosslinks: crosslinkCoverage.total,
      crosslinksCanonicalCovered: crosslinkCoverage.canonicalCovered,
      crosslinksRenderedCovered: crosslinkCoverage.renderedCovered,
      quarantineCandidates: quarantine.summary.total,
      highSeverityQuarantine: quarantine.summary.highSeverity,
      repairActions: repairActions.length,
      normalizationLedgerItems: normalizationLedger.length,
      publicSafeNormalizationItems: normalizationLedger.filter((item) => item.publicSafe).length,
      thinNormalizationFamilies: normalizationLedger.filter((item) => item.status === "thin").length,
      partialNormalizationFamilies: normalizationLedger.filter((item) => item.status === "partial").length,
      checks: checks.length,
      passing: checks.filter((check) => check.passed).length,
      failing: failing.length,
      auditCoverageScore: weightedCheckScore(checks),
      latestReceiptId: latestReceipt?.id || null,
    },
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    methodology: {
      scale: "0-100 weighted score",
      bandPolicy: "high >= 85, medium >= 65, low < 65",
      dimensions: dimensions.map((item) => ({ id: item.id, weight: item.weight })),
      canonicalIdRule:
        "Every modeled family gets a public-safe canonical ID rule and a promotion policy before relationships can be treated as normalized.",
      projectionRule: "Relationships can be canonical before they become rendered; weak or unsafe edges stay inspection-only until repaired.",
    },
    dimensions,
    normalizedTypes,
    normalizationLedger,
    crosslinkCoverage,
    quarantine,
    checks,
    repairActions,
    nextAction: repairActions[0]?.action || "Keep evidence graph coverage fresh after the next artifact, narrative, or opportunity wave.",
  };
}

function buildGraphScoreboardFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-graph-scoreboard-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "evidence-graph-normalization-scoreboard" ||
    !report.summary ||
    !Array.isArray(report.dimensions) ||
    !Array.isArray(report.normalizedTypes) ||
    !Array.isArray(report.normalizationLedger) ||
    !Array.isArray(report.checks) ||
    !Array.isArray(report.repairActions) ||
    !report.crosslinkCoverage ||
    !report.quarantine ||
    !Array.isArray(report.quarantine.items)
  ) {
    return null;
  }

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: "/api/graph-scoreboard?refresh=1",
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs the evidence graph normalization scoreboard from the latest local receipt. It is not fresh graph analysis and does not prove private graph state, external uptime, production deployment facts, or third-party account state.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || graphScoreboardPlan().sideEffectBoundary,
    plan: graphScoreboardPlan(),
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

function buildGraphScoreboardResponse(report, { detail = "summary" } = {}) {
  const fullDetail = ["full", "all", "detail"].includes(String(detail || "summary").toLowerCase());
  const policy = { fullDetail };
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      fullDetailEndpoint: "/api/graph-scoreboard?detail=full",
      graphScoreboardPayloadPolicy: policy,
    };
  }

  const normalizedTypes = report.normalizedTypes || [];
  const normalizationLedger = report.normalizationLedger || [];
  const checks = report.checks || [];
  const repairActions = report.repairActions || [];
  const quarantine = report.quarantine || { summary: {}, items: [] };
  const crosslinkCoverage = report.crosslinkCoverage || {};
  const statusCounts = Object.fromEntries(countBy(normalizedTypes, (type) => type.status).entries());
  const publicSafeLedgerItems = normalizationLedger.filter((item) => item.publicSafe).length;

  return {
    mode: report.mode,
    detail: "summary",
    fullDetailEndpoint: "/api/graph-scoreboard?detail=full",
    graphScoreboardPayloadPolicy: policy,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachedFromReceipt ? undefined : report.cachePolicy,
    refreshEndpoint: report.refreshEndpoint,
    plan: {
      command: (report.plan || graphScoreboardPlan()).command,
    },
    summary: summarizeGraphScoreboardEndpointSummary(report.summary),
    dimensionScoreSummary: {
      count: (report.dimensions || []).length,
      scores: (report.dimensions || []).map((dimension) => dimension.score),
    },
    normalizedTypeSummary: {
      total: normalizedTypes.length,
      covered: statusCounts.covered || 0,
      partial: statusCounts.partial || 0,
      thin: statusCounts.thin || 0,
      publicSafeLedgerItems,
      ledgerItems: normalizationLedger.length,
    },
    topNormalizedTypes: normalizedTypes
      .slice()
      .sort((left, right) => left.coverageScore - right.coverageScore || right.inventoryCount - left.inventoryCount)
      .slice(0, 3)
      .map((type) => ({
        type: type.type,
        coverageScore: type.coverageScore,
      })),
    crosslinkCoverage: {
      total: crosslinkCoverage.total || 0,
      canonicalCovered: crosslinkCoverage.canonicalCovered || 0,
      renderedCovered: crosslinkCoverage.renderedCovered || 0,
      canonicalScore: crosslinkCoverage.canonicalScore || 0,
      renderedScore: crosslinkCoverage.renderedScore || 0,
    },
    quarantine: {
      summary: summarizeGraphScoreboardQuarantine(quarantine.summary || {}),
      topItems: (quarantine.items || []).slice(0, 1).map((item) => ({
        id: item.id,
        disposition: item.disposition,
        blocking: Boolean(item.blocking),
      })),
    },
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).map((check) => check.id),
    },
    checks: checks.slice(0, 3).map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
    })),
    repairActionPreview: repairActions.slice(0, 1).map((action) => ({
      priority: action.priority,
      area: action.area,
    })),
  };
}

function summarizeGraphScoreboardEndpointSummary(summary = {}) {
  return {
    score: summary.score || 0,
    modeledEntityTypes: summary.modeledEntityTypes || 0,
    crosslinksRenderedCovered: summary.crosslinksRenderedCovered || 0,
    quarantineCandidates: summary.quarantineCandidates || 0,
    normalizationLedgerItems: summary.normalizationLedgerItems || 0,
    publicSafeNormalizationItems: summary.publicSafeNormalizationItems || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
  };
}

function buildEntityTypes({ graph, projects, claims, artifactCatalog, opportunities, maintenance, weaknessMap, skillGapMap, narratives, narrativeObjections, packets }) {
  const graphNodes = graph.nodes || [];
  const artifacts = artifactCatalog.artifacts || [];
  const gaps = artifactCatalog.gaps || [];
  const maintenanceIssues = maintenance.issues || [];
  const opportunityRecords = opportunities.opportunities || [];
  const weaknessRecords = weaknessMap.projects || [];
  const skillRecords = skillGapMap.skills || [];
  const narrativeRecords = narratives.narratives || [];
  const objectionRecords = (narrativeObjections?.audiences || []).flatMap((audience) => audience.objections.map((objection) => ({ audience, objection })));
  const packetRecords = packets.packets || [];

  return [
    typeSpec("person", "Person", ["rishabh"], "identity anchor", "Keep identity nodes sparse and evidence-backed."),
    typeSpec("project", "Projects", projects.map((project) => project.slug), "portfolio core", "Every selected project should remain visible in the semantic graph."),
    typeSpec("skill", "Skills and technologies", skillRecords.map((skill) => `skill-${slugify(skill.label)}`), "skill and technology proof", "Add high-value skill nodes only when tied to projects, claims, or artifacts."),
    typeSpec("claim", "Claims", claims.map((claim) => claim.id), "claim ledger", "Render more top claims or make clear that long-tail claims are inspectable via /api/claims."),
    typeSpec("artifact", "Artifacts", artifacts.map((artifact) => artifact.id), "artifact wall", "Promote the strongest artifacts into graph nodes with project-to-artifact edges."),
    typeSpec("screenshot", "Screenshots", gaps.filter((gap) => gap.gapType === "screenshot").map((gap) => `screenshot-${gap.id}`), "explicit screenshot gap", "Replace screenshot gaps with approved public-safe screenshot artifacts."),
    typeSpec("repository", "Repositories", artifacts.filter((artifact) => artifact.artifactType === "repo-link").map((artifact) => `repository-${artifact.project}`), "repo link artifact", "Represent repo links as first-class graph nodes when they prove implementation depth."),
    typeSpec("demo", "Demos and proof trials", artifacts.filter((artifact) => artifact.artifactType === "live-demo-link").map((artifact) => `demo-${artifact.project}`), "demo link artifact", "Represent replayable demos and proof trials as graph nodes with guardrail labels."),
    typeSpec("award", "Awards and hackathons", projects.filter((project) => /award|winner|hackathon|place/i.test(`${project.outcome} ${project.proof.join(" ")}`)).map((project) => `award-${project.slug}`), "local award text only", "Attach source-backed award proof before making award nodes stronger."),
    typeSpec("institution", "Institutions", graphNodes.filter((node) => node.type === "education").map((node) => node.id), "education graph nodes", "Keep institution nodes grounded in explicit education or public organization records."),
    typeSpec("event", "Events and timelines", projects.map((project) => `timeline-${project.slug}`), "project timeline field", "Turn important timeline moments into dated graph nodes only when source material exists."),
    typeSpec("opportunity", "Opportunities", opportunityRecords.map((opportunity) => `opportunity-${opportunity.id}`), "opportunity engine", "Keep opportunity nodes tied to proof, missing proof, and risk."),
    typeSpec("weakness", "Weaknesses", weaknessRecords.map((project) => `weakness-${project.slug}`), "weakness map", "Expose weakness nodes so graph visitors can see what still needs proof."),
    typeSpec("open-task", "Open tasks", maintenanceIssues.map((issue) => `maintenance-${issue.id}`), "maintenance report", "Represent maintenance issues as repairable graph nodes instead of hidden text."),
    typeSpec("verification-receipt", "Verification receipts", graphNodes.filter((node) => node.type === "verification-receipt").map((node) => node.id), "local receipt history", "Keep recent receipts visible while avoiding stale proof claims."),
    typeSpec("narrative", "Narratives", narrativeRecords.map((narrative) => `narrative-${narrative.id}`), "narrative grounding", "Use narrative nodes only when they link back to claims and artifacts."),
    typeSpec("tailored-narrative", "Tailored narratives", graphNodes.filter((node) => node.type === "tailored-narrative").map((node) => node.id), "manual draft narrative variant", "Keep tailored narrative variants graph-visible only as public-safe manual drafts with claim and artifact lineage."),
    typeSpec(
      "narrative-objection",
      "Narrative objections",
      objectionRecords.map(({ audience, objection }) => `objection-${audience.id}-${objection.id}`),
      "skeptical-reader pressure test",
      "Keep every skeptical objection rendered with claim, artifact, caveat, and repair lineage.",
    ),
    typeSpec("audience-packet", "Audience packets", packetRecords.map((packet) => `packet-${packet.id}`), "audience packet", "Connect packets to narratives, opportunities, claims, and artifacts."),
    typeSpec("domain", "Domains", graphNodes.filter((node) => node.type === "domain").map((node) => node.id), "domain graph nodes", "Keep domain nodes aligned with runtime truth and status receipts."),
    typeSpec("system", "Systems", graphNodes.filter((node) => node.type === "system").map((node) => node.id), "system graph nodes", "Keep system nodes public-safe and avoid implying private runtime access."),
    typeSpec("course", "Courses", graphNodes.filter((node) => node.type === "course").map((node) => node.id), "course graph nodes", "Promote coursework only when it supports a specific evidence path."),
  ].filter((type) => type.inventoryCount > 0);
}

function typeSpec(type, label, ids, source, repairAction) {
  const uniqueIds = orderedUnique(ids);
  return {
    type,
    label,
    ids: uniqueIds,
    inventoryCount: uniqueIds.length,
    source,
    repairAction,
  };
}

function normalizeType(type, renderedIds, renderedByType) {
  const renderedExact = type.ids.filter((id) => renderedIds.has(id)).length;
  const renderedCount = Math.max(renderedExact, renderedByType.get(type.type) || 0);
  const missingIds = type.ids.filter((id) => !renderedIds.has(id)).slice(0, 8);
  const coverageScore = percent(Math.min(renderedCount, type.inventoryCount), type.inventoryCount);
  return {
    type: type.type,
    label: type.label,
    source: type.source,
    inventoryCount: type.inventoryCount,
    renderedCount: Math.min(renderedCount, type.inventoryCount),
    coverageScore,
    status: coverageScore >= 85 ? "covered" : coverageScore >= 35 ? "partial" : "thin",
    missingExamples: missingIds,
    repairAction: type.repairAction,
  };
}

function crosslinkEndpointCoverage(crosslinks, canonicalIds, renderedIds) {
  const records = crosslinks.map((link) => {
    const sourceCanonical = canonicalIds.has(link.source);
    const targetCanonical = canonicalIds.has(link.target);
    const sourceRendered = renderedIds.has(link.source);
    const targetRendered = renderedIds.has(link.target);
    return {
      id: link.id,
      relation: link.relation,
      confidenceScore: link.confidenceScore,
      canonicalCovered: sourceCanonical && targetCanonical,
      renderedCovered: sourceRendered && targetRendered,
      missingCanonicalEndpoints: [sourceCanonical ? null : link.source, targetCanonical ? null : link.target].filter(Boolean),
      missingRenderedEndpoints: [sourceRendered ? null : link.source, targetRendered ? null : link.target].filter(Boolean),
    };
  });
  const canonicalCovered = records.filter((record) => record.canonicalCovered).length;
  const renderedCovered = records.filter((record) => record.renderedCovered).length;
  return {
    total: records.length,
    canonicalCovered,
    renderedCovered,
    canonicalScore: percent(canonicalCovered, records.length),
    renderedScore: percent(renderedCovered, records.length),
    missingCanonical: records.filter((record) => !record.canonicalCovered).slice(0, 10),
    missingRendered: records.filter((record) => !record.renderedCovered).slice(0, 10),
    strongestHiddenLinks: records
      .filter((record) => record.canonicalCovered && !record.renderedCovered)
      .sort((left, right) => right.confidenceScore - left.confidenceScore)
      .slice(0, 10),
  };
}

function buildQuarantine({ graphQuality, graphCrosslinks, claims, contradictions, narrativeObjections, renderedIds }) {
  const items = [
    ...graphQuality.checks
      .filter((check) => !check.passed)
      .map((check) =>
        quarantineItem({
          id: `graph-quality.${check.id}`,
          severity: check.severity,
          type: "graph-quality",
          disposition: "blocking-quarantine",
          reason: check.detail,
          action: "Keep affected graph relationships out of strongest proof ordering until the quality check passes.",
          verificationCommand: "npm run check && node server.js # then open /api/graph-quality",
        }),
      ),
    ...(contradictions.quarantine || []).map((item) =>
      quarantineItem({
        id: item.id,
        severity: "high",
        type: "contradiction",
        disposition: "blocking-quarantine",
        reason: `Contradiction ${item.conflictId} affects ${item.affectedClaims.length} claim(s).`,
        action: item.action,
        verificationCommand: item.verificationCommand,
      }),
    ),
    ...claims
      .filter((claim) => renderedIds.has(claim.id))
      .filter((claim) => claim.evidenceStrength === "needs-source" || claim.freshnessScore < 55 || claim.privacyLevel !== "public")
      .slice(0, 12)
      .map((claim) =>
        quarantineItem({
          id: `claim-risk.${claim.id}`,
          severity: claim.evidenceStrength === "needs-source" ? "medium" : "low",
          type: "claim-risk",
          disposition: claim.evidenceStrength === "needs-source" || claim.freshnessScore < 55 ? "blocking-quarantine" : "visible-governed-risk",
          reason: `${claim.id} is rendered but has ${claim.evidenceStrength} evidence, ${claim.freshnessScore}/100 freshness, and ${claim.privacyLevel} privacy.`,
          action: claim.suggestedRepair || "Review the claim before using it as strong public graph proof.",
          verificationCommand: claim.relatedProject ? `npm run check && node server.js # then open /api/evidence/${claim.relatedProject}` : "npm run check",
        }),
      ),
    ...(narrativeObjections?.audiences || []).flatMap((audience) =>
      audience.objections
        .filter((objection) => objection.riskLevel === "high" || objection.answerabilityScore < 65)
        .map((objection) =>
          quarantineItem({
            id: `objection-risk.${audience.id}.${objection.id}`,
            severity: objection.riskLevel === "high" ? "high" : "medium",
            type: "narrative-objection-risk",
            disposition: "visible-pressure-test",
            reason: `${audience.label} ${objection.id} is ${objection.answerabilityScore}/100 answerable with ${objection.riskLevel} risk.`,
            action: objection.repairAction,
            verificationCommand: objection.verificationCommand || `npm run check && node server.js # then open /api/narrative-objections/${audience.id}`,
          }),
        ),
    ),
    ...(graphCrosslinks.crosslinks || [])
      .filter((link) => link.confidenceScore < 70)
      .slice(0, 8)
      .map((link) =>
        quarantineItem({
          id: `low-confidence-link.${link.id}`,
          severity: "low",
          type: "low-confidence-crosslink",
          disposition: "inspection-only-link",
          reason: `${link.relation} is only ${link.confidenceScore}/100 confidence.`,
          action: "Keep this relationship as inspection-only until a stronger source trace exists.",
          verificationCommand: "npm run check && node server.js # then open /api/graph-crosslinks",
        }),
      ),
  ];

  const blockingItems = items.filter((item) => item.disposition === "blocking-quarantine");
  const governedItems = items.filter((item) => item.disposition !== "blocking-quarantine");
  return {
    summary: {
      total: items.length,
      highSeverity: items.filter((item) => item.severity === "high").length,
      mediumSeverity: items.filter((item) => item.severity === "medium").length,
      lowSeverity: items.filter((item) => item.severity === "low").length,
      blocking: blockingItems.length,
      blockingHighSeverity: blockingItems.filter((item) => item.severity === "high").length,
      blockingMediumSeverity: blockingItems.filter((item) => item.severity === "medium").length,
      blockingLowSeverity: blockingItems.filter((item) => item.severity === "low").length,
      governed: governedItems.length,
      visiblePressureTests: items.filter((item) => item.disposition === "visible-pressure-test").length,
      visibleGovernedRisks: items.filter((item) => item.disposition === "visible-governed-risk").length,
      inspectionOnlyLinks: items.filter((item) => item.disposition === "inspection-only-link").length,
    },
    policy:
      "Quarantine means downgrade or hide from strongest proof paths until source, freshness, privacy, contradiction, or graph-structure evidence improves. It does not delete local records.",
    items,
  };
}

function buildNormalizationLedger(normalizedTypes) {
  return normalizedTypes.map((type) => {
    const missingCount = Math.max(type.inventoryCount - type.renderedCount, 0);
    return {
      id: `normalize-${type.type}`,
      type: type.type,
      label: type.label,
      source: type.source,
      canonicalIdRule: canonicalIdRuleFor(type.type),
      inventoryCount: type.inventoryCount,
      renderedCount: type.renderedCount,
      missingCount,
      coverageScore: type.coverageScore,
      status: type.status,
      publicSafe: true,
      promotionPolicy: type.repairAction,
      verificationCommand: "npm run check && node server.js # then open /api/graph-scoreboard",
    };
  });
}

function normalizationChecks({ normalizationLedger, crosslinkCoverage, quarantine, repairActions }) {
  return [
    check({
      id: "normalization-ledger-depth",
      passed:
        normalizationLedger.length >= 10 &&
        normalizationLedger.every((item) => item.canonicalIdRule && item.promotionPolicy && item.verificationCommand),
      severity: "high",
      detail: `${normalizationLedger.length} canonical family ledger item(s).`,
      repairAction: "Keep every modeled entity family attached to a canonical ID rule and promotion policy.",
      verificationCommand: "npm run check && node server.js # then open /api/graph-scoreboard",
    }),
    check({
      id: "public-safe-normalization",
      passed:
        normalizationLedger.every((item) => item.publicSafe) &&
        normalizationLedger.every((item) => !/credential|inbox|calendar/i.test(`${item.canonicalIdRule} ${item.promotionPolicy}`)),
      severity: "high",
      detail: `${normalizationLedger.filter((item) => item.publicSafe).length}/${normalizationLedger.length} ledger item(s) public-safe.`,
      repairAction: "Remove private or credential-dependent assumptions from graph normalization policies.",
      verificationCommand: "npm run check",
    }),
    check({
      id: "crosslink-canonical-custody",
      passed: crosslinkCoverage.canonicalScore >= 80 && crosslinkCoverage.canonicalCovered > 0,
      severity: "high",
      detail: `${crosslinkCoverage.canonicalCovered}/${crosslinkCoverage.total} crosslink(s) canonical-covered.`,
      repairAction: "Model missing crosslink endpoints before treating relationships as normalized.",
      verificationCommand: "npm run check && node server.js # then open /api/graph-crosslinks and /api/graph-scoreboard",
    }),
    check({
      id: "repair-actions-commanded",
      passed: repairActions.length >= 6 && repairActions.every((item) => item.verificationCommand && item.action),
      severity: "medium",
      detail: `${repairActions.length} repair action(s) with verification commands.`,
      repairAction: "Keep graph normalization repair actions actionable and command-backed.",
      verificationCommand: "npm run check && node server.js # then open /api/graph-scoreboard",
    }),
    check({
      id: "quarantine-policy-visible",
      passed: Boolean(quarantine.policy) && Array.isArray(quarantine.items) && quarantine.items.every((item) => item.verificationCommand),
      severity: "medium",
      detail: `${quarantine.summary.total} quarantine candidate(s); high ${quarantine.summary.highSeverity}.`,
      repairAction: "Keep quarantine policy and repair commands visible for weak graph evidence.",
      verificationCommand: "npm run check && node server.js # then open /api/graph-scoreboard",
    }),
  ];
}

function canonicalIdRuleFor(type) {
  const explicit = {
    person: "stable literal person id, e.g. rishabh",
    project: "project slug from portfolio data",
    claim: "claim ledger id",
    artifact: "artifact catalog id",
    screenshot: "screenshot gap id prefixed with screenshot-",
    repository: "repository artifact project slug prefixed with repository-",
    demo: "demo artifact project slug prefixed with demo-",
    opportunity: "opportunity id prefixed with opportunity-",
    weakness: "project slug prefixed with weakness-",
    "open-task": "maintenance issue id prefixed with maintenance-",
    "verification-receipt": "local receipt node id",
    narrative: "narrative id prefixed with narrative-",
    "narrative-objection": "audience and objection ids prefixed with objection-",
    "audience-packet": "packet id prefixed with packet-",
    domain: "domain/status node id",
    system: "public-safe system node id",
    course: "course node id",
  };
  return explicit[type] || `${type} ids must be stable, public-safe, and source-derived`;
}

function buildRepairActions({ normalizedTypes, crosslinkCoverage, quarantine, maintenance, weaknessMap }) {
  const lowCoverage = normalizedTypes
    .filter((type) => type.status !== "covered")
    .sort((left, right) => left.coverageScore - right.coverageScore || right.inventoryCount - left.inventoryCount)
    .slice(0, 5)
    .map((type) => action({
      priority: type.coverageScore < 25 ? "high" : "medium",
      area: `graph-${type.type}`,
      action: type.repairAction,
      reason: `${type.label} coverage is ${type.coverageScore}/100 (${type.renderedCount}/${type.inventoryCount}).`,
      verificationCommand: "npm run check && node server.js # then open /api/graph-scoreboard",
    }));
  const hiddenCrosslinks = crosslinkCoverage.strongestHiddenLinks.slice(0, 3).map((link) =>
    action({
      priority: "medium",
      area: "graph-crosslink-rendering",
      action: `Render graph endpoints for ${link.relation} so the ${link.confidenceScore}/100 relationship is inspectable.`,
      reason: `Hidden endpoints: ${link.missingRenderedEndpoints.join(", ")}`,
      verificationCommand: "npm run check && node server.js # then open /api/graph-scoreboard",
    }),
  );
  const quarantineActions = quarantine.items.slice(0, 3).map((item) =>
    action({
      priority: item.severity === "high" ? "high" : "medium",
      area: item.type,
      action: item.action,
      reason: item.reason,
      verificationCommand: item.verificationCommand,
    }),
  );
  const maintenanceActions = (maintenance.nextSafeActions || []).slice(0, 2).map((item) =>
    action({
      priority: "medium",
      area: "maintenance",
      action: item.action,
      reason: item.id,
      verificationCommand: item.verificationCommand,
    }),
  );
  const weaknessActions = (weaknessMap.projects || [])
    .filter((project) => project.riskLevel === "high")
    .slice(0, 2)
    .map((project) =>
      action({
        priority: "high",
        area: "project-weakness",
        action: project.improvementActions[0]?.action || `Strengthen proof for ${project.title}.`,
        reason: `${project.title} is high risk in the weakness map.`,
        verificationCommand: `npm run check && node server.js # then open /api/weaknesses/${project.slug}`,
      }),
    );

  return dedupeActions([...lowCoverage, ...hiddenCrosslinks, ...quarantineActions, ...maintenanceActions, ...weaknessActions]).slice(0, 12);
}

function quarantineItem({ id, severity, type, disposition, reason, action, verificationCommand }) {
  return { id, severity, type, disposition, blocking: disposition === "blocking-quarantine", reason, action, verificationCommand };
}

function action({ priority, area, action, reason, verificationCommand }) {
  return { priority, area, action, reason, verificationCommand };
}

function check({ id, passed, severity, detail, repairAction, verificationCommand }) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function dimension({ id, label, score, weight, detail }) {
  const normalized = clamp(Math.round(score), 0, 100);
  return { id, label, score: normalized, band: bandFor(normalized), weight, detail };
}

function weightedCoverage(types) {
  const total = sum(types.map((type) => type.inventoryCount));
  const rendered = sum(types.map((type) => Math.min(type.renderedCount, type.inventoryCount)));
  return percent(rendered, total);
}

function weightedScore(dimensions) {
  const totalWeight = dimensions.reduce((total, item) => total + item.weight, 0);
  if (!totalWeight) return 0;
  return Math.round(dimensions.reduce((total, item) => total + item.score * item.weight, 0) / totalWeight);
}

function quarantineScore(quarantine) {
  const blockingPenalty =
    quarantine.summary.blockingHighSeverity * 18 + quarantine.summary.blockingMediumSeverity * 8 + quarantine.summary.blockingLowSeverity * 3;
  const governedPenalty =
    Math.min(10, quarantine.summary.visiblePressureTests) +
    Math.min(8, Math.ceil(quarantine.summary.visibleGovernedRisks * 0.5)) +
    Math.min(4, quarantine.summary.inspectionOnlyLinks);
  const penalty = blockingPenalty + governedPenalty;
  return clamp(100 - penalty, 0, 100);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function percent(value, total) {
  if (!total) return 100;
  return Math.round((value / total) * 100);
}

function countBy(values, keyFn) {
  const counts = new Map();
  for (const value of values) {
    const key = keyFn(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function orderedUnique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function dedupeActions(actions) {
  const seen = new Set();
  return actions.filter((item) => {
    const key = `${item.priority}:${item.area}:${item.action}:${item.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
}

function appendGraphScoreboardReceipt(root, receipt) {
  const receipts = readGraphScoreboardReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readGraphScoreboardReceipts(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestGraphScoreboardReceipt(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  if (!existsSync(storePath)) return null;
  try {
    const cacheKey = receiptCacheKey(storePath);
    const cached = latestReceiptCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.receipt;
    const text = readFileSync(storePath, "utf8");
    const receiptsIndex = text.indexOf('"receipts"');
    const arrayStart = receiptsIndex === -1 ? -1 : text.indexOf("[", receiptsIndex);
    const objectStart = arrayStart === -1 ? -1 : text.indexOf("{", arrayStart);
    if (objectStart === -1) return null;
    const objectEnd = findJsonObjectEnd(text, objectStart);
    if (objectEnd === -1) return null;
    const receipt = JSON.parse(text.slice(objectStart, objectEnd + 1));
    latestReceiptCache.set(storePath, { cacheKey, receipt });
    return receipt;
  } catch {
    return null;
  }
}

function readGraphScoreboardHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readGraphScoreboardReceipts(root);
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

function buildGraphScoreboardHistory({ receipts = [], limit, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const fullDetail = ["full", "all", "detail"].includes(String(detail || "summary").toLowerCase());
  const boundedLimit = boundedHistoryLimit(limit ?? (fullDetail ? 20 : 5));
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const sourceBoundary =
    "This endpoint returns summarized local graph-scoreboard receipts so history reads stay lightweight. Full normalization ledgers remain in the local receipt store and /api/graph-scoreboard.";
  const sideEffectBoundary =
    "The history endpoint reads local graph-scoreboard receipts only. It does not infer private graph state, publish graph changes, load credentials, contact third parties, or mutate external systems.";
  const historyPayloadPolicy = {
    fullDetail,
    ...(fullDetail
      ? {
          fullDetailEndpoint: "/api/graph-scoreboard/history?detail=full",
          totalAvailable,
          defaultDetail: "summary",
          defaultSummaryLimit: 5,
          compactLatestReceiptDetail: false,
          compactTrendReceipts: 0,
          omittedFromDefault: [],
        }
      : {
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
        }),
  };
  const definitions = {
    fullReportAvailable: true,
    fullHistoryAvailable: true,
    dimensionSummary: {
      total: graphScoreboardDimensionIds(latest).length,
      quarantinePressureAvailable: graphScoreboardDimensionIds(latest).includes("quarantine-pressure"),
    },
    ...(fullDetail
      ? {
          receiptStore: RECEIPT_RELATIVE_PATH,
          compactReceiptFields: [
            "id",
            "checkedAt",
            "summary",
            "dimensionScores",
            "checkSummary",
            "quarantineSummary",
            "topNormalizedTypes",
            "repairActionSummary",
          ],
          compactTrendReceiptFields: [
            "id",
            "checkedAt",
            "summary",
            "dimensionCount",
            "failedCheckCount",
            "repairActionCount",
            "quarantineSummary",
            "latestReceiptPreviewOnly",
          ],
          omittedFromHistory: ["full report", "dimension detail text", "check detail text", "repair action prose", "verification commands"],
        }
      : {}),
  };
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "evidence-graph-scoreboard-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    fullDetailEndpoint: "/api/graph-scoreboard/history?detail=full",
    historyPayloadPolicy,
    ...(fullDetail ? { sourceBoundary, sideEffectBoundary } : {}),
    receiptStore: fullDetail ? RECEIPT_RELATIVE_PATH : undefined,
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
    },
    definitions,
    receipts: fullDetail
      ? limited
      : limited.map((receipt, index) => (index === 0 ? summarizeGraphScoreboardReceipt(receipt) : summarizeGraphScoreboardTrendReceipt(receipt))),
    ...(fullDetail
      ? {
          nextAction: limited[0]
            ? "Graph scoreboard history is available; run npm run audit:graph-scoreboard after graph, crosslink, quality, narrative, claim, artifact, opportunity, or route changes."
            : "Run npm run audit:graph-scoreboard to create graph scoreboard history.",
          verificationCommand: "npm run audit:graph-scoreboard && node --test test/api-contract.test.mjs",
        }
      : {
        }),
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function summarizeGraphScoreboardReceipt(receipt) {
  const report = receipt.report || {};
  const checks = receipt.checks || report.checks || [];
  const repairActions = receipt.sampleRepairActions || report.repairActions || [];
  return {
    id: receipt.id,
    ...summarizeGraphScoreboardSummary(receipt.summary || report.summary),
    dimensionScores: (receipt.dimensions || report.dimensions || []).map((dimension) => dimension.score),
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    },
    quarantineSummary: summarizeGraphScoreboardQuarantine(receipt.quarantineSummary || report.quarantine?.summary),
    topNormalizedTypes: (report.normalizedTypes || [])
      .slice()
      .sort((left, right) => left.coverageScore - right.coverageScore || right.inventoryCount - left.inventoryCount)
      .slice(0, 2)
      .map((type) => ({
        type: type.type,
        inventoryCount: type.inventoryCount,
      })),
    repairActionCount: repairActions.length,
  };
}

function summarizeGraphScoreboardTrendReceipt(receipt) {
  const report = receipt.report || {};
  const checks = receipt.checks || report.checks || [];
  const repairActions = receipt.sampleRepairActions || report.repairActions || [];
  return {
    id: receipt.id,
    trendOnly: true,
    score: (receipt.summary || report.summary)?.score || 0,
    quarantineCandidates: (receipt.summary || report.summary)?.quarantineCandidates || 0,
    failedChecks: checks.filter((check) => !check.passed).length,
    repairActions: repairActions.length,
  };
}

function summarizeGraphScoreboardSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    modeledEntityTypes: summary.modeledEntityTypes || 0,
    modeledEntities: summary.modeledEntities || 0,
    quarantineCandidates: summary.quarantineCandidates || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
  };
}

function summarizeGraphScoreboardQuarantine(summary = {}) {
  return {
    total: summary.total || 0,
    highSeverity: summary.highSeverity || 0,
    blocking: summary.blocking || 0,
    governed: summary.governed || 0,
    visiblePressureTests: summary.visiblePressureTests || 0,
  };
}

function graphScoreboardDimensionIds(receipt) {
  const report = receipt?.report || {};
  return (receipt?.dimensions || report.dimensions || []).map((dimension) => dimension.id);
}

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 20;
  return Math.max(1, Math.min(Math.trunc(numeric), 100));
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

function weightedCheckScore(checks) {
  const weights = { high: 18, medium: 11, low: 6, info: 4 };
  const max = checks.reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

module.exports = {
  appendGraphScoreboardReceipt,
  buildGraphScoreboard,
  buildGraphScoreboardHistory,
  buildGraphScoreboardFromReceipt,
  buildGraphScoreboardResponse,
  graphScoreboardPlan,
  readGraphScoreboardHistoryWindow,
  readGraphScoreboardReceipts,
  readLatestGraphScoreboardReceipt,
};
