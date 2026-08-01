import { CheckCircle, FileText, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

const evidenceOptions = [
  ["success-page", "官网成功页", "提交后页面明确显示申请成功。"],
  ["confirmation-email", "确认邮件", "招聘方或 ATS 已发送本岗位的确认邮件。"],
  ["ats-account", "ATS 账户记录", "招聘系统账户中已出现本岗位的申请记录。"],
  ["confirmation-id", "确认编号", "官网返回了本次申请的确认编号。"],
];

const blockingLabels = {
  "specific-https-application-url": "当前岗位缺少具体的 HTTPS 申请链接。",
  "receipt-apply-url-match": "岗位来源凭据与当前申请链接不一致。",
  "saved-job-derived-resume": "需要选择一份已保存、且属于当前岗位的岗位版简历。",
  "submitted-at-valid": "请输入有效的投递时间。",
  "submitted-at-not-future": "投递时间不能晚于当前时间。",
};

const warningLabels = {
  "receipt-needs-review": "当前来源凭据仍需要复核。",
  "receipt-stale": "岗位链接核验已超过 24 小时；确认记录会保留当前凭据指纹。",
  "provider-id-missing": "来源凭据缺少招聘方岗位编号。",
  "job-unavailable": "这个岗位后来被标记为不可用；历史投递仍可记录。",
};

export function ManualSubmissionConfirmModal({
  t,
  job,
  targetStatus,
  resumeVersions,
  resumeVersionId,
  onResumeVersionChange,
  evidenceCode,
  onEvidenceCodeChange,
  submittedAt,
  onSubmittedAtChange,
  acknowledged,
  onAcknowledgedChange,
  preflight,
  receiptSummary,
  onPrepareResume,
  onClose,
  onConfirm,
}) {
  const dialogRef = useDialogFocus({ onClose, initialFocusSelector: resumeVersions.length ? "select" : "button" });
  const structuralBlocking = (preflight?.blocking ?? []).filter((code) => blockingLabels[code]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="application-assist-modal manual-submission-modal" role="dialog" aria-modal="true" aria-labelledby="manual-submission-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span>{t("确认投递记录")}</span>
            <h2 id="manual-submission-title">{job.company} · {job.role}</h2>
          </div>
          <button aria-label={t("关闭投递确认")} onClick={onClose}>×</button>
        </div>

        <div className="assist-safety-note">
          <ShieldCheck size={18} />
          <p>{t("只有看到官网成功页、确认邮件、ATS 账户记录或确认编号后，才能把岗位计入已投递。Jobmaster 只保存证据类型和记录指纹，不保存邮件、答案或网址。")}</p>
        </div>

        <div className="manual-submission-target">
          <span>{t("更新后的状态")}</span>
          <strong><CheckCircle size={17} weight="fill" />{t(targetStatus)}</strong>
        </div>

        <label className="manual-confirmation-field">
          <span>{t("本次使用的简历")}</span>
          <select value={resumeVersionId} onChange={(event) => onResumeVersionChange(event.target.value)} disabled={!resumeVersions.length}>
            {!resumeVersions.length && <option value="">{t("没有可用的岗位版简历")}</option>}
            {resumeVersions.map((version) => <option key={version.id} value={version.id}>{version.name || version.id}</option>)}
          </select>
        </label>

        {!resumeVersions.length && (
          <div className="manual-submission-missing" role="alert">
            <FileText size={18} />
            <div><strong>{t("先保存一份当前岗位的岗位版简历")}</strong><p>{t("确认记录必须绑定实际投递的简历版本，不能用 Master Resume 或未保存草稿代替。")}</p></div>
            <button className="button quiet" onClick={onPrepareResume}>{t("去准备岗位版")}</button>
          </div>
        )}

        <fieldset className="manual-evidence-fieldset">
          <legend>{t("投递成功证据")}</legend>
          <div className="manual-evidence-grid">
            {evidenceOptions.map(([code, label, description]) => (
              <label key={code} className={evidenceCode === code ? "selected" : ""}>
                <input type="radio" name="manual-submission-evidence" value={code} checked={evidenceCode === code} onChange={() => onEvidenceCodeChange(code)} />
                <span><strong>{t(label)}</strong><small>{t(description)}</small></span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="manual-confirmation-field">
          <span>{t("实际投递时间")}</span>
          <input type="datetime-local" value={submittedAt} onChange={(event) => onSubmittedAtChange(event.target.value)} />
        </label>

        <section className="manual-receipt-summary" aria-label={t("岗位来源凭据")}>
          <div><span>{t("来源提供方")}</span><strong>{receiptSummary.provider}</strong></div>
          <div><span>{t("岗位编号")}</span><strong>{receiptSummary.providerJobId}</strong></div>
          <div><span>{t("最近核验")}</span><strong>{receiptSummary.verifiedAt}</strong></div>
        </section>

        {(preflight?.warnings ?? []).length > 0 && (
          <div className="manual-submission-warning">
            <WarningCircle size={18} />
            <div>{preflight.warnings.map((code) => <p key={code}>{t(warningLabels[code] ?? "当前来源凭据需要复核。")}</p>)}</div>
          </div>
        )}
        {structuralBlocking.map((code) => <p key={code} className="assist-contact-error" role="alert">! {t(blockingLabels[code])}</p>)}

        <label className="submission-exact-authorization">
          <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledgedChange(event.target.checked)} />
          <span>{t("我确认以上成功证据对应当前公司、岗位和所选简历，且申请已经在官网实际提交。")}</span>
        </label>

        <div className="modal-actions">
          <button className="button quiet" onClick={onClose}>{t("取消")}</button>
          <button className="button primary" disabled={!preflight?.ready} onClick={onConfirm}>
            <CheckCircle size={18} />{t("确认投递并更新状态")}
          </button>
        </div>
      </section>
    </div>
  );
}
