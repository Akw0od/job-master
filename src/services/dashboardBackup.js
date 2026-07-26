import { dashboardSchemaVersion, migrateDashboard } from "../storage/dashboardStorage.js";

export const backupFormat = "jobmaster-local-backup";
export const backupVersion = 1;
export const backupMaxBytes = 5 * 1024 * 1024;
const backupIterations = 310_000;
const backupMaxPlaintextBytes = Math.floor(backupMaxBytes * 0.72);

export class BackupError extends Error {}

function requireWebCrypto(cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle || !cryptoImpl?.getRandomValues) {
    throw new BackupError("浏览器不支持加密备份。");
  }
  return cryptoImpl;
}

function assertPassword(password) {
  if (typeof password !== "string" || password.length < 10) {
    throw new BackupError("备份密码至少需要 10 个字符。");
  }
}

function toBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new BackupError("备份格式无效。");
  }
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new BackupError("备份格式无效。");
  }
}

function serializedSize(value) {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}

async function deriveKey(password, salt, cryptoImpl) {
  const passwordKey = await cryptoImpl.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoImpl.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: backupIterations },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function validateBackupEnvelope(backup) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup) || serializedSize(backup) > backupMaxBytes) {
    throw new BackupError("备份文件无效或过大。");
  }
  if (
    backup.format !== backupFormat
    || backup.version !== backupVersion
    || !Number.isInteger(backup.schemaVersion)
    || backup.schemaVersion < 1
    || backup.schemaVersion > dashboardSchemaVersion
    || typeof backup.exportedAt !== "string"
    || !Number.isFinite(Date.parse(backup.exportedAt))
    || backup.kdf?.name !== "PBKDF2"
    || backup.kdf?.hash !== "SHA-256"
    || backup.kdf?.iterations !== backupIterations
    || backup.cipher?.name !== "AES-GCM"
  ) {
    throw new BackupError("备份格式或版本不受支持。");
  }
  const salt = fromBase64(backup.kdf.salt);
  const iv = fromBase64(backup.cipher.iv);
  const ciphertext = fromBase64(backup.cipher.ciphertext);
  if (salt.byteLength !== 16 || iv.byteLength !== 12 || !ciphertext.byteLength) {
    throw new BackupError("备份加密参数无效。");
  }
  return { salt, iv, ciphertext };
}

export async function createEncryptedDashboardBackup(dashboard, password, {
  cryptoImpl = globalThis.crypto,
  exportedAt = new Date().toISOString(),
} = {}) {
  assertPassword(password);
  if (typeof exportedAt !== "string" || !Number.isFinite(Date.parse(exportedAt))) {
    throw new BackupError("备份时间无效。");
  }
  const crypto = requireWebCrypto(cryptoImpl);
  const plaintext = JSON.stringify({
    format: backupFormat,
    version: backupVersion,
    schemaVersion: dashboardSchemaVersion,
    exportedAt,
    dashboard: migrateDashboard(dashboard),
  });
  if (serializedSize(plaintext) > backupMaxPlaintextBytes) throw new BackupError("本地草稿过大，无法创建备份。");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, crypto);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  ));
  const backup = {
    format: backupFormat,
    version: backupVersion,
    schemaVersion: dashboardSchemaVersion,
    exportedAt,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: backupIterations, salt: toBase64(salt) },
    cipher: { name: "AES-GCM", iv: toBase64(iv), ciphertext: toBase64(ciphertext) },
  };
  if (serializedSize(backup) > backupMaxBytes) throw new BackupError("本地草稿过大，无法创建备份。");
  return backup;
}

export async function decryptDashboardBackup(backup, password, { cryptoImpl = globalThis.crypto } = {}) {
  assertPassword(password);
  const crypto = requireWebCrypto(cryptoImpl);
  const { salt, iv, ciphertext } = validateBackupEnvelope(backup);
  try {
    const key = await deriveKey(password, salt, crypto);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    if (
      payload?.format !== backup.format
      || payload.version !== backup.version
      || payload.schemaVersion !== backup.schemaVersion
      || payload.exportedAt !== backup.exportedAt
      || !payload.dashboard
      || typeof payload.dashboard !== "object"
      || Array.isArray(payload.dashboard)
    ) {
      throw new BackupError("备份内容无效。");
    }
    return migrateDashboard(payload.dashboard);
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("密码错误或备份文件已损坏。");
  }
}

export async function readEncryptedBackupFile(file) {
  if (!file || typeof file.text !== "function" || !Number.isFinite(file.size) || file.size < 1 || file.size > backupMaxBytes) {
    throw new BackupError("请选择不超过 5 MB 的 Jobmaster 备份文件。");
  }
  try {
    const text = await file.text();
    if (serializedSize(text) > backupMaxBytes) throw new BackupError("备份文件无效或过大。");
    const backup = JSON.parse(text);
    validateBackupEnvelope(backup);
    return backup;
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("备份文件无效或已损坏。");
  }
}
