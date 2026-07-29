import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeJobForResume,
  applyLiveUrlVerificationResults,
  buildRecommendationFunnel,
  filterDiscoverableJobs,
  getJobDiscoveryBatch,
  getLiveOfficialApplyUrls,
  inferJobTrack,
  isLiveOfficialVerificationStale,
  jobScoreAlgorithmVersion,
  markRejectedLiveJobs,
  matchesJobSignal,
  mergeJobPools,
  normalizeSearchedJobs,
  rankJobsForResume,
  recommendationFunnelAlgorithmVersion,
} from "../src/domain/jobDiscovery.js";
import {
  buildImportedJob,
  isSpecificApplicationUrl,
  isTrackedApplication,
} from "../src/domain/applications.js";
import {
  deriveOfficialJobProvider,
  derivePostingUrl,
  normalizeReceiptUrl,
  updateSourceReceiptVerification,
  withNormalizedSourceReceipt,
} from "../src/domain/sourceReceipt.js";
import { jobPoolsByMarket } from "../src/data/jobCatalog.js";
import {
  dashboardSchemaVersion,
  dashboardStorageKey,
  clearKnownDashboards,
  legacyDashboardStorageKey,
  migrateDashboard,
  oldestDashboardStorageKey,
  previousDashboardStorageKey,
  readDashboard,
  writeDashboard,
} from "../src/storage/dashboardStorage.js";
import {
  groupPdfTextItems,
  inferPdfPageSize,
} from "../src/resume/resumeIO.js";
import {
  applyResumeChange,
  applyResumeChangeResult,
  assessResumeStructure,
  buildResumeSectionBlocks,
  computeResumeChanges,
  materializeResumeReview,
  parseResumeDocument,
  revertResumeChange,
  revertResumeChangeResult,
  saveEditableResumeVersion,
  selectResumeVersionForDirection,
  summarizeResumeReview,
} from "../src/resume/resumeModel.js";

test("job discovery prioritizes unseen jobs without mutating the pool", () => {
  const jobs = Array.from({ length: 8 }, (_, index) => ({
    id: `job-${index}`,
    stage: "进行中",
    employmentType: "全职",
  }));
  const pools = { 美国: jobs };
  const batch = getJobDiscoveryBatch(pools, "美国", "全职", 1, 3, ["job-0", "job-1"]);

  assert.deepEqual(batch.map((job) => job.id), ["job-2", "job-3", "job-4"]);
  assert.equal(jobs.length, 8);
});

test("resume ranking uses confirmed resume text and leaves source jobs unchanged", () => {
  const jobs = [
    { id: "ai", company: "A", role: "AI Engineer", summary: "agent evaluation", track: "ai_agent_engineer", evidence: ["VetCite"] },
    { id: "risk", company: "B", role: "Risk Engineer", summary: "fraud metrics", track: "risk_engineer", evidence: ["Quant"] },
  ];
  const ranked = rankJobsForResume(jobs, "Python agent evaluation VetCite", "AI Agent Engineer");

  assert.equal(ranked[0].id, "ai");
  assert.ok(ranked[0].score > ranked[1].score);
  assert.equal(jobs[0].score, undefined);
});

test("resume ranking has no artificial minimum score and exposes confidence", () => {
  const job = {
    id: "risk",
    company: "B",
    role: "Risk Engineer",
    summary: "fraud metrics",
    track: "risk_engineer",
    evidence: ["Unconfirmed Project"],
  };
  const analyzed = analyzeJobForResume(job, "Unrelated design portfolio", "AI Agent Engineer");

  assert.equal(analyzed.score, 0);
  assert.equal(analyzed.matchConfidence, "needs-review");
  assert.equal(analyzed.matchLabel, "待评估");
});

test("recommendation funnel is pure, stable, and reports every exclusion boundary", () => {
  const jobs = [
    { id: "top", company: "A", role: "AI Engineer", market: "美国", employmentType: "全职", stage: "进行中", summary: "agent evaluation", track: "ai_agent_engineer", evidence: ["Python"] },
    { id: "same-score", company: "B", role: "AI Engineer", market: "美国", employmentType: "全职", stage: "进行中", summary: "agent evaluation", track: "ai_agent_engineer", evidence: ["Python"] },
    { id: "zero", company: "C", role: "Unrelated", market: "美国", employmentType: "全职", stage: "进行中", summary: "", track: "unknown" },
    { id: "terminal", company: "D", role: "AI Engineer", market: "美国", employmentType: "全职", stage: "进行中", status: "已投递", track: "ai_agent_engineer" },
    { id: "closed", company: "E", role: "AI Engineer", market: "美国", employmentType: "全职", stage: "进行中", verificationStatus: "unavailable", track: "ai_agent_engineer" },
    { id: "archived", company: "F", role: "AI Engineer", market: "美国", employmentType: "全职", stage: "已归档", track: "ai_agent_engineer" },
    { id: "intern", company: "G", role: "AI Engineer", market: "美国", employmentType: "实习", stage: "进行中", track: "ai_agent_engineer" },
    { id: "china", company: "H", role: "AI Engineer", market: "中国", employmentType: "全职", stage: "进行中", track: "ai_agent_engineer" },
  ];
  const original = structuredClone(jobs);
  const funnel = buildRecommendationFunnel(jobs, {
    market: "美国", employmentType: "全职", resumeText: "Python agent evaluation", targetRole: "AI Agent Engineer", cap: 1,
  });
  assert.deepEqual(funnel.rankedJobs.map((job) => job.id), ["top"]);
  assert.deepEqual(funnel.counts, { input: 8, market: 7, employmentType: 6, active: 5, available: 4, scored: 3, relevant: 2, returned: 1 });
  assert.deepEqual(funnel.exclusions, { market: 1, employmentType: 1, archived: 1, unavailable: 1, terminal: 1, zeroScore: 1, cap: 1 });
  assert.deepEqual(funnel.relevantIds, ["top", "same-score"]);
  assert.equal(funnel.relevantIds.filter((id) => !["stale-seen-id"].includes(id)).length, 2);
  const sanitizedOptions = buildRecommendationFunnel(jobs, {
    market: "美国",
    employmentType: "全职",
    resumeText: "Python agent evaluation",
    targetRole: "AI Agent Engineer",
    cap: Number.NaN,
    cycle: Number.POSITIVE_INFINITY,
    seenIds: {},
  });
  assert.deepEqual(sanitizedOptions.rankedJobs.map((job) => job.id), ["top", "same-score"]);
  assert.deepEqual(jobs, original);
});

