import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { ayGecerli, ayKaydir, guncelAy, hakedisRaporu, mutfakRaporUrl, panoyaKopyala } from "../../lib/hakedis.js";
import HakedisOzeti, { PaylasSatiri, C, cv, hv, kart } from "../../components/HakedisOzeti.jsx";
import Ikon from "../../components/Ikon.jsx";

// Mutfaga Odenecek — NIP sahibinin hakedis ekrani.
//
// NIP kendi menusunden doner mutfaginin urunlerini de satar; o urunlerin
// cirosu ay sonu mutfaga odenir. Rakam nip_mutfak_hakedis_raporu RPC'sinden
// gelir (lib/hakedis.js); mutfak ayni raporu /mutfak-rapor'da kendi pano
// hesabiyla gorur. Eski inter_company_settlement okumasi ve haftalik gorunum
// kalkti: mutabakat birimi takvim ayidir, ay sonu odeme aylik.
//
// Hizli yol: ac -> rakam -> "WhatsApp'a gonder". Ay ?ay=YYYY-MM ile URL'de
// durur; "gecen ay" baglantisi paylasilabilir.

export default function SettlementPage() {
  const [params, setParams] = useSearchParams();
  const buAy = guncelAy();
  const ayParam = params.get("ay");
  const ay = ayGecerli(ayParam) && ayParam <= buAy ? ayParam : buAy;
  const setAy = (a) => setParams(a === buAy ? {} : { ay: a }, { replace: true });

  const [rapor, setRapor] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(null);
  const [guncelleme, setGuncelleme] = useState(null);
  const [linkDurum, setLinkDurum] = useState("");
  // Aylar arasinda hizli gecerken eski cevap yeninin ustune yazmasin
  const istekNo = useRef(0);

  const yukle = useCallback(async () => {
    const no = ++istekNo.current;
    setYukleniyor(true);
    const r = await hakedisRaporu(supabase, ay);
    if (no !== istekNo.current) return;
    setRapor(r.rapor);
    setHata(r.hata);
    if (r.rapor) setGuncelleme(new Date());
    setYukleniyor(false);
  }, [ay]);
  useEffect(() => { yukle(); }, [yukle]);

  useEffect(() => {
    if (!linkDurum) return undefined;
    const t = setTimeout(() => setLinkDurum(""), 2000);
    return () => clearTimeout(t);
  }, [linkDurum]);

  const mutfakLink = mutfakRaporUrl(ay);
  const cip = (a, l) => (
    <button key={a} type="button" onClick={() => setAy(a)} style={{
      padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: cv,
      background: ay === a ? C.accent : "transparent", color: ay === a ? "#000" : C.muted,
      border: `1px solid ${ay === a ? C.accent : C.cardLine}`,
    }}>{l}</button>
  );

  return (
    <div style={{ padding: 16, fontFamily: cv, color: C.ink, maxWidth: 900, margin: "0 auto", paddingBottom: 80 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontFamily: hv, fontWeight: 900, fontSize: 34, margin: 0, letterSpacing: 1 }}>
          <Ikon ad="mutfakodeme" boy={22} style={{ marginRight: 10 }} />MUTFAĞA ÖDENECEK
        </h1>
        <button type="button" onClick={yukle} title="Yenile" style={{ background: "none", border: `1px solid ${C.cardLine}`, color: C.muted, borderRadius: 6, padding: "4px 8px", cursor: "pointer", display: "inline-flex" }}><Ikon ad="yenile" boy={13} /></button>
      </div>
      <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 14px", lineHeight: 1.5 }}>
        NIP'te satılan döner mutfağı ürünlerinin ay sonu ödenecek tutarı. Mutfak aynı raporu kendi pano hesabıyla görür.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {cip(buAy, "Bu ay")}
        {cip(ayKaydir(buAy, -1), "Geçen ay")}
      </div>

      <HakedisOzeti
        rapor={rapor} ay={ay} onAy={setAy} yukleniyor={yukleniyor} hata={hata} onYenile={yukle}
        taraf="nip" guncelleme={guncelleme}
        aksiyonlar={<PaylasSatiri rapor={rapor} />}
      />

      {/* Mutfagin girisi: NIP hesabi degil, kendi pano hesabi. /login'e degil bu adrese girsinler. */}
      <div style={{ ...kart, marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>Mutfağın raporu</div>
          <div style={{ fontSize: 13, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mutfakLink.replace(/^https?:\/\//, "")}</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>Pano hesabıyla girerler; NIP personel girişi gerekmez.</div>
        </div>
        <button type="button" onClick={async () => setLinkDurum((await panoyaKopyala(mutfakLink)) ? "ok" : "yok")} style={{
          minHeight: 40, padding: "0 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: cv,
          background: "transparent", color: C.ink, border: `1px solid ${C.cardLine}`, display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <Ikon ad="kopyala" boy={14} />{linkDurum === "ok" ? "Kopyalandı" : linkDurum === "yok" ? "Kopyalanamadı" : "Bağlantıyı kopyala"}
        </button>
      </div>
    </div>
  );
}
