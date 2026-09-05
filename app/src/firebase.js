import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Preencher com o config do console Firebase (Configurações do projeto > Seus apps > Web)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
