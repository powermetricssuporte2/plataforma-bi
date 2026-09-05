CREATE OR REPLACE VIEW `__DATASET__.vw_vendas_pdv` AS
SELECT
  `__DATASET__`.pm_date(__COL_DATA__) AS dia,
  COUNT(*) AS cupons,
  SUM(`__DATASET__`.pm_num(__COL_VALOR__)) AS receita,
  SAFE_DIVIDE(SUM(`__DATASET__`.pm_num(__COL_VALOR__)), COUNT(*)) AS ticket_medio
FROM `__DATASET__.FCX_VENDA`
WHERE `__DATASET__`.pm_date(__COL_DATA__) IS NOT NULL
GROUP BY dia ORDER BY dia;
