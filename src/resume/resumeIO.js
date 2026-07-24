function normalizeExtractedLine(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function inferPdfPageSize(width, height) {
  if (!width || !height) return "A4";
  const ratio = Math.min(width, height) / Math.max(width, height);
  return Math.abs(ratio - (210 / 297)) <= Math.abs(ratio - (8.5 / 11))
    ? "A4"
    : "Letter";
}

export function groupPdfTextItems(items = [], pageWidth = 0) {
  const positionedItems = items
    .filter((item) => typeof item?.str === "string" && normalizeExtractedLine(item.str))
    .map((item) => ({
      text: normalizeExtractedLine(item.str),
      x: Number(item.transform?.[4] ?? 0),
      y: Number(item.transform?.[5] ?? 0),
      width: Math.max(0, Number(item.width ?? 0)),
      height: Math.max(1, Number(item.height ?? Math.abs(item.transform?.[3] ?? 10))),
      hasEOL: Boolean(item.hasEOL),
    }))
    .sort((left, right) => right.y - left.y || left.x - right.x);

  const lines = [];
  positionedItems.forEach((item) => {
    const tolerance = Math.max(2, item.height * 0.36);
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (!line) {
      line = { y: item.y, height: item.height, parts: [] };
      lines.push(line);
    }
    line.parts.push(item);
    line.height = Math.max(line.height, item.height);
  });

  const normalizedLines = lines
    .sort((left, right) => right.y - left.y)
    .map((line) => {
      const parts = line.parts.sort((left, right) => left.x - right.x);
      let text = "";
      let rightEdge = null;
      parts.forEach((part) => {
        const gap = rightEdge === null ? 0 : part.x - rightEdge;
        const separator = text && gap > Math.max(1.5, part.height * 0.12) ? " " : "";
        text += `${separator}${part.text}`;
        rightEdge = Math.max(rightEdge ?? 0, part.x + part.width);
      });
      const first = parts[0];
      return {
        text: normalizeExtractedLine(text),
        x: first?.x ?? 0,
        y: line.y,
        width: Math.max(0, (rightEdge ?? 0) - (first?.x ?? 0)),
        height: line.height,
      };
    })
    .filter((line) => line.text);

  const typicalLineHeight = median(normalizedLines.map((line) => line.height)) || 10;
  const textLines = [];
  normalizedLines.forEach((line, index) => {
    if (index > 0) {
      const previous = normalizedLines[index - 1];
      const verticalGap = previous.y - line.y;
      if (verticalGap > Math.max(typicalLineHeight * 1.72, previous.height * 1.55)) {
        textLines.push("");
      }
    }
    textLines.push(line.text);
  });

  const firstLine = normalizedLines[0];
  const firstLineCenter = firstLine ? firstLine.x + (firstLine.width / 2) : 0;
  const headerAlignment = pageWidth > 0 && Math.abs(firstLineCenter - (pageWidth / 2)) <= pageWidth * 0.08
    ? "center"
    : "left";

  return {
    text: textLines.join("\n"),
    lines: normalizedLines,
    headerAlignment,
  };
}

async function extractPdfResumeDocument(file) {
  const [{ default: pdfWorkerUrl }, pdfjs] = await Promise.all([
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    import("pdfjs-dist"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdfDocument = await pdfjs.getDocument({ data }).promise;
  const pageCount = pdfDocument.numPages;
  const pages = [];
  const warnings = [];
  let sourcePageSize = "A4";
  let headerAlignment = "left";

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const [, , pageWidth, pageHeight] = page.view;
      const grouped = groupPdfTextItems(content.items, pageWidth);
      if (!grouped.text.trim()) warnings.push(`第 ${pageNumber} 页没有可读取的文本层`);
      if (pageNumber === 1) {
        sourcePageSize = inferPdfPageSize(pageWidth, pageHeight);
        headerAlignment = grouped.headerAlignment;
      }
      pages.push(grouped.text);
    }
  } finally {
    await pdfDocument.destroy();
  }

  return {
    text: pages.join("\n\n"),
    documentMeta: {
      format: "pdf",
      pageCount,
      sourcePageSize,
      headerAlignment,
      extractionMethod: "pdf-text-layer",
      warnings,
    },
  };
}

export function convertDocxHtmlToResumeText(html, Parser = globalThis.DOMParser) {
  if (!Parser) throw new Error("当前浏览器无法解析 DOCX 结构。");
  const document = new Parser().parseFromString(String(html ?? ""), "text/html");
  const blocks = [];

  [...document.body.children].forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tagName)) {
      const heading = normalizeExtractedLine(element.textContent);
      if (heading) blocks.push("", heading, "");
      return;
    }
    if (tagName === "ul" || tagName === "ol") {
      [...element.children].forEach((item) => {
        const text = normalizeExtractedLine(item.textContent);
        if (text) blocks.push(`${tagName === "ol" ? "1." : "-"} ${text}`);
      });
      blocks.push("");
      return;
    }
    if (tagName === "table") {
      [...element.querySelectorAll("tr")].forEach((row) => {
        const cells = [...row.querySelectorAll(":scope > th, :scope > td")]
          .map((cell) => normalizeExtractedLine(cell.textContent))
          .filter(Boolean);
        if (cells.length) blocks.push(cells.join(" | "));
      });
      blocks.push("");
      return;
    }

    const text = normalizeExtractedLine(element.textContent);
    if (text) blocks.push(text);
    if (tagName === "p" || tagName === "div") blocks.push("");
  });

  return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractDocxResumeDocument(file) {
  const mammothModule = await import("mammoth/mammoth.browser.js");
  const mammoth = mammothModule.default ?? mammothModule;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h3:fresh",
      ],
    },
  );
  const warnings = (result.messages ?? [])
    .filter((message) => message.type === "warning")
    .map((message) => message.message)
    .slice(0, 5);

  return {
    text: convertDocxHtmlToResumeText(result.value),
    documentMeta: {
      format: "docx",
      pageCount: null,
      sourcePageSize: "A4",
      headerAlignment: "left",
      extractionMethod: "docx-semantic-html",
      warnings,
    },
  };
}

export async function extractResumeDocument(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "txt") {
    return {
      text: await file.text(),
      documentMeta: {
        format: "txt",
        pageCount: null,
        sourcePageSize: "A4",
        headerAlignment: "left",
        extractionMethod: "plain-text",
        warnings: [],
      },
    };
  }
  if (extension === "pdf") return extractPdfResumeDocument(file);
  if (extension === "docx") return extractDocxResumeDocument(file);
  throw new Error("暂不支持旧版 DOC，请先另存为 DOCX 或 PDF。");
}

export async function extractResumeText(file) {
  return (await extractResumeDocument(file)).text;
}
