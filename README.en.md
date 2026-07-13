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

It is not an auto-apply bot. Browser assistance may prepare materials and fill fields, but final submission and sensitive questions always require the candidate's explicit review.

## Web Workspace

- Import searchable PDF, DOCX, or TXT resumes as an immutable Master Resume.
- Derive direction and job-specific resumes while retaining visible lineage.
- Mark changed source text in red and show complete green rewrites in a linked review panel.
- Manually add, delete, and rewrite content in derived resumes.
- Filter job discovery independently by US / China and Full-time / Internship.
- Re-score jobs from the current Master Resume and built-in or custom directions.
- Track candidate-facing states from Saved through Applied, Interview, Offer, Rejected, and Archived.
- Open the specific job application URL and retain a final human approval gate.

The website is currently a **local-first prototype**. Browser-local drafts are not a hosted database, and the bundled job pools are for product validation rather than a real-time job aggregation service.

## Run The Website

Requirements: Node.js 20+. Local AI rewriting also requires an installed and authenticated Codex CLI.

```bash
git clone https://github.com/Akw0od/job-master.git
cd job-master
npm install
npm run dev
```

`npm run dev` starts both the Vite site and the local Codex agent on `127.0.0.1:4317`. Use `npm run dev:web` for the frontend only and `npm run build` for a production build check.

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
5. Local-first does not mean risk-free; review device permissions, browser storage, and model-provider privacy terms before using real personal data.

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
|-- templates/
|-- tests/
`-- AGENTS.md
```

## Tests

```bash
python -m unittest discover -s tests -v
npm run build
```

This repository is an evolving skill and product prototype. Hosted accounts, billing, persistent cloud storage, live job connectors, and production privacy controls remain future SaaS work.

## License

[MIT](./LICENSE)
