import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

const fmtBRL = (v) => Number(v).toLocaleString("pt-BR", { notation: "compact" });

// Recharts recebe cor literal, não var(); lê os tokens do tema ativo e reage à troca.
function useCores() {
  const ler = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (n) => s.getPropertyValue(n).trim();
    return {
      brand: v("--brand"), d2: v("--data-2"), d3: v("--data-3"),
      grade: v("--line"), texto: v("--text-2"),
      painel: v("--ink-1"), tinta: v("--text"), brandSoft: v("--brand-soft"),
    };
  };
  const [cor, setCor] = useState(ler);
  useEffect(() => {
    const obs = new MutationObserver(() => setCor(ler()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
    return () => obs.disconnect();
  }, []);
  return cor;
}

const tooltip = (cor) => ({
  contentStyle: { background: cor.painel, border: `1px solid ${cor.grade}`, borderRadius: 8, color: cor.tinta },
  formatter: (v) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
});

export function Linha({ data, x, y, altura = 260 }) {
  const cor = useCores();
  const tt = tooltip(cor);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={cor.grade} vertical={false} />
        <XAxis dataKey={x} stroke={cor.texto} tickLine={false} fontSize={12} />
        <YAxis stroke={cor.texto} tickLine={false} fontSize={12} tickFormatter={fmtBRL} />
        <Tooltip {...tt} />
        <Line type="monotone" dataKey={y} stroke={cor.brand} strokeWidth={2.2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Barras({ data, x, ys, altura = 260, horizontal = false }) {
  const cor = useCores();
  const tt = tooltip(cor);
  const paleta = [cor.brand, cor.d2, cor.d3];
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 4, right: 8, left: horizontal ? 60 : -8, bottom: 0 }}>
        <CartesianGrid stroke={cor.grade} vertical={false} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" stroke={cor.texto} tickLine={false} fontSize={12} tickFormatter={fmtBRL} />
            <YAxis type="category" dataKey={x} stroke={cor.texto} tickLine={false} fontSize={12}
              width={120} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} stroke={cor.texto} tickLine={false} fontSize={12} />
            <YAxis stroke={cor.texto} tickLine={false} fontSize={12} tickFormatter={fmtBRL} />
          </>
        )}
        <Tooltip {...tt} cursor={{ fill: cor.brandSoft }} />
        {ys.map((y, i) => <Bar key={y} dataKey={y} fill={paleta[i % 3]} radius={[3, 3, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}
