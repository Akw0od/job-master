import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationReceiptFreshnessMs,
  evaluateApplicationPreflight,
  hasFreshOpenSourceReceipt,
} from "../src/domain/applicationPreflight.js";

const job = (extra = {}) => ({
  id: "job-1", company: "Acme", role: "Engineer", applyUrl: "https://jobs.example.com/roles/123",
  sourceReceipt: { applyUrl: "https://jobs.example.com/roles/123", provider: "official-company-site", providerJobId: "", verificationState: "open", verifiedAt: "2026-07-27T00:00:00.000Z" }, ...extra,
});
const readyInput = (extra = {}) => ({
  job: job(), applicationUrl: "https://jobs.example.com/roles/123", now: "2026-07-28T00:00:00.000Z",
  resumeVersion: { id: "job-v1", jobId: "job-1", layer: "job", content: "Resume content" },
  resumeVersions: [{ id: "job-v1", jobId: "job-1", layer: "job", content: "Resume content" }],
  contact: { fullName: "Jane Doe", email: "jane@example.com" }, contactAuthorized: true, authorizedGroups: ["contact"],
  authorizedFieldCount: 1,
  acknowledgements: { truth: true, sensitive: true, unknownQuestions: true, warnings: true },
  sensitiveLinesExcluded: true, packetSectionsAvailable: true, ...extra,
});

test("fresh verified source with explicit acknowledgements is ready and has manual-only invariants", () => {
  const result = evaluateApplicationPreflight(readyInput());
  assert.equal(result.ready, true);
  assert.deepEqual(result.blocking, []);
  assert.ok(result.checks.some((check) => check.code === "no-auto-submit" && check.passed));
  assert.equal(result.receiptFingerprint.includes("https://"), false);
});

test("source mismatch and closed verification block while stale verification is a warning", () => {
  const mismatch = evaluateApplicationPreflight(readyInput({ applicationUrl: "https://jobs.example.com/roles/456" }));
  assert.ok(mismatch.blocking.includes("receipt-apply-url-match"));
  const ashbyUrl = "https://jobs.ashbyhq.com/acme/123e4567-e89b-42d3-a456-426614174000";
  const providerConflict = evaluateApplicationPreflight(readyInput({
    applicationUrl: ashbyUrl,
    job: job({ applyUrl: ashbyUrl, sourceReceipt: { applyUrl: ashbyUrl, provider: "lever", providerJobId: "123e4567-e89b-42d3-a456-426614174000", verificationState: "open", verifiedAt: "2026-07-27T00:00:00.000Z" } }),
  }));
  assert.ok(providerConflict.blocking.includes("provider-id-consistent"));
  const closed = evaluateApplicationPreflight(readyInput({ job: job({ verificationStatus: "unavailable" }) }));
  assert.ok(closed.blocking.includes("job-available"));
  const stale = evaluateApplicationPreflight(readyInput({ job: job({ sourceReceipt: { ...job().sourceReceipt, verifiedAt: "2020-01-01T00:00:00.000Z" } }) }));
  assert.equal(stale.blocking.includes("job-available"), false);
  assert.ok(stale.warnings.includes("receipt-stale"));
  const trailingSlash = evaluateApplicationPreflight(readyInput({ applicationUrl: "https://jobs.example.com/roles/123/" }));
  assert.equal(trailingSlash.blocking.includes("receipt-apply-url-match"), false);
  const boundary = evaluateApplicationPreflight(readyInput({ job: job({ sourceReceipt: { ...job().sourceReceipt, verifiedAt: "2026-07-27T00:00:00.000Z" } }) }));
  assert.equal(boundary.warnings.includes("receipt-stale"), false);
  const future = evaluateApplicationPreflight(readyInput({ job: job({ sourceReceipt: { ...job().sourceReceipt, verifiedAt: "2026-07-29T00:00:00.000Z" } }) }));
  assert.ok(future.warnings.includes("receipt-stale"));
  const verifiedAt = Date.parse("2026-07-27T00:00:00.000Z");
  assert.equal(hasFreshOpenSourceReceipt(job(), verifiedAt + applicationReceiptFreshnessMs), true);
  assert.equal(hasFreshOpenSourceReceipt(job(), verifiedAt + applicationReceiptFreshnessMs + 1), false);
  assert.equal(hasFreshOpenSourceReceipt(job(), verifiedAt - 1), false);
});

