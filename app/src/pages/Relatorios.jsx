import { useEffect, useMemo, useState } from "react";
import { ajustarRelatorio, api } from "../api";
import Painel from "../components/Painel";

const DIAS_PARADO = 30;

// O que se espera de cada relatório. Sem frequência definida ele aparece na
// lista mas não gera atraso — nem todo .pbix precisa de atualização periódica.
const FREQUENCIAS = [
  ["", "não acompanhar"],
  ["horaria", "de hora em hora"],
  ["diaria", "diária"],
  ["semanal", "semanal"],
  ["mensal", "mensal"],
];
// Espelha os prazos do backend para a linha reagir sem recarregar a lista.
const PRAZO = { horaria: 2, diaria: 30, semanal: 8 * 24, mensal: 33 * 24 };
const atrasado = (l) => l.prazo_horas != null && l.horas > l.prazo_horas;

const idade = (d) =>
  d == null ? "—" : d === 0 ? "hoje" : d === 1 ? "ontem" : d < 30 ? `há ${d} dias` :
  d < 365 ? `há ${Math.floor(d / 30)} meses` : `há ${Math.floor(d / 365)} anos`;

const mb = (b) => (b ? `${Math.round(b / 1048576)} MB` : "—");

export default function Relatorios() {
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState("");
  const [categoria, setCategoria] = useState("cliente");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(null);   // arquivo_id em edição
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Aplica a correção na lista já carregada para o resultado aparecer na hora.
  async function salvar(l, mudanca) {
    // Um ajuste não pode apagar os outros: o backend guarda a última versão
    // de cada campo, então mando sempre o estado completo da linha.
    const completo = {
      empresa: l.empresa, frequencia: l.frequencia || "", ...mudanca,
    };
    setSalvando(true);
    try {
      await ajustarRelatorio(l.arquivo_id, completo);
      setLinhas((atual) =>
        mudanca.oculto
          ? atual.filter((x) => x.arquivo_id !== l.arquivo_id)
          : atual.map((x) =>
              x.arquivo_id === l.arquivo_id
                ? { ...x, empresa: mudanca.empresa.toUpperCase(), corrigido: true }
                : x));
      setEditando(null);
    } catch (e) {
      setErro(String(e.message));
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    api("relatorios", "").then(setLinhas).catch((e) => setErro(String(e.message)));
  }, []);

  const visiveis = useMemo(() => {
    if (!linhas) return [];
    const t = busca.trim().toLowerCase();
    return linhas.filter(
      (l) => l.categoria === categoria &&
        (!t || `${l.empresa} ${l.nome}`.toLowerCase().includes(t))
    );
  }, [linhas, categoria, busca]);

  if (erro) return <div className="alerta">{erro}</div>;
  if (!linhas) return <p className="muted">Carregando…</p>;

  const doCliente = linhas.filter((l) => l.categoria === "cliente");
  const recentes = doCliente.filter((l) => l.dias != null && l.dias <= 7).length;
  const acompanhados = doCliente.filter((l) => l.prazo_horas != null);
  const emAtraso = acompanhados.filter(atrasado).length;
  const empresas = new Set(doCliente.map((l) => l.empresa)).size;

  const contar = (c) => linhas.filter((l) => l.categoria === c).length;

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="valor">{doCliente.length}</div><div className="rotulo">Relatórios de clientes</div></div>
        <div className="kpi"><div className="valor">{empresas}</div><div className="rotulo">Empresas com relatório</div></div>
        <div className="kpi"><div className="valor">{recentes}</div><div className="rotulo">Mexidos nos últimos 7 dias</div></div>
        <div className="kpi">
          <div className={`valor ${emAtraso ? "ruim" : ""}`}>{emAtraso}</div>
          <div className="rotulo">Fora do prazo combinado ({acompanhados.length} acompanhados)</div>
        </div>
      </div>

      <div className="filtros">
        {[["cliente", "Clientes"], ["inativo", "Inativos"], ["interno", "Internos"]].map(([c, rotulo]) => (
          <button key={c} className={`chip ${categoria === c ? "on" : ""}`} onClick={() => setCategoria(c)}>
            {rotulo} ({contar(c)})
          </button>
        ))}
        <input className="busca" placeholder="Filtrar por empresa ou arquivo…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Painel titulo={`${visiveis.length} relatório(s)`}>
        <table className="dados">
          <thead>
            <tr><th>Empresa</th><th>Arquivo</th><th>Alterado</th><th>Esperado</th><th>Tamanho</th><th></th></tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.arquivo_id || l.caminho}>
                <td>
                  {editando === l.arquivo_id ? (
                    <input autoFocus value={rascunho} disabled={salvando}
                      onChange={(e) => setRascunho(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && rascunho.trim()) salvar(l, { empresa: rascunho.trim() });
                        if (e.key === "Escape") setEditando(null);
                      }} />
                  ) : (
                    <span title={l.corrigido ? "empresa corrigida manualmente" : l.caminho}>
                      {l.empresa}{l.corrigido ? " ✎" : ""}
                    </span>
                  )}
                </td>
                <td title={l.caminho}>{l.nome}</td>
                <td className={atrasado(l) || l.dias > DIAS_PARADO ? "erro" : ""}>
                  {idade(l.dias)}{atrasado(l) ? " ⚠" : ""}
                </td>
                <td>
                  <select className="freq" value={l.frequencia || ""} disabled={salvando}
                    onChange={(e) => salvar(l, { frequencia: e.target.value })}>
                    {FREQUENCIAS.map(([v, rotulo]) => <option key={v} value={v}>{rotulo}</option>)}
                  </select>
                </td>
                <td>{mb(l.tamanho_bytes)}</td>
                <td className="acoes">
                  {editando === l.arquivo_id ? (
                    <>
                      <button className="link" disabled={salvando || !rascunho.trim()}
                        onClick={() => salvar(l, { empresa: rascunho.trim() })}>salvar</button>
                      <button className="link" onClick={() => setEditando(null)}>cancelar</button>
                    </>
                  ) : (
                    <>
                      <button className="link" onClick={() => { setEditando(l.arquivo_id); setRascunho(l.empresa); }}>
                        corrigir
                      </button>
                      <button className="link" onClick={() => salvar(l, { oculto: true })}>ocultar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr><td colSpan={6} className="muted">Nenhum relatório nesse filtro.</td></tr>
            )}
          </tbody>
        </table>
      </Painel>
    </>
  );
}
