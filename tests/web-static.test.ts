import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { injectPublicWebConfig, publicWebConfig, registerProductionWeb } from "../server/_core/web-static";

let directory = "";
let server: Server | null = null;
let base = "";

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "sobra-web-test-"));
  await mkdir(path.join(directory, "gestao"));
  await writeFile(path.join(directory, "index.html"), "<!doctype html><html><head></head><body>Local</body></html>");
  await writeFile(path.join(directory, "gestao", "pista.html"), "<!doctype html><html><head></head><body>Pista</body></html>");
  await writeFile(path.join(directory, "app.js"), "console.log('test');");
  vi.stubEnv("DATABASE_URL", "mysql://private-test-value");
  const app = express();
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  registerProductionWeb(app, directory);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test listener");
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) {
    await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    server = null;
  }
  await rm(directory, { recursive: true, force: true });
});

describe("production Expo Web serving", () => {
  it.each(["/", "/gestao/pista", "/gestao/pista/", "/gestao/pista.html"])("serves exported HTML at %s with public runtime before app scripts", async (route) => {
    const response = await fetch(`${base}${route}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(html).toContain("<head><script>globalThis.__SOBRA_PUBLIC_CONFIG__=");
    expect(html).toContain('"apiBaseUrl":""');
    expect(html).not.toContain("private-test-value");
  });

  it("serves compiled assets and keeps application health reachable", async () => {
    const asset = await fetch(`${base}/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("console.log('test');");
    const health = await fetch(`${base}/api/health`);
    expect(await health.json()).toEqual({ ok: true });
  });

  it.each(["/unknown", "/missing.js", "/api/unknown", "/api"])("does not hide a missing route behind HTML success: %s", async (route) => {
    const response = await fetch(`${base}${route}`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("__SOBRA_PUBLIC_CONFIG__");
  });

  it("does not serve pages for writes or dotfiles", async () => {
    expect((await fetch(`${base}/gestao/pista`, { method: "POST" })).status).toBe(404);
    await writeFile(path.join(directory, ".env"), "not-public");
    const response = await fetch(`${base}/.env`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("not-public");
  });

  it("fails fast when the Expo build is absent", () => {
    expect(() => registerProductionWeb(express(), path.join(directory, "missing"))).toThrow("Expo Web output missing");
  });

  it("serializes only the explicit public allowlist and escapes script termination", () => {
    vi.stubEnv("DATABASE_URL", "private-db");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://temporary.example.test");
    const config = publicWebConfig();
    expect(config).toEqual({ apiBaseUrl: "", demoMode: false });
    expect(publicWebConfig({ DEMO_MODE: "true" }).demoMode).toBe(true);
    const html = injectPublicWebConfig("<html><head></head><body></body></html>", {
      ...config,
      note: "</script><script>alert(1)</script>",
    });
    expect(html).not.toContain("</script><script>alert");
    expect(html).not.toContain("private");
    expect(html).not.toContain("temporary.example.test");
    expect(html).toContain("\\u003c/script>");
  });
});
