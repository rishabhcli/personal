const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const GUARD_ENDPOINT = "/api/graph-projection-guard";
const STORE_RELATIVE_PATH = path.join("var", "graph-projection-guard-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function graphProjectionGuardPlan() {
  return {
    mode: "evidence-graph-projection-guard-plan",
    command: "npm run audit:graph-guard",
    endpoint: GUARD_ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing graph payloads, tailored narratives, claims, artifacts, graph confidence, graph depth scoring, route manifests, or evidence refresh coverage.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe graph projection guard endpoints, writes a local receipt under var/, and does not publish, deploy, enable private data, contact third parties, collect analytics, mutate graph storage, or infer external outcomes.",
  };
}

function buildGraphProjectionGuardReport({
  graph,
  claims,
  artifactCatalog,
  narrativeTailor,
  routeManifest = {},
  refreshPlan = {},
  packageManifest = {},
  receipts = [],
}) {
  const relationships = buildRelationships({ narrativeTailor });
  const nodeIds = new Set((graph.nodes || []).map((node) => node.id));
  const claimIds = new Set((claims || []).map((claim) => claim.id));
  const artifactIds = new Set((artifactCatalog.artifacts || []).map((artifact) => artifact.id));
  const renderedRelationships = relationships.filter((relationship) => nodeIds.has(relationship.source) && nodeIds.has(relationship.target));
  const unresolvedRelationships = relationships.filter((relationship) => !nodeIds.has(relationship.source) || !nodeIds.has(relationship.target));
  const unresolvedRelationshipIds = new Set(unresolvedRelationships.map((relationship) => relationship.id));
  const draftOnlyRelationships = relationships.filter((relationship) => relationship.projection === "draft-only-low-confidence");
  const sourceMissing = relationships.filter((relationship) =>
    relationship.targetType === "claim" ? !claimIds.has(relationship.target) : relationship.targetType === "artifact" ? !artifactIds.has(relationship.target) : false,
  );
  const quarantined = [
    ...unresolvedRelationships,
    ...draftOnlyRelationships.filter((relationship) => !unresolvedRelationshipIds.has(relationship.id)),
  ].map((relationship) => quarantineRelationship(relationship));
  const quarantineLedger = buildQuarantineLedger(quarantined);
  const checks = projectionChecks({
    relationships,
    renderedRelationships,
    unresolvedRelationships,
    sourceMissing,
    quarantined,
    quarantineLedger,
    narrativeTailor,
    claims,
    artifactCatalog,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = scoreChecks(checks);
  const latestReceipt = receipts[0] || null;
  const plan = graphProjectionGuardPlan();

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-graph-projection-guard",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${GUARD_ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This guard validates public-safe graph projections derived from tailored narratives, claims, artifacts, and the rendered graph payload. It does not infer hidden graph nodes, private artifact contents, production analytics, external relationships, or real-world recipient interest.",
    sideEffectBoundary: plan.sideEffectBoundary,
    plan,
    projectionPolicy: {
      renderedRule: "A relationship is rendered only when both source and target appear in the public graph payload.",
      quarantineRule: "Valid public-safe relationships whose nodes are not rendered remain inspection-only with repair guidance, severity, and graph-depth disposition.",
      lowConfidenceRule: "Low-scoring tailored variants may exist as draft-only evidence paths, but they must not be projected as externally ready.",
      privacyRule: "Private references must remain public-safe summaries unless the local privacy workflow changes their projection.",
      receiptRule: "Quarantine receipts must be rerun after graph or tailored narrative changes so stale projection assumptions stay visible.",
    },
    summary: {
      score,
      band: bandFor(score),
      relationships: relationships.length,
      renderedRelationships: renderedRelationships.length,
      unresolvedRelationships: unresolvedRelationships.length,
      quarantinedRelationships: quarantined.length,
      draftOnlyQuarantines: quarantined.filter((item) => item.projectionState === "draft-only-low-confidence").length,
      inspectionOnlyQuarantines: quarantined.filter((item) => item.graphDepthDisposition === "inspection-only-depth-edge").length,
      highSeverityQuarantines: quarantined.filter((item) => item.severity === "high").length,
      sourceMissing: sourceMissing.length,
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      highRiskFailures: failing.filter((check) => check.severity === "high").length,
      quarantineFamilies: quarantineLedger.families.length,
      routeCovered: requiredRoutes().every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(GUARD_ENDPOINT),
      scriptCovered: Boolean((packageManifest.scripts || {})["audit:graph-guard"]),
      latestReceiptId: latestReceipt?.id || null,
    },
    relationships,
    renderedRelationships,
    quarantinedRelationships: quarantined,
    quarantineLedger,
    checks,
    repairActions: repairActionsFor({ checks, quarantined }),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    nonClaims: graphProjectionGuardNonClaims(),
    nextAction: nextActionFor({ checks, quarantined }),
    verificationCommand: "npm run audit:graph-guard && npm run check && npm run verify",
  };
}

function buildGraphProjectionGuardReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-graph-projection-guard-receipt" || !receipt.summary) return null;
  if (!Array.isArray(receipt.relationships) || !Array.isArray(receipt.renderedRelationships) || !Array.isArray(receipt.quarantinedRelationships)) {
    return null;
  }
  if (
    receipt.relationships.length !== receipt.summary.relationships ||
    receipt.renderedRelationships.length !== receipt.summary.renderedRelationships ||
    receipt.quarantinedRelationships.length !== receipt.summary.quarantinedRelationships
  ) {
    return null;
  }
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    label: check.label || labelFor(check.id),
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || `Cached graph projection guard check from ${receipt.id}.`,
    repairAction: check.repairAction || (check.passed ? "No cached graph guard repair needed." : "Refresh graph projection guard and repair the failing check."),
    verificationCommand: check.verificationCommand || "npm run audit:graph-guard",
  }));
  const quarantinedRelationships = receipt.quarantinedRelationships.map((item) => ({
    ...item,
    publicSafe: item.publicSafe !== false,
    manualReviewRequired: item.manualReviewRequired !== false,
  }));

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "evidence-graph-projection-guard",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${GUARD_ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs the graph projection guard from the latest local receipt. It is a fast public-safe cached report, not fresh graph rendering, hosted persistence proof, production analytics, private-document review, or third-party validation.",
    sideEffectBoundary: receipt.sideEffectBoundary || graphProjectionGuardPlan().sideEffectBoundary,
    plan: graphProjectionGuardPlan(),
    projectionPolicy: receipt.projectionPolicy || {
      renderedRule: "A cached relationship was last accepted as rendered only when both source and target appeared in the public graph payload.",
      quarantineRule: "Cached quarantines preserve their last recorded repair guidance, severity, and graph-depth disposition.",
      lowConfidenceRule: "Low-scoring tailored variants remain draft-only until refreshed and manually reviewed.",
      privacyRule: "Private references remain public-safe summaries unless the local privacy workflow changes their projection.",
      receiptRule: "Run npm run audit:graph-guard or ?refresh=1 after graph, narrative, claim, or artifact changes.",
    },
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    relationships: receipt.relationships,
    renderedRelationships: receipt.renderedRelationships,
    quarantinedRelationships,
    quarantineLedger: receipt.quarantineLedger || buildQuarantineLedger(quarantinedRelationships),
    checks,
    repairActions: receipt.repairActions || repairActionsFor({ checks, quarantined: quarantinedRelationships }),
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passing: receipt.summary?.passing || 0,
      checks: receipt.summary?.checks || checks.length,
    },
    nonClaims: receipt.nonClaims || graphProjectionGuardNonClaims(),
    nextAction:
      checks.find((check) => !check.passed)?.repairAction ||
      quarantinedRelationships[0]?.repairAction ||
      "Graph projection guard is served from the latest local receipt; run npm run audit:graph-guard or ?refresh=1 after graph or tailored narrative changes.",
    verificationCommand: "npm run audit:graph-guard && npm run check && npm run verify",
  };
}

