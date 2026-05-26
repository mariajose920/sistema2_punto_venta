// utils/perfLogger.ts
/**
 * Simple performance logger used across the app.
 * Logs are prefixed with `[PERF_AUTH]` and include the label and elapsed time in ms.
 * In production (`process.env.NODE_ENV === 'production'`) the logs are silenced to avoid leaking timing info.
 */
export function logPerf(label: string, start: number): void {
  if (process.env.NODE_ENV !== 'production') {
    const elapsed = performance.now() - start;
    console.log(`[PERF_AUTH] ${label}: ${elapsed.toFixed(2)}ms`);
  }
}
