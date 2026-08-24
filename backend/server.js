require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');
const compression = require('compression');

const itemsStore = require('./itemsStore');
const usersStore = require('./usersStore');
const categoriesStore = require('./categoriesStore');
const visitsStore = require('./visitsStore');
const eventsStore = require('./eventsStore');
const salesStore = require('./salesStore');
const mailer = require('./mailer');

// Rede de segurança: sem isto, uma promise rejeitada que ninguém tratou (ex.:
// erro de disco cheio no meio de um upload) derruba o processo Node inteiro
// a partir da v15 — um único request com azar tiraria o site do ar pra
// todo mundo. Aqui só loga o erro; o request que causou fica sem resposta e
// expira normalmente, mas o servidor continua no ar para os demais.
process.on('unhandledRejection', (reason) => {
  console.error('Promise rejeitada sem tratamento:', reason);
});

const SIZES = ['P', 'M', 'G', 'GG'];

const VISITOR_COOKIE_NAME = 'tonaarara.vid';
const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;
const TRACK_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const TRACK_RATE_LIMIT_MAX = 60;

const ENV_PATH = path.join(__dirname, '.env');

// SESSION_SECRET é a única variável obrigatória para o servidor subir —
// se não existir ainda (primeira vez rodando o projeto), geramos uma e
// gravamos no .env automaticamente.
if (!process.env.SESSION_SECRET) {
  const secret = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(ENV_PATH, `SESSION_SECRET=${secret}\n`);
  process.env.SESSION_SECRET = secret;
}

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
// Cookies "secure" só são enviados em conexões HTTPS. Fica desligado por
// padrão pra não quebrar o desenvolvimento local (http://localhost não é
// HTTPS) — ligue com COOKIE_SECURE=true no .env assim que publicar a loja
// atrás de HTTPS de verdade.
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

const SITE_DIR = path.join(__dirname, '..', 'site-copy');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// Upload em memória (não grava o arquivo original em disco): o buffer passa
// pelo sharp antes de virar arquivo, então a versão redimensionada/comprimida
// é a única que chega a backend/uploads. O limite aqui é do arquivo ORIGINAL
// enviado pelo celular (fotos de câmera facilmente passam de 5MB); o que sai
// depois da compressão é bem menor.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TO_EXT[file.mimetype]) cb(null, true);
    else cb(new Error('Formato de imagem não suportado. Use JPG, PNG, WEBP ou GIF.'));
  },
});

const MAX_IMAGE_DIMENSION = 1600;

// Redimensiona (maior lado até 1600px) e comprime a imagem enviada, salvando
// o resultado em backend/uploads com um nome novo. Todo arquivo passa pelo
// sharp — inclusive GIF, com { animated: true } pra preservar a animação —
// porque o sharp decodifica o conteúdo de verdade: um arquivo que só
// "finge" ser imagem (Content-Type forjado por um cliente que não é o
// navegador) é rejeitado aqui, em vez de ser gravado como está em
// backend/uploads, que é uma pasta servida publicamente.
async function saveUploadedImage(file) {
  const ext = ALLOWED_MIME_TO_EXT[file.mimetype] || '';
  const filename = crypto.randomUUID() + ext;
  const destPath = path.join(UPLOADS_DIR, filename);

  if (file.mimetype === 'image/gif') {
    await sharp(file.buffer, { animated: true })
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .gif()
      .toFile(destPath);
    return filename;
  }

  let pipeline = sharp(file.buffer)
    .rotate() // aplica a orientação EXIF (comum em fotos de celular) antes de descartar os metadados
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });

  // PNG é sem perdas: o sharp só usa a opção "quality" quando "palette" está
  // ligado (paleta indexada) — sem isso ela é ignorada silenciosamente, então
  // nem declaramos aqui. compressionLevel:9 já aplica a compressão máxima
  // (lossless); quem realmente reduz o tamanho do arquivo é o resize acima.
  if (file.mimetype === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (file.mimetype === 'image/webp') pipeline = pipeline.webp({ quality: 80 });
  else pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });

  await pipeline.toFile(destPath);
  return filename;
}

const app = express();
app.disable('x-powered-by');

// Headers básicos de segurança, aplicados a toda resposta. Não inclui
// Content-Security-Policy: o site carrega fontes do Google Fonts e tem dois
// scripts inline pequenos (marcação de "JS disponível" e o redirect de
// /item/:id), então uma CSP bem feita exigiria reescrever esses pontos —
// deixado de fora aqui pra não travar algo que já funciona sem essa rede de
// segurança adicional.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Compacta HTML/CSS/JS/JSON antes de enviar (gzip) — reduz bastante o
// tamanho transferido pra quem acessa pelo celular. Fotos não passam por
// aqui de novo (JPEG/PNG/WEBP já são formatos comprimidos, gzip não ajuda
// e só gastaria CPU à toa) — o compression já pula esses tipos sozinho.
app.use(compression());

