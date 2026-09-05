import { auth } from "./firebase";

async function token() {
  const u = auth.currentUser;
  if (!u) throw new Error("não autenticado");
  return u.getIdToken();
}

export async function api(endpoint) {
  const r = await fetch(`/api/${endpoint}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!r.ok) throw new Error((await r.json()).erro || r.statusText);
  return r.json();
}

export async function ask(pergunta) {
  const r = await fetch("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ pergunta }),
  });
  if (!r.ok) throw new Error((await r.json()).erro || r.statusText);
  return r.json();
}

export const brl = (v) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
