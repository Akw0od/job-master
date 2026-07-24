import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowSquareOut,
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
  FunnelSimple,
  MagnifyingGlass,
  NotePencil,
  PaperPlaneTilt,
  Plus,
  ShieldCheck,
  Sparkle,
  StopCircle,
  Trash,
  Translate,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import "./styles.css";
import { ResumeDocument } from "./components/ResumeDocument";
import { ApplicationAssistModal } from "./components/modals/ApplicationAssistModal";
import { EditModal } from "./components/modals/EditModal";
import { CustomDirectionModal, ImportJobModal } from "./components/modals/JobInputModals";
import { ResumeExportModal } from "./components/modals/ResumeExportModal";
import { jobPoolsByMarket } from "./data/jobCatalog";
import {
  applicationStatusKeyByLabel as statusKeyByLabel,
  applicationStatusOptions as statusOptions,
  buildImportedJob,
  isSpecificApplicationUrl,
  isTrackedApplication,
  normalizeApplicationStatus,
} from "./domain/applications";
import {
  analyzeJobForResume,
  getDiscoveryKey,
  getJobDiscoveryBatch,
  inferJobTrack,
  mergeJobPools,
  normalizeSearchedJobs,
  rankJobsForResume,
} from "./domain/jobDiscovery";
import { translateUiText } from "./i18n";
import { extractResumeDocument } from "./resume/resumeIO";
import { requestResumeRewrite as requestResumeRewriteFromAgent, searchOfficialJobs } from "./services/localAgent";
import { readDashboard, writeDashboard } from "./storage/dashboardStorage";
import {
  applyResumeChange,
  assessResumeStructure,
  computeResumeChanges,
  isPlaceholderResume,
  normalizeImportedResumeText,
  revertResumeChange,
  saveEditableResumeVersion,
  selectResumeVersionForDirection,
  summarizeResumeReview,
} from "./resume/resumeModel";

const tabs = ["岗位匹配", "定制简历", "追踪"];

function getSuggestionScope(suggestion) {
  if (!suggestion) return "suggestion:none";
  return `suggestion:${suggestion.id ?? [suggestion.sourceVersionId, suggestion.suggestedTarget, suggestion.jobId].filter(Boolean).join(":")}`;
}

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

