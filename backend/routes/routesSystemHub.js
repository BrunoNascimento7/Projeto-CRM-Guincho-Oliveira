const express = require('express');
const router = express.Router();

// Este módulo exporta uma função que recebe as dependências e retorna o router
module.exports = (dependencies) => {
    // Desestruturando as dependências para facilitar o uso
    const { 
        pool, 
        authMiddleware, 
        adminGeralMiddleware,  
        permissionMiddleware, 
        registrarLog, 
        uploadCustomize, 
        uploadLogo,
        uploadUpdate, 
        io, 
        getUser 
    } = dependencies;

    // ====================================================================================
    // --- ROTAS DE CLIENTES DO SISTEMA ---
    // ====================================================================================

    // Rota para listar todos os clientes do sistema
    router.get('/clientes', authMiddleware, adminGeralMiddleware, async (req, res) => {
    try {
        // A query agora usa um subselect para contar licenças reais em uso
        const sql = `
            SELECT 
                cs.*, 
                (SELECT COUNT(id) FROM licenca_chaves WHERE cliente_id = cs.id AND usuario_id_alocado IS NOT NULL) as licencas_em_uso
            FROM clientes_sistema cs
            GROUP BY cs.id
            ORDER BY cs.nome_empresa;
        `;
        const [clientes] = await pool.execute(sql);
        res.json(clientes);
    } catch (error) {
        console.error("Erro ao buscar clientes do sistema:", error.message);
        res.status(500).json({ error: 'Falha ao buscar clientes.' });
    }
});

    // Rota para criar um novo cliente no sistema
    router.post('/clientes', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { nome_empresa, max_licencas } = req.body;
        try {
            const [result] = await pool.execute(
                'INSERT INTO clientes_sistema (nome_empresa, max_licencas) VALUES (?, ?)',
                [nome_empresa, max_licencas || 5]
            );
            res.status(201).json({ id: result.insertId, message: 'Cliente criado com sucesso!' });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Já existe um cliente com este nome.' });
            }
            res.status(500).json({ error: 'Falha ao criar novo cliente.' });
        }
    });

    // Rota para ATUALIZAR um cliente (licenças, status, slug, etc) - VERSÃO ATUALIZADA
