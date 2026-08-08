/**
 * Ortam degiskenlerini tek yerden okur ve dogrular.
 */

const DEFAULT_SYSTEM_PROMPT =
  'Sen Telegram uzerinden konusan yardimci bir asistansin. ' +
  'Kullanici hangi dilde yazarsa o dilde cevap ver. ' +
  'Telegram sohbeti oldugu icin cevaplarin kisa ve net olsun, ' +
  'gerekmedikce uzun listeler ve baslikli bolumler kullanma.';

function intFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** "1, 2,3" -> ["1","2","3"];  bos/tanimsiz -> [] */
function listFromEnv(name) {
  return (process.env[name] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
  openaiKey: process.env.OPENAI_API_KEY ?? '',

  chatModel: process.env.OPENAI_MODEL || 'gpt-5.6',
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
  imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',

  systemPrompt: process.env.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
  maxHistoryMessages: intFromEnv('MAX_HISTORY_MESSAGES', 20),

  allowedUserIds: listFromEnv('ALLOWED_USER_IDS'),

  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/+$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};

/** Bot hic calisamayacaksa eksik olan degiskenlerin listesini dondurur. */
export function missingRequiredEnv() {
  const missing = [];
  if (!config.telegramToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!config.openaiKey) missing.push('OPENAI_API_KEY');
  if (!config.webhookSecret) missing.push('TELEGRAM_WEBHOOK_SECRET');
  return missing;
}

/**
 * Allowlist bos ise herkese acik demektir. Bunu bilerek destekliyoruz
 * (ornegin herkese acik bir bot), ama loglara uyari dusuyoruz.
 */
export function isUserAllowed(userId) {
  if (config.allowedUserIds.length === 0) return true;
  return config.allowedUserIds.includes(String(userId));
}
