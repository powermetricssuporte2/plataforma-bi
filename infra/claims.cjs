// Lista usuarios e, com --aplicar, grava a lista de clientes ativos no token.
// Cliente novo so aparece no seletor depois disto: o front monta a lista a
// partir da claim `clientes`, e a API recusa dataset fora dela.
// Uso: NODE_PATH=../functions/api/node_modules node infra/claims.cjs [--aplicar]
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
admin.initializeApp({ projectId: "powermetrics-bi" });

const yamlPath = path.join(__dirname, "..", "config", "clientes.yaml");
const ativos = fs.readFileSync(yamlPath, "utf8")
  .split(/\r?\n/)
  .reduce((acc, l) => {
    const id = /^\s*-\s*id:\s*(\S+)/.exec(l);
    if (id) acc.push({ id: id[1], ativo: false });
    const at = /^\s*ativo:\s*(true|false)/.exec(l);
    if (at && acc.length) acc[acc.length - 1].ativo = at[1] === "true";
    return acc;
  }, [])
  .filter((c) => c.ativo)
  .map((c) => c.id);

(async () => {
  const { users } = await admin.auth().listUsers(100);
  for (const u of users) {
    const atual = u.customClaims?.clientes || [];
    const faltando = ativos.filter((c) => !atual.includes(c));
    console.log(u.email, "| clientes no token:", atual.length, "| faltando:", faltando.join(",") || "-");
    if (process.argv.includes("--aplicar") && faltando.length) {
      await admin.auth().setCustomUserClaims(u.uid, { ...u.customClaims, clientes: ativos });
      console.log("  -> atualizado para", ativos.length, "clientes");
    }
  }
})();