function buildGraphProjectionGuardResponse(report, { detail = "summary", relationshipPreviewLimit = 2, quarantinePreviewLimit = 1 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const relationshipLimit = Math.max(2, Math.min(Number(relationshipPreviewLimit) || 2, 90));
  const quarantineLimit = Math.max(1, Math.min(Number(quarantinePreviewLimit) || 1, 60));
  const relationships = report.relationships || [];
  const renderedRelationships = report.renderedRelationships || [];
  const quarantinedRelationships = report.quarantinedRelationships || [];
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${GUARD_ENDPOINT}?detail=full`,
      projectionGuardPayloadPolicy: projectionGuardPayloadPolicy({
        fullDetail,
        relationshipLimit,
        quarantineLimit,
        relationships,
        renderedRelationships,
        quarantinedRelationships,
      }),
    };
  }

  const relationshipPreview = selectProjectionRelationshipPreview(relationships, relationshipLimit);
  const renderedPreview = selectProjectionRelationshipPreview(renderedRelationships, relationshipLimit);
  const quarantinePreview = selectQuarantinePreview(quarantinedRelationships, quarantineLimit);
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachedFromReceipt ? undefined : report.cachePolicy,
    detail: "summary",
    compact: true,
    refreshEndpoint: report.refreshEndpoint,
    fullDetailEndpoint: `${GUARD_ENDPOINT}?detail=full`,
    summary: summarizeGraphProjectionGuardCompactSummary(report.summary),
    relationships: relationshipPreview.map(summarizeProjectionRelationship),
    quarantinedRelationships: quarantinePreview.map(summarizeQuarantinedRelationship),
    quarantineLedger: summarizeQuarantineLedger(report.quarantineLedger),
    checkSummary: summarizeGraphProjectionChecks(report.checks || []),
    repairActionSummary: summarizeGraphProjectionRepairActions(report.repairActions || []),
    projectionGuardPayloadPolicy: projectionGuardPayloadPolicy({
      fullDetail,
      relationshipLimit,
      quarantineLimit,
      relationships,
      renderedRelationships,
      quarantinedRelationships,
      returnedRelationships: relationshipPreview.length,
      returnedRenderedRelationships: renderedPreview.length,
      returnedQuarantinedRelationships: quarantinePreview.length,
    }),
  };
}

function appendGraphProjectionGuardReceipt(root, receipt) {
  const receipts = readGraphProjectionGuardReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readGraphProjectionGuardReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestGraphProjectionGuardReceipt(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
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

function readGraphProjectionGuardHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readGraphProjectionGuardReceipts(root);
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

function buildGraphProjectionGuardHistory({ receipts = [], limit = 20, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  if (fullDetail) {
    return {
      generatedAt: new Date().toISOString(),
      mode: "evidence-graph-projection-guard-history",
      detail: "full",
      compact: false,
      sourceBoundary:
        "This endpoint returns local graph projection guard receipts. It is local receipt history only, not hosted persistence, private-document review, production analytics, or third-party validation.",
      sideEffectBoundary:
        "The history endpoint reads local graph projection guard receipts only. It does not infer hidden graph nodes, inspect private files, contact third parties, publish evidence, collect analytics, or mutate graph storage.",
      receiptStore: STORE_RELATIVE_PATH,
      fullDetailEndpoint: `${GUARD_ENDPOINT}/history?detail=full`,
      summary: graphProjectionHistorySummary({ limited, totalAvailable, boundedLimit, fullDetail }),
      definitions: summarizeGraphProjectionGuardHistoryDefinitions(limited[0], { fullDetail: true }),
      receipts: limited,
      historyPayloadPolicy: graphProjectionHistoryPayloadPolicy({ fullDetail, limited, totalAvailable, boundedLimit }),
      nextAction: limited[0]
        ? "Graph projection guard history is available; run npm run audit:graph-guard after graph, tailored narrative, claim, artifact, or route changes."
        : "Run npm run audit:graph-guard to create graph projection guard history.",
      verificationCommand: "npm run audit:graph-guard && node --test test/api-contract.test.mjs",
    };
  }

  return {
    mode: "evidence-graph-projection-guard-history",
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${GUARD_ENDPOINT}/history?detail=full`,
    summary: graphProjectionHistorySummary({ limited, totalAvailable, boundedLimit, fullDetail }),
    definitions: summarizeGraphProjectionGuardHistoryDefinitions(limited[0], { fullDetail: false }),
    receipts: limited.map((receipt, index) =>
      index === 0 ? summarizeGraphProjectionGuardReceipt(receipt, { fullDetail: false }) : summarizeGraphProjectionGuardTrendReceipt(receipt),
    ),
    historyPayloadPolicy: graphProjectionHistoryPayloadPolicy({ fullDetail, limited, totalAvailable, boundedLimit }),
  };
}

