import{useState,useEffect}from"react";
import{supabase}from"../../lib/supabase.js";
const cv="'Coolvetica','Bebas Neue',sans-serif";
const cvc="'Coolvetica Condensed','Barlow Condensed',sans-serif";
const STATUS={empty:{color:"#444",border:"#2A2A2A",bg:"#1E1E1E",label:"Boş"},occupied:{color:"#3ECF8E",border:"#3ECF8E",bg:"rgba(62,207,142,0.12)",label:"Dolu"},bill:{color:"#E07A3E",border:"#E07A3E",bg:"rgba(224,122,62,0.12)",label:"Hesap!"}};
export default function TablesPage(){
  const[tables,setTables]=useState([]);
  const[loading,setLoading]=useState(true);
  const[section,setSection]=useState("all");
  const load=async()=>{const{data}=await supabase.from("table_summary").select("*").order("name");setTables(data||[]);setLoading(false);};
  useEffect(()=>{load();const ch=supabase.channel("tables").on("postgres_changes",{event:"*",schema:"public",table:"cafe_tables"},load).subscribe();return()=>ch.unsubscribe();},[]);
  const sections=["all",...new Set(tables.map(t=>t.section).filter(Boolean))];
  const filtered=section==="all"?tables:tables.filter(t=>t.section===section);
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{color:"#F0EDE8",fontFamily:cv,fontSize:28,letterSpacing:"-0.5px",margin:0}}>Masalar</h1>
          <div style={{color:"#888",fontFamily:cvc,fontSize:11,marginTop:2}}>{tables.filter(t=>t.status!=="empty").length}/{tables.length} dolu</div>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:20}}>
        {sections.map(s=>(<button key={s} onClick={()=>setSection(s)} style={{padding:"6px 14px",borderRadius:8,border:"none",fontFamily:cvc,fontSize:11,letterSpacing:"1px",cursor:"pointer",background:section===s?"#C8973E":"transparent",color:section===s?"#000":"#888",outline:section!==s?"1px solid #2A2A2A":"none"}}>{s==="all"?"TÜMÜ":s.toUpperCase()}</button>))}
      </div>
      {loading&&<div style={{color:"#888",fontFamily:cvc,fontSize:12,textAlign:"center",padding:40}}>YÜKLENİYOR...</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
        {filtered.map(t=>{const s=STATUS[t.status]||STATUS.empty;return(
          <div key={t.id} style={{background:s.bg,border:`1.5px solid ${s.border}`,borderRadius:14,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div style={{color:"#F0EDE8",fontFamily:cv,fontSize:18}}>{t.name}</div>
              <span style={{background:s.color+"33",color:s.color,fontFamily:cvc,fontSize:9,letterSpacing:"1px",padding:"2px 7px",borderRadius:3}}>{s.label}</span>
            </div>
            <div style={{color:"#888",fontFamily:cvc,fontSize:10,marginBottom:8}}>👥 {t.capacity} kişilik</div>
            {t.running_total>0&&<div style={{color:"#F0EDE8",fontFamily:cv,fontSize:20,letterSpacing:"-0.5px"}}>₺{Math.round(t.running_total).toLocaleString()}</div>}
            {t.status==="bill"&&<button style={{marginTop:10,width:"100%",padding:"6px",background:"#E07A3E",border:"none",color:"#000",fontFamily:cvc,fontSize:10,letterSpacing:"1px",cursor:"pointer",borderRadius:6}}>ÖDEME AL</button>}
            {t.status==="empty"&&<button style={{marginTop:8,width:"100%",padding:"5px",background:"transparent",border:"1px dashed #444",color:"#444",fontFamily:cvc,fontSize:10,cursor:"pointer",borderRadius:6}}>Sipariş Aç</button>}
          </div>
        );})}
      </div>
    </div>
  );
}