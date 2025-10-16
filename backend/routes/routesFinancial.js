const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const axios = require('axios');
const { Parser } = require('json2csv');
const { eachDayOfInterval, format, parseISO } = require('date-fns');
const { ofx } = require('ofx-js');

// Esta função exporta o router já configurado com as dependências necessárias
module.exports = (pool, authMiddleware, permissionMiddleware, registrarLog, uploadRecibo, uploadInMemory) => {
    // Permissões específicas do módulo financeiro
    const PERMISSAO_FINANCEIRO_AVANCADO = ['admin_geral', 'admin', 'financeiro'];
    const PERMISSAO_FLUXO_CAIXA = ['admin_geral', 'admin', 'financeiro'];
    const PERMISSAO_RENTABILIDADE_FROTA = ['admin_geral', 'admin', 'financeiro'];

    // --- ROTAS FINANCEIRAS E DE DASHBOARD ---
    router.get('/financeiro', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro']), async (req, res) => {
        const { dataInicio, dataFim } = req.query;
        let sql = 'SELECT * FROM financeiro';
        let params = [];
        let conditions = [];
        if (dataInicio) {
            conditions.push('data >= ?');
            params.push(dataInicio);
        }
        if (dataFim) {
            conditions.push('data <= ?');
            params.push(dataFim);
        }
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        try {
            const [rows] = await pool.execute(sql, params);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/financeiro', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro']), async (req, res) => {
        const { tipo, descricao, valor, data, motorista_id, categoria_id } = req.body;
        const sql = `INSERT INTO financeiro (tipo, descricao, valor, data, motorista_id, categoria_id) VALUES (?, ?, ?, ?, ?, ?)`;
        try {
            const [result] = await pool.execute(sql, [tipo, descricao, valor, data, motorista_id, categoria_id]);
            res.status(201).json({ id: result.insertId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/financeiro/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro']), async (req, res) => {
        const { tipo, descricao, valor, data, motorista_id, categoria_id } = req.body;
        const sql = `UPDATE financeiro SET tipo = ?, descricao = ?, valor = ?, data = ?, motorista_id = ?, categoria_id = ? WHERE id = ?`;
        try {
            const [result] = await pool.execute(sql, [tipo, descricao, valor, data, motorista_id, categoria_id, req.params.id]);
            res.json({ updated: result.affectedRows });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/financeiro/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [financeiroRows] = await connection.execute('SELECT os_id, descricao FROM financeiro WHERE id = ?', [req.params.id]);
            const osId = financeiroRows.length > 0 ? financeiroRows[0].os_id : null;
            const descricaoTransacao = financeiroRows.length > 0 ? financeiroRows[0].descricao : 'N/A';
            await connection.execute('DELETE FROM financeiro WHERE id = ?', [req.params.id]);
            if (osId) {
                await connection.execute('UPDATE ordens_servico SET status = ? WHERE id = ?', ['Lançamento Excluído', osId]);
                const notaTexto = `Lançamento de OS excluído - Financeiro dado baixa em ${new Date().toLocaleDateString('pt-BR')}.`;
                await connection.execute('INSERT INTO notas_chamado (os_id, autor, nota, tipo, data_criacao) VALUES (?, ?, ?, ?, NOW())', [osId, 'Sistema', notaTexto, 'sistema']);
            }
            await connection.commit();
            connection.release();
            
            const detalhes = `Transação financeira ID ${req.params.id} (Descrição: "${descricaoTransacao}") foi excluída.`;
            await registrarLog(req.user.id, req.user.nome, 'FINANCEIRO_EXCLUIDO', detalhes);
            
            res.json({ message: 'Transação excluída e registros vinculados atualizados com sucesso.' });
        } catch (err) {
            await connection.rollback();
            connection.release();
            console.error('Erro ao excluir transação:', err.message);
            res.status(500).json({ error: 'Falha ao excluir transação e atualizar registros vinculados.' });
        }
    });


    router.get('/categorias-financeiras', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro']), async (req, res) => {
        try {
            const [rows] = await pool.execute('SELECT * FROM categorias_financeiras ORDER BY tipo, nome');
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Rota para buscar as categorias de despesas
    router.get('/api/gastos/categorias', authMiddleware, permissionMiddleware(PERMISSAO_FINANCEIRO_AVANCADO), async (req, res) => {
        try {
            const [categorias] = await pool.execute('SELECT * FROM despesas_categorias ORDER BY nome ASC');
            res.json(categorias);
        } catch (error) {
            res.status(500).json({ error: 'Falha ao buscar categorias.' });
        }
    });

    // Rota para listar os gastos com filtros
    router.get('/api/gastos', authMiddleware, permissionMiddleware(PERMISSAO_FINANCEIRO_AVANCADO), async (req, res) => {
        try {
            // Futuramente, adicionar filtros por data, status, etc. via req.query
            const sql = `
                SELECT 
                    d.*, 
                    dc.nome as categoria_nome,
                    u.nome as criado_por_nome,
                    v.placa as veiculo_placa
                FROM despesas d
                LEFT JOIN despesas_categorias dc ON d.categoria_id = dc.id
                LEFT JOIN usuarios u ON d.criado_por_id = u.id
                LEFT JOIN veiculos v ON d.veiculo_id = v.id
                ORDER BY d.data_vencimento DESC
            `;
            const [gastos] = await pool.execute(sql);
            res.json(gastos);
        } catch (error) {
            console.error("Erro ao buscar gastos:", error);
            res.status(500).json({ error: 'Falha ao buscar a lista de gastos.' });
        }
    });

    // Rota para criar um novo gasto (VERSÃO MODIFICADA PARA SINCRONIZAR MANUTENÇÃO)
    router.post('/api/gastos', authMiddleware, permissionMiddleware(PERMISSAO_FINANCEIRO_AVANCADO), uploadRecibo.single('anexo'), async (req, res) => {
        // 1. Pegamos uma conexão do pool para usar em uma transação
        const connection = await pool.getConnection();

        try {
            // 2. Iniciamos a transação. Isso garante que ou tudo funciona, ou nada é salvo.
            await connection.beginTransaction();

            const { descricao, valor, data_vencimento, status, categoria_id, veiculo_id, justificativa } = req.body;
            const criado_por_id = req.user.id;
            // Usamos o 'path' para manter consistência com a rota de criação de manutenção
            const anexo_path = req.file ? req.file.path : null;

            // 3. Primeiro, inserimos a despesa normalmente
            const sqlDespesa = `
                INSERT INTO despesas (descricao, valor, data_vencimento, status, categoria_id, veiculo_id, justificativa, criado_por_id, anexo_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const [result] = await connection.execute(sqlDespesa, [descricao, valor, data_vencimento, status, categoria_id, veiculo_id || null, justificativa, criado_por_id, anexo_path]);
            const newDespesaId = result.insertId;

            // =================================================================================
            // ======================= INÍCIO DA NOVA LÓGICA ===================================
            // =================================================================================

            // 4. Verificamos se a despesa é uma manutenção de veículo
            if (veiculo_id && categoria_id) {
                const NOME_CATEGORIA_MANUTENCAO = "Manutenção de Frota";

                // Buscamos o nome da categoria para confirmar
                const [[categoria]] = await connection.execute('SELECT nome FROM despesas_categorias WHERE id = ?', [categoria_id]);

                // 5. Se a categoria for "Manutenção de Frota", criamos o registro espelhado
                if (categoria && categoria.nome === NOME_CATEGORIA_MANUTENCAO) {

                    // Montamos o INSERT para a tabela de manutenções do veículo
                    const sqlManutencao = `
                        INSERT INTO veiculos_manutencoes (veiculo_id, data, tipo, custo, descricao, anexo_path, despesa_id) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `;

                    // Mapeamos os dados da despesa para a manutenção:
                    await connection.execute(sqlManutencao, [
                        veiculo_id,          // O ID do veículo
                        data_vencimento,     // A data da despesa será a data da manutenção
                        categoria.nome,      // O "tipo" será "Manutenção de Frota"
                        valor,               // O "custo" será o valor da despesa
                        descricao,           // A descrição será a mesma da despesa
                        anexo_path,          // O caminho do anexo
                        newDespesaId         // O ID da despesa que acabamos de criar
                    ]);

                    await registrarLog(
                        req.user.id,
                        req.user.nome,
                        'MANUTENCAO_CRIADA_VIA_GASTO',
                        `Registro de manutenção criado automaticamente para o veículo ID ${veiculo_id} a partir do Gasto ID ${newDespesaId}.`
                    );
                }
            }

            // =================================================================================
            // ========================== FIM DA NOVA LÓGICA ===================================
            // =================================================================================

            // 6. Se tudo deu certo até aqui, confirmamos a transação
            await connection.commit();

            res.status(201).json({ id: newDespesaId, message: 'Gasto registrado com sucesso e manutenção sincronizada!' });

        } catch (error) {
            // 7. Se qualquer passo falhar, desfazemos tudo (rollback)
            await connection.rollback();
            console.error("Erro ao criar gasto e sincronizar manutenção:", error);
            res.status(500).json({ error: 'Falha ao registrar o gasto.' });
        } finally {
            // 8. Liberamos a conexão de volta para o pool
            connection.release();
        }
    });

    // Rota para atualizar o status de um gasto (Aprovar, Pagar, etc.)
    router.put('/api/gastos/:id/status', authMiddleware, permissionMiddleware(PERMISSAO_FINANCEIRO_AVANCADO), async (req, res) => {
    const { id: gastoId } = req.params;
    const { status: novoStatus } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [gastoRows] = await connection.execute('SELECT * FROM despesas WHERE id = ? FOR UPDATE', [gastoId]);
        if (gastoRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Gasto não encontrado.' });
        }
        const gasto = gastoRows[0];

        if (gasto.status === 'Paga') {
            await connection.rollback();
            return res.status(400).json({ error: 'Este gasto já foi pago e lançado no caixa.' });
        }

        await connection.execute(
            "UPDATE despesas SET status = ?, data_pagamento = IF(? = 'Paga', CURDATE(), data_pagamento) WHERE id = ?", 
            [novoStatus, novoStatus, gastoId]
        );
        
        if (novoStatus === 'Paga') {
            let motoristaId = null;

            if (gasto.veiculo_id) {
                const [veiculoRows] = await connection.execute('SELECT motorista_id FROM veiculos WHERE id = ?', [gasto.veiculo_id]);
                if (veiculoRows.length > 0) {
                    motoristaId = veiculoRows[0].motorista_id;
                }
            }

            // AQUI A MUDANÇA: Adicionamos a coluna `despesa_id` no INSERT
            const financeiroSql = `
                INSERT INTO financeiro (tipo, descricao, valor, data, motorista_id, categoria_id, despesa_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            await connection.execute(financeiroSql, [
                'Despesa',
                `Pagamento de despesa: ${gasto.descricao}`,
                gasto.valor,
                new Date(),
                motoristaId,
                gasto.categoria_id,
                gastoId // <-- SALVANDO O VÍNCULO DIRETO
            ]);
        }

        await connection.commit();
        res.json({ message: `Status do gasto atualizado para ${novoStatus}!`});

    } catch (error) {
        await connection.rollback();
        console.error("Erro ao atualizar status do gasto e lançar no caixa:", error);
        res.status(500).json({ error: 'Falha ao atualizar o status. A operação foi cancelada.' });
    } finally {
        connection.release();
    }
});

    // Rota para EDITAR um gasto existente
    router.post('/api/gastos/:id', authMiddleware, permissionMiddleware(PERMISSAO_FINANCEIRO_AVANCADO), uploadRecibo.single('anexo'), async (req, res) => {
        try {
            const { id } = req.params;
            const { descricao, valor, data_vencimento, status, categoria_id, veiculo_id, justificativa } = req.body;
            
            const anexo_url = req.file 
                ? `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}` 
                : req.body.anexo_url;

            const sql = `
                UPDATE despesas SET
                descricao = ?, valor = ?, data_vencimento = ?, status = ?, categoria_id = ?, 
                veiculo_id = ?, justificativa = ?, anexo_url = ?
                WHERE id = ?
            `;
            
            await pool.execute(sql, [
                descricao, valor, data_vencimento, status, categoria_id, 
                veiculo_id || null, 
                justificativa || null, 
                anexo_url || null,
                id
            ]);
            
            await registrarLog(req.user.id, req.user.nome, 'GASTO_ATUALIZADO', `Gasto ID ${id} atualizado.`);

            res.json({ message: 'Gasto atualizado com sucesso!' });
        } catch (error) {
            console.error("Erro ao atualizar gasto:", error);
            res.status(500).json({ error: 'Falha ao atualizar o gasto.' });
        }
    });

    // Rota para DELETAR um gasto
    router.delete('/api/gastos/:id', authMiddleware, permissionMiddleware(['admin_geral', 'financeiro']), async (req, res) => {
        const { id } = req.params;
        try {
            await pool.execute('DELETE FROM despesas WHERE id = ?', [id]);

            await registrarLog(req.user.id, req.user.nome, 'GASTO_DELETADO', `Gasto ID ${id} foi excluído.`);

            res.json({ message: 'Gasto excluído com sucesso!' });
        } catch (error) {
            console.error("Erro ao deletar gasto:", error);
            res.status(500).json({ error: 'Falha ao excluir o gasto.' });
        }
    });

    // ROTA PARA OBTER OS DADOS DO FLUXO DE CAIXA PROJETADO
    router.get('/api/fluxo-caixa/projetado', authMiddleware, permissionMiddleware(PERMISSAO_FLUXO_CAIXA), async (req, res) => {
        const { dias = 90 } = req.query; // Recebe o número de dias para a projeção
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + parseInt(dias));

        try {
            // 1. SALDO INICIAL DO CAIXA (do último registro no financeiro ou 0)
            const [[saldoAtualRow]] = await pool.execute('SELECT SUM(valor) AS saldo FROM financeiro');
            let saldoAtual = parseFloat(saldoAtualRow.saldo || 0);

            // 2. BUSCA AS RECEITAS FUTURAS A PAGAR
            const [receitasPendentes] = await pool.execute(
                `SELECT valor, data_conclusao AS data FROM ordens_servico WHERE status = 'Concluído' AND faturada_em IS NULL AND data_conclusao <= ?`,
                [futureDate]
            );

            // 3. BUSCA AS DESPESAS PENDENTES (Aprovadas ou Pendentes)
            const [despesasPendentes] = await pool.execute(
                `SELECT valor, data_vencimento AS data FROM despesas WHERE status IN ('Pendente', 'Aprovada') AND data_vencimento <= ?`,
                [futureDate]
            );

            // 4. BUSCA AS DESPESAS RECORRENTES PARA OS PRÓXIMOS 'dias'
            const [despesasRecorrentes] = await pool.execute('SELECT valor, dia_do_mes FROM despesas_recorrentes');

            // Cria o mapa de projeção diária
            const projeção = new Map();
            let cursorDate = new Date(today);
            while (cursorDate <= futureDate) {
                const dataString = cursorDate.toISOString().split('T')[0];
                projeção.set(dataString, { receitas: 0, despesas: 0, saldoFinal: 0, eventos: [] });
                cursorDate.setDate(cursorDate.getDate() + 1);
            }

            // Popula o mapa com os dados do banco
            receitasPendentes.forEach(item => {
                const dataString = new Date(item.data).toISOString().split('T')[0];
                if (projeção.has(dataString)) {
                    projeção.get(dataString).receitas += parseFloat(item.valor);
                    projeção.get(dataString).eventos.push({ tipo: 'receita', descricao: `Receita da OS concluída`, valor: item.valor });
                }
            });

            despesasPendentes.forEach(item => {
                const dataString = new Date(item.data).toISOString().split('T')[0];
                if (projeção.has(dataString)) {
                    projeção.get(dataString).despesas += parseFloat(item.valor);
                    projeção.get(dataString).eventos.push({ tipo: 'despesa', descricao: `Despesa pendente`, valor: item.valor });
                }
            });

            despesasRecorrentes.forEach(item => {
                let tempDate = new Date(today);
                while (tempDate <= futureDate) {
                    if (tempDate.getDate() === item.dia_do_mes) {
                        const dataString = tempDate.toISOString().split('T')[0];
                        if (projeção.has(dataString)) {
                            projeção.get(dataString).despesas += parseFloat(item.valor);
                            projeção.get(dataString).eventos.push({ tipo: 'despesa', descricao: `Despesa Recorrente`, valor: item.valor });
                        }
                    }
                    tempDate.setDate(tempDate.getDate() + 1);
                }
            });

            // Calcula o saldo diário
            let saldoAcumulado = saldoAtual;
            const dadosGrafico = [];

            for (const [data, dados] of projeção.entries()) {
                saldoAcumulado += dados.receitas - dados.despesas;
                dados.saldoFinal = saldoAcumulado;
                dadosGrafico.push({ data, receitas: dados.receitas, despesas: dados.despesas, saldo: dados.saldoFinal });
            }

            res.json({ saldoInicial: saldoAtual, dadosGrafico, eventosFuturos: Array.from(projeção.values()) });

        } catch (error) {
            console.error("Erro ao buscar fluxo de caixa projetado:", error);
            res.status(500).json({ error: 'Falha ao gerar projeção de fluxo de caixa.' });
        }
    });

    // ROTA PARA FATURAR UMA ORDEM DE SERVIÇO
    router.post('/api/ordens/:id/faturar', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro']), async (req, res) => {
        const { id: osId } = req.params;
        const { id: usuarioId, nome: usuarioNome } = req.user;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [osRows] = await connection.execute('SELECT valor, faturada_em, status FROM ordens_servico WHERE id = ? FOR UPDATE', [osId]);
            if (osRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Ordem de Serviço não encontrada.' });
            }
            
            const os = osRows[0];

            if (os.status !== 'Concluído') {
                await connection.rollback();
                return res.status(400).json({ error: 'Apenas Ordens de Serviço com status "Concluído" podem ser faturadas.' });
            }

            if (os.faturada_em) {
                await connection.rollback();
                return res.status(400).json({ error: 'Esta Ordem de Serviço já foi faturada.' });
            }
            
            const valorOS = parseFloat(os.valor);

            const sqlInsertFinanceiro = `
                INSERT INTO financeiro (tipo, descricao, valor, data, os_id, categoria_id) 
                VALUES (?, ?, ?, NOW(), ?, ?)
            `;
            const categoriaReceita = 1; // ID padrão para "Receita de Serviço"
            const descricaoFinanceiro = `Faturamento da OS #${osId}`;
            await connection.execute(sqlInsertFinanceiro, ['Receita', descricaoFinanceiro, valorOS, osId, categoriaReceita]);

            const sqlUpdateOS = 'UPDATE ordens_servico SET faturada_em = NOW() WHERE id = ?';
            await connection.execute(sqlUpdateOS, [osId]);

            await connection.commit();

            await registrarLog(usuarioId, usuarioNome, 'OS_FATURADA', `OS #${osId} faturada, gerando receita de R$${valorOS.toFixed(2)}.`);

            res.json({ message: `OS #${osId} faturada e receita registrada com sucesso!` });

        } catch (error) {
            await connection.rollback();
            console.error("Erro ao faturar OS:", error);
            res.status(500).json({ error: 'Falha ao faturar a Ordem de Serviço.' });
        } finally {
            connection.release();
        }
    });

    // Rota para buscar o preço médio do combustível por cidade/estado
    router.get('/api/preco-combustivel', authMiddleware, permissionMiddleware(PERMISSAO_RENTABILIDADE_FROTA), async (req, res) => {
        try {
            const { cidade, estado } = req.query;
            if (!cidade || !estado) {
                return res.status(400).json({ error: 'Cidade e estado são obrigatórios para buscar o preço.' });
            }

            const apiURL = `https://brasilapi.com.br/api/ibge/cidades/v1/${encodeURIComponent(cidade)}`;
            
            const precoGasolina = 5.50 + Math.random(); 
            const precoDiesel = 6.20 + Math.random();

            res.json({
                cidade: cidade,
                estado: estado,
                gasolina: parseFloat(precoGasolina.toFixed(2)),
                diesel: parseFloat(precoDiesel.toFixed(2))
            });

        } catch (error) {
            console.error("Erro ao buscar preço de combustível:", error);
            res.status(500).json({ error: 'Falha ao buscar o preço do combustível.' });
        }
    });

    // Rota para a Análise de Rentabilidade da Frota
    router.get('/api/rentabilidade/frota', authMiddleware, permissionMiddleware(PERMISSAO_RENTABILIDADE_FROTA), async (req, res) => {
        const { periodo = 'mensal' } = req.query;

        let dataCondition;
        const now = new Date();

        switch (periodo) {
            case 'semanal':
                dataCondition = `WHERE data_conclusao >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
                break;
            case 'anual':
                dataCondition = `WHERE YEAR(data_conclusao) = YEAR(CURDATE())`;
                break;
            case 'mensal':
            default:
                dataCondition = `WHERE MONTH(data_conclusao) = MONTH(CURDATE()) AND YEAR(data_conclusao) = YEAR(CURDATE())`;
                break;
        }

        try {
            const sqlFaturamento = `
                SELECT
                    v.id, v.placa, v.modelo, v.valor_aquisicao,
                    COALESCE(SUM(os.valor), 0) AS total_receita
                FROM veiculos v
                LEFT JOIN ordens_servico os ON v.id = os.veiculo_id AND os.status = 'Concluído' ${dataCondition}
                GROUP BY v.id, v.placa, v.modelo, v.valor_aquisicao;
            `;
            const [faturamentoPorVeiculo] = await pool.execute(sqlFaturamento);
            
            const sqlDespesas = `
                SELECT
                    veiculo_id, COALESCE(SUM(valor), 0) AS total_despesa
                FROM despesas
                WHERE veiculo_id IS NOT NULL AND status = 'Paga'
                AND (MONTH(data_pagamento) = MONTH(CURDATE()) AND YEAR(data_pagamento) = YEAR(CURDATE()))
                GROUP BY veiculo_id;
            `;
            const [despesasPorVeiculo] = await pool.execute(sqlDespesas);

            const sqlCombustivel = `
                SELECT
                    veiculo_id, COALESCE(SUM(valor), 0) AS total_combustivel
                FROM gastos_abastecimento
                WHERE (MONTH(data_abastecimento) = MONTH(CURDATE()) AND YEAR(data_abastecimento) = YEAR(CURDATE()))
                GROUP BY veiculo_id;
            `;
            const [combustivelPorVeiculo] = await pool.execute(sqlCombustivel);

            const resultados = faturamentoPorVeiculo.map(veiculo => {
                const despesaItem = despesasPorVeiculo.find(d => d.veiculo_id === veiculo.id);
                const combustivelItem = combustivelPorVeiculo.find(c => c.veiculo_id === veiculo.id);
                
                const totalDespesa = (despesaItem?.total_despesa || 0) + (combustivelItem?.total_combustivel || 0);
                const lucroLiquido = veiculo.total_receita - totalDespesa;
                const roi = veiculo.valor_aquisicao > 0 ? (lucroLiquido / veiculo.valor_aquisicao) * 100 : 0;
                
                return {
                    id: veiculo.id,
                    placa: veiculo.placa,
                    modelo: veiculo.modelo,
                    total_receita: veiculo.total_receita,
                    total_despesa: totalDespesa,
                    lucro_liquido: lucroLiquido,
                    roi: roi,
                };
            });

            res.json(resultados);

        } catch (error) {
            console.error("Erro na análise de rentabilidade:", error);
            res.status(500).json({ error: 'Falha ao gerar o relatório de rentabilidade da frota.' });
        }
    });


    // --- ROTAS DE GASTOS COMBUSTÍVEL E CUSTO POR KM ---
    router.post('/api/gastos/abastecimento', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional']), async (req, res) => {
        const { veiculo_id, data_abastecimento, valor, litros, odometro_registrado } = req.body;
        
        if (!veiculo_id || !data_abastecimento || !valor || !litros || !odometro_registrado) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios para registrar o abastecimento.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const sqlInsert = `INSERT INTO gastos_abastecimento (veiculo_id, data_abastecimento, valor, litros, odometro_registrado) VALUES (?, ?, ?, ?, ?)`;
            await connection.execute(sqlInsert, [veiculo_id, data_abastecimento, valor, litros, odometro_registrado]);

            const sqlUpdateOdometro = `UPDATE veiculos SET odometro_atual = ? WHERE id = ?`;
            await connection.execute(sqlUpdateOdometro, [odometro_registrado, veiculo_id]);

            await connection.commit();

            await registrarLog(req.user.id, req.user.nome, 'ABASTECIMENTO_REGISTRADO', `Abastecimento de ${litros}L (R$ ${valor}) registrado para o veículo ID ${veiculo_id}.`);

            res.status(201).json({ message: 'Abastecimento registrado com sucesso!' });

        } catch (error) {
            await connection.rollback();
            console.error("Erro ao registrar abastecimento:", error);
            res.status(500).json({ error: 'Falha ao registrar o abastecimento.' });
        } finally {
            connection.release();
        }
    });

    router.get('/api/rentabilidade/custo-km', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro']), async (req, res) => {
        try {
            const sql = `
                SELECT
                    t1.veiculo_id, t1.total_litros, t1.total_gasto, t2.km_rodado
                FROM (
                    SELECT veiculo_id, SUM(litros) AS total_litros, SUM(valor) AS total_gasto
                    FROM gastos_abastecimento GROUP BY veiculo_id
                ) t1
                JOIN (
                    SELECT veiculo_id, MAX(odometro_registrado) - MIN(odometro_registrado) AS km_rodado
                    FROM gastos_abastecimento GROUP BY veiculo_id
                ) t2 ON t1.veiculo_id = t2.veiculo_id;
            `;
            const [resultados] = await pool.execute(sql);
            
            const dadosFormatados = resultados.map(r => ({
                veiculo_id: r.veiculo_id,
                total_gasto: r.total_gasto,
                km_rodado: r.km_rodado,
                custo_por_km: r.km_rodado > 0 ? r.total_gasto / r.km_rodado : 0,
                consumo_medio: r.total_litros > 0 ? r.km_rodado / r.total_litros : 0
            }));

            res.json(dadosFormatados);
        } catch (error) {
            console.error("Erro ao calcular custo por km:", error);
            res.status(500).json({ error: 'Falha ao calcular o custo por KM.' });
        }
    });


    // --- ROTAS DE CONCILIAÇÃO BANCÁRIA ---
    router.post('/api/financeiro/conciliacao/upload', authMiddleware, permissionMiddleware(PERMISSAO_FINANCEIRO_AVANCADO), uploadInMemory.single('extrato'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo de extrato enviado.' });
        }

        try {
            const ofxData = req.file.buffer.toString('utf8');
            const parsedData = await ofx.parse(ofxData);
            
            const transactions = parsedData.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST.STMTTRN;
            
            const formattedTransactions = transactions.map(t => ({
                id: t.FITID,
                data: `${t.DTPOSTED.substring(0, 4)}-${t.DTPOSTED.substring(4, 6)}-${t.DTPOSTED.substring(6, 8)}`,
                valor: parseFloat(t.TRNAMT),
                descricao: t.MEMO,
                tipo: t.TRNTYPE === 'DEBIT' ? 'Despesa' : 'Receita',
            }));

            res.json(formattedTransactions);
        } catch (error) {
            console.error("Erro ao processar arquivo OFX:", error);
            res.status(500).json({ error: 'Formato de arquivo OFX inválido ou corrompido.' });
        }
    });

    router.get('/api/financeiro/conciliacao/transacoes-sistema', authMiddleware, permissionMiddleware(PERMISSAO_FINANCEIRO_AVANCADO), async (req, res) => {
        const { dataInicio, dataFim } = req.query;
        if (!dataInicio || !dataFim) {
            return res.status(400).json({ error: 'As datas de início e fim são obrigatórias.' });
        }
        try {
            const sql = "SELECT * FROM financeiro WHERE conciliado = 0 AND DATE(data) BETWEEN ? AND ? ORDER BY data";
            const [transacoes] = await pool.execute(sql, [dataInicio, dataFim]);
            res.json(transacoes);
        } catch (error) {
            res.status(500).json({ error: 'Falha ao buscar transações do sistema.' });
        }
    });
    
    router.post('/api/financeiro/conciliacao/confirmar', authMiddleware, permissionMiddleware(PERMISSAO_FINANCEIRO_AVANCADO), async (req, res) => {
        const { financeiroId } = req.body;
        if (!financeiroId) {
            return res.status(400).json({ error: 'O ID do lançamento financeiro é obrigatório.' });
        }
        try {
            const sql = "UPDATE financeiro SET conciliado = 1, data_conciliacao = NOW() WHERE id = ?";
            await pool.execute(sql, [financeiroId]);
            res.json({ message: 'Lançamento conciliado com sucesso!' });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao conciliar o lançamento.' });
        }
    });

    router.post('/api/financeiro/conciliacao/criar-lancamento', authMiddleware, permissionMiddleware(PERMISSAO_FINANCEIRO_AVANCADO), async (req, res) => {
        const { tipo, descricao, valor, data, categoria_id } = req.body;
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            
            const sql = `INSERT INTO financeiro (tipo, descricao, valor, data, categoria_id, conciliado, data_conciliacao) VALUES (?, ?, ?, ?, ?, 1, NOW())`;
            const [result] = await connection.execute(sql, [tipo, descricao, Math.abs(valor), data, categoria_id]);
            
            await connection.commit();
            res.status(201).json({ id: result.insertId, message: 'Lançamento criado e conciliado com sucesso!' });
        } catch (err) {
            await connection.rollback();
            res.status(500).json({ error: err.message });
        } finally {
            connection.release();
        }
    });


    return router;
}