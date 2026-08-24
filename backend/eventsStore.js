const { sql, ensureSchema } = require('./db');

const EVENT_TYPES = ['item_view', 'whatsapp_click', 'search'];

async function record(event) {
  await ensureSchema();
  await sql`
    INSERT INTO events (id, type, item_id, query, visitor_id, timestamp)
    VALUES (${event.id}, ${event.type}, ${event.itemId || null}, ${event.query || null}, ${event.visitorId}, ${event.timestamp})
  `;
  return event;
}

// Cliques em "comprar no WhatsApp", agrupados por item (mais clicado
// primeiro). server.js cruza o itemId com itemsStore pra mostrar o nome da
// peça.
async function getWhatsappClicksByItem({ since } = {}) {
  await ensureSchema();
  const cutoff = since || 0;
  const { rows } = await sql`
    SELECT item_id, COUNT(*)::int AS count FROM events
    WHERE type = 'whatsapp_click' AND item_id IS NOT NULL AND timestamp >= ${cutoff}
    GROUP BY item_id ORDER BY count DESC
  `;
  return rows.map((r) => ({ itemId: r.item_id, count: r.count }));
}

// Termos mais buscados na vitrine, normalizados (sem espaços nas pontas,
// minúsculo) pra "Camisa" e "camisa " contarem como a mesma busca.
async function getTopSearches({ since, limit = 20 } = {}) {
  await ensureSchema();
  const cutoff = since || 0;
  const { rows } = await sql`
    SELECT LOWER(TRIM(query)) AS query, COUNT(*)::int AS count FROM events
    WHERE type = 'search' AND query IS NOT NULL AND TRIM(query) != '' AND timestamp >= ${cutoff}
    GROUP BY LOWER(TRIM(query)) ORDER BY count DESC LIMIT ${limit}
  `;
  return rows;
}

// Peças mais visualizadas (evento "item_view"), mais vistas primeiro.
async function getTopViewedItems({ since, limit = 5 } = {}) {
  await ensureSchema();
  const cutoff = since || 0;
  const { rows } = await sql`
    SELECT item_id, COUNT(*)::int AS count FROM events
    WHERE type = 'item_view' AND item_id IS NOT NULL AND timestamp >= ${cutoff}
    GROUP BY item_id ORDER BY count DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({ itemId: r.item_id, count: r.count }));
}

// Cliques em "comprar no WhatsApp", um por um (não agrupados), do mais
// recente pro mais antigo — é o que alimenta a aba "Interessados" do painel.
async function getWhatsappClickEvents() {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM events WHERE type = 'whatsapp_click' ORDER BY timestamp DESC`;
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    itemId: r.item_id,
    query: r.query,
    visitorId: r.visitor_id,
    timestamp: Number(r.timestamp),
  }));
}

// Conta eventos de um tipo num intervalo fechado-aberto [since, until) —
// usado pelo resumo diário por e-mail.
async function countInRange(type, since, until) {
  await ensureSchema();
  const { rows } = await sql`
    SELECT COUNT(*)::int AS c FROM events WHERE type = ${type} AND timestamp >= ${since} AND timestamp < ${until}
  `;
  return rows[0].c;
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
