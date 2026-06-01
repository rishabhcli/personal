const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/graph";
const STORE_RELATIVE_PATH = path.join("var", "graph-snapshot-receipts.json");
const maxReceipts = 50;
const HISTORY_NODE_PREVIEW_LIMIT = 3;
const HISTORY_EDGE_PREVIEW_LIMIT = 3;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function graphSnapshotPlan() {
  return {
    mode: "public-evidence-graph-snapshot-plan",
    command: "npm run record:graph-snapshot",
    endpoint: ENDPOINT,
    receiptStore: STORE_RELATIVE_PATH,
    scheduleRecommendation:
      "Run after changing graph node projection, claim/artifact/opportunity/narrative inputs, evidence receipts, maintenance or weakness data, or any UI graph rendering contract.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads the public-safe graph snapshot through /api/graph?refresh=1, writes a local receipt under var/, and does not publish, deploy, infer private graph state, load credentials, contact third parties, or mutate external systems.",
  };
}

function buildGraphPayloadSnapshot({ graph, receipts = [] }) {
  const latestReceipt = receipts[0] || null;
  const summary = graphSummary(graph, latestReceipt);
  return {
    ...graph,
    generatedAt: new Date().toISOString(),
    mode: "public-evidence-graph",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This graph is a public-safe local projection of projects, claims, artifacts, opportunities, narratives, objections, audience packets, maintenance, weaknesses, status receipts, and graph repair paths. It does not prove private graph state, production deployment facts, external uptime, credentials, inbox/calendar state, or third-party account state.",
    sideEffectBoundary:
      "This endpoint builds an in-memory public graph projection only. It does not write receipts, publish, deploy, enable private routes, contact third parties, read credentials, or mutate external systems.",
    plan: graphSnapshotPlan(),
    summary,
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          nodes: latestReceipt.summary?.nodes || 0,
          edges: latestReceipt.summary?.edges || 0,
        }
      : null,
  };
}

function buildGraphPayloadFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "public-evidence-graph-snapshot-receipt" || !receipt.graph || !receipt.summary) return null;
  const graph = receipt.graph;
  if (!isGraphShape(graph)) return null;
  return {
    ...graph,
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    mode: "public-evidence-graph",
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      graph.sourceBoundary ||
      "This response reconstructs the public evidence graph from the latest local snapshot receipt. It is not fresh graph analysis and does not prove private graph state, production deployment facts, external uptime, credentials, inbox/calendar state, or third-party account state.",
    sideEffectBoundary: receipt.sideEffectBoundary || graph.sideEffectBoundary || graphSnapshotPlan().sideEffectBoundary,
    plan: graphSnapshotPlan(),
    summary: {
      ...graphSummary(graph, receipt),
      ...graph.summary,
      latestReceiptId: receipt.id,
    },
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      nodes: receipt.summary?.nodes || graph.nodes.length,
      edges: receipt.summary?.edges || graph.edges.length,
    },
  };
}

