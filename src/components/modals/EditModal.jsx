import { ShieldCheck } from "@phosphor-icons/react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export function EditModal({ t, uiLanguage, editor, onChange, onCancel, onSave }) {
  const dialogRef = useDialogFocus({ onClose: onCancel, initialFocusSelector: "textarea" });
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section ref={dialogRef} tabIndex={-1} className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span>{uiLanguage === "en" ? "Edit current application packet" : "编辑当前申请包"}</span>
            <h2 id="edit-title">{editor.title}</h2>
          </div>
          <button aria-label={t("关闭编辑器")} onClick={onCancel}>×</button>
        </div>
        <textarea value={editor.value} onChange={(event) => onChange(event.target.value)} />
        <div className="edit-help">
          <ShieldCheck size={17} />
          <p>{t("这里只保存草稿，不会自动提交申请；最终投递仍需要本人确认。")}</p>
        </div>
        <div className="modal-actions">
          <button className="button quiet" onClick={onCancel}>{t("取消")}</button>
          <button className="button primary" onClick={onSave}>{t("保存修改")}</button>
        </div>
      </section>
    </div>
  );
}
