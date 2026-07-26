import test from "node:test";
import assert from "node:assert/strict";
import {
  createResumeRewritePayload,
  decideResumeRewriteConsent,
  normalizeResumeRewriteConsent,
  resumeRewriteConsentVersion,
  summarizeResumeRewritePayload,
} from "../src/services/resumeRewriteConsent.js";

test("resume rewrite payload contains only the explicitly disclosed fields", () => {
  const resumeText = "Ada Lovelace\nada@example.com\n+1 555 0100";
  const payload = createResumeRewritePayload({
    message: "  Rewrite only existing bullets.  ",
    resumeText,
    market: "美国",
    language: "英文",
    targetRole: "Software Engineer",
    jdText: "Build reliable systems.",
    candidateProfile: { email: "must-not-leak@example.com" },
    applications: [{ company: "Must not leak" }],
    notesByJobId: { private: "Must not leak" },
  });

  assert.deepEqual(payload, {
    message: "Rewrite only existing bullets.",
    resumeText,
    market: "美国",
    language: "英文",
    targetRole: "Software Engineer",
    jdText: "Build reliable systems.",
  });
  assert.deepEqual(Object.keys(payload), ["message", "resumeText", "market", "language", "targetRole", "jdText"]);
  assert.deepEqual(summarizeResumeRewritePayload(payload, "Master Resume"), {
    sourceName: "Master Resume",
    resumeCharacters: resumeText.length,
    includesFullJobDescription: true,
    jobDescriptionCharacters: 23,
    market: "美国",
    language: "英文",
    targetRole: "Software Engineer",
    message: "Rewrite only existing bullets.",
  });
});

test("consent choices separate cancellation from the existing rewrite request path", () => {
  const acceptedAt = "2026-07-25T00:00:00.000Z";

  assert.deepEqual(decideResumeRewriteConsent("cancel", acceptedAt), {
    execute: false,
    rememberedConsent: null,
  });
  assert.deepEqual(decideResumeRewriteConsent("once", acceptedAt), {
    execute: true,
    rememberedConsent: null,
  });
  assert.deepEqual(decideResumeRewriteConsent("remember", acceptedAt), {
    execute: true,
    rememberedConsent: { version: resumeRewriteConsentVersion, acceptedAt },
  });
});

test("only a current, timestamped remembered consent is restored", () => {
  const acceptedAt = "2026-07-25T00:00:00.000Z";
  assert.deepEqual(normalizeResumeRewriteConsent({ version: resumeRewriteConsentVersion, acceptedAt }), {
    version: resumeRewriteConsentVersion,
    acceptedAt,
  });
  assert.equal(normalizeResumeRewriteConsent({ version: 0, acceptedAt }), null);
  assert.equal(normalizeResumeRewriteConsent({ version: resumeRewriteConsentVersion, acceptedAt: "not-a-date" }), null);
  assert.equal(normalizeResumeRewriteConsent(null), null);
});