app.use(express.json());
app.use(
  session({
    name: 'tonaarara.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Fotos da vitrine: nome de arquivo é sempre um UUID gerado pelo servidor
// (nunca reaproveitado — uma edição gera um arquivo novo), então o conteúdo
// de uma URL de /uploads nunca muda. Cache longo e "immutable" é seguro e é
// o maior ganho de performance possível aqui, já que fotos são o item mais
// pesado da página.
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1y', immutable: true }));
app.use(express.static(SITE_DIR));

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.status(401).json({ error: 'Não autenticado.' });
}

// Mais estrito que requireAuth: usado só nas rotas de gestão de permissões,
// pra um colaborador não conseguir se promover (ou promover outra conta)
// chamando a API diretamente, mesmo que a aba "Usuários" fique escondida
// pra ele na tela.
function requireAdmin(req, res, next) {
  if (!(req.session && req.session.loggedIn)) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  const user = usersStore.findById(req.session.userId);
  if (!usersStore.isAdmin(user)) {
    return res.status(403).json({ error: 'Só administradores podem fazer isso.' });
  }
  next();
}

function toPublicItem(item) {
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    description: item.description,
    size: item.size,
    category: item.category,
    status: item.status,
    imageUrls: (item.images || []).map((filename) => `/uploads/${filename}`),
    createdAt: item.createdAt,
  };
}

function deleteImageFiles(filenames) {
  (filenames || []).forEach((filename) => {
    if (!filename) return;
    fs.unlink(path.join(UPLOADS_DIR, filename), () => {});
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,40}$/;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

function tokensMatch(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------- Ajudantes de rastreamento (visitas e eventos anônimos) ----------

// Não usamos cookie-parser (o projeto evita dependências extras quando dá):
// só precisamos ler um único cookie próprio, então um parser manual resolve.
function parseCookieHeader(header) {
  const cookies = {};
  (header || '').split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i === -1) return;
    const key = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

// Identifica o visitante de forma anônima: um UUID sem nenhum dado pessoal,
// guardado num cookie próprio (separado do cookie de sessão do admin) só
// pra não contar a mesma pessoa duas vezes.
function getOrCreateVisitorId(req, res) {
  const cookies = parseCookieHeader(req.headers.cookie);
  let visitorId = cookies[VISITOR_COOKIE_NAME];
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    res.cookie(VISITOR_COOKIE_NAME, visitorId, {
      maxAge: VISITOR_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
    });
  }
  return visitorId;
}

function detectDevice(userAgent) {
  return /mobile|android|iphone|ipod|ipad|windows phone/i.test(userAgent || '') ? 'mobile' : 'desktop';
}

// Lê "?dias=" das rotas de estatística: número inteiro positivo, com um
// valor padrão se não vier (ou vier inválido) e um teto de 1 ano pra
// ninguém pedir uma janela absurda sem querer.
function parseDias(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 365);
}

// Converte "YYYY-MM-DD" (o que um <input type="date"> manda) pra timestamp
// da meia-noite NO FUSO LOCAL do servidor. Usar "new Date(str)" direto
// interpretaria como meia-noite UTC, o que "volta um dia" quando exibido de
// novo em horário de Brasília (UTC-3) — por isso a montagem manual aqui.
function parseDataLocal(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return NaN;
  const [, ano, mes, dia] = match;
  return new Date(Number(ano), Number(mes) - 1, Number(dia)).getTime();
}

// Limite simples por IP pra evitar que alguém martele os endpoints de
// rastreamento: guardado em memória, não precisa sobreviver a um reinício.
const trackRateLimitBuckets = new Map();
setInterval(() => {
  const now = Date.now();
  trackRateLimitBuckets.forEach((bucket, ip) => {
    if (now > bucket.resetAt) trackRateLimitBuckets.delete(ip);
  });
}, 5 * 60 * 1000).unref();

function trackRateLimiter(req, res, next) {
  const ip = req.ip || 'desconhecido';
  const now = Date.now();
  let bucket = trackRateLimitBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + TRACK_RATE_LIMIT_WINDOW_MS };
    trackRateLimitBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > TRACK_RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
  }
  next();
}

// Limite de tentativas nos endpoints sensíveis de autenticação (login,
// criar conta, esqueci minha senha): dificulta força bruta sem atrapalhar
// uso normal — 10 tentativas a cada 15 minutos, por IP, contadas
// separadamente em cada endpoint.
function authRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' },
  });
}

