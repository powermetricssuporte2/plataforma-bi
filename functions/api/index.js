const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { BigQuery } = require("@google-cloud/bigquery");

admin.initializeApp();
const bq = new BigQuery();
const PROJECT = process.env.GCLOUD_PROJECT;

// Endpoints permitidos -> query. NUNCA interpolar input do usuário no SQL.
const QUERIES = {
  resumo:     (ds) => `SELECT * FROM \`${PROJECT}.${ds}.vw_resumo_home\``,
  faturamento:(ds) => `SELECT FORMAT_DATE('%Y-%m', mes) mes, faturamento, notas
                       FROM \`${PROJECT}.${ds}.vw_faturamento_mensal\`
                       WHERE mes >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH) ORDER BY mes`,
  vendas:     (ds) => `SELECT FORMAT_DATE('%d/%m', dia) dia, receita, cupons, ticket_medio
                       FROM \`${PROJECT}.${ds}.vw_vendas_pdv\`
                       WHERE dia >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) ORDER BY dia`,
  top_produtos:(ds) => `SELECT produto, receita, quantidade
                        FROM \`${PROJECT}.${ds}.vw_top_produtos\` LIMIT 15`,
  contas_pagar:(ds) => `SELECT FORMAT_DATE('%d/%m', semana) semana, total, vencido
                        FROM \`${PROJECT}.${ds}.vw_contas_pagar\`
                        WHERE semana >= DATE_SUB(CURRENT_DATE(), INTERVAL 8 WEEK) ORDER BY semana`,
  contas_receber:(ds) => `SELECT FORMAT_DATE('%Y-%m', mes) mes, recebido
                          FROM \`${PROJECT}.${ds}.vw_contas_receber\`
                          WHERE mes >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH) ORDER BY mes`,
  estoque:    (ds) => `SELECT grupo, itens, saldo FROM \`${PROJECT}.${ds}.vw_estoque_posicao\` LIMIT 20`,
  freshness:  (ds) => `SELECT MAX(finished_at) ultima FROM \`${PROJECT}._meta.ingest_log\`
                       WHERE cliente = '${ds}' AND status = 'OK'`,
  alerts:     (ds) => `SELECT mensagem, criado_em FROM \`${PROJECT}._meta.alerts\`
                       WHERE cliente = '${ds}' AND criado_em > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 26 HOUR)
                       ORDER BY criado_em DESC LIMIT 5`,
};

async function auth(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) throw new Error("sem token");
  const decoded = await admin.auth().verifyIdToken(h.slice(7));
  const cliente = decoded.cliente_id;
  if (!cliente || !/^[a-z0-9_]+$/.test(cliente)) throw new Error("usuário sem cliente_id");
  return cliente;
}

exports.api = onRequest({ region: "southamerica-east1", cors: true }, async (req, res) => {
  try {
    const cliente = await auth(req);
    const endpoint = (req.path || "/").replace(/^\/api\//, "").replace(/^\//, "");
    const q = QUERIES[endpoint];
    if (!q) return res.status(404).json({ erro: `endpoint desconhecido: ${endpoint}` });
    const [rows] = await bq.query({ query: q(cliente), maximumBytesBilled: "1073741824" });
    res.json(rows);
  } catch (e) {
    const code = /token|cliente_id/.test(String(e)) ? 401 : 500;
    res.status(code).json({ erro: String(e.message || e) });
  }
});
