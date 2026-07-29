import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeSubmissionReview,
  beginSubmissionAttempt,
  completeSubmissionAttempt,
  createSubmissionReview,
  normalizeSubmissionSessionsById,
  submissionAuditMetadata,
  validateSubmissionAuthorization,
} from "../src/domain/applicationSubmission.js";

const baseInput = (extra = {}) => ({
  id: "submission-job-1",
  applicationId: "job-1",
  company: "Acme",
  role: "Product Engineer",
  provider: "greenhouse",
  providerJobId: "12345",
  resumeVersionId: "resume-job-1",
  receiptFingerprint: "pf1-abcd1234",
  pageFingerprint: "page-abcdef12",
  modeRequested: "review-submit",
  createdAt: "2026-07-28T12:00:00.000Z",
  fields: [
    { id: "full-name", label: "Full name", category: "factual", sourceCode: "profile", reviewState: "confirmed", value: "Jane Doe" },
    { id: "visa", label: "Visa sponsorship", category: "sensitive", sourceCode: "page-manual", reviewState: "page-confirmed", value: "must not persist" },
  ],
  ...extra,
});

test("review-submit requires a scanned page and every sensitive field confirmed on the page", () => {
  const ready = createSubmissionReview(baseInput());
  assert.equal(ready.status, "review-ready");
  assert.equal(ready.fields.find((field) => field.id === "visa").value, "");

  const noPage = createSubmissionReview(baseInput({ pageFingerprint: "" }));
  assert.equal(noPage.status, "draft");
  assert.equal(noPage.readinessReason, "page-scan-required");

  const manual = createSubmissionReview(baseInput({
    fields: [
      baseInput().fields[0],
      { ...baseInput().fields[1], reviewState: "manual-required" },
    ],
  }));
  assert.equal(manual.status, "draft");
  assert.equal(manual.readinessReason, "manual-fields-incomplete");
});

test("authorization binds one company, role, payload, page, and short expiry", () => {
  const review = createSubmissionReview(baseInput());
  const denied = authorizeSubmissionReview(review, {
    authorizationId: "auth-1",
    company: "Other",
    role: review.role,
    now: "2026-07-28T12:01:00.000Z",
  });
  assert.equal(denied.changed, false);
  assert.equal(denied.reason, "identity-not-confirmed");

  const authorized = authorizeSubmissionReview(review, {
    authorizationId: "auth-1",
    company: review.company,
    role: review.role,
    now: "2026-07-28T12:01:00.000Z",
  }).session;
  assert.equal(validateSubmissionAuthorization(review, authorized, "2026-07-28T12:05:00.000Z").valid, true);
  assert.equal(validateSubmissionAuthorization(review, authorized, "2026-07-28T12:12:00.000Z").reason, "authorization-expired");

  const changed = createSubmissionReview(baseInput({
    fields: [{ ...baseInput().fields[0], value: "Different" }, baseInput().fields[1]],
  }));
  assert.equal(validateSubmissionAuthorization(changed, authorized, "2026-07-28T12:05:00.000Z").reason, "payload-changed");
});

test("a single attempt stops on page changes and needs provider-facing confirmation evidence", () => {
  const review = createSubmissionReview(baseInput());
  const authorized = authorizeSubmissionReview(review, {
    authorizationId: "auth-1",
    company: review.company,
    role: review.role,
    now: "2026-07-28T12:01:00.000Z",
  }).session;
  const changedPage = beginSubmissionAttempt(authorized, {
    attemptId: "attempt-1",
    pageFingerprint: "page-changed",
    now: "2026-07-28T12:02:00.000Z",
  });
  assert.equal(changedPage.changed, false);
  assert.equal(changedPage.reason, "page-changed");

  const executing = beginSubmissionAttempt(authorized, {
    attemptId: "attempt-1",
    pageFingerprint: review.pageFingerprint,
    now: "2026-07-28T12:02:00.000Z",
  }).session;
  assert.equal(executing.status, "executing");
  assert.equal(beginSubmissionAttempt(executing, {
    attemptId: "attempt-2",
    pageFingerprint: review.pageFingerprint,
    now: "2026-07-28T12:03:00.000Z",
  }).reason, "attempt-already-started");

  const noEvidence = completeSubmissionAttempt(executing, {
    outcome: "submitted",
    now: "2026-07-28T12:04:00.000Z",
  });
  assert.equal(noEvidence.changed, false);
  assert.equal(noEvidence.reason, "confirmation-evidence-required");

  const completed = completeSubmissionAttempt(executing, {
    outcome: "submitted",
    resultCode: "success-page",
    confirmationFingerprint: "confirm-1234",
    now: "2026-07-28T12:04:00.000Z",
  }).session;
  assert.equal(completed.status, "submitted");
  assert.equal(completed.resultCode, "success-page");
});

test("persisted sessions fail closed on payload tampering and audit metadata contains no field values", () => {
  const review = createSubmissionReview(baseInput());
  const authorized = authorizeSubmissionReview(review, {
    authorizationId: "auth-1",
    company: review.company,
    role: review.role,
    now: "2026-07-28T12:01:00.000Z",
  }).session;
  const normalized = normalizeSubmissionSessionsById({
    [authorized.id]: authorized,
    tampered: { ...authorized, id: "tampered", fields: [{ ...authorized.fields[0], value: "Tampered" }] },
  });
  assert.deepEqual(Object.keys(normalized), [authorized.id]);
  const metadata = submissionAuditMetadata(authorized);
  assert.equal(JSON.stringify(metadata).includes("Jane Doe"), false);
  assert.equal(JSON.stringify(metadata).includes("Visa sponsorship"), false);
  assert.equal(metadata.payloadFingerprint, authorized.payloadFingerprint);
});