function graphProjectionHistorySummary({ limited, totalAvailable, boundedLimit, fullDetail = false }) {
  const summary = {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: limited[0]?.id || null,
  };
  if (!fullDetail) return summary;
  return {
    ...summary,
    latestCheckedAt: limited[0]?.checkedAt || null,
    latestScore: limited[0]?.summary?.score || 0,
    latestRelationships: limited[0]?.summary?.relationships || 0,
    latestQuarantinedRelationships: limited[0]?.summary?.quarantinedRelationships || 0,
    latestHighSeverityQuarantines: limited[0]?.summary?.highSeverityQuarantines || 0,
  };
}

function summarizeGraphProjectionGuardHistoryDefinitions(receipt, { fullDetail = false } = {}) {
  const checks = receipt?.checks || [];
  if (fullDetail) {
    return {
      evidenceAccess: {
        fullReportEndpoint: `${GUARD_ENDPOINT}?detail=full`,
        refreshEndpoint: `${GUARD_ENDPOINT}?refresh=1`,
        receiptStore: STORE_RELATIVE_PATH,
        fullHistoryEndpoint: `${GUARD_ENDPOINT}/history?detail=full`,
      },
      compactReceiptFields: [
        "id",
        "checkedAt",
        "summary",
        "relationshipPreview",
        "quarantinePreview",
        "checkSummary",
      ],
      checks: checks.map((check) => ({
        id: check.id,
        label: check.label,
        severity: check.severity,
        verificationCommand: check.verificationCommand,
      })),
      omittedFromHistoryCount: 6,
    };
  }
  return {
    checkDefinitions: {
      renderedOrQuarantinedAvailable: checks.some((check) => check.id === "rendered-or-quarantined"),
      verificationCommandsAvailable: checks.some((check) => check.verificationCommand),
    },
  };
}

