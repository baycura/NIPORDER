-- ============================================================================
-- BIRLESTIRME ADIM 3: KIMLIK BAGI                 20260903_kimlik_bagi_profiles_customers
-- ============================================================================
-- Rezervasyon sitesi (RESERVE projesi) uyeleri "profiles" tablosunda tutuyor,
-- NIPORDER ise "customers"ta. 75'e 75 satir, 66'si ayni insan. Order bugune
-- kadar bunu bilmiyordu: rezervasyon yapan Ayse ile kafede siparis veren Ayse
-- iki ayri kisi gibi duruyordu. Bu adim aradaki bagi kurar; Adim 4'te
-- rezervasyonlar bu bag uzerinden Order'a tasinacak (reservations.profile_id
-- -> customers.reserve_profile_id -> customers.id).
--
-- ESLESME KURALI: yalniz e-posta (kucuk harf, budanmis). Iki tarafta da e-posta
-- UNIQUE ve bos e-posta yok -> eslesme deterministik. Telefon ya da ad
-- uzerinden eslesme YAPILMADI; onlar ipucu, kimlik degil. (Omer'in iki hesabi
-- ayni telefonu tasiyor; "demir levent" iki tarafta da iki hesap — bunlari
-- birlestirmek makine karari degil, sahibin karari.)
--
-- NE GELIYOR (yalniz kimlik, puanlama DEGIL):
--   reserve_profile_id  RESERVE auth/profil id'si. Kopru bu.
--   member_code         NIP-MBR-XXXXXX. Uyenin bildigi, biletinde yazan kod.
-- tier / trust_score / loyalty_score / reward_points GELMIYOR. Order'in kendi
-- tier'i ('yeniyuz'/'bronze') ve points'i var, anlamlari farkli. Iki puanlama
-- sistemini birlestirmek urun karari; Adim 4'te sahibe sorulacak.
--
-- YENI SATIR: 5 onayli uyenin Order'da karsiligi yoktu, ekleniyor. 4 REDDEDILMIS
-- profil (ardaleoncr, can.aydin.224, af87844, halilerenaltinnn) eklenmiyor —
-- uye degiller, rezervasyonlari yok.
--
-- TUZAKLAR (hepsi kontrol edildi):
--   * customers.phone UNIQUE. Omer'in 2. hesabi (omerbaycura2) 1. hesapla ayni
--     telefonu tasiyor -> bu satirda phone NULL. Bos telefon '' degil NULL
--     (UNIQUE '' ile catisir, NULL ile catismaz; mevcut 18 satir da NULL).
--   * customers_guard_money_cols tetikleyicisi INSERT'te tier'i 'yeniyuz'a
--     ceker — ama yalniz current_user authenticated/anon ise. Migration
--     postgres olarak kosar (dogrulandi), dokunmaz. Yine de asagida rol kemeri
--     var: yanlis rolde kosarsa hicbir sey yazmadan durur.
--   * Isimsiz profiller: kemalkaramarmaris ve esracapaci RESERVE'de "Isimsiz",
--     Order'da gercek adlari var. Order'daki ad korunur, ustune yazilmaz.
--   * anyone_insert_customer (anon ekleyebilir) + customer_update_own (musteri
--     kendi satirini gunceller) politikalari yeni kolonlara da uzanirdi: bir
--     musteri kendi member_code'unu / reserve_profile_id'sini istedigi gibi
--     degistirebilirdi. Para kolonlarindaki ayni kalkan buraya da kuruldu:
--     personel degilse bu iki kolon INSERT'te NULL'a, UPDATE'te eskisine cekilir.
--   * Butun veri isi TEK do-blogunda: calistirici ifadeleri ayri ayri kossa
--     bile atomik. Temp tablo blogun icinde yaratilip icinde kullaniliyor.
--
-- Geri alma:
--   delete from public.customers where reserve_profile_id in (<5 yeni id>);
--   drop trigger trg_customers_guard_identity on public.customers;
--   drop function public.customers_guard_identity_cols();
--   alter table public.customers drop column reserve_profile_id, drop column member_code;
-- ============================================================================

