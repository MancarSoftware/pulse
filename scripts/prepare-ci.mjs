import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const database = process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith("_test"))
  throw new Error("CI requires dedicated _test database");
const environment = `DATABASE_URL=${database}\nBETTER_AUTH_SECRET=${randomBytes(48).toString("hex")}\nBETTER_AUTH_URL=http://localhost:3000\n`;
writeFileSync(".env", environment, { mode: 0o600 });
writeFileSync(".env.test", environment, { mode: 0o600 });
