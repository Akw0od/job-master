import test from "node:test";
import assert from "node:assert/strict";
import { formatSignalScore } from "../src/domain/jobDiscovery.js";
import { translateUiText } from "../src/i18n.js";

test("application-assist approval copy distinguishes manual handoff from exact one-time automation", () => {
  const approval = "手动模式只复制字段并打开申请页。自动化模式还需要审核官网实际字段，并对当前公司与岗位进行第二次单次授权。";
  const exactAuthorization = "这次授权只绑定当前岗位、来源凭据、简历版本、页面字段和答案。任何内容变化都会使授权失效。";

  assert.equal(
    translateUiText(approval, "en"),
    "Manual mode only copies fields and opens the application page. Automation also requires reviewing the actual official-site fields and a second one-time authorization for the exact company and role.",
  );
  assert.equal(
    translateUiText(exactAuthorization, "en"),
    "This authorization is bound to the exact role, source receipt, resume version, page fields, and answers. Any change invalidates it.",
  );
});

test("signal-score labels stay explicit in both interface languages", () => {
  assert.equal(formatSignalScore(46, "zh"), "信号分 46");
  assert.equal(formatSignalScore(46, "en"), "Signal score 46");
  assert.equal(translateUiText("信号分排序", "en"), "Sort by signal score");
  assert.equal(translateUiText("信号分", "en"), "Signal score");
});

test("application preflight and event history stay localized in English", () => {
  assert.equal(translateUiText("申请前检查", "en"), "Application preflight");
  assert.equal(
    translateUiText("我确认未知问题将由我本人在官网填写。", "en"),
    "I confirm that I will answer unknown questions on the official site myself.",
  );
  assert.equal(translateUiText("状态历史", "en"), "Status history");
  assert.equal(translateUiText("撤销最近状态变更", "en"), "Undo latest status change");
});
