export const resumeRewriteConsentVersion = 1;

export function normalizeResumeRewriteConsent(value) {
  if (
    !value
    || typeof value !== "object"
    || value.version !== resumeRewriteConsentVersion
    || !Number.isFinite(Date.parse(value.acceptedAt))
  ) return null;
  return { version: resumeRewriteConsentVersion, acceptedAt: value.acceptedAt };
}

export function createResumeRewritePayload({ message, resumeText, market, language, targetRole, jdText = "" }) {
  return {
    message: String(message ?? "").trim(),
    resumeText: String(resumeText ?? ""),
    market: String(market ?? ""),
    language: String(language ?? ""),
    targetRole: String(targetRole ?? ""),
    jdText: String(jdText ?? ""),
  };
}

export function summarizeResumeRewritePayload(payload, sourceName = "Master Resume") {
  return {
    sourceName: String(sourceName || "Master Resume"),
    resumeCharacters: payload.resumeText.length,
    includesFullJobDescription: Boolean(payload.jdText.trim()),
    jobDescriptionCharacters: payload.jdText.length,
    market: payload.market,
    language: payload.language,
    targetRole: payload.targetRole,
    message: payload.message,
  };
}

export function decideResumeRewriteConsent(choice, acceptedAt = new Date().toISOString()) {
  if (choice === "once") return { execute: true, rememberedConsent: null };
  if (choice === "remember") {
    return {
      execute: true,
      rememberedConsent: { version: resumeRewriteConsentVersion, acceptedAt },
    };
  }
  return { execute: false, rememberedConsent: null };
}
