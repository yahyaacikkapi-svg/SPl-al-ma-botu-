# Telegram ChatGPT Botu

Telegram üzerinde çalışan, OpenAI destekli sohbet botu. Vercel'de webhook olarak çalışır — bilgisayarının açık olmasına gerek yok, 7/24 ayakta kalır.

**Yapabildikleri:**

| Özellik | Nasıl kullanılır |
|---|---|
| Sohbet (hafızalı) | Bota normal mesaj yaz — önceki konuşmaları hatırlar |
| Sesli mesaj | Ses kaydı gönder — yazıya çevirip cevaplar |
| Görsel analizi | Fotoğraf gönder — ne olduğunu anlatır |
| Görsel üretme | `/gorsel gün batımında koşan bir köpek` |
| Hafızayı sıfırlama | `/sifirla` |

Harici npm paketi kullanmaz (sadece Node 20+ `fetch`), bu yüzden kurulum ve deploy hızlıdır.

---

## Kurulum

Toplam 5 adım, yaklaşık 15 dakika.

### 1. Telegram bot'unu oluştur

1. Telegram'da [@BotFather](https://t.me/BotFather)'a yaz
2. `/newbot` gönder
3. Bota bir isim ve `_bot` ile biten bir kullanıcı adı ver
4. BotFather sana `123456789:AAE...` şeklinde bir **token** verir — bunu sakla

Bir de kendi kullanıcı ID'ni öğren: [@userinfobot](https://t.me/userinfobot)'a yaz, sana bir numara verecek.

> **Neden gerekli:** Bu ID ile botu sadece kendine açacaksın. Yapmazsan botu bulan herkes kullanır ve **OpenAI faturası sana gelir.**

### 2. OpenAI API anahtarı al

