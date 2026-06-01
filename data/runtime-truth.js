const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const STORE_RELATIVE_PATH = path.join("var", "runtime-truth-receipts.json");
const maxReceipts = 50;
const latestReceiptCache = new Map();
const historyWindowCache = new Map();

function runtimeTruthPlan() {
  return {
    mode: "runtime-truth-fingerprint-plan",
    command: "npm run record:runtime",
    scheduleRecommendation: "Run after changing build scripts, deploy targets, domains, package metadata, route manifests, refresh coverage, private gates, or runtime hosting.",
    sideEffectBoundary:
      "The recorder starts a temporary local server, reads public-safe runtime endpoints, writes a local receipt under var/, and does not deploy, publish, mutate git history, or query private provider dashboards.",
    endpoints: ["/api/runtime-truth", "/api/runtime-truth/fingerprint", "/api/runtime-truth/attestation", "/api/runtime-surface/latest", "/api/route-latency"],
    receiptStore: STORE_RELATIVE_PATH,
  };
}

function buildRuntimeTruthReport({ truth, history = [] }) {
  const current = fingerprintRuntimeTruth(truth);
  const previous = history[0] || null;
  const diff = diffFingerprints({ current, previous: previous?.fingerprint || null });
  const checks = runtimeChecks(truth, current, previous);
  const readiness = summarizeReadiness(checks);

  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-truth-fingerprint",
    sourceBoundary:
      "This report fingerprints the current server response, package/build/git/domain declarations, and local receipt history. It does not claim remote deploy-provider identity unless that provider exposes it in this runtime.",
    plan: runtimeTruthPlan(),
    current,
    previous: previous
      ? {
          id: previous.id,
          checkedAt: previous.checkedAt,
          identityHash: previous.fingerprint.identityHash,
          volatileHash: previous.fingerprint.volatileHash,
          readinessScore: previous.summary.readinessScore,
          readinessBand: previous.summary.readinessBand,
        }
      : null,
    diff,
    checks,
    readiness,
  };
}

function buildRuntimeTruthResponse(report, { detail = "summary" } = {}) {
  const fullDetail = String(detail || "summary").toLowerCase() === "full";
  const fullDetailEndpoint = "/api/runtime-truth/fingerprint?detail=full";
  if (fullDetail) {
    return {
      ...report,
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      runtimeTruthPayloadPolicy: {
        fullDetail: true,
        fullDetailEndpoint,
        fullFieldsPreserved: ["plan", "current.identity", "current.volatile", "diff.changes", "checks.detail"],
      },
    };
  }

  return {
    mode: report.mode,
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    sourceBoundaryAvailable: Boolean(report.sourceBoundary),
    plan: {
      commandAvailable: Boolean(report.plan?.command),
      endpointCount: report.plan?.endpoints?.length || 0,
    },
    current: summarizeRuntimeTruthCurrent(report.current),
    previous: report.previous
      ? {
          id: report.previous.id,
          identityHash: report.previous.identityHash,
          volatileHash: report.previous.volatileHash,
          readinessScore: report.previous.readinessScore,
        }
      : null,
    diff: {
      summary: summarizeRuntimeTruthDiffSummary(report.diff?.summary),
      interpretationAvailable: Boolean(report.diff?.interpretation),
    },
    checks: (report.checks || []).map((check) => ({
      id: check.id,
      passed: Boolean(check.passed),
    })),
    readiness: {
      score: report.readiness?.score || 0,
      maxScore: report.readiness?.maxScore || 100,
      band: report.readiness?.band || "unknown",
      checks: report.readiness?.checks || 0,
      passing: report.readiness?.passing || 0,
      failing: report.readiness?.failing || 0,
      recommendationCount: report.readiness?.recommendations?.length || 0,
    },
    runtimeTruthPayloadPolicy: {
      fullDetail: false,
      fullDetailAvailable: true,
      omittedFromSummaryCount: 6,
    },
  };
}

