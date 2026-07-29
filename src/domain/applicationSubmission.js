import { hashText } from "./applications.js";

export const applicationSubmissionSchemaVersion = 1;
export const applicationSubmissionModes = Object.freeze(["manual-handoff", "fill-only", "review-submit"]);
export const applicationSubmissionStatuses = Object.freeze([
  "draft", "review-ready", "authorized", "executing", "submitted", "manual-required", "failed", "expired",
]);
export const applicationSubmissionAuthorizationTtlMs = 10 * 60 * 1000;

const modes = new Set(applicationSubmissionModes);
const statuses = new Set(applicationSubmissionStatuses);
const fieldCategories = new Set(["factual", "narrative", "sensitive", "unknown"]);
const fieldStates = new Set(["confirmed", "page-confirmed", "manual-required", "unresolved"]);
const sourceCodes = new Set(["profile", "resume", "answer-library", "page-manual", "job-specific"]);
const submittedEvidenceCodes = new Set(["provider-confirmation", "success-page", "confirmation-id"]);
const maxSessions = 50;
const maxFields = 120;
const safeText = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const safeCode = (value, max = 160) => {
  const normalized = safeText(value, max);
  return /^[a-z0-9._:-]+$/i.test(normalized) ? normalized : "";
};
const isoTime = (value) => {
  const normalized = safeText(value, 40);
  return Number.isFinite(Date.parse(normalized)) ? new Date(normalized).toISOString() : "";
};

function normalizeSubmissionField(value) {
  if (!isPlainObject(value)) return null;
  const id = safeCode(value.id, 120);
  const label = safeText(value.label, 240);
  const type = safeCode(value.type || "text", 40) || "text";
  const category = fieldCategories.has(value.category) ? value.category : "unknown";
  const sourceCode = sourceCodes.has(value.sourceCode) ? value.sourceCode : "page-manual";
  let reviewState = fieldStates.has(value.reviewState) ? value.reviewState : "unresolved";
  let fieldValue = safeText(value.value, 4_000);
  if (category === "sensitive") {
    fieldValue = "";
    if (reviewState === "confirmed") reviewState = "manual-required";
  }
  if (reviewState === "confirmed" && !fieldValue) reviewState = "unresolved";
  if (!id || !label) return null;
  return { id, label, type, required: value.required === true, category, sourceCode, reviewState, value: fieldValue };
}

