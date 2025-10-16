const express = require('express');
const router = express.Router();

module.exports = (pool, authMiddleware, adminGeralMiddleware, io) => {

    // ROTA PARA LISTAR TODAS AS GMUDS (CORRIGIDA)
    router.get('/', authMiddleware, adminGeralMiddleware, async (req, res) => {
        try {
            const sql = `
                SELECT 
                    g.id, g.titulo, g.status, g.tipo, g.janela_inicio, g.janela_fim,
                    IFNULL(u.nome, 'Usuário Removido') as solicitante_nome 
                FROM suporte_gmud g
                LEFT JOIN usuarios u ON g.solicitante_id = u.id
                ORDER BY g.criado_em DESC
            `;
            const [gmuds] = await pool.execute(sql);
            res.json(gmuds);
        } catch (error) {
            console.error("Erro ao listar GMUDs:", error);
            res.status(500).json({ error: 'Falha ao buscar GMUDs.' });
        }
    });

    // ROTA PARA BUSCAR DETALHES DE UMA GMUD
    router.get('/:id', authMiddleware, adminGeralMiddleware, async (req, res) => {
        try {
            const sql = `
                SELECT 
                    g.*, 
                    IFNULL(u_sol.nome, 'Usuário Removido') as solicitante_nome, 
                    u_apr.nome as aprovador_nome,
                    u_exe.nome as executado_por_nome,
                    (
                        SELECT JSON_ARRAYAGG(
                            -- CORRIGIDO AQUI: Trocado 'sc.titulo' por 'sc.assunto'
                            JSON_OBJECT('id', sc.id, 'titulo', sc.assunto)
                        )
                        FROM suporte_gmud_chamados sgc
                        JOIN suporte_chamados sc ON sgc.chamado_id = sc.id
                        WHERE sgc.gmud_id = g.id
                    ) as chamados_vinculados
                FROM suporte_gmud g
                LEFT JOIN usuarios u_sol ON g.solicitante_id = u_sol.id
                LEFT JOIN usuarios u_apr ON g.aprovador_id = u_apr.id
                LEFT JOIN usuarios u_exe ON g.executado_por_id = u_exe.id
                WHERE g.id = ?
            `;
            const [[gmud]] = await pool.execute(sql, [req.params.id]);
            
            if (!gmud) return res.status(404).json({ error: 'GMUD não encontrada.' });
            
            gmud.chamados_vinculados = JSON.parse(gmud.chamados_vinculados) || [];

            res.json(gmud);
        } catch (error) {
            console.error(`Erro ao buscar detalhes da GMUD #${req.params.id}:`, error);
            res.status(500).json({ error: 'Falha ao buscar detalhes da GMUD.' });
        }
    });

    // ROTA PARA ATUALIZAR O STATUS DE UMA GMUD (APROVAR, REJEITAR, ETC.)
    router.put('/:id/status', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { status: novoStatus } = req.body;
        const { id: gmudId } = req.params;
        const { id: aprovadorId } = req.user;

        const camposExtras = [];
        let sqlSet = 'status = ?';
        if (novoStatus === 'Aprovada' || novoStatus === 'Rejeitada') {
            sqlSet += ', aprovador_id = ?, data_aprovacao = NOW()';
            camposExtras.push(aprovadorId);
        }
        if (novoStatus === 'Concluída') {
            sqlSet += ', data_conclusao = NOW()';
        }

        try {
            const sql = `UPDATE suporte_gmud SET ${sqlSet} WHERE id = ?`;
            const [updateResult] = await pool.execute(sql, [novoStatus, ...camposExtras, gmudId]);

            if (updateResult.affectedRows === 0) {
                return res.status(404).json({ error: 'GMUD não encontrada ou status já é o atual.' });
            }
            
            if (novoStatus === 'Aprovada' || novoStatus === 'Rejeitada') {
                try {
                    const [[gmud]] = await pool.execute('SELECT titulo, solicitante_id FROM suporte_gmud WHERE id = ?', [gmudId]);
                    if (gmud) {
                        const { titulo, solicitante_id } = gmud;
                        const tipoNotificacao = novoStatus === 'Aprovada' ? 'gmud_aprovada' : 'gmud_rejeitada';
                        const mensagem = `Sua Gestão de Mudança <strong>#${gmudId} - ${titulo}</strong> foi <strong>${novoStatus}</strong>.`;
                        const sqlNotificacao = 'INSERT INTO notificacoes (usuario_id, tipo, mensagem, link_id) VALUES (?, ?, ?, ?)';
                        await pool.execute(sqlNotificacao, [solicitante_id, tipoNotificacao, mensagem, gmudId]);
                    }
                } catch (notificacaoError) {
                    console.error(`[ERRO DE NOTIFICAÇÃO] Falha ao criar notificação para a GMUD #${gmudId}:`, notificacaoError);
                }
            }
            
            res.json({ message: `Status da GMUD #${gmudId} atualizado para "${novoStatus}".` });

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Falha ao atualizar status da GMUD.' });
        }
    });

    // ROTA PARA REGISTRAR O RESULTADO E FINALIZAR UMA GMUD
