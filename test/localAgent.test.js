import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import {
  buildCodexArgs,
  buildResumePrompt,
  formatCodexError,
  isAllowedOrigin,
} from "../local-agent/server.mjs";
import {
  buildJobSearchPrompt,
  isSpecificJobUrl,
  normalizeJobSearchPayload,
  verifyJobSearchResult,
} from "../local-agent/jobSearch.mjs";

test("local agent ignores an incompatible user model configuration", () => {
  const args = buildCodexArgs("/tmp/jobmaster", "/tmp/jobmaster/response.json", {
    schemaPath: "/tmp/jobmaster/schema.json",
  });

  assert.ok(args.indexOf("--ignore-user-config") > args.indexOf("exec"));
});

test("official job search enables live search before starting exec", () => {
  const args = buildCodexArgs("/tmp/jobmaster", "/tmp/jobmaster/response.json", {
    schemaPath: "/tmp/jobmaster/schema.json",
    enableSearch: true,
  });

  assert.ok(args.indexOf("--search") < args.indexOf("exec"));
});

test("local agent returns a short message instead of raw Codex logs", () => {
  const error = formatCodexError(`
WARN plugin setup failed
{"error":{"message":"The 'gpt-5.6-terra' model requires a newer version of Codex."}}
`);

  assert.equal(error, "本地 Codex CLI 版本过旧，无法运行当前任务。请升级 Codex 后重试。");
  assert.doesNotMatch(error, /WARN|gpt-5\.6-terra/);
});

