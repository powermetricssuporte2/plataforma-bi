import { useState } from "react";
import { ask } from "../api";
import Painel from "../components/Painel";
import { Linha, Barras } from "../components/charts";

const sugestoes = [
  "Qual foi o faturamento de agosto?",
  "Quais os 10 produtos mais vendidos?",
  "Como estão as vendas por dia neste mês?",
];

export default function Ia() {
  const [pergunta, setPergunta] = useState("");
  const [resp, setResp] = useState(null);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  async function enviar(p) {
    const q = p || pergunta;
    if (!q.trim()) return;
    setBusy(true); setErro(""); setResp(null);
    try {
      setResp(await ask(q));
    } catch (e) {
      setErro(String(e.message));
    } finally {
      setBusy(false);
    }
  }

  const cols = resp?.linhas?.[0] ? Object.keys(resp.linhas[0]) : [];

  return (
    <div className="chat">
      <div className="pergunta">
        <input
          value={pergunta}
          placeholder="Pergunte sobre seus dados…"
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
        />
        <button className="cta" disabled={busy} onClick={() => enviar()}>
          {busy ? "Consultando…" : "Perguntar"}
        </button>
      </div>
      <div className="muted">
        {sugestoes.map((s) => (
          <a key={s} style={{ marginRight: 14, cursor: "pointer" }} onClick={() => { setPergunta(s); enviar(s); }}>
            {s}
          </a>
        ))}
      </div>
      {erro && <div className="alerta">{erro}</div>}
      {resp && (
        <Painel titulo={resp.titulo}>
          {resp.tipo_grafico === "linha" && cols.length >= 2 && (
            <Linha data={resp.linhas} x={cols[0]} y={cols[1]} />
          )}
          {resp.tipo_grafico === "barras" && cols.length >= 2 && (
            <Barras data={resp.linhas} x={cols[0]} ys={[cols[1]]} horizontal altura={360} />
          )}
          {(resp.tipo_grafico === "tabela" || cols.length < 2) && (
            <table className="dados">
              <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {resp.linhas.map((l, i) => (
                  <tr key={i}>{cols.map((c) => <td key={c}>{String(l[c]?.value ?? l[c] ?? "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
          <details style={{ marginTop: 10 }}>
            <summary className="muted">SQL gerado</summary>
            <div className="resposta-sql">{resp.sql}</div>
          </details>
        </Painel>
      )}
    </div>
  );
}
