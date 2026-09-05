import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

const cor = { brand: "#F58434", d2: "#e0bd6a", d3: "#7fa6a3", grade: "#3d3d40", texto: "#a5a5a1" };
const fmtBRL = (v) => Number(v).toLocaleString("pt-BR", { notation: "compact" });
const tt = {
  contentStyle: { background: "#282829", border: "1px solid #3d3d40", borderRadius: 8, color: "#ececea" },
  formatter: (v) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
};

export function Linha({ data, x, y, altura = 260 }) {
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
  const paleta = [cor.brand, cor.d2, cor.d3];
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 4, right: 8, left: horizontal ? 60 : -8, bottom: 0 }}>
        <CartesianGrid stroke={cor.grade} vertical={false} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" stroke={cor.texto} tickLine={false} fontSize={12} tickFormatter={fmtBRL} />
            <YAxis type="category" dataKey={x} stroke={cor.texto} tickLine={false} fontSize={12} width={120} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} stroke={cor.texto} tickLine={false} fontSize={12} />
            <YAxis stroke={cor.texto} tickLine={false} fontSize={12} tickFormatter={fmtBRL} />
          </>
        )}
        <Tooltip {...tt} cursor={{ fill: "rgba(245,132,52,.08)" }} />
        {ys.map((y, i) => <Bar key={y} dataKey={y} fill={paleta[i % 3]} radius={[3, 3, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}
