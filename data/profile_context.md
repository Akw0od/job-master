# Candidate Profile Context

This file is the factual evidence base for the resume application agent.

The checked-in version is intentionally a public-safe example. Replace the JSON
with your own verified resume facts before using the skill for real applications.
Do not add facts that the candidate has not confirmed.

```json
{
  "candidate": {
    "name": "Example Candidate",
    "location": "Seattle, WA",
    "email": "candidate@example.com",
    "phone": "000-000-0000",
    "website": "example.com",
    "linkedin": "https://www.linkedin.com/in/example-candidate/",
    "github": "https://github.com/example"
  },
  "application_defaults": {
    "graduation_date_exact": "Feb 2026",
    "graduation_date_dropdown_rule": "If the exact graduation date option is unavailable, choose the closest available new-grad option only when the candidate has confirmed it.",
    "github_profile": "https://github.com/example",
    "target_start_preference": "Use the role's preferred new-grad start window when the candidate has not specified another date.",
    "resume_format": "One-page PDF by default, following the candidate's chosen reference resume layout: compact header, horizontal rules, Experience before Projects, aligned left edges, no decorative color, and consistent indentation.",
    "resume_density_rule": "Use substantive Experience entries and Project Experience sections: aim for at least four visual text lines for a main experience entry, at least four bullets per selected project, and bullets that usually wrap to about two visual lines while keeping the PDF on one page.",
    "resume_reuse_rule": "Reuse the closest role archetype resume when the JD is materially similar; rewrite only when the JD changes the evidence priority.",
    "application_tracker": "After every confirmed submission, update the candidate's chosen tracker instead of creating redundant spreadsheets.",
    "experience_preference": "Use the candidate's current most relevant experience as the primary experience in tailored resumes."
  },
  "education": {
    "school": "Example University",
    "degree": "B.A. Economics, Minor in Data Science & Informatics",
    "graduation": "Feb 2026",
    "honors": "Dean's List",
    "coursework": [
      "Data Structures",
      "Data Programming",
      "Econometrics",
      "Computational Finance"
    ]
  },
  "evidence": [
    {
      "name": "VetCite-Bench",
      "type": "project",
      "tags": ["python", "llm evaluation", "benchmark", "testing", "debugging", "reproducible pipeline", "risk", "validation", "citation trust"],
      "summary": "Built a deterministic LLM citation-trust benchmark scoring clinical AI questions across dose, consensus, and trap categories without LLM-as-judge primary metrics.",
      "bullets": [
        "Designed and built a deterministic benchmark measuring clinical AI citation trust across multiple scoring dimensions.",
        "Benchmarked production systems with trap cases to expose fabricated citations and unsupported claims.",
        "Built a reproducible scoring harness with logged API calls, cached inputs, written rationales, and stable re-run behavior.",
        "Debugged and stabilized the evaluation harness until mock runs passed end to end."
      ]
    },
    {
      "name": "Multi-Agent Outbound Pipeline",
      "type": "project",
      "tags": ["agent orchestration", "automation", "llm drafting", "ai drafting", "human-in-the-loop", "notion api", "crm", "human review", "workflow", "customer", "operations", "rate limits"],
      "summary": "Orchestrated multiple agents into a lead scraping, CRM enrichment, AI drafting, human review, automated send, and status write-back flow.",
      "bullets": [
        "Orchestrated specialized agents into one workflow: scrape, structure into CRM, draft personalized messages, human review, send, and write-back.",
        "Integrated structured CRM records as the source of truth for outbound workflows.",
        "Designed human review checkpoints and throttling safeguards to respect platform constraints.",
        "Launched an initial outreach cohort and iterated messaging based on early responses."
      ]
    },
    {
      "name": "Hermes Self-Improving Agent",
      "type": "project",
      "tags": ["agent", "windows", "runtime", "model routing", "automation", "scheduled"],
      "summary": "Deployed a local self-improving agent runtime for daily drafting automation.",
      "bullets": [
        "Deployed an agent runtime locally with direct model API integration.",
        "Configured a scheduled runtime that supports daily drafting workflows.",
        "Tuned model routing and local configuration for a reliable, low-cost agent loop."
      ]
    },
    {
      "name": "FitScan",
      "type": "project",
      "tags": ["react native", "expo", "typescript", "supabase", "ocr", "api", "mobile", "product", "full-stack", "rules engine", "model routing"],
      "summary": "Built an AI nutrition scanning app with barcode scan, keyword search, OCR fallback, personalized scoring, alternatives, diary, and weekly review.",
      "bullets": [
        "Shipped a full mobile product workflow: barcode scan, keyword search, OCR fallback, personalized scoring, alternatives, food diary, and weekly review.",
        "Designed a hybrid rules and AI decision pipeline using product data, scoring logic, and OCR fallback for fast, explainable output.",
        "Implemented auth, cloud sync, local caching, and cross-device history and favorites migration.",
        "Improved recognition speed and stability with image compression, request optimization, smaller-model routing, retries, and clearer error handling."
      ]
    },
    {
      "name": "Husky Paths",
      "type": "project",
      "tags": ["react", "supabase", "auth", "vercel", "full-stack", "product", "ugc", "admin", "moderation", "deployment", "customer"],
      "summary": "Built and operated a live alumni/community map with public submissions, admin moderation, approval workflow, custom domain, and outreach loop.",
      "bullets": [
        "Shipped a live full-stack product from data model to interactive map, user submissions, and admin moderation.",
        "Modeled the schema and wired auth for the moderation back office.",
        "Deployed to a custom domain with a reproducible release script.",
        "Operated the product after launch by reviewing submissions, running outreach, and shipping iterations."
      ]
    },
    {
      "name": "AI Travel Planner",
      "type": "project",
      "tags": ["react", "tailwind", "vite", "supabase", "vercel", "full-stack", "ai", "auth", "deployment", "customer", "prototype"],
      "summary": "Built and deployed an AI itinerary web app with real-time responses, auth, trip persistence, shareable links, and responsive filters.",
      "bullets": [
        "Built and deployed an AI travel planning app that generates multi-day itineraries with real-time responses.",
        "Implemented authentication, trip persistence, and shareable links for a complete generate, save, and share flow.",
        "Designed responsive search and filtering by destination, budget, and travel style.",
        "Used AI-assisted development tools to compress development cycles while maintaining production-oriented architecture."
      ]
    },
    {
      "name": "Voyage AI / Voyage for Vets",
      "type": "experience",
      "organization": "Example AI Product",
      "role": "AI Product & Automation Builder",
      "dates": "2026 - Present",
      "location": "Seattle, WA",
      "tags": ["ai product", "automation", "notion", "gmail", "agent orchestration", "clinical ai", "source-backed reasoning", "human review", "outreach", "evaluation", "workflow", "customer"],
      "summary": "Built product, evaluation, and workflow systems for a source-backed AI product focused on trust, cognitive load, hallucination control, and expert oversight.",
      "bullets": [
        "Built product and workflow systems for a source-backed AI product focused on trust, cognitive load, hallucination control, and expert oversight.",
        "Designed an outbound operating system that turns public professional sources into structured CRM records, personalized outreach drafts, review checkpoints, and status write-back.",
        "Created evaluation and positioning workflows around curated knowledge and source-backed reasoning rather than unsupported answer generation.",
        "Coordinated outreach workflows across CRM, email, and agent-assisted drafting while preserving human review before sending or marking contacts."
      ]
    },
    {
      "name": "Quantitative Research Internship",
      "type": "experience",
      "organization": "Example Investment Management Company",
      "dates": "Jul 2025 - Sep 2025",
      "location": "Seattle, WA",
      "tags": ["quantitative", "risk", "validation", "data processing", "monitoring", "strategy", "decision support", "python", "analytics"],
      "summary": "Built recurring data processing and validation workflows, packaged calculation logic, and monitored strategy performance and key risk indicators.",
      "bullets": [
        "Built and maintained recurring data processing and validation workflows, improving dataset reliability and reducing manual cleanup overhead.",
        "Contributed reusable analytical tooling and packaged calculation logic into maintainable internal workflows.",
        "Monitored strategy performance and key risk indicators, translating data into practical decision support under real-world constraints."
      ]
    }
  ]
}
```
