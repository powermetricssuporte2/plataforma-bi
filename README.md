# PowerMetrics BI — plataforma multi-tenant (substitui o Power BI)

**Fluxo:** Drive (CSVs do ERP SB) → Cloud Run Job (1x/h) → BigQuery (dataset por cliente)
→ views SQL de indicadores → app React (Firebase Hosting/Auth) → Claude API (text-to-SQL).

Em produção: **https://powermetrics-bi.web.app** (projeto GCP `powermetrics-bi`).

## Estrutura
- `ingestor/` — Python; `DataSource` abstrato (`DriveCSVSource` hoje, agente Firebird no futuro),
  whitelist de 17 tabelas, encoding UTF-8→Latin-1, diff por `modifiedTime`, log em `_meta`.
- `sql/views/` — views parametrizadas; `infra/apply_views.py` descobre as colunas reais
  via INFORMATION_SCHEMA antes de aplicar.
- `functions/api` — BFF: valida token Firebase, resolve os clientes do usuário (custom claim),
  consulta as views. O browser nunca acessa o BigQuery.
- `functions/ask` — pergunta em PT → Claude gera SQL → guardrails (só SELECT, só o dataset
  do cliente, LIMIT 500, 1 GB máx.) → executa → gráfico/tabela.
- `app/` — React + Recharts, identidade PowerMetrics, tema claro/escuro, responsivo,
  seletor de cliente, selo de frescor + alertas.

## Comandos
`make setup` · `make ingest-piloto` · `make views` · `make deploy` · `make test` ·
`make user EMAIL=x SENHA=y CLIENTE=a,b` · `make hosting`

`make hosting` publica so o app pela API REST do Hosting, usando o token do
gcloud. Serve quando a sessao do firebase-tools expira (`firebase login --reauth`)
mas a do gcloud continua valida.

## Multi-cliente
Cada cliente é um dataset isolado no BigQuery. O usuário carrega no token a lista
de clientes que pode ver (`clientes`); a API valida **toda** requisição contra essa
lista, então trocar o parâmetro no navegador não dá acesso a outro cliente.
Com mais de um cliente liberado, aparece um seletor no topo do app.

## Cliente novo (2 min)
1. `make buscar NOME="dinamica"` devolve o `drive_folder_id` da pasta de
   exportação. Se o nome não bater, ele sugere os parecidos — os nomes no Drive
   têm acento e variação ("Dinâmica", "Dados_Bi_SB", "Dados_bi_AFT").
2. Compartilhar a pasta do Drive com a service account (Leitor).
   Se houver subpastas, marcar para aplicar aos itens internos.
3. Bloco novo em `config/clientes.yaml` com `ativo: true`
4. `make views` e `make user`. Pronto — o job da próxima hora já ingere.

## Acompanhamento
A aba **Atualizações** separa duas coisas que costumam ser confundidas:

- **Dado de** — quando o conteúdo mudou pela última vez. Fica velho quando o
  cliente parou de exportar do ERP para o Drive.
- **Verificado** — quando o ingestor passou pelo cliente sem erro. Deve ficar
  sempre abaixo de uma hora; se subir, o problema é da plataforma.

Ainda lista as falhas pendentes, que somem sozinhas assim que um ciclo
posterior roda sem erro. A aba **Pergunte à IA** responde sobre isso em texto
("quais clientes estão sem atualizar?"), a partir do estado apurado pelo
servidor para os clientes do próprio usuário.

## Segurança
- Cada cliente é um dataset isolado; a API valida o cliente pedido contra a
  lista gravada no token, então trocar o parâmetro no navegador não dá acesso.
- O SQL gerado pela IA passa por guardrails: só SELECT, só o dataset do cliente
  (com ou sem crases), LIMIT 500 e teto de 1 GB por consulta.
- O navegador nunca fala com o BigQuery: tudo passa pelas Cloud Functions.
- CSP, HSTS, X-Frame-Options DENY, nosniff e Referrer-Policy no Hosting; CORS
  restrito às origens do app.

## Particularidades do export do SB
- Os campos numéricos vêm como `NUMERIC(*,5)` **sem ponto decimal**: R$ 89,90 chega
  como `8990000`. A função `pm_num()` divide por 100000 — é o que mantém os valores certos.
- Colunas "numéricas" podem trazer texto (`PRO_CODIGO_BARRAS` = "SEM GTIN"). Quando o
  autodetect do BigQuery falha, o ingestor recarrega a tabela inteira como STRING e as
  views convertem com `pm_num()`/`pm_date()`.
- `CAI_CONTA_PAGAR_EX` não tem data de vencimento; a view usa a emissão como aproximação.

## Custos estimados
BigQuery + Cloud Run + Scheduler + Hosting: **R$ 30–80/mês para a carteira toda**
(quase tudo em free tier). Claude API: por uso da aba de IA.

## Próximos passos sugeridos
- E-mail/WhatsApp de alerta (hoje: banner no app via `_meta.alerts`)
- `FirebirdAgentSource`: agente local no cliente empurrando deltas (quase tempo real)
- Metas (ADM_META) vs. realizado na Home
