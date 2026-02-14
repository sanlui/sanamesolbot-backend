import { getData } from './storage.js';
import { promises as fs } from 'fs';
import path from 'path';

const FILE = path.resolve(process.cwd(), 'data.json');

async function writeFileSafe(data) {
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function appendAlert(chatId, message) {
  const data = await getData();
  if (!data.alerts) data.alerts = {};
  if (!Array.isArray(data.alerts[chatId])) data.alerts[chatId] = [];

  data.alerts[chatId].push({ time: Date.now(), message: String(message) });

  // keep only latest 50 alerts per chat
  if (data.alerts[chatId].length > 50) {
    data.alerts[chatId] = data.alerts[chatId].slice(-50);
  }

  await writeFileSafe(data);
}

export async function getAlerts(chatId) {
  const data = await getData();
  const list = Array.isArray(data.alerts?.[chatId]) ? data.alerts[chatId] : [];
  return list.sort((a, b) => (a.time || 0) - (b.time || 0));
}
