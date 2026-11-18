/** Records a finished search (a pick or Enter) for the admin Insights page. Fire and forget. */
export function logSearch(q: string, results: number, city?: string | null) {
  const query = q.trim();
  if (query.length < 2) return;
  void fetch("/api/search/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: query.slice(0, 60), results: Math.min(results, 100), ...(city ? { city } : {}) }),
    keepalive: true,
  }).catch(() => {});
}
