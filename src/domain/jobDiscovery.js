import { updateSourceReceiptVerification, withNormalizedSourceReceipt } from "./sourceReceipt.js";

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
const liveVerificationMaxAgeMs = 24 * 60 * 60 * 1000;
export const jobScoreAlgorithmVersion = 2;
export const recommendationFunnelAlgorithmVersion = 1;
const funnelCountKeys = ["input", "market", "employmentType", "active", "available", "scored", "relevant", "returned"];
const funnelExclusionKeys = ["market", "employmentType", "archived", "unavailable", "terminal", "zeroScore", "cap"];
const scoreBreakdownKeys = ["targetDirection", "resumeKeywords", "confirmedEvidence", "customDirection"];
const trackTieBreakOrder = ["sde", "product_engineer", "data_platform", "risk_engineer", "fde", "ai_agent_engineer"];

export function hasCurrentJobScore(job) {
  if (job?.jobScoreAlgorithmVersion !== jobScoreAlgorithmVersion) return false;
  if (!Number.isFinite(job.score) || job.score < 0 || job.score > 100) return false;
  return scoreBreakdownKeys.every((key) => (
    Number.isFinite(job.scoreBreakdown?.[key]) && job.scoreBreakdown[key] >= 0
  ));
}

export function getDiscoveryKey(market, employmentType) {
  return `${market}:${employmentType}`;
}

export function getJobDiscoveryBatch(jobPoolsByMarket, market, employmentType, cycle, batchSize = 6, seenIds = []) {
  const marketPool = jobPoolsByMarket[market] ?? Object.values(jobPoolsByMarket)[0] ?? [];
  const pool = marketPool.filter((job) => (
    job.stage === "进行中"
    && (job.employmentType ?? "全职") === employmentType
    && job.verificationStatus !== "unavailable"
  ));
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
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

function escapeSignalPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesJobSignal(text, keyword) {
  const normalizedText = normalizeKeyword(text);
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedText || !normalizedKeyword) return false;
  if (!/^[\x00-\x7f]+$/u.test(normalizedKeyword)) return normalizedText.includes(normalizedKeyword);

  const phrasePattern = escapeSignalPattern(normalizedKeyword)
    .replace(/[\s-]+/g, "[-\\s]+");
  // Keep Unicode word boundaries for Latin-script false-positive protection,
  // while allowing standard technical terms beside Han text (for example AI评测).
  return new RegExp(`(?:(?<![\\p{L}\\p{N}])|(?<=[\\p{Script=Han}]))${phrasePattern}(?:(?![\\p{L}\\p{N}])|(?=[\\p{Script=Han}]))`, "u").test(normalizedText);
}

export function formatSignalScore(score, language = "zh") {
  if (!Number.isFinite(score)) return language === "en" ? "Needs refresh" : "待刷新";
  return language === "en" ? `Signal score ${score}` : `信号分 ${score}`;
}

