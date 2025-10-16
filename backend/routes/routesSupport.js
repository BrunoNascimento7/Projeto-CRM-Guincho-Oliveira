const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer'); // Importar Multer aqui se não estiver no escopo global (assumindo que está, mas boa prática)

module.exports = (pool, io, authMiddleware, permissionMiddleware, PERMISSAO_SUPORTE, uploadSuporte, onlineUsers, getUser, PERMISSOES_ADMIN_SUPORTE ) => {


    /**
 * Gera o próximo ID sequencial para um Chamado baseado no mês e ano (Ex: CRM-MMYY-NNNN).
 * @param {mysql.PoolConnection} connection - A conexão de banco de dados a ser usada (para transações).
 * @returns {Promise<string>} O próximo ID de Chamado formatado.
 */
async function gerarProximoChamadoId(connection) {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    const prefixo = `CRM-${mm}${yy}`; // Ex: CRM-1025
    
    let proximoNumero = 1;
    
    const [lastChamado] = await connection.execute(
        // Busca o último ID que começa com o prefixo CRM-MMYY-
        'SELECT id FROM suporte_chamados WHERE id LIKE ? AND id NOT REGEXP \'^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$\' ORDER BY id DESC LIMIT 1',
        [`${prefixo}-%`]
    );

    if (lastChamado.length > 0) {
        // CORREÇÃO: Pega a parte numérica após o último hífen
        const parts = lastChamado[0].id.split('-');
        const lastNumberPart = parts[parts.length - 1]; // Deve ser o '0001'
        const lastNumber = parseInt(lastNumberPart); // Converte para 1
        
        // Verifica se é um número válido antes de somar
        if (!isNaN(lastNumber)) {
             proximoNumero = lastNumber + 1;
        }
    }
    
    // CORREÇÃO: Retorna o ID no formato completo CRM-MMYY-NNNN
    return `${prefixo}-${String(proximoNumero).padStart(4, '0')}`;
}

    
const toNull = (value) => (value === '' || value === undefined ? null : value);

    // ROTA PARA BUSCAR AGENTES DE SUPORTE
    router.get('/suporte/agentes', authMiddleware, permissionMiddleware(PERMISSAO_SUPORTE), async (req, res) => {
        try {
            const [agentes] = await pool.execute("SELECT id, nome FROM usuarios WHERE perfil IN ('admin_geral', 'admin')");
            res.json(agentes);
        } catch (error) {
            res.status(500).json({ error: 'Falha ao buscar agentes de suporte.' });
        }
    });

    // routesSupport.js - Rota GET /suporte/chamados
router.get('/suporte/chamados', authMiddleware, async (req, res) => {
    const { id: usuarioId } = req.user;
    try {
        const sql = `
            SELECT id, assunto, status, prioridade, criado_em, atualizado_em 
            FROM suporte_chamados 
            WHERE criado_por_id = ? 
            ORDER BY atualizado_em DESC
        `;
        const [chamados] = await pool.execute(sql, [usuarioId]);
        res.json(chamados);
    } catch (error) {
        console.error("Erro ao buscar chamados do usuário:", error.message);
        res.status(500).json({ error: 'Falha ao buscar seus chamados.' });
    }
});

// CORRIGIDA: Rota Crítica de Criação de Chamado
router.post('/suporte/chamados', authMiddleware, (req, res) => {
    // 1. Tratamento de Erro do Multer embutido na rota
    uploadSuporte.single('anexo')(req, res, async function (err) {
        if (err) {
            console.error("❌ ERRO DE UPLOAD/MULTER:", err.message);
            const statusCode = (err instanceof multer.MulterError) ? 400 : 500;
            return res.status(statusCode).json({ 
                error: err.message || 'Falha desconhecida durante o upload do arquivo.' 
            });
        }
        
        // 2. Desestruturação completa e tratamento de req.body/req.user
        const { assunto, mensagem, prioridade, logs_console, logs_rede, tipo, categoria_id, subcategoria_id, perfil_destino } = req.body;
        
        // Garante que id, nome e email sejam desestruturados
        const { id: criado_por_id, nome: criado_por_nome, email: criado_por_email } = req.user; 
        const cliente_id = req.user?.cliente_id || null;

        // Validação (Garante que haja texto OU anexo)
        if (!assunto || (!mensagem && !req.file)) {
            return res.status(400).json({ error: 'Assunto, e pelo menos uma descrição ou anexo, são obrigatórios.' });
        }

        const connection = await pool.getConnection();
        try {
            console.log("LOG: CONSEGUI CONECTAR NO DB, TENTANDO INICIAR TRANSAÇÃO.");
            await connection.beginTransaction();
            
            // CORREÇÃO: Gerando o novo ID no formato CRM-MMYY-NNNN
            const novoChamadoId = await gerarProximoChamadoId(connection);
            const prioridadeChamado = prioridade || 'Normal';
            
            // CORREÇÃO: Blindagem e inclusão das colunas NOT NULL + uso do toNull
            const sqlChamado = `
                INSERT INTO \`suporte_chamados\`
                (\`id\`, \`assunto\`, \`tipo\`, \`categoria_id\`, \`subcategoria_id\`, \`prioridade\`, \`criado_por_id\`, \`criado_por_nome\`, \`criado_por_email\`, \`cliente_id\`, \`logs_console\`, \`logs_rede\`, \`perfil_destino\`, \`status\`) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            await connection.execute(sqlChamado, [
    novoChamadoId, 
    toNull(assunto), 
    toNull(tipo || 'Incidente'), 
    toNull(categoria_id), 
    toNull(subcategoria_id), 
    toNull(prioridadeChamado), 
    toNull(criado_por_id), 
    toNull(criado_por_nome), 
    toNull(criado_por_email), 
    toNull(cliente_id), 
    toNull(logs_console), 
    toNull(logs_rede), 
    // CORREÇÃO AQUI: Se o perfil for uma string vazia, mantemos a string vazia ou usamos uma alternativa se o DB for restritivo.
    // Como a coluna perfil_destino é VARCHAR(255), ela deve aceitar string vazia.
    // No entanto, se queremos que seja o valor correto ('financeiro'), não podemos usar toNull.
    perfil_destino, // <--- REMOVA o toNull() daqui!
    'Aberto'
]);

            // CORREÇÃO: Lógica para a primeira mensagem (trata anexo e usa toNull)
            const anexo_url = req.file ? `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}` : null;
            const tipo_mensagem = req.file ? 'anexo' : 'comentario';
            const textoDaMensagem = mensagem || (req.file ? `Anexo enviado: ${req.file.originalname}` : ''); 
            
            const sqlMensagem = `
                INSERT INTO \`suporte_mensagens\` 
                (\`chamado_id\`, \`remetente_id\`, \`remetente_nome\`, \`remetente_tipo\`, \`texto\`, \`tipo_mensagem\`, \`anexo_url\`, \`anexo_nome\`, \`anexo_mimetype\`) 
                VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?)
            `;
            
            await connection.execute(sqlMensagem, [
                toNull(novoChamadoId), 
                toNull(criado_por_id), 
                toNull(criado_por_nome), 
                toNull(textoDaMensagem), 
                tipo_mensagem, 
                toNull(anexo_url), 
                toNull(req.file ? req.file.originalname : null), 
                toNull(req.file ? req.file.mimetype : null)
            ]);

            // --- LÓGICA DE SLA ---
            const [politicas] = await connection.execute('SELECT * FROM suporte_sla_politicas WHERE prioridade = ?', [prioridadeChamado]);
            if (politicas.length > 0) {
                const politica = politicas[0];
                const sqlUpdateSLA = `
                    UPDATE \`suporte_chamados\` SET 
                    \`sla_prazo_primeira_resposta\` = NOW() + INTERVAL ? MINUTE,
                    \`sla_prazo_resolucao\` = NOW() + INTERVAL ? MINUTE
                    WHERE \`id\` = ?
                `;
                await connection.execute(sqlUpdateSLA, [politica.tempo_primeira_resposta_minutos, politica.tempo_resolucao_minutos, novoChamadoId]);
            }
            // --- FIM DA LÓGICA DE SLA ---

            await connection.commit();
            res.status(201).json({ id: novoChamadoId, message: 'Seu pedido de ajuda foi enviado com sucesso!' });
        } catch (error) {
            await connection.rollback();
            console.error("Erro ao criar chamado:", error.message);
            res.status(500).json({ error: 'Falha ao criar o chamado.', details: error.message });
        } finally {
            connection.release();
        }
    });
});
    
    // ROTA PARA VER OS DETALHES DE UM CHAMADO (USUÁRIO OU ADMIN)
    router.get('/suporte/chamados/:id', authMiddleware, async (req, res) => {
    const { id: chamadoId } = req.params;
    const { id: userId, perfil } = req.user;
    try {
        // Blindagem no SELECT do chamado principal
        const [chamadoRows] = await pool.execute('SELECT * FROM \`suporte_chamados\` WHERE \`id\` = ?', [chamadoId]);
        
        if (chamadoRows.length === 0) return res.status(404).json({ error: 'Chamado não encontrado.' });
        const chamado = chamadoRows[0];
        
        // Verificação de Acesso (Permanece)
        if (chamado.criado_por_id !== userId && !['admin_geral', 'admin'].includes(perfil)) {
            return res.status(403).json({ error: 'Acesso negado.' });
        }
        
        // Blindagem no SELECT das mensagens (Substituindo SELECT *)
        const [mensagens] = await pool.execute('SELECT \`id\`, \`chamado_id\`, \`remetente_id\`, \`remetente_nome\`, \`remetente_tipo\`, \`tipo_mensagem\`, \`texto\`, \`anexo_url\`, \`anexo_nome\`, \`anexo_mimetype\`, \`criado_em\` FROM \`suporte_mensagens\` WHERE \`chamado_id\` = ? ORDER BY \`criado_em\` ASC', [chamadoId]);
        
        res.json({ ...chamado, mensagens });
        
    } catch (error) {
        console.error("Erro ao buscar detalhes do chamado:", error.message);
        res.status(500).json({ error: 'Falha ao buscar detalhes do chamado.' });
    }
});

