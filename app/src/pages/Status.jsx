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
  const [origem, setOrigem] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    // Sem cliente na query: este painel é da carteira toda.
    api("status", "").then(setLinhas).catch((e) => setErro(String(e.message)));
    // Procedência falha em silêncio: se a varredura do Drive ainda não rodou,
    // o resto da página continua útil.
    api("origem", "").then(setOrigem).catch(() => setOrigem({ clientes: [], sem_cliente: [] }));
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

      {origem?.clientes?.length > 0 && (
        <Painel titulo="Origem do dado — de qual pasta do Drive veio cada cliente">
          <p className="muted" style={{ marginTop: -4 }}>
            O ID é o mesmo que aparece na URL do Drive. Clique para abrir a pasta
            e conferir que o número do painel vem de onde deveria vir.
          </p>
          <table className="dados">
            <thead>
              <tr><th>Cliente</th><th>Empresa no Drive</th><th>Pasta</th>
                  <th>ID da pasta</th><th>Tabelas</th><th>Arquivo de</th></tr>
            </thead>
            <tbody>
              {origem.clientes.map((l) => (
                <tr key={l.id}>
                  <td>{l.nome}</td>
                  <td className={l.empresa ? "" : "erro"} title={l.caminho || ""}>
                    {l.empresa || "não localizada no Drive"}
                  </td>
                  <td className="muted">{l.pasta || "—"}</td>
                  <td>
                    {l.pasta_id ? (
                      <a href={`https://drive.google.com/drive/folders/${l.pasta_id}`}
                         target="_blank" rel="noreferrer" className="link">{l.pasta_id}</a>
                    ) : "—"}
                  </td>
                  <td>{l.tabelas_encontradas ?? "—"}/5</td>
                  <td className={l.horas_arquivo != null && l.horas_arquivo > 24 * 7 ? "erro" : ""}>
                    {quando(l.horas_arquivo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Painel>
      )}

      {origem?.sem_cliente?.length > 0 && (
        <Painel titulo="Empresas no Drive fora da plataforma">
          <p className="muted" style={{ marginTop: -4 }}>
            Quem tem exportação é só configurar. Quem tem só Power BI ainda depende
            dele: sem CSV não há como reproduzir o relatório aqui.
          </p>
          <table className="dados">
            <thead>
              <tr><th>Empresa</th><th>ID da pasta</th><th>Exportações</th>
                  <th>Relatórios BI</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {origem.sem_cliente.map((e) => (
                <tr key={e.empresa_id}>
                  <td>{e.empresa}</td>
                  <td>
                    <a href={`https://drive.google.com/drive/folders/${e.empresa_id}`}
                       target="_blank" rel="noreferrer" className="link">{e.empresa_id}</a>
                  </td>
                  <td>{e.pastas_exportacao}</td>
                  <td>{e.relatorios_bi}</td>
                  <td className={e.pastas_exportacao ? "" : "muted"}>
                    {e.pastas_exportacao ? "pronta para configurar" : "só Power BI, sem CSV"}
                  </td>
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
