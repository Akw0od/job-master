import { ArrowSquareOut, CaretDown, ShieldCheck } from "@phosphor-icons/react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export function ApplicationAssistModal({
  t,
  uiLanguage,
  selected,
  activeResumeVersionId,
  resumeVersions,
  onResumeVersionChange,
  candidateProfile,
  onProfileChange,
  applicationConsent,
  onConsentToggle,
  canLaunch,
  onClose,
  onLaunch,
}) {
  const dialogRef = useDialogFocus({ onClose, initialFocusSelector: "input" });
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="application-assist-modal" role="dialog" aria-modal="true" aria-labelledby="application-assist-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span>{t("本地档案与字段授权")}</span>
            <h2 id="application-assist-title">{uiLanguage === "en" ? `Prepare the application for ${selected.company}` : `准备填写 ${selected.company} 的职位申请`}</h2>
          </div>
          <button aria-label={t("关闭申请填写辅助")} onClick={onClose}>×</button>
        </div>

        <div className="assist-job-summary">
          <span>{t("当前岗位")}</span>
          <strong>{selected.company} · {selected.role}</strong>
          <label>
            <span>{t("用于填写的简历")}</span>
            <select value={activeResumeVersionId} onChange={(event) => onResumeVersionChange(event.target.value)}>
              {resumeVersions.map((version) => <option key={version.id} value={version.id}>{version.name} · {version.language}</option>)}
            </select>
            <CaretDown size={16} />
          </label>
        </div>

        <div className="assist-profile-grid">
          <label><span>{t("姓名")}</span><input value={candidateProfile.name} onChange={(event) => onProfileChange("name", event.target.value)} placeholder={t("仅保存在当前浏览器")} /></label>
          <label><span>{t("邮箱")}</span><input type="email" value={candidateProfile.email} onChange={(event) => onProfileChange("email", event.target.value)} placeholder="name@example.com" /></label>
          <label><span>{t("电话")}</span><input type="tel" value={candidateProfile.phone} onChange={(event) => onProfileChange("phone", event.target.value)} placeholder={t("可选")} /></label>
          <label><span>{t("所在地")}</span><input value={candidateProfile.location} onChange={(event) => onProfileChange("location", event.target.value)} placeholder={t("可选")} /></label>
          <label className="full-width"><span>{t("LinkedIn / 个人主页")}</span><input value={candidateProfile.linkedin} onChange={(event) => onProfileChange("linkedin", event.target.value)} placeholder={t("可选")} /></label>
        </div>

        <fieldset className="consent-list">
          <legend>{t("本次允许使用的字段")}</legend>
          <label><input type="checkbox" checked={applicationConsent.contact} onChange={() => onConsentToggle("contact")} /><span><strong>{t("联系方式")}</strong><small>{t("姓名、邮箱、电话、所在地、个人主页")}</small></span></label>
          <label><input type="checkbox" checked={applicationConsent.education} onChange={() => onConsentToggle("education")} /><span><strong>{t("教育信息")}</strong><small>{t("仅使用当前简历中的已确认教育内容")}</small></span></label>
          <label><input type="checkbox" checked={applicationConsent.experience} onChange={() => onConsentToggle("experience")} /><span><strong>{t("经历与项目")}</strong><small>{t("仅使用当前选择的简历版本")}</small></span></label>
        </fieldset>

        <div className="assist-safety-note">
          <ShieldCheck size={18} />
          <p>{t("身份、签证、工作授权、薪资、保密声明和最终提交不会自动填写或提交。打开申请页后仍由你逐项确认。")}</p>
        </div>
        <div className="modal-actions">
          <button className="button quiet" onClick={onClose}>{t("稍后再说")}</button>
          <button className="button primary" disabled={!canLaunch} onClick={onLaunch}><ArrowSquareOut size={18} />{t("打开申请页并准备字段")}</button>
        </div>
      </section>
    </div>
  );
}
