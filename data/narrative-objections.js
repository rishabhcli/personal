const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const ENDPOINT = "/api/narrative-objections";
const STORE_RELATIVE_PATH = path.join("var", "narrative-objections-receipts.json");
const maxReceipts = 50;

function narrativeObjectionPlan() {
  return {
    mode: "evidence-narrative-objection-plan",
    command: "npm run audit:narrative-objections",
    endpoint: ENDPOINT,
    supportedAudiences: ["recruiter", "professor", "founder"],
    receiptStore: STORE_RELATIVE_PATH,
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads the public-safe narrative objection endpoint with refresh=1, writes a local receipt under var/, and does not infer real recipient objections, send outreach, publish narrative copy, approve private artifacts, submit applications, or contact third parties.",
  };
}

function buildNarrativeObjectionReport({ narratives, packets, weaknessMap, maintenance, contradictions, opportunityQuality, receipts = [] }) {
  const packetMap = new Map((packets.packets || []).map((packet) => [packet.id, packet]));
  const weaknessMapBySlug = new Map((weaknessMap.projects || []).map((project) => [project.slug, project]));
  const audiences = (narratives.narratives || []).map((narrative) =>
    audienceObjectionSet({
      narrative,
      packet: packetMap.get(narrative.id),
      weaknessMapBySlug,
      maintenance,
      contradictions,
      opportunityQuality,
    }),
  );
  const allObjections = audiences.flatMap((audience) => audience.objections);
  const checks = reportChecks(audiences);
  const score = scoreChecks(checks);
  const failing = checks.filter((check) => !check.passed);
  const latestReceipt = receipts[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: "evidence-narrative-objection-report",
    cachedFromReceipt: false,
    cachePolicy: "live-refresh",
    refreshEndpoint: `${ENDPOINT}?refresh=1`,
    sourceBoundary:
      "This report pressure-tests generated public-safe narratives against modeled caveats, weaknesses, maintenance risks, contradiction checks, and opportunity readiness. It does not infer real recipient objections, interviews, admissions, funding, hiring decisions, or private document contents.",
    sideEffectBoundary:
      "The endpoint reads local public-safe narrative, packet, weakness, maintenance, contradiction, and opportunity-quality data only. It does not infer real recipient objections, send outreach, publish narrative copy, approve private artifacts, submit applications, or contact third parties.",
    plan: narrativeObjectionPlan(),
    summary: {
      audiences: audiences.length,
      objections: allObjections.length,
      averageAnswerability: average(allObjections.map((item) => item.answerabilityScore)),
      highRiskObjections: allObjections.filter((item) => item.riskLevel === "high").length,
      manualDisclosureRequired: allObjections.filter((item) => item.mustDisclose).length,
      checks: checks.length,
      passing: checks.filter((item) => item.passed).length,
      score,
      band: bandFor(score),
      latestReceiptId: latestReceipt?.id || null,
    },
    rules: [
      "Every audience narrative must have objections before it is used outside the app.",
      "Every objection needs a public-safe answer, evidence IDs when available, caveats, and a repair action.",
      "An objection answer may say evidence is missing; hiding the gap is a failure.",
      "No answer may claim external decisions, recipient interest, applications, funding, admissions, or hiring outcomes.",
    ],
    audiences,
    checks,
    repairActions: failing.map((check) => ({
      id: check.id,
      priority: check.severity,
      action: check.repairAction,
      verificationCommand: check.verificationCommand,
    })),
    latestReceipt: latestReceipt
      ? {
          id: latestReceipt.id,
          checkedAt: latestReceipt.checkedAt,
          score: latestReceipt.summary?.score || 0,
          passing: latestReceipt.summary?.passing || 0,
          checks: latestReceipt.summary?.checks || 0,
        }
      : null,
    nextAction: nextActionFor(audiences),
    verificationCommand: "npm run audit:narrative-objections && npm run check",
  };
}

