import { expect, it } from "vitest";
import { readEnvironment } from "@/infrastructure/env";
const env: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://test:password@db.internal:5432/mancar",
  BETTER_AUTH_SECRET: "a".repeat(48),
  NODE_ENV: "production",
};
it("uses Render's HTTPS URL for authentication and normalizes explicit custom domains", () => {
  expect(
    readEnvironment({
      ...env,
      RENDER_EXTERNAL_URL: "https://mancar-example.onrender.com",
    }).BETTER_AUTH_URL,
  ).toBe("https://mancar-example.onrender.com");
  expect(
    readEnvironment({
      ...env,
      RENDER_EXTERNAL_URL: "https://mancar-example.onrender.com",
      BETTER_AUTH_URL: "https://gym.example.com/",
    }).BETTER_AUTH_URL,
  ).toBe("https://gym.example.com");
});
it.each([
  "http://gym.example.com",
  "https://gym.example.com/path",
  "https://gym.example.com?secret=test",
  "https://user:password@gym.example.com",
  "ftp://gym.example.com",
  "https://gym.example.com#hash",
])("rejects unsafe public authentication configuration: %s", (url) => {
  expect(() => readEnvironment({ ...env, BETTER_AUTH_URL: url })).toThrow();
});
it("does not silently fall back from an invalid custom origin", () => {
  expect(() =>
    readEnvironment({
      ...env,
      BETTER_AUTH_URL: "invalid",
      RENDER_EXTERNAL_URL: "https://safe.onrender.com",
    }),
  ).toThrow();
});
it("prevents demo seeding in production while retaining local preview support", () => {
  expect(() =>
    readEnvironment({
      ...env,
      BETTER_AUTH_URL: "https://gym.example.com",
      ALLOW_DEMO_SEED: "true",
    }),
  ).toThrow("demo");
  expect(
    readEnvironment({ ...env, BETTER_AUTH_URL: "http://localhost:3000" })
      .BETTER_AUTH_URL,
  ).toBe("http://localhost:3000");
});
