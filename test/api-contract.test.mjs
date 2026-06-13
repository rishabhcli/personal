import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { projects, domains, internalChecks, liveDemoChecks, profile } = require("../data/portfolio-data");
const { buildClaimLedger, trustSummary } = require("../data/evidence-model");
const { buildOpportunityRadar } = require("../data/opportunity-model");
const { buildOpportunityPackages, selectOpportunityPackage } = require("../data/opportunity-packages");
const {
  buildOpportunityBoard,
  buildOpportunityBoardFromReceipt,
  buildOpportunityBoardResponse,
  opportunityBoardPlan,
  selectOpportunityBoardPackage,
} = require("../data/opportunity-board");
const { buildOpportunityDeRiskingReport, opportunityDeRiskingPlan } = require("../data/opportunity-derisking");
const {
  buildOpportunityRankingDetailResponse,
  buildOpportunityRankingHistory,
  buildOpportunityRankingReportFromReceipt,
  buildOpportunityRankingReport,
  buildOpportunityRankingResponse,
  opportunityRankingPlan,
} = require("../data/opportunity-ranking");
const {
  buildOpportunityScorecardDetailResponse,
  buildOpportunityScorecardReportFromReceipt,
  buildOpportunityScorecardReport,
  buildOpportunityScorecardResponse,
  opportunityScorecardPlan,
  selectOpportunityScorecard,
} = require("../data/opportunity-scorecard");
const {
  buildOpportunityQualityEvaluation,
  buildOpportunityQualityEvaluationFromReceipt,
  opportunityQualityPlan,
} = require("../data/opportunity-quality");
const { buildPrivateCockpit, privateCockpitPlan } = require("../data/private-cockpit");
const { buildPrivateNextActionPlan, privateNextActionsPlan } = require("../data/private-planner");
const { buildPrivateChiefOfStaffReadiness, privateChiefOfStaffPlan } = require("../data/private-chief-of-staff");
const { buildPrivateChiefDraftsReport, privateChiefDraftsPlan, selectPrivateChiefDraft } = require("../data/private-chief-drafts");
const { buildPrivateSchedule, privateSchedulePlan } = require("../data/private-schedule");
const { buildPrivatePrioritizationReport, privatePrioritizationPlan } = require("../data/private-priorities");
const { buildPrivateBriefingDrafts, privateBriefingDraftsPlan } = require("../data/private-briefing-drafts");
const { buildPrivateTaskTracker, defaultPrivateTaskStore, privateTaskTrackerPlan } = require("../data/private-task-tracker");
const { buildPrivateReviewSessions, privateReviewSessionsPlan } = require("../data/private-review-sessions");
const { buildArtifactCatalog } = require("../data/artifact-model");
const { buildArtifactTranscriptLibrary } = require("../data/artifact-transcripts");
const { buildPrivacyApprovalAudit, defaultPrivacyApprovalStore, privacyApprovalPlan } = require("../data/privacy-approval");
const { buildProofTrialHistory, buildProofTrials, buildProofTrialsIndex, proofTrialsPlan, runProofTrial } = require("../data/proof-trials");
const { buildAudiencePackets, selectAudiencePacket } = require("../data/audience-packets");
const { buildNarrativeGroundingReport } = require("../data/narrative-grounding");
const { buildSelfReviewReports } = require("../data/self-review");
const { buildOutreachDraftCatalog, defaultOutreachDraftStore, outreachDraftPlan } = require("../data/outreach-drafts");
const { detectContradictions } = require("../data/contradiction-model");
const { buildProjectWeaknessMap } = require("../data/weakness-map");
const { buildSkillGapMap } = require("../data/skill-map");
const { buildGraphQualityReport, graphQualityPlan } = require("../data/graph-quality");
const { buildGraphCrosslinkReport, graphCrosslinkPlan } = require("../data/graph-crosslinks");
const { buildGraphScoreboard, buildGraphScoreboardHistory, graphScoreboardPlan } = require("../data/graph-scoreboard");
const { graphSnapshotPlan } = require("../data/graph-snapshot");
const { graphLineagePlan } = require("../data/graph-lineage");
const { runtimeRouteManifest } = require("../data/runtime-attestation");
const { buildRuntimeDiffReport, runtimeDiffPlan } = require("../data/runtime-diff");
const { proofQualityPlan } = require("../data/proof-quality");
const { searchQualityPlan } = require("../data/search-quality");

let server;
let baseUrl;

async function getOpenPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const response = await fetch(`${url}/api/projects`);
      if (response.ok) return;
    } catch {
      // Keep polling until the child process finishes booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Server did not become ready");
}

async function json(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

describe("personal command center API", () => {
  before(async () => {
    const port = await getOpenPort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ["server.js"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForServer(baseUrl);
  });

  after(() => {
    server?.kill();
  });

  it("serves the named public API surfaces", async () => {
    const projects = await json("/api/projects");
    assert.equal(projects.response.status, 200);
    assert.equal(projects.body.mode, "public-project-catalog");
    assert.equal(projects.body.detail, "summary");
    assert.equal(projects.body.compact, true);
    assert.equal(projects.body.fullDetailEndpoint, "/api/projects?detail=full");
    assert.equal(projects.body.uiDetailEndpoint, "/api/projects?detail=ui");
    assert.equal(projects.body.caseStudyEndpointTemplate, "/api/case-study/:slug");
    assert.equal(projects.body.projectPayloadPolicy.fullDetail, false);
    assert.equal(projects.body.projectPayloadPolicy.caseStudyDetailAvailable, true);
    assert.ok(Buffer.byteLength(JSON.stringify(projects.body)) < 1500);
    assert.ok(projects.body.projects.length >= 10);
    assert.ok(projects.body.projects.some((project) => project.slug === "qagent"));
    assert.ok(projects.body.projects.every((project) => project.counts === undefined && project.linkState === undefined));
    assert.ok(projects.body.projects.every((project) => !("why" in project) && !("summary" in project) && !("tags" in project)));
    assert.ok(projects.body.projects.every((project) => !("stack" in project) && !("proof" in project)));
    assert.ok(projects.body.projects.every((project) => !("caseStudyEndpoint" in project) && !("visibility" in project) && !("kind" in project)));
    assert.equal(projects.body.profile.email, "rishabh.rb@icloud.com");
    assert.ok(!("education" in projects.body.profile));
    assert.ok(!("proof" in projects.body.profile));
    assert.equal(typeof projects.body.archiveNoteCount, "number");
    assert.ok(!("archiveNotes" in projects.body));
    const uiProjects = await json("/api/projects?detail=ui");
    assert.equal(uiProjects.response.status, 200);
    assert.equal(uiProjects.body.detail, "ui");
    assert.equal(uiProjects.body.compact, true);
    assert.equal(uiProjects.body.projects.length, projects.body.projects.length);
    assert.ok(uiProjects.body.projects.every((project) => Array.isArray(project.tags) && project.why));
    assert.ok(uiProjects.body.projects.every((project) => !("stack" in project) && !("proof" in project)));
    assert.ok(uiProjects.body.projects.every((project) => Number.isInteger(project.stackCount) && Number.isInteger(project.proofCount)));
    assert.ok(Array.isArray(uiProjects.body.archiveNotes));
    const fullProjects = await json("/api/projects?detail=full");
    assert.equal(fullProjects.response.status, 200);
    assert.equal(fullProjects.body.detail, "full");
    assert.equal(fullProjects.body.compact, false);
    assert.equal(fullProjects.body.projectPayloadPolicy.fullDetail, true);
    assert.ok(fullProjects.body.projects.some((project) => project.slug === "qagent" && project.stack.length && project.proof.length));
    assert.ok(JSON.stringify(projects.body).length < JSON.stringify(fullProjects.body).length);

    const graph = await json("/api/graph");
    assert.equal(graph.response.status, 200);
    assert.equal(graph.body.mode, "public-evidence-graph");
    assert.equal(typeof graph.body.cachedFromReceipt, "boolean");
    assert.equal(graph.body.refreshEndpoint, "/api/graph?refresh=1");
    assert.equal(graph.body.detail, "summary");
    assert.equal(graph.body.fullDetailEndpoint, "/api/graph?detail=full");
    assert.equal(graph.body.graphPayloadPolicy.fullDetail, false);
    assert.equal(graph.body.graphPayloadPolicy.fullDetailEndpoint, undefined);
    assert.equal(graph.body.graphPayloadPolicy.fullDetailAvailable, true);
    assert.equal(graph.body.graphPayloadPolicy.requiredNodeTypesReturned, 10);
    assert.equal(graph.body.graphPayloadPolicy.requiredEdgeRelationsReturned, 4);
    assert.equal(graph.body.sourceBoundary, undefined);
    assert.equal(graph.body.sourceBoundaryAvailable, true);
    assert.ok(Buffer.byteLength(JSON.stringify(graph.body)) < 1700);
    assert.equal(graph.body.generatedAt, undefined);
    assert.equal(graph.body.checkedAt, undefined);
    assert.equal(graph.body.latestReceipt, undefined);
    assert.equal(graph.body.planEndpoint, undefined);
    assert.equal(graph.body.receiptStore, undefined);
    assert.equal(typeof graph.body.summary.latestReceiptId, "string");
    assert.equal(graph.body.summary.claimNodes, undefined);
    assert.equal(graph.body.summary.nodeTypes, undefined);
    assert.equal(graph.body.summary.publicSafeShape, undefined);
    assert.ok(graph.body.nodes.length <= 12);
    assert.ok(graph.body.edges.length <= 6);
    assert.ok(graph.body.nodes.length < graph.body.summary.nodes);
    assert.ok(graph.body.edges.length < graph.body.summary.edges);
    assert.ok(graph.body.nodes.some((node) => node.id === "qagent"));
    assert.ok(graph.body.nodes.some((node) => node.type === "claim"));
    assert.ok(graph.body.nodes.some((node) => node.type === "artifact"));
    assert.ok(graph.body.nodes.some((node) => node.type === "artifact-gap-repair"));
    assert.ok(graph.body.nodes.some((node) => node.type === "narrative"));
    assert.ok(graph.body.nodes.some((node) => node.type === "narrative-objection"));
    assert.ok(graph.body.nodes.some((node) => node.type === "audience-packet"));
    assert.ok(graph.body.nodes.some((node) => node.type === "maintenance"));
    assert.ok(graph.body.nodes.some((node) => node.type === "weakness"));
    assert.ok(graph.body.nodes.some((node) => node.type === "opportunity"));
    assert.ok(graph.body.nodes.every((node) => !("label" in node) && !("score" in node)));
    assert.ok(graph.body.edges.some((edge) => edge.source === "rishabh"));
    assert.ok(graph.body.edges.some((edge) => String(edge.target).startsWith("opportunity-")));
    assert.ok(graph.body.edges.some((edge) => edge.relation === "has-artifact"));
    assert.ok(graph.body.edges.some((edge) => edge.relation === "unblocks-opportunity-proof"));
    assert.ok(graph.body.edges.some((edge) => edge.relation === "pressure-tested-by"));
    assert.ok(graph.body.edges.some((edge) => edge.relation === "answered-by-claim"));
    assert.ok(graph.body.edges.every((edge) => edge.relation && edge.explanationAvailable === true && !edge.explanation && !("weight" in edge)));
    const liveGraph = await json("/api/graph?refresh=1");
    assert.equal(liveGraph.response.status, 200);
    assert.equal(liveGraph.body.cachedFromReceipt, false);
    assert.equal(liveGraph.body.cachePolicy, "live-refresh");
    const fullGraph = await json("/api/graph?detail=full");
    assert.equal(fullGraph.response.status, 200);
    assert.equal(fullGraph.body.detail, "full");
    assert.equal(fullGraph.body.graphPayloadPolicy.fullDetail, true);
    assert.equal(fullGraph.body.nodes.length, graph.body.summary.nodes);
    assert.equal(fullGraph.body.edges.length, graph.body.summary.edges);
    assert.ok(fullGraph.body.edges.every((edge) => edge.explanation));
    const graphPlan = await json("/api/graph/plan");
    assert.equal(graphPlan.response.status, 200);
    assert.equal(graphPlan.body.command, "npm run record:graph-snapshot");
    assert.equal(graphSnapshotPlan().endpoint, "/api/graph");
    const graphHistory = await json("/api/graph/history");
    assert.equal(graphHistory.response.status, 200);
    assert.equal(graphHistory.body.mode, "public-evidence-graph-history");
    assert.equal(graphHistory.body.detail, "summary");
    assert.equal(graphHistory.body.compact, true);
    assert.equal(graphHistory.body.summary.limit, 5);
    assert.equal(graphHistory.body.fullDetailEndpoint, "/api/graph/history?detail=full");
    assert.equal(graphHistory.body.sourceBoundary, undefined);
    assert.equal(graphHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(graphHistory.body.receiptStore, undefined);
    assert.equal(graphHistory.body.receiptStoreAvailable, undefined);
    assert.equal(graphHistory.body.generatedAt, undefined);
    assert.equal(graphHistory.body.definitions, undefined);
    assert.equal(graphHistory.body.nextActionAvailable, undefined);
    assert.equal(graphHistory.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(graphHistory.body)) < 2500);
    assert.equal(graphHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(graphHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(graphHistory.body.historyPayloadPolicy.historyRowsReturned, graphHistory.body.receipts.length);
    assert.equal(graphHistory.body.historyPayloadPolicy.latestNodePreviewLimit, undefined);
    assert.ok(Array.isArray(graphHistory.body.receipts));
    assert.ok(graphHistory.body.receipts.length <= 5);
    if (graphHistory.body.receipts.length > 0) {
      assert.equal(graphHistory.body.receipts[0].mode, undefined);
      assert.ok(Array.isArray(graphHistory.body.receipts[0].nodePreview));
      assert.ok(Array.isArray(graphHistory.body.receipts[0].edgePreview));
      assert.ok(graphHistory.body.receipts[0].nodePreview.length <= 3);
      assert.ok(graphHistory.body.receipts[0].edgePreview.length <= 3);
      assert.ok(graphHistory.body.receipts[0].nodePreview.every((node) => !("label" in node)));
      assert.ok(graphHistory.body.receipts[0].nodePreview.every((node) => !("score" in node)));
      assert.equal(typeof graphHistory.body.receipts[0].nodes, "number");
      assert.equal(graphHistory.body.receipts[0].nodeSummary, undefined);
      assert.equal(graphHistory.body.receipts[0].edgeSummary, undefined);
    }
    if (graphHistory.body.receipts.length > 1) {
      assert.equal(graphHistory.body.receipts[1].nodePreview, undefined);
      assert.equal(graphHistory.body.receipts[1].edgePreview, undefined);
      assert.equal(graphHistory.body.receipts[1].checkedAt, undefined);
      assert.equal(graphHistory.body.receipts[1].trendOnly, true);
    }
    const fullGraphHistory = await json("/api/graph/history?detail=full&limit=10");
    assert.equal(fullGraphHistory.response.status, 200);
    assert.equal(fullGraphHistory.body.detail, "full");
    assert.equal(fullGraphHistory.body.compact, false);
    assert.equal(fullGraphHistory.body.historyPayloadPolicy.fullDetail, true);
    if (fullGraphHistory.body.receipts.length > 0) {
      assert.equal(fullGraphHistory.body.receipts[0].mode, "public-evidence-graph-snapshot-receipt");
      assert.ok(Array.isArray(fullGraphHistory.body.receipts[0].graph.nodes));
    }

    const graphQuality = await json("/api/graph-quality");
    assert.equal(graphQuality.response.status, 200);
    assert.equal(graphQuality.body.mode, "evidence-graph-quality-report");
    assert.equal(typeof graphQuality.body.cachedFromReceipt, "boolean");
    assert.equal(graphQuality.body.refreshEndpoint, "/api/graph-quality?refresh=1");
    assert.equal(graphQuality.body.detail, "summary");
    assert.equal(graphQuality.body.compact, true);
    assert.equal(graphQuality.body.fullDetailEndpoint, "/api/graph-quality?detail=full");
    assert.equal(graphQuality.body.graphQualityPayloadPolicy.fullDetail, false);
    assert.equal(graphQuality.body.graphQualityPayloadPolicy.checkDetailAvailable, true);
    assert.equal(graphQuality.body.graphQualityPayloadPolicy.checkRepairActionAvailable, true);
    assert.equal(graphQuality.body.graphQualityPayloadPolicy.checkVerificationCommandAvailable, true);
    assert.equal(graphQuality.body.graphQualityPayloadPolicy.gapDetailAvailable, true);
    assert.ok(graphQuality.body.summary.checks >= 8);
    assert.equal(graphQuality.body.summary.auditCoverageScore, 100);
    assert.ok(graphQuality.body.checks.every((check) => check.passed));
    assert.ok(graphQuality.body.checks.every((check) => !("detail" in check)));
    assert.ok(graphQuality.body.checks.every((check) => !("repairAction" in check)));
    assert.ok(graphQuality.body.checks.every((check) => !("verificationCommand" in check)));
    assert.ok(graphQuality.body.gapSummary);
    assert.equal(graphQuality.body.plan.command, "npm run audit:graph-quality");
    assert.ok(graphQuality.body.checks.some((check) => check.id === "edge-explanations"));
    const fullGraphQuality = await json("/api/graph-quality?detail=full");
    assert.equal(fullGraphQuality.response.status, 200);
    assert.equal(fullGraphQuality.body.detail, "full");
    assert.equal(fullGraphQuality.body.compact, false);
    assert.equal(fullGraphQuality.body.graphQualityPayloadPolicy.fullDetail, true);
    assert.ok(fullGraphQuality.body.checks.every((check) => check.detail && check.repairAction && check.verificationCommand));
    assert.ok(Array.isArray(fullGraphQuality.body.gaps.projectsWithoutArtifact));
    const liveGraphQuality = await json("/api/graph-quality?refresh=1");
    assert.equal(liveGraphQuality.response.status, 200);
    assert.equal(liveGraphQuality.body.cachedFromReceipt, false);
    assert.equal(liveGraphQuality.body.cachePolicy, "live-refresh");
    assert.equal(liveGraphQuality.body.compact, true);
    const graphQualityPlanResponse = await json("/api/graph-quality/plan");
    assert.equal(graphQualityPlanResponse.response.status, 200);
    assert.equal(graphQualityPlanResponse.body.command, "npm run audit:graph-quality");
    assert.equal(graphQualityPlan().endpoint, "/api/graph-quality");
    const graphQualityHistory = await json("/api/graph-quality/history");
    assert.equal(graphQualityHistory.response.status, 200);
    assert.equal(graphQualityHistory.body.mode, "evidence-graph-quality-history");
    assert.equal(graphQualityHistory.body.detail, "summary");
    assert.equal(graphQualityHistory.body.compact, true);
    assert.equal(graphQualityHistory.body.summary.limit, 5);
    assert.equal(graphQualityHistory.body.generatedAt, undefined);
    assert.equal(graphQualityHistory.body.receiptStore, undefined);
    assert.equal(graphQualityHistory.body.receiptStoreAvailable, true);
    assert.equal(graphQualityHistory.body.fullDetailEndpoint, "/api/graph-quality/history?detail=full");
    assert.equal(graphQualityHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(graphQualityHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(graphQualityHistory.body.sourceBoundary, undefined);
    assert.equal(graphQualityHistory.body.sourceBoundaryAvailable, true);
    assert.equal(graphQualityHistory.body.sideEffectBoundary, undefined);
    assert.equal(graphQualityHistory.body.sideEffectBoundaryAvailable, true);
    assert.equal(graphQualityHistory.body.nextAction, undefined);
    assert.equal(graphQualityHistory.body.nextActionAvailable, true);
    assert.equal(graphQualityHistory.body.verificationCommand, undefined);
    assert.equal(graphQualityHistory.body.verificationCommandAvailable, true);
    assert.ok(Array.isArray(graphQualityHistory.body.receipts));
    if (graphQualityHistory.body.receipts.length > 0) {
      assert.ok(graphQualityHistory.body.receipts[0].gapSummary);
      assert.ok(Array.isArray(graphQualityHistory.body.receipts[0].checkPreview));
      assert.ok(graphQualityHistory.body.receipts[0].checkPreview.length <= 4);
      assert.ok(graphQualityHistory.body.receipts[0].checkPreview.every((check) => !("detail" in check)));
      assert.equal(graphQualityHistory.body.receipts[0].checkCount, undefined);
      assert.equal(graphQualityHistory.body.receipts[0].summary.score, undefined);
      assert.equal(graphQualityHistory.body.receipts[0].mode, undefined);
      assert.equal(graphQualityHistory.body.receipts[0].report, undefined);
      assert.equal(graphQualityHistory.body.receipts[0].checkedAt, undefined);
      assert.ok(graphQualityHistory.body.receipts.slice(1).every((receipt) => receipt.checkPreview === undefined));
      assert.ok(graphQualityHistory.body.receipts.slice(1).every((receipt) => receipt.gapSummary === undefined && receipt.latestReceiptPreviewOnly === true));
    }
    assert.ok(Buffer.byteLength(JSON.stringify(graphQualityHistory.body)) < 2500);
    const fullGraphQualityHistory = await json("/api/graph-quality/history?detail=full&limit=10");
    assert.equal(fullGraphQualityHistory.response.status, 200);
    assert.equal(fullGraphQualityHistory.body.detail, "full");
    assert.equal(fullGraphQualityHistory.body.compact, false);
    assert.equal(fullGraphQualityHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(typeof fullGraphQualityHistory.body.generatedAt === "string");
    assert.equal(fullGraphQualityHistory.body.receiptStore, "var/graph-quality-receipts.json");
    assert.ok(fullGraphQualityHistory.body.receipts[0].baseUrl);
    assert.ok(fullGraphQualityHistory.body.receipts[0].report);

    const graphCrosslinks = await json("/api/graph-crosslinks");
    assert.equal(graphCrosslinks.response.status, 200);
    assert.equal(graphCrosslinks.body.mode, "evidence-graph-crosslink-report");
    assert.equal(typeof graphCrosslinks.body.cachedFromReceipt, "boolean");
    assert.equal(graphCrosslinks.body.refreshEndpoint, "/api/graph-crosslinks?refresh=1");
    assert.equal(graphCrosslinks.body.detail, "summary");
    assert.equal(graphCrosslinks.body.fullDetailEndpoint, "/api/graph-crosslinks?detail=full");
    assert.equal(graphCrosslinks.body.crosslinkPayloadPolicy.fullDetail, false);
    assert.equal(graphCrosslinks.body.crosslinkPayloadPolicy.fullDetailAvailable, undefined);
    assert.equal(graphCrosslinks.body.crosslinkPayloadPolicy.fullDetailEndpoint, undefined);
    assert.ok(graphCrosslinks.body.crosslinkPayloadPolicy.crosslinksReturned <= 4);
    assert.ok(Buffer.byteLength(JSON.stringify(graphCrosslinks.body)) < 2500);
    assert.ok(graphCrosslinks.body.crosslinks.length < graphCrosslinks.body.summary.links);
    assert.ok(graphCrosslinks.body.crosslinks.some((link) => link.relation === "narrative-uses-claim"));
    assert.ok(graphCrosslinks.body.crosslinks.some((link) => link.relation === "narrative-objection-answered-by-claim"));
    assert.ok(graphCrosslinks.body.crosslinks.every((link) => link.explanationAvailable === undefined && !link.explanation));
    assert.ok(graphCrosslinks.body.crosslinks.every((link) => !("id" in link) && !("publicProjection" in link)));
    assert.equal(graphCrosslinks.body.summary.auditCoverageScore, 100);
    assert.equal(typeof graphCrosslinks.body.summary.latestReceiptId, "string");
    assert.equal(graphCrosslinks.body.plan.command, "npm run audit:graph-crosslinks");
    assert.equal(graphCrosslinks.body.plan.endpoint, undefined);
    assert.ok(graphCrosslinks.body.checks.every((check) => check.passed));
    assert.ok(graphCrosslinks.body.checks.length <= 4);
    assert.equal(graphCrosslinks.body.latestReceipt, undefined);
    assert.equal(graphCrosslinks.body.sourceBoundaryAvailable, undefined);
    assert.equal(graphCrosslinks.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(graphCrosslinks.body.nextActionAvailable, undefined);
    assert.equal(graphCrosslinks.body.verificationCommandAvailable, undefined);
    const fullGraphCrosslinks = await json("/api/graph-crosslinks?detail=full");
    assert.equal(fullGraphCrosslinks.response.status, 200);
    assert.equal(fullGraphCrosslinks.body.detail, "full");
    assert.equal(fullGraphCrosslinks.body.crosslinkPayloadPolicy.fullDetail, true);
    assert.ok(fullGraphCrosslinks.body.crosslinks.length >= graphCrosslinks.body.summary.links);
    const liveGraphCrosslinks = await json("/api/graph-crosslinks?refresh=1");
    assert.equal(liveGraphCrosslinks.response.status, 200);
    assert.equal(liveGraphCrosslinks.body.mode, "evidence-graph-crosslink-report");
    assert.equal(liveGraphCrosslinks.body.cachedFromReceipt, false);
    assert.equal(liveGraphCrosslinks.body.cachePolicy, "live-refresh");
    assert.equal(liveGraphCrosslinks.body.detail, "summary");
    const graphCrosslinksPlan = await json("/api/graph-crosslinks/plan");
    assert.equal(graphCrosslinksPlan.response.status, 200);
    assert.equal(graphCrosslinksPlan.body.command, "npm run audit:graph-crosslinks");
    assert.equal(graphCrosslinkPlan().endpoint, "/api/graph-crosslinks");
    const graphCrosslinksHistory = await json("/api/graph-crosslinks/history");
    assert.equal(graphCrosslinksHistory.response.status, 200);
    assert.equal(graphCrosslinksHistory.body.mode, "evidence-graph-crosslink-history");
    assert.equal(graphCrosslinksHistory.body.detail, "summary");
    assert.equal(graphCrosslinksHistory.body.compact, true);
    assert.equal(graphCrosslinksHistory.body.summary.limit, 5);
    assert.equal(graphCrosslinksHistory.body.fullDetailEndpoint, "/api/graph-crosslinks/history?detail=full");
    assert.equal(graphCrosslinksHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(graphCrosslinksHistory.body.historyPayloadPolicy.historyRowLimit, undefined);
    assert.equal(graphCrosslinksHistory.body.receipts.length, graphCrosslinksHistory.body.historyPayloadPolicy.historyRowsReturned);
    assert.equal(graphCrosslinksHistory.body.generatedAt, undefined);
    assert.equal(graphCrosslinksHistory.body.receiptStore, undefined);
    assert.equal(graphCrosslinksHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(graphCrosslinksHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(graphCrosslinksHistory.body.definitions, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(graphCrosslinksHistory.body)) < 1100);
    assert.ok(Array.isArray(graphCrosslinksHistory.body.receipts));
    assert.ok(graphCrosslinksHistory.body.receipts.length <= 1);
    assert.ok(graphCrosslinksHistory.body.receipts.every((receipt) => !receipt.report));
    assert.equal(graphCrosslinksHistory.body.receipts[0]?.checkedAt, undefined);
    assert.ok(graphCrosslinksHistory.body.receipts[0]?.crosslinkPreview);
    assert.ok(graphCrosslinksHistory.body.receipts[0].crosslinkPreview.length <= 2);
    assert.equal(typeof graphCrosslinksHistory.body.receipts[0].relationTypes, "number");
    assert.equal(typeof graphCrosslinksHistory.body.receipts[0].dominantRelation, "string");
    assert.equal(graphCrosslinksHistory.body.nextActionAvailable, undefined);
    assert.equal(graphCrosslinksHistory.body.verificationCommandAvailable, undefined);

    const fullGraphCrosslinksHistory = await json("/api/graph-crosslinks/history?detail=full&limit=10");
    assert.equal(fullGraphCrosslinksHistory.response.status, 200);
    assert.equal(fullGraphCrosslinksHistory.body.detail, "full");
    assert.equal(fullGraphCrosslinksHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullGraphCrosslinksHistory.body.receipts.length <= 10);
    assert.ok(fullGraphCrosslinksHistory.body.receipts.every((receipt) => receipt.report));

    const graphScoreboard = await json("/api/graph-scoreboard");
    assert.equal(graphScoreboard.response.status, 200);
    assert.equal(graphScoreboard.body.mode, "evidence-graph-normalization-scoreboard");
    assert.equal(graphScoreboard.body.detail, "summary");
    assert.equal(graphScoreboard.body.fullDetailEndpoint, "/api/graph-scoreboard?detail=full");
    assert.equal(graphScoreboard.body.graphScoreboardPayloadPolicy.fullDetail, false);
    assert.equal(graphScoreboard.body.graphScoreboardPayloadPolicy.omittedCount, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(graphScoreboard.body)) < 1700);
    assert.equal(graphScoreboard.body.generatedAt, undefined);
    assert.equal(graphScoreboard.body.checkedAt, undefined);
    assert.equal(graphScoreboard.body.cachePolicy, undefined);
    assert.equal(typeof graphScoreboard.body.cachedFromReceipt, "boolean");
    assert.equal(graphScoreboard.body.refreshEndpoint, "/api/graph-scoreboard?refresh=1");
    assert.equal(graphScoreboard.body.summary.auditCoverageScore, 100);
    assert.equal(graphScoreboard.body.plan.command, "npm run audit:graph-scoreboard");
    assert.ok(graphScoreboard.body.summary.modeledEntityTypes >= 10);
    assert.ok(graphScoreboard.body.summary.crosslinksRenderedCovered > 0);
    assert.equal(graphScoreboard.body.summary.normalizationLedgerItems, graphScoreboard.body.summary.modeledEntityTypes);
    assert.equal(graphScoreboard.body.summary.publicSafeNormalizationItems, graphScoreboard.body.summary.normalizationLedgerItems);
    assert.ok(graphScoreboard.body.checks.some((check) => check.id === "normalization-ledger-depth" && check.passed));
    assert.ok(graphScoreboard.body.checks.some((check) => check.id === "public-safe-normalization" && check.passed));
    assert.ok(!("normalizedTypes" in graphScoreboard.body));
    assert.ok(!("normalizationLedger" in graphScoreboard.body));
    assert.ok(graphScoreboard.body.topNormalizedTypes.some((type) => type.type === "artifact"));
    assert.ok(graphScoreboard.body.normalizedTypeSummary.ledgerItems === graphScoreboard.body.summary.normalizationLedgerItems);
    assert.ok(graphScoreboard.body.normalizedTypeSummary.publicSafeLedgerItems === graphScoreboard.body.summary.publicSafeNormalizationItems);
    assert.ok(graphScoreboard.body.summary.score >= 85);
    assert.equal(graphScoreboard.body.quarantine.summary.blocking, 0);
    assert.ok(graphScoreboard.body.quarantine.summary.visiblePressureTests > 0);
    assert.ok(!("items" in graphScoreboard.body.quarantine));
    assert.ok(graphScoreboard.body.quarantine.topItems.every((item) => typeof item.blocking === "boolean" && item.disposition && !("reason" in item) && !("action" in item)));
    assert.ok(!("repairActions" in graphScoreboard.body));
    assert.ok(graphScoreboard.body.repairActionPreview.length > 0);
    assert.equal(graphScoreboard.body.commandLegend, undefined);
    assert.equal(graphScoreboard.body.nextActionAvailable, undefined);
    const fullGraphScoreboard = await json("/api/graph-scoreboard?detail=full");
    assert.equal(fullGraphScoreboard.response.status, 200);
    assert.equal(fullGraphScoreboard.body.detail, "full");
    assert.equal(fullGraphScoreboard.body.graphScoreboardPayloadPolicy.fullDetail, true);
    assert.equal(fullGraphScoreboard.body.summary.score, graphScoreboard.body.summary.score);
    assert.ok(fullGraphScoreboard.body.summary.renderedNodes > 0);
    assert.ok(fullGraphScoreboard.body.normalizedTypes.some((type) => type.type === "artifact"));
    assert.ok(fullGraphScoreboard.body.normalizationLedger.some((item) => item.type === "artifact" && item.canonicalIdRule));
    assert.ok(fullGraphScoreboard.body.normalizationLedger.every((item) => item.publicSafe && item.verificationCommand));
    assert.ok(fullGraphScoreboard.body.normalizedTypes.some((type) => type.type === "narrative-objection"));
    assert.ok(fullGraphScoreboard.body.quarantine.items.every((item) => typeof item.blocking === "boolean" && item.disposition && item.reason && item.action));
    assert.ok(fullGraphScoreboard.body.repairActions.length > 0);
    const liveGraphScoreboard = await json("/api/graph-scoreboard?refresh=1");
    assert.equal(liveGraphScoreboard.response.status, 200);
    assert.equal(liveGraphScoreboard.body.detail, "summary");
    assert.equal(liveGraphScoreboard.body.cachedFromReceipt, false);
    assert.equal(liveGraphScoreboard.body.cachePolicy, "live-refresh");
    const liveFullGraphScoreboard = await json("/api/graph-scoreboard?refresh=1&detail=full");
    assert.equal(liveFullGraphScoreboard.response.status, 200);
    assert.equal(liveFullGraphScoreboard.body.detail, "full");
    assert.equal(liveFullGraphScoreboard.body.cachedFromReceipt, false);
    const graphScoreboardPlanResponse = await json("/api/graph-scoreboard/plan");
    assert.equal(graphScoreboardPlanResponse.response.status, 200);
    assert.equal(graphScoreboardPlanResponse.body.command, "npm run audit:graph-scoreboard");
    assert.equal(graphScoreboardPlan().endpoint, "/api/graph-scoreboard");
    const graphScoreboardHistory = await json("/api/graph-scoreboard/history");
    assert.equal(graphScoreboardHistory.response.status, 200);
    assert.equal(graphScoreboardHistory.body.mode, "evidence-graph-scoreboard-history");
    assert.equal(graphScoreboardHistory.body.detail, "summary");
    assert.equal(graphScoreboardHistory.body.compact, true);
    assert.equal(graphScoreboardHistory.body.summary.limit, 5);
    assert.equal(graphScoreboardHistory.body.fullDetailEndpoint, "/api/graph-scoreboard/history?detail=full");
    assert.equal(graphScoreboardHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(graphScoreboardHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(graphScoreboardHistory.body.historyPayloadPolicy.historyRowsReturned, graphScoreboardHistory.body.receipts.length);
    assert.equal(graphScoreboardHistory.body.generatedAt, undefined);
    assert.equal(graphScoreboardHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(graphScoreboardHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(graphScoreboardHistory.body.receiptStore, undefined);
    assert.equal(graphScoreboardHistory.body.receiptStoreAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(graphScoreboardHistory.body)) < 2500);
    assert.equal(graphScoreboardHistory.body.definitions.fullReportAvailable, true);
    assert.equal(graphScoreboardHistory.body.definitions.fullHistoryAvailable, true);
    assert.ok(graphScoreboardHistory.body.definitions.dimensionSummary.quarantinePressureAvailable);
    assert.ok(graphScoreboardHistory.body.summary.totalAvailable >= graphScoreboardHistory.body.receipts.length);
    assert.equal(graphScoreboardHistory.body.summary.latestScore, undefined);
    assert.ok(Array.isArray(graphScoreboardHistory.body.receipts));
    assert.ok(graphScoreboardHistory.body.receipts.every((receipt) => !("report" in receipt)));
    assert.ok(graphScoreboardHistory.body.receipts.every((receipt) => !("mode" in receipt)));
    assert.equal(graphScoreboardHistory.body.definitions.dimensionIds, undefined);
    assert.equal(graphScoreboardHistory.body.receipts[0].summary, undefined);
    assert.ok(Number.isInteger(graphScoreboardHistory.body.receipts[0].score));
    assert.equal(graphScoreboardHistory.body.receipts[0].dimensionScores.length, graphScoreboardHistory.body.definitions.dimensionSummary.total);
    assert.ok(graphScoreboardHistory.body.receipts[0].dimensionScores.every((score) => Number.isInteger(score)));
    assert.ok(!("checks" in graphScoreboardHistory.body.receipts[0]));
    assert.ok(Number.isInteger(graphScoreboardHistory.body.receipts[0].checkSummary.passed));
    assert.ok(Number.isInteger(graphScoreboardHistory.body.receipts[0].checkSummary.failed));
    assert.ok(!("repairActionPreview" in graphScoreboardHistory.body.receipts[0]));
    assert.ok(Number.isInteger(graphScoreboardHistory.body.receipts[0].repairActionCount));
    assert.ok(graphScoreboardHistory.body.receipts.slice(1).every((receipt) => receipt.trendOnly === true && receipt.latestReceiptPreviewOnly === undefined));
    assert.ok(graphScoreboardHistory.body.receipts.slice(1).every((receipt) => !("dimensionScores" in receipt)));
    assert.equal(graphScoreboardHistory.body.nextActionAvailable, undefined);
    assert.equal(graphScoreboardHistory.body.verificationCommandAvailable, undefined);
    const fullGraphScoreboardHistory = await json("/api/graph-scoreboard/history?detail=full&limit=10");
    assert.equal(fullGraphScoreboardHistory.response.status, 200);
    assert.equal(fullGraphScoreboardHistory.body.detail, "full");
    assert.equal(fullGraphScoreboardHistory.body.compact, false);
    assert.equal(fullGraphScoreboardHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullGraphScoreboardHistory.body.receipts.length <= 10);
    assert.ok(fullGraphScoreboardHistory.body.receipts.some((receipt) => receipt.report));

    const graphLineage = await json("/api/graph-lineage");
    assert.equal(graphLineage.response.status, 200);
    assert.equal(graphLineage.body.mode, "evidence-graph-lineage-report");
    assert.equal(typeof graphLineage.body.cachedFromReceipt, "boolean");
    assert.equal(graphLineage.body.refreshEndpoint, "/api/graph-lineage?refresh=1");
    assert.equal(graphLineage.body.detail, "summary");
    assert.equal(graphLineage.body.compact, true);
    assert.equal(graphLineage.body.fullDetailEndpoint, "/api/graph-lineage?detail=full");
    assert.equal(graphLineage.body.lineagePayloadPolicy.fullDetail, false);
    assert.equal(graphLineage.body.sourceBoundaryAvailable, true);
    assert.equal(graphLineage.body.sideEffectBoundaryAvailable, true);
    assert.ok(graphLineage.body.summary.objections >= 15);
    assert.ok(graphLineage.body.summary.graphResolvedPaths >= graphLineage.body.summary.objections);
    assert.ok(graphLineage.body.summary.artifactGapRepairNodes > 0);
    assert.ok(graphLineage.body.summary.artifactGapRepairPaths > 0);
    assert.equal(
      graphLineage.body.summary.graphResolvedArtifactGapRepairPaths,
      graphLineage.body.summary.artifactGapRepairPaths,
    );
    assert.equal(graphLineage.body.summary.auditCoverageScore, 100);
    assert.equal(graphLineage.body.planEndpoint, "/api/graph-lineage/plan");
    assert.equal(graphLineage.body.checkSummary.failing, 0);
    assert.equal(graphLineage.body.checkSummary.artifactGapRepairLineagePassed, true);
    assert.ok(graphLineage.body.checks.every((check) => !check.passed));
    assert.equal(graphLineage.body.lineagePayloadPolicy.objectionPreviewLimit, 1);
    assert.equal(graphLineage.body.lineagePayloadPolicy.lineagePathsReturned, 3);
    assert.ok(graphLineage.body.audiences.every((audience) => audience.objections.length <= 1));
    assert.ok(graphLineage.body.audiences.every((audience) => audience.objections.every((objection) => objection.lineagePaths.length <= 3)));
    assert.ok(
      graphLineage.body.audiences.every((audience) =>
        audience.objections.every((objection) =>
          objection.lineagePaths.every((path) => !("relation" in path) && !("narrativeEdgeRendered" in path) && !("audience" in path)),
        ),
      ),
    );
    assert.ok(graphLineage.body.artifactGapRepairLineage.nodes.length <= 1);
    assert.ok(graphLineage.body.artifactGapRepairLineage.paths.length <= 1);
    assert.ok(graphLineage.body.artifactGapRepairLineage.paths.every((path) => path.graphResolved));
    assert.ok(Buffer.byteLength(JSON.stringify(graphLineage.body)) < 2500);
    const fullGraphLineage = await json("/api/graph-lineage?detail=full");
    assert.equal(fullGraphLineage.response.status, 200);
    assert.equal(fullGraphLineage.body.detail, "full");
    assert.equal(fullGraphLineage.body.compact, false);
    assert.equal(fullGraphLineage.body.lineagePayloadPolicy.fullDetail, true);
    const fullGraphLineagePaths = fullGraphLineage.body.audiences.reduce(
      (sum, audience) => sum + audience.objections.reduce((inner, objection) => inner + objection.lineagePaths.length, 0),
      0,
    );
    assert.equal(fullGraphLineagePaths, fullGraphLineage.body.summary.lineagePaths);
    assert.equal(fullGraphLineage.body.artifactGapRepairLineage.paths.length, fullGraphLineage.body.summary.artifactGapRepairPaths);
    assert.ok(fullGraphLineage.body.summary.lineagePaths >= graphLineage.body.lineagePayloadPolicy.lineagePathsReturned);
    const liveGraphLineage = await json("/api/graph-lineage?refresh=1");
    assert.equal(liveGraphLineage.response.status, 200);
    assert.equal(liveGraphLineage.body.cachedFromReceipt, false);
    assert.equal(liveGraphLineage.body.cachePolicy, "live-refresh");
    const graphLineagePlanResponse = await json("/api/graph-lineage/plan");
    assert.equal(graphLineagePlanResponse.response.status, 200);
    assert.equal(graphLineagePlanResponse.body.command, "npm run audit:graph-lineage");
    assert.equal(graphLineagePlan().endpoint, "/api/graph-lineage");
    const graphLineageHistory = await json("/api/graph-lineage/history");
    assert.equal(graphLineageHistory.response.status, 200);
    assert.equal(graphLineageHistory.body.mode, "evidence-graph-lineage-history");
    assert.equal(graphLineageHistory.body.detail, "summary");
    assert.equal(graphLineageHistory.body.compact, true);
    assert.equal(graphLineageHistory.body.summary.limit, 5);
    assert.equal(graphLineageHistory.body.fullDetailEndpoint, "/api/graph-lineage/history?detail=full");
    assert.equal(graphLineageHistory.body.sourceBoundary, undefined);
    assert.equal(graphLineageHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(graphLineageHistory.body.sideEffectBoundary, undefined);
    assert.equal(graphLineageHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(graphLineageHistory.body.receiptStore, undefined);
    assert.equal(graphLineageHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(graphLineageHistory.body.historyPayloadPolicy.historyRowsReturned, graphLineageHistory.body.receipts.length);
    assert.equal(graphLineageHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(graphLineageHistory.body.generatedAt, undefined);
    assert.equal(graphLineageHistory.body.nextAction, undefined);
    assert.equal(graphLineageHistory.body.nextActionAvailable, undefined);
    assert.equal(graphLineageHistory.body.verificationCommand, undefined);
    assert.equal(graphLineageHistory.body.verificationCommandAvailable, undefined);
    assert.ok(graphLineageHistory.body.summary.totalAvailable >= graphLineageHistory.body.receipts.length);
    assert.ok(Array.isArray(graphLineageHistory.body.receipts));
    assert.ok(graphLineageHistory.body.receipts.every((receipt) => !("report" in receipt)));
    assert.ok(graphLineageHistory.body.receipts.some((receipt) => receipt.cacheUsable));
    assert.ok(graphLineageHistory.body.receipts.every((receipt) => !("baseUrl" in receipt) && !("mode" in receipt)));
    assert.ok(graphLineageHistory.body.receipts[0].sampleObjections.length <= 2);
    assert.equal(graphLineageHistory.body.receipts[0].checks, undefined);
    assert.equal(graphLineageHistory.body.receipts[0].checkSummary.failing, 0);
    assert.ok(graphLineageHistory.body.receipts.slice(1).every((receipt) => !("sampleObjections" in receipt) && !("checks" in receipt)));
    assert.ok(graphLineageHistory.body.receipts.slice(1).every((receipt) => !("summary" in receipt) && !("checkedAt" in receipt)));
    assert.ok(graphLineageHistory.body.receipts.slice(1).every((receipt) => Number.isInteger(receipt.lineagePaths)));
    assert.ok(Buffer.byteLength(JSON.stringify(graphLineageHistory.body)) < 1500);
    const fullGraphLineageHistory = await json("/api/graph-lineage/history?detail=full&limit=10");
    assert.equal(fullGraphLineageHistory.response.status, 200);
    assert.equal(fullGraphLineageHistory.body.detail, "full");
    assert.equal(fullGraphLineageHistory.body.compact, false);
    assert.equal(fullGraphLineageHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.equal(typeof fullGraphLineageHistory.body.sourceBoundary, "string");
    assert.equal(fullGraphLineageHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(typeof fullGraphLineageHistory.body.verificationCommand, "string");
    assert.equal(fullGraphLineageHistory.body.verificationCommandAvailable, undefined);
    assert.ok(fullGraphLineageHistory.body.receipts.some((receipt) => receipt.report));

    const graphProjectionGuard = await json("/api/graph-projection-guard");
    assert.equal(graphProjectionGuard.response.status, 200);
    assert.equal(graphProjectionGuard.body.mode, "evidence-graph-projection-guard");
    assert.equal(typeof graphProjectionGuard.body.cachedFromReceipt, "boolean");
    assert.equal(graphProjectionGuard.body.detail, "summary");
    assert.equal(graphProjectionGuard.body.compact, true);
    assert.equal(graphProjectionGuard.body.generatedAt, undefined);
    assert.equal(graphProjectionGuard.body.checkedAt, undefined);
    assert.equal(graphProjectionGuard.body.cachePolicy, undefined);
    assert.equal(graphProjectionGuard.body.refreshEndpoint, "/api/graph-projection-guard?refresh=1");
    assert.equal(graphProjectionGuard.body.fullDetailEndpoint, "/api/graph-projection-guard?detail=full");
    assert.ok(graphProjectionGuard.body.summary.relationships >= 30);
    assert.equal(graphProjectionGuard.body.summary.renderedRelationships, graphProjectionGuard.body.summary.relationships);
    assert.equal(graphProjectionGuard.body.summary.unresolvedRelationships, 0);
    assert.ok(graphProjectionGuard.body.summary.draftOnlyQuarantines > 0);
    assert.equal(graphProjectionGuard.body.summary.inspectionOnlyQuarantines, 0);
    assert.equal(graphProjectionGuard.body.summary.quarantinedRelationships, graphProjectionGuard.body.summary.draftOnlyQuarantines);
    assert.equal(graphProjectionGuard.body.summary.sourceMissing, 0);
    assert.equal(graphProjectionGuard.body.summary.routeCovered, true);
    assert.equal(graphProjectionGuard.body.summary.refreshCovered, true);
    assert.equal(graphProjectionGuard.body.summary.scriptCovered, true);
    assert.equal(graphProjectionGuard.body.projectionGuardPayloadPolicy.fullDetail, false);
    assert.equal(graphProjectionGuard.body.projectionGuardPayloadPolicy.fullDetailAvailable, true);
    assert.equal(graphProjectionGuard.body.projectionGuardPayloadPolicy.relationshipPreviewLimit, undefined);
    assert.equal(graphProjectionGuard.body.projectionGuardPayloadPolicy.quarantinePreviewLimit, undefined);
    assert.equal(graphProjectionGuard.body.sourceBoundaryAvailable, undefined);
    assert.equal(graphProjectionGuard.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(graphProjectionGuard.body.plan, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(graphProjectionGuard.body)) < 1600);
    assert.ok(graphProjectionGuard.body.relationships.length < graphProjectionGuard.body.summary.relationships);
    assert.ok(graphProjectionGuard.body.quarantinedRelationships.length < graphProjectionGuard.body.summary.quarantinedRelationships);
    assert.ok(graphProjectionGuard.body.quarantineLedger.highestRiskCount > 0);
    assert.ok(graphProjectionGuard.body.quarantinedRelationships.every((item) => item.graphDepthDisposition && item.manualReviewRequired));
    assert.ok(graphProjectionGuard.body.relationships.some((relationship) => relationship.relation === "tailored-narrative-uses-claim"));
    assert.ok(graphProjectionGuard.body.relationships.some((relationship) => relationship.relation === "tailored-narrative-cites-artifact"));
    assert.ok(graphProjectionGuard.body.relationships.every((relationship) => relationship.id === undefined));
    assert.ok(graphProjectionGuard.body.quarantinedRelationships.every((relationship) => relationship.id === undefined));
    assert.equal(graphProjectionGuard.body.checkSummary.total, graphProjectionGuard.body.summary.checks);
    assert.equal(graphProjectionGuard.body.checkSummary.failing, graphProjectionGuard.body.summary.failing);
    assert.equal(graphProjectionGuard.body.checks, undefined);
    assert.equal(graphProjectionGuard.body.nextActionAvailable, undefined);
    assert.equal(graphProjectionGuard.body.verificationCommandAvailable, undefined);

    const graphProjectionGuardFull = await json("/api/graph-projection-guard?detail=full");
    assert.equal(graphProjectionGuardFull.response.status, 200);
    assert.equal(graphProjectionGuardFull.body.detail, "full");
    assert.equal(graphProjectionGuardFull.body.compact, false);
    assert.equal(graphProjectionGuardFull.body.projectionGuardPayloadPolicy.fullDetail, true);
    assert.equal(graphProjectionGuardFull.body.relationships.length, graphProjectionGuardFull.body.summary.relationships);
    assert.equal(graphProjectionGuardFull.body.quarantinedRelationships.length, graphProjectionGuardFull.body.summary.quarantinedRelationships);
    assert.ok(graphProjectionGuardFull.body.checks.every((check) => check.verificationCommand));

    const graphProjectionGuardPlan = await json("/api/graph-projection-guard/plan");
    assert.equal(graphProjectionGuardPlan.response.status, 200);
    assert.equal(graphProjectionGuardPlan.body.mode, "evidence-graph-projection-guard-plan");
    assert.equal(graphProjectionGuardPlan.body.command, "npm run audit:graph-guard");
    assert.equal(graphProjectionGuardPlan.body.endpoint, "/api/graph-projection-guard");

    const graphProjectionGuardHistory = await json("/api/graph-projection-guard/history");
    assert.equal(graphProjectionGuardHistory.response.status, 200);
    assert.equal(graphProjectionGuardHistory.body.mode, "evidence-graph-projection-guard-history");
    assert.equal(graphProjectionGuardHistory.body.detail, "summary");
    assert.equal(graphProjectionGuardHistory.body.compact, true);
    assert.equal(graphProjectionGuardHistory.body.generatedAt, undefined);
    assert.ok(Array.isArray(graphProjectionGuardHistory.body.receipts));
    assert.equal(graphProjectionGuardHistory.body.summary.limit, 3);
    assert.equal(graphProjectionGuardHistory.body.summary.latestScore, undefined);
    assert.equal(graphProjectionGuardHistory.body.fullDetailEndpoint, "/api/graph-projection-guard/history?detail=full");
    assert.equal(graphProjectionGuardHistory.body.sourceBoundary, undefined);
    assert.equal(graphProjectionGuardHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(graphProjectionGuardHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(graphProjectionGuardHistory.body.receiptStore, undefined);
    assert.equal(graphProjectionGuardHistory.body.receiptStoreAvailable, undefined);
    assert.equal(graphProjectionGuardHistory.body.historyPayloadPolicy.fullDetailAvailable, undefined);
    assert.equal(graphProjectionGuardHistory.body.definitions.checkDefinitions.renderedOrQuarantinedAvailable, true);
    assert.equal(graphProjectionGuardHistory.body.definitions.checkDefinitions.verificationCommandsAvailable, true);
    assert.equal(graphProjectionGuardHistory.body.definitions.evidenceAccess, undefined);
    assert.equal(graphProjectionGuardHistory.body.definitions.omittedFromHistoryCount, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(graphProjectionGuardHistory.body)) < 1500);
    if (graphProjectionGuardHistory.body.receipts.length > 0) {
      assert.ok(Array.isArray(graphProjectionGuardHistory.body.receipts[0].relationshipPreview));
      assert.ok(graphProjectionGuardHistory.body.receipts[0].relationshipPreview.length <= 1);
      assert.equal(graphProjectionGuardHistory.body.receipts[0].relationshipPreview[0]?.id, undefined);
      assert.equal(graphProjectionGuardHistory.body.receipts[0].relationships, undefined);
      assert.equal(graphProjectionGuardHistory.body.receipts[0].checkPreview, undefined);
      assert.ok(Number.isInteger(graphProjectionGuardHistory.body.receipts[0].checkSummary.total));
      assert.ok(Number.isInteger(graphProjectionGuardHistory.body.receipts[0].checkSummary.failed));
      assert.equal(graphProjectionGuardHistory.body.receipts[0].repairActionIds, undefined);
      assert.ok(graphProjectionGuardHistory.body.receipts.every((receipt) => receipt.checkedAt === undefined));
      assert.ok(graphProjectionGuardHistory.body.receipts.slice(1).every((receipt) => !("relationshipPreview" in receipt) && !("checkSummary" in receipt)));
    }
    const fullGraphProjectionGuardHistory = await json("/api/graph-projection-guard/history?detail=full&limit=1");
    assert.equal(fullGraphProjectionGuardHistory.response.status, 200);
    assert.equal(fullGraphProjectionGuardHistory.body.detail, "full");
    assert.equal(fullGraphProjectionGuardHistory.body.compact, false);
    assert.equal(fullGraphProjectionGuardHistory.body.summary.limit, 1);
    if (fullGraphProjectionGuardHistory.body.receipts.length > 0) {
      assert.ok(Array.isArray(fullGraphProjectionGuardHistory.body.receipts[0].relationships));
      assert.ok(fullGraphProjectionGuardHistory.body.definitions.checks.some((check) => check.id === "rendered-or-quarantined" && check.verificationCommand));
    }
    const minimumGraphProjectionGuardHistory = await json("/api/graph-projection-guard/history?limit=0");
    assert.equal(minimumGraphProjectionGuardHistory.response.status, 200);
    assert.equal(minimumGraphProjectionGuardHistory.body.summary.limit, 1);
    assert.ok(minimumGraphProjectionGuardHistory.body.receipts.length <= 1);

    const graphConfidence = await json("/api/graph-confidence");
    assert.equal(graphConfidence.response.status, 200);
    assert.equal(graphConfidence.body.mode, "evidence-graph-confidence-guard");
    assert.equal(typeof graphConfidence.body.cachedFromReceipt, "boolean");
    assert.equal(graphConfidence.body.detail, "summary");
    assert.equal(graphConfidence.body.compact, true);
    assert.equal(graphConfidence.body.refreshEndpoint, "/api/graph-confidence?refresh=1");
    assert.equal(graphConfidence.body.fullDetailEndpoint, "/api/graph-confidence?detail=full");
    assert.equal(graphConfidence.body.sourceBoundaryAvailable, true);
    assert.ok(graphConfidence.body.summary.relationships >= 100);
    assert.equal(graphConfidence.body.summary.families, 3);
    assert.equal(graphConfidence.body.summary.routeCovered, true);
    assert.equal(graphConfidence.body.summary.refreshCovered, true);
    assert.equal(graphConfidence.body.relationshipPayloadPolicy.fullDetail, false);
    assert.equal(graphConfidence.body.relationshipPayloadPolicy.previewLimit, 3);
    assert.ok(Buffer.byteLength(JSON.stringify(graphConfidence.body)) < 1700);
    assert.equal("generatedAt" in graphConfidence.body, false);
    assert.equal("cachePolicy" in graphConfidence.body, false);
    assert.equal("plan" in graphConfidence.body, false);
    assert.equal("confidencePolicy" in graphConfidence.body, false);
    assert.ok(graphConfidence.body.relationships.length <= 3);
    assert.ok(graphConfidence.body.relationships.length < graphConfidence.body.summary.relationships);
    assert.ok(graphConfidence.body.relationships.every((relationship) => !relationship.id));
    assert.ok(graphConfidence.body.relationTypes.length <= 3);
    assert.ok(graphConfidence.body.checks.length <= 3);
    assert.ok(graphConfidence.body.checks.some((check) => check.id === "high-confidence-explicitness"));
    assert.ok(graphConfidence.body.checks.some((check) => check.id === "disclosure-confidence-cap"));
    assert.ok(graphConfidence.body.relationships.some((relationship) => relationship.family === "crosslink"));
    assert.ok(graphConfidence.body.relationships.some((relationship) => relationship.family === "disclosure"));
    assert.ok(graphConfidence.body.relationships.some((relationship) => relationship.family === "projection"));
    assert.ok(graphConfidence.body.relationships.every((relationship) => relationship.publicSafe && relationship.verificationCommandAvailable && !relationship.verificationCommand));
    assert.ok(graphConfidence.body.checks.every((check) => !check.verificationCommand && !check.repairAction && !check.detail));

    const graphConfidenceFull = await json("/api/graph-confidence?detail=full");
    assert.equal(graphConfidenceFull.response.status, 200);
    assert.equal(graphConfidenceFull.body.detail, "full");
    assert.equal(graphConfidenceFull.body.compact, false);
    assert.equal(graphConfidenceFull.body.relationshipPayloadPolicy.fullDetail, true);
    assert.equal(graphConfidenceFull.body.relationships.length, graphConfidenceFull.body.summary.relationships);
    assert.ok(graphConfidenceFull.body.relationships.every((relationship) => relationship.verificationCommand));

    const graphDepth = await json("/api/graph-depth-score");
    assert.equal(graphDepth.response.status, 200);
    assert.equal(graphDepth.body.mode, "evidence-graph-depth-score");
    assert.equal(typeof graphDepth.body.cachedFromReceipt, "boolean");
    assert.equal(graphDepth.body.refreshEndpoint, "/api/graph-depth-score?refresh=1");
    assert.equal(graphDepth.body.detail, "summary");
    assert.equal(graphDepth.body.compact, true);
    assert.equal(graphDepth.body.fullDetailEndpoint, "/api/graph-depth-score?detail=full");
    assert.equal(graphDepth.body.graphDepthPayloadPolicy.fullDetail, false);
    assert.ok(Buffer.byteLength(JSON.stringify(graphDepth.body)) < 2500);
    assert.equal(graphDepth.body.graphDepthPayloadPolicy.lanesReturned, graphDepth.body.lanes.length);
    assert.equal(graphDepth.body.graphDepthPayloadPolicy.depthSummariesReturned, graphDepth.body.depthSummaries.length);
    assert.equal(graphDepth.body.graphDepthPayloadPolicy.checksReturned, graphDepth.body.checks.length);
    assert.ok(graphDepth.body.graphDepthPayloadPolicy.totalLanes >= graphDepth.body.lanes.length);
    assert.ok(graphDepth.body.graphDepthPayloadPolicy.totalChecks >= graphDepth.body.checks.length);
    assert.ok(graphDepth.body.summary.score >= 85);
    assert.ok(graphDepth.body.summary.lanes >= 6);
    assert.ok(graphDepth.body.summary.lineagePaths >= 100);
    assert.ok(graphDepth.body.summary.disclosureRelationships >= 100);
    assert.ok(graphDepth.body.summary.confidenceRelationships >= 500);
    assert.ok(graphDepth.body.summary.artifactGapRepairPaths > 0);
    assert.equal(
      graphDepth.body.summary.graphResolvedArtifactGapRepairPaths,
      graphDepth.body.summary.artifactGapRepairPaths,
    );
    assert.ok(Number.isInteger(graphDepth.body.summary.manualNarrativeReadinessScore));
    assert.ok(Number.isInteger(graphDepth.body.summary.manualNarrativeLocalReviewScore));
    assert.ok(graphDepth.body.summary.manualNarrativeLocalReviewReady >= 1);
    assert.ok(
      graphDepth.body.summary.manualNarrativeReady +
        graphDepth.body.summary.manualNarrativeRestricted +
        graphDepth.body.summary.manualNarrativeBlocked >=
        3,
    );
    assert.ok(graphDepth.body.summary.manualNarrativeRepairItems >= 3);
    assert.ok(graphDepth.body.lanes.some((lane) => lane.id === "normalization-horizon"));
    assert.ok(graphDepth.body.lanes.some((lane) => lane.id === "manual-narrative-gate-depth"));
    assert.ok(graphDepth.body.lanes.some((lane) => lane.id === "artifact-gap-repair-depth"));
    assert.equal(graphDepth.body.lanes.length, 3);
    assert.ok(graphDepth.body.lanes.every((lane) => !("score" in lane)));
    assert.ok(graphDepth.body.depthSummaries.some((summary) => summary.id === "narrative-gate-to-repair"));
    assert.ok(graphDepth.body.depthSummaries.some((summary) => summary.id === "artifact-gap-to-opportunity-repair"));
    assert.equal(graphDepth.body.depthSummaries.length, 2);
    assert.ok(graphDepth.body.checks.some((check) => check.id === "manual-narrative-gates"));
    assert.ok(graphDepth.body.checks.some((check) => check.id === "artifact-gap-repair-graph-depth"));
    assert.ok(graphDepth.body.checks.some((check) => check.id === "depth-summary-cards"));
    assert.ok(graphDepth.body.checks.some((check) => check.id === "normalization-repair-visible"));
    assert.ok(graphDepth.body.lanes.every((lane) => !lane.evidence && !lane.verificationCommand));
    assert.equal(graphDepth.body.depthMap, undefined);
    assert.ok(graphDepth.body.depthSummaries.every((summary) => !summary.summary && !summary.verificationCommand));
    assert.ok(graphDepth.body.checks.every((check) => !check.detail && !check.verificationCommand));
    assert.ok(graphDepth.body.nonClaimCount >= 4);
    assert.equal(graphDepth.body.nonClaimsAvailable, true);

    const fullGraphDepth = await json("/api/graph-depth-score?detail=full");
    assert.equal(fullGraphDepth.response.status, 200);
    assert.equal(fullGraphDepth.body.detail, "full");
    assert.equal(fullGraphDepth.body.compact, false);
    assert.equal(fullGraphDepth.body.graphDepthPayloadPolicy.fullDetail, true);
    assert.ok(fullGraphDepth.body.lanes.every((lane) => lane.evidence && lane.repairAction && lane.verificationCommand));
    assert.ok(fullGraphDepth.body.depthSummaries.every((summary) => summary.summary && summary.repairAction && summary.verificationCommand));
    assert.ok(fullGraphDepth.body.checks.every((check) => check.detail && check.repairAction && check.verificationCommand));

    const evaluation = await json("/api/evaluation/proof-quality");
    assert.equal(evaluation.response.status, 200);
    assert.equal(evaluation.body.mode, "research-grade-proof-quality-evaluation");
    assert.equal(evaluation.body.detail, "summary");
    assert.equal(evaluation.body.compact, true);
    assert.equal(typeof evaluation.body.cachedFromReceipt, "boolean");
    assert.equal(evaluation.body.refreshEndpoint, "/api/evaluation/proof-quality?refresh=1");
    assert.equal(evaluation.body.fullDetailEndpoint, "/api/evaluation/proof-quality?detail=full");
    assert.equal(evaluation.body.proofQualityPayloadPolicy.fullDetail, false);
    assert.equal(evaluation.body.proofQualityPayloadPolicy.fullDetailAvailable, true);
    assert.equal(evaluation.body.proofQualityPayloadPolicy.dimensionsReturned, evaluation.body.dimensions.length);
    assert.equal(evaluation.body.proofQualityPayloadPolicy.projectBenchmarksReturned, evaluation.body.projectBenchmarkPreview.length);
    assert.equal(evaluation.body.proofQualityPayloadPolicy.checksReturned, evaluation.body.checks.length);
    assert.equal(evaluation.body.sourceBoundaryAvailable, undefined);
    assert.ok(!evaluation.body.sourceBoundary);
    assert.ok(Buffer.byteLength(JSON.stringify(evaluation.body)) < 2500);
    assert.ok(evaluation.body.summary.score >= 50);
    assert.equal(evaluation.body.summary.auditCoverageScore, 100);
    assert.ok(evaluation.body.dimensions.length <= 4);
    assert.ok(evaluation.body.checks.every((check) => check.passed));
    assert.ok(evaluation.body.checks.length <= 4);
    assert.ok(evaluation.body.checks.every((check) => !("detail" in check) && !("verificationCommand" in check)));
    assert.equal(evaluation.body.plan.command, "npm run audit:proof-quality");
    assert.ok(evaluation.body.dimensions.some((dimension) => dimension.id === "claim-traceability"));
    assert.ok(evaluation.body.dimensions.every((dimension) => !("detail" in dimension) && !("evidence" in dimension) && !("label" in dimension)));
    assert.equal(evaluation.body.projectBenchmarks, undefined);
    assert.ok(evaluation.body.projectBenchmarkPreview.length <= 3);
    assert.ok(evaluation.body.projectBenchmarkPreview.length < projects.body.projects.length);
    assert.ok(evaluation.body.projectBenchmarkPreview.every((benchmark) => !("title" in benchmark) && !("nextAction" in benchmark)));
    const fullEvaluation = await json("/api/evaluation/proof-quality?detail=full");
    assert.equal(fullEvaluation.response.status, 200);
    assert.equal(fullEvaluation.body.detail, "full");
    assert.equal(fullEvaluation.body.compact, false);
    assert.equal(fullEvaluation.body.proofQualityPayloadPolicy.fullDetail, true);
    assert.equal(fullEvaluation.body.projectBenchmarks.length, projects.body.projects.length);
    assert.ok(fullEvaluation.body.dimensions.some((dimension) => dimension.detail && dimension.evidence.length));
    assert.ok(fullEvaluation.body.checks.every((check) => check.detail && check.verificationCommand));
    const liveEvaluation = await json("/api/evaluation/proof-quality?refresh=1");
    assert.equal(liveEvaluation.response.status, 200);
    assert.equal(liveEvaluation.body.cachedFromReceipt, false);
    assert.equal(liveEvaluation.body.cachePolicy, "live-refresh");
    assert.equal(liveEvaluation.body.detail, "summary");
    const caseInsensitiveEvaluationRefresh = await json("/api/evaluation/proof-quality?refresh=TRUE");
    assert.equal(caseInsensitiveEvaluationRefresh.response.status, 200);
    assert.equal(caseInsensitiveEvaluationRefresh.body.cachedFromReceipt, false);
    assert.equal(caseInsensitiveEvaluationRefresh.body.compact, true);
    const evaluationPlan = await json("/api/evaluation/proof-quality/plan");
    assert.equal(evaluationPlan.response.status, 200);
    assert.equal(evaluationPlan.body.command, "npm run audit:proof-quality");
    assert.equal(proofQualityPlan().endpoint, "/api/evaluation/proof-quality");
    const evaluationHistory = await json("/api/evaluation/proof-quality/history");
    assert.equal(evaluationHistory.response.status, 200);
    assert.equal(evaluationHistory.body.mode, "research-grade-proof-quality-history");
    assert.equal(evaluationHistory.body.detail, "summary");
    assert.equal(evaluationHistory.body.compact, true);
    assert.equal(evaluationHistory.body.summary.limit, 5);
    assert.equal(evaluationHistory.body.fullDetailEndpoint, "/api/evaluation/proof-quality/history?detail=full");
    assert.equal(evaluationHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(evaluationHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(evaluationHistory.body.historyPayloadPolicy.historyRowsReturned, evaluationHistory.body.receipts.length);
    assert.equal(evaluationHistory.body.sourceBoundary, undefined);
    assert.equal(evaluationHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(evaluationHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(evaluationHistory.body.receiptStore, undefined);
    assert.equal(evaluationHistory.body.receiptStoreAvailable, undefined);
    assert.equal(evaluationHistory.body.generatedAt, undefined);
    assert.ok(evaluationHistory.body.summary.totalAvailable >= evaluationHistory.body.receipts.length);
    assert.equal(evaluationHistory.body.summary.latestScore, undefined);
    assert.ok(evaluationHistory.body.receipts.length <= 5);
    assert.equal(evaluationHistory.body.definitions.fullReportAvailable, true);
    assert.equal(evaluationHistory.body.definitions.fullHistoryAvailable, true);
    assert.equal(evaluationHistory.body.definitions.planCommand, "npm run audit:proof-quality");
    assert.equal(evaluationHistory.body.definitions.plan, undefined);
    assert.equal(evaluationHistory.body.definitions.dimensionSummary.claimTraceability, true);
    assert.ok(evaluationHistory.body.definitions.dimensionSummary.weights > 0);
    assert.ok(evaluationHistory.body.definitions.dimensionSummary.recommendations > 0);
    assert.equal(evaluationHistory.body.definitions.dimensions, undefined);
    assert.ok(evaluationHistory.body.definitions.projectBenchmarkSummary.total >= projects.body.projects.length);
    assert.ok(evaluationHistory.body.definitions.projectBenchmarkSummary.nextActions >= projects.body.projects.length);
    assert.equal(evaluationHistory.body.definitions.publicRouteManifestCheckAvailable, undefined);
    assert.equal(evaluationHistory.body.definitions.checkSummary.publicRouteManifest, true);
    assert.ok(evaluationHistory.body.definitions.checkSummary.commands > 0);
    assert.equal(evaluationHistory.body.definitions.checks, undefined);
    assert.ok(evaluationHistory.body.definitions.recommendationCount > 0);
    assert.ok(evaluationHistory.body.definitions.limitationCount > 0);
    assert.ok(Array.isArray(evaluationHistory.body.receipts));
    const latestProofQualityReceipt = evaluationHistory.body.receipts[0];
    assert.ok(latestProofQualityReceipt);
    assert.ok(!latestProofQualityReceipt.report);
    assert.ok(!("baseUrl" in latestProofQualityReceipt));
    assert.ok(!("mode" in latestProofQualityReceipt));
    assert.equal(latestProofQualityReceipt.checkedAt, undefined);
    assert.equal(latestProofQualityReceipt.summary, undefined);
    assert.ok(Number.isInteger(latestProofQualityReceipt.score));
    assert.equal(typeof latestProofQualityReceipt.band, "string");
    assert.equal(latestProofQualityReceipt.dimensions, undefined);
    assert.equal(latestProofQualityReceipt.checks, undefined);
    assert.ok(Number.isInteger(latestProofQualityReceipt.dimensionSummary.total));
    assert.ok(Number.isInteger(latestProofQualityReceipt.projectBenchmarkSummary.total));
    assert.ok(Number.isInteger(latestProofQualityReceipt.repairActionCount));
    assert.equal(latestProofQualityReceipt.dimensionPreviewAvailable, undefined);
    assert.equal(latestProofQualityReceipt.projectBenchmarkPreviewAvailable, undefined);
    assert.ok(!("checks" in latestProofQualityReceipt));
    assert.ok(Number.isInteger(latestProofQualityReceipt.checkSummary.passed));
    assert.ok(Number.isInteger(latestProofQualityReceipt.checkSummary.failed));
    assert.ok(latestProofQualityReceipt.recommendationCount > 0);
    assert.ok(latestProofQualityReceipt.limitationCount > 0);
    assert.ok(evaluationHistory.body.receipts.slice(1).every((receipt) => !("dimensionPreviewAvailable" in receipt)));
    assert.ok(evaluationHistory.body.receipts.slice(1).every((receipt) => receipt.trendOnly === true && receipt.checkedAt === undefined));
    assert.ok(evaluationHistory.body.receipts.slice(1).every((receipt) => receipt.dimensions === undefined && receipt.projectBenchmarkPreview === undefined));
    assert.ok(evaluationHistory.body.receipts.slice(1).every((receipt) => Number.isInteger(receipt.trendSummary.auditCoverageScore)));
    assert.equal(evaluationHistory.body.nextAction, undefined);
    assert.equal(evaluationHistory.body.verificationCommand, undefined);
    assert.equal(evaluationHistory.body.nextActionAvailable, undefined);
    assert.equal(evaluationHistory.body.verificationCommandAvailable, undefined);

    const fullEvaluationHistory = await json("/api/evaluation/proof-quality/history?detail=full&limit=10");
    assert.equal(fullEvaluationHistory.response.status, 200);
    assert.equal(fullEvaluationHistory.body.detail, "full");
    assert.equal(fullEvaluationHistory.body.compact, false);
    assert.equal(fullEvaluationHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullEvaluationHistory.body.receipts.length <= 10);
    const fullProofQualityReceipt = fullEvaluationHistory.body.receipts[0];
    assert.ok(fullProofQualityReceipt.baseUrl);
    assert.ok(fullProofQualityReceipt.mode);
    assert.ok(fullProofQualityReceipt.report);
    assert.ok(fullProofQualityReceipt.report.dimensions.some((dimension) => dimension.detail && dimension.evidence.length));
    assert.ok(fullProofQualityReceipt.report.checks.some((check) => check.detail && check.verificationCommand));

    const searchQuality = await json("/api/evaluation/search-quality");
    assert.equal(searchQuality.response.status, 200);
    assert.equal(searchQuality.body.mode, "proof-backed-search-quality-evaluation");
    assert.equal(typeof searchQuality.body.cachedFromReceipt, "boolean");
    assert.equal(searchQuality.body.generatedAt, undefined);
    assert.equal(searchQuality.body.checkedAt, undefined);
    assert.equal(searchQuality.body.refreshEndpoint, undefined);
    assert.equal(searchQuality.body.detail, "summary");
    assert.equal(searchQuality.body.compact, true);
    assert.equal(searchQuality.body.fullDetailEndpoint, "/api/evaluation/search-quality?detail=full");
    assert.equal(searchQuality.body.searchQualityPayloadPolicy.fullDetail, false);
    assert.equal(searchQuality.body.searchQualityPayloadPolicy.defaultResultLimit, undefined);
    assert.equal(searchQuality.body.searchQualityPayloadPolicy.fullDetailAvailable, true);
    assert.equal(searchQuality.body.sourceBoundaryAvailable, undefined);
    assert.equal(searchQuality.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(searchQuality.body.boundaryAvailable, true);
    assert.ok(searchQuality.body.summary.cases >= 6);
    assert.equal(searchQuality.body.summary.auditCoverageScore, 100);
    assert.ok(searchQuality.body.checks.every((check) => check.passed));
    assert.equal(searchQuality.body.plan.command, "npm run audit:search-quality");
    assert.ok(searchQuality.body.cases.every((item) => item.results.length > 0 && item.results.length <= 1));
    assert.ok(searchQuality.body.cases.every((item) => Number.isInteger(item.dimensionSummary.passing) && Array.isArray(item.dimensionSummary.failing) && !("total" in item.dimensionSummary)));
    assert.ok(searchQuality.body.cases.every((item) => !("expectedSlugs" in item) && !("expectedSignals" in item) && !("dimensions" in item)));
    assert.ok(searchQuality.body.cases.every((item) => item.results[0].nextInspection === undefined));
    assert.ok(searchQuality.body.cases.every((item) => !item.results[0].sourceTrace));
    assert.ok(Buffer.byteLength(JSON.stringify(searchQuality.body)) < 2100);
    const fullSearchQuality = await json("/api/evaluation/search-quality?detail=full");
    assert.equal(fullSearchQuality.response.status, 200);
    assert.equal(fullSearchQuality.body.detail, "full");
    assert.equal(fullSearchQuality.body.compact, false);
    assert.equal(fullSearchQuality.body.searchQualityPayloadPolicy.fullDetail, true);
    assert.ok(fullSearchQuality.body.cases.every((item) => item.results[0].sourceTrace.length > 0));
    assert.ok(JSON.stringify(fullSearchQuality.body).length > JSON.stringify(searchQuality.body).length);
    const liveSearchQuality = await json("/api/evaluation/search-quality?refresh=1");
    assert.equal(liveSearchQuality.response.status, 200);
    assert.equal(liveSearchQuality.body.cachedFromReceipt, false);
    assert.equal(liveSearchQuality.body.refreshEndpoint, undefined);
    const searchQualityPlanResponse = await json("/api/evaluation/search-quality/plan");
    assert.equal(searchQualityPlanResponse.response.status, 200);
    assert.equal(searchQualityPlanResponse.body.command, "npm run audit:search-quality");
    assert.equal(searchQualityPlan().endpoint, "/api/evaluation/search-quality");
    const searchQualityHistory = await json("/api/evaluation/search-quality/history");
    assert.equal(searchQualityHistory.response.status, 200);
    assert.equal(searchQualityHistory.body.mode, "proof-backed-search-quality-history");
    assert.equal(searchQualityHistory.body.detail, "summary");
    assert.equal(searchQualityHistory.body.compact, true);
    assert.equal(searchQualityHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(searchQualityHistory.body.reportEndpoint, "/api/evaluation/search-quality");
    assert.equal(searchQualityHistory.body.generatedAt, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(searchQualityHistory.body)) < 2000);
    assert.ok(Array.isArray(searchQualityHistory.body.receipts));
    assert.ok(searchQualityHistory.body.receipts[0].casePreview.length <= 3);
    assert.ok(searchQualityHistory.body.receipts.slice(1).every((receipt) => receipt.latestReceiptPreviewOnly === true && !receipt.casePreview && !receipt.checkedAt));
    const fullSearchQualityHistory = await json("/api/evaluation/search-quality/history?detail=full&limit=1");
    assert.equal(fullSearchQualityHistory.response.status, 200);
    assert.equal(fullSearchQualityHistory.body.detail, "full");
    assert.equal(fullSearchQualityHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullSearchQualityHistory.body.receipts[0].report);

    const claimCalibration = await json("/api/evaluation/claim-calibration");
    assert.equal(claimCalibration.response.status, 200);
    assert.equal(claimCalibration.body.mode, "claim-calibration-benchmark");
    assert.equal(typeof claimCalibration.body.cachedFromReceipt, "boolean");
    assert.equal(claimCalibration.body.refreshEndpoint, "/api/evaluation/claim-calibration?refresh=1");
    assert.equal(claimCalibration.body.detail, "summary");
    assert.equal(claimCalibration.body.compact, true);
    assert.equal(claimCalibration.body.fullDetailEndpoint, "/api/evaluation/claim-calibration?detail=full");
    assert.equal(claimCalibration.body.claimCalibrationPayloadPolicy.fullDetail, false);
    assert.equal(claimCalibration.body.claimCalibrationPayloadPolicy.matrixPreviewLimit, undefined);
    assert.equal(claimCalibration.body.claimCalibrationPayloadPolicy.repairPreviewLimit, undefined);
    assert.equal(claimCalibration.body.claimCalibrationPayloadPolicy.fullDetailAvailable, true);
    assert.equal(claimCalibration.body.claimCalibrationPayloadPolicy.fullDetailEndpoint, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(claimCalibration.body)) < 1600);
    assert.equal(claimCalibration.body.generatedAt, undefined);
    assert.equal(claimCalibration.body.checkedAt, undefined);
    assert.equal(claimCalibration.body.planEndpoint, undefined);
    assert.equal(claimCalibration.body.calibrationPolicySummary.blocksNeedsSourcePromotion, true);
    assert.equal(claimCalibration.body.summary.claims, evaluation.body.summary.claims);
    assert.ok(claimCalibration.body.checks.some((check) => check.id === "needs-source-not-promoted"));
    assert.ok(claimCalibration.body.checks.every((check) => !("detail" in check) && !("repairAction" in check)));
    assert.ok(claimCalibration.body.calibrationMatrix.some((item) => item.calibrationBand === "repair-required"));
    assert.ok(claimCalibration.body.calibrationMatrix.length < claimCalibration.body.summary.claims);
    assert.ok(claimCalibration.body.calibrationMatrix.every((item) => item.guidanceAvailable && !("repairAction" in item) && !("verificationCommand" in item)));
    assert.ok(claimCalibration.body.calibrationMatrix.every((item) => !("absoluteWording" in item) && Number.isInteger(item.absoluteWordingCount)));
    assert.ok(claimCalibration.body.calibrationMatrix.every((item) => !("evidenceStrength" in item) && !("sourceCount" in item)));
    assert.ok(claimCalibration.body.repairQueue.every((item) => item.verificationCommandAvailable));
    assert.ok(claimCalibration.body.repairQueue.every((item) => !("repairAction" in item)));
    assert.ok(claimCalibration.body.repairQueue.every((item) => !("verificationCommand" in item)));
    assert.equal(typeof claimCalibration.body.nonClaimCount, "number");
    assert.ok(!("calibrationPolicy" in claimCalibration.body));
    assert.ok(!("nonClaims" in claimCalibration.body));
    assert.ok(!("sideEffectBoundary" in claimCalibration.body));
    assert.ok(!("nextAction" in claimCalibration.body));
    assert.equal(claimCalibration.body.nextActionAvailable, undefined);
    assert.equal(claimCalibration.body.sourceBoundaryAvailable, undefined);
    assert.equal(claimCalibration.body.verificationCommandAvailable, undefined);

    const fullClaimCalibration = await json("/api/evaluation/claim-calibration?detail=full");
    assert.equal(fullClaimCalibration.response.status, 200);
    assert.equal(fullClaimCalibration.body.detail, "full");
    assert.equal(fullClaimCalibration.body.compact, false);
    assert.equal(fullClaimCalibration.body.claimCalibrationPayloadPolicy.fullDetail, true);
    assert.equal(fullClaimCalibration.body.calibrationMatrix.length, fullClaimCalibration.body.summary.claims);
    assert.ok(fullClaimCalibration.body.calibrationMatrix.every((item) => item.verificationCommand));

    const liveClaimCalibration = await json("/api/evaluation/claim-calibration?refresh=1&detail=full");
    assert.equal(liveClaimCalibration.response.status, 200);
    assert.equal(liveClaimCalibration.body.mode, "claim-calibration-benchmark");
    assert.equal(liveClaimCalibration.body.detail, "full");
    assert.equal(liveClaimCalibration.body.cachedFromReceipt, false);
    assert.equal(liveClaimCalibration.body.cachePolicy, "live-refresh");

    const claimCalibrationPlan = await json("/api/evaluation/claim-calibration/plan");
    assert.equal(claimCalibrationPlan.response.status, 200);
    assert.equal(claimCalibrationPlan.body.command, "npm run audit:claim-calibration");

    const claimCalibrationHistory = await json("/api/evaluation/claim-calibration/history");
    assert.equal(claimCalibrationHistory.response.status, 200);
    assert.equal(claimCalibrationHistory.body.mode, "claim-calibration-benchmark-history");
    assert.equal(claimCalibrationHistory.body.detail, "summary");
    assert.equal(claimCalibrationHistory.body.compact, true);
    assert.equal(claimCalibrationHistory.body.generatedAt, undefined);
    assert.equal(claimCalibrationHistory.body.receiptStore, undefined);
    assert.equal(claimCalibrationHistory.body.summary.limit, 5);
    assert.equal(claimCalibrationHistory.body.fullDetailEndpoint, "/api/evaluation/claim-calibration/history?detail=full");
    assert.equal(claimCalibrationHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(claimCalibrationHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(claimCalibrationHistory.body.historyPayloadPolicy.historyRowLimit, 5);
    assert.equal(claimCalibrationHistory.body.historyPayloadPolicy.olderReceiptPreview, undefined);
    assert.equal(claimCalibrationHistory.body.historyPayloadPolicy.windowReceipts, undefined);
    assert.equal(claimCalibrationHistory.body.receipts.length, claimCalibrationHistory.body.historyPayloadPolicy.historyRowsReturned);
    assert.ok(Buffer.byteLength(JSON.stringify(claimCalibrationHistory.body)) < 1900);
    assert.equal(claimCalibrationHistory.body.definitions.fullReportEndpoint, "/api/evaluation/claim-calibration?detail=full");
    assert.equal(claimCalibrationHistory.body.definitions.fullDetailEndpoint, undefined);
    assert.ok(claimCalibrationHistory.body.summary.totalAvailable >= claimCalibrationHistory.body.receipts.length);
    assert.equal(claimCalibrationHistory.body.summary.latestClaims, undefined);
    assert.equal(claimCalibrationHistory.body.summary.latestScore, undefined);
    assert.ok(Array.isArray(claimCalibrationHistory.body.receipts));
    assert.ok(claimCalibrationHistory.body.receipts.length <= claimCalibrationHistory.body.historyPayloadPolicy.historyRowLimit);
    assert.ok(claimCalibrationHistory.body.receipts.every((receipt) => !("report" in receipt)));
    assert.ok(claimCalibrationHistory.body.receipts.some((receipt) => receipt.cacheUsable));
    assert.ok(claimCalibrationHistory.body.receipts.every((receipt) => !("mode" in receipt)));
    assert.ok(claimCalibrationHistory.body.receipts.every((receipt) => !("checks" in receipt)));
    assert.ok(Number.isInteger(claimCalibrationHistory.body.receipts[0].checkSummary.passed));
    assert.ok(Number.isInteger(claimCalibrationHistory.body.receipts[0].repairQueueSummary.total));
    assert.ok(Number.isInteger(claimCalibrationHistory.body.receipts[0].matrixSummary.total));
    assert.equal(claimCalibrationHistory.body.historyPayloadPolicy.latestRepairQueuePreviewLimit, undefined);
    assert.equal(claimCalibrationHistory.body.historyPayloadPolicy.latestMatrixPreviewLimit, undefined);
    assert.ok(claimCalibrationHistory.body.receipts[0].repairQueuePreview.length <= 2);
    assert.ok(claimCalibrationHistory.body.receipts[0].matrixPreview.length <= 2);
    assert.ok(claimCalibrationHistory.body.receipts[0].matrixPreview.every((item) => item.calibrationBand && !item.verificationCommand));
    assert.ok(claimCalibrationHistory.body.receipts.slice(1).every((receipt) => receipt.matrixPreview === undefined));
    assert.ok(claimCalibrationHistory.body.receipts.slice(1).every((receipt) => receipt.checkSummary === undefined && receipt.repairQueueSummary === undefined && receipt.matrixSummary === undefined));
    assert.ok(claimCalibrationHistory.body.receipts.slice(1).every((receipt) => receipt.summary && Number.isInteger(receipt.summary.claims)));
    assert.ok(Number.isInteger(claimCalibrationHistory.body.receipts[0].nonClaimCount));
    assert.ok(claimCalibrationHistory.body.receipts.slice(1).every((receipt) => receipt.nonClaimCount === undefined));
    const fullClaimCalibrationHistory = await json("/api/evaluation/claim-calibration/history?detail=full&limit=1");
    assert.equal(fullClaimCalibrationHistory.response.status, 200);
    assert.equal(fullClaimCalibrationHistory.body.detail, "full");
    assert.equal(fullClaimCalibrationHistory.body.compact, false);
    assert.equal(fullClaimCalibrationHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.equal(fullClaimCalibrationHistory.body.receipts.length, 1);
    assert.ok(fullClaimCalibrationHistory.body.receipts[0].report);
    assert.ok(fullClaimCalibrationHistory.body.receipts[0].report.calibrationMatrix.length > 0);
    const minimumClaimCalibrationHistory = await json("/api/evaluation/claim-calibration/history?limit=0");
    assert.equal(minimumClaimCalibrationHistory.response.status, 200);
    assert.equal(minimumClaimCalibrationHistory.body.summary.limit, 1);
    assert.ok(minimumClaimCalibrationHistory.body.receipts.length <= 1);

    const opportunityQuality = await json("/api/evaluation/opportunity-quality");
    assert.equal(opportunityQuality.response.status, 200);
    assert.equal(opportunityQuality.body.mode, "opportunity-engine-quality-evaluation");
    assert.equal(typeof opportunityQuality.body.cachedFromReceipt, "boolean");
    assert.equal(opportunityQuality.body.detail, "summary");
    assert.equal(opportunityQuality.body.compact, true);
    assert.equal(opportunityQuality.body.generatedAt, undefined);
    assert.equal(opportunityQuality.body.checkedAt, undefined);
    assert.equal(opportunityQuality.body.cachePolicy, undefined);
    assert.equal(opportunityQuality.body.refreshEndpoint, "/api/evaluation/opportunity-quality?refresh=1");
    assert.equal(opportunityQuality.body.fullDetailEndpoint, "/api/evaluation/opportunity-quality?detail=full");
    assert.equal(opportunityQuality.body.opportunityQualityPayloadPolicy.fullDetail, false);
    assert.equal(opportunityQuality.body.opportunityQualityPayloadPolicy.fullDetailAvailable, true);
    assert.equal(opportunityQuality.body.opportunityQualityPayloadPolicy.previewLimits, undefined);
    assert.equal(opportunityQuality.body.plan, undefined);
    assert.equal(opportunityQuality.body.methodology, undefined);
    assert.ok(opportunityQuality.body.summary.packages >= 5);
    assert.equal(opportunityQuality.body.dimensionSummary.manualSafetyAvailable, true);
    assert.equal(opportunityQuality.body.dimensionSummary.repairPlanActionabilityAvailable, true);
    assert.ok(opportunityQuality.body.dimensions.length <= 2);
    assert.ok(opportunityQuality.body.summary.repairPlanItems >= opportunityQuality.body.summary.packages * 3);
    assert.equal(opportunityQuality.body.summary.manualOnlyPackages, opportunityQuality.body.summary.packages);
    assert.equal(opportunityQuality.body.packageSummary.total, opportunityQuality.body.summary.packages);
    assert.ok(opportunityQuality.body.packageBenchmarks.length <= 2);
    assert.ok(opportunityQuality.body.packageBenchmarks.every((benchmark) => benchmark.verificationCommandAvailable && !benchmark.verificationCommand));
    assert.ok(opportunityQuality.body.packageBenchmarks.every((benchmark) => benchmark.repairPlanItems >= 3 && benchmark.manualOnly));
    assert.equal(opportunityQuality.body.summary.routeCovered, true);
    assert.equal(opportunityQuality.body.summary.refreshCovered, true);
    assert.equal(opportunityQuality.body.checkSummary.passed, opportunityQuality.body.summary.passing);
    assert.ok(opportunityQuality.body.checks.length <= 3);
    assert.ok(opportunityQuality.body.checks.every((check) => check.passed));
    assert.ok(opportunityQuality.body.checks.every((check) => !("detail" in check) && !("repairAction" in check)));
    assert.ok(opportunityQuality.body.checks.some((check) => check.id === "opportunity-source-coverage"));
    assert.ok(opportunityQuality.body.checks.some((check) => check.id === "proof-repair-plan"));
    assert.equal(opportunityQuality.body.nextActionAvailable, undefined);
    assert.equal(opportunityQuality.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(opportunityQuality.body)) < 1600);
    const fullOpportunityQuality = await json("/api/evaluation/opportunity-quality?detail=full");
    assert.equal(fullOpportunityQuality.response.status, 200);
    assert.equal(fullOpportunityQuality.body.detail, "full");
    assert.equal(fullOpportunityQuality.body.compact, false);
    assert.equal(fullOpportunityQuality.body.opportunityQualityPayloadPolicy.fullDetail, true);
    assert.ok(fullOpportunityQuality.body.packageBenchmarks.every((benchmark) => benchmark.verificationCommand));
    assert.ok(fullOpportunityQuality.body.checks.every((check) => check.detail && check.repairAction));
    const liveOpportunityQuality = await json("/api/evaluation/opportunity-quality?refresh=1");
    assert.equal(liveOpportunityQuality.response.status, 200);
    assert.equal(liveOpportunityQuality.body.cachedFromReceipt, false);
    assert.equal(liveOpportunityQuality.body.cachePolicy, "live-refresh");
    assert.equal(liveOpportunityQuality.body.refreshEndpoint, "/api/evaluation/opportunity-quality?refresh=1");

    const opportunityQualityPlanRoute = await json("/api/evaluation/opportunity-quality/plan");
    assert.equal(opportunityQualityPlanRoute.response.status, 200);
    assert.equal(opportunityQualityPlanRoute.body.command, "npm run audit:opportunity-quality");
    assert.equal(opportunityQualityPlanRoute.body.endpoint, "/api/evaluation/opportunity-quality");

    const opportunityQualityHistory = await json("/api/evaluation/opportunity-quality/history");
    assert.equal(opportunityQualityHistory.response.status, 200);
    assert.equal(opportunityQualityHistory.body.mode, "opportunity-engine-quality-history");
    assert.equal(opportunityQualityHistory.body.detail, "summary");
    assert.equal(opportunityQualityHistory.body.compact, true);
    assert.ok(Array.isArray(opportunityQualityHistory.body.receipts));
    assert.equal(opportunityQualityHistory.body.summary.limit, 5);
    assert.equal(opportunityQualityHistory.body.fullDetailEndpoint, "/api/evaluation/opportunity-quality/history?detail=full");
    assert.equal(opportunityQualityHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(opportunityQualityHistory.body.generatedAt, undefined);
    assert.equal(opportunityQualityHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(opportunityQualityHistory.body.nextActionAvailable, undefined);
    assert.equal(opportunityQualityHistory.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(opportunityQualityHistory.body)) < 1700);
    assert.ok(opportunityQualityHistory.body.summary.totalAvailable >= opportunityQualityHistory.body.receipts.length);
    assert.ok(opportunityQualityHistory.body.receipts.length <= 5);
    assert.ok(opportunityQualityHistory.body.definitions.dimensionIds.includes("manual-safety"));
    assert.ok(opportunityQualityHistory.body.definitions.manualSafetyWeight);
    assert.ok(opportunityQualityHistory.body.definitions.checkIds.includes("proof-repair-plan"));
    assert.equal(opportunityQualityHistory.body.definitions.evidenceAccess, undefined);
    const latestOpportunityQualityReceipt = opportunityQualityHistory.body.receipts[0];
    assert.ok(latestOpportunityQualityReceipt);
    assert.ok(!latestOpportunityQualityReceipt.report);
    assert.ok(!("mode" in latestOpportunityQualityReceipt));
    assert.ok(!("baseUrl" in latestOpportunityQualityReceipt));
    assert.ok(latestOpportunityQualityReceipt.dimensions.some((dimension) => dimension.id === "manual-safety"));
    assert.ok(latestOpportunityQualityReceipt.packageBenchmarks.every((benchmark) => !("verificationCommand" in benchmark)));
    assert.ok(latestOpportunityQualityReceipt.packageBenchmarks.length <= 3);
    assert.ok(!("checks" in latestOpportunityQualityReceipt));
    assert.ok(Number.isInteger(latestOpportunityQualityReceipt.passedChecks));
    assert.ok(Number.isInteger(latestOpportunityQualityReceipt.packageSummary.total));
    assert.ok(opportunityQualityHistory.body.receipts.slice(1).every((receipt) => receipt.trendOnly === true && receipt.dimensions === undefined));
    assert.ok(opportunityQualityHistory.body.receipts.slice(1).every((receipt) => Number.isInteger(receipt.totalMissingProof)));
    assert.equal(opportunityQualityHistory.body.nextAction, undefined);
    assert.equal(opportunityQualityHistory.body.verificationCommand, undefined);
    assert.equal(opportunityQualityHistory.body.verificationCommandAvailable, undefined);
    const fullOpportunityQualityHistory = await json("/api/evaluation/opportunity-quality/history?detail=full&limit=1");
    assert.equal(fullOpportunityQualityHistory.response.status, 200);
    assert.equal(fullOpportunityQualityHistory.body.detail, "full");
    assert.equal(fullOpportunityQualityHistory.body.compact, false);
    assert.equal(fullOpportunityQualityHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.equal(fullOpportunityQualityHistory.body.receipts.length, 1);
    assert.ok(fullOpportunityQualityHistory.body.receipts[0].report);
    assert.ok(fullOpportunityQualityHistory.body.receipts[0].report.packageBenchmarks.length > 0);
    const opportunityQualityMinimumHistory = await json("/api/evaluation/opportunity-quality/history?limit=0");
    assert.equal(opportunityQualityMinimumHistory.response.status, 200);
    assert.equal(opportunityQualityMinimumHistory.body.summary.limit, 1);
    assert.ok(opportunityQualityMinimumHistory.body.receipts.length <= 1);

    const usabilityQuality = await json("/api/evaluation/usability");
    assert.equal(usabilityQuality.response.status, 200);
    assert.equal(usabilityQuality.body.mode, "command-center-usability-quality-evaluation");
    assert.equal(usabilityQuality.body.detail, "summary");
    assert.equal(usabilityQuality.body.compact, true);
    assert.equal(usabilityQuality.body.fullDetailEndpoint, "/api/evaluation/usability?detail=full");
    assert.equal(usabilityQuality.body.usabilityQualityPayloadPolicy.fullDetail, false);
    assert.equal(usabilityQuality.body.usabilityQualityPayloadPolicy.fullDetailAvailable, true);
    assert.equal(typeof usabilityQuality.body.cachedFromReceipt, "boolean");
    assert.equal(usabilityQuality.body.refreshEndpoint, "/api/evaluation/usability?refresh=1");
    assert.ok(usabilityQuality.body.summary.score >= 60);
    assert.ok(Buffer.byteLength(JSON.stringify(usabilityQuality.body)) < 2500);
    assert.equal(usabilityQuality.body.generatedAt, undefined);
    assert.equal(usabilityQuality.body.checkedAt, undefined);
    assert.equal(usabilityQuality.body.sourceBoundaryAvailable, undefined);
    assert.equal(usabilityQuality.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(usabilityQuality.body.plan, undefined);
    assert.equal(usabilityQuality.body.methodology, undefined);
    assert.equal(usabilityQuality.body.latestReceipt, undefined);
    assert.equal(usabilityQuality.body.verificationCommandAvailable, undefined);
    assert.equal(usabilityQuality.body.usabilityQualityPayloadPolicy.previewLimits, undefined);
    assert.ok(usabilityQuality.body.dimensions.length <= usabilityQuality.body.usabilityQualityPayloadPolicy.dimensionsReturned);
    assert.ok(usabilityQuality.body.controlBenchmarks.length <= usabilityQuality.body.usabilityQualityPayloadPolicy.controlBenchmarksReturned);
    assert.ok(usabilityQuality.body.dimensions.some((dimension) => dimension.id === "keyboard-workflow"));
    assert.ok(usabilityQuality.body.controlBenchmarks.some((benchmark) => benchmark.id === "runtime-surface-shortcut"));
    assert.ok(usabilityQuality.body.controlBenchmarks.every((benchmark) => !("verificationCommandAvailable" in benchmark) && !("verificationCommand" in benchmark)));
    assert.ok(usabilityQuality.body.dimensions.every((dimension) => !("detailAvailable" in dimension) && !dimension.detail && !("band" in dimension)));

    const fullUsabilityQuality = await json("/api/evaluation/usability?detail=full");
    assert.equal(fullUsabilityQuality.response.status, 200);
    assert.equal(fullUsabilityQuality.body.detail, "full");
    assert.equal(fullUsabilityQuality.body.compact, false);
    assert.equal(fullUsabilityQuality.body.usabilityQualityPayloadPolicy.fullDetail, true);
    assert.ok(fullUsabilityQuality.body.controlBenchmarks.every((benchmark) => benchmark.verificationCommand));

    const usabilityQualityRefresh = await json("/api/evaluation/usability?refresh=1");
    assert.equal(usabilityQualityRefresh.response.status, 200);
    assert.equal(usabilityQualityRefresh.body.cachedFromReceipt, false);
    assert.equal(usabilityQualityRefresh.body.cachePolicy, "live-refresh");

    const usabilityQualityPlan = await json("/api/evaluation/usability/plan");
    assert.equal(usabilityQualityPlan.response.status, 200);
    assert.equal(usabilityQualityPlan.body.command, "npm run audit:usability-quality");

    const usabilityQualityHistory = await json("/api/evaluation/usability/history");
    assert.equal(usabilityQualityHistory.response.status, 200);
    assert.equal(usabilityQualityHistory.body.mode, "command-center-usability-quality-history");
    assert.equal(usabilityQualityHistory.body.detail, "summary");
    assert.equal(usabilityQualityHistory.body.compact, true);
    assert.equal(usabilityQualityHistory.body.generatedAt, undefined);
    assert.equal(usabilityQualityHistory.body.summary.limit, 5);
    assert.equal(usabilityQualityHistory.body.fullDetailEndpoint, "/api/evaluation/usability/history?detail=full");
    assert.equal(usabilityQualityHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(usabilityQualityHistory.body.historyPayloadPolicy.latestReceiptPreview, undefined);
    assert.equal(usabilityQualityHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(usabilityQualityHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(usabilityQualityHistory.body.boundaryAvailable, undefined);
    assert.equal(usabilityQualityHistory.body.definitions, undefined);
    assert.equal(usabilityQualityHistory.body.historyPayloadPolicy.fullDetailAvailable, undefined);
    assert.equal(usabilityQualityHistory.body.historyPayloadPolicy.historyRowsReturned, usabilityQualityHistory.body.receipts.length);
    assert.ok(usabilityQualityHistory.body.summary.totalAvailable >= usabilityQualityHistory.body.receipts.length);
    assert.equal(usabilityQualityHistory.body.summary.latestScore, undefined);
    assert.equal(usabilityQualityHistory.body.summary.latestCheckedAt, undefined);
    assert.ok(Array.isArray(usabilityQualityHistory.body.receipts));
    assert.ok(usabilityQualityHistory.body.receipts.length <= 1);
    assert.ok(usabilityQualityHistory.body.receipts.every((receipt) => !("dimensions" in receipt)));
    assert.ok(usabilityQualityHistory.body.receipts.every((receipt) => !("baseUrl" in receipt)));
    assert.ok(usabilityQualityHistory.body.receipts.every((receipt) => !("checkedAt" in receipt)));
    assert.ok(usabilityQualityHistory.body.receipts[0].dimensionCount >= usabilityQualityHistory.body.receipts[0].dimensionScores.length);
    assert.ok(usabilityQualityHistory.body.receipts[0].controlCount >= usabilityQualityHistory.body.receipts[0].controls.length);
    assert.ok(usabilityQualityHistory.body.receipts[0].dimensionScores.some((dimension) => dimension.id === "keyboard-workflow"));
    assert.ok(usabilityQualityHistory.body.receipts[0].dimensionScores.length <= 2);
    assert.ok(usabilityQualityHistory.body.receipts[0].dimensionScores.every((dimension) => !("band" in dimension)));
    assert.ok(usabilityQualityHistory.body.receipts[0].controls.some((control) => control.id === "runtime-surface-shortcut"));
    assert.ok(usabilityQualityHistory.body.receipts[0].controls.length <= 2);
    assert.ok(usabilityQualityHistory.body.receipts[0].controls.every((control) => !("verificationCommand" in control)));
    assert.equal(usabilityQualityHistory.body.receipts[0].summary.dimensions, undefined);
    assert.ok(usabilityQualityHistory.body.receipts[0].summary.score >= 0);
    assert.equal(usabilityQualityHistory.body.nextActionAvailable, undefined);
    assert.equal(usabilityQualityHistory.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(usabilityQualityHistory.body)) < 1000);

    const fullUsabilityQualityHistory = await json("/api/evaluation/usability/history?detail=full&limit=10");
    assert.equal(fullUsabilityQualityHistory.response.status, 200);
    assert.equal(fullUsabilityQualityHistory.body.detail, "full");
    assert.equal(fullUsabilityQualityHistory.body.compact, false);
    assert.equal(fullUsabilityQualityHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullUsabilityQualityHistory.body.receipts.length <= 10);
    assert.ok(fullUsabilityQualityHistory.body.receipts[0].baseUrl);
    assert.ok(fullUsabilityQualityHistory.body.receipts[0].dimensions.some((dimension) => dimension.detail && dimension.evidence.length));
    assert.ok(fullUsabilityQualityHistory.body.receipts[0].controlBenchmarks.some((control) => control.verificationCommand));

    const researchStress = await json("/api/evaluation/research-stress");
    assert.equal(researchStress.response.status, 200);
    assert.equal(researchStress.body.mode, "research-grade-evaluation-stress-suite");
    assert.equal(researchStress.body.detail, "summary");
    assert.equal(researchStress.body.compact, true);
    assert.equal(typeof researchStress.body.cachedFromReceipt, "boolean");
    assert.equal(researchStress.body.fullDetailEndpoint, "/api/evaluation/research-stress?detail=full");
    assert.equal(researchStress.body.researchStressPayloadPolicy.fullDetail, false);
    assert.equal(researchStress.body.generatedAt, undefined);
    assert.equal(researchStress.body.checkedAt, undefined);
    assert.equal(researchStress.body.refreshEndpoint, undefined);
    assert.equal(researchStress.body.sourceBoundary, undefined);
    assert.equal(researchStress.body.sideEffectBoundary, undefined);
    assert.equal(researchStress.body.boundariesAvailable, true);
    assert.equal(researchStress.body.planAvailable, true);
    assert.equal(researchStress.body.plan, undefined);
    assert.equal(researchStress.body.methodologyAvailable, true);
    assert.equal(researchStress.body.methodologySummary, undefined);
    assert.equal(researchStress.body.researchStressPayloadPolicy.fullDetailAvailable, true);
    assert.equal(researchStress.body.researchStressPayloadPolicy.scenarioRowsReturned, researchStress.body.scenarioPreview.length);
    assert.ok(researchStress.body.summary.scenarios >= 8);
    assert.ok(researchStress.body.summary.score >= 60);
    assert.ok(researchStress.body.summary.proofActionMinimum >= 4);
    assert.equal(researchStress.body.summary.proofActionScenarioPassing, true);
    assert.equal(researchStress.body.scenarios, undefined);
    assert.ok(researchStress.body.scenarioPreview.length <= 4);
    assert.ok(researchStress.body.scenarioPreview.some((scenario) => scenario.id === "runtime-drift-pressure"));
    assert.ok(researchStress.body.scenarioPreview.some((scenario) => scenario.id === "manual-opportunity-gate-pressure"));
    assert.ok(researchStress.body.scenarioPreview.some((scenario) => scenario.id === "first-screen-proof-action-pressure"));
    assert.ok(researchStress.body.scenarioPreview.every((scenario) => !("verificationCommand" in scenario) && !("evidence" in scenario)));
    assert.ok(researchStress.body.scenarioPreview.every((scenario) => !("score" in scenario) && !("detail" in scenario) && !("repairAction" in scenario)));
    assert.equal(researchStress.body.scenarioSummary, undefined);
    assert.ok(researchStress.body.stressMatrixSummary.rows >= 2);
    assert.equal(researchStress.body.stressMatrix, undefined);
    assert.equal(researchStress.body.repairQueue, undefined);
    assert.ok(Number.isInteger(researchStress.body.repairQueueCount));
    assert.equal(researchStress.body.nextAction, undefined);
    assert.equal(researchStress.body.nextActionAvailable, true);
    assert.equal(researchStress.body.verificationCommand, undefined);
    assert.equal(researchStress.body.verificationCommandAvailable, true);
    assert.ok(Buffer.byteLength(JSON.stringify(researchStress.body)) < 1500);
    const fullResearchStress = await json("/api/evaluation/research-stress?detail=full");
    assert.equal(fullResearchStress.response.status, 200);
    assert.equal(fullResearchStress.body.detail, "full");
    assert.equal(fullResearchStress.body.compact, false);
    assert.equal(fullResearchStress.body.researchStressPayloadPolicy.fullDetail, true);
    assert.ok(fullResearchStress.body.scenarios.some((scenario) => scenario.id === "runtime-drift-pressure" && scenario.verificationCommand));
    assert.ok(fullResearchStress.body.scenarios.some((scenario) => scenario.id === "manual-opportunity-gate-pressure" && scenario.evidence.length));
    const liveResearchStress = await json("/api/evaluation/research-stress?refresh=1");
    assert.equal(liveResearchStress.response.status, 200);
    assert.equal(liveResearchStress.body.cachedFromReceipt, false);
    assert.equal(liveResearchStress.body.detail, "summary");
    assert.ok(fullResearchStress.body.scenarios.every((scenario) => scenario.expectedFailureMode));
    assert.ok(fullResearchStress.body.scenarios.every((scenario) => scenario.verificationCommand));

    const artifacts = await json("/api/artifacts");
    assert.equal(artifacts.response.status, 200);
    assert.equal(artifacts.body.mode, "public-artifact-catalog");
    assert.equal(artifacts.body.detail, "summary");
    assert.equal(artifacts.body.compact, true);
    assert.equal(artifacts.body.generatedAt, undefined);
    assert.equal(artifacts.body.evidenceAccess.fullDetailEndpoint, "/api/artifacts?detail=full");
    assert.equal(artifacts.body.artifactPayloadPolicy.fullDetail, false);
    assert.equal(artifacts.body.artifactPayloadPolicy.fullDetailAvailable, true);
    assert.equal(artifacts.body.artifactPayloadPolicy.previewLimits, undefined);
    assert.equal(artifacts.body.evidenceAccess.uiDetailEndpoint, "/api/artifacts?detail=ui");
    assert.equal(artifacts.body.artifacts.length, 4);
    assert.ok(artifacts.body.artifacts.length < artifacts.body.counts.artifacts);
    assert.equal(artifacts.body.projectSummary.total, projects.body.projects.length);
    assert.ok(artifacts.body.projects.length <= 6);
    assert.ok(artifacts.body.projects.every((project) => !("artifactPreview" in project)));
    assert.ok(artifacts.body.projects.every((project) => project.artifactTypeCount >= 4 && !("artifactTypesPreview" in project)));
    assert.ok(artifacts.body.artifacts.some((artifact) => artifact.artifactType === "terminal-replay"));
    assert.ok(artifacts.body.artifacts.some((artifact) => artifact.artifactType === "terminal-transcript"));
    assert.ok(artifacts.body.artifactTypes.some((artifactType) => artifactType.id === "museum-capture"));
    assert.ok(artifacts.body.artifactTypes.some((artifactType) => artifactType.id === "curator-annotation"));
    assert.equal(artifacts.body.counts.museumCaptures, projects.body.projects.length);
    assert.equal(artifacts.body.counts.curatorAnnotations, projects.body.projects.length);
    assert.ok(artifacts.body.counts.terminalTranscripts >= projects.body.projects.length);
    assert.ok(artifacts.body.artifacts.some((artifact) => artifact.artifactType === "api-replay"));
    assert.ok(artifacts.body.counts.curatorAnnotations > 0);
    assert.ok(artifacts.body.gaps.some((gap) => gap.gapType === "screenshot"));
    assert.ok(artifacts.body.artifacts.every((artifact) => artifact.sourceTraceCount > 0));
    assert.ok(artifacts.body.artifacts.every((artifact) => !("sourceTrace" in artifact)));
    assert.equal(artifacts.body.sourceTraceSummary.projectRecordAvailable, true);
    assert.equal(artifacts.body.artifactDefaults.sourceTraceMode, "count-only");
    assert.equal(artifacts.body.artifactDefaults.gapPreviewLimit, 1);
    assert.ok(artifacts.body.artifacts.every((artifact) => !("sourceTypes" in artifact)));
    assert.ok(artifacts.body.gaps.every((gap) => !("suggestedRepair" in gap)));
    assert.ok(artifacts.body.gaps.length <= 1);
    assert.ok(Buffer.byteLength(JSON.stringify(artifacts.body)) < 2500);

    const uiArtifacts = await json("/api/artifacts?detail=ui");
    assert.equal(uiArtifacts.response.status, 200);
    assert.equal(uiArtifacts.body.detail, "ui");
    assert.equal(uiArtifacts.body.compact, true);
    assert.equal(uiArtifacts.body.artifactPayloadPolicy.previewProfile, "ui");
    assert.equal(uiArtifacts.body.artifactPayloadPolicy.topLevelPreviewLimit, 9);
    assert.equal(uiArtifacts.body.artifactPayloadPolicy.projectTypePreviewLimit, 5);
    assert.equal(uiArtifacts.body.artifactPayloadPolicy.gapPreviewLimit, 6);
    assert.ok(uiArtifacts.body.artifacts.length >= artifacts.body.artifacts.length);
    assert.ok(uiArtifacts.body.projects.every((project) => project.artifactPreview.every((artifact) => artifact.project === project.id && artifact.hasUrl)));

    const fullArtifacts = await json("/api/artifacts?detail=full");
    assert.equal(fullArtifacts.response.status, 200);
    assert.equal(fullArtifacts.body.detail, "full");
    assert.equal(fullArtifacts.body.compact, false);
    assert.ok(fullArtifacts.body.artifacts.every((artifact) => Array.isArray(artifact.sourceTrace) && artifact.sourceTrace.length > 0));
    assert.ok(fullArtifacts.body.artifacts.some((artifact) => artifact.annotation?.displayGuidance));

    const artifactGaps = await json("/api/artifact-gaps");
    assert.equal(artifactGaps.response.status, 200);
    assert.equal(artifactGaps.body.mode, "artifact-gap-workbench");
    assert.equal(typeof artifactGaps.body.cachedFromReceipt, "boolean");
    assert.equal(artifactGaps.body.detail, "summary");
    assert.equal(artifactGaps.body.compact, true);
    assert.equal(artifactGaps.body.refreshEndpoint, "/api/artifact-gaps?refresh=1");
    assert.equal(artifactGaps.body.fullDetailEndpoint, "/api/artifact-gaps?detail=full");
    assert.equal(artifactGaps.body.gapPayloadPolicy.fullDetail, false);
    assert.ok(artifactGaps.body.gapPayloadPolicy.gapsReturned <= 6);
    assert.ok(artifactGaps.body.gapPayloadPolicy.repairQueueReturned <= 4);
    assert.equal(artifactGaps.body.summary.gaps, artifacts.body.counts.screenshotGaps);
    assert.ok(artifactGaps.body.summary.narrativeBlockingGaps >= 1);
    assert.equal(artifactGaps.body.summary.auditCoverageScore, 100);
    assert.ok(artifactGaps.body.gaps.length <= 6);
    assert.ok(artifactGaps.body.gaps.length < artifactGaps.body.summary.gaps);
    assert.ok(artifactGaps.body.gaps.every((gap) => gap.acceptanceCriteriaCount >= 3 && gap.forbiddenClaimCount >= 3));
    assert.ok(artifactGaps.body.gaps.every((gap) => !("acceptanceCriteria" in gap) && !("forbiddenClaims" in gap)));
    assert.ok(artifactGaps.body.gaps.every((gap) => !("label" in gap) && !("neededArtifact" in gap)));
    assert.ok(artifactGaps.body.gaps.some((gap) => gap.priority === "high" && gap.narrativeBlockingAudienceCount > 0));
    assert.equal(artifactGaps.body.checkSummary.failing, 0);
    assert.equal(artifactGaps.body.checks, undefined);
    assert.equal(artifactGaps.body.repairActions, undefined);
    const fullArtifactGaps = await json("/api/artifact-gaps?detail=full");
    assert.equal(fullArtifactGaps.response.status, 200);
    assert.equal(fullArtifactGaps.body.detail, "full");
    assert.equal(fullArtifactGaps.body.compact, false);
    assert.equal(fullArtifactGaps.body.gapPayloadPolicy.fullDetail, true);
    assert.ok(fullArtifactGaps.body.gaps.every((gap) => gap.acceptanceCriteria.length >= 3 && gap.forbiddenClaims.length >= 3));
    const artifactGapsPlan = await json("/api/artifact-gaps/plan");
    assert.equal(artifactGapsPlan.response.status, 200);
    assert.equal(artifactGapsPlan.body.command, "npm run audit:artifact-gaps");
    const artifactGapsHistory = await json("/api/artifact-gaps/history");
    assert.equal(artifactGapsHistory.response.status, 200);
    assert.equal(artifactGapsHistory.body.mode, "artifact-gap-workbench-history");
    assert.equal(artifactGapsHistory.body.detail, "summary");
    assert.equal(artifactGapsHistory.body.compact, true);
    assert.ok(Buffer.byteLength(JSON.stringify(artifactGapsHistory.body)) < 1500);
    assert.equal(artifactGapsHistory.body.generatedAt, undefined);
    assert.equal(artifactGapsHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(artifactGapsHistory.body.summary.limit, 5);
    assert.equal(artifactGapsHistory.body.fullDetailEndpoint, "/api/artifact-gaps/history?detail=full");
    assert.equal(artifactGapsHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.ok(artifactGapsHistory.body.summary.totalAvailable >= artifactGapsHistory.body.receipts.length);
    assert.equal(artifactGapsHistory.body.summary.latestGaps, undefined);
    assert.ok(artifactGapsHistory.body.definitions.checks.verificationCommandCount >= 1);
    assert.ok(artifactGapsHistory.body.definitions.checks.sentinelIds.includes("gap-inventory"));
    assert.ok(Array.isArray(artifactGapsHistory.body.receipts));
    const latestArtifactGapReceipt = artifactGapsHistory.body.receipts[0];
    assert.ok(latestArtifactGapReceipt);
    assert.ok(!("baseUrl" in latestArtifactGapReceipt));
    assert.ok(!("mode" in latestArtifactGapReceipt));
    assert.ok(!("gaps" in latestArtifactGapReceipt));
    assert.ok(latestArtifactGapReceipt.topGaps.length > 0);
    assert.ok(latestArtifactGapReceipt.topGaps.every((gap) => !("acceptanceCriteria" in gap) && !("forbiddenClaims" in gap)));
    assert.ok(Number.isInteger(latestArtifactGapReceipt.checkSummary.passed));
    assert.ok(Number.isInteger(latestArtifactGapReceipt.checkSummary.failed));
    assert.equal(latestArtifactGapReceipt.gapCount, undefined);
    assert.equal(latestArtifactGapReceipt.repairQueue, undefined);
    if (artifactGapsHistory.body.receipts.length > 1) {
      assert.equal(artifactGapsHistory.body.receipts[1].trendOnly, true);
      assert.equal(artifactGapsHistory.body.receipts[1].topGaps, undefined);
      assert.equal(artifactGapsHistory.body.receipts[1].repairQueue, undefined);
      assert.equal(artifactGapsHistory.body.receipts[1].trendSummary, undefined);
    }
    const fullArtifactGapsHistory = await json("/api/artifact-gaps/history?detail=full&limit=1");
    assert.equal(fullArtifactGapsHistory.response.status, 200);
    assert.equal(fullArtifactGapsHistory.body.detail, "full");
    assert.equal(fullArtifactGapsHistory.body.compact, false);
    assert.equal(fullArtifactGapsHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(Array.isArray(fullArtifactGapsHistory.body.receipts[0].gaps));

    const artifactGapRepair = await json("/api/artifact-gap-repair");
    assert.equal(artifactGapRepair.response.status, 200);
    assert.equal(artifactGapRepair.body.mode, "artifact-gap-proof-repair");
    assert.equal(typeof artifactGapRepair.body.cachedFromReceipt, "boolean");
    assert.equal(artifactGapRepair.body.refreshEndpoint, undefined);
    assert.equal(artifactGapRepair.body.detail, "summary");
    assert.equal(artifactGapRepair.body.compact, true);
    assert.equal(artifactGapRepair.body.fullDetailEndpoint, "/api/artifact-gap-repair?detail=full");
    assert.equal(artifactGapRepair.body.artifactGapRepairPayloadPolicy.fullDetail, false);
    assert.equal(artifactGapRepair.body.summary.repairItems, artifactGaps.body.summary.gaps);
    assert.equal(artifactGapRepair.body.summary.auditScore, 100);
    assert.equal(artifactGapRepair.body.summary.refreshCovered, true);
    assert.ok(artifactGapRepair.body.summary.opportunityUnlocks > 0);
    assert.ok(artifactGapRepair.body.repairQueue.length > 0);
    assert.equal(artifactGapRepair.body.generatedAt, undefined);
    assert.equal(artifactGapRepair.body.checkedAt, undefined);
    assert.equal(artifactGapRepair.body.sourceBoundaryAvailable, undefined);
    assert.equal(artifactGapRepair.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(artifactGapRepair.body.plan, undefined);
    assert.equal(artifactGapRepair.body.repairActions, undefined);
    assert.equal(artifactGapRepair.body.nextActionAvailable, undefined);
    assert.equal(artifactGapRepair.body.verificationCommandAvailable, undefined);
    assert.ok(artifactGapRepair.body.repairQueue.every((item) => item.forbiddenClaimCount >= 3 && item.verificationCommandAvailable === undefined && !("forbiddenClaims" in item)));
    assert.ok(artifactGapRepair.body.checks.every((check) => check.passed && check.verificationCommandAvailable === undefined && !("detail" in check)));
    assert.ok(artifactGapRepair.body.checks.some((check) => check.id === "refresh-plan"));
    assert.ok(Buffer.byteLength(JSON.stringify(artifactGapRepair.body)) < 2500);
    const fullArtifactGapRepair = await json("/api/artifact-gap-repair?detail=full");
    assert.equal(fullArtifactGapRepair.response.status, 200);
    assert.equal(fullArtifactGapRepair.body.detail, "full");
    assert.equal(fullArtifactGapRepair.body.compact, false);
    assert.equal(fullArtifactGapRepair.body.artifactGapRepairPayloadPolicy.fullDetail, true);
    assert.ok(fullArtifactGapRepair.body.repairQueue.every((item) => item.forbiddenClaims.length >= 3 && item.verificationCommand));
    assert.ok(fullArtifactGapRepair.body.checks.every((check) => check.verificationCommand));
    const artifactGapRepairPlan = await json("/api/artifact-gap-repair/plan");
    assert.equal(artifactGapRepairPlan.response.status, 200);
    assert.equal(artifactGapRepairPlan.body.command, "npm run repair:proof-gaps");
    const artifactGapRepairHistory = await json("/api/artifact-gap-repair/history");
    assert.equal(artifactGapRepairHistory.response.status, 200);
    assert.equal(artifactGapRepairHistory.body.mode, "artifact-gap-proof-repair-history");
    assert.equal(artifactGapRepairHistory.body.detail, "summary");
    assert.equal(artifactGapRepairHistory.body.compact, true);
    assert.equal(artifactGapRepairHistory.body.fullDetailEndpoint, "/api/artifact-gap-repair/history?detail=full");
    assert.equal(artifactGapRepairHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.ok(Array.isArray(artifactGapRepairHistory.body.receipts));
    assert.ok(Buffer.byteLength(JSON.stringify(artifactGapRepairHistory.body)) < 2500);
    assert.ok(artifactGapRepairHistory.body.receipts.length <= 2);
    assert.equal(artifactGapRepairHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(artifactGapRepairHistory.body.historyPayloadPolicy.historyRowsReturned, artifactGapRepairHistory.body.receipts.length);
    assert.equal(artifactGapRepairHistory.body.definitions.fullReportEndpoint, "/api/artifact-gap-repair?detail=full");
    assert.equal(artifactGapRepairHistory.body.definitions.checks.refreshPlanCovered, true);
    assert.equal(artifactGapRepairHistory.body.definitions.checks.detailAvailable, true);
    const latestArtifactGapRepairReceipt = artifactGapRepairHistory.body.receipts[0];
    assert.ok(latestArtifactGapRepairReceipt);
    assert.ok(!("mode" in latestArtifactGapRepairReceipt));
    assert.equal(latestArtifactGapRepairReceipt.checks, undefined);
    assert.ok(Number.isInteger(latestArtifactGapRepairReceipt.checkSummary.passed));
    assert.ok(latestArtifactGapRepairReceipt.topRepairItems.every((item) => Number.isInteger(item.blockedAudienceCount) && !("blockedAudiences" in item)));
    assert.ok(latestArtifactGapRepairReceipt.topRepairItems.length <= artifactGapRepairHistory.body.historyPayloadPolicy.latestRepairItemPreviewLimit);
    assert.ok(artifactGapRepairHistory.body.receipts.slice(1).every((receipt) => receipt.latestReceiptPreviewOnly === true && !("checks" in receipt) && !("topRepairItems" in receipt)));
    const fullArtifactGapRepairHistory = await json("/api/artifact-gap-repair/history?detail=full&limit=10");
    assert.equal(fullArtifactGapRepairHistory.response.status, 200);
    assert.equal(fullArtifactGapRepairHistory.body.detail, "full");
    assert.equal(fullArtifactGapRepairHistory.body.compact, false);
    assert.equal(fullArtifactGapRepairHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullArtifactGapRepairHistory.body.receipts.every((receipt) => receipt.mode === "artifact-gap-proof-repair-receipt"));

    const artifactTranscripts = await json("/api/artifact-transcripts");
    assert.equal(artifactTranscripts.response.status, 200);
    assert.equal(artifactTranscripts.body.mode, "public-artifact-transcript-library");
    assert.equal(artifactTranscripts.body.detail, "summary");
    assert.equal(artifactTranscripts.body.fullDetailEndpoint, "/api/artifact-transcripts?detail=full");
    assert.equal(artifactTranscripts.body.transcriptPayloadPolicy.fullDetail, false);
    assert.equal(artifactTranscripts.body.summary.transcripts, projects.body.projects.length);
    assert.ok(Buffer.byteLength(JSON.stringify(artifactTranscripts.body)) < 2500);
    assert.ok(artifactTranscripts.body.transcripts.length <= artifactTranscripts.body.transcriptPayloadPolicy.previewedTranscripts);
    assert.ok(artifactTranscripts.body.transcripts.every((transcript) => transcript.artifactType === "terminal-transcript"));
    assert.ok(artifactTranscripts.body.transcripts.every((transcript) => !transcript.lines && !transcript.sourceTrace));
    assert.ok(artifactTranscripts.body.transcripts.every((transcript) => !("firstCaveat" in transcript) && !("replayUrl" in transcript)));
    assert.ok(artifactTranscripts.body.comparison.strongest.length <= 3);
    assert.ok(artifactTranscripts.body.comparison.weakest.length <= 3);
    assert.ok(artifactTranscripts.body.comparison.strongest.every((transcript) => !("nextAction" in transcript) && !("projectTitle" in transcript)));
    const fullArtifactTranscripts = await json("/api/artifact-transcripts?detail=full");
    assert.equal(fullArtifactTranscripts.response.status, 200);
    assert.equal(fullArtifactTranscripts.body.detail, "full");
    assert.equal(fullArtifactTranscripts.body.transcriptPayloadPolicy.fullDetail, true);
    assert.ok(fullArtifactTranscripts.body.transcripts.every((transcript) => transcript.lines.length > 0));

    const qagentTranscript = await json("/api/artifact-transcripts/qagent");
    assert.equal(qagentTranscript.response.status, 200);
    assert.equal(qagentTranscript.body.project, "qagent");
    assert.equal(qagentTranscript.body.detail, "summary");
    assert.ok(Buffer.byteLength(JSON.stringify(qagentTranscript.body)) < 2500);
    assert.ok(!qagentTranscript.body.lines && !qagentTranscript.body.sourceTrace);
    assert.ok(qagentTranscript.body.linePreview.some((line) => line.kind === "boundary"));
    const qagentTranscriptFull = await json("/api/artifact-transcripts/qagent?detail=full");
    assert.equal(qagentTranscriptFull.response.status, 200);
    assert.equal(qagentTranscriptFull.body.detail, "full");
    assert.ok(qagentTranscriptFull.body.lines.some((line) => line.kind === "boundary"));

    const artifactCollections = await json("/api/artifact-collections");
    assert.equal(artifactCollections.response.status, 200);
    assert.equal(artifactCollections.body.mode, "artifact-museum-collections");
    assert.equal(artifactCollections.body.detail, "summary");
    assert.equal(artifactCollections.body.compact, true);
    assert.equal(artifactCollections.body.generatedAt, undefined);
    assert.ok(artifactCollections.body.collections.some((collection) => collection.id === "repair-priority"));
    assert.ok(artifactCollections.body.collections.some((collection) => collection.id === "museum-captures"));
    assert.ok(artifactCollections.body.collections.some((collection) => collection.id === "curator-annotations"));
    assert.equal(artifactCollections.body.sourceBoundaryAvailable, undefined);
    assert.ok(artifactCollections.body.collections.every((collection) => collection.pathCount > 0 && collection.suggestedPathCount === undefined));
    assert.ok(artifactCollections.body.collections.every((collection) => collection.topArtifacts.every((artifact) => !("sourceTrace" in artifact) && Number.isInteger(artifact.traces))));
    assert.equal(artifactCollections.body.collectionPayloadPolicy.itemPreviewLimit, 1);
    assert.ok(artifactCollections.body.collections.every((collection) => collection.topArtifacts.length <= 1 && collection.topGaps.length <= 1));
    assert.ok(artifactCollections.body.collections.every((collection) => Number.isInteger(collection.artifacts) && Number.isInteger(collection.gaps) && !Array.isArray(collection.artifacts) && !Array.isArray(collection.gaps) && !("suggestedPath" in collection)));
    assert.ok(artifactCollections.body.collections.every((collection) => collection.fullDetailEndpoint === undefined));
    assert.equal(artifactCollections.body.fullDetailEndpoint, "/api/artifact-collections?detail=full");
    assert.equal(artifactCollections.body.collectionDetailEndpointTemplate, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(artifactCollections.body)) < 2500);
    const fullArtifactCollections = await json("/api/artifact-collections?detail=full");
    assert.equal(fullArtifactCollections.response.status, 200);
    assert.equal(fullArtifactCollections.body.detail, "full");
    assert.ok(fullArtifactCollections.body.collections.some((collection) => collection.artifacts.some((artifact) => Array.isArray(artifact.sourceTrace))));

    const proofCollection = await json("/api/artifact-collections/proof-strongest");
    assert.equal(proofCollection.response.status, 200);
    assert.equal(proofCollection.body.id, "proof-strongest");
    assert.equal(proofCollection.body.detail, "summary");
    assert.equal(proofCollection.body.compact, true);
    assert.equal(proofCollection.body.fullDetailEndpoint, "/api/artifact-collections/proof-strongest?detail=full");
    assert.ok(proofCollection.body.artifacts.length > 0);
    assert.ok(proofCollection.body.artifacts.length <= 3);
    assert.ok(proofCollection.body.artifactSummary.total >= proofCollection.body.artifacts.length);
    assert.equal(proofCollection.body.collectionPayloadPolicy.fullDetailAvailable, true);
    assert.equal(proofCollection.body.collectionPayloadPolicy.artifactPreviewLimit, 3);
    assert.ok(proofCollection.body.artifacts.every((artifact) => Number.isInteger(artifact.sourceTraceCount) && !("sourceTrace" in artifact) && !("url" in artifact) && !("command" in artifact)));
    const fullProofCollection = await json("/api/artifact-collections/proof-strongest?detail=full");
    assert.equal(fullProofCollection.response.status, 200);
    assert.equal(fullProofCollection.body.detail, "full");
    assert.equal(fullProofCollection.body.compact, false);
    assert.ok(fullProofCollection.body.artifacts.some((artifact) => Array.isArray(artifact.sourceTrace)));

    const artifactMuseum = await json("/api/artifact-museum");
    assert.equal(artifactMuseum.response.status, 200);
    assert.equal(artifactMuseum.body.mode, "artifact-museum-quality-audit");
    assert.equal(artifactMuseum.body.detail, "summary");
    assert.equal(artifactMuseum.body.compact, true);
    assert.equal(artifactMuseum.body.generatedAt, undefined);
    assert.equal(artifactMuseum.body.fullDetailEndpoint, "/api/artifact-museum?detail=full");
    assert.equal(artifactMuseum.body.museumPayloadPolicy.fullDetail, false);
    assert.equal(artifactMuseum.body.museumPayloadPolicy.fullDetailAvailable, true);
    assert.equal(artifactMuseum.body.museumPayloadPolicy.projectsReturned, undefined);
    assert.equal(artifactMuseum.body.sourceBoundary, undefined);
    assert.equal(artifactMuseum.body.sourceBoundaryAvailable, undefined);
    assert.equal(artifactMuseum.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(artifactMuseum.body.boundaryAvailable, undefined);
    assert.ok(artifactMuseum.body.summary.score >= 60);
    assert.equal(artifactMuseum.body.summary.museumCaptures, projects.body.projects.length);
    assert.equal(artifactMuseum.body.summary.curatorAnnotations, projects.body.projects.length);
    assert.equal(artifactMuseum.body.summary.gapClosurePlans, projects.body.projects.length);
    assert.equal(artifactMuseum.body.summary.routeCovered, true);
    assert.equal(artifactMuseum.body.summary.refreshCovered, true);
    assert.ok(artifactMuseum.body.projectReadiness.length <= artifactMuseum.body.museumPayloadPolicy.projectPreviewReturned);
    assert.equal(artifactMuseum.body.projectReadinessSummary.total, projects.body.projects.length);
    assert.equal(artifactMuseum.body.projectReadinessSummary.projectsWithGaps, projects.body.projects.length);
    assert.ok(artifactMuseum.body.checks.some((check) => check.id === "inspection-route-coverage"));
    assert.ok(artifactMuseum.body.checks.some((check) => check.id === "museum-capture-coverage" && check.passed));
    assert.ok(artifactMuseum.body.checks.some((check) => check.id === "curator-annotation-coverage" && check.passed));
    assert.ok(artifactMuseum.body.checks.some((check) => check.id === "gap-closure-plan-coverage" && check.passed));
    assert.ok(artifactMuseum.body.checks.some((check) => check.id === "receipt-route-coverage" && check.passed));
    assert.ok(artifactMuseum.body.checks.some((check) => check.id === "script-coverage" && check.passed));
    assert.ok(artifactMuseum.body.dimensions.every((dimension) => !("detail" in dimension)));
    assert.ok(artifactMuseum.body.checks.every((check) => !("detail" in check) && !("verificationCommand" in check)));
    assert.ok(artifactMuseum.body.projectReadiness.every((project) => !Array.isArray(project.gaps) && Number.isInteger(project.gapCount)));
    assert.ok(artifactMuseum.body.projectReadiness.every((project) => !("title" in project) && !("sourceTraceScore" in project)));
    assert.equal(artifactMuseum.body.weakestProjects, undefined);
    assert.ok(artifactMuseum.body.curatorPlan.priorityProjects.length > 0);
    assert.equal(artifactMuseum.body.nextAction, undefined);
    assert.equal(artifactMuseum.body.nextActionAvailable, undefined);
    assert.equal(artifactMuseum.body.verificationCommand, undefined);
    assert.equal(artifactMuseum.body.verificationCommandAvailable, undefined);
    assert.equal(artifactMuseum.body.plan, undefined);
    assert.equal(artifactMuseum.body.curatorPlan.verificationCommandAvailable, undefined);
    assert.equal(artifactMuseum.body.curatorPlan.collectionOrder, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(artifactMuseum.body)) < 2100);
    const fullArtifactMuseum = await json("/api/artifact-museum?detail=full");
    assert.equal(fullArtifactMuseum.response.status, 200);
    assert.equal(fullArtifactMuseum.body.detail, "full");
    assert.equal(fullArtifactMuseum.body.compact, false);
    assert.equal(fullArtifactMuseum.body.museumPayloadPolicy.fullDetail, true);
    assert.ok(fullArtifactMuseum.body.dimensions.some((dimension) => dimension.detail));
    assert.ok(fullArtifactMuseum.body.projectReadiness.some((project) => Array.isArray(project.artifactTypes)));
    assert.ok(fullArtifactMuseum.body.projectReadiness.some((project) => Array.isArray(project.gaps)));

    const artifactMuseumPlan = await json("/api/artifact-museum/plan");
    assert.equal(artifactMuseumPlan.response.status, 200);
    assert.equal(artifactMuseumPlan.body.mode, "artifact-museum-audit-plan");
    assert.equal(artifactMuseumPlan.body.command, "npm run audit:artifact-museum");
    assert.equal(artifactMuseumPlan.body.endpoint, "/api/artifact-museum");

    const artifactMuseumHistory = await json("/api/artifact-museum/history");
    assert.equal(artifactMuseumHistory.response.status, 200);
    assert.equal(artifactMuseumHistory.body.mode, "artifact-museum-history");
    assert.equal(artifactMuseumHistory.body.detail, "summary");
    assert.equal(artifactMuseumHistory.body.compact, true);
    assert.equal(artifactMuseumHistory.body.fullDetailEndpoint, "/api/artifact-museum/history?detail=full");
    assert.equal(artifactMuseumHistory.body.generatedAt, undefined);
    assert.equal(artifactMuseumHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(artifactMuseumHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(artifactMuseumHistory.body.historyPayloadPolicy.historyRowsReturned, artifactMuseumHistory.body.receipts.length);
    assert.equal(artifactMuseumHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(artifactMuseumHistory.body.nextActionAvailable, undefined);
    assert.equal(artifactMuseumHistory.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(artifactMuseumHistory.body)) < 1700);
    assert.ok(Array.isArray(artifactMuseumHistory.body.receipts));
    assert.ok(artifactMuseumHistory.body.summary.limit <= 5);
    assert.equal(typeof artifactMuseumHistory.body.definitions.dimensions, "number");
    if (artifactMuseumHistory.body.receipts.length) {
      assert.ok(!("baseUrl" in artifactMuseumHistory.body.receipts[0]));
      assert.equal(artifactMuseumHistory.body.receipts[0].checkedAt, undefined);
      assert.ok(!("detail" in artifactMuseumHistory.body.receipts[0].dimensions[0]));
      assert.equal(typeof artifactMuseumHistory.body.receipts[0].passingChecks, "number");
    }
    if (artifactMuseumHistory.body.receipts.length > 1) {
      assert.equal(artifactMuseumHistory.body.receipts[1].checkedAt, undefined);
      assert.equal(typeof artifactMuseumHistory.body.receipts[1].dimensions, "number");
      assert.equal(artifactMuseumHistory.body.receipts[1].weakestProjects, undefined);
      assert.equal(typeof artifactMuseumHistory.body.receipts[1].highScoringDimensions, "number");
      assert.equal(typeof artifactMuseumHistory.body.receipts[1].passingChecks, "number");
    }
    const fullArtifactMuseumHistory = await json("/api/artifact-museum/history?detail=full&limit=20");
    assert.equal(fullArtifactMuseumHistory.response.status, 200);
    assert.equal(fullArtifactMuseumHistory.body.detail, "full");
    assert.equal(fullArtifactMuseumHistory.body.compact, false);
    if (fullArtifactMuseumHistory.body.receipts.length) {
      assert.ok("baseUrl" in fullArtifactMuseumHistory.body.receipts[0]);
      assert.ok(fullArtifactMuseumHistory.body.receipts[0].dimensions.some((dimension) => dimension.detail));
    }

    const artifactMuseumCompare = await json("/api/artifact-museum-compare");
    assert.equal(artifactMuseumCompare.response.status, 200);
    assert.equal(artifactMuseumCompare.body.mode, "artifact-museum-comparison-audit");
    assert.equal(artifactMuseumCompare.body.detail, "summary");
    assert.equal(artifactMuseumCompare.body.compact, true);
    assert.ok(Buffer.byteLength(JSON.stringify(artifactMuseumCompare.body)) < 1500);
    assert.equal(artifactMuseumCompare.body.generatedAt, undefined);
    assert.equal(artifactMuseumCompare.body.fullDetailEndpoint, "/api/artifact-museum-compare?detail=full");
    assert.equal(artifactMuseumCompare.body.comparisonPayloadPolicy.fullDetail, false);
    assert.ok(artifactMuseumCompare.body.comparisonPayloadPolicy.pairsReturned <= 3);
    assert.equal(artifactMuseumCompare.body.comparisonPayloadPolicy.focusPairsReturned, 0);
    assert.ok(artifactMuseumCompare.body.comparisonPayloadPolicy.pairsReturned < artifactMuseumCompare.body.comparisonPayloadPolicy.totalPairs);
    assert.ok(artifactMuseumCompare.body.summary.score >= 70);
    assert.equal(artifactMuseumCompare.body.summary.routeCovered, true);
    assert.equal(artifactMuseumCompare.body.summary.refreshCovered, true);
    assert.equal(artifactMuseumCompare.body.dimensions, undefined);
    assert.ok(Number.isInteger(artifactMuseumCompare.body.dimensionSummary.total));
    assert.ok(Number.isInteger(artifactMuseumCompare.body.focusPairSummary.total));
    assert.ok(artifactMuseumCompare.body.collectionLanes.length <= 2);
    assert.ok(artifactMuseumCompare.body.comparisonMatrix.some((pair) => pair.id === "proof-strongest__vs__media-replay"));
    assert.equal(typeof artifactMuseumCompare.body.comparisonMatrix[0].sharedProjects, "number");
    assert.equal(artifactMuseumCompare.body.comparisonMatrix[0].left, undefined);
    assert.ok(artifactMuseumCompare.body.checks.some((check) => check.id === "script-coverage" && check.passed));
    assert.ok(artifactMuseumCompare.body.checks.length <= 2);
    assert.ok(artifactMuseumCompare.body.curatorContrastPlan.contrastOrder.length > 0);
    assert.ok(artifactMuseumCompare.body.curatorContrastPlan.contrastOrder.length <= 1);
    assert.equal(artifactMuseumCompare.body.curatorContrastPlan.manualGateAvailable, true);
    assert.equal(artifactMuseumCompare.body.nextAction, undefined);
    assert.equal(artifactMuseumCompare.body.nextActionAvailable, undefined);
    assert.equal(artifactMuseumCompare.body.verificationCommand, undefined);
    assert.equal(artifactMuseumCompare.body.verificationCommandAvailable, undefined);
    const fullArtifactMuseumCompare = await json("/api/artifact-museum-compare?detail=full");
    assert.equal(fullArtifactMuseumCompare.response.status, 200);
    assert.equal(fullArtifactMuseumCompare.body.detail, "full");
    assert.equal(fullArtifactMuseumCompare.body.compact, false);
    assert.equal(fullArtifactMuseumCompare.body.comparisonPayloadPolicy.fullDetail, true);
    assert.ok(Array.isArray(fullArtifactMuseumCompare.body.comparisonMatrix[0].sharedProjects));
    assert.equal(fullArtifactMuseumCompare.body.comparisonMatrix.length, fullArtifactMuseumCompare.body.summary.comparisonPairs);
    assert.ok(JSON.stringify(fullArtifactMuseumCompare.body).length > JSON.stringify(artifactMuseumCompare.body).length);

    const artifactMuseumComparePlan = await json("/api/artifact-museum-compare/plan");
    assert.equal(artifactMuseumComparePlan.response.status, 200);
    assert.equal(artifactMuseumComparePlan.body.mode, "artifact-museum-comparison-plan");
    assert.equal(artifactMuseumComparePlan.body.command, "npm run compare:artifact-museum");
    assert.equal(artifactMuseumComparePlan.body.endpoint, "/api/artifact-museum-compare");

    const artifactMuseumCompareHistory = await json("/api/artifact-museum-compare/history");
    assert.equal(artifactMuseumCompareHistory.response.status, 200);
    assert.equal(artifactMuseumCompareHistory.body.mode, "artifact-museum-comparison-history");
    assert.equal(artifactMuseumCompareHistory.body.detail, "summary");
    assert.equal(artifactMuseumCompareHistory.body.compact, true);
    assert.equal(artifactMuseumCompareHistory.body.summary.limit, 5);
    assert.equal(artifactMuseumCompareHistory.body.fullDetailEndpoint, "/api/artifact-museum-compare/history?detail=full");
    assert.equal(artifactMuseumCompareHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(artifactMuseumCompareHistory.body.historyPayloadPolicy.fullDetailEndpoint, undefined);
    assert.equal(artifactMuseumCompareHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.ok(Buffer.byteLength(JSON.stringify(artifactMuseumCompareHistory.body)) < 1900);
    assert.equal(artifactMuseumCompareHistory.body.generatedAt, undefined);
    assert.equal(artifactMuseumCompareHistory.body.receiptStore, undefined);
    assert.equal(artifactMuseumCompareHistory.body.receiptStoreAvailable, true);
    assert.ok(Array.isArray(artifactMuseumCompareHistory.body.receipts));
    assert.ok(artifactMuseumCompareHistory.body.receipts.length <= 5);
    assert.ok(artifactMuseumCompareHistory.body.receipts.every((receipt) => !("baseUrl" in receipt)));
    assert.ok(artifactMuseumCompareHistory.body.receipts.every((receipt) => !("mode" in receipt)));
    assert.ok(artifactMuseumCompareHistory.body.receipts.every((receipt) => !("checkedAt" in receipt)));
    assert.equal(artifactMuseumCompareHistory.body.receipts[0].failingCheckIds, undefined);
    assert.ok(Number.isInteger(artifactMuseumCompareHistory.body.receipts[0].dimensionSummary.total));
    assert.equal(artifactMuseumCompareHistory.body.receipts[0].dimensions, undefined);
    assert.ok(Number.isInteger(artifactMuseumCompareHistory.body.receipts[0].focusPairSummary.total));
    assert.equal(artifactMuseumCompareHistory.body.receipts[0].focusPairs, undefined);
    assert.ok(Number.isInteger(artifactMuseumCompareHistory.body.receipts[0].checkSummary.total));
    assert.equal(artifactMuseumCompareHistory.body.receipts[0].checks, undefined);
    if (artifactMuseumCompareHistory.body.receipts.length > 1) {
      assert.equal(artifactMuseumCompareHistory.body.receipts[1].focusPairs, undefined);
      assert.equal(artifactMuseumCompareHistory.body.receipts[1].checks, undefined);
      assert.equal(artifactMuseumCompareHistory.body.receipts[1].dimensions, undefined);
      assert.ok(Number.isInteger(artifactMuseumCompareHistory.body.receipts[1].checkSummary.total));
    }

    const fullArtifactMuseumCompareHistory = await json("/api/artifact-museum-compare/history?detail=full&limit=10");
    assert.equal(fullArtifactMuseumCompareHistory.response.status, 200);
    assert.equal(fullArtifactMuseumCompareHistory.body.detail, "full");
    assert.equal(fullArtifactMuseumCompareHistory.body.compact, false);
    assert.equal(fullArtifactMuseumCompareHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullArtifactMuseumCompareHistory.body.receipts.length <= 10);
    assert.ok(fullArtifactMuseumCompareHistory.body.receipts[0].baseUrl);
    assert.ok(fullArtifactMuseumCompareHistory.body.receipts[0].dimensions.some((dimension) => dimension.detail));
    assert.ok(fullArtifactMuseumCompareHistory.body.receipts[0].focusPairs.some((pair) => pair.nextAction));
    assert.ok(fullArtifactMuseumCompareHistory.body.receipts[0].checks.some((check) => check.detail));

    const artifactMuseumComparePair = await json("/api/artifact-museum-compare?left=proof-strongest&right=media-replay");
    assert.equal(artifactMuseumComparePair.response.status, 200);
    assert.equal(artifactMuseumComparePair.body.selectedComparison.id, "proof-strongest__vs__media-replay");

    const artifactReplays = await json("/api/artifact-replays");
    assert.equal(artifactReplays.response.status, 200);
    assert.equal(artifactReplays.body.mode, "public-artifact-replay-catalog");
    assert.equal(artifactReplays.body.detail, "index");
    assert.equal(artifactReplays.body.compact, true);
    assert.equal(artifactReplays.body.fullDetailEndpoint, "/api/artifact-replays/:slug");
    assert.equal(artifactReplays.body.fullIndexEndpoint, "/api/artifact-replays?detail=full");
    assert.equal(artifactReplays.body.replayIndexPolicy.fullDetail, false);
    assert.equal(artifactReplays.body.summary.replays, projects.body.projects.length);
    assert.ok(artifactReplays.body.replays.length < artifactReplays.body.summary.replays);
    assert.ok(artifactReplays.body.summary.gapReplays >= projects.body.projects.length);
    assert.ok(artifactReplays.body.summary.gapClosurePlans >= projects.body.projects.length);
    assert.ok(artifactReplays.body.summary.gapClosureActions >= projects.body.projects.length);
    assert.ok(artifactReplays.body.replays.every((replay) => replay.detailEndpoint === `/api/artifact-replays/${replay.project}`));
    assert.ok(artifactReplays.body.replays.every((replay) => !replay.steps && !replay.gapSteps && !replay.gapClosurePlan));
    assert.ok(artifactReplays.body.replays.every((replay) => !("transcriptId" in replay) && !("readinessScore" in replay) && !("publicSafe" in replay)));
    assert.ok(artifactReplays.body.replays.every((replay) => replay.requiredStepKinds.includes("api-replay")));
    assert.ok(artifactReplays.body.replays.every((replay) => replay.requiredStepKinds.includes("gap-closure-plan")));
    assert.ok(artifactReplays.body.replays.every((replay) => replay.counts.gapSteps >= 1));
    assert.ok(artifactReplays.body.replays.every((replay) => replay.counts.gapClosureActions >= replay.counts.gapSteps));
    assert.equal(artifactReplays.body.generatedAt, undefined);
    assert.equal(artifactReplays.body.checkSummary.ids, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(artifactReplays.body)) < 1600);
    const fullArtifactReplays = await json("/api/artifact-replays?detail=full");
    assert.equal(fullArtifactReplays.response.status, 200);
    assert.equal(fullArtifactReplays.body.detail, "full");
    assert.equal(fullArtifactReplays.body.compact, false);
    assert.equal(fullArtifactReplays.body.replayIndexPolicy.fullDetail, true);
    assert.equal(fullArtifactReplays.body.replays.length, fullArtifactReplays.body.summary.replays);
    assert.ok(fullArtifactReplays.body.replays.every((replay) => replay.transcriptId && Number.isInteger(replay.readinessScore)));

    const qagentReplay = await json("/api/artifact-replays/qagent");
    assert.equal(qagentReplay.response.status, 200);
    assert.equal(qagentReplay.body.project, "qagent");
    assert.equal(qagentReplay.body.detail, "summary");
    assert.equal(qagentReplay.body.compact, true);
    assert.equal(qagentReplay.body.fullDetailEndpoint, "/api/artifact-replays/qagent?detail=full");
    assert.equal(qagentReplay.body.replayPayloadPolicy.fullDetail, false);
    assert.ok(qagentReplay.body.steps.some((step) => step.kind === "terminal-replay"));
    assert.ok(qagentReplay.body.steps.some((step) => step.kind === "gap-record"));
    assert.ok(qagentReplay.body.steps.some((step) => step.kind === "gap-closure-plan"));
    assert.ok(qagentReplay.body.steps.every((step) => !("target" in step) && !("expected" in step) && !("sourceTrace" in step)));
    assert.ok(qagentReplay.body.gapClosurePlan.every((item) => item.forbiddenClaimAvailable && item.verificationCommandAvailable && !item.forbiddenClaim && !item.verificationCommand));
    const fullQagentReplay = await json("/api/artifact-replays/qagent?detail=full");
    assert.equal(fullQagentReplay.response.status, 200);
    assert.equal(fullQagentReplay.body.detail, "full");
    assert.equal(fullQagentReplay.body.compact, false);
    assert.equal(fullQagentReplay.body.replayPayloadPolicy.fullDetail, true);
    assert.ok(fullQagentReplay.body.steps.every((step) => step.target && step.expected && Array.isArray(step.sourceTrace)));
    assert.ok(fullQagentReplay.body.gapClosurePlan.every((item) => item.forbiddenClaim && item.verificationCommand));

    const artifactCompare = await json("/api/artifact-compare?left=qagent&right=flowpr");
    assert.equal(artifactCompare.response.status, 200);
    assert.equal(artifactCompare.body.mode, "public-artifact-comparison");
    assert.equal(artifactCompare.body.detail, "summary");
    assert.equal(artifactCompare.body.compact, true);
    assert.equal(artifactCompare.body.generatedAt, undefined);
    assert.equal(artifactCompare.body.sourceBoundaryAvailable, undefined);
    assert.equal(artifactCompare.body.artifactComparePayloadPolicy.fullDetail, false);
    assert.equal(artifactCompare.body.artifactComparePayloadPolicy.fullDetailAvailable, undefined);
    assert.equal(artifactCompare.body.artifactComparePayloadPolicy.leftArtifactsReturned, artifactCompare.body.left.artifacts.length);
    assert.equal(artifactCompare.body.artifactComparePayloadPolicy.rightArtifactsReturned, artifactCompare.body.right.artifacts.length);
    assert.equal(artifactCompare.body.artifactComparePayloadPolicy.leftGaps, undefined);
    assert.equal(artifactCompare.body.nextActionCount, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(artifactCompare.body)) < 1500);
    assert.equal(artifactCompare.body.left.slug, "qagent");
    assert.equal(artifactCompare.body.right.slug, "flowpr");
    assert.ok(artifactCompare.body.left.artifacts.length <= 1);
    assert.ok(artifactCompare.body.right.artifacts.length <= 1);
    assert.equal(artifactCompare.body.left.artifacts[0].proofStrength, undefined);
    assert.equal(artifactCompare.body.left.gapIds, undefined);
    assert.equal(artifactCompare.body.left.artifactTypes, undefined);
    assert.ok(artifactCompare.body.left.artifactTypePreview.length <= 2);
    assert.ok(artifactCompare.body.comparison.sharedArtifactTypes.length <= 2);
    assert.equal(artifactCompare.body.comparison.sharedArtifactTypeCount, undefined);
    assert.ok(artifactCompare.body.nextActions.length > 0);
    assert.ok(artifactCompare.body.nextActions.every((action) => action.actionAvailable === true && !action.includes));
    const fullArtifactCompare = await json("/api/artifact-compare?left=qagent&right=flowpr&detail=full");
    assert.equal(fullArtifactCompare.response.status, 200);
    assert.equal(fullArtifactCompare.body.detail, "full");
    assert.equal(fullArtifactCompare.body.compact, false);
    assert.equal(fullArtifactCompare.body.artifactComparePayloadPolicy.fullDetail, true);
    assert.ok(fullArtifactCompare.body.left.artifacts.some((artifact) => artifact.command));
    assert.ok(fullArtifactCompare.body.left.artifacts.some((artifact) => artifact.url));
    assert.ok(fullArtifactCompare.body.nextActions.every((action) => typeof action === "string"));

    const narrativeObjections = await json("/api/narrative-objections");
    assert.equal(narrativeObjections.response.status, 200);
    assert.equal(narrativeObjections.body.mode, "evidence-narrative-objection-report");
    assert.equal(typeof narrativeObjections.body.cachedFromReceipt, "boolean");
    assert.equal(narrativeObjections.body.refreshEndpoint, "/api/narrative-objections?refresh=1");
    assert.equal(narrativeObjections.body.detail, "summary");
    assert.equal(narrativeObjections.body.compact, true);
    assert.equal(narrativeObjections.body.fullDetailEndpoint, "/api/narrative-objections?detail=full");
    assert.equal(narrativeObjections.body.objectionPayloadPolicy.fullDetail, false);
    assert.equal(narrativeObjections.body.objectionPayloadPolicy.fullDetailAvailable, true);
    assert.equal(narrativeObjections.body.generatedAt, undefined);
    assert.equal(narrativeObjections.body.checkedAt, undefined);
    assert.equal(narrativeObjections.body.plan, undefined);
    assert.equal(narrativeObjections.body.cachePolicy, undefined);
    assert.equal(narrativeObjections.body.sourceBoundaryAvailable, undefined);
    assert.ok(narrativeObjections.body.summary.objections >= 15);
    assert.equal(narrativeObjections.body.summary.averageAnswerability, undefined);
    assert.equal(narrativeObjections.body.summary.checks, undefined);
    assert.ok(narrativeObjections.body.audiences.every((audience) => audience.objectionCount >= 5));
    assert.ok(narrativeObjections.body.audiences.every((audience) => audience.objectionPreview.length <= 2));
    assert.ok(narrativeObjections.body.audiences.every((audience) => !("sourceProjects" in audience) && Number.isInteger(audience.sourceProjectCount)));
    assert.ok(
      narrativeObjections.body.audiences.every((audience) =>
        audience.objectionPreview.every((objectionId) => typeof objectionId === "string"),
      ),
    );
    assert.ok(narrativeObjections.body.checks.every((check) => !("repairAction" in check) && !("verificationCommand" in check)));
    assert.equal(narrativeObjections.body.nextAction, undefined);
    assert.equal(narrativeObjections.body.verificationCommand, undefined);
    assert.equal(narrativeObjections.body.nextActionAvailable, undefined);
    assert.equal(narrativeObjections.body.verificationCommandAvailable, undefined);
    assert.equal(narrativeObjections.body.sideEffectBoundaryAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(narrativeObjections.body)) < 2500);
    const fullNarrativeObjections = await json("/api/narrative-objections?detail=full");
    assert.equal(fullNarrativeObjections.response.status, 200);
    assert.equal(fullNarrativeObjections.body.detail, "full");
    assert.equal(fullNarrativeObjections.body.compact, false);
    assert.equal(fullNarrativeObjections.body.objectionPayloadPolicy.fullDetail, true);
    assert.ok(fullNarrativeObjections.body.audiences.every((audience) => audience.objections.every((objection) => objection.answer && objection.repairAction)));
    assert.ok(fullNarrativeObjections.body.checks.every((check) => check.repairAction && check.verificationCommand));
    assert.ok(JSON.stringify(fullNarrativeObjections.body).length > JSON.stringify(narrativeObjections.body).length);
    const liveNarrativeObjections = await json("/api/narrative-objections?refresh=1");
    assert.equal(liveNarrativeObjections.response.status, 200);
    assert.equal(liveNarrativeObjections.body.cachedFromReceipt, false);
    assert.equal(liveNarrativeObjections.body.cachePolicy, undefined);
    assert.equal(liveNarrativeObjections.body.detail, "summary");

    const narrativeObjectionsPlan = await json("/api/narrative-objections/plan");
    assert.equal(narrativeObjectionsPlan.response.status, 200);
    assert.equal(narrativeObjectionsPlan.body.command, "npm run audit:narrative-objections");
    assert.equal(narrativeObjectionsPlan.body.endpoint, "/api/narrative-objections");

    const narrativeObjectionsHistory = await json("/api/narrative-objections/history");
    assert.equal(narrativeObjectionsHistory.response.status, 200);
    assert.equal(narrativeObjectionsHistory.body.mode, "evidence-narrative-objection-history");
    assert.equal(narrativeObjectionsHistory.body.detail, "summary");
    assert.equal(narrativeObjectionsHistory.body.compact, true);
    assert.equal(narrativeObjectionsHistory.body.sourceBoundary, undefined);
    assert.equal(narrativeObjectionsHistory.body.sourceBoundaryAvailable, true);
    assert.equal(narrativeObjectionsHistory.body.sideEffectBoundary, undefined);
    assert.equal(narrativeObjectionsHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(narrativeObjectionsHistory.body.fullDetailEndpoint, "/api/narrative-objections/history?detail=full");
    assert.equal(narrativeObjectionsHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(narrativeObjectionsHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(narrativeObjectionsHistory.body.historyPayloadPolicy.olderReceiptPreview, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(narrativeObjectionsHistory.body)) < 1600);
    assert.equal(narrativeObjectionsHistory.body.generatedAt, undefined);
    assert.equal(narrativeObjectionsHistory.body.summary.latestCheckedAt, undefined);
    assert.ok(narrativeObjectionsHistory.body.definitions.ruleCount <= 4);
    assert.equal(typeof narrativeObjectionsHistory.body.definitions.checkCount, "number");
    assert.ok(narrativeObjectionsHistory.body.summary.totalAvailable >= narrativeObjectionsHistory.body.receipts.length);
    assert.equal(narrativeObjectionsHistory.body.definitions.checks, undefined);
    assert.ok(Array.isArray(narrativeObjectionsHistory.body.receipts));
    const latestNarrativeObjectionReceipt = narrativeObjectionsHistory.body.receipts[0];
    assert.ok(latestNarrativeObjectionReceipt);
    assert.ok(!("baseUrl" in latestNarrativeObjectionReceipt));
    assert.ok(!("mode" in latestNarrativeObjectionReceipt));
    assert.ok(!("report" in latestNarrativeObjectionReceipt));
    assert.ok(!("checkedAt" in latestNarrativeObjectionReceipt));
    assert.ok(latestNarrativeObjectionReceipt.audiencePreview.every((audience) => Number.isInteger(audience.objections)));
    assert.ok(
      latestNarrativeObjectionReceipt.audiencePreview.every(
        (audience) =>
          audience.topObjectionId &&
          !("challenge" in audience) &&
          !("answer" in audience) &&
          !("repairAction" in audience) &&
          !("verificationCommand" in audience),
      ),
    );
    assert.ok(Number.isInteger(latestNarrativeObjectionReceipt.passedChecks));
    assert.ok(Array.isArray(latestNarrativeObjectionReceipt.failedChecks));
    if (narrativeObjectionsHistory.body.receipts.length > 1) {
      assert.equal(narrativeObjectionsHistory.body.receipts[1].trendOnly, true);
      assert.equal(narrativeObjectionsHistory.body.receipts[1].audiencePreview, undefined);
      assert.equal(typeof narrativeObjectionsHistory.body.receipts[1].objections, "number");
    }
    assert.equal(narrativeObjectionsHistory.body.nextAction, undefined);
    assert.equal(narrativeObjectionsHistory.body.verificationCommand, undefined);
    assert.equal(narrativeObjectionsHistory.body.verificationCommandAvailable, undefined);
    const fullNarrativeObjectionsHistory = await json("/api/narrative-objections/history?detail=full&limit=10");
    assert.equal(fullNarrativeObjectionsHistory.response.status, 200);
    assert.equal(fullNarrativeObjectionsHistory.body.detail, "full");
    assert.equal(fullNarrativeObjectionsHistory.body.compact, false);
    assert.equal(fullNarrativeObjectionsHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullNarrativeObjectionsHistory.body.receipts.length <= 10);
    assert.equal(fullNarrativeObjectionsHistory.body.receipts[0].mode, "evidence-narrative-objection-receipt");
    assert.ok(fullNarrativeObjectionsHistory.body.receipts[0].report);
    const clampedNarrativeObjectionsHistory = await json("/api/narrative-objections/history?limit=0");
    assert.equal(clampedNarrativeObjectionsHistory.response.status, 200);
    assert.equal(clampedNarrativeObjectionsHistory.body.summary.limit, 1);

    const recruiterObjections = await json("/api/narrative-objections/recruiter");
    assert.equal(recruiterObjections.response.status, 200);
    assert.equal(recruiterObjections.body.id, "recruiter");
    assert.equal(recruiterObjections.body.detail, "summary");
    assert.equal(recruiterObjections.body.compact, true);
    assert.equal(recruiterObjections.body.fullDetailEndpoint, "/api/narrative-objections/recruiter?detail=full");
    assert.ok(recruiterObjections.body.disclosureChecklistCount >= 3);
    assert.ok(recruiterObjections.body.objections.every((objection) => objection.repairActionAvailable && objection.verificationCommandAvailable));
    assert.ok(recruiterObjections.body.objections.every((objection) => !("answer" in objection) && !("repairAction" in objection) && !("verificationCommand" in objection)));
    const fullRecruiterObjections = await json("/api/narrative-objections/recruiter?detail=full");
    assert.equal(fullRecruiterObjections.response.status, 200);
    assert.equal(fullRecruiterObjections.body.detail, "full");
    assert.equal(fullRecruiterObjections.body.compact, false);
    assert.ok(fullRecruiterObjections.body.disclosureChecklist.length >= 3);
    assert.ok(fullRecruiterObjections.body.objections.every((objection) => objection.repairAction && objection.verificationCommand));

    const narrativeTailor = await json("/api/narrative-tailor");
    assert.equal(narrativeTailor.response.status, 200);
    assert.equal(narrativeTailor.body.mode, "evidence-backed-narrative-tailor");
    assert.equal(typeof narrativeTailor.body.cachedFromReceipt, "boolean");
    assert.equal(narrativeTailor.body.refreshEndpoint, undefined);
    assert.equal(narrativeTailor.body.detail, "summary");
    assert.equal(narrativeTailor.body.fullDetailEndpoint, "/api/narrative-tailor?detail=full");
    assert.equal(narrativeTailor.body.narrativeTailorPayloadPolicy.fullDetail, false);
    assert.equal(narrativeTailor.body.generatedAt, undefined);
    assert.equal(narrativeTailor.body.checkedAt, undefined);
    assert.equal(narrativeTailor.body.sourceBoundaryAvailable, undefined);
    assert.equal(narrativeTailor.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(narrativeTailor.body.methodologyAvailable, undefined);
    assert.equal(narrativeTailor.body.latestReceiptAvailable, undefined);
    assert.equal(narrativeTailor.body.nextActionAvailable, undefined);
    assert.equal(narrativeTailor.body.verificationCommandAvailable, undefined);
    assert.equal(narrativeTailor.body.summary.audiences, 3);
    assert.ok(narrativeTailor.body.summary.variants >= 9);
    assert.ok(Number.isInteger(narrativeTailor.body.summary.averageManualReadinessScore));
    assert.ok(Number.isInteger(narrativeTailor.body.summary.averageLocalReviewReadinessScore));
    assert.equal(
      narrativeTailor.body.summary.manualReadinessReady +
        narrativeTailor.body.summary.manualReadinessRestricted +
        narrativeTailor.body.summary.manualReadinessBlocked,
      3,
    );
    assert.equal(narrativeTailor.body.summary.localReviewReady + narrativeTailor.body.summary.localReviewBlocked, 3);
    assert.ok(narrativeTailor.body.summary.localReviewReady >= 1);
    assert.ok(narrativeTailor.body.summary.manualRepairPlanItems >= 3);
    assert.ok(narrativeTailor.body.audiences.every((audience) => audience.variantCount >= 3));
    assert.ok(narrativeTailor.body.audiences.every((audience) => audience.variants.length <= 1));
    assert.ok(narrativeTailor.body.audiences.every((audience) => audience.band === undefined && audience.detailEndpoint === undefined));
    assert.ok(narrativeTailor.body.audiences.every((audience) => audience.manualReadinessGate.repairPlanCount >= 1));
    assert.ok(narrativeTailor.body.audiences.every((audience) => audience.manualReadinessGate.reviewChecklistCount >= 4));
    assert.ok(narrativeTailor.body.audiences.every((audience) => typeof audience.manualReadinessGate.localReviewReady === "boolean"));
    assert.ok(narrativeTailor.body.audiences.every((audience) => Number.isInteger(audience.manualReadinessGate.localReviewScore)));
    assert.ok(
      narrativeTailor.body.audiences.every((audience) =>
        audience.variants.every((variant) => variant.claimCount > 0 && variant.artifactCount > 0 && !("claimsUsed" in variant) && !("artifactsUsed" in variant)),
      ),
    );
    assert.ok(narrativeTailor.body.audiences.every((audience) => audience.variants.every((variant) => !("body" in variant) && !("verificationCommand" in variant))));
    assert.ok(Buffer.byteLength(JSON.stringify(narrativeTailor.body)) < 2500);

    const fullNarrativeTailor = await json("/api/narrative-tailor?detail=full");
    assert.equal(fullNarrativeTailor.response.status, 200);
    assert.equal(fullNarrativeTailor.body.detail, "full");
    assert.equal(fullNarrativeTailor.body.narrativeTailorPayloadPolicy.fullDetail, true);
    assert.ok(fullNarrativeTailor.body.audiences.every((audience) => audience.manualReadinessGate.repairPlan.length >= 1));
    assert.ok(fullNarrativeTailor.body.audiences.every((audience) => audience.variants.every((variant) => variant.body && variant.verificationCommand)));

    const recruiterTailor = await json("/api/narrative-tailor/recruiter");
    assert.equal(recruiterTailor.response.status, 200);
    assert.equal(recruiterTailor.body.id, "recruiter");
    assert.equal(typeof recruiterTailor.body.cachedFromReceipt, "boolean");
    assert.equal(recruiterTailor.body.refreshEndpoint, "/api/narrative-tailor/recruiter?refresh=1");
    assert.equal(recruiterTailor.body.detail, "summary");
    assert.equal(recruiterTailor.body.compact, true);
    assert.equal(recruiterTailor.body.fullDetailEndpoint, "/api/narrative-tailor/recruiter?detail=full");
    assert.ok(Buffer.byteLength(JSON.stringify(recruiterTailor.body)) < 2500);
    assert.ok(recruiterTailor.body.variants.length <= recruiterTailor.body.narrativeTailorPayloadPolicy.variantPreviewLimit);
    assert.equal(recruiterTailor.body.variantCount, recruiterTailor.body.narrativeTailorPayloadPolicy.variantsAvailable);
    assert.ok(recruiterTailor.body.variants.some((variant) => variant.id === "proof-first"));
    assert.ok(recruiterTailor.body.variants.every((variant) => /never send|draft-only/i.test(variant.manualUseBoundary)));
    assert.ok(recruiterTailor.body.variants.every((variant) => !variant.body && variant.bodyAvailable === true));
    assert.ok(["manual-review-ready", "restricted-draft", "repair-before-use"].includes(recruiterTailor.body.manualReadinessGate.status));
    assert.equal(recruiterTailor.body.manualReadinessGate.localReviewReady, true);
    assert.equal(recruiterTailor.body.manualReadinessGate.localReviewBoundaryAvailable, true);
    assert.ok(recruiterTailor.body.manualReadinessGate.forbiddenActionsPreview.includes("send-outreach"));
    assert.ok(recruiterTailor.body.variants.every((variant) => variant.claimCount > 0 && variant.artifactCount > 0 && !("claimsUsed" in variant) && !("artifactsUsed" in variant)));
    assert.equal(recruiterTailor.body.narrativeTailorPayloadPolicy.fullDetailEndpoint, undefined);
    const fullRecruiterTailor = await json("/api/narrative-tailor/recruiter?detail=full");
    assert.equal(fullRecruiterTailor.response.status, 200);
    assert.equal(fullRecruiterTailor.body.detail, "full");
    assert.equal(fullRecruiterTailor.body.compact, false);
    assert.ok(fullRecruiterTailor.body.variants.every((variant) => variant.body && variant.verificationCommand));

    const narrativeDisclosure = await json("/api/narrative-disclosure");
    assert.equal(narrativeDisclosure.response.status, 200);
    assert.equal(narrativeDisclosure.body.mode, "evidence-narrative-disclosure");
    assert.equal(typeof narrativeDisclosure.body.cachedFromReceipt, "boolean");
    assert.equal(narrativeDisclosure.body.detail, "summary");
    assert.equal(narrativeDisclosure.body.compact, true);
    assert.equal(narrativeDisclosure.body.refreshEndpoint, "/api/narrative-disclosure?refresh=1");
    assert.equal(narrativeDisclosure.body.fullDetailEndpoint, "/api/narrative-disclosure?detail=full");
    assert.equal(narrativeDisclosure.body.sourceBoundary, undefined);
    assert.equal(narrativeDisclosure.body.sourceBoundaryAvailable, undefined);
    assert.equal(narrativeDisclosure.body.cachePolicy, undefined);
    assert.equal(narrativeDisclosure.body.generatedAt, undefined);
    assert.equal(narrativeDisclosure.body.evidenceAccessAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(narrativeDisclosure.body)) < 1200);
    assert.equal(narrativeDisclosure.body.summary.audiences, 3);
    assert.equal(narrativeDisclosure.body.summary.routeCovered, undefined);
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => bundle.mustDiscloseCount >= 3));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => bundle.repairGuidanceCount >= 2));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => !("label" in bundle) && !("band" in bundle)));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => !("audience" in bundle) && !("riskLevel" in bundle)));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => !("prohibitedOverclaimCount" in bundle)));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => bundle.objectionCoverage.answerabilityScore === undefined));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => !("mustDisclose" in bundle) && !("repairGuidance" in bundle)));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => bundle.tailoredOutput.variantCount >= 3));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => bundle.tailoredOutput.score === undefined));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => bundle.evidenceGrounding.sourceTrailCount === undefined));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => bundle.tailoredOutput.variantIds === undefined && bundle.tailoredOutput.variantIdsAvailable === undefined));
    assert.ok(narrativeDisclosure.body.bundles.every((bundle) => bundle.checks === undefined && bundle.checkSummary === undefined && Number.isInteger(bundle.checkCount)));
    assert.equal(narrativeDisclosure.body.checks, undefined);
    assert.equal(narrativeDisclosure.body.latestReceipt, undefined);
    assert.equal(narrativeDisclosure.body.repairActions, undefined);
    assert.equal(typeof narrativeDisclosure.body.nonClaimCount, "number");
    assert.equal(narrativeDisclosure.body.nextActionAvailable, undefined);
    assert.equal(narrativeDisclosure.body.verificationCommandAvailable, undefined);

    const fullNarrativeDisclosure = await json("/api/narrative-disclosure?detail=full");
    assert.equal(fullNarrativeDisclosure.response.status, 200);
    assert.equal(fullNarrativeDisclosure.body.detail, "full");
    assert.equal(fullNarrativeDisclosure.body.compact, false);
    assert.ok(fullNarrativeDisclosure.body.bundles.every((bundle) => bundle.mustDisclose.length >= 3));
    assert.ok(fullNarrativeDisclosure.body.bundles.every((bundle) => bundle.repairGuidance.length >= 2));
    assert.ok(fullNarrativeDisclosure.body.nonClaims.some((item) => /automatic sending|publishing/i.test(item)));

    const recruiterDisclosure = await json("/api/narrative-disclosure/recruiter");
    assert.equal(recruiterDisclosure.response.status, 200);
    assert.equal(recruiterDisclosure.body.id, "recruiter");
    assert.equal(typeof recruiterDisclosure.body.cachedFromReceipt, "boolean");
    assert.equal(recruiterDisclosure.body.detail, "summary");
    assert.equal(recruiterDisclosure.body.compact, true);
    assert.equal(recruiterDisclosure.body.refreshEndpoint, "/api/narrative-disclosure/recruiter?refresh=1");
    assert.equal(recruiterDisclosure.body.fullDetailEndpoint, "/api/narrative-disclosure/recruiter?detail=full");
    assert.ok(Buffer.byteLength(JSON.stringify(recruiterDisclosure.body)) < 1200);
    assert.ok(recruiterDisclosure.body.evidenceGrounding.claimCount > 0);
    assert.ok(recruiterDisclosure.body.evidenceGrounding.claimsUsedPreview.length > 0);
    assert.equal(recruiterDisclosure.body.audiencePayloadPolicy.sourceTrailReturned, 0);
    assert.equal(recruiterDisclosure.body.audiencePayloadPolicy.artifactsReturned, 0);
    assert.ok(recruiterDisclosure.body.tailoredOutput.variantCount >= 3);
    assert.ok(!recruiterDisclosure.body.tailoredOutput.variants);
    assert.equal(recruiterDisclosure.body.label, undefined);
    assert.equal(recruiterDisclosure.body.checks, undefined);
    assert.ok(Number.isInteger(recruiterDisclosure.body.checkSummary.total));
    assert.equal(recruiterDisclosure.body.textAvailability, undefined);
    assert.equal(recruiterDisclosure.body.verificationCommandAvailable, undefined);

    const fullRecruiterDisclosure = await json("/api/narrative-disclosure/recruiter?detail=full");
    assert.equal(fullRecruiterDisclosure.response.status, 200);
    assert.equal(fullRecruiterDisclosure.body.detail, "full");
    assert.equal(fullRecruiterDisclosure.body.compact, false);
    assert.ok(fullRecruiterDisclosure.body.evidenceGrounding.claimsUsed.length > 0);
    assert.ok(fullRecruiterDisclosure.body.tailoredOutput.variants.length >= 3);

    const narrativeSequence = await json("/api/narrative-sequence");
    assert.equal(narrativeSequence.response.status, 200);
    assert.equal(narrativeSequence.body.mode, "evidence-narrative-sequence");
    assert.equal(typeof narrativeSequence.body.cachedFromReceipt, "boolean");
    assert.equal(narrativeSequence.body.refreshEndpoint, "/api/narrative-sequence?refresh=1");
    assert.equal(narrativeSequence.body.detail, "summary");
    assert.equal(narrativeSequence.body.compact, true);
    assert.ok(Buffer.byteLength(JSON.stringify(narrativeSequence.body)) < 1700);
    assert.equal(narrativeSequence.body.generatedAt, undefined);
    assert.equal(narrativeSequence.body.checkedAt, undefined);
    assert.equal(narrativeSequence.body.cachePolicy, undefined);
    assert.equal(narrativeSequence.body.sequenceContract, undefined);
    assert.equal(narrativeSequence.body.fullDetailEndpoint, "/api/narrative-sequence?detail=full");
    assert.equal(narrativeSequence.body.summary.audiences, 3);
    assert.ok(narrativeSequence.body.summary.totalBeats >= 21);
    assert.equal(narrativeSequence.body.summary.routeCovered, undefined);
    assert.equal(narrativeSequence.body.summary.refreshCovered, undefined);
    assert.ok(narrativeSequence.body.sequences.every((sequence) => sequence.beatCount >= 7));
    assert.ok(narrativeSequence.body.sequences.every((sequence) => sequence.beatPreview.length >= 7));
    assert.ok(narrativeSequence.body.sequences.every((sequence) => sequence.beatPreview.every((beat) => beat.evidenceCount >= 1)));
    assert.ok(narrativeSequence.body.sequences.every((sequence) => sequence.beatPreview.every((beat) => !("id" in beat))));
    assert.ok(narrativeSequence.body.sequences.every((sequence) => sequence.verificationCommandAvailable === true && !("verificationCommand" in sequence)));
    assert.ok(narrativeSequence.body.sequences.every((sequence) => sequence.checkSummary === undefined));
    assert.equal(narrativeSequence.body.sequences.every((sequence) => sequence.beats === undefined), true);
    assert.ok(narrativeSequence.body.checks.every((check) => check.id && typeof check.passed === "boolean"));
    assert.ok(narrativeSequence.body.checks.length <= 2);
    assert.ok(narrativeSequence.body.nonClaimCount >= 3);
    assert.equal(narrativeSequence.body.nextAction, undefined);
    assert.equal(narrativeSequence.body.verificationCommand, undefined);
    assert.equal(narrativeSequence.body.nextActionAvailable, undefined);
    assert.equal(narrativeSequence.body.verificationCommandAvailable, undefined);
    const fullNarrativeSequence = await json("/api/narrative-sequence?detail=full");
    assert.equal(fullNarrativeSequence.response.status, 200);
    assert.equal(fullNarrativeSequence.body.detail, "full");
    assert.equal(fullNarrativeSequence.body.compact, false);
    assert.ok(fullNarrativeSequence.body.sequences.every((sequence) => sequence.beats.length >= 7));
    assert.ok(fullNarrativeSequence.body.sequences.every((sequence) => sequence.beats.every((beat) => beat.evidenceIds.length && beat.verificationCommand)));
    assert.ok(fullNarrativeSequence.body.checks.every((check) => check.repairAction && check.verificationCommand));
    assert.ok(fullNarrativeSequence.body.nonClaims.some((item) => /automatic sending|publishing/i.test(item)));
    const liveNarrativeSequence = await json("/api/narrative-sequence?refresh=1&detail=full");
    assert.equal(liveNarrativeSequence.response.status, 200);
    assert.equal(liveNarrativeSequence.body.cachedFromReceipt, false);
    assert.equal(liveNarrativeSequence.body.cachePolicy, "live-refresh");
    assert.equal(liveNarrativeSequence.body.detail, "full");

    const recruiterSequence = await json("/api/narrative-sequence/recruiter");
    assert.equal(recruiterSequence.response.status, 200);
    assert.equal(recruiterSequence.body.id, "recruiter");
    assert.equal(recruiterSequence.body.detail, "summary");
    assert.equal(recruiterSequence.body.compact, true);
    assert.equal(typeof recruiterSequence.body.cachedFromReceipt, "boolean");
    assert.equal(recruiterSequence.body.refreshEndpoint, "/api/narrative-sequence/recruiter?refresh=1");
    assert.equal(recruiterSequence.body.fullDetailEndpoint, "/api/narrative-sequence/recruiter?detail=full");
    assert.equal(recruiterSequence.body.narrativeSequenceAudiencePayloadPolicy.fullDetail, false);
    assert.equal(recruiterSequence.body.narrativeSequenceAudiencePayloadPolicy.fullDetailEndpoint, undefined);
    assert.ok(recruiterSequence.body.narrativeSequenceAudiencePayloadPolicy.checksReturned < recruiterSequence.body.narrativeSequenceAudiencePayloadPolicy.totalChecks);
    assert.ok(Buffer.byteLength(JSON.stringify(recruiterSequence.body)) < 2500);
    assert.ok(recruiterSequence.body.beats.some((beat) => beat.id === "disclosure-gate"));
    assert.ok(recruiterSequence.body.beats.every((beat) => beat.textAvailable && beat.manualUseBoundaryAvailable && !("text" in beat)));
    assert.ok(recruiterSequence.body.checks.every((check) => check.verificationCommandAvailable && !("verificationCommand" in check)));
    const fullRecruiterSequence = await json("/api/narrative-sequence/recruiter?detail=full");
    assert.equal(fullRecruiterSequence.response.status, 200);
    assert.equal(fullRecruiterSequence.body.detail, "full");
    assert.equal(fullRecruiterSequence.body.compact, false);
    assert.ok(fullRecruiterSequence.body.beats.some((beat) => beat.id === "disclosure-gate"));
    assert.ok(/never send|draft-only|manual/i.test(fullRecruiterSequence.body.beats.at(-1).manualUseBoundary));

    const graphDisclosureLinks = await json("/api/graph-disclosure-links");
    assert.equal(graphDisclosureLinks.response.status, 200);
    assert.equal(graphDisclosureLinks.body.mode, "evidence-graph-disclosure-links");
    assert.equal(typeof graphDisclosureLinks.body.cachedFromReceipt, "boolean");
    assert.equal(graphDisclosureLinks.body.refreshEndpoint, "/api/graph-disclosure-links?refresh=1");
    assert.equal(graphDisclosureLinks.body.detail, "summary");
    assert.equal(graphDisclosureLinks.body.fullDetailEndpoint, "/api/graph-disclosure-links?detail=full");
    assert.equal(graphDisclosureLinks.body.generatedAt, undefined);
    assert.equal(graphDisclosureLinks.body.checkedAt, undefined);
    assert.equal(graphDisclosureLinks.body.plan, undefined);
    assert.equal(graphDisclosureLinks.body.latestReceipt, undefined);
    assert.equal(graphDisclosureLinks.body.cachePolicy, undefined);
    assert.equal(graphDisclosureLinks.body.sourceBoundaryAvailable, undefined);
    assert.equal(graphDisclosureLinks.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(graphDisclosureLinks.body.projectionGuard, undefined);
    assert.equal(graphDisclosureLinks.body.repairActionSummary, undefined);
    assert.equal(graphDisclosureLinks.body.nextActionAvailable, undefined);
    assert.equal(graphDisclosureLinks.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(graphDisclosureLinks.body)) < 1700);
    assert.equal(graphDisclosureLinks.body.summary.bundles, 3);
    assert.ok(graphDisclosureLinks.body.summary.relationships >= 30);
    assert.equal(graphDisclosureLinks.body.summary.confidenceCapped, true);
    assert.equal(graphDisclosureLinks.body.relationshipPayloadPolicy.fullDetail, false);
    assert.equal(graphDisclosureLinks.body.relationshipPayloadPolicy.previewLimit, 5);
    assert.equal(graphDisclosureLinks.body.relationshipPayloadPolicy.requiredRelationsReturned, 5);
    assert.equal(graphDisclosureLinks.body.relationshipPayloadPolicy.relationTypesReturned, undefined);
    assert.ok(graphDisclosureLinks.body.relationships.length < graphDisclosureLinks.body.summary.relationships);
    assert.ok(graphDisclosureLinks.body.relationships.length <= graphDisclosureLinks.body.relationshipPayloadPolicy.previewLimit);
    assert.ok(graphDisclosureLinks.body.relationships.some((relationship) => relationship.relation === "disclosure-cites-claim"));
    assert.ok(graphDisclosureLinks.body.relationships.some((relationship) => relationship.relation === "disclosure-cites-artifact"));
    assert.ok(graphDisclosureLinks.body.relationships.every((relationship) => relationship.source === undefined && relationship.target === undefined));
    assert.ok(graphDisclosureLinks.body.relationships.every((relationship) => relationship.privacyLevel === "public-safe"));
    assert.ok(
      graphDisclosureLinks.body.relationships.every(
        (relationship) =>
          relationship.confidenceBasis.length > 0 &&
          relationship.confidenceScore <= Math.min(...relationship.confidenceBasis.map((item) => item.score)),
      ),
    );
    assert.ok(graphDisclosureLinks.body.checks.some((check) => check.id === "confidence-cap"));
    assert.ok(graphDisclosureLinks.body.checks.length <= 2);

    const fullGraphDisclosureLinks = await json("/api/graph-disclosure-links?detail=full");
    assert.equal(fullGraphDisclosureLinks.response.status, 200);
    assert.equal(fullGraphDisclosureLinks.body.detail, "full");
    assert.equal(fullGraphDisclosureLinks.body.relationshipPayloadPolicy.fullDetail, true);
    assert.ok(fullGraphDisclosureLinks.body.relationships.length >= graphDisclosureLinks.body.summary.relationships);

    const intents = await json("/api/intents");
    assert.equal(intents.response.status, 200);
    assert.equal(intents.body.mode, "visitor-intent-paths");
    assert.equal(intents.body.detail, "summary");
    assert.equal(intents.body.compact, true);
    assert.equal(intents.body.fullDetailEndpoint, "/api/intents?detail=full");
    assert.equal(intents.body.pathDetailEndpointTemplate, "/api/intents/:id");
    assert.equal(intents.body.intentPayloadPolicy.fullDetail, false);
    assert.equal(intents.body.generatedAt, undefined);
    assert.ok(intents.body.paths.some((path) => path.id === "recruiter"));
    assert.ok(intents.body.paths.every((path) => path.bestProjects.length && path.proofPath.length && path.demos.length));
    assert.ok(intents.body.paths.every((path) => path.bestProjects.length <= 3 && path.proofPath.length <= 2 && path.demos.length <= 2));
    assert.ok(intents.body.paths.every((path) => path.demos.every((demo) => demo.target === undefined && typeof demo.targetAvailable === "boolean")));
    assert.ok(intents.body.paths.every((path) => path.primaryRisk === undefined && typeof path.primaryRiskAvailable === "boolean"));
    assert.ok(intents.body.paths.every((path) => path.timeBoxedPath === undefined && path.timeBoxedPathPreview === undefined && path.timeBoxedStepCount >= 1));
    assert.ok(intents.body.paths.every((path) => path.detailEndpoint === undefined));
    assert.ok(intents.body.paths.every((path) => path.bestProjects.every((project) => project.proofStrength === undefined)));
    assert.ok(intents.body.paths.every((path) => path.proofPath.every((claim) => claim.project === undefined)));
    assert.ok(Buffer.byteLength(JSON.stringify(intents.body)) < 1900);
    const fullIntents = await json("/api/intents?detail=full");
    assert.equal(fullIntents.response.status, 200);
    assert.equal(fullIntents.body.detail, "full");
    assert.equal(fullIntents.body.compact, false);
    assert.equal(fullIntents.body.intentPayloadPolicy.fullDetail, true);
    assert.ok(fullIntents.body.paths.some((path) => path.proofPath.some((claim) => claim.text)));
    const recruiterIntent = await json("/api/intents/recruiter");
    assert.equal(recruiterIntent.response.status, 200);
    assert.equal(recruiterIntent.body.id, "recruiter");
    assert.equal(recruiterIntent.body.detail, "summary");
    assert.equal(recruiterIntent.body.compact, true);
    assert.equal(recruiterIntent.body.fullDetailEndpoint, "/api/intents/recruiter?detail=full");
    assert.equal(recruiterIntent.body.intentPayloadPolicy.fullDetail, false);
    assert.ok(recruiterIntent.body.bestProjects.length <= 1);
    assert.ok(recruiterIntent.body.proofPath.length <= 1);
    assert.ok(recruiterIntent.body.demos.length <= 1);
    assert.ok(recruiterIntent.body.demos.every((demo) => demo.target === undefined && typeof demo.targetAvailable === "boolean"));
    assert.equal(recruiterIntent.body.riskDisclosure, undefined);
    assert.equal(typeof recruiterIntent.body.primaryRiskAvailable, "boolean");
    assert.equal(recruiterIntent.body.timeBoxedPath, undefined);
    assert.equal(recruiterIntent.body.timeBoxedPathPreview, undefined);
    const fullRecruiterIntent = await json("/api/intents/recruiter?detail=full");
    assert.equal(fullRecruiterIntent.response.status, 200);
    assert.equal(fullRecruiterIntent.body.detail, "full");
    assert.equal(fullRecruiterIntent.body.compact, false);
    assert.equal(fullRecruiterIntent.body.intentPayloadPolicy.fullDetail, true);
    assert.ok(fullRecruiterIntent.body.bestProjects.length >= recruiterIntent.body.bestProjects.length);
    assert.ok(fullRecruiterIntent.body.proofPath.some((claim) => claim.text));
    assert.ok(fullRecruiterIntent.body.timeBoxedPath.length >= recruiterIntent.body.timeBoxedStepCount);

    const maintenance = await json("/api/maintenance");
    assert.equal(maintenance.response.status, 200);
    assert.equal(maintenance.body.mode, "self-healing-maintenance-report");
    assert.equal(maintenance.body.detail, "summary");
    assert.equal(maintenance.body.compact, true);
    assert.equal(maintenance.body.fullDetailEndpoint, "/api/maintenance?detail=full");
    assert.equal(maintenance.body.maintenancePayloadPolicy.fullDetail, false);
    assert.ok(maintenance.body.issues.length > 0);
    assert.ok(maintenance.body.issues.length <= 5);
    assert.ok(
      maintenance.body.issues.every(
        (issue) => issue.severity && issue.title && !issue.detail && !issue.suggestedFix && !issue.verificationCommand && !("suggestedFixAvailable" in issue),
      ),
    );
    assert.equal(maintenance.body.generatedAt, undefined);
    assert.equal(maintenance.body.nextSafeActions, undefined);
    assert.ok(Number.isInteger(maintenance.body.nextSafeActionCount));
    assert.ok(Buffer.byteLength(JSON.stringify(maintenance.body)) < 1500);
    const fullMaintenance = await json("/api/maintenance?detail=full");
    assert.equal(fullMaintenance.response.status, 200);
    assert.equal(fullMaintenance.body.detail, "full");
    assert.equal(fullMaintenance.body.compact, false);
    assert.equal(fullMaintenance.body.maintenancePayloadPolicy.fullDetail, true);
    assert.ok(fullMaintenance.body.issues.every((issue) => issue.severity && issue.suggestedFix && issue.verificationCommand));

    const runtime = await json("/api/runtime-truth");
    assert.equal(runtime.response.status, 200);
    assert.equal(runtime.body.mode, "runtime-truth");
    assert.equal(runtime.body.package.name, "rishabh-personal-command-center");
    assert.ok(runtime.body.build.isBundled);
    assert.ok(runtime.body.surfaceContract.publicApiRoutes >= 80);
    assert.equal(runtime.body.surfaceContract.privateRefreshEndpoints, 0);
    assert.equal(runtime.body.surfaceContract.privateGate.publicDefaultStatus, 404);
    assert.ok(Object.values(runtime.body.surfaceContract.criticalScripts).every(Boolean));
    assert.equal(runtime.body.surfaceContract.criticalScripts.recordRouteLatency, true);
    assert.ok(runtime.body.differences.length >= 2);

    const runtimePlan = await json("/api/runtime-truth/plan");
    assert.equal(runtimePlan.response.status, 200);
    assert.equal(runtimePlan.body.mode, "runtime-truth-fingerprint-plan");
    assert.equal(runtimePlan.body.command, "npm run record:runtime");
    assert.ok(runtimePlan.body.endpoints.includes("/api/route-latency"));

    const runtimeFingerprint = await json("/api/runtime-truth/fingerprint");
    assert.equal(runtimeFingerprint.response.status, 200);
    assert.equal(runtimeFingerprint.body.mode, "runtime-truth-fingerprint");
    assert.equal(runtimeFingerprint.body.detail, "summary");
    assert.equal(runtimeFingerprint.body.compact, true);
    assert.equal(runtimeFingerprint.body.runtimeTruthPayloadPolicy.fullDetail, false);
    assert.equal(runtimeFingerprint.body.runtimeTruthPayloadPolicy.fullDetailAvailable, true);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeFingerprint.body)) < 2000);
    assert.ok(runtimeFingerprint.body.current.identityHash.length >= 12);
    assert.ok(runtimeFingerprint.body.current.volatileHash.length >= 12);
    assert.ok(runtimeFingerprint.body.current.identity.publicApiRoutes >= 80);
    assert.equal(runtimeFingerprint.body.current.identity.privateRefreshEndpoints, 0);
    assert.equal(runtimeFingerprint.body.current.identity.privateGateDefaultStatus, 404);
    assert.ok(runtimeFingerprint.body.current.identity.criticalRuntimeScripts.verify);
    assert.ok(runtimeFingerprint.body.readiness.score >= 60);
    assert.ok(runtimeFingerprint.body.checks.some((check) => check.id === "identity-fingerprint"));
    assert.ok(runtimeFingerprint.body.checks.some((check) => check.id === "surface-contract" && check.passed));
    assert.ok(runtimeFingerprint.body.checks.some((check) => check.id === "critical-script-contract" && check.passed));
    const fullRuntimeFingerprint = await json("/api/runtime-truth/fingerprint?detail=full");
    assert.equal(fullRuntimeFingerprint.response.status, 200);
    assert.equal(fullRuntimeFingerprint.body.detail, "full");
    assert.equal(fullRuntimeFingerprint.body.compact, false);
    assert.equal(fullRuntimeFingerprint.body.runtimeTruthPayloadPolicy.fullDetail, true);
    assert.ok(fullRuntimeFingerprint.body.current.volatile.baseUrl);
    assert.ok(Array.isArray(fullRuntimeFingerprint.body.diff.changes));

    const runtimeHistory = await json("/api/runtime-truth/history");
    assert.equal(runtimeHistory.response.status, 200);
    assert.equal(runtimeHistory.body.mode, "runtime-truth-history");
    assert.equal(runtimeHistory.body.detail, "summary");
    assert.equal(runtimeHistory.body.compact, true);
    assert.equal(runtimeHistory.body.summary.limit, 5);
    assert.equal(runtimeHistory.body.fullDetailEndpoint, "/api/runtime-truth/history?detail=full");
    assert.equal(runtimeHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(runtimeHistory.body.definitions.fullHistoryEndpoint, "/api/runtime-truth/history?detail=full");
    assert.ok(Array.isArray(runtimeHistory.body.receipts));
    assert.ok(runtimeHistory.body.receipts.every((receipt) => !("baseUrl" in receipt)));
    assert.ok(runtimeHistory.body.receipts.every((receipt) => !("mode" in receipt)));
    assert.ok(runtimeHistory.body.receipts[0].fingerprint.identityHash.length >= 12);
    assert.ok(runtimeHistory.body.receipts.slice(1).every((receipt) => receipt.latestReceiptPreviewOnly === true));
    assert.ok(runtimeHistory.body.receipts.slice(1).every((receipt) => !("fingerprint" in receipt)));
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeHistory.body)) < 2500);
    const fullRuntimeHistory = await json("/api/runtime-truth/history?detail=full&limit=10");
    assert.equal(fullRuntimeHistory.response.status, 200);
    assert.equal(fullRuntimeHistory.body.detail, "full");
    assert.equal(fullRuntimeHistory.body.compact, false);
    assert.equal(fullRuntimeHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullRuntimeHistory.body.receipts.some((receipt) => receipt.mode === "runtime-truth-fingerprint"));

    const runtimeAttestation = await json("/api/runtime-truth/attestation");
    assert.equal(runtimeAttestation.response.status, 200);
    assert.equal(runtimeAttestation.body.mode, "runtime-truth-attestation");
    assert.ok(runtimeAttestation.body.summary.score >= 60);
    assert.equal(runtimeAttestation.body.detail, "summary");
    assert.equal(runtimeAttestation.body.compact, true);
    assert.equal(runtimeAttestation.body.fullDetailEndpoint, "/api/runtime-truth/attestation?detail=full");
    assert.equal(runtimeAttestation.body.generatedAt, undefined);
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRouteCount >= 40);
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRouteCount >= 5);
    assert.ok(runtimeAttestation.body.routeManifest.staticRouteCount >= 6);
    assert.equal(runtimeAttestation.body.routeManifest.publicApiRoutes, undefined);
    assert.equal(runtimeAttestation.body.routeManifest.privateApiRoutes, undefined);
    assert.equal(runtimeAttestation.body.routeManifest.publicApiRoutePreview, undefined);
    assert.equal(runtimeAttestation.body.routeManifest.privateApiRoutePreview, undefined);
    assert.equal(runtimeAttestation.body.plan.endpoints, undefined);
    assert.equal(runtimeAttestation.body.plan.endpointPreview, undefined);
    assert.ok(runtimeAttestation.body.plan.endpointCount >= 5);
    assert.equal(runtimeAttestation.body.sourceBoundary, undefined);
    assert.equal(runtimeAttestation.body.sourceBoundaryAvailable, true);
    assert.equal(runtimeAttestation.body.publishGate.reason, undefined);
    assert.equal(runtimeAttestation.body.publishGate.reasonAvailable, true);
    assert.ok(runtimeAttestation.body.attestations.every((item) => item.evidence === undefined && item.explanation === undefined));
    assert.ok(runtimeAttestation.body.attestations.every((item) => item.detailAvailable === undefined && item.repairActionAvailable === undefined && item.verificationCommandAvailable === undefined));
    assert.ok(runtimeAttestation.body.attestations.every((item) => !item.evidenceSummary && !item.verificationCommand));
    assert.equal(runtimeAttestation.body.attestationPayloadPolicy.fullDetailAvailable, true);
    assert.deepEqual(runtimeAttestation.body.attestationPayloadPolicy.attestationDetailFields, ["evidence", "explanation", "repairAction", "verificationCommand"]);
    assert.equal(runtimeAttestation.body.attestationPayloadPolicy.attestationsReturned, runtimeAttestation.body.attestations.length);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeAttestation.body)) < 2500);

    const runtimeAttestationFull = await json("/api/runtime-truth/attestation?detail=full");
    assert.equal(runtimeAttestationFull.response.status, 200);
    assert.equal(runtimeAttestationFull.body.detail, "full");
    assert.equal(runtimeAttestationFull.body.compact, false);
    assert.ok(typeof runtimeAttestationFull.body.generatedAt === "string");
    assert.ok(runtimeAttestationFull.body.routeManifest.publicApiRoutes.includes("/api/runtime-truth/attestation"));
    assert.ok(runtimeAttestationFull.body.attestations.every((item) => typeof item.evidence === "string"));
    runtimeAttestation.body.routeManifest.publicApiRoutes = runtimeAttestationFull.body.routeManifest.publicApiRoutes;
    runtimeAttestation.body.routeManifest.privateApiRoutes = runtimeAttestationFull.body.routeManifest.privateApiRoutes;
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/opportunity-packages"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/opportunity-board"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/opportunity-board/:id"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/opportunity-derisking"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/opportunity-ranking"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/opportunity-scorecard"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/opportunity-scorecard/:id"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/opportunity-scorecard/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/opportunity-scorecard/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-quality"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-quality/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-quality/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-crosslinks"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-crosslinks/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-crosslinks/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-scoreboard"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-scoreboard/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-scoreboard/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/claim-calibration"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/claim-calibration/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/opportunity-quality"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/opportunity-quality/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/opportunity-quality/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/search-quality"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/search-quality/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/search-quality/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/usability"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/usability/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/usability/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-museum"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-museum/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-museum/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-museum-compare"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-museum-compare/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-museum-compare/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-gaps"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-gaps/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-gaps/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-gap-repair"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-gap-repair/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-gap-repair/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-objections"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-objections/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-objections/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-contrast"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-contrast/:id"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-contrast/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-contrast/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narratives/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narratives/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-lineage"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-lineage/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-lineage/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/trust-blockade"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/trust-blockade/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/trust-blockade/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-surface/latest"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/route-latency"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/route-latency/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/route-latency/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-boundary"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-boundary/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-boundary/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-reconciliation"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-diff"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-diff/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-diff/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-explain"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-deploy-readiness"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-evidence-chain"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-evidence-chain/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/runtime-evidence-chain/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/design-stability"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/design-stability/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/keyboard-readiness"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/keyboard-readiness/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/design-ambition"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/design-ambition/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/design-ambition/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/integrity"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/integrity/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/research-stress"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/research-stress/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/research-rigor"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/research-rigor/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/research-rigor/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/sample"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/sample/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/sample/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/claims/:id"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-tailor"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-tailor/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-disclosure"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-disclosure/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-sequence"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-sequence/:audience"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-sequence/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/narrative-sequence/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-disclosure-links"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-disclosure-links/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-projection-guard"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-projection-guard/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-projection-guard/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-confidence"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-confidence/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-depth-score"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-depth-score/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/graph-depth-score/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/artifact-replays"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/proof-quality/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/evaluation/proof-quality/history"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/proof-trials/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.publicApiRoutes.includes("/api/proof-trials/history"));
    assert.equal(runtimeAttestation.body.routeManifest.privateGate.envVar, "ENABLE_PRIVATE_COCKPIT");
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/chief-of-staff"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/cockpit/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/cockpit/history"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/chief-of-staff/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/chief-of-staff/history"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/chief-of-staff/drafts"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/chief-of-staff/drafts/:id"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/chief-of-staff/drafts/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/chief-of-staff/drafts/history"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/schedule"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/schedule/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/schedule/history"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/priorities"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/next-actions/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/next-actions/history"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/tasks/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/tasks/history"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/review-sessions/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/review-sessions/history"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/briefing-drafts/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/briefing-drafts/history"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/outreach-drafts/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/outreach-drafts/history"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/approvals/plan"));
    assert.ok(runtimeAttestation.body.routeManifest.privateApiRoutes.includes("/api/private/approvals/history"));
    assert.ok(runtimeAttestation.body.attestations.some((item) => item.id === "private-gate"));
    assert.ok(runtimeAttestation.body.attestations.some((item) => item.id === "runtime-surface-diff"));
    assert.ok(runtimeAttestation.body.attestations.some((item) => item.id === "route-latency-heatmap"));

    const runtimeSurfacePlan = await json("/api/runtime-surface/plan");
    assert.equal(runtimeSurfacePlan.response.status, 200);
    assert.equal(runtimeSurfacePlan.body.mode, "runtime-surface-diff-plan");
    assert.equal(runtimeSurfacePlan.body.command, "npm run record:runtime-surface");
    assert.equal(runtimeSurfacePlan.body.detail, "summary");
    assert.equal(runtimeSurfacePlan.body.compact, true);
    assert.equal(runtimeSurfacePlan.body.probes, undefined);
    assert.ok(runtimeSurfacePlan.body.probeTargets >= 60);
    assert.equal(runtimeSurfacePlan.body.receiptStore, undefined);
    assert.equal(runtimeSurfacePlan.body.routeInventory, undefined);
    assert.equal(runtimeSurfacePlan.body.scheduleRecommendationAvailable, undefined);
    assert.equal(runtimeSurfacePlan.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(runtimeSurfacePlan.body.fullPlanEndpoint, "/api/runtime-surface/plan?detail=full");
    assert.equal(runtimeSurfacePlan.body.probeGroups.publicApi + runtimeSurfacePlan.body.probeGroups.static + runtimeSurfacePlan.body.probeGroups.privateGate, runtimeSurfacePlan.body.probeTargets);
    assert.equal(runtimeSurfacePlan.body.probeGroups.privateDefaultStatus, 404);
    const compactPlanProbes = runtimeSurfacePlan.body.probePreview;
    assert.ok(compactPlanProbes.length <= 4);
    assert.ok(compactPlanProbes.some((probe) => probe.target === "/api/runtime-surface/latest"));
    assert.ok(compactPlanProbes.some((probe) => probe.target === "/api/route-latency"));
    assert.ok(compactPlanProbes.some((probe) => probe.target === "/api/terminal" && probe.method === "POST"));
    assert.ok(compactPlanProbes.some((probe) => probe.target === "/api/private/cockpit" && probe.expectedStatus === 404));
    assert.equal(runtimeSurfacePlan.body.probePreviewPolicy, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeSurfacePlan.body)) < 800);

    const runtimeSurfaceFullPlan = await json("/api/runtime-surface/plan?detail=full");
    assert.equal(runtimeSurfaceFullPlan.response.status, 200);
    assert.equal(runtimeSurfaceFullPlan.body.detail, "full");
    assert.equal(runtimeSurfaceFullPlan.body.compact, false);
    assert.ok(runtimeSurfaceFullPlan.body.probes.length >= runtimeSurfacePlan.body.probeTargets);
    assert.ok(runtimeSurfaceFullPlan.body.probes.some((probe) => probe.target === "/api/runtime-surface/latest"));
    assert.ok(runtimeSurfaceFullPlan.body.probes.some((probe) => probe.target === "/api/terminal" && probe.method === "POST"));

    const runtimeSurfaceLatest = await json("/api/runtime-surface/latest");
    assert.equal(runtimeSurfaceLatest.response.status, 200);
    assert.equal(runtimeSurfaceLatest.body.mode, "runtime-surface-latest");
    assert.equal(runtimeSurfaceLatest.body.detail, "summary");
    assert.equal(runtimeSurfaceLatest.body.compact, true);
    assert.equal(runtimeSurfaceLatest.body.plan.fullPlanEndpoint, "/api/runtime-surface/plan?detail=full");
    assert.equal(runtimeSurfaceLatest.body.plan.probes, undefined);
    assert.ok(runtimeSurfaceLatest.body.plan.probeTargets >= 60);
    assert.equal(runtimeSurfaceLatest.body.evidence.fullProbePlanEndpoint, "/api/runtime-surface/plan?detail=full");
    assert.equal(runtimeSurfaceLatest.body.evidence.fullLatestEndpoint, "/api/runtime-surface/latest?detail=full");

    const runtimeSurfaceFull = await json("/api/runtime-surface/latest?detail=full");
    assert.equal(runtimeSurfaceFull.response.status, 200);
    assert.equal(runtimeSurfaceFull.body.detail, "full");
    assert.equal(runtimeSurfaceFull.body.compact, false);
    assert.ok(runtimeSurfaceFull.body.plan.probes.length >= 60);

    const runtimeSurfaceHistory = await json("/api/runtime-surface/history");
    assert.equal(runtimeSurfaceHistory.response.status, 200);
    assert.equal(runtimeSurfaceHistory.body.detail, "summary");
    assert.equal(runtimeSurfaceHistory.body.compact, true);
    assert.equal(runtimeSurfaceHistory.body.generatedAt, undefined);
    assert.equal(runtimeSurfaceHistory.body.receiptStore, undefined);
    assert.equal(runtimeSurfaceHistory.body.sourceBoundary, undefined);
    assert.equal(runtimeSurfaceHistory.body.sourceBoundaryAvailable, true);
    assert.equal(runtimeSurfaceHistory.body.sideEffectBoundary, undefined);
    assert.equal(runtimeSurfaceHistory.body.sideEffectBoundaryAvailable, true);
    assert.equal(runtimeSurfaceHistory.body.summary.limit, 5);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeSurfaceHistory.body)) < 2000);
    assert.equal(runtimeSurfaceHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(runtimeSurfaceHistory.body.historyPayloadPolicy.olderReceiptsTrendOnly, true);
    assert.equal(runtimeSurfaceHistory.body.historyPayloadPolicy.receiptsReturned, runtimeSurfaceHistory.body.receipts.length);
    assert.equal(runtimeSurfaceHistory.body.historyPayloadPolicy.fullDetailEndpoint, undefined);
    assert.equal(runtimeSurfaceHistory.body.historyPayloadPolicy.compactReceiptFields, undefined);
    assert.ok(Array.isArray(runtimeSurfaceHistory.body.receipts));
    assert.ok(runtimeSurfaceHistory.body.receipts.length <= 5);
    if (runtimeSurfaceHistory.body.receipts.length) {
      assert.equal(runtimeSurfaceHistory.body.receipts[0].checks, undefined);
      assert.equal(runtimeSurfaceHistory.body.receipts[0].mode, undefined);
      assert.equal(runtimeSurfaceHistory.body.receipts[0].checkedAt, undefined);
      assert.equal(typeof runtimeSurfaceHistory.body.receipts[0].summary.score, "number");
      assert.equal(runtimeSurfaceHistory.body.receipts[0].diffSummary.declarationTargets, undefined);
      assert.equal(typeof runtimeSurfaceHistory.body.receipts[0].unexpectedCheckCount, "number");
      assert.ok(runtimeSurfaceHistory.body.receipts.slice(1).every((receipt) => receipt.trendOnly === true));
      assert.ok(runtimeSurfaceHistory.body.receipts.slice(1).every((receipt) => receipt.groupSummary === undefined));
    }

    const fullRuntimeSurfaceHistory = await json("/api/runtime-surface/history?detail=full&limit=10");
    assert.equal(fullRuntimeSurfaceHistory.response.status, 200);
    assert.equal(fullRuntimeSurfaceHistory.body.detail, "full");
    assert.equal(fullRuntimeSurfaceHistory.body.compact, false);
    assert.equal(fullRuntimeSurfaceHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullRuntimeSurfaceHistory.body.generatedAt);
    assert.equal(fullRuntimeSurfaceHistory.body.receiptStore, "var/runtime-surface-receipts.json");
    assert.ok(fullRuntimeSurfaceHistory.body.receipts.length <= 10);
    if (fullRuntimeSurfaceHistory.body.receipts.length) {
      assert.ok(Array.isArray(fullRuntimeSurfaceHistory.body.receipts[0].checks));
      assert.ok(fullRuntimeSurfaceHistory.body.receipts[0].baseUrl);
      assert.ok(fullRuntimeSurfaceHistory.body.receipts[0].checkedAt);
    }

    const routeLatencyPlan = await json("/api/route-latency/plan");
    assert.equal(routeLatencyPlan.response.status, 200);
    assert.equal(routeLatencyPlan.body.mode, "route-latency-heatmap-plan");
    assert.equal(routeLatencyPlan.body.command, "npm run record:route-latency");
    assert.equal(routeLatencyPlan.body.detail, "summary");
    assert.ok(routeLatencyPlan.body.routeProbeCount >= 50);
    assert.ok(routeLatencyPlan.body.terminalCommandCount >= 10);
    assert.equal(routeLatencyPlan.body.routeProbes, undefined);
    assert.equal(routeLatencyPlan.body.fullPlanEndpoint, "/api/route-latency/plan?detail=full");
    assert.equal(routeLatencyPlan.body.planPayloadPolicy.fullDetail, false);
    assert.ok(routeLatencyPlan.body.routeProbePreview.length <= 4);
    assert.ok(routeLatencyPlan.body.routeProbePreview.some((probe) => probe.target === "/api/route-latency"));
    assert.equal(routeLatencyPlan.body.routeProbePreview[0].id, undefined);
    assert.equal(routeLatencyPlan.body.routeProbePreview[0].route, undefined);
    assert.equal(routeLatencyPlan.body.terminalCommands, undefined);
    assert.ok(routeLatencyPlan.body.terminalCommandPreview.includes("route-latency"));
    assert.equal(routeLatencyPlan.body.sideEffectBoundary, undefined);
    assert.equal(routeLatencyPlan.body.sideEffectBoundaryAvailable, true);
    assert.ok(Buffer.byteLength(JSON.stringify(routeLatencyPlan.body)) < 1400);
    const fullRouteLatencyPlan = await json("/api/route-latency/plan?detail=full");
    assert.equal(fullRouteLatencyPlan.response.status, 200);
    assert.equal(fullRouteLatencyPlan.body.detail, "full");
    assert.ok(fullRouteLatencyPlan.body.routeProbes.some((probe) => probe.target === "/api/route-latency"));
    assert.ok(fullRouteLatencyPlan.body.routeProbes.length >= routeLatencyPlan.body.routeProbeCount);

    const routeLatency = await json("/api/route-latency");
    assert.equal(routeLatency.response.status, 200);
    assert.equal(routeLatency.body.mode, "route-latency-heatmap");
    assert.equal(routeLatency.body.plan.command, "npm run record:route-latency");
    assert.ok(Array.isArray(routeLatency.body.heatmap.routes));
    assert.ok(Array.isArray(routeLatency.body.heatmap.terminalCommands));
    assert.equal(routeLatency.body.detail, "summary");
    assert.equal(routeLatency.body.fullDetailEndpoint, "/api/route-latency?detail=full");
    assert.equal(routeLatency.body.sourceBoundary, undefined);
    assert.equal(routeLatency.body.sourceBoundaryAvailable, undefined);
    assert.equal(routeLatency.body.sideEffectBoundary, undefined);
    assert.equal(routeLatency.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(routeLatency.body.plan.fullPlanEndpoint, "/api/route-latency/plan?detail=full");
    assert.equal(routeLatency.body.plan.sideEffectBoundary, undefined);
    assert.equal(routeLatency.body.plan.sideEffectBoundaryAvailable, undefined);
    assert.ok(routeLatency.body.plan.routeProbeCount >= 50);
    assert.ok(routeLatency.body.plan.terminalCommandCount >= 10);
    assert.equal(routeLatency.body.planPolicy.fullDetail, false);
    assert.equal(routeLatency.body.planPolicy.routeProbesReturned, undefined);
    assert.equal(routeLatency.body.planPolicy.terminalCommandsReturned, undefined);
    assert.equal(routeLatency.body.plan.routeProbes, undefined);
    assert.ok(routeLatency.body.heatmap.routes.length <= 2);
    assert.ok(routeLatency.body.heatmap.terminalCommands.length <= 2);
    if (routeLatency.body.heatmap.routes.length) {
      assert.equal(routeLatency.body.heatmap.routes[0].id, undefined);
      assert.equal(routeLatency.body.heatmap.routes[0].route, undefined);
      assert.equal(typeof routeLatency.body.heatmap.routes[0].target, "string");
    }
    assert.equal(routeLatency.body.heatmapPolicy.fullDetailAvailable, undefined);
    assert.equal(routeLatency.body.heatmapPolicy.fullDetailEndpoint, undefined);
    assert.equal(routeLatency.body.slowRouteFrontier, undefined);
    assert.equal(routeLatency.body.slowTerminalFrontier, undefined);
    assert.equal(routeLatency.body.checks, undefined);
    assert.ok(Number.isInteger(routeLatency.body.checkSummary.passed));
    assert.equal(routeLatency.body.repairActions, undefined);
    assert.ok(Number.isInteger(routeLatency.body.repairActionSummary.total));
    assert.equal(routeLatency.body.repairActionSummary.ids, undefined);
    assert.equal(routeLatency.body.nonClaims, undefined);
    assert.ok(Number.isInteger(routeLatency.body.nonClaimCount));
    assert.equal(routeLatency.body.nextAction, undefined);
    assert.equal(routeLatency.body.nextActionAvailable, undefined);
    assert.equal(routeLatency.body.verificationCommand, undefined);
    assert.equal(routeLatency.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(routeLatency.body)) < 1300);

    const fullRouteLatency = await json("/api/route-latency?detail=full");
    assert.equal(fullRouteLatency.response.status, 200);
    assert.equal(fullRouteLatency.body.detail, "full");
    assert.equal(fullRouteLatency.body.heatmapPolicy.fullDetail, true);
    assert.equal(fullRouteLatency.body.planPolicy.fullDetail, true);
    assert.ok(fullRouteLatency.body.plan.routeProbes.length >= routeLatency.body.plan.routeProbeCount);
    assert.ok(fullRouteLatency.body.heatmap.routes.length >= routeLatency.body.heatmap.routes.length);
    assert.ok(Array.isArray(fullRouteLatency.body.repairActions));
    assert.ok(Array.isArray(fullRouteLatency.body.nonClaims));
    assert.equal(typeof fullRouteLatency.body.verificationCommand, "string");

    const routeLatencyHistory = await json("/api/route-latency/history");
    assert.equal(routeLatencyHistory.response.status, 200);
    assert.ok(Array.isArray(routeLatencyHistory.body.receipts));
    assert.equal(routeLatencyHistory.body.mode, "route-latency-history");
    assert.equal(routeLatencyHistory.body.detail, "summary");
    assert.equal(routeLatencyHistory.body.compact, true);
    assert.equal(routeLatencyHistory.body.summary.limit, 5);
    assert.equal(routeLatencyHistory.body.fullDetailEndpoint, "/api/route-latency/history?detail=full");
    assert.equal(routeLatencyHistory.body.sourceBoundary, undefined);
    assert.equal(routeLatencyHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(routeLatencyHistory.body.sideEffectBoundary, undefined);
    assert.equal(routeLatencyHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(routeLatencyHistory.body.generatedAt, undefined);
    assert.equal(routeLatencyHistory.body.receiptStore, undefined);
    assert.equal(routeLatencyHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(routeLatencyHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(routeLatencyHistory.body.historyPayloadPolicy.fullDetailAvailable, undefined);
    assert.equal(routeLatencyHistory.body.historyPayloadPolicy.historyRowsReturned, routeLatencyHistory.body.receipts.length);
    assert.equal(routeLatencyHistory.body.historyPayloadPolicy.heatmapPreviewLimit, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(routeLatencyHistory.body)) < 2500);
    assert.equal(routeLatencyHistory.body.nextAction, undefined);
    assert.equal(routeLatencyHistory.body.nextActionAvailable, undefined);
    assert.equal(routeLatencyHistory.body.verificationCommand, undefined);
    assert.equal(routeLatencyHistory.body.verificationCommandAvailable, undefined);
    assert.ok(routeLatencyHistory.body.receipts.every((receipt) => !receipt.heatmap));
    if (routeLatencyHistory.body.receipts.length > 0) {
      assert.equal(routeLatencyHistory.body.receipts[0].checkedAt, undefined);
      assert.ok(routeLatencyHistory.body.receipts[0].heatmapPreview);
      assert.ok(routeLatencyHistory.body.receipts[0].heatmapPreview.routes.length <= 1);
      assert.ok(routeLatencyHistory.body.receipts[0].heatmapPreview.terminalCommands.length <= 1);
      if (routeLatencyHistory.body.receipts[0].heatmapPreview.routes.length) {
        assert.equal(routeLatencyHistory.body.receipts[0].heatmapPreview.routes[0].id, undefined);
        assert.equal(routeLatencyHistory.body.receipts[0].heatmapPreview.routes[0].route, undefined);
        assert.equal(typeof routeLatencyHistory.body.receipts[0].heatmapPreview.routes[0].target, "string");
      }
      assert.ok(Number.isInteger(routeLatencyHistory.body.receipts[0].checkSummary.passed));
      assert.equal(routeLatencyHistory.body.receipts[0].checkSummary.failed, undefined);
    }
    if (routeLatencyHistory.body.receipts.length > 1) {
      assert.equal(routeLatencyHistory.body.receipts[1].checkedAt, undefined);
      assert.equal(routeLatencyHistory.body.receipts[1].heatmapPreview, undefined);
      assert.equal(routeLatencyHistory.body.receipts[1].latestReceiptPreviewOnly, undefined);
      if (routeLatencyHistory.body.receipts[1].slowFrontierSummary) {
        assert.equal(typeof routeLatencyHistory.body.receipts[1].slowFrontierSummary.routes, "number");
      }
    }
    assert.ok(routeLatencyHistory.body.receipts.every((receipt) => !("verificationCommand" in receipt) && !("nextAction" in receipt)));
    const fullRouteLatencyHistory = await json("/api/route-latency/history?detail=full&limit=10");
    assert.equal(fullRouteLatencyHistory.response.status, 200);
    assert.equal(fullRouteLatencyHistory.body.detail, "full");
    assert.equal(fullRouteLatencyHistory.body.compact, false);
    assert.equal(typeof fullRouteLatencyHistory.body.sourceBoundary, "string");
    assert.equal(fullRouteLatencyHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(typeof fullRouteLatencyHistory.body.sideEffectBoundary, "string");
    assert.equal(fullRouteLatencyHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(fullRouteLatencyHistory.body.historyPayloadPolicy.latestReceiptPreview, "full-receipt");
    assert.equal(fullRouteLatencyHistory.body.historyPayloadPolicy.heatmapPreviewLimit, "all");
    assert.equal(typeof fullRouteLatencyHistory.body.verificationCommand, "string");
    assert.equal(fullRouteLatencyHistory.body.verificationCommandAvailable, undefined);
    assert.ok(fullRouteLatencyHistory.body.receipts.every((receipt) => receipt.heatmap && receipt.verificationCommand));

    const compactRouteLatencyHistory = await json("/api/route-latency/history?limit=3");
    assert.equal(compactRouteLatencyHistory.response.status, 200);
    assert.ok(compactRouteLatencyHistory.body.receipts.length <= 3);
    assert.equal(compactRouteLatencyHistory.body.summary.limit, 3);

    const runtimeBoundary = await json("/api/runtime-boundary");
    assert.equal(runtimeBoundary.response.status, 200);
    assert.equal(runtimeBoundary.body.mode, "runtime-public-private-boundary-audit");
    assert.equal(typeof runtimeBoundary.body.cachedFromReceipt, "boolean");
    assert.equal(runtimeBoundary.body.refreshEndpoint, "/api/runtime-boundary?refresh=1");
    assert.equal(runtimeBoundary.body.detail, "summary");
    assert.equal(runtimeBoundary.body.compact, true);
    assert.equal(runtimeBoundary.body.fullDetailEndpoint, "/api/runtime-boundary?detail=full");
    assert.ok(runtimeBoundary.body.summary.score >= 80);
    assert.equal(runtimeBoundary.body.generatedAt, undefined);
    assert.equal(runtimeBoundary.body.checkedAt, undefined);
    assert.equal(runtimeBoundary.body.checks, undefined);
    assert.ok(runtimeBoundary.body.checkSummary.sentinelIds.includes("refresh-public-only"));
    assert.ok(runtimeBoundary.body.checkSummary.sentinelIds.includes("private-surface-probe-coverage"));
    assert.equal(runtimeBoundary.body.boundary.privateGate.envVar, "ENABLE_PRIVATE_COCKPIT");
    assert.equal(runtimeBoundary.body.runtimeBoundaryPayloadPolicy.fullDetail, false);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeBoundary.body)) < 1400);

    const fullRuntimeBoundary = await json("/api/runtime-boundary?detail=full");
    assert.equal(fullRuntimeBoundary.response.status, 200);
    assert.equal(fullRuntimeBoundary.body.detail, "full");
    assert.equal(fullRuntimeBoundary.body.compact, false);
    assert.ok(fullRuntimeBoundary.body.checks.some((check) => check.id === "refresh-public-only" && check.verificationCommand));
    assert.equal(fullRuntimeBoundary.body.runtimeBoundaryPayloadPolicy.fullDetail, true);

    const liveRuntimeBoundary = await json("/api/runtime-boundary?refresh=1");
    assert.equal(liveRuntimeBoundary.response.status, 200);
    assert.equal(liveRuntimeBoundary.body.mode, "runtime-public-private-boundary-audit");
    assert.equal(liveRuntimeBoundary.body.cachedFromReceipt, false);
    assert.equal(liveRuntimeBoundary.body.cachePolicy, "live-refresh");

    const runtimeBoundaryPlan = await json("/api/runtime-boundary/plan");
    assert.equal(runtimeBoundaryPlan.response.status, 200);
    assert.equal(runtimeBoundaryPlan.body.command, "npm run audit:runtime-boundary");

    const runtimeBoundaryHistory = await json("/api/runtime-boundary/history");
    assert.equal(runtimeBoundaryHistory.response.status, 200);
    assert.equal(runtimeBoundaryHistory.body.mode, "runtime-boundary-history");
    assert.equal(runtimeBoundaryHistory.body.detail, "summary");
    assert.equal(runtimeBoundaryHistory.body.generatedAt, undefined);
    assert.equal(runtimeBoundaryHistory.body.receiptStore, undefined);
    assert.ok(Array.isArray(runtimeBoundaryHistory.body.receipts));
    assert.equal(runtimeBoundaryHistory.body.summary.limit, 5);
    assert.equal(runtimeBoundaryHistory.body.summary.latestReceiptId, undefined);
    assert.equal(runtimeBoundaryHistory.body.summary.latestScore, undefined);
    assert.ok(runtimeBoundaryHistory.body.receipts.length <= 5);
    assert.ok(runtimeBoundaryHistory.body.definitions.checks.ids.includes("refresh-public-only"));
    assert.equal(runtimeBoundaryHistory.body.definitions.checks.verificationCommandsAvailable, true);
    assert.equal("verificationCommand" in runtimeBoundaryHistory.body.definitions.checks, false);
    assert.equal(runtimeBoundaryHistory.body.definitions.boundary.privateGate.envVar, "ENABLE_PRIVATE_COCKPIT");
    const latestRuntimeBoundaryReceipt = runtimeBoundaryHistory.body.receipts[0];
    assert.ok(latestRuntimeBoundaryReceipt);
    assert.ok(!latestRuntimeBoundaryReceipt.report);
    assert.ok(!("baseUrl" in latestRuntimeBoundaryReceipt));
    assert.ok(!("nextAction" in latestRuntimeBoundaryReceipt));
    assert.equal(latestRuntimeBoundaryReceipt.privateGate, undefined);
    assert.equal(latestRuntimeBoundaryReceipt.checkIds, undefined);
    assert.equal(Array.isArray(latestRuntimeBoundaryReceipt.checks), false);
    assert.equal("publicApiRoutes" in latestRuntimeBoundaryReceipt.summary, false);
    const olderRuntimeBoundaryReceipt = runtimeBoundaryHistory.body.receipts[1];
    if (olderRuntimeBoundaryReceipt) {
      assert.equal("summary" in olderRuntimeBoundaryReceipt, false);
      assert.equal(olderRuntimeBoundaryReceipt.detailAvailable, true);
      assert.equal(typeof olderRuntimeBoundaryReceipt.score, "number");
      assert.equal(typeof olderRuntimeBoundaryReceipt.band, "string");
    }
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeBoundaryHistory.body)) < 1900);
    const fullRuntimeBoundaryHistory = await json("/api/runtime-boundary/history?detail=full");
    assert.equal(fullRuntimeBoundaryHistory.response.status, 200);
    assert.equal(fullRuntimeBoundaryHistory.body.detail, "full");
    assert.ok(fullRuntimeBoundaryHistory.body.definitions.checks.some((check) => check.id === "refresh-public-only" && check.verificationCommand));
    const minimumRuntimeBoundaryHistory = await json("/api/runtime-boundary/history?limit=0");
    assert.equal(minimumRuntimeBoundaryHistory.response.status, 200);
    assert.equal(minimumRuntimeBoundaryHistory.body.summary.limit, 1);
    assert.equal(minimumRuntimeBoundaryHistory.body.receipts.length, 1);

    const runtimeReconciliation = await json("/api/runtime-reconciliation");
    assert.equal(runtimeReconciliation.response.status, 200);
    assert.equal(runtimeReconciliation.body.mode, "runtime-truth-reconciliation");
    assert.equal(typeof runtimeReconciliation.body.cachedFromReceipt, "boolean");
    assert.equal(runtimeReconciliation.body.generatedAt, undefined);
    assert.equal(runtimeReconciliation.body.checkedAt, undefined);
    assert.equal(runtimeReconciliation.body.refreshEndpoint, undefined);
    assert.equal(runtimeReconciliation.body.detail, "summary");
    assert.equal(runtimeReconciliation.body.compact, true);
    assert.equal(runtimeReconciliation.body.fullDetailEndpoint, "/api/runtime-reconciliation?detail=full");
    assert.ok(runtimeReconciliation.body.summary.checks >= 8);
    assert.equal(runtimeReconciliation.body.plan, undefined);
    assert.equal(runtimeReconciliation.body.planAvailable, true);
    assert.equal(runtimeReconciliation.body.receiptMatrix.length, 3);
    assert.ok(runtimeReconciliation.body.receiptMatrix.every((receipt) => !("detail" in receipt) && !("detailAvailable" in receipt) && !("command" in receipt) && !("commandAvailable" in receipt)));
    assert.equal(runtimeReconciliation.body.driftMatrix, undefined);
    assert.ok(Number.isInteger(runtimeReconciliation.body.driftSummary.missingRefreshEndpointCount));
    assert.ok(runtimeReconciliation.body.routeLedger.requiredPublicTruthRoutePreview.includes("/api/runtime-reconciliation"));
    assert.ok(runtimeReconciliation.body.routeLedger.requiredPublicTruthRoutePreview.includes("/api/runtime-diff"));
    assert.equal(runtimeReconciliation.body.routeLedger.allRequiredPublicTruthRoutesPresent, true);
    assert.equal(runtimeReconciliation.body.runtimeReconciliationPayloadPolicy.fullDetailAvailable, true);
    assert.equal(runtimeReconciliation.body.runtimeReconciliationPayloadPolicy.checksAvailable, runtimeReconciliation.body.summary.checks);
    assert.equal(runtimeReconciliation.body.checkSummary.total, runtimeReconciliation.body.summary.checks);
    assert.equal(runtimeReconciliation.body.checkSummary.detailAvailable, true);
    assert.equal(runtimeReconciliation.body.checkSummary.commandAvailable, true);
    assert.ok(runtimeReconciliation.body.checks.length <= runtimeReconciliation.body.runtimeReconciliationPayloadPolicy.checkPreviewLimit);
    assert.ok(runtimeReconciliation.body.checks.some((check) => check.id === "runtime-surface-receipt-current"));
    assert.ok(runtimeReconciliation.body.checks.every((check) => !("severity" in check) && !("detail" in check) && !("verificationCommand" in check)));
    assert.equal(runtimeReconciliation.body.sideEffectBoundary, undefined);
    assert.equal(runtimeReconciliation.body.boundariesAvailable, true);
    assert.equal(runtimeReconciliation.body.nextAction, undefined);
    assert.equal(runtimeReconciliation.body.verificationCommand, undefined);
    assert.equal(runtimeReconciliation.body.verificationCommandAvailable, true);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeReconciliation.body)) < 1800);
    const fullRuntimeReconciliation = await json("/api/runtime-reconciliation?detail=full");
    assert.equal(fullRuntimeReconciliation.response.status, 200);
    assert.equal(fullRuntimeReconciliation.body.detail, "full");
    assert.equal(fullRuntimeReconciliation.body.compact, false);
    assert.match(fullRuntimeReconciliation.body.sideEffectBoundary, /does not start recorders/i);
    assert.ok(fullRuntimeReconciliation.body.checks.every((check) => check.detail && check.repairAction && check.verificationCommand));

    const liveRuntimeReconciliation = await json("/api/runtime-reconciliation?refresh=1");
    assert.equal(liveRuntimeReconciliation.response.status, 200);
    assert.equal(liveRuntimeReconciliation.body.mode, "runtime-truth-reconciliation");
    assert.equal(liveRuntimeReconciliation.body.cachedFromReceipt, false);
    assert.equal(liveRuntimeReconciliation.body.cachePolicy, "live-refresh");
    assert.equal(liveRuntimeReconciliation.body.detail, "summary");

    const runtimeDiff = await json("/api/runtime-diff");
    assert.equal(runtimeDiff.response.status, 200);
    assert.equal(runtimeDiff.body.mode, "runtime-diff");
    assert.equal(typeof runtimeDiff.body.cachedFromReceipt, "boolean");
    assert.equal(runtimeDiff.body.refreshEndpoint, "/api/runtime-diff?refresh=1");
    assert.equal(runtimeDiff.body.detail, "summary");
    assert.equal(runtimeDiff.body.compact, true);
    assert.equal(runtimeDiff.body.fullDetailEndpoint, "/api/runtime-diff?detail=full");
    assert.equal(runtimeDiff.body.runtimeDiffPayloadPolicy.fullDetail, false);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeDiff.body)) < 1500);
    assert.equal(runtimeDiff.body.generatedAt, undefined);
    assert.equal(runtimeDiff.body.checkedAt, undefined);
    assert.equal(runtimeDiff.body.plan, undefined);
    assert.equal(runtimeDiff.body.previous, undefined);
    assert.equal(runtimeDiff.body.latestReceipt, undefined);
    assert.ok(runtimeDiff.body.summary.checks >= 9);
    assert.equal(runtimeDiff.body.summary.routeCovered, true);
    assert.equal(runtimeDiff.body.summary.refreshCovered, true);
    assert.ok(runtimeDiff.body.current.identityHash.length >= 12);
    assert.equal(runtimeDiff.body.current.volatileHash, undefined);
    assert.equal(runtimeDiff.body.driftMatrix, undefined);
    assert.equal(Number.isInteger(runtimeDiff.body.driftSummary.changes), true);
    assert.equal(Number.isInteger(runtimeDiff.body.driftSummary.routeSurfaceFailing), true);
    assert.equal(runtimeDiff.body.lanes, undefined);
    assert.equal(runtimeDiff.body.laneSummary.identityPassed, true);
    assert.equal(runtimeDiff.body.laneSummary.detailAvailable, true);
    assert.equal(runtimeDiff.body.laneSummary.commandAvailable, true);
    assert.equal(runtimeDiff.body.checks, undefined);
    assert.equal(runtimeDiff.body.checkSummary.changeClassificationPassed, true);
    assert.equal(runtimeDiff.body.checkSummary.routeManifestPassed, true);
    assert.equal(runtimeDiff.body.checkSummary.detailAvailable, true);
    assert.equal(runtimeDiff.body.checkSummary.repairActionAvailable, true);
    assert.equal(runtimeDiff.body.checkSummary.commandAvailable, true);
    assert.equal(runtimeDiff.body.runtimeDiffPayloadPolicy.lanesAvailable >= 1, true);
    assert.equal(runtimeDiff.body.runtimeDiffPayloadPolicy.checksAvailable >= 1, true);
    assert.equal(runtimeDiff.body.nonClaimPreview, undefined);

    const fullRuntimeDiff = await json("/api/runtime-diff?detail=full");
    assert.equal(fullRuntimeDiff.response.status, 200);
    assert.equal(fullRuntimeDiff.body.detail, "full");
    assert.equal(fullRuntimeDiff.body.compact, false);
    assert.equal(fullRuntimeDiff.body.runtimeDiffPayloadPolicy.fullDetail, true);
    assert.ok(Array.isArray(fullRuntimeDiff.body.historyWindow));
    assert.ok(fullRuntimeDiff.body.lanes.every((lane) => lane.detail && lane.verificationCommand));
    assert.ok(fullRuntimeDiff.body.checks.every((check) => check.detail && check.repairAction && check.verificationCommand));

    const liveRuntimeDiff = await json("/api/runtime-diff?refresh=1");
    assert.equal(liveRuntimeDiff.response.status, 200);
    assert.equal(liveRuntimeDiff.body.mode, "runtime-diff");
    assert.equal(liveRuntimeDiff.body.cachedFromReceipt, false);
    assert.equal(liveRuntimeDiff.body.cachePolicy, "live-refresh");
    assert.equal(liveRuntimeDiff.body.detail, "summary");

    const caseInsensitiveRuntimeDiffRefresh = await json("/api/runtime-diff?refresh=TRUE");
    assert.equal(caseInsensitiveRuntimeDiffRefresh.response.status, 200);
    assert.equal(caseInsensitiveRuntimeDiffRefresh.body.cachedFromReceipt, false);

    const runtimeDiffPlan = await json("/api/runtime-diff/plan");
    assert.equal(runtimeDiffPlan.response.status, 200);
    assert.equal(runtimeDiffPlan.body.command, "npm run diff:runtime");

    const runtimeDiffHistory = await json("/api/runtime-diff/history");
    assert.equal(runtimeDiffHistory.response.status, 200);
    assert.equal(runtimeDiffHistory.body.mode, "runtime-diff-history");
    assert.equal(runtimeDiffHistory.body.detail, "summary");
    assert.equal(runtimeDiffHistory.body.compact, true);
    assert.equal(runtimeDiffHistory.body.generatedAt, undefined);
    assert.ok(runtimeDiffHistory.body.summary.totalAvailable >= runtimeDiffHistory.body.receipts.length);
    assert.equal(runtimeDiffHistory.body.summary.limit, 5);
    assert.equal(runtimeDiffHistory.body.summary.latestReceiptId, undefined);
    assert.equal(runtimeDiffHistory.body.summary.latestScore, undefined);
    assert.equal(runtimeDiffHistory.body.fullDetailEndpoint, "/api/runtime-diff/history?detail=full");
    assert.equal(runtimeDiffHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(runtimeDiffHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(runtimeDiffHistory.body.historyPayloadPolicy.historyRowsReturned, runtimeDiffHistory.body.receipts.length);
    assert.equal(runtimeDiffHistory.body.receiptStore, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeDiffHistory.body)) < 1500);
    assert.ok(runtimeDiffHistory.body.receipts.length <= 5);
    assert.ok(Array.isArray(runtimeDiffHistory.body.receipts));
    const latestRuntimeDiffReceipt = runtimeDiffHistory.body.receipts[0];
    assert.ok(latestRuntimeDiffReceipt);
    assert.ok(!latestRuntimeDiffReceipt.report);
    assert.ok(!("baseUrl" in latestRuntimeDiffReceipt));
    assert.ok(!("mode" in latestRuntimeDiffReceipt));
    assert.equal(latestRuntimeDiffReceipt.checkedAt, undefined);
    assert.ok(latestRuntimeDiffReceipt.current.identityHash.length >= 12);
    assert.equal(typeof latestRuntimeDiffReceipt.current.previousIdentityMatches, "boolean");
    assert.ok(!("previous" in latestRuntimeDiffReceipt));
    assert.ok(runtimeDiffHistory.body.definitions.lanes.sentinelIds.includes("identity"));
    assert.ok(runtimeDiffHistory.body.definitions.lanes.verificationCommandCount >= 1);
    assert.ok(runtimeDiffHistory.body.definitions.lanes.total >= 1);
    assert.ok(runtimeDiffHistory.body.definitions.checks.sentinelIds.includes("route-manifest"));
    assert.ok(runtimeDiffHistory.body.definitions.checks.verificationCommandCount >= 1);
    assert.ok(runtimeDiffHistory.body.definitions.checks.total >= 1);
    assert.ok(Number.isInteger(latestRuntimeDiffReceipt.laneSummary.total));
    assert.ok(Number.isInteger(latestRuntimeDiffReceipt.laneSummary.failing));
    assert.ok(!("checks" in latestRuntimeDiffReceipt));
    assert.ok(Number.isInteger(latestRuntimeDiffReceipt.checkSummary.passed));
    assert.ok(Number.isInteger(latestRuntimeDiffReceipt.checkSummary.failed));
    assert.ok(["no-drift", "volatile-only-drift", "identity-drift", "no-previous-runtime-receipt"].includes(latestRuntimeDiffReceipt.driftSummary.classification));
    assert.ok(Number.isInteger(latestRuntimeDiffReceipt.driftSummary.staleReceipts));
    assert.ok(Number.isInteger(latestRuntimeDiffReceipt.historySummary.receipts));
    assert.ok(Number.isInteger(latestRuntimeDiffReceipt.nonClaimCount));
    assert.equal(runtimeDiffHistory.body.nextActionAvailable, undefined);
    assert.equal(runtimeDiffHistory.body.verificationCommandAvailable, undefined);
    assert.ok(runtimeDiffHistory.body.receipts.slice(1).every((receipt) => receipt.trendOnly === true));
    assert.ok(runtimeDiffHistory.body.receipts.slice(1).every((receipt) => !("laneSummary" in receipt) && !("driftSummary" in receipt) && receipt.checkedAt === undefined));

    const fullRuntimeDiffHistory = await json("/api/runtime-diff/history?detail=full&limit=10");
    assert.equal(fullRuntimeDiffHistory.response.status, 200);
    assert.equal(fullRuntimeDiffHistory.body.detail, "full");
    assert.equal(fullRuntimeDiffHistory.body.compact, false);
    assert.ok(fullRuntimeDiffHistory.body.generatedAt);
    assert.equal(fullRuntimeDiffHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullRuntimeDiffHistory.body.receipts.length <= 10);
    assert.ok(fullRuntimeDiffHistory.body.receipts[0].baseUrl);
    assert.ok(fullRuntimeDiffHistory.body.receipts[0].report);
    assert.ok(fullRuntimeDiffHistory.body.receipts[0].report.driftMatrix);
    assert.ok(fullRuntimeDiffHistory.body.receipts[0].report.checks.some((check) => check.detail && check.verificationCommand));

    const runtimeExplain = await json("/api/runtime-explain");
    assert.equal(runtimeExplain.response.status, 200);
    assert.equal(runtimeExplain.body.mode, "runtime-truth-explanation");
    assert.equal(typeof runtimeExplain.body.cachedFromReceipt, "boolean");
    assert.equal(runtimeExplain.body.detail, "summary");
    assert.equal(runtimeExplain.body.compact, true);
    assert.equal(runtimeExplain.body.fullDetailEndpoint, "/api/runtime-explain?detail=full");
    assert.equal(runtimeExplain.body.generatedAt, undefined);
    assert.equal(runtimeExplain.body.checkedAt, undefined);
    assert.equal(runtimeExplain.body.refreshEndpoint, undefined);
    assert.equal(runtimeExplain.body.boundariesAvailable, true);
    assert.equal(runtimeExplain.body.runtimeExplanationPayloadPolicy.fullDetail, false);
    assert.equal(runtimeExplain.body.runtimeExplanationPayloadPolicy.fullDetailAvailable, true);
    assert.equal(runtimeExplain.body.runtimeExplanationPayloadPolicy.fullDetailEndpoint, undefined);
    assert.equal(runtimeExplain.body.receiptStore, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeExplain.body)) < 1900);
    assert.ok(runtimeExplain.body.summary.proofClaims >= 5);
    assert.ok(runtimeExplain.body.summary.claimFirewallBlockedClaims >= 6);
    assert.ok(runtimeExplain.body.summary.auditLadderSteps >= 6);
    assert.ok(runtimeExplain.body.summary.receiptExplanations >= 3);
    assert.equal(runtimeExplain.body.summary.publicApiRoutes, undefined);
    assert.equal(runtimeExplain.body.receiptExplanations, undefined);
    assert.ok(runtimeExplain.body.receiptExplanationSummary.total >= 3);
    assert.equal(runtimeExplain.body.identityExplanation.identityHash, undefined);
    assert.equal(runtimeExplain.body.identityExplanation.identityHashAvailable, true);
    assert.ok(runtimeExplain.body.proofClaims.some((claim) => claim.id === "surface-contract"));
    assert.ok(runtimeExplain.body.proofClaims.every((claim) => claim.detailAvailable && !("statementAvailable" in claim) && !("verificationCommandAvailable" in claim)));
    assert.equal(runtimeExplain.body.claimFirewall.mode, "runtime-truth-claim-firewall");
    assert.equal(runtimeExplain.body.claimFirewall.externalWrite, false);
    assert.ok(runtimeExplain.body.claimFirewall.blockedClaims.some((claim) => claim.id === "production-deploy-identity"));
    assert.ok(runtimeExplain.body.claimFirewall.blockedClaims.some((claim) => claim.id === "private-cockpit-contents"));
    assert.ok(runtimeExplain.body.claimFirewall.blockedClaims.every((claim) => !("replacementAvailable" in claim)));
    assert.equal(runtimeExplain.body.auditLadder.mode, "runtime-truth-audit-ladder");
    assert.ok(runtimeExplain.body.auditLadder.steps.every((step) => step.manualOnly === true && step.externalWrite === false && !("nonClaimAvailable" in step) && !("verificationCommandAvailable" in step)));
    assert.ok(runtimeExplain.body.checks.some((check) => check.id === "claim-firewall"));
    assert.ok(runtimeExplain.body.checks.some((check) => check.id === "audit-ladder"));
    assert.ok(runtimeExplain.body.nonClaimCount >= 4);
    assert.equal(runtimeExplain.body.nonClaimsAvailable, true);
    assert.equal(runtimeExplain.body.nonClaims, undefined);
    assert.equal(runtimeExplain.body.latestReceipt, undefined);
    assert.ok(runtimeExplain.body.latestReceiptId);
    assert.equal(runtimeExplain.body.nextAction, undefined);
    assert.equal(runtimeExplain.body.verificationCommand, undefined);
    assert.equal(runtimeExplain.body.nextActionAvailable, true);
    assert.equal(runtimeExplain.body.verificationCommandAvailable, true);

    const fullRuntimeExplain = await json("/api/runtime-explain?detail=full");
    assert.equal(fullRuntimeExplain.response.status, 200);
    assert.equal(fullRuntimeExplain.body.detail, "full");
    assert.equal(fullRuntimeExplain.body.compact, false);
    assert.equal(fullRuntimeExplain.body.runtimeExplanationPayloadPolicy.fullDetail, true);
    assert.ok(fullRuntimeExplain.body.proofClaims.every((claim) => claim.statement && claim.limit && claim.verificationCommand));
    assert.ok(fullRuntimeExplain.body.claimFirewall.blockedClaims.every((claim) => claim.claim && claim.reason && claim.replacement && claim.verificationCommand));
    assert.ok(fullRuntimeExplain.body.auditLadder.steps.every((step) => step.nonClaim && step.verificationCommand));

    const liveRuntimeExplain = await json("/api/runtime-explain?refresh=1");
    assert.equal(liveRuntimeExplain.response.status, 200);
    assert.equal(liveRuntimeExplain.body.mode, "runtime-truth-explanation");
    assert.equal(liveRuntimeExplain.body.cachedFromReceipt, false);
    assert.equal(liveRuntimeExplain.body.cachePolicy, "live-refresh");
    assert.equal(liveRuntimeExplain.body.compact, true);
    const uppercaseRuntimeExplain = await json("/api/runtime-explain?refresh=TRUE");
    assert.equal(uppercaseRuntimeExplain.response.status, 200);
    assert.equal(uppercaseRuntimeExplain.body.cachedFromReceipt, false);
    assert.equal(uppercaseRuntimeExplain.body.cachePolicy, "live-refresh");
    assert.equal(uppercaseRuntimeExplain.body.detail, "summary");

    const runtimeExplainPlan = await json("/api/runtime-explain/plan");
    assert.equal(runtimeExplainPlan.response.status, 200);
    assert.equal(runtimeExplainPlan.body.command, "npm run explain:runtime");

    const runtimeExplainHistory = await json("/api/runtime-explain/history");
    assert.equal(runtimeExplainHistory.response.status, 200);
    assert.equal(runtimeExplainHistory.body.mode, "runtime-truth-explanation-history");
    assert.equal(runtimeExplainHistory.body.detail, "summary");
    assert.equal(runtimeExplainHistory.body.compact, true);
    assert.equal(runtimeExplainHistory.body.fullDetailEndpoint, "/api/runtime-explain/history?detail=full");
    assert.equal(runtimeExplainHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(runtimeExplainHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(runtimeExplainHistory.body.historyPayloadPolicy.olderReceiptPreview, undefined);
    assert.equal(runtimeExplainHistory.body.sourceBoundary, undefined);
    assert.equal(runtimeExplainHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(runtimeExplainHistory.body.historyDetailAvailable, true);
    assert.equal(runtimeExplainHistory.body.receiptStore, undefined);
    assert.equal(runtimeExplainHistory.body.receiptStoreAvailable, undefined);
    assert.ok(Array.isArray(runtimeExplainHistory.body.receipts));
    assert.ok(runtimeExplainHistory.body.summary.totalAvailable >= runtimeExplainHistory.body.receipts.length);
    assert.equal(runtimeExplainHistory.body.summary.limit, 5);
    assert.equal(runtimeExplainHistory.body.summary.latestScore, undefined);
    assert.ok(runtimeExplainHistory.body.receipts.length <= 5);
    assert.equal(runtimeExplainHistory.body.definitions.fullReportAvailable, true);
    assert.ok(runtimeExplainHistory.body.definitions.proofClaimCount >= 1);
    assert.ok(runtimeExplainHistory.body.definitions.blockedClaimCount >= 1);
    assert.ok(runtimeExplainHistory.body.definitions.auditLadderStepCount >= 1);
    assert.ok(runtimeExplainHistory.body.definitions.checkCount >= 1);
    assert.equal(runtimeExplainHistory.body.definitions.surfaceContractClaimAvailable, undefined);
    assert.equal(runtimeExplainHistory.body.definitions.productionDeployBlockAvailable, undefined);
    assert.equal(runtimeExplainHistory.body.definitions.manualHandoffStepAvailable, undefined);
    assert.equal(runtimeExplainHistory.body.definitions.claimFirewallCheckAvailable, undefined);
    assert.ok(runtimeExplainHistory.body.definitions.nonClaimCount >= 4);
    const latestRuntimeExplainReceipt = runtimeExplainHistory.body.receipts[0];
    assert.ok(latestRuntimeExplainReceipt);
    assert.ok(!latestRuntimeExplainReceipt.report);
    assert.ok(!("baseUrl" in latestRuntimeExplainReceipt));
    assert.ok(!("nextAction" in latestRuntimeExplainReceipt));
    assert.equal(latestRuntimeExplainReceipt.summary, undefined);
    assert.ok(latestRuntimeExplainReceipt.trendSummary.proofClaims >= 1);
    assert.ok(latestRuntimeExplainReceipt.identityHash.length >= 12);
    assert.ok(latestRuntimeExplainReceipt.receiptExplanationSummary.total >= 1);
    assert.ok(latestRuntimeExplainReceipt.proofClaimSummary.total >= 1);
    assert.ok(latestRuntimeExplainReceipt.claimFirewallSummary.blockedClaims >= 1);
    assert.ok(latestRuntimeExplainReceipt.auditLadderSummary.steps >= 1);
    assert.ok(latestRuntimeExplainReceipt.checkSummary.total >= 1);
    assert.equal(latestRuntimeExplainReceipt.receiptExplanationSummary.runtimeTruthAvailable, undefined);
    assert.equal(latestRuntimeExplainReceipt.proofClaimSummary.surfaceContractAvailable, undefined);
    assert.equal(latestRuntimeExplainReceipt.claimFirewallSummary.productionDeployIdentityAvailable, undefined);
    assert.equal(latestRuntimeExplainReceipt.auditLadderSummary.manualHandoffAvailable, undefined);
    assert.equal(latestRuntimeExplainReceipt.checkSummary.claimFirewallAvailable, undefined);
    assert.equal(Array.isArray(latestRuntimeExplainReceipt.checks), false);
    assert.equal(Array.isArray(latestRuntimeExplainReceipt.nonClaims), false);
    assert.ok(latestRuntimeExplainReceipt.nonClaimCount >= 4);
    assert.ok(runtimeExplainHistory.body.receipts.slice(1).every((receipt) => !receipt.identityHash && receipt.trendSummary?.proofClaims >= 1));
    assert.equal(runtimeExplainHistory.body.nextAction, undefined);
    assert.equal(runtimeExplainHistory.body.verificationCommand, undefined);
    assert.equal(runtimeExplainHistory.body.verificationCommandAvailable, true);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeExplainHistory.body)) < 1900);
    const fullRuntimeExplainHistory = await json("/api/runtime-explain/history?detail=full&limit=10");
    assert.equal(fullRuntimeExplainHistory.response.status, 200);
    assert.equal(fullRuntimeExplainHistory.body.detail, "full");
    assert.equal(fullRuntimeExplainHistory.body.compact, false);
    assert.equal(fullRuntimeExplainHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullRuntimeExplainHistory.body.receipts.length <= 10);
    assert.ok(fullRuntimeExplainHistory.body.receipts[0].report);
    const minimumRuntimeExplainHistory = await json("/api/runtime-explain/history?limit=0");
    assert.equal(minimumRuntimeExplainHistory.response.status, 200);
    assert.equal(minimumRuntimeExplainHistory.body.summary.limit, 1);
    assert.equal(minimumRuntimeExplainHistory.body.receipts.length, 1);

    const runtimeDeployReadiness = await json("/api/runtime-deploy-readiness");
    assert.equal(runtimeDeployReadiness.response.status, 200);
    assert.equal(runtimeDeployReadiness.body.mode, "runtime-deploy-readiness");
    assert.equal(runtimeDeployReadiness.body.detail, "summary");
    assert.equal(runtimeDeployReadiness.body.compact, true);
    assert.equal(typeof runtimeDeployReadiness.body.cachedFromReceipt, "boolean");
    assert.equal(runtimeDeployReadiness.body.generatedAt, undefined);
    assert.equal(runtimeDeployReadiness.body.checkedAt, undefined);
    assert.equal(runtimeDeployReadiness.body.refreshEndpoint, undefined);
    assert.equal(runtimeDeployReadiness.body.fullDetailEndpoint, "/api/runtime-deploy-readiness?detail=full");
    assert.equal(runtimeDeployReadiness.body.planEndpoint, undefined);
    assert.equal(runtimeDeployReadiness.body.deployReadinessPayloadPolicy.fullDetail, false);
    assert.equal(runtimeDeployReadiness.body.deployReadinessPayloadPolicy.fullDetailAvailable, undefined);
    assert.equal(runtimeDeployReadiness.body.deployReadinessPayloadPolicy.fullDetailEndpoint, undefined);
    assert.equal(runtimeDeployReadiness.body.sourceBoundaryAvailable, undefined);
    assert.equal(runtimeDeployReadiness.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(runtimeDeployReadiness.body.boundaryAvailable, undefined);
    assert.equal(runtimeDeployReadiness.body.latestReceiptAvailable, undefined);
    assert.equal(runtimeDeployReadiness.body.nextActionAvailable, undefined);
    assert.equal(runtimeDeployReadiness.body.verificationCommandAvailable, undefined);
    assert.ok(runtimeDeployReadiness.body.summary.gates >= 6);
    assert.equal(runtimeDeployReadiness.body.gates, undefined);
    assert.equal(runtimeDeployReadiness.body.gateSummary.total, runtimeDeployReadiness.body.summary.gates);
    assert.equal(runtimeDeployReadiness.body.gateSummary.passing, runtimeDeployReadiness.body.summary.passingGates);
    assert.equal(runtimeDeployReadiness.body.gateSummary.blocking, runtimeDeployReadiness.body.summary.blockingGates);
    assert.ok(runtimeDeployReadiness.body.comparisonPacket.identityHash.length >= 12);
    assert.equal(runtimeDeployReadiness.body.comparisonPacket.packetId, undefined);
    assert.equal(runtimeDeployReadiness.body.comparisonPacket.surfaceContract.privateGateDefaultStatus, 404);
    assert.equal(runtimeDeployReadiness.body.comparisonPacket.surfaceContract.privateRefreshEndpoints, 0);
    assert.equal(runtimeDeployReadiness.body.comparisonPacket.receiptsAvailable, undefined);
    assert.equal(runtimeDeployReadiness.body.handoffChecklist, undefined);
    assert.ok(runtimeDeployReadiness.body.handoffSummary.steps >= 5);
    assert.equal(runtimeDeployReadiness.body.checks, undefined);
    assert.equal(runtimeDeployReadiness.body.checkSummary.total, runtimeDeployReadiness.body.summary.checks);
    assert.equal(runtimeDeployReadiness.body.checkSummary.failing, runtimeDeployReadiness.body.summary.failing);
    assert.equal(runtimeDeployReadiness.body.nonClaims, undefined);
    assert.equal(runtimeDeployReadiness.body.nonClaimSummary.deployBoundary, true);
    assert.equal(runtimeDeployReadiness.body.nonClaimSummary.providerBoundary, true);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeDeployReadiness.body)) < 1100);
    const fullRuntimeDeployReadiness = await json("/api/runtime-deploy-readiness?detail=full");
    assert.equal(fullRuntimeDeployReadiness.response.status, 200);
    assert.equal(fullRuntimeDeployReadiness.body.detail, "full");
    assert.equal(fullRuntimeDeployReadiness.body.compact, false);
    assert.equal(fullRuntimeDeployReadiness.body.deployReadinessPayloadPolicy.fullDetail, true);
    assert.ok(fullRuntimeDeployReadiness.body.gates.every((gate) => gate.verificationCommand && gate.evidence));
    assert.ok(fullRuntimeDeployReadiness.body.handoffChecklist.every((step) => step.verificationCommand));

    const liveRuntimeDeployReadiness = await json("/api/runtime-deploy-readiness?refresh=1");
    assert.equal(liveRuntimeDeployReadiness.response.status, 200);
    assert.equal(liveRuntimeDeployReadiness.body.mode, "runtime-deploy-readiness");
    assert.equal(liveRuntimeDeployReadiness.body.cachedFromReceipt, false);
    assert.equal(liveRuntimeDeployReadiness.body.cachePolicy, "live-refresh");
    assert.equal(liveRuntimeDeployReadiness.body.detail, "summary");

    const caseInsensitiveRuntimeDeployRefresh = await json("/api/runtime-deploy-readiness?refresh=TRUE");
    assert.equal(caseInsensitiveRuntimeDeployRefresh.response.status, 200);
    assert.equal(caseInsensitiveRuntimeDeployRefresh.body.cachedFromReceipt, false);
    assert.equal(caseInsensitiveRuntimeDeployRefresh.body.compact, true);

    const runtimeDeployReadinessPlan = await json("/api/runtime-deploy-readiness/plan");
    assert.equal(runtimeDeployReadinessPlan.response.status, 200);
    assert.equal(runtimeDeployReadinessPlan.body.command, "npm run audit:runtime-deploy");

    const runtimeDeployReadinessHistory = await json("/api/runtime-deploy-readiness/history");
    assert.equal(runtimeDeployReadinessHistory.response.status, 200);
    assert.equal(runtimeDeployReadinessHistory.body.mode, "runtime-deploy-readiness-history");
    assert.equal(runtimeDeployReadinessHistory.body.detail, "summary");
    assert.equal(runtimeDeployReadinessHistory.body.compact, true);
    assert.equal(runtimeDeployReadinessHistory.body.summary.limit, 5);
    assert.equal(runtimeDeployReadinessHistory.body.fullDetailEndpoint, "/api/runtime-deploy-readiness/history?detail=full");
    assert.equal(runtimeDeployReadinessHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(runtimeDeployReadinessHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(runtimeDeployReadinessHistory.body.historyPayloadPolicy.historyRowsReturned, runtimeDeployReadinessHistory.body.receipts.length);
    assert.equal(runtimeDeployReadinessHistory.body.generatedAt, undefined);
    assert.equal(runtimeDeployReadinessHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(runtimeDeployReadinessHistory.body.summary.latestScore, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeDeployReadinessHistory.body)) < 1500);
    assert.ok(runtimeDeployReadinessHistory.body.summary.totalAvailable >= runtimeDeployReadinessHistory.body.receipts.length);
    assert.ok(runtimeDeployReadinessHistory.body.receipts.length <= 5);
    assert.ok(runtimeDeployReadinessHistory.body.definitions.gates.sentinelIds.includes("runtime-identity"));
    assert.ok(runtimeDeployReadinessHistory.body.definitions.gates.verificationCommandCount >= 1);
    assert.ok(runtimeDeployReadinessHistory.body.definitions.handoffChecklist.verificationCommandCount >= 1);
    assert.ok(runtimeDeployReadinessHistory.body.definitions.checks.sentinelIds.includes("surface-contract"));
    assert.ok(runtimeDeployReadinessHistory.body.definitions.nonClaimCount >= 4);
    assert.ok(Array.isArray(runtimeDeployReadinessHistory.body.receipts));
    const latestRuntimeDeployReadinessReceipt = runtimeDeployReadinessHistory.body.receipts[0];
    assert.ok(latestRuntimeDeployReadinessReceipt);
    assert.equal(latestRuntimeDeployReadinessReceipt.checkedAt, undefined);
    assert.ok(!latestRuntimeDeployReadinessReceipt.report);
    assert.ok(!("baseUrl" in latestRuntimeDeployReadinessReceipt));
    assert.ok(!("mode" in latestRuntimeDeployReadinessReceipt));
    assert.equal(latestRuntimeDeployReadinessReceipt.gates, undefined);
    assert.ok(latestRuntimeDeployReadinessReceipt.gateSummary.total >= 1);
    assert.ok(!("handoffChecklist" in latestRuntimeDeployReadinessReceipt));
    assert.ok(latestRuntimeDeployReadinessReceipt.handoffStepCount >= 5);
    assert.ok(!("checks" in latestRuntimeDeployReadinessReceipt));
    assert.ok(Number.isInteger(latestRuntimeDeployReadinessReceipt.checkSummary.passed));
    assert.ok(Number.isInteger(latestRuntimeDeployReadinessReceipt.checkSummary.failed));
    assert.equal(Array.isArray(latestRuntimeDeployReadinessReceipt.nonClaims), false);
    assert.ok(latestRuntimeDeployReadinessReceipt.nonClaimCount >= 4);
    assert.ok(latestRuntimeDeployReadinessReceipt.identityHash.length >= 12);
    assert.equal(runtimeDeployReadinessHistory.body.nextActionAvailable, undefined);
    assert.equal(runtimeDeployReadinessHistory.body.verificationCommandAvailable, undefined);
    assert.ok(
      runtimeDeployReadinessHistory.body.receipts
        .slice(1)
        .every(
          (receipt) =>
            receipt.trendOnly === true &&
            Number.isInteger(receipt.gates) &&
            !receipt.comparisonPacket &&
            receipt.checkedAt === undefined,
        ),
    );

    const fullRuntimeDeployReadinessHistory = await json("/api/runtime-deploy-readiness/history?detail=full&limit=10");
    assert.equal(fullRuntimeDeployReadinessHistory.response.status, 200);
    assert.equal(fullRuntimeDeployReadinessHistory.body.detail, "full");
    assert.equal(fullRuntimeDeployReadinessHistory.body.compact, false);
    assert.equal(fullRuntimeDeployReadinessHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullRuntimeDeployReadinessHistory.body.receipts.length <= 10);
    assert.ok(fullRuntimeDeployReadinessHistory.body.receipts[0].baseUrl);
    assert.ok(fullRuntimeDeployReadinessHistory.body.receipts[0].report);
    assert.ok(fullRuntimeDeployReadinessHistory.body.receipts[0].report.gates.some((gate) => gate.verificationCommand && gate.evidence));
    assert.ok(fullRuntimeDeployReadinessHistory.body.receipts[0].report.handoffChecklist.some((step) => step.verificationCommand));

    const runtimeEvidenceChain = await json("/api/runtime-evidence-chain");
    assert.equal(runtimeEvidenceChain.response.status, 200);
    assert.equal(runtimeEvidenceChain.body.mode, "runtime-evidence-chain");
    assert.equal(typeof runtimeEvidenceChain.body.cachedFromReceipt, "boolean");
    assert.equal(runtimeEvidenceChain.body.detail, "summary");
    assert.equal(runtimeEvidenceChain.body.compact, true);
    assert.equal(runtimeEvidenceChain.body.fullDetailEndpoint, "/api/runtime-evidence-chain?detail=full");
    assert.equal(runtimeEvidenceChain.body.refreshEndpoint, undefined);
    assert.equal(runtimeEvidenceChain.body.runtimeEvidenceChainPayloadPolicy.fullDetail, false);
    assert.equal(runtimeEvidenceChain.body.runtimeEvidenceChainPayloadPolicy.fullDetailEndpoint, undefined);
    assert.equal(runtimeEvidenceChain.body.runtimeEvidenceChainPayloadPolicy.fullDetailAvailable, true);
    assert.equal(runtimeEvidenceChain.body.runtimeEvidenceChainPayloadPolicy.chainLinkPreviewLimit, undefined);
    assert.equal(runtimeEvidenceChain.body.generatedAt, undefined);
    assert.equal(runtimeEvidenceChain.body.checkedAt, undefined);
    assert.equal(runtimeEvidenceChain.body.planEndpoint, undefined);
    assert.equal(runtimeEvidenceChain.body.receiptStore, undefined);
    assert.equal(runtimeEvidenceChain.body.sourceBoundary, undefined);
    assert.equal(runtimeEvidenceChain.body.sourceBoundaryAvailable, undefined);
    assert.equal(runtimeEvidenceChain.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(runtimeEvidenceChain.body.boundaryAvailable, true);
    assert.ok(runtimeEvidenceChain.body.summary.chainLinks >= 7);
    assert.ok(runtimeEvidenceChain.body.summary.parityTripwires >= 6);
    assert.equal(runtimeEvidenceChain.body.summary.blockedParityClaims, undefined);
    assert.equal(runtimeEvidenceChain.body.summary.manualParityChecks, undefined);
    assert.equal(runtimeEvidenceChain.body.summary.identityHash, undefined);
    assert.equal(runtimeEvidenceChain.body.summary.receiptKinds, undefined);
    assert.equal(runtimeEvidenceChain.body.summary.publicApiRoutes, undefined);
    assert.ok(runtimeEvidenceChain.body.custodyPacket.identityHash.length >= 12);
    assert.equal(runtimeEvidenceChain.body.custodyPacket.parityTripwireRuleAvailable, true);
    assert.equal(runtimeEvidenceChain.body.chainLinkSummary.total, runtimeEvidenceChain.body.summary.chainLinks);
    assert.ok(runtimeEvidenceChain.body.chainLinks.length <= 4);
    assert.ok(runtimeEvidenceChain.body.chainLinks.some((link) => link.id === "runtime-surface-contract" && !link.blocking));
    assert.ok(runtimeEvidenceChain.body.chainLinks.every((link) => link.endpoint && !("nonClaimAvailable" in link) && !("verificationCommandAvailable" in link)));
    assert.equal(runtimeEvidenceChain.body.parityTripwireSummary.total, runtimeEvidenceChain.body.summary.parityTripwires);
    assert.ok(runtimeEvidenceChain.body.parityTripwires.length <= 3);
    assert.ok(runtimeEvidenceChain.body.parityTripwires.some((tripwire) => tripwire.id === "cdn-dns-uptime-parity"));
    assert.ok(
      runtimeEvidenceChain.body.parityTripwires.every(
        (tripwire) => tripwire.status === "blocked-until-hosted-proof" && !("manualReadRequired" in tripwire) && !("forbiddenAutomationCount" in tripwire),
      ),
    );
    assert.ok(Number.isInteger(runtimeEvidenceChain.body.checkSummary.passed));
    assert.ok(runtimeEvidenceChain.body.checks.length <= 4);
    assert.ok(runtimeEvidenceChain.body.checks.some((check) => check.id === "route-manifest"));
    assert.ok(runtimeEvidenceChain.body.checks.some((check) => check.id === "surface-contract-fingerprint" && check.passed));
    assert.ok(runtimeEvidenceChain.body.checks.some((check) => check.id === "production-parity-tripwires" && check.passed));
    assert.ok(runtimeEvidenceChain.body.nonClaimCount >= 4);
    assert.equal(runtimeEvidenceChain.body.nonClaimsAvailable, undefined);
    assert.equal(runtimeEvidenceChain.body.nonClaims, undefined);
    assert.equal(runtimeEvidenceChain.body.repairActionSummary.ids, undefined);
    assert.equal(runtimeEvidenceChain.body.nextAction, undefined);
    assert.equal(runtimeEvidenceChain.body.verificationCommand, undefined);
    assert.equal(runtimeEvidenceChain.body.nextActionAvailable, true);
    assert.equal(runtimeEvidenceChain.body.verificationCommandAvailable, true);
    assert.equal(runtimeEvidenceChain.body.latestReceipt, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeEvidenceChain.body)) < 1900);

    const fullRuntimeEvidenceChain = await json("/api/runtime-evidence-chain?detail=full");
    assert.equal(fullRuntimeEvidenceChain.response.status, 200);
    assert.equal(fullRuntimeEvidenceChain.body.detail, "full");
    assert.equal(fullRuntimeEvidenceChain.body.compact, false);
    assert.equal(fullRuntimeEvidenceChain.body.runtimeEvidenceChainPayloadPolicy.fullDetail, true);
    assert.ok(fullRuntimeEvidenceChain.body.chainLinks.every((link) => link.endpoint && link.nonClaim && link.verificationCommand));
    assert.ok(fullRuntimeEvidenceChain.body.parityTripwires.every((tripwire) => tripwire.replacementClaim && tripwire.forbiddenAutomation.includes("private-cockpit-read")));
    assert.ok(fullRuntimeEvidenceChain.body.checks.every((check) => check.repairAction && check.verificationCommand));

    const caseInsensitiveRuntimeEvidenceRefresh = await json("/api/runtime-evidence-chain?refresh=TRUE");
    assert.equal(caseInsensitiveRuntimeEvidenceRefresh.response.status, 200);
    assert.equal(caseInsensitiveRuntimeEvidenceRefresh.body.cachedFromReceipt, false);
    assert.equal(caseInsensitiveRuntimeEvidenceRefresh.body.detail, "summary");

    const liveRuntimeEvidenceChain = await json("/api/runtime-evidence-chain?refresh=1");
    assert.equal(liveRuntimeEvidenceChain.response.status, 200);
    assert.equal(liveRuntimeEvidenceChain.body.cachedFromReceipt, false);
    assert.equal(liveRuntimeEvidenceChain.body.cachePolicy, "live-refresh");
    assert.equal(liveRuntimeEvidenceChain.body.compact, true);

    const runtimeEvidenceChainPlan = await json("/api/runtime-evidence-chain/plan");
    assert.equal(runtimeEvidenceChainPlan.response.status, 200);
    assert.equal(runtimeEvidenceChainPlan.body.command, "npm run audit:runtime-chain");

    const runtimeEvidenceChainHistory = await json("/api/runtime-evidence-chain/history");
    assert.equal(runtimeEvidenceChainHistory.response.status, 200);
    assert.equal(runtimeEvidenceChainHistory.body.mode, "runtime-evidence-chain-history");
    assert.equal(runtimeEvidenceChainHistory.body.detail, "summary");
    assert.equal(runtimeEvidenceChainHistory.body.compact, true);
    assert.equal(runtimeEvidenceChainHistory.body.fullDetailEndpoint, "/api/runtime-evidence-chain/history?detail=full");
    assert.equal(runtimeEvidenceChainHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(runtimeEvidenceChainHistory.body.sourceBoundary, undefined);
    assert.equal(runtimeEvidenceChainHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(runtimeEvidenceChainHistory.body.sideEffectBoundary, undefined);
    assert.equal(runtimeEvidenceChainHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(runtimeEvidenceChainHistory.body.nextAction, undefined);
    assert.equal(runtimeEvidenceChainHistory.body.nextActionAvailable, undefined);
    assert.equal(runtimeEvidenceChainHistory.body.verificationCommand, undefined);
    assert.equal(runtimeEvidenceChainHistory.body.verificationCommandAvailable, undefined);
    assert.equal(runtimeEvidenceChainHistory.body.historyPayloadPolicy.fullDetailAvailable, undefined);
    assert.equal(runtimeEvidenceChainHistory.body.historyPayloadPolicy.historyRowsReturned, runtimeEvidenceChainHistory.body.receipts.length);
    assert.equal(runtimeEvidenceChainHistory.body.generatedAt, undefined);
    assert.equal(runtimeEvidenceChainHistory.body.definitions, undefined);
    assert.ok(runtimeEvidenceChainHistory.body.summary.totalAvailable >= runtimeEvidenceChainHistory.body.receipts.length);
    assert.equal(runtimeEvidenceChainHistory.body.summary.limit, 5);
    assert.ok(runtimeEvidenceChainHistory.body.receipts.length <= 1);
    assert.ok(Array.isArray(runtimeEvidenceChainHistory.body.receipts));
    const latestRuntimeEvidenceChainReceipt = runtimeEvidenceChainHistory.body.receipts[0];
    assert.ok(latestRuntimeEvidenceChainReceipt);
    assert.ok(!latestRuntimeEvidenceChainReceipt.report);
    assert.ok(!("mode" in latestRuntimeEvidenceChainReceipt));
    assert.ok(!("baseUrl" in latestRuntimeEvidenceChainReceipt));
    assert.equal(latestRuntimeEvidenceChainReceipt.checkedAt, undefined);
    assert.ok(!("nextAction" in latestRuntimeEvidenceChainReceipt));
    assert.ok(!("volatileHash" in latestRuntimeEvidenceChainReceipt.custodyPacket));
    assert.ok(!("receiptIds" in latestRuntimeEvidenceChainReceipt.custodyPacket));
    assert.ok(latestRuntimeEvidenceChainReceipt.custodyPacket.identityHash.length >= 12);
    assert.ok(latestRuntimeEvidenceChainReceipt.chainLinks.some((link) => link.id === "runtime-surface-contract"));
    assert.ok(latestRuntimeEvidenceChainReceipt.parityTripwires.some((tripwire) => tripwire.id === "cdn-dns-uptime-parity"));
    assert.ok(latestRuntimeEvidenceChainReceipt.chainLinks.every((link) => !("receiptId" in link) && !("blocking" in link)));
    assert.ok(latestRuntimeEvidenceChainReceipt.parityTripwires.every((tripwire) => !("status" in tripwire)));
    assert.ok(!("receiptMatrix" in latestRuntimeEvidenceChainReceipt));
    assert.ok(!("checks" in latestRuntimeEvidenceChainReceipt));
    assert.ok(Number.isInteger(latestRuntimeEvidenceChainReceipt.checkSummary.passed));
    assert.ok(Number.isInteger(latestRuntimeEvidenceChainReceipt.chainLinkSummary.total));
    assert.equal(Array.isArray(latestRuntimeEvidenceChainReceipt.nonClaims), false);
    assert.ok(latestRuntimeEvidenceChainReceipt.nonClaimCount >= 4);
    assert.ok(Buffer.byteLength(JSON.stringify(runtimeEvidenceChainHistory.body)) < 900);
    const fullRuntimeEvidenceChainHistory = await json("/api/runtime-evidence-chain/history?detail=full&limit=10");
    assert.equal(fullRuntimeEvidenceChainHistory.response.status, 200);
    assert.equal(fullRuntimeEvidenceChainHistory.body.detail, "full");
    assert.equal(fullRuntimeEvidenceChainHistory.body.compact, false);
    assert.equal(fullRuntimeEvidenceChainHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullRuntimeEvidenceChainHistory.body.receipts.length <= 10);
    assert.ok(fullRuntimeEvidenceChainHistory.body.receipts.every((receipt) => receipt.mode === "runtime-evidence-chain-receipt"));
    const runtimeEvidenceChainMinimumHistory = await json("/api/runtime-evidence-chain/history?limit=0");
    assert.equal(runtimeEvidenceChainMinimumHistory.response.status, 200);
    assert.equal(runtimeEvidenceChainMinimumHistory.body.summary.limit, 1);
    assert.ok(runtimeEvidenceChainMinimumHistory.body.receipts.length <= 1);

    const designStability = await json("/api/design-stability");
    assert.equal(designStability.response.status, 200);
    assert.equal(designStability.body.mode, "command-center-design-stability");
    assert.equal(typeof designStability.body.cachedFromReceipt, "boolean");
    assert.equal(designStability.body.generatedAt, undefined);
    assert.equal(designStability.body.checkedAt, undefined);
    assert.equal(designStability.body.cachePolicy, undefined);
    assert.equal(designStability.body.refreshEndpoint, "/api/design-stability?refresh=1");
    assert.equal(designStability.body.detail, "summary");
    assert.equal(designStability.body.compact, true);
    assert.equal(designStability.body.fullDetailEndpoint, "/api/design-stability?detail=full");
    assert.equal(designStability.body.designStabilityPayloadPolicy.fullDetail, false);
    assert.equal(designStability.body.designStabilityPayloadPolicy.fullDetailAvailable, true);
    assert.ok(designStability.body.summary.terminalShortcuts >= 13);
    assert.ok(designStability.body.summary.proofRibbonActions >= 4);
    assert.ok(designStability.body.summary.stabilityMatrixItems >= 7);
    assert.equal(designStability.body.summary.stabilityMatrixPassing, designStability.body.summary.stabilityMatrixItems);
    assert.ok(designStability.body.summary.responsiveFallbacks >= 5);
    assert.ok(designStability.body.summary.keyboardSafeSurfaces >= 6);
    assert.ok(designStability.body.checks.some((check) => check.id === "dense-shortcut-geometry"));
    assert.ok(designStability.body.checks.some((check) => check.id === "proof-ribbon-actionability" && check.passed));
    assert.ok(designStability.body.checks.some((check) => check.id === "control-stability-matrix" && check.passed));
    assert.ok(designStability.body.denseControls.some((control) => control.id === "proof-ribbon-action-buttons" && control.passed));
    assert.ok(designStability.body.denseControls.some((control) => control.id === "visible-design-shortcut"));
    assert.ok(designStability.body.controlStabilityMatrix.some((surface) => surface.id === "artifact-filter-controls" && surface.passed));
    assert.ok(designStability.body.controlStabilityMatrix.every((surface) => !("verificationCommandAvailable" in surface)));
    assert.ok(designStability.body.denseControls.every((control) => !("verificationCommandAvailable" in control)));
    assert.ok(!("verificationCommandAvailable" in designStability.body.keyboardContract));
    assert.equal(designStability.body.plan, undefined);
    assert.equal(designStability.body.designStabilityPayloadPolicy.verificationCommandsAvailable, undefined);
    assert.ok(designStability.body.nonClaims.some((item) => /visitor behavior|analytics/i.test(item)));
    assert.equal(designStability.body.nextActionAvailable, undefined);
    assert.equal(designStability.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(designStability.body)) < 1700);
    const fullDesignStability = await json("/api/design-stability?detail=full");
    assert.equal(fullDesignStability.response.status, 200);
    assert.equal(fullDesignStability.body.detail, "full");
    assert.equal(fullDesignStability.body.compact, false);
    assert.equal(fullDesignStability.body.designStabilityPayloadPolicy.fullDetail, true);
    assert.ok(fullDesignStability.body.controlStabilityMatrix.every((surface) => surface.verificationCommand));
    assert.ok(fullDesignStability.body.keyboardContract.verificationCommand);

    const designStabilityRefresh = await json("/api/design-stability?refresh=1");
    assert.equal(designStabilityRefresh.response.status, 200);
    assert.equal(designStabilityRefresh.body.cachedFromReceipt, false);
    assert.equal(designStabilityRefresh.body.cachePolicy, "live-refresh");

    const caseInsensitiveDesignStabilityRefresh = await json("/api/design-stability?refresh=TRUE");
    assert.equal(caseInsensitiveDesignStabilityRefresh.response.status, 200);
    assert.equal(caseInsensitiveDesignStabilityRefresh.body.cachedFromReceipt, false);

    const designStabilityPlan = await json("/api/design-stability/plan");
    assert.equal(designStabilityPlan.response.status, 200);
    assert.equal(designStabilityPlan.body.command, "npm run audit:design-stability");

    const designStabilityHistory = await json("/api/design-stability/history");
    assert.equal(designStabilityHistory.response.status, 200);
    assert.equal(designStabilityHistory.body.mode, "command-center-design-stability-history");
    assert.equal(designStabilityHistory.body.detail, "summary");
    assert.equal(designStabilityHistory.body.compact, true);
    assert.equal(designStabilityHistory.body.generatedAt, undefined);
    assert.equal(designStabilityHistory.body.summary.limit, 5);
    assert.equal(designStabilityHistory.body.fullDetailEndpoint, "/api/design-stability/history?detail=full");
    assert.ok(designStabilityHistory.body.summary.totalAvailable >= designStabilityHistory.body.receipts.length);
    assert.equal(designStabilityHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(designStabilityHistory.body.historyPayloadPolicy.olderReceiptPreview, undefined);
    assert.equal(designStabilityHistory.body.definitions, undefined);
    assert.ok(Array.isArray(designStabilityHistory.body.receipts));
    const latestDesignStabilityReceipt = designStabilityHistory.body.receipts[0];
    assert.ok(latestDesignStabilityReceipt);
    assert.ok(!latestDesignStabilityReceipt.report);
    assert.ok(latestDesignStabilityReceipt.denseControlPreview.some((control) => control.id === "proof-ribbon-action-buttons"));
    assert.ok(latestDesignStabilityReceipt.controlSurfacePreview.some((surface) => surface.id === "artifact-filter-controls"));
    assert.ok(latestDesignStabilityReceipt.checkPreview.length <= 3);
    assert.ok(latestDesignStabilityReceipt.denseControlPreview.length <= 2);
    assert.ok(latestDesignStabilityReceipt.controlSurfacePreview.length <= 2);
    assert.ok(latestDesignStabilityReceipt.checkPreview.every((check) => !("verificationCommand" in check) && !("severity" in check)));
    assert.equal(latestDesignStabilityReceipt.checkSummary, undefined);
    assert.equal(typeof latestDesignStabilityReceipt.summary.passing, "number");
    assert.ok(Number.isInteger(latestDesignStabilityReceipt.nonClaimCount));
    assert.equal(latestDesignStabilityReceipt.checkedAt, undefined);
    assert.equal(latestDesignStabilityReceipt.denseControlSummary, undefined);
    assert.equal(latestDesignStabilityReceipt.controlStabilitySummary, undefined);
    assert.equal(designStabilityHistory.body.nextActionAvailable, undefined);
    assert.equal(designStabilityHistory.body.verificationCommandAvailable, undefined);
    assert.ok(designStabilityHistory.body.receipts.slice(1).every((receipt) => receipt.latestReceiptPreviewOnly === true && receipt.denseControlPreview === undefined));
    assert.ok(Buffer.byteLength(JSON.stringify(designStabilityHistory.body)) < 1700);
    const fullDesignStabilityHistory = await json("/api/design-stability/history?detail=full&limit=10");
    assert.equal(fullDesignStabilityHistory.response.status, 200);
    assert.equal(fullDesignStabilityHistory.body.detail, "full");
    assert.equal(fullDesignStabilityHistory.body.compact, false);
    assert.ok(fullDesignStabilityHistory.body.receipts[0].baseUrl);
    assert.ok(fullDesignStabilityHistory.body.receipts[0].checks.some((check) => check.verificationCommand));

    const keyboardReadiness = await json("/api/keyboard-readiness");
    assert.equal(keyboardReadiness.response.status, 200);
    assert.equal(keyboardReadiness.body.mode, "command-center-keyboard-readiness");
    assert.equal(typeof keyboardReadiness.body.cachedFromReceipt, "boolean");
    assert.equal(keyboardReadiness.body.detail, "summary");
    assert.equal(keyboardReadiness.body.compact, true);
    assert.equal(keyboardReadiness.body.fullDetailEndpoint, "/api/keyboard-readiness?detail=full");
    assert.equal(keyboardReadiness.body.keyboardReadinessPayloadPolicy.fullDetail, false);
    assert.equal(keyboardReadiness.body.keyboardReadinessPayloadPolicy.checksReturned, undefined);
    assert.equal(keyboardReadiness.body.generatedAt, undefined);
    assert.equal(keyboardReadiness.body.checkedAt, undefined);
    assert.equal(keyboardReadiness.body.refreshEndpoint, undefined);
    assert.ok(keyboardReadiness.body.summary.skipLinks >= 5);
    assert.ok(keyboardReadiness.body.summary.globalShortcuts >= 3);
    assert.ok(keyboardReadiness.body.summary.proofRibbonActions >= 4);
    assert.ok(keyboardReadiness.body.checkCount >= 9);
    assert.ok(keyboardReadiness.body.checks.some((check) => check.id === "global-keyboard-shortcuts"));
    assert.ok(keyboardReadiness.body.checks.some((check) => check.id === "proof-ribbon-actions" && check.passed));
    assert.ok(keyboardReadiness.body.keyboardMap.some((item) => item.id === "proof-ribbon-actions" && item.passed));
    assert.ok(keyboardReadiness.body.keyboardMap.some((item) => item.id === "global-terminal-shortcut"));
    assert.equal(keyboardReadiness.body.privacyBoundaryAvailable, true);
    assert.equal(keyboardReadiness.body.nonClaims, undefined);
    assert.deepEqual(Object.keys(keyboardReadiness.body.mobileContract).sort(), ["passed"]);
    assert.deepEqual(Object.keys(keyboardReadiness.body.uncertaintyPreservation).sort(), ["passed"]);
    assert.ok(keyboardReadiness.body.checks.every((check) => !("detail" in check) && !("repairAction" in check) && !("verificationCommand" in check)));
    assert.ok(keyboardReadiness.body.keyboardMap.every((item) => !("target" in item) && !("targetAvailable" in item) && !("verificationCommand" in item)));
    assert.ok(Buffer.byteLength(JSON.stringify(keyboardReadiness.body)) < 2100);

    const fullKeyboardReadiness = await json("/api/keyboard-readiness?detail=full");
    assert.equal(fullKeyboardReadiness.response.status, 200);
    assert.equal(fullKeyboardReadiness.body.detail, "full");
    assert.equal(fullKeyboardReadiness.body.compact, false);
    assert.equal(fullKeyboardReadiness.body.keyboardReadinessPayloadPolicy.fullDetail, true);
    assert.ok(fullKeyboardReadiness.body.checks.every((check) => check.detail && check.verificationCommand));
    assert.ok(fullKeyboardReadiness.body.keyboardMap.every((item) => item.target && item.verificationCommand));

    const keyboardReadinessRefresh = await json("/api/keyboard-readiness?refresh=1");
    assert.equal(keyboardReadinessRefresh.response.status, 200);
    assert.equal(keyboardReadinessRefresh.body.cachedFromReceipt, false);
    assert.equal(keyboardReadinessRefresh.body.cachePolicy, "live-refresh");

    const keyboardReadinessPlan = await json("/api/keyboard-readiness/plan");
    assert.equal(keyboardReadinessPlan.response.status, 200);
    assert.equal(keyboardReadinessPlan.body.command, "npm run audit:keyboard-readiness");

    const keyboardReadinessHistory = await json("/api/keyboard-readiness/history");
    assert.equal(keyboardReadinessHistory.response.status, 200);
    assert.equal(keyboardReadinessHistory.body.mode, "command-center-keyboard-readiness-history");
    assert.ok(Array.isArray(keyboardReadinessHistory.body.receipts));
    assert.equal(keyboardReadinessHistory.body.detail, "summary");
    assert.equal(keyboardReadinessHistory.body.compact, true);
    assert.equal(keyboardReadinessHistory.body.summary.limit, 5);
    assert.equal(keyboardReadinessHistory.body.fullDetailEndpoint, "/api/keyboard-readiness/history?detail=full");
    assert.equal(keyboardReadinessHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(keyboardReadinessHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.ok(keyboardReadinessHistory.body.summary.totalAvailable >= keyboardReadinessHistory.body.receipts.length);
    assert.ok(Buffer.byteLength(JSON.stringify(keyboardReadinessHistory.body)) < 1400);
    assert.equal(keyboardReadinessHistory.body.generatedAt, undefined);
    assert.equal(keyboardReadinessHistory.body.receiptStore, undefined);
    assert.equal(keyboardReadinessHistory.body.receiptStoreAvailable, true);
    assert.equal(keyboardReadinessHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(keyboardReadinessHistory.body.definitions.sentinels.hasGlobalKeyboardShortcuts, true);
    assert.equal(keyboardReadinessHistory.body.definitions.sentinels.hasProofRibbonActions, true);
    assert.ok(keyboardReadinessHistory.body.definitions.counts.checks >= 9);
    assert.ok(keyboardReadinessHistory.body.definitions.counts.keyboardMap >= 6);
    assert.equal(keyboardReadinessHistory.body.definitions.evidenceAccess.fullReportAvailable, true);
    assert.equal(keyboardReadinessHistory.body.definitions.evidenceAccess.fullHistoryAvailable, true);
    assert.ok(keyboardReadinessHistory.body.receipts.every((receipt) => receipt.checkedAt === undefined));
    const latestKeyboardReadinessReceipt = keyboardReadinessHistory.body.receipts[0];
    assert.ok(latestKeyboardReadinessReceipt);
    assert.equal(latestKeyboardReadinessReceipt.keyboardMapSummary.hasGlobalTerminalShortcut, true);
    assert.equal(latestKeyboardReadinessReceipt.checkSummary.hasGlobalKeyboardShortcuts, true);
    assert.equal(latestKeyboardReadinessReceipt.keyboardMapSummary.failing, 0);
    assert.equal(latestKeyboardReadinessReceipt.checkSummary.failing, 0);
    assert.ok(Number.isInteger(latestKeyboardReadinessReceipt.nonClaimCount));
    assert.ok(keyboardReadinessHistory.body.receipts.slice(1).every((receipt) => receipt.keyboardMap === undefined));
    const fullKeyboardReadinessHistory = await json("/api/keyboard-readiness/history?detail=full&limit=10");
    assert.equal(fullKeyboardReadinessHistory.response.status, 200);
    assert.equal(fullKeyboardReadinessHistory.body.detail, "full");
    assert.equal(fullKeyboardReadinessHistory.body.compact, false);
    assert.equal(fullKeyboardReadinessHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullKeyboardReadinessHistory.body.receipts[0].baseUrl);
    assert.ok(fullKeyboardReadinessHistory.body.receipts[0].keyboardMap.some((item) => item.verificationCommand));

    const designAmbition = await json("/api/design-ambition");
    assert.equal(designAmbition.response.status, 200);
    assert.equal(designAmbition.body.mode, "command-center-design-ambition");
    assert.equal(designAmbition.body.detail, "summary");
    assert.equal(designAmbition.body.compact, true);
    assert.equal(designAmbition.body.fullDetailEndpoint, "/api/design-ambition?detail=full");
    assert.equal(designAmbition.body.designAmbitionPayloadPolicy.fullDetail, false);
    assert.equal(designAmbition.body.sourceBoundary, undefined);
    assert.equal(designAmbition.body.generatedAt, undefined);
    assert.equal(designAmbition.body.checkedAt, undefined);
    assert.equal(designAmbition.body.refreshEndpoint, undefined);
    assert.equal(designAmbition.body.boundariesAvailable, true);
    assert.equal(designAmbition.body.planAvailable, true);
    assert.equal(designAmbition.body.designAmbitionPayloadPolicy.familyDetailAvailable, true);
    assert.equal(designAmbition.body.designAmbitionPayloadPolicy.checkDetailAvailable, true);
    assert.equal(designAmbition.body.designAmbitionPayloadPolicy.controlFamilyPreviewReturned, 3);
    assert.equal(designAmbition.body.designAmbitionPayloadPolicy.checksPreviewReturned, 3);
    assert.equal(typeof designAmbition.body.cachedFromReceipt, "boolean");
    assert.ok(designAmbition.body.summary.controlFamilies >= 6);
    assert.ok(designAmbition.body.summary.proofRibbonActions >= 4);
    assert.ok(designAmbition.body.summary.stabilityMatrixItems >= 7);
    assert.equal(designAmbition.body.summary.stabilityMatrixPassing, designAmbition.body.summary.stabilityMatrixItems);
    assert.ok(designAmbition.body.controlFamilyCount >= 6);
    assert.ok(designAmbition.body.checkCount >= 7);
    assert.ok(designAmbition.body.controlFamilies.some((family) => family.id === "proof-orientation" && family.passed));
    assert.ok(designAmbition.body.controlFamilies.some((family) => family.id === "runtime-truth-access"));
    assert.ok(designAmbition.body.controlFamilies.some((family) => family.id === "stability-matrix" && family.passed));
    assert.ok(designAmbition.body.checks.some((check) => check.id === "first-screen-proof-compression" && check.passed));
    assert.ok(designAmbition.body.checks.some((check) => check.id === "runtime-chain-visible"));
    assert.ok(designAmbition.body.checks.some((check) => check.id === "stability-matrix-visible" && check.passed));
    assert.ok(designAmbition.body.nonClaimCount >= 4);
    assert.equal(designAmbition.body.nonClaimsAvailable, true);
    assert.ok(designAmbition.body.controlFamilies.every((family) => !family.evidence && !family.verificationCommand));
    assert.ok(designAmbition.body.checks.every((check) => !check.detail && !check.verificationCommand));
    assert.ok(Buffer.byteLength(JSON.stringify(designAmbition.body)) < 1600);

    const fullDesignAmbition = await json("/api/design-ambition?detail=full");
    assert.equal(fullDesignAmbition.response.status, 200);
    assert.equal(fullDesignAmbition.body.detail, "full");
    assert.equal(fullDesignAmbition.body.compact, false);
    assert.equal(fullDesignAmbition.body.designAmbitionPayloadPolicy.fullDetail, true);
    assert.ok(fullDesignAmbition.body.controlFamilies.some((family) => /proof action/.test(family.evidence)));
    assert.ok(fullDesignAmbition.body.checks.some((check) => /actions=5/.test(check.detail)));
    assert.ok(fullDesignAmbition.body.nonClaims.some((item) => /analytics|keystrokes/i.test(item)));

    const designAmbitionRefresh = await json("/api/design-ambition?refresh=1");
    assert.equal(designAmbitionRefresh.response.status, 200);
    assert.equal(designAmbitionRefresh.body.cachedFromReceipt, false);
    assert.equal(designAmbitionRefresh.body.cachePolicy, "live-refresh");

    const caseInsensitiveDesignAmbitionRefresh = await json("/api/design-ambition?refresh=TRUE");
    assert.equal(caseInsensitiveDesignAmbitionRefresh.response.status, 200);
    assert.equal(caseInsensitiveDesignAmbitionRefresh.body.cachedFromReceipt, false);

    const designAmbitionPlan = await json("/api/design-ambition/plan");
    assert.equal(designAmbitionPlan.response.status, 200);
    assert.equal(designAmbitionPlan.body.command, "npm run audit:design-ambition");

    const designAmbitionHistory = await json("/api/design-ambition/history");
    assert.equal(designAmbitionHistory.response.status, 200);
    assert.equal(designAmbitionHistory.body.mode, "command-center-design-ambition-history");
    assert.equal(designAmbitionHistory.body.detail, "summary");
    assert.equal(designAmbitionHistory.body.compact, true);
    assert.equal(designAmbitionHistory.body.summary.limit, 5);
    assert.equal(designAmbitionHistory.body.fullDetailEndpoint, "/api/design-ambition/history?detail=full");
    assert.equal(designAmbitionHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(designAmbitionHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(designAmbitionHistory.body.historyPayloadPolicy.historyRowsReturned, designAmbitionHistory.body.receipts.length);
    assert.equal(designAmbitionHistory.body.receiptStore, undefined);
    assert.equal(designAmbitionHistory.body.generatedAt, undefined);
    assert.equal(designAmbitionHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(designAmbitionHistory.body.summary.latestScore, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(designAmbitionHistory.body)) < 2500);
    assert.ok(designAmbitionHistory.body.summary.totalAvailable >= designAmbitionHistory.body.receipts.length);
    assert.ok(designAmbitionHistory.body.definitions.controlFamilyIds.includes("proof-orientation"));
    assert.ok(designAmbitionHistory.body.definitions.checkIds.includes("first-screen-proof-compression"));
    assert.ok(designAmbitionHistory.body.definitions.counts.controlFamilies >= 6);
    assert.ok(designAmbitionHistory.body.definitions.counts.checks >= 7);
    assert.ok(Array.isArray(designAmbitionHistory.body.receipts));
    const latestDesignAmbitionReceipt = designAmbitionHistory.body.receipts[0];
    assert.ok(latestDesignAmbitionReceipt);
    assert.equal(latestDesignAmbitionReceipt.checkedAt, undefined);
    assert.ok(!latestDesignAmbitionReceipt.report);
    assert.ok(!latestDesignAmbitionReceipt.controlFamilies);
    assert.ok(!latestDesignAmbitionReceipt.checks);
    assert.ok(latestDesignAmbitionReceipt.controlFamilySummary.total >= 6);
    assert.equal(latestDesignAmbitionReceipt.controlFamilySummary.failing, 0);
    assert.ok(latestDesignAmbitionReceipt.checkSummary.total >= 7);
    assert.equal(latestDesignAmbitionReceipt.checkSummary.failing, 0);
    assert.equal(latestDesignAmbitionReceipt.baseUrlAvailable, undefined);
    assert.ok(Number.isInteger(latestDesignAmbitionReceipt.nonClaimCount));
    assert.ok(designAmbitionHistory.body.receipts.slice(1).every((receipt) => receipt.controlFamilies === undefined));
    assert.ok(designAmbitionHistory.body.receipts.slice(1).every((receipt) => receipt.checkedAt === undefined));
    const fullDesignAmbitionHistory = await json("/api/design-ambition/history?detail=full&limit=10");
    assert.equal(fullDesignAmbitionHistory.response.status, 200);
    assert.equal(fullDesignAmbitionHistory.body.detail, "full");
    assert.equal(fullDesignAmbitionHistory.body.compact, false);
    assert.equal(fullDesignAmbitionHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullDesignAmbitionHistory.body.receipts[0].baseUrl);
    assert.ok(fullDesignAmbitionHistory.body.receipts[0].controlFamilies.some((family) => family.evidence));
    assert.ok(fullDesignAmbitionHistory.body.receipts[0].checks.some((check) => check.verificationCommand));

    const evaluationIntegrity = await json("/api/evaluation/integrity");
    assert.equal(evaluationIntegrity.response.status, 200);
    assert.equal(evaluationIntegrity.body.mode, "research-grade-evaluation-integrity");
    assert.equal(typeof evaluationIntegrity.body.cachedFromReceipt, "boolean");
    assert.equal(evaluationIntegrity.body.refreshEndpoint, "/api/evaluation/integrity?refresh=1");
    assert.equal(evaluationIntegrity.body.detail, "summary");
    assert.equal(evaluationIntegrity.body.compact, true);
    assert.equal(evaluationIntegrity.body.fullDetailEndpoint, "/api/evaluation/integrity?detail=full");
    assert.equal(evaluationIntegrity.body.sourceBoundaryAvailable, true);
    assert.equal(evaluationIntegrity.body.sourceBoundary, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(evaluationIntegrity.body)) < 2500);
    assert.equal(evaluationIntegrity.body.evaluationIntegrityPayloadPolicy.fullDetail, false);
    assert.equal(evaluationIntegrity.body.evaluationIntegrityPayloadPolicy.domainsReturned, evaluationIntegrity.body.domains.length);
    assert.equal(evaluationIntegrity.body.evaluationIntegrityPayloadPolicy.checksReturned, evaluationIntegrity.body.checks.length);
    assert.ok(evaluationIntegrity.body.evaluationIntegrityPayloadPolicy.totalDomains >= evaluationIntegrity.body.summary.domains);
    assert.ok(evaluationIntegrity.body.evaluationIntegrityPayloadPolicy.totalChecks >= evaluationIntegrity.body.summary.checks);
    assert.ok(evaluationIntegrity.body.summary.domains >= 6);
    assert.ok(evaluationIntegrity.body.checks.some((check) => check.id === "truthfulness-calibration"));
    assert.ok(evaluationIntegrity.body.domains.some((domain) => domain.id === "accessibility-performance"));
    assert.ok(evaluationIntegrity.body.domains.some((domain) => domain.id === "runtime-stress"));
    assert.ok(evaluationIntegrity.body.domains.length <= 3);
    assert.ok(evaluationIntegrity.body.checks.length <= 4);
    assert.ok(evaluationIntegrity.body.domains.every((domain) => domain.verificationCommandAvailable === true && !("verificationCommand" in domain)));
    assert.ok(evaluationIntegrity.body.checks.every((check) => check.detailAvailable === true && !("detail" in check)));
    assert.ok(evaluationIntegrity.body.repeatabilityContract.forbiddenActionCount >= 4);
    assert.equal(evaluationIntegrity.body.repeatabilityContract.forbiddenActions, undefined);
    assert.equal(evaluationIntegrity.body.nextAction, undefined);
    assert.equal(evaluationIntegrity.body.verificationCommand, undefined);
    assert.equal(evaluationIntegrity.body.nextActionAvailable, true);
    assert.equal(evaluationIntegrity.body.verificationCommandAvailable, true);
    const fullEvaluationIntegrity = await json("/api/evaluation/integrity?detail=full");
    assert.equal(fullEvaluationIntegrity.response.status, 200);
    assert.equal(fullEvaluationIntegrity.body.detail, "full");
    assert.equal(fullEvaluationIntegrity.body.compact, false);
    assert.ok(fullEvaluationIntegrity.body.repeatabilityContract.forbiddenActions.includes("collect-analytics"));
    assert.ok(fullEvaluationIntegrity.body.checks.every((check) => check.detail && check.repairAction));
    assert.ok(JSON.stringify(fullEvaluationIntegrity.body).length > JSON.stringify(evaluationIntegrity.body).length);

    const evaluationIntegrityPlan = await json("/api/evaluation/integrity/plan");
    assert.equal(evaluationIntegrityPlan.response.status, 200);
    assert.equal(evaluationIntegrityPlan.body.command, "npm run audit:evaluation-integrity");

    const evaluationIntegrityHistory = await json("/api/evaluation/integrity/history");
    assert.equal(evaluationIntegrityHistory.response.status, 200);
    assert.equal(evaluationIntegrityHistory.body.mode, "research-grade-evaluation-integrity-history");
    assert.equal(evaluationIntegrityHistory.body.detail, "summary");
    assert.equal(evaluationIntegrityHistory.body.compact, true);
    assert.equal(evaluationIntegrityHistory.body.summary.limit, 5);
    assert.equal(evaluationIntegrityHistory.body.fullDetailEndpoint, "/api/evaluation/integrity/history?detail=full");
    assert.equal(evaluationIntegrityHistory.body.sourceBoundary, undefined);
    assert.equal(evaluationIntegrityHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(evaluationIntegrityHistory.body.receiptStore, undefined);
    assert.equal(evaluationIntegrityHistory.body.receiptStoreAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(evaluationIntegrityHistory.body)) < 1500);
    assert.equal(evaluationIntegrityHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(evaluationIntegrityHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(evaluationIntegrityHistory.body.historyPayloadPolicy.historyRowsReturned, evaluationIntegrityHistory.body.receipts.length);
    assert.equal(evaluationIntegrityHistory.body.definitions.fullReportAvailable, true);
    assert.equal(evaluationIntegrityHistory.body.definitions.fullHistoryAvailable, true);
    assert.ok(Array.isArray(evaluationIntegrityHistory.body.receipts));
    assert.ok(evaluationIntegrityHistory.body.receipts.length <= 5);
    const latestEvaluationIntegrityReceipt = evaluationIntegrityHistory.body.receipts[0];
    assert.ok(latestEvaluationIntegrityReceipt);
    assert.ok(!("baseUrl" in latestEvaluationIntegrityReceipt));
    assert.ok(latestEvaluationIntegrityReceipt.domains.length <= 3);
    assert.ok(latestEvaluationIntegrityReceipt.checks.length <= 4);
    assert.ok(latestEvaluationIntegrityReceipt.domains.some((domain) => domain.id === "runtime-stress"));
    assert.ok(latestEvaluationIntegrityReceipt.checks.some((check) => check.id === "truthfulness-calibration"));
    assert.ok(latestEvaluationIntegrityReceipt.domains.every((domain) => !("verificationCommand" in domain)));
    assert.ok(latestEvaluationIntegrityReceipt.checks.every((check) => !("detail" in check)));
    assert.ok(evaluationIntegrityHistory.body.receipts.slice(1).every((receipt) => !("checkedAt" in receipt)));
    assert.ok(evaluationIntegrityHistory.body.receipts.slice(1).every((receipt) => receipt.trendOnly === true && !("trendSummary" in receipt)));

    const fullEvaluationIntegrityHistory = await json("/api/evaluation/integrity/history?detail=full&limit=10");
    assert.equal(fullEvaluationIntegrityHistory.response.status, 200);
    assert.equal(fullEvaluationIntegrityHistory.body.detail, "full");
    assert.equal(fullEvaluationIntegrityHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullEvaluationIntegrityHistory.body.receipts.length <= 10);
    assert.ok(fullEvaluationIntegrityHistory.body.receipts.every((receipt) => "baseUrl" in receipt));
    assert.ok(fullEvaluationIntegrityHistory.body.receipts.every((receipt) => receipt.checks.every((check) => "detail" in check)));

    const researchRigor = await json("/api/evaluation/research-rigor");
    assert.equal(researchRigor.response.status, 200);
    assert.equal(researchRigor.body.mode, "research-grade-rigor");
    assert.equal(typeof researchRigor.body.cachedFromReceipt, "boolean");
    assert.equal(researchRigor.body.detail, "summary");
    assert.equal(researchRigor.body.compact, true);
    assert.equal(researchRigor.body.refreshEndpoint, "/api/evaluation/research-rigor?refresh=1");
    assert.equal(researchRigor.body.fullDetailEndpoint, "/api/evaluation/research-rigor?detail=full");
    assert.equal(researchRigor.body.researchRigorPayloadPolicy.fullDetail, false);
    assert.equal(researchRigor.body.researchRigorPayloadPolicy.fullDetailAvailable, true);
    assert.equal(researchRigor.body.researchRigorPayloadPolicy.previewLimits, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(researchRigor.body)) < 1500);
    assert.equal(researchRigor.body.generatedAt, undefined);
    assert.equal(researchRigor.body.checkedAt, undefined);
    assert.equal(researchRigor.body.cachePolicy, undefined);
    assert.equal(researchRigor.body.plan, undefined);
    assert.equal(researchRigor.body.researchContract, undefined);
    assert.ok(researchRigor.body.researchRigorPayloadPolicy.gradebookReturned <= 2);
    assert.ok(researchRigor.body.researchRigorPayloadPolicy.checksReturned <= 2);
    assert.ok(researchRigor.body.summary.dimensions >= 6);
    assert.ok(researchRigor.body.summary.gradebookItems >= 8);
    assert.equal(researchRigor.body.summary.passingGradebookItems, researchRigor.body.summary.gradebookItems);
    assert.equal(researchRigor.body.summary.failingGradebookItems, 0);
    assert.ok(researchRigor.body.summary.minimumGrade);
    assert.ok(researchRigor.body.dimensions.some((dimension) => dimension.id === "adversarial-stress"));
    assert.ok(researchRigor.body.dimensions.some((dimension) => dimension.id === "gradebook-calibration"));
    assert.ok(researchRigor.body.evaluationGradebook.some((item) => item.id === "proof-quality" && item.grade && item.passed));
    assert.ok(researchRigor.body.evaluationGradebook.some((item) => item.id === "runtime-evidence-chain" && item.passed));
    assert.ok(researchRigor.body.evaluationGradebook.every((item) => !("evidence" in item) && item.evidenceCount >= 2));
    assert.ok(researchRigor.body.checks.some((check) => check.id === "methodology-repeatability"));
    assert.ok(researchRigor.body.checks.some((check) => check.id === "gradebook-floor-coverage" && check.passed));
    assert.ok(researchRigor.body.checks.every((check) => !("detail" in check) && !("repairAction" in check) && !("severity" in check)));
    assert.equal(researchRigor.body.gradingRubric.passPolicyAvailable, true);
    assert.ok(researchRigor.body.nonClaims.some((item) => /live user research|peer review/i.test(item)));
    assert.equal(researchRigor.body.nonClaims.length, 1);
    assert.equal(researchRigor.body.nextActionAvailable, undefined);
    assert.equal(researchRigor.body.verificationCommandAvailable, undefined);

    const fullResearchRigor = await json("/api/evaluation/research-rigor?detail=full");
    assert.equal(fullResearchRigor.response.status, 200);
    assert.equal(fullResearchRigor.body.detail, "full");
    assert.equal(fullResearchRigor.body.compact, false);
    assert.equal(fullResearchRigor.body.researchRigorPayloadPolicy.fullDetail, true);
    assert.ok(fullResearchRigor.body.evaluationGradebook.every((item) => Array.isArray(item.evidence) && item.evidence.length >= 2));
    assert.ok(fullResearchRigor.body.checks.some((check) => check.detail && check.repairAction));
    assert.ok(fullResearchRigor.body.gradingRubric.passPolicy);

    const researchRigorPlan = await json("/api/evaluation/research-rigor/plan");
    assert.equal(researchRigorPlan.response.status, 200);
    assert.equal(researchRigorPlan.body.command, "npm run audit:research-rigor");

    const researchRigorHistory = await json("/api/evaluation/research-rigor/history");
    assert.equal(researchRigorHistory.response.status, 200);
    assert.equal(researchRigorHistory.body.mode, "research-grade-rigor-history");
    assert.equal(researchRigorHistory.body.detail, "summary");
    assert.equal(researchRigorHistory.body.compact, true);
    assert.equal(researchRigorHistory.body.summary.limit, 5);
    assert.equal(researchRigorHistory.body.fullDetailEndpoint, "/api/evaluation/research-rigor/history?detail=full");
    assert.equal(researchRigorHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(researchRigorHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(researchRigorHistory.body.historyPayloadPolicy.historyRowsReturned, researchRigorHistory.body.receipts.length);
    assert.ok(Buffer.byteLength(JSON.stringify(researchRigorHistory.body)) < 1600);
    assert.ok(!("generatedAt" in researchRigorHistory.body));
    assert.ok(!("latestCheckedAt" in researchRigorHistory.body.summary));
    assert.ok(!("fullDetailEndpoint" in researchRigorHistory.body.historyPayloadPolicy));
    assert.equal(researchRigorHistory.body.definitions.fullReportEndpoint, "/api/evaluation/research-rigor?detail=full");
    assert.equal(researchRigorHistory.body.definitions.receiptShapeAvailable, true);
    assert.ok(Array.isArray(researchRigorHistory.body.receipts));
    assert.ok(researchRigorHistory.body.receipts.length <= 5);
    assert.ok(researchRigorHistory.body.receipts.every((receipt) => !("checkedAt" in receipt)));
    const latestResearchRigorReceipt = researchRigorHistory.body.receipts[0];
    assert.ok(latestResearchRigorReceipt);
    assert.equal(typeof latestResearchRigorReceipt.score, "number");
    assert.ok(!("summary" in latestResearchRigorReceipt));
    assert.ok(Array.isArray(latestResearchRigorReceipt.dimensionPreview));
    assert.ok(Array.isArray(latestResearchRigorReceipt.gradebookPreview));
    assert.ok(Array.isArray(latestResearchRigorReceipt.checkPreview));
    assert.equal(typeof latestResearchRigorReceipt.dimensions, "number");
    assert.ok(!("evaluationGradebook" in latestResearchRigorReceipt));
    assert.ok(latestResearchRigorReceipt.checkPreview.every((check) => !("detail" in check)));
    assert.ok(researchRigorHistory.body.receipts.slice(1).every((receipt) => !("summary" in receipt) && !("dimensionPreview" in receipt)));

    const fullResearchRigorHistory = await json("/api/evaluation/research-rigor/history?detail=full&limit=10");
    assert.equal(fullResearchRigorHistory.response.status, 200);
    assert.equal(fullResearchRigorHistory.body.detail, "full");
    assert.equal(fullResearchRigorHistory.body.compact, false);
    assert.equal(fullResearchRigorHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullResearchRigorHistory.body.receipts.length <= 10);
    assert.ok(fullResearchRigorHistory.body.receipts.every((receipt) => Array.isArray(receipt.dimensions)));
    assert.ok(fullResearchRigorHistory.body.receipts.every((receipt) => Array.isArray(receipt.checks)));
    assert.ok(Array.isArray(fullResearchRigorHistory.body.receipts[0].evaluationGradebook));
    assert.ok(fullResearchRigorHistory.body.receipts.some((receipt) => Array.isArray(receipt.evaluationGradebook)));

    const evaluationSample = await json("/api/evaluation/sample");
    assert.equal(evaluationSample.response.status, 200);
    assert.equal(evaluationSample.body.mode, "research-grade-evaluation-sample");
    assert.equal(typeof evaluationSample.body.cachedFromReceipt, "boolean");
    assert.equal(evaluationSample.body.refreshEndpoint, "/api/evaluation/sample?refresh=1");
    assert.equal(evaluationSample.body.detail, "summary");
    assert.equal(evaluationSample.body.compact, true);
    assert.equal(evaluationSample.body.fullDetailEndpoint, "/api/evaluation/sample?detail=full");
    assert.equal(evaluationSample.body.evaluationSamplePayloadPolicy.fullDetail, false);
    assert.equal(evaluationSample.body.evaluationSamplePayloadPolicy.samplesReturned, evaluationSample.body.samples.length);
    assert.ok(evaluationSample.body.evaluationSamplePayloadPolicy.totalSamples >= evaluationSample.body.summary.samples);
    assert.equal(evaluationSample.body.evaluationSamplePayloadPolicy.fullDetailAvailable, undefined);
    assert.equal(evaluationSample.body.generatedAt, undefined);
    assert.equal(evaluationSample.body.checkedAt, undefined);
    assert.equal(evaluationSample.body.cachePolicy, undefined);
    assert.equal(evaluationSample.body.sourceBoundaryAvailable, undefined);
    assert.equal(evaluationSample.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(evaluationSample.body.plan, undefined);
    assert.equal(evaluationSample.body.methodology, undefined);
    assert.equal(evaluationSample.body.sampleMatrixSummary, undefined);
    assert.equal(evaluationSample.body.nextActionAvailable, undefined);
    assert.equal(evaluationSample.body.verificationCommandAvailable, undefined);
    assert.equal(Number.isInteger(evaluationSample.body.repairQueueCount), true);
    assert.ok(Buffer.byteLength(JSON.stringify(evaluationSample.body)) < 1000);
    assert.ok(evaluationSample.body.summary.samples >= 7);
    assert.ok(evaluationSample.body.samples.length <= 3);
    assert.ok(evaluationSample.body.samples.some((sample) => sample.id === "truthfulness-risk-sample"));
    assert.ok(evaluationSample.body.samples.some((sample) => sample.id === "runtime-chain-sample"));
    assert.ok(evaluationSample.body.samples.some((sample) => sample.id === "route-refresh-sample"));
    assert.ok(evaluationSample.body.samples.every((sample) => !("detail" in sample) && !("repairAction" in sample)));
    assert.ok(evaluationSample.body.samples.every((sample) => !("detailAvailable" in sample) && !("verificationCommandAvailable" in sample)));
    assert.equal(evaluationSample.body.nonClaims, undefined);
    assert.equal(evaluationSample.body.nonClaimsAvailable, true);
    assert.ok(evaluationSample.body.nonClaimCount >= 4);
    const fullEvaluationSample = await json("/api/evaluation/sample?detail=full");
    assert.equal(fullEvaluationSample.response.status, 200);
    assert.equal(fullEvaluationSample.body.detail, "full");
    assert.equal(fullEvaluationSample.body.compact, false);
    assert.equal(fullEvaluationSample.body.evaluationSamplePayloadPolicy.fullDetail, true);
    assert.ok(fullEvaluationSample.body.samples.some((sample) => sample.detail && sample.repairAction && sample.verificationCommand));

    const evaluationSamplePlan = await json("/api/evaluation/sample/plan");
    assert.equal(evaluationSamplePlan.response.status, 200);
    assert.equal(evaluationSamplePlan.body.command, "npm run sample:evaluation");

    const evaluationSampleHistory = await json("/api/evaluation/sample/history");
    assert.equal(evaluationSampleHistory.response.status, 200);
    assert.equal(evaluationSampleHistory.body.detail, "summary");
    assert.equal(evaluationSampleHistory.body.compact, true);
    assert.equal(evaluationSampleHistory.body.summary.limit, 5);
    assert.equal(evaluationSampleHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(evaluationSampleHistory.body.fullDetailEndpoint, "/api/evaluation/sample/history?detail=full");
    assert.ok(Array.isArray(evaluationSampleHistory.body.receipts));
    assert.ok(evaluationSampleHistory.body.receipts.length <= 5);
    assert.ok(Buffer.byteLength(JSON.stringify(evaluationSampleHistory.body)) < 2200);
    assert.ok(evaluationSampleHistory.body.receipts[0].samplePreview.length <= 3);
    assert.ok(!evaluationSampleHistory.body.receipts[0].samples);
    assert.ok(evaluationSampleHistory.body.receipts.slice(1).every((receipt) => receipt.latestReceiptPreviewOnly === true && !receipt.samplePreview && !receipt.samples));

    const fullEvaluationSampleHistory = await json("/api/evaluation/sample/history?detail=full&limit=10");
    assert.equal(fullEvaluationSampleHistory.response.status, 200);
    assert.equal(fullEvaluationSampleHistory.body.detail, "full");
    assert.equal(fullEvaluationSampleHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullEvaluationSampleHistory.body.receipts.length <= 10);
    assert.ok(fullEvaluationSampleHistory.body.receipts.every((receipt) => Array.isArray(receipt.samples)));

    const refreshPlan = await json("/api/evidence-refresh/plan");
    assert.equal(refreshPlan.response.status, 200);
    assert.equal(refreshPlan.body.mode, "safe-evidence-refresh-plan");
    assert.equal(refreshPlan.body.command, "npm run refresh:evidence");
    assert.ok(refreshPlan.body.endpoints.includes("/api/status"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/runtime-truth/attestation"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/evaluation/opportunity-quality"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/opportunity-board"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/opportunity-derisking"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/opportunity-ranking"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/opportunity-scorecard"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/evaluation/claim-calibration"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/evaluation/usability"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/artifact-museum"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/artifact-museum-compare"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/artifact-gaps"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/artifact-gap-repair"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/narrative-objections"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/graph-lineage"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/runtime-boundary"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/runtime-surface/latest"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/route-latency"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/runtime-reconciliation"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/runtime-diff"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/runtime-explain"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/runtime-deploy-readiness"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/design-stability"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/keyboard-readiness"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/evaluation/integrity"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/evaluation/research-stress"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/evaluation/research-rigor"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/evaluation/sample"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/narratives"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/narrative-contrast"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/narrative-tailor"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/narrative-disclosure"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/narrative-sequence"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/graph-disclosure-links"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/graph-confidence"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/graph-depth-score"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/trust-blockade"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/graph-projection-guard"));
    assert.ok(refreshPlan.body.endpoints.includes("/api/artifact-replays"));

    const refreshHistory = await json("/api/evidence-refresh/history");
    assert.equal(refreshHistory.response.status, 200);
    assert.equal(refreshHistory.body.mode, "safe-evidence-refresh-history");
    assert.equal(refreshHistory.body.detail, "summary");
    assert.equal(refreshHistory.body.compact, true);
    assert.equal(refreshHistory.body.summary.limit, 5);
    assert.equal(refreshHistory.body.fullDetailEndpoint, "/api/evidence-refresh/history?detail=full");
    assert.equal(refreshHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(refreshHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(refreshHistory.body.historyPayloadPolicy.latestSlowCheckPreviewLimit, undefined);
    assert.equal(refreshHistory.body.historyPayloadPolicy.latestSampleEndpointLimit, undefined);
    assert.equal(refreshHistory.body.historyPayloadPolicy.historyRowsReturned, refreshHistory.body.receipts.length);
    assert.equal(refreshHistory.body.generatedAt, undefined);
    assert.equal(refreshHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(refreshHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(refreshHistory.body.receiptStoreAvailable, undefined);
    assert.ok(!refreshHistory.body.receiptStore);
    assert.ok(Buffer.byteLength(JSON.stringify(refreshHistory.body)) < 1500);
    assert.ok(refreshHistory.body.summary.totalAvailable >= refreshHistory.body.receipts.length);
    assert.ok(Array.isArray(refreshHistory.body.receipts));
    assert.ok(refreshHistory.body.receipts.every((receipt) => !receipt.checks));
    assert.ok(refreshHistory.body.receipts.every((receipt) => receipt.coverageDigest));
    assert.ok(!refreshHistory.body.receipts[0].baseUrl);
    assert.ok(refreshHistory.body.receipts[0].slowChecks.length <= 2);
    assert.ok(refreshHistory.body.receipts[0].sampleEndpoints.length <= 2);
    assert.ok(refreshHistory.body.receipts.slice(1).every((receipt) => receipt.slowChecks === undefined));
    assert.ok(refreshHistory.body.receipts.slice(1).every((receipt) => receipt.trendOnly === true));
    const fullRefreshHistory = await json("/api/evidence-refresh/history?detail=full&limit=10");
    assert.equal(fullRefreshHistory.response.status, 200);
    assert.equal(fullRefreshHistory.body.detail, "full");
    assert.equal(fullRefreshHistory.body.compact, false);
    assert.equal(fullRefreshHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.equal(fullRefreshHistory.body.receiptStore, "var/evidence-refresh-receipts.json");
    assert.ok(Array.isArray(fullRefreshHistory.body.receipts[0].checks));

    const researchStressPlan = await json("/api/evaluation/research-stress/plan");
    assert.equal(researchStressPlan.response.status, 200);
    assert.equal(researchStressPlan.body.mode, "research-grade-evaluation-stress-plan");
    assert.equal(researchStressPlan.body.command, "npm run stress:evaluation");
    assert.equal(researchStressPlan.body.endpoint, "/api/evaluation/research-stress");
    assert.ok(researchStressPlan.body.scenarios.includes("first-screen proof action pressure"));

    const researchStressHistory = await json("/api/evaluation/research-stress/history");
    assert.equal(researchStressHistory.response.status, 200);
    assert.equal(researchStressHistory.body.mode, "research-grade-evaluation-stress-history");
    assert.equal(researchStressHistory.body.detail, "summary");
    assert.equal(researchStressHistory.body.compact, true);
    assert.equal(researchStressHistory.body.summary.limit, 5);
    assert.equal(researchStressHistory.body.fullDetailEndpoint, "/api/evaluation/research-stress/history?detail=full");
    assert.equal(researchStressHistory.body.generatedAt, undefined);
    assert.equal(researchStressHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.ok(researchStressHistory.body.summary.totalAvailable >= researchStressHistory.body.receipts.length);
    assert.equal(researchStressHistory.body.summary.latestScenarios, undefined);
    assert.ok(Array.isArray(researchStressHistory.body.receipts));
    assert.ok(researchStressHistory.body.receipts.every((receipt) => !receipt.report));
    assert.ok(researchStressHistory.body.definitions.scenarios.verificationCommandCount >= 1);
    assert.ok(researchStressHistory.body.definitions.scenarios.sentinelIds.includes("runtime-drift-pressure"));
    if (researchStressHistory.body.receipts.length > 0) {
      assert.ok(Array.isArray(researchStressHistory.body.receipts[0].scenarioPreview));
      assert.ok(researchStressHistory.body.receipts[0].scenarioPreview.length <= 4);
      assert.ok(researchStressHistory.body.receipts[0].scenarioPreview.some((scenario) => scenario.id === "runtime-drift-pressure"));
      assert.ok(researchStressHistory.body.receipts[0].scenarioPreview.every((scenario) => !("verificationCommand" in scenario)));
      assert.equal(researchStressHistory.body.receipts[0].scenarios, undefined);
      assert.ok(researchStressHistory.body.receipts.slice(1).every((receipt) => receipt.scenarioPreview === undefined));
      assert.ok(researchStressHistory.body.receipts[0].scenarioSummary);
      assert.ok(researchStressHistory.body.receipts.slice(1).every((receipt) => receipt.trendOnly === true && Number.isInteger(receipt.scenarios)));
      assert.ok(researchStressHistory.body.receipts.every((receipt) => Number.isInteger(receipt.limitationCount)));
    }
    assert.equal(researchStressHistory.body.nextActionAvailable, undefined);
    assert.equal(researchStressHistory.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(researchStressHistory.body)) < 1500);
    const fullResearchStressHistory = await json("/api/evaluation/research-stress/history?detail=full&limit=10");
    assert.equal(fullResearchStressHistory.response.status, 200);
    assert.equal(fullResearchStressHistory.body.detail, "full");
    assert.equal(fullResearchStressHistory.body.compact, false);
    assert.equal(fullResearchStressHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullResearchStressHistory.body.receipts[0].scenarios.some((scenario) => scenario.verificationCommand));

    const narrativeGroundingPlan = await json("/api/narratives/plan");
    assert.equal(narrativeGroundingPlan.response.status, 200);
    assert.equal(narrativeGroundingPlan.body.mode, "evidence-narrative-grounding-plan");
    assert.equal(narrativeGroundingPlan.body.command, "npm run ground:narratives");
    assert.equal(narrativeGroundingPlan.body.endpoint, "/api/narratives");

    const narrativeGroundingHistory = await json("/api/narratives/history");
    assert.equal(narrativeGroundingHistory.response.status, 200);
    assert.equal(narrativeGroundingHistory.body.mode, "evidence-narrative-grounding-history");
    assert.equal(narrativeGroundingHistory.body.detail, "summary");
    assert.equal(narrativeGroundingHistory.body.compact, true);
    assert.equal(narrativeGroundingHistory.body.summary.limit, 5);
    assert.equal(narrativeGroundingHistory.body.generatedAt, undefined);
    assert.equal(narrativeGroundingHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(narrativeGroundingHistory.body.fullDetailEndpoint, "/api/narratives/history?detail=full");
    assert.equal(narrativeGroundingHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(narrativeGroundingHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(narrativeGroundingHistory.body.historyPayloadPolicy.receiptsReturned, narrativeGroundingHistory.body.receipts.length);
    assert.equal(narrativeGroundingHistory.body.definitions.evidenceAccess.fullReportEndpoint, "/api/narratives?detail=full");
    assert.equal(narrativeGroundingHistory.body.definitions.evidenceAccess.fullHistoryEndpoint, "/api/narratives/history?detail=full");
    assert.ok(Array.isArray(narrativeGroundingHistory.body.receipts));
    assert.ok(narrativeGroundingHistory.body.receipts.every((receipt) => !("baseUrl" in receipt)));
    assert.ok(narrativeGroundingHistory.body.receipts.every((receipt) => !("mode" in receipt)));
    assert.ok(narrativeGroundingHistory.body.receipts.every((receipt) => !("checkedAt" in receipt)));
    assert.ok(narrativeGroundingHistory.body.receipts[0].audiences.every((audience) => Number.isInteger(audience.groundingScore)));
    assert.equal(narrativeGroundingHistory.body.receipts[0].checks, undefined);
    assert.equal(narrativeGroundingHistory.body.receipts[0].checkSummary.failed.length, 0);
    assert.ok(narrativeGroundingHistory.body.receipts.slice(1).every((receipt) => receipt.previewOnly === true));
    assert.ok(narrativeGroundingHistory.body.receipts.slice(1).every((receipt) => !("checks" in receipt)));
    assert.ok(Buffer.byteLength(JSON.stringify(narrativeGroundingHistory.body)) < 1500);
    const fullNarrativeGroundingHistory = await json("/api/narratives/history?detail=full&limit=10");
    assert.equal(fullNarrativeGroundingHistory.response.status, 200);
    assert.equal(fullNarrativeGroundingHistory.body.detail, "full");
    assert.equal(fullNarrativeGroundingHistory.body.compact, false);
    assert.ok(typeof fullNarrativeGroundingHistory.body.generatedAt === "string");
    assert.equal(fullNarrativeGroundingHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullNarrativeGroundingHistory.body.receipts.some((receipt) => receipt.mode === "evidence-narrative-grounding-receipt"));

    const narrativeTailorPlan = await json("/api/narrative-tailor/plan");
    assert.equal(narrativeTailorPlan.response.status, 200);
    assert.equal(narrativeTailorPlan.body.mode, "evidence-backed-narrative-tailor-plan");
    assert.equal(narrativeTailorPlan.body.command, "npm run tailor:narratives");
    assert.equal(narrativeTailorPlan.body.endpoint, "/api/narrative-tailor");

    const narrativeTailorHistory = await json("/api/narrative-tailor/history");
    assert.equal(narrativeTailorHistory.response.status, 200);
    assert.equal(narrativeTailorHistory.body.mode, "evidence-backed-narrative-tailor-history");
    assert.equal(narrativeTailorHistory.body.detail, "summary");
    assert.equal(narrativeTailorHistory.body.compact, true);
    assert.equal(narrativeTailorHistory.body.summary.limit, 5);
    assert.equal(narrativeTailorHistory.body.fullDetailEndpoint, "/api/narrative-tailor/history?detail=full");
    assert.equal(narrativeTailorHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(narrativeTailorHistory.body.generatedAt, undefined);
    assert.equal(narrativeTailorHistory.body.nextActionAvailable, undefined);
    assert.equal(narrativeTailorHistory.body.verificationCommandAvailable, undefined);
    assert.ok(!("nextAction" in narrativeTailorHistory.body));
    assert.ok(!("verificationCommand" in narrativeTailorHistory.body));
    assert.ok(narrativeTailorHistory.body.summary.totalAvailable >= narrativeTailorHistory.body.receipts.length);
    assert.ok(narrativeTailorHistory.body.receipts.length <= 5);
    assert.equal(narrativeTailorHistory.body.definitions.evidenceAccess.fullHistoryEndpoint, "/api/narrative-tailor/history?detail=full");
    assert.ok(Number.isInteger(narrativeTailorHistory.body.definitions.reportCheckSummary.total));
    assert.ok(narrativeTailorHistory.body.definitions.reportCheckSummary.failing >= 0);
    assert.ok(!("audienceChecks" in narrativeTailorHistory.body.definitions));
    assert.equal(narrativeTailorHistory.body.definitions.variantKindSummary.hasProofFirst, true);
    assert.ok(Array.isArray(narrativeTailorHistory.body.receipts));
    const latestNarrativeTailorReceipt = narrativeTailorHistory.body.receipts[0];
    assert.ok(latestNarrativeTailorReceipt);
    assert.ok(!latestNarrativeTailorReceipt.report);
    assert.ok(!("mode" in latestNarrativeTailorReceipt));
    assert.ok(!("checks" in latestNarrativeTailorReceipt));
    assert.ok(latestNarrativeTailorReceipt.audiences.some((audience) => audience.id === "recruiter"));
    assert.ok(latestNarrativeTailorReceipt.audiences.every((audience) => audience.variantCount >= 3));
    assert.ok(latestNarrativeTailorReceipt.audiences.every((audience) => audience.variants.length <= 1));
    assert.ok(latestNarrativeTailorReceipt.audiences.every((audience) => Number.isInteger(audience.omittedVariants)));
    assert.ok(latestNarrativeTailorReceipt.audiences.every((audience) => audience.variants.every((variant) => !("body" in variant))));
    assert.ok(latestNarrativeTailorReceipt.audiences.every((audience) => Number.isInteger(audience.manualReadinessGate.repairPlanCount)));
    assert.equal(latestNarrativeTailorReceipt.audienceSummary.total, latestNarrativeTailorReceipt.audiences.length);
    assert.ok(Number.isInteger(latestNarrativeTailorReceipt.checkSummary.passed));
    assert.ok(Number.isInteger(latestNarrativeTailorReceipt.repairQueueSummary.total));
    assert.ok(narrativeTailorHistory.body.receipts.slice(1).every((receipt) => receipt.previewOnly === true && !("audiences" in receipt)));
    assert.ok(Buffer.byteLength(JSON.stringify(narrativeTailorHistory.body)) < 1500);
    const fullNarrativeTailorHistory = await json("/api/narrative-tailor/history?detail=full&limit=10");
    assert.equal(fullNarrativeTailorHistory.response.status, 200);
    assert.equal(fullNarrativeTailorHistory.body.detail, "full");
    assert.equal(fullNarrativeTailorHistory.body.compact, false);
    assert.equal(fullNarrativeTailorHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullNarrativeTailorHistory.body.receipts.length <= 10);
    assert.ok(fullNarrativeTailorHistory.body.receipts.every((receipt) => receipt.mode === "evidence-backed-narrative-tailor-receipt"));
    assert.ok(
      fullNarrativeTailorHistory.body.receipts[0].audiences.every(
        (audience) => Array.isArray(audience.variants) && audience.variants.every((variant) => variant.body),
      ),
    );
    const clampedNarrativeTailorHistory = await json("/api/narrative-tailor/history?limit=0");
    assert.equal(clampedNarrativeTailorHistory.response.status, 200);
    assert.equal(clampedNarrativeTailorHistory.body.summary.limit, 1);

    const narrativeDisclosurePlan = await json("/api/narrative-disclosure/plan");
    assert.equal(narrativeDisclosurePlan.response.status, 200);
    assert.equal(narrativeDisclosurePlan.body.mode, "evidence-narrative-disclosure-plan");
    assert.equal(narrativeDisclosurePlan.body.command, "npm run disclose:narratives");
    assert.equal(narrativeDisclosurePlan.body.endpoint, "/api/narrative-disclosure");

    const narrativeDisclosureHistory = await json("/api/narrative-disclosure/history");
    assert.equal(narrativeDisclosureHistory.response.status, 200);
    assert.equal(narrativeDisclosureHistory.body.mode, "evidence-narrative-disclosure-history");
    assert.equal(narrativeDisclosureHistory.body.detail, "summary");
    assert.equal(narrativeDisclosureHistory.body.compact, true);
    assert.ok(Array.isArray(narrativeDisclosureHistory.body.receipts));
    assert.equal(narrativeDisclosureHistory.body.summary.limit, 5);
    assert.equal(narrativeDisclosureHistory.body.fullDetailEndpoint, "/api/narrative-disclosure/history?detail=full");
    assert.equal(narrativeDisclosureHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(narrativeDisclosureHistory.body.historyPayloadPolicy.fullDetailAvailable, undefined);
    assert.equal(narrativeDisclosureHistory.body.historyPayloadPolicy.returnedReceipts, narrativeDisclosureHistory.body.receipts.length);
    assert.ok(Buffer.byteLength(JSON.stringify(narrativeDisclosureHistory.body)) < 2500);
    assert.ok(narrativeDisclosureHistory.body.summary.totalAvailable >= narrativeDisclosureHistory.body.receipts.length);
    assert.equal(narrativeDisclosureHistory.body.generatedAt, undefined);
    assert.equal(narrativeDisclosureHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(narrativeDisclosureHistory.body.summary.latestScore, undefined);
    assert.equal(narrativeDisclosureHistory.body.definitions, undefined);
    const latestNarrativeDisclosureReceipt = narrativeDisclosureHistory.body.receipts[0];
    assert.ok(latestNarrativeDisclosureReceipt);
    assert.ok(!("baseUrl" in latestNarrativeDisclosureReceipt));
    assert.ok(!("checks" in latestNarrativeDisclosureReceipt));
    assert.equal(latestNarrativeDisclosureReceipt.bundleSummary, undefined);
    assert.equal(latestNarrativeDisclosureReceipt.checkSummary, undefined);
    assert.ok(latestNarrativeDisclosureReceipt.bundles.some((bundle) => bundle.id === "recruiter" && bundle.mustDiscloseCount >= 3));
    assert.ok(latestNarrativeDisclosureReceipt.bundles.every((bundle) => !("mustDisclose" in bundle)));
    assert.ok(latestNarrativeDisclosureReceipt.bundles.every((bundle) => !("repairGuidance" in bundle)));
    assert.ok(latestNarrativeDisclosureReceipt.bundles.every((bundle) => !("thesis" in bundle)));
    assert.ok(latestNarrativeDisclosureReceipt.bundles.every((bundle) => Number.isInteger(bundle.claimCount)));
    assert.ok(latestNarrativeDisclosureReceipt.bundles.every((bundle) => !("checks" in bundle) && bundle.checkSummary === undefined));
    assert.equal(narrativeDisclosureHistory.body.nextActionAvailable, undefined);
    assert.equal(narrativeDisclosureHistory.body.verificationCommandAvailable, undefined);
    assert.ok(narrativeDisclosureHistory.body.receipts.slice(1).every((receipt) => receipt.latestReceiptPreviewOnly === undefined && receipt.checkedAt === undefined && receipt.bundles === undefined && Number.isInteger(receipt.trendSummary?.score)));
    const fullNarrativeDisclosureHistory = await json("/api/narrative-disclosure/history?detail=full&limit=10");
    assert.equal(fullNarrativeDisclosureHistory.response.status, 200);
    assert.equal(fullNarrativeDisclosureHistory.body.detail, "full");
    assert.equal(fullNarrativeDisclosureHistory.body.compact, false);
    assert.equal(fullNarrativeDisclosureHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullNarrativeDisclosureHistory.body.receipts.length <= 10);
    assert.ok(fullNarrativeDisclosureHistory.body.receipts[0].baseUrl);
    assert.ok(fullNarrativeDisclosureHistory.body.receipts[0].mode);
    assert.ok(fullNarrativeDisclosureHistory.body.receipts[0].bundles.every((bundle) => Array.isArray(bundle.mustDisclose)));
    const minimumNarrativeDisclosureHistory = await json("/api/narrative-disclosure/history?limit=0");
    assert.equal(minimumNarrativeDisclosureHistory.response.status, 200);
    assert.equal(minimumNarrativeDisclosureHistory.body.summary.limit, 1);
    assert.equal(minimumNarrativeDisclosureHistory.body.receipts.length, 1);

    const narrativeSequencePlan = await json("/api/narrative-sequence/plan");
    assert.equal(narrativeSequencePlan.response.status, 200);
    assert.equal(narrativeSequencePlan.body.mode, "evidence-narrative-sequence-plan");
    assert.equal(narrativeSequencePlan.body.command, "npm run sequence:narratives");
    assert.equal(narrativeSequencePlan.body.endpoint, "/api/narrative-sequence");

    const narrativeSequenceHistory = await json("/api/narrative-sequence/history");
    assert.equal(narrativeSequenceHistory.response.status, 200);
    assert.equal(narrativeSequenceHistory.body.mode, "evidence-narrative-sequence-history");
    assert.equal(narrativeSequenceHistory.body.detail, "summary");
    assert.equal(narrativeSequenceHistory.body.compact, true);
    assert.equal(narrativeSequenceHistory.body.summary.limit, 5);
    assert.equal(narrativeSequenceHistory.body.fullDetailEndpoint, "/api/narrative-sequence/history?detail=full");
    assert.equal(narrativeSequenceHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(narrativeSequenceHistory.body.historyPayloadPolicy.olderReceiptPreview, undefined);
    assert.equal(narrativeSequenceHistory.body.historyPayloadPolicy.historyRowsReturned, narrativeSequenceHistory.body.receipts.length);
    assert.equal(narrativeSequenceHistory.body.generatedAt, undefined);
    assert.equal(narrativeSequenceHistory.body.definitions, undefined);
    assert.equal(narrativeSequenceHistory.body.summary.latestCheckedAt, undefined);
    assert.ok(narrativeSequenceHistory.body.summary.totalAvailable >= narrativeSequenceHistory.body.receipts.length);
    assert.ok(Array.isArray(narrativeSequenceHistory.body.receipts));
    assert.ok(narrativeSequenceHistory.body.receipts.length <= 5);
    assert.ok(narrativeSequenceHistory.body.receipts.every((receipt) => !receipt.report));
    const latestNarrativeSequenceReceipt = narrativeSequenceHistory.body.receipts[0];
    assert.ok(latestNarrativeSequenceReceipt.sequences.some((sequence) => sequence.id === "recruiter"));
    assert.ok(latestNarrativeSequenceReceipt.sequences.every((sequence) => sequence.beatCount >= 7));
    assert.ok(latestNarrativeSequenceReceipt.sequences.every((sequence) => !sequence.beatPreview));
    assert.ok(latestNarrativeSequenceReceipt.sequences.every((sequence) => sequence.evidenceReferenceCount >= sequence.beatCount));
    assert.ok(latestNarrativeSequenceReceipt.sequences.every((sequence) => sequence.beatStageCount === undefined));
    assert.equal(latestNarrativeSequenceReceipt.checkPreview, undefined);
    assert.equal(latestNarrativeSequenceReceipt.nonClaimCount, undefined);
    assert.ok(narrativeSequenceHistory.body.receipts.slice(1).every((receipt) => receipt.latestReceiptPreviewOnly === undefined && !("sequences" in receipt)));
    assert.ok(narrativeSequenceHistory.body.receipts.slice(1).every((receipt) => Number.isInteger(receipt.trendSummary.totalBeats)));
    assert.equal(narrativeSequenceHistory.body.nextAction, undefined);
    assert.equal(narrativeSequenceHistory.body.verificationCommand, undefined);
    assert.equal(narrativeSequenceHistory.body.verificationCommandAvailable, undefined);

    const fullNarrativeSequenceHistory = await json("/api/narrative-sequence/history?detail=full&limit=10");
    assert.equal(fullNarrativeSequenceHistory.response.status, 200);
    assert.equal(fullNarrativeSequenceHistory.body.detail, "full");
    assert.equal(fullNarrativeSequenceHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullNarrativeSequenceHistory.body.receipts.length <= 10);
    assert.ok(fullNarrativeSequenceHistory.body.receipts.every((receipt) => receipt.report || receipt.sequences));

    const graphDisclosureLinksPlan = await json("/api/graph-disclosure-links/plan");
    assert.equal(graphDisclosureLinksPlan.response.status, 200);
    assert.equal(graphDisclosureLinksPlan.body.mode, "evidence-graph-disclosure-links-plan");
    assert.equal(graphDisclosureLinksPlan.body.command, "npm run audit:graph-disclosures");
    assert.equal(graphDisclosureLinksPlan.body.endpoint, "/api/graph-disclosure-links");

    const graphDisclosureLinksHistory = await json("/api/graph-disclosure-links/history");
    assert.equal(graphDisclosureLinksHistory.response.status, 200);
    assert.equal(graphDisclosureLinksHistory.body.mode, "evidence-graph-disclosure-links-history");
    assert.equal(graphDisclosureLinksHistory.body.detail, "summary");
    assert.equal(graphDisclosureLinksHistory.body.compact, true);
    assert.equal(graphDisclosureLinksHistory.body.summary.limit, 3);
    assert.equal(graphDisclosureLinksHistory.body.fullDetailEndpoint, "/api/graph-disclosure-links/history?detail=full");
    assert.equal(graphDisclosureLinksHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(graphDisclosureLinksHistory.body.historyPayloadPolicy.olderReceiptPreview, undefined);
    assert.equal(graphDisclosureLinksHistory.body.generatedAt, undefined);
    assert.equal(graphDisclosureLinksHistory.body.receiptStore, undefined);
    assert.equal(graphDisclosureLinksHistory.body.nextActionAvailable, undefined);
    assert.equal(graphDisclosureLinksHistory.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(graphDisclosureLinksHistory.body)) < 1400);
    assert.ok(Array.isArray(graphDisclosureLinksHistory.body.receipts));
    assert.ok(graphDisclosureLinksHistory.body.receipts.length <= 3);
    if (graphDisclosureLinksHistory.body.receipts.length > 0) {
      const receipt = graphDisclosureLinksHistory.body.receipts[0];
      assert.ok(!("mode" in receipt));
      assert.equal(typeof receipt.relationships, "number");
      assert.equal(receipt.checkPreview, undefined);
      assert.ok(Array.isArray(receipt.relationshipPreview));
      assert.ok(receipt.relationshipPreview.every((relationship) => relationship.confidenceBasis === undefined));
      assert.ok(receipt.relationshipPreview.every((relationship) => relationship.verificationCommand === undefined));
      assert.ok(Number.isInteger(receipt.passedChecks));
    }
    if (graphDisclosureLinksHistory.body.receipts.length > 1) {
      assert.equal(graphDisclosureLinksHistory.body.receipts[1].relationshipPreview, undefined);
      assert.equal(graphDisclosureLinksHistory.body.receipts[1].trendOnly, true);
      assert.equal(typeof graphDisclosureLinksHistory.body.receipts[1].relationships, "number");
    }
    const fullGraphDisclosureLinksHistory = await json("/api/graph-disclosure-links/history?detail=full&limit=10");
    assert.equal(fullGraphDisclosureLinksHistory.response.status, 200);
    assert.equal(fullGraphDisclosureLinksHistory.body.detail, "full");
    assert.equal(fullGraphDisclosureLinksHistory.body.compact, false);
    assert.equal(fullGraphDisclosureLinksHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullGraphDisclosureLinksHistory.body.receipts.length <= 10);
    if (fullGraphDisclosureLinksHistory.body.receipts.length > 0) {
      assert.equal(fullGraphDisclosureLinksHistory.body.receipts[0].mode, "evidence-graph-disclosure-links-receipt");
      assert.ok(Array.isArray(fullGraphDisclosureLinksHistory.body.receipts[0].relationships));
    }
    const graphDisclosureLinksMinimumHistory = await json("/api/graph-disclosure-links/history?limit=0");
    assert.equal(graphDisclosureLinksMinimumHistory.response.status, 200);
    assert.equal(graphDisclosureLinksMinimumHistory.body.summary.limit, 1);
    assert.ok(graphDisclosureLinksMinimumHistory.body.receipts.length <= 1);

    const graphConfidencePlan = await json("/api/graph-confidence/plan");
    assert.equal(graphConfidencePlan.response.status, 200);
    assert.equal(graphConfidencePlan.body.mode, "evidence-graph-confidence-plan");
    assert.equal(graphConfidencePlan.body.command, "npm run audit:graph-confidence");
    assert.equal(graphConfidencePlan.body.endpoint, "/api/graph-confidence");

    const graphConfidenceHistory = await json("/api/graph-confidence/history");
    assert.equal(graphConfidenceHistory.response.status, 200);
    assert.equal(graphConfidenceHistory.body.mode, "evidence-graph-confidence-history");
    assert.equal(graphConfidenceHistory.body.detail, "summary");
    assert.equal(graphConfidenceHistory.body.compact, true);
    assert.equal(graphConfidenceHistory.body.fullDetailEndpoint, "/api/graph-confidence/history?detail=full");
    assert.equal(graphConfidenceHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(graphConfidenceHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(graphConfidenceHistory.body.historyPayloadPolicy.historyRowsReturned, graphConfidenceHistory.body.receipts.length);
    assert.equal(graphConfidenceHistory.body.generatedAt, undefined);
    assert.equal(graphConfidenceHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(graphConfidenceHistory.body.summary.latestScore, undefined);
    assert.ok(graphConfidenceHistory.body.summary.limit <= 5);
    assert.equal(graphConfidenceHistory.body.definitions.fullReportAvailable, true);
    assert.equal(graphConfidenceHistory.body.definitions.fullHistoryAvailable, true);
    assert.equal(graphConfidenceHistory.body.definitions.fullReportEndpoint, undefined);
    assert.ok(Array.isArray(graphConfidenceHistory.body.receipts));
    if (graphConfidenceHistory.body.receipts.length > 0) {
      assert.ok(!("mode" in graphConfidenceHistory.body.receipts[0]));
      assert.equal(graphConfidenceHistory.body.receipts[0].checkedAt, undefined);
      assert.equal(graphConfidenceHistory.body.receipts[0].summary, undefined);
      assert.ok(Number.isInteger(graphConfidenceHistory.body.receipts[0].score));
      assert.ok(Number.isInteger(graphConfidenceHistory.body.receipts[0].relationshipCount));
      assert.ok(Array.isArray(graphConfidenceHistory.body.receipts[0].relationshipPreview));
      assert.ok(graphConfidenceHistory.body.receipts[0].relationshipPreview.length <= 1);
      assert.ok(graphConfidenceHistory.body.receipts[0].relationshipPreview.every((relationship) => !relationship.id && Number.isInteger(relationship.score)));
      assert.equal(graphConfidenceHistory.body.receipts[0].relationships, undefined);
      assert.equal(graphConfidenceHistory.body.receipts[0].checkPreview, undefined);
      assert.ok(Number.isInteger(graphConfidenceHistory.body.receipts[0].checkSummary.passed));
      assert.ok(Number.isInteger(graphConfidenceHistory.body.receipts[0].checkSummary.failed));
    }
    if (graphConfidenceHistory.body.receipts.length > 1) {
      assert.equal(graphConfidenceHistory.body.receipts[1].relationshipPreview, undefined);
      assert.equal(graphConfidenceHistory.body.receipts[1].trendOnly, true);
      assert.equal(graphConfidenceHistory.body.receipts[1].checkedAt, undefined);
      assert.equal(typeof graphConfidenceHistory.body.receipts[1].relationshipCount, "number");
    }
    assert.equal(graphConfidenceHistory.body.nextActionAvailable, undefined);
    assert.equal(graphConfidenceHistory.body.verificationCommandAvailable, undefined);
    const fullGraphConfidenceHistory = await json("/api/graph-confidence/history?detail=full&limit=20");
    assert.equal(fullGraphConfidenceHistory.response.status, 200);
    assert.equal(fullGraphConfidenceHistory.body.detail, "full");
    assert.equal(fullGraphConfidenceHistory.body.compact, false);
    assert.equal(fullGraphConfidenceHistory.body.historyPayloadPolicy.fullDetail, true);
    if (fullGraphConfidenceHistory.body.receipts.length > 0) {
      assert.ok(Array.isArray(fullGraphConfidenceHistory.body.receipts[0].relationships));
      assert.ok(Array.isArray(fullGraphConfidenceHistory.body.receipts[0].checks));
    }

    const graphDepthPlan = await json("/api/graph-depth-score/plan");
    assert.equal(graphDepthPlan.response.status, 200);
    assert.equal(graphDepthPlan.body.mode, "evidence-graph-depth-score-plan");
    assert.equal(graphDepthPlan.body.command, "npm run audit:graph-depth");
    assert.equal(graphDepthPlan.body.endpoint, "/api/graph-depth-score");

    const graphDepthHistory = await json("/api/graph-depth-score/history");
    assert.equal(graphDepthHistory.response.status, 200);
    assert.equal(graphDepthHistory.body.mode, "evidence-graph-depth-score-history");
    assert.equal(graphDepthHistory.body.detail, "summary");
    assert.equal(graphDepthHistory.body.compact, true);
    assert.equal(graphDepthHistory.body.summary.limit, 5);
    assert.equal(graphDepthHistory.body.fullDetailEndpoint, "/api/graph-depth-score/history?detail=full");
    assert.equal(graphDepthHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(graphDepthHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(graphDepthHistory.body.historyPayloadPolicy.historyRowsReturned, graphDepthHistory.body.receipts.length);
    assert.equal(graphDepthHistory.body.receiptStore, undefined);
    assert.equal(graphDepthHistory.body.generatedAt, undefined);
    assert.equal(graphDepthHistory.body.summary.latestCheckedAt, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(graphDepthHistory.body)) < 2500);
    assert.ok(Array.isArray(graphDepthHistory.body.receipts));
    if (graphDepthHistory.body.receipts.length > 0) {
      assert.equal(graphDepthHistory.body.receipts[0].checkedAt, undefined);
      assert.ok(Array.isArray(graphDepthHistory.body.receipts[0].lanePreview));
      assert.ok(graphDepthHistory.body.receipts[0].lanePreview.length <= 3);
      assert.ok(graphDepthHistory.body.receipts[0].depthSummaryPreview.length <= 2);
      assert.ok(Number.isInteger(graphDepthHistory.body.receipts[0].laneSummary.total));
      assert.ok(Number.isInteger(graphDepthHistory.body.receipts[0].checkSummary.passed));
      assert.ok(Array.isArray(graphDepthHistory.body.receipts[0].checkSummary.failed));
      assert.equal(graphDepthHistory.body.receipts[0].checks, undefined);
    }
    if (graphDepthHistory.body.receipts.length > 1) {
      assert.equal(graphDepthHistory.body.receipts[1].checkedAt, undefined);
      assert.equal(graphDepthHistory.body.receipts[1].lanePreview, undefined);
      assert.equal(graphDepthHistory.body.receipts[1].depthSummaryPreview, undefined);
      assert.equal(graphDepthHistory.body.receipts[1].latestReceiptPreviewOnly, true);
      assert.equal(typeof graphDepthHistory.body.receipts[1].depthSummary.total, "number");
    }
    const fullGraphDepthHistory = await json("/api/graph-depth-score/history?detail=full&limit=10");
    assert.equal(fullGraphDepthHistory.response.status, 200);
    assert.equal(fullGraphDepthHistory.body.detail, "full");
    assert.equal(fullGraphDepthHistory.body.compact, false);
    assert.ok(fullGraphDepthHistory.body.receipts[0].checks);

    const accessibilityPlan = await json("/api/accessibility-audit/plan");
    assert.equal(accessibilityPlan.response.status, 200);
    assert.equal(accessibilityPlan.body.mode, "scripted-accessibility-audit-plan");
    assert.equal(accessibilityPlan.body.command, "npm run audit:a11y");
    assert.ok(accessibilityPlan.body.checks.includes("image alt text"));

    const accessibilityHistory = await json("/api/accessibility-audit/history");
    assert.equal(accessibilityHistory.response.status, 200);
    assert.equal(accessibilityHistory.body.mode, "scripted-accessibility-audit-history");
    assert.equal(accessibilityHistory.body.detail, "summary");
    assert.equal(accessibilityHistory.body.compact, true);
    assert.equal(accessibilityHistory.body.fullDetailEndpoint, "/api/accessibility-audit/history?detail=full");
    assert.equal(accessibilityHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(accessibilityHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(accessibilityHistory.body.historyPayloadPolicy.latestCheckPreviewLimit, 3);
    assert.equal(accessibilityHistory.body.historyPayloadPolicy.historyRowsReturned, accessibilityHistory.body.reports.length);
    assert.equal(accessibilityHistory.body.sourceBoundaryAvailable, true);
    assert.equal(accessibilityHistory.body.sideEffectBoundaryAvailable, true);
    assert.equal(accessibilityHistory.body.reportStoreAvailable, true);
    assert.ok(!accessibilityHistory.body.reportStore);
    assert.ok(Buffer.byteLength(JSON.stringify(accessibilityHistory.body)) < 2500);
    assert.ok(Array.isArray(accessibilityHistory.body.reports));
    if (accessibilityHistory.body.reports.length > 0) {
      assert.ok(Array.isArray(accessibilityHistory.body.reports[0].checkPreview));
      assert.ok(accessibilityHistory.body.reports[0].checkPreview.length <= 3);
      assert.ok(accessibilityHistory.body.reports[0].checkPreview.every((check) => !check.detail && check.detailAvailable === true));
      assert.equal(accessibilityHistory.body.reports[0].checks, undefined);
      assert.equal(accessibilityHistory.body.reports[0].scope, undefined);
      assert.equal(accessibilityHistory.body.reports[0].limitation, undefined);
    }
    if (accessibilityHistory.body.reports.length > 1) {
      assert.equal(accessibilityHistory.body.reports[1].checkPreview, undefined);
      assert.equal(accessibilityHistory.body.reports[1].latestReportPreviewOnly, true);
    }
    const fullAccessibilityHistory = await json("/api/accessibility-audit/history?detail=full&limit=10");
    assert.equal(fullAccessibilityHistory.response.status, 200);
    assert.equal(fullAccessibilityHistory.body.detail, "full");
    assert.equal(fullAccessibilityHistory.body.compact, false);
    assert.equal(fullAccessibilityHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.equal(fullAccessibilityHistory.body.reportStore, "var/accessibility-audit-reports.json");
    if (fullAccessibilityHistory.body.reports.length > 0) {
      assert.ok(Array.isArray(fullAccessibilityHistory.body.reports[0].checks));
      assert.ok(fullAccessibilityHistory.body.reports[0].checks.some((check) => check.detail));
    }

    const performancePlan = await json("/api/performance-budget/plan");
    assert.equal(performancePlan.response.status, 200);
    assert.equal(performancePlan.body.mode, "local-performance-budget-plan");
    assert.equal(performancePlan.body.command, "npm run audit:performance");
    assert.ok(performancePlan.body.budgets.some((budget) => budget.id === "home-load"));

    const performanceHistory = await json("/api/performance-budget/history");
    assert.equal(performanceHistory.response.status, 200);
    assert.ok(Array.isArray(performanceHistory.body.reports));

    const visualPlan = await json("/api/visual-regression/plan");
    assert.equal(visualPlan.response.status, 200);
    assert.equal(visualPlan.body.mode, "visual-regression-plan");
    assert.equal(visualPlan.body.command, "npm run audit:visual");
    assert.ok(visualPlan.body.snapshots.some((snapshot) => snapshot.id === "desktop-qagent-case"));

    const visualHistory = await json("/api/visual-regression/history");
    assert.equal(visualHistory.response.status, 200);
    assert.equal(visualHistory.body.mode, "visual-regression-history");
    assert.equal(visualHistory.body.detail, "summary");
    assert.equal(visualHistory.body.compact, true);
    assert.equal(visualHistory.body.sourceBoundary, undefined);
    assert.equal(visualHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(visualHistory.body.sideEffectBoundary, undefined);
    assert.equal(visualHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(visualHistory.body.reportStore, undefined);
    assert.equal(visualHistory.body.reportStoreAvailable, undefined);
    assert.equal(visualHistory.body.summary.limit, 5);
    assert.equal(visualHistory.body.generatedAt, undefined);
    assert.equal(visualHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(visualHistory.body.fullDetailEndpoint, "/api/visual-regression/history?detail=full");
    assert.equal(visualHistory.body.historyPayloadPolicy.fullDetailAvailable, undefined);
    assert.equal(visualHistory.body.historyPayloadPolicy.reportsReturned, visualHistory.body.reports.length);
    assert.equal(visualHistory.body.historyPayloadPolicy.olderReportPreview, undefined);
    assert.equal(visualHistory.body.definitionsAvailable, undefined);
    assert.equal(visualHistory.body.omittedDetailAvailable, undefined);
    assert.ok(Array.isArray(visualHistory.body.reports));
    assert.ok(visualHistory.body.reports.length <= 1);
    assert.ok(visualHistory.body.reports.every((report) => !report.checks));
    assert.ok(visualHistory.body.reports.every((report) => !report.checkedAt && !report.summary));
    if (visualHistory.body.reports.length > 0) {
      assert.ok(visualHistory.body.reports[0].checkPreview);
      assert.ok(visualHistory.body.reports[0].checkPreview.length <= 2);
      assert.ok(visualHistory.body.reports[0].checkPreview.every((check) => !("screenshotPath" in check)));
      assert.ok(visualHistory.body.reports[0].checkPreview.every((check) => !("selector" in check)));
      assert.ok(Number.isInteger(visualHistory.body.reports[0].checkSummary.passing));
      assert.equal(visualHistory.body.reports[0].checkSummary.comparisons, undefined);
      assert.ok(Number.isInteger(visualHistory.body.reports[0].checkCount));
    }
    if (visualHistory.body.reports.length > 1) {
      assert.equal(visualHistory.body.reports[1].checkPreview, undefined);
      assert.equal(visualHistory.body.reports[1].latestReportPreviewOnly, true);
      assert.equal(typeof visualHistory.body.reports[1].checkSummary.total, "number");
    }
    assert.equal(visualHistory.body.verificationCommand, undefined);
    assert.equal(visualHistory.body.verificationCommandAvailable, undefined);
    assert.equal(visualHistory.body.nextActionAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(visualHistory.body)) < 900);

    const fullVisualHistory = await json("/api/visual-regression/history?detail=full&limit=10");
    assert.equal(fullVisualHistory.response.status, 200);
    assert.equal(fullVisualHistory.body.detail, "full");
    assert.equal(fullVisualHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(typeof fullVisualHistory.body.generatedAt === "string");
    assert.equal(typeof fullVisualHistory.body.sourceBoundary, "string");
    assert.equal(typeof fullVisualHistory.body.sideEffectBoundary, "string");
    assert.equal(fullVisualHistory.body.reportStore, "var/visual-regression-reports.json");
    assert.ok(fullVisualHistory.body.reports.length <= 10);
    assert.ok(fullVisualHistory.body.reports.every((report) => Array.isArray(report.checks)));

    const proofTrials = await json("/api/proof-trials");
    assert.equal(proofTrials.response.status, 200);
    assert.equal(proofTrials.body.mode, "safe-live-proof-trials");
    assert.equal(proofTrials.body.detail, "proof-trial-index");
    assert.equal(proofTrials.body.compact, true);
    assert.equal(proofTrials.body.fullDetailEndpoint, "/api/proof-trials/:slug?detail=full");
    assert.equal(proofTrials.body.fullCatalogEndpoint, "/api/proof-trials?detail=full");
    assert.equal(proofTrials.body.trialPayloadPolicy.detailEndpointTemplate, "/api/proof-trials/:slug");
    assert.equal(proofTrials.body.trialPayloadPolicy.fullDetail, false);
    assert.equal(proofTrials.body.trialPayloadPolicy.fullDetailAvailable, true);
    assert.equal(proofTrials.body.trialPayloadPolicy.compactCheckFields, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(proofTrials.body)) < 1600);
    assert.equal(proofTrials.body.generatedAt, undefined);
    assert.equal(proofTrials.body.sourceBoundary, undefined);
    assert.equal(proofTrials.body.plan, undefined);
    assert.equal(proofTrials.body.summary.score, 100);
    assert.equal(proofTrials.body.summary.writeEnabledTrials, 0);
    assert.equal(proofTrials.body.summary.sandboxLocks, proofTrials.body.summary.totalTrials);
    assert.equal(proofTrials.body.summary.readOnlySandboxLocks, proofTrials.body.summary.sandboxLocks);
    assert.equal(proofTrials.body.summary.credentialsEnabled, false);
    assert.equal(proofTrials.body.summary.externalWritesEnabled, false);
    assert.ok(proofTrials.body.checks.every((check) => check.passed));
    assert.equal(proofTrials.body.sandboxFirewall.mode, "read-only-proof-trial-sandbox-firewall");
    assert.equal(proofTrials.body.sandboxFirewall.credentialCapability, false);
    assert.equal(proofTrials.body.sandboxFirewall.externalWriteCapability, false);
    assert.ok(proofTrials.body.sandboxFirewall.blockedExternalActionCount >= 8);
    assert.equal(proofTrials.body.sandboxFirewall.blockedExternalActions, undefined);
    assert.equal(proofTrials.body.sandboxFirewall.summary, undefined);
    assert.equal(proofTrials.body.sandboxFirewall.lockSummary.locks, proofTrials.body.summary.totalTrials);
    assert.equal(proofTrials.body.sandboxFirewall.lockSummary.readOnlyLocks, proofTrials.body.summary.totalTrials);
    assert.equal(proofTrials.body.sandboxFirewall.lockSummary.credentialsForbidden, true);
    assert.equal(proofTrials.body.sandboxFirewall.lockSummary.externalWritesDisabled, true);
    assert.equal(proofTrials.body.sandboxFirewall.lockSummaries, undefined);
    assert.equal(proofTrials.body.sandboxFirewall.locks, undefined);
    assert.ok(proofTrials.body.guardrailCount >= 4);
    assert.equal(proofTrials.body.guardrails, undefined);
    assert.equal(proofTrials.body.guardrailsAvailable, undefined);
    assert.equal(proofTrials.body.executionBoundaryAvailable, true);
    assert.ok(proofTrials.body.checks.every((check) => !("detail" in check) && !("verificationCommand" in check)));
    assert.ok(proofTrials.body.trials.length <= proofTrials.body.trialPayloadPolicy.trialPreviewLimit);
    assert.equal(proofTrials.body.trialPayloadPolicy.trialsReturned, proofTrials.body.trials.length);
    assert.equal(proofTrials.body.trialPayloadPolicy.totalTrials, proofTrials.body.summary.totalTrials);
    assert.ok(proofTrials.body.trials.some((trial) => trial.slug === "qagent"));
    assert.ok(proofTrials.body.trials.every((trial) => trial.detailAvailable === true));
    assert.ok(proofTrials.body.trials.every((trial) => typeof trial.sandbox.approvalGateRequired === "boolean"));
    assert.ok(proofTrials.body.trials.every((trial) => !("detailEndpoint" in trial)));
    assert.ok(proofTrials.body.trials.every((trial) => !("readOnly" in trial.sandbox) && !("credentialsForbidden" in trial.sandbox) && !("externalWritesDisabled" in trial.sandbox)));
    assert.ok(proofTrials.body.trials.every((trial) => !("steps" in trial) && !("assertions" in trial) && !("artifacts" in trial)));
    assert.ok(proofTrials.body.trials.every((trial) => !("id" in trial) && !("mode" in trial) && !("verificationCommand" in trial) && !("publicSurface" in trial)));

    const fullProofTrials = await json("/api/proof-trials?detail=full");
    assert.equal(fullProofTrials.response.status, 200);
    assert.equal(fullProofTrials.body.detail, "full");
    assert.equal(fullProofTrials.body.compact, false);
    assert.ok(fullProofTrials.body.trials.some((trial) => trial.steps.length && trial.assertions.length && trial.artifacts));
    assert.ok(fullProofTrials.body.checks.some((check) => check.detail && check.verificationCommand));

    const proofTrialsPlanRoute = await json("/api/proof-trials/plan");
    assert.equal(proofTrialsPlanRoute.response.status, 200);
    assert.equal(proofTrialsPlanRoute.body.command, "npm run trial:proofs");
    const proofTrialsHistory = await json("/api/proof-trials/history");
    assert.equal(proofTrialsHistory.response.status, 200);
    assert.equal(proofTrialsHistory.body.mode, "safe-live-proof-trials-history");
    assert.equal(proofTrialsHistory.body.detail, "summary");
    assert.equal(proofTrialsHistory.body.compact, true);
    assert.equal(proofTrialsHistory.body.generatedAt, undefined);
    assert.equal(proofTrialsHistory.body.receiptStore, undefined);
    assert.equal(proofTrialsHistory.body.fullDetailEndpoint, "/api/proof-trials/history?detail=full");
    assert.equal(proofTrialsHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(proofTrialsHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(proofTrialsHistory.body.historyPayloadPolicy.olderReceiptsTrendOnly, true);
    assert.equal(proofTrialsHistory.body.summary.latestCheckedAt, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(proofTrialsHistory.body)) < 2000);
    assert.ok(Array.isArray(proofTrialsHistory.body.receipts));
    if (proofTrialsHistory.body.receipts.length) {
      assert.ok(!("baseUrl" in proofTrialsHistory.body.receipts[0]));
      assert.equal(proofTrialsHistory.body.receipts[0].checkedAt, undefined);
      assert.ok(proofTrialsHistory.body.receipts[0].checkPreview);
      assert.ok(proofTrialsHistory.body.receipts[0].checkPreview.length < proofTrials.body.summary.checks);
      assert.ok(proofTrialsHistory.body.receipts[0].checkPreview.some((check) => check.id === "public-route-manifest"));
      assert.ok(proofTrialsHistory.body.receipts.slice(1).every((receipt) => receipt.trendOnly === true));
      assert.ok(proofTrialsHistory.body.receipts.slice(1).every((receipt) => receipt.checkPreview === undefined));
    }
    const fullProofTrialsHistory = await json("/api/proof-trials/history?detail=full&limit=10");
    assert.equal(fullProofTrialsHistory.response.status, 200);
    assert.equal(fullProofTrialsHistory.body.detail, "full");
    assert.equal(fullProofTrialsHistory.body.compact, false);
    assert.equal(fullProofTrialsHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullProofTrialsHistory.body.generatedAt);
    assert.equal(fullProofTrialsHistory.body.receiptStore, "var/proof-trial-receipts.json");
    if (fullProofTrialsHistory.body.receipts.length) {
      assert.ok(fullProofTrialsHistory.body.receipts[0].baseUrl);
      assert.ok(fullProofTrialsHistory.body.receipts[0].checkedAt);
    }

    const qagentTrial = await json("/api/proof-trials/qagent");
    assert.equal(qagentTrial.response.status, 200);
    assert.equal(qagentTrial.body.slug, "qagent");
    assert.equal(qagentTrial.body.detail, "summary");
    assert.equal(qagentTrial.body.compact, true);
    assert.equal(qagentTrial.body.mode, "deterministic-local-replay");
    assert.equal(qagentTrial.body.result.passed, true);
    assert.equal(qagentTrial.body.steps, undefined);
    assert.equal(qagentTrial.body.artifacts, undefined);
    assert.ok(qagentTrial.body.result.checkPreview.some((check) => check.id === "sandbox-writes-disabled"));
    assert.ok(qagentTrial.body.counts.steps >= 5);

    const fullQagentTrial = await json("/api/proof-trials/qagent?detail=full");
    assert.equal(fullQagentTrial.response.status, 200);
    assert.equal(fullQagentTrial.body.detail, "full");
    assert.equal(fullQagentTrial.body.compact, false);
    assert.ok(fullQagentTrial.body.steps.some((step) => step.id === "privacy-approval-gate"));
    assert.ok(fullQagentTrial.body.result.checks.some((check) => check.id === "sandbox-writes-disabled" && check.detail));

    const packets = await json("/api/packets");
    assert.equal(packets.response.status, 200);
    assert.equal(packets.body.mode, "evidence-audience-packets");
    assert.equal(packets.body.detail, "summary");
    assert.equal(packets.body.fullDetailEndpoint, "/api/packets?detail=full");
    assert.equal(packets.body.packetPayloadPolicy.fullDetail, false);
    assert.equal(packets.body.generatedAt, undefined);
    assert.equal(packets.body.sourceBoundary, undefined);
    assert.equal(packets.body.uncertaintyPolicy, undefined);
    assert.equal(packets.body.sourceBoundaryAvailable, undefined);
    assert.equal(packets.body.uncertaintyPolicyAvailable, undefined);
    assert.equal(packets.body.packetPayloadPolicy.defaultPreviewLimits, undefined);
    assert.equal(packets.body.packetPayloadPolicy.selectedPacketEndpointTemplate, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(packets.body)) < 1200);
    assert.deepEqual(packets.body.supportedAudiences, ["recruiter", "professor", "founder"]);
    assert.ok(packets.body.packets.every((packet) => packet.uncertaintyDisclosure.caveatCount > 0 && !("caveats" in packet.uncertaintyDisclosure)));
    assert.ok(packets.body.packets.every((packet) => packet.label === undefined && packet.audience === undefined && packet.detailEndpoint === undefined));
    assert.ok(packets.body.packets.every((packet) => packet.recommendedProjectPreview.length <= 1 && !packet.recommendedProjectOrder));
    assert.ok(packets.body.packets.every((packet) => packet.evidenceBriefSummary.total >= 3 && !packet.evidenceBriefs));
    assert.ok(packets.body.packets.every((packet) => packet.nextActionAvailable === true && !packet.nextActionPreview && !packet.nextActions));
    assert.ok(packets.body.packets.every((packet) => packet.draftOnlyOutreach.automaticSendForbidden === true && !packet.draftOnlyOutreach.sendPolicy));
    const fullPackets = await json("/api/packets?detail=full");
    assert.equal(fullPackets.response.status, 200);
    assert.equal(fullPackets.body.detail, "full");
    assert.equal(fullPackets.body.compact, false);
    assert.equal(fullPackets.body.packetPayloadPolicy.fullDetail, true);
    assert.ok(fullPackets.body.packets.every((packet) => packet.evidenceBriefs[0].claims.length > 0));
    assert.ok(JSON.stringify(fullPackets.body).length > JSON.stringify(packets.body).length);

    const professorPacket = await json("/api/packets/professor");
    assert.equal(professorPacket.response.status, 200);
    assert.equal(professorPacket.body.id, "professor");
    assert.equal(professorPacket.body.detail, "summary");
    assert.equal(professorPacket.body.compact, true);
    assert.equal(professorPacket.body.fullDetailEndpoint, "/api/packets/professor?detail=full");
    assert.equal(professorPacket.body.packetPayloadPolicy.fullDetail, false);
    assert.equal(professorPacket.body.packetPayloadPolicy.fullDetailAvailable, true);
    assert.equal(professorPacket.body.packetPayloadPolicy.recommendedProjectsReturned, professorPacket.body.recommendedProjectOrder.length);
    assert.ok(professorPacket.body.recommendedProjectOrder.length >= 3);
    assert.ok(professorPacket.body.recommendedProjectOrder.length <= 3);
    assert.equal(professorPacket.body.decisionQuestion, undefined);
    assert.equal(professorPacket.body.decisionQuestionAvailable, true);
    assert.equal(professorPacket.body.shortPitch, undefined);
    assert.equal(professorPacket.body.shortPitchAvailable, true);
    assert.equal(professorPacket.body.thesis, undefined);
    assert.equal(professorPacket.body.thesisAvailable, true);
    assert.equal(professorPacket.body.summaryEndpoint, undefined);
    assert.equal(professorPacket.body.uncertaintyDisclosure.noExternalInference, undefined);
    assert.equal(professorPacket.body.uncertaintyDisclosure.noExternalInferenceAvailable, undefined);
    assert.ok(professorPacket.body.evidenceBriefs.every((brief) => !brief.claims && !brief.artifacts));
    assert.equal(professorPacket.body.draftOnlyOutreach.automaticSendForbidden, true);
    assert.equal(professorPacket.body.draftOnlyOutreach.sendPolicy, undefined);
    assert.equal(professorPacket.body.nextActions, undefined);
    assert.ok(professorPacket.body.nextActionCount > 0);
    assert.ok(Buffer.byteLength(JSON.stringify(professorPacket.body)) < 2500);
    const fullProfessorPacket = await json("/api/packets/professor?detail=full");
    assert.equal(fullProfessorPacket.response.status, 200);
    assert.equal(fullProfessorPacket.body.id, "professor");
    assert.equal(fullProfessorPacket.body.detail, "full");
    assert.equal(fullProfessorPacket.body.compact, false);
    assert.ok(fullProfessorPacket.body.shortPitch.includes("Confidence"));
    assert.ok(fullProfessorPacket.body.uncertaintyDisclosure.noExternalInference.includes("does not claim"));
    assert.ok(fullProfessorPacket.body.evidenceBriefs[0].claims.length > 0);
    assert.ok(fullProfessorPacket.body.nextActions.every((action) => typeof action === "string"));

    const narratives = await json("/api/narratives");
    assert.equal(narratives.response.status, 200);
    assert.equal(narratives.body.mode, "evidence-narrative-grounding-report");
    assert.equal(narratives.body.detail, "summary");
    assert.equal(narratives.body.compact, true);
    assert.equal(narratives.body.fullDetailEndpoint, "/api/narratives?detail=full");
    assert.equal(narratives.body.sourceBoundary, undefined);
    assert.equal(narratives.body.sourceBoundaryAvailable, true);
    assert.equal(narratives.body.ruleSummary.fullRulesAvailable, true);
    assert.equal(narratives.body.checks, undefined);
    assert.equal(narratives.body.checkSummary.verificationCommandsAvailable, true);
    assert.equal(narratives.body.nonClaimPreview, undefined);
    assert.equal(narratives.body.manualReviewBoundaryAvailable, true);
    assert.ok(narratives.body.narratives.every((narrative) => narrative.claimCount > 0 && narrative.artifactCount > 0));
    assert.ok(narratives.body.narratives.every((narrative) => Number.isInteger(narrative.sequenceStepCount) && !narrative.sequence));
    assert.ok(narratives.body.narratives.every((narrative) => Number.isInteger(narrative.sourceTrailCount) && !narrative.sourceTrailSummary && !narrative.sourceTrail));
    assert.ok(narratives.body.narratives.every((narrative) => !narrative.repairActions && !narrative.auditChecks && !narrative.uncertaintyDisclosure));
    assert.ok(narratives.body.narratives.every((narrative) => narrative.detailEndpoint.startsWith("/api/narratives/")));
    const fullNarratives = await json("/api/narratives?detail=full");
    assert.equal(fullNarratives.response.status, 200);
    assert.equal(fullNarratives.body.detail, "full");
    assert.equal(fullNarratives.body.compact, false);
    assert.ok(fullNarratives.body.narratives.every((narrative) => narrative.repairActions.length && narrative.auditChecks.length));
    assert.ok(JSON.stringify(fullNarratives.body).length > JSON.stringify(narratives.body).length);

    const recruiterNarrative = await json("/api/narratives/recruiter");
    assert.equal(recruiterNarrative.response.status, 200);
    assert.equal(recruiterNarrative.body.id, "recruiter");
    assert.equal(recruiterNarrative.body.detail, "summary");
    assert.equal(recruiterNarrative.body.compact, true);
    assert.equal(recruiterNarrative.body.fullDetailEndpoint, "/api/narratives/recruiter?detail=full");
    assert.equal(recruiterNarrative.body.narrativeDetailPayloadPolicy.fullDetail, false);
    assert.ok(recruiterNarrative.body.sequenceSummary.stepCount >= 4);
    assert.ok(!recruiterNarrative.body.sequence);
    assert.ok(!recruiterNarrative.body.prohibitedOverclaims);
    const fullRecruiterNarrative = await json("/api/narratives/recruiter?detail=full");
    assert.equal(fullRecruiterNarrative.response.status, 200);
    assert.equal(fullRecruiterNarrative.body.detail, "full");
    assert.equal(fullRecruiterNarrative.body.compact, false);
    assert.ok(fullRecruiterNarrative.body.sequence.length >= 4);
    assert.ok(fullRecruiterNarrative.body.prohibitedOverclaims.some((line) => /interview readiness/i.test(line)));

    const narrativeContrast = await json("/api/narrative-contrast");
    assert.equal(narrativeContrast.response.status, 200);
    assert.equal(narrativeContrast.body.mode, "evidence-narrative-contrast-report");
    assert.equal(narrativeContrast.body.detail, "summary");
    assert.equal(narrativeContrast.body.compact, true);
    assert.equal(narrativeContrast.body.fullDetailEndpoint, "/api/narrative-contrast?detail=full");
    assert.equal(narrativeContrast.body.summary.contrasts, 3);
    assert.ok(Buffer.byteLength(JSON.stringify(narrativeContrast.body)) < 1500);
    assert.ok(narrativeContrast.body.contrasts.length <= narrativeContrast.body.detailPolicy.contrastPreviewLimit);
    assert.ok(narrativeContrast.body.switchboard.length <= narrativeContrast.body.detailPolicy.switchboardPreviewLimit);
    assert.ok(narrativeContrast.body.contrasts.some((item) => item.id === "recruiter-vs-professor"));
    assert.ok(narrativeContrast.body.contrasts.every((item) => item.detailEndpoint && !item.contrastGuidance));
    assert.ok(narrativeContrast.body.contrasts.every((item) => Number.isInteger(item.left.opportunityMatchCount) && !item.left.opportunityMatches));
    assert.ok(narrativeContrast.body.switchboard.every((item) => item.discloseCount > 0 && !item.disclose));
    assert.equal(narrativeContrast.body.checkSummary.failing, 0);
    assert.equal(narrativeContrast.body.nonClaimCount >= 3, true);
    assert.equal(narrativeContrast.body.sourceBoundaryAvailable, undefined);
    assert.equal(narrativeContrast.body.plan, undefined);
    assert.equal(narrativeContrast.body.methodology, undefined);
    assert.equal(narrativeContrast.body.latestReceipt, undefined);
    assert.equal(narrativeContrast.body.repairQueue, undefined);
    assert.ok(Number.isInteger(narrativeContrast.body.repairQueueCount));
    assert.ok(!("rules" in narrativeContrast.body));
    assert.ok(!("sideEffectBoundary" in narrativeContrast.body));
    assert.ok(!("nextAction" in narrativeContrast.body));
    assert.equal(narrativeContrast.body.nextActionAvailable, undefined);
    assert.equal(narrativeContrast.body.verificationCommandAvailable, undefined);

    const fullNarrativeContrast = await json("/api/narrative-contrast?detail=full");
    assert.equal(fullNarrativeContrast.response.status, 200);
    assert.equal(fullNarrativeContrast.body.detail, "full");
    assert.equal(fullNarrativeContrast.body.compact, false);
    assert.ok(fullNarrativeContrast.body.contrasts.every((item) => item.contrastGuidance.length >= 3));

    const recruiterProfessorContrast = await json("/api/narrative-contrast/recruiter-vs-professor");
    assert.equal(recruiterProfessorContrast.response.status, 200);
    assert.equal(recruiterProfessorContrast.body.id, "recruiter-vs-professor");
    assert.equal(recruiterProfessorContrast.body.detail, "summary");
    assert.equal(recruiterProfessorContrast.body.compact, true);
    assert.equal(recruiterProfessorContrast.body.fullDetailEndpoint, "/api/narrative-contrast/recruiter-vs-professor?detail=full");
    assert.equal(recruiterProfessorContrast.body.detailPolicy.fullDetail, false);
    assert.equal(recruiterProfessorContrast.body.contrastGuidance, undefined);
    assert.ok(recruiterProfessorContrast.body.contrastGuidanceCount >= 3);
    const fullRecruiterProfessorContrast = await json("/api/narrative-contrast/recruiter-vs-professor?detail=full");
    assert.equal(fullRecruiterProfessorContrast.response.status, 200);
    assert.equal(fullRecruiterProfessorContrast.body.detail, "full");
    assert.equal(fullRecruiterProfessorContrast.body.compact, false);
    assert.ok(fullRecruiterProfessorContrast.body.contrastGuidance.length >= 3);

    const narrativeContrastPlan = await json("/api/narrative-contrast/plan");
    assert.equal(narrativeContrastPlan.response.status, 200);
    assert.equal(narrativeContrastPlan.body.mode, "evidence-narrative-contrast-plan");
    assert.equal(narrativeContrastPlan.body.command, "npm run contrast:narratives");
    assert.equal(narrativeContrastPlan.body.endpoint, "/api/narrative-contrast");

    const narrativeContrastHistory = await json("/api/narrative-contrast/history");
    assert.equal(narrativeContrastHistory.response.status, 200);
    assert.equal(narrativeContrastHistory.body.mode, "evidence-narrative-contrast-history");
    assert.equal(narrativeContrastHistory.body.detail, "summary");
    assert.equal(narrativeContrastHistory.body.compact, true);
    assert.equal(narrativeContrastHistory.body.fullDetailEndpoint, "/api/narrative-contrast/history?detail=full");
    assert.equal(narrativeContrastHistory.body.generatedAt, undefined);
    assert.equal(narrativeContrastHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(narrativeContrastHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(narrativeContrastHistory.body.historyPayloadPolicy.historyRowsReturned, narrativeContrastHistory.body.receipts.length);
    assert.equal(narrativeContrastHistory.body.historyPayloadPolicy.fullDetailEndpoint, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(narrativeContrastHistory.body)) < 1500);
    assert.ok(Array.isArray(narrativeContrastHistory.body.receipts));
    if (narrativeContrastHistory.body.receipts.length > 0) {
      assert.equal(narrativeContrastHistory.body.receipts[0].checkedAt, undefined);
      assert.ok(Array.isArray(narrativeContrastHistory.body.receipts[0].contrasts));
      assert.equal(narrativeContrastHistory.body.receipts[0].summary, undefined);
    }
    if (narrativeContrastHistory.body.receipts.length > 1) {
      assert.equal(narrativeContrastHistory.body.receipts[1].checkedAt, undefined);
      assert.equal(narrativeContrastHistory.body.receipts[1].latestReceiptPreviewOnly, undefined);
      assert.equal(narrativeContrastHistory.body.receipts[1].contrasts, undefined);
      assert.equal(typeof narrativeContrastHistory.body.receipts[1].score, "number");
    }
    const fullNarrativeContrastHistory = await json("/api/narrative-contrast/history?detail=full&limit=10");
    assert.equal(fullNarrativeContrastHistory.response.status, 200);
    assert.equal(fullNarrativeContrastHistory.body.detail, "full");
    assert.equal(fullNarrativeContrastHistory.body.compact, false);
    assert.ok(fullNarrativeContrastHistory.body.generatedAt);
    if (fullNarrativeContrastHistory.body.receipts.length > 0) {
      assert.equal(fullNarrativeContrastHistory.body.receipts[0].mode, "evidence-narrative-contrast-receipt");
    }

    const selfReview = await json("/api/self-review");
    assert.equal(selfReview.response.status, 200);
    assert.equal(selfReview.body.mode, "evidence-self-review-reports");
    assert.equal(typeof selfReview.body.cachedFromReceipt, "boolean");
    assert.equal(selfReview.body.detail, "summary");
    assert.equal(selfReview.body.compact, true);
    assert.equal(selfReview.body.refreshEndpoint, "/api/self-review?refresh=1");
    assert.equal(selfReview.body.fullDetailEndpoint, "/api/self-review?detail=full");
    assert.equal(selfReview.body.selfReviewPayloadPolicy.fullDetail, false);
    assert.equal(selfReview.body.selfReviewPayloadPolicy.fullDetailAvailable, true);
    assert.equal(selfReview.body.selfReviewPayloadPolicy.fullDetailEndpoint, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(selfReview.body)) < 1700);
    assert.equal(selfReview.body.generatedAt, undefined);
    assert.equal(selfReview.body.checkedAt, undefined);
    assert.equal(selfReview.body.sourceBoundary, undefined);
    assert.equal(selfReview.body.sourceBoundaryAvailable, true);
    assert.equal(selfReview.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(selfReview.body.plan, undefined);
    assert.equal(selfReview.body.cachePolicy, undefined);
    assert.equal(selfReview.body.latestReceipt, undefined);
    assert.equal(selfReview.body.latestReceipt?.checkedAt, undefined);
    assert.deepEqual(selfReview.body.supportedCadences, ["weekly", "monthly"]);
    assert.ok(selfReview.body.reports.every((report) => report.checkedAt === undefined));
    assert.ok(selfReview.body.reports.every((report) => report.label === undefined && report.reportEndpoint === undefined && report.fullDetailEndpoint === undefined));
    assert.ok(selfReview.body.reports.every((report) => report.nextActions.length > 0));
    assert.ok(selfReview.body.reports.every((report) => report.nextActions.every((action) => action.actionAvailable && action.verificationCommandAvailable)));
    assert.ok(selfReview.body.reports.every((report) => report.proofRepairReview.repairItems > 0));
    assert.ok(selfReview.body.reports.every((report) => report.proofRepairReview.graphResolvedPaths === report.proofRepairReview.graphRepairPaths));
    assert.ok(selfReview.body.reports.every((report) => report.uncertaintyDisclosure.proofRepairBoundaryAvailable === true));
    assert.equal(selfReview.body.verificationCommand, undefined);
    assert.equal(selfReview.body.verificationCommandAvailable, undefined);

    const fullSelfReview = await json("/api/self-review?detail=full");
    assert.equal(fullSelfReview.response.status, 200);
    assert.equal(fullSelfReview.body.detail, "full");
    assert.equal(fullSelfReview.body.compact, false);
    assert.equal(fullSelfReview.body.selfReviewPayloadPolicy.fullDetail, true);
    assert.equal(fullSelfReview.body.reports.length, fullSelfReview.body.summary.cadences);
    assert.ok(fullSelfReview.body.reports.every((report) => report.verificationReview.length === 5));
    assert.ok(fullSelfReview.body.reports.every((report) => report.nextActions.every((action) => action.action && action.reason && action.verificationCommand)));

    const selfReviewPlan = await json("/api/self-review/plan");
    assert.equal(selfReviewPlan.response.status, 200);
    assert.equal(selfReviewPlan.body.mode, "evidence-self-review-plan");
    assert.equal(selfReviewPlan.body.command, "npm run record:self-review");
    assert.equal(selfReviewPlan.body.endpoint, "/api/self-review");

    const selfReviewHistory = await json("/api/self-review/history");
    assert.equal(selfReviewHistory.response.status, 200);
    assert.equal(selfReviewHistory.body.mode, "evidence-self-review-history");
    assert.equal(selfReviewHistory.body.detail, "summary");
    assert.equal(selfReviewHistory.body.compact, true);
    assert.equal(selfReviewHistory.body.fullDetailEndpoint, "/api/self-review/history?detail=full");
    assert.equal(selfReviewHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(selfReviewHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(selfReviewHistory.body.historyPayloadPolicy.historyRowsReturned, selfReviewHistory.body.receipts.length);
    assert.equal(selfReviewHistory.body.generatedAt, undefined);
    assert.equal(selfReviewHistory.body.receiptStore, undefined);
    assert.equal(selfReviewHistory.body.summary.latestCheckedAt, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(selfReviewHistory.body)) < 2500);
    assert.ok(Array.isArray(selfReviewHistory.body.receipts));
    if (selfReviewHistory.body.receipts.length > 0) {
      assert.ok(Array.isArray(selfReviewHistory.body.receipts[0].reportPreview));
      assert.equal(selfReviewHistory.body.receipts[0].checkedAt, undefined);
      assert.equal(selfReviewHistory.body.receipts[0].report, undefined);
    }
    if (selfReviewHistory.body.receipts.length > 1) {
      assert.equal(selfReviewHistory.body.receipts[1].reportPreview, undefined);
      assert.equal(selfReviewHistory.body.receipts[1].latestReceiptPreviewOnly, true);
    }

    const fullSelfReviewHistory = await json("/api/self-review/history?detail=full&limit=10");
    assert.equal(fullSelfReviewHistory.response.status, 200);
    assert.equal(fullSelfReviewHistory.body.detail, "full");
    assert.equal(fullSelfReviewHistory.body.compact, false);
    assert.equal(fullSelfReviewHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullSelfReviewHistory.body.receipts.length <= 10);
    if (fullSelfReviewHistory.body.receipts.length > 0) {
      assert.equal(fullSelfReviewHistory.body.receipts[0].mode, "evidence-self-review-receipt");
      assert.ok(fullSelfReviewHistory.body.receipts[0].report);
    }

    const weeklyReview = await json("/api/self-review/weekly");
    assert.equal(weeklyReview.response.status, 200);
    assert.equal(weeklyReview.body.id, "weekly");
    assert.equal(typeof weeklyReview.body.cachedFromReceipt, "boolean");
    assert.equal(weeklyReview.body.detail, "summary");
    assert.equal(weeklyReview.body.compact, true);
    assert.equal(weeklyReview.body.refreshEndpoint, "/api/self-review/weekly?refresh=1");
    assert.equal(weeklyReview.body.fullDetailEndpoint, "/api/self-review/weekly?detail=full");
    assert.equal(weeklyReview.body.selfReviewReportPayloadPolicy.fullDetail, false);
    assert.equal(weeklyReview.body.selfReviewReportPayloadPolicy.fullDetailAvailable, true);
    assert.equal(weeklyReview.body.selfReviewReportPayloadPolicy.omittedFromSummaryCount, 9);
    assert.equal(weeklyReview.body.generatedAt, undefined);
    assert.equal(weeklyReview.body.checkedAt, undefined);
    assert.equal(weeklyReview.body.cachePolicy, undefined);
    assert.equal(weeklyReview.body.catalogEndpoint, undefined);
    assert.equal(weeklyReview.body.verificationReview, undefined);
    assert.equal(weeklyReview.body.selfReviewReportPayloadPolicy.cadence, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(weeklyReview.body)) < 1700);
    assert.ok(weeklyReview.body.evidenceCoverage.totalClaims >= projectsMinimumClaimCount());
    assert.ok(weeklyReview.body.proofRepairReview.graphRepairPaths > 0);
    assert.ok(weeklyReview.body.nextActions.some((action) => action.source === "proof-repair-graph"));
    assert.ok(weeklyReview.body.opportunityReview.length > 0);
    assert.ok(weeklyReview.body.opportunityReview.length <= 1);
    assert.equal(weeklyReview.body.packetReadiness, undefined);
    assert.ok(weeklyReview.body.packetReadinessSummary.packets >= 2);
    assert.ok(weeklyReview.body.maintenanceReview.topIssues.length <= 1);
    assert.ok(weeklyReview.body.proofRepairReview.topRepairs.every((repair) => !repair.verificationCommandAvailable));
    assert.equal(weeklyReview.body.uncertaintyDisclosure.noExternalApplicationsAvailable, true);
    assert.equal(weeklyReview.body.uncertaintyDisclosure.proofRepairBoundaryAvailable, true);
    assert.equal(weeklyReview.body.summary.textAvailable, true);
    const fullWeeklyReview = await json("/api/self-review/weekly?detail=full");
    assert.equal(fullWeeklyReview.response.status, 200);
    assert.equal(fullWeeklyReview.body.detail, "full");
    assert.equal(fullWeeklyReview.body.compact, false);
    assert.ok(fullWeeklyReview.body.uncertaintyDisclosure.noExternalApplications.includes("do not claim"));
    assert.ok(fullWeeklyReview.body.uncertaintyDisclosure.proofRepairBoundary.includes("do not claim"));

    const weaknessMap = await json("/api/weaknesses");
    assert.equal(weaknessMap.response.status, 200);
    assert.equal(weaknessMap.body.mode, "public-project-weakness-map");
    assert.equal(weaknessMap.body.detail, "summary");
    assert.equal(weaknessMap.body.compact, true);
    assert.equal(weaknessMap.body.fullDetailEndpoint, "/api/weaknesses?detail=full");
    assert.equal(weaknessMap.body.generatedAt, undefined);
    assert.equal(weaknessMap.body.sourceBoundary, undefined);
    assert.equal(weaknessMap.body.sourceBoundaryAvailable, true);
    assert.equal(weaknessMap.body.projectPayloadPolicy.fullDetailAvailable, true);
    assert.equal(weaknessMap.body.projectPayloadPolicy.directoryRowsOnly, true);
    assert.equal(weaknessMap.body.projectPayloadPolicy.previewLimits, undefined);
    assert.equal(weaknessMap.body.projectPayloadPolicy.projectRowsReturned, weaknessMap.body.projects.length);
    assert.ok(weaknessMap.body.projects.some((project) => project.slug === "qagent"));
    assert.ok(weaknessMap.body.projects.every((project) => project.actionCount > 0));
    assert.ok(weaknessMap.body.projects.every((project) => project.evidenceScore === undefined));
    assert.ok(weaknessMap.body.projects.every((project) => project.improvementActions === undefined));
    assert.ok(weaknessMap.body.projects.every((project) => project.weakClaims === undefined && project.weakClaimPreview === undefined));
    assert.ok(Buffer.byteLength(JSON.stringify(weaknessMap.body)) < 1900);

    const fullWeaknessMap = await json("/api/weaknesses?detail=full");
    assert.equal(fullWeaknessMap.response.status, 200);
    assert.equal(fullWeaknessMap.body.detail, "full");
    assert.equal(fullWeaknessMap.body.compact, false);
    assert.ok(fullWeaknessMap.body.projects.some((project) => project.weakClaims));
    assert.ok(fullWeaknessMap.body.projects.some((project) => project.improvementActions.some((action) => action.action && action.verificationCommand)));

    const qagentWeakness = await json("/api/weaknesses/qagent");
    assert.equal(qagentWeakness.response.status, 200);
    assert.equal(qagentWeakness.body.slug, "qagent");
    assert.equal(qagentWeakness.body.detail, "summary");
    assert.equal(qagentWeakness.body.compact, true);
    assert.equal(qagentWeakness.body.fullDetailEndpoint, "/api/weaknesses/qagent?detail=full");
    assert.ok(qagentWeakness.body.counts.privateReferences > 0);
    assert.ok(qagentWeakness.body.improvementActions.every((action) => action.actionAvailable && action.verificationCommandAvailable && !action.verificationCommand));
    assert.equal(qagentWeakness.body.privateReferences, undefined);
    const fullQagentWeakness = await json("/api/weaknesses/qagent?detail=full");
    assert.equal(fullQagentWeakness.response.status, 200);
    assert.equal(fullQagentWeakness.body.detail, "full");
    assert.equal(fullQagentWeakness.body.compact, false);
    assert.ok(fullQagentWeakness.body.privateReferences.length > 0);
    assert.ok(fullQagentWeakness.body.improvementActions.every((action) => action.verificationCommand));

    const skillGaps = await json("/api/skill-gaps");
    assert.equal(skillGaps.response.status, 200);
    assert.equal(skillGaps.body.mode, "public-skill-gap-map");
    assert.equal(skillGaps.body.detail, "summary");
    assert.equal(skillGaps.body.compact, true);
    assert.equal(skillGaps.body.fullDetailEndpoint, "/api/skill-gaps?detail=full");
    assert.equal(skillGaps.body.sourceBoundary, undefined);
    assert.equal(skillGaps.body.sourceBoundaryAvailable, true);
    assert.equal(skillGaps.body.generatedAt, undefined);
    assert.equal(skillGaps.body.skillPayloadPolicy.fullDetail, false);
    assert.equal(skillGaps.body.skillPayloadPolicy.previewLimit, 5);
    assert.equal(skillGaps.body.skillPayloadPolicy.skillsReturned, skillGaps.body.skills.length);
    assert.equal(skillGaps.body.skillPayloadPolicy.fullDetailAvailable, true);
    assert.equal(skillGaps.body.skillPayloadPolicy.compact, undefined);
    assert.equal(skillGaps.body.skillPayloadPolicy.skillDetailAvailable, undefined);
    assert.ok(skillGaps.body.skills.length < skillGaps.body.summary.skills);
    assert.ok(skillGaps.body.summary.skills >= 12);
    assert.ok(skillGaps.body.skills.every((skill) => skill.projectPreview.length <= 1));
    assert.ok(skillGaps.body.skills.every((skill) => skill.projectPreview.every((project) => project.confidenceScore === undefined)));
    assert.ok(skillGaps.body.skills.every((skill) => skill.provenProjectCount === undefined && skill.claimedProjectCount === undefined && skill.weakProjectCount === undefined));
    assert.ok(skillGaps.body.skills.every((skill) => skill.evidence === undefined && Object.keys(skill.evidenceSummary).join(",") === "averageConfidence"));
    assert.ok(skillGaps.body.skills.every((skill) => Number.isInteger(skill.evidenceSummary.averageConfidence)));
    assert.ok(
      skillGaps.body.skills.every((skill) =>
        skill.improvementActions.every((action) => action.actionAvailable === true && !action.action && !action.verificationCommand),
      ),
    );
    assert.ok(skillGaps.body.skills.every((skill) => !skill.claimedProjects && Array.isArray(skill.projectPreview)));
    assert.ok(Buffer.byteLength(JSON.stringify(skillGaps.body)) < 1700);

    const fullSkillGaps = await json("/api/skill-gaps?detail=full");
    assert.equal(fullSkillGaps.response.status, 200);
    assert.equal(fullSkillGaps.body.detail, "full");
    assert.equal(fullSkillGaps.body.compact, false);
    assert.equal(typeof fullSkillGaps.body.sourceBoundary, "string");
    assert.equal(fullSkillGaps.body.sourceBoundaryAvailable, undefined);
    assert.equal(fullSkillGaps.body.skillPayloadPolicy.fullDetail, true);
    assert.equal(fullSkillGaps.body.skills.length, fullSkillGaps.body.summary.skills);
    assert.ok(fullSkillGaps.body.skills.some((skill) => Array.isArray(skill.claimedProjects)));
    const expandedSkillGaps = await json("/api/skill-gaps?limit=40");
    assert.equal(expandedSkillGaps.response.status, 200);
    assert.equal(expandedSkillGaps.body.skillPayloadPolicy.previewLimit, 40);
    assert.equal(expandedSkillGaps.body.skills.length, 40);

    const aiAgentsSkill = await json("/api/skill-gaps/ai-agents");
    assert.equal(aiAgentsSkill.response.status, 200);
    assert.equal(aiAgentsSkill.body.id, "ai-agents");
    assert.ok(["proven", "claimed", "weak", "missing-proof"].includes(aiAgentsSkill.body.status));

    const contradictions = await json("/api/contradictions");
    assert.equal(contradictions.response.status, 200);
    assert.equal(contradictions.body.mode, "claim-contradiction-report");
    assert.ok(Array.isArray(contradictions.body.quarantine));

    const changePlan = await json("/api/change-history/plan");
    assert.equal(changePlan.response.status, 200);
    assert.equal(changePlan.body.command, "npm run record:changes");
    assert.equal(changePlan.body.endpoint, "/api/change-history");

    const changeHistory = await json("/api/change-history");
    assert.equal(changeHistory.response.status, 200);
    assert.equal(changeHistory.body.mode, "public-safe-change-history");
    assert.equal(typeof changeHistory.body.cachedFromSnapshot, "boolean");
    assert.equal(changeHistory.body.refreshEndpoint, "/api/change-history?refresh=1");
    assert.equal(changeHistory.body.detail, "summary");
    assert.equal(changeHistory.body.compact, true);
    assert.equal(changeHistory.body.fullDetailEndpoint, "/api/change-history?detail=full");
    assert.ok(Array.isArray(changeHistory.body.changes));
    assert.equal(changeHistory.body.current.metrics.projects, projects.body.projects.length);
    assert.ok(changeHistory.body.current.metrics.artifactGapRepairItems > 0);
    assert.ok(changeHistory.body.current.metrics.artifactGapGraphPaths > 0);
    assert.equal(
      changeHistory.body.current.metrics.artifactGapGraphResolvedPaths,
      changeHistory.body.current.metrics.artifactGapGraphPaths,
    );
    assert.equal(changeHistory.body.proofRepair.currentAvailable, true);
    assert.equal(changeHistory.body.proofRepair.boundaryAvailable, true);

    const fullChangeHistory = await json("/api/change-history?detail=full");
    assert.equal(fullChangeHistory.response.status, 200);
    assert.equal(fullChangeHistory.body.detail, "full");
    assert.equal(fullChangeHistory.body.compact, false);
    assert.ok(fullChangeHistory.body.current.metrics.packetConfidence);
    assert.ok(fullChangeHistory.body.proofRepairNarrative.current.includes("graph-visible proof-repair"));
    assert.ok(fullChangeHistory.body.proofRepairNarrative.boundary.includes("does not claim"));

    const changeHistorySnapshots = await json("/api/change-history/history");
    assert.equal(changeHistorySnapshots.response.status, 200);
    assert.ok(Array.isArray(changeHistorySnapshots.body.snapshots));

    const trustBlockade = await json("/api/trust-blockade");
    assert.equal(trustBlockade.response.status, 200);
    assert.equal(trustBlockade.body.mode, "public-safe-trust-blockade-frontier");
    assert.equal(trustBlockade.body.detail, "summary");
    assert.equal(trustBlockade.body.compact, true);
    assert.equal(trustBlockade.body.fullDetailEndpoint, "/api/trust-blockade?detail=full");
    assert.equal(trustBlockade.body.sourceBoundaryAvailable, undefined);
    assert.ok(!trustBlockade.body.sourceBoundary);
    assert.ok(Buffer.byteLength(JSON.stringify(trustBlockade.body)) < 2500);
    assert.ok(trustBlockade.body.summary.frontierItems >= 6);
    assert.ok(trustBlockade.body.summary.families >= 5);
    assert.equal(trustBlockade.body.summary.graphResolvedRepairPaths, trustBlockade.body.summary.graphRepairPaths);
    assert.ok(trustBlockade.body.families.some((family) => family.id === "artifact-gap-repair"));
    assert.ok(trustBlockade.body.families.some((family) => family.id === "graph-repair-paths"));
    assert.ok(Array.isArray(trustBlockade.body.frontierPreview));
    assert.ok(trustBlockade.body.frontierPreview.every((item) => !("verificationCommand" in item)));
    assert.equal(trustBlockade.body.frontierDirectory, undefined);
    assert.equal(trustBlockade.body.frontierDirectorySummary, undefined);
    assert.ok(trustBlockade.body.checks.every((check) => check.passed));
    assert.ok(trustBlockade.body.checks.length <= 4);
    assert.ok(trustBlockade.body.checks.every((check) => !("detail" in check)));
    assert.equal(trustBlockade.body.nonClaimTopics.blocksExternalOutcomeClaims, true);
    assert.equal(trustBlockade.body.trustBlockadePayloadPolicy.fullDetail, false);
    assert.equal(trustBlockade.body.trustBlockadePayloadPolicy.returnedFrontierItems, trustBlockade.body.frontierPreview.length);
    assert.equal(trustBlockade.body.trustBlockadePayloadPolicy.returnedChecks, trustBlockade.body.checks.length);
    assert.equal(trustBlockade.body.trustBlockadePayloadPolicy.totalChecks, undefined);
    assert.equal(trustBlockade.body.nextActionAvailable, undefined);
    assert.equal(trustBlockade.body.verificationCommandAvailable, undefined);
    assert.ok(!("frontier" in trustBlockade.body));
    assert.ok(!("repairActions" in trustBlockade.body));
    assert.ok(!("nonClaims" in trustBlockade.body));
    assert.ok(!("sideEffectBoundary" in trustBlockade.body));

    const fullTrustBlockade = await json("/api/trust-blockade?detail=full");
    assert.equal(fullTrustBlockade.response.status, 200);
    assert.equal(fullTrustBlockade.body.detail, "full");
    assert.equal(fullTrustBlockade.body.compact, false);
    assert.ok(fullTrustBlockade.body.frontier.every((item) => item.verificationCommand));
    assert.ok(fullTrustBlockade.body.checks.every((check) => check.passed));
    assert.ok(fullTrustBlockade.body.nonClaims.some((item) => /outreach|applications/i.test(item)));
    assert.equal(fullTrustBlockade.body.trustBlockadePayloadPolicy.fullDetail, true);

    const trustBlockadePlan = await json("/api/trust-blockade/plan");
    assert.equal(trustBlockadePlan.response.status, 200);
    assert.equal(trustBlockadePlan.body.command, "npm run audit:trust-blockade");
    const trustBlockadeHistory = await json("/api/trust-blockade/history");
    assert.equal(trustBlockadeHistory.response.status, 200);
    assert.equal(trustBlockadeHistory.body.mode, "public-safe-trust-blockade-history");
    assert.equal(trustBlockadeHistory.body.detail, "summary");
    assert.equal(trustBlockadeHistory.body.compact, true);
    assert.equal(trustBlockadeHistory.body.generatedAt, undefined);
    assert.equal(trustBlockadeHistory.body.summary.limit, 5);
    assert.equal(trustBlockadeHistory.body.summary.latestReceiptId, undefined);
    assert.equal(trustBlockadeHistory.body.fullDetailEndpoint, "/api/trust-blockade/history?detail=full");
    assert.equal(trustBlockadeHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(trustBlockadeHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(trustBlockadeHistory.body.historyPayloadPolicy.latestFrontierPreviewLimit, undefined);
    assert.equal(trustBlockadeHistory.body.historyPayloadPolicy.latestCheckPreviewLimit, undefined);
    assert.equal(trustBlockadeHistory.body.definitions, undefined);
    assert.equal(trustBlockadeHistory.body.sourceAvailable, undefined);
    assert.equal(trustBlockadeHistory.body.receiptStoreAvailable, undefined);
    assert.ok(!trustBlockadeHistory.body.source);
    assert.equal(trustBlockadeHistory.body.nextActionAvailable, undefined);
    assert.equal(trustBlockadeHistory.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(trustBlockadeHistory.body)) < 1500);
    assert.ok(Array.isArray(trustBlockadeHistory.body.receipts));
    assert.ok(trustBlockadeHistory.body.receipts.length <= 5);
    const latestTrustBlockadeReceipt = trustBlockadeHistory.body.receipts[0];
    assert.ok(latestTrustBlockadeReceipt);
    assert.ok(Array.isArray(latestTrustBlockadeReceipt.frontierPreview));
    assert.ok(Array.isArray(latestTrustBlockadeReceipt.checks));
    assert.equal(latestTrustBlockadeReceipt.checkedAt, undefined);
    assert.ok(Number.isInteger(latestTrustBlockadeReceipt.familyCount));
    assert.ok(latestTrustBlockadeReceipt.frontierPreview.length <= 3);
    assert.ok(latestTrustBlockadeReceipt.checks.length <= 4);
    assert.ok(!("baseUrl" in latestTrustBlockadeReceipt));
    assert.ok(!("mode" in latestTrustBlockadeReceipt));
    assert.ok(!("frontier" in latestTrustBlockadeReceipt));
    assert.ok(latestTrustBlockadeReceipt.frontierPreview.every((item) => !("id" in item)));
    assert.ok(latestTrustBlockadeReceipt.frontierPreview.every((item) => !("verificationCommand" in item)));
    assert.ok(latestTrustBlockadeReceipt.checks.every((check) => !("detail" in check)));
    if (trustBlockadeHistory.body.receipts.length > 1) {
      const olderTrustBlockadeReceipt = trustBlockadeHistory.body.receipts[1];
      assert.ok(Number.isInteger(olderTrustBlockadeReceipt.familyCount));
      assert.ok(Number.isInteger(olderTrustBlockadeReceipt.frontierCount));
      assert.ok(Number.isInteger(olderTrustBlockadeReceipt.checkCount));
      assert.equal(olderTrustBlockadeReceipt.frontierPreview, undefined);
      assert.equal(olderTrustBlockadeReceipt.checks, undefined);
    }

    const fullTrustBlockadeHistory = await json("/api/trust-blockade/history?detail=full&limit=10");
    assert.equal(fullTrustBlockadeHistory.response.status, 200);
    assert.equal(fullTrustBlockadeHistory.body.detail, "full");
    assert.equal(fullTrustBlockadeHistory.body.compact, false);
    assert.equal(fullTrustBlockadeHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullTrustBlockadeHistory.body.receipts.length <= 10);
    assert.ok(fullTrustBlockadeHistory.body.receipts[0].baseUrl);
    assert.ok(fullTrustBlockadeHistory.body.receipts[0].frontier.some((item) => item.verificationCommand));
    assert.ok(fullTrustBlockadeHistory.body.receipts[0].checks.some((check) => check.detail));

    const waves = await json("/api/waves");
    assert.equal(waves.response.status, 200);
    assert.equal(waves.body.mode, "derived-maygoals-wave-backlog");
    assert.equal(waves.body.detail, "summary");
    assert.equal(waves.body.compact, true);
    assert.equal(waves.body.fullDetailEndpoint, "/api/waves/:number");
    assert.equal(waves.body.fullIndexEndpoint, "/api/waves?detail=full-index");
    assert.equal(waves.body.range.count, 360);
    assert.equal(waves.body.wavePreview.length, 5);
    assert.equal(waves.body.generatedAt, undefined);
    assert.equal(waves.body.sourceBoundary, undefined);
    assert.equal(waves.body.sourceBoundaryAvailable, true);
    assert.equal(waves.body.themes, undefined);
    assert.equal(waves.body.themeIds.length, 8);
    assert.equal(waves.body.detailEndpointTemplate, undefined);
    assert.equal(waves.body.nextAction, undefined);
    assert.deepEqual(waves.body.waveFields, ["number", "theme", "verb", "phase", "detailEndpoint"]);
    assert.equal(waves.body.wavePreview[0].detailEndpoint, "/api/waves/41");
    assert.equal(waves.body.wavePreview[0].title, undefined);
    assert.equal(waves.body.wavePreview[0].dependsOn, undefined);
    assert.ok(!waves.body.wavePreview[0].acceptanceCriteria);
    assert.ok(!waves.body.wavePreview[0].rationale);
    assert.ok(Buffer.byteLength(JSON.stringify(waves.body)) < 2500);

    const fullWaveIndex = await json("/api/waves?detail=full-index");
    assert.equal(fullWaveIndex.response.status, 200);
    assert.equal(fullWaveIndex.body.detail, "index");
    assert.equal(fullWaveIndex.body.waves.length, 360);
    assert.equal(fullWaveIndex.body.waves[0].detailEndpoint, "/api/waves/41");

    const wave41 = await json("/api/waves/41");
    assert.equal(wave41.response.status, 200);
    assert.equal(wave41.body.number, 41);
    assert.equal(wave41.body.detailEndpoint, undefined);
    assert.ok(wave41.body.acceptanceCriteria.length >= 3);

    const opportunityPackages = await json("/api/opportunity-packages");
    assert.equal(opportunityPackages.response.status, 200);
    assert.equal(opportunityPackages.body.mode, "proof-backed-opportunity-packages");
    assert.equal(opportunityPackages.body.detail, "summary");
    assert.equal(opportunityPackages.body.compact, true);
    assert.equal(opportunityPackages.body.fullDetailEndpoint, "/api/opportunity-packages?detail=full");
    assert.equal(opportunityPackages.body.manualOnlyPolicySummary.blocksSendMessage, true);
    assert.equal(opportunityPackages.body.manualOnlyPolicySummary.externalWrite, false);
    assert.ok(Buffer.byteLength(JSON.stringify(opportunityPackages.body)) < 2200);
    assert.equal(opportunityPackages.body.summaryDefinitions, undefined);
    assert.equal(opportunityPackages.body.packagePayloadPolicy.returned.evidenceBundle, 0);
    assert.ok(opportunityPackages.body.packagePayloadPolicy.totals.evidenceBundle > 0);
    assert.ok(opportunityPackages.body.summary.repairPlanItems >= opportunityPackages.body.summary.packages * 3);
    assert.equal(opportunityPackages.body.summary.manualOnlyPackages, opportunityPackages.body.summary.packages);
    assert.equal(opportunityPackages.body.summary.averageReadiness, undefined);
    assert.equal(opportunityPackages.body.sourceBoundaryAvailable, undefined);
    assert.equal(opportunityPackages.body.manualOnlyPolicySummary.blocksSubmitApplication, undefined);
    assert.ok(opportunityPackages.body.packages.every((item) => Number.isInteger(item.counts.deRisk) && !item.statusCounts && !item.deRiskingChecklist));
    assert.ok(opportunityPackages.body.packages.every((item) => item.counts.projects > 0 && !item.evidencePreview && !item.evidenceBundle));
    assert.ok(opportunityPackages.body.packages.every((item) => Number.isInteger(item.counts.claims) && Number.isInteger(item.counts.artifacts)));
    assert.ok(opportunityPackages.body.packages.every((item) => item.counts.repairs >= 3 && !item.proofRepairPreview && !item.proofRepairPlan));
    assert.ok(opportunityPackages.body.packages.every((item) => item.repairAvailable === true && item.repairActionAvailable === undefined && !item.firstRepair));
    assert.ok(opportunityPackages.body.packages.every((item) => Number.isInteger(item.counts.traces) && !item.sourceTrace));
    assert.ok(opportunityPackages.body.packages.every((item) => !item.detailAvailable && !item.fullDetailAvailable && !item.fullDetailEndpoint));
    assert.ok(opportunityPackages.body.packages.every((item) => Number.isInteger(item.readiness) && item.readinessScore === undefined && !item.packageReadiness));
    const fullOpportunityPackages = await json("/api/opportunity-packages?detail=full");
    assert.equal(fullOpportunityPackages.response.status, 200);
    assert.equal(fullOpportunityPackages.body.detail, "full");
    assert.equal(fullOpportunityPackages.body.compact, false);
    assert.ok(fullOpportunityPackages.body.packages[0].proofRepairPlan.length >= opportunityPackages.body.packages[0].counts.repairs);
    assert.ok(JSON.stringify(fullOpportunityPackages.body).length > JSON.stringify(opportunityPackages.body).length);

    const agentPackage = await json("/api/opportunity-packages/agent-infra-internship");
    assert.equal(agentPackage.response.status, 200);
    assert.equal(agentPackage.body.id, "agent-infra-internship");
    assert.equal(agentPackage.body.detail, "summary");
    assert.equal(agentPackage.body.compact, true);
    assert.equal(agentPackage.body.fullDetailEndpoint, "/api/opportunity-packages/agent-infra-internship?detail=full");
    assert.equal(agentPackage.body.packagePayloadPolicy.fullDetail, false);
    assert.equal(agentPackage.body.packagePayloadPolicy.fullDetailAvailable, true);
    assert.equal(agentPackage.body.packagePayloadPolicy.totals, undefined);
    assert.equal(agentPackage.body.summaryEndpoint, undefined);
    assert.equal(agentPackage.body.packageId, undefined);
    assert.equal(agentPackage.body.opportunityId, undefined);
    assert.equal(agentPackage.body.type, undefined);
    assert.equal(agentPackage.body.selectedPacketId, undefined);
    assert.ok(agentPackage.body.requirementCoverage.length > 0);
    assert.ok(agentPackage.body.requirementCoverage.every((item) => !("evidence" in item) && !("repairAction" in item)));
    assert.ok(agentPackage.body.deRiskingChecklist.every((item) => !("verificationCommand" in item) && !("reason" in item)));
    assert.ok(agentPackage.body.proofRepairPlan.every((step) => !("verificationCommand" in step) && !("action" in step)));
    assert.ok(agentPackage.body.proofRepairPlan.length <= 2);
    assert.equal(agentPackage.body.riskRegister, undefined);
    assert.equal(agentPackage.body.sourceTrace, undefined);
    assert.ok(agentPackage.body.executionPlanStepCount >= 4);
    assert.ok(Buffer.byteLength(JSON.stringify(agentPackage.body)) < 1600);

    const fullAgentPackage = await json("/api/opportunity-packages/agent-infra-internship?detail=full");
    assert.equal(fullAgentPackage.response.status, 200);
    assert.equal(fullAgentPackage.body.id, "agent-infra-internship");
    assert.equal(fullAgentPackage.body.detail, "full");
    assert.equal(fullAgentPackage.body.compact, false);
    assert.equal(fullAgentPackage.body.packagePayloadPolicy.fullDetail, true);
    assert.ok(fullAgentPackage.body.proofRepairPlan.every((step) => step.verificationCommand && ["read-only", "local-only"].includes(step.sideEffect)));
    assert.ok(fullAgentPackage.body.sourceTrace.some((trace) => trace.type === "proof-repair-plan"));
    assert.ok(fullAgentPackage.body.executionPlan.every((step) => ["read-only", "local-only", "manual-only"].includes(step.sideEffect)));
    assert.ok(JSON.stringify(fullAgentPackage.body).length > JSON.stringify(agentPackage.body).length);

    const opportunityBoard = await json("/api/opportunity-board");
    assert.equal(opportunityBoard.response.status, 200);
    assert.equal(opportunityBoard.body.mode, "proof-backed-opportunity-board");
    assert.equal(typeof opportunityBoard.body.cachedFromReceipt, "boolean");
    assert.equal(opportunityBoard.body.detail, "summary");
    assert.equal(opportunityBoard.body.compact, true);
    assert.ok(Buffer.byteLength(JSON.stringify(opportunityBoard.body)) < 2500);
    assert.equal(opportunityBoard.body.generatedAt, undefined);
    assert.equal(opportunityBoard.body.checkedAt, undefined);
    assert.equal(opportunityBoard.body.refreshEndpoint, "/api/opportunity-board?refresh=1");
    assert.equal(opportunityBoard.body.fullDetailEndpoint, "/api/opportunity-board?detail=full");
    assert.equal(opportunityBoard.body.boardPayloadPolicy.fullDetail, false);
    assert.equal(opportunityBoard.body.plan.endpoint, "/api/opportunity-board");
    assert.match(opportunityBoard.body.manualUsePolicy, /must not send/i);
    assert.equal(opportunityBoard.body.summary.proofBundles, opportunityPackages.body.packages.length);
    assert.ok(opportunityBoard.body.gates.some((gate) => gate.id === "proof-repair-required"));
    assert.ok(opportunityBoard.body.gates.every((gate) => gate.nextActionAvailable === true && gate.packages.every((item) => item.detailEndpoint && !item.verificationCommand && !item.label)));
    assert.equal(opportunityBoard.body.boardPayloadPolicy.proofBundlesReturned, 0);
    assert.equal(opportunityBoard.body.proofBundleSummary.available, opportunityPackages.body.packages.length);
    assert.equal(opportunityBoard.body.proofBundleSummary.returned, 0);
    assert.ok(opportunityBoard.body.proofBundleSummary.totals.projects > 0);
    assert.ok(!opportunityBoard.body.proofBundles);
    assert.ok(opportunityBoard.body.blockerQueue.length <= 3);
    assert.ok(opportunityBoard.body.blockerQueue.every((blocker) => blocker.detailEndpoint && !blocker.repairAction));
    assert.ok(opportunityBoard.body.audienceLanes.length >= 3);
    assert.ok(opportunityBoard.body.audienceLanes.every((lane) => Number.isInteger(lane.blockedPackageCount) && !lane.proofBundleIds));
    assert.ok(opportunityBoard.body.checks.every((check) => !check.verificationCommand && !check.repairAction));
    assert.ok(opportunityBoard.body.checks.every((check) => check.passed));

    const fullOpportunityBoard = await json("/api/opportunity-board?detail=full");
    assert.equal(fullOpportunityBoard.response.status, 200);
    assert.equal(fullOpportunityBoard.body.detail, "full");
    assert.equal(fullOpportunityBoard.body.compact, false);
    assert.equal(fullOpportunityBoard.body.boardPayloadPolicy.fullDetail, true);
    assert.ok(fullOpportunityBoard.body.proofBundles.every((bundle) => bundle.projects.length > 0));

    const agentBoardPackage = await json("/api/opportunity-board/agent-infra-internship");
    assert.equal(agentBoardPackage.response.status, 200);
    assert.equal(agentBoardPackage.body.mode, "proof-backed-opportunity-board-package");
    assert.equal(agentBoardPackage.body.id, "agent-infra-internship");
    assert.equal(agentBoardPackage.body.detail, "summary");
    assert.equal(agentBoardPackage.body.compact, true);
    assert.equal(agentBoardPackage.body.fullDetailEndpoint, "/api/opportunity-board/agent-infra-internship?detail=full");
    assert.equal(agentBoardPackage.body.boardPackagePayloadPolicy.fullDetail, false);
    assert.equal(agentBoardPackage.body.generatedAt, undefined);
    assert.equal(agentBoardPackage.body.checkedAt, undefined);
    assert.equal(agentBoardPackage.body.cachePolicy, undefined);
    assert.equal(agentBoardPackage.body.fullBoardEndpoint, undefined);
    assert.equal(agentBoardPackage.body.boardPackagePayloadPolicy.fullDetailAvailable, true);
    assert.equal(agentBoardPackage.body.boardPackagePayloadPolicy.blockerQueueAvailable, undefined);
    assert.equal(agentBoardPackage.body.manualUsePolicy, undefined);
    assert.equal(agentBoardPackage.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(agentBoardPackage.body.boardSummary, undefined);
    assert.equal(agentBoardPackage.body.gate, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(agentBoardPackage.body)) < 1300);
    assert.ok(agentBoardPackage.body.package.verificationCommandAvailable);
    assert.ok(!agentBoardPackage.body.package.verificationCommand);
    assert.equal(agentBoardPackage.body.package.detailEndpoint, undefined);
    assert.ok(agentBoardPackage.body.proofBundle.projectPreview.length > 0);
    assert.ok(!agentBoardPackage.body.proofBundle.projects);
    assert.equal(agentBoardPackage.body.proofBundle.verificationCommandAvailable, undefined);
    assert.ok(agentBoardPackage.body.blockerQueue.length > 0);
    assert.ok(agentBoardPackage.body.blockerQueue.every((blocker) => blocker.repairActionAvailable && !blocker.repairAction));
    assert.ok(agentBoardPackage.body.audienceLane && Number.isInteger(agentBoardPackage.body.audienceLane.proofBundleCount));
    assert.ok(agentBoardPackage.body.verificationCommandAvailable);

    const fullAgentBoardPackage = await json("/api/opportunity-board/agent-infra-internship?detail=full");
    assert.equal(fullAgentBoardPackage.response.status, 200);
    assert.equal(fullAgentBoardPackage.body.mode, "proof-backed-opportunity-board-package");
    assert.equal(fullAgentBoardPackage.body.id, "agent-infra-internship");
    assert.equal(fullAgentBoardPackage.body.detail, "full");
    assert.equal(fullAgentBoardPackage.body.compact, false);
    assert.equal(fullAgentBoardPackage.body.boardPackagePayloadPolicy.fullDetail, true);
    assert.ok(fullAgentBoardPackage.body.package.verificationCommand);
    assert.ok(fullAgentBoardPackage.body.proofBundle.projects.length > 0);
    assert.ok(fullAgentBoardPackage.body.blockerQueue.some((blocker) => blocker.repairAction));
    assert.ok(JSON.stringify(fullAgentBoardPackage.body).length > JSON.stringify(agentBoardPackage.body).length);

    const liveOpportunityBoard = await json("/api/opportunity-board?refresh=1");
    assert.equal(liveOpportunityBoard.response.status, 200);
    assert.equal(liveOpportunityBoard.body.cachedFromReceipt, false);
    assert.equal(liveOpportunityBoard.body.cachePolicy, "live-refresh");
    assert.equal(liveOpportunityBoard.body.refreshEndpoint, "/api/opportunity-board?refresh=1");
    assert.equal(liveOpportunityBoard.body.detail, "summary");

    const opportunityDerisking = await json("/api/opportunity-derisking");
    assert.equal(opportunityDerisking.response.status, 200);
    assert.equal(opportunityDerisking.body.mode, "proof-backed-opportunity-derisking");
    assert.equal(typeof opportunityDerisking.body.cachedFromReceipt, "boolean");
    assert.equal(opportunityDerisking.body.detail, "summary");
    assert.equal(opportunityDerisking.body.compact, true);
    assert.equal(opportunityDerisking.body.generatedAt, undefined);
    assert.equal(opportunityDerisking.body.checkedAt, undefined);
    assert.equal(opportunityDerisking.body.refreshEndpoint, undefined);
    assert.equal(opportunityDerisking.body.fullDetailEndpoint, "/api/opportunity-derisking?detail=full");
    assert.equal(opportunityDerisking.body.plan, undefined);
    assert.equal(opportunityDerisking.body.planAvailable, undefined);
    assert.equal(opportunityDerisking.body.summary.plans, opportunityPackages.body.packages.length);
    assert.ok(opportunityDerisking.body.summary.assumptionAudits >= opportunityDerisking.body.summary.plans * 7);
    assert.ok(opportunityDerisking.body.summary.blockedExternalClaims >= opportunityDerisking.body.summary.plans * 4);
    assert.equal(
      opportunityDerisking.body.summary.manualReviewOnlyPlans + opportunityDerisking.body.summary.repairFirstPlans + opportunityDerisking.body.summary.internalOnlyPlans,
      opportunityDerisking.body.summary.plans,
    );
    assert.ok(opportunityDerisking.body.checks.every((check) => check.passed));
    assert.equal(opportunityDerisking.body.checkSummary.assumptionAuditDepthAvailable, true);
    assert.equal(opportunityDerisking.body.checkSummary.externalClaimFirewallAvailable, true);
    assert.equal(opportunityDerisking.body.checkSummary.manualGoNoGoAvailable, true);
    assert.equal(opportunityDerisking.body.checkSummary.artifactGapRoutingAvailable, true);
    assert.equal(opportunityDerisking.body.checkSummary.artifactGapClaimGuardsAvailable, true);
    assert.ok(opportunityDerisking.body.summary.artifactGapWorkItems > 0);
    assert.ok(opportunityDerisking.body.summary.artifactGapQueueItems > 0);
    assert.equal(opportunityDerisking.body.deRiskingPayloadPolicy.fullDetail, false);
    assert.equal(opportunityDerisking.body.deRiskingPayloadPolicy.fullDetailAvailable, true);
    assert.equal(opportunityDerisking.body.deRiskingPayloadPolicy.totalPlans, opportunityDerisking.body.summary.plans);
    assert.equal(opportunityDerisking.body.deRiskingPayloadPolicy.plansReturned, opportunityDerisking.body.plans.length);
    assert.equal(opportunityDerisking.body.planSummary.total, opportunityDerisking.body.summary.plans);
    assert.equal(opportunityDerisking.body.planDirectory, undefined);
    assert.equal(opportunityDerisking.body.deRiskingPayloadPolicy.planDirectoryPreviewLimit, undefined);
    assert.ok(opportunityDerisking.body.checks.length <= opportunityDerisking.body.deRiskingPayloadPolicy.checksReturned);
    assert.ok(opportunityDerisking.body.plans.length < opportunityDerisking.body.summary.plans);
    assert.ok(Number.isInteger(opportunityDerisking.body.priorityQueueSummary.total));
    assert.equal(opportunityDerisking.body.artifactGapQueue, undefined);
    assert.ok(Number.isInteger(opportunityDerisking.body.artifactGapQueueSummary.total));
    assert.ok(opportunityDerisking.body.artifactGapQueueSummary.localOnly > 0);
    assert.ok(opportunityDerisking.body.plans.every((plan) => plan.deRiskStepCount >= 6));
    assert.ok(opportunityDerisking.body.plans.every((plan) => plan.deRiskStepPreview.length <= 2));
    assert.ok(opportunityDerisking.body.plans.some((plan) => plan.deRiskStepPreview.some((step) => step.source === "artifact-gap-workbench")));
    assert.ok(opportunityDerisking.body.plans.every((plan) => plan.artifactGapMode === "artifact-gap-opportunity-pressure"));
    assert.equal(opportunityDerisking.body.sharedSafetyPolicy.blocksSendMessage, true);
    assert.equal(opportunityDerisking.body.sharedSafetyPolicy.blocksRecipientInterest, true);
    assert.equal(opportunityDerisking.body.sharedSafetyPolicy.blocksLivePostingClaim, true);
    assert.ok(opportunityDerisking.body.plans.every((plan) => plan.livePostingStatus === "unverified-external"));
    assert.ok(opportunityDerisking.body.plans.every((plan) => plan.recipientInterestBlocked === true));
    assert.equal(opportunityDerisking.body.plans[0].claimFirewall, undefined);
    assert.equal(opportunityDerisking.body.nextAction, undefined);
    assert.equal(opportunityDerisking.body.verificationCommand, undefined);
    assert.equal(opportunityDerisking.body.nextActionAvailable, undefined);
    assert.equal(opportunityDerisking.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(opportunityDerisking.body)) < 2200);

    const opportunityDeriskingFull = await json("/api/opportunity-derisking?detail=full");
    assert.equal(opportunityDeriskingFull.response.status, 200);
    assert.equal(opportunityDeriskingFull.body.detail, "full");
    assert.equal(opportunityDeriskingFull.body.compact, false);
    assert.equal(opportunityDeriskingFull.body.deRiskingPayloadPolicy.fullDetail, true);
    assert.equal(opportunityDeriskingFull.body.plans.length, opportunityDeriskingFull.body.summary.plans);
    assert.ok(opportunityDeriskingFull.body.plans.every((plan) => plan.deRiskSteps.length >= 6));
    assert.ok(opportunityDeriskingFull.body.plans.some((plan) => plan.deRiskSteps.some((step) => step.source === "artifact-gap-workbench")));
    assert.ok(opportunityDeriskingFull.body.plans.every((plan) => plan.manualReviewGate.forbiddenActions.includes("send-message")));
    assert.ok(
      opportunityDeriskingFull.body.plans.every((plan) =>
        plan.assumptionAudit.assumptions.some((assumption) => assumption.id === "live-posting" && assumption.status === "unverified-external"),
      ),
    );
    assert.ok(opportunityDeriskingFull.body.plans.every((plan) => plan.claimFirewall.blockedClaims.some((claim) => claim.assumptionId === "recipient-interest")));

    const agentDerisking = await json("/api/opportunity-derisking/agent-infra-internship");
    assert.equal(agentDerisking.response.status, 200);
    assert.equal(agentDerisking.body.id, "agent-infra-internship");
    assert.equal(agentDerisking.body.detail, "summary");
    assert.equal(agentDerisking.body.compact, true);
    assert.equal(agentDerisking.body.refreshEndpoint, "/api/opportunity-derisking/agent-infra-internship?refresh=1");
    assert.equal(agentDerisking.body.fullDetailEndpoint, "/api/opportunity-derisking/agent-infra-internship?detail=full");
    assert.equal(agentDerisking.body.deRiskingPlanPayloadPolicy.fullDetail, false);
    assert.ok(!("deRiskSteps" in agentDerisking.body));
    assert.ok(agentDerisking.body.deRiskStepPreview.every((step) => ["read-only", "local-only", "manual-only"].includes(step.sideEffect)));
    assert.equal(agentDerisking.body.assumptionAudit.mode, "public-safe-opportunity-assumption-audit");
    assert.equal(agentDerisking.body.claimFirewall.externalWrite, false);
    assert.equal(agentDerisking.body.claimFirewall.recipientInterestBlocked, true);
    assert.ok(agentDerisking.body.artifactGapPressure.routedGaps > 0);
    assert.ok(agentDerisking.body.deRiskStepPreview.some((step) => step.source === "artifact-gap-workbench"));

    const fullAgentDerisking = await json("/api/opportunity-derisking/agent-infra-internship?detail=full");
    assert.equal(fullAgentDerisking.response.status, 200);
    assert.equal(fullAgentDerisking.body.id, "agent-infra-internship");
    assert.equal(fullAgentDerisking.body.detail, "full");
    assert.equal(fullAgentDerisking.body.compact, false);
    assert.equal(fullAgentDerisking.body.deRiskingPlanPayloadPolicy.fullDetail, true);
    assert.equal(typeof fullAgentDerisking.body.cachedFromReceipt, "boolean");
    assert.ok(fullAgentDerisking.body.deRiskSteps.every((step) => ["read-only", "local-only", "manual-only"].includes(step.sideEffect)));
    assert.ok(fullAgentDerisking.body.manualGoNoGo.forbiddenDecision.includes("claim-live-posting"));
    assert.ok(fullAgentDerisking.body.artifactGapPressure.items.length > 0);
    assert.ok(fullAgentDerisking.body.deRiskSteps.some((step) => step.source === "artifact-gap-workbench"));
    assert.ok(JSON.stringify(fullAgentDerisking.body).length > JSON.stringify(agentDerisking.body).length);

    const opportunityDeriskingPlan = await json("/api/opportunity-derisking/plan");
    assert.equal(opportunityDeriskingPlan.response.status, 200);
    assert.equal(opportunityDeriskingPlan.body.command, "npm run derisk:opportunities");

    const opportunityDeriskingHistory = await json("/api/opportunity-derisking/history");
    assert.equal(opportunityDeriskingHistory.response.status, 200);
    assert.equal(opportunityDeriskingHistory.body.mode, "proof-backed-opportunity-derisking-history");
    assert.equal(opportunityDeriskingHistory.body.detail, "summary");
    assert.equal(opportunityDeriskingHistory.body.compact, true);
    assert.equal(opportunityDeriskingHistory.body.summary.limit, 5);
    assert.equal(opportunityDeriskingHistory.body.fullDetailEndpoint, "/api/opportunity-derisking/history?detail=full");
    assert.equal(opportunityDeriskingHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(opportunityDeriskingHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(opportunityDeriskingHistory.body.historyPayloadPolicy.historyRowsReturned, opportunityDeriskingHistory.body.receipts.length);
    assert.equal(opportunityDeriskingHistory.body.sourceBoundary, undefined);
    assert.equal(opportunityDeriskingHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(opportunityDeriskingHistory.body.receiptStore, undefined);
    assert.equal(opportunityDeriskingHistory.body.receiptStoreAvailable, undefined);
    assert.equal(opportunityDeriskingHistory.body.summary.latestScore, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(opportunityDeriskingHistory.body)) < 2500);
    assert.equal(opportunityDeriskingHistory.body.definitions, undefined);
    assert.ok(Array.isArray(opportunityDeriskingHistory.body.receipts));
    assert.ok(opportunityDeriskingHistory.body.receipts.length <= 5);
    if (opportunityDeriskingHistory.body.receipts.length > 0) {
      assert.ok(Array.isArray(opportunityDeriskingHistory.body.receipts[0].planPreview));
      assert.equal(opportunityDeriskingHistory.body.receipts[0].plans, undefined);
      assert.equal(opportunityDeriskingHistory.body.receipts[0].priorityPreview, undefined);
      assert.equal(opportunityDeriskingHistory.body.receipts[0].artifactGapPreview, undefined);
      assert.equal(opportunityDeriskingHistory.body.receipts[0].checkPreview, undefined);
      assert.ok(Number.isInteger(opportunityDeriskingHistory.body.receipts[0].prioritySummary.total));
      assert.ok(Number.isInteger(opportunityDeriskingHistory.body.receipts[0].artifactGapSummary.total));
      assert.ok(Number.isInteger(opportunityDeriskingHistory.body.receipts[0].checkSummary.passed));
    }
    if (opportunityDeriskingHistory.body.receipts.length > 1) {
      assert.equal(opportunityDeriskingHistory.body.receipts[1].latestReceiptPreviewOnly, true);
      assert.equal(opportunityDeriskingHistory.body.receipts[1].checkedAt, undefined);
      assert.equal(opportunityDeriskingHistory.body.receipts[1].planPreview, undefined);
      assert.equal(typeof opportunityDeriskingHistory.body.receipts[1].trendSummary.highPrioritySteps, "number");
    }
    assert.equal(opportunityDeriskingHistory.body.nextAction, undefined);
    assert.equal(opportunityDeriskingHistory.body.verificationCommand, undefined);
    assert.equal(opportunityDeriskingHistory.body.verificationCommandAvailable, undefined);
    const fullOpportunityDeriskingHistory = await json("/api/opportunity-derisking/history?detail=full&limit=10");
    assert.equal(fullOpportunityDeriskingHistory.response.status, 200);
    assert.equal(fullOpportunityDeriskingHistory.body.detail, "full");
    assert.equal(fullOpportunityDeriskingHistory.body.compact, false);
    assert.equal(fullOpportunityDeriskingHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullOpportunityDeriskingHistory.body.receipts.length <= 10);
    assert.ok(fullOpportunityDeriskingHistory.body.receipts[0].baseUrl);
    assert.ok(fullOpportunityDeriskingHistory.body.receipts[0].plans.some((plan) => plan.deRiskSteps.some((step) => step.verificationCommand)));
    assert.ok(fullOpportunityDeriskingHistory.body.receipts[0].checks.some((check) => check.verificationCommand));

    const opportunityRanking = await json("/api/opportunity-ranking");
    assert.equal(opportunityRanking.response.status, 200);
    assert.equal(opportunityRanking.body.mode, "proof-backed-opportunity-ranking");
    assert.equal(typeof opportunityRanking.body.cachedFromReceipt, "boolean");
    assert.equal(opportunityRanking.body.refreshEndpoint, "/api/opportunity-ranking?refresh=1");
    assert.equal(opportunityRanking.body.detail, "summary");
    assert.equal(opportunityRanking.body.fullDetailEndpoint, "/api/opportunity-ranking?detail=full");
    assert.equal(opportunityRanking.body.opportunityRankingPayloadPolicy.fullDetail, false);
    assert.equal(opportunityRanking.body.summary.rankings, opportunityPackages.body.packages.length);
    assert.ok(opportunityRanking.body.summary.packageRepairActions >= opportunityRanking.body.summary.rankings);
    assert.ok(opportunityRanking.body.summary.portfolioSlots >= 4);
    assert.ok(opportunityRanking.body.summary.portfolioItems >= opportunityRanking.body.summary.rankings);
    assert.equal(opportunityRanking.body.portfolioPolicy.manualOnly, true);
    assert.equal(opportunityRanking.body.portfolioPolicy.externalWrite, false);
    assert.equal(opportunityRanking.body.portfolioPolicy.items, opportunityRanking.body.summary.portfolioItems);
    assert.equal(opportunityRanking.body.sourceBoundaryAvailable, undefined);
    assert.equal(opportunityRanking.body.checkSummary.failing, 0);
    assert.equal(opportunityRanking.body.checkSummary.portfolioAllocationPassed, true);
    assert.equal(opportunityRanking.body.checks, undefined);
    assert.equal(opportunityRanking.body.opportunityRankingPayloadPolicy.previewLimit, undefined);
    assert.equal(opportunityRanking.body.opportunityRankingPayloadPolicy.rankingsReturned, opportunityRanking.body.rankings.length);
    assert.equal(opportunityRanking.body.opportunityRankingPayloadPolicy.fullRankings, opportunityRanking.body.summary.rankings);
    assert.equal(opportunityRanking.body.opportunityRankingPayloadPolicy.fullDetailAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(opportunityRanking.body)) < 1800);
    assert.equal(opportunityRanking.body.generatedAt, undefined);
    assert.equal(opportunityRanking.body.checkedAt, undefined);
    assert.equal(opportunityRanking.body.latestReceipt, undefined);
    assert.equal(opportunityRanking.body.summaryDefinitions, undefined);
    assert.equal(opportunityRanking.body.planEndpoint, undefined);
    assert.ok(opportunityRanking.body.rankings.length <= 1);
    assert.ok(opportunityRanking.body.missingProofQueue.length <= 1);
    assert.ok(opportunityRanking.body.requirementMatrix.length <= 1);
    assert.ok(opportunityRanking.body.rankings.every((ranking) => ranking.countSummary.missingProofSteps >= 3));
    assert.ok(opportunityRanking.body.rankings.every((ranking) => ranking.countSummary.packageRepairActions >= 1));
    assert.ok(opportunityRanking.body.rankings.every((ranking) => ranking.countSummary.forbiddenActions >= 5));
    assert.ok(opportunityRanking.body.rankings.every((ranking) => ranking.missingProofPlan === undefined && ranking.sourceTrace === undefined));
    assert.ok(opportunityRanking.body.rankings.every((ranking) => !("fitScore" in ranking) && !("readinessScore" in ranking) && !("sourceTraceCount" in ranking)));
    assert.ok(opportunityRanking.body.opportunityPortfolio.some((slot) => slot.id === "proof-repair-sprint" && slot.count >= 3));
    assert.ok(opportunityRanking.body.opportunityPortfolio.some((slot) => slot.id === "do-not-automate-boundary" && slot.count >= opportunityRanking.body.summary.rankings));
    assert.ok(opportunityRanking.body.opportunityPortfolio.every((slot) => !("manualOnly" in slot) && !("externalWrite" in slot)));

    const opportunityRankingFull = await json("/api/opportunity-ranking?detail=full");
    assert.equal(opportunityRankingFull.response.status, 200);
    assert.equal(opportunityRankingFull.body.detail, "full");
    assert.equal(opportunityRankingFull.body.opportunityRankingPayloadPolicy.fullDetail, true);
    assert.ok(opportunityRankingFull.body.rankings.every((ranking) => ranking.rankFactors && ranking.evidenceProfile));

    const agentRanking = await json("/api/opportunity-ranking/agent-infra-internship");
    assert.equal(agentRanking.response.status, 200);
    assert.equal(agentRanking.body.id, "agent-infra-internship");
    assert.equal(agentRanking.body.detail, "summary");
    assert.equal(agentRanking.body.compact, true);
    assert.equal(typeof agentRanking.body.cachedFromReceipt, "boolean");
    assert.equal(agentRanking.body.refreshEndpoint, "/api/opportunity-ranking/agent-infra-internship?refresh=1");
    assert.ok(agentRanking.body.rank >= 1);
    assert.ok(agentRanking.body.countSummary.sourceTraceRows >= 4);
    assert.ok(agentRanking.body.missingProofPlan.length <= 2);
    assert.ok(agentRanking.body.sourceTracePreview.length <= 2);
    assert.equal(agentRanking.body.fullDetailEndpoint, "/api/opportunity-ranking/agent-infra-internship?detail=full");
    const agentRankingFull = await json("/api/opportunity-ranking/agent-infra-internship?detail=full");
    assert.equal(agentRankingFull.response.status, 200);
    assert.equal(agentRankingFull.body.detail, "full");
    assert.equal(agentRankingFull.body.compact, false);
    assert.ok(agentRankingFull.body.sourceTrace.some((trace) => trace.type === "opportunity-derisking-plan"));

    const opportunityRankingPlanRoute = await json("/api/opportunity-ranking/plan");
    assert.equal(opportunityRankingPlanRoute.response.status, 200);
    assert.equal(opportunityRankingPlanRoute.body.command, "npm run rank:opportunities");

    const opportunityRankingHistory = await json("/api/opportunity-ranking/history");
    assert.equal(opportunityRankingHistory.response.status, 200);
    assert.equal(opportunityRankingHistory.body.mode, "proof-backed-opportunity-ranking-history");
    assert.equal(opportunityRankingHistory.body.detail, "summary");
    assert.equal(opportunityRankingHistory.body.compact, true);
    assert.equal(opportunityRankingHistory.body.summary.limit, 5);
    assert.equal(opportunityRankingHistory.body.fullDetailEndpoint, "/api/opportunity-ranking/history?detail=full");
    assert.equal(opportunityRankingHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(opportunityRankingHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(opportunityRankingHistory.body.historyPayloadPolicy.historyRowsReturned, opportunityRankingHistory.body.receipts.length);
    assert.equal(opportunityRankingHistory.body.historyPayloadPolicy.latestTopRankings, 1);
    assert.equal(opportunityRankingHistory.body.historyPayloadPolicy.previewLimits, undefined);
    assert.equal(opportunityRankingHistory.body.historyPayloadPolicy.olderReceiptPreview, undefined);
    assert.equal(opportunityRankingHistory.body.generatedAt, undefined);
    assert.equal(opportunityRankingHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(opportunityRankingHistory.body.sourceBoundary, undefined);
    assert.equal(opportunityRankingHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(opportunityRankingHistory.body.receiptStore, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(opportunityRankingHistory.body)) < 2500);
    assert.ok(opportunityRankingHistory.body.summary.totalAvailable >= opportunityRankingHistory.body.receipts.length);
    assert.equal(opportunityRankingHistory.body.summary.latestCheckedAt, undefined);
    assert.equal(opportunityRankingHistory.body.summary.latestRankings, undefined);
    assert.ok(Array.isArray(opportunityRankingHistory.body.receipts));
    assert.ok(opportunityRankingHistory.body.receipts.every((receipt) => !("rankings" in receipt)));
    assert.equal(opportunityRankingHistory.body.receipts[0].checkedAt, undefined);
    assert.equal(opportunityRankingHistory.body.receipts[0].summary, undefined);
    assert.ok(Number.isInteger(opportunityRankingHistory.body.receipts[0].score));
    assert.ok(opportunityRankingHistory.body.receipts[0].topRankings.length > 0);
    assert.ok(opportunityRankingHistory.body.receipts[0].topRankings.length <= 1);
    assert.equal(opportunityRankingHistory.body.receipts[0].decisionLanes, undefined);
    assert.equal(opportunityRankingHistory.body.receipts[0].opportunityPortfolio, undefined);
    assert.ok(opportunityRankingHistory.body.receipts.slice(1).every((receipt) => receipt.trendOnly === true && receipt.checkedAt === undefined));
    assert.ok(opportunityRankingHistory.body.receipts.slice(1).every((receipt) => !("topRankings" in receipt) && !("decisionLanes" in receipt)));
    assert.equal(opportunityRankingHistory.body.nextActionAvailable, undefined);
    assert.equal(opportunityRankingHistory.body.verificationCommandAvailable, undefined);
    const fullOpportunityRankingHistory = await json("/api/opportunity-ranking/history?detail=full&limit=10");
    assert.equal(fullOpportunityRankingHistory.response.status, 200);
    assert.equal(fullOpportunityRankingHistory.body.detail, "full");
    assert.equal(fullOpportunityRankingHistory.body.compact, false);
    assert.equal(fullOpportunityRankingHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullOpportunityRankingHistory.body.receipts[0].rankings.length >= opportunityRanking.body.summary.rankings);

    const opportunityScorecard = await json("/api/opportunity-scorecard");
    assert.equal(opportunityScorecard.response.status, 200);
    assert.equal(opportunityScorecard.body.mode, "proof-backed-opportunity-scorecard");
    assert.equal(opportunityScorecard.body.detail, "summary");
    assert.equal(opportunityScorecard.body.generatedAt, undefined);
    assert.equal(opportunityScorecard.body.checkedAt, undefined);
    assert.equal(opportunityScorecard.body.cachePolicy, undefined);
    assert.equal(opportunityScorecard.body.fullDetailEndpoint, "/api/opportunity-scorecard?detail=full");
    assert.equal(opportunityScorecard.body.scorecardPayloadPolicy.fullDetail, false);
    assert.equal(typeof opportunityScorecard.body.cachedFromReceipt, "boolean");
    assert.equal(opportunityScorecard.body.refreshEndpoint, "/api/opportunity-scorecard?refresh=1");
    assert.equal(opportunityScorecard.body.summary.scorecards, opportunityPackages.body.packages.length);
    assert.ok(opportunityScorecard.body.summary.repairPlanItems >= opportunityScorecard.body.summary.scorecards * 3);
    assert.equal(opportunityScorecard.body.summary.routeCovered, true);
    assert.equal(opportunityScorecard.body.summary.refreshCovered, true);
    assert.ok(opportunityScorecard.body.summary.score >= 85);
    assert.equal(opportunityScorecard.body.sourceBoundaryAvailable, undefined);
    assert.equal(opportunityScorecard.body.manualUsePolicyAvailable, undefined);
    assert.equal(opportunityScorecard.body.boundaryAvailable, true);
    assert.ok(opportunityScorecard.body.checks.every((check) => check.passed));
    assert.equal(opportunityScorecard.body.scorecardPayloadPolicy.fullDetailAvailable, true);
    assert.equal(opportunityScorecard.body.scorecardPayloadPolicy.scorecardsAvailable, undefined);
    assert.ok(opportunityScorecard.body.scorecardIndex.length > 0);
    assert.ok(opportunityScorecard.body.scorecardIndex.length <= 3);
    assert.ok(opportunityScorecard.body.checkSummary.passed >= opportunityScorecard.body.checks.length);
    assert.ok(opportunityScorecard.body.checks.length <= 4);
    assert.ok(opportunityScorecard.body.dimensions.length <= 3);
    assert.ok(opportunityScorecard.body.scorecards.length <= 1);
    assert.ok(opportunityScorecard.body.scorecards.every((scorecard) => scorecard.decision.manualOnly));
    assert.ok(opportunityScorecard.body.scorecards.every((scorecard) => scorecard.repairActions.length > 0));
    assert.ok(opportunityScorecard.body.scorecards.every((scorecard) => scorecard.repairActions.some((action) => action.source === "opportunity-package-repair-plan")));
    assert.ok(opportunityScorecard.body.scorecards.every((scorecard) => !("sourceTrace" in scorecard)));
    assert.equal(opportunityScorecard.body.repairQueue, undefined);
    assert.equal(opportunityScorecard.body.nextActionAvailable, undefined);
    assert.equal(opportunityScorecard.body.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(opportunityScorecard.body)) < 1700);

    const fullOpportunityScorecard = await json("/api/opportunity-scorecard?detail=full");
    assert.equal(fullOpportunityScorecard.response.status, 200);
    assert.equal(fullOpportunityScorecard.body.detail, "full");
    assert.equal(fullOpportunityScorecard.body.scorecardPayloadPolicy.fullDetail, true);
    assert.ok(fullOpportunityScorecard.body.scorecards.every((scorecard) => Array.isArray(scorecard.sourceTrace)));
    assert.ok(JSON.stringify(fullOpportunityScorecard.body).length > JSON.stringify(opportunityScorecard.body).length);

    const agentScorecard = await json("/api/opportunity-scorecard/agent-infra-internship");
    assert.equal(agentScorecard.response.status, 200);
    assert.equal(agentScorecard.body.id, "agent-infra-internship");
    assert.equal(typeof agentScorecard.body.cachedFromReceipt, "boolean");
    assert.equal(agentScorecard.body.refreshEndpoint, "/api/opportunity-scorecard/agent-infra-internship?refresh=1");
    assert.equal(agentScorecard.body.cachePolicy, undefined);
    assert.equal(agentScorecard.body.checkedAt, undefined);
    assert.equal(agentScorecard.body.packageId, undefined);
    assert.ok(agentScorecard.body.scoreRank >= 1);
    assert.equal(agentScorecard.body.decision.externalWrite, false);
    assert.equal(agentScorecard.body.sourceTrace, undefined);
    assert.ok(agentScorecard.body.sourceTracePreview.some((trace) => trace.type === "opportunity-ranking"));
    assert.ok(agentScorecard.body.sourceTracePreview.length <= 1);
    assert.ok(agentScorecard.body.sourceTraceCount >= agentScorecard.body.sourceTracePreview.length);
    assert.ok(agentScorecard.body.repairActions.some((action) => action.source === "opportunity-package-repair-plan"));
    assert.equal(agentScorecard.body.scorecardPayloadPolicy.fullDetail, false);
    assert.equal(agentScorecard.body.scorecardPayloadPolicy.fullDetailEndpoint, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(agentScorecard.body)) < 1100);
    const fullAgentScorecard = await json("/api/opportunity-scorecard/agent-infra-internship?detail=full");
    assert.equal(fullAgentScorecard.response.status, 200);
    assert.equal(fullAgentScorecard.body.detail, "full");
    assert.ok(fullAgentScorecard.body.sourceTrace.some((trace) => trace.type === "opportunity-ranking"));

    const opportunityScorecardPlanRoute = await json("/api/opportunity-scorecard/plan");
    assert.equal(opportunityScorecardPlanRoute.response.status, 200);
    assert.equal(opportunityScorecardPlanRoute.body.command, "npm run score:opportunities");

    const opportunityScorecardHistory = await json("/api/opportunity-scorecard/history");
    assert.equal(opportunityScorecardHistory.response.status, 200);
    assert.equal(opportunityScorecardHistory.body.mode, "proof-backed-opportunity-scorecard-history");
    assert.equal(opportunityScorecardHistory.body.detail, "summary");
    assert.equal(opportunityScorecardHistory.body.compact, true);
    assert.equal(opportunityScorecardHistory.body.generatedAt, undefined);
    assert.equal(opportunityScorecardHistory.body.summary.limit, 5);
    assert.equal(opportunityScorecardHistory.body.summary.latestScore, undefined);
    assert.equal(opportunityScorecardHistory.body.summary.latestScorecards, undefined);
    assert.equal(opportunityScorecardHistory.body.boundaryAvailable, true);
    assert.equal(opportunityScorecardHistory.body.sourceBoundaryAvailable, undefined);
    assert.equal(opportunityScorecardHistory.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(opportunityScorecardHistory.body.fullDetailEndpoint, "/api/opportunity-scorecard/history?detail=full");
    assert.equal(opportunityScorecardHistory.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(opportunityScorecardHistory.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.ok(opportunityScorecardHistory.body.summary.totalAvailable >= opportunityScorecardHistory.body.receipts.length);
    assert.equal(opportunityScorecardHistory.body.definitions.evidenceAccess.fullReportEndpoint, "/api/opportunity-scorecard");
    assert.equal(opportunityScorecardHistory.body.definitions.evidenceAccess.fullHistoryEndpoint, undefined);
    assert.ok(opportunityScorecardHistory.body.definitions.checkIds.includes("scorecard-coverage"));
    assert.ok(Number.isInteger(opportunityScorecardHistory.body.definitions.counts.checks));
    assert.equal(opportunityScorecardHistory.body.definitions.checks, undefined);
    assert.ok(Array.isArray(opportunityScorecardHistory.body.receipts));
    const latestOpportunityScorecardReceipt = opportunityScorecardHistory.body.receipts[0];
    assert.ok(latestOpportunityScorecardReceipt);
    assert.ok(!latestOpportunityScorecardReceipt.report);
    assert.ok(latestOpportunityScorecardReceipt.topScorecards.some((scorecard) => scorecard.id === "agent-infra-internship"));
    assert.ok(latestOpportunityScorecardReceipt.topScorecards.every((scorecard) => Number.isInteger(scorecard.repairs)));
    assert.ok(latestOpportunityScorecardReceipt.topScorecards.every((scorecard) => scorecard.score === undefined));
    assert.equal(latestOpportunityScorecardReceipt.checkedAt, undefined);
    assert.ok(Number.isInteger(latestOpportunityScorecardReceipt.checkSummary.passed));
    assert.ok(Array.isArray(latestOpportunityScorecardReceipt.checkSummary.failed));
    assert.ok(opportunityScorecardHistory.body.receipts.slice(1).every((receipt) => receipt.topScorecards === undefined));
    assert.ok(opportunityScorecardHistory.body.receipts.slice(1).every((receipt) => !("checkedAt" in receipt)));
    assert.ok(Buffer.byteLength(JSON.stringify(opportunityScorecardHistory.body)) < 2000);
    const fullOpportunityScorecardHistory = await json("/api/opportunity-scorecard/history?detail=full&limit=10");
    assert.equal(fullOpportunityScorecardHistory.response.status, 200);
    assert.equal(fullOpportunityScorecardHistory.body.detail, "full");
    assert.equal(fullOpportunityScorecardHistory.body.compact, false);
    assert.equal(fullOpportunityScorecardHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullOpportunityScorecardHistory.body.receipts[0].baseUrl);
    assert.ok(fullOpportunityScorecardHistory.body.receipts[0].scorecards.some((scorecard) => Array.isArray(scorecard.sourceTrace)));
  });

  it("returns explained search and guide results for agent/recruiter intents", async () => {
    const search = await json("/api/search?q=agent");
    assert.equal(search.response.status, 200);
    assert.equal(search.body.mode, "public-project-search");
    assert.equal(search.body.detail, "summary");
    assert.equal(search.body.compact, true);
    assert.ok(Buffer.byteLength(JSON.stringify(search.body)) < 1800);
    assert.equal(search.body.generatedAt, undefined);
    assert.equal(search.body.fullDetailEndpoint, "/api/search?q=agent&detail=full");
    assert.equal(search.body.caseStudyEndpointTemplate, "/api/case-study/:slug");
    assert.equal(search.body.sourceBoundary, undefined);
    assert.equal(search.body.sourceBoundaryAvailable, true);
    assert.equal(search.body.searchPayloadPolicy.fullDetail, false);
    assert.equal(search.body.searchPayloadPolicy.summaryResultLimit, 5);
    assert.ok(search.body.searchPayloadPolicy.rankedResultCount >= search.body.results.length);
    assert.ok(search.body.results.length > 0);
    assert.ok(search.body.results.length <= 5);
    assert.ok(search.body.results.some((project) => project.slug === "qagent"));
    assert.match(search.body.results[0].explanation, /signal|Matches/i);
    assert.ok(search.body.results[0].evidenceSnippet.length > 20);
    assert.ok(search.body.results[0].confidenceScore > 50);
    assert.ok(Array.isArray(search.body.results[0].relatedClaims));
    assert.ok(search.body.results[0].relatedClaimCount >= search.body.results[0].relatedClaims.length);
    assert.ok(search.body.results.every((project) => !("stack" in project) && !("proof" in project) && !("tags" in project) && !("caseStudyEndpoint" in project)));
    const fullSearch = await json("/api/search?q=agent&detail=full");
    assert.equal(fullSearch.response.status, 200);
    assert.equal(fullSearch.body.detail, "full");
    assert.equal(fullSearch.body.compact, false);
    assert.equal(typeof fullSearch.body.sourceBoundary, "string");
    assert.equal(fullSearch.body.sourceBoundaryAvailable, undefined);
    assert.equal(fullSearch.body.searchPayloadPolicy.fullDetail, true);
    assert.ok(fullSearch.body.results.length >= search.body.results.length);
    assert.ok(fullSearch.body.results.some((project) => Array.isArray(project.stack) && Array.isArray(project.proof)));

    const guide = await json("/api/guide?q=recruiter");
    assert.equal(guide.response.status, 200);
    assert.equal(guide.body.detail, "summary");
    assert.equal(guide.body.compact, true);
    assert.equal(guide.body.fullDetailEndpoint, "/api/guide?q=recruiter&detail=full");
    assert.ok(Buffer.byteLength(JSON.stringify(guide.body)) < 2000);
    assert.match(guide.body.answer, /strongest match|AnchorMesh|QAgent/i);
    assert.ok(guide.body.results.length >= 4);
    assert.ok(guide.body.results.every((project) => !("stack" in project) && !("proof" in project) && !("kind" in project) && project.caseStudyEndpoint));
    assert.equal(guide.body.guidePayloadPolicy.fullDetailEndpoint, undefined);
    assert.ok(guide.body.guidePayloadPolicy.rankedResultCount >= guide.body.results.length);
    assert.equal(guide.body.intentPath.id, "recruiter");
    assert.ok(guide.body.intentPath.timeBoxedPath.length >= 4);
    assert.equal(guide.body.intentPath.riskDisclosure.length, 1);
    const fullGuide = await json("/api/guide?q=recruiter&detail=full");
    assert.equal(fullGuide.response.status, 200);
    assert.equal(fullGuide.body.detail, "full");
    assert.equal(fullGuide.body.compact, false);
    assert.ok(fullGuide.body.results.some((project) => Array.isArray(project.stack) && Array.isArray(project.proof)));
    assert.ok(fullGuide.body.intentPath.proofPath.length > 0);
  });

  it("serves public-safe claim, evidence, and trust projections", async () => {
    const claimIndex = await json("/api/claims");
    assert.equal(claimIndex.response.status, 200);
    assert.equal(claimIndex.body.mode, "public-claim-ledger");
    assert.equal(claimIndex.body.detail, "index");
    assert.equal(claimIndex.body.compact, true);
    assert.ok(Buffer.byteLength(JSON.stringify(claimIndex.body)) < 2500);
    assert.equal(claimIndex.body.generatedAt, undefined);
    assert.equal(claimIndex.body.summary.returned, claimIndex.body.claims.length);
    assert.equal(claimIndex.body.summary.indexedClaims, undefined);
    assert.equal(claimIndex.body.summary.totalAvailable, undefined);
    assert.ok(claimIndex.body.claims.length <= claimIndex.body.summary.previewLimit);
    assert.ok(claimIndex.body.claims.every((claim) => "relatedProject" in claim && claim.evidenceStrength && claim.detailEndpoint));
    assert.equal(Array.isArray(claimIndex.body.claims[0].sourceMaterial), false);
    assert.ok(!("freshnessScore" in claimIndex.body.claims[0]));
    assert.equal(claimIndex.body.sourceBoundaryAvailable, undefined);
    assert.ok(Array.isArray(claimIndex.body.projectClaimSummary));
    assert.ok(claimIndex.body.projectClaimSummary.length <= claimIndex.body.summary.projectSummaryPreviewLimit);
    assert.equal(claimIndex.body.summary.totalProjects, projects.length);
    assert.ok(claimIndex.body.projectClaimSummary.some((project) => project.slug === "qagent" && project.strongestEvidence));
    assert.ok(claimIndex.body.statusSummary.some((status) => status.status === "link-backed"));
    assert.equal(claimIndex.body.claimPayloadPolicy.fullCatalogEndpoint, undefined);
    assert.equal(claimIndex.body.claimFields, undefined);
    assert.equal(claimIndex.body.fullCatalogEndpoint, "/api/claims?detail=full");

    const claimDetail = await json(claimIndex.body.claims[0].detailEndpoint);
    assert.equal(claimDetail.response.status, 200);
    assert.equal(claimDetail.body.mode, "public-claim-detail");
    assert.equal(claimDetail.body.claim.id, claimIndex.body.claims[0].id);
    assert.ok(claimDetail.body.claim.text);
    assert.ok(Array.isArray(claimDetail.body.claim.sourceMaterial));

    const fullClaimCatalog = await json("/api/claims?detail=full");
    assert.equal(fullClaimCatalog.response.status, 200);
    assert.equal(fullClaimCatalog.body.detail, "full");
    assert.equal(fullClaimCatalog.body.compact, false);
    assert.equal(fullClaimCatalog.body.claims.length, claimIndex.body.summary.totalClaims);
    assert.ok(fullClaimCatalog.body.claims.every((claim) => Array.isArray(claim.sourceMaterial)));

    const claims = await json("/api/claims?project=qagent");
    assert.equal(claims.response.status, 200);
    assert.equal(claims.body.detail, "full");
    assert.ok(claims.body.claims.length >= 4);
    assert.ok(claims.body.claims.every((claim) => claim.relatedProject === "qagent"));
    assert.ok(claims.body.claims.every((claim) => claim.publicVisibility));
    assert.ok(claims.body.claims.every((claim) => Array.isArray(claim.sourceMaterial)));

    const evidence = await json("/api/evidence/qagent");
    assert.equal(evidence.response.status, 200);
    assert.equal(evidence.body.slug, "qagent");
    assert.equal(evidence.body.detail, "summary");
    assert.equal(evidence.body.compact, true);
    assert.equal(evidence.body.fullDetailEndpoint, "/api/evidence/qagent?detail=full");
    assert.equal(evidence.body.evidencePayloadPolicy.fullDetail, false);
    assert.equal(evidence.body.evidencePayloadPolicy.fullDetailAvailable, true);
    assert.ok(Buffer.byteLength(JSON.stringify(evidence.body)) < 1500);
    assert.ok(evidence.body.claims.some((claim) => claim.claimType === "outcome"));
    assert.ok(evidence.body.claims.every((claim) => !("text" in claim) && !("sourceMaterial" in claim) && Number.isInteger(claim.sourceCount)));
    assert.ok(evidence.body.claims.every((claim) => !("freshnessScore" in claim) && !("verificationResult" in claim)));
    assert.ok(evidence.body.claims.length <= 4);
    assert.equal(evidence.body.evidencePayloadPolicy.claimsReturned, evidence.body.claims.length);
    assert.equal(evidence.body.evidencePayloadPolicy.fullClaimCount, evidence.body.claimCount);
    assert.ok(evidence.body.confidenceScore > 50);
    assert.equal(evidence.body.proofItems, undefined);
    assert.equal(evidence.body.proofItemsAvailable, true);
    const fullEvidence = await json("/api/evidence/qagent?detail=full");
    assert.equal(fullEvidence.response.status, 200);
    assert.equal(fullEvidence.body.detail, "full");
    assert.equal(fullEvidence.body.compact, false);
    assert.equal(fullEvidence.body.evidencePayloadPolicy.fullDetail, true);
    assert.ok(fullEvidence.body.claims.every((claim) => claim.text && Array.isArray(claim.sourceMaterial)));
    assert.ok(fullEvidence.body.proofItems.length > 0);

    const trust = await json("/api/trust");
    assert.equal(trust.response.status, 200);
    assert.equal(trust.body.mode, "public-trust-summary");
    assert.equal(trust.body.detail, "summary");
    assert.equal(trust.body.compact, true);
    assert.equal(trust.body.fullDetailEndpoint, "/api/trust?detail=full");
    assert.equal(trust.body.trustPayloadPolicy.fullDetail, false);
    assert.ok(trust.body.counts.totalClaims >= projectsMinimumClaimCount());
    assert.ok(trust.body.counts.projectEvidencePackets >= 10);
    assert.ok(trust.body.strongestClaims.length > 0);
    assert.ok(trust.body.strongestClaims.length <= 4);
    assert.ok(trust.body.strongestClaims.every((claim) => claim.text && !("sourceMaterial" in claim)));
    assert.ok(trust.body.staleClaims === undefined);
    assert.ok(Number.isInteger(trust.body.staleClaimCount));
    const fullTrust = await json("/api/trust?detail=full");
    assert.equal(fullTrust.response.status, 200);
    assert.equal(fullTrust.body.detail, "full");
    assert.equal(fullTrust.body.compact, false);
    assert.equal(fullTrust.body.trustPayloadPolicy.fullDetail, true);
    assert.ok(fullTrust.body.strongestClaims.length >= trust.body.strongestClaims.length);
    assert.ok(fullTrust.body.strongestClaims.some((claim) => Array.isArray(claim.sourceMaterial)));

    const synthetic = buildClaimLedger({ projects, profile }).map((claim) => ({ ...claim }));
    synthetic.push({
      ...synthetic[0],
      id: "synthetic.public-private-conflict",
      privacyLevel: "private-reference",
      publicVisibility: "public",
    });
    const syntheticReport = detectContradictions({ projects, claims: synthetic });
    assert.ok(syntheticReport.summary.conflicts >= 1);
    assert.ok(syntheticReport.quarantine.some((item) => item.affectedClaims.includes("synthetic.public-private-conflict")));
  });

  it("keeps the private cockpit disabled on the public server path", async () => {
    const privateRoute = await fetch(`${baseUrl}/api/private/cockpit`);
    assert.equal(privateRoute.status, 404);
    const privateCockpitPlanRoute = await fetch(`${baseUrl}/api/private/cockpit/plan`);
    assert.equal(privateCockpitPlanRoute.status, 404);
    const privateCockpitHistory = await fetch(`${baseUrl}/api/private/cockpit/history`);
    assert.equal(privateCockpitHistory.status, 404);
    const privateChief = await fetch(`${baseUrl}/api/private/chief-of-staff`);
    assert.equal(privateChief.status, 404);
    const privateChiefPlan = await fetch(`${baseUrl}/api/private/chief-of-staff/plan`);
    assert.equal(privateChiefPlan.status, 404);
    const privateChiefHistory = await fetch(`${baseUrl}/api/private/chief-of-staff/history`);
    assert.equal(privateChiefHistory.status, 404);
    const privateChiefDraftsRoute = await fetch(`${baseUrl}/api/private/chief-of-staff/drafts`);
    assert.equal(privateChiefDraftsRoute.status, 404);
    const privateChiefDraftsPlanRoute = await fetch(`${baseUrl}/api/private/chief-of-staff/drafts/plan`);
    assert.equal(privateChiefDraftsPlanRoute.status, 404);
    const privateChiefDraftsHistory = await fetch(`${baseUrl}/api/private/chief-of-staff/drafts/history`);
    assert.equal(privateChiefDraftsHistory.status, 404);
    const privateChiefDraft = await fetch(`${baseUrl}/api/private/chief-of-staff/drafts/proof-repair`);
    assert.equal(privateChiefDraft.status, 404);
    const privateScheduleRoute = await fetch(`${baseUrl}/api/private/schedule`);
    assert.equal(privateScheduleRoute.status, 404);
    const privatePriorities = await fetch(`${baseUrl}/api/private/priorities`);
    assert.equal(privatePriorities.status, 404);
    const privateNextActions = await fetch(`${baseUrl}/api/private/next-actions`);
    assert.equal(privateNextActions.status, 404);
    const privateNextActionsPlanRoute = await fetch(`${baseUrl}/api/private/next-actions/plan`);
    assert.equal(privateNextActionsPlanRoute.status, 404);
    const privateNextActionsHistory = await fetch(`${baseUrl}/api/private/next-actions/history`);
    assert.equal(privateNextActionsHistory.status, 404);
    const privateTasks = await fetch(`${baseUrl}/api/private/tasks`);
    assert.equal(privateTasks.status, 404);
    const privateTasksPlan = await fetch(`${baseUrl}/api/private/tasks/plan`);
    assert.equal(privateTasksPlan.status, 404);
    const privateTasksHistory = await fetch(`${baseUrl}/api/private/tasks/history`);
    assert.equal(privateTasksHistory.status, 404);
    const privateReviewSessions = await fetch(`${baseUrl}/api/private/review-sessions`);
    assert.equal(privateReviewSessions.status, 404);
    const privateReviewSessionsPlanRoute = await fetch(`${baseUrl}/api/private/review-sessions/plan`);
    assert.equal(privateReviewSessionsPlanRoute.status, 404);
    const privateReviewSessionsHistory = await fetch(`${baseUrl}/api/private/review-sessions/history`);
    assert.equal(privateReviewSessionsHistory.status, 404);
    const privateBriefingDrafts = await fetch(`${baseUrl}/api/private/briefing-drafts`);
    assert.equal(privateBriefingDrafts.status, 404);
    const privateBriefingDraftsPlanRoute = await fetch(`${baseUrl}/api/private/briefing-drafts/plan`);
    assert.equal(privateBriefingDraftsPlanRoute.status, 404);
    const privateBriefingDraftsHistory = await fetch(`${baseUrl}/api/private/briefing-drafts/history`);
    assert.equal(privateBriefingDraftsHistory.status, 404);
    const outreachRoute = await fetch(`${baseUrl}/api/private/outreach-drafts`);
    assert.equal(outreachRoute.status, 404);
    const outreachPlanRoute = await fetch(`${baseUrl}/api/private/outreach-drafts/plan`);
    assert.equal(outreachPlanRoute.status, 404);
    const outreachHistoryRoute = await fetch(`${baseUrl}/api/private/outreach-drafts/history`);
    assert.equal(outreachHistoryRoute.status, 404);
    const privateApprovals = await fetch(`${baseUrl}/api/private/approvals`);
    assert.equal(privateApprovals.status, 404);
    const privateApprovalsPlanRoute = await fetch(`${baseUrl}/api/private/approvals/plan`);
    assert.equal(privateApprovalsPlanRoute.status, 404);
    const privateApprovalsHistory = await fetch(`${baseUrl}/api/private/approvals/history`);
    assert.equal(privateApprovalsHistory.status, 404);

    const claims = buildClaimLedger({ projects, profile });
    const trust = trustSummary({ claims, projects, domains, internalChecks, liveDemoChecks });
    const cockpit = buildPrivateCockpit({
      projects,
      claims,
      trust,
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "private-cockpit-test" }],
    });
    assert.equal(cockpit.mode, "local-private-cockpit");
    assert.equal(cockpit.summary.score, 100);
    assert.equal(cockpit.summary.latestReceiptId, "private-cockpit-test");
    assert.ok(cockpit.queues.evidenceRepairQueue.length > 0);
    assert.equal(cockpit.summary.surfaceExportLocks, cockpit.surfaceFirewall.summary.locks);
    assert.equal(cockpit.summary.manualOnlySurfaceExportLocks, cockpit.summary.surfaceExportLocks);
    assert.ok(cockpit.summary.blockedExternalActionSlots >= cockpit.summary.surfaceExportLocks * 8);
    assert.equal(cockpit.summary.externalWritesEnabled, false);
    assert.equal(cockpit.summary.publicExportsEnabled, false);
    assert.ok(cockpit.checks.every((check) => check.passed));
    assert.ok(cockpit.checks.some((check) => check.id === "private-route-manifest"));
    assert.ok(cockpit.checks.some((check) => check.id === "package-script"));
    assert.equal(cockpit.surfaceFirewall.mode, "local-private-cockpit-surface-firewall");
    assert.equal(cockpit.surfaceFirewall.externalWriteCapability, false);
    assert.equal(cockpit.surfaceFirewall.publicExportCapability, false);
    assert.equal(cockpit.surfaceFirewall.downloadCapability, false);
    assert.ok(cockpit.surfaceFirewall.blockedExternalActions.includes("export-private-cockpit"));
    assert.ok(cockpit.surfaceFirewall.blockedExternalActions.includes("mutate-third-party-system"));
    assert.ok(cockpit.surfaceFirewall.locks.every((lock) => lock.manualOnly === true && lock.localOnly === true && lock.externalWrite === false));
    assert.ok(cockpit.surfaceFirewall.locks.every((lock) => lock.publicExport === false && lock.downloadEnabled === false && lock.replacementLocalAction && lock.localVerificationCommand));
    assert.equal(cockpit.plan.endpoint, "/api/private/cockpit");
    assert.equal(privateCockpitPlan().command, "npm run cockpit:private");
    assert.ok(!JSON.stringify(cockpit).includes("/Users/"));

    const artifactCatalog = buildArtifactCatalog({ projects, claims: claims.map((claim) => ({ ...claim })) });
    const audit = buildPrivacyApprovalAudit({
      claims: claims.map((claim) => ({ ...claim })),
      artifactCatalog,
      storeInfo: { store: defaultPrivacyApprovalStore(), exists: false, relativePath: "var/private-approval-store.json" },
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "private-approval-test" }],
    });
    assert.equal(audit.mode, "local-privacy-approval-audit");
    assert.equal(audit.counts.score, 100);
    assert.equal(audit.counts.latestReceiptId, "private-approval-test");
    assert.ok(audit.counts.pending > 0);
    assert.ok(audit.approvalQueue.every((item) => item.publicProjection === "withheld-private-material"));
    assert.equal(audit.counts.approvalDecisionGates, audit.counts.candidates);
    assert.equal(audit.counts.manualOnlyApprovalDecisionGates, audit.counts.approvalDecisionGates);
    assert.ok(audit.counts.blockedExternalActionSlots >= audit.counts.approvalDecisionGates * 8);
    assert.ok(audit.checks.every((check) => check.passed));
    assert.ok(audit.checks.some((check) => check.id === "private-route-manifest"));
    assert.ok(audit.checks.some((check) => check.id === "package-script"));
    assert.equal(audit.approvalDecisionGates.mode, "local-private-approval-decision-gates");
    assert.equal(audit.approvalDecisionGates.externalWriteCapability, false);
    assert.equal(audit.approvalDecisionGates.publicProjectionWriteCapability, false);
    assert.equal(audit.approvalDecisionGates.summary.gates, audit.counts.candidates);
    assert.equal(audit.approvalDecisionGates.summary.manualOnlyGates, audit.approvalDecisionGates.summary.gates);
    assert.ok(audit.approvalDecisionGates.blockedExternalActions.includes("publish-private-material"));
    assert.ok(audit.approvalDecisionGates.blockedExternalActions.includes("mutate-third-party-system"));
    assert.ok(audit.approvalDecisionGates.gates.every((gate) => gate.manualOnly === true && gate.localOnly === true && gate.externalWrite === false));
    assert.ok(audit.approvalDecisionGates.gates.every((gate) => gate.publicProjectionWrite === false && gate.replacementLocalAction && gate.localVerificationCommand));
    assert.equal(audit.plan.endpoint, "/api/private/approvals");
    assert.equal(privacyApprovalPlan().command, "npm run approve:private");

    const opportunities = buildOpportunityRadar({ projects, claims });
    const intentPaths = require("../data/intent-model").buildIntentPaths({
      projects,
      claims: claims.map((claim) => ({ ...claim })),
      artifactCatalog,
      opportunities,
    });
    const packets = buildAudiencePackets({
      projects,
      claims: claims.map((claim) => ({ ...claim })),
      artifactCatalog,
      intentPaths,
      opportunities,
      trust,
    });
    const maintenance = require("../data/maintenance-model").buildMaintenanceReport({
      projects,
      claims: claims.map((claim) => ({ ...claim })),
      trust,
      artifactCatalog,
      statusReceipts: [],
    });
    const proofTrials = buildProofTrials({ projects, claims: claims.map((claim) => ({ ...claim })), artifactCatalog });
    const selfReviews = buildSelfReviewReports({
      projects,
      claims: claims.map((claim) => ({ ...claim })),
      trust,
      opportunities,
      maintenance,
      artifactCatalog,
      packets,
      proofTrials,
      receipts: {
        statusReceipts: [],
        evidenceRefreshReceipts: [],
        accessibilityReports: [],
        performanceReports: [],
        visualReports: [],
      },
    });
    const nextActionPlan = buildPrivateNextActionPlan({
      projects,
      claims: claims.map((claim) => ({ ...claim })),
      maintenance,
      opportunities,
      packets,
      selfReviews,
      artifactCatalog,
      proofTrials,
      privacyApprovalAudit: audit,
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "private-next-actions-test" }],
    });
    assert.equal(nextActionPlan.mode, "local-private-next-action-plan");
    assert.equal(nextActionPlan.summary.score, 100);
    assert.equal(nextActionPlan.summary.latestReceiptId, "private-next-actions-test");
    assert.ok(nextActionPlan.actions.length > 0);
    assert.ok(nextActionPlan.actions.every((action) => action.verificationCommand));
    assert.equal(nextActionPlan.summary.actionExecutionLocks, nextActionPlan.actions.length);
    assert.equal(nextActionPlan.summary.manualOnlyActionExecutionLocks, nextActionPlan.summary.actionExecutionLocks);
    assert.ok(nextActionPlan.summary.blockedExternalActionSlots >= nextActionPlan.summary.actionExecutionLocks * 8);
    assert.equal(nextActionPlan.summary.externalWritesEnabled, false);
    assert.ok(nextActionPlan.checks.every((check) => check.passed));
    assert.ok(nextActionPlan.checks.some((check) => check.id === "private-route-manifest"));
    assert.ok(nextActionPlan.checks.some((check) => check.id === "package-script"));
    assert.ok(nextActionPlan.actions.every((action) => action.manualOnly === true && action.localOnly === true && action.externalWrite === false));
    assert.ok(nextActionPlan.actions.every((action) => action.forbiddenActions.includes("send-email") && action.forbiddenActions.includes("mutate-third-party-system")));
    assert.equal(nextActionPlan.actionExecutionLocks.mode, "local-private-next-action-execution-locks");
    assert.equal(nextActionPlan.actionExecutionLocks.externalWriteCapability, false);
    assert.equal(nextActionPlan.actionExecutionLocks.taskExecutionCapability, false);
    assert.equal(nextActionPlan.actionExecutionLocks.summary.locks, nextActionPlan.actions.length);
    assert.equal(nextActionPlan.actionExecutionLocks.summary.manualOnlyLocks, nextActionPlan.actionExecutionLocks.summary.locks);
    assert.equal(nextActionPlan.actionExecutionLocks.summary.executableActions, 0);
    assert.ok(nextActionPlan.actionExecutionLocks.blockedExternalActions.includes("submit-application"));
    assert.ok(nextActionPlan.actionExecutionLocks.blockedExternalActions.includes("mutate-third-party-system"));
    assert.ok(nextActionPlan.actionExecutionLocks.locks.every((lock) => lock.manualOnly === true && lock.localOnly === true && lock.externalWrite === false && lock.executable === false));
    assert.ok(nextActionPlan.actionExecutionLocks.locks.every((lock) => lock.replacementLocalAction && lock.localVerificationCommand));
    assert.equal(nextActionPlan.plan.endpoint, "/api/private/next-actions");
    assert.equal(privateNextActionsPlan().command, "npm run plan:private");

    const taskTracker = buildPrivateTaskTracker({
      nextActionPlan,
      storeInfo: {
        store: defaultPrivateTaskStore(),
        exists: false,
        relativePath: "var/private-task-store.json",
      },
    });
    assert.equal(taskTracker.mode, "local-private-task-tracker");
    assert.equal(taskTracker.counts.score, 100);
    assert.equal(taskTracker.counts.tasks, nextActionPlan.actions.length);
    assert.equal(taskTracker.counts.mutationLocks, taskTracker.counts.tasks);
    assert.equal(taskTracker.counts.manualOnlyMutationLocks, taskTracker.counts.mutationLocks);
    assert.ok(taskTracker.counts.blockedExternalActionSlots >= taskTracker.counts.mutationLocks * 8);
    assert.ok(taskTracker.checks.every((check) => check.passed));
    assert.ok(taskTracker.tasks.every((task) => task.tracking.status === "open"));
    assert.ok(taskTracker.tasks.every((task) => task.manualOnly === true && task.externalWrite === false));
    assert.equal(taskTracker.mutationGuard.mode, "local-private-task-mutation-guard");
    assert.equal(taskTracker.mutationGuard.externalWriteCapability, false);
    assert.equal(taskTracker.mutationGuard.summary.locks, taskTracker.tasks.length);
    assert.equal(taskTracker.mutationGuard.summary.manualOnlyLocks, taskTracker.mutationGuard.summary.locks);
    assert.ok(taskTracker.mutationGuard.blockedExternalActions.includes("sync-task"));
    assert.ok(taskTracker.mutationGuard.blockedExternalActions.includes("mutate-third-party-system"));
    assert.ok(taskTracker.mutationGuard.locks.every((lock) => lock.replacementLocalAction && lock.localVerificationCommand));
    assert.equal(taskTracker.plan.endpoint, "/api/private/tasks");
    assert.equal(privateTaskTrackerPlan().command, "npm run tasks:private");

    const outreachDrafts = buildOutreachDraftCatalog({
      opportunities,
      packets,
      projects,
      claims: claims.map((claim) => ({ ...claim })),
      storeInfo: {
        store: defaultOutreachDraftStore(),
        exists: false,
        relativePath: "var/outreach-draft-store.json",
      },
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "private-outreach-test" }],
    });
    assert.equal(outreachDrafts.mode, "local-private-outreach-drafts");
    assert.equal(outreachDrafts.counts.score, 100);
    assert.ok(outreachDrafts.drafts.length > 0);
    assert.equal(outreachDrafts.counts.sendPreventionGates, outreachDrafts.drafts.length);
    assert.equal(outreachDrafts.counts.manualOnlySendPreventionGates, outreachDrafts.counts.sendPreventionGates);
    assert.ok(outreachDrafts.counts.blockedExternalActionSlots >= outreachDrafts.counts.sendPreventionGates * 8);
    assert.equal(outreachDrafts.counts.latestReceiptId, "private-outreach-test");
    assert.ok(outreachDrafts.checks.every((check) => check.passed));
    assert.ok(outreachDrafts.drafts.every((draft) => /never send or submit automatically/i.test(draft.sendPolicy)));
    assert.equal(outreachDrafts.sendPrevention.mode, "local-private-outreach-send-prevention-gates");
    assert.equal(outreachDrafts.sendPrevention.sendCapability, false);
    assert.equal(outreachDrafts.sendPrevention.submitCapability, false);
    assert.equal(outreachDrafts.sendPrevention.summary.sendableDrafts, 0);
    assert.ok(outreachDrafts.sendPrevention.blockedExternalActions.includes("send-email"));
    assert.ok(outreachDrafts.sendPrevention.blockedExternalActions.includes("mutate-third-party-system"));
    assert.ok(outreachDrafts.sendPrevention.gates.every((gate) => gate.sendAllowed === false && gate.submitAllowed === false && gate.externalWrite === false));
    assert.ok(outreachDrafts.sendPrevention.gates.every((gate) => gate.replacementLocalAction && gate.localVerificationCommand && gate.status === "draft-only-unsent"));
    assert.equal(outreachDrafts.plan.endpoint, "/api/private/outreach-drafts");
    assert.equal(outreachDraftPlan().command, "npm run outreach:private");

    const reviewSessions = buildPrivateReviewSessions({
      nextActionPlan,
      taskTracker,
      outreachDrafts,
      privacyApprovalAudit: audit,
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "private-review-test" }],
    });
    assert.equal(reviewSessions.mode, "local-private-review-sessions");
    assert.equal(reviewSessions.summary.score, 100);
    assert.ok(reviewSessions.sessions.length >= 3);
    assert.equal(reviewSessions.summary.decisionGates, reviewSessions.sessions.length);
    assert.equal(reviewSessions.summary.manualOnlyDecisionGates, reviewSessions.summary.decisionGates);
    assert.ok(reviewSessions.summary.blockedExternalActionSlots >= reviewSessions.summary.decisionGates * 8);
    assert.equal(reviewSessions.summary.latestReceiptId, "private-review-test");
    assert.ok(reviewSessions.checks.every((check) => check.passed));
    assert.ok(reviewSessions.checks.some((check) => check.id === "decision-gate-depth"));
    assert.ok(reviewSessions.checks.some((check) => check.id === "private-route-manifest"));
    assert.ok(reviewSessions.checks.some((check) => check.id === "package-script"));
    assert.match(reviewSessions.schedulingPolicy, /No calendar events/);
    assert.equal(reviewSessions.decisionGates.mode, "local-private-review-decision-gates");
    assert.equal(reviewSessions.decisionGates.externalWriteCapability, false);
    assert.equal(reviewSessions.decisionGates.summary.gates, reviewSessions.sessions.length);
    assert.equal(reviewSessions.decisionGates.summary.manualOnlyGates, reviewSessions.decisionGates.summary.gates);
    assert.ok(reviewSessions.decisionGates.blockedExternalActions.includes("create-calendar-event"));
    assert.ok(reviewSessions.decisionGates.blockedExternalActions.includes("mutate-third-party-system"));
    assert.ok(reviewSessions.decisionGates.gates.every((gate) => gate.manualOnly === true && gate.localOnly === true && gate.externalWrite === false));
    assert.ok(reviewSessions.decisionGates.gates.every((gate) => gate.replacementLocalAction && gate.localVerificationCommand && gate.status === "review-only"));
    assert.equal(reviewSessions.plan.endpoint, "/api/private/review-sessions");
    assert.equal(privateReviewSessionsPlan().command, "npm run review:private");

    const opportunityPackages = buildOpportunityPackages({
      opportunities,
      packets,
      artifactCatalog,
      weaknessMap: buildProjectWeaknessMap({ projects, claims: claims.map((claim) => ({ ...claim })), artifactCatalog, maintenance, proofTrials }),
      maintenance,
      proofTrials,
      claims: claims.map((claim) => ({ ...claim })),
    });
    const narratives = buildNarrativeGroundingReport({ packets, claims: claims.map((claim) => ({ ...claim })), artifactCatalog, opportunities });
    const testGraph = {
      nodes: [
        { id: "rishabh", label: "Rishabh", type: "person" },
        ...projects.map((project) => ({ id: project.slug, label: project.title, type: "project" })),
        ...claims.filter((claim) => claim.relatedProject).map((claim) => ({ id: claim.id, label: claim.text, type: "claim" })),
        ...opportunities.opportunities.map((opportunity) => ({ id: `opportunity-${opportunity.id}`, label: opportunity.label, type: "opportunity" })),
      ],
      edges: [
        ...projects.map((project) => ({ source: "rishabh", target: project.slug, relation: "built", explanation: `${project.title} is modeled.` })),
        ...claims
          .filter((claim) => claim.relatedProject)
          .map((claim) => ({ source: claim.relatedProject, target: claim.id, relation: "supports-claim", explanation: `${claim.relatedProject} supports ${claim.id}.` })),
        ...opportunities.opportunities.flatMap((opportunity) =>
          opportunity.relatedProof.map((proof) => ({
            source: proof.slug,
            target: `opportunity-${opportunity.id}`,
            relation: "fits-opportunity",
            explanation: `${proof.slug} contributes to ${opportunity.id}.`,
          })),
        ),
      ],
    };
    const graphQuality = buildGraphQualityReport({ graph: testGraph, projects, claims: claims.map((claim) => ({ ...claim })), opportunities, artifactCatalog });
    const graphCrosslinks = buildGraphCrosslinkReport({
      projects,
      claims: claims.map((claim) => ({ ...claim })),
      artifactCatalog,
      opportunities,
      narratives,
      maintenance,
    });
    const graphScoreboard = buildGraphScoreboard({
      graph: testGraph,
      graphQuality,
      graphCrosslinks,
      projects,
      claims: claims.map((claim) => ({ ...claim })),
      artifactCatalog,
      opportunities,
      maintenance,
      weaknessMap: buildProjectWeaknessMap({ projects, claims: claims.map((claim) => ({ ...claim })), artifactCatalog, maintenance, proofTrials }),
      skillGapMap: buildSkillGapMap({ projects, claims: claims.map((claim) => ({ ...claim })), artifactCatalog }),
      contradictions: detectContradictions({ projects, claims: claims.map((claim) => ({ ...claim })) }),
      narratives,
      packets,
    });
    const artifactTranscripts = buildArtifactTranscriptLibrary({ projects, claims: claims.map((claim) => ({ ...claim })), artifactCatalog });
    const briefingDrafts = buildPrivateBriefingDrafts({
      nextActionPlan,
      taskTracker,
      reviewSessions,
      outreachDrafts,
      opportunityPackages,
      selfReviews,
      graphScoreboard,
      artifactTranscripts,
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "private-brief-test" }],
    });
    assert.equal(briefingDrafts.mode, "local-private-chief-of-staff-briefing-drafts");
    assert.equal(briefingDrafts.summary.score, 100);
    assert.equal(briefingDrafts.summary.externalWritesEnabled, false);
    assert.equal(briefingDrafts.summary.decisionGates, briefingDrafts.drafts.length);
    assert.equal(briefingDrafts.summary.manualOnlyDecisionGates, briefingDrafts.summary.decisionGates);
    assert.ok(briefingDrafts.summary.blockedExternalActionSlots >= briefingDrafts.summary.decisionGates * 8);
    assert.equal(briefingDrafts.summary.latestReceiptId, "private-brief-test");
    assert.ok(briefingDrafts.checks.every((check) => check.passed));
    assert.ok(briefingDrafts.checks.some((check) => check.id === "decision-gate-depth"));
    assert.ok(briefingDrafts.checks.some((check) => check.id === "private-route-manifest"));
    assert.ok(briefingDrafts.checks.some((check) => check.id === "package-script"));
    assert.match(briefingDrafts.operatingPolicy, /No calendar events/);
    assert.ok(briefingDrafts.drafts.every((draft) => draft.forbiddenActions.includes("send-email")));
    assert.equal(briefingDrafts.decisionGates.mode, "local-private-briefing-decision-gates");
    assert.equal(briefingDrafts.decisionGates.externalWriteCapability, false);
    assert.equal(briefingDrafts.decisionGates.summary.gates, briefingDrafts.drafts.length);
    assert.equal(briefingDrafts.decisionGates.summary.manualOnlyGates, briefingDrafts.decisionGates.summary.gates);
    assert.ok(briefingDrafts.decisionGates.blockedExternalActions.includes("send-email"));
    assert.ok(briefingDrafts.decisionGates.blockedExternalActions.includes("mutate-third-party-system"));
    assert.ok(briefingDrafts.decisionGates.gates.every((gate) => gate.manualOnly === true && gate.localOnly === true && gate.externalWrite === false));
    assert.ok(briefingDrafts.decisionGates.gates.every((gate) => gate.replacementLocalAction && gate.localVerificationCommand && gate.status === "brief-review-only"));
    assert.equal(briefingDrafts.plan.endpoint, "/api/private/briefing-drafts");
    assert.equal(privateBriefingDraftsPlan().command, "npm run brief:private");

    const chiefReadiness = buildPrivateChiefOfStaffReadiness({
      cockpit,
      nextActionPlan,
      taskTracker,
      reviewSessions,
      briefingDrafts,
      privacyApprovalAudit: audit,
      outreachDrafts,
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "private-chief-test" }],
    });
    assert.equal(chiefReadiness.mode, "local-private-chief-of-staff-readiness");
    assert.ok(chiefReadiness.summary.score >= 85);
    assert.equal(chiefReadiness.summary.externalWritesEnabled, false);
    assert.equal(chiefReadiness.summary.routeCovered, true);
    assert.equal(chiefReadiness.summary.latestReceiptId, "private-chief-test");
    assert.ok(chiefReadiness.summary.reviewBoardItems >= 5);
    assert.equal(chiefReadiness.summary.manualReviewGates, chiefReadiness.summary.reviewBoardItems);
    assert.ok(chiefReadiness.summary.scheduleHandOffItems >= 5);
    assert.ok(chiefReadiness.summary.scheduleHandOffBlockedExternalActions >= chiefReadiness.summary.scheduleHandOffItems * 6);
    assert.ok(chiefReadiness.checks.every((check) => check.passed));
    assert.ok(chiefReadiness.checks.some((check) => check.id === "review-board-coverage"));
    assert.ok(chiefReadiness.checks.some((check) => check.id === "review-stop-conditions"));
    assert.ok(chiefReadiness.checks.some((check) => check.id === "schedule-handoff"));
    assert.ok(chiefReadiness.checks.some((check) => check.id === "receipt-route-coverage"));
    assert.ok(chiefReadiness.checks.some((check) => check.id === "package-script"));
    assert.ok(chiefReadiness.lanes.some((lane) => lane.id === "privacy-approval"));
    assert.equal(chiefReadiness.reviewBoard.mode, "local-private-chief-review-board");
    assert.equal(chiefReadiness.reviewBoard.summary.externalWritesEnabled, false);
    assert.ok(chiefReadiness.reviewBoard.items.every((item) => item.manualOnly === true && item.externalWrite === false));
    assert.ok(chiefReadiness.reviewBoard.items.every((item) => item.stopConditions.some((condition) => /email|calendar|submission|deploy|payment/i.test(condition))));
    assert.equal(chiefReadiness.scheduleHandOff.mode, "local-private-chief-schedule-handoff");
    assert.equal(chiefReadiness.scheduleHandOff.summary.externalWritesEnabled, false);
    assert.ok(chiefReadiness.scheduleHandOff.items.every((item) => item.manualOnly === true && item.calendarWrite === false && item.reminderWrite === false && item.externalWrite === false));
    assert.ok(chiefReadiness.scheduleHandOff.items.every((item) => item.blockedExternalActions.includes("create-calendar-event") && item.verificationCommand));
    assert.ok(chiefReadiness.today.reviewItem);
    assert.equal(chiefReadiness.plan.endpoint, "/api/private/chief-of-staff");
    assert.equal(privateChiefOfStaffPlan().command, "npm run chief:private");

    const privateSchedule = buildPrivateSchedule({
      chiefReadiness,
      nextActionPlan,
      taskTracker,
      reviewSessions,
      briefingDrafts,
      privacyApprovalAudit: audit,
      outreachDrafts,
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "private-schedule-test" }],
    });
    assert.equal(privateSchedule.mode, "local-private-chief-of-staff-schedule");
    assert.equal(privateSchedule.summary.externalWritesEnabled, false);
    assert.equal(privateSchedule.summary.calendarEventsCreated, 0);
    assert.ok(privateSchedule.summary.reviewWindows >= 5);
    assert.equal(privateSchedule.summary.manualOnlyWindows, privateSchedule.summary.reviewWindows);
    assert.ok(privateSchedule.summary.blockedExternalWrites >= privateSchedule.summary.reviewWindows * 6);
    assert.ok(privateSchedule.summary.staleProofWindows >= 1);
    assert.ok(privateSchedule.checks.every((check) => check.passed));
    assert.ok(privateSchedule.checks.some((check) => check.id === "review-window-depth"));
    assert.ok(privateSchedule.checks.some((check) => check.id === "calendar-firewall"));
    assert.ok(privateSchedule.checks.some((check) => check.id === "stale-proof-pressure-window"));
    assert.ok(privateSchedule.checks.some((check) => check.id === "window-source-trace"));
    assert.equal(privateSchedule.calendarFirewall.mode, "local-private-calendar-firewall");
    assert.equal(privateSchedule.calendarFirewall.externalWriteCapability, false);
    assert.ok(privateSchedule.calendarFirewall.blockedExternalActions.includes("create-calendar-event"));
    assert.ok(privateSchedule.reviewWindows.every((window) => window.manualOnly === true && window.calendarWrite === false && window.reminderWrite === false && window.externalWrite === false));
    assert.ok(privateSchedule.reviewWindows.every((window) => window.primaryBlockId && window.sourceTrace.length >= 4 && window.blockedExternalActions.includes("create-calendar-event") && window.verificationCommand));
    assert.ok(privateSchedule.schedule.length >= 8);
    assert.ok(privateSchedule.schedule.every((block) => block.calendarWrite === false && block.externalWrite === false && block.manualOnly === true));
    assert.ok(privateSchedule.schedule.some((block) => block.kind === "review-session"));
    assert.equal(privateSchedule.plan.endpoint, "/api/private/schedule");
    assert.equal(privateSchedulePlan().command, "npm run schedule:private");

    const privateArtifactGapRepair = {
      summary: { repairItems: 1 },
      repairQueue: [
        {
          gapId: "anchormesh.screenshot-gap",
          projectTitle: "AnchorMesh",
          priority: "high",
          unlockScore: 92,
          opportunityUnlockCount: 1,
          deRiskAdvanceCount: 1,
          linkedOpportunityIds: ["research-lab-accessibility"],
          linkedDeRiskPlanIds: ["research-lab-accessibility"],
          nextAction: "Capture or approve a public-safe screenshot for AnchorMesh, then attach it as a served artifact with source trace.",
          verificationCommand: "npm run repair:proof-gaps",
        },
      ],
    };
    const privatePriorityReport = buildPrivatePrioritizationReport({
      chiefReadiness,
      nextActionPlan,
      taskTracker,
      schedule: privateSchedule,
      reviewSessions,
      briefingDrafts,
      privacyApprovalAudit: audit,
      outreachDrafts,
      artifactGapRepair: privateArtifactGapRepair,
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "private-priority-test" }],
    });
    assert.equal(privatePriorityReport.mode, "local-private-chief-of-staff-prioritization");
    assert.equal(privatePriorityReport.summary.externalWritesEnabled, false);
    assert.equal(privatePriorityReport.summary.reviewRequired, true);
    assert.ok(privatePriorityReport.summary.priorityItems >= 18);
    assert.equal(privatePriorityReport.summary.artifactGapRepairItems, 1);
    assert.ok(privatePriorityReport.summary.artifactGapRepairPriorities > 0);
    assert.ok(privatePriorityReport.summary.lanesCovered >= 5);
    assert.equal(privatePriorityReport.summary.executionLocks, privatePriorityReport.summary.priorityItems);
    assert.equal(privatePriorityReport.summary.manualOnlyExecutionLocks, privatePriorityReport.summary.executionLocks);
    assert.ok(privatePriorityReport.summary.blockedExternalActionSlots >= privatePriorityReport.summary.executionLocks * 8);
    assert.equal(privatePriorityReport.summary.replacementLocalActions, privatePriorityReport.summary.executionLocks);
    assert.ok(privatePriorityReport.checks.every((check) => check.passed));
    assert.ok(privatePriorityReport.checks.some((check) => check.id === "execution-firewall-depth"));
    assert.ok(privatePriorityReport.checks.some((check) => check.id === "execution-lock-manual-only"));
    assert.ok(privatePriorityReport.checks.some((check) => check.id === "blocked-external-action-slots"));
    assert.ok(privatePriorityReport.checks.some((check) => check.id === "replacement-local-actions"));
    assert.ok(privatePriorityReport.checks.some((check) => check.id === "artifact-gap-repair-priorities"));
    assert.ok(privatePriorityReport.priorityItems.some((item) => item.kind === "artifact-gap-proof-repair" && item.laneId === "proof-repair"));
    assert.ok(privatePriorityReport.priorityItems.every((item) => item.manualOnly === true && item.externalWrite === false));
    assert.ok(privatePriorityReport.priorityItems.every((item) => item.forbiddenActions.includes("send-email")));
    assert.equal(privatePriorityReport.executionFirewall.mode, "local-private-priority-execution-firewall");
    assert.equal(privatePriorityReport.executionFirewall.externalWriteCapability, false);
    assert.equal(privatePriorityReport.executionFirewall.summary.locks, privatePriorityReport.priorityItems.length);
    assert.equal(privatePriorityReport.executionFirewall.summary.manualOnlyLocks, privatePriorityReport.executionFirewall.summary.locks);
    assert.equal(privatePriorityReport.executionFirewall.summary.replacementLocalActions, privatePriorityReport.executionFirewall.summary.locks);
    assert.ok(privatePriorityReport.executionFirewall.summary.blockedExternalActionSlots >= privatePriorityReport.executionFirewall.summary.locks * 8);
    assert.ok(privatePriorityReport.executionFirewall.blockedExternalActions.includes("mutate-third-party-system"));
    assert.ok(privatePriorityReport.executionFirewall.locks.every((lock) => lock.manualOnly === true && lock.localOnly === true && lock.externalWrite === false && lock.humanOnlyHandoff === true));
    assert.ok(privatePriorityReport.executionFirewall.locks.every((lock) => lock.blockedActions.includes("send-email") && lock.blockedActions.includes("submit-application") && lock.blockedActions.includes("mutate-third-party-system")));
    assert.ok(privatePriorityReport.executionFirewall.locks.every((lock) => lock.replacementLocalAction && lock.localVerificationCommand));
    assert.equal(privatePriorityReport.plan.endpoint, "/api/private/priorities");
    assert.equal(privatePrioritizationPlan().command, "npm run prioritize:private");

    const privateChiefDrafts = buildPrivateChiefDraftsReport({
      chiefReadiness,
      schedule: privateSchedule,
      priorities: privatePriorityReport,
      briefingDrafts,
      reviewSessions,
      privacyApprovalAudit: audit,
      outreachDrafts,
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "private-chief-drafts-test" }],
    });
    assert.equal(privateChiefDrafts.mode, "local-private-chief-of-staff-draft-packets");
    assert.equal(privateChiefDrafts.summary.externalWritesEnabled, false);
    assert.equal(privateChiefDrafts.summary.sendableDrafts, 0);
    assert.equal(privateChiefDrafts.summary.routeCovered, true);
    assert.equal(privateChiefDrafts.summary.latestReceiptId, "private-chief-drafts-test");
    assert.ok(privateChiefDrafts.summary.drafts >= 5);
    assert.ok(privateChiefDrafts.checks.every((check) => check.passed));
    assert.ok(privateChiefDrafts.drafts.every((draft) => draft.manualOnly === true && draft.externalUseAllowed === false));
    assert.ok(privateChiefDrafts.drafts.every((draft) => draft.forbiddenActions.includes("send-email")));
    assert.ok(privateChiefDrafts.drafts.every((draft) => draft.sections.some((section) => section.id === "boundary")));
    assert.equal(privateChiefDrafts.plan.endpoint, "/api/private/chief-of-staff/drafts");
    assert.equal(privateChiefDraftsPlan().command, "npm run draft:private");
    assert.equal(selectPrivateChiefDraft("proof-repair", privateChiefDrafts).laneId, "proof-repair");
  });

  it("serves an evidence-derived opportunity radar without fake deadlines", async () => {
    const opportunities = await json("/api/opportunities");
    assert.equal(opportunities.response.status, 200);
    assert.equal(opportunities.body.mode, "archetype-radar");
    assert.equal(opportunities.body.detail, "summary");
    assert.equal(opportunities.body.compact, true);
    assert.equal(opportunities.body.fullDetailEndpoint, "/api/opportunities?detail=full");
    assert.equal(opportunities.body.opportunityPayloadPolicy.fullDetail, false);
    assert.ok(Buffer.byteLength(JSON.stringify(opportunities.body)) < 2500);
    assert.ok(opportunities.body.opportunities.length >= 5);
    assert.ok(opportunities.body.opportunities.length <= opportunities.body.opportunityPayloadPolicy.opportunityPreviewLimit);
    assert.ok(opportunities.body.opportunityPayloadPolicy.opportunitiesAvailable >= opportunities.body.opportunities.length);
    assert.equal(opportunities.body.deadlinePolicy, "archetype-only-no-live-deadlines");
    assert.ok(opportunities.body.opportunities.some((opportunity) => typeof opportunity.proofSlug === "string"));
    assert.ok(opportunities.body.opportunities.every((opportunity) => opportunity.rankingFactors === undefined && opportunity.rankExplanationAvailable === undefined));
    assert.ok(opportunities.body.opportunities.every((opportunity) => Number.isInteger(opportunity.fitScore) && Number.isInteger(opportunity.matchedProjectCount)));
    assert.ok(opportunities.body.opportunities.every((opportunity) => Number.isInteger(opportunity.sourceTraceCount) && opportunity.sourceTraceCount > 0 && !("sourceTrace" in opportunity)));
    assert.ok(opportunities.body.opportunities.every((opportunity) => !("whyItFits" in opportunity) && !("suggestedNarrative" in opportunity)));
    assert.ok(opportunities.body.opportunities.every((opportunity) => !("rankExplanation" in opportunity) && !("risk" in opportunity) && !("nextAction" in opportunity)));
    assert.ok(opportunities.body.opportunities.every((opportunity) => Number.isInteger(opportunity.missingProofCount)));
    assert.equal(opportunities.body.sourceBoundaryAvailable, undefined);
    assert.equal(opportunities.body.opportunityPayloadPolicy.nextActionsAvailable, undefined);

    const fullOpportunities = await json("/api/opportunities?detail=full");
    assert.equal(fullOpportunities.response.status, 200);
    assert.equal(fullOpportunities.body.detail, "full");
    assert.equal(fullOpportunities.body.compact, false);
    assert.equal(fullOpportunities.body.opportunityPayloadPolicy.fullDetail, true);
    assert.ok(fullOpportunities.body.opportunities.length >= opportunities.body.opportunityPayloadPolicy.opportunitiesAvailable);
    assert.ok(fullOpportunities.body.opportunities.every((opportunity) => opportunity.whyItFits && opportunity.suggestedNarrative));
    assert.ok(fullOpportunities.body.opportunities.every((opportunity) => Array.isArray(opportunity.applicationRequirements)));
    assert.ok(JSON.stringify(fullOpportunities.body).length > JSON.stringify(opportunities.body).length);

    const claims = buildClaimLedger({ projects, profile });
    const radar = buildOpportunityRadar({ projects, claims });
    assert.equal(radar.mode, "archetype-radar");
    assert.ok(radar.nextActions.length > 0);

    const catalog = buildArtifactCatalog({ projects, claims: claims.map((claim) => ({ ...claim })) });
    assert.equal(catalog.mode, "public-artifact-catalog");
    assert.ok(catalog.counts.terminalReplays >= projects.length);
    assert.ok(catalog.counts.terminalTranscripts >= projects.length);

    const proofTrials = buildProofTrials({
      projects,
      claims: claims.map((claim) => ({ ...claim })),
      artifactCatalog: catalog,
      routeManifest: runtimeRouteManifest(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "proof-trials-test" }],
    });
    assert.equal(proofTrials.mode, "safe-live-proof-trials");
    assert.equal(proofTrials.summary.score, 100);
    assert.equal(proofTrials.summary.latestReceiptId, "proof-trials-test");
    assert.equal(proofTrials.summary.writeEnabledTrials, 0);
    assert.equal(proofTrials.summary.sandboxLocks, proofTrials.summary.totalTrials);
    assert.equal(proofTrials.summary.readOnlySandboxLocks, proofTrials.summary.sandboxLocks);
    assert.equal(proofTrials.summary.credentialsEnabled, false);
    assert.equal(proofTrials.summary.externalWritesEnabled, false);
    assert.ok(proofTrials.checks.every((check) => check.passed));
    assert.ok(proofTrials.checks.some((check) => check.id === "public-route-manifest"));
    assert.ok(proofTrials.checks.some((check) => check.id === "package-script"));
    assert.equal(proofTrials.sandboxFirewall.mode, "read-only-proof-trial-sandbox-firewall");
    assert.equal(proofTrials.sandboxFirewall.credentialCapability, false);
    assert.equal(proofTrials.sandboxFirewall.externalWriteCapability, false);
    assert.equal(proofTrials.sandboxFirewall.productionMutationCapability, false);
    assert.ok(proofTrials.sandboxFirewall.locks.every((lock) => lock.readOnly === true && lock.credentials === "forbidden" && lock.externalWrite === false));
    assert.equal(proofTrials.plan.endpoint, "/api/proof-trials");
    const proofTrialIndex = buildProofTrialsIndex(proofTrials);
    assert.equal(proofTrialIndex.detail, "proof-trial-index");
    assert.equal(proofTrialIndex.compact, true);
    assert.equal(proofTrialIndex.fullDetailEndpoint, "/api/proof-trials/:slug?detail=full");
    assert.equal(proofTrialIndex.sandboxFirewall.lockSummary.locks, proofTrials.summary.totalTrials);
    assert.equal(proofTrialIndex.sandboxFirewall.lockSummaries, undefined);
    assert.equal(proofTrialIndex.sandboxFirewall.locks, undefined);
    assert.ok(proofTrialIndex.trials.every((trial) => trial.counts.steps >= 5 && !("steps" in trial)));
    assert.equal(proofTrialIndex.trialPayloadPolicy.detailEndpointTemplate, "/api/proof-trials/:slug");
    assert.ok(proofTrialIndex.trials.every((trial) => trial.detailAvailable === true && !("detailEndpoint" in trial)));
    assert.equal(proofTrialsPlan().command, "npm run trial:proofs");
    assert.equal(runProofTrial({ slug: "qagent", projects, claims, artifactCatalog: catalog }).result.passed, true);

    const intentPaths = require("../data/intent-model").buildIntentPaths({
      projects,
      claims,
      artifactCatalog: catalog,
      opportunities: radar,
    });
    const packets = buildAudiencePackets({
      projects,
      claims,
      artifactCatalog: catalog,
      intentPaths,
      opportunities: radar,
      trust: trustSummary({ claims, projects, domains, internalChecks, liveDemoChecks }),
    });
    assert.equal(selectAudiencePacket("founder", packets).id, "founder");
    assert.equal(selectAudiencePacket("research", packets).id, "professor");
    assert.equal(selectAudiencePacket("not-audience", packets), null);

    const maintenance = require("../data/maintenance-model").buildMaintenanceReport({
      projects,
      claims,
      trust: trustSummary({ claims, projects, domains, internalChecks, liveDemoChecks }),
      artifactCatalog: catalog,
      statusReceipts: [],
    });
    const weaknessMap = require("../data/weakness-map").buildProjectWeaknessMap({
      projects,
      claims,
      artifactCatalog: catalog,
      maintenance,
      proofTrials,
    });
    const packages = buildOpportunityPackages({
      opportunities: radar,
      packets,
      artifactCatalog: catalog,
      weaknessMap,
      maintenance,
      proofTrials,
      claims,
    });
    assert.equal(packages.mode, "proof-backed-opportunity-packages");
    assert.equal(packages.summary.packages, radar.opportunities.length);
    assert.ok(packages.summary.repairPlanItems >= packages.summary.packages * 3);
    assert.equal(packages.summary.manualOnlyPackages, packages.summary.packages);
    assert.equal(selectOpportunityPackage("agent-infra-internship", packages).id, "agent-infra-internship");
    assert.ok(packages.packages.every((item) => item.trackingBoundary.livePostingKnown === false));
    assert.ok(packages.packages.every((item) => item.proofRepairPlan.length >= 3 && item.packageReadiness.manualOnly));

    const opportunityQuality = buildOpportunityQualityEvaluation({
      opportunities: radar,
      packages,
      packets,
      artifactCatalog: catalog,
      weaknessMap,
      maintenance,
      routeManifest: runtimeRouteManifest(),
      refreshPlan: require("../data/evidence-refresh").evidenceRefreshPlan(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "opportunity-quality-test" }],
    });
    assert.equal(opportunityQuality.mode, "opportunity-engine-quality-evaluation");
    assert.equal(opportunityQuality.cachedFromReceipt, false);
    assert.equal(opportunityQuality.refreshEndpoint, "/api/evaluation/opportunity-quality?refresh=1");
    assert.equal(opportunityQuality.summary.packages, packages.packages.length);
    assert.equal(opportunityQuality.summary.latestReceiptId, "opportunity-quality-test");
    assert.ok(opportunityQuality.summary.repairPlanItems >= packages.packages.length * 3);
    assert.ok(opportunityQuality.checks.every((check) => check.passed));
    assert.ok(opportunityQuality.dimensions.some((dimension) => dimension.id === "manual-safety"));
    assert.ok(opportunityQuality.dimensions.some((dimension) => dimension.id === "repair-plan-actionability"));
    assert.equal(opportunityQualityPlan().endpoint, "/api/evaluation/opportunity-quality");
    const cachedOpportunityQuality = buildOpportunityQualityEvaluationFromReceipt({
      id: "opportunity-quality-cache-test",
      mode: "opportunity-engine-quality-receipt",
      checkedAt: "2026-01-01T00:00:00.000Z",
      summary: opportunityQuality.summary,
      report: opportunityQuality,
      sideEffectBoundary: opportunityQuality.sideEffectBoundary,
    });
    assert.ok(cachedOpportunityQuality);
    assert.equal(cachedOpportunityQuality.cachedFromReceipt, true);
    assert.equal(cachedOpportunityQuality.cachePolicy, "latest-local-receipt");
    assert.equal(cachedOpportunityQuality.summary.latestReceiptId, "opportunity-quality-cache-test");
    assert.equal(buildOpportunityQualityEvaluationFromReceipt({ id: "thin", mode: "opportunity-engine-quality-receipt", summary: opportunityQuality.summary }), null);

    const opportunityBoard = buildOpportunityBoard({
      opportunities: radar,
      packages,
      opportunityQuality,
      packets,
      artifactCatalog: catalog,
      weaknessMap,
      maintenance,
      proofTrials,
      claims,
      routeManifest: runtimeRouteManifest(),
      refreshPlan: require("../data/evidence-refresh").evidenceRefreshPlan(),
      receipts: [{ id: "opportunity-board-test" }],
    });
    assert.equal(opportunityBoard.mode, "proof-backed-opportunity-board");
    assert.equal(opportunityBoard.cachedFromReceipt, false);
    assert.equal(opportunityBoard.refreshEndpoint, "/api/opportunity-board?refresh=1");
    assert.equal(opportunityBoard.summary.latestReceiptId, "opportunity-board-test");
    assert.equal(opportunityBoardPlan().command, "npm run audit:opportunity-board");
    assert.equal(opportunityBoard.summary.packages, packages.packages.length);
    assert.equal(opportunityBoard.summary.proofBundles, packages.packages.length);
    assert.ok(opportunityBoard.blockerQueue.every((blocker) => blocker.sideEffectBoundary.includes("no external")));
    assert.ok(opportunityBoard.audienceLanes.every((lane) => /Never send/.test(lane.safetyRule)));
    const cachedOpportunityBoard = buildOpportunityBoardFromReceipt({
      id: "opportunity-board-cache-test",
      mode: "proof-backed-opportunity-board-receipt",
      checkedAt: "2026-01-01T00:00:00.000Z",
      summary: opportunityBoard.summary,
      report: opportunityBoard,
      sideEffectBoundary: opportunityBoard.sideEffectBoundary,
    });
    assert.ok(cachedOpportunityBoard);
    assert.equal(cachedOpportunityBoard.cachedFromReceipt, true);
    assert.equal(cachedOpportunityBoard.cachePolicy, "latest-local-receipt");
    assert.equal(cachedOpportunityBoard.summary.latestReceiptId, "opportunity-board-cache-test");
    const compactOpportunityBoard = buildOpportunityBoardResponse(cachedOpportunityBoard);
    assert.equal(compactOpportunityBoard.detail, "summary");
    assert.equal(compactOpportunityBoard.fullDetailEndpoint, "/api/opportunity-board?detail=full");
    assert.equal(compactOpportunityBoard.boardPayloadPolicy.fullDetail, false);
    assert.equal(compactOpportunityBoard.boardPayloadPolicy.proofBundlesReturned, 0);
    assert.equal(compactOpportunityBoard.proofBundleSummary.available, cachedOpportunityBoard.proofBundles.length);
    assert.ok(!compactOpportunityBoard.proofBundles);
    assert.ok(compactOpportunityBoard.gates.every((gate) => gate.packages.every((item) => !item.verificationCommand && item.detailEndpoint)));
    const fullOpportunityBoard = buildOpportunityBoardResponse(cachedOpportunityBoard, { detail: "full" });
    assert.equal(fullOpportunityBoard.detail, "full");
    assert.equal(fullOpportunityBoard.boardPayloadPolicy.fullDetail, true);
    assert.ok(fullOpportunityBoard.proofBundles.every((bundle) => bundle.projects.length > 0));
    const selectedBoardPackage = selectOpportunityBoardPackage("agent-infra-internship", cachedOpportunityBoard);
    assert.equal(selectedBoardPackage.id, "agent-infra-internship");
    assert.equal(selectedBoardPackage.detail, "summary");
    assert.equal(selectedBoardPackage.compact, true);
    assert.equal(selectedBoardPackage.boardPackagePayloadPolicy.fullDetail, false);
    assert.ok(selectedBoardPackage.package.verificationCommandAvailable);
    assert.ok(selectedBoardPackage.proofBundle.projectPreview.length > 0);
    assert.ok(!selectedBoardPackage.proofBundle.projects);
    const fullSelectedBoardPackage = selectOpportunityBoardPackage("agent-infra-internship", cachedOpportunityBoard, { detail: "full" });
    assert.equal(fullSelectedBoardPackage.detail, "full");
    assert.equal(fullSelectedBoardPackage.compact, false);
    assert.equal(fullSelectedBoardPackage.boardPackagePayloadPolicy.fullDetail, true);
    assert.ok(fullSelectedBoardPackage.package.verificationCommand);
    assert.ok(fullSelectedBoardPackage.proofBundle.projects.length > 0);
    assert.equal(buildOpportunityBoardFromReceipt({ id: "thin", mode: "proof-backed-opportunity-board-receipt", summary: opportunityBoard.summary }), null);

    const opportunityDeRisking = buildOpportunityDeRiskingReport({
      opportunities: radar,
      packages,
      board: opportunityBoard,
      opportunityQuality,
      routeManifest: runtimeRouteManifest(),
      refreshPlan: require("../data/evidence-refresh").evidenceRefreshPlan(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "opportunity-derisking-test" }],
    });
    assert.equal(opportunityDeRisking.mode, "proof-backed-opportunity-derisking");
    assert.equal(opportunityDeRisking.summary.plans, packages.packages.length);
    assert.ok(opportunityDeRisking.summary.assumptionAudits >= opportunityDeRisking.summary.plans * 7);
    assert.ok(opportunityDeRisking.summary.blockedExternalClaims >= opportunityDeRisking.summary.plans * 4);
    assert.ok(opportunityDeRisking.plans.every((plan) => plan.deRiskSteps.length >= 6));
    assert.ok(opportunityDeRisking.plans.every((plan) => plan.assumptionAudit.assumptions.some((assumption) => assumption.id === "live-posting")));
    assert.ok(opportunityDeRisking.plans.every((plan) => plan.claimFirewall.blockedClaims.some((claim) => claim.assumptionId === "recipient-interest")));
    assert.ok(opportunityDeRisking.plans.every((plan) => ["manual-review-only", "repair-first", "internal-only"].includes(plan.manualGoNoGo.status)));
    assert.equal(opportunityDeRiskingPlan().endpoint, "/api/opportunity-derisking");

    const opportunityRanking = buildOpportunityRankingReport({
      opportunities: radar,
      packages,
      board: opportunityBoard,
      deRisking: opportunityDeRisking,
      opportunityQuality,
      routeManifest: runtimeRouteManifest(),
      refreshPlan: require("../data/evidence-refresh").evidenceRefreshPlan(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "opportunity-ranking-test" }],
    });
    assert.equal(opportunityRanking.mode, "proof-backed-opportunity-ranking");
    assert.equal(opportunityRanking.summary.rankings, packages.packages.length);
    assert.ok(opportunityRanking.summary.packageRepairActions >= opportunityRanking.summary.rankings);
    assert.ok(opportunityRanking.summary.portfolioSlots >= 4);
    assert.equal(opportunityRanking.summary.manualOnlyPortfolioItems, opportunityRanking.summary.portfolioItems);
    assert.ok(opportunityRanking.rankings.every((ranking) => ranking.rankFactors && ranking.missingProofPlan.length >= 3));
    assert.ok(opportunityRanking.opportunityPortfolio.some((slot) => slot.id === "do-not-automate-boundary"));
    assert.ok(opportunityRanking.rankings.every((ranking) => ranking.missingProofPlan.some((step) => step.source === "opportunity-package-repair-plan")));
    assert.ok(opportunityRanking.decisionLanes.reduce((sum, lane) => sum + lane.items.length, 0) === opportunityRanking.rankings.length);
    assert.equal(opportunityRankingPlan().endpoint, "/api/opportunity-ranking");
    const cachedOpportunityRanking = buildOpportunityRankingReportFromReceipt({
      id: "opportunity-ranking-cached-test",
      mode: "proof-backed-opportunity-ranking-receipt",
      checkedAt: new Date().toISOString(),
      summary: opportunityRanking.summary,
      fullDecisionLanes: opportunityRanking.decisionLanes,
      fullOpportunityPortfolio: opportunityRanking.opportunityPortfolio,
      rankings: opportunityRanking.rankings,
      missingProofQueue: opportunityRanking.missingProofQueue,
      requirementMatrix: opportunityRanking.requirementMatrix,
      checks: opportunityRanking.checks,
    });
    assert.equal(cachedOpportunityRanking.cachedFromReceipt, true);
    assert.equal(cachedOpportunityRanking.rankings.length, opportunityRanking.rankings.length);
    const compactOpportunityRankingDetail = buildOpportunityRankingDetailResponse(cachedOpportunityRanking.rankings[0]);
    assert.equal(compactOpportunityRankingDetail.detail, "summary");
    assert.equal(compactOpportunityRankingDetail.compact, true);
    assert.ok(compactOpportunityRankingDetail.countSummary.sourceTraceRows >= 4);
    assert.equal(compactOpportunityRankingDetail.sourceTrace, undefined);
    const fullOpportunityRankingDetail = buildOpportunityRankingDetailResponse(cachedOpportunityRanking.rankings[0], { detail: "full" });
    assert.equal(fullOpportunityRankingDetail.detail, "full");
    assert.ok(fullOpportunityRankingDetail.sourceTrace.some((trace) => trace.type === "opportunity-derisking-plan"));

    const opportunityScorecard = buildOpportunityScorecardReport({
      opportunities: radar,
      packages,
      board: opportunityBoard,
      deRisking: opportunityDeRisking,
      ranking: opportunityRanking,
      opportunityQuality,
      routeManifest: runtimeRouteManifest(),
      refreshPlan: require("../data/evidence-refresh").evidenceRefreshPlan(),
      packageManifest: require("../package.json"),
      receipts: [{ id: "opportunity-scorecard-test" }],
    });
    assert.equal(opportunityScorecard.mode, "proof-backed-opportunity-scorecard");
    assert.equal(opportunityScorecard.summary.scorecards, packages.packages.length);
    assert.ok(opportunityScorecard.summary.repairPlanItems >= opportunityScorecard.summary.scorecards * 3);
    assert.ok(opportunityScorecard.checks.every((check) => check.passed));
    assert.ok(opportunityScorecard.scorecards.every((scorecard) => scorecard.sourceTrace.length >= 4));
    assert.ok(opportunityScorecard.scorecards.every((scorecard) => scorecard.repairActions.some((action) => action.source === "opportunity-package-repair-plan")));
    assert.equal(selectOpportunityScorecard("agent-infra-internship", opportunityScorecard)?.id, "agent-infra-internship");
    const compactOpportunityScorecard = buildOpportunityScorecardResponse(opportunityScorecard);
    assert.equal(compactOpportunityScorecard.detail, "summary");
    assert.equal(compactOpportunityScorecard.generatedAt, undefined);
    assert.equal(compactOpportunityScorecard.checkedAt, undefined);
    assert.equal(compactOpportunityScorecard.cachePolicy, undefined);
    assert.equal(compactOpportunityScorecard.boundaryAvailable, true);
    assert.equal(compactOpportunityScorecard.scorecardPayloadPolicy.scorecardsAvailable, undefined);
    assert.equal(compactOpportunityScorecard.scorecardPayloadPolicy.fullDetailAvailable, true);
    assert.ok(compactOpportunityScorecard.scorecardIndex.length <= 3);
    assert.equal(compactOpportunityScorecard.checkSummary.passed, opportunityScorecard.summary.passing);
    assert.ok(compactOpportunityScorecard.dimensions.length <= 3);
    assert.ok(compactOpportunityScorecard.scorecards.length <= 1);
    assert.ok(compactOpportunityScorecard.scorecards.every((scorecard) => !("sourceTrace" in scorecard)));
    assert.ok(compactOpportunityScorecard.scorecards.every((scorecard) => scorecard.repairActions.some((action) => action.source === "opportunity-package-repair-plan")));
    assert.equal(compactOpportunityScorecard.repairQueue, undefined);
    assert.equal(compactOpportunityScorecard.nextActionAvailable, undefined);
    assert.equal(compactOpportunityScorecard.verificationCommandAvailable, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(compactOpportunityScorecard)) < 1700);
    const fullOpportunityScorecard = buildOpportunityScorecardResponse(opportunityScorecard, { detail: "full" });
    assert.equal(fullOpportunityScorecard.detail, "full");
    assert.ok(Array.isArray(fullOpportunityScorecard.scorecards[0].sourceTrace));
    const cachedOpportunityScorecard = buildOpportunityScorecardReportFromReceipt({
      id: "opportunity-scorecard-cached-test",
      mode: "proof-backed-opportunity-scorecard-receipt",
      checkedAt: new Date().toISOString(),
      summary: opportunityScorecard.summary,
      dimensions: opportunityScorecard.dimensions,
      scorecards: opportunityScorecard.scorecards,
      scoreBands: opportunityScorecard.scoreBands,
      repairQueue: opportunityScorecard.repairQueue,
      checks: opportunityScorecard.checks,
    });
    assert.equal(cachedOpportunityScorecard.cachedFromReceipt, true);
    const cachedAgentScorecard = selectOpportunityScorecard("agent-infra-internship", cachedOpportunityScorecard);
    assert.equal(cachedAgentScorecard?.id, "agent-infra-internship");
    const compactAgentScorecard = buildOpportunityScorecardDetailResponse(cachedAgentScorecard);
    assert.equal(compactAgentScorecard.cachePolicy, undefined);
    assert.equal(compactAgentScorecard.checkedAt, undefined);
    assert.equal(compactAgentScorecard.packageId, undefined);
    assert.equal(compactAgentScorecard.sourceTrace, undefined);
    assert.ok(compactAgentScorecard.sourceTracePreview.some((trace) => trace.type === "opportunity-ranking"));
    assert.ok(compactAgentScorecard.sourceTracePreview.length <= 1);
    assert.ok(compactAgentScorecard.sourceTraceCount >= compactAgentScorecard.sourceTracePreview.length);
    assert.equal(compactAgentScorecard.scorecardPayloadPolicy.fullDetailEndpoint, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(compactAgentScorecard)) < 1100);
    const fullAgentScorecard = buildOpportunityScorecardDetailResponse(cachedAgentScorecard, { detail: "full" });
    assert.ok(fullAgentScorecard.sourceTrace.some((trace) => trace.type === "opportunity-ranking"));
    assert.equal(opportunityScorecardPlan().endpoint, "/api/opportunity-scorecard");
  });

  it("generates a structured QAgent case study and SVG artifact", async () => {
    const caseStudy = await json("/api/case-study/qagent");
    assert.equal(caseStudy.response.status, 200);
    assert.equal(caseStudy.body.slug, "qagent");
    assert.equal(caseStudy.body.detail, "summary");
    assert.equal(caseStudy.body.compact, true);
    assert.equal(caseStudy.body.fullDetailEndpoint, "/api/case-study/qagent?detail=full");
    assert.equal(caseStudy.body.caseStudyPayloadPolicy.fullDetail, false);
    assert.ok(Buffer.byteLength(JSON.stringify(caseStudy.body)) < 1700);
    assert.equal(caseStudy.body.visibility, undefined);
    assert.equal(caseStudy.body.timeline, undefined);
    assert.equal(caseStudy.body.stackPreview, undefined);
    assert.ok(caseStudy.body.sourceConfidence.confidenceScore > 50);
    assert.equal(caseStudy.body.sourceConfidence.freshnessScore, undefined);
    assert.equal(caseStudy.body.evidencePacket.slug, "qagent");
    assert.ok(Number.isInteger(caseStudy.body.evidencePacket.linkCount));
    assert.ok(Number.isInteger(caseStudy.body.evidencePacket.proofItemCount));
    assert.ok(Number.isInteger(caseStudy.body.evidencePacket.claimCount));
    assert.equal(caseStudy.body.evidencePacket.title, undefined);
    assert.equal(caseStudy.body.evidencePacket.freshnessScore, undefined);
    assert.ok(caseStudy.body.evidencePacket.claimPreview.length > 0);
    assert.ok(caseStudy.body.evidencePacket.claimPreview.every((claim) => claim.textPreview && !("text" in claim) && !("privacyLevel" in claim)));
    assert.ok(!("claims" in caseStudy.body.evidencePacket));
    assert.ok(caseStudy.body.forms.some((form) => form.id === "proof-audit"));
    assert.ok(caseStudy.body.forms.every((form) => form.bodyAvailable && !("body" in form) && !("bodyPreview" in form)));
    assert.ok(caseStudy.body.forms.length <= 2);
    assert.ok(caseStudy.body.sections.every((section) => section.body.length <= 220));
    assert.ok(caseStudy.body.sections.length <= caseStudy.body.caseStudyPayloadPolicy.sectionPreviewLimit);
    assert.ok(caseStudy.body.sections.some((section) => section.title === "Evidence trail"));
    assert.ok(caseStudy.body.sections.some((section) => section.title === "Source-backed claims"));
    assert.ok(caseStudy.body.sections.some((section) => section.title === "Open proof gaps"));
    assert.ok(caseStudy.body.sections.some((section) => section.title === "Best audience"));
    assert.equal(caseStudy.body.caseStudyPayloadPolicy.fullDetailEndpoint, undefined);
    assert.equal(caseStudy.body.caseStudyPayloadPolicy.formsReturned, caseStudy.body.forms.length);
    const fullCaseStudy = await json("/api/case-study/qagent?detail=full");
    assert.equal(fullCaseStudy.response.status, 200);
    assert.equal(fullCaseStudy.body.detail, "full");
    assert.equal(fullCaseStudy.body.compact, false);
    assert.equal(caseStudy.body.caseStudyPayloadPolicy.sectionsAvailable, fullCaseStudy.body.sections.length);
    assert.ok(fullCaseStudy.body.evidencePacket.claims.length >= caseStudy.body.evidencePacket.claimCount);
    assert.ok(fullCaseStudy.body.forms.some((form) => form.id === "proof-audit" && form.body));

    const svg = await fetch(`${baseUrl}/api/og/qagent.svg`);
    assert.equal(svg.status, 200);
    assert.match(svg.headers.get("content-type"), /image\/svg\+xml/);
    const svgText = await svg.text();
    assert.match(svgText, /QAgent/);
    assert.ok(Buffer.byteLength(svgText) < 1400);
  });

  it("runs terminal commands required by the plan", async () => {
    const terminalOutputs = new Map();
    for (const command of [
      "help",
      "proof",
      "projects",
      "claims",
      "claims qagent",
      "verified",
      "stale",
      "demos",
      "evidence qagent",
      "risks qagent",
      "weaknesses",
      "weaknesses qagent",
      "skills",
      "skills AI agents",
      "contradictions",
      "changes",
      "waves",
      "waves 41",
      "evaluate",
      "graph-links",
      "graph-scoreboard",
      "graph-lineage",
      "graph-guard",
      "graph-disclosures",
      "graph-confidence",
      "graph-depth",
      "trust-blockade",
      "opportunity-quality",
      "usability-quality",
      "research-stress",
      "research-rigor",
      "evaluation-sample",
      "artifact-collections",
      "artifact-transcripts",
      "artifact-transcripts qagent",
      "artifact-museum",
      "artifact-museum-compare",
      "artifact-replays",
      "artifact-replays qagent",
      "artifact-gaps",
      "artifact-gap-repair",
      "opportunities",
      "opportunity-packages",
      "opportunity-package agent-infra-internship",
      "opportunity-board",
      "opportunity-derisking",
      "opportunity-derisking agent-infra-internship",
      "opportunity-ranking",
      "opportunity-ranking agent-infra-internship",
      "opportunity-scorecard",
      "opportunity-scorecard agent-infra-internship",
      "search-quality",
      "claim-calibration",
      "design-stability",
      "keyboard-readiness",
      "design-ambition",
      "evaluation-integrity",
      "next",
      "artifacts",
      "maintenance",
      "approvals",
      "refresh",
      "a11y",
      "performance",
      "visuals",
      "review weekly",
      "review monthly",
      "trial qagent",
      "packet recruiter",
      "packet professor",
      "packet founder",
      "narrative recruiter",
      "narrative-grounding",
      "narrative-sequence",
      "narrative-sequence recruiter",
      "narrative-tailor",
      "narrative-tailor recruiter",
      "narrative-disclosure",
      "narrative-disclosure recruiter",
      "narrative-contrast",
      "narrative-contrast recruiter-vs-professor",
      "narrative-objections",
      "narrative-objections recruiter",
      "fit professor",
      "fit founder",
      "runtime",
      "runtime-diff",
      "runtime-attestation",
      "runtime-surface",
      "route-latency",
      "runtime-boundary",
      "runtime-reconciliation",
      "runtime-explain",
      "runtime-deploy",
      "intent recruiter",
      "graph",
      "graph-quality",
      "artifact-compare qagent flowpr",
      "open qagent",
      "why qagent",
      "stack qagent",
      "compare qagent flowpr",
      "fit recruiter",
    ]) {
      const result = await json("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      assert.equal(result.response.status, 200);
      assert.equal(result.body.command, command);
      assert.ok(result.body.output.length > 12);
      terminalOutputs.set(command, result.body.output);
    }
    assert.match(terminalOutputs.get("help"), /artifact-gap-repair/);
    assert.match(terminalOutputs.get("graph-lineage"), /Artifact gap repairs: \d+\/\d+ graph-resolved path/);
    assert.match(terminalOutputs.get("graph-lineage"), /repair-path ::/);
    assert.match(terminalOutputs.get("graph-depth"), /Artifact gap repairs: \d+\/\d+ graph-resolved proof-repair path/);
    assert.match(terminalOutputs.get("graph-depth"), /summary :: artifact-gap-to-opportunity-repair/);
    assert.match(terminalOutputs.get("trust-blockade"), /public-safe-trust-blockade-frontier/);
    assert.match(terminalOutputs.get("trust-blockade"), /Proof repairs: \d+\/\d+ graph path/);
    assert.match(terminalOutputs.get("route-latency"), /route-latency-heatmap/);
    assert.match(terminalOutputs.get("review weekly"), /Proof repairs: \d+\/\d+ graph-resolved path/);
    assert.match(terminalOutputs.get("changes"), /Proof repairs: .*graph-visible proof-repair/);
  });

  it("reports internal, domain, and demo status checks", async () => {
    const status = await json("/api/status");
    assert.equal(status.response.status, 200);
    assert.match(status.body.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(status.body.receiptId, /^status-/);
    assert.equal(typeof status.body.cachedFromReceipt, "boolean");
    assert.equal(status.body.refreshEndpoint, "/api/status?refresh=1");
    assert.equal(status.body.recordEndpoint, "/api/status?record=1");
    assert.equal(status.body.detail, "summary");
    assert.equal(status.body.compact, true);
    assert.equal(status.body.fullDetailEndpoint, "/api/status?detail=full");
    assert.equal(status.body.statusPayloadPolicy.fullDetail, false);
    assert.ok(Buffer.byteLength(JSON.stringify(status.body)) < 1900);
    assert.equal(status.body.receiptSummary.total, status.body.checks.length);
    assert.ok(status.body.checks.some((check) => check.label === "Home page"));
    assert.ok(status.body.checks.some((check) => check.role === "repo graph"));
    assert.ok(status.body.checks.some((check) => check.role === "live project demo"));
    assert.ok(status.body.checks.every((check) => !("url" in check) && !("ms" in check)));

    const fullStatus = await json("/api/status?detail=full");
    assert.equal(fullStatus.response.status, 200);
    assert.equal(fullStatus.body.detail, "full");
    assert.equal(fullStatus.body.compact, false);
    assert.equal(fullStatus.body.statusPayloadPolicy.fullDetail, true);
    assert.ok(fullStatus.body.checks.some((check) => check.url && typeof check.ms === "number"));

    const statusPlan = await json("/api/status/plan");
    assert.equal(statusPlan.response.status, 200);
    assert.equal(statusPlan.body.command, "npm run record:status");
    assert.equal(statusPlan.body.recordEndpoint, "/api/status?record=1");

    const recordedStatus = await json("/api/status?record=1");
    assert.equal(recordedStatus.response.status, 200);
    assert.equal(recordedStatus.body.cachedFromReceipt, false);
    assert.equal(recordedStatus.body.cachePolicy, "live-refresh");
    assert.equal(recordedStatus.body.receiptRecorded, true);
    assert.match(recordedStatus.body.receiptId, /^status-/);

    const history = await json("/api/status/history");
    assert.equal(history.response.status, 200);
    assert.equal(history.body.mode, "command-center-status-history");
    assert.equal(history.body.detail, "summary");
    assert.equal(history.body.compact, true);
    assert.equal(history.body.generatedAt, undefined);
    assert.equal(history.body.summary.limit, 5);
    assert.equal(history.body.fullDetailEndpoint, "/api/status/history?detail=full");
    assert.equal(history.body.historyPayloadPolicy.fullDetail, false);
    assert.equal(history.body.historyPayloadPolicy.fullDetailAvailable, true);
    assert.equal(history.body.historyPayloadPolicy.latestCheckPreviewLimit, undefined);
    assert.equal(history.body.historyPayloadPolicy.latestCheckPreviewStrategy, undefined);
    assert.equal(history.body.historyPayloadPolicy.olderReceiptPreview, undefined);
    assert.equal(history.body.summary.latestReceiptId, undefined);
    assert.equal(history.body.sourceBoundaryAvailable, undefined);
    assert.equal(history.body.sideEffectBoundaryAvailable, undefined);
    assert.equal(history.body.boundaryAvailable, true);
    assert.equal(history.body.sourceBoundary, undefined);
    assert.equal(history.body.receiptStore, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(history.body)) < 1600);
    assert.equal(history.body.definitions.evidenceAccess.statusEndpoint, "/api/status");
    assert.ok(history.body.definitions.checkDefinitions.targetPreview.some((check) => check.id === "home-page"));
    assert.ok(history.body.receipts.some((receipt) => receipt.id === recordedStatus.body.receiptId));
    assert.ok(history.body.receipts.length <= 5);
    assert.ok(history.body.receipts.every((receipt) => !("baseUrl" in receipt)));
    assert.ok(history.body.receipts.every((receipt) => !("checks" in receipt)));
    assert.equal(history.body.receipts[0].checkedAt, undefined);
    assert.ok(history.body.receipts[0].checkPreview.length <= 3);
    assert.ok(history.body.receipts[0].checkPreview.every((check) => !("url" in check) && !("label" in check) && !("ms" in check)));
    assert.ok(history.body.receipts[0].checkPreview.some((check) => check.ok === false));
    assert.ok(history.body.receipts.slice(1).every((receipt) => receipt.checkedAt === undefined && receipt.latestReceiptPreviewOnly === undefined && !("checkPreview" in receipt)));

    const fullHistory = await json("/api/status/history?detail=full&limit=10");
    assert.equal(fullHistory.response.status, 200);
    assert.equal(fullHistory.body.detail, "full");
    assert.equal(fullHistory.body.compact, false);
    assert.equal(fullHistory.body.historyPayloadPolicy.fullDetail, true);
    assert.ok(fullHistory.body.receipts.length <= 10);
    assert.ok(fullHistory.body.receipts[0].baseUrl);
    assert.ok(fullHistory.body.receipts[0].checks.some((check) => check.url && check.label));
  });

  it("rejects invalid JSON and path traversal attempts", async () => {
    const invalid = await fetch(`${baseUrl}/api/terminal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    assert.equal(invalid.status, 400);

    const traversal = await fetch(`${baseUrl}/%2e%2e/server.js`);
    assert.equal(traversal.status, 404);

    const missingTrial = await fetch(`${baseUrl}/api/proof-trials/not-a-project`);
    assert.equal(missingTrial.status, 404);

    const missingPacket = await fetch(`${baseUrl}/api/packets/not-audience`);
    assert.equal(missingPacket.status, 404);

    const missingNarrative = await fetch(`${baseUrl}/api/narratives/not-audience`);
    assert.equal(missingNarrative.status, 404);

    const missingNarrativeContrast = await fetch(`${baseUrl}/api/narrative-contrast/not-a-contrast`);
    assert.equal(missingNarrativeContrast.status, 404);

    const missingReview = await fetch(`${baseUrl}/api/self-review/yearly`);
    assert.equal(missingReview.status, 404);

    const missingWeakness = await fetch(`${baseUrl}/api/weaknesses/not-a-project`);
    assert.equal(missingWeakness.status, 404);

    const missingSkill = await fetch(`${baseUrl}/api/skill-gaps/not-a-skill`);
    assert.equal(missingSkill.status, 404);

    const missingWave = await fetch(`${baseUrl}/api/waves/401`);
    assert.equal(missingWave.status, 404);

    const missingArtifactCollection = await fetch(`${baseUrl}/api/artifact-collections/not-a-collection`);
    assert.equal(missingArtifactCollection.status, 404);

    const missingOpportunityPackage = await fetch(`${baseUrl}/api/opportunity-packages/not-a-package`);
    assert.equal(missingOpportunityPackage.status, 404);

    const missingOpportunityRanking = await fetch(`${baseUrl}/api/opportunity-ranking/not-a-ranking`);
    assert.equal(missingOpportunityRanking.status, 404);
  });
});

function projectsMinimumClaimCount() {
  return 10 * 4;
}
