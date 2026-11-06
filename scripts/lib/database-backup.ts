import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import { Client } from "pg";

const magic = Buffer.from("GYMORA1\n");
const headerSize = magic.length + 12 + 16;
function key() {
  const value = process.env.BACKUP_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new Error(
      "Configura BACKUP_ENCRYPTION_KEY con 32 bytes aleatorios en hexadecimal.",
    );
  return Buffer.from(value, "hex");
}
function postgresProcess(
  tool: "pg_dump" | "pg_restore",
  databaseUrl: string,
  args: string[],
) {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgresql:")
    throw new Error("Se requiere PostgreSQL.");
  // Passwords stay out of command-line arguments and diagnostic output.
  const command = process.env.POSTGRES_BIN_DIR
    ? join(
        process.env.POSTGRES_BIN_DIR,
        `${tool}${process.platform === "win32" ? ".exe" : ""}`,
      )
    : tool;
  const child = spawn(command, args, {
    windowsHide: true,
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      ...(url.searchParams.has("sslmode")
        ? { PGSSLMODE: url.searchParams.get("sslmode")! }
        : {}),
      PGCONNECT_TIMEOUT: "15",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // Never print provider output: it can contain connection details or row data.
  child.stderr.resume();
  const done = new Promise<void>((yes, no) => {
    child.on("error", () =>
      no(new Error(`${tool} no pudo iniciarse. Revisa POSTGRES_BIN_DIR.`)),
    );
    child.on("close", (code) =>
      code === 0
        ? yes()
        : no(
            new Error(
              `${tool} falló; revisa permisos, versión y conexión a PostgreSQL.`,
            ),
          ),
    );
  });
  return { child, done };
}
export async function createDatabaseBackup(
  databaseUrl: string,
  directory: string,
) {
  const secret = key();
  const folder = resolve(directory);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const filename = join(
    folder,
    `gymora-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}.gymora`,
  );
  const partial = `${filename}.partial`;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  cipher.setAAD(magic);
  const handle = await open(partial, "wx", 0o600);
  await handle.write(Buffer.concat([magic, iv, Buffer.alloc(16)]));
  await handle.close();
  const { child, done } = postgresProcess("pg_dump", databaseUrl, [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--no-password",
  ]);
  try {
    await Promise.all([
      pipeline(
        child.stdout,
        cipher,
        createWriteStream(partial, { flags: "a" }),
      ),
      done,
    ]);
    const file = await open(partial, "r+");
    try {
      await file.write(cipher.getAuthTag(), 0, 16, magic.length + 12);
      await file.sync();
    } finally {
      await file.close();
    }
    await verifyDatabaseBackup(partial);
    await rename(partial, filename);
    return filename;
  } catch {
    child.kill();
    await rm(partial, { force: true });
    throw new Error(
      "No se completó el respaldo. No se publicó un archivo incompleto.",
    );
  }
}
async function decryptedStream(filename: string) {
  const handle = await open(filename, "r");
  const header = Buffer.alloc(headerSize);
  try {
    await handle.read(header, 0, headerSize, 0);
  } finally {
    await handle.close();
  }
  if (
    !(await stat(filename)).isFile() ||
    !header.subarray(0, magic.length).equals(magic)
  )
    throw new Error("Formato de respaldo inválido.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    header.subarray(magic.length, magic.length + 12),
  );
  decipher.setAAD(magic);
  decipher.setAuthTag(header.subarray(magic.length + 12));
  return { input: createReadStream(filename, { start: headerSize }), decipher };
}
export async function verifyDatabaseBackup(filename: string) {
  const { input, decipher } = await decryptedStream(filename);
  await pipeline(
    input,
    decipher,
    new Writable({
      write(_chunk, _encoding, next) {
        next();
      },
    }),
  );
}
export async function restoreDatabaseBackup(
  filename: string,
  targetUrl: string,
  sourceUrl: string,
) {
  const target = new URL(targetUrl);
  const source = new URL(sourceUrl);
  if (
    !target.pathname.endsWith("_restore_test") ||
    (target.pathname === source.pathname && target.host === source.host)
  )
    throw new Error(
      "La restauración solo admite una base distinta, vacía y terminada en _restore_test.",
    );
  // Authenticate the entire file BEFORE letting pg_restore execute anything.
  await verifyDatabaseBackup(filename);
  const connection = new Client({ connectionString: targetUrl });
  await connection.connect();
  try {
    const result = await connection.query(
      "SELECT count(*)::int AS total FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')",
    );
    if (result.rows[0].total !== 0)
      throw new Error(
        "La base de restauración debe estar vacía. No se sobrescriben datos.",
      );
  } finally {
    await connection.end();
  }
  const { input, decipher } = await decryptedStream(filename);
  const { child, done } = postgresProcess("pg_restore", targetUrl, [
    "--dbname",
    decodeURIComponent(target.pathname.slice(1)),
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    "--single-transaction",
    "--no-password",
  ]);
  child.stdout.resume();
  try {
    await Promise.all([pipeline(input, decipher, child.stdin), done]);
  } catch {
    child.kill();
    throw new Error(
      "La restauración no pudo completarse. Revisa la base de prueba.",
    );
  }
}
