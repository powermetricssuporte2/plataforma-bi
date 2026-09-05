import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function entrar(e) {
    e.preventDefault();
    setBusy(true); setErro("");
    try {
      await signInWithEmailAndPassword(auth, email, senha);
      nav("/");
    } catch {
      setErro("E-mail ou senha incorretos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={entrar}>
        <div className="logo">Power<em>Metrics</em></div>
        <p className="muted">Seus indicadores, atualizados sozinhos.</p>
        <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        {erro && <span className="erro">{erro}</span>}
        <button className="cta" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}
