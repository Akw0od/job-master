const trackedStatuses = new Set(["收藏", "准备中", "已投递", "面试", "Offer", "未通过", "已归档"]);

export const applicationStatusOptions = ["收藏", "准备中", "已投递", "面试", "Offer", "未通过", "已归档"];

export const applicationStatusKeyByLabel = {
  收藏: "saved",
  准备中: "tailoring",
  已投递: "applied",
  面试: "interview",
  Offer: "offer",
  未通过: "rejected",
  审核中: "in-review",
  定制中: "tailoring",
  草稿: "draft",
  待处理: "queued",
  可填表: "ready",
  已归档: "archived",
};

export function normalizeApplicationStatus(status) {
  return ({
    审核中: "准备中",
    定制中: "准备中",
    草稿: "收藏",
    待处理: "收藏",
    可填表: "准备中",
  })[status] ?? status;
}

export function isTrackedApplication(job) {
  if (!job || job.stage === "已归档") return false;
  return job.userTracked === true;
}

export function inferLegacyTracking(job) {
  if (!job) return false;
  if (typeof job.userTracked === "boolean") return job.userTracked;
  const status = normalizeApplicationStatus(job.status);
  return trackedStatuses.has(status) && !["收藏", "准备中"].includes(status);
}

export function isSpecificApplicationUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (/^(?:www\.)?(?:google|bing|baidu)\./i.test(url.hostname)) return false;
    if (url.searchParams.get("error") === "true") return false;
    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    const genericPaths = new Set(["/", "/jobs", "/careers", "/career", "/join-us", "/search"]);
    if (genericPaths.has(normalizedPath.toLowerCase()) && url.search.length < 4) return false;
    return normalizedPath.length > 4 || url.search.length >= 4;
  } catch {
    return false;
  }
}

export function hashText(value) {
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function summarizeJobDescription(jdText, maxLength = 420) {
  const normalized = String(jdText ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, maxLength);
  const sentenceEnd = Math.max(candidate.lastIndexOf("。"), candidate.lastIndexOf("."), candidate.lastIndexOf(";"));
  return `${candidate.slice(0, sentenceEnd > maxLength * 0.55 ? sentenceEnd + 1 : maxLength).trim()}…`;
}

export function buildImportedJob({
  jdText,
  company,
  role,
  applicationUrl,
  market,
  employmentType,
  track,
  score = null,
  matchSignals = [],
  scoreBreakdown = null,
  matchConfidence = "needs-review",
  matchLabel = "待评估",
  missingSignals = [],
  now = Date.now(),
}) {
  const normalizedJd = String(jdText ?? "").trim();
  const normalizedUrl = String(applicationUrl ?? "").trim();
  const id = `imported-${hashText(`${company}|${role}|${normalizedJd}|${now}`)}`;
  return {
    id,
    company: String(company ?? "").trim() || "待补充公司",
    role: String(role ?? "").trim() || "待补充岗位",
    status: "收藏",
    statusKey: "saved",
    stage: "进行中",
    updated: "刚刚导入",
    score,
    scoreBreakdown,
    matchConfidence,
    matchLabel,
    matchSignals,
    missingSignals,
    accent: "ink",
    location: "待确认",
    type: employmentType,
    posted: normalizedUrl ? "链接待重新核验" : "用户粘贴",
    source: "手动 JD",
    market,
    employmentType,
    track,
    userTracked: true,
    url: normalizedUrl,
    applyUrl: normalizedUrl,
    verificationStatus: normalizedUrl ? "needs-review" : "manual",
    verifiedAt: "",
    jdText: normalizedJd,
    jdHash: hashText(normalizedJd),
    jdSource: "user-pasted",
    jdComplete: true,
    summary: summarizeJobDescription(normalizedJd),
    evidence: [],
    gaps: missingSignals.length
      ? missingSignals.map((signal) => `Master Resume 中尚未确认：${signal}`)
      : ["需要逐条核对 JD 要求与 Master Resume 事实", "地点、授权和截止时间仍需本人确认"],
  };
}
