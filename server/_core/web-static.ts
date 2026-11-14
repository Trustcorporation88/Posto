import express, { type Express } from "express";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export function publicWebConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  // Exact allowlist. Never spread env or include credentials/owner identifiers here.
  return {
    oauthPortalUrl:
      env.MANUS_OAUTH_PORTAL_URL ?? env.VITE_OAUTH_PORTAL_URL ?? env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
    oauthServerUrl:
      env.MANUS_OAUTH_API_URL ?? env.OAUTH_SERVER_URL ?? env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
    appId: env.MANUS_PROJECT_ID ?? env.VITE_APP_ID ?? env.EXPO_PUBLIC_APP_ID ?? "",
    apiBaseUrl: "",
  };
}

export function injectPublicWebConfig(html: string, config: ReturnType<typeof publicWebConfig>) {
  const safeJson = JSON.stringify(config)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  // Run before Expo's application bundle. Only browser-safe runtime values are serialized.
  return html.replace(/<head(?:\s[^>]*)?>/i, (head) =>
    `${head}<script>globalThis.__SOBRA_PUBLIC_CONFIG__=${safeJson};</script>`,
  );
}

async function isFile(file: string) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

export function registerProductionWeb(app: Express, directory = path.resolve("web-build")) {
  const root = path.resolve(directory);
  if (!existsSync(path.join(root, "index.html"))) {
    throw new Error("Expo Web output missing: run build:production before production startup.");
  }

  app.use((req, res, next) => {
    // Missing APIs must never receive a successful HTML application response.
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    next();
  });

  app.use(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    try {
      const decoded = decodeURIComponent(req.path);
      const segments = decoded.split(/[\\/]/);
      if (decoded.includes("\0") || segments.some((part) => part === ".." || part.startsWith("."))) {
        res.sendStatus(404);
        return;
      }
      const base = path.resolve(root, `.${decoded}`);
      if (base !== root && !base.startsWith(`${root}${path.sep}`)) {
        res.sendStatus(404);
        return;
      }
      const candidates = decoded.endsWith(".html")
        ? [base]
        : path.extname(base)
          ? []
          : [path.join(base, "index.html"), `${base}.html`];
      for (const candidate of candidates) {
        if (!(await isFile(candidate))) continue;
        const html = await readFile(candidate, "utf8");
        res.setHeader("Cache-Control", "private, no-store");
        res.type("html").send(injectPublicWebConfig(html, publicWebConfig()));
        return;
      }
      next();
    } catch (error) {
      if (error instanceof URIError) res.sendStatus(400);
      else next(error);
    }
  });

  const hashedBundles = path.join(root, "_expo", "static") + path.sep;
  app.use(
    express.static(root, {
      index: false,
      redirect: false,
      maxAge: 0,
      dotfiles: "deny",
      setHeaders: (res, file) => {
        // Expo export puts content-hashed bundles here: a new build gets new file names,
        // so browsers may keep these for a year. Other files keep revalidating.
        if (path.resolve(file).startsWith(hashedBundles)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  app.use((_req, res) => res.status(404).type("text").send("Página ou arquivo não encontrado."));
}
