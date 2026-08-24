/* ==========================================================================
   VITRINE — busca os itens cadastrados na API (com busca/filtros/ordenação),
   monta os cartões na tela e controla o modal de produto e os favoritos.
   Todo texto vindo do servidor é inserido via textContent (nunca innerHTML)
   para não abrir brecha de XSS com nome/descrição cadastrados no admin.
   ========================================================================== */

var PLACEHOLDER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l4.6-4.6a2 2 0 0 1 2.8 0L16 16M14 14l1.6-1.6a2 2 0 0 1 2.8 0L20 14M4 8h.01M4 4h16v16H4V4Z"/></svg>';
var HEART_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6a4.6 4.6 0 0 1 8.8-1.9 4.6 4.6 0 0 1 8.8 1.9Z"/></svg>';
var WHATSAPP_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H8l2 5-2.5 1.5a12 12 0 0 0 6 6L15 13l5 2v2.5A2.5 2.5 0 0 1 17.5 20 14.5 14.5 0 0 1 3 5.5Z"/></svg>';

var FAVORITOS_KEY = 'tna:favoritos';
var WHATSAPP_NUMERO = '554884669105';

function formatarPreco(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function debounce(fn, espera) {
  var timer = null;
  return function () {
    var args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function () { fn.apply(null, args); }, espera);
  };
}

// ---------------------------------------------------------------------------
// FAVORITOS (localStorage, sem conta nem backend)
// ---------------------------------------------------------------------------
function lerFavoritos() {
  try {
    var salvo = window.localStorage.getItem(FAVORITOS_KEY);
    var lista = salvo ? JSON.parse(salvo) : [];
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
}

function salvarFavoritos(lista) {
  try {
    window.localStorage.setItem(FAVORITOS_KEY, JSON.stringify(lista));
  } catch (e) {
    // localStorage indisponível (modo privado, storage cheio etc.) — sem favoritos, sem quebrar a página
  }
}

function ehFavorito(id) {
  return lerFavoritos().indexOf(id) !== -1;
}

function alternarFavorito(id) {
  var lista = lerFavoritos();
  var index = lista.indexOf(id);
  if (index === -1) lista.push(id);
  else lista.splice(index, 1);
  salvarFavoritos(lista);
  return index === -1; // true = acabou de favoritar
}

// ---------------------------------------------------------------------------
// FILTROS: estado, URL e montagem da chamada à API
// ---------------------------------------------------------------------------
var els = {}; // preenchido em iniciar()

function lerFiltrosDaURL() {
  var params = new URLSearchParams(window.location.search);
  return {
    q: params.get('q') || '',
    categoria: params.get('categoria') || '',
    tamanho: params.get('tamanho') || '',
    precoMin: params.get('precoMin') || '',
    precoMax: params.get('precoMax') || '',
    ordenar: params.get('ordenar') || 'recentes',
    favoritos: params.get('favoritos') === '1',
  };
}

function lerFiltrosDosControles() {
  return {
    q: els.busca.value.trim(),
    categoria: els.categoria.value,
    tamanho: els.tamanho.value,
    precoMin: els.precoMin.value,
    precoMax: els.precoMax.value,
    ordenar: els.ordenar.value,
    favoritos: els.favoritos.checked,
  };
}

function aplicarFiltrosNosControles(filtros) {
  els.busca.value = filtros.q;
  els.tamanho.value = filtros.tamanho;
  els.precoMin.value = filtros.precoMin;
  els.precoMax.value = filtros.precoMax;
  els.ordenar.value = filtros.ordenar;
  els.favoritos.checked = filtros.favoritos;
  // categoria é populada async (vem da API) — guardamos pra aplicar depois
  els.categoria.dataset.pendente = filtros.categoria;
}

function atualizarURL(filtros, itemAberto) {
  var params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.categoria) params.set('categoria', filtros.categoria);
  if (filtros.tamanho) params.set('tamanho', filtros.tamanho);
  if (filtros.precoMin) params.set('precoMin', filtros.precoMin);
  if (filtros.precoMax) params.set('precoMax', filtros.precoMax);
  if (filtros.ordenar && filtros.ordenar !== 'recentes') params.set('ordenar', filtros.ordenar);
  if (filtros.favoritos) params.set('favoritos', '1');
  if (itemAberto) params.set('item', itemAberto);

  var query = params.toString();
  var novaURL = 'vitrine.html' + (query ? '?' + query : '');
  window.history.replaceState(null, '', novaURL);
}

