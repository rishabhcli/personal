function buildRuntimeAttestation({ runtimeReport, runtimePlan, refreshPlan, packageManifest, routeManifest }) {
  const attestations = [
    packageScriptAttestation(packageManifest),
    runtimeFingerprintAttestation(runtimeReport),
    identityDriftAttestation(runtimeReport),
    receiptHistoryAttestation(runtimeReport),
    refreshCoverageAttestation(refreshPlan, routeManifest),
    runtimeSurfaceAttestation(packageManifest, routeManifest),
    routeLatencyAttestation(packageManifest, routeManifest, refreshPlan),
    privateGateAttestation(routeManifest),
    publicRouteManifestAttestation(routeManifest),
    staticRuntimeAttestation(routeManifest),
  ];
  const failing = attestations.filter((item) => !item.passed);
  const highFailing = failing.filter((item) => item.severity === "high");
  const score = scoreAttestations(attestations);

  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-truth-attestation",
    sourceBoundary:
      "This attestation explains local runtime truth coverage from package scripts, route declarations, fingerprint reports, and local receipt history. It does not verify CDN cache state, provider dashboards, production deploy identity, or private cockpit contents.",
    plan: {
      command: runtimePlan.command,
      receiptStore: runtimePlan.receiptStore,
      refreshCommand: refreshPlan.command,
      endpoints: orderedUnique([...runtimePlan.endpoints, ...refreshPlan.endpoints]),
    },
    routeManifest,
    summary: {
      score,
      band: score >= 85 ? "high" : score >= 65 ? "medium" : "low",
      attestations: attestations.length,
      passing: attestations.length - failing.length,
      failing: failing.length,
      highFailing: highFailing.length,
      publicApiRoutes: routeManifest.publicApiRoutes.length,
      privateApiRoutes: routeManifest.privateApiRoutes.length,
      staticRoutes: routeManifest.staticRoutes.length,
      packageScripts: Object.keys(packageManifest.scripts || {}).length,
      refreshCoveredEndpoints: (refreshPlan.endpoints || []).length,
    },
    driftExplanation: {
      identityHash: runtimeReport.current.identityHash,
      volatileHash: runtimeReport.current.volatileHash,
      interpretation: runtimeReport.diff.interpretation,
      identityChanges: runtimeReport.diff.summary.identityChanged,
      volatileChanges: runtimeReport.diff.summary.volatileChanged,
    },
    publishGate: {
      safeForPublicRuntimeBadge: highFailing.length === 0 && score >= 70,
      reason:
        highFailing.length === 0 && score >= 70
          ? "Runtime truth is strong enough for a public-safe local badge, while production identity still needs separate deploy-provider evidence."
          : "Repair high-severity runtime attestation failures before using this as public-facing runtime proof.",
      minimumRepairs: failing.slice(0, 4).map((item) => item.repairAction),
    },
    attestations,
  };
}

function buildRuntimeAttestationResponse(attestation, { detail = "summary", routePreviewLimit = 18 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  if (fullDetail) {
    return {
      ...attestation,
      detail: "full",
      compact: false,
      summaryEndpoint: "/api/runtime-truth/attestation",
      fullDetailEndpoint: "/api/runtime-truth/attestation?detail=full",
      attestationPayloadPolicy: {
        fullDetail: true,
        planEndpointsReturned: attestation.plan?.endpoints?.length || 0,
        publicApiRoutesReturned: attestation.routeManifest?.publicApiRoutes?.length || 0,
        privateApiRoutesReturned: attestation.routeManifest?.privateApiRoutes?.length || 0,
        staticRoutesReturned: attestation.routeManifest?.staticRoutes?.length || 0,
        attestationsReturned: attestation.attestations?.length || 0,
      },
    };
  }

  const boundedPreviewLimit = Math.max(6, Math.min(Number(routePreviewLimit) || 18, 40));
  const routeManifest = summarizeRuntimeAttestationRouteManifest(attestation.routeManifest, boundedPreviewLimit);
  const plan = summarizeRuntimeAttestationPlan(attestation.plan);
  const attestations = (attestation.attestations || []).map(summarizeAttestation);

  return {
    mode: attestation.mode,
    detail: "summary",
    compact: true,
    sourceBoundaryAvailable: Boolean(attestation.sourceBoundary),
    fullDetailEndpoint: "/api/runtime-truth/attestation?detail=full",
    plan,
    routeManifest,
    summary: attestation.summary,
    driftExplanation: {
      identityChanges: attestation.driftExplanation.identityChanges,
      volatileChanges: attestation.driftExplanation.volatileChanges,
      interpretationAvailable: Boolean(attestation.driftExplanation.interpretation),
    },
    publishGate: {
      safeForPublicRuntimeBadge: attestation.publishGate.safeForPublicRuntimeBadge,
      reasonAvailable: Boolean(attestation.publishGate.reason),
      minimumRepairCount: attestation.publishGate.minimumRepairs.length,
    },
    attestations,
    attestationPayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
      attestationDetailFields: ["evidence", "explanation", "repairAction", "verificationCommand"],
      attestationsReturned: attestations.length,
    },
  };
}

