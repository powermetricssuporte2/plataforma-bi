const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { BigQuery } = require("@google-cloud/bigquery");

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
  // Só alerta ainda pendente: se houve carga OK depois dele, a falha já foi superada.
  alerts:     (ds) => `SELECT mensagem, criado_em FROM \`${PROJECT}._meta.alerts\`
                       WHERE cliente = '${ds}' AND criado_em > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 26 HOUR)
                         AND criado_em > COALESCE((SELECT MAX(finished_at) FROM \`${PROJECT}._meta.ingest_log\`
                                                   WHERE cliente = '${ds}'
                                                     AND status IN ('OK', 'VERIFICADO')), TIMESTAMP('1970-01-01'))
                       ORDER BY criado_em DESC LIMIT 5`,
};


// Panorama da carteira: uma linha por cliente com a ultima carga bem-sucedida,
// quantas tabelas vieram nela e qual foi a ultima falha ainda nao superada.
// Recebe a lista de clientes por parametro — nunca concatenada no SQL.
const SQL_STATUS = `
WITH ok AS (
  SELECT cliente, MAX(finished_at) ultima
  FROM \`${PROJECT}._meta.ingest_log\`
  WHERE status = 'OK' AND cliente IN UNNEST(@ids)
  GROUP BY cliente
),
-- Ultima passagem sem falha, mesmo que nada tenha mudado no Drive.
verificado AS (
  SELECT cliente, MAX(finished_at) quando
  FROM \`${PROJECT}._meta.ingest_log\`
  WHERE status IN ('OK', 'VERIFICADO') AND cliente IN UNNEST(@ids)
  GROUP BY cliente
),
tabelas AS (
  SELECT l.cliente, COUNT(DISTINCT l.tabela) tabelas, SUM(l.linhas) linhas
  FROM \`${PROJECT}._meta.ingest_log\` l
  JOIN ok ON ok.cliente = l.cliente
  WHERE l.status = 'OK' AND l.finished_at > TIMESTAMP_SUB(ok.ultima, INTERVAL 6 HOUR)
  GROUP BY l.cliente
),
falha AS (
  SELECT a.cliente, ANY_VALUE(a.mensagem) mensagem, MAX(a.criado_em) quando
  FROM \`${PROJECT}._meta.alerts\` a
  LEFT JOIN ok ON ok.cliente = a.cliente
  LEFT JOIN verificado v ON v.cliente = a.cliente
  WHERE a.cliente IN UNNEST(@ids)
    AND a.criado_em > COALESCE(v.quando, ok.ultima, TIMESTAMP('1970-01-01'))
  GROUP BY a.cliente
)
SELECT c.id, COALESCE(c.nome, c.id) nome, ok.ultima,
       TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), ok.ultima, HOUR) horas,
       TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), v.quando, HOUR) horas_verificacao,
       t.tabelas, t.linhas, f.mensagem AS falha
FROM \`${PROJECT}._meta.clientes\` c
LEFT JOIN ok ON ok.cliente = c.id
LEFT JOIN verificado v ON v.cliente = c.id
LEFT JOIN tabelas t ON t.cliente = c.id
LEFT JOIN falha f ON f.cliente = c.id
WHERE c.id IN UNNEST(@ids)
ORDER BY ok.ultima IS NULL DESC, ok.ultima ASC`;


