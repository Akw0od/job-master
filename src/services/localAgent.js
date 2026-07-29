const localAgentUrl = "http://127.0.0.1:4317";

async function requestJson(path, options = {}) {
  const response = await fetch(`${localAgentUrl}${path}`, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Local Agent request failed (${response.status}).`);
  return result;
}

export function requestResumeRewrite(payload) {
  return requestJson("/v1/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function searchOfficialJobs(payload) {
  return requestJson("/v1/jobs/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function verifyOfficialJobUrls(urls) {
  return requestJson("/v1/jobs/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
}

export function getApplicationAutomationCapabilities() {
  return requestJson("/v1/applications/automation/health");
}

export function scanApplicationPage(payload) {
  return requestJson("/v1/applications/automation/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function executeReviewedApplication(payload) {
  return requestJson("/v1/applications/automation/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function closeApplicationAutomationSession(sessionId) {
  return requestJson("/v1/applications/automation/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}
