/* ==========================================================================
   PAINEL ADMIN — login, criar conta, recuperação de senha e o painel
   (visão geral, itens, interessados, categorias) do dashboard.html.
   Este mesmo arquivo é usado por login.html, reset-password.html e
   dashboard.html; cada bloco só roda se encontrar os elementos da
   respectiva página no DOM.
   ========================================================================== */

function formatarPreco(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Lê a resposta com segurança: se o servidor respondido não for o backend
// certo (ex.: a página foi aberta por outro servidor sem a rota da API),
// o corpo pode vir vazio ou não ser JSON — nesse caso mostramos uma
// mensagem clara em vez de deixar o erro cru do navegador aparecer.
function lerResposta(res) {
  return res.text().then(function (texto) {
    var dados = null;
    if (texto) {
      try {
        dados = JSON.parse(texto);
      } catch (e) {
        throw new Error(
          'O servidor respondeu de forma inesperada. Confirme se o backend está rodando e se você está acessando por http://localhost:3000.'
        );
      }
    }
    if (!res.ok) {
      throw new Error((dados && dados.error) || 'Não foi possível completar a ação.');
    }
    return dados || {};
  });
}

function postJSON(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(lerResposta);
}

function putJSON(url, body) {
  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(lerResposta);
}

var STATUS_LABELS = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendido: 'Vendido',
};

function formatarInteiro(valor) {
  return Number(valor || 0).toLocaleString('pt-BR');
}

function formatarDataHora(timestamp) {
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatarDataCurta(dataISO) {
  var partes = dataISO.split('-');
  return partes[2] + '/' + partes[1];
}

// ---------------------------------------------------------------------------
// LOGIN / CRIAR CONTA / ESQUECI MINHA SENHA (login.html)
// ---------------------------------------------------------------------------
(function () {
  var tabs = document.getElementById('authTabs');
  if (!tabs) return;

  var views = Array.prototype.slice.call(document.querySelectorAll('.auth-view'));

  function mostrarView(nome) {
    views.forEach(function (view) {
      view.hidden = view.getAttribute('data-view') !== nome;
    });
    Array.prototype.slice.call(tabs.querySelectorAll('.auth-tab')).forEach(function (tab) {
      tab.classList.toggle('is-active', tab.getAttribute('data-view') === nome);
    });
  }

  tabs.addEventListener('click', function (evt) {
    var btn = evt.target.closest('.auth-tab');
    if (btn) mostrarView(btn.getAttribute('data-view'));
  });
  document.querySelectorAll('.link-btn[data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () { mostrarView(btn.getAttribute('data-view')); });
  });

  // Entrar
  var loginForm = document.getElementById('loginForm');
  var loginError = document.getElementById('loginError');
  loginForm.addEventListener('submit', function (evt) {
    evt.preventDefault();
    loginError.hidden = true;
    postJSON('/api/login', {
      username: loginForm.username.value.trim(),
      password: loginForm.password.value,
    })
      .then(function () { window.location.href = 'dashboard.html'; })
      .catch(function (err) {
        loginError.textContent = err.message;
        loginError.hidden = false;
      });
  });

  // Criar conta
  var registerForm = document.getElementById('registerForm');
  var registerError = document.getElementById('registerError');
  registerForm.addEventListener('submit', function (evt) {
    evt.preventDefault();
    registerError.hidden = true;
    postJSON('/api/register', {
      username: registerForm.username.value.trim(),
      email: registerForm.email.value.trim(),
      password: registerForm.password.value,
      confirmPassword: registerForm.confirmPassword.value,
      signupCode: registerForm.signupCode.value.trim(),
    })
      .then(function () { window.location.href = 'dashboard.html'; })
      .catch(function (err) {
        registerError.textContent = err.message;
        registerError.hidden = false;
      });
  });

  // Esqueci minha senha
  var forgotForm = document.getElementById('forgotForm');
  var forgotError = document.getElementById('forgotError');
  var forgotSuccess = document.getElementById('forgotSuccess');
  forgotForm.addEventListener('submit', function (evt) {
    evt.preventDefault();
    forgotError.hidden = true;
    forgotSuccess.hidden = true;
    postJSON('/api/forgot-password', { email: forgotForm.email.value.trim() })
      .then(function (data) {
        forgotSuccess.textContent = data.message || 'Se esse e-mail tiver uma conta, enviamos um link de recuperação.';
        forgotSuccess.hidden = false;
        forgotForm.reset();
      })
      .catch(function (err) {
        forgotError.textContent = err.message;
        forgotError.hidden = false;
      });
  });
})();

// ---------------------------------------------------------------------------
// CRIAR NOVA SENHA (reset-password.html)
// ---------------------------------------------------------------------------
(function () {
  var form = document.getElementById('resetForm');
  if (!form) return;

  var errorBox = document.getElementById('resetError');
  var successBox = document.getElementById('resetSuccess');
  var submitBtn = document.getElementById('resetSubmitBtn');

  var params = new URLSearchParams(window.location.search);
  var email = params.get('email');
  var token = params.get('token');

  if (!email || !token) {
    errorBox.textContent = 'Link de recuperação inválido. Solicite um novo na tela de login.';
    errorBox.hidden = false;
    submitBtn.disabled = true;
  }

  form.addEventListener('submit', function (evt) {
    evt.preventDefault();
    errorBox.hidden = true;
    successBox.hidden = true;

    postJSON('/api/reset-password', {
      email: email,
      token: token,
      password: form.password.value,
      confirmPassword: form.confirmPassword.value,
    })
      .then(function () {
        successBox.textContent = 'Senha alterada com sucesso! Redirecionando para o login...';
        successBox.hidden = false;
        form.reset();
        submitBtn.disabled = true;
        setTimeout(function () { window.location.href = 'login.html'; }, 1800);
      })
      .catch(function (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      });
  });
})();

