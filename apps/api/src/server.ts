import { buildApp } from "./app";

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 8080, host: process.env.API_HOST ?? "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();