router.put('/clientes/:id', authMiddleware, adminGeralMiddleware, async (req, res) => {
    const { id: clienteId } = req.params;
    const clientData = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Validação extra: Verifica se o slug já não está em uso por outro cliente
        if (clientData.slug) {
            const [existingSlug] = await connection.execute(
                'SELECT id FROM clientes_sistema WHERE slug = ? AND id != ?',
                [clientData.slug, clienteId]
            );
            if (existingSlug.length > 0) {
                await connection.rollback();
                connection.release();
                return res.status(409).json({ error: 'Este "Identificador de URL (slug)" já está em uso.' });
            }
        }

        const [[clienteAtual]] = await connection.execute('SELECT * FROM clientes_sistema WHERE id = ?', [clienteId]);
        
        const camposParaAtualizar = {};
        if (clientData.nome_empresa) camposParaAtualizar.nome_empresa = clientData.nome_empresa;
        if (clientData.slug) camposParaAtualizar.slug = clientData.slug; // <-- ADICIONADO
        if (clientData.max_licencas !== undefined) camposParaAtualizar.max_licencas = clientData.max_licencas;
        if (clientData.status) camposParaAtualizar.status = clientData.status;
        
        const setClauses = Object.keys(camposParaAtualizar).map(key => `${key} = ?`).join(', ');
        const values = Object.values(camposParaAtualizar);

        if (setClauses) {
            await connection.execute(`UPDATE clientes_sistema SET ${setClauses} WHERE id = ?`, [...values, clienteId]);
        }

        // ... (resto da lógica de sincronização de licenças continua igual) ...
        const novoMaxLicencas = clientData.max_licencas !== undefined ? clientData.max_licencas : clienteAtual.max_licencas;
        const [[{ total_chaves }]] = await connection.execute('SELECT COUNT(id) as total_chaves FROM licenca_chaves WHERE cliente_id = ?', [clienteId]);
        if (novoMaxLicencas > total_chaves) {
            const chavesParaCriar = novoMaxLicencas - total_chaves;
            for (let i = 0; i < chavesParaCriar; i++) {
                const novaChave = `LIC-${clienteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
                await connection.execute('INSERT INTO licenca_chaves (cliente_id, chave_licenca) VALUES (?, ?)', [clienteId, novaChave]);
            }
        } else if (novoMaxLicencas < total_chaves) {
            const [[{ used_licenses }]] = await connection.execute('SELECT COUNT(id) as used_licenses FROM licenca_chaves WHERE cliente_id = ? AND usuario_id_alocado IS NOT NULL', [clienteId]);
            if (novoMaxLicencas < used_licenses) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ error: `Não é possível reduzir para ${novoMaxLicencas} licenças, pois existem ${used_licenses} em uso. Desaloque usuários primeiro.` });
            }
            const chavesParaRemover = total_chaves - novoMaxLicencas;
            if (parseInt(chavesParaRemover, 10) > 0) {
                await connection.execute(`DELETE FROM licenca_chaves WHERE cliente_id = ? AND usuario_id_alocado IS NULL LIMIT ${parseInt(chavesParaRemover, 10)}`,[clienteId]);
            }
        }

        await connection.commit();
        await registrarLog(req.user.id, req.user.nome, 'CLIENTE_SISTEMA_ATUALIZADO', `Cliente ID ${clienteId} atualizado.`);
        res.json({ message: 'Cliente atualizado e licenças sincronizadas com sucesso!' });
    } catch (error) {
        await connection.rollback();
        console.error("Erro ao atualizar o cliente:", error);
        res.status(500).json({ error: error.message || 'Falha ao atualizar o cliente.' });
    } finally {
        connection.release();
    }
});

    // Rota para forçar o logout de todos os usuários de um cliente
router.post('/clientes/:id/force-logout-all', authMiddleware, adminGeralMiddleware, async (req, res) => {
    const { id: clienteId } = req.params;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Encontrar todos os IDs de usuários do cliente
        const [users] = await connection.execute(
            "SELECT id FROM usuarios WHERE cliente_id = ? AND perfil != 'admin_geral'",
            [clienteId]
        );

        if (users.length === 0) {
            await connection.commit();
            return res.json({ message: 'Cliente não possui usuários para desconectar.' });
        }

        const userIds = users.map(u => u.id);
        const placeholders = userIds.map(() => '?').join(',');

        // 2. Atualizar o campo 'last_logout_at' para invalidar os tokens
        const [result] = await connection.execute(
            `UPDATE usuarios SET last_logout_at = UTC_TIMESTAMP() WHERE id IN (${placeholders})`,
            userIds
        );

        await connection.commit();
        
        await registrarLog(req.user.id, req.user.nome, 'LOGOFF_FORCADO_CLIENTE', `Logoff forçado para todos os ${result.affectedRows} usuários do cliente ID ${clienteId}.`);
        
        res.json({ message: `${result.affectedRows} usuários foram desconectados com sucesso.` });

    } catch (error) {
        await connection.rollback();
        console.error("Erro ao forçar logoff de cliente:", error);
        res.status(500).json({ error: 'Falha ao forçar o logoff dos usuários.' });
    } finally {
        connection.release();
    }
});

    // Rota para fazer upload apenas do logo
    router.post('/clientes/:id/logo', authMiddleware, adminGeralMiddleware, uploadLogo.single('logo'), async (req, res) => {
        const { id: clienteId } = req.params;
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }
        try {
            const logoUrl = `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}`;
            await pool.execute('UPDATE clientes_sistema SET logo_url = ? WHERE id = ?', [logoUrl, clienteId]);
            res.json({ message: 'Logo atualizado com sucesso!', logoUrl });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao salvar o logo.' });
        }
    });

    // Rota para buscar as estatísticas do dashboard do sistema 
    router.get('/api/system-hub/dashboard-stats', authMiddleware, adminGeralMiddleware, async (req, res) => { 
        try { 
            const connection = await pool.getConnection(); 
    
            // 1. Contagem total de clientes e por status 
            const [clientStatusRows] = await connection.execute( 
                'SELECT status, COUNT(*) as count FROM clientes_sistema GROUP BY status' 
            ); 
            let totalClients = 0; 
            let activeClients = 0; 
            clientStatusRows.forEach(row => { 
                totalClients += row.count; 
                if (row.status === 'ativo') { 
                    activeClients = row.count; 
                } 
            }); 
    
            // 2. Contagem total de usuários 
            const [[{ totalUsers }]] = await connection.execute( 
                'SELECT COUNT(id) as totalUsers FROM usuarios' 
            ); 
    
            // 3. Crescimento de clientes nos últimos 12 meses 
            const [clientGrowthRows] = await connection.execute(` 
                SELECT DATE_FORMAT(data_criacao, '%Y-%m') as mes, COUNT(id) as novos_clientes 
                FROM clientes_sistema 
                WHERE data_criacao >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) 
                GROUP BY mes 
                ORDER BY mes ASC; 
            `); 
            
            // 4. Cálculo da taxa de crescimento do último mês 
            const [lastMonthGrowth] = await connection.execute(` 
                SELECT COUNT(id) as count FROM clientes_sistema WHERE MONTH(data_criacao) = MONTH(CURDATE() - INTERVAL 1 MONTH) AND YEAR(data_criacao) = YEAR(CURDATE() - INTERVAL 1 MONTH) 
            `); 
            const [thisMonthGrowth] = await connection.execute(` 
                SELECT COUNT(id) as count FROM clientes_sistema WHERE MONTH(data_criacao) = MONTH(CURDATE()) AND YEAR(data_criacao) = YEAR(CURDATE()) 
            `); 
            
            let monthlyGrowthRate = '0%'; 
            const lastMonthCount = lastMonthGrowth[0].count; 
            const thisMonthCount = thisMonthGrowth[0].count; 
            if (lastMonthCount > 0) { 
                const rate = ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100; 
                monthlyGrowthRate = `${rate.toFixed(1)}%`; 
            } else if (thisMonthCount > 0) { 
                monthlyGrowthRate = 'N/A'; 
            } 
    
            connection.release(); 
    
            res.json({ 
                totalClients, 
                activeClients, 
                totalUsers, 
                clientGrowth: clientGrowthRows, 
                monthlyGrowthRate 
            }); 
    
        } catch (error) { 
            console.error("Erro ao buscar estatísticas do dashboard:", error); 
            res.status(500).json({ error: 'Falha ao buscar estatísticas.' }); 
        } 
    }); 

   // Rota para personalização completa (imagens e textos) - VERSÃO BLINDADA E FINAL
router.post('/clientes/:id/customize', authMiddleware, adminGeralMiddleware, 
    uploadCustomize.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'loginImage', maxCount: 1 },
        { name: 'dashboardSlideshow', maxCount: 10 }
    ]), 
    async (req, res) => {
        const { id: clienteId } = req.params;
        const { sidebarLabel, dashboardTitle, dashboardText } = req.body;
        const connection = await pool.getConnection();

        // Helper function para fazer o parse do JSON de forma segura
        const safeJsonParse = (jsonString) => {
            if (!jsonString) return {}; // Retorna objeto vazio se a string for nula ou vazia
            try {
                return JSON.parse(jsonString); // Tenta fazer o parse
            } catch (e) {
                return {}; // Se falhar, retorna um objeto vazio em vez de quebrar
            }
        };

        try {
            await connection.beginTransaction();
            
            const [rows] = await connection.execute('SELECT sidebar_config, dashboard_config, login_config FROM clientes_sistema WHERE id = ?', [clienteId]);

            if (rows.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ error: 'Cliente não encontrado para personalização.' });
            }
            const cliente = rows[0];

            // <<<--- CORREÇÃO APLICADA AQUI, USANDO A FUNÇÃO SEGURA ---<<<
            const sidebar_config = safeJsonParse(cliente.sidebar_config);
            const dashboard_config = safeJsonParse(cliente.dashboard_config);
            const login_config = safeJsonParse(cliente.login_config);
            // --- FIM DA CORREÇÃO ---

            if (sidebarLabel) sidebar_config.label = sidebarLabel;
            if (dashboardTitle) dashboard_config.title = dashboardTitle;
            if (dashboardText) dashboard_config.text = dashboardText;
            
            if (req.files) {
                if (req.files.logo) {
                    const logoUrl = `${req.protocol}://${req.get('host')}/${req.files.logo[0].path.replace(/\\/g, "/")}`;
                    sidebar_config.logo_url = logoUrl;
                    login_config.logo_url = logoUrl;
                }
                if (req.files.loginImage) {
                    login_config.background_url = `${req.protocol}://${req.get('host')}/${req.files.loginImage[0].path.replace(/\\/g, "/")}`;
                }
                if (req.files.dashboardSlideshow) {
                    dashboard_config.slideshow_urls = req.files.dashboardSlideshow.map(file => 
                        `${req.protocol}://${req.get('host')}/${file.path.replace(/\\/g, "/")}`
                    );
                }
            }

            await connection.execute(
                `UPDATE clientes_sistema SET sidebar_config = ?, dashboard_config = ?, login_config = ? WHERE id = ?`,
                [JSON.stringify(sidebar_config), JSON.stringify(dashboard_config), JSON.stringify(login_config), clienteId]
            );

            await connection.commit();
            res.json({ message: 'Personalização salva com sucesso!' });
        } catch (error) {
            await connection.rollback();
            console.error("Erro ao salvar personalização:", error);
            res.status(500).json({ error: 'Falha ao salvar personalização.' });
        } finally {
            if (connection) connection.release();
        }
    }
);