function getPreferredTracks(targetRole, customDirections) {
  const customDirection = customDirections.find((direction) => direction.name === targetRole);
  const customKeywords = customDirection?.keywords?.map(normalizeKeyword).filter(Boolean) ?? [];
  const inferredTracks = Object.entries(jobKeywordProfiles)
    .map(([track, keywords]) => ({
      track,
      hits: customKeywords.filter((keyword) => keywords.some((profileKeyword) => (
        matchesJobSignal(profileKeyword, keyword)
        || matchesJobSignal(keyword, profileKeyword)
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
  const rankedTracks = Object.entries(jobKeywordProfiles)
    .map(([track, keywords]) => ({
      track,
      hits: keywords.filter((keyword) => matchesJobSignal(jobText, keyword)).length,
    }))
    .sort((a, b) => b.hits - a.hits || trackTieBreakOrder.indexOf(a.track) - trackTieBreakOrder.indexOf(b.track));
  return rankedTracks[0]?.hits > 0 ? rankedTracks[0].track : "sde";
}

export function analyzeJobForResume(job, resumeText, targetRole, customDirections = []) {
  const { customKeywords, preferredTracks } = getPreferredTracks(targetRole, customDirections);
  const track = job.track || inferJobTrack(`${job.role} ${job.summary} ${job.jdText}`);
  const keywords = jobKeywordProfiles[track] ?? [];
  const matchedKeywords = keywords.filter((keyword) => matchesJobSignal(resumeText, keyword));
  const missingKeywords = keywords.filter((keyword) => !matchesJobSignal(resumeText, keyword));
  const jobText = `${job.role ?? ""} ${job.summary ?? ""} ${job.jdText ?? ""} ${track}`;
  const customMatches = customKeywords.filter((keyword) => matchesJobSignal(jobText, keyword));
  const matchedEvidence = (job.evidence ?? []).filter((evidence) => matchesJobSignal(resumeText, evidence));
  const trackIndex = preferredTracks.indexOf(track);
  const trackPoints = trackIndex === 0 ? 18 : trackIndex === 1 ? 12 : trackIndex === 2 ? 6 : 0;
  const keywordPoints = Math.min(40, matchedKeywords.length * 7);
  const evidencePoints = Math.min(30, matchedEvidence.length * 10);
  const customPoints = Math.min(20, customMatches.length * 7);
  const score = Math.min(100, trackPoints + keywordPoints + evidencePoints + customPoints);
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
    jobScoreAlgorithmVersion,
    matchConfidence,
    matchLabel,
    matchedEvidence,
    matchSignals: [...new Set([...customMatches, ...matchedKeywords])].slice(0, 6),
    missingSignals: missingKeywords.slice(0, 5),
    scoreBreakdown: {
      targetDirection: trackPoints,
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

export function buildRecommendationFunnel(jobs, {
  market,
  employmentType,
  resumeText,
  targetRole,
  customDirections = [],
  cap = 6,
  seenIds = [],
  cycle = 0,
} = {}) {
  const input = Array.isArray(jobs) ? jobs : [];
  const exclusions = { market: 0, employmentType: 0, archived: 0, unavailable: 0, terminal: 0, zeroScore: 0, cap: 0 };
  const marketMatches = input.filter((job) => {
    const keep = job?.market === market;
    if (!keep) exclusions.market += 1;
    return keep;
  });
  const typeMatches = marketMatches.filter((job) => {
    const keep = (job?.employmentType ?? "全职") === employmentType;
    if (!keep) exclusions.employmentType += 1;
    return keep;
  });
  const active = typeMatches.filter((job) => {
    const keep = job?.stage !== "已归档";
    if (!keep) exclusions.archived += 1;
    return keep;
  });
  const available = active.filter((job) => {
    const keep = job?.verificationStatus !== "unavailable";
    if (!keep) exclusions.unavailable += 1;
    return keep;
  });
  const discoverable = available.filter((job) => {
    const keep = !terminalDiscoveryStatuses.has(job?.status);
    if (!keep) exclusions.terminal += 1;
    return keep;
  });
  const scored = discoverable
    .map((job, index) => ({ job: analyzeJobForResume(job, resumeText, targetRole, customDirections), index }))
    .sort((left, right) => right.job.score - left.job.score
      || String(left.job.company ?? "").localeCompare(String(right.job.company ?? ""))
      || left.index - right.index);
  const relevant = scored.filter(({ job }) => {
    const keep = job.score > 0;
    if (!keep) exclusions.zeroScore += 1;
    return keep;
  }).map(({ job }) => job);
  const seen = new Set(Array.isArray(seenIds) ? seenIds : []);
  const unseen = relevant.filter((job) => !seen.has(job.id));
  const alreadySeen = relevant.filter((job) => seen.has(job.id));
  const limit = Math.max(0, Number.isFinite(cap) ? Math.floor(cap) : 6);
  const normalizedCycle = Number.isSafeInteger(cycle) && cycle >= 0 ? cycle : 0;
  const step = Math.max(2, Math.floor(Math.max(1, limit) / 2));
  const start = alreadySeen.length ? (normalizedCycle * step) % alreadySeen.length : 0;
  const rotatedSeen = alreadySeen.length
    ? Array.from({ length: alreadySeen.length }, (_, index) => alreadySeen[(start + index) % alreadySeen.length])
    : [];
  const ordered = [...unseen, ...rotatedSeen];
  const rankedJobs = ordered.slice(0, limit);
  exclusions.cap = Math.max(0, ordered.length - rankedJobs.length);
  return {
    rankedJobs,
    relevantIds: relevant.map((job) => job.id).filter(Boolean),
    algorithmVersion: recommendationFunnelAlgorithmVersion,
    counts: {
      input: input.length,
      market: marketMatches.length,
      employmentType: typeMatches.length,
      active: active.length,
      available: available.length,
      scored: scored.length,
      relevant: relevant.length,
      returned: rankedJobs.length,
    },
    exclusions,
  };
}

export function normalizeRecommendationFunnelMeta(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.algorithmVersion !== recommendationFunnelAlgorithmVersion) return null;
  const normalizeMap = (source, keys) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const result = {};
    for (const key of keys) {
      const number = source[key];
      if (!Number.isSafeInteger(number) || number < 0 || number > 1_000_000) return null;
      result[key] = number;
    }
    return result;
  };
  const counts = normalizeMap(value.counts, funnelCountKeys);
  const exclusions = normalizeMap(value.exclusions, funnelExclusionKeys);
  if (!counts || !exclusions) return null;
  const monotonic = counts.input >= counts.market
    && counts.market >= counts.employmentType
    && counts.employmentType >= counts.active
    && counts.active >= counts.available
    && counts.available >= counts.scored
    && counts.scored >= counts.relevant
    && counts.relevant >= counts.returned;
  const reconciled = exclusions.market === counts.input - counts.market
    && exclusions.employmentType === counts.market - counts.employmentType
    && exclusions.archived === counts.employmentType - counts.active
    && exclusions.unavailable === counts.active - counts.available
    && exclusions.terminal === counts.available - counts.scored
    && exclusions.zeroScore === counts.scored - counts.relevant
    && exclusions.cap === counts.relevant - counts.returned;
  return monotonic && reconciled
    ? { algorithmVersion: recommendationFunnelAlgorithmVersion, counts, exclusions }
    : null;
}

export function normalizeSearchedJobs(searchResult, market, employmentType) {
  const jobs = Array.isArray(searchResult?.jobs) ? searchResult.jobs : [];
  return jobs.map((job, index) => withNormalizedSourceReceipt({
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

export function isLiveOfficialVerificationStale(job, now = Date.now()) {
  if (!isLiveOfficialJob(job) || job.verificationStatus === "unavailable") return false;
  if (job.verificationStatus !== "verified") return true;
  const verifiedAt = Date.parse(job.verifiedAt ?? "");
  return !Number.isFinite(verifiedAt) || now - verifiedAt >= liveVerificationMaxAgeMs;
}

export function applyLiveUrlVerificationResults(jobs, checks) {
  const checkByUrl = new Map();
  (Array.isArray(checks) ? checks : []).forEach((check) => {
    const key = normalizedJobUrl(check?.url);
    if (!key || !["open", "closed", "unknown"].includes(check?.state)) return;
    checkByUrl.set(key, check);
  });
  if (!checkByUrl.size) return jobs;

  return jobs.map((job) => {
    if (!isLiveOfficialJob(job)) return job;
    const check = [job.applyUrl, job.url]
      .map(normalizedJobUrl)
      .map((url) => checkByUrl.get(url))
      .find(Boolean);
    if (!check) return job;
    if (check.state === "closed") {
      return {
        ...job,
        sourceReceipt: updateSourceReceiptVerification(job, check),
        verificationStatus: "unavailable",
        isNew: false,
        updated: "官网确认岗位已失效",
      };
    }
    if (check.state === "open") {
      return {
        ...job,
        sourceReceipt: updateSourceReceiptVerification(job, check),
        verificationStatus: "verified",
        verifiedAt: check.checkedAt || job.verifiedAt,
        updated: "链接已重新核验",
      };
    }
    return {
      ...job,
      sourceReceipt: updateSourceReceiptVerification(job, check),
      verificationStatus: "unknown",
      updated: "官网链接暂时无法确认",
    };
  });
}

export function markRejectedLiveJobs(jobs, rejectedApplyUrls) {
  return applyLiveUrlVerificationResults(
    jobs,
    (Array.isArray(rejectedApplyUrls) ? rejectedApplyUrls : []).map((url) => ({ url, state: "closed" })),
  );
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
    [...liveJobs, ...(staticPools[market] ?? [])].map(withNormalizedSourceReceipt).forEach((job) => {
      const key = job.applyUrl || job.url || `${job.company}|${job.role}|${job.location}`;
      if (!deduped.has(key)) deduped.set(key, job);
    });
    merged[market] = [...deduped.values()];
  }
  return merged;
}
