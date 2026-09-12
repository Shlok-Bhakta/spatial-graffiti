import { createApp } from "./app";
import { openDb } from "./db";

const port = parsePort(process.env.PORT);
const dbPath = process.env.DB_PATH || "./data/graffiti.sqlite";
const db = openDb(dbPath);

Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch: createApp(db),
});

console.log(`listening on 0.0.0.0:${port} db=${dbPath}`);

function parsePort(raw: string | undefined): number {
  if (raw == null || raw === "") {
    return 3000;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`invalid PORT: ${raw}`);
    process.exit(1);
  }
  return port;
}
