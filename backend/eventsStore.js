const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'events.json');

const EVENT_TYPES = ['item_view', 'whatsapp_click', 'search'];

function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function readEvents() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeEvents(events) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2), 'utf8');
}

function record(event) {
  const events = readEvents();
  events.push(event);
  writeEvents(events);
  return event;
}

// Cliques em "comprar no WhatsApp", agrupados por item (mais clicado
// primeiro). O painel (fase seguinte) cruza o itemId com itemsStore pra
// mostrar o nome da peça.
function getWhatsappClicksByItem({ since } = {}) {
  const cutoff = since || 0;
  const events = readEvents().filter(
    (e) => e.type === 'whatsapp_click' && e.itemId && e.timestamp >= cutoff
  );
  const counts = {};
  events.forEach((e) => {
    counts[e.itemId] = (counts[e.itemId] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([itemId, count]) => ({ itemId, count }));
}

// Termos mais buscados na vitrine, normalizados (sem espaços nas pontas,
// minúsculo) pra "Camisa" e "camisa " contarem como a mesma busca.
function getTopSearches({ since, limit = 20 } = {}) {
  const cutoff = since || 0;
  const events = readEvents().filter(
    (e) => e.type === 'search' && e.query && e.timestamp >= cutoff
  );
  const counts = {};
  events.forEach((e) => {
    const query = e.query.trim().toLowerCase();
    if (!query) return;
    counts[query] = (counts[query] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([query, count]) => ({ query, count }));
}

// Peças mais visualizadas (evento "item_view"), mais vistas primeiro.
function getTopViewedItems({ since, limit = 5 } = {}) {
  const cutoff = since || 0;
  const events = readEvents().filter(
    (e) => e.type === 'item_view' && e.itemId && e.timestamp >= cutoff
  );
  const counts = {};
  events.forEach((e) => {
    counts[e.itemId] = (counts[e.itemId] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([itemId, count]) => ({ itemId, count }));
}

// Cliques em "comprar no WhatsApp", um por um (não agrupados), do mais
// recente pro mais antigo — é o que alimenta a aba "Interessados" do painel.
function getWhatsappClickEvents() {
  return readEvents()
    .filter((e) => e.type === 'whatsapp_click')
    .sort((a, b) => b.timestamp - a.timestamp);
}

// Conta eventos de um tipo num intervalo fechado-aberto [since, until) —
// usado pelo resumo diário por e-mail (cliques em "Comprar no WhatsApp" de
// exatamente "ontem").
function countInRange(type, since, until) {
  return readEvents().filter((e) => e.type === type && e.timestamp >= since && e.timestamp < until).length;
}

module.exports = {
  EVENT_TYPES,
  record,
  getWhatsappClicksByItem,
  getTopSearches,
  getTopViewedItems,
  getWhatsappClickEvents,
  countInRange,
};