test("signal matcher rejects ASCII substrings while accepting independent and normalized technical terms", () => {
  assert.equal(matchesJobSignal("email maintained training capital javascript", "ai"), false);
  assert.equal(matchesJobSignal("email maintained training capital javascript", "api"), false);
  assert.equal(matchesJobSignal("email maintained training capital javascript", "java"), false);
  assert.equal(matchesJobSignal("Build AI systems with RAG, C++, and full stack delivery.", "ai"), true);
  assert.equal(matchesJobSignal("Build AI systems with RAG, C++, and full stack delivery.", "rag"), true);
  assert.equal(matchesJobSignal("Build AI systems with RAG, C++, and full stack delivery.", "c++"), true);
  assert.equal(matchesJobSignal("Build AI systems with RAG, C++, and full stack delivery.", "full-stack"), true);
  assert.equal(matchesJobSignal("负责ＡＩ评测与模型部署", "ai"), true);
});

test("track inference has a deterministic SDE fallback for zero hits and ties", () => {
  assert.equal(inferJobTrack("general role description with no known technical signals"), "sde");
  assert.equal(inferJobTrack("Python"), "sde");
});

test("custom direction phrases use the same boundary-aware signal matcher", () => {
  const customDirections = [{ name: "Full stack", keywords: ["full stack", "api"] }];
  const matched = analyzeJobForResume({
    id: "custom",
    company: "Example",
    role: "Full-stack Engineer",
    summary: "Build API integrations.",
    track: "sde",
    evidence: [],
  }, "Built a full-stack product with API integrations.", "Full stack", customDirections);
  const falsePositive = analyzeJobForResume({
    id: "capital",
    company: "Example",
    role: "Engineer",
    summary: "Capital planning.",
    track: "sde",
    evidence: [],
  }, "Built software.", "Full stack", customDirections);

  assert.deepEqual(matched.matchSignals.slice(0, 2), ["full stack", "api"]);
  assert.equal(matched.scoreBreakdown.customDirection, 14);
  assert.equal(falsePositive.scoreBreakdown.customDirection, 0);
  assert.equal(matched.jobScoreAlgorithmVersion, jobScoreAlgorithmVersion);
});

test("live jobs merge ahead of stale static entries and remain market-specific", () => {
  const staticPools = {
    美国: [{ id: "static", applyUrl: "https://example.com/jobs/1", market: "美国" }],
    中国: [],
  };
  const liveJobs = normalizeSearchedJobs({
    searchedAt: "2026-07-23T00:00:00.000Z",
    jobs: [{
      id: "live",
      company: "Example",
      role: "Engineer",
      location: "Remote",
      applyUrl: "https://example.com/jobs/1",
      source: "Example Careers",
      summary: "Build reliable systems.",
      jdText: "Build reliable systems with testing, monitoring, ownership, and cross-team delivery.",
      requirements: ["Testing"],
    }],
  }, "美国", "实习");
  const merged = mergeJobPools(staticPools, { "美国:实习": liveJobs });

  assert.equal(merged.美国.length, 1);
  assert.equal(merged.美国[0].id, "live");
  assert.equal(merged.美国[0].employmentType, "实习");
});

test("explicitly rejected live jobs remain tracked but leave the discovery list", () => {
  const socureUrl = "https://jobs.ashbyhq.com/socure/e54f1700-c922-4bcc-a087-45b24717f974";
  const jobs = [
    {
      id: "live-socure",
      company: "Socure",
      role: "Engineer Intern",
      market: "美国",
      employmentType: "实习",
      stage: "进行中",
      status: "收藏",
      userTracked: true,
      isNew: true,
      updated: "本轮实时发现",
      applyUrl: socureUrl,
      url: socureUrl,
      jdSource: "official-summary",
      verificationStatus: "verified",
    },
    {
      id: "live-replit",
      company: "Replit",
      role: "Software Engineering Intern",
      market: "美国",
      employmentType: "实习",
      stage: "进行中",
      status: "待处理",
      applyUrl: "https://jobs.ashbyhq.com/replit/12737078-74c7-4e63-98a7-5e8da1e9deb1",
      url: "https://jobs.ashbyhq.com/replit/12737078-74c7-4e63-98a7-5e8da1e9deb1",
      jdSource: "official-summary",
      verificationStatus: "verified",
    },
    {
      id: "live-old-tracked",
      company: "Still Open",
      role: "Intern",
      market: "美国",
      employmentType: "实习",
      stage: "进行中",
      status: "收藏",
      userTracked: true,
      applyUrl: "https://example.com/jobs/still-open",
      jdSource: "official-summary",
      verificationStatus: "verified",
    },
  ];

  const marked = markRejectedLiveJobs(jobs, [socureUrl]);

  assert.equal(marked.length, 3);
  assert.equal(marked[0].userTracked, true);
  assert.equal(marked[0].status, "收藏");
  assert.equal(marked[0].verificationStatus, "unavailable");
  assert.equal(marked[0].isNew, false);
  assert.equal(marked[0].updated, "官网确认岗位已失效");
  assert.equal(marked[2], jobs[2]);
  assert.deepEqual(
    filterDiscoverableJobs(marked, "美国", "实习").map((job) => job.id),
    ["live-replit", "live-old-tracked"],
  );
  assert.deepEqual(
    getLiveOfficialApplyUrls(marked, "美国", "实习"),
    ["https://jobs.ashbyhq.com/replit/12737078-74c7-4e63-98a7-5e8da1e9deb1", "https://example.com/jobs/still-open"],
  );
});

test("live official roles expire after 24 hours and propagate open, closed, and unknown checks safely", () => {
  const url = "https://example.com/jobs/tracked-123";
  const verifiedAt = "2026-07-24T00:00:00.000Z";
  const trackedJob = {
    id: "live-tracked",
    company: "Example",
    role: "Engineer Intern",
    market: "美国",
    employmentType: "实习",
    stage: "进行中",
    status: "收藏",
    userTracked: true,
    applyUrl: url,
    url,
    jdSource: "official-summary",
    verificationStatus: "verified",
    verifiedAt,
  };

  assert.equal(isLiveOfficialVerificationStale(trackedJob, Date.parse(verifiedAt) + (24 * 60 * 60 * 1000) - 1), false);
  assert.equal(isLiveOfficialVerificationStale(trackedJob, Date.parse(verifiedAt) + (24 * 60 * 60 * 1000)), true);
  assert.equal(isLiveOfficialVerificationStale({ ...trackedJob, source: "手动 JD", id: "manual-1" }, Date.now()), false);

  const open = applyLiveUrlVerificationResults([trackedJob], [{
    url,
    state: "open",
    checkedAt: "2026-07-25T01:00:00.000Z",
  }]);
  assert.equal(open[0].verificationStatus, "verified");
  assert.equal(open[0].verifiedAt, "2026-07-25T01:00:00.000Z");

  const unknown = applyLiveUrlVerificationResults([trackedJob], [{ url, state: "unknown" }]);
  assert.equal(unknown[0].verificationStatus, "unknown");
  assert.notEqual(unknown[0].verificationStatus, "unavailable");

  const closed = applyLiveUrlVerificationResults([trackedJob], [{ url, state: "closed" }]);
  assert.equal(closed[0].verificationStatus, "unavailable");
  assert.equal(closed[0].userTracked, true);
  assert.equal(closed[0].status, "收藏");
  assert.deepEqual(filterDiscoverableJobs(closed, "美国", "实习"), []);
});

