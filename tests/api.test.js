import test from "node:test";
import assert from "node:assert/strict";
import expressSession from "express-session";
import request from "supertest";
import { createApp } from "../server/app.js";

function createTestApp() {
  const pool = {
    async query(sql) {
      if (sql === "SELECT 1") return { rows: [{ "?column?": 1 }] };
      throw new Error("Unexpected database query in this API test.");
    },
  };
  return createApp({
    pool,
    sessionSecret: "a-test-session-secret-that-is-at-least-32-chars",
    sessionStore: new expressSession.MemoryStore(),
    production: false,
  });
}

test("health endpoint verifies database connectivity", async () => {
  const response = await request(createTestApp()).get("/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok", database: "connected" });
});

test("requires CSRF tokens on state-changing requests", async () => {
  const agent = request.agent(createTestApp());
  const response = await agent.post("/api/auth/register").send({
    displayName: "User",
    email: "user@example.org",
    password: "long-enough-password",
  });
  assert.equal(response.status, 403);
  assert.match(response.body.error, /security token/);
});

test("requires authentication for profile access and returns JSON for unknown APIs", async () => {
  const agent = request.agent(createTestApp());
  const profileResponse = await agent.get("/api/profile");
  assert.equal(profileResponse.status, 401);

  const missingResponse = await agent.get("/api/missing");
  assert.equal(missingResponse.status, 404);
  assert.equal(missingResponse.body.error, "API endpoint not found.");
});

test("protects administrator metrics, import history, and templates", async () => {
  const agent = request.agent(createTestApp());
  for (const route of ["/api/admin/overview", "/api/admin/imports", "/api/admin/template/jobs.csv"]) {
    const response = await agent.get(route);
    assert.equal(response.status, 401, `${route} should require authentication`);
  }
});

test("marks API responses private and production session cookies secure", async () => {
  const app = createApp({
    pool: { async query() { return { rows: [] }; } },
    sessionSecret: "a-test-session-secret-that-is-at-least-32-chars",
    sessionStore: new expressSession.MemoryStore(),
    production: true,
  });
  app.set("trust proxy", 1);
  const response = await request(app).get("/api/csrf").set("X-Forwarded-Proto", "https");

  assert.equal(response.headers["cache-control"], "no-store");
  assert.match(response.headers["set-cookie"][0], /HttpOnly; Secure; SameSite=Lax/);
});

test("serves only public frontend files, not backend source", async () => {
  const app = createTestApp();
  const home = await request(app).get("/");
  const script = await request(app).get("/app.js");
  const privateSource = await request(app).get("/server/app.js");

  assert.equal(home.status, 200);
  assert.match(home.text, /Thuso/);
  assert.equal(script.status, 200);
  assert.equal(privateSource.status, 404);
});

test("limits sensitive browser headers", async () => {
  const response = await request(createTestApp()).get("/api/health");
  assert.equal(response.headers["x-powered-by"], undefined);
  assert.ok(response.headers["x-content-type-options"]);
  assert.ok(response.headers["content-security-policy"]);
});
