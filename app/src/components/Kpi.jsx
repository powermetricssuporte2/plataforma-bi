export default function Kpi({ valor, rotulo, delta }) {
  return (
    <div className="kpi">
      <div className="valor">{valor}</div>
      <div className="rotulo">{rotulo}</div>
      {delta != null && (
        <div className={`delta ${delta >= 0 ? "up" : "down"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs. mês anterior
        </div>
      )}
    </div>
  );
}
