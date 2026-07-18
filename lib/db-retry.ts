const RETRYABLE_PATTERNS = [
  "Can't reach database server",
  "ECONNREFUSED",
  "Connection terminated",
  "server has closed the connection",
];

function isRetryable(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Retries a database operation once after a short pause when the failure looks
 * like a transient connection drop. The local PGlite server can blip under
 * bursty parallel load; one retry absorbs that without hiding real errors.
 */
export async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryable(error)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
    return operation();
  }
}