function createLocalId(prefix) {
  return `${prefix}-${Date.now()}`;
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

export function App() {
  const resumeInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const reviewSectionRefs = useRef({});
  const stageScrollRef = useRef(null);
  const reviewCanvasRef = useRef(null);
  const [savedDashboard] = useState(readDashboard);
  const [uiLanguage, setUiLanguage] = useState(() => savedDashboard.uiLanguage ?? "zh");
  const t = useMemo(() => (value) => translateUiText(value, uiLanguage), [uiLanguage]);
  const previousAppliedCountRef = useRef(
    (savedDashboard.applications ?? []).filter((job) => ["已投递", "面试", "Offer", "未通过"].includes(normalizeApplicationStatus(job.status))).length,
  );
  const [profileReady, setProfileReady] = useState(() => savedDashboard.profileReady ?? false);
  const [selectedDirection, setSelectedDirection] = useState(() => savedDashboard.selectedDirection ?? null);
  const [applications, setApplications] = useState(() => savedDashboard.applications ?? []);
  const [selectedId, setSelectedId] = useState(() => savedDashboard.selectedId ?? null);
  const [step, setStep] = useState(() => {
    if (savedDashboard.step === "review" && savedDashboard.selectedId) return "review";
    if (savedDashboard.step === "evidence") return "evidence";
    if (savedDashboard.step === "applications") return "applications";
    return "radar";
  });
  const [activeTab, setActiveTab] = useState("岗位匹配");
  const [reviewStatus, setReviewStatus] = useState(() => normalizeApplicationStatus(savedDashboard.reviewStatus ?? "准备中"));
  const [toast, setToast] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [resumeFile, setResumeFile] = useState(() => savedDashboard.resumeFile ?? null);
  const [isResumeParsing, setIsResumeParsing] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState(() => savedDashboard.reviewDrafts ?? {});
  const [notesByJobId, setNotesByJobId] = useState(() => savedDashboard.notesByJobId ?? {});
  const [activeEditor, setActiveEditor] = useState(null);
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
  const [jobDescriptionDraft, setJobDescriptionDraft] = useState("");
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
  const [resumeVersions, setResumeVersions] = useState(() => savedDashboard.resumeVersions ?? []);
  const [activeResumeVersionId, setActiveResumeVersionId] = useState(() => savedDashboard.activeResumeVersionId ?? null);
  const [activeResumeTab, setActiveResumeTab] = useState(() => {
    if (savedDashboard.activeResumeTab) return savedDashboard.activeResumeTab;
    const savedActiveVersion = (savedDashboard.resumeVersions ?? []).find((version) => version.id === savedDashboard.activeResumeVersionId);
    return savedActiveVersion?.layer === "direction" ? savedActiveVersion.target : "master";
  });
  const [isResumeEditing, setIsResumeEditing] = useState(false);
  const [resumeEditDraft, setResumeEditDraft] = useState("");
  const [isResumeReviewCollapsed, setIsResumeReviewCollapsed] = useState(false);
  const [isDirectionMenuOpen, setIsDirectionMenuOpen] = useState(false);
  const [resumeChangeDecisions, setResumeChangeDecisions] = useState(() => savedDashboard.resumeChangeDecisions ?? {});
  const [activeResumeChangeIndex, setActiveResumeChangeIndex] = useState(null);
  const [resumePreviewMode, setResumePreviewMode] = useState("final");
  const [resumePageSize, setResumePageSize] = useState(() => savedDashboard.resumePageSize ?? "A4");
  const [printResumeVersion, setPrintResumeVersion] = useState(null);
  const [isPrintRequested, setIsPrintRequested] = useState(false);
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
  const [liveJobsByDiscoveryKey, setLiveJobsByDiscoveryKey] = useState(() => savedDashboard.liveJobsByDiscoveryKey ?? {});
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
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [agentSuggestion, setAgentSuggestion] = useState(() => savedDashboard.agentSuggestion ?? null);

  const activeJobPoolsByMarket = useMemo(
    () => mergeJobPools(jobPoolsByMarket, liveJobsByDiscoveryKey),
    [liveJobsByDiscoveryKey],
  );
  const allActiveJobPool = useMemo(
    () => Object.values(activeJobPoolsByMarket).flat(),
    [activeJobPoolsByMarket],
  );
  const selected = applications.find((job) => job.id === selectedId) ?? applications[0];
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
  const appliedJobs = applications.filter((job) => ["已投递", "面试", "Offer", "未通过"].includes(normalizeApplicationStatus(job.status)));
  const trackedJobs = applications.filter(isTrackedApplication);
  const discoveryJobs = applications.filter((job) => (
    job.stage !== "已归档"
    && job.market === targetMarket
    && (job.employmentType ?? "全职") === employmentType
    && !["已投递", "面试", "Offer", "未通过"].includes(normalizeApplicationStatus(job.status))
  ));
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredDiscoveryJobs = discoveryJobs.filter((job) => (
    !normalizedSearchQuery
    || [job.role, job.company, job.location, job.source]
      .some((value) => String(value).toLowerCase().includes(normalizedSearchQuery))
  ));
  const primaryNavigation = [
    ["radar", t("找工作"), t("根据简历推荐和搜索岗位"), MagnifyingGlass, discoveryJobs.length],
    ["evidence", t("我的简历"), t("原版、方向版与岗位版"), FileText, validResumeVersionCount],
    ["applications", t("求职进度"), t("收藏、投递与面试进度"), CheckCircle, trackedJobs.length],
  ];
  const availableTargetDirections = [
    ...targetDirectionOptions,
    ...customDirections.map((direction) => direction.name),
  ];
  const activeCustomDirection = customDirections.find((direction) => direction.name === targetRole);

  const selectedDrafts = selected ? reviewDrafts[selected.id] ?? {} : {};
  const masterResumeVersion = resumeVersions.find((version) => version.id === "master-resume" && !isPlaceholderResume(version.content));
  const masterResumeText = masterResumeVersion?.content?.toLowerCase() ?? "";
  const selectedResumeEvidence = selected?.matchedEvidence
    ?? selected?.evidence?.filter((item) => masterResumeText.includes(item.toLowerCase()))
    ?? [];
  const canGenerateApplicationMaterials = Boolean(masterResumeVersion && selected);
  const evidenceText = selectedDrafts.evidence
    ?? selectedResumeEvidence.map((item) => `${item} — 来自 Master Resume，可作为岗位版改写依据，仍需逐条审核。`).join("\n")
    ?? "";
  const evidenceLines = evidenceText.split("\n").map((line) => line.trim()).filter(Boolean);
  const defaultTemplateId = outputLanguage === "中文" ? "cn-tech" : outputLanguage === "中英双语" ? "apple-clean" : "ats-en";
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
  const agentSuggestionScope = getSuggestionScope(agentSuggestion);
  const jobSuggestionScope = getSuggestionScope(activeJobSuggestion);
  const jobTailoringPreviewText = activeJobSuggestion
    ? activeJobSuggestion.reviewedResume ?? activeJobSuggestion.sourceText ?? ""
    : selectedJobResumeVersion?.content
    ?? activeResumeVersion?.content
    ?? masterResumeVersion?.content
    ?? "";
  const jobTailoringSourceText = activeJobSuggestion?.sourceText
    ?? selectedJobResumeVersion?.baseContent
    ?? resumeVersions.find((version) => version.id === selectedJobResumeVersion?.parentVersionId)?.content
    ?? masterResumeVersion?.content
    ?? "";
  const jobTailoringChanges = activeJobSuggestion?.suggestedResume || selectedJobResumeVersion?.content
    ? computeResumeChanges(jobTailoringSourceText, activeJobSuggestion?.suggestedResume ?? jobTailoringPreviewText)
    : [];
  const indexedJobTailoringChanges = jobTailoringChanges.map((change, index) => ({ ...change, reviewIndex: index }));
  const jobTailoringDisplayText = resumePreviewMode === "compare" && jobTailoringChanges.length
    ? jobTailoringSourceText
    : jobTailoringPreviewText;
  const jobTailoringDisplayChanges = resumePreviewMode === "compare" ? indexedJobTailoringChanges : [];
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
  const agentSuggestionReview = summarizeResumeReview(
    agentSuggestionChanges,
    resumeChangeDecisions,
    agentSuggestionScope,
  );
  const jobSuggestionReview = summarizeResumeReview(
    jobTailoringChanges,
    resumeChangeDecisions,
    jobSuggestionScope,
  );
  const resumePreviewText = agentSuggestion
    ? agentSuggestion.reviewedResume ?? agentSuggestion.sourceText ?? activeResumeText
    : activeResumeText;
  const indexedResumePreviewChanges = reviewableResumeChanges.map((change, index) => ({ ...change, reviewIndex: index }));
  const resumeDisplayText = resumePreviewMode === "compare" && reviewableResumeChanges.length
    ? suggestionSourceText
    : resumePreviewText;
  const resumeDisplayChanges = resumePreviewMode === "compare" ? indexedResumePreviewChanges : [];
  const activeResumeDocumentMeta = activeResumeVersion?.documentMeta
    ?? masterResumeVersion?.documentMeta
    ?? resumeFile?.documentMeta
    ?? {};
  const jobResumeDocumentMeta = activeJobSuggestion?.sourceDocumentMeta
    ?? selectedJobResumeVersion?.documentMeta
    ?? activeResumeDocumentMeta;
  const directionResumeTabs = [
    ...coreResumeDirections,
    ...customDirections.map((direction) => ({ label: direction.name, role: direction.name, custom: true })),
  ].map((direction) => ({
    ...direction,
    version: [...usableResumeVersions].reverse().find((version) => version.target === direction.role),
  }));
  const activeResumeTabId = activeResumeTab === "master"
    ? "resume-tab-master"
    : `resume-tab-direction-${Math.max(0, directionResumeTabs.findIndex((direction) => direction.role === activeResumeTab))}`;
  const activeResumeTemplate = resumeTemplates.find((template) => template.id === activeResumeVersion?.templateId)
    ?? resumeTemplates.find((template) => template.id === defaultTemplateId)
    ?? resumeTemplates[0];
  const printResumeTemplate = resumeTemplates.find((template) => template.id === printResumeVersion?.templateId)
    ?? activeResumeTemplate;
  const legacyCompletedNote = "整体匹配度较高。简历和申请回答已完成定制，可以进入最终人工审核。";
  const savedSelectedNote = selected ? notesByJobId[selected.id] : "";
  const selectedNote = selected
    ? savedSelectedNote && savedSelectedNote !== legacyCompletedNote
      ? savedSelectedNote
      : selectedJobResumeVersion
        ? t("岗位版简历已保存。下一步请审核改动、打开官方申请页，并在提交前确认全部字段。")
        : t("尚未生成岗位版简历。先核对匹配依据，再从当前简历创建可审核的岗位版本。")
    : "";
  const selectedApplicationAssist = selected ? applicationAssists[selected.id] ?? {} : {};
  const contactProfileReady = Boolean(candidateProfile.name.trim() && candidateProfile.email.trim());

  function applyRankedRecommendations(rankedJobs) {
    const poolIds = new Set(allActiveJobPool.map((job) => job.id));
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

  function saveRecommendationMeta(
    source,
    rankedJobs,
    market = targetMarket,
    jobType = employmentType,
    batch = 1,
    newCount = rankedJobs.length,
    remainingCount = 0,
    role = targetRole,
    discoveryMode = "local",
  ) {
    const signals = [...new Set(rankedJobs.flatMap((job) => job.matchSignals ?? []))].slice(0, 6);
    setRecommendationMeta({
      source,
      targetRole: role,
      market,
      employmentType: jobType,
      matchedAt: "刚刚",
      signals,
      batch,
      newCount,
      remainingCount,
      discoveryMode,
    });
  }

  function handleTargetRoleChange(role) {
    setTargetRole(role);
    setSelectedDirection(role);
    if (!masterResumeVersion?.content?.trim()) {
      setRecommendationMeta(null);
      return;
    }
    const currentJobs = applications.filter((job) => (
      job.stage === "进行中"
      && job.market === targetMarket
      && (job.employmentType ?? "全职") === employmentType
    ));
    const rerankedJobs = rankJobsForResume(currentJobs, masterResumeVersion.content, role, customDirections);
    const rankedById = new Map(rerankedJobs.map((job) => [job.id, job]));
    setApplications((current) => current.map((job) => rankedById.get(job.id) ?? job));
    saveRecommendationMeta(
      resumeFile?.name ?? masterResumeVersion.name,
      rerankedJobs,
      targetMarket,
      employmentType,
      recommendationMeta?.batch ?? 1,
      0,
      recommendationMeta?.remainingCount ?? 0,
      role,
      "local",
    );
  }

  async function runJobRadar(marketOverride, options = {}) {
    const market = typeof marketOverride === "string" ? marketOverride : targetMarket;
    const requestedEmploymentType = options.employmentTypeOverride ?? employmentType;
    const discoveryKey = getDiscoveryKey(market, requestedEmploymentType);
    const shouldSearchLive = options.liveSearch !== false;
    if (!profileReady || needsResumeReimport || !masterResumeVersion?.content?.trim()) {
      setStep("evidence");
      setToast("先重新上传并读取 Master Resume，再刷新岗位推荐。");
      return;
    }
    if (isRefreshingJobs) return;

    setIsRefreshingJobs(true);
    setToast(shouldSearchLive
      ? `正在搜索${market}${requestedEmploymentType}官网职位，并根据 ${masterResumeVersion.name} 本地重新匹配…`
      : `正在载入${market}${requestedEmploymentType}本地职位缓存，并重新计算匹配…`);
    try {
      let poolsForRun = activeJobPoolsByMarket;
      let liveSearchResult = null;
      let liveSearchError = "";
      if (shouldSearchLive) {
        try {
          const customKeywords = customDirections.find((direction) => direction.name === targetRole)?.keywords ?? [];
          liveSearchResult = await searchOfficialJobs({
            market,
            employmentType: requestedEmploymentType,
            targetRole,
            keywords: customKeywords,
          });
          const normalizedLiveJobs = normalizeSearchedJobs(liveSearchResult, market, requestedEmploymentType);
          const nextLiveJobs = {
            ...liveJobsByDiscoveryKey,
            [discoveryKey]: normalizedLiveJobs,
          };
          setLiveJobsByDiscoveryKey(nextLiveJobs);
          poolsForRun = mergeJobPools(jobPoolsByMarket, nextLiveJobs);
        } catch (error) {
          liveSearchError = error.message;
        }
      }

      const cycle = discoveryCycles[discoveryKey] ?? 0;
      const seenIds = seenJobIdsByMarket[discoveryKey] ?? [];
      const batch = getJobDiscoveryBatch(poolsForRun, market, requestedEmploymentType, cycle, 6, seenIds);
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
      const discoverableCount = (poolsForRun[market] ?? []).filter((job) => job.stage === "进行中" && job.employmentType === requestedEmploymentType).length;
      const remainingCount = Math.max(0, discoverableCount - nextSeenIds.length);
      applyRankedRecommendations(rankedJobs);
      setDiscoveryCycles((current) => ({ ...current, [discoveryKey]: cycle + 1 }));
      setSeenJobIdsByMarket((current) => ({ ...current, [discoveryKey]: nextSeenIds }));
      saveRecommendationMeta(
        liveSearchResult?.jobs?.length ? "实时官网搜索" : resumeFile?.name ?? masterResumeVersion.name,
        rankedJobs,
        market,
        requestedEmploymentType,
        cycle + 1,
        newCount,
        remainingCount,
        targetRole,
        liveSearchResult?.jobs?.length ? "live" : "local",
      );
      setSelectedDirection(targetRole);
      if (options.navigate !== false) setStep("radar");
      if (liveSearchError) {
        setToast(`官网实时搜索失败：${liveSearchError}。已保留本地缓存，没有把旧岗位标成新发现。`);
      } else if (shouldSearchLive && liveSearchResult && liveSearchResult.jobs.length === 0) {
        setToast(`本次没有找到已通过链接核验的${market}${requestedEmploymentType}岗位；本地待核验职位仍保留供参考。`);
      } else if (options.reason === "application-backfill" && newCount > 0) {
        setToast(`已记录投递，并自动补充 ${newCount} 个未看过的${market}${requestedEmploymentType}岗位。`);
      } else if (newCount > 0) {
        const verifiedCount = rankedJobs.filter((job) => job.verificationStatus === "verified").length;
        setToast(`已刷新${market}${requestedEmploymentType}岗位：展示 ${rankedJobs.length} 个，本轮新增 ${newCount} 个${verifiedCount ? `，其中 ${verifiedCount} 个官网链接已核验` : ""}。`);
      } else if (discoverableCount === 0) {
        setToast(`当前没有可验证的${market}${requestedEmploymentType}岗位，可粘贴真实 JD 建立岗位版。`);
      } else {
        setToast(`${market}${requestedEmploymentType}岗位缓存已看完；本次只重新计算匹配度，没有伪装成新增岗位。`);
      }
    } finally {
      setIsRefreshingJobs(false);
    }
  }

  function focusResumeChange(index, scope) {
    setResumePreviewMode("compare");
    setActiveResumeChangeIndex(index);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.querySelector(`[data-resume-change-index="${index}"][data-resume-change-scope="${scope}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function handleResumeTabKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabButtons = [...event.currentTarget.parentElement.querySelectorAll('[role="tab"]')];
    const currentIndex = tabButtons.indexOf(event.currentTarget);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabButtons.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabButtons.length) % tabButtons.length;
    tabButtons[nextIndex]?.focus();
    tabButtons[nextIndex]?.click();
  }

  function openCustomDirection() {
    setCustomDirectionDraft({ name: "", keywords: "" });
    setIsCustomDirectionOpen(true);
  }

  function saveCustomDirection() {
    const name = customDirectionDraft.name.trim();
    const keywords = [...new Set(customDirectionDraft.keywords
      .split(/[,，、/\n]+/)
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
    const direction = { id: createLocalId("custom-direction"), name, keywords };
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

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key !== "Escape") return;
      if (activeEditor) {
        if (activeEditor.value !== activeEditor.originalValue) {
          setToast("编辑内容未保存，已放弃这次修改。");
        }
        setActiveEditor(null);
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
  }, [activeEditor, isImportOpen, isApplicationAssistOpen, isCustomDirectionOpen]);

  useEffect(() => {
    document.documentElement.lang = uiLanguage === "en" ? "en" : "zh-CN";
    document.title = uiLanguage === "en" ? "Job Master Dashboard" : "Job Master 求职审稿台";
  }, [uiLanguage]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!printResumeVersion || !isPrintRequested) return undefined;
    const previousTitle = document.title;
    const safeTitle = (printResumeVersion.name ?? "job-master-resume")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .trim() || "job-master-resume";
    const pageStyle = document.createElement("style");
    pageStyle.dataset.resumePrintPage = "true";
    pageStyle.textContent = `@page { size: ${resumePageSize === "Letter" ? "Letter" : "A4"} portrait; margin: 0; }`;
    document.head.appendChild(pageStyle);
    document.title = safeTitle;
    document.body.classList.add("resume-printing");

    let completed = false;
    let fallbackTimer;
    const finishPrint = () => {
      if (completed) return;
      completed = true;
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("afterprint", finishPrint);
      document.body.classList.remove("resume-printing");
      pageStyle.remove();
      document.title = previousTitle;
      setIsPrintRequested(false);
      setPrintResumeVersion(null);
      setIsExportingPdf(false);
      setToast("打印窗口已关闭；选择“存储为 PDF”即可得到可选择文字的简历文件。");
    };

    window.addEventListener("afterprint", finishPrint);
    const printTimer = window.setTimeout(() => {
      try {
        window.print();
      } finally {
        if (!completed) fallbackTimer = window.setTimeout(finishPrint, 600);
      }
    }, 120);

    return () => {
      window.clearTimeout(printTimer);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("afterprint", finishPrint);
      document.body.classList.remove("resume-printing");
      pageStyle.remove();
      document.title = previousTitle;
    };
  }, [isPrintRequested, printResumeVersion, resumePageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        writeDashboard({
          uiLanguage,
          profileReady,
          selectedDirection,
          applications,
          selectedId,
          step,
          reviewStatus,
          resumeFile,
          reviewDrafts,
          notesByJobId,
          targetMarket,
          employmentType,
          outputLanguage,
          targetRole,
          customDirections,
          resumeVersions,
          activeResumeVersionId,
          activeResumeTab,
          resumePageSize,
          candidateProfile,
          applicationConsent,
          applicationAssists,
          discoveryCycles,
          seenJobIdsByMarket,
          liveJobsByDiscoveryKey,
          recommendationMeta,
          agentSuggestion,
          resumeChangeDecisions,
        });
      } catch {
        // The prototype remains usable when a privacy mode blocks local persistence.
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    applications, notesByJobId, uiLanguage,
    profileReady, resumeFile, reviewDrafts, reviewStatus, selectedDirection,
    selectedId, step, targetMarket, employmentType, outputLanguage, targetRole, customDirections,
    resumeVersions, activeResumeVersionId, activeResumeTab, resumePageSize,
    candidateProfile, applicationConsent, applicationAssists, discoveryCycles, seenJobIdsByMarket,
    liveJobsByDiscoveryKey,
    recommendationMeta, agentSuggestion, resumeChangeDecisions,
  ]);

  useEffect(() => {
    requestAnimationFrame(() => stageScrollRef.current?.scrollTo({ top: 0 }));
  }, [step]);

  useEffect(() => {
    const canonicalById = new Map(allActiveJobPool.map((job) => [job.id, job]));
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
  }, [allActiveJobPool]);

  useEffect(() => {
    if (!masterResumeVersion?.content?.trim()) return;
    setApplications((current) => current.map((job) => (
      job.stage === "进行中"
        ? analyzeJobForResume(job, masterResumeVersion.content, targetRole, customDirections)
        : job
    )));
  }, [masterResumeVersion?.content, targetRole, customDirections]);

  useEffect(() => {
    if (step !== "radar" || isRefreshingJobs || !masterResumeVersion?.content?.trim()) return;
    const marketPoolIds = new Set((activeJobPoolsByMarket[targetMarket] ?? [])
      .filter((job) => job.employmentType === employmentType)
      .map((job) => job.id));
    const hasCurrentMarketJobs = applications.some((job) => marketPoolIds.has(job.id) && job.stage === "进行中");
    if (!hasCurrentMarketJobs) {
      runJobRadar(targetMarket, {
        navigate: false,
        reason: "market-sync",
        employmentTypeOverride: employmentType,
        liveSearch: false,
      });
    }
    // This effect intentionally invokes the latest refresh routine only when the cache key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMarket, employmentType, step, masterResumeVersion?.id, activeJobPoolsByMarket]);

  useEffect(() => {
    const currentAppliedCount = appliedJobs.length;
    const previousAppliedCount = previousAppliedCountRef.current;
    previousAppliedCountRef.current = currentAppliedCount;
    if (currentAppliedCount <= previousAppliedCount || !masterResumeVersion?.content?.trim()) return;
    runJobRadar(targetMarket, { navigate: false, reason: "application-backfill", liveSearch: false });
    // Backfill is keyed to the applied-count transition; other values are read at that transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedJobs.length]);

  useEffect(() => {
    if (activeResumeVersion?.id && activeResumeVersionId !== activeResumeVersion.id) {
      setActiveResumeVersionId(activeResumeVersion.id);
    }
  }, [activeResumeVersion?.id, activeResumeVersionId]);

  useEffect(() => {
    if (!agentSuggestion?.jobId) return;
    const suggestionJob = applications.find((job) => job.id === agentSuggestion.jobId);
    if (!suggestionJob || suggestionJob.stage === "已归档") {
      setAgentSuggestion(null);
    }
  }, [agentSuggestion?.jobId, applications]);

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

  async function requestResumeRewrite(messageText, options = {}) {
    const message = String(messageText).trim();
    if (!message || isAgentThinking) return false;
    const sourceVersion = options.sourceVersion ?? activeResumeVersion ?? masterResumeVersion;
    const sourceText = options.resumeText ?? sourceVersion?.content ?? "";
    if (!sourceText.trim() || isPlaceholderResume(sourceText)) {
      setToast("先上传你的原版简历。没有 Master Resume 时不会生成替代内容。");
      triggerResumePicker();
      return false;
    }
    setIsAgentThinking(true);
    try {
      const result = await requestResumeRewriteFromAgent({
        message,
        resumeText: sourceText,
        market: targetMarket,
        language: outputLanguage,
        targetRole: options.targetRole ?? targetRole,
        jdText: options.jdText ?? "",
      });
      setAgentSuggestion({
        ...result,
        id: createLocalId("suggestion"),
        sourceText,
        reviewedResume: sourceText,
        sourceVersionId: sourceVersion?.id ?? "master-resume",
        sourceDocumentMeta: sourceVersion?.documentMeta ?? masterResumeVersion?.documentMeta ?? {},
        suggestedName: options.suggestedName ?? `${targetRole} · Codex 建议版`,
        suggestedTarget: options.suggestedTarget ?? targetRole,
        layer: options.layer ?? "direction",
        jobId: options.jobId,
        jdText: options.jdText ?? "",
        jdHash: options.jdHash ?? "",
        jdSource: options.jdSource ?? "",
      });
      setResumePreviewMode("compare");
      setToast("本地 Agent 已生成完整简历建议，确认后可保存为新版本。");
      return true;
    } catch (error) {
      setToast(`${options.layer === "job" ? "岗位版" : "方向版"}生成失败：${error.message}`);
      return false;
    } finally {
      setIsAgentThinking(false);
    }
  }

  function applyLocalAgentSuggestion() {
    if (!agentSuggestion?.suggestedResume) return;
    const suggestionScope = getSuggestionScope(agentSuggestion);
    const suggestionChanges = computeResumeChanges(agentSuggestion.sourceText, agentSuggestion.suggestedResume);
    const reviewSummary = summarizeResumeReview(suggestionChanges, resumeChangeDecisions, suggestionScope);
    if (suggestionChanges.length === 0) {
      setToast("这次建议没有产生可保存的文字改动。");
      return;
    }
    if (reviewSummary.pending > 0) {
      setToast(`还有 ${reviewSummary.pending} 处改动未审核；请逐条接受或拒绝后再保存。`);
      return;
    }
    if (reviewSummary.accepted === 0) {
      setToast("请先接受至少一处绿色改写，再保存版本。");
      return;
    }
    const id = createLocalId("agent-resume");
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
        documentMeta: agentSuggestion.sourceDocumentMeta ?? masterResumeVersion?.documentMeta ?? {},
        content: agentSuggestion.reviewedResume ?? agentSuggestion.sourceText,
        baseContent: agentSuggestion.sourceText ?? masterResumeVersion?.content ?? "",
        parentVersionId: agentSuggestion.sourceVersionId ?? masterResumeVersion?.id,
        jdText: isJobVersion ? agentSuggestion.jdText : undefined,
        jdHash: isJobVersion ? agentSuggestion.jdHash : undefined,
        jdSource: isJobVersion ? agentSuggestion.jdSource : undefined,
        reviewedAt: new Date().toISOString(),
        reviewSummary: {
          accepted: reviewSummary.accepted,
          rejected: reviewSummary.rejected,
          total: suggestionChanges.length,
        },
        updated: "刚刚由本地 Agent 生成",
        status: agentSuggestion.requiresConfirmation?.length ? "待事实确认" : "已审核保存",
      },
    ]);
    setActiveResumeVersionId(id);
    if (!isJobVersion) setActiveResumeTab(agentSuggestion.suggestedTarget ?? targetRole);
    setAgentSuggestion(null);
    setResumeChangeDecisions((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(`${suggestionScope}:`)),
    ));
    setIsResumeEditing(false);
    setResumePreviewMode("final");
    setToast(`已将 Codex 建议保存为${isJobVersion ? "岗位版" : "方向版"}，原版本保持不变。`);
  }

  async function createResumePolishDraft(jobOrTitle, roleOverride = targetRole) {
    const job = jobOrTitle && typeof jobOrTitle === "object"
      ? jobOrTitle
      : typeof jobOrTitle === "string"
        ? selected
        : null;
    const normalizedJobTitle = job
      ? `${job.company} ${job.role}`
      : typeof jobOrTitle === "string"
        ? jobOrTitle
        : undefined;
    if (!masterResumeVersion?.content) {
      setToast("先上传你的原版简历。岗位定制不会再用演示经历代替。");
      triggerResumePicker();
      return false;
    }
    if (job && String(job.jdText ?? "").trim().length < 80) {
      setToast("这个岗位还没有可用于定制的完整 JD。请粘贴职位描述后再生成岗位版。");
      openImport(job);
      return false;
    }
    const target = normalizedJobTitle ?? roleOverride;
    const sourceVersion = normalizedJobTitle
      ? activeResumeVersion ?? masterResumeVersion
      : masterResumeVersion;
    if (normalizedJobTitle) {
      if (job?.id) {
        setSelectedId(job.id);
        setReviewStatus("准备中");
        setApplications((current) => current.map((item) => (
          item.id === job.id
            ? { ...item, userTracked: true, status: "准备中", statusKey: "tailoring", updated: "正在根据 JD 定制" }
            : item
        )));
      }
      setStep("review");
      setActiveTab("定制简历");
    } else {
      setStep("evidence");
    }
    setToast(`正在从你的 Master Resume 生成 ${target} 定制建议…`);
    return requestResumeRewrite(
      normalizedJobTitle
        ? `请严格根据随请求提供的 ${normalizedJobTitle} 职位描述微调这份简历。必须保留原版的章节结构、模板、姓名、联系方式、教育、经历、项目和日期；只允许改写 bullet、调整章节内部顺序，或在原版已有经历和项目之间进行取舍，不添加任何原文没有的公司、项目、技能或指标。`
        : `请按 ${targetMarket} 市场、${outputLanguage} 和 ${roleOverride} 方向改写这份简历。必须保持原版章节结构和模板不变；只允许改写现有内容、调整章节内部 bullet 顺序，或从原版已有经历和项目中进行取舍。不得添加原文没有的事实、指标、公司、项目或技能。`,
      {
        sourceVersion,
        resumeText: sourceVersion.content,
        suggestedName: normalizedJobTitle ?? roleOverride,
        suggestedTarget: target,
        layer: normalizedJobTitle ? "job" : "direction",
        jobId: normalizedJobTitle ? job?.id ?? selected?.id : undefined,
        targetRole: job?.role ?? roleOverride,
        jdText: job?.jdText ?? "",
        jdHash: job?.jdHash ?? "",
        jdSource: job?.jdSource ?? "",
      },
    );
  }

  function selectDirectionResume(role) {
    setTargetRole(role);
    setSelectedDirection(role);
    setRecommendationMeta(null);
    setActiveResumeTab(role);
    setIsDirectionMenuOpen(false);
    const selection = selectResumeVersionForDirection(usableResumeVersions, role);
    if (!selection.hasSavedVersion && !masterResumeVersion) {
      setToast("先上传原版简历，再创建方向版本。");
      triggerResumePicker();
      return;
    }
    setActiveResumeVersionId(selection.versionId);
    setIsResumeEditing(false);
    setResumeEditDraft("");
    setAgentSuggestion(null);
    setResumePreviewMode("final");
    setToast(selection.hasSavedVersion
      ? `已切换到 ${role} 方向版。`
      : `已选择 ${role}；可手动编辑或按方向优化。`);
  }

  function selectMasterResume() {
    if (!masterResumeVersion) {
      triggerResumePicker();
      return;
    }
    setActiveResumeVersionId(masterResumeVersion.id);
    setActiveResumeTab("master");
    setIsResumeEditing(false);
    setResumeEditDraft("");
    setAgentSuggestion(null);
    setResumePreviewMode("final");
    setToast("正在查看锁定的上传原版。");
  }

  function acceptResumeChange(change, index) {
    if (!agentSuggestion) return;
    const scope = getSuggestionScope(agentSuggestion);
    setAgentSuggestion((current) => current ? {
      ...current,
      reviewedResume: applyResumeChange(current.reviewedResume ?? current.sourceText, change),
    } : current);
    setResumeChangeDecisions((current) => ({ ...current, [`${scope}:${index}`]: "accepted" }));
    setToast(`已接受第 ${index + 1} 处修改。`);
  }

  function rejectResumeChange(change, index) {
    if (!agentSuggestion) return;
    const scope = getSuggestionScope(agentSuggestion);
    setAgentSuggestion((current) => current ? {
      ...current,
      reviewedResume: revertResumeChange(current.reviewedResume ?? current.sourceText, change),
    } : current);
    setResumeChangeDecisions((current) => ({ ...current, [`${scope}:${index}`]: "rejected" }));
    setToast(`已拒绝第 ${index + 1} 处修改，保留对应原文。`);
  }

  function beginResumeEditing() {
    if (!activeResumeVersion) {
      triggerResumePicker();
      return;
    }
    if (activeResumeVersion.id !== "master-resume") {
      setResumeEditDraft(activeResumeVersion.content);
      setIsResumeEditing(true);
      setResumePreviewMode("final");
      return;
    }
    const directionTarget = activeResumeTab === "master" ? targetRole : activeResumeTab;
    const id = createLocalId("manual-resume");
    setResumeVersions((current) => [...current, {
      ...activeResumeVersion,
      id,
      name: `${directionTarget} · 手动版`,
      target: directionTarget,
      layer: "direction",
      baseContent: activeResumeVersion.content,
      parentVersionId: activeResumeVersion.id,
      updated: "刚刚创建",
      status: "编辑中",
    }]);
    setActiveResumeVersionId(id);
    setActiveResumeTab(directionTarget);
    setResumeEditDraft(activeResumeVersion.content);
    setIsResumeEditing(true);
    setResumePreviewMode("final");
    setToast(`已创建 ${directionTarget} 手动版；上传原文仍保持只读。`);
  }

  function finishResumeEditing() {
    if (!activeResumeVersion || activeResumeVersion.id === "master-resume") return;
    setResumeVersions((current) => saveEditableResumeVersion(current, activeResumeVersion.id, resumeEditDraft));
    setIsResumeEditing(false);
    setResumeEditDraft("");
    setResumePreviewMode("final");
    setToast("手动编辑已保存到当前浏览器草稿。");
  }

  function startResumePdfExport(version = activeResumeVersion) {
    if (!version?.content?.trim()) {
      setToast("没有可导出的简历内容。");
      return;
    }
    if (version.id === activeResumeVersion?.id && isResumeEditing) {
      setToast("请先完成编辑并保存当前版本，再导出 PDF。");
      return;
    }
    if (version.id === activeResumeVersion?.id && agentSuggestion) {
      setToast("请先逐条审核并保存这次建议，再导出成品 PDF。");
      return;
    }
    setPrintResumeVersion({
      ...version,
      documentMeta: version.documentMeta ?? masterResumeVersion?.documentMeta ?? resumeFile?.documentMeta ?? {},
    });
    setIsPrintRequested(false);
    setToast(`已准备 ${resumePageSize} 可选择文字的 PDF 打印版；请确认纸张和版本。`);
  }

  function closeResumeExport() {
    if (isPrintRequested) return;
    setPrintResumeVersion(null);
    setIsExportingPdf(false);
  }

  function confirmResumePrint() {
    if (!printResumeVersion) return;
    setIsExportingPdf(true);
    setIsPrintRequested(true);
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
      const extractedDocument = await extractResumeDocument(file);
      const importedText = normalizeImportedResumeText(extractedDocument.text);
      if (importedText.length < 80) {
        throw new Error("没有读取到足够文字。这个 PDF 可能是扫描件，请上传带文本层的 PDF、DOCX 或 TXT。");
      }
      const structureAssessment = assessResumeStructure(importedText, extractedDocument.documentMeta);
      const documentMeta = {
        ...extractedDocument.documentMeta,
        ...structureAssessment,
      };

      const masterVersion = {
        id: "master-resume",
        name: "Master Resume",
        target: "上传原文",
        layer: "master",
        language: /[\u3400-\u9fff]/.test(importedText) ? "自动识别" : "英文",
        templateId: defaultTemplateId,
        documentMeta,
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
        documentMeta,
      });
      setResumeVersions([masterVersion]);
      const discoveryKey = getDiscoveryKey(targetMarket, employmentType);
      const seenIds = seenJobIdsByMarket[discoveryKey] ?? [];
      const initialBatch = getJobDiscoveryBatch(activeJobPoolsByMarket, targetMarket, employmentType, 0, 6, seenIds);
      const rankedJobs = rankJobsForResume(initialBatch, importedText, targetRole, customDirections).map((job) => ({
        ...job,
        isNew: !seenIds.includes(job.id),
        updated: !seenIds.includes(job.id) ? "刚刚发现并匹配" : "刚刚重新匹配",
      }));
      const nextSeenIds = [...new Set([...seenIds, ...rankedJobs.map((job) => job.id)])];
      const discoverableCount = (activeJobPoolsByMarket[targetMarket] ?? []).filter((job) => job.stage === "进行中" && job.employmentType === employmentType).length;
      const remainingCount = Math.max(0, discoverableCount - nextSeenIds.length);
      applyRankedRecommendations(rankedJobs);
      setDiscoveryCycles((current) => ({ ...current, [discoveryKey]: 1 }));
      setSeenJobIdsByMarket((current) => ({ ...current, [discoveryKey]: nextSeenIds }));
      saveRecommendationMeta(
        file.name,
        rankedJobs,
        targetMarket,
        employmentType,
        1,
        rankedJobs.filter((job) => job.isNew).length,
        remainingCount,
        targetRole,
        "local",
      );
      setActiveResumeVersionId(masterVersion.id);
      setResumePageSize(documentMeta.sourcePageSize ?? "A4");
      setProfileReady(true);
      setSelectedDirection(targetRole);
      setIsResumeEditing(false);
      setResumePreviewMode("final");
      setAgentSuggestion(null);
      setStep("evidence");
      setToast(documentMeta.warnings.length
        ? `已读取 ${file.name}，但有 ${documentMeta.warnings.length} 项结构需要在预览中核对。`
        : `已读取 ${file.name}，章节顺序和段落结构检查完成。`);
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

  function openJobSource(job) {
    const applicationUrl = job?.applyUrl || (job?.source === "手动 JD" ? job.url : "");
    if (!applicationUrl || !isSpecificApplicationUrl(applicationUrl)) {
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
    const applicationUrl = selected.applyUrl || (selected.source === "手动 JD" ? selected.url : "");
    if (!isSpecificApplicationUrl(applicationUrl)) {
      setToast("当前岗位没有具体申请链接。补充职位链接后再开始填写辅助。");
      return;
    }
    setApplicationAssists((current) => ({
      ...current,
      [selected.id]: {
        preparedAt: "刚刚准备",
        resumeVersionId: selectedJobResumeVersion?.id ?? null,
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
    if (agentSuggestion?.jobId === job.id) setAgentSuggestion(null);
    setToast(`已忽略 ${job.company} - ${job.role}，可在已归档里找回。`);
  }

  function handleMarketChange(market) {
    if (market === targetMarket) return;
    setTargetMarket(market);
    setRecommendationMeta(null);
    if (step === "radar" && masterResumeVersion?.content?.trim()) {
      runJobRadar(market, {
        navigate: false,
        reason: "market-switch",
        employmentTypeOverride: employmentType,
        liveSearch: false,
      });
    } else {
      setToast(`已切换到${market}市场；进入找工作后刷新对应岗位。`);
    }
  }

  function handleEmploymentTypeChange(nextType) {
    if (nextType === employmentType) return;
    setEmploymentType(nextType);
    setRecommendationMeta(null);
    if (step === "radar" && masterResumeVersion?.content?.trim()) {
      runJobRadar(targetMarket, {
        navigate: false,
        reason: "employment-switch",
        employmentTypeOverride: nextType,
        liveSearch: false,
      });
    } else {
      setToast(`已切换到${nextType}岗位；进入找工作后刷新对应岗位。`);
    }
  }

  function openImport(job = null) {
    const sourceJob = job?.id ? job : null;
    const jdText = sourceJob?.jdText?.trim() ?? "";
    setJobDescriptionDraft(jdText);
    setImportCompanyDraft(sourceJob?.company ?? inferImportedCompany(jdText));
    setImportRoleDraft(sourceJob?.role ?? inferImportedRole(jdText));
    setImportUrlDraft(sourceJob?.applyUrl ?? sourceJob?.url ?? "");
    setIsImportOpen(true);
    setToast(sourceJob
      ? "请粘贴或补全这个岗位的职位描述。完整 JD 会原样保存为岗位快照。"
      : "粘贴目标岗位 JD，生成单岗位申请包。");
  }

  async function generatePacket() {
    const jdText = jobDescriptionDraft.trim();
    if (jdText.length < 80) {
      setToast("请粘贴完整 JD（至少 80 个字符），不会再用演示职位描述代替。");
      return;
    }
    const company = importCompanyDraft.trim() || inferImportedCompany(jdText);
    const role = importRoleDraft.trim() || inferImportedRole(jdText);
    if (!company || !role) {
      setToast("请确认公司名称和岗位名称，再生成申请包。");
      return;
    }
    const applicationUrl = importUrlDraft.trim();
    if (applicationUrl && !isSpecificApplicationUrl(applicationUrl)) {
      setToast("职位链接必须是 HTTPS 的具体岗位或申请页，不能使用招聘首页或搜索页。");
      return;
    }
    const track = inferJobTrack(`${role}\n${jdText}`);
    const importedBaseJob = buildImportedJob({
      jdText,
      company,
      role,
      applicationUrl,
      market: targetMarket,
      employmentType,
      track,
    });
    const existingJob = applications.find((job) => (
      job.id === selectedId
      && job.company === company
      && job.role === role
    ));
    const baseJob = existingJob
      ? {
          ...importedBaseJob,
          ...existingJob,
          status: "收藏",
          statusKey: "saved",
          stage: "进行中",
          updated: "刚刚导入",
          userTracked: true,
          jdText: importedBaseJob.jdText,
          jdHash: importedBaseJob.jdHash,
          jdSource: "user-pasted",
          jdComplete: true,
          summary: importedBaseJob.summary,
          applyUrl: applicationUrl || existingJob.applyUrl,
          url: applicationUrl || existingJob.url,
        }
      : importedBaseJob;
    const analyzedJob = analyzeJobForResume(baseJob, masterResumeVersion?.content ?? "", targetRole, customDirections);
    const importedJob = {
      ...baseJob,
      ...analyzedJob,
      gaps: analyzedJob.missingSignals.length
        ? analyzedJob.missingSignals.map((signal) => `Master Resume 中尚未确认：${signal}`)
        : baseJob.gaps,
    };
    setApplications((current) => [importedJob, ...current.filter((job) => job.id !== importedJob.id)]);
    setSelectedId(importedJob.id);
    setReviewStatus(normalizeApplicationStatus(importedJob.status));
    setActiveTab("岗位匹配");
    setStep("review");
    setIsQueueCollapsed(true);
    setIsImportOpen(false);
    setToast("完整 JD 已保存为岗位快照，正在生成可审核的岗位版建议…");
    await createResumePolishDraft(importedJob, importedJob.role);
  }

  function updateTracking() {
    if (!selected) return;
    setApplications((current) => current.map((job) => (
      job.id === selected.id ? { ...job, updated: "刚刚更新" } : job
    )));
    setToast("备注和当前状态已保存到浏览器本地草稿。");
  }

  function stopBeforeSubmit() {
    updateSelectedReviewStatus("收藏");
    setToast("已停止提交流程，岗位保留在收藏中。");
  }

  function exportResumeDraft() {
    if (!selected) return;
    if (!selectedJobResumeVersion) {
      setActiveTab("定制简历");
      setToast("先生成、逐条审核并保存岗位版简历，再导出 PDF。");
      return;
    }
    startResumePdfExport(selectedJobResumeVersion);
  }

  return (
    <>
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
            onChange={(event) => {
              const nextQuery = event.target.value;
              setSearchQuery(nextQuery);
              if (nextQuery.trim() && step !== "radar") {
                setStep("radar");
                setIsQueueCollapsed(false);
              }
            }}
            placeholder={t("搜索岗位、公司或来源...")}
          />
          <kbd>⌘K</kbd>
        </label>
        <div className="top-actions">
          <div className="language-switch" role="group" aria-label={uiLanguage === "en" ? "Interface language" : "界面语言"}>
            <Translate size={17} aria-hidden="true" />
            <button
              className={uiLanguage === "zh" ? "active" : ""}
              aria-pressed={uiLanguage === "zh"}
              title="切换为中文"
              onClick={() => setUiLanguage("zh")}
            >
              中
            </button>
            <button
              className={uiLanguage === "en" ? "active" : ""}
              aria-pressed={uiLanguage === "en"}
              title="Switch to English"
              onClick={() => setUiLanguage("en")}
            >
              EN
            </button>
          </div>
          <button className="button quiet" disabled={isResumeParsing} onClick={triggerResumePicker}>
            <FileArrowUp size={18} />
            {t(isResumeParsing ? "正在读取…" : "上传简历")}
          </button>
          <button className="button primary" onClick={openImport}>
            <Plus size={18} />
            {t("粘贴 JD")}
          </button>
          <button className="avatar" aria-label={t("账户")} onClick={() => setToast(t("账户设置将在后续版本接入。"))}>
            AM
          </button>
        </div>
      </header>
      <input
        ref={resumeInputRef}
        className="visually-hidden"
        type="file"
        accept=".pdf,.docx,.txt"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleResumeInputChange}
      />

      <section className={workspaceClass}>
        <aside className={`product-sidebar ${isQueueCollapsed ? "compact" : ""}`}>
          <div className="product-nav-heading">
            <span>{t("工作台")}</span>
            {isReviewReady && (
              <button aria-label={t(isQueueCollapsed ? "展开导航" : "收起导航")} onClick={() => setIsQueueCollapsed((current) => !current)}>
                {isQueueCollapsed ? <CaretRight size={18} /> : <CaretLeft size={18} />}
              </button>
            )}
          </div>
          <nav className="product-navigation" aria-label={t("主要功能")}>
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
              <strong>{masterResumeVersion ? resumeFile?.name ?? "Master Resume" : t("还没有主简历")}</strong>
              <small>{t(needsResumeReimport ? "需要重新上传以读取原文" : masterResumeVersion ? `${validResumeVersionCount} 个版本 · 浏览器本地草稿` : "上传后开始岗位推荐")}</small>
            </div>
            <button aria-label={t("上传或替换简历")} onClick={triggerResumePicker}><FileArrowUp size={17} /></button>
          </div>
        </aside>

        {isReviewReady ? (
          <section className="review-panel">
          <div className="review-titlebar">
            <div className="title-group">
              <button className="back-button" aria-label={t("返回找工作")} onClick={() => { setStep("radar"); setIsQueueCollapsed(false); }}>
                <CaretLeft size={18} />
              </button>
              <CompanyMark accent={selected.accent} />
              <div>
                <p>{selected.company}</p>
                <h1>{selected.role}</h1>
              </div>
              <span className="status-pill">
                <StatusDot status={reviewStatus} />
                {t(reviewStatus)}
              </span>
            </div>
              <div className="review-title-actions">
                <button className="button quiet" onClick={() => openJobSource(selected)}>
                  <ArrowSquareOut size={17} />
                  {t("打开申请页")}
                </button>
                <button className="button primary" onClick={() => {
                  createResumePolishDraft(selected, selected.role);
                  setActiveTab("定制简历");
                  requestAnimationFrame(() => reviewCanvasRef.current?.scrollTo({ top: reviewSectionRefs.current.resume?.offsetTop ?? 0, behavior: "smooth" }));
                }}>
                  <Sparkle size={17} weight="fill" />
                  {t("根据 JD 定制")}
                </button>
                <button className="more-button" aria-label={t("归档当前岗位")} onClick={() => archiveJob(selected)}>
                  <Trash size={20} />
                </button>
              </div>
            </div>

          <nav className="tabs" aria-label={t("申请包分区")}>
            {tabs.map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => goToReviewTab(tab)}
              >
                {t(tab)}
              </button>
            ))}
          </nav>

          <div className="review-mobile-actions" aria-label={t("申请包操作")}>
            <button className="button quiet" onClick={prepareApplicationAssist}>
              <PaperPlaneTilt size={17} />
              {t("打开申请页并准备资料")}
            </button>
            <button className="button quiet" onClick={exportResumeDraft}>
              <FileText size={17} />
              {t("导出草稿")}
            </button>
            <button className="button quiet" onClick={updateTracking}>
              <NotePencil size={17} />
              {t("保存追踪")}
            </button>
          </div>

          <div className="review-canvas" ref={reviewCanvasRef}>
            {activeTab === "岗位匹配" && (
              <>
            <section className="analysis-block" ref={(node) => { reviewSectionRefs.current.analysis = node; }}>
              <div className="section-title">
                <h2>{t("岗位分析")}</h2>
                <span>{t(selected.source)}</span>
              </div>
              <p className="summary-text">{t(selected.summary)}</p>
              <dl className="metadata-grid">
                <div>
                  <dt>{t("岗位轨道")}</dt>
                  <dd>{selected.track}</dd>
                </div>
                <div>
                  <dt>{t("地点")}</dt>
                  <dd>{t(selected.location)}</dd>
                </div>
                <div>
                  <dt>{t("类型")}</dt>
                  <dd>{t(selected.type)}</dd>
                </div>
                <div>
                  <dt>{t("发布日期")}</dt>
                  <dd>{t(selected.posted)}</dd>
                </div>
                <div>
                  <dt>{t("链接状态")}</dt>
                  <dd>
                    {t(selected.verificationStatus === "verified" ? "链接已核验" : "待重新核验")}
                    {selected.verifiedAt
                      ? ` · ${new Date(selected.verifiedAt).toLocaleDateString(uiLanguage === "en" ? "en-US" : "zh-CN")}`
                      : ""}
                  </dd>
                </div>
              </dl>
              {selected.jdText && (
                <details className="jd-snapshot">
                  <summary>
                    <span>{t(selected.jdSource === "user-pasted" ? "用户粘贴的完整 JD" : "官网岗位要求快照")}</span>
                    <small>{selected.jdHash ? `JD ${selected.jdHash}` : t("用于本次岗位分析与简历定制")}</small>
                  </summary>
                  <pre>{selected.jdText}</pre>
                </details>
              )}
            </section>

            <section className="score-block">
              <div className="score-layout">
                <div className="score-ring" style={{ "--score": `${selected.score ?? 0}%` }}>
                  <span>{selected.score ?? "—"}</span>
                  <small>{t(selected.matchLabel ?? "待评估")}</small>
                </div>
                <div className="score-evidence">
                  <span>{t("评分依据")}</span>
                  <strong>{selected.matchSignals?.length ? selected.matchSignals.join(" · ") : t("目标方向与岗位轨道")}</strong>
                  <p>{t("匹配分只来自目标方向、Master Resume 关键词和已确认事实；证据不足时会降低置信度。")}</p>
                </div>
              </div>
              <div className="callout">
                <strong>{t(selectedResumeEvidence.length > 0 ? "已定位到可核对事实" : "尚未定位到直接证据")}</strong>
                <p>{selectedResumeEvidence.length > 0
                  ? uiLanguage === "en" ? `Matched ${selectedResumeEvidence.join(", ")} in the Master Resume. Review every rewrite after generating the job version.` : `Master Resume 中命中 ${selectedResumeEvidence.join("、")}；生成岗位版后仍需逐条审核改写。`
                  : t("当前分数主要来自方向和技能关键词。生成岗位版时不会补写原简历不存在的经历或指标。")}</p>
              </div>
            </section>

            <section className="gap-block" ref={(node) => { reviewSectionRefs.current.gap = node; }}>
              <div className="section-title">
                <h2>{t("缺口报告")}</h2>
                <span>{t("仅作投递判断")}</span>
              </div>
              <h3>{t("主要缺口")}</h3>
              <ul>
                {selected.gaps.map((gap) => (
                  <li key={gap}>{t(gap)}</li>
                ))}
              </ul>
              <h3>{t("处理建议")}</h3>
              <ul>
                <li>{t("只写已有证据能支撑的内容。")}</li>
                <li>{t("用相邻项目经验覆盖岗位要求，不硬编经历。")}</li>
                <li>{t("签证、授权、身份相关问题必须让本人回答。")}</li>
              </ul>
            </section>

            <section className="evidence-block">
              <div className="section-title">
                <h2>{t("已选证据")}</h2>
                <button onClick={() => openReviewEditor("evidence", "已选证据", evidenceText)}>{t("编辑")}</button>
              </div>
              <div className="evidence-list">
                {evidenceLines.length === 0 ? (
                  <div className="evidence-empty-state">
                    <WarningCircle size={20} />
                    <p>{t("Master Resume 中没有命中岗位预设的项目名称。你仍可生成岗位版，但每处改写都必须人工审核。")}</p>
                    <button onClick={() => goToReviewTab("定制简历")}>{t("开始定制")}</button>
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
                    <span>{t("证据")}</span>
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
                    <span>{t("岗位版简历")}</span>
                    <h2>{selected.company} · {selected.role}</h2>
                    <p>{t("继承所选简历的章节、顺序和版式；只审核措辞、章节内 bullet 顺序和已确认内容取舍。")}</p>
                  </div>
                  <div className="job-tailoring-actions">
                    <div className="resume-view-toggle" role="group" aria-label={t("简历查看模式")}>
                      <button
                        type="button"
                        className={resumePreviewMode === "final" ? "active" : ""}
                        aria-pressed={resumePreviewMode === "final"}
                        onClick={() => setResumePreviewMode("final")}
                      >
                        {t("成品预览")}
                      </button>
                      <button
                        type="button"
                        className={resumePreviewMode === "compare" ? "active" : ""}
                        aria-pressed={resumePreviewMode === "compare"}
                        disabled={jobTailoringChanges.length === 0}
                        onClick={() => setResumePreviewMode("compare")}
                      >
                        {t("原文对照")}
                      </button>
                    </div>
                    <label>
                      <span>{t("定制基础")}</span>
                      <select value={activeResumeVersion?.id ?? ""} onChange={(event) => setActiveResumeVersionId(event.target.value)}>
                        {usableResumeVersions.filter((version) => version.layer !== "job" || version.id === selectedJobResumeVersion?.id).map((version) => (
                          <option key={version.id} value={version.id}>{version.name}</option>
                        ))}
                      </select>
                    </label>
                    <button className="button primary" disabled={isAgentThinking || !masterResumeVersion} onClick={() => createResumePolishDraft(selected, selected.role)}>
                      <Sparkle size={17} weight="fill" />
                      {t(isAgentThinking ? "正在生成…" : selectedJobResumeVersion ? "重新生成建议" : "生成岗位版")}
                    </button>
                  </div>
                </header>

                <div className="job-resume-lineage">
                  <ShieldCheck size={16} />
                  <strong>{activeResumeVersion?.name ?? "Master Resume"}</strong>
                  <CaretRight size={14} />
                  <span>{selectedJobResumeVersion?.name ?? (uiLanguage === "en"
                    ? `${selected.company} job version (unsaved)`
                    : `${selected.company} 岗位版（未保存）`)}</span>
                </div>

                <div className="job-tailoring-workspace">
                  <div className="job-resume-preview" aria-label={uiLanguage === "en" ? "Job-specific resume preview" : "岗位版简历预览"}>
                    {jobTailoringDisplayText ? (
                      <ResumeDocument
                        text={jobTailoringDisplayText}
                        changes={jobTailoringDisplayChanges}
                        activeChangeIndex={activeResumeChangeIndex}
                        changeScope="job"
                        documentMeta={jobResumeDocumentMeta}
                        onChangeFocus={focusResumeChange}
                      />
                    ) : <p>{t("先上传 Master Resume。")}</p>}
                  </div>
                  <aside className="job-change-panel" aria-label={t("岗位版修改")}>
                    <header>
                      <div><strong>{t("绿色改写")}</strong><span>{uiLanguage === "en" ? `Red source text on the left · ${jobTailoringChanges.length} changes` : `左侧红色原文 · 共 ${jobTailoringChanges.length} 处`}</span></div>
                      <small>{t(activeJobSuggestion ? "待你确认" : selectedJobResumeVersion ? "已保存版本" : "尚未生成")}</small>
                    </header>
                    <div className="job-change-list">
                      {jobTailoringChanges.map((change, index) => {
                        const decision = resumeChangeDecisions[`${jobSuggestionScope}:${index}`];
                        return (
                          <article className={`${decision ? `decision-${decision}` : ""} ${activeResumeChangeIndex === index ? "active-change" : ""}`} key={`${change.before}-${change.after}-${index}`}>
                            <button className="review-change-focus" onClick={() => focusResumeChange(index, "job")}>
                              <strong>{index + 1}. {t("文字调整")}</strong>
                              <span>{t("定位原文")}</span>
                            </button>
                            <p className="review-change-after"><span>{t("改写后")}</span>{change.after || t("建议移除此句")}</p>
                            {activeJobSuggestion && (
                              <div className="review-change-actions">
                                <button className={decision === "accepted" ? "selected" : ""} aria-label={`接受第 ${index + 1} 处修改`} onClick={() => acceptResumeChange(change, index)}><Check size={16} /></button>
                                <button className={decision === "rejected" ? "selected reject" : ""} aria-label={`拒绝第 ${index + 1} 处修改`} onClick={() => rejectResumeChange(change, index)}><X size={16} /></button>
                              </div>
                            )}
                          </article>
                        );
                      })}
                      {jobTailoringChanges.length === 0 && (
                        <div className="job-change-empty">
                          <ShieldCheck size={22} />
                          <strong>{t(isAgentThinking ? "正在生成可审核建议" : "还没有岗位版改动")}</strong>
                          <p>{t("生成后，左侧标红原文，右侧显示完整绿色改写。")}</p>
                        </div>
                      )}
                    </div>
                    {activeJobSuggestion && (
                      <footer>
                        <span className="resume-review-progress">
                          {uiLanguage === "en"
                            ? `Reviewed ${jobSuggestionReview.total - jobSuggestionReview.pending}/${jobSuggestionReview.total}`
                            : `已审核 ${jobSuggestionReview.total - jobSuggestionReview.pending}/${jobSuggestionReview.total}`}
                        </span>
                        <button className="button primary" onClick={applyLocalAgentSuggestion}>{t("保存为岗位版")}</button>
                        <button className="button quiet" onClick={() => setAgentSuggestion(null)}>{t("放弃建议")}</button>
                      </footer>
                    )}
                  </aside>
                </div>
              </section>
            )}

            {activeTab === "追踪" && (
            <section className="tracking-block" ref={(node) => { reviewSectionRefs.current.tracking = node; }}>
              <div className="section-title">
                <h2>{t("追踪备注")}</h2>
                <button onClick={updateTracking}>{t("保存")}</button>
              </div>
              <article>
                <strong>{t("当前状态")}</strong>
                <p>{t(reviewStatus)} · {t("下一步先确认岗位链接、申请材料和最终提交权限。")}</p>
              </article>
              <article>
                <strong>{t("备注")}</strong>
                <p>{selectedNote}</p>
              </article>
            </section>
            )}
          </div>
        </section>
        ) : (
          <section ref={stageScrollRef} className={`review-panel empty-review ${step === "evidence" ? "evidence-stage" : ""}`}>
           {step === "evidence" && (
              <div className="resume-studio-page resume-document-workspace">
                <header className="resume-workspace-heading">
                  <div>
                    <h1>{t("我的简历")}</h1>
                  </div>
                  {!masterResumeVersion && (
                    <button className="button quiet" disabled={isResumeParsing} onClick={triggerResumePicker}>
                      <FileArrowUp size={18} />
                      {t(isResumeParsing ? "正在读取…" : "上传原版")}
                    </button>
                  )}
                </header>

                <section className="resume-direction-toolbar" aria-label={t("简历版本")}>
                  <div className="resume-direction-zone">
                    <span className="resume-direction-label">{t("简历版本（方向版）")}</span>
                    <div className="resume-direction-tabs" role="tablist" aria-label={t("方向简历版本")}>
                      <button
                        id="resume-tab-master"
                        role="tab"
                        aria-selected={activeResumeTab === "master" && activeResumeVersion?.id === "master-resume" && !agentSuggestion}
                        aria-controls="resume-version-panel"
                        tabIndex={activeResumeTab === "master" ? 0 : -1}
                        className={activeResumeTab === "master" && activeResumeVersion?.id === "master-resume" && !agentSuggestion ? "active" : ""}
                        onKeyDown={handleResumeTabKeyDown}
                        onClick={selectMasterResume}
                      >
                        {t("原版")}
                      </button>
                      {directionResumeTabs.map((direction, directionIndex) => {
                        const isActive = activeResumeTab === direction.role && (
                          agentSuggestion
                            ? agentSuggestion.suggestedTarget === direction.role
                            : direction.version
                              ? activeResumeVersion?.id === direction.version.id
                              : activeResumeVersion?.id === "master-resume"
                        );
                        return (
                          <button
                            key={direction.role}
                            id={`resume-tab-direction-${directionIndex}`}
                            role="tab"
                            aria-selected={isActive}
                            aria-controls="resume-version-panel"
                            tabIndex={isActive ? 0 : -1}
                            className={isActive ? "active" : ""}
                            onKeyDown={handleResumeTabKeyDown}
                            onClick={() => selectDirectionResume(direction.role)}
                          >
                            {direction.label}
                            {direction.version && <span className="version-ready-dot" aria-label={t("已有版本")} />}
                          </button>
                        );
                      })}
                      <div className="direction-create-wrap">
                        <button
                          className="direction-create-button"
                          aria-label={t("创建新方向版")}
                          aria-expanded={isDirectionMenuOpen}
                          onClick={() => setIsDirectionMenuOpen((current) => !current)}
                        >
                          <Plus size={16} />
                          {t("新建方向版")}
                        </button>
                        {isDirectionMenuOpen && (
                          <div className="direction-create-menu" role="menu">
                            {availableTargetDirections.map((role) => (
                              <button key={role} role="menuitem" onClick={() => selectDirectionResume(role)}>{role}</button>
                            ))}
                            <button role="menuitem" onClick={openCustomDirection}>{t("+ 自定义方向…")}</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="resume-lineage">
                      <ShieldCheck size={15} weight="duotone" />
                      <span>
                        {masterResumeVersion
                          ? t(`基于 ${resumeFile?.name ?? "Master Resume"} · 结构已锁定`)
                          : t("等待上传原版 · 上传后锁定章节结构")}
                      </span>
                    </div>
                  </div>
                  <div className="resume-direction-actions">
                    <div className="resume-view-toggle" role="group" aria-label={t("简历查看模式")}>
                      <button
                        type="button"
                        className={resumePreviewMode === "final" ? "active" : ""}
                        aria-pressed={resumePreviewMode === "final"}
                        onClick={() => setResumePreviewMode("final")}
                      >
                        {t("成品预览")}
                      </button>
                      <button
                        type="button"
                        className={resumePreviewMode === "compare" ? "active" : ""}
                        aria-pressed={resumePreviewMode === "compare"}
                        disabled={reviewableResumeChanges.length === 0}
                        onClick={() => setResumePreviewMode("compare")}
                      >
                        {t("原文对照")}
                      </button>
                    </div>
                    <button
                      className="button quiet"
                      disabled={!activeResumeVersion || Boolean(agentSuggestion)}
                      aria-label={t(activeResumeVersion?.id === "master-resume" ? "创建可手动增删的方向副本" : "手动编辑此简历版本")}
                      onClick={isResumeEditing ? finishResumeEditing : beginResumeEditing}
                    >
                      <NotePencil size={18} />
                      {t(isResumeEditing ? "完成编辑" : "手动编辑")}
                    </button>
                    <button
                      className="button primary"
                      disabled={isAgentThinking || !masterResumeVersion}
                      onClick={() => createResumePolishDraft(undefined, activeResumeVersion?.target === "上传原文" ? targetRole : activeResumeVersion?.target ?? targetRole)}
                    >
                      <Sparkle size={18} weight="fill" />
                      {t(isAgentThinking ? "正在按方向优化…" : "按方向优化")}
                    </button>
                    <label className="resume-page-size-control">
                      <span>{t("纸张")}</span>
                      <select
                        aria-label={t("PDF 纸张尺寸")}
                        value={resumePageSize}
                        onChange={(event) => setResumePageSize(event.target.value)}
                      >
                        <option value="A4">A4</option>
                        <option value="Letter">Letter</option>
                      </select>
                    </label>
                    <button className="button quiet" disabled={isExportingPdf || !activeResumeVersion} onClick={() => startResumePdfExport()}>
                      <ArrowSquareOut size={18} />
                      {t(isExportingPdf ? "准备打印…" : "导出 PDF")}
                    </button>
                  </div>
                </section>

                {masterResumeVersion?.documentMeta && (
                  <section className={`resume-import-audit ${masterResumeVersion.documentMeta.warnings?.length ? "has-warning" : ""}`}>
                    {masterResumeVersion.documentMeta.warnings?.length ? <WarningCircle size={19} /> : <ShieldCheck size={19} weight="duotone" />}
                    <div>
                      <strong>
                        {masterResumeVersion.documentMeta.format?.toUpperCase() ?? "TEXT"}
                        {masterResumeVersion.documentMeta.pageCount ? ` · ${masterResumeVersion.documentMeta.pageCount} ${t("页")}` : ""}
                        {` · ${masterResumeVersion.documentMeta.sectionCount ?? 0} ${t("个章节")}`}
                      </strong>
                      <span>
                        {masterResumeVersion.documentMeta.warnings?.[0]
                          ? t(masterResumeVersion.documentMeta.warnings[0])
                          : t("已检查章节顺序、页眉顺序、段落与项目符号；请以左侧预览作为导出前检查。")}
                      </span>
                    </div>
                  </section>
                )}

                {needsResumeReimport && (
                  <section className="resume-required-banner resume-reimport-banner">
                    <WarningCircle size={22} />
                    <div>
                      <strong>{t("这份旧上传记录没有保存简历正文")}</strong>
                      <span>{t("请重新选择原文件。读取成功后会替换 Master Resume，不会生成示例身份或经历。")}</span>
                    </div>
                    <button className="button primary" disabled={isResumeParsing} onClick={triggerResumePicker}>{t(isResumeParsing ? "正在读取…" : "重新上传")}</button>
                  </section>
                )}

                <section
                  id="resume-version-panel"
                  role="tabpanel"
                  aria-labelledby={activeResumeTabId}
                  className={`resume-document-layout ${isResumeReviewCollapsed ? "review-collapsed" : ""}`}
                >
                  <div className="resume-preview-column direction-resume-preview">
                    {activeResumeVersion || agentSuggestion ? (
                      <section className={`resume-paper source-locked ${activeResumeTemplate.id}`} aria-label={t("当前方向简历预览")}>
                        {isResumeEditing && !agentSuggestion ? (
                          <textarea
                            className="resume-content-editor"
                            value={resumeEditDraft}
                            onChange={(event) => setResumeEditDraft(event.target.value)}
                            aria-label={t("编辑当前简历全文")}
                          />
                        ) : (
                          <ResumeDocument
                            text={resumeDisplayText}
                            changes={resumeDisplayChanges}
                            activeChangeIndex={activeResumeChangeIndex}
                            changeScope="direction"
                            documentMeta={activeResumeDocumentMeta}
                            onChangeFocus={focusResumeChange}
                          />
                        )}
                      </section>
                    ) : (
                      <button className="resume-preview-empty" onClick={triggerResumePicker}>
                        <FileArrowUp size={30} />
                        <strong>{t("上传你的现有简历")}</strong>
                        <span>{t("系统会保留原文结构，并从它派生 SDE、AI 和 Risk 等方向版本。")}</span>
                      </button>
                    )}
                  </div>

                  <aside className={`resume-review-panel ${isResumeReviewCollapsed ? "collapsed" : ""}`} aria-label={t("本版修改")}>
                    {isResumeReviewCollapsed ? (
                      <button className="review-panel-expand" aria-label={t("展开修改面板")} onClick={() => setIsResumeReviewCollapsed(false)}>
                        <CaretLeft size={18} />
                        <span>{reviewableResumeChanges.length}</span>
                      </button>
                    ) : (
                      <>
                        <header className="resume-review-heading">
                          <div>
                            <strong>{t("绿色改写")}</strong>
                            <span>{uiLanguage === "en" ? `Red source text on the left · ${reviewableResumeChanges.length} changes` : `左侧红色原文 · 共 ${reviewableResumeChanges.length} 处`}</span>
                          </div>
                          <button aria-label={t("收起修改面板")} onClick={() => setIsResumeReviewCollapsed(true)}><CaretRight size={18} /></button>
                        </header>

                        <div className="resume-review-list">
                          {reviewableResumeChanges.map((change, index) => {
                            const scope = agentSuggestion ? agentSuggestionScope : activeResumeVersion?.id ?? "resume";
                            const decision = resumeChangeDecisions[`${scope}:${index}`];
                            return (
                              <article className={`${decision ? `decision-${decision}` : ""} ${activeResumeChangeIndex === index ? "active-change" : ""}`} key={`${change.before}-${change.after}-${index}`}>
                                <div className="review-change-title">
                                  <button className="review-change-focus" onClick={() => focusResumeChange(index, "direction")}>
                                    <strong>{index + 1}. {t(index % 3 === 0 ? "表达" : index % 3 === 1 ? "项目" : "经历")}</strong>
                                    <span>{t("定位原文")}</span>
                                  </button>
                                  <span>{index + 1} / {reviewableResumeChanges.length}</span>
                                </div>
                                <p className="review-change-after"><span>{t("改写后")}</span>{change.after || t("建议移除此句")}</p>
                                {agentSuggestion ? (
                                  <div className="review-change-actions">
                                    <button className={decision === "accepted" ? "selected" : ""} aria-label={uiLanguage === "en" ? `Accept change ${index + 1}` : `接受第 ${index + 1} 处修改`} onClick={() => acceptResumeChange(change, index)}><Check size={16} /></button>
                                    <button className={decision === "rejected" ? "selected reject" : ""} aria-label={uiLanguage === "en" ? `Reject change ${index + 1}` : `拒绝第 ${index + 1} 处修改`} onClick={() => rejectResumeChange(change, index)}><X size={16} /></button>
                                  </div>
                                ) : (
                                  <span className="review-change-saved">{t("已保存版本")}</span>
                                )}
                              </article>
                            );
                          })}
                        </div>

                        {reviewableResumeChanges.length === 0 && (
                          <div className="resume-review-empty">
                            <ShieldCheck size={22} weight="duotone" />
                            <strong>{t(activeResumeVersion?.id === "master-resume" ? "这是锁定的上传原版" : "这一版暂无待审核改动")}</strong>
                            <p>{t("点击“按方向优化”后，原句会在简历中标红，完整改写显示在右侧。")}</p>
                          </div>
                        )}

                        {agentSuggestion && (
                          <div className="resume-review-footer">
                            <span className="resume-review-progress">
                              {uiLanguage === "en"
                                ? `Reviewed ${agentSuggestionReview.total - agentSuggestionReview.pending}/${agentSuggestionReview.total}`
                                : `已审核 ${agentSuggestionReview.total - agentSuggestionReview.pending}/${agentSuggestionReview.total}`}
                            </span>
                            <button className="button primary" onClick={applyLocalAgentSuggestion}>{t("保存为方向版")}</button>
                            <button className="button quiet" onClick={() => setAgentSuggestion(null)}>{t("放弃建议")}</button>
                          </div>
                        )}

                        <div className="resume-structure-note">
                          <ShieldCheck size={15} />
                          <span>{t(isResumeEditing ? "可直接增删或改写全文；完成后会自动生成红绿对照。" : "修改仅影响当前方向版，不会改变原版结构。")}</span>
                        </div>
                      </>
                    )}
                  </aside>
                </section>
              </div>
            )}

           {step === "radar" && (
              <div className="jobs-page">
                <header className="page-heading jobs-heading">
                  <div>
                    <span>{t("找工作")}</span>
                    <h1>{t("从适合你的岗位开始。")}</h1>
                    <p>{t("推荐和匹配只读取已确认的简历事实；打开岗位后再按 JD 生成独立简历版本。")}</p>
                  </div>
                  <div className="page-heading-actions">
                    <button className="button quiet" onClick={openImport}><Plus size={17} />{t("粘贴 JD")}</button>
                    <button className="button primary" disabled={isRefreshingJobs || isResumeParsing} onClick={runJobRadar}>
                      {isRefreshingJobs ? <CircleNotch className="spin" size={17} /> : <Sparkle size={17} weight="fill" />}
                      {t(isRefreshingJobs ? "发现新岗位中…" : "刷新推荐")}
                    </button>
                  </div>
                </header>

                {(!profileReady || needsResumeReimport) && (
                  <section className="resume-required-banner">
                    <FileArrowUp size={22} />
                    <div>
                      <strong>{t(needsResumeReimport ? "重新上传以读取简历原文" : "先上传一份现有简历")}</strong>
                      <span>{t(needsResumeReimport ? "旧版本只保存了文件名；重新读取后，岗位匹配才会使用真实简历内容。" : "有了主简历后，匹配分、缺口和定制建议才会基于你的真实经历。")}</span>
                    </div>
                    <button className="button primary" disabled={isResumeParsing} onClick={triggerResumePicker}>{t(isResumeParsing ? "正在读取…" : needsResumeReimport ? "重新上传" : "上传简历")}</button>
                  </section>
                )}

                <section className="job-filter-bar" aria-label={t("岗位推荐设置")}>
                  <label>
                    <span className="direction-filter-label">{t("求职方向")} {activeCustomDirection && <em>{t("自定义")}</em>}</span>
                    <select value={targetRole} onChange={(event) => {
                      if (event.target.value === "__custom__") {
                        openCustomDirection();
                        return;
                      }
                      handleTargetRoleChange(event.target.value);
                    }}>
                      <optgroup label={t("内置方向")}>
                        {targetDirectionOptions.map((role) => <option key={role} value={role}>{t(role)}</option>)}
                      </optgroup>
                      {customDirections.length > 0 && (
                        <optgroup label={t("我的方向")}>
                          {customDirections.map((direction) => <option key={direction.id} value={direction.name}>{direction.name}</option>)}
                        </optgroup>
                      )}
                      <option value="__custom__">{t("+ 自定义方向…")}</option>
                    </select>
                    <CaretDown size={15} />
                  </label>
                  <div className="compact-filter-group">
                    <span>{t("市场")}</span>
                    <div className="segment compact">
                      {["美国", "中国"].map((market) => <button key={market} className={targetMarket === market ? "selected" : ""} onClick={() => handleMarketChange(market)}>{t(market)}</button>)}
                    </div>
                  </div>
                  <div className="compact-filter-group">
                    <span>{t("岗位类型")}</span>
                    <div className="segment compact">
                      {["全职", "实习"].map((type) => <button key={type} className={employmentType === type ? "selected" : ""} onClick={() => handleEmploymentTypeChange(type)}>{t(type)}</button>)}
                    </div>
                  </div>
                  <label className="filter-summary">
                    <span>{t("简历语言")}</span>
                    <select
                      aria-label={t("简历语言")}
                      value={outputLanguage}
                      onChange={(event) => setOutputLanguage(event.target.value)}
                    >
                      {["英文", "中文", "中英双语"].map((language) => (
                        <option key={language} value={language}>{t(language)}</option>
                      ))}
                    </select>
                    <CaretDown size={14} aria-hidden="true" />
                  </label>
                  <div className="filter-summary">
                    <span>{t("岗位来源")}</span>
                    <strong>{uiLanguage === "en" ? `${t(targetMarket)} ${t(employmentType)} official-site pool` : `${targetMarket}${employmentType}官网职位池`}</strong>
                    <small>{t("手动刷新会搜索官网；切换筛选只读取本地缓存")}</small>
                  </div>
                </section>

                <section className="job-discovery-layout">
                  <div className="job-results-panel">
                    <div className="results-heading">
                      <div>
                        <strong>{t("为你推荐")}</strong>
                        <span>
                          {uiLanguage === "en" ? `${filteredDiscoveryJobs.length} roles shown` : `显示 ${filteredDiscoveryJobs.length} 个岗位`}
                          {recommendationMeta?.market === targetMarket && recommendationMeta?.employmentType === employmentType
                            ? uiLanguage === "en"
                              ? ` · Batch ${recommendationMeta.batch ?? 1} · ${recommendationMeta.newCount ?? 0} new${recommendationMeta.remainingCount > 0 ? ` · ${recommendationMeta.remainingCount} unseen in the pool` : " · Local pool exhausted"}`
                              : ` · 第 ${recommendationMeta.batch ?? 1} 批 · 新增 ${recommendationMeta.newCount ?? 0} 个${recommendationMeta.remainingCount > 0 ? ` · 池内还有 ${recommendationMeta.remainingCount} 个未看` : " · 本地池已看完"}`
                            : ` · ${t("尚未按当前市场刷新")}`}
                        </span>
                      </div>
                      <button onClick={() => setSearchQuery("")}><FunnelSimple size={16} />{t("匹配度排序")}</button>
                    </div>
                    {discoveryJobs.length === 0 ? (
                      <div className="jobs-empty-state">
                        <MagnifyingGlass size={28} />
                        <strong>{uiLanguage === "en" ? `No ${t(targetMarket)} ${t(employmentType).toLowerCase()} roles right now` : `当前没有${targetMarket}${employmentType}岗位`}</strong>
                        <p>{t(employmentType === "实习" ? "点击刷新可搜索官网实习岗位；也可以粘贴真实 JD 建立岗位版。" : "上传简历后刷新推荐，或直接粘贴一个目标岗位的 JD。")}</p>
                        <div><button className="button primary" onClick={runJobRadar}>{t("载入推荐岗位")}</button><button className="button quiet" onClick={openImport}>{t("粘贴 JD")}</button></div>
                      </div>
                    ) : filteredDiscoveryJobs.length === 0 ? (
                      <div className="jobs-empty-state">
                        <MagnifyingGlass size={28} />
                        <strong>{t("没有符合当前搜索的岗位")}</strong>
                        <p>{uiLanguage === "en"
                          ? `No role, company, location, or source matches “${searchQuery.trim()}”.`
                          : `岗位、公司、地点和来源中都没有匹配“${searchQuery.trim()}”的结果。`}</p>
                        <button className="button primary" onClick={() => setSearchQuery("")}>{t("清除搜索")}</button>
                      </div>
                    ) : (
                      <div className="job-discovery-list">
                        {filteredDiscoveryJobs.map((job) => (
                          <article className="job-discovery-card" key={job.id}>
                            <button className="job-card-main" onClick={() => selectJob(job)}>
                              <CompanyMark accent={job.accent} />
                              <span className="job-card-copy">
                                <span className="job-card-title">
                                  <strong>{job.role}</strong>
                                  <span className="job-card-badges">
                                    {job.isNew && <i>{t("本轮新增")}</i>}
                                    <em>{job.score == null
                                      ? t("待评估")
                                      : uiLanguage === "en" ? `${job.score}% match` : `${job.score}% 匹配`}</em>
                                  </span>
                                </span>
                                <span>{job.company} · {t(job.location)} · {t(job.employmentType)}{job.type && job.type !== job.employmentType ? ` · ${t(job.type)}` : ""}</span>
                                <p>{t(job.summary)}</p>
                                {job.matchSignals?.length > 0 && (
                                  <span className="match-signal-row">{t("匹配：")}{job.matchSignals.join(" · ")}</span>
                                )}
                                <small>{job.source} · {t(job.verificationStatus === "verified" ? "链接已核验" : "待重新核验")}</small>
                              </span>
                              <CaretRight size={18} />
                            </button>
                            <div className="job-card-actions">
                              <button onClick={() => watchJob(job)}><CalendarBlank size={15} />{t("收藏")}</button>
                              <button onClick={() => openJobSource(job)}><ArrowSquareOut size={15} />{t("申请")}</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <aside className="recommendation-insight">
                    <span className="insight-icon"><Sparkle size={18} weight="fill" /></span>
                    <span>{t("推荐依据")}</span>
                    <h2>{t(selectedDirection ?? targetRole)}</h2>
                    <p>{t("根据 Master Resume 中出现的技能、经历关键词和目标方向重新评分。缺少证据的要求只会标为缺口，不会被写成经历。")}</p>
                    {recommendationMeta && (
                      <div className="recommendation-source">
                        <span>{t("本次匹配来源")}</span>
                        <strong>{t(recommendationMeta.source)}</strong>
                        <small>{t(recommendationMeta.targetRole)} · {t(recommendationMeta.market)} {t(recommendationMeta.employmentType ?? "全职")}</small>
                        {recommendationMeta.signals.length > 0 && <small>{t("识别：")}{recommendationMeta.signals.join(" · ")}</small>}
                      </div>
                    )}
                    <div className="insight-stats">
                      <div><strong>{masterResumeVersion?.content?.length ?? 0}</strong><span>{t("主简历字符")}</span></div>
                      <div><strong>{validResumeVersionCount}</strong><span>{t("简历版本")}</span></div>
                    </div>
                    <button onClick={() => setStep("evidence")}>{t("查看主简历")} <CaretRight size={15} /></button>
                  </aside>
                </section>
              </div>
            )}

            {step === "applications" && (
              <div className="applications-page">
                <header className="page-heading">
                  <div>
                    <span>{t("求职进度")}</span>
                    <h1>{t("把每一次机会推进到底。")}</h1>
                    <p>{t("状态、备注和下一步保存在当前浏览器草稿中，申请页最终提交仍由你本人确认。")}</p>
                  </div>
                  <button className="button primary" onClick={() => setStep("radar")}><MagnifyingGlass size={17} />{t("继续找工作")}</button>
                </header>

                <section className="application-summary-strip">
                  {["收藏", "准备中", "已投递", "面试", "Offer"].map((status) => (
                    <article key={status}>
                      <span>{t(status)}</span>
                      <strong>{trackedJobs.filter((job) => normalizeApplicationStatus(job.status) === status).length}</strong>
                    </article>
                  ))}
                </section>

                <section className="application-table-shell">
                  <div className="application-table-heading">
                    <div><strong>{t("投递记录")}</strong><span>{uiLanguage === "en" ? `${trackedJobs.length} roles` : `${trackedJobs.length} 个岗位`}</span></div>
                    <span>{t("状态可以随时更新")}</span>
                  </div>
                  {trackedJobs.length === 0 ? (
                    <div className="jobs-empty-state">
                      <CheckCircle size={28} />
                      <strong>{t("还没有投递记录")}</strong>
                      <p>{t("收藏岗位、开始定制简历或打开申请页后，岗位会出现在这里。")}</p>
                      <button className="button primary" onClick={() => setStep("radar")}>{t("浏览岗位")}</button>
                    </div>
                  ) : (
                    <div className="application-table" role="table" aria-label={t("投递记录")}>
                      <div className="application-table-row header" role="row">
                        <span role="columnheader">{t("岗位")}</span><span role="columnheader">{t("匹配")}</span><span role="columnheader">{t("状态")}</span><span role="columnheader">{t("最近更新")}</span><span role="columnheader">{t("操作")}</span>
                      </div>
                      {trackedJobs.map((job) => (
                        <div className="application-table-row" role="row" key={job.id}>
                          <span role="cell" className="application-job-cell">
                            <button className="application-job" onClick={() => selectJob(job)}>
                              <CompanyMark accent={job.accent} />
                              <span><strong>{job.role}</strong><small>{job.company} · {t(job.location)}</small></span>
                            </button>
                          </span>
                          <strong role="cell">{job.score == null ? t("待评估") : `${job.score}%`}</strong>
                          <label role="cell" className="application-status-select">
                            <StatusDot status={normalizeApplicationStatus(job.status)} />
                            <select value={normalizeApplicationStatus(job.status)} onChange={(event) => { setSelectedId(job.id); setReviewStatus(event.target.value); setApplications((current) => current.map((item) => item.id === job.id ? { ...item, status: event.target.value, statusKey: statusKeyByLabel[event.target.value], userTracked: true, updated: "刚刚更新" } : item)); }}>
                              {statusOptions.filter((status) => status !== "已归档").map((status) => <option key={status} value={status}>{t(status)}</option>)}
                            </select>
                            <CaretDown size={14} />
                          </label>
                          <span role="cell">{t(job.updated)}</span>
                          <div role="cell" className="application-row-actions"><button aria-label={uiLanguage === "en" ? `Open ${job.company} application` : `打开 ${job.company} 申请页`} onClick={() => openJobSource(job)}><ArrowSquareOut size={16} /></button><button aria-label={uiLanguage === "en" ? `View ${job.company} role details` : `查看 ${job.company} 岗位详情`} onClick={() => selectJob(job)}><CaretRight size={16} /></button></div>
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
          <h2>{t("投递状态")}</h2>
          <label className="select-shell">
            <StatusDot status={reviewStatus} />
            <select value={reviewStatus} onChange={(event) => updateSelectedReviewStatus(event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option} value={option}>{t(option)}</option>
              ))}
            </select>
            <CaretDown size={16} />
          </label>

          <div className="rail-group">
            <span>{t("最近更新")}</span>
            <strong>{t(selected.updated)}</strong>
          </div>
          <div className="rail-group">
            <span>{t("当前草稿")}</span>
            <strong>{t(selectedJobResumeVersion ? "岗位版已保存" : "尚未生成岗位版")}</strong>
          </div>
          <div className="rail-group">
            <span>{t("使用简历")}</span>
            <button className="link-row" onClick={() => goToReviewTab("定制简历")}>
              <span>
                {selectedJobResumeVersion?.name ?? activeResumeVersion?.name ?? "Master Resume"}
                <small>{t(selectedJobResumeVersion ? "岗位版 · 继承源简历结构" : "先生成岗位版再申请")}</small>
              </span>
              <FileText size={16} />
            </button>
          </div>
          <div className="rail-group">
            <span>{t("岗位来源")}</span>
            <strong>{t(selected.source)} · {selected.score == null
              ? t("待评估")
              : uiLanguage === "en" ? `${selected.score}% match` : `${selected.score}% 匹配`}</strong>
          </div>
          <div className="rail-group">
            <span>{t("职位申请")}</span>
            <button className="link-row" onClick={() => openJobSource(selected)}>
              <span>
                {t("打开申请页")}
                <small>{selected.company} - {selected.role}</small>
              </span>
              <ArrowSquareOut size={16} />
            </button>
          </div>

          <div className="application-assist-status">
            <span>{t("申请页填写辅助")}</span>
            <strong>{t(selectedApplicationAssist.preparedAt ? "已准备，等待用户打开申请页" : "尚未准备")}</strong>
            <p>{selectedJobResumeVersion?.name ?? t("需要先保存岗位版简历")}</p>
            <button onClick={prepareApplicationAssist}>{t("管理授权与填写资料")}</button>
          </div>

          <label className="notes-box">
            <span>{t("备注")}</span>
            <textarea
              value={selectedNote}
              onChange={(event) => setNotesByJobId((current) => ({ ...current, [selected.id]: event.target.value }))}
            />
          </label>

          <div className="action-stack">
            <h3>{t("下一步")}</h3>
            <button className="button primary wide" onClick={prepareApplicationAssist}>
              <PaperPlaneTilt size={18} />
              {t("打开申请页并准备资料")}
            </button>
            <button className="button quiet wide" onClick={() => {
              createResumePolishDraft(selected, selected.role);
              goToReviewTab("定制简历");
            }}>
              <Sparkle size={18} weight="fill" />
              {t("根据 JD 定制简历")}
            </button>
            <button className="button quiet wide" onClick={exportResumeDraft}>
              <FileText size={18} />
              {t("导出简历")}
            </button>
            <button className="button quiet wide" onClick={updateTracking}>
              <NotePencil size={18} />
              {t("更新追踪")}
            </button>
            <button className="button danger wide" onClick={stopBeforeSubmit}>
              <StopCircle size={18} />
              {t("提交前停止")}
            </button>
          </div>

          <div className="approval-note">
            <PaperPlaneTilt size={18} />
            <p>{t("批准只代表可以填表。最终提交仍需要本人对公司、岗位和申请内容逐项确认。")}</p>
          </div>
        </aside>
        ) : null}
      </section>

      {activeEditor && (
        <EditModal t={t} uiLanguage={uiLanguage} editor={activeEditor} onChange={updateReviewEditor} onCancel={closeReviewEditor} onSave={saveReviewEditor} />
      )}

      {isApplicationAssistOpen && selected && (
        <ApplicationAssistModal
          t={t}
          uiLanguage={uiLanguage}
          selected={selected}
          activeResumeVersionId={selectedJobResumeVersion?.id ?? ""}
          resumeVersions={selectedJobResumeVersion ? [selectedJobResumeVersion] : []}
          onResumeVersionChange={setActiveResumeVersionId}
          candidateProfile={candidateProfile}
          onProfileChange={updateCandidateProfile}
          applicationConsent={applicationConsent}
          onConsentToggle={toggleApplicationConsent}
          canLaunch={contactProfileReady && applicationConsent.contact}
          onClose={() => setIsApplicationAssistOpen(false)}
          onLaunch={launchApplicationAssist}
        />
      )}

      {printResumeVersion && !isPrintRequested && (
        <ResumeExportModal
          t={t}
          version={printResumeVersion}
          pageSize={resumePageSize}
          onPageSizeChange={setResumePageSize}
          onClose={closeResumeExport}
          onPrint={confirmResumePrint}
        />
      )}

      {isCustomDirectionOpen && (
        <CustomDirectionModal
          t={t}
          uiLanguage={uiLanguage}
          directions={customDirections}
          draft={customDirectionDraft}
          onDraftChange={setCustomDirectionDraft}
          onDelete={deleteCustomDirection}
          onClose={() => setIsCustomDirectionOpen(false)}
          onSave={saveCustomDirection}
        />
      )}

      {isImportOpen && (
        <ImportJobModal
          t={t}
          jd={jobDescriptionDraft}
          company={importCompanyDraft}
          role={importRoleDraft}
          url={importUrlDraft}
          onJdChange={setJobDescriptionDraft}
          onCompanyChange={setImportCompanyDraft}
          onRoleChange={setImportRoleDraft}
          onUrlChange={setImportUrlDraft}
          onClose={() => setIsImportOpen(false)}
          onGenerate={generatePacket}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <CalendarBlank size={17} />
          {t(toast)}
        </div>
      )}
    </main>
    {printResumeVersion && createPortal(
      <div
        className={`resume-print-root page-${resumePageSize.toLowerCase()}`}
        data-testid="resume-print-root"
        aria-hidden="true"
      >
        <section className={`resume-paper source-locked ${printResumeTemplate.id}`}>
          <ResumeDocument
            text={printResumeVersion.content}
            documentMeta={printResumeVersion.documentMeta}
          />
        </section>
      </div>,
      document.body,
    )}
    </>
  );
}
