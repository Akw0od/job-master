import {
  applicationStatusKeyByLabel,
  applicationStatusOptions,
  normalizeApplicationStatus,
  isSpecificApplicationUrl,
} from "./applications.js";
import { normalizeReceiptUrl } from "./sourceReceipt.js";

export const applicationEventSchemaVersion = 1;
export const applicationEventTypes = Object.freeze([
  "status.changed", "status.reverted", "application.opened", "preflight.passed",
  "submission.authorized", "submission.started", "submission.completed", "submission.paused", "submission.failed",
]);

const eventTypes = new Set(applicationEventTypes);
const statuses = new Set(applicationStatusOptions);
const terminalDuplicateStatuses = new Set(["已投递", "面试", "Offer", "未通过"]);
const maxEventsPerApplication = 50;
const maxEventsGlobally = 500;
const safeMetadataKeys = new Set([
  "resumeVersionId", "sourceReceiptFingerprint", "authorizedGroups", "warningCodes",
  "payloadFingerprint", "authorizationId", "submissionMode", "attemptId", "resultCode", "confirmationFingerprint",
]);
const safeText = (value, max = 160) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : "";
const safeEventId = (value) => {
  const normalized = safeText(value, 120);
  return /^[a-z0-9._:-]{1,120}$/i.test(normalized) ? normalized : "";
};
const normalizedStatus = (value) => {
  const result = normalizeApplicationStatus(safeText(value, 32));
  return statuses.has(result) ? result : "";
};
const compareEvents = (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id);
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function safeMetadata(value) {
  if (!isPlainObject(value) || Object.keys(value).some((key) => !safeMetadataKeys.has(key))) return null;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "authorizedGroups" || key === "warningCodes") {
      if (!Array.isArray(item) || item.length > 12 || item.some((code) => !/^[a-z0-9._-]{1,80}$/i.test(code))) return null;
      result[key] = [...new Set(item)].sort();
    } else {
      if (!/^[a-z0-9._:-]{1,160}$/i.test(safeText(item, 160))) return null;
      result[key] = safeText(item, 160);
    }
  }
  return result;
}

function normalizeCandidateEvent(value) {
  if (!isPlainObject(value) || value.schemaVersion !== applicationEventSchemaVersion) return null;
  const id = safeEventId(value.id);
  const applicationId = safeText(value.applicationId, 120);
  const type = safeText(value.type, 64);
  const occurredAt = safeText(value.occurredAt, 40);
  if (!id || !applicationId || !eventTypes.has(type) || !Number.isFinite(Date.parse(occurredAt))) return null;
  const metadata = safeMetadata(value.metadata ?? {});
  if (metadata === null) return null;
  const event = { schemaVersion: applicationEventSchemaVersion, id, applicationId, type, occurredAt: new Date(occurredAt).toISOString() };
  if (Object.keys(metadata).length) event.metadata = metadata;

  if (type === "status.changed" || type === "status.reverted") {
    event.fromStatus = normalizedStatus(value.fromStatus);
    event.toStatus = normalizedStatus(value.toStatus);
    if (!event.fromStatus || !event.toStatus || event.fromStatus === event.toStatus) return null;
  }
  if (type === "status.reverted") {
    event.revertsEventId = safeText(value.revertsEventId, 120);
    if (!event.revertsEventId || event.revertsEventId === id) return null;
  }
  return event;
}