1. [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → **Create new secret key**
2. `sk-proj-...` ile başlayan anahtarı kopyala
3. [Billing](https://platform.openai.com/settings/organization/billing) kısmından bakiye yükle (5–10 $ başlangıç için fazlasıyla yeter)

> ChatGPT Plus aboneliği API'yi kapsamaz, API kullanımı ayrı ücretlendirilir.

### 3. Vercel'e deploy et

```bash
npm i -g vercel
vercel login
vercel --prod
```

Sonunda sana `https://xxxx.vercel.app` gibi bir adres verecek — bunu sakla.

Şimdi ortam değişkenlerini gir. Vercel panelinde **Settings → Environment Variables** kısmından ekleyebilirsin, ya da terminalden:

```bash
vercel env add TELEGRAM_BOT_TOKEN production
vercel env add OPENAI_API_KEY production
vercel env add TELEGRAM_WEBHOOK_SECRET production
vercel env add ALLOWED_USER_IDS production
```

`TELEGRAM_WEBHOOK_SECRET` için rastgele uzun bir metin üret:

```bash
openssl rand -hex 32
```

Değişkenleri ekledikten sonra tekrar deploy et (yeni değişkenlerin geçerli olması için):

```bash
vercel --prod
```

Tüm değişkenlerin listesi ve açıklamaları için [`.env.example`](.env.example) dosyasına bak.

### 4. Kalıcı hafıza için Supabase (opsiyonel ama önerilir)

Bu adımı atlarsan bot yine çalışır, ama sunucu uykuya geçtiğinde sohbet geçmişi silinir.

1. [supabase.com](https://supabase.com)'da ücretsiz bir proje aç
2. **SQL Editor** → yeni sorgu → [`supabase/schema.sql`](supabase/schema.sql) dosyasının içeriğini yapıştır → **Run**
3. **Settings → API** kısmından Project URL ve `service_role` anahtarını al
4. Vercel'e ekle:

```bash
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel --prod
```

> `service_role` anahtarı tüm veritabanına tam yetkilidir. Sadece sunucu tarafında kullan, hiçbir zaman git'e commit etme veya paylaşma.

### 5. Webhook'u bağla

Yerelde `.env` dosyanı oluştur:

```bash
cp .env.example .env
# .env dosyasını aç, TELEGRAM_BOT_TOKEN ve TELEGRAM_WEBHOOK_SECRET değerlerini gir
```

Sonra:

```bash
npm run webhook:set -- https://senin-projen.vercel.app
```

`Hazır! Telegram'da @botun_adi adresine yaz.` mesajını görürsen kurulum tamam. Telegram'da botuna `/basla` yaz.

---

## Sorun giderme

**Bot hiç cevap vermiyor**

```bash
npm run webhook:info
```

`last_error_message` alanına bak:

| Hata | Anlamı ve çözüm |
|---|---|
| `Wrong response from the webhook: 401` | `TELEGRAM_WEBHOOK_SECRET` Vercel'deki ile yereldeki `.env` dosyasında farklı. Aynı değeri kullan, Vercel'e girdikten sonra tekrar deploy et. |
| `Wrong response from the webhook: 500` | Ortam değişkeni eksik. Tarayıcıda `https://projen.vercel.app/api/telegram` adresini aç — hangi değişkenin eksik olduğunu söyler. |
| Boş / hata yok ama cevap yok | Kendi kullanıcı ID'ni `ALLOWED_USER_IDS` içine eklemeyi unutmuş olabilirsin. |

**"Bu bot özel kullanım için ayarlanmış" diyor** → `ALLOWED_USER_IDS` içine kendi ID'ni ekle ve tekrar deploy et.

**"OpenAI sohbet hatası: ... model ... does not exist"** → Model isimleri zamanla değişiyor. `OPENAI_MODEL` değişkenini hesabında geçerli bir modelle değiştir (örn. `gpt-5.6-terra`).

**Görsel üretme çalışmıyor** → Görsel üretimi bazı hesaplarda kimlik doğrulaması ister. OpenAI panelinden hesabının doğrulanmış olduğundan emin ol, ya da `OPENAI_IMAGE_MODEL=gpt-image-1-mini` dene.

**Canlı logları görmek için:**

```bash
vercel logs --follow
```

---

## Botu özelleştirme

Botun kişiliğini `SYSTEM_PROMPT` ile değiştirebilirsin:

```
SYSTEM_PROMPT=Sen alaycı ama yardımsever bir asistansın. Kısa cevap ver, ara sıra espri yap.
```

Diğer ayarlanabilir değişkenler: `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `MAX_HISTORY_MESSAGES`. Hepsinin varsayılanı zaten makul — hiçbirini `.env`'e yazmak zorunda değilsin. Ne işe yaradıkları ve maliyete etkileri [`.env.example`](.env.example) dosyasında açıklanmış.

---

## Proje yapısı

```
api/telegram.js          Webhook giriş noktası (imza doğrulama, tekrar eden mesaj kontrolü)
lib/config.js            Ortam değişkenleri ve izin listesi
lib/telegram.js          Telegram Bot API istemcisi
lib/openai.js            OpenAI istemcisi (sohbet, ses, görsel)
lib/store.js             Sohbet hafızası (Supabase veya geçici bellek)
lib/handlers.js          Mesaj yönlendirme ve komutlar
scripts/setup-webhook.mjs  Webhook kurulum aracı
supabase/schema.sql      Veritabanı tabloları
```

## Maliyet

Vercel Hobby ve Supabase Free planları bu kullanım için yeterli. Tek gerçek masraf OpenAI API kullanımı.

Varsayılan ayarlarla (`gpt-5.6-luna`, `MAX_HISTORY_MESSAGES=10`) **5 dolar** kabaca şuna denk geliyor:

| İşlem | 5 dolar ile yaklaşık |
|---|---|
| Yazılı mesaj (veya telefonun diktesiyle yazılan) | ~9.600 |
| Fotoğraf gönderip yorumlatmak | ~6.000 |
| Sesli mesaj (10 sn) | ~5.000 |
| Sesli mesaj (30 sn) | ~2.500 |
| `/gorsel` — düşük kalite | ~1.000 |
| `/gorsel` — orta kalite | ~120 |

Birkaç pratik not:

- **Dikte bedava.** Telefonun kendi mikrofon tuşuyla yazdırırsan mesaj Telegram'a düz yazı olarak gider ve ses çözümleme hiç devreye girmez. Ses kaydı atmak yaklaşık 3 kat daha pahalı — ama uzun ya da karışık anlatımlarda model ham sesi duyduğu için daha isabetli olabiliyor.
- **`/gorsel` ölçülü kullanılmalı.** Düşük kalitede bile bir görsel ~200 mesaja bedel. Varsayılanı `low` yaptık; hiç kullanmayacaksan zaten önemsiz.
- **Krediler 1 yıl sonra doluyor.** OpenAI'nin ön ödemeli kredileri [satın alma tarihinden bir yıl sonra geçersiz oluyor](https://openai.com/policies/service-credit-terms/) ve iade edilmiyor. Günde 25 mesajın altında kalıyorsan 5 doları bir yılda bitiremezsin — o yüzden çok yüklemenin anlamı yok, bitince tekrar yükle.

**İki ayarı mutlaka yap:** OpenAI panelinde **auto-recharge'ı kapat** (yoksa bakiye bitince karttan otomatik çeker) ve **aylık harcama limiti koy**. Kullanımını [platform.openai.com/usage](https://platform.openai.com/usage) adresinden takip edebilirsin.