function graphProjectionHistoryPayloadPolicy({ fullDetail, limited, totalAvailable, boundedLimit }) {
  if (!fullDetail) {
    return {
      fullDetail,
    };
  }
  return {
    fullDetail,
    compact: !fullDetail,
    receiptsReturned: limited.length,
    totalAvailable,
    limit: boundedLimit,
    fullDetailEndpoint: `${GUARD_ENDPOINT}/history?detail=full`,
    previewLimits: fullDetail
      ? null
      : {
          relationshipPreview: 1,
          quarantinePreview: 1,
          repairActionIds: 2,
          checkDefinitions: "id-severity-only",
        },
  };
}

function buildRelationships({ narrativeTailor }) {
  return (narrativeTailor.audiences || []).flatMap((audience) =>
    audience.variants.flatMap((variant) => {
      const variantNode = `tailored-${audience.id}-${variant.id}`;
      return [
        {
          id: `${variantNode}-from-narrative`,
          source: `narrative-${audience.id}`,
          target: variantNode,
          sourceType: "narrative",
          targetType: "tailored-narrative",
          relation: "tailors-narrative",
          confidence: variant.groundingScore,
          projection: variant.groundingScore >= 70 ? "renderable-when-node-exists" : "draft-only-low-confidence",
          explanation: `${audience.label} produces ${variant.label} at ${variant.groundingScore}/100 grounding.`,
          repairAction: variant.repairGuidance[0],
          verificationCommand: variant.verificationCommand,
        },
        ...variant.claimsUsed.slice(0, 4).map((claimId) => ({
          id: `${variantNode}-claim-${claimId}`,
          source: variantNode,
          target: claimId,
          sourceType: "tailored-narrative",
          targetType: "claim",
          relation: "tailored-narrative-uses-claim",
          confidence: variant.groundingScore,
          projection: variant.groundingScore >= 70 ? "renderable-when-node-exists" : "draft-only-low-confidence",
          explanation: `${variant.label} uses claim ${claimId}.`,
          repairAction: variant.repairGuidance[0],
          verificationCommand: variant.verificationCommand,
        })),
        ...variant.artifactsUsed.slice(0, 4).map((artifactId) => ({
          id: `${variantNode}-artifact-${artifactId}`,
          source: variantNode,
          target: artifactId,
          sourceType: "tailored-narrative",
          targetType: "artifact",
          relation: "tailored-narrative-cites-artifact",
          confidence: variant.groundingScore,
          projection: variant.groundingScore >= 70 ? "renderable-when-node-exists" : "draft-only-low-confidence",
          explanation: `${variant.label} cites artifact ${artifactId}.`,
          repairAction: variant.repairGuidance[0],
          verificationCommand: variant.verificationCommand,
        })),
      ];
    }),
  );
}

