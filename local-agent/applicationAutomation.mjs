/* global document, getComputedStyle */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashText, isSpecificApplicationUrl } from "../src/domain/applications.js";
import {
  beginSubmissionAttempt,
  completeSubmissionAttempt,
  normalizeSubmissionSessionsById,
  validateSubmissionAuthorization,
} from "../src/domain/applicationSubmission.js";
import { deriveOfficialJobProvider, normalizeReceiptUrl } from "../src/domain/sourceReceipt.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultProfileDir = join(currentDir, "..", ".jobmaster", "browser-profile");
const supportedProviders = new Set(["greenhouse", "ashby", "lever", "official-company-site"]);
const maxAutomationSessions = 5;
const maxConsumedAttempts = 200;
const safeText = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const safeCode = (value, max = 160) => {
  const normalized = safeText(value, max);
  return /^[a-z0-9._:-]+$/i.test(normalized) ? normalized : "";
};
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function concreteApplicationUrl(value) {
  const normalized = normalizeReceiptUrl(value);
  if (!normalized || !isSpecificApplicationUrl(normalized)) return "";
  const url = new URL(normalized);
  url.hash = "";
  return url.href;
}

export function normalizeApplicationScanPayload(value) {
  const source = isPlainObject(value) ? value : {};
  const applicationUrl = concreteApplicationUrl(source.applicationUrl);
  const applicationId = safeText(source.applicationId, 120);
  const sessionId = safeCode(source.sessionId, 160);
  const derived = applicationUrl ? deriveOfficialJobProvider(applicationUrl) : {};
  const provider = safeCode(source.provider || derived.provider || "unknown", 80);
  const providerJobId = safeCode(source.providerJobId || derived.providerJobId || "unknown", 160);
  if (!applicationUrl || !applicationId || !sessionId || !supportedProviders.has(provider)) {
    throw new Error("自动化扫描需要受支持提供方的具体职位申请链接。");
  }
  if (derived.provider !== "unknown" && provider !== derived.provider) {
    throw new Error("申请链接与声明的职位提供方不一致。");
  }
  if (derived.providerJobId && providerJobId !== "unknown" && providerJobId !== derived.providerJobId) {
    throw new Error("申请链接与声明的职位 ID 不一致。");
  }
  return { applicationUrl, applicationId, sessionId, provider, providerJobId };
}

function normalizeRawControl(value, index) {
  if (!isPlainObject(value)) return null;
  const type = safeCode(value.type || "text", 40) || "text";
  const label = safeText(value.label || value.placeholder || value.name || value.id || `Field ${index + 1}`, 240);
  if (!label) return null;
  const target = {
    id: safeText(value.id, 240),
    name: safeText(value.name, 240),
    label: safeText(value.label, 240),
  };
  const category = value.sensitive === true ? "sensitive" : value.category === "narrative" ? "narrative" : "factual";
  const sourceCode = category === "sensitive" ? "page-manual" : "profile";
  const id = `field-${hashText(JSON.stringify([type, label, target.id, target.name, index]))}`;
  return {
    id,
    label,
    type,
    required: value.required === true,
    category,
    sourceCode,
    options: Array.isArray(value.options)
      ? value.options.map((item) => safeText(item, 160)).filter(Boolean).slice(0, 50)
      : [],
    target,
  };
}

export function buildApplicationPageScan({
  applicationId,
  provider,
  providerJobId,
  finalUrl,
  title,
  controls,
  captchaPresent,
  submitControls,
} = {}) {
  const safeUrl = concreteApplicationUrl(finalUrl);
  const derived = safeUrl ? deriveOfficialJobProvider(safeUrl) : {};
  if (!safeUrl || !supportedProviders.has(provider) || (derived.provider !== "unknown" && derived.provider !== provider)) {
    throw new Error("申请页跳转到了不受支持或不匹配的页面。");
  }
  const fields = Array.isArray(controls)
    ? controls.slice(0, 120).map(normalizeRawControl).filter(Boolean)
    : [];
  const submitButtons = Array.isArray(submitControls)
    ? submitControls.map((item) => ({
      label: safeText(item?.label, 160),
      id: safeText(item?.id, 240),
      name: safeText(item?.name, 240),
      type: safeCode(item?.type || "submit", 40) || "submit",
    })).filter((item) => item.label || item.id || item.name).slice(0, 4)
    : [];
  const pageFingerprint = `page1-${hashText(JSON.stringify({
    applicationId: safeText(applicationId, 120),
    provider,
    providerJobId: safeCode(providerJobId || "unknown", 160),
    url: safeUrl,
    title: safeText(title, 240),
    fields: fields.map((field) => ({
      id: field.id, label: field.label, type: field.type, required: field.required,
      category: field.category, options: field.options,
    })),
    submitButtons,
    captchaPresent: captchaPresent === true,
  }))}`;
  return {
    applicationId: safeText(applicationId, 120),
    provider,
    providerJobId: safeCode(providerJobId || "unknown", 160),
    pageFingerprint,
    fields,
    captchaPresent: captchaPresent === true,
    submitControlCount: submitButtons.length,
    capabilities: {
      fill: fields.length > 0,
      submit: fields.length > 0 && submitButtons.length === 1 && captchaPresent !== true,
    },
    submitButtons,
  };
}

