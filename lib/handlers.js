/**
 * Gelen Telegram mesajlarini ilgili islemlere yonlendirir.
 */

import { config, isUserAllowed } from './config.js';
import * as tg from './telegram.js';
import * as ai from './openai.js';
import { loadHistory, appendHistory, clearHistory, usingSupabase } from './store.js';

const WELCOME =
  'Merhaba! Ben ChatGPT destekli asistaninim.\n\n' +
  'Yapabildiklerim:\n' +
  '- Normal mesaj yaz, sohbet edelim (onceki mesajlari hatirlarim)\n' +
  '- Sesli mesaj gonder, dinleyip cevaplayayim\n' +
  '- Fotograf gonder, ne oldugunu anlatayim\n' +
  '- /gorsel <aciklama> yaz, sana resim cizeyim\n\n' +
  '/sifirla ile sohbet gecmisini temizleyebilirsin.';

const HELP =
  'Komutlar:\n' +
  '/basla - karsilama mesaji\n' +
  '/yardim - bu mesaj\n' +
  '/sifirla - sohbet gecmisini sil, sifirdan basla\n' +
  '/gorsel <aciklama> - aciklamaya gore resim uret\n\n' +
  'Komut yazmadan da dogrudan mesaj, ses kaydi veya fotograf gonderebilirsin.';

/** Telegram menusunde gorunecek komutlar (scripts/setup-webhook.mjs kullanir). */
export const BOT_COMMANDS = [
  { command: 'basla', description: 'Karsilama mesaji' },
  { command: 'yardim', description: 'Komutlari goster' },
  { command: 'sifirla', description: 'Sohbet gecmisini temizle' },
  { command: 'gorsel', description: 'Aciklamaya gore resim uret' },
];

/** "/gorsel@BotAdi bir kedi" -> { name: "gorsel", args: "bir kedi" } */
function parseCommand(text) {
  const match = /^\/([a-zA-Z0-9_]+)(?:@\S+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: (match[2] ?? '').trim() };
}

