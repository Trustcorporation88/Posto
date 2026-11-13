import type { QueryClient, QueryKey } from "@tanstack/react-query";

const PRIVATE_MODULES = new Set([
  "businessAuth",
  "businessAdmin",
  "cash",
  "fuel",
]);

export function isBusinessQueryKey(queryKey: QueryKey): boolean {
  const path = queryKey[0];
  const module = Array.isArray(path) ? path[0] : path;
  return (
    typeof module === "string" && PRIVATE_MODULES.has(module.split(".")[0])
  );
}

/** Cancel old requests before discarding their cache when the session changes. */
export async function clearBusinessQueryCache(client: QueryClient): Promise<void> {
  const filters = {
    predicate: (query: { queryKey: QueryKey }) =>
      isBusinessQueryKey(query.queryKey),
  };
  await client.cancelQueries(filters);
  client.removeQueries(filters);
}
