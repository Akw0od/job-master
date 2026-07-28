import test from "node:test";
import assert from "node:assert/strict";
import { formatSignalScore } from "../src/domain/jobDiscovery.js";
import { translateUiText } from "../src/i18n.js";

test("application-assist approval copy does not imply automatic form filling", () => {
  const approval = "授权只启用本地字段复制和打开具体申请页；不会自动填表或提交，最终提交由本人完成。";
  const missingLink = "当前岗位没有具体申请链接。补充具体职位链接后再核对并打开字段包。";

  assert.equal(
    translateUiText(approval, "en"),
    "Authorization only enables local field copying and opening the specific application page. It never auto-fills or submits; you complete the final submission.",
  );
  assert.equal(
    translateUiText(missingLink, "en"),
    "This role has no specific application link. Add a specific role link before reviewing and opening its field packet.",
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
