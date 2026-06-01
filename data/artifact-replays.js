const REPLAY_ENDPOINT = "/api/artifact-replays";

function buildArtifactReplayCatalog({ projects, artifactCatalog, transcripts, museum, routeManifest, refreshPlan }) {
  const transcriptMap = new Map((transcripts.transcripts || []).map((transcript) => [transcript.project, transcript]));
  const readinessMap = new Map((museum.projectReadiness || []).map((project) => [project.slug, project]));
  const replays = projects.map((project) =>
    replayForProject({
      project,
      artifacts: (artifactCatalog.artifacts || []).filter((artifact) => artifact.project === project.slug),
      gaps: (artifactCatalog.gaps || []).filter((gap) => gap.project === project.slug),
      transcript: transcriptMap.get(project.slug),
      readiness: readinessMap.get(project.slug),
    }),
  );
  const checks = replayChecks({ replays, routeManifest, refreshPlan });
  const score = scoreChecks(checks);

  return {
    generatedAt: new Date().toISOString(),
    mode: "public-artifact-replay-catalog",
    sourceBoundary:
      "Artifact replays are deterministic public-safe inspection paths assembled from modeled artifacts, transcripts, API routes, terminal commands, and explicit gap records. They are not raw videos, private screenshots, shell history, production traces, or proof that external links are currently reachable.",
    replayPolicy: {
      stepRule: "Every replay must include an API step, terminal step, transcript step, preview or link step, and explicit gap step when media is missing.",
      gapRule: "Missing screenshots stay as replayable gap records until an approved served artifact exists.",
      privacyRule: "Private or approval-required artifacts stay public-safe summaries and cannot be replayed as raw private files.",
    },
    summary: {
      score,
      band: bandFor(score),
      projects: projects.length,
      replays: replays.length,
      steps: replays.reduce((sum, replay) => sum + replay.steps.length, 0),
      gapReplays: replays.reduce((sum, replay) => sum + replay.gapSteps.length, 0),
      gapClosurePlans: replays.reduce((sum, replay) => sum + replay.gapClosureSteps.length, 0),
      gapClosureActions: replays.reduce((sum, replay) => sum + replay.gapClosurePlan.length, 0),
      readyReplays: replays.filter((replay) => replay.status === "ready").length,
      reviewReplays: replays.filter((replay) => replay.status === "review").length,
      checks: checks.length,
      passing: checks.filter((check) => check.passed).length,
      routeCovered: (routeManifest.publicApiRoutes || []).includes(REPLAY_ENDPOINT),
      refreshCovered: (refreshPlan.endpoints || []).includes(REPLAY_ENDPOINT),
    },
    replays,
    checks,
    weakestReplays: replays.slice().sort((left, right) => left.score - right.score || left.projectTitle.localeCompare(right.projectTitle)).slice(0, 5),
    nextAction: replays.find((replay) => replay.status !== "ready")?.nextAction || "Keep artifact replays fresh as artifacts, transcripts, and screenshots change.",
    verificationCommand: "npm run check && node server.js # then open /api/artifact-replays",
  };
}

