import { useState, useEffect, useRef } from "react";

// ── 기본 데이터 ───────────────────────────────────────────────────
const DEFAULT_FRAMEWORK = {
  Process: { code: "P", color: "#4ECDC4", bg: "#0d2e2c", items: ["업무 프로세스 재설계","현장 운영 방식 개선","Human-in-the-loop 운영","업무 자동화 프로세스","변화 관리 및 현업 정착"] },
  Data: { code: "D", color: "#FFE66D", bg: "#2e2a0d", items: ["데이터 수집/연계","데이터 정제/표준화","데이터 통합/저장 구조","데이터 라벨링/어노테이션","지식 데이터/문서 자산화","피처/임베딩 자산관리"] },
  Infra: { code: "I", color: "#A8E6CF", bg: "#0d2e1a", items: ["클라우드/서버/GPU 인프라","AI/ML 플랫폼","데이터 플랫폼 인프라","IT/OT 연계 인프라","API/서비스 연계 인프라","DevOps/MLOps 운영 인프라","보안 인프라"] },
  "AI Application": { code: "A", color: "#FF6B9D", bg: "#2e0d1a", items: ["예측 모델","최적화 모델","Vision AI","NLP/텍스트 분석","GenAI/RAG 서비스","AI Agent","추천/개인화 서비스","모델 운영/성능 개선"] },
  Governance: { code: "G", color: "#C3A6FF", bg: "#1a0d2e", items: ["AI 거버넌스","데이터 거버넌스","거버넌스 조직/역할체계","권한/접근 통제 정책","보안/개인정보/컴플라이언스","모델 리스크 관리","표준/가이드라인","성과/투자관리 기준"] },
};

const DEFAULT_STATUSES = [
  { name: "대기중", color: "#94a3b8", dot: "#64748b" },
  { name: "진행중", color: "#60a5fa", dot: "#3b82f6" },
  { name: "검토중", color: "#fb923c", dot: "#f97316" },
  { name: "완료",   color: "#4ade80", dot: "#22c55e" },
  { name: "보류",   color: "#f87171", dot: "#ef4444" },
];

const DEFAULT_PRIORITIES = [
  { name: "High",   color: "#ff4d6d" },
  { name: "Medium", color: "#ffd60a" },
  { name: "Low",    color: "#4cc9f0" },
];

const DEFAULT_EFFORTS = ["S","M","L","XL"];

const DEFAULT_USERS = [
  { id: 1, username: "admin", password: "admin", name: "관리자", role: "manager" },
  { id: 2, username: "user",  password: "user",  name: "사용자",  role: "user" },
];

const OPTIONAL_COLS = [
  { key: "owner",           label: "담당자" },
  { key: "status",          label: "상태" },
  { key: "priority",        label: "우선순위" },
  { key: "effort_estimate", label: "규모" },
  { key: "requester",       label: "요청부서" },
  { key: "due_date",        label: "마감일" },
];
const DEFAULT_COL_CONFIG = OPTIONAL_COLS.map(c => ({ ...c, visible: false }));

// ── LLM 설정 기본값 ──────────────────────────────────────────────
const DEFAULT_LLM_CONFIG = {
  provider: "claude",
  claude:  { apiKey:"", model:"claude-sonnet-4-20250514" },
  gemini:  { apiKey:"", model:"gemini-1.5-pro" },
  openai:  { apiKey:"", model:"gpt-4o" },
  onprem:  { baseUrl:"", model:"", apiKey:"" },
};

// ── LLM 분류 ──────────────────────────────────────────────────────
async function classifyWithLLM(taskData, framework, llmConfig = {}) {
  const provider = llmConfig.provider || "claude";
  const frameworkText = Object.entries(framework)
    .map(([cat, { code, items }]) =>
      `[${cat}]\n${items.map((it, i) => `  ${code}-${String(i+1).padStart(2,"0")}: ${it}`).join("\n")}`)
    .join("\n\n");
  const prompt = `당신은 AI Readiness Framework 전문가입니다. 아래 Framework 기준으로 Task를 분류하고, 반드시 JSON만 반환하세요.

=== AI Readiness Framework ===
${frameworkText}

=== Task 정보 ===
제목: ${taskData.title}
배경/목적: ${taskData.background}
요청 내용: ${taskData.request}
기대 결과: ${taskData.to_be}

=== 출력 형식 (JSON만) ===
{"primary_category":"카테고리명","primary_code":"코드","primary_sub":"세부분류명","classification_note":"분류 근거 (50자 이내)"}`;

  const parseJSON = (text) => JSON.parse(text.replace(/```json\n?|```/g,"").trim());

  if (provider === "claude") {
    const apiKey = llmConfig.claude?.apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Claude API 키가 설정되지 않았습니다.");
    const model = llmConfig.claude?.model || "claude-sonnet-4-20250514";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-calls":"true"},
      body:JSON.stringify({model,max_tokens:500,messages:[{role:"user",content:prompt}]}),
    });
    if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e?.error?.message||`Claude API 오류 (${res.status})`); }
    const data = await res.json();
    return parseJSON(data.content?.map(b=>b.text||"").join("")||"");
  }

  if (provider === "gemini") {
    const apiKey = llmConfig.gemini?.apiKey;
    if (!apiKey) throw new Error("Gemini API 키가 설정되지 않았습니다.");
    const model = llmConfig.gemini?.model || "gemini-1.5-pro";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:500}}),
    });
    if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e?.error?.message||`Gemini API 오류 (${res.status})`); }
    const data = await res.json();
    return parseJSON(data.candidates?.[0]?.content?.parts?.[0]?.text||"");
  }

  if (provider === "openai") {
    const apiKey = llmConfig.openai?.apiKey;
    if (!apiKey) throw new Error("OpenAI API 키가 설정되지 않았습니다.");
    const model = llmConfig.openai?.model || "gpt-4o";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`},
      body:JSON.stringify({model,max_tokens:500,messages:[{role:"user",content:prompt}]}),
    });
    if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e?.error?.message||`OpenAI API 오류 (${res.status})`); }
    const data = await res.json();
    return parseJSON(data.choices?.[0]?.message?.content||"");
  }

  if (provider === "onprem") {
    const baseUrl = llmConfig.onprem?.baseUrl?.replace(/\/+$/,"");
    const model = llmConfig.onprem?.model;
    if (!baseUrl||!model) throw new Error("On-prem 서버 URL과 모델명을 설정해주세요.");
    const apiKey = llmConfig.onprem?.apiKey;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method:"POST",
      headers:{"Content-Type":"application/json",...(apiKey?{"Authorization":`Bearer ${apiKey}`}:{})},
      body:JSON.stringify({model,max_tokens:500,messages:[{role:"user",content:prompt}]}),
    });
    if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e?.error?.message||`On-prem API 오류 (${res.status})`); }
    const data = await res.json();
    return parseJSON(data.choices?.[0]?.message?.content||"");
  }

  throw new Error("지원하지 않는 LLM 제공자입니다: " + provider);
}

// ── 유틸 ─────────────────────────────────────────────────────────
const emptyForm = () => ({
  title:"", requester:"", owner:"", start_date:"", due_date:"", status:"대기중", priority:"Medium",
  effort_estimate:"M", tags:"", background:"", request:"", as_is:"", to_be:"",
  constraints:"", notes:"",
  readiness:[{ alias:"", category:"", sub:"", note:"" }],
});

function getPrimaryCode(cat, sub, framework) {
  if (!cat||!sub||!framework[cat]) return "";
  const idx = framework[cat].items.indexOf(sub);
  return idx >= 0 ? `${framework[cat].code}-${String(idx+1).padStart(2,"0")}` : "";
}

function getReadiness(task) {
  if (task.readiness && task.readiness.length > 0) return task.readiness;
  return [{ alias:"", category:task.primary_category||"", code:task.primary_code||"", sub:task.primary_sub||"", note:task.classification_note||"" }];
}

function calcGanttBar(startDate, dueDate) {
  const ys = new Date("2026-01-01").getTime(), ye = new Date("2026-12-31").getTime();
  const total = ye - ys;
  const s = startDate ? new Date(startDate).getTime() : ys;
  const e = dueDate   ? new Date(dueDate).getTime()   : ye;
  if (e < ys || s > ye) return null;
  const left  = ((Math.max(s,ys)-ys)/total)*100;
  const width = Math.max(((Math.min(e,ye)-Math.max(s,ys))/total)*100, 2);
  return { left: Math.min(left,98), width: Math.min(width,100-left) };
}

function GanttCell({ startDate, dueDate, color }) {
  const bar = calcGanttBar(startDate, dueDate);
  return (
    <div style={{ position:"relative", height:24, display:"flex", borderRadius:3, overflow:"hidden", background:"#0a0f1e" }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{ flex:1, borderLeft: i>0?"1px solid #1a2640":undefined }} />
      ))}
      {bar && (
        <div style={{ position:"absolute", top:4, height:16, borderRadius:3,
          left:`${bar.left}%`, width:`${bar.width}%`,
          background:`${color}70`, border:`1px solid ${color}bb`, pointerEvents:"none" }} />
      )}
    </div>
  );
}

function taskToMarkdown(task) {
  return `---\nid: "${task.id}"\ntitle: "${task.title}"\nowner: "${task.owner||""}"\nstatus: "${task.status}"\nprimary_category: "${task.primary_category||""}"\nprimary_code: "${task.primary_code||""}"\n---\n\n# ${task.id}: ${task.title}\n\n## 배경\n${task.background||""}\n\n## 요청\n${task.request||""}\n\n## To-Be\n${task.to_be||""}\n`;
}
function downloadMD(task) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([taskToMarkdown(task)],{type:"text/markdown"}));
  a.download = `${task.id}.md`; a.click();
}

