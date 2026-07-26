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
