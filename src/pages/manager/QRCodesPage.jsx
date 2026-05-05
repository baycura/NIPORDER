import { useState } from "react";

const cv = "\u0027Coolvetica\u0027,\u0027Bebas Neue\u0027,sans-serif";
const cvc = "\u0027Coolvetica Condensed\u0027,\u0027Barlow Condensed\u0027,sans-serif";

const PARIS_URL = "https://order.notinparis.me/menu?store=paris";
const DONER_URL = "https://order.notinparis.me/menu?store=doner";

// QR generator service (no npm dep, just an image URL)
const qrSrc = (url, size = 600) =>
  "https://api.qrserver.com/v1/create-qr-code/?size=" + size + "x" + size + "&format=png&margin=10&data=" + encodeURIComponent(url);

export default function QRCodesPage() {
  const [printMode, setPrintMode] = useState(null); // null | "paris" | "doner" | "both"

  const printOne = (which) => {
    setPrintMode(which);
    setTimeout(() => {
      window.print();
      setPrintMode(null);
    }, 100);
  };

  const downloadQR = (url, filename) => {
    const link = document.createElement("a");
    link.href = qrSrc(url, 1000);
    link.download = filename;
    link.target = "_blank";
    link.click();
  };

  const Card = ({ title, subtitle, url, color }) => (
    <div className="qr-card" style={{
      background: "#111", padding: 24, borderRadius: 12, border: "2px solid " + color,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 16, flex: 1, minWidth: 280,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: cvc, fontSize: 28, letterSpacing: "3px", color }}>{title}</div>
        <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>{subtitle}</div>
      </div>
      <div style={{ background: "#fff", padding: 12, borderRadius: 8 }}>
        <img src={qrSrc(url, 400)} alt={title + " QR"} style={{ display: "block", width: 280, height: 280 }} />
      </div>
      <div style={{ color: "#aaa", fontSize: 11, fontFamily: "monospace", textAlign: "center", wordBreak: "break-all", maxWidth: 280 }}>{url}</div>
      <div className="qr-actions" style={{ display: "flex", gap: 8, width: "100%" }}>
        <button onClick={() => printOne(title.toLowerCase().includes("paris") ? "paris" : "doner")} style={{ flex: 1, padding: "10px 16px", background: color, color: "#000", border: "none", borderRadius: 6, fontFamily: cvc, fontSize: 13, letterSpacing: "1px", cursor: "pointer" }}>YAZDIR</button>
        <button onClick={() => downloadQR(url, title.replace(/\s+/g, "_") + "_QR.png")} style={{ flex: 1, padding: "10px 16px", background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 6, fontFamily: cvc, fontSize: 13, letterSpacing: "1px", cursor: "pointer" }}>\u0130ND\u0130R</button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 24, fontFamily: cv, color: "#fff", minHeight: "100vh", background: "#000" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .qr-print, .qr-print * { visibility: visible; }
          .qr-print { position: absolute; left: 0; top: 0; width: 100%; padding: 40px; background: #fff !important; color: #000 !important; }
          .qr-print .qr-card { background: #fff !important; color: #000 !important; border: 2px solid #000 !important; page-break-inside: avoid; box-shadow: none !important; }
          .qr-print .qr-card div { color: #000 !important; }
          .qr-actions { display: none !important; }
          .qr-print-hint { display: none !important; }
        }
      `}</style>

      <div className="qr-print-hint" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 32, fontFamily: cvc, letterSpacing: "2px", margin: 0 }}>QR KODLAR</h1>
          <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>Masalara koymak i\u00e7in yazd\u0131r veya indir</div>
        </div>
        <button onClick={() => printOne("both")} style={{ padding: "12px 20px", background: "#C8973E", color: "#000", border: "none", fontFamily: cvc, fontSize: 14, letterSpacing: "1px", cursor: "pointer", borderRadius: 8 }}>HER \u0130K\u0130S\u0130N\u0130 YAZDIR</button>
      </div>

      <div className={"qr-print"} style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "stretch" }}>
        {(printMode === null || printMode === "paris" || printMode === "both") && (
          <Card title="PARIS" subtitle="\u00d6n / Front" url={PARIS_URL} color="#C8973E" />
        )}
        {(printMode === null || printMode === "doner" || printMode === "both") && (
          <Card title="BERL\u0130N" subtitle="Arka / Back" url={DONER_URL} color="#E0644A" />
        )}
      </div>

      <div className="qr-print-hint" style={{ marginTop: 32, padding: 16, background: "#111", borderRadius: 8, border: "1px solid #222", color: "#888", fontSize: 13 }}>
        <strong style={{ color: "#aaa" }}>\u0130pucu:</strong> Paris QR\u0027\u0131n\u0131 \u00f6n masalara, Berlin QR\u0027\u0131n\u0131 arka masalara koy. M\u00fc\u015fteri tarad\u0131\u011f\u0131nda store\u0027a g\u00f6re men\u00fc otomatik filtrelenir, sipari\u015f de o store\u0027un mutfa\u011f\u0131na gider.
      </div>
    </div>
  );
}