function buildArtifactReplayIndex(catalog, { detail = "summary", replayLimit = 3, weakestLimit = 1 } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const replays = catalog.replays || [];
  const weakestReplays = catalog.weakestReplays || [];
  const displayedReplays = fullDetail ? replays : replays.slice(0, replayLimit);
  const displayedWeakest = fullDetail ? weakestReplays : weakestReplays.slice(0, weakestLimit);
  return {
    ...(fullDetail ? { generatedAt: catalog.generatedAt } : {}),
    mode: catalog.mode,
    detail: fullDetail ? "full" : "index",
    compact: !fullDetail,
    fullDetailEndpoint: "/api/artifact-replays/:slug",
    fullIndexEndpoint: "/api/artifact-replays?detail=full",
    ...(fullDetail
      ? {
          sourceBoundary: catalog.sourceBoundary,
          replayPolicy: {
            indexRule: "Index rows expose route, score, status, step kinds, and counts only.",
            fullDetailRule:
              "Open /api/artifact-replays/:slug for replay steps, gap closure plans, source traces, privacy boundaries, and verification commands.",
          },
        }
      : {
          replayPolicyAvailable: true,
        }),
    replayIndexPolicy: fullDetail
      ? {
          detail: "full",
          fullDetail,
          fullDetailEndpoint: "/api/artifact-replays/:slug",
          fullIndexEndpoint: "/api/artifact-replays?detail=full",
          rowDetail: "route-score-status-counts-step-kinds",
          replaysReturned: displayedReplays.length,
          weakestReplaysReturned: displayedWeakest.length,
          omittedFromIndex: [],
        }
      : {
          fullDetail,
          replaysReturned: displayedReplays.length,
          weakestReplaysReturned: displayedWeakest.length,
        },
    summary: fullDetail ? catalog.summary : summarizeReplayCatalogSummary(catalog.summary),
    replays: displayedReplays.map((replay) => summarizeReplay(replay, { fullDetail })),
    ...(fullDetail
      ? {
          checks: (catalog.checks || []).map(({ id, passed, severity }) => ({
            id,
            passed: Boolean(passed),
            severity,
          })),
        }
      : {
          checkSummary: {
            total: (catalog.checks || []).length,
            passed: (catalog.checks || []).filter((check) => check.passed).length,
            failed: (catalog.checks || []).filter((check) => !check.passed).length,
          },
        }),
    weakestReplays: displayedWeakest.map((replay) => summarizeReplay(replay, { fullDetail })),
  };
}

function selectArtifactReplay(value, catalog) {
  const slug = String(value || "").toLowerCase().trim();
  return catalog.replays.find((replay) => replay.project === slug || replay.id === slug || replay.id === `${slug}.artifact-replay`) || null;
}

function buildArtifactReplayDetailResponse(replay, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "").toLowerCase() === "full";
  const fullDetailEndpoint = `${REPLAY_ENDPOINT}/${replay.project}?detail=full`;
  if (fullDetail) {
    return {
      ...replay,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      replayPayloadPolicy: replayDetailPolicy(replay, { fullDetail }),
    };
  }

  return {
    id: replay.id,
    project: replay.project,
    projectTitle: replay.projectTitle,
    score: replay.score,
    band: replay.band,
    status: replay.status,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    counts: {
      steps: replay.steps?.length || 0,
      gapSteps: replay.gapSteps?.length || 0,
      gapClosureActions: replay.gapClosurePlan?.length || 0,
    },
    steps: (replay.steps || []).map(summarizeReplayStep),
    gapClosurePlan: (replay.gapClosurePlan || []).map((item, index) => ({
      index: index + 1,
      forbiddenClaimAvailable: Boolean(item.forbiddenClaim),
      verificationCommandAvailable: Boolean(item.verificationCommand),
    })),
    readinessScore: replay.readinessScore || 0,
    publicSafe: replay.publicSafe === true,
    replayPayloadPolicy: replayDetailPolicy(replay, { fullDetail }),
  };
}

function summarizeReplayStep(step) {
  return {
    kind: step.kind,
    artifactId: step.artifactId || null,
    sourceTraceCount: step.sourceTrace?.length || 0,
  };
}

function replayDetailPolicy(replay, { fullDetail }) {
  return {
    fullDetail,
    fullDetailEndpoint: `${REPLAY_ENDPOINT}/${replay.project}?detail=full`,
    stepsReturned: replay.steps?.length || 0,
    gapClosureActionsReturned: replay.gapClosurePlan?.length || 0,
    ...(fullDetail
      ? { omittedFromSummary: [] }
      : {
          fullDetailAvailable: true,
        }),
  };
}

