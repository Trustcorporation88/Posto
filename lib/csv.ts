import Papa from "papaparse";

import {
  type AppData,
  type Category,
  createId,
  normalizeDate,
  parseMoney,
  type Transaction,
  type TxType,
  validateData,
} from "./budget";

export type CsvField = "date" | "type" | "description" | "category" | "amount";

export type CsvMapping = Record<CsvField, string>;

export interface CsvRow {
  line: number;
  date: string;
  type: TxType;
  description: string;
  category: string;
  amount: number;
  duplicate: boolean;
}

export interface CsvPreview {
  headers: string[];
  mapping: CsvMapping;
  rows: CsvRow[];
  errors: Array<{ line: number; message: string }>;
  duplicateCount: number;
}

const CSV_FIELDS: CsvField[] = [
  "date",
  "type",
  "description",
  "category",
  "amount",
];

const HEADER_ALIASES: Record<CsvField, string[]> = {
  date: ["data", "date"],
  type: ["tipo", "type", "transactiontype", "natureza"],
  description: ["descricao", "description", "desc"],
  category: ["categoria", "category"],
  amount: ["valor", "amount", "value"],
};

const CSV_INJECTION_START = /^[=+\-@]/;

function normalizeLabel(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function cleanHeader(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function emptyMapping(): CsvMapping {
  return { date: "", type: "", description: "", category: "", amount: "" };
}

function makeError(
  errors: Array<{ line: number; message: string }>,
  line: number,
  message: string,
): void {
  errors.push({ line: Math.max(1, line), message });
}

function findHeader(headers: string[], requested: string): string | null {
  const exact = headers.find((header) => header === requested);
  if (exact !== undefined) return exact;
  const normalized = normalizeLabel(requested);
  return (
    headers.find((header) => normalizeLabel(header) === normalized) ?? null
  );
}

function inferMapping(
  headers: string[],
  requested: CsvMapping | undefined,
  errors: Array<{ line: number; message: string }>,
): CsvMapping {
  const mapping = emptyMapping();
  const usedHeaders = new Set<string>();

  for (const field of CSV_FIELDS) {
    const requestedHeader = requested?.[field];
    let resolved: string | null = null;
    if (
      typeof requestedHeader === "string" &&
      requestedHeader.trim().length > 0
    ) {
      resolved = findHeader(headers, requestedHeader);
      if (resolved === null) {
        makeError(
          errors,
          1,
          `Cabeçalho indicado para ${field} não foi encontrado: ${requestedHeader}`,
        );
      }
    } else if (requested) {
      makeError(errors, 1, `Mapeamento ausente para ${field}`);
    } else {
      const aliases = HEADER_ALIASES[field];
      resolved =
        headers.find((header) => aliases.includes(normalizeLabel(header))) ??
        null;
      if (resolved === null) {
        makeError(
          errors,
          1,
          `Cabeçalho obrigatório não encontrado para ${field}`,
        );
      }
    }

    if (resolved !== null) {
      if (usedHeaders.has(resolved)) {
        makeError(
          errors,
          1,
          `O cabeçalho ${resolved} foi mapeado para mais de um campo`,
        );
      }
      usedHeaders.add(resolved);
      mapping[field] = resolved;
    }
  }

  return mapping;
}

function normalizeType(value: string): TxType | null {
  const normalized = normalizeLabel(value);
  if (normalized === "receita" || normalized === "income") return "receita";
  if (normalized === "despesa" || normalized === "expense") return "despesa";
  return null;
}

function unprotectCsvValue(value: string): string {
  // Export protection uses one leading apostrophe. A leading apostrophe in the
  // original value is escaped by another apostrophe, keeping export/import reversible.
  if (value.startsWith("''")) return value.slice(1);
  if (
    value.length > 1 &&
    value.startsWith("'") &&
    CSV_INJECTION_START.test(value.slice(1))
  )
    return value.slice(1);
  return value;
}

function transactionSignature(
  date: string,
  type: TxType,
  description: string,
  category: string,
  amount: number,
): string {
  return [
    date,
    type,
    normalizeLabel(description),
    normalizeLabel(category),
    String(amount),
  ].join("\u0000");
}

function buildExistingSignatures(data: AppData): Set<string> {
  const categoryById = new Map(
    data.categories.map((category) => [category.id, category]),
  );
  return new Set(
    data.transactions.map((transaction) => {
      const category = categoryById.get(transaction.categoryId);
      return transactionSignature(
        transaction.date,
        transaction.type,
        transaction.description,
        category?.name ?? transaction.categoryId,
        transaction.amount,
      );
    }),
  );
}

function isBlankRow(row: string[]): boolean {
  return row.length === 0 || row.every((cell) => cell.trim().length === 0);
}

/**
 * Parse a CSV without mutating the current state. Invalid records remain visible
 * through line errors; valid records are never silently discarded because of a
 * different row being invalid.
 */
export function parseTransactionsCSV(
  text: string,
  data: AppData,
  requestedMapping?: CsvMapping,
): CsvPreview {
  const errors: Array<{ line: number; message: string }> = [];
  const headers: string[] = [];
  const rows: CsvRow[] = [];

  if (typeof text !== "string" || text.trim().length === 0) {
    makeError(errors, 1, "O arquivo CSV está vazio");
    return {
      headers,
      mapping: emptyMapping(),
      rows,
      errors,
      duplicateCount: 0,
    };
  }

  let parsed: Papa.ParseResult<string[]>;
  try {
    parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
      delimiter: "",
      skipEmptyLines: false,
      dynamicTyping: false,
    });
  } catch (error) {
    makeError(
      errors,
      1,
      error instanceof Error ? error.message : "Não foi possível ler o CSV",
    );
    return {
      headers,
      mapping: emptyMapping(),
      rows,
      errors,
      duplicateCount: 0,
    };
  }

  const parsedRows = parsed.data;
  if (parsedRows.length === 0 || isBlankRow(parsedRows[0] ?? [])) {
    makeError(errors, 1, "O CSV não possui cabeçalho");
    return {
      headers,
      mapping: emptyMapping(),
      rows,
      errors,
      duplicateCount: 0,
    };
  }

  for (const rawHeader of parsedRows[0]) headers.push(cleanHeader(rawHeader));
  if (headers.some((header) => header.trim().length === 0))
    makeError(errors, 1, "O CSV possui cabeçalho vazio");

  const mapping = inferMapping(headers, requestedMapping, errors);
  const fieldIndexes = new Map<CsvField, number>();
  for (const field of CSV_FIELDS) {
    const index = mapping[field] ? headers.indexOf(mapping[field]) : -1;
    fieldIndexes.set(field, index);
  }

  for (const parseError of parsed.errors) {
    const parseLine =
      typeof parseError.row === "number" ? parseError.row + 2 : 1;
    makeError(errors, parseLine, parseError.message);
  }

  for (let index = 1; index < parsedRows.length; index += 1) {
    const rawRow = parsedRows[index] ?? [];
    const line = index + 1;
    if (isBlankRow(rawRow)) continue;
    if (rawRow.length !== headers.length) {
      makeError(
        errors,
        line,
        `Quantidade de colunas inesperada: esperado ${headers.length}, recebido ${rawRow.length}`,
      );
      continue;
    }
    if (CSV_FIELDS.some((field) => (fieldIndexes.get(field) ?? -1) < 0))
      continue;

    const cell = (field: CsvField): string => {
      const fieldIndex = fieldIndexes.get(field) ?? -1;
      return fieldIndex >= 0 ? String(rawRow[fieldIndex] ?? "").trim() : "";
    };
    const rawDate = unprotectCsvValue(cell("date"));
    const rawType = unprotectCsvValue(cell("type"));
    const description = unprotectCsvValue(cell("description"));
    const category = unprotectCsvValue(cell("category"));
    const rawAmount = unprotectCsvValue(cell("amount"));
    let valid = true;

    const date = normalizeDate(rawDate);
    if (!date) {
      makeError(errors, line, "Data inválida: use AAAA-MM-DD ou DD/MM/AAAA");
      valid = false;
    }
    const type = normalizeType(rawType);
    if (!type) {
      makeError(errors, line, "Tipo inválido: use receita ou despesa");
      valid = false;
    }
    if (description.trim().length === 0) {
      makeError(errors, line, "Descrição obrigatória");
      valid = false;
    }
    if (category.trim().length === 0) {
      makeError(errors, line, "Categoria obrigatória");
      valid = false;
    }
    const amount = parseMoney(rawAmount);
    if (amount === null || amount <= 0) {
      makeError(
        errors,
        line,
        "Valor inválido: informe um valor positivo e não ambíguo",
      );
      valid = false;
    }

    if (valid && date !== null && type !== null && amount !== null) {
      rows.push({
        line,
        date,
        type,
        description: description.trim(),
        category: category.trim(),
        amount,
        duplicate: false,
      });
    }
  }

  const existingSignatures = buildExistingSignatures(validateData(data));
  const occurrenceCounts = new Map<string, number>();
  for (const row of rows) {
    const signature = transactionSignature(
      row.date,
      row.type,
      row.description,
      row.category,
      row.amount,
    );
    occurrenceCounts.set(signature, (occurrenceCounts.get(signature) ?? 0) + 1);
  }

  let duplicateCount = 0;
  for (const row of rows) {
    const signature = transactionSignature(
      row.date,
      row.type,
      row.description,
      row.category,
      row.amount,
    );
    row.duplicate =
      existingSignatures.has(signature) ||
      (occurrenceCounts.get(signature) ?? 0) > 1;
    if (row.duplicate) duplicateCount += 1;
  }

  return { headers, mapping, rows, errors, duplicateCount };
}

