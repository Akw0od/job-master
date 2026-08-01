import { hashText, isTrackedApplication, normalizeApplicationStatus } from "./applications.js";
import { hasFreshOpenSourceReceipt, manualSubmissionEvidenceCodes } from "./applicationPreflight.js";

export const applicationOperationsSchemaVersion = 1;

const maxApplications = 100;
const maxInterviewQuestions = 20;
const maxStarStories = 12;
const submissionConfirmationModes = new Set(["manual-confirmed", "automation-confirmed"]);
const submissionEvidenceCodes = new Set([...manualSubmissionEvidenceCodes, "provider-confirmation"]);
const postSubmissionStatuses = new Set(["已投递", "面试", "Offer", "未通过"]);
const safeText = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const safeCode = (value, max = 160) => {
  const normalized = safeText(value, max);
  return /^[a-z0-9._:-]+$/i.test(normalized) ? normalized : "";
};
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isoTime = (value) => {
  const normalized = safeText(value, 40);
  return Number.isFinite(Date.parse(normalized)) ? new Date(normalized).toISOString() : "";
};

function normalizeSubmittedPackage(value) {
  if (!isPlainObject(value)) return null;
  const resumeVersionId = safeCode(value.resumeVersionId);
  const receiptFingerprint = safeCode(value.receiptFingerprint);
  const payloadFingerprint = safeCode(value.payloadFingerprint);
  const confirmedAt = isoTime(value.confirmedAt);
  if (!resumeVersionId || !receiptFingerprint || !payloadFingerprint || !confirmedAt) return null;
  const confirmationMode = submissionConfirmationModes.has(value.confirmationMode) ? value.confirmationMode : "";
  const evidenceCode = submissionEvidenceCodes.has(value.evidenceCode) ? value.evidenceCode : "";
  if (Boolean(confirmationMode) !== Boolean(evidenceCode)) return null;
  return {
    resumeVersionId,
    receiptFingerprint,
    payloadFingerprint,
    confirmedAt,
    ...(confirmationMode ? { confirmationMode, evidenceCode } : {}),
  };
}

function normalizeInterviewQuestion(value) {
  if (!isPlainObject(value)) return null;
  const id = safeCode(value.id, 120);
  const question = safeText(value.question, 500);
  const notes = safeText(value.notes, 4_000);
  const status = ["unprepared", "drafted", "practiced"].includes(value.status) ? value.status : "unprepared";
  return id && question ? { id, question, notes, status } : null;
}

function normalizeStarStory(value) {
  if (!isPlainObject(value)) return null;
  const id = safeCode(value.id, 120);
  const title = safeText(value.title, 240);
  if (!id || !title) return null;
  return {
    id,
    title,
    situation: safeText(value.situation, 1_500),
    task: safeText(value.task, 1_500),
    action: safeText(value.action, 2_000),
    result: safeText(value.result, 1_500),
    sourceRef: safeText(value.sourceRef, 240),
    confirmed: value.confirmed === true,
  };
}

function normalizeInterview(value) {
  if (!isPlainObject(value)) return null;
  const scheduledAt = isoTime(value.scheduledAt);
  const stage = safeText(value.stage, 80);
  const notes = safeText(value.notes, 8_000);
  const questions = Array.isArray(value.questions)
    ? value.questions.map(normalizeInterviewQuestion).filter(Boolean).slice(0, maxInterviewQuestions)
    : [];
  const starStories = Array.isArray(value.starStories)
    ? value.starStories.map(normalizeStarStory).filter(Boolean).slice(0, maxStarStories)
    : [];
  if (!scheduledAt && !stage && !notes && !questions.length && !starStories.length) return null;
  return { scheduledAt, stage, notes, questions, starStories };
}