function buildGraphPayloadResponse(graph, { detail = "summary", nodePreviewLimit = 10, edgePreviewLimit = 5 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const boundedNodePreview = Math.max(10, Math.min(Number(nodePreviewLimit) || 10, 200));
  const boundedEdgePreview = Math.max(5, Math.min(Number(edgePreviewLimit) || 5, 240));

  if (fullDetail) {
    return {
      ...graph,
      detail: "full",
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      graphPayloadPolicy: graphPayloadPolicy({
        fullDetail,
        nodePreviewLimit: boundedNodePreview,
        edgePreviewLimit: boundedEdgePreview,
        nodesReturned: nodes.length,
        edgesReturned: edges.length,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodes,
        edges,
      }),
    };
  }

  const nodePreview = selectNodePreview(nodes, boundedNodePreview);
  const edgePreview = selectEdgePreview(edges, boundedEdgePreview);
  const compactNodes = nodePreview.map(summarizeGraphNode);
  const compactEdges = edgePreview.map(summarizeGraphEdge);
  return {
    mode: graph.mode,
    cachedFromReceipt: Boolean(graph.cachedFromReceipt),
    ...(graph.cachedFromReceipt ? {} : { cachePolicy: graph.cachePolicy }),
    detail: "summary",
    compact: true,
    refreshEndpoint: graph.refreshEndpoint,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    sourceBoundaryAvailable: Boolean(graph.sourceBoundary),
    summary: summarizeGraphSummaryForResponse(graph.summary),
    nodes: compactNodes,
    edges: compactEdges,
    graphPayloadPolicy: graphPayloadPolicy({
      fullDetail,
      nodePreviewLimit: boundedNodePreview,
      edgePreviewLimit: boundedEdgePreview,
      nodesReturned: compactNodes.length,
      edgesReturned: compactEdges.length,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodes: compactNodes,
      edges: compactEdges,
    }),
  };
}

function appendGraphSnapshotReceipt(root, receipt) {
  const receipts = readGraphSnapshotReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readGraphSnapshotReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestGraphSnapshotReceipt(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return null;
  try {
    const cacheKey = receiptCacheKey(storePath);
    const cached = latestReceiptCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.receipt;
    const receipts = readGraphSnapshotReceipts(root);
    const receipt = receipts[0] || null;
    latestReceiptCache.set(storePath, { cacheKey, receipt });
    return receipt;
  } catch {
    return null;
  }
}

function readGraphSnapshotHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readGraphSnapshotReceipts(root);
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

function buildGraphSnapshotHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "public-evidence-graph-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    sourceBoundary: fullDetail
      ? "This endpoint returns full local graph snapshot receipts. It is still not private graph state, production deployment proof, external uptime validation, credential inspection, inbox/calendar state, or third-party account state."
      : undefined,
    ...(fullDetail
      ? {
          sideEffectBoundary:
            "The history endpoint reads local graph snapshot receipts only and does not rebuild the graph, start servers, publish, deploy, contact third parties, or mutate external systems.",
        }
      : {}),
    receiptStore: fullDetail ? STORE_RELATIVE_PATH : undefined,
    fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
    historyPayloadPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail: true,
          defaultLimit: 5,
          fullDetailEndpoint: `${ENDPOINT}/history?detail=full`,
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
      latestReceiptId: limited[0]?.id || null,
      latestNodes: limited[0]?.summary?.nodes || 0,
      latestEdges: limited[0]?.summary?.edges || 0,
    },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeGraphSnapshotReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? limited[0]?.report?.nextAction || "Run npm run record:graph-snapshot to create graph snapshot history."
      : undefined,
    verificationCommand: fullDetail ? "npm run record:graph-snapshot && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeGraphSnapshotReceipt(receipt, { includePreview = true } = {}) {
  const nodes = receipt.graph?.nodes || [];
  const edges = receipt.graph?.edges || [];
  const compact = {
    id: receipt.id,
    nodes: receipt.summary?.nodes || nodes.length,
    edges: receipt.summary?.edges || edges.length,
    nodeTypes: receipt.summary?.nodeTypes || summarizeNodes(nodes, receipt.summary).types,
    edgeRelations: receipt.summary?.edgeRelations || summarizeEdges(edges, receipt.summary).relations,
  };
  if (!includePreview) {
    return {
      ...compact,
      trendOnly: true,
    };
  }
  return {
    ...compact,
    nodePreview: nodes.slice(0, HISTORY_NODE_PREVIEW_LIMIT).map(({ id, type }) => ({ id, type })),
    edgePreview: edges.slice(0, HISTORY_EDGE_PREVIEW_LIMIT).map(({ source, target, relation }) => ({ source, target, relation })),
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 5, 50));
}

