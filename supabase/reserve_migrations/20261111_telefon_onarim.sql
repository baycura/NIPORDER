-- Rezervasyon sitesi (RESERVE): bozuk kaydedilmis telefon numaralarinin onarimi.
--
-- Sebep (site, 11.11.2026'da duzeltildi): uyenin numarasi rezervasyon formuna
-- on-doldurulurken ulke kodu acgozlu ayriliyordu ("+9053" + kalan). Secim
-- kutusunda o kod olmadigi icin "+90" seciliyor, numara iki hane eksik
-- kaydediliyordu. Ayrica numara kutusuna ulke kodu ya da 0 ile yazilan numara
-- "+90+90…" / "+900…" olarak kaliyordu. 20 rezervasyonun 10'u bozuktu.
--
-- Onarim yalniz KESIN olan satirlara dokunur; hicbir satir kaldirilmaz:
--   1) "+90+90XXXXXXXXXX" / "+90+5XXXXXXXXX" gibi fazla isaretli ama rakamlari
--      tam olan numara -> "+90XXXXXXXXXX"
--   2) "+900XXXXXXXXXX" -> "+90XXXXXXXXXX"
--   3) Iki hane eksik rezervasyon numarasi: uyenin profilindeki dogru numara,
--      son haneleri ayni ise.
-- Tekrar calistirilabilir (ikinci calistirmada degisecek satir kalmaz).

-- 1) cift ulke kodu
update public.profiles
   set phone = '+90' || substr(regexp_replace(phone, '\D', '', 'g'), 5)
 where regexp_replace(phone, '\D', '', 'g') ~ '^9090[1-9][0-9]{9}$';
update public.reservations
   set phone = '+90' || substr(regexp_replace(phone, '\D', '', 'g'), 5)
 where regexp_replace(phone, '\D', '', 'g') ~ '^9090[1-9][0-9]{9}$';

-- 2) ulke kodundan sonra 0
update public.profiles
   set phone = '+90' || substr(regexp_replace(phone, '\D', '', 'g'), 4)
 where regexp_replace(phone, '\D', '', 'g') ~ '^900[1-9][0-9]{9}$';
update public.reservations
   set phone = '+90' || substr(regexp_replace(phone, '\D', '', 'g'), 4)
 where regexp_replace(phone, '\D', '', 'g') ~ '^900[1-9][0-9]{9}$';

-- 1b) rakamlari tam, arada fazla isaret olan numara ("+90+5…", bosluk, tire)
update public.profiles
   set phone = '+' || regexp_replace(phone, '\D', '', 'g')
 where phone !~ '^\+[0-9]+$' and regexp_replace(phone, '\D', '', 'g') ~ '^90[1-9][0-9]{9}$';
update public.reservations
   set phone = '+' || regexp_replace(phone, '\D', '', 'g')
 where phone !~ '^\+[0-9]+$' and regexp_replace(phone, '\D', '', 'g') ~ '^90[1-9][0-9]{9}$';

-- 3) iki hane eksik rezervasyon numarasi <- uyenin profili (son haneler ayni)
update public.reservations r
   set phone = p.phone
  from public.profiles p
 where p.id = r.profile_id
   and r.phone ~ '^\+90'
   and r.phone !~ '^\+90[1-9][0-9]{9}$'
   and p.phone ~ '^\+90[1-9][0-9]{9}$'
   and length(regexp_replace(r.phone, '\D', '', 'g')) between 9 and 11
   and right(p.phone, length(regexp_replace(r.phone, '\D', '', 'g')) - 2)
       = substr(regexp_replace(r.phone, '\D', '', 'g'), 3);
