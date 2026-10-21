import { useEffect, useRef, useState } from "react";
import { doner } from "./supabase.js";
import { C, S, Baslik, Hata, Yukleniyor, hataMetni } from "./ortak.jsx";

// AYARLAR (yalniz admin) — Telegram botu. Bot anahtari Supabase Vault'ta
// durur ('doner_tg_token'); buradan yalniz var/yok gorunur, anahtar hic
// gelmez. Grup baglama: "Kod al" -> grupta "/baglan 123456" -> "Grubu bul".
// Sunucu getUpdates ile yalniz grup/supergruptaki dogru kodu kabul eder
// (20261022_doner_tg_duzeltme).
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

export default function Ayarlar() {
  const [d, setD] = useState(null);
  const [hata, setHata] = useState(null);
  const [bilgi, setBilgi] = useState("");
  const [busy, setBusy] = useState(false);
  const acik = useRef(true);
  useEffect(() => () => { acik.current = false; }, []);

  const yukle = () => doner.rpc("doner_tg_durum").then(({ data, error }) => {
    if (!acik.current) return;
    if (error) setHata(hataMetni(error)); else setD(data || {});
  });
  useEffect(() => { yukle(); }, []);

  const kodAl = async () => {
    setBusy(true); setHata(null); setBilgi("");
    const { error } = await doner.rpc("doner_tg_kod_al");
    setBusy(false);
    if (error) setHata(hataMetni(error)); else yukle();
  };

  // Bir cagri en fazla 100 Telegram guncellemesine bakar; kuyruk kalabaliksa
  // sunucu offset'i ilerletir, burada en fazla 3 sayfa denenir.
  const grupBul = async () => {
    setBusy(true); setBilgi("Aranıyor…"); setHata(null);
    try {
      for (let sayfa = 0; sayfa < 3; sayfa++) {
        const { error } = await doner.rpc("doner_tg_grup_bul");
        if (error) throw error;
        let sonuc = null;
        for (let i = 0; i < 8 && acik.current; i++) {
          await bekle(1500);
          const { data, error: e2 } = await doner.rpc("doner_tg_grup_bul_sonuc");
          if (e2) throw e2;
          if (data?.bekle) continue;
          sonuc = data; break;
        }
        if (!acik.current) return;
        if (!sonuc) { setBilgi("Telegram yanıt vermedi. Biraz sonra yeniden dene."); return; }
        if (sonuc.bagli) { setBilgi(`Bağlandı: ${sonuc.ad}`); yukle(); return; }
        if (sonuc.hata) { setHata(sonuc.hata); setBilgi(""); return; }
        if (sonuc.bulunamadi && sonuc.mesaj >= 100) continue;   // sonraki sayfa
        setBilgi(`Kod bulunamadı. Grupta tam olarak "/baglan ${sonuc.kod || d?.kod || ""}" yaz, sonra yeniden dene.`);
        return;
      }
      setBilgi("Çok fazla eski mesaj var. Bir kez daha \"Grubu bul\"a dokun.");
    } catch (e) { if (acik.current) { setHata(hataMetni(e)); setBilgi(""); } } finally { if (acik.current) setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setHata(null);
    const { error } = await doner.rpc("doner_tg_test");
    setBusy(false);
    if (error) setHata(hataMetni(error)); else { setBilgi("Test mesajı gönderildi; gruba bak."); yukle(); }
  };
  const cikar = async () => {
    if (!confirm("Grup bağlantısı kaldırılsın mı? Mesajlar durur.")) return;
    const { error } = await doner.rpc("doner_tg_grup_cikar");
    if (error) setHata(hataMetni(error)); else { setBilgi("Grup bağlantısı kaldırıldı."); yukle(); }
  };

  const Adim = ({ n, children }) => (
    <div style={{ display: "flex", gap: 10, fontSize: 13, lineHeight: 1.6, marginTop: 6 }}>
      <div style={{ width: 22, height: 22, borderRadius: 11, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{n}</div>
      <div style={{ color: C.ink }}>{children}</div>
    </div>
  );
  const kod = { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, background: "#0C0C0C", border: `1px solid ${C.line}`, borderRadius: 6, padding: "2px 6px", wordBreak: "break-all" };

  return (
    <div>
      <Baslik baslik="Ayarlar" alt="Telegram botu" />
      <Hata metin={hata} />
      {!d && !hata && <Yukleniyor />}
      {d && (
        <>
          <div style={S.kart}>
            <div style={{ ...S.etiket, marginBottom: 8 }}>TELEGRAM BOTU</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, lineHeight: 2 }}>
              <span style={{ color: C.muted }}>Bot anahtarı</span><b style={{ color: d.token_var ? C.ink : C.down }}>{d.token_var ? "var" : "yok"}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, lineHeight: 2 }}>
              <span style={{ color: C.muted }}>Grup</span><b style={{ color: d.chat ? C.ink : C.down }}>{d.chat ? (d.chat_ad || d.chat) : "bağlı değil"}</b>
            </div>
            {!d.token_var && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Bot anahtarı bir kez, Supabase'de saklanır (uygulamaya ve sohbete yazılmaz):</div>
                <Adim n="1">Telegram'da <b>@BotFather</b> → <span style={kod}>/newbot</span> → ad ver (örn. NIP Döner) → anahtarı kopyala. Kafe botunun anahtarını <b>kullanma</b>.</Adim>
                <Adim n="2">Supabase → SQL Editor'de çalıştır: <span style={kod}>select vault.create_secret('ANAHTAR', 'doner_tg_token');</span></Adim>
                <Adim n="3">Bu sayfayı yenile; "Bot anahtarı: var" olur.</Adim>
              </div>
            )}
            {d.token_var && !d.chat && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                <Adim n="1">Telegram'da bir grup aç (örn. "Döner"), ortakları ve personeli ekle.</Adim>
                <Adim n="2">Botu gruba ekle.</Adim>
                <Adim n="3">Buradan "Kod al"a dokun.{d.kod && <> Kodun: <b style={{ fontSize: 15, letterSpacing: 1 }}>{d.kod}</b> (30 dk geçerli)</>}</Adim>
                <Adim n="4">Grupta yaz: <span style={kod}>/baglan {d.kod || "KOD"}</span></Adim>
                <Adim n="5">Buradan "Grubu bul"a dokun.</Adim>
              </div>
            )}
            {d.token_var && d.chat && d.kod && (
              <div style={{ marginTop: 10, fontSize: 13, color: C.ink }}>Yeni grup için grupta yaz: <span style={kod}>/baglan {d.kod}</span>, sonra "Grubu yeniden bul".</div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {d.token_var && <button onClick={kodAl} disabled={busy} style={S.dugme(!d.chat && !d.kod)}>{d.kod ? "Yeni kod al" : "Kod al"}</button>}
              {d.token_var && d.kod && <button onClick={grupBul} disabled={busy} style={S.dugme(!d.chat)}>{busy ? "Bekle…" : d.chat ? "Grubu yeniden bul" : "Grubu bul"}</button>}
              {d.token_var && d.chat && <button onClick={test} disabled={busy} style={S.dugme(true)}>Test mesajı</button>}
              {d.chat && <button onClick={cikar} disabled={busy} style={{ ...S.dugme(false), color: C.down }}>Bağlantıyı kaldır</button>}
            </div>
            {bilgi && <div style={{ fontSize: 13, marginTop: 10, color: C.ink }}>{bilgi}</div>}
            {d.token_var && (
              <div style={{ fontSize: 12, color: C.faint, marginTop: 10, lineHeight: 1.6 }}>
                Anahtarı değiştirmek için (BotFather'da /revoke sonrası) SQL Editor: <span style={kod}>select vault.update_secret((select id from vault.secrets where name = 'doner_tg_token'), 'YENI_ANAHTAR');</span>
              </div>
            )}
          </div>

          <div style={{ ...S.kart, marginTop: 10 }}>
            <div style={{ ...S.etiket, marginBottom: 6 }}>NE GÖNDERİR</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
              🧾 Mutfağa düşen her sipariş (QR ve kafe), kalemleriyle; değişiklik ve iptal.<br />
              💸 Girilen her gider: tutar, kim ödedi, kim girdi. Düzeltme ve silme de: kim yaptı.<br />
              🧮 Gün sonu girilince günün özeti: tezgah, QR, kafe, gider, net.<br />
              ⏰ 23:00'te gün sonu girilmediyse hatırlatma.
            </div>
          </div>

          <div style={{ ...S.kart, marginTop: 10, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", fontSize: 11, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Son mesajlar</div>
            {(d.son || []).length === 0 && <div style={{ padding: 16, textAlign: "center", color: C.faint, fontSize: 13, borderTop: `1px solid ${C.line}` }}>Henüz mesaj yok.</div>}
            {(d.son || []).map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 14px", borderTop: `1px solid ${C.line}`, fontSize: 12 }}>
                <span style={{ color: C.muted, width: 78, flexShrink: 0 }}>{m.zaman}</span>
                <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: C.ink }}>{m.metin}</span>
                <span style={{ color: m.durum === "ulasti" ? C.ink : m.durum === "basarisiz" ? C.down : C.muted, flexShrink: 0 }} title={m.hata || ""}>{m.durum === "ulasti" ? "ulaştı" : m.durum === "basarisiz" ? "başarısız" : "yolda"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