// ROTA PÚBLICA PARA BUSCAR CUSTOMIZAÇÃO PARA A TELA DE LOGIN
// :slug é um identificador de texto único para cada cliente, ex: "guincho-oliveira"
router.get('/public/customize/:slug', async (req, res) => {
    const { slug } = req.params;
    try {
        const [[cliente]] = await pool.execute(
            'SELECT id, login_config, nome_empresa FROM clientes_sistema WHERE slug = ? AND status = "ativo"',
            [slug]
        );

        // --- INÍCIO DA LÓGICA DE MANUTENÇÃO ---
        let maintenanceInfo = { isActive: false, endDate: null };

        // Só verificamos a manutenção se um cliente válido foi encontrado pelo slug
        if (cliente) {
            // Busca por uma manutenção "em andamento" para ESTE cliente específico OU uma manutenção GLOBAL (cliente_id IS NULL)
            const [[activeMaintenance]] = await pool.execute(
                `SELECT data_fim FROM manutencoes_agendadas 
                 WHERE status = 'em_andamento' 
                 AND (cliente_id = ? OR cliente_id IS NULL)
                 ORDER BY cliente_id DESC -- Prioriza a específica sobre a global se houver sobreposição
                 LIMIT 1`,
                [cliente.id]
            );

            if (activeMaintenance) {
                maintenanceInfo.isActive = true;
                maintenanceInfo.endDate = activeMaintenance.data_fim;
            }
        }
        // --- FIM DA LÓGICA DE MANUTENÇÃO ---

        if (cliente) {
            res.json({
                login_config: JSON.parse(cliente.login_config || '{}'),
                nome_empresa: cliente.nome_empresa,
                maintenanceInfo // Adiciona a informação de manutenção na resposta
            });
        } else {
            // Se o slug não existe, retornamos a configuração padrão E sem manutenção.
            res.json({
                login_config: { logo_url: "/logo_padrao.png", background_url: "/fundo_padrao.jpg" },
                nome_empresa: "Bem-vindo ao Sistema",
                maintenanceInfo // Aqui, isActive continuará false
            });
        }
    } catch (error) {
        console.error("Erro ao buscar configuração pública:", error);
        res.status(500).json({ error: 'Falha ao carregar dados de personalização.' });
    }
});

    // ====================================================================================
    // --- ROTAS DE ANÚNCIOS GLOBAIS ---
    // ====================================================================================
    router.get('/announcements', authMiddleware, adminGeralMiddleware, async (req, res) => {
        try {
            const [announcements] = await pool.execute('SELECT * FROM anuncios_globais ORDER BY criado_em DESC');
            res.json(announcements);
        } catch (error) {
            res.status(500).json({ error: 'Falha ao buscar anúncios.' });
        }
    });

    router.post('/announcements', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { titulo, mensagem, status, publico_alvo, data_expiracao } = req.body;
        try {
            const [result] = await pool.execute(
                'INSERT INTO anuncios_globais (titulo, mensagem, status, publico_alvo, data_expiracao) VALUES (?, ?, ?, ?, ?)',
                [titulo, mensagem, status, publico_alvo, data_expiracao || null]
            );
            res.status(201).json({ id: result.insertId });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao criar anúncio.' });
        }
    });

    router.put('/announcements/:id', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { id } = req.params;
        const { titulo, mensagem, status, publico_alvo, data_expiracao } = req.body;
        try {
            await pool.execute(
                'UPDATE anuncios_globais SET titulo = ?, mensagem = ?, status = ?, publico_alvo = ?, data_expiracao = ? WHERE id = ?',
                [titulo, mensagem, status, publico_alvo, data_expiracao || null, id]
            );
            res.json({ message: 'Anúncio atualizado com sucesso.' });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao atualizar anúncio.' });
        }
    });

    router.delete('/announcements/:id', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { id } = req.params;
        try {
            await pool.execute('DELETE FROM anuncios_globais WHERE id = ?', [id]);
            res.json({ message: 'Anúncio deletado com sucesso.' });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao deletar anúncio.' });
        }
    });

    // ====================================================================================
    // --- ROTAS DE DASHBOARD E CONFIGURAÇÕES GERAIS ---
    // ====================================================================================
    router.get('/dashboard-stats', authMiddleware, adminGeralMiddleware, async (req, res) => {
        try {
            const [clientStatusRows] = await pool.execute('SELECT status, COUNT(*) as count FROM clientes_sistema GROUP BY status');
            let totalClients = 0;
            let activeClients = 0;
            clientStatusRows.forEach(row => {
                totalClients += row.count;
                if (row.status === 'ativo') {
                    activeClients = row.count;
                }
            });
            const [[{ totalUsers }]] = await pool.execute('SELECT COUNT(id) as totalUsers FROM usuarios');
            res.json({ totalClients, activeClients, totalUsers });
        } catch (error) {
            console.error("Erro ao buscar estatísticas do dashboard:", error);
            res.status(500).json({ error: 'Falha ao buscar estatísticas.' });
        }
    });
    
    router.put('/settings/maintenance', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { status } = req.body;
        try {
            await pool.execute("UPDATE configuracoes_sistema SET valor = ? WHERE chave = 'modo_manutencao'", [status.toString()]);
            res.json({ message: `Modo Manutenção ${status ? 'ATIVADO' : 'DESATIVADO'} com sucesso!` });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao atualizar o status de manutenção.' });
        }
    });

    router.get('/maintenance-status', authMiddleware, adminGeralMiddleware, async (req, res) => {
        try {
            const [[{ valor }]] = await pool.execute("SELECT valor FROM configuracoes_sistema WHERE chave = 'modo_manutencao'");
            res.json({ maintenanceMode: valor === 'true' });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao verificar o status do sistema.' });
        }
    });
    
    // ====================================================================================
    // --- ROTAS DE AGENDAMENTO DE MANUTENÇÃO ---
    // ====================================================================================
    router.post('/maintenance/schedule', authMiddleware, adminGeralMiddleware, async (req, res) => {
    const { cliente_id, data_inicio, data_fim, motivo } = req.body; // Adicionei 'motivo' ao frontend
    if (!data_inicio || !data_fim || new Date(data_inicio) >= new Date(data_fim)) {
        return res.status(400).json({ error: 'A data de fim deve ser posterior à data de início.' });
    }

    const connection = await pool.getConnection(); // Usar transaction para garantir consistência
    try {
        await connection.beginTransaction();

        // 1. Agendar a manutenção (como já fazia)
        const sqlSchedule = 'INSERT INTO manutencoes_agendadas (cliente_id, data_inicio, data_fim, criado_por_id) VALUES (?, ?, ?, ?)';
        const targetClientId = cliente_id === 'todos' ? null : cliente_id;
        await connection.execute(sqlSchedule, [targetClientId, data_inicio, data_fim, req.user.id]);
        
        // 2. [NOVO] Criar a GMUD automaticamente
        let clienteNome = 'Global';
        if (targetClientId) {
            const [[cliente]] = await connection.execute('SELECT nome_empresa FROM clientes_sistema WHERE id = ?', [targetClientId]);
            clienteNome = cliente.nome_empresa;
        }

        const gmudTitulo = `Manutenção Agendada: ${motivo || 'Rotina do Sistema'}`;
        const gmudDescricao = `Manutenção programada para o sistema. Alvo: ${clienteNome}. Motivo: ${motivo || 'Melhorias e correções de rotina.'}`;
        const gmudJustificativa = 'Manutenção necessária para garantir a estabilidade e performance do sistema.';
        
        const sqlGmud = `
            INSERT INTO suporte_gmud 
            (titulo, descricao, justificativa, impacto, plano_rollback, tipo, janela_inicio, janela_fim, solicitante_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.execute(sqlGmud, [
            gmudTitulo,
            gmudDescricao,
            gmudJustificativa,
            `Indisponibilidade temporária dos serviços para o cliente: ${clienteNome}.`,
            'Restaurar o backup da aplicação e banco de dados anterior à janela de manutenção.',
            'Planejada',
            data_inicio,
            data_fim,
            req.user.id
        ]);

        await connection.commit();
        res.status(201).json({ message: 'Manutenção agendada e GMUD registrada com sucesso!' });

    } catch (error) {
        await connection.rollback();
        console.error("Erro ao agendar manutenção e criar GMUD:", error);
        res.status(500).json({ error: 'Falha ao processar a solicitação.' });
    } finally {
        connection.release();
    }
});

    router.get('/maintenance/schedules', authMiddleware, adminGeralMiddleware, async (req, res) => {
        try {
            const [schedules] = await pool.execute("SELECT * FROM manutencoes_agendadas WHERE status = 'agendada' ORDER BY data_inicio ASC");
            res.json(schedules);
        } catch (error) {
            res.status(500).json({ error: 'Falha ao buscar agendamentos.' });
        }
    });

    router.delete('/maintenance/schedule/:id', authMiddleware, adminGeralMiddleware, async (req, res) => {
    const { id: scheduleId } = req.params;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [[schedule]] = await connection.execute(
            "SELECT * FROM manutencoes_agendadas WHERE id = ? AND status = 'agendada'", 
            [scheduleId]
        );

        if (schedule) {
            // ALTERADO: Agora cancela a GMUD se o status for 'Pendente' OU 'Aprovada'
            await connection.execute(
                `UPDATE suporte_gmud 
                 SET status = 'Cancelada' 
                 WHERE janela_inicio = ? AND janela_fim = ? AND solicitante_id = ? AND status IN ('Pendente', 'Aprovada')`,
                [schedule.data_inicio, schedule.data_fim, schedule.criado_por_id]
            );

            await connection.execute("DELETE FROM manutencoes_agendadas WHERE id = ?", [scheduleId]);
        } else {
            await connection.rollback();
            return res.json({ message: 'Agendamento não encontrado ou já processado.' });
        }

        await connection.commit();
        res.json({ message: 'Agendamento cancelado e GMUD sincronizada com sucesso!' });

    } catch (error) {
        await connection.rollback();
        console.error("Erro ao cancelar agendamento e sincronizar GMUD:", error);
        res.status(500).json({ error: 'Falha ao cancelar agendamento.' });
    } finally {
        connection.release();
    }
});
    
    // ====================================================================================
    // --- ROTAS DE SOLICITAÇÕES DE LICENÇA ---
    // ====================================================================================
    router.get('/licensing-requests', authMiddleware, adminGeralMiddleware, async (req, res) => {
        try {
            const sql = `
                SELECT sl.*, cs.nome_empresa 
                FROM solicitacoes_licenca sl
                JOIN clientes_sistema cs ON sl.cliente_id = cs.id
                ORDER BY sl.status = 'pendente' DESC, sl.data_solicitacao DESC
            `;
            const [requests] = await pool.execute(sql);
            res.json(requests);
        } catch (error) {
            console.error("Erro ao listar solicitações:", error);
            res.status(500).json({ error: 'Falha ao buscar solicitações.' });
        }
    });

    router.get('/licensing-requests/:id', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { id } = req.params;
        try {
            const sql = `
                SELECT sl.*, cs.nome_empresa 
                FROM solicitacoes_licenca sl
                JOIN clientes_sistema cs ON sl.cliente_id = cs.id
                WHERE sl.id = ?
            `;
            const [requests] = await pool.execute(sql, [id]);
            if (requests.length === 0) {
                return res.status(404).json({ error: 'Solicitação não encontrada.' });
            }
            res.json(requests[0]);
        } catch (error) {
            console.error("Erro ao buscar detalhes da solicitação:", error);
            res.status(500).json({ error: 'Falha ao buscar detalhes da solicitação.' });
        }
    });

    router.get('/api/licensing/available-keys-for-client/:clienteId', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    const { clienteId } = req.params;
    try {
        const [keys] = await pool.execute(
            'SELECT id, chave_licenca FROM licenca_chaves WHERE cliente_id = ? AND usuario_id_alocado IS NULL',
            [clienteId]
        );
        res.json(keys);
    } catch (error) {
        console.error("Erro ao buscar chaves disponíveis para o cliente:", error.message);
        res.status(500).json({ error: 'Falha ao buscar chaves disponíveis.' });
    }
});

    router.put('/licensing-requests/:id/decide', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { id: solicitacaoId } = req.params;
        const { decisao, novo_total_licencas, motivo_rejeicao } = req.body;
        const decisor_id = req.user.id;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [[solicitacao]] = await connection.execute('SELECT * FROM solicitacoes_licenca WHERE id = ? FOR UPDATE', [solicitacaoId]);
            if (!solicitacao || solicitacao.status !== 'pendente') {
                await connection.rollback();
                return res.status(404).json({ error: 'Solicitação não encontrada ou já processada.' });
            }

            let mensagemFeedback = '';
            if (decisao === 'aprovada') {
                await connection.execute('UPDATE clientes_sistema SET max_licencas = ? WHERE id = ?', [novo_total_licencas, solicitacao.cliente_id]);
                // Adiciona novas chaves de licença se necessário
                const [[{ total_chaves }]] = await connection.execute('SELECT COUNT(id) as total_chaves FROM licenca_chaves WHERE cliente_id = ?', [solicitacao.cliente_id]);
                if (novo_total_licencas > total_chaves) {
                    const chavesParaCriar = novo_total_licencas - total_chaves;
                    for (let i = 0; i < chavesParaCriar; i++) {
                        const novaChave = `LIC-${solicitacao.cliente_id}-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
                        await connection.execute('INSERT INTO licenca_chaves (cliente_id, chave_licenca) VALUES (?, ?)', [solicitacao.cliente_id, novaChave]);
                    }
                }
                await connection.execute("UPDATE solicitacoes_licenca SET status = 'aprovada', data_decisao = NOW(), decisor_id = ? WHERE id = ?", [decisor_id, solicitacaoId]);
                mensagemFeedback = `Sua solicitação de licenças foi APROVADA. Seu novo limite é de ${novo_total_licencas} usuários.`;
            } else { // Rejeitada
                await connection.execute("UPDATE solicitacoes_licenca SET status = 'rejeitada', data_decisao = NOW(), decisor_id = ?, motivo_rejeicao = ? WHERE id = ?", [decisor_id, motivo_rejeicao, solicitacaoId]);
                mensagemFeedback = `Sua solicitação de licenças foi REJEITADA. Motivo: ${motivo_rejeicao}`;
            }

            await connection.execute("INSERT INTO notificacoes (usuario_id, tipo, mensagem, link_id) VALUES (?, ?, ?, ?)", [solicitacao.solicitante_id, 'decisao_licenca', mensagemFeedback, solicitacao.cliente_id]);
            await connection.execute("UPDATE notificacoes SET lida = 1 WHERE tipo = 'solicitacao_licenca' AND link_id = ?", [solicitacaoId]);
            
            const solicitanteOnline = getUser(solicitacao.solicitante_id);
            if (solicitanteOnline) {
                 solicitanteOnline.socketIds.forEach(socketId => {
                     io.to(socketId).emit('new_notification', { message: 'Você tem uma nova notificação!' });
                });
            }

            await connection.commit();
            res.json({ message: `Solicitação ${decisao} com sucesso!` });
        } catch (error) {
            await connection.rollback();
            console.error("Erro ao decidir sobre licença:", error);
            res.status(500).json({ error: 'Falha ao processar a decisão.' });
        } finally {
            connection.release();
        }
    });

    // No final do arquivo routesSystemHub.js, antes de 'return router;'

    // ====================================================================================
