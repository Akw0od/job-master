import assert from "node:assert/strict";
import test from "node:test";
import {
  appendApplicationOpened, findDuplicateApplications, getApplicationEvents, getApplicationStatusRevertibility,
  normalizeApplicationEventsById, revertLatestApplicationStatusChange, transitionApplicationStatus,
} from "../src/domain/applicationEvents.js";

const app = (id = "a", extra = {}) => ({ id, company: "Acme", role: "Engineer", status: "收藏", statusKey: "saved", stage: "进行中", userTracked: false, applyUrl: "https://jobs.example.com/roles/123", ...extra });
const state = (applications = [app()], applicationEventsById = {}) => ({ applications, applicationEventsById });

test("atomic status transitions reject rapid same-value changes and preserve audit history", () => {
  const one = transitionApplicationStatus(state(), "a", "已投递", { occurredAt: "2026-01-01T00:00:00Z", eventId: "e1" });
  assert.equal(one.changed, true);
  assert.deepEqual(one.state.applications[0].statusKey, "applied");
  const repeated = transitionApplicationStatus(one.state, "a", "已投递", { occurredAt: "2026-01-01T00:00:01Z" });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.reason, "same-status");
  const two = transitionApplicationStatus(one.state, "a", "面试", { occurredAt: "2026-01-01T00:00:02Z", eventId: "e2" });
  assert.deepEqual(getApplicationEvents(two.state, "a").map((event) => event.type), ["status.changed", "status.changed"]);
});

test("revert appends one compensating event and rejects stale or second rollbacks", () => {
  const changed = transitionApplicationStatus(state(), "a", "已投递", { occurredAt: "2026-01-01T00:00:00Z", eventId: "move" });
  assert.equal(getApplicationStatusRevertibility(changed.state, "a").canRevert, true);
  const reverted = revertLatestApplicationStatusChange(changed.state, "a", { occurredAt: "2026-01-01T00:01:00Z", eventId: "undo" });
  assert.equal(reverted.state.applications[0].status, "收藏");
  assert.equal(getApplicationEvents(reverted.state, "a").at(-1).revertsEventId, "move");
  assert.equal(revertLatestApplicationStatusChange(reverted.state, "a").reason, "no-status-change");
  const stale = { ...changed.state, applications: [app("a", { status: "面试" })] };
  assert.equal(revertLatestApplicationStatusChange(stale, "a").reason, "stale-status-change");
});

test("normalization fails closed for corruption, impossible reversions, and applies deterministic caps", () => {
  const valid = { schemaVersion: 1, id: "move", applicationId: "a", type: "status.changed", occurredAt: "2026-01-01T00:00:00Z", fromStatus: "收藏", toStatus: "已投递" };
  const invalid = { ...valid, id: "bad", metadata: { email: "secret@example.com" } };
  const impossible = { schemaVersion: 1, id: "undo", applicationId: "a", type: "status.reverted", occurredAt: "2026-01-01T00:01:00Z", fromStatus: "已投递", toStatus: "收藏", revertsEventId: "missing" };
  const normalized = normalizeApplicationEventsById({ a: [valid, invalid, impossible], wrong: {} });
  assert.equal(normalized.a.length, 1);
  assert.equal(normalized.a[0].id, "move");
  const many = Array.from({ length: 60 }, (_, index) => ({ schemaVersion: 1, id: `o${index}`, applicationId: "a", type: "application.opened", occurredAt: new Date(1700000000000 + index * 1000).toISOString() }));
  assert.equal(normalizeApplicationEventsById({ a: many }).a.length, 50);
  assert.deepEqual(normalizeApplicationEventsById([]), {});
});

