/**
 * TiDB pessimistic RR snapshot reads can predate a waited-for location lock.
 * Writers read committed aggregates after that lock; read-only snapshots stay RR.
 * This is a next-transaction option, never a global or persistent session SET.
 * https://docs.pingcap.com/tidbcloud/transaction-isolation-levels/
 */
export const CASH_WRITE_TRANSACTION_CONFIG = Object.freeze({
  isolationLevel: "read committed" as const,
});
