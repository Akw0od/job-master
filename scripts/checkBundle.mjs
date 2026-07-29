import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const distUrl = new URL("../dist/", import.meta.url);
const assetsUrl = new URL("assets/", distUrl);
const html = await readFile(new URL("index.html", distUrl), "utf8");
const entryMatch = html.match(/<script[^>]*type="module"[^>]*src="\/assets\/([^"]+\.js)"/);
const preloadFiles = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="\/assets\/([^"]+\.js)"/g)]
  .map((match) => match[1]);

if (!entryMatch) {
  throw new Error("Bundle budget check could not find the production entry chunk.");
}

const entryFile = entryMatch[1];
const initialFiles = [entryFile, ...preloadFiles];
const fileSizes = new Map();
for (const file of initialFiles) {
  const fileUrl = new URL(file, assetsUrl);
  const details = await stat(fileUrl);
  fileSizes.set(file, details.size);
}

const entryBudgetBytes = 360_000;
const preloadBudgetBytes = 230_000;
const totalInitialBudgetBytes = 540_000;
const entrySize = fileSizes.get(entryFile) ?? 0;
const preloadSize = preloadFiles.reduce((total, file) => total + (fileSizes.get(file) ?? 0), 0);
const initialSize = entrySize + preloadSize;

if (entrySize > entryBudgetBytes) {
  throw new Error(`Entry chunk ${entryFile} is ${entrySize} bytes; budget is ${entryBudgetBytes}.`);
}
if (preloadSize > preloadBudgetBytes) {
  throw new Error(`Preloaded vendor JavaScript is ${preloadSize} bytes; budget is ${preloadBudgetBytes}.`);
}
if (initialSize > totalInitialBudgetBytes) {
  throw new Error(`Initial JavaScript is ${initialSize} bytes; budget is ${totalInitialBudgetBytes}.`);
}

const assetFiles = await readdir(assetsUrl);
const lazyModalPrefixes = [
  "ApplicationAssistModal-",
  "ApplicationSubmissionReviewModal-",
  "EditModal-",
  "JobInputModals-",
  "LocalDataModal-",
  "ResumeExportModal-",
  "ResumeRewriteConsentModal-",
];
for (const prefix of lazyModalPrefixes) {
  const file = assetFiles.find((candidate) => candidate.startsWith(prefix) && candidate.endsWith(".js"));
  if (!file) throw new Error(`Expected lazy modal chunk ${prefix}*.js was not emitted.`);
  if (initialFiles.includes(file)) throw new Error(`Lazy modal chunk ${file} was unexpectedly loaded at startup.`);
}

const formatKb = (bytes) => `${(bytes / 1_000).toFixed(1)} kB`;
process.stdout.write([
  `Bundle budget passed: entry ${formatKb(entrySize)}`,
  `preloaded vendor ${formatKb(preloadSize)}`,
  `initial total ${formatKb(initialSize)}`,
  `dist ${fileURLToPath(distUrl)}`,
].join(" · "));
process.stdout.write("\n");
