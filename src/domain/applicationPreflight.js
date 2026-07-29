import { isSpecificApplicationUrl } from "./applications.js";
import { deriveOfficialJobProvider, normalizeReceiptUrl, normalizeSourceReceipt } from "./sourceReceipt.js";
import { isPlaceholderResume } from "../resume/resumeModel.js";
import { findDuplicateApplications } from "./applicationEvents.js";
import { validateSubmissionAuthorization } from "./applicationSubmission.js";

const text = (value, max = 160) => typeof value === "string" && value.trim().length <= max ? value.trim() : "";
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const authorizedApplicationGroups = new Set(["contact", "education", "experience"]);
export const applicationReceiptFreshnessMs = 24 * 60 * 60 * 1000;
const hash = (value) => {
  let total = 2166136261;
  for (const char of String(value)) { total ^= char.codePointAt(0); total = Math.imul(total, 16777619); }
  return (total >>> 0).toString(16).padStart(8, "0");
};
const acknowledged = (input, key) => input?.acknowledgements?.[key] === true || input?.[`${key}Acknowledged`] === true;

function check(list, code, severity, passed) { list.push({ code, severity, passed: Boolean(passed) }); }
function warningAcknowledged(input) { return input?.acknowledgements?.warnings === true || input?.warningAcknowledged === true; }
function resumeIsUsable(version, jobId, savedVersions) {
  if (!object(version).id || !object(version).content || isPlaceholderResume(version.content)) return false;
  const saved = Array.isArray(savedVersions)
    ? savedVersions.find((candidate) => candidate?.id === version.id)
    : null;
  return Boolean(
    saved
    && saved.layer === "job"
    && saved.jobId === jobId
    && saved.content === version.content
    && version.layer === "job"
    && version.jobId === jobId,
  );
}
function validContact(contact, input) {
  if (input.contactValid === false) return false;
  const value = object(contact);
  return text(value.fullName || value.name, 120).length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value.email, 160));
}

function canonicalApplicationUrl(value) {
  const normalized = normalizeReceiptUrl(value);
  if (!normalized) return "";
  const url = new URL(normalized);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}