alter table public.customers
  add column if not exists reserve_profile_id uuid,
  add column if not exists member_code text;

comment on column public.customers.reserve_profile_id is
  'RESERVE projesindeki profiles.id (= o projenin auth.users.id). Adim 3 koprusu; '
  'rezervasyonlar bu bag uzerinden Order''a tasinir. RESERVE emekliye ayrilinca '
  'tarihsel referans olarak kalir. Yalniz personel yazar (trigger).';
comment on column public.customers.member_code is
  'NIP-MBR-XXXXXX uye kodu. Rezervasyon sitesinden geldi; uyenin biletinde yazan, '
  'kapida gosterdigi kod. UNIQUE. Yalniz personel yazar (trigger).';

create unique index if not exists customers_reserve_profile_uidx
  on public.customers(reserve_profile_id) where reserve_profile_id is not null;
create unique index if not exists customers_member_code_uidx
  on public.customers(member_code) where member_code is not null;

-- ----------------------------------------------------------------------------
-- Kimlik kolonlari kalkani. customers_guard_money_cols ile ayni desen:
-- REST'ten gelen (authenticated/anon) ve personel olmayan biri bu kolonlari
-- belirleyemez. Trigger'da current_user istegin rolu (DEFINER tuzagi yok).
-- ----------------------------------------------------------------------------
create or replace function public.customers_guard_identity_cols()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.is_staff() then return new; end if;

  if tg_op = 'INSERT' then
    new.reserve_profile_id := null;
    new.member_code        := null;
  else
    new.reserve_profile_id := old.reserve_profile_id;
    new.member_code        := old.member_code;
  end if;
  return new;
end $$;

drop trigger if exists trg_customers_guard_identity on public.customers;
create trigger trg_customers_guard_identity
  before insert or update on public.customers
  for each row execute function public.customers_guard_identity_cols();

-- ----------------------------------------------------------------------------
-- Veri isi. Kaynak: RESERVE.profiles (status='approved'), 2026-09-02 anlik
-- goruntusu. Kolonlar: profile_id, email, member_code, name, phone, yeni_mi
-- ----------------------------------------------------------------------------
do $mig$
declare
  v_toplam int; v_eslesen int; v_yeni int; v_catisan int;
  v_bagli int; v_kodlu int; v_satir int;