test("only explicit user actions create tracked applications", () => {
  assert.equal(isTrackedApplication({ stage: "进行中", userTracked: false }), false);
  assert.equal(isTrackedApplication({ stage: "进行中", userTracked: true }), true);
  assert.equal(isTrackedApplication({ stage: "已归档", userTracked: true }), false);
});

test("manual JD jobs preserve the complete source and reject generic career URLs", () => {
  const jdText = "A".repeat(500);
  const job = buildImportedJob({
    jdText,
    company: "Example",
    role: "Software Engineer",
    applicationUrl: "https://example.com/jobs/123",
    market: "美国",
    employmentType: "全职",
    track: "sde",
    now: 1,
  });

  assert.equal(job.jdText, jdText);
  assert.equal(job.jdComplete, true);
  assert.equal(job.jdHashAlgorithm, "fnv-1a-32");
  assert.equal(job.sourceReceipt.origin, "user-pasted");
  assert.equal(job.sourceReceipt.sourceArtifact.kind, "user-provided-jd");
  assert.equal(job.sourceReceipt.sourceArtifact.contentHash, job.jdHash);
  assert.equal(job.sourceReceipt.sourceArtifact.hashAlgorithm, "fnv-1a-32");
  assert.equal(job.sourceReceipt.sourceArtifact.complete, true);
  assert.equal(job.sourceReceipt.summaryArtifact.kind, "missing");
  assert.equal(job.sourceReceipt.verificationState, "needs-review");
  assert.equal(isSpecificApplicationUrl("https://example.com/careers"), false);
  assert.equal(isSpecificApplicationUrl("https://example.com/jobs/123"), true);
  assert.equal(isSpecificApplicationUrl("https://user:secret@example.com/jobs/123"), false);
});

test("source receipt extracts only known official provider IDs and leaves unsafe IDs blank", () => {
  assert.deepEqual(deriveOfficialJobProvider("https://jobs.ashbyhq.com/openai/eaf9207e-84c9-4fa2-bd57-6877b7eb7f79/application"), {
    provider: "ashby", providerJobId: "eaf9207e-84c9-4fa2-bd57-6877b7eb7f79",
  });
  assert.deepEqual(deriveOfficialJobProvider("https://job-boards.greenhouse.io/anthropic/jobs/5238637008"), {
    provider: "greenhouse", providerJobId: "5238637008",
  });
  assert.deepEqual(deriveOfficialJobProvider("https://boards.greenhouse.io/example?gh_jid=987654"), {
    provider: "greenhouse", providerJobId: "987654",
  });
  assert.deepEqual(deriveOfficialJobProvider("https://jobs.lever.co/palantir/636fc05c-d348-4a06-be51-597cb9e07488/apply"), {
    provider: "lever", providerJobId: "636fc05c-d348-4a06-be51-597cb9e07488",
  });
  assert.deepEqual(deriveOfficialJobProvider("https://jobs.apple.com/en-us/details/200643348-0836/swift-engineer"), {
    provider: "apple-jobs", providerJobId: "200643348-0836",
  });
  assert.deepEqual(deriveOfficialJobProvider("https://career.huawei.com/reccampportal/portal5/social-recruitment-detail.html?jobId=32189"), {
    provider: "huawei-careers", providerJobId: "32189",
  });
  assert.deepEqual(deriveOfficialJobProvider("https://hr.xiaomi.com/job/view/640"), {
    provider: "xiaomi-careers", providerJobId: "640",
  });
  assert.deepEqual(deriveOfficialJobProvider("https://stripe.com/jobs/listing/backend-engineer/7232592"), {
    provider: "stripe-jobs", providerJobId: "7232592",
  });
  assert.deepEqual(deriveOfficialJobProvider("https://jobs.lever.co/example/not-a-safe-id"), {
    provider: "lever", providerJobId: "",
  });
  assert.deepEqual(deriveOfficialJobProvider("http://example.com/jobs/123"), {
    provider: "unknown", providerJobId: "",
  });
  assert.deepEqual(deriveOfficialJobProvider("https://careers.example.com/job/software-engineer?gh_jid=4321"), {
    provider: "greenhouse", providerJobId: "4321",
  });
});

test("static and legacy jobs migrate to truthful source receipts without inventing evidence", () => {
  const merged = mergeJobPools({
    美国: [{
      id: "catalog-role",
      company: "Example",
      role: "Engineer",
      market: "美国",
      employmentType: "全职",
      stage: "进行中",
      sourceOrigin: "built-in-catalog",
      applyUrl: "https://example.com/jobs/123",
    }],
  });
  const catalogReceipt = merged.美国[0].sourceReceipt;
  assert.equal(catalogReceipt.origin, "built-in-catalog");
  assert.equal(catalogReceipt.verificationState, "needs-review");
  assert.equal(catalogReceipt.fetchedAt, "");
  assert.equal(catalogReceipt.verifiedAt, "");
  assert.equal(catalogReceipt.sourceArtifact.complete, false);
  assert.equal(catalogReceipt.summaryArtifact.kind, "missing");

  const builtInPools = mergeJobPools(jobPoolsByMarket);
  assert.equal(builtInPools.美国[0].sourceReceipt.origin, "built-in-catalog");
  assert.equal(builtInPools.中国[0].sourceReceipt.origin, "built-in-catalog");

  const migrated = readDashboard({
    getItem: (key) => key === legacyDashboardStorageKey ? JSON.stringify({
      applications: [{
        id: "legacy-role",
        status: "已投递",
        stage: "进行中",
        jdText: "Historical description",
        jdHash: "deadbeef",
      }],
    }) : null,
    setItem: () => {},
  });
  const legacyReceipt = migrated.applications[0].sourceReceipt;
  assert.equal(legacyReceipt.origin, "legacy-cache");
  assert.equal(legacyReceipt.verificationState, "needs-review");
  assert.equal(legacyReceipt.fetchedAt, "");
  assert.equal(legacyReceipt.verifiedAt, "");
  assert.equal(legacyReceipt.sourceArtifact.complete, false);
  assert.deepEqual(legacyReceipt.summaryArtifact, {
      kind: "legacy-agent-paraphrase", generatedAt: "", contentHash: "deadbeef", hashAlgorithm: "legacy-unknown",
  });
});

