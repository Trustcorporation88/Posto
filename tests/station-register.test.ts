import { describe, expect, it } from "vitest";
import {
  applyStationClosure,
  applyStationMovement,
  applyStationOpening,
  createEmptyStationRegister,
  prepareStationClosure,
  prepareStationMovement,
  prepareStationOpening,
  validateStationRegister,
} from "../lib/station-register";
import type { ShiftMovementDraft } from "../lib/shift-movements";

const openAt = new Date("2026-10-28T10:00:00-03:00");
const closeAt = new Date("2026-10-28T13:50:00-03:00");
const cashSale: ShiftMovementDraft = {
  type: "recebimento",
  paymentMethod: "dinheiro",
  receiptNature: "venda",
  amount: 25000,
  description: "Venda pista",
  reference: "",
  counterparty: "",
  responsible: "Ana",
};
function activeRegister() {
  const empty = createEmptyStationRegister();
  const openingReview = prepareStationOpening(empty, "Ana", 30000, openAt);
  return applyStationOpening(empty, openingReview, openAt, openingReview.id);
}
function addMovement(
  register: ReturnType<typeof activeRegister>,
  patch: Partial<ShiftMovementDraft>,
  id: string,
  at = new Date("2026-10-28T10:15:00-03:00"),
) {
  const review = prepareStationMovement(
    register,
    { ...cashSale, ...patch },
    at,
    id,
  );
  return applyStationMovement(register, review, at);
}
function exactCounts() {
  return { dinheiro: 30000, pix: 0, debito: 0, credito: 0 };
}
function closeReview(
  register: ReturnType<typeof activeRegister>,
  patch: Partial<{
    closingOperator: string;
    confirmer: string;
    countedByMethod: ReturnType<typeof exactCounts>;
    varianceReason: string;
  }> = {},
  at = closeAt,
  id = "close-1",
) {
  return prepareStationClosure(
    register,
    {
      closingOperator: "Ana",
      confirmer: "Bruno",
      countedByMethod: exactCounts(),
      varianceReason: "",
      ...patch,
    },
    at,
    id,
  );
}

