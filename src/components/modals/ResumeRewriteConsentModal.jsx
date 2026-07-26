import { ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export function ResumeRewriteConsentModal({ t, summary, onCancel, onContinueOnce, onRemember }) {
  const dialogRef = useDialogFocus({ onClose: onCancel, initialFocusSelector: "[data-consent-primary]" });

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="resume-rewrite-consent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-rewrite-consent-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="rewrite-consent-icon"><ShieldCheck size={23} weight="duotone" /></span>
          <div>
            <h2 id="resume-rewrite-consent-title">{t("确认本次 AI 改写数据")}</h2>
            <p>{t("继续前请确认本次将发送给 Codex 模型处理的数据。")}</p>
          </div>
        </header>

        <dl className="rewrite-consent-summary">
          <div><dt>{t("简历版本")}</dt><dd>{summary.sourceName} · {summary.resumeCharacters} {t("字符")}</dd></div>
          <div><dt>{t("完整 JD")}</dt><dd>{summary.includesFullJobDescription ? `${t("会发送")} · ${summary.jobDescriptionCharacters} ${t("字符")}` : t("不会发送")}</dd></div>
          <div><dt>{t("目标")}</dt><dd>{summary.market} · {summary.language} · {summary.targetRole}</dd></div>
        </dl>

        <div className="rewrite-consent-personal-data">
          <WarningCircle size={18} weight="duotone" />
          <p>{t("完整简历本身可能包含姓名、邮箱、电话等个人信息；这些内容会随简历正文发送。")}</p>
        </div>

        <section className="rewrite-consent-instruction" aria-labelledby="rewrite-instruction-title">
          <h3 id="rewrite-instruction-title">{t("用户指令")}</h3>
          <p>{summary.message}</p>
        </section>

        <div className="rewrite-consent-note">
          <WarningCircle size={18} weight="duotone" />
          <p>{t("不会额外发送申请辅助中的本地档案字段、申请追踪、其他岗位或整个浏览器存储。官网职位搜索仍不会发送简历。")}</p>
        </div>

        <div className="rewrite-consent-boundary">
          <strong>{t("处理边界")}</strong>
          <p>{t("请求会先到 localhost-only 本机代理，再交给 Codex CLI 配置的模型。本机代理不等于本地推理；处理位置和保留策略取决于你的模型提供方。本机临时文件会在请求后删除。")}</p>
        </div>

        <footer>
          <button className="button quiet" onClick={onCancel}>{t("取消，不发送")}</button>
          <button className="button quiet" onClick={onContinueOnce}>{t("仅本次继续")}</button>
          <button className="button primary" data-consent-primary onClick={onRemember}>{t("同意并在此浏览器记住")}</button>
        </footer>
      </section>
    </div>
  );
}
