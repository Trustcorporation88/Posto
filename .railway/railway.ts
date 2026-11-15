import { defineRailway, github, mysql, project, service, volume } from "railway/iac";

// GAS PUMP: app (Dockerfile at the repo root) + MySQL in the same region.
// US East is the Railway region closest to Brazil.
const REGION = "us-east4-eqdc4a";

export default defineRailway((ctx) => {
  // "demo": separate database with fictitious data for training and usability tests.
  const demo = ctx.environment === "demo";

  const MySQL = mysql("MySQL", { region: REGION });
  MySQL.deploy = { startCommand: "docker-entrypoint.sh mysqld --innodb-use-native-aio=0 --disable-log-bin --performance_schema=0 --innodb-buffer-pool-size=1G" };
  MySQL.networking = { privateNetworkEndpoint: "mysql" };
  const mysqlVolume = volume("mysql-volume-21t1", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: REGION, sizeMB: 50000 });

  const app = service("gas-pump", {
    // checkSuites: deploy main only after the GitHub CI checks pass.
    source: github("Trustcorporation88/Posto", { branch: "main", checkSuites: true }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    // Applies pending Drizzle migrations; a failure stops the deploy before traffic moves.
    preDeploy: "node dist/admin.mjs migrate",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { [REGION]: 1 },
    // Custom domain posto.trustcorp.com.br is registered with `railway domain` (not supported here).
    env: {
      PORT: "3000",
      NODE_ENV: "production",
      PUBLIC_APP_URL: demo ? "https://gas-pump-demo.up.railway.app" : "https://posto.trustcorp.com.br",
      ...(demo ? { DEMO_MODE: "true" } : {}),
      DATABASE_URL: MySQL.env.MYSQL_URL,
    },
  });

  return project("gas-pump-posto", {
    resources: [MySQL, mysqlVolume, app],
  });
});