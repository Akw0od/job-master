import { FloppyDisk, PaperPlaneTilt, ShieldCheck } from "@phosphor-icons/react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export function ApplicationSubmissionReviewModal({
  t,
  uiLanguage,
  selected,
  scan,
  review,
  submissionPreflight,
  authorizationConfirmed,
  onAuthorizationConfirmed,
  onFieldChange,
  onSaveAnswer,
  onClose,
  onExecute,
  isExecuting,
}) {
  const dialogRef = useDialogFocus({ onClose, initialFocusSelector: "input, textarea" });
  const modeLabel = review?.modeRequested === "review-submit"
    ? t("审核后自动提交一次")
    : t("自动填写并停在提交前");
  const unresolved = (review?.fields ?? []).filter((field) => (
    field.reviewState === "unresolved"
    || (review.modeRequested === "review-submit" && field.reviewState === "manual-required")
  ));
  const blockingLabel = (code) => {
    const labels = {
      "submission-bridge-available": "本地自动化桥可用",
      "reviewed-automation-mode": "执行方式与审核内容一致",
      "unique-submit-control": "官网页面只有一个可确认的提交按钮",
      "captcha-cleared": "官网页面没有待处理的人机验证",
      "frozen-submission-payload": "最终字段与答案已冻结",
      "source-receipt-fingerprint-match": "来源凭据与当前申请一致",
      "resume-version-fingerprint-match": "简历版本与审核版本一致",
      "page-snapshot-reviewed": "官网字段快照已审核",
      "exact-submission-authorized": "当前单次授权有效",
      "single-submit-attempt": "本次授权尚未执行",
      "submit-acknowledged": "需要勾选当前公司的单次授权",
    };
    return t(labels[code] ?? "投递安全检查未通过");
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="application-assist-modal submission-review-modal" role="dialog" aria-modal="true" aria-busy={isExecuting} aria-labelledby="submission-review-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span>{t("单次投递授权")}</span>
            <h2 id="submission-review-title">{uiLanguage === "en" ? `Review the exact ${selected.company} submission` : `审核 ${selected.company} 的最终投递内容`}</h2>
          </div>
          <button aria-label={t("关闭投递审核")} disabled={isExecuting} onClick={onClose}>×</button>
        </div>

        <div className="submission-review-summary">
          <div><span>{t("岗位")}</span><strong>{selected.company} · {selected.role}</strong></div>
          <div><span>{t("执行方式")}</span><strong>{modeLabel}</strong></div>
          <div><span>{t("页面指纹")}</span><code>{scan?.pageFingerprint ?? t("未提供")}</code></div>
          <div><span>{t("简历版本")}</span><code>{review?.resumeVersionId ?? t("未提供")}</code></div>
        </div>

        <div className="assist-safety-note">
          <ShieldCheck size={18} />
          <p>{t("这次授权只绑定当前岗位、来源凭据、简历版本、页面字段和答案。任何内容变化都会使授权失效。")}</p>
        </div>

        <section className="submission-field-list" aria-label={t("官网申请字段")}>
          {(review?.fields ?? []).map((field) => {
            const manual = field.category === "sensitive"
              || ["file", "checkbox", "radio", "select"].includes(field.type);
            return (
              <article key={field.id} className="submission-field-review">
                <div className="submission-field-heading">
                  <div>
                    <span>{field.label}</span>
                    <small>{t(field.category === "sensitive" ? "敏感字段 · 必须本人处理" : field.category === "narrative" ? "开放题" : "事实字段")}{field.required ? ` · ${t("必填")}` : ""}</small>
                  </div>
                  <code>{field.id}</code>
                </div>
                {manual ? (
                  <label className="assist-job-confirmation">
                    <input
                      type="checkbox"
                      disabled={isExecuting}
                      checked={field.reviewState === "page-confirmed"}
                      onChange={(event) => onFieldChange(field.id, {
                        reviewState: event.target.checked ? "page-confirmed" : "manual-required",
                        value: "",
                      })}
                    />
                    <span>{t("我已在打开的官网申请页亲自填写或上传此项。Jobmaster 只核验其非空，不读取或保存答案。")}</span>
                  </label>
                ) : (
                  <>
                    {field.type === "textarea" || field.category === "narrative" ? (
                      <textarea
                        disabled={isExecuting}
                        value={field.value}
                        onChange={(event) => onFieldChange(field.id, {
                          value: event.target.value,
                          reviewState: event.target.value.trim() ? "confirmed" : "unresolved",
                        })}
                      />
                    ) : (
                      <input
                        disabled={isExecuting}
                        value={field.value}
                        onChange={(event) => onFieldChange(field.id, {
                          value: event.target.value,
                          reviewState: event.target.value.trim() ? "confirmed" : "unresolved",
                        })}
                      />
                    )}
                    <div className="submission-field-actions">
                      <small>{field.reviewState === "confirmed" ? t("已核对") : t("等待核对")}</small>
                      {field.category === "narrative" && field.value.trim() && (
                        <button className="button quiet" disabled={isExecuting} onClick={() => onSaveAnswer(field)}>
                          <FloppyDisk size={15} />{t("保存到答案库")}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </section>

        {unresolved.length > 0 && (
          <p className="assist-contact-error" role="alert">
            {uiLanguage === "en" ? `${unresolved.length} fields still require review.` : `仍有 ${unresolved.length} 个字段需要核对。`}
          </p>
        )}
        {(submissionPreflight?.blocking ?? []).filter((code) => ![
          "contact-authorized", "truth-acknowledged", "sensitive-acknowledged",
          "unknown-questions-acknowledged", "warnings-acknowledgement-required",
        ].includes(code)).map((code) => (
          <p key={code} className="assist-contact-error">! {blockingLabel(code)}</p>
        ))}

        <label className="submission-exact-authorization">
          <input type="checkbox" disabled={isExecuting} checked={authorizationConfirmed} onChange={(event) => onAuthorizationConfirmed(event.target.checked)} />
          <span>
            {t("我已审核以上最终内容，并授权 Jobmaster 仅对")} <strong>{selected.company} · {selected.role}</strong>
            {t(review?.modeRequested === "review-submit" ? "执行一次填写与提交。" : "执行一次填写并停在提交前。")}
          </span>
        </label>

        {isExecuting && <p className="assist-launch-status" role="status" aria-live="polite">{t("正在重新核验页面指纹并执行单次授权。")}</p>}
        <div className="modal-actions">
          <button className="button quiet" disabled={isExecuting} onClick={onClose}>{t("返回修改")}</button>
          <button className="button primary" disabled={!submissionPreflight?.ready || !authorizationConfirmed || isExecuting} onClick={onExecute}>
            <PaperPlaneTilt size={18} />
            {t(review?.modeRequested === "review-submit" ? "授权并提交一次" : "授权填写一次")}
          </button>
        </div>
      </section>
    </div>
  );
}
