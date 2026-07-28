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

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashResumeText(text) {
  return stableHash(String(text ?? "").replace(/\r\n?/g, "\n"));
}

function resumeLines(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").split("\n")
    .map((line, rawIndex) => ({ value: normalizeResumeLine(line), rawIndex }))
    .filter((line) => line.value);
}

function rawSourceStartForNormalizedPosition(indexedLines, normalizedPosition) {
  if (normalizedPosition < indexedLines.length) return indexedLines[normalizedPosition].rawIndex;
  return indexedLines.length ? indexedLines.at(-1).rawIndex + 1 : 0;
}

export function computeResumeChanges(sourceText, revisedText, limit = 30) {
  const source = resumeLines(sourceText);
  const revised = resumeLines(revisedText);
  const sourceValues = source.map((line) => line.value);
  const revisedValues = revised.map((line) => line.value);
  const table = Array.from({ length: sourceValues.length + 1 }, () => new Uint16Array(revisedValues.length + 1));

  for (let i = sourceValues.length - 1; i >= 0; i -= 1) {
    for (let j = revisedValues.length - 1; j >= 0; j -= 1) {
      table[i][j] = sourceValues[i] === revisedValues[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const operations = [];
  let i = 0;
  let j = 0;
  while (i < sourceValues.length || j < revisedValues.length) {
    if (i < sourceValues.length && j < revisedValues.length && sourceValues[i] === revisedValues[j]) {
      operations.push({ type: "equal", value: sourceValues[i], sourceIndex: i });
      i += 1;
      j += 1;
    } else if (j < revisedValues.length && (i === sourceValues.length || table[i][j + 1] >= table[i + 1][j])) {
      operations.push({ type: "added", value: revisedValues[j] });
      j += 1;
    } else {
      operations.push({ type: "removed", value: sourceValues[i], sourceIndex: i });
      i += 1;
    }
  }

  const changes = [];
  for (let index = 0; index < operations.length && changes.length < limit; index += 1) {
    if (operations[index].type === "equal") continue;
    const hunkStart = index;
    const previousEqual = operations[index - 1]?.type === "equal" ? operations[index - 1].value : "";
    const removed = [];
    const added = [];
    while (index < operations.length && operations[index].type !== "equal") {
      if (operations[index].type === "removed") removed.push(operations[index].value);
      if (operations[index].type === "added") added.push(operations[index].value);
      index += 1;
    }
    const nextEqual = operations[index]?.type === "equal" ? operations[index] : null;
    const firstRemoved = operations.slice(hunkStart, index).find((operation) => operation.type === "removed");
    const sourceStart = firstRemoved?.sourceIndex ?? nextEqual?.sourceIndex ?? sourceValues.length;
    const rawStart = firstRemoved
      ? source[firstRemoved.sourceIndex].rawIndex
      : nextEqual
        ? source[nextEqual.sourceIndex].rawIndex
        : rawSourceStartForNormalizedPosition(source, sourceValues.length);
    const rawDeleteCount = removed.length
      ? source[sourceStart + removed.length - 1].rawIndex - source[sourceStart].rawIndex + 1
      : 0;
    const beforeContext = sourceValues.slice(Math.max(0, sourceStart - 2), sourceStart);
    const afterContext = sourceValues.slice(sourceStart + removed.length, sourceStart + removed.length + 2);
    const baseHash = hashResumeText(sourceText);
    const targetBlockId = `block-${stableHash(`${baseHash}:${sourceStart}:${beforeContext.join("\u001f")}:${afterContext.join("\u001f")}`)}`;
    const patchId = `patch-v2-${stableHash(`${baseHash}:${sourceStart}:${removed.join("\u001f")}:${added.join("\u001f")}:${beforeContext.join("\u001f")}:${afterContext.join("\u001f")}`)}`;
    const emitted = {
      patchVersion: 2,
      patchId,
      baseHash,
      targetBlockId,
      locator: { sourceStart, rawStart, rawDeleteCount, beforeContext, afterContext },
      before: removed.join(" "),
      after: added.join(" "),
      beforeLines: removed,
      afterLines: added,
      sourceAnchor: removed.length === 0 ? (nextEqual?.value ?? previousEqual) : "",
      sourceAnchorPosition: nextEqual ? "before" : "after",
    };
    if (removed.length === added.length && removed.length > 1) {
      removed.slice(0, Math.max(0, limit - changes.length)).forEach((before, pairIndex) => {
        const pairStart = sourceStart + pairIndex;
        const pairBeforeContext = sourceValues.slice(Math.max(0, pairStart - 2), pairStart);
        const pairAfterContext = sourceValues.slice(pairStart + 1, pairStart + 3);
        const pairTargetBlockId = `block-${stableHash(`${baseHash}:${pairStart}:${pairBeforeContext.join("\u001f")}:${pairAfterContext.join("\u001f")}`)}`;
        changes.push({
          ...emitted,
          patchId: `patch-v2-${stableHash(`${baseHash}:${pairStart}:${before}:${added[pairIndex]}:${pairBeforeContext.join("\u001f")}:${pairAfterContext.join("\u001f")}`)}`,
          targetBlockId: pairTargetBlockId,
          locator: {
            sourceStart: pairStart,
            rawStart: source[pairStart].rawIndex,
            rawDeleteCount: 1,
            beforeContext: pairBeforeContext,
            afterContext: pairAfterContext,
          },
          before,
          after: added[pairIndex],
          beforeLines: [before],
          afterLines: [added[pairIndex]],
        });
      });
    } else {
      changes.push(emitted);
    }
  }
  return changes;
}

function findLineSequences(lines, expectedLines) {
  const expected = expectedLines.map(normalizeResumeLine).filter(Boolean);
  if (!expected.length) return [];
  const indexedLines = lines
    .map((line, index) => ({ index, normalized: normalizeResumeLine(line) }))
    .filter((line) => line.normalized);

  const matches = [];
  for (let index = 0; index <= indexedLines.length - expected.length; index += 1) {
    if (expected.every((line, offset) => indexedLines[index + offset].normalized === line)) {
      matches.push({
        start: indexedLines[index].index,
        end: indexedLines[index + expected.length - 1].index,
        normalizedStart: index,
      });
    }
  }
  return matches;
}

function contextMatches(indexedLines, normalizedStart, expectedBefore, expectedAfter, expectedLength) {
  if (expectedBefore.length === 0 && normalizedStart !== 0) return false;
  if (expectedAfter.length === 0 && normalizedStart + expectedLength !== indexedLines.length) return false;
  const before = indexedLines.slice(Math.max(0, normalizedStart - expectedBefore.length), normalizedStart).map((line) => line.normalized);
  const after = indexedLines.slice(normalizedStart + expectedLength, normalizedStart + expectedLength + expectedAfter.length).map((line) => line.normalized);
  return before.join("\u001f") === expectedBefore.join("\u001f") && after.join("\u001f") === expectedAfter.join("\u001f");
}

function locateSequence(lines, expectedLines, change) {
  const matches = findLineSequences(lines, expectedLines);
  const indexedLines = lines.map((line, index) => ({ index, normalized: normalizeResumeLine(line) })).filter((line) => line.normalized);
  const locator = change.locator ?? {};
  const contextual = matches.filter((match) => contextMatches(indexedLines, match.normalizedStart, locator.beforeContext ?? [], locator.afterContext ?? [], expectedLines.length));
  if (contextual.length === 1) return contextual[0];
  if (Number.isInteger(locator.sourceStart)) {
    const atBasePosition = matches.filter((match) => match.normalizedStart === locator.sourceStart);
    if (atBasePosition.length === 1) return atBasePosition[0];
  }
  const locallyAnchored = matches.filter((match) => {
    const previous = indexedLines[match.normalizedStart - 1]?.normalized ?? "";
    const next = indexedLines[match.normalizedStart + expectedLines.length]?.normalized ?? "";
    return (locator.beforeContext?.length && previous === locator.beforeContext.at(-1))
      || (locator.afterContext?.length && next === locator.afterContext[0]);
  });
  if (locallyAnchored.length === 1) return locallyAnchored[0];
  return Number.isInteger(locator.sourceStart) ? null : matches.length === 1 ? matches[0] : null;
}

function locateSequenceWithContext(lines, expectedLines, change, { allowSourceStartFallback = false } = {}) {
  const matches = findLineSequences(lines, expectedLines);
  const indexedLines = lines.map((line, index) => ({ index, normalized: normalizeResumeLine(line) })).filter((line) => line.normalized);
  const locator = change.locator ?? {};
  const contextual = matches.filter((match) => contextMatches(indexedLines, match.normalizedStart, locator.beforeContext ?? [], locator.afterContext ?? [], expectedLines.length));
  if (contextual.length === 1) return contextual[0];
  if (!allowSourceStartFallback || !Number.isInteger(locator.sourceStart)) return null;
  const atBasePosition = matches.filter((match) => match.normalizedStart === locator.sourceStart);
  return atBasePosition.length === 1 ? atBasePosition[0] : null;
}

function locateInsertion(lines, change) {
  const indexed = lines.map((line, index) => ({ index, normalized: normalizeResumeLine(line) })).filter((line) => line.normalized);
  const locator = change.locator ?? {};
  const beforeContext = locator.beforeContext ?? [];
  const afterContext = locator.afterContext ?? [];
  const candidates = [];
  for (let position = 0; position <= indexed.length; position += 1) {
    const exact = contextMatches(indexed, position, beforeContext, afterContext, 0);
    const previous = indexed[position - 1]?.normalized ?? "";
    const next = indexed[position]?.normalized ?? "";
    const anchored = (beforeContext.length ? previous === beforeContext.at(-1) : position === 0)
      && (afterContext.length ? next === afterContext[0] : position === indexed.length);
    if (exact || anchored) candidates.push(position);
  }
  if (candidates.length !== 1) return null;
  return candidates[0] === indexed.length ? lines.length : indexed[candidates[0]].index;
}

function locateExactInsertion(lines, change) {
  const indexed = lines.map((line, index) => ({ index, normalized: normalizeResumeLine(line) })).filter((line) => line.normalized);
  const locator = change.locator ?? {};
  const candidates = [];
  for (let position = 0; position <= indexed.length; position += 1) {
    if (contextMatches(indexed, position, locator.beforeContext ?? [], locator.afterContext ?? [], 0)) candidates.push(position);
  }
  if (candidates.length !== 1) return null;
  return candidates[0] === indexed.length ? lines.length : indexed[candidates[0]].index;
}

function locateRemovalGap(lines, change) {
  const exact = locateExactInsertion(lines, change);
  if (exact != null) return exact;
  const indexed = lines.map((line, index) => ({ index, normalized: normalizeResumeLine(line) })).filter((line) => line.normalized);
  const locator = change.locator ?? {};
  const beforeContext = locator.beforeContext ?? [];
  const afterContext = locator.afterContext ?? [];
  const candidates = [];
  for (let position = 0; position <= indexed.length; position += 1) {
    const previous = indexed[position - 1]?.normalized ?? "";
    const next = indexed[position]?.normalized ?? "";
    const beforeMatches = beforeContext.length ? previous === beforeContext.at(-1) : position === 0;
    const afterMatches = afterContext.length ? next === afterContext[0] : position === indexed.length;
    if (beforeMatches && afterMatches) candidates.push(position);
  }
  if (candidates.length !== 1) return null;
  return candidates[0] === indexed.length ? lines.length : indexed[candidates[0]].index;
}

function replaceResumeLinesResult(text, fromLines, toLines, change) {
  const lines = String(text ?? "").split("\n");
  const replacement = toLines.map(normalizeResumeLine).filter(Boolean);
  const expected = fromLines.map(normalizeResumeLine).filter(Boolean);
  const already = replacement.length ? locateSequenceWithContext(lines, replacement, change, { allowSourceStartFallback: true }) : null;
  if (already) return { status: "already-applied", text: String(text ?? "") };
  const match = expected.length ? locateSequence(lines, expected, change) : null;
  if (match) {
    lines.splice(match.start, match.end - match.start + 1, ...replacement);
    return { status: "applied", text: lines.join("\n") };
  }
  if (expected.length || !replacement.length) return { status: "conflict", text: String(text ?? "") };
  const insertIndex = locateInsertion(lines, change);
  if (insertIndex == null) return { status: "conflict", text: String(text ?? "") };
  lines.splice(insertIndex, 0, ...replacement);
  return { status: "applied", text: lines.join("\n") };
}

function decisionForChange(decisions, scope, change, index) {
  return decisions?.[`${scope}:${change.patchId ?? index}`] ?? decisions?.[`${scope}:${index}`] ?? "pending";
}

export function materializeResumeReview(sourceText, changes, decisions = {}, scope = "resume") {
  const source = String(sourceText ?? "").replace(/\r\n?/g, "\n");
  const lines = source ? source.split("\n") : [];
  const indexedSource = lines
    .map((line, rawIndex) => ({ rawIndex, value: normalizeResumeLine(line) }))
    .filter((line) => line.value);
  const baseHash = hashResumeText(source);
  const conflicts = [];
  const accepted = [];

  (Array.isArray(changes) ? changes : []).forEach((change, index) => {
    if (change?.patchVersion !== 2 || change.baseHash !== baseHash) {
      conflicts.push(change?.patchId ?? `patch-${index}`);
      return;
    }
    const rawStart = change.locator?.rawStart;
    const rawDeleteCount = change.locator?.rawDeleteCount;
    const sourceStart = change.locator?.sourceStart;
    if (!Number.isInteger(rawStart) || !Number.isInteger(rawDeleteCount) || !Number.isInteger(sourceStart)
      || rawStart < 0 || rawDeleteCount < 0 || sourceStart < 0 || sourceStart > indexedSource.length
      || rawStart + rawDeleteCount > lines.length) {
      conflicts.push(change.patchId);
      return;
    }
    const expectedBefore = (change.beforeLines ?? (change.before ? [change.before] : [])).map(normalizeResumeLine).filter(Boolean);
    const expectedRawStart = rawSourceStartForNormalizedPosition(indexedSource, sourceStart);
    const expectedRawDeleteCount = expectedBefore.length
      ? indexedSource[sourceStart + expectedBefore.length - 1]?.rawIndex - expectedRawStart + 1
      : 0;
    const actualBeforeContext = indexedSource
      .slice(Math.max(0, sourceStart - 2), sourceStart)
      .map((line) => line.value);
    const actualAfterContext = indexedSource
      .slice(sourceStart + expectedBefore.length, sourceStart + expectedBefore.length + 2)
      .map((line) => line.value);
    if (rawStart !== expectedRawStart || rawDeleteCount !== expectedRawDeleteCount
      || actualBeforeContext.join("\u001f") !== (change.locator?.beforeContext ?? []).map(normalizeResumeLine).filter(Boolean).join("\u001f")
      || actualAfterContext.join("\u001f") !== (change.locator?.afterContext ?? []).map(normalizeResumeLine).filter(Boolean).join("\u001f")) {
      conflicts.push(change.patchId);
      return;
    }
    const actualBefore = lines.slice(rawStart, rawStart + rawDeleteCount).map(normalizeResumeLine).filter(Boolean);
    if (expectedBefore.join("\u001f") !== actualBefore.join("\u001f")) {
      conflicts.push(change.patchId);
      return;
    }
    if (decisionForChange(decisions, scope, change, index) === "accepted") accepted.push({ change, index, rawStart, rawDeleteCount });
  });

  if (conflicts.length) return { status: "conflict", text: source, conflicts };
  const materialized = [...lines];
  accepted
    .sort((left, right) => right.rawStart - left.rawStart || right.index - left.index)
    .forEach(({ change, rawStart, rawDeleteCount }) => {
      const replacement = (change.afterLines ?? (change.after ? [change.after] : [])).map(normalizeResumeLine).filter(Boolean);
      materialized.splice(rawStart, rawDeleteCount, ...replacement);
    });
  return { status: "applied", text: materialized.join("\n"), conflicts: [] };
}

export function applyResumeChangeResult(text, change) {
  const beforeLines = change.beforeLines ?? (change.before ? [change.before] : []);
  const afterLines = change.afterLines ?? (change.after ? [change.after] : []);
  const lines = String(text ?? "").split("\n");
  if (!afterLines.length && beforeLines.length) {
    if (locateSequence(lines, beforeLines, change)) return replaceResumeLinesResult(text, beforeLines, afterLines, change);
    return locateRemovalGap(lines, change) != null
      ? { status: "already-applied", text: String(text ?? "") }
      : { status: "conflict", text: String(text ?? "") };
  }
  if (!beforeLines.length && afterLines.length) {
    if (locateSequenceWithContext(lines, afterLines, change, { allowSourceStartFallback: true })) {
      return { status: "already-applied", text: String(text ?? "") };
    }
    const insertIndex = locateRemovalGap(lines, change);
    if (insertIndex == null) return { status: "conflict", text: String(text ?? "") };
    const next = [...lines];
    next.splice(insertIndex, 0, ...afterLines.map(normalizeResumeLine).filter(Boolean));
    return { status: "applied", text: next.join("\n") };
  }
  return replaceResumeLinesResult(text, beforeLines, afterLines, change);
}

export function revertResumeChangeResult(text, change) {
  const beforeLines = change.beforeLines ?? (change.before ? [change.before] : []);
  const afterLines = change.afterLines ?? (change.after ? [change.after] : []);
  const lines = String(text ?? "").split("\n");
  if (beforeLines.length && !afterLines.length) {
    const insertIndex = locateRemovalGap(lines, change);
    if (insertIndex != null) {
      const next = [...lines];
      next.splice(insertIndex, 0, ...beforeLines.map(normalizeResumeLine).filter(Boolean));
      return { status: "applied", text: next.join("\n") };
    }
    return locateSequenceWithContext(lines, beforeLines, change)
      ? { status: "already-reverted", text: String(text ?? "") }
      : { status: "conflict", text: String(text ?? "") };
  }
  if (!beforeLines.length && afterLines.length) {
    const target = locateSequenceWithContext(lines, afterLines, change, { allowSourceStartFallback: true });
    if (target) {
      const next = [...lines];
      next.splice(target.start, target.end - target.start + 1);
      return { status: "applied", text: next.join("\n") };
    }
    return locateExactInsertion(lines, change) != null
      ? { status: "already-reverted", text: String(text ?? "") }
      : { status: "conflict", text: String(text ?? "") };
  }
  const result = replaceResumeLinesResult(text, afterLines, beforeLines, change);
  return result.status === "already-applied" ? { ...result, status: "already-reverted" } : result;
}

export function applyResumeChange(text, change) {
  return applyResumeChangeResult(text, change).text;
}

export function revertResumeChange(text, change) {
  return revertResumeChangeResult(text, change).text;
}

export function saveEditableResumeVersion(versions, versionId, content, patchAudit = null) {
  if (!versionId || versionId === "master-resume") return versions;
  return versions.map((version) => (
    version.id === versionId
      ? {
          ...version,
          content,
          updated: "刚刚手动编辑",
          editedAt: new Date().toISOString(),
          status: "已审核保存",
          ...(patchAudit ? { patchAudit, lineage: { ...(version.lineage ?? {}), lastSavedAt: new Date().toISOString() } } : {}),
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
  changes.forEach((change, index) => {
    const decision = decisions[`${scope}:${change.patchId ?? index}`] ?? decisions[`${scope}:${index}`];
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