export function buildAutomationExecutionPlan(scan, authorizedSession) {
  const sessions = normalizeSubmissionSessionsById({ [authorizedSession?.id ?? ""]: authorizedSession });
  const session = sessions[authorizedSession?.id];
  if (!session || session.status !== "authorized") throw new Error("自动提交授权无效或已失效。");
  if (session.applicationId !== scan?.applicationId || session.provider !== scan?.provider
    || session.providerJobId !== scan?.providerJobId || session.pageFingerprint !== scan?.pageFingerprint) {
    throw new Error("申请页、职位身份或审核内容已变化，请重新扫描并审核。");
  }
  const fieldsById = new Map((scan.fields ?? []).map((field) => [field.id, field]));
  const steps = [];
  for (const reviewed of session.fields) {
    const scanned = fieldsById.get(reviewed.id);
    if (!scanned) throw new Error("审核字段已不在当前申请页中。");
    if (reviewed.category === "sensitive") {
      if (reviewed.reviewState !== "page-confirmed") throw new Error("敏感字段必须由本人在申请页完成。");
      steps.push({ action: "verify-existing", field: scanned });
      continue;
    }
    if (reviewed.reviewState === "page-confirmed") {
      steps.push({ action: "verify-existing", field: scanned });
      continue;
    }
    if (reviewed.reviewState !== "confirmed" || !reviewed.value) throw new Error("仍有未审核字段。");
    steps.push({ action: "fill", field: scanned, value: reviewed.value });
  }
  return {
    session,
    steps,
    shouldSubmit: session.modeRequested === "review-submit",
    shouldFill: session.modeRequested !== "manual-handoff",
  };
}

async function collectPageDescriptor(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element) => {
      const aria = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby");
      if (aria) return aria;
      if (element.id) {
        const label = [...document.querySelectorAll("label")].find((candidate) => candidate.htmlFor === element.id);
        if (label?.textContent) return label.textContent.trim();
      }
      const parentLabel = element.closest("label");
      return parentLabel?.textContent?.trim()
        || element.getAttribute("placeholder")
        || element.getAttribute("name")
        || element.id
        || "";
    };
    const sensitive = (label) => /work\s*authori[sz]ation|visa|sponsor|salary|compensation|gender|race|ethnicity|disability|veteran|ssn|date\s+of\s+birth|工作授权|签证|赞助|薪资|薪酬|性别|种族|民族|残疾|退伍|出生日期/i.test(label);
    const narrative = (element, label) => element.tagName === "TEXTAREA"
      || /why|motivat|interest|describe|cover\s+letter|为什么|动机|兴趣|请描述|求职信/i.test(label);
    const controls = [...document.querySelectorAll("input, textarea, select")]
      .filter((element) => !["hidden", "button", "submit", "reset", "image"].includes(String(element.type).toLowerCase()))
      .filter((element) => !element.disabled && visible(element))
      .slice(0, 120)
      .map((element) => {
        const label = labelFor(element);
        return {
          id: element.id || "",
          name: element.getAttribute("name") || "",
          label,
          placeholder: element.getAttribute("placeholder") || "",
          type: element.tagName === "SELECT" ? "select" : element.tagName === "TEXTAREA" ? "textarea" : String(element.type || "text").toLowerCase(),
          required: element.required || element.getAttribute("aria-required") === "true",
          sensitive: sensitive(label),
          category: narrative(element, label) ? "narrative" : "factual",
          options: element.tagName === "SELECT"
            ? [...element.options].map((option) => option.textContent?.trim() || option.value).filter(Boolean).slice(0, 50)
            : [],
        };
      });
    const submitControls = [...document.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])')]
      .filter((element) => !element.disabled && visible(element))
      .filter((element) => /submit|apply|send\s+application|提交|申请|投递/i.test(element.textContent || element.value || element.getAttribute("aria-label") || ""))
      .slice(0, 4)
      .map((element) => ({
        id: element.id || "",
        name: element.getAttribute("name") || "",
        label: (element.textContent || element.value || element.getAttribute("aria-label") || "").trim(),
        type: String(element.type || "button").toLowerCase(),
      }));
    const bodyText = document.body?.innerText?.slice(0, 20_000) || "";
    const captchaPresent = Boolean(
      document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], [class*="captcha" i], [id*="captcha" i]')
      || /verify\s+you(?:'|’)re\s+human|captcha|人机验证|验证码/i.test(bodyText),
    );
    return { controls, submitControls, captchaPresent, title: document.title };
  });
}

