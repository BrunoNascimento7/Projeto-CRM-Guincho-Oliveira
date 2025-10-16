const express = require('express');
const router = express.Router();
const axios = require('axios'); 

// O módulo exporta uma função que recebe as dependências (pool, middlewares, etc.)
module.exports = function(pool, authMiddleware, permissionMiddleware, registrarLog, gerarProximoOsId, getNextOrcamentoUID) {

    // ROTA PARA BUSCAR A TABELA DE PREÇOS
    router.get('/orcamentos/precos', authMiddleware, async (req, res) => {
        try {
            const [precos] = await pool.execute('SELECT * FROM config_precos ORDER BY tipo_veiculo, tipo_servico');
            res.json(precos);
        } catch (error) {
            console.error("Erro ao buscar preços:", error.message);
            res.status(500).json({ error: 'Falha ao buscar tabela de preços.' });
        }
    });

    // ROTA PARA SALVAR UMA NOVA COTAÇÃO
    router.post('/orcamentos', authMiddleware, async (req, res) => {
        const { cliente_id, dados_cotacao, valor_total } = req.body;
        const criado_por_id = req.user.id;
        
        if (!dados_cotacao || !valor_total) {
            return res.status(400).json({ error: 'Dados da cotação e valor total são obrigatórios.' });
        }

        try {
            const uid = await getNextOrcamentoUID();
            const sql = 'INSERT INTO orcamentos (orcamento_uid, cliente_id, dados_cotacao, valor_total, criado_por_id, status) VALUES (?, ?, ?, ?, ?, ?)';
            const [result] = await pool.execute(sql, [uid, cliente_id, JSON.stringify(dados_cotacao), valor_total, criado_por_id, 'Pendente']);
            
            await registrarLog(req.user.id, req.user.nome, 'ORCAMENTO_CRIADO', `Orçamento ${uid} criado. Valor: ${valor_total}`);

            res.status(201).json({ id: result.insertId, uid: uid, message: 'Cotação salva com sucesso!' });
        } catch (error) {
            console.error("Erro ao salvar cotação:", error.message);
            res.status(500).json({ error: 'Falha ao salvar cotação.' });
        }
    });

    // ROTA PARA BUSCAR HISTÓRICO DE COTAÇÕES
    router.get('/orcamentos/historico', authMiddleware, async (req, res) => {
        try {
            const sql = `
                SELECT o.id, o.orcamento_uid, o.valor_total, o.status, c.nome as nome_cliente, o.criado_em
                FROM orcamentos o
                LEFT JOIN clientes c ON o.cliente_id = c.id
                ORDER BY o.criado_em DESC
                LIMIT 10
            `;
            const [historico] = await pool.execute(sql);
            res.json(historico);
        } catch(error) {
            console.error("Erro ao buscar histórico:", error.message);
            res.status(500).json({ error: 'Falha ao buscar histórico.' });
        }
    });

    // ROTA PARA CONVERTER COTAÇÃO EM ORDEM DE SERVIÇO
    router.post('/orcamentos/:id/converter-os', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional']), async (req, res) => {
        const { id: orcamentoId } = req.params;
        const { nome_cliente_avulso } = req.body;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [orcamentoRows] = await connection.execute('SELECT * FROM orcamentos WHERE id = ? FOR UPDATE', [orcamentoId]);
            if (orcamentoRows.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ error: 'Orçamento não encontrado.' });
            }
            
            const orcamento = orcamentoRows[0];
            if (orcamento.status === 'Convertido') {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ error: 'Este orçamento já foi convertido na OS #' + orcamento.os_gerada_id });
            }
        
            const { formData } = JSON.parse(orcamento.dados_cotacao);

            if (!formData) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ error: 'Dados da cotação estão corrompidos ou em formato inválido.' });
            }

            const novoOsId = await gerarProximoOsId(connection);
            
            let descricaoOS = `Serviço de Guincho - ${formData.tipoVeiculo || 'Veículo'}. Origem: ${formData.partida}. Destino: ${formData.chegada}.`;
            let clienteIdParaOS = orcamento.cliente_id;

            if (nome_cliente_avulso) {
                descricaoOS = `CLIENTE AVULSO: ${nome_cliente_avulso} | ${descricaoOS}`;
                clienteIdParaOS = null;
            }

            const sqlOS = `INSERT INTO ordens_servico (id, cliente_id, local_atendimento, descricao, data_criacao, valor, status, criado_por_usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            
            await connection.execute(sqlOS, [
                novoOsId,
                clienteIdParaOS,
                formData.partida,
                descricaoOS,
                new Date(),
                orcamento.valor_total,
                'Na Fila',
                req.user.id
            ]);
            
            await connection.execute(
                'UPDATE orcamentos SET status = "Convertido", os_gerada_id = ? WHERE id = ?',
                [novoOsId, orcamentoId]
            );
            
            await connection.commit();

            await registrarLog(req.user.id, req.user.nome, 'ORCAMENTO_CONVERTIDO_OS', `Orçamento ${orcamento.orcamento_uid} convertido na OS #${novoOsId}`);

            res.status(201).json({ osId: novoOsId, message: `Ordem de Serviço #${novoOsId} criada com sucesso!` });

        } catch (error) {
            await connection.rollback();
            console.error("Erro ao converter cotação em OS:", error.message);
            res.status(500).json({ error: 'Falha ao criar a Ordem de Serviço a partir da cotação.' });
        } finally {
            connection.release();
        }
    });

    // ROTA PARA BUSCAR UMA COTAÇÃO COMPLETA PELO ID
    router.get('/orcamentos/:id', authMiddleware, async (req, res) => {
        try {
            const { id } = req.params;
            const sql = `
                SELECT 
                    o.id, o.orcamento_uid, o.cliente_id, o.status, o.dados_cotacao, o.valor_total,
                    c.nome as nome_cliente, c.cpf_cnpj, c.telefone 
                FROM orcamentos o
                LEFT JOIN clientes c ON o.cliente_id = c.id
                WHERE o.id = ?
            `;
            const [rows] = await pool.execute(sql, [id]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Orçamento não encontrado.' });
            }
            res.json(rows[0]);

        } catch(error) {
            console.error("Erro ao buscar orçamento:", error.message);
            res.status(500).json({ error: 'Falha ao buscar detalhes do orçamento.' });
        }
    });

    // =================================================================================
    // ROTA DE CALCULAR ROTA MODIFICADA PARA USAR OPENCAGE
    // =================================================================================
    router.post('/rota/calcular', authMiddleware, async (req, res) => {
        const { partida, chegada } = req.body;

        if (!partida || !chegada) {
            return res.status(400).json({ error: 'Endereços de partida e chegada são obrigatórios.' });
        }

        try {
            // Suas chaves de API. Mova a chave da OpenCage para o .env assim que puder.
            const orsApiKey = process.env.ORS_API_KEY;
            const openCageApiKey = '2fc96a94f35f4a8b9efdcaa47c3bd790'; // Sua nova chave

            // --- ETAPA 1: Geocodificar os endereços com a API OpenCage (MUITO MAIS PRECISA) ---
            const geocodeUrl = `https://api.opencagedata.com/geocode/v1/json`;
            
            const [resPartida, resChegada] = await Promise.all([
                axios.get(geocodeUrl, { params: { key: openCageApiKey, q: partida, countrycode: 'br', language: 'pt' } }),
                axios.get(geocodeUrl, { params: { key: openCageApiKey, q: chegada, countrycode: 'br', language: 'pt' } })
            ]);

            // Valida se a OpenCage encontrou os endereços
            if (!resPartida.data.results.length || !resChegada.data.results.length) {
                return res.status(404).json({ error: 'Um ou ambos os endereços não puderam ser encontrados. Verifique a digitação.' });
            }

            // Extrai as coordenadas da resposta da OpenCage. O formato é [longitude, latitude]
            const partidaCoords = [resPartida.data.results[0].geometry.lng, resPartida.data.results[0].geometry.lat];
            const chegadaCoords = [resChegada.data.results[0].geometry.lng, resChegada.data.results[0].geometry.lat];

            // --- ETAPA 2: Calcular a rota usando as coordenadas precisas com a OpenRouteService ---
            const directionsUrl = `https://api.openrouteservice.org/v2/directions/driving-car`;
            const resRota = await axios.get(directionsUrl, {
                params: {
                    api_key: orsApiKey,
                    start: partidaCoords.join(','), // Formato: "longitude,latitude"
                    end: chegadaCoords.join(','),   // Formato: "longitude,latitude"
                }
            });

            // --- ETAPA 3: Enviar a resposta completa do ORS para o frontend ---
            res.json(resRota.data);

        } catch (error) {
            console.error("Erro no proxy da rota:", error.response ? error.response.data : error.message);
            res.status(500).json({ error: 'Falha ao se comunicar com o serviço de mapas.' });
        }
    });

    // ROTA PARA ATUALIZAR A TABELA DE PREÇOS (APENAS ADMINS)
    router.put('/orcamentos/precos', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const precosParaAtualizar = req.body;
        
        if (!Array.isArray(precosParaAtualizar)) {
            return res.status(400).json({ error: 'Formato de dados inválido.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const sql = 'UPDATE config_precos SET valor_fixo = ?, valor_km = ?, valor_adicional_noturno = ? WHERE id = ?';

            for (const preco of precosParaAtualizar) {
                await connection.execute(sql, [preco.valor_fixo, preco.valor_km, preco.valor_adicional_noturno, preco.id]);
            }

            await connection.commit();
            
            await registrarLog(req.user.id, req.user.nome, 'PRECOS_ATUALIZADOS', `O usuário atualizou a tabela de preços.`);

            res.json({ message: 'Tabela de preços atualizada com sucesso!' });

        } catch (error) {
            await connection.rollback();
            console.error("Erro ao atualizar preços:", error.message);
            res.status(500).json({ error: 'Falha ao atualizar a tabela de preços.' });
        } finally {
            connection.release();
        }
    });

    // ROTA PARA ATUALIZAR UMA ÚNICA REGRA DE PREÇO (APENAS ADMINS)
    router.put('/orcamentos/precos/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const { id } = req.params;
        const { valor_fixo, valor_km, valor_adicional_noturno } = req.body;

        try {
            const sql = 'UPDATE config_precos SET valor_fixo = ?, valor_km = ?, valor_adicional_noturno = ? WHERE id = ?';
            const [result] = await pool.execute(sql, [valor_fixo, valor_km, valor_adicional_noturno, id]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Regra de preço não encontrada.' });
            }
            
            await registrarLog(req.user.id, req.user.nome, 'PRECO_ATUALIZADO', `O usuário atualizou a regra de preço ID: ${id}.`);
            res.json({ message: 'Regra de preço atualizada com sucesso!' });

        } catch (error) {
            console.error("Erro ao atualizar regra de preço:", error.message);
            res.status(500).json({ error: 'Falha ao atualizar a regra de preço.' });
        }
    });

    // ROTA PARA DELETAR UMA COTAÇÃO (APENAS ADMINS)
    router.delete('/orcamentos/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const { id: orcamentoId } = req.params;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [orcamentoRows] = await connection.execute(
                'SELECT orcamento_uid, os_gerada_id FROM orcamentos WHERE id = ?',
                [orcamentoId]
            );

            if (orcamentoRows.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ error: 'Cotação não encontrada.' });
            }

            const orcamento = orcamentoRows[0];
            const osIdVinculada = orcamento.os_gerada_id;

            if (osIdVinculada) {
                await connection.execute('DELETE FROM notas_chamado WHERE os_id = ?', [osIdVinculada]);
                await connection.execute('DELETE FROM ordens_servico WHERE id = ?', [osIdVinculada]);
            }

            await connection.execute('DELETE FROM orcamentos WHERE id = ?', [orcamentoId]);

            await connection.commit(); 

            await registrarLog(
                req.user.id,
                req.user.nome,
                'ORCAMENTO_DELETADO',
                `O usuário deletou a cotação ${orcamento.orcamento_uid} (ID: ${orcamentoId})${osIdVinculada ? ` e a OS vinculada #${osIdVinculada}` : ''}.`
            );

            res.json({ message: 'Cotação e OS vinculada (se houver) deletadas com sucesso.' });

        } catch (error) {
            await connection.rollback();
            console.error("Erro ao deletar cotação e OS vinculada:", error.message);
            res.status(500).json({ error: 'Falha ao deletar cotação. A operação foi revertida.' });
        } finally {
            connection.release();
        }
    });

    // ROTA PARA ENVIAR COTAÇÃO POR SMS (SEGURA)
