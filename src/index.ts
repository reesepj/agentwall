import { loadConfig } from "./config";
import { buildServer } from "./server";

async function main() {
  const config = loadConfig();
  const { app } = await buildServer(config);

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Agentwall running on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
