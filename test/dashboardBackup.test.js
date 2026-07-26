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

const password = "safe backup password";
const dashboard = {
  applications: [],
  resumeVersions: [{ id: "master-resume", content: "Ada Lovelace\nada@example.com\nSensitive resume facts" }],
  candidateProfile: { name: "Ada Lovelace", email: "ada@example.com" },
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
