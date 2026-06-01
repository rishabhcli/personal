const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/graph-disclosure-links";
const STORE_RELATIVE_PATH = path.join("var", "graph-disclosure-links-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();
const historyResponseCache = new Map();

function graphDisclosureLinksPlan() {
  return {
    mode: "evidence-graph-disclosure-links-plan",
    command: "npm run audit:graph-disclosures",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation: "Run after changing narrative disclosures, narrative grounding, objection pressure tests, artifact projections, or graph route declarations.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe graph and narrative-disclosure endpoints, writes a local receipt under var/, and does not publish, send outreach, enable private data, call external services, or mutate third-party systems.",
  };
}

function buildGraphDisclosureLinksReport({ disclosureReport, narratives, claims, artifactCatalog, routeManifest, refreshPlan, packageManifest, receipts = [] }) {
  const relationships = buildRelationships({ disclosureReport, narratives, claims, artifactCatalog });
  const checks = reportChecks({ disclosureReport, relationships, routeManifest, refreshPlan, packageManifest });
  const failing = checks.filter((check) => !check.passed);
  const score = weightedScore(checks);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-graph-disclosure-links",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report projects public-safe narrative-disclosure relationships into graph-ready edges. It links only modeled narratives, public-safe claims, public-safe artifacts, objection IDs, and local repair guidance. It does not expose private materials, infer external outcomes, or claim production graph persistence.",
    sideEffectBoundary:
      "This endpoint reads public-safe in-memory reports and local receipt history only. It does not publish, mutate graph storage, enable private routes, contact third parties, collect analytics, or send messages.",
    plan: graphDisclosureLinksPlan(),
    summary: {
      score,
      band: bandFor(score),
      checks: checks.length,
      passing: checks.length - failing.length,
      failing: failing.length,
      bundles: disclosureReport.summary?.audiences || 0,
      relationships: relationships.length,
      relationshipTypes: new Set(relationships.map((relationship) => relationship.relation)).size,
      claimLinks: relationships.filter((relationship) => relationship.relation === "disclosure-cites-claim").length,
      artifactLinks: relationships.filter((relationship) => relationship.relation === "disclosure-cites-artifact").length,
      objectionLinks: relationships.filter((relationship) => relationship.relation === "disclosure-answers-objection").length,
      repairLinks: relationships.filter((relationship) => relationship.relation === "disclosure-has-repair").length,
      confidenceCapped: relationships.every(confidenceWithinCap),
      routeCovered: (routeManifest.publicApiRoutes || []).includes(ENDPOINT),
      refreshCovered: (refreshPlan.endpoints || []).includes(ENDPOINT),
      latestReceiptId: latestReceipt?.id || null,
    },
    relationships,
    checks,
    projectionGuard: {
      publicSafeOnly: relationships.every((relationship) => relationship.privacyLevel === "public-safe"),
      noExternalOutcomeClaims: relationships.every((relationship) => !/interview|funding|admission|hiring|recipient interest/i.test(relationship.explanation)),
      confidenceRule:
        "Every disclosure graph relationship caps confidence at the lowest available score from the disclosure bundle and its backing narrative, claim, artifact, objection, or repair guidance.",
      confidenceCapped: relationships.every(confidenceWithinCap),
      requiredRelations: [
        "disclosure-validates-narrative",
        "disclosure-cites-claim",
        "disclosure-cites-artifact",
        "disclosure-answers-objection",
        "disclosure-has-repair",
      ],
    },
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    nextAction:
      failing[0]?.repairAction ||
      "Disclosure graph links are projected and public-safe; rerun after narrative, claim, artifact, objection, or disclosure changes.",
    verificationCommand: "npm run audit:graph-disclosures && npm run check && npm run verify",
  };
}

function buildGraphDisclosureLinksReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-graph-disclosure-links-receipt" || !receipt.summary) return null;
  if (!Array.isArray(receipt.relationships)) return null;
  const checks = (receipt.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity || "medium",
    detail: check.detail || `Cached graph disclosure link check from ${receipt.id}.`,
    repairAction: check.repairAction || (check.passed ? "No cached graph disclosure repair needed." : "Refresh graph disclosure links and repair the failing check."),
    verificationCommand: check.verificationCommand || "npm run audit:graph-disclosures",
  }));
  const failing = checks.filter((check) => !check.passed);

  return {
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "evidence-graph-disclosure-links",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs graph disclosure links from the latest local receipt. It is a fast public-safe cached graph projection, not fresh graph storage proof, private-data inspection, external validation, or production analytics.",
    sideEffectBoundary: receipt.sideEffectBoundary || graphDisclosureLinksPlan().sideEffectBoundary,
    plan: graphDisclosureLinksPlan(),
    summary: {
      ...receipt.summary,
      latestReceiptId: receipt.id,
    },
    relationships: receipt.relationships,
    checks,
    projectionGuard: receipt.projectionGuard || {
      publicSafeOnly: receipt.relationships.every((relationship) => relationship.privacyLevel === "public-safe"),
      noExternalOutcomeClaims: receipt.relationships.every((relationship) => !/interview|funding|admission|hiring|recipient interest/i.test(relationship.explanation || "")),
      confidenceRule:
        "Cached disclosure graph relationships preserve their last recorded confidence cap; run npm run audit:graph-disclosures or ?refresh=1 after narrative, claim, artifact, objection, or disclosure changes.",
      confidenceCapped: receipt.relationships.every(confidenceWithinCap),
      requiredRelations: [
        "disclosure-validates-narrative",
        "disclosure-cites-claim",
        "disclosure-cites-artifact",
        "disclosure-answers-objection",
        "disclosure-has-repair",
      ],
    },
    repairActions:
      receipt.repairActions ||
      failing.map((check) => ({
        id: check.id,
        priority: check.severity,
        action: check.repairAction,
        verificationCommand: check.verificationCommand,
      })),
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      score: receipt.summary?.score || 0,
      passing: receipt.summary?.passing || 0,
      checks: receipt.summary?.checks || checks.length,
    },
    nextAction:
      failing[0]?.repairAction ||
      "Graph disclosure links are served from the latest local receipt; run npm run audit:graph-disclosures or ?refresh=1 after narrative, claim, artifact, objection, or disclosure changes.",
    verificationCommand: "npm run audit:graph-disclosures && npm run check && npm run verify",
  };
}

function buildGraphDisclosureLinksResponse(report, { detail = "summary", previewLimit = 5 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedPreview = Math.max(5, Math.min(Number(previewLimit) || 18, 80));
  const relationships = report.relationships || [];
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
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
    refreshEndpoint: report.refreshEndpoint || `${ENDPOINT}?refresh=1`,
    detail: "summary",
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeGraphDisclosureResponseSummary(report.summary),
    relationships: preview.map(summarizeRelationship),
    checks: selectGraphDisclosureCheckPreview(report.checks || []).map(summarizeResponseCheck),
    relationshipPayloadPolicy: relationshipPayloadPolicy({
      fullDetail,
      previewLimit: boundedPreview,
      returned: preview.length,
      total: relationships.length,
      relationships: preview,
    }),
  };
}