test("missing resume, authorization, truth acknowledgement and duplicates are fail-closed unless overridden", () => {
  const missing = evaluateApplicationPreflight(readyInput({ resumeVersion: null, contactAuthorized: false, authorizedGroups: [], acknowledgements: { warnings: true } }));
  assert.ok(missing.blocking.includes("saved-job-derived-resume"));
  assert.ok(missing.blocking.includes("contact-authorized"));
  assert.ok(missing.blocking.includes("truth-acknowledged"));
  const duplicateApp = { id: "other", company: "Acme", role: "Engineer", status: "已投递", applyUrl: "https://jobs.example.com/roles/123" };
  const blocked = evaluateApplicationPreflight(readyInput({ applications: [duplicateApp] }));
  assert.ok(blocked.blocking.includes("duplicate-application"));
  const overridden = evaluateApplicationPreflight(readyInput({ applications: [duplicateApp], duplicateOverride: true }));
  assert.equal(overridden.blocking.includes("duplicate-application"), false);
  assert.ok(overridden.warnings.includes("duplicate-override"));
  const selfOverride = evaluateApplicationPreflight(readyInput({
    applicationId: "job-1", job: { ...job(), status: "已投递" }, applications: [{ ...job(), status: "已投递" }], duplicateOverride: true,
  }));
  assert.equal(selfOverride.blocking.includes("duplicate-application"), false);
});

test("requires a saved actual job-layer resume, no pending resume edits, real authorized fields, and warns on exclusions", () => {
  const unsaved = evaluateApplicationPreflight(readyInput({ hasUnsavedResumeChanges: true }));
  assert.ok(unsaved.blocking.includes("resume-changes-saved"));
  const wrongShape = evaluateApplicationPreflight(readyInput({ resumeVersion: { id: "job-v1", jobId: "job-1", layer: "direction", content: "Resume content" } }));
  assert.ok(wrongShape.blocking.includes("saved-job-derived-resume"));
  const noFields = evaluateApplicationPreflight(readyInput({ authorizedFieldCount: 0 }));
  assert.ok(noFields.blocking.includes("contact-authorized"));
  const unknownGroup = evaluateApplicationPreflight(readyInput({ authorizedGroups: ["identity"] }));
  assert.ok(unknownGroup.blocking.includes("contact-authorized"));
  const forgedVersion = evaluateApplicationPreflight(readyInput({
    resumeVersion: { id: "job-v1", jobId: "job-1", layer: "job", content: "Unsaved replacement" },
  }));
  assert.ok(forgedVersion.blocking.includes("saved-job-derived-resume"));
  const bypassedContact = evaluateApplicationPreflight(readyInput({
    contact: {},
    contactValid: true,
  }));
  assert.ok(bypassedContact.blocking.includes("valid-contact"));
  const excluded = evaluateApplicationPreflight(readyInput({ sensitiveLinesExcluded: 2 }));
  assert.ok(excluded.warnings.includes("sensitive-lines-excluded"));
  const noneExcluded = evaluateApplicationPreflight(readyInput({ sensitiveLinesExcluded: false }));
  assert.equal(noneExcluded.warnings.includes("sensitive-lines-excluded"), false);
});

test("does not mutate input or leak sensitive content into the result", () => {
  const version = { id: "job-v1", jobId: "job-1", layer: "job", content: "Highly private resume text" };
  const input = readyInput({ contact: { fullName: "Jane Doe", email: "jane@example.com", phone: "+15551234567" }, resumeVersion: version, resumeVersions: [version] });
  const before = structuredClone(input);
  const result = evaluateApplicationPreflight(input);
  assert.deepEqual(input, before);
  assert.equal(JSON.stringify(result).includes("jane@example.com"), false);
  assert.equal(JSON.stringify(result).includes("Highly private"), false);
});
