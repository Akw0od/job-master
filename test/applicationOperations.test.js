import assert from "node:assert/strict";
import test from "node:test";
import {
  addBusinessDays,
  buildApplicationAnalytics,
  buildInterviewPrepOutline,
  buildTodayActionQueue,
  normalizeApplicationOperationsById,
  recordApplicationFollowUp,
  recordConfirmedSubmission,
  scheduleApplicationFollowUp,
  updateApplicationInterview,
} from "../src/domain/applicationOperations.js";

const openReceipt = (verifiedAt = "2026-07-28T12:00:00.000Z") => ({
  applyUrl: "https://jobs.example.com/roles/1",
  provider: "official-company-site",
  providerJobId: "",
  verificationState: "open",
  verifiedAt,
});

test("confirmed submissions schedule a five-business-day follow-up and preserve only fingerprints", () => {
  assert.equal(addBusinessDays("2026-07-31T12:00:00.000Z", 1), "2026-08-03T12:00:00.000Z");
  const recorded = recordConfirmedSubmission({}, "job-1", {
    submittedAt: "2026-07-31T12:00:00.000Z",
    resumeVersionId: "resume-1",
    receiptFingerprint: "pf1-abcd",
    payloadFingerprint: "sp1-efgh",
  });
  assert.equal(recorded.changed, true);
  assert.equal(recorded.operationsById["job-1"].followUpAt, "2026-08-07T12:00:00.000Z");
  assert.equal(JSON.stringify(recorded.operationsById).includes("https://"), false);

  const rescheduled = scheduleApplicationFollowUp(recorded.operationsById, "job-1", "2026-08-10T12:00:00.000Z");
  assert.equal(rescheduled.operationsById["job-1"].followUpAt, "2026-08-10T12:00:00.000Z");

  const followedUp = recordApplicationFollowUp(rescheduled.operationsById, "job-1", "2026-08-10T18:00:00.000Z");
  assert.equal(followedUp.operationsById["job-1"].lastContactAt, "2026-08-10T18:00:00.000Z");
  assert.equal("followUpAt" in followedUp.operationsById["job-1"], false);
});

test("today queue favors interviews, due follow-ups, verification, tailoring, and reviewed applications", () => {
  const applications = [
    { id: "interview", company: "A", role: "Engineer", status: "面试", sourceReceipt: openReceipt() },
    { id: "follow", company: "B", role: "Engineer", status: "已投递", sourceReceipt: openReceipt() },
    { id: "verify", company: "C", role: "Engineer", status: "收藏", sourceReceipt: openReceipt("2020-01-01T00:00:00.000Z") },
    { id: "tailor", company: "D", role: "Engineer", status: "准备中", sourceReceipt: openReceipt() },
    { id: "review", company: "E", role: "Engineer", status: "准备中", sourceReceipt: openReceipt() },
  ];
  const operationsById = {
    follow: { schemaVersion: 1, applicationId: "follow", followUpAt: "2026-07-28T08:00:00.000Z" },
  };
  const queue = buildTodayActionQueue({
    applications,
    resumeVersions: [{ id: "review-resume", layer: "job", jobId: "review", content: "Saved job resume" }],
    operationsById,
    now: "2026-07-28T12:00:00.000Z",
    limit: 5,
  });
  assert.deepEqual(queue.map((item) => item.actionCode), [
    "prepare-interview", "follow-up", "verify-role", "tailor-resume", "review-application",
  ]);
});

test("analytics report observed counts without converting missing denominators into probabilities", () => {
  const analytics = buildApplicationAnalytics([
    { source: "Official", status: "收藏", userTracked: true },
    { source: "Official", status: "已投递", userTracked: true },
    { source: "Official", status: "面试", userTracked: true },
    { source: "Referral", status: "Offer", userTracked: true },
  ]);
  assert.deepEqual(analytics.counts, { discovered: 4, saved: 4, applied: 3, interviews: 2, offers: 1 });
  assert.equal(analytics.conversions.appliedToInterview, 66.7);
  assert.equal(analytics.bySource.every((row) => row.trendEligible === false), true);
  assert.equal(buildApplicationAnalytics([]).conversions.discoveredToApplied, null);

  const untracked = buildApplicationAnalytics([
    { source: "Official", status: "收藏", userTracked: false },
    { source: "Official", status: "收藏", userTracked: true },
  ]);
  assert.deepEqual(untracked.counts, { discovered: 2, saved: 1, applied: 0, interviews: 0, offers: 0 });
});

test("interview workspaces and prep outlines remain bounded and evidence-led", () => {
  const updated = updateApplicationInterview({}, "job-1", {
    scheduledAt: "2026-08-01T18:00:00.000Z",
    stage: "Hiring manager",
    notes: "Candidate-authored notes",
    questions: [{ id: "q-1", question: "Why this role?", status: "drafted", notes: "Use confirmed project." }],
  });
  assert.equal(updated.changed, true);
  const normalized = normalizeApplicationOperationsById(updated.operationsById);
  assert.equal(normalized["job-1"].interview.questions.length, 1);

  const outline = buildInterviewPrepOutline({
    id: "job-1",
    role: "Product Engineer",
    matchedEvidence: ["Confirmed project"],
    missingSignals: ["Large-scale ownership"],
  }, { id: "resume-job-1" });
  assert.deepEqual(outline.evidence, ["Confirmed project"]);
  assert.deepEqual(outline.gaps, ["Large-scale ownership"]);
  assert.ok(outline.guardrails.some((item) => item.includes("Do not invent")));
});