const SEED_TASKS = [{
  id:"TASK-001", title:"Claude API 도입", requester:"DT 전략기획", owner:"서동호",
  due_date:"2026-06-30", status:"대기중", priority:"Medium", effort_estimate:"M",
  tags:["LLM","사외API"], background:"", request:"", as_is:"", to_be:"사외 LLM 도입을 통한 DT 개발 생산성 향상",
  constraints:"", notes:"", created_date:"2026-01-15", history:[{date:"2026-05-23",content:"Task 생성",author:"서동호"}],
  primary_category:"Infra", primary_code:"I-01", primary_sub:"클라우드/서버/GPU 인프라", classification_note:"사외 LLM API 연동 인프라",
}];

// ═══════════════════════════════════════════════════════
// LoginPage
// ═══════════════════════════════════════════════════════
function LoginPage({ users, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const u = users.find(u => u.username === username && u.password === password);
    u ? onLogin(u) : setError("아이디 또는 비밀번호가 올바르지 않습니다.");
  };
  return (
    <div style={{ minHeight:"100vh", background:"#090e1a", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans','Noto Sans KR',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap'); *{box-sizing:border-box;margin:0;padding:0;} input{outline:none;font-family:inherit;}`}</style>
      <div style={{ background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:16, padding:40, width:360 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:32 }}>
          <div style={{ width:32, height:32, background:"linear-gradient(135deg,#4ECDC4,#FF6B9D)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⬡</div>
          <span style={{ fontWeight:700, fontSize:17, color:"#e2e8f0" }}>AI Task Dashboard</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <div style={{ fontSize:11, color:"#64748b", fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 }}>아이디</div>
            <input value={username} onChange={e=>setUsername(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
              style={{ width:"100%", background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:8, color:"#e2e8f0", padding:"10px 14px", fontSize:14 }} />
          </div>
          <div>
            <div style={{ fontSize:11, color:"#64748b", fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 }}>비밀번호</div>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
              style={{ width:"100%", background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:8, color:"#e2e8f0", padding:"10px 14px", fontSize:14 }} />
          </div>
          {error && <div style={{ color:"#f87171", fontSize:12 }}>{error}</div>}
          <button onClick={submit}
            style={{ background:"linear-gradient(135deg,#4ECDC4,#2a9d8f)", color:"#fff", border:"none", borderRadius:8, padding:"12px", fontSize:14, fontWeight:600, cursor:"pointer", marginTop:4 }}>
            로그인
          </button>
        </div>
        <div style={{ marginTop:20, fontSize:11, color:"#334155", textAlign:"center" }}>기본 계정: admin / admin (관리자), user / user (사용자)</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// AdminPage
// ═══════════════════════════════════════════════════════
function AdminPage({ framework, setFramework, statuses, setStatuses, priorities, setPriorities, efforts, setEfforts, users, setUsers, llmConfig, setLlmConfig, currentUser, onBack }) {
  const [tab, setTab] = useState("framework");
  const [selCat, setSelCat] = useState(Object.keys(framework)[0]);
  const [newCatName, setNewCatName] = useState(""); const [newCatCode, setNewCatCode] = useState(""); const [newCatColor, setNewCatColor] = useState("#4ECDC4");
  const [newItem, setNewItem] = useState("");
  const [newStatus, setNewStatus] = useState(""); const [newStatusColor, setNewStatusColor] = useState("#94a3b8"); const [newStatusDot, setNewStatusDot] = useState("#64748b");
  const [newPriority, setNewPriority] = useState(""); const [newPriorityColor, setNewPriorityColor] = useState("#ff4d6d");
  const [newEffort, setNewEffort] = useState("");
  const [newUser, setNewUser] = useState({ username:"", password:"", name:"", role:"user" });

  const saveFramework = (fw) => { setFramework(fw); localStorage.setItem("ai_framework", JSON.stringify(fw)); };
  const saveStatuses = (s) => { setStatuses(s); localStorage.setItem("ai_statuses", JSON.stringify(s)); };
  const savePriorities = (p) => { setPriorities(p); localStorage.setItem("ai_priorities", JSON.stringify(p)); };
  const saveEfforts = (e) => { setEfforts(e); localStorage.setItem("ai_efforts", JSON.stringify(e)); };
  const saveUsers = (u) => { setUsers(u); localStorage.setItem("ai_users", JSON.stringify(u)); };

  const addCat = () => {
    if (!newCatName.trim()||!newCatCode.trim()||framework[newCatName]) return;
    saveFramework({ ...framework, [newCatName]: { code:newCatCode.toUpperCase(), color:newCatColor, bg:"#0f1629", items:[] } });
    setNewCatName(""); setNewCatCode(""); setSelCat(newCatName);
  };
  const removeCat = (cat) => {
    const fw = { ...framework }; delete fw[cat];
    saveFramework(fw); setSelCat(Object.keys(fw)[0]||"");
  };
  const addItem = () => {
    if (!newItem.trim()||!selCat) return;
    const fw = { ...framework, [selCat]: { ...framework[selCat], items:[...framework[selCat].items, newItem.trim()] } };
    saveFramework(fw); setNewItem("");
  };
  const removeItem = (cat, idx) => {
    const items = framework[cat].items.filter((_,i)=>i!==idx);
    saveFramework({ ...framework, [cat]: { ...framework[cat], items } });
  };
  const updateCatColor = (cat, color) => saveFramework({ ...framework, [cat]: { ...framework[cat], color } });

  const tabStyle = (t) => ({ padding:"8px 18px", border:"none", borderRadius:6, cursor:"pointer", fontSize:13, fontWeight:500,
    background: tab===t?"#1e2d4a":"transparent", color: tab===t?"#4ECDC4":"#64748b" });

  return (
    <div style={{ minHeight:"100vh", background:"#090e1a", color:"#e2e8f0", fontFamily:"'DM Sans','Noto Sans KR',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap'); *{box-sizing:border-box;margin:0;padding:0;} input,select{outline:none;font-family:inherit;}`}</style>
      <header style={{ borderBottom:"1px solid #1e2d4a", padding:"0 32px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(9,14,26,.97)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"transparent", border:"1px solid #1e2d4a", borderRadius:6, color:"#64748b", padding:"6px 14px", fontSize:13, cursor:"pointer" }}>← 대시보드</button>
          <span style={{ fontWeight:700, fontSize:15, color:"#e2e8f0" }}>관리자 페이지</span>
        </div>
        <span style={{ fontSize:12, color:"#334155" }}>{currentUser.name} (manager)</span>
      </header>
      <main style={{ maxWidth:1100, margin:"0 auto", padding:"32px 24px" }}>
        <div style={{ display:"flex", gap:6, marginBottom:24 }}>
          {[["framework","Readiness 카테고리"],["attrs","상태·우선순위·규모"],["users","사용자 관리"],["llm","LLM 설정"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={tabStyle(t)}>{l}</button>
          ))}
        </div>

        {/* ── Readiness 카테고리 ── */}
        {tab==="framework" && (
          <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:20 }}>
            {/* 대분류 목록 */}
            <div style={{ background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:12, padding:16 }}>
              <div style={{ fontSize:11, color:"#64748b", fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", marginBottom:12 }}>대분류</div>
              {Object.entries(framework).map(([cat,{color}])=>(
                <div key={cat} onClick={()=>setSelCat(cat)}
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 10px", borderRadius:6, marginBottom:4, cursor:"pointer",
                    background:selCat===cat?"#1e2d4a":"transparent", border:`1px solid ${selCat===cat?"#2a3a5c":"transparent"}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:color, display:"inline-block" }} />
                    <span style={{ fontSize:13, color:selCat===cat?"#e2e8f0":"#94a3b8" }}>{cat}</span>
                  </div>
                  <button onClick={e=>{e.stopPropagation();removeCat(cat);}}
                    style={{ background:"transparent", border:"none", color:"#334155", cursor:"pointer", fontSize:14, lineHeight:1 }}>×</button>
                </div>
              ))}
              {/* 새 대분류 추가 */}
              <div style={{ marginTop:12, borderTop:"1px solid #1e2d4a", paddingTop:12, display:"flex", flexDirection:"column", gap:6 }}>
                <input placeholder="카테고리명" value={newCatName} onChange={e=>setNewCatName(e.target.value)}
                  style={{ background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, color:"#e2e8f0", padding:"7px 10px", fontSize:12, width:"100%" }} />
                <div style={{ display:"flex", gap:6 }}>
                  <input placeholder="코드" value={newCatCode} onChange={e=>setNewCatCode(e.target.value)}
                    style={{ background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, color:"#e2e8f0", padding:"7px 10px", fontSize:12, width:60 }} />
                  <input type="color" value={newCatColor} onChange={e=>setNewCatColor(e.target.value)}
                    style={{ background:"transparent", border:"1px solid #1e2d4a", borderRadius:6, cursor:"pointer", width:40, height:30, padding:2 }} />
                  <button onClick={addCat}
                    style={{ flex:1, background:"#1e2d4a", border:"none", borderRadius:6, color:"#4ECDC4", fontSize:12, cursor:"pointer", padding:"7px" }}>추가</button>
                </div>
              </div>
            </div>
            {/* 중분류 목록 */}
            {selCat && framework[selCat] && (
              <div style={{ background:"#0f1629", border:`1px solid ${framework[selCat].color}40`, borderRadius:12, padding:20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                  <span style={{ fontSize:15, fontWeight:700, color:framework[selCat].color }}>{selCat}</span>
                  <span style={{ fontSize:11, color:"#334155" }}>코드: {framework[selCat].code}</span>
                  <input type="color" value={framework[selCat].color} onChange={e=>updateCatColor(selCat,e.target.value)}
                    style={{ background:"transparent", border:"1px solid #1e2d4a", borderRadius:4, cursor:"pointer", width:32, height:24, padding:2 }} />
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {framework[selCat].items.map((item,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, padding:"8px 12px" }}>
                      <span style={{ fontSize:13, color:"#94a3b8" }}><span style={{ color:"#334155", fontFamily:"monospace", marginRight:8 }}>{framework[selCat].code}-{String(i+1).padStart(2,"0")}</span>{item}</span>
                      <button onClick={()=>removeItem(selCat,i)} style={{ background:"transparent", border:"none", color:"#334155", cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <input placeholder="새 중분류명" value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()}
                      style={{ flex:1, background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, color:"#e2e8f0", padding:"8px 12px", fontSize:13 }} />
                    <button onClick={addItem}
                      style={{ background:"linear-gradient(135deg,#4ECDC4,#2a9d8f)", border:"none", borderRadius:6, color:"#fff", padding:"8px 16px", fontSize:13, cursor:"pointer" }}>추가</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 상태·우선순위·규모 ── */}
        {tab==="attrs" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20 }}>
            {/* 상태 */}
            <div style={{ background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, color:"#64748b", fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 }}>상태</div>
              {statuses.map((s,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:s.dot, display:"inline-block" }} />
                    <span style={{ fontSize:13, color:s.color }}>{s.name}</span>
                  </span>
                  <button onClick={()=>saveStatuses(statuses.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:"#334155", cursor:"pointer", fontSize:16 }}>×</button>
                </div>
              ))}
              <div style={{ borderTop:"1px solid #1e2d4a", paddingTop:12, marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
                <input placeholder="상태명" value={newStatus} onChange={e=>setNewStatus(e.target.value)}
                  style={{ background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, color:"#e2e8f0", padding:"7px 10px", fontSize:12 }} />
                <div style={{ display:"flex", gap:6 }}>
                  <input type="color" value={newStatusColor} onChange={e=>setNewStatusColor(e.target.value)} style={{ flex:1, height:28, borderRadius:4, border:"1px solid #1e2d4a", background:"transparent", cursor:"pointer" }} />
                  <input type="color" value={newStatusDot} onChange={e=>setNewStatusDot(e.target.value)} style={{ flex:1, height:28, borderRadius:4, border:"1px solid #1e2d4a", background:"transparent", cursor:"pointer" }} />
                  <button onClick={()=>{if(newStatus.trim()){saveStatuses([...statuses,{name:newStatus.trim(),color:newStatusColor,dot:newStatusDot}]);setNewStatus("");}}}
                    style={{ background:"#1e2d4a", border:"none", borderRadius:6, color:"#4ECDC4", padding:"0 12px", fontSize:12, cursor:"pointer" }}>추가</button>
                </div>
              </div>
            </div>
            {/* 우선순위 */}
            <div style={{ background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, color:"#64748b", fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 }}>우선순위</div>
              {priorities.map((p,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:p.color }}>{p.name}</span>
                  <button onClick={()=>savePriorities(priorities.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:"#334155", cursor:"pointer", fontSize:16 }}>×</button>
                </div>
              ))}
              <div style={{ borderTop:"1px solid #1e2d4a", paddingTop:12, marginTop:8, display:"flex", gap:6 }}>
                <input placeholder="우선순위명" value={newPriority} onChange={e=>setNewPriority(e.target.value)}
                  style={{ flex:1, background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, color:"#e2e8f0", padding:"7px 10px", fontSize:12 }} />
                <input type="color" value={newPriorityColor} onChange={e=>setNewPriorityColor(e.target.value)} style={{ width:32, height:30, borderRadius:4, border:"1px solid #1e2d4a", background:"transparent", cursor:"pointer" }} />
                <button onClick={()=>{if(newPriority.trim()){savePriorities([...priorities,{name:newPriority.trim(),color:newPriorityColor}]);setNewPriority("");}}}
                  style={{ background:"#1e2d4a", border:"none", borderRadius:6, color:"#4ECDC4", padding:"0 12px", fontSize:12, cursor:"pointer" }}>추가</button>
              </div>
            </div>
            {/* 규모 */}
            <div style={{ background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, color:"#64748b", fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 }}>규모 (Effort)</div>
              {efforts.map((e,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ fontSize:13, fontFamily:"monospace", color:"#94a3b8" }}>{e}</span>
                  <button onClick={()=>saveEfforts(efforts.filter((_,j)=>j!==i))} style={{ background:"transparent", border:"none", color:"#334155", cursor:"pointer", fontSize:16 }}>×</button>
                </div>
              ))}
              <div style={{ borderTop:"1px solid #1e2d4a", paddingTop:12, marginTop:8, display:"flex", gap:6 }}>
                <input placeholder="예: XL" value={newEffort} onChange={e=>setNewEffort(e.target.value)}
                  style={{ flex:1, background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, color:"#e2e8f0", padding:"7px 10px", fontSize:12 }} />
                <button onClick={()=>{if(newEffort.trim()){saveEfforts([...efforts,newEffort.trim()]);setNewEffort("");}}}
                  style={{ background:"#1e2d4a", border:"none", borderRadius:6, color:"#4ECDC4", padding:"0 12px", fontSize:12, cursor:"pointer" }}>추가</button>
              </div>
            </div>
          </div>
        )}

        {/* ── 사용자 관리 ── */}
        {tab==="users" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20 }}>
            <div style={{ background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, color:"#64748b", fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 }}>사용자 목록</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr>{["이름","아이디","역할",""].map(h=>(
                    <th key={h} style={{ fontSize:10, color:"#334155", fontWeight:600, textTransform:"uppercase", letterSpacing:".06em", padding:"6px 10px", textAlign:"left", borderBottom:"1px solid #1e2d4a" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {users.map(u=>(
                    <tr key={u.id} style={{ borderBottom:"1px solid #0f1629" }}>
                      <td style={{ padding:"10px 10px", fontSize:13, color:"#e2e8f0" }}>{u.name}</td>
                      <td style={{ padding:"10px 10px", fontSize:13, color:"#64748b", fontFamily:"monospace" }}>{u.username}</td>
                      <td style={{ padding:"10px 10px" }}>
                        <select value={u.role} onChange={e=>saveUsers(users.map(x=>x.id===u.id?{...x,role:e.target.value}:x))}
                          disabled={u.id===currentUser.id}
                          style={{ background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:4, color:u.role==="manager"?"#C3A6FF":"#94a3b8", padding:"4px 8px", fontSize:12 }}>
                          <option value="manager">manager</option>
                          <option value="user">user</option>
                        </select>
                      </td>
                      <td style={{ padding:"10px 10px" }}>
                        {u.id!==currentUser.id && (
                          <button onClick={()=>saveUsers(users.filter(x=>x.id!==u.id))}
                            style={{ background:"transparent", border:"1px solid #1e2d4a", borderRadius:4, color:"#f87171", padding:"4px 10px", fontSize:12, cursor:"pointer" }}>삭제</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, color:"#64748b", fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", marginBottom:14 }}>사용자 추가</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[["name","이름"],["username","아이디"],["password","비밀번호"]].map(([k,l])=>(
                  <div key={k}>
                    <div style={{ fontSize:11, color:"#64748b", marginBottom:5 }}>{l}</div>
                    <input value={newUser[k]} onChange={e=>setNewUser(p=>({...p,[k]:e.target.value}))}
                      type={k==="password"?"password":"text"}
                      style={{ width:"100%", background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, color:"#e2e8f0", padding:"8px 12px", fontSize:13 }} />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize:11, color:"#64748b", marginBottom:5 }}>역할</div>
                  <select value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))}
                    style={{ width:"100%", background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, color:"#e2e8f0", padding:"8px 12px", fontSize:13 }}>
                    <option value="user">user</option>
                    <option value="manager">manager</option>
                  </select>
                </div>
                <button onClick={()=>{
                  if(!newUser.username.trim()||!newUser.password.trim()||!newUser.name.trim()) return;
                  saveUsers([...users,{...newUser,id:Date.now()}]);
                  setNewUser({username:"",password:"",name:"",role:"user"});
                }} style={{ background:"linear-gradient(135deg,#4ECDC4,#2a9d8f)", border:"none", borderRadius:8, color:"#fff", padding:"10px", fontSize:14, fontWeight:600, cursor:"pointer", marginTop:4 }}>
                  추가
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── LLM 설정 ── */}
        {tab==="llm" && (() => {
          const PROVIDERS = [
            { key:"claude",  label:"Claude",     color:"#FF6B9D", desc:"Anthropic Claude (claude.ai)" },
            { key:"gemini",  label:"Gemini",      color:"#4ECDC4", desc:"Google Gemini API" },
            { key:"openai",  label:"ChatGPT",     color:"#FFE66D", desc:"OpenAI GPT API" },
            { key:"onprem",  label:"On-prem",     color:"#A8E6CF", desc:"OpenAI 호환 자체 서버 (Ollama 등)" },
          ];
          const cur = llmConfig.provider || "claude";
          const upd = (provider, key, val) => setLlmConfig(p => ({ ...p, [provider]: { ...p[provider], [key]:val } }));

          const fieldStyle = { width:"100%", background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, color:"#e2e8f0", padding:"9px 12px", fontSize:13 };
          const labelStyle = { fontSize:11, color:"#64748b", fontWeight:600, textTransform:"uppercase", letterSpacing:".06em", marginBottom:5, display:"block" };

          return (
            <div style={{ maxWidth:680 }}>
              {/* Provider 선택 */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:24 }}>
                {PROVIDERS.map(({key,label,color,desc})=>(
                  <button key={key} onClick={()=>setLlmConfig(p=>({...p,provider:key}))}
                    style={{ background:cur===key?`${color}18`:"#0f1629", border:`1px solid ${cur===key?color:"#1e2d4a"}`, borderRadius:10, padding:"14px 10px", cursor:"pointer", textAlign:"center", transition:"all .2s" }}>
                    <div style={{ fontSize:14, fontWeight:700, color:cur===key?color:"#94a3b8", marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:10, color:"#475569", lineHeight:1.4 }}>{desc}</div>
                    {cur===key && <div style={{ width:6, height:6, borderRadius:"50%", background:color, margin:"8px auto 0" }} />}
                  </button>
                ))}
              </div>

              {/* 설정 필드 */}
              <div style={{ background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:12, padding:24, display:"flex", flexDirection:"column", gap:16 }}>
                {cur==="claude" && (<>
                  <div>
                    <label style={labelStyle}>API Key</label>
                    <input type="password" style={fieldStyle} placeholder="sk-ant-…" value={llmConfig.claude?.apiKey||""}
                      onChange={e=>upd("claude","apiKey",e.target.value)} />
                    <div style={{ fontSize:11, color:"#334155", marginTop:5 }}>비워두면 환경변수 VITE_ANTHROPIC_API_KEY를 사용합니다.</div>
                  </div>
                  <div>
                    <label style={labelStyle}>모델</label>
                    <select style={fieldStyle} value={llmConfig.claude?.model||"claude-sonnet-4-20250514"} onChange={e=>upd("claude","model",e.target.value)}>
                      <option value="claude-opus-4-7">claude-opus-4-7 (최고 성능)</option>
                      <option value="claude-sonnet-4-6">claude-sonnet-4-6 (권장)</option>
                      <option value="claude-sonnet-4-20250514">claude-sonnet-4-20250514</option>
                      <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001 (빠름)</option>
                    </select>
                  </div>
                </>)}

                {cur==="gemini" && (<>
                  <div>
                    <label style={labelStyle}>API Key</label>
                    <input type="password" style={fieldStyle} placeholder="AIzaSy…" value={llmConfig.gemini?.apiKey||""}
                      onChange={e=>upd("gemini","apiKey",e.target.value)} />
                    <div style={{ fontSize:11, color:"#334155", marginTop:5 }}>Google AI Studio에서 발급한 API 키를 입력하세요.</div>
                  </div>
                  <div>
                    <label style={labelStyle}>모델</label>
                    <select style={fieldStyle} value={llmConfig.gemini?.model||"gemini-1.5-pro"} onChange={e=>upd("gemini","model",e.target.value)}>
                      <option value="gemini-2.5-pro-preview-06-05">gemini-2.5-pro-preview (최고 성능)</option>
                      <option value="gemini-2.0-flash">gemini-2.0-flash (빠름)</option>
                      <option value="gemini-1.5-pro">gemini-1.5-pro (권장)</option>
                      <option value="gemini-1.5-flash">gemini-1.5-flash (빠름)</option>
                    </select>
                  </div>
                </>)}

                {cur==="openai" && (<>
                  <div>
                    <label style={labelStyle}>API Key</label>
                    <input type="password" style={fieldStyle} placeholder="sk-…" value={llmConfig.openai?.apiKey||""}
                      onChange={e=>upd("openai","apiKey",e.target.value)} />
                    <div style={{ fontSize:11, color:"#334155", marginTop:5 }}>OpenAI Platform에서 발급한 API 키를 입력하세요.</div>
                  </div>
                  <div>
                    <label style={labelStyle}>모델</label>
                    <select style={fieldStyle} value={llmConfig.openai?.model||"gpt-4o"} onChange={e=>upd("openai","model",e.target.value)}>
                      <option value="gpt-4o">gpt-4o (권장)</option>
                      <option value="gpt-4o-mini">gpt-4o-mini (빠름/저렴)</option>
                      <option value="gpt-4-turbo">gpt-4-turbo</option>
                      <option value="o3-mini">o3-mini</option>
                    </select>
                  </div>
                </>)}

                {cur==="onprem" && (<>
                  <div>
                    <label style={labelStyle}>서버 Base URL</label>
                    <input style={fieldStyle} placeholder="http://localhost:11434/v1" value={llmConfig.onprem?.baseUrl||""}
                      onChange={e=>upd("onprem","baseUrl",e.target.value)} />
                    <div style={{ fontSize:11, color:"#334155", marginTop:5 }}>OpenAI 호환 엔드포인트 (Ollama: :11434/v1, vLLM: :8000/v1 등)</div>
                  </div>
                  <div>
                    <label style={labelStyle}>모델명</label>
                    <input style={fieldStyle} placeholder="llama3, qwen2, mistral …" value={llmConfig.onprem?.model||""}
                      onChange={e=>upd("onprem","model",e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>API Key (선택)</label>
                    <input type="password" style={fieldStyle} placeholder="인증이 필요한 서버만 입력" value={llmConfig.onprem?.apiKey||""}
                      onChange={e=>upd("onprem","apiKey",e.target.value)} />
                  </div>
                </>)}
              </div>
              <div style={{ marginTop:10, padding:"10px 14px", background:"#0f1629", border:"1px solid #1e2d4a40", borderRadius:8, fontSize:11, color:"#334155" }}>
                ⚠ API 키는 브라우저 localStorage에 저장됩니다. 공용 PC에서는 사용 후 키를 삭제하세요.
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ColumnConfigPanel
// ═══════════════════════════════════════════════════════
function ColumnConfigPanel({ colConfig, setColConfig, onClose }) {
  const toggle = (key) => setColConfig(p => p.map(c => c.key===key?{...c,visible:!c.visible}:c));
  const move = (key, dir) => setColConfig(p => {
    const idx = p.findIndex(c=>c.key===key); if(idx<0) return p;
    const ni = idx+dir; if(ni<0||ni>=p.length) return p;
    const a=[...p]; [a[idx],a[ni]]=[a[ni],a[idx]]; return a;
  });
  return (
    <div style={{ position:"absolute", top:40, right:0, zIndex:200, background:"#0f1629", border:"1px solid #1e2d4a", borderRadius:10, padding:16, width:220, boxShadow:"0 8px 32px rgba(0,0,0,.6)" }}>
      <div style={{ fontSize:11, color:"#64748b", fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", marginBottom:12 }}>컬럼 표시 설정</div>
      {colConfig.map((c,i)=>(
        <div key={c.key} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
          <button onClick={()=>move(c.key,-1)} disabled={i===0}
            style={{ background:"transparent", border:"1px solid #1e2d4a", borderRadius:4, color:"#64748b", width:22, height:22, fontSize:11, cursor:"pointer", padding:0, lineHeight:1 }}>↑</button>
          <button onClick={()=>move(c.key,1)} disabled={i===colConfig.length-1}
            style={{ background:"transparent", border:"1px solid #1e2d4a", borderRadius:4, color:"#64748b", width:22, height:22, fontSize:11, cursor:"pointer", padding:0, lineHeight:1 }}>↓</button>
          <span style={{ flex:1, fontSize:13, color:c.visible?"#e2e8f0":"#475569" }}>{c.label}</span>
          <button onClick={()=>toggle(c.key)}
            style={{ width:36, height:20, borderRadius:10, background:c.visible?"#4ECDC4":"#1e2d4a", border:"none", cursor:"pointer", position:"relative", flexShrink:0 }}>
            <span style={{ position:"absolute", top:3, left:c.visible?18:3, width:14, height:14, borderRadius:"50%", background:"#fff", transition:"left .15s", display:"block" }} />
          </button>
        </div>
      ))}
      <button onClick={onClose} style={{ width:"100%", marginTop:8, background:"transparent", border:"1px solid #1e2d4a", borderRadius:6, color:"#64748b", padding:"6px", fontSize:12, cursor:"pointer" }}>닫기</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 메인 App
// ═══════════════════════════════════════════════════════
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(localStorage.getItem("ai_current_user")); } catch { return null; } });
  const [framework, setFramework] = useState(() => { try { const s=localStorage.getItem("ai_framework"); return s?JSON.parse(s):DEFAULT_FRAMEWORK; } catch { return DEFAULT_FRAMEWORK; } });
  const [statuses, setStatuses] = useState(() => { try { const s=localStorage.getItem("ai_statuses"); return s?JSON.parse(s):DEFAULT_STATUSES; } catch { return DEFAULT_STATUSES; } });
  const [priorities, setPriorities] = useState(() => { try { const s=localStorage.getItem("ai_priorities"); return s?JSON.parse(s):DEFAULT_PRIORITIES; } catch { return DEFAULT_PRIORITIES; } });
  const [efforts, setEfforts] = useState(() => { try { const s=localStorage.getItem("ai_efforts"); return s?JSON.parse(s):DEFAULT_EFFORTS; } catch { return DEFAULT_EFFORTS; } });
  const [users, setUsers] = useState(() => { try { const s=localStorage.getItem("ai_users"); return s?JSON.parse(s):DEFAULT_USERS; } catch { return DEFAULT_USERS; } });
  const [tasks, setTasks] = useState(() => { try { const s=JSON.parse(localStorage.getItem("ai_tasks")||"[]"); return s.length>0?s:SEED_TASKS; } catch { return SEED_TASKS; } });
  const [colConfig, setColConfig] = useState(() => { try { const s=localStorage.getItem("ai_col_config"); return s?JSON.parse(s):DEFAULT_COL_CONFIG; } catch { return DEFAULT_COL_CONFIG; } });
  const [llmConfig, setLlmConfig] = useState(() => { try { const s=localStorage.getItem("ai_llm_config"); return s?{...DEFAULT_LLM_CONFIG,...JSON.parse(s)}:DEFAULT_LLM_CONFIG; } catch { return DEFAULT_LLM_CONFIG; } });
  const [view, setView] = useState("dashboard");
  const [form, setForm] = useState(emptyForm());
  const [selectedTask, setSelectedTask] = useState(null);
  const [useLLM, setUseLLM] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [classResult, setClassResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterCat, setFilterCat] = useState("전체");
  const [filterStatus, setFilterStatus] = useState("전체");
  const [showColPanel, setShowColPanel] = useState(false);
  const colPanelRef = useRef(null);

  useEffect(() => { localStorage.setItem("ai_tasks", JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem("ai_col_config", JSON.stringify(colConfig)); }, [colConfig]);
  useEffect(() => { localStorage.setItem("ai_llm_config", JSON.stringify(llmConfig)); }, [llmConfig]);
  useEffect(() => { if(currentUser) localStorage.setItem("ai_current_user", JSON.stringify(currentUser)); else localStorage.removeItem("ai_current_user"); }, [currentUser]);

  // 외부 클릭 시 컬럼 패널 닫기
  useEffect(() => {
    const h = (e) => { if(colPanelRef.current && !colPanelRef.current.contains(e.target)) setShowColPanel(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const statusMap = Object.fromEntries(statuses.map(s=>[s.name,s]));
  const priorityMap = Object.fromEntries(priorities.map(p=>[p.name,p]));

  if (!currentUser) return <LoginPage users={users} onLogin={u=>{setCurrentUser(u);}} />;
  if (view==="admin") return (
    <AdminPage framework={framework} setFramework={setFramework}
      statuses={statuses} setStatuses={setStatuses}
      priorities={priorities} setPriorities={setPriorities}
      efforts={efforts} setEfforts={setEfforts}
      users={users} setUsers={setUsers}
      llmConfig={llmConfig} setLlmConfig={setLlmConfig}
      currentUser={currentUser}
      onBack={()=>setView("dashboard")} />
  );

  const navTo = (v) => { if(v==="form") setUseLLM(true); setView(v); setSelectedTask(null); setForm(emptyForm()); setClassResult(null); setError(""); };

  const buildReadiness = (rdList) => rdList.map(r => ({ ...r, code: getPrimaryCode(r.category, r.sub, framework) }));

  const handleSave = async () => {
    if (!form.title.trim()) { setError("제목은 필수입니다."); return; }
    if (!useLLM && !form.readiness[0].category) { setError("1차 카테고리를 선택해주세요."); return; }
    setError(""); setSaving(true); setClassResult(null);
    const today = new Date().toISOString().split("T")[0];
    const base = {
      id:`TASK-${String(tasks.length+1).padStart(3,"0")}`,
      title:form.title, requester:form.requester, owner:form.owner,
      start_date:form.start_date, due_date:form.due_date,
      status:form.status, priority:form.priority, effort_estimate:form.effort_estimate,
      tags:form.tags.split(",").map(t=>t.trim()).filter(Boolean),
      background:form.background, request:form.request, as_is:form.as_is, to_be:form.to_be,
      constraints:form.constraints, notes:form.notes,
      created_date:today, history:[{date:today,content:"Task 생성",author:form.owner||"-"}],
      readiness: buildReadiness(form.readiness),
    };
    if (useLLM) {
      setClassifying(true);
      try {
        const cls = await classifyWithLLM(form, framework, llmConfig);
        setClassResult(cls);
        const r0 = { alias:form.readiness[0].alias||"", category:cls.primary_category, code:cls.primary_code||getPrimaryCode(cls.primary_category,cls.primary_sub,framework), sub:cls.primary_sub, note:cls.classification_note };
        setTasks(p=>[{...base, readiness:[r0,...base.readiness.slice(1)]},...p]);
        setForm(emptyForm()); setClassifying(false); setSaving(false);
        setTimeout(()=>{setClassResult(null);setView("dashboard");},2500);
      } catch(e) { setError(e.message); setClassifying(false); setSaving(false); }
    } else {
      setTasks(p=>[{...base},...p]);
      setForm(emptyForm()); setSaving(false); setView("dashboard");
    }
  };

  const handleUpdate = async () => {
    if (!form.title.trim()) { setError("제목은 필수입니다."); return; }
    setError(""); setSaving(true); setClassResult(null);
    const apply = (rdList) => {
      setTasks(p=>p.map(t=>t.id===selectedTask.id ? {
        ...t, title:form.title, requester:form.requester, owner:form.owner,
        start_date:form.start_date, due_date:form.due_date,
        status:form.status, priority:form.priority, effort_estimate:form.effort_estimate,
        tags:form.tags.split(",").map(x=>x.trim()).filter(Boolean),
        background:form.background, request:form.request, as_is:form.as_is, to_be:form.to_be,
        constraints:form.constraints, notes:form.notes,
        readiness: rdList,
      } : t));
    };
    if (useLLM) {
      setClassifying(true);
      try {
        const cls = await classifyWithLLM(form, framework, llmConfig);
        setClassResult(cls);
        const r0 = { alias:form.readiness[0].alias||"", category:cls.primary_category, code:cls.primary_code||getPrimaryCode(cls.primary_category,cls.primary_sub,framework), sub:cls.primary_sub, note:cls.classification_note };
        apply([r0, ...buildReadiness(form.readiness.slice(1))]);
        setClassifying(false); setSaving(false);
        setTimeout(()=>{setClassResult(null);setSelectedTask(null);setForm(emptyForm());setView("dashboard");},2500);
      } catch(e) { setError(e.message); setClassifying(false); setSaving(false); }
    } else {
      apply(buildReadiness(form.readiness));
      setSelectedTask(null); setForm(emptyForm()); setSaving(false); setView("dashboard");
    }
  };

  const openEdit = (t) => {
    setSelectedTask(t);
    setForm({
      title:t.title, requester:t.requester||"", owner:t.owner||"",
      start_date:t.start_date||"", due_date:t.due_date||"",
      status:t.status, priority:t.priority, effort_estimate:t.effort_estimate,
      tags:Array.isArray(t.tags)?t.tags.join(", "):"",
      background:t.background||"", request:t.request||"", as_is:t.as_is||"",
      to_be:t.to_be||"", constraints:t.constraints||"", notes:t.notes||"",
      readiness: getReadiness(t),
    });
    setUseLLM(false); setError(""); setClassResult(null); setView("edit");
  };

  const catCounts = Object.keys(framework).reduce((a,c)=>{a[c]=tasks.filter(t=>getReadiness(t).some(r=>r.category===c)).length;return a;},{});
  const filtered = tasks.filter(t=>(filterCat==="전체"||getReadiness(t).some(r=>r.category===filterCat))&&(filterStatus==="전체"||t.status===filterStatus));
  const filteredRows = filtered.flatMap(t=>getReadiness(t).map((r,ri)=>({t,r,ri})));
  const statusCounts = statuses.reduce((a,s)=>{a[s.name]=tasks.filter(t=>t.status===s.name).length;return a;},{});
  const visibleCols = colConfig.filter(c=>c.visible);

  // ── 폼 본문 ──────────────────────────────────────────
  const renderForm = (isEdit) => (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
      <div className="card">
        <div className="section-title">기본 정보</div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div className="field"><label className="label">제목 *</label>
            <input className="inp" placeholder="Task를 한 문장으로 표현하세요" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div className="field"><label className="label">요청 부서/담당자</label><input className="inp" value={form.requester} onChange={e=>setForm(p=>({...p,requester:e.target.value}))} /></div>
            <div className="field"><label className="label">담당자</label><input className="inp" value={form.owner} onChange={e=>setForm(p=>({...p,owner:e.target.value}))} /></div>
            <div className="field"><label className="label">시작일</label><input className="inp" type="date" value={form.start_date} onChange={e=>setForm(p=>({...p,start_date:e.target.value}))} style={{colorScheme:"dark"}} /></div>
            <div className="field"><label className="label">마감일</label><input className="inp" type="date" value={form.due_date} onChange={e=>setForm(p=>({...p,due_date:e.target.value}))} style={{colorScheme:"dark"}} /></div>
            <div className="field"><label className="label">상태</label>
              <select className="inp" value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
                {statuses.map(s=><option key={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label className="label">우선순위</label>
              <select className="inp" value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}>
                {priorities.map(p=><option key={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div className="field"><label className="label">규모</label>
              <select className="inp" value={form.effort_estimate} onChange={e=>setForm(p=>({...p,effort_estimate:e.target.value}))}>
                {efforts.map(e=><option key={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label className="label">태그 (쉼표 구분)</label><input className="inp" value={form.tags} onChange={e=>setForm(p=>({...p,tags:e.target.value}))} /></div>
          <div className="field"><label className="label">비고/이슈</label><textarea className="inp" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={{minHeight:60}} /></div>
        </div>
      </div>

      <div className="card">
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
          <div className="section-title" style={{marginBottom:0}}>Task 내용</div>
          {useLLM && <span style={{ fontSize:10, color:"#4ECDC4", background:"#0d2e2c", padding:"2px 8px", borderRadius:10, border:"1px solid #4ECDC430" }}>LLM 분류 기준</span>}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {[["background","배경 및 목적","왜 이 Task가 필요한지"],["request","요청 내용","구체적으로 무엇을 해달라는 것인지"],["as_is","현재 상황 (As-Is)","현재 어떻게 하고 있는지"],["to_be","기대 결과 (To-Be)","완료 시 어떤 상태가 되어야 하는지"],["constraints","제약 조건","예산, 일정, 시스템 제약 등"]].map(([k,l,ph])=>(
            <div key={k} className="field"><label className="label">{l}</label><textarea className="inp" placeholder={ph} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} /></div>
          ))}
        </div>
      </div>

      {/* Readiness 분류 */}
      <div className="card" style={{ borderColor:"#C3A6FF40", background:"#1a0d2e" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div className="section-title" style={{marginBottom:0,color:"#C3A6FF"}}>Readiness 분류</div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {useLLM && <span style={{ fontSize:10, color:"#64748b", background:"#0a0f1e", border:"1px solid #1e2d4a", borderRadius:6, padding:"2px 8px", fontFamily:"monospace" }}>
              {llmConfig.provider==="claude"?"Claude":llmConfig.provider==="gemini"?"Gemini":llmConfig.provider==="openai"?"ChatGPT":"On-prem"}
              {" · "}{llmConfig[llmConfig.provider]?.model||"-"}
            </span>}
            <span style={{ fontSize:11, color:useLLM?"#4ECDC4":"#475569" }}>LLM 자동분류</span>
            <button onClick={()=>setUseLLM(v=>!v)} style={{ width:40, height:22, borderRadius:11, background:useLLM?"#4ECDC4":"#1e2d4a", border:"none", cursor:"pointer", position:"relative" }}>
              <span style={{ position:"absolute", top:3, left:useLLM?20:3, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left .2s", display:"block" }} />
            </button>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {form.readiness.map((r, ri) => (
            <div key={ri} style={{ background:"#120920", border:"1px solid #2a1a4a", borderRadius:10, padding:14, position:"relative" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontSize:11, fontWeight:600, color:ri===0?"#C3A6FF":"#a78bfa", letterSpacing:".06em" }}>
                  {ri===0 ? "① 1차 분류 (Primary)" : `② ${ri+1}차 분류`}
                </span>
                {ri > 0 && (
                  <button onClick={()=>setForm(p=>({...p,readiness:p.readiness.filter((_,i)=>i!==ri)}))}
                    style={{ background:"transparent", border:"none", color:"#f87171", cursor:"pointer", fontSize:18, lineHeight:1, padding:"0 4px" }}>×</button>
                )}
              </div>
              {ri > 0 && (
                <div className="field" style={{ marginBottom:10 }}>
                  <label className="label" style={{ color:"#fb923c" }}>태스크 Alias * <span style={{ fontSize:10, color:"#64748b", fontWeight:400, textTransform:"none", letterSpacing:0 }}>sibling과 구분하는 짧은 이름</span></label>
                  <input className="inp" placeholder="예: 데이터수집 관점, 인프라 관점 …" value={r.alias}
                    onChange={e=>setForm(p=>({...p,readiness:p.readiness.map((x,i)=>i===ri?{...x,alias:e.target.value}:x)}))} />
                </div>
              )}
              {ri===0 && useLLM ? (
                <p style={{ fontSize:12, color:"#475569" }}>저장 시 LLM이 자동으로 대분류/중분류를 분류합니다.</p>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div className="field"><label className="label">대분류{ri===0?" *":""}</label>
                    <select className="inp" value={r.category}
                      onChange={e=>setForm(p=>({...p,readiness:p.readiness.map((x,i)=>i===ri?{...x,category:e.target.value,sub:""}:x)}))}>
                      <option value="">선택하세요</option>
                      {Object.keys(framework).map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field"><label className="label">중분류</label>
                    <select className="inp" value={r.sub} disabled={!r.category}
                      onChange={e=>setForm(p=>({...p,readiness:p.readiness.map((x,i)=>i===ri?{...x,sub:e.target.value}:x)}))}>
                      <option value="">선택하세요</option>
                      {(framework[r.category]?.items||[]).map(item=><option key={item}>{item}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{gridColumn:"1/-1"}}><label className="label">분류 근거 (선택)</label>
                    <input className="inp" value={r.note} placeholder="분류 이유 50자 이내"
                      onChange={e=>setForm(p=>({...p,readiness:p.readiness.map((x,i)=>i===ri?{...x,note:e.target.value}:x)}))} />
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={()=>setForm(p=>({...p,readiness:[...p.readiness,{alias:"",category:"",sub:"",note:""}]}))}
            style={{ background:"transparent", border:"1px dashed #4a2a7a", borderRadius:8, color:"#a78bfa", padding:"10px", fontSize:13, cursor:"pointer", width:"100%", textAlign:"center" }}>
            ＋ Readiness 분류 추가
          </button>
        </div>
      </div>

      {error && <div style={{ color:"#f87171", fontSize:13, padding:"10px 14px", background:"#1f0d0d", borderRadius:8, border:"1px solid #ef444430" }}>{error}</div>}

      <div style={{ display:"flex", gap:12, justifyContent:"flex-end" }}>
        <button className="btn-ghost" onClick={()=>isEdit?navTo("dashboard"):setForm(emptyForm())}>{isEdit?"← 취소":"초기화"}</button>
        <button className="btn-primary" onClick={isEdit?handleUpdate:handleSave} disabled={saving}>
          {saving ? <span style={{display:"flex",alignItems:"center",gap:8}}><span className="spin" style={{display:"inline-block",width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%"}} />{classifying?"LLM 분류 중…":"저장 중…"}</span>
          : isEdit?(useLLM?"수정 + 재분류":"수정 저장"):(useLLM?"저장 + 자동분류":"저장")}
        </button>
      </div>
    </div>
  );

  // ── 렌더 ────────────────────────────────────────────
  const TH = 90, TM = 140, TT = 200, TG = 280, TB = 120;

  const thStyle = (extra={}) => ({ padding:"10px 12px", fontSize:12, fontWeight:600, textTransform:"uppercase", letterSpacing:".08em", color:"#64748b", background:"#080c18", borderBottom:"1px solid #1e2d4a", whiteSpace:"nowrap", ...extra });
  const tdStyle = (extra={}) => ({ padding:"10px 12px", borderBottom:"1px solid #0c1120", verticalAlign:"middle", background:"#0f1629", ...extra });
  const stickyLeft = (left, extra={}) => ({ position:"sticky", left, zIndex:2, ...extra });
  const stickyRight = (right, extra={}) => ({ position:"sticky", right, zIndex:2, ...extra });

  return (
    <div style={{ minHeight:"100vh", background:"#090e1a", color:"#e2e8f0", fontFamily:"'DM Sans','Noto Sans KR',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px;height:6px;}
        ::-webkit-scrollbar-track{background:#0f1629;}
        ::-webkit-scrollbar-thumb{background:#2a3a5c;border-radius:3px;}
        input,textarea,select{outline:none;font-family:inherit;}
        .field{display:flex;flex-direction:column;gap:6px;}
        .label{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.08em;color:#64748b;}
        .section-title{font-size:12px;font-weight:600;color:#334155;text-transform:uppercase;letter-spacing:.06em;margin-bottom:16px;}
        .inp{background:#0f1629;border:1px solid #1e2d4a;border-radius:8px;color:#e2e8f0;padding:10px 14px;font-size:14px;width:100%;transition:border .2s;}
        .inp:focus{border-color:#4ECDC4;box-shadow:0 0 0 2px rgba(78,205,196,.12);}
        .inp::placeholder{color:#334155;}
        textarea.inp{resize:vertical;min-height:80px;line-height:1.6;}
        .btn-primary{background:linear-gradient(135deg,#4ECDC4,#2a9d8f);color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s,transform .15s;}
        .btn-primary:hover:not(:disabled){opacity:.9;transform:translateY(-1px);}
        .btn-primary:disabled{opacity:.5;cursor:not-allowed;}
        .btn-ghost{background:transparent;border:1px solid #1e2d4a;border-radius:8px;color:#94a3b8;padding:10px 20px;font-size:13px;cursor:pointer;transition:all .2s;}
        .btn-ghost:hover{border-color:#4ECDC4;color:#4ECDC4;}
        .card{background:#0f1629;border:1px solid #1e2d4a;border-radius:12px;padding:20px;}
        .pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:13px;font-weight:500;}
        .tr-hover:hover td{background:#111827 !important;}
        .spin{animation:spin 1s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}
        .fade-in{animation:fadeIn .3s ease;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
      `}</style>

      {/* 헤더 */}
      <header style={{ borderBottom:"1px solid #1e2d4a", padding:"0 24px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, background:"rgba(9,14,26,.97)", backdropFilter:"blur(12px)", zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:28, height:28, background:"linear-gradient(135deg,#4ECDC4,#FF6B9D)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>⬡</div>
          <span style={{ fontWeight:700, fontSize:15 }}>AI Task Dashboard</span>
        </div>
        <nav style={{ display:"flex", gap:6, alignItems:"center" }}>
          {[["dashboard","📊 대시보드"],["form","＋ Task 등록"]].map(([v,l])=>(
            <button key={v} onClick={()=>navTo(v)} style={{ background:view===v?"#1e2d4a":"transparent", border:"none", color:view===v?"#4ECDC4":"#64748b", padding:"6px 14px", borderRadius:6, fontSize:13, fontWeight:500, cursor:"pointer" }}>{l}</button>
          ))}
          {currentUser.role==="manager" && (
            <button onClick={()=>setView("admin")} style={{ background:"transparent", border:"1px solid #1e2d4a", color:"#C3A6FF", padding:"6px 14px", borderRadius:6, fontSize:13, cursor:"pointer" }}>⚙ 관리자</button>
          )}
          <div style={{ width:1, height:20, background:"#1e2d4a", margin:"0 4px" }} />
          <span style={{ fontSize:12, color:"#475569" }}>{currentUser.name}</span>
          <button onClick={()=>setCurrentUser(null)} style={{ background:"transparent", border:"1px solid #1e2d4a", color:"#64748b", padding:"5px 12px", borderRadius:6, fontSize:12, cursor:"pointer" }}>로그아웃</button>
        </nav>
      </header>

      <main style={{ maxWidth:1600, margin:"0 auto", padding:"28px 20px" }}>

        {/* 대시보드 */}
        {view==="dashboard" && (
          <div className="fade-in">
            {/* KPI */}
            <div style={{ display:"grid", gridTemplateColumns:`repeat(${Object.keys(framework).length},1fr)`, gap:10, marginBottom:20 }}>
              {Object.entries(framework).map(([cat,{color,bg}])=>(
                <div key={cat} onClick={()=>setFilterCat(filterCat===cat?"전체":cat)}
                  className="card" style={{ cursor:"pointer", borderColor:filterCat===cat?color:"#1e2d4a", background:filterCat===cat?bg:"#0f1629", transition:"all .2s", padding:14 }}>
                  <div style={{ fontSize:22, fontWeight:700, color, fontFamily:"'DM Mono',monospace" }}>{catCounts[cat]||0}</div>
                  <div style={{ fontSize:10, color:"#64748b", marginTop:3, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{cat}</div>
                </div>
              ))}
            </div>

            {/* 상태 필터 */}
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              {["전체",...statuses.map(s=>s.name)].map(s=>{
                const st=statusMap[s];
                return (
                  <button key={s} onClick={()=>setFilterStatus(s)}
                    className="pill" style={{ background:filterStatus===s?"#1e2d4a":"transparent", border:`1px solid ${filterStatus===s?"#4ECDC4":"#1e2d4a"}`, color:filterStatus===s?"#4ECDC4":"#64748b", cursor:"pointer", padding:"6px 14px", fontSize:12 }}>
                    {s!=="전체"&&<span style={{ width:6, height:6, borderRadius:"50%", background:st?.dot, display:"inline-block" }} />}
                    {s}{s!=="전체"&&statusCounts[s]>0&&` (${statusCounts[s]})`}
                  </button>
                );
              })}
            </div>

            {/* 테이블 */}
            <div className="card" style={{ padding:0, overflow:"hidden" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid #1e2d4a", background:"#080c18" }}>
                <span style={{ fontSize:12, color:"#64748b" }}>Task {filtered.length}건 <span style={{color:"#334155"}}>({filteredRows.length}행)</span></span>
                <div style={{ position:"relative" }} ref={colPanelRef}>
                  <button onClick={()=>setShowColPanel(v=>!v)}
                    style={{ background:"transparent", border:"1px solid #1e2d4a", borderRadius:6, color:"#64748b", padding:"5px 12px", fontSize:12, cursor:"pointer" }}>
                    컬럼 설정 ▾
                  </button>
                  {showColPanel && <ColumnConfigPanel colConfig={colConfig} setColConfig={setColConfig} onClose={()=>setShowColPanel(false)} />}
                </div>
              </div>

              <div style={{ overflowX:"auto" }}>
                <table style={{ borderCollapse:"collapse", minWidth:"max-content", width:"100%" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle(), ...stickyLeft(0,{ background:"#080c18" }), width:TH, minWidth:TH }}>대분류</th>
                      <th style={{ ...thStyle(), ...stickyLeft(TH,{ background:"#080c18" }), width:TM, minWidth:TM }}>중분류</th>
                      <th style={{ ...thStyle(), ...stickyLeft(TH+TM,{ background:"#080c18" }), width:TT, minWidth:TT }}>Task명</th>
                      {visibleCols.map(c=>(
                        <th key={c.key} style={{ ...thStyle(), width:90, minWidth:90 }}>{c.label}</th>
                      ))}
                      {/* Gantt 헤더 */}
                      <th style={{ ...thStyle(), ...stickyRight(TB,{ background:"#080c18" }), width:TG, minWidth:TG, padding:"0 0" }}>
                        <div style={{ display:"flex", height:"100%", alignItems:"stretch" }}>
                          {["26.1Q","26.2Q","26.3Q","26.4Q"].map((q,i)=>(
                            <div key={q} style={{ flex:1, borderLeft:i>0?"1px solid #1e2d4a":undefined, display:"flex", alignItems:"center", justifyContent:"center", padding:"10px 0", fontSize:11, fontWeight:700, color:"#64748b", letterSpacing:".06em" }}>{q}</div>
                          ))}
                        </div>
                      </th>
                      <th style={{ ...thStyle(), ...stickyRight(0,{ background:"#080c18" }), width:TB, minWidth:TB }}>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length===0 ? (
                      <tr><td colSpan={3+visibleCols.length+2} style={{ padding:"48px 16px", textAlign:"center", color:"#334155", fontSize:13, background:"#0f1629" }}>
                        등록된 Task가 없습니다. <span style={{ color:"#4ECDC4", cursor:"pointer" }} onClick={()=>navTo("form")}>Task를 등록해보세요 →</span>
                      </td></tr>
                    ) : filteredRows.map(({t, r, ri}) => {
                      const catColor = framework[r.category]?.color||"#64748b";
                      const st = statusMap[t.status]||{color:"#94a3b8",dot:"#64748b"};
                      const pr = priorityMap[t.priority]||{color:"#64748b"};
                      const isAlias = ri > 0 && r.alias;
                      const rowBg = isAlias ? "#0a0e1f" : undefined;
                      return (
                        <tr key={`${t.id}-${ri}`} className="tr-hover" style={{ cursor:"pointer", opacity: isAlias ? 0.92 : 1 }} onClick={()=>openEdit(t)}>
                          {/* 대분류 */}
                          <td style={{ ...tdStyle(rowBg?{background:rowBg}:{}), ...stickyLeft(0,rowBg?{background:rowBg}:{}) }}>
                            {r.category ? (
                              <span style={{ fontSize:13, fontWeight:700, color:catColor, display:"block", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:TH-20 }}>{r.category}</span>
                            ) : <span style={{ fontSize:13, color:"#64748b" }}>미분류</span>}
                          </td>
                          {/* 중분류 */}
                          <td style={{ ...tdStyle(rowBg?{background:rowBg}:{}), ...stickyLeft(TH,rowBg?{background:rowBg}:{}) }}>
                            <div style={{ fontSize:12, color:"#64748b", fontFamily:"'DM Mono',monospace", marginBottom:2 }}>{r.code}</div>
                            <div style={{ fontSize:13, color:"#94a3b8", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:TM-20 }}>{r.sub||"-"}</div>
                          </td>
                          {/* Task명 */}
                          <td style={{ ...tdStyle(rowBg?{background:rowBg}:{}), ...stickyLeft(TH+TM,rowBg?{background:rowBg}:{}) }}>
                            <div style={{ fontSize:12, color:"#4ECDC4", fontFamily:"'DM Mono',monospace", marginBottom:2 }}>
                              {t.id}{isAlias && <span style={{color:"#a78bfa",marginLeft:4}}>· {r.alias}</span>}
                            </div>
                            <div style={{ fontSize:15, fontWeight:500, color:"#e2e8f0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:TT-20 }}>
                              {isAlias ? <><span style={{color:"#a78bfa",fontWeight:600}}>{r.alias}</span><span style={{color:"#475569",margin:"0 5px"}}>—</span>{t.title}</> : t.title}
                            </div>
                          </td>
                          {/* 선택 컬럼들 */}
                          {visibleCols.map(c=>{
                            let val;
                            if(c.key==="status") val=<span className="pill" style={{background:`${st.dot}18`,color:st.color,border:`1px solid ${st.dot}30`}}><span style={{width:5,height:5,borderRadius:"50%",background:st.dot,display:"inline-block"}}/>{t.status}</span>;
                            else if(c.key==="priority") val=<span style={{fontSize:14,fontWeight:600,color:pr.color}}>{t.priority}</span>;
                            else if(c.key==="due_date") val=<span style={{fontSize:14,color:"#94a3b8"}}>{t.due_date||"-"}</span>;
                            else val=<span style={{fontSize:14,color:"#cbd5e1",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"block",maxWidth:80}}>{t[c.key]||"-"}</span>;
                            return <td key={c.key} style={tdStyle(rowBg?{background:rowBg}:{})}>{val}</td>;
                          })}
                          {/* Gantt */}
                          <td style={{ ...tdStyle({ padding:"8px 10px", ...(rowBg?{background:rowBg}:{}) }), ...stickyRight(TB,rowBg?{background:rowBg}:{}) }}>
                            <GanttCell startDate={t.start_date||t.created_date} dueDate={t.due_date} color={catColor} />
                          </td>
                          {/* 비고 */}
                          <td style={{ ...tdStyle(rowBg?{background:rowBg}:{}), ...stickyRight(0,rowBg?{background:rowBg}:{}) }}>
                            <span style={{ fontSize:13, color:"#94a3b8", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", display:"block", maxWidth:TB-20 }}>{t.notes||"-"}</span>
                            {ri===0 && <button onClick={e=>{e.stopPropagation();downloadMD(t);}} style={{ marginTop:4, background:"transparent", border:"1px solid #1e2d4a", borderRadius:4, color:"#64748b", padding:"2px 8px", fontSize:12, cursor:"pointer" }}>↓ MD</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Task 등록 */}
        {view==="form" && (
          <div className="fade-in" style={{ maxWidth:720, margin:"0 auto" }}>
            <h2 style={{ fontSize:20, fontWeight:700, marginBottom:24 }}>Task 등록</h2>
            {classResult && (
              <div className="fade-in card" style={{ marginBottom:20, borderColor:"#4ECDC4", background:"#0d2e2c" }}>
                <span style={{ fontSize:13, fontWeight:600, color:"#4ECDC4" }}>✦ LLM 분류 완료 — 대시보드로 이동합니다</span>
                <div style={{ marginTop:8, fontSize:12, color:"#64748b" }}>{classResult.primary_category} › {classResult.primary_sub}</div>
              </div>
            )}
            {renderForm(false)}
          </div>
        )}

        {/* Task 수정 */}
        {view==="edit" && selectedTask && (
          <div className="fade-in" style={{ maxWidth:720, margin:"0 auto" }}>
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, color:"#4ECDC4", fontFamily:"'DM Mono',monospace", marginBottom:4 }}>{selectedTask.id}</div>
              <h2 style={{ fontSize:20, fontWeight:700 }}>Task 수정</h2>
            </div>
            {classResult && (
              <div className="fade-in card" style={{ marginBottom:20, borderColor:"#4ECDC4", background:"#0d2e2c" }}>
                <span style={{ fontSize:13, fontWeight:600, color:"#4ECDC4" }}>✦ LLM 재분류 완료</span>
              </div>
            )}
            {renderForm(true)}
          </div>
        )}
      </main>
    </div>
  );
}
