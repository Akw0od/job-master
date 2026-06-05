import json
import tempfile
import unittest
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


class ResumeAgentTests(unittest.TestCase):
    def setUp(self):
        import resume_agent

        self.resume_agent = resume_agent
        self.profile = resume_agent.load_profile(ROOT / "data" / "profile_context.md")
        self.archetypes = resume_agent.load_archetypes(ROOT / "data" / "job_archetypes.json")

    def test_sde_jd_selects_software_and_ai_evidence(self):
        jd = """
        Amazon SDE role building scalable distributed services. Requirements:
        Python or TypeScript, data structures, APIs, production ownership,
        debugging, testing, cloud deployment, and customer-focused software.
        """

        packet = self.resume_agent.build_packet(jd, "Amazon SDE", self.profile, self.archetypes)

        self.assertEqual(packet["role_track"], "sde")
        selected = " ".join(item["name"] for item in packet["selected_evidence"])
        self.assertIn("VetCite-Bench", selected)
        self.assertIn("Voyage AI / Voyage for Vets", selected)
        self.assertIn("FitScan", selected)

    def test_risk_engineer_jd_selects_analytics_and_risk_evidence(self):
        jd = """
        Risk Engineer role focused on SQL, Python, risk indicators, monitoring,
        operational data, forecasting, dashboards, validation workflows, controls,
        and translating data into practical decision support.
        """

        packet = self.resume_agent.build_packet(jd, "Risk Engineer", self.profile, self.archetypes)

        self.assertEqual(packet["role_track"], "risk_engineer")
        selected = " ".join(item["name"] for item in packet["selected_evidence"])
        self.assertIn("Voyage AI / Voyage for Vets", selected)
        self.assertIn("Quantitative Research Internship", selected)
        self.assertIn("VetCite-Bench", selected)

    def test_fde_jd_selects_customer_facing_full_stack_evidence(self):
        jd = """
        Forward Deployed Engineer working directly with customers to understand
        workflows, prototype quickly, ship full-stack solutions, integrate APIs,
        deploy to production, and turn ambiguous problems into working products.
        """

        packet = self.resume_agent.build_packet(jd, "FDE", self.profile, self.archetypes)

        self.assertEqual(packet["role_track"], "fde")
        selected = " ".join(item["name"] for item in packet["selected_evidence"])
        self.assertIn("Voyage AI / Voyage for Vets", selected)
        self.assertIn("Husky Paths", selected)
        self.assertIn("Multi-Agent Outbound Pipeline", selected)

    def test_ai_new_grad_jd_selects_ai_evaluation_evidence(self):
        jd = """
        New Grad AI Engineer building AI-powered product features with LLMs,
        embeddings, retrieval, model integration, evals, human-in-the-loop
        testing, guardrails, latency, cost, reliability, TypeScript, React,
        Python, Node.js, Postgres, and production iteration.
        """

        packet = self.resume_agent.build_packet(jd, "AI Engineer", self.profile, self.archetypes)

        self.assertEqual(packet["role_track"], "ai_agent_engineer")
        selected = " ".join(item["name"] for item in packet["selected_evidence"])
        self.assertIn("VetCite-Bench", selected)
        self.assertIn("Voyage AI / Voyage for Vets", selected)
        self.assertIn("Multi-Agent Outbound Pipeline", selected)

    def test_rendered_packet_has_human_approval_gate_and_no_auto_submit(self):
        jd = "Software engineer role with Python, TypeScript, APIs, and production debugging."
        packet = self.resume_agent.build_packet(jd, "SDE", self.profile, self.archetypes)
        rendered = self.resume_agent.render_packet(packet)

        self.assertIn("Human Approval Gate", rendered)
        self.assertIn("Do not submit", rendered)
        self.assertNotIn("auto-submit", rendered.lower())
        self.assertNotIn("submit without approval", rendered.lower())

    def test_cli_writes_markdown_and_json_outputs(self):
        jd = "Forward deployed engineer: customer workflows, full-stack prototypes, APIs, production."
        with tempfile.TemporaryDirectory() as tmp:
            jd_path = Path(tmp) / "jd.txt"
            out_dir = Path(tmp) / "out"
            jd_path.write_text(jd, encoding="utf-8")

            exit_code = self.resume_agent.main([
                "--jd",
                str(jd_path),
                "--role",
                "FDE",
                "--out",
                str(out_dir),
            ])

            self.assertEqual(exit_code, 0)
            self.assertTrue((out_dir / "application_packet.md").exists())
            self.assertTrue((out_dir / "autofill_data.json").exists())
            autofill = json.loads((out_dir / "autofill_data.json").read_text(encoding="utf-8"))
            self.assertEqual(autofill["candidate"]["name"], "Example Candidate")
            self.assertFalse(autofill["submission"]["approved_to_submit"])


if __name__ == "__main__":
    unittest.main()
