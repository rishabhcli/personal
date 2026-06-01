const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/self-review";
const STORE_RELATIVE_PATH = path.join("var", "self-review-receipts.json");
const MAX_RECEIPTS = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

const reviewCadences = [
  {
    id: "weekly",
    label: "Weekly self-review",
    horizonDays: 7,
    nextActionLimit: 6,
  },
  {
    id: "monthly",
    label: "Monthly self-review",
    horizonDays: 31,
    nextActionLimit: 10,
  },
];

function selfReviewPlan() {
  return {
    mode: "evidence-self-review-plan",
    command: "npm run record:self-review",
    endpoint: ENDPOINT,
    historyEndpoint: `${ENDPOINT}/history`,
    receiptStore: STORE_RELATIVE_PATH,
    supportedCadences: reviewCadences.map((cadence) => cadence.id),
    scheduleRecommendation:
      "Run after changing public-safe evidence, opportunity models, maintenance issues, packet readiness, proof trials, graph lineage, artifact-gap repair, or receipt coverage.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads the public-safe self-review endpoint with explicit refresh, writes a local receipt under var/, and does not read inboxes, calendars, school portals, private cockpit data, analytics, or external application systems.",
    cachePolicy:
      "Public self-review routes use the latest local receipt by default when present; append ?refresh=1 to recompute the full local report.",
  };
}

function buildSelfReviewReports({
  projects,
  claims,
  trust,
  opportunities,
  maintenance,
  artifactCatalog,
  packets,
  proofTrials,
  artifactGapRepair = {},
  graphLineage = {},
  receipts,
}) {
  const plan = selfReviewPlan();
  const selfReviewReceipts = receipts?.selfReviewReceipts || [];
  const latestReceipt = selfReviewReceipts[0] || null;
  const reports = reviewCadences.map((cadence) =>
    buildReport({
      cadence,
      projects,
      claims,
      trust,
      opportunities,
      maintenance,
      artifactCatalog,
      packets,
      proofTrials,
      artifactGapRepair,
      graphLineage,
      receipts,
    }),
  );
  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-self-review-reports",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "Self-review reports are generated from local public-safe evidence, receipts, opportunity models, packet readiness, and maintenance issues. They do not read calendars, inboxes, school portals, or external application systems.",
    sideEffectBoundary: plan.sideEffectBoundary,
    plan,
    supportedCadences: reviewCadences.map((cadence) => cadence.id),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          cadences: latestReceipt.summary?.cadences || 0,
          nextActions: latestReceipt.summary?.nextActions || 0,
          proofRepairItems: latestReceipt.summary?.proofRepairItems || 0,
        }
      : null,
    summary: summarizeCatalog(reports, latestReceipt),
    reports,
    nonClaims: selfReviewNonClaims(),
    verificationCommand: "npm run record:self-review && npm run check && npm run verify",
  };
}

function selectSelfReviewReport(value, catalog) {
  const normalized = String(value || "weekly").toLowerCase().trim();
  if (["month", "monthly", "31d"].includes(normalized)) return catalog.reports.find((report) => report.id === "monthly") || null;
  if (["week", "weekly", "7d"].includes(normalized)) return catalog.reports.find((report) => report.id === "weekly") || null;
  return null;
}

function buildSelfReviewReportsFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-self-review-receipt" || !receipt.report) return null;
  const report = clone(receipt.report);
  const reports = (report.reports || []).map((item) => ({
    ...item,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}/${item.id}?refresh=1`,
    checkedAt: receipt.checkedAt || null,
  }));
  return {
    ...report,
    generatedAt: new Date().toISOString(),
    checkedAt: receipt.checkedAt || null,
    cachedFromReceipt: true,
    cachePolicy: "latest-local-receipt",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This response reconstructs the self-review catalog from the latest local receipt. It is a fast public-safe cached report, not proof that an external weekly or monthly review task ran.",
    sideEffectBoundary: receipt.sideEffectBoundary || selfReviewPlan().sideEffectBoundary,
    plan: selfReviewPlan(),
    latestReceipt: {
      id: receipt.id,
      checkedAt: receipt.checkedAt,
      cadences: receipt.summary?.cadences || reports.length,
      nextActions: receipt.summary?.nextActions || sum(reports.map((item) => item.nextActions?.length || 0)),
      proofRepairItems: receipt.summary?.proofRepairItems || sum(reports.map((item) => item.proofRepairReview?.repairItems || 0)),
    },
    summary: {
      ...(report.summary || {}),
      latestReceiptId: receipt.id,
    },
    reports,
    nonClaims: selfReviewNonClaims(),
    verificationCommand: "npm run record:self-review && npm run check && npm run verify",
  };
}

function buildSelfReviewReportResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = `${ENDPOINT}/${report.id}?detail=full`;
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      catalogEndpoint: ENDPOINT,
      selfReviewReportPayloadPolicy: selfReviewReportPayloadPolicy({ fullDetail, report }),
    };
  }

  return {
    ...summarizeSelfReviewReport(report),
    mode: "evidence-self-review-report",
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    selfReviewReportPayloadPolicy: selfReviewReportPayloadPolicy({ fullDetail, report }),
  };
}

function buildSelfReviewResponse(catalog, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const reports = catalog.reports || [];
  if (fullDetail) {
    return {
      ...catalog,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      selfReviewPayloadPolicy: selfReviewPayloadPolicy({ fullDetail, reports, returnedReports: reports.length }),
    };
  }

  const summarizedReports = reports.map(summarizeSelfReviewCatalogReport);
  return {
    mode: catalog.mode,
    cachedFromReceipt: Boolean(catalog.cachedFromReceipt),
    refreshEndpoint: catalog.refreshEndpoint,
    sourceBoundaryAvailable: Boolean(catalog.sourceBoundary),
    supportedCadences: catalog.supportedCadences,
    summary: catalog.summary,
    nonClaimCount: (catalog.nonClaims || []).length,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    reports: summarizedReports,
    selfReviewPayloadPolicy: selfReviewPayloadPolicy({ fullDetail, reports, returnedReports: summarizedReports.length }),
  };
}

function buildReport({
  cadence,
  projects,
  claims,
  trust,
  opportunities,
  maintenance,
  artifactCatalog,
  packets,
  proofTrials,
  artifactGapRepair,
  graphLineage,
  receipts,
}) {
  const staleClaims = claims.filter((claim) => claim.freshnessScore < 55);
  const weakClaims = claims.filter((claim) => claim.evidenceStrength === "needs-source");
  const privateClaims = claims.filter((claim) => claim.privacyLevel !== "public");
  const latestReceipts = latestReceiptSummary(receipts, cadence.horizonDays);
  const topOpportunities = (opportunities.opportunities || []).slice(0, cadence.id === "weekly" ? 3 : 5);
  const proofRepairReview = buildProofRepairReview({ cadence, artifactGapRepair, graphLineage });
  const nextActions = prioritizeNextActions({
    cadence,
    opportunities,
    maintenance,
    packets,
    staleClaims,
    weakClaims,
    artifactCatalog,
    proofRepairReview,
  });

  return {
    id: cadence.id,
    label: cadence.label,
    horizonDays: cadence.horizonDays,
    generatedAt: new Date().toISOString(),
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}/${cadence.id}?refresh=1`,
    summary: `${projects.length} projects, ${claims.length} public-safe claims, ${topOpportunities.length} priority opportunities, ${proofRepairReview.repairItems} proof-repair item(s), and ${nextActions.length} next actions reviewed.`,
    evidenceCoverage: {
      totalClaims: trust.counts.totalClaims,
      linkBackedClaims: trust.counts.linkBackedClaims,
      sourceBackedClaims: trust.counts.sourceBackedClaims,
      needsSourceClaims: trust.counts.needsSourceClaims,
      privateReferences: trust.counts.privateReferences,
      projectEvidencePackets: trust.counts.projectEvidencePackets,
      artifactCount: artifactCatalog.counts.artifacts,
      screenshotGaps: artifactCatalog.counts.screenshotGaps,
    },
    freshnessReview: {
      staleClaimCount: staleClaims.length,
      staleClaims: staleClaims.slice(0, cadence.id === "weekly" ? 4 : 8).map((claim) => ({
        id: claim.id,
        project: claim.relatedProject,
        freshnessScore: claim.freshnessScore,
        repair: claim.suggestedRepair,
      })),
    },
    proofRepairReview,
    opportunityReview: topOpportunities.map((opportunity) => ({
      id: opportunity.id,
      label: opportunity.label,
      audience: opportunity.audience,
      fitScore: opportunity.fitScore,
      missingProof: opportunity.missingProof.slice(0, 3),
      nextAction: opportunity.nextAction,
    })),
    packetReadiness: (packets.packets || []).map((packet) => ({
      id: packet.id,
      confidenceScore: packet.uncertaintyDisclosure.confidenceScore,
      confidenceBand: packet.uncertaintyDisclosure.confidenceBand,
      caveat: packet.uncertaintyDisclosure.caveats[0],
    })),
    verificationReview: latestReceipts,
    proofTrialReview: {
      totalTrials: proofTrials.summary.totalTrials,
      writeEnabledTrials: proofTrials.summary.writeEnabledTrials,
      approvalGatedTrials: proofTrials.summary.approvalGatedTrials,
      guardrailCount: proofTrials.guardrails.length,
    },
    maintenanceReview: {
      totalIssues: maintenance.summary.issues,
      highSeverity: maintenance.summary.highSeverity,
      topIssues: maintenance.issues.slice(0, cadence.id === "weekly" ? 4 : 8).map((issue) => ({
        id: issue.id,
        severity: issue.severity,
        title: issue.title,
        verificationCommand: issue.verificationCommand,
      })),
    },
    nextActions,
    uncertaintyDisclosure: {
      noExternalScheduling:
        "This report is generated on demand from local data; it is not proof that a weekly or monthly calendar task actually ran.",
      noExternalApplications:
        "Opportunity and packet sections do not claim real application deadlines, submissions, replies, offers, or admissions outcomes.",
      weakClaimCount: weakClaims.length,
      privateReferenceCount: privateClaims.length,
      proofRepairBoundary:
        "Proof-repair items identify missing media and graph-visible blockers; they do not claim screenshots, videos, outreach, applications, or third-party outcomes already exist.",
    },
  };
}

