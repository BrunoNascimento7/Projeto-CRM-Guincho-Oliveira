const express = require('express');
const router = express.Router();
const XLSX = require('xlsx'); 

// Este módulo exporta uma função que recebe as dependências necessárias
module.exports = (dependencies) => {
    // Extraímos as dependências
    const { pool, authMiddleware, permissionMiddleware, registrarLog, upload } = dependencies;

    // --- ROTAS DE MOTORISTAS (CRUD) ---

    // Rota: GET /api/drivers/
    router.get('/', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional', 'financeiro']), async (req, res) => {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const offset = (page - 1) * limit;
        const { query } = req.query;

        let params = [];
        let whereClause = '';

        if (query) {
            whereClause = 'WHERE nome LIKE ? OR cnh_numero LIKE ?';
            const searchTerm = `%${query}%`;
            params.push(searchTerm, searchTerm);
        }
        
        try {
            const countSql = `SELECT COUNT(*) as total FROM motoristas ${whereClause}`;
            const [totalResult] = await pool.execute(countSql, params);
            const total = totalResult[0].total;

            const dataSql = `SELECT * FROM motoristas ${whereClause} ORDER BY nome ASC LIMIT ${limit} OFFSET ${offset}`;
            
            const [rows] = await pool.execute(dataSql, params);

            res.json({
                data: rows,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (err) {
            console.error("Erro ao listar motoristas:", err.message);
            res.status(500).json({ error: 'Falha ao buscar motoristas.' });
        }
    });

    // Rota: POST /api/drivers/
    router.post('/', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional']), async (req, res) => {
        const { nome, cnh_numero, categoria_cnh, telefone } = req.body;
        const sql = `INSERT INTO motoristas (nome, cnh_numero, categoria_cnh, telefone) VALUES (?, ?, ?, ?)`;
        try {
            const [result] = await pool.execute(sql, [nome, cnh_numero, categoria_cnh, telefone]);
            const detalhes = `Motorista ${nome} (ID: ${result.insertId}) foi criado.`;
            await registrarLog(req.user.id, req.user.nome, 'MOTORISTA_CRIADO', detalhes);
            res.status(201).json({ id: result.insertId, message: 'Motorista criado com sucesso!' });
        } catch (err) {
            console.error("Erro ao criar motorista:", err.message);
            res.status(500).json({ error: 'Falha ao criar motorista.' });
        }
    });

    // Rota: PUT /api/drivers/:id
    router.put('/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional']), async (req, res) => {
        const { id } = req.params;
        const { nome, cnh_numero, categoria_cnh, telefone } = req.body;
        const sql = `UPDATE motoristas SET nome = ?, cnh_numero = ?, categoria_cnh = ?, telefone = ? WHERE id = ?`;
        try {
            const [result] = await pool.execute(sql, [nome, cnh_numero, categoria_cnh, telefone, id]);
            if (result.affectedRows > 0) {
                const detalhes = `Motorista ID ${id} (${nome}) foi atualizado.`;
                await registrarLog(req.user.id, req.user.nome, 'MOTORISTA_ATUALIZADO', detalhes);
                res.json({ updated: true, message: 'Motorista atualizado com sucesso.' });
            } else {
                res.status(404).json({ error: 'Motorista não encontrado.' });
            }
        } catch (err) {
            console.error("Erro ao atualizar motorista:", err.message);
            res.status(500).json({ error: 'Falha ao atualizar motorista.' });
        }
    });

    // Rota: DELETE /api/drivers/:id
    router.delete('/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const { id } = req.params;
        try {
            const [result] = await pool.execute('DELETE FROM motoristas WHERE id = ?', [id]);
            if (result.affectedRows > 0) {
                const detalhes = `Motorista ID ${id} foi excluído.`;
                await registrarLog(req.user.id, req.user.nome, 'MOTORISTA_EXCLUIDO', detalhes);
                res.json({ deleted: true, message: 'Motorista excluído com sucesso.' });
            } else {
                res.status(404).json({ error: 'Motorista não encontrado.' });
            }
        } catch (err) {
            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return res.status(400).json({ error: 'Não é possível excluir este motorista, pois ele está associado a uma ou mais Ordens de Serviço.' });
            }
            console.error("Erro ao excluir motorista:", err.message);
            res.status(500).json({ error: 'Falha ao excluir motorista.' });
        }
    });

    // ROTA PARA OBTER OS DETALHES COMPLETOS E INSIGHTS DE UM MOTORISTA
    // CORRIGIDA PARA RETORNAR O VEÍCULO MAIS USADO
    router.get('/:id/details', authMiddleware, async (req, res) => {
    const { id: motoristaId } = req.params;
    const HISTORY_LIMIT = 10;

    try {
        // 1. Consulta principal para pegar os dados do motorista
        const [driverRows] = await pool.execute('SELECT * FROM motoristas WHERE id = ?', [motoristaId]);
        if (driverRows.length === 0) {
            return res.status(404).json({ error: 'Motorista não encontrado.' });
        }
        const driverDetails = driverRows[0];

        // 2. Executa todas as consultas de dados agregados em paralelo (6 queries)
        const [
            [osStats],
            [financeStats],
            historyOSResult,
            historyPagamentosResult,
            [mostUsedVehicle],
            [rankingResult] // NOVA QUERY DE RANKING
        ] = await Promise.all([
            // Query 1: Estatísticas das Ordens de Serviço (INALETARADA)
            pool.execute(`
                SELECT
                    COUNT(id) as os_concluidas_total,
                    SUM(valor) as faturamento_gerado,
                    AVG(valor) as ticket_medio,
                    MAX(data_conclusao) as ultima_atividade
                FROM ordens_servico
                WHERE motorista_id = ? AND status = 'Concluído'
            `, [motoristaId]),

            // Query 2: Estatísticas Financeiras (INALETARADA)
            pool.execute(`
                SELECT
                    COUNT(id) as total_pagamentos,
                    SUM(valor) as valor_total_pago
                FROM financeiro
                WHERE motorista_id = ? AND tipo = 'Despesa' 
            `, [motoristaId]),

            // Query 3: Histórico de OS concluídas (INALETARADA)
            pool.execute(`
                SELECT 
                    id, 
                    descricao, 
                    COALESCE(valor, 0) as valor,
                    COALESCE(data_conclusao, data_criacao) as data_referencia
                FROM ordens_servico
                WHERE motorista_id = ? AND status = 'Concluído'
                ORDER BY data_referencia DESC
                LIMIT ${HISTORY_LIMIT}
            `, [motoristaId]),

            // Query 4: Histórico de pagamentos (INALETARADA)
            pool.execute(`
                SELECT 
                    id, 
                    COALESCE(descricao, 'Pagamento') as descricao, 
                    COALESCE(valor, 0) as valor, 
                    data
                FROM financeiro
                WHERE motorista_id = ? AND tipo = 'Despesa'
                ORDER BY data DESC
                LIMIT ${HISTORY_LIMIT}
            `, [motoristaId]),
            
            // Query 5: Veículo mais utilizado (INALETARADA)
            pool.execute(`
                SELECT
                    v.modelo,
                    v.placa,
                    COUNT(os.id) AS total_os
                FROM ordens_servico os
                JOIN veiculos v ON os.veiculo_id = v.id
                    WHERE os.motorista_id = ? AND os.status = 'Concluído' AND os.veiculo_id IS NOT NULL
                GROUP BY v.id
                ORDER BY COUNT(os.id) DESC
                LIMIT 1
            `, [motoristaId]),

            // Query 6: CÁLCULO DE RANKING CORRIGIDO COM COALESCE DENTRO DA SUBQUERY
            pool.execute(`
                SELECT 
                    t1.ranking_pos,
                    t1.total_motoristas
                FROM (
                    SELECT 
                        m.id, 
                        -- Corrigido: Usamos COALESCE no SUM para garantir que motoristas sem OSs entrem no ranking com 0
                        RANK() OVER (ORDER BY COALESCE(SUM(os.valor), 0) DESC) as ranking_pos,
                        (SELECT COUNT(DISTINCT id) FROM motoristas) as total_motoristas
                    FROM motoristas m
                    LEFT JOIN ordens_servico os ON m.id = os.motorista_id AND os.status = 'Concluído'
                    GROUP BY m.id
                ) t1
                WHERE t1.id = ?;
            `, [motoristaId])
        ]);

        // 3. Combinação e Formatação da Resposta
        // Retira o objeto de dentro do array do ranking, se existir
        const rankingData = rankingResult[0] || {}; 

        const responseData = {
            details: driverDetails,
            stats: { 
                ...osStats[0], 
                ...financeStats[0],
                most_used_vehicle: mostUsedVehicle[0] || null,
                // NOVOS DADOS DE RANKING
                ranking_pos: rankingData.ranking_pos || null,
                total_motoristas: rankingData.total_motoristas || null
            },
            history: {
                ordensDeServico: historyOSResult[0], 
                pagamentos: historyPagamentosResult[0]
            }
        };

        // 4. Registro de Log
        await registrarLog(
            req.user.id,
            req.user.nome,
            'MOTORISTA_VISUALIZADO',
            `Visualizou os detalhes do motorista ID ${driverDetails.id} (${driverDetails.nome}).`
        );

        res.json(responseData);

    } catch (error) {
        console.error("Erro ao buscar detalhes do motorista:", error);
        res.status(500).json({ error: 'Falha ao carregar detalhes do motorista.' });
    }
});

    router.get('/export', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const { format = 'csv' } = req.query;

        try {
            const [motoristas] = await pool.execute('SELECT nome, cnh_numero, categoria_cnh, telefone FROM motoristas ORDER BY nome ASC');
            if (motoristas.length === 0) {
                return res.status(404).json({ error: 'Nenhum motorista para exportar.' });
            }

            await registrarLog(req.user.id, req.user.nome, 'MOTORISTAS_EXPORTADOS', `${motoristas.length} motoristas exportados para ${format.toUpperCase()}.`);

            if (format === 'xlsx') {
                const worksheet = XLSX.utils.json_to_sheet(motoristas);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Motoristas');
                const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
                
                res.setHeader('Content-Disposition', 'attachment; filename="motoristas_exportados.xlsx"');
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.send(buffer);
            } else {
                const { Parser } = require('json2csv');
                const json2csvParser = new Parser({ fields: ['nome', 'cnh_numero', 'categoria_cnh', 'telefone'] });
                const csv = json2csvParser.parse(motoristas);
                res.header('Content-Type', 'text/csv');
                res.attachment('motoristas_exportados.csv');
                res.send(csv);
            }
        } catch (err) {
            console.error("Erro ao exportar motoristas:", err);
            res.status(500).json({ error: 'Falha ao exportar motoristas.' });
        }
    });

    router.post('/import', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), upload.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }

        const connection = await pool.getConnection();
        try {
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            const data = XLSX.utils.sheet_to_json(worksheet, {
                header: ['nome', 'cnh_numero', 'categoria_cnh', 'telefone'],
                range: 1, 
                defval: null 
            });

            if (data.length === 0) {
                return res.status(400).json({ error: 'A planilha está vazia ou em um formato inválido.' });
            }
            
            await connection.beginTransaction();

            const motoristasParaInserir = data.map(row => [
                row.nome,
                row.cnh_numero,
                row.categoria_cnh,
                row.telefone
            ]);

            const sql = `INSERT INTO motoristas (nome, cnh_numero, categoria_cnh, telefone) VALUES ?`;
            
            const [result] = await connection.query(sql, [motoristasParaInserir]);
            
            await connection.commit();
            
            const insertedCount = result.affectedRows;
            await registrarLog(req.user.id, req.user.nome, 'MOTORISTAS_IMPORTADOS', `${insertedCount} motoristas importados via planilha.`);

            res.json({
                message: `Importação concluída! ${insertedCount} motoristas foram cadastrados.`,
                inserted: insertedCount,
                totalRecords: data.length
            });

        } catch (err) {
            await connection.rollback();
            console.error("Erro na importação de motoristas:", err);
            res.status(500).json({ error: `Falha na importação. Verifique o formato do arquivo. Detalhe: ${err.message}` });
        } finally {
            connection.release();
        }
    });

    return router;
};