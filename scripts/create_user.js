// Cria (ou atualiza) um usuário e grava os clientes que ele pode ver.
// Uso: node scripts/create_user.js <email> <senha> <cliente[,cliente2,...]>
//
// Usa a REST API do Identity Toolkit com o token do gcloud em vez do
// firebase-admin: o Admin SDK sobre ADC de usuário esbarra na política de
// reautenticação da organização (invalid_rapt) e falha ao criar usuários.
const { execFileSync } = require("child_process");

const [email, senha, clientesArg] = process.argv.slice(2);
if (!email || !senha || !clientesArg) {
  console.error("Uso: node scripts/create_user.js <email> <senha> <cliente[,cliente2]>");
  process.exit(1);
}
const projeto = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
if (!projeto) {
  console.error("Defina GCP_PROJECT_ID (ex.: export GCP_PROJECT_ID=powermetrics-bi)");
  process.exit(1);
}

const clientes = clientesArg.split(",").map((c) => c.trim()).filter(Boolean);
const invalido = clientes.find((c) => !/^[a-z0-9_]+$/.test(c));
if (invalido) {
  console.error(`cliente_id invalido: ${invalido} (use apenas letras minusculas, numeros e _)`);
  process.exit(1);
}

function tokenDoGcloud() {
  try {
    // No Windows o executável é gcloud.cmd; shell:true resolve nos dois sistemas.
    return execFileSync("gcloud", ["auth", "print-access-token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    }).trim();
  } catch (e) {
    const saida = String(e.stderr || e.message || "");
    if (/[Rr]eauthentication|credentials/.test(saida)) {
      console.error("Sessao do gcloud expirada. Rode `gcloud auth login` e tente de novo.");
    } else {
      console.error("Nao consegui obter o token do gcloud: " + saida.trim());
    }
    process.exit(1);
  }
}

const token = tokenDoGcloud();
const base = `https://identitytoolkit.googleapis.com/v1/projects/${projeto}`;
const cabecalhos = {
  Authorization: `Bearer ${token}`,
  "x-goog-user-project": projeto,
  "Content-Type": "application/json",
};

async function chamar(caminho, corpo) {
  const r = await fetch(`${base}${caminho}`, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  });
  const dados = await r.json();
  if (!r.ok) throw new Error(dados?.error?.message || JSON.stringify(dados));
  return dados;
}

(async () => {
  let uid;
  const achado = await chamar("/accounts:lookup", { email: [email] });
  if (achado.users?.length) {
    uid = achado.users[0].localId;
    await chamar("/accounts:update", { localId: uid, password: senha });
    console.log(`usuario existente atualizado: ${email}`);
  } else {
    uid = (await chamar("/accounts", { email, password: senha, emailVerified: true })).localId;
    console.log(`usuario criado: ${email}`);
  }
  // cliente_id (1o da lista) mantem compatibilidade com tokens antigos.
  const claims = JSON.stringify({ clientes, cliente_id: clientes[0] });
  await chamar("/accounts:update", { localId: uid, customAttributes: claims });
  console.log(`OK: ${email} -> ${clientes.join(", ")}`);
})().catch((e) => {
  console.error("falhou:", e.message);
  process.exit(1);
});
