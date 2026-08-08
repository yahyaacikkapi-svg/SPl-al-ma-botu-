/**
 * Sohbet gecmisi ve tekrar eden Telegram guncellemelerinin takibi.
 *
 * Iki calisma modu var:
 *   - Supabase: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY tanimliysa kalici.
 *   - Bellek:   tanimli degilse. Sunucu uykuya gecince gecmis kaybolur.
 */

import { config } from './config.js';

export const usingSupabase = Boolean(config.supabaseUrl && config.supabaseKey);

// --- Bellek modu icin yedek depolar --------------------------------

const memoryHistory = new Map(); // chatId -> [{ role, content }]
const memoryUpdates = new Map(); // updateId -> zaman damgasi

// --- Supabase (PostgREST) yardimcilari -----------------------------

async function supabase(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: config.supabaseKey,
    authorization: `Bearer ${config.supabaseKey}`,
    'content-type': 'application/json',
  };
  if (prefer) headers.prefer = prefer;

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase ${method} ${path} basarisiz (${response.status}): ${detail}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// --- Sohbet gecmisi -------------------------------------------------

/** Bir sohbetin son mesajlarini eskiden yeniye siralanmis olarak dondurur. */
export async function loadHistory(chatId) {
  const limit = config.maxHistoryMessages;

  if (!usingSupabase) {
    return (memoryHistory.get(String(chatId)) ?? []).slice(-limit);
  }

  const rows = await supabase(
    `chat_messages?chat_id=eq.${encodeURIComponent(chatId)}` +
      `&select=role,content&order=id.desc&limit=${limit}`,
  );
  return (rows ?? []).reverse().map((row) => ({ role: row.role, content: row.content }));
}

/** Yeni mesajlari gecmise ekler. */
export async function appendHistory(chatId, messages) {
  if (messages.length === 0) return;

  if (!usingSupabase) {
    const key = String(chatId);
    const existing = memoryHistory.get(key) ?? [];
    // Bellek modunda sinirsiz buyumeyi engelle.
    const merged = [...existing, ...messages].slice(-config.maxHistoryMessages * 2);
    memoryHistory.set(key, merged);
    return;
  }

  await supabase('chat_messages', {
    method: 'POST',
    prefer: 'return=minimal',
    body: messages.map((message) => ({
      chat_id: String(chatId),
      role: message.role,
      content: message.content,
    })),
  });
}

/** Bir sohbetin gecmisini tamamen siler (/sifirla komutu). */
export async function clearHistory(chatId) {
  if (!usingSupabase) {
    memoryHistory.delete(String(chatId));
    return;
  }
  await supabase(`chat_messages?chat_id=eq.${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
}

// --- Tekrar eden guncellemeler --------------------------------------

/**
 * Telegram cevap alamadigi guncellemeleri tekrar gonderir. Ayni mesaji iki
 * kez cevaplamamak icin update_id'yi bir kez isaretliyoruz.
 *
 * true  -> bu guncelleme ilk defa goruldu, islenebilir
 * false -> daha once islendi, atlanmali
 */
export async function markUpdateSeen(updateId) {
  if (!usingSupabase) {
    const key = String(updateId);
    if (memoryUpdates.has(key)) return false;

    memoryUpdates.set(key, Date.now());
    // Bellegi sinirla: 10 dakikadan eski kayitlari at.
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, seenAt] of memoryUpdates) {
      if (seenAt < cutoff) memoryUpdates.delete(id);
    }
    return true;
  }

  // ignore-duplicates: kayit zaten varsa hata vermez, bos dizi doner.
  const inserted = await supabase('processed_updates', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=representation',
    body: [{ update_id: updateId }],
  });
  return Array.isArray(inserted) && inserted.length > 0;
}
