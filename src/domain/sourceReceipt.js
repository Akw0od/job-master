export const sourceReceiptSchemaVersion = 1;

const receiptOrigins = new Set([
  "live-official-search",
  "built-in-catalog",
  "user-pasted",
  "legacy-cache",
]);
const verificationStates = new Set(["open", "closed", "unknown", "needs-review", "manual"]);
const verificationReasons = new Set([
  "live-search-verified",
  "url-check-open",
  "url-check-closed",
  "url-check-unknown",
  "url-open",
  "http-404-or-410",
  "closed-page-signal",
  "ashby-published",
  "ashby-not-published",
  "network-or-inconclusive",
  "bounded-response",
  "redirect-inconclusive",
  "invalid-or-unsafe-url",
  "built-in-catalog-needs-review",
  "manual-jd-needs-review",
  "manual-jd-no-application-url",
  "legacy-cache-needs-review",
]);

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

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

export function derivePostingUrl(value) {
  const normalized = normalizeReceiptUrl(value);
  if (!normalized) return "";
  const url = new URL(normalized);
  const host = url.hostname.toLowerCase();
  if (host === "jobs.ashbyhq.com" && /\/application\/?$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/application\/?$/i, "");
  }
  if (host === "jobs.lever.co" && /\/apply\/?$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/apply\/?$/i, "");
  }
  return url.href;
}

function firstReceiptUrl(...values) {
  return values.map(normalizeReceiptUrl).find(Boolean) ?? "";
}

function firstPathId(url, matcher) {
  const match = url.pathname.match(matcher);
  return match?.[1] ?? "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function deriveOfficialJobProvider(value) {
  const url = asUrl(value);
  if (!url || url.protocol !== "https:") return { provider: "unknown", providerJobId: "" };
  const host = url.hostname.toLowerCase();

  if (host === "jobs.ashbyhq.com") {
    const id = firstPathId(url, /^\/[^/]+\/([^/]+)(?:\/|$)/);
    return { provider: "ashby", providerJobId: isUuid(id) ? id : "" };
  }
  const greenhouseId = url.searchParams.get("gh_jid") ?? "";
  if (host === "job-boards.greenhouse.io" || host === "boards.greenhouse.io" || host === "boards.eu.greenhouse.io" || /^\d+$/.test(greenhouseId)) {
    const id = greenhouseId || firstPathId(url, /^\/[^/]+\/jobs\/([^/]+)(?:\/|$)/);
    return { provider: "greenhouse", providerJobId: /^\d+$/.test(id ?? "") ? id : "" };
  }
  if (host === "jobs.lever.co") {
    const id = firstPathId(url, /^\/[^/]+\/([^/]+)(?:\/|$)/);
    return { provider: "lever", providerJobId: isUuid(id) ? id : "" };
  }
  if (host === "jobs.apple.com") {
    const id = firstPathId(url, /\/details\/(\d+(?:-\d+)?)(?:[-/]|$)/);
    return { provider: "apple-jobs", providerJobId: id || "" };
  }
  if (host === "career.huawei.com") {
    const id = url.searchParams.get("jobId") ?? "";
    return { provider: "huawei-careers", providerJobId: /^\d+$/.test(id) ? id : "" };
  }
  if (host === "hr.xiaomi.com") {
    const id = firstPathId(url, /^\/job\/view\/(\d+)(?:\/|$)/);
    return { provider: "xiaomi-careers", providerJobId: id || "" };
  }
  if (host === "stripe.com" || host === "www.stripe.com") {
    const id = firstPathId(url, /^\/jobs\/listing\/[^/]+\/(\d+)(?:\/|$)/);
    return { provider: "stripe-jobs", providerJobId: id || "" };
  }
  return { provider: "official-company-site", providerJobId: "" };
}

export function verificationStateFromJob(job) {
  return ({
    verified: "open",
    unavailable: "closed",
    unknown: "unknown",
    "needs-review": "needs-review",
    manual: "manual",
  })[job?.verificationStatus] ?? "needs-review";
}