function normalizeOperation(value, expectedId = "") {
  if (!isPlainObject(value) || value.schemaVersion !== applicationOperationsSchemaVersion) return null;
  const applicationId = safeText(value.applicationId, 120);
  if (!applicationId || (expectedId && applicationId !== expectedId)) return null;
  const result = { schemaVersion: applicationOperationsSchemaVersion, applicationId };
  const followUpAt = isoTime(value.followUpAt);
  const submittedAt = isoTime(value.submittedAt);
  const lastContactAt = isoTime(value.lastContactAt);
  const submittedPackage = normalizeSubmittedPackage(value.submittedPackage);
  const interview = normalizeInterview(value.interview);
  if (followUpAt) result.followUpAt = followUpAt;
  if (submittedAt) result.submittedAt = submittedAt;
  if (lastContactAt) result.lastContactAt = lastContactAt;
  if (submittedPackage) result.submittedPackage = submittedPackage;
  if (interview) result.interview = interview;
  return result;
}

export function normalizeApplicationOperationsById(value) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .slice(0, maxApplications)
    .map(([applicationId, operation]) => [applicationId, normalizeOperation(operation, applicationId)])
    .filter(([, operation]) => Boolean(operation)));
}

export function addBusinessDays(value, days = 5) {
  const source = new Date(value);
  if (!Number.isFinite(source.getTime()) || !Number.isSafeInteger(days) || days < 0 || days > 30) return "";
  const next = new Date(source);
  let remaining = days;
  while (remaining > 0) {
    next.setUTCDate(next.getUTCDate() + 1);
    if (![0, 6].includes(next.getUTCDay())) remaining -= 1;
  }
  return next.toISOString();
}

export function buildManualSubmissionPayloadFingerprint(input = {}) {
  const applicationId = safeCode(input.applicationId, 120);
  const resumeVersionId = safeCode(input.resumeVersionId);
  const receiptFingerprint = safeCode(input.receiptFingerprint);
  const evidenceCode = submissionEvidenceCodes.has(input.evidenceCode) ? input.evidenceCode : "";
  const submittedAt = isoTime(input.submittedAt);
  if (!applicationId || !resumeVersionId || !receiptFingerprint || !evidenceCode || !submittedAt) return "";
  return `mp1-${hashText(JSON.stringify({
    applicationId, resumeVersionId, receiptFingerprint, evidenceCode, submittedAt,
  }))}`;
}

export function requiresConfirmedSubmission(statusInput, operationInput) {
  const status = normalizeApplicationStatus(statusInput);
  return postSubmissionStatuses.has(status) && !normalizeSubmittedPackage(operationInput?.submittedPackage);
}

export function recordConfirmedSubmission(operationsById, applicationIdInput, input = {}) {
  const current = normalizeApplicationOperationsById(operationsById);
  const applicationId = safeText(applicationIdInput, 120);
  const submittedAt = isoTime(input.submittedAt ?? new Date().toISOString());
  const submittedPackage = normalizeSubmittedPackage({
    resumeVersionId: input.resumeVersionId,
    receiptFingerprint: input.receiptFingerprint,
    payloadFingerprint: input.payloadFingerprint,
    confirmedAt: submittedAt,
    confirmationMode: input.confirmationMode,
    evidenceCode: input.evidenceCode,
  });
  if (!applicationId || !submittedAt || !submittedPackage
    || !submittedPackage.confirmationMode || !submittedPackage.evidenceCode) {
    return { operationsById: current, changed: false, reason: "invalid-submission" };
  }
  const followUpAt = isoTime(input.followUpAt) || addBusinessDays(submittedAt, 5);
  const next = {
    ...(current[applicationId] ?? {}),
    schemaVersion: applicationOperationsSchemaVersion,
    applicationId,
    submittedAt,
    followUpAt,
    submittedPackage,
  };
  return {
    operationsById: normalizeApplicationOperationsById({ ...current, [applicationId]: next }),
    changed: true,
    reason: "ok",
  };
}

