# SUA PARTE — amanhã de manhã (~40–60 min)

Todo o código está pronto e testado localmente. O que falta são as ações que só
você pode fazer (credenciais, compartilhamentos e deploy). Siga na ordem.

## 0. Pré-requisitos na sua máquina
- `gcloud` CLI, `node` 20+, `python3` 3.11+, `firebase-tools` (`npm i -g firebase-tools`)
- Projeto GCP com **billing ativo** (pode criar um novo: `powermetrics-bi`)

## 1. Autenticar (5 min)
```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project SEU_PROJETO
export GCP_PROJECT_ID=SEU_PROJETO
firebase login
```

## 2. Infra (5 min)
```bash
pip install -r ingestor/requirements.txt
make setup
```
Quando pedir, cole a **ANTHROPIC_API_KEY** (console.anthropic.com) e finalize com Ctrl+D.
Ao final o script imprime o e-mail da service account. **Copie-o.**

## 3. Compartilhar as pastas do Drive (5 min) — PASSO CRÍTICO
No Drive, para cada cliente ativo em `config/clientes.yaml`:
pasta > Compartilhar > colar `bi-ingestor@SEU_PROJETO.iam.gserviceaccount.com` > **Leitor**.
Comece pela do Integração Modas. (Lembra do problema da Dados_Bi? Compartilhe
marcando os itens internos, ou os arquivos ficam invisíveis pra SA.)

## 4. Primeira ingestão (10 min)
```bash
make ingest-piloto        # roda local, mostra tabela a tabela
```
Esperado: ~15 tabelas com contagem de linhas. Se aparecer "0 tabelas encontradas",
o compartilhamento do passo 3 não pegou.

## 5. Views de indicadores (2 min)
```bash
make views
```
Se alguma view for pulada por coluna desconhecida, o motivo fica em `DECISOES.md` —
me traga esse arquivo que eu ajusto os nomes de coluna na hora.

## 6. Firebase (10 min)
No console firebase.google.com: adicionar projeto > usar o MESMO projeto GCP.
- Authentication > Ativar E-mail/senha
- Configurações do projeto > Seus apps > Web > copiar o config
Crie `app/.env`:
```
VITE_FB_API_KEY=...
VITE_FB_AUTH_DOMAIN=SEU_PROJETO.firebaseapp.com
VITE_FB_PROJECT_ID=SEU_PROJETO
```
Usuário de teste:
```bash
cd functions/api && npm install && cd ../..
node scripts/create_user.js voce@powermetrics.com.br SenhaForte123 integracao_modas
```

## 7. Deploy (10 min)
```bash
make deploy
```
Sobe: Cloud Run Job + Scheduler (1x/hora), functions `api` e `ask`, e o app no Hosting.
A URL final aparece no fim (`https://SEU_PROJETO.web.app`).

## 8. Validar (5 min)
- Login com o usuário de teste → Home com faturamento real
- Aba "Pergunte à IA" → "Quais os 10 produtos mais vendidos?"
- Selo "Atualizado há X min" no topo

## Se algo falhar
Cada passo é independente — me manda o erro exato (ou o `DECISOES.md`) que eu corrijo.
Os pontos mais prováveis: nomes de coluna nas views (passo 5) e o config do Firebase (passo 6).