test("local agent accepts Vite fallback ports without opening CORS to remote origins", () => {
  assert.equal(isAllowedOrigin("http://127.0.0.1:5182"), true);
  assert.equal(isAllowedOrigin("http://localhost:4173"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:5273"), true);
  assert.equal(isAllowedOrigin("https://127.0.0.1:5182"), false);
  assert.equal(isAllowedOrigin("http://example.com:5182"), false);
  assert.equal(isAllowedOrigin("http://localhost:5182.example.com"), false);
});

test("job-specific resume prompts include the complete JD as untrusted data", () => {
  const prompt = buildResumePrompt({
    market: "美国",
    language: "英文",
    targetRole: "Software Engineer",
    message: "Tailor the resume",
    jdText: "Full role description with testing, monitoring, and API ownership.",
    resumeText: "Candidate resume",
  });

  assert.match(prompt, /Target job description/);
  assert.match(prompt, /Full role description with testing/);
  assert.match(prompt, /untrusted employer data/);
});

test("job discovery prompt excludes candidate resume data", () => {
  const prompt = buildJobSearchPrompt({
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
    keywords: ["evaluation"],
  });

  assert.match(prompt, /official-site job discovery/);
  assert.doesNotMatch(prompt, /candidate resume/i);
  assert.match(prompt, /Do not use or request candidate personal data/);
});

test("job search schema requires the returned employment type", () => {
  const schema = JSON.parse(readFileSync(new URL("../local-agent/job-search.schema.json", import.meta.url), "utf8"));
  const jobSchema = schema.properties.jobs.items;

  assert.ok(jobSchema.required.includes("employmentType"));
  assert.deepEqual(jobSchema.properties.employmentType.enum, ["全职", "实习"]);
});

test("job search request accepts only supported filters and bounded keywords", () => {
  assert.deepEqual(normalizeJobSearchPayload({
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
    keywords: ["agent", " agent ", "evaluation"],
    seenIds: ["live-1"],
    existingApplyUrls: ["https://example.com/jobs/123"],
    limit: 4,
  }), {
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
    keywords: ["agent", "evaluation"],
    seenIds: ["live-1"],
    existingApplyUrls: ["https://example.com/jobs/123"],
    limit: 4,
  });

  assert.throws(
    () => normalizeJobSearchPayload({ market: "欧洲", employmentType: "实习", targetRole: "Engineer" }),
    /市场仅支持/,
  );
  assert.throws(
    () => normalizeJobSearchPayload({ market: "美国", employmentType: "合同工", targetRole: "Engineer" }),
    /岗位类型仅支持/,
  );
  assert.throws(
    () => normalizeJobSearchPayload({ market: "美国", employmentType: "实习", targetRole: "Engineer", keywords: "agent" }),
    /关键词必须是数组/,
  );
  assert.throws(
    () => normalizeJobSearchPayload({ market: "美国", employmentType: "实习", targetRole: "Engineer", keywords: Array(11).fill("agent") }),
    /关键词最多 10 个/,
  );
  assert.throws(
    () => normalizeJobSearchPayload({ market: "美国", employmentType: "实习", targetRole: "Engineer", existingApplyUrls: "https://example.com/jobs/1" }),
    /已有岗位链接必须是数组/,
  );
});

test("job URL verification keeps only reachable, matching official roles", async () => {
  const result = await verifyJobSearchResult({
    jobs: [
      {
        company: "Example",
        role: "Engineer Intern",
        location: "Remote",
        employmentType: "实习",
        applyUrl: "https://example.com/jobs/123",
        source: "Example Careers",
        posted: "Current",
        summary: "Build and test reliable systems.",
        jdText: "Build and test reliable systems with monitoring, APIs, documentation, and cross-team collaboration.",
        requirements: ["Testing"],
      },
      {
        company: "Generic",
        role: "Engineer",
        location: "Remote",
        employmentType: "实习",
        applyUrl: "https://example.com/careers",
        source: "Example Careers",
        posted: "Current",
        summary: "Generic listing.",
        jdText: "Generic job description that should not survive URL validation because the link is only a careers homepage.",
        requirements: ["Engineering"],
      },
      {
        company: "Wrong type",
        role: "Engineer",
        location: "Remote",
        employmentType: "全职",
        applyUrl: "https://example.com/jobs/456",
        source: "Example Careers",
        posted: "Current",
        summary: "This full-time role must not be relabeled as an internship.",
        jdText: "This full-time role must not be relabeled as an internship after the live job search response is verified.",
        requirements: ["Engineering"],
      },
      {
        company: "Aggregator",
        role: "Engineer Intern",
        location: "Remote",
        employmentType: "实习",
        applyUrl: "https://www.linkedin.com/jobs/view/123",
        source: "LinkedIn",
        posted: "Current",
        summary: "An aggregator role should never be accepted as an official source.",
        jdText: "An aggregator role should never be accepted as an official source even when its listing looks like a specific job page.",
        requirements: ["Engineering"],
      },
      {
        company: "Example",
        role: "Engineer Intern",
        location: "Remote",
        employmentType: "实习",
        applyUrl: "https://example.com/jobs/123",
        source: "Example Careers",
        posted: "Current",
        summary: "A duplicate official role should only appear once in a search response.",
        jdText: "A duplicate official role should only appear once in the normalized response even when the Agent returns it twice.",
        requirements: ["Testing"],
      },
    ],
    notes: [],
  }, {
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
  }, {
    fetchImpl: async (url) => ({
      ok: true,
      url,
      body: { cancel: async () => {} },
    }),
  });

  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].role, "Engineer Intern");
  assert.equal(result.jobs[0].employmentType, "实习");
  assert.equal(result.rejectedCount, 4);
  assert.equal(isSpecificJobUrl("https://example.com/careers"), false);
});

test("job URL validation rejects aggregators, credentials, and private network targets", () => {
  [
    "https://www.linkedin.com/jobs/view/123",
    "https://www.indeed.com/viewjob?jk=123",
    "https://www.glassdoor.com/job-listing/example-JV_IC123.htm",
    "https://www.zhipin.com/job_detail/123.html",
    "https://www.liepin.com/job/123.shtml",
    "https://user:pass@example.com/jobs/123",
    "https://localhost/jobs/123",
    "https://internal.local/jobs/123",
    "https://127.0.0.1/jobs/123",
    "https://10.0.0.1/jobs/123",
    "https://172.20.0.1/jobs/123",
    "https://192.168.1.1/jobs/123",
    "https://169.254.169.254/jobs/123",
    "https://[::1]/jobs/123",
    "https://[::ffff:7f00:1]/jobs/123",
    "https://[fd00::1]/jobs/123",
    "https://[fe80::1]/jobs/123",
    "https://[fec0::1]/jobs/123",
    "https://[64:ff9b:1::1]/jobs/123",
    "https://[100::1]/jobs/123",
    "https://[2002:7f00:1::1]/jobs/123",
    "https://[3fff::1]/jobs/123",
  ].forEach((url) => assert.equal(isSpecificJobUrl(url), false, url));

  assert.equal(isSpecificJobUrl("https://jobs.ashbyhq.com/example/123/application"), true);
});

