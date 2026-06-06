import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STOPWORDS = {
    "and",
    "or",
    "the",
    "a",
    "an",
    "to",
    "of",
    "in",
    "with",
    "for",
    "on",
    "as",
    "by",
    "from",
    "into",
    "role",
    "requirements",
    "working",
}


def _normalize(text):
    return re.sub(r"\s+", " ", text.lower()).strip()


def _tokens(text):
    words = re.findall(r"[a-z0-9][a-z0-9+#.-]*", _normalize(text))
    return {word for word in words if len(word) > 2 and word not in STOPWORDS}


def _json_block(markdown_text):
    match = re.search(r"```json\s*(.*?)\s*```", markdown_text, flags=re.S)
    if not match:
        raise ValueError("profile_context.md must contain a fenced json block")
    return match.group(1)


def load_profile(path=None):
    path = Path(path or ROOT / "data" / "profile_context.md")
    return json.loads(_json_block(path.read_text(encoding="utf-8")))


def load_archetypes(path=None):
    path = Path(path or ROOT / "data" / "job_archetypes.json")
    return json.loads(path.read_text(encoding="utf-8"))


def classify_role(jd_text, archetypes, role_hint=""):
    haystack = _normalize(f"{role_hint} {jd_text}")
    scores = {}
    for key, archetype in archetypes.items():
        score = 0
        if key.replace("_", " ") in haystack:
            score += 12
        for keyword in archetype["keywords"]:
            keyword_norm = _normalize(keyword)
            if keyword_norm in haystack:
                score += 3 if " " in keyword_norm else 1
        scores[key] = score
    return max(scores, key=scores.get)


def _evidence_text(item):
    parts = [
        item.get("name", ""),
        item.get("summary", ""),
        " ".join(item.get("tags", [])),
        " ".join(item.get("bullets", [])),
    ]
    return " ".join(parts)


def select_evidence(jd_text, profile, archetype, limit=4):
    jd_tokens = _tokens(jd_text)
    preferred = set(archetype.get("preferred_evidence", []))
    scored = []
    for item in profile["evidence"]:
        evidence_tokens = _tokens(_evidence_text(item))
        overlap = jd_tokens & evidence_tokens
        score = len(overlap)
        if item["name"] in preferred:
            score += 8
        if item.get("type") == "experience" and "experience" in jd_tokens:
            score += 2
        scored.append((score, item["name"], sorted(overlap), item))
    scored.sort(key=lambda row: (-row[0], row[1]))
    return [
        {
            "name": item["name"],
            "type": item.get("type", "project"),
            "organization": item.get("organization"),
            "dates": item.get("dates"),
            "score": score,
            "matched_terms": overlap[:12],
            "summary": item["summary"],
            "bullets": item["bullets"][:3],
        }
        for score, _name, overlap, item in scored[:limit]
    ]


def _tailored_summary(role_track, role_hint, profile, selected):
    archetype_label = role_hint.strip() or role_track.replace("_", " ").title()
    first = selected[0]["name"] if selected else "production projects"
    second = selected[1]["name"] if len(selected) > 1 else "data and product work"
    return (
        f"{profile['candidate']['name']} is a University of Washington Economics major "
        f"with a Data Science and Informatics minor, targeting {archetype_label} roles. "
        f"Most relevant evidence: {first}, {second}, plus hands-on Python, TypeScript, SQL, "
        "Supabase, Vercel, and AI-assisted product shipping."
    )


def _rewrite_bullet(bullet, role_track):
    prefixes = {
        "sde": "Software impact",
        "risk_engineer": "Risk and data impact",
        "fde": "Customer-facing build impact",
        "ai_agent_engineer": "Agent engineering impact",
    }
    prefix = prefixes.get(role_track, "Relevant impact")
    return f"{prefix}: {bullet}"