export function scheduleApplicationFollowUp(operationsById, applicationIdInput, followUpAtInput) {
  const current = normalizeApplicationOperationsById(operationsById);
  const applicationId = safeText(applicationIdInput, 120);
  const followUpAt = isoTime(followUpAtInput);
  if (!applicationId || !followUpAt) return { operationsById: current, changed: false, reason: "invalid-follow-up" };
  const next = {
    ...(current[applicationId] ?? {}),
    schemaVersion: applicationOperationsSchemaVersion,
    applicationId,
    followUpAt,
  };
  return {
    operationsById: normalizeApplicationOperationsById({ ...current, [applicationId]: next }),
    changed: true,
    reason: "ok",
  };
}

export function recordApplicationFollowUp(operationsById, applicationIdInput, contactedAtInput = new Date().toISOString()) {
  const current = normalizeApplicationOperationsById(operationsById);
  const applicationId = safeText(applicationIdInput, 120);
  const lastContactAt = isoTime(contactedAtInput);
  if (!applicationId || !lastContactAt) {
    return { operationsById: current, changed: false, reason: "invalid-follow-up" };
  }
  const existing = { ...(current[applicationId] ?? {}) };
  delete existing.followUpAt;
  const next = {
    ...existing,
    schemaVersion: applicationOperationsSchemaVersion,
    applicationId,
    lastContactAt,
  };
  return {
    operationsById: normalizeApplicationOperationsById({ ...current, [applicationId]: next }),
    changed: true,
    reason: "ok",
  };
}

export function updateApplicationInterview(operationsById, applicationIdInput, interviewInput) {
  const current = normalizeApplicationOperationsById(operationsById);
  const applicationId = safeText(applicationIdInput, 120);
  const interview = normalizeInterview(interviewInput);
  if (!applicationId || !interview) return { operationsById: current, changed: false, reason: "invalid-interview" };
  const next = {
    ...(current[applicationId] ?? {}),
    schemaVersion: applicationOperationsSchemaVersion,
    applicationId,
    interview,
  };
  return {
    operationsById: normalizeApplicationOperationsById({ ...current, [applicationId]: next }),
    changed: true,
    reason: "ok",
  };
}

function hasSavedJobResume(resumeVersions, applicationId) {
  return Array.isArray(resumeVersions) && resumeVersions.some((version) => (
    version?.layer === "job" && version?.jobId === applicationId && safeText(version.content, 20_000)
  ));
}

export function buildTodayActionQueue({
  applications = [],
  resumeVersions = [],
  operationsById = {},
  now = new Date().toISOString(),
  limit = 5,
} = {}) {
  const timestamp = Date.parse(now);
  const operations = normalizeApplicationOperationsById(operationsById);
  if (!Array.isArray(applications) || !Number.isFinite(timestamp)) return [];
  const boundedLimit = Number.isSafeInteger(limit) ? Math.min(10, Math.max(1, limit)) : 5;
  const actions = [];
  for (const job of applications) {
    const applicationId = safeText(job?.id, 120);
    if (!applicationId) continue;
    const status = normalizeApplicationStatus(job.status);
    const operation = operations[applicationId] ?? {};
    let actionCode;
    let priority;
    const reasonCodes = [];
    if (status === "面试") {
      actionCode = "prepare-interview";
      priority = 140;
      reasonCodes.push("interview-active");
      if (operation.interview?.scheduledAt) reasonCodes.push("interview-scheduled");
    } else if (status === "已投递") {
      const followUpTime = Date.parse(operation.followUpAt);
      if (Number.isFinite(followUpTime) && followUpTime <= timestamp) {
        actionCode = "follow-up";
        priority = 130;
        reasonCodes.push("follow-up-due");
      } else {
        actionCode = "track-application";
        priority = 45;
        reasonCodes.push(Number.isFinite(followUpTime) ? "follow-up-scheduled" : "follow-up-not-scheduled");
      }
    } else if (["Offer", "未通过", "已归档"].includes(status)) {
      continue;
    } else if (job.verificationStatus === "unavailable") {
      continue;
    } else if (!hasFreshOpenSourceReceipt(job, timestamp)) {
      actionCode = "verify-role";
      priority = 120;
      reasonCodes.push("receipt-not-fresh");
    } else if (!hasSavedJobResume(resumeVersions, applicationId)) {
      actionCode = "tailor-resume";
      priority = 110;
      reasonCodes.push("job-resume-missing");
    } else {
      actionCode = "review-application";
      priority = 100;
      reasonCodes.push("job-resume-ready", "receipt-fresh");
    }
    if (Number.isFinite(job.score)) priority += Math.max(0, Math.min(20, Math.round(job.score / 5)));
    actions.push({
      applicationId,
      actionCode,
      priority,
      reasonCodes,
      company: safeText(job.company, 160),
      role: safeText(job.role, 200),
      status,
      dueAt: operation.followUpAt ?? operation.interview?.scheduledAt ?? "",
    });
  }
  return actions.sort((left, right) => (
    right.priority - left.priority
    || left.company.localeCompare(right.company)
    || left.role.localeCompare(right.role)
    || left.applicationId.localeCompare(right.applicationId)
  )).slice(0, boundedLimit);
}

