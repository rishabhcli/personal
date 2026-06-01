const { createReadStream, existsSync, readFileSync, statSync } = require("node:fs");
const { stat } = require("node:fs/promises");
const { createServer } = require("node:http");
const path = require("node:path");
const {
  buildProjectEvidenceResponse,
  buildTrustSummaryResponse,
  buildClaimLedger,
  claimsForProject,
  evidenceForProject,
  publicClaim,
  trustSummary,
} = require("./data/evidence-model");
const { buildOpportunityRadar, buildOpportunityRadarResponse } = require("./data/opportunity-model");
const {
  buildPrivateCockpit,
  privateCockpitPlan,
  readPrivateCockpitReceipts,
} = require("./data/private-cockpit");
const {
  buildPrivateNextActionPlan,
  privateNextActionsPlan,
  readPrivateNextActionReceipts,
} = require("./data/private-planner");
const {
  buildPrivateBriefingDrafts,
  privateBriefingDraftsPlan,
  readPrivateBriefingDraftReceipts,
  selectPrivateBriefingDraft,
} = require("./data/private-briefing-drafts");
const {
  buildPrivateTaskTracker,
  ensurePrivateTaskStore,
  privateTaskTrackerPlan,
  readPrivateTaskReceipts,
  readPrivateTaskStore,
  recordPrivateTaskStatus,
} = require("./data/private-task-tracker");
const {
  buildPrivateReviewSessions,
  privateReviewSessionsPlan,
  readPrivateReviewSessionReceipts,
} = require("./data/private-review-sessions");
const {
  buildPrivateChiefOfStaffReadiness,
  privateChiefOfStaffPlan,
  readPrivateChiefOfStaffReceipts,
} = require("./data/private-chief-of-staff");
const {
  buildPrivateChiefDraftsReport,
  privateChiefDraftsPlan,
  readPrivateChiefDraftsReceipts,
  selectPrivateChiefDraft,
} = require("./data/private-chief-drafts");
const { buildPrivateSchedule, privateSchedulePlan, readPrivateScheduleReceipts } = require("./data/private-schedule");
const {
  buildPrivatePrioritizationReport,
  privatePrioritizationPlan,
  readPrivatePrioritizationReceipts,
} = require("./data/private-priorities");
const { buildArtifactCatalog, buildArtifactCatalogResponse } = require("./data/artifact-model");
const {
  buildArtifactCollectionDetailResponse,
  buildArtifactCollections,
  buildArtifactCollectionsResponse,
  selectArtifactCollection,
} = require("./data/artifact-collections");
const { compareProjectArtifacts } = require("./data/artifact-comparison");
const {
  buildArtifactTranscriptDetailResponse,
  buildArtifactTranscriptLibrary,
  buildArtifactTranscriptLibraryResponse,
  selectArtifactTranscript,
} = require("./data/artifact-transcripts");
const {
  artifactMuseumPlan,
  buildArtifactMuseumAudit,
  buildArtifactMuseumHistory,
  buildArtifactMuseumResponse,
  readArtifactMuseumReceipts,
} = require("./data/artifact-museum");
const {
  artifactMuseumComparisonPlan,
  buildArtifactMuseumComparisonAudit,
  buildArtifactMuseumComparisonHistory,
  buildArtifactMuseumComparisonResponse,
  readArtifactMuseumComparisonReceipts,
  selectArtifactMuseumComparisonPair,
  summarizeArtifactMuseumComparisonPair,
} = require("./data/artifact-museum-compare");
const { buildArtifactReplayCatalog, buildArtifactReplayDetailResponse, buildArtifactReplayIndex, selectArtifactReplay } = require("./data/artifact-replays");
const {
  artifactGapWorkbenchPlan,
  buildArtifactGapHistory,
  buildArtifactGapWorkbenchResponse,
  buildArtifactGapWorkbenchFromReceipt,
  buildArtifactGapWorkbench,
  readArtifactGapReceipts,
} = require("./data/artifact-gap-workbench");
const {
  artifactGapProofRepairPlan,
  appendArtifactGapRepairReceipt,
  buildArtifactGapRepairHistory,
  buildArtifactGapProofRepairQueueFromReceipt,
  buildArtifactGapProofRepairQueue,
  buildArtifactGapProofRepairResponse,
  readArtifactGapRepairReceipts,
} = require("./data/artifact-gap-proof-repair");
const {
  buildOpportunityPackageDetailResponse,
  buildOpportunityPackages,
  buildOpportunityPackagesResponse,
  selectOpportunityPackage,
} = require("./data/opportunity-packages");
const {
  buildOpportunityBoard,
  buildOpportunityBoardFromReceipt,
  buildOpportunityBoardResponse,
  readOpportunityBoardReceipts,
  selectOpportunityBoardPackage,
} = require("./data/opportunity-board");
const {
  buildOpportunityDeRiskingHistory,
  buildOpportunityDeRiskingPlanResponse,
  buildOpportunityDeRiskingReportFromReceipt,
  buildOpportunityDeRiskingReport,
  buildOpportunityDeRiskingResponse,
  opportunityDeRiskingPlan,
  readLatestOpportunityDeRiskingReceipt,
  readOpportunityDeRiskingHistoryWindow,
  selectOpportunityDeRisking,
} = require("./data/opportunity-derisking");
const {
  buildOpportunityRankingDetailResponse,
  buildOpportunityRankingHistory,
  buildOpportunityRankingReportFromReceipt,
  buildOpportunityRankingReport,
  buildOpportunityRankingResponse,
  opportunityRankingPlan,
  readLatestOpportunityRankingReceipt,
  readOpportunityRankingHistoryWindow,
  selectOpportunityRanking,
} = require("./data/opportunity-ranking");
const {
  buildOpportunityScorecardHistory,
  buildOpportunityScorecardDetailResponse,
  buildOpportunityScorecardReportFromReceipt,
  buildOpportunityScorecardReport,
  buildOpportunityScorecardResponse,
  opportunityScorecardPlan,
  readOpportunityScorecardHistoryWindow,
  readOpportunityScorecardReceipts,
  selectOpportunityScorecard,
} = require("./data/opportunity-scorecard");
const { buildIntentPathResponse, buildIntentPaths, buildIntentPathsResponse, selectIntentPath } = require("./data/intent-model");
const { buildMaintenanceReport, buildMaintenanceReportResponse } = require("./data/maintenance-model");
const {
  buildPrivacyApprovalAudit,
  ensurePrivacyApprovalStore,
  privacyApprovalPlan,
  readPrivacyApprovalReceipts,
  readPrivacyApprovalStore,
  recordPrivacyDecision,
} = require("./data/privacy-approval");
const {
  buildEvidenceRefreshHistory,
  evidenceRefreshPlan,
  readEvidenceRefreshHistoryWindow,
  readEvidenceRefreshReceipts,
} = require("./data/evidence-refresh");
const {
  accessibilityAuditPlan,
  buildAccessibilityAuditHistory,
  readAccessibilityAuditHistoryWindow,
  readAccessibilityAuditReports,
  readLatestAccessibilityAuditReport,
} = require("./data/accessibility-audit");
const { performanceBudgetPlan, readPerformanceBudgetReports } = require("./data/performance-budget");
const {
  buildProofTrialDetailResponse,
  buildProofTrialHistory,
  buildProofTrials,
  buildProofTrialsIndex,
  proofTrialsPlan,
  readProofTrialReceipts,
  runProofTrial,
} = require("./data/proof-trials");
const {
  buildAudiencePacketDetailResponse,
  buildAudiencePackets,
  buildAudiencePacketsResponse,
  selectAudiencePacket,
} = require("./data/audience-packets");
const {
  buildGroundedNarrativeDetailResponse,
  buildNarrativeGroundingHistory,
  buildNarrativeGroundingReport,
  buildNarrativeGroundingResponse,
  narrativeGroundingPlan,
  readNarrativeGroundingReceipts,
  selectGroundedNarrative,
} = require("./data/narrative-grounding");
const {
  buildNarrativeContrastHistory,
  buildNarrativeContrastDetailResponse,
  buildNarrativeContrastReport,
  buildNarrativeContrastResponse,
  narrativeContrastPlan,
  readNarrativeContrastReceipts,
  selectNarrativeContrast,
} = require("./data/narrative-contrast");
const {
  buildNarrativeObjectionAudienceResponse,
  buildNarrativeObjectionHistory,
  buildNarrativeObjectionReport,
  buildNarrativeObjectionReportFromReceipt,
  buildNarrativeObjectionResponse,
  narrativeObjectionPlan,
  readNarrativeObjectionReceipts,
  selectNarrativeObjections,
} = require("./data/narrative-objections");
const {
  buildNarrativeTailorAudienceResponse,
  buildNarrativeTailorHistory,
  buildNarrativeTailorReportFromReceipt,
  buildNarrativeTailorReport,
  buildNarrativeTailorResponse,
  narrativeTailorPlan,
  readNarrativeTailorHistoryWindow,
  readNarrativeTailorReceipts,
  selectNarrativeTailoring,
} = require("./data/narrative-tailor");
const {
  buildNarrativeDisclosureHistory,
  buildNarrativeDisclosureAudienceResponse,
  buildNarrativeDisclosureReportFromReceipt,
  buildNarrativeDisclosureReport,
  buildNarrativeDisclosureResponse,
  narrativeDisclosurePlan,
  readNarrativeDisclosureHistoryWindow,
  readNarrativeDisclosureReceipts,
  selectNarrativeDisclosure,
} = require("./data/narrative-disclosure");
const {
  buildNarrativeSequenceHistory,
  buildNarrativeSequenceAudienceResponse,
  buildNarrativeSequenceReportFromReceipt,
  buildNarrativeSequenceReport,
  buildNarrativeSequenceResponse,
  narrativeSequencePlan,
  readNarrativeSequenceHistoryWindow,
  readNarrativeSequenceReceipts,
  selectNarrativeSequence,
} = require("./data/narrative-sequence");
const {
  buildGraphDisclosureLinksHistory,
  buildGraphDisclosureLinksReportFromReceipt,
  buildGraphDisclosureLinksReport,
  buildGraphDisclosureLinksResponse,
  graphDisclosureLinksPlan,
  readGraphDisclosureLinksHistoryWindow,
  readGraphDisclosureLinksReceipts,
  readLatestGraphDisclosureLinksReceipt,
} = require("./data/graph-disclosure-links");
const {
  buildGraphConfidenceHistory,
  buildGraphConfidenceReportFromReceipt,
  buildGraphConfidenceReport,
  buildGraphConfidenceResponse,
  graphConfidencePlan,
  readGraphConfidenceHistoryWindow,
  readLatestGraphConfidenceReceipt,
} = require("./data/graph-confidence");
const {
  buildGraphDepthScoreHistory,
  buildGraphDepthScoreReportFromReceipt,
  buildGraphDepthScoreReport,
  buildGraphDepthScoreResponse,
  graphDepthScorePlan,
  readGraphDepthScoreHistoryWindow,
  readGraphDepthScoreReceipts,
} = require("./data/graph-depth-score");
const { buildVisualRegressionHistory, readVisualRegressionReports, visualRegressionPlan } = require("./data/visual-regression");
const {
  buildSelfReviewHistory,
  buildSelfReviewReportResponse,
  buildSelfReviewReports,
  buildSelfReviewReportsFromReceipt,
  buildSelfReviewResponse,
  readLatestSelfReviewReceipt,
  readSelfReviewHistoryWindow,
  selectSelfReviewReport,
  selfReviewPlan,
} = require("./data/self-review");
const { buildProjectWeaknessDetailResponse, buildProjectWeaknessMap, buildProjectWeaknessMapResponse, selectProjectWeakness } = require("./data/weakness-map");
const { buildSkillGapMap, buildSkillGapMapResponse, selectSkill } = require("./data/skill-map");
const { detectContradictions } = require("./data/contradiction-model");
const {
  buildChangeHistoryReport,
  buildChangeHistoryReportFromSnapshots,
  buildChangeHistoryResponse,
  buildCurrentChangeSnapshot,
  changeHistoryPlan,
  readChangeHistory,
} = require("./data/change-history");
const {
  buildTrustBlockadeHistory,
  buildTrustBlockadeReport,
  buildTrustBlockadeReportFromReceipt,
  buildTrustBlockadeReportResponse,
  readTrustBlockadeReceipts,
  trustBlockadePlan,
} = require("./data/trust-blockade");
const { buildWaveBacklog, buildWaveBacklogIndex, selectWave } = require("./data/wave-backlog");
const {
  buildGraphQualityHistory,
  buildGraphQualityReport,
  buildGraphQualityReportFromReceipt,
  buildGraphQualityResponse,
  graphQualityPlan,
  readGraphQualityHistoryWindow,
  readLatestGraphQualityReceipt,
} = require("./data/graph-quality");
const {
  buildGraphCrosslinkHistory,
  buildGraphCrosslinkReport,
  buildGraphCrosslinkReportFromReceipt,
  buildGraphCrosslinkResponse,
  graphCrosslinkPlan,
  readGraphCrosslinkHistoryWindow,
  readLatestGraphCrosslinkReceipt,
} = require("./data/graph-crosslinks");
const {
  buildGraphScoreboard,
  buildGraphScoreboardHistory,
  buildGraphScoreboardFromReceipt,
  buildGraphScoreboardResponse,
  graphScoreboardPlan,
  readGraphScoreboardHistoryWindow,
  readLatestGraphScoreboardReceipt,
} = require("./data/graph-scoreboard");
const {
  buildGraphPayloadFromReceipt,
  buildGraphPayloadResponse,
  buildGraphPayloadSnapshot,
  buildGraphSnapshotHistory,
  graphSnapshotPlan,
  readGraphSnapshotHistoryWindow,
  readLatestGraphSnapshotReceipt,
  readGraphSnapshotReceipts,
} = require("./data/graph-snapshot");
const {
  buildGraphLineageHistory,
  buildGraphLineageReport,
  buildGraphLineageReportFromReceipt,
  buildGraphLineageResponse,
  graphLineagePlan,
  readGraphLineageHistoryWindow,
  readLatestGraphLineageReceipt,
} = require("./data/graph-lineage");
const {
  buildGraphProjectionGuardHistory,
  buildGraphProjectionGuardReportFromReceipt,
  buildGraphProjectionGuardReport,
  buildGraphProjectionGuardResponse,
  graphProjectionGuardPlan,
  readGraphProjectionGuardHistoryWindow,
  readLatestGraphProjectionGuardReceipt,
} = require("./data/graph-projection-guard");
const {
  buildProofQualityEvaluation,
  buildProofQualityEvaluationFromReceipt,
  buildProofQualityEvaluationResponse,
  buildProofQualityHistory,
  proofQualityPlan,
  readLatestProofQualityReceipt,
  readProofQualityHistoryWindow,
} = require("./data/proof-quality");
const {
  buildSearchQualityEvaluation,
  buildSearchQualityEvaluationFromReceipt,
  buildSearchQualityHistory,
  buildSearchQualityResponse,
  readLatestSearchQualityReceipt,
  readSearchQualityHistoryWindow,
  readSearchQualityReceipts,
  searchQualityBenchmarks,
  searchQualityPlan,
} = require("./data/search-quality");
const {
  buildClaimCalibrationHistory,
  buildClaimCalibrationReport,
  buildClaimCalibrationReportFromReceipt,
  buildClaimCalibrationResponse,
  claimCalibrationPlan,
  readClaimCalibrationHistoryWindow,
  readLatestClaimCalibrationReceipt,
} = require("./data/claim-calibration");
const {
  buildOpportunityQualityHistory,
  buildOpportunityQualityEvaluation,
  buildOpportunityQualityEvaluationFromReceipt,
  buildOpportunityQualityResponse,
  readOpportunityQualityHistoryWindow,
  opportunityQualityPlan,
  readLatestOpportunityQualityReceipt,
  readOpportunityQualityReceipts,
} = require("./data/opportunity-quality");
const {
  buildUsabilityQualityHistory,
  buildUsabilityQualityEvaluationResponse,
  buildUsabilityQualityEvaluation,
  buildUsabilityQualityEvaluationFromReceipt,
  readLatestUsabilityQualityReceipt,
  readUsabilityQualityHistoryWindow,
  usabilityQualityPlan,
} = require("./data/usability-quality");
const {
  buildDesignStabilityHistory,
  buildDesignStabilityReportFromReceipt,
  buildDesignStabilityReport,
  buildDesignStabilityResponse,
  designStabilityPlan,
  readDesignStabilityHistoryWindow,
  readLatestDesignStabilityReceipt,
} = require("./data/design-stability");
const {
  buildKeyboardReadinessHistory,
  buildKeyboardReadinessReportFromReceipt,
  buildKeyboardReadinessReport,
  buildKeyboardReadinessResponse,
  keyboardReadinessPlan,
  readKeyboardReadinessHistoryWindow,
  readKeyboardReadinessReceipts,
} = require("./data/keyboard-readiness");
const {
  buildDesignAmbitionHistory,
  buildDesignAmbitionResponse,
  buildDesignAmbitionReportFromReceipt,
  buildDesignAmbitionReport,
  designAmbitionPlan,
  readDesignAmbitionHistoryWindow,
  readLatestDesignAmbitionReceipt,
} = require("./data/design-ambition");
const {
  buildEvaluationIntegrityHistory,
  buildEvaluationIntegrityReportFromReceipt,
  buildEvaluationIntegrityReport,
  buildEvaluationIntegrityResponse,
  evaluationIntegrityPlan,
  readEvaluationIntegrityReceipts,
} = require("./data/evaluation-integrity");
const {
  buildResearchRigorHistory,
  buildResearchRigorReportFromReceipt,
  buildResearchRigorReport,
  buildResearchRigorResponse,
  readLatestResearchRigorReceipt,
  readResearchRigorHistoryWindow,
  readResearchRigorReceipts,
  researchRigorPlan,
} = require("./data/research-rigor");
const {
  buildResearchEvaluationStressHistory,
  buildResearchEvaluationStressReportFromReceipt,
  buildResearchEvaluationStressReport,
  buildResearchEvaluationStressResponse,
  readResearchEvaluationStressHistoryWindow,
  readResearchEvaluationStressReceipts,
  researchEvaluationStressPlan,
} = require("./data/research-evaluation-stress");
const {
  buildEvaluationSampleHistory,
  buildEvaluationSampleReportFromReceipt,
  buildEvaluationSampleReport,
  buildEvaluationSampleResponse,
  evaluationSamplePlan,
  readEvaluationSampleHistoryWindow,
  readLatestEvaluationSampleReceipt,
  readEvaluationSampleReceipts,
} = require("./data/evaluation-sample");
const {
  appendRuntimeTruthReceipt,
  buildRuntimeTruthHistory,
  buildRuntimeTruthReport,
  buildRuntimeTruthResponse,
  readLatestRuntimeTruthReceipt,
  readRuntimeTruthHistoryWindow,
  readRuntimeTruthReceipts,
  runtimeTruthPlan,
} = require("./data/runtime-truth");
const {
  buildRuntimeDiffHistory,
  buildRuntimeDiffReport,
  buildRuntimeDiffReportFromReceipt,
  buildRuntimeDiffResponse,
  readLatestRuntimeDiffReceipt,
  readRuntimeDiffHistoryWindow,
  runtimeDiffPlan,
} = require("./data/runtime-diff");
const { buildRuntimeAttestation, buildRuntimeAttestationResponse, runtimeRouteManifest } = require("./data/runtime-attestation");
const {
  buildRuntimeSurfaceHistory,
  buildRuntimeSurfaceLatest,
  buildRuntimeSurfacePlanResponse,
  readLatestRuntimeSurfaceReceipt,
  readRuntimeSurfaceHistoryWindow,
  readRuntimeSurfaceReceipts,
  runtimeSurfacePlan,
} = require("./data/runtime-surface");
const {
  buildRouteLatencyHistory,
  buildRouteLatencyLatest,
  buildRouteLatencyPlanResponse,
  readLatestRouteLatencyReceipt,
  readRouteLatencyHistoryWindow,
  routeLatencyPlan,
} = require("./data/route-latency");
const {
  buildRuntimeBoundaryHistory,
  buildRuntimeBoundaryReport,
  buildRuntimeBoundaryReportFromReceipt,
  buildRuntimeBoundaryReportResponse,
  readRuntimeBoundaryHistoryWindow,
  readRuntimeBoundaryReceipts,
  runtimeBoundaryPlan,
} = require("./data/runtime-boundary");
const {
  buildRuntimeReconciliationReport,
  buildRuntimeReconciliationReportFromReceipt,
  buildRuntimeReconciliationResponse,
  readRuntimeReconciliationReceipts,
} = require("./data/runtime-reconciliation");
const {
  buildRuntimeExplanationHistory,
  buildRuntimeExplanationReport,
  buildRuntimeExplanationReportFromReceipt,
  buildRuntimeExplanationResponse,
  readLatestRuntimeExplainReceipt,
  readRuntimeExplainHistoryWindow,
  runtimeExplainPlan,
} = require("./data/runtime-explain");
const {
  buildRuntimeDeployReadinessHistory,
  buildRuntimeDeployReadinessReport,
  buildRuntimeDeployReadinessReportFromReceipt,
  buildRuntimeDeployReadinessResponse,
  readLatestRuntimeDeployReadinessReceipt,
  readRuntimeDeployReadinessHistoryWindow,
  runtimeDeployReadinessPlan,
} = require("./data/runtime-deploy-readiness");
const {
  buildRuntimeEvidenceChainHistory,
  buildRuntimeEvidenceChainReport,
  buildRuntimeEvidenceChainReportFromReceipt,
  buildRuntimeEvidenceChainResponse,
  readLatestRuntimeEvidenceChainReceipt,
  readRuntimeEvidenceChainHistoryWindow,
  runtimeEvidenceChainPlan,
} = require("./data/runtime-evidence-chain");
const {
  outreachDraftPlan,
  readOutreachDraftReceipts,
  buildOutreachDraftCatalog,
  ensureOutreachDraftStore,
  readOutreachDraftStore,
  recordOutreachDraftStatus,
} = require("./data/outreach-drafts");
const { appendStatusReceipt, buildStatusHistory, buildStatusResponse, readStatusReceipts, statusPlan } = require("./data/verification-receipts");

let sqlite = null;
try {
  sqlite = require("node:sqlite");
} catch {
  sqlite = null;
}

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const designStabilityHistoryLimit = 5;
const designAmbitionHistoryLimit = 5;
const keyboardReadinessHistoryLimit = 5;
const narrativeDisclosureHistoryLimit = 5;
const narrativeTailorHistoryLimit = 5;
const opportunityQualityHistoryLimit = 5;
const opportunityScorecardHistoryLimit = 5;
const proofQualityHistoryLimit = 5;
const runtimeDiffHistoryLimit = 5;
const runtimeEvidenceChainHistoryLimit = 5;
const runtimeDeployReadinessHistoryLimit = 5;
const runtimeExplainHistoryLimit = 5;
const runtimeBoundaryHistoryLimit = 5;
const graphProjectionGuardHistoryLimit = 3;
const publicStaticRoutes = new Set([
  "/index.html",
  "/styles.css",
  "/main.js",
  "/favicon.svg",
  "/desktop-hero.png",
]);

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self' mailto:",
    "frame-ancestors 'none'",
  ].join("; "),
};

const { projects, archiveNotes, domains, internalChecks, liveDemoChecks, profile } = require("./data/portfolio-data");
const { buildProjectCatalogResponse } = require("./data/project-catalog");
const packageManifest = require("./package.json");
const db = buildIndex();
const claimLedger = buildClaimLedger({ projects, profile });
const publicClaimLedger = claimLedger.map(publicClaim);
let artifactCatalogCache = null;
let artifactCollectionsCache = null;
let artifactMuseumComparisonCache = null;
let opportunityRadarCache = null;
let opportunityPackagesCache = null;
let skillGapMapCache = null;
let intentPathsCache = null;
let runtimeSurfaceContractCache = null;
let inlineRuntimeIdentityCache = null;
let gitIdentityCache = null;
let commandCenterSourceSignalsCache = null;
let commandCenterDesignSourceSignalsCache = null;
let commandCenterKeyboardSourceSignalsCache = null;
const guideAnswerCache = new Map();
const guidePrewarmQueries = ["", "recruiter", "recruiter agent proof", "agent infrastructure"];

function buildIndex() {
  if (!sqlite) return null;
  try {
    const instance = new sqlite.DatabaseSync(":memory:");
    instance.exec(`
      CREATE TABLE projects (
        slug TEXT PRIMARY KEY,
        title TEXT,
        kind TEXT,
        tier TEXT,
        summary TEXT,
        why TEXT,
        outcome TEXT,
        stack TEXT,
        tags TEXT,
        score INTEGER
      );
      CREATE VIRTUAL TABLE project_fts USING fts5(
        slug UNINDEXED,
        title,
        kind,
        tier,
        summary,
        why,
        outcome,
        stack,
        tags,
        proof
      );
    `);
    const insertProject = instance.prepare(`
      INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSearch = instance.prepare(`
      INSERT INTO project_fts(slug, title, kind, tier, summary, why, outcome, stack, tags, proof)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const project of projects) {
      const stack = project.stack.join(", ");
      const tags = project.tags.join(", ");
      const proof = project.proof.join(" ");
      insertProject.run(
        project.slug,
        project.title,
        project.kind,
        project.tier,
        project.summary,
        project.why,
        project.outcome,
        stack,
        tags,
        project.score,
      );
      insertSearch.run(
        project.slug,
        project.title,
        project.kind,
        project.tier,
        project.summary,
        project.why,
        project.outcome,
        stack,
        tags,
        proof,
      );
    }
    return instance;
  } catch (error) {
    console.warn("SQLite index unavailable; falling back to JS ranking.", error.message);
    return null;
  }
}

function json(res, body, status = 200) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function svg(res, body) {
  res.writeHead(200, {
    ...securityHeaders,
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  });
  res.end(body);
}

function notFound(res) {
  json(res, { error: "Not found" }, 404);
}

