import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import Freshness from "./Freshness";

const rotas = [
  ["/", "Visão geral"],
  ["/vendas", "Vendas"],
  ["/financeiro", "Financeiro"],
  ["/estoque", "Estoque"],
  ["/ia", "Pergunte à IA"],
];

export default function Layout() {
  const nav = useNavigate();
  return (
    <div className="shell">
      <nav className="rail">
        <div className="logo">Power<em>Metrics</em></div>
        {rotas.map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? "on" : "")}>
            {label}
          </NavLink>
        ))}
        <a className="sair" onClick={() => signOut(auth).then(() => nav("/login"))}>Sair</a>
      </nav>
      <main>
        <Freshness />
        <Outlet />
      </main>
    </div>
  );
}