// --- ROTAS DE ATUALIZAÇÕES DO SISTEMA (CHANGELOG) --- (VERSÃO COMPLETA)
// ====================================================================================

// GET: Rota para buscar todas as atualizações (para o painel de admin e o painel do usuário)
router.get('/updates', authMiddleware, async (req, res) => {
    try {
        const [updates] = await pool.execute(
          `SELECT u.*, user.nome as publicado_por_nome 
           FROM sistema_updates u
           LEFT JOIN usuarios user ON u.publicado_por_id = user.id
           ORDER BY u.data_publicacao DESC`
        );
        res.json(updates);
    } catch (error) {
        res.status(500).json({ error: 'Falha ao buscar atualizações.' });
    }
});

// POST: Rota para o admin criar uma atualização manual (agora com imagem)
router.post('/updates', authMiddleware, adminGeralMiddleware, uploadUpdate.single('imagem'), async (req, res) => {
    const { versao, titulo, descricao, categoria } = req.body;
    const publicado_por_id = req.user.id;
    const imagem_url = req.file ? `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}` : null;

    try {
        const sql = `INSERT INTO sistema_updates (versao, titulo, descricao, imagem_url, categoria, tipo, publicado_por_id) 
                       VALUES (?, ?, ?, ?, ?, 'manual', ?)`;
        const [result] = await pool.execute(sql, [versao, titulo, descricao, imagem_url, categoria, publicado_por_id]);

        // --- AQUI ESTÁ A CORREÇÃO ---
        // Trocamos a busca simples pela busca completa com JOIN,
        // garantindo que o objeto tenha todos os dados necessários (como publicado_por_nome).
        const [[newUpdate]] = await pool.execute(
          `SELECT u.*, user.nome as publicado_por_nome 
           FROM sistema_updates u
           LEFT JOIN usuarios user ON u.publicado_por_id = user.id
           WHERE u.id = ?`, 
           [result.insertId]
        );
        // --- FIM DA CORREÇÃO ---

        io.emit('new_system_update', newUpdate);
        res.status(201).json(newUpdate);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao publicar atualização.' });
    }
});

