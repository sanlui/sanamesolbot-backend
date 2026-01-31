import { promises as fs } from "fs";
import path from "path";

const FILE = path.resolve(process.cwd(), "data.json");

const DEFAULT_DATA = {
  users: {
    // "123456789": { chatId: "123456789", wallets: ["..."], createdAt: 123 }
  }
};

async function readFileSafe() {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data.users) return DEFAULT_DATA;
    return data;
  } catch {
    return DEFAULT_DATA;
  }
}

async function writeFileSafe(data) {
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getData() {
  return await readFileSafe();
}

export async function upsertUser(chatId) {
  const data = await readFileSafe();
  if (!data.users[chatId]) {
    data.users[chatId] = { chatId, wallets: [], createdAt: Date.now() };
    await writeFileSafe(data);
  }
  return data.users[chatId];
}

export async function addWallet(chatId, wallet) {
  const data = await readFileSafe();
  if (!data.users[chatId]) data.users[chatId] = { chatId, wallets: [], createdAt: Date.now() };

  const w = wallet.trim();
  if (!data.users[chatId].wallets.includes(w)) {
    data.users[chatId].wallets.push(w);
    await writeFileSafe(data);
  }
  return data.users[chatId];
}

export async function removeWallet(chatId, wallet) {
  const data = await readFileSafe();
  if (!data.users[chatId]) return null;

  const w = wallet.trim();
  data.users[chatId].wallets = data.users[chatId].wallets.filter(x => x !== w);
  await writeFileSafe(data);
  return data.users[chatId];
}

export async function setWallets(chatId, wallets) {
  const data = await readFileSafe();
  if (!data.users[chatId]) data.users[chatId] = { chatId, wallets: [], createdAt: Date.now() };

  data.users[chatId].wallets = Array.from(new Set(wallets.map(w => w.trim()).filter(Boolean)));
  await writeFileSafe(data);
  return data.users[chatId];
}

export async function listWallets(chatId) {
  const data = await readFileSafe();
  return data.users[chatId]?.wallets || [];
}