function getBody(req, maxBytes = 64_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
      req.destroy();
    };
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        fail(error);
      }
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(body);
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function tokenize(query) {
  return String(query || "")
    .toLowerCase()
    .match(/[a-z0-9+#.]+/g) || [];
}

function rankProjects(query, limit = 6) {
  const terms = tokenize(query);
  if (!terms.length) {
    return projects
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((project) => withSearchExplanation(project, terms));
  }

  const deterministicResults = rankProjectsByEvidence(query, terms, limit);
  if (deterministicResults.length) return deterministicResults;

  if (db) {
    try {
      const match = expandSearchTerms(query, terms).map((term) => `${term.replace(/"/g, "")}*`).join(" OR ");
      const rows = db
        .prepare(
          `SELECT slug, bm25(project_fts, 1.0, 7.0, 4.0, 2.5, 3.5, 3.0, 2.5, 1.2, 2.0, 2.2) AS rank
           FROM project_fts
           WHERE project_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(match, limit);
      if (rows.length) {
        const bySlug = new Map(projects.map((project) => [project.slug, project]));
        return rows.map((row) => withSearchExplanation({ ...bySlug.get(row.slug), rank: row.rank }, terms));
      }
    } catch {
      // Fall through to deterministic JS ranking.
    }
  }

  return projects
    .map((project) => {
      const haystack = [
        project.title,
        project.kind,
        project.tier,
        project.summary,
        project.why,
        project.outcome,
        project.stack.join(" "),
        project.tags.join(" "),
        project.proof.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      const hits = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
      const tierBoost = project.tier === "Hero" ? 14 : project.tier === "Strong" ? 8 : 2;
      return { ...project, rank: hits * 24 + tierBoost + project.score / 10 };
    })
    .filter((project) => project.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map((project) => withSearchExplanation(project, terms));
}

function rankProjectsByEvidence(query, terms, limit) {
  const normalized = String(query || "").toLowerCase();
  const expandedTerms = expandSearchTerms(query, terms);
  return projects
    .map((project) => {
      const haystack = searchDocumentForProject(project);
      const directHits = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
      const expandedHits = expandedTerms.reduce((count, term) => count + (!terms.includes(term) && haystack.includes(term) ? 1 : 0), 0);
      const fieldCoverage = searchFieldCoverage(project, expandedTerms);
      const tierBoost = project.tier === "Hero" ? 14 : project.tier === "Strong" ? 8 : 2;
      const intentBoost = searchIntentBoost(project, normalized);
      return {
        ...project,
        rank: directHits * 28 + expandedHits * 14 + fieldCoverage * 4 + intentBoost + tierBoost + project.score / 10,
      };
    })
    .filter((project) => project.rank > 0)
    .sort((a, b) => b.rank - a.rank || b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((project) => withSearchExplanation(project, terms));
}

function expandSearchTerms(query, terms) {
  const normalized = String(query || "").toLowerCase();
  const aliases = [];
  if (/\b(agent|infrastructure|qa|browser|automation)\b/.test(normalized)) aliases.push("agent", "browser", "qa", "automation", "verification", "pull", "requests");
  if (/\bproduction|maturity|mature|status|prove|proves|proof\b/.test(normalized)) aliases.push("production", "verification", "live", "status", "repo", "readme", "observability", "sandbox", "pr");
  if (/\blive|demo|demos|link|links\b/.test(normalized)) aliases.push("live", "demo", "dashboard", "website", "repo", "hackathon", "winner");
  if (/\bbluetooth|hardware|assistive|cane\b/.test(normalized)) aliases.push("bluetooth", "hardware", "assistive", "sensors", "mobile", "research");
  if (/\bprofessor|research|paper|methodology|limitations|academic\b/.test(normalized)) aliases.push("research", "paper", "methodology", "limitations", "science", "published", "hardware", "agent");
  if (/\bship|shipped|built|build|builder|deliver\b/.test(normalized)) aliases.push("shipped", "built", "demo", "repo", "pr", "winner", "finalist", "production");
  if (/\bstale|freshness|source|repair|outdated|needs-source\b/.test(normalized)) aliases.push("stale", "freshness", "source", "repair", "recently", "updated", "verification", "governance");
  return [...new Set([...terms, ...aliases].filter(Boolean))];
}

function searchDocumentForProject(project) {
  return [
    project.slug,
    project.title,
    project.kind,
    project.tier,
    project.summary,
    project.why,
    project.outcome,
    project.timeline,
    project.visibility,
    project.stack.join(" "),
    project.tags.join(" "),
    project.proof.join(" "),
    ...claimsForProject(claimLedger, project.slug).flatMap((claim) => [claim.text, claim.evidenceStrength, claim.verificationStatus]),
  ]
    .join(" ")
    .toLowerCase();
}

function searchFieldCoverage(project, terms) {
  const fields = [
    project.title,
    project.kind,
    project.summary,
    project.why,
    project.outcome,
    project.stack.join(" "),
    project.tags.join(" "),
    project.proof.join(" "),
  ];
  return fields.filter((field) => terms.some((term) => String(field).toLowerCase().includes(term))).length;
}

function searchIntentBoost(project, normalized) {
  const boosts = [
    [/\b(agent|infrastructure|qa|browser|automation)\b/, ["qagent", "flowpr", "repro"], 28],
    [/\bproduction|maturity|mature|status\b/, ["flowpr", "qagent", "repro", "heyblue", "freeyt-navio"], 26],
    [/\blive|demo|demos|link|links\b/, ["anchormesh", "qagent", "flowpr", "fairvalue"], 28],
    [/\bbluetooth|hardware|assistive|cane\b/, ["smartcane", "anchormesh"], 35],
    [/\bprofessor|research|paper|methodology|limitations|academic\b/, ["smartcane", "qagent", "repro", "anchormesh"], 30],
    [/\bship|shipped|built|build|builder|deliver\b/, ["qagent", "flowpr", "anchormesh", "fairvalue", "heyblue"], 28],
    [/\bstale|freshness|source|repair|outdated|needs-source\b/, ["qagent", "flowpr", "smartcane", "anchormesh"], 30],
  ];
  return boosts.reduce((score, [pattern, slugs, value]) => score + (pattern.test(normalized) && slugs.includes(project.slug) ? value : 0), 0);
}

function withSearchExplanation(project, terms) {
  const projectClaims = claimsForProject(claimLedger, project.slug);
  const topClaim = projectClaims
    .slice()
    .sort((left, right) => right.confidenceScore - left.confidenceScore)[0];
  const evidenceSnippet = topClaim?.text || project.proof[0] || project.outcome;
  const confidenceScore = projectClaims.length
    ? Math.round(projectClaims.reduce((sum, claim) => sum + claim.confidenceScore, 0) / projectClaims.length)
    : project.score;
  const relatedClaims = projectClaims.slice(0, 3).map((claim) => claim.id);
  if (!terms.length) {
    return {
      ...project,
      explanation: `Ranked by proof score (${project.score}/100), claim confidence (${confidenceScore}/100), and portfolio tier.`,
      evidenceSnippet,
      confidenceScore,
      relatedClaims,
    };
  }
  const fields = {
    title: project.title,
    kind: project.kind,
    outcome: project.outcome,
    stack: project.stack.join(" "),
    tags: project.tags.join(" "),
    summary: project.summary,
    proof: project.proof.join(" "),
  };
  const matchedFields = Object.entries(fields)
    .filter(([, value]) => terms.some((term) => String(value).toLowerCase().includes(term)))
    .map(([field]) => field);
  const uniqueFields = [...new Set(matchedFields)].slice(0, 3);
  return {
    ...project,
    explanation: uniqueFields.length
      ? `Matches ${terms.join(", ")} in ${uniqueFields.join(", ")}; signal ${project.score}/100.`
      : `Closest proof match by tier and signal score (${project.score}/100).`,
    evidenceSnippet,
    confidenceScore,
    relatedClaims,
  };
}

function buildSearchResponse(query, { detail = "summary", limit = 8, summaryLimit = 5 } = {}) {
  const results = rankProjects(query, limit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = searchFullDetailEndpoint(query);
  const compactResults = results.slice(0, boundedSearchSummaryLimit(summaryLimit, results.length));
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "public-project-search",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    query: String(query || ""),
    sourceBoundary:
      fullDetail
        ? "Search ranks public-safe local project and claim projections. It does not crawl external pages, expose private references, or claim live production search analytics."
        : undefined,
    sourceBoundaryAvailable: fullDetail ? undefined : true,
    fullDetailEndpoint,
    ...(fullDetail ? {} : { caseStudyEndpointTemplate: "/api/case-study/:slug" }),
    results: fullDetail ? results : compactResults.map(summarizeSearchResult),
    searchPayloadPolicy: {
      fullDetail,
      resultsReturned: fullDetail ? results.length : compactResults.length,
      rankedResultCount: results.length,
      summaryResultLimit: fullDetail ? undefined : compactResults.length,
      ...(fullDetail
        ? {
            fullDetailEndpoint,
            defaultRows: "full project results with search explanations",
          }
        : {}),
    },
  };
}

function summarizeSearchResult(project) {
  const relatedClaims = project.relatedClaims || [];
  return {
    slug: project.slug,
    title: project.title,
    explanation: compactSearchExplanation(project.explanation),
    evidenceSnippet: compactSearchSnippet(project.evidenceSnippet, 96),
    confidenceScore: project.confidenceScore,
    relatedClaims: relatedClaims.slice(0, 1),
    relatedClaimCount: relatedClaims.length,
  };
}

function boundedSearchSummaryLimit(limit, available) {
  return Math.max(1, Math.min(Number(limit) || 5, available || 0, 8));
}

function compactSearchSnippet(value, maxLength = 140) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function compactSearchExplanation(value) {
  return String(value || "")
    .replace(
      /Ranked by proof score \((\d+)\/100\), claim confidence \((\d+)\/100\), and portfolio tier\./,
      "Ranked by proof $1, confidence $2, tier.",
    )
    .replace(/Matches ([^;]+); signal (\d+)\/100\./, "Matches $1; signal $2.")
    .replace(/Closest proof match by tier and signal score \((\d+)\/100\)\./, "Closest proof match; signal $1.");
}

function searchFullDetailEndpoint(query) {
  const params = new URLSearchParams();
  const normalized = String(query || "").trim();
  if (normalized) params.set("q", normalized);
  params.set("detail", "full");
  return `/api/search?${params.toString()}`;
}

function buildGuideAnswer(query, { detail = "summary" } = {}) {
  const cacheKey = String(query || "").trim().toLowerCase();
  const cached = guideAnswerCache.get(cacheKey);
  if (cached) return buildGuideAnswerResponse({ query, ...cached }, { detail });

  const intentCatalog = currentIntentPaths();
  const intentPath = selectIntentPath(query, intentCatalog);
  const normalized = String(query || "").toLowerCase();
  const results =
    /\b(actual|actually|ship|shipped|built|proof|recruiter)\b/.test(normalized)
      ? projects
      .filter((project) => project.tier === "Hero" || project.tier === "Strong")
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      : rankProjects(query, 5);
  if (!results.length) {
    const payload = {
      answer:
        "I did not find a tight match. The best default path is AnchorMesh, QAgent, FlowPR, FairValue, and SmartCane because they combine awards, technical depth, and clear outcomes.",
      results: rankProjects("", 5),
      intentPath,
    };
    guideAnswerCache.set(cacheKey, payload);
    return buildGuideAnswerResponse({ query, ...payload }, { detail });
  }
  const lead = results[0];
  const otherTitles = results
    .slice(1, 4)
    .map((project) => project.title)
    .join(", ");
  const payload = {
    answer: `${lead.title} is the strongest match: ${lead.summary} ${lead.outcome} ${
      otherTitles ? `Also inspect ${otherTitles}.` : ""
    }`,
    results,
    intentPath,
  };
  guideAnswerCache.set(cacheKey, payload);
  return buildGuideAnswerResponse({ query, ...payload }, { detail });
}

function buildGuideAnswerResponse(payload, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = guideEndpoint(payload.query, "full");
  if (fullDetail) {
    return {
      ...payload,
      detail: "full",
      compact: false,
      summaryEndpoint: guideEndpoint(payload.query),
      fullDetailEndpoint,
      guidePayloadPolicy: {
        fullDetail: true,
        resultsReturned: payload.results?.length || 0,
        intentPathDetail: "full",
      },
    };
  }

  const compactResults = (payload.results || []).slice(0, 4);
  return {
    query: payload.query,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    answer: payload.answer,
    results: compactResults.map(summarizeGuideResult),
    intentPath: summarizeGuideIntentPath(payload.intentPath),
    guidePayloadPolicy: {
      fullDetail: false,
      resultsReturned: compactResults.length,
      rankedResultCount: payload.results?.length || 0,
      fullDetailAvailable: true,
      omittedFromSummaryCount: 6,
    },
  };
}

function guideEndpoint(query, detail) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (detail === "full") params.set("detail", "full");
  const suffix = params.toString();
  return suffix ? `/api/guide?${suffix}` : "/api/guide";
}

function summarizeGuideResult(project) {
  const confidenceScore = project.confidenceScore || project.score;
  return {
    slug: project.slug,
    title: project.title,
    explanation: `proof ${project.score}/100; confidence ${confidenceScore}/100`,
    caseStudyEndpoint: `/api/case-study/${project.slug}`,
  };
}

function summarizeGuideIntentPath(intentPath) {
  if (!intentPath) return null;
  return {
    id: intentPath.id,
    label: intentPath.label,
    timeBox: intentPath.timeBox,
    riskDisclosure: (intentPath.riskDisclosure || []).slice(0, 1),
    cta: compactSearchSnippet(intentPath.cta, 96),
    timeBoxedPath: (intentPath.timeBoxedPath || []).slice(0, 4).map((step) => ({
      minute: step.minute,
      action: step.action,
      target: step.target,
    })),
  };
}

function prewarmGuideAnswers() {
  for (const query of guidePrewarmQueries) {
    buildGuideAnswer(query);
  }
}

function prewarmReceiptCaches() {
  currentArtifactCollections();
  currentArtifactMuseumComparisonReport();
  currentOpportunityPackages();
  currentSkillGapMap();
  readLatestSelfReviewReceipt(root);
  readSelfReviewHistoryWindow(root, { limit: 20 });
  readLatestAccessibilityAuditReport(root);
  readAccessibilityAuditHistoryWindow(root, { limit: 20 });
  readLatestOpportunityDeRiskingReceipt(root);
  readOpportunityDeRiskingHistoryWindow(root, { limit: 20 });
  readLatestOpportunityRankingReceipt(root);
  readOpportunityRankingHistoryWindow(root, { limit: 5 });
  readOpportunityScorecardHistoryWindow(root, { limit: opportunityScorecardHistoryLimit });
  readNarrativeSequenceHistoryWindow(root, { limit: 5 });
  readLatestEvaluationSampleReceipt(root);
  readEvaluationSampleHistoryWindow(root, { limit: 5 });
  readLatestGraphSnapshotReceipt(root);
  readGraphSnapshotHistoryWindow(root, { limit: 20 });
  readLatestGraphQualityReceipt(root);
  readGraphQualityHistoryWindow(root, { limit: 5 });
  readLatestGraphDisclosureLinksReceipt(root);
  readGraphDisclosureLinksHistoryWindow(root, { limit: 5 });
  readLatestGraphCrosslinkReceipt(root);
  buildGraphCrosslinkHistory(readGraphCrosslinkHistoryWindow(root, { limit: 20 }));
  readLatestGraphScoreboardReceipt(root);
  readGraphScoreboardHistoryWindow(root, { limit: 20 });
  readLatestGraphLineageReceipt(root);
  readGraphLineageHistoryWindow(root, { limit: 5 });
  readLatestGraphProjectionGuardReceipt(root);
  readGraphProjectionGuardHistoryWindow(root, { limit: graphProjectionGuardHistoryLimit });
  readLatestGraphConfidenceReceipt(root);
  readGraphConfidenceHistoryWindow(root, { limit: 20 });
  readNarrativeDisclosureHistoryWindow(root, { limit: narrativeDisclosureHistoryLimit });
  readNarrativeTailorHistoryWindow(root, { limit: narrativeTailorHistoryLimit });
  readLatestOpportunityQualityReceipt(root);
  readOpportunityQualityHistoryWindow(root, { limit: opportunityQualityHistoryLimit });
  readLatestProofQualityReceipt(root);
  readProofQualityHistoryWindow(root, { limit: proofQualityHistoryLimit });
  readLatestSearchQualityReceipt(root);
  readSearchQualityHistoryWindow(root, { limit: 20 });
  readEvidenceRefreshHistoryWindow(root, { limit: 5 });
  readLatestClaimCalibrationReceipt(root);
  readClaimCalibrationHistoryWindow(root, { limit: 20 });
  readLatestUsabilityQualityReceipt(root);
  readUsabilityQualityHistoryWindow(root, { limit: 5 });
  readResearchEvaluationStressHistoryWindow(root, { limit: 5 });
  readLatestResearchRigorReceipt(root);
  readResearchRigorHistoryWindow(root, { limit: 5 });
  readLatestDesignStabilityReceipt(root);
  readDesignStabilityHistoryWindow(root, { limit: designStabilityHistoryLimit });
  readLatestDesignAmbitionReceipt(root);
  readDesignAmbitionHistoryWindow(root, { limit: designAmbitionHistoryLimit });
  commandCenterKeyboardSourceSignals();
  readKeyboardReadinessHistoryWindow(root, { limit: keyboardReadinessHistoryLimit });
  readLatestRuntimeTruthReceipt(root);
  readRuntimeTruthHistoryWindow(root, { limit: 5 });
  readLatestRuntimeDiffReceipt(root);
  readRuntimeDiffHistoryWindow(root, { limit: runtimeDiffHistoryLimit });
  readLatestRuntimeExplainReceipt(root);
  readRuntimeExplainHistoryWindow(root, { limit: runtimeExplainHistoryLimit });
  readLatestRuntimeSurfaceReceipt(root);
  readRuntimeSurfaceHistoryWindow(root, { limit: 20 });
  readLatestRouteLatencyReceipt(root);
  readRouteLatencyHistoryWindow(root, { limit: 5 });
  readLatestRuntimeDeployReadinessReceipt(root);
  readRuntimeDeployReadinessHistoryWindow(root, { limit: runtimeDeployReadinessHistoryLimit });
  readLatestRuntimeEvidenceChainReceipt(root);
  readRuntimeEvidenceChainHistoryWindow(root, { limit: runtimeEvidenceChainHistoryLimit });
}

function prewarmRuntimeTruth() {
  for (const host of [`localhost:${port}`, `127.0.0.1:${port}`]) {
    runtimeTruth({ headers: { host } });
  }
}

function graphPayload() {
  const graphArtifactCatalog = currentArtifactCatalog();
  const graphSkillMap = currentSkillGapMap();
  const skillNodes = new Map();
  for (const skill of graphSkillMap.skills || []) {
    const id = `skill-${slugify(skill.label)}`;
    if (!skillNodes.has(id)) {
      skillNodes.set(id, {
        id,
        label: skill.label,
        type: "skill",
        score: skill.evidence?.averageConfidence || 50,
        status: skill.status,
      });
    }
  }
  for (const project of projects) {
    for (const tag of project.tags.slice(0, 4)) {
      const id = `skill-${slugify(tag)}`;
      if (!skillNodes.has(id)) skillNodes.set(id, { id, label: tag, type: "skill" });
    }
  }
  const graphClaims = claimLedger
    .map(publicClaim)
    .sort((left, right) => right.confidenceScore - left.confidenceScore);
  const graphOpportunities = currentOpportunityRadar().opportunities.slice(0, 8);
  const graphReceipts = readStatusReceipts().slice(0, 4);
  const graphArtifacts = graphArtifactCatalog.artifacts
    .slice()
    .sort((left, right) => right.confidenceScore - left.confidenceScore || left.id.localeCompare(right.id));
  const graphScreenshotGaps = (graphArtifactCatalog.gaps || []).filter((gap) => gap.gapType === "screenshot");
  const graphArtifactGapRepairs = graphArtifactGapRepairProjection({
    gaps: graphScreenshotGaps,
    opportunityPackages: currentOpportunityPackages(),
  });
  const graphRepositoryArtifacts = graphArtifacts.filter((artifact) => artifact.artifactType === "repo-link");
  const graphDemoArtifacts = graphArtifacts.filter((artifact) => artifact.artifactType === "live-demo-link");
  const graphAwardProjects = projects.filter((project) => /award|winner|hackathon|place/i.test(`${project.outcome} ${project.proof.join(" ")}`));
  const graphTimelineProjects = projects;
  const graphMaintenance = currentMaintenanceReport().issues;
  const graphWeaknesses = currentProjectWeaknessMap()
    .projects.slice()
    .sort((left, right) => weaknessRank(right.riskLevel) - weaknessRank(left.riskLevel) || right.improvementActions.length - left.improvementActions.length)
    .slice(0, 13);
  const graphPackets = currentAudiencePackets().packets || [];
  const graphNarratives = currentNarrativeGroundingReport().narratives || [];
  const graphNarrativeObjectionAudiences = currentNarrativeObjectionReport().audiences || [];
  const graphNarrativeObjections = graphNarrativeObjectionAudiences.flatMap((audience) =>
    audience.objections.map((objection) => ({ audience, objection })),
  );
  const graphTailoredAudiences = currentNarrativeTailorGraphReport().audiences || [];
  const graphTailoredNarratives = graphTailoredAudiences.flatMap((audience) =>
    audience.variants.map((variant) => ({ audience, variant })),
  );
  const nodes = [
    { id: "rishabh", label: "Rishabh", type: "person", score: 100 },
    ...projects.map((project) => ({
      id: project.slug,
      label: project.title,
      type: "project",
      score: project.score,
      tier: project.tier,
      gradient: project.gradient,
    })),
    ...domains.map((domain) => ({
      id: `domain-${slugify(domain.label)}`,
      label: domain.label,
      type: "domain",
      url: domain.url,
    })),
    ...skillNodes.values(),
    ...graphClaims.map((claim) => ({
      id: claim.id,
      label: claim.text.slice(0, 72),
      type: "claim",
      score: claim.confidenceScore,
      evidenceStrength: claim.evidenceStrength,
      privacyLevel: claim.privacyLevel,
    })),
    ...graphOpportunities.map((opportunity) => ({
      id: `opportunity-${opportunity.id}`,
      label: opportunity.label,
      type: "opportunity",
      score: opportunity.fitScore,
      audience: opportunity.audience,
    })),
    ...graphReceipts.map((receipt) => ({
      id: `receipt-${receipt.id}`,
      label: `Status receipt ${receipt.checkedAt}`,
      type: "verification-receipt",
      score: receipt.summary.passing,
    })),
    ...graphArtifacts.map((artifact) => ({
      id: artifact.id,
      label: artifact.label,
      type: "artifact",
      score: artifact.confidenceScore,
      artifactType: artifact.artifactType,
      project: artifact.project,
      privacyLevel: artifact.privacyLevel,
    })),
    ...graphScreenshotGaps.map((gap) => ({
      id: `screenshot-${gap.id}`,
      label: gap.label,
      type: "screenshot",
      score: 35,
      project: gap.project,
      sourceStatus: gap.sourceStatus,
    })),
    ...graphArtifactGapRepairs.map((repair) => ({
      id: repair.nodeId,
      label: repair.label,
      type: "artifact-gap-repair",
      score: repair.unlockScore,
      project: repair.project,
      gapId: repair.gapId,
      opportunityUnlocks: repair.linkedOpportunityIds.length,
    })),
    ...graphRepositoryArtifacts.map((artifact) => ({
      id: `repository-${artifact.project}`,
      label: `${artifact.projectTitle} repository`,
      type: "repository",
      score: artifact.confidenceScore,
      project: artifact.project,
      artifactId: artifact.id,
    })),
    ...graphDemoArtifacts.map((artifact) => ({
      id: `demo-${artifact.project}`,
      label: `${artifact.projectTitle} demo`,
      type: "demo",
      score: artifact.confidenceScore,
      project: artifact.project,
      artifactId: artifact.id,
    })),
    ...graphAwardProjects.map((project) => ({
      id: `award-${project.slug}`,
      label: `${project.title} award signal`,
      type: "award",
      score: project.score,
      project: project.slug,
      outcome: project.outcome,
    })),
    ...graphTimelineProjects.map((project) => ({
      id: `timeline-${project.slug}`,
      label: `${project.title} timeline`,
      type: "event",
      score: project.score,
      project: project.slug,
      timeline: project.timeline,
    })),
    ...graphMaintenance.map((issue) => ({
      id: `maintenance-${issue.id}`,
      label: issue.title,
      type: "maintenance",
      score: issue.severity === "high" ? 35 : issue.severity === "medium" ? 58 : 76,
      severity: issue.severity,
      project: issue.project,
    })),
    ...graphWeaknesses.map((weakness) => ({
      id: `weakness-${weakness.slug}`,
      label: `${weakness.title} weakness map`,
      type: "weakness",
      score: weakness.evidenceScore,
      riskLevel: weakness.riskLevel,
      project: weakness.slug,
    })),
    ...graphPackets.map((packet) => ({
      id: `packet-${packet.id}`,
      label: packet.label,
      type: "audience-packet",
      score: packet.uncertaintyDisclosure.confidenceScore,
      audience: packet.audience,
    })),
    ...graphNarratives.map((narrative) => ({
      id: `narrative-${narrative.id}`,
      label: narrative.label,
      type: "narrative",
      score: narrative.groundingScore,
      audience: narrative.audience,
    })),
    ...graphTailoredNarratives.map(({ audience, variant }) => ({
      id: `tailored-${audience.id}-${variant.id}`,
      label: `${audience.label}: ${variant.label}`,
      type: "tailored-narrative",
      score: variant.groundingScore,
      audience: audience.audience,
      variantType: variant.id,
      band: variant.band,
      manualUseBoundary: variant.manualUseBoundary,
    })),
    ...graphNarrativeObjections.map(({ audience, objection }) => ({
      id: `objection-${audience.id}-${objection.id}`,
      label: `${audience.label}: ${objection.challenge}`.slice(0, 92),
      type: "narrative-objection",
      score: objection.answerabilityScore,
      audience: audience.audience,
      objectionType: objection.id,
      riskLevel: objection.riskLevel,
      mustDisclose: objection.mustDisclose,
    })),
    { id: "uiuc", label: "UIUC 2030", type: "education" },
    { id: "ap-stats", label: "AP Stats", type: "course" },
    { id: "openclaw", label: "OpenClaw", type: "system" },
    { id: "trust-console", label: "Public trust console", type: "system" },
  ];

  const edges = [
    ...projects.map((project) =>
      graphEdge(
        "rishabh",
        project.slug,
        project.score,
        "built",
        `${project.title} is represented as one of Rishabh's selected work nodes.`,
      ),
    ),
    ...projects.flatMap((project) =>
      project.tags.slice(0, 3).map((tag) =>
        graphEdge(
          project.slug,
          `skill-${slugify(tag)}`,
          Math.max(20, project.score - 20),
          "shows-skill",
          `${project.title} is connected to the ${tag} skill signal through its project tags.`,
        ),
      ),
    ),
    ...graphClaims
      .filter((claim) => claim.relatedProject)
      .map((claim) => {
        const project = projects.find((item) => item.slug === claim.relatedProject);
        return graphEdge(
          claim.relatedProject,
          claim.id,
          claim.confidenceScore,
          "supports-claim",
          `${project?.title || claim.relatedProject} supports this ${claim.evidenceStrength} claim at ${claim.confidenceScore}% confidence.`,
        );
      }),
    ...graphOpportunities.flatMap((opportunity) =>
      opportunity.relatedProof.map((proof) =>
        graphEdge(
          proof.slug,
          `opportunity-${opportunity.id}`,
          opportunity.fitScore,
          "fits-opportunity",
          `${proof.title} contributes to the ${opportunity.label} opportunity route.`,
        ),
      ),
    ),
    ...graphReceipts.map((receipt) =>
      graphEdge(
        "trust-console",
        `receipt-${receipt.id}`,
        receipt.summary.passing,
        "recorded-receipt",
        `The trust console recorded ${receipt.summary.passing} passing checks at ${receipt.checkedAt}.`,
      ),
    ),
    ...graphArtifacts.map((artifact) =>
      graphEdge(
        artifact.project,
        artifact.id,
        artifact.confidenceScore,
        "has-artifact",
        `${artifact.projectTitle} exposes ${artifact.label} as a public-safe ${artifact.artifactType} artifact.`,
      ),
    ),
    ...graphScreenshotGaps.map((gap) =>
      graphEdge(
        gap.project,
        `screenshot-${gap.id}`,
        35,
        "needs-screenshot-artifact",
        `${gap.projectTitle} has an explicit screenshot gap that remains public-safe and repairable.`,
      ),
    ),
    ...graphArtifactGapRepairs.flatMap((repair) => [
      graphEdge(
        repair.project,
        repair.nodeId,
        repair.unlockScore,
        "has-artifact-gap-repair",
        `${repair.projectTitle} has a public-safe proof repair node for ${repair.gapId}.`,
      ),
      graphEdge(
        `screenshot-${repair.gapId}`,
        repair.nodeId,
        repair.unlockScore,
        "planned-by-gap-repair",
        `${repair.gapId} is routed into a proof repair plan instead of being treated as completed media.`,
      ),
      ...repair.linkedOpportunityIds.map((opportunityId) =>
        graphEdge(
          repair.nodeId,
          `opportunity-${opportunityId}`,
          repair.unlockScore,
          "unblocks-opportunity-proof",
          `${repair.label} would improve the proof path for ${opportunityId} without claiming outreach, submissions, or screenshots already exist.`,
        ),
      ),
    ]),
    ...graphRepositoryArtifacts.flatMap((artifact) => [
      graphEdge(
        artifact.project,
        `repository-${artifact.project}`,
        artifact.confidenceScore,
        "has-repository-proof",
        `${artifact.projectTitle} has a public-safe repository proof node derived from ${artifact.id}.`,
      ),
      graphEdge(
        `repository-${artifact.project}`,
        artifact.id,
        artifact.confidenceScore,
        "represented-by-artifact",
        `${artifact.id} is the concrete artifact behind the ${artifact.projectTitle} repository node.`,
      ),
    ]),
    ...graphDemoArtifacts.flatMap((artifact) => [
      graphEdge(
        artifact.project,
        `demo-${artifact.project}`,
        artifact.confidenceScore,
        "has-demo-proof",
        `${artifact.projectTitle} has a public-safe demo proof node derived from ${artifact.id}.`,
      ),
      graphEdge(
        `demo-${artifact.project}`,
        artifact.id,
        artifact.confidenceScore,
        "represented-by-artifact",
        `${artifact.id} is the concrete artifact behind the ${artifact.projectTitle} demo node.`,
      ),
    ]),
    ...graphAwardProjects.map((project) =>
      graphEdge(
        project.slug,
        `award-${project.slug}`,
        project.score,
        "has-award-signal",
        `${project.title} has an award or hackathon signal: ${project.outcome}`,
      ),
    ),
    ...graphTimelineProjects.map((project) =>
      graphEdge(
        project.slug,
        `timeline-${project.slug}`,
        project.score,
        "has-timeline-event",
        `${project.title} is anchored to the timeline entry ${project.timeline}.`,
      ),
    ),
    ...graphMaintenance
      .filter((issue) => projects.some((project) => project.slug === issue.project))
      .map((issue) =>
        graphEdge(
          issue.project,
          `maintenance-${issue.id}`,
          issue.severity === "high" ? 35 : issue.severity === "medium" ? 58 : 76,
          "has-maintenance-risk",
          `${issue.title} is tracked as a ${issue.severity} maintenance issue for ${issue.project}.`,
        ),
      ),
    ...graphWeaknesses.map((weakness) =>
      graphEdge(
        weakness.slug,
        `weakness-${weakness.slug}`,
        weakness.evidenceScore,
        "has-weakness-map",
        `${weakness.title} has a ${weakness.riskLevel} weakness map with ${weakness.improvementActions.length} improvement action(s).`,
      ),
    ),
    ...graphPackets.map((packet) =>
      graphEdge(
        "rishabh",
        `packet-${packet.id}`,
        packet.uncertaintyDisclosure.confidenceScore,
        "uses-audience-packet",
        `${packet.label} packages public-safe evidence for the ${packet.audience} audience.`,
      ),
    ),
    ...graphNarratives.map((narrative) =>
      graphEdge(
        "rishabh",
        `narrative-${narrative.id}`,
        narrative.groundingScore,
        "uses-narrative",
        `${narrative.label} is grounded at ${narrative.groundingScore}/100 for the ${narrative.audience} audience.`,
      ),
    ),
    ...graphNarratives.map((narrative) =>
      graphEdge(
        `packet-${narrative.id}`,
        `narrative-${narrative.id}`,
        narrative.groundingScore,
        "grounds-narrative",
        `${narrative.label} is generated from the ${narrative.audience} evidence packet.`,
      ),
    ),
    ...graphTailoredNarratives.map(({ audience, variant }) =>
      graphEdge(
        `narrative-${audience.id}`,
        `tailored-${audience.id}-${variant.id}`,
        variant.groundingScore,
        "tailors-narrative",
        `${audience.label} produces the ${variant.label} graph draft at ${variant.groundingScore}/100 grounding.`,
      ),
    ),
    ...graphNarratives.flatMap((narrative) =>
      narrative.claimsUsed
        .filter((claimId) => graphClaims.some((claim) => claim.id === claimId))
        .slice(0, 4)
        .map((claimId) =>
          graphEdge(
            `narrative-${narrative.id}`,
            claimId,
            narrative.groundingScore,
            "narrative-uses-claim",
            `${narrative.label} uses claim ${claimId} in its grounded narrative sequence.`,
          ),
        ),
    ),
    ...graphTailoredNarratives.flatMap(({ audience, variant }) =>
      variant.claimsUsed
        .filter((claimId) => graphClaims.some((claim) => claim.id === claimId))
        .slice(0, 4)
        .map((claimId) =>
          graphEdge(
            `tailored-${audience.id}-${variant.id}`,
            claimId,
            variant.groundingScore,
            "tailored-narrative-uses-claim",
            `${variant.label} for ${audience.label} uses claim ${claimId}.`,
          ),
        ),
    ),
    ...graphTailoredNarratives.flatMap(({ audience, variant }) =>
      variant.artifactsUsed
        .filter((artifactId) => graphArtifacts.some((artifact) => artifact.id === artifactId))
        .slice(0, 4)
        .map((artifactId) =>
          graphEdge(
            `tailored-${audience.id}-${variant.id}`,
            artifactId,
            variant.groundingScore,
            "tailored-narrative-cites-artifact",
            `${variant.label} for ${audience.label} cites artifact ${artifactId}.`,
          ),
        ),
    ),
    ...graphNarrativeObjections.map(({ audience, objection }) =>
      graphEdge(
        `narrative-${audience.id}`,
        `objection-${audience.id}-${objection.id}`,
        objection.answerabilityScore,
        "pressure-tested-by",
        `${audience.label} is pressure-tested by the ${objection.id} objection at ${objection.answerabilityScore}/100 answerability.`,
      ),
    ),
    ...graphNarrativeObjections.flatMap(({ audience, objection }) =>
      audience.sourceProjects
        .filter((slug) => projects.some((project) => project.slug === slug))
        .map((slug) =>
          graphEdge(
            `objection-${audience.id}-${objection.id}`,
            slug,
            objection.answerabilityScore,
            "concerns-project",
            `${objection.challenge} concerns source project ${slug}.`,
          ),
        ),
    ),
    ...graphNarrativeObjections.flatMap(({ audience, objection }) =>
      objection.evidence
        .filter((evidenceId) => graphClaims.some((claim) => claim.id === evidenceId))
        .map((claimId) =>
          graphEdge(
            `objection-${audience.id}-${objection.id}`,
            claimId,
            objection.answerabilityScore,
            "answered-by-claim",
            `${objection.challenge} is answered in part by claim ${claimId}.`,
          ),
        ),
    ),
    ...graphNarrativeObjections.flatMap(({ audience, objection }) =>
      objection.evidence
        .filter((evidenceId) => graphArtifacts.some((artifact) => artifact.id === evidenceId))
        .map((artifactId) =>
          graphEdge(
            `objection-${audience.id}-${objection.id}`,
            artifactId,
            objection.answerabilityScore,
            "answered-by-artifact",
            `${objection.challenge} is answered in part by artifact ${artifactId}.`,
          ),
        ),
    ),
    ...graphNarrativeObjections.flatMap(({ audience, objection }) =>
      objection.evidence
        .filter((evidenceId) => String(evidenceId).startsWith("packet."))
        .map((evidenceId) =>
          graphEdge(
            `objection-${audience.id}-${objection.id}`,
            `packet-${audience.id}`,
            objection.answerabilityScore,
            "uses-packet-disclosure",
            `${objection.challenge} uses packet disclosure evidence ${evidenceId}.`,
          ),
        ),
    ),
    ...graphNarrativeObjections.flatMap(({ audience, objection }) =>
      objection.evidence
        .filter((evidenceId) => String(evidenceId).startsWith(`narrative.${audience.id}`))
        .map((evidenceId) =>
          graphEdge(
            `objection-${audience.id}-${objection.id}`,
            `narrative-${audience.id}`,
            objection.answerabilityScore,
            "uses-narrative-disclosure",
            `${objection.challenge} uses narrative disclosure evidence ${evidenceId}.`,
          ),
        ),
    ),
    ...graphNarratives.flatMap((narrative) =>
      narrative.artifactsUsed
        .filter((artifactId) => graphArtifacts.some((artifact) => artifact.id === artifactId))
        .slice(0, 4)
        .map((artifactId) =>
          graphEdge(
            `narrative-${narrative.id}`,
            artifactId,
            narrative.groundingScore,
            "narrative-uses-artifact",
            `${narrative.label} uses artifact ${artifactId} as public-safe proof.`,
          ),
        ),
    ),
    graphEdge("rishabh", "uiuc", 80, "education", "UIUC is represented as the long-range education node."),
    graphEdge("rishabh", "ap-stats", 55, "coursework", "AP Stats is represented as a current coursework signal."),
    graphEdge("rishabh", "openclaw", 70, "uses-system", "OpenClaw is represented as a local agent-system dependency."),
    graphEdge("rishabh", "trust-console", 74, "publishes", "The public trust console exposes claim and verification status."),
    graphEdge("flowpr", "domain-rishabhbtech", 45, "published-at", "FlowPR is connected to the rishabhb.tech domain surface."),
    graphEdge("admitly", "domain-rishabhbme", 45, "published-at", "Admitly is connected to the rishabhb.me domain surface."),
    graphEdge("anchormesh", "domain-rishabhbdev", 50, "published-at", "AnchorMesh is connected to the rishabhb.dev domain surface."),
  ];
  return { nodes, edges };
}

function currentGraphPayload({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedGraph = buildGraphPayloadFromReceipt(readLatestGraphSnapshotReceipt(root));
    if (cachedGraph) return cachedGraph;
  }
  return buildGraphPayloadSnapshot({
    graph: graphPayload(),
    receipts: readGraphSnapshotReceipts(root),
  });
}

function graphArtifactGapRepairProjection({ gaps, opportunityPackages }) {
  const packages = opportunityPackages.packages || [];
  return gaps
    .map((gap) => {
      const linkedPackages = packages.filter((item) => (item.evidenceBundle || []).some((proof) => proof.slug === gap.project));
      const narrativeImpact = linkedPackages.filter((item) => /research|professor|founder|civic|agent|hackathon/i.test(item.audience || "")).length;
      const unlockScore = Math.min(100, 46 + linkedPackages.length * 8 + narrativeImpact * 6);
      return {
        nodeId: `artifact-gap-repair-${gap.id}`,
        gapId: gap.id,
        project: gap.project,
        projectTitle: gap.projectTitle,
        label: `${gap.projectTitle} proof repair`,
        unlockScore,
        linkedOpportunityIds: linkedPackages.map((item) => item.id),
      };
    })
    .filter((item) => item.linkedOpportunityIds.length > 0)
    .sort((left, right) => right.unlockScore - left.unlockScore || left.gapId.localeCompare(right.gapId));
}

function graphEdge(source, target, weight, relation, explanation) {
  return { source, target, weight, relation, explanation };
}

function weaknessRank(level) {
  return { high: 3, medium: 2, low: 1 }[level] || 0;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
}

function caseStudy(slug, { detail = "summary" } = {}) {
  const project = projects.find((item) => item.slug === slug) || projects[0];
  const primaryLink = project.repoUrl || project.liveUrl || "Private or local evidence only";
  const evidence = evidenceForProject(project, claimLedger);
  const projectClaims = claimsForProject(claimLedger, project.slug).map(publicClaim);
  const strongestClaims = projectClaims
    .slice()
    .sort((left, right) => right.confidenceScore - left.confidenceScore)
    .slice(0, 4);
  const proofGaps = projectClaims.filter((claim) => claim.evidenceStrength === "needs-source" || claim.privacyLevel !== "public");
  const fullDetail = String(detail || "summary").toLowerCase() === "full";
  const fullDetailEndpoint = `/api/case-study/${project.slug}?detail=full`;
  const forms = caseStudyForms(project, evidence, strongestClaims, proofGaps);
  const claimPreview = strongestClaims.slice(0, 1);
  const sections = [
    {
      title: "Problem",
      body: project.why,
    },
    {
      title: "Stakes",
      body: `${project.title} matters because the outcome is concrete: ${project.outcome}`,
    },
    {
      title: "Constraints",
      body: `Visibility is ${project.visibility}. This case has ${projectClaims.length} public-safe claims, ${evidence.confidenceScore}/100 average confidence, and ${evidence.evidenceStrength} evidence strength.`,
    },
    {
      title: "Architecture",
      body: `${project.title} uses ${project.stack.slice(0, 5).join(", ")}${
        project.stack.length > 5 ? ", and more" : ""
      }.`,
    },
    {
      title: "Rishabh's contribution",
      body: `The portfolio positions this as proof of ${project.tags.slice(0, 4).join(", ")} through shipped product work, not as a decorative resume bullet.`,
    },
    {
      title: "Proof",
      body: `${project.outcome} ${project.proof[0] || ""}`,
    },
    {
      title: "Evidence trail",
      body: evidence.proofItems.join(" "),
    },
    {
      title: "Source-backed claims",
      body: strongestClaims.map((claim) => `${claim.id}: ${claim.text}`).join(" "),
    },
    {
      title: "Open proof gaps",
      body: proofGaps.length
        ? proofGaps.map((claim) => `${claim.id}: ${claim.suggestedRepair}`).join(" ")
        : "No unsupported project claims detected by the current ledger. Keep receipts fresh.",
    },
    {
      title: "Link or artifact",
      body: primaryLink,
    },
    {
      title: "Website role",
      body:
        project.tier === "Hero"
          ? "Lead with this in the main command center because it combines technical depth and public signal."
          : project.tier === "Archive"
            ? "Keep this in the archive or supporting lane unless it gets a tighter demo and clearer differentiation."
            : "Use this as supporting proof after the hero projects establish the pattern.",
    },
    {
      title: "Best audience",
      body: audienceFor(project),
    },
  ];
  const base = {
    ...project,
    sourceConfidence: {
      confidenceScore: evidence.confidenceScore,
      freshnessScore: evidence.freshnessScore,
      evidenceStrength: evidence.evidenceStrength,
      claimCount: projectClaims.length,
      privateReferenceCount: projectClaims.filter((claim) => claim.privacyLevel !== "public").length,
      needsSourceCount: projectClaims.filter((claim) => claim.evidenceStrength === "needs-source").length,
    },
    sections,
  };
  if (fullDetail) {
    return {
      ...base,
      detail: "full",
      compact: false,
      summaryEndpoint: `/api/case-study/${project.slug}`,
      evidencePacket: evidence,
      forms,
    };
  }
  const sectionPreview = compactCaseStudySections(sections);
  return {
    slug: project.slug,
    title: project.title,
    tier: project.tier,
    score: project.score,
    outcome: truncateText(project.outcome, 96),
    summary: truncateText(project.summary, 96),
    stackCount: project.stack.length,
    proofCount: project.proof.length,
    sourceConfidence: summarizeCaseStudySourceConfidence(base.sourceConfidence),
    sections: sectionPreview,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    evidencePacket: summarizeCaseStudyEvidencePacket(evidence, claimPreview),
    forms: selectCaseStudyFormPreview(forms).map(summarizeCaseStudyForm),
    caseStudyPayloadPolicy: {
      fullDetail: false,
      evidenceClaimsReturned: claimPreview.length,
      formBodiesReturned: 0,
      sectionPreviewLimit: sectionPreview.length,
      sectionsAvailable: sections.length,
      formsReturned: selectCaseStudyFormPreview(forms).length,
    },
  };
}

function compactCaseStudySections(sections) {
  const summaryTitles = new Set(["Evidence trail", "Source-backed claims", "Open proof gaps", "Best audience"]);
  return sections.filter((section) => summaryTitles.has(section.title)).map(summarizeCaseStudySection);
}

function summarizeCaseStudySourceConfidence(sourceConfidence) {
  return {
    confidenceScore: sourceConfidence.confidenceScore,
    evidenceStrength: sourceConfidence.evidenceStrength,
    claimCount: sourceConfidence.claimCount,
  };
}

function summarizeCaseStudyEvidencePacket(evidence, strongestClaims) {
  return {
    slug: evidence.slug,
    linkCount: evidence.links.length,
    proofItemCount: evidence.proofItems.length,
    claimCount: evidence.claims.length,
    claimPreview: strongestClaims.map((claim) => ({
      id: claim.id,
      textPreview: truncateText(claim.text, 42),
      confidenceScore: claim.confidenceScore,
      evidenceStrength: claim.evidenceStrength,
    })),
    confidenceScore: evidence.confidenceScore,
    evidenceStrength: evidence.evidenceStrength,
  };
}

function summarizeCaseStudySection(section) {
  return {
    title: section.title,
    body: truncateText(section.body, 72),
  };
}

function selectCaseStudyFormPreview(forms) {
  const priority = new Set(["summary-30s", "proof-audit"]);
  return forms.filter((form) => priority.has(form.id));
}

function summarizeCaseStudyForm(form) {
  return {
    id: form.id,
    bodyAvailable: Boolean(form.body),
  };
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function caseStudyForms(project, evidence, strongestClaims, proofGaps) {
  const claimLine = strongestClaims.map((claim) => claim.text).join(" ");
  const gapLine = proofGaps.length
    ? proofGaps.map((claim) => claim.suggestedRepair).join(" ")
    : "No unsupported project claims detected by the current ledger.";
  return [
    {
      id: "summary-30s",
      title: "30-second summary",
      body: `${project.title}: ${project.summary} ${project.outcome}`,
    },
    {
      id: "recruiter-90s",
      title: "90-second recruiter brief",
      body: `${project.title} is ${project.kind}. Lead with ${project.outcome} Evidence confidence is ${evidence.confidenceScore}/100 across ${evidence.claims.length} claims.`,
    },
    {
      id: "technical-deep-dive",
      title: "Technical deep dive",
      body: `${project.title} uses ${project.stack.join(", ")}. The strongest source-backed claims are: ${claimLine}`,
    },
    {
      id: "proof-audit",
      title: "Proof-only audit",
      body: `${evidence.evidenceStrength}; ${evidence.links.length} public link(s); ${evidence.proofItems.length} proof note(s); ${evidence.claims.length} claims.`,
    },
    {
      id: "weaknesses",
      title: "What is still weak",
      body: gapLine,
    },
  ];
}

function audienceFor(project) {
  const text = `${project.kind} ${project.tags.join(" ")}`.toLowerCase();
  if (/agent|browser|qa|pr|sandbox|automation/.test(text)) return "Recruiters and engineering teams evaluating agent infrastructure or developer tools.";
  if (/civic|mesh|first responder|mobile|community/.test(text)) return "Public-interest software teams, civic technologists, and mobile engineers.";
  if (/hardware|research|assistive|paper|bluetooth/.test(text)) return "Research mentors, hardware teams, accessibility groups, and applied science reviewers.";
  if (/market|finance|real estate|shopping/.test(text)) return "Product teams looking for market mechanics, ranking systems, and real-time data work.";
  return "Recruiters, collaborators, and technical reviewers who want a fast proof path.";
}

function currentTrustSummary() {
  return trustSummary({ claims: claimLedger, projects, domains, internalChecks, liveDemoChecks });
}

function buildClaimLedgerResponse({ claims, detail, generatedAt = new Date().toISOString() }) {
  const compact = detail !== "full";
  const previewLimit = 4;
  const projectSummaryPreviewLimit = 4;
  const previewClaims = compact ? compactClaimPreview(claims, previewLimit) : claims;
  const projectClaimSummary = compact ? summarizeClaimsByProject(claims).slice(0, projectSummaryPreviewLimit) : undefined;
  const statusSummary = compact ? summarizeClaimsByStatus(claims) : undefined;
  return {
    ...(compact ? {} : { generatedAt }),
    mode: "public-claim-ledger",
    detail: compact ? "index" : "full",
    compact,
    ...(compact
      ? { sourceBoundaryAvailable: undefined }
      : {
          sourceBoundary:
            "Claims are public-safe projections from the local evidence ledger. Compact rows keep first-screen payloads small; full claim rows remain available through detail endpoints and detail=full.",
        }),
    summary: compact
      ? {
          totalClaims: currentTrustSummary().counts.totalClaims,
          returned: previewClaims.length,
          previewLimit,
          projectSummaryPreviewLimit,
          totalProjects: projects.length,
          unassignedClaims: claims.filter((claim) => !claim.relatedProject).length,
        }
      : {
          ...currentTrustSummary().counts,
          returned: previewClaims.length,
          indexedClaims: claims.length,
          totalAvailable: publicClaimLedger.length,
          previewLimit: claims.length,
          unassignedClaims: 0,
        },
    claimFields: compact
      ? undefined
      : [
          "id",
          "text",
          "claimType",
          "evidenceStrength",
          "privacyLevel",
          "freshnessScore",
          "confidenceScore",
          "publicVisibility",
          "relatedProject",
          "relatedTimePeriod",
          "verificationMethod",
          "verificationResult",
          "contradictionStatus",
          "expirationPolicy",
          "suggestedRepair",
          "sourceMaterial",
        ],
    detailEndpointTemplate: compact ? undefined : "/api/claims/:id",
    fullCatalogEndpoint: "/api/claims?detail=full",
    claimPayloadPolicy: compact
      ? {
          fullDetail: false,
          previewLimit,
          projectSummaryPreviewLimit,
        }
      : {
          fullDetail: true,
          fullCatalogEndpoint: "/api/claims?detail=full",
          indexedClaims: claims.length,
          defaultRows: "full claim catalog",
        },
    ...(compact ? { projectClaimSummary, statusSummary } : {}),
    claims: previewClaims,
  };
}

function compactClaim(claim) {
  return {
    id: claim.id,
    claimType: claim.claimType,
    evidenceStrength: claim.evidenceStrength,
    relatedProject: claim.relatedProject,
    detailEndpoint: `/api/claims/${encodeURIComponent(claim.id)}`,
  };
}

function compactClaimPreview(claims, limit) {
  return claims
    .slice()
    .sort((left, right) => claimStrengthRank(right.evidenceStrength) - claimStrengthRank(left.evidenceStrength) || right.confidenceScore - left.confidenceScore)
    .slice(0, limit)
    .map(compactClaim);
}

function summarizeClaimsByProject(claims) {
  const grouped = new Map(projects.map((project) => [project.slug, []]));
  claims.forEach((claim) => {
    if (grouped.has(claim.relatedProject)) grouped.get(claim.relatedProject).push(claim);
  });
  return projects.map((project) => {
    const projectClaims = grouped.get(project.slug) || [];
    return {
      slug: project.slug,
      claims: projectClaims.length,
      strongestEvidence: strongestClaimStrength(projectClaims),
    };
  });
}

function summarizeClaimsByStatus(claims) {
  return ["link-backed", "source-backed", "needs-source"].map((status) => ({
    status,
    claims: claims.filter((claim) => claim.evidenceStrength === status).length,
  }));
}

function strongestClaimStrength(claims) {
  const strengths = claims.map((claim) => claim.evidenceStrength);
  if (strengths.includes("link-backed")) return "link-backed";
  if (strengths.includes("source-backed")) return "source-backed";
  return "needs-source";
}

function claimStrengthRank(strength) {
  if (strength === "link-backed") return 3;
  if (strength === "source-backed") return 2;
  return 1;
}

function averageClaimScore(claims) {
  if (!claims.length) return 0;
  return Math.round(claims.reduce((sum, claim) => sum + claim.confidenceScore, 0) / claims.length);
}

function currentOpportunityRadar() {
  if (!opportunityRadarCache) {
    opportunityRadarCache = buildOpportunityRadar({ projects, claims: claimLedger });
  }
  return opportunityRadarCache;
}

function currentOpportunityPackages() {
  if (!opportunityPackagesCache) {
    opportunityPackagesCache = buildOpportunityPackages({
      opportunities: currentOpportunityRadar(),
      packets: currentAudiencePackets(),
      artifactCatalog: currentArtifactCatalog(),
      weaknessMap: currentProjectWeaknessMap(),
      maintenance: currentMaintenanceReport(),
      proofTrials: currentProofTrials(),
      claims: publicClaimLedger,
    });
  }
  return opportunityPackagesCache;
}

function currentOpportunityPackage(value) {
  return selectOpportunityPackage(value, currentOpportunityPackages());
}

function currentOpportunityBoard({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedBoard = buildOpportunityBoardFromReceipt(readOpportunityBoardReceipts(root)[0]);
    if (cachedBoard) return cachedBoard;
  }
  return buildOpportunityBoard({
    opportunities: currentOpportunityRadar(),
    packages: currentOpportunityPackages(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    packets: currentAudiencePackets(),
    artifactCatalog: currentArtifactCatalog(),
    weaknessMap: currentProjectWeaknessMap(),
    maintenance: currentMaintenanceReport(),
    proofTrials: currentProofTrials(),
    claims: claimLedger.map(publicClaim),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    receipts: readOpportunityBoardReceipts(root),
  });
}

function currentOpportunityDeRiskingReport(req = { headers: { host: `localhost:${port}` } }, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildOpportunityDeRiskingReportFromReceipt(readLatestOpportunityDeRiskingReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestOpportunityDeRiskingReceipt(root);
  return buildOpportunityDeRiskingReport({
    opportunities: currentOpportunityRadar(),
    packages: currentOpportunityPackages(),
    board: currentOpportunityBoard(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    artifactGapWorkbench: currentArtifactGapWorkbench(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentOpportunityDeRisking(value, req, { preferReceipt = false } = {}) {
  return selectOpportunityDeRisking(value, currentOpportunityDeRiskingReport(req, { preferReceipt }));
}

function currentOpportunityRankingReport({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildOpportunityRankingReportFromReceipt(readLatestOpportunityRankingReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestOpportunityRankingReceipt(root);
  return buildOpportunityRankingReport({
    opportunities: currentOpportunityRadar(),
    packages: currentOpportunityPackages(),
    board: currentOpportunityBoard(),
    deRisking: currentOpportunityDeRiskingReport(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentOpportunityRanking(value, options) {
  return selectOpportunityRanking(value, currentOpportunityRankingReport(options));
}

function currentOpportunityScorecardReport({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildOpportunityScorecardReportFromReceipt(readOpportunityScorecardReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildOpportunityScorecardReport({
    opportunities: currentOpportunityRadar(),
    packages: currentOpportunityPackages(),
    board: currentOpportunityBoard(),
    deRisking: currentOpportunityDeRiskingReport(),
    ranking: currentOpportunityRankingReport(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readOpportunityScorecardReceipts(root),
  });
}

function currentOpportunityScorecard(value, options) {
  return selectOpportunityScorecard(value, currentOpportunityScorecardReport(options));
}

function currentArtifactCatalog() {
  if (!artifactCatalogCache) {
    artifactCatalogCache = buildArtifactCatalog({ projects, claims: publicClaimLedger });
  }
  return artifactCatalogCache;
}

function currentArtifactCollections() {
  if (!artifactCollectionsCache) {
    artifactCollectionsCache = buildArtifactCollections({
      artifactCatalog: currentArtifactCatalog(),
      projects,
      claims: publicClaimLedger,
    });
  }
  return artifactCollectionsCache;
}

function currentArtifactCollection(value) {
  return selectArtifactCollection(value, currentArtifactCollections());
}

function currentArtifactTranscripts() {
  return buildArtifactTranscriptLibrary({
    projects,
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
  });
}

function currentArtifactTranscript(value) {
  return selectArtifactTranscript(value, currentArtifactTranscripts());
}

function currentArtifactMuseumAudit() {
  return buildArtifactMuseumAudit({
    artifactCatalog: currentArtifactCatalog(),
    collections: currentArtifactCollections(),
    transcripts: currentArtifactTranscripts(),
    comparisons: [
      currentArtifactComparison("qagent", "flowpr"),
      currentArtifactComparison("anchormesh", "qagent"),
      currentArtifactComparison("fairvalue", "smartcane"),
    ],
    projects,
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readArtifactMuseumReceipts(root),
  });
}

function currentArtifactReplays() {
  return buildArtifactReplayCatalog({
    projects,
    artifactCatalog: currentArtifactCatalog(),
    transcripts: currentArtifactTranscripts(),
    museum: currentArtifactMuseumAudit(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
  });
}

function currentArtifactReplayIndex(options = {}) {
  return buildArtifactReplayIndex(currentArtifactReplays(), options);
}

function currentArtifactReplay(value) {
  return selectArtifactReplay(value, currentArtifactReplays());
}

function currentArtifactGapWorkbench(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildArtifactGapWorkbenchFromReceipt(readArtifactGapReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildArtifactGapWorkbench({
    artifactCatalog: currentArtifactCatalog(),
    artifactReplays: currentArtifactReplays(),
    narrativeTailor: currentNarrativeTailorReport(req),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readArtifactGapReceipts(root),
  });
}

function currentArtifactGapProofRepairQueue(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildArtifactGapProofRepairQueueFromReceipt(readArtifactGapRepairReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildArtifactGapProofRepairQueue({
    gapWorkbench: currentArtifactGapWorkbench(req),
    opportunityPackages: currentOpportunityPackages(),
    deRisking: currentOpportunityDeRiskingReport(),
    narrativeTailor: currentNarrativeTailorReport(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readArtifactGapRepairReceipts(root),
  });
}

function currentArtifactMuseumComparisonReport() {
  if (!artifactMuseumComparisonCache) {
    artifactMuseumComparisonCache = buildArtifactMuseumComparisonAudit({
      artifactCatalog: currentArtifactCatalog(),
      collections: currentArtifactCollections(),
      transcripts: currentArtifactTranscripts(),
      museum: currentArtifactMuseumAudit(),
      replays: currentArtifactReplays(),
      routeManifest: runtimeRouteManifest(),
      refreshPlan: evidenceRefreshPlan(),
      packageManifest,
      receipts: readArtifactMuseumComparisonReceipts(root),
    });
  }
  return artifactMuseumComparisonCache;
}

function currentArtifactMuseumComparisonPair(leftId, rightId) {
  return selectArtifactMuseumComparisonPair(leftId, rightId, currentArtifactMuseumComparisonReport());
}

function currentIntentPaths() {
  if (!intentPathsCache) {
    const catalog = buildIntentPaths({
      projects,
      claims: publicClaimLedger,
      artifactCatalog: currentArtifactCatalog(),
      opportunities: currentOpportunityRadar(),
    });
    intentPathsCache = {
      mode: catalog.mode,
      sourceBoundary: catalog.sourceBoundary,
      paths: catalog.paths,
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    ...intentPathsCache,
  };
}

function currentMaintenanceReport() {
  return buildMaintenanceReport({
    projects,
    claims: claimLedger.map(publicClaim),
    trust: currentTrustSummary(),
    artifactCatalog: currentArtifactCatalog(),
    statusReceipts: readStatusReceipts(),
  });
}

function currentProofTrials() {
  return buildProofTrials({
    projects,
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readProofTrialReceipts(root),
  });
}

function currentProofTrialsIndex() {
  return buildProofTrialsIndex(currentProofTrials());
}

function currentProofTrial(slug) {
  return runProofTrial({
    slug,
    projects,
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
  });
}

function currentAudiencePackets() {
  return buildAudiencePackets({
    projects,
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    intentPaths: currentIntentPaths(),
    opportunities: currentOpportunityRadar(),
    trust: currentTrustSummary(),
  });
}

function currentAudiencePacket(value) {
  return selectAudiencePacket(value, currentAudiencePackets());
}

function currentNarrativeGroundingReport() {
  return buildNarrativeGroundingReport({
    packets: currentAudiencePackets(),
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    opportunities: currentOpportunityRadar(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readNarrativeGroundingReceipts(root),
  });
}

function currentGroundedNarrative(value) {
  return selectGroundedNarrative(value, currentNarrativeGroundingReport());
}

function currentNarrativeContrastReport() {
  return buildNarrativeContrastReport({
    narratives: currentNarrativeGroundingReport(),
    packets: currentAudiencePackets(),
    opportunities: currentOpportunityRadar(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readNarrativeContrastReceipts(root),
  });
}

function currentNarrativeContrast(value) {
  return selectNarrativeContrast(value, currentNarrativeContrastReport());
}

function currentNarrativeObjectionReport({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildNarrativeObjectionReportFromReceipt(readNarrativeObjectionReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildNarrativeObjectionReport({
    narratives: currentNarrativeGroundingReport(),
    packets: currentAudiencePackets(),
    weaknessMap: currentProjectWeaknessMap(),
    maintenance: currentMaintenanceReport(),
    contradictions: currentContradictions(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    receipts: readNarrativeObjectionReceipts(root),
  });
}

function currentNarrativeObjections(value, { preferReceipt = false } = {}) {
  return selectNarrativeObjections(value, currentNarrativeObjectionReport({ preferReceipt }));
}

function currentNarrativeTailorReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildNarrativeTailorReportFromReceipt(readNarrativeTailorReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildNarrativeTailorReport({
    narratives: currentNarrativeGroundingReport(),
    contrastReport: currentNarrativeContrastReport(),
    objectionReport: currentNarrativeObjectionReport(),
    packets: currentAudiencePackets(),
    opportunityBoard: currentOpportunityBoard(),
    researchStress: currentResearchEvaluationStressReport(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readNarrativeTailorReceipts(root),
  });
}

function currentNarrativeTailorGraphReport() {
  return buildNarrativeTailorReport({
    narratives: currentNarrativeGroundingReport(),
    contrastReport: currentNarrativeContrastReport(),
    objectionReport: currentNarrativeObjectionReport(),
    packets: currentAudiencePackets(),
    opportunityBoard: currentOpportunityBoard(),
    researchStress: currentGraphTailorStressProxy(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readNarrativeTailorReceipts(root),
  });
}

function currentGraphTailorStressProxy() {
  return {
    summary: {
      score: 70,
      source: "non-recursive-graph-projection-proxy",
    },
  };
}

function currentNarrativeTailoring(value, req, { preferReceipt = false } = {}) {
  return selectNarrativeTailoring(value, currentNarrativeTailorReport(req, { preferReceipt }));
}

function currentNarrativeDisclosureReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildNarrativeDisclosureReportFromReceipt(readNarrativeDisclosureReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildNarrativeDisclosureReport({
    narratives: currentNarrativeGroundingReport(),
    objectionReport: currentNarrativeObjectionReport(),
    tailorReport: currentNarrativeTailorReport(req),
    packets: currentAudiencePackets(),
    proofQuality: currentProofQualityEvaluation(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readNarrativeDisclosureReceipts(root),
  });
}

function currentNarrativeDisclosure(value, req, { preferReceipt = false } = {}) {
  return selectNarrativeDisclosure(value, currentNarrativeDisclosureReport(req, { preferReceipt }));
}

function currentNarrativeSequenceReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildNarrativeSequenceReportFromReceipt(readNarrativeSequenceReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildNarrativeSequenceReport({
    narratives: currentNarrativeGroundingReport(),
    contrastReport: currentNarrativeContrastReport(),
    objectionReport: currentNarrativeObjectionReport(),
    tailorReport: currentNarrativeTailorReport(req),
    disclosureReport: currentNarrativeDisclosureReport(req),
    packets: currentAudiencePackets(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readNarrativeSequenceReceipts(root),
  });
}

function currentNarrativeSequence(value, req, options) {
  return selectNarrativeSequence(value, currentNarrativeSequenceReport(req, options));
}

function currentSelfReviewReports({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildSelfReviewReportsFromReceipt(readLatestSelfReviewReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestSelfReviewReceipt(root);
  const reviewReq = { headers: { host: `localhost:${port}` } };
  return buildSelfReviewReports({
    projects,
    claims: claimLedger.map(publicClaim),
    trust: currentTrustSummary(),
    opportunities: currentOpportunityRadar(),
    maintenance: currentMaintenanceReport(),
    artifactCatalog: currentArtifactCatalog(),
    packets: currentAudiencePackets(),
    proofTrials: currentProofTrials(),
    artifactGapRepair: currentArtifactGapProofRepairQueue(reviewReq),
    graphLineage: currentGraphLineageReport(),
    receipts: {
      statusReceipts: readStatusReceipts(),
      evidenceRefreshReceipts: readEvidenceRefreshReceipts(root),
      accessibilityReports: readAccessibilityAuditReports(root),
      performanceReports: readPerformanceBudgetReports(root),
      visualReports: readVisualRegressionReports(root),
      selfReviewReceipts: latestReceipt ? [latestReceipt] : [],
    },
  });
}

function currentSelfReviewReport(value, options) {
  return selectSelfReviewReport(value, currentSelfReviewReports(options));
}

function currentPrivateNextActionPlan({ ensureStore = false } = {}) {
  return buildPrivateNextActionPlan({
    projects,
    claims: claimLedger.map(publicClaim),
    maintenance: currentMaintenanceReport(),
    opportunities: currentOpportunityRadar(),
    packets: currentAudiencePackets(),
    selfReviews: currentSelfReviewReports(),
    artifactCatalog: currentArtifactCatalog(),
    proofTrials: currentProofTrials(),
    privacyApprovalAudit: currentPrivacyApprovalAudit({ ensureStore }),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readPrivateNextActionReceipts(root),
  });
}

function currentOutreachDraftCatalog({ ensureStore = false } = {}) {
  const storeInfo = ensureStore ? ensureOutreachDraftStore(root) : readOutreachDraftStore(root);
  return buildOutreachDraftCatalog({
    opportunities: currentOpportunityRadar(),
    packets: currentAudiencePackets(),
    projects,
    claims: claimLedger.map(publicClaim),
    storeInfo,
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readOutreachDraftReceipts(root),
  });
}

function currentPrivateTaskTracker({ ensureStore = false } = {}) {
  const nextActionPlan = currentPrivateNextActionPlan({ ensureStore });
  const storeInfo = ensureStore ? ensurePrivateTaskStore(root) : readPrivateTaskStore(root);
  return buildPrivateTaskTracker({ nextActionPlan, storeInfo, receipts: readPrivateTaskReceipts(root) });
}

function currentPrivateReviewSessions({ ensureStore = false } = {}) {
  return buildPrivateReviewSessions({
    nextActionPlan: currentPrivateNextActionPlan({ ensureStore }),
    taskTracker: currentPrivateTaskTracker({ ensureStore }),
    outreachDrafts: currentOutreachDraftCatalog({ ensureStore }),
    privacyApprovalAudit: currentPrivacyApprovalAudit({ ensureStore }),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readPrivateReviewSessionReceipts(root),
  });
}

function currentPrivateBriefingDrafts({ ensureStore = false } = {}) {
  return buildPrivateBriefingDrafts({
    nextActionPlan: currentPrivateNextActionPlan({ ensureStore }),
    taskTracker: currentPrivateTaskTracker({ ensureStore }),
    reviewSessions: currentPrivateReviewSessions({ ensureStore }),
    outreachDrafts: currentOutreachDraftCatalog({ ensureStore }),
    opportunityPackages: currentOpportunityPackages(),
    selfReviews: currentSelfReviewReports(),
    graphScoreboard: currentGraphScoreboard(),
    artifactTranscripts: currentArtifactTranscripts(),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readPrivateBriefingDraftReceipts(root),
  });
}

function currentPrivateBriefingDraft(value, options) {
  return selectPrivateBriefingDraft(value, currentPrivateBriefingDrafts(options));
}

function currentPrivateChiefOfStaffReadiness({ ensureStore = false } = {}) {
  return buildPrivateChiefOfStaffReadiness({
    cockpit: buildPrivateCockpit({ projects, claims: claimLedger, trust: currentTrustSummary() }),
    nextActionPlan: currentPrivateNextActionPlan({ ensureStore }),
    taskTracker: currentPrivateTaskTracker({ ensureStore }),
    reviewSessions: currentPrivateReviewSessions({ ensureStore }),
    briefingDrafts: currentPrivateBriefingDrafts({ ensureStore }),
    privacyApprovalAudit: currentPrivacyApprovalAudit({ ensureStore }),
    outreachDrafts: currentOutreachDraftCatalog({ ensureStore }),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readPrivateChiefOfStaffReceipts(root),
  });
}

function currentPrivateSchedule({ ensureStore = false } = {}) {
  return buildPrivateSchedule({
    chiefReadiness: currentPrivateChiefOfStaffReadiness({ ensureStore }),
    nextActionPlan: currentPrivateNextActionPlan({ ensureStore }),
    taskTracker: currentPrivateTaskTracker({ ensureStore }),
    reviewSessions: currentPrivateReviewSessions({ ensureStore }),
    briefingDrafts: currentPrivateBriefingDrafts({ ensureStore }),
    privacyApprovalAudit: currentPrivacyApprovalAudit({ ensureStore }),
    outreachDrafts: currentOutreachDraftCatalog({ ensureStore }),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readPrivateScheduleReceipts(root),
  });
}

function currentPrivatePrioritizationReport({ ensureStore = false } = {}) {
  return buildPrivatePrioritizationReport({
    chiefReadiness: currentPrivateChiefOfStaffReadiness({ ensureStore }),
    nextActionPlan: currentPrivateNextActionPlan({ ensureStore }),
    taskTracker: currentPrivateTaskTracker({ ensureStore }),
    schedule: currentPrivateSchedule({ ensureStore }),
    reviewSessions: currentPrivateReviewSessions({ ensureStore }),
    briefingDrafts: currentPrivateBriefingDrafts({ ensureStore }),
    privacyApprovalAudit: currentPrivacyApprovalAudit({ ensureStore }),
    outreachDrafts: currentOutreachDraftCatalog({ ensureStore }),
    artifactGapRepair: currentArtifactGapProofRepairQueue({ headers: { host: `localhost:${port}` } }),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readPrivatePrioritizationReceipts(root),
  });
}

function currentPrivateChiefDrafts({ ensureStore = false } = {}) {
  return buildPrivateChiefDraftsReport({
    chiefReadiness: currentPrivateChiefOfStaffReadiness({ ensureStore }),
    schedule: currentPrivateSchedule({ ensureStore }),
    priorities: currentPrivatePrioritizationReport({ ensureStore }),
    briefingDrafts: currentPrivateBriefingDrafts({ ensureStore }),
    reviewSessions: currentPrivateReviewSessions({ ensureStore }),
    privacyApprovalAudit: currentPrivacyApprovalAudit({ ensureStore }),
    outreachDrafts: currentOutreachDraftCatalog({ ensureStore }),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readPrivateChiefDraftsReceipts(root),
  });
}

function currentPrivateChiefDraft(value, options) {
  return selectPrivateChiefDraft(value, currentPrivateChiefDrafts(options));
}

function currentPrivateCockpit({ ensureStore = false } = {}) {
  const embeddedReports = {
    privacyApprovalAudit: currentPrivacyApprovalAudit({ ensureStore }),
    nextActionPlan: currentPrivateNextActionPlan({ ensureStore }),
    taskTracker: currentPrivateTaskTracker({ ensureStore }),
    outreachDrafts: currentOutreachDraftCatalog({ ensureStore }),
    reviewSessions: currentPrivateReviewSessions({ ensureStore }),
    briefingDrafts: currentPrivateBriefingDrafts({ ensureStore }),
    schedule: currentPrivateSchedule({ ensureStore }),
    priorities: currentPrivatePrioritizationReport({ ensureStore }),
    chiefDrafts: currentPrivateChiefDrafts({ ensureStore }),
    opportunityPackages: currentOpportunityPackages(),
  };
  return {
    ...buildPrivateCockpit({
      projects,
      claims: claimLedger,
      trust: currentTrustSummary(),
      embeddedReports,
      routeManifest: runtimeRouteManifest(),
      packageManifest,
      receipts: readPrivateCockpitReceipts(root),
    }),
    ...embeddedReports,
  };
}

function currentProjectWeaknessMap() {
  return buildProjectWeaknessMap({
    projects,
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    maintenance: currentMaintenanceReport(),
    proofTrials: currentProofTrials(),
  });
}

function currentProjectWeakness(slug) {
  return selectProjectWeakness(slug, currentProjectWeaknessMap());
}

function currentSkillGapMap() {
  if (skillGapMapCache) return skillGapMapCache;
  skillGapMapCache = buildSkillGapMap({
    projects,
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
  });
  return skillGapMapCache;
}

function currentSkill(value) {
  return selectSkill(value, currentSkillGapMap());
}

function currentContradictions() {
  return detectContradictions({
    projects,
    claims: claimLedger.map(publicClaim),
  });
}

function currentChangeSnapshot() {
  return buildCurrentChangeSnapshot({
    projects,
    trust: currentTrustSummary(),
    artifactCatalog: currentArtifactCatalog(),
    opportunities: currentOpportunityRadar(),
    packets: currentAudiencePackets(),
    weaknessMap: currentProjectWeaknessMap(),
    skillGaps: currentSkillGapMap(),
    contradictions: currentContradictions(),
    artifactGapRepair: currentArtifactGapProofRepairQueue({ headers: { host: `localhost:${port}` } }),
    graphLineage: currentGraphLineageReport(),
  });
}

function currentChangeHistoryReport({ preferSnapshot = false } = {}) {
  if (preferSnapshot) {
    const cachedReport = buildChangeHistoryReportFromSnapshots(readChangeHistory(root));
    if (cachedReport) return cachedReport;
  }
  return buildChangeHistoryReport({
    currentSnapshot: currentChangeSnapshot(),
    history: readChangeHistory(root),
  });
}

function currentTrustBlockadeReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildTrustBlockadeReportFromReceipt(readTrustBlockadeReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  const trustBlockadeReq = req || { headers: { host: `localhost:${port}` } };
  return buildTrustBlockadeReport({
    claims: claimLedger.map(publicClaim),
    trust: currentTrustSummary(),
    artifactCatalog: currentArtifactCatalog(),
    artifactGapRepair: currentArtifactGapProofRepairQueue(trustBlockadeReq),
    graphLineage: currentGraphLineageReport(),
    opportunityBoard: currentOpportunityBoard(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    runtimeEvidenceChain: currentRuntimeEvidenceChainReport(trustBlockadeReq),
    selfReview: currentSelfReviewReports(),
    changeHistory: currentChangeHistoryReport(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readTrustBlockadeReceipts(root),
  });
}

function currentWaveBacklog() {
  return buildWaveBacklog();
}

function currentWaveBacklogIndex() {
  return buildWaveBacklogIndex(currentWaveBacklog());
}

function currentGraphQualityReport({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildGraphQualityReportFromReceipt(readLatestGraphQualityReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestGraphQualityReceipt(root);
  return buildGraphQualityReport({
    graph: graphPayload(),
    projects,
    claims: claimLedger.map(publicClaim),
    opportunities: currentOpportunityRadar(),
    artifactCatalog: currentArtifactCatalog(),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentGraphCrosslinkReport({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildGraphCrosslinkReportFromReceipt(readLatestGraphCrosslinkReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestGraphCrosslinkReceipt(root);
  return buildGraphCrosslinkReport({
    projects,
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    opportunities: currentOpportunityRadar(),
    narratives: currentNarrativeGroundingReport(),
    narrativeObjections: currentNarrativeObjectionReport(),
    packets: currentAudiencePackets(),
    maintenance: currentMaintenanceReport(),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentGraphScoreboard({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildGraphScoreboardFromReceipt(readLatestGraphScoreboardReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestGraphScoreboardReceipt(root);
  return buildGraphScoreboard({
    graph: graphPayload(),
    graphQuality: currentGraphQualityReport(),
    graphCrosslinks: currentGraphCrosslinkReport(),
    projects,
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    opportunities: currentOpportunityRadar(),
    maintenance: currentMaintenanceReport(),
    weaknessMap: currentProjectWeaknessMap(),
    skillGapMap: currentSkillGapMap(),
    contradictions: currentContradictions(),
    narratives: currentNarrativeGroundingReport(),
    narrativeObjections: currentNarrativeObjectionReport(),
    packets: currentAudiencePackets(),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentGraphLineageReport({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildGraphLineageReportFromReceipt(readLatestGraphLineageReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestGraphLineageReceipt(root);
  return buildGraphLineageReport({
    graph: graphPayload(),
    graphCrosslinks: currentGraphCrosslinkReport(),
    narratives: currentNarrativeGroundingReport(),
    narrativeObjections: currentNarrativeObjectionReport(),
    packets: currentAudiencePackets(),
    projects,
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentGraphProjectionGuardReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildGraphProjectionGuardReportFromReceipt(readLatestGraphProjectionGuardReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestGraphProjectionGuardReceipt(root);
  return buildGraphProjectionGuardReport({
    graph: graphPayload(),
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    narrativeTailor: currentNarrativeTailorReport(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentGraphDisclosureLinksReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildGraphDisclosureLinksReportFromReceipt(readLatestGraphDisclosureLinksReceipt(root));
    if (cachedReport) return cachedReport;
  }
  return buildGraphDisclosureLinksReport({
    disclosureReport: currentNarrativeDisclosureReport(req),
    narratives: currentNarrativeGroundingReport(),
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readGraphDisclosureLinksReceipts(root),
  });
}

function currentGraphConfidenceReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildGraphConfidenceReportFromReceipt(readLatestGraphConfidenceReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestGraphConfidenceReceipt(root);
  return buildGraphConfidenceReport({
    graphCrosslinks: currentGraphCrosslinkReport(),
    graphDisclosureLinks: currentGraphDisclosureLinksReport(req),
    graphProjectionGuard: currentGraphProjectionGuardReport(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentGraphDepthScoreReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildGraphDepthScoreReportFromReceipt(readGraphDepthScoreReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildGraphDepthScoreReport({
    graphQuality: currentGraphQualityReport(),
    graphScoreboard: currentGraphScoreboard(),
    graphLineage: currentGraphLineageReport(),
    graphDisclosureLinks: currentGraphDisclosureLinksReport(req),
    graphConfidence: currentGraphConfidenceReport(req),
    narrativeTailor: currentNarrativeTailorReport(req),
    narrativeSequence: currentNarrativeSequenceReport(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readGraphDepthScoreReceipts(root),
  });
}

function currentProofQualityEvaluation({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildProofQualityEvaluationFromReceipt(readLatestProofQualityReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestProofQualityReceipt(root);
  return buildProofQualityEvaluation({
    projects,
    claims: publicClaimLedger,
    trust: currentTrustSummary(),
    artifactCatalog: currentArtifactCatalog(),
    maintenance: currentMaintenanceReport(),
    proofTrials: currentProofTrials(),
    contradictions: currentContradictions(),
    graphQuality: currentGraphQualityReport(),
    opportunities: currentOpportunityRadar(),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentSearchQualityEvaluation({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildSearchQualityEvaluationFromReceipt(readLatestSearchQualityReceipt(root));
    if (cachedReport) return cachedReport;
  }
  return buildSearchQualityEvaluation({
    benchmarkInputs: searchQualityBenchmarks().map((benchmark) => ({
      ...benchmark,
      results: rankProjects(benchmark.query, 5),
    })),
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    opportunities: currentOpportunityRadar(),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readSearchQualityReceipts(root),
  });
}

function currentClaimCalibrationReport({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildClaimCalibrationReportFromReceipt(readLatestClaimCalibrationReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestClaimCalibrationReceipt(root);
  return buildClaimCalibrationReport({
    claims: claimLedger.map(publicClaim),
    projects,
    trust: currentTrustSummary(),
    proofQuality: currentProofQualityEvaluation(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentOpportunityQualityEvaluation({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedEvaluation = buildOpportunityQualityEvaluationFromReceipt(readLatestOpportunityQualityReceipt(root));
    if (cachedEvaluation) return cachedEvaluation;
  }
  return buildOpportunityQualityEvaluation({
    opportunities: currentOpportunityRadar(),
    packages: currentOpportunityPackages(),
    packets: currentAudiencePackets(),
    artifactCatalog: currentArtifactCatalog(),
    weaknessMap: currentProjectWeaknessMap(),
    maintenance: currentMaintenanceReport(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readOpportunityQualityReceipts(root),
  });
}

function currentUsabilityQualityEvaluation({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildUsabilityQualityEvaluationFromReceipt(readLatestUsabilityQualityReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestUsabilityQualityReceipt(root);
  return buildUsabilityQualityEvaluation({
    trust: currentTrustSummary(),
    graphScoreboard: currentGraphScoreboard(),
    runtimeSurface: currentRuntimeSurfaceLatest(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    proofQuality: currentProofQualityEvaluation(),
    searchQuality: currentSearchQualityEvaluation(),
    accessibilityReports: readAccessibilityAuditReports(root),
    performanceReports: readPerformanceBudgetReports(root),
    visualReports: readVisualRegressionReports(root),
    refreshPlan: evidenceRefreshPlan(),
    routeManifest: runtimeRouteManifest(),
    sourceSignals: commandCenterSourceSignals(),
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentDesignStabilityReport({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildDesignStabilityReportFromReceipt(readLatestDesignStabilityReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestDesignStabilityReceipt(root);
  return buildDesignStabilityReport({
    usabilityQuality: currentUsabilityQualityEvaluation(),
    runtimeSurface: currentRuntimeSurfaceLatest(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    sourceSignals: commandCenterDesignSourceSignals(),
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentKeyboardReadinessReport({ preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildKeyboardReadinessReportFromReceipt(readKeyboardReadinessReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildKeyboardReadinessReport({
    designStability: currentDesignStabilityReport(),
    usabilityQuality: currentUsabilityQualityEvaluation(),
    runtimeSurface: currentRuntimeSurfaceLatest(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    sourceSignals: commandCenterKeyboardSourceSignals(),
    receipts: readKeyboardReadinessReceipts(root),
  });
}

function currentDesignAmbitionReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildDesignAmbitionReportFromReceipt(readLatestDesignAmbitionReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestDesignAmbitionReceipt(root);
  return buildDesignAmbitionReport({
    designStability: currentDesignStabilityReport(),
    keyboardReadiness: currentKeyboardReadinessReport(),
    usabilityQuality: currentUsabilityQualityEvaluation(),
    runtimeEvidenceChain: currentRuntimeEvidenceChainReport(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    sourceSignals: commandCenterKeyboardSourceSignals(),
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentResearchEvaluationStressReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildResearchEvaluationStressReportFromReceipt(readResearchEvaluationStressReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildResearchEvaluationStressReport({
    proofQuality: currentProofQualityEvaluation(),
    searchQuality: currentSearchQualityEvaluation(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    usabilityQuality: currentUsabilityQualityEvaluation(),
    designStability: currentDesignStabilityReport(),
    keyboardReadiness: currentKeyboardReadinessReport(),
    designAmbition: currentDesignAmbitionReport(req),
    graphScoreboard: currentGraphScoreboard(),
    runtimeReconciliation: currentRuntimeReconciliationReport(req),
    opportunityBoard: currentOpportunityBoard(),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readResearchEvaluationStressReceipts(root),
  });
}

function currentEvaluationIntegrityReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildEvaluationIntegrityReportFromReceipt(readEvaluationIntegrityReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildEvaluationIntegrityReport({
    proofQuality: currentProofQualityEvaluation(),
    searchQuality: currentSearchQualityEvaluation(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    usabilityQuality: currentUsabilityQualityEvaluation(),
    designStability: currentDesignStabilityReport(),
    researchStress: currentResearchEvaluationStressReport(req),
    runtimeReconciliation: currentRuntimeReconciliationReport(req),
    accessibilityReports: readAccessibilityAuditReports(root),
    performanceReports: readPerformanceBudgetReports(root),
    visualReports: readVisualRegressionReports(root),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readEvaluationIntegrityReceipts(root),
  });
}

function currentResearchRigorReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildResearchRigorReportFromReceipt(readLatestResearchRigorReceipt(root));
    if (cachedReport) return cachedReport;
  }
  return buildResearchRigorReport({
    proofQuality: currentProofQualityEvaluation(),
    searchQuality: currentSearchQualityEvaluation(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    usabilityQuality: currentUsabilityQualityEvaluation(),
    designAmbition: currentDesignAmbitionReport(req),
    runtimeEvidenceChain: currentRuntimeEvidenceChainReport(req),
    researchStress: currentResearchEvaluationStressReport(req),
    evaluationIntegrity: currentEvaluationIntegrityReport(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readResearchRigorReceipts(root),
  });
}

function currentEvaluationSampleReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildEvaluationSampleReportFromReceipt(readLatestEvaluationSampleReceipt(root));
    if (cachedReport) return cachedReport;
  }
  return buildEvaluationSampleReport({
    proofQuality: currentProofQualityEvaluation(),
    searchQuality: currentSearchQualityEvaluation(),
    opportunityQuality: currentOpportunityQualityEvaluation(),
    usabilityQuality: currentUsabilityQualityEvaluation(),
    designAmbition: currentDesignAmbitionReport(req),
    runtimeEvidenceChain: currentRuntimeEvidenceChainReport(req),
    researchStress: currentResearchEvaluationStressReport(req),
    evaluationIntegrity: currentEvaluationIntegrityReport(req),
    researchRigor: currentResearchRigorReport(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: readEvaluationSampleReceipts(root),
  });
}

function currentArtifactComparison(leftSlug, rightSlug, { detail = "summary" } = {}) {
  return compareProjectArtifacts({
    leftSlug,
    rightSlug,
    detail,
    projects,
    artifactCatalog: currentArtifactCatalog(),
    claims: claimLedger.map(publicClaim),
  });
}

function currentPrivacyApprovalAudit({ ensureStore = false } = {}) {
  const storeInfo = ensureStore ? ensurePrivacyApprovalStore(root) : readPrivacyApprovalStore(root);
  return buildPrivacyApprovalAudit({
    claims: claimLedger.map(publicClaim),
    artifactCatalog: currentArtifactCatalog(),
    storeInfo,
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: readPrivacyApprovalReceipts(root),
  });
}

function runtimeTruth(req) {
  const host = req.headers.host || `localhost:${port}`;
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const git = readGitIdentity();
  const inlineRuntime = readInlineRuntimeIdentity();
  const environment = process.env.VERCEL ? "vercel" : "local";
  const productionDomains = domains.filter((domain) => /^https?:\/\//.test(domain.url));
  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-truth",
    runtime: {
      environment,
      baseUrl: `${protocol}://${host}`,
      node: process.version,
      pid: process.pid,
      port,
    },
    package: {
      name: packageManifest.name,
      version: packageManifest.version,
      private: packageManifest.private === true,
    },
    build: inlineRuntime,
    git,
    surfaceContract: runtimeSurfaceContract(),
    domains: productionDomains.map((domain) => ({
      label: domain.label,
      url: domain.url,
      role: domain.role,
      trackedByStatus: true,
    })),
    differences: [
      environment === "local"
        ? "This response is from the local Node server, not a production deployment."
        : "This response is from a hosted deployment environment.",
      git.commit ? "Git commit identity is readable." : "Git commit identity is missing or the branch has no commit yet.",
      inlineRuntime.isBundled
        ? "The HTML contains an inline bundled command-center runtime."
        : "The HTML does not expose the expected inline runtime markers.",
    ],
  };
}

function runtimeSurfaceContract() {
  if (runtimeSurfaceContractCache) return runtimeSurfaceContractCache;
  const routeManifest = runtimeRouteManifest();
  const refreshPlan = evidenceRefreshPlan();
  const criticalScripts = {
    verify: Boolean(packageManifest.scripts?.verify),
    recordRuntime: Boolean(packageManifest.scripts?.["record:runtime"]),
    recordRuntimeSurface: Boolean(packageManifest.scripts?.["record:runtime-surface"]),
    recordRouteLatency: Boolean(packageManifest.scripts?.["record:route-latency"]),
    refreshEvidence: Boolean(packageManifest.scripts?.["refresh:evidence"]),
    explainRuntime: Boolean(packageManifest.scripts?.["explain:runtime"]),
    auditRuntimeDeploy: Boolean(packageManifest.scripts?.["audit:runtime-deploy"]),
    auditRuntimeChain: Boolean(packageManifest.scripts?.["audit:runtime-chain"]),
  };
  runtimeSurfaceContractCache = {
    publicApiRoutes: routeManifest.publicApiRoutes.length,
    privateApiRoutes: routeManifest.privateApiRoutes.length,
    staticRoutes: routeManifest.staticRoutes.length,
    refreshEndpoints: refreshPlan.endpoints.length,
    privateRefreshEndpoints: refreshPlan.endpoints.filter((endpoint) => endpoint.startsWith("/api/private")).length,
    privateGate: {
      envVar: routeManifest.privateGate.envVar,
      publicDefaultStatus: routeManifest.privateGate.publicDefaultStatus,
      localhostOnly: routeManifest.privateGate.localhostOnly === true,
    },
    criticalScripts,
    criticalScriptCount: Object.values(criticalScripts).filter(Boolean).length,
    deployComparisonInputs: [
      "package",
      "build",
      "git",
      "domains",
      "route-contract",
      "latency-contract",
      "refresh-contract",
      "private-gate",
      "critical-scripts",
    ],
  };
  return runtimeSurfaceContractCache;
}

function currentRuntimeTruthReport(req) {
  return buildRuntimeTruthReport({
    truth: runtimeTruth(req),
    history: [readLatestRuntimeTruthReceipt(root)].filter(Boolean),
  });
}

function currentRuntimeAttestation(req) {
  return buildRuntimeAttestation({
    runtimeReport: currentRuntimeTruthReport(req),
    runtimePlan: runtimeTruthPlan(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    routeManifest: runtimeRouteManifest(),
  });
}

function currentRuntimeSurfaceLatest(options = {}) {
  const latest = readLatestRuntimeSurfaceReceipt(root);
  return buildRuntimeSurfaceLatest({
    routeManifest: runtimeRouteManifest(),
    history: latest ? [latest] : [],
    ...options,
  });
}

function currentRouteLatencyReport(options = {}) {
  const latest = readLatestRouteLatencyReceipt(root);
  return buildRouteLatencyLatest({
    routeManifest: runtimeRouteManifest(),
    receipts: latest ? [latest] : [],
    ...options,
  });
}

function currentRuntimeBoundaryReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildRuntimeBoundaryReportFromReceipt(readRuntimeBoundaryReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildRuntimeBoundaryReport({
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    runtimePlan: runtimeTruthPlan(),
    runtimeSurface: currentRuntimeSurfaceLatest({ detail: "full" }),
    runtimeAttestation: currentRuntimeAttestation(req),
    packageManifest,
    sourceSignals: runtimeBoundarySourceSignals(),
    receipts: readRuntimeBoundaryReceipts(root),
  });
}

function currentRuntimeReconciliationReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildRuntimeReconciliationReportFromReceipt(readRuntimeReconciliationReceipts(root)[0]);
    if (cachedReport) return cachedReport;
  }
  return buildRuntimeReconciliationReport({
    runtimeReport: currentRuntimeTruthReport(req),
    runtimeAttestation: currentRuntimeAttestation(req),
    runtimeSurface: currentRuntimeSurfaceLatest(),
    runtimeBoundary: currentRuntimeBoundaryReport(req),
    refreshPlan: evidenceRefreshPlan(),
    runtimePlan: runtimeTruthPlan(),
    routeManifest: runtimeRouteManifest(),
    runtimeTruthReceipts: readRuntimeTruthReceipts(root),
    runtimeSurfaceReceipts: readRuntimeSurfaceReceipts(root),
    evidenceRefreshReceipts: readEvidenceRefreshReceipts(root),
    packageManifest,
    receipts: readRuntimeReconciliationReceipts(root),
  });
}

function currentRuntimeDiffReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildRuntimeDiffReportFromReceipt(readLatestRuntimeDiffReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestRuntimeDiffReceipt(root);
  return buildRuntimeDiffReport({
    runtimeReport: currentRuntimeTruthReport(req),
    runtimeTruthReceipts: readRuntimeTruthReceipts(root),
    runtimeAttestation: currentRuntimeAttestation(req),
    runtimeReconciliation: currentRuntimeReconciliationReport(req),
    runtimeSurface: currentRuntimeSurfaceLatest(),
    refreshPlan: evidenceRefreshPlan(),
    routeManifest: runtimeRouteManifest(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentRuntimeExplanationReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildRuntimeExplanationReportFromReceipt(readLatestRuntimeExplainReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestRuntimeExplainReceipt(root);
  return buildRuntimeExplanationReport({
    runtimeReport: currentRuntimeTruthReport(req),
    runtimeAttestation: currentRuntimeAttestation(req),
    runtimeSurface: currentRuntimeSurfaceLatest(),
    runtimeBoundary: currentRuntimeBoundaryReport(req),
    runtimeReconciliation: currentRuntimeReconciliationReport(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentRuntimeDeployReadinessReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildRuntimeDeployReadinessReportFromReceipt(readLatestRuntimeDeployReadinessReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestRuntimeDeployReadinessReceipt(root);
  return buildRuntimeDeployReadinessReport({
    runtimeReport: currentRuntimeTruthReport(req),
    runtimeAttestation: currentRuntimeAttestation(req),
    runtimeSurface: currentRuntimeSurfaceLatest(),
    runtimeBoundary: currentRuntimeBoundaryReport(req),
    runtimeReconciliation: currentRuntimeReconciliationReport(req),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function currentRuntimeEvidenceChainReport(req, { preferReceipt = false } = {}) {
  if (preferReceipt) {
    const cachedReport = buildRuntimeEvidenceChainReportFromReceipt(readLatestRuntimeEvidenceChainReceipt(root));
    if (cachedReport) return cachedReport;
  }
  const latestReceipt = readLatestRuntimeEvidenceChainReceipt(root);
  return buildRuntimeEvidenceChainReport({
    runtimeReport: currentRuntimeTruthReport(req),
    runtimeAttestation: currentRuntimeAttestation(req),
    runtimeSurface: currentRuntimeSurfaceLatest(),
    runtimeBoundary: currentRuntimeBoundaryReport(req),
    runtimeReconciliation: currentRuntimeReconciliationReport(req),
    runtimeExplanation: currentRuntimeExplanationReport(req),
    runtimeDeployReadiness: currentRuntimeDeployReadinessReport(req, { preferReceipt }),
    routeManifest: runtimeRouteManifest(),
    refreshPlan: evidenceRefreshPlan(),
    packageManifest,
    receipts: latestReceipt ? [latestReceipt] : [],
  });
}

function runtimeBoundarySourceSignals() {
  const serverSource = safeReadText("server.js");
  const readme = safeReadText("README.md");
  return {
    hasPrivateCockpitGateFunction: serverSource.includes("function privateCockpitEnabled"),
    gateRequiresEnv: serverSource.includes('process.env.ENABLE_PRIVATE_COCKPIT !== "1"'),
    gateChecksLoopback: ["127.0.0.1", "::1", "::ffff:127.0.0.1"].every((value) => serverSource.includes(value)),
    privateRouteGuardCount: (serverSource.match(/privateCockpitEnabled\(req\)/g) || []).length,
    readmeMentionsPrivateOnly: /local\/private only/i.test(readme),
    readmeMentionsPrivateEnv: readme.includes("ENABLE_PRIVATE_COCKPIT=1"),
  };
}

function commandCenterSourceSignals() {
  const cacheKey = sourceSignalsCacheKey(["index.html", "command-center.mjs", "styles.css"]);
  if (commandCenterSourceSignalsCache?.cacheKey === cacheKey) return commandCenterSourceSignalsCache.value;
  const html = safeReadText("index.html");
  const runtime = safeReadText("command-center.mjs");
  const styles = safeReadText("styles.css");
  const keyboardKeys = ["ArrowDown", "ArrowUp", "Home", "End"];
  const ribbonLabels = ["claims", "graph", "runtime", "blockade", "opportunities"];
  const proofRibbonActionCommands = [
    "claim-calibration",
    "graph-confidence",
    "runtime-chain",
    "trust-blockade",
    "opportunity-scorecard",
  ].filter((command) => runtime.includes(`command: "${command}"`));

  const value = {
    files: ["index.html", "command-center.mjs", "styles.css"],
    hasProofRibbon: html.includes('id="proof-ribbon"') && runtime.includes("renderProofRibbon"),
    proofRibbonSignals: ribbonLabels.filter((label) => runtime.includes(`label: "${label}"`)).length,
    proofRibbonActionCommands,
    proofRibbonActionCount: proofRibbonActionCommands.length,
    hasProofRibbonActionButtons:
      proofRibbonActionCommands.length >= 4 &&
      runtime.includes("[data-proof-command]") &&
      runtime.includes("data-proof-command=") &&
      runtime.includes("proof-ribbon-action") &&
      runtime.includes("dataset.proofCommand"),
    hasProjectKeyboardNav: runtime.includes("handleProjectListKeydown") && runtime.includes('addEventListener("keydown"'),
    keyboardProjectKeys: keyboardKeys.filter((key) => runtime.includes(`"${key}"`)).length,
    preservesProjectFocus: runtime.includes("focusProject") && runtime.includes("focusSlug"),
    exposesNeedsSource: runtime.includes("need source"),
    exposesGraphCoverage: runtime.includes("rendered refs"),
    exposesMissingProof: runtime.includes("missing proof"),
    terminalShortcuts: Math.min(5, (html.match(/data-terminal-command=/g) || []).length),
    hasRuntimeSurfaceShortcut: html.includes('data-terminal-command="runtime-surface"'),
    hasResponsiveProofRibbon: styles.includes(".proof-ribbon") && styles.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"),
    hasOverflowWrapGuards: styles.includes("overflow-wrap: anywhere") && styles.includes("text-overflow: ellipsis"),
  };
  commandCenterSourceSignalsCache = { cacheKey, value };
  return value;
}

function commandCenterDesignSourceSignals() {
  const cacheKey = sourceSignalsCacheKey(["index.html", "command-center.mjs", "styles.css", "tests/e2e/command-center.spec.mjs"]);
  if (commandCenterDesignSourceSignalsCache?.cacheKey === cacheKey) return commandCenterDesignSourceSignalsCache.value;
  const html = safeReadText("index.html");
  const runtime = safeReadText("command-center.mjs");
  const styles = safeReadText("styles.css");
  const e2e = safeReadText("tests/e2e/command-center.spec.mjs");
  const source = commandCenterSourceSignals();
  const shortcutButtonBlock = cssBlock(styles, ".terminal-shortcuts button");
  const proofRibbonActionBlock = cssBlock(styles, ".proof-ribbon-action");
  const shortcutGridBlock = cssBlock(styles, ".terminal-shortcuts");
  const commandJumpBlock = cssBlock(styles, ".command-jump");
  const skipLinksBlock = cssBlock(styles, ".skip-links");
  const artifactControlsBlock = cssBlock(styles, ".artifact-controls");
  const mobileBlock = cssBlocks(styles, "@media (max-width: 720px)").join("\n");
  const terminalShortcuts = html.match(/data-terminal-command=/g) || [];
  const shortcutButtonSelectors = html.match(/<button[^>]+data-terminal-command=/g) || [];

  const value = {
    ...source,
    terminalShortcutsCount: terminalShortcuts.length,
    terminalShortcutCommands: Array.from(html.matchAll(/data-terminal-command="([^"]+)"/g)).map((match) => match[1]),
    hasTerminalShortcutButtons: shortcutButtonSelectors.length === terminalShortcuts.length && terminalShortcuts.length > 0,
    hasTerminalShortcutGrid: /display:\s*grid/.test(shortcutGridBlock) && /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(150px,\s*1fr\)\)/.test(shortcutGridBlock),
    hasStableShortcutGeometry:
      /min-height:\s*38px/.test(shortcutButtonBlock) &&
      /display:\s*inline-flex/.test(shortcutButtonBlock) &&
      /align-items:\s*center/.test(shortcutButtonBlock) &&
      /justify-content:\s*center/.test(shortcutButtonBlock) &&
      /line-height:\s*1\.15/.test(shortcutButtonBlock) &&
      /overflow-wrap:\s*anywhere/.test(shortcutButtonBlock),
    hasProofRibbonActionGeometry:
      /display:\s*inline-flex/.test(proofRibbonActionBlock) &&
      /min-height:\s*30px/.test(proofRibbonActionBlock) &&
      /letter-spacing:\s*0/.test(proofRibbonActionBlock) &&
      /overflow-wrap:\s*anywhere/.test(proofRibbonActionBlock),
    hasCommandJumpWrap: /flex-wrap:\s*wrap/.test(commandJumpBlock) && /min-width:\s*min\(100%,\s*320px\)/.test(commandJumpBlock),
    hasSkipLinkWrap: /display:\s*flex/.test(skipLinksBlock) && /flex-wrap:\s*wrap/.test(skipLinksBlock) && /max-width:\s*calc\(100vw\s*-\s*32px\)/.test(skipLinksBlock),
    hasSearchTerminalFormStability:
      styles.includes(".search-box,\n  .terminal-form") && /grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(mobileBlock),
    hasMobileSingleColumnForms:
      styles.includes(".search-box,\n  .terminal-form") && /grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(mobileBlock),
    hasMobileTerminalShortcutOverride:
      /terminal-shortcuts/.test(mobileBlock) && /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*132px\),\s*1fr\)\)/.test(mobileBlock),
    hasArtifactControlStability:
      /display:\s*grid/.test(artifactControlsBlock) &&
      /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/.test(artifactControlsBlock) &&
      styles.includes(".artifact-controls select,\n.artifact-controls button") &&
      styles.includes("min-height: 38px") &&
      styles.includes("min-width: 0"),
    hasArtifactControlMobileReflow:
      /artifact-controls/.test(mobileBlock) && /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(mobileBlock),
    hasFocusVisible: /:focus-visible/.test(styles) && /outline:\s*2px\s+solid/.test(styles),
    hasZeroLetterSpacingForDenseControls: /letter-spacing:\s*0/.test(shortcutButtonBlock),
    hasRuntimeChainShortcut: html.includes('data-terminal-command="runtime-chain"'),
    hasDesignStabilityShortcut: html.includes('data-terminal-command="design-stability"'),
    hasDesignAmbitionShortcut: html.includes('data-terminal-command="design-ambition"'),
    hasMobileOverflowE2E: e2e.includes("scrollWidth <= window.innerWidth + 1"),
    browserPluginFallback: "playwright-fallback-browser-plugin-unavailable",
  };
  commandCenterDesignSourceSignalsCache = { cacheKey, value };
  return value;
}

function commandCenterKeyboardSourceSignals() {
  const cacheKey = sourceSignalsCacheKey(["index.html", "command-center.mjs", "styles.css", "tests/e2e/command-center.spec.mjs"]);
  if (commandCenterKeyboardSourceSignalsCache?.cacheKey === cacheKey) return commandCenterKeyboardSourceSignalsCache.value;
  const html = safeReadText("index.html");
  const runtime = safeReadText("command-center.mjs");
  const styles = safeReadText("styles.css");
  const source = commandCenterDesignSourceSignals();
  const skipTargets = Array.from(html.matchAll(/class="skip-link"[^>]+href="#([^"]+)"/g)).map((match) => match[1]);
  const mobileBlock = cssBlocks(styles, "@media (max-width: 720px)").join("\n");
  const mobileShortcutBlock = mobileBlock.includes(".terminal-shortcuts") ? mobileBlock : styles;
  const globalShortcutSignals = [
    runtime.includes('event.key === "/"'),
    runtime.includes('event.key === "`"'),
    runtime.includes('event.key === "Escape"'),
  ];
  const mobileSafeSignals = [
    /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*132px\),\s*1fr\)\)/.test(mobileShortcutBlock),
    styles.includes(".search-box,\n  .terminal-form") && styles.includes("grid-template-columns: minmax(0, 1fr)"),
    source.hasOverflowWrapGuards,
  ];

  const value = {
    ...source,
    hasTruthLedger: html.includes('id="truth-ledger"') && runtime.includes("renderTruthLedger"),
    hasSkipLinkNav: html.includes('class="skip-links"') && html.includes('aria-label="Skip links"'),
    skipLinkCount: skipTargets.length,
    skipTargets,
    hasSkipLinkActivationHandler: runtime.includes("function wireSkipLinks") && runtime.includes("target.scrollIntoView"),
    hasSkipFocusVisible: styles.includes(".skip-link:focus-visible") && styles.includes("transform: translateY(0)"),
    hasGlobalKeyboardHandler:
      runtime.includes("function handleGlobalKeyboardShortcuts") && runtime.includes('window.addEventListener("keydown"'),
    focusesSearchShortcut: runtime.includes('event.key === "/"') && runtime.includes("#command-search") && runtime.includes("focusAndSelect(els.query)"),
    focusesTerminalShortcut:
      runtime.includes('event.key === "`"') && runtime.includes("#command-terminal") && runtime.includes("focusAndSelect(els.terminalInput)"),
    escapesEditableFocus: runtime.includes('event.key === "Escape"') && runtime.includes("event.target.blur()"),
    respectsEditableTargets:
      runtime.includes("function isEditableTarget") &&
      runtime.includes("event.metaKey") &&
      runtime.includes("event.ctrlKey") &&
      runtime.includes("event.altKey"),
    globalShortcutCount: globalShortcutSignals.filter(Boolean).length,
    hasTerminalShortcutLabeling:
      runtime.includes("function decorateTerminalShortcutButtons") &&
      runtime.includes('setAttribute("title"') &&
      runtime.includes('setAttribute("aria-label"'),
    hasProofRibbonActionLabeling: runtime.includes('aria-label="Run ${escapeHtml(item.command)} for ${escapeHtml(item.label)} proof"'),
    hasMobileTerminalShortcutOverride: mobileSafeSignals[0],
    hasMobileSingleColumnForms: mobileSafeSignals[1],
    mobileSafeControlSignals: mobileSafeSignals.filter(Boolean).length,
  };
  commandCenterKeyboardSourceSignalsCache = { cacheKey, value };
  return value;
}

function cssBlock(source, selector) {
  if (selector.startsWith("@media")) {
    const start = source.indexOf(selector);
    if (start === -1) return "";
    const open = source.indexOf("{", start);
    if (open === -1) return "";
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(open + 1, index);
      }
    }
    return "";
  }
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{`).exec(source);
  if (!match) return "";
  const open = source.indexOf("{", match.index);
  if (open === -1) return "";
  const close = source.indexOf("}", open);
  if (close === -1) return "";
  return source.slice(open + 1, close);
}

function cssBlocks(source, selector) {
  const blocks = [];
  let offset = 0;

  while (offset < source.length) {
    const start = source.indexOf(selector, offset);
    if (start === -1) break;
    const block = cssBlock(source.slice(start), selector);
    if (block) blocks.push(block);
    offset = start + selector.length;
  }

  return blocks;
}

function safeReadText(relativePath) {
  try {
    return readFileSync(path.join(root, relativePath), "utf8");
  } catch {
    return "";
  }
}

function readGitIdentity() {
  try {
    const headPath = path.join(root, ".git", "HEAD");
    const head = readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.slice(5).trim();
      const refPath = path.join(root, ".git", ref);
      const cacheKey = `${fileCacheKey(headPath)}:${ref}:${fileCacheKey(refPath)}`;
      if (gitIdentityCache?.cacheKey === cacheKey) return gitIdentityCache.value;
      const commit = existsSync(refPath) ? readFileSync(refPath, "utf8").trim() : null;
      const value = {
        branch: ref.split("/").pop(),
        ref,
        commit,
        state: commit ? "commit-readable" : "unborn-or-missing-ref",
      };
      gitIdentityCache = { cacheKey, value };
      return value;
    }
    const cacheKey = `${fileCacheKey(headPath)}:detached:${head}`;
    if (gitIdentityCache?.cacheKey === cacheKey) return gitIdentityCache.value;
    const value = { branch: null, ref: "detached", commit: head, state: "detached" };
    gitIdentityCache = { cacheKey, value };
    return value;
  } catch {
    return { branch: null, ref: null, commit: null, state: "missing-git-metadata" };
  }
}

function readInlineRuntimeIdentity() {
  const htmlPath = path.join(root, "index.html");
  try {
    const cacheKey = fileCacheKey(htmlPath);
    if (inlineRuntimeIdentityCache?.cacheKey === cacheKey) return inlineRuntimeIdentityCache.value;
    const html = readFileSync(htmlPath, "utf8");
    const runtimeStart = html.indexOf("runtime:start");
    const runtimeEnd = html.indexOf("runtime:end");
    const value = {
      isBundled: runtimeStart !== -1 && runtimeEnd !== -1 && runtimeEnd > runtimeStart,
      bytes: Buffer.byteLength(html),
      runtimeBytes: runtimeStart !== -1 && runtimeEnd > runtimeStart ? runtimeEnd - runtimeStart : 0,
    };
    inlineRuntimeIdentityCache = { cacheKey, value };
    return value;
  } catch {
    return { isBundled: false, bytes: 0, runtimeBytes: 0 };
  }
}

function fileCacheKey(filePath) {
  try {
    const file = statSync(filePath);
    return `${file.mtimeMs}:${file.size}`;
  } catch {
    return "missing";
  }
}

function sourceSignalsCacheKey(relativePaths) {
  return relativePaths.map((relativePath) => `${relativePath}:${fileCacheKey(path.join(root, relativePath))}`).join("|");
}

function privateCockpitEnabled(req) {
  if (process.env.ENABLE_PRIVATE_COCKPIT !== "1") return false;
  const remote = req.socket.remoteAddress || "";
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

function claimSummaryLines() {
  const summary = currentTrustSummary().counts;
  return [
    `${summary.totalClaims} public-safe claims tracked.`,
    `${summary.linkBackedClaims} link-backed, ${summary.sourceBackedClaims} source-backed, ${summary.needsSourceClaims} need stronger source attachments.`,
    `${summary.privateReferences} private references are projected as public-safe summaries.`,
  ];
}

function claimLines(claims, limit = 6) {
  return claims
    .slice(0, limit)
    .map((claim) => `${claim.id} :: ${claim.evidenceStrength} :: ${claim.text}`)
    .join("\n");
}

function projectEvidenceLines(project) {
  const evidence = evidenceForProject(project, claimLedger);
  return [
    `${evidence.title} :: ${evidence.evidenceStrength} :: confidence ${evidence.confidenceScore}/100`,
    ...evidence.links.map((link) => `${link.type}: ${link.url}`),
    ...evidence.proofItems.map((item) => `proof: ${item}`),
  ].join("\n");
}

function terminal(command) {
  const raw = String(command || "").trim();
  const [name, ...args] = raw.split(/\s+/);
  const normalized = (name || "help").toLowerCase();
  const help = "Commands: help, whoami, projects, proof, claims [slug], verified, stale, demos, evidence <slug>, risks <slug>, weaknesses [slug], skills [skill], contradictions, changes, waves [number], graph-quality, graph-links, graph-scoreboard, graph-lineage, graph-guard, graph-disclosures, graph-confidence, graph-depth, trust-blockade, route-latency, evaluate, search-quality, claim-calibration, opportunity-quality, usability-quality, design-stability, design-ambition, keyboard-readiness, evaluation-integrity, evaluation-sample, research-stress, research-rigor, narrative [recruiter|professor|founder], narrative-grounding [recruiter|professor|founder], narrative-sequence [recruiter|professor|founder], narrative-tailor [recruiter|professor|founder], narrative-disclosure [recruiter|professor|founder], narrative-contrast [audience|pair], narrative-objections [audience], artifact-collections [id], artifact-transcripts [slug], artifact-replays [slug], artifact-gaps, artifact-gap-repair, artifact-museum, artifact-museum-compare [collection-a collection-b], artifact-compare <slug-a> <slug-b>, opportunities, opportunity-packages [id], opportunity-board, opportunity-derisking [id], opportunity-ranking [id], opportunity-scorecard [id], next, artifacts, maintenance, approvals, refresh, a11y, performance, visuals, review [weekly|monthly], trial [slug], packet [recruiter|professor|founder], runtime, runtime-diff, runtime-attestation, runtime-surface, runtime-boundary, runtime-reconciliation, runtime-explain, runtime-deploy, runtime-chain, intent [recruiter|agent-infra|civic-tech|research|founder], contact, open <slug>, why <slug>, stack <slug>, compare <slug-a> <slug-b>, timeline, fit recruiter|professor|founder|agent-infra|civic-tech|research, status, graph, random";
  if (normalized === "help") {
    return help;
  }
  if (normalized === "whoami") {
    return `${profile.name}. ${profile.headline}. Builder of agentic QA systems, civic/mobile tools, assistive hardware, and market-data experiments.`;
  }
  if (normalized === "projects") {
    return projects
      .filter((project) => project.tier !== "Archive")
      .slice(0, 9)
      .map((project) => `${project.title} :: ${project.kind}`)
      .join("\n");
  }
  if (normalized === "domains") {
    return domains.map((domain) => `${domain.label} -> ${domain.role} (${domain.url})`).join("\n");
  }
  if (normalized === "shiplog") {
    return timelineLines().join("\n");
  }
  if (normalized === "timeline") {
    return timelineLines().join("\n");
  }
  if (normalized === "status") {
    return [
      "Status checks cover internal routes, configured domains, live demos, and the GitHub profile.",
      ...domains.map((domain) => `${domain.label} :: ${domain.role}`),
    ].join("\n");
  }
  if (normalized === "graph") {
    const graph = currentGraphPayload({ preferReceipt: true });
    return `${graph.nodes.length} graph nodes and ${graph.edges.length} edges. Receipt: ${graph.summary.latestReceiptId || "none"}. Node types: ${[
      ...new Set(graph.nodes.map((node) => node.type)),
    ].join(", ")}.`;
  }
  if (normalized === "artifacts") {
    const catalog = currentArtifactCatalog();
    return [
      `${catalog.counts.availableArtifacts} public-safe artifacts across ${catalog.counts.projects} projects.`,
      `${catalog.counts.generatedPreviews} generated previews, ${catalog.counts.apiReplays} API replays, ${catalog.counts.terminalReplays} terminal replays, ${catalog.counts.museumCaptures} museum captures, ${catalog.counts.screenshotGaps} screenshot gaps.`,
      ...catalog.artifacts
        .slice(0, 8)
        .map((artifact) => `${artifact.projectTitle} :: ${artifact.artifactType} :: ${artifact.url || artifact.command}`),
    ].join("\n");
  }
  if (normalized === "artifact-collections" || normalized === "collections" || normalized === "museum") {
    const catalog = currentArtifactCollections();
    const selected = args[0] ? selectArtifactCollection(args[0], catalog) : null;
    if (args[0] && !selected) return `No artifact collection "${args[0]}". Try: artifact-collections proof-strongest`;
    if (selected) {
      return [
        `${selected.label} :: ${selected.score}/100 :: ${selected.artifacts.length} artifact(s), ${selected.gaps.length} gap(s)`,
        selected.curatorNote,
        ...selected.suggestedPath.map((step) => `${step.step}. ${step.label} :: ${step.reason}`),
      ].join("\n");
    }
    return [
      `${catalog.mode} :: ${catalog.summary.collections} collections; ${catalog.summary.featuredArtifacts} featured artifact(s).`,
      ...catalog.collections.map((collection) => `${collection.id} :: ${collection.score}/100 :: ${collection.label}`),
    ].join("\n");
  }
  if (normalized === "artifact-transcripts" || normalized === "transcripts" || normalized === "artifact-transcript") {
    const library = currentArtifactTranscripts();
    const selected = args[0] ? selectArtifactTranscript(args[0], library) : null;
    if (args[0] && !selected) return `No artifact transcript "${args[0]}". Try: artifact-transcripts qagent`;
    if (selected) {
      return [
        `${selected.projectTitle} transcript :: ${selected.transcriptScore}/100 ${selected.status}; ${selected.lines.length} line(s).`,
        `Command: ${selected.command}`,
        ...selected.lines.slice(0, 6).map((line) => `${line.kind}: ${line.text}`),
        `Next: ${selected.nextAction}`,
      ].join("\n");
    }
    return [
      `${library.mode} :: ${library.summary.transcripts} transcript(s); average ${library.summary.averageTranscriptScore}/100; ${library.summary.readyTranscripts} ready.`,
      ...library.comparison.strongest.slice(0, 5).map((transcript) => `${transcript.project} :: ${transcript.transcriptScore}/100 :: ${transcript.status}`),
      `Repair: ${library.comparison.commonRepair}`,
    ].join("\n");
  }
  if (normalized === "artifact-museum" || normalized === "museum-audit" || normalized === "artifact-quality") {
    const report = currentArtifactMuseumAudit();
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      `Museum: ${report.summary.artifacts} artifact(s), ${report.summary.collections} collection(s), ${report.summary.transcripts} transcript(s), ${report.summary.comparisons} comparison path(s), ${report.summary.gapClosurePlans} gap closure plan(s).`,
      `Receipt: ${report.summary.latestReceiptId || "none"}; route ${report.summary.routeCovered ? "covered" : "missing"}; refresh ${report.summary.refreshCovered ? "covered" : "missing"}.`,
      ...report.dimensions.map((dimension) => `${dimension.id} :: ${dimension.score}/100 ${dimension.band} :: ${dimension.detail}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "artifact-replays" || normalized === "artifact-replay" || normalized === "replays") {
    const catalog = currentArtifactReplays();
    const selected = args[0] ? selectArtifactReplay(args[0], catalog) : null;
    if (args[0] && !selected) return `No artifact replay "${args[0]}". Try: artifact-replays qagent`;
    if (selected) {
      return [
        `${selected.projectTitle} replay :: ${selected.score}/100 ${selected.band}; ${selected.steps.length} step(s), ${selected.gapSteps.length} gap step(s), ${selected.gapClosureSteps.length} closure step(s).`,
        ...selected.steps.map((step) => `${step.kind} :: ${step.target} :: ${step.expected}`),
        ...selected.gapClosurePlan.map((item) => `closure ${item.rank} :: ${item.action}`),
        `Next: ${selected.nextAction}`,
      ].join("\n");
    }
    return [
      `${catalog.mode} :: ${catalog.summary.score}/100 ${catalog.summary.band}; ${catalog.summary.replays} replay(s), ${catalog.summary.gapReplays} gap replay(s), ${catalog.summary.gapClosurePlans} closure plan step(s).`,
      ...catalog.weakestReplays.slice(0, 5).map((replay) => `${replay.project} :: ${replay.score}/100 ${replay.band} :: ${replay.nextAction}`),
      `Next: ${catalog.nextAction}`,
    ].join("\n");
  }
  if (normalized === "artifact-gaps" || normalized === "artifact-gap" || normalized === "gap-workbench") {
    const report = currentArtifactGapWorkbench({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.passing}/${report.summary.checks} check(s); ${report.summary.gaps} gap(s), ${report.summary.narrativeBlockingGaps} narrative-blocking, ${report.summary.highPriorityGaps} high priority.`,
      ...report.gaps.slice(0, 5).map((gap) => `${gap.priority} :: ${gap.id} :: ${gap.narrativeBlockingAudiences.join(",") || "catalog"} :: ${gap.nextAction}`),
      `Receipt: ${report.summary.latestReceiptId || "none"}`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "artifact-gap-repair" || normalized === "gap-repair" || normalized === "proof-repair") {
    const report = currentArtifactGapProofRepairQueue({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.passing}/${report.summary.checks} check(s); ${report.summary.repairItems} repair item(s); ${report.summary.opportunityUnlocks} opportunity unlock(s); ${report.summary.deRiskAdvances} de-risk advance(s).`,
      ...report.repairQueue.slice(0, 5).map((item) => `${item.priority} :: ${item.gapId} :: unlocks ${item.opportunityUnlockCount} opp(s) :: ${item.nextAction}`),
      `Receipt: ${report.summary.latestReceiptId || "none"}`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "artifact-museum-compare" || normalized === "museum-compare" || normalized === "artifact-compare-museum") {
    const report = currentArtifactMuseumComparisonReport();
    const selected = args.length >= 2 ? selectArtifactMuseumComparisonPair(args[0], args[1], report) : null;
    if (args.length >= 2 && !selected) return `No artifact museum comparison "${args[0]} ${args[1]}". Try: artifact-museum-compare proof-strongest media-replay`;
    if (selected) {
      return [
        `${selected.left.label} vs ${selected.right.label} :: ${selected.comparisonScore}/100 ${selected.band}; priority ${selected.recommendationPriority}/100.`,
        `Shared projects: ${selected.sharedProjects.length}; left-only ${selected.leftOnlyProjects.length}; right-only ${selected.rightOnlyProjects.length}.`,
        `Types: shared ${selected.sharedArtifactTypes.length}; left-only ${selected.leftOnlyArtifactTypes.join(", ") || "none"}; right-only ${selected.rightOnlyArtifactTypes.join(", ") || "none"}.`,
        `Use: ${selected.useCase}`,
        `Next: ${selected.nextAction}`,
      ].join("\n");
    }
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.comparisonPairs} pair(s), ${report.summary.focusPairs} focus pair(s).`,
      `Coverage: ${report.summary.projectsCovered}/${report.summary.totalProjects} project(s); ${report.summary.artifactsCompared} artifact reference(s); ${report.summary.gapRecords} gap record(s).`,
      `Receipt: ${report.summary.latestReceiptId || "none"}; route ${report.summary.routeCovered ? "covered" : "missing"}; refresh ${report.summary.refreshCovered ? "covered" : "missing"}.`,
      ...report.curatorContrastPlan.contrastOrder.map((step) => `${step.step}. ${step.pairId} :: ${step.score}/100 :: ${step.useCase}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "intent") {
    const intentPath = selectIntentPath(args.join(" ") || "recruiter", currentIntentPaths());
    return [
      `${intentPath.label} :: ${intentPath.timeBox}`,
      `Projects: ${intentPath.bestProjects.map((project) => project.title).join(", ")}`,
      `Proof: ${intentPath.proofPath.slice(0, 3).map((claim) => claim.evidenceStrength).join(", ")}`,
      `Demos: ${intentPath.demos.slice(0, 3).map((demo) => demo.url || demo.command).join(", ")}`,
      `Risk: ${intentPath.riskDisclosure[0]}`,
      `CTA: ${intentPath.cta}`,
    ].join("\n");
  }
  if (normalized === "maintenance") {
    const report = currentMaintenanceReport();
    return [
      `${report.summary.issues} maintenance issues; ${report.summary.highSeverity} high severity.`,
      ...report.issues
        .slice(0, 8)
        .map((issue) => `${issue.severity} :: ${issue.type} :: ${issue.title} :: verify with ${issue.verificationCommand}`),
    ].join("\n");
  }
  if (normalized === "approvals") {
    const audit = currentPrivacyApprovalAudit();
    return [
      `${audit.mode} :: ${audit.counts.pending} pending, ${audit.counts.approved} approved, ${audit.counts.rejected} rejected.`,
      `Store: ${audit.storage.relativePath} :: exists ${audit.storage.exists} :: localOnly ${audit.storage.localOnly}`,
      `Gate: ${audit.publicProjectionGate.rule}`,
      ...audit.approvalQueue
        .slice(0, 6)
        .map((item) => `${item.itemType} :: ${item.project || "profile"} :: ${item.privacyLevel} :: ${item.publicProjection}`),
    ].join("\n");
  }
  if (normalized === "runtime") {
    const truth = runtimeTruth({ headers: { host: `localhost:${port}` } });
    const report = buildRuntimeTruthReport({ truth, history: readRuntimeTruthReceipts(root) });
    return [
      `${truth.mode} :: ${truth.runtime.environment} :: ${truth.runtime.baseUrl}`,
      `${truth.package.name}@${truth.package.version} :: node ${truth.runtime.node}`,
      `git ${truth.git.state} :: ${truth.git.branch || "no-branch"} :: ${truth.git.commit || "no-commit"}`,
      `inline runtime bundled: ${truth.build.isBundled} (${truth.build.runtimeBytes} marker bytes)`,
      `surface contract: public ${truth.surfaceContract.publicApiRoutes}, private ${truth.surfaceContract.privateApiRoutes}, static ${truth.surfaceContract.staticRoutes}, refresh ${truth.surfaceContract.refreshEndpoints}, privateGate ${truth.surfaceContract.privateGate.publicDefaultStatus}`,
      `runtime readiness: ${report.readiness.score}/${report.readiness.maxScore} ${report.readiness.band} :: identity ${report.current.identityHash}`,
      `domains: ${truth.domains.map((domain) => domain.url).join(", ")}`,
    ].join("\n");
  }
  if (normalized === "runtime-diff" || normalized === "fingerprint") {
    if (normalized === "runtime-diff") {
      const report = currentRuntimeDiffReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
      return [
        `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.identityChanges} identity change(s), ${report.summary.volatileChanges} volatile change(s).`,
        `Receipt: ${report.summary.latestReceiptId || "none"}.`,
        `current ${report.current.identityHash} :: previous ${report.previous?.id || "none"} :: stale receipts ${report.summary.staleReceiptKinds}`,
        `lanes: ${report.lanes.slice(0, 4).map((lane) => `${lane.id}:${lane.score}/${lane.passed}`).join(", ")}`,
        `${report.driftMatrix.classification}: ${report.current.interpretation}`,
        `Record with: ${runtimeDiffPlan().command}`,
      ].join("\n");
    }
    const report = buildRuntimeTruthReport({
      truth: runtimeTruth({ headers: { host: `localhost:${port}` } }),
      history: readRuntimeTruthReceipts(root),
    });
    return [
      `${report.mode} :: ${report.readiness.score}/${report.readiness.maxScore} ${report.readiness.band}`,
      `identity ${report.current.identityHash} :: volatile ${report.current.volatileHash}`,
      `surface contract: public ${report.current.identity.publicApiRoutes}, private ${report.current.identity.privateApiRoutes}, refresh ${report.current.identity.refreshEndpoints}, privateGate ${report.current.identity.privateGateDefaultStatus}`,
      report.previous ? `previous ${report.previous.id} :: ${report.previous.identityHash}` : "previous none",
      `${report.diff.summary.changed} change(s): ${report.diff.interpretation}`,
      `Record with: ${runtimeTruthPlan().command}`,
    ].join("\n");
  }
  if (normalized === "runtime-attestation" || normalized === "attestation" || normalized === "attest") {
    const report = buildRuntimeTruthReport({
      truth: runtimeTruth({ headers: { host: `localhost:${port}` } }),
      history: readRuntimeTruthReceipts(root),
    });
    const attestation = buildRuntimeAttestation({
      runtimeReport: report,
      runtimePlan: runtimeTruthPlan(),
      refreshPlan: evidenceRefreshPlan(),
      packageManifest,
      routeManifest: runtimeRouteManifest(),
    });
    return [
      `${attestation.mode} :: ${attestation.summary.score}/100 ${attestation.summary.band}; ${attestation.summary.passing}/${attestation.summary.attestations} attestation(s) passing.`,
      `Routes: ${attestation.summary.publicApiRoutes} public API, ${attestation.summary.privateApiRoutes} private, ${attestation.summary.staticRoutes} static.`,
      `Gate: ${attestation.publishGate.safeForPublicRuntimeBadge ? "public-safe-local-badge" : "repair-first"} :: ${attestation.publishGate.reason}`,
      ...attestation.attestations.slice(0, 5).map((item) => `${item.passed ? "pass" : "fail"} :: ${item.id} :: ${item.evidence}`),
    ].join("\n");
  }
  if (normalized === "runtime-surface" || normalized === "surface-diff" || normalized === "route-surface") {
    const receipt = readLatestRuntimeSurfaceReceipt(root);
    if (!receipt) {
      const routeManifest = runtimeRouteManifest();
      return [
        `runtime-surface-diff-plan :: ${routeManifest.publicApiRoutes.length + routeManifest.staticRoutes.length + routeManifest.privateApiRoutes.length} declared route(s); ${routeManifest.privateApiRoutes.length} private route(s) expected ${routeManifest.privateGate.publicDefaultStatus}.`,
        "Record with: npm run record:runtime-surface",
        "The recorder probes declared public/static routes and confirms private routes return the public default status.",
      ].join("\n");
    }
    const groups = receipt.groups || {};
    const diff = receipt.diff || { statusMismatches: [], interpretation: "No runtime surface diff details were recorded." };
    return [
      `${receipt.mode} :: ${receipt.summary.score}/100 ${receipt.summary.band}; ${receipt.summary.passing}/${receipt.summary.total} probe(s) passing.`,
      `Groups: public ${groups["public-api"]?.passing || 0}/${groups["public-api"]?.total || 0}, static ${groups.static?.passing || 0}/${groups.static?.total || 0}, private gate ${groups["private-gate"]?.passing || 0}/${groups["private-gate"]?.total || 0}.`,
      `${diff.statusMismatches.length} status mismatch(es): ${diff.interpretation}`,
      `Latest: ${receipt.id} :: ${receipt.checkedAt}`,
      "Record with: npm run record:runtime-surface",
    ].join("\n");
  }
  if (normalized === "route-latency" || normalized === "latency" || normalized === "latency-heatmap") {
    const report = currentRouteLatencyReport({ detail: "full" });
    const slowRoutes = report.slowRouteFrontier.slice(0, 3);
    const slowCommands = report.slowTerminalFrontier.slice(0, 3);
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.routeSamples} route sample(s), ${report.summary.terminalSamples} terminal sample(s).`,
      `Latency: route p95 ${report.summary.routeP95Ms || 0}ms; terminal p95 ${report.summary.terminalP95Ms || 0}ms; slow routes ${report.summary.slowRoutes || 0}; slow commands ${report.summary.slowTerminalCommands || 0}.`,
      ...slowRoutes.map((sample) => `route ${sample.rank} :: ${sample.ms}ms :: ${sample.method} ${sample.target}`),
      ...slowCommands.map((sample) => `terminal ${sample.rank} :: ${sample.ms}ms :: ${sample.command}`),
      `Record with: ${report.plan.command}`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "runtime-boundary" || normalized === "boundary" || normalized === "privacy-boundary") {
    const report = currentRuntimeBoundaryReport({ headers: { host: `localhost:${port}` } });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      `Routes: ${report.summary.publicApiRoutes} public, ${report.summary.privateApiRoutes} private; refresh endpoints ${report.summary.refreshEndpoints}.`,
      ...report.checks.slice(0, 5).map((check) => `${check.passed ? "pass" : "fail"} :: ${check.id} :: ${check.detail}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "runtime-reconciliation" || normalized === "runtime-proof" || normalized === "truth-ledger") {
    const report = currentRuntimeReconciliationReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Receipts: ${report.receiptMatrix.map((receipt) => `${receipt.id}:${receipt.freshness}:${receipt.receiptId || "none"}`).join(", ")}.`,
      `Surface: ${report.driftMatrix.routeSurface.latestProbeTargets}/${report.driftMatrix.routeSurface.expectedProbeTargets} probe(s); refresh ${report.driftMatrix.evidenceRefresh.latestEndpoints}/${report.driftMatrix.evidenceRefresh.expectedEndpoints} endpoint(s).`,
      ...report.checks.slice(0, 5).map((check) => `${check.passed ? "pass" : "fail"} :: ${check.id} :: ${check.detail}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "runtime-explain" || normalized === "explain-runtime" || normalized === "truth-explain") {
    const report = currentRuntimeExplanationReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.proofClaims} proof claim(s), ${report.summary.staleReceiptKinds} stale receipt kind(s).`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Identity: ${report.identityExplanation.identityHash}; volatile ${report.identityExplanation.volatileHash}.`,
      `Firewall: ${report.summary.claimFirewallBlockedClaims} blocked claim(s); audit ladder ${report.summary.auditLadderSteps} step(s); receipts ${report.summary.receiptExplanations}.`,
      ...report.proofClaims.map((claim) => `${claim.id} :: ${claim.confidence}/100 :: ${claim.statement} Limit: ${claim.limit}`),
      ...report.claimFirewall.blockedClaims.slice(0, 3).map((claim) => `blocked :: ${claim.id} :: ${claim.claim}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "runtime-deploy" || normalized === "runtime-deploy-readiness" || normalized === "deploy-readiness") {
    const report = currentRuntimeDeployReadinessReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passingGates}/${report.summary.gates} gate(s) passing.`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Packet: ${report.comparisonPacket.packetId}; identity ${report.comparisonPacket.identityHash}; probes ${report.comparisonPacket.routeSurface.latestProbeTargets}/${report.comparisonPacket.routeSurface.expectedProbeTargets}.`,
      `Surface contract: public ${report.comparisonPacket.surfaceContract.publicApiRoutes}, private ${report.comparisonPacket.surfaceContract.privateApiRoutes}, refresh ${report.comparisonPacket.surfaceContract.refreshEndpoints}, privateGate ${report.comparisonPacket.surfaceContract.privateGateDefaultStatus}.`,
      `Receipts: runtime ${report.comparisonPacket.receipts.runtimeTruth || "missing"}, surface ${report.comparisonPacket.receipts.runtimeSurface || "missing"}, refresh ${report.comparisonPacket.receipts.evidenceRefresh || "missing"}.`,
      ...report.gates.map((gate) => `${gate.passed ? "pass" : "fail"} :: ${gate.id} :: ${gate.evidence}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "runtime-chain" || normalized === "runtime-evidence-chain" || normalized === "evidence-chain") {
    const report = currentRuntimeEvidenceChainReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} check(s), ${report.summary.chainLinks} link(s).`,
      `Packet: ${report.custodyPacket.packetId}; identity ${report.custodyPacket.identityHash}; ready ${report.summary.readyForManualRuntimeComparison}.`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Receipts: runtime ${report.custodyPacket.runtimeReceiptId || "missing"}, surface ${report.custodyPacket.surfaceReceiptId || "missing"}, refresh ${report.custodyPacket.refreshReceiptId || "missing"}, explain ${report.custodyPacket.explanationReceiptId || "missing"}, deploy ${report.custodyPacket.deployReadinessReceiptId || "missing"}.`,
      `Parity tripwires: ${report.summary.blockedParityClaims}/${report.summary.parityTripwires} hosted-parity claim(s) blocked; manual checks ${report.summary.manualParityChecks}.`,
      ...report.chainLinks.map((link) => `${link.blocking ? "block" : "pass"} :: ${link.id} :: ${link.score}/100 :: ${link.freshness}`),
      ...report.parityTripwires.slice(0, 3).map((tripwire) => `blocked :: ${tripwire.id} :: ${tripwire.replacementClaim}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "refresh") {
    const plan = evidenceRefreshPlan();
    const latest = readEvidenceRefreshReceipts(root)[0];
    return [
      `${plan.mode} :: ${plan.command}`,
      plan.sideEffectBoundary,
      `Endpoints: ${plan.endpoints.join(", ")}`,
      latest ? `Latest: ${latest.id} :: ${latest.summary.passing}/${latest.summary.total} passed` : "Latest: no refresh receipt yet",
    ].join("\n");
  }
  if (normalized === "a11y" || normalized === "accessibility") {
    const plan = accessibilityAuditPlan();
    const latest = readLatestAccessibilityAuditReport(root);
    return [
      `${plan.mode} :: ${plan.command}`,
      plan.limitation,
      `Checks: ${plan.checks.join(", ")}`,
      latest ? `Latest: ${latest.id} :: ${latest.summary.passing}/${latest.summary.total} passed` : "Latest: no accessibility report yet",
    ].join("\n");
  }
  if (normalized === "performance" || normalized === "perf") {
    const plan = performanceBudgetPlan();
    const latest = readPerformanceBudgetReports(root)[0];
    return [
      `${plan.mode} :: ${plan.command}`,
      plan.limitation,
      `Budgets: ${plan.budgets.map((budget) => `${budget.id}<${budget.budgetMs}ms`).join(", ")}`,
      latest ? `Latest: ${latest.id} :: ${latest.summary.passing}/${latest.summary.total} passed; slowest ${latest.summary.slowestMs}ms` : "Latest: no performance report yet",
    ].join("\n");
  }
  if (normalized === "visuals" || normalized === "visual" || normalized === "screenshots") {
    const plan = visualRegressionPlan();
    const latest = readVisualRegressionReports(root)[0];
    return [
      `${plan.mode} :: ${plan.command}`,
      plan.limitation,
      `Snapshots: ${plan.snapshots.map((snapshot) => snapshot.id).join(", ")}`,
      latest
        ? `Latest: ${latest.id} :: ${latest.summary.passing}/${latest.summary.total} passed; ${latest.summary.changed} changed`
        : "Latest: no visual regression report yet",
    ].join("\n");
  }
  if (normalized === "review" || normalized === "self-review") {
    const cadence = args[0] || "weekly";
    const report = currentSelfReviewReport(cadence, { preferReceipt: true });
    if (!report) return `No self-review cadence "${cadence}". Try: review weekly`;
    return [
      `${report.label} :: ${report.summary}`,
      `Evidence: ${report.evidenceCoverage.linkBackedClaims} link-backed, ${report.evidenceCoverage.sourceBackedClaims} source-backed, ${report.evidenceCoverage.needsSourceClaims} need source.`,
      `Proof repairs: ${report.proofRepairReview.graphResolvedPaths}/${report.proofRepairReview.graphRepairPaths} graph-resolved path(s); ${report.proofRepairReview.repairItems} repair item(s); ${report.proofRepairReview.opportunityUnlocks} opportunity unlock(s).`,
      `Freshness: ${report.freshnessReview.staleClaimCount} stale claim(s).`,
      `Opportunities: ${report.opportunityReview.slice(0, 3).map((opportunity) => `${opportunity.label} ${opportunity.fitScore}/100`).join("; ")}`,
      `Next: ${report.nextActions[0]?.action || "No next action generated."}`,
      `Uncertainty: ${report.uncertaintyDisclosure.noExternalApplications}`,
    ].join("\n");
  }
  if (normalized === "weaknesses" || normalized === "weakness") {
    const slug = args[0];
    const catalog = currentProjectWeaknessMap();
    if (!slug) {
      return [
        `${catalog.summary.projects} project weakness maps; ${catalog.summary.projectsWithHighRisk} high-risk project(s).`,
        ...catalog.projects
          .slice()
          .sort((left, right) => right.improvementActions.length - left.improvementActions.length)
          .slice(0, 6)
          .map((project) => `${project.title} :: ${project.riskLevel} :: ${project.improvementActions[0]?.action}`),
      ].join("\n");
    }
    const weakness = selectProjectWeakness(slug, catalog);
    if (!weakness) return `No project named "${slug}". Try: weaknesses qagent`;
    return [
      `${weakness.title} :: ${weakness.riskLevel} risk :: evidence ${weakness.evidenceScore}/100`,
      `${weakness.weakClaims.length} weak, ${weakness.staleClaims.length} stale, ${weakness.privateReferences.length} private, ${weakness.missingArtifacts.length} missing artifact(s).`,
      ...weakness.improvementActions.slice(0, 4).map((action) => `${action.priority} :: ${action.action}`),
    ].join("\n");
  }
  if (normalized === "skills" || normalized === "skill") {
    const value = args.join(" ");
    const catalog = currentSkillGapMap();
    if (!value) {
      return [
        `${catalog.summary.skills} skills mapped: ${catalog.summary.proven} proven, ${catalog.summary.claimed} claimed, ${catalog.summary.weak} weak, ${catalog.summary.missingProof} missing proof.`,
        ...catalog.skills.slice(0, 8).map((skill) => `${skill.label} :: ${skill.status} :: ${skill.projectCount} project(s)`),
      ].join("\n");
    }
    const skill = selectSkill(value, catalog);
    if (!skill) return `No skill named "${value}". Try: skills AI Agents`;
    return [
      `${skill.label} :: ${skill.status} :: ${skill.projectCount} project(s)`,
      `${skill.evidence.strongClaimCount} strong claims, ${skill.evidence.weakClaimCount} weak claims, ${skill.evidence.missingArtifactCount} missing artifact(s).`,
      ...skill.improvementActions.slice(0, 4).map((action) => `${action.priority} :: ${action.action}`),
    ].join("\n");
  }
  if (normalized === "contradictions" || normalized === "conflicts") {
    const report = currentContradictions();
    return [
      `${report.mode} :: ${report.summary.conflicts} conflict(s), ${report.summary.quarantinedClaims} quarantined claim(s), ${report.summary.highSeverity} high severity.`,
      report.conflicts.length
        ? report.conflicts.slice(0, 5).map((conflict) => `${conflict.severity} :: ${conflict.reason}`).join("\n")
        : "No active contradictions detected by the current local rules.",
      `Rules: ${report.rules.length}`,
    ].join("\n");
  }
  if (normalized === "changes" || normalized === "change-history") {
    const report = currentChangeHistoryReport({ preferSnapshot: true });
    return [
      `${report.mode} :: ${report.summary.changes} change(s); ${report.summary.storedSnapshots} stored snapshot(s).`,
      `Proof repairs: ${report.proofRepairNarrative.current}`,
      report.changes.slice(0, 4).map((change) => `${change.kind} :: ${change.label}`).join("\n"),
      `Record with: ${changeHistoryPlan().command}`,
    ].join("\n");
  }
  if (normalized === "trust-blockade" || normalized === "trust-frontier" || normalized === "blockade") {
    const report = currentTrustBlockadeReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.frontierItems} blocker(s), ${report.summary.families} family/families.`,
      `Proof repairs: ${report.summary.graphResolvedRepairPaths}/${report.summary.graphRepairPaths} graph path(s); ${report.summary.artifactRepairItems} repair item(s); opportunity blockers ${report.summary.opportunityBlockers}.`,
      `Runtime: ${report.summary.runtimeBlockingLinks} blocking link(s); weak claims ${report.summary.weakClaims}; screenshot gaps ${report.summary.screenshotGaps}.`,
      ...report.frontier.slice(0, 6).map((item) => `${item.priority} :: ${item.family} :: ${item.label} :: ${item.action}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "waves" || normalized === "wave") {
    const catalog = currentWaveBacklog();
    const number = args[0];
    if (!number) {
      return [
        `${catalog.mode} :: ${catalog.range.count} waves from ${catalog.range.start}-${catalog.range.end}.`,
        ...catalog.waves.slice(0, 5).map((wave) => `${wave.number} :: ${wave.title}`),
      ].join("\n");
    }
    const wave = selectWave(number, catalog);
    if (!wave) return `No derived wave "${number}". Try: waves 41`;
    return [
      `${wave.title} :: ${wave.theme}`,
      wave.rationale,
      `Acceptance: ${wave.acceptanceCriteria[0]}`,
      `Verify: ${wave.verificationCommands.join(" && ")}`,
    ].join("\n");
  }
  if (normalized === "graph-quality" || normalized === "graphcheck") {
    const report = currentGraphQualityReport({ preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.passing}/${report.summary.checks} checks passed; ${report.summary.nodes} nodes, ${report.summary.edges} edges.`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      ...report.checks.map((item) => `${item.passed ? "pass" : "fail"} :: ${item.id} :: ${item.detail}`),
    ].join("\n");
  }
  if (normalized === "graph-links" || normalized === "crosslinks") {
    const report = currentGraphCrosslinkReport({ preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.links} links; ${report.summary.relationTypes} relation type(s); confidence ${report.summary.averageConfidence}/100`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      ...report.relationTypes.map((item) => `${item.relation} :: ${item.count}`),
      `Guard: ${report.projectionGuard.privacyRule}`,
    ].join("\n");
  }
  if (normalized === "graph-scoreboard" || normalized === "graph-normalize" || normalized === "graph-score") {
    const report = currentGraphScoreboard({ preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.renderedEntityReferences}/${report.summary.modeledEntities} entity references rendered.`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Crosslinks: ${report.summary.crosslinksCanonicalCovered}/${report.summary.crosslinks} canonical, ${report.summary.crosslinksRenderedCovered}/${report.summary.crosslinks} rendered.`,
      `Quarantine: ${report.summary.quarantineCandidates} candidate(s), ${report.summary.highSeverityQuarantine} high severity.`,
      `Normalization ledger: ${report.summary.publicSafeNormalizationItems}/${report.summary.normalizationLedgerItems} public-safe; checks ${report.summary.passing}/${report.summary.checks}; thin ${report.summary.thinNormalizationFamilies}.`,
      ...report.normalizedTypes.slice(0, 5).map((item) => `${item.type} :: ${item.coverageScore}/100 :: ${item.renderedCount}/${item.inventoryCount}`),
      ...report.normalizationLedger.slice(0, 3).map((item) => `ledger :: ${item.type} :: ${item.canonicalIdRule}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "graph-lineage" || normalized === "lineage" || normalized === "evidence-lineage") {
    const report = currentGraphLineageReport({ preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.graphResolvedPaths}/${report.summary.lineagePaths} rendered path(s).`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Objections: ${report.summary.renderedObjections}/${report.summary.objections} rendered; unresolved evidence ${report.summary.unresolvedEvidenceRefs}.`,
      `Artifact gap repairs: ${report.summary.graphResolvedArtifactGapRepairPaths}/${report.summary.artifactGapRepairPaths} graph-resolved path(s) across ${report.summary.artifactGapRepairNodes} repair node(s).`,
      ...report.audiences.map((audience) => `${audience.id} :: ${audience.summary.rendered}/${audience.summary.objections} objection node(s), ${audience.summary.paths} path(s)`),
      ...report.artifactGapRepairLineage.paths
        .slice(0, 3)
        .map((path) => `repair-path :: ${path.gapNodeId || path.repairNodeId} :: ${path.graphResolved ? "graph-resolved" : "unresolved"} :: ${path.path.join(" -> ")}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "graph-guard" || normalized === "projection-guard" || normalized === "graph-projection") {
    const report = currentGraphProjectionGuardReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} guard(s) passing.`,
      `Relationships: ${report.summary.relationships}; rendered ${report.summary.renderedRelationships}; quarantined ${report.summary.quarantinedRelationships}; source missing ${report.summary.sourceMissing}.`,
      `Quarantine families: ${report.summary.quarantineFamilies}; latest receipt: ${report.summary.latestReceiptId || "none"}.`,
      ...report.checks.map((check) => `${check.passed ? "pass" : "fail"} :: ${check.id} :: ${check.detail}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "graph-disclosures" || normalized === "graph-disclosure" || normalized === "disclosure-links") {
    const report = currentGraphDisclosureLinksReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.relationships} relationship(s), ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      `Types: ${report.projectionGuard.requiredRelations.join(", ")}.`,
      `Confidence cap: ${report.summary.confidenceCapped ? "passing" : "failing"}.`,
      ...report.checks.map((check) => `${check.passed ? "pass" : "fail"} :: ${check.id} :: ${check.detail}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "graph-confidence" || normalized === "confidence-guard" || normalized === "graph-confidence-guard") {
    const report = currentGraphConfidenceReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.relationships} relationship(s), ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      `Families: ${report.summary.families}; relation types ${report.summary.relationTypes}; average confidence ${report.summary.averageConfidence}/100.`,
      `Caps: ${report.summary.cappedRelationships}/${report.summary.relationships}; public-safe ${report.summary.publicSafeRelationships}/${report.summary.relationships}.`,
      ...report.checks.slice(0, 6).map((check) => `${check.passed ? "pass" : "fail"} :: ${check.id} :: ${check.detail}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "graph-depth" || normalized === "graph-depth-score" || normalized === "evidence-depth") {
    const report = currentGraphDepthScoreReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passingLanes}/${report.summary.lanes} lane(s), ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      `Depth: ${report.summary.lineagePaths} lineage path(s), ${report.summary.disclosureRelationships} disclosure relationship(s), ${report.summary.confidenceRelationships} confidence relationship(s), ${report.summary.narrativeSequenceBeats} sequence beat(s).`,
      `Artifact gap repairs: ${report.summary.graphResolvedArtifactGapRepairPaths}/${report.summary.artifactGapRepairPaths} graph-resolved proof-repair path(s).`,
      `Manual narrative gates: readiness ${report.summary.manualNarrativeReadinessScore}/100; ready ${report.summary.manualNarrativeReady}; restricted ${report.summary.manualNarrativeRestricted}; blocked ${report.summary.manualNarrativeBlocked}; repair items ${report.summary.manualNarrativeRepairItems}.`,
      `Normalization: ${report.summary.normalizationScore}/100 with repair visibility preserved.`,
      ...report.lanes.map((lane) => `${lane.passed ? "pass" : "fail"} :: ${lane.id} :: ${lane.score}/100 :: ${lane.evidence}`),
      ...[
        ...report.depthSummaries.filter((summary) => summary.id === "artifact-gap-to-opportunity-repair"),
        ...report.depthSummaries.filter((summary) => summary.id !== "artifact-gap-to-opportunity-repair"),
      ]
        .slice(0, 4)
        .map((summary) => `summary :: ${summary.id} :: ${summary.status} :: ${summary.summary}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "evaluate" || normalized === "proof-quality" || normalized === "benchmark") {
    const report = currentProofQualityEvaluation({ preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      ...report.dimensions.map((item) => `${item.label} :: ${item.score}/100 ${item.band} :: ${item.detail}`),
      `Top risk: ${report.topRisks[0]?.label || "none"} :: ${report.topRisks[0]?.recommendation || "No recommendation."}`,
    ].join("\n");
  }
  if (normalized === "search-quality" || normalized === "search-eval" || normalized === "search-benchmark") {
    const report = currentSearchQualityEvaluation();
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.cases} case(s) passing.`,
      ...report.cases.slice(0, 5).map((item) => `${item.id} :: ${item.score}/100 ${item.band} :: ${item.results[0]?.slug || "no-result"}`),
      `Repair: ${typeof report.recommendations[0] === "string" ? report.recommendations[0] : report.recommendations[0]?.action || "No repair needed."}`,
    ].join("\n");
  }
  if (normalized === "claim-calibration" || normalized === "claims-calibration" || normalized === "claim-benchmark") {
    const report = currentClaimCalibrationReport({ preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Claims: ${report.summary.claims}; publish-ready ${report.summary.publishReady}; caveat ${report.summary.caveatRequired}; repair ${report.summary.repairRequired}.`,
      `Average claim score ${report.summary.averageClaimScore}/100; private references ${report.summary.privateReferences}.`,
      ...report.checks.slice(0, 5).map((check) => `${check.passed ? "pass" : "fail"} :: ${check.id} :: ${check.detail}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "opportunity-quality" || normalized === "opportunity-eval" || normalized === "opportunity-score") {
    const report = currentOpportunityQualityEvaluation({ preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.readyForManualUse}/${report.summary.packages} ready for manual use.`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      ...report.dimensions.map((item) => `${item.id} :: ${item.score}/100 ${item.band}`),
      `Top risk: ${report.topRisks[0]?.label || "none"} :: ${report.topRisks[0]?.recommendation || "No recommendation."}`,
    ].join("\n");
  }
  if (normalized === "opportunity-board" || normalized === "opportunity-brief" || normalized === "opportunity-readiness") {
    const board = currentOpportunityBoard({ preferReceipt: true });
    return [
      `${board.mode} :: ${board.summary.score}/100 ${board.summary.band}; ${board.summary.readyForManualReview}/${board.summary.packages} ready for manual review.`,
      `Receipt: ${board.summary.latestReceiptId || "none"}.`,
      `Gates: ${board.gates.map((gate) => `${gate.id}:${gate.count}`).join(", ")}.`,
      `Blockers: ${board.blockerQueue.filter((item) => item.priority === "high").length} high / ${board.blockerQueue.length} total.`,
      ...board.audienceLanes.map((lane) => `${lane.id} :: ${lane.averageReadiness}/100 :: ${lane.nextManualAction}`),
      `Next: ${board.nextAction}`,
    ].join("\n");
  }
  if (normalized === "opportunity-derisking" || normalized === "derisk-opportunities" || normalized === "derisk") {
    const report = currentOpportunityDeRiskingReport(undefined, { preferReceipt: true });
    const selected = args[0] ? selectOpportunityDeRisking(args[0], report) : null;
    if (args[0] && !selected) return `No opportunity de-risking plan "${args[0]}". Try: opportunity-derisking agent-infra-internship`;
    if (selected) {
      return [
        `${selected.label} :: risk ${selected.riskScore}/100 ${selected.riskBand}; residual ${selected.residualRisk}/100.`,
        `Gate: ${selected.current.gate}; go/no-go ${selected.manualGoNoGo.status}; blockers ${selected.current.blockers}; missing requirements ${selected.current.missingRequirements}.`,
        `Assumptions: ${selected.assumptionAudit.summary.verified}/${selected.assumptionAudit.summary.assumptions} verified; ${selected.claimFirewall.blockedClaims.length} blocked external claim(s).`,
        ...selected.deRiskSteps.map((step) => `${step.priority} :: ${step.id} :: ${step.action}`),
        ...selected.claimFirewall.blockedClaims.slice(0, 3).map((claim) => `blocked claim :: ${claim.assumptionId} :: ${claim.claim}`),
        `Next: ${selected.nextAction}`,
      ].join("\n");
    }
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.plans} plan(s), ${report.summary.highRiskPlans} high-risk.`,
      `Assumptions: ${report.summary.unverifiedAssumptions}/${report.summary.assumptionAudits} open; blocked external claims ${report.summary.blockedExternalClaims}; go/no-go manual ${report.summary.manualReviewOnlyPlans}, repair ${report.summary.repairFirstPlans}, internal ${report.summary.internalOnlyPlans}.`,
      `Artifact gaps: ${report.summary.artifactGapWorkItems} routed; ${report.summary.artifactGapHighPriorityItems} high priority; ${report.summary.artifactGapNarrativeBlockers} narrative blocker(s).`,
      `Queue: ${report.priorityQueue.slice(0, 3).map((item) => `${item.planId}:${item.action}`).join(" | ") || "empty"}`,
      `Gap queue: ${report.artifactGapQueue.slice(0, 3).map((item) => `${item.planId}:${item.project}`).join(" | ") || "empty"}`,
      `Latest receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "opportunity-ranking" || normalized === "opportunity-rank" || normalized === "rank-opportunities") {
    const report = currentOpportunityRankingReport({ preferReceipt: true });
    const selected = args[0] ? selectOpportunityRanking(args[0], report) : null;
    if (args[0] && !selected) return `No opportunity ranking "${args[0]}". Try: opportunity-ranking agent-infra-internship`;
    if (selected) {
      return [
        `${selected.label} :: rank ${selected.rank}; priority ${selected.priorityScore}/100 ${selected.priorityBand}; ${selected.recommendation}.`,
        `Effort/upside: ${selected.estimatedEffort}/${selected.expectedUpside}; gate ${selected.manualUseGate}; residual risk ${selected.residualRisk}/100.`,
        ...selected.missingProofPlan.slice(0, 5).map((step) => `${step.priority} :: ${step.source} :: ${step.action}`),
        `Next: ${selected.nextAction}`,
      ].join("\n");
    }
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.rankings} ranking(s), top ${report.summary.topOpportunityId}.`,
      `Lanes: ${report.decisionLanes.map((lane) => `${lane.id}:${lane.count}`).join(", ")}.`,
      `Portfolio: ${report.summary.portfolioSlots} slot(s), ${report.summary.manualOnlyPortfolioItems}/${report.summary.portfolioItems} manual-only, ${report.summary.blockedExternalPortfolioActions} external writes blocked.`,
      ...report.opportunityPortfolio.map((slot) => `${slot.id} :: ${slot.count} item(s) :: ${slot.allocationRule}`),
      `Queue: ${report.missingProofQueue.slice(0, 3).map((item) => `${item.opportunityId}:${item.action}`).join(" | ") || "empty"}`,
      `Latest receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "opportunity-scorecard" || normalized === "score-opportunities" || normalized === "opportunity-scoring") {
    const report = currentOpportunityScorecardReport({ preferReceipt: true });
    const selected = args[0] ? selectOpportunityScorecard(args[0], report) : null;
    if (args[0] && !selected) return `No opportunity scorecard "${args[0]}". Try: opportunity-scorecard agent-infra-internship`;
    if (selected) {
      return [
        `${selected.label} :: score ${selected.overallScore}/100 ${selected.band}; rank ${selected.scoreRank}; gate ${selected.decision.manualUseGate}.`,
        `Fit/readiness/quality/ranking: ${selected.fitScore}/${selected.readinessScore}/${selected.qualityScore}/${selected.rankingScore}.`,
        `Risk: residual ${selected.risk.residualRisk}/100 ${selected.risk.riskBand}; evidence ${selected.evidence.projects} project(s), ${selected.evidence.artifacts} artifact(s), ${selected.evidence.claims} claim(s).`,
        ...selected.repairActions.slice(0, 4).map((action) => `${action.priority} :: ${action.source} :: ${action.action}`),
        `Next: ${selected.nextAction}`,
      ].join("\n");
    }
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; engine ${report.summary.engineScore}/100; ${report.summary.scorecards} scorecard(s).`,
      `Top: ${report.summary.topOpportunityId} ${report.summary.topOverallScore}/100; ready ${report.summary.readyForManualReview}; blocked ${report.summary.blockedUntilProof}.`,
      `Bands: ${report.scoreBands.map((band) => `${band.band}:${band.count}`).join(", ")}.`,
      `Queue: ${report.repairQueue.slice(0, 3).map((item) => `${item.opportunityId}:${item.action}`).join(" | ") || "empty"}`,
      `Latest receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "usability-quality" || normalized === "usability-eval" || normalized === "ux-quality") {
    const report = currentUsabilityQualityEvaluation({ preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passingControls}/${report.summary.controlBenchmarks} control benchmark(s) passing.`,
      ...report.dimensions.map((item) => `${item.id} :: ${item.score}/100 ${item.band}`),
      `Top risk: ${report.topRisks[0]?.label || "none"} :: ${report.topRisks[0]?.recommendation || "No recommendation."}`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
    ].join("\n");
  }
  if (normalized === "design-stability" || normalized === "design-audit" || normalized === "ui-stability") {
    const report = currentDesignStabilityReport({ preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      `Controls: ${report.summary.terminalShortcuts} shortcut(s), ${report.summary.stableControlSignals}/${report.denseControls.length} stable signal(s).`,
      `Keyboard ${report.summary.keyboardScore}/100; mobile ${report.summary.mobileScore}/100; uncertainty ${report.summary.uncertaintyScore}/100.`,
      ...report.checks.slice(0, 5).map((check) => `${check.passed ? "pass" : "fail"} :: ${check.id} :: ${check.detail}`),
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "design-ambition" || normalized === "ambition-design" || normalized === "command-design") {
    const report = currentDesignAmbitionReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} check(s), ${report.summary.passingFamilies}/${report.summary.controlFamilies} family/families.`,
      `Shortcuts: ${report.summary.terminalShortcuts}; proof ribbon signals ${report.summary.proofRibbonSignals}; runtime chain ${report.summary.runtimeChainScore}/100.`,
      ...report.controlFamilies.map((family) => `${family.passed ? "pass" : "fail"} :: ${family.id} :: ${family.score}/100 :: ${family.evidence}`),
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "keyboard-readiness" || normalized === "keyboard" || normalized === "command-keyboard") {
    const report = currentKeyboardReadinessReport({ preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      `Skip links ${report.summary.skipLinks}; global shortcuts ${report.summary.globalShortcuts}; terminal shortcuts ${report.summary.terminalShortcuts}.`,
      `Mobile contract ${report.mobileContract.passed ? "passing" : "failing"}; uncertainty ${report.uncertaintyPreservation.passed ? "visible" : "repair"}.`,
      ...report.checks.slice(0, 5).map((check) => `${check.passed ? "pass" : "fail"} :: ${check.id} :: ${check.detail}`),
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "evaluation-integrity" || normalized === "eval-integrity" || normalized === "research-grade") {
    const report = currentEvaluationIntegrityReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      `Domains: ${report.summary.passingDomains}/${report.summary.domains}; proof ${report.summary.proofScore}/100, usability ${report.summary.usabilityScore}/100, design ${report.summary.designScore}/100.`,
      `Runtime ${report.summary.runtimeReconciliationScore}/100; stress ${report.summary.researchStressScore}/100; latest ${report.summary.latestReceiptId || "none"}.`,
      ...report.domains.map((domain) => `${domain.passed ? "pass" : "fail"} :: ${domain.id} :: ${domain.score}/100 ${domain.band}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "evaluation-sample" || normalized === "sample-evaluation" || normalized === "research-sample") {
    const report = currentEvaluationSampleReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.samples} sample(s), ${report.summary.domains} domain(s).`,
      `Seed: ${report.summary.sampleSeed}.`,
      `Coverage: route ${report.summary.routeCovered}; refresh ${report.summary.refreshCovered}; command ${report.summary.commandCovered}; latest ${report.summary.latestReceiptId || "none"}.`,
      ...report.samples.map((sample) => `${sample.passed ? "pass" : "fail"} :: ${sample.id} :: ${sample.score}/100 :: ${sample.detail}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "research-stress" || normalized === "evaluation-stress" || normalized === "stress-eval") {
    const report = currentResearchEvaluationStressReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.scenarios} scenario(s) passing.`,
      `Coverage: route ${report.summary.routeCovered}; refresh ${report.summary.refreshCovered}; proof actions ${report.summary.proofActionMinimum}; proof action scenario ${report.summary.proofActionScenarioPassing}; latest ${report.summary.latestReceiptId || "none"}.`,
      ...report.scenarios.map((scenario) => `${scenario.passed ? "pass" : "fail"} :: ${scenario.id} :: ${scenario.score}/100 :: ${scenario.detail}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "research-rigor" || normalized === "rigor" || normalized === "evaluation-rigor") {
    const report = currentResearchRigorReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.passing}/${report.summary.checks} check(s), ${report.summary.passingDimensions}/${report.summary.dimensions} dimension(s).`,
      `Stress ${report.summary.stressScore}/100; integrity ${report.summary.integrityScore}/100; runtime ${report.summary.runtimeChainScore}/100; design ${report.summary.designAmbitionScore}/100.`,
      `Gradebook ${report.summary.passingGradebookItems}/${report.summary.gradebookItems}; minimum ${report.summary.minimumGrade}; average ${report.summary.averageGradeScore}/100.`,
      ...report.evaluationGradebook.map((item) => `${item.passed ? "pass" : "fail"} :: ${item.id} :: ${item.grade} ${item.score}/100 floor ${item.floor}`),
      ...report.dimensions.map((dimension) => `${dimension.passed ? "pass" : "fail"} :: ${dimension.id} :: ${dimension.score}/100 :: ${dimension.detail}`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "narrative" || normalized === "narratives" || normalized === "grounding" || normalized === "narrative-grounding") {
    const report = currentNarrativeGroundingReport();
    const selected = args[0] ? selectGroundedNarrative(args[0], report) : null;
    if (args[0] && !selected) return `No grounded narrative "${args[0]}". Try: narrative recruiter`;
    if (selected) {
      return [
        `${selected.label} :: grounding ${selected.groundingScore}/100; packet confidence ${selected.confidenceBand}`,
        selected.sequence.map((step) => `${step.step}: ${step.text}`).join("\n"),
        `Claims: ${selected.claimsUsed.slice(0, 5).join(", ")}`,
        `Caveat: ${selected.uncertaintyDisclosure.caveats[0]}`,
      ].join("\n");
    }
    return [
      `${report.mode} :: ${report.summary.averageGroundingScore}/100 average grounding; ${report.summary.passing}/${report.summary.checks} check(s) passing.`,
      ...report.narratives.map((narrative) => `${narrative.id} :: ${narrative.groundingScore}/100 ${narrative.confidenceBand}`),
      `Latest receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "narrative-sequence" || normalized === "sequence-narratives" || normalized === "sequence") {
    const report = currentNarrativeSequenceReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    const selected = args[0] ? selectNarrativeSequence(args[0], report) : null;
    if (args[0] && !selected) return `No narrative sequence "${args[0]}". Try: narrative-sequence recruiter`;
    if (selected) {
      return [
        `${selected.label} :: ${selected.score}/100 ${selected.band}; ${selected.beatCount} beat(s); risk ${selected.riskLevel}.`,
        ...selected.beats.map((beat) => `${beat.order}. ${beat.id} :: ${beat.stage} :: ${beat.text}`),
        `Boundary: ${selected.beats[selected.beats.length - 1]?.manualUseBoundary}`,
        `Next: ${selected.nextAction}`,
      ].join("\n");
    }
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.audiences} audience(s), ${report.summary.totalBeats} beat(s).`,
      ...report.sequences.map((sequence) => `${sequence.id} :: ${sequence.score}/100 ${sequence.band} :: ${sequence.beatCount} beat(s), risk ${sequence.riskLevel}`),
      `Latest receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "narrative-contrast" || normalized === "contrast" || normalized === "switchboard") {
    const report = currentNarrativeContrastReport();
    const selected = args[0] ? selectNarrativeContrast(args[0], report) : null;
    if (args[0] && !selected) return `No narrative contrast "${args[0]}". Try: narrative-contrast recruiter-vs-professor`;
    if (selected) {
      return [
        `${selected.id} :: separation ${selected.separationScore}/100 ${selected.band}`,
        `Shared claims: ${selected.sharedClaims.length}; shared artifacts: ${selected.sharedArtifacts.length}.`,
        ...selected.contrastGuidance,
        `Disclosure: ${selected.disclosure[0]}`,
      ].join("\n");
    }
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.contrasts} contrast(s).`,
      ...report.contrasts.map((item) => `${item.id} :: ${item.separationScore}/100 ${item.band}`),
      `Switchboard: ${report.switchboard.map((item) => item.id).join(", ")}`,
      `Latest receipt: ${report.summary.latestReceiptId || "none"}.`,
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "narrative-objections" || normalized === "objections" || normalized === "pressure-test") {
    const report = currentNarrativeObjectionReport({ preferReceipt: true });
    const selected = args[0] ? selectNarrativeObjections(args[0], report) : null;
    if (args[0] && !selected) return `No narrative objection set "${args[0]}". Try: narrative-objections recruiter`;
    if (selected) {
      return [
        `${selected.label} :: answerability ${selected.answerabilityScore}/100 ${selected.riskLevel}; ${selected.objections.length} objection(s).`,
        ...selected.objections.slice(0, 4).map((item) => `${item.riskLevel} :: ${item.id} :: ${item.challenge} :: ${item.answer}`),
        `Safest use: ${selected.safestUse}`,
      ].join("\n");
    }
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.objections} objection(s), ${report.summary.highRiskObjections} high risk.`,
      `Receipt: ${report.summary.latestReceiptId || "none"}.`,
      ...report.audiences.map((item) => `${item.id} :: ${item.answerabilityScore}/100 ${item.riskLevel} :: ${item.disclosureChecklist.length} disclosure item(s)`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "narrative-tailor" || normalized === "tailor-narrative" || normalized === "tailor") {
    const report = currentNarrativeTailorReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    const selected = args[0] ? selectNarrativeTailoring(args[0], report) : null;
    if (args[0] && !selected) return `No tailored narrative "${args[0]}". Try: narrative-tailor recruiter`;
    if (selected) {
      return [
        `${selected.label} :: ${selected.score}/100 ${selected.band}; ${selected.variants.length} variant(s); external readiness ${selected.manualReadinessGate.status} (${selected.manualReadinessGate.score}/100), local review ${selected.manualReadinessGate.localReviewScore}/100, ${selected.manualReadinessGate.blockerCount} blocker(s).`,
        ...selected.variants.map((variant) => `${variant.id} :: ${variant.groundingScore}/100 :: ${variant.body}`),
        ...selected.manualReadinessGate.blockers.slice(0, 3).map((blocker) => `gate ${blocker.severity} :: ${blocker.id} :: ${blocker.repairAction}`),
        `Next: ${selected.nextAction}`,
      ].join("\n");
    }
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.variants} variant(s), ${report.summary.passing}/${report.summary.checks} check(s) passing; external readiness ${report.summary.manualReadinessReady} ready, ${report.summary.manualReadinessRestricted} restricted, ${report.summary.manualReadinessBlocked} blocked; local review ${report.summary.localReviewReady}/${report.summary.audiences} ready.`,
      ...report.audiences.map((audience) => `${audience.id} :: ${audience.score}/100 ${audience.band} :: ${audience.variants.length} variant(s) :: ${audience.manualReadinessGate.status} external, local ${audience.manualReadinessGate.localReviewScore}/100 (${audience.manualReadinessGate.blockerCount} blocker(s))`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "narrative-disclosure" || normalized === "disclose-narratives" || normalized === "disclosures") {
    const report = currentNarrativeDisclosureReport({ headers: { host: `localhost:${port}` } }, { preferReceipt: true });
    const selected = args[0] ? selectNarrativeDisclosure(args[0], report) : null;
    if (args[0] && !selected) return `No narrative disclosure "${args[0]}". Try: narrative-disclosure recruiter`;
    if (selected) {
      return [
        `${selected.label} :: ${selected.score}/100 ${selected.band}; risk ${selected.riskLevel}; ${selected.mustDisclose.length} disclosure item(s).`,
        `Safe use: ${selected.safeUse}`,
        ...selected.mustDisclose.slice(0, 5).map((item) => `disclose: ${item}`),
        `Repair: ${selected.repairGuidance[0]}`,
      ].join("\n");
    }
    return [
      `${report.mode} :: ${report.summary.score}/100 ${report.summary.band}; ${report.summary.audiences} audience(s), ${report.summary.totalMustDisclose} disclosure item(s).`,
      ...report.bundles.map((bundle) => `${bundle.id} :: ${bundle.score}/100 ${bundle.band} :: ${bundle.mustDisclose.length} disclosure(s), ${bundle.repairGuidance.length} repair(s)`),
      `Next: ${report.nextAction}`,
    ].join("\n");
  }
  if (normalized === "artifact-compare" || normalized === "compare-artifacts") {
    const comparison = currentArtifactComparison(args[0] || "qagent", args[1] || "flowpr");
    return [
      `${comparison.left.title} vs ${comparison.right.title} :: stronger proof ${comparison.comparison.strongerProof}; cleaner surface ${comparison.comparison.cleanerPublicSurface}.`,
      `Shared artifact types: ${comparison.comparison.sharedArtifactTypes.join(", ") || "none"}.`,
      `Gap delta: ${comparison.comparison.gapDelta}; confidence delta: ${comparison.comparison.confidenceDelta}.`,
      ...comparison.nextActions.slice(0, 4),
    ].join("\n");
  }
  if (normalized === "trial" || normalized === "proof-trial") {
    const slug = args[0] || "qagent";
    const trial = currentProofTrial(slug);
    if (!trial) return `No project named "${slug}". Try: trial qagent`;
    return [
      `${trial.title} :: ${trial.mode} :: ${trial.result.passed ? "passed" : "failed"}`,
      `Sandbox: ${trial.sandbox.runner}; credentials ${trial.sandbox.credentials}; writes ${trial.sandbox.allowedWrites}.`,
      `Guardrails: ${trial.guardrails.length}; steps: ${trial.steps.length}; artifacts: ${trial.artifacts.length}.`,
      ...trial.result.checks.map((check) => `${check.passed ? "pass" : "fail"} :: ${check.id} :: ${check.detail}`),
    ].join("\n");
  }
  if (normalized === "packet" || normalized === "packets") {
    const audience = args[0];
    const catalog = currentAudiencePackets();
    if (!audience) {
      return catalog.packets
        .map((packet) => `${packet.id} :: ${packet.label} :: confidence ${packet.uncertaintyDisclosure.confidenceScore}/100`)
        .join("\n");
    }
    const packet = selectAudiencePacket(audience, catalog);
    if (!packet) return `No packet named "${audience}". Try: packet recruiter`;
    return [
      `${packet.label} :: confidence ${packet.uncertaintyDisclosure.confidenceScore}/100 (${packet.uncertaintyDisclosure.confidenceBand})`,
      packet.thesis,
      `Projects: ${packet.recommendedProjectOrder.map((project) => project.title).join(", ")}`,
      `Uncertainty: ${packet.uncertaintyDisclosure.caveats.slice(0, 2).join(" ")}`,
      `Draft policy: ${packet.draftOnlyOutreach.sendPolicy}`,
    ].join("\n");
  }
  if (normalized === "claims") {
    const project = findProject(args[0]);
    if (project) return claimLines(claimsForProject(claimLedger, project.slug).map(publicClaim), 10);
    return claimSummaryLines().join("\n");
  }
  if (normalized === "verified") {
    const backed = claimLedger
      .map(publicClaim)
      .filter((claim) => claim.evidenceStrength === "link-backed" || claim.evidenceStrength === "source-backed")
      .sort((left, right) => right.confidenceScore - left.confidenceScore);
    return claimLines(backed, 8);
  }
  if (normalized === "stale") {
    const stale = currentTrustSummary().staleClaims;
    return stale.length ? claimLines(stale, 8) : "No stale claims under the current freshness policy.";
  }
  if (normalized === "demos") {
    return liveDemoChecks.map((check) => `${check.label} :: ${check.url}`).join("\n");
  }
  if (normalized === "evidence") {
    const project = findProject(args[0]);
    if (!project) return `No project named "${args[0] || ""}". Try: evidence qagent`;
    return projectEvidenceLines(project);
  }
  if (normalized === "risks") {
    const project = findProject(args[0]);
    if (!project) return `No project named "${args[0] || ""}". Try: risks qagent`;
    const needsSource = claimsForProject(claimLedger, project.slug).filter((claim) => claim.evidenceStrength === "needs-source");
    return [
      `${project.title} visibility: ${project.visibility}.`,
      needsSource.length
        ? `${needsSource.length} claims need stronger source attachment.`
        : "No unsupported project claims detected by the current ledger.",
      "Private references must stay public-safe until approved artifacts exist.",
    ].join("\n");
  }
  if (normalized === "opportunities") {
    return currentOpportunityRadar().opportunities
      .slice(0, 5)
      .map((opportunity) => `${opportunity.label} :: fit ${opportunity.fitScore}/100 :: ${opportunity.nextAction}`)
      .join("\n");
  }
  if (normalized === "opportunity-packages" || normalized === "opportunity-package" || normalized === "packages") {
    const catalog = currentOpportunityPackages();
    const selected = args[0] ? selectOpportunityPackage(args[0], catalog) : null;
    if (args[0] && !selected) return `No opportunity package "${args[0]}". Try: opportunity-package agent-infra-internship`;
    if (selected) {
      return [
        `${selected.label} :: readiness ${selected.readinessScore}/100 ${selected.readinessBand}; fit ${selected.fitScore}/100`,
        `Packet: ${selected.selectedPacketId || "none"} :: blockers ${selected.blockers.length} :: repair steps ${selected.proofRepairPlan.length}`,
        `Readiness: ${selected.packageReadiness.requirementsCovered}/${selected.packageReadiness.requirementsTotal} requirements; manualOnly=${selected.packageReadiness.manualOnly}; externalWrite=${selected.packageReadiness.externalWrite}`,
        `Decision: ${selected.decisionGate.readyForManualUse ? "manual-review-ready" : "repair-first"} :: ${selected.decisionGate.reason}`,
        ...selected.proofRepairPlan.slice(0, 3).map((item) => `${item.priority} repair :: ${item.action}`),
        ...selected.deRiskingChecklist.map((item) => `${item.status} :: ${item.label} :: ${item.reason}`),
      ].join("\n");
    }
    return [
      `${catalog.mode} :: ${catalog.summary.packages} packages; ${catalog.summary.readyForManualUse} ready for manual review; average readiness ${catalog.summary.averageReadiness}/100; repair steps ${catalog.summary.repairPlanItems}.`,
      catalog.manualOnlyPolicy,
      ...catalog.packages
        .slice(0, 6)
        .map((item) => `${item.id} :: ${item.readinessScore}/100 ${item.readinessBand} :: ${item.nextAction}`),
    ].join("\n");
  }
  if (normalized === "next") {
    return currentOpportunityRadar().nextActions
      .map((item) => `${item.id} :: ${item.action}`)
      .join("\n");
  }
  if (normalized === "fit") {
    const intent = args.join(" ") || "recruiter";
    const packet = currentAudiencePacket(intent);
    if (packet) {
      return packet.recommendedProjectOrder
        .slice(0, 4)
        .map((project) => `${project.title} :: ${project.reason} Confidence ${project.confidenceScore}/100.`)
        .join("\n");
    }
    return buildGuideAnswer(intent).results
      .slice(0, 4)
      .map((project) => `${project.title} :: ${project.explanation || project.outcome}`)
      .join("\n");
  }
  if (normalized === "random") {
    const project = projects[Math.floor(Math.random() * projects.length)];
    return `${project.title} :: ${project.summary}`;
  }
  if (normalized === "why") {
    const project = findProject(args[0]);
    if (!project) return `No project named "${args[0] || ""}". Try: why qagent`;
    return `${project.title}: ${project.why}`;
  }
  if (normalized === "stack") {
    const project = findProject(args[0]);
    if (!project) return `No project named "${args[0] || ""}". Try: stack qagent`;
    return `${project.title}: ${project.stack.join(", ")}`;
  }
  if (normalized === "compare") {
    const left = findProject(args[0]);
    const right = findProject(args[1]);
    if (!left || !right) return "Compare needs two known slugs. Try: compare qagent flowpr";
    return [
      `${left.title} (${left.score}) :: ${left.kind}`,
      `${right.title} (${right.score}) :: ${right.kind}`,
      left.score >= right.score
        ? `${left.title} is the stronger lead proof; ${right.title} is the supporting comparator.`
        : `${right.title} is the stronger lead proof; ${left.title} is the supporting comparator.`,
    ].join("\n");
  }
  if (normalized === "proof") {
    return profile.proof.join("\n");
  }
  if (normalized === "contact") {
    return `${profile.email}\n${profile.linkedin}\n${profile.github}`;
  }
  if (normalized === "open") {
    const slug = args[0];
    const project = findProject(slug);
    if (!project) return `No project named "${slug || ""}". Try: open qagent`;
    return project.repoUrl || project.liveUrl || `${project.title} is currently private; open the case study instead.`;
  }
  return help;
}

function timelineLines() {
  return [
    "2026-05 :: rishabhb.dev command center rewrite",
    "2026-04 :: FlowPR/QAgent polish, live QA proof loops",
    "2026-03 :: MasterBuild, RePro, ReFind, FairValue, ImmiFile run",
    "2025-10 :: SmartCane research, patent, COSITE publication track",
    "2024-07 :: Hey, Blue! production software work begins",
  ];
}

function findProject(slug) {
  return projects.find((item) => item.slug === slug);
}

async function statusPayload(baseUrl) {
  const targets = [
    ...(baseUrl ? internalChecks : []),
    ...domains,
    ...liveDemoChecks,
  ];
  const checks = await Promise.all(targets.map((target) => checkTarget(target, baseUrl)));
  return {
    checkedAt: new Date().toISOString(),
    checks,
  };
}

async function checkTarget(target, baseUrl) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  const url = baseUrl ? new URL(target.url, baseUrl).toString() : target.url;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "RishabhCommandCenter/1.0" },
    });
    return {
      ...target,
      url,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ...target,
      url,
      ok: false,
      status: "offline",
      ms: Date.now() - started,
      detail: error.name === "AbortError" ? "timeout" : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function currentStatusPayloadFromReceipt(receipt) {
  if (!receipt || !receipt.id || !receipt.summary || !Array.isArray(receipt.checks)) return null;
  return {
    checkedAt: receipt.checkedAt,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: "/api/status?refresh=1",
    recordEndpoint: "/api/status?record=1",
    receiptRecorded: false,
    receiptId: receipt.id,
    receiptSummary: receipt.summary,
    sourceBoundary:
      "This response serves the latest local status receipt. It is a fast public-safe cache of internal route, configured domain, live demo, and GitHub profile checks, not a fresh network probe.",
    sideEffectBoundary:
      "Default /api/status reads do not append receipts or mutate external systems. Use /api/status?refresh=1 or /api/status?record=1 to run live checks and write a new local receipt.",
    checks: receipt.checks,
  };
}

function decorateLiveStatusPayload(payload, receipt = null) {
  return {
    ...payload,
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: "/api/status?refresh=1",
    recordEndpoint: "/api/status?record=1",
    receiptRecorded: Boolean(receipt),
    receiptId: receipt?.id || null,
    receiptSummary:
      receipt?.summary || {
        total: payload.checks.length,
        passing: payload.checks.filter((check) => check.ok).length,
        failing: payload.checks.filter((check) => !check.ok).length,
        averageMs: payload.checks.length ? Math.round(payload.checks.reduce((sum, check) => sum + check.ms, 0) / payload.checks.length) : 0,
      },
    sourceBoundary:
      "This response ran live internal route, configured domain, live demo, and GitHub profile checks from the current server request context.",
    sideEffectBoundary:
      "This explicit refresh/record path writes a public-safe local status receipt only. It does not deploy, publish, mutate git history, unlock private cockpit data, collect analytics, or contact third-party write APIs.",
  };
}

function thumbnail(slug) {
  const project = projects.find((item) => item.slug === slug) || projects[0];
  const [a, b] = project.gradient;
  const title = escapeXml(project.title);
  const kind = escapeXml(project.kind);
  const tags = escapeXml(project.tags.slice(0, 3).join(" / "));
  const score = escapeXml(String(project.score));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760" role="img" aria-label="${title} preview"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="760" fill="#090d14"/><path d="M0 585C245 485 420 725 660 520s350-245 540-170v410H0z" fill="url(#g)" opacity=".5"/><rect x="72" y="82" width="1056" height="596" rx="22" fill="#0b111c" opacity=".9" stroke="#ffffff33"/><g font-family="Inter,Arial,sans-serif"><text x="108" y="238" fill="#f8fafc" font-size="78" font-weight="900">${title}</text><text x="112" y="304" fill="#cbd5e1" font-size="34" font-weight="700">${kind}</text><text x="112" y="406" fill="#94a3b8" font-size="25">${tags}</text><rect x="112" y="496" width="208" height="86" rx="14" fill="#ffffff16" stroke="#ffffff30"/><text x="138" y="532" fill="#94a3b8" font-size="18" font-weight="700">SIGNAL</text><text x="138" y="570" fill="#fff" font-size="36" font-weight="900">${score}/100</text></g><circle cx="805" cy="388" r="96" fill="url(#g)"/><path d="M743 388h124M805 326v124" stroke="#081016" stroke-width="15" stroke-linecap="round"/><text x="72" y="54" fill="#94a3b8" font-family="monospace" font-size="22">rishabhb.dev/projects/${escapeXml(slug)}</text></svg>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function serveStatic(req, res, pathname) {
  const route = pathname === "/" ? "/index.html" : pathname;
  let filePath;
  if (route === "/three-runtime" || route === "/vendor/three.module.js") {
    filePath = path.join(root, "node_modules", "three", "build", "three.module.js");
  } else if (route === "/app-runtime") {
    filePath = path.join(root, "command-center.mjs");
  } else {
    if (!publicStaticRoutes.has(route)) {
      notFound(res);
      return;
    }
    const relativeRoute = route.replace(/^\/+/, "");
    filePath = path.resolve(root, relativeRoute);
  }

  const relativePath = path.relative(root, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || !existsSync(filePath)) {
    notFound(res);
    return;
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    notFound(res);
    return;
  }

  const ext = route === "/three-runtime" || route === "/app-runtime" ? ".js" : path.extname(filePath);
  const contentType =
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    }[ext] || "application/octet-stream";

  res.writeHead(200, {
    ...securityHeaders,
    "Content-Type": contentType,
    "Cache-Control": route.startsWith("/vendor/") ? "public, max-age=31536000" : "no-cache",
  });
  createReadStream(filePath).pipe(res);
}

function startServer() {
  prewarmGuideAnswers();
  prewarmReceiptCaches();
  prewarmRuntimeTruth();

  return createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/projects") {
      json(
        res,
        buildProjectCatalogResponse(
          { projects, profile, archiveNotes },
          { detail: url.searchParams.get("detail") || "summary" },
        ),
      );
      return;
    }

    if (pathname === "/api/search") {
      json(
        res,
        buildSearchResponse(url.searchParams.get("q"), {
          detail: url.searchParams.get("detail") || "summary",
          limit: 8,
        }),
      );
      return;
    }

    if (pathname === "/api/guide") {
      json(
        res,
        buildGuideAnswer(url.searchParams.get("q"), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph") {
      const refreshRequested = ["1", "true", "live"].includes(url.searchParams.get("refresh"));
      json(
        res,
        buildGraphPayloadResponse(currentGraphPayload({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph/plan") {
      json(res, graphSnapshotPlan());
      return;
    }

    if (pathname === "/api/graph/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : detail === "full" ? 20 : 5;
      const historyWindow = readGraphSnapshotHistoryWindow(root, { limit: requestedLimit });
      json(
        res,
        buildGraphSnapshotHistory({
          ...historyWindow,
          limit: requestedLimit,
          detail,
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/claims/")) {
      const claimId = decodeURIComponent(pathname.slice("/api/claims/".length));
      const claim = publicClaimLedger.find((item) => item.id === claimId);
      if (!claim) {
        notFound(res);
        return;
      }
      json(res, {
        generatedAt: new Date().toISOString(),
        mode: "public-claim-detail",
        sourceBoundary:
          "This endpoint returns one public-safe claim projection from the local evidence ledger. It does not expose private source contents or external account data.",
        claim,
      });
      return;
    }

    if (pathname === "/api/claims") {
      const project = url.searchParams.get("project");
      const status = url.searchParams.get("status");
      const detail = String(url.searchParams.get("detail") || "").toLowerCase();
      let claims = claimLedger.map(publicClaim);
      if (project) claims = claims.filter((claim) => claim.relatedProject === project);
      if (status) claims = claims.filter((claim) => claim.evidenceStrength === status);
      json(res, buildClaimLedgerResponse({ claims, detail: detail === "full" || project || status ? "full" : "index" }));
      return;
    }

    if (pathname.startsWith("/api/evidence/")) {
      const project = findProject(pathname.split("/").pop());
      if (!project) {
        notFound(res);
        return;
      }
      json(res, buildProjectEvidenceResponse(evidenceForProject(project, claimLedger), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/trust") {
      json(res, buildTrustSummaryResponse(currentTrustSummary(), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/opportunities") {
      json(res, buildOpportunityRadarResponse(currentOpportunityRadar(), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/opportunity-packages") {
      const fullDetail = ["1", "true", "full"].includes(String(url.searchParams.get("detail") || "").toLowerCase());
      json(res, buildOpportunityPackagesResponse(currentOpportunityPackages(), { fullDetail }));
      return;
    }

    if (pathname === "/api/opportunity-board") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildOpportunityBoardResponse(currentOpportunityBoard({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/opportunity-board/")) {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      const report = currentOpportunityBoard({ preferReceipt: !refreshRequested });
      const selected = selectOpportunityBoardPackage(decodeURIComponent(pathname.split("/").pop() || ""), report, {
        detail: url.searchParams.get("detail") || "summary",
      });
      if (!selected) {
        notFound(res);
        return;
      }
      json(res, selected);
      return;
    }

    if (pathname === "/api/opportunity-derisking") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildOpportunityDeRiskingResponse(currentOpportunityDeRiskingReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/opportunity-derisking/plan") {
      json(res, opportunityDeRiskingPlan());
      return;
    }

    if (pathname === "/api/opportunity-derisking/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const historyWindow = readOpportunityDeRiskingHistoryWindow(root, { limit });
      json(res, buildOpportunityDeRiskingHistory({ ...historyWindow, limit, detail }));
      return;
    }

    if (pathname === "/api/opportunity-ranking") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildOpportunityRankingResponse(currentOpportunityRankingReport({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/opportunity-ranking/plan") {
      json(res, opportunityRankingPlan());
      return;
    }

    if (pathname === "/api/opportunity-ranking/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      const historyWindow = readOpportunityRankingHistoryWindow(root, { limit: requestedLimit });
      json(
        res,
        buildOpportunityRankingHistory({
          ...historyWindow,
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/opportunity-scorecard") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildOpportunityScorecardResponse(currentOpportunityScorecardReport({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/opportunity-scorecard/plan") {
      json(res, opportunityScorecardPlan());
      return;
    }

    if (pathname === "/api/opportunity-scorecard/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : opportunityScorecardHistoryLimit;
      json(
        res,
        buildOpportunityScorecardHistory({
          ...readOpportunityScorecardHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/opportunity-scorecard/")) {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      const scorecard = currentOpportunityScorecard(pathname.split("/").pop(), { preferReceipt: !refreshRequested });
      if (!scorecard) {
        notFound(res);
        return;
      }
      json(res, buildOpportunityScorecardDetailResponse(scorecard, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname.startsWith("/api/opportunity-ranking/")) {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      const ranking = currentOpportunityRanking(pathname.split("/").pop(), { preferReceipt: !refreshRequested });
      if (!ranking) {
        notFound(res);
        return;
      }
      json(
        res,
        buildOpportunityRankingDetailResponse(ranking, {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/opportunity-derisking/")) {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      const plan = currentOpportunityDeRisking(pathname.split("/").pop(), req, { preferReceipt: !refreshRequested });
      if (!plan) {
        notFound(res);
        return;
      }
      json(res, buildOpportunityDeRiskingPlanResponse(plan, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname.startsWith("/api/opportunity-packages/")) {
      const opportunityPackage = currentOpportunityPackage(pathname.split("/").pop());
      if (!opportunityPackage) {
        notFound(res);
        return;
      }
      json(res, buildOpportunityPackageDetailResponse(opportunityPackage, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/artifacts") {
      json(res, buildArtifactCatalogResponse(currentArtifactCatalog(), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/artifact-collections") {
      json(
        res,
        buildArtifactCollectionsResponse(currentArtifactCollections(), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/artifact-collections/")) {
      const collection = currentArtifactCollection(pathname.split("/").pop());
      if (!collection) {
        notFound(res);
        return;
      }
      json(res, buildArtifactCollectionDetailResponse(collection, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/artifact-transcripts") {
      json(res, buildArtifactTranscriptLibraryResponse(currentArtifactTranscripts(), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/artifact-museum/plan") {
      json(res, artifactMuseumPlan());
      return;
    }

    if (pathname === "/api/artifact-museum/history") {
      const receipts = readArtifactMuseumReceipts(root);
      json(
        res,
        buildArtifactMuseumHistory({
          receipts,
          limit: url.searchParams.get("limit") || 5,
          totalAvailable: receipts.length,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/artifact-museum") {
      json(res, buildArtifactMuseumResponse(currentArtifactMuseumAudit(), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/artifact-museum-compare/plan") {
      json(res, artifactMuseumComparisonPlan());
      return;
    }

    if (pathname === "/api/artifact-museum-compare/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const receipts = readArtifactMuseumComparisonReceipts(root);
      json(res, buildArtifactMuseumComparisonHistory({ receipts, limit, totalAvailable: receipts.length, detail }));
      return;
    }

    if (pathname === "/api/artifact-museum-compare") {
      const left = url.searchParams.get("left");
      const right = url.searchParams.get("right");
      const report = currentArtifactMuseumComparisonReport();
      if (left && right) {
        const pair = selectArtifactMuseumComparisonPair(left, right, report);
        if (!pair) {
          notFound(res);
          return;
        }
        const fullDetail = String(url.searchParams.get("detail") || "").toLowerCase() === "full";
        json(res, {
          ...buildArtifactMuseumComparisonResponse(report, { detail: url.searchParams.get("detail") || "summary" }),
          selectedComparison: fullDetail ? pair : summarizeArtifactMuseumComparisonPair(pair),
        });
        return;
      }
      json(res, buildArtifactMuseumComparisonResponse(report, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/artifact-replays") {
      json(res, currentArtifactReplayIndex({ detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname.startsWith("/api/artifact-replays/")) {
      const replay = currentArtifactReplay(pathname.split("/").pop());
      if (!replay) {
        notFound(res);
        return;
      }
      json(res, buildArtifactReplayDetailResponse(replay, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/artifact-gaps") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildArtifactGapWorkbenchResponse(currentArtifactGapWorkbench(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/artifact-gaps/plan") {
      json(res, artifactGapWorkbenchPlan());
      return;
    }

    if (pathname === "/api/artifact-gaps/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const receipts = readArtifactGapReceipts(root);
      json(
        res,
        buildArtifactGapHistory({
          receipts,
          limit,
          totalAvailable: receipts.length,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/artifact-gap-repair") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildArtifactGapProofRepairResponse(currentArtifactGapProofRepairQueue(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/artifact-gap-repair/plan") {
      json(res, artifactGapProofRepairPlan());
      return;
    }

    if (pathname === "/api/artifact-gap-repair/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : detail === "full" ? 20 : 2;
      const receipts = readArtifactGapRepairReceipts(root);
      const numericLimit = Number(requestedLimit);
      const limit = Number.isFinite(numericLimit) ? Math.max(1, Math.min(Math.trunc(numericLimit), 50)) : detail === "full" ? 20 : 2;
      json(
        res,
        buildArtifactGapRepairHistory({
          receipts: receipts.slice(0, limit),
          limit,
          totalAvailable: receipts.length,
          detail,
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/artifact-transcripts/")) {
      const transcript = currentArtifactTranscript(pathname.split("/").pop());
      if (!transcript) {
        notFound(res);
        return;
      }
      json(res, buildArtifactTranscriptDetailResponse(transcript, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/intents") {
      json(res, buildIntentPathsResponse(currentIntentPaths(), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/maintenance") {
      json(res, buildMaintenanceReportResponse(currentMaintenanceReport(), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/runtime-truth") {
      json(res, runtimeTruth(req));
      return;
    }

    if (pathname === "/api/runtime-truth/plan") {
      json(res, runtimeTruthPlan());
      return;
    }

    if (pathname === "/api/runtime-truth/fingerprint") {
      const report = currentRuntimeTruthReport(req);
      if (url.searchParams.get("record") === "1") {
        const receipt = appendRuntimeTruthReceipt(root, report);
        json(res, { ...report, receipt });
        return;
      }
      json(res, buildRuntimeTruthResponse(report, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/runtime-truth/history") {
      const detail = url.searchParams.get("detail") || "summary";
      const fullDetail = String(detail).toLowerCase() === "full";
      const limit = url.searchParams.get("limit") || (fullDetail ? 20 : 5);
      const historyWindow = readRuntimeTruthHistoryWindow(root, { limit });
      json(res, buildRuntimeTruthHistory({ ...historyWindow, limit, detail }));
      return;
    }

    if (pathname === "/api/runtime-truth/attestation") {
      json(res, buildRuntimeAttestationResponse(currentRuntimeAttestation(req), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/runtime-surface/plan") {
      json(
        res,
        buildRuntimeSurfacePlanResponse({
          routeManifest: runtimeRouteManifest(),
          detail: (url.searchParams.get("detail") || "summary").toLowerCase(),
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-surface" || pathname === "/api/runtime-surface/latest") {
      json(res, currentRuntimeSurfaceLatest({ detail: (url.searchParams.get("detail") || "summary").toLowerCase() }));
      return;
    }

    if (pathname === "/api/runtime-surface/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const historyWindow = readRuntimeSurfaceHistoryWindow(root, { limit });
      json(
        res,
        buildRuntimeSurfaceHistory({
          ...historyWindow,
          limit,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/route-latency/plan") {
      json(res, buildRouteLatencyPlanResponse(routeLatencyPlan(runtimeRouteManifest()), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/route-latency") {
      json(res, currentRouteLatencyReport({ detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/route-latency/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      const historyWindow = readRouteLatencyHistoryWindow(root, { limit: requestedLimit });
      json(
        res,
        buildRouteLatencyHistory({
          ...historyWindow,
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-boundary") {
      const refreshRequested = ["1", "true", "live"].includes(url.searchParams.get("refresh"));
      json(
        res,
        buildRuntimeBoundaryReportResponse(currentRuntimeBoundaryReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-boundary/plan") {
      json(res, runtimeBoundaryPlan());
      return;
    }

    if (pathname === "/api/runtime-boundary/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : runtimeBoundaryHistoryLimit;
      json(
        res,
        buildRuntimeBoundaryHistory({
          ...readRuntimeBoundaryHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-reconciliation") {
      const refreshRequested = ["1", "true", "live"].includes(url.searchParams.get("refresh"));
      json(
        res,
        buildRuntimeReconciliationResponse(currentRuntimeReconciliationReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-diff") {
      const refreshRequested = ["1", "true", "live"].includes((url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildRuntimeDiffResponse(currentRuntimeDiffReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-diff/plan") {
      json(res, runtimeDiffPlan());
      return;
    }

    if (pathname === "/api/runtime-diff/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : detail === "full" ? 20 : runtimeDiffHistoryLimit;
      json(
        res,
        buildRuntimeDiffHistory({
          ...readRuntimeDiffHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-explain") {
      const refreshRequested = ["1", "true", "live"].includes((url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildRuntimeExplanationResponse(currentRuntimeExplanationReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-explain/plan") {
      json(res, runtimeExplainPlan());
      return;
    }

    if (pathname === "/api/runtime-explain/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : detail === "full" ? 20 : runtimeExplainHistoryLimit;
      json(
        res,
        buildRuntimeExplanationHistory({
          ...readRuntimeExplainHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-deploy-readiness") {
      const refreshRequested = ["1", "true", "live"].includes((url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildRuntimeDeployReadinessResponse(currentRuntimeDeployReadinessReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-deploy-readiness/plan") {
      json(res, runtimeDeployReadinessPlan());
      return;
    }

    if (pathname === "/api/runtime-deploy-readiness/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : runtimeDeployReadinessHistoryLimit);
      const historyWindow = readRuntimeDeployReadinessHistoryWindow(root, { limit });
      json(res, buildRuntimeDeployReadinessHistory({ ...historyWindow, limit, detail }));
      return;
    }

    if (pathname === "/api/runtime-evidence-chain") {
      const refreshRequested = ["1", "true", "live"].includes((url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildRuntimeEvidenceChainResponse(currentRuntimeEvidenceChainReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/runtime-evidence-chain/plan") {
      json(res, runtimeEvidenceChainPlan());
      return;
    }

    if (pathname === "/api/runtime-evidence-chain/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const historyLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : detail === "full" ? 20 : runtimeEvidenceChainHistoryLimit;
      json(
        res,
        buildRuntimeEvidenceChainHistory({
          ...readRuntimeEvidenceChainHistoryWindow(root, { limit: historyLimit }),
          limit: historyLimit,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/design-stability") {
      const refreshRequested = ["1", "true", "live"].includes((url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildDesignStabilityResponse(currentDesignStabilityReport({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/design-stability/plan") {
      json(res, designStabilityPlan());
      return;
    }

    if (pathname === "/api/design-stability/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : designStabilityHistoryLimit;
      json(
        res,
        buildDesignStabilityHistory({
          ...readDesignStabilityHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/keyboard-readiness") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildKeyboardReadinessResponse(currentKeyboardReadinessReport({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/keyboard-readiness/plan") {
      json(res, keyboardReadinessPlan());
      return;
    }

    if (pathname === "/api/keyboard-readiness/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : keyboardReadinessHistoryLimit;
      json(
        res,
        buildKeyboardReadinessHistory({
          ...readKeyboardReadinessHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/design-ambition") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildDesignAmbitionResponse(currentDesignAmbitionReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/design-ambition/plan") {
      json(res, designAmbitionPlan());
      return;
    }

    if (pathname === "/api/design-ambition/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : designAmbitionHistoryLimit;
      json(
        res,
        buildDesignAmbitionHistory({
          ...readDesignAmbitionHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/integrity") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildEvaluationIntegrityResponse(currentEvaluationIntegrityReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/integrity/plan") {
      json(res, evaluationIntegrityPlan());
      return;
    }

    if (pathname === "/api/evaluation/integrity/history") {
      const receipts = readEvaluationIntegrityReceipts(root);
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      json(
        res,
        buildEvaluationIntegrityHistory({
          receipts,
          limit: requestedLimit,
          totalAvailable: receipts.length,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/research-rigor") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildResearchRigorResponse(currentResearchRigorReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/research-rigor/plan") {
      json(res, researchRigorPlan());
      return;
    }

    if (pathname === "/api/evaluation/research-rigor/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const historyWindow = readResearchRigorHistoryWindow(root, { limit });
      json(res, buildResearchRigorHistory({ ...historyWindow, limit, detail }));
      return;
    }

    if (pathname === "/api/evaluation/sample") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildEvaluationSampleResponse(currentEvaluationSampleReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/sample/plan") {
      json(res, evaluationSamplePlan());
      return;
    }

    if (pathname === "/api/evaluation/sample/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      const historyWindow = readEvaluationSampleHistoryWindow(root, { limit: requestedLimit });
      json(
        res,
        buildEvaluationSampleHistory({
          ...historyWindow,
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evidence-refresh/plan") {
      json(res, evidenceRefreshPlan());
      return;
    }

    if (pathname === "/api/evidence-refresh/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      json(
        res,
        buildEvidenceRefreshHistory({
          ...readEvidenceRefreshHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/accessibility-audit/plan") {
      json(res, accessibilityAuditPlan());
      return;
    }

    if (pathname === "/api/accessibility-audit/history") {
      const historyWindow = readAccessibilityAuditHistoryWindow(root, { limit: url.searchParams.get("limit") || 20 });
      json(res, buildAccessibilityAuditHistory({ ...historyWindow, limit: url.searchParams.get("limit") || 20, detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/performance-budget/plan") {
      json(res, performanceBudgetPlan());
      return;
    }

    if (pathname === "/api/performance-budget/history") {
      json(res, { reports: readPerformanceBudgetReports(root).slice(0, 20) });
      return;
    }

    if (pathname === "/api/visual-regression/plan") {
      json(res, visualRegressionPlan());
      return;
    }

    if (pathname === "/api/visual-regression/history") {
      const reports = readVisualRegressionReports(root);
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      json(
        res,
        buildVisualRegressionHistory({
          reports,
          limit: requestedLimit,
          totalAvailable: reports.length,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/research-stress/plan") {
      json(res, researchEvaluationStressPlan());
      return;
    }

    if (pathname === "/api/evaluation/research-stress/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      json(
        res,
        buildResearchEvaluationStressHistory({
          ...readResearchEvaluationStressHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/narrative-tailor/plan") {
      json(res, narrativeTailorPlan());
      return;
    }

    if (pathname === "/api/narrative-tailor/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : detail === "full" ? 20 : narrativeTailorHistoryLimit;
      json(
        res,
        buildNarrativeTailorHistory({
          ...readNarrativeTailorHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/narrative-disclosure/plan") {
      json(res, narrativeDisclosurePlan());
      return;
    }

    if (pathname === "/api/narrative-disclosure/history") {
      const detail = url.searchParams.get("detail") || "summary";
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : detail === "full" ? 20 : narrativeDisclosureHistoryLimit;
      json(
        res,
        buildNarrativeDisclosureHistory({
          ...readNarrativeDisclosureHistoryWindow(root, { limit: requestedLimit }),
          limit: requestedLimit,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/narrative-sequence/plan") {
      json(res, narrativeSequencePlan());
      return;
    }

    if (pathname === "/api/narrative-sequence/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : detail === "full" ? 20 : 5;
      const historyWindow = readNarrativeSequenceHistoryWindow(root, { limit: requestedLimit });
      json(
        res,
        buildNarrativeSequenceHistory({
          ...historyWindow,
          limit: requestedLimit,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/graph-disclosure-links/plan") {
      json(res, graphDisclosureLinksPlan());
      return;
    }

    if (pathname === "/api/graph-disclosure-links/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : detail === "full" ? 20 : 3;
      const historyWindow = readGraphDisclosureLinksHistoryWindow(root, { limit: requestedLimit });
      json(res, buildGraphDisclosureLinksHistory({ ...historyWindow, limit: requestedLimit, detail }));
      return;
    }

    if (pathname === "/api/graph-projection-guard/plan") {
      json(res, graphProjectionGuardPlan());
      return;
    }

    if (pathname === "/api/graph-projection-guard/history") {
      const detail = url.searchParams.get("detail") || "summary";
      const fullDetail = String(detail).toLowerCase() === "full";
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : fullDetail ? 20 : graphProjectionGuardHistoryLimit;
      const historyWindow = readGraphProjectionGuardHistoryWindow(root, { limit: requestedLimit });
      json(res, buildGraphProjectionGuardHistory({ ...historyWindow, limit: requestedLimit, detail }));
      return;
    }

    if (pathname === "/api/graph-confidence/plan") {
      json(res, graphConfidencePlan());
      return;
    }

    if (pathname === "/api/graph-confidence/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const historyWindow = readGraphConfidenceHistoryWindow(root, { limit });
      json(res, buildGraphConfidenceHistory({ ...historyWindow, limit, detail }));
      return;
    }

    if (pathname === "/api/graph-depth-score/plan") {
      json(res, graphDepthScorePlan());
      return;
    }

    if (pathname === "/api/graph-depth-score/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      const historyWindow = readGraphDepthScoreHistoryWindow(root, { limit: requestedLimit });
      json(
        res,
        buildGraphDepthScoreHistory({
          ...historyWindow,
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/proof-trials") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      if (detail === "full") {
        json(res, { ...currentProofTrials(), detail: "full", compact: false, fullDetailEndpoint: "/api/proof-trials/:slug" });
      } else {
        json(res, currentProofTrialsIndex());
      }
      return;
    }

    if (pathname === "/api/proof-trials/plan") {
      json(res, proofTrialsPlan());
      return;
    }

    if (pathname === "/api/proof-trials/history") {
      json(
        res,
        buildProofTrialHistory({
          receipts: readProofTrialReceipts(root),
          limit: url.searchParams.get("limit") || 5,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/proof-trials/")) {
      const trial = currentProofTrial(pathname.split("/").pop());
      if (!trial) {
        notFound(res);
        return;
      }
      json(res, buildProofTrialDetailResponse(trial, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/packets") {
      json(res, buildAudiencePacketsResponse(currentAudiencePackets(), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname.startsWith("/api/packets/")) {
      const packet = currentAudiencePacket(pathname.split("/").pop());
      if (!packet) {
        notFound(res);
        return;
      }
      json(res, buildAudiencePacketDetailResponse(packet, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/narratives") {
      json(res, buildNarrativeGroundingResponse(currentNarrativeGroundingReport(), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/narratives/plan") {
      json(res, narrativeGroundingPlan());
      return;
    }

    if (pathname === "/api/narratives/history") {
      const detail = url.searchParams.get("detail") || "summary";
      const fullDetail = String(detail).toLowerCase() === "full";
      const limit = url.searchParams.get("limit") || (fullDetail ? 20 : 5);
      const receipts = readNarrativeGroundingReceipts(root);
      json(res, buildNarrativeGroundingHistory({ receipts, limit, totalAvailable: receipts.length, detail }));
      return;
    }

    if (pathname === "/api/narrative-contrast") {
      json(
        res,
        buildNarrativeContrastResponse(currentNarrativeContrastReport(), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/narrative-contrast/plan") {
      json(res, narrativeContrastPlan());
      return;
    }

    if (pathname === "/api/narrative-contrast/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const receipts = readNarrativeContrastReceipts(root);
      json(res, buildNarrativeContrastHistory({ receipts, limit, totalAvailable: receipts.length, detail }));
      return;
    }

    if (pathname.startsWith("/api/narrative-contrast/")) {
      const contrast = currentNarrativeContrast(pathname.split("/").pop());
      if (!contrast) {
        notFound(res);
        return;
      }
      json(res, buildNarrativeContrastDetailResponse(contrast, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/narrative-objections") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildNarrativeObjectionResponse(currentNarrativeObjectionReport({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/narrative-objections/plan") {
      json(res, narrativeObjectionPlan());
      return;
    }

    if (pathname === "/api/narrative-objections/history") {
      const receipts = readNarrativeObjectionReceipts(root);
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      json(
        res,
        buildNarrativeObjectionHistory({
          receipts,
          limit,
          totalAvailable: receipts.length,
          detail,
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/narrative-objections/")) {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      const objections = currentNarrativeObjections(pathname.split("/").pop(), { preferReceipt: !refreshRequested });
      if (!objections) {
        notFound(res);
        return;
      }
      json(res, buildNarrativeObjectionAudienceResponse(objections, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/narrative-tailor") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildNarrativeTailorResponse(currentNarrativeTailorReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/narrative-disclosure") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildNarrativeDisclosureResponse(currentNarrativeDisclosureReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/narrative-sequence") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildNarrativeSequenceResponse(currentNarrativeSequenceReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph-disclosure-links") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildGraphDisclosureLinksResponse(currentGraphDisclosureLinksReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph-confidence") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildGraphConfidenceResponse(currentGraphConfidenceReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph-depth-score") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildGraphDepthScoreResponse(currentGraphDepthScoreReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/narrative-disclosure/")) {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      const disclosure = currentNarrativeDisclosure(pathname.split("/").pop(), req, { preferReceipt: !refreshRequested });
      if (!disclosure) {
        notFound(res);
        return;
      }
      json(
        res,
        buildNarrativeDisclosureAudienceResponse(disclosure, {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/narrative-sequence/")) {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      const sequence = currentNarrativeSequence(pathname.split("/").pop(), req, { preferReceipt: !refreshRequested });
      if (!sequence) {
        notFound(res);
        return;
      }
      json(
        res,
        buildNarrativeSequenceAudienceResponse(sequence, {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/narrative-tailor/")) {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      const tailored = currentNarrativeTailoring(pathname.split("/").pop(), req, { preferReceipt: !refreshRequested });
      if (!tailored) {
        notFound(res);
        return;
      }
      json(res, buildNarrativeTailorAudienceResponse(tailored, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname.startsWith("/api/narratives/")) {
      const narrative = currentGroundedNarrative(pathname.split("/").pop());
      if (!narrative) {
        notFound(res);
        return;
      }
      json(res, buildGroundedNarrativeDetailResponse(narrative, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/self-review/plan") {
      json(res, selfReviewPlan());
      return;
    }

    if (pathname === "/api/self-review/history") {
      const requestedLimit = url.searchParams.get("limit") || 5;
      const detail = url.searchParams.get("detail") || "summary";
      const historyWindow = readSelfReviewHistoryWindow(root, { limit: requestedLimit });
      json(res, buildSelfReviewHistory({ ...historyWindow, limit: requestedLimit, detail }));
      return;
    }

    if (pathname === "/api/self-review") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildSelfReviewResponse(currentSelfReviewReports({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/self-review/")) {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      const report = currentSelfReviewReport(pathname.split("/").pop(), { preferReceipt: !refreshRequested });
      if (!report) {
        notFound(res);
        return;
      }
      json(res, buildSelfReviewReportResponse(report, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/weaknesses") {
      json(
        res,
        buildProjectWeaknessMapResponse(currentProjectWeaknessMap(), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/weaknesses/")) {
      const weakness = currentProjectWeakness(pathname.split("/").pop());
      if (!weakness) {
        notFound(res);
        return;
      }
      json(res, buildProjectWeaknessDetailResponse(weakness, { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/skill-gaps") {
      json(
        res,
        buildSkillGapMapResponse(currentSkillGapMap(), {
          detail: url.searchParams.get("detail") || "summary",
          previewLimit: url.searchParams.get("limit") || undefined,
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/skill-gaps/")) {
      const skill = currentSkill(decodeURIComponent(pathname.split("/").pop()));
      if (!skill) {
        notFound(res);
        return;
      }
      json(res, skill);
      return;
    }

    if (pathname === "/api/contradictions") {
      json(res, currentContradictions());
      return;
    }

    if (pathname === "/api/change-history/plan") {
      json(res, changeHistoryPlan());
      return;
    }

    if (pathname === "/api/change-history/history") {
      json(res, { snapshots: readChangeHistory(root).slice(0, 20) });
      return;
    }

    if (pathname === "/api/change-history") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildChangeHistoryResponse(currentChangeHistoryReport({ preferSnapshot: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/trust-blockade") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildTrustBlockadeReportResponse(currentTrustBlockadeReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/trust-blockade/plan") {
      json(res, trustBlockadePlan());
      return;
    }

    if (pathname === "/api/trust-blockade/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const receipts = readTrustBlockadeReceipts(root);
      json(
        res,
        buildTrustBlockadeHistory({
          receipts: receipts.slice(0, Math.max(1, Math.min(Number(limit) || 5, 50))),
          totalAvailable: receipts.length,
          limit,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/waves") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      json(res, buildWaveBacklogIndex(currentWaveBacklog(), { detail: detail === "full-index" || detail === "full" ? "index" : "summary" }));
      return;
    }

    if (pathname.startsWith("/api/waves/")) {
      const wave = selectWave(pathname.split("/").pop(), currentWaveBacklog());
      if (!wave) {
        notFound(res);
        return;
      }
      json(res, wave);
      return;
    }

    if (pathname === "/api/graph-quality") {
      const refreshRequested = ["1", "true", "live"].includes(url.searchParams.get("refresh"));
      json(
        res,
        buildGraphQualityResponse(currentGraphQualityReport({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph-quality/plan") {
      json(res, graphQualityPlan());
      return;
    }

    if (pathname === "/api/graph-quality/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      const historyWindow = readGraphQualityHistoryWindow(root, { limit: requestedLimit });
      json(res, buildGraphQualityHistory({ ...historyWindow, limit: requestedLimit, detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/graph-crosslinks") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildGraphCrosslinkResponse(currentGraphCrosslinkReport({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph-crosslinks/plan") {
      json(res, graphCrosslinkPlan());
      return;
    }

    if (pathname === "/api/graph-crosslinks/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      const historyWindow = readGraphCrosslinkHistoryWindow(root, { limit: requestedLimit });
      json(
        res,
        buildGraphCrosslinkHistory({
          ...historyWindow,
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph-scoreboard") {
      const refreshRequested = ["1", "true", "live"].includes(url.searchParams.get("refresh"));
      json(
        res,
        buildGraphScoreboardResponse(currentGraphScoreboard({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph-scoreboard/plan") {
      json(res, graphScoreboardPlan());
      return;
    }

    if (pathname === "/api/graph-scoreboard/history") {
      const detail = url.searchParams.get("detail") || "summary";
      const fullDetail = ["full", "all", "detail"].includes(String(detail).toLowerCase());
      const requestedLimit = url.searchParams.get("limit") || (fullDetail ? 20 : 5);
      const historyWindow = readGraphScoreboardHistoryWindow(root, { limit: requestedLimit });
      json(res, buildGraphScoreboardHistory({ ...historyWindow, limit: requestedLimit, detail }));
      return;
    }

    if (pathname === "/api/graph-lineage") {
      const refreshRequested = ["1", "true", "live"].includes(url.searchParams.get("refresh"));
      json(
        res,
        buildGraphLineageResponse(currentGraphLineageReport({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph-lineage/plan") {
      json(res, graphLineagePlan());
      return;
    }

    if (pathname === "/api/graph-lineage/history") {
      const requestedLimit = url.searchParams.has("limit") ? url.searchParams.get("limit") : 5;
      const historyWindow = readGraphLineageHistoryWindow(root, { limit: requestedLimit });
      json(
        res,
        buildGraphLineageHistory({
          ...historyWindow,
          limit: requestedLimit,
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/graph-projection-guard") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildGraphProjectionGuardResponse(currentGraphProjectionGuardReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/proof-quality" || pathname === "/api/evaluation") {
      const refreshRequested = ["1", "true", "live"].includes((url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildProofQualityEvaluationResponse(currentProofQualityEvaluation({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/proof-quality/plan") {
      json(res, proofQualityPlan());
      return;
    }

    if (pathname === "/api/evaluation/proof-quality/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : proofQualityHistoryLimit);
      const historyWindow = readProofQualityHistoryWindow(root, { limit });
      json(res, buildProofQualityHistory({ ...historyWindow, limit, detail }));
      return;
    }

    if (pathname === "/api/evaluation/search-quality") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildSearchQualityResponse(currentSearchQualityEvaluation({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/search-quality/plan") {
      json(res, searchQualityPlan());
      return;
    }

    if (pathname === "/api/evaluation/search-quality/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const historyWindow = readSearchQualityHistoryWindow(root, { limit });
      json(res, buildSearchQualityHistory({ ...historyWindow, limit, detail }));
      return;
    }

    if (pathname === "/api/evaluation/claim-calibration") {
      const refreshRequested = ["1", "true", "live"].includes(url.searchParams.get("refresh"));
      json(
        res,
        buildClaimCalibrationResponse(currentClaimCalibrationReport({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/claim-calibration/plan") {
      json(res, claimCalibrationPlan());
      return;
    }

    if (pathname === "/api/evaluation/claim-calibration/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const historyWindow = readClaimCalibrationHistoryWindow(root, { limit });
      json(res, buildClaimCalibrationHistory({ ...historyWindow, limit, detail }));
      return;
    }

    if (pathname === "/api/evaluation/opportunity-quality") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildOpportunityQualityResponse(currentOpportunityQualityEvaluation({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/opportunity-quality/plan") {
      json(res, opportunityQualityPlan());
      return;
    }

    if (pathname === "/api/evaluation/opportunity-quality/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const historyLimit = url.searchParams.get("limit") || (detail === "full" ? 20 : opportunityQualityHistoryLimit);
      json(
        res,
        buildOpportunityQualityHistory({
          ...readOpportunityQualityHistoryWindow(root, { limit: historyLimit }),
          limit: historyLimit,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/usability") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildUsabilityQualityEvaluationResponse(currentUsabilityQualityEvaluation({ preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/evaluation/usability/plan") {
      json(res, usabilityQualityPlan());
      return;
    }

    if (pathname === "/api/evaluation/usability/history") {
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      const historyWindow = readUsabilityQualityHistoryWindow(root, { limit });
      json(res, buildUsabilityQualityHistory({ ...historyWindow, limit, detail }));
      return;
    }

    if (pathname === "/api/evaluation/research-stress") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      json(
        res,
        buildResearchEvaluationStressResponse(currentResearchEvaluationStressReport(req, { preferReceipt: !refreshRequested }), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/artifact-compare") {
      json(
        res,
        currentArtifactComparison(url.searchParams.get("left") || "qagent", url.searchParams.get("right") || "flowpr", {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname.startsWith("/api/intents/")) {
      json(
        res,
        buildIntentPathResponse(selectIntentPath(pathname.split("/").pop(), currentIntentPaths()), {
          detail: url.searchParams.get("detail") || "summary",
        }),
      );
      return;
    }

    if (pathname === "/api/private/cockpit/plan") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, privateCockpitPlan());
      return;
    }

    if (pathname === "/api/private/cockpit/history") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, { receipts: readPrivateCockpitReceipts(root).slice(0, 20) });
      return;
    }

    if (pathname === "/api/private/cockpit") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      json(res, currentPrivateCockpit({ ensureStore: true }));
      return;
    }

    if (pathname === "/api/private/chief-of-staff") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, currentPrivateChiefOfStaffReadiness({ ensureStore: true }));
      return;
    }

    if (pathname === "/api/private/chief-of-staff/plan") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, privateChiefOfStaffPlan());
      return;
    }

    if (pathname === "/api/private/chief-of-staff/history") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, { receipts: readPrivateChiefOfStaffReceipts(root).slice(0, 20) });
      return;
    }

    if (pathname === "/api/private/chief-of-staff/drafts") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, currentPrivateChiefDrafts({ ensureStore: true }));
      return;
    }

    if (pathname === "/api/private/chief-of-staff/drafts/plan") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, privateChiefDraftsPlan());
      return;
    }

    if (pathname === "/api/private/chief-of-staff/drafts/history") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, { receipts: readPrivateChiefDraftsReceipts(root).slice(0, 20) });
      return;
    }

    if (pathname.startsWith("/api/private/chief-of-staff/drafts/")) {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      const draft = currentPrivateChiefDraft(pathname.split("/").pop(), { ensureStore: true });
      if (!draft) {
        notFound(res);
        return;
      }
      json(res, draft);
      return;
    }

    if (pathname === "/api/private/schedule") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, currentPrivateSchedule({ ensureStore: true }));
      return;
    }

    if (pathname === "/api/private/schedule/plan") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, privateSchedulePlan());
      return;
    }

    if (pathname === "/api/private/schedule/history") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, { receipts: readPrivateScheduleReceipts(root).slice(0, 20) });
      return;
    }

    if (pathname === "/api/private/priorities") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, currentPrivatePrioritizationReport({ ensureStore: true }));
      return;
    }

    if (pathname === "/api/private/next-actions/plan") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, privateNextActionsPlan());
      return;
    }

    if (pathname === "/api/private/next-actions/history") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, { receipts: readPrivateNextActionReceipts(root).slice(0, 20) });
      return;
    }

    if (pathname === "/api/private/next-actions") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, currentPrivateNextActionPlan({ ensureStore: true }));
      return;
    }

    if (pathname === "/api/private/tasks") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method === "GET") {
        json(res, currentPrivateTaskTracker({ ensureStore: true }));
        return;
      }
      if (req.method === "POST") {
        const body = await getBody(req);
        let parsed = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch {
          json(res, { error: "Invalid JSON" }, 400);
          return;
        }
        const tracker = recordPrivateTaskStatus({
          root,
          id: parsed.id,
          status: parsed.status,
          reviewer: parsed.reviewer,
          note: parsed.note,
          nextActionPlan: currentPrivateNextActionPlan({ ensureStore: true }),
        });
        json(res, tracker);
        return;
      }
      json(res, { error: "Method not allowed" }, 405);
      return;
    }

    if (pathname === "/api/private/tasks/plan") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, privateTaskTrackerPlan());
      return;
    }

    if (pathname === "/api/private/tasks/history") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, { receipts: readPrivateTaskReceipts(root).slice(0, 20) });
      return;
    }

    if (pathname === "/api/private/review-sessions") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, currentPrivateReviewSessions({ ensureStore: true }));
      return;
    }

    if (pathname === "/api/private/review-sessions/plan") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, privateReviewSessionsPlan());
      return;
    }

    if (pathname === "/api/private/review-sessions/history") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, { receipts: readPrivateReviewSessionReceipts(root).slice(0, 20) });
      return;
    }

    if (pathname === "/api/private/briefing-drafts") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, currentPrivateBriefingDrafts({ ensureStore: true }));
      return;
    }

    if (pathname === "/api/private/briefing-drafts/plan") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, privateBriefingDraftsPlan());
      return;
    }

    if (pathname === "/api/private/briefing-drafts/history") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, { receipts: readPrivateBriefingDraftReceipts(root).slice(0, 20) });
      return;
    }

    if (pathname.startsWith("/api/private/briefing-drafts/")) {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      const draft = currentPrivateBriefingDraft(pathname.split("/").pop(), { ensureStore: true });
      if (!draft) {
        notFound(res);
        return;
      }
      json(res, draft);
      return;
    }

    if (pathname === "/api/private/outreach-drafts") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method === "GET") {
        json(res, currentOutreachDraftCatalog({ ensureStore: true }));
        return;
      }
      if (req.method === "POST") {
        const body = await getBody(req);
        let parsed = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch {
          json(res, { error: "Invalid JSON" }, 400);
          return;
        }
        const catalog = recordOutreachDraftStatus({
          root,
          id: parsed.id,
          status: parsed.status,
          reviewer: parsed.reviewer,
          note: parsed.note,
          opportunities: currentOpportunityRadar(),
          packets: currentAudiencePackets(),
          projects,
          claims: claimLedger.map(publicClaim),
        });
        json(res, catalog);
        return;
      }
      json(res, { error: "Method not allowed" }, 405);
      return;
    }

    if (pathname === "/api/private/outreach-drafts/plan") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, outreachDraftPlan());
      return;
    }

    if (pathname === "/api/private/outreach-drafts/history") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, { receipts: readOutreachDraftReceipts(root).slice(0, 20) });
      return;
    }

    if (pathname === "/api/private/approvals/plan") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, privacyApprovalPlan());
      return;
    }

    if (pathname === "/api/private/approvals/history") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method !== "GET") {
        json(res, { error: "Method not allowed" }, 405);
        return;
      }
      json(res, { receipts: readPrivacyApprovalReceipts(root).slice(0, 20) });
      return;
    }

    if (pathname === "/api/private/approvals") {
      if (!privateCockpitEnabled(req)) {
        notFound(res);
        return;
      }
      if (req.method === "GET") {
        json(res, currentPrivacyApprovalAudit({ ensureStore: true }));
        return;
      }
      if (req.method === "POST") {
        const body = await getBody(req);
        let parsed = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch {
          json(res, { error: "Invalid JSON" }, 400);
          return;
        }
        const audit = recordPrivacyDecision({
          root,
          id: parsed.id,
          decision: parsed.decision,
          reviewer: parsed.reviewer,
          note: parsed.note,
          claims: claimLedger.map(publicClaim),
          artifactCatalog: currentArtifactCatalog(),
          routeManifest: runtimeRouteManifest(),
          packageManifest,
          receipts: readPrivacyApprovalReceipts(root),
        });
        json(res, audit);
        return;
      }
      json(res, { error: "Method not allowed" }, 405);
      return;
    }

    if (pathname.startsWith("/api/case-study/")) {
      json(res, caseStudy(pathname.split("/").pop(), { detail: url.searchParams.get("detail") || "summary" }));
      return;
    }

    if (pathname === "/api/status/plan") {
      json(res, statusPlan());
      return;
    }

    if (pathname === "/api/status") {
      const refreshRequested = ["1", "true", "live"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
      const recordRequested = refreshRequested || ["1", "true", "live"].includes(String(url.searchParams.get("record") || "").toLowerCase());
      const detail = url.searchParams.get("detail") || "summary";
      if (!recordRequested) {
        const cachedStatus = currentStatusPayloadFromReceipt(readStatusReceipts()[0]);
        if (cachedStatus) {
          json(res, buildStatusResponse(cachedStatus, { detail }));
          return;
        }
      }
      const payload = await statusPayload(`${url.protocol}//${url.host}`);
      const receipt = recordRequested || readStatusReceipts().length === 0 ? appendStatusReceipt(payload, { baseUrl: `${url.protocol}//${url.host}` }) : null;
      json(res, buildStatusResponse(decorateLiveStatusPayload(payload, receipt), { detail }));
      return;
    }

    if (pathname === "/api/status/history") {
      const receipts = readStatusReceipts();
      const detail = String(url.searchParams.get("detail") || "summary").toLowerCase();
      const limit = url.searchParams.get("limit") || (detail === "full" ? 20 : 5);
      json(
        res,
        buildStatusHistory({
          receipts,
          limit,
          totalAvailable: receipts.length,
          detail,
        }),
      );
      return;
    }

    if (pathname === "/api/terminal" && req.method === "POST") {
      const body = await getBody(req);
      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        json(res, { error: "Invalid JSON" }, 400);
        return;
      }
      json(res, { command: parsed.command || "", output: terminal(parsed.command) });
      return;
    }

    if (pathname.startsWith("/api/og/") && pathname.endsWith(".svg")) {
      svg(res, thumbnail(path.basename(pathname, ".svg")));
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error(error);
    json(res, { error: status >= 500 ? "Internal server error" : error.message }, status);
  }
  }).listen(port, "0.0.0.0", () => {
    console.log(`Rishabh Command Center running at http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  caseStudy,
  startServer,
};