function summarizeReplayCatalogSummary(summary = {}) {
  return {
    score: summary.score,
    band: summary.band,
    replays: summary.replays,
    gapReplays: summary.gapReplays,
    gapClosurePlans: summary.gapClosurePlans,
    gapClosureActions: summary.gapClosureActions,
    passing: summary.passing,
  };
}

function summarizeReplay(replay, { fullDetail = false } = {}) {
  const stepKinds = [...new Set((replay.steps || []).map((step) => step.kind))];
  if (!fullDetail) {
    return {
      project: replay.project,
      score: replay.score,
      detailEndpoint: `/api/artifact-replays/${replay.project}`,
      counts: {
        steps: replay.steps?.length || 0,
        gapSteps: replay.gapSteps?.length || 0,
        gapClosureActions: replay.gapClosurePlan?.length || 0,
      },
      requiredStepKinds: stepKinds.filter((kind) => kind === "api-replay" || kind === "gap-closure-plan"),
    };
  }

  return {
    id: replay.id,
    project: replay.project,
    score: replay.score,
    detailEndpoint: `/api/artifact-replays/${replay.project}`,
    counts: {
      steps: replay.steps?.length || 0,
      gapSteps: replay.gapSteps?.length || 0,
      gapClosureSteps: replay.gapClosureSteps?.length || 0,
      gapClosureActions: replay.gapClosurePlan?.length || 0,
      artifactIds: replay.artifactIds?.length || 0,
    },
    stepKinds,
    projectTitle: replay.projectTitle,
    band: replay.band,
    status: replay.status,
    transcriptId: replay.transcriptId || null,
    readinessScore: replay.readinessScore || 0,
    publicSafe: replay.publicSafe === true,
  };
}

function replayForProject({ project, artifacts, gaps, transcript, readiness }) {
  const byType = new Map(artifacts.map((artifact) => [artifact.artifactType, artifact]));
  const steps = [
    apiStep(project, byType.get("api-replay")),
    terminalStep(project, byType.get("terminal-replay")),
    transcriptStep(project, transcript || byType.get("terminal-transcript")),
    previewStep(project, byType.get("generated-preview") || byType.get("repo-link") || byType.get("live-demo-link")),
    gapClosureStep(project, byType.get("gap-closure-plan"), gaps),
    ...gaps.map((gap) => gapStep(project, gap)),
  ].filter(Boolean);
  const gapSteps = steps.filter((step) => step.kind === "gap-record");
  const gapClosureSteps = steps.filter((step) => step.kind === "gap-closure-plan");
  const gapClosurePlan = buildGapClosurePlan({ project, gaps, closureArtifact: byType.get("gap-closure-plan") });
  const score = replayScore({ steps, gaps, transcript, readiness });
  const status = score >= 82 && gapSteps.length === 0 ? "ready" : score >= 60 ? "review" : "weak";

  return {
    id: `${project.slug}.artifact-replay`,
    project: project.slug,
    projectTitle: project.title,
    score,
    band: bandFor(score),
    status,
    steps,
    gapSteps,
    gapClosureSteps,
    gapClosurePlan,
    artifactIds: artifacts.map((artifact) => artifact.id),
    transcriptId: transcript?.id || null,
    readinessScore: readiness?.score || 0,
    publicSafe: steps.every((step) => step.publicSafe),
    privacyBoundary:
      artifacts.some((artifact) => artifact.approvalRequired)
        ? "Some artifacts are public-safe summaries and require local approval before raw media is exposed."
        : "Replay uses public artifact projections only.",
    nextAction: gapClosurePlan[0]?.action || gapSteps[0]?.repairAction || transcript?.nextAction || readiness?.nextAction || `Keep ${project.title} replay fresh.`,
    verificationCommand: `npm run check && node server.js # then open /api/artifact-replays/${project.slug}`,
  };
}

function apiStep(project, artifact) {
  return {
    id: `${project.slug}.api-step`,
    kind: "api-replay",
    label: `${project.title} case-study API replay`,
    target: artifact?.url || `/api/case-study/${project.slug}`,
    artifactId: artifact?.id || null,
    expected: "JSON case-study evidence path is inspectable.",
    publicSafe: true,
    sourceTrace: artifact?.sourceTrace || [{ type: "project-record", id: project.slug, label: project.title }],
  };
}

