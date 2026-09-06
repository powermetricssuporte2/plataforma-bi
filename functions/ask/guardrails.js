// Validação do SQL gerado pela IA antes de executar.
// O isolamento entre clientes depende disto: uma referência a outro dataset
// que passe daqui vira vazamento de dados de um cliente para outro.
function validateSql(sql, project, dataset) {
  const s = sql.trim().replace(/;\s*$/, "");
  if (/;/.test(s)) return "múltiplas instruções não permitidas";
  if (!/^\s*(SELECT|WITH)\b/i.test(s)) return "apenas SELECT é permitido";
  if (/\b(INSERT|UPDATE|DELETE|MERGE|DROP|CREATE|ALTER|TRUNCATE|GRANT|CALL|EXPORT)\b/i.test(s))
    return "instrução proibida detectada";

  // Toda tabela citada após FROM/JOIN, com ou sem crases: sem crases também
  // é SQL válido no BigQuery, então validar só o que está entre crases não basta.
  const alvos = [...s.matchAll(/\b(?:FROM|JOIN)\s+(`[^`]+`|[\w$-]+(?:\.[\w$-]+)*)/gi)]
    .map((m) => m[1].replace(/`/g, ""));
  for (const alvo of alvos) {
    if (!alvo.includes(".")) continue;            // nome simples: sem dataset alheio
    if (alvo.startsWith(`${project}.${dataset}.`)) continue;
    if (alvo.startsWith(`${dataset}.`)) continue;
    return `referência fora do dataset do cliente: ${alvo}`;
  }

  // Crases restantes (subqueries, UNNEST de tabela) seguem validadas.
  for (const r of [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1])) {
    if (r.includes(".") && !r.startsWith(`${project}.${dataset}.`) && !r.startsWith(`${dataset}.`))
      return `referência fora do dataset do cliente: ${r}`;
  }
  return null;
}
function enforceLimit(sql, max = 500) {
  return /\blimit\s+\d+\s*$/i.test(sql.trim()) ? sql : `${sql.trim()} LIMIT ${max}`;
}
module.exports = { validateSql, enforceLimit };
