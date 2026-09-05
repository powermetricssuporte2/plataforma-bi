import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Vendas from "./pages/Vendas";
import Financeiro from "./pages/Financeiro";
import Estoque from "./pages/Estoque";
import Ia from "./pages/Ia";

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = carregando
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route element={user ? <Layout /> : <Navigate to="/login" />}>
          <Route path="/" element={<Home />} />
          <Route path="/vendas" element={<Vendas />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/ia" element={<Ia />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
