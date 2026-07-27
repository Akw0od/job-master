import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { translateUiText } from "../src/i18n.js";
import { getNextTabKey } from "../src/services/tabNavigation.js";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("navigation, filters, search, and status controls expose stable accessible state", () => {
  assert.match(appSource, /aria-label=\{t\("搜索岗位、公司或来源"\)\}/);
  assert.match(appSource, /<kbd aria-hidden="true">⌘K<\/kbd>/);
  assert.match(appSource, /aria-current=\{primarySection === key \? "page" : undefined\}/);
  assert.match(appSource, /role="group" aria-label=\{t\("市场"\)\}/);
  assert.match(appSource, /role="group" aria-label=\{t\("岗位类型"\)\}/);
  assert.match(appSource, /aria-pressed=\{targetMarket === market\}/);
  assert.match(appSource, /aria-pressed=\{employmentType === type\}/);
  assert.match(appSource, /role="tablist" aria-label=\{t\("申请包分区"\)\}/);
  assert.match(appSource, /role="tab"/);
  assert.match(appSource, /aria-selected=\{activeTab === tab\}/);
  assert.match(appSource, /aria-controls="application-tab-panel"/);
  assert.match(appSource, /tabIndex=\{activeTab === tab \? 0 : -1\}/);
  assert.match(appSource, /onKeyDown=\{handleApplicationTabKeyDown\}/);
  assert.match(appSource, /id="application-tab-panel"[\s\S]*?role="tabpanel"[\s\S]*?aria-labelledby=\{`application-tab-\$\{tabs\.indexOf\(activeTab\)\}`\}/);
  assert.match(appSource, /aria-label=\{t\("投递状态"\)\}/);
  assert.match(appSource, /Update \$\{job\.company\} \$\{job\.role\} status/);
});

test("narrow-screen modal, brand, and reduced-motion safeguards remain present", () => {
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*?\.modal-actions[\s\S]*?flex-direction: column/);
  assert.match(styles, /@media \(max-width: 480px\)[\s\S]*?\.modal-actions \.button[\s\S]*?width: 100%/);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*?\.brand-name[\s\S]*?display: none/);
  const baseSpinRule = styles.indexOf(".spin {\n  animation: interface-spin");
  const reducedMotionRule = styles.lastIndexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(baseSpinRule >= 0);
  assert.ok(reducedMotionRule > baseSpinRule);
  assert.match(styles.slice(reducedMotionRule), /\.spin\s*\{\s*animation: none !important;/);
  assert.equal(translateUiText("搜索岗位、公司或来源", "en"), "Search roles, companies, or sources");
});

test("application tabs use deterministic roving keyboard navigation", () => {
  const applicationTabs = ["岗位匹配", "定制简历", "追踪"];

  assert.equal(getNextTabKey(applicationTabs, "岗位匹配", "ArrowRight"), "定制简历");
  assert.equal(getNextTabKey(applicationTabs, "岗位匹配", "ArrowLeft"), "追踪");
  assert.equal(getNextTabKey(applicationTabs, "追踪", "Home"), "岗位匹配");
  assert.equal(getNextTabKey(applicationTabs, "岗位匹配", "End"), "追踪");
  assert.equal(getNextTabKey(applicationTabs, "岗位匹配", "Enter"), null);
  assert.equal(getNextTabKey([], "岗位匹配", "ArrowRight"), null);
});

test("source receipt uses a native collapsed disclosure with localized labels", () => {
  assert.match(appSource, /<details className="source-receipt">/);
  assert.match(appSource, /<summary>[\s\S]*?\{t\("来源凭据"\)\}/);
  assert.doesNotMatch(appSource, /<details className="source-receipt"\s+open/);
  assert.equal(translateUiText("来源凭据", "en"), "Source receipt");
  assert.match(styles, /\.source-receipt-grid\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.source-receipt-grid[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.source-receipt summary:focus-visible/);
  assert.match(appSource, /function formatReceiptTimestamp[\s\S]*?Number\.isFinite\(timestamp\)[\s\S]*?: t\("未提供"\)/);
  assert.match(appSource, /function formatReceiptHash[\s\S]*?if \(!receipt\?\.jdHash\) return t\("未提供"\)/);
  assert.match(appSource, /applyLiveUrlChecks\(liveSearchResult\.verificationChecks\)/);
});
