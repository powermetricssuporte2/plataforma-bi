const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { BigQuery } = require("@google-cloud/bigquery");
const Anthropic = require("@anthropic-ai/sdk");
const { validateSql, enforceLimit } = require("./guardrails");

admin.initializeApp();
const bq = new BigQuery();
const PROJECT = process.env.GCLOUD_PROJECT;
// Só o app hospedado pode chamar estas funções pelo navegador. Nao substitui a
// checagem do token, mas evita que outra pagina use a sessao de quem esta logado.
const ORIGENS = [
  `https://${process.env.GCLOUD_PROJECT}.web.app`,
  `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com`,
  "http://localhost:5173",
];

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
  { region: "southamerica-east1", cors: ORIGENS, secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 60 },
  async (req, res) => {
    try {
      const h = req.headers.authorization || "";
      const decoded = await admin.auth().verifyIdToken(h.replace("Bearer ", ""));
      const permitidos = [...new Set([...(Array.isArray(decoded.clientes) ? decoded.clientes : []),
                                      ...(decoded.cliente_id ? [decoded.cliente_id] : [])])]
        .filter((c) => /^[a-z0-9_]+$/.test(c));
      if (!permitidos.length) return res.status(401).json({ erro: "usuário sem cliente_id" });
      const pedido = String(req.body?.cliente || "");
      if (pedido && !permitidos.includes(pedido)) return res.status(401).json({ erro: "cliente_id não autorizado" });
      const ds = pedido || permitidos[0];

      const pergunta = String(req.body?.pergunta || "").slice(0, 500);
      if (!pergunta) return res.status(400).json({ erro: "pergunta vazia" });

      // .trim(): secret criado via pipe costuma trazer quebra de linha no fim,
      // que o header HTTP rejeita.
      const client = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY || "").trim() });
      const schema = await schemaDoCliente(ds);
      const msg = await client.messages.create({
        model: "claude-sonnet-5",
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
      console.error("falha em /ask", { nome: e.name, mensagem: e.message });
      const cru = String(e.message || e);
      // Token ausente/inválido é 401 do chamador, não falha do servidor.
      if (/ID token|Decoding Firebase/i.test(cru)) return res.status(401).json({ erro: "sem token válido" });
      // Erro de credencial da IA é problema de configuração, não da pergunta.
      const erro = e.status === 401 || /authentication_error|API key/i.test(cru)
        ? "A chave da IA está inválida ou expirada. Configure o secret ANTHROPIC_API_KEY."
        : cru;
      res.status(500).json({ erro });
    }
  }
);