function montarUrlApi(filtros) {
  var params = new URLSearchParams();
  if (filtros.q) params.set('q', filtros.q);
  if (filtros.categoria) params.set('categoria', filtros.categoria);
  if (filtros.tamanho) params.set('tamanho', filtros.tamanho);
  if (filtros.precoMin) params.set('precoMin', filtros.precoMin);
  if (filtros.precoMax) params.set('precoMax', filtros.precoMax);
  if (filtros.ordenar) params.set('ordenar', filtros.ordenar);
  var query = params.toString();
  return '/api/items' + (query ? '?' + query : '');
}

// ---------------------------------------------------------------------------
// CARTÕES E SKELETON
// ---------------------------------------------------------------------------
function criarCardFavBtn(item) {
  var favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'vitrine-card-fav' + (ehFavorito(item.id) ? ' is-favorito' : '');
  favBtn.innerHTML = HEART_ICON;
  favBtn.setAttribute('aria-label', 'Favoritar ' + item.name);
  favBtn.addEventListener('click', function (evt) {
    evt.stopPropagation();
    var favoritou = alternarFavorito(item.id);
    favBtn.classList.toggle('is-favorito', favoritou);
    favBtn.setAttribute('aria-label', (favoritou ? 'Remover ' : 'Favoritar ') + item.name + ' dos favoritos');
    if (els.favoritos.checked && !favoritou) renderizar();
  });
  return favBtn;
}

function criarCardBuyLink(item) {
  var buyLink = document.createElement('a');
  buyLink.className = 'vitrine-card-buy';
  buyLink.target = '_blank';
  buyLink.rel = 'noopener';
  buyLink.href = linkWhatsapp(item);
  buyLink.innerHTML = WHATSAPP_ICON;
  buyLink.appendChild(document.createTextNode('Comprar no WhatsApp'));
  buyLink.addEventListener('click', function (evt) {
    evt.stopPropagation();
    if (window.tnaTrack) window.tnaTrack('whatsapp_click', { itemId: item.id });
  });
  return buyLink;
}

function linkWhatsapp(item) {
  var mensagem =
    'Olá! Vim pelo site do Tô Na Arara e tenho interesse na peça "' + item.name + '" (' + formatarPreco(item.price) + ').';
  return 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encodeURIComponent(mensagem);
}

function criarCard(item) {
  var card = document.createElement('article');
  card.className = 'vitrine-card';

  var open = document.createElement('div');
  open.className = 'vitrine-card-open';
  open.tabIndex = 0;
  open.setAttribute('role', 'button');
  open.setAttribute('aria-label', 'Ver detalhes de ' + item.name);
  open.addEventListener('click', function () { abrirModal(item); });
  open.addEventListener('keydown', function (evt) {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      abrirModal(item);
    }
  });

  var imgWrap = document.createElement('div');
  imgWrap.className = 'vitrine-card-img';
  var capa = item.imageUrls && item.imageUrls[0];
  if (capa) {
    var img = document.createElement('img');
    img.src = capa;
    img.alt = item.name;
    img.loading = 'lazy';
    imgWrap.appendChild(img);
  } else {
    var placeholder = document.createElement('div');
    placeholder.innerHTML = PLACEHOLDER_ICON;
    imgWrap.appendChild(placeholder.firstChild);
  }
  imgWrap.appendChild(criarCardFavBtn(item));
  open.appendChild(imgWrap);

  var body = document.createElement('div');
  body.className = 'vitrine-card-body';

  var badges = document.createElement('div');
  badges.className = 'vitrine-card-badges';
  if (item.category) {
    var categoryBadge = document.createElement('span');
    categoryBadge.className = 'badge';
    categoryBadge.textContent = item.category;
    badges.appendChild(categoryBadge);
  }
  if (item.size) {
    var sizeBadge = document.createElement('span');
    sizeBadge.className = 'badge badge-size';
    sizeBadge.textContent = item.size;
    badges.appendChild(sizeBadge);
  }
  if (item.status === 'reservado') {
    var statusBadge = document.createElement('span');
    statusBadge.className = 'badge badge-reservado';
    statusBadge.textContent = 'Reservado';
    badges.appendChild(statusBadge);
  }
  if (badges.childNodes.length) body.appendChild(badges);

  var title = document.createElement('h3');
  title.textContent = item.name;
  body.appendChild(title);

  var price = document.createElement('span');
  price.className = 'vitrine-card-price';
  price.textContent = formatarPreco(item.price);
  body.appendChild(price);

  var desc = document.createElement('p');
  desc.textContent = item.description;
  body.appendChild(desc);

  body.appendChild(criarCardBuyLink(item));
  open.appendChild(body);

  card.appendChild(open);
  return card;
}

