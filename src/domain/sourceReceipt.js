export const sourceReceiptSchemaVersion = 2;

const receiptOrigins = new Set(["live-official-search", "built-in-catalog", "user-pasted", "legacy-cache"]);
const verificationStates = new Set(["open", "closed", "unknown", "needs-review", "manual"]);
const verificationReasons = new Set([
  "live-search-verified", "url-check-open", "url-check-closed", "url-check-unknown", "url-open",
  "http-404-or-410", "closed-page-signal", "ashby-published", "ashby-not-published",
  "network-or-inconclusive", "bounded-response", "redirect-inconclusive", "invalid-or-unsafe-url",
  "built-in-catalog-needs-review", "manual-jd-needs-review", "manual-jd-no-application-url", "legacy-cache-needs-review",
]);
const sourceArtifactKinds = new Set(["official-response", "user-provided-jd", "missing"]);
const summaryArtifactKinds = new Set(["agent-paraphrase", "legacy-agent-paraphrase", "missing"]);
const hashAlgorithms = new Set(["sha-256", "fnv-1a-32", "legacy-unknown", "none"]);

function stringValue(value) { return typeof value === "string" ? value.trim() : ""; }
function asUrl(value) { try { return new URL(value); } catch { return null; } }

export function normalizeReceiptUrl(value) {
  const url = asUrl(value);
  if (!url || url.protocol !== "https:" || url.username || url.password) return "";
  url.hash = "";
  return url.href;
}