function appendRuntimeTruthReceipt(root, report) {
  const receipt = {
    id: `runtime-${Date.now().toString(36)}`,
    checkedAt: report.generatedAt,
    mode: report.mode,
    baseUrl: report.current.volatile.baseUrl,
    summary: {
      readinessScore: report.readiness.score,
      readinessBand: report.readiness.band,
      checks: report.readiness.checks,
      passing: report.readiness.passing,
      failing: report.readiness.failing,
      identityChanged: report.diff.summary.identityChanged,
      volatileChanged: report.diff.summary.volatileChanged,
      changed: report.diff.summary.changed,
    },
    fingerprint: report.current,
    diff: report.diff,
    sideEffectBoundary: runtimeTruthPlan().sideEffectBoundary,
  };

  const receipts = readRuntimeTruthReceipts(root);
  receipts.unshift(receipt);
  writeReceipts(root, receipts.slice(0, maxReceipts));
  return receipt;
}

function readRuntimeTruthReceipts(root) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  if (!existsSync(storePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return Array.isArray(parsed.receipts) ? parsed.receipts : [];
  } catch {
    return [];
  }
}

function readLatestRuntimeTruthReceipt(root) {
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

function readRuntimeTruthHistoryWindow(root, { limit = 20 } = {}) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  const boundedLimit = boundedHistoryLimit(limit);
  if (!existsSync(storePath)) return { receipts: [], totalAvailable: 0 };
  try {
    const storeKey = receiptCacheKey(storePath);
    const cacheKey = `${storeKey}:${boundedLimit}`;
    const cached = historyWindowCache.get(storePath);
    if (cached?.cacheKey === cacheKey) return cached.window;
    const receipts = readRuntimeTruthReceipts(root);
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

function buildRuntimeTruthHistory({ receipts = [], limit, totalAvailable = receipts.length, detail = "summary" } = {}) {
  const fullDetail = String(detail || "summary").toLowerCase() === "full";
  const boundedLimit = boundedHistoryLimit(limit ?? (fullDetail ? 20 : 5));
  const limited = receipts.slice(0, boundedLimit);
  const fullDetailEndpoint = "/api/runtime-truth/history?detail=full";
  if (fullDetail) {
    const historyPayloadPolicy = {
      fullDetail: true,
      defaultDetail: "summary",
      defaultSummaryLimit: 5,
      fullDetailEndpoint,
      receiptsReturned: limited.length,
      totalAvailable,
      compactLatestReceiptDetail: false,
      compactTrendReceipts: 0,
      omittedFromDefault: [
        "raw receipt mode",
        "recorder base URLs",
        "full fingerprint identity objects",
        "full fingerprint volatile objects",
        "full diff changes",
        "side-effect boundary prose",
      ],
    };
    return {
      generatedAt: new Date().toISOString(),
      mode: "runtime-truth-history",
      detail: "full",
      compact: false,
      fullDetailEndpoint,
      historyPayloadPolicy,
      sourceBoundary:
        "This endpoint returns full local runtime-truth receipts. It does not deploy, publish, mutate git history, query provider dashboards, or write to external systems.",
      sideEffectBoundary:
        "The history endpoint reads local runtime-truth receipts only and does not deploy, publish, mutate git history, query provider dashboards, or write to external systems.",
      receiptStore: STORE_RELATIVE_PATH,
      summary: summarizeRuntimeTruthHistoryTopline({ limited, totalAvailable, boundedLimit }),
      receipts: limited,
      nextAction: limited[0]
        ? "Runtime truth history is available; run npm run record:runtime after build, route, domain, git, or deployment-surface changes."
        : "Run npm run record:runtime to create runtime truth history.",
      verificationCommand: "npm run record:runtime && node --test test/api-contract.test.mjs",
    };
  }

  const historyPayloadPolicy = {
    fullDetail: false,
    defaultSummaryLimit: 5,
    receiptsReturned: limited.length,
    totalAvailable,
    fullDetailAvailable: true,
  };
  return {
    generatedAt: new Date().toISOString(),
    mode: "runtime-truth-history",
    detail: "summary",
    compact: true,
    fullDetailEndpoint,
    historyPayloadPolicy,
    sourceBoundaryAvailable: true,
    sideEffectBoundaryAvailable: true,
    summary: summarizeRuntimeTruthHistoryTopline({ limited, totalAvailable, boundedLimit }),
    definitions: {
      fullHistoryEndpoint: fullDetailEndpoint,
    },
    receipts: limited.map((receipt, index) => (index === 0 ? summarizeRuntimeTruthReceipt(receipt) : summarizeRuntimeTruthTrendReceipt(receipt))),
    nextActionAvailable: Boolean(limited[0]),
    verificationCommandAvailable: true,
  };
}

function summarizeRuntimeTruthHistoryTopline({ limited, totalAvailable, boundedLimit }) {
  return {
    receipts: limited.length,
    totalAvailable,
    limit: boundedLimit,
    latestReceiptId: limited[0]?.id || null,
    latestReadinessScore: limited[0]?.summary?.readinessScore || 0,
    latestReadinessBand: limited[0]?.summary?.readinessBand || null,
  };
}

function summarizeRuntimeTruthReceipt(receipt) {
  return {
    id: receipt.id,
    checkedAt: receipt.checkedAt,
    summary: summarizeRuntimeTruthReceiptSummary(receipt.summary),
    fingerprint: {
      identityHash: receipt.fingerprint?.identityHash || null,
      volatileHash: receipt.fingerprint?.volatileHash || null,
      publicApiRoutes: receipt.fingerprint?.identity?.publicApiRoutes || 0,
      privateGateDefaultStatus: receipt.fingerprint?.identity?.privateGateDefaultStatus || null,
    },
    diffSummary: summarizeRuntimeTruthDiffSummary(receipt.diff?.summary),
  };
}

function summarizeRuntimeTruthCurrent(current = {}) {
  const identity = current.identity || {};
  return {
    identityHash: current.identityHash || null,
    volatileHash: current.volatileHash || null,
    identity: {
      environment: identity.environment || null,
      packageName: identity.packageName || null,
      gitState: identity.gitState || null,
      buildBundled: identity.buildBundled === true,
      runtimeBytes: identity.runtimeBytes || 0,
      nodeMajor: identity.nodeMajor || null,
      publicApiRoutes: identity.publicApiRoutes || 0,
      privateApiRoutes: identity.privateApiRoutes || 0,
      staticRoutes: identity.staticRoutes || 0,
      refreshEndpoints: identity.refreshEndpoints || 0,
      privateRefreshEndpoints: identity.privateRefreshEndpoints || 0,
      privateGateDefaultStatus: identity.privateGateDefaultStatus || null,
      privateGateLocalhostOnly: identity.privateGateLocalhostOnly === true,
      criticalRuntimeScripts: identity.criticalRuntimeScripts || {},
    },
    volatileAvailable: Boolean(current.volatile),
  };
}

function summarizeRuntimeTruthTrendReceipt(receipt) {
  return {
    id: receipt.id,
    summary: summarizeRuntimeTruthReceiptSummary(receipt.summary),
    latestReceiptPreviewOnly: true,
  };
}

function summarizeRuntimeTruthReceiptSummary(summary = {}) {
  return {
    readinessScore: summary.readinessScore || 0,
    readinessBand: summary.readinessBand || "unknown",
    changed: summary.changed || 0,
    identityChanged: summary.identityChanged || 0,
    volatileChanged: summary.volatileChanged || 0,
  };
}

function summarizeRuntimeTruthDiffSummary(summary = {}) {
  return {
    hasPrevious: summary.hasPrevious === true,
    changed: summary.changed || 0,
    identityChanged: summary.identityChanged || 0,
    volatileChanged: summary.volatileChanged || 0,
  };
}

function fingerprintRuntimeTruth(truth) {
  const surfaceContract = truth.surfaceContract || {};
  const identity = {
    environment: truth.runtime.environment,
    packageName: truth.package.name,
    packageVersion: truth.package.version,
    packagePrivate: truth.package.private,
    gitState: truth.git.state,
    gitBranch: truth.git.branch || null,
    gitCommit: truth.git.commit || null,
    buildBundled: truth.build.isBundled,
    buildBytes: truth.build.bytes,
    runtimeBytes: truth.build.runtimeBytes,
    nodeMajor: nodeMajor(truth.runtime.node),
    domainCount: truth.domains.length,
    domainUrls: truth.domains.map((domain) => domain.url).sort(),
    publicApiRoutes: surfaceContract.publicApiRoutes || 0,
    privateApiRoutes: surfaceContract.privateApiRoutes || 0,
    staticRoutes: surfaceContract.staticRoutes || 0,
    refreshEndpoints: surfaceContract.refreshEndpoints || 0,
    privateRefreshEndpoints: surfaceContract.privateRefreshEndpoints || 0,
    privateGateDefaultStatus: surfaceContract.privateGate?.publicDefaultStatus || null,
    privateGateLocalhostOnly: surfaceContract.privateGate?.localhostOnly === true,
    criticalRuntimeScripts: surfaceContract.criticalScripts || {},
    deployComparisonInputs: surfaceContract.deployComparisonInputs || [],
  };
  const volatile = {
    baseUrl: truth.runtime.baseUrl,
    node: truth.runtime.node,
    pid: truth.runtime.pid,
    port: truth.runtime.port,
  };

  return {
    identityHash: hashObject(identity),
    volatileHash: hashObject(volatile),
    identity,
    volatile,
    hashInputs: {
      identity: Object.keys(identity),
      volatile: Object.keys(volatile),
    },
  };
}

function diffFingerprints({ current, previous }) {
  if (!previous) {
    return {
      summary: {
        hasPrevious: false,
        changed: 0,
        identityChanged: 0,
        volatileChanged: 0,
      },
      changes: [],
      interpretation: "No previous runtime truth receipt exists yet. Record once more to compare drift.",
    };
  }

  const identityChanges = compareObjects("identity", current.identity, previous.identity || {});
  const volatileChanges = compareObjects("volatile", current.volatile, previous.volatile || {});
  const changes = [...identityChanges, ...volatileChanges];
  const identityHashChanged = current.identityHash !== previous.identityHash;
  const volatileHashChanged = current.volatileHash !== previous.volatileHash;

  return {
    summary: {
      hasPrevious: true,
      changed: changes.length,
      identityChanged: identityChanges.length,
      volatileChanged: volatileChanges.length,
      identityHashChanged,
      volatileHashChanged,
    },
    changes,
    interpretation: interpretationForDiff({ identityChanges, volatileChanges, identityHashChanged, volatileHashChanged }),
  };
}

function runtimeChecks(truth, current, previous) {
  const isLocal = truth.runtime.environment === "local";
  const hostUsesExpectedProtocol = isLocal ? truth.runtime.baseUrl.startsWith("http://") : truth.runtime.baseUrl.startsWith("https://");
  const surfaceContract = truth.surfaceContract || {};
  const criticalScripts = surfaceContract.criticalScripts || {};
  const criticalScriptValues = Object.values(criticalScripts);
  return [
    check("runtime-environment", truth.runtime.environment === "local" || truth.runtime.environment === "vercel", "high", `environment=${truth.runtime.environment}`),
    check("package-identity", truth.package.name === "rishabh-personal-command-center" && truth.package.private === true, "high", `${truth.package.name}@${truth.package.version}`),
    check("inline-runtime-bundle", truth.build.isBundled && truth.build.runtimeBytes > 0, "high", `${truth.build.runtimeBytes} runtime marker bytes`),
    check("git-identity", truth.git.state === "commit-readable" || truth.git.state === "detached", "medium", `${truth.git.state} on ${truth.git.branch || truth.git.ref || "no ref"}`),
    check("domain-declarations", truth.domains.length >= 3 && truth.domains.every((domain) => domain.trackedByStatus), "medium", `${truth.domains.length} configured production domain(s)`),
    check(
      "surface-contract",
      surfaceContract.publicApiRoutes >= 80 &&
        surfaceContract.privateApiRoutes >= 1 &&
        surfaceContract.staticRoutes >= 1 &&
        surfaceContract.refreshEndpoints >= 20 &&
        surfaceContract.privateRefreshEndpoints === 0 &&
        surfaceContract.privateGate?.publicDefaultStatus === 404,
      "high",
      `public=${surfaceContract.publicApiRoutes || 0}; private=${surfaceContract.privateApiRoutes || 0}; static=${surfaceContract.staticRoutes || 0}; refresh=${surfaceContract.refreshEndpoints || 0}; privateRefresh=${surfaceContract.privateRefreshEndpoints || 0}; privateGate=${surfaceContract.privateGate?.publicDefaultStatus || "missing"}`,
    ),
    check(
      "critical-script-contract",
      criticalScriptValues.length >= 7 && criticalScriptValues.every(Boolean),
      "medium",
      Object.entries(criticalScripts)
        .map(([key, value]) => `${key}=${Boolean(value)}`)
        .join("; "),
    ),
    check("protocol-disclosure", hostUsesExpectedProtocol, "medium", `${truth.runtime.baseUrl} from ${truth.runtime.environment}`),
    check("identity-fingerprint", current.identityHash.length >= 12 && current.hashInputs.identity.length >= 8, "high", current.identityHash),
    check("volatile-isolation", current.volatileHash.length >= 12 && current.hashInputs.volatile.includes("pid"), "medium", "port, pid, host, and node version are isolated from identity drift"),
    check(
      "diff-readiness",
      !previous || previous.fingerprint?.identityHash === current.identityHash || Array.isArray(previous.diff?.changes),
      "low",
      previous ? `previous=${previous.id}` : "no previous receipt yet",
    ),
  ];
}

function summarizeReadiness(checks) {
  const weights = { high: 18, medium: 11, low: 6 };
  const max = checks.reduce((sum, item) => sum + weights[item.severity], 0);
  const earned = checks.filter((item) => item.passed).reduce((sum, item) => sum + weights[item.severity], 0);
  const score = max ? Math.round((earned / max) * 100) : 0;
  const failing = checks.filter((item) => !item.passed);
  return {
    score,
    maxScore: 100,
    band: score >= 85 ? "high" : score >= 65 ? "medium" : "low",
    checks: checks.length,
    passing: checks.length - failing.length,
    failing: failing.length,
    recommendations: failing.length ? failing.map((item) => recommendationFor(item)) : ["Runtime truth fingerprint is stable enough for local verification."],
  };
}

function compareObjects(scope, current, previous) {
  const keys = [...new Set([...Object.keys(current), ...Object.keys(previous)])].sort();
  return keys
    .filter((key) => stableStringify(current[key]) !== stableStringify(previous[key]))
    .map((key) => ({
      id: `${scope}.${key}`,
      scope,
      key,
      previous: previous[key] === undefined ? null : previous[key],
      current: current[key] === undefined ? null : current[key],
      impact: scope === "identity" ? "runtime identity changed; verify deploy/build intent before publishing" : "volatile runtime detail changed; usually expected across local runs",
    }));
}

function interpretationForDiff({ identityChanges, volatileChanges, identityHashChanged, volatileHashChanged }) {
  if (!identityHashChanged && !volatileHashChanged) return "No runtime truth drift from the previous receipt.";
  if (identityChanges.length > 0) return "Runtime identity changed. Review package, build, git, Node major version, and domain declarations before treating this as the same deploy surface.";
  if (volatileChanges.length > 0) return "Only volatile runtime fields changed. This is expected when the local server restarts on another PID, port, host, or Node patch version.";
  return "Hash drift was detected without field-level changes; rerun the recorder and inspect the receipt store.";
}

function recommendationFor(item) {
  if (item.id === "git-identity") return "Create or restore a readable git commit/ref before using runtime truth as deployment evidence.";
  if (item.id === "inline-runtime-bundle") return "Run npm run build:inline so index.html contains the bundled command-center runtime.";
  if (item.id === "domain-declarations") return "Keep production domains modeled in data/portfolio-data.js and covered by status checks.";
  if (item.id === "surface-contract") return "Keep route counts, refresh endpoints, and private gate policy in the runtime truth fingerprint.";
  if (item.id === "critical-script-contract") return "Restore the runtime verification scripts required by the runtime truth receipt chain.";
  if (item.id === "protocol-disclosure") return "Verify local responses use http and hosted responses use https.";
  return `Investigate runtime truth check ${item.id}.`;
}

function check(id, passed, severity, detail) {
  return { id, passed: Boolean(passed), severity, detail };
}

function hashObject(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function nodeMajor(version) {
  const match = String(version || "").match(/^v?(\d+)/);
  return match ? Number(match[1]) : null;
}

function writeReceipts(root, receipts) {
  const storePath = path.join(root, STORE_RELATIVE_PATH);
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify({ receipts }, null, 2)}\n`);
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

module.exports = {
  appendRuntimeTruthReceipt,
  buildRuntimeTruthReport,
  buildRuntimeTruthResponse,
  buildRuntimeTruthHistory,
  readLatestRuntimeTruthReceipt,
  readRuntimeTruthHistoryWindow,
  readRuntimeTruthReceipts,
  runtimeTruthPlan,
};
