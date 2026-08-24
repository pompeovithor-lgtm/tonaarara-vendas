const { sql, ensureSchema } = require('./db');

async function record(visit) {
  await ensureSchema();
  await sql`
    INSERT INTO visits (id, path, referrer, visitor_id, device, timestamp)
    VALUES (${visit.id}, ${visit.path}, ${visit.referrer || null}, ${visit.visitorId}, ${visit.device || null}, ${visit.timestamp})
  `;
  return visit;
}

function toDayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

// Resumo usado pelo painel: total de visitas, visitantes únicos, série
// diária contínua (sem "buracos") desde `since` até hoje, páginas mais
// visitadas e de onde os visitantes vieram.
async function getSummary({ since } = {}) {
  await ensureSchema();
  const cutoff = since || Date.now() - 13 * 24 * 60 * 60 * 1000; // padrão: últimos 14 dias
  const { rows } = await sql`SELECT * FROM visits WHERE timestamp >= ${cutoff}`;
  const visits = rows.map((r) => ({
    path: r.path,
    referrer: r.referrer,
    visitorId: r.visitor_id,
    timestamp: Number(r.timestamp),
  }));

  const totalVisits = visits.length;
  const uniqueVisitors = new Set(visits.map((v) => v.visitorId)).size;

  const dayCounts = {};
  visits.forEach((v) => {
    const day = toDayKey(v.timestamp);
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  });
  const visitsByDay = [];
  const cursor = new Date(cutoff);
  cursor.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let d = cursor; d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    visitsByDay.push({ date: key, count: dayCounts[key] || 0 });
  }

  const pageCounts = {};
  visits.forEach((v) => {
    pageCounts[v.path] = (pageCounts[v.path] || 0) + 1;
  });
  const topPages = Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  const referrerCounts = {};
  visits.forEach((v) => {
    const referrer = v.referrer || '(direto)';
    referrerCounts[referrer] = (referrerCounts[referrer] || 0) + 1;
  });
  const topReferrers = Object.entries(referrerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([referrer, count]) => ({ referrer, count }));

  return { totalVisits, uniqueVisitors, visitsByDay, topPages, topReferrers };
}

// Conta visitas num intervalo fechado-aberto [since, until) — usado pelo
// resumo diário por e-mail, que precisa do total de exatamente "ontem".
async function countInRange(since, until) {
  await ensureSchema();
  const { rows } = await sql`SELECT COUNT(*)::int AS c FROM visits WHERE timestamp >= ${since} AND timestamp < ${until}`;
  return rows[0].c;
}

module.exports = { record, getSummary, countInRange };
