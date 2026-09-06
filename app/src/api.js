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

export async function api(endpoint, cliente = clienteAtual) {
  const qs = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";
  const r = await fetch(`/api/${endpoint}${qs}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!r.ok) throw new Error((await r.json()).erro || r.statusText);
  return r.json();
}

export async function ask(pergunta, cliente = clienteAtual) {
  const r = await fetch("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ pergunta, cliente }),
  });
  if (!r.ok) throw new Error((await r.json()).erro || r.statusText);
  return r.json();
}

export const brl = (v) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
