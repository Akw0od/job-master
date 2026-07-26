import { FileText, ShieldCheck, Trash, WarningCircle } from "@phosphor-icons/react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export function LocalDataModal({
  t,
  saveStatus,
  lastSavedAt,
  backupPassword,
  onBackupPasswordChange,
  onExport,
  backupError,
  isExporting,
  restoreFile,
  restorePassword,
  onRestoreFileChange,
  onRestorePasswordChange,
  onRestore,
  restoreError,
  isRestoring,
  clearConfirmation,
  onClearConfirmationChange,
  onClear,
  clearError,
  resumeRewriteConsent,
  onRevokeResumeRewriteConsent,
  onClose,
}) {
  const dialogRef = useDialogFocus({ onClose, initialFocusSelector: "#backup-password" });
  const saveCopy = saveStatus === "error"
    ? "本地草稿未能保存"
    : saveStatus === "saving"
      ? "正在保存浏览器本地草稿"
      : "浏览器本地草稿已保存";
  const confirmationPhrase = "DELETE LOCAL DRAFTS";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="local-data-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-data-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="local-data-icon"><ShieldCheck size={23} weight="duotone" /></span>
          <div>
            <h2 id="local-data-title">{t("本地数据")}</h2>
            <p>{t("这些内容仅保存在当前浏览器的本地草稿中，不会同步到云端。")}</p>
          </div>
        </header>

        <section className={`local-data-status ${saveStatus === "error" ? "error" : ""}`} aria-live="polite">
          <FileText size={18} />
          <div>
            <strong>{t(saveCopy)}</strong>
            <small>{lastSavedAt ? `${t("最近保存")} · ${lastSavedAt}` : t("尚未创建本地草稿")}</small>
          </div>
        </section>
        {saveStatus === "error" && (
          <p className="local-data-alert" role="alert">{t("浏览器未能写入本地草稿。请导出加密备份、清理本站数据或检查浏览器空间。")}</p>
        )}

        <div className="local-data-note">
          <WarningCircle size={18} weight="duotone" />
          <p>{t("本地草稿可能包含简历文本、联系方式、岗位、申请追踪和设置。清理浏览器数据、使用无痕窗口或更换设备可能导致它丢失。")}</p>
        </div>

        <section className="local-data-section" aria-labelledby="rewrite-consent-title">
          <div>
            <h3 id="rewrite-consent-title">{t("AI 改写数据授权")}</h3>
            <p>{resumeRewriteConsent
              ? t("此浏览器已记住 AI 改写授权；简历或 JD 发送前不再逐次询问。")
              : t("每次 AI 改写都会在发送简历或 JD 前询问。")}</p>
          </div>
          {resumeRewriteConsent && (
            <button className="button quiet" onClick={onRevokeResumeRewriteConsent}>
              {t("撤销记住的授权，下次重新询问")}
            </button>
          )}
        </section>

        <section className="local-data-section" aria-labelledby="backup-title">
          <div>
            <h3 id="backup-title">{t("导出加密备份")}</h3>
            <p>{t("备份使用你的密码加密；密码不会被保存，也不会写入本地草稿。")}</p>
          </div>
          <label>
            <span>{t("备份密码")}</span>
            <input
              id="backup-password"
              type="password"
              autoComplete="new-password"
              value={backupPassword}
              onChange={(event) => onBackupPasswordChange(event.target.value)}
              aria-describedby={backupError ? "backup-error" : undefined}
            />
          </label>
          <small>{t("至少 10 个字符")}</small>
          {backupError && <p id="backup-error" className="local-data-alert" role="alert">{t(backupError)}</p>}
          <button className="button quiet" disabled={isExporting || backupPassword.length < 10} onClick={onExport}>
            {t(isExporting ? "正在创建加密备份…" : "下载加密备份")}
          </button>
        </section>

        <section className="local-data-section" aria-labelledby="restore-title">
          <div>
            <h3 id="restore-title">{t("恢复加密备份")}</h3>
            <p>{t("恢复前会验证格式和密码；失败不会覆盖当前浏览器本地草稿。")}</p>
          </div>
          <label>
            <span>{t("备份文件")}</span>
            <input type="file" accept="application/json,.jobmaster-backup" onChange={(event) => onRestoreFileChange(event.target.files?.[0] ?? null)} />
          </label>
          <small>{restoreFile?.name ?? t("尚未选择文件")}</small>
          <label>
            <span>{t("备份密码")}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={restorePassword}
              onChange={(event) => onRestorePasswordChange(event.target.value)}
              aria-describedby={restoreError ? "restore-error" : undefined}
            />
          </label>
          {restoreError && <p id="restore-error" className="local-data-alert" role="alert">{t(restoreError)}</p>}
          <button className="button quiet" disabled={isRestoring || !restoreFile || restorePassword.length < 10} onClick={onRestore}>
            {t(isRestoring ? "正在恢复本地草稿…" : "恢复备份")}
          </button>
        </section>

        <section className="local-data-section local-data-danger" aria-labelledby="clear-local-data-title">
          <div>
            <h3 id="clear-local-data-title">{t("删除本地草稿")}</h3>
            <p>{t("这只会删除本网站的 Jobmaster 本地草稿，且无法撤销。")}</p>
          </div>
          <label>
            <span>{t("输入确认词")}: <code>{confirmationPhrase}</code></span>
            <input value={clearConfirmation} onChange={(event) => onClearConfirmationChange(event.target.value)} aria-describedby={clearError ? "clear-error" : undefined} />
          </label>
          {clearError && <p id="clear-error" className="local-data-alert" role="alert">{t(clearError)}</p>}
          <button className="button danger" disabled={clearConfirmation !== confirmationPhrase} onClick={onClear}>
            <Trash size={16} />
            {t("永久删除本地草稿")}
          </button>
        </section>

        <footer>
          <button className="button quiet" onClick={onClose}>{t("关闭")}</button>
        </footer>
      </section>
    </div>
  );
}
