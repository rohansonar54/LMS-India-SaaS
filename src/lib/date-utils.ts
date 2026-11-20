/**
 * Safe date boundary parser for LMS APIs and frontend filters.
 * Ensures dates like '2026-11-20' cover the full 24-hour day in local server time
 * (00:00:00.000 to 23:59:59.999) rather than collapsing to a 0-millisecond UTC midnight window.
 */
export function parseDateBoundaries(
  startDateParam?: string | null,
  endDateParam?: string | null
): { start: Date | null; end: Date | null } {
  let start: Date | null = null;
  let end: Date | null = null;

  if (startDateParam && startDateParam.trim()) {
    const s = startDateParam.trim();
    if (s.includes('T')) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) start = d;
    } else {
      const parts = s.split('-').map(Number);
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        start = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
      }
    }
  }

  if (endDateParam && endDateParam.trim()) {
    const e = endDateParam.trim();
    if (e.includes('T')) {
      const d = new Date(e);
      if (!isNaN(d.getTime())) end = d;
    } else {
      const parts = e.split('-').map(Number);
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        end = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
      }
    }
  }

  return { start, end };
}

/**
 * Returns formatted YYYY-MM-DD for a given Date in local time.
 */
export function formatLocalDate(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