function quarantineRelationship(relationship) {
  const draftOnly = relationship.projection === "draft-only-low-confidence";
  return {
    id: relationship.id,
    relation: relationship.relation,
    source: relationship.source,
    target: relationship.target,
    sourceType: relationship.sourceType,
    targetType: relationship.targetType,
    confidence: relationship.confidence,
    confidenceBand: bandFor(relationship.confidence),
    severity: draftOnly ? "high" : relationship.targetType === "tailored-narrative" ? "medium" : "low",
    projectionState: draftOnly ? "draft-only-low-confidence" : "valid-but-unrendered",
    graphDepthDisposition: draftOnly ? "quarantined-from-depth-promotion" : "inspection-only-depth-edge",
    publicSafe: true,
    manualReviewRequired: true,
    reason: draftOnly
      ? "Relationship stays draft-only because the tailored variant is low confidence."
      : "Relationship is valid source data but one or both graph nodes are not rendered yet.",
    repairAction: draftOnly
      ? relationship.repairAction
      : `Render ${relationship.source} and ${relationship.target} as public graph nodes, or keep this edge inspection-only.`,
    verificationCommand: relationship.verificationCommand,
  };
}

function buildQuarantineLedger(quarantined) {
  const families = [...new Set(quarantined.map((item) => item.relation))].sort();
  return {
    families,
    severityCounts: {
      high: quarantined.filter((item) => item.severity === "high").length,
      medium: quarantined.filter((item) => item.severity === "medium").length,
      low: quarantined.filter((item) => item.severity === "low").length,
    },
    dispositionCounts: {
      draftOnly: quarantined.filter((item) => item.projectionState === "draft-only-low-confidence").length,
      inspectionOnly: quarantined.filter((item) => item.graphDepthDisposition === "inspection-only-depth-edge").length,
    },
    highestRisk: quarantined
      .slice()
      .sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || left.id.localeCompare(right.id))
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        severity: item.severity,
        confidence: item.confidence,
        disposition: item.graphDepthDisposition,
        repairAction: item.repairAction,
      })),
  };
}

