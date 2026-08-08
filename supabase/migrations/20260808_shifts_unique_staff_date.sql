-- Vardiyaya Gir upsert'i staff_id+date uzerinden calisir; tekillik kurali eksikti
create unique index if not exists uq_shifts_staff_date on public.shifts (staff_id, date);
