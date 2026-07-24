import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodexArgs,
  buildResumePrompt,
  formatCodexError,
  isAllowedOrigin,
} from "../local-agent/server.mjs";
import {
  buildJobSearchPrompt,
  isSpecificJobUrl,
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

test("job URL verification keeps only reachable specific official pages", async () => {
  const result = await verifyJobSearchResult({
    jobs: [
      {
        company: "Example",
        role: "Engineer Intern",
        location: "Remote",
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
        applyUrl: "https://example.com/careers",
        source: "Example Careers",
        posted: "Current",
        summary: "Generic listing.",
        jdText: "Generic job description that should not survive URL validation because the link is only a careers homepage.",
        requirements: ["Engineering"],
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
  assert.equal(result.rejectedCount, 1);
  assert.equal(isSpecificJobUrl("https://example.com/careers"), false);
});
