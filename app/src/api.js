import { auth } from "./firebase";

// Cliente ativo do seletor. O backend revalida contra o token — isto é só a escolha da UI.
// Restaurado no carregamento para a 1ª requisição já sair no cliente certo.
let clienteAtual = (() => {
  try {
    return localStorage.getItem("pm-cliente");
  } catch {
    return null;
  }
})();
export const setCliente = (id) => { clienteAtual = id; };

async function token() {
  const u = auth.currentUser;
  if (!u) throw new Error("não autenticado");
  return u.getIdToken();
}

// Erro da borda do Hosting vem em HTML; sem isto o usuario via
// "Unexpected token '<'" em vez de uma mensagem util.
async function erroDaResposta(r) {
  try {
    const j = await r.json();
    return j.erro || r.statusText;
  } catch {
    return r.status === 404
      ? "Serviço indisponível no momento. Recarregue a página."
      : `Falha na consulta (HTTP ${r.status}).`;
  }
}

export async function api(endpoint, cliente = clienteAtual) {
  const qs = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";
  // no-store: durante um deploy o Hosting pode devolver 404 por alguns
  // segundos, e o navegador guardaria essa resposta, quebrando o app ate
  // alguem limpar o cache.
  const r = await fetch(`/api/${endpoint}${qs}`, {
    headers: { Authorization: `Bearer ${await token()}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await erroDaResposta(r));
  return r.json();
}

export async function ask(pergunta, cliente = clienteAtual) {
  const r = await fetch("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    cache: "no-store",
    body: JSON.stringify({ pergunta, cliente }),
  });
  if (!r.ok) throw new Error(await erroDaResposta(r));
  return r.json();
}

export const brl = (v) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
