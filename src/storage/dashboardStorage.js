import { inferLegacyTracking } from "../domain/applications.js";
import { hasCurrentJobScore, jobScoreAlgorithmVersion, normalizeRecommendationFunnelMeta, recommendationFunnelAlgorithmVersion } from "../domain/jobDiscovery.js";
import { normalizeResumeRewriteConsent } from "../services/resumeRewriteConsent.js";
import { withNormalizedSourceReceipt } from "../domain/sourceReceipt.js";
import { normalizeApplicationEventsById } from "../domain/applicationEvents.js";

export const dashboardStorageKey = "job-master-dashboard-v7";
export const previousDashboardStorageKey = "job-master-dashboard-v6";
export const legacyDashboardStorageKey = "job-master-dashboard-v5";
export const oldestDashboardStorageKey = "job-master-dashboard-v4";
export const oldestLegacyDashboardStorageKey = "job-master-dashboard-v3";
export const earliestDashboardStorageKey = "job-master-dashboard-v2";
export const earliestLegacyDashboardStorageKey = "job-master-dashboard-v1";
export const dashboardSchemaVersion = 7;
export const dashboardStorageKeys = [
  dashboardStorageKey,
  previousDashboardStorageKey,
  legacyDashboardStorageKey,
  oldestDashboardStorageKey,
  oldestLegacyDashboardStorageKey,
  earliestDashboardStorageKey,
  earliestLegacyDashboardStorageKey,
];

function normalizeApplications(applications) {
  if (!Array.isArray(applications)) return [];
  return applications.map((job) => {
    if (!hasCurrentJobScore(job)) {
      return withNormalizedSourceReceipt({
        ...job,
        userTracked: inferLegacyTracking(job),
        score: null,
        jobScoreAlgorithmVersion: null,
        scoreBreakdown: null,
        matchSignals: [],
        matchedEvidence: [],
        missingSignals: [],
        matchConfidence: "needs-review",
        matchLabel: "待评估",
      });
    }
    return withNormalizedSourceReceipt({ ...job, userTracked: inferLegacyTracking(job) });
  });
}

function normalizeRecommendationMeta(value) {
  const funnel = normalizeRecommendationFunnelMeta(value?.funnel);
  if (value?.jobScoreAlgorithmVersion !== jobScoreAlgorithmVersion
    || value?.recommendationFunnelAlgorithmVersion !== recommendationFunnelAlgorithmVersion
    || !funnel) return null;
  const safeText = (item, max = 240) => typeof item === "string" ? item.trim().slice(0, max) : "";
  const safeCount = (item, fallback = 0) => Number.isSafeInteger(item) && item >= 0 ? item : fallback;
  const signals = Array.isArray(value.signals)
    ? [...new Set(value.signals.map((item) => safeText(item, 80)).filter(Boolean))].slice(0, 6)
    : [];
  return {
    source: safeText(value.source),
    targetRole: safeText(value.targetRole, 120),
    market: safeText(value.market, 40),
    employmentType: safeText(value.employmentType, 40),
    matchedAt: safeText(value.matchedAt, 80),
    signals,
    batch: Math.max(1, safeCount(value.batch, 1)),
    newCount: safeCount(value.newCount),
    remainingCount: safeCount(value.remainingCount),
    discoveryMode: safeText(value.discoveryMode, 40),
    jobScoreAlgorithmVersion,
    recommendationFunnelAlgorithmVersion,
    funnel,
  };
}

export function migrateDashboard(rawDashboard) {
  const raw = rawDashboard && typeof rawDashboard === "object" ? rawDashboard : {};
  return {
    ...raw,
    schemaVersion: dashboardSchemaVersion,
    applications: normalizeApplications(raw.applications),
    // V7 keeps the same dashboard envelope; event history is an optional, fail-closed field.
    applicationEventsById: normalizeApplicationEventsById(raw.applicationEventsById),
    recommendationMeta: normalizeRecommendationMeta(raw.recommendationMeta),
    liveJobsByDiscoveryKey: raw.liveJobsByDiscoveryKey && typeof raw.liveJobsByDiscoveryKey === "object"
      ? Object.fromEntries(Object.entries(raw.liveJobsByDiscoveryKey).map(([key, jobs]) => [
        key,
        Array.isArray(jobs) ? jobs.map(withNormalizedSourceReceipt) : [],
      ]))
      : {},
    outputLanguage: ["英文", "中文", "中英双语"].includes(raw.outputLanguage)
      ? raw.outputLanguage
      : "英文",
    resumePageSize: ["A4", "Letter"].includes(raw.resumePageSize)
      ? raw.resumePageSize
      : "A4",
    resumeRewriteConsent: normalizeResumeRewriteConsent(raw.resumeRewriteConsent),
  };
}

export function readDashboard(storage = window.localStorage) {
  try {
    const serialized = dashboardStorageKeys.map((key) => storage.getItem(key)).find(Boolean);
    return migrateDashboard(serialized ? JSON.parse(serialized) : {});
  } catch {
    return migrateDashboard({});
  }
}

export function writeDashboard(dashboard, storage = window.localStorage) {
  const nextDashboard = {
    ...dashboard,
    schemaVersion: dashboardSchemaVersion,
  };
  storage.setItem(dashboardStorageKey, JSON.stringify(nextDashboard));
  return nextDashboard;
}

export function clearKnownDashboards(storage = window.localStorage) {
  dashboardStorageKeys.forEach((key) => storage.removeItem(key));
}
