import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createCorsMiddleware } from "./cors";
import { clearLegacySessionCookie } from "./cookies";
import { registerProductionWeb } from "./web-static";
import { createSecurityHeadersMiddleware } from "./security-headers";
import { logTrpcError } from "./trpc-errors";

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.disable("x-powered-by");
  app.use(createSecurityHeadersMiddleware());
  app.use(createCorsMiddleware());
  app.use(clearLegacySessionCookie());

  // Business payloads are small forms; a tight limit keeps oversized bodies out.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: logTrpcError,
    }),
  );

  if (process.env.NODE_ENV === "production") {
    registerProductionWeb(app);
  }

  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, "0.0.0.0", () => {
    console.log("[api] server listening");
  });
}

startServer().catch(() => {
  console.error("[api] server failed to start");
  process.exitCode = 1;
});
