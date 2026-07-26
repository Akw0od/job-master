import test from "node:test";
import assert from "node:assert/strict";
import {
  closeReservedApplicationWindow,
  navigateReservedApplicationWindow,
  reserveApplicationWindow,
} from "../src/services/applicationWindow.js";

test("application links reserve a blank user-gesture tab and clear opener before navigation", () => {
  const calls = [];
  const reserved = {
    opener: { unsafe: true },
    closed: false,
    location: { replace: (url) => calls.push(url) },
    close: () => { reserved.closed = true; },
  };
  const opened = reserveApplicationWindow((...args) => {
    calls.push(args);
    return reserved;
  });

  assert.equal(opened, reserved);
  assert.deepEqual(calls[0], ["about:blank", "_blank"]);
  assert.equal(reserved.opener, null);
  assert.equal(navigateReservedApplicationWindow(reserved, "https://example.com/jobs/123"), true);
  assert.equal(calls[1], "https://example.com/jobs/123");
  closeReservedApplicationWindow(reserved);
  assert.equal(reserved.closed, true);
});

test("fresh verified links use the same reserved-tab navigation without relying on window.open's return from the destination", () => {
  const calls = [];
  const reserved = {
    opener: { unsafe: true },
    closed: false,
    location: { replace: (url) => { calls.push(url); return undefined; } },
  };
  const opened = reserveApplicationWindow((...args) => {
    calls.push(args);
    return reserved;
  });

  assert.equal(opened, reserved);
  assert.deepEqual(calls, [["about:blank", "_blank"]]);
  assert.equal(navigateReservedApplicationWindow(opened, "https://example.com/jobs/fresh"), true);
  assert.deepEqual(calls, [["about:blank", "_blank"], "https://example.com/jobs/fresh"]);
});

test("blocked or closed reserved application tabs do not report successful navigation", () => {
  assert.equal(reserveApplicationWindow(() => null), null);
  assert.equal(navigateReservedApplicationWindow({ closed: true }, "https://example.com/jobs/123"), false);
});