function buildProofRepairReview({ cadence, artifactGapRepair = {}, graphLineage = {} }) {
  const queueLimit = cadence.id === "weekly" ? 4 : 8;
  const repairQueue = artifactGapRepair.repairQueue || [];
  const graphSummary = graphLineage.summary || {};
  return {
    repairItems: artifactGapRepair.summary?.repairItems || 0,
    highPriorityItems: artifactGapRepair.summary?.highPriorityItems || 0,
    opportunityUnlocks: artifactGapRepair.summary?.opportunityUnlocks || 0,
    deRiskAdvances: artifactGapRepair.summary?.deRiskAdvances || 0,
    graphResolvedPaths: graphSummary.graphResolvedArtifactGapRepairPaths || 0,
    graphRepairPaths: graphSummary.artifactGapRepairPaths || 0,
    graphRepairNodes: graphSummary.artifactGapRepairNodes || 0,
    topRepairs: repairQueue.slice(0, queueLimit).map((item) => ({
      id: item.gapId,
      priority: item.priority,
      unlockScore: item.unlockScore,
      opportunityUnlockCount: item.opportunityUnlockCount,
      nextAction: item.nextAction,
      verificationCommand: "npm run repair:proof-gaps && npm run audit:graph-lineage && npm run audit:graph-depth",
    })),
    narrative:
      graphSummary.artifactGapRepairPaths > 0
        ? `${graphSummary.graphResolvedArtifactGapRepairPaths || 0}/${graphSummary.artifactGapRepairPaths} proof-repair path(s) are graph-visible; review the top repair before promoting missing media claims.`
        : "No graph-visible proof-repair paths are currently available; keep screenshot gaps explicit until repair nodes exist.",
  };
}

