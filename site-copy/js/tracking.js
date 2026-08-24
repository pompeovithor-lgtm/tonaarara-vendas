/* ==========================================================================
   TRACKING — registra visitas e eventos anônimos (sem dados pessoais).
   Não é incluído nas páginas do /admin: o painel não deve se contar como
   visita do site. O servidor também ignora tudo isso quando o dono da loja
   está logado, então nem os testes pelo próprio navegador dele contam.
   ========================================================================== */

(function () {
  function enviar(url, dados) {
    var json = JSON.stringify(dados);
    if (navigator.sendBeacon) {
      var blob = new Blob([json], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
    }).catch(function () {});
  }

  // Função global simples pra ser chamada nas próximas fases, por exemplo:
  // window.tnaTrack('whatsapp_click', { itemId: item.id })
  window.tnaTrack = function (type, extra) {
    var payload = { type: type };
    for (var chave in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, chave)) payload[chave] = extra[chave];
    }
    enviar('/api/track/event', payload);
  };

  enviar('/api/track/pageview', {
    path: window.location.pathname,
    referrer: document.referrer || null,
  });
})();