function normalizedFields(value) {
  if (!Array.isArray(value)) return [];
  const unique = new Map();
  value.slice(0, maxFields).map(normalizeSubmissionField).filter(Boolean)
    .forEach((field) => unique.set(field.id, field));
  return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function buildPayloadFingerprintParts(review) {
  return {
    applicationId: review.applicationId,
    provider: review.provider,
    providerJobId: review.providerJobId,
    resumeVersionId: review.resumeVersionId,
    receiptFingerprint: review.receiptFingerprint,
    pageFingerprint: review.pageFingerprint,
    modeRequested: review.modeRequested,
    fields: review.fields.map((field) => [
      field.id, field.label, field.type, field.required, field.category, field.sourceCode, field.reviewState, field.value,
    ]),
  };
}

export function buildSubmissionPayloadFingerprint(review) {
  return `sp1-${hashText(JSON.stringify(buildPayloadFingerprintParts(review)))}`;
}

function readinessForMode(mode, pageFingerprint, fields) {
  if (!fields.length) return { ready: false, reason: "no-fields" };
  if (mode === "manual-handoff") {
    return {
      ready: fields.every((field) => !["unresolved"].includes(field.reviewState)),
      reason: "unresolved-fields",
    };
  }
  if (!pageFingerprint) return { ready: false, reason: "page-scan-required" };
  if (mode === "fill-only") {
    return {
      ready: fields.every((field) => field.reviewState !== "unresolved"),
      reason: "unresolved-fields",
    };
  }
  return {
    ready: fields.every((field) => (
      field.category === "sensitive"
        ? field.reviewState === "page-confirmed"
        : ["confirmed", "page-confirmed"].includes(field.reviewState)
    )),
    reason: "manual-fields-incomplete",
  };
}

export function createSubmissionReview(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const applicationId = safeText(source.applicationId, 120);
  const company = safeText(source.company, 160);
  const role = safeText(source.role, 200);
  const provider = safeCode(source.provider || "unknown", 80);
  const providerJobId = safeCode(source.providerJobId || "unknown", 160);
  const resumeVersionId = safeCode(source.resumeVersionId, 160);
  const receiptFingerprint = safeCode(source.receiptFingerprint, 160);
  const pageFingerprint = safeCode(source.pageFingerprint, 160);
  const modeRequested = modes.has(source.modeRequested) ? source.modeRequested : "manual-handoff";
  const fields = normalizedFields(source.fields);
  const createdAt = isoTime(source.createdAt ?? new Date().toISOString());
  const id = safeCode(source.id || `submission-${applicationId}-${createdAt.replace(/[^0-9]/g, "")}`, 160);
  if (!id || !applicationId || !company || !role || !provider || !providerJobId
    || !resumeVersionId || !receiptFingerprint || !createdAt) return null;
  const readiness = readinessForMode(modeRequested, pageFingerprint, fields);
  const review = {
    schemaVersion: applicationSubmissionSchemaVersion,
    id,
    applicationId,
    company,
    role,
    provider,
    providerJobId,
    resumeVersionId,
    receiptFingerprint,
    pageFingerprint,
    modeRequested,
    status: readiness.ready ? "review-ready" : "draft",
    readinessReason: readiness.ready ? "ready" : readiness.reason,
    fields,
    createdAt,
  };
  review.payloadFingerprint = buildSubmissionPayloadFingerprint(review);
  return review;
}

function normalizeSubmissionReview(value) {
  if (!isPlainObject(value) || value.schemaVersion !== applicationSubmissionSchemaVersion) return null;
  const rebuilt = createSubmissionReview(value);
  if (!rebuilt || safeCode(value.payloadFingerprint, 160) !== rebuilt.payloadFingerprint) return null;
  const status = statuses.has(value.status) ? value.status : rebuilt.status;
  const review = { ...rebuilt, status };
  const optionalTimes = ["authorizedAt", "expiresAt", "attemptedAt", "completedAt"];
  optionalTimes.forEach((key) => {
    const normalized = isoTime(value[key]);
    if (normalized) review[key] = normalized;
  });
  const optionalCodes = ["authorizationId", "attemptId", "resultCode", "confirmationFingerprint"];
  optionalCodes.forEach((key) => {
    const normalized = safeCode(value[key], 160);
    if (normalized) review[key] = normalized;
  });
  if (status === "authorized" || status === "executing") {
    if (!review.authorizationId || !review.authorizedAt || !review.expiresAt) return null;
  }
  if (status === "executing" && (!review.attemptId || !review.attemptedAt)) return null;
  if (status === "submitted") {
    if (!review.completedAt || !submittedEvidenceCodes.has(review.resultCode) || !review.confirmationFingerprint) return null;
  }
  return review;
}

export function normalizeSubmissionSessionsById(value) {
  if (!isPlainObject(value)) return {};
  const sessions = Object.values(value).map(normalizeSubmissionReview).filter(Boolean)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .slice(-maxSessions);
  return Object.fromEntries(sessions.map((session) => [session.id, session]));
}

export function authorizeSubmissionReview(reviewInput, input = {}) {
  const review = normalizeSubmissionReview(reviewInput);
  const now = isoTime(input.now ?? new Date().toISOString());
  const authorizationId = safeCode(input.authorizationId, 160);
  if (!review || review.status !== "review-ready") return { session: review, changed: false, reason: "review-not-ready" };
  if (!now || !authorizationId) return { session: review, changed: false, reason: "invalid-authorization" };
  if (safeText(input.company, 160) !== review.company || safeText(input.role, 200) !== review.role) {
    return { session: review, changed: false, reason: "identity-not-confirmed" };
  }
  const ttl = Number.isSafeInteger(input.ttlMs)
    ? Math.min(applicationSubmissionAuthorizationTtlMs, Math.max(60_000, input.ttlMs))
    : applicationSubmissionAuthorizationTtlMs;
  const authorizedAt = now;
  const expiresAt = new Date(Date.parse(now) + ttl).toISOString();
  return {
    session: { ...review, status: "authorized", authorizationId, authorizedAt, expiresAt },
    changed: true,
    reason: "ok",
  };
}

export function validateSubmissionAuthorization(reviewInput, authorizedInput, nowInput = new Date().toISOString()) {
  const review = normalizeSubmissionReview(reviewInput);
  const authorized = normalizeSubmissionReview(authorizedInput);
  const now = Date.parse(nowInput);
  if (!review || !authorized) return { valid: false, reason: "invalid-session" };
  if (!["authorized", "executing"].includes(authorized.status)) return { valid: false, reason: "not-authorized" };
  if (review.id !== authorized.id || review.payloadFingerprint !== authorized.payloadFingerprint
    || review.applicationId !== authorized.applicationId) return { valid: false, reason: "payload-changed" };
  if (!Number.isFinite(now) || now > Date.parse(authorized.expiresAt)) return { valid: false, reason: "authorization-expired" };
  return { valid: true, reason: "ok" };
}

export function beginSubmissionAttempt(sessionInput, input = {}) {
  const session = normalizeSubmissionReview(sessionInput);
  const now = isoTime(input.now ?? new Date().toISOString());
  const attemptId = safeCode(input.attemptId, 160);
  const currentPageFingerprint = safeCode(input.pageFingerprint, 160);
  const validation = validateSubmissionAuthorization(session, session, now);
  if (!validation.valid) return { session, changed: false, reason: validation.reason };
  if (!attemptId || !currentPageFingerprint || currentPageFingerprint !== session.pageFingerprint) {
    return { session, changed: false, reason: "page-changed" };
  }
  if (session.status !== "authorized") return { session, changed: false, reason: "attempt-already-started" };
  return {
    session: { ...session, status: "executing", attemptId, attemptedAt: now },
    changed: true,
    reason: "ok",
  };
}

export function completeSubmissionAttempt(sessionInput, input = {}) {
  const session = normalizeSubmissionReview(sessionInput);
  const now = isoTime(input.now ?? new Date().toISOString());
  const outcome = safeCode(input.outcome, 40);
  if (!session || session.status !== "executing" || !now) {
    return { session, changed: false, reason: "attempt-not-running" };
  }
  if (outcome === "submitted") {
    const resultCode = safeCode(input.resultCode, 80);
    const confirmationFingerprint = safeCode(input.confirmationFingerprint, 160);
    if (!submittedEvidenceCodes.has(resultCode) || !confirmationFingerprint) {
      return { session, changed: false, reason: "confirmation-evidence-required" };
    }
    return {
      session: { ...session, status: "submitted", completedAt: now, resultCode, confirmationFingerprint },
      changed: true,
      reason: "ok",
    };
  }
  if (!["manual-required", "failed"].includes(outcome)) {
    return { session, changed: false, reason: "invalid-outcome" };
  }
  return {
    session: {
      ...session,
      status: outcome,
      completedAt: now,
      resultCode: safeCode(input.resultCode || outcome, 80) || outcome,
    },
    changed: true,
    reason: "ok",
  };
}

export function submissionAuditMetadata(sessionInput) {
  const session = normalizeSubmissionReview(sessionInput);
  if (!session) return {};
  const metadata = {
    resumeVersionId: session.resumeVersionId,
    sourceReceiptFingerprint: session.receiptFingerprint,
    payloadFingerprint: session.payloadFingerprint,
    submissionMode: session.modeRequested,
  };
  if (session.authorizationId) metadata.authorizationId = session.authorizationId;
  if (session.attemptId) metadata.attemptId = session.attemptId;
  if (session.resultCode) metadata.resultCode = session.resultCode;
  if (session.confirmationFingerprint) metadata.confirmationFingerprint = session.confirmationFingerprint;
  return metadata;
}
