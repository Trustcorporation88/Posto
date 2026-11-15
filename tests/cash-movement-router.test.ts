import { beforeEach, describe, expect, it, vi } from "vitest";
import { csrfTokenForSession, tokenHash } from "../server/auth/security";
import { cashRouter } from "../server/modules/cash";
import type { TrpcContext } from "../server/_core/context";

const services = vi.hoisted(() => ({
  snapshot: vi.fn(),
  history: vi.fn(),
  record: vi.fn(),
}));
vi.mock("../server/modules/cash-movement-service", () => ({
  CashMovementServiceError: class CashMovementServiceError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "CashMovementServiceError";
    }
  },
  getCashTurnSnapshot: services.snapshot,
  getCashMovementHistory: services.history,
  recordCashMovement: services.record,
}));

function context(
  options: {
    role?: string;
    method?: string;
    csrf?: boolean;
    origin?: string;
    session?: boolean;
  } = {},
): TrpcContext {
  const csrfToken = csrfTokenForSession("cash-movement-router-session");
  const headers: Record<string, string> = {};
  if (options.csrf) headers["x-sobra-csrf"] = csrfToken;
  if (options.origin) headers.origin = options.origin;
  else headers["sec-fetch-site"] = "same-origin";
  return {
    req: {
      method: options.method ?? "GET",
      hostname: "app.example.test",
      headers,
      ip: "127.0.0.1",
    },
    res: {} as TrpcContext["res"],
    businessUser: { id: 31, name: "Operador", email: "user@example.test" },
    businessMembership: {
      id: 51,
      role: options.role ?? "cashier",
      organizationId: 10,
      locationId: 20,
      active: true,
    },
    businessOrganization: { id: 10, name: "Empresa" },
    businessLocation: { id: 20, name: "Unidade" },
    businessSession:
      options.session === false
        ? null
        : { id: 41, userId: 31, csrfHash: tokenHash(csrfToken), csrfToken },
    businessCsrf: tokenHash(csrfToken),
  } as TrpcContext;
}
const draft = {
  type: "recebimento" as const,
  paymentMethod: "pix" as const,
  receiptNature: "venda" as const,
  amount: 1250,
  description: "Venda combustível",
  reference: "NSU 0987",
  counterparty: "",
};
const payload = {
  ...draft,
  intentId: "123e4567-e89b-42d3-a456-426614174100",
  expectedRevision: 3,
  expectedActorId: 31,
  openingId: 70,
  operationDate: "2026-11-13",
  shiftId: "turno-1" as const,
};

describe("router tRPC dos movimentos de caixa", () => {
  beforeEach(() => {
    services.snapshot
      .mockReset()
      .mockResolvedValue({ revision: 3, activeOpening: null, summary: null });
    services.history
      .mockReset()
      .mockResolvedValue({
        openingId: 70,
        items: [],
        nextCursor: null,
        totalCount: 0,
        revision: 3,
      });
    services.record
      .mockReset()
      .mockResolvedValue({
        movement: {
          ...draft,
          id: 91,
          registerId: 60,
          openingId: 70,
          responsibleId: 31,
          responsible: "Operador",
          recordedAt: "2026-11-13T09:00:00.000Z",
        },
        revision: 4,
        replayed: false,
      });
  });

  it("expõe snapshot/histórico somente leitura a owner, manager, cashier e finance_viewer no escopo da sessão", async () => {
    for (const role of ["owner", "manager", "cashier", "finance_viewer"]) {
      const caller = cashRouter.createCaller(context({ role }));
      await caller.turnSnapshot();
      await caller.movementHistory({ openingId: 70, limit: 50 });
    }
    expect(services.snapshot).toHaveBeenCalledTimes(4);
    expect(services.history).toHaveBeenCalledWith(
      { organizationId: 10, locationId: 20, actorId: 31, sessionId: 41 },
      { openingId: 70, limit: 50 },
    );
  });

  it("nega leitura a papéis fora do caixa e exige sessão comercial", async () => {
    for (const role of ["attendant", "oil_technician", "unknown"]) {
      await expect(
        cashRouter.createCaller(context({ role })).turnSnapshot(),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
      cashRouter
        .createCaller(context({ session: false }))
        .movementHistory({ openingId: 70, limit: 50 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(services.snapshot).not.toHaveBeenCalled();
    expect(services.history).not.toHaveBeenCalled();
  });

  it("permite gravar a owner/manager/cashier, sem aceitar ator ou tenant do cliente", async () => {
    for (const role of ["owner", "manager", "cashier"]) {
      await cashRouter
        .createCaller(context({ role, method: "POST", csrf: true }))
        .recordMovement(payload);
    }
    expect(services.record).toHaveBeenCalledTimes(3);
    expect(services.record).toHaveBeenCalledWith(
      { organizationId: 10, locationId: 20, actorId: 31, sessionId: 41 },
      payload,
    );
    await expect(
      cashRouter
        .createCaller(context({ method: "POST", csrf: true }))
        .recordMovement({ ...payload, responsibleId: 99 } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(services.record).toHaveBeenCalledTimes(3);
  });

  it("torna finance_viewer somente leitura e exige CSRF/origem em mutation", async () => {
    await expect(
      cashRouter
        .createCaller(
          context({ role: "finance_viewer", method: "POST", csrf: true }),
        )
        .recordMovement(payload),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      cashRouter
        .createCaller(context({ method: "POST" }))
        .recordMovement(payload),
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
        .recordMovement(payload),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(services.record).not.toHaveBeenCalled();
  });

  it("rejeita campos de draft condicionais inválidos antes do serviço", async () => {
    await expect(
      cashRouter
        .createCaller(context({ method: "POST", csrf: true }))
        .recordMovement({
          ...payload,
          paymentMethod: "dinheiro",
          reference: "",
          receiptNature: "conta-anterior",
        }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      cashRouter
        .createCaller(context({ method: "POST", csrf: true }))
        .recordMovement({
          ...payload,
          type: "sangria",
          paymentMethod: "pix",
          receiptNature: null,
          counterparty: "Cofre",
        }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(services.record).not.toHaveBeenCalled();
  });
});
