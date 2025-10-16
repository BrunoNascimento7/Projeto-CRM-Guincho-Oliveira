// publicRoutes.js
const express = require('express');
const router = express.Router();

// O módulo exporta uma função que recebe o 'pool' de conexão do banco
module.exports = function(pool) {

    // ROTA PÚBLICA PARA BUSCAR DADOS DE UMA COTAÇÃO
    // Note que não há 'authMiddleware' aqui. É aberta.
    router.get('/public/cotacao/:uid', async (req, res) => {
        try {
            const { uid } = req.params;
            const sql = `
                SELECT 
                    o.orcamento_uid, o.dados_cotacao, o.valor_total, o.criado_em,
                    c.nome as nome_cliente
                FROM orcamentos o
                LEFT JOIN clientes c ON o.cliente_id = c.id
                WHERE o.orcamento_uid = ?
            `;
            const [rows] = await pool.execute(sql, [uid]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Orçamento não encontrado ou expirado.' });
            }
            
            const orcamento = rows[0];
            // Já convertemos o JSON aqui para facilitar a vida do frontend
            orcamento.dados_cotacao = JSON.parse(orcamento.dados_cotacao);

            res.json(orcamento);

        } catch (error) {
            console.error("Erro ao buscar dados públicos da cotação:", error.message);
            res.status(500).json({ error: 'Falha ao carregar dados da cotação.' });
        }
    });

    return router;
};