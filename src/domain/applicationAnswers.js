import { hashText } from "./applications.js";

export const applicationAnswerSchemaVersion = 1;
export const applicationAnswerCategories = Object.freeze(["factual", "narrative", "sensitive", "unknown"]);
export const applicationAnswerStates = Object.freeze(["confirmed", "draft", "manual-required"]);

const categories = new Set(applicationAnswerCategories);
const states = new Set(applicationAnswerStates);
const sourceCodes = new Set(["user-confirmed", "profile", "resume", "job-specific"]);
const maxAnswers = 100;
const maxQuestionLength = 500;
const maxAnswerLength = 4_000;
const safeText = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const sensitiveQuestionPattern = /\b(?:work\s*authori[sz]ation|authori[sz]ed\s+to\s+work|visa|sponsorship|salary|compensation|gender|sex|race|ethnicity|disability|veteran|social\s+security|ssn|date\s+of\s+birth|religion|marital\s+status|citizenship)\b|工作授权|签证|赞助|薪资|薪酬|性别|种族|民族|残疾|退伍|社会安全号|出生日期|宗教|婚姻|公民身份/iu;
const factualQuestionPattern = /\b(?:full\s*name|email|phone|location|address|linkedin|github|portfolio|school|university|degree|major|employer|company|job\s*title|start\s*date|availability)\b|姓名|邮箱|电话|所在地|地址|个人主页|学校|大学|学历|专业|雇主|公司|职位|入职时间|到岗时间/iu;
const narrativeQuestionPattern = /\b(?:why\s+(?:are\s+you|do\s+you|this|our|you)|motivat|interest|describe|tell\s+us|example|challenge|achievement|experience|cover\s+letter|what\s+excites|how\s+would)\b|为什么|动机|兴趣|请描述|请举例|挑战|成就|相关经历|求职信|最感兴趣/iu;

export function normalizeApplicationQuestion(question) {
  return safeText(question, maxQuestionLength)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s_]+/gu, " ")
    .trim();
}

export function classifyApplicationQuestion(question) {
  const value = normalizeApplicationQuestion(question);
  if (!value) return "unknown";
  if (sensitiveQuestionPattern.test(value)) return "sensitive";
  if (factualQuestionPattern.test(value)) return "factual";
  if (narrativeQuestionPattern.test(value)) return "narrative";
  return "unknown";
}

export function applicationQuestionKey(question) {
  const normalized = normalizeApplicationQuestion(question);
  return normalized ? `q-${hashText(normalized)}` : "";
}

function normalizeAnswer(value) {
  if (!isPlainObject(value) || value.schemaVersion !== applicationAnswerSchemaVersion) return null;
  const question = safeText(value.question, maxQuestionLength);
  const questionKey = applicationQuestionKey(question);
  const category = categories.has(value.category) ? value.category : classifyApplicationQuestion(question);
  const state = states.has(value.state) ? value.state : "draft";
  const sourceCode = sourceCodes.has(value.sourceCode) ? value.sourceCode : "user-confirmed";
  const updatedAt = safeText(value.updatedAt, 40);
  if (!question || !questionKey || !Number.isFinite(Date.parse(updatedAt))) return null;
  const sensitive = category === "sensitive";
  const answer = sensitive ? "" : safeText(value.answer, maxAnswerLength);
  const normalizedState = sensitive ? "manual-required" : state === "confirmed" && !answer ? "draft" : state;
  return {
    schemaVersion: applicationAnswerSchemaVersion,
    id: `answer-${questionKey}`,
    questionKey,
    question,
    category,
    state: normalizedState,
    answer,
    sourceCode,
    updatedAt: new Date(updatedAt).toISOString(),
  };
}

export function normalizeApplicationAnswerLibrary(value) {
  const candidates = Array.isArray(value) ? value : Array.isArray(value?.answers) ? value.answers : [];
  const normalized = candidates.map(normalizeAnswer).filter(Boolean)
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id));
  const latestByQuestion = new Map();
  normalized.forEach((answer) => latestByQuestion.set(answer.questionKey, answer));
  return {
    schemaVersion: applicationAnswerSchemaVersion,
    answers: [...latestByQuestion.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
      .slice(0, maxAnswers),
  };
}

export function upsertApplicationAnswer(library, input = {}) {
  const question = safeText(input.question, maxQuestionLength);
  const category = categories.has(input.category) ? input.category : classifyApplicationQuestion(question);
  const candidate = normalizeAnswer({
    schemaVersion: applicationAnswerSchemaVersion,
    question,
    category,
    state: input.state,
    answer: input.answer,
    sourceCode: input.sourceCode,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });
  const current = normalizeApplicationAnswerLibrary(library);
  if (!candidate) return { library: current, changed: false, answer: null, reason: "invalid-answer" };
  const answers = current.answers.filter((answer) => answer.questionKey !== candidate.questionKey);
  const next = normalizeApplicationAnswerLibrary({ answers: [candidate, ...answers] });
  return { library: next, changed: true, answer: candidate, reason: "ok" };
}

export function removeApplicationAnswer(library, answerId) {
  const current = normalizeApplicationAnswerLibrary(library);
  const safeId = safeText(answerId, 120);
  const answers = current.answers.filter((answer) => answer.id !== safeId);
  if (answers.length === current.answers.length) return { library: current, changed: false, reason: "not-found" };
  return { library: normalizeApplicationAnswerLibrary({ answers }), changed: true, reason: "ok" };
}

export function findReusableApplicationAnswer(library, question) {
  const questionKey = applicationQuestionKey(question);
  if (!questionKey) return null;
  const answer = normalizeApplicationAnswerLibrary(library).answers
    .find((candidate) => candidate.questionKey === questionKey);
  return answer?.state === "confirmed" && answer.category !== "sensitive" ? answer : null;
}

export function buildApplicationQuestionReview(question, library) {
  const category = classifyApplicationQuestion(question);
  const reusable = findReusableApplicationAnswer(library, question);
  return {
    questionKey: applicationQuestionKey(question),
    question: safeText(question, maxQuestionLength),
    category,
    reviewState: reusable ? "confirmed" : category === "sensitive" ? "manual-required" : "unresolved",
    answerId: reusable?.id ?? "",
    answer: reusable?.answer ?? "",
  };
}
