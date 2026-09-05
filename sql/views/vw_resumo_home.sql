CREATE OR REPLACE VIEW `__DATASET__.vw_resumo_home` AS
WITH fat AS (SELECT * FROM `__DATASET__.vw_faturamento_mensal`),
 atual AS (SELECT faturamento FROM fat WHERE mes = DATE_TRUNC(CURRENT_DATE(), MONTH)),
 anterior AS (SELECT faturamento FROM fat WHERE mes = DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)),
 pagar AS (SELECT SUM(total) t FROM `__DATASET__.vw_contas_pagar`
           WHERE semana BETWEEN DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY)) AND DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)),
 receber AS (SELECT SUM(recebido) t FROM `__DATASET__.vw_contas_receber`
             WHERE mes = DATE_TRUNC(CURRENT_DATE(), MONTH))
SELECT
  (SELECT faturamento FROM atual)    AS faturamento_mes,
  (SELECT faturamento FROM anterior) AS faturamento_mes_anterior,
  (SELECT t FROM pagar)              AS a_pagar_7d,
  (SELECT t FROM receber)            AS recebido_mes;