// ---------------------------------------------------------------------------
// PAINEL (dashboard.html) — abas Visão geral / Itens / Interessados / Categorias
// ---------------------------------------------------------------------------
(function () {
  var tabsNav = document.getElementById('adminTabs');
  if (!tabsNav) return;

  var whoami = document.getElementById('whoami');
  var logoutBtn = document.getElementById('logoutBtn');
  var tabUsuarios = document.getElementById('tabUsuarios');
  var isAdminAtual = false;

  function checkSession() {
    return fetch('/api/session')
      .then(lerResposta)
      .then(function (data) {
        if (!data.loggedIn) {
          window.location.href = 'login.html';
          return Promise.reject();
        }
        whoami.textContent = data.username;
        isAdminAtual = Boolean(data.isAdmin);

        // A aba "Usuários" só existe pra quem já é admin — sem isto, um
        // colaborador veria a aba (mesmo que a API recuse a chamada com
        // 403 por trás). Se a URL pedir ?tab=usuarios sem ser admin, cai
        // pra "Visão geral" em vez de mostrar um painel vazio.
        if (!isAdminAtual) {
          tabUsuarios.hidden = true;
          if (abaAtiva() === 'usuarios') ativarAba('visao-geral');
        }
      });
  }

  logoutBtn.addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST' }).then(function () {
      window.location.href = 'login.html';
    });
  });

  // ---- Navegação por abas via querystring (?tab=) ----
  var ABAS_VALIDAS = ['visao-geral', 'itens', 'interessados', 'categorias', 'financeiro', 'usuarios'];

  function abaAtiva() {
    var tab = new URLSearchParams(window.location.search).get('tab');
    return ABAS_VALIDAS.indexOf(tab) !== -1 ? tab : 'visao-geral';
  }

  function ativarAba(nome) {
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== nome;
    });
    Array.prototype.slice.call(tabsNav.querySelectorAll('.admin-tab')).forEach(function (tab) {
      tab.classList.toggle('is-active', tab.getAttribute('data-tab') === nome);
    });
  }

  ativarAba(abaAtiva());

  // =========================================================================
  // VISÃO GERAL
  // =========================================================================
  function initVisaoGeral() {
    var status = document.getElementById('overviewStatus');
    var statGrid = document.getElementById('statGrid');
    var chartBlock = document.getElementById('chartBlock');
    var overviewLists = document.getElementById('overviewLists');

    function desenharGrafico(visitsByDay) {
      var container = document.getElementById('visitsChart');
      container.innerHTML = '';
      if (!visitsByDay || !visitsByDay.length) return;

      var max = Math.max.apply(null, visitsByDay.map(function (d) { return d.count; })) || 1;
      var W = 700, H = 160, padBottom = 22, gap = 4;
      var barWidth = (W / visitsByDay.length) - gap;

      var svgNS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('class', 'visits-chart-svg');

      visitsByDay.forEach(function (d, i) {
        var barH = Math.max((d.count / max) * (H - padBottom - 6), d.count > 0 ? 3 : 0);
        var x = i * (barWidth + gap);
        var y = H - padBottom - barH;

        var rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', x.toFixed(2));
        rect.setAttribute('y', y.toFixed(2));
        rect.setAttribute('width', Math.max(barWidth, 1).toFixed(2));
        rect.setAttribute('height', barH.toFixed(2));
        rect.setAttribute('rx', 2);
        rect.setAttribute('class', 'visits-bar');

        var title = document.createElementNS(svgNS, 'title');
        title.textContent = formatarDataCurta(d.date) + ': ' + d.count + ' visita' + (d.count === 1 ? '' : 's');
        rect.appendChild(title);

        svg.appendChild(rect);
      });

      container.appendChild(svg);

      var labels = document.createElement('div');
      labels.className = 'visits-chart-labels';
      var passo = Math.max(Math.ceil(visitsByDay.length / 7), 1);
      visitsByDay.forEach(function (d, i) {
        if (i % passo !== 0 && i !== visitsByDay.length - 1) return;
        var span = document.createElement('span');
        span.style.left = (((i + 0.5) / visitsByDay.length) * 100) + '%';
        span.textContent = formatarDataCurta(d.date);
        labels.appendChild(span);
      });
      container.appendChild(labels);
    }

    function renderRankedList(elId, linhas, vazio) {
      var ol = document.getElementById(elId);
      ol.innerHTML = '';
      if (!linhas.length) {
        var li = document.createElement('li');
        li.className = 'ranked-list-empty';
        li.textContent = vazio;
        ol.appendChild(li);
        return;
      }
      linhas.forEach(function (li) { ol.appendChild(li); });
    }

    function criarItemVisto(entrada) {
      var li = document.createElement('li');
      li.className = 'ranked-item';

      var thumb = document.createElement('div');
      thumb.className = 'ranked-item-thumb';
      if (entrada.imageUrl) {
        var img = document.createElement('img');
        img.src = entrada.imageUrl;
        img.alt = '';
        thumb.appendChild(img);
      }
      li.appendChild(thumb);

      var texto = document.createElement('span');
      texto.className = 'ranked-item-label';
      texto.textContent = entrada.name;
      li.appendChild(texto);

      var count = document.createElement('span');
      count.className = 'ranked-item-count';
      count.textContent = formatarInteiro(entrada.count);
      li.appendChild(count);

      return li;
    }

    function criarItemBusca(entrada) {
      var li = document.createElement('li');
      li.className = 'ranked-item';

      var texto = document.createElement('span');
      texto.className = 'ranked-item-label';
      texto.textContent = entrada.query;
      li.appendChild(texto);

      var count = document.createElement('span');
      count.className = 'ranked-item-count';
      count.textContent = formatarInteiro(entrada.count);
      li.appendChild(count);

      return li;
    }

    status.hidden = false;
    status.textContent = 'Carregando...';

    Promise.all([
      fetch('/api/admin/stats/summary?dias=1').then(lerResposta),
      fetch('/api/admin/stats/summary?dias=7').then(lerResposta),
      fetch('/api/admin/stats/summary?dias=30').then(lerResposta),
      fetch('/api/admin/stats/timeseries?dias=14').then(lerResposta),
    ])
      .then(function (resultados) {
        var hoje = resultados[0];
        var sete = resultados[1];
        var trinta = resultados[2];
        var serie = resultados[3];

        document.getElementById('statToday').textContent = formatarInteiro(hoje.totalVisits);
        document.getElementById('stat7d').textContent = formatarInteiro(sete.totalVisits);
        document.getElementById('stat30d').textContent = formatarInteiro(trinta.totalVisits);
        document.getElementById('statUniqueVisitors').textContent = formatarInteiro(sete.uniqueVisitors);
        document.getElementById('statWhatsappClicks').textContent = formatarInteiro(sete.whatsappClicks);
        document.getElementById('statConversion').textContent =
          (sete.conversionRate * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
        statGrid.hidden = false;

        desenharGrafico(serie.visitsByDay);
        chartBlock.hidden = false;

        renderRankedList(
          'topViewedList',
          sete.topViewedItems.map(criarItemVisto),
          'Ninguém visualizou peças ainda nos últimos 7 dias.'
        );
        renderRankedList(
          'topSearchesList',
          sete.topSearches.map(criarItemBusca),
          'Ninguém buscou nada ainda nos últimos 7 dias.'
        );
        overviewLists.hidden = false;

        status.hidden = true;
      })
      .catch(function () {
        status.textContent = 'Não foi possível carregar os números agora.';
        status.hidden = false;
      });
  }

  // =========================================================================
  // ITENS
  // =========================================================================
  function initItens() {
    var form = document.getElementById('itemForm');
    var formTitle = document.getElementById('formTitle');
    var submitBtn = document.getElementById('submitBtn');
    var cancelEditBtn = document.getElementById('cancelEditBtn');
    var formError = document.getElementById('formError');
    var itemsList = document.getElementById('itemsList');
    var listStatus = document.getElementById('listStatus');
    var imagesInput = document.getElementById('imagesInput');
    var imagePreview = document.getElementById('imagePreview');
    var searchInput = document.getElementById('searchInput');
    var categoryFilter = document.getElementById('categoryFilter');
    var statusFilter = document.getElementById('statusFilter');
    var categorySelect = document.getElementById('categorySelect');
    var addCategoryBtn = document.getElementById('addCategoryBtn');
    var newCategoryRow = document.getElementById('newCategoryRow');
    var newCategoryInput = document.getElementById('newCategoryInput');
    var confirmNewCategoryBtn = document.getElementById('confirmNewCategoryBtn');
    var cancelNewCategoryBtn = document.getElementById('cancelNewCategoryBtn');
    var newCategoryError = document.getElementById('newCategoryError');
    var editCategoryBtn = document.getElementById('editCategoryBtn');
    var editCategoryRow = document.getElementById('editCategoryRow');
    var editCategoryInput = document.getElementById('editCategoryInput');
    var confirmEditCategoryBtn = document.getElementById('confirmEditCategoryBtn');
    var cancelEditCategoryBtn = document.getElementById('cancelEditCategoryBtn');
    var editCategoryError = document.getElementById('editCategoryError');

    var MAX_IMAGES = 6;
    var todosItens = [];
    var existingImages = []; // nomes de arquivo (não URL) das fotos já salvas, na ordem — a primeira é a capa
    var deepLinkAplicado = false; // só tenta abrir o item vindo de "?edit=" uma vez

    function syncExistingImagesField() {
      form.existingImages.value = JSON.stringify(existingImages);
    }

    // Mostra lado a lado as fotos já salvas (com botões de remover/usar como
    // capa) e as fotos recém-selecionadas no input, que ainda vão ser
    // enviadas ao salvar.
    function renderImagePreview() {
      imagePreview.innerHTML = '';

      existingImages.forEach(function (filename, index) {
        var thumb = document.createElement('div');
        thumb.className = 'image-thumb';

        var img = document.createElement('img');
        img.src = '/uploads/' + filename;
        img.alt = '';
        thumb.appendChild(img);

        if (index === 0) {
          var capaBadge = document.createElement('span');
          capaBadge.className = 'image-thumb-badge';
          capaBadge.textContent = 'Capa';
          thumb.appendChild(capaBadge);
        }

        var actions = document.createElement('div');
        actions.className = 'image-thumb-actions';

        if (index !== 0) {
          var capaBtn = document.createElement('button');
          capaBtn.type = 'button';
          capaBtn.textContent = 'Usar como capa';
          capaBtn.addEventListener('click', function () {
            existingImages.splice(index, 1);
            existingImages.unshift(filename);
            syncExistingImagesField();
            renderImagePreview();
          });
          actions.appendChild(capaBtn);
        }

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'danger';
        removeBtn.textContent = 'Remover';
        removeBtn.addEventListener('click', function () {
          existingImages.splice(index, 1);
          syncExistingImagesField();
          renderImagePreview();
        });
        actions.appendChild(removeBtn);

        thumb.appendChild(actions);
        imagePreview.appendChild(thumb);
      });

      Array.prototype.forEach.call(imagesInput.files || [], function (file) {
        var thumb = document.createElement('div');
        thumb.className = 'image-thumb is-new';

        var img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = '';
        img.onload = function () { URL.revokeObjectURL(img.src); };
        thumb.appendChild(img);

        var badge = document.createElement('span');
        badge.className = 'image-thumb-badge';
        badge.textContent = 'Nova';
        thumb.appendChild(badge);

        imagePreview.appendChild(thumb);
      });
    }

    function resetFormToCreateMode() {
      form.reset();
      form.id.value = '';
      existingImages = [];
      syncExistingImagesField();
      renderImagePreview();
      formTitle.textContent = 'Cadastrar novo item';
      submitBtn.textContent = 'Cadastrar item';
      cancelEditBtn.hidden = true;
      formError.hidden = true;
      fecharNovaCategoria();
      fecharEdicaoCategoria();
      atualizarEditCategoryBtn();
    }

    function enterEditMode(item) {
      form.id.value = item.id;
      form.name.value = item.name;
      form.price.value = item.price;
      form.size.value = item.size || '';
      form.category.value = item.category || '';
      form.status.value = item.status || 'disponivel';
      form.description.value = item.description;
      imagesInput.value = '';
      existingImages = (item.imageUrls || []).map(function (url) {
        return url.split('/').pop();
      });
      syncExistingImagesField();
      renderImagePreview();
      formTitle.textContent = 'Editar item';
      submitBtn.textContent = 'Salvar alterações';
      cancelEditBtn.hidden = false;
      formError.hidden = true;
      fecharNovaCategoria();
      fecharEdicaoCategoria();
      atualizarEditCategoryBtn();
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function criarBotoesStatus(item) {
      var wrap = document.createElement('div');
      wrap.className = 'admin-item-status-actions';

      var opcoes = [];
      if (item.status !== 'reservado') opcoes.push({ label: 'Marcar como reservado', status: 'reservado' });
      if (item.status !== 'vendido') opcoes.push({ label: 'Marcar como vendido', status: 'vendido' });
      if (item.status !== 'disponivel') opcoes.push({ label: 'Voltar a disponível', status: 'disponivel' });

      opcoes.forEach(function (opcao) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = opcao.label;
        btn.addEventListener('click', function () {
          putJSON('/api/items/' + item.id, { status: opcao.status })
            .then(function () { return carregarItens(); })
            .catch(function () {
              window.alert('Não foi possível atualizar o status.');
            });
        });
        wrap.appendChild(btn);
      });

      return wrap;
    }

    function criarLinhaItem(item) {
      var row = document.createElement('div');
      row.className = 'admin-item';

      var thumb = document.createElement('div');
      thumb.className = 'admin-item-thumb';
      var capa = item.imageUrls && item.imageUrls[0];
      if (capa) {
        var img = document.createElement('img');
        img.src = capa;
        img.alt = item.name;
        thumb.appendChild(img);
      }
      row.appendChild(thumb);

      var body = document.createElement('div');
      body.className = 'admin-item-body';
      var h3 = document.createElement('h3');
      h3.textContent = item.name;
      var badges = document.createElement('div');
      badges.className = 'admin-item-badges';
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
      var statusBadge = document.createElement('span');
      statusBadge.className = 'badge badge-status-' + item.status;
      statusBadge.textContent = STATUS_LABELS[item.status] || item.status;
      badges.appendChild(statusBadge);

      var price = document.createElement('div');
      price.className = 'admin-item-price';
      price.textContent = formatarPreco(item.price);
      var desc = document.createElement('p');
      desc.textContent = item.description;
      body.appendChild(h3);
      body.appendChild(badges);
      body.appendChild(price);
      body.appendChild(desc);
      body.appendChild(criarBotoesStatus(item));
      row.appendChild(body);

      var actions = document.createElement('div');
      actions.className = 'admin-item-actions';

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Editar';
      editBtn.addEventListener('click', function () { enterEditMode(item); });

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger';
      deleteBtn.textContent = 'Excluir';
      deleteBtn.addEventListener('click', function () { excluirItem(item); });

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(actions);

      return row;
    }

    function renderizarItensFiltrados() {
      var busca = searchInput.value.trim().toLowerCase();
      var categoria = categoryFilter.value;
      var status = statusFilter.value;

      var filtrados = todosItens.filter(function (item) {
        if (busca && item.name.toLowerCase().indexOf(busca) === -1) return false;
        if (categoria && item.category !== categoria) return false;
        if (status && item.status !== status) return false;
        return true;
      });

      itemsList.innerHTML = '';
      if (!todosItens.length) {
        listStatus.textContent = 'Nenhum item cadastrado ainda.';
        listStatus.hidden = false;
        return;
      }
      if (!filtrados.length) {
        listStatus.textContent = 'Nenhum item encontrado com esses filtros.';
        listStatus.hidden = false;
        return;
      }
      listStatus.hidden = true;
      filtrados.forEach(function (item) {
        itemsList.appendChild(criarLinhaItem(item));
      });
    }

    function carregarItens() {
      listStatus.hidden = false;
      listStatus.textContent = 'Carregando...';
      // mostrarVendidos=1: o painel precisa continuar vendo itens já
      // vendidos (pra poder reabrir/editar), diferente da vitrine pública.
      return fetch('/api/items?mostrarVendidos=1')
        .then(lerResposta)
        .then(function (items) {
          todosItens = items;
          renderizarItensFiltrados();

          if (!deepLinkAplicado) {
            deepLinkAplicado = true;
            var idParaEditar = new URLSearchParams(window.location.search).get('edit');
            if (idParaEditar) {
              var item = todosItens.find(function (i) { return i.id === idParaEditar; });
              if (item) {
                enterEditMode(item);
                window.history.replaceState(null, '', 'dashboard.html?tab=itens');
              }
            }
          }
        })
        .catch(function () {
          listStatus.textContent = 'Não foi possível carregar os itens.';
          listStatus.hidden = false;
        });
    }

    function carregarCategorias() {
      return fetch('/api/categories')
        .then(lerResposta)
        .then(function (categorias) {
          // Datalist só é usada pelo campo (opcional) de categoria do form
          // de venda física, na aba Financeiro.
          var datalist = document.getElementById('categoryOptions');
          if (datalist) {
            datalist.innerHTML = '';
            categorias.forEach(function (nome) {
              var option = document.createElement('option');
              option.value = nome;
              datalist.appendChild(option);
            });
          }

          var valorAtualFiltro = categoryFilter.value;
          categoryFilter.innerHTML = '<option value="">Todas as categorias</option>';
          categorias.forEach(function (nome) {
            var option = document.createElement('option');
            option.value = nome;
            option.textContent = nome;
            categoryFilter.appendChild(option);
          });
          categoryFilter.value = categorias.indexOf(valorAtualFiltro) !== -1 ? valorAtualFiltro : '';

          // Select de categoria do formulário de item: só permite escolher
          // entre as que já existem — categoria nova só entra pelo botão "+".
          var valorAtualForm = categorySelect.value;
          categorySelect.innerHTML = '<option value="" disabled' + (valorAtualForm ? '' : ' selected') + '>Selecione</option>';
          categorias.forEach(function (nome) {
            var option = document.createElement('option');
            option.value = nome;
            option.textContent = nome;
            categorySelect.appendChild(option);
          });
          if (categorias.indexOf(valorAtualForm) !== -1) categorySelect.value = valorAtualForm;
          atualizarEditCategoryBtn();

          return categorias;
        })
        .catch(function () {});
    }

    // O botão de renomear só faz sentido com uma categoria escolhida — sem
    // isso não tem o que editar.
    function atualizarEditCategoryBtn() {
      editCategoryBtn.disabled = !categorySelect.value;
    }
    categorySelect.addEventListener('change', function () {
      atualizarEditCategoryBtn();
      fecharEdicaoCategoria();
    });

    function fecharNovaCategoria() {
      newCategoryRow.hidden = true;
      newCategoryError.hidden = true;
      newCategoryInput.value = '';
    }

    function fecharEdicaoCategoria() {
      editCategoryRow.hidden = true;
      editCategoryError.hidden = true;
      editCategoryInput.value = '';
    }

    function confirmarEdicaoCategoria() {
      var nomeAtual = categorySelect.value;
      var novoNome = editCategoryInput.value.trim();
      if (!novoNome) {
        editCategoryInput.focus();
        return;
      }
      if (novoNome === nomeAtual) {
        fecharEdicaoCategoria();
        return;
      }
      editCategoryError.hidden = true;
      fetch('/api/admin/categories/' + encodeURIComponent(nomeAtual), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: novoNome }),
      })
        .then(lerResposta)
        .then(function (data) {
          return carregarCategorias().then(function () {
            categorySelect.value = data.name;
            atualizarEditCategoryBtn();
            fecharEdicaoCategoria();
          });
        })
        .catch(function (err) {
          editCategoryError.textContent = err.message;
          editCategoryError.hidden = false;
        });
    }

    function confirmarNovaCategoria() {
      var nome = newCategoryInput.value.trim();
      if (!nome) {
        newCategoryInput.focus();
        return;
      }
      newCategoryError.hidden = true;
      postJSON('/api/admin/categories', { name: nome })
        .then(function (data) {
          return carregarCategorias().then(function () {
            categorySelect.value = data.name;
            atualizarEditCategoryBtn();
            fecharNovaCategoria();
          });
        })
        .catch(function (err) {
          newCategoryError.textContent = err.message;
          newCategoryError.hidden = false;
        });
    }

    addCategoryBtn.addEventListener('click', function () {
      newCategoryRow.hidden = false;
      newCategoryInput.focus();
    });
    cancelNewCategoryBtn.addEventListener('click', fecharNovaCategoria);
    confirmNewCategoryBtn.addEventListener('click', confirmarNovaCategoria);
    newCategoryInput.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        confirmarNovaCategoria();
      } else if (evt.key === 'Escape') {
        fecharNovaCategoria();
      }
    });

    editCategoryBtn.addEventListener('click', function () {
      editCategoryInput.value = categorySelect.value;
      editCategoryRow.hidden = false;
      editCategoryInput.focus();
      editCategoryInput.select();
    });
    cancelEditCategoryBtn.addEventListener('click', fecharEdicaoCategoria);
    confirmEditCategoryBtn.addEventListener('click', confirmarEdicaoCategoria);
    editCategoryInput.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        confirmarEdicaoCategoria();
      } else if (evt.key === 'Escape') {
        fecharEdicaoCategoria();
      }
    });

    function excluirItem(item) {
      if (!window.confirm('Excluir "' + item.name + '"? Essa ação não pode ser desfeita.')) return;
      fetch('/api/items/' + item.id, { method: 'DELETE' })
        .then(lerResposta)
        .then(function () { return carregarItens(); })
        .catch(function () {
          window.alert('Não foi possível excluir o item.');
        });
    }

    imagesInput.addEventListener('change', function () {
      if (existingImages.length + imagesInput.files.length > MAX_IMAGES) {
        formError.textContent = 'Máximo de ' + MAX_IMAGES + ' fotos por peça.';
        formError.hidden = false;
      }
      renderImagePreview();
    });

    form.addEventListener('submit', function (evt) {
      evt.preventDefault();
      formError.hidden = true;

      if (existingImages.length + imagesInput.files.length > MAX_IMAGES) {
        formError.textContent = 'Máximo de ' + MAX_IMAGES + ' fotos por peça.';
        formError.hidden = false;
        return;
      }

      var id = form.id.value;
      var formData = new FormData(form);
      if (!id) {
        formData.delete('id');
        formData.delete('existingImages');
      }

      var url = id ? '/api/items/' + id : '/api/items';
      var method = id ? 'PUT' : 'POST';

      fetch(url, { method: method, body: formData })
        .then(lerResposta)
        .then(function () {
          resetFormToCreateMode();
          carregarCategorias();
          return carregarItens();
        })
        .catch(function (err) {
          formError.textContent = err.message;
          formError.hidden = false;
        });
    });

    cancelEditBtn.addEventListener('click', resetFormToCreateMode);
    searchInput.addEventListener('input', renderizarItensFiltrados);
    categoryFilter.addEventListener('change', renderizarItensFiltrados);
    statusFilter.addEventListener('change', renderizarItensFiltrados);

    renderImagePreview();
    carregarCategorias();
    carregarItens();
  }

  // =========================================================================
  // INTERESSADOS
  // =========================================================================
  function initInteressados() {
    var status = document.getElementById('leadsStatus');
    var moreNotice = document.getElementById('leadsMoreNotice');
    var table = document.getElementById('leadsTable');

    function criarLinhaLead(lead) {
      var row = document.createElement('div');
      row.className = 'leads-row';

      var thumb = document.createElement('div');
      thumb.className = 'leads-row-thumb';
      if (lead.itemImageUrl) {
        var img = document.createElement('img');
        img.src = lead.itemImageUrl;
        img.alt = '';
        thumb.appendChild(img);
      }
      row.appendChild(thumb);

      var body = document.createElement('div');
      body.className = 'leads-row-body';

      var top = document.createElement('div');
      top.className = 'leads-row-top';
      var nome = document.createElement('a');
      nome.href = 'dashboard.html?tab=itens&edit=' + encodeURIComponent(lead.itemId || '');
      nome.textContent = lead.itemName;
      top.appendChild(nome);
      if (lead.itemStatus) {
        var statusBadge = document.createElement('span');
        statusBadge.className = 'badge badge-status-' + lead.itemStatus;
        statusBadge.textContent = STATUS_LABELS[lead.itemStatus] || lead.itemStatus;
        top.appendChild(statusBadge);
      }
      body.appendChild(top);

      var meta = document.createElement('div');
      meta.className = 'leads-row-meta';
      var partes = [formatarDataHora(lead.timestamp)];
      if (lead.itemPrice != null) partes.push(formatarPreco(lead.itemPrice));
      meta.textContent = partes.join(' · ');
      body.appendChild(meta);

      row.appendChild(body);

      if (lead.itemStatus === 'disponivel' && lead.itemId) {
        var actions = document.createElement('div');
        actions.className = 'leads-row-actions';
        var vendidoBtn = document.createElement('button');
        vendidoBtn.type = 'button';
        vendidoBtn.textContent = 'Marcar peça como vendida';
        vendidoBtn.addEventListener('click', function () {
          putJSON('/api/items/' + lead.itemId, { status: 'vendido' })
            .then(function () { return carregarLeads(); })
            .catch(function () {
              window.alert('Não foi possível atualizar o status.');
            });
        });
        actions.appendChild(vendidoBtn);
        row.appendChild(actions);
      }

      return row;
    }

    function carregarLeads() {
      status.hidden = false;
      status.textContent = 'Carregando...';
      return fetch('/api/admin/leads')
        .then(lerResposta)
        .then(function (data) {
          table.innerHTML = '';
          if (!data.leads.length) {
            status.textContent = 'Ninguém clicou para comprar ainda.';
            status.hidden = false;
            moreNotice.hidden = true;
            return;
          }
          status.hidden = true;
          moreNotice.hidden = !data.hasMore;
          data.leads.forEach(function (lead) {
            table.appendChild(criarLinhaLead(lead));
          });
        })
        .catch(function () {
          status.textContent = 'Não foi possível carregar os interessados.';
          status.hidden = false;
        });
    }

    carregarLeads();
  }

  // =========================================================================
  // CATEGORIAS
  // =========================================================================
  function initCategorias() {
    var list = document.getElementById('categoriesList');
    var status = document.getElementById('categoriesStatus');
    var errorBox = document.getElementById('categoriesError');

    function criarLinhaCategoria(nome) {
      var row = document.createElement('div');
      row.className = 'admin-category-row';

      var label = document.createElement('span');
      label.className = 'admin-category-name';
      label.textContent = nome;

      var input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 60;
      input.hidden = true;

      var renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.textContent = 'Renomear';

      var saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = 'Salvar';
      saveBtn.hidden = true;

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.hidden = true;

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'danger';
      deleteBtn.textContent = 'Excluir';

      function entrarModoEdicao() {
        label.hidden = true;
        input.hidden = false;
        renameBtn.hidden = true;
        deleteBtn.hidden = true;
        saveBtn.hidden = false;
        cancelBtn.hidden = false;
        input.value = nome;
        input.focus();
      }
      function sairModoEdicao() {
        label.hidden = false;
        input.hidden = true;
        renameBtn.hidden = false;
        deleteBtn.hidden = false;
        saveBtn.hidden = true;
        cancelBtn.hidden = true;
      }

      renameBtn.addEventListener('click', entrarModoEdicao);
      cancelBtn.addEventListener('click', sairModoEdicao);

      saveBtn.addEventListener('click', function () {
        var novoNome = input.value.trim();
        if (!novoNome || novoNome === nome) {
          sairModoEdicao();
          return;
        }
        errorBox.hidden = true;
        fetch('/api/admin/categories/' + encodeURIComponent(nome), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName: novoNome }),
        })
          .then(lerResposta)
          .then(function () { return carregarCategorias(); })
          .catch(function (err) {
            errorBox.textContent = err.message;
            errorBox.hidden = false;
          });
      });

      deleteBtn.addEventListener('click', function () {
        if (!window.confirm('Excluir a categoria "' + nome + '"?')) return;
        errorBox.hidden = true;
        fetch('/api/admin/categories/' + encodeURIComponent(nome), { method: 'DELETE' })
          .then(lerResposta)
          .then(function () { return carregarCategorias(); })
          .catch(function (err) {
            errorBox.textContent = err.message;
            errorBox.hidden = false;
          });
      });

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(renameBtn);
      row.appendChild(saveBtn);
      row.appendChild(cancelBtn);
      row.appendChild(deleteBtn);
      return row;
    }

    function carregarCategorias() {
      status.hidden = false;
      status.textContent = 'Carregando...';
      return fetch('/api/categories')
        .then(lerResposta)
        .then(function (categorias) {
          list.innerHTML = '';
          if (!categorias.length) {
            status.textContent = 'Nenhuma categoria cadastrada ainda.';
            status.hidden = false;
            return;
          }
          status.hidden = true;
          categorias.forEach(function (nome) {
            list.appendChild(criarLinhaCategoria(nome));
          });
        })
        .catch(function () {
          status.textContent = 'Não foi possível carregar as categorias.';
          status.hidden = false;
        });
    }

    carregarCategorias();
  }

  // =========================================================================
  // USUÁRIOS (só admin — a aba fica escondida pra colaborador em checkSession)
  // =========================================================================
  function initUsuarios() {
    var list = document.getElementById('usuariosList');
    var status = document.getElementById('usuariosStatus');
    var errorBox = document.getElementById('usuariosError');

    function criarLinhaUsuario(user) {
      var row = document.createElement('div');
      row.className = 'admin-user-row';

      var info = document.createElement('div');
      info.className = 'admin-user-info';
      var nome = document.createElement('strong');
      nome.textContent = user.username + (user.username === whoami.textContent ? ' (você)' : '');
      var email = document.createElement('span');
      email.textContent = user.email;
      info.appendChild(nome);
      info.appendChild(email);
      row.appendChild(info);

      var badge = document.createElement('span');
      badge.className = 'badge ' + (user.role === 'admin' ? 'badge-admin' : 'badge-colaborador');
      badge.textContent = user.role === 'admin' ? 'Admin' : 'Colaborador';
      row.appendChild(badge);

      var toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      var novoRole = user.role === 'admin' ? 'colaborador' : 'admin';
      toggleBtn.textContent = user.role === 'admin' ? 'Remover admin' : 'Tornar admin';
      toggleBtn.className = user.role === 'admin' ? 'danger' : '';
      toggleBtn.addEventListener('click', function () {
        errorBox.hidden = true;
        putJSON('/api/admin/users/' + user.id + '/role', { role: novoRole })
          .then(function () { return carregarUsuarios(); })
          .catch(function (err) {
            errorBox.textContent = err.message;
            errorBox.hidden = false;
          });
      });
      row.appendChild(toggleBtn);

      return row;
    }

    function carregarUsuarios() {
      status.hidden = false;
      status.textContent = 'Carregando...';
      return fetch('/api/admin/users')
        .then(lerResposta)
        .then(function (users) {
          list.innerHTML = '';
          status.hidden = true;
          users.forEach(function (user) {
            list.appendChild(criarLinhaUsuario(user));
          });
        })
        .catch(function () {
          status.textContent = 'Não foi possível carregar os usuários.';
          status.hidden = false;
        });
    }

    carregarUsuarios();
  }

  // =========================================================================
  // FINANCEIRO — vendas do site (itens "vendido") + vendas cadastradas à mão
  // da loja física, combinadas num resumo por período. Visível pra qualquer
  // conta logada, não só admin (é trabalho do dia a dia da loja).
  // =========================================================================
  function initFinanceiro() {
    var periodoSelect = document.getElementById('financeiroPeriodo');
    var status = document.getElementById('financeiroStatus');
    var statGrid = document.getElementById('financeiroStatGrid');
    var transacoesStatus = document.getElementById('transacoesStatus');
    var transacoesList = document.getElementById('transacoesList');
    var saleForm = document.getElementById('saleForm');
    var saleFormError = document.getElementById('saleFormError');

    function criarLinhaTransacao(t) {
      var row = document.createElement('div');
      row.className = 'admin-transaction-row';

      var badge = document.createElement('span');
      badge.className = 'badge ' + (t.origem === 'Site' ? 'badge-origem-site' : 'badge-origem-loja');
      badge.textContent = t.origem;
      row.appendChild(badge);

      var info = document.createElement('div');
      info.className = 'admin-transaction-info';
      var nome = document.createElement('strong');
      nome.textContent = t.name;
      var data = document.createElement('span');
      data.textContent = formatarDataHora(t.date);
      info.appendChild(nome);
      info.appendChild(data);
      row.appendChild(info);

      var preco = document.createElement('span');
      preco.className = 'admin-transaction-price';
      preco.textContent = formatarPreco(t.price);
      row.appendChild(preco);

      // Venda do site só se apaga mudando o status do item (Itens > Excluir
      // ou voltar pra "disponível") — aqui só é possível excluir o que foi
      // cadastrado à mão da loja física.
      if (t.origem === 'Loja física') {
        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.textContent = 'Excluir';
        deleteBtn.addEventListener('click', function () {
          if (!window.confirm('Excluir a venda "' + t.name + '"? Essa ação não pode ser desfeita.')) return;
          fetch('/api/admin/sales/' + t.id, { method: 'DELETE' })
            .then(lerResposta)
            .then(function () { return carregarFinanceiro(); })
            .catch(function () {
              window.alert('Não foi possível excluir a venda.');
            });
        });
        row.appendChild(deleteBtn);
      }

      return row;
    }

    function carregarFinanceiro() {
      var dias = periodoSelect.value;

      status.hidden = false;
      status.textContent = 'Carregando...';
      statGrid.hidden = true;
      transacoesStatus.hidden = false;
      transacoesStatus.textContent = 'Carregando...';
      transacoesList.innerHTML = '';

      return fetch('/api/admin/financeiro/summary?dias=' + dias)
        .then(lerResposta)
        .then(function (data) {
          document.getElementById('statTotalSite').textContent = formatarPreco(data.totalSite);
          document.getElementById('statTotalLoja').textContent = formatarPreco(data.totalLoja);
          document.getElementById('statTotalGeral').textContent = formatarPreco(data.totalGeral);
          statGrid.hidden = false;
          status.hidden = true;

          if (!data.transacoes.length) {
            transacoesStatus.textContent = 'Nenhuma venda registrada nesse período.';
            transacoesStatus.hidden = false;
            return;
          }
          transacoesStatus.hidden = true;
          data.transacoes.forEach(function (t) {
            transacoesList.appendChild(criarLinhaTransacao(t));
          });
        })
        .catch(function () {
          status.textContent = 'Não foi possível carregar os dados financeiros.';
          status.hidden = false;
        });
    }

    periodoSelect.addEventListener('change', carregarFinanceiro);

    saleForm.addEventListener('submit', function (evt) {
      evt.preventDefault();
      saleFormError.hidden = true;

      postJSON('/api/admin/sales', {
        name: saleForm.name.value.trim(),
        price: saleForm.price.value,
        soldAt: saleForm.soldAt.value,
        category: saleForm.category.value.trim(),
        paymentMethod: saleForm.paymentMethod.value.trim(),
      })
        .then(function () {
          saleForm.reset();
          return carregarFinanceiro();
        })
        .catch(function (err) {
          saleFormError.textContent = err.message;
          saleFormError.hidden = false;
        });
    });

    carregarFinanceiro();
  }

  checkSession().then(function () {
    initVisaoGeral();
    initItens();
    initInteressados();
    initCategorias();
    initFinanceiro();
    if (isAdminAtual) initUsuarios();
  });
})();