def build_packet(jd_text, role_hint, profile, archetypes):
    role_track = classify_role(jd_text, archetypes, role_hint)
    archetype = archetypes[role_track]
    selected = select_evidence(jd_text, profile, archetype)
    candidate = profile["candidate"]
    tailored_bullets = []
    for item in selected:
        for bullet in item["bullets"][:2]:
            tailored_bullets.append(_rewrite_bullet(bullet, role_track))
    packet = {
        "candidate": candidate,
        "role_hint": role_hint,
        "role_track": role_track,
        "role_label": archetype["label"],
        "tailored_summary": _tailored_summary(role_track, role_hint, profile, selected),
        "selected_evidence": selected,
        "tailored_resume_bullets": tailored_bullets[:8],
        "education": profile["education"],
        "application_answers": {
            "why_this_role": (
                "This role matches my pattern of turning ambiguous technical or data problems "
                "into shipped systems, with strong evidence from the selected projects and internships."
            ),
            "strongest_match": selected[0]["summary"] if selected else "",
            "risk_note": (
                "All claims should be reviewed against the original resume and JD before use. "
                "Do not submit this application until Ao explicitly approves the final packet."
            ),
        },
        "autofill": {
            "candidate": candidate,
            "role": {
                "hint": role_hint,
                "track": role_track,
                "label": archetype["label"],
            },
            "tracking": {
                "application_tracker": profile.get("application_defaults", {}).get("application_tracker", ""),
                "tracker_options": profile.get("application_defaults", {}).get("tracker_options", {}),
            },
            "submission": {
                "approved_to_submit": False,
                "approval_required_from": candidate["name"],
                "instruction": "Fill fields only; stop at final review screen.",
            },
        },
    }
    return packet


def render_packet(packet):
    lines = [
        f"# Application Packet - {packet['role_hint'] or packet['role_label']}",
        "",
        "## Candidate",
        f"- Name: {packet['candidate']['name']}",
        f"- Location: {packet['candidate']['location']}",
        f"- Email: {packet['candidate']['email']}",
        f"- Website: {packet['candidate']['website']}",
        f"- LinkedIn: {packet['candidate']['linkedin']}",
        "",
        "## Role Focus",
        f"- Track: {packet['role_track']}",
        f"- Label: {packet['role_label']}",
        "",
        "## Tailored Summary",
        packet["tailored_summary"],
        "",
        "## Selected Evidence",
    ]
    for item in packet["selected_evidence"]:
        lines.append(f"### {item['name']}")
        if item.get("organization"):
            lines.append(f"- Organization: {item['organization']}")
        if item.get("dates"):
            lines.append(f"- Dates: {item['dates']}")
        lines.append(f"- Match terms: {', '.join(item['matched_terms']) or 'role-prioritized'}")
        lines.append(f"- Summary: {item['summary']}")
        for bullet in item["bullets"]:
            lines.append(f"- {bullet}")
        lines.append("")
    lines.extend(
        [
            "## Tailored Resume Bullets",
            *[f"- {bullet}" for bullet in packet["tailored_resume_bullets"]],
            "",
            "## Application Answers",
            f"- Why this role: {packet['application_answers']['why_this_role']}",
            f"- Strongest match: {packet['application_answers']['strongest_match']}",
            "",
            "## Human Approval Gate",
            "Do not submit this application until Ao reviews the tailored packet, confirms the facts, and approves this exact application.",
            "Browser automation may fill fields and stop at the final review screen.",
        ]
    )
    return "\n".join(lines) + "\n"


def write_outputs(packet, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "application_packet.md").write_text(render_packet(packet), encoding="utf-8")
    (out_dir / "autofill_data.json").write_text(
        json.dumps(packet["autofill"], indent=2), encoding="utf-8"
    )
    (out_dir / "packet_data.json").write_text(json.dumps(packet, indent=2), encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build a tailored resume application packet from a JD.")
    parser.add_argument("--jd", required=True, help="Path to a text file containing the job description.")
    parser.add_argument("--role", default="", help="Optional role hint, such as Amazon SDE or Risk Engineer.")
    parser.add_argument("--profile", default=str(ROOT / "data" / "profile_context.md"))
    parser.add_argument("--archetypes", default=str(ROOT / "data" / "job_archetypes.json"))
    parser.add_argument("--out", default=str(ROOT / "runs" / "latest"))
    args = parser.parse_args(argv)

    jd_text = Path(args.jd).read_text(encoding="utf-8")
    profile = load_profile(args.profile)
    archetypes = load_archetypes(args.archetypes)
    packet = build_packet(jd_text, args.role, profile, archetypes)
    write_outputs(packet, args.out)
    print(f"Wrote packet to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
