const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'visits.json');

function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function readVisits() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeVisits(visits) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(visits, null, 2), 'utf8');
}

function record(visit) {
  const visits = readVisits();
  visits.push(visit);
  writeVisits(visits);
  return visit;
}

function toDayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

// Resumo usado pelo painel (fase seguinte): total de visitas, visitantes
// únicos, série diária contínua (sem "buracos") desde `since` até hoje,
// páginas mais visitadas e de onde os visitantes vieram.
function getSummary({ since } = {}) {
  const cutoff = since || Date.now() - 13 * 24 * 60 * 60 * 1000; // padrão: últimos 14 dias
  const visits = readVisits().filter((v) => v.timestamp >= cutoff);

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
// resumo diário por e-mail, que precisa do total de exatamente "ontem",
// diferente de getSummary() (que conta tudo desde um ponto até agora).
function countInRange(since, until) {
  return readVisits().filter((v) => v.timestamp >= since && v.timestamp < until).length;
}

module.exports = { record, getSummary, countInRange };
