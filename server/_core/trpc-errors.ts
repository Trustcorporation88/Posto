import type { TRPCError } from "@trpc/server";

export const INTERNAL_ERROR_MESSAGE =
  "Ocorreu um erro interno. Nada foi confirmado; tente novamente em instantes.";

/**
 * Unexpected failures (database, driver, programming errors) can carry SQL text or
 * internal details in their message. Clients only receive a generic message for them;
 * intentional TRPCErrors with other codes keep their user-facing message.
 */
export function publicErrorMessage(code: TRPCError["code"], message: string) {
  return code === "INTERNAL_SERVER_ERROR" ? INTERNAL_ERROR_MESSAGE : message;
}

function causeSummary(error: TRPCError) {
  const cause = error.cause as { name?: unknown; code?: unknown } | undefined;
  const name = typeof cause?.name === "string" ? cause.name : "Error";
  // Driver codes such as ER_LOCK_DEADLOCK help operations without exposing values.
  const code = typeof cause?.code === "string" && /^[A-Z0-9_]{1,64}$/.test(cause.code) ? ` ${cause.code}` : "";
  return `${name}${code}`;
}

/**
 * Server-side record of unexpected failures. Never logs input, messages, cookies or
 * tokens: only the procedure path, its type and the error class/driver code.
 */
export function logTrpcError({
  error,
  type,
  path,
}: {
  error: TRPCError;
  type: string;
  path?: string;
}) {
  if (error.code !== "INTERNAL_SERVER_ERROR") return;
  console.error(`[tRPC] ${type} ${path ?? "unknown"} failed: ${causeSummary(error)}`);
}
