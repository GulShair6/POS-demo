import test from "node:test";
import assert from "node:assert/strict";

test("deployment example contains required security and database values", async () => {
  const text = await (await import("node:fs/promises")).readFile(new URL("../.env.example", import.meta.url), "utf8");
  for (const key of [
    "DATABASE_URL",
    "POSTGRES_PASSWORD",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "SESSION_SECRET",
    "POS_TAX_RATE"
  ])
    assert.match(text, new RegExp(`^${key}=`, "m"));
});

test("compose keeps PostgreSQL private and binds the app to loopback", async () => {
  const text = await (
    await import("node:fs/promises")
  ).readFile(new URL("../docker-compose.yml", import.meta.url), "utf8");
  const databaseService = text.split("\n  app:")[0];
  assert.doesNotMatch(databaseService, /\n\s+ports:/);
  assert.match(text, /127\.0\.0\.1:3050:3000/);
});
