import { inferLegacyTracking } from "../domain/applications.js";
import { hasCurrentJobScore, jobScoreAlgorithmVersion } from "../domain/jobDiscovery.js";
import { normalizeResumeRewriteConsent } from "../services/resumeRewriteConsent.js";
import { withNormalizedSourceReceipt } from "../domain/sourceReceipt.js";

export const dashboardStorageKey = "job-master-dashboard-v5";
export const previousDashboardStorageKey = "job-master-dashboard-v4";
export const legacyDashboardStorageKey = "job-master-dashboard-v3";
export const oldestDashboardStorageKey = "job-master-dashboard-v2";
export const oldestLegacyDashboardStorageKey = "job-master-dashboard-v1";
export const dashboardSchemaVersion = 5;
export const dashboardStorageKeys = [
  dashboardStorageKey,
  previousDashboardStorageKey,
  legacyDashboardStorageKey,
  oldestDashboardStorageKey,
  oldestLegacyDashboardStorageKey,
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

export function migrateDashboard(rawDashboard) {
  const raw = rawDashboard && typeof rawDashboard === "object" ? rawDashboard : {};
  return {
    ...raw,
    schemaVersion: dashboardSchemaVersion,
    applications: normalizeApplications(raw.applications),
    recommendationMeta: raw.recommendationMeta?.jobScoreAlgorithmVersion === jobScoreAlgorithmVersion
      ? raw.recommendationMeta
      : null,
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