function projectionChecks({
  relationships,
  renderedRelationships,
  unresolvedRelationships,
  sourceMissing,
  quarantined,
  quarantineLedger,
  narrativeTailor,
  claims,
  artifactCatalog,
  routeManifest,
  refreshPlan,
  packageManifest,
}) {
  const privateClaimIds = new Set((claims || []).filter((claim) => claim.privacyLevel !== "public").map((claim) => claim.id));
  const privateArtifactIds = new Set((artifactCatalog.artifacts || []).filter((artifact) => artifact.privacyLevel !== "public").map((artifact) => artifact.id));
  const privateTargets = relationships.filter((relationship) => privateClaimIds.has(relationship.target) || privateArtifactIds.has(relationship.target));
  const lowConfidenceExternalized = (narrativeTailor.audiences || []).flatMap((audience) =>
    audience.variants.filter((variant) => variant.groundingScore < 70 && !/never send|draft-only/i.test(variant.manualUseBoundary)),
  );
  const guardedRelationshipIds = new Set([...renderedRelationships.map((relationship) => relationship.id), ...quarantined.map((relationship) => relationship.id)]);
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const refreshEndpoints = refreshPlan.endpoints || [];
  const scripts = packageManifest.scripts || {};

  return [
    check("relationship-depth", relationships.length >= 30, `${relationships.length} tailored narrative relationship(s).`, "medium", "Keep tailored narrative projection relationships deep enough to cover narrative, claim, and artifact edges.", "npm run audit:graph-guard"),
    check("source-resolution", sourceMissing.length === 0, `${sourceMissing.length} relationship target(s) missing from source claim/artifact data.`, "high", "Repair any projected claim or artifact target that is missing from source data.", "npm run check"),
    check("rendered-or-quarantined", guardedRelationshipIds.size === relationships.length, `${renderedRelationships.length} rendered, ${quarantined.length} quarantined, ${guardedRelationshipIds.size}/${relationships.length} covered relationship(s).`, "high", "Every projection relationship must render, enter the quarantine ledger, or both when draft-only.", "npm run audit:graph-guard"),
    check("quarantine-repair-guidance", quarantined.every((item) => item.repairAction && item.verificationCommand), `${quarantined.length} quarantined relationship(s) include repair guidance.`, "medium", "Attach repair actions and verification commands to every quarantined relationship.", "npm run audit:graph-guard"),
    check("quarantine-depth-disposition", quarantined.length > 0 && quarantined.every((item) => item.graphDepthDisposition && item.manualReviewRequired && item.publicSafe), `${quarantined.length} quarantine item(s) carry graph-depth disposition and manual review gates.`, "high", "Add graph-depth disposition, public-safe status, and manual review gates to quarantine entries.", "npm run audit:graph-guard"),
    check("quarantine-ledger", quarantineLedger.families.length >= 3 && quarantineLedger.highestRisk.length > 0, `${quarantineLedger.families.length} quarantine relation family/families; ${quarantineLedger.highestRisk.length} high-risk ledger item(s).`, "medium", "Keep the quarantine ledger grouped by relation family with highest-risk entries.", "npm run audit:graph-guard"),
    check("low-confidence-draft-only", lowConfidenceExternalized.length === 0, `${lowConfidenceExternalized.length} low-confidence variant(s) missing draft-only boundary.`, "high", "Keep low-confidence tailored variants draft-only before graph projection.", "npm run tailor:narratives && npm run audit:graph-guard"),
    check("private-public-safe", privateTargets.length === 0 || privateTargets.every((item) => item.projection !== "externally-ready"), `${privateTargets.length} private-reference relationship target(s).`, "high", "Keep private-reference projection targets out of externally-ready graph edges.", "npm run check"),
    check("route-manifest", requiredRoutes().every((route) => publicRoutes.includes(route)), `${requiredRoutes().filter((route) => publicRoutes.includes(route)).length}/${requiredRoutes().length} projection guard route(s) declared.`, "medium", "Add graph projection guard report, plan, and history routes to runtimeRouteManifest.", "npm run record:runtime-surface"),
    check("refresh-plan", refreshEndpoints.includes(GUARD_ENDPOINT), `${GUARD_ENDPOINT} refresh coverage.`, "medium", "Add graph projection guard to safe evidence refresh.", "npm run refresh:evidence"),
    check("script-coverage", Boolean(scripts["audit:graph-guard"]), `audit:graph-guard=${Boolean(scripts["audit:graph-guard"])}`, "medium", "Add the audit:graph-guard package script.", "npm run audit:graph-guard"),
  ];
}

