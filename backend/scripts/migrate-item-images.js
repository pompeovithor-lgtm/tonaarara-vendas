/*
 * Migração one-off: converte itens que ainda estão no formato antigo
 * (campo "image", uma foto só) para o formato novo (campo "images", lista
 * de fotos). É seguro rodar mais de uma vez — depois da primeira execução
 * não sobra nenhum item com "image", então as próximas rodadas não fazem
 * nada.
 *
 * Uso: node backend/scripts/migrate-item-images.js
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'items.json');

const raw = fs.readFileSync(DATA_FILE, 'utf8');
const items = JSON.parse(raw);

let changed = 0;

const migrated = items.map((item) => {
  if (!Object.prototype.hasOwnProperty.call(item, 'image')) return item;

  const { image, ...rest } = item;
  changed += 1;

  return {
    ...rest,
    images: Array.isArray(rest.images) ? rest.images : image ? [image] : [],
    status: rest.status || 'disponivel',
  };
});

fs.writeFileSync(DATA_FILE, JSON.stringify(migrated, null, 2), 'utf8');

if (changed > 0) {
  console.log(`Migração concluída: ${changed} item(ns) convertido(s) de "image" para "images".`);
} else {
  console.log('Nenhum item precisava de migração (já rodou antes ou não há itens no formato antigo).');
}
