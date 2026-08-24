const { sql, ensureSchema } = require('./db');

const STATUSES = ['disponivel', 'reservado', 'vendido'];

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    size: row.size,
    category: row.category,
    status: row.status,
    images: row.images || [],
    createdAt: Number(row.created_at),
    soldAt: row.sold_at === null || row.sold_at === undefined ? null : Number(row.sold_at),
  };
}

async function getAll() {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM items ORDER BY created_at DESC`;
  return rows.map(mapRow);
}

async function getById(id) {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM items WHERE id = ${id}`;
  return rows[0] ? mapRow(rows[0]) : null;
}

async function create(item) {
  await ensureSchema();
  const { rows } = await sql`
    INSERT INTO items (id, name, description, price, size, category, status, images, created_at, sold_at)
    VALUES (
      ${item.id}, ${item.name}, ${item.description}, ${item.price}, ${item.size}, ${item.category},
      ${item.status || 'disponivel'}, ${JSON.stringify(item.images || [])}::jsonb, ${item.createdAt}, ${item.soldAt ?? null}
    )
    RETURNING *
  `;
  return mapRow(rows[0]);
}

async function update(id, changes) {
  await ensureSchema();
  const current = await getById(id);
  if (!current) return null;

  // "soldAt" acompanha sozinho a mudança de status: vira "agora" no instante
  // em que o item passa a ser "vendido" e volta a null se o status mudar
  // pra outra coisa.
  const finalChanges = { ...changes };
  if (changes.status !== undefined && changes.status !== current.status) {
    finalChanges.soldAt = changes.status === 'vendido' ? Date.now() : null;
  }

  const merged = { ...current, ...finalChanges };

  const { rows } = await sql`
    UPDATE items SET
      name = ${merged.name},
      description = ${merged.description},
      price = ${merged.price},
      size = ${merged.size},
      category = ${merged.category},
      status = ${merged.status},
      images = ${JSON.stringify(merged.images || [])}::jsonb,
      sold_at = ${merged.soldAt ?? null}
    WHERE id = ${id}
    RETURNING *
  `;
  return mapRow(rows[0]);
}

async function remove(id) {
  await ensureSchema();
  const { rows } = await sql`DELETE FROM items WHERE id = ${id} RETURNING *`;
  return rows[0] ? mapRow(rows[0]) : null;
}

// Busca/filtro usado pela vitrine pública (e, com mostrarVendidos, pelo
// painel). Dataset pequeno o bastante pra filtrar em JS depois de um único
// SELECT * ser mais simples (e igualmente rápido) que montar SQL dinâmico.
async function search(filtros = {}) {
  const { precoMin, precoMax, ordenar, mostrarVendidos } = filtros;
  const q = typeof filtros.q === 'string' ? filtros.q.slice(0, 200).trim().toLowerCase() : undefined;
  const categoria = typeof filtros.categoria === 'string' ? filtros.categoria.slice(0, 60).trim().toLowerCase() : undefined;
  const tamanho = typeof filtros.tamanho === 'string' ? filtros.tamanho.slice(0, 10).trim().toUpperCase() : undefined;

  let items = await getAll();

  if (!mostrarVendidos) {
    items = items.filter((item) => item.status !== 'vendido');
  }
  if (q) {
    items = items.filter(
      (item) => item.name.toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q)
    );
  }
  if (categoria) {
    items = items.filter((item) => (item.category || '').toLowerCase() === categoria);
  }
  if (tamanho) {
    items = items.filter((item) => item.size === tamanho);
  }
  if (typeof precoMin === 'number') {
    items = items.filter((item) => item.price >= precoMin);
  }
  if (typeof precoMax === 'number') {
    items = items.filter((item) => item.price <= precoMax);
  }

  if (ordenar === 'menor-preco') {
    items = items.slice().sort((a, b) => a.price - b.price);
  } else if (ordenar === 'maior-preco') {
    items = items.slice().sort((a, b) => b.price - a.price);
  } else {
    items = items.slice().sort((a, b) => b.createdAt - a.createdAt);
  }

  return items;
}

async function getSoldSince(since) {
  const cutoff = since || 0;
  const all = await getAll();
  return all.filter((item) => item.status === 'vendido' && item.soldAt !== null && item.soldAt >= cutoff);
}

async function isCategoryInUse(name) {
  await ensureSchema();
  const needle = name.trim().toLowerCase();
  const { rows } = await sql`SELECT 1 FROM items WHERE LOWER(category) = ${needle} LIMIT 1`;
  return rows.length > 0;
}

async function renameCategory(oldName, newName) {
  await ensureSchema();
  const needle = oldName.trim().toLowerCase();
  const { rowCount } = await sql`UPDATE items SET category = ${newName} WHERE LOWER(category) = ${needle}`;
  return rowCount;
}

module.exports = {
  STATUSES,
  getAll,
  getById,
  search,
  create,
  update,
  remove,
  getSoldSince,
  isCategoryInUse,
  renameCategory,
};
