import { createServer as createViteServer } from "vite";
import { startLocalAgentServer } from "../local-agent/server.mjs";

const agentPort = Number(process.env.JOB_MASTER_AGENT_PORT || 4317);
const agentServer = await startLocalAgentServer({ port: agentPort });
const viteServer = await createViteServer({
  server: {
    host: "127.0.0.1",
  },
});

await viteServer.listen();
viteServer.printUrls();
process.stdout.write(`Local agent: http://127.0.0.1:${agentPort}\n`);

async function close() {
  await viteServer.close();
  await new Promise((resolve) => agentServer.close(resolve));
  process.exit(0);
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
