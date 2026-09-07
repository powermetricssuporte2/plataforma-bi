import { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import Freshness from "./Freshness";
import Logo from "./Logo";
import SeletorCliente from "./SeletorCliente";

const rotas = [
  ["/", "Visão geral"],
  ["/vendas", "Vendas"],
  ["/financeiro", "Financeiro"],
  ["/estoque", "Estoque"],
  ["/ia", "Pergunte à IA"],
  ["/status", "Atualizações"],
];

export default function Layout({ tema, alternarTema }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  // Ja inicia com o cliente salvo: comecar em null remontaria as paginas
  // assim que o seletor resolvesse, refazendo todas as consultas.
  const [cliente, setClienteAtivo] = useState(() => {
    try {
      return localStorage.getItem("pm-cliente");
    } catch {
      return null;
    }
  });
  const titulo = rotas.find(([to]) => to === pathname)?.[1] || "Visão geral";
  return (
    <div className="shell">
      <nav className="rail">
        <Logo tamanho={26} tema={tema} />
        {rotas.map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? "on" : "")}>
            {label}
          </NavLink>
        ))}
        <button className="tema" onClick={alternarTema}
          title={tema === "escuro" ? "Mudar para modo claro" : "Mudar para modo escuro"}>
          {tema === "escuro" ? "☀ Modo claro" : "☾ Modo escuro"}
        </button>
        <a className="sair" onClick={() => signOut(auth).then(() => nav("/login"))}>Sair</a>
      </nav>
      <main>
        <Freshness titulo={titulo} cliente={cliente}
          seletor={<SeletorCliente atual={cliente} aoTrocar={setClienteAtivo} />} />
        {/* Chave por rota: sem isto o React reaproveita os componentes de grafico
            entre as paginas e o Recharts mantem as dimensoes da pagina anterior,
            desenhando fora da area visivel ate um F5. */}
        <div key={`${pathname}|${cliente}`}><Outlet /></div>
      </main>
    </div>
  );
}
