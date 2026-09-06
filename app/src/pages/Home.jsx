import { useEffect, useState } from "react";
import { api, brl } from "../api";
import Kpi from "../components/Kpi";
import Painel from "../components/Painel";
import { Linha } from "../components/charts";

export default function Home() {
  const [resumo, setResumo] = useState(null);
  const [fat, setFat] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api("resumo").then((r) => setResumo(r[0])).catch((e) => setErro(String(e.message)));
    api("faturamento").then(setFat).catch(() => {});
  }, []);

  // Sem faturamento no mes corrente nao existe variacao a mostrar: exibir
  // "-100%" para um mes que ainda nao teve nota faz parecer queda real.
  const delta =
    resumo?.faturamento_mes != null && resumo?.faturamento_mes_anterior
      ? ((resumo.faturamento_mes - resumo.faturamento_mes_anterior) / resumo.faturamento_mes_anterior) * 100
      : null;

  return (
    <>
      {erro && <div className="alerta">{erro}</div>}
      <div className="kpis">
        <Kpi valor={brl(resumo?.faturamento_mes)} rotulo="Faturamento do mês" delta={delta} />
        <Kpi valor={brl(resumo?.recebido_mes)} rotulo="Recebido no mês" />
        <Kpi valor={brl(resumo?.a_pagar_7d)} rotulo="A pagar nos próximos 7 dias" />
      </div>
      <Painel titulo="Faturamento — últimos 12 meses">
        <Linha data={fat} x="mes" y="faturamento" />
      </Painel>
    </>
  );
}
