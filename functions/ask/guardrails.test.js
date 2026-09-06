const { validateSql, enforceLimit } = require("./guardrails");
const P = "proj", D = "cli";
let n = 0;
const checa = (cond, msg) => { n++; if (!cond) { console.error("FALHOU:", msg); process.exit(1); } };

checa(validateSql("SELECT * FROM `proj.cli.vw_vendas_pdv`", P, D) === null, "select válido rejeitado");
checa(validateSql("SELECT * FROM cli.vw_x", P, D) === null, "dataset sem projeto rejeitado");
checa(validateSql("DELETE FROM x", P, D) !== null, "DELETE passou");
checa(validateSql("SELECT 1; DROP TABLE x", P, D) !== null, "encadeado passou");
checa(validateSql("SELECT * FROM `proj.outro.t`", P, D) !== null, "dataset alheio com crases passou");
// Sem crases também é SQL válido: é por aqui que vazaria dado de outro cliente.
checa(validateSql("SELECT * FROM outro_cliente.vw_vendas_pdv", P, D) !== null, "dataset alheio sem crases passou");
checa(validateSql("SELECT * FROM outro.INFORMATION_SCHEMA.COLUMNS", P, D) !== null, "INFORMATION_SCHEMA alheio passou");
checa(validateSql("SELECT a FROM `proj.cli.v1` JOIN outro.t2 ON 1=1", P, D) !== null, "JOIN alheio passou");
checa(validateSql("SELECT a FROM `proj.cli.v1` JOIN `proj.cli.v2` ON 1=1", P, D) === null, "JOIN válido rejeitado");
checa(enforceLimit("SELECT 1").endsWith("LIMIT 500"), "limit não aplicado");
checa(enforceLimit("SELECT 1 LIMIT 10").endsWith("LIMIT 10"), "limit sobrescrito");
console.log(`guardrails: ${n}/${n} OK`);
