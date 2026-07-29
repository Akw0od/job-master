import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApplicationQuestionReview,
  classifyApplicationQuestion,
  findReusableApplicationAnswer,
  normalizeApplicationAnswerLibrary,
  removeApplicationAnswer,
  upsertApplicationAnswer,
} from "../src/domain/applicationAnswers.js";

test("application questions classify factual, narrative, sensitive, and unknown prompts", () => {
  assert.equal(classifyApplicationQuestion("What is your email address?"), "factual");
  assert.equal(classifyApplicationQuestion("Why are you interested in this role?"), "narrative");
  assert.equal(classifyApplicationQuestion("Will you now or later require visa sponsorship?"), "sensitive");
  assert.equal(classifyApplicationQuestion("Choose your preferred team ritual"), "unknown");
  assert.equal(classifyApplicationQuestion("你的工作授权状态是什么？"), "sensitive");
});

test("confirmed non-sensitive answers are reusable while sensitive values are never persisted", () => {
  const narrative = upsertApplicationAnswer({}, {
    question: "Why are you interested in this role?",
    answer: "I want to build reliable, human-reviewed AI workflows.",
    state: "confirmed",
    sourceCode: "user-confirmed",
    updatedAt: "2026-07-28T12:00:00.000Z",
  });
  assert.equal(narrative.changed, true);
  assert.equal(findReusableApplicationAnswer(narrative.library, "Why are you interested in this role?")?.state, "confirmed");

  const sensitive = upsertApplicationAnswer(narrative.library, {
    question: "Do you require visa sponsorship?",
    answer: "This value must not be stored.",
    state: "confirmed",
    updatedAt: "2026-07-28T12:01:00.000Z",
  });
  const stored = sensitive.library.answers.find((answer) => answer.category === "sensitive");
  assert.equal(stored.answer, "");
  assert.equal(stored.state, "manual-required");
  assert.equal(JSON.stringify(sensitive.library).includes("must not be stored"), false);
});

test("answer normalization is bounded, deterministic, and fail-closed", () => {
  const valid = {
    schemaVersion: 1,
    question: "Describe a difficult tradeoff.",
    category: "narrative",
    state: "confirmed",
    answer: "A confirmed answer.",
    sourceCode: "user-confirmed",
    updatedAt: "2026-07-28T12:00:00.000Z",
  };
  const library = normalizeApplicationAnswerLibrary({
    answers: [
      valid,
      { ...valid, answer: "Latest answer.", updatedAt: "2026-07-28T13:00:00.000Z" },
      { ...valid, schemaVersion: 999, question: "Invalid" },
    ],
  });
  assert.equal(library.answers.length, 1);
  assert.equal(library.answers[0].answer, "Latest answer.");

  const review = buildApplicationQuestionReview("Describe a difficult tradeoff.", library);
  assert.equal(review.reviewState, "confirmed");
  assert.equal(review.answer, "Latest answer.");
  const removed = removeApplicationAnswer(library, library.answers[0].id);
  assert.equal(removed.changed, true);
  assert.equal(removed.library.answers.length, 0);
});
