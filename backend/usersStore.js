const { sql, ensureSchema } = require('./db');

// Só existem dois níveis de acesso: "admin" (pode gerenciar quem mais tem
// acesso ao painel, além de tudo que um colaborador já pode) e
// "colaborador" (cadastra/edita itens, categorias, vê estatísticas — só não
// mexe em permissões de outras contas). Contas sem "role" gravado são
// tratadas como "admin", pra não tirar acesso de ninguém que já tinha conta.
const ROLES = ['admin', 'colaborador'];

function isAdmin(user) {
  return Boolean(user) && (!user.role || user.role === 'admin');
}

function mapRow(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    resetTokenHash: row.reset_token_hash,
    resetTokenExpires: row.reset_token_expires === null ? null : Number(row.reset_token_expires),
    createdAt: Number(row.created_at),
  };
}

async function count() {
  await ensureSchema();
  const { rows } = await sql`SELECT COUNT(*)::int AS c FROM users`;
  return rows[0].c;
}

async function getAll() {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM users ORDER BY created_at`;
  return rows.map(mapRow);
}

async function findByUsername(username) {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM users WHERE LOWER(username) = ${username.toLowerCase()}`;
  return rows[0] ? mapRow(rows[0]) : null;
}

async function findByEmail(email) {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM users WHERE LOWER(email) = ${email.toLowerCase()}`;
  return rows[0] ? mapRow(rows[0]) : null;
}

async function findByUsernameOrEmail(value) {
  return (await findByUsername(value)) || (await findByEmail(value));
}

async function findById(id) {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ? mapRow(rows[0]) : null;
}

async function create(user) {
  await ensureSchema();
  await sql`
    INSERT INTO users (id, username, email, password_hash, role, reset_token_hash, reset_token_expires, created_at)
    VALUES (
      ${user.id}, ${user.username}, ${user.email}, ${user.passwordHash}, ${user.role || null},
      ${user.resetTokenHash || null}, ${user.resetTokenExpires || null}, ${user.createdAt}
    )
  `;
  return user;
}

async function update(id, changes) {
  await ensureSchema();
  const current = await findById(id);
  if (!current) return null;
  const merged = { ...current, ...changes };
  await sql`
    UPDATE users SET
      username = ${merged.username},
      email = ${merged.email},
      password_hash = ${merged.passwordHash},
      role = ${merged.role || null},
      reset_token_hash = ${merged.resetTokenHash || null},
      reset_token_expires = ${merged.resetTokenExpires || null}
    WHERE id = ${id}
  `;
  return merged;
}

module.exports = {
  ROLES,
  isAdmin,
  count,
  getAll,
  findByUsername,
  findByEmail,
  findByUsernameOrEmail,
  findById,
  create,
  update,
};
