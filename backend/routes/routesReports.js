// backend/routes/routesReports.js
const express = require('express');
const router = express.Router();

module.exports = (dependencies) => {
    const { pool, authMiddleware } = dependencies;

    // ROTA PARA ANÁLISE DE CHURN (CLIENTES INATIVOS)
    router.get('/churn', authMiddleware, async (req, res) => {
        // Por padrão, consideramos inativos há mais de 90 dias
        const diasInativo = parseInt(req.query.dias, 10) || 90;

        try {
            const sql = `
                SELECT
                    c.id,
                    c.nome,
                    c.telefone,
                    MAX(os.data_criacao) AS ultimo_servico,
                    DATEDIFF(NOW(), MAX(os.data_criacao)) AS dias_inativo
                FROM clientes c
                JOIN ordens_servico os ON c.id = os.cliente_id
                GROUP BY c.id, c.nome, c.telefone
                HAVING dias_inativo >= ?
                ORDER BY dias_inativo DESC;
            `;
            const [churnedClients] = await pool.execute(sql, [diasInativo]);
            res.json(churnedClients);
        } catch (error) {
            console.error("Erro ao gerar relatório de churn:", error);
            res.status(500).json({ error: 'Falha ao gerar relatório.' });
        }
    });

    return router;
};