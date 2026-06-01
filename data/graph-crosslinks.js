const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/graph-crosslinks";
const RECEIPT_RELATIVE_PATH = path.join("var", "graph-crosslink-receipts.json");
const maxReceipts = 50;
const COMPACT_HISTORY_ROW_LIMIT = 1;
const COMPACT_HISTORY_CROSSLINK_PREVIEW_LIMIT = 2;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();
const historyResponseCache = new Map();

function graphCrosslinkPlan() {
  return {
    mode: "evidence-graph-crosslink-plan",
    command: "npm run audit:graph-crosslinks",
    endpoint: ENDPOINT,
    receiptStore: RECEIPT_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary localhost server, reads the public-safe graph-crosslink report, writes a local receipt under var/, and does not infer private relationships, crawl private files, contact third parties, load credentials, approve publication, or mutate external systems.",
  };
}

function buildGraphCrosslinkReport({
  projects,
  claims,
  artifactCatalog,
  opportunities,
  narratives,
  narrativeObjections,
  packets,
  maintenance,
  routeManifest = {},
  packageManifest = {},
  receipts = [],
}) {
  const projectIds = new Set(projects.map((project) => project.slug));
  const claimIds = new Set(claims.map((claim) => claim.id));
  const artifactIds = new Set((artifactCatalog.artifacts || []).map((artifact) => artifact.id));
  const packetIds = new Set((packets?.packets || []).map((packet) => `packet-${packet.id}`));
  const crosslinks = dedupeLinks([
    ...artifactClaimLinks({ artifactCatalog, claimIds }),
    ...opportunitySourceLinks({ opportunities, projectIds, claimIds }),
    ...narrativeGroundingLinks({ narratives, claimIds, artifactIds }),
    ...narrativeObjectionLinks({ narrativeObjections, projectIds, claimIds, artifactIds, packetIds }),
    ...maintenanceProjectLinks({ maintenance, projectIds }),
  ]);
  const checks = [
    check("all-links-have-confidence", crosslinks.every((link) => Number.isInteger(link.confidenceScore)), `${crosslinks.length} link(s) scored.`),
    check("all-links-have-explanations", crosslinks.every((link) => link.explanation), `${crosslinks.length} link explanation(s).`),
    check("all-links-public-safe", crosslinks.every((link) => link.publicProjection === "public-safe"), `${crosslinks.length} public-safe projection(s).`),
    check("narrative-claim-links", crosslinks.some((link) => link.relation === "narrative-uses-claim"), "Narratives link back to claims."),
    check("artifact-claim-links", crosslinks.some((link) => link.relation === "artifact-sources-claim"), "Artifacts link back to source claims."),
    check("opportunity-claim-links", crosslinks.some((link) => link.relation === "opportunity-sourced-from-claim"), "Opportunities link back to source claims."),
    check("maintenance-project-links", crosslinks.some((link) => link.relation === "maintenance-flags-project"), "Maintenance issues link back to projects."),
    check(
      "narrative-objection-links",
      crosslinks.some((link) => link.relation === "narrative-objection-answered-by-claim" || link.relation === "narrative-objection-answered-by-artifact"),
      "Narrative objections link back to answer evidence.",
    ),
  ];
  if (routeManifest.publicApiRoutes) {
    checks.push(
      check(
        "public-route-manifest",
        ["/api/graph-crosslinks", "/api/graph-crosslinks/plan", "/api/graph-crosslinks/history"].every((route) =>
          routeManifest.publicApiRoutes.includes(route),
        ),
        `${["/api/graph-crosslinks", "/api/graph-crosslinks/plan", "/api/graph-crosslinks/history"].filter((route) => routeManifest.publicApiRoutes.includes(route)).length}/3 graph-crosslink route(s).`,
        "high",
        "Declare graph-crosslinks report, plan, and history routes in the public route manifest.",
      ),
    );
  }
  if (packageManifest.scripts) {
    checks.push(
      check(
        "package-script",
        Boolean(packageManifest.scripts["audit:graph-crosslinks"]),
        `audit:graph-crosslinks=${Boolean(packageManifest.scripts["audit:graph-crosslinks"])}`,
        "high",
        "Add the audit:graph-crosslinks package script.",
      ),
    );
  }
  const failing = checks.filter((item) => !item.passed);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-graph-crosslink-report",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "Crosslinks are derived from public-safe local evidence surfaces. They propose graph relationships and projection guards; they do not claim exhaustive real-world relationships.",
    sideEffectBoundary: graphCrosslinkPlan().sideEffectBoundary,
    plan: graphCrosslinkPlan(),
    summary: {
      links: crosslinks.length,
      relationTypes: new Set(crosslinks.map((link) => link.relation)).size,
      averageConfidence: average(crosslinks.map((link) => link.confidenceScore)),
      checks: checks.length,
      passing: checks.filter((item) => item.passed).length,
      failing: failing.length,
      auditCoverageScore: weightedCheckScore(checks),
      latestReceiptId: latestReceipt?.id || null,
    },
    relationTypes: relationSummary(crosslinks),
    checks,
    crosslinks,
    projectionGuard: {
      privacyRule: "Private references stay public-safe summaries unless approved by the local privacy workflow.",
      confidenceRule: "Links derived from explicit IDs score higher than project-level inferred links.",
      verificationCommand: "npm run check && node server.js # then open /api/graph-crosslinks",
    },
    repairActions: failing.map((item) => ({
      id: item.id,
      priority: item.severity,
      action: item.repairAction,
      verificationCommand: item.verificationCommand,
    })),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          links: latestReceipt.summary?.links || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    nextAction: failing[0]?.repairAction || "Graph crosslinks are public-safe and covered; rerun after graph, narrative, artifact, opportunity, or maintenance changes.",
    verificationCommand: "npm run audit:graph-crosslinks && npm run check",
  };
}

function buildGraphCrosslinkReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-graph-crosslink-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "evidence-graph-crosslink-report" ||
    !report.summary ||
    !Array.isArray(report.relationTypes) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand) ||
    !Array.isArray(report.crosslinks) ||
    report.crosslinks.length !== report.summary.links ||
    !report.crosslinks.every(
      (link) =>
        link.id &&
        link.source &&
        link.target &&
        link.relation &&
        Number.isInteger(link.confidenceScore) &&
        link.explanation &&
        link.publicProjection === "public-safe",
    ) ||
    !report.projectionGuard ||
    !report.projectionGuard.privacyRule ||
    !report.projectionGuard.confidenceRule ||
    !report.projectionGuard.verificationCommand ||
    !Array.isArray(report.repairActions)
  ) {
    return null;
  }

  return {
    ...report,
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      report.sourceBoundary ||
      "This response reconstructs graph crosslinks from the latest local receipt. It is not fresh graph inference, private relationship discovery, third-party crawling, or publication approval.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || graphCrosslinkPlan().sideEffectBoundary,
    plan: graphCrosslinkPlan(),
    summary: {
      ...report.summary,
      latestReceiptId: receipt.id,
    },
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      links: receipt.summary?.links || report.summary.links || 0,
      passing: receipt.summary?.passing || report.summary.passing || 0,
      checks: receipt.summary?.checks || report.summary.checks || 0,
    },
    nextAction:
      report.nextAction ||
      `Graph crosslinks are served from the latest local receipt; run npm run audit:graph-crosslinks or ${ENDPOINT}?refresh=1 after graph, narrative, artifact, opportunity, or maintenance changes.`,
    verificationCommand: report.verificationCommand || "npm run audit:graph-crosslinks && npm run check",
  };
}

function buildGraphCrosslinkResponse(report, { detail = "summary", previewLimit = 4 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const boundedPreview = Math.max(4, Math.min(Number(previewLimit) || 6, 80));
  const crosslinks = report.crosslinks || [];
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      crosslinkPayloadPolicy: crosslinkPayloadPolicy({
        fullDetail,
        previewLimit: boundedPreview,
        returned: crosslinks.length,
        total: crosslinks.length,
        crosslinks,
      }),
    };
  }

  const preview = selectCrosslinkPreview(crosslinks, boundedPreview);
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    cachePolicy: report.cachePolicy,
    refreshEndpoint: report.refreshEndpoint,
    detail: "summary",
    plan: {
      command: report.plan?.command || graphCrosslinkPlan().command,
    },
    summary: summarizeGraphCrosslinkSummaryForResponse(report.summary),
    checks: selectCrosslinkCheckPreview(report.checks || []).map(({ id, passed }) => ({ id, passed })),
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    crosslinks: preview.map(summarizeCrosslink),
    nextActionAvailable: undefined,
    verificationCommandAvailable: undefined,
    crosslinkPayloadPolicy: crosslinkPayloadPolicy({
      fullDetail,
      previewLimit: boundedPreview,
      returned: preview.length,
      total: crosslinks.length,
      crosslinks: preview,
    }),
  };
}

function artifactClaimLinks({ artifactCatalog, claimIds }) {
  return (artifactCatalog.artifacts || []).flatMap((artifact) =>
    (artifact.sourceTrace || [])
      .filter((source) => source.type === "claim" && claimIds.has(source.id))
      .map((source) =>
        link({
          source: artifact.id,
          target: source.id,
          relation: "artifact-sources-claim",
          confidenceScore: 92,
          explanation: `${artifact.label} cites claim ${source.id} through its source trace.`,
        }),
      ),
  );
}

