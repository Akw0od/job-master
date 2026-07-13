import { useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ArrowSquareOut,
  Briefcase,
  Buildings,
  CalendarBlank,
  Check,
  CaretDown,
  CaretLeft,
  CaretRight,
  CheckCircle,
  CircleNotch,
  FileArrowUp,
  FileText,
  FolderOpen,
  FunnelSimple,
  MagnifyingGlass,
  NotePencil,
  PaperPlaneTilt,
  Plus,
  ShieldCheck,
  Sparkle,
  StopCircle,
  Tray,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import "./styles.css";

const sampleJobs = [
  {
    id: "anthropic",
    company: "Anthropic",
    role: "Product Engineer, Computer Use",
    status: "审核中",
    statusKey: "in-review",
    stage: "进行中",
    updated: "2 小时前更新",
    score: 92,
    accent: "ink",
    location: "San Francisco, CA",
    type: "全职",
    posted: "当前开放",
    source: "Greenhouse",
    url: "https://job-boards.greenhouse.io/anthropic/jobs/5238637008",
    applyUrl: "https://job-boards.greenhouse.io/anthropic/jobs/5238637008",
    track: "ai_agent_engineer",
    summary:
      "岗位重点是构建可靠的智能体工作流，覆盖模型评测、工具调用、人工审核和生产部署。",
    evidence: [
      "VetCite-Bench",
      "Multi-Agent Outbound Pipeline",
      "Voyage AI / Voyage for Vets",
    ],
    gaps: ["大规模智能体可观测性经验不足", "正式安全评测 owner 经历需要补证据"],
  },
  {
    id: "apple",
    company: "Apple",
    role: "Software Engineer - Agentic OS Experiences",
    status: "定制中",
    statusKey: "tailoring",
    stage: "进行中",
    updated: "1 天前更新",
    score: 86,
    accent: "blue",
    location: "Cupertino, CA",
    type: "全职",
    posted: "当前开放",
    source: "Apple Jobs",
    url: "https://jobs.apple.com/en-us/details/200643348-0836/swift-software-engineer-agentic-os-experiences",
    applyUrl: "https://jobs.apple.com/en-us/details/200643348-0836/swift-software-engineer-agentic-os-experiences",
    track: "sde",
    summary:
      "岗位强调生产级软件开发、清晰 owner 意识、调试能力，以及面向用户体验的工程判断。",
    evidence: ["FitScan", "Husky Paths", "VetCite-Bench"],
    gaps: ["Apple 规模分布式系统经验需要弱化表达", "C++ 生产经验暂未确认"],
  },
  {
    id: "stripe",
    company: "Stripe",
    role: "Backend Engineer, Payments and Risk",
    status: "草稿",
    statusKey: "draft",
    stage: "进行中",
    updated: "1 天前更新",
    score: 81,
    accent: "violet",
    location: "Seattle, WA",
    type: "混合办公",
    posted: "当前开放",
    source: "Stripe Jobs",
    url: "https://stripe.com/jobs/listing/backend-engineer-payments-and-risk/7232592",
    applyUrl: "https://stripe.com/jobs/listing/backend-engineer-payments-and-risk/7232592",
    track: "risk_engineer",
    summary:
      "岗位需要把产品和运营数据转化为风险指标、监控流程和可执行的决策支持。",
    evidence: ["Quantitative Research Internship", "VetCite-Bench", "Voyage AI / Voyage for Vets"],
    gaps: ["支付行业背景较弱", "欺诈模型直接 owner 经历不足"],
  },
  {
    id: "palantir",
    company: "Palantir",
    role: "Forward Deployed AI Engineer",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "3 天前更新",
    score: 88,
    accent: "slate",
    location: "New York, NY",
    type: "全职",
    posted: "当前开放",
    source: "Lever",
    url: "https://jobs.lever.co/palantir/636fc05c-d348-4a06-be51-597cb9e07488",
    applyUrl: "https://jobs.lever.co/palantir/636fc05c-d348-4a06-be51-597cb9e07488/apply",
    track: "fde",
    summary:
      "岗位要求直接面对客户、快速原型、集成 API，并把复杂工作流落成可用系统。",
    evidence: ["Husky Paths", "AI Travel Planner", "Multi-Agent Outbound Pipeline"],
    gaps: ["企业现场交付经验需要补充上下文", "安全审查/身份要求需本人确认"],
  },
  {
    id: "openai-apps",
    company: "OpenAI",
    role: "Product Engineer, GTM Growth Engineering",
    status: "审核中",
    statusKey: "in-review",
    stage: "进行中",
    updated: "4 天前更新",
    score: 90,
    accent: "ink",
    location: "San Francisco, CA",
    type: "全职",
    posted: "当前开放",
    source: "Ashby",
    url: "https://openai.com/careers/product-engineer-gtm-growth-engineering-san-francisco/",
    applyUrl: "https://jobs.ashbyhq.com/openai/eaf9207e-84c9-4fa2-bd57-6877b7eb7f79/application",
    track: "product_engineer",
    summary:
      "岗位偏向把 AI 能力落成可用产品，要求产品判断、前后端实现和模型体验调优。",
    evidence: ["FitScan", "AI Travel Planner", "Multi-Agent Outbound Pipeline"],
    gaps: ["大规模消费级产品 owner 经历需要补强", "上线指标需要进一步量化"],
  },
  {
    id: "databricks-platform",
    company: "Databricks",
    role: "Senior Software Engineer - AI Platform",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "4 天前更新",
    score: 83,
    accent: "blue",
    location: "New York, NY",
    type: "全职",
    posted: "当前开放",
    source: "Greenhouse",
    url: "https://www.databricks.com/company/careers/engineering/senior-software-engineer---ai-platform-nyc-8509230002?gh_jid=8509230002",
    applyUrl: "https://www.databricks.com/company/careers/engineering/senior-software-engineer---ai-platform-nyc-8509230002?gh_jid=8509230002",
    track: "data_platform",
    summary:
      "岗位强调数据系统、可靠性、性能优化和跨团队平台能力。",
    evidence: ["Quantitative Research Internship", "Husky Paths", "VetCite-Bench"],
    gaps: ["底层存储/查询引擎经验需要谨慎表达", "平台性能指标需要补数值"],
  },
  {
    id: "microsoft-ai-platform",
    company: "Notion",
    role: "Software Engineer, New Grad (AI)",
    status: "定制中",
    statusKey: "tailoring",
    stage: "进行中",
    updated: "5 天前更新",
    score: 84,
    accent: "slate",
    location: "San Francisco, CA",
    type: "全职",
    posted: "当前开放",
    source: "Ashby",
    url: "https://jobs.ashbyhq.com/notion/7e6dc7fe-7ddd-42c1-8928-13f7bddb9ec9",
    applyUrl: "https://jobs.ashbyhq.com/notion/7e6dc7fe-7ddd-42c1-8928-13f7bddb9ec9/application",
    track: "sde",
    summary:
      "岗位面向早期职业软件工程师，强调产品工程基础、AI 工作流理解和高质量协作能力。",
    evidence: ["FitScan", "VetCite-Bench", "Husky Paths"],
    gaps: ["AI 产品上线经验需要补充上下文", "团队协作规模需要本人确认"],
  },
  {
    id: "ramp-risk",
    company: "Ramp",
    role: "Software Engineer, Fraud & Identity",
    status: "草稿",
    statusKey: "draft",
    stage: "进行中",
    updated: "6 天前更新",
    score: 79,
    accent: "violet",
    location: "New York, NY",
    type: "全职",
    posted: "当前开放",
    source: "Ashby",
    url: "https://jobs.ashbyhq.com/ramp/8fa367de-71ba-409e-befd-175a163acb1b",
    applyUrl: "https://jobs.ashbyhq.com/ramp/8fa367de-71ba-409e-befd-175a163acb1b/application",
    track: "risk_engineer",
    summary:
      "岗位覆盖风控数据、交易异常、内部工具和高质量分析交付。",
    evidence: ["Quantitative Research Internship", "Voyage AI / Voyage for Vets", "VetCite-Bench"],
    gaps: ["金融欺诈场景经验需要聚焦", "生产系统 owner 范围需要本人确认"],
  },
  {
    id: "snowflake-fde",
    company: "Snowflake",
    role: "Staff Software Engineer - AI Developer Tooling",
    status: "可填表",
    statusKey: "ready",
    stage: "进行中",
    updated: "1 周前更新",
    score: 82,
    accent: "mono",
    location: "Bellevue, WA",
    type: "全职",
    posted: "当前开放",
    source: "Snowflake Careers",
    url: "https://careers.snowflake.com/us/en/job/SNCOUSBD5D83403B1943DD927053F899DC56A3EXTERNALENUSA6292A817CF74E29BB77F7D0935E7BDB/Staff-Software-Engineer-Forge",
    applyUrl: "https://careers.snowflake.com/us/en/job/SNCOUSBD5D83403B1943DD927053F899DC56A3EXTERNALENUSA6292A817CF74E29BB77F7D0935E7BDB/Staff-Software-Engineer-Forge",
    track: "sde",
    summary:
      "岗位聚焦 AI 开发者工具、工程效率平台、可观测性和大规模前端基础设施。",
    evidence: ["Husky Paths", "AI Travel Planner", "Quantitative Research Internship"],
    gaps: ["大型代码库工具链经验需要补充", "平台可靠性指标需要本人确认"],
  },
  {
    id: "notion",
    company: "Notion",
    role: "Software Engineer, Product Infrastructure",
    status: "已归档",
    statusKey: "archived",
    stage: "已归档",
    updated: "5 天前更新",
    score: 78,
    accent: "mono",
    location: "远程",
    type: "全职",
    posted: "2026 年 5 月 3 日",
    source: "Ashby",
    url: "https://jobs.ashbyhq.com/notion/d41b635b-c17b-4efd-89fd-fdb2ddb62e9a",
    applyUrl: "https://jobs.ashbyhq.com/notion/d41b635b-c17b-4efd-89fd-fdb2ddb62e9a/application",
    track: "product_engineer",
    summary:
      "岗位结合产品品味和全栈实现，聚焦协作工作流和 AI 辅助创作体验。",
    evidence: ["Husky Paths", "AI Travel Planner", "Voyage AI / Voyage for Vets"],
    gaps: ["实时协作深度不足", "设计系统 owner 经历需要谨慎表述"],
  },
];

const usJobPool = sampleJobs.map((job) => ({
  ...job,
  market: "美国",
  employmentType: job.employmentType ?? "全职",
}));

const chinaJobPool = [
  {
    id: "cn-huawei-ai-runtime-32189",
    company: "华为",
    role: "AI 底层软件栈架构专家",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "本轮发现",
    score: 86,
    accent: "blue",
    location: "上海",
    type: "社会招聘",
    posted: "官网当前可见",
    source: "华为招聘",
    url: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=32189",
    applyUrl: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=32189",
    market: "中国",
    track: "data_platform",
    summary: "负责 AI 编译器、训练与推理 Runtime、算子库和异构芯片适配，强调系统性能分析与工程落地。",
    evidence: ["Quantitative Research Internship", "VetCite-Bench", "Husky Paths"],
    gaps: ["底层编译和算子优化深度需要核对", "岗位对系统性能经验要求较高"],
  },
  {
    id: "cn-huawei-ai-solution-29721",
    company: "华为",
    role: "AI 解决方案架构师",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "本轮发现",
    score: 84,
    accent: "blue",
    location: "上海",
    type: "社会招聘",
    posted: "官网当前可见",
    source: "华为招聘",
    url: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=29721",
    applyUrl: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=29721",
    market: "中国",
    track: "fde",
    summary: "面向大模型和推荐业务设计 AI 系统架构，负责方案交流、技术难题推进和场景化交付。",
    evidence: ["Husky Paths", "VetCite-Bench", "AI Travel Planner"],
    gaps: ["客户方案 owner 经历需要补证据", "岗位偏资深解决方案方向"],
  },
  {
    id: "cn-huawei-llm-infra-28183",
    company: "华为",
    role: "大模型训练 / 推理优化专家",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "本轮发现",
    score: 88,
    accent: "ink",
    location: "北京",
    type: "社会招聘",
    posted: "官网当前可见",
    source: "华为招聘",
    url: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=28183",
    applyUrl: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=28183",
    market: "中国",
    track: "ai_agent_engineer",
    summary: "覆盖大模型训练可靠性、推理框架、性能瓶颈定位，以及 Agent、RAG 和强化学习负载优化。",
    evidence: ["VetCite-Bench", "Quantitative Research Internship", "Multi-Agent Outbound Pipeline"],
    gaps: ["大规模训练集群经验需要确认", "岗位要求较强的系统与模型协同能力"],
  },
  {
    id: "cn-huawei-multimodal-28191",
    company: "华为",
    role: "多模态 / 大模型算法专家",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "本轮发现",
    score: 85,
    accent: "violet",
    location: "北京",
    type: "社会招聘",
    posted: "官网当前可见",
    source: "华为招聘",
    url: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=28191",
    applyUrl: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=28191",
    market: "中国",
    track: "ai_agent_engineer",
    summary: "负责多模态模型训练、推理协同优化和推荐系统能力规划，强调 Python、C++ 与分布式机器学习。",
    evidence: ["VetCite-Bench", "Quantitative Research Internship", "FitScan"],
    gaps: ["多模态训练证据需要核对", "推荐系统线上经验可能是硬缺口"],
  },
  {
    id: "cn-huawei-supply-ai-22643",
    company: "华为",
    role: "供应链 AIGC 架构师",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "本轮发现",
    score: 80,
    accent: "slate",
    location: "东莞",
    type: "社会招聘",
    posted: "官网当前可见",
    source: "华为招聘",
    url: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=22643",
    applyUrl: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=22643",
    market: "中国",
    track: "product_engineer",
    summary: "结合 RAG、Agent 和数据架构推动供应链 AI 应用落地，覆盖需求抽象、系统设计与场景规划。",
    evidence: ["Husky Paths", "VetCite-Bench", "Quantitative Research Internship"],
    gaps: ["供应链领域经验不足", "企业架构职责范围需要谨慎匹配"],
  },
  {
    id: "cn-huawei-gov-cloud-22623",
    company: "华为",
    role: "数字政府云平台解决方案专家",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "本轮发现",
    score: 76,
    accent: "slate",
    location: "北京",
    type: "社会招聘",
    posted: "官网当前可见",
    source: "华为招聘",
    url: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=22623",
    applyUrl: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=22623",
    market: "中国",
    track: "fde",
    summary: "负责云化、分布式系统和微服务方案设计，连接客户诉求、项目交付与平台持续运营。",
    evidence: ["Husky Paths", "AI Travel Planner", "Quantitative Research Internship"],
    gaps: ["政务云行业背景较弱", "岗位要求较丰富的项目管理经验"],
  },
  {
    id: "cn-huawei-ai-hardware-34093",
    company: "华为",
    role: "AI 集群硬件系统工程师",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "本轮发现",
    score: 72,
    accent: "mono",
    location: "杭州",
    type: "社会招聘",
    posted: "官网当前可见",
    source: "华为招聘",
    url: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=34093",
    applyUrl: "https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?dataSource=1&jobId=34093",
    market: "中国",
    track: "data_platform",
    summary: "面向 AI 集群和服务器开展系统需求分析、硬件架构设计、测试验证与产品交付。",
    evidence: ["Quantitative Research Internship", "Husky Paths", "FitScan"],
    gaps: ["硬件电路与 DFX 经验可能不匹配", "更适合作为跨方向探索岗位"],
  },
  {
    id: "cn-xiaomi-algorithm-640",
    company: "小米",
    role: "人工智能算法工程师",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "本轮发现",
    score: 83,
    accent: "blue",
    location: "北京",
    type: "社会招聘",
    posted: "官网当前可见",
    source: "小米招聘",
    url: "https://hr.xiaomi.com/job/view/640",
    applyUrl: "https://hr.xiaomi.com/job/view/640",
    market: "中国",
    track: "ai_agent_engineer",
    summary: "将人工智能算法用于真实产品场景，强调模型研发、工程实现和业务问题落地。",
    evidence: ["VetCite-Bench", "FitScan", "Quantitative Research Internship"],
    gaps: ["具体算法方向需进入职位页复核", "线上模型指标需要本人补证据"],
  },
  {
    id: "cn-xiaomi-vision-650",
    company: "小米",
    role: "机器视觉研究员",
    status: "待处理",
    statusKey: "queued",
    stage: "进行中",
    updated: "本轮发现",
    score: 78,
    accent: "violet",
    location: "北京",
    type: "社会招聘",
    posted: "官网当前可见",
    source: "小米招聘",
    url: "https://hr.xiaomi.com/job/view/650",
    applyUrl: "https://hr.xiaomi.com/job/view/650",
    market: "中国",
    track: "data_platform",
    summary: "研究目标检测、分类、分割和深度学习基础模型，并推动算法在产品场景中的实现。",
    evidence: ["Quantitative Research Internship", "VetCite-Bench", "FitScan"],
    gaps: ["视觉模型研究经历需要确认", "岗位可能要求更强的论文或算法背景"],
  },
].map((job) => ({ ...job, employmentType: job.employmentType ?? "全职" }));

const jobPoolsByMarket = {
  美国: usJobPool,
  中国: chinaJobPool,
};

const allJobPool = [...usJobPool, ...chinaJobPool];

function getDiscoveryKey(market, employmentType) {
  return `${market}:${employmentType}`;
}

function getJobDiscoveryBatch(market, employmentType, cycle, batchSize = 6, seenIds = []) {
  const pool = (jobPoolsByMarket[market] ?? usJobPool).filter((job) => (
    job.stage === "进行中" && job.employmentType === employmentType
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

function rankJobsForResume(jobs, resumeText, targetRole, customDirections = []) {
  const normalizedResume = String(resumeText ?? "").toLowerCase();
  const customDirection = customDirections.find((direction) => direction.name === targetRole);
  const customKeywords = customDirection?.keywords ?? [];
  const inferredTracks = Object.entries(jobKeywordProfiles)
    .map(([track, keywords]) => ({
      track,
      hits: customKeywords.filter((keyword) => keywords.some((profileKeyword) => (
        profileKeyword.toLowerCase().includes(keyword.toLowerCase())
        || keyword.toLowerCase().includes(profileKeyword.toLowerCase())
      ))).length,
    }))
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((item) => item.track);
  const preferredTracks = targetRoleTracks[targetRole] ?? inferredTracks;

  return jobs
    .map((job) => {
      const keywords = jobKeywordProfiles[job.track] ?? [];
      const matchedKeywords = keywords.filter((keyword) => normalizedResume.includes(keyword.toLowerCase()));
      const normalizedJob = `${job.role} ${job.summary} ${job.track}`.toLowerCase();
      const customMatches = customKeywords.filter((keyword) => normalizedJob.includes(keyword.toLowerCase()));
      const evidenceHits = job.evidence.filter((evidence) => normalizedResume.includes(evidence.toLowerCase())).length;
      const trackIndex = preferredTracks.indexOf(job.track);
      const trackBoost = trackIndex === 0 ? 18 : trackIndex === 1 ? 12 : trackIndex === 2 ? 7 : 0;
      const contentBoost = Math.min(18, matchedKeywords.length * 3);
      const evidenceBoost = Math.min(9, evidenceHits * 3);
      const customBoost = Math.min(18, customMatches.length * 5);
      const score = Math.max(58, Math.min(97, 58 + trackBoost + contentBoost + evidenceBoost + customBoost));

      return {
        ...job,
        score,
        matchSignals: [...new Set([...customMatches, ...matchedKeywords])].slice(0, 4),
        updated: "刚刚根据主简历重新匹配",
      };
    })
    .sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));
}

const tabs = ["岗位匹配", "定制简历", "追踪"];
const statusOptions = ["收藏", "准备中", "已投递", "面试", "Offer", "未通过", "已归档"];
const statusKeyByLabel = {
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

function normalizeApplicationStatus(status) {
  return ({
    审核中: "准备中",
    定制中: "准备中",
    草稿: "收藏",
    待处理: "收藏",
    可填表: "准备中",
  })[status] ?? status;
}

const defaultResumeBullets = [
  "构建 source-backed 工作流，把岗位要求、证据选择和人工审核节点连接起来。",
  "实现包含结构化数据、认证、部署和迭代闭环的全栈产品体验。",
  "设计 human-in-the-loop 自动化流程，确保生成材料在最终提交前停止。",
];

const defaultApplicationAnswers = [
  "为什么适合这个岗位？\n这个岗位匹配我把模糊技术和数据问题落成可用系统的经历。",
  "最强项目证据\nVetCite-Bench 展示了可复现评测、调试能力和带人工审核约束的 source-backed reasoning。",
];

const resumeTemplates = [
  {
    id: "mit-classic",
    name: "MIT Style",
    language: "英文",
    bestFor: "工程 / 研究 / 量化岗位",
    style: "紧凑单栏、强调项目和技术密度",
  },
  {
    id: "stanford-minimal",
    name: "Stanford Style",
    language: "英文",
    bestFor: "产品 / 软件 / 创业方向",
    style: "克制留白、单页优先、阅读节奏清晰",
  },
  {
    id: "ats-en",
    name: "ATS English",
    language: "英文",
    bestFor: "美国 tech / new grad / internship",
    style: "单栏、关键词友好、适合系统解析",
  },
  {
    id: "cn-tech",
    name: "中文技术岗",
    language: "中文",
    bestFor: "国内互联网 / AI / 数据岗位",
    style: "项目优先、指标清晰、中文表达更自然",
  },
  {
    id: "apple-clean",
    name: "Apple Clean",
    language: "双语",
    bestFor: "产品工程 / AI 应用 / 设计感强的岗位",
    style: "留白更大、版式克制、适合人工审阅",
  },
];

const defaultJobDescription =
  "Anthropic is hiring an AI Agent Engineer to build reliable agent workflows across model evaluation, tool use, production deployment, and human review. Strong Python, TypeScript, evaluation, and product judgment preferred.";

const evidenceFilters = ["全部", "已确认", "待确认", "AI 草拟"];
const dashboardStorageKey = "job-master-dashboard-v1";
const localAgentUrl = "http://127.0.0.1:4317";

function readSavedDashboard() {
  try {
    return JSON.parse(window.localStorage.getItem(dashboardStorageKey) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function inferImportedCompany(jdText) {
  return jdText.match(/\b(OpenAI|Anthropic|Apple|Stripe|Microsoft|Databricks|Ramp|Snowflake|Palantir|Notion)\b/i)?.[1]
    ?? jdText.match(/(?:公司|招聘方|团队)[：:\s]*([^\n，。；]{2,40})/)?.[1]?.trim()
    ?? "";
}

function inferImportedRole(jdText) {
  return jdText.match(/(?:hiring|for|role|position|岗位)[\s:：]*(?:an?\s+)?([A-Z][A-Za-z0-9 /,+-]*(?:Engineer|Intern|Developer|Scientist|Analyst|Manager|Designer))/i)?.[1]?.trim()
    ?? jdText.match(/(?:岗位|职位|招聘职位)[：:\s]*([^\n，。；]{2,48}(?:工程师|实习生|产品经理|设计师|分析师|研究员|开发|负责人))/)?.[1]?.trim()
    ?? "";
}

const placeholderResumePattern = /CANDIDATE NAME|email@example\.com|portfolio\.example\.com|Add only verified skills|University \/ Degree \/ Graduation date/i;

function isPlaceholderResume(text) {
  return placeholderResumePattern.test(String(text ?? ""));
}

function normalizeResumeLine(line) {
  return String(line ?? "").replace(/\s+/g, " ").trim();
}

function isResumeSectionHeading(line) {
  const normalized = normalizeResumeLine(line).replace(/[：:]$/, "");
  if (!normalized || normalized.length > 64 || /@|https?:|www\.|\d{3}[- )]\d{3}/i.test(normalized)) return false;
  const compact = normalized.toLowerCase().replace(/[\s&/·|_-]+/g, "");
  const knownHeadings = [
    "summary", "profile", "objective", "education", "experience", "workexperience",
    "professionalexperience", "projects", "selectedprojects", "skills", "technicalskills",
    "research", "publications", "awards", "leadership", "activities", "certifications",
    "个人概述", "个人简介", "教育", "教育经历", "工作经历", "实习经历", "项目", "项目经历",
    "技能", "专业技能", "研究经历", "论文", "奖项", "校园经历", "证书", "经历与项目",
  ];
  if (knownHeadings.some((heading) => compact === heading.replace(/[\s&/·|_-]+/g, ""))) return true;
  const letters = normalized.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && normalized === normalized.toUpperCase() && !/[.!?]$/.test(normalized);
}

function parseResumeDocument(text) {
  const lines = String(text ?? "").split("\n").map(normalizeResumeLine).filter(Boolean);
  if (!lines.length) return { name: "", contact: [], intro: [], sections: [] };
  const firstHeadingIndex = lines.findIndex(isResumeSectionHeading);
  const headerEnd = firstHeadingIndex === -1 ? Math.min(lines.length, 3) : firstHeadingIndex;
  const headerLines = lines.slice(0, headerEnd);
  const name = headerLines[0] ?? "";
  const contact = headerLines.slice(1).filter((line) => /@|https?:|www\.|linkedin|github|\+?\d[\d ()-]{6,}/i.test(line));
  const intro = headerLines.slice(1).filter((line) => !contact.includes(line));
  const sections = [];
  let current = null;

  lines.slice(headerEnd).forEach((line) => {
    if (isResumeSectionHeading(line)) {
      current = { title: line.replace(/[：:]$/, ""), lines: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      current = { title: "PROFILE", lines: [] };
      sections.push(current);
    }
    current.lines.push(line);
  });

  return { name, contact, intro, sections };
}

function computeResumeChanges(sourceText, revisedText, limit = 30) {
  const source = String(sourceText ?? "").split("\n").map(normalizeResumeLine).filter(Boolean);
  const revised = String(revisedText ?? "").split("\n").map(normalizeResumeLine).filter(Boolean);
  const rows = source.length + 1;
  const cols = revised.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(cols));

  for (let i = source.length - 1; i >= 0; i -= 1) {
    for (let j = revised.length - 1; j >= 0; j -= 1) {
      table[i][j] = source[i] === revised[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const operations = [];
  let i = 0;
  let j = 0;
  while (i < source.length || j < revised.length) {
    if (i < source.length && j < revised.length && source[i] === revised[j]) {
      operations.push({ type: "equal", value: source[i] });
      i += 1;
      j += 1;
    } else if (j < revised.length && (i === source.length || table[i][j + 1] >= table[i + 1][j])) {
      operations.push({ type: "added", value: revised[j] });
      j += 1;
    } else {
      operations.push({ type: "removed", value: source[i] });
      i += 1;
    }
  }

  const changes = [];
  for (let index = 0; index < operations.length && changes.length < limit; index += 1) {
    if (operations[index].type === "equal") continue;
    const previousEqual = operations[index - 1]?.type === "equal" ? operations[index - 1].value : "";
    const removed = [];
    const added = [];
    while (index < operations.length && operations[index].type !== "equal") {
      if (operations[index].type === "removed") removed.push(operations[index].value);
      if (operations[index].type === "added") added.push(operations[index].value);
      index += 1;
    }
    changes.push({
      before: removed.join(" "),
      after: added.join(" "),
      beforeLines: removed,
      afterLines: added,
      sourceAnchor: removed.length === 0 ? (operations[index]?.value ?? previousEqual) : "",
    });
  }
  return changes;
}

function buildResumeSectionBlocks(section) {
  const compactTitle = normalizeResumeLine(section.title).toLowerCase().replace(/[\s&/·|_-]+/g, "");
  if (["summary", "profile", "objective", "个人概述", "个人简介"].includes(compactTitle)) {
    return [{ type: "paragraph", text: section.lines.join(" ") }];
  }

  const blocks = [];
  section.lines.forEach((line, lineIndex) => {
    const isBullet = /^[•●▪◦*\-–—]\s*/.test(line);
    const cleanLine = line.replace(/^[•●▪◦*\-–—]\s*/, "");
    const nextLine = section.lines[lineIndex + 1] ?? "";
    const nextIsBullet = /^[•●▪◦*\-–—]\s*/.test(nextLine);
    const hasEntryDivider = /\s[—–]\s|\s-\s/.test(line);
    const looksLikeShortTitle = nextIsBullet && line.length < 100 && !/[.!?。！？]$/.test(line);
    const looksLikeMeta = /\b(19|20)\d{2}\b|\b(Present|Current|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(line)
      && line.length < 120;
    const isEntryTitle = !looksLikeMeta && (blocks.length === 0 || hasEntryDivider || looksLikeShortTitle);

    if (isBullet) {
      blocks.push({ type: "bullet", text: cleanLine });
      return;
    }

    const previous = blocks.at(-1);
    if (previous?.type === "bullet" && !isEntryTitle) {
      previous.text = `${previous.text} ${line}`;
      return;
    }

    if (isEntryTitle) {
      blocks.push({ type: "entry", text: line });
    } else if (looksLikeMeta) {
      blocks.push({ type: "meta", text: line });
    } else {
      blocks.push({ type: "detail", text: line });
    }
  });
  return blocks;
}

function findResumeBlockChange(text, changes) {
  const normalizedText = normalizeResumeLine(text);
  if (!normalizedText) return -1;
  return changes.findIndex((change) => {
    const sourceLines = change.beforeLines?.length ? change.beforeLines : [change.before, change.sourceAnchor];
    return sourceLines.some((line) => {
      const normalizedLine = normalizeResumeLine(line);
      if (!normalizedLine) return false;
      return normalizedLine === normalizedText
        || (normalizedLine.length >= 24 && normalizedText.includes(normalizedLine))
        || (normalizedText.length >= 24 && normalizedLine.includes(normalizedText));
    });
  });
}

function ResumeDocument({ text, changes = [], activeChangeIndex = null, changeScope = "resume", onChangeFocus }) {
  const document = parseResumeDocument(text);
  if (!document.name) {
    return <div className="resume-document-empty">上传简历后，这里会显示可排版的原文。</div>;
  }
  const renderChangeText = (value) => {
    const changeIndex = findResumeBlockChange(value, changes);
    if (changeIndex < 0) return value;
    return (
      <button
        type="button"
        className={`resume-source-change ${activeChangeIndex === changeIndex ? "active" : ""}`}
        data-resume-change-index={changeIndex}
        data-resume-change-scope={changeScope}
        onClick={() => onChangeFocus?.(changeIndex, changeScope)}
      >
        <sup>{changeIndex + 1}</sup>
        {value}
      </button>
    );
  };
  return (
    <article className="resume-document">
      <header className="resume-document-header">
        <h2>{renderChangeText(document.name)}</h2>
        {document.intro.map((line) => <p className="resume-header-note" key={line}>{renderChangeText(line)}</p>)}
        {document.contact.length > 0 && <p className="resume-header-contact">{renderChangeText(document.contact.join("  |  "))}</p>}
      </header>
      {document.sections.map((section, sectionIndex) => (
        <section className="resume-document-section" key={`${section.title}-${sectionIndex}`}>
          <h3>{renderChangeText(section.title)}</h3>
          <div>
            {buildResumeSectionBlocks(section).map((block, blockIndex) => {
              if (block.type === "bullet") return <p className="resume-document-bullet" key={`${block.text}-${blockIndex}`}>{renderChangeText(block.text)}</p>;
              if (block.type === "entry") return <h4 className="resume-document-entry" key={`${block.text}-${blockIndex}`}>{renderChangeText(block.text)}</h4>;
              if (block.type === "meta") return <p className="resume-document-meta" key={`${block.text}-${blockIndex}`}>{renderChangeText(block.text)}</p>;
              return <p className="resume-document-detail" key={`${block.text}-${blockIndex}`}>{renderChangeText(block.text)}</p>;
            })}
          </div>
        </section>
      ))}
    </article>
  );
}

const baseEvidenceItems = [
  {
    id: "quant-research",
    icon: Briefcase,
    type: "实习",
    title: "Quantitative Research Internship",
    body: "Python 数据管道、指标监控、异常归因和可复现分析。",
    status: "已确认",
    statusGroup: "已确认",
    usage: 4,
    roles: ["Risk Engineer", "SDE"],
    tags: ["Python", "Metrics", "Research"],
    metricStatus: "已补指标",
    metricDetail: "可写：维护 3 条 Python 数据管道，沉淀异常归因流程；具体影响数值仍建议本人复核。",
    boundary: "公司数据、保密指标和未公开结果不能直接写入。",
    nextStep: "可直接用于 Risk / Data 方向 bullet，先确认是否能公开量化结果。",
  },
  {
    id: "vetcite",
    icon: FolderOpen,
    type: "项目",
    title: "VetCite-Bench",
    body: "LLM 引文验证、评测集构建、source-backed reasoning 和人工审核流程。",
    status: "AI 草拟",
    statusGroup: "AI 草拟",
    usage: 3,
    roles: ["AI Agent Engineer", "SDE"],
    tags: ["LLM Eval", "RAG", "Human Review"],
    metricStatus: "待补指标",
    metricDetail: "缺少评测集规模、验证准确率、人工审核量、延迟或质量提升等可量化指标。",
    boundary: "如果评测数据、引用源或用户数据未公开，需要只写方法和职责。",
    nextStep: "先补 1-2 个能确认的指标，再进入简历 bullet。",
  },
  {
    id: "husky-paths",
    icon: FolderOpen,
    type: "项目",
    title: "Husky Paths",
    body: "全栈校园路径规划产品，覆盖地图体验、API 集成和部署。",
    status: "待补指标",
    statusGroup: "待确认",
    usage: 2,
    roles: ["Product Engineer", "FDE"],
    tags: ["Full-stack", "Product", "API"],
    metricStatus: "待补指标",
    metricDetail: "待补用户数、路线查询量、地图 API 调用量、加载速度或部署稳定性。",
    boundary: "学校、API key、用户位置和身份信息不能写成可识别细节。",
    nextStep: "适合用 AI 改写成 Product / FDE 两版叙事。",
  },
];

function CompanyMark({ accent }) {
  return (
    <span className={`company-mark ${accent}`}>
      <Buildings size={24} weight="duotone" />
    </span>
  );
}

function StatusDot({ status, statusKey }) {
  return <span className={`status-dot ${statusKey ?? statusKeyByLabel[status] ?? "queued"}`} />;
}

function formatFileSize(bytes) {
  if (!bytes) return "本地文件";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeImportedResumeText(text) {
  return String(text ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfResumeText(file) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = [];
    let currentLine = "";
    let lastY = null;

    content.items.forEach((item) => {
      if (!("str" in item)) return;
      const y = item.transform?.[5] ?? null;
      if (currentLine && lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        lines.push(currentLine);
        currentLine = "";
      }
      const next = item.str.trim();
      if (next) currentLine += `${currentLine ? " " : ""}${next}`;
      if (item.hasEOL && currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      if (y !== null) lastY = y;
    });
    if (currentLine) lines.push(currentLine);
    pages.push(lines.join("\n"));
  }

  return pages.join("\n\n");
}

async function extractResumeText(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "txt") return file.text();
  if (extension === "pdf") return extractPdfResumeText(file);
  if (extension === "docx") {
    const mammothModule = await import("mammoth/mammoth.browser.js");
    const result = await mammothModule.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  throw new Error("暂不支持旧版 DOC，请先另存为 DOCX 或 PDF。");
}

const targetDirectionOptions = [
  "AI Agent Engineer",
  "SDE / Product Engineer",
  "Data / Algorithm Engineer",
  "Risk Engineer",
  "产品 / 全栈工程师",
];

const coreResumeDirections = [
  { label: "SDE", role: "SDE / Product Engineer" },
  { label: "AI Engineer", role: "AI Agent Engineer" },
  { label: "Risk Engineer", role: "Risk Engineer" },
];

function TargetPreferences({ targetMarket, outputLanguage, targetRole, directionOptions = targetDirectionOptions, onCreateDirection, onMarketChange, onLanguageChange, onRoleChange, compact = false }) {
  return (
    <section className={`target-preferences ${compact ? "compact" : ""}`} aria-label="投递目标设置">
      <div className="target-preferences-heading">
        <span>投递目标</span>
        <strong>{compact ? "AI 润色偏好" : "先告诉 AI 你要投哪里"}</strong>
      </div>
      <div className="target-preferences-fields">
        <div className="preference-group">
          <span>市场</span>
          <div className="segmented-control" aria-label="目标市场">
            {["美国", "中国"].map((market) => (
              <button
                key={market}
                className={targetMarket === market ? "selected" : ""}
                aria-pressed={targetMarket === market}
                onClick={() => onMarketChange(market)}
              >
                {market}
              </button>
            ))}
          </div>
        </div>
        <div className="preference-group">
          <span>简历语言</span>
          <div className="segmented-control" aria-label="简历语言">
            {["英文", "中文", "中英双语"].map((language) => (
              <button
                key={language}
                className={outputLanguage === language ? "selected" : ""}
                aria-pressed={outputLanguage === language}
                onClick={() => onLanguageChange(language)}
              >
                {language}
              </button>
            ))}
          </div>
        </div>
        <label className="preference-role">
          <span>目标方向</span>
          <select value={targetRole} onChange={(event) => event.target.value === "__custom__" ? onCreateDirection?.() : onRoleChange(event.target.value)}>
            {directionOptions.map((role) => <option key={role}>{role}</option>)}
            <option value="__custom__">+ 自定义方向…</option>
          </select>
          <CaretDown size={16} />
        </label>
      </div>
    </section>
  );
}

export function App() {
  const resumeInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const evidenceComposerRef = useRef(null);
  const reviewSectionRefs = useRef({});
  const stageScrollRef = useRef(null);
  const reviewCanvasRef = useRef(null);
  const savedDashboard = useRef(readSavedDashboard()).current;
  const previousAppliedCountRef = useRef(
    (savedDashboard.applications ?? []).filter((job) => ["已投递", "面试", "Offer", "未通过"].includes(normalizeApplicationStatus(job.status))).length,
  );
  const [profileReady, setProfileReady] = useState(() => savedDashboard.profileReady ?? false);
  const [manualEvidence, setManualEvidence] = useState(() => savedDashboard.manualEvidence ?? []);
  const [selectedDirection, setSelectedDirection] = useState(() => savedDashboard.selectedDirection ?? null);
  const [applications, setApplications] = useState(() => savedDashboard.applications ?? []);
  const [selectedId, setSelectedId] = useState(() => savedDashboard.selectedId ?? null);
  const [step, setStep] = useState(() => {
    if (savedDashboard.step === "review" && savedDashboard.selectedId) return "review";
    if (savedDashboard.step === "evidence") return "evidence";
    if (savedDashboard.step === "applications") return "applications";
    return "radar";
  });
  const [queueView, setQueueView] = useState(() => savedDashboard.queueView ?? "进行中");
  const [activeTab, setActiveTab] = useState("岗位匹配");
  const [reviewStatus, setReviewStatus] = useState(() => normalizeApplicationStatus(savedDashboard.reviewStatus ?? "准备中"));
  const [toast, setToast] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [evidenceFilter, setEvidenceFilter] = useState("全部");
  const [activeEvidenceId, setActiveEvidenceId] = useState(() => savedDashboard.activeEvidenceId ?? null);
  const [resumeFile, setResumeFile] = useState(() => savedDashboard.resumeFile ?? null);
  const [isResumeDragging, setIsResumeDragging] = useState(false);
  const [isResumeParsing, setIsResumeParsing] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState(() => savedDashboard.reviewDrafts ?? {});
  const [notesByJobId, setNotesByJobId] = useState(() => savedDashboard.notesByJobId ?? {});
  const [activeEditor, setActiveEditor] = useState(null);
  const [evidenceDraftText, setEvidenceDraftText] = useState("");
  const [evidenceOverrides, setEvidenceOverrides] = useState(() => savedDashboard.evidenceOverrides ?? {});
  const [activeEvidenceEditor, setActiveEvidenceEditor] = useState(null);
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
  const [templateByJobId, setTemplateByJobId] = useState(() => savedDashboard.templateByJobId ?? {});
  const [jobDescriptionDraft, setJobDescriptionDraft] = useState(defaultJobDescription);
  const [importCompanyDraft, setImportCompanyDraft] = useState("");
  const [importRoleDraft, setImportRoleDraft] = useState("");
  const [importUrlDraft, setImportUrlDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [targetMarket, setTargetMarket] = useState(() => savedDashboard.targetMarket ?? "美国");
  const [employmentType, setEmploymentType] = useState(() => savedDashboard.employmentType ?? "全职");
  const [outputLanguage, setOutputLanguage] = useState(() => savedDashboard.outputLanguage ?? "英文");
  const [targetRole, setTargetRole] = useState(() => savedDashboard.targetRole ?? "AI Agent Engineer");
  const [customDirections, setCustomDirections] = useState(() => savedDashboard.customDirections ?? []);
  const [isCustomDirectionOpen, setIsCustomDirectionOpen] = useState(false);
  const [customDirectionDraft, setCustomDirectionDraft] = useState({ name: "", keywords: "" });
  const [resumePolishDraft, setResumePolishDraft] = useState(() => savedDashboard.resumePolishDraft ?? null);
  const [resumeVersions, setResumeVersions] = useState(() => savedDashboard.resumeVersions ?? []);
  const [activeResumeVersionId, setActiveResumeVersionId] = useState(() => savedDashboard.activeResumeVersionId ?? null);
  const [isResumeEditing, setIsResumeEditing] = useState(false);
  const [isResumeReviewCollapsed, setIsResumeReviewCollapsed] = useState(false);
  const [isDirectionMenuOpen, setIsDirectionMenuOpen] = useState(false);
  const [resumeChangeDecisions, setResumeChangeDecisions] = useState({});
  const [activeResumeChangeIndex, setActiveResumeChangeIndex] = useState(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isRefreshingJobs, setIsRefreshingJobs] = useState(false);
  const [discoveryCycles, setDiscoveryCycles] = useState(() => {
    const saved = savedDashboard.discoveryCycles ?? {};
    return {
      ...saved,
      "美国:全职": saved["美国:全职"] ?? saved.美国 ?? 0,
      "中国:全职": saved["中国:全职"] ?? saved.中国 ?? 0,
      "美国:实习": saved["美国:实习"] ?? 0,
      "中国:实习": saved["中国:实习"] ?? 0,
    };
  });
  const [seenJobIdsByMarket, setSeenJobIdsByMarket] = useState(() => {
    const saved = savedDashboard.seenJobIdsByMarket ?? {};
    return {
      ...saved,
      "美国:全职": saved["美国:全职"] ?? saved.美国 ?? (savedDashboard.applications ?? []).filter((job) => job.market === "美国").map((job) => job.id),
      "中国:全职": saved["中国:全职"] ?? saved.中国 ?? (savedDashboard.applications ?? []).filter((job) => job.market === "中国").map((job) => job.id),
      "美国:实习": saved["美国:实习"] ?? [],
      "中国:实习": saved["中国:实习"] ?? [],
    };
  });
  const [recommendationMeta, setRecommendationMeta] = useState(() => savedDashboard.recommendationMeta ?? null);
  const [candidateProfile, setCandidateProfile] = useState(() => savedDashboard.candidateProfile ?? {
    name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
  });
  const [applicationConsent, setApplicationConsent] = useState(() => savedDashboard.applicationConsent ?? {
    contact: false,
    education: false,
    experience: false,
  });
  const [applicationAssists, setApplicationAssists] = useState(() => savedDashboard.applicationAssists ?? {});
  const [isApplicationAssistOpen, setIsApplicationAssistOpen] = useState(false);
  const [localAgentStatus, setLocalAgentStatus] = useState("checking");
  const [localAgentDetail, setLocalAgentDetail] = useState("正在查找本地 Agent");
  const [agentInput, setAgentInput] = useState("");
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [agentMessages, setAgentMessages] = useState(() => savedDashboard.agentMessages ?? [
    { id: "welcome", role: "assistant", text: "告诉我你想怎么改这份简历。我会给出完整新版本和需要你确认的事实。" },
  ]);
  const [agentSuggestion, setAgentSuggestion] = useState(() => savedDashboard.agentSuggestion ?? null);

  const selected = applications.find((job) => job.id === selectedId) ?? applications[0];
  const visibleJobs = useMemo(
    () => applications.filter((job) => {
      const matchesView = job.stage === queueView;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query || [job.company, job.role, job.status, job.source, job.track]
        .some((value) => String(value).toLowerCase().includes(query));
      return matchesView && matchesSearch;
    }),
    [applications, queueView, searchQuery],
  );
  const experienceCount = manualEvidence.length;
  const hasApplications = applications.length > 0;
  const storedMasterResume = resumeVersions.find((version) => version.id === "master-resume");
  const validResumeVersionCount = resumeVersions.filter((version) => !isPlaceholderResume(version.content)).length;
  const needsResumeReimport = Boolean(resumeFile && (!resumeFile.characters || !storedMasterResume || isPlaceholderResume(storedMasterResume.content)));
  const isReviewReady = step === "review" && Boolean(selected);
  const primarySection = isReviewReady ? "radar" : step;
  const workspaceClass = [
    "workspace",
    isReviewReady ? "review-workspace" : "primary-workspace",
    isQueueCollapsed ? "queue-collapsed" : "",
  ].filter(Boolean).join(" ");
  const parsedEvidenceCount = profileReady ? baseEvidenceItems.length : 0;
  const totalEvidenceCount = parsedEvidenceCount + experienceCount;
  const rawEvidenceItems = [
    ...(profileReady ? baseEvidenceItems : []),
    ...manualEvidence.map((item) => ({
      ...item,
      icon: Plus,
      deletable: true,
    })),
  ];
  const evidenceItems = rawEvidenceItems.map((item) => ({
    ...item,
    ...(evidenceOverrides[item.id] ?? {}),
    icon: item.icon,
    deletable: item.deletable,
  }));
  const filteredEvidenceItems = evidenceFilter === "全部"
    ? evidenceItems
    : evidenceItems.filter((item) => item.statusGroup === evidenceFilter);
  const activeEvidence = filteredEvidenceItems.find((item) => item.id === activeEvidenceId)
    ?? filteredEvidenceItems[0]
    ?? evidenceItems[0];
  const needsReviewCount = evidenceItems.filter((item) => item.statusGroup !== "已确认").length;
  const confirmedEvidenceCount = evidenceItems.filter((item) => item.statusGroup === "已确认").length;
  const confirmedEvidenceTitles = evidenceItems
    .filter((item) => item.statusGroup === "已确认")
    .map((item) => item.title);
  const profileCompletion = Math.min(
    100,
    (profileReady ? 52 : 0) + Math.min(experienceCount, 3) * 10 + (selectedDirection ? 18 : 0),
  );
  const hasCommandCenter = profileReady || experienceCount > 0 || selectedDirection || hasApplications;
  const appliedJobs = applications.filter((job) => ["已投递", "面试", "Offer", "未通过"].includes(normalizeApplicationStatus(job.status)));
  const trackedJobs = applications.filter((job) => job.stage !== "已归档");
  const discoveryJobs = trackedJobs.filter((job) => (
    job.market === targetMarket
    && (job.employmentType ?? "全职") === employmentType
    && !["已投递", "面试", "Offer", "未通过"].includes(normalizeApplicationStatus(job.status))
  ));
  const primaryNavigation = [
    ["radar", "找工作", "根据简历推荐和搜索岗位", MagnifyingGlass, discoveryJobs.length],
    ["evidence", "我的简历", "原版、方向版与岗位版", FileText, validResumeVersionCount],
    ["applications", "求职进度", "收藏、投递与面试进度", CheckCircle, trackedJobs.length],
  ];
  const availableTargetDirections = [
    ...targetDirectionOptions,
    ...customDirections.map((direction) => direction.name),
  ];
  const activeCustomDirection = customDirections.find((direction) => direction.name === targetRole);

  const selectedDrafts = selected ? reviewDrafts[selected.id] ?? {} : {};
  const masterResumeVersion = resumeVersions.find((version) => version.id === "master-resume" && !isPlaceholderResume(version.content));
  const masterResumeText = masterResumeVersion?.content?.toLowerCase() ?? "";
  const selectedResumeEvidence = selected?.evidence.filter((item) => masterResumeText.includes(item.toLowerCase())) ?? [];
  const selectedConfirmedEvidence = [...new Set([
    ...selectedResumeEvidence,
    ...(selected?.evidence.filter((item) => confirmedEvidenceTitles.includes(item)) ?? []),
  ])];
  const canGenerateApplicationMaterials = Boolean(masterResumeVersion && selected);
  const evidenceText = selectedDrafts.evidence
    ?? selectedConfirmedEvidence.map((item) => `${item} — 来自 Master Resume，可作为岗位版改写依据，仍需逐条审核。`).join("\n")
    ?? "";
  const resumeBulletText = canGenerateApplicationMaterials
    ? selectedDrafts.bullets ?? defaultResumeBullets.join("\n")
    : "";
  const applicationAnswerText = canGenerateApplicationMaterials
    ? selectedDrafts.answers ?? defaultApplicationAnswers.join("\n\n")
    : "";
  const evidenceLines = evidenceText.split("\n").map((line) => line.trim()).filter(Boolean);
  const resumeBulletLines = resumeBulletText.split("\n").map((line) => line.trim()).filter(Boolean);
  const applicationAnswerBlocks = applicationAnswerText.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const defaultTemplateId = outputLanguage === "中文" ? "cn-tech" : outputLanguage === "中英双语" ? "apple-clean" : "ats-en";
  const selectedTemplateId = selected ? templateByJobId[selected.id] ?? defaultTemplateId : defaultTemplateId;
  const selectedTemplate = resumeTemplates.find((template) => template.id === selectedTemplateId) ?? resumeTemplates[0];
  const usableResumeVersions = resumeVersions.filter((version) => !isPlaceholderResume(version.content));
  const activeResumeVersion = usableResumeVersions.find((version) => version.id === activeResumeVersionId)
    ?? masterResumeVersion
    ?? usableResumeVersions[0];
  const selectedJobResumeVersion = selected
    ? [...usableResumeVersions].reverse().find((version) => (
        (version.layer === "job" && version.jobId === selected.id)
        || version.target === `${selected.company} ${selected.role}`
      ))
    : null;
  const activeJobSuggestion = selected && agentSuggestion?.layer === "job" && agentSuggestion.jobId === selected.id
    ? agentSuggestion
    : null;
  const jobTailoringPreviewText = activeJobSuggestion?.suggestedResume
    ?? selectedJobResumeVersion?.content
    ?? activeResumeVersion?.content
    ?? masterResumeVersion?.content
    ?? "";
  const jobTailoringSourceText = activeJobSuggestion?.sourceText
    ?? selectedJobResumeVersion?.baseContent
    ?? resumeVersions.find((version) => version.id === selectedJobResumeVersion?.parentVersionId)?.content
    ?? masterResumeVersion?.content
    ?? "";
  const jobTailoringChanges = activeJobSuggestion?.suggestedResume || selectedJobResumeVersion?.content
    ? computeResumeChanges(jobTailoringSourceText, jobTailoringPreviewText)
    : [];
  const activeResumeText = activeResumeVersion?.content ?? "";
  const activeResumeSourceText = activeResumeVersion?.baseContent
    ?? resumeVersions.find((version) => version.id === activeResumeVersion?.parentVersionId)?.content
    ?? masterResumeVersion?.content
    ?? "";
  const activeResumeChanges = activeResumeVersion?.id === "master-resume"
    ? []
    : computeResumeChanges(activeResumeSourceText, activeResumeText);
  const suggestionSourceText = agentSuggestion?.sourceText ?? activeResumeSourceText;
  const agentSuggestionChanges = agentSuggestion?.suggestedResume
    ? computeResumeChanges(suggestionSourceText, agentSuggestion.suggestedResume)
    : [];
  const reviewableResumeChanges = agentSuggestion ? agentSuggestionChanges : activeResumeChanges;
  const resumePreviewText = agentSuggestion?.suggestedResume ?? activeResumeText;
  const directionResumeTabs = [
    ...coreResumeDirections,
    ...customDirections.map((direction) => ({ label: direction.name, role: direction.name, custom: true })),
  ].map((direction) => ({
    ...direction,
    version: [...usableResumeVersions].reverse().find((version) => version.target === direction.role),
  }));
  const activeResumeTemplate = resumeTemplates.find((template) => template.id === activeResumeVersion?.templateId)
    ?? resumeTemplates.find((template) => template.id === defaultTemplateId)
    ?? resumeTemplates[0];
  const legacyCompletedNote = "整体匹配度较高。简历和申请回答已完成定制，可以进入最终人工审核。";
  const savedSelectedNote = selected ? notesByJobId[selected.id] : "";
  const selectedNote = selected
    ? savedSelectedNote && savedSelectedNote !== legacyCompletedNote
      ? savedSelectedNote
      : selectedJobResumeVersion
        ? "岗位版简历已保存。下一步请审核改动、打开官方申请页，并在提交前确认全部字段。"
        : "尚未生成岗位版简历。先核对匹配依据，再从当前简历创建可审核的岗位版本。"
    : "";
  const selectedApplicationAssist = selected ? applicationAssists[selected.id] ?? {} : {};
  const contactProfileReady = Boolean(candidateProfile.name.trim() && candidateProfile.email.trim());

  const directions = [
    {
      name: "AI Agent Engineer",
      score: 92,
      reason: "你的项目里有 LLM 评测、智能体编排、human-in-the-loop 和工具调用证据。",
      gaps: "补强大规模可观测性、线上安全评测 owner 经历。",
    },
    {
      name: "SDE / Product Engineer",
      score: 86,
      reason: "FitScan、Husky Paths 等项目能覆盖全栈实现、部署、调试和产品迭代。",
      gaps: "需要弱化没有证据支撑的分布式系统规模表述。",
    },
    {
      name: "Risk Engineer",
      score: 81,
      reason: "量化实习、验证流程、指标监控和 source-backed evaluation 能转成风险分析叙事。",
      gaps: "支付/欺诈领域背景不足，适合作为备选方向。",
    },
  ];

  function handleAction(label) {
    setToast(label);
  }

  function applyRankedRecommendations(rankedJobs) {
    const poolIds = new Set(allJobPool.map((job) => job.id));
    const rankedIds = new Set(rankedJobs.map((job) => job.id));
    setApplications((current) => {
      const currentById = new Map(current.map((job) => [job.id, job]));
      const rankedWithTracking = rankedJobs.map((job) => {
        const existing = currentById.get(job.id);
        return existing
          ? {
              ...job,
              status: existing.status,
              statusKey: existing.statusKey,
              stage: existing.stage,
              userTracked: existing.userTracked,
            }
          : job;
      });
      const retainedJobs = current.filter((job) => {
        if (rankedIds.has(job.id)) return false;
        if (!poolIds.has(job.id)) return true;
        return Boolean(
          job.userTracked
          || job.stage === "已归档"
          || ["已投递", "面试", "Offer", "未通过"].includes(normalizeApplicationStatus(job.status)),
        );
      });
      return [...rankedWithTracking, ...retainedJobs];
    });
  }

  function saveRecommendationMeta(source, rankedJobs, market = targetMarket, jobType = employmentType, batch = 1, newCount = rankedJobs.length, remainingCount = 0) {
    const signals = [...new Set(rankedJobs.flatMap((job) => job.matchSignals ?? []))].slice(0, 6);
    setRecommendationMeta({
      source,
      targetRole,
      market,
      employmentType: jobType,
      matchedAt: "刚刚",
      signals,
      batch,
      newCount,
      remainingCount,
    });
  }

  function handleMarketChange(market) {
    if (market === targetMarket) return;
    setTargetMarket(market);
    setRecommendationMeta(null);
    if (step === "radar" && masterResumeVersion?.content?.trim()) {
      runJobRadar(market, { navigate: false, reason: "market-switch", employmentTypeOverride: employmentType });
    } else {
      setToast(`已切换到${market}市场；进入找工作后刷新对应岗位。`);
    }
  }

  function handleEmploymentTypeChange(nextType) {
    if (nextType === employmentType) return;
    setEmploymentType(nextType);
    setRecommendationMeta(null);
    if (step === "radar" && masterResumeVersion?.content?.trim()) {
      runJobRadar(targetMarket, { navigate: false, reason: "employment-switch", employmentTypeOverride: nextType });
    } else {
      setToast(`已切换到${nextType}岗位；进入找工作后刷新对应岗位。`);
    }
  }

  function focusResumeChange(index, scope) {
    setActiveResumeChangeIndex(index);
    requestAnimationFrame(() => {
      document.querySelector(`[data-resume-change-index="${index}"][data-resume-change-scope="${scope}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function openCustomDirection() {
    setCustomDirectionDraft({ name: "", keywords: "" });
    setIsCustomDirectionOpen(true);
  }

  function saveCustomDirection() {
    const name = customDirectionDraft.name.trim();
    const keywords = [...new Set(customDirectionDraft.keywords
      .split(/[,，、\/\n]+/)
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean))];
    if (name.length < 2) {
      setToast("方向名称至少需要 2 个字符。");
      return;
    }
    if (targetDirectionOptions.includes(name)) {
      setToast("这个名称已是内置方向，可以直接选择。");
      return;
    }
    if (keywords.length === 0) {
      setToast("至少添加 1 个用于岗位匹配的关键词。");
      return;
    }
    const direction = { id: `custom-direction-${Date.now()}`, name, keywords };
    setCustomDirections((current) => [
      ...current.filter((item) => item.name !== name),
      direction,
    ]);
    setTargetRole(name);
    setSelectedDirection(name);
    setRecommendationMeta(null);
    setIsCustomDirectionOpen(false);
    setToast(`已创建自定义方向“${name}”；刷新推荐后会按 ${keywords.join("、")} 重新排序。`);
  }

  function deleteCustomDirection(direction) {
    setCustomDirections((current) => current.filter((item) => item.id !== direction.id));
    if (targetRole === direction.name) {
      setTargetRole("AI Agent Engineer");
      setSelectedDirection("AI Agent Engineer");
      setRecommendationMeta(null);
    }
    setToast(`已删除自定义方向“${direction.name}”，已有简历版本不会被删除。`);
  }

  function focusEvidenceComposer() {
    setStep("evidence");
    requestAnimationFrame(() => evidenceComposerRef.current?.focus());
  }

  function goToReviewTab(tab) {
    setActiveTab(tab);
    requestAnimationFrame(() => reviewCanvasRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function closeReviewEditor() {
    if (activeEditor && activeEditor.value !== activeEditor.originalValue) {
      setToast("编辑内容未保存，已放弃这次修改。");
    }
    setActiveEditor(null);
  }

  function closeEvidenceEditor() {
    if (activeEvidenceEditor) {
      const currentValue = JSON.stringify({
        title: activeEvidenceEditor.title,
        body: activeEvidenceEditor.body,
        rolesText: activeEvidenceEditor.rolesText,
        tagsText: activeEvidenceEditor.tagsText,
        metricStatus: activeEvidenceEditor.metricStatus,
        metricDetail: activeEvidenceEditor.metricDetail,
      });
      if (currentValue !== activeEvidenceEditor.originalValue) {
        setToast("事实卡修改未保存，已放弃这次修改。");
      }
    }
    setActiveEvidenceEditor(null);
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key !== "Escape") return;
      if (activeEvidenceEditor) {
        closeEvidenceEditor();
      } else if (activeEditor) {
        closeReviewEditor();
      } else if (isImportOpen) {
        setIsImportOpen(false);
      } else if (isApplicationAssistOpen) {
        setIsApplicationAssistOpen(false);
      } else if (isCustomDirectionOpen) {
        setIsCustomDirectionOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeEditor, activeEvidenceEditor, isImportOpen, isApplicationAssistOpen, isCustomDirectionOpen]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    try {
      window.localStorage.setItem(dashboardStorageKey, JSON.stringify({
        profileReady,
        manualEvidence,
        selectedDirection,
        applications,
        selectedId,
        step,
        queueView,
        reviewStatus,
        activeEvidenceId,
        resumeFile,
        reviewDrafts,
        notesByJobId,
        evidenceOverrides,
        templateByJobId,
        targetMarket,
        employmentType,
        outputLanguage,
        targetRole,
        customDirections,
        resumePolishDraft,
        resumeVersions,
        activeResumeVersionId,
        candidateProfile,
        applicationConsent,
        applicationAssists,
        discoveryCycles,
        seenJobIdsByMarket,
        recommendationMeta,
        agentMessages,
        agentSuggestion,
      }));
    } catch {
      // The prototype remains usable when a privacy mode blocks local persistence.
    }
  }, [
    activeEvidenceId, applications, evidenceOverrides, manualEvidence, notesByJobId,
    profileReady, queueView, resumeFile, reviewDrafts, reviewStatus, selectedDirection,
    selectedId, step, templateByJobId, targetMarket, employmentType, outputLanguage, targetRole, customDirections, resumePolishDraft,
    resumeVersions, activeResumeVersionId,
    candidateProfile, applicationConsent, applicationAssists, discoveryCycles, seenJobIdsByMarket,
    recommendationMeta, agentMessages, agentSuggestion,
  ]);

  useEffect(() => {
    requestAnimationFrame(() => stageScrollRef.current?.scrollTo({ top: 0 }));
  }, [step]);

  useEffect(() => {
    checkLocalAgent();
  }, []);

  useEffect(() => {
    const canonicalById = new Map(allJobPool.map((job) => [job.id, job]));
    setApplications((current) => current.map((job) => {
      const canonical = canonicalById.get(job.id);
      if (!canonical) return job;
      return {
        ...job,
        ...canonical,
        status: job.status,
        statusKey: job.statusKey,
        stage: job.stage,
        score: job.score,
        updated: job.updated,
        matchSignals: job.matchSignals,
        isNew: job.isNew,
        userTracked: job.userTracked,
      };
    }));
  }, []);

  useEffect(() => {
    if (step !== "radar" || isRefreshingJobs || !masterResumeVersion?.content?.trim()) return;
    const marketPoolIds = new Set((jobPoolsByMarket[targetMarket] ?? [])
      .filter((job) => job.employmentType === employmentType)
      .map((job) => job.id));
    const hasCurrentMarketJobs = applications.some((job) => marketPoolIds.has(job.id) && job.stage === "进行中");
    if (!hasCurrentMarketJobs) runJobRadar(targetMarket, { navigate: false, reason: "market-sync", employmentTypeOverride: employmentType });
  }, [targetMarket, employmentType, step, masterResumeVersion?.id]);

  useEffect(() => {
    const currentAppliedCount = appliedJobs.length;
    const previousAppliedCount = previousAppliedCountRef.current;
    previousAppliedCountRef.current = currentAppliedCount;
    if (currentAppliedCount <= previousAppliedCount || !masterResumeVersion?.content?.trim()) return;
    runJobRadar(targetMarket, { navigate: false, reason: "application-backfill" });
  }, [appliedJobs.length]);

  useEffect(() => {
    if (activeResumeVersion?.id && activeResumeVersionId !== activeResumeVersion.id) {
      setActiveResumeVersionId(activeResumeVersion.id);
    }
  }, [activeResumeVersion?.id, activeResumeVersionId]);

  useEffect(() => {
    if (!isReviewReady) return undefined;
    const mobileQuery = window.matchMedia("(max-width: 860px)");
    const collapseQueueForMobile = () => {
      if (mobileQuery.matches) setIsQueueCollapsed(true);
    };
    collapseQueueForMobile();
    mobileQuery.addEventListener("change", collapseQueueForMobile);
    return () => mobileQuery.removeEventListener("change", collapseQueueForMobile);
  }, [isReviewReady]);

  function completeResumeParse() {
    setResumeFile((current) => current ?? {
      name: "resume.pdf",
      size: 428000,
      type: "application/pdf",
      source: "演示文件",
    });
    setProfileReady(true);
    setStep("evidence");
    setToast("简历已解析：教育、经历、项目和技能已进入事实库。");
  }

  async function checkLocalAgent() {
    setLocalAgentStatus("checking");
    setLocalAgentDetail("正在连接 127.0.0.1:4317");
    try {
      const response = await fetch(`${localAgentUrl}/health`);
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.auth || result.error || "Codex 尚未登录");
      setLocalAgentStatus(result.busy ? "busy" : "online");
      setLocalAgentDetail(result.auth || "Codex CLI 已连接");
    } catch (error) {
      setLocalAgentStatus("offline");
      setLocalAgentDetail(error.message || "运行 npm run agent 后重试");
    }
  }

  async function sendLocalAgentMessage(messageOverride, options = {}) {
    const message = String(messageOverride ?? agentInput).trim();
    if (!message || isAgentThinking) return;
    const sourceVersion = options.sourceVersion ?? activeResumeVersion ?? masterResumeVersion;
    const sourceText = options.resumeText ?? sourceVersion?.content ?? "";
    if (!sourceText.trim() || isPlaceholderResume(sourceText)) {
      setToast("先上传你的原版简历。没有 Master Resume 时不会生成替代内容。");
      triggerResumePicker();
      return;
    }
    const userMessage = { id: `user-${Date.now()}`, role: "user", text: message };
    setAgentMessages((current) => [...current, userMessage]);
    setAgentInput("");
    setIsAgentThinking(true);
    setLocalAgentStatus("busy");
    try {
      const response = await fetch(`${localAgentUrl}/v1/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          resumeText: sourceText,
          market: targetMarket,
          language: outputLanguage,
          targetRole,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "本地 Agent 请求失败");
      setAgentMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: "assistant", text: result.reply },
      ]);
      setAgentSuggestion({
        ...result,
        sourceText,
        sourceVersionId: sourceVersion?.id ?? "master-resume",
        suggestedName: options.suggestedName ?? `${targetRole} · Codex 建议版`,
        suggestedTarget: options.suggestedTarget ?? targetRole,
        layer: options.layer ?? "direction",
        jobId: options.jobId,
      });
      setLocalAgentStatus("online");
      setLocalAgentDetail("Codex CLI · Logged in using ChatGPT");
      setToast("本地 Agent 已生成完整简历建议，确认后可保存为新版本。");
    } catch (error) {
      setAgentMessages((current) => [
        ...current,
        { id: `error-${Date.now()}`, role: "assistant", text: `连接失败：${error.message}` },
      ]);
      setLocalAgentStatus("offline");
      setLocalAgentDetail(error.message || "运行 npm run agent 后重试");
      setToast(`方向版生成失败：${error.message}`);
    } finally {
      setIsAgentThinking(false);
    }
  }

  function applyLocalAgentSuggestion() {
    if (!agentSuggestion?.suggestedResume) return;
    const id = `agent-resume-${Date.now()}`;
    const isJobVersion = agentSuggestion.layer === "job";
    setResumeVersions((current) => [
      ...current,
      {
        id,
        name: agentSuggestion.suggestedName ?? `${targetRole} · Codex 建议版`,
        target: agentSuggestion.suggestedTarget ?? targetRole,
        layer: isJobVersion ? "job" : "direction",
        jobId: isJobVersion ? agentSuggestion.jobId : undefined,
        language: outputLanguage,
        templateId: activeResumeTemplate.id,
        content: agentSuggestion.suggestedResume,
        baseContent: agentSuggestion.sourceText ?? masterResumeVersion?.content ?? "",
        parentVersionId: agentSuggestion.sourceVersionId ?? masterResumeVersion?.id,
        updated: "刚刚由本地 Agent 生成",
        status: agentSuggestion.requiresConfirmation?.length ? "待人工确认" : "已生成",
      },
    ]);
    setActiveResumeVersionId(id);
    setAgentSuggestion(null);
    setIsResumeEditing(false);
    setToast(`已将 Codex 建议保存为${isJobVersion ? "岗位版" : "方向版"}，原版本保持不变。`);
  }

  async function createResumePolishDraft(jobTitle, roleOverride = targetRole) {
    const normalizedJobTitle = typeof jobTitle === "string" ? jobTitle : undefined;
    if (!masterResumeVersion?.content) {
      setToast("先上传你的原版简历。岗位定制不会再用演示经历代替。");
      triggerResumePicker();
      return;
    }
    const target = normalizedJobTitle ?? roleOverride;
    const sourceVersion = normalizedJobTitle
      ? activeResumeVersion ?? masterResumeVersion
      : masterResumeVersion;
    if (normalizedJobTitle) {
      setStep("review");
      setActiveTab("定制简历");
    } else {
      setStep("evidence");
    }
    setToast(`正在从你的 Master Resume 生成 ${target} 定制建议…`);
    await sendLocalAgentMessage(
      normalizedJobTitle
        ? `请根据 ${normalizedJobTitle} 的岗位要求微调这份简历。必须保留原版的章节结构、模板、姓名、联系方式、教育、经历、项目和日期；只允许改写 bullet、调整章节内部顺序，或在原版已有经历和项目之间进行取舍，不添加任何原文没有的公司、项目、技能或指标。`
        : `请按 ${targetMarket} 市场、${outputLanguage} 和 ${roleOverride} 方向改写这份简历。必须保持原版章节结构和模板不变；只允许改写现有内容、调整章节内部 bullet 顺序，或从原版已有经历和项目中进行取舍。不得添加原文没有的事实、指标、公司、项目或技能。`,
      {
        sourceVersion,
        resumeText: sourceVersion.content,
        suggestedName: normalizedJobTitle ? `${normalizedJobTitle} 岗位版` : `${roleOverride} 方向版`,
        suggestedTarget: target,
        layer: normalizedJobTitle ? "job" : "direction",
        jobId: normalizedJobTitle ? selected?.id : undefined,
      },
    );
  }

  function selectDirectionResume(role) {
    setTargetRole(role);
    setSelectedDirection(role);
    setIsDirectionMenuOpen(false);
    const existingVersion = [...usableResumeVersions].reverse().find((version) => version.target === role);
    if (existingVersion) {
      setActiveResumeVersionId(existingVersion.id);
      setIsResumeEditing(false);
      setAgentSuggestion(null);
      setToast(`已切换到 ${role} 方向版。`);
      return;
    }
    if (!masterResumeVersion) {
      setToast("先上传原版简历，再创建方向版本。");
      triggerResumePicker();
      return;
    }
    createResumePolishDraft(undefined, role);
  }

  function selectMasterResume() {
    if (!masterResumeVersion) {
      triggerResumePicker();
      return;
    }
    setActiveResumeVersionId(masterResumeVersion.id);
    setIsResumeEditing(false);
    setAgentSuggestion(null);
    setToast("正在查看锁定的上传原版。");
  }

  function acceptResumeChange(index) {
    const scope = agentSuggestion ? "suggestion" : activeResumeVersion?.id ?? "resume";
    setResumeChangeDecisions((current) => ({ ...current, [`${scope}:${index}`]: "accepted" }));
    setToast(`已接受第 ${index + 1} 处修改。`);
  }

  function rejectResumeChange(change, index) {
    const restoreChange = (text) => {
      const lines = String(text).split("\n");
      const normalizedLines = lines.map(normalizeResumeLine);
      const afterLines = (change.afterLines ?? (change.after ? [change.after] : [])).map(normalizeResumeLine).filter(Boolean);
      const beforeLines = (change.beforeLines ?? (change.before ? [change.before] : [])).map(normalizeResumeLine).filter(Boolean);

      if (afterLines.length > 0) {
        const startIndex = normalizedLines.findIndex((_, lineIndex) => (
          afterLines.every((line, offset) => normalizedLines[lineIndex + offset] === line)
        ));
        if (startIndex >= 0) {
          lines.splice(startIndex, afterLines.length, ...beforeLines);
          return lines.join("\n");
        }
      }
      if (afterLines.length === 0 && beforeLines.length > 0) return `${String(text).trim()}\n${beforeLines.join("\n")}`.trim();
      return String(text);
    };

    if (agentSuggestion?.suggestedResume) {
      setAgentSuggestion((current) => current ? { ...current, suggestedResume: restoreChange(current.suggestedResume) } : current);
    } else if (activeResumeVersion?.id && activeResumeVersion.id !== "master-resume") {
      setResumeVersions((current) => current.map((version) => (
        version.id === activeResumeVersion.id
          ? { ...version, content: restoreChange(version.content), updated: "刚刚审核", status: "已审核" }
          : version
      )));
    }
    const scope = agentSuggestion ? "suggestion" : activeResumeVersion?.id ?? "resume";
    setResumeChangeDecisions((current) => ({ ...current, [`${scope}:${index}`]: "rejected" }));
    setToast(`已拒绝第 ${index + 1} 处修改，并恢复对应原文。`);
  }

  function beginResumeEditing() {
    if (!activeResumeVersion) {
      triggerResumePicker();
      return;
    }
    if (activeResumeVersion.id !== "master-resume") {
      setIsResumeEditing((current) => !current);
      return;
    }
    const id = `manual-resume-${Date.now()}`;
    setResumeVersions((current) => [...current, {
      ...activeResumeVersion,
      id,
      name: `${targetRole} · 手动版`,
      target: targetRole,
      layer: "direction",
      baseContent: activeResumeVersion.content,
      parentVersionId: activeResumeVersion.id,
      updated: "刚刚创建",
      status: "编辑中",
    }]);
    setActiveResumeVersionId(id);
    setIsResumeEditing(true);
    setToast(`已创建 ${targetRole} 手动版；上传原文仍保持只读。`);
  }

  function updateActiveResumeContent(content) {
    if (!activeResumeVersion || activeResumeVersion.id === "master-resume") return;
    setResumeVersions((current) => current.map((version) => (
      version.id === activeResumeVersion.id
        ? { ...version, content, updated: "刚刚手动编辑", status: "已编辑" }
        : version
    )));
  }

  function selectStudioTemplate(templateId) {
    if (!activeResumeVersion) return;
    setResumeVersions((current) => current.map((version) => (
      version.id === activeResumeVersion.id ? { ...version, templateId } : version
    )));
    setToast(`已将当前版本切换为 ${resumeTemplates.find((template) => template.id === templateId)?.name} 模板。`);
  }

  async function exportActiveResumePdf() {
    const resumeElement = document.querySelector(".resume-paper");
    if (!resumeElement) return;
    setIsExportingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      resumeElement.classList.add("is-exporting");
      const canvas = await html2canvas(resumeElement, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      resumeElement.classList.remove("is-exporting");
      const image = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const imageHeight = (canvas.height * pageWidth) / canvas.width;
      const pageCount = Math.max(1, Math.ceil((imageHeight - 0.75) / pageHeight));
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(image, "PNG", 0, -(pageIndex * pageHeight), pageWidth, imageHeight);
      }
      const name = (activeResumeVersion?.name ?? "job-master-resume").replace(/[^a-zA-Z0-9-_]+/g, "-") || "job-master-resume";
      pdf.save(`${name}.pdf`);
      setToast("PDF 已生成并下载，建议打开后再检查页数和断行。");
    } catch {
      setToast("PDF 生成失败，请稍后重试。");
    } finally {
      resumeElement.classList.remove("is-exporting");
      setIsExportingPdf(false);
    }
  }

  function triggerResumePicker() {
    resumeInputRef.current?.click();
  }

  async function acceptResumeFile(file) {
    if (!file) return;
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) {
      setToast("请上传可搜索的 PDF、DOCX 或 TXT 简历。旧版 DOC 请先另存为 DOCX。");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setToast("简历文件请控制在 10 MB 以内。");
      return;
    }
    setIsResumeParsing(true);
    setToast(`正在本地读取 ${file.name}…`);
    try {
      const importedText = normalizeImportedResumeText(await extractResumeText(file));
      if (importedText.length < 80) {
        throw new Error("没有读取到足够文字。这个 PDF 可能是扫描件，请上传带文本层的 PDF、DOCX 或 TXT。");
      }

      const masterVersion = {
        id: "master-resume",
        name: "Master Resume",
        target: "上传原文",
        layer: "master",
        language: /[\u3400-\u9fff]/.test(importedText) ? "自动识别" : "英文",
        templateId: defaultTemplateId,
        content: importedText,
        updated: "刚刚从本地文件读取",
        status: "上传原文",
      };

      setResumeFile({
        name: file.name,
        size: file.size,
        type: file.type || "本地文件",
        source: "本地上传",
        characters: importedText.length,
      });
      setResumeVersions([masterVersion]);
      const discoveryKey = getDiscoveryKey(targetMarket, employmentType);
      const seenIds = seenJobIdsByMarket[discoveryKey] ?? [];
      const initialBatch = getJobDiscoveryBatch(targetMarket, employmentType, 0, 6, seenIds);
      const rankedJobs = rankJobsForResume(initialBatch, importedText, targetRole, customDirections).map((job) => ({
        ...job,
        isNew: !seenIds.includes(job.id),
        updated: !seenIds.includes(job.id) ? "刚刚发现并匹配" : "刚刚重新匹配",
      }));
      const nextSeenIds = [...new Set([...seenIds, ...rankedJobs.map((job) => job.id)])];
      const discoverableCount = (jobPoolsByMarket[targetMarket] ?? []).filter((job) => job.stage === "进行中" && job.employmentType === employmentType).length;
      const remainingCount = Math.max(0, discoverableCount - nextSeenIds.length);
      applyRankedRecommendations(rankedJobs);
      setDiscoveryCycles((current) => ({ ...current, [discoveryKey]: 1 }));
      setSeenJobIdsByMarket((current) => ({ ...current, [discoveryKey]: nextSeenIds }));
      saveRecommendationMeta(file.name, rankedJobs, targetMarket, employmentType, 1, rankedJobs.filter((job) => job.isNew).length, remainingCount);
      setActiveResumeVersionId(masterVersion.id);
      setProfileReady(true);
      setSelectedDirection(targetRole);
      setIsResumeEditing(false);
      setAgentSuggestion(null);
      setStep("evidence");
      setToast(`已读取 ${file.name}，Master Resume 和岗位推荐均已更新。`);
    } catch (error) {
      setToast(`简历读取失败：${error.message}`);
    } finally {
      setIsResumeParsing(false);
    }
  }

  async function handleResumeInputChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await acceptResumeFile(file);
  }

  async function handleResumeDrop(event) {
    event.preventDefault();
    setIsResumeDragging(false);
    await acceptResumeFile(event.dataTransfer.files?.[0]);
  }

  function addExperience() {
    const id = `manual-${Date.now()}`;
    const rawText = evidenceDraftText.trim();
    const title = rawText
      ? rawText.replace(/\s+/g, " ").slice(0, 26)
      : `补充经历 ${manualEvidence.length + 1}`;
    setManualEvidence((current) => [
      ...current,
      {
        id,
        type: "新增",
        title,
        body: rawText || "先记录原始描述，之后再提炼成岗位相关 bullet。",
        status: "等待确认",
        statusGroup: "待确认",
        usage: 0,
        roles: ["待分配"],
        tags: ["Raw Note", "To Polish"],
        metricStatus: "待补指标",
        metricDetail: "补充影响、规模、用户数、性能提升或节省时间等指标。",
        boundary: "日期、身份、公司信息和无法公开的数据需要本人确认。",
        nextStep: "可用 AI 改写成岗位相关经历，再决定是否写入简历。",
      },
    ]);
    setActiveEvidenceId(id);
    setEvidenceFilter("全部");
    setEvidenceDraftText("");
    setToast(rawText ? "已从输入内容生成事实卡，可继续编辑或让 AI 补充。" : "已添加一条经历到 evidence bank，可随时删除或继续补充。");
  }

  function addPolishedExperience() {
    const id = `manual-${Date.now()}`;
    const rawText = evidenceDraftText.trim();
    if (!rawText) {
      evidenceComposerRef.current?.focus();
      setToast("先粘贴一段粗糙经历，AI 会按你的投递目标整理成草稿。");
      return;
    }
    const title = rawText.replace(/\s+/g, " ").slice(0, 26);
    const polishedBody = outputLanguage === "英文"
      ? `AI draft for ${targetRole}: Built and iterated on ${rawText.replace(/。$/, "")}. Confirm ownership, scope, and outcome before adding it to a resume.`
      : outputLanguage === "中英双语"
        ? `中文草稿：围绕 ${targetRole}，整理了 ${rawText.replace(/。$/, "")}，请补充你负责的范围和可确认的结果。\nEnglish draft: Tailored for ${targetRole}; confirm ownership, scope, and outcome before use.`
        : `AI 草稿：围绕 ${targetRole}，把“${rawText.replace(/。$/, "")}”整理为可审阅的经历表达；请补充你负责的范围、影响和可确认结果。`;
    setManualEvidence((current) => [
      ...current,
      {
        id,
        type: "新增",
        title,
        body: polishedBody,
        status: "AI 草拟",
        statusGroup: "AI 草拟",
        usage: 0,
        roles: [targetRole],
        tags: [targetMarket, outputLanguage, "AI Polish"],
        metricStatus: "待用户确认",
        metricDetail: "请补充真实的影响、规模、用户数、性能提升或节省时间；AI 不会替你编写指标。",
        boundary: "日期、身份、公司信息和无法公开的数据需要本人确认。",
        nextStep: "确认事实后，这条经历可以进入对应方向的简历和申请包。",
      },
    ]);
    setActiveEvidenceId(id);
    setEvidenceFilter("全部");
    setEvidenceDraftText("");
    setToast(`已按 ${targetMarket} · ${outputLanguage} · ${targetRole} 生成经历草稿，下一步确认事实。`);
  }

  function deleteEvidence(id) {
    const remainingEvidence = manualEvidence.filter((item) => item.id !== id);
    setManualEvidence((current) => current.filter((item) => item.id !== id));
    setEvidenceOverrides((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setActiveEvidenceId((current) => (current === id ? (profileReady ? "vetcite" : remainingEvidence[0]?.id ?? null) : current));
    setToast("已删除这条手动新增经历。");
  }

  function updateEvidenceOverride(id, updates) {
    setEvidenceOverrides((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {}),
        ...updates,
      },
    }));
  }

  function openEvidenceEditor(item) {
    const editorValue = {
      title: item.title,
      body: item.body,
      rolesText: item.roles.join(" / "),
      tagsText: item.tags.join(", "),
      metricStatus: item.metricStatus ?? "待补指标",
      metricDetail: item.metricDetail ?? "",
    };
    setActiveEvidenceEditor({
      id: item.id,
      ...editorValue,
      originalValue: JSON.stringify(editorValue),
    });
  }

  function updateEvidenceEditor(field, value) {
    setActiveEvidenceEditor((current) => (current ? { ...current, [field]: value } : current));
  }

  function saveEvidenceEditor() {
    if (!activeEvidenceEditor) return;
    updateEvidenceOverride(activeEvidenceEditor.id, {
      title: activeEvidenceEditor.title.trim() || "未命名事实",
      body: activeEvidenceEditor.body.trim() || "待补充事实描述。",
      roles: activeEvidenceEditor.rolesText.split(/[\/,，]/).map((role) => role.trim()).filter(Boolean),
      tags: activeEvidenceEditor.tagsText.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      metricStatus: activeEvidenceEditor.metricStatus,
      metricDetail: activeEvidenceEditor.metricDetail.trim() || "待补影响、规模、用户数、性能提升或节省时间。",
    });
    setActiveEvidenceId(activeEvidenceEditor.id);
    setActiveEvidenceEditor(null);
    setToast("事实卡已保存，后续方向推荐会读取这版草稿。");
  }

  function aiRewriteEvidence(item = activeEvidence) {
    if (!item) return;
    const baseBody = item.body.replace(/。$/, "");
    const rewrittenBody = outputLanguage === "英文"
      ? `AI draft for ${targetRole}: ${baseBody}. Clarify ownership, verified scope, and measurable outcome before adding this to an English resume.`
      : outputLanguage === "中英双语"
        ? `中文草稿：围绕 ${targetRole}，${baseBody}；请补充可确认的职责范围和结果。\nEnglish draft: Tailored for ${targetRole}; confirm ownership, scope, and outcome before use.`
        : `AI 草稿：围绕 ${targetRole}，${baseBody}；请补充你负责的范围、影响和可确认结果后再写入简历。`;
    updateEvidenceOverride(item.id, {
      body: rewrittenBody,
      status: "AI 草拟",
      statusGroup: "AI 草拟",
      metricStatus: "待用户确认",
      metricDetail: "AI 建议补充：用户数 / 数据量 / 响应时间 / 准确率 / 节省时间，至少确认 1 个再进入简历。",
      roles: [targetRole],
      tags: [...new Set([...item.tags, targetMarket, outputLanguage, "AI Polish"])],
      nextStep: "人工确认指标后，可按当前市场和语言生成简历 bullet。",
    });
    setActiveEvidenceId(item.id);
    setEvidenceFilter("全部");
    setToast(`AI 已改写 ${item.title}，并列出需要补充的指标。`);
  }

  function confirmEvidence(item = activeEvidence) {
    if (!item) return;
    const needsMetric = String(item.metricStatus ?? "").startsWith("待");
    updateEvidenceOverride(item.id, {
      status: needsMetric ? "待补指标" : "已确认",
      statusGroup: needsMetric ? "待确认" : "已确认",
      metricStatus: item.metricStatus ?? "已补指标",
    });
    setActiveEvidenceId(item.id);
    setEvidenceFilter("全部");
    setToast(needsMetric
      ? `${item.title} 的事实边界已确认，但指标还需要补充。`
      : `${item.title} 已标记为可投递事实。`);
  }

  function openReviewEditor(section, title, value) {
    if (!canGenerateApplicationMaterials) {
      focusEvidenceComposer();
      setToast("先确认与当前岗位匹配的事实，再编辑可投递材料。");
      return;
    }
    setActiveEditor({ section, title, value, originalValue: value });
  }

  function updateReviewEditor(value) {
    setActiveEditor((current) => (current ? { ...current, value } : current));
  }

  function saveReviewEditor() {
    if (!selected || !activeEditor) return;
    const cleanedValue = activeEditor.value.trim();
    setReviewDrafts((current) => ({
      ...current,
      [selected.id]: {
        ...(current[selected.id] ?? {}),
        [activeEditor.section]: cleanedValue,
      },
    }));
    setActiveEditor(null);
    setToast(`${activeEditor.title} 已保存到当前申请包草稿。`);
  }

  function recommendDirections() {
    if (confirmedEvidenceCount === 0) {
      setStep("evidence");
      setToast("先确认至少一条事实，再开始推荐方向。AI 草拟和待补指标内容不会参与推荐。");
      return;
    }
    setSelectedDirection("AI Agent Engineer");
    setTargetRole("AI Agent Engineer");
    setStep("radar");
    setToast("已根据事实库更新岗位推荐，AI Agent Engineer 已设为主方向。");
  }

  function chooseDirection(direction) {
    if (confirmedEvidenceCount === 0) {
      setStep("evidence");
      setToast("还没有已确认事实，先确认一条经历或项目再选方向。");
      return;
    }
    setSelectedDirection(direction);
    setTargetRole(direction);
    createResumePolishDraft(undefined, direction);
    setStep("radar");
    setToast(`已生成 ${direction} 方向简历版本，可以开始查找开放岗位。`);
  }

  function selectJob(job) {
    setSelectedId(job.id);
    setReviewStatus(normalizeApplicationStatus(job.status));
    setActiveTab("岗位匹配");
    setStep("review");
    setIsQueueCollapsed(true);
  }

  function updateSelectedReviewStatus(status) {
    setReviewStatus(status);
    if (!selected?.id) return;
    setApplications((current) =>
      current.map((job) =>
        job.id === selected.id
          ? {
              ...job,
              status,
              statusKey: statusKeyByLabel[status] ?? "queued",
              stage: status === "已归档" ? "已归档" : "进行中",
              userTracked: true,
              updated: "刚刚更新",
            }
          : job,
      ),
    );
  }

  function selectResumeTemplate(templateId) {
    const template = resumeTemplates.find((item) => item.id === templateId);
    if (selected?.id) {
      setTemplateByJobId((current) => ({
        ...current,
        [selected.id]: templateId,
      }));
    }
    setActiveTab("定制简历");
    setToast(`已选择 ${template?.name ?? "简历模板"}，后续导出会套用这版模板。`);
  }

  function openJobSource(job) {
    const applicationUrl = job?.applyUrl || (job?.source === "手动 JD" ? job.url : "");
    if (!applicationUrl) {
      setToast("这个岗位缺少具体申请链接，不会跳转到公司招聘首页。请重新导入并补充职位链接。");
      return;
    }
    setApplications((current) => current.map((item) => (
      item.id === job.id ? { ...item, userTracked: true, updated: "刚刚打开申请页" } : item
    )));
    window.open(applicationUrl, "_blank", "noopener,noreferrer");
    setToast(`已打开 ${job.company} 的具体职位申请页。`);
  }

  function updateCandidateProfile(field, value) {
    setCandidateProfile((current) => ({ ...current, [field]: value }));
  }

  function toggleApplicationConsent(field) {
    setApplicationConsent((current) => ({ ...current, [field]: !current[field] }));
  }

  function prepareApplicationAssist() {
    if (!selected) return;
    if (!selectedJobResumeVersion) {
      setActiveTab("定制简历");
      setToast("先生成并保存这份岗位版简历，再准备申请页填写。");
      return;
    }
    setActiveResumeVersionId(selectedJobResumeVersion.id);
    setIsApplicationAssistOpen(true);
  }

  function launchApplicationAssist() {
    if (!selected) return;
    if (!contactProfileReady || !applicationConsent.contact) {
      setToast("先补齐姓名和邮箱，并明确允许使用联系方式。");
      return;
    }
    if (!(selected.applyUrl || (selected.source === "手动 JD" && selected.url))) {
      setToast("当前岗位没有具体申请链接。补充职位链接后再开始填写辅助。");
      return;
    }
    setApplicationAssists((current) => ({
      ...current,
      [selected.id]: {
        preparedAt: "刚刚准备",
        resumeVersionId: activeResumeVersion?.id ?? null,
        contact: applicationConsent.contact,
        education: applicationConsent.education,
        experience: applicationConsent.experience,
      },
    }));
    setIsApplicationAssistOpen(false);
    openJobSource(selected);
    setToast("已打开职位申请页。后续只可使用你授权的字段；身份、授权、声明和最终提交必须由本人确认。");
  }

  function watchJob(job) {
    setApplications((current) =>
      current.map((item) =>
        item.id === job.id
          ? { ...item, status: "收藏", statusKey: "saved", stage: "进行中", userTracked: true, updated: "刚刚收藏" }
          : item,
      ),
    );
    setToast(`已收藏 ${job.company} - ${job.role}，可以在已投递页继续跟踪。`);
  }

  function archiveJob(job) {
    const nextJob = applications.find((item) => item.id !== job.id && item.stage === "进行中");
    setApplications((current) =>
      current.map((item) =>
        item.id === job.id
          ? { ...item, status: "已归档", statusKey: "archived", stage: "已归档", userTracked: true, updated: "刚刚忽略" }
          : item,
      ),
    );
    if (selectedId === job.id) {
      setSelectedId(nextJob?.id ?? null);
      setReviewStatus(nextJob?.status ?? "审核中");
      setStep(nextJob ? "review" : "radar");
    }
    setToast(`已忽略 ${job.company} - ${job.role}，可在已归档里找回。`);
  }

  function restoreJob(job) {
    setApplications((current) => current.map((item) => (
      item.id === job.id
        ? { ...item, status: "收藏", statusKey: "saved", stage: "进行中", userTracked: true, updated: "刚刚恢复" }
        : item
    )));
    setQueueView("进行中");
    setToast(`已恢复 ${job.company} - ${job.role} 到进行中队列。`);
  }

  async function runJobRadar(marketOverride, options = {}) {
    const market = typeof marketOverride === "string" ? marketOverride : targetMarket;
    const requestedEmploymentType = options.employmentTypeOverride ?? employmentType;
    const discoveryKey = getDiscoveryKey(market, requestedEmploymentType);
    if (!profileReady || needsResumeReimport || !masterResumeVersion?.content?.trim()) {
      setStep("evidence");
      setToast("先重新上传并读取 Master Resume，再刷新岗位推荐。");
      return;
    }
    if (isRefreshingJobs) return;

    setIsRefreshingJobs(true);
    setToast(`正在${market}${requestedEmploymentType}岗位池发现新岗位，并根据 ${masterResumeVersion.name} 重新匹配…`);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 520));
      const cycle = discoveryCycles[discoveryKey] ?? 0;
      const seenIds = seenJobIdsByMarket[discoveryKey] ?? [];
      const batch = getJobDiscoveryBatch(market, requestedEmploymentType, cycle, 6, seenIds);
      const rankedJobs = rankJobsForResume(
        batch,
        masterResumeVersion.content,
        targetRole,
        customDirections,
      ).map((job) => ({
        ...job,
        isNew: !seenIds.includes(job.id),
        updated: !seenIds.includes(job.id) ? "本轮新发现" : "刚刚重新匹配",
      }));
      const newCount = rankedJobs.filter((job) => job.isNew).length;
      const nextSeenIds = [...new Set([...seenIds, ...rankedJobs.map((job) => job.id)])];
      const discoverableCount = (jobPoolsByMarket[market] ?? []).filter((job) => job.stage === "进行中" && job.employmentType === requestedEmploymentType).length;
      const remainingCount = Math.max(0, discoverableCount - nextSeenIds.length);
      applyRankedRecommendations(rankedJobs);
      setDiscoveryCycles((current) => ({ ...current, [discoveryKey]: cycle + 1 }));
      setSeenJobIdsByMarket((current) => ({ ...current, [discoveryKey]: nextSeenIds }));
      saveRecommendationMeta(resumeFile?.name ?? masterResumeVersion.name, rankedJobs, market, requestedEmploymentType, cycle + 1, newCount, remainingCount);
      setSelectedDirection(targetRole);
      if (options.navigate !== false) setStep("radar");
      if (options.reason === "application-backfill" && newCount > 0) {
        setToast(`已记录投递，并自动补充 ${newCount} 个未看过的${market}${requestedEmploymentType}岗位。`);
      } else if (newCount > 0) {
        setToast(`已刷新${market}${requestedEmploymentType}岗位：展示 ${rankedJobs.length} 个，本轮新增 ${newCount} 个。`);
      } else if (discoverableCount === 0) {
        setToast(`当前本地池没有可验证的${market}${requestedEmploymentType}岗位，可粘贴真实 JD 建立岗位版。`);
      } else {
        setToast(`${market}${requestedEmploymentType}本地岗位池已看完；本次只重新计算匹配度，没有伪装成新增岗位。`);
      }
    } finally {
      setIsRefreshingJobs(false);
    }
  }

  function openImport() {
    const jdText = jobDescriptionDraft.trim();
    setImportCompanyDraft(inferImportedCompany(jdText));
    setImportRoleDraft(inferImportedRole(jdText));
    setImportUrlDraft("");
    setIsImportOpen(true);
    setToast("粘贴目标岗位 JD，生成单岗位申请包。");
  }

  function generatePacket() {
    const jdText = jobDescriptionDraft.trim() || defaultJobDescription;
    const importedJob = {
      ...(jobPoolsByMarket[targetMarket]?.[0] ?? usJobPool[0]),
      id: `imported-${Date.now()}`,
      company: importCompanyDraft.trim() || inferImportedCompany(jdText) || "待补充公司",
      role: importRoleDraft.trim() || inferImportedRole(jdText) || "待补充岗位",
      status: "收藏",
      statusKey: "saved",
      stage: "进行中",
      updated: "刚刚导入",
      score: 84,
      source: "手动 JD",
      market: targetMarket,
      employmentType,
      userTracked: true,
      url: importUrlDraft.trim(),
      applyUrl: importUrlDraft.trim(),
      summary: jdText.length > 180 ? `${jdText.slice(0, 180)}...` : jdText,
      gaps: ["需要确认岗位地点、授权和投递截止时间", "需要把 JD 关键词映射到已确认事实"],
    };
    setApplications((current) => [importedJob, ...current.filter((job) => job.id !== importedJob.id)]);
    setSelectedId(importedJob.id);
    setReviewStatus(importedJob.status);
    createResumePolishDraft(`${importedJob.company} ${importedJob.role}`, importedJob.role);
    setActiveTab("岗位匹配");
    setStep("review");
    setIsQueueCollapsed(true);
    setIsImportOpen(false);
    setToast("已根据粘贴的 JD 生成申请包草稿。");
  }

  function addSampleQueue() {
    const discoveryKey = getDiscoveryKey(targetMarket, employmentType);
    const seenIds = seenJobIdsByMarket[discoveryKey] ?? [];
    const pool = getJobDiscoveryBatch(targetMarket, employmentType, 0, 6, seenIds);
    setSeenJobIdsByMarket((current) => ({
      ...current,
      [discoveryKey]: [...new Set([...seenIds, ...pool.map((job) => job.id)])],
    }));
    setApplications(pool);
    setSelectedId(pool[0]?.id ?? null);
    setReviewStatus(pool[0]?.status ?? "审核中");
    setStep("review");
    setIsQueueCollapsed(true);
    setToast("已载入示例队列，方便演示完整 dashboard。");
  }

  function updateTracking() {
    if (!selected) return;
    setApplications((current) => current.map((job) => (
      job.id === selected.id ? { ...job, updated: "刚刚更新" } : job
    )));
    setToast("备注和当前状态已保存到浏览器本地草稿。");
  }

  function approveApplication() {
    if (!canGenerateApplicationMaterials) {
      focusEvidenceComposer();
      setToast("当前申请包没有已确认的匹配证据，先确认事实后再批准填表。");
      return;
    }
    updateSelectedReviewStatus("准备中");
    setToast("已批准进入填表阶段；最终提交仍被保留给本人确认。");
  }

  function stopBeforeSubmit() {
    updateSelectedReviewStatus("收藏");
    setToast("已停止提交流程，岗位保留在收藏中。");
  }

  function exportResumeDraft() {
    if (!selected) return;
    if (!selectedJobResumeVersion) {
      setActiveTab("定制简历");
      setToast("先生成并保存岗位版简历，再导出草稿。");
      return;
    }
    const fileName = `${selected.company}-${selected.role}`.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "") || "job-master-resume";
    const content = [
      `# ${selected.company} | ${selected.role}`,
      `来源：${selectedJobResumeVersion.name}`,
      `基于：${resumeVersions.find((version) => version.id === selectedJobResumeVersion.parentVersionId)?.name ?? "Master Resume"}`,
      "",
      selectedJobResumeVersion.content,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName}-resume-draft.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setToast(`已导出 ${selectedJobResumeVersion.name}。`);
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Sparkle size={18} weight="fill" />
          </span>
          <span>Job Master</span>
        </div>
        <label className="search-shell">
          <MagnifyingGlass size={18} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索岗位、公司或来源..."
          />
          <kbd>⌘K</kbd>
        </label>
        <div className="top-actions">
          <button className="button quiet" disabled={isResumeParsing} onClick={triggerResumePicker}>
            <FileArrowUp size={18} />
            {isResumeParsing ? "正在读取…" : "上传简历"}
          </button>
          <button className="button primary" onClick={openImport}>
            <Plus size={18} />
            粘贴 JD
          </button>
          <button className="avatar" aria-label="账户" onClick={() => handleAction("账户设置会在下一版接入。")}>
            AM
          </button>
        </div>
      </header>
      <input
        ref={resumeInputRef}
        className="visually-hidden"
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={handleResumeInputChange}
      />

      <section className={workspaceClass}>
        <aside className={`product-sidebar ${isQueueCollapsed ? "compact" : ""}`}>
          <div className="product-nav-heading">
            <span>工作台</span>
            {isReviewReady && (
              <button aria-label={isQueueCollapsed ? "展开导航" : "收起导航"} onClick={() => setIsQueueCollapsed((current) => !current)}>
                {isQueueCollapsed ? <CaretRight size={18} /> : <CaretLeft size={18} />}
              </button>
            )}
          </div>
          <nav className="product-navigation" aria-label="主要功能">
            {primaryNavigation.map(([key, label, description, Icon, count]) => (
              <button
                key={key}
                className={primarySection === key ? "active" : ""}
                aria-label={label}
                onClick={() => {
                  setStep(key);
                  setIsQueueCollapsed(false);
                }}
              >
                <Icon size={20} weight={primarySection === key ? "fill" : "regular"} />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <em>{count}</em>
              </button>
            ))}
          </nav>
          <div className="local-profile-card">
            <span className="profile-file-icon"><FileText size={18} /></span>
            <div>
              <strong>{masterResumeVersion ? resumeFile?.name ?? "Master Resume" : "还没有主简历"}</strong>
              <small>{needsResumeReimport ? "需要重新上传以读取原文" : masterResumeVersion ? `${validResumeVersionCount} 个版本 · 浏览器本地草稿` : "上传后开始岗位推荐"}</small>
            </div>
            <button aria-label="上传或替换简历" onClick={triggerResumePicker}><FileArrowUp size={17} /></button>
          </div>
        </aside>

        {isReviewReady ? (
          <section className="review-panel">
          <div className="review-titlebar">
            <div className="title-group">
              <button className="back-button" aria-label="返回找工作" onClick={() => { setStep("radar"); setIsQueueCollapsed(false); }}>
                <CaretLeft size={18} />
              </button>
              <CompanyMark accent={selected.accent} />
              <div>
                <p>{selected.company}</p>
                <h1>{selected.role}</h1>
              </div>
              <span className="status-pill">
                <StatusDot status={reviewStatus} />
                {reviewStatus}
              </span>
            </div>
              <div className="review-title-actions">
                <button className="button quiet" onClick={() => openJobSource(selected)}>
                  <ArrowSquareOut size={17} />
                  打开申请页
                </button>
                <button className="button primary" onClick={() => {
                  createResumePolishDraft(`${selected.company} ${selected.role}`, selected.role);
                  setActiveTab("定制简历");
                  requestAnimationFrame(() => reviewCanvasRef.current?.scrollTo({ top: reviewSectionRefs.current.resume?.offsetTop ?? 0, behavior: "smooth" }));
                }}>
                  <Sparkle size={17} weight="fill" />
                  根据 JD 定制
                </button>
                <button className="more-button" aria-label="归档当前岗位" onClick={() => archiveJob(selected)}>
                  <Trash size={20} />
                </button>
              </div>
            </div>

          <nav className="tabs" aria-label="申请包分区">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => goToReviewTab(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className="review-mobile-actions" aria-label="申请包操作">
            <button className="button quiet" onClick={prepareApplicationAssist}>
              <PaperPlaneTilt size={17} />
              Computer Use 填写
            </button>
            <button className="button quiet" onClick={exportResumeDraft}>
              <FileText size={17} />
              导出草稿
            </button>
            <button className="button quiet" onClick={updateTracking}>
              <NotePencil size={17} />
              保存追踪
            </button>
          </div>

          <div className="review-canvas" ref={reviewCanvasRef}>
            {activeTab === "岗位匹配" && (
              <>
            <section className="analysis-block" ref={(node) => { reviewSectionRefs.current.analysis = node; }}>
              <div className="section-title">
                <h2>岗位分析</h2>
                <span>{selected.source}</span>
              </div>
              <p className="summary-text">{selected.summary}</p>
              <dl className="metadata-grid">
                <div>
                  <dt>岗位轨道</dt>
                  <dd>{selected.track}</dd>
                </div>
                <div>
                  <dt>地点</dt>
                  <dd>{selected.location}</dd>
                </div>
                <div>
                  <dt>类型</dt>
                  <dd>{selected.type}</dd>
                </div>
                <div>
                  <dt>发布日期</dt>
                  <dd>{selected.posted}</dd>
                </div>
              </dl>
            </section>

            <section className="score-block">
              <div className="score-layout">
                <div className="score-ring" style={{ "--score": `${selected.score}%` }}>
                  <span>{selected.score}</span>
                  <small>{selected.score >= 90 ? "高度匹配" : "强匹配"}</small>
                </div>
                <div className="score-evidence">
                  <span>评分依据</span>
                  <strong>{selected.matchSignals?.length ? selected.matchSignals.join(" · ") : "目标方向与岗位轨道"}</strong>
                  <p>匹配分来自 Master Resume 关键词、目标方向和岗位轨道，不包含无法验证的“公司匹配”等主观分项。</p>
                </div>
              </div>
              <div className="callout">
                <strong>{selectedResumeEvidence.length > 0 ? "已定位到可核对事实" : "尚未定位到直接证据"}</strong>
                <p>{selectedResumeEvidence.length > 0
                  ? `Master Resume 中命中 ${selectedResumeEvidence.join("、")}；生成岗位版后仍需逐条审核改写。`
                  : "当前分数主要来自方向和技能关键词。生成岗位版时不会补写原简历不存在的经历或指标。"}</p>
              </div>
            </section>

            <section className="gap-block" ref={(node) => { reviewSectionRefs.current.gap = node; }}>
              <div className="section-title">
                <h2>缺口报告</h2>
                <span>仅作投递判断</span>
              </div>
              <h3>主要缺口</h3>
              <ul>
                {selected.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
              <h3>处理建议</h3>
              <ul>
                <li>只写已有证据能支撑的内容。</li>
                <li>用相邻项目经验覆盖岗位要求，不硬编经历。</li>
                <li>签证、授权、身份相关问题必须让本人回答。</li>
              </ul>
            </section>

            <section className="evidence-block">
              <div className="section-title">
                <h2>已选证据</h2>
                <button onClick={() => openReviewEditor("evidence", "已选证据", evidenceText)}>编辑</button>
              </div>
              <div className="evidence-list">
                {evidenceLines.length === 0 ? (
                  <div className="evidence-empty-state">
                    <WarningCircle size={20} />
                    <p>Master Resume 中没有命中岗位预设的项目名称。你仍可生成岗位版，但每处改写都必须人工审核。</p>
                    <button onClick={() => goToReviewTab("定制简历")}>开始定制</button>
                  </div>
                ) : evidenceLines.map((item) => {
                  const [name, note = "来自 Master Resume，可作为岗位版改写依据，仍需逐条审核。"] = item.split("—").map((part) => part.trim());
                  return (
                  <article key={item}>
                    <CheckCircle size={20} weight="fill" />
                    <div>
                      <strong>{name}</strong>
                      <p>{note}</p>
                    </div>
                    <span>证据</span>
                  </article>
                  );
                })}
              </div>
            </section>
              </>
            )}

            {activeTab === "定制简历" && (
              <section className="job-tailoring-block" ref={(node) => { reviewSectionRefs.current.resume = node; }}>
                <header className="job-tailoring-heading">
                  <div>
                    <span>岗位版简历</span>
                    <h2>{selected.company} · {selected.role}</h2>
                    <p>继承所选简历的章节、顺序和版式；只审核措辞、章节内 bullet 顺序和已确认内容取舍。</p>
                  </div>
                  <div className="job-tailoring-actions">
                    <label>
                      <span>定制基础</span>
                      <select value={activeResumeVersion?.id ?? ""} onChange={(event) => setActiveResumeVersionId(event.target.value)}>
                        {usableResumeVersions.filter((version) => version.layer !== "job" || version.id === selectedJobResumeVersion?.id).map((version) => (
                          <option key={version.id} value={version.id}>{version.name}</option>
                        ))}
                      </select>
                    </label>
                    <button className="button primary" disabled={isAgentThinking || !masterResumeVersion} onClick={() => createResumePolishDraft(`${selected.company} ${selected.role}`, selected.role)}>
                      <Sparkle size={17} weight="fill" />
                      {isAgentThinking ? "正在生成…" : selectedJobResumeVersion ? "重新生成建议" : "生成岗位版"}
                    </button>
                  </div>
                </header>

                <div className="job-resume-lineage">
                  <ShieldCheck size={16} />
                  <strong>{activeResumeVersion?.name ?? "Master Resume"}</strong>
                  <CaretRight size={14} />
                  <span>{selectedJobResumeVersion?.name ?? `${selected.company} 岗位版（未保存）`}</span>
                </div>

                <div className="job-tailoring-workspace">
                  <div className="job-resume-preview" aria-label="岗位版简历预览">
                    {jobTailoringPreviewText ? (
                      <ResumeDocument
                        text={jobTailoringChanges.length ? jobTailoringSourceText : jobTailoringPreviewText}
                        changes={jobTailoringChanges}
                        activeChangeIndex={activeResumeChangeIndex}
                        changeScope="job"
                        onChangeFocus={focusResumeChange}
                      />
                    ) : <p>先上传 Master Resume。</p>}
                  </div>
                  <aside className="job-change-panel" aria-label="岗位版修改">
                    <header>
                      <div><strong>绿色改写</strong><span>左侧红色原文 · 共 {jobTailoringChanges.length} 处</span></div>
                      <small>{activeJobSuggestion ? "待你确认" : selectedJobResumeVersion ? "已保存版本" : "尚未生成"}</small>
                    </header>
                    <div className="job-change-list">
                      {jobTailoringChanges.map((change, index) => {
                        const decision = resumeChangeDecisions[`suggestion:${index}`];
                        return (
                          <article className={`${decision ? `decision-${decision}` : ""} ${activeResumeChangeIndex === index ? "active-change" : ""}`} key={`${change.before}-${change.after}-${index}`}>
                            <button className="review-change-focus" onClick={() => focusResumeChange(index, "job")}>
                              <strong>{index + 1}. 文字调整</strong>
                              <span>定位原文</span>
                            </button>
                            <p className="review-change-after"><span>改写后</span>{change.after || "建议移除此句"}</p>
                            {activeJobSuggestion && (
                              <div className="review-change-actions">
                                <button className={decision === "accepted" ? "selected" : ""} aria-label={`接受第 ${index + 1} 处修改`} onClick={() => acceptResumeChange(index)}><Check size={16} /></button>
                                <button className={decision === "rejected" ? "selected reject" : ""} aria-label={`拒绝第 ${index + 1} 处修改`} onClick={() => rejectResumeChange(change, index)}><X size={16} /></button>
                              </div>
                            )}
                          </article>
                        );
                      })}
                      {jobTailoringChanges.length === 0 && (
                        <div className="job-change-empty">
                          <ShieldCheck size={22} />
                          <strong>{isAgentThinking ? "正在生成可审核建议" : "还没有岗位版改动"}</strong>
                          <p>生成后，左侧标红原文，右侧显示完整绿色改写。</p>
                        </div>
                      )}
                    </div>
                    {activeJobSuggestion && (
                      <footer>
                        <button className="button primary" onClick={applyLocalAgentSuggestion}>保存为岗位版</button>
                        <button className="button quiet" onClick={() => setAgentSuggestion(null)}>放弃建议</button>
                      </footer>
                    )}
                  </aside>
                </div>
              </section>
            )}

            {activeTab === "追踪" && (
            <section className="tracking-block" ref={(node) => { reviewSectionRefs.current.tracking = node; }}>
              <div className="section-title">
                <h2>追踪备注</h2>
                <button onClick={updateTracking}>保存</button>
              </div>
              <article>
                <strong>当前状态</strong>
                <p>{reviewStatus} · 下一步先确认岗位链接、申请材料和最终提交权限。</p>
              </article>
              <article>
                <strong>备注</strong>
                <p>{selectedNote}</p>
              </article>
            </section>
            )}
          </div>
        </section>
        ) : (
          <section ref={stageScrollRef} className={`review-panel empty-review ${step === "evidence" ? "evidence-stage" : ""}`}>
            {step === "profile" && (
              hasCommandCenter ? (
                <div className="command-center">
                  <section className="command-hero">
                    <div>
                      <p>Command Center</p>
                      <h1>今天先处理最影响投递质量的事。</h1>
                      <span>事实库、本地 AI、岗位雷达和申请包都在同一个工作台里。先确认事实，再生成材料，最后人工审核。</span>
                    </div>
                    <div className="readiness-card">
                      <span>Profile readiness</span>
                      <strong>{profileCompletion}%</strong>
                      <progress value={profileCompletion} max="100" />
                      <small>{needsReviewCount} 条事实需要确认 · AI: Local Mock</small>
                    </div>
                  </section>

                  <section className="resume-polish-workbench">
                    <TargetPreferences
                      targetMarket={targetMarket}
                      outputLanguage={outputLanguage}
                      targetRole={targetRole}
                      directionOptions={availableTargetDirections}
                      onCreateDirection={openCustomDirection}
                      onMarketChange={handleMarketChange}
                      onLanguageChange={setOutputLanguage}
                      onRoleChange={setTargetRole}
                    />
                    <div className="resume-polish-copy">
                      <span>AI Resume Polish</span>
                      <h2>按目标一键生成简历草稿。</h2>
                      <p>先按 {targetMarket} 市场、{outputLanguage} 和 {targetRole} 重排表达。草稿只使用事实库内容，未确认内容会继续保留审核状态。</p>
                      <button className="button primary" onClick={createResumePolishDraft}>
                        <Sparkle size={18} weight="fill" />
                        AI 一键润色简历
                      </button>
                    </div>
                    {resumePolishDraft && (
                      <article className="resume-polish-draft">
                        <div>
                          <span>{resumePolishDraft.status}</span>
                          <strong>{resumePolishDraft.heading}</strong>
                        </div>
                        <ul>
                          {resumePolishDraft.facts.map((fact) => <li key={fact}>{fact}</li>)}
                        </ul>
                        <button onClick={() => setStep("evidence")}>去确认事实</button>
                      </article>
                    )}
                  </section>

                  <section className="command-grid">
                    <article>
                      <span>事实库</span>
                      <strong>{totalEvidenceCount || 0}</strong>
                      <p>{resumeFile ? resumeFile.name : `${parsedEvidenceCount} 条来自简历`}，{experienceCount} 条手动补充。</p>
                      <button onClick={() => setStep("evidence")}>查看 Evidence Bank</button>
                    </article>
                    <article>
                      <span>待确认</span>
                      <strong>{needsReviewCount}</strong>
                      <p>指标、日期、身份和 AI 草拟内容先停在审核队列。</p>
                      <button onClick={() => setStep("evidence")}>处理事实</button>
                    </article>
                    <article>
                      <span>主投方向</span>
                      <strong>{selectedDirection ?? "待选择"}</strong>
                      <p>方向会决定岗位雷达和简历 bullet 的证据优先级。</p>
                      <button onClick={recommendDirections}>推荐方向</button>
                    </article>
                    <article>
                      <span>岗位雷达</span>
                      <strong>{applications.length}</strong>
                      <p>{hasApplications ? "已有岗位排队等待审核。" : "还没有运行开放岗位搜索。"}</p>
                      <button onClick={runJobRadar}>运行岗位雷达</button>
                    </article>
                  </section>

                  <section className="mode-strip">
                    <div>
                      <span>运行模式</span>
                      <strong>Local Mode · 浏览器本地草稿</strong>
                      <p>
                        {resumeFile ? `本地简历：${resumeFile.name} · ${formatFileSize(resumeFile.size)}` : "本地简历：等待上传"}
                        {" · "}当前原型只在此浏览器保存事实卡、申请包和备注，不保存原始简历文件。
                      </p>
                    </div>
                    <button className="button quiet" onClick={addSampleQueue}>
                      看完整演示数据
                    </button>
                  </section>
                </div>
              ) : (
                <>
                  <div className="empty-hero">
                    <span className="empty-mark">
                      <FileText size={26} />
                    </span>
                    <p>第一步 · 简历建档</p>
                    <h1>先把当前简历变成可投递的事实库。</h1>
                    <span>
                      上传或粘贴你的现有简历。Job Master 会提取教育、经历、项目、技能和链接，并把不确定信息标记出来，避免后续改简历时乱编。
                    </span>
                    <TargetPreferences
                      targetMarket={targetMarket}
                      outputLanguage={outputLanguage}
                      targetRole={targetRole}
                      directionOptions={availableTargetDirections}
                      onCreateDirection={openCustomDirection}
                      onMarketChange={handleMarketChange}
                      onLanguageChange={setOutputLanguage}
                      onRoleChange={setTargetRole}
                      compact
                    />
                    <div className="empty-actions">
                      <button className="button primary" disabled={isResumeParsing} onClick={triggerResumePicker}>
                        <FileArrowUp size={18} />
                        {isResumeParsing ? "正在读取…" : "上传当前简历"}
                      </button>
                      <button className="button quiet" onClick={() => setStep("evidence")}>
                        手动添加经历
                      </button>
                    </div>
                  </div>
                  <div className="profile-preview">
                    <div
                      className={`upload-zone ${isResumeDragging ? "dragging" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={triggerResumePicker}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          triggerResumePicker();
                        }
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsResumeDragging(true);
                      }}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsResumeDragging(true);
                      }}
                      onDragLeave={() => setIsResumeDragging(false)}
                      onDrop={handleResumeDrop}
                    >
                      <FileArrowUp size={30} />
                      <strong>{resumeFile ? resumeFile.name : "拖入 resume.pdf 或点击选择"}</strong>
                      <span>
                        {resumeFile
                          ? `${resumeFile.source} · ${formatFileSize(resumeFile.size)} · 已读取到 Master Resume`
                          : "支持可搜索的 PDF / DOCX / TXT。文件在浏览器本地读取，不会上传到服务器。"}
                      </span>
                    </div>
                    <div className="fact-grid">
                      <article>
                        <span>候选人</span>
                        <strong>待解析</strong>
                      </article>
                      <article>
                        <span>Experience</span>
                        <strong>0</strong>
                      </article>
                      <article>
                        <span>Projects</span>
                        <strong>0</strong>
                      </article>
                      <article>
                        <span>待确认事实</span>
                        <strong>0</strong>
                      </article>
                    </div>
                  </div>
                </>
              )
            )}

            {step === "evidence" && (
              <div className="resume-studio-page resume-document-workspace">
                <header className="resume-workspace-heading">
                  <div>
                    <h1>我的简历</h1>
                  </div>
                  {!masterResumeVersion && (
                    <button className="button quiet" disabled={isResumeParsing} onClick={triggerResumePicker}>
                      <FileArrowUp size={18} />
                      {isResumeParsing ? "正在读取…" : "上传原版"}
                    </button>
                  )}
                </header>

                <section className="resume-direction-toolbar" aria-label="简历版本">
                  <div className="resume-direction-zone">
                    <span className="resume-direction-label">简历版本（方向版）</span>
                    <div className="resume-direction-tabs" role="tablist" aria-label="方向简历版本">
                      <button
                        role="tab"
                        aria-selected={activeResumeVersion?.id === "master-resume" && !agentSuggestion}
                        className={activeResumeVersion?.id === "master-resume" && !agentSuggestion ? "active" : ""}
                        onClick={selectMasterResume}
                      >
                        原版
                      </button>
                      {directionResumeTabs.map((direction) => {
                        const isActive = direction.version
                          ? activeResumeVersion?.id === direction.version.id && !agentSuggestion
                          : Boolean(agentSuggestion && agentSuggestion.suggestedTarget === direction.role);
                        return (
                          <button
                            key={direction.role}
                            role="tab"
                            aria-selected={isActive}
                            className={isActive ? "active" : ""}
                            onClick={() => selectDirectionResume(direction.role)}
                          >
                            {direction.label}
                            {direction.version && <span className="version-ready-dot" aria-label="已有版本" />}
                          </button>
                        );
                      })}
                      <div className="direction-create-wrap">
                        <button
                          className="direction-create-button"
                          aria-label="创建新方向版"
                          aria-expanded={isDirectionMenuOpen}
                          onClick={() => setIsDirectionMenuOpen((current) => !current)}
                        >
                          <Plus size={16} />
                          新建方向版
                        </button>
                        {isDirectionMenuOpen && (
                          <div className="direction-create-menu" role="menu">
                            {availableTargetDirections.map((role) => (
                              <button key={role} role="menuitem" onClick={() => selectDirectionResume(role)}>{role}</button>
                            ))}
                            <button role="menuitem" onClick={openCustomDirection}>+ 自定义方向…</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="resume-lineage">
                      <ShieldCheck size={15} weight="duotone" />
                      <span>
                        {masterResumeVersion
                          ? `基于 ${resumeFile?.name ?? "Master Resume"} · 结构已锁定`
                          : "等待上传原版 · 上传后锁定章节结构"}
                      </span>
                    </div>
                  </div>
                  <div className="resume-direction-actions">
                    <button
                      className="button quiet"
                      disabled={!activeResumeVersion || Boolean(agentSuggestion)}
                      aria-label={activeResumeVersion?.id === "master-resume" ? "创建可手动增删的方向副本" : "手动编辑此简历版本"}
                      onClick={beginResumeEditing}
                    >
                      <NotePencil size={18} />
                      {isResumeEditing ? "完成编辑" : "手动编辑"}
                    </button>
                    <button
                      className="button primary"
                      disabled={isAgentThinking || !masterResumeVersion}
                      onClick={() => createResumePolishDraft(undefined, activeResumeVersion?.target === "上传原文" ? targetRole : activeResumeVersion?.target ?? targetRole)}
                    >
                      <Sparkle size={18} weight="fill" />
                      {isAgentThinking ? "正在按方向优化…" : "按方向优化"}
                    </button>
                    <button className="button quiet" disabled={isExportingPdf || !activeResumeVersion} onClick={exportActiveResumePdf}>
                      <ArrowSquareOut size={18} />
                      {isExportingPdf ? "生成 PDF…" : "导出 PDF"}
                    </button>
                  </div>
                </section>

                {needsResumeReimport && (
                  <section className="resume-required-banner resume-reimport-banner">
                    <WarningCircle size={22} />
                    <div>
                      <strong>这份旧上传记录没有保存简历正文</strong>
                      <span>请重新选择原文件。读取成功后会替换 Master Resume，不会生成示例身份或经历。</span>
                    </div>
                    <button className="button primary" disabled={isResumeParsing} onClick={triggerResumePicker}>{isResumeParsing ? "正在读取…" : "重新上传"}</button>
                  </section>
                )}

                <section className={`resume-document-layout ${isResumeReviewCollapsed ? "review-collapsed" : ""}`}>
                  <div className="resume-preview-column direction-resume-preview">
                    {activeResumeVersion || agentSuggestion ? (
                      <section className={`resume-paper source-locked ${activeResumeTemplate.id}`} aria-label="当前方向简历预览">
                        {isResumeEditing && !agentSuggestion ? (
                          <textarea
                            className="resume-content-editor"
                            value={activeResumeText}
                            onChange={(event) => updateActiveResumeContent(event.target.value)}
                            aria-label="编辑当前简历全文"
                          />
                        ) : (
                          <ResumeDocument
                            text={reviewableResumeChanges.length ? (agentSuggestion ? suggestionSourceText : activeResumeSourceText) : resumePreviewText}
                            changes={reviewableResumeChanges}
                            activeChangeIndex={activeResumeChangeIndex}
                            changeScope="direction"
                            onChangeFocus={focusResumeChange}
                          />
                        )}
                      </section>
                    ) : (
                      <button className="resume-preview-empty" onClick={triggerResumePicker}>
                        <FileArrowUp size={30} />
                        <strong>上传你的现有简历</strong>
                        <span>系统会保留原文结构，并从它派生 SDE、AI 和 Risk 等方向版本。</span>
                      </button>
                    )}
                  </div>

                  <aside className={`resume-review-panel ${isResumeReviewCollapsed ? "collapsed" : ""}`} aria-label="本版修改">
                    {isResumeReviewCollapsed ? (
                      <button className="review-panel-expand" aria-label="展开修改面板" onClick={() => setIsResumeReviewCollapsed(false)}>
                        <CaretLeft size={18} />
                        <span>{reviewableResumeChanges.length}</span>
                      </button>
                    ) : (
                      <>
                        <header className="resume-review-heading">
                          <div>
                            <strong>绿色改写</strong>
                            <span>左侧红色原文 · 共 {reviewableResumeChanges.length} 处</span>
                          </div>
                          <button aria-label="收起修改面板" onClick={() => setIsResumeReviewCollapsed(true)}><CaretRight size={18} /></button>
                        </header>

                        <div className="resume-review-list">
                          {reviewableResumeChanges.map((change, index) => {
                            const scope = agentSuggestion ? "suggestion" : activeResumeVersion?.id ?? "resume";
                            const decision = resumeChangeDecisions[`${scope}:${index}`];
                            return (
                              <article className={`${decision ? `decision-${decision}` : ""} ${activeResumeChangeIndex === index ? "active-change" : ""}`} key={`${change.before}-${change.after}-${index}`}>
                                <div className="review-change-title">
                                  <button className="review-change-focus" onClick={() => focusResumeChange(index, "direction")}>
                                    <strong>{index + 1}. {index % 3 === 0 ? "表达" : index % 3 === 1 ? "项目" : "经历"}</strong>
                                    <span>定位原文</span>
                                  </button>
                                  <span>{index + 1} / {reviewableResumeChanges.length}</span>
                                </div>
                                <p className="review-change-after"><span>改写后</span>{change.after || "建议移除此句"}</p>
                                <div className="review-change-actions">
                                  <button className={decision === "accepted" ? "selected" : ""} aria-label={`接受第 ${index + 1} 处修改`} onClick={() => acceptResumeChange(index)}><Check size={16} /></button>
                                  <button className={decision === "rejected" ? "selected reject" : ""} aria-label={`拒绝第 ${index + 1} 处修改`} onClick={() => rejectResumeChange(change, index)}><X size={16} /></button>
                                </div>
                              </article>
                            );
                          })}
                        </div>

                        {reviewableResumeChanges.length === 0 && (
                          <div className="resume-review-empty">
                            <ShieldCheck size={22} weight="duotone" />
                            <strong>{activeResumeVersion?.id === "master-resume" ? "这是锁定的上传原版" : "这一版暂无待审核改动"}</strong>
                            <p>点击“按方向优化”后，原句会在简历中标红，完整改写显示在右侧。</p>
                          </div>
                        )}

                        {agentSuggestion && (
                          <div className="resume-review-footer">
                            <button className="button primary" onClick={applyLocalAgentSuggestion}>保存为方向版</button>
                            <button className="button quiet" onClick={() => setAgentSuggestion(null)}>放弃建议</button>
                          </div>
                        )}

                        <div className="resume-structure-note">
                          <ShieldCheck size={15} />
                          <span>{isResumeEditing ? "可直接增删或改写全文；完成后会自动生成红绿对照。" : "修改仅影响当前方向版，不会改变原版结构。"}</span>
                        </div>
                      </>
                    )}
                  </aside>
                </section>
              </div>
            )}

            {false && step === "evidence" && (
              <div className="resume-studio-page">
                <section className="resume-studio-header">
                  <div>
                    <p>我的简历</p>
                    <h1>从原版开始，每一处修改都有依据。</h1>
                    <span>原版简历只读保存。AI 润色、方向版和岗位版都从它派生，并在右侧展示实际改动。</span>
                  </div>
                  <div className="resume-studio-actions">
                    <button className="button quiet" onClick={triggerResumePicker}>
                      <FileArrowUp size={18} />
                      {masterResumeVersion ? "替换原版" : "上传原版"}
                    </button>
                    <button className="button quiet" disabled={!activeResumeVersion} onClick={beginResumeEditing}>
                      <NotePencil size={18} />
                      {isResumeEditing ? "完成编辑" : activeResumeVersion?.id === "master-resume" ? "创建编辑副本" : "编辑此版本"}
                    </button>
                    <button
                      className="button primary"
                      disabled={isAgentThinking || !masterResumeVersion}
                      onClick={() => createResumePolishDraft(undefined, targetRole)}
                    >
                      <Sparkle size={18} weight="fill" />
                      {isAgentThinking ? "正在对照原版…" : "AI 一键润色"}
                    </button>
                    <button className="button quiet" disabled={isExportingPdf || !activeResumeVersion} onClick={exportActiveResumePdf}>
                      <FileArrowUp size={18} />
                      {isExportingPdf ? "生成 PDF…" : "导出 PDF"}
                    </button>
                  </div>
                </section>

                <section className={`resume-source-strip ${masterResumeVersion ? "ready" : "missing"}`}>
                  <ShieldCheck size={22} weight="duotone" />
                  <div>
                    <strong>{masterResumeVersion ? `原版已锁定 · ${resumeFile?.name ?? "Master Resume"}` : "还没有可用的原版简历"}</strong>
                    <span>{masterResumeVersion ? `${masterResumeVersion.content.length.toLocaleString()} 个字符 · 浏览器本地草稿 · 不被 AI 覆盖` : "先上传带文本层的 PDF、DOCX 或 TXT。没有原版时，系统不会生成示例身份或替代经历。"}</span>
                  </div>
                  {masterResumeVersion && activeResumeVersion?.id !== "master-resume" && (
                    <button onClick={() => { setActiveResumeVersionId(masterResumeVersion.id); setIsResumeEditing(false); }}>查看上传原文</button>
                  )}
                </section>

                {needsResumeReimport && (
                  <section className="resume-required-banner resume-reimport-banner">
                    <WarningCircle size={22} />
                    <div>
                      <strong>这份旧上传记录没有保存简历正文</strong>
                      <span>修复前只记录了文件名。请重新选择一次原文件，读取成功后会立即替换下面的 Master Resume。</span>
                    </div>
                    <button className="button primary" disabled={isResumeParsing} onClick={triggerResumePicker}>{isResumeParsing ? "正在读取…" : "重新上传"}</button>
                  </section>
                )}

                <section className="resume-studio-layout">
                  <aside className="resume-studio-sidebar">
                    <TargetPreferences
                      targetMarket={targetMarket}
                      outputLanguage={outputLanguage}
                      targetRole={targetRole}
                      directionOptions={availableTargetDirections}
                      onCreateDirection={openCustomDirection}
                      onMarketChange={handleMarketChange}
                      onLanguageChange={setOutputLanguage}
                      onRoleChange={setTargetRole}
                      compact
                    />
                    <div className="studio-sidebar-heading">
                      <span>简历版本</span>
                      <strong>{usableResumeVersions.length}</strong>
                    </div>
                    <div className="resume-version-list">
                      {usableResumeVersions.map((version) => {
                        const versionSource = version.baseContent ?? masterResumeVersion?.content ?? "";
                        const versionChanges = version.id === "master-resume" ? 0 : computeResumeChanges(versionSource, version.content).length;
                        return (
                        <button
                          key={version.id}
                          className={activeResumeVersion?.id === version.id ? "active" : ""}
                          onClick={() => { setActiveResumeVersionId(version.id); setIsResumeEditing(false); }}
                        >
                          <span className="resume-version-name"><strong>{version.name}</strong>{version.id === "master-resume" && <em>原版</em>}</span>
                          <span>{version.target} · {version.language}</span>
                          <small>{version.id === "master-resume" ? "上传原文 · 只读" : `${versionChanges} 组改动 · ${version.status}`} · {version.updated}</small>
                        </button>
                        );
                      })}
                      {!masterResumeVersion && (
                        <button className="resume-version-upload" onClick={triggerResumePicker}>
                          <FileArrowUp size={18} />
                          <strong>上传第一份简历</strong>
                          <span>它会成为所有版本的母版</span>
                        </button>
                      )}
                    </div>
                    <div className="studio-sidebar-heading">
                      <span>模板</span>
                      <strong>{activeResumeTemplate.name}</strong>
                    </div>
                    <div className="studio-template-list">
                      {resumeTemplates.map((template) => (
                        <button
                          key={template.id}
                          className={activeResumeTemplate.id === template.id ? "active" : ""}
                          onClick={() => selectStudioTemplate(template.id)}
                        >
                          <strong>{template.name}</strong>
                          <span>{template.bestFor}</span>
                        </button>
                      ))}
                    </div>
                    <p className="template-license-note">MIT / Stanford 为公开简历排版风格参考，不代表或关联相关机构。</p>
                  </aside>

                  <div className="resume-preview-column">
                    <div className="resume-preview-toolbar">
                      <div>
                        <strong>{activeResumeVersion?.name ?? "等待上传"}</strong>
                        <span>{activeResumeVersion?.id === "master-resume" ? "上传原文 · 只读" : `${activeResumeChanges.length} 组可审阅改动`} · {activeResumeTemplate.name}</span>
                      </div>
                      <span className="resume-page-count">A4 · 专业单栏</span>
                    </div>
                    {activeResumeVersion ? (
                      <section className={`resume-paper ${activeResumeTemplate.id}`} aria-label="当前简历预览">
                        {isResumeEditing ? (
                          <textarea
                            className="resume-content-editor"
                            value={activeResumeText}
                            onChange={(event) => updateActiveResumeContent(event.target.value)}
                            aria-label="编辑当前简历全文"
                          />
                        ) : (
                          <ResumeDocument text={activeResumeText} />
                        )}
                      </section>
                    ) : (
                      <button className="resume-preview-empty" onClick={triggerResumePicker}>
                        <FileArrowUp size={30} />
                        <strong>上传你的现有简历</strong>
                        <span>这里会按专业 A4 版式展示原文，而不是生成一份示例简历。</span>
                      </button>
                    )}
                  </div>

                  <aside className="resume-ai-panel">
                    <div className="mini-heading">
                      <span>修改建议</span>
                      <strong>{agentSuggestion ? "等待确认" : activeResumeChanges.length ? `${activeResumeChanges.length} 组改动` : "原文未修改"}</strong>
                    </div>
                    <div className={`local-agent-status ${localAgentStatus}`}>
                      <span className="agent-status-dot" />
                      <div>
                        <strong>{localAgentStatus === "online" ? "已连接" : localAgentStatus === "busy" ? "处理中" : localAgentStatus === "checking" ? "连接中" : "未连接"}</strong>
                        <small>{localAgentDetail}</small>
                      </div>
                      <button aria-label="重新连接本地 Agent" onClick={checkLocalAgent}><CircleNotch size={16} /></button>
                    </div>

                    <div className="agent-chat-log" aria-live="polite">
                      {agentMessages.map((message) => (
                        <div key={message.id} className={`agent-message ${message.role}`}>
                          <span>{message.role === "user" ? "你" : "Codex"}</span>
                          <p>{message.text}</p>
                        </div>
                      ))}
                      {isAgentThinking && (
                        <div className="agent-message assistant thinking">
                          <span>Codex</span>
                          <p>正在阅读当前简历并生成结构化建议…</p>
                        </div>
                      )}
                    </div>

                    {agentSuggestion && (
                      <section className="agent-suggestion">
                        <div className="agent-suggestion-heading">
                          <span>待应用建议</span>
                          <strong>{agentSuggestion.changeSummary.length} 处调整</strong>
                        </div>
                        <ul>
                          {agentSuggestion.changeSummary.map((change) => <li key={change}>{change}</li>)}
                        </ul>
                        <div className="resume-change-list">
                          {agentSuggestionChanges.slice(0, 6).map((change, index) => (
                            <article key={`${change.before}-${index}`}>
                              {change.before && <p className="change-before"><span>原句</span>{change.before}</p>}
                              {change.after && <p className="change-after"><span>建议</span>{change.after}</p>}
                            </article>
                          ))}
                        </div>
                        {agentSuggestion.requiresConfirmation.length > 0 && (
                          <div className="agent-confirmation-list">
                            <strong>需要你确认</strong>
                            {agentSuggestion.requiresConfirmation.map((item) => <p key={item}>{item}</p>)}
                          </div>
                        )}
                        <div className="agent-suggestion-actions">
                          <button className="button primary" onClick={applyLocalAgentSuggestion}>保存为新版本</button>
                          <button className="button quiet" onClick={() => setAgentSuggestion(null)}>暂不使用</button>
                        </div>
                      </section>
                    )}

                    {!agentSuggestion && activeResumeChanges.length > 0 && (
                      <div className="resume-change-list saved-changes">
                        {activeResumeChanges.slice(0, 7).map((change, index) => (
                          <article key={`${change.before}-${index}`}>
                            {change.before && <p className="change-before"><span>原句</span>{change.before}</p>}
                            {change.after && <p className="change-after"><span>当前</span>{change.after}</p>}
                          </article>
                        ))}
                      </div>
                    )}

                    {!agentSuggestion && activeResumeVersion?.id === "master-resume" && (
                      <div className="resume-change-empty">
                        <ShieldCheck size={22} />
                        <strong>这是上传原文</strong>
                        <p>它不会被静默修改。点击 AI 一键润色后，建议会先以原句和新句的方式出现在这里。</p>
                      </div>
                    )}

                    <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); sendLocalAgentMessage(); }}>
                      <label htmlFor="agent-message">与当前简历对话</label>
                      <textarea
                        id="agent-message"
                        ref={evidenceComposerRef}
                        value={agentInput}
                        onChange={(event) => setAgentInput(event.target.value)}
                        placeholder="例如：把项目经历改成美国 SDE 风格，但不要添加新指标。"
                      />
                      <div>
                        <small>当前版本会通过本机 Codex CLI 处理；所有建议仍需你确认后才能成为新版本。</small>
                        <button className="button primary" disabled={!agentInput.trim() || isAgentThinking} type="submit">发送</button>
                      </div>
                    </form>
                    <button className="text-action" onClick={recommendDirections}>基于当前简历推荐方向</button>
                  </aside>
                </section>
              </div>
            )}

            {step === "directions" && (
              <>
                <div className="empty-hero">
                  <span className="empty-mark">
                    <Sparkle size={26} weight="fill" />
                  </span>
                  <p>第三步 · 方向推荐</p>
                  <h1>根据事实库推荐主投方向和备选方向。</h1>
                  <span>
                    推荐不是玄学排序，而是看已有证据能支撑哪些岗位叙事，以及哪些方向容易出现硬缺口。
                  </span>
                  <div className="empty-actions">
                    <button className="button primary" onClick={() => chooseDirection("AI Agent Engineer")}>
                      选择主推荐方向
                    </button>
                    <button className="button quiet" onClick={() => setStep("radar")}>
                      跳到岗位雷达
                    </button>
                  </div>
                </div>
                <div className="direction-list">
                  {directions.map((direction) => (
                    <button key={direction.name} className="direction-card" onClick={() => chooseDirection(direction.name)}>
                      <div>
                        <strong>{direction.name}</strong>
                        <span>{direction.score}/100</span>
                      </div>
                      <p>{direction.reason}</p>
                      <small>{direction.gaps}</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === "radar" && (
              <div className="jobs-page">
                <header className="page-heading jobs-heading">
                  <div>
                    <span>找工作</span>
                    <h1>从适合你的岗位开始。</h1>
                    <p>推荐和匹配只读取已确认的简历事实；打开岗位后再按 JD 生成独立简历版本。</p>
                  </div>
                  <div className="page-heading-actions">
                    <button className="button quiet" onClick={openImport}><Plus size={17} />粘贴 JD</button>
                    <button className="button primary" disabled={isRefreshingJobs || isResumeParsing} onClick={runJobRadar}>
                      {isRefreshingJobs ? <CircleNotch className="spin" size={17} /> : <Sparkle size={17} weight="fill" />}
                      {isRefreshingJobs ? "发现新岗位中…" : "刷新推荐"}
                    </button>
                  </div>
                </header>

                {(!profileReady || needsResumeReimport) && (
                  <section className="resume-required-banner">
                    <FileArrowUp size={22} />
                    <div>
                      <strong>{needsResumeReimport ? "重新上传以读取简历原文" : "先上传一份现有简历"}</strong>
                      <span>{needsResumeReimport ? "旧版本只保存了文件名；重新读取后，岗位匹配才会使用真实简历内容。" : "有了主简历后，匹配分、缺口和定制建议才会基于你的真实经历。"}</span>
                    </div>
                    <button className="button primary" disabled={isResumeParsing} onClick={triggerResumePicker}>{isResumeParsing ? "正在读取…" : needsResumeReimport ? "重新上传" : "上传简历"}</button>
                  </section>
                )}

                <section className="job-filter-bar" aria-label="岗位推荐设置">
                  <label>
                    <span className="direction-filter-label">求职方向 {activeCustomDirection && <em>自定义</em>}</span>
                    <select value={targetRole} onChange={(event) => {
                      if (event.target.value === "__custom__") {
                        openCustomDirection();
                        return;
                      }
                      setTargetRole(event.target.value);
                      setSelectedDirection(event.target.value);
                      setRecommendationMeta(null);
                    }}>
                      <optgroup label="内置方向">
                        {targetDirectionOptions.map((role) => <option key={role}>{role}</option>)}
                      </optgroup>
                      {customDirections.length > 0 && (
                        <optgroup label="我的方向">
                          {customDirections.map((direction) => <option key={direction.id}>{direction.name}</option>)}
                        </optgroup>
                      )}
                      <option value="__custom__">+ 自定义方向…</option>
                    </select>
                    <CaretDown size={15} />
                  </label>
                  <div className="compact-filter-group">
                    <span>市场</span>
                    <div className="segment compact">
                      {["美国", "中国"].map((market) => <button key={market} className={targetMarket === market ? "selected" : ""} onClick={() => handleMarketChange(market)}>{market}</button>)}
                    </div>
                  </div>
                  <div className="compact-filter-group">
                    <span>岗位类型</span>
                    <div className="segment compact">
                      {["全职", "实习"].map((type) => <button key={type} className={employmentType === type ? "selected" : ""} onClick={() => handleEmploymentTypeChange(type)}>{type}</button>)}
                    </div>
                  </div>
                  <div className="filter-summary">
                    <span>简历语言</span>
                    <strong>{outputLanguage}</strong>
                    <button onClick={() => setStep("evidence")}>修改</button>
                  </div>
                  <div className="filter-summary">
                    <span>岗位来源</span>
                    <strong>{targetMarket}{employmentType}官网职位池</strong>
                    <small>本地发现批次 · 刷新会轮换岗位</small>
                  </div>
                </section>

                <section className="job-discovery-layout">
                  <div className="job-results-panel">
                    <div className="results-heading">
                      <div>
                        <strong>为你推荐</strong>
                        <span>
                          {discoveryJobs.length} 个开放岗位
                          {recommendationMeta?.market === targetMarket && recommendationMeta?.employmentType === employmentType
                            ? ` · 第 ${recommendationMeta.batch ?? 1} 批 · 新增 ${recommendationMeta.newCount ?? 0} 个${recommendationMeta.remainingCount > 0 ? ` · 池内还有 ${recommendationMeta.remainingCount} 个未看` : " · 本地池已看完"}`
                            : " · 尚未按当前市场刷新"}
                        </span>
                      </div>
                      <button onClick={() => setSearchQuery("")}><FunnelSimple size={16} />匹配度排序</button>
                    </div>
                    {discoveryJobs.length === 0 ? (
                      <div className="jobs-empty-state">
                        <MagnifyingGlass size={28} />
                        <strong>当前没有{targetMarket}{employmentType}岗位</strong>
                        <p>{employmentType === "实习" ? "本地池暂时没有可验证的实习职位；可以粘贴真实 JD 建立岗位版。" : "上传简历后刷新推荐，或直接粘贴一个目标岗位的 JD。"}</p>
                        <div><button className="button primary" onClick={runJobRadar}>载入推荐岗位</button><button className="button quiet" onClick={openImport}>粘贴 JD</button></div>
                      </div>
                    ) : (
                      <div className="job-discovery-list">
                        {discoveryJobs
                          .filter((job) => !searchQuery.trim() || [job.role, job.company, job.location, job.source].some((value) => String(value).toLowerCase().includes(searchQuery.trim().toLowerCase())))
                          .map((job) => (
                          <article className="job-discovery-card" key={job.id}>
                            <button className="job-card-main" onClick={() => selectJob(job)}>
                              <CompanyMark accent={job.accent} />
                              <span className="job-card-copy">
                                <span className="job-card-title">
                                  <strong>{job.role}</strong>
                                  <span className="job-card-badges">
                                    {job.isNew && <i>本轮新增</i>}
                                    <em>{job.score}% 匹配</em>
                                  </span>
                                </span>
                                <span>{job.company} · {job.location} · {job.employmentType}{job.type && job.type !== job.employmentType ? ` · ${job.type}` : ""}</span>
                                <p>{job.summary}</p>
                                {job.matchSignals?.length > 0 && (
                                  <span className="match-signal-row">匹配：{job.matchSignals.join(" · ")}</span>
                                )}
                                <small>{job.source} · {job.posted}</small>
                              </span>
                              <CaretRight size={18} />
                            </button>
                            <div className="job-card-actions">
                              <button onClick={() => watchJob(job)}><CalendarBlank size={15} />收藏</button>
                              <button onClick={() => openJobSource(job)}><ArrowSquareOut size={15} />申请</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <aside className="recommendation-insight">
                    <span className="insight-icon"><Sparkle size={18} weight="fill" /></span>
                    <span>推荐依据</span>
                    <h2>{selectedDirection ?? targetRole}</h2>
                    <p>根据 Master Resume 中出现的技能、经历关键词和目标方向重新评分。缺少证据的要求只会标为缺口，不会被写成经历。</p>
                    {recommendationMeta && (
                      <div className="recommendation-source">
                        <span>本次匹配来源</span>
                        <strong>{recommendationMeta.source}</strong>
                        <small>{recommendationMeta.targetRole} · {recommendationMeta.market}{recommendationMeta.employmentType ?? "全职"}</small>
                        {recommendationMeta.signals.length > 0 && <small>识别：{recommendationMeta.signals.join(" · ")}</small>}
                      </div>
                    )}
                    <div className="insight-stats">
                      <div><strong>{masterResumeVersion?.content?.length ?? 0}</strong><span>主简历字符</span></div>
                      <div><strong>{validResumeVersionCount}</strong><span>简历版本</span></div>
                    </div>
                    <button onClick={() => setStep("evidence")}>查看主简历 <CaretRight size={15} /></button>
                  </aside>
                </section>
              </div>
            )}

            {step === "applications" && (
              <div className="applications-page">
                <header className="page-heading">
                  <div>
                    <span>求职进度</span>
                    <h1>把每一次机会推进到底。</h1>
                    <p>状态、备注和下一步保存在当前浏览器草稿中，申请页最终提交仍由你本人确认。</p>
                  </div>
                  <button className="button primary" onClick={() => setStep("radar")}><MagnifyingGlass size={17} />继续找工作</button>
                </header>

                <section className="application-summary-strip">
                  {["收藏", "准备中", "已投递", "面试", "Offer"].map((status) => (
                    <article key={status}>
                      <span>{status}</span>
                      <strong>{trackedJobs.filter((job) => normalizeApplicationStatus(job.status) === status).length}</strong>
                    </article>
                  ))}
                </section>

                <section className="application-table-shell">
                  <div className="application-table-heading">
                    <div><strong>投递记录</strong><span>{trackedJobs.length} 个岗位</span></div>
                    <span>状态可以随时更新</span>
                  </div>
                  {trackedJobs.length === 0 ? (
                    <div className="jobs-empty-state">
                      <CheckCircle size={28} />
                      <strong>还没有投递记录</strong>
                      <p>收藏岗位、开始定制简历或打开申请页后，岗位会出现在这里。</p>
                      <button className="button primary" onClick={() => setStep("radar")}>浏览岗位</button>
                    </div>
                  ) : (
                    <div className="application-table" role="table" aria-label="投递记录">
                      <div className="application-table-row header" role="row">
                        <span>岗位</span><span>匹配</span><span>状态</span><span>最近更新</span><span>操作</span>
                      </div>
                      {trackedJobs.map((job) => (
                        <div className="application-table-row" role="row" key={job.id}>
                          <button className="application-job" onClick={() => selectJob(job)}>
                            <CompanyMark accent={job.accent} />
                            <span><strong>{job.role}</strong><small>{job.company} · {job.location}</small></span>
                          </button>
                          <strong>{job.score}%</strong>
                          <label className="application-status-select">
                            <StatusDot status={normalizeApplicationStatus(job.status)} />
                            <select value={normalizeApplicationStatus(job.status)} onChange={(event) => { setSelectedId(job.id); setReviewStatus(event.target.value); setApplications((current) => current.map((item) => item.id === job.id ? { ...item, status: event.target.value, statusKey: statusKeyByLabel[event.target.value], userTracked: true, updated: "刚刚更新" } : item)); }}>
                              {statusOptions.filter((status) => status !== "已归档").map((status) => <option key={status}>{status}</option>)}
                            </select>
                            <CaretDown size={14} />
                          </label>
                          <span>{job.updated}</span>
                          <div className="application-row-actions"><button aria-label={`打开 ${job.company} 申请页`} onClick={() => openJobSource(job)}><ArrowSquareOut size={16} /></button><button aria-label={`查看 ${job.company} 岗位详情`} onClick={() => selectJob(job)}><CaretRight size={16} /></button></div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {step === "review" && !selected && (
              <>
                <div className="empty-hero">
                  <span className="empty-mark">
                    <CheckCircle size={26} weight="fill" />
                  </span>
                  <p>第五步 · 申请包审核</p>
                  <h1>先选一个岗位，再进入人工审稿台。</h1>
                  <span>
                    申请包审核会展示岗位分析、匹配分、缺口报告、证据选择、简历 bullet、申请回答和提交前安全门。
                  </span>
                  <div className="empty-actions">
                    <button className="button primary" onClick={runJobRadar}>
                      <Sparkle size={18} weight="fill" />
                      查找岗位
                    </button>
                    <button className="button quiet" onClick={openImport}>
                      手动粘贴 JD
                    </button>
                  </div>
                </div>
                <div className="radar-panel">
                  <div className="radar-line muted">
                    <span>当前状态</span>
                    <strong>还没有可审核的申请包</strong>
                  </div>
                  <div className="radar-line">
                    <span>下一步</span>
                    <strong>运行岗位雷达，或手动导入目标 JD。</strong>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {isReviewReady ? (
          <aside className="action-panel">
          <h2>投递状态</h2>
          <label className="select-shell">
            <StatusDot status={reviewStatus} />
            <select value={reviewStatus} onChange={(event) => updateSelectedReviewStatus(event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <CaretDown size={16} />
          </label>

          <div className="rail-group">
            <span>最近更新</span>
            <strong>{selected.updated}</strong>
          </div>
          <div className="rail-group">
            <span>当前草稿</span>
            <strong>{selectedJobResumeVersion ? "岗位版已保存" : "尚未生成岗位版"}</strong>
          </div>
          <div className="rail-group">
            <span>使用简历</span>
            <button className="link-row" onClick={() => goToReviewTab("定制简历")}>
              <span>
                {selectedJobResumeVersion?.name ?? activeResumeVersion?.name ?? "Master Resume"}
                <small>{selectedJobResumeVersion ? "岗位版 · 继承源简历结构" : "先生成岗位版再申请"}</small>
              </span>
              <FileText size={16} />
            </button>
          </div>
          <div className="rail-group">
            <span>岗位来源</span>
            <strong>{selected.source} · {selected.score}% 匹配</strong>
          </div>
          <div className="rail-group">
            <span>职位申请</span>
            <button className="link-row" onClick={() => openJobSource(selected)}>
              <span>
                打开申请页
                <small>{selected.company} - {selected.role}</small>
              </span>
              <ArrowSquareOut size={16} />
            </button>
          </div>

          <div className="application-assist-status">
            <span>申请页填写辅助</span>
            <strong>{selectedApplicationAssist.preparedAt ? "已准备，等待用户打开申请页" : "尚未准备"}</strong>
            <p>{selectedJobResumeVersion?.name ?? "需要先保存岗位版简历"}</p>
            <button onClick={prepareApplicationAssist}>管理授权与填写资料</button>
          </div>

          <label className="notes-box">
            <span>备注</span>
            <textarea
              value={selectedNote}
              onChange={(event) => setNotesByJobId((current) => ({ ...current, [selected.id]: event.target.value }))}
            />
          </label>

          <div className="action-stack">
            <h3>下一步</h3>
            <button className="button primary wide" onClick={prepareApplicationAssist}>
              <PaperPlaneTilt size={18} />
              Computer Use 填写
            </button>
            <button className="button quiet wide" onClick={() => {
              createResumePolishDraft(`${selected.company} ${selected.role}`, selected.role);
              goToReviewTab("定制简历");
            }}>
              <Sparkle size={18} weight="fill" />
              根据 JD 定制简历
            </button>
            <button className="button quiet wide" onClick={exportResumeDraft}>
              <FileText size={18} />
              导出简历
            </button>
            <button className="button quiet wide" onClick={updateTracking}>
              <NotePencil size={18} />
              更新追踪
            </button>
            <button className="button danger wide" onClick={stopBeforeSubmit}>
              <StopCircle size={18} />
              提交前停止
            </button>
          </div>

          <div className="approval-note">
            <PaperPlaneTilt size={18} />
            <p>批准只代表可以填表。最终提交仍需要本人对公司、岗位和申请内容逐项确认。</p>
          </div>
        </aside>
        ) : null}
      </section>

      {activeEditor && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeReviewEditor}>
          <section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span>编辑当前申请包</span>
                <h2 id="edit-title">{activeEditor.title}</h2>
              </div>
              <button aria-label="关闭编辑器" onClick={closeReviewEditor}>×</button>
            </div>
            <textarea
              value={activeEditor.value}
              onChange={(event) => updateReviewEditor(event.target.value)}
              autoFocus
            />
            <div className="edit-help">
              <ShieldCheck size={17} />
              <p>这里只保存草稿，不会自动提交申请；最终投递仍需要本人确认。</p>
            </div>
            <div className="modal-actions">
              <button className="button quiet" onClick={closeReviewEditor}>取消</button>
              <button className="button primary" onClick={saveReviewEditor}>保存修改</button>
            </div>
          </section>
        </div>
      )}

      {activeEvidenceEditor && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEvidenceEditor}>
          <section className="evidence-edit-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-edit-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span>编辑 Evidence Bank</span>
                <h2 id="evidence-edit-title">事实卡片</h2>
              </div>
              <button aria-label="关闭事实编辑器" onClick={closeEvidenceEditor}>×</button>
            </div>
            <label>
              <span>标题</span>
              <input value={activeEvidenceEditor.title} onChange={(event) => updateEvidenceEditor("title", event.target.value)} />
            </label>
            <label>
              <span>事实描述</span>
              <textarea autoFocus value={activeEvidenceEditor.body} onChange={(event) => updateEvidenceEditor("body", event.target.value)} />
            </label>
            <div className="evidence-edit-grid">
              <label>
                <span>适配方向</span>
                <input value={activeEvidenceEditor.rolesText} onChange={(event) => updateEvidenceEditor("rolesText", event.target.value)} />
              </label>
              <label>
                <span>标签</span>
                <input value={activeEvidenceEditor.tagsText} onChange={(event) => updateEvidenceEditor("tagsText", event.target.value)} />
              </label>
            </div>
            <div className="evidence-edit-grid">
              <label>
                <span>指标状态</span>
                <select value={activeEvidenceEditor.metricStatus} onChange={(event) => updateEvidenceEditor("metricStatus", event.target.value)}>
                  <option>待补指标</option>
                  <option>待用户确认</option>
                  <option>已补指标</option>
                </select>
              </label>
              <label>
                <span>指标说明</span>
                <input value={activeEvidenceEditor.metricDetail} onChange={(event) => updateEvidenceEditor("metricDetail", event.target.value)} />
              </label>
            </div>
            <div className="edit-help">
              <ShieldCheck size={17} />
              <p>指标和身份相关内容先保留为待确认；AI 可以改写表达，但不能替你编数值。</p>
            </div>
            <div className="modal-actions">
              <button className="button quiet" onClick={closeEvidenceEditor}>取消</button>
              <button className="button primary" onClick={saveEvidenceEditor}>保存事实卡</button>
            </div>
          </section>
        </div>
      )}

      {isApplicationAssistOpen && selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsApplicationAssistOpen(false)}>
          <section className="application-assist-modal" role="dialog" aria-modal="true" aria-labelledby="application-assist-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span>本地档案与字段授权</span>
                <h2 id="application-assist-title">准备填写 {selected.company} 的职位申请</h2>
              </div>
              <button aria-label="关闭申请填写辅助" onClick={() => setIsApplicationAssistOpen(false)}>×</button>
            </div>

            <div className="assist-job-summary">
              <span>当前岗位</span>
              <strong>{selected.company} · {selected.role}</strong>
              <label>
                <span>用于填写的简历</span>
                <select value={activeResumeVersion?.id ?? ""} onChange={(event) => setActiveResumeVersionId(event.target.value)}>
                  {resumeVersions.map((version) => <option key={version.id} value={version.id}>{version.name} · {version.language}</option>)}
                </select>
                <CaretDown size={16} />
              </label>
            </div>

            <div className="assist-profile-grid">
              <label>
                <span>姓名</span>
                <input autoFocus value={candidateProfile.name} onChange={(event) => updateCandidateProfile("name", event.target.value)} placeholder="仅保存在当前浏览器" />
              </label>
              <label>
                <span>邮箱</span>
                <input type="email" value={candidateProfile.email} onChange={(event) => updateCandidateProfile("email", event.target.value)} placeholder="name@example.com" />
              </label>
              <label>
                <span>电话</span>
                <input type="tel" value={candidateProfile.phone} onChange={(event) => updateCandidateProfile("phone", event.target.value)} placeholder="可选" />
              </label>
              <label>
                <span>所在地</span>
                <input value={candidateProfile.location} onChange={(event) => updateCandidateProfile("location", event.target.value)} placeholder="可选" />
              </label>
              <label className="full-width">
                <span>LinkedIn / 个人主页</span>
                <input value={candidateProfile.linkedin} onChange={(event) => updateCandidateProfile("linkedin", event.target.value)} placeholder="可选" />
              </label>
            </div>

            <fieldset className="consent-list">
              <legend>本次允许使用的字段</legend>
              <label>
                <input type="checkbox" checked={applicationConsent.contact} onChange={() => toggleApplicationConsent("contact")} />
                <span><strong>联系方式</strong><small>姓名、邮箱、电话、所在地、个人主页</small></span>
              </label>
              <label>
                <input type="checkbox" checked={applicationConsent.education} onChange={() => toggleApplicationConsent("education")} />
                <span><strong>教育信息</strong><small>仅使用当前简历中的已确认教育内容</small></span>
              </label>
              <label>
                <input type="checkbox" checked={applicationConsent.experience} onChange={() => toggleApplicationConsent("experience")} />
                <span><strong>经历与项目</strong><small>仅使用当前选择的简历版本</small></span>
              </label>
            </fieldset>

            <div className="assist-safety-note">
              <ShieldCheck size={18} />
              <p>身份、签证、工作授权、薪资、保密声明和最终提交不会自动填写或提交。打开申请页后仍由你逐项确认。</p>
            </div>
            <div className="modal-actions">
              <button className="button quiet" onClick={() => setIsApplicationAssistOpen(false)}>稍后再说</button>
              <button className="button primary" disabled={!contactProfileReady || !applicationConsent.contact} onClick={launchApplicationAssist}>
                <ArrowSquareOut size={18} />
                打开申请页并开始填写
              </button>
            </div>
          </section>
        </div>
      )}

      {isCustomDirectionOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsCustomDirectionOpen(false)}>
          <section className="custom-direction-modal" role="dialog" aria-modal="true" aria-labelledby="custom-direction-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span>浏览器本地方向</span>
                <h2 id="custom-direction-title">自定义求职方向</h2>
              </div>
              <button aria-label="关闭自定义方向" onClick={() => setIsCustomDirectionOpen(false)}>×</button>
            </div>

            <p className="custom-direction-intro">名称用于简历版本和推荐标签；关键词只参与岗位发现与排序，不会被写进简历。</p>

            {customDirections.length > 0 && (
              <div className="custom-direction-list" aria-label="已有自定义方向">
                {customDirections.map((direction) => (
                  <article key={direction.id}>
                    <div>
                      <strong>{direction.name}</strong>
                      <span>{direction.keywords.join(" · ")}</span>
                    </div>
                    <button aria-label={`删除 ${direction.name}`} onClick={() => deleteCustomDirection(direction)}><Trash size={16} /></button>
                  </article>
                ))}
              </div>
            )}

            <div className="custom-direction-fields">
              <label>
                <span>方向名称</span>
                <input autoFocus value={customDirectionDraft.name} onChange={(event) => setCustomDirectionDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如：Developer Relations Engineer" />
              </label>
              <label>
                <span>岗位关键词</span>
                <textarea value={customDirectionDraft.keywords} onChange={(event) => setCustomDirectionDraft((current) => ({ ...current, keywords: event.target.value }))} placeholder="developer relations, developer experience, sdk, community" />
                <small>使用逗号、顿号或换行分隔；建议填写 3-8 个岗位描述中常见的词。</small>
              </label>
            </div>

            <div className="custom-direction-note">
              <ShieldCheck size={17} />
              <p>方向保存在当前浏览器。删除方向不会删除已经生成的方向简历或岗位版。</p>
            </div>
            <div className="modal-actions">
              <button className="button quiet" onClick={() => setIsCustomDirectionOpen(false)}>取消</button>
              <button className="button primary" onClick={saveCustomDirection}>保存并选择</button>
            </div>
          </section>
        </div>
      )}

      {isImportOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsImportOpen(false)}>
          <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-title">
              <div>
                <p>手动岗位入口</p>
                <h2 id="import-title">导入岗位 JD</h2>
              </div>
              <button className="more-button" aria-label="关闭" onClick={() => setIsImportOpen(false)}>
                <CircleNotch size={20} />
              </button>
            </div>
            <textarea
              className="jd-input"
              value={jobDescriptionDraft}
              onChange={(event) => setJobDescriptionDraft(event.target.value)}
              autoFocus
            />
            <div className="import-fields">
              <label>
                <span>公司名称</span>
                <input
                  value={importCompanyDraft}
                  onChange={(event) => setImportCompanyDraft(event.target.value)}
                  placeholder="例如：Anthropic"
                />
              </label>
              <label>
                <span>岗位名称</span>
                <input
                  value={importRoleDraft}
                  onChange={(event) => setImportRoleDraft(event.target.value)}
                  placeholder="例如：AI Agent Engineer"
                />
              </label>
              <label className="import-url-field">
                <span>职位申请链接（可选）</span>
                <input
                  type="url"
                  value={importUrlDraft}
                  onChange={(event) => setImportUrlDraft(event.target.value)}
                  placeholder="https://..."
                />
              </label>
            </div>
            <div className="modal-summary">
              <span>将生成</span>
              <strong>岗位分析、匹配分、缺口报告、已选证据、简历 bullet、申请回答</strong>
            </div>
            <div className="modal-actions">
              <button className="button quiet" onClick={() => setIsImportOpen(false)}>
                取消
              </button>
              <button className="button primary" onClick={generatePacket}>
                <Sparkle size={18} weight="fill" />
                生成申请包
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <CalendarBlank size={17} />
          {toast}
        </div>
      )}
    </main>
  );
}