/** Fail-closed migration boundary for persisted event maps. */
export function normalizeApplicationEventsById(value) {
  if (!isPlainObject(value)) return {};
  const candidates = [];
  for (const [applicationId, events] of Object.entries(value)) {
    if (!Array.isArray(events) || !safeText(applicationId, 120)) continue;
    for (const event of events) {
      const normalized = normalizeCandidateEvent(event);
      if (normalized && normalized.applicationId === applicationId) candidates.push(normalized);
    }
  }
  candidates.sort(compareEvents);
  const seenIds = new Set();
  const unique = candidates.filter((event) => {
    if (seenIds.has(event.id)) return false;
    seenIds.add(event.id);
    return true;
  });
  const candidatesByApp = new Map();
  for (const event of unique) {
    const events = candidatesByApp.get(event.applicationId) ?? [];
    events.push(event);
    candidatesByApp.set(event.applicationId, events);
  }
  const accepted = [];
  for (const events of candidatesByApp.values()) {
    const statusChanges = [];
    let currentStatus = "";
    for (const event of events) {
      if (event.type === "status.changed") {
        if (currentStatus && event.fromStatus !== currentStatus) continue;
        statusChanges.push(event);
        currentStatus = event.toStatus;
      }
      if (event.type === "status.reverted") {
        const target = statusChanges.at(-1);
        if (!target || currentStatus !== event.fromStatus || target.id !== event.revertsEventId
          || target.toStatus !== event.fromStatus || target.fromStatus !== event.toStatus) continue;
        statusChanges.pop();
        currentStatus = event.toStatus;
      }
      accepted.push(event);
    }
  }
  accepted.sort(compareEvents);
  const newestGlobal = accepted.slice(-maxEventsGlobally);
  const newestByApp = new Map();
  for (const event of newestGlobal) {
    const events = newestByApp.get(event.applicationId) ?? [];
    events.push(event);
    newestByApp.set(event.applicationId, events);
  }
  const result = {};
  for (const [id, events] of newestByApp) {
    const retained = events.slice(-maxEventsPerApplication).sort(compareEvents);
    const ids = new Set(retained.map((event) => event.id));
    const withoutOrphanedReverts = retained.filter((event) => event.type !== "status.reverted" || ids.has(event.revertsEventId));
    if (withoutOrphanedReverts.length) result[id] = withoutOrphanedReverts;
  }
  return result;
}

export function normalizeApplicationEventState(state) {
  const applications = Array.isArray(state?.applications) ? state.applications.map((application) => ({ ...application })) : [];
  return { applications, applicationEventsById: normalizeApplicationEventsById(state?.applicationEventsById) };
}

export function getApplicationEvents(state, applicationId) {
  return normalizeApplicationEventsById(state?.applicationEventsById)[applicationId] ?? [];
}

export function getLatestApplicationEvent(state, applicationId) {
  const events = getApplicationEvents(state, applicationId);
  return events.at(-1) ?? null;
}

export function getApplicationStatusRevertibility(state, applicationId) {
  const normalized = normalizeApplicationEventState(state);
  const application = normalized.applications.find((item) => item?.id === applicationId);
  const current = normalizedStatus(application?.status);
  if (!application || !current) return { canRevert: false, reason: "application-not-found", event: null };
  const events = normalized.applicationEventsById[applicationId] ?? [];
  const reverted = new Set(events.filter((event) => event.type === "status.reverted").map((event) => event.revertsEventId));
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "status.changed" && !reverted.has(event.id)) {
      if (event.toStatus !== current) return { canRevert: false, reason: "stale-status-change", event: null };
      return { canRevert: true, reason: "ok", event };
    }
  }
  return { canRevert: false, reason: "no-status-change", event: null };
}

function eventTimestamp(value, wasProvided) {
  if (!wasProvided) return new Date().toISOString();
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) return "";
  return new Date(value).toISOString();
}