/** Sohbet gecmisi + yeni mesajla modelden cevap alir ve gecmise yazar. */
async function replyWithChat(chatId, userContent, { historyText } = {}) {
  const history = await loadHistory(chatId);

  const answer = await ai.chat([
    { role: 'system', content: config.systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ]);

  // Gecmise gorselin kendisini degil, kisa bir metin karsiligini yaziyoruz;
  // aksi halde base64 veri her istekte tekrar tekrar modele gonderilirdi.
  await appendHistory(chatId, [
    { role: 'user', content: historyText ?? userContent },
    { role: 'assistant', content: answer },
  ]);

  await tg.sendMessage(chatId, answer);
}

// --- Tekil mesaj tipleri --------------------------------------------

async function handleText(chatId, text) {
  const stop = tg.keepChatActionAlive(chatId, 'typing');
  try {
    await replyWithChat(chatId, text);
  } finally {
    stop();
  }
}

async function handlePhoto(chatId, message) {
  const stop = tg.keepChatActionAlive(chatId, 'typing');
  try {
    // photo dizisi kucukten buyuge siralidir; en buyugu en nitelikli olani.
    const largest = message.photo[message.photo.length - 1];
    const { bytes } = await tg.downloadFile(largest.file_id);
    const caption = message.caption?.trim() || 'Bu fotografta ne var? Kisaca anlat.';

    await replyWithChat(
      chatId,
      [
        { type: 'text', text: caption },
        { type: 'image_url', image_url: { url: ai.toDataUrl(bytes, 'image/jpeg') } },
      ],
      { historyText: `[kullanici bir fotograf gonderdi] ${caption}` },
    );
  } finally {
    stop();
  }
}

async function handleVoice(chatId, message) {
  const stop = tg.keepChatActionAlive(chatId, 'typing');
  try {
    const media = message.voice ?? message.audio ?? message.video_note;
    const { bytes, filePath } = await tg.downloadFile(media.file_id);

    const filename = filePath?.split('/').pop() || 'audio.ogg';
    const transcript = await ai.transcribe(bytes, {
      filename,
      mimeType: media.mime_type || 'audio/ogg',
    });

    if (!transcript) {
      await tg.sendMessage(chatId, 'Ses kaydinda anlasilir bir sey duyamadim, tekrar dener misin?');
      return;
    }

    await tg.sendMessage(chatId, `Duydugum: "${transcript}"`);
    await replyWithChat(chatId, transcript);
  } finally {
    stop();
  }
}

async function handleImageGeneration(chatId, prompt) {
  if (!prompt) {
    await tg.sendMessage(
      chatId,
      'Ne cizmemi istedigini de yaz. Ornek:\n/gorsel gun batiminda sahilde kosan bir kopek',
    );
    return;
  }

  const stop = tg.keepChatActionAlive(chatId, 'upload_photo');
  try {
    const bytes = await ai.generateImage(prompt);
    await tg.sendPhotoBytes(chatId, bytes, { caption: prompt });
  } finally {
    stop();
  }
}

async function handleCommand(chatId, command) {
  switch (command.name) {
    case 'start':
    case 'basla':
      await tg.sendMessage(chatId, WELCOME);
      return true;

    case 'help':
    case 'yardim':
      await tg.sendMessage(chatId, HELP);
      return true;

    case 'reset':
    case 'sifirla': {
      const cleared = await clearHistory(chatId);
      await tg.sendMessage(
        chatId,
        cleared
          ? 'Sohbet gecmisi temizlendi. Temiz bir sayfa actik.'
          : 'Gecmisi silemedim - veritabanina su an ulasilamiyor. Biraz sonra tekrar dene.',
      );
      return true;
    }

    case 'image':
    case 'gorsel':
    case 'resim':
      await handleImageGeneration(chatId, command.args);
      return true;

    default:
      return false; // Bilinmeyen komut: normal mesaj gibi modele gonderilsin.
  }
}

// --- Giris noktasi ---------------------------------------------------

/** Bir Telegram guncellemesini isler. Hatalari kendi icinde yonetir. */
export async function handleUpdate(update) {
  const message = update.message ?? update.edited_message;
  if (!message) return; // Kanal gonderisi, buton tiklamasi vb. - ilgilenmiyoruz.

  const chatId = message.chat.id;
  const userId = message.from?.id;

  if (!isUserAllowed(userId)) {
    console.warn(`Izinsiz kullanici engellendi: ${userId}`);
    await tg.sendMessage(
      chatId,
      'Bu bot ozel kullanim icin ayarlanmis. Erisim istiyorsan bot sahibiyle iletisime gec.',
    ).catch(() => {});
    return;
  }

  try {
    const text = message.text?.trim();

    if (text) {
      const command = parseCommand(text);
      if (command && (await handleCommand(chatId, command))) return;
      await handleText(chatId, text);
      return;
    }

    if (message.photo?.length) {
      await handlePhoto(chatId, message);
      return;
    }

    if (message.voice || message.audio || message.video_note) {
      await handleVoice(chatId, message);
      return;
    }

    await tg.sendMessage(
      chatId,
      'Bu tur mesaji henuz isleyemiyorum. Metin, sesli mesaj veya fotograf gonderebilirsin.',
    );
  } catch (error) {
    console.error('Mesaj islenirken hata:', error);
    await tg
      .sendMessage(chatId, `Bir sorun cikti: ${error.message}\n\nTekrar dener misin?`)
      .catch(() => {});
  }
}

/** Baslangicta bir kez loglanan uyarilar. */
export function warnAboutConfig() {
  if (!usingSupabase) {
    console.warn(
      'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY tanimli degil: ' +
        'sohbet gecmisi gecici bellekte tutuluyor ve sunucu uykuya gecince silinecek.',
    );
  }
  if (config.allowedUserIds.length === 0) {
    console.warn(
      'ALLOWED_USER_IDS bos: botu bulan herkes kullanabilir ve OpenAI maliyeti sana yansir.',
    );
  }
}
