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

// Views curadas E tabelas cruas do ERP. So as views nao bastam: pergunta como
// "quantas infracoes neste mes" nao cabe em vw_faturamento_mensal, e o dado
// esta no CSV cru. Como o guardrail prende o SQL ao dataset do cliente, abrir
// as tabelas cruas nao amplia o alcance de ninguem — so o vocabulario.
async function schemaDoCliente(ds) {
  if (schemaCache[ds] && Date.now() - schemaCache[ds].t < 3600e3) return schemaCache[ds].v;
  const [rows] = await bq.query(`
    SELECT table_name, ARRAY_AGG(column_name ORDER BY ordinal_position) cols
    FROM \`${PROJECT}.${ds}.INFORMATION_SCHEMA.COLUMNS\`
    GROUP BY table_name ORDER BY table_name`);
  const views = rows.filter((r) => r.table_name.startsWith("vw_"));
  const cruas = rows.filter((r) => !r.table_name.startsWith("vw_"));
  const linha = (r) => `${r.table_name}(${r.cols.join(", ")})`;
  const v = [
    "Views prontas (numeros ja corrigidos, use primeiro quando servirem):",
    views.map(linha).join(String.fromCharCode(10)),
    "",
    "Tabelas cruas do ERP, exportadas do CSV (todas as colunas sao STRING):",
    cruas.map(linha).join(String.fromCharCode(10)),
  ].join(String.fromCharCode(10));
  schemaCache[ds] = { t: Date.now(), v };
  return v;
}


// Estado das cargas dos clientes que o usuario pode ver. E entregue pronto no
// prompt: a IA nunca consulta _meta, que e comum a toda a carteira.
async function estadoDasCargas(ids) {
  const [linhas] = await bq.query({
    query: `
      WITH ok AS (
        SELECT cliente, MAX(finished_at) ultima FROM \`${PROJECT}._meta.ingest_log\`
        WHERE status = 'OK' AND cliente IN UNNEST(@ids) GROUP BY cliente
      )
      SELECT COALESCE(c.nome, c.id) nome, ok.ultima,
             TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), ok.ultima, HOUR) horas
      FROM \`${PROJECT}._meta.clientes\` c
      LEFT JOIN ok ON ok.cliente = c.id
      WHERE c.id IN UNNEST(@ids)
      ORDER BY ok.ultima IS NULL DESC, ok.ultima ASC`,
    params: { ids },
  });
  return linhas
    .map((l) => `- ${l.nome}: ${l.horas == null ? "nunca atualizado"
      : l.horas < 1 ? "atualizado há menos de 1 h" : `atualizado há ${l.horas} h`}`)
    .join(String.fromCharCode(10));
}