function runtimeRouteManifest() {
  return {
    publicApiRoutes: [
      "/api/projects",
      "/api/search",
      "/api/guide",
      "/api/graph",
      "/api/graph/plan",
      "/api/graph/history",
      "/api/graph-quality",
      "/api/graph-quality/plan",
      "/api/graph-quality/history",
      "/api/graph-crosslinks",
      "/api/graph-crosslinks/plan",
      "/api/graph-crosslinks/history",
      "/api/graph-scoreboard",
      "/api/graph-scoreboard/plan",
      "/api/graph-scoreboard/history",
      "/api/graph-lineage",
      "/api/graph-lineage/plan",
      "/api/graph-lineage/history",
      "/api/graph-projection-guard",
      "/api/graph-projection-guard/plan",
      "/api/graph-projection-guard/history",
      "/api/graph-confidence",
      "/api/graph-confidence/plan",
      "/api/graph-confidence/history",
      "/api/graph-depth-score",
      "/api/graph-depth-score/plan",
      "/api/graph-depth-score/history",
      "/api/evaluation/proof-quality",
      "/api/evaluation/proof-quality/plan",
      "/api/evaluation/proof-quality/history",
      "/api/evaluation/search-quality",
      "/api/evaluation/search-quality/plan",
      "/api/evaluation/search-quality/history",
      "/api/evaluation/claim-calibration",
      "/api/evaluation/claim-calibration/plan",
      "/api/evaluation/claim-calibration/history",
      "/api/evaluation/opportunity-quality",
      "/api/evaluation/opportunity-quality/plan",
      "/api/evaluation/opportunity-quality/history",
      "/api/evaluation/usability",
      "/api/evaluation/usability/plan",
      "/api/evaluation/usability/history",
      "/api/evaluation/integrity",
      "/api/evaluation/integrity/plan",
      "/api/evaluation/integrity/history",
      "/api/evaluation/research-stress",
      "/api/evaluation/research-stress/plan",
      "/api/evaluation/research-stress/history",
      "/api/evaluation/research-rigor",
      "/api/evaluation/research-rigor/plan",
      "/api/evaluation/research-rigor/history",
      "/api/evaluation/sample",
      "/api/evaluation/sample/plan",
      "/api/evaluation/sample/history",
      "/api/claims",
      "/api/claims/:id",
      "/api/evidence/:slug",
      "/api/trust",
      "/api/opportunities",
      "/api/opportunity-packages",
      "/api/opportunity-packages/:id",
      "/api/opportunity-board",
      "/api/opportunity-board/:id",
      "/api/opportunity-derisking",
      "/api/opportunity-derisking/:id",
      "/api/opportunity-derisking/plan",
      "/api/opportunity-derisking/history",
      "/api/opportunity-ranking",
      "/api/opportunity-ranking/:id",
      "/api/opportunity-ranking/plan",
      "/api/opportunity-ranking/history",
      "/api/opportunity-scorecard",
      "/api/opportunity-scorecard/:id",
      "/api/opportunity-scorecard/plan",
      "/api/opportunity-scorecard/history",
      "/api/artifacts",
      "/api/artifact-collections",
      "/api/artifact-collections/:id",
      "/api/artifact-transcripts",
      "/api/artifact-transcripts/:slug",
      "/api/artifact-museum",
      "/api/artifact-museum/plan",
      "/api/artifact-museum/history",
      "/api/artifact-museum-compare",
      "/api/artifact-museum-compare/plan",
      "/api/artifact-museum-compare/history",
      "/api/artifact-replays",
      "/api/artifact-replays/:slug",
      "/api/artifact-gaps",
      "/api/artifact-gaps/plan",
      "/api/artifact-gaps/history",
      "/api/artifact-gap-repair",
      "/api/artifact-gap-repair/plan",
      "/api/artifact-gap-repair/history",
      "/api/artifact-compare",
      "/api/intents",
      "/api/intents/:id",
      "/api/maintenance",
      "/api/runtime-truth",
      "/api/runtime-truth/plan",
      "/api/runtime-truth/fingerprint",
      "/api/runtime-truth/history",
      "/api/runtime-truth/attestation",
      "/api/runtime-surface/plan",
      "/api/runtime-surface",
      "/api/runtime-surface/latest",
      "/api/runtime-surface/history",
      "/api/route-latency",
      "/api/route-latency/plan",
      "/api/route-latency/history",
      "/api/runtime-boundary",
      "/api/runtime-boundary/plan",
      "/api/runtime-boundary/history",
      "/api/runtime-reconciliation",
      "/api/runtime-diff",
      "/api/runtime-diff/plan",
      "/api/runtime-diff/history",
      "/api/runtime-explain",
      "/api/runtime-explain/plan",
      "/api/runtime-explain/history",
      "/api/runtime-deploy-readiness",
      "/api/runtime-deploy-readiness/plan",
      "/api/runtime-deploy-readiness/history",
      "/api/runtime-evidence-chain",
      "/api/runtime-evidence-chain/plan",
      "/api/runtime-evidence-chain/history",
      "/api/design-stability",
      "/api/design-stability/plan",
      "/api/design-stability/history",
      "/api/keyboard-readiness",
      "/api/keyboard-readiness/plan",
      "/api/keyboard-readiness/history",
      "/api/design-ambition",
      "/api/design-ambition/plan",
      "/api/design-ambition/history",
      "/api/evidence-refresh/plan",
      "/api/evidence-refresh/history",
      "/api/accessibility-audit/plan",
      "/api/accessibility-audit/history",
      "/api/performance-budget/plan",
      "/api/performance-budget/history",
      "/api/visual-regression/plan",
      "/api/visual-regression/history",
      "/api/proof-trials",
      "/api/proof-trials/:slug",
      "/api/proof-trials/plan",
      "/api/proof-trials/history",
      "/api/packets",
      "/api/packets/:audience",
      "/api/narratives",
      "/api/narratives/:audience",
      "/api/narratives/plan",
      "/api/narratives/history",
      "/api/narrative-contrast",
      "/api/narrative-contrast/:id",
      "/api/narrative-contrast/plan",
      "/api/narrative-contrast/history",
      "/api/narrative-objections",
      "/api/narrative-objections/:audience",
      "/api/narrative-objections/plan",
      "/api/narrative-objections/history",
      "/api/narrative-tailor",
      "/api/narrative-tailor/:audience",
      "/api/narrative-tailor/plan",
      "/api/narrative-tailor/history",
      "/api/narrative-disclosure",
      "/api/narrative-disclosure/:audience",
      "/api/narrative-disclosure/plan",
      "/api/narrative-disclosure/history",
      "/api/narrative-sequence",
      "/api/narrative-sequence/:audience",
      "/api/narrative-sequence/plan",
      "/api/narrative-sequence/history",
      "/api/graph-disclosure-links",
      "/api/graph-disclosure-links/plan",
      "/api/graph-disclosure-links/history",
      "/api/self-review",
      "/api/self-review/plan",
      "/api/self-review/history",
      "/api/self-review/:cadence",
      "/api/weaknesses",
      "/api/weaknesses/:slug",
      "/api/skill-gaps",
      "/api/skill-gaps/:skill",
      "/api/contradictions",
      "/api/change-history/plan",
      "/api/change-history/history",
      "/api/change-history",
      "/api/trust-blockade",
      "/api/trust-blockade/plan",
      "/api/trust-blockade/history",
      "/api/waves",
      "/api/waves/:number",
      "/api/case-study/:slug",
      "/api/status",
      "/api/status/plan",
      "/api/status/history",
      "/api/terminal",
      "/api/og/:slug.svg",
    ],
    privateApiRoutes: [
      "/api/private/cockpit",
      "/api/private/cockpit/plan",
      "/api/private/cockpit/history",
      "/api/private/chief-of-staff",
      "/api/private/chief-of-staff/plan",
      "/api/private/chief-of-staff/history",
      "/api/private/chief-of-staff/drafts",
      "/api/private/chief-of-staff/drafts/:id",
      "/api/private/chief-of-staff/drafts/plan",
      "/api/private/chief-of-staff/drafts/history",
      "/api/private/schedule",
      "/api/private/schedule/plan",
      "/api/private/schedule/history",
      "/api/private/priorities",
      "/api/private/next-actions",
      "/api/private/next-actions/plan",
      "/api/private/next-actions/history",
      "/api/private/tasks",
      "/api/private/tasks/plan",
      "/api/private/tasks/history",
      "/api/private/review-sessions",
      "/api/private/review-sessions/plan",
      "/api/private/review-sessions/history",
      "/api/private/briefing-drafts",
      "/api/private/briefing-drafts/:id",
      "/api/private/briefing-drafts/plan",
      "/api/private/briefing-drafts/history",
      "/api/private/outreach-drafts",
      "/api/private/outreach-drafts/plan",
      "/api/private/outreach-drafts/history",
      "/api/private/approvals",
      "/api/private/approvals/plan",
      "/api/private/approvals/history",
    ],
    staticRoutes: ["/", "/index.html", "/styles.css", "/main.js", "/favicon.svg", "/desktop-hero.png", "/app-runtime", "/three-runtime"],
    privateGate: {
      envVar: "ENABLE_PRIVATE_COCKPIT",
      requiredValue: "1",
      networkBoundary: "localhost-only",
      publicDefaultStatus: 404,
    },
  };
}

