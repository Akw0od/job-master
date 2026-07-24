import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function codexLoginStatus() {
  return new Promise((resolve) => {
    execFile("codex", ["login", "status"], { timeout: 10_000 }, (error, stdout, stderr) => {
      const output = `${stdout}\n${stderr}`.trim();
      resolve({ available: !error, detail: output || "Codex login status unavailable" });
    });
  });
}

export function buildCodexArgs(workDir, outputPath, { schemaPath, enableSearch = false } = {}) {
  if (!schemaPath) throw new Error("A response schema path is required.");
  return [
    "--sandbox",
    "read-only",
    "--ask-for-approval",
    "never",
    ...(enableSearch ? ["--search"] : []),
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--skip-git-repo-check",
    "--color",
    "never",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "-C",
    workDir,
    "-",
  ];
}

export function formatCodexError(stderr) {
  const detail = String(stderr || "");
  if (/requires a newer version of Codex/i.test(detail)) {
    return "本地 Codex CLI 版本过旧，无法运行当前任务。请升级 Codex 后重试。";
  }
  if (/not logged in|authentication|unauthorized/i.test(detail)) {
    return "本地 Codex 尚未登录，请完成登录后重试。";
  }
  if (/timed out|timeout/i.test(detail)) {
    return "本地 Codex 请求超时。请稍后重试。";
  }
  return "本地 Codex 运行失败。请检查 CLI 登录状态和版本后重试。";
}

export async function runCodexPrompt({
  prompt,
  schemaPath,
  enableSearch = false,
  timeoutMs = 120_000,
}) {
  const workDir = await mkdtemp(join(tmpdir(), "job-master-agent-"));
  const outputPath = join(workDir, "response.json");
  const args = buildCodexArgs(workDir, outputPath, { schemaPath, enableSearch });

  try {
    await new Promise((resolve, reject) => {
      const child = spawn("codex", args, { stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Codex timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(formatCodexError(stderr)));
      });
      child.stdin.end(prompt);
    });
    const output = await readFile(outputPath, "utf8");
    return JSON.parse(output);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