// ---------- Autenticação: sessão, login, logout ----------

app.get('/api/session', (req, res) => {
  const loggedIn = Boolean(req.session && req.session.loggedIn);
  const user = loggedIn ? usersStore.findById(req.session.userId) : null;
  res.json({
    loggedIn,
    username: req.session?.username || null,
    email: req.session?.email || null,
    isAdmin: usersStore.isAdmin(user),
  });
});

app.post('/api/login', authRateLimiter(), (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Informe usuário/e-mail e senha.' });
  }
  if (String(username).length > 254 || String(password).length > 72) {
    return res.status(401).json({ error: 'Usuário/e-mail ou senha inválidos.' });
  }
  const user = usersStore.findByUsernameOrEmail(String(username).trim());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Usuário/e-mail ou senha inválidos.' });
  }
  req.session.loggedIn = true;
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.email = user.email;
  res.json({ loggedIn: true, username: user.username, email: user.email, isAdmin: usersStore.isAdmin(user) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('tonaarara.sid');
    res.json({ ok: true });
  });
});

// ---------- Autenticação: criar conta ----------
// A primeira conta criada no painel não precisa de código (bootstrap da
// loja). A partir da segunda, é preciso informar o SIGNUP_CODE definido no
// .env do servidor — assim visitantes do site não conseguem criar acesso
// ao painel sozinhos.

app.post('/api/register', authRateLimiter(), (req, res) => {
  const { username, email, password, confirmPassword, signupCode } = req.body || {};

  const cleanUsername = String(username || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (!USERNAME_RE.test(cleanUsername)) {
    return res.status(400).json({ error: 'Usuário deve ter de 3 a 40 letras, números, ponto, - ou _.' });
  }
  if (cleanEmail.length > 254 || !EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ error: 'Informe um e-mail válido (ex.: seuemail@gmail.com) — ele será usado para recuperar a senha.' });
  }
  if (!password || password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: 'A senha precisa ter entre 6 e 72 caracteres.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'As senhas não coincidem.' });
  }

  const existingUsers = usersStore.count();
  if (existingUsers > 0) {
    if (!process.env.SIGNUP_CODE || signupCode !== process.env.SIGNUP_CODE) {
      return res.status(403).json({ error: 'Cadastro fechado. Peça o código de convite a quem já tem acesso ao painel.' });
    }
  }

  if (usersStore.findByUsername(cleanUsername)) {
    return res.status(409).json({ error: 'Esse usuário já existe.' });
  }
  if (usersStore.findByEmail(cleanEmail)) {
    return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
  }

  const user = {
    id: crypto.randomUUID(),
    username: cleanUsername,
    email: cleanEmail,
    passwordHash: bcrypt.hashSync(password, 10),
    // A primeira conta da loja (bootstrap, sem código de convite) já nasce
    // admin. A partir da segunda, quem se cadastra com o código de convite
    // entra como "colaborador" — um admin existente precisa promovê-la pela
    // aba "Usuários" do painel se quiser dar acesso de admin a ela.
    role: existingUsers === 0 ? 'admin' : 'colaborador',
    resetTokenHash: null,
    resetTokenExpires: null,
    createdAt: Date.now(),
  };
  usersStore.create(user);

  req.session.loggedIn = true;
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.email = user.email;
  res.status(201).json({ loggedIn: true, username: user.username, email: user.email, isAdmin: usersStore.isAdmin(user) });
});

// ---------- Autenticação: recuperação de senha por e-mail ----------

app.post('/api/forgot-password', authRateLimiter(), async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' });
  }

  const genericMessage = 'Se esse e-mail tiver uma conta, enviamos um link de recuperação para ele.';
  const user = usersStore.findByEmail(email);

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    usersStore.update(user.id, {
      resetTokenHash: sha256(token),
      resetTokenExpires: Date.now() + 60 * 60 * 1000,
    });
    const link = `${BASE_URL}/admin/reset-password.html?email=${encodeURIComponent(user.email)}&token=${token}`;
    try {
      await mailer.sendPasswordResetEmail(user.email, link);
    } catch (err) {
      console.error('Erro ao enviar e-mail de recuperação:', err.message);
    }
  }

  res.json({ ok: true, message: genericMessage });
});

const RESET_TOKEN_RE = /^[0-9a-f]{64}$/;

