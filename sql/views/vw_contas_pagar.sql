CREATE OR REPLACE VIEW `__DATASET__.vw_contas_pagar` AS
SELECT
  DATE_TRUNC(`__DATASET__`.pm_date(__COL_VENC__), WEEK(MONDAY)) AS semana,
  SUM(`__DATASET__`.pm_num(__COL_VALOR__)) AS total,
  SUM(IF(`__DATASET__`.pm_date(__COL_VENC__) < CURRENT_DATE(), `__DATASET__`.pm_num(__COL_VALOR__), 0)) AS vencido
FROM `__DATASET__.CAI_CONTA_PAGAR_EX`
WHERE `__DATASET__`.pm_date(__COL_VENC__) IS NOT NULL
GROUP BY semana ORDER BY semana;