function repairActionsFor({ checks, quarantined }) {
  const failing = checks
    .filter((check) => !check.passed)
    .map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    }));
  return [
    ...failing,
    ...quarantined.slice(0, 5).map((item) => ({
      id: item.id,
      priority: item.severity,
      action: item.repairAction,
      verificationCommand: item.verificationCommand,
    })),
  ].filter((item) => item.action);
}

function nextActionFor({ checks, quarantined }) {
  const failing = checks.find((check) => !check.passed);
  if (failing) return `${failing.label}: ${failing.repairAction}`;
  return quarantined[0]?.repairAction || "Keep graph projection guards refreshed as tailored narrative relationships change.";
}

function graphProjectionGuardNonClaims() {
  return [
    "Does not prove production graph persistence, hosted graph rendering, or deployed graph storage.",
    "Does not inspect private files, private dashboards, inboxes, or unapproved artifacts.",
    "Does not claim audience interest, admissions results, hiring outcomes, funding, interviews, or third-party validation.",
    "Does not promote quarantined relationships as externally ready.",
  ];
}

function check(id, passed, detail, severity, repairAction, verificationCommand) {
  return {
    id,
    label: labelFor(id),
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function requiredRoutes() {
  return [GUARD_ENDPOINT, `${GUARD_ENDPOINT}/plan`, `${GUARD_ENDPOINT}/history`];
}

function scoreChecks(checks) {
  if (!checks.length) return 0;
  const weights = { high: 1.4, medium: 1 };
  const max = checks.reduce((sum, check) => sum + weights[check.severity], 0);
  const earned = checks.filter((check) => check.passed).reduce((sum, check) => sum + weights[check.severity], 0);
  return Math.round((earned / max) * 100);
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function severityRank(value) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function labelFor(id) {
  return id
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function summarizeGraphProjectionGuardReceipt(receipt) {
  const checks = receipt.checks || [];
  return {
    id: receipt.id,
    summary: summarizeGraphProjectionGuardHistorySummary(receipt.summary),
    relationshipPreview: selectProjectionRelationshipPreview(receipt.relationships || [], 1).map(summarizeProjectionRelationship),
    quarantinePreview: selectQuarantinePreview(receipt.quarantinedRelationships || [], 1).map(summarizeQuarantinedRelationship),
    checkSummary: {
      total: checks.length,
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    },
  };
}

function summarizeGraphProjectionGuardTrendReceipt(receipt) {
  return {
    id: receipt.id,
    summary: summarizeGraphProjectionGuardHistorySummary(receipt.summary),
  };
}

function summarizeGraphProjectionGuardHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    relationships: summary.relationships || 0,
    quarantinedRelationships: summary.quarantinedRelationships || 0,
    checks: summary.checks || 0,
    failing: summary.failing || 0,
  };
}

function selectProjectionRelationshipPreview(relationships, limit) {
  const selected = [];
  const seen = new Set();
  for (const relation of relationOrder(relationships)) {
    pushUniqueRelationship(selected, seen, relationships.find((relationship) => relationship.relation === relation));
  }
  for (const relationship of relationships) {
    if (selected.length >= limit) break;
    pushUniqueRelationship(selected, seen, relationship);
  }
  return selected.slice(0, limit);
}

function selectQuarantinePreview(quarantined, limit) {
  return quarantined
    .slice()
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || right.confidence - left.confidence || left.id.localeCompare(right.id))
    .slice(0, limit);
}

function pushUniqueRelationship(selected, seen, relationship) {
  if (!relationship || seen.has(relationship.id)) return;
  selected.push(relationship);
  seen.add(relationship.id);
}

function relationOrder(relationships) {
  return [...new Set((relationships || []).map((relationship) => relationship.relation))].sort();
}

function summarizeProjectionRelationship(relationship) {
  return {
    relation: relationship.relation,
  };
}

function summarizeQuarantinedRelationship(item) {
  return {
    graphDepthDisposition: item.graphDepthDisposition,
    manualReviewRequired: item.manualReviewRequired !== false,
  };
}

function summarizeQuarantineLedger(ledger = {}) {
  return {
    familyCount: ledger.families?.length || 0,
    severityCounts: ledger.severityCounts || {},
    dispositionCounts: ledger.dispositionCounts || {},
    highestRiskCount: (ledger.highestRisk || []).length,
  };
}

function summarizeGraphProjectionRepairActions(actions = []) {
  return {
    total: actions.length,
    high: actions.filter((action) => action.priority === "high").length,
    medium: actions.filter((action) => action.priority === "medium").length,
  };
}

function summarizeGraphProjectionGuardCompactSummary(summary = {}) {
  return {
    relationships: summary.relationships || 0,
    renderedRelationships: summary.renderedRelationships || 0,
    unresolvedRelationships: summary.unresolvedRelationships || 0,
    quarantinedRelationships: summary.quarantinedRelationships || 0,
    draftOnlyQuarantines: summary.draftOnlyQuarantines || 0,
    inspectionOnlyQuarantines: summary.inspectionOnlyQuarantines || 0,
    sourceMissing: summary.sourceMissing || 0,
    checks: summary.checks || 0,
    failing: summary.failing || 0,
    routeCovered: Boolean(summary.routeCovered),
    refreshCovered: Boolean(summary.refreshCovered),
    scriptCovered: Boolean(summary.scriptCovered),
  };
}

function summarizeGraphProjectionChecks(checks = []) {
  return {
    total: checks.length,
    passing: checks.filter((check) => check.passed).length,
    failing: checks.filter((check) => !check.passed).length,
    highSeverity: checks.filter((check) => check.severity === "high").length,
  };
}

function summarizeGraphProjectionCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function projectionGuardPayloadPolicy({
  fullDetail,
  relationshipLimit,
  quarantineLimit,
  relationships,
  renderedRelationships,
  quarantinedRelationships,
  returnedRelationships = relationships.length,
  returnedRenderedRelationships = renderedRelationships.length,
  returnedQuarantinedRelationships = quarantinedRelationships.length,
}) {
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail,
    relationshipPreviewLimit: relationshipLimit,
    quarantinePreviewLimit: quarantineLimit,
    relationshipsReturned: returnedRelationships,
    totalRelationships: relationships.length,
    renderedRelationshipsReturned: returnedRenderedRelationships,
    totalRenderedRelationships: renderedRelationships.length,
    quarantinedRelationshipsReturned: returnedQuarantinedRelationships,
    totalQuarantinedRelationships: quarantinedRelationships.length,
    fullDetailEndpoint: `${GUARD_ENDPOINT}?detail=full`,
  };
}

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 20;
  return Math.max(1, Math.min(Math.trunc(numeric), maxReceipts));
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

module.exports = {
  GUARD_ENDPOINT,
  appendGraphProjectionGuardReceipt,
  buildGraphProjectionGuardHistory,
  buildGraphProjectionGuardReportFromReceipt,
  buildGraphProjectionGuardReport,
  buildGraphProjectionGuardResponse,
  graphProjectionGuardPlan,
  readGraphProjectionGuardHistoryWindow,
  readGraphProjectionGuardReceipts,
  readLatestGraphProjectionGuardReceipt,
};
