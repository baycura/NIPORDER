-- ============================================================================
-- KVKK / AYDINLATMA ONAYI + SURUM TAKIBI           20261011_kvkk_onay
-- ============================================================================
-- Kayit/giriste acik riza (checkbox). Metin surumlu; uye hangi surumu
-- kabul etti tutulur. Yeni surum yayinlaninca is_current degisir —
-- uygulama yeniden onay ister.
--
-- Metinler jsonb: { "tr", "en", "ru" }. Resmi metin TR; EN/RU bilgilendirme.
-- RPC nip_kvkk_guncel(p_lang) secili dile gore cozumler, yoksa tr.
--
-- Geri alma:
--   drop function if exists public.nip_kvkk_kabul(text, text);
--   drop function if exists public.nip_kvkk_guncel(text);
--   drop function if exists public.nip_kvkk_guncel();
--   drop table if exists public.customer_kvkk_consents;
--   drop table if exists public.kvkk_documents;
--   alter table public.customers drop column if exists kvkk_version;
--   alter table public.customers drop column if exists kvkk_accepted_at;
-- ============================================================================

alter table public.customers
  add column if not exists kvkk_version text,
  add column if not exists kvkk_accepted_at timestamptz;

comment on column public.customers.kvkk_version is
  'Son kabul edilen KVKK / aydinlatma surumu (kvkk_documents.version).';
comment on column public.customers.kvkk_accepted_at is
  'Son KVKK kabul zamani.';

create table if not exists public.kvkk_documents (
  version      text primary key,
  -- { "tr": "...", "en": "...", "ru": "..." }
  title        jsonb not null,
  summary      jsonb not null,
  body         jsonb not null,
  published_at timestamptz not null default now(),
  is_current   boolean not null default false
);

comment on table public.kvkk_documents is
  'KVKK aydinlatma + uyelik acik riza metinleri (surumlu, tr/en/ru jsonb).';

create unique index if not exists kvkk_documents_tek_guncel
  on public.kvkk_documents ((is_current)) where is_current;

create table if not exists public.customer_kvkk_consents (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  version      text not null references public.kvkk_documents(version),
  accepted_at  timestamptz not null default now(),
  source       text not null default 'signup'
               check (source in ('signup', 'reaccept', 'profile')),
  unique (customer_id, version)
);

create index if not exists customer_kvkk_consents_uye
  on public.customer_kvkk_consents(customer_id, accepted_at desc);

alter table public.kvkk_documents enable row level security;
alter table public.customer_kvkk_consents enable row level security;

drop policy if exists kvkk_documents_herkes_okur on public.kvkk_documents;
create policy kvkk_documents_herkes_okur on public.kvkk_documents
  for select to anon, authenticated using (true);

drop policy if exists kvkk_consents_kendi on public.customer_kvkk_consents;
create policy kvkk_consents_kendi on public.customer_kvkk_consents
  for select to authenticated
  using (
    customer_id in (
      select c.id from public.customers c where c.auth_user_id = auth.uid()
    )
  );

drop policy if exists kvkk_consents_personel on public.customer_kvkk_consents;
create policy kvkk_consents_personel on public.customer_kvkk_consents
  for select to authenticated
  using (public.is_staff());

revoke insert, update, delete on public.kvkk_documents from anon, authenticated;
revoke insert, update, delete on public.customer_kvkk_consents from anon, authenticated;
grant select on public.kvkk_documents to anon, authenticated;
grant select on public.customer_kvkk_consents to authenticated;

-- Dil secimine gore guncel metin (yoksa tr)
drop function if exists public.nip_kvkk_guncel();
drop function if exists public.nip_kvkk_guncel(text);

create or replace function public.nip_kvkk_guncel(p_lang text default 'tr')
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r record;
  lang text := lower(coalesce(nullif(trim(p_lang), ''), 'tr'));
  pick text;
begin
  if lang not in ('tr', 'en', 'ru') then
    lang := 'tr';
  end if;

  select * into r from public.kvkk_documents where is_current limit 1;
  if not found then
    return null;
  end if;

  pick := lang;
  if coalesce(r.title ->> pick, '') = '' then
    pick := 'tr';
  end if;

  return jsonb_build_object(
    'version', r.version,
    'lang', pick,
    'title', coalesce(r.title ->> pick, r.title ->> 'tr', ''),
    'summary', coalesce(r.summary ->> pick, r.summary ->> 'tr', ''),
    'body', coalesce(r.body ->> pick, r.body ->> 'tr', ''),
    'published_at', r.published_at
  );
