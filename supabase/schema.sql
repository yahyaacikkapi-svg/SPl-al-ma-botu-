-- Telegram GPT botu icin gerekli tablolar.
-- Supabase panelinde: SQL Editor -> yeni sorgu -> bu dosyayi yapistir -> Run.

-- Sohbet gecmisi (kullanici basina)
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  chat_id     text        not null,
  role        text        not null check (role in ('user', 'assistant')),
  content     jsonb       not null,
  created_at  timestamptz not null default now()
);

-- Gecmis okunurken en yeni N mesaj cekiliyor; bu indeks onu hizlandirir.
create index if not exists chat_messages_chat_id_id_idx
  on public.chat_messages (chat_id, id desc);

-- Telegram tekrar gonderdigi guncellemeleri iki kez cevaplamamak icin
create table if not exists public.processed_updates (
  update_id   bigint      primary key,
  created_at  timestamptz not null default now()
);

-- Bu tablolara sadece sunucudaki service_role anahtari erisiyor.
-- RLS'i aciyoruz ve hicbir policy tanimlamiyoruz: boylece anon/authenticated
-- anahtarlarla disaridan erisim tamamen kapali kalir (service_role RLS'i baypas eder).
alter table public.chat_messages     enable row level security;
alter table public.processed_updates enable row level security;

-- Opsiyonel temizlik: 30 gunden eski kayitlari silmek istersen ara sira calistir.
-- delete from public.chat_messages     where created_at < now() - interval '30 days';
-- delete from public.processed_updates where created_at < now() - interval '1 day';
