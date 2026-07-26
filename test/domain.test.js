import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeJobForResume,
  applyLiveUrlVerificationResults,
  filterDiscoverableJobs,
  getJobDiscoveryBatch,
  getLiveOfficialApplyUrls,
  isLiveOfficialVerificationStale,
  markRejectedLiveJobs,
  mergeJobPools,
  normalizeSearchedJobs,
  rankJobsForResume,
} from "../src/domain/jobDiscovery.js";
import {
  buildImportedJob,
  isSpecificApplicationUrl,
  isTrackedApplication,
} from "../src/domain/applications.js";
import {
  dashboardSchemaVersion,
  dashboardStorageKey,
  legacyDashboardStorageKey,
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
  assessResumeStructure,
  buildResumeSectionBlocks,
  computeResumeChanges,
  parseResumeDocument,
  revertResumeChange,
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
  assert.equal(isSpecificApplicationUrl("https://example.com/careers"), false);
  assert.equal(isSpecificApplicationUrl("https://example.com/jobs/123"), true);
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
  writeDashboard(migrated, storage);
  assert.equal(JSON.parse(values.get(dashboardStorageKey)).schemaVersion, dashboardSchemaVersion);
});

test("dashboard storage migrates the previous v2 key and normalizes paper size", () => {
  const values = new Map([
    [previousDashboardStorageKey, JSON.stringify({ resumePageSize: "Letter", applications: [] })],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  const migrated = readDashboard(storage);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.resumePageSize, "Letter");
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
