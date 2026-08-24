const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'items.json');

const STATUSES = ['disponivel', 'reservado', 'vendido'];

function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function readItems() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeItems(items) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
}

// Deixa o item no formato atual mesmo que ainda esteja no formato antigo
// (campo "image" único, sem "status") — assim o servidor não quebra com
// itens cadastrados antes dessa mudança, mesmo antes de rodar
// scripts/migrate-item-images.js. Também usada para "curar" o registro no
// arquivo sempre que o item é salvo de novo (ver update/create).
function normalize(item) {
  const images = Array.isArray(item.images) ? item.images : item.image ? [item.image] : [];
  const status = STATUSES.includes(item.status) ? item.status : 'disponivel';
  // Quando o item foi marcado "vendido" (null se nunca foi, ou se voltou a
  // outro status) — o Financeiro do painel usa isso pra filtrar vendas do
  // site por período. Um número já validado; qualquer outra coisa vira null.
  const soldAt = typeof item.soldAt === 'number' ? item.soldAt : null;
  const { image, ...rest } = item;
  return { ...rest, images, status, soldAt };
}

function getAll() {
  return readItems().map(normalize).sort((a, b) => b.createdAt - a.createdAt);
}

function getById(id) {
  const item = readItems().find((i) => i.id === id);
  return item ? normalize(item) : null;
}

function create(item) {
  const items = readItems();
  const normalized = normalize(item);
  items.push(normalized);
  writeItems(items);
  return normalized;
}

function update(id, changes) {
  const items = readItems();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  // "soldAt" acompanha sozinho a mudança de status: vira "agora" no instante
  // em que o item passa a ser "vendido" (é o que dá pra filtrar vendas do
  // site por período no Financeiro) e volta a null se o status mudar pra
  // outra coisa (ex.: reaberto de volta pra "disponível" por engano).
  const current = normalize(items[index]);
  const finalChanges = { ...changes };
  if (changes.status !== undefined && changes.status !== current.status) {
    finalChanges.soldAt = changes.status === 'vendido' ? Date.now() : null;
  }

  const merged = normalize({ ...items[index], ...finalChanges });
  items[index] = merged;
  writeItems(items);
  return merged;
}

function remove(id) {
  const items = readItems();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const [removed] = items.splice(index, 1);
  writeItems(items);
  return normalize(removed);
}

// Busca/filtro usado pela vitrine pública (e, com mostrarVendidos, pelo
// painel). Por padrão os itens "vendido" ficam de fora — a vitrine nunca
// pede mostrarVendidos, então o cliente final nunca vê peça já vendida;
// "reservado" continua aparecendo, é o frontend que mostra o selo.
function search(filtros = {}) {
  const { precoMin, precoMax, ordenar, mostrarVendidos } = filtros;
  // Limita o tamanho dos parâmetros de texto vindos da querystring — sem
  // isto, alguém poderia mandar uma URL com um "q" gigante só pra fazer o
  // servidor comparar strings enormes contra cada item à toa.
  const q = typeof filtros.q === 'string' ? filtros.q.slice(0, 200) : filtros.q;
  const categoria = typeof filtros.categoria === 'string' ? filtros.categoria.slice(0, 60) : filtros.categoria;
  const tamanho = typeof filtros.tamanho === 'string' ? filtros.tamanho.slice(0, 10) : filtros.tamanho;

  let items = readItems().map(normalize);

  if (!mostrarVendidos) {
    items = items.filter((item) => item.status !== 'vendido');
  }

  if (q) {
    const needle = q.trim().toLowerCase();
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        (item.description || '').toLowerCase().includes(needle)
    );
  }

  if (categoria) {
    const needle = categoria.trim().toLowerCase();
    items = items.filter((item) => (item.category || '').toLowerCase() === needle);
  }

  if (tamanho) {
    const needle = tamanho.trim().toUpperCase();
    items = items.filter((item) => item.size === needle);
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

// Itens vendidos com soldAt a partir de "since" — mesmo padrão de "since"
// (sem limite superior, sempre até agora) usado nas outras rotas de
// estatística do painel. Alimenta o total "vendido no site" do Financeiro.
function getSoldSince(since) {
  const cutoff = since || 0;
  return readItems()
    .map(normalize)
    .filter((item) => item.status === 'vendido' && item.soldAt !== null && item.soldAt >= cutoff);
}

// Usada pela tela de categorias: impede excluir uma categoria em uso.
function isCategoryInUse(name) {
  const needle = name.trim().toLowerCase();
  return readItems().some((item) => (item.category || '').toLowerCase() === needle);
}

// Usada ao renomear uma categoria: atualiza o texto em todos os itens que a
// usam. Devolve quantos itens foram alterados.
function renameCategory(oldName, newName) {
  const needle = oldName.trim().toLowerCase();
  const items = readItems();
  let count = 0;
  const updated = items.map((item) => {
    if ((item.category || '').toLowerCase() === needle) {
      count += 1;
      return { ...item, category: newName };
    }
    return item;
  });
  if (count > 0) writeItems(updated);
  return count;
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