function normalizeReceiptTimestamp(value) {
  const timestamp = Date.parse(stringValue(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function normalizeHash(value, algorithm) {
  const contentHash = stringValue(value);
  const hashAlgorithm = hashAlgorithms.has(stringValue(algorithm)) ? stringValue(algorithm) : "none";
  const valid = (hashAlgorithm === "sha-256" && /^[a-f0-9]{64}$/i.test(contentHash))
    || (hashAlgorithm === "fnv-1a-32" && /^[a-f0-9]{8}$/i.test(contentHash))
    || (hashAlgorithm === "legacy-unknown" && /^[\w.-]{1,128}$/u.test(contentHash));
  return valid ? { contentHash, hashAlgorithm } : { contentHash: "", hashAlgorithm: "none" };
}

function emptySourceArtifact() {
  return { kind: "missing", sourceUrl: "", capturedAt: "", byteLength: 0, complete: false, contentHash: "", hashAlgorithm: "none" };
}

function normalizeSourceArtifact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptySourceArtifact();
  const kind = sourceArtifactKinds.has(stringValue(value.kind)) ? stringValue(value.kind) : "missing";
  if (kind === "missing" || value.complete !== true) return emptySourceArtifact();
  const sourceUrl = normalizeReceiptUrl(value.sourceUrl);
  const capturedAt = normalizeReceiptTimestamp(value.capturedAt);
  const byteLength = Number.isSafeInteger(value.byteLength) && value.byteLength > 0 ? value.byteLength : 0;
  const { contentHash, hashAlgorithm } = normalizeHash(value.contentHash, value.hashAlgorithm);
  if (!byteLength || !contentHash || hashAlgorithm === "none") return emptySourceArtifact();
  if (kind === "official-response" && (!sourceUrl || !capturedAt)) return emptySourceArtifact();
  return { kind, sourceUrl: kind === "official-response" ? sourceUrl : "", capturedAt, byteLength, complete: true, contentHash, hashAlgorithm };
}

function emptySummaryArtifact() {
  return { kind: "missing", generatedAt: "", contentHash: "", hashAlgorithm: "none" };
}

function normalizeSummaryArtifact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptySummaryArtifact();
  const kind = summaryArtifactKinds.has(stringValue(value.kind)) ? stringValue(value.kind) : "missing";
  const { contentHash, hashAlgorithm } = normalizeHash(value.contentHash, value.hashAlgorithm);
  const generatedAt = normalizeReceiptTimestamp(value.generatedAt);
  if (kind === "missing" || !contentHash || hashAlgorithm === "none" || (kind === "agent-paraphrase" && !generatedAt)) return emptySummaryArtifact();
  return { kind, generatedAt, contentHash, hashAlgorithm };
}

export function derivePostingUrl(value) {
  const normalized = normalizeReceiptUrl(value);
  if (!normalized) return "";
  const url = new URL(normalized);
  const host = url.hostname.toLowerCase();
  if (host === "jobs.ashbyhq.com" && /\/application\/?$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/application\/?$/i, "");
  if (host === "jobs.lever.co" && /\/apply\/?$/i.test(url.pathname)) url.pathname = url.pathname.replace(/\/apply\/?$/i, "");
  return url.href;
}

function firstReceiptUrl(...values) { return values.map(normalizeReceiptUrl).find(Boolean) ?? ""; }
function firstPathId(url, matcher) { return url.pathname.match(matcher)?.[1] ?? ""; }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

export function deriveOfficialJobProvider(value) {
  const url = asUrl(value);
  if (!url || url.protocol !== "https:") return { provider: "unknown", providerJobId: "" };
  const host = url.hostname.toLowerCase();
  if (host === "jobs.ashbyhq.com") { const id = firstPathId(url, /^\/[^/]+\/([^/]+)(?:\/|$)/); return { provider: "ashby", providerJobId: isUuid(id) ? id : "" }; }
  const greenhouseId = url.searchParams.get("gh_jid") ?? "";
  if (host === "job-boards.greenhouse.io" || host === "boards.greenhouse.io" || host === "boards.eu.greenhouse.io" || /^\d+$/.test(greenhouseId)) {
    const id = greenhouseId || firstPathId(url, /^\/[^/]+\/jobs\/([^/]+)(?:\/|$)/); return { provider: "greenhouse", providerJobId: /^\d+$/.test(id) ? id : "" };
  }
  if (host === "jobs.lever.co") { const id = firstPathId(url, /^\/[^/]+\/([^/]+)(?:\/|$)/); return { provider: "lever", providerJobId: isUuid(id) ? id : "" }; }
  if (host === "jobs.apple.com") { const id = firstPathId(url, /\/details\/(\d+(?:-\d+)?)(?:[-/]|$)/); return { provider: "apple-jobs", providerJobId: id || "" }; }
  if (host === "career.huawei.com") { const id = url.searchParams.get("jobId") ?? ""; return { provider: "huawei-careers", providerJobId: /^\d+$/.test(id) ? id : "" }; }
  if (host === "hr.xiaomi.com") { const id = firstPathId(url, /^\/job\/view\/(\d+)(?:\/|$)/); return { provider: "xiaomi-careers", providerJobId: id || "" }; }
  if (host === "stripe.com" || host === "www.stripe.com") { const id = firstPathId(url, /^\/jobs\/listing\/[^/]+\/(\d+)(?:\/|$)/); return { provider: "stripe-jobs", providerJobId: id || "" }; }
  return { provider: "official-company-site", providerJobId: "" };
}

export function verificationStateFromJob(job) {
  return ({ verified: "open", unavailable: "closed", unknown: "unknown", "needs-review": "needs-review", manual: "manual" })[job?.verificationStatus] ?? "needs-review";
}

function defaultReason(origin, state) {
  if (origin === "live-official-search") return state === "open" ? "live-search-verified" : ["closed", "unknown"].includes(state) ? `url-check-${state}` : "network-or-inconclusive";
  if (origin === "built-in-catalog") return "built-in-catalog-needs-review";
  if (origin === "user-pasted") return state === "manual" ? "manual-jd-no-application-url" : "manual-jd-needs-review";
  return "legacy-cache-needs-review";
}

function inferredOrigin(job) {
  if (job?.sourceOrigin === "built-in-catalog") return "built-in-catalog";
  if (job?.jdSource === "user-pasted" || job?.source === "手动 JD" || String(job?.id ?? "").startsWith("imported-")) return "user-pasted";
  return "legacy-cache";
}

function legacyArtifacts(existing, job, origin) {
  const contentHash = stringValue(existing?.jdHash) || stringValue(job?.jdHash);
  const hashAlgorithm = stringValue(existing?.jdHashAlgorithm) || stringValue(job?.jdHashAlgorithm)
    || (origin === "user-pasted" && contentHash ? "fnv-1a-32" : contentHash ? "legacy-unknown" : "none");
  if (!contentHash) return { sourceArtifact: emptySourceArtifact(), summaryArtifact: emptySummaryArtifact() };
  if (origin === "user-pasted") {
    const byteLength = new TextEncoder().encode(String(job?.jdText ?? "")).byteLength;
    return {
      sourceArtifact: normalizeSourceArtifact({ kind: "user-provided-jd", complete: true, byteLength, contentHash, hashAlgorithm }),
      summaryArtifact: emptySummaryArtifact(),
    };
  }
  return { sourceArtifact: emptySourceArtifact(), summaryArtifact: normalizeSummaryArtifact({ kind: "legacy-agent-paraphrase", contentHash, hashAlgorithm }) };
}

export function normalizeSourceReceipt(job) {
  const existing = job?.sourceReceipt && typeof job.sourceReceipt === "object" && !Array.isArray(job.sourceReceipt) ? job.sourceReceipt : null;
  const origin = receiptOrigins.has(existing?.origin) ? existing.origin : inferredOrigin(job);
  const applyUrl = firstReceiptUrl(existing?.applyUrl, job?.applyUrl);
  const postingUrl = derivePostingUrl(firstReceiptUrl(existing?.postingUrl, job?.url, applyUrl));
  const providerData = deriveOfficialJobProvider(applyUrl || postingUrl);
  const verificationState = verificationStates.has(existing?.verificationState) ? existing.verificationState
    : origin === "user-pasted" && !applyUrl ? "manual"
      : ["legacy-cache", "built-in-catalog"].includes(origin) ? "needs-review" : verificationStateFromJob(job);
  const sourceArtifact = normalizeSourceArtifact(existing?.sourceArtifact);
  const summaryArtifact = normalizeSummaryArtifact(existing?.summaryArtifact);
  const legacy = sourceArtifact.kind === "missing" && summaryArtifact.kind === "missing" ? legacyArtifacts(existing, job, origin) : null;
  return {
    schemaVersion: sourceReceiptSchemaVersion,
    origin,
    provider: providerData.provider,
    providerJobId: providerData.providerJobId,
    postingUrl,
    applyUrl,
    fetchedAt: normalizeReceiptTimestamp(existing?.fetchedAt),
    verificationState,
    verifiedAt: normalizeReceiptTimestamp(existing?.verifiedAt) || (origin === "live-official-search" ? normalizeReceiptTimestamp(job?.verifiedAt) : ""),
    verificationReason: verificationReasons.has(stringValue(existing?.verificationReason)) ? stringValue(existing?.verificationReason) : defaultReason(origin, verificationState),
    sourceArtifact: legacy?.sourceArtifact ?? sourceArtifact,
    summaryArtifact: legacy?.summaryArtifact ?? summaryArtifact,
  };
}

export function withNormalizedSourceReceipt(job) {
  const sourceReceipt = normalizeSourceReceipt(job);
  return {
    ...job,
    sourceReceipt,
    // Job-level values remain a compatibility field for downstream tailoring;
    // UI provenance only reads the typed artifact fields above.
    jdHash: job?.jdHash ?? sourceReceipt.summaryArtifact.contentHash ?? sourceReceipt.sourceArtifact.contentHash,
    jdHashAlgorithm: job?.jdHashAlgorithm ?? sourceReceipt.summaryArtifact.hashAlgorithm ?? sourceReceipt.sourceArtifact.hashAlgorithm,
  };
}

export function updateSourceReceiptVerification(job, check) {
  const sourceReceipt = normalizeSourceReceipt(job);
  const state = check?.state;
  if (!verificationStates.has(state) || !["open", "closed", "unknown"].includes(state)) return sourceReceipt;
  const nextSourceArtifact = state === "open" ? normalizeSourceArtifact(check?.sourceArtifact) : emptySourceArtifact();
  return {
    ...sourceReceipt,
    verificationState: state,
    verifiedAt: normalizeReceiptTimestamp(check?.checkedAt) || sourceReceipt.verifiedAt,
    verificationReason: verificationReasons.has(stringValue(check?.reason)) ? stringValue(check.reason) : `url-check-${state}`,
    // A failed/incomplete recheck cannot erase previously complete evidence.
    sourceArtifact: nextSourceArtifact.complete ? nextSourceArtifact : sourceReceipt.sourceArtifact,
  };
}
