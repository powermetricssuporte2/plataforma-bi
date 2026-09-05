# PowerMetrics BI — plataforma multi-tenant (substitui o Power BI)

**Fluxo:** Drive (CSVs do ERP SB) → Cloud Run Job (1x/h) → BigQuery (dataset por cliente)
→ views SQL de indicadores → app React (Firebase Hosting/Auth) → Claude API (text-to-SQL).

## Estrutura
- `ingestor/` — Python; `DataSource` abstrato (`DriveCSVSource` hoje, agente Firebird no futuro),
  whitelist de 17 tabelas, encoding UTF-8→Latin-1, diff por `modifiedTime`, log em `_meta`.
- `sql/views/` — views parametrizadas; `infra/apply_views.py` descobre as colunas reais
  via INFORMATION_SCHEMA antes de aplicar.
- `functions/api` — BFF: valida token Firebase, resolve `cliente_id` (custom claim), consulta views.
  O browser nunca acessa o BigQuery.
- `functions/ask` — pergunta em PT → Claude gera SQL → guardrails (só SELECT, só o dataset
  do cliente, LIMIT 500, 1 GB máx.) → executa → gráfico/tabela.
- `app/` — React + Recharts, identidade PowerMetrics, responsivo, selo de frescor + alertas.

## Comandos
`make setup` · `make ingest-piloto` · `make views` · `make deploy` · `make test` ·
`make user EMAIL=x SENHA=y CLIENTE=z`

## Cliente novo (2 min)
1. Compartilhar a pasta do Drive com a service account (Leitor)
2. Bloco novo em `config/clientes.yaml` com `ativo: true`
3. `make views` e criar usuário. Pronto — o job da próxima hora já ingere.

## Custos estimados
BigQuery + Cloud Run + Scheduler + Hosting: **R$ 30–80/mês para a carteira toda**
(quase tudo em free tier). Claude API: por uso da aba de IA.

## Próximos passos sugeridos
- E-mail/WhatsApp de alerta (hoje: banner no app via `_meta.alerts`)
- `FirebirdAgentSource`: agente local no cliente empurrando deltas (quase tempo real)
- Metas (ADM_META) vs. realizado na Home
