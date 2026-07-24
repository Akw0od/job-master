const placeholderResumePattern = /CANDIDATE NAME|email@example\.com|portfolio\.example\.com|Add only verified skills|University \/ Degree \/ Graduation date/i;

export function isPlaceholderResume(text) {
  return placeholderResumePattern.test(String(text ?? ""));
}

export function normalizeResumeLine(line) {
  return String(line ?? "").replace(/\s+/g, " ").trim();
}

function isResumeSectionHeading(line) {
  const normalized = normalizeResumeLine(line).replace(/[：:]$/, "");
  if (!normalized || normalized.length > 64 || /@|https?:|www\.|\d{3}[- )]\d{3}/i.test(normalized)) return false;
  const compact = normalized.toLowerCase().replace(/[\s&/·|_-]+/g, "");
  const knownHeadings = [
    "summary", "profile", "objective", "education", "experience", "workexperience",
    "professionalexperience", "projects", "selectedprojects", "skills", "technicalskills",
    "research", "publications", "awards", "leadership", "activities", "certifications",
    "个人概述", "个人简介", "教育", "教育经历", "工作经历", "实习经历", "项目", "项目经历",
    "技能", "专业技能", "研究经历", "论文", "奖项", "校园经历", "证书", "经历与项目",
  ];
  if (knownHeadings.some((heading) => compact === heading.replace(/[\s&/·|_-]+/g, ""))) return true;
  const letters = normalized.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && normalized === normalized.toUpperCase() && !/[.!?]$/.test(normalized);
}

