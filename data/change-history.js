const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const STORE_RELATIVE_PATH = path.join("var", "change-history-store.json");
const ENDPOINT = "/api/change-history";

function changeHistoryPlan() {
  return {
    mode: "public-safe-change-history-plan",
    command: "npm run record:changes",
    endpoint: ENDPOINT,
    historyEndpoint: `${ENDPOINT}/history`,
    scope: "Current public-safe portfolio metrics, evidence counts, opportunities, packets, weakness maps, skill gaps, and contradiction counts.",
    limitation:
      "This is local snapshot comparison, not visitor tracking. It does not identify visitors, set cookies, read analytics, or infer who saw a prior version.",
    cachePolicy:
      "Public change-history reads use the latest stored local snapshot by default when present; append ?refresh=1 to recompute the current snapshot without recording it.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads the public-safe change-history endpoint with explicit refresh, writes a local snapshot under var/, and does not collect visitor analytics, set cookies, publish, deploy, contact users, or mutate third-party systems.",
    store: STORE_RELATIVE_PATH,
  };
}

function buildCurrentChangeSnapshot({
  projects,
  trust,
  artifactCatalog,
  opportunities,
  packets,
  weaknessMap,
  skillGaps,
  contradictions,
  artifactGapRepair = {},
  graphLineage = {},
}) {
  const graphSummary = graphLineage.summary || {};
  const metrics = {
    projects: projects.length,
    claims: trust.counts.totalClaims,
    needsSourceClaims: trust.counts.needsSourceClaims,
    privateReferences: trust.counts.privateReferences,
    staleClaims: trust.counts.staleClaims,
    artifacts: artifactCatalog.counts.artifacts,
    screenshotGaps: artifactCatalog.counts.screenshotGaps,
    topOpportunity: opportunities.opportunities[0]?.id || null,
    packetConfidence: Object.fromEntries((packets.packets || []).map((packet) => [packet.id, packet.uncertaintyDisclosure.confidenceScore])),
    highRiskProjects: weaknessMap.summary.projectsWithHighRisk,
    missingProofSkills: skillGaps.summary.missingProof,
    contradictions: contradictions.summary.conflicts,
    artifactGapRepairItems: artifactGapRepair.summary?.repairItems || artifactCatalog.counts.screenshotGaps || 0,
    artifactGapOpportunityUnlocks: artifactGapRepair.summary?.opportunityUnlocks || 0,
    artifactGapGraphPaths: graphSummary.artifactGapRepairPaths || 0,
    artifactGapGraphResolvedPaths: graphSummary.graphResolvedArtifactGapRepairPaths || 0,
  };
  return {
    id: `change-${Date.now()}`,
    capturedAt: new Date().toISOString(),
    mode: "public-safe-change-snapshot",
    digest: digest(metrics),
    metrics,
  };
}

function buildChangeHistoryReport({ currentSnapshot, history }) {
  const previous = history[0] || null;
  const changes = previous ? compareSnapshots(previous, currentSnapshot) : [];
  const proofRepairNarrative = proofRepairNarrativeFor(currentSnapshot, previous);
  return {
    generatedAt: new Date().toISOString(),
    mode: "public-safe-change-history",
    cachedFromSnapshot: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "Change history compares local public-safe snapshots. It reports what changed in the portfolio data, not who visited or what a specific visitor saw.",
    sideEffectBoundary: changeHistoryPlan().sideEffectBoundary,
    current: currentSnapshot,
    previous,
    summary: {
      storedSnapshots: history.length,
      changes: changes.length,
      hasPreviousSnapshot: Boolean(previous),
      digestChanged: previous ? previous.digest !== currentSnapshot.digest : false,
      proofRepairItems: currentSnapshot.metrics.artifactGapRepairItems || 0,
      proofRepairGraphPaths: currentSnapshot.metrics.artifactGapGraphPaths || 0,
      proofRepairGraphResolvedPaths: currentSnapshot.metrics.artifactGapGraphResolvedPaths || 0,
    },
    proofRepairNarrative,
    changes: changes.length
      ? changes
      : [
          {
            id: previous ? "no-metric-change" : "no-previous-snapshot",
            kind: previous ? "none" : "baseline-needed",
            label: previous
              ? "No public-safe metric changes since the last recorded snapshot."
              : "No previous snapshot exists yet. Run npm run record:changes to create one.",
            before: previous?.digest || null,
            after: currentSnapshot.digest,
          },
        ],
  };
}

function buildChangeHistoryReportFromSnapshots(history = []) {
  const currentSnapshot = history[0] || null;
  if (!currentSnapshot) return null;
  const report = buildChangeHistoryReport({
    currentSnapshot,
    history: history.slice(1),
  });
  return {
    ...report,
    generatedAt: new Date().toISOString(),
    cachedFromSnapshot: true,
    cachePolicy: "latest-local-snapshot",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response compares the latest stored local public-safe snapshot with the previous stored snapshot. It does not recompute current metrics during the request.",
    sideEffectBoundary: changeHistoryPlan().sideEffectBoundary,
    latestSnapshot: {
      id: currentSnapshot.id,
      capturedAt: currentSnapshot.capturedAt,
      digest: currentSnapshot.digest,
    },
  };
}

