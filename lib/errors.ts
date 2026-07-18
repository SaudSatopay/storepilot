export function friendlyErrorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";

  if (
    raw.includes("Can't reach database server") ||
    raw.includes("ECONNREFUSED") ||
    raw.includes("Connection terminated") ||
    raw.includes("Closed") ||
    raw.includes("socket")
  ) {
    return "The store database is not reachable right now. Make sure pnpm db:local is running, then try again.";
  }

  return fallback;
}

export function logServerError(scope: string, error: unknown) {
  console.error(`[storepilot:${scope}]`, error);
}