export function parseResumeDocument(text) {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((raw) => ({ raw, text: normalizeResumeLine(raw) }));
  const nonEmptyIndexes = lines
    .map((line, index) => (line.text ? index : -1))
    .filter((index) => index >= 0);
  if (!nonEmptyIndexes.length) return {
    name: "", header: [], contact: [], intro: [], sections: [], recognizedSectionCount: 0,
  };

  const firstHeadingIndex = lines.findIndex((line) => line.text && isResumeSectionHeading(line.text));
  const fallbackHeaderLastIndex = nonEmptyIndexes[Math.min(2, nonEmptyIndexes.length - 1)];
  const headerEnd = firstHeadingIndex === -1 ? fallbackHeaderLastIndex + 1 : firstHeadingIndex;
  const headerLines = lines.slice(0, headerEnd).filter((line) => line.text);
  const name = headerLines[0]?.text ?? "";
  const header = headerLines.slice(1).map((line) => ({
    type: /@|https?:|www\.|linkedin|github|\+?\d[\d ()-]{6,}/i.test(line.text) ? "contact" : "intro",
    text: line.text,
  }));
  const contact = header.filter((line) => line.type === "contact").map((line) => line.text);
  const intro = header.filter((line) => line.type === "intro").map((line) => line.text);
  const sections = [];
  let current = null;

  lines.slice(headerEnd).forEach((line) => {
    if (line.text && isResumeSectionHeading(line.text)) {
      current = { title: line.text.replace(/[：:]$/, ""), lines: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      current = { title: "PROFILE", lines: [] };
      sections.push(current);
    }
    current.lines.push(line.text);
  });

  sections.forEach((section) => {
    while (section.lines[0] === "") section.lines.shift();
    while (section.lines.at(-1) === "") section.lines.pop();
  });

  return {
    name,
    header,
    contact,
    intro,
    sections,
    recognizedSectionCount: sections.filter((section) => section.title !== "PROFILE").length,
  };
}

export function assessResumeStructure(text, documentMeta = {}) {
  const document = parseResumeDocument(text);
  const lineCount = String(text ?? "").split("\n").filter((line) => normalizeResumeLine(line)).length;
  const warnings = [...(documentMeta.warnings ?? [])];
  if (document.recognizedSectionCount === 0) {
    warnings.push("没有识别到明确的章节标题；请在预览中核对段落分组");
  }
  if (lineCount < 8) warnings.push("可读取的简历行数较少");

  const quality = lineCount >= 8 && document.recognizedSectionCount >= 2 && warnings.length === 0
    ? "high"
    : lineCount >= 5 && document.sections.length >= 1
      ? "medium"
      : "low";

  return {
    quality,
    lineCount,
    sectionCount: document.recognizedSectionCount,
    warnings: [...new Set(warnings)],
  };
}

export function computeResumeChanges(sourceText, revisedText, limit = 30) {
  const source = String(sourceText ?? "").split("\n").map(normalizeResumeLine).filter(Boolean);
  const revised = String(revisedText ?? "").split("\n").map(normalizeResumeLine).filter(Boolean);
  const table = Array.from({ length: source.length + 1 }, () => new Uint16Array(revised.length + 1));

  for (let i = source.length - 1; i >= 0; i -= 1) {
    for (let j = revised.length - 1; j >= 0; j -= 1) {
      table[i][j] = source[i] === revised[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const operations = [];
  let i = 0;
  let j = 0;
  while (i < source.length || j < revised.length) {
    if (i < source.length && j < revised.length && source[i] === revised[j]) {
      operations.push({ type: "equal", value: source[i] });
      i += 1;
      j += 1;
    } else if (j < revised.length && (i === source.length || table[i][j + 1] >= table[i + 1][j])) {
      operations.push({ type: "added", value: revised[j] });
      j += 1;
    } else {
      operations.push({ type: "removed", value: source[i] });
      i += 1;
    }
  }

  const changes = [];
  for (let index = 0; index < operations.length && changes.length < limit; index += 1) {
    if (operations[index].type === "equal") continue;
    const previousEqual = operations[index - 1]?.type === "equal" ? operations[index - 1].value : "";
    const removed = [];
    const added = [];
    while (index < operations.length && operations[index].type !== "equal") {
      if (operations[index].type === "removed") removed.push(operations[index].value);
      if (operations[index].type === "added") added.push(operations[index].value);
      index += 1;
    }
    changes.push({
      before: removed.join(" "),
      after: added.join(" "),
      beforeLines: removed,
      afterLines: added,
      sourceAnchor: removed.length === 0 ? (operations[index]?.value ?? previousEqual) : "",
      sourceAnchorPosition: operations[index]?.type === "equal" ? "before" : "after",
    });
  }
  return changes;
}

function findLineSequence(lines, expectedLines) {
  const expected = expectedLines.map(normalizeResumeLine).filter(Boolean);
  if (!expected.length) return null;
  const indexedLines = lines
    .map((line, index) => ({ index, normalized: normalizeResumeLine(line) }))
    .filter((line) => line.normalized);

  for (let index = 0; index <= indexedLines.length - expected.length; index += 1) {
    if (expected.every((line, offset) => indexedLines[index + offset].normalized === line)) {
      return {
        start: indexedLines[index].index,
        end: indexedLines[index + expected.length - 1].index,
      };
    }
  }
  return null;
}

function replaceResumeLines(text, fromLines, toLines, change) {
  const lines = String(text ?? "").split("\n");
  const replacement = toLines.map(normalizeResumeLine).filter(Boolean);
  const match = findLineSequence(lines, fromLines);
  if (match) {
    lines.splice(match.start, match.end - match.start + 1, ...replacement);
    return lines.join("\n");
  }
  if (fromLines.length || !replacement.length) return String(text ?? "");
  if (findLineSequence(lines, replacement)) return String(text ?? "");

  const anchor = normalizeResumeLine(change.sourceAnchor);
  const anchorIndex = lines.findIndex((line) => normalizeResumeLine(line) === anchor);
  if (anchorIndex < 0) return [...lines, ...replacement].join("\n").trim();
  const insertIndex = change.sourceAnchorPosition === "after" ? anchorIndex + 1 : anchorIndex;
  lines.splice(insertIndex, 0, ...replacement);
  return lines.join("\n");
}

export function applyResumeChange(text, change) {
  const beforeLines = change.beforeLines ?? (change.before ? [change.before] : []);
  const afterLines = change.afterLines ?? (change.after ? [change.after] : []);
  return replaceResumeLines(text, beforeLines, afterLines, change);
}

export function revertResumeChange(text, change) {
  const beforeLines = change.beforeLines ?? (change.before ? [change.before] : []);
  const afterLines = change.afterLines ?? (change.after ? [change.after] : []);
  return replaceResumeLines(text, afterLines, beforeLines, change);
}

export function saveEditableResumeVersion(versions, versionId, content) {
  if (!versionId || versionId === "master-resume") return versions;
  return versions.map((version) => (
    version.id === versionId
      ? {
          ...version,
          content,
          updated: "刚刚手动编辑",
          editedAt: new Date().toISOString(),
          status: "已审核保存",
        }
      : version
  ));
}

export function summarizeResumeReview(changes, decisions, scope) {
  const summary = {
    total: changes.length,
    accepted: 0,
    rejected: 0,
    pending: 0,
    canSave: false,
  };
  changes.forEach((_, index) => {
    const decision = decisions[`${scope}:${index}`];
    if (decision === "accepted") summary.accepted += 1;
    else if (decision === "rejected") summary.rejected += 1;
    else summary.pending += 1;
  });
  summary.canSave = summary.total > 0 && summary.pending === 0 && summary.accepted > 0;
  return summary;
}

export function selectResumeVersionForDirection(versions, role, masterVersionId = "master-resume") {
  const savedVersion = [...versions].reverse().find((version) => version.target === role);
  return {
    versionId: savedVersion?.id ?? masterVersionId,
    hasSavedVersion: Boolean(savedVersion),
  };
}

export function buildResumeSectionBlocks(section) {
  const compactTitle = normalizeResumeLine(section.title).toLowerCase().replace(/[\s&/·|_-]+/g, "");
  if (["summary", "profile", "objective", "个人概述", "个人简介"].includes(compactTitle)) {
    const paragraphs = [];
    let paragraphLines = [];
    section.lines.forEach((line) => {
      if (!normalizeResumeLine(line)) {
        if (paragraphLines.length) paragraphs.push(paragraphLines.join(" "));
        paragraphLines = [];
        return;
      }
      paragraphLines.push(normalizeResumeLine(line));
    });
    if (paragraphLines.length) paragraphs.push(paragraphLines.join(" "));
    return paragraphs.map((paragraph, index) => ({
      type: "paragraph",
      text: paragraph,
      groupStart: index > 0,
    }));
  }

  const blocks = [];
  let groupStart = false;
  section.lines.forEach((line, lineIndex) => {
    if (!normalizeResumeLine(line)) {
      groupStart = blocks.length > 0;
      return;
    }
    const isBullet = /^[•●▪◦*\-–—]\s*/.test(line);
    const cleanLine = line.replace(/^[•●▪◦*\-–—]\s*/, "");
    const nextLine = section.lines.slice(lineIndex + 1).find((candidate) => normalizeResumeLine(candidate)) ?? "";
    const nextIsBullet = /^[•●▪◦*\-–—]\s*/.test(nextLine);
    const hasEntryDivider = /\s[—–]\s|\s-\s/.test(line);
    const looksLikeShortTitle = nextIsBullet && line.length < 100 && !/[.!?。！？]$/.test(line);
    const looksLikeMeta = /\b(19|20)\d{2}\b|\b(Present|Current|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(line)
      && line.length < 120;
    const isEntryTitle = !looksLikeMeta && (blocks.length === 0 || hasEntryDivider || looksLikeShortTitle);

    if (isBullet) {
      blocks.push({ type: "bullet", text: cleanLine, groupStart });
      groupStart = false;
      return;
    }
    const previous = blocks.at(-1);
    if (previous?.type === "bullet" && !isEntryTitle && !groupStart) {
      previous.text = `${previous.text} ${line}`;
      return;
    }
    if (isEntryTitle) blocks.push({ type: "entry", text: line, groupStart });
    else if (looksLikeMeta) blocks.push({ type: "meta", text: line, groupStart });
    else blocks.push({ type: "detail", text: line, groupStart });
    groupStart = false;
  });
  return blocks;
}

export function findResumeBlockChange(text, changes) {
  const normalizedText = normalizeResumeLine(text);
  if (!normalizedText) return -1;
  const matchedIndex = changes.findIndex((change) => {
    const sourceLines = change.beforeLines?.length ? change.beforeLines : [change.before, change.sourceAnchor];
    return sourceLines.some((line) => {
      const normalizedLine = normalizeResumeLine(line);
      if (!normalizedLine) return false;
      return normalizedLine === normalizedText
        || (normalizedLine.length >= 24 && normalizedText.includes(normalizedLine))
        || (normalizedText.length >= 24 && normalizedLine.includes(normalizedText));
    });
  });
  return matchedIndex < 0 ? -1 : changes[matchedIndex].reviewIndex ?? matchedIndex;
}

export function normalizeImportedResumeText(text) {
  return String(text ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
