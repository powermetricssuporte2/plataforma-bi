import { useEffect, useState } from "react";
import { api } from "../api";
import Painel from "../components/Painel";

const HORAS_ATRASO = 26; // uma volta do agendador (1x/h) mais folga

function quando(horas) {
  if (horas == null) return "nunca";
  if (horas < 1) return "há menos de 1 h";
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} d`;
}

export default function Status() {
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    // Sem cliente na query: este painel é da carteira toda.
    api("status", "").then(setLinhas).catch((e) => setErro(String(e.message)));
  }, []);

  if (erro) return <div className="alerta">{erro}</div>;
  if (!linhas) return <p className="muted">Carregando…</p>;

  // "Em dia" olha a ultima verificacao, nao a ultima carga: um cliente cujo
  // export no Drive nao muda ha dias continua sendo verificado de hora em hora.
  const checado = (l) => l.horas_verificacao ?? l.horas;
  const emDia = linhas.filter((l) => checado(l) != null && checado(l) < HORAS_ATRASO);
  const atrasados = linhas.filter((l) => checado(l) != null && checado(l) >= HORAS_ATRASO);
  const nunca = linhas.filter((l) => checado(l) == null);
  const comFalha = linhas.filter((l) => l.falha);

  const linha = (l) => (
    <tr key={l.id}>
      <td>{l.nome}</td>
      <td>{quando(l.horas)}</td>
      <td>{quando(l.horas_verificacao)}</td>
      <td>{l.tabelas ?? "—"}</td>
      <td>{l.linhas != null ? Number(l.linhas).toLocaleString("pt-BR") : "—"}</td>
      <td className={l.falha ? "erro" : ""}>
        {l.falha ? "falha" : checado(l) == null ? "sem dados" : checado(l) < HORAS_ATRASO ? "em dia" : "atrasado"}
      </td>
    </tr>
  );

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="valor">{emDia.length}</div><div className="rotulo">Em dia</div></div>
        <div className="kpi"><div className="valor">{atrasados.length}</div><div className="rotulo">Atrasados (mais de {HORAS_ATRASO} h)</div></div>
        <div className="kpi"><div className="valor">{nunca.length}</div><div className="rotulo">Nunca atualizados</div></div>
      </div>

      {comFalha.length > 0 && (
        <Painel titulo="Falhas pendentes">
          <table className="dados">
            <thead><tr><th>Cliente</th><th>Motivo</th></tr></thead>
            <tbody>
              {comFalha.map((l) => (
                <tr key={l.id}>
                  <td>{l.nome}</td>
                  {/* Erros do BigQuery vem com URL e ids; a primeira frase basta. */}
                  <td className="muted" title={l.falha}>{String(l.falha).split(/https?:|Location:/)[0].slice(0, 160)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Painel>
      )}

      <Painel titulo="Atualização por cliente">
        <table className="dados">
          <thead>
            <tr><th>Cliente</th><th>Dado de</th><th>Verificado</th><th>Tabelas</th><th>Linhas</th><th>Situação</th></tr>
          </thead>
          <tbody>{linhas.map(linha)}</tbody>
        </table>
      </Painel>
    </>
  );
}
