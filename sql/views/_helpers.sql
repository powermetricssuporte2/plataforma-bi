-- Funções auxiliares criadas 1x por dataset
CREATE OR REPLACE FUNCTION `__DATASET__`.pm_date(x ANY TYPE) AS (
  COALESCE(
    SAFE_CAST(x AS DATE),
    SAFE.PARSE_DATE('%d.%m.%Y', SAFE_CAST(x AS STRING)),
    SAFE.PARSE_DATE('%d/%m/%Y', SAFE_CAST(x AS STRING)),
    SAFE_CAST(SAFE_CAST(x AS TIMESTAMP) AS DATE)
  )
);
CREATE OR REPLACE FUNCTION `__DATASET__`.pm_num(x ANY TYPE) AS (
  -- Export do SB/Firebird vem em NUMERIC(*,5) sem ponto decimal (ex.: R$89,90 = "8990000").
  -- Divide por 100000 quando o valor é inteiro puro; mantém fallback p/ formatos já decimais.
  COALESCE(
    SAFE_CAST(x AS FLOAT64) / 100000,
    SAFE_CAST(REPLACE(REPLACE(SAFE_CAST(x AS STRING), '.', ''), ',', '.') AS FLOAT64)
  )
);
