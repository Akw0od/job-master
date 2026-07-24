import { CircleNotch, ShieldCheck, Sparkle, Trash } from "@phosphor-icons/react";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export function CustomDirectionModal({ t, uiLanguage, directions, draft, onDraftChange, onDelete, onClose, onSave }) {
  const dialogRef = useDialogFocus({ onClose, initialFocusSelector: "input" });
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="custom-direction-modal" role="dialog" aria-modal="true" aria-labelledby="custom-direction-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div><span>{t("浏览器本地方向")}</span><h2 id="custom-direction-title">{t("自定义求职方向")}</h2></div>
          <button aria-label={t("关闭自定义方向")} onClick={onClose}>×</button>
        </div>
        <p className="custom-direction-intro">{t("名称用于简历版本和推荐标签；关键词只参与岗位发现与排序，不会被写进简历。")}</p>

        {directions.length > 0 && (
          <div className="custom-direction-list" aria-label={t("已有自定义方向")}>
            {directions.map((direction) => (
              <article key={direction.id}>
                <div><strong>{direction.name}</strong><span>{direction.keywords.join(" · ")}</span></div>
                <button aria-label={uiLanguage === "en" ? `Delete ${direction.name}` : `删除 ${direction.name}`} onClick={() => onDelete(direction)}><Trash size={16} /></button>
              </article>
            ))}
          </div>
        )}

        <div className="custom-direction-fields">
          <label><span>{t("方向名称")}</span><input autoFocus value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="例如：Developer Relations Engineer" /></label>
          <label><span>{t("岗位关键词")}</span><textarea value={draft.keywords} onChange={(event) => onDraftChange({ ...draft, keywords: event.target.value })} placeholder="developer relations, developer experience, sdk, community" /><small>{t("使用逗号、顿号或换行分隔；建议填写 3-8 个岗位描述中常见的词。")}</small></label>
        </div>

        <div className="custom-direction-note"><ShieldCheck size={17} /><p>{t("方向保存在当前浏览器。删除方向不会删除已经生成的方向简历或岗位版。")}</p></div>
        <div className="modal-actions"><button className="button quiet" onClick={onClose}>{t("取消")}</button><button className="button primary" onClick={onSave}>{t("保存并选择")}</button></div>
      </section>
    </div>
  );
}

export function ImportJobModal({ t, jd, company, role, url, onJdChange, onCompanyChange, onRoleChange, onUrlChange, onClose, onGenerate }) {
  const dialogRef = useDialogFocus({ onClose, initialFocusSelector: ".jd-input" });
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-title">
          <div><p>{t("手动岗位入口")}</p><h2 id="import-title">{t("导入岗位 JD")}</h2></div>
          <button className="more-button" aria-label={t("关闭")} onClick={onClose}><CircleNotch size={20} /></button>
        </div>
        <textarea className="jd-input" value={jd} onChange={(event) => onJdChange(event.target.value)} aria-label={t("完整岗位描述")} />
        <div className="import-fields">
          <label><span>{t("公司名称")}</span><input value={company} onChange={(event) => onCompanyChange(event.target.value)} placeholder="例如：Anthropic" /></label>
          <label><span>{t("岗位名称")}</span><input value={role} onChange={(event) => onRoleChange(event.target.value)} placeholder="例如：AI Agent Engineer" /></label>
          <label className="import-url-field"><span>{t("职位申请链接（可选）")}</span><input type="url" value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://..." /></label>
        </div>
        <div className="modal-summary"><span>{t("将生成")}</span><strong>{t("岗位快照、匹配依据、缺口报告和可审核简历建议")}</strong></div>
        <div className="modal-actions">
          <button className="button quiet" onClick={onClose}>{t("取消")}</button>
          <button className="button primary" onClick={onGenerate}><Sparkle size={18} weight="fill" />{t("生成申请包")}</button>
        </div>
      </section>
    </div>
  );
}
