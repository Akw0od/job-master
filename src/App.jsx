import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  appendApplicationOpened,
  appendPreflightPassed,
  appendSubmissionAuthorized,
  appendSubmissionCompleted,
  appendSubmissionFailed,
  appendSubmissionPaused,
  appendSubmissionStarted,
  getApplicationEvents,
  getApplicationStatusRevertibility,
  normalizeApplicationEventState,
  revertLatestApplicationStatusChange,
  transitionApplicationStatus,
} from "./domain/applicationEvents";
import { evaluateApplicationPreflight, evaluateSubmissionPreflight, hasFreshOpenSourceReceipt } from "./domain/applicationPreflight";
import { findReusableApplicationAnswer, removeApplicationAnswer, upsertApplicationAnswer } from "./domain/applicationAnswers";
import {
  authorizeSubmissionReview,
  createSubmissionReview,
  submissionAuditMetadata,
} from "./domain/applicationSubmission";
import {
  addBusinessDays,
  buildApplicationAnalytics,
  buildInterviewPrepOutline,
  buildTodayActionQueue,
  recordApplicationFollowUp,
  recordConfirmedSubmission,
  scheduleApplicationFollowUp,
  updateApplicationInterview,
} from "./domain/applicationOperations";
import {
  analyzeJobForResume,
  applyLiveUrlVerificationResults,
  buildRecommendationFunnel,
  filterDiscoverableJobs,
  formatSignalScore,
  getDiscoveryKey,
  getLiveOfficialApplyUrls,
  inferJobTrack,
  hasCurrentJobScore,
  jobScoreAlgorithmVersion,
  markRejectedLiveJobs,
  mergeJobPools,
  normalizeRecommendationFunnelMeta,
  normalizeSearchedJobs,
  recommendationFunnelAlgorithmVersion,
} from "./domain/jobDiscovery";
import { translateUiText } from "./i18n";
import { extractResumeDocument } from "./resume/resumeIO";
import {
  requestResumeRewrite as requestResumeRewriteFromAgent,
  searchOfficialJobs,
  verifyOfficialJobUrls,
  closeApplicationAutomationSession,
  executeReviewedApplication,
  getApplicationAutomationCapabilities,
  scanApplicationPage,
} from "./services/localAgent";
import {
  closeReservedApplicationWindow,
  navigateReservedApplicationWindow,
  reserveApplicationWindow,
} from "./services/applicationWindow";
import {
  BackupError,
  createEncryptedDashboardBackup,
  decryptDashboardBackup,
  readEncryptedBackupFile,
} from "./services/dashboardBackup";
import {
  createResumeRewritePayload,
  decideResumeRewriteConsent,
  normalizeResumeRewriteConsent,
  summarizeResumeRewritePayload,
} from "./services/resumeRewriteConsent";
import {
  buildApplicationFieldPacket,
  buildApplicationSourceFingerprint,
  canLaunchApplicationAssist,
  createApplicationAssistAudit,
  hasApplicationAssistSourceChanged,
  validateApplicationContact,
} from "./services/applicationFieldPacket";
import { deriveOfficialJobProvider, derivePostingUrl, normalizeReceiptUrl, updateSourceReceiptVerification } from "./domain/sourceReceipt";
import { getNextTabKey } from "./services/tabNavigation";
import { clearKnownDashboards, readDashboard, writeDashboard } from "./storage/dashboardStorage";
import {
  assessResumeStructure,
  computeResumeChanges,
  isPlaceholderResume,
  materializeResumeReview,
  normalizeImportedResumeText,
  saveEditableResumeVersion,
  selectResumeVersionForDirection,
  summarizeResumeReview,
} from "./resume/resumeModel";

const ApplicationAssistModal = lazy(() => import("./components/modals/ApplicationAssistModal")
  .then((module) => ({ default: module.ApplicationAssistModal })));
const ApplicationSubmissionReviewModal = lazy(() => import("./components/modals/ApplicationSubmissionReviewModal")
  .then((module) => ({ default: module.ApplicationSubmissionReviewModal })));
const EditModal = lazy(() => import("./components/modals/EditModal")
  .then((module) => ({ default: module.EditModal })));
const CustomDirectionModal = lazy(() => import("./components/modals/JobInputModals")
  .then((module) => ({ default: module.CustomDirectionModal })));
const ImportJobModal = lazy(() => import("./components/modals/JobInputModals")
  .then((module) => ({ default: module.ImportJobModal })));
const LocalDataModal = lazy(() => import("./components/modals/LocalDataModal")
  .then((module) => ({ default: module.LocalDataModal })));
const ResumeRewriteConsentModal = lazy(() => import("./components/modals/ResumeRewriteConsentModal")
  .then((module) => ({ default: module.ResumeRewriteConsentModal })));
const ResumeExportModal = lazy(() => import("./components/modals/ResumeExportModal")
  .then((module) => ({ default: module.ResumeExportModal })));

const tabs = ["岗位匹配", "定制简历", "追踪"];

function verificationStatusCopy(job) {
  if (job?.verificationStatus === "unavailable") return "官网确认岗位已失效";
  if (job?.verificationStatus === "verified" && !hasFreshOpenSourceReceipt(job)) return "核验已过期";
  if (job?.verificationStatus === "verified") return "链接已核验";
  return "待重新核验";
}

function ModalChunkFallback({ t }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-chunk-fallback" role="status" aria-live="polite">
        <CircleNotch size={20} className="spin" />
        <span>{t("正在加载界面…")}</span>
      </section>
    </div>
  );
}

const receiptValueLabels = {
  "live-official-search": "实时官网搜索",
  "built-in-catalog": "内置岗位目录",
  "user-pasted": "用户粘贴",
  "legacy-cache": "旧本地缓存",
  "official-company-site": "公司官网",
  open: "已开放",
  closed: "已关闭",
  unknown: "暂时未知",
  "needs-review": "待核验",
  manual: "用户补充",
  "live-search-verified": "实时搜索时已核验",
  "url-check-open": "具体链接核验可打开",
  "url-check-closed": "具体链接核验已关闭",
  "url-check-unknown": "具体链接暂时无法确认",
  "url-open": "具体链接可打开",
  "http-404-or-410": "官网返回 404 或 410",
  "closed-page-signal": "页面明确显示岗位已关闭",
  "ashby-published": "Ashby 职位仍在发布",
  "ashby-not-published": "Ashby 职位已下线",
  "network-or-inconclusive": "网络或响应不足，暂无法确认",
  "bounded-response": "响应超过安全读取上限",
  "redirect-inconclusive": "重定向结果无法确认",
  "invalid-or-unsafe-url": "链接格式或安全性不合格",
  "built-in-catalog-needs-review": "内置目录，尚未实时核验",
  "manual-jd-needs-review": "用户粘贴 JD，链接待核验",
  "manual-jd-no-application-url": "用户未提供具体申请链接",
  "legacy-cache-needs-review": "旧缓存，来源详情待重新核验",
  "official-response": "官网响应快照",
  "user-provided-jd": "用户提供 JD 原文",
  "agent-paraphrase": "Agent 生成的 JD 释义",
  "legacy-agent-paraphrase": "旧记录 JD 释义证据",
  missing: "未提供",
  none: "未提供",
  "legacy-unknown": "旧记录未标明算法",
};
const funnelExclusionLabels = {
  market: "市场不匹配",
  employmentType: "岗位类型不匹配",
  archived: "已归档",
  unavailable: "官网确认失效",
  terminal: "已进入终态",
  zeroScore: "无匹配证据",
  cap: "展示上限",
};

function sourceReceiptValue(value, t) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return t("未提供");
  const label = receiptValueLabels[normalized];
  return label ? t(label) : normalized;
}

function formatReceiptTimestamp(value, uiLanguage, t) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString(uiLanguage === "en" ? "en-US" : "zh-CN")
    : t("未提供");
}

function toDateTimeLocalValue(value) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function applicationEventLabel(event, t) {
  if (event.type === "status.changed") return `${t(event.fromStatus)} → ${t(event.toStatus)}`;
  const labels = {
    "status.reverted": "已撤销最近状态变更",
    "preflight.passed": "申请前检查已通过",
    "application.opened": "已打开具体申请页",
    "submission.authorized": "已创建单次投递授权",
    "submission.started": "单次自动化已开始",
    "submission.completed": "官网已确认投递成功",
    "submission.paused": "自动化已停在人工处理点",
    "submission.failed": "单次自动化执行失败",
  };
  return t(labels[event.type] ?? "申请记录已更新");
}

function applicationActionLabel(actionCode, t) {
  const labels = {
    "prepare-interview": "准备面试",
    "follow-up": "跟进已到期",
    "track-application": "查看投递进度",
    "verify-role": "重新核验岗位",
    "tailor-resume": "准备岗位版简历",
    "review-application": "审核申请包",
  };
  return t(labels[actionCode] ?? "处理下一步");
}

function applicationFollowUpDraft(job, uiLanguage) {
  if (uiLanguage === "en") {
    return `Subject: Following up on my ${job.role} application\n\nHello ${job.company} Hiring Team,\n\nI’m following up on my application for the ${job.role} role. I remain interested in the opportunity and would be glad to provide any additional information that would be helpful.\n\nThank you for your time and consideration.`;
  }
  return `主题：跟进 ${job.role} 职位申请\n\n${job.company} 招聘团队您好：\n\n想跟进一下我对 ${job.role} 职位的申请。我仍然非常关注这个机会；如需补充任何材料或信息，我很乐意提供。\n\n感谢您的时间与考虑。`;
}

function resumeDecisionKey(scope, change, index) {
  return `${scope}:${change?.patchId ?? index}`;
}

function formatReceiptHash(artifact, t) {
  if (!artifact?.contentHash) return t("未提供");
  return `${artifact.contentHash} · ${sourceReceiptValue(artifact.hashAlgorithm, t)}`;
}

function getSuggestionScope(suggestion) {
  if (!suggestion) return "suggestion:none";
  return `suggestion:${suggestion.id ?? [suggestion.sourceVersionId, suggestion.suggestedTarget, suggestion.jobId].filter(Boolean).join(":")}`;
}

function primaryFunnelExclusion(funnel) {
  const [reason, count] = Object.entries(funnel?.exclusions ?? {}).filter(([key]) => key !== "cap")
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] ?? [];
  return count > 0 ? { reason, count } : null;
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

