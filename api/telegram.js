/**
 * Telegram webhook giris noktasi.
 *
 * Telegram her yeni mesaj icin bu adrese POST atar. Cevap olarak her zaman
 * 200 donuyoruz: hata durumunda 200 disinda bir kod donersek Telegram ayni
 * guncellemeyi saatlerce tekrar gondermeye calisir.
 */

import { config, missingRequiredEnv } from '../lib/config.js';
import { handleUpdate, warnAboutConfig } from '../lib/handlers.js';
import { markUpdateSeen } from '../lib/store.js';

let warned = false;

export default async function handler(req, res) {
  // Tarayicidan acilinca kurulumun dogru olup olmadigini gosteren basit sayfa.
  if (req.method === 'GET') {
    const missing = missingRequiredEnv();
    return res.status(missing.length ? 500 : 200).json({
      status: missing.length ? 'eksik-ayar' : 'hazir',
      missingEnv: missing,
      hint: 'Telegram bu adrese POST atar. Bu sayfayi sadece kontrol icin gorursun.',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST' });
  }

  const missing = missingRequiredEnv();
  if (missing.length) {
    console.error(`Eksik ortam degiskenleri: ${missing.join(', ')}`);
    return res.status(500).json({ error: 'Sunucu ayarlari eksik', missing });
  }

  // Telegram setWebhook sirasinda verdigimiz gizli anahtari her istekte
  // bu baslikta geri gonderir. Eslesmiyorsa istek Telegram'dan gelmiyordur.
  if (req.headers['x-telegram-bot-api-secret-token'] !== config.webhookSecret) {
    console.warn('Gecersiz webhook anahtari ile istek geldi.');
    return res.status(401).json({ error: 'Yetkisiz' });
  }

  if (!warned) {
    warnAboutConfig();
    warned = true;
  }

  const update = req.body;
  if (!update || typeof update !== 'object') {
    return res.status(200).json({ ok: true });
  }

  try {
    // Cevabimiz gecikirse Telegram ayni guncellemeyi tekrar gonderir;
    // ayni mesaji iki kez cevaplamamak icin bir kez isaretliyoruz.
    if (update.update_id !== undefined && !(await markUpdateSeen(update.update_id))) {
      console.log(`Tekrar eden guncelleme atlandi: ${update.update_id}`);
      return res.status(200).json({ ok: true });
    }

    await handleUpdate(update);
  } catch (error) {
    // Buraya dusen hatalar kullaniciya zaten bildirilemeyen turden.
    console.error('Webhook hatasi:', error);
  }

  return res.status(200).json({ ok: true });
}