end;
$$;

grant execute on function public.nip_kvkk_guncel(text) to anon, authenticated;

create or replace function public.nip_kvkk_kabul(
  p_version text,
  p_source  text default 'signup'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_cid uuid;
  v_cur text;
  v_src text := coalesce(nullif(trim(p_source), ''), 'signup');
begin
  if v_uid is null then
    raise exception 'kvkk: oturum gerekli';
  end if;
  if v_src not in ('signup', 'reaccept', 'profile') then
    raise exception 'kvkk: gecersiz kaynak';
  end if;

  select version into v_cur from public.kvkk_documents where is_current limit 1;
  if v_cur is null then
    raise exception 'kvkk: guncel metin yok';
  end if;
  if p_version is distinct from v_cur then
    raise exception 'kvkk: surum guncel degil (beklenen %)', v_cur;
  end if;

  select c.id into v_cid from public.customers c
   where c.auth_user_id = v_uid
   order by c.created_at desc nulls last
   limit 1;
  if v_cid is null then
    raise exception 'kvkk: uye kaydi bulunamadi';
  end if;

  insert into public.customer_kvkk_consents (customer_id, version, source)
  values (v_cid, v_cur, v_src)
  on conflict (customer_id, version) do update
    set accepted_at = now(), source = excluded.source;

  update public.customers
     set kvkk_version = v_cur,
         kvkk_accepted_at = now()
   where id = v_cid;

  return jsonb_build_object(
    'ok', true,
    'customer_id', v_cid,
    'version', v_cur,
    'accepted_at', now()
  );
end;
$$;

revoke all on function public.nip_kvkk_kabul(text, text) from anon, public;
grant execute on function public.nip_kvkk_kabul(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tohum: v2026-10-11 — tr resmi; en/ru bilgilendirme cevirisi
-- (isletme avukati / danismani gozden gecirmeli)
-- ---------------------------------------------------------------------------
insert into public.kvkk_documents (version, title, summary, body, is_current)
values (
  '2026-10-11',
  jsonb_build_object(
    'tr', 'Kişisel Verilerin Korunması — Aydınlatma ve Üyelik Açık Rızası',
    'en', 'Protection of Personal Data — Notice and Membership Consent',
    'ru', 'Защита персональных данных — Уведомление и согласие участника'
  ),
  jsonb_build_object(
    'tr', 'Üyelik, sipariş, puan ve iletişim için kişisel verilerinizin işlenmesine ilişkin aydınlatma metnini okudum; üyelik kapsamında açık rızamı veriyorum.',
    'en', 'I have read the privacy notice on processing my personal data for membership, orders, points and communications, and I give my explicit consent for membership purposes.',
    'ru', 'Я ознакомился(лась) с уведомлением об обработке персональных данных для членства, заказов, баллов и связи, и даю согласие в рамках членства.'
  ),
  jsonb_build_object(
    'tr', $kvkk$
NOT IN PARIS / ilgili işletme (“Veri Sorumlusu”), 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) kapsamında sizi bilgilendirir.

1) İşlenen veriler
Kimlik ve iletişim (ad, soyad, e-posta, telefon), üyelik ve giriş bilgileri, sipariş ve ödeme ile ilişkili işlem kayıtları, puan/cüzdan ve seviye bilgileri, sürüş kaydı (RSVP) tercihleri, cihaz/oturum teknik verileri (güvenlik ve hizmet sunumu için).

2) Amaçlar
• Üyelik hesabının oluşturulması ve yönetilmesi
• Siparişlerin alınması, hazırlanması ve takibi
• Puan, cüzdan ve üye indirimlerinin uygulanması
• Sürüş / etkinlik kayıtlarının yönetilmesi (ilgili özellik açıksa)
• Müşteri destek ve işlem güvenliği
• Yasal yükümlülüklerin yerine getirilmesi
• Açık rızanız varsa bilgilendirme ve kampanya iletişimleri

3) Hukuki sebepler
KVKK m.5/2 (sözleşmenin kurulması/ifası, hukuki yükümlülük, meşru menfaat) ve üyelik/sadakat ile açık rıza gerektiren işlemler için m.5/1 açık rıza.

4) Aktarım
Hizmetin sunulması için zorunlu teknik hizmet sağlayıcılarına (barındırma, kimlik doğrulama, bildirim altyapısı) ve kanunen yetkili kurumlara; yurt dışına aktarım söz konusuysa KVKK’ya uygun güvencelerle.

