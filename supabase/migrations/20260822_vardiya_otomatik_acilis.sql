-- VARDIYA OTOMATIK ACILIS: "vardiyaya girmeyi unutuyorlar" sorununun koku.
--
-- Iki haftada topu 5 vardiya girisi yapildi; satislar staff_id ile kayitli
-- oldugu halde vardiya kaydi olmadigi icin gece Telegram ozeti hic gitmedi
-- ve Vardiyalar ekrani "kayit yok" gosterdi. Cozum: personelin o isletme
-- gunundeki ILK islemi (siparis acma ya da tahsilat) vardiyayi kendiliginden
-- acar. Elle "Vardiyaya Gir" dugmesi duruyor — erken gelen tam saatini
-- kaydetmek icin kullanabilir; unutan icin sistem kendi acar.
--
-- Isletme gunu 03:00'te biter; gun anahtari Turkiye saatiyle hesaplanir
-- (istemcideki businessDayKey ile ayni sonuc — telefonlar TR saatinde).
-- shifts(staff_id, date) uzerinde uq_shifts_staff_date tekil indeksi var;
-- ayni gun ikinci islem 'do nothing' ile sessizce gecer.

create or replace function public.shift_auto_checkin()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare j jsonb; sid uuid; stid uuid;
begin
  j := to_jsonb(new);
  sid := (j->>'staff_id')::uuid;
  if sid is null then return new; end if;
  stid := coalesce((j->>'origin_store_id')::uuid, (j->>'store_id')::uuid);
  insert into public.shifts (staff_id, date, checked_in_at, status, store_id)
  values (sid, ((now() at time zone 'Europe/Istanbul') - interval '3 hours')::date, now(), 'active', stid)
  on conflict (staff_id, date) do nothing;
  return new;
end $$;

-- Siparis acilinca ya da (kasiyer damgasiyla) kapaninca
drop trigger if exists trg_shift_auto_checkin_orders on public.orders;
create trigger trg_shift_auto_checkin_orders
  after insert or update of staff_id, status on public.orders
  for each row execute function public.shift_auto_checkin();

-- Odeme kaydi girilince (tahsil eden)
drop trigger if exists trg_shift_auto_checkin_payments on public.payments;
create trigger trg_shift_auto_checkin_payments
  after insert on public.payments
  for each row execute function public.shift_auto_checkin();