function criarSkeletonCard() {
  var card = document.createElement('div');
  card.className = 'vitrine-skeleton-card';
  card.innerHTML =
    '<div class="vitrine-skeleton-img"></div>' +
    '<div class="vitrine-skeleton-body">' +
    '<div class="vitrine-skeleton-line w-40"></div>' +
    '<div class="vitrine-skeleton-line w-60"></div>' +
    '<div class="vitrine-skeleton-line w-40"></div>' +
    '<div class="vitrine-skeleton-line w-100"></div>' +
    '<div class="vitrine-skeleton-line h-btn"></div>' +
    '</div>';
  return card;
}

function mostrarSkeleton() {
  els.grid.innerHTML = '';
  for (var i = 0; i < 6; i++) els.grid.appendChild(criarSkeletonCard());
}

// ---------------------------------------------------------------------------
// CARREGAR E RENDERIZAR
// ---------------------------------------------------------------------------
var itemsCarregados = [];

function haFiltrosAtivos(filtros) {
  return Boolean(filtros.q || filtros.categoria || filtros.tamanho || filtros.precoMin || filtros.precoMax || filtros.favoritos);
}

function limparFiltrosEBuscar() {
  els.busca.value = '';
  els.categoria.value = '';
  els.tamanho.value = '';
  els.precoMin.value = '';
  els.precoMax.value = '';
  els.ordenar.value = 'recentes';
  els.favoritos.checked = false;
  renderizar();
}

function renderizar() {
  var filtros = lerFiltrosDosControles();
  atualizarURL(filtros, modalItemAtualId());

  mostrarSkeleton();
  els.status.hidden = true;

  fetch(montarUrlApi(filtros))
    .then(function (res) {
      if (!res.ok) throw new Error('Falha ao carregar itens.');
      return res.json();
    })
    .then(function (items) {
      itemsCarregados = items;

      var visiveis = filtros.favoritos ? items.filter(function (i) { return ehFavorito(i.id); }) : items;

      els.grid.innerHTML = '';

      if (!visiveis.length) {
        els.status.hidden = false;
        els.status.classList.remove('error');
        if (haFiltrosAtivos(filtros)) {
          els.status.innerHTML = '';
          els.status.appendChild(document.createTextNode('Nenhuma peça encontrada com esses filtros.'));
          var limparBtn = document.createElement('button');
          limparBtn.type = 'button';
          limparBtn.className = 'vitrine-status-clear';
          limparBtn.textContent = 'Limpar filtros';
          limparBtn.addEventListener('click', limparFiltrosEBuscar);
          els.status.appendChild(document.createElement('br'));
          els.status.appendChild(limparBtn);
        } else {
          els.status.textContent = 'Nenhuma peça cadastrada no momento. Volte em breve!';
        }
        return;
      }

      visiveis.forEach(function (item) {
        els.grid.appendChild(criarCard(item));
      });
    })
    .catch(function () {
      els.grid.innerHTML = '';
      els.status.hidden = false;
      els.status.classList.add('error');
      els.status.textContent = 'Não foi possível carregar a vitrine agora. Tente novamente em instantes.';
    });
}

