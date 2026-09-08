-- Funções auxiliares criadas 1x por dataset
CREATE OR REPLACE FUNCTION `__DATASET__`.pm_date(x ANY TYPE) AS (
  COALESCE(
    SAFE_CAST(x AS DATE),
    SAFE.PARSE_DATE('%d.%m.%Y', SAFE_CAST(x AS STRING)),
    SAFE.PARSE_DATE('%d/%m/%Y', SAFE_CAST(x AS STRING)),
    SAFE_CAST(SAFE_CAST(x AS TIMESTAMP) AS DATE)
  )
);
CREATE OR REPLACE FUNCTION `__DATASET__`.pm_num(x ANY TYPE) AS ((
  -- O export do SB traz o separador decimal explícito, e ele muda de cliente
  -- para cliente: quase toda a carteira grava "1721,82000" (vírgula) e a
  -- Vagalume grava "509.70000" (ponto). A versão anterior dividia por 100000
  -- tudo que o BigQuery conseguia ler como número, na suposição de que o
  -- Firebird exportava NUMERIC(*,5) sem separador — nenhum cliente exporta
  -- assim, e o efeito era o faturamento da Vagalume virar R$1,30 no mês.
  -- Agora o separador presente no texto decide, e inteiro puro vale como
  -- inteiro. Se algum dia aparecer export sem separador, ele entra aqui como
  -- caso novo, com o nome do cliente registrado — não por regra silenciosa.
  SELECT CASE
    WHEN v IS NULL OR v = '' THEN NULL
    WHEN STRPOS(v, ',') > 0 THEN SAFE_CAST(REPLACE(REPLACE(v, '.', ''), ',', '.') AS FLOAT64)
    ELSE SAFE_CAST(v AS FLOAT64)
  END
  FROM (SELECT TRIM(SAFE_CAST(x AS STRING)) AS v)
));
