# Resume Application Agent Skill

English · [中文](./README.md)

A Codex skill for tailoring a candidate resume to a job description, generating an application packet, and preparing structured autofill data while keeping a human approval gate before submission.

The repository version is public-safe: `data/profile_context.md` contains example candidate data. Replace it with your own verified resume facts before using the skill for real applications.

## What It Does

- Classifies a JD into role archetypes such as SDE, Risk Engineer, Forward Deployed Engineer, or AI / LLM Agent Engineer.
- Selects the strongest evidence from a structured candidate profile.
- Generates an application packet with tailored summary, selected evidence, bullet direction, and short application answers.
- Writes `autofill_data.json` for browser-assisted form filling.
- Enforces a final human approval gate before submission.
- Encourages one-page resume reuse by archetype when JDs are materially similar.
- Preserves the candidate's reference resume layout: horizontal rules, aligned sections, no decorative color, Experience before Projects, and denser experience/project bullets that still fit on one page.

## Repository Layout

```text
.
|-- SKILL.md
|-- data/
|   |-- job_archetypes.json
|   `-- profile_context.md
|-- examples/
|-- scripts/
|   `-- resume_agent.py
|-- templates/
`-- tests/
```

## Install As A Codex Skill

Copy this folder into your Codex skills directory:

```powershell
Copy-Item -Recurse . "$env:USERPROFILE\.codex\skills\resume-application-agent"
```

Then restart Codex so the skill registry reloads.

## Configure Your Profile

Edit `data/profile_context.md`. Keep the fenced JSON block, and replace the example values with verified facts:

- candidate contact links
- education
- application defaults
- experience and project evidence
- tags and bullets used for matching

Do not add unverified employers, dates, metrics, degrees, work authorization, or compensation details.

## Generate An Application Packet

```powershell
python .\scripts\resume_agent.py `
  --jd .\examples\amazon_sde_jd.txt `
  --role "Amazon SDE" `
  --out .\runs\amazon-sde
```

Outputs:

- `application_packet.md`
- `autofill_data.json`
- `packet_data.json`

## Run Tests

```powershell
python -m unittest discover -s .\tests -v
```

The test suite checks role classification, evidence selection, output writing, and the no-auto-submit approval gate.

## Safety Model

This skill can prepare material and assist with form filling, but it should not submit applications automatically. Stop at the final review screen and require explicit approval for the exact company, role, and application.

For legally sensitive fields such as work authorization, sponsorship, disability, veteran status, or demographic self-identification, ask the candidate directly.

## License

MIT