function summarizeCatalog(reports, latestReceipt) {
  return {
    cadences: reports.length,
    nextActions: sum(reports.map((report) => report.nextActions.length)),
    proofRepairItems: sum(reports.map((report) => report.proofRepairReview.repairItems)),
    graphRepairPaths: sum(reports.map((report) => report.proofRepairReview.graphRepairPaths)),
    graphResolvedPaths: sum(reports.map((report) => report.proofRepairReview.graphResolvedPaths)),
    staleClaims: reports[0]?.freshnessReview?.staleClaimCount || 0,
    latestReceiptId: latestReceipt?.id || null,
  };
}

function appendSelfReviewReceipt(root, receipt) {
  const receipts = readSelfReviewReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, MAX_RECEIPTS));
  return receipt;
}

function readSelfReviewReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestSelfReviewReceipt(root) {
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

function readSelfReviewHistoryWindow(root, { limit = 5 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readSelfReviewReceipts(root);
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

function buildSelfReviewHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    generatedAt: fullDetail ? new Date().toISOString() : undefined,
    mode: "evidence-self-review-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local self-review receipts. It is still not proof that an external calendar, inbox, school portal, application system, or private cockpit review task ran.",
          sideEffectBoundary: "Reads local self-review receipts only; no external systems, private cockpit data, analytics, calendars, inboxes, or applications are accessed.",
        }
      : {
          sourceBoundaryAvailable: true,
          sideEffectBoundaryAvailable: true,
        }),
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
      latestCadences: limited[0]?.summary?.cadences || 0,
      latestNextActions: limited[0]?.summary?.nextActions || 0,
      latestProofRepairItems: limited[0]?.summary?.proofRepairItems || 0,
      latestGraphRepairPaths: limited[0]?.summary?.graphRepairPaths || 0,
    },
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeSelfReviewReceipt(receipt, { includePreview: index === 0 })),
    nextAction: fullDetail
      ? limited[0]
        ? "Self-review history is available; run npm run record:self-review after evidence, opportunity, packet, proof repair, graph lineage, or receipt changes."
        : "Run npm run record:self-review to create self-review history."
      : undefined,
    nextActionAvailable: fullDetail ? undefined : Boolean(limited[0]),
    verificationCommand: fullDetail ? "npm run record:self-review && node --test test/api-contract.test.mjs" : undefined,
    verificationCommandAvailable: fullDetail ? undefined : true,
  };
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

function summarizeSelfReviewReceipt(receipt, { includePreview = true } = {}) {
  const report = receipt.report || {};
  if (!includePreview) {
    return {
      id: receipt.id,
      summary: summarizeSelfReviewReceiptSummary(receipt.summary),
      latestReceiptPreviewOnly: true,
    };
  }
  return {
    id: receipt.id,
    summary: summarizeSelfReviewReceiptSummary(receipt.summary),
    reportPreview: (report.reports || []).map((item) => ({
      id: item.id,
      horizonDays: item.horizonDays,
      nextActions: item.nextActions?.length || 0,
      proofRepairItems: item.proofRepairReview?.repairItems || 0,
      graphRepairPaths: item.proofRepairReview?.graphRepairPaths || 0,
      staleClaimCount: item.freshnessReview?.staleClaimCount || 0,
    })),
  };
}

