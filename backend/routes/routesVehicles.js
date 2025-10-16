// routes/routesVehicles.js
const express = require('express');
const router = express.Router();

// Permissões específicas para este módulo, para manter a clareza
const PERMISSAO_VISUALIZAR = ['admin_geral', 'admin', 'operacional', 'financeiro'];
const PERMISSAO_CRIAR_EDITAR = ['admin_geral', 'admin', 'operacional'];
const PERMISSAO_DELETAR = ['admin_geral', 'admin'];

module.exports = (dependencies) => {
    // 1. Desestruturamos as dependências recebidas do server.js
    const { pool, authMiddleware, permissionMiddleware, registrarLog, uploadManutencao } = dependencies;

   router.get('/', authMiddleware, permissionMiddleware(PERMISSAO_VISUALIZAR), async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const { query, status } = req.query;

    let conditions = [];
    let params = [];

    // --- MUDANÇA 1: Adicionando alias 'v' para as condições ---
    if (query) {
        conditions.push('(v.placa LIKE ? OR v.modelo LIKE ? OR v.marca LIKE ?)');
        const searchQuery = `%${query}%`;
        params.push(searchQuery, searchQuery, searchQuery);
    }
    if (status) {
        conditions.push('v.status = ?');
        params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    try {
        // A query de contagem não precisa de join para performance
        const sqlCount = `SELECT COUNT(id) as total FROM veiculos v ${whereClause}`;
        const [countResult] = await pool.execute(sqlCount, params);
        const total = countResult[0].total;

        // --- MUDANÇA 2: A nova query que calcula o custo total de manutenção ---
        const sqlData = `
            SELECT 
                v.*, 
                COALESCE(SUM(vm.custo), 0) AS custo_total_manutencoes
            FROM 
                veiculos v
            LEFT JOIN 
                veiculos_manutencoes vm ON v.id = vm.veiculo_id
            ${whereClause}
            GROUP BY 
                v.id
            ORDER BY 
                v.modelo ASC 
            LIMIT ${limit} OFFSET ${offset}
        `;
        
        const [rows] = await pool.execute(sqlData, params);

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
        console.error("Erro ao buscar veículos:", err.message);
        res.status(500).json({ error: err.message });
    }
});
    /**
     * ROTA: POST /api/vehicles/
     * DESC: Cria um novo veículo.
     */
    router.post('/', authMiddleware, permissionMiddleware(PERMISSAO_CRIAR_EDITAR), async (req, res) => {
        const { placa, modelo, marca, ano, status, motorista_id } = req.body;
        const sql = `INSERT INTO veiculos (placa, modelo, marca, ano, status, motorista_id) VALUES (?, ?, ?, ?, ?, ?)`;
        
        try {
            const [result] = await pool.execute(sql, [placa, modelo, marca, ano, status, motorista_id || null]);
            
            const detalhes = `Veículo ${marca} ${modelo} (${placa}) foi criado.`;
            await registrarLog(req.user.id, req.user.nome, 'VEICULO_CRIADO', detalhes);

            res.status(201).json({ id: result.insertId });
        } catch (err) {
            console.error("Erro ao criar veículo:", err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * ROTA: PUT /api/vehicles/:id
     * DESC: Atualiza um veículo existente.
     */
    router.put('/:id', authMiddleware, permissionMiddleware(PERMISSAO_CRIAR_EDITAR), async (req, res) => {
        const { placa, modelo, marca, ano, status, motorista_id } = req.body;
        const { id } = req.params;
        const sql = `UPDATE veiculos SET placa = ?, modelo = ?, marca = ?, ano = ?, status = ?, motorista_id = ? WHERE id = ?`;
        
        try {
            const [result] = await pool.execute(sql, [placa, modelo, marca, ano, status, motorista_id || null, id]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Veículo não encontrado.' });
            }
            
            const detalhes = `Veículo ID ${id} (${placa}) foi atualizado.`;
            await registrarLog(req.user.id, req.user.nome, 'VEICULO_ATUALIZADO', detalhes);

            res.json({ updated: result.affectedRows });
        } catch (err) {
            console.error("Erro ao atualizar veículo:", err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * ROTA: DELETE /api/vehicles/:id
     * DESC: Exclui um veículo.
     */
    router.delete('/:id', authMiddleware, permissionMiddleware(PERMISSAO_DELETAR), async (req, res) => {
        const { id } = req.params;
        try {
            const [result] = await pool.execute('DELETE FROM veiculos WHERE id = ?', [id]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Veículo não encontrado.' });
            }

            const detalhes = `Veículo ID ${id} foi excluído.`;
            await registrarLog(req.user.id, req.user.nome, 'VEICULO_EXCLUIDO', detalhes);
            
            res.json({ deleted: result.affectedRows });
        } catch (err) {
            console.error("Erro ao excluir veículo:", err.message);
            res.status(500).json({ error: err.message });
        }
    });


    router.get('/:id/details', authMiddleware, permissionMiddleware(PERMISSAO_VISUALIZAR), async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Dados cadastrais do veículo
        const [vehicleRows] = await connection.execute('SELECT * FROM veiculos WHERE id = ?', [id]);
        if (vehicleRows.length === 0) {
            return res.status(404).json({ error: 'Veículo não encontrado.' });
        }
        const dados_cadastrais = vehicleRows[0];

        // 2. Insights de performance (baseado nas OS)
        const sqlPerformance = `
            SELECT
                COUNT(id) as total_servicos,
                SUM(valor) as faturamento_total
            FROM ordens_servico
            WHERE veiculo_id = ? AND status = 'Concluído'`;
        const [performanceRows] = await connection.execute(sqlPerformance, [id]);
        const performance = performanceRows[0];

        // 3. Insights de custo (baseado nas manutenções)
        const sqlCustos = `
            SELECT
                SUM(custo) as custo_total_manutencao,
                MAX(data) as ultima_manutencao
            FROM veiculos_manutencoes
            WHERE veiculo_id = ?`;
        const [custosRows] = await connection.execute(sqlCustos, [id]);
        const custos = custosRows[0];

        // 4. Histórico de Ordens de Serviço
        const [historico_os] = await connection.execute(
            "SELECT id, data_conclusao, descricao, valor, status FROM ordens_servico WHERE veiculo_id = ? ORDER BY data_conclusao DESC LIMIT 50",
            [id]
        );

        // 5. Histórico de Manutenções
        const [historico_manutencao] = await connection.execute(
    `SELECT 
        vm.*, 
        d.status as status_aprovacao 
     FROM veiculos_manutencoes vm
     LEFT JOIN despesas d ON vm.despesa_id = d.id
     WHERE vm.veiculo_id = ? 
     ORDER BY vm.data DESC LIMIT 50`,
    [id]
);

        await connection.commit();

        // Montando o JSON final de resposta
        res.json({
            dados_cadastrais,
            insights: {
                faturamento_total: parseFloat(performance.faturamento_total) || 0,
                custo_operacional_total: parseFloat(custos.custo_total_manutencao) || 0,
                lucro_total: (parseFloat(performance.faturamento_total) || 0) - (parseFloat(custos.custo_total_manutencao) || 0),
                total_servicos: performance.total_servicos || 0,
                ultima_manutencao: custos.ultima_manutencao || null,
            },
            historico_os,
            historico_manutencao
        });

    } catch (err) {
        await connection.rollback();
        console.error("Erro ao buscar detalhes do veículo:", err.message);
        res.status(500).json({ error: 'Falha ao buscar detalhes do veículo.' });
    } finally {
        connection.release();
    }
});


/**
     * ROTA: POST /api/vehicles/:id/manutencoes
     * DESC: Adiciona um novo registro de manutenção para um veículo, com anexo.
     */
    router.post('/:id/manutencoes', authMiddleware, permissionMiddleware(PERMISSAO_CRIAR_EDITAR), uploadManutencao.single('anexo'), async (req, res) => {
    const { id: veiculo_id } = req.params;
    const { data, tipo, custo, descricao } = req.body;
    const anexo_path = req.file ? req.file.path : null;
    const criado_por_id = req.user.id;

    if (!data || !tipo || !custo) {
        return res.status(400).json({ error: 'Data, tipo e custo são obrigatórios.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // --- LÓGICA MELHORADA AQUI ---
        // 1. Encontrar o ID da categoria "Manutenção de Frota" dinamicamente
        const NOME_CATEGORIA_MANUTENCAO = "Manutenção de Frota";
        let [[categoria]] = await connection.execute('SELECT id FROM despesas_categorias WHERE nome = ?', [NOME_CATEGORIA_MANUTENCAO]);

        // Se a categoria não existir, cria ela!
        if (!categoria) {
            const [newCatResult] = await connection.execute('INSERT INTO despesas_categorias (nome) VALUES (?)', [NOME_CATEGORIA_MANUTENCAO]);
            categoria = { id: newCatResult.insertId };
        }
        const categoriaManutencaoId = categoria.id;
        // --- FIM DA LÓGICA MELHORADA ---
        
        const [veiculoInfo] = await connection.execute('SELECT placa FROM veiculos WHERE id = ?', [veiculo_id]);
        const placa = veiculoInfo[0].placa;
        const despesaDescricao = `Manutenção: ${tipo} - Veículo ${placa}`;

        const sqlDespesa = `
            INSERT INTO despesas (descricao, valor, data_vencimento, status, categoria_id, veiculo_id, anexo_url, criado_por_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [resultDespesa] = await connection.execute(sqlDespesa, [despesaDescricao, custo, data, 'Pendente', categoriaManutencaoId, veiculo_id, anexo_path, criado_por_id]);
        const newDespesaId = resultDespesa.insertId;

        const sqlManutencao = `
            INSERT INTO veiculos_manutencoes (veiculo_id, data, tipo, custo, descricao, anexo_path, despesa_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.execute(sqlManutencao, [veiculo_id, data, tipo, custo, descricao || null, anexo_path, newDespesaId]);

        const [usuariosParaNotificar] = await connection.execute(
            "SELECT id FROM usuarios WHERE perfil IN ('admin_geral', 'admin', 'financeiro')"
        );

        if (usuariosParaNotificar.length > 0) {
            const mensagem = `Nova despesa de manutenção (R$ ${parseFloat(custo).toFixed(2)}) aguardando aprovação.`;
            const notificacoes = usuariosParaNotificar.map(user => 
                [user.id, 'despesa_pendente', mensagem, newDespesaId]
            );
            await connection.query("INSERT INTO notificacoes (usuario_id, tipo, mensagem, link_id) VALUES ?", [notificacoes]);
        }
        
        await connection.commit();
        res.status(201).json({ message: 'Manutenção registrada e enviada para aprovação financeira!' });

    } catch (err) {
        await connection.rollback();
        console.error("Erro ao registrar manutenção e despesa:", err.message);
        res.status(500).json({ error: 'Falha ao registrar manutenção.' });
    } finally {
        connection.release();
    }
});

    /**
     * ROTA: DELETE /api/vehicles/manutencoes/:manutencaoId
     * DESC: Exclui um registro de manutenção e seu anexo físico.
     */
   router.delete('/manutencoes/:manutencaoId', authMiddleware, permissionMiddleware(PERMISSAO_DELETAR), async (req, res) => {
    const { manutencaoId } = req.params;
    const fs = require('fs').promises;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Busca os dados da manutenção, incluindo o ID da despesa vinculada
        const [rows] = await connection.execute('SELECT anexo_path, veiculo_id, despesa_id FROM veiculos_manutencoes WHERE id = ?', [manutencaoId]);

        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Registro de manutenção não encontrado.' });
        }
        const { anexo_path, veiculo_id, despesa_id } = rows[0];

        // 2. Se houver uma despesa vinculada, apaga os registros financeiros primeiro
        if (despesa_id) {
            // Apaga o lançamento no caixa (tabela financeiro)
            await connection.execute('DELETE FROM financeiro WHERE despesa_id = ?', [despesa_id]);
            // Apaga a despesa em si
            await connection.execute('DELETE FROM despesas WHERE id = ?', [despesa_id]);
        }

        // 3. Apaga o registro da manutenção (o passo que já existia)
        await connection.execute('DELETE FROM veiculos_manutencoes WHERE id = ?', [manutencaoId]);

        // 4. Se existia um anexo, deleta o arquivo físico (o passo que já existia)
        if (anexo_path) {
            try {
                await fs.unlink(anexo_path);
            } catch (fileErr) {
                console.warn(`Arquivo de anexo não encontrado para exclusão: ${anexo_path}`);
            }
        }

        await connection.commit();
        
        await registrarLog(req.user.id, req.user.nome, 'MANUTENCAO_VEICULO_EXCLUIDA', `Manutenção ID ${manutencaoId} do veículo ID ${veiculo_id} e seus dados financeiros foram excluídos.`);

        res.json({ message: 'Manutenção e todos os lançamentos financeiros associados foram excluídos com sucesso.' });

    } catch (err) {
        await connection.rollback();
        console.error("Erro ao excluir manutenção em cascata:", err.message);
        res.status(500).json({ error: 'Falha ao excluir manutenção.' });
    } finally {
        connection.release();
    }
});

    // O router com as rotas configuradas é retornado
    return router;
};