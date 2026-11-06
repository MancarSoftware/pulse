import { afterAll, expect, it, vi } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  verifyDatabaseBackup,
} from "../../scripts/lib/database-backup";

afterAll(() => vi.unstubAllEnvs());
it("round-trips an encrypted database, preserves records and triggers, rejects tampering and nonempty targets", async () => {
  const sourceUrl = process.env.DATABASE_URL!;
  const target = new URL(sourceUrl);
  const databaseName = `gymora_${crypto.randomUUID().replaceAll("-", "")}_restore_test`;
  target.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: sourceUrl });
  await admin.connect();
  vi.stubEnv("BACKUP_ENCRYPTION_KEY", "b".repeat(64));
  if (process.platform === "win32" && !process.env.POSTGRES_BIN_DIR)
    vi.stubEnv("POSTGRES_BIN_DIR", "C:/Program Files/PostgreSQL/18/bin");
  const folder = join(".local", "backup-tests", crypto.randomUUID());
  await mkdir(folder, { recursive: true });
  const filename = await createDatabaseBackup(sourceUrl, folder);
  await verifyDatabaseBackup(filename);
  const encrypted = await readFile(filename);
  expect(encrypted.subarray(0, 8).toString()).toBe("GYMORA1\n");
  expect(encrypted.includes(Buffer.from("CREATE TABLE"))).toBe(false);
  vi.stubEnv("BACKUP_ENCRYPTION_KEY", "c".repeat(64));
  await expect(verifyDatabaseBackup(filename)).rejects.toBeDefined();
  vi.stubEnv("BACKUP_ENCRYPTION_KEY", "b".repeat(64));
  encrypted[encrypted.length - 1] ^= 1;
  const corrupt = join(folder, "corrupt.gymora");
  await writeFile(corrupt, encrypted);
  await expect(verifyDatabaseBackup(corrupt)).rejects.toBeDefined();
  await expect(
    restoreDatabaseBackup(filename, sourceUrl, sourceUrl),
  ).rejects.toThrow("base distinta");
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  try {
    await expect(
      restoreDatabaseBackup(corrupt, target.href, sourceUrl),
    ).rejects.toBeDefined();
    await restoreDatabaseBackup(filename, target.href, sourceUrl);
    const restored = new Client({ connectionString: target.href });
    await restored.connect();
    try {
      for (const table of [
        "User",
        "Organization",
        "Member",
        "Membership",
        "LedgerEntry",
        "WhatsAppMessage",
      ]) {
        const query = `SELECT count(*)::int AS total FROM "${table}"`;
        expect((await restored.query(query)).rows).toEqual(
          (await admin.query(query)).rows,
        );
      }
      const triggers =
        "SELECT count(*)::int AS total FROM pg_trigger WHERE NOT tgisinternal";
      expect((await restored.query(triggers)).rows).toEqual(
        (await admin.query(triggers)).rows,
      );
    } finally {
      await restored.end();
    }
    await expect(
      restoreDatabaseBackup(filename, target.href, sourceUrl),
    ).rejects.toThrow("vacía");
  } finally {
    // Only this freshly-created, randomly-named test database is removed.
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.end();
  }
}, 60000);
