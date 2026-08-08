#!/usr/bin/env node
/**
 * Telegram webhook'unu ayarlar / gosterir / siler.
 *
 * Kullanim:
 *   node scripts/setup-webhook.mjs set https://projen.vercel.app
 *   node scripts/setup-webhook.mjs info
 *   node scripts/setup-webhook.mjs delete
 *
 * Token ve gizli anahtari ayni klasordeki .env dosyasindan okur.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** .env dosyasini okur; yoksa sessizce gecer (degerler ortamdan gelebilir). */
function loadEnvFile() {
  let raw;
  try {
    raw = readFileSync(resolve(projectRoot, '.env'), 'utf8');
  } catch {
    return;
  }

  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

loadEnvFile();

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error('HATA: TELEGRAM_BOT_TOKEN tanimli degil (.env dosyasina ekle).');
  process.exit(1);
}

async function callApi(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await response.json();
  if (!data.ok) {
    console.error(`HATA (${method}): ${data.description}`);
    process.exit(1);
  }
  return data.result;
}

const [, , command = 'info', urlArg] = process.argv;

switch (command) {
  case 'set': {
    const baseUrl = (urlArg ?? process.env.WEBHOOK_URL ?? '').replace(/\/+$/, '');
    if (!baseUrl) {
      console.error(
        'HATA: Deployment adresini ver.\n' +
          'Ornek: node scripts/setup-webhook.mjs set https://projen.vercel.app',
      );
      process.exit(1);
    }
    if (!secret) {
      console.error('HATA: TELEGRAM_WEBHOOK_SECRET tanimli degil (.env dosyasina ekle).');
      process.exit(1);
    }

    const webhookUrl = `${baseUrl}/api/telegram`;
    await callApi('setWebhook', {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'edited_message'],
      drop_pending_updates: true,
    });
    console.log(`Webhook ayarlandi: ${webhookUrl}`);

    const { BOT_COMMANDS } = await import('../lib/handlers.js');
    await callApi('setMyCommands', { commands: BOT_COMMANDS });
    console.log('Komut menusu guncellendi.');

    const me = await callApi('getMe');
    console.log(`\nHazir! Telegram'da @${me.username} adresine yaz.`);
    break;
  }

  case 'info': {
    const info = await callApi('getWebhookInfo');
    console.log(JSON.stringify(info, null, 2));
    if (info.last_error_message) {
      console.log(`\nSon hata: ${info.last_error_message}`);
    }
    break;
  }

  case 'delete': {
    await callApi('deleteWebhook', { drop_pending_updates: true });
    console.log('Webhook silindi.');
    break;
  }

  default:
    console.error(`Bilinmeyen komut: ${command}. Kullan: set | info | delete`);
    process.exit(1);
}
