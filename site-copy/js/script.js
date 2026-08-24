/* ==========================================================================
   TÔ NA ARARA — SCRIPTS DA PÁGINA
   Este arquivo cuida de cinco coisinhas simples da interface:
   1. Atualizar o ano no rodapé automaticamente (não precisa editar todo ano)
   2. Abrir/fechar o menu no celular (botão "hamburguer"), com animação
   3. Fechar o menu do celular ao clicar em um link
   4. Dar sombra no cabeçalho quando a página é rolada
   5. Revelar as seções suavemente conforme a pessoa rola a página

   (A classe "js" no <html>, que liga as animações do item 5, é adicionada
   por um script inline no <head> do index.html — precisa rodar antes da
   página desenhar na tela, por isso não fica aqui neste arquivo.)
   ========================================================================== */

// 1. Ano atual no rodapé (elemento <span id="year"> no HTML)
document.getElementById('year').textContent = new Date().getFullYear();

// 2. Menu mobile: alterna a classe "nav-open" no <body>.
//    É essa classe que o CSS usa (em style.css, seção Responsivo) para animar
//    a abertura/fechamento da lista de links em telas pequenas.
var toggle = document.getElementById('menuToggle');
toggle.addEventListener('click', function () {
  document.body.classList.toggle('nav-open');
});

// 3. Ao clicar em qualquer link do menu, fecha o menu mobile automaticamente
document.querySelectorAll('.nav-links a').forEach(function (link) {
  link.addEventListener('click', function () {
    document.body.classList.remove('nav-open');
  });
});

// 4. Sombra no cabeçalho: some quando está no topo, aparece ao rolar um pouco
//    (a classe "scrolled" é estilizada em style.css, seção Cabeçalho)
var header = document.querySelector('header');
function atualizarSombraCabecalho() {
  header.classList.toggle('scrolled', window.scrollY > 8);
}
document.addEventListener('scroll', atualizarSombraCabecalho, { passive: true });
atualizarSombraCabecalho();

// 5. Scroll reveal: observa os elementos com a classe "reveal" e adiciona
//    "is-visible" assim que eles entram na tela, o que dispara a transição
//    definida em style.css. Cada elemento revela só uma vez.
var elementosParaRevelar = document.querySelectorAll('.reveal');
var observadorDeRevelacao = new IntersectionObserver(
  function (entradas, observador) {
    entradas.forEach(function (entrada) {
      if (entrada.isIntersecting) {
        entrada.target.classList.add('is-visible');
        observador.unobserve(entrada.target);
      }
    });
  },
  { threshold: 0.15 }
);
elementosParaRevelar.forEach(function (elemento) {
  observadorDeRevelacao.observe(elemento);
});