function summarizeRuntimeAttestationPlan(plan = {}) {
  const endpoints = plan.endpoints || [];
  return {
    commandAvailable: Boolean(plan.command),
    receiptStoreAvailable: Boolean(plan.receiptStore),
    refreshCommandAvailable: Boolean(plan.refreshCommand),
    endpointCount: endpoints.length,
  };
}

function summarizeRuntimeAttestationRouteManifest(routeManifest = {}, routePreviewLimit) {
  const publicApiRoutes = routeManifest.publicApiRoutes || [];
  const privateApiRoutes = routeManifest.privateApiRoutes || [];
  const staticRoutes = routeManifest.staticRoutes || [];
  const privateGate = routeManifest.privateGate || {};
  return {
    publicApiRouteCount: publicApiRoutes.length,
    privateApiRouteCount: privateApiRoutes.length,
    staticRouteCount: staticRoutes.length,
    privateGate: {
      envVar: privateGate.envVar,
      networkBoundary: privateGate.networkBoundary,
      publicDefaultStatus: privateGate.publicDefaultStatus,
    },
    publicRouteGroupCount: Object.keys(countRouteGroups(publicApiRoutes)).length,
  };
}

function summarizeAttestation(item) {
  return {
    id: item.id,
    passed: item.passed,
    severity: item.severity,
  };
}

