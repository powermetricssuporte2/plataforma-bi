CREATE OR REPLACE VIEW `__DATASET__.vw_top_produtos` AS
SELECT
  vp.__COL_PROD_ID__ AS produto_id,
  ANY_VALUE(p.__COL_PROD_NOME__) AS produto,
  SUM(`__DATASET__`.pm_num(vp.__COL_VP_VALOR__)) AS receita,
  SUM(`__DATASET__`.pm_num(vp.__COL_VP_QTD__)) AS quantidade
FROM `__DATASET__.FCX_VENDA_PRODUTO` vp
LEFT JOIN `__DATASET__.EST_PRODUTO` p ON CAST(p.__COL_PROD_PK__ AS STRING) = CAST(vp.__COL_PROD_ID__ AS STRING)
GROUP BY produto_id ORDER BY receita DESC LIMIT 100;
