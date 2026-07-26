import { hashText } from "../domain/applications.js";
import { normalizeResumeLine, parseResumeDocument } from "../resume/resumeModel.js";

const contactFields = [
  ["name", "姓名"],
  ["email", "邮箱"],
  ["phone", "电话"],
  ["location", "所在地"],
  ["linkedin", "LinkedIn / 个人主页"],
];

const educationSectionTitles = new Set([
  "education", "academicbackground", "academics", "教育", "教育经历", "教育背景",
]);

const experienceSectionTitles = new Set([
  "experience", "workexperience", "professionalexperience", "internshipexperience",
  "projects", "selectedprojects", "projectexperience", "research", "researchexperience",
  "leadership", "activities", "campusexperience", "工作经历", "实习经历", "项目", "项目经历",
  "研究经历", "领导力", "校园经历", "经历与项目",
]);

const sensitiveQuestionLinePattern = /^(?:work\s*authori[sz]ation|authori[sz]ed\s+to\s+work|visa(?:\s+status)?|sponsorship|salary(?:\s+(?:expectations?|requirements?))?|compensation(?:\s+(?:expectations?|requirements?))?|eeoc|gender|race|ethnicity|disability|veteran|confidential(?:ity)?|nda|工作授权|签证(?:状态)?|赞助|薪资(?:要求|期望)?|薪酬(?:要求|期望)?|性别|种族|民族|残疾|退伍|身份|保密(?:声明)?)[：:]/i;

function compactSectionTitle(title) {
  return normalizeResumeLine(title).toLowerCase().replace(/[\s&/·|_-]+/g, "");
}

function sectionFields(sections, group) {
  const allowedTitles = group === "education" ? educationSectionTitles : experienceSectionTitles;
  let excludedLineCount = 0;
  const fields = sections
    .filter((section) => allowedTitles.has(compactSectionTitle(section.title)))
    .map((section, index) => {
      const safeLines = section.lines
        .map(normalizeResumeLine)
        .filter((line) => {
          if (!line) return false;
          if (!sensitiveQuestionLinePattern.test(line)) return true;
          excludedLineCount += 1;
          return false;
        });
      const value = safeLines.join("\n");
      if (!value) return null;
      return {
        id: `${group}-${index}`,
        label: section.title,
        value,
        source: `Resume · ${section.title}`,
      };
    })
    .filter(Boolean);
  return { fields, excludedLineCount };
}

function buildGroup(id, label, fields, unavailableCopy, excludedLineCount = 0) {
  return {
    id,
    label,
    fields,
    status: fields.length ? "available" : "unavailable",
    unavailableCopy: fields.length ? "" : unavailableCopy,
    excludedLineCount,
  };
}

export function buildApplicationFieldPacket(candidateProfile, resumeText) {
  const profile = candidateProfile && typeof candidateProfile === "object" ? candidateProfile : {};
  const document = parseResumeDocument(resumeText);
  const contact = contactFields
    .map(([id, label]) => ({ id, label, value: String(profile[id] ?? "").trim() }))
    .filter((field) => field.value)
    .map((field) => ({ ...field, source: "申请辅助 · 浏览器本地档案" }));
  const education = sectionFields(document.sections, "education");
  const experience = sectionFields(document.sections, "experience");

  return {
    groups: [
      buildGroup("contact", "联系方式", contact, "本地档案中没有可安全复制的联系方式。"),
      buildGroup("education", "教育信息", education.fields, "未识别到明确的教育章节；不会猜测或使用整份简历。", education.excludedLineCount),
      buildGroup("experience", "经历与项目", experience.fields, "未识别到明确的经历、实习、项目、研究或领导力章节；不会猜测或使用整份简历。", experience.excludedLineCount),
    ],
    excludedCategories: ["工作授权", "签证/赞助", "薪资", "EEOC/身份", "保密声明", "提交动作"],
  };
}

export function validateApplicationContact(candidateProfile) {
  const name = String(candidateProfile?.name ?? "").trim();
  const email = String(candidateProfile?.email ?? "").trim();
  if (!name) return { ready: false, reason: "missing-name" };
  if (!email) return { ready: false, reason: "missing-email" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return { ready: false, reason: "invalid-email" };
  return { ready: true, reason: "" };
}

export function canLaunchApplicationAssist({ contactValidation, authorization, isConfirmed, isLaunching }) {
  return Boolean(
    !isLaunching
    && contactValidation?.ready
    && authorization?.contact
    && isConfirmed,
  );
}

export function getPacketGroups(packet, allowedGroups = []) {
  const allowed = new Set(allowedGroups);
  return (packet?.groups ?? []).filter((group) => allowed.has(group.id) && group.fields.length > 0);
}

export function getPacketFieldCount(packet, allowedGroups = []) {
  return getPacketGroups(packet, allowedGroups).reduce((count, group) => count + group.fields.length, 0);
}

export function buildApplicationSourceFingerprint({ candidateProfile, resumeText, job, resumeVersionId }) {
  const contactSnapshot = contactFields.map(([id]) => String(candidateProfile?.[id] ?? "").trim()).join("\u241f");
  const jobSnapshot = [job?.id ?? "", job?.company ?? "", job?.role ?? "", resumeVersionId ?? ""].join("\u241f");
  return `v2-${hashText(`${jobSnapshot}\u241e${contactSnapshot}\u241e${String(resumeText ?? "")}`)}`;
}

export function createApplicationAssistAudit({ job, resumeVersionId, allowedGroups, packet, candidateProfile, resumeText, preparedAt = new Date().toISOString() }) {
  const availableGroups = new Set((packet?.groups ?? [])
    .filter((group) => group.fields.length > 0)
    .map((group) => group.id));
  const groups = [...new Set(allowedGroups)]
    .filter((group) => ["contact", "education", "experience"].includes(group) && availableGroups.has(group));
  return {
    preparedAt,
    jobId: job?.id ?? "",
    company: job?.company ?? "",
    role: job?.role ?? "",
    resumeVersionId: resumeVersionId ?? null,
    allowedGroups: groups,
    fieldCount: getPacketFieldCount(packet, groups),
    sourceFingerprint: buildApplicationSourceFingerprint({ candidateProfile, resumeText, job, resumeVersionId }),
  };
}

export function hasApplicationAssistSourceChanged(audit, { candidateProfile, resumeText, job, resumeVersionId }) {
  if (!audit?.sourceFingerprint) return Boolean(audit?.preparedAt);
  return audit.sourceFingerprint !== buildApplicationSourceFingerprint({ candidateProfile, resumeText, job, resumeVersionId });
}