function reviewedAutomationFields(scan, candidateProfile, answerLibrary) {
  const profile = candidateProfile ?? {};
  return (scan?.fields ?? []).map((field) => {
    const label = String(field.label ?? "").normalize("NFKC").toLocaleLowerCase();
    const manual = field.category === "sensitive"
      || ["file", "checkbox", "radio", "select"].includes(field.type);
    if (manual) return { ...field, value: "", reviewState: "manual-required", sourceCode: "page-manual" };
    const reusable = findReusableApplicationAnswer(answerLibrary, field.label);
    if (reusable) {
      return { ...field, value: reusable.answer, reviewState: "confirmed", sourceCode: "answer-library" };
    }
    const profileMappings = [
      [/(?:full\s*name|legal\s*name|姓名|全名)/i, profile.name],
      [/(?:e-?mail|邮箱)/i, profile.email],
      [/(?:phone|mobile|telephone|电话|手机)/i, profile.phone],
      [/(?:location|city|所在地|城市)/i, profile.location],
      [/(?:linkedin|个人主页)/i, profile.linkedin],
    ];
    const profileMatch = profileMappings.find(([pattern, value]) => pattern.test(label) && String(value ?? "").trim());
    if (profileMatch) {
      return { ...field, value: String(profileMatch[1]).trim(), reviewState: "confirmed", sourceCode: "profile" };
    }
    return { ...field, value: "", reviewState: "unresolved", sourceCode: field.category === "narrative" ? "answer-library" : "page-manual" };
  });
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
  const hasInitializedScoreRefreshRef = useRef(false);
  const [profileReady, setProfileReady] = useState(() => savedDashboard.profileReady ?? false);
  const [selectedDirection, setSelectedDirection] = useState(() => savedDashboard.selectedDirection ?? null);
  const [applicationState, setApplicationState] = useState(() => normalizeApplicationEventState({
    applications: savedDashboard.applications ?? [],
    applicationEventsById: savedDashboard.applicationEventsById ?? {},
  }));
  const applications = applicationState.applications;
  const applicationEventsById = applicationState.applicationEventsById;
  // Non-status callers retain their simple array updater, while status transitions use
  // the event reducer below so UI, persistence, and audit history change together.
  const setApplications = useCallback((updater) => {
    setApplicationState((current) => ({
      ...current,
      applications: typeof updater === "function" ? updater(current.applications) : updater,
    }));
  }, []);
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
  const [isLocalDataOpen, setIsLocalDataOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("saving");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [backupError, setBackupError] = useState("");
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [clearError, setClearError] = useState("");
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
  const [verifyingJobIds, setVerifyingJobIds] = useState([]);
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
  const [applicationAssistAuthorization, setApplicationAssistAuthorization] = useState({
    contact: false,
    education: false,
    experience: false,
  });
  const [isApplicationAssistConfirmed, setIsApplicationAssistConfirmed] = useState(false);
  const [applicationAssistAcknowledgements, setApplicationAssistAcknowledgements] = useState({
    truth: false, sensitive: false, unknownQuestions: false, warnings: false, duplicate: false,
  });
  const [applicationAssists, setApplicationAssists] = useState(() => savedDashboard.applicationAssists ?? {});
  const [isApplicationAssistOpen, setIsApplicationAssistOpen] = useState(false);
  const [isApplicationAssistLaunching, setIsApplicationAssistLaunching] = useState(false);
  const [applicationsView, setApplicationsView] = useState(() => (
    ["today", "applications", "interviews", "insights"].includes(savedDashboard.applicationsView)
      ? savedDashboard.applicationsView
      : "today"
  ));
  const [applicationAnswerLibrary, setApplicationAnswerLibrary] = useState(() => savedDashboard.applicationAnswerLibrary ?? { schemaVersion: 1, answers: [] });
  const [submissionSessionsById, setSubmissionSessionsById] = useState(() => savedDashboard.submissionSessionsById ?? {});
  const [applicationOperationsById, setApplicationOperationsById] = useState(() => savedDashboard.applicationOperationsById ?? {});
  const [applicationAutomationCapabilities, setApplicationAutomationCapabilities] = useState(null);
  const [applicationAutomationMode, setApplicationAutomationMode] = useState("manual-handoff");
  const [applicationAutomationScan, setApplicationAutomationScan] = useState(null);
  const [submissionReview, setSubmissionReview] = useState(null);
  const [isSubmissionReviewOpen, setIsSubmissionReviewOpen] = useState(false);
  const [isApplicationAutomationScanning, setIsApplicationAutomationScanning] = useState(false);
  const [isSubmissionExecuting, setIsSubmissionExecuting] = useState(false);
  const [isSubmissionAuthorizationConfirmed, setIsSubmissionAuthorizationConfirmed] = useState(false);
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [agentSuggestion, setAgentSuggestion] = useState(() => savedDashboard.agentSuggestion ?? null);
  const [resumeRewriteConsent, setResumeRewriteConsent] = useState(() => normalizeResumeRewriteConsent(savedDashboard.resumeRewriteConsent));
  const [pendingResumeRewrite, setPendingResumeRewrite] = useState(null);
  const saveFailureNotifiedRef = useRef(false);
  const isDataReloadingRef = useRef(false);

  const activeJobPoolsByMarket = useMemo(
    () => mergeJobPools(jobPoolsByMarket, liveJobsByDiscoveryKey),
    [liveJobsByDiscoveryKey],
  );
  const allActiveJobPool = useMemo(
    () => Object.values(activeJobPoolsByMarket).flat(),
    [activeJobPoolsByMarket],
  );
  const selected = applications.find((job) => job.id === selectedId) ?? applications[0];
  const formatJobSignalScore = (job) => (
    hasCurrentJobScore(job) ? formatSignalScore(job.score, uiLanguage) : t("待刷新")
  );
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
  const discoveryJobs = filterDiscoverableJobs(applications, targetMarket, employmentType);
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
  const selectedJobResumeContent = selectedJobResumeVersion?.content ?? "";
  const applicationProfileName = String(candidateProfile.name ?? "");
  const applicationProfileEmail = String(candidateProfile.email ?? "");
  const applicationProfilePhone = String(candidateProfile.phone ?? "");
  const applicationProfileLocation = String(candidateProfile.location ?? "");
  const applicationProfileLinkedin = String(candidateProfile.linkedin ?? "");
  const applicationFieldPacketInput = JSON.stringify({
    profile: {
      name: applicationProfileName,
      email: applicationProfileEmail,
      phone: applicationProfilePhone,
      location: applicationProfileLocation,
      linkedin: applicationProfileLinkedin,
    },
    resumeText: String(selectedJobResumeContent),
  });
  const applicationFieldPacket = useMemo(() => {
    const { profile, resumeText } = JSON.parse(applicationFieldPacketInput);
    return buildApplicationFieldPacket(profile, resumeText);
  }, [applicationFieldPacketInput]);
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
  const applicationContactValidation = validateApplicationContact(candidateProfile);
  const applicationAssistSourceFingerprint = buildApplicationSourceFingerprint({
    candidateProfile,
    resumeText: selectedJobResumeContent,
    job: selected,
    resumeVersionId: selectedJobResumeVersion?.id ?? null,
  });
  const applicationAssistSourceChanged = selected
    ? hasApplicationAssistSourceChanged(selectedApplicationAssist, {
        candidateProfile,
        resumeText: selectedJobResumeContent,
        job: selected,
        resumeVersionId: selectedJobResumeVersion?.id ?? null,
      })
    : false;
  const canLaunchCurrentApplicationAssist = canLaunchApplicationAssist({
    contactValidation: applicationContactValidation,
    authorization: applicationAssistAuthorization,
    isConfirmed: isApplicationAssistConfirmed,
    isLaunching: isApplicationAssistLaunching,
  });
  const hasUnsavedSelectedJobResumeChanges = Boolean(
    (isResumeEditing && activeResumeVersionId === selectedJobResumeVersion?.id)
    || activeJobSuggestion
    || isAgentThinking
    || (pendingResumeRewrite?.job?.id && pendingResumeRewrite.job.id === selected?.id),
  );
  const applicationPreflight = selected ? evaluateApplicationPreflight({
    applicationId: selected.id,
    job: selected,
    applicationUrl: selected.applyUrl || (selected.source === "手动 JD" ? selected.url : ""),
    resumeVersion: selectedJobResumeVersion,
    resumeVersions,
    hasUnsavedResumeChanges: hasUnsavedSelectedJobResumeChanges,
    contact: candidateProfile,
    contactValid: applicationContactValidation.ready,
    authorizedGroups: Object.entries(applicationAssistAuthorization).filter(([, allowed]) => allowed).map(([group]) => group),
    authorizedFieldCount: applicationFieldPacket.groups.filter((group) => applicationAssistAuthorization[group.id]).flatMap((group) => group.fields).length,
    contactAuthorized: applicationAssistAuthorization.contact === true,
    acknowledgements: applicationAssistAcknowledgements,
    applications,
    applicationEventsById,
    sensitiveLinesExcluded: applicationFieldPacket.groups.reduce((count, group) => count + (group.excludedLineCount ?? 0), 0),
    packetSectionsAvailable: applicationFieldPacket.groups.every((group) => group.fields.length > 0),
  }) : null;
  const previewSubmissionAuthorization = submissionReview?.status === "review-ready" && selected
    ? authorizeSubmissionReview(submissionReview, {
        authorizationId: `preview-${submissionReview.id}`,
        company: selected.company,
        role: selected.role,
      }).session
    : null;
  const submissionPreflight = selected && submissionReview && previewSubmissionAuthorization
    ? evaluateSubmissionPreflight({
        applicationId: selected.id,
        job: selected,
        applicationUrl: selected.applyUrl || (selected.source === "手动 JD" ? selected.url : ""),
        resumeVersion: selectedJobResumeVersion,
        resumeVersions,
        hasUnsavedResumeChanges: hasUnsavedSelectedJobResumeChanges,
        contact: candidateProfile,
        contactValid: applicationContactValidation.ready,
        authorizedGroups: Object.entries(applicationAssistAuthorization).filter(([, allowed]) => allowed).map(([group]) => group),
        authorizedFieldCount: applicationFieldPacket.groups.filter((group) => applicationAssistAuthorization[group.id]).flatMap((group) => group.fields).length,
        contactAuthorized: applicationAssistAuthorization.contact === true,
        acknowledgements: { ...applicationAssistAcknowledgements, submit: isSubmissionAuthorizationConfirmed },
        applications,
        applicationEventsById,
        sensitiveLinesExcluded: applicationFieldPacket.groups.reduce((count, group) => count + (group.excludedLineCount ?? 0), 0),
        packetSectionsAvailable: applicationFieldPacket.groups.every((group) => group.fields.length > 0),
        automationAvailable: applicationAutomationCapabilities?.available === true,
        submitControlReady: applicationAutomationScan?.capabilities?.submit === true,
        captchaPresent: applicationAutomationScan?.captchaPresent === true,
        submissionReview,
        authorizedSession: previewSubmissionAuthorization,
      })
    : null;
  const selectedApplicationEvents = selected ? getApplicationEvents(applicationState, selected.id) : [];
  const selectedStatusRevertibility = selected ? getApplicationStatusRevertibility(applicationState, selected.id) : { canRevert: false };
  const selectedNormalizedStatus = selected ? normalizeApplicationStatus(selected.status) : "";
  const todayActionQueue = buildTodayActionQueue({
    applications,
    resumeVersions,
    operationsById: applicationOperationsById,
  });
  const applicationAnalytics = buildApplicationAnalytics(applications);
  const interviewJobs = trackedJobs.filter((job) => normalizeApplicationStatus(job.status) === "面试");

  const buildDashboardSnapshot = useCallback(() => (
    {
      uiLanguage,
      profileReady,
      selectedDirection,
      applications,
      applicationEventsById,
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
      applicationAssists,
      applicationsView,
      applicationAnswerLibrary,
      submissionSessionsById,
      applicationOperationsById,
      discoveryCycles,
      seenJobIdsByMarket,
      liveJobsByDiscoveryKey,
      recommendationMeta,
      agentSuggestion,
      resumeChangeDecisions,
      resumeRewriteConsent,
    }
  ), [
    activeResumeTab, activeResumeVersionId, agentSuggestion, applicationAnswerLibrary,
    applicationAssists, applicationEventsById, applicationOperationsById, applications,
    applicationsView, candidateProfile, customDirections,
    discoveryCycles, employmentType, liveJobsByDiscoveryKey, notesByJobId,
    outputLanguage, profileReady, recommendationMeta, resumeChangeDecisions,
    resumeFile, resumePageSize, resumeRewriteConsent, resumeVersions, reviewDrafts, reviewStatus,
    seenJobIdsByMarket, selectedDirection, selectedId, step, submissionSessionsById,
    targetMarket, targetRole, uiLanguage,
  ]);

  const formattedLastSavedAt = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString(uiLanguage === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "";

  function closeLocalDataModal() {
    setIsLocalDataOpen(false);
    setBackupPassword("");
    setRestorePassword("");
    setRestoreFile(null);
    setBackupError("");
    setRestoreError("");
    setClearError("");
    setClearConfirmation("");
  }

  function downloadEncryptedBackup(backup) {
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `jobmaster-local-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  async function exportLocalDataBackup() {
    setBackupError("");
    if (backupPassword.length < 10) {
      setBackupError("备份密码至少需要 10 个字符。");
      return;
    }
    setIsExportingBackup(true);
    try {
      downloadEncryptedBackup(await createEncryptedDashboardBackup(buildDashboardSnapshot(), backupPassword));
      setBackupPassword("");
      setToast("已下载加密本地草稿备份。请单独安全保存备份密码。");
    } catch (error) {
      setBackupError(error instanceof BackupError
        ? error.message
        : "无法创建加密备份。请检查浏览器是否支持本地加密，并稍后重试。");
    } finally {
      setIsExportingBackup(false);
    }
  }

  async function restoreLocalDataBackup() {
    setRestoreError("");
    if (!restoreFile || restorePassword.length < 10) {
      setRestoreError("请选择备份文件并输入至少 10 个字符的备份密码。");
      return;
    }
    setIsRestoringBackup(true);
    try {
      const backup = await readEncryptedBackupFile(restoreFile);
      const restoredDashboard = await decryptDashboardBackup(backup, restorePassword);
      isDataReloadingRef.current = true;
      writeDashboard(restoredDashboard);
      setToast("已恢复浏览器本地草稿，正在重新加载以应用恢复内容。");
      window.setTimeout(() => window.location.reload(), 550);
    } catch {
      isDataReloadingRef.current = false;
      setRestoreError("无法恢复备份。请确认密码、文件完整性与 Jobmaster 备份格式；当前本地草稿未被覆盖。");
    } finally {
      setIsRestoringBackup(false);
    }
  }

  function clearLocalData() {
    if (clearConfirmation !== "DELETE LOCAL DRAFTS") return;
    setClearError("");
    try {
      isDataReloadingRef.current = true;
      clearKnownDashboards();
      setToast("已删除本网站的 Jobmaster 本地草稿，正在重新加载。");
      window.setTimeout(() => window.location.reload(), 550);
    } catch {
      isDataReloadingRef.current = false;
      setClearError("无法删除本地草稿。请检查浏览器存储权限后重试。");
    }
  }

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
    funnel = null,
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
      jobScoreAlgorithmVersion,
      recommendationFunnelAlgorithmVersion,
      funnel: normalizeRecommendationFunnelMeta(funnel),
    });
  }

  function handleTargetRoleChange(role) {
    setTargetRole(role);
    setSelectedDirection(role);
    if (!masterResumeVersion?.content?.trim()) {
      setRecommendationMeta(null);
      return;
    }
    const funnel = buildRecommendationFunnel(applications, {
      market: targetMarket,
      employmentType,
      resumeText: masterResumeVersion.content,
      targetRole: role,
      customDirections,
      cap: 6,
    });
    const rerankedJobs = funnel.rankedJobs;
    applyRankedRecommendations(rerankedJobs);
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
      funnel,
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
            existingApplyUrls: getLiveOfficialApplyUrls(applications, market, requestedEmploymentType),
          });
          const normalizedLiveJobs = normalizeSearchedJobs(liveSearchResult, market, requestedEmploymentType);
          const nextLiveJobs = {
            ...liveJobsByDiscoveryKey,
            [discoveryKey]: normalizedLiveJobs,
          };
          setLiveJobsByDiscoveryKey(nextLiveJobs);
          if (Array.isArray(liveSearchResult.verificationChecks) && liveSearchResult.verificationChecks.length) {
            applyLiveUrlChecks(liveSearchResult.verificationChecks);
          } else {
            setApplications((current) => markRejectedLiveJobs(current, liveSearchResult.rejectedApplyUrls));
          }
          poolsForRun = mergeJobPools(jobPoolsByMarket, nextLiveJobs);
        } catch (error) {
          liveSearchError = error.message;
        }
      }

      const cycle = discoveryCycles[discoveryKey] ?? 0;
      const seenIds = seenJobIdsByMarket[discoveryKey] ?? [];
      const funnel = buildRecommendationFunnel(Object.values(poolsForRun).flat(), {
        market,
        employmentType: requestedEmploymentType,
        resumeText: masterResumeVersion.content,
        targetRole,
        customDirections,
        cap: 6,
        seenIds,
        cycle,
      });
      const rankedJobs = funnel.rankedJobs.map((job) => ({
        ...job,
        isNew: !seenIds.includes(job.id),
        updated: !seenIds.includes(job.id) ? "本轮新发现" : "刚刚重新匹配",
      }));
      const newCount = rankedJobs.filter((job) => job.isNew).length;
      const nextSeenIds = [...new Set([...seenIds, ...rankedJobs.map((job) => job.id)])];
      const discoverableCount = funnel.counts.relevant;
      const remainingCount = funnel.relevantIds.filter((id) => !nextSeenIds.includes(id)).length;
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
        funnel,
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
        setToast(`${market}${requestedEmploymentType}岗位缓存已看完；本次只重新计算信号分，没有伪装成新增岗位。`);
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

  function handleApplicationTabKeyDown(event) {
    const nextTab = getNextTabKey(tabs, activeTab, event.key);
    if (!nextTab) return;
    event.preventDefault();
    goToReviewTab(nextTab);
    requestAnimationFrame(() => {
      document.getElementById(`application-tab-${tabs.indexOf(nextTab)}`)?.focus();
    });
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
      } else if (isSubmissionReviewOpen && !isSubmissionExecuting) {
        setIsSubmissionReviewOpen(false);
      } else if (isApplicationAssistOpen && !isApplicationAssistLaunching && !isApplicationAutomationScanning) {
        setIsApplicationAssistOpen(false);
      } else if (isCustomDirectionOpen) {
        setIsCustomDirectionOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeEditor, isApplicationAssistOpen, isApplicationAssistLaunching, isApplicationAutomationScanning,
    isCustomDirectionOpen, isImportOpen, isSubmissionExecuting, isSubmissionReviewOpen,
  ]);

  useEffect(() => {
    if (!isApplicationAssistOpen || applicationAutomationCapabilities) return;
    let active = true;
    getApplicationAutomationCapabilities()
      .then((capabilities) => {
        if (active) setApplicationAutomationCapabilities(capabilities);
      })
      .catch(() => {
        if (active) setApplicationAutomationCapabilities({ available: false, providers: [], modes: [] });
      });
    return () => { active = false; };
  }, [applicationAutomationCapabilities, isApplicationAssistOpen]);

  useEffect(() => {
    if (!isApplicationAssistOpen || applicationAutomationMode === "manual-handoff"
      || !applicationAutomationCapabilities || !selected) return;
    const provider = selected.sourceReceipt?.provider ?? "unknown";
    if (!applicationAutomationCapabilities.providers?.includes(provider)) {
      setApplicationAutomationMode("manual-handoff");
      setIsApplicationAssistConfirmed(false);
    }
  }, [
    applicationAutomationCapabilities,
    applicationAutomationMode,
    isApplicationAssistOpen,
    selected,
  ]);

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
      if (isDataReloadingRef.current) return;
      setSaveStatus("saving");
      try {
        writeDashboard(buildDashboardSnapshot());
        setLastSavedAt(new Date().toISOString());
        setSaveStatus("saved");
        saveFailureNotifiedRef.current = false;
      } catch {
        setSaveStatus("error");
        if (!saveFailureNotifiedRef.current) {
          saveFailureNotifiedRef.current = true;
          setToast("浏览器未能写入本地草稿。请导出加密备份、清理本站数据或检查浏览器空间。");
        }
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [buildDashboardSnapshot]);

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
        jobScoreAlgorithmVersion: job.jobScoreAlgorithmVersion,
        scoreBreakdown: job.scoreBreakdown,
        matchConfidence: job.matchConfidence,
        matchLabel: job.matchLabel,
        updated: job.updated,
        matchSignals: job.matchSignals,
        matchedEvidence: job.matchedEvidence,
        missingSignals: job.missingSignals,
        isNew: job.isNew,
        userTracked: job.userTracked,
      };
    }));
  }, [allActiveJobPool, setApplications]);

  useEffect(() => {
    if (!masterResumeVersion?.content?.trim()) return;
    if (!hasInitializedScoreRefreshRef.current) {
      hasInitializedScoreRefreshRef.current = true;
      return;
    }
    setApplications((current) => current.map((job) => (
      job.stage === "进行中"
        ? analyzeJobForResume(job, masterResumeVersion.content, targetRole, customDirections)
        : job
    )));
  }, [masterResumeVersion?.content, targetRole, customDirections, setApplications]);

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

  useEffect(() => {
    if (!isApplicationAssistOpen || isApplicationAssistLaunching) return;
    setIsApplicationAssistConfirmed(false);
    setApplicationAssistAcknowledgements({
      truth: false, sensitive: false, unknownQuestions: false, warnings: false, duplicate: false,
    });
  }, [
    applicationAssistSourceFingerprint,
    applicationPreflight?.receiptFingerprint,
    isApplicationAssistLaunching,
    isApplicationAssistOpen,
  ]);

  useEffect(() => {
    if (isSubmissionExecuting || !applicationAutomationScan || applicationAutomationScan.applicationId === selected?.id) return;
    closeApplicationAutomationSession(applicationAutomationScan.sessionId).catch(() => {});
    setApplicationAutomationScan(null);
    setSubmissionReview(null);
    setIsSubmissionReviewOpen(false);
    setIsSubmissionAuthorizationConfirmed(false);
  }, [applicationAutomationScan, isSubmissionExecuting, selected?.id]);

  useEffect(() => {
    if (!selectedNormalizedStatus) return;
    setReviewStatus((current) => current === selectedNormalizedStatus ? current : selectedNormalizedStatus);
  }, [selectedNormalizedStatus]);

  async function executeResumeRewrite(rewrite) {
    if (!rewrite || isAgentThinking) return false;
    const { payload, options, sourceVersion, sourceText, job, isJobRewrite } = rewrite;
    setPendingResumeRewrite(null);
    if (isJobRewrite) {
      if (job?.id) {
        setSelectedId(job.id);
        setReviewStatus("准备中");
        setApplicationState((current) => {
          const transitioned = transitionApplicationStatus(current, job.id, "准备中", { updated: "正在根据 JD 定制" });
          return transitioned.changed ? transitioned.state : {
            ...current,
            applications: current.applications.map((item) => item.id === job.id
              ? { ...item, userTracked: true, updated: "正在根据 JD 定制" } : item),
          };
        });
      }
      setStep("review");
      setActiveTab("定制简历");
    } else {
      setStep("evidence");
    }
    setToast(t("正在请求 Codex 模型生成可审核建议…"));
    setIsAgentThinking(true);
    try {
      const result = await requestResumeRewriteFromAgent(payload);
      setAgentSuggestion({
        ...result,
        id: createLocalId("suggestion"),
        sourceText,
        reviewedResume: sourceText,
        sourceVersionId: sourceVersion?.id ?? "master-resume",
        sourceDocumentMeta: sourceVersion?.documentMeta ?? masterResumeVersion?.documentMeta ?? {},
        suggestedName: options.suggestedName ?? `${payload.targetRole} · Codex 建议版`,
        suggestedTarget: options.suggestedTarget ?? payload.targetRole,
        layer: options.layer ?? "direction",
        jobId: options.jobId,
        jdText: options.jdText ?? "",
        jdHash: options.jdHash ?? "",
        jdSource: options.jdSource ?? "",
      });
      setResumePreviewMode("compare");
      setToast(t("本机代理 · Codex 模型处理已生成完整简历建议，确认后可保存为新版本。"));
      return true;
    } catch (error) {
      setToast(`${options.layer === "job" ? "岗位版" : "方向版"}生成失败：${error.message}`);
      return false;
    } finally {
      setIsAgentThinking(false);
    }
  }

  function cancelPendingResumeRewrite() {
    if (!pendingResumeRewrite) return;
    setPendingResumeRewrite(null);
    setToast(t("已取消 AI 改写授权，未发送简历或 JD。"));
  }

  async function approvePendingResumeRewrite(choice) {
    const rewrite = pendingResumeRewrite;
    if (!rewrite || isAgentThinking) return false;
    const decision = decideResumeRewriteConsent(choice);
    if (decision.rememberedConsent) setResumeRewriteConsent(decision.rememberedConsent);
    if (!decision.execute) {
      cancelPendingResumeRewrite();
      return false;
    }
    return executeResumeRewrite(rewrite);
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
        lineage: {
          parentVersionId: agentSuggestion.sourceVersionId ?? masterResumeVersion?.id,
          baseHash: suggestionChanges[0]?.baseHash ?? "",
          patchVersion: 2,
        },
        patchAudit: suggestionChanges.map((change, index) => ({
          patchId: change.patchId,
          patchVersion: change.patchVersion,
          baseHash: change.baseHash,
          targetBlockId: change.targetBlockId,
          before: change.before,
          after: change.after,
          decision: resumeChangeDecisions[resumeDecisionKey(suggestionScope, change, index)]
            ?? resumeChangeDecisions[`${suggestionScope}:${index}`]
            ?? "pending",
        })),
        reviewSummary: {
          accepted: reviewSummary.accepted,
          rejected: reviewSummary.rejected,
          total: suggestionChanges.length,
        },
        updated: "刚刚由本机代理 · Codex 模型处理生成",
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
    if (isAgentThinking || pendingResumeRewrite || !masterResumeVersion?.content) {
      if (isAgentThinking || pendingResumeRewrite) return false;
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
    const message = normalizedJobTitle
        ? `请严格根据随请求提供的 ${normalizedJobTitle} 职位描述微调这份简历。必须保留原版的章节结构、模板、姓名、联系方式、教育、经历、项目和日期；只允许改写 bullet、调整章节内部顺序，或在原版已有经历和项目之间进行取舍，不添加任何原文没有的公司、项目、技能或指标。`
        : `请按 ${targetMarket} 市场、${outputLanguage} 和 ${roleOverride} 方向改写这份简历。必须保持原版章节结构和模板不变；只允许改写现有内容、调整章节内部 bullet 顺序，或从原版已有经历和项目中进行取舍。不得添加原文没有的事实、指标、公司、项目或技能。`;
    const sourceText = sourceVersion.content;
    const payload = createResumeRewritePayload({
      message,
      resumeText: sourceText,
      market: targetMarket,
      language: outputLanguage,
      targetRole: job?.role ?? roleOverride,
      jdText: job?.jdText ?? "",
    });
    const rewrite = {
      payload,
      sourceVersion,
      sourceText,
      job,
      isJobRewrite: Boolean(normalizedJobTitle),
      options: {
        suggestedName: normalizedJobTitle ?? roleOverride,
        suggestedTarget: target,
        layer: normalizedJobTitle ? "job" : "direction",
        jobId: normalizedJobTitle ? job?.id ?? selected?.id : undefined,
        jdText: payload.jdText,
        jdHash: job?.jdHash ?? "",
        jdSource: job?.jdSource ?? "",
      },
      summary: summarizeResumeRewritePayload(payload, sourceVersion?.name ?? "Master Resume"),
    };
    if (resumeRewriteConsent) return executeResumeRewrite(rewrite);
    setPendingResumeRewrite(rewrite);
    return false;
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

  function setResumeChangeDecision(change, index, decision) {
    if (!agentSuggestion) return;
    const scope = getSuggestionScope(agentSuggestion);
    const changes = computeResumeChanges(agentSuggestion.sourceText, agentSuggestion.suggestedResume);
    const nextDecisions = {
      ...resumeChangeDecisions,
      [resumeDecisionKey(scope, change, index)]: decision,
    };
    const result = materializeResumeReview(agentSuggestion.sourceText, changes, nextDecisions, scope);
    if (result.status === "conflict") {
      setToast(t("无法安全定位这处原文，未修改简历；请重新生成建议后再审核。"));
      return;
    }
    setAgentSuggestion((current) => current ? { ...current, reviewedResume: result.text } : current);
    setResumeChangeDecisions(nextDecisions);
    setToast(decision === "accepted"
      ? `已接受第 ${index + 1} 处修改。`
      : `已拒绝第 ${index + 1} 处修改，保留对应原文。`);
  }

  function acceptResumeChange(change, index) {
    setResumeChangeDecision(change, index, "accepted");
  }

  function rejectResumeChange(change, index) {
    setResumeChangeDecision(change, index, "rejected");
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
      const funnel = buildRecommendationFunnel(allActiveJobPool, {
        market: targetMarket,
        employmentType,
        resumeText: importedText,
        targetRole,
        customDirections,
        cap: 6,
        seenIds,
        cycle: 0,
      });
      const rankedJobs = funnel.rankedJobs.map((job) => ({
        ...job,
        isNew: !seenIds.includes(job.id),
        updated: !seenIds.includes(job.id) ? "刚刚发现并匹配" : "刚刚重新匹配",
      }));
      const nextSeenIds = [...new Set([...seenIds, ...rankedJobs.map((job) => job.id)])];
      const remainingCount = funnel.relevantIds.filter((id) => !nextSeenIds.includes(id)).length;
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
        funnel,
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

  function updateApplicationStatus(applicationId, status, updated = "刚刚更新") {
    if (!applicationId) return;
    setApplicationState((current) => transitionApplicationStatus(current, applicationId, status, { updated }).state);
    if (status === "已投递") {
      setApplicationOperationsById((current) => {
        if (current[applicationId]?.followUpAt) return current;
        const followUpAt = addBusinessDays(new Date().toISOString(), 5);
        return scheduleApplicationFollowUp(current, applicationId, followUpAt).operationsById;
      });
    }
  }

  function updateInterviewField(job, field, value) {
    if (!job?.id) return;
    setApplicationOperationsById((current) => {
      const existing = current[job.id]?.interview ?? {};
      const nextValue = field === "scheduledAt" && value
        ? new Date(value).toISOString()
        : value;
      return updateApplicationInterview(current, job.id, {
        ...existing,
        stage: existing.stage || "面试",
        [field]: nextValue,
      }).operationsById;
    });
  }

  async function copyApplicationFollowUp(job) {
    if (!navigator.clipboard?.writeText) {
      setToast(t("无法复制跟进模板。请检查浏览器剪贴板权限后重试。"));
      return;
    }
    try {
      await navigator.clipboard.writeText(applicationFollowUpDraft(job, uiLanguage));
      setToast(t("已复制跟进模板。发送前请补充收件人与具体上下文。"));
    } catch {
      setToast(t("无法复制跟进模板。请检查浏览器剪贴板权限后重试。"));
    }
  }

  function markApplicationFollowedUp(job) {
    setApplicationOperationsById((current) => (
      recordApplicationFollowUp(current, job.id).operationsById
    ));
    setToast(t("已标记为本人完成跟进；此操作不会发送邮件。"));
  }

  function updateSelectedReviewStatus(status) {
    setReviewStatus(status);
    if (!selected?.id) return;
    updateApplicationStatus(selected.id, status);
  }

  function revertSelectedReviewStatus() {
    if (!selected?.id) return;
    setApplicationState((current) => revertLatestApplicationStatusChange(
      current,
      selected.id,
      { updated: "刚刚撤销" },
    ).state);
  }

  function applyLiveUrlChecks(checks) {
    setApplications((current) => applyLiveUrlVerificationResults(current, checks));
    setLiveJobsByDiscoveryKey((current) => Object.fromEntries(
      Object.entries(current).map(([key, jobs]) => [
        key,
        applyLiveUrlVerificationResults(Array.isArray(jobs) ? jobs : [], checks),
      ]),
    ));
  }

  function isJobUrlVerifying(job) {
    return Boolean(job?.id && verifyingJobIds.includes(job.id));
  }

  function evaluateCurrentApplicationPreflight(job) {
    return evaluateApplicationPreflight({
      applicationId: job.id, job, applicationUrl: job.applyUrl || (job.source === "手动 JD" ? job.url : ""),
      resumeVersion: selectedJobResumeVersion, resumeVersions,
      hasUnsavedResumeChanges: hasUnsavedSelectedJobResumeChanges,
      contact: candidateProfile, contactValid: applicationContactValidation.ready,
      authorizedGroups: Object.entries(applicationAssistAuthorization).filter(([, allowed]) => allowed).map(([group]) => group),
      authorizedFieldCount: applicationFieldPacket.groups.filter((group) => applicationAssistAuthorization[group.id]).flatMap((group) => group.fields).length,
      contactAuthorized: applicationAssistAuthorization.contact === true,
      acknowledgements: applicationAssistAcknowledgements, applications, applicationEventsById,
      sensitiveLinesExcluded: applicationFieldPacket.groups.reduce((count, group) => count + (group.excludedLineCount ?? 0), 0),
      packetSectionsAvailable: applicationFieldPacket.groups.every((group) => group.fields.length > 0),
    });
  }

  function evaluateCurrentSubmissionPreflight(job, review, authorizedSession) {
    return evaluateSubmissionPreflight({
      applicationId: job.id,
      job,
      applicationUrl: job.applyUrl || (job.source === "手动 JD" ? job.url : ""),
      resumeVersion: selectedJobResumeVersion,
      resumeVersions,
      hasUnsavedResumeChanges: hasUnsavedSelectedJobResumeChanges,
      contact: candidateProfile,
      contactValid: applicationContactValidation.ready,
      authorizedGroups: Object.entries(applicationAssistAuthorization).filter(([, allowed]) => allowed).map(([group]) => group),
      authorizedFieldCount: applicationFieldPacket.groups.filter((group) => applicationAssistAuthorization[group.id]).flatMap((group) => group.fields).length,
      contactAuthorized: applicationAssistAuthorization.contact === true,
      acknowledgements: { ...applicationAssistAcknowledgements, submit: true },
      applications,
      applicationEventsById,
      sensitiveLinesExcluded: applicationFieldPacket.groups.reduce((count, group) => count + (group.excludedLineCount ?? 0), 0),
      packetSectionsAvailable: applicationFieldPacket.groups.every((group) => group.fields.length > 0),
      automationAvailable: applicationAutomationCapabilities?.available === true,
      submitControlReady: applicationAutomationScan?.capabilities?.submit === true,
      captchaPresent: applicationAutomationScan?.captchaPresent === true,
      submissionReview: review,
      authorizedSession,
    });
  }

  async function openJobSource(job, { preflightMetadata = null } = {}) {
    if (job?.verificationStatus === "unavailable") {
      setToast("官网已确认该岗位失效，已保留你的求职记录。");
      return false;
    }
    let verifiedJob = job;
    let eventMetadata = preflightMetadata;
    const applicationUrl = job?.applyUrl || (job?.source === "手动 JD" ? job.url : "");
    if (!applicationUrl || !isSpecificApplicationUrl(applicationUrl)) {
      setToast("这个岗位缺少具体申请链接，不会跳转到公司招聘首页。请重新导入并补充职位链接。");
      return false;
    }
    const requiresFreshVerification = job?.verificationStatus !== "verified"
      || !hasFreshOpenSourceReceipt(job);
    if (requiresFreshVerification && isJobUrlVerifying(job)) return false;
    const reservedApplicationWindow = reserveApplicationWindow(window.open.bind(window));
    if (!reservedApplicationWindow) {
      setToast(t("浏览器拦截了申请页预留窗口。请允许弹窗后重新打开此岗位。"));
      return false;
    }
    if (requiresFreshVerification) {
      setVerifyingJobIds((current) => [...current, job.id]);
      setApplications((current) => current.map((item) => (
        item.id === job.id ? { ...item, userTracked: true, updated: "正在重新核验官网链接" } : item
      )));
      setToast(t("正在重新核验官网职位链接…"));
      let check = { url: applicationUrl, state: "unknown", checkedAt: new Date().toISOString() };
      try {
        const result = await verifyOfficialJobUrls([applicationUrl]);
        const responseCheck = Array.isArray(result?.checks)
          ? result.checks.find((item) => item?.url === applicationUrl)
          : null;
        if (responseCheck && ["open", "closed", "unknown"].includes(responseCheck.state)) check = responseCheck;
      } catch {
        // A local network or Agent failure is an unknown state, never closure.
      } finally {
        setVerifyingJobIds((current) => current.filter((id) => id !== job.id));
      }
      verifiedJob = {
        ...job,
        verificationStatus: check.state === "closed" ? "unavailable" : check.state === "open" ? "verified" : "unknown",
        verifiedAt: check.checkedAt ?? job.verifiedAt,
        sourceReceipt: updateSourceReceiptVerification(job, check),
      };
      setApplications((current) => current.map((item) => item.id === job.id ? { ...item, ...verifiedJob } : item));
      applyLiveUrlChecks([check]);
      if (check.state === "closed") {
        closeReservedApplicationWindow(reservedApplicationWindow);
        setToast("官网已确认该岗位失效，已保留你的求职记录。");
        return false;
      }
      if (check.state !== "open") {
        closeReservedApplicationWindow(reservedApplicationWindow);
        setToast(t("官网链接暂时无法确认，未自动打开。请稍后重试。"));
        return false;
      }
    }
    if (eventMetadata) {
      const finalPreflight = evaluateCurrentApplicationPreflight(verifiedJob);
      if (!finalPreflight.ready) {
        closeReservedApplicationWindow(reservedApplicationWindow);
        setToast(t("官网复核后申请前检查发生变化，请确认全部警告后重试。"));
        return false;
      }
      const previousWarnings = [...(eventMetadata.warningCodes ?? [])].sort();
      const finalWarnings = [...finalPreflight.warnings].sort();
      if (previousWarnings.join("\u0000") !== finalWarnings.join("\u0000")) {
        closeReservedApplicationWindow(reservedApplicationWindow);
        setApplicationAssistAcknowledgements((current) => ({ ...current, warnings: false }));
        setToast(t("官网复核更新了人工复核警告，请重新确认后再打开。"));
        return false;
      }
      eventMetadata = {
        ...eventMetadata,
        sourceReceiptFingerprint: finalPreflight.receiptFingerprint,
        warningCodes: finalPreflight.warnings,
      };
    }
    if (!navigateReservedApplicationWindow(reservedApplicationWindow, applicationUrl)) {
      closeReservedApplicationWindow(reservedApplicationWindow);
      setToast(t("申请页预留窗口已关闭，未自动打开。请重新打开此岗位。"));
      return false;
    }
    setApplicationState((current) => {
      let next = {
        ...current,
        applications: current.applications.map((item) => (
          item.id === job.id ? { ...item, userTracked: true, updated: "刚刚打开申请页" } : item
        )),
      };
      if (eventMetadata) next = appendPreflightPassed(next, job.id, { metadata: eventMetadata }).state;
      return appendApplicationOpened(next, job.id, { metadata: eventMetadata ?? {} }).state;
    });
    setToast(`已打开 ${job.company} 的具体职位申请页。`);
    return true;
  }

  function updateCandidateProfile(field, value) {
    setCandidateProfile((current) => ({ ...current, [field]: value }));
    setIsApplicationAssistConfirmed(false);
    setApplicationAssistAcknowledgements({ truth: false, sensitive: false, unknownQuestions: false, warnings: false, duplicate: false });
  }

  function toggleApplicationAssistAuthorization(field) {
    if (!applicationFieldPacket.groups.find((group) => group.id === field)?.fields.length) return;
    setApplicationAssistAuthorization((current) => ({ ...current, [field]: !current[field] }));
    setIsApplicationAssistConfirmed(false);
    setApplicationAssistAcknowledgements({ truth: false, sensitive: false, unknownQuestions: false, warnings: false, duplicate: false });
  }

  function prepareApplicationAssist() {
    if (!selected || isApplicationAssistLaunching || isApplicationAutomationScanning || isSubmissionExecuting) return;
    if (!selectedJobResumeVersion) {
      setActiveTab("定制简历");
      setToast(t("先生成并保存这份岗位版简历，再核对本地字段包。"));
      return;
    }
    setActiveResumeVersionId(selectedJobResumeVersion.id);
    setApplicationAssistAuthorization({ contact: false, education: false, experience: false });
    setIsApplicationAssistConfirmed(false);
    setApplicationAssistAcknowledgements({ truth: false, sensitive: false, unknownQuestions: false, warnings: false, duplicate: false });
    setIsSubmissionAuthorizationConfirmed(false);
    setIsApplicationAssistOpen(true);
  }

  function closeApplicationAssist() {
    if (isApplicationAssistLaunching || isApplicationAutomationScanning) return;
    setIsApplicationAssistOpen(false);
  }

  async function copyApplicationFields(fields) {
    const copyText = fields.map((field) => `${field.label}:\n${field.value}`).join("\n\n");
    if (!copyText || !navigator.clipboard?.writeText) {
      setToast(t("无法复制字段。请检查浏览器剪贴板权限后重试。"));
      return false;
    }
    try {
      await navigator.clipboard.writeText(copyText);
      setToast(t("已复制本地字段到系统剪贴板；未发送到网络。"));
      return true;
    } catch {
      setToast(t("无法复制字段。请检查浏览器剪贴板权限后重试。"));
      return false;
    }
  }

  async function launchApplicationAssist() {
    if (!selected || isApplicationAssistLaunching) return;
    if (selected.verificationStatus === "unavailable") {
      setToast("官网已确认该岗位失效，已保留你的求职记录。");
      return;
    }
    if (!canLaunchCurrentApplicationAssist || !applicationPreflight?.ready) {
      setToast(applicationContactValidation.reason === "invalid-email"
        ? t("请填写格式正确的邮箱；不会猜测或改写邮箱。")
        : t("先补齐姓名和邮箱，并明确允许使用联系方式。"));
      return;
    }
    const applicationUrl = selected.applyUrl || (selected.source === "手动 JD" ? selected.url : "");
    if (!isSpecificApplicationUrl(applicationUrl)) {
      setToast(t("当前岗位没有具体申请链接。补充具体职位链接后再核对并打开字段包。"));
      return;
    }
    const job = selected;
    const resumeVersion = selectedJobResumeVersion;
    const allowedGroups = Object.entries(applicationAssistAuthorization)
      .filter(([, allowed]) => allowed)
      .map(([group]) => group);
    const audit = createApplicationAssistAudit({
      job,
      resumeVersionId: resumeVersion?.id ?? null,
      allowedGroups,
      packet: applicationFieldPacket,
      candidateProfile,
      resumeText: resumeVersion?.content ?? "",
    });
    setIsApplicationAssistLaunching(true);
    try {
      if (await openJobSource(job, {
        preflightMetadata: {
          resumeVersionId: resumeVersion?.id ?? "unknown",
          sourceReceiptFingerprint: applicationPreflight.receiptFingerprint,
          authorizedGroups: allowedGroups,
          warningCodes: applicationPreflight.warnings,
        },
      })) {
        setApplicationAssists((current) => ({ ...current, [job.id]: audit }));
        setIsApplicationAssistOpen(false);
        setToast(t("已打开职位申请页。当前选择的是手动流程，最终填写与提交由本人完成。"));
      }
    } finally {
      setIsApplicationAssistLaunching(false);
    }
  }

  async function scanApplicationForAutomation() {
    if (!selected || !selectedJobResumeVersion || isApplicationAutomationScanning
      || !canLaunchCurrentApplicationAssist || !applicationPreflight?.ready) return;
    if (applicationAutomationMode === "manual-handoff" || applicationAutomationCapabilities?.available !== true) {
      setToast(t("本地自动化桥尚未连接；请使用手动官网流程。"));
      return;
    }
    const applicationUrl = selected.applyUrl || (selected.source === "手动 JD" ? selected.url : "");
    if (!isSpecificApplicationUrl(applicationUrl)) {
      setToast(t("当前岗位没有具体申请链接。补充具体职位链接后再扫描官网表单。"));
      return;
    }
    const sessionId = applicationAutomationScan?.applicationId === selected.id
      ? applicationAutomationScan.sessionId
      : `scan-${globalThis.crypto?.randomUUID?.() ?? createLocalId("application")}`;
    setIsApplicationAutomationScanning(true);
    try {
      const scan = await scanApplicationPage({
        sessionId,
        applicationId: selected.id,
        applicationUrl,
        provider: selected.sourceReceipt?.provider === "unknown" ? "" : selected.sourceReceipt?.provider,
        providerJobId: selected.sourceReceipt?.providerJobId,
      });
      const verificationCheck = {
        url: applicationUrl,
        state: scan.verification?.state === "open" ? "open" : "unknown",
        checkedAt: scan.verification?.checkedAt ?? new Date().toISOString(),
        reason: scan.verification?.reason ?? "network-or-inconclusive",
      };
      const verifiedJob = {
        ...selected,
        verificationStatus: verificationCheck.state === "open" ? "verified" : "unknown",
        verifiedAt: verificationCheck.checkedAt,
        sourceReceipt: updateSourceReceiptVerification(selected, verificationCheck),
      };
      const refreshedPreflight = evaluateCurrentApplicationPreflight(verifiedJob);
      setApplications((current) => current.map((job) => job.id === selected.id ? verifiedJob : job));
      applyLiveUrlChecks([verificationCheck]);
      if (!refreshedPreflight.ready) {
        setIsApplicationAssistConfirmed(false);
        setToast(t("官网重新核验后申请前检查发生变化，请重新确认。"));
        return;
      }
      setApplicationAutomationScan(scan);
      if (scan.captchaPresent) {
        setToast(t("检测到人机验证。请在专用 Chrome 中亲自完成验证，然后重新扫描；Jobmaster 不会绕过验证码。"));
        return;
      }
      const review = createSubmissionReview({
        id: `submission-${globalThis.crypto?.randomUUID?.() ?? createLocalId(selected.id)}`,
        applicationId: selected.id,
        company: selected.company,
        role: selected.role,
        provider: scan.provider,
        providerJobId: scan.providerJobId,
        resumeVersionId: selectedJobResumeVersion.id,
        receiptFingerprint: refreshedPreflight.receiptFingerprint,
        pageFingerprint: scan.pageFingerprint,
        modeRequested: applicationAutomationMode,
        fields: reviewedAutomationFields(scan, candidateProfile, applicationAnswerLibrary),
      });
      if (!review || !scan.capabilities?.fill) {
        setToast(t("官网表单没有可安全识别的字段，已保留专用浏览器供手动处理。"));
        return;
      }
      const allowedGroups = Object.entries(applicationAssistAuthorization)
        .filter(([, allowed]) => allowed)
        .map(([group]) => group);
      const audit = createApplicationAssistAudit({
        job: selected,
        resumeVersionId: selectedJobResumeVersion.id,
        allowedGroups,
        packet: applicationFieldPacket,
        candidateProfile,
        resumeText: selectedJobResumeVersion.content,
      });
      const metadata = {
        resumeVersionId: selectedJobResumeVersion.id,
        sourceReceiptFingerprint: refreshedPreflight.receiptFingerprint,
        authorizedGroups: allowedGroups,
        warningCodes: refreshedPreflight.warnings,
      };
      setApplicationState((current) => {
        const checked = appendPreflightPassed(current, selected.id, { metadata }).state;
        return appendApplicationOpened(checked, selected.id, { metadata }).state;
      });
      setApplicationAssists((current) => ({ ...current, [selected.id]: audit }));
      setSubmissionReview(review);
      setIsSubmissionAuthorizationConfirmed(false);
      setIsApplicationAssistOpen(false);
      setIsSubmissionReviewOpen(true);
      setToast(t("官网字段扫描完成。请逐项审核最终内容后再授权。"));
    } catch (error) {
      setToast(`${t("官网表单扫描失败")}: ${error.message}`);
    } finally {
      setIsApplicationAutomationScanning(false);
    }
  }

  function updateSubmissionReviewField(fieldId, patch) {
    setSubmissionReview((current) => {
      if (!current) return current;
      const fields = current.fields.map((field) => field.id === fieldId ? { ...field, ...patch } : field);
      return createSubmissionReview({ ...current, fields, createdAt: current.createdAt });
    });
    setIsSubmissionAuthorizationConfirmed(false);
  }

  function saveSubmissionAnswer(field) {
    const result = upsertApplicationAnswer(applicationAnswerLibrary, {
      question: field.label,
      answer: field.value,
      category: field.category,
      state: "confirmed",
      sourceCode: "user-confirmed",
    });
    setApplicationAnswerLibrary(result.library);
    setToast(result.changed ? t("已保存到浏览器本地答案库。") : t("这个答案无法保存，请检查内容。"));
  }

  function updateSavedApplicationAnswer(answer, value) {
    const result = upsertApplicationAnswer(applicationAnswerLibrary, {
      question: answer.question,
      answer: value,
      category: answer.category,
      state: value.trim() ? "confirmed" : "draft",
      sourceCode: "user-confirmed",
    });
    if (result.changed) setApplicationAnswerLibrary(result.library);
  }

  function deleteSavedApplicationAnswer(answerId) {
    const result = removeApplicationAnswer(applicationAnswerLibrary, answerId);
    if (!result.changed) return;
    setApplicationAnswerLibrary(result.library);
    setToast(t("已从浏览器本地答案库删除。"));
  }

  function closeSubmissionReview({ keepBrowser = false } = {}) {
    if (isSubmissionExecuting) return;
    if (!keepBrowser && applicationAutomationScan?.sessionId) {
      closeApplicationAutomationSession(applicationAutomationScan.sessionId).catch(() => {});
      setApplicationAutomationScan(null);
      setSubmissionReview(null);
    }
    setIsSubmissionReviewOpen(false);
    setIsSubmissionAuthorizationConfirmed(false);
  }

  async function executeSubmissionReviewOnce() {
    if (!selected || !submissionReview || !applicationAutomationScan || isSubmissionExecuting
      || !isSubmissionAuthorizationConfirmed || !submissionPreflight?.ready) return;
    const authorizationId = `auth-${globalThis.crypto?.randomUUID?.() ?? createLocalId("submission")}`;
    const attemptId = `attempt-${globalThis.crypto?.randomUUID?.() ?? createLocalId("submission")}`;
    const authorized = authorizeSubmissionReview(submissionReview, {
      authorizationId,
      company: selected.company,
      role: selected.role,
    });
    if (!authorized.changed) {
      setToast(`${t("无法创建单次投递授权")}: ${authorized.reason}`);
      return;
    }
    const finalPreflight = evaluateCurrentSubmissionPreflight(selected, submissionReview, authorized.session);
    if (!finalPreflight.ready) {
      setIsSubmissionAuthorizationConfirmed(false);
      setToast(t("投递内容或页面状态已变化，请重新审核。"));
      return;
    }
    const initialMetadata = submissionAuditMetadata(authorized.session);
    const startedMetadata = { ...initialMetadata, attemptId };
    setSubmissionSessionsById((current) => ({ ...current, [authorized.session.id]: authorized.session }));
    setApplicationState((current) => {
      const next = appendSubmissionAuthorized(current, selected.id, { metadata: initialMetadata }).state;
      return appendSubmissionStarted(next, selected.id, { metadata: startedMetadata }).state;
    });
    setIsSubmissionExecuting(true);
    try {
      const result = await executeReviewedApplication({
        sessionId: applicationAutomationScan.sessionId,
        review: submissionReview,
        authorizedSession: authorized.session,
        attemptId,
      });
      setSubmissionSessionsById((current) => ({ ...current, [result.session.id]: result.session }));
      const metadata = submissionAuditMetadata(result.session);
      setApplicationState((current) => {
        let next = current;
        if (result.status === "submitted") {
          next = appendSubmissionCompleted(next, selected.id, { metadata }).state;
          return transitionApplicationStatus(next, selected.id, "已投递", { updated: "刚刚确认投递成功" }).state;
        }
        return appendSubmissionPaused(next, selected.id, { metadata }).state;
      });
      if (result.status === "submitted") {
        setApplicationOperationsById((current) => recordConfirmedSubmission(current, selected.id, {
          submittedAt: result.session.completedAt,
          resumeVersionId: result.session.resumeVersionId,
          receiptFingerprint: result.session.receiptFingerprint,
          payloadFingerprint: result.session.payloadFingerprint,
        }).operationsById);
        setReviewStatus("已投递");
        setIsSubmissionReviewOpen(false);
        await closeApplicationAutomationSession(applicationAutomationScan.sessionId).catch(() => {});
        setApplicationAutomationScan(null);
        setSubmissionReview(null);
        setToast(t("官网已返回提交确认。已记录投递版本，并安排五个工作日后的跟进。"));
      } else {
        setIsSubmissionReviewOpen(false);
        setIsApplicationAssistOpen(true);
        setIsSubmissionAuthorizationConfirmed(false);
        setToast(t(result.status === "filled"
          ? "已填写所有获授权字段并停在提交前。请在官网检查，若要改为自动提交必须重新扫描、审核并再次授权。"
          : "自动化已停止在需要本人处理的位置。完成官网字段后请重新扫描并审核。"));
      }
    } catch (error) {
      setApplicationState((current) => appendSubmissionFailed(current, selected.id, {
        metadata: { ...startedMetadata, resultCode: "bridge-error" },
      }).state);
      setIsSubmissionReviewOpen(false);
      setIsApplicationAssistOpen(true);
      setIsSubmissionAuthorizationConfirmed(false);
      setToast(`${t("单次自动化执行失败")}: ${error.message}`);
    } finally {
      setIsSubmissionExecuting(false);
    }
  }

  function watchJob(job) {
    setApplicationState((current) => transitionApplicationStatus(current, job.id, "收藏", { updated: "刚刚收藏" }).state);
    setToast(`已收藏 ${job.company} - ${job.role}，可以在已投递页继续跟踪。`);
  }

  function archiveJob(job) {
    const nextJob = applications.find((item) => item.id !== job.id && item.stage === "进行中");
    setApplicationState((current) => transitionApplicationStatus(current, job.id, "已归档", { updated: "刚刚忽略" }).state);
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
          jdHashAlgorithm: importedBaseJob.jdHashAlgorithm,
          sourceReceipt: {
            ...importedBaseJob.sourceReceipt,
            ...deriveOfficialJobProvider(applicationUrl || existingJob.applyUrl || existingJob.url),
            postingUrl: derivePostingUrl(applicationUrl || existingJob.url || ""),
            applyUrl: normalizeReceiptUrl(applicationUrl || existingJob.applyUrl || ""),
          },
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
    setApplicationState((current) => {
      const eventBaseJob = existingJob ? { ...importedJob, status: existingJob.status, statusKey: existingJob.statusKey, stage: existingJob.stage } : importedJob;
      const interim = { ...current, applications: [eventBaseJob, ...current.applications.filter((job) => job.id !== importedJob.id)] };
      return existingJob
        ? transitionApplicationStatus(interim, importedJob.id, "收藏", { updated: "刚刚导入" }).state
        : interim;
    });
    setSelectedId(importedJob.id);
    setReviewStatus(normalizeApplicationStatus(importedJob.status));
    setActiveTab("岗位匹配");
    setStep("review");
    setIsQueueCollapsed(true);
    setIsImportOpen(false);
    setToast("完整 JD 已保存为岗位快照；确认发送范围后才会生成可审核的岗位版建议。");
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
        <div className="brand-lockup" role="img" aria-label="Job Master">
          <span className="brand-mark" aria-hidden="true">
            <Sparkle size={18} weight="fill" aria-hidden="true" />
          </span>
          <span className="brand-name">Job Master</span>
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
            aria-label={t("搜索岗位、公司或来源")}
          />
          <kbd aria-hidden="true">⌘K</kbd>
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
          <button className="avatar" aria-label={t("本地数据")} onClick={() => setIsLocalDataOpen(true)}>
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
                aria-current={primarySection === key ? "page" : undefined}
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
                <button className="button quiet" disabled={isJobUrlVerifying(selected)} onClick={() => openJobSource(selected)}>
                  <ArrowSquareOut size={17} />
                  {t("打开申请页")}
                </button>
                <button className="button primary" disabled={isAgentThinking || Boolean(pendingResumeRewrite)} onClick={() => {
                  createResumePolishDraft(selected, selected.role);
                }}>
                  <Sparkle size={17} weight="fill" />
                  {t("根据 JD 定制")}
                </button>
                <button className="more-button" aria-label={t("归档当前岗位")} onClick={() => archiveJob(selected)}>
                  <Trash size={20} />
                </button>
              </div>
            </div>

          <nav className="tabs" role="tablist" aria-label={t("申请包分区")}>
            {tabs.map((tab, index) => (
              <button
                key={tab}
                id={`application-tab-${index}`}
                role="tab"
                className={activeTab === tab ? "active" : ""}
                aria-selected={activeTab === tab}
                aria-controls="application-tab-panel"
                tabIndex={activeTab === tab ? 0 : -1}
                onKeyDown={handleApplicationTabKeyDown}
                onClick={() => goToReviewTab(tab)}
              >
                {t(tab)}
              </button>
            ))}
          </nav>

          <div className="review-mobile-actions" aria-label={t("申请包操作")}>
            <button className="button quiet" onClick={prepareApplicationAssist}>
              <PaperPlaneTilt size={17} />
              {t("核对字段后打开申请页")}
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

          <div id="application-tab-panel" className="review-canvas" ref={reviewCanvasRef} role="tabpanel" aria-labelledby={`application-tab-${tabs.indexOf(activeTab)}`}>
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
                    {t(verificationStatusCopy(selected))}
                    {selected.verifiedAt
                      ? ` · ${new Date(selected.verifiedAt).toLocaleDateString(uiLanguage === "en" ? "en-US" : "zh-CN")}`
                      : ""}
                  </dd>
                </div>
              </dl>
              <details className="source-receipt">
                <summary>
                  <span>{t("来源凭据")}</span>
                  <small>{t("默认收起；展开查看来源和核验记录")}</small>
                </summary>
                <dl className="source-receipt-grid">
                  <div><dt>{t("来源类型")}</dt><dd>{sourceReceiptValue(selected.sourceReceipt?.origin, t)}</dd></div>
                  <div><dt>{t("提供方")}</dt><dd>{sourceReceiptValue(selected.sourceReceipt?.provider, t)}</dd></div>
                  <div><dt>{t("提供方职位 ID")}</dt><dd>{sourceReceiptValue(selected.sourceReceipt?.providerJobId, t)}</dd></div>
                  <div><dt>{t("抓取时间")}</dt><dd>{formatReceiptTimestamp(selected.sourceReceipt?.fetchedAt, uiLanguage, t)}</dd></div>
                  <div><dt>{t("核验状态")}</dt><dd>{sourceReceiptValue(selected.sourceReceipt?.verificationState, t)}</dd></div>
                  <div><dt>{t("核验原因")}</dt><dd>{sourceReceiptValue(selected.sourceReceipt?.verificationReason, t)}</dd></div>
                  <div><dt>{t("核验时间")}</dt><dd>{formatReceiptTimestamp(selected.sourceReceipt?.verifiedAt, uiLanguage, t)}</dd></div>
                  <div><dt>{t("来源证据类型")}</dt><dd>{sourceReceiptValue(selected.sourceReceipt?.sourceArtifact?.kind, t)}</dd></div>
                  <div><dt>{t("来源证据哈希")}</dt><dd>{formatReceiptHash(selected.sourceReceipt?.sourceArtifact, t)}</dd></div>
                  <div><dt>{t("来源抓取时间")}</dt><dd>{formatReceiptTimestamp(selected.sourceReceipt?.sourceArtifact?.capturedAt, uiLanguage, t)}</dd></div>
                  <div><dt>{t("抓取完整性")}</dt><dd>{selected.sourceReceipt?.sourceArtifact?.complete ? t("完整") : t("未提供")}</dd></div>
                  <div><dt>{t("快照字节数")}</dt><dd>{selected.sourceReceipt?.sourceArtifact?.complete ? selected.sourceReceipt.sourceArtifact.byteLength.toLocaleString() : t("未提供")}</dd></div>
                  <div><dt>{t("JD 释义类型")}</dt><dd>{sourceReceiptValue(selected.sourceReceipt?.summaryArtifact?.kind, t)}</dd></div>
                  <div><dt>{t("JD 释义哈希")}</dt><dd>{formatReceiptHash(selected.sourceReceipt?.summaryArtifact, t)}</dd></div>
                  <div><dt>{t("JD 释义生成时间")}</dt><dd>{formatReceiptTimestamp(selected.sourceReceipt?.summaryArtifact?.generatedAt, uiLanguage, t)}</dd></div>
                  <div className="source-receipt-url"><dt>{t("岗位链接")}</dt><dd>{normalizeReceiptUrl(selected.sourceReceipt?.postingUrl) ? <a href={normalizeReceiptUrl(selected.sourceReceipt.postingUrl)} target="_blank" rel="noreferrer">{normalizeReceiptUrl(selected.sourceReceipt.postingUrl)}</a> : t("未提供")}</dd></div>
                  <div className="source-receipt-url"><dt>{t("申请链接")}</dt><dd>{normalizeReceiptUrl(selected.sourceReceipt?.applyUrl) ? <button className="link-row" disabled={isJobUrlVerifying(selected)} onClick={() => openJobSource(selected)}>{normalizeReceiptUrl(selected.sourceReceipt.applyUrl)}</button> : t("未提供")}</dd></div>
                </dl>
              </details>
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
                <div className="score-ring" role="img" aria-label={formatJobSignalScore(selected)} style={{ "--score": `${hasCurrentJobScore(selected) ? selected.score : 0}%` }}>
                  <span>{hasCurrentJobScore(selected) ? selected.score : "—"}</span>
                  <small>{t(selected.matchLabel ?? "待评估")}</small>
                </div>
                <div className="score-evidence">
                  <span>{t("信号分依据")}</span>
                  <strong>{selected.matchSignals?.length ? selected.matchSignals.join(" · ") : t("目标方向与岗位轨道")}</strong>
                  <p>{t("信号分只用于当前列表排序，不是录取概率、资格判断或 ATS 分数。")}</p>
                </div>
              </div>
              {hasCurrentJobScore(selected) ? (
                <dl className="score-breakdown">
                  <div><dt>{t("目标方向")}</dt><dd>{selected.scoreBreakdown.targetDirection} {t("分")}</dd></div>
                  <div><dt>{t("简历关键词")}</dt><dd>{selected.scoreBreakdown.resumeKeywords} {t("分")}</dd></div>
                  <div><dt>{t("已确认事实")}</dt><dd>{selected.scoreBreakdown.confirmedEvidence} {t("分")}</dd></div>
                  <div><dt>{t("自定义方向")}</dt><dd>{selected.scoreBreakdown.customDirection} {t("分")}</dd></div>
                </dl>
              ) : <p className="score-refresh-note">{t("此岗位的信号分待刷新；不会沿用旧算法的分数或依据。")}</p>}
              <div className="callout">
                <strong>{t(selectedResumeEvidence.length > 0 ? "已定位到可核对事实" : "尚未定位到直接证据")}</strong>
                <p>{selectedResumeEvidence.length > 0
                  ? uiLanguage === "en" ? `Matched ${selectedResumeEvidence.join(", ")} in the Master Resume. Review every rewrite after generating the job version.` : `Master Resume 中命中 ${selectedResumeEvidence.join("、")}；生成岗位版后仍需逐条审核改写。`
                  : t("当前信号分主要来自方向和技能关键词。生成岗位版时不会补写原简历不存在的经历或指标。")}</p>
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
                    <button className="button primary" disabled={isAgentThinking || Boolean(pendingResumeRewrite) || !masterResumeVersion} onClick={() => createResumePolishDraft(selected, selected.role)}>
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
                        const decision = resumeChangeDecisions[resumeDecisionKey(jobSuggestionScope, change, index)]
                          ?? resumeChangeDecisions[`${jobSuggestionScope}:${index}`];
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
                      disabled={isAgentThinking || Boolean(pendingResumeRewrite) || !masterResumeVersion}
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
                            const decision = resumeChangeDecisions[resumeDecisionKey(scope, change, index)]
                              ?? resumeChangeDecisions[`${scope}:${index}`];
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
                      <span>{t(needsResumeReimport ? "旧版本只保存了文件名；重新读取后，岗位匹配才会使用真实简历内容。" : "有了主简历后，信号分、缺口和定制建议才会基于你的真实经历。")}</span>
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
                    <div className="segment compact" role="group" aria-label={t("市场")}>
                      {["美国", "中国"].map((market) => <button key={market} className={targetMarket === market ? "selected" : ""} aria-pressed={targetMarket === market} onClick={() => handleMarketChange(market)}>{t(market)}</button>)}
                    </div>
                  </div>
                  <div className="compact-filter-group">
                    <span>{t("岗位类型")}</span>
                    <div className="segment compact" role="group" aria-label={t("岗位类型")}>
                      {["全职", "实习"].map((type) => <button key={type} className={employmentType === type ? "selected" : ""} aria-pressed={employmentType === type} onClick={() => handleEmploymentTypeChange(type)}>{t(type)}</button>)}
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
                        {recommendationMeta?.funnel && (() => {
                          const funnel = recommendationMeta.funnel;
                          const excluded = primaryFunnelExclusion(funnel);
                          return <small className="recommendation-funnel">
                            {t("筛选前")} {funnel.counts?.input ?? 0} · {t("可用")} {funnel.counts?.available ?? 0} · {t("相关")} {funnel.counts?.relevant ?? 0} · {t("展示")} {funnel.counts?.returned ?? 0}
                            {excluded ? ` · ${t("主要排除")} ${t(funnelExclusionLabels[excluded.reason] ?? "未提供")} ${excluded.count}` : ""}
                          </small>;
                        })()}
                      </div>
                      <button onClick={() => setSearchQuery("")}><FunnelSimple size={16} />{t("信号分排序")}</button>
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
                                    <em>{formatJobSignalScore(job)}</em>
                                  </span>
                                </span>
                                <span>{job.company} · {t(job.location)} · {t(job.employmentType)}{job.type && job.type !== job.employmentType ? ` · ${t(job.type)}` : ""}</span>
                                <p>{t(job.summary)}</p>
                                {job.matchSignals?.length > 0 && (
                                  <span className="match-signal-row">{t("信号：")}{job.matchSignals.join(" · ")}</span>
                                )}
                                <small>{job.source} · {t(verificationStatusCopy(job))}</small>
                              </span>
                              <CaretRight size={18} />
                            </button>
                            <div className="job-card-actions">
                              <button onClick={() => watchJob(job)}><CalendarBlank size={15} />{t("收藏")}</button>
                              <button disabled={isJobUrlVerifying(job)} onClick={() => openJobSource(job)}><ArrowSquareOut size={15} />{t("申请")}</button>
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
                    <p>{t("根据 Master Resume 中出现的技能、经历关键词和目标方向重新计算信号分。缺少证据的要求只会标为缺口，不会被写成经历。")}</p>
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
                    <p>{t("从今日任务到面试复盘都保存在当前浏览器。自动提交只在你审核最终字段并对单个岗位再次授权后执行一次。")}</p>
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

                <nav className="applications-subnav" aria-label={t("求职进度视图")}>
                  {[
                    ["today", "今天", todayActionQueue.length],
                    ["applications", "全部申请", trackedJobs.length],
                    ["interviews", "面试", interviewJobs.length],
                    ["insights", "转化数据", applicationAnalytics.counts.applied],
                  ].map(([view, label, count]) => (
                    <button key={view} aria-pressed={applicationsView === view} className={applicationsView === view ? "active" : ""} onClick={() => setApplicationsView(view)}>
                      <span>{t(label)}</span><em>{count}</em>
                    </button>
                  ))}
                </nav>

                {applicationsView === "today" && (
                  <>
                    <section className="application-workspace-panel today-workspace">
                      <div className="application-table-heading">
                        <div><strong>{t("今天最值得推进")}</strong><span>{t("按时间、状态与准备度排序")}</span></div>
                        <span>{t("最多显示 5 项")}</span>
                      </div>
                      {todayActionQueue.length === 0 ? (
                        <div className="jobs-empty-state compact">
                          <CheckCircle size={28} />
                          <strong>{t("今天没有待推进任务")}</strong>
                          <p>{t("收藏一个真实岗位或更新投递状态后，这里会生成下一步。")}</p>
                        </div>
                      ) : (
                        <div className="today-action-list">
                          {todayActionQueue.map((action, index) => {
                            const job = applications.find((item) => item.id === action.applicationId);
                            if (!job) return null;
                            return (
                              <article className="today-action-row" key={action.applicationId}>
                                <span className="today-action-index">{String(index + 1).padStart(2, "0")}</span>
                                <div>
                                  <span>{applicationActionLabel(action.actionCode, t)}</span>
                                  <strong>{job.company} · {job.role}</strong>
                                  <small>{t(action.status)}{action.dueAt ? ` · ${formatReceiptTimestamp(action.dueAt, uiLanguage, t)}` : ""}</small>
                                </div>
                                <div className="today-action-buttons">
                                  {action.actionCode === "follow-up" ? (
                                    <>
                                      <button className="button quiet" onClick={() => copyApplicationFollowUp(job)}>{t("复制跟进模板")}</button>
                                      <button className="button quiet" onClick={() => markApplicationFollowedUp(job)}>{t("标记已跟进")}</button>
                                    </>
                                  ) : (
                                    <button className="button quiet" onClick={() => {
                                      if (action.actionCode === "prepare-interview") {
                                        setSelectedId(job.id);
                                        setApplicationsView("interviews");
                                        return;
                                      }
                                      selectJob(job);
                                    }}>{t("打开工作区")}<CaretRight size={15} /></button>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <section className="application-workspace-panel answer-library-panel">
                      <div className="application-table-heading">
                        <div><strong>{t("申请答案库")}</strong><span>{t("仅保存你亲自确认的非敏感答案")}</span></div>
                        <span>{uiLanguage === "en" ? `${applicationAnswerLibrary.answers.length} answers` : `${applicationAnswerLibrary.answers.length} 条答案`}</span>
                      </div>
                      {applicationAnswerLibrary.answers.length === 0 ? (
                        <div className="answer-library-empty">
                          <p>{t("在官网字段审核中保存开放题后，会在这里复用；工作授权、签证、身份和薪资答案永远不会保存。")}</p>
                        </div>
                      ) : (
                        <div className="answer-library-list">
                          {applicationAnswerLibrary.answers.map((answer) => (
                            <article key={answer.id} className="answer-library-row">
                              <header>
                                <div><span>{t(answer.category === "narrative" ? "开放题" : answer.category === "factual" ? "事实字段" : "仅限人工")}</span><strong>{answer.question}</strong></div>
                                <button aria-label={t("删除答案")} onClick={() => deleteSavedApplicationAnswer(answer.id)}><Trash size={15} /></button>
                              </header>
                              {answer.category === "sensitive" ? (
                                <p>{t("敏感答案不保存在 Jobmaster 中。")}</p>
                              ) : (
                                <textarea defaultValue={answer.answer} aria-label={uiLanguage === "en" ? `Edit answer for ${answer.question}` : `编辑答案：${answer.question}`} onBlur={(event) => updateSavedApplicationAnswer(answer, event.target.value)} />
                              )}
                              <small>{t("浏览器本地")} · {formatReceiptTimestamp(answer.updatedAt, uiLanguage, t)}</small>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  </>
                )}

                {applicationsView === "applications" && (
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
                          <span role="columnheader">{t("岗位")}</span><span role="columnheader">{t("信号分")}</span><span role="columnheader">{t("状态")}</span><span role="columnheader">{t("最近更新")}</span><span role="columnheader">{t("操作")}</span>
                        </div>
                        {trackedJobs.map((job) => (
                          <div className="application-table-row" role="row" key={job.id}>
                            <span role="cell" className="application-job-cell">
                              <button className="application-job" onClick={() => selectJob(job)}>
                                <CompanyMark accent={job.accent} />
                                <span><strong>{job.role}</strong><small>{job.company} · {t(job.location)}</small></span>
                              </button>
                            </span>
                            <strong role="cell">{formatJobSignalScore(job)}</strong>
                            <label role="cell" className="application-status-select">
                              <StatusDot status={normalizeApplicationStatus(job.status)} />
                              <select aria-label={uiLanguage === "en" ? `Update ${job.company} ${job.role} status` : `更新${job.company}${job.role}的投递状态`} value={normalizeApplicationStatus(job.status)} onChange={(event) => { setSelectedId(job.id); setReviewStatus(event.target.value); updateApplicationStatus(job.id, event.target.value); }}>
                                {statusOptions.filter((status) => status !== "已归档").map((status) => <option key={status} value={status}>{t(status)}</option>)}
                              </select>
                              <CaretDown size={14} />
                            </label>
                            <span role="cell">{t(job.updated)}</span>
                            <div role="cell" className="application-row-actions"><button disabled={isJobUrlVerifying(job)} aria-label={uiLanguage === "en" ? `Open ${job.company} application` : `打开 ${job.company} 申请页`} onClick={() => openJobSource(job)}><ArrowSquareOut size={16} /></button><button aria-label={uiLanguage === "en" ? `View ${job.company} role details` : `查看 ${job.company} 岗位详情`} onClick={() => selectJob(job)}><CaretRight size={16} /></button></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {applicationsView === "interviews" && (
                  <section className="application-workspace-panel interview-workspace">
                    <div className="application-table-heading">
                      <div><strong>{t("面试准备台")}</strong><span>{t("只引用已提交简历与当前岗位证据")}</span></div>
                      <span>{t("缺口不会被补写成经历")}</span>
                    </div>
                    {interviewJobs.length === 0 ? (
                      <div className="jobs-empty-state compact">
                        <CalendarBlank size={28} />
                        <strong>{t("还没有进入面试的岗位")}</strong>
                        <p>{t("将申请状态更新为面试后，可以在这里安排时间、记录笔记并准备问题。")}</p>
                      </div>
                    ) : (
                      <div className="interview-workspace-list">
                        {interviewJobs.map((job) => {
                          const operation = applicationOperationsById[job.id] ?? {};
                          const interview = operation.interview ?? {};
                          const submittedResume = resumeVersions.find((version) => version.id === operation.submittedPackage?.resumeVersionId)
                            ?? [...resumeVersions].reverse().find((version) => version.layer === "job" && version.jobId === job.id)
                            ?? {};
                          const outline = buildInterviewPrepOutline(job, submittedResume);
                          return (
                            <article className="interview-card" key={job.id}>
                              <header>
                                <div><span>{t("面试中")}</span><h2>{job.company} · {job.role}</h2><small>{submittedResume.name ? `${t("基于")}: ${submittedResume.name}` : t("尚未找到已提交简历版本")}</small></div>
                                <button className="button quiet" onClick={() => selectJob(job)}>{t("查看岗位")}<CaretRight size={15} /></button>
                              </header>
                              <div className="interview-fields">
                                <label><span>{t("面试时间")}</span><input type="datetime-local" value={toDateTimeLocalValue(interview.scheduledAt)} onChange={(event) => updateInterviewField(job, "scheduledAt", event.target.value)} /></label>
                                <label><span>{t("阶段")}</span><input value={interview.stage ?? ""} placeholder={t("例如：技术一面")} onChange={(event) => updateInterviewField(job, "stage", event.target.value)} /></label>
                                <label className="full-width"><span>{t("准备与复盘笔记")}</span><textarea value={interview.notes ?? ""} placeholder={t("记录面试官、重点、待补证据与后续动作")} onChange={(event) => updateInterviewField(job, "notes", event.target.value)} /></label>
                              </div>
                              <div className="interview-outline">
                                <section><span>{t("可用证据")}</span>{outline.evidence.length ? <ul>{outline.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t("当前岗位没有可确认的匹配证据。")}</p>}</section>
                                <section><span>{t("需要正面说明的缺口")}</span>{outline.gaps.length ? <ul>{outline.gaps.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t("当前没有已标记缺口。")}</p>}</section>
                                <section><span>{t("建议练习的问题")}</span><ol>{outline.questions.map((item) => <li key={item}>{t(item)}</li>)}</ol></section>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                {applicationsView === "insights" && (
                  <section className="application-workspace-panel insights-workspace">
                    <div className="application-table-heading">
                      <div><strong>{t("求职转化")}</strong><span>{t("只统计当前浏览器中的岗位记录")}</span></div>
                      <span>{t("小样本仅供方向判断")}</span>
                    </div>
                    <div className="analytics-funnel">
                      {[
                        ["发现", applicationAnalytics.counts.discovered],
                        ["收藏或准备", applicationAnalytics.counts.saved],
                        ["已投递", applicationAnalytics.counts.applied],
                        ["面试", applicationAnalytics.counts.interviews],
                        ["Offer", applicationAnalytics.counts.offers],
                      ].map(([label, value]) => <article key={label}><span>{t(label)}</span><strong>{value}</strong></article>)}
                    </div>
                    <div className="analytics-conversions">
                      {[
                        ["发现 → 投递", applicationAnalytics.conversions.discoveredToApplied],
                        ["投递 → 面试", applicationAnalytics.conversions.appliedToInterview],
                        ["面试 → Offer", applicationAnalytics.conversions.interviewToOffer],
                      ].map(([label, value]) => <article key={label}><span>{t(label)}</span><strong>{value == null ? "—" : `${value}%`}</strong></article>)}
                    </div>
                    <div className="analytics-source-table" role="table" aria-label={t("按来源统计")}>
                      <div role="row" className="analytics-source-row header"><span>{t("来源")}</span><span>{t("投递")}</span><span>{t("面试")}</span><span>{t("转化")}</span></div>
                      {applicationAnalytics.bySource.map((row) => (
                        <div role="row" className="analytics-source-row" key={row.source}>
                          <span>{t(row.source)}{!row.trendEligible && <small>{t(" · 小样本")}</small>}</span>
                          <strong>{row.applied}</strong><strong>{row.interviews}</strong><strong>{row.appliedToInterview == null ? "—" : `${row.appliedToInterview}%`}</strong>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {step === "review" && !selected && (
              <>
                <div className="empty-hero">
                  <span className="empty-mark">
                    <CheckCircle size={26} weight="fill" />
                  </span>
                  <p>{t("申请包审核")}</p>
                  <h1>{t("先选一个岗位，再进入人工审稿台。")}</h1>
                  <span>{t("申请包审核会展示岗位分析、信号分、缺口报告、证据选择、简历 bullet、申请回答和提交前安全门。")}</span>
                  <div className="empty-actions">
                    <button className="button primary" onClick={runJobRadar}>
                      <Sparkle size={18} weight="fill" />
                      {t("查找岗位")}
                    </button>
                    <button className="button quiet" onClick={openImport}>
                      {t("手动粘贴 JD")}
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
            <select aria-label={t("投递状态")} value={reviewStatus} onChange={(event) => updateSelectedReviewStatus(event.target.value)}>
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
            <span>{t("状态历史")}</span>
            {selectedApplicationEvents.length ? selectedApplicationEvents.slice(-4).reverse().map((event) => (
              <small key={event.id}>
                {applicationEventLabel(event, t)}
                {` · ${formatReceiptTimestamp(event.occurredAt, uiLanguage, t)}`}
              </small>
            )) : <small>{t("历史从此功能启用后开始")}</small>}
            {selectedStatusRevertibility.canRevert && <button className="link-row" onClick={revertSelectedReviewStatus}>{t("撤销最近状态变更")}</button>}
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
            <strong>{t(selected.source)} · {formatJobSignalScore(selected)}</strong>
          </div>
          <div className="rail-group">
            <span>{t("职位申请")}</span>
            <button className="link-row" disabled={isJobUrlVerifying(selected)} onClick={() => openJobSource(selected)}>
              <span>
                {t("打开申请页")}
                <small>{selected.company} - {selected.role}</small>
              </span>
              <ArrowSquareOut size={16} />
            </button>
          </div>

          <div className="application-assist-status">
            <span>{t("申请字段包")}</span>
            <strong>{t(selectedApplicationAssist.preparedAt ? "上次已打开申请页并记录字段包" : "尚未为此岗位打开字段包")}</strong>
            <p>{selectedJobResumeVersion?.name ?? t("需要先保存岗位版简历")}{selectedApplicationAssist.preparedAt && applicationAssistSourceChanged ? ` · ${t("字段来源已变化")}` : ""}</p>
            <button onClick={prepareApplicationAssist}>{t("核对本地字段包")}</button>
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
              {t("核对字段后打开申请页")}
            </button>
            <button className="button quiet wide" disabled={isAgentThinking || Boolean(pendingResumeRewrite)} onClick={() => {
              createResumePolishDraft(selected, selected.role);
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
            <p>{t("手动模式只复制字段并打开申请页。自动化模式还需要审核官网实际字段，并对当前公司与岗位进行第二次单次授权。")}</p>
          </div>
        </aside>
        ) : null}
      </section>

      <Suspense fallback={<ModalChunkFallback t={t} />}>
        {activeEditor && (
          <EditModal t={t} uiLanguage={uiLanguage} editor={activeEditor} onChange={updateReviewEditor} onCancel={closeReviewEditor} onSave={saveReviewEditor} />
        )}

        {isLocalDataOpen && (
          <LocalDataModal
            t={t}
            saveStatus={saveStatus}
            lastSavedAt={formattedLastSavedAt}
            backupPassword={backupPassword}
            onBackupPasswordChange={setBackupPassword}
            onExport={exportLocalDataBackup}
            backupError={backupError}
            isExporting={isExportingBackup}
            restoreFile={restoreFile}
            restorePassword={restorePassword}
            onRestoreFileChange={setRestoreFile}
            onRestorePasswordChange={setRestorePassword}
            onRestore={restoreLocalDataBackup}
            restoreError={restoreError}
            isRestoring={isRestoringBackup}
            clearConfirmation={clearConfirmation}
            onClearConfirmationChange={setClearConfirmation}
            onClear={clearLocalData}
            clearError={clearError}
            resumeRewriteConsent={resumeRewriteConsent}
            onRevokeResumeRewriteConsent={() => {
              setResumeRewriteConsent(null);
              setToast(t("已撤销记住的 AI 改写授权；下次发送前会重新询问。"));
            }}
            onClose={closeLocalDataModal}
          />
        )}

        {pendingResumeRewrite && (
          <ResumeRewriteConsentModal
            t={t}
            summary={pendingResumeRewrite.summary}
            onCancel={cancelPendingResumeRewrite}
            onContinueOnce={() => approvePendingResumeRewrite("once")}
            onRemember={() => approvePendingResumeRewrite("remember")}
          />
        )}

        {isApplicationAssistOpen && selected && (
          <ApplicationAssistModal
            t={t}
            uiLanguage={uiLanguage}
            selected={selected}
            resumeVersion={selectedJobResumeVersion}
            candidateProfile={candidateProfile}
            onProfileChange={updateCandidateProfile}
            authorization={applicationAssistAuthorization}
            onAuthorizationToggle={toggleApplicationAssistAuthorization}
            isConfirmed={isApplicationAssistConfirmed}
            onConfirmationChange={setIsApplicationAssistConfirmed}
            packet={applicationFieldPacket}
            canLaunch={canLaunchCurrentApplicationAssist && Boolean(applicationPreflight?.ready)}
            contactValidation={applicationContactValidation}
            previousAudit={selectedApplicationAssist}
            sourceChanged={applicationAssistSourceChanged}
            preflight={applicationPreflight}
            acknowledgements={applicationAssistAcknowledgements}
            onAcknowledgementsChange={setApplicationAssistAcknowledgements}
            onCopyFields={copyApplicationFields}
            automationCapabilities={applicationAutomationCapabilities}
            automationMode={applicationAutomationMode}
            onAutomationModeChange={(mode) => {
              setApplicationAutomationMode(mode);
              setIsApplicationAssistConfirmed(false);
              setIsSubmissionAuthorizationConfirmed(false);
            }}
            onScan={scanApplicationForAutomation}
            isScanning={isApplicationAutomationScanning}
            isLaunching={isApplicationAssistLaunching}
            onClose={closeApplicationAssist}
            onLaunch={launchApplicationAssist}
          />
        )}

        {isSubmissionReviewOpen && selected && applicationAutomationScan && submissionReview && (
          <ApplicationSubmissionReviewModal
            t={t}
            uiLanguage={uiLanguage}
            selected={selected}
            scan={applicationAutomationScan}
            review={submissionReview}
            submissionPreflight={submissionPreflight}
            authorizationConfirmed={isSubmissionAuthorizationConfirmed}
            onAuthorizationConfirmed={setIsSubmissionAuthorizationConfirmed}
            onFieldChange={updateSubmissionReviewField}
            onSaveAnswer={saveSubmissionAnswer}
            onClose={() => closeSubmissionReview()}
            onExecute={executeSubmissionReviewOnce}
            isExecuting={isSubmissionExecuting}
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
      </Suspense>

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