function terminalStep(project, artifact) {
  return {
    id: `${project.slug}.terminal-step`,
    kind: "terminal-replay",
    label: `${project.title} terminal evidence replay`,
    target: artifact?.command || `evidence ${project.slug}`,
    artifactId: artifact?.id || null,
    expected: "Terminal command returns the public-safe evidence packet.",
    publicSafe: true,
    sourceTrace: artifact?.sourceTrace || [{ type: "terminal-command", command: `evidence ${project.slug}`, label: "Evidence command" }],
  };
}

function transcriptStep(project, transcript) {
  return {
    id: `${project.slug}.transcript-step`,
    kind: "terminal-transcript",
    label: `${project.title} generated transcript replay`,
    target: transcript?.replayUrl || `/api/artifact-transcripts/${project.slug}`,
    artifactId: transcript?.id || null,
    expected: `${transcript?.lineCount || 0} transcript line(s) summarize the replay.`,
    publicSafe: transcript?.publicSafe !== false,
    sourceTrace: transcript?.sourceTrace || [{ type: "api-route", url: `/api/artifact-transcripts/${project.slug}`, label: "Artifact transcript route" }],
  };
}

function previewStep(project, artifact) {
  return {
    id: `${project.slug}.preview-step`,
    kind: artifact?.artifactType || "generated-preview",
    label: `${project.title} visual or link inspection`,
    target: artifact?.url || `/api/og/${project.slug}.svg`,
    artifactId: artifact?.id || null,
    expected: "Preview, repository, live link, or generated image is inspectable as public-safe artifact metadata.",
    publicSafe: true,
    sourceTrace: artifact?.sourceTrace || [{ type: "api-route", url: `/api/og/${project.slug}.svg`, label: "Generated SVG preview route" }],
  };
}

function gapClosureStep(project, artifact, gaps) {
  if (!gaps.length) return null;
  return {
    id: `${project.slug}.gap-closure-step`,
    kind: "gap-closure-plan",
    label: `${project.title} public-safe gap closure plan`,
    target: artifact?.url || `/api/artifact-replays/${project.slug}`,
    artifactId: artifact?.id || null,
    expected: `${gaps.length} media gap(s) are paired with a closure plan before richer media is claimed.`,
    publicSafe: true,
    sourceTrace:
      artifact?.sourceTrace || [
        { type: "gap-record", id: `${project.slug}.screenshot-gap`, label: `${project.title} screenshot gap` },
        { type: "api-route", url: `/api/artifact-replays/${project.slug}`, label: "Artifact replay route" },
      ],
    repairAction: artifact
      ? `Use ${artifact.id} to close or preserve the public-safe gap record.`
      : `Add a public-safe gap closure plan artifact for ${project.title}.`,
  };
}

function gapStep(project, gap) {
  return {
    id: `${project.slug}.${gap.gapType}-gap-step`,
    kind: "gap-record",
    label: gap.label,
    target: gap.id,
    artifactId: gap.id,
    expected: `${gap.neededArtifact} is explicitly missing until repaired.`,
    publicSafe: true,
    sourceTrace: gap.sourceTrace || [{ type: "project-record", id: project.slug, label: project.title }],
    repairAction: gap.suggestedRepair,
  };
}

function buildGapClosurePlan({ project, gaps, closureArtifact }) {
  if (!gaps.length) {
    return [
      {
        rank: 1,
        gapId: null,
        action: `Keep ${project.title} replay proof fresh after media changes.`,
        acceptance: "No explicit media gap is currently modeled for this replay.",
        verificationCommand: `npm run check && node server.js # then open /api/artifact-replays/${project.slug}`,
      },
    ];
  }
  return gaps.map((gap, index) => ({
    rank: index + 1,
    gapId: gap.id,
    action: gap.suggestedRepair,
    acceptance: `${gap.neededArtifact} remains a public-safe gap until a served artifact with source trace replaces it.`,
    fallbackArtifactId: closureArtifact?.id || null,
    forbiddenClaim: "Do not claim a screenshot, video, private file, or live recording exists until a public-safe served artifact is attached.",
    verificationCommand: `npm run check && node server.js # then open /api/artifact-replays/${project.slug}`,
  }));
}

