import { useEffect, useState } from "react";
import escura from "../assets/powermetrics-logo.png";
import clara from "../assets/powermetrics-logo-claro.png";

// Wordmark branco no fundo escuro, grafite no claro; o ícone é laranja nos dois.
// O tema é lido do próprio documento em vez de vir por prop: a tela de login
// fica fora do Layout e não tinha como recebê-lo, então exibia a arte branca
// sobre fundo claro — logo invisível.
export default function Logo({ tamanho = 30 }) {
  const [tema, setTema] = useState(
    () => document.documentElement.dataset.tema || "escuro");

  useEffect(() => {
    const observador = new MutationObserver(() =>
      setTema(document.documentElement.dataset.tema || "escuro"));
    observador.observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-tema"],
    });
    return () => observador.disconnect();
  }, []);

  return (
    <img className="marca" src={tema === "claro" ? clara : escura}
      alt="PowerMetrics" style={{ height: tamanho }} />
  );
}