// Inventario dos .pbix do Drive. Nao e filtrado por cliente: e a visao da
// carteira de relatorios, que existe mesmo para empresa que ainda nao exporta
// dados para o BigQuery.
const SQL_RELATORIOS = `
-- A correcao feita na tela vence o que veio do Drive, e o relatorio ocultado
-- some da lista. Guardar isso a parte deixa o inventario livre para ser
-- reescrito a cada ciclo sem perder o ajuste.
WITH ajuste AS (
  SELECT arquivo_id, ANY_VALUE(empresa HAVING MAX ajustado_em) empresa,
         ANY_VALUE(oculto HAVING MAX ajustado_em) oculto
  FROM \`${PROJECT}._meta.relatorios_ajustes\`
  GROUP BY arquivo_id
)
SELECT r.arquivo_id, COALESCE(a.empresa, r.empresa) empresa, r.nome, r.caminho,
       r.categoria, r.modificado_em, r.tamanho_bytes,
       TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), r.modificado_em, DAY) dias,
       a.empresa IS NOT NULL AS corrigido
FROM \`${PROJECT}._meta.relatorios\` r
LEFT JOIN ajuste a ON a.arquivo_id = r.arquivo_id
WHERE NOT COALESCE(a.oculto, FALSE)
ORDER BY r.modificado_em DESC`;

// O usuário pode ter acesso a vários clientes; `?cliente=` escolhe qual, sempre
// validado contra a lista do token — nunca contra o que o navegador afirma.
function clientesDoToken(decoded) {
  const lista = Array.isArray(decoded.clientes) ? decoded.clientes : [];
  if (decoded.cliente_id) lista.push(decoded.cliente_id);
  return [...new Set(lista)].filter((c) => /^[a-z0-9_]+$/.test(c));
}

async function auth(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) throw new Error("sem token");
  const decoded = await admin.auth().verifyIdToken(h.slice(7));
  const quem = decoded.email || decoded.uid;
  const permitidos = clientesDoToken(decoded);
  if (!permitidos.length) throw new Error("usuário sem cliente_id");
  const pedido = String(req.query?.cliente || "");
  if (pedido && !permitidos.includes(pedido)) throw new Error("cliente_id não autorizado");
  return { cliente: pedido || permitidos[0], permitidos, quem };
}

exports.api = onRequest({ region: "southamerica-east1", cors: ORIGENS }, async (req, res) => {
  try {
    const { cliente, permitidos, quem: quemPediu } = await auth(req);
    const endpoint = (req.path || "/").replace(/^\/api\//, "").replace(/^\//, "");
    if (endpoint === "clientes") {
      const [nomes] = await bq.query({
        query: `SELECT id, nome FROM \`${PROJECT}._meta.clientes\` WHERE id IN UNNEST(@ids)`,
        params: { ids: permitidos },
      });
      const mapa = Object.fromEntries(nomes.map((r) => [r.id, r.nome]));
      return res.json(permitidos.map((id) => ({ id, nome: mapa[id] || id })));
    }
    if (endpoint === "relatorios" && req.method === "POST") {
      const { arquivo_id: arquivoId, empresa, oculto } = req.body || {};
      if (!arquivoId || typeof arquivoId !== "string") {
        return res.status(400).json({ erro: "arquivo_id obrigatório" });
      }
      const nome = empresa == null ? null : String(empresa).trim().toUpperCase().slice(0, 120);
      await bq.query({
        query: `INSERT INTO \`${PROJECT}._meta.relatorios_ajustes\`
                (arquivo_id, empresa, oculto, ajustado_por, ajustado_em)
                VALUES (@id, @empresa, @oculto, @quem, CURRENT_TIMESTAMP())`,
        params: { id: arquivoId, empresa: nome, oculto: !!oculto, quem: quemPediu },
        types: { empresa: "STRING" },
      });
      return res.json({ ok: true });
    }
    if (endpoint === "relatorios") {
      const [linhas] = await bq.query({ query: SQL_RELATORIOS });
      return res.json(linhas);
    }
    if (endpoint === "status") {
      const [linhas] = await bq.query({ query: SQL_STATUS, params: { ids: permitidos } });
      return res.json(linhas);
    }
    const q = QUERIES[endpoint];
    if (!q) return res.status(404).json({ erro: `endpoint desconhecido: ${endpoint}` });
    const [rows] = await bq.query({ query: q(cliente), maximumBytesBilled: "1073741824" });
    res.json(rows);
  } catch (e) {
    const code = /token|cliente_id/.test(String(e)) ? 401 : 500;
    res.status(code).json({ erro: String(e.message || e) });
  }
});
