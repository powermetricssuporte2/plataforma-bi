import { useEffect, useState } from "react";
import { api, brl } from "../api";
import Painel from "../components/Painel";
import { Linha, Barras } from "../components/charts";
import Kpi from "../components/Kpi";

export default function Vendas() {
  const [dias, setDias] = useState([]);
  const [top, setTop] = useState([]);

  useEffect(() => {
    api("vendas").then(setDias).catch(() => {});
    api("top_produtos").then(setTop).catch(() => {});
  }, []);

  const receita30 = dias.reduce((s, d) => s + (d.receita || 0), 0);
  const ticket = dias.length ? dias.reduce((s, d) => s + (d.ticket_medio || 0), 0) / dias.length : null;

  return (
    <>
      <div className="kpis">
        <Kpi valor={brl(receita30)} rotulo="Receita — 30 dias" />
        <Kpi valor={brl(ticket)} rotulo="Ticket médio" />
        <Kpi valor={dias.reduce((s, d) => s + (d.cupons || 0), 0).toLocaleString("pt-BR")} rotulo="Cupons emitidos" />
      </div>
      <Painel titulo="Receita diária — 30 dias">
        <Linha data={dias} x="dia" y="receita" />
      </Painel>
      <Painel titulo="Produtos que mais vendem">
        <Barras data={top} x="produto" ys={["receita"]} horizontal
          altura={Math.max(260, top.length * 30 + 40)} />
      </Painel>
    </>
  );
}