function summarizeSelfReviewReceiptSummary(summary = {}) {
  return {
    cadences: summary.cadences || 0,
    nextActions: summary.nextActions || 0,
    proofRepairItems: summary.proofRepairItems || 0,
    graphRepairPaths: summary.graphRepairPaths || 0,
    staleClaims: summary.staleClaims || 0,
  };
}

function summarizeSelfReviewReport(report) {
  return {
    id: report.id,
    horizonDays: report.horizonDays,
    cachedFromReceipt: report.cachedFromReceipt,
    refreshEndpoint: report.refreshEndpoint,
    summary: {
      textAvailable: Boolean(report.summary),
      projectsReviewed: Number((String(report.summary || "").match(/(\d+) projects/) || [])[1] || 0),
      nextActions: report.nextActions?.length || 0,
      proofRepairItems: report.proofRepairReview?.repairItems || 0,
      opportunityCount: report.opportunityReview?.length || 0,
    },
    evidenceCoverage: report.evidenceCoverage,
    freshnessReview: {
      staleClaimCount: report.freshnessReview?.staleClaimCount || 0,
    },
    proofRepairReview: {
      repairItems: report.proofRepairReview?.repairItems || 0,
      highPriorityItems: report.proofRepairReview?.highPriorityItems || 0,
      graphResolvedPaths: report.proofRepairReview?.graphResolvedPaths || 0,
      graphRepairPaths: report.proofRepairReview?.graphRepairPaths || 0,
      topRepairs: (report.proofRepairReview?.topRepairs || []).slice(0, 1).map((item) => ({
        id: item.id,
        priority: item.priority,
      })),
    },
    opportunityReview: (report.opportunityReview || []).slice(0, 1).map((opportunity) => ({
      id: opportunity.id,
      audience: opportunity.audience,
      fitScore: opportunity.fitScore,
      missingProofCount: (opportunity.missingProof || []).length,
      nextActionAvailable: Boolean(opportunity.nextAction),
    })),
    packetReadinessSummary: {
      packets: (report.packetReadiness || []).length,
      lowConfidence: (report.packetReadiness || []).filter((packet) => packet.confidenceBand === "low" || packet.confidenceBand === "insufficient").length,
      caveatsAvailable: (report.packetReadiness || []).filter((packet) => packet.caveat).length,
    },
    proofTrialReview: report.proofTrialReview,
    maintenanceReview: {
      totalIssues: report.maintenanceReview?.totalIssues || 0,
      highSeverity: report.maintenanceReview?.highSeverity || 0,
      topIssues: (report.maintenanceReview?.topIssues || []).slice(0, 1).map((issue) => ({
        id: issue.id,
        severity: issue.severity,
        verificationCommandAvailable: Boolean(issue.verificationCommand),
      })),
    },
    nextActions: (report.nextActions || []).slice(0, 1).map((action) => ({
      priority: action.priority,
      source: action.source,
      actionAvailable: Boolean(action.action),
      reasonAvailable: Boolean(action.reason),
      verificationCommandAvailable: Boolean(action.verificationCommand),
    })),
    uncertaintyDisclosure: {
      weakClaimCount: report.uncertaintyDisclosure?.weakClaimCount || 0,
      privateReferenceCount: report.uncertaintyDisclosure?.privateReferenceCount || 0,
      noExternalApplicationsAvailable: Boolean(report.uncertaintyDisclosure?.noExternalApplications),
      proofRepairBoundaryAvailable: Boolean(report.uncertaintyDisclosure?.proofRepairBoundary),
    },
  };
}