test("job URL verification validates redirects before requesting the next hop", async () => {
  const calls = [];
  const result = await verifyJobSearchResult({
    jobs: [
      {
        company: "Private HTTPS redirect",
        role: "Engineer Intern",
        location: "Remote",
        employmentType: "实习",
        applyUrl: "https://example.com/jobs/https-redirect",
        source: "Example Careers",
        posted: "Current",
        summary: "A public URL that redirects to a private HTTPS target must be rejected.",
        jdText: "A public URL that redirects to a private HTTPS target must be rejected before a request is made to the private address.",
        requirements: ["Testing"],
      },
      {
        company: "Private HTTP redirect",
        role: "Engineer Intern",
        location: "Remote",
        employmentType: "实习",
        applyUrl: "https://example.com/jobs/http-redirect",
        source: "Example Careers",
        posted: "Current",
        summary: "A public URL that redirects to a private HTTP target must be rejected.",
        jdText: "A public URL that redirects to a private HTTP target must be rejected before a request is made to the private address.",
        requirements: ["Testing"],
      },
    ],
    notes: [],
  }, {
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
  }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, redirect: options.redirect });
      return {
        ok: false,
        status: 302,
        headers: { get: () => url.includes("https-redirect") ? "https://127.0.0.1/jobs/1" : "http://localhost/jobs/2" },
        body: { cancel: async () => {} },
      };
    },
  });

  assert.deepEqual(result.jobs, []);
  assert.deepEqual(calls, [
    { url: "https://example.com/jobs/https-redirect", redirect: "manual" },
    { url: "https://example.com/jobs/http-redirect", redirect: "manual" },
  ]);
});

test("job URL verification follows a validated official relative redirect", async () => {
  const calls = [];
  let cancelledBodies = 0;
  const result = await verifyJobSearchResult({
    jobs: [{
      company: "Example",
      role: "Engineer Intern",
      location: "Remote",
      employmentType: "实习",
      applyUrl: "https://example.com/jobs/123",
      source: "Example Careers",
      posted: "Current",
      summary: "A valid official redirect should retain the concrete job detail page.",
      jdText: "A valid official redirect should retain the concrete job detail page after each redirect target is checked before requesting it.",
      requirements: ["Testing"],
    }],
    notes: [],
  }, {
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
  }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, redirect: options.redirect });
      const isInitialUrl = url === "https://example.com/jobs/123";
      return {
        ok: !isInitialUrl,
        status: isInitialUrl ? 302 : 200,
        headers: { get: () => isInitialUrl ? "/jobs/456" : null },
        body: { cancel: async () => { cancelledBodies += 1; } },
      };
    },
  });

  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].applyUrl, "https://example.com/jobs/456");
  assert.deepEqual(calls, [
    { url: "https://example.com/jobs/123", redirect: "manual" },
    { url: "https://example.com/jobs/456", redirect: "manual" },
  ]);
  assert.equal(cancelledBodies, 2);
});

function createReadableBody(chunks, metrics) {
  let index = 0;
  return {
    getReader() {
      return {
        read: async () => {
          metrics.reads += 1;
          if (index >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: new TextEncoder().encode(chunks[index++]) };
        },
        cancel: async () => { metrics.readerCancels += 1; },
        releaseLock: () => { metrics.releases += 1; },
      };
    },
    cancel: async () => { metrics.bodyCancels += 1; },
  };
}