function countRouteGroups(routes) {
  return routes.reduce((groups, route) => {
    const key = route.split("/")[2] || "root";
    groups[key] = (groups[key] || 0) + 1;
    return groups;
  }, {});
}

function packageScriptAttestation(packageManifest) {
  const required = ["start", "check", "build:inline", "test", "test:e2e", "verify", "record:runtime", "record:runtime-surface", "record:route-latency"];
  const scripts = packageManifest.scripts || {};
  const missing = required.filter((name) => !scripts[name]);
  return attestation({
    id: "package-scripts",
    label: "Runtime scripts are declared",
    passed: missing.length === 0,
    severity: "high",
    evidence: `${Object.keys(scripts).length} script(s); missing: ${missing.join(", ") || "none"}`,
    explanation: "Runtime truth needs stable commands for local startup, validation, build, tests, and fingerprint recording.",
    repairAction: missing.length ? `Add package script(s): ${missing.join(", ")}.` : "Keep package scripts synchronized with README and tests.",
    verificationCommand: "npm run check",
  });
}

function runtimeFingerprintAttestation(runtimeReport) {
  return attestation({
    id: "fingerprint-readiness",
    label: "Runtime fingerprint is readable",
    passed: runtimeReport.readiness.score >= 65 && runtimeReport.current.identityHash.length >= 12,
    severity: "high",
    evidence: `${runtimeReport.readiness.score}/100 ${runtimeReport.readiness.band}; identity ${runtimeReport.current.identityHash}`,
    explanation: "The app can explain local package/build/git/domain identity without exposing private provider data.",
    repairAction: runtimeReport.readiness.recommendations[0] || "Rerun runtime truth recording and inspect failing checks.",
    verificationCommand: "npm run record:runtime",
  });
}

