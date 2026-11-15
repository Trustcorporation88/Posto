import { beforeEach, describe, expect, it, vi } from "vitest";
import { csrfTokenForSession, tokenHash } from "../server/auth/security";
import { cashRouter } from "../server/modules/cash";
import type { TrpcContext } from "../server/_core/context";

const mocked = vi.hoisted(() => ({
  getCashClosingState: vi.fn(),
  getCashClosingHistory: vi.fn(),
  closeCash: vi.fn(),
}));

vi.mock("../server/modules/cash-closing-service", () => ({
  CashClosingServiceError: class CashClosingServiceError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "CashClosingServiceError";
    }
  },
  getCashClosingState: mocked.getCashClosingState,
  getCashClosingHistory: mocked.getCashClosingHistory,
  closeCash: mocked.closeCash,
}));

function context(
  options: {
    role?: string;
    method?: string;
    csrf?: boolean;
    origin?: string;
    sameOrigin?: boolean;
    session?: boolean;
  } = {},
): TrpcContext {
  const csrfToken = csrfTokenForSession("closing-router-test-session");
  const headers: Record<string, string> = {};
  if (options.csrf) headers["x-sobra-csrf"] = csrfToken;
  if (options.origin) headers.origin = options.origin;
  if (options.sameOrigin ?? options.origin === undefined)
    headers["sec-fetch-site"] = "same-origin";
  return {
    req: {
      method: options.method ?? "GET",
      hostname: "app.example.test",
      headers,
      ip: "127.0.0.1",
    },
    res: {} as TrpcContext["res"],
    businessUser: { id: 30, name: "Fechadora", email: "close@example.test" },
    businessMembership: {
      id: 50,
      role: options.role ?? "cashier",
      organizationId: 10,
      locationId: 20,
      active: true,
    },
    businessOrganization: { id: 10, name: "Posto" },
    businessLocation: {
      id: 20,
      name: "Unidade Bauru",
      city: "Bauru",
      state: "SP",
      timezone: "America/Sao_Paulo",
    },
    businessSession:
      options.session === false
        ? null
        : {
            id: 40,
            userId: 30,
            csrfHash: tokenHash(csrfToken),
            csrfToken,
          },
    businessCsrf: tokenHash(csrfToken),
  } as TrpcContext;
}

const countedByMethod = { dinheiro: 100, pix: 20, debito: 30, credito: 40 };
const closeInput = {
  intentId: "123e4567-e89b-42d3-a456-426614174000",
  expectedRevision: 7,
  expectedActorId: 30,
  openingId: 80,
  operationDate: "2026-11-13",
  shiftId: "turno-1" as const,
  countedByMethod,
  varianceReason: "",
};

describe("router tRPC do fechamento", () => {
  beforeEach(() => {
    mocked.getCashClosingState.mockReset().mockResolvedValue({
      revision: 7,
      serverNow: "2026-11-13T18:00:00.000Z",
      operationDate: "2026-11-13",
      scheduledShift: null,
      activeOpening: null,
      summary: null,
      latestClosing: null,
    });
    mocked.getCashClosingHistory.mockReset().mockResolvedValue({
      items: [],
      nextCursor: null,
      totalCount: 0,
      revision: 7,
    });
    mocked.closeCash.mockReset().mockResolvedValue({
      closing: { id: 500, openingId: 80, closedById: 30 },
      revision: 8,
      replayed: false,
    });
  });

  it("consulta closingState sem input e passa apenas o escopo autenticado", async () => {
    const caller = cashRouter.createCaller(context({ role: "finance_viewer" }));
    await expect(caller.closingState()).resolves.toMatchObject({ revision: 7 });
    expect(mocked.getCashClosingState).toHaveBeenCalledWith({
      organizationId: 10,
      locationId: 20,
      actorId: 30,
      sessionId: 40,
    });
  });

  it("aplica limite padrão 20, cursor por ID e máximo de 100", async () => {
    const caller = cashRouter.createCaller(context({ role: "finance_viewer" }));
    await caller.closingHistory({});
    expect(mocked.getCashClosingHistory).toHaveBeenLastCalledWith(
      { organizationId: 10, locationId: 20, actorId: 30, sessionId: 40 },
      { limit: 20 },
    );
    await caller.closingHistory({ limit: 100, cursor: 501 });
    expect(mocked.getCashClosingHistory).toHaveBeenLastCalledWith(
      { organizationId: 10, locationId: 20, actorId: 30, sessionId: 40 },
      { limit: 100, cursor: 501 },
    );
    await expect(caller.closingHistory({ limit: 101 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("permite fechar a proprietário, gerente e caixa, mas não a viewer/frentista/técnico", async () => {
    for (const role of ["owner", "manager", "cashier"]) {
      await expect(
        cashRouter
          .createCaller(
            context({ role, method: "POST", csrf: true, sameOrigin: true }),
          )
          .close(closeInput),
      ).resolves.toMatchObject({ revision: 8, replayed: false });
    }
    for (const role of ["finance_viewer", "attendant", "oil_technician"]) {
      await expect(
        cashRouter
          .createCaller(
            context({ role, method: "POST", csrf: true, sameOrigin: true }),
          )
          .close(closeInput),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(mocked.closeCash).toHaveBeenCalledTimes(3);
  });

  it("encaminha contrato estrito e escopo sem aceitar identidade declarada", async () => {
    const caller = cashRouter.createCaller(
      context({ method: "POST", csrf: true, sameOrigin: true }),
    );
    await caller.close(closeInput);
    expect(mocked.closeCash).toHaveBeenCalledWith(
      { organizationId: 10, locationId: 20, actorId: 30, sessionId: 40 },
      closeInput,
    );
    await expect(
      caller.close({ ...closeInput, closedBy: "Nome declarado" } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.close({
        ...closeInput,
        countedByMethod: { ...countedByMethod, dinheiro: undefined },
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocked.closeCash).toHaveBeenCalledTimes(1);
  });

  it("exige sessão e protege a mutation com CSRF e origem permitida", async () => {
    await expect(
      cashRouter.createCaller(context({ session: false })).closingState(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      cashRouter
        .createCaller(context({ method: "POST", sameOrigin: true }))
        .close(closeInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      cashRouter
        .createCaller(
          context({
            method: "POST",
            csrf: true,
            origin: "https://attacker.invalid",
          }),
        )
        .close(closeInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocked.closeCash).not.toHaveBeenCalled();
  });
});
