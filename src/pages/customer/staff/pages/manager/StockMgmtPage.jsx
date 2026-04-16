import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import StockViewPage from "../staff/StockViewPage.jsx";

const cv  = "'Coolvetica','Bebas Neue',sans-serif";
const cvc = "'Coolvetica Condensed','Barlow Condensed',sans-serif";

export default function StockMgmtPage() {
  const [tab,       setTab]       = useState("stock");
  const [movements, setMovements] = useState([]);
  const [invoices,  setInvoices]  = useState([]);
  const [loading,   setLoading]   = useState(false);

  const loadMovements = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("stock_movements")
      .select("*, stock_items(name, unit)")
      .order("created_at", { ascending:false })
      .limit(50);
    setMovements(data || []);
    setLoading(false);
  };

  const loadInvoices = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending:false });
    setInvoices(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (tab === "movements") loadMovements();
    if (tab === "invoices")  loadInvoices();
  }, [tab]);

  const typeColor = { in:"#3ECF8E", out:"#E07A3E", adjustment:"#C8973E", waste:"#E05A5A" };
  const typeLabel = { in:"Giriş", out:"Çıkış", adjustment:"Düzeltme", waste:"Fire" };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:20 }}>
        <h1 style={{ color:"#F0EDE8", fontFamily:cv, fontSize:28,
          letterSpacing:"-0.5px", margin:0 }}>Stok Yönetimi</h1>
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:20 }}>
        {[["stock","Stok"],["movements","Hareketler"],["invoices","Faturalar"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:"7px 16px", borderRadius:8, border:"none",
              fontFamily:cvc, fontSize:11, letterSpacing:"1px", cursor:"pointer",
              background: tab===id ? "#C8973E" : "transparent",
              color:       tab===id ? "#000"   : "#888",
              outline:     tab!==id ? "1px solid #2A2A2A" : "none" }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === "stock" && <StockViewPage />}

      {tab === "movements" && (
        <div style={{ background:"#1E1E1E", border:"1px solid #2A2A2A",
          borderRadius:12, overflow:"hidden" }}>
          {loading && (
            <div style={{ color:"#888", fontFamily:cvc, fontSize:12,
              textAlign:"center", padding:24 }}>YÜKLENİYOR...</div>
          )}
          {movements.map((m, i) => (
            <div key={m.id} style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", padding:"11px 16px",
              borderBottom: i < movements.length-1 ? "1px solid #2A2A2A" : "none" }}>
              <div>
                <div style={{ color:"#F0EDE8", fontFamily:cvc,
                  fontSize:13, fontWeight:700 }}>
                  {m.stock_items?.name}
                </div>
                <div style={{ color:"#888", fontFamily:cvc, fontSize:11 }}>
                  {new Date(m.created_at).toLocaleDateString("tr")}
                  {m.note && ` · ${m.note}`}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ color:typeColor[m.type]||"#888",
                  fontFamily:cv, fontSize:16 }}>
                  {m.type==="in"?"+":"-"}{m.quantity} {m.stock_items?.unit}
                </div>
                <span style={{ background:(typeColor[m.type]||"#888")+"22",
                  color:typeColor[m.type]||"#888",
                  fontFamily:cvc, fontSize:9, letterSpacing:"1px",
                  padding:"2px 6px", borderRadius:3 }}>
                  {typeLabel[m.type]||m.type}
                </span>
              </div>
            </div>
          ))}
          {movements.length === 0 && !loading && (
            <div style={{ color:"#888", fontFamily:cvc, fontSize:12,
              textAlign:"center", padding:32 }}>Henüz hareket yok</div>
          )}
        </div>
      )}

      {tab === "invoices" && (
        <div>
          {loading && (
            <div style={{ color:"#888", fontFamily:cvc, fontSize:12,
              textAlign:"center", padding:24 }}>YÜKLENİYOR...</div>
          )}
          {invoices.length === 0 && !loading && (
            <div style={{ color:"#888", fontFamily:cvc, fontSize:12,
              textAlign:"center", padding:40 }}>Henüz fatura yok</div>
          )}
          {invoices.map(inv => (
            <div key={inv.id} style={{ background:"#1E1E1E",
              border:"1px solid #2A2A2A", borderRadius:12,
              padding:16, marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <div>
                  <div style={{ color:"#F0EDE8", fontFamily:cvc,
                    fontSize:14, fontWeight:700 }}>
                    {inv.supplier || "Bilinmeyen tedarikçi"}
                  </div>
                  <div style={{ color:"#888", fontFamily:cvc, fontSize:11, marginTop:2 }}>
                    {inv.invoice_date ||
                      new Date(inv.created_at).toLocaleDateString("tr")}
                    {inv.invoice_no && ` · #${inv.invoice_no}`}
                  </div>
                </div>
                <div style={{ color:"#C8973E", fontFamily:cv, fontSize:18 }}>
                  {inv.total_amount ? `₺${inv.total_amount.toLocaleString()}` : "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