test("source receipts reject unsafe URLs and derive posting URLs only for known ATS application suffixes", () => {
  assert.equal(derivePostingUrl("https://jobs.ashbyhq.com/openai/eaf9207e-84c9-4fa2-bd57-6877b7eb7f79/application"), "https://jobs.ashbyhq.com/openai/eaf9207e-84c9-4fa2-bd57-6877b7eb7f79");
  assert.equal(derivePostingUrl("https://jobs.lever.co/palantir/636fc05c-d348-4a06-be51-597cb9e07488/apply"), "https://jobs.lever.co/palantir/636fc05c-d348-4a06-be51-597cb9e07488");
  assert.equal(derivePostingUrl("https://example.com/jobs/apply"), "https://example.com/jobs/apply");
  assert.equal(normalizeReceiptUrl("javascript:alert(1)"), "");
  assert.equal(normalizeReceiptUrl("data:text/html,unsafe"), "");
  assert.equal(normalizeReceiptUrl("https://user:secret@example.com/jobs/123"), "");

  const receipt = withNormalizedSourceReceipt({
    id: "legacy-tampered",
    sourceReceipt: {
      origin: "legacy-cache",
      postingUrl: "javascript:alert(1)",
      applyUrl: "data:text/html,unsafe",
      fetchedAt: "not-a-date",
      verifiedAt: "not-a-date",
      providerJobId: "untrusted-id",
    },
    url: "https://user:secret@example.com/jobs/123",
    applyUrl: "javascript:alert(1)",
  }).sourceReceipt;
  assert.equal(receipt.postingUrl, "");
  assert.equal(receipt.applyUrl, "");
  assert.equal(receipt.providerJobId, "");
  assert.equal(receipt.fetchedAt, "");
  assert.equal(receipt.verifiedAt, "");
});

test("source receipt v2 keeps official snapshots and generated summaries independently auditable", () => {
  const snapshotHash = "a".repeat(64);
  const summaryHash = "b".repeat(64);
  const snapshot = {
    kind: "official-response", sourceUrl: "https://example.com/jobs/123", capturedAt: "2026-07-28T00:00:00.000Z", byteLength: 321, complete: true,
    contentHash: snapshotHash, hashAlgorithm: "sha-256",
  };
  const base = {
    sourceReceipt: {
      schemaVersion: 2, origin: "live-official-search", applyUrl: snapshot.sourceUrl, postingUrl: snapshot.sourceUrl,
      fetchedAt: snapshot.capturedAt, verificationState: "open", verifiedAt: snapshot.capturedAt,
      verificationReason: "url-open", sourceArtifact: snapshot,
      summaryArtifact: { kind: "agent-paraphrase", generatedAt: snapshot.capturedAt, contentHash: summaryHash, hashAlgorithm: "sha-256" },
    },
  };
  const alternateSummary = withNormalizedSourceReceipt({ ...base, sourceReceipt: {
    ...base.sourceReceipt, summaryArtifact: { ...base.sourceReceipt.summaryArtifact, contentHash: "c".repeat(64) },
  } }).sourceReceipt;
  const alternateSnapshot = withNormalizedSourceReceipt({ ...base, sourceReceipt: {
    ...base.sourceReceipt, sourceArtifact: { ...snapshot, contentHash: "d".repeat(64), capturedAt: "2026-07-28T01:00:00.000Z" },
  } }).sourceReceipt;
  assert.equal(alternateSummary.sourceArtifact.contentHash, snapshotHash);
  assert.equal(alternateSummary.summaryArtifact.contentHash, "c".repeat(64));
  assert.equal(alternateSnapshot.sourceArtifact.contentHash, "d".repeat(64));
  assert.equal(alternateSnapshot.summaryArtifact.contentHash, summaryHash);

  const preserved = updateSourceReceiptVerification({ ...base, sourceReceipt: base.sourceReceipt }, {
    state: "unknown", checkedAt: "2026-07-28T02:00:00.000Z", reason: "bounded-response",
  });
  assert.equal(preserved.sourceArtifact.contentHash, snapshotHash);
  assert.equal(preserved.summaryArtifact.contentHash, summaryHash);
  const replaced = updateSourceReceiptVerification({ ...base, sourceReceipt: base.sourceReceipt }, {
    state: "open", checkedAt: "2026-07-28T03:00:00.000Z", reason: "url-open",
    sourceArtifact: { ...snapshot, capturedAt: "2026-07-28T03:00:00.000Z", contentHash: "e".repeat(64) },
  });
  assert.equal(replaced.sourceArtifact.contentHash, "e".repeat(64));
  assert.equal(replaced.summaryArtifact.contentHash, summaryHash);
});

test("source receipt artifacts fail closed for malformed hashes, empty captures, and missing required times", () => {
  const receipt = withNormalizedSourceReceipt({
    sourceReceipt: {
      schemaVersion: 2, origin: "live-official-search", applyUrl: "https://example.com/jobs/123",
      sourceArtifact: { kind: "official-response", sourceUrl: "https://example.com/jobs/123", capturedAt: "not-a-time", byteLength: 0, complete: true, contentHash: "short", hashAlgorithm: "sha-256" },
      summaryArtifact: { kind: "agent-paraphrase", generatedAt: "", contentHash: "a".repeat(64), hashAlgorithm: "sha-256" },
    },
  }).sourceReceipt;
  assert.equal(receipt.sourceArtifact.kind, "missing");
  assert.equal(receipt.summaryArtifact.kind, "missing");

  const oversizedLegacy = withNormalizedSourceReceipt({
    sourceReceipt: { origin: "legacy-cache", jdHash: "x".repeat(129), jdHashAlgorithm: "legacy-unknown" },
  }).sourceReceipt;
  assert.equal(oversizedLegacy.summaryArtifact.kind, "missing");
  const validManual = withNormalizedSourceReceipt({
    jdSource: "user-pasted", jdText: "JD text", jdHash: "deadbeef", jdHashAlgorithm: "fnv-1a-32",
  }).sourceReceipt;
  assert.equal(validManual.sourceArtifact.kind, "user-provided-jd");
});

