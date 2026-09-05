import { useEffect, useState } from "react";
import { api } from "../api";
import Painel from "../components/Painel";
import { Barras } from "../components/charts";

export default function Estoque() {
  const [grupos, setGrupos] = useState([]);
  useEffect(() => { api("estoque").then(setGrupos).catch(() => {}); }, []);

  return (
    <>
      <Painel titulo="Saldo por grupo de produto">
        <Barras data={grupos} x="grupo" ys={["saldo"]} horizontal altura={420} />
      </Painel>
      <Painel titulo="Detalhe">
        <table className="dados">
          <thead><tr><th>Grupo</th><th>Itens</th><th>Saldo</th></tr></thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.grupo}>
                <td>{g.grupo}</td>
                <td>{g.itens}</td>
                <td>{Number(g.saldo || 0).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>
    </>
  );
}
