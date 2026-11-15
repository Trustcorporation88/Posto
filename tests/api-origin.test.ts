import { describe, expect, it } from "vitest";
import { localDevApiOrigin } from "../lib/api-origin";

describe("API origin outside production", () => {
  it.each([
    ["http://localhost:8081", "http://localhost:3000"],
    ["http://127.0.0.1:8081", "http://127.0.0.1:3000"],
  ])("pairs local Expo Web %s with the local API", (origin, expected) => {
    expect(localDevApiOrigin(origin)).toBe(expected);
  });

  it.each([
    "https://posto.trustcorp.com.br",
    "https://posto.trustcorp.com.br:8081",
    "http://localhost:3000",
    "https://8081-sandbox.example.test",
    "not a url",
  ])("keeps %s on its own origin", (origin) => {
    expect(localDevApiOrigin(origin)).toBe("");
  });
});