test("URL checks retain live source evidence while a closed tracked job leaves discovery", () => {
  const receipt = {
    schemaVersion: 1,
    origin: "live-official-search",
    provider: "ashby",
    providerJobId: "eaf9207e-84c9-4fa2-bd57-6877b7eb7f79",
    postingUrl: "https://jobs.ashbyhq.com/openai/eaf9207e-84c9-4fa2-bd57-6877b7eb7f79",
    applyUrl: "https://jobs.ashbyhq.com/openai/eaf9207e-84c9-4fa2-bd57-6877b7eb7f79",
    fetchedAt: "2026-07-24T00:00:00.000Z",
    verificationState: "open",
    verifiedAt: "2026-07-24T00:00:00.000Z",
    verificationReason: "live-search-verified",
    jdHash: "a".repeat(64),
    jdHashAlgorithm: "sha-256",
  };
  const job = {
    id: "live-tracked-receipt", company: "OpenAI", role: "Engineer", market: "美国", employmentType: "全职",
    stage: "进行中", status: "已投递", userTracked: true, jdSource: "official-summary",
    verificationStatus: "verified", applyUrl: receipt.applyUrl, url: receipt.postingUrl, jdHash: receipt.jdHash,
    sourceReceipt: receipt,
  };
  const closed = applyLiveUrlVerificationResults([job], [{
    url: receipt.applyUrl, state: "closed", checkedAt: "2026-07-26T00:00:00.000Z",
  }])[0];
  assert.equal(closed.verificationStatus, "unavailable");
  assert.equal(closed.userTracked, true);
  assert.equal(closed.sourceReceipt.verificationState, "closed");
  assert.equal(closed.sourceReceipt.verifiedAt, "2026-07-26T00:00:00.000Z");
  assert.equal(closed.sourceReceipt.fetchedAt, receipt.fetchedAt);
  assert.equal(closed.sourceReceipt.summaryArtifact.contentHash, receipt.jdHash);
  assert.deepEqual(filterDiscoverableJobs([closed], "美国", "全职"), []);

  const open = applyLiveUrlVerificationResults([job], [{
    url: receipt.applyUrl, state: "open", checkedAt: "2026-07-26T01:00:00.000Z", reason: "url-open",
  }])[0];
  assert.equal(open.verificationStatus, "verified");
  assert.equal(open.sourceReceipt.verifiedAt, "2026-07-26T01:00:00.000Z");
  assert.equal(open.sourceReceipt.verificationReason, "url-open");
  const unknown = applyLiveUrlVerificationResults([job], [{
    url: receipt.applyUrl, state: "unknown", checkedAt: "2026-07-26T02:00:00.000Z", reason: "network-or-inconclusive",
  }])[0];
  assert.equal(unknown.verificationStatus, "unknown");
  assert.equal(unknown.sourceReceipt.verificationState, "unknown");
  assert.equal(unknown.sourceReceipt.verificationReason, "network-or-inconclusive");
});