function summarizeNodes(nodes, summary = {}) {
  const typeCounts = nodes.reduce((counts, node) => {
    if (node.type) counts[node.type] = (counts[node.type] || 0) + 1;
    return counts;
  }, {});
  return {
    total: summary?.nodes || nodes.length,
    types: summary?.nodeTypes || Object.keys(typeCounts).length,
    project: typeCounts.project || 0,
    claim: typeCounts.claim || 0,
    artifact: typeCounts.artifact || 0,
    opportunity: typeCounts.opportunity || 0,
    repair: typeCounts["artifact-gap-repair"] || 0,
    narrative: (typeCounts.narrative || 0) + (typeCounts["tailored-narrative"] || 0),
  };
}

function summarizeEdges(edges, summary = {}) {
  const relationCounts = edges.reduce((counts, edge) => {
    if (edge.relation) counts[edge.relation] = (counts[edge.relation] || 0) + 1;
    return counts;
  }, {});
  return {
    total: summary?.edges || edges.length,
    relations: summary?.edgeRelations || Object.keys(relationCounts).length,
    hasArtifact: relationCounts["has-artifact"] || 0,
    unblocksOpportunityProof: relationCounts["unblocks-opportunity-proof"] || 0,
    pressureTestedBy: relationCounts["pressure-tested-by"] || 0,
    answeredByClaim: relationCounts["answered-by-claim"] || 0,
  };
}

function receiptCacheKey(storePath) {
  const file = statSync(storePath);
  return `${file.mtimeMs}:${file.size}`;
}

function graphSummary(graph, latestReceipt = null) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodeTypes = [...new Set(nodes.map((node) => node.type).filter(Boolean))].sort();
  const edgeRelations = [...new Set(edges.map((edge) => edge.relation).filter(Boolean))].sort();
  return {
    nodes: nodes.length,
    edges: edges.length,
    nodeTypes: nodeTypes.length,
    edgeRelations: edgeRelations.length,
    claimNodes: nodes.filter((node) => node.type === "claim").length,
    artifactNodes: nodes.filter((node) => node.type === "artifact").length,
    opportunityNodes: nodes.filter((node) => node.type === "opportunity").length,
    repairNodes: nodes.filter((node) => node.type === "artifact-gap-repair").length,
    narrativeNodes: nodes.filter((node) => node.type === "narrative" || node.type === "tailored-narrative").length,
    objectionNodes: nodes.filter((node) => node.type === "narrative-objection").length,
    maintenanceNodes: nodes.filter((node) => node.type === "maintenance").length,
    weaknessNodes: nodes.filter((node) => node.type === "weakness").length,
    publicSafeShape: isGraphShape(graph),
    latestReceiptId: latestReceipt?.id || null,
  };
}

