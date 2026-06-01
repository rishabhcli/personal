const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/graph-confidence";
const STORE_RELATIVE_PATH = path.join("var", "graph-confidence-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();
const COMPACT_CHECK_PREVIEW_IDS = ["high-confidence-explicitness", "disclosure-confidence-cap", "projection-guard-coherence"];
const COMPACT_CHECK_PREVIEW_LIMIT = 3;

function graphConfidencePlan() {
  return {
    mode: "evidence-graph-confidence-plan",
    command: "npm run audit:graph-confidence",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing graph crosslinks, narrative disclosures, tailored narrative projections, route manifests, or evidence refresh coverage.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe graph confidence endpoints, writes a local receipt under var/, and does not publish, deploy, enable private data, contact third parties, collect analytics, or mutate external systems.",
  };
}

function buildGraphConfidenceReport({
  graphCrosslinks,
  graphDisclosureLinks,
  graphProjectionGuard,
  routeManifest,
  refreshPlan,
  packageManifest,
  receipts = [],
}) {
  const relationships = [
    ...crosslinkRelationships(graphCrosslinks),
    ...disclosureRelationships(graphDisclosureLinks),
    ...projectionRelationships(graphProjectionGuard),
  ].sort((left, right) => right.confidenceScore - left.confidenceScore || left.id.localeCompare(right.id));
  const checks = reportChecks({
    relationships,
    graphCrosslinks,
    graphDisclosureLinks,
    graphProjectionGuard,
    routeManifest,
    refreshPlan,
    packageManifest,
  });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-graph-confidence-guard",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This guard audits confidence rules across public-safe graph crosslinks, disclosure graph edges, and tailored narrative projection guards. It does not assert production graph persistence, infer private relationships, inspect private files, or claim real-world audience outcomes.",
    sideEffectBoundary:
      "This endpoint reads public-safe in-memory graph reports and local receipt history only. It does not publish, mutate graph storage, enable private routes, contact third parties, send messages, or collect analytics.",
    plan: graphConfidencePlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      relationships: relationships.length,
      families: new Set(relationships.map((relationship) => relationship.family)).size,
      relationTypes: new Set(relationships.map((relationship) => relationship.relation)).size,
      averageConfidence: average(relationships.map((relationship) => relationship.confidenceScore)),
      highConfidenceRelationships: relationships.filter((relationship) => relationship.confidenceScore > 92).length,
      inferredProjectRelationships: relationships.filter((relationship) => relationship.confidenceClass === "inferred-project").length,
      cappedRelationships: relationships.filter((relationship) => relationship.capApplied).length,
      publicSafeRelationships: relationships.filter((relationship) => relationship.publicSafe).length,
      routeCovered: [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => (routeManifest.publicApiRoutes || []).includes(route)),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      latestReceiptId: latestReceipt?.id || null,
    },
    confidencePolicy: graphConfidencePolicy(),
    relationships,
    relationTypes: relationSummary(relationships),
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nonClaims: graphConfidenceNonClaims(),
    nextAction:
      failing[0]?.repairAction ||
      "Graph confidence rules are coherent across crosslinks, disclosure edges, and projection guards; rerun after graph, narrative, claim, artifact, route, or refresh changes.",
    verificationCommand: "npm run audit:graph-confidence && npm run check && npm run verify",
  };
}

function buildGraphConfidenceReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-graph-confidence-receipt" || !receipt.summary) return null;
  if (!Array.isArray(receipt.relationships) || receipt.relationships.length !== receipt.summary.relationships) return null;
  const relationships = receipt.relationships.map((relationship) => ({
    family: relationship.family || "cached",
    sourceReport: "graph-confidence receipt",
    id: relationship.id,
    source: relationship.source || `cached:${relationship.family || "relationship"}`,
    target: relationship.target || `cached:${relationship.relation || "target"}`,
    relation: relationship.relation,
    confidenceScore: relationship.confidenceScore || 0,
    confidenceClass: relationship.confidenceClass || "cached",
    confidenceBasis: relationship.confidenceBasis || [{ type: "graph-confidence-receipt", id: receipt.id, score: relationship.confidenceScore || 0 }],
    publicSafe: relationship.publicSafe !== false,
    explanation: relationship.explanation || `Cached graph confidence relationship from ${receipt.id}. Refresh to recompute full relationship evidence.`,
    verificationCommand: relationship.verificationCommand || "npm run audit:graph-confidence",
    capApplied: Boolean(relationship.capApplied),
  }));
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || `Cached graph confidence check from ${receipt.id}.`,
    repairAction: check.passed ? "No cached graph confidence repair needed." : "Refresh graph confidence and repair the failing cached check.",
    verificationCommand: "npm run audit:graph-confidence",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "evidence-graph-confidence-guard",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs graph confidence from the latest local receipt. It is a fast public-safe cached report, not production graph persistence, deployed rendering, or private relationship proof.",
    sideEffectBoundary: receipt.sideEffectBoundary || graphConfidencePlan().sideEffectBoundary,
    plan: graphConfidencePlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passing: receipt.summary?.passing || 0,
      checks: receipt.summary?.checks || checks.length,
      relationships: receipt.summary?.relationships || relationships.length,
    },
    confidencePolicy: receipt.confidencePolicy || graphConfidencePolicy(),
    relationships,
    relationTypes: receipt.relationTypes || relationSummary(relationships),
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nonClaims: graphConfidenceNonClaims(),
    nextAction:
      failing[0]?.repairAction ||
      "Graph confidence is served from the latest local receipt; run npm run audit:graph-confidence or ?refresh=1 after graph, narrative, claim, artifact, route, or refresh changes.",
    verificationCommand: "npm run audit:graph-confidence && npm run check && npm run verify",
  };
}

function buildGraphConfidenceResponse(report, { detail = "summary", previewLimit = 3 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedPreview = Math.max(3, Math.min(Number(previewLimit) || 3, 150));
  const relationships = report.relationships || [];
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      relationshipPayloadPolicy: relationshipPayloadPolicy({
        fullDetail,
        previewLimit: boundedPreview,
        returned: relationships.length,
        total: relationships.length,
        relationships,
      }),
    };
  }

  const preview = selectRelationshipPreview(relationships, boundedPreview);
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    refreshEndpoint: report.refreshEndpoint,
    detail: "summary",
    compact: true,
    sourceBoundaryAvailable: Boolean(report.sourceBoundary),
    summary: summarizeGraphConfidenceSummary(report.summary),
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    relationships: preview.map(summarizeRelationship),
    relationTypes: (report.relationTypes || []).slice(0, 3),
    checks: selectGraphConfidenceCheckPreview(report.checks || []).map(summarizeGraphConfidenceCheck),
    nonClaimCount: (report.nonClaims || []).length,
    relationshipPayloadPolicy: relationshipPayloadPolicy({
      fullDetail,
      previewLimit: boundedPreview,
      returned: preview.length,
      total: relationships.length,
      relationships: preview,
    }),
  };
}

