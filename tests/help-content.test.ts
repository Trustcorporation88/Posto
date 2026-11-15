import { describe, expect, it } from "vitest";
import { HELP_SECTIONS, helpSectionForPath, helpSectionsFor } from "../lib/business/help-content";

describe("in-app help", () => {
  it("has unique section ids and no empty sections", () => {
    const ids = HELP_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of HELP_SECTIONS) expect(section.blocks.length).toBeGreaterThan(0);
  });

  it("shows each role only the sections it can use", () => {
    const ids = (role: string) => helpSectionsFor(role).map((section) => section.id);
    expect(ids("owner")).toEqual(HELP_SECTIONS.map((section) => section.id));
    expect(ids("cashier")).toContain("caixa");
    expect(ids("cashier")).not.toContain("pista");
    expect(ids("cashier")).not.toContain("equipe");
    expect(ids("attendant")).toContain("pista");
    expect(ids("attendant")).not.toContain("caixa");
    // Roles without modules still get the general guidance.
    expect(ids("oil_technician")).toEqual(["regras", "duvidas"]);
  });

  it("maps each management screen to its help section", () => {
    expect(helpSectionForPath("/gestao/caixa")).toBe("caixa");
    expect(helpSectionForPath("/gestao/pista")).toBe("pista");
    expect(helpSectionForPath("/gestao/relatorios")).toBe("relatorios");
    expect(helpSectionForPath("/gestao/equipe")).toBe("equipe");
    expect(helpSectionForPath("/gestao/painel")).toBe("painel");
    expect(helpSectionForPath("/gestao/ajuda")).toBeNull();
  });
});