router.post('/suporte/chamados/:id/mensagens', authMiddleware, uploadSuporte.single('anexo'), async (req, res) => {
    const { id: chamadoId } = req.params;
    const { texto } = req.body;
    const { id: remetente_id, nome: remetente_nome, perfil } = req.user;
    
    // Função auxiliar (deve estar definida no escopo superior)
    const toNull = (value) => (value === '' || value === undefined ? null : value);

    if (!texto && !req.file) return res.status(400).json({ error: 'É necessário enviar um texto ou um anexo.' });
    
    // 🔑 CORREÇÃO CRÍTICA: DEFINIÇÃO DOS PERFIS DE SUPORTE
    // Adicione AQUI todos os perfis que devem ser considerados como 'support' (e não 'user')
    const SUPPORT_PROFILES = ['admin_geral', 'admin', 'financeiro', 'operacional']; // <<-- ADICIONE SEUS PERFIS AQUI

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // --- LÓGICA DE CHAMADO ---
        const [[chamado]] = await connection.execute('SELECT \`status\`, \`criado_por_id\`, \`data_primeira_resposta\` FROM \`suporte_chamados\` WHERE \`id\` = ?', [chamadoId]);
        if (!chamado) throw new Error('Chamado não encontrado.');
        if (['Resolvido', 'Fechado'].includes(chamado.status)) throw new Error('Este chamado está finalizado.');
        
        // CORREÇÃO: Uso da lista de perfis de suporte
        const remetente_tipo = SUPPORT_PROFILES.includes(perfil) ? 'support' : 'user';
        
        // --- LÓGICA DE SLA E STATUS ---
        if (remetente_tipo === 'support' && chamado.data_primeira_resposta === null) {
            await connection.execute('UPDATE \`suporte_chamados\` SET \`data_primeira_resposta\` = NOW() WHERE \`id\` = ?', [chamadoId]);
        }
        
        // Se o Agente (support) respondeu, aguardamos o Cliente (user). Vice-versa.
        const proximoStatus = remetente_tipo === 'user' ? 'Aguardando Suporte' : 'Aguardando Cliente'; 
        
        // --- LÓGICA DE MENSAGEM (RESTANTE DO CÓDIGO) ---
        const anexo_url = req.file ? `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}` : null;
        const textoDaMensagem = texto || `Anexo enviado: ${req.file.originalname}`;
        
        const sqlInsert = `
            INSERT INTO \`suporte_mensagens\` (\`chamado_id\`, \`remetente_id\`, \`remetente_nome\`, \`remetente_tipo\`, \`tipo_mensagem\`, \`texto\`, \`anexo_url\`, \`anexo_nome\`, \`anexo_mimetype\`) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await connection.execute(sqlInsert, [
            toNull(chamadoId), 
            toNull(remetente_id), 
            toNull(remetente_nome), 
            remetente_tipo, 
            req.file ? 'anexo' : 'comentario', 
            toNull(textoDaMensagem), 
            toNull(anexo_url), 
            toNull(req.file ? req.file.originalname : null), 
            toNull(req.file ? req.file.mimetype : null)
        ]);
        
        await connection.execute('UPDATE \`suporte_chamados\` SET \`status\` = ?, \`atualizado_em\` = NOW() WHERE \`id\` = ?', [proximoStatus, chamadoId]);
        
        const [[novaMensagem]] = await connection.execute('SELECT * FROM \`suporte_mensagens\` WHERE \`id\` = ?', [result.insertId]);
        await connection.commit();
        
        // --- EMISSÃO DE SOCKET.IO ---
        if (io) {
            io.to(chamadoId).emit('new_support_message', novaMensagem);
        }

        // Lógica de Notificação (Notifica quem NÃO está na sala)
        if (remetente_tipo === 'user') {
            // Se o Cliente (user) responde, notifica todos os agentes/admins
            const admins = onlineUsers.filter(u => SUPPORT_PROFILES.includes(u.perfil)); // <<-- Uso da lista de perfis
            admins.forEach(admin => admin.socketIds.forEach(socketId => io.to(socketId).emit('support_notification', { chamadoId })));
        } else {
            // Se o Agente (support) responde, notifica apenas o criador (cliente)
            const criadorDoChamado = getUser(chamado.criado_por_id);
            if (criadorDoChamado) criadorDoChamado.socketIds.forEach(socketId => io.to(socketId).emit('support_notification', { chamadoId }));
        }
        
        res.status(201).json(novaMensagem);
    } catch (error) {
        await connection.rollback();
        console.error("Erro ao adicionar mensagem:", error.message);
        res.status(500).json({ error: error.message || 'Falha ao adicionar a mensagem.' });
    } finally {
        connection.release();
    }
});

    // ROTA ADMIN: BUSCAR ESTATÍSTICAS
    router.get('/admin/suporte/chamados/stats', authMiddleware, permissionMiddleware(PERMISSAO_SUPORTE), async (req, res) => {
    try {
        const { perfil: userProfile } = req.user;
        const isAdmin = ['admin_geral', 'admin'].includes(userProfile);

        let sql = `SELECT status, COUNT(id) as count FROM suporte_chamados`;
        const params = [];

        // Se o usuário não for admin, adiciona o filtro de perfil_destino
        if (!isAdmin) {
            sql += ' WHERE perfil_destino = ?';
            params.push(userProfile);
        }

        sql += ' GROUP BY status';
        
        const [rows] = await pool.execute(sql, params);
        
        // Inicializa o objeto de estatísticas com todos os status zerados
        const stats = {
            'Aberto': 0,
            'Aguardando Suporte': 0,
            'Aguardando Cliente': 0,
            'Resolvido': 0,
            'Fechado': 0
        };
        // Preenche com os valores do banco
        rows.forEach(row => {
            if (stats.hasOwnProperty(row.status)) {
                stats[row.status] = row.count;
            }
        });

        res.json(stats);
    } catch (error) {
        console.error("Erro ao buscar estatísticas:", error.message);
        res.status(500).json({ error: 'Falha ao buscar estatísticas.' });
    }
    });

// ROTA FINALMENTE CORRIGIDA: Listagem de Chamados para Admin/Agente
router.get('/admin/suporte/chamados', authMiddleware, permissionMiddleware(PERMISSAO_SUPORTE), async (req, res) => {
    try {
        const { status } = req.query;
        const { perfil: userProfile } = req.user; 

        let sql = `
            SELECT 
                sc.\`id\`, sc.\`assunto\`, sc.\`status\`, sc.\`prioridade\`, sc.\`atualizado_em\`, 
                sc.\`criado_por_nome\`, sc.\`tipo\`, cs.\`nome_empresa\`, cat.\`nome\` AS \`categoria_nome\`,
                subcat.\`nome\` AS \`subcategoria_nome\`, sc.\`sla_prazo_resolucao\`, sc.\`data_resolucao\`,
                sc.\`criado_em\`, sc.\`perfil_destino\`
            FROM \`suporte_chamados\` sc 
            LEFT JOIN \`clientes_sistema\` cs ON sc.\`cliente_id\` = cs.\`id\`
            LEFT JOIN \`suporte_categorias\` cat ON sc.\`categoria_id\` = cat.\`id\`
            LEFT JOIN \`suporte_subcategorias\` subcat ON sc.\`subcategoria_id\` = subcat.\`id\`
        `;
        
        const params = [];
        const whereClauses = [];

        const isAdmin = ['admin_geral', 'admin'].includes(userProfile);
        
        // Se o usuário NÃO é um super admin, aplica-se o filtro por perfil_destino
        if (!isAdmin) {
            // CORREÇÃO ESSENCIAL: Compara o perfil destino (em minúsculas) com o perfil do usuário (em minúsculas)
            const profileToMatch = userProfile.toLowerCase();

            console.log(`[DEBUG FILTRO] Usuário logado: ${req.user.nome} | Perfil do Usuário (Busca): ${profileToMatch}`);

            whereClauses.push('LOWER(sc.\`perfil_destino\`) = ?');
            params.push(profileToMatch);
        }

        if (status) {
            whereClauses.push('sc.\`status\` = ?');
            params.push(status);
        }

        if (whereClauses.length > 0) {
            sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        
        sql += ` ORDER BY sc.\`atualizado_em\` DESC`;
        
        const [chamados] = await pool.execute(sql, params);
        res.json(chamados);
    } catch (error) {
        console.error("Erro ao buscar chamados de admin:", error.message);
        res.status(500).json({ error: 'Falha ao buscar os chamados.' });
    }
});