function carregarCategoriasNoFiltro() {
  fetch('/api/categories')
    .then(function (res) { return res.json(); })
    .then(function (categorias) {
      categorias.forEach(function (nome) {
        var option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        els.categoria.appendChild(option);
      });
      var pendente = els.categoria.dataset.pendente;
      if (pendente && categorias.indexOf(pendente) !== -1) els.categoria.value = pendente;
    })
    .catch(function () {});
}

// ---------------------------------------------------------------------------
// MODAL DE PRODUTO
// ---------------------------------------------------------------------------
var modalItemAtual = null;
var modalIndiceFoto = 0;

function modalItemAtualId() {
  return modalItemAtual ? modalItemAtual.id : null;
}

function renderizarFotoModal() {
  var fotos = (modalItemAtual.imageUrls && modalItemAtual.imageUrls.length) ? modalItemAtual.imageUrls : null;
  els.modalImg.innerHTML = '';

  if (!fotos) {
    els.modalImg.classList.add('is-empty');
    var placeholder = document.createElement('div');
    placeholder.innerHTML = PLACEHOLDER_ICON;
    els.modalImg.appendChild(placeholder.firstChild);
  } else {
    els.modalImg.classList.remove('is-empty');
    var img = document.createElement('img');
    img.src = fotos[modalIndiceFoto];
    img.alt = modalItemAtual.name;
    els.modalImg.appendChild(img);
  }

  var mostrarSetas = fotos && fotos.length > 1;
  els.modalPrev.hidden = !mostrarSetas;
  els.modalNext.hidden = !mostrarSetas;

  els.modalDots.innerHTML = '';
  if (mostrarSetas) {
    fotos.forEach(function (_, index) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = index === modalIndiceFoto ? 'is-active' : '';
      dot.setAttribute('aria-label', 'Ver foto ' + (index + 1));
      dot.addEventListener('click', function () {
        modalIndiceFoto = index;
        renderizarFotoModal();
      });
      els.modalDots.appendChild(dot);
    });
  }
}

function navegarFotoModal(direcao) {
  var fotos = modalItemAtual.imageUrls;
  if (!fotos || fotos.length < 2) return;
  modalIndiceFoto = (modalIndiceFoto + direcao + fotos.length) % fotos.length;
  renderizarFotoModal();
}

function abrirModal(item) {
  modalItemAtual = item;
  modalIndiceFoto = 0;

  els.modalBadges.innerHTML = '';
  if (item.category) {
    var categoryBadge = document.createElement('span');
    categoryBadge.className = 'badge';
    categoryBadge.textContent = item.category;
    els.modalBadges.appendChild(categoryBadge);
  }
  if (item.size) {
    var sizeBadge = document.createElement('span');
    sizeBadge.className = 'badge badge-size';
    sizeBadge.textContent = item.size;
    els.modalBadges.appendChild(sizeBadge);
  }
  if (item.status === 'reservado') {
    var statusBadge = document.createElement('span');
    statusBadge.className = 'badge badge-reservado';
    statusBadge.textContent = 'Reservado';
    els.modalBadges.appendChild(statusBadge);
  }

  els.modalName.textContent = item.name;
  els.modalPrice.textContent = formatarPreco(item.price);
  els.modalDesc.textContent = item.description;
  els.modalBuy.href = linkWhatsapp(item);

  renderizarFotoModal();

  els.modal.hidden = false;
  document.body.classList.add('vitrine-modal-open');
  atualizarURL(lerFiltrosDosControles(), item.id);

  if (window.tnaTrack) window.tnaTrack('item_view', { itemId: item.id });
}

function fecharModal() {
  if (!modalItemAtual) return;
  modalItemAtual = null;
  els.modal.hidden = true;
  document.body.classList.remove('vitrine-modal-open');
  atualizarURL(lerFiltrosDosControles(), null);
}

function abrirModalPorId(id) {
  var item = itemsCarregados.filter(function (i) { return i.id === id; })[0];
  if (item) {
    abrirModal(item);
    return;
  }
  // O item pode não estar na lista carregada agora (filtro ativo, ou o link
  // chegou direto de fora) — busca ele avulso, sem filtro nenhum.
  fetch('/api/items')
    .then(function (res) { return res.json(); })
    .then(function (items) {
      var achado = items.filter(function (i) { return i.id === id; })[0];
      if (achado) abrirModal(achado);
    })
    .catch(function () {});
}