function opportunitySourceLinks({ opportunities, projectIds, claimIds }) {
  return (opportunities.opportunities || []).flatMap((opportunity) =>
    (opportunity.sourceTrace || [])
      .filter((source) => (source.type === "claim" && claimIds.has(source.id)) || (source.type === "project-match" && projectIds.has(source.id)))
      .map((source) =>
        link({
          source: `opportunity-${opportunity.id}`,
          target: source.type === "project-match" ? source.id : source.id,
          relation: source.type === "claim" ? "opportunity-sourced-from-claim" : "opportunity-sourced-from-project",
          confidenceScore: source.type === "claim" ? 90 : 82,
          explanation:
            source.type === "claim"
              ? `${opportunity.label} includes claim ${source.id} in its source trace.`
              : `${opportunity.label} matched project ${source.id} through terms ${(source.matchedTerms || []).join(", ")}.`,
        }),
      ),
  );
}

function narrativeGroundingLinks({ narratives, claimIds, artifactIds }) {
  return (narratives.narratives || []).flatMap((narrative) => [
    ...narrative.claimsUsed
      .filter((id) => claimIds.has(id))
      .map((id) =>
        link({
          source: `narrative-${narrative.id}`,
          target: id,
          relation: "narrative-uses-claim",
          confidenceScore: 94,
          explanation: `${narrative.label} explicitly uses claim ${id}.`,
        }),
      ),
    ...narrative.artifactsUsed
      .filter((id) => artifactIds.has(id))
      .map((id) =>
        link({
          source: `narrative-${narrative.id}`,
          target: id,
          relation: "narrative-uses-artifact",
          confidenceScore: 94,
          explanation: `${narrative.label} explicitly uses artifact ${id}.`,
        }),
      ),
  ]);
}

function narrativeObjectionLinks({ narrativeObjections, projectIds, claimIds, artifactIds, packetIds }) {
  return (narrativeObjections?.audiences || []).flatMap((audience) =>
    audience.objections.flatMap((objection) => {
      const objectionId = `objection-${audience.id}-${objection.id}`;
      const links = [
        link({
          source: `narrative-${audience.id}`,
          target: objectionId,
          relation: "narrative-pressure-tested-by-objection",
          confidenceScore: 96,
          explanation: `${audience.label} is pressure-tested by the ${objection.id} objection.`,
        }),
        ...audience.sourceProjects
          .filter((slug) => projectIds.has(slug))
          .map((slug) =>
            link({
              source: objectionId,
              target: slug,
              relation: "narrative-objection-concerns-project",
              confidenceScore: 82,
              explanation: `${objection.challenge} concerns source project ${slug}.`,
            }),
          ),
      ];

      for (const evidenceId of objection.evidence || []) {
        if (claimIds.has(evidenceId)) {
          links.push(
            link({
              source: objectionId,
              target: evidenceId,
              relation: "narrative-objection-answered-by-claim",
              confidenceScore: 90,
              explanation: `${objection.challenge} is answered in part by claim ${evidenceId}.`,
            }),
          );
        } else if (artifactIds.has(evidenceId)) {
          links.push(
            link({
              source: objectionId,
              target: evidenceId,
              relation: "narrative-objection-answered-by-artifact",
              confidenceScore: 90,
              explanation: `${objection.challenge} is answered in part by artifact ${evidenceId}.`,
            }),
          );
        } else {
          const packetId = evidenceId.startsWith("packet.") ? `packet-${audience.id}` : null;
          if (packetId && packetIds.has(packetId)) {
            links.push(
              link({
                source: objectionId,
                target: packetId,
                relation: "narrative-objection-uses-packet-disclosure",
                confidenceScore: 84,
                explanation: `${objection.challenge} uses the ${audience.label} packet disclosure surface.`,
              }),
            );
          }
          if (String(evidenceId).startsWith(`narrative.${audience.id}`)) {
            links.push(
              link({
                source: objectionId,
                target: `narrative-${audience.id}`,
                relation: "narrative-objection-uses-narrative-disclosure",
                confidenceScore: 84,
                explanation: `${objection.challenge} uses the ${audience.label} narrative disclosure surface.`,
              }),
            );
          }
        }
      }

      return links;
    }),
  );
}

