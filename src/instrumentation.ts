import type { Instrumentation } from "next";

// One structured JSON line per unhandled server error, so they're searchable
// and alertable in Vercel's log view (filter on "server_error"). Swap the
// console.error for Sentry etc. here if an error tracker is added later.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const error = err as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      event: "server_error",
      message: error?.message ?? String(err),
      digest: error?.digest,
      stack: error?.stack?.split("\n").slice(0, 8).join("\n"),
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
    })
  );
};
