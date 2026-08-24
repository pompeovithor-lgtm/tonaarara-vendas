/*
 * Cria uma conta de acesso ao painel direto por linha de comando —
 * um "atalho de emergência" que não passa pela tela de cadastro nem
 * pelo código de convite. Útil para o primeiro acesso ou se a loja
 * ficar sem conseguir entrar (ex.: perdeu acesso ao e-mail também).
 *
 * Uso: npm run create-admin -- <usuario> <email> <senha>
 */
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

if (usersStore.findByUsername(username)) {
  console.error(`Já existe uma conta com o usuário "${username}". Use outro nome ou recupere a senha pelo painel.`);
  process.exit(1);
}
if (usersStore.findByEmail(cleanEmail)) {
  console.error(`Já existe uma conta com o e-mail "${cleanEmail}". Use outro e-mail ou recupere a senha pelo painel.`);
  process.exit(1);
}

usersStore.create({
  id: crypto.randomUUID(),
  username,
  email: cleanEmail,
  passwordHash: bcrypt.hashSync(password, 10),
  resetTokenHash: null,
  resetTokenExpires: null,
  createdAt: Date.now(),
});

console.log(`Conta "${username}" (${cleanEmail}) criada com sucesso em backend/data/users.json`);
