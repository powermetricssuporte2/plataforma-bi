// Validação do SQL gerado pela IA antes de executar.
function validateSql(sql, project, dataset) {
  const s = sql.trim().replace(/;\s*$/, "");
  if (/;/.test(s)) return "múltiplas instruções não permitidas";
  if (!/^\s*(SELECT|WITH)\b/i.test(s)) return "apenas SELECT é permitido";
  if (/\b(INSERT|UPDATE|DELETE|MERGE|DROP|CREATE|ALTER|TRUNCATE|GRANT|CALL|EXPORT)\b/i.test(s))
    return "instrução proibida detectada";
  // só pode referenciar o dataset do cliente (ou nenhum qualificador)
  const refs = [...s.matchAll(/`([^`]+)`/g)].map(m => m[1]);
  for (const r of refs) {
    if (r.includes(".") && !r.startsWith(`${project}.${dataset}.`) && !r.startsWith(`${dataset}.`))
      return `referência fora do dataset do cliente: ${r}`;
  }
  return null;
}
function enforceLimit(sql, max = 500) {
  return /\blimit\s+\d+\s*$/i.test(sql.trim()) ? sql : `${sql.trim()} LIMIT ${max}`;
}
module.exports = { validateSql, enforceLimit };
