-- ============================================================================
-- KVKK / AYDINLATMA ONAYI + SURUM TAKIBI           20261011_kvkk_onay
-- ============================================================================
-- Kayit/giriste acik riza (checkbox). Metin surumlu; uye hangi surumu
-- kabul etti tutulur. Yeni surum yayinlaninca is_current degisir —
-- uygulama yeniden onay ister.
--
-- Geri alma:
--   drop function if exists public.nip_kvkk_kabul(text, text);
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
  title        text not null,
  summary      text not null,
  body         text not null,
  published_at timestamptz not null default now(),
  is_current   boolean not null default false
);

comment on table public.kvkk_documents is
  'KVKK aydinlatma + uyelik acik riza metinleri (surumlu).';

-- Ayni anda tek guncel surum
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

-- Guncel surum (istemci checkbox / yeniden onay icin)
create or replace function public.nip_kvkk_guncel()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'version', version,
    'title', title,
    'summary', summary,
    'body', body,
    'published_at', published_at
  )
  from public.kvkk_documents
  where is_current
  limit 1;
$$;

grant execute on function public.nip_kvkk_guncel() to anon, authenticated;

-- Kabul kaydi
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
-- Tohum: v2026-10-11 (isletme avukati / danismani gozden gecirmeli)
-- ---------------------------------------------------------------------------
insert into public.kvkk_documents (version, title, summary, body, is_current)
values (
  '2026-10-11',
  'Kişisel Verilerin Korunması — Aydınlatma ve Üyelik Açık Rızası',
  'Üyelik, sipariş, puan ve iletişim için kişisel verilerinizin işlenmesine ilişkin aydınlatma metnini okudum; üyelik kapsamında açık rızamı veriyorum.',
  $kvkk$
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
  true
)
on conflict (version) do update set
  title = excluded.title,
  summary = excluded.summary,
  body = excluded.body,
  is_current = excluded.is_current;