// ---------------------------------------------------------------------------
// INICIALIZAÇÃO
// ---------------------------------------------------------------------------
function iniciar() {
  els = {
    grid: document.getElementById('vitrineGrid'),
    status: document.getElementById('vitrineStatus'),
    busca: document.getElementById('filtroBusca'),
    categoria: document.getElementById('filtroCategoria'),
    tamanho: document.getElementById('filtroTamanho'),
    precoMin: document.getElementById('filtroPrecoMin'),
    precoMax: document.getElementById('filtroPrecoMax'),
    ordenar: document.getElementById('filtroOrdenar'),
    favoritos: document.getElementById('filtroFavoritos'),
    limpar: document.getElementById('limparFiltros'),
    filtrosToggle: document.getElementById('filtrosToggle'),
    filtrosPanel: document.getElementById('vitrineFiltersPanel'),
    modal: document.getElementById('vitrineModal'),
    modalBackdrop: document.getElementById('vitrineModalBackdrop'),
    modalClose: document.getElementById('vitrineModalClose'),
    modalImg: document.getElementById('vitrineModalImg'),
    modalPrev: document.getElementById('vitrineModalPrev'),
    modalNext: document.getElementById('vitrineModalNext'),
    modalDots: document.getElementById('vitrineModalDots'),
    modalBadges: document.getElementById('vitrineModalBadges'),
    modalName: document.getElementById('vitrineModalName'),
    modalPrice: document.getElementById('vitrineModalPrice'),
    modalDesc: document.getElementById('vitrineModalDesc'),
    modalBuy: document.getElementById('vitrineModalBuy'),
  };

  // Precisa ler o "item" da URL ANTES de chamar renderizar() — ela reescreve
  // a URL (history.replaceState) e derrubaria esse parâmetro antes da gente
  // conseguir usá-lo pra abrir o modal já na primeira carga da página.
  var idInicial = new URLSearchParams(window.location.search).get('item');

  var filtrosIniciais = lerFiltrosDaURL();
  aplicarFiltrosNosControles(filtrosIniciais);
  carregarCategoriasNoFiltro();

  var buscaDebounced = debounce(function () {
    var termo = els.busca.value.trim();
    if (termo && window.tnaTrack) window.tnaTrack('search', { query: termo });
    renderizar();
  }, 300);
  els.busca.addEventListener('input', buscaDebounced);

  var precoDebounced = debounce(renderizar, 300);
  els.precoMin.addEventListener('input', precoDebounced);
  els.precoMax.addEventListener('input', precoDebounced);

  els.categoria.addEventListener('change', renderizar);
  els.tamanho.addEventListener('change', renderizar);
  els.ordenar.addEventListener('change', renderizar);
  els.favoritos.addEventListener('change', renderizar);
  els.limpar.addEventListener('click', limparFiltrosEBuscar);

  els.filtrosToggle.addEventListener('click', function () {
    var abrindo = !els.filtrosPanel.classList.contains('is-open');
    els.filtrosPanel.classList.toggle('is-open', abrindo);
    els.filtrosToggle.setAttribute('aria-expanded', String(abrindo));
  });

  els.modalClose.addEventListener('click', fecharModal);
  els.modalBackdrop.addEventListener('click', fecharModal);
  els.modalPrev.addEventListener('click', function () { navegarFotoModal(-1); });
  els.modalNext.addEventListener('click', function () { navegarFotoModal(1); });
  els.modalBuy.addEventListener('click', function () {
    if (modalItemAtual && window.tnaTrack) window.tnaTrack('whatsapp_click', { itemId: modalItemAtual.id });
  });

  document.addEventListener('keydown', function (evt) {
    if (els.modal.hidden) return;
    if (evt.key === 'Escape') fecharModal();
    else if (evt.key === 'ArrowLeft') navegarFotoModal(-1);
    else if (evt.key === 'ArrowRight') navegarFotoModal(1);
  });

  renderizar();

  if (idInicial) abrirModalPorId(idInicial);
}

iniciar();