function nextEventId(applicationId, occurredAt, existing, requestedId, wasProvided) {
  const preferred = safeEventId(requestedId);
  const ids = new Set(existing.map((event) => event.id));
  if (wasProvided) return preferred && !ids.has(preferred) ? preferred : "";
  const applicationToken = String(applicationId)
    .replace(/[^a-z0-9._:-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "application";
  const base = `evt-${applicationToken}-${occurredAt.replace(/[^0-9]/g, "")}`;
  let number = 1;
  const candidate = () => `${base}-${String(number).padStart(4, "0")}`;
  while (ids.has(candidate())) number += 1;
  return candidate();
}

function appendEvent(state, applicationId, type, fields, options = {}) {
  const normalized = normalizeApplicationEventState(state);
  const application = normalized.applications.find((item) => item?.id === applicationId);
  if (!application) return { state: normalized, changed: false, event: null, reason: "application-not-found" };
  const safeOptions = isPlainObject(options) ? options : {};
  const occurredAt = eventTimestamp(safeOptions.occurredAt, Object.hasOwn(safeOptions, "occurredAt"));
  const prior = normalized.applicationEventsById[applicationId] ?? [];
  const existing = Object.values(normalized.applicationEventsById).flat();
  const eventId = nextEventId(applicationId, occurredAt, existing, safeOptions.eventId, Object.hasOwn(safeOptions, "eventId"));
  if (!occurredAt || !eventId) return { state: normalized, changed: false, event: null, reason: "invalid-event" };
  const candidate = normalizeCandidateEvent({
    schemaVersion: applicationEventSchemaVersion,
    id: eventId, applicationId, type, occurredAt,
    metadata: fields.metadata ?? {}, ...fields,
  });
  if (!candidate) return { state: normalized, changed: false, event: null, reason: "invalid-event" };
  const applicationEventsById = normalizeApplicationEventsById({ ...normalized.applicationEventsById, [applicationId]: [...prior, candidate] });
  if (!(applicationEventsById[applicationId] ?? []).some((event) => event.id === candidate.id)) {
    return { state: normalized, changed: false, event: null, reason: "invalid-event-sequence" };
  }
  return { state: { ...normalized, applicationEventsById }, changed: true, event: candidate, reason: "ok" };
}

export function transitionApplicationStatus(state, applicationId, nextStatus, options = {}) {
  const safeOptions = isPlainObject(options) ? options : {};
  const normalized = normalizeApplicationEventState(state);
  const index = normalized.applications.findIndex((item) => item?.id === applicationId);
  const application = normalized.applications[index];
  const fromStatus = normalizedStatus(application?.status);
  const toStatus = normalizedStatus(nextStatus);
  if (!application || !fromStatus) return { state: normalized, changed: false, event: null, reason: "application-not-found" };
  if (!toStatus) return { state: normalized, changed: false, event: null, reason: "invalid-status" };
  if (fromStatus === toStatus) return { state: normalized, changed: false, event: null, reason: "same-status" };
  const appended = appendEvent(normalized, applicationId, "status.changed", { fromStatus, toStatus, metadata: safeOptions.metadata ?? {} }, safeOptions);
  if (!appended.changed) return appended;
  const updated = {
    ...application, status: toStatus, statusKey: applicationStatusKeyByLabel[toStatus],
    stage: toStatus === "已归档" ? "已归档" : "进行中", userTracked: true,
    updated: safeText(safeOptions.updated, 80) || appended.event.occurredAt,
  };
  const applications = [...appended.state.applications];
  applications[index] = updated;
  return { ...appended, state: { ...appended.state, applications } };
}

export function revertLatestApplicationStatusChange(state, applicationId, options = {}) {
  const safeOptions = isPlainObject(options) ? options : {};
  const normalized = normalizeApplicationEventState(state);
  const possibility = getApplicationStatusRevertibility(normalized, applicationId);
  if (!possibility.canRevert) return { state: normalized, changed: false, event: null, reason: possibility.reason };
  const reverted = appendEvent(normalized, applicationId, "status.reverted", {
    fromStatus: possibility.event.toStatus, toStatus: possibility.event.fromStatus, revertsEventId: possibility.event.id,
    metadata: safeOptions.metadata ?? {},
  }, safeOptions);
  if (!reverted.changed) return reverted;
  const index = reverted.state.applications.findIndex((item) => item?.id === applicationId);
  const application = reverted.state.applications[index];
  const applications = [...reverted.state.applications];
  applications[index] = {
    ...application, status: possibility.event.fromStatus, statusKey: applicationStatusKeyByLabel[possibility.event.fromStatus],
    stage: possibility.event.fromStatus === "已归档" ? "已归档" : "进行中", userTracked: true,
    updated: safeText(safeOptions.updated, 80) || reverted.event.occurredAt,
  };
  return { ...reverted, state: { ...reverted.state, applications } };
}

export const appendApplicationOpened = (state, applicationId, options = {}) => {
  const safeOptions = isPlainObject(options) ? options : {};
  return appendEvent(state, applicationId, "application.opened", { metadata: safeOptions.metadata ?? {} }, safeOptions);
};
export const appendPreflightPassed = (state, applicationId, options = {}) => {
  const safeOptions = isPlainObject(options) ? options : {};
  return appendEvent(state, applicationId, "preflight.passed", { metadata: safeOptions.metadata ?? {} }, safeOptions);
};
export const appendSubmissionAuthorized = (state, applicationId, options = {}) => {
  const safeOptions = isPlainObject(options) ? options : {};
  return appendEvent(state, applicationId, "submission.authorized", { metadata: safeOptions.metadata ?? {} }, safeOptions);
};
export const appendSubmissionStarted = (state, applicationId, options = {}) => {
  const safeOptions = isPlainObject(options) ? options : {};
  return appendEvent(state, applicationId, "submission.started", { metadata: safeOptions.metadata ?? {} }, safeOptions);
};
export const appendSubmissionCompleted = (state, applicationId, options = {}) => {
  const safeOptions = isPlainObject(options) ? options : {};
  return appendEvent(state, applicationId, "submission.completed", { metadata: safeOptions.metadata ?? {} }, safeOptions);
};
export const appendSubmissionPaused = (state, applicationId, options = {}) => {
  const safeOptions = isPlainObject(options) ? options : {};
  return appendEvent(state, applicationId, "submission.paused", { metadata: safeOptions.metadata ?? {} }, safeOptions);
};
export const appendSubmissionFailed = (state, applicationId, options = {}) => {
  const safeOptions = isPlainObject(options) ? options : {};
  return appendEvent(state, applicationId, "submission.failed", { metadata: safeOptions.metadata ?? {} }, safeOptions);
};

export function hasApplicationEventHistory(state, applicationId) {
  return getApplicationEvents(state, applicationId).length > 0;
}

function specificUrl(value) {
  const normalized = normalizeReceiptUrl(value);
  if (!normalized || !isSpecificApplicationUrl(normalized)) return "";
  const url = new URL(normalized);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}

function normalizedCompanyRole(value) {
  return safeText(value, 160).normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{S}\s_]+/gu, "");
}