function targetLocator(page, field) {
  const target = field.target ?? {};
  if (target.id) return page.locator(`[id=${JSON.stringify(target.id)}]`);
  if (target.name) return page.locator(`[name=${JSON.stringify(target.name)}]`);
  if (target.label) return page.getByLabel(target.label, { exact: true });
  return null;
}

async function fieldHasValue(locator, field) {
  if (!locator || await locator.count() !== 1) return false;
  if (field.type === "checkbox" || field.type === "radio") return locator.isChecked();
  if (field.type === "file") return locator.evaluate((element) => Boolean(element.files?.length));
  return Boolean((await locator.inputValue()).trim());
}

async function fillField(locator, field, value) {
  if (!locator || await locator.count() !== 1) throw new Error(`无法唯一定位字段 ${field.id}。`);
  if (field.type === "file") throw new Error("简历或附件需要本人选择文件。");
  if (field.type === "checkbox") {
    if (/^(?:true|yes|1)$/i.test(value)) await locator.check();
    else await locator.uncheck();
    return;
  }
  if (field.type === "radio") {
    if (!/^(?:true|yes|1)$/i.test(value)) throw new Error(`单选字段 ${field.id} 需要本人确认。`);
    await locator.check();
    return;
  }
  if (field.type === "select") {
    try {
      await locator.selectOption({ label: value });
    } catch {
      await locator.selectOption(value);
    }
    return;
  }
  await locator.fill(value);
}

async function requiredFieldGaps(page) {
  return page.evaluate(() => [...document.querySelectorAll("input, textarea, select")]
    .filter((element) => !element.disabled && (element.required || element.getAttribute("aria-required") === "true"))
    .filter((element) => !element.checkValidity())
    .slice(0, 20)
    .map((element) => ({
      id: element.id || "",
      name: element.getAttribute("name") || "",
      type: String(element.type || element.tagName).toLowerCase(),
    })));
}

async function locateSubmitControl(page, descriptor) {
  if (descriptor.id) return page.locator(`[id=${JSON.stringify(descriptor.id)}]`);
  if (descriptor.name) return page.locator(`[name=${JSON.stringify(descriptor.name)}]`);
  if (descriptor.type === "submit") {
    const input = page.locator(`input[type="submit"][value=${JSON.stringify(descriptor.label)}]`);
    if (await input.count() === 1) return input;
  }
  return page.getByRole("button", { name: descriptor.label, exact: true });
}