app.post('/api/reset-password', authRateLimiter(), (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const token = String((req.body && req.body.token) || '');
  const { password, confirmPassword } = req.body || {};

  const invalidMessage = 'Link inválido ou expirado. Solicite uma nova recuperação de senha.';

  if (!email || email.length > 254 || !RESET_TOKEN_RE.test(token)) {
    return res.status(400).json({ error: invalidMessage });
  }
  if (!password || password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: 'A senha precisa ter entre 6 e 72 caracteres.' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'As senhas não coincidem.' });
  }

  const user = usersStore.findByEmail(email);
  if (!user || !user.resetTokenHash || !user.resetTokenExpires) {
    return res.status(400).json({ error: invalidMessage });
  }
  if (Date.now() > user.resetTokenExpires || !tokensMatch(sha256(token), user.resetTokenHash)) {
    return res.status(400).json({ error: invalidMessage });
  }

  usersStore.update(user.id, {
    passwordHash: bcrypt.hashSync(password, 10),
    resetTokenHash: null,
    resetTokenExpires: null,
  });
  res.json({ ok: true });
});

// ---------- Categorias ----------
// Lista aberta e mutável: toda vez que um item é cadastrado com uma
// categoria nova (ex.: "Camisa"), ela entra pra lista automaticamente e
// passa a aparecer como sugestão nos próximos cadastros.

app.get('/api/categories', (req, res) => {
  res.json(categoriesStore.getAll());
});

// Gestão de categorias: só a loja, logada, pode mexer. Criar existe pra
// deixar o campo de categoria do formulário de item um <select> (só escolhe
// entre categorias que já existem) em vez de texto livre — o botão "+" cria
// a categoria por aqui antes dela aparecer como opção. Renomear atualiza o
// texto em todos os itens que usam a categoria antiga. Excluir só é
// permitido se nenhum item estiver usando a categoria.

app.post('/api/admin/categories', requireAuth, (req, res) => {
  const name = ((req.body && req.body.name) || '').trim();

  if (!name || name.length > 60) {
    return res.status(400).json({ error: 'Informe um nome de categoria válido.' });
  }

  const saved = categoriesStore.ensure(name);
  res.status(201).json({ name: saved });
});

app.put('/api/admin/categories/:name', requireAuth, (req, res) => {
  const oldName = req.params.name;
  const newName = ((req.body && req.body.newName) || '').trim();

  if (!newName || newName.length > 60) {
    return res.status(400).json({ error: 'Informe um nome de categoria válido.' });
  }

  const renamed = categoriesStore.rename(oldName, newName);
  if (!renamed) return res.status(404).json({ error: 'Categoria não encontrada.' });

  itemsStore.renameCategory(oldName, renamed);
  res.json({ ok: true, name: renamed });
});

app.delete('/api/admin/categories/:name', requireAuth, (req, res) => {
  const name = req.params.name;

  if (itemsStore.isCategoryInUse(name)) {
    return res.status(409).json({
      error: 'Essa categoria está em uso por pelo menos um item. Troque a categoria desses itens antes de excluí-la.',
    });
  }

  const removed = categoriesStore.remove(name);
  if (!removed) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json({ ok: true });
});

// ---------- Itens da vitrine ----------

app.get('/api/items', (req, res) => {
  const precoMin = req.query.precoMin !== undefined ? Number(req.query.precoMin) : undefined;
  const precoMax = req.query.precoMax !== undefined ? Number(req.query.precoMax) : undefined;

  const items = itemsStore.search({
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    categoria: typeof req.query.categoria === 'string' ? req.query.categoria : undefined,
    tamanho: typeof req.query.tamanho === 'string' ? req.query.tamanho : undefined,
    precoMin: Number.isFinite(precoMin) ? precoMin : undefined,
    precoMax: Number.isFinite(precoMax) ? precoMax : undefined,
    ordenar: typeof req.query.ordenar === 'string' ? req.query.ordenar : undefined,
    mostrarVendidos: req.query.mostrarVendidos === '1',
  });

  res.json(items.map(toPublicItem));
});