function buildNarrativeObjectionReportFromReceipt(receipt) {
  if (!receipt || receipt.mode !== "evidence-narrative-objection-receipt" || !receipt.summary || !receipt.report) return null;
  const report = receipt.report;
  if (
    report.mode !== "evidence-narrative-objection-report" ||
    !report.summary ||
    !report.sourceBoundary ||
    !Array.isArray(report.rules) ||
    report.rules.length < 4 ||
    !Array.isArray(report.audiences) ||
    !report.audiences.every(
      (audience) =>
        audience.id &&
        audience.label &&
        Number.isInteger(audience.answerabilityScore) &&
        Array.isArray(audience.disclosureChecklist) &&
        Array.isArray(audience.objections) &&
        audience.objections.every((objection) => objection.id && objection.challenge && objection.answer && objection.repairAction && objection.verificationCommand),
    ) ||
    !Array.isArray(report.checks) ||
    !report.checks.every((check) => check.id && check.detail && check.repairAction && check.verificationCommand) ||
    !Array.isArray(report.repairActions) ||
    !report.nextAction ||
    !report.verificationCommand
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
      "This response reconstructs narrative objections from the latest local receipt. It is cached local pressure-test data, not real recipient objection, interview, admission, funding, hiring, or private document evidence.",
    sideEffectBoundary: receipt.sideEffectBoundary || report.sideEffectBoundary || narrativeObjectionPlan().sideEffectBoundary,
    plan: narrativeObjectionPlan(),
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
    verificationCommand: report.verificationCommand || "npm run audit:narrative-objections && npm run check",
  };
}

function buildNarrativeObjectionResponse(report, { detail = "summary" } = {}) {
  const fullDetail = ["1", "true", "full"].includes(String(detail || "").toLowerCase());
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint: `${ENDPOINT}?detail=full`,
      objectionPayloadPolicy: {
        fullDetail: true,
        fullDetailEndpoint: `${ENDPOINT}?detail=full`,
        audiencesReturned: report.audiences?.length || 0,
        objectionsReturned: report.summary?.objections || 0,
        fullFieldsPreserved: [
          "audiences.objections.answer",
          "audiences.objections.evidence",
          "audiences.objections.caveats",
          "audiences.objections.repairAction",
          "audiences.objections.verificationCommand",
          "checks.detail",
          "checks.repairAction",
          "checks.verificationCommand",
        ],
      },
    };
  }

  const audiences = (report.audiences || []).map(compactNarrativeObjectionAudience);
  const checks = selectNarrativeObjectionCheckPreview(report.checks || []).map((check) => ({
    id: check.id,
    passed: Boolean(check.passed),
    severity: check.severity,
  }));
  return {
    mode: report.mode,
    cachedFromReceipt: Boolean(report.cachedFromReceipt),
    refreshEndpoint: report.refreshEndpoint,
    summary: compactNarrativeObjectionSummary(report.summary),
    ruleCount: (report.rules || []).length,
    detail: "summary",
    compact: true,
    fullDetailEndpoint: `${ENDPOINT}?detail=full`,
    audiences,
    checks,
    repairActionCount: (report.repairActions || []).length,
    objectionPayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
      audiencesReturned: audiences.length,
      objectionsReturned: audiences.reduce((sum, audience) => sum + (audience.objectionCount || 0), 0),
      checksReturned: checks.length,
    },
  };
}

function compactNarrativeObjectionSummary(summary = {}) {
  return {
    audiences: summary.audiences || 0,
    objections: summary.objections || 0,
    highRiskObjections: summary.highRiskObjections || 0,
    manualDisclosureRequired: summary.manualDisclosureRequired || 0,
    score: summary.score || 0,
    band: summary.band || "unknown",
    latestReceiptId: summary.latestReceiptId || null,
  };
}

