const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'sales.json');

function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function readSales() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeSales(sales) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(sales, null, 2), 'utf8');
}

// Vendas feitas na loja física (fora do catálogo da vitrine) — um registro
// à parte, sem ligação com itemsStore. Mais recente primeiro.
function getAll() {
  return readSales().sort((a, b) => b.soldAt - a.soldAt);
}

// Vendas com soldAt a partir de "since" — mesmo padrão de "since" (sem
// limite superior, sempre até agora) usado nas outras rotas de estatística
// do painel. Alimenta o total "vendido na loja física" do Financeiro.
function getSince(since) {
  const cutoff = since || 0;
  return readSales()
    .filter((sale) => sale.soldAt >= cutoff)
    .sort((a, b) => b.soldAt - a.soldAt);
}

function create(sale) {
  const sales = readSales();
  sales.push(sale);
  writeSales(sales);
  return sale;
}

function remove(id) {
  const sales = readSales();
  const index = sales.findIndex((sale) => sale.id === id);
  if (index === -1) return null;
  const [removed] = sales.splice(index, 1);
  writeSales(sales);
  return removed;
}

module.exports = {
  getAll,
  getSince,
  create,
  remove,
};