test("job URL verification rejects a 200 soft-404 page and cancels its body", async () => {
  const metrics = { reads: 0, readerCancels: 0, releases: 0, bodyCancels: 0 };
  const result = await verifyJobSearchResult({
    jobs: [{
      company: "Socure",
      role: "Engineer Intern",
      location: "Remote",
      employmentType: "实习",
      applyUrl: "https://jobs.ashbyhq.com/socure/e54f1700-c922-4bcc-a087-45b24717f974",
      source: "Ashby",
      posted: "Current",
      summary: "A role page that is actually a soft 404 must not be treated as verified.",
      jdText: "A role page that returns a successful HTTP status but says the requested job was not found must be rejected as closed.",
      requirements: ["Testing"],
    }],
    notes: [],
  }, {
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
  }, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: createReadableBody(["<title>Job not found</title><main>The job you requested was not found.</main>"], metrics),
    }),
  });

  assert.deepEqual(result.jobs, []);
  assert.deepEqual(result.rejectedApplyUrls, ["https://jobs.ashbyhq.com/socure/e54f1700-c922-4bcc-a087-45b24717f974"]);
  assert.deepEqual(metrics, { reads: 2, readerCancels: 1, releases: 1, bodyCancels: 1 });
});

test("job URL verification treats a response preview that reaches its bound as unknown", async () => {
  const metrics = { reads: 0, readerCancels: 0, releases: 0, bodyCancels: 0 };
  const chunks = ["<title>Software Engineer Intern</title><main>Build reliable systems.</main>", ...Array(300).fill("x".repeat(2048))];
  const result = await verifyJobSearchResult({
    jobs: [{
      company: "Example",
      role: "Engineer Intern",
      location: "Remote",
      employmentType: "实习",
      applyUrl: "https://example.com/jobs/123",
      source: "Example Careers",
      posted: "Current",
      summary: "A normal official role page should remain eligible after preview inspection.",
      jdText: "A normal official role page should remain eligible after a bounded response preview is inspected for explicit closure signals.",
      requirements: ["Testing"],
    }],
    notes: [],
  }, {
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
  }, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: createReadableBody(chunks, metrics),
    }),
  });

  assert.equal(result.jobs.length, 0);
  assert.deepEqual(result.rejectedApplyUrls, []);
  assert.ok(metrics.reads < chunks.length);
  assert.deepEqual(
    { readerCancels: metrics.readerCancels, releases: metrics.releases, bodyCancels: metrics.bodyCancels },
    { readerCancels: 1, releases: 1, bodyCancels: 1 },
  );
});

test("Ashby shell pages are cross-checked against the public published-job board", async () => {
  const calls = [];
  const result = await verifyJobSearchResult({
    jobs: [{
      company: "Socure",
      role: "Engineer Intern",
      location: "Remote",
      employmentType: "实习",
      applyUrl: "https://jobs.ashbyhq.com/socure/e54f1700-c922-4bcc-a087-45b24717f974",
      source: "Ashby",
      posted: "Current",
      summary: "A client-rendered Ashby shell should be checked against the public job board.",
      jdText: "A client-rendered Ashby shell should be checked against the public list of published job postings before it is accepted.",
      requirements: ["Testing"],
    }],
    notes: [],
  }, {
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
  }, {
    fetchImpl: async (url) => {
      calls.push(url);
      const isBoardRequest = url.startsWith("https://api.ashbyhq.com/posting-api/job-board/socure");
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: createReadableBody([isBoardRequest ? JSON.stringify({ jobs: [] }) : "<title>Jobs</title><main>Loading</main>"], {
          reads: 0,
          readerCancels: 0,
          releases: 0,
          bodyCancels: 0,
        }),
      };
    },
  });

  assert.deepEqual(result.jobs, []);
  assert.deepEqual(calls, [
    "https://jobs.ashbyhq.com/socure/e54f1700-c922-4bcc-a087-45b24717f974",
    "https://api.ashbyhq.com/posting-api/job-board/socure",
  ]);
});