function appendGraphConfidenceReceipt(root, receipt) {
  const receipts = readGraphConfidenceReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readGraphConfidenceReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestGraphConfidenceReceipt(root) {
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

function readGraphConfidenceHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readGraphConfidenceReceipts(root);
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

function buildGraphConfidenceHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "evidence-graph-confidence-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "This endpoint returns local graph-confidence receipts with full recorded relationship and check detail. It does not infer private relationships, contact third parties, publish evidence, load credentials, collect analytics, or mutate external systems."
      : undefined,
    sideEffectBoundary:
      fullDetail
        ? "The history endpoint reads local graph-confidence receipts only. It does not infer private relationships, contact third parties, publish evidence, load credentials, collect analytics, or mutate external systems."
        : undefined,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          fullDetail,
          latestReceiptPreview: "full-receipt",
          olderReceiptPreview: "full-receipt",
        }
      : {
          fullDetail,
          fullDetailAvailable: true,
          historyRowsReturned: limited.length,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: limited[0]?.id || null,
    },
    definitions: fullDetail
      ? undefined
      : {
          fullReportAvailable: true,
          fullHistoryAvailable: true,
        },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeGraphConfidenceReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Graph confidence history is available; run npm run audit:graph-confidence after graph, narrative, claim, artifact, route, or refresh changes."
        : "Run npm run audit:graph-confidence to create graph confidence history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:graph-confidence && node --test test/api-contract.test.mjs" : undefined,
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function crosslinkRelationships(graphCrosslinks) {
  return (graphCrosslinks.crosslinks || []).map((link) => {
    const confidenceClass = confidenceClassFor(link.relation);
    return relationship({
      family: "crosslink",
      sourceReport: graphCrosslinks.mode,
      id: link.id,
      source: link.source,
      target: link.target,
      relation: link.relation,
      confidenceScore: link.confidenceScore,
      confidenceClass,
      confidenceBasis: [{ type: "crosslink-rule", id: link.relation, score: link.confidenceScore }],
      publicSafe: link.publicProjection === "public-safe",
      explanation: link.explanation,
      verificationCommand: "npm run check && node server.js # then open /api/graph-crosslinks",
      capApplied: confidenceClass !== "inferred-project" || link.confidenceScore <= 88,
    });
  });
}

function disclosureRelationships(graphDisclosureLinks) {
  return (graphDisclosureLinks.relationships || []).map((edge) =>
    relationship({
      family: "disclosure",
      sourceReport: graphDisclosureLinks.mode,
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      confidenceScore: edge.confidenceScore,
      confidenceClass: "disclosure-capped",
      confidenceBasis: edge.confidenceBasis || [],
      publicSafe: edge.privacyLevel === "public-safe",
      explanation: edge.explanation,
      verificationCommand: edge.verificationCommand || "npm run audit:graph-disclosures",
      capApplied: confidenceWithinBasis(edge),
    }),
  );
}

function projectionRelationships(graphProjectionGuard) {
  return (graphProjectionGuard.relationships || []).map((edge) =>
    relationship({
      family: "projection",
      sourceReport: graphProjectionGuard.mode,
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      confidenceScore: edge.confidence,
      confidenceClass: edge.projection === "draft-only-low-confidence" ? "projection-draft" : "projection-guarded",
      confidenceBasis: [{ type: "tailored-projection-grounding", id: edge.id, score: edge.confidence }],
      publicSafe: edge.projection !== "externally-ready",
      explanation: edge.explanation,
      verificationCommand: edge.verificationCommand || "npm run check && node server.js # then open /api/graph-projection-guard",
      capApplied: Number.isInteger(edge.confidence) && edge.confidence <= 100,
    }),
  );
}

function relationship({
  family,
  sourceReport,
  id,
  source,
  target,
  relation,
  confidenceScore,
  confidenceClass,
  confidenceBasis,
  publicSafe,
  explanation,
  verificationCommand,
  capApplied,
}) {
  return {
    family,
    sourceReport,
    id,
    source,
    target,
    relation,
    confidenceScore: clamp(Math.round(confidenceScore || 0), 0, 100),
    confidenceClass,
    confidenceBasis,
    publicSafe: Boolean(publicSafe),
    explanation,
    verificationCommand,
    capApplied: Boolean(capApplied),
  };
}

function reportChecks({ relationships, graphCrosslinks, graphDisclosureLinks, graphProjectionGuard, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const families = new Set(relationships.map((relationship) => relationship.family));
  const highConfidence = relationships.filter((relationship) => relationship.confidenceScore > 92);
  const highConfidenceExplicit = highConfidence.filter(hasExplicitHighConfidenceBasis);
  const inferredProject = relationships.filter((relationship) => relationship.confidenceClass === "inferred-project");
  const disclosure = relationships.filter((relationship) => relationship.family === "disclosure");
  const missingExternalOutcomeClaims = relationships.filter((relationship) =>
    /interview|funding|admission|hiring|recipient interest|third-party validation/i.test(relationship.explanation || ""),
  );

  return [
    check(
      "relationship-family-coverage",
      ["crosslink", "disclosure", "projection"].every((family) => families.has(family)) &&
        (graphCrosslinks.crosslinks || []).length > 0 &&
        (graphDisclosureLinks.relationships || []).length > 0 &&
        (graphProjectionGuard.relationships || []).length > 0,
      "high",
      `${relationships.length} relationship(s) across ${families.size} family/families.`,
      "Keep crosslink, disclosure, and projection reports wired into the graph confidence guard.",
      "npm run audit:graph-confidence",
    ),
    check(
      "confidence-bounds",
      relationships.length > 0 && relationships.every((relationship) => Number.isInteger(relationship.confidenceScore) && relationship.confidenceScore >= 0 && relationship.confidenceScore <= 100),
      "high",
      `${relationships.length} relationship confidence score(s) normalized to 0-100.`,
      "Normalize graph confidence scores to integer 0-100 values.",
      "npm run check",
    ),
    check(
      "public-safe-explained",
      relationships.every((relationship) => relationship.publicSafe && relationship.explanation && relationship.verificationCommand),
      "high",
      `${relationships.filter((relationship) => relationship.publicSafe && relationship.explanation && relationship.verificationCommand).length}/${relationships.length} relationship(s) are public-safe, explained, and verifiable.`,
      "Restore public-safe flags, explanations, and verification commands for graph confidence relationships.",
      "npm run check",
    ),
    check(
      "high-confidence-explicitness",
      highConfidence.length > 0 && highConfidence.length === highConfidenceExplicit.length,
      "high",
      `${highConfidenceExplicit.length}/${highConfidence.length} high-confidence relationship(s) have explicit modeled IDs.`,
      "Cap or reclassify high-confidence relationships unless they are tied to explicit claim, artifact, narrative, disclosure, objection, or tailored narrative IDs.",
      "npm run audit:graph-confidence",
    ),
    check(
      "inferred-project-cap",
      inferredProject.length > 0 && inferredProject.every((relationship) => relationship.confidenceScore <= 88),
      "high",
      `${inferredProject.filter((relationship) => relationship.confidenceScore <= 88).length}/${inferredProject.length} inferred project relationship(s) stay at or below 88.`,
      "Lower inferred project relationship confidence scores to 88 or below.",
      "npm run check",
    ),
    check(
      "disclosure-confidence-cap",
      graphDisclosureLinks.summary?.confidenceCapped === true && disclosure.length > 0 && disclosure.every((relationship) => relationship.capApplied),
      "high",
      `${disclosure.filter((relationship) => relationship.capApplied).length}/${disclosure.length} disclosure relationship(s) obey backing-score caps.`,
      "Cap disclosure relationships at the lowest backing bundle, narrative, claim, artifact, objection, or repair score.",
      "npm run audit:graph-disclosures",
    ),
    check(
      "projection-guard-coherence",
      (graphProjectionGuard.summary?.score || 0) >= 85 &&
        (graphProjectionGuard.summary?.sourceMissing || 0) === 0 &&
        (graphProjectionGuard.summary?.highRiskFailures || 0) === 0,
      "medium",
      `${graphProjectionGuard.summary?.score || 0}/100 projection guard; ${graphProjectionGuard.summary?.sourceMissing || 0} missing source target(s).`,
      "Repair projection guard source resolution, quarantine, or low-confidence draft boundaries.",
      "npm run check && node server.js # then open /api/graph-projection-guard",
    ),
    check(
      "no-external-outcome-claims",
      missingExternalOutcomeClaims.length === 0,
      "medium",
      `${missingExternalOutcomeClaims.length} external outcome overclaim(s) detected in graph confidence explanations.`,
      "Remove or caveat graph confidence wording that implies audience interest, admissions, hiring, funding, interviews, or third-party validation.",
      "npm run check",
    ),
    check(
      "route-manifest",
      [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => publicRoutes.includes(route)),
      "medium",
      `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => publicRoutes.includes(route)).length}/3 graph confidence route(s) declared.`,
      "Add graph confidence routes to runtimeRouteManifest.",
      "npm run record:runtime-surface",
    ),
    check(
      "refresh-plan",
      (refreshPlan.endpoints || []).includes(ENDPOINT),
      "medium",
      `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"} in safe evidence refresh.`,
      "Add graph confidence to the safe evidence refresh plan.",
      "npm run refresh:evidence",
    ),
    check(
      "script-coverage",
      Boolean(packageManifest.scripts?.["audit:graph-confidence"]),
      "medium",
      `audit:graph-confidence=${Boolean(packageManifest.scripts?.["audit:graph-confidence"])}`,
      "Add the audit:graph-confidence package script.",
      "npm run audit:graph-confidence",
    ),
  ];
}

function confidenceClassFor(relation) {
  if (relation === "opportunity-sourced-from-project" || relation === "maintenance-flags-project" || relation === "narrative-objection-concerns-project") {
    return "inferred-project";
  }
  if (/objection/.test(relation)) return "objection-path";
  return "direct-evidence";
}

function hasExplicitHighConfidenceBasis(relationship) {
  return /(claim|artifact|narrative|disclosure|objection|tailored)/i.test(`${relationship.relation} ${relationship.source} ${relationship.target}`);
}

function confidenceWithinBasis(relationship) {
  if (!relationship.confidenceBasis?.length) return false;
  const cap = Math.min(...relationship.confidenceBasis.map((item) => item.score));
  return relationship.confidenceScore <= cap;
}

function relationSummary(relationships) {
  const counts = new Map();
  for (const relationship of relationships) counts.set(relationship.relation, (counts.get(relationship.relation) || 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([relation, count]) => ({ relation, count }));
}

function summarizeGraphConfidenceReceipt(receipt, { includePreview = true } = {}) {
  const summary = receipt.summary || {};
  if (!includePreview) {
    // Older receipts are trend-only rows; full per-receipt summary, family
    // breakdown, and check detail remain available via ?detail=full.
    return {
      id: receipt.id,
      trendOnly: true,
      score: summary.score || 0,
      relationshipCount: summary.relationships || 0,
      families: summary.families || 0,
      relationTypes: summary.relationTypes || 0,
    };
  }
  const checks = receipt.checks || [];
  const relationships = receipt.relationships || [];
  return {
    id: receipt.id,
    score: summary.score || 0,
    band: summary.band || "unknown",
    relationshipCount: summary.relationships || 0,
    families: summary.families || 0,
    relationTypes: summary.relationTypes || 0,
    relationshipSummary: summarizeHistoryRelationshipSet(relationships),
    checkSummary: {
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    },
    relationshipPreview: (receipt.sampleRelationships?.length ? receipt.sampleRelationships : relationships)
      .slice(0, 1)
      .map(summarizeHistoryRelationship),
  };
}

function summarizeHistoryRelationshipSet(relationships) {
  // Family breakdown only; total/families/relationTypes already live in the
  // sibling `summary` block, so they are not duplicated here.
  const familyCounts = relationships.reduce((counts, relationship) => {
    if (relationship.family) counts[relationship.family] = (counts[relationship.family] || 0) + 1;
    return counts;
  }, {});
  return {
    crosslink: familyCounts.crosslink || 0,
    disclosure: familyCounts.disclosure || 0,
    projection: familyCounts.projection || 0,
  };
}

function summarizeGraphConfidenceSummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    failing: summary.failing || 0,
    relationships: summary.relationships || 0,
    families: summary.families || 0,
    relationTypes: summary.relationTypes || 0,
    averageConfidence: summary.averageConfidence || 0,
    highConfidenceRelationships: summary.highConfidenceRelationships || 0,
    inferredProjectRelationships: summary.inferredProjectRelationships || 0,
    routeCovered: Boolean(summary.routeCovered),
    refreshCovered: Boolean(summary.refreshCovered),
  };
}

function selectGraphConfidenceCheckPreview(checks) {
  const selected = [];
  const seen = new Set();
  for (const check of checks.filter((item) => !item.passed)) pushUniqueCheck(selected, seen, check);
  for (const id of COMPACT_CHECK_PREVIEW_IDS) pushUniqueCheck(selected, seen, checks.find((check) => check.id === id));
  for (const check of checks) {
    if (selected.length >= COMPACT_CHECK_PREVIEW_LIMIT) break;
    pushUniqueCheck(selected, seen, check);
  }
  return selected.slice(0, COMPACT_CHECK_PREVIEW_LIMIT);
}

function summarizeGraphConfidenceHistorySummary(summary = {}) {
  return {
    score: summary.score || 0,
    band: summary.band || "unknown",
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    failing: summary.failing || 0,
    relationships: summary.relationships || 0,
    families: summary.families || 0,
    relationTypes: summary.relationTypes || 0,
  };
}

function selectRelationshipPreview(relationships, limit) {
  const selected = [];
  const seen = new Set();
  for (const family of ["crosslink", "disclosure", "projection"]) {
    pushUniqueRelationship(selected, seen, relationships.find((relationship) => relationship.family === family));
  }
  for (const relation of relationOrder(relationships)) {
    if (selected.length >= limit) break;
    pushUniqueRelationship(selected, seen, relationships.find((relationship) => relationship.relation === relation));
  }
  for (const relationship of relationships) {
    if (selected.length >= limit) break;
    pushUniqueRelationship(selected, seen, relationship);
  }
  return selected.slice(0, limit);
}

function pushUniqueRelationship(selected, seen, relationship) {
  if (!relationship || seen.has(relationship.id)) return;
  selected.push(relationship);
  seen.add(relationship.id);
}

function pushUniqueCheck(selected, seen, check) {
  if (!check || seen.has(check.id)) return;
  selected.push(check);
  seen.add(check.id);
}

function summarizeRelationship(relationship) {
  return {
    family: relationship.family,
    relation: relationship.relation,
    confidenceScore: relationship.confidenceScore,
    publicSafe: relationship.publicSafe !== false,
    verificationCommandAvailable: Boolean(relationship.verificationCommand),
  };
}

function summarizeGraphConfidenceCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity,
  };
}