function rate(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1_000) / 10 : null;
}

export function buildApplicationAnalytics(applications = []) {
  const records = Array.isArray(applications) ? applications : [];
  const trackedRecords = records.filter(isTrackedApplication);
  const statuses = trackedRecords.map((job) => normalizeApplicationStatus(job.status));
  const discovered = records.length;
  const saved = statuses.filter((status) => ["收藏", "准备中", "已投递", "面试", "Offer", "未通过"].includes(status)).length;
  const applied = statuses.filter((status) => ["已投递", "面试", "Offer", "未通过"].includes(status)).length;
  const interviews = statuses.filter((status) => ["面试", "Offer"].includes(status)).length;
  const offers = statuses.filter((status) => status === "Offer").length;
  const bySource = new Map();
  records.forEach((job) => {
    const source = safeText(job?.source, 120) || "unknown";
    const current = bySource.get(source) ?? { source, discovered: 0, applied: 0, interviews: 0, offers: 0 };
    const status = normalizeApplicationStatus(job?.status);
    const tracked = isTrackedApplication(job);
    current.discovered += 1;
    if (tracked && ["已投递", "面试", "Offer", "未通过"].includes(status)) current.applied += 1;
    if (tracked && ["面试", "Offer"].includes(status)) current.interviews += 1;
    if (tracked && status === "Offer") current.offers += 1;
    bySource.set(source, current);
  });
  return {
    counts: { discovered, saved, applied, interviews, offers },
    conversions: {
      discoveredToApplied: rate(applied, discovered),
      appliedToInterview: rate(interviews, applied),
      interviewToOffer: rate(offers, interviews),
    },
    bySource: [...bySource.values()].map((row) => ({
      ...row,
      appliedToInterview: rate(row.interviews, row.applied),
      trendEligible: row.applied >= 5,
    })).sort((left, right) => right.applied - left.applied || left.source.localeCompare(right.source)),
  };
}

export function buildInterviewPrepOutline(job = {}, resumeVersion = {}) {
  const evidence = Array.isArray(job.matchedEvidence)
    ? [...new Set(job.matchedEvidence.map((item) => safeText(item, 240)).filter(Boolean))].slice(0, 6)
    : [];
  const gaps = Array.isArray(job.missingSignals)
    ? [...new Set(job.missingSignals.map((item) => safeText(item, 160)).filter(Boolean))].slice(0, 6)
    : [];
  const role = safeText(job.role, 200) || "the role";
  return {
    applicationId: safeText(job.id, 120),
    resumeVersionId: safeCode(resumeVersion.id, 160),
    evidence,
    gaps,
    questions: [
      `为什么你对 ${role} 感兴趣？`,
      "请介绍已投递简历中与这个岗位最相关的项目。",
      "请描述一次困难的权衡、你做出的决定以及结果。",
      "这个岗位的哪项要求需要你最快补齐能力？",
    ],
    guardrails: [
      "Use only evidence from the submitted resume version.",
      "Mark missing metrics or ownership details for candidate confirmation.",
      "Do not invent authorization, compensation, employer, or outcome facts.",
    ],
  };
}