function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new RangeError("O valor CSV deve ser um inteiro seguro não negativo");
  const text = String(cents).padStart(3, "0");
  const whole = text.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${whole},${text.slice(-2)}`;
}

function protectCsvValue(value: string): string {
  if (value.startsWith("'") || CSV_INJECTION_START.test(value))
    return `'${value}`;
  return value;
}

function csvCell(value: string): string {
  const protectedValue = protectCsvValue(value);
  return /[;"\r\n]/.test(protectedValue)
    ? `"${protectedValue.replace(/"/g, '""')}"`
    : protectedValue;
}

/** Apply a complete preview atomically. Duplicate rows are intentionally all appended: the preview flag is not silently discarded. */
export function applyCsvImport(data: AppData, preview: CsvPreview): AppData {
  if (preview.errors.length > 0)
    throw new Error("Não é possível importar um CSV com erros");
  if (preview.rows.length === 0)
    throw new Error("Não é possível importar um CSV sem linhas válidas");

  const base = validateData(data);
  const categories = base.categories.map((category) => ({ ...category }));
  const transactions = base.transactions.map((transaction) => ({
    ...transaction,
  }));
  const usedIds = new Set<string>([
    ...categories.map((category) => category.id),
    ...transactions.map((transaction) => transaction.id),
  ]);
  const categoryByTypeAndName = new Map<string, Category>();
  for (const category of categories)
    categoryByTypeAndName.set(
      `${category.type}\u0000${normalizeLabel(category.name)}`,
      category,
    );

  for (const row of preview.rows) {
    const categoryKey = `${row.type}\u0000${normalizeLabel(row.category)}`;
    let category = categoryByTypeAndName.get(categoryKey);
    if (!category) {
      let id = createId();
      while (usedIds.has(id)) id = createId();
      category = {
        id,
        name: row.category.trim(),
        type: row.type,
        color: "#899878",
        icon: "tag",
      };
      categories.push(category);
      categoryByTypeAndName.set(categoryKey, category);
      usedIds.add(id);
    }

    let id = createId();
    while (usedIds.has(id)) id = createId();
    usedIds.add(id);
    transactions.push({
      id,
      description: row.description.trim(),
      amount: row.amount,
      date: row.date,
      categoryId: category.id,
      type: row.type,
    });
  }

  return validateData({
    version: 1,
    categories,
    transactions,
    budgets: base.budgets.map((budget) => ({ ...budget })),
  });
}

export function exportTransactionsCSV(data: AppData): string {
  const validated = validateData(data);
  const categoryById = new Map(
    validated.categories.map((category) => [category.id, category]),
  );
  const lines = ["data;tipo;descricao;categoria;valor"];
  for (const transaction of validated.transactions) {
    const category = categoryById.get(transaction.categoryId);
    if (!category)
      throw new TypeError(
        `Categoria inexistente no lançamento ${transaction.id}`,
      );
    lines.push(
      [
        transaction.date,
        transaction.type,
        transaction.description,
        category.name,
        formatCents(transaction.amount),
      ]
        .map((value) => csvCell(String(value)))
        .join(";"),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function exportBudgetsCSV(data: AppData): string {
  const validated = validateData(data);
  const categoryById = new Map(
    validated.categories.map((category) => [category.id, category]),
  );
  const lines = ["mes;categoria;limite"];
  for (const budget of validated.budgets) {
    const category = categoryById.get(budget.categoryId);
    if (!category)
      throw new TypeError(`Categoria inexistente no orçamento ${budget.month}`);
    lines.push(
      [budget.month, category.name, formatCents(budget.amount)]
        .map((value) => csvCell(String(value)))
        .join(";"),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export const SAMPLE_CSV =
  "data;tipo;descricao;categoria;valor\n" +
  "2026-01-05;receita;Salário;Salário;5.000,00\n" +
  "10/01/2026;despesa;Almoço;Restaurantes;42,50\n";