function identityDriftAttestation(runtimeReport) {
  const hasIdentityDrift = runtimeReport.diff.summary.identityChanged > 0;
  return attestation({
    id: "identity-drift",
    label: "Identity drift is explained",
    passed: !hasIdentityDrift,
    severity: "medium",
    evidence: runtimeReport.diff.interpretation,
    explanation: "Identity drift should be explicit so local restarts are not confused with deploy/build changes.",
    repairAction: hasIdentityDrift
      ? "Review package, build, git, Node major version, and domain changes before treating this runtime as equivalent."
      : "No identity repair needed; keep volatile changes separated from identity changes.",
    verificationCommand: "npm run record:runtime",
  });
}

function receiptHistoryAttestation(runtimeReport) {
  return attestation({
    id: "receipt-history",
    label: "Runtime receipt history is available",
    passed: Boolean(runtimeReport.previous),
    severity: "low",
    evidence: runtimeReport.previous ? `previous=${runtimeReport.previous.id}` : "no previous receipt",
    explanation: "A previous receipt allows the runtime diff to distinguish new drift from first-run uncertainty.",
    repairAction: runtimeReport.previous ? "Keep runtime receipts under var/ and rerun after meaningful changes." : "Run npm run record:runtime twice to establish a diff baseline.",
    verificationCommand: "npm run record:runtime",
  });
}

function refreshCoverageAttestation(refreshPlan, routeManifest) {
  const mustCover = ["/api/projects", "/api/status", "/api/runtime-truth/fingerprint", "/api/runtime-truth/attestation", "/api/runtime-surface/latest"];
  const covered = new Set(refreshPlan.endpoints || []);
  const missing = mustCover.filter((endpoint) => !covered.has(endpoint));
  return attestation({
    id: "refresh-coverage",
    label: "Evidence refresh covers runtime truth",
    passed: missing.length === 0,
    severity: "medium",
    evidence: `${covered.size} refresh endpoint(s); ${routeManifest.publicApiRoutes.length} public API route declaration(s)`,
    explanation: "Refresh receipts should include runtime identity and attestation, not only portfolio data endpoints.",
    repairAction: missing.length ? `Add refresh endpoint(s): ${missing.join(", ")}.` : "Keep refresh plan coverage aligned with critical runtime routes.",
    verificationCommand: "npm run refresh:evidence",
  });
}

function runtimeSurfaceAttestation(packageManifest, routeManifest) {
  const scripts = packageManifest.scripts || {};
  const requiredRoutes = ["/api/runtime-surface/plan", "/api/runtime-surface/latest", "/api/runtime-surface/history"];
  const missingRoutes = requiredRoutes.filter((route) => !routeManifest.publicApiRoutes.includes(route));
  return attestation({
    id: "runtime-surface-diff",
    label: "Runtime surface diff is recordable",
    passed: Boolean(scripts["record:runtime-surface"]) && missingRoutes.length === 0,
    severity: "medium",
    evidence: `${scripts["record:runtime-surface"] ? "script present" : "script missing"}; missing routes ${missingRoutes.join(", ") || "none"}`,
    explanation: "Route declarations need a local probe receipt so the app can distinguish declared API surface from reachable API surface.",
    repairAction: missingRoutes.length
      ? `Add runtime surface route declaration(s): ${missingRoutes.join(", ")}.`
      : "Run npm run record:runtime-surface after route changes and keep receipts under var/.",
    verificationCommand: "npm run record:runtime-surface",
  });
}

