const { sql, ensureSchema } = require('./db');

async function getAll() {
  await ensureSchema();
  const { rows } = await sql`SELECT name FROM categories`;
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Garante que a categoria exista na lista (sem duplicar por causa de
// maiúscula/minúscula) e devolve o nome já cadastrado, se houver.
async function ensure(name) {
  await ensureSchema();
  const clean = name.trim();
  const { rows } = await sql`SELECT name FROM categories WHERE LOWER(name) = ${clean.toLowerCase()}`;
  if (rows[0]) return rows[0].name;
  await sql`INSERT INTO categories (name) VALUES (${clean}) ON CONFLICT (name) DO NOTHING`;
  return clean;
}

// Renomeia uma categoria existente. Se já existir outra categoria com o
// nome novo (ignorando maiúscula/minúscula), não duplica — só remove a
// antiga, deixando as duas fundidas em uma. Devolve o nome salvo, ou null
// se a categoria antiga não existia.
async function rename(oldName, newName) {
  await ensureSchema();
  const oldNeedle = oldName.trim().toLowerCase();
  const { rows: existingRows } = await sql`SELECT name FROM categories WHERE LOWER(name) = ${oldNeedle}`;
  if (!existingRows[0]) return null;

  const clean = newName.trim();
  const { rows: dupRows } = await sql`
    SELECT name FROM categories WHERE LOWER(name) = ${clean.toLowerCase()} AND LOWER(name) != ${oldNeedle}
  `;

  if (dupRows[0]) {
    await sql`DELETE FROM categories WHERE LOWER(name) = ${oldNeedle}`;
  } else {
    await sql`UPDATE categories SET name = ${clean} WHERE LOWER(name) = ${oldNeedle}`;
  }

  return clean;
}

// Remove uma categoria da lista. Não verifica se está em uso — quem chama
// (server.js) decide isso antes, consultando itemsStore.isCategoryInUse.
async function remove(name) {
  await ensureSchema();
  const { rowCount } = await sql`DELETE FROM categories WHERE LOWER(name) = ${name.toLowerCase()}`;
  return rowCount > 0;
}

module.exports = { getAll, ensure, rename, remove };
