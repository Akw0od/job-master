import { inferLegacyTracking } from "../domain/applications.js";

export const dashboardStorageKey = "job-master-dashboard-v3";
export const previousDashboardStorageKey = "job-master-dashboard-v2";
export const legacyDashboardStorageKey = "job-master-dashboard-v1";
export const dashboardSchemaVersion = 3;
export const dashboardStorageKeys = [
  dashboardStorageKey,
  previousDashboardStorageKey,
  legacyDashboardStorageKey,
];

function normalizeApplications(applications) {
  if (!Array.isArray(applications)) return [];
  return applications.map((job) => ({
    ...job,
    userTracked: inferLegacyTracking(job),
    score: job.matchConfidence ? job.score : null,
  }));
}

export function migrateDashboard(rawDashboard) {
  const raw = rawDashboard && typeof rawDashboard === "object" ? rawDashboard : {};
  return {
    ...raw,
    schemaVersion: dashboardSchemaVersion,
    applications: normalizeApplications(raw.applications),
    liveJobsByDiscoveryKey: raw.liveJobsByDiscoveryKey && typeof raw.liveJobsByDiscoveryKey === "object"
      ? raw.liveJobsByDiscoveryKey
      : {},
    outputLanguage: ["英文", "中文", "中英双语"].includes(raw.outputLanguage)
      ? raw.outputLanguage
      : "英文",
    resumePageSize: ["A4", "Letter"].includes(raw.resumePageSize)
      ? raw.resumePageSize
      : "A4",
  };
}

export function readDashboard(storage = window.localStorage) {
  try {
    const current = storage.getItem(dashboardStorageKey);
    if (current) return migrateDashboard(JSON.parse(current));
    const previous = storage.getItem(previousDashboardStorageKey);
    if (previous) return migrateDashboard(JSON.parse(previous));
    const legacy = storage.getItem(legacyDashboardStorageKey);
    return migrateDashboard(legacy ? JSON.parse(legacy) : {});
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
