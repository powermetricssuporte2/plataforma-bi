import { useEffect, useState } from "react";
import { api, setCliente } from "../api";

const CHAVE = "pm-cliente";

export default function SeletorCliente({ atual, aoTrocar }) {
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    api("clientes", "")
      .then((lista) => {
        setClientes(lista);
        let escolhido = null;
        try {
          escolhido = localStorage.getItem(CHAVE);
        } catch {}
        if (!lista.some((c) => c.id === escolhido)) escolhido = lista[0]?.id || null;
        if (escolhido) {
          setCliente(escolhido);
          aoTrocar(escolhido);
        }
      })
      .catch(() => {});
  }, []);

  function trocar(id) {
    setCliente(id);
    try {
      localStorage.setItem(CHAVE, id);
    } catch {}
    aoTrocar(id);
  }

  if (clientes.length < 2) return null;

  return (
    <select className="seletor-cliente" value={atual || ""} onChange={(e) => trocar(e.target.value)}
      aria-label="Cliente">
      {clientes.map((c) => (
        <option key={c.id} value={c.id}>{c.nome}</option>
      ))}
    </select>
  );
}