router.post('/orcamentos/:id/enviar-sms', authMiddleware, async (req, res) => {
    const { id: orcamentoId } = req.params;
    const { telefone } = req.body;

    if (!telefone) {
        return res.status(400).json({ error: 'O número de telefone é obrigatório.' });
    }

    try {
        const [orcamentoRows] = await pool.execute('SELECT orcamento_uid, valor_total FROM orcamentos WHERE id = ?', [orcamentoId]);
        if (orcamentoRows.length === 0) {
            return res.status(404).json({ error: 'Orçamento não encontrado.' });
        }
        const orcamento = orcamentoRows[0];
        const valorFormatado = parseFloat(orcamento.valor_total).toFixed(2).replace('.', ',');

        // IMPORTANTE: Configure esta variável no seu arquivo .env
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'; 
        const publicLink = `${frontendUrl}/cotacao/${orcamento.orcamento_uid}`;

        const cleanTelefone = telefone.replace(/\D/g, '');
        const comteleApiKey = process.env.COMTELE_API_KEY;
        
        if (!comteleApiKey) {
             console.error("ERRO GRAVE: A chave da API Comtele (COMTELE_API_KEY) não está configurada no seu arquivo .env");
             return res.status(500).json({ error: 'Serviço de SMS indisponível. Contate o suporte.' });
        }

        const mensagem = `GUINCHO OLIVEIRA: Olá! O orçamento solicitado no valor de R$${valorFormatado} está disponível para visualização no link: ${publicLink}`;
        
        const payload = {
            receivers: [`55${cleanTelefone}`],
            message: mensagem,
            route: 17
        };
        
        await axios.post('https://api.comtele.com.br/messages/sms/send', payload, {
            headers: {
                'x-api-key': comteleApiKey,
                'Content-Type': 'application/json'
            }
        });

        await registrarLog(req.user.id, req.user.nome, 'ORCAMENTO_ENVIADO_SMS', `Orçamento ${orcamento.orcamento_uid} enviado por SMS para ${cleanTelefone}`);

        res.json({ message: 'SMS enviado com sucesso!' });

    } catch (error) {
        console.error("Erro ao enviar SMS via Comtele:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Falha ao enviar o SMS.' });
    }
});

    return router;
}