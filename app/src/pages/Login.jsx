import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import Logo from "../components/Logo";
import Vitrine from "../components/Vitrine";

// Erro do Firebase vira frase que diz o que fazer — "auth/invalid-credential"
// nao ajuda ninguem a entrar.
const MENSAGENS = {
  "auth/invalid-email": "E-mail em formato inválido. Confira o endereço.",
  "auth/user-disabled": "Este acesso foi desativado. Fale com a PowerMetrics.",
  "auth/too-many-requests": "Muitas tentativas. Espere um minuto e tente de novo.",
  "auth/network-request-failed": "Sem conexão com o servidor. Verifique a internet.",
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [vendo, setVendo] = useState(false);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function entrar(e) {
    e.preventDefault();
    setBusy(true); setErro("");
    try {
      await signInWithEmailAndPassword(auth, email, senha);
      nav("/");
    } catch (ex) {
      setErro(MENSAGENS[ex?.code] || "E-mail ou senha incorretos. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-arte" aria-hidden="true">
        <div className="auth-brilho" />
        <Vitrine />
        <p className="auth-frase">
          Seus indicadores,<br /><b>atualizados sozinhos.</b>
        </p>
        <ul className="auth-lista">
          <li>Dados do ERP direto do Drive, de hora em hora</li>
          <li>Um painel por cliente, sem abrir o Power BI</li>
          <li>Pergunte em português, a IA consulta o banco</li>
        </ul>
      </aside>

      <main className="auth-form">
        <form onSubmit={entrar} noValidate>
          <Logo tamanho={34} />
          <h1 className="auth-titulo">Entrar na plataforma</h1>
          <p className="muted auth-sub">Acesso restrito aos clientes PowerMetrics.</p>

          <label className="campo">
            <span>E-mail</span>
            <input
              type="email" value={email} autoComplete="username" required autoFocus
              placeholder="voce@empresa.com.br"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="campo">
            <span>Senha</span>
            <div className="campo-senha">
              <input
                type={vendo ? "text" : "password"} value={senha}
                autoComplete="current-password" required placeholder="••••••••"
                onChange={(e) => setSenha(e.target.value)}
              />
              <button type="button" className="olho" onClick={() => setVendo(!vendo)}
                aria-label={vendo ? "Ocultar senha" : "Mostrar senha"}>
                {vendo ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                    <path d="M6.7 6.8C4.6 8.1 3 10 2 12c2 3.8 5.6 6 10 6 1.8 0 3.4-.4 4.8-1.1M20.5 15.4C21.1 14.4 21.6 13.3 22 12c-2-3.8-5.6-6-10-6-.7 0-1.3 0-1.9.2" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M2 12c2-3.8 5.6-6 10-6s8 2.2 10 6c-2 3.8-5.6 6-10 6s-8-2.2-10-6z" />
                    <circle cx="12" cy="12" r="2.6" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          {erro && <span className="erro" role="alert">{erro}</span>}

          <button className="cta" disabled={busy}>
            {busy && <span className="giro" aria-hidden="true" />}
            {busy ? "Entrando…" : "Entrar"}
          </button>

          <p className="muted auth-rodape">
            Esqueceu a senha? Fale com o suporte PowerMetrics.
          </p>
        </form>
      </main>
    </div>
  );
}
