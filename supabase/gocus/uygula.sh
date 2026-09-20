#!/usr/bin/env bash
# ============================================================================
# GOCUS UYGULAYICI — supabase/migrations altindaki uygulanmamis dosyalari
# sirayla uygular ve uyguladigini veritabanindaki deftere yazar.
# ============================================================================
#
# NEDEN VAR: 20.09.2026'ya kadar 82 gocusun tamami ELLE uygulaniyordu —
# Claude bagliysa ve hatirlarsa. Bagli degilse gocus bekliyordu, kod ise
# main'e girmis oluyordu; yani repo ile veritabani sessizce ayrisiyordu.
# Bugun tam olarak bu oldu: iki gocus yazildi, uygulanamadi.
#
# NEDEN supabase CLI DEGIL: CLI dosya adinda 14 haneli damga bekliyor
# (YYYYMMDDHHMMSS). Bu repoda 82 dosya 8 haneli (YYYYMMDD_ad.sql). Adlari
# toptan degistirmek gecmisi bozar; CLI'yi zorlamak yerine kendi defterimizi
# tutuyoruz.
#
# KULLANIM
#   DB_URL='postgresql://...' ./supabase/gocus/uygula.sh          # uygula
#   DB_URL='postgresql://...' ./supabase/gocus/uygula.sh --liste  # yalniz goster
#
# ILK CALISTIRMA: defter yoksa olusturulur ve BASLANGIC'tan ONCEKI butun
# dosyalar "uygulanmis" isaretlenir — CALISTIRILMADAN. Cunku onlar zaten
# elle uygulandi; tekrar kosturmak canli veriyi bozardi.

set -euo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIZIN="$KOK/supabase/migrations"

# Bu dosyadan ITIBAREN olanlar uygulanacak; oncekiler zaten canlida.
# Yeni bir kuruluma (ikinci isletme) tum semayi basmak icin BASLANGIC=""
# verilir — o zaman defter bos kalir ve hepsi sirayla uygulanir.
BASLANGIC="${NIP_GOCUS_BASLANGIC-20260920_birim_maliyet_onarimi.sql}"

: "${DB_URL:?DB_URL gerekli (postgresql://...)}"

psqlc() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qtAX "$@"; }

# ---- Defter ----------------------------------------------------------------
psqlc -c "
  create table if not exists public.nip_gocusler (
    dosya       text primary key,
    uygulandi   timestamptz not null default now(),
    saniye      numeric
  );
  comment on table public.nip_gocusler is
    'Hangi gocus dosyasi ne zaman uygulandi. supabase/gocus/uygula.sh yazar.';
" >/dev/null

ILK_KURULUM=0
if [ "$(psqlc -c 'select count(*) from public.nip_gocusler')" = "0" ]; then
  ILK_KURULUM=1
fi

DOSYALAR=$(cd "$DIZIN" && ls -1 *.sql | sort)

# ---- Ilk kurulum: eskiler calistirilmadan isaretlenir -----------------------
if [ "$ILK_KURULUM" = "1" ] && [ -n "$BASLANGIC" ]; then
  echo "Defter bos. '$BASLANGIC' oncesi dosyalar CALISTIRILMADAN uygulanmis isaretleniyor."
  SAY=0
  for f in $DOSYALAR; do
    if [[ "$f" < "$BASLANGIC" ]]; then
      psqlc -c "insert into public.nip_gocusler(dosya) values ('$f') on conflict do nothing" >/dev/null
      SAY=$((SAY+1))
    fi
  done
  echo "  $SAY dosya isaretlendi (elle uygulanmis gecmis)."
fi

# ---- Bekleyenler -----------------------------------------------------------
UYGULANAN=$(psqlc -c "select dosya from public.nip_gocusler")
BEKLEYEN=""
for f in $DOSYALAR; do
  if ! grep -qxF "$f" <<<"$UYGULANAN"; then BEKLEYEN="$BEKLEYEN $f"; fi
done
BEKLEYEN=$(echo $BEKLEYEN)

if [ -z "$BEKLEYEN" ]; then
  echo "Bekleyen gocus yok — veritabani repo ile ayni."
  exit 0
fi

echo "Bekleyen gocusler:"
for f in $BEKLEYEN; do echo "  · $f"; done

if [ "${1-}" = "--liste" ]; then exit 0; fi

# ---- Uygula ----------------------------------------------------------------
# Her dosya KENDI islemi icinde: biri patlarsa oncekiler durur, o dosya
# yarim kalmaz ve deftere yazilmaz. Ikinci calistirmada oradan devam eder.
for f in $BEKLEYEN; do
  echo ""
  echo "── $f"
  BAS=$(date +%s)
  if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -qX --single-transaction -f "$DIZIN/$f"; then
    echo "HATA: $f uygulanamadi. Sonrakiler calistirilmadi." >&2
    exit 1
  fi
  SN=$(( $(date +%s) - BAS ))
  psqlc -c "insert into public.nip_gocusler(dosya, saniye) values ('$f', $SN)
            on conflict (dosya) do update set uygulandi = now(), saniye = $SN" >/dev/null
  echo "   uygulandi (${SN}s)"
done

echo ""
echo "Bitti. Veritabani repo ile ayni."