function summarizeHistoryRelationship(relationship) {
  return {
    family: relationship.family,
    relation: relationship.relation,
    score: relationship.confidenceScore,
    publicSafe: relationship.publicSafe !== false,
  };
}

function relationOrder(relationships) {
  return [...new Set((relationships || []).map((relationship) => relationship.relation))].sort();
}

function relationshipPayloadPolicy({ fullDetail, previewLimit, returned, total, relationships }) {
  const policy = {
    fullDetail,
    previewLimit,
    relationshipsReturned: returned,
    totalRelationships: total,
  };
  if (fullDetail) {
    policy.familiesReturned = new Set((relationships || []).map((relationship) => relationship.family)).size;
    policy.relationTypesReturned = new Set((relationships || []).map((relationship) => relationship.relation)).size;
  }
  return policy;
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, 50));
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

function check(id, passed, severity, detail, repairAction, verificationCommand) {
  return {
    id,
    passed: Boolean(passed),
    severity,
    detail,
    repairAction,
    verificationCommand,
  };
}

function graphConfidencePolicy() {
  return {
    directEvidenceRule:
      "Relationships derived from explicit claim, artifact, narrative, disclosure, objection, or tailored narrative IDs may score above 90 only when they carry an explanation and verification command.",
    inferredProjectRule:
      "Project-level inferred relationships, including opportunity project matches and maintenance flags, are capped at 88 because they are useful routing hints rather than direct proof.",
    disclosureCapRule:
      "Disclosure relationships must cap confidence at the lowest available backing bundle, narrative, claim, artifact, objection, or repair-guidance score.",
    projectionGuardRule:
      "Tailored narrative projection relationships are reportable only when the graph projection guard resolves sources, quarantines unrendered edges, and keeps low-confidence variants draft-only.",
  };
}

function graphConfidenceNonClaims() {
  return [
    "This guard does not prove production graph persistence or deployed graph rendering.",
    "This guard does not inspect private files, private dashboards, inboxes, or unapproved artifacts.",
    "This guard does not claim audience interest, admissions results, hiring outcomes, funding, interviews, or third-party validation.",
  ];
}

function weightedScore(checks) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
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
  appendGraphConfidenceReceipt,
  buildGraphConfidenceHistory,
  buildGraphConfidenceReportFromReceipt,
  buildGraphConfidenceReport,
  buildGraphConfidenceResponse,
  graphConfidencePlan,
  readGraphConfidenceHistoryWindow,
  readGraphConfidenceReceipts,
  readLatestGraphConfidenceReceipt,
};