5) Saklama
Üyelik ve işlem kayıtları, mevzuattaki saklama süreleri ve işin gerektirdiği süre boyunca; sonra silinir, yok edilir veya anonimleştirilir.

6) Haklarınız (KVKK m.11)
Verilerinizin işlenip işlenmediğini öğrenme, düzeltme, silme/yok etme, itiraz ve zararın giderilmesini talep etme haklarına sahipsiniz. Başvurularınızı işletmenin duyurduğu iletişim kanallarından iletebilirsiniz.

7) Üyelik açık rızası
Checkbox ile verdiğiniz onay; üyelik hesabı, puan/cüzdan, sipariş geçmişinizin üyelik profilinize bağlanması ve bu amaçlarla işlenmesi içindir. Onayı geri çekmek üyelik özelliklerinin kullanılamamasına yol açabilir; yasal saklama zorunlulukları saklıdır.

Bu metin bilgilendirme amaçlıdır; güncellemelerde yeni sürüm yayınlanır ve gerekirse yeniden onay istenir.
$kvkk$,
    'en', $kvkk$
NOT IN PARIS / the relevant business (“Data Controller”) informs you under Türkiye’s Personal Data Protection Law No. 6698 (“KVKK”).

1) Data processed
Identity and contact (name, surname, email, phone), membership and login data, order and payment-related records, points/wallet and tier data, ride RSVP preferences, and technical device/session data (for security and service delivery).

2) Purposes
• Creating and managing your membership account
• Taking, preparing and tracking orders
• Applying points, wallet balance and member discounts
• Managing ride/event sign-ups (where the feature is enabled)
• Customer support and transaction security
• Complying with legal obligations
• Informational and campaign messages where you have given consent

3) Legal bases
KVKK art. 5/2 (contract, legal obligation, legitimate interest) and, for membership/loyalty processing that requires it, art. 5/1 explicit consent.

4) Transfers
To essential service providers (hosting, authentication, notifications) and competent authorities as required by law; cross-border transfers only with KVKK-compliant safeguards where applicable.

5) Retention
Membership and transaction records are kept for the periods required by law and by the service, then deleted, destroyed or anonymised.

6) Your rights (KVKK art. 11)
You may request information, correction, deletion/destruction, objection and compensation for unlawful processing via the channels published by the business.

7) Membership consent
By ticking the checkbox you consent to linking your membership, points/wallet and order history to your profile for those purposes. Withdrawing consent may limit membership features; mandatory legal retention still applies.

This notice is for information; updates are published as a new version and may require fresh consent.
$kvkk$,
    'ru', $kvkk$
NOT IN PARIS / соответствующее предприятие («Оператор данных») информирует вас в соответствии с Законом Турции № 6698 о защите персональных данных («KVKK»).

1) Обрабатываемые данные
Идентификационные и контактные данные (имя, фамилия, e-mail, телефон), данные членства и входа, записи о заказах и оплате, баллы/кошелёк и уровень, предпочтения RSVP на заезды, технические данные устройства/сессии (для безопасности и оказания услуги).

2) Цели
• Создание и ведение аккаунта участника
• Приём, приготовление и отслеживание заказов
• Применение баллов, кошелька и скидок участника
• Управление записями на заезды/события (если функция включена)
• Поддержка клиентов и безопасность операций
• Исполнение законных обязанностей
• Информационные и рекламные сообщения при наличии согласия

3) Правовые основания
KVKK ст. 5/2 (договор, законная обязанность, законный интерес) и при необходимости для членства/лояльности — ст. 5/1 явное согласие.

4) Передача
Необходимым поставщикам услуг (хостинг, аутентификация, уведомления) и уполномоченным органам; трансграничная передача — только с гарантиями по KVKK.

5) Хранение
Данные членства и операций хранятся в сроки, требуемые законом и услугой, затем удаляются, уничтожаются или обезличиваются.

6) Ваши права (KVKK ст. 11)
Вы можете запросить информацию, исправление, удаление/уничтожение, возражение и возмещение ущерба через каналы, указанные предприятием.

7) Согласие участника
Отметка в чекбоксе означает согласие на привязку членства, баллов/кошелька и истории заказов к вашему профилю для этих целей. Отзыв согласия может ограничить функции членства; обязательные сроки хранения сохраняются.

Это уведомление носит информационный характер; обновления публикуются новой версией и могут требовать повторного согласия.
$kvkk$
  ),
  true
)
on conflict (version) do update set
  title = excluded.title,
  summary = excluded.summary,
  body = excluded.body,
  is_current = excluded.is_current;