begin
  -- ROL KEMERI: REST rolunde kosuyorsa para/kimlik kalkanlari devreye girer ve
  -- sessizce yanlis yazar. Orada hic baslamasin.
  if current_user in ('authenticated', 'anon') then
    raise exception 'Bu migration postgres/service rolunde kosmali; su anki rol: %', current_user;
  end if;

  create temp table kimlik (
    profile_id uuid, email text, member_code text, name text, phone text, yeni_mi boolean
  ) on commit drop;

  insert into kimlik values
  ('5c4eebeb-3ac1-4c0a-bfa6-30af99b36943'::uuid, 'omerbaycura@gmail.com', 'NIP-MBR-BBFE38', $n$Ömer Bayçura$n$, '905078691631', false),
  ('4becdaad-a823-4ab2-a7b9-7cdda8abd9f8'::uuid, 'omerbaycura2@gmail.com', 'NIP-MBR-076215', $n$Ömer Baycura$n$, null, true),
  ('d6d7fc79-1cf9-4fd4-9c78-c28965ea2445'::uuid, 'cerenbaycura@gmail.com', 'NIP-MBR-1E94D9', $n$Ayşegül Ceren Bayçura$n$, '5443411494', false),
  ('62b971f4-4eb0-4fd2-8eb8-bfb540784f10'::uuid, 'tariksaribaz33@gmail.com', 'NIP-MBR-0CCE6D', $n$Tarık Sarıbaz$n$, '905458492329', false),
  ('71cf72c4-3288-4e3b-b19e-aab1015672c8'::uuid, 'mustafacagatay3@gmail.com', 'NIP-MBR-CB5060', $n$Mustafa Çağatay Şahin$n$, '905067212023', false),
  ('3b03fc5b-84d3-4bb7-8e1b-90f1809d626b'::uuid, 'noyanongen@gmail.com', 'NIP-MBR-FA2012', $n$Noyan ÖNGEN$n$, '905077533843', false),
  ('10795c13-6b31-447d-bd96-508573adc377'::uuid, 'btuhanaksu@gmail.com', 'NIP-MBR-0944D5', $n$Batuhan Aksu$n$, '905425699122', false),
  ('981c23de-a0cd-42d5-8ac4-df224fbdf9e3'::uuid, 'akaemre@gmail.com', 'NIP-MBR-4F2AD8', $n$Emre Aka$n$, '905327796561', false),
  ('80a6e402-f831-4bc2-aebc-284ad5ee44be'::uuid, 'ercanmeralll@gmail.com', 'NIP-MBR-65C797', $n$Ercan Meral$n$, '905308791214', false),
  ('add5531f-d263-4bb4-ad73-e54a7e2d25ac'::uuid, 'orhanylmz@gmail.com', 'NIP-MBR-C6AB90', $n$Orhan Yılmaz$n$, '905342338183', false),
  ('5ac2d1c1-ada8-41ea-9d27-c022efc30ce6'::uuid, 'djleventercetin@gmail.com', 'NIP-MBR-6E67D1', $n$Levent Erçetin$n$, '905320536987', false),
  ('101cd0fd-f4b4-4b05-887c-10250b86704c'::uuid, 'hello@emrahyegin.com', 'NIP-MBR-BCD8EE', $n$Emrah Yeğin$n$, '905332160746', false),
  ('b9492eb8-7210-45d0-a385-520db35327ac'::uuid, 't.canustaoglu@gmail.com', 'NIP-MBR-5C466C', $n$Tolga Can Ustaoğlu$n$, '905449301912', false),
  ('c6ced09a-15ca-4c85-ab11-cbf4a63e71a9'::uuid, 'djibrahimmurat@gmail.com', 'NIP-MBR-CBFBF6', $n$Ibrahim Murat$n$, '905363450907', false),
  ('788b1e18-8455-4cb1-b8a0-168af8c838f2'::uuid, 'haci.kanal05@gmail.com', 'NIP-MBR-897FF6', $n$Haci Abi$n$, '905306898152', false),
  ('8f84b1fa-d5fd-4370-823c-cd2ce226cfb7'::uuid, 'berfin-celikkol@hotmail.com', 'NIP-MBR-AFAF06', $n$berfin çelikkol$n$, '905455567686', false),
  ('ae5d64d1-ce93-46bf-b959-e358a7e1a047'::uuid, 'aslihanoder@gmail.com', 'NIP-MBR-2D6972', $n$Aslıhan Öder$n$, '905324268618', false),
  ('da3ecc2f-3a2a-43f3-87de-39fa54e45980'::uuid, 'ertugrul.yildirim@gmail.com', 'NIP-MBR-C663BA', $n$Ertuğrul Yıldırım$n$, null, false),
  ('b4776605-f1f2-41a9-80d2-0c84aca78652'::uuid, 'erden.nil@gmail.com', 'NIP-MBR-D5F600', $n$Nilüfer Erden$n$, '905346123834', false),
  ('dc4b03f0-2986-4f15-ab03-22a15b7783f2'::uuid, 'lostvitaly@gmail.com', 'NIP-MBR-AC39E1', $n$Lostvitaly$n$, '905078310961', false),
  ('9ee4e4ab-f43d-4693-a638-1d176e6238c4'::uuid, 'efekanbdrmusic@gmail.com', 'NIP-MBR-D0D35C', $n$efekan bodur$n$, '905388483568', false),
  ('a3d33093-e044-4fae-b776-6cbaf4ec3fc7'::uuid, 'gonensercan@gmail.com', 'NIP-MBR-B279F3', $n$Sercan gone$n$, '905321734107', false),
  ('f6f33276-77f2-4167-8afe-3ea9e4f6ed3c'::uuid, 'ilhan.metehan@gmail.com', 'NIP-MBR-DDBD38', $n$Metehan İlhan$n$, null, false),
  ('368b5293-d005-4f7b-8a18-63532b8e5731'::uuid, 'cetinarda@gmail.com', 'NIP-MBR-7CD90D', $n$Arda Çetin$n$, '905344182312', false),
  ('7fdd8dd5-67e4-45cf-81ae-739b50d4c6ee'::uuid, 'demirleventt@hotmail.com', 'NIP-MBR-9AD4B9', $n$Demir levent$n$, '905326284143', false),
  ('cd223522-35cd-4f1e-a23c-f45274515865'::uuid, 'gunesbircan@gmail.com', 'NIP-MBR-FFBC72', $n$güneş bircan$n$, '9005355126262', false),
  ('6b2adae3-5bd4-44eb-8d32-cabda1214671'::uuid, 'sinembaysal12@gmail.com', 'NIP-MBR-3D62E6', $n$Sinem Baysal$n$, '9005384599069', false),
  ('92428d33-8ae2-4ddf-9731-78da2efc1c52'::uuid, 'hasancantimur@gmail.com', 'NIP-MBR-A3B84B', $n$Hasan Can Timur$n$, '905383326721', false),
  ('2ff93674-8c79-4fe4-ad3a-76400cadae66'::uuid, 'onurcelikkol@gmail.com', 'NIP-MBR-81BC98', $n$Onur Çelikkol$n$, null, false),
  ('9e871da8-3591-4251-90cb-ef5f9c32266d'::uuid, 'salihabask@gmail.com', 'NIP-MBR-B63227', $n$saliha çayır$n$, '905423979983', false),
  ('b6115d41-ac70-43d9-84a2-cfba1580ce7f'::uuid, 'yasinncayirr@gmail.com', 'NIP-MBR-B51A26', $n$Yasin Çayır$n$, '905301259309', false),
  ('49257254-2858-49b1-8608-0f30f4f4a6d6'::uuid, 'kat.mignard@gmail.com', 'NIP-MBR-B3C631', $n$Katty MIGNARD$n$, '44652373564', false),
  ('0cbee98a-7775-416d-915e-c163ffdeb07f'::uuid, 'melisayapan99@icloud.com', 'NIP-MBR-3E75EC', $n$Melisa yapan$n$, '905523182380', false),
  ('b5e7e364-d63b-4401-add8-3446dd353c36'::uuid, 'senembasaran88@gmail.com', 'NIP-MBR-A1D362', $n$Senem Başaran$n$, '905050296049', false),
  ('9b137345-8ceb-488d-ab59-9e16c3b7a728'::uuid, 'burkibora@gmail.com', 'NIP-MBR-55BB1A', $n$Burak bora$n$, '905395946138', false),
  ('4acebcdf-c65d-42ae-b937-cfcfaa8ca4b0'::uuid, 'meldaklcx@gmail.com', 'NIP-MBR-36D376', $n$чмeldaч$n$, '905394992712', false),
  ('02027cb0-d0cc-4725-91c2-fbfe66f7014d'::uuid, '37umutyigit@gmail.com', 'NIP-MBR-B58C6D', $n$Umut Acar$n$, '905356799031', false),
  ('a5774f82-d080-4cbb-b236-814188f97e1e'::uuid, 'ilke.soyer@hotmail.com', 'NIP-MBR-205DE2', $n$İlke Soyer$n$, '905070288558', false),
  ('f6ef5c65-17e1-49e2-86b5-d03ed1b077da'::uuid, 'anil.ortel@me.com', 'NIP-MBR-05F61C', $n$Anıl Örtel$n$, '905548881131', false),
  ('befddc22-bb3a-4a2c-b021-d822f6ee3b65'::uuid, 'sinembalci91@gmail.com', 'NIP-MBR-A30BAB', $n$Sinem Balcı Ünver$n$, '905386309620', false),
  ('45976234-93e6-4bbf-ac75-2b78b18f15b6'::uuid, 'ozarkaan2000@gmail.com', 'NIP-MBR-865262', $n$Kaan$n$, '905355773862', false),
  ('238df835-a883-4a5e-8dfd-9193e68912d9'::uuid, 'adilhan5561@gmail.com', 'NIP-MBR-3ECD2A', $n$Han$n$, '905052098380', false),
  ('d7536dce-ef6a-4d67-964a-4d7d9d8dc3a1'::uuid, 'yunemko4878@gmail.com', 'NIP-MBR-110AB4', $n$Yunus Emre Akşit$n$, '905343606100', false),
  ('5e1942d1-103a-4e61-b8b3-d2823b34aacc'::uuid, 'mehmetirezz@gmail.com', 'NIP-MBR-B6F4F9', $n$Mehmet İREZ$n$, '905510484848', false),
  ('d7bea406-e5e1-4dec-ab7f-759ce03a3db3'::uuid, 'rebekahkeshav@hotmail.com', 'NIP-MBR-D7604C', $n$Rebekah Keshav$n$, null, false),
  ('8030bad2-3457-4ae2-bc65-9e31374f73be'::uuid, 'iilyasavci@gmail.com', 'NIP-MBR-B689EC', $n$İlyas Avcı$n$, '905446194494', false),
  ('99280847-fab5-4c59-85f0-fc1c0b454514'::uuid, 'babu86@mail.ru', 'NIP-MBR-16D77A', $n$Ira Золотова$n$, null, false),
  ('39f76b66-50bc-4be0-9eb7-fc188c70eb7b'::uuid, 'lubyatinskaya@gmail.com', 'NIP-MBR-D0A5BD', $n$Дарья Любятинская$n$, null, false),
  ('355972b7-fd0a-45df-9605-7f3c0b16ad85'::uuid, 'sayginaslan@gmail.com', 'NIP-MBR-DC6FEB', $n$SAYGIN$n$, null, false),
  ('caaf4882-4d3e-425b-9b1c-a427cbabb33c'::uuid, 'ardamuhhu@gmail.com', 'NIP-MBR-DBE111', $n$ARDA CAN ÇELİKBAŞ$n$, '905468631610', false),
  ('43f47256-bcdb-4a17-a7b8-964b244fb63d'::uuid, 'lennina.signup@gmail.com', 'NIP-MBR-52F7B0', $n$Lennin$n$, null, false),
  ('dd9d4d0b-1fd2-4b21-812a-0cc73c6eb967'::uuid, 'dyg.calk@gmail.com', 'NIP-MBR-44FBB9', $n$Duygu Çalık$n$, null, false),
  ('5b92e23e-17dc-424c-ae15-3e0533341fb4'::uuid, 'busrasecilay@gmail.com', 'NIP-MBR-6A6E37', $n$Büşra Sezer$n$, '905353732101', false),
  ('fbf5a2fa-9f87-44f1-8ac6-8880e3416317'::uuid, 'gogeonaut@gmail.com', 'NIP-MBR-8595ED', $n$Georgii Sherazadishvili$n$, null, false),
  ('09818bd2-0e0d-4bdf-b53a-9134f9878f40'::uuid, 'st.valeriakornienko@gmail.com', 'NIP-MBR-80E598', $n$Valeriia Kornienko$n$, '79516754754', false),
  ('c43ad9bc-1c4e-4b6f-99b3-1e366218ff61'::uuid, 'karamukyagmur@gmail.com', 'NIP-MBR-BA1C2C', $n$Yağmur Doğan$n$, '905332573255', false),
  ('080ce994-e3cf-4aee-b0dd-dbaa879e887f'::uuid, 'sy.unver@icloud.com', 'NIP-MBR-475371', $n$Yamaç Ünver$n$, null, false),
  ('a54e5e2a-3b48-4367-bca1-da4d01af8be0'::uuid, 'bonjour@notinparis.me', 'NIP-MBR-5C66F8', $n$NIP Team$n$, null, false),
  ('6d787192-c237-42cf-93b0-a3815438defa'::uuid, 'zelaldogan93@gmail.com', 'NIP-MBR-C20845', $n$Zelal Dogan$n$, '905347732303', false),
  ('9b69b431-2349-4701-8286-49ecce304c8e'::uuid, 'honurkymz@gmail.com', 'NIP-MBR-464920', $n$Onur Kaymaz$n$, '905078885051', false),
  ('6ffc22ce-085a-4763-b493-81d6a56a1522'::uuid, 'dilaragocery@gmail.com', 'NIP-MBR-52401F', $n$Dilara Göçer$n$, '905442952002', false),
  ('efa7a32b-c8a7-405b-81db-7242581c37a0'::uuid, 'aticiokan55@gmail.com', 'NIP-MBR-4F12D3', $n$Okan ATICI$n$, null, false),
  ('ffc5a4e8-37cd-4756-ac5a-9d27680703b9'::uuid, 'kayabasdnz@gmail.com', 'NIP-MBR-74949E', $n$Deniz Kayabas$n$, null, false),
  ('16c54598-5898-45ea-8d26-fad75fec9f16'::uuid, 't.cansertel@gmail.com', 'NIP-MBR-E0F4B6', $n$taner sertel$n$, null, false),
  ('5f31e79c-6273-41ba-b255-d8e46e39ee98'::uuid, 'flandrienn@gmail.com', 'NIP-MBR-BB1438', $n$demir levent$n$, null, false),
  ('e9ecff65-3042-409c-81f2-d8896859df8b'::uuid, 'lol123322@gmail.com', 'NIP-MBR-23219B', $n$Kirill$n$, null, true),
  ('05f5935b-30e6-4b03-a0ba-2558ed32fd3b'::uuid, 'kemalkaramarmaris@gmail.com', 'NIP-MBR-EA2930', $n$İsimsiz$n$, null, false),
  ('3daa9e89-652e-497b-be13-51162476bf1a'::uuid, 'esracapaci@gmail.com', 'NIP-MBR-CFDF03', $n$İsimsiz$n$, null, false),
  ('ce5404a9-0829-438b-8910-7738ed406ffc'::uuid, 'portaltohell7@gmail.com', 'NIP-MBR-339C8C', $n$aidana orazbek$n$, '90905054387198', true),
  ('00bef576-3c27-40dd-919d-1fd587077065'::uuid, 'max.dechilly@gmail.com', 'NIP-MBR-262440', $n$Max Dechilly$n$, null, true),
  ('7123e608-f897-4774-aca5-8087cba9a6a3'::uuid, 'millsbenfield@hotmail.com', 'NIP-MBR-80B8FA', $n$camilla$n$, null, true);

  -- SAYIM KEMERI: beklenen sayilar tutmuyorsa hicbir sey yazma.
  select count(*), count(*) filter (where not yeni_mi), count(*) filter (where yeni_mi)
    into v_toplam, v_eslesen, v_yeni from kimlik;
  if v_toplam <> 71 or v_eslesen <> 66 or v_yeni <> 5 then
    raise exception 'kimlik listesi beklenen sayida degil: toplam=% eslesen=% yeni=%', v_toplam, v_eslesen, v_yeni;
  end if;

  -- Ikinci kez kosuyorsa (bag zaten kurulmus) sessizce cik — idempotent.
  select count(*) into v_bagli from public.customers where reserve_profile_id is not null;
  if v_bagli = 71 then
    raise notice 'kimlik bagi zaten kurulu (71/71), atlaniyor';
    return;
  end if;
  if v_bagli <> 0 then
    raise exception 'yarim kalmis durum: % musteri bagli, 0 ya da 71 bekleniyordu', v_bagli;
  end if;

  -- "eslesen" dedigimiz her satirin Order'da e-postasi gercekten var mi?
  select count(*) into v_catisan from kimlik k
   where not k.yeni_mi and not exists (select 1 from public.customers c where lower(c.email) = k.email);
  if v_catisan > 0 then raise exception '% eslesen satirin Order''da karsiligi yok', v_catisan; end if;

  -- "yeni" dedigimiz hicbiri Order'da zaten var olmamali (e-posta, telefon).
  select count(*) into v_catisan from kimlik k
   where k.yeni_mi and exists (select 1 from public.customers c
      where lower(c.email) = k.email or (k.phone is not null and c.phone = k.phone));
  if v_catisan > 0 then raise exception '% yeni satir Order''da zaten var (e-posta/telefon)', v_catisan; end if;

  -- Kodlar Order'da bos olmali (kolon yeni; ama bir gun elle girilmisse catismasin).
  select count(*) into v_catisan from kimlik k
   where exists (select 1 from public.customers c where c.member_code = k.member_code and lower(c.email) <> k.email);
  if v_catisan > 0 then raise exception '% uye kodu baska bir musteride', v_catisan; end if;

  -- 1) 66 mevcut musteriye bag + kod. Ad / telefon / puan DOKUNULMAZ.
  update public.customers c
     set reserve_profile_id = k.profile_id,
         member_code        = k.member_code
    from kimlik k
   where not k.yeni_mi
     and lower(c.email) = k.email;
  get diagnostics v_satir = row_count;
  if v_satir <> 66 then raise exception 'update % satir etkiledi, 66 bekleniyordu', v_satir; end if;

  -- 2) 5 yeni uye. Tier 'bronze': 16 Agustos'ta tasinan 60 satirla ayni.
  --    store_id varsayilani PARIS (kolon default'u). auth_user_id NULL: Order'da
  --    hesaplari yok; ilk giriste AuthContext e-postadan bulup baglar.
  insert into public.customers (name, email, phone, tier, reserve_profile_id, member_code)
  select k.name, k.email, k.phone, 'bronze', k.profile_id, k.member_code
    from kimlik k where k.yeni_mi;
  get diagnostics v_satir = row_count;
  if v_satir <> 5 then raise exception 'insert % satir ekledi, 5 bekleniyordu', v_satir; end if;

  -- SON KONTROL
  select count(*) filter (where reserve_profile_id is not null),
         count(*) filter (where member_code is not null),
         count(*)
    into v_bagli, v_kodlu, v_satir from public.customers;
  if v_bagli <> 71 or v_kodlu <> 71 or v_satir <> 80 then
    raise exception 'son kontrol tutmadi: bagli=% kodlu=% toplam=% (beklenen 71/71/80)', v_bagli, v_kodlu, v_satir;
  end if;
end $mig$;

-- ============================================================================
-- DOGRULAMA (once prova, sonra gercek; hepsi gecti)
--
-- PROVA (execute_sql, sonunda raise ile geri sarildi — kolon/trigger dahil
-- hicbir sey kalmadi, dogrulandi):
--   bagli=71 kodlu=71 toplam=80 | omer2 phone=NULL | aidana tel=90905054387198
--   esra adi=ESRA CAPACI (Isimsiz ile EZILMEDI) | kemal adi=Kemal Kara | omer1 tier=yeniyuz (dokunulmadi)
--
-- GERCEK: 80 musteri, 71 bagli, 71 kodlu, 9 bagsiz (Order'a ozgu 9 kisi).
--   Yeni 5: Omer Baycura (2. hesap), Kirill, aidana orazbek, Max Dechilly, camilla
--   Esra: tier=yeniyuz puan=72 kod=NIP-MBR-CFDF03 — puan/tier yerinde
--
-- KALKAN (trg_customers_guard_identity), gercek kimliklerle, geri sarildi:
--   1 musteri kendi kodunu / profil bagini degistirmeye calisti ....... degismedi
--   2 anon insert ile kod/profil verdi ................................. NULL/NULL
--   3 authenticated yeni uye (AuthContext yolu) kod verdi .............. NULL/NULL
--   4 personel kod yazdi ............................................... yazildi
--   5 musteri kendi avatarini guncelledi (kalkan normal isi bozmuyor) .. guncellendi
--   6 musteri kendi kodunu gorur (bilet icin) .......................... goruyor
--
-- DENETCI: yeni kolon/fonksiyon/trigger icin sifir bulgu.
-- MembersPage payload'i secili alan gonderiyor (name/email/phone/tier/
-- admin_discount/outstanding_balance/notes) — yeni kolonlara dokunmuyor.
-- AuthContext yeni 5 uyeyi ilk giriste e-postadan bulup auth_user_id baglar
-- (AuthContext.jsx:25-37); yeni satir acmaz.
--
-- NOT: Bagimsiz alt-ajan denetimi (3 okuyucu + 3 kirici) ortamin izin
-- katmanindaki bir ariza yuzunden kosamadi; her araç cagrisi reddedildi.
-- Uc mercek (veri / guvenlik / uygulama) yukaridaki testlerle elle kapatildi.
-- ============================================================================
