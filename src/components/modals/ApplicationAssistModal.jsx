import { ArrowSquareOut, CopySimple, ShieldCheck } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export function ApplicationAssistModal({
  t,
  uiLanguage,
  selected,
  resumeVersion,
  candidateProfile,
  onProfileChange,
  authorization,
  onAuthorizationToggle,
  isConfirmed,
  onConfirmationChange,
  packet,
  canLaunch,
  contactValidation,
  previousAudit,
  sourceChanged,
  preflight,
  acknowledgements,
  onAcknowledgementsChange,
  isLaunching,
  onCopyFields,
  onClose,
  onLaunch,
}) {
  const dialogRef = useDialogFocus({ onClose, initialFocusSelector: "input" });
  const [copyStatus, setCopyStatus] = useState("");
  const authorizedFields = useMemo(() => packet.groups
    .filter((group) => authorization[group.id])
    .flatMap((group) => group.fields), [authorization, packet.groups]);
  const contactErrorId = "application-assist-contact-error";

  useEffect(() => {
    setCopyStatus("");
  }, [authorization, candidateProfile, packet]);

  async function copyFields(fields) {
    if (!fields.length) return;
    const copied = await onCopyFields(fields);
    setCopyStatus(copied
      ? t("已复制到系统剪贴板；未发送到网络。")
      : t("复制失败。请检查浏览器剪贴板权限后重试。"));
  }

  function formatFieldSource(source) {
    if (source.startsWith("Resume · ")) {
      return `${t("当前岗位版简历")} · ${source.slice("Resume · ".length)}`;
    }
    return t("申请辅助中的浏览器本地档案");
  }

  function preflightLabel(code, passed = false) {
    const labels = {
      "specific-https-application-url": ["具体 HTTPS 申请链接有效", "缺少具体 HTTPS 申请链接", "Specific HTTPS application URL is valid", "A specific HTTPS application URL is required"],
      "job-available": ["岗位仍可申请", "岗位已关闭或不可申请", "Job is still available", "Job is closed or unavailable"],
      "receipt-apply-url-match": ["来源凭据与申请链接一致", "来源凭据与申请链接不一致", "Receipt matches the application URL", "Receipt does not match the application URL"],
      "provider-id-consistent": ["职位提供方与岗位 ID 一致", "职位提供方或岗位 ID 冲突", "Provider and job ID are consistent", "Provider or job ID conflicts"],
      "saved-job-derived-resume": ["已保存对应岗位版简历", "需要保存对应岗位版简历", "Matching job-derived resume is saved", "Save a matching job-derived resume"],
      "resume-changes-saved": ["简历修改已保存", "仍有未保存的简历修改", "Resume edits are saved", "Resume edits are still unsaved"],
      "valid-contact": ["姓名和邮箱格式有效", "姓名或邮箱缺失/无效", "Name and email are valid", "Name or email is missing or invalid"],
      "contact-authorized": ["已授权非空联系方式字段", "需要授权非空联系方式字段", "Non-empty contact fields are authorized", "Authorize non-empty contact fields"],
      "truth-acknowledged": ["已确认仅使用真实信息", "请确认仅使用真实信息", "Truth acknowledgement is complete", "Confirm that only truthful information will be used"],
      "sensitive-acknowledged": ["已确认敏感字段边界", "请确认敏感字段边界", "Sensitive-field boundary is acknowledged", "Acknowledge the sensitive-field boundary"],
      "unknown-questions-acknowledged": ["未知问题将由本人填写", "请确认未知问题由本人填写", "Unknown questions stay manual", "Confirm that you will answer unknown questions"],
      "duplicate-application": ["未发现阻断性重复投递", "发现可能重复投递，需要明确覆盖", "No blocking duplicate was found", "Possible duplicate application requires an explicit override"],
      "duplicate-override": ["未启用重复投递覆盖", "已启用重复投递覆盖，请人工复核", "Duplicate override is not in use", "Duplicate override is enabled; review carefully"],
      "receipt-needs-review": ["来源凭据无需额外复核", "来源凭据需要人工复核", "Source receipt needs no extra review", "Source receipt needs manual review"],
      "receipt-stale": ["来源凭据在 24 小时内核验", "来源凭据过期、未核验或时间异常", "Source receipt was verified within 24 hours", "Source receipt is stale, unverified, or has an invalid time"],
      "provider-id-missing": ["职位提供方 ID 可用", "职位提供方 ID 缺失", "Provider job ID is available", "Provider job ID is missing"],
      "sensitive-lines-excluded": ["字段包未发现疑似敏感行", "字段包排除了疑似敏感行，请人工复核", "No sensitive-looking lines were found", "Sensitive-looking lines were excluded; review manually"],
      "packet-sections-unavailable": ["申请字段包章节可用", "部分申请字段包章节不可用", "Application packet sections are available", "Some application packet sections are unavailable"],
      "warnings-acknowledgement-required": ["已确认所有人工复核警告", "需确认所有人工复核警告", "All review warnings are acknowledged", "Acknowledge all review warnings"],
    };
    const label = labels[code];
    if (!label) return uiLanguage === "en" ? "Additional local safety check" : "额外本地安全检查";
    if (uiLanguage === "en") return passed ? label[2] : label[3];
    return passed ? label[0] : label[1];
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="application-assist-modal" role="dialog" aria-modal="true" aria-busy={isLaunching} aria-labelledby="application-assist-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span>{t("本地字段包与岗位授权")}</span>
            <h2 id="application-assist-title">{uiLanguage === "en" ? `Review local fields for ${selected.company}` : `核对 ${selected.company} 的本地申请字段`}</h2>
          </div>
          <button aria-label={t("关闭申请填写辅助")} disabled={isLaunching} onClick={onClose}>×</button>
        </div>

        <div className="assist-job-summary">
          <span>{t("仅限本次岗位")}</span>
          <strong>{selected.company} · {selected.role}</strong>
          <p>{t("字段来源简历版本")}: {resumeVersion?.name ?? t("未找到岗位版简历")}</p>
          {previousAudit?.preparedAt && (
            <small>
              {sourceChanged
                ? t("上次字段来源已变化；请重新逐项核对并授权。")
                : t("曾为同一岗位与简历版本打开申请页；本次仍需重新授权。")}
              <br />
              {t("上次审计简历版本")}: {previousAudit.resumeVersionId ?? t("未知版本")} · {previousAudit.fieldCount ?? 0} {t("项字段")}
            </small>
          )}
        </div>

        <section className="assist-profile-section" aria-labelledby="assist-profile-title">
          <div>
            <h3 id="assist-profile-title">{t("联系方式来源：浏览器本地档案")}</h3>
            <p>{t("这些字段不会自动填写；只有你勾选后才能复制到系统剪贴板。")}</p>
          </div>
          <div className="assist-profile-grid">
            <label><span>{t("姓名")}</span><input disabled={isLaunching} value={candidateProfile.name} onChange={(event) => onProfileChange("name", event.target.value)} placeholder={t("仅保存在当前浏览器")} aria-invalid={!contactValidation.ready && contactValidation.reason === "missing-name"} aria-describedby={!contactValidation.ready && contactValidation.reason === "missing-name" ? contactErrorId : undefined} /></label>
            <label><span>{t("邮箱")}</span><input disabled={isLaunching} type="email" value={candidateProfile.email} onChange={(event) => onProfileChange("email", event.target.value)} placeholder="name@example.com" aria-invalid={!contactValidation.ready && ["missing-email", "invalid-email"].includes(contactValidation.reason)} aria-describedby={!contactValidation.ready && ["missing-email", "invalid-email"].includes(contactValidation.reason) ? contactErrorId : undefined} /></label>
            <label><span>{t("电话")}</span><input disabled={isLaunching} type="tel" value={candidateProfile.phone} onChange={(event) => onProfileChange("phone", event.target.value)} placeholder={t("可选")} /></label>
            <label><span>{t("所在地")}</span><input disabled={isLaunching} value={candidateProfile.location} onChange={(event) => onProfileChange("location", event.target.value)} placeholder={t("可选")} /></label>
            <label className="full-width"><span>{t("LinkedIn / 个人主页")}</span><input disabled={isLaunching} value={candidateProfile.linkedin} onChange={(event) => onProfileChange("linkedin", event.target.value)} placeholder={t("可选")} /></label>
          </div>
          {!contactValidation.ready && (
            <p id={contactErrorId} className="assist-contact-error" role="alert">{t(contactValidation.reason === "invalid-email"
              ? "请填写格式正确的邮箱；不会猜测或改写邮箱。"
              : "打开申请页前需要非空姓名和邮箱。")}</p>
          )}
        </section>

        <fieldset className="consent-list">
          <legend>{t("本次可复制的字段组")}</legend>
          {packet.groups.map((group) => (
            <section key={group.id} className="assist-packet-group" aria-labelledby={`packet-${group.id}-title`}>
              <label className="assist-group-toggle">
                <input type="checkbox" checked={Boolean(authorization[group.id])} disabled={isLaunching || !group.fields.length} onChange={() => onAuthorizationToggle(group.id)} />
                <span><strong id={`packet-${group.id}-title`}>{t(group.label)}</strong><small>{group.fields.length ? t("勾选后可逐项复制，不会自动填写。") : t(group.unavailableCopy)}</small></span>
              </label>
              {group.fields.map((field) => (
                <article key={field.id} className="assist-field-value">
                  <div>
                    <span>{t(field.label)}</span>
                    <small>{t("来源")}: {formatFieldSource(field.source)}</small>
                  </div>
                  <p>{field.value}</p>
                  <button className="button quiet" disabled={isLaunching || !authorization[group.id]} onClick={() => copyFields([field])}>
                    <CopySimple size={16} />{t("复制此项")}
                  </button>
                </article>
              ))}
              {group.excludedLineCount > 0 && (
                <p className="assist-field-exclusion">{t("为避免复制敏感问卷字段，已从此章节排除")} {group.excludedLineCount} {t("行；正常项目内容未改写。")}</p>
              )}
            </section>
          ))}
        </fieldset>

        <div className="assist-copy-actions">
          <button className="button quiet" disabled={isLaunching || !authorizedFields.length} onClick={() => copyFields(authorizedFields)}>
            <CopySimple size={17} />{t("复制全部已授权字段")}{authorizedFields.length ? ` (${authorizedFields.length})` : ""}
          </button>
          <p role="status" aria-live="polite">{copyStatus}</p>
        </div>

        <fieldset className="consent-list">
          <legend>{t("申请前检查")}</legend>
          {(preflight?.checks ?? []).filter((check) => check.severity !== "invariant").map((check) => (
            <p key={check.code} className={check.passed ? "assist-check-passed" : check.severity === "blocking" ? "assist-contact-error" : "assist-field-exclusion"}>
              {check.passed ? "✓" : "!"} {preflightLabel(check.code, check.passed)}
            </p>
          ))}
          {preflight?.blocking?.includes("warnings-acknowledgement-required") && <p className="assist-contact-error">! {preflightLabel("warnings-acknowledgement-required", false)}</p>}
          {["truth", "sensitive", "unknownQuestions"].map((key) => (
            <label key={key} className="assist-job-confirmation">
              <input type="checkbox" disabled={isLaunching} checked={Boolean(acknowledgements?.[key])} onChange={(event) => onAcknowledgementsChange({ ...acknowledgements, [key]: event.target.checked })} />
              <span>{t(key === "truth" ? "我确认仅使用真实、已核对的信息。" : key === "sensitive" ? "我确认敏感或受保护字段不会被自动填写。" : "我确认未知问题将由我本人在官网填写。")}</span>
            </label>
          ))}
          {preflight?.warnings?.length > 0 && <label className="assist-job-confirmation"><input type="checkbox" disabled={isLaunching} checked={Boolean(acknowledgements?.warnings)} onChange={(event) => onAcknowledgementsChange({ ...acknowledgements, warnings: event.target.checked })} /><span>{t("我已阅读并接受以上需要人工复核的警告。")}</span></label>}
          {(preflight?.blocking?.includes("duplicate-application") || preflight?.warnings?.includes("duplicate-override") || acknowledgements?.duplicate) && <label className="assist-job-confirmation"><input type="checkbox" disabled={isLaunching} checked={Boolean(acknowledgements?.duplicate)} onChange={(event) => onAcknowledgementsChange({ ...acknowledgements, duplicate: event.target.checked })} /><span>{t("我确认仍要打开这个可能重复的申请记录。")}</span></label>}
        </fieldset>

        <label className="assist-job-confirmation">
          <input type="checkbox" disabled={isLaunching} checked={isConfirmed} onChange={(event) => onConfirmationChange(event.target.checked)} />
          <span>{t("我已核对此字段包，仅授权用于")} <strong>{selected.company} · {selected.role}</strong>{t("，最终提交由我完成。")}</span>
        </label>

        <div className="assist-safety-note">
          <ShieldCheck size={18} />
          <p>{t("字段包明确排除工作授权、签证/赞助、薪资、EEOC/身份、保密声明及提交动作。不会自动填表；字段包仅供逐项复制，最终提交由本人完成。")}</p>
        </div>
        {isLaunching && <p className="assist-launch-status" role="status" aria-live="polite">{t("正在核验官网职位链接，字段包已锁定。")}</p>}
        <div className="modal-actions">
          <button className="button quiet" disabled={isLaunching} onClick={onClose}>{t("稍后再说")}</button>
          <button className="button primary" disabled={!canLaunch || isLaunching} onClick={onLaunch}><ArrowSquareOut size={18} />{t(isLaunching ? "正在核验…" : "打开申请页（不自动填表）")}</button>
        </div>
      </section>
    </div>
  );
}
