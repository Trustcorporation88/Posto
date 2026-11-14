import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import {
  allowedFrameAncestors,
  createSecurityHeadersMiddleware,
} from "../server/_core/security-headers";
import {
  INTERNAL_ERROR_MESSAGE,
  logTrpcError,
  publicErrorMessage,
} from "../server/_core/trpc-errors";
import { registerProductionWeb } from "../server/_core/web-static";

let server: Server | null = null;
let directory = "";

async function listen(app: express.Express) {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test listener");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  vi.restoreAllMocks();
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error ? reject(error) : resolve())),
    );
    server = null;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
});

describe("security headers", () => {
  it("sends baseline protections and blocks framing by other sites", async () => {
    const app = express();
    app.use(createSecurityHeadersMiddleware([]));
    app.get("/x", (_req, res) => res.send("ok"));
    const response = await fetch(`${await listen(app)}/x`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    // Plain HTTP must not pin HSTS (local development).
    expect(response.headers.get("strict-transport-security")).toBeNull();
  });

  it("sets HSTS only behind an https proxy", async () => {
    const app = express();
    app.use(createSecurityHeadersMiddleware([]));
    app.get("/x", (_req, res) => res.send("ok"));
    const response = await fetch(`${await listen(app)}/x`, {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(response.headers.get("strict-transport-security")).toBe("max-age=15552000");
  });

  it("allows only exact https origins as extra frame ancestors", async () => {
    expect(
      allowedFrameAncestors(
        "https://painel.example.test, http://inseguro.test https://x.test/path * https://painel.example.test",
      ),
    ).toEqual(["https://painel.example.test"]);
    const app = express();
    app.use(createSecurityHeadersMiddleware(["https://painel.example.test"]));
    app.get("/x", (_req, res) => res.send("ok"));
    const response = await fetch(`${await listen(app)}/x`);
    expect(response.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'self' https://painel.example.test",
    );
    // X-Frame-Options cannot express an allowlist; CSP governs in that case.
    expect(response.headers.get("x-frame-options")).toBeNull();
  });
});

describe("tRPC error exposure", () => {
  it("hides unexpected internal messages but keeps intentional ones", () => {
    expect(publicErrorMessage("INTERNAL_SERVER_ERROR", "ER_BAD_FIELD select * from x")).toBe(
      INTERNAL_ERROR_MESSAGE,
    );
    expect(publicErrorMessage("CONFLICT", "A revisão mudou. Atualize e revise.")).toBe(
      "A revisão mudou. Atualize e revise.",
    );
  });

  it("logs only path, type and driver code for internal failures", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = Object.assign(new Error("Duplicate entry 'secret@example.test'"), {
      code: "ER_DUP_ENTRY",
    });
    logTrpcError({
      error: new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause }),
      type: "mutation",
      path: "cash.open",
    });
    logTrpcError({
      error: new TRPCError({ code: "FORBIDDEN", message: "Acesso negado." }),
      type: "query",
      path: "cash.position",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toBe("[tRPC] mutation cash.open failed: Error ER_DUP_ENTRY");
    expect(line).not.toContain("secret@example.test");
  });
});

describe("static caching", () => {
  it("caches hashed Expo bundles for a year and revalidates other files", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "sobra-cache-test-"));
    await mkdir(path.join(directory, "_expo", "static", "js", "web"), { recursive: true });
    await writeFile(path.join(directory, "index.html"), "<html><head></head><body></body></html>");
    await writeFile(path.join(directory, "_expo", "static", "js", "web", "entry-abc123.js"), "1");
    await writeFile(path.join(directory, "favicon.ico"), "i");
    const app = express();
    registerProductionWeb(app, directory);
    const base = await listen(app);
    const bundle = await fetch(`${base}/_expo/static/js/web/entry-abc123.js`);
    expect(bundle.status).toBe(200);
    expect(bundle.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const icon = await fetch(`${base}/favicon.ico`);
    expect(icon.status).toBe(200);
    expect(icon.headers.get("cache-control")).not.toContain("immutable");
  });
});
