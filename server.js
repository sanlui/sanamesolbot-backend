import express from 'express';
import cors from 'cors';
import {
  upsertUser,
  addWallet,
  removeWallet,
  listWallets,
  setUserFilter,
  getUserFilter,
  getAlertsForWallet,
  appendAlertForWallet,
  upsertDeviceRegistration,
  getDeviceRegistration,
  setDeviceFilter,
  getDeviceFilter,
} from './storage.js';
import { appendAlert, getAlerts } from './alerts.js';
import { startPoller } from './poller.js';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.options('*', cors());

const BOT_TOKEN = process.env.BOT_TOKEN;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = process.env.RPC_URL;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 30000);
const PORT = Number(process.env.PORT || 3000);

const TG_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

const serverState = {
  startedAt: Date.now(),
  pollerStarted: false,
  version: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || 'local',
};

const WALLET_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function normalizeChatId(obj) {
  const raw = obj?.chatId ?? obj?.chat_id ?? obj?.chatID ?? obj?.cid;
  const chatId = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!chatId || !/^[-]?\d+$/.test(chatId)) return null;
  return chatId;
}

function normalizeWallet(value) {
  const wallet = typeof value === 'string' ? value.trim() : '';
  if (!wallet || !WALLET_REGEX.test(wallet)) return null;
  return wallet;
}

function normalizeDeviceToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (!token || token.length < 8) return null;
  return token;
}

function ok(res, payload = {}) {
  return res.json({ ok: true, ...payload });
}

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function serverError(res, error = 'server error') {
  return res.status(500).json({ ok: false, error });
}

async function sendMessage(chatId, text) {
  if (!TG_API) return { ok: false, reason: 'missing BOT_TOKEN' };

  const resp = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: String(chatId),
      text: String(text),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const data = await resp.json().catch(() => null);
  return { ok: !!(resp.ok && data?.ok), status: resp.status, data };
}

async function storeMobileAlert(chatId, text) {
  // only used for mobile app alerts; Telegram can be disabled if not needed
  await appendAlert(String(chatId), String(text));
}

app.get('/', (_req, res) => res.send('OK'));

app.get('/health', (_req, res) => {
  return ok(res, {
    service: 'sanamesolbot-backend',
    uptimeSec: Math.floor((Date.now() - serverState.startedAt) / 1000),
    pollerStarted: serverState.pollerStarted,
    env: {
      bot: !!BOT_TOKEN,
      helius: !!HELIUS_API_KEY,
      rpc: !!RPC_URL,
    },
    version: serverState.version,
    pollIntervalMs: POLL_INTERVAL_MS,
  });
});

app.post('/api/register', async (req, res) => {
  try {
    const chatId = normalizeChatId(req.body);
    if (!chatId) return badRequest(res, 'invalid chatId');

    await upsertUser(chatId);
    return ok(res, { chatId });
  } catch (err) {
    console.error('register error:', err);
    return serverError(res);
  }
});

app.post('/api/activate', async (req, res) => {
  try {
    const chatId = normalizeChatId(req.body);
    if (!chatId) return badRequest(res, 'invalid chatId');

    await upsertUser(chatId);
    const tg = await sendMessage(chatId, '✅ Activation completed. You will receive alerts here.');

    return ok(res, { chatId, telegramOk: tg.ok });
  } catch (err) {
    console.error('activate error:', err);
    return serverError(res);
  }
});

app.post('/api/add-wallet', async (req, res) => {
  try {
    const chatId = normalizeChatId(req.body);
    const wallet = normalizeWallet(req.body?.wallet);
    if (!chatId) return badRequest(res, 'invalid chatId');
    if (!wallet) return badRequest(res, 'invalid wallet');

    const user = await addWallet(chatId, wallet);
    return ok(res, { wallets: user.wallets || [] });
  } catch (err) {
    console.error('add-wallet error:', err);
    return serverError(res);
  }
});

