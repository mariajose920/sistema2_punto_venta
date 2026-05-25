type PerfStats = {
  count: number;
  totalMs: number;
  lastMs: number;
};

const perfStats = new Map<string, PerfStats>();

export function logPerf(label: string, durationMs: number, extra?: Record<string, unknown>) {
  const stats = perfStats.get(label) ?? { count: 0, totalMs: 0, lastMs: 0 };
  stats.count += 1;
  stats.totalMs += durationMs;
  stats.lastMs = durationMs;
  perfStats.set(label, stats);

  const extras = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[PERF] ${label}: ${durationMs.toFixed(2)}ms${extras}`);
}

export async function measureAsync<T>(label: string, fn: () => Promise<T>, extra?: Record<string, unknown>) {
  const start = performance.now();
  try {
    const result = await fn();
    logPerf(label, performance.now() - start, extra);
    return result;
  } catch (error) {
    logPerf(`${label} (error)`, performance.now() - start, extra);
    throw error;
  }
}

export function getPerfSnapshot() {
  return Array.from(perfStats.entries()).reduce<Record<string, PerfStats>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}
