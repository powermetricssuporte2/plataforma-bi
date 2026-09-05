import { useEffect, useState } from "react";
import { api } from "../api";

export default function Freshness() {
  const [ultima, setUltima] = useState(null);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    api("freshness").then((r) => setUltima(r[0]?.ultima?.value || r[0]?.ultima)).catch(() => {});
    api("alerts").then(setAlerts).catch(() => {});
  }, []);

  const mins = ultima ? Math.round((Date.now() - new Date(ultima)) / 60000) : null;
  const velho = mins != null && mins > 26 * 60;
  const rotulo =
    mins == null ? "sem dados ainda" :
    mins < 60 ? `há ${mins} min` :
    mins < 1440 ? `há ${Math.round(mins / 60)} h` : `há ${Math.round(mins / 1440)} d`;

  return (
    <>
      <div className="topo">
        <h1>Painel</h1>
        <span className={`fresh ${velho ? "velho" : ""}`}>Atualizado <b>{rotulo}</b></span>
      </div>
      {alerts.length > 0 && (
        <div className="alerta">Falha na última atualização de dados: {alerts[0].mensagem}</div>
      )}
    </>
  );
}