function summarizeSelfReviewCatalogReport(report) {
  return {
    id: report.id,
    horizonDays: report.horizonDays,
    summary: {
      textAvailable: Boolean(report.summary),
      nextActions: report.nextActions?.length || 0,
      proofRepairItems: report.proofRepairReview?.repairItems || 0,
      opportunityCount: report.opportunityReview?.length || 0,
      staleClaimCount: report.freshnessReview?.staleClaimCount || 0,
    },
    proofRepairReview: {
      repairItems: report.proofRepairReview?.repairItems || 0,
      graphResolvedPaths: report.proofRepairReview?.graphResolvedPaths || 0,
      graphRepairPaths: report.proofRepairReview?.graphRepairPaths || 0,
    },
    freshnessReview: {
      staleClaimCount: report.freshnessReview?.staleClaimCount || 0,
    },
    nextActions: (report.nextActions || []).slice(0, 1).map((action) => ({
      priority: action.priority,
      source: action.source,
      actionAvailable: Boolean(action.action),
      verificationCommandAvailable: Boolean(action.verificationCommand),
    })),
    uncertaintyDisclosure: {
      proofRepairBoundaryAvailable: Boolean(report.uncertaintyDisclosure?.proofRepairBoundary),
    },
  };
}

function selfReviewPayloadPolicy({ fullDetail, reports, returnedReports }) {
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
      reportsReturned: returnedReports,
      totalReports: reports.length,
    };
  }
  const omittedFromSummary = [
    "full proof-repair next-action prose",
    "full opportunity missing-proof lists",
    "full packet caveat text",
    "maintenance issue titles and commands",
    "next-action action/reason prose",
    "uncertainty disclosure prose",
    "catalog verification command",
  ];
  return {
    fullDetail,
    reportsReturned: returnedReports,
    totalReports: reports.length,
    totalNextActions: sum(reports.map((report) => report.nextActions?.length || 0)),
    totalProofRepairItems: sum(reports.map((report) => report.proofRepairReview?.repairItems || 0)),
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    omittedFromSummary: fullDetail ? [] : undefined,
    omittedFromSummaryCount: fullDetail ? 0 : omittedFromSummary.length,
  };
}

function selfReviewReportPayloadPolicy({ fullDetail, report }) {
  if (!fullDetail) {
    return {
      fullDetail,
      fullDetailAvailable: true,
      omittedFromSummaryCount: 9,
    };
  }
  return {
    fullDetail,
    cadence: report.id,
    fullDetailEndpoint: `${ENDPOINT}/${report.id}?detail=full`,
    catalogFullDetailEndpoint: `${ENDPOINT}?detail=full`,
    nextActions: report.nextActions?.length || 0,
    proofRepairItems: report.proofRepairReview?.repairItems || 0,
    omittedFromSummary: fullDetail
      ? []
      : [
          "summary prose",
          "full stale-claim repair prose",
          "full proof-repair next-action prose",
          "full opportunity missing-proof lists",
          "full packet caveat text",
          "full verification receipt rows",
          "maintenance issue titles and commands",
          "next-action action/reason prose",
          "uncertainty disclosure prose",
        ],
  };
}

