-- ============================================================================
-- MALZEME GRUPLARI                                  20260916_malzeme_gruplari
-- ============================================================================
-- SAHIP: "Stok girme kisminda ayni menudeki gibi ayirsan: cinler, viskiler,
--         fici biralar, siseler gibi ilerlesek."
--
-- Stok Yonetimi 146 malzemeyi tek duz alfabetik liste olarak gosteriyordu;
-- "cinler nerede" diye aramak icin listeyi bastan sona taramak gerekiyordu.
-- Urunlerin kategorisi var (categories), malzemelerin yoktu.
--
-- ingredients.grup: serbest metin. Menudeki kategori mantiginin malzeme
-- tarafindaki karsiligi. Serbest metin secildi cunku bar her sezon yeni bir
-- raf acabiliyor (ornek "Sake", "Kombucha"); ayri tablo + yonetim ekrani bu is
-- icin agir kalirdi. Ekran gruplari bu kolondan toplar, bos olan "Diger"e duser.
--
-- ILK DOLDURMA: asagidaki siniflandirma bir kerelik. Isimden okuyor, sonra
-- ekrandan tek tek duzeltilebiliyor. Tuzaklar:
--   * Once harf cevirisi, SONRA kucuk harf. lower('İ') UTF-8'de 'i̇' (i +
--     birlesik nokta) uretiyor ve '%temizlik%' kacıyor. Ayni sekilde 'FIÇI'
--     lower'da 'fiçi' olup '%fıçı%' desenini tutmuyor.
--   * "Bottega Meloncino" icinde "cin" geciyor — likor kurali cinden ONCE
--     calisir, yoksa likor cin rafina duserdi. Cin/rom/tekila kelime siniriyla
--     aranir ('(^|[^a-z])(cin|gin)([^a-z]|$)').
--   * "Kahve Likoru" ve "Koskenkorva Espresso Liqueur" kahve degil likordur;
--     likor kurali kahveden once gelir.
--   * "Laktozsuz Sut" icinde "su" geciyor — mesrubat kurali bare '%su%'
--     kullanmaz, yalniz tam ad 'su' ve 'maden suyu' gibi desenler.
--
-- Geri alma:
--   alter table public.ingredients drop column grup;
-- ============================================================================

alter table public.ingredients add column if not exists grup text;

comment on column public.ingredients.grup is
  'Stok ekranindaki raf adi (Cin, Viski, Fici Bira, Sise Bira...). Serbest '
  'metin; bos ise ekran "Diger" gosterir. Menudeki kategori mantiginin '
  'malzeme tarafindaki karsiligi.';

-- Ilk doldurma: yalniz grubu bos olan satirlar (tekrar calistirilabilir)
with n as (
  select i.id, i.is_consumable, i.takeaway_role,
         lower(translate(i.name, 'İIıÇçÖöŞşĞğÜüÂâÎîÛûÄäÉé', 'IIiCcOoSsGgUuAaIiUuAaEe')) as a
    from public.ingredients i
   where i.grup is null
)
update public.ingredients i
   set grup = case
      when n.a in ('limon','limon dilimi','portakal','salatalik','nane')            then 'Süt & Yiyecek'
      when n.takeaway_role is not null or n.is_consumable
        or n.a like any (array['%mop%','%tuvalet%','%havlu%','%towel%','%cop torbas%','%temizlik%','%pecete%','%bardak%','%pipet%','%karistirici%','%kapak%'])
                                                                                     then 'Sarf & Temizlik'
      when n.a like '%fici%' or n.a like '%co2%'                                     then 'Fıçı Bira'
      when n.a like '%bira%' or n.a like any (array['%corona%','%heineken%','%stella%','%miller%','%bitburger%','%mgd%','%serce%','%efes%'])
                                                                                     then 'Şişe Bira'
      when n.a like '%sarap%' or n.a like '%prosecco%' or n.a like '%cdr%'           then 'Şarap & Köpüklü'
      when n.a like any (array['%likor%','%liqueur%','%aperol%','%campari%','%vermut%','%jager%','%limoncello%','%bottega%','%triple sec%','%angostura%','%martini%','%bitter%','%rosso%','%shot%','%koskenkorva%','%irish cream%'])
                                                                                     then 'Likör & Aperitif'
      when n.a like any (array['%kahve%','%cay%','%espresso%','%cekirdek%','%filtre%','%raf:%'])
                                                                                     then 'Kahve & Çay'
      when n.a like '%viski%' or n.a like any (array['%chivas%','%glenfiddich%','%glenlivet%','%macallan%','%monkey shoulder%','%jameson%','%jim beam%','%nikka%','%teachers%','%aberlour%','%tamnavulin%','%whisk%'])
                                                                                     then 'Viski'
      when n.a ~ '(^|[^a-z])(cin|gin)([^a-z]|$)'                                     then 'Cin'
      when n.a like '%votka%' or n.a like '%vodka%'                                  then 'Votka'
      when n.a ~ '(^|[^a-z])(rom|tekila|tequila)([^a-z]|$)'                          then 'Rom & Tekila'
      when n.a like any (array['%kola%','%tonik%','%soda%','%maden suyu%','%fever tree%','%uludag%']) or n.a = 'su'
                                                                                     then 'Meşrubat & Su'
      when n.a like any (array['%suyu%','%limonata%','%surub%','%surup%','%pure%','%premix%','%sos%'])
                                                                                     then 'Meyve Suyu & Şurup'
      when n.a like any (array['%sut%','%krema%','%yumurta%','%kakao%','%kruvasan%']) then 'Süt & Yiyecek'
      else null                                                                      -- ekranda "Diger"
   end
  from n
 where i.id = n.id;
