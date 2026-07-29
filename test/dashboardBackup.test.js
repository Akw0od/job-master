import test from "node:test";
import assert from "node:assert/strict";
import {
  BackupError,
  backupMaxBytes,
  createEncryptedDashboardBackup,
  decryptDashboardBackup,
  readEncryptedBackupFile,
  validateBackupEnvelope,
} from "../src/services/dashboardBackup.js";
import { authorizeSubmissionReview, createSubmissionReview } from "../src/domain/applicationSubmission.js";

const password = "safe backup password";
const submissionReview = createSubmissionReview({
  id: "submission-imported-receipt",
  applicationId: "imported-receipt",
  company: "Example",
  role: "Engineer",
  provider: "official-company-site",
  providerJobId: "unknown",
  resumeVersionId: "direction-v2",
  receiptFingerprint: "pf1-abcd",
  pageFingerprint: "page-abcd",
  modeRequested: "fill-only",
  createdAt: "2026-07-24T00:02:00.000Z",
  fields: [{
    id: "full-name",
    label: "Full name",
    category: "factual",
    sourceCode: "profile",
    reviewState: "confirmed",
    value: "Ada Lovelace",
  }],
});
const authorizedSubmission = authorizeSubmissionReview(submissionReview, {
  authorizationId: "auth-backup-1",
  company: "Example",
  role: "Engineer",
  now: "2026-07-24T00:03:00.000Z",
}).session;
const dashboard = {
  applications: [{
    id: "imported-receipt",
    status: "已投递",
    statusKey: "applied",
    stage: "进行中",
    jdSource: "user-pasted",
    jdHash: "abc123",
    jdHashAlgorithm: "fnv-1a-32",
    sourceReceipt: {
      schemaVersion: 1,
      origin: "user-pasted",
      provider: "official-company-site",
      providerJobId: "",
      postingUrl: "https://example.com/jobs/123",
      applyUrl: "https://example.com/jobs/123",
      fetchedAt: "",
      verificationState: "needs-review",
      verifiedAt: "",
      verificationReason: "manual-jd-needs-review",
      jdHash: "abc123",
      jdHashAlgorithm: "fnv-1a-32",
    },
  }],
  applicationEventsById: {
    "imported-receipt": [{
      schemaVersion: 1,
      id: "status-1",
      applicationId: "imported-receipt",
      type: "status.changed",
      occurredAt: "2026-07-24T00:00:00.000Z",
      fromStatus: "收藏",
      toStatus: "已投递",
      metadata: { warningCodes: ["receipt-stale"] },
    }, {
      schemaVersion: 1,
      id: "unsafe-event",
      applicationId: "imported-receipt",
      type: "application.opened",
      occurredAt: "2026-07-24T00:01:00.000Z",
      metadata: { email: "ada@example.com" },
    }],
  },
  resumeVersions: [{
    id: "master-resume",
    content: "Ada Lovelace\nada@example.com\nSensitive resume facts",
  }, {
    id: "direction-v2",
    parentVersionId: "master-resume",
    baseContent: "Ada Lovelace",
    content: "Ada Lovelace, reliable systems engineer",
    lineage: { parentVersionId: "master-resume", baseHash: "a1b2c3d4", patchVersion: 2 },
    patchAudit: [{ patchId: "patch-v2-a1b2", before: "Ada Lovelace", after: "Ada Lovelace, reliable systems engineer", decision: "accepted" }],
  }],
  candidateProfile: { name: "Ada Lovelace", email: "ada@example.com" },
  applicationAnswerLibrary: {
    schemaVersion: 1,
    answers: [{
      schemaVersion: 1,
      id: "answer-1",
      question: "Why this role?",
      category: "narrative",
      state: "confirmed",
      answer: "A truthful candidate-authored answer.",
      sourceCode: "user-confirmed",
      updatedAt: "2026-07-24T00:00:00.000Z",
    }],
  },
  submissionSessionsById: { [authorizedSubmission.id]: authorizedSubmission },
  applicationOperationsById: {
    "imported-receipt": {
      schemaVersion: 1,
      applicationId: "imported-receipt",
      followUpAt: "2026-07-31T00:00:00.000Z",
      interview: {
        scheduledAt: "2026-08-01T00:00:00.000Z",
        stage: "Hiring manager",
        notes: "Candidate-authored prep note",
      },
    },
  },
};

test("encrypted local dashboard backup round-trips without plaintext resume or profile data", async () => {
  const backup = await createEncryptedDashboardBackup(dashboard, password, {
    exportedAt: "2026-07-25T00:00:00.000Z",
  });
  const serialized = JSON.stringify(backup);

  assert.doesNotMatch(serialized, /Ada Lovelace|ada@example\.com|Sensitive resume facts/);
  assert.equal(backup.exportedAt, "2026-07-25T00:00:00.000Z");
  const restored = await decryptDashboardBackup(backup, password);
  assert.equal(restored.resumeVersions[0].content, dashboard.resumeVersions[0].content);
  assert.equal(restored.candidateProfile.email, "ada@example.com");
  assert.equal(restored.applications[0].sourceReceipt.schemaVersion, 2);
  assert.deepEqual(restored.applications[0].sourceReceipt.sourceArtifact, {
    kind: "missing", sourceUrl: "", capturedAt: "", byteLength: 0, complete: false, contentHash: "", hashAlgorithm: "none",
  });
  assert.deepEqual(restored.applications[0].sourceReceipt.summaryArtifact, {
    kind: "missing", generatedAt: "", contentHash: "", hashAlgorithm: "none",
  });
  assert.deepEqual(restored.resumeVersions[1].patchAudit, dashboard.resumeVersions[1].patchAudit);
  assert.deepEqual(restored.resumeVersions[1].lineage, dashboard.resumeVersions[1].lineage);
  assert.deepEqual(restored.applicationEventsById["imported-receipt"].map((event) => event.id), ["status-1"]);
  assert.equal(JSON.stringify(restored.applicationEventsById).includes("ada@example.com"), false);
  assert.equal(restored.applicationAnswerLibrary.answers[0].answer, "A truthful candidate-authored answer.");
  assert.equal(restored.submissionSessionsById[authorizedSubmission.id].authorizationId, "auth-backup-1");
  assert.equal(restored.applicationOperationsById["imported-receipt"].interview.stage, "Hiring manager");
});

test("backup rejects wrong passwords, tampering, unsupported envelopes, and oversized files", async () => {
  const backup = await createEncryptedDashboardBackup(dashboard, password);
  await assert.rejects(() => decryptDashboardBackup(backup, "wrong password"), BackupError);
  const tampered = structuredClone(backup);
  tampered.cipher.ciphertext = `${tampered.cipher.ciphertext.slice(0, -4)}AAAA`;
  await assert.rejects(() => decryptDashboardBackup(tampered, password), BackupError);
  await assert.rejects(
    () => decryptDashboardBackup({ ...backup, exportedAt: "2026-07-26T00:00:00.000Z" }, password),
    BackupError,
  );
  assert.throws(() => validateBackupEnvelope({ format: "other" }), BackupError);
  assert.throws(() => validateBackupEnvelope({ ...backup, exportedAt: "not-a-date" }), BackupError);
  await assert.rejects(
    () => createEncryptedDashboardBackup(dashboard, password, { exportedAt: "not-a-date" }),
    BackupError,
  );
  await assert.rejects(
    () => readEncryptedBackupFile({ size: backupMaxBytes + 1, text: async () => "{}" }),
    BackupError,
  );
});
