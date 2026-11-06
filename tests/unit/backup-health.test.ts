import { expect, it } from "vitest";
import { join } from "node:path";
import {
  backupHealth,
  recordBackupStatus,
} from "@/modules/operations/backup-health";
it("reports missing, successful, failed, overdue, and interrupted runs without exposing paths", async () => {
  const folder = join(".local", "health-tests", crypto.randomUUID());
  const now = new Date("2026-11-05T12:00:00Z");
  expect((await backupHealth(folder, now)).state).toBe("UNAVAILABLE");
  await recordBackupStatus(folder, "SUCCESS", now);
  expect((await backupHealth(folder, now)).state).toBe("HEALTHY");
  await recordBackupStatus(folder, "FAILED", new Date(now.getTime() + 60000));
  const failed = await backupHealth(folder, new Date(now.getTime() + 120000));
  expect(failed.state).toBe("FAILED");
  expect(failed.lastSuccessAt).toBe(now.toISOString());
  expect(JSON.stringify(failed)).not.toContain(folder);
  await recordBackupStatus(folder, "SUCCESS", now);
  expect(
    (await backupHealth(folder, new Date(now.getTime() + 37 * 3600000))).state,
  ).toBe("STALE");
  await recordBackupStatus(folder, "RUNNING", now);
  expect(
    (await backupHealth(folder, new Date(now.getTime() + 3 * 3600000))).state,
  ).toBe("FAILED");
});