test("Ashby board scan retains a target id that appears after 1MB", async () => {
  const targetId = "12737078-74c7-4e63-98a7-5e8da1e9deb1";
  const boardMetrics = { reads: 0, readerCancels: 0, releases: 0, bodyCancels: 0 };
  const boardChunks = [...Array(513).fill("x".repeat(2048)), `{"id":"${targetId}"}`];
  const result = await verifyJobSearchResult({
    jobs: [{
      company: "Replit",
      role: "Software Engineering Intern (Summer 2026)",
      location: "Remote",
      employmentType: "实习",
      applyUrl: `https://jobs.ashbyhq.com/replit/${targetId}`,
      source: "Ashby",
      posted: "Current",
      summary: "A current Ashby job should survive a board scan even when it appears late in the response.",
      jdText: "A current Ashby job should survive a bounded streaming board scan even when its identifier appears more than one megabyte into the response.",
      requirements: ["Testing"],
    }],
    notes: [],
  }, {
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
  }, {
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: createReadableBody(
        url.startsWith("https://api.ashbyhq.com/") ? boardChunks : ["<title>Jobs</title><main>Loading</main>"],
        url.startsWith("https://api.ashbyhq.com/") ? boardMetrics : { reads: 0, readerCancels: 0, releases: 0, bodyCancels: 0 },
      ),
    }),
  });

  assert.equal(result.jobs.length, 1);
  assert.ok(boardMetrics.reads > 513);
  assert.deepEqual(
    { readerCancels: boardMetrics.readerCancels, releases: boardMetrics.releases, bodyCancels: boardMetrics.bodyCancels },
    { readerCancels: 1, releases: 1, bodyCancels: 1 },
  );
});

test("Ashby board scan finds a target id split across response chunks", async () => {
  const targetId = "12737078-74c7-4e63-98a7-5e8da1e9deb1";
  const field = `{"id" : "${targetId}"}`;
  const result = await verifyJobSearchResult({
    jobs: [{
      company: "Replit",
      role: "Software Engineering Intern (Summer 2026)",
      location: "Remote",
      employmentType: "实习",
      applyUrl: `https://jobs.ashbyhq.com/replit/${targetId}`,
      source: "Ashby",
      posted: "Current",
      summary: "A target id split across chunks should still be found in the public job board.",
      jdText: "A target id split across response chunks should still be found by the bounded Ashby job-board scanner.",
      requirements: ["Testing"],
    }],
    notes: [],
  }, {
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
  }, {
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: createReadableBody(
        url.startsWith("https://api.ashbyhq.com/")
          ? [field.slice(0, 17), field.slice(17)]
          : ["<title>Jobs</title><main>Loading</main>"],
        { reads: 0, readerCancels: 0, releases: 0, bodyCancels: 0 },
      ),
    }),
  });

  assert.equal(result.jobs.length, 1);
});

test("existing live URLs are deterministically rechecked even when the Agent omits them", async () => {
  const socureUrl = "https://jobs.ashbyhq.com/socure/e54f1700-c922-4bcc-a087-45b24717f974";
  const replitId = "12737078-74c7-4e63-98a7-5e8da1e9deb1";
  const replitUrl = `https://jobs.ashbyhq.com/replit/${replitId}`;
  const calls = [];
  const result = await verifyJobSearchResult({
    jobs: [{
      company: "Replit",
      role: "Software Engineering Intern (Summer 2026)",
      location: "Remote",
      employmentType: "实习",
      applyUrl: replitUrl,
      source: "Ashby",
      posted: "Current",
      summary: "A live role returned by this Agent run.",
      jdText: "A current official role that remains available after deterministic URL verification.",
      requirements: ["Testing"],
    }],
  }, {
    market: "美国",
    employmentType: "实习",
    targetRole: "AI Agent Engineer",
    existingApplyUrls: [socureUrl, replitUrl],
  }, {
    fetchImpl: async (url) => {
      calls.push(url);
      if (url === socureUrl) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          body: createReadableBody(["<title>Job not found</title><main>The job you requested was not found.</main>"], {
            reads: 0,
            readerCancels: 0,
            releases: 0,
            bodyCancels: 0,
          }),
        };
      }
      if (url === replitUrl) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          body: createReadableBody(["<title>Jobs</title><main>Loading</main>"], {
            reads: 0,
            readerCancels: 0,
            releases: 0,
            bodyCancels: 0,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: createReadableBody([`{"jobs":[{"id":"${replitId}"}]}`], {
          reads: 0,
          readerCancels: 0,
          releases: 0,
          bodyCancels: 0,
        }),
      };
    },
  });

  assert.deepEqual(result.jobs.map((job) => job.applyUrl), [replitUrl]);
  assert.deepEqual(result.rejectedApplyUrls, [socureUrl]);
  assert.equal(calls.filter((url) => url === replitUrl).length, 1);
  assert.equal(calls.filter((url) => url === socureUrl).length, 1);
});

