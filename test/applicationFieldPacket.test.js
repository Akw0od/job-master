import test from "node:test";
import assert from "node:assert/strict";
import {
  buildApplicationFieldPacket,
  canLaunchApplicationAssist,
  createApplicationAssistAudit,
  hasApplicationAssistSourceChanged,
  validateApplicationContact,
} from "../src/services/applicationFieldPacket.js";

const profile = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+1 555 0100",
  location: "San Francisco, CA",
  linkedin: "https://www.linkedin.com/in/ada",
};

const job = {
  id: "role-123",
  company: "Example Labs",
  role: "Product Engineer",
};

const reviewableResume = `Ada Lovelace
ada@example.com

EDUCATION
Analytical Academy — BSc Mathematics

EXPERIENCE
Example Labs — Engineer
Built a salary prediction model for internal planning.
Work authorization: Ask candidate directly.
Salary expectations: Ask candidate directly.

SKILLS
JavaScript, product design`;

test("field packets use only the explicit contact, education, and experience sources", () => {
  const packet = buildApplicationFieldPacket(profile, reviewableResume);
  const contact = packet.groups.find((group) => group.id === "contact");
  const education = packet.groups.find((group) => group.id === "education");
  const experience = packet.groups.find((group) => group.id === "experience");

  assert.deepEqual(contact.fields.map((field) => field.id), ["name", "email", "phone", "location", "linkedin"]);
  assert.equal(education.fields.length, 1);
  assert.equal(education.fields[0].value, "Analytical Academy — BSc Mathematics");
  assert.equal(experience.fields.length, 1);
  assert.match(experience.fields[0].value, /salary prediction model/);
  assert.doesNotMatch(experience.fields[0].value, /Work authorization|Salary expectations/i);
  assert.equal(experience.excludedLineCount, 2);
  assert.doesNotMatch(JSON.stringify(packet), /JavaScript, product design/);
});

test("unrecognized sections remain unavailable instead of sending the whole resume", () => {
  const packet = buildApplicationFieldPacket(profile, "Ada Lovelace\n\nSUMMARY\nBuilds thoughtful products.\n\nSKILLS\nJavaScript");

  assert.equal(packet.groups.find((group) => group.id === "education").status, "unavailable");
  assert.equal(packet.groups.find((group) => group.id === "experience").status, "unavailable");
  assert.equal(packet.groups.find((group) => group.id === "education").fields.length, 0);
  assert.equal(packet.groups.find((group) => group.id === "experience").fields.length, 0);
});

test("contact validation requires a name and a conservatively valid email", () => {
  assert.deepEqual(validateApplicationContact({ email: "ada@example.com" }), { ready: false, reason: "missing-name" });
  assert.deepEqual(validateApplicationContact({ name: "Ada", email: "ada at example" }), { ready: false, reason: "invalid-email" });
  assert.deepEqual(validateApplicationContact({ name: "Ada", email: "ada@example.com" }), { ready: true, reason: "" });
});

test("launch readiness is false while an application opening locks the reviewed packet", () => {
  const ready = { ready: true, reason: "" };
  const authorization = { contact: true, education: true, experience: false };
  assert.equal(canLaunchApplicationAssist({ contactValidation: ready, authorization, isConfirmed: true, isLaunching: false }), true);
  assert.equal(canLaunchApplicationAssist({ contactValidation: ready, authorization, isConfirmed: true, isLaunching: true }), false);
  assert.equal(canLaunchApplicationAssist({ contactValidation: ready, authorization: { ...authorization, contact: false }, isConfirmed: true, isLaunching: false }), false);
  assert.equal(canLaunchApplicationAssist({ contactValidation: ready, authorization, isConfirmed: false, isLaunching: false }), false);
});

test("application audit records only available authorized groups and detects every source change without plaintext", () => {
  const packet = buildApplicationFieldPacket(profile, reviewableResume);
  const audit = createApplicationAssistAudit({
    job,
    resumeVersionId: "job-v1",
    allowedGroups: ["contact", "education", "experience", "unknown"],
    packet,
    candidateProfile: profile,
    resumeText: reviewableResume,
    preparedAt: "2026-07-25T12:00:00.000Z",
  });

  assert.deepEqual(audit.allowedGroups, ["contact", "education", "experience"]);
  assert.equal(audit.fieldCount, 7);
  assert.equal(audit.preparedAt, "2026-07-25T12:00:00.000Z");
  assert.match(audit.sourceFingerprint, /^v2-[0-9a-f]{8}$/);
  assert.doesNotMatch(JSON.stringify(audit), /ada@example\.com|salary prediction model|Work authorization/);
  const source = { candidateProfile: profile, resumeText: reviewableResume, job, resumeVersionId: "job-v1" };
  assert.equal(hasApplicationAssistSourceChanged(audit, source), false);
  assert.equal(hasApplicationAssistSourceChanged(audit, { ...source, resumeVersionId: "job-v2" }), true);
  assert.equal(hasApplicationAssistSourceChanged(audit, { ...source, job: { ...job, role: "Senior Product Engineer" } }), true);
  assert.equal(hasApplicationAssistSourceChanged(audit, { ...source, candidateProfile: { ...profile, phone: "+1 555 0101" } }), true);
  assert.equal(hasApplicationAssistSourceChanged(audit, { ...source, resumeText: `${reviewableResume}\nNew bullet` }), true);

  const emptyPacket = buildApplicationFieldPacket(profile, "Ada Lovelace\n\nSKILLS\nJavaScript");
  const filteredAudit = createApplicationAssistAudit({
    job,
    resumeVersionId: "job-v1",
    allowedGroups: ["contact", "education", "experience"],
    packet: emptyPacket,
    candidateProfile: profile,
    resumeText: "Ada Lovelace\n\nSKILLS\nJavaScript",
  });
  assert.deepEqual(filteredAudit.allowedGroups, ["contact"]);
  assert.equal(filteredAudit.fieldCount, 5);
});