app.post('/api/items', requireAuth, (req, res) => {
  upload.array('images', 6)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    // try/catch cobrindo o handler inteiro: sem isto, um erro inesperado
    // (ex.: disco cheio ao gravar o item) numa função async passada como
    // callback pro multer vira uma promise rejeitada que ninguém trata —
    // o pedido nunca recebe resposta (fica pendurado até dar timeout).
    try {
      const name = (req.body.name || '').trim();
      const description = (req.body.description || '').trim();
      const price = Number(req.body.price);
      const size = (req.body.size || '').trim().toUpperCase();
      const category = (req.body.category || '').trim();
      const status = (req.body.status || 'disponivel').trim();

      if (!name || name.length > 120) {
        return res.status(400).json({ error: 'Nome inválido.' });
      }
      if (!description || description.length > 2000) {
        return res.status(400).json({ error: 'Descrição inválida.' });
      }
      if (!Number.isFinite(price) || price <= 0 || price > 999999) {
        return res.status(400).json({ error: 'Valor inválido.' });
      }
      if (!SIZES.includes(size)) {
        return res.status(400).json({ error: 'Selecione um tamanho válido (P, M, G ou GG).' });
      }
      if (!category || category.length > 60) {
        return res.status(400).json({ error: 'Informe uma categoria.' });
      }
      if (!itemsStore.STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Status inválido.' });
      }

      let images;
      try {
        images = await Promise.all((req.files || []).map(saveUploadedImage));
      } catch (imgErr) {
        console.error('Erro ao processar imagem:', imgErr.message);
        return res.status(400).json({ error: 'Não foi possível processar uma das imagens enviadas.' });
      }

      const item = {
        id: crypto.randomUUID(),
        name,
        description,
        price,
        size,
        category: categoriesStore.ensure(category),
        status,
        images,
        createdAt: Date.now(),
      };
      itemsStore.create(item);
      res.status(201).json(toPublicItem(item));
    } catch (e) {
      console.error('Erro ao cadastrar item:', e);
      res.status(500).json({ error: 'Não foi possível cadastrar o item. Tente novamente.' });
    }
  });
});

app.put('/api/items/:id', requireAuth, (req, res) => {
  upload.array('images', 6)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const existing = itemsStore.getById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Item não encontrado.' });

      const changes = {};

      if (req.body.name !== undefined) {
        const name = req.body.name.trim();
        if (!name || name.length > 120) return res.status(400).json({ error: 'Nome inválido.' });
        changes.name = name;
      }
      if (req.body.description !== undefined) {
        const description = req.body.description.trim();
        if (!description || description.length > 2000) {
          return res.status(400).json({ error: 'Descrição inválida.' });
        }
        changes.description = description;
      }
      if (req.body.price !== undefined) {
        const price = Number(req.body.price);
        if (!Number.isFinite(price) || price <= 0 || price > 999999) return res.status(400).json({ error: 'Valor inválido.' });
        changes.price = price;
      }
      if (req.body.size !== undefined) {
        const size = req.body.size.trim().toUpperCase();
        if (!SIZES.includes(size)) return res.status(400).json({ error: 'Selecione um tamanho válido (P, M, G ou GG).' });
        changes.size = size;
      }
      if (req.body.category !== undefined) {
        const category = req.body.category.trim();
        if (!category || category.length > 60) return res.status(400).json({ error: 'Informe uma categoria.' });
        changes.category = categoriesStore.ensure(category);
      }
      if (req.body.status !== undefined) {
        const status = req.body.status.trim();
        if (!itemsStore.STATUSES.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
        changes.status = status;
      }

      // "existingImages" é a lista (em ordem) das fotos já salvas que devem
      // continuar no item — é assim que o painel remove uma foto específica
      // e troca a capa (a primeira da lista). Só aceitamos nomes de arquivo
      // que já pertenciam ao item, pra ninguém conseguir "roubar" um arquivo
      // de outro item só citando o nome.
      if (req.body.existingImages !== undefined) {
        let keep;
        try {
          keep = JSON.parse(req.body.existingImages);
        } catch {
          return res.status(400).json({ error: 'Lista de fotos inválida.' });
        }
        const validFilenames = new Set(existing.images);
        if (!Array.isArray(keep) || !keep.every((f) => typeof f === 'string' && validFilenames.has(f))) {
          return res.status(400).json({ error: 'Lista de fotos inválida.' });
        }
        changes.images = keep;
      }

      if (req.files && req.files.length) {
        let newFilenames;
        try {
          newFilenames = await Promise.all(req.files.map(saveUploadedImage));
        } catch (imgErr) {
          console.error('Erro ao processar imagem:', imgErr.message);
          return res.status(400).json({ error: 'Não foi possível processar uma das imagens enviadas.' });
        }
        const base = changes.images || existing.images;
        changes.images = base.concat(newFilenames);
      }

      if (changes.images && changes.images.length > 6) {
        return res.status(400).json({ error: 'Máximo de 6 fotos por peça.' });
      }

      const updated = itemsStore.update(req.params.id, changes);

      if (changes.images) {
        const removedFiles = existing.images.filter((f) => !changes.images.includes(f));
        deleteImageFiles(removedFiles);
      }

      res.json(toPublicItem(updated));
    } catch (e) {
      console.error('Erro ao editar item:', e);
      res.status(500).json({ error: 'Não foi possível salvar as alterações. Tente novamente.' });
    }
  });
});

app.delete('/api/items/:id', requireAuth, (req, res) => {
  const removed = itemsStore.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Item não encontrado.' });
  deleteImageFiles(removed.images);
  res.json({ ok: true });
});