function internshipResult(url = "https://example.com/jobs/123") {
  return {
    jobs: [{
      company: "Example",
      role: "Engineer Intern",
      location: "Remote",
      employmentType: "实习",
      applyUrl: url,
      source: "Example Careers",
      posted: "Current",
      summary: "A concrete official role used to test verification outcomes.",
      jdText: "A concrete official role used to test verification outcomes without claiming unavailable when the network is uncertain.",
      requirements: ["Testing"],
    }],
  };
}

const internshipPayload = {
  market: "美国",
  employmentType: "实习",
  targetRole: "AI Agent Engineer",
};

test("only deterministic closure states reject an application URL", async () => {
  for (const status of [403, 429, 500]) {
    const result = await verifyJobSearchResult(internshipResult(), internshipPayload, {
      fetchImpl: async () => ({ ok: false, status, headers: { get: () => null }, body: { cancel: async () => {} } }),
    });
    assert.deepEqual(result.rejectedApplyUrls, [], `HTTP ${status} is unknown, not closed`);
  }

  for (const failure of [new Error("offline"), new DOMException("aborted", "AbortError")]) {
    const result = await verifyJobSearchResult(internshipResult(), internshipPayload, {
      fetchImpl: async () => { throw failure; },
    });
    assert.deepEqual(result.rejectedApplyUrls, [], `${failure.name} is unknown, not closed`);
  }

  for (const status of [404, 410]) {
    const result = await verifyJobSearchResult(internshipResult(), internshipPayload, {
      fetchImpl: async () => ({ ok: false, status, headers: { get: () => null }, body: { cancel: async () => {} } }),
    });
    assert.deepEqual(result.rejectedApplyUrls, ["https://example.com/jobs/123"]);
  }
});

test("a skipped employment-type mismatch cannot invalidate another role", async () => {
  let fetchCalls = 0;
  const wrongTypeUrl = "https://example.com/jobs/full-time-123";
  const result = await verifyJobSearchResult({
    jobs: [{ ...internshipResult(wrongTypeUrl).jobs[0], employmentType: "全职" }],
  }, internshipPayload, {
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("must not fetch a wrong employment type");
    },
  });

  assert.equal(fetchCalls, 0);
  assert.deepEqual(result.rejectedApplyUrls, []);
});

test("verification deduplicates URLs and limits concurrent requests", async () => {
  const urls = Array.from({ length: 80 }, (_, index) => `https://example.com/jobs/${index + 1}`);
  let inFlight = 0;
  let peak = 0;
  const calls = [];
  const result = await verifyJobSearchResult({ jobs: [] }, {
    ...internshipPayload,
    existingApplyUrls: [...urls, urls[0], urls[1]],
  }, {
    fetchImpl: async (url) => {
      calls.push(url);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return { ok: true, status: 200, headers: { get: () => null }, body: { cancel: async () => {} } };
    },
  });

  assert.equal(peak <= 4, true);
  assert.equal(calls.length, 80);
  assert.equal(new Set(calls).size, 80);
  assert.deepEqual(result.rejectedApplyUrls, []);
});

test("DNS validation rejects loopback aliases and redirect targets before any request", async () => {
  const calls = [];
  const resolveHostname = async (hostname) => {
    if (hostname === "localtest.me" || hostname === "127.0.0.1.nip.io") return [{ address: "127.0.0.1", family: 4 }];
    if (hostname === "private.example") return [{ address: "10.0.0.8", family: 4 }];
    return [{ address: "93.184.216.34", family: 4 }];
  };
  const localAlias = await verifyJobSearchResult(internshipResult("https://localtest.me/jobs/123"), internshipPayload, {
    resolveHostname,
    fetchImpl: async (url) => { calls.push(url); throw new Error("must not fetch loopback alias"); },
  });
  assert.deepEqual(localAlias.rejectedApplyUrls, []);
  assert.deepEqual(calls, []);

  const nipAlias = await verifyJobSearchResult(internshipResult("https://127.0.0.1.nip.io/jobs/123"), internshipPayload, {
    resolveHostname,
    fetchImpl: async (url) => { calls.push(url); throw new Error("must not fetch loopback alias"); },
  });
  assert.deepEqual(nipAlias.rejectedApplyUrls, []);
  assert.deepEqual(calls, []);

  const redirect = await verifyJobSearchResult(internshipResult("https://public.example/jobs/123"), internshipPayload, {
    resolveHostname,
    fetchImpl: async (url) => {
      calls.push(url);
      return {
        ok: false,
        status: 302,
        headers: { get: () => "https://private.example/jobs/456" },
        body: { cancel: async () => {} },
      };
    },
  });
  assert.deepEqual(redirect.rejectedApplyUrls, []);
  assert.deepEqual(calls, ["https://public.example/jobs/123"]);
});