function routeLatencyAttestation(packageManifest, routeManifest, refreshPlan) {
  const scripts = packageManifest.scripts || {};
  const requiredRoutes = ["/api/route-latency", "/api/route-latency/plan", "/api/route-latency/history"];
  const missingRoutes = requiredRoutes.filter((route) => !routeManifest.publicApiRoutes.includes(route));
  const refreshCovered = (refreshPlan.endpoints || []).includes("/api/route-latency");
  return attestation({
    id: "route-latency-heatmap",
    label: "Route latency heatmap is recordable",
    passed: Boolean(scripts["record:route-latency"]) && missingRoutes.length === 0 && refreshCovered,
    severity: "medium",
    evidence: `${scripts["record:route-latency"] ? "script present" : "script missing"}; missing routes ${missingRoutes.join(", ") || "none"}; refresh=${refreshCovered}`,
    explanation: "Heavy route and terminal surfaces need local latency receipts so future work attacks the slowest verified bottlenecks first.",
    repairAction:
      missingRoutes.length || !refreshCovered
        ? `Add route-latency route declaration(s) and refresh coverage for: ${missingRoutes.concat(refreshCovered ? [] : ["/api/route-latency"]).join(", ")}.`
        : "Run npm run record:route-latency after adding heavy public endpoints or terminal commands.",
    verificationCommand: "npm run record:route-latency",
  });
}

function privateGateAttestation(routeManifest) {
  return attestation({
    id: "private-gate",
    label: "Private runtime routes are gated",
    passed:
      routeManifest.privateApiRoutes.length >= 5 &&
      routeManifest.privateGate.envVar === "ENABLE_PRIVATE_COCKPIT" &&
      routeManifest.privateGate.publicDefaultStatus === 404,
    severity: "high",
    evidence: `${routeManifest.privateApiRoutes.length} private route(s); gate ${routeManifest.privateGate.envVar}=${routeManifest.privateGate.requiredValue}; default ${routeManifest.privateGate.publicDefaultStatus}`,
    explanation: "Runtime truth must preserve the boundary between public proof and localhost/private cockpit surfaces.",
    repairAction: "Keep private routes behind ENABLE_PRIVATE_COCKPIT=1 and localhost checks.",
    verificationCommand: "npm test",
  });
}

function publicRouteManifestAttestation(routeManifest) {
  const hasCriticalRoutes = ["/api/projects", "/api/trust", "/api/runtime-truth", "/api/opportunity-packages", "/api/terminal"].every((route) =>
    routeManifest.publicApiRoutes.includes(route),
  );
  return attestation({
    id: "public-route-manifest",
    label: "Public runtime routes are declared",
    passed: routeManifest.publicApiRoutes.length >= 40 && hasCriticalRoutes,
    severity: "medium",
    evidence: `${routeManifest.publicApiRoutes.length} public API route declaration(s)`,
    explanation: "A route manifest makes the runtime surface inspectable by agents and future validators.",
    repairAction: "Update runtimeRouteManifest whenever API routes are added or removed.",
    verificationCommand: "npm run check",
  });
}

function staticRuntimeAttestation(routeManifest) {
  const required = ["/", "/index.html", "/styles.css", "/main.js", "/app-runtime", "/three-runtime"];
  const missing = required.filter((route) => !routeManifest.staticRoutes.includes(route));
  return attestation({
    id: "static-runtime-surface",
    label: "Static runtime routes are declared",
    passed: missing.length === 0,
    severity: "medium",
    evidence: `${routeManifest.staticRoutes.length} static route(s); missing ${missing.join(", ") || "none"}`,
    explanation: "The runtime truth layer should know which static assets and module surfaces make the command center boot.",
    repairAction: missing.length ? `Add static route declaration(s): ${missing.join(", ")}.` : "Keep static runtime route declarations aligned with server.js.",
    verificationCommand: "npm run test:e2e",
  });
}

function attestation({ id, label, passed, severity, evidence, explanation, repairAction, verificationCommand }) {
  return {
    id,
    label,
    passed: Boolean(passed),
    severity,
    evidence,
    explanation,
    repairAction,
    verificationCommand,
  };
}

function scoreAttestations(items) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = items.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = items.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
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

module.exports = {
  buildRuntimeAttestation,
  buildRuntimeAttestationResponse,
  runtimeRouteManifest,
};
