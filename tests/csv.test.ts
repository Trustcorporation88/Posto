import { describe, expect, it } from "vitest";

import {
  applyCsvImport,
  exportBudgetsCSV,
  exportTransactionsCSV,
  parseTransactionsCSV,
  SAMPLE_CSV,
  type CsvMapping,
} from "../lib/csv";
import { createEmptyData } from "../lib/budget";

describe("CSV de lançamentos", () => {
  it("lê BOM, cabeçalhos em português, aspas, acentos e datas brasileiras", () => {
    const data = createEmptyData();
    const csv =
      "\uFEFFdata;tipo;descricao;categoria;valor\r\n" +
      '10/02/2026;despesa;"Café; reunião";Restaurantes;42,50\r\n' +
      "2026-02-11;receita;Freelance;Trabalho extra;1.234,56\r\n";
    const preview = parseTransactionsCSV(csv, data);
    expect(preview.headers[0]).toBe("data");
    expect(preview.mapping).toEqual({
      date: "data",
      type: "tipo",
      description: "descricao",
      category: "categoria",
      amount: "valor",
    });
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toMatchObject([
      {
        line: 2,
        date: "2026-02-10",
        type: "despesa",
        description: "Café; reunião",
        category: "Restaurantes",
        amount: 4250,
      },
      {
        line: 3,
        date: "2026-02-11",
        type: "receita",
        description: "Freelance",
        category: "Trabalho extra",
        amount: 123456,
      },
    ]);
    expect(preview.rows.every((row) => row.duplicate === false)).toBe(true);
  });

  it("detecta CSV separado por vírgula e aceita decimal ponto seguro", () => {
    const preview = parseTransactionsCSV(
      'date,type,description,category,amount\n2026-02-01,despesa,"Conta, de luz",Moradia,1234.56\n',
      createEmptyData(),
    );
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({
      date: "2026-02-01",
      description: "Conta, de luz",
      amount: 123456,
    });
  });

  it("permite mapeamento de cabeçalhos personalizados", () => {
    const mapping: CsvMapping = {
      date: "Quando",
      type: "Natureza",
      description: "Texto",
      category: "Grupo",
      amount: "Quantia",
    };
    const preview = parseTransactionsCSV(
      "Quando;Natureza;Texto;Grupo;Quantia\n31/03/2026;receita;Projeto;Trabalho extra;2.000,00\n",
      createEmptyData(),
      mapping,
    );
    expect(preview.mapping).toEqual(mapping);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({
      date: "2026-03-31",
      type: "receita",
      amount: 200000,
    });
  });

  it("mantém erros por linha e bloqueia o lote inteiro na aplicação", () => {
    const data = createEmptyData();
    const preview = parseTransactionsCSV(
      "data;tipo;descricao;categoria;valor\n2026-04-01;despesa;Válida;Mercado;10,00\n31/04/2026;despesa;Inválida;Mercado;20,00\n2026-04-03;despesa;Sem valor;Mercado;1.234\n",
      data,
    );
    expect(preview.rows).toHaveLength(1);
    expect(preview.errors.map((error) => error.line)).toEqual([3, 4]);
    expect(() => applyCsvImport(data, preview)).toThrow(/erros/);
    expect(data.transactions).toHaveLength(0);
    expect(data.categories).toHaveLength(11);
  });

  it("sinaliza duplicatas existentes e repetidas sem descartar registros", () => {
    const data = createEmptyData();
    data.transactions.push({
      id: "existing-transaction",
      description: "Almoço",
      amount: 4250,
      date: "2026-05-10",
      categoryId: "restaurantes",
      type: "despesa",
    });
    const preview = parseTransactionsCSV(
      "data;tipo;descricao;categoria;valor\n2026-05-10;despesa;Almoço;Restaurantes;42,50\n2026-05-11;despesa;Passagem;Transporte;20,00\n2026-05-11;despesa;Passagem;Transporte;20,00\n",
      data,
    );
    expect(preview.errors).toEqual([]);
    expect(preview.duplicateCount).toBe(3);
    expect(preview.rows.map((row) => row.duplicate)).toEqual([
      true,
      true,
      true,
    ]);

    const imported = applyCsvImport(data, preview);
    expect(imported.transactions).toHaveLength(4);
    expect(
      imported.transactions.filter(
        (transaction) => transaction.description === "Passagem",
      ),
    ).toHaveLength(2);
    expect(
      imported.categories.filter((category) => category.name === "Transporte"),
    ).toHaveLength(1);
  });

  it("cria categorias ausentes somente ao aplicar um preview válido e usa ids únicos", () => {
    const data = createEmptyData();
    const preview = parseTransactionsCSV(
      "date,type,description,category,amount\n2026-06-01,expense,Hotel,Viagem,100.00\n",
      data,
    );
    expect(preview.errors).toEqual([]);
    expect(data.categories.some((category) => category.name === "Viagem")).toBe(
      false,
    );
    const imported = applyCsvImport(data, preview);
    const category = imported.categories.find(
      (candidate) => candidate.name === "Viagem",
    );
    expect(category).toMatchObject({ name: "Viagem", type: "despesa" });
    expect(imported.transactions[0].categoryId).toBe(category?.id);
    expect(new Set(imported.categories.map((item) => item.id)).size).toBe(
      imported.categories.length,
    );
    expect(new Set(imported.transactions.map((item) => item.id)).size).toBe(
      imported.transactions.length,
    );
  });

  it("faz roundtrip de exportação com BOM, campos citados e proteção contra fórmula", () => {
    const data = createEmptyData();
    data.categories.push({
      id: "categoria-especial",
      name: "Casa; reforma",
      type: "despesa",
      color: "#123456",
      icon: "tag",
    });
    data.transactions.push({
      id: "tx-special",
      description: '=SOMA("A1")',
      amount: 123456,
      date: "2026-07-15",
      categoryId: "categoria-especial",
      type: "despesa",
    });
    data.budgets.push({
      month: "2026-01",
      categoryId: "mercado",
      amount: 10000,
    });
    data.budgets.push({
      month: "2026-07",
      categoryId: "categoria-especial",
      amount: 200000,
    });

    const exported = exportTransactionsCSV(data);
    expect(exported.startsWith("\uFEFF")).toBe(true);
    expect(exported).toContain("'=SOMA");
    expect(exported).toContain('"Casa; reforma"');
    const preview = parseTransactionsCSV(exported, data);
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      description: '=SOMA("A1")',
      category: "Casa; reforma",
      amount: 123456,
    });

    const budgets = exportBudgetsCSV(data);
    expect(budgets.startsWith("\uFEFFmes;categoria;limite")).toBe(true);
    expect(budgets).toContain("2026-01;Mercado;100,00");
    expect(budgets).toContain(
      "2026-07;Casa; reforma;2.000,00".replace(
        "Casa; reforma",
        '"Casa; reforma"',
      ),
    );
  });

  it("exporta o exemplo oficial e bloqueia preview sem linhas válidas", () => {
    const preview = parseTransactionsCSV(SAMPLE_CSV, createEmptyData());
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toHaveLength(2);
    expect(() =>
      applyCsvImport(createEmptyData(), {
        ...preview,
        rows: [],
        duplicateCount: 0,
      }),
    ).toThrow(/sem linhas/);
  });
});
