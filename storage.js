import { promises as fs } from "fs";
import path from "path";

const FILE = path.resolve(process.cwd(), "data.json");

const DEFAULT_DATA = {
  users: {
    // "123456789": { chatId: "123456789", wallets: ["..."], createdAt: 123, filter: {...} }
  },
  alertsByWallet: {
    // "WalletPubKey": [ { time: 123, message: "...", chatId: "123456789" }, ... ]
  },
  devices: {
    // "ws_xxx": { deviceToken: "ws_xxx", walletAddress: "...", platform: "android", updatedAt: 123, filter: {...} }
  },
};

const DEFAULT_FILTER = {
  mode: "all",          // all | sol | spl | swap | types
  minSol: 0,            // soglia SOL (0 = qualsiasi)
  minToken: 0,          // soglia tokenAmount (0 = qualsiasi)
  types: [],            // usato se mode="types"
};

async function readFileSafe() {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const data = JSON.parse(raw);

    if (!data || typeof data !== "object") return structuredClone(DEFAULT_DATA);
    if (!data.users || typeof data.users !== "object") data.users = {};
    if (!data.alertsByWallet || typeof data.alertsByWallet !== "object") data.alertsByWallet = {};
    if (!data.devices || typeof data.devices !== "object") data.devices = {};

    // Normalizza filtri per tutti (evita crash)
    for (const k of Object.keys(data.users)) {
      const u = data.users[k];
      if (!u || typeof u !== "object") continue;
      if (!u.chatId) u.chatId = String(k);
      if (!Array.isArray(u.wallets)) u.wallets = [];
      if (!u.filter) u.filter = structuredClone(DEFAULT_FILTER);
      else {
        u.filter = {
          ...structuredClone(DEFAULT_FILTER),
          ...u.filter,
          minSol: Number(u.filter?.minSol ?? 0),
          minToken: Number(u.filter?.minToken ?? 0),
          types: Array.isArray(u.filter?.types) ? u.filter.types : [],
        };
      }
    }

    return data;
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

async function writeFileSafe(data) {
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getData() {
  return await readFileSafe();
}

export async function appendAlertForWallet(wallet, message, chatId) {
  const data = await readFileSafe();
  if (!data.alertsByWallet) data.alertsByWallet = {};

  const w = String(wallet || '').trim();
  if (!w) return;

  if (!Array.isArray(data.alertsByWallet[w])) {
    data.alertsByWallet[w] = [];
  }

  data.alertsByWallet[w].push({
    time: Date.now(),
    message: String(message),
    chatId: chatId ? String(chatId) : undefined,
  });

  if (data.alertsByWallet[w].length > 50) {
    data.alertsByWallet[w] = data.alertsByWallet[w].slice(-50);
  }

  await writeFileSafe(data);
}

export async function getAlertsForWallet(wallet) {
  const data = await readFileSafe();
  const w = String(wallet || '').trim();
  if (!w) return [];

  const list = Array.isArray(data.alertsByWallet?.[w]) ? data.alertsByWallet[w] : [];
  return list.sort((a, b) => (a.time || 0) - (b.time || 0));
}

export async function upsertDeviceRegistration(deviceToken, walletAddress, platform = 'unknown') {
  const data = await readFileSafe();
  if (!data.devices || typeof data.devices !== 'object') data.devices = {};

  const token = String(deviceToken || '').trim();
  const wallet = String(walletAddress || '').trim();
  if (!token || !wallet) return null;

  const record = {
    deviceToken: token,
    walletAddress: wallet,
    platform: String(platform || 'unknown'),
    updatedAt: Date.now(),
  };

  data.devices[token] = record;
  await writeFileSafe(data);
  return record;
}

export async function getDeviceRegistration(deviceToken) {
  const data = await readFileSafe();
  const token = String(deviceToken || '').trim();
  if (!token) return null;
  return data.devices?.[token] || null;
}

const DEFAULT_DEVICE_FILTER = {
  mode: 'all',
  minSol: 0,
  minToken: 0,
  types: [],
};

export async function setDeviceFilter(deviceToken, filter) {
  const data = await readFileSafe();
  const token = String(deviceToken || '').trim();
  if (!token) return null;

  if (!data.devices[token]) {
    data.devices[token] = {
      deviceToken: token,
      walletAddress: '',
      platform: 'unknown',
      updatedAt: Date.now(),
    };
  }

  const incoming = filter || {};
  data.devices[token].filter = {
    ...DEFAULT_DEVICE_FILTER,
    ...incoming,
    mode: incoming?.mode === 'types' ? 'types' : 'all',
    minSol: Number(incoming?.minSol ?? 0),
    minToken: Number(incoming?.minToken ?? 0),
    types: Array.isArray(incoming?.types) ? incoming.types : [],
  };
  data.devices[token].updatedAt = Date.now();
  await writeFileSafe(data);
  return data.devices[token].filter;
}

export async function getDeviceFilter(deviceToken) {
  const data = await readFileSafe();
  const token = String(deviceToken || '').trim();
  if (!token) return { ...DEFAULT_DEVICE_FILTER };

  const current = data.devices?.[token]?.filter;
  if (!current) return { ...DEFAULT_DEVICE_FILTER };

  return {
    ...DEFAULT_DEVICE_FILTER,
    ...current,
    mode: current?.mode === 'types' ? 'types' : 'all',
    minSol: Number(current?.minSol ?? 0),
    minToken: Number(current?.minToken ?? 0),
    types: Array.isArray(current?.types) ? current.types : [],
  };
}

export async function getUsersData() {
  const data = await readFileSafe();
  return data.users || {};
}

export async function upsertUser(chatId) {
  const data = await readFileSafe();

  if (!data.users[chatId]) {
    data.users[chatId] = {
      chatId,
      wallets: [],
      createdAt: Date.now(),
      filter: structuredClone(DEFAULT_FILTER),
    };
    await writeFileSafe(data);
  } else {
    // ensure fields exist
    if (!Array.isArray(data.users[chatId].wallets)) data.users[chatId].wallets = [];
    if (!data.users[chatId].filter) data.users[chatId].filter = structuredClone(DEFAULT_FILTER);
  }

  return data.users[chatId];
}

export async function addWallet(chatId, wallet) {
  const data = await readFileSafe();
  if (!data.users[chatId]) {
    data.users[chatId] = {
      chatId,
      wallets: [],
      createdAt: Date.now(),
      filter: structuredClone(DEFAULT_FILTER),
    };
  }

  const w = String(wallet || "").trim();
  if (!w) return data.users[chatId];

  if (!data.users[chatId].wallets.includes(w)) {
    data.users[chatId].wallets.push(w);
    await writeFileSafe(data);
  }
  return data.users[chatId];
}

export async function removeWallet(chatId, wallet) {
  const data = await readFileSafe();
  if (!data.users[chatId]) return null;

  const w = String(wallet || "").trim();
  data.users[chatId].wallets = (data.users[chatId].wallets || []).filter((x) => x !== w);
  await writeFileSafe(data);
  return data.users[chatId];
}

export async function setWallets(chatId, wallets) {
  const data = await readFileSafe();
  if (!data.users[chatId]) {
    data.users[chatId] = {
      chatId,
      wallets: [],
      createdAt: Date.now(),
      filter: structuredClone(DEFAULT_FILTER),
    };
  }

  const cleaned = Array.from(
    new Set((wallets || []).map((w) => String(w).trim()).filter(Boolean))
  );

  data.users[chatId].wallets = cleaned;
  await writeFileSafe(data);
  return data.users[chatId];
}

export async function listWallets(chatId) {
  const data = await readFileSafe();
  return data.users[chatId]?.wallets || [];
}

// ✅ Salva filtro per utente
export async function setUserFilter(chatId, filter) {
  const data = await readFileSafe();
  if (!data.users[chatId]) {
    data.users[chatId] = {
      chatId,
      wallets: [],
      createdAt: Date.now(),
      filter: structuredClone(DEFAULT_FILTER),
    };
  }

  const incoming = filter || {};
  const merged = {
    ...structuredClone(DEFAULT_FILTER),
    ...incoming,
    minSol: Number(incoming?.minSol ?? data.users[chatId]?.filter?.minSol ?? 0),
    minToken: Number(incoming?.minToken ?? data.users[chatId]?.filter?.minToken ?? 0),
    types: Array.isArray(incoming?.types) ? incoming.types : (data.users[chatId]?.filter?.types || []),
  };

  data.users[chatId].filter = merged;
  await writeFileSafe(data);
  return merged;
}

export async function getUserFilter(chatId) {
  const data = await readFileSafe();
  return data.users[chatId]?.filter || structuredClone(DEFAULT_FILTER);
}
