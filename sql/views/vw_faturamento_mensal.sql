CREATE OR REPLACE VIEW `__DATASET__.vw_faturamento_mensal` AS
SELECT
  DATE_TRUNC(`__DATASET__`.pm_date(__COL_DATA__), MONTH) AS mes,
  COUNT(*) AS notas,
  SUM(`__DATASET__`.pm_num(__COL_VALOR__)) AS faturamento
FROM `__DATASET__.FAT_NOTA_FISCAL`
WHERE `__DATASET__`.pm_date(__COL_DATA__) IS NOT NULL
GROUP BY mes ORDER BY mes;
