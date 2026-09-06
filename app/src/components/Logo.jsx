import escura from "../assets/powermetrics-logo.png";
import clara from "../assets/powermetrics-logo-claro.png";

// Wordmark branco no fundo escuro, grafite no claro; o ícone é laranja nos dois.
export default function Logo({ tamanho = 30, tema }) {
  const src = tema === "claro" ? clara : escura;
  return <img className="marca" src={src} alt="PowerMetrics" style={{ height: tamanho }} />;
}
