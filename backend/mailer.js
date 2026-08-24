const nodemailer = require('nodemailer');

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

// Envia o e-mail de recuperação de senha. Se o SMTP não estiver configurado
// no .env (SMTP_HOST/SMTP_USER/SMTP_PASS), o link é apenas exibido no
// console do servidor — assim o cadastro funciona localmente antes de
// configurar um provedor de e-mail de verdade (ex.: Gmail com senha de app).
async function sendPasswordResetEmail(email, resetLink) {
  if (!isConfigured()) {
    console.log('\n[Tô Na Arara] SMTP não configurado — link de recuperação de senha:');
    console.log(`  Para: ${email}`);
    console.log(`  Link: ${resetLink}\n`);
    return;
  }

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Recuperação de senha — Tô Na Arara',
    text:
      `Recebemos um pedido para redefinir a senha do painel Tô Na Arara.\n\n` +
      `Clique no link abaixo para criar uma nova senha (válido por 1 hora):\n${resetLink}\n\n` +
      `Se você não pediu isso, pode ignorar este e-mail.`,
    html:
      `<p>Recebemos um pedido para redefinir a senha do painel <strong>Tô Na Arara</strong>.</p>` +
      `<p><a href="${resetLink}">Clique aqui para criar uma nova senha</a> (válido por 1 hora).</p>` +
      `<p>Se você não pediu isso, pode ignorar este e-mail.</p>`,
  });
}

// Envia o resumo diário (visitas + cliques em "Comprar no WhatsApp" de
// ontem) para o e-mail de uma conta do painel. Mesma regra do reset de
// senha: sem SMTP configurado, só mostra no console — assim o recurso não
// quebra em ambiente local.
async function sendDailySummaryEmail(email, { totalVisits, whatsappClicks, date }) {
  const dataLabel = new Date(date).toLocaleDateString('pt-BR');

  if (!isConfigured()) {
    console.log(`\n[Tô Na Arara] SMTP não configurado — resumo diário de ${dataLabel} não foi enviado por e-mail:`);
    console.log(`  Para: ${email}`);
    console.log(`  ${totalVisits} visita(s), ${whatsappClicks} clique(s) em "Comprar no WhatsApp".\n`);
    return;
  }

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: `Resumo de ontem (${dataLabel}) — Tô Na Arara`,
    text:
      `Resumo de ontem (${dataLabel}):\n\n` +
      `${totalVisits} visita(s) na vitrine\n` +
      `${whatsappClicks} clique(s) em "Comprar no WhatsApp"\n`,
    html:
      `<p>Resumo de <strong>ontem (${dataLabel})</strong>:</p>` +
      `<ul><li>${totalVisits} visita(s) na vitrine</li><li>${whatsappClicks} clique(s) em "Comprar no WhatsApp"</li></ul>`,
  });
}

module.exports = { isConfigured, sendPasswordResetEmail, sendDailySummaryEmail };