test("event normalization enforces a latest-change stack and removes retention-orphaned reverts", () => {
  const changed = (id, fromStatus, toStatus, offset) => ({ schemaVersion: 1, id, applicationId: "a", type: "status.changed", occurredAt: new Date(1700000000000 + offset).toISOString(), fromStatus, toStatus });
  const outOfOrder = { schemaVersion: 1, id: "bad-undo", applicationId: "a", type: "status.reverted", occurredAt: new Date(1700000000002).toISOString(), fromStatus: "已投递", toStatus: "收藏", revertsEventId: "first" };
  const sequence = normalizeApplicationEventsById({ a: [changed("first", "收藏", "已投递", 0), changed("second", "已投递", "面试", 1), outOfOrder] });
  assert.deepEqual(sequence.a.map((event) => event.id), ["first", "second"]);
  const target = changed("target", "收藏", "已投递", 0);
  const fillers = Array.from({ length: 49 }, (_, index) => ({ schemaVersion: 1, id: `open-${index}`, applicationId: "a", type: "application.opened", occurredAt: new Date(1700000010000 + index).toISOString() }));
  const undo = { schemaVersion: 1, id: "undo", applicationId: "a", type: "status.reverted", occurredAt: new Date(1700000020000).toISOString(), fromStatus: "已投递", toStatus: "收藏", revertsEventId: "target" };
  const retained = normalizeApplicationEventsById({ a: [target, ...fillers, undo] });
  assert.equal(retained.a.some((event) => event.id === "undo"), false);
  const global = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`a-${index}`, [{ schemaVersion: 1, id: `global-${index}`, applicationId: `a-${index}`, type: "application.opened", occurredAt: new Date(1700100000000 + index).toISOString() }]]));
  const globallyRetained = normalizeApplicationEventsById(global);
  assert.equal(Object.keys(globallyRetained).length, 500);
  assert.equal(globallyRetained["a-0"], undefined);
});

test("explicit malformed event input fails closed and duplicate identities preserve URL case but normalize company punctuation", () => {
  assert.equal(appendApplicationOpened(state(), "a", { occurredAt: "not-a-time" }).changed, false);
  assert.equal(appendApplicationOpened(state(), "a", { eventId: "" }).changed, false);
  const self = findDuplicateApplications({
    job: app("a"), applications: [app("a")], excludeApplicationId: "a",
    applicationEventsById: { a: [{ schemaVersion: 1, id: "self-past", applicationId: "a", type: "status.changed", occurredAt: "2026-01-01T00:00:00Z", fromStatus: "收藏", toStatus: "已投递" }] },
  });
  assert.equal(self.duplicate, true);
  assert.deepEqual(self.reasonCodes, ["same-application"]);
  const caseSensitive = findDuplicateApplications({
    job: { company: "One", role: "Role A", applyUrl: "https://jobs.example.com/Roles/A" },
    applications: [app("other", { company: "Two", role: "Role B", status: "已投递", applyUrl: "https://jobs.example.com/roles/a" })],
  });
  assert.equal(caseSensitive.duplicate, false);
  const punctuation = findDuplicateApplications({
    job: { company: "Ａcme, Inc.", role: "Data-Scientist" },
    applications: [app("punctuation", { company: "acme inc", role: "Data Scientist", status: "已投递", applyUrl: "" })],
  });
  assert.equal(punctuation.duplicate, true);
  assert.ok(punctuation.reasonCodes.includes("company-role"));
});

test("opened events retain only safe metadata and duplicate detection covers current and historical evidence", () => {
  const opened = appendApplicationOpened(state(), "a", { occurredAt: "2026-01-01T00:00:00Z", metadata: { warningCodes: ["receipt-stale"] } });
  assert.equal(opened.changed, true);
  assert.equal(JSON.stringify(opened.event).includes("https://"), false);
  assert.equal("company" in opened.event, false);
  assert.equal("role" in opened.event, false);
  assert.match(opened.event.id, /-\d{4}$/);
  assert.equal(appendApplicationOpened(state(), "a", { eventId: "contact@example.com" }).changed, false);
  const duplicate = findDuplicateApplications({
    job: { company: "Acme", role: "Engineer", applyUrl: "https://jobs.example.com/roles/123/" },
    applications: [app("prior", { status: "收藏", applyUrl: "https://jobs.example.com/roles/123" })],
    applicationEventsById: { prior: [{ schemaVersion: 1, id: "past", applicationId: "prior", type: "status.changed", occurredAt: "2026-01-01T00:00:00Z", fromStatus: "收藏", toStatus: "面试" }] },
  });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.applicationIds, ["prior"]);
  assert.ok(duplicate.reasonCodes.includes("application-url"));
});
