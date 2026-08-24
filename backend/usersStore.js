const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'users.json');

function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function readUsers() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// Só existem dois níveis de acesso: "admin" (pode gerenciar quem mais tem
// acesso ao painel, além de tudo que um colaborador já pode) e
// "colaborador" (cadastra/edita itens, categorias, vê estatísticas — só não
// mexe em permissões de outras contas). Contas antigas, salvas antes desse
// campo existir, não têm "role" no arquivo — tratamos a ausência dele como
// "admin" pra não tirar acesso de ninguém que já tinha conta.
const ROLES = ['admin', 'colaborador'];

function isAdmin(user) {
  return Boolean(user) && (!user.role || user.role === 'admin');
}

function count() {
  return readUsers().length;
}

function getAll() {
  return readUsers();
}

function findByUsername(username) {
  const needle = username.toLowerCase();
  return readUsers().find((u) => u.username.toLowerCase() === needle) || null;
}

function findByEmail(email) {
  const needle = email.toLowerCase();
  return readUsers().find((u) => u.email && u.email.toLowerCase() === needle) || null;
}

function findByUsernameOrEmail(value) {
  return findByUsername(value) || findByEmail(value);
}

function findById(id) {
  return readUsers().find((u) => u.id === id) || null;
}

function create(user) {
  const users = readUsers();
  users.push(user);
  writeUsers(users);
  return user;
}

function update(id, changes) {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return null;
  users[index] = { ...users[index], ...changes };
  writeUsers(users);
  return users[index];
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
