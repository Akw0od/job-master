const jobKeywordProfiles = {
  ai_agent_engineer: ["ai", "agent", "llm", "rag", "evaluation", "python", "typescript", "tool use", "智能体", "评测", "模型"],
  sde: ["software", "engineer", "python", "typescript", "java", "c++", "api", "backend", "frontend", "full-stack", "软件", "工程", "全栈"],
  risk_engineer: ["risk", "fraud", "metrics", "monitoring", "analysis", "python", "sql", "quantitative", "风险", "风控", "指标", "量化"],
  fde: ["customer", "deployment", "api", "integration", "prototype", "python", "full-stack", "交付", "部署", "客户", "集成"],
  product_engineer: ["product", "frontend", "backend", "full-stack", "typescript", "react", "api", "ai", "产品", "全栈", "用户"],
  data_platform: ["data", "pipeline", "sql", "python", "platform", "distributed", "reliability", "数据", "管道", "平台"],
};

const targetRoleTracks = {
  "AI Agent Engineer": ["ai_agent_engineer", "product_engineer", "sde"],
  "SDE / Product Engineer": ["sde", "product_engineer", "data_platform"],
  "Data / Algorithm Engineer": ["data_platform", "risk_engineer", "ai_agent_engineer"],
  "Risk Engineer": ["risk_engineer", "data_platform", "sde"],
  "产品 / 全栈工程师": ["product_engineer", "fde", "sde"],
};

const accentOptions = ["ink", "blue", "violet", "slate", "mono"];
const terminalDiscoveryStatuses = new Set(["已投递", "面试", "Offer", "未通过"]);

export function getDiscoveryKey(market, employmentType) {
  return `${market}:${employmentType}`;
}

export function getJobDiscoveryBatch(jobPoolsByMarket, market, employmentType, cycle, batchSize = 6, seenIds = []) {
  const marketPool = jobPoolsByMarket[market] ?? Object.values(jobPoolsByMarket)[0] ?? [];
  const pool = marketPool.filter((job) => job.stage === "进行中" && (job.employmentType ?? "全职") === employmentType);
  if (pool.length <= batchSize) return pool;

  const seen = new Set(seenIds);
  const unseenJobs = pool.filter((job) => !seen.has(job.id));
  const seenJobs = pool.filter((job) => seen.has(job.id));
  const step = Math.max(2, Math.floor(batchSize / 2));
  const start = seenJobs.length ? (cycle * step) % seenJobs.length : 0;
  const rotatedSeen = seenJobs.length
    ? Array.from({ length: seenJobs.length }, (_, index) => seenJobs[(start + index) % seenJobs.length])
    : [];

  return [...unseenJobs, ...rotatedSeen].slice(0, batchSize);
}

function normalizeKeyword(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getPreferredTracks(targetRole, customDirections) {
  const customDirection = customDirections.find((direction) => direction.name === targetRole);
  const customKeywords = customDirection?.keywords?.map(normalizeKeyword).filter(Boolean) ?? [];
  const inferredTracks = Object.entries(jobKeywordProfiles)
    .map(([track, keywords]) => ({
      track,
      hits: customKeywords.filter((keyword) => keywords.some((profileKeyword) => (
        normalizeKeyword(profileKeyword).includes(keyword)
        || keyword.includes(normalizeKeyword(profileKeyword))
      ))).length,
    }))
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((item) => item.track);
  return {
    customKeywords,
    preferredTracks: targetRoleTracks[targetRole] ?? inferredTracks,
  };
}

export function inferJobTrack(jobText) {
  const normalized = normalizeKeyword(jobText);
  return Object.entries(jobKeywordProfiles)
    .map(([track, keywords]) => ({
      track,
      hits: keywords.filter((keyword) => normalized.includes(normalizeKeyword(keyword))).length,
    }))
    .sort((a, b) => b.hits - a.hits)[0]?.track ?? "sde";
}

export function analyzeJobForResume(job, resumeText, targetRole, customDirections = []) {
  const normalizedResume = String(resumeText ?? "").toLowerCase();
  const { customKeywords, preferredTracks } = getPreferredTracks(targetRole, customDirections);
  const track = job.track || inferJobTrack(`${job.role} ${job.summary} ${job.jdText}`);
  const keywords = jobKeywordProfiles[track] ?? [];
  const matchedKeywords = keywords.filter((keyword) => normalizedResume.includes(normalizeKeyword(keyword)));
  const missingKeywords = keywords.filter((keyword) => !normalizedResume.includes(normalizeKeyword(keyword)));
  const normalizedJob = `${job.role ?? ""} ${job.summary ?? ""} ${job.jdText ?? ""} ${track}`.toLowerCase();
  const customMatches = customKeywords.filter((keyword) => normalizedJob.includes(keyword));
  const matchedEvidence = (job.evidence ?? []).filter((evidence) => normalizedResume.includes(normalizeKeyword(evidence)));
  const trackIndex = preferredTracks.indexOf(track);
  const trackPoints = trackIndex === 0 ? 18 : trackIndex === 1 ? 12 : trackIndex === 2 ? 6 : 0;
  const keywordPoints = Math.min(40, matchedKeywords.length * 7);
  const evidencePoints = Math.min(30, matchedEvidence.length * 10);
  const customPoints = Math.min(20, customMatches.length * 7);
  const score = Math.min(95, trackPoints + keywordPoints + evidencePoints + customPoints);
  const matchConfidence = matchedEvidence.length >= 2
    ? "evidence-backed"
    : matchedEvidence.length === 1 || matchedKeywords.length >= 4
      ? "keyword-supported"
      : matchedKeywords.length >= 2
        ? "limited"
        : "needs-review";
  const matchLabel = ({
    "evidence-backed": score >= 75 ? "证据充分" : "关键词匹配",
    "keyword-supported": "关键词匹配",
    limited: "有限匹配",
    "needs-review": "待评估",
  })[matchConfidence];

  return {
    ...job,
    track,
    score,
    matchConfidence,
    matchLabel,
    matchedEvidence,
    matchSignals: [...new Set([...customMatches, ...matchedKeywords])].slice(0, 6),
    missingSignals: missingKeywords.slice(0, 5),
    scoreBreakdown: {
      direction: trackPoints,
      resumeKeywords: keywordPoints,
      confirmedEvidence: evidencePoints,
      customDirection: customPoints,
    },
    updated: "刚刚根据主简历重新匹配",
  };
}

export function rankJobsForResume(jobs, resumeText, targetRole, customDirections = []) {
  return jobs
    .map((job) => analyzeJobForResume(job, resumeText, targetRole, customDirections))
    .sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));
}

