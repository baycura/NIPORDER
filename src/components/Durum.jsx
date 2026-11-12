// PANEL DURUM KUTULARI — okunamadi / yukleniyor / bos.
//
// Rapor sayfalari sorgu hatasini "₺0" ya da "henüz kayıt yok" diye
// gosteriyordu: sahip baglanti koptugunda bos gun saniyordu. Hata ile bos
// durum AYRI gorunur; hatada sebep ve "Tekrar dene" vardir.
//
//   <Okunamadi baslik="Vardiyalar okunamadı." hata={metin} onTekrar={fn}/>
//   <Yukleniyor/>            <Bos>Bu dönemde kayıt yok.</Bos>

const cv = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const kutu = {
  background: "#161616", border: "1px solid #2A2A2A", borderRadius: 12, padding: 16,
  fontFamily: cv, color: "#F0EDE8",
};

export function Okunamadi({ baslik = "Bilgi okunamadı.", hata, onTekrar, stil = null }) {
  return (
    <div role="alert" style={{ ...kutu, borderColor: "#C87A6A", ...stil }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{baslik}</div>
      <div style={{ fontSize: 13, color: "#B5B0AA", marginTop: 4, lineHeight: 1.5 }}>
        {hata || "İnternet bağlantını kontrol et."}
      </div>
      {onTekrar && (
        <button type="button" onClick={onTekrar} style={{
          marginTop: 12, minHeight: 44, padding: "0 16px", background: "#FFFFFF", color: "#000", border: "none",
          borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
        }}>Tekrar dene</button>
      )}
    </div>
  );
}

export function Yukleniyor({ metin = "Yükleniyor…", stil = null }) {
  return <div aria-busy="true" style={{ ...kutu, color: "#8A8A86", fontSize: 13, ...stil }}>{metin}</div>;
}

export function Bos({ children, stil = null }) {
  return <div style={{ ...kutu, color: "#8A8A86", fontSize: 13, lineHeight: 1.6, ...stil }}>{children}</div>;
}