function appendGraphDisclosureLinksReceipt(root, receipt) {
  const receipts = readGraphDisclosureLinksReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readGraphDisclosureLinksReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestGraphDisclosureLinksReceipt(root) {
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

function readGraphDisclosureLinksHistoryWindow(root, { limit = 3 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const window = readReceiptWindow(storePath, boundedLimit);
    historyWindowCache.set(storePath, { cacheKey, window });
    return window;
  } catch {
    return { receipts: [], totalAvailable: 0 };
  }
}

function buildGraphDisclosureLinksHistory({ receipts = [], limit = 3, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const cacheKey = `${fullDetail ? "full" : "summary"}:${boundedLimit}:${totalAvailable}:${limited.map((receipt) => `${receipt.id}:${receipt.checkedAt || ""}`).join("|")}`;
  const cached = historyResponseCache.get(cacheKey);
  if (cached) return cached;
  const history = {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "evidence-graph-disclosure-links-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "This endpoint returns full local graph-disclosure-link receipts. It is still not graph storage proof, private-data inspection, external validation, or production analytics."
      : undefined,
    sideEffectBoundary: fullDetail
      ? "Reads local graph-disclosure-link receipts only; no publishing, graph mutation, private routes, external calls, analytics, or messaging."
      : undefined,
    sourceBoundaryAvailable: fullDetail ? undefined : true,
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: graphDisclosureHistoryPayloadPolicy({ fullDetail, returnedReceipts: limited.length }),
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: limited[0]?.id || null,
      latestCheckedAt: fullDetail ? limited[0]?.checkedAt || null : undefined,
      latestScore: limited[0]?.summary?.score || 0,
      latestRelationships: limited[0]?.summary?.relationships || 0,
    },
    definitions: fullDetail
      ? undefined
      : {
          compactReceiptFieldCount: 5,
          omittedFromHistoryCount: 9,
        },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeGraphDisclosureLinksReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "History available; rerun after graph disclosure inputs change."
        : "Run npm run audit:graph-disclosures to create graph disclosure-link history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:graph-disclosures && node --test test/api-contract.test.mjs" : undefined,
  };
  historyResponseCache.set(cacheKey, history);
  return history;
}

function graphDisclosureHistoryPayloadPolicy({ fullDetail, returnedReceipts }) {
  if (!fullDetail) {
    return {
      fullDetail: false,
      fullDetailAvailable: true,
      historyRowsReturned: returnedReceipts,
    };
  }
  return {
    detail: "full",
    fullDetail: true,
    defaultLimit: 20,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    latestReceiptPreview: "full-receipt",
    olderReceiptPreview: "full-receipt",
    checkPayload: "full",
  };
}

function summarizeGraphDisclosureLinksReceipt(receipt, { includePreview = true } = {}) {
  const relationships = Array.isArray(receipt.relationships) ? receipt.relationships : [];
  const checks = Array.isArray(receipt.checks) ? receipt.checks : [];
  const summary =
    receipt.summary || {
      score: receipt.score || 0,
      bundles: receipt.bundles || 0,
      relationships: Number.isInteger(receipt.relationships) ? receipt.relationships : 0,
      relationshipTypes: receipt.relationTypes || 0,
      checks: (receipt.passedChecks || 0) + (receipt.failedChecks || 0),
      passing: receipt.passedChecks || 0,
      failing: receipt.failedChecks || 0,
    };
  const relationshipSummary = summarizeRelationshipSet(relationships, summary);
  const checkSummary = summarizeHistoryChecks(checks, summary);
  const compact = {
    id: receipt.id,
    score: summary.score || 0,
    bundles: summary.bundles || 0,
    relationships: relationshipSummary.total,
    relationTypes: relationshipSummary.relationTypes,
    passedChecks: checkSummary.passed,
    failedChecks: checkSummary.failed,
  };
  if (!includePreview) {
    return {
      ...compact,
      trendOnly: true,
    };
  }
  return {
    ...compact,
    publicSafeRelationships: relationshipSummary.publicSafe,
    unresolvedSources: relationshipSummary.unresolvedSources,
    confidenceCapped: relationshipSummary.confidenceCapped,
    relationshipPreview: selectRelationshipPreview(relationships, 5).slice(0, 2).map(summarizeHistoryRelationship),
  };
}

function readReceiptWindow(storePath, limit) {
  const text = readFileSync(storePath, "utf8");
  const receiptsIndex = text.indexOf('"receipts"');
  const arrayStart = receiptsIndex === -1 ? -1 : text.indexOf("[", receiptsIndex);
  if (arrayStart === -1) return { receipts: [], totalAvailable: 0 };

  const receipts = [];
  let totalAvailable = 0;
  let index = arrayStart + 1;
  while (index < text.length) {
    while (index < text.length && /[\s,]/.test(text[index])) index += 1;
    if (text[index] === "]") break;
    if (text[index] !== "{") break;
    const objectEnd = findJsonObjectEnd(text, index);
    if (objectEnd === -1) break;
    totalAvailable += 1;
    if (receipts.length < limit) {
      receipts.push(JSON.parse(text.slice(index, objectEnd + 1)));
    }
    index = objectEnd + 1;
  }

  return { receipts, totalAvailable };
}

function summarizeRelationshipSet(relationships, summary = {}) {
  const relationCounts = relationships.reduce((counts, relationship) => {
    counts[relationship.relation] = (counts[relationship.relation] || 0) + 1;
    return counts;
  }, {});
  const unresolvedSources = relationships.filter((relationship) => relationship.sourceResolved === false).length;
  return {
    total: summary.relationships || relationships.length,
    relationTypes: summary.relationshipTypes || Object.keys(relationCounts).length,
    publicSafe: relationships.filter((relationship) => relationship.privacyLevel === "public-safe").length,
    unresolvedSources,
    confidenceCapped: Boolean(summary.confidenceCapped),
  };
}

function summarizeHistoryRelationship(relationship) {
  return {
    relation: relationship.relation,
    confidenceScore: relationship.confidenceScore,
    audience: relationship.audience,
    ...(relationship.sourceResolved === false ? { sourceResolved: false } : {}),
    ...(relationship.repairAction ? { hasRepairAction: true } : {}),
  };
}

function summarizeHistoryChecks(checks, summary = {}) {
  const failing = checks.filter((check) => !check.passed);
  return {
    total: summary.checks || checks.length,
    passed: summary.passing || checks.length - failing.length,
    failed: summary.failing || failing.length,
    failing: failing.map(({ id, severity }) => ({ id, severity })),
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function boundedHistoryLimit(limit) {
  const numericLimit = Number(limit);
  if (!Number.isFinite(numericLimit)) return 3;
  return Math.max(1, Math.min(Math.trunc(numericLimit), 50));
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

function selectRelationshipPreview(relationships, limit) {
  const selected = [];
  const seen = new Set();
  for (const relation of requiredRelations()) {
    const match = relationships.find((relationship) => relationship.relation === relation);
    pushUnique(selected, seen, match);
  }
  for (const relationship of relationships) {
    if (selected.length >= limit) break;
    pushUnique(selected, seen, relationship);
  }
  return selected;
}

function pushUnique(selected, seen, relationship) {
  if (!relationship || seen.has(relationship.id)) return;
  selected.push(relationship);
  seen.add(relationship.id);
}

function summarizeRelationship(relationship) {
  const basisScores = (relationship.confidenceBasis || []).map((item) => Number(item.score || 0));
  const capScore = Math.min(relationship.confidenceScore || 0, ...(basisScores.length ? basisScores : [relationship.confidenceScore || 0]));
  return {
    relation: relationship.relation,
    confidenceScore: relationship.confidenceScore,
    confidenceBasis: [{ score: capScore }],
    privacyLevel: relationship.privacyLevel,
  };
}

function summarizeGraphDisclosureResponseSummary(summary = {}) {
  return {
    score: summary.score || 0,
    bundles: summary.bundles || 0,
    relationships: summary.relationships || 0,
    relationshipTypes: summary.relationshipTypes || 0,
    confidenceCapped: Boolean(summary.confidenceCapped),
  };
}

function summarizeResponseCheck(check) {
  return {
    id: check.id,
    passed: Boolean(check.passed),
  };
}

function selectGraphDisclosureCheckPreview(checks) {
  const priorityIds = ["confidence-cap", "required-relations"];
  const selected = [];
  const seen = new Set();
  for (const id of priorityIds) {
    pushUniqueCheck(selected, seen, checks.find((check) => check.id === id), 2);
  }
  for (const check of checks) {
    pushUniqueCheck(selected, seen, check, 2);
  }
  return selected;
}

function pushUniqueCheck(selected, seen, check, limit) {
  if (!check || seen.has(check.id) || selected.length >= limit) return;
  selected.push(check);
  seen.add(check.id);
}

function relationshipPayloadPolicy({ fullDetail, previewLimit, returned, total, relationships }) {
  const returnedRelations = new Set((relationships || []).map((relationship) => relationship.relation));
  return {
    fullDetail,
    previewLimit,
    relationshipsReturned: returned,
    totalRelationships: total,
    requiredRelationsReturned: requiredRelations().filter((relation) => returnedRelations.has(relation)).length,
    fullDetailAvailable: true,
  };
}

function requiredRelations() {
  return [
    "disclosure-validates-narrative",
    "disclosure-cites-claim",
    "disclosure-cites-artifact",
    "disclosure-answers-objection",
    "disclosure-has-repair",
  ];
}

function buildRelationships({ disclosureReport, narratives, claims, artifactCatalog }) {
  const narrativeById = new Map((narratives.narratives || []).map((narrative) => [narrative.id, narrative]));
  const claimById = new Map((claims || []).map((claim) => [claim.id, claim]));
  const artifactById = new Map((artifactCatalog.artifacts || []).map((artifact) => [artifact.id, artifact]));
  const relationships = [];

  for (const bundle of disclosureReport.bundles || []) {
    const disclosureNode = `disclosure-${bundle.id}`;
    const bundleBasis = basis("disclosure-bundle", bundle.id, bundle.score || 0);
    const narrative = narrativeById.get(bundle.id);
    if (narrative) {
      relationships.push(
        edge({
          source: disclosureNode,
          target: `narrative-${bundle.id}`,
          relation: "disclosure-validates-narrative",
          basisItems: [bundleBasis, basis("narrative-grounding", narrative.id, narrative.groundingScore || 0)],
          explanation: `${bundle.label} disclosure validates the ${bundle.audience} narrative with caveats and repair guidance.`,
          audience: bundle.id,
        }),
      );
    }
    for (const claimId of bundle.evidenceGrounding.claimsUsed || []) {
      const claim = claimById.get(claimId);
      relationships.push(
        edge({
          source: disclosureNode,
          target: claimId,
          relation: "disclosure-cites-claim",
          basisItems: [bundleBasis, basis("claim", claimId, claim?.confidenceScore || 35), basis("relationship-ceiling", "claim-link-ceiling", 92)],
          explanation: `${bundle.label} disclosure cites claim ${claimId} as public-safe evidence.`,
          audience: bundle.id,
          sourceResolved: Boolean(claim),
        }),
      );
    }
    for (const artifactId of bundle.evidenceGrounding.artifactsUsed || []) {
      const artifact = artifactById.get(artifactId);
      relationships.push(
        edge({
          source: disclosureNode,
          target: artifactId,
          relation: "disclosure-cites-artifact",
          basisItems: [bundleBasis, basis("artifact", artifactId, artifact?.confidenceScore || 35), basis("relationship-ceiling", "artifact-link-ceiling", 92)],
          explanation: `${bundle.label} disclosure cites artifact ${artifactId} as inspectable public-safe evidence.`,
          audience: bundle.id,
          sourceResolved: Boolean(artifact),
        }),
      );
    }
    for (const objection of bundle.objectionCoverage.objections || []) {
      relationships.push(
        edge({
          source: disclosureNode,
          target: `objection-${bundle.id}-${objection.id}`,
          relation: "disclosure-answers-objection",
          basisItems: [bundleBasis, basis("objection-answerability", objection.id, objection.answerabilityScore || 0)],
          explanation: `${bundle.label} disclosure carries caveats and repair action for objection ${objection.id}.`,
          audience: bundle.id,
        }),
      );
    }
    for (const [index, repair] of (bundle.repairGuidance || []).entries()) {
      relationships.push(
        edge({
          source: disclosureNode,
          target: `repair-${bundle.id}-${index + 1}`,
          relation: "disclosure-has-repair",
          basisItems: [bundleBasis, basis("repair-guidance", `repair-${index + 1}`, 80)],
          explanation: `${bundle.label} disclosure preserves public-safe repair guidance item ${index + 1}.`,
          audience: bundle.id,
          repairAction: String(repair),
        }),
      );
    }
  }

  return relationships;
}

function edge({ source, target, relation, basisItems, explanation, audience, repairAction = null, sourceResolved = true }) {
  const confidenceBasis = basisItems.filter((item) => Number.isFinite(item.score));
  const confidence = Math.min(...confidenceBasis.map((item) => item.score));
  return {
    id: `${source}:${relation}:${target}`,
    source,
    target,
    relation,
    confidenceScore: clamp(Math.round(confidence), 0, 100),
    confidenceBasis,
    audience,
    sourceResolved,
    privacyLevel: "public-safe",
    explanation,
    ...(repairAction ? { repairAction } : {}),
    verificationCommand: "npm run audit:graph-disclosures",
  };
}

function reportChecks({ disclosureReport, relationships, routeManifest, refreshPlan, packageManifest }) {
  const publicRoutes = routeManifest.publicApiRoutes || [];
  const relationTypes = new Set(relationships.map((relationship) => relationship.relation));
  const required = requiredRelations();
  const sourceLinks = relationships.filter((relationship) => ["disclosure-cites-claim", "disclosure-cites-artifact"].includes(relationship.relation));
  return [
    check("bundle-coverage", (disclosureReport.bundles || []).length >= 3, "high", `${disclosureReport.bundles?.length || 0} disclosure bundle(s).`, "Generate disclosure bundles before projecting graph links.", "npm run disclose:narratives"),
    check("relationship-depth", required.every((relation) => relationTypes.has(relation)) && relationships.length >= (disclosureReport.bundles || []).length * 10, "high", `${relationships.length} relationship(s); ${relationTypes.size} relation type(s).`, "Keep disclosure graph relationships linked to narratives, claims, artifacts, objections, and repairs.", "npm run audit:graph-disclosures"),
    check("public-safe-projection", relationships.every((relationship) => relationship.privacyLevel === "public-safe" && relationship.explanation && relationship.verificationCommand), "high", "Every relationship must have public-safe privacy, explanation, and verification command.", "Restore public-safe relationship explanations and verification commands.", "npm run check"),
    check("claim-artifact-existence", sourceLinks.length > 0 && sourceLinks.every((relationship) => relationship.sourceResolved), "medium", `${sourceLinks.filter((relationship) => relationship.sourceResolved).length}/${sourceLinks.length} claim/artifact relationship(s) resolve to modeled IDs.`, "Repair missing claim or artifact IDs in narrative disclosures.", "npm run disclose:narratives"),
    check("confidence-cap", relationships.length > 0 && relationships.every(confidenceWithinCap), "high", `${relationships.filter(confidenceWithinCap).length}/${relationships.length} relationship(s) obey confidence caps.`, "Cap each disclosure graph relationship at the lowest backing bundle, narrative, claim, artifact, objection, or repair score.", "npm run audit:graph-disclosures"),
    check("route-manifest", [ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].every((route) => publicRoutes.includes(route)), "high", `${[ENDPOINT, `${ENDPOINT}/plan`, `${ENDPOINT}/history`].filter((route) => publicRoutes.includes(route)).length}/3 route(s) declared.`, "Add graph disclosure links routes to runtimeRouteManifest.", "npm run record:runtime-surface"),
    check("refresh-plan", (refreshPlan.endpoints || []).includes(ENDPOINT), "medium", `${ENDPOINT} ${(refreshPlan.endpoints || []).includes(ENDPOINT) ? "covered" : "missing"} in refresh plan.`, "Add graph disclosure links to safe evidence refresh.", "npm run refresh:evidence"),
    check("script-coverage", Boolean(packageManifest.scripts?.["audit:graph-disclosures"]), "medium", `audit:graph-disclosures=${Boolean(packageManifest.scripts?.["audit:graph-disclosures"])}`, "Add the audit:graph-disclosures package script.", "npm run audit:graph-disclosures"),
  ];
}

function confidenceWithinCap(relationship) {
  if (!relationship.confidenceBasis?.length) return false;
  const cap = Math.min(...relationship.confidenceBasis.map((item) => item.score));
  return relationship.confidenceScore <= cap;
}

function basis(type, id, score) {
  return {
    type,
    id,
    score: clamp(Math.round(score), 0, 100),
  };
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
  appendGraphDisclosureLinksReceipt,
  buildGraphDisclosureLinksHistory,
  buildGraphDisclosureLinksResponse,
  buildGraphDisclosureLinksReportFromReceipt,
  buildGraphDisclosureLinksReport,
  graphDisclosureLinksPlan,
  readGraphDisclosureLinksHistoryWindow,
  readGraphDisclosureLinksReceipts,
  readLatestGraphDisclosureLinksReceipt,
};