function summarizeGraphSummaryForResponse(summary = {}) {
  return {
    nodes: summary.nodes || 0,
    edges: summary.edges || 0,
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function selectNodePreview(nodes, limit) {
  const selected = [];
  const seen = new Set();
  for (const id of ["qagent"]) {
    pushUniqueNode(selected, seen, nodes.find((node) => node.id === id));
    if (selected.length >= limit) return selected;
  }
  for (const type of requiredNodeTypes()) {
    if (selected.some((node) => node.type === type)) continue;
    pushUniqueNode(selected, seen, nodes.find((node) => node.type === type));
    if (selected.length >= limit) return selected;
  }
  for (const type of [...new Set(nodes.map((node) => node.type).filter(Boolean))].sort()) {
    pushUniqueNode(selected, seen, nodes.find((node) => node.type === type));
    if (selected.length >= limit) return selected;
  }
  for (const node of nodes) {
    if (selected.length >= limit) break;
    pushUniqueNode(selected, seen, node);
  }
  return selected;
}

function selectEdgePreview(edges, limit) {
  const selected = [];
  const seen = new Set();
  for (const relation of requiredEdgeRelations()) {
    pushUniqueEdge(selected, seen, edges.find((edge) => edge.relation === relation));
    if (selected.length >= limit) return selected;
  }
  pushUniqueEdge(selected, seen, edges.find((edge) => edge.source === "rishabh"));
  if (selected.length >= limit) return selected;
  pushUniqueEdge(selected, seen, edges.find((edge) => String(edge.target || "").startsWith("opportunity-")));
  if (selected.length >= limit) return selected;
  for (const relation of [...new Set(edges.map((edge) => edge.relation).filter(Boolean))].sort()) {
    pushUniqueEdge(selected, seen, edges.find((edge) => edge.relation === relation));
    if (selected.length >= limit) return selected;
  }
  for (const edge of edges) {
    if (selected.length >= limit) break;
    pushUniqueEdge(selected, seen, edge);
  }
  return selected;
}

function pushUniqueNode(selected, seen, node) {
  if (!node || seen.has(node.id)) return;
  selected.push(node);
  seen.add(node.id);
}

function pushUniqueEdge(selected, seen, edge) {
  if (!edge) return;
  const id = `${edge.source}:${edge.relation}:${edge.target}`;
  if (seen.has(id)) return;
  selected.push(edge);
  seen.add(id);
}

function summarizeGraphNode(node) {
  return {
    id: node.id,
    type: node.type,
  };
}

function summarizeGraphEdge(edge) {
  return {
    source: edge.source,
    target: edge.target,
    relation: edge.relation,
    explanationAvailable: Boolean(edge.explanation),
  };
}

function graphPayloadPolicy({ fullDetail, nodePreviewLimit, edgePreviewLimit, nodesReturned, edgesReturned, totalNodes, totalEdges, nodes, edges }) {
  const nodeTypesReturned = new Set((nodes || []).map((node) => node.type).filter(Boolean));
  const edgeRelationsReturned = new Set((edges || []).map((edge) => edge.relation).filter(Boolean));
  if (!fullDetail) {
    return {
      fullDetail,
      requiredNodeTypesReturned: requiredNodeTypes().filter((type) => nodeTypesReturned.has(type)).length,
      requiredEdgeRelationsReturned: requiredEdgeRelations().filter((relation) => edgeRelationsReturned.has(relation)).length,
      fullDetailAvailable: true,
    };
  }
  return {
    fullDetail,
    nodePreviewLimit,
    edgePreviewLimit,
    nodesReturned,
    edgesReturned,
    totalNodes,
    totalEdges,
    nodeTypesReturned: nodeTypesReturned.size,
    edgeRelationsReturned: edgeRelationsReturned.size,
    requiredNodeTypesReturned: requiredNodeTypes().filter((type) => nodeTypesReturned.has(type)).length,
    requiredEdgeRelationsReturned: requiredEdgeRelations().filter((relation) => edgeRelationsReturned.has(relation)).length,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
  };
}

function requiredNodeTypes() {
  return [
    "project",
    "claim",
    "artifact",
    "artifact-gap-repair",
    "narrative",
    "narrative-objection",
    "audience-packet",
    "maintenance",
    "weakness",
    "opportunity",
  ];
}

function requiredEdgeRelations() {
  return ["has-artifact", "unblocks-opportunity-proof", "pressure-tested-by", "answered-by-claim"];
}

function isGraphShape(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return false;
  const nodeTypes = new Set(graph.nodes.map((node) => node.type));
  const edgeRelations = new Set(graph.edges.map((edge) => edge.relation));
  return (
    requiredNodeTypes().every((type) => nodeTypes.has(type)) &&
    requiredEdgeRelations().every((relation) => edgeRelations.has(relation)) &&
    graph.edges.every((edge) => edge.source && edge.target && edge.relation && edge.explanation)
  );
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

module.exports = {
  appendGraphSnapshotReceipt,
  buildGraphPayloadFromReceipt,
  buildGraphPayloadResponse,
  buildGraphPayloadSnapshot,
  buildGraphSnapshotHistory,
  graphSnapshotPlan,
  readGraphSnapshotHistoryWindow,
  readLatestGraphSnapshotReceipt,
  readGraphSnapshotReceipts,
};
