/**
 * Lightweight query count instrumentation for N+1 detection.
 * Enable with QUERY_DEBUG=true environment variable.
 * 
 * Usage:
 *   const tracker = createQueryTracker("endpoint-name");
 *   tracker.track("query-description");
 *   // ... run queries ...
 *   tracker.log(); // outputs summary if QUERY_DEBUG=true
 */

interface QueryTracker {
  track: (label: string) => void;
  log: () => { label: string; count: number; queries: string[] };
  getCount: () => number;
}

export function createQueryTracker(label: string): QueryTracker {
  const isEnabled = process.env.QUERY_DEBUG === "true";
  const queries: string[] = [];
  const startTime = Date.now();

  return {
    track(queryLabel: string) {
      if (isEnabled) {
        queries.push(queryLabel);
      }
    },
    log() {
      const elapsed = Date.now() - startTime;
      const result = { label, count: queries.length, queries };
      
      if (isEnabled && queries.length > 0) {
        console.log(`[QUERY_DEBUG] ${label}: ${queries.length} queries in ${elapsed}ms`);
        if (queries.length > 5) {
          const grouped: Record<string, number> = {};
          for (const q of queries) {
            grouped[q] = (grouped[q] || 0) + 1;
          }
          console.log(`[QUERY_DEBUG] Query breakdown:`, grouped);
        }
      }
      
      return result;
    },
    getCount() {
      return queries.length;
    }
  };
}

export function isQueryDebugEnabled(): boolean {
  return process.env.QUERY_DEBUG === "true";
}