test("dashboard storage migrates legacy tracking and writes a schema version", () => {
  const values = new Map([
    [legacyDashboardStorageKey, JSON.stringify({
      applications: [
        { id: "discovered", status: "待处理", stage: "进行中" },
        { id: "applied", status: "已投递", stage: "进行中" },
      ],
    })],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const migrated = readDashboard(storage);

  assert.equal(migrated.schemaVersion, dashboardSchemaVersion);
  assert.equal(migrated.applications[0].userTracked, false);
  assert.equal(migrated.applications[1].userTracked, true);
  assert.deepEqual(migrated.applicationEventsById, {});
  writeDashboard(migrated, storage);
  assert.equal(JSON.parse(values.get(dashboardStorageKey)).schemaVersion, dashboardSchemaVersion);
});

test("dashboard migration preserves only valid bounded application events without fabricating legacy history", () => {
  const validEvent = {
    schemaVersion: 1,
    id: "event-1",
    applicationId: "tracked",
    type: "status.changed",
    occurredAt: "2026-07-28T00:00:00.000Z",
    fromStatus: "收藏",
    toStatus: "已投递",
  };
  const migrated = migrateDashboard({
    applications: [{ id: "tracked", status: "已投递", stage: "进行中", userTracked: true }],
    applicationEventsById: {
      tracked: [validEvent, {
        ...validEvent,
        id: "unsafe",
        type: "application.opened",
        metadata: { email: "private@example.com" },
      }],
    },
  });

  assert.deepEqual(migrated.applicationEventsById.tracked.map((event) => event.id), ["event-1"]);
  assert.equal(JSON.stringify(migrated.applicationEventsById).includes("private@example.com"), false);
  assert.deepEqual(migrateDashboard({ schemaVersion: 6, applications: [] }).applicationEventsById, {});
});

test("dashboard storage migrates the previous v5 key and normalizes paper size", () => {
  const values = new Map([
    [previousDashboardStorageKey, JSON.stringify({ resumePageSize: "Letter", applications: [] })],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  const migrated = readDashboard(storage);
  assert.equal(migrated.schemaVersion, dashboardSchemaVersion);
  assert.equal(migrated.resumePageSize, "Letter");
});

test("dashboard storage migrates v5 resume lineage without fabricating or dropping audit fields", () => {
  const patchAudit = [{ patchId: "patch-v2-abc", baseHash: "base", before: "A", after: "B", decision: "accepted" }];
  const values = new Map([
    [previousDashboardStorageKey, JSON.stringify({
      schemaVersion: 5,
      applications: [{ id: "kept", sourceReceipt: { origin: "legacy-cache" } }],
      resumeVersions: [{ id: "direction-v1", parentVersionId: "master-resume", patchAudit, content: "B" }],
    })],
  ]);
  const storage = { getItem: (key) => values.get(key) ?? null };
  const migrated = readDashboard(storage);
  assert.equal(migrated.schemaVersion, dashboardSchemaVersion);
  assert.deepEqual(migrated.resumeVersions[0].patchAudit, patchAudit);
  assert.equal(migrated.resumeVersions[0].parentVersionId, "master-resume");
});

test("dashboard persists only bounded funnel aggregates and rejects malformed funnel metadata", () => {
  const counts = { input: 9, market: 7, employmentType: 6, active: 5, available: 4, scored: 3, relevant: 2, returned: 2 };
  const exclusions = { market: 2, employmentType: 1, archived: 1, unavailable: 1, terminal: 1, zeroScore: 1, cap: 0 };
  const valid = migrateDashboard({ recommendationMeta: {
    jobScoreAlgorithmVersion, recommendationFunnelAlgorithmVersion,
    source: "Master Resume.pdf",
    targetRole: "AI Agent Engineer",
    signals: ["agent", "evaluation"],
    funnel: { algorithmVersion: recommendationFunnelAlgorithmVersion, counts, exclusions, rankedJobs: [{ jdText: "must not persist" }] },
    jobs: [{ jdText: "must not persist outside the funnel either" }],
  } });
  assert.deepEqual(valid.recommendationMeta.funnel, { algorithmVersion: recommendationFunnelAlgorithmVersion, counts, exclusions });
  assert.equal(JSON.stringify(valid.recommendationMeta).includes("must not persist"), false);
  assert.deepEqual(valid.recommendationMeta.signals, ["agent", "evaluation"]);
  const malformed = migrateDashboard({ recommendationMeta: {
    jobScoreAlgorithmVersion, recommendationFunnelAlgorithmVersion,
    funnel: { algorithmVersion: recommendationFunnelAlgorithmVersion, counts: { ...counts, input: -1 }, exclusions },
  } });
  assert.equal(malformed.recommendationMeta, null);
  const nonMonotonic = migrateDashboard({ recommendationMeta: {
    jobScoreAlgorithmVersion, recommendationFunnelAlgorithmVersion,
    funnel: { algorithmVersion: recommendationFunnelAlgorithmVersion, counts: { ...counts, market: counts.input + 1 }, exclusions },
  } });
  assert.equal(nonMonotonic.recommendationMeta, null);
  const unreconciled = migrateDashboard({ recommendationMeta: {
    jobScoreAlgorithmVersion, recommendationFunnelAlgorithmVersion,
    funnel: { algorithmVersion: recommendationFunnelAlgorithmVersion, counts, exclusions: { ...exclusions, cap: exclusions.cap + 1 } },
  } });
  assert.equal(unreconciled.recommendationMeta, null);
});

test("dashboard storage invalidates old and malformed current score payloads", () => {
  const validBreakdown = { targetDirection: 18, resumeKeywords: 14, confirmedEvidence: 10, customDirection: 0 };
  const values = new Map([
    [dashboardStorageKey, JSON.stringify({
      applications: [
        {
          id: "old-score",
          score: 96,
          jobScoreAlgorithmVersion: 1,
          scoreBreakdown: { direction: 96 },
          matchSignals: ["false positive"],
          matchedEvidence: ["not verified"],
          missingSignals: ["stale"],
          matchConfidence: "evidence-backed",
          matchLabel: "证据充分",
        },
        {
          id: "malformed-current",
          score: 46,
          jobScoreAlgorithmVersion,
          scoreBreakdown: { ...validBreakdown, customDirection: undefined },
          matchSignals: ["broken"],
        },
        {
          id: "current",
          score: 42,
          jobScoreAlgorithmVersion,
          scoreBreakdown: validBreakdown,
          matchSignals: ["api"],
          matchConfidence: "limited",
          matchLabel: "有限匹配",
        },
      ],
    })],
  ]);
  const storage = { getItem: (key) => values.get(key) ?? null };
  const migrated = readDashboard(storage);

  assert.equal(migrated.applications[0].score, null);
  assert.deepEqual(migrated.applications[0].matchSignals, []);
  assert.equal(migrated.applications[0].scoreBreakdown, null);
  assert.equal(migrated.applications[1].score, null);
  assert.equal(migrated.applications[1].matchConfidence, "needs-review");
  assert.equal(migrated.applications[2].score, 42);
  assert.deepEqual(migrated.applications[2].matchSignals, ["api"]);
});

test("dashboard storage propagates write failures and clears only Jobmaster keys", () => {
  const quotaStorage = {
    getItem: () => null,
    setItem: () => { throw new Error("quota exceeded"); },
  };
  assert.throws(() => writeDashboard({ applications: [] }, quotaStorage), /quota exceeded/);

  const values = new Map([
    [dashboardStorageKey, "current"],
    [previousDashboardStorageKey, "previous"],
    [legacyDashboardStorageKey, "legacy"],
    [oldestDashboardStorageKey, "oldest"],
    ["another-site-key", "keep"],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  clearKnownDashboards(storage);
  assert.equal(values.has(dashboardStorageKey), false);
  assert.equal(values.has(previousDashboardStorageKey), false);
  assert.equal(values.has(legacyDashboardStorageKey), false);
  assert.equal(values.has(oldestDashboardStorageKey), false);
  assert.equal(values.get("another-site-key"), "keep");
});

test("resume parser preserves header and section order", () => {
  const document = parseResumeDocument("Ada Lovelace\nComputing Pioneer\nada@example.com\n\nEXPERIENCE\nAnalytical Engine\n- Built a compiler\n\nSKILLS\nPython");

  assert.equal(document.name, "Ada Lovelace");
  assert.deepEqual(document.contact, ["ada@example.com"]);
  assert.deepEqual(document.header.map((line) => line.type), ["intro", "contact"]);
  assert.deepEqual(document.sections.map((section) => section.title), ["EXPERIENCE", "SKILLS"]);
});

test("resume parser keeps paragraph groups and wrapped bullets in source order", () => {
  const document = parseResumeDocument([
    "Ada Lovelace",
    "ada@example.com",
    "",
    "EXPERIENCE",
    "Analytical Engine",
    "- Built a compiler",
    "with documented validation",
    "",
    "Research Notes",
    "- Published findings",
  ].join("\n"));
  const blocks = buildResumeSectionBlocks(document.sections[0]);

  assert.equal(blocks[1].text, "Built a compiler with documented validation");
  assert.equal(blocks[2].text, "Research Notes");
  assert.equal(blocks[2].groupStart, true);
});

test("resume import assessment reports structure quality without inventing sections", () => {
  const assessment = assessResumeStructure(
    "Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAnalytical Engine\n- Built a compiler\n\nSKILLS\nPython\nJavaScript",
    { warnings: [] },
  );

  assert.equal(assessment.quality, "high");
  assert.equal(assessment.sectionCount, 2);
  assert.deepEqual(assessment.warnings, []);
});

test("PDF text grouping restores reading order, paragraph gaps, and source page size", () => {
  const grouped = groupPdfTextItems([
    { str: "Ada", transform: [1, 0, 0, 1, 250, 760], width: 22, height: 12 },
    { str: "Lovelace", transform: [1, 0, 0, 1, 276, 760], width: 48, height: 12 },
    { str: "EXPERIENCE", transform: [1, 0, 0, 1, 50, 700], width: 80, height: 10 },
  ], 595);

  assert.equal(grouped.lines[0].text, "Ada Lovelace");
  assert.match(grouped.text, /Ada Lovelace\n\nEXPERIENCE/);
  assert.equal(grouped.headerAlignment, "center");
  assert.equal(inferPdfPageSize(595, 842), "A4");
  assert.equal(inferPdfPageSize(612, 792), "Letter");
});

test("resume diff pairs removed and added lines", () => {
  const changes = computeResumeChanges("EXPERIENCE\nBuilt reports", "EXPERIENCE\nBuilt automated reports");

  assert.equal(changes.length, 1);
  assert.equal(changes[0].before, "Built reports");
  assert.equal(changes[0].after, "Built automated reports");
});

test("resume changes can be accepted and reversed without touching other lines", () => {
  const source = "SUMMARY\nBuilt reports\nEXPERIENCE\nShipped dashboards";
  const revised = "SUMMARY\nBuilt automated reports\nEXPERIENCE\nShipped dashboards";
  const [change] = computeResumeChanges(source, revised);

  const accepted = applyResumeChange(source, change);
  assert.equal(accepted, revised);
  assert.equal(revertResumeChange(accepted, change), source);
});

test("resume changes support inserted and removed lines", () => {
  const source = "SUMMARY\nBuilt reports\nEXPERIENCE\nShipped dashboards";
  const revised = "SUMMARY\nBuilt reports\nAdded validation\nEXPERIENCE";
  const changes = computeResumeChanges(source, revised);
  const accepted = changes.reduce((text, change) => applyResumeChange(text, change), source);

  assert.equal(accepted, revised);
  assert.equal([...changes].reverse().reduce((text, change) => revertResumeChange(text, change), accepted), source);
});

test("accepting or rejecting the same inserted or removed line is idempotent", () => {
  const source = "SUMMARY\nBuilt reports\nEXPERIENCE\nShipped dashboards";
  const revised = "SUMMARY\nBuilt reports\nAdded validation\nEXPERIENCE";
  const changes = computeResumeChanges(source, revised);
  const insertion = changes.find((change) => change.beforeLines.length === 0);
  const removal = changes.find((change) => change.afterLines.length === 0);

  const inserted = applyResumeChange(source, insertion);
  assert.equal(applyResumeChange(inserted, insertion), inserted);

  const removed = applyResumeChange(source, removal);
  const restored = revertResumeChange(removed, removal);
  assert.equal(revertResumeChange(restored, removal), restored);
});

test("insertion and removal patches report safe idempotent result states", () => {
  const source = "SUMMARY\nBuilt reports\nEXPERIENCE\nShipped dashboards";
  const revised = "SUMMARY\nBuilt reports\nAdded validation\nEXPERIENCE";
  const changes = computeResumeChanges(source, revised);
  const insertion = changes.find((change) => change.beforeLines.length === 0);
  const removal = changes.find((change) => change.afterLines.length === 0);

  assert.equal(revertResumeChangeResult(source, insertion).status, "already-reverted");
  const afterInsertion = applyResumeChangeResult(source, insertion).text;
  const revertedInsertion = revertResumeChangeResult(afterInsertion, insertion);
  assert.equal(revertedInsertion.status, "applied");
  assert.equal(revertResumeChangeResult(revertedInsertion.text, insertion).status, "already-reverted");

  const afterRemoval = applyResumeChangeResult(source, removal);
  assert.equal(afterRemoval.status, "applied");
  assert.equal(applyResumeChangeResult(afterRemoval.text, removal).status, "already-applied");
});

test("empty patch contexts mean document boundaries, not arbitrary gaps", () => {
  const endSource = "SUMMARY\nBuilt reports\nEXPERIENCE\nShipped dashboards";
  const endRevised = "SUMMARY\nBuilt reports\nAdded validation\nEXPERIENCE";
  const endRemoval = computeResumeChanges(endSource, endRevised).find((change) => change.afterLines.length === 0);
  assert.equal(
    applyResumeChangeResult("SUMMARY\nBuilt reports\nEXPERIENCE\nManually changed dashboards", endRemoval).status,
    "conflict",
  );

  const startSource = "Built reports\nEXPERIENCE\nShipped dashboards";
  const startRevised = "EXPERIENCE\nShipped dashboards";
  const startRemoval = computeResumeChanges(startSource, startRevised).find((change) => change.afterLines.length === 0);
  assert.equal(
    applyResumeChangeResult("Manually changed reports\nEXPERIENCE\nShipped dashboards", startRemoval).status,
    "conflict",
  );
});

test("mixed insertion and duplicate-line removal roll back safely in both orders", () => {
  const source = "D\nB\nB\nC\nA";
  const revised = "Z\nD\nB\nC\nA";
  const changes = computeResumeChanges(source, revised);
  assert.equal(changes.length, 2);
  for (const ordered of [changes, [...changes].reverse()]) {
    const applied = ordered.reduce((text, change) => {
      const result = applyResumeChangeResult(text, change);
      assert.equal(result.status, "applied");
      return result.text;
    }, source);
    assert.equal(applied, revised);
    const rolledBack = [...ordered].reverse().reduce((text, change) => {
      const result = revertResumeChangeResult(text, change);
      assert.equal(result.status, "applied");
      return result.text;
    }, applied);
    assert.equal(rolledBack, source);
  }
});

test("patch v2 targets the second repeated bullet and produces deterministic audit IDs", () => {
  const source = "EXPERIENCE\nTeam A\n• Built dashboards\nTeam B\n• Built dashboards";
  const revised = "EXPERIENCE\nTeam A\n• Built dashboards\nTeam B\n• Built reliable dashboards";
  const [change] = computeResumeChanges(source, revised);
  const repeated = computeResumeChanges(source, revised)[0];

  assert.equal(change.patchVersion, 2);
  assert.equal(change.patchId, repeated.patchId);
  assert.ok(change.baseHash);
  assert.ok(change.targetBlockId);
  assert.equal(applyResumeChangeResult(source, change).text, revised);
});

test("patch v2 applies two identical-text changes in either order", () => {
  const source = "EXPERIENCE\nTeam A\n• Built dashboards\n• Built dashboards";
  const revised = "EXPERIENCE\nTeam A\n• Built analytics dashboards\n• Built reliable dashboards";
  const changes = computeResumeChanges(source, revised);
  assert.equal(changes.length, 2);
  const forward = changes.reduce((text, change) => applyResumeChangeResult(text, change).text, source);
  const reverse = [...changes].reverse().reduce((text, change) => applyResumeChangeResult(text, change).text, source);
  assert.equal(forward, revised);
  assert.equal(reverse, revised);
  changes.forEach((change) => assert.equal(applyResumeChangeResult(forward, change).status, "already-applied"));
  [...changes].reverse().forEach((change) => assert.equal(applyResumeChangeResult(reverse, change).status, "already-applied"));
  const revertedForward = [...changes].reverse().reduce((text, change) => revertResumeChangeResult(text, change).text, forward);
  const revertedReverse = changes.reduce((text, change) => revertResumeChangeResult(text, change).text, reverse);
  assert.equal(revertedForward, source);
  assert.equal(revertedReverse, source);
  changes.forEach((change) => assert.equal(revertResumeChangeResult(revertedForward, change).status, "already-reverted"));
  [...changes].reverse().forEach((change) => assert.equal(revertResumeChangeResult(revertedReverse, change).status, "already-reverted"));
});

test("patch v2 review materializes from the immutable source regardless of decision order", () => {
  const cases = [
    [
      "EXPERIENCE\nTeam A\n• Built dashboards\n• Built dashboards",
      "EXPERIENCE\nTeam A\n• Built analytics dashboards\n• Built reliable dashboards",
    ],
    ["D\nB\nB\nC\nA", "Z\nD\nB\nC\nA"],
    ["A\nD\nD", "Y\nA\nD\nZ"],
    ["SUMMARY\nA\nB\nC\nD", "SUMMARY\nA revised\nB\nInserted\nC\nD revised"],
  ];

  cases.forEach(([source, revised]) => {
    const changes = computeResumeChanges(source, revised);
    assert.ok(changes.length > 0);
    const decisions = {};
    [...changes].reverse().forEach((change, index) => {
      decisions[`review:${change.patchId ?? changes.length - index - 1}`] = "accepted";
    });
    const materialized = materializeResumeReview(source, changes, decisions, "review");
    assert.equal(materialized.status, "applied");
    assert.equal(materialized.text, revised);

    const rejected = Object.fromEntries(changes.map((change, index) => [
      `review:${change.patchId ?? index}`,
      "rejected",
    ]));
    assert.equal(materializeResumeReview(source, changes, rejected, "review").text, source);
  });
});

test("patch v2 review preserves blank lines when inserting at document and section boundaries", () => {
  const cases = [
    ["A\nB\n", "A\nB\nX\n"],
    ["", "X"],
    ["A\n\nB\n\n", "A\n\nX\nB\n\n"],
  ];

  cases.forEach(([source, revised]) => {
    const changes = computeResumeChanges(source, revised);
    const decisions = Object.fromEntries(changes.map((change, index) => [
      `review:${change.patchId ?? index}`,
      "accepted",
    ]));
    const materialized = materializeResumeReview(source, changes, decisions, "review");
    assert.equal(materialized.status, "applied");
    assert.equal(materialized.text, revised);
  });
});

test("patch v2 review fails closed when its immutable source or audit is tampered", () => {
  const source = "SUMMARY\nBuilt reports\nEXPERIENCE\nShipped dashboards";
  const revised = "SUMMARY\nBuilt automated reports\nEXPERIENCE\nShipped dashboards";
  const changes = computeResumeChanges(source, revised);
  const decisions = { [`review:${changes[0].patchId}`]: "accepted" };

  const staleSource = "SUMMARY\nManually changed reports\nEXPERIENCE\nShipped dashboards";
  const stale = materializeResumeReview(staleSource, changes, decisions, "review");
  assert.equal(stale.status, "conflict");
  assert.equal(stale.text, staleSource);
  assert.deepEqual(stale.conflicts, [changes[0].patchId]);

  const tampered = [{ ...changes[0], baseHash: "tampered" }];
  const tamperedResult = materializeResumeReview(source, tampered, decisions, "review");
  assert.equal(tamperedResult.status, "conflict");
  assert.equal(tamperedResult.text, source);
  assert.deepEqual(tamperedResult.conflicts, [changes[0].patchId]);

  const tamperedLocator = [{
    ...changes[0],
    locator: { ...changes[0].locator, rawStart: changes[0].locator.rawStart + 1 },
  }];
  const locatorResult = materializeResumeReview(source, tamperedLocator, decisions, "review");
  assert.equal(locatorResult.status, "conflict");
  assert.equal(locatorResult.text, source);
  assert.deepEqual(locatorResult.conflicts, [changes[0].patchId]);
});

test("patch v2 never emits more changes than its limit when splitting a multi-line hunk", () => {
  const source = Array.from({ length: 40 }, () => "Built dashboards").join("\n");
  const revised = Array.from({ length: 40 }, (_, index) => `Built dashboard ${index + 1}`).join("\n");
  assert.equal(computeResumeChanges(source, revised, 7).length, 7);
});

test("patch v2 fails closed when a target is stale or still ambiguous and is idempotent", () => {
  const source = "EXPERIENCE\nTeam A\n• Built dashboards\nTeam B\n• Built dashboards";
  const revised = "EXPERIENCE\nTeam A\n• Built dashboards\nTeam B\n• Built reliable dashboards";
  const [change] = computeResumeChanges(source, revised);
  const applied = applyResumeChangeResult(source, change);
  assert.equal(applied.status, "applied");
  assert.equal(applyResumeChangeResult(applied.text, change).status, "already-applied");
  assert.equal(revertResumeChangeResult(applied.text, change).status, "applied");
  assert.equal(revertResumeChangeResult(source, change).status, "already-reverted");

  const ambiguous = { ...change, locator: { beforeContext: [], afterContext: [] } };
  const result = applyResumeChangeResult(source, ambiguous);
  assert.equal(result.status, "conflict");
  assert.equal(result.text, source);
  const stale = applyResumeChangeResult(source.replace("Team B\n• Built dashboards", "Team B\n• Manually changed dashboards"), change);
  assert.equal(stale.status, "conflict");
});

test("patch v2 rejects a unique target text moved away from its structural position", () => {
  const source = "A\nTarget\nB";
  const revised = "A\nChanged\nB";
  const [change] = computeResumeChanges(source, revised);
  const result = applyResumeChangeResult("Target\nA\nB", change);
  assert.equal(result.status, "conflict");
  assert.equal(result.text, "Target\nA\nB");
});

test("patch v2 does not mistake an unrelated existing rewrite for the intended target", () => {
  const source = "EXPERIENCE\nTeam A\n• Built dashboards\nTeam B\n• Built reliable dashboards";
  const revised = "EXPERIENCE\nTeam A\n• Built reliable dashboards\nTeam B\n• Built reliable dashboards";
  const [change] = computeResumeChanges(source, revised);
  const result = applyResumeChangeResult(source, change);
  assert.equal(result.status, "applied");
  assert.equal(result.text, revised);
});

test("manual save updates only an editable resume version", () => {
  const versions = [
    { id: "master-resume", content: "Locked source", status: "原版" },
    { id: "risk", content: "Old draft", status: "已生成" },
  ];
  const saved = saveEditableResumeVersion(versions, "risk", "Edited draft");

  assert.equal(saved.find((version) => version.id === "master-resume").content, "Locked source");
  assert.equal(saved.find((version) => version.id === "risk").content, "Edited draft");
  assert.equal(saved.find((version) => version.id === "risk").status, "已审核保存");
  assert.notEqual(saved, versions);
});

test("derived resume versions require a decision for every proposed change", () => {
  const changes = [{ before: "A", after: "B" }, { before: "C", after: "D" }];
  const pending = summarizeResumeReview(changes, { "scope:0": "accepted" }, "scope");
  const reviewed = summarizeResumeReview(changes, {
    "scope:0": "accepted",
    "scope:1": "rejected",
  }, "scope");

  assert.deepEqual(pending, {
    total: 2,
    accepted: 1,
    rejected: 0,
    pending: 1,
    canSave: false,
  });
  assert.equal(reviewed.canSave, true);
  assert.equal(reviewed.accepted, 1);
  assert.equal(reviewed.rejected, 1);
});

test("selecting a direction without a saved version uses Master Resume as its starting point", () => {
  const versions = [
    { id: "master-resume", target: "上传原文" },
    { id: "risk-v1", target: "Risk Engineer" },
  ];

  assert.deepEqual(selectResumeVersionForDirection(versions, "Risk Engineer"), {
    versionId: "risk-v1",
    hasSavedVersion: true,
  });
  assert.deepEqual(selectResumeVersionForDirection(versions, "SDE / Product Engineer"), {
    versionId: "master-resume",
    hasSavedVersion: false,
  });
  assert.equal(versions.length, 2);
});