function sensitiveExclusionCount(value) {
  if (value === true) return 1;
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function hasFreshOpenSourceReceipt(job, now = Date.now()) {
  const receipt = normalizeSourceReceipt(object(job));
  const currentTime = typeof now === "number" ? now : Date.parse(now);
  const verifiedTime = Date.parse(receipt.verifiedAt);
  return receipt.verificationState === "open"
    && Number.isFinite(currentTime)
    && Number.isFinite(verifiedTime)
    && verifiedTime <= currentTime
    && verifiedTime >= currentTime - applicationReceiptFreshnessMs;
}

/**
 * Pure, fail-closed gate for opening a specific official application page.
 * It deliberately never returns user-provided contact, resume, JD, answer, or URL text.
 */
export function evaluateApplicationPreflight(input = {}) {
  const source = object(input);
  const job = object(source.job);
  const claimedReceipt = object(job.sourceReceipt);
  const receipt = normalizeSourceReceipt(job);
  const checks = [];
  const blocking = [];
  const warnings = [];
  const block = (code, passed) => { check(checks, code, "blocking", passed); if (!passed) blocking.push(code); };
  const warn = (code, passed) => { check(checks, code, "warning", passed); if (!passed) warnings.push(code); };
  const applicationUrl = canonicalApplicationUrl(source.applicationUrl || job.applyUrl || job.url);
  const receiptUrl = canonicalApplicationUrl(receipt.applyUrl);
  const safeUrl = Boolean(applicationUrl && isSpecificApplicationUrl(applicationUrl));
  block("specific-https-application-url", safeUrl);
  block("job-available", job.verificationStatus !== "unavailable" && receipt.verificationState !== "closed");
  block("receipt-apply-url-match", Boolean(applicationUrl && receiptUrl && applicationUrl === receiptUrl));
  const derived = deriveOfficialJobProvider(applicationUrl);
  const providerKnown = receipt.provider && receipt.provider !== "unknown" && derived.provider && derived.provider !== "unknown";
  const idsKnown = receipt.providerJobId && derived.providerJobId;
  const claimedProvider = text(claimedReceipt.provider, 80);
  const claimedProviderJobId = text(claimedReceipt.providerJobId, 120);
  const claimedConflict = Boolean(claimedProvider && claimedProvider !== "unknown" && derived.provider && derived.provider !== "unknown"
    && claimedProviderJobId && derived.providerJobId
    && (claimedProvider !== derived.provider || claimedProviderJobId !== derived.providerJobId));
  block("provider-id-consistent", (!providerKnown || !idsKnown || (receipt.provider === derived.provider && receipt.providerJobId === derived.providerJobId)) && !claimedConflict);

  const resumeVersion = source.resumeVersion ?? source.selectedResumeVersion;
  block("saved-job-derived-resume", resumeIsUsable(resumeVersion, job.id, source.resumeVersions));
  block("resume-changes-saved", source.hasUnsavedResumeChanges !== true);
  block("valid-contact", validContact(source.contact ?? source.candidateProfile, source));
  const groups = Array.isArray(source.authorizedGroups)
    ? [...new Set(source.authorizedGroups.filter((group) => authorizedApplicationGroups.has(group)))]
    : [];
  block("contact-authorized", source.contactAuthorized === true
    && groups.includes("contact")
    && Number.isSafeInteger(source.authorizedFieldCount)
    && source.authorizedFieldCount > 0);
  block("truth-acknowledged", acknowledged(source, "truth"));
  block("sensitive-acknowledged", acknowledged(source, "sensitive"));
  block("unknown-questions-acknowledged", acknowledged(source, "unknownQuestions"));

  const duplicate = findDuplicateApplications({ job, applications: source.applications, applicationEventsById: source.applicationEventsById, excludeApplicationId: source.applicationId });
  const duplicateOverride = source.duplicateOverride === true || source.acknowledgements?.duplicate === true;
  block("duplicate-application", !duplicate.duplicate || duplicateOverride);
  warn("duplicate-override", !duplicate.duplicate || !duplicateOverride);
  const state = receipt.verificationState;
  warn("receipt-needs-review", !["manual", "needs-review", "unknown"].includes(state));
  warn("receipt-stale", hasFreshOpenSourceReceipt(job, source.now ?? Date.now()));
  warn("provider-id-missing", Boolean(receipt.providerJobId));
  warn("sensitive-lines-excluded", sensitiveExclusionCount(source.sensitiveLinesExcluded) === 0);
  warn("packet-sections-unavailable", source.packetSectionsAvailable === true);
  check(checks, "no-background-submit", "invariant", true);
  check(checks, "exact-review-before-submit", "invariant", true);
  if (warnings.length && !warningAcknowledged(source)) blocking.push("warnings-acknowledgement-required");
  const receiptFingerprint = `pf1-${hash(JSON.stringify({
    jobId: text(job.id, 120), provider: receipt.provider, providerJobId: receipt.providerJobId,
    verificationState: receipt.verificationState, verifiedAt: receipt.verifiedAt,
    urlHash: hash(applicationUrl), receiptUrlHash: hash(receiptUrl),
  }))}`;
  return { ready: blocking.length === 0, blocking: [...new Set(blocking)], warnings: [...new Set(warnings)], checks, receiptFingerprint };
}

/**
 * A second, stricter gate for one reviewed submission attempt.
 * It returns fingerprints and bounded codes only; field values and answers never leave the session object.
 */
export function evaluateSubmissionPreflight(input = {}) {
  const source = object(input);
  const review = object(source.submissionReview);
  const authorized = object(source.authorizedSession);
  const opening = evaluateApplicationPreflight(source);
  const checks = [...opening.checks];
  const blocking = [...opening.blocking];
  const block = (code, passed) => { check(checks, code, "blocking", passed); if (!passed) blocking.push(code); };
  block("submission-bridge-available", source.automationAvailable === true);
  const reviewedMode = ["fill-only", "review-submit"].includes(review.modeRequested)
    && review.modeRequested === authorized.modeRequested;
  block("reviewed-automation-mode", reviewedMode);
  block("unique-submit-control", review.modeRequested !== "review-submit" || source.submitControlReady === true);
  block("captcha-cleared", source.captchaPresent !== true);
  block("frozen-submission-payload", Boolean(
    review.payloadFingerprint
    && authorized.payloadFingerprint
    && review.payloadFingerprint === authorized.payloadFingerprint,
  ));
  block("source-receipt-fingerprint-match", Boolean(
    opening.receiptFingerprint
    && review.receiptFingerprint === opening.receiptFingerprint
    && authorized.receiptFingerprint === opening.receiptFingerprint,
  ));
  block("resume-version-fingerprint-match", Boolean(
    source.resumeVersion?.id
    && review.resumeVersionId === source.resumeVersion.id
    && authorized.resumeVersionId === source.resumeVersion.id,
  ));
  block("page-snapshot-reviewed", Boolean(
    review.pageFingerprint
    && authorized.pageFingerprint
    && review.pageFingerprint === authorized.pageFingerprint,
  ));
  block("exact-submission-authorized", validateSubmissionAuthorization(
    review,
    authorized,
    source.now ?? new Date().toISOString(),
  ).valid);
  block("single-submit-attempt", authorized.status === "authorized" && !authorized.attemptId);
  block("submit-acknowledged", acknowledged(source, "submit"));
  check(checks, "no-background-submit", "invariant", true);
  check(checks, "no-captcha-bypass", "invariant", true);
  return {
    ready: blocking.length === 0,
    blocking: [...new Set(blocking)],
    warnings: opening.warnings,
    checks,
    receiptFingerprint: opening.receiptFingerprint,
    payloadFingerprint: text(review.payloadFingerprint, 160),
  };
}
