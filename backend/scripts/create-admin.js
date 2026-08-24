/*
 * Cria uma conta de acesso ao painel direto por linha de comando —
 * um "atalho de emergência" que não passa pela tela de cadastro nem
 * pelo código de convite. Útil para o primeiro acesso ou se a loja
 * ficar sem conseguir entrar (ex.: perdeu acesso ao e-mail também).
 *
 * Uso: npm run create-admin -- <usuario> <email> <senha>
 * Precisa das variáveis de ambiente do Postgres (POSTGRES_URL) definidas —
 * copie da aba Storage do projeto na Vercel para um .env local, ou rode
 * com `vercel env pull` se tiver o Vercel CLI instalado.
 */
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const usersStore = require('../usersStore');

const [, , username, email, password] = process.argv;

if (!username || !email || !password) {
  console.error('Uso: npm run create-admin -- <usuario> <email> <senha>');
  process.exit(1);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!EMAIL_RE.test(email)) {
  console.error('E-mail inválido.');
  process.exit(1);
}

if (password.length < 6) {
  console.error('A senha precisa ter pelo menos 6 caracteres.');
  process.exit(1);
}

const cleanEmail = email.trim().toLowerCase();

async function main() {
  if (await usersStore.findByUsername(username)) {
    console.error(`Já existe uma conta com o usuário "${username}". Use outro nome ou recupere a senha pelo painel.`);
    process.exit(1);
  }
  if (await usersStore.findByEmail(cleanEmail)) {
    console.error(`Já existe uma conta com o e-mail "${cleanEmail}". Use outro e-mail ou recupere a senha pelo painel.`);
    process.exit(1);
  }

  await usersStore.create({
    id: crypto.randomUUID(),
    username,
    email: cleanEmail,
    passwordHash: bcrypt.hashSync(password, 10),
    role: (await usersStore.count()) === 0 ? 'admin' : 'colaborador',
    resetTokenHash: null,
    resetTokenExpires: null,
    createdAt: Date.now(),
  });

  console.log(`Conta "${username}" (${cleanEmail}) criada com sucesso no banco de dados.`);
}

main().catch((err) => {
  console.error('Erro ao criar conta:', err);
  process.exit(1);
});
