import { FilePdf, ShieldCheck } from "@phosphor-icons/react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export function ResumeExportModal({
  t,
  version,
  pageSize,
  onPageSizeChange,
  onClose,
  onPrint,
}) {
  const dialogRef = useDialogFocus({ onClose, initialFocusSelector: "select" });

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="resume-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-export-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="resume-export-icon"><FilePdf size={24} weight="duotone" /></span>
          <div>
            <h2 id="resume-export-title">{t("导出可选择文字的 PDF")}</h2>
            <p>{t("使用浏览器打印引擎保留可选择文字和系统中文字体，不会把简历变成整页截图。")}</p>
          </div>
        </header>

        <div className="resume-export-file">
          <FilePdf size={21} />
          <span>
            <strong>{version.name}</strong>
            <small>{t("已保存版本")} · {version.content.length} {t("字符")}</small>
          </span>
        </div>

        <label className="resume-export-page-size">
          <span>{t("PDF 纸张尺寸")}</span>
          <select value={pageSize} onChange={(event) => onPageSizeChange(event.target.value)}>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
          </select>
        </label>

        <div className="resume-export-note">
          <ShieldCheck size={18} weight="duotone" />
          <p>{t("下一步会打开系统打印窗口。请选择“存储为 PDF”，检查页数和分页后再保存；取消打印不会修改简历。")}</p>
        </div>

        <footer>
          <button className="button quiet" onClick={onClose}>{t("取消")}</button>
          <button className="button primary" onClick={onPrint}>{t("打开打印窗口")}</button>
        </footer>
      </section>
    </div>
  );
}
