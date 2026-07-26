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

It is not an auto-apply bot. Browser assistance currently prepares authorized field data and opens a specific application page; it does not fill or submit the form. Final submission and sensitive questions always require the candidate's explicit review.

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
- Keep candidate resume text and personal data out of web search; re-score returned roles locally from the Master Resume and built-in or custom directions.
- Preserve the complete user-pasted JD as a job snapshot and include it in job-specific rewrite requests.
- Use calibrated match confidence without an artificial minimum score.
- Add a role to Applications only after the user saves it, starts tailoring, or opens the application page.
- Track candidate-facing states from Saved through Applied, Interview, Offer, Rejected, and Archived.
- Open the specific job application URL, prepare authorized data, and retain a final human approval gate.

The website is currently a **local-first prototype**. Browser-local drafts use a versioned storage schema but are not a hosted database. Bundled roles are marked as needing re-verification; only manually refreshed results that pass direct-link checks are shown as verified. This is not a continuously running job aggregation service.

## Run The Website

Requirements: Node.js 20+. Local AI rewriting and user-triggered official-site search require an installed and authenticated Codex CLI.

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
3. No final application submission without explicit approval for that exact company and role.
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
