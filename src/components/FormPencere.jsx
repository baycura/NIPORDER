import Ikon from "./Ikon.jsx";

// YONETIM FORM PENCERESI — alttan acilan koyu pencere.
//
// Ayni pencere yedi sayfada kopyaydi (Menü, Raf, Stok, Fatura, Üyeler,
// Personel, Sabit Giderler). Uc sorun:
//   1) Karartiya dokunmak pencereyi kapatiyordu: 25 alanli urun formu ya da
//      faturadan okunan kalemler tek yanlis dokunusla siliniyordu.
//   2) Kapat dugmesi yoktu; tek cikis en dipteki "İptal" idi.
//   3) Uzun formda baslik kayip gidiyordu.
// Simdi: karartma KAPATMAZ, baslik ve 44 px kapat dugmesi ustte sabit.
//
//   <FormPencere title="Yeni Ürün" onClose={...} en={520} boy="92vh">…</FormPencere>
//
// Uzun formun dugme satiri altta sabit kalsin diye satira `altlikStil` verilir:
//   <div style={{ display: "flex", gap: 8, ...altlikStil }}> İptal / Kaydet </div>

export const altlikStil = {
  position: "sticky", bottom: 0, zIndex: 1, background: "#161616",
  borderTop: "1px solid #2A2A2A", marginTop: 14, marginBottom: -20,
  padding: "12px 0 calc(12px + env(safe-area-inset-bottom))",
};

export default function FormPencere({ title, children, onClose, en = 500, boy = "90vh" }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex",
               alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px 16px 0 0",
                    width: "100%", maxWidth: en, maxHeight: boy, overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: "#161616", display: "flex", alignItems: "center",
                      gap: 10, padding: "8px 8px 8px 20px", borderBottom: "1px solid #2A2A2A", borderRadius: "16px 16px 0 0" }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, color: "#F0EDE8" }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Kapat"
            style={{ width: 44, height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                     background: "transparent", border: "none", color: "#8A8A86", cursor: "pointer", borderRadius: 10 }}>
            <Ikon ad="kapat" boy={17} />
          </button>
        </div>
        <div style={{ padding: "16px 20px 20px" }}>{children}</div>
      </div>
    </div>
  );
}