function defaultReason(origin, verificationState) {
  if (origin === "live-official-search") {
    if (verificationState === "open") return "live-search-verified";
    if (["closed", "unknown"].includes(verificationState)) return `url-check-${verificationState}`;
    return "network-or-inconclusive";
  }
  if (origin === "built-in-catalog") return "built-in-catalog-needs-review";
  if (origin === "user-pasted") return verificationState === "manual"
    ? "manual-jd-no-application-url"
    : "manual-jd-needs-review";
  return "legacy-cache-needs-review";
}

function inferredOrigin(job) {
  if (job?.sourceOrigin === "built-in-catalog") return "built-in-catalog";
  if (job?.jdSource === "user-pasted" || job?.source === "手动 JD" || String(job?.id ?? "").startsWith("imported-")) return "user-pasted";
  return "legacy-cache";
}

export function normalizeSourceReceipt(job) {
  const existing = job?.sourceReceipt && typeof job.sourceReceipt === "object" && !Array.isArray(job.sourceReceipt)
    ? job.sourceReceipt
    : null;
  const origin = receiptOrigins.has(existing?.origin) ? existing.origin : inferredOrigin(job);
  const applyUrl = firstReceiptUrl(existing?.applyUrl, job?.applyUrl);
  const postingUrl = derivePostingUrl(firstReceiptUrl(existing?.postingUrl, job?.url, applyUrl));
  const providerData = deriveOfficialJobProvider(applyUrl || postingUrl);
  const verificationState = verificationStates.has(existing?.verificationState)
    ? existing.verificationState
    : origin === "user-pasted" && !applyUrl
      ? "manual"
      : origin === "legacy-cache" || origin === "built-in-catalog"
        ? "needs-review"
        : verificationStateFromJob(job);
  const jdHash = stringValue(existing?.jdHash) || stringValue(job?.jdHash);
  const jdHashAlgorithm = stringValue(existing?.jdHashAlgorithm)
    || stringValue(job?.jdHashAlgorithm)
    || (origin === "user-pasted" && jdHash ? "fnv-1a-32" : jdHash ? "legacy-unknown" : "none");

  return {
    schemaVersion: sourceReceiptSchemaVersion,
    origin,
    // Provider IDs are derived from the URL on every normalization pass. Do not
    // carry forward an unverified legacy ID simply because it was persisted.
    provider: providerData.provider,
    providerJobId: providerData.providerJobId,
    postingUrl,
    applyUrl,
    fetchedAt: normalizeReceiptTimestamp(existing?.fetchedAt),
    verificationState,
    verifiedAt: normalizeReceiptTimestamp(existing?.verifiedAt)
      || (origin === "live-official-search" ? normalizeReceiptTimestamp(job?.verifiedAt) : ""),
    verificationReason: verificationReasons.has(stringValue(existing?.verificationReason))
      ? stringValue(existing?.verificationReason)
      : defaultReason(origin, verificationState),
    jdHash,
    jdHashAlgorithm,
  };
}

export function withNormalizedSourceReceipt(job) {
  const sourceReceipt = normalizeSourceReceipt(job);
  return {
    ...job,
    sourceReceipt,
    jdHash: job?.jdHash ?? sourceReceipt.jdHash,
    jdHashAlgorithm: job?.jdHashAlgorithm ?? sourceReceipt.jdHashAlgorithm,
  };
}

export function updateSourceReceiptVerification(job, check) {
  const sourceReceipt = normalizeSourceReceipt(job);
  const state = check?.state;
  if (!verificationStates.has(state) || !["open", "closed", "unknown"].includes(state)) return sourceReceipt;
  const checkedAt = normalizeReceiptTimestamp(check?.checkedAt);
  return {
    ...sourceReceipt,
    verificationState: state,
    verifiedAt: checkedAt || sourceReceipt.verifiedAt,
    verificationReason: verificationReasons.has(stringValue(check?.reason))
      ? stringValue(check.reason)
      : `url-check-${state}`,
  };
}
