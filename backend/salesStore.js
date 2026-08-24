const { sql, ensureSchema } = require('./db');

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    category: row.category,
    paymentMethod: row.payment_method,
    soldAt: Number(row.sold_at),
    createdAt: Number(row.created_at),
  };
}

// Vendas feitas na loja física (fora do catálogo da vitrine) — um registro
// à parte, sem ligação com itemsStore. Mais recente primeiro.
async function getAll() {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM sales ORDER BY sold_at DESC`;
  return rows.map(mapRow);
}

async function getSince(since) {
  await ensureSchema();
  const cutoff = since || 0;
  const { rows } = await sql`SELECT * FROM sales WHERE sold_at >= ${cutoff} ORDER BY sold_at DESC`;
  return rows.map(mapRow);
}

async function create(sale) {
  await ensureSchema();
  await sql`
    INSERT INTO sales (id, name, price, category, payment_method, sold_at, created_at)
    VALUES (${sale.id}, ${sale.name}, ${sale.price}, ${sale.category}, ${sale.paymentMethod}, ${sale.soldAt}, ${sale.createdAt})
  `;
  return sale;
}

async function remove(id) {
  await ensureSchema();
  const { rows } = await sql`DELETE FROM sales WHERE id = ${id} RETURNING *`;
  return rows[0] ? mapRow(rows[0]) : null;
}

module.exports = {
  getAll,
  getSince,
  create,
  remove,
};