// ALTERADO: Rota ADMIN para buscar detalhes de um chamado (com filtro de perfil)
router.get('/admin/suporte/chamados/:id', authMiddleware, permissionMiddleware(PERMISSAO_SUPORTE), async (req, res) => {
    const { id: chamadoId } = req.params;
    const { perfil: userProfile, id: userId } = req.user; // Pega o perfil e ID do usuário logado

    try {
        const sql = `
            SELECT 
                sc.*, u.\`email\` as \`solicitante_email\`, u.\`perfil\` as \`solicitante_perfil\`, 
                cs.\`nome_empresa\`, cat.\`nome\` AS \`categoria_nome\`, subcat.\`nome\` AS \`subcategoria_nome\`,
                sa.\`nota\` AS \`avaliacao_nota\`, sa.\`comentario\` AS \`avaliacao_comentario\`
            FROM \`suporte_chamados\` sc 
            JOIN \`usuarios\` u ON sc.\`criado_por_id\` = u.\`id\` 
            LEFT JOIN \`clientes_sistema\` cs ON sc.\`cliente_id\` = cs.\`id\`
            LEFT JOIN \`suporte_categorias\` cat ON sc.\`categoria_id\` = cat.\`id\`
            LEFT JOIN \`suporte_subcategorias\` subcat ON sc.\`subcategoria_id\` = subcat.\`id\`
            LEFT JOIN \`suporte_avaliacoes\` sa ON sc.\`id\` = sa.\`chamado_id\`
            WHERE sc.\`id\` = ?
        `;
        const [chamadoRows] = await pool.execute(sql, [chamadoId]);
        if (chamadoRows.length === 0) return res.status(404).json({ error: 'Chamado não encontrado.' });
        
        const chamado = chamadoRows[0];
        
        // NOVO: Verificação de permissão: Admin Geral/Admin ou perfil_destino corresponde
        const isAdmin = ['admin_geral', 'admin'].includes(userProfile);
        const hasAccess = isAdmin || (chamado.perfil_destino && chamado.perfil_destino.toLowerCase() === userProfile.toLowerCase());

        if (!hasAccess) {
             // MENSAGEM DE ERRO DO FRONTEND!
            return res.status(403).json({ error: 'Acesso negado. Você não tem permissão para ver este chamado.' });
        }
        
        // Blindagem no SELECT das mensagens (Substituindo SELECT * por listagem explícita)
        const [mensagens] = await pool.execute('SELECT \`id\`, \`chamado_id\`, \`remetente_id\`, \`remetente_nome\`, \`remetente_tipo\`, \`tipo_mensagem\`, \`texto\`, \`anexo_url\`, \`anexo_nome\`, \`anexo_mimetype\`, \`criado_em\` FROM \`suporte_mensagens\` WHERE \`chamado_id\` = ? ORDER BY \`criado_em\` ASC', [chamadoId]);
        
        res.json({ ...chamado, mensagens });
    } catch (error) {
        console.error("Erro ao buscar detalhes do chamado:", error.message);
        // O erro do DB é retornado como 500, que o frontend interpreta como acesso negado.
        res.status(500).json({ error: 'Falha interna ao buscar detalhes do chamado.' });
    }
});

    // ROTA PARA O FORMULÁRIO DE NOVO CHAMADO BUSCAR AS CATEGORIAS ATIVAS
    // ROTA PARA O FORMULÁRIO DE NOVO CHAMADO BUSCAR AS CATEGORIAS ATIVAS
