const express = require('express');

// Esta função receberá as dependências necessárias do seu server.js
module.exports = (pool, authMiddleware, permissionMiddleware, Parser) => {
    const router = express.Router();

    // --- ROTA DE CONTROLE DE LOGS ---
    router.get('/', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const { dataInicio, dataFim, exportar, pagina } = req.query;
        
        try {
            let sqlBase = 'FROM logs_sistema';
            const params = [];
            let conditions = [];

            if (dataInicio) {
                conditions.push('timestamp >= ?');
                params.push(dataInicio);
            }
            if (dataFim) {
                conditions.push('timestamp <= ?');
                params.push(`${dataFim} 23:59:59`);
            }

            if (conditions.length > 0) {
                sqlBase += ' WHERE ' + conditions.join(' AND ');
            }
            
            if (exportar === 'true') {
                const sqlExport = `SELECT id, timestamp, usuario_nome, acao, detalhes ${sqlBase} ORDER BY timestamp DESC`;
                const [rows] = await pool.execute(sqlExport, params);

                if (rows.length === 0) {
                    return res.status(404).json({ error: 'Nenhum log encontrado para exportar com os filtros selecionados.' });
                }
                const json2csvParser = new Parser();
                const csv = json2csvParser.parse(rows);
                res.header('Content-Type', 'text/csv');
                res.attachment(`logs_${new Date().toISOString().slice(0,10)}.csv`);
                return res.send(csv);
            }

            // --- LÓGICA DE PAGINAÇÃO ---

            const sqlCount = `SELECT COUNT(*) as total ${sqlBase}`;
            const [countResult] = await pool.execute(sqlCount, params);
            const totalLogs = countResult[0].total;

            if (totalLogs === 0) {
                return res.json({
                    logs: [],
                    totalLogs: 0,
                    totalPages: 0,
                    currentPage: 1
                });
            }

            const limite = 50;
            const paginaAtual = parseInt(pagina, 10) || 1;
            const totalPages = Math.ceil(totalLogs / limite);
            const offset = (paginaAtual - 1) * limite;

            // --- CORREÇÃO APLICADA AQUI ---
            // Em vez de usar 'LIMIT ? OFFSET ?', injetamos os valores numéricos diretamente.
            // Isso é seguro porque 'limite' e 'offset' são números controlados por nós, não input do usuário.
            // Os parâmetros de data continuam seguros com '?'
            const sqlLogs = `SELECT id, timestamp, usuario_nome, acao, detalhes ${sqlBase} ORDER BY timestamp DESC LIMIT ${limite} OFFSET ${offset}`;
            
            // Agora executamos a query passando apenas os parâmetros dos filtros ('params')
            const [rows] = await pool.execute(sqlLogs, params);

            res.json({
                logs: rows,
                totalLogs,
                totalPages,
                currentPage: paginaAtual
            });
            
        } catch (err) {
            console.error("Erro ao buscar logs:", err.message);
            res.status(500).json({ error: 'Falha ao buscar logs do sistema.' });
        }
    });

    return router;
}