router.post('/:id/finalizar', authMiddleware, adminGeralMiddleware, async (req, res) => {
    const { id: gmudId } = req.params;
    const { resultado } = req.body;
    const { id: executadoPorId } = req.user;

    if (!resultado || resultado.trim() === '') {
        return res.status(400).json({ error: 'O campo de resultado da execução é obrigatório.' });
    }

    try {
        const [[gmud]] = await pool.execute("SELECT status, titulo, descricao FROM suporte_gmud WHERE id = ?", [gmudId]);
        if (!gmud) {
            return res.status(404).json({ error: 'GMUD não encontrada.' });
        }
        if (!['Aprovada', 'Em Execução'].includes(gmud.status)) {
            return res.status(400).json({ error: `Não é possível finalizar uma GMUD com status "${gmud.status}".` });
        }

        const sql = `
            UPDATE suporte_gmud SET
                status = 'Concluída',
                resultado_execucao = ?,
                executado_por_id = ?,
                data_real_conclusao = NOW(),
                data_conclusao = NOW()
            WHERE id = ?
        `;
        await pool.execute(sql, [resultado, executadoPorId, gmudId]);
        
        // --- NOSSA NOVA LÓGICA COMEÇA AQUI ---
        try {
            // Um título mais amigável para a notificação
            const updateTitle = gmud.titulo.toLowerCase().includes('atualização') 
                ? gmud.titulo 
                : `Melhoria Implementada: ${gmud.titulo}`;
            
            const sqlUpdate = `
                INSERT INTO sistema_updates (titulo, descricao, tipo, gmud_id, publicado_por_id) 
                VALUES (?, ?, 'gmud', ?, ?)
            `;
            const [newUpdateResult] = await pool.execute(sqlUpdate, [
                updateTitle, 
                gmud.descricao, 
                gmudId, 
                executadoPorId
            ]);

            // Dispara o evento em tempo real para todos os usuários conectados
            console.log(`>>> [Socket.IO] Emitindo evento 'new_system_update' com os dados:`, { id: newUpdateResult.insertId, titulo: updateTitle });
            io.emit('new_system_update', { 
                id: newUpdateResult.insertId,
                titulo: updateTitle,
                data_publicacao: new Date() // Envia a data atual para o frontend
            });

        } catch (updateError) {
            // Se a criação da notícia falhar, não impede a finalização da GMUD. Apenas registra o erro.
            console.error(`[ERRO-UPDATE] Falha ao criar o registro de atualização para a GMUD #${gmudId}:`, updateError);
        }
        // --- NOSSA NOVA LÓGICA TERMINA AQUI ---
        
        res.json({ message: 'Resultado da GMUD registrado e status atualizado para Concluída.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao registrar o resultado da GMUD.' });
    }
});

    // ROTA PARA VINCULAR UM CHAMADO A UMA GMUD
    router.post('/:id/vincular-chamado', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { id: gmudId } = req.params;
        const { chamado_id: chamadoId } = req.body;

        if (!chamadoId) {
            return res.status(400).json({ error: 'O ID do chamado é obrigatório.' });
        }

        try {
            const sql = "INSERT IGNORE INTO suporte_gmud_chamados (gmud_id, chamado_id) VALUES (?, ?)";
            await pool.execute(sql, [gmudId, chamadoId]);
            res.status(201).json({ message: 'Chamado vinculado com sucesso.' });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao vincular chamado.' });
        }
    });

    // ROTA PARA DESVINCULAR UM CHAMADO DE UMA GMUD
    router.delete('/:id/vincular-chamado/:chamadoId', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { id: gmudId, chamadoId } = req.params;
        try {
            const sql = "DELETE FROM suporte_gmud_chamados WHERE gmud_id = ? AND chamado_id = ?";
            await pool.execute(sql, [gmudId, chamadoId]);
            res.json({ message: 'Vínculo removido com sucesso.' });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao remover vínculo.' });
        }
    });

    // ROTA PARA BUSCAR CHAMADOS "INCIDENTE" ABERTOS PARA VINCULAR
    router.get('/busca/chamados-para-vincular', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { q = '' } = req.query;
        try {
            const sql = `
                -- CORRIGIDO AQUI: Trocado 'titulo' por 'assunto' em toda a query
                SELECT id, assunto as titulo FROM suporte_chamados 
                WHERE tipo = 'Incidente' 
                AND status NOT IN ('Fechado', 'Cancelado')
                AND (assunto LIKE ? OR id = ?)
                LIMIT 10
            `;
            const searchTerm = `%${q}%`;
            const [chamados] = await pool.execute(sql, [searchTerm, q]);
            res.json(chamados);
        } catch (error) {
            res.status(500).json({ error: 'Falha ao buscar chamados.' });
        }
    });

    return router;
};