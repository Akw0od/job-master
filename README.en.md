# Job Master

#### A local job-search workspace powered by a Resume Application Agent Skill

[中文](./README.md) · English

![License](https://img.shields.io/badge/license-MIT-blue)
![Skill](https://img.shields.io/badge/Agent%20Skill-SKILL.md-black)
![Web](https://img.shields.io/badge/Web-React%20%2B%20Vite-149ECA)
![Human Gate](https://img.shields.io/badge/Submit-Human%20Approval%20Required-red)

Job Master combines an installable agent skill with a local visual workspace.

- **Skill:** reads a job description, selects evidence from a candidate-controlled fact base, and creates tailored application materials and structured autofill data.
- **Web workspace:** manages an immutable Master Resume, reusable direction resumes, disposable job-specific variants, job discovery, and application tracking.

It is not an auto-apply bot. Manual official-site handoff remains the default. Optional automation is limited to one exact role, one frozen application payload, and one attempt after the candidate reviews the actual site fields and grants a second company-and-role-specific authorization. Authorization expires after 10 minutes, and any page, field, resume, or receipt change invalidates it. Work authorization, sponsorship, EEOC, compensation, attachments, and CAPTCHA stay manual.

## Web Workspace

- Import searchable PDF, DOCX, or TXT resumes as an immutable Master Resume.
- Extract PDF text layers and DOCX semantic structure locally while retaining header order, section order, paragraph groups, and wrapped bullets; surface import diagnostics instead of silently substituting content.
- Derive direction and job-specific resumes while retaining visible lineage.
- Switch between a final preview and source comparison; comparison mode marks source text in red and shows complete green rewrites in a linked review panel.
- Require an explicit accept or reject decision for every AI rewrite before saving a derived version, then retain that version and lineage across refreshes.
- Export selectable-text A4 or Letter PDFs through the browser print flow so system CJK fonts remain available; the user confirms the final save location.
- Manually add, delete, and rewrite content in derived resumes.
- Filter job discovery independently by US / China and Full-time / Internship.
- Search current official role pages only when the user clicks Refresh, then validate the specific role URL before adding a result.
- Keep candidate resume text and personal data out of web search; calculate a local signal score for returned roles from the Master Resume and built-in or custom directions.
- Preserve the complete user-pasted JD as a job snapshot and include it in job-specific rewrite requests.
- Use a 0–100 local signal score only to sort the current list, never as an admission probability, eligibility determination, or ATS score. Its visible breakdown shows actual target-direction, resume-keyword, confirmed-fact, and custom-direction contributions alongside evidence labels.
- English technical terms use word-boundary matching (`AI` is never inferred from `email`), while Chinese terms can use safe containment. When the algorithm version changes, old signal scores and derived inputs are cleared to Needs refresh rather than displayed as current.
- Add a role to Applications only after the user saves it, starts tailoring, or opens the application page.
- Track candidate-facing states from Saved through Applied, Interview, Offer, Rejected, and Archived.
- Use Today to prioritize up to five interview, due follow-up, role-verification, resume-tailoring, or application-review actions. Follow-up creates a copyable draft but never sends a message.
- Keep interview scheduling, prep, and debrief notes beside an evidence-led outline built only from the submitted resume and current role. Show observed discovery-to-application conversions with explicit small-sample labels.
- Reuse only candidate-confirmed non-sensitive answers from the browser-local answer library. Work authorization, visa, identity, and compensation answers are never stored.
- Before each opening of a specific job application URL, re-review the local field packet for that exact role and resume version. Only individually authorized contact details, explicit education sections, and explicit experience or project sections can be copied to the system clipboard.
- Manual mode never auto-fills or submits. For Greenhouse, Ashby, Lever, and safely identified official company sites, optional modes can fill and stop or submit once after actual page fields are reviewed. CAPTCHA, changed pages, missing required fields, attachments, sensitive fields, and ambiguous submit controls stop execution.
- A role is marked Applied only after the provider presents verifiable submission evidence. Browser-local audit history retains bounded IDs, result codes, and fingerprints rather than contact data, resume text, JD text, answers, or URLs.
- Manual official-site submissions also require the saved job resume actually used, the submission time, and one provider-facing signal: a success page, confirmation email, ATS account record, or confirmation ID. Only the evidence type and record fingerprint are retained, and legacy application records can be backfilled from the role workspace.

The website is currently a **local-first prototype**. Browser-local drafts use a versioned storage schema but are not a hosted database. Bundled roles are marked as needing re-verification; only manually refreshed results that pass direct-link checks are shown as verified. This is not a continuously running job aggregation service.

## Run The Website

Requirements: Node.js 20+. Local AI rewriting and user-triggered official-site search require an installed and authenticated Codex CLI. Optional official-form automation also requires Google Chrome installed locally.

```bash
git clone https://github.com/Akw0od/job-master.git
cd job-master
npm install
npm run dev
```

`npm run dev` starts both the Vite site and a localhost-only proxy on `127.0.0.1:4317`. For an AI rewrite, the proxy forwards the explicitly reviewed payload to the model configured by Codex CLI; it is not local inference. Use `npm run dev:web` for the frontend only and `npm run check` for the full lint, test, and build check. Run `npm run audit:prod` for the production dependency audit.

## Install The Skill

Point a `SKILL.md`-compatible agent at this repository, or install it manually for Codex:

```bash
git clone https://github.com/Akw0od/job-master.git
cp -R job-master ~/.codex/skills/resume-application-agent
```

Restart Codex so the skill registry can load [SKILL.md](./SKILL.md).

## Generate An Application Packet

The checked-in `data/profile_context.md` contains public-safe example data. Replace it with your own verified facts before real use.

```bash
python scripts/resume_agent.py \
  --jd examples/amazon_sde_jd.txt \
  --role "Amazon SDE" \
  --out runs/amazon-sde
```

Outputs:

- `application_packet.md`
- `autofill_data.json`
- `packet_data.json`

## Safety Boundaries

1. Candidate facts remain user-owned and unverified claims must stay visibly unconfirmed.
2. The Master Resume is immutable; AI and manual edits create reviewable derived versions.
3. No background or bulk submission. One-time auto-submit requires the exact company and role, a reviewed frozen payload, and a fresh authorization that expires after 10 minutes.
4. Work authorization, sponsorship, EEOC, compensation, and other sensitive fields must never be guessed.
5. Every AI rewrite shows the exact outbound data first: the selected full resume, an optional full job description, market, language, target role, and the user's instruction. The full resume may contain personal information such as a name, email address, or phone number, and that information is sent with the resume text. It does not additionally send local profile fields used for application assist, application tracking, other roles, or all browser storage. Official-site job search never sends a resume.
6. Remembered AI-rewrite consent is browser-local and stores only a consent version and timestamp; it can be revoked from Local data. Processing location and retention are governed by the configured model provider, while local temporary files are deleted after the request.

## Repository Layout

```text
.
|-- SKILL.md
|-- data/
|-- examples/
|-- scripts/resume_agent.py
|-- scripts/dev.mjs
|-- local-agent/
|-- src/
|-- test/
|-- templates/
|-- tests/
`-- AGENTS.md
```

## Tests

```bash
npm run check
```

This repository is an evolving skill and product prototype. Hosted accounts, persistent cloud storage, continuously running job connectors, and production privacy controls remain future SaaS work.

## License

[MIT](./LICENSE)