router.get('/suporte/categorias-ativas', authMiddleware, async (req, res) => {
    try {
        // CORREÇÃO: Blindagem de todos os nomes de colunas com aspas invertidas (`...`)
        const [categorias] = await pool.execute(`
            SELECT 
                \`id\`, 
                \`nome\`, 
                \`tipo_padrao\`, 
                \`prioridade_padrao\`, 
                \`perfil_destino_padrao\` 
            FROM \`suporte_categorias\` 
            WHERE \`ativo\` = TRUE ORDER BY \`nome\` ASC
        `);
        
        // Blindagem também na tabela de subcategorias, por segurança
        const [subcategorias] = await pool.execute('SELECT \`id\`, \`nome\`, \`categoria_id\` FROM \`suporte_subcategorias\` WHERE \`ativo\` = TRUE ORDER BY \`nome\` ASC');

        const resultadoFinal = categorias.map(cat => ({
            ...cat,
            subcategorias: subcategorias.filter(sub => sub.categoria_id === cat.id)
        }));
        
        res.json(resultadoFinal);
    } catch (error) {
        console.error("Erro ao buscar categorias ativas:", error.message);
        res.status(500).json({ error: 'Falha ao carregar dados do formulário.' });
    }
});

    // ROTA ADMIN: ATUALIZAR DETALHES DE UM CHAMADO
    router.put('/admin/suporte/chamados/:id/details', authMiddleware, permissionMiddleware(PERMISSAO_SUPORTE), async (req, res) => {
    const { id: chamadoId } = req.params;
    const { status, prioridade, atribuido_a_id } = req.body;
    const { nome: adminNome, id: adminId } = req.user;
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [chamadoRows] = await connection.execute('SELECT * FROM suporte_chamados WHERE id = ?', [chamadoId]);
        if (chamadoRows.length === 0) throw new Error('Chamado não encontrado.');
        
        const chamadoAtual = chamadoRows[0];
        const updates = [];
        const params = [];
        let eventos = [];
        
        if (status && status !== chamadoAtual.status) {
            updates.push('status = ?'); params.push(status);
            eventos.push(`Status alterado de "${chamadoAtual.status}" para "${status}" por ${adminNome}.`);

            if (status === 'Resolvido' && chamadoAtual.data_resolucao === null) {
                updates.push('data_resolucao = NOW()');

                // --- INÍCIO DA NOVA LÓGICA DE CSAT ---
                // Gera um token seguro para a avaliação
                const avaliacaoToken = crypto.randomBytes(20).toString('hex');
                updates.push('avaliacao_token = ?');
                params.push(avaliacaoToken);
                
                // TODO: Implementar o envio de e-mail aqui!
                // Esta é a parte onde você usaria um serviço como Nodemailer para enviar
                // um e-mail para `chamadoAtual.criado_por_email` com um link.
                const linkDeAvaliacao = `https://seusistema.com.br/avaliar-chamado/${avaliacaoToken}`;
                console.log(`(Simulação de E-mail) Link de Avaliação: ${linkDeAvaliacao}`);
                eventos.push(`Pesquisa de satisfação enviada para ${chamadoAtual.criado_por_nome}.`);
                // --- FIM DA NOVA LÓGICA DE CSAT ---
            }
        }
        
        if (prioridade && prioridade !== chamadoAtual.prioridade) {
            updates.push('prioridade = ?'); params.push(prioridade);
            eventos.push(`Prioridade alterada para "${prioridade}" por ${adminNome}.`);
        }
        if (atribuido_a_id && atribuido_a_id !== chamadoAtual.atribuido_a_id) {
            updates.push('atribuido_a_id = ?'); params.push(atribuido_a_id);
            const [[agente]] = await connection.execute('SELECT nome FROM usuarios WHERE id = ?', [atribuido_a_id]);
            eventos.push(`Chamado atribuído a "${agente.nome}" por ${adminNome}.`);
        }
        
        if (updates.length > 0) {
            const sqlUpdate = `UPDATE suporte_chamados SET ${updates.join(', ')}, atualizado_em = NOW() WHERE id = ?`;
            params.push(chamadoId);
            await connection.execute(sqlUpdate, params);
            
            for (const evento of eventos) {
                await connection.execute(`INSERT INTO suporte_mensagens (chamado_id, remetente_id, remetente_nome, remetente_tipo, tipo_mensagem, texto) VALUES (?, ?, ?, 'system', 'evento_status', ?)`, [chamadoId, adminId, 'Sistema', evento]);
            }
        }
        
        await connection.commit();
        if (status && status !== chamadoAtual.status) {
            io.to(chamadoId).emit('support_ticket_status_changed', { chamadoId, newStatus: status });
        }
        res.json({ message: 'Chamado atualizado com sucesso.' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message || 'Falha ao atualizar chamado.' });
    } finally {
        connection.release();
    }
});