test("a public DNS answer is supplied to the pinned request implementation", async () => {
  const pinnedAddresses = [];
  const result = await verifyJobSearchResult(internshipResult("https://public.example/jobs/123"), internshipPayload, {
    resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
    requestImpl: async (_url, _options, resolvedAddress) => {
      pinnedAddresses.push(resolvedAddress);
      return { ok: true, status: 200, headers: { get: () => null }, body: { cancel: async () => {} } };
    },
  });

  assert.equal(result.jobs.length, 1);
  assert.deepEqual(pinnedAddresses.map(({ address, family }) => ({ address, family })), [{ address: "93.184.216.34", family: 4 }]);
});

test("the default pinned HTTPS transport supports Node's lookup all=true contract", async () => {
  const lookups = [];
  const result = await verifyJobSearchResult(internshipResult("https://public.example/jobs/123"), internshipPayload, {
    resolveHostname: async () => [
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ],
    httpsRequestImpl: (_url, options, onResponse) => {
      options.lookup("public.example", { all: true }, (error, addresses) => lookups.push({ error, addresses }));
      options.lookup("public.example", { all: false }, (error, address, family) => lookups.push({ error, address, family }));
      let close;
      const request = {
        once(event, callback) {
          if (event === "close") close = callback;
          return request;
        },
        destroy() {},
        end() {
          const response = Readable.from([]);
          response.statusCode = 200;
          response.headers = {};
          onResponse(response);
          close?.();
        },
      };
      return request;
    },
  });

  assert.equal(result.jobs.length, 1);
  assert.deepEqual(lookups, [
    {
      error: null,
      addresses: [
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
        { address: "93.184.216.34", family: 4 },
      ],
    },
    { error: null, address: "93.184.216.34", family: 4 },
  ]);
});

test("special-use IPv6 DNS answers are rejected before transport", async () => {
  const blockedAddresses = ["fec0::1", "64:ff9b:1::1", "100::1", "2002:7f00:1::1", "3fff::1"];
  for (const address of blockedAddresses) {
    let calls = 0;
    const result = await verifyJobSearchResult(internshipResult("https://special.example/jobs/123"), internshipPayload, {
      resolveHostname: async () => [{ address, family: 6 }],
      requestImpl: async () => {
        calls += 1;
        throw new Error("special-use IPv6 must never reach transport");
      },
    });
    assert.equal(calls, 0, address);
    assert.deepEqual(result.rejectedApplyUrls, [], address);
  }
});

test("Ashby board failures and incomplete scans remain unknown", async () => {
  const ashbyUrl = "https://jobs.ashbyhq.com/example/e54f1700-c922-4bcc-a087-45b24717f974";
  for (const boardResponse of ["throw", "incomplete"]) {
    const result = await verifyJobSearchResult(internshipResult(ashbyUrl), internshipPayload, {
      fetchImpl: async (url) => {
        if (!url.startsWith("https://api.ashbyhq.com/")) {
          return { ok: true, status: 200, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        if (boardResponse === "throw") throw new Error("board unavailable");
        return { ok: true, status: 200, headers: { get: () => null }, body: { cancel: async () => {} } };
      },
    });
    assert.deepEqual(result.rejectedApplyUrls, [], boardResponse);
    assert.deepEqual(result.jobs, [], boardResponse);
  }
});