describe("registro local e fechamento por turno", () => {
  it("separa dinheiro físico e relatórios eletrônicos, preservando o fechamento exato", () => {
    let register = activeRegister();
    register = addMovement(register, {}, "cash");
    register = addMovement(
      register,
      {
        paymentMethod: "pix",
        reference: "pix-report-1",
      },
      "pix",
    );
    const review = closeReview(register, {
      countedByMethod: { dinheiro: 55000, pix: 25000, debito: 0, credito: 0 },
    });
    expect(review.expectedByMethod).toEqual({
      dinheiro: 55000,
      pix: 25000,
      debito: 0,
      credito: 0,
    });
    expect(review.differenceByMethod).toEqual({
      dinheiro: 0,
      pix: 0,
      debito: 0,
      credito: 0,
    });
    const closed = applyStationClosure(register, review, closeAt);
    expect(closed.opening).toBeNull();
    expect(closed.movements).toEqual([]);
    expect(closed.closures).toHaveLength(1);
    expect(closed.closures[0]).toMatchObject({
      status: "fechado",
      closingOperator: "Ana",
      confirmer: "Bruno",
      movements: [{ id: "cash" }, { id: "pix" }],
    });
    expect(closed.closures[0]?.opening.openingFloat).toBe(30000);
    expect(closed.revision).toBe(4);
    expect(validateStationRegister(closed)).toEqual(closed);
  });

  it("fecha com divergência somente após justificativa e marca diferença pendente", () => {
    const register = addMovement(activeRegister(), {}, "cash");
    const counts = { ...exactCounts(), dinheiro: 54900 };
    expect(() => closeReview(register, { countedByMethod: counts })).toThrow(
      "justificativa",
    );
    const review = closeReview(register, {
      countedByMethod: counts,
      varianceReason: "Contagem física refeita, falta de R$ 1,00.",
    });
    const closed = applyStationClosure(register, review, closeAt);
    expect(closed.closures[0]).toMatchObject({
      status: "diferenca-pendente",
      varianceReason: "Contagem física refeita, falta de R$ 1,00.",
      totals: {
        differenceByMethod: { dinheiro: -100, pix: 0, debito: 0, credito: 0 },
      },
    });
  });

  it("não permite valores negativos, inteiros inseguros ou responsáveis inválidos", () => {
    const register = activeRegister();
    expect(() =>
      closeReview(register, {
        countedByMethod: { ...exactCounts(), pix: -1 },
      }),
    ).toThrow("não negativo");
    expect(() =>
      closeReview(register, {
        countedByMethod: { ...exactCounts(), pix: Number.MAX_SAFE_INTEGER + 1 },
      }),
    ).toThrow("centavos seguros");
    const largestSafeCount = closeReview(register, {
      countedByMethod: { ...exactCounts(), pix: Number.MAX_SAFE_INTEGER },
      varianceReason: "Valor máximo de teste, conferir o relatório.",
    });
    expect(largestSafeCount.differenceByMethod.pix).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => closeReview(register, { closingOperator: "A" })).toThrow(
      "2 a 80",
    );
    expect(() => closeReview(register, { confirmer: " " })).toThrow("2 a 80");
  });

  it("rejeita fechamento antes da abertura e posterior ao último movimento", () => {
    const register = addMovement(activeRegister(), {}, "cash");
    expect(() =>
      closeReview(register, {}, new Date("2026-10-28T09:59:00-03:00")),
    ).toThrow("anterior à abertura");
    expect(() =>
      closeReview(register, {}, new Date("2026-10-28T10:14:00-03:00")),
    ).toThrow();
  });

  it("permite regularizar depois do fim programado sem abrir caminho para movimento retroativo", () => {
    const register = activeRegister();
    const afterEnd = new Date("2026-10-28T14:10:00-03:00");
    const review = closeReview(register, {}, afterEnd, "late-close");
    const closed = applyStationClosure(register, review, afterEnd);
    expect(closed.closures[0]?.closedAt).toBe(afterEnd.toISOString());
    expect(() =>
      prepareStationMovement(closed, cashSale, afterEnd, "late-move"),
    ).toThrow("turno aberto");
  });

  it("permite o próximo turno somente depois de fechar e exige novo fundo declarado", () => {
    const first = activeRegister();
    const closed = applyStationClosure(first, closeReview(first), closeAt);
    const secondOpenAt = new Date("2026-10-28T14:00:00-03:00");
    const review = prepareStationOpening(closed, "Carla", 12345, secondOpenAt);
    const second = applyStationOpening(closed, review, secondOpenAt, review.id);
    expect(second.opening).toMatchObject({
      operator: "Carla",
      openingFloat: 12345,
      shift: { id: "turno-2" },
    });
    expect(second.closures).toHaveLength(1);
    expect(second.movements).toEqual([]);
    expect(() =>
      prepareStationOpening(second, "Davi", 1000, secondOpenAt),
    ).toThrow("Feche o turno atual");
    expect(() =>
      prepareStationOpening(
        closed,
        "Davi",
        1000,
        new Date("2026-10-28T13:49:00-03:00"),
      ),
    ).toThrow("não pode anteceder o fechamento anterior");
  });

  it("não aceita revisão adulterada, abertura fechada ou snapshot de movimento alterado", () => {
    const register = activeRegister();
    const review = closeReview(register);
    expect(() =>
      applyStationClosure(
        register,
        {
          ...review,
          differenceByMethod: { ...review.differenceByMethod, dinheiro: 1 },
        },
        closeAt,
      ),
    ).toThrow("Diferença");
    const closed = applyStationClosure(register, review, closeAt);
    const tampered = JSON.parse(JSON.stringify(closed));
    tampered.closures[0].totals.expectedByMethod.dinheiro = 1;
    expect(() => validateStationRegister(tampered)).toThrow("incompatível");
  });

  it("mantém centavos inteiros e não soma diferenças de métodos distintos", () => {
    let register = activeRegister();
    register = addMovement(register, { amount: 101 }, "cent-cash");
    register = addMovement(
      register,
      { paymentMethod: "pix", reference: "pix-2", amount: 202 },
      "cent-pix",
    );
    const review = closeReview(register, {
      countedByMethod: { dinheiro: 30101, pix: 201, debito: 0, credito: 0 },
      varianceReason: "Diferenças verificadas por meio.",
    });
    expect(review.differenceByMethod).toEqual({
      dinheiro: 0,
      pix: -1,
      debito: 0,
      credito: 0,
    });
  });
});