function jobIdentity(job) {
  const receipt = job?.sourceReceipt ?? {};
  return {
    provider: safeText(receipt.provider || job?.provider, 80).toLowerCase(),
    providerJobId: safeText(receipt.providerJobId || job?.providerJobId, 120).toLowerCase(),
    url: specificUrl(receipt.applyUrl || job?.applyUrl || job?.url),
    company: normalizedCompanyRole(job?.company), role: normalizedCompanyRole(job?.role),
  };
}

/** Finds active or historical terminal application evidence without returning contact data. */
export function findDuplicateApplications({ job, applications = [], applicationEventsById = {}, excludeApplicationId = "" } = {}) {
  const history = normalizeApplicationEventsById(applicationEventsById);
  const target = jobIdentity(job);
  const matches = [];
  const records = Array.isArray(applications) ? applications : [];
  const selectedId = safeText(excludeApplicationId, 120);
  const selectedRecord = records.find((application) => application?.id === selectedId) ?? (job?.id === selectedId ? job : null);
  if (selectedId && selectedRecord) {
    const current = normalizedStatus(selectedRecord.status);
    const historical = (history[selectedId] ?? []).some((event) => terminalDuplicateStatuses.has(event.toStatus));
    if (terminalDuplicateStatuses.has(current) || historical) matches.push({ applicationId: selectedId, reasonCodes: ["same-application"] });
  }
  for (const application of records) {
    if (!application?.id || application.id === selectedId) continue;
    const candidate = jobIdentity(application);
    const reasonCodes = [];
    if (target.provider && target.providerJobId && target.provider === candidate.provider && target.providerJobId === candidate.providerJobId) reasonCodes.push("provider-job-id");
    if (target.url && target.url === candidate.url) reasonCodes.push("application-url");
    if (target.company && target.role && target.company === candidate.company && target.role === candidate.role) reasonCodes.push("company-role");
    if (!reasonCodes.length) continue;
    const current = normalizedStatus(application.status);
    const historical = (history[application.id] ?? []).some((event) => terminalDuplicateStatuses.has(event.toStatus));
    if (terminalDuplicateStatuses.has(current) || historical) matches.push({ applicationId: application.id, reasonCodes: [...new Set(reasonCodes)].sort() });
  }
  return { duplicate: matches.length > 0, applicationIds: matches.map((item) => item.applicationId), reasonCodes: [...new Set(matches.flatMap((item) => item.reasonCodes))].sort(), matches };
}
