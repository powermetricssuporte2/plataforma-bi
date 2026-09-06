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
`make user EMAIL=x SENHA=y CLIENTE=a,b`

## Multi-cliente
Cada cliente é um dataset isolado no BigQuery. O usuário carrega no token a lista
de clientes que pode ver (`clientes`); a API valida **toda** requisição contra essa
lista, então trocar o parâmetro no navegador não dá acesso a outro cliente.
Com mais de um cliente liberado, aparece um seletor no topo do app.

## Cliente novo (2 min)
1. Compartilhar a pasta do Drive com a service account (Leitor).
   Se houver subpastas, marcar para aplicar aos itens internos.
2. Bloco novo em `config/clientes.yaml` com `ativo: true`
3. `make views` e `make user`. Pronto — o job da próxima hora já ingere.

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