function buildNarrativeObjectionAudienceResponse(audience, { detail = "summary" } = {}) {
  if (!audience) return null;
  const fullDetail = ["1", "true", "full"].includes(String(detail || "").toLowerCase());
  const fullDetailEndpoint = `${ENDPOINT}/${encodeURIComponent(audience.id)}?detail=full`;
  const objections = Array.isArray(audience.objections) ? audience.objections : [];
  if (fullDetail) {
    return {
      ...audience,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      objectionAudiencePayloadPolicy: {
        fullDetail: true,
        fullDetailEndpoint,
        objectionsReturned: objections.length,
        fullFieldsPreserved: ["challenge", "answer", "evidence", "caveats", "repairAction", "verificationCommand"],
      },
    };
  }

  return {
    id: audience.id,
    label: audience.label,
    audience: audience.audience || audience.id,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    answerabilityScore: audience.answerabilityScore,
    riskLevel: audience.riskLevel,
    sourceProjectCount: audience.sourceProjects?.length || 0,
    disclosureChecklistCount: audience.disclosureChecklist?.length || 0,
    safestUseAvailable: Boolean(audience.safestUse),
    summary: {
      objections: objections.length,
      highRiskObjections: objections.filter((objection) => objection.riskLevel === "high").length,
      manualDisclosureRequired: objections.filter((objection) => objection.mustDisclose).length,
      averageAnswerability: average(objections.map((objection) => objection.answerabilityScore || 0)),
    },
    objections: objections.map((objection) => ({
      id: objection.id,
      rank: objection.rank,
      answerabilityScore: objection.answerabilityScore || 0,
      riskLevel: objection.riskLevel,
      mustDisclose: Boolean(objection.mustDisclose),
      evidenceCount: objection.evidence?.length || 0,
      caveatCount: objection.caveats?.length || 0,
      challengeAvailable: Boolean(objection.challenge),
      answerAvailable: Boolean(objection.answer),
      repairActionAvailable: Boolean(objection.repairAction),
      verificationCommandAvailable: Boolean(objection.verificationCommand),
    })),
    objectionAudiencePayloadPolicy: {
      fullDetail: false,
      fullDetailEndpoint,
      objectionsReturned: objections.length,
      omittedFromSummaryCount: 6,
    },
  };
}

function compactNarrativeObjectionPlan(plan = narrativeObjectionPlan()) {
  return {
    commandAvailable: Boolean(plan.command),
    endpoint: plan.endpoint || ENDPOINT,
    supportedAudienceCount: plan.supportedAudiences?.length || 0,
    sideEffectBoundaryAvailable: Boolean(plan.sideEffectBoundary),
  };
}

function compactNarrativeObjectionAudience(audience) {
  const objections = Array.isArray(audience.objections) ? audience.objections : [];
  return {
    id: audience.id,
    answerabilityScore: audience.answerabilityScore,
    sourceProjectCount: audience.sourceProjects?.length || 0,
    objectionCount: objections.length,
    highRiskObjections: objections.filter((objection) => objection.riskLevel === "high").length,
    manualDisclosureRequired: objections.filter((objection) => objection.mustDisclose).length,
    disclosureChecklistCount: audience.disclosureChecklist?.length || 0,
    objectionPreview: objections.slice(0, 2).map((objection) => objection.id),
  };
}

function selectNarrativeObjectionCheckPreview(checks = []) {
  const required = new Set(["objection-depth", "answerability"]);
  const selected = checks.filter((check) => !check.passed || required.has(check.id));
  return selected.length ? selected : checks.slice(0, 2);
}