app.post('/api/remove-wallet', async (req, res) => {
  try {
    const chatId = normalizeChatId(req.body);
    const wallet = normalizeWallet(req.body?.wallet);
    if (!chatId) return badRequest(res, 'invalid chatId');
    if (!wallet) return badRequest(res, 'invalid wallet');

    const user = await removeWallet(chatId, wallet);
    return ok(res, { wallets: user?.wallets || [] });
  } catch (err) {
    console.error('remove-wallet error:', err);
    return serverError(res);
  }
});

app.get('/api/list-wallets', async (req, res) => {
  try {
    const chatId = normalizeChatId(req.query);
    if (!chatId) return badRequest(res, 'invalid chatId');

    const wallets = await listWallets(chatId);
    return ok(res, { wallets });
  } catch (err) {
    console.error('list-wallets error:', err);
    return serverError(res);
  }
});

app.post('/api/set-filter', async (req, res) => {
  try {
    const chatId = normalizeChatId(req.body);
    if (!chatId) return badRequest(res, 'invalid chatId');

    const filter = await setUserFilter(chatId, req.body?.filter || {});
    return ok(res, { chatId, filter });
  } catch (err) {
    console.error('set-filter error:', err);
    return serverError(res);
  }
});

app.get('/api/get-filter', async (req, res) => {
  try {
    const chatId = normalizeChatId(req.query);
    if (!chatId) return badRequest(res, 'invalid chatId');

    const filter = await getUserFilter(chatId);
    return ok(res, { chatId, filter });
  } catch (err) {
    console.error('get-filter error:', err);
    return serverError(res);
  }
});

app.post('/notify', async (req, res) => {
  try {
    const chatId = normalizeChatId(req.body);
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!chatId) return badRequest(res, 'invalid chatId');
    if (!text) return badRequest(res, 'text missing');

    // Store alert for mobile app consumption
    await storeMobileAlert(chatId, text);

    // If you still want Telegram alerts, uncomment this:
    // const tg = await sendMessage(chatId, text);
    // return ok(res, { telegramOk: tg.ok });

    return ok(res, { stored: true });
  } catch (err) {
    console.error('notify error:', err);
    return serverError(res);
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    const chatId = normalizeChatId(req.query);
    if (!chatId) return badRequest(res, 'invalid chatId');

    const alerts = await getAlerts(chatId);
    return ok(res, { chatId, alerts });
  } catch (err) {
    console.error('get-alerts error:', err);
    return serverError(res);
  }
});

app.get('/api/alerts-by-wallet', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.query?.wallet);
    if (!wallet) return badRequest(res, 'invalid wallet');

    const alerts = await getAlertsForWallet(wallet);
    return ok(res, { wallet, alerts });
  } catch (err) {
    console.error('get-alerts-by-wallet error:', err);
    return serverError(res);
  }
});

// Alias for mobile app compatibility
app.get('/api/alerts/by-wallet', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.query?.wallet);
    if (!wallet) return badRequest(res, 'invalid wallet');

    const alerts = await getAlertsForWallet(wallet);
    return ok(res, { wallet, alerts });
  } catch (err) {
    console.error('get-alerts-by-wallet(alias) error:', err);
    return serverError(res);
  }
});

app.post('/api/device/register', async (req, res) => {
  try {
    const deviceToken = normalizeDeviceToken(req.body?.deviceToken);
    const walletAddress = normalizeWallet(req.body?.walletAddress);
    const platform = typeof req.body?.platform === 'string' ? req.body.platform : 'unknown';

    if (!deviceToken) return badRequest(res, 'invalid deviceToken');
    if (!walletAddress) return badRequest(res, 'invalid walletAddress');

    const device = await upsertDeviceRegistration(deviceToken, walletAddress, platform);
    return ok(res, { device });
  } catch (err) {
    console.error('device-register error:', err);
    return serverError(res);
  }
});

app.get('/api/device/alerts', async (req, res) => {
  try {
    const deviceToken = normalizeDeviceToken(req.query?.deviceToken);
    if (!deviceToken) return badRequest(res, 'invalid deviceToken');

    const reg = await getDeviceRegistration(deviceToken);
    if (!reg?.walletAddress) return ok(res, { deviceToken, alerts: [] });

    const alerts = await getAlertsForWallet(reg.walletAddress);
    return ok(res, { deviceToken, wallet: reg.walletAddress, alerts });
  } catch (err) {
    console.error('device-alerts error:', err);
    return serverError(res);
  }
});

