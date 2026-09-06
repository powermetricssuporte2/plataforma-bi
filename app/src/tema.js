import { useEffect, useState } from "react";

const CHAVE = "pm-tema";

function inicial() {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === "claro" || salvo === "escuro") return salvo;
  } catch {}
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "claro" : "escuro";
}

export function useTema() {
  const [tema, setTema] = useState(inicial);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {}
  }, [tema]);

  return [tema, () => setTema((t) => (t === "escuro" ? "claro" : "escuro"))];
}