function appendNarrativeObjectionReceipt(root, receipt) {
  const receipts = readNarrativeObjectionReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readNarrativeObjectionReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function buildNarrativeObjectionHistory({ receipts = [], limit = 5, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const boundedLimit = boundedHistoryLimit(limit);
  const limited = receipts.slice(0, boundedLimit);
  const latest = limited[0] || null;
  const fullDetail = String(detail || "").toLowerCase() === "full";
  return {
    ...(fullDetail ? { generatedAt: new Date().toISOString() } : {}),
    mode: "evidence-narrative-objection-history",
    detail: fullDetail ? "full" : "summary",
    compact: !fullDetail,
    ...(fullDetail
      ? {
          sourceBoundary:
            "This endpoint returns full local narrative-objection receipts. It does not infer real recipient objections, send outreach, publish narrative copy, approve private artifacts, submit applications, or contact third parties.",
          sideEffectBoundary:
            "The history endpoint reads local narrative-objection receipts only. It does not infer real recipient objections, send outreach, publish narrative copy, approve private artifacts, submit applications, or contact third parties.",
        }
      : {
          sourceBoundaryAvailable: true,
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
        },
    summary: {
      receipts: limited.length,
      totalAvailable,
      limit: boundedLimit,
      latestReceiptId: latest?.id || null,
      latestScore: latest?.summary?.score || 0,
      latestObjections: latest?.summary?.objections || 0,
      latestHighRiskObjections: latest?.summary?.highRiskObjections || 0,
      ...(fullDetail ? { latestCheckedAt: latest?.checkedAt || null } : {}),
    },
    definitions: fullDetail ? undefined : summarizeNarrativeObjectionDefinitions(latest),
    receipts: fullDetail ? limited : limited.map((receipt, index) => summarizeNarrativeObjectionReceipt(receipt, { includeDetail: index === 0 })),
    nextAction: fullDetail
      ? latest
        ? "Narrative objection history is available; run npm run audit:narrative-objections after narrative, packet, weakness, maintenance, contradiction, or opportunity-quality changes."
        : "Run npm run audit:narrative-objections to create narrative objection history."
      : undefined,
    verificationCommand: fullDetail ? "npm run audit:narrative-objections && node --test test/api-contract.test.mjs" : undefined,
  };
}

function summarizeNarrativeObjectionDefinitions(receipt) {
  const report = receipt?.report || receipt || {};
  const rules = receipt?.rules || report.rules || [];
  const checks = receipt?.checks || report.checks || [];
  return {
    ruleCount: rules.length,
    checkCount: checks.length,
  };
}

function summarizeNarrativeObjectionReceipt(receipt, { includeDetail = true } = {}) {
  const report = receipt.report || {};
  const audiences = receipt.audiences || report.audiences || [];
  const checks = receipt.checks || report.checks || [];
  const summary = summarizeNarrativeObjectionSummary(receipt.summary || report.summary);
  const historySummary = summarizeNarrativeObjectionHistorySummary(summary);
  const audienceSummaries = audiences.map((audience) => summarizeNarrativeObjectionAudienceHistory(audience));
  if (!includeDetail) {
    return {
      id: receipt.id,
      trendOnly: true,
      ...historySummary,
    };
  }

  return {
    id: receipt.id,
    ...historySummary,
    audiencePreview: audienceSummaries,
    passedChecks: checks.filter((check) => check.passed).length,
    failedChecks: checks.filter((check) => !check.passed).map((check) => check.id),
  };
}

function summarizeNarrativeObjectionAudienceHistory(audience) {
  const objections = Array.isArray(audience.objections) ? audience.objections : [];
  const objectionCount = Array.isArray(audience.objections) ? objections.length : Number(audience.objections) || 0;
  const topObjection = objections[0] || null;
  return {
    id: audience.id,
    objections: objectionCount,
    highRiskObjections: objections.filter((objection) => objection.riskLevel === "high").length,
    topObjectionId: topObjection?.id || null,
    topRiskLevel: topObjection?.riskLevel || null,
    topAnswerabilityScore: topObjection?.answerabilityScore || 0,
  };
}

function summarizeNarrativeObjectionSummary(summary = {}) {
  return {
    audiences: summary.audiences || 0,
    objections: summary.objections || 0,
    averageAnswerability: summary.averageAnswerability || 0,
    highRiskObjections: summary.highRiskObjections || 0,
    manualDisclosureRequired: summary.manualDisclosureRequired || 0,
    checks: summary.checks || 0,
    passing: summary.passing || 0,
    score: summary.score || 0,
    band: summary.band || "unknown",
  };
}

function summarizeNarrativeObjectionHistorySummary(summary = {}) {
  return {
    objections: summary.objections || 0,
    highRiskObjections: summary.highRiskObjections || 0,
    score: summary.score || 0,
  };
}

function boundedHistoryLimit(limit) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.min(Math.trunc(numeric), 100));
}

function selectNarrativeObjections(value, report) {
  const normalized = normalizeAudience(value);
  return report.audiences.find((audience) => audience.id === normalized) || null;
}

function audienceObjectionSet({ narrative, packet, weaknessMapBySlug, maintenance, contradictions, opportunityQuality }) {
  const sourceSlugs = narrative.sourceTrail.map((trail) => trail.project);
  const projectWeaknesses = sourceSlugs.map((slug) => weaknessMapBySlug.get(slug)).filter(Boolean);
  const opportunityPackage = (opportunityQuality.packageBenchmarks || []).find((item) => item.audience === narrative.audience);
  const objections = [
    proofDepthObjection({ narrative, packet, projectWeaknesses }),
    artifactInspectionObjection({ narrative, packet, projectWeaknesses }),
    privateBoundaryObjection({ narrative, packet }),
    overclaimObjection({ narrative, contradictions }),
    readinessObjection({ narrative, packet, opportunityPackage, maintenance, projectWeaknesses }),
  ].map((objection, index) => ({
    ...objection,
    rank: index + 1,
    verificationCommand: objection.verificationCommand || `npm run check && node server.js # then open /api/narrative-objections/${narrative.id}`,
  }));
  const answerabilityScore = average(objections.map((item) => item.answerabilityScore));
  return {
    id: narrative.id,
    label: narrative.label,
    audience: narrative.audience,
    thesis: narrative.thesis,
    confidenceBand: narrative.confidenceBand,
    answerabilityScore,
    riskLevel: riskLevelFor(answerabilityScore, objections),
    sourceProjects: sourceSlugs,
    objections,
    disclosureChecklist: disclosureChecklistFor({ narrative, packet, objections }),
    safestUse:
      answerabilityScore >= 80
        ? `Use the ${narrative.audience} narrative with the disclosure checklist attached.`
        : `Do not use the ${narrative.audience} narrative externally until the top objection is repaired.`,
  };
}

function proofDepthObjection({ narrative, packet, projectWeaknesses }) {
  const weakCount = projectWeaknesses.reduce((sum, project) => sum + project.weakClaims.length, 0);
  const staleCount = projectWeaknesses.reduce((sum, project) => sum + project.staleClaims.length, 0);
  const claimCount = narrative.claimsUsed.length;
  const evidence = narrative.claimsUsed.slice(0, 6);
  const answerabilityScore = clamp(Math.round(percent(claimCount, Math.max(1, narrative.sourceTrail.length * 3)) - weakCount * 7 - staleCount * 4), 0, 100);
  return objection({
    id: "proof-depth",
    challenge: "Is the core narrative supported by enough current evidence?",
    answer:
      weakCount || staleCount
        ? `Partially. The narrative uses ${claimCount} claim(s), but ${weakCount} weak and ${staleCount} stale claim(s) should be disclosed.`
        : `Yes for local public-safe use: ${claimCount} claim(s) are attached to the narrative source trail.`,
    answerabilityScore,
    riskLevel: weakCount >= 3 ? "high" : weakCount || staleCount ? "medium" : "low",
    evidence,
    caveats: packet?.uncertaintyDisclosure?.caveats?.slice(0, 2) || narrative.uncertaintyDisclosure.caveats.slice(0, 2),
    repairAction: firstImprovement(projectWeaknesses, "weakClaims") || "Keep claim IDs attached and rerun /api/narratives after evidence changes.",
    mustDisclose: weakCount > 0 || staleCount > 0,
  });
}

function artifactInspectionObjection({ narrative, packet, projectWeaknesses }) {
  const artifactCount = narrative.artifactsUsed.length;
  const missingArtifacts = projectWeaknesses.reduce((sum, project) => sum + project.missingArtifacts.length, 0);
  const answerabilityScore = clamp(Math.round(percent(artifactCount, Math.max(1, narrative.sourceTrail.length * 2)) - missingArtifacts * 8), 0, 100);
  return objection({
    id: "artifact-inspection",
    challenge: "Can the reader inspect artifacts instead of trusting the pitch?",
    answer:
      artifactCount > 0
        ? `Yes, the narrative links ${artifactCount} public-safe artifact ID(s), with ${missingArtifacts} tracked artifact gap(s).`
        : "Not yet. The narrative has no artifact IDs and should stay internal until proof artifacts are added.",
    answerabilityScore,
    riskLevel: artifactCount === 0 ? "high" : missingArtifacts ? "medium" : "low",
    evidence: narrative.artifactsUsed.slice(0, 6),
    caveats: missingArtifacts ? [`${missingArtifacts} artifact gap(s) remain in selected projects.`] : ["Artifacts are local/public-safe projections, not third-party certification."],
    repairAction: firstImprovement(projectWeaknesses, "missingArtifacts") || "Keep artifact IDs and transcript/replay links attached to the narrative.",
    mustDisclose: missingArtifacts > 0 || (packet?.uncertaintyDisclosure?.screenshotGapCount || 0) > 0,
  });
}

function privateBoundaryObjection({ narrative, packet }) {
  const privateReferenceCount = packet?.uncertaintyDisclosure?.privateReferenceCount || 0;
  const answerabilityScore = privateReferenceCount ? 78 : 100;
  return objection({
    id: "private-boundary",
    challenge: "Does the narrative rely on private material that should not be exposed?",
    answer:
      privateReferenceCount > 0
        ? `It contains ${privateReferenceCount} public-safe private reference(s), so the narrative must keep them summarized unless locally approved.`
        : "No private reference dependency is required by the current packet projection.",
    answerabilityScore,
    riskLevel: privateReferenceCount >= 3 ? "high" : privateReferenceCount ? "medium" : "low",
    evidence: [`packet.${narrative.id}.uncertaintyDisclosure`],
    caveats: [narrative.uncertaintyDisclosure.noExternalInference],
    repairAction:
      privateReferenceCount > 0
        ? "Review private references in the local privacy cockpit before turning them into public artifacts."
        : "Keep private-reference count at zero or public-safe-reference only.",
    mustDisclose: privateReferenceCount > 0,
  });
}

function overclaimObjection({ narrative, contradictions }) {
  const conflictCount = contradictions.summary.conflicts;
  const prohibitedCount = narrative.prohibitedOverclaims.length;
  const answerabilityScore = clamp(100 - conflictCount * 12, 0, 100);
  return objection({
    id: "overclaim-control",
    challenge: "What prevents this narrative from overstating outcomes?",
    answer: `The narrative carries ${prohibitedCount} prohibited-overclaim rule(s), and the contradiction scanner currently reports ${conflictCount} conflict(s).`,
    answerabilityScore,
    riskLevel: conflictCount >= 2 ? "high" : conflictCount ? "medium" : "low",
    evidence: narrative.prohibitedOverclaims.slice(0, 4),
    caveats: contradictions.quarantine.slice(0, 2).map((item) => item.suggestedResolution),
    repairAction: contradictions.quarantine[0]?.suggestedResolution || "Keep prohibited-overclaim rules attached to every generated narrative.",
    mustDisclose: conflictCount > 0,
    verificationCommand: "npm run check && node server.js # then open /api/contradictions",
  });
}

function readinessObjection({ narrative, packet, opportunityPackage, maintenance, projectWeaknesses }) {
  const maintenanceIssues = projectWeaknesses.reduce((sum, project) => sum + project.maintenanceIssues.length, 0);
  const readiness = opportunityPackage?.score ?? packet?.uncertaintyDisclosure?.confidenceScore ?? narrative.groundingScore;
  const answerabilityScore = clamp(Math.round(readiness - maintenanceIssues * 3), 0, 100);
  return objection({
    id: "action-readiness",
    challenge: "Is this narrative ready to use for a real next step?",
    answer:
      opportunityPackage && opportunityPackage.readyForManualUse
        ? `It is ready for manual review with package score ${opportunityPackage.score}/100; sending is still manual-only.`
        : `Not fully. Current readiness is ${readiness}/100 with ${maintenanceIssues} maintenance issue(s), so it should remain a reviewed draft.`,
    answerabilityScore,
    riskLevel: answerabilityScore >= 75 ? "low" : answerabilityScore >= 50 ? "medium" : "high",
    evidence: [
      `narrative.${narrative.id}.groundingScore.${narrative.groundingScore}`,
      opportunityPackage ? `opportunity-package.${opportunityPackage.id}` : `packet.${narrative.id}`,
    ],
    caveats: [
      "Manual review is required before any outreach, application, or submission.",
      ...(maintenance.summary.highSeverity ? [`${maintenance.summary.highSeverity} high-severity maintenance issue(s) exist in the broader app.`] : []),
    ],
    repairAction: opportunityPackage?.nextAction || firstProjectAction(projectWeaknesses) || "Review the narrative manually before external use.",
    mustDisclose: true,
  });
}

function disclosureChecklistFor({ narrative, packet, objections }) {
  return orderedUnique([
    `Confidence: ${narrative.confidenceBand}`,
    ...(packet?.uncertaintyDisclosure?.caveats || narrative.uncertaintyDisclosure.caveats).slice(0, 3),
    ...objections.filter((item) => item.mustDisclose).map((item) => `${item.id}: ${item.caveats[0] || item.challenge}`),
    narrative.uncertaintyDisclosure.noExternalInference,
  ]).slice(0, 8);
}

function reportChecks(audiences) {
  return [
    check("audience-coverage", audiences.length >= 3, `${audiences.length} audience objection set(s).`, "Keep recruiter, professor, and founder objection sets generated from grounded narratives."),
    check("objection-depth", audiences.every((audience) => audience.objections.length >= 5), "Every audience should have at least five objection types.", "Restore the five core objection types for every audience narrative."),
    check("answerability", audiences.every((audience) => audience.objections.every((item) => item.answer && item.answerabilityScore >= 0)), "Every objection should have an answerability score.", "Attach a public-safe answer and answerability score to every objection."),
    check("disclosure-checklist", audiences.every((audience) => audience.disclosureChecklist.length >= 3), "Every audience should expose a disclosure checklist.", "Attach disclosure checklist items before any narrative objection output is reused."),
    check("repair-actions", audiences.every((audience) => audience.objections.every((item) => item.repairAction)), "Every objection should provide a repair action.", "Attach repair guidance to every modeled objection."),
  ].map((item) => ({
    ...item,
    severity: item.id === "disclosure-checklist" ? "high" : "medium",
    verificationCommand: "npm run check && node server.js # then open /api/narrative-objections",
  }));
}

function objection({ id, challenge, answer, answerabilityScore, riskLevel, evidence, caveats, repairAction, mustDisclose, verificationCommand }) {
  return {
    id,
    challenge,
    answer,
    answerabilityScore,
    riskLevel,
    evidence: orderedUnique(evidence || []).slice(0, 8),
    caveats: orderedUnique(caveats || []).slice(0, 4),
    repairAction,
    mustDisclose: Boolean(mustDisclose),
    verificationCommand,
  };
}

function check(id, passed, detail, repairAction) {
  return { id, passed: Boolean(passed), detail, repairAction };
}

function firstImprovement(projectWeaknesses, key) {
  for (const project of projectWeaknesses) {
    const item = project[key]?.[0];
    if (item?.suggestedRepair) return item.suggestedRepair;
    if (item?.label && item?.suggestedRepair) return `${item.label}: ${item.suggestedRepair}`;
  }
  return null;
}

function firstProjectAction(projectWeaknesses) {
  return projectWeaknesses.find((project) => project.improvementActions?.length)?.improvementActions[0]?.action || null;
}

function nextActionFor(audiences) {
  const highRisk = audiences.flatMap((audience) => audience.objections.map((objection) => ({ audience, objection }))).find((item) => item.objection.riskLevel === "high");
  if (highRisk) return `${highRisk.audience.label}: repair ${highRisk.objection.id} - ${highRisk.objection.repairAction}`;
  const weakest = audiences.slice().sort((left, right) => left.answerabilityScore - right.answerabilityScore)[0];
  return weakest ? `${weakest.label}: review ${weakest.objections[0].id} before external use.` : "Keep narrative objection coverage refreshed.";
}

function normalizeAudience(value) {
  const normalized = String(value || "recruiter").toLowerCase().trim();
  if (["recruiter", "hiring", "internship", "engineer"].includes(normalized)) return "recruiter";
  if (["professor", "research", "mentor", "lab"].includes(normalized)) return "professor";
  if (["founder", "vc", "collaborator", "startup"].includes(normalized)) return "founder";
  return normalized;
}

function riskLevelFor(score, objections) {
  if (objections.some((item) => item.riskLevel === "high")) return "high";
  if (score < 70 || objections.some((item) => item.riskLevel === "medium")) return "medium";
  return "low";
}

function scoreChecks(checks) {
  if (!checks.length) return 0;
  return Math.round((checks.filter((item) => item.passed).length / checks.length) * 100);
}

function average(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return 0;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function percent(value, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
}

module.exports = {
  appendNarrativeObjectionReceipt,
  buildNarrativeObjectionAudienceResponse,
  buildNarrativeObjectionHistory,
  buildNarrativeObjectionReport,
  buildNarrativeObjectionReportFromReceipt,
  buildNarrativeObjectionResponse,
  narrativeObjectionPlan,
  readNarrativeObjectionReceipts,
  selectNarrativeObjections,
};
