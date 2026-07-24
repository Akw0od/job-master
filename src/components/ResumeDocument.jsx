import {
  buildResumeSectionBlocks,
  findResumeBlockChange,
  parseResumeDocument,
} from "../resume/resumeModel";

export function ResumeDocument({
  text,
  changes = [],
  activeChangeIndex = null,
  changeScope = "resume",
  documentMeta = {},
  onChangeFocus,
}) {
  const document = parseResumeDocument(text);
  if (!document.name) {
    return <div className="resume-document-empty">上传简历后，这里会显示可排版的原文。</div>;
  }

  const renderChangeText = (value) => {
    const changeIndex = findResumeBlockChange(value, changes);
    if (changeIndex < 0) return value;
    return (
      <button
        type="button"
        className={`resume-source-change ${activeChangeIndex === changeIndex ? "active" : ""}`}
        data-resume-change-index={changeIndex}
        data-resume-change-scope={changeScope}
        onClick={() => onChangeFocus?.(changeIndex, changeScope)}
      >
        <sup>{changeIndex + 1}</sup>
        {value}
      </button>
    );
  };

  return (
    <article className={`resume-document source-${documentMeta.format ?? "text"}`}>
      <header className={`resume-document-header align-${documentMeta.headerAlignment ?? "left"}`}>
        <h2>{renderChangeText(document.name)}</h2>
        {(document.header?.length
          ? document.header
          : [
              ...document.intro.map((text) => ({ type: "intro", text })),
              ...document.contact.map((text) => ({ type: "contact", text })),
            ]
        ).map((line, index) => (
          <p
            className={line.type === "contact" ? "resume-header-contact" : "resume-header-note"}
            key={`${line.type}-${line.text}-${index}`}
          >
            {renderChangeText(line.text)}
          </p>
        ))}
      </header>
      {document.sections.map((section, sectionIndex) => (
        <section className="resume-document-section" key={`${section.title}-${sectionIndex}`}>
          <h3>{renderChangeText(section.title)}</h3>
          <div>
            {buildResumeSectionBlocks(section).map((block, blockIndex) => {
              const key = `${block.text}-${blockIndex}`;
              const groupClass = block.groupStart ? " resume-block-group-start" : "";
              if (block.type === "bullet") return <p className={`resume-document-bullet${groupClass}`} key={key}>{renderChangeText(block.text)}</p>;
              if (block.type === "entry") return <h4 className={`resume-document-entry${groupClass}`} key={key}>{renderChangeText(block.text)}</h4>;
              if (block.type === "meta") return <p className={`resume-document-meta${groupClass}`} key={key}>{renderChangeText(block.text)}</p>;
              return <p className={`resume-document-detail${groupClass}`} key={key}>{renderChangeText(block.text)}</p>;
            })}
          </div>
        </section>
      ))}
    </article>
  );
}
