import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:3000" }));
app.use(express.json());

// ── 유틸 ─────────────────────────────────────────────────────────
const q = (text, params) => pool.query(text, params);

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ── 인증 ─────────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await q("SELECT id,username,name,role FROM users WHERE username=$1 AND password=$2", [username, password]);
    if (!rows[0]) return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 설정 (GET 통합) ───────────────────────────────────────────────
app.get("/api/config", async (req, res) => {
  try {
    const [cats, items, sts, pris, efts, cols, llm] = await Promise.all([
      q("SELECT * FROM framework_categories ORDER BY sort_order"),
      q("SELECT * FROM framework_items ORDER BY category_id, sort_order"),
      q("SELECT * FROM statuses ORDER BY sort_order"),
      q("SELECT * FROM priorities ORDER BY sort_order"),
      q("SELECT * FROM efforts ORDER BY sort_order"),
      q("SELECT * FROM col_config ORDER BY sort_order"),
      q("SELECT * FROM llm_config WHERE id=1"),
    ]);

    const framework = {};
    for (const cat of cats.rows) {
      framework[cat.name] = {
        code: cat.code, color: cat.color, bg: cat.bg,
        items: items.rows.filter(i => i.category_id === cat.id).map(i => i.name),
      };
    }

    const r = llm.rows[0] || {};
    const llmConfig = {
      provider: r.provider || "claude",
      claude:  { apiKey: r.claude_api_key  || "", model: r.claude_model  || "claude-sonnet-4-20250514" },
      gemini:  { apiKey: r.gemini_api_key  || "", model: r.gemini_model  || "gemini-1.5-pro" },
      openai:  { apiKey: r.openai_api_key  || "", model: r.openai_model  || "gpt-4o" },
      onprem:  { baseUrl: r.onprem_base_url || "", model: r.onprem_model || "", apiKey: r.onprem_api_key || "" },
    };

    res.json({
      framework,
      statuses:   sts.rows.map(s => ({ name: s.name, color: s.color, dot: s.dot_color })),
      priorities: pris.rows.map(p => ({ name: p.name, color: p.color })),
      efforts:    efts.rows.map(e => e.name),
      colConfig:  cols.rows.map(c => ({ key: c.col_key, label: c.label, visible: c.visible })),
      llmConfig,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Framework ────────────────────────────────────────────────────
app.put("/api/config/framework", async (req, res) => {
  try {
    await withTx(async (client) => {
      await client.query("DELETE FROM framework_categories");
      let order = 0;
      for (const [name, data] of Object.entries(req.body)) {
        const { rows: [cat] } = await client.query(
          "INSERT INTO framework_categories(name,code,color,bg,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [name, data.code, data.color, data.bg || "#0f1629", order++]
        );
        for (let i = 0; i < data.items.length; i++)
          await client.query("INSERT INTO framework_items(category_id,name,sort_order) VALUES($1,$2,$3)", [cat.id, data.items[i], i]);
      }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 상태·우선순위·규모·컬럼 (공통 패턴: DELETE ALL → INSERT) ──────
const makeReplaceRoute = (path, table, mapper) => {
  app.put(path, async (req, res) => {
    try {
      await withTx(async (client) => {
        await client.query(`DELETE FROM ${table}`);
        for (const [i, row] of req.body.entries())
          await client.query(mapper.insert, [...mapper.values(row), i]);
      });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};

makeReplaceRoute("/api/config/statuses",   "statuses",   {
  insert: "INSERT INTO statuses(name,color,dot_color,sort_order) VALUES($1,$2,$3,$4)",
  values: r => [r.name, r.color, r.dot],
});
makeReplaceRoute("/api/config/priorities", "priorities", {
  insert: "INSERT INTO priorities(name,color,sort_order) VALUES($1,$2,$3)",
  values: r => [r.name, r.color],
});
makeReplaceRoute("/api/config/efforts",    "efforts",    {
  insert: "INSERT INTO efforts(name,sort_order) VALUES($1,$2)",
  values: r => [r],
});
makeReplaceRoute("/api/config/col-config", "col_config", {
  insert: "INSERT INTO col_config(col_key,label,visible,sort_order) VALUES($1,$2,$3,$4)",
  values: r => [r.key, r.label, r.visible],
});

// ── LLM 설정 ────────────────────────────────────────────────────
app.put("/api/config/llm", async (req, res) => {
  try {
    const c = req.body;
    await q(`
      INSERT INTO llm_config(id,provider,claude_api_key,claude_model,gemini_api_key,gemini_model,
        openai_api_key,openai_model,onprem_base_url,onprem_model,onprem_api_key,updated_at)
      VALUES(1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT(id) DO UPDATE SET
        provider=$1,claude_api_key=$2,claude_model=$3,gemini_api_key=$4,gemini_model=$5,
        openai_api_key=$6,openai_model=$7,onprem_base_url=$8,onprem_model=$9,onprem_api_key=$10,updated_at=NOW()`,
      [c.provider, c.claude?.apiKey||null, c.claude?.model, c.gemini?.apiKey||null, c.gemini?.model,
       c.openai?.apiKey||null, c.openai?.model, c.onprem?.baseUrl||null, c.onprem?.model||null, c.onprem?.apiKey||null]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Tasks ─────────────────────────────────────────────────────────
async function buildTask(client, row) {
  const [rd, hist] = await Promise.all([
    client.query("SELECT alias,category,code,sub,note FROM task_readiness WHERE task_id=$1 ORDER BY sort_order", [row.id]),
    client.query("SELECT date,content,author FROM task_history WHERE task_id=$1 ORDER BY created_at", [row.id]),
  ]);
  return {
    ...row,
    start_date:   row.start_date  ? row.start_date.toISOString().split("T")[0]  : "",
    due_date:     row.due_date    ? row.due_date.toISOString().split("T")[0]    : "",
    created_date: row.created_date? row.created_date.toISOString().split("T")[0]: "",
    tags:         row.tags || [],
    readiness:    rd.rows,
    history:      hist.rows.map(h => ({ date: h.date?.toISOString?.().split("T")[0] || h.date, content: h.content, author: h.author })),
  };
}

app.get("/api/tasks", async (req, res) => {
  try {
    const { rows } = await q("SELECT * FROM tasks ORDER BY created_at DESC");
    const tasks = await Promise.all(rows.map(r => buildTask(pool, r)));
    res.json(tasks);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function upsertReadinessAndHistory(client, taskId, readiness, history) {
  await client.query("DELETE FROM task_readiness WHERE task_id=$1", [taskId]);
  for (const [i, r] of (readiness || []).entries())
    await client.query("INSERT INTO task_readiness(task_id,alias,category,code,sub,note,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [taskId, r.alias||"", r.category||"", r.code||"", r.sub||"", r.note||"", i]);
  if (history) {
    await client.query("DELETE FROM task_history WHERE task_id=$1", [taskId]);
    for (const h of history)
      await client.query("INSERT INTO task_history(task_id,date,content,author) VALUES($1,$2,$3,$4)",
        [taskId, h.date, h.content, h.author||""]);
  }
}

app.post("/api/tasks", async (req, res) => {
  try {
    const t = req.body;
    const result = await withTx(async (client) => {
      const { rows: [{ count }] } = await client.query("SELECT COUNT(*) as count FROM tasks");
      const id = `TASK-${String(parseInt(count) + 1).padStart(3, "0")}`;
      await client.query(`
        INSERT INTO tasks(id,title,requester,owner,start_date,due_date,status,priority,effort_estimate,
          tags,background,request,as_is,to_be,constraints,notes,created_date)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [id, t.title, t.requester||"", t.owner||"", t.start_date||null, t.due_date||null,
         t.status, t.priority, t.effort_estimate, t.tags||[], t.background||"", t.request||"",
         t.as_is||"", t.to_be||"", t.constraints||"", t.notes||"",
         t.created_date || new Date().toISOString().split("T")[0]]);
      await upsertReadinessAndHistory(client, id, t.readiness, t.history);
      const { rows: [row] } = await client.query("SELECT * FROM tasks WHERE id=$1", [id]);
      return buildTask(client, row);
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const t = req.body;
    const result = await withTx(async (client) => {
      await client.query(`
        UPDATE tasks SET title=$1,requester=$2,owner=$3,start_date=$4,due_date=$5,status=$6,
          priority=$7,effort_estimate=$8,tags=$9,background=$10,request=$11,as_is=$12,to_be=$13,
          constraints=$14,notes=$15,updated_at=NOW() WHERE id=$16`,
        [t.title, t.requester||"", t.owner||"", t.start_date||null, t.due_date||null,
         t.status, t.priority, t.effort_estimate, t.tags||[], t.background||"", t.request||"",
         t.as_is||"", t.to_be||"", t.constraints||"", t.notes||"", id]);
      await upsertReadinessAndHistory(client, id, t.readiness, null);
      const { rows: [row] } = await client.query("SELECT * FROM tasks WHERE id=$1", [id]);
      return buildTask(client, row);
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    await q("DELETE FROM tasks WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Users ─────────────────────────────────────────────────────────
app.get("/api/users", async (req, res) => {
  try {
    const { rows } = await q("SELECT id,username,name,role,created_at FROM users ORDER BY id");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/users", async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    if (!username?.trim() || !password?.trim() || !name?.trim())
      return res.status(400).json({ error: "username, password, name은 필수입니다." });
    const { rows: [u] } = await q(
      "INSERT INTO users(username,password,name,role) VALUES($1,$2,$3,$4) RETURNING id,username,name,role",
      [username.trim(), password, name.trim(), role || "user"]
    );
    res.json(u);
  } catch (e) {
    if (e.code === "23505") res.status(400).json({ error: "이미 존재하는 아이디입니다." });
    else res.status(500).json({ error: e.message });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const { role } = req.body;
    const { rows: [u] } = await q(
      "UPDATE users SET role=$1 WHERE id=$2 RETURNING id,username,name,role",
      [role, req.params.id]
    );
    if (!u) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    res.json(u);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    await q("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── 서버 시작 ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server running on :${PORT}`));
