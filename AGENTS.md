# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Current Product Direction

- The dashboard is Chinese-first, calm, and Apple-inspired: restrained surfaces, generous whitespace, and task-focused controls.
- Treat resume facts as user-owned data. AI drafts and missing metrics must never masquerade as parsed or confirmed evidence.
- Keep the prototype local-first. Until a real desktop database exists, describe persistence accurately as browser-local drafts and do not claim SQLite storage.
- On small screens, prioritize the active task over the full job-flow sidebar; the queue should collapse after a job is selected.
- Treat the uploaded resume as an immutable Master Resume. Every AI-polished or job-tailored version must preserve a visible lineage to that source and expose its changes for human review.
- The resume workspace should center on three views: the uploaded original, a professional paginated preview, and explicit before/after suggestions. Never substitute demo facts or placeholder identity data for uploaded content.
- Keep the current job-direction taxonomy stable unless the user explicitly asks to change it.
- Keep built-in job directions as stable shortcuts, while allowing users to add and remove browser-local custom directions with their own matching keywords. Custom directions must participate in real recommendation re-scoring and must never inject those keywords into resume facts.
- Job discovery must respect the selected market. Switching between China and the US should swap the discovery pool immediately; refreshes should rotate in visibly new roles while preserving jobs the user has explicitly tracked.
- Use three primary product areas instead of a five-step wizard: Find Jobs, My Resume, and Applications.
- Treat direction recommendations and AI resume polishing as contextual actions inside job discovery and job detail, not mandatory top-level steps.
- The primary loop is resume upload -> job discovery -> JD-based tailoring -> official-site application assist -> application tracking.
- Application tracking should use candidate-facing statuses such as Saved, Preparing, Applied, Interview, Offer, Rejected, and Archived.
- A locally uploaded resume must become the visible Master Resume immediately. Never substitute demo resume content after a successful upload; show a clear parsing error instead.
- Refreshing job recommendations must visibly re-score and reorder jobs from the current Master Resume and selected target; never present an unchanged sample queue as a successful refresh.
- Job application actions and Computer Use must open the specific role's application URL. Never fall back to a company careers homepage when a concrete posting URL is missing.
- Keep the uploaded resume's section order and visual structure immutable by default. Direction and job-specific versions may rewrite wording, reorder bullets within a section, or select/replace only user-confirmed projects and experiences; structural changes require an explicit user action.
- Model resume variants in three layers: one immutable Master Resume, a small set of reusable direction resumes, and disposable job-specific variants derived from a direction resume after reading a JD.
- The simplified flow is upload once -> prepare direction resumes -> discover jobs -> tailor inside job detail -> open the official application -> track status. Do not make users pass through evidence, polishing, direction, radar, and review as separate mandatory steps.
- Show resume editing as a document-first comparison: resume preview in the main canvas, version selector near the title, and a compact change-review panel. Hide templates, AI chat, and advanced controls until the user asks for them.
- The Master Resume preview must preserve the uploaded document's visible alignment, header order, section hierarchy, paragraph grouping, and bullet wrapping. Direction and job versions inherit that same layout instead of being reformatted into a generic centered template.
- When a job moves to Applied, automatically backfill the discovery list from genuinely unseen jobs in the selected market. If the local pool is exhausted, say so explicitly instead of presenting a rerank as newly discovered jobs.
- Keep market and employment type as independent job-discovery filters. China and the US must each support Full-time and Internship pools, with an explicit empty state when a pool has no verified roles.
- Show resume diffs in context: mark changed source text red inside the resume preview and place the full green rewrite in the right review panel, linked by a shared number and focus behavior. Do not truncate rewrite text.
- Let users manually add, delete, and rewrite content in direction and job-derived resumes while keeping the Master Resume immutable. Manual edits must retain lineage and appear in the same in-context diff review.