// ---------- Prévia de link de uma peça (WhatsApp/Instagram) ----------
// A página de produto normal vive em vitrine.html?item=ID, renderizada só
// no navegador via JS — mas crawlers de prévia de link (WhatsApp, Instagram,
// Facebook) não executam JS, então nunca veriam nome/foto/preço da peça.
// Esta rota serve um HTML mínimo, já com as meta tags certas daquele item,
// e manda navegadores de verdade direto para a vitrine (meta refresh + JS,
// nenhum dos dois é seguido por crawlers de prévia).
app.get('/item/:id', (req, res, next) => {
  const item = itemsStore.getById(req.params.id);
  if (!item) return next();

  const title = `${item.name} — Tô Na Arara`;
  const priceLabel = Number(item.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const description = `${priceLabel} · Tamanho ${item.size} · ${item.description}`.slice(0, 200);
  const imageUrl = item.images[0] ? `${BASE_URL}/uploads/${item.images[0]}` : `${BASE_URL}/assets/img/logo.png`;
  const pageUrl = `${BASE_URL}/item/${item.id}`;
  const redirectPath = `/vitrine.html?item=${encodeURIComponent(item.id)}`;

  res.send(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta http-equiv="refresh" content="0; url=${escapeHtml(redirectPath)}">
<link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Tô Na Arara">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
</head>
<body>
<p>Redirecionando para <a href="${escapeHtml(redirectPath)}">${escapeHtml(item.name)}</a> na vitrine...</p>
<script>location.replace(${JSON.stringify(redirectPath)});</script>
</body>
</html>`);
});

// ---------- Rastreamento de visitas e eventos ----------
// Endpoints públicos (sem login) usados pelo site pra registrar visitas
// anônimas e cliques. Nunca gravam nada enquanto o dono da loja está
// logado no painel, pra não inflar as próprias estatísticas testando o
// site. As telas do painel que vão mostrar esses números vêm numa fase
// seguinte — aqui só alimentamos os dados.

app.post('/api/track/pageview', trackRateLimiter, (req, res) => {
  if (req.session && req.session.loggedIn) return res.status(204).end();

  const visitorId = getOrCreateVisitorId(req, res);
  const path = req.body && req.body.path;
  const referrer = req.body && req.body.referrer;

  if (typeof path === 'string' && path.startsWith('/') && path.length <= 200) {
    visitsStore.record({
      id: crypto.randomUUID(),
      path,
      referrer: typeof referrer === 'string' && referrer.length <= 500 ? referrer : null,
      visitorId,
      device: detectDevice(req.headers['user-agent']),
      timestamp: Date.now(),
    });
  }

  res.status(204).end();
});

app.post('/api/track/event', trackRateLimiter, (req, res) => {
  if (req.session && req.session.loggedIn) return res.status(204).end();

  const visitorId = getOrCreateVisitorId(req, res);
  const { type, itemId, query } = req.body || {};

  if (!eventsStore.EVENT_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Tipo de evento inválido.' });
  }

  if (itemId !== undefined) {
    if (typeof itemId !== 'string' || !itemsStore.getById(itemId)) {
      return res.status(400).json({ error: 'Item não encontrado.' });
    }
  }

  let cleanQuery = null;
  if (query !== undefined) {
    if (typeof query !== 'string' || query.length > 200) {
      return res.status(400).json({ error: 'Busca inválida.' });
    }
    cleanQuery = query.trim();
  }

  eventsStore.record({
    id: crypto.randomUUID(),
    type,
    itemId: itemId || null,
    query: cleanQuery,
    visitorId,
    timestamp: Date.now(),
  });

  res.status(204).end();
});

// ---------- Painel: estatísticas e interessados ----------
// Protegidas por login — só a loja vê isso. Alimentam a aba "Visão geral"
// (números + gráfico) e a aba "Interessados" (quem clicou pra comprar).

app.get('/api/admin/stats/summary', requireAuth, (req, res) => {
  const dias = parseDias(req.query.dias, 7);
  const since = Date.now() - dias * 24 * 60 * 60 * 1000;

  const visits = visitsStore.getSummary({ since });
  const whatsappByItem = eventsStore.getWhatsappClicksByItem({ since });
  const whatsappClicks = whatsappByItem.reduce((sum, entry) => sum + entry.count, 0);
  const topSearches = eventsStore.getTopSearches({ since, limit: 10 });

  const topViewedItems = eventsStore.getTopViewedItems({ since, limit: 5 }).map(({ itemId, count }) => {
    const item = itemsStore.getById(itemId);
    return {
      itemId,
      count,
      name: item ? item.name : '(item removido)',
      price: item ? item.price : null,
      imageUrl: item && item.images[0] ? `/uploads/${item.images[0]}` : null,
    };
  });

  res.json({
    dias,
    totalVisits: visits.totalVisits,
    uniqueVisitors: visits.uniqueVisitors,
    whatsappClicks,
    conversionRate: visits.totalVisits > 0 ? whatsappClicks / visits.totalVisits : 0,
    topPages: visits.topPages,
    topSearches,
    topViewedItems,
  });
});

app.get('/api/admin/stats/timeseries', requireAuth, (req, res) => {
  const dias = parseDias(req.query.dias, 30);
  const since = Date.now() - dias * 24 * 60 * 60 * 1000;
  const { visitsByDay } = visitsStore.getSummary({ since });
  res.json({ dias, visitsByDay });
});

app.get('/api/admin/leads', requireAuth, (req, res) => {
  const LIMIT = 100;
  const allClicks = eventsStore.getWhatsappClickEvents();
  const hasMore = allClicks.length > LIMIT;
  const limited = allClicks.slice(0, LIMIT);

  const leads = limited.map((event) => {
    const item = event.itemId ? itemsStore.getById(event.itemId) : null;
    return {
      id: event.id,
      timestamp: event.timestamp,
      itemId: event.itemId,
      itemName: item ? item.name : '(item removido)',
      itemPrice: item ? item.price : null,
      itemImageUrl: item && item.images[0] ? `/uploads/${item.images[0]}` : null,
      itemStatus: item ? item.status : null,
    };
  });

  res.json({ leads, hasMore });
});

// ---------- Painel: financeiro ----------
// Protegido por login (requireAuth — qualquer colaborador pode ver e
// registrar vendas, é trabalho do dia a dia da loja, diferente da gestão de
// permissões). Junta duas origens: vendas do site (itens com status
// "vendido", datados pelo soldAt automático do itemsStore) e vendas
// cadastradas manualmente da loja física (salesStore, um registro à parte,
// sem ligação com o catálogo).

const PAYMENT_METHOD_MAX_LEN = 40;

app.get('/api/admin/sales', requireAuth, (req, res) => {
  const dias = parseDias(req.query.dias, 30);
  const since = Date.now() - dias * 24 * 60 * 60 * 1000;
  res.json(salesStore.getSince(since));
});

app.post('/api/admin/sales', requireAuth, (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  const price = Number(req.body && req.body.price);
  const category = String((req.body && req.body.category) || '').trim();
  const paymentMethod = String((req.body && req.body.paymentMethod) || '').trim();

  if (!name || name.length > 120) {
    return res.status(400).json({ error: 'Nome inválido.' });
  }
  if (!Number.isFinite(price) || price < 0.01 || price > 999999) {
    return res.status(400).json({ error: 'Valor inválido.' });
  }
  if (category.length > 60) {
    return res.status(400).json({ error: 'Categoria inválida.' });
  }
  if (paymentMethod.length > PAYMENT_METHOD_MAX_LEN) {
    return res.status(400).json({ error: 'Forma de pagamento inválida.' });
  }

  const soldAt = parseDataLocal(req.body && req.body.soldAt);
  if (!Number.isFinite(soldAt)) {
    return res.status(400).json({ error: 'Informe uma data de venda válida.' });
  }
  if (soldAt > Date.now() + 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: 'A data da venda não pode ser no futuro.' });
  }

  const sale = {
    id: crypto.randomUUID(),
    name,
    price,
    category: category || null,
    paymentMethod: paymentMethod || null,
    soldAt,
    createdAt: Date.now(),
  };
  salesStore.create(sale);
  res.status(201).json(sale);
});

app.delete('/api/admin/sales/:id', requireAuth, (req, res) => {
  const removed = salesStore.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Venda não encontrada.' });
  res.json({ ok: true });
});

app.get('/api/admin/financeiro/summary', requireAuth, (req, res) => {
  const dias = parseDias(req.query.dias, 30);
  const since = Date.now() - dias * 24 * 60 * 60 * 1000;

  const soldItems = itemsStore.getSoldSince(since);
  const totalSite = soldItems.reduce((sum, item) => sum + item.price, 0);

  const physicalSales = salesStore.getSince(since);
  const totalLoja = physicalSales.reduce((sum, sale) => sum + sale.price, 0);

  const transacoesSite = soldItems.map((item) => ({
    origem: 'Site',
    id: item.id,
    name: item.name,
    price: item.price,
    date: item.soldAt,
  }));
  const transacoesLoja = physicalSales.map((sale) => ({
    origem: 'Loja física',
    id: sale.id,
    name: sale.name,
    price: sale.price,
    date: sale.soldAt,
  }));

  const transacoes = transacoesSite.concat(transacoesLoja).sort((a, b) => b.date - a.date);

  res.json({
    dias,
    totalSite,
    totalLoja,
    totalGeral: totalSite + totalLoja,
    transacoes,
  });
});

// ---------- Painel: gestão de permissões ----------
// Só admin acessa (requireAdmin, mais estrito que requireAuth): é aqui que
// se promove um colaborador a admin sem precisar editar backend/data/users.json
// à mão nem rodar um script no terminal.

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = usersStore.getAll().map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: usersStore.isAdmin(u) ? 'admin' : 'colaborador',
    createdAt: u.createdAt,
  }));
  res.json(users);
});

app.put('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  const role = (req.body && req.body.role) || '';
  if (!usersStore.ROLES.includes(role)) {
    return res.status(400).json({ error: 'Permissão inválida.' });
  }

  const target = usersStore.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Conta não encontrada.' });

  // Nunca deixa a loja sem nenhum admin — senão ninguém mais consegue
  // promover ninguém de volta sem mexer direto no arquivo.
  if (usersStore.isAdmin(target) && role !== 'admin') {
    const totalAdmins = usersStore.getAll().filter(usersStore.isAdmin).length;
    if (totalAdmins <= 1) {
      return res.status(409).json({ error: 'Não é possível remover o último administrador. Torne outra conta admin antes de remover esta.' });
    }
  }

  const updated = usersStore.update(target.id, { role });
  res.json({
    id: updated.id,
    username: updated.username,
    email: updated.email,
    role: usersStore.isAdmin(updated) ? 'admin' : 'colaborador',
  });
});

// ---------- Resumo diário por e-mail ----------
// Opcional (DAILY_SUMMARY_EMAIL=true no .env): manda todo dia, uma vez, um
// e-mail com visitas + cliques em "Comprar no WhatsApp" do dia anterior
// para cada conta cadastrada no painel. Implementado com um setInterval que
// confere a hora a cada 5 minutos — não é um agendador de verdade, então só
// funciona enquanto o servidor está rodando no horário configurado; se o
// servidor estiver desligado às 08:00, o resumo daquele dia não é enviado.
const DAILY_SUMMARY_HOUR = 8;
let lastDailySummaryDay = null;

async function sendDailySummary() {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 24 * 60 * 60 * 1000;

  const totalVisits = visitsStore.countInRange(startYesterday, startToday);
  const whatsappClicks = eventsStore.countInRange('whatsapp_click', startYesterday, startToday);
  const recipients = usersStore.getAll().map((u) => u.email).filter(Boolean);

  for (const email of recipients) {
    try {
      await mailer.sendDailySummaryEmail(email, { totalVisits, whatsappClicks, date: startYesterday });
    } catch (err) {
      console.error('Erro ao enviar resumo diário:', err.message);
    }
  }
}

if (process.env.DAILY_SUMMARY_EMAIL === 'true') {
  setInterval(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    if (now.getHours() === DAILY_SUMMARY_HOUR && lastDailySummaryDay !== todayKey) {
      lastDailySummaryDay = todayKey;
      sendDailySummary().catch((err) => console.error('Erro ao enviar resumo diário:', err.message));
    }
  }, 5 * 60 * 1000).unref();
}

// ---------- Página não encontrada ----------
// Sempre por último: qualquer rota GET que não bateu em nada acima (link de
// peça vendida/removida, URL digitada errada) cai aqui. Rotas de API
// recebem JSON (pra não quebrar quem está chamando a API), o resto recebe a
// página 404 amigável do site.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota não encontrada.' });
  }
  res.status(404).sendFile(path.join(SITE_DIR, '404.html'));
});

// ---------- Erros não tratados ----------
// Handler de erro do Express (precisa dos 4 argumentos pra ser reconhecido
// como tal), sempre por último. Sem isto, o handler padrão do Express
// devolveria o stack trace completo (caminhos de arquivo do servidor
// incluídos) pra qualquer cliente sempre que algo desse erro sem ser
// tratado antes — aqui loga o erro de verdade só no console do servidor e
// devolve uma mensagem genérica pra fora.
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Ocorreu um erro inesperado. Tente novamente.' });
});

app.listen(PORT, () => {
  console.log(`Tô Na Arara rodando em ${BASE_URL}`);
  console.log(`Vitrine pública: ${BASE_URL}/vitrine.html`);
  console.log(`Painel admin:    ${BASE_URL}/admin/login.html`);
  if (!mailer.isConfigured()) {
    console.log('Aviso: SMTP não configurado no .env — links de recuperação de senha só aparecem aqui no console.');
  }
});