function boundedHistoryLimit(limit) {
  return Math.max(1, Math.min(Number(limit) || 20, MAX_RECEIPTS));
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

function selfReviewNonClaims() {
  return [
    "Does not prove that a weekly or monthly calendar task actually ran.",
    "Does not read inboxes, calendars, school portals, analytics, private cockpit data, or third-party application systems.",
    "Does not claim applications, outreach, replies, interviews, offers, admissions outcomes, screenshots, or videos already exist.",
    "Does not replace manual review before publishing public claims or acting on an opportunity.",
  ];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function latestReceiptSummary(receipts, horizonDays) {
  const since = Date.now() - horizonDays * 24 * 60 * 60 * 1000;
  return [
    summarizeReceipts("status", receipts.statusReceipts, since),
    summarizeReceipts("evidence-refresh", receipts.evidenceRefreshReceipts, since),
    summarizeReceipts("accessibility", receipts.accessibilityReports, since),
    summarizeReceipts("performance", receipts.performanceReports, since),
    summarizeReceipts("visual-regression", receipts.visualReports, since),
  ];
}

function summarizeReceipts(kind, items = [], since) {
  const recent = items.filter((item) => {
    const checkedAt = Date.parse(item.checkedAt || item.generatedAt || 0);
    return Number.isFinite(checkedAt) && checkedAt >= since;
  });
  const latest = items[0] || null;
  return {
    kind,
    recentCount: recent.length,
    latestId: latest?.id || null,
    latestSummary: latest?.summary || latest?.receiptSummary || null,
  };
}

function prioritizeNextActions({ cadence, opportunities, maintenance, packets, staleClaims, weakClaims, artifactCatalog, proofRepairReview }) {
  const actions = [];
  if (proofRepairReview.repairItems > 0) {
    actions.push({
      priority: proofRepairReview.highPriorityItems > 0 ? "high" : "medium",
      source: "proof-repair-graph",
      action: proofRepairReview.topRepairs[0]?.nextAction || "Review graph-visible proof repair paths before claiming proof-media completeness.",
      reason: `${proofRepairReview.graphResolvedPaths}/${proofRepairReview.graphRepairPaths} graph-resolved proof-repair path(s); ${proofRepairReview.opportunityUnlocks} opportunity unlock(s).`,
      verificationCommand: "npm run repair:proof-gaps && npm run audit:graph-lineage && npm run audit:graph-depth",
    });
  }
  for (const issue of maintenance.issues.slice(0, 4)) {
    actions.push({
      priority: issue.severity === "high" ? "high" : "medium",
      source: "maintenance",
      action: issue.suggestedFix,
      reason: issue.title,
      verificationCommand: issue.verificationCommand,
    });
  }
  for (const opportunity of (opportunities.nextActions || []).slice(0, 3)) {
    actions.push({
      priority: "medium",
      source: "opportunity",
      action: opportunity.action,
      reason: opportunity.id,
      verificationCommand: "npm run check",
    });
  }
  for (const packet of (packets.packets || []).filter((item) => item.uncertaintyDisclosure.confidenceScore < 65).slice(0, 3)) {
    actions.push({
      priority: "medium",
      source: "packet",
      action: packet.nextActions[0],
      reason: `${packet.label} confidence ${packet.uncertaintyDisclosure.confidenceScore}/100`,
      verificationCommand: `node -e "fetch('http://127.0.0.1:3000/api/packets/${packet.id}').then(r=>console.log(r.status))"`,
    });
  }
  if (staleClaims.length) {
    actions.push({
      priority: "medium",
      source: "freshness",
      action: staleClaims[0].suggestedRepair,
      reason: `${staleClaims.length} stale claim(s) under current freshness policy`,
      verificationCommand: "npm run check",
    });
  }
  if (weakClaims.length) {
    actions.push({
      priority: "medium",
      source: "evidence",
      action: weakClaims[0].suggestedRepair,
      reason: `${weakClaims.length} claim(s) need stronger source attachments`,
      verificationCommand: "npm run check",
    });
  }
  if (artifactCatalog.counts.screenshotGaps) {
    actions.push({
      priority: "low",
      source: "artifact",
      action: "Capture or approve public-safe screenshots for projects with recorded screenshot gaps.",
      reason: `${artifactCatalog.counts.screenshotGaps} screenshot gap(s) remain explicit.`,
      verificationCommand: "npm run audit:visual",
    });
  }

  return actions.slice(0, cadence.nextActionLimit);
}

module.exports = {
  appendSelfReviewReceipt,
  buildSelfReviewHistory,
  buildSelfReviewReportResponse,
  buildSelfReviewReportsFromReceipt,
  buildSelfReviewReports,
  buildSelfReviewResponse,
  readLatestSelfReviewReceipt,
  readSelfReviewHistoryWindow,
  readSelfReviewReceipts,
  reviewCadences,
  selectSelfReviewReport,
  selfReviewPlan,
};