function replayChecks({ replays, routeManifest, refreshPlan }) {
  return [
    check("project-replay-coverage", replays.length > 0 && replays.every((replay) => replay.steps.length >= 4), "Every project should have a multi-step replay path.", "high"),
    check("api-step-coverage", replays.every((replay) => replay.steps.some((step) => step.kind === "api-replay")), "Every replay should include an API replay step.", "high"),
    check("terminal-step-coverage", replays.every((replay) => replay.steps.some((step) => step.kind === "terminal-replay")), "Every replay should include a terminal replay step.", "medium"),
    check("transcript-step-coverage", replays.every((replay) => replay.steps.some((step) => step.kind === "terminal-transcript")), "Every replay should include a transcript step.", "medium"),
    check("gap-honesty", replays.every((replay) => replay.gapSteps.length > 0 && replay.gapSteps.every((step) => step.repairAction)), "Every replay should keep screenshot/media gaps explicit until repaired.", "high"),
    check(
      "gap-closure-plan",
      replays.every(
        (replay) =>
          replay.gapClosureSteps.length > 0 &&
          replay.gapClosurePlan.length >= replay.gapSteps.length &&
          replay.gapClosurePlan.every((item) => item.action && item.acceptance && item.forbiddenClaim && item.verificationCommand),
      ),
      "Every replay gap should include a closure plan, acceptance rule, forbidden claim, and verification command.",
      "high",
    ),
    check("public-safe-replays", replays.every((replay) => replay.publicSafe), "Every replay step should remain public-safe.", "high"),
    check("route-manifest", (routeManifest.publicApiRoutes || []).includes(REPLAY_ENDPOINT), `${REPLAY_ENDPOINT} route manifest coverage.`, "medium"),
    check("refresh-plan", (refreshPlan.endpoints || []).includes(REPLAY_ENDPOINT), `${REPLAY_ENDPOINT} refresh coverage.`, "medium"),
  ].map((item) => ({
    ...item,
    verificationCommand: "npm run check && node server.js # then open /api/artifact-replays",
  }));
}

function replayScore({ steps, gaps, transcript, readiness }) {
  const api = steps.some((step) => step.kind === "api-replay") ? 100 : 0;
  const terminal = steps.some((step) => step.kind === "terminal-replay") ? 100 : 0;
  const closure = steps.some((step) => step.kind === "gap-closure-plan") ? 100 : 0;
  const transcriptScore = transcript?.transcriptScore || 0;
  const readinessScore = readiness?.score || 0;
  const gapHonesty = gaps.length ? 80 : 100;
  return Math.round(api * 0.16 + terminal * 0.14 + closure * 0.12 + transcriptScore * 0.22 + readinessScore * 0.22 + gapHonesty * 0.14);
}

function check(id, passed, detail, severity) {
  return {
    id,
    label: labelFor(id),
    passed: Boolean(passed),
    severity,
    detail,
  };
}

function scoreChecks(checks) {
  const weights = { high: 1.4, medium: 1 };
  const max = checks.reduce((sum, check) => sum + weights[check.severity], 0);
  const earned = checks.filter((check) => check.passed).reduce((sum, check) => sum + weights[check.severity], 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function bandFor(score) {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function labelFor(id) {
  return id
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

module.exports = {
  REPLAY_ENDPOINT,
  buildArtifactReplayDetailResponse,
  buildArtifactReplayCatalog,
  buildArtifactReplayIndex,
  selectArtifactReplay,
};