// Relatorios Power BI do Drive, com quanto tempo estao sem alteracao. Vem
// pronto no prompt pelo mesmo motivo do estado das cargas: e informacao da
// carteira, nao do dataset de um cliente.
async function estadoDosRelatorios() {
  const [linhas] = await bq.query({
    query: `
      WITH ajuste AS (
        SELECT arquivo_id, ANY_VALUE(oculto HAVING MAX ajustado_em) oculto,
               ANY_VALUE(frequencia HAVING MAX ajustado_em) frequencia,
               ANY_VALUE(empresa HAVING MAX ajustado_em) empresa
        FROM \`${PROJECT}._meta.relatorios_ajustes\`
        GROUP BY arquivo_id
      )
      SELECT COALESCE(a.empresa, r.empresa) empresa, r.nome, a.frequencia,
             TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), r.modificado_em, HOUR) horas,
             TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), r.modificado_em, DAY) dias
      FROM \`${PROJECT}._meta.relatorios\` r
      LEFT JOIN ajuste a ON a.arquivo_id = r.arquivo_id
      WHERE r.categoria = 'cliente' AND NOT COALESCE(a.oculto, FALSE)
      ORDER BY a.frequencia IS NULL, r.modificado_em DESC
      LIMIT 200`,
  });
  if (!linhas.length) return "(inventario ainda nao gerado)";
  const PRAZO = { horaria: 2, diaria: 30, semanal: 8 * 24, mensal: 33 * 24 };
  return linhas
    .map((l) => {
      const prazo = PRAZO[l.frequencia];
      const combinado = l.frequencia ? `, esperado ${l.frequencia}` : ", sem acompanhamento";
      const situacao = prazo != null && l.horas > prazo ? " — FORA DO PRAZO" : "";
      return `- ${l.empresa} / ${l.nome}: alterado ha ${l.dias} dia(s)${combinado}${situacao}`;
    })
    .join(String.fromCharCode(10));
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
      const cargas = await estadoDasCargas(permitidos);
      const relatorios = await estadoDosRelatorios();
      const msg = await client.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1500,
        system: `Você responde sobre os indicadores de um cliente e sobre o estado das atualizações.

Views do cliente selecionado, no dataset \`${PROJECT}.${ds}\`:
${schema}

Estado das atualizações da carteira deste usuário (dado já apurado, não consultável por SQL):
${cargas}

Relatórios Power BI no Drive, com a frequência de atualização combinada para
cada um e se estão fora do prazo (dado já apurado):
${relatorios}

Se a pergunta for sobre atualização, atraso, falha, relatório Power BI, .pbix
ou "há quanto tempo", responda
com {"resposta": "...", "titulo": "...", "tipo_grafico": "texto"} usando só a
lista acima — aponte quem está atrasado e o que isso significa. Seja breve: no máximo 6
itens, sem listar arquivo por arquivo.

Para QUALQUER outra pergunta, gere SQL sobre os dados do cliente. O objetivo é
substituir o Power BI: se o número existe no CSV exportado do ERP, ele é
consultável aqui. Nunca responda que não tem acesso ao dado sem antes procurar
uma tabela crua que o contenha.
Regras: responda SOMENTE um JSON {"sql": "...", "titulo": "...", "tipo_grafico": "tabela|barras|linha"}.
Use apenas SELECT, sempre com o caminho completo \`${PROJECT}.${ds}.<tabela>\`.
Nas tabelas cruas toda coluna é STRING, então:
- valor/quantidade: \`${PROJECT}.${ds}\`.pm_num(COLUNA) — corrige a vírgula decimal
  e a escala do export do SB (NUMERIC sem ponto). Nunca some a coluna direto.
- data/hora: SAFE_CAST(COLUNA AS TIMESTAMP) (formato "2024-04-22 18:15:19.392000");
  para agrupar por dia/mês use DATE(...) ou DATE_TRUNC(DATE(...), MONTH).
- ignore colunas com sufixo de cancelamento/estorno ao contar vendas.
Se a pergunta citar outra empresa que não a selecionada, não tente adivinhar:
responda em texto pedindo para trocar o cliente no seletor do topo, porque cada
cliente vive num banco separado.
Se nenhuma tabela do cliente tiver o assunto perguntado (ex.: multas, infrações,
telemetria em um cliente de varejo), responda em texto dizendo qual dado faltaria
e que a exportação daquele módulo precisa entrar na pasta Dados_Bi do Drive.
Datas no fuso America/Sao_Paulo. Valores em BRL.
Exemplos:
P: qual foi o faturamento de agosto? -> {"sql":"SELECT faturamento FROM \`${PROJECT}.${ds}.vw_faturamento_mensal\` WHERE mes = DATE '2026-08-01'","titulo":"Faturamento de agosto","tipo_grafico":"tabela"}
P: 10 produtos mais vendidos -> {"sql":"SELECT produto, receita FROM \`${PROJECT}.${ds}.vw_top_produtos\` LIMIT 10","titulo":"Top 10 produtos","tipo_grafico":"barras"}
P: vendas por dia no último mês -> {"sql":"SELECT dia, receita FROM \`${PROJECT}.${ds}.vw_vendas_pdv\` WHERE dia >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) ORDER BY dia","titulo":"Vendas diárias","tipo_grafico":"linha"}`,
        messages: [{ role: "user", content: pergunta }],
      });
      const texto = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
      // A IA nem sempre devolve JSON: quando recusa a pergunta (por exemplo uma
      // tentativa de ler o dataset de outro cliente) ela responde em texto, e
      // isso deve chegar ao usuario como resposta, nao como erro de parsing.
      const limpo = texto.replace(/```json|```/g, "").trim();
      let plano;
      try {
        plano = JSON.parse(limpo);
      } catch {
        // Resposta longa demais chega com o JSON cortado no meio da string, e o
        // usuario via `{"resposta": "...` cru na tela. Salva o campo de texto.
        const m = /"resposta"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(limpo);
        const texto_ = m
          ? m[1].replace(/\\n/g, String.fromCharCode(10)).replace(/\\"/g, String.fromCharCode(34))
          : limpo;
        return res.json({ titulo: "Resposta", tipo_grafico: "texto", resposta: texto_, linhas: [] });
      }

      if (plano.tipo_grafico === "texto" || (!plano.sql && plano.resposta)) {
        return res.json({ titulo: plano.titulo || "Situação das atualizações",
                          tipo_grafico: "texto", resposta: String(plano.resposta || ""), linhas: [] });
      }

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
