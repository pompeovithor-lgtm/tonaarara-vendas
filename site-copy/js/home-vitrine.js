/* ==========================================================================
   PRÉVIA DA VITRINE NA PÁGINA INICIAL — mostra algumas peças disponíveis
   direto na home (mesmos cartões visuais de vitrine.html, reaproveitando
   css/vitrine.css), sem busca/filtro/modal. Clicar no cartão leva para
   vitrine.html?item=ID, que abre o modal completo da peça lá.
   ========================================================================== */

(function () {
  var grid = document.getElementById('vitrineHomeGrid');
  if (!grid) return; // só roda na home, onde a prévia existe

  var status = document.getElementById('vitrineHomeStatus');
  var LIMITE = 8; // teaser, não o catálogo inteiro — esse fica em vitrine.html
  var WHATSAPP_NUMERO = '554884669105';

  var PLACEHOLDER_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l4.6-4.6a2 2 0 0 1 2.8 0L16 16M14 14l1.6-1.6a2 2 0 0 1 2.8 0L20 14M4 8h.01M4 4h16v16H4V4Z"/></svg>';
  var WHATSAPP_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H8l2 5-2.5 1.5a12 12 0 0 0 6 6L15 13l5 2v2.5A2.5 2.5 0 0 1 17.5 20 14.5 14.5 0 0 1 3 5.5Z"/></svg>';

  function formatarPreco(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function linkWhatsapp(item) {
    var mensagem =
      'Olá! Vim pelo site do Tô Na Arara e tenho interesse na peça "' + item.name + '" (' + formatarPreco(item.price) + ').';
    return 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encodeURIComponent(mensagem);
  }

  function criarCard(item) {
    var card = document.createElement('article');
    card.className = 'vitrine-card';

    // Div clicável (não um <a>) porque o botão "Comprar no WhatsApp" também
    // é um link dentro do card — <a> dentro de <a> é HTML inválido. Mesmo
    // padrão usado nos cartões de vitrine.html.
    var destino = 'vitrine.html?item=' + encodeURIComponent(item.id);
    var open = document.createElement('div');
    open.className = 'vitrine-card-open';
    open.tabIndex = 0;
    open.setAttribute('role', 'link');
    open.setAttribute('aria-label', 'Ver detalhes de ' + item.name);
    open.addEventListener('click', function () { window.location.href = destino; });
    open.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        window.location.href = destino;
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

    var buyLink = document.createElement('a');
    buyLink.className = 'vitrine-card-buy';
    buyLink.target = '_blank';
    buyLink.rel = 'noopener';
    buyLink.href = linkWhatsapp(item);
    buyLink.innerHTML = WHATSAPP_ICON;
    buyLink.appendChild(document.createTextNode('Comprar no WhatsApp'));
    buyLink.addEventListener('click', function (evt) {
      // Impede que o clique "vaze" pro listener de clique do "open" (que
      // navegaria a página pra vitrine.html) — o link do WhatsApp já abre
      // numa aba nova por conta própria.
      evt.stopPropagation();
      if (window.tnaTrack) window.tnaTrack('whatsapp_click', { itemId: item.id });
    });
    body.appendChild(buyLink);

    open.appendChild(body);
    card.appendChild(open);

    return card;
  }

  fetch('/api/items')
    .then(function (res) {
      if (!res.ok) throw new Error('Falha ao carregar itens.');
      return res.json();
    })
    .then(function (items) {
      var visiveis = items.slice(0, LIMITE);
      grid.innerHTML = '';

      if (!visiveis.length) {
        status.hidden = false;
        status.textContent = 'Novidades chegando em breve. Volte para conferir!';
        return;
      }

      status.hidden = true;
      visiveis.forEach(function (item) {
        grid.appendChild(criarCard(item));
      });
    })
    .catch(function () {
      grid.innerHTML = '';
      status.hidden = false;
      status.classList.add('error');
      status.textContent = 'Não foi possível carregar a vitrine agora.';
    });
})();
