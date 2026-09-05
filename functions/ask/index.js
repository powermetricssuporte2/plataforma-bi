const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { BigQuery } = require("@google-cloud/bigquery");
const Anthropic = require("@anthropic-ai/sdk");
const { validateSql, enforceLimit } = require("./guardrails");

admin.initializeApp();
const bq = new BigQuery();
const PROJECT = process.env.GCLOUD_PROJECT;
let schemaCache = {};

async function schemaDoCliente(ds) {
  if (schemaCache[ds] && Date.now() - schemaCache[ds].t < 3600e3) return schemaCache[ds].v;
  const [rows] = await bq.query(`
    SELECT table_name, ARRAY_AGG(column_name ORDER BY ordinal_position) cols
    FROM \`${PROJECT}.${ds}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name LIKE 'vw_%' GROUP BY table_name`);
  const v = rows.map(r => `${r.table_name}(${r.cols.join(", ")})`).join("\n");
  schemaCache[ds] = { t: Date.now(), v };
  return v;
}

exports.ask = onRequest(
  { region: "southamerica-east1", cors: true, secrets: ["anthropic-api-key"], timeoutSeconds: 60 },
  async (req, res) => {
    try {
      const h = req.headers.authorization || "";
      const decoded = await admin.auth().verifyIdToken(h.replace("Bearer ", ""));
      const ds = decoded.cliente_id;
      if (!ds || !/^[a-z0-9_]+$/.test(ds)) return res.status(401).json({ erro: "usuário sem cliente_id" });

      const pergunta = String(req.body?.pergunta || "").slice(0, 500);
      if (!pergunta) return res.status(400).json({ erro: "pergunta vazia" });

      const client = new Anthropic({ apiKey: process.env["anthropic-api-key"] });
      const schema = await schemaDoCliente(ds);
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: `Você gera SQL BigQuery para um dashboard. Views disponíveis no dataset \`${PROJECT}.${ds}\`:
${schema}
Regras: responda SOMENTE um JSON {"sql": "...", "titulo": "...", "tipo_grafico": "tabela|barras|linha"}.
Use apenas SELECT sobre as views acima, sempre com o caminho completo \`${PROJECT}.${ds}.vw_...\`.
Datas no fuso America/Sao_Paulo. Valores em BRL.
Exemplos:
P: qual foi o faturamento de agosto? -> {"sql":"SELECT faturamento FROM \`${PROJECT}.${ds}.vw_faturamento_mensal\` WHERE mes = DATE '2026-08-01'","titulo":"Faturamento de agosto","tipo_grafico":"tabela"}
P: 10 produtos mais vendidos -> {"sql":"SELECT produto, receita FROM \`${PROJECT}.${ds}.vw_top_produtos\` LIMIT 10","titulo":"Top 10 produtos","tipo_grafico":"barras"}
P: vendas por dia no último mês -> {"sql":"SELECT dia, receita FROM \`${PROJECT}.${ds}.vw_vendas_pdv\` WHERE dia >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) ORDER BY dia","titulo":"Vendas diárias","tipo_grafico":"linha"}`,
        messages: [{ role: "user", content: pergunta }],
      });
      const texto = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
      const plano = JSON.parse(texto.replace(/```json|```/g, "").trim());

      const erroSql = validateSql(plano.sql, PROJECT, ds);
      if (erroSql) return res.status(400).json({ erro: `SQL rejeitado: ${erroSql}` });

      const [rows] = await bq.query({
        query: enforceLimit(plano.sql),
        maximumBytesBilled: "1073741824",
        jobTimeoutMs: 30000,
      });
      res.json({ titulo: plano.titulo, tipo_grafico: plano.tipo_grafico, sql: plano.sql, linhas: rows });
    } catch (e) {
      res.status(500).json({ erro: String(e.message || e) });
    }
  }
);
