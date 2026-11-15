import { beforeEach, describe, expect, it, vi } from "vitest";
import { csrfTokenForSession, tokenHash } from "../server/auth/security";
import { cashRouter } from "../server/modules/cash";
import type { TrpcContext } from "../server/_core/context";

const mockedServices = vi.hoisted(() => ({
  getCashPosition: vi.fn(),
  openCash: vi.fn(),
}));

vi.mock("../server/modules/cash-service", () => ({
  CashServiceError: class CashServiceError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "CashServiceError";
    }
  },
  getCashPosition: mockedServices.getCashPosition,
  openCash: mockedServices.openCash,
}));

const cashPosition = {
  revision: 0,
  serverNow: "2026-11-13T09:00:00.000Z",
  operationDate: "2026-11-13",
  scheduledShift: {
    id: "turno-1" as const,
    label: "Turno 1",
    start: "06:00",
    end: "14:00",
  },
  activeOpening: null,
};
const input = {
  intentId: "123e4567-e89b-42d3-a456-426614174000",
  expectedRevision: 0,
  operationDate: "2026-11-13",
  shiftId: "turno-1" as const,
  openingFloat: 0,
};

function context(options: {
  role?: string;
  method?: string;
  csrf?: boolean;
  origin?: string;
  sameOrigin?: boolean;
  session?: boolean;
  membershipActive?: boolean;
} = {}): TrpcContext {
  const csrfToken = csrfTokenForSession("cash-router-test-session");
  const headers: Record<string, string> = {};
  if (options.csrf) headers["x-sobra-csrf"] = csrfToken;
  if (options.origin) headers.origin = options.origin;
  if (options.sameOrigin ?? options.origin === undefined) {
    headers["sec-fetch-site"] = "same-origin";
  }
  const req = {
    method: options.method ?? "GET",
    hostname: "app.example.test",
    headers,
    ip: "127.0.0.1",
  };
  return {
    req,
    res: {} as TrpcContext["res"],
    businessUser: { id: 30, name: "Operadora", email: "cash@example.test" },
    businessMembership: {
      id: 50,
      role: options.role ?? "cashier",
      organizationId: 10,
      locationId: 20,
      active: options.membershipActive ?? true,
    },
    businessOrganization: { id: 10, name: "Posto" },
    businessLocation: {
      id: 20,
      name: "Unidade Bauru",
      city: "Bauru",
      state: "SP",
      timezone: "America/Sao_Paulo",
    },
    businessSession: options.session === false
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

describe("router tRPC de caixa", () => {
  beforeEach(() => {
    mockedServices.getCashPosition.mockReset().mockResolvedValue(cashPosition);
    mockedServices.openCash.mockReset().mockResolvedValue({
      opening: {
        id: 70,
        registerId: 60,
        operatorId: 30,
        operator: "Operadora",
        openingFloat: 0,
        operationDate: "2026-11-13",
        shift: cashPosition.scheduledShift,
        openedAt: "2026-11-13T09:00:00.000Z",
      },
      revision: 1,
      replayed: false,
    });
  });

  it("expõe cash.position sem input e escopa pela organização/unidade da sessão", async () => {
    const caller = cashRouter.createCaller(context({ role: "finance_viewer" }));
    await expect(caller.position()).resolves.toEqual(cashPosition);
    expect(mockedServices.getCashPosition).toHaveBeenCalledWith({
      organizationId: 10,
      locationId: 20,
      actorId: 30,
      sessionId: 40,
    });
  });

  it("permite consulta ao caixa para owner, manager, cashier e finance_viewer", async () => {
    for (const role of ["owner", "manager", "cashier", "finance_viewer"]) {
      await expect(
        cashRouter.createCaller(context({ role })).position(),
      ).resolves.toEqual(cashPosition);
    }
    expect(mockedServices.getCashPosition).toHaveBeenCalledTimes(4);
  });

  it("nega consulta ao caixa para frentista, técnico e papéis desconhecidos", async () => {
    for (const role of ["attendant", "oil_technician", "unknown"]) {
      await expect(
        cashRouter.createCaller(context({ role })).position(),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(mockedServices.getCashPosition).not.toHaveBeenCalled();
  });

  it("envia ao serviço apenas escopo autenticado e payload permitido, sem nome de operador", async () => {
    const caller = cashRouter.createCaller(
      context({ role: "cashier", method: "POST", csrf: true, sameOrigin: true }),
    );
    await expect(caller.open(input)).resolves.toMatchObject({
      revision: 1,
      replayed: false,
      opening: { operatorId: 30, openingFloat: 0 },
    });
    expect(mockedServices.openCash).toHaveBeenCalledWith(
      {
        organizationId: 10,
        locationId: 20,
        actorId: 30,
        sessionId: 40,
      },
      input,
    );
  });

  it("permite abrir para owner, manager e cashier, mas não finance_viewer ou attendant", async () => {
    for (const role of ["owner", "manager", "cashier"]) {
      await expect(
        cashRouter.createCaller(
          context({ role, method: "POST", csrf: true, sameOrigin: true }),
        ).open(input),
      ).resolves.toMatchObject({ replayed: false });
    }
    for (const role of ["finance_viewer", "attendant", "oil_technician"]) {
      await expect(
        cashRouter.createCaller(
          context({ role, method: "POST", csrf: true, sameOrigin: true }),
        ).open(input),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(mockedServices.openCash).toHaveBeenCalledTimes(3);
  });

  it("exige sessão comercial ativa para consultas e mutações", async () => {
    await expect(
      cashRouter.createCaller(context({ session: false })).position(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      cashRouter.createCaller(
        context({ session: false, method: "POST", csrf: true, sameOrigin: true }),
      ).open(input),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockedServices.getCashPosition).not.toHaveBeenCalled();
    expect(mockedServices.openCash).not.toHaveBeenCalled();
  });

  it("mantém proteção CSRF e allowlist de origem nas mutações", async () => {
    await expect(
      cashRouter.createCaller(context({ method: "POST", sameOrigin: true })).open(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      cashRouter.createCaller(
        context({ method: "POST", csrf: true, origin: "https://attacker.invalid" }),
      ).open(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockedServices.openCash).not.toHaveBeenCalled();
  });

  it("rejeita campos de operador enviados pelo cliente e números monetários inseguros", async () => {
    const caller = cashRouter.createCaller(
      context({ role: "cashier", method: "POST", csrf: true, sameOrigin: true }),
    );
    await expect(caller.open({ ...input, operator: "Nome declarado" } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      caller.open({ ...input, openingFloat: Number.MAX_SAFE_INTEGER + 1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockedServices.openCash).not.toHaveBeenCalled();
  });
});