// ROTA PARA BUSCAR PERFIS DE SUPORTE DISPONÍVEIS
router.get('/suporte/perfis-suporte', authMiddleware, async (req, res) => {
    try {
        // Exemplo: Pega todos os perfis, exceto 'cliente' ou perfis comuns.
        // Ajuste a cláusula WHERE conforme sua necessidade.
        const [perfis] = await pool.execute(
            "SELECT DISTINCT perfil FROM usuarios WHERE perfil NOT IN ('cliente', 'user')"
        );
        res.json(perfis.map(p => p.perfil));
    } catch (error) {
        res.status(500).json({ error: 'Falha ao buscar perfis de suporte.' });
    }
});

// ROTA PÚBLICA PARA VERIFICAR UM TOKEN DE AVALIAÇÃO E BUSCAR DADOS DO CHAMADO
router.get('/suporte/avaliacao/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const sql = `SELECT id, assunto, criado_por_nome FROM suporte_chamados WHERE avaliacao_token = ? AND data_avaliacao IS NULL`;
        const [chamados] = await pool.execute(sql, [token]);

        if (chamados.length === 0) {
            return res.status(404).json({ error: 'Pesquisa não encontrada ou já respondida.' });
        }
        res.json(chamados[0]);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao verificar a pesquisa de satisfação.' });
    }
});

