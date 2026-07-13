---
name: resume-application-agent
description: Use when tailoring a candidate resume to a job description, preparing application materials, or filling job application forms with a final human review gate
---

# Resume Application Agent

## Overview

This skill turns a target JD into an application packet: tailored resume focus, selected evidence, draft bullets, short application answers, and form-fill JSON. It can assist browser form filling, but it must stop before final submission unless the candidate explicitly approves that exact application.

## Inputs

- Required: target job description text or URL.
- Optional: role hint such as `Amazon SDE`, `Risk Engineer`, `Forward Deployed Engineer`, `AI Agent Engineer`.
- Optional: new user-provided project summary from another agent.

## Operating Rules

1. Use `data/profile_context.md` as the factual source of truth.
2. If the user provides new project summaries, add only facts the user confirms or directly provides.
3. Do not invent employers, dates, degrees, metrics, technologies, publications, referrals, work authorization, or compensation details.
4. For every JD, generate a packet first and ask the user to review it.
5. Browser automation may fill fields after review, then stop at the final review screen.
6. Final submission requires explicit approval for that exact company, role, and application.
7. Default resume output is a clean one-page PDF with no decorative color, Experience before Projects, compact horizontal section rules, aligned left edges, and role-specific evidence reuse.
8. After a confirmed submission, update the configured tracker. For China-facing users or products, prefer Feishu Bitable as the operational tracker/database. Do not create spreadsheet trackers unless explicitly requested.

## Quickstart

```powershell
python .\scripts\resume_agent.py `
  --jd .\examples\amazon_sde_jd.txt `
  --role "Amazon SDE" `
  --out .\runs\amazon-sde
```

Outputs:

- `application_packet.md`: resume focus, evidence, bullets, and answers.
- `autofill_data.json`: structured fields for browser form filling.
- `packet_data.json`: full machine-readable packet.

## Optional Local Workspace

This repository also includes a local React workspace for users who prefer to review resume lineage, job matches, tailored variants, and application status visually. The workspace is optional; the deterministic Python packet generator remains usable on its own.

```bash
npm install
npm run dev
```

The combined development command starts the Vite interface and a localhost-only Codex CLI rewrite service. Treat the uploaded resume as an immutable Master Resume, keep AI and manual edits in derived versions, and expose every change for human review. Browser-local drafts are not a cloud database, and bundled job pools are not a live job aggregation service.

## Workflow

### 1. Ingest The JD

If the user provides a URL, fetch or open it and extract the JD text. If the page is inaccessible, ask the user to paste the JD. Save the JD text in a run folder before generating materials.

### 2. Merge New Profile Context

When the candidate sends a project summary:

- Add it to `data/profile_context.md` only if it contains concrete project facts.
- Preserve original metrics from the source.
- Mark unverified items as notes outside the JSON evidence block until the candidate confirms them.
- Re-run tests after editing profile context.

### 3. Generate The Packet

Run `scripts/resume_agent.py` with the JD path, role hint, and output folder. Review:

- Role track: did it classify as `sde`, `risk_engineer`, `fde`, or `ai_agent_engineer`?
- Selected evidence: does it match the JD's top responsibilities?
- Bullets: are they factual, specific, and aligned with the role?
- Answers: are they concise and application-ready?

### 4. Tailor Resume Text

Use the packet to create a final resume version. Keep the same facts, but change emphasis:

- SDE: software ownership, APIs, production debugging, TypeScript/Python, data structures coursework, deployment.
- Risk Engineer: SQL/Python analytics, KPI monitoring, validation workflows, forecasting, risk indicators, decision support.
- FDE: customer workflow discovery, fast prototyping, full-stack implementation, deployment, ambiguous problem solving.
- AI Agent Engineer: multi-agent orchestration, LLM evaluation, model routing, tool use, human-in-the-loop systems.

Use the candidate's current most relevant experience as the primary current experience by default. Keep location and dates aligned to `data/profile_context.md`. Only foreground older experience when a JD specifically needs that history and the resume has space.

For similar JDs, reuse the closest archetype resume and make only small edits. Rewrite the PDF only when the JD materially changes the top evidence, required stack, or role family.

### 4.1 Resume PDF Layout Rules

Follow the candidate's chosen reference resume format as a layout target, not as a source of personal content:

- Keep the final PDF to exactly one page.
- Use the same clean structure: compact header, horizontal section rules, left-aligned section labels, Experience before Projects, no decorative color, and consistent indentation.
- Make Experience entries more substantive than a sparse draft. Aim for at least four visual text lines per main experience entry when the JD justifies that experience.
- For Project Experience, each selected project should normally have at least four bullet points.
- Each project bullet should be substantial enough to wrap to about two visual lines in the reference layout, while staying factual and JD-relevant.
- If the one-page constraint is tight, preserve alignment first, then remove the least relevant project or bullet group before expanding to a second page.

### 5. Fill Forms Safely

Use browser automation only after the candidate has reviewed the packet. Fill fields from `autofill_data.json`, attach the reviewed resume if requested, and stop at the final review screen. State clearly what is ready and what remains for the candidate to approve.

### 6. Track Submissions

When the candidate confirms an application was submitted, add or update a concise tracker entry with company, role, job URL, submitted date, status, archetype, resume used, fit score, follow-up date, and confirmation evidence. Keep this as the candidate's chosen tracking surface.

Tracker priority:

- Personal workflow: use the candidate's configured tracker, such as Notion, a local file, or another preferred workspace.
- China-facing users or China product mode: use Feishu Bitable as the default operational database/tracker because it is more familiar and accessible for Chinese users than Notion.
- Productized SaaS mode: store the source of truth in PostgreSQL or MySQL, then sync a clean review dashboard to Feishu Bitable if users need a spreadsheet-like workspace.

For Feishu Bitable, use one record per application and keep fields stable: company, role, job URL, status, source, submitted date, resume archetype, resume file/link, fit score, sponsorship risk, follow-up date, confirmation evidence, and notes. Treat Feishu as the review and operations surface; do not store secrets, private tokens, or sensitive identity documents in tracker rows.

## Current Evidence Base

Strong evidence already included:

- VetCite-Bench: deterministic LLM citation-trust benchmark, Python, reproducible evaluation, hallucination traps.
- Voyage AI / Voyage for Vets: example current AI product and automation work, source-backed workflows, CRM/email automation, human review, and outreach.
- Multi-Agent Outbound Pipeline: scrape, CRM, AI drafting, human review, send, write-back.
- Hermes Self-Improving Agent: Windows-native local agent runtime with DeepSeek routing.
- FitScan: React Native, Expo, TypeScript, Supabase, OCR, scoring pipeline, auth, sync.
- Husky Paths: React, Supabase, Vercel, live product, UGC, admin moderation, operations.
- AI Travel Planner: React, Tailwind, Vite, Supabase, Vercel, auth, persistence, sharing.
- Quantitative Research Internship: validation workflows, calculation tooling, strategy performance, and risk indicator monitoring.

## Verification

Run tests before using the skill for real applications:

```powershell
python -m unittest discover -s .\tests -v
```

A passing run verifies role classification, evidence selection, CLI output writing, and the human approval gate.

## Failure Modes

- If selected evidence feels generic, add the full JD and rerun with a more specific role hint.
- If the JD includes hard requirements not in the profile context, flag the gap instead of hiding it.
- If a job portal asks legally sensitive questions, stop and ask the candidate to answer directly.
- If the final screen has a submit button, stop and request exact approval before clicking.
