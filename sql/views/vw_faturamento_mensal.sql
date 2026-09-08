CREATE OR REPLACE VIEW `__DATASET__.vw_faturamento_mensal` AS
-- Metade da carteira fatura por nota fiscal (industria, servico) e a outra
-- metade so registra no caixa (varejo). Fixar a view na nota fazia a Adriane
-- Modas mostrar R$1.426 em agosto quando o PDV registrou R$287 mil — o painel
-- parecia vazio e a culpa caia no ingestor. A view escolhe sozinha a fonte
-- dominante do cliente e declara qual usou na coluna origem.
WITH pdv AS (
  SELECT DATE_TRUNC(`__DATASET__`.pm_date(__COL_PDV_DATA__), MONTH) AS mes,
         COUNT(*) AS docs,
         SUM(`__DATASET__`.pm_num(__COL_PDV_VALOR__)) AS faturamento
  FROM `__DATASET__.FCX_VENDA`
  WHERE `__DATASET__`.pm_date(__COL_PDV_DATA__) IS NOT NULL
  GROUP BY mes
),
nf AS (
  SELECT DATE_TRUNC(`__DATASET__`.pm_date(__COL_NF_DATA__), MONTH) AS mes,
         COUNT(*) AS docs,
         SUM(`__DATASET__`.pm_num(__COL_NF_VALOR__)) AS faturamento
  FROM `__DATASET__.FAT_NOTA_FISCAL`
  WHERE `__DATASET__`.pm_date(__COL_NF_DATA__) IS NOT NULL
  GROUP BY mes
),
-- Somar as duas contaria duas vezes o cliente que emite nota da mesma venda do
-- caixa. Por isso vale uma fonte so: a que tem mais documentos em 12 meses.
janela AS (SELECT DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH), MONTH) AS ini),
dominante AS (
  SELECT IF(
    COALESCE((SELECT SUM(docs) FROM pdv WHERE mes >= (SELECT ini FROM janela)), 0) >=
    COALESCE((SELECT SUM(docs) FROM nf  WHERE mes >= (SELECT ini FROM janela)), 0),
    'PDV', 'NF') AS fonte
)
SELECT mes, docs AS notas, faturamento, 'PDV' AS origem
FROM pdv WHERE (SELECT fonte FROM dominante) = 'PDV'
UNION ALL
SELECT mes, docs AS notas, faturamento, 'NF' AS origem
FROM nf WHERE (SELECT fonte FROM dominante) = 'NF'
ORDER BY mes;
