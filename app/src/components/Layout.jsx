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
];

export default function Layout({ tema, alternarTema }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [cliente, setClienteAtivo] = useState(null);
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
        <div key={cliente}><Outlet /></div>
      </main>
    </div>
  );
}