// PUT: Rota para EDITAR uma atualização
router.put('/updates/:id', authMiddleware, adminGeralMiddleware, uploadUpdate.single('imagem'), async (req, res) => {
    const { id } = req.params;
    const { versao, titulo, descricao, categoria } = req.body;
    let imagem_url = req.body.imagem_url || null; // Mantém a imagem existente se nenhuma nova for enviada

    if (req.file) {
        imagem_url = `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}`;
    }

    try {
        const sql = `UPDATE sistema_updates 
                     SET versao = ?, titulo = ?, descricao = ?, imagem_url = ?, categoria = ? 
                     WHERE id = ?`;
        await pool.execute(sql, [versao, titulo, descricao, imagem_url, categoria, id]);

        const [[updatedUpdate]] = await pool.execute('SELECT * FROM sistema_updates WHERE id = ?', [id]);
        res.status(200).json(updatedUpdate);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao atualizar a publicação.' });
    }
});

// DELETE: Rota para DELETAR uma atualização
router.delete('/updates/:id', authMiddleware, adminGeralMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        // Lógica para deletar o arquivo de imagem do servidor (opcional, mas recomendado)
        await pool.execute('DELETE FROM sistema_updates WHERE id = ?', [id]);
        res.status(200).json({ message: 'Publicação deletada com sucesso.' });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao deletar a publicação.' });
    }
});

    return router;
};