function buildChangeHistoryResponse(report, { detail = "summary" } = {}) {
  if (!report) return null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      changeHistoryPayloadPolicy: changeHistoryPayloadPolicy({
        fullDetail,
        report,
        returnedChanges: report.changes?.length || 0,
      }),
    };
  }

  const changes = report.changes || [];
  return {
    mode: report.mode,
    cachedFromSnapshot: Boolean(report.cachedFromSnapshot),
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    summary: summarizeChangeHistorySummary(report.summary),
    current: summarizeChangeSnapshot(report.current),
    proofRepair: summarizeProofRepairNarrative(report.proofRepairNarrative),
    changes: changes.slice(0, 5).map(({ id, before, after }) => ({
      id,
      changed: JSON.stringify(before) !== JSON.stringify(after),
    })),
    changeHistoryPayloadPolicy: changeHistoryPayloadPolicy({
      fullDetail,
      report,
      returnedChanges: Math.min(changes.length, 5),
    }),
  };
}

function summarizeChangeHistorySummary(summary = {}) {
  return {
    storedSnapshots: summary.storedSnapshots || 0,
    changes: summary.changes || 0,
    hasPreviousSnapshot: summary.hasPreviousSnapshot === true,
    proofRepairItems: summary.proofRepairItems || 0,
    proofRepairGraphPaths: summary.proofRepairGraphPaths || 0,
    proofRepairGraphResolvedPaths: summary.proofRepairGraphResolvedPaths || 0,
  };
}

function summarizeChangeSnapshot(snapshot) {
  if (!snapshot) return null;
  const metrics = snapshot.metrics || {};
  return {
    metrics: {
      projects: metrics.projects || 0,
      claims: metrics.claims || 0,
      artifacts: metrics.artifacts || 0,
      screenshotGaps: metrics.screenshotGaps || 0,
      artifactGapRepairItems: metrics.artifactGapRepairItems || 0,
      artifactGapGraphPaths: metrics.artifactGapGraphPaths || 0,
      artifactGapGraphResolvedPaths: metrics.artifactGapGraphResolvedPaths || 0,
    },
  };
}

function summarizeProofRepairNarrative(narrative) {
  if (!narrative) return null;
  return {
    currentAvailable: Boolean(narrative.current),
    changedSincePrevious: Boolean(narrative.changedSincePrevious),
    boundaryAvailable: Boolean(narrative.boundary),
  };
}

function changeHistoryPayloadPolicy({ fullDetail, report, returnedChanges }) {
  if (!fullDetail) {
    return {
      fullDetail,
      returnedChanges,
      totalChanges: report.changes?.length || 0,
    };
  }
  return {
    detail: fullDetail ? "full" : "summary",
    defaultDetail: "summary",
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    returnedChanges,
    totalChanges: report.changes?.length || 0,
    fullDetailRetains: ["current.metrics", "previous.metrics", "proofRepairNarrative"],
    omittedFromSummary: fullDetail
      ? []
      : ["generatedAt", "capturedAt", "sourceBoundary", "sideEffectBoundary", "packetConfidenceDetail", "changeBeforeAfterValues"],
  };
}

function proofRepairNarrativeFor(current, previous) {
  const metrics = current.metrics || {};
  const previousMetrics = previous?.metrics || {};
  const graphResolved = metrics.artifactGapGraphResolvedPaths || 0;
  const graphPaths = metrics.artifactGapGraphPaths || 0;
  const repairItems = metrics.artifactGapRepairItems || 0;
  const opportunityUnlocks = metrics.artifactGapOpportunityUnlocks || 0;
  return {
    label: "Proof-repair pressure",
    current:
      graphPaths > 0
        ? `${graphResolved}/${graphPaths} graph-visible proof-repair path(s) across ${repairItems} repair item(s), with ${opportunityUnlocks} opportunity unlock(s).`
        : `${repairItems} repair item(s) are tracked, but graph-visible proof-repair paths are not yet recorded in this snapshot.`,
    changedSincePrevious: previous
      ? ["artifactGapRepairItems", "artifactGapGraphPaths", "artifactGapGraphResolvedPaths", "artifactGapOpportunityUnlocks"].some(
          (key) => JSON.stringify(previousMetrics[key]) !== JSON.stringify(metrics[key]),
        )
      : false,
    boundary:
      "This narrative tracks public-safe repair pressure only; it does not claim missing screenshots, videos, outreach, applications, or third-party outcomes exist.",
  };
}

function readChangeHistory(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
  } catch {
    return [];
  }
}

function appendChangeSnapshot(root, snapshot) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  const history = readChangeHistory(root);
  const snapshots = [snapshot, ...history.filter((item) => item.digest !== snapshot.digest)].slice(0, 50);
  writeFileSync(storePath, `${JSON.stringify({ snapshots }, null, 2)}\n`);
  return snapshot;
}

function compareSnapshots(previous, current) {
  const changes = [];
  for (const [key, after] of Object.entries(current.metrics)) {
    const before = previous.metrics?.[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push({
      id: `metric.${key}`,
      kind: "metric-change",
      label: metricLabel(key),
      before,
      after,
    });
  }
  return changes;
}

function metricLabel(key) {
  return key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

module.exports = {
  appendChangeSnapshot,
  buildChangeHistoryReportFromSnapshots,
  buildChangeHistoryReport,
  buildChangeHistoryResponse,
  buildCurrentChangeSnapshot,
  changeHistoryPlan,
  readChangeHistory,
};
