/**
 * OpenAI API istemcisi: sohbet, gorsel anlama, ses cozumleme, gorsel uretme.
 * Harici bagimlilik yok, sadece fetch.
 */

import { config } from './config.js';

const API_BASE = 'https://api.openai.com/v1';

async function readError(response) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? `HTTP ${response.status}`;
}

/**
 * Sohbet cevabi uretir.
 * messages: [{ role, content }] - content metin veya cok parcali dizi olabilir.
 */
export async function chat(messages, { model = config.chatModel } = {}) {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openaiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI sohbet hatasi: ${await readError(response)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('OpenAI bos cevap dondu.');
  }
  return text;
}

/** Ses baytlarini yaziya cevirir. */
export async function transcribe(bytes, { filename = 'audio.ogg', mimeType = 'audio/ogg' } = {}) {
  const form = new FormData();
  form.append('model', config.transcribeModel);
  form.append('file', new Blob([bytes], { type: mimeType }), filename);

  const response = await fetch(`${API_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`OpenAI ses cozumleme hatasi: ${await readError(response)}`);
  }

  const data = await response.json();
  return (data.text ?? '').trim();
}

/** Metinden gorsel uretir; PNG baytlari dondurur. */
export async function generateImage(prompt, { size = '1024x1024' } = {}) {
  const response = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openaiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: config.imageModel, prompt, size, n: 1 }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI gorsel uretme hatasi: ${await readError(response)}`);
  }

  const item = (await response.json()).data?.[0];
  if (item?.b64_json) {
    return Uint8Array.from(Buffer.from(item.b64_json, 'base64'));
  }
  // Bazi modeller baytlar yerine gecici bir baglanti donduruyor.
  if (item?.url) {
    const image = await fetch(item.url);
    if (!image.ok) throw new Error('Uretilen gorsel indirilemedi.');
    return new Uint8Array(await image.arrayBuffer());
  }
  throw new Error('OpenAI gorsel dondurmedi.');
}

/** Gorsel baytlarini modele verilebilecek data URL'ine cevirir. */
export function toDataUrl(bytes, mimeType = 'image/jpeg') {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}
