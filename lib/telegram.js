/**
 * Telegram Bot API istemcisi. Harici bagimlilik yok, sadece fetch.
 */

import { config } from './config.js';

const API_BASE = 'https://api.telegram.org';

/** Telegram tek mesajda en fazla 4096 karakter kabul eder. */
const MAX_MESSAGE_LENGTH = 4096;

async function callApi(method, payload) {
  const response = await fetch(`${API_BASE}/bot${config.telegramToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(
      `Telegram ${method} basarisiz (${response.status}): ${data.description ?? 'bilinmeyen hata'}`,
    );
  }
  return data.result;
}

/**
 * Uzun metni Telegram'in kabul ettigi boyuta boler.
 * Once paragraf, sonra satir sonu, en kotu ihtimalle karakter bazinda keser.
 */
export function splitMessage(text, limit = MAX_MESSAGE_LENGTH) {
  if (text.length <= limit) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    // En sondaki dogal kesme noktasini bul.
    let cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'));
    if (cut < limit * 0.5) cut = window.lastIndexOf(' ');
    if (cut < limit * 0.5) cut = limit;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function sendMessage(chatId, text, options = {}) {
  const parts = splitMessage(text);
  let last;
  for (const part of parts) {
    last = await callApi('sendMessage', {
      chat_id: chatId,
      text: part,
      link_preview_options: { is_disabled: true },
      ...options,
    });
  }
  return last;
}

/**
 * "yaziyor..." / "fotograf gonderiyor..." gostergesi.
 * Yaklasik 5 saniye gorunur, uzun islemlerde tekrar cagirmak gerekir.
 */
export async function sendChatAction(chatId, action = 'typing') {
  try {
    await callApi('sendChatAction', { chat_id: chatId, action });
  } catch {
    // Gosterge kozmetik; basarisiz olmasi isi durdurmamali.
  }
}

/**
 * Uzun islemler boyunca "yaziyor..." gostergesini canli tutar.
 * Donen fonksiyon cagrilinca durur.
 */
export function keepChatActionAlive(chatId, action = 'typing') {
  sendChatAction(chatId, action);
  const timer = setInterval(() => sendChatAction(chatId, action), 4000);
  return () => clearInterval(timer);
}

/** Telegram'daki bir dosyayi indirir; { bytes, filePath } dondurur. */
export async function downloadFile(fileId) {
  const file = await callApi('getFile', { file_id: fileId });
  const response = await fetch(
    `${API_BASE}/file/bot${config.telegramToken}/${file.file_path}`,
  );
  if (!response.ok) {
    throw new Error(`Telegram dosyasi indirilemedi (${response.status})`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    filePath: file.file_path,
  };
}

/** Uretilen gorseli fotograf olarak gonderir. */
export async function sendPhotoBytes(chatId, bytes, { caption, filename = 'image.png' } = {}) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption.slice(0, 1024));
  form.append('photo', new Blob([bytes], { type: 'image/png' }), filename);

  const response = await fetch(
    `${API_BASE}/bot${config.telegramToken}/sendPhoto`,
    { method: 'POST', body: form },
  );
  const data = await response.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(
      `Telegram sendPhoto basarisiz (${response.status}): ${data.description ?? 'bilinmeyen hata'}`,
    );
  }
  return data.result;
}

/** Telegram menusunde gorunen komut listesi. */
export async function setMyCommands(commands) {
  return callApi('setMyCommands', { commands });
}
