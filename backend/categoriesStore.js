const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'categories.json');

function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function readCategories() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeCategories(categories) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(categories, null, 2), 'utf8');
}

function getAll() {
  return readCategories().sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Garante que a categoria exista na lista (sem duplicar por causa de
// maiúscula/minúscula) e devolve o nome já cadastrado, se houver.
function ensure(name) {
  const clean = name.trim();
  const categories = readCategories();
  const existing = categories.find((c) => c.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  categories.push(clean);
  writeCategories(categories);
  return clean;
}

// Renomeia uma categoria existente. Se já existir outra categoria com o
// nome novo (ignorando maiúscula/minúscula), não duplica — só remove a
// antiga, deixando as duas fundidas em uma. Devolve o nome salvo, ou null
// se a categoria antiga não existia.
function rename(oldName, newName) {
  const categories = readCategories();
  const index = categories.findIndex((c) => c.toLowerCase() === oldName.toLowerCase());
  if (index === -1) return null;

  const clean = newName.trim();
  const duplicateIndex = categories.findIndex(
    (c, i) => i !== index && c.toLowerCase() === clean.toLowerCase()
  );

  if (duplicateIndex !== -1) {
    categories.splice(index, 1);
  } else {
    categories[index] = clean;
  }

  writeCategories(categories);
  return clean;
}

// Remove uma categoria da lista. Não verifica se está em uso — quem chama
// (server.js) decide isso antes, consultando itemsStore.isCategoryInUse.
function remove(name) {
  const categories = readCategories();
  const index = categories.findIndex((c) => c.toLowerCase() === name.toLowerCase());
  if (index === -1) return false;
  categories.splice(index, 1);
  writeCategories(categories);
  return true;
}

module.exports = { getAll, ensure, rename, remove };
