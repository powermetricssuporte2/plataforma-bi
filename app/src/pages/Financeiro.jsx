import { useEffect, useState } from "react";
import { api } from "../api";
import Painel from "../components/Painel";
import { Barras, Linha } from "../components/charts";

export default function Financeiro() {
  const [pagar, setPagar] = useState([]);
  const [receber, setReceber] = useState([]);

  useEffect(() => {
    api("contas_pagar").then(setPagar).catch(() => {});
    api("contas_receber").then(setReceber).catch(() => {});
  }, []);

  return (
    <>
      <Painel titulo="Contas a pagar por semana (laranja = total, âmbar = vencido)">
        <Barras data={pagar} x="semana" ys={["total", "vencido"]} />
      </Painel>
      <Painel titulo="Recebimentos por mês">
        <Linha data={receber} x="mes" y="recebido" />
      </Painel>
    </>
  );
}