async function confirmationEvidence(page, beforeUrl) {
  const result = await page.evaluate(() => {
    const text = document.body?.innerText?.slice(0, 40_000) || "";
    return {
      title: document.title,
      hasConfirmation: /application\s+(?:has\s+been\s+)?(?:submitted|received)|thank\s+you\s+for\s+applying|submission\s+confirmed|申请已提交|投递成功|感谢(?:您|你)的申请/i.test(text),
      hasVisibleForm: [...document.querySelectorAll("form")].some((form) => {
        const rect = form.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
    };
  });
  if (!result.hasConfirmation || (page.url() === beforeUrl && result.hasVisibleForm)) return null;
  return {
    resultCode: page.url() !== beforeUrl ? "success-page" : "provider-confirmation",
    confirmationFingerprint: `confirm-${hashText(JSON.stringify({
      url: page.url(),
      title: safeText(result.title, 240),
      hasConfirmation: result.hasConfirmation,
      hasVisibleForm: result.hasVisibleForm,
    }))}`,
  };
}

export class ApplicationAutomationRunner {
  constructor({ profileDir = defaultProfileDir, launchContext } = {}) {
    this.profileDir = profileDir;
    this.launchContext = launchContext;
    this.context = null;
    this.sessions = new Map();
    this.consumedAuthorizationIds = new Set();
    this.consumedAttemptIds = new Set();
  }

  async ensureContext() {
    if (this.context) return this.context;
    if (this.launchContext) {
      this.context = await this.launchContext(this.profileDir);
      return this.context;
    }
    const { chromium } = await import("playwright-core");
    this.context = await chromium.launchPersistentContext(this.profileDir, {
      channel: "chrome",
      headless: false,
      viewport: null,
    });
    return this.context;
  }

  async scan(payloadInput) {
    const payload = normalizeApplicationScanPayload(payloadInput);
    const context = await this.ensureContext();
    const existing = this.sessions.get(payload.sessionId);
    if (existing && (
      existing.payload.applicationUrl !== payload.applicationUrl
      || existing.payload.applicationId !== payload.applicationId
      || existing.payload.provider !== payload.provider
      || existing.payload.providerJobId !== payload.providerJobId
    )) {
      throw new Error("扫描会话已绑定其他职位或申请链接，请创建新会话。");
    }
    const page = existing?.page && !existing.page.isClosed() ? existing.page : await context.newPage();
    if (!existing?.page || existing.page.isClosed()) {
      await page.goto(payload.applicationUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    }
    const descriptor = await collectPageDescriptor(page);
    const scan = buildApplicationPageScan({
      applicationId: payload.applicationId,
      provider: payload.provider,
      providerJobId: payload.providerJobId,
      finalUrl: page.url(),
      title: descriptor.title,
      controls: descriptor.controls,
      captchaPresent: descriptor.captchaPresent,
      submitControls: descriptor.submitControls,
    });
    this.sessions.set(payload.sessionId, { payload, page, scan, scannedAt: new Date().toISOString() });
    while (this.sessions.size > maxAutomationSessions) {
      const [oldestId, oldest] = this.sessions.entries().next().value;
      await oldest.page.close().catch(() => {});
      this.sessions.delete(oldestId);
    }
    return {
      sessionId: payload.sessionId,
      status: "review-required",
      ...scan,
      fields: scan.fields.map((field) => {
        const publicField = { ...field };
        delete publicField.target;
        return publicField;
      }),
      submitButtons: scan.submitButtons.map((button) => {
        const publicButton = { ...button };
        delete publicButton.id;
        delete publicButton.name;
        return publicButton;
      }),
    };
  }

  async execute({ sessionId, review, authorizedSession, attemptId, now = new Date().toISOString() } = {}) {
    const safeSessionId = safeCode(sessionId, 160);
    const active = this.sessions.get(safeSessionId);
    if (!active || active.page.isClosed()) throw new Error("申请页会话不存在或已关闭，请重新扫描。");
    const validation = validateSubmissionAuthorization(review, authorizedSession, now);
    if (!validation.valid) throw new Error(`自动提交授权无效：${validation.reason}`);
    const authorizationId = safeCode(authorizedSession?.authorizationId, 160);
    const safeAttemptId = safeCode(attemptId, 160);
    if (!authorizationId || !safeAttemptId) throw new Error("自动提交授权或尝试标识无效。");
    if (this.consumedAuthorizationIds.has(authorizationId) || this.consumedAttemptIds.has(safeAttemptId)) {
      throw new Error("这次单次授权已经执行过，必须重新扫描、审核并授权。");
    }
    this.rememberConsumed(this.consumedAuthorizationIds, authorizationId);
    this.rememberConsumed(this.consumedAttemptIds, safeAttemptId);
    const plan = buildAutomationExecutionPlan(active.scan, authorizedSession);
    const refreshedDescriptor = await collectPageDescriptor(active.page);
    const refreshedScan = buildApplicationPageScan({
      applicationId: active.payload.applicationId,
      provider: active.payload.provider,
      providerJobId: active.payload.providerJobId,
      finalUrl: active.page.url(),
      title: refreshedDescriptor.title,
      controls: refreshedDescriptor.controls,
      captchaPresent: refreshedDescriptor.captchaPresent,
      submitControls: refreshedDescriptor.submitControls,
    });
    if (refreshedScan.pageFingerprint !== active.scan.pageFingerprint) {
      throw new Error("申请页字段或提交控件已变化，请重新扫描并审核。");
    }
    if (refreshedScan.captchaPresent) throw new Error("检测到 CAPTCHA 或人机验证，已停止自动化。");
    const started = beginSubmissionAttempt(plan.session, {
      attemptId: safeAttemptId,
      pageFingerprint: refreshedScan.pageFingerprint,
      now,
    });
    if (!started.changed) throw new Error(`无法开始提交：${started.reason}`);
    for (const step of plan.steps) {
      const locator = targetLocator(active.page, step.field);
      if (step.action === "verify-existing") {
        if (!await fieldHasValue(locator, step.field)) {
          return {
            session: completeSubmissionAttempt(started.session, {
              outcome: "manual-required",
              resultCode: "manual-field-empty",
              now: new Date().toISOString(),
            }).session,
            status: "manual-required",
            reason: "manual-field-empty",
            fieldId: step.field.id,
          };
        }
      } else {
        await fillField(locator, step.field, step.value);
      }
    }
    const gaps = await requiredFieldGaps(active.page);
    if (gaps.length) {
      return {
        session: completeSubmissionAttempt(started.session, {
          outcome: "manual-required",
          resultCode: "required-fields-incomplete",
          now: new Date().toISOString(),
        }).session,
        status: "manual-required",
        reason: "required-fields-incomplete",
        missingFieldCount: gaps.length,
      };
    }
    if (!plan.shouldSubmit) {
      return {
        session: completeSubmissionAttempt(started.session, {
          outcome: "manual-required",
          resultCode: "fill-only-complete",
          now: new Date().toISOString(),
        }).session,
        status: "filled",
        reason: "fill-only-complete",
      };
    }
    if (!refreshedScan.capabilities.submit || refreshedScan.submitButtons.length !== 1) {
      return {
        session: completeSubmissionAttempt(started.session, {
          outcome: "manual-required",
          resultCode: "submit-control-ambiguous",
          now: new Date().toISOString(),
        }).session,
        status: "manual-required",
        reason: "submit-control-ambiguous",
      };
    }
    const submit = await locateSubmitControl(active.page, active.scan.submitButtons[0]);
    if (!submit || await submit.count() !== 1) throw new Error("无法唯一定位最终提交按钮。");
    const beforeUrl = active.page.url();
    await submit.click();
    await active.page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
    const evidence = await confirmationEvidence(active.page, beforeUrl);
    if (!evidence) {
      return {
        session: completeSubmissionAttempt(started.session, {
          outcome: "manual-required",
          resultCode: "confirmation-not-proven",
          now: new Date().toISOString(),
        }).session,
        status: "manual-required",
        reason: "confirmation-not-proven",
      };
    }
    const completed = completeSubmissionAttempt(started.session, {
      outcome: "submitted",
      ...evidence,
      now: new Date().toISOString(),
    });
    return { session: completed.session, status: "submitted", reason: "ok" };
  }

  getSessionApplicationUrl(sessionId) {
    const safeSessionId = safeCode(sessionId, 160);
    return this.sessions.get(safeSessionId)?.payload?.applicationUrl ?? "";
  }

  rememberConsumed(collection, value) {
    collection.add(value);
    while (collection.size > maxConsumedAttempts) {
      collection.delete(collection.values().next().value);
    }
  }

  async closeSession(sessionId) {
    const safeSessionId = safeCode(sessionId, 160);
    const active = this.sessions.get(safeSessionId);
    if (!active) return false;
    await active.page.close().catch(() => {});
    this.sessions.delete(safeSessionId);
    return true;
  }

  async close() {
    await Promise.all([...this.sessions.values()].map((session) => session.page.close().catch(() => {})));
    this.sessions.clear();
    if (this.context) await this.context.close().catch(() => {});
    this.context = null;
    this.consumedAuthorizationIds.clear();
    this.consumedAttemptIds.clear();
  }
}

export function applicationAutomationCapabilities() {
  return {
    available: true,
    browser: "dedicated-chrome-profile",
    providers: [...supportedProviders].sort(),
    modes: ["fill-only", "review-submit"],
    guarantees: ["exact-payload", "single-attempt", "page-change-stop", "captcha-stop", "confirmation-required"],
  };
}