// ROTA PÚBLICA PARA ENVIAR UMA AVALIAÇÃO
router.post('/suporte/avaliacao/:token', async (req, res) => {
    const { token } = req.params;
    const { nota, comentario } = req.body;

    if (!nota || nota < 1 || nota > 5) {
        return res.status(400).json({ error: 'A nota é obrigatória e deve ser entre 1 e 5.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const sqlChamado = `SELECT id, criado_por_id FROM suporte_chamados WHERE avaliacao_token = ? AND data_avaliacao IS NULL`;
        const [chamados] = await connection.execute(sqlChamado, [token]);

        if (chamados.length === 0) {
            throw new Error('Pesquisa não encontrada ou já respondida.');
        }
        const chamado = chamados[0];

        // Insere a avaliação na nova tabela
        const sqlInsert = `INSERT INTO suporte_avaliacoes (chamado_id, usuario_id, nota, comentario) VALUES (?, ?, ?, ?)`;
        await connection.execute(sqlInsert, [chamado.id, chamado.criado_por_id, nota, comentario]);

        // Marca o chamado como avaliado e remove o token
        const sqlUpdate = `UPDATE suporte_chamados SET data_avaliacao = NOW(), avaliacao_token = NULL WHERE id = ?`;
        await connection.execute(sqlUpdate, [chamado.id]);

        await connection.commit();
        res.status(201).json({ message: 'Obrigado pelo seu feedback!' });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message || 'Erro ao processar sua avaliação.' });
    } finally {
        connection.release();
    }
});

    return router;
};