function maintenanceProjectLinks({ maintenance, projectIds }) {
  return (maintenance.issues || [])
    .filter((issue) => issue.project && projectIds.has(issue.project))
    .map((issue) =>
      link({
        source: `maintenance-${issue.id}`,
        target: issue.project,
        relation: "maintenance-flags-project",
        confidenceScore: issue.severity === "high" ? 88 : issue.severity === "medium" ? 78 : 66,
        explanation: `${issue.title} flags project ${issue.project} with ${issue.severity} severity.`,
      }),
    );
}

function link({ source, target, relation, confidenceScore, explanation }) {
  return {
    id: `${relation}:${source}->${target}`,
    source,
    target,
    relation,
    confidenceScore,
    explanation,
    publicProjection: "public-safe",
  };
}

function dedupeLinks(links) {
  const seen = new Set();
  const result = [];
  for (const item of links) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result.sort((left, right) => right.confidenceScore - left.confidenceScore || left.id.localeCompare(right.id));
}

function relationSummary(crosslinks) {
  const counts = new Map();
  for (const link of crosslinks) counts.set(link.relation, (counts.get(link.relation) || 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([relation, count]) => ({ relation, count }));
}

function appendGraphCrosslinkReceipt(root, receipt) {
  const receipts = readGraphCrosslinkReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readGraphCrosslinkReceipts(root) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestGraphCrosslinkReceipt(root) {
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

function readGraphCrosslinkHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readGraphCrosslinkReceipts(root);
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

function buildGraphCrosslinkHistory({ receipts = [], limit = 20, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const compactRows = fullDetail ? limited : limited.slice(0, COMPACT_HISTORY_ROW_LIMIT);
  const cacheKey = `${fullDetail ? "full" : "summary"}:${boundedLimit}:${totalAvailable}:${compactRows.map((receipt) => `${receipt.id}:${receipt.checkedAt || ""}`).join("|")}`;
  const cached = historyResponseCache.get(cacheKey);
  if (cached) return cached;
  const history = {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "evidence-graph-crosslink-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local graph-crosslink receipts. It does not infer private relationships, crawl private files, contact third parties, load credentials, approve publication, or mutate external systems.",
          sideEffectBoundary:
            "The history endpoint reads local graph-crosslink receipts only and does not infer private relationships, crawl private files, contact third parties, load credentials, approve publication, or mutate external systems.",
        }
      : {}),
    receiptStore: fullDetail ? RECEIPT_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail,
          defaultLimit: 5,
          fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
        }
      : {
          fullDetail,
          historyRowsReturned: compactRows.length,
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: limited[0]?.id || null,
    },
    definitions: undefined,
    receipts: fullDetail ? limited : compactRows.map((receipt, index) => summarizeGraphCrosslinkReceipt(receipt, { includePreview: index === 0 })),
    ...(fullDetail
      ? {
          nextAction: limited[0]
            ? "Graph crosslink history is available; run npm run audit:graph-crosslinks after graph, narrative, artifact, opportunity, or maintenance changes."
            : "Run npm run audit:graph-crosslinks to create graph crosslink history.",
          verificationCommand: "npm run audit:graph-crosslinks && node --test test/api-contract.test.mjs",
        }
      : {}),
  };
  historyResponseCache.set(cacheKey, history);
  return history;
}

function summarizeGraphCrosslinkReceipt(receipt, { includePreview = true } = {}) {
  const report = receipt.report || {};
  const checks = report.checks || receipt.checks || [];
  const relationTypes = report.relationTypes || [];
  const summary = {
    id: receipt.id,
    summary: summarizeGraphCrosslinkHistorySummary(receipt.summary),
  };
  if (!includePreview) {
    return {
      ...summary,
      relationTypeSummary: summarizeHistoryRelationTypes(relationTypes),
      checkSummary: summarizeHistoryChecks(checks),
      latestReceiptPreviewOnly: true,
    };
  }
  return {
    ...summary,
    relationTypes: relationTypes.length,
    dominantRelation: relationTypes[0]?.relation || null,
    crosslinkPreview: selectCrosslinkPreview(report.crosslinks || [], COMPACT_HISTORY_CROSSLINK_PREVIEW_LIMIT).map(summarizeHistoryCrosslink),
    checkSummary: summarizeHistoryChecks(checks),
  };
}

function summarizeHistoryRelationTypes(relationTypes) {
  return {
    relationTypes: relationTypes.length,
    dominantRelation: relationTypes[0]?.relation || null,
    dominantCount: relationTypes[0]?.count || 0,
  };
}

function summarizeHistoryChecks(checks) {
  return {
    checks: checks.length,
    passing: checks.filter((check) => check.passed).length,
    failing: checks.filter((check) => !check.passed).length,
  };
}

function summarizeGraphCrosslinkHistorySummary(summary = {}) {
  return {
    links: summary.links || 0,
    averageConfidence: summary.averageConfidence || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, RECEIPT_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function selectCrosslinkPreview(crosslinks, limit) {
  const selected = [];
  const seen = new Set();
  for (const relation of relationOrder(crosslinks)) {
    if (selected.length >= limit) break;
    pushUniqueCrosslink(selected, seen, crosslinks.find((link) => link.relation === relation));
  }
  for (const link of crosslinks) {
    if (selected.length >= limit) break;
    pushUniqueCrosslink(selected, seen, link);
  }
  return selected;
}

function pushUniqueCrosslink(selected, seen, link) {
  if (!link || seen.has(link.id)) return;
  selected.push(link);
  seen.add(link.id);
}

function summarizeCrosslink(link) {
  return {
    source: link.source,
    target: link.target,
    relation: link.relation,
  };
}

function summarizeGraphCrosslinkSummaryForResponse(summary = {}) {
  return {
    links: summary.links || 0,
    relationTypes: summary.relationTypes || 0,
    averageConfidence: summary.averageConfidence || 0,
    auditCoverageScore: summary.auditCoverageScore || 0,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function summarizeHistoryCrosslink(link) {
  return {
    source: link.source,
    target: link.target,
    relation: link.relation,
    confidenceScore: link.confidenceScore,
  };
}

function relationOrder(crosslinks) {
  const priority = [
    "narrative-uses-claim",
    "narrative-objection-answered-by-claim",
    "artifact-sources-claim",
    "opportunity-sourced-from-claim",
    "narrative-objection-answered-by-artifact",
    "narrative-uses-artifact",
    "narrative-pressure-tested-by-objection",
    "narrative-objection-concerns-project",
    "opportunity-sourced-from-project",
    "maintenance-flags-project",
    "narrative-objection-uses-packet-disclosure",
    "narrative-objection-uses-narrative-disclosure",
  ];
  const priorityIndex = new Map(priority.map((relation, index) => [relation, index]));
  return [...new Set((crosslinks || []).map((link) => link.relation))].sort((left, right) => {
    const leftIndex = priorityIndex.has(left) ? priorityIndex.get(left) : Number.MAX_SAFE_INTEGER;
    const rightIndex = priorityIndex.has(right) ? priorityIndex.get(right) : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.localeCompare(right);
  });
}

function crosslinkPayloadPolicy({ fullDetail, previewLimit, returned, total, crosslinks }) {
  const returnedRelations = new Set((crosslinks || []).map((link) => link.relation));
  if (!fullDetail) {
    return {
      fullDetail: false,
      crosslinksReturned: returned,
      totalCrosslinks: total,
      relationTypesReturned: returnedRelations.size,
    };
  }
  return {
    fullDetail: true,
    previewLimit,
    crosslinksReturned: returned,
    totalCrosslinks: total,
    relationTypesReturned: returnedRelations.size,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    compactDefault: false,
  };
}

function selectCrosslinkCheckPreview(checks = []) {
  return selectRowsById(checks, ["all-links-public-safe", "narrative-claim-links", "narrative-objection-links", "public-route-manifest"], 4);
}

function selectRowsById(rows = [], ids = [], limit = ids.length) {
  const selected = [];
  const seen = new Set();
  const add = (row) => {
    if (!row || seen.has(row.id)) return;
    selected.push(row);
    seen.add(row.id);
  };
  for (const id of ids) add(rows.find((row) => row.id === id));
  for (const row of rows) {
    if (selected.length >= limit) break;
    add(row);
  }
  return selected.slice(0, limit);
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

function check(id, passed, detail, severity = "high", repairAction = "Repair the graph-crosslink inputs and rerun the graph-crosslink audit.") {
  return {
    id,
    passed: Boolean(passed),
    severity: passed ? "info" : severity,
    detail,
    repairAction,
    verificationCommand: id === "package-script" ? "npm run audit:graph-crosslinks" : "npm run audit:graph-crosslinks && npm run check",
  };
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function weightedCheckScore(checks) {
  const weights = { high: 18, medium: 11, low: 6, info: 4 };
  const max = checks.reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + (weights[item.severity] || 4), 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

module.exports = {
  appendGraphCrosslinkReceipt,
  buildGraphCrosslinkHistory,
  buildGraphCrosslinkReportFromReceipt,
  buildGraphCrosslinkReport,
  buildGraphCrosslinkResponse,
  graphCrosslinkPlan,
  readGraphCrosslinkHistoryWindow,
  readGraphCrosslinkReceipts,
  readLatestGraphCrosslinkReceipt,
};