app.get('/api/device/filter', async (req, res) => {
  try {
    const deviceToken = normalizeDeviceToken(req.query?.deviceToken);
    if (!deviceToken) return badRequest(res, 'invalid deviceToken');

    const filter = await getDeviceFilter(deviceToken);
    return ok(res, { deviceToken, filter });
  } catch (err) {
    console.error('device-filter get error:', err);
    return serverError(res);
  }
});

app.post('/api/device/filter', async (req, res) => {
  try {
    const deviceToken = normalizeDeviceToken(req.body?.deviceToken);
    if (!deviceToken) return badRequest(res, 'invalid deviceToken');

    const filter = await setDeviceFilter(deviceToken, req.body?.filter || {});
    return ok(res, { deviceToken, filter });
  } catch (err) {
    console.error('device-filter set error:', err);
    return serverError(res);
  }
});

app.post('/telegram', async (req, res) => {
  try {
    const msg = req.body?.message?.text;
    const chatId = req.body?.message?.chat?.id;
    if (!chatId) return res.sendStatus(200);

    const cid = String(chatId);
    await upsertUser(cid);

    if (typeof msg !== 'string') return res.sendStatus(200);

    if (msg.startsWith('/start')) {
      await sendMessage(cid, `✅ Bot connected.\n\nYour <b>chat_id</b> is:\n<b>${cid}</b>\n\nCommands:\n/add WALLET\n/remove WALLET\n/list\n/test`);
      return res.sendStatus(200);
    }

    if (msg.startsWith('/add ')) {
      const wallet = normalizeWallet(msg.replace('/add', '').trim());
      if (!wallet) await sendMessage(cid, '❌ Usage: /add WALLET');
      else {
        const u = await addWallet(cid, wallet);
        await sendMessage(cid, `✅ Added.\nNow tracking:\n${u.wallets.map((w) => `• <code>${w}</code>`).join('\n')}`);
      }
      return res.sendStatus(200);
    }

    if (msg.startsWith('/remove ')) {
      const wallet = normalizeWallet(msg.replace('/remove', '').trim());
      if (!wallet) await sendMessage(cid, '❌ Usage: /remove WALLET');
      else {
        const u = await removeWallet(cid, wallet);
        await sendMessage(cid, `✅ Removed.\nNow tracking:\n${(u?.wallets || []).map((w) => `• <code>${w}</code>`).join('\n') || '(none)'}`);
      }
      return res.sendStatus(200);
    }

    if (msg === '/list') {
      const wallets = await listWallets(cid);
      await sendMessage(cid, wallets.length ? `📌 Tracked wallets:\n${wallets.map((w) => `• <code>${w}</code>`).join('\n')}` : '📭 No wallets tracked. Use /add WALLET');
      return res.sendStatus(200);
    }

    if (msg === '/test') {
      await sendMessage(cid, '✅ TEST OK — bot is working.');
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('telegram webhook error:', err);
    return res.sendStatus(200);
  }
});

const server = app.listen(PORT, () => {
  console.log('Server listening on port', PORT);

  if (BOT_TOKEN && HELIUS_API_KEY && RPC_URL) {
    startPoller({
      pollIntervalMs: POLL_INTERVAL_MS,
      rpcUrl: RPC_URL,
      heliusApiKey: HELIUS_API_KEY,
      onAlert: async (chatId, msg, wallet) => {
        // Salva gli alert indicizzati per wallet per la mobile app
        if (!wallet) {
          console.warn('onAlert: missing wallet, skipping appendAlertForWallet');
          return;
        }
        await appendAlertForWallet(wallet, msg, chatId);
      },
    });
    serverState.pollerStarted = true;
    console.log('Poller started:', POLL_INTERVAL_MS, 'ms');
  } else {
    console.log('Poller not started: missing env vars');
  }
});

server.on('error', (err) => {
  console.error('Server listen error:', err);
  process.exit(1);
});
