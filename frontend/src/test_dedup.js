const rawLogs = [
  { id: -1, date: '2026-07-22T08:00:00Z', action: 'Création Gestion', module: 'Gestion', related_id: 1 },
  { id: -2, date: '2026-07-22T08:05:00Z', action: 'Modification Gestion', module: 'Gestion', related_id: 1 },
];

const sortedLogs = rawLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
const seen = new Map();

for (const log of sortedLogs) {
  const key = log.related_id ? `${log.module}|${log.related_id}` : `${log.module}|${log.action}|${log.id}`;
  const existing = seen.get(key);
  if (!existing) {
    seen.set(key, log);
  } else {
    if (new Date(log.date).getTime() === new Date(existing.date).getTime()) {
      if (log.id > 0 && existing.id < 0) {
        seen.set(key, log);
      }
    }
    const logActionLower = (log.action || '').toLowerCase();
    if (logActionLower.includes('annul') || logActionLower.includes('suppression')) {
      seen.set(key, log);
    }
  }
}

console.log(Array.from(seen.values()));