export function normalizeSearchedJobs(searchResult, market, employmentType) {
  const jobs = Array.isArray(searchResult?.jobs) ? searchResult.jobs : [];
  return jobs.map((job, index) => ({
    ...job,
    id: job.id || `live-${market}-${employmentType}-${index}-${String(job.company).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "本轮实时发现",
    score: null,
    accent: accentOptions[index % accentOptions.length],
    type: employmentType,
    employmentType,
    market,
    posted: job.posted || "链接已核验",
    source: job.source || "官网职位页",
    url: job.applyUrl,
    applyUrl: job.applyUrl,
    track: job.track || inferJobTrack(`${job.role} ${job.summary} ${job.jdText}`),
    evidence: [],
    gaps: Array.isArray(job.requirements) && job.requirements.length
      ? job.requirements.slice(0, 4).map((requirement) => `需要从 Master Resume 核对：${requirement}`)
      : ["需要逐条核对官网岗位要求"],
    verificationStatus: "verified",
    verifiedAt: job.verifiedAt || searchResult.searchedAt || "",
    jdSource: "official-summary",
    jdComplete: Boolean(job.jdText && job.jdText.length >= 120),
  }));
}

function normalizedJobUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isLiveOfficialJob(job) {
  return String(job?.id ?? "").startsWith("live-") && job?.jdSource === "official-summary";
}

export function markRejectedLiveJobs(jobs, rejectedApplyUrls) {
  const rejectedUrls = new Set((Array.isArray(rejectedApplyUrls) ? rejectedApplyUrls : [])
    .map(normalizedJobUrl)
    .filter(Boolean));
  if (!rejectedUrls.size) return jobs;

  return jobs.map((job) => {
    if (!isLiveOfficialJob(job)) return job;
    const jobUrls = [job.applyUrl, job.url].map(normalizedJobUrl);
    if (!jobUrls.some((url) => rejectedUrls.has(url))) return job;
    return {
      ...job,
      verificationStatus: "unavailable",
      isNew: false,
      updated: "官网确认岗位已失效",
    };
  });
}

export function getLiveOfficialApplyUrls(jobs, market, employmentType, limit = 80) {
  const uniqueUrls = new Map();
  jobs.forEach((job) => {
    if (
      !isLiveOfficialJob(job)
      || job.stage === "已归档"
      || job.market !== market
      || (job.employmentType ?? "全职") !== employmentType
      || job.verificationStatus === "unavailable"
    ) return;
    const url = String(job.applyUrl || job.url || "").trim();
    const key = normalizedJobUrl(url);
    if (key && !uniqueUrls.has(key)) uniqueUrls.set(key, url);
  });
  return [...uniqueUrls.values()].slice(0, limit);
}

export function filterDiscoverableJobs(jobs, market, employmentType) {
  return jobs.filter((job) => (
    job.stage !== "已归档"
    && job.market === market
    && (job.employmentType ?? "全职") === employmentType
    && job.verificationStatus !== "unavailable"
    && !terminalDiscoveryStatuses.has(job.status)
  ));
}

export function mergeJobPools(staticPools, liveJobsByDiscoveryKey = {}) {
  const merged = {};
  for (const market of new Set([...Object.keys(staticPools), "美国", "中国"])) {
    const liveJobs = Object.entries(liveJobsByDiscoveryKey)
      .filter(([key]) => key.startsWith(`${market}:`))
      .flatMap(([, jobs]) => Array.isArray(jobs) ? jobs : []);
    const deduped = new Map();
    [...liveJobs, ...(staticPools[market] ?? [])].forEach((job) => {
      const key = job.applyUrl || job.url || `${job.company}|${job.role}|${job.location}`;
      if (!deduped.has(key)) deduped.set(key, job);
    });
    merged[market] = [...deduped.values()];
  }
  return merged;
}
