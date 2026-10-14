// Minimal scripted stand-in for the Supabase query builder. Each awaited query
// takes the next queued response for its table and records the calls made.

type Response = { data?: unknown; error?: unknown; count?: number };

export interface RecordedQuery {
  table: string;
  calls: [string, ...unknown[]][];
  has(method: string, ...args: unknown[]): boolean;
}

export function createFakeSupabase() {
  const queues = new Map<string, Response[]>();
  const queries: RecordedQuery[] = [];

  function next(table: string): Response {
    return queues.get(table)?.shift() ?? { data: null, error: null };
  }

  function from(table: string) {
    const record: RecordedQuery = {
      table,
      calls: [],
      has: (method, ...args) => record.calls.some(([m, ...a]) =>
        m === method && args.every((arg, i) => JSON.stringify(a[i]) === JSON.stringify(arg))),
    };
    queries.push(record);
    const resolve = () => Promise.resolve({ data: null, error: null, count: 0, ...next(table) });
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "insert", "update", "delete", "eq", "in", "is", "not", "gte", "lte", "lt", "order", "limit", "range", "or"]) {
      builder[method] = (...args: unknown[]) => { record.calls.push([method, ...args]); return builder; };
    }
    builder.single = () => resolve();
    builder.maybeSingle = () => resolve();
    builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected);
    return builder;
  }

  return {
    client: { from },
    queries,
    /** Queue responses for a table, consumed in query order. */
    queue(table: string, ...responses: Response[]) {
      queues.set(table, [...(queues.get(table) ?? []), ...responses]);
    },
    on(table: string) { return queries.filter((q) => q.table === table); },
    reset() { queues.clear(); queries.length = 0; },
  };
}
