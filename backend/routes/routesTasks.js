const express = require('express');
const router = express.Router();

/**
 * Este módulo exporta uma função que recebe as dependências (pool, middlewares) 
 * e retorna o router configurado com as rotas de Kanban (Colunas e Tarefas).
 *
 * @param {object} dependencies - Objeto contendo pool, authMiddleware, etc.
 * @returns {express.Router} O router Express configurado.
 */
module.exports = (dependencies) => {
    // Desestruturando as dependências necessárias
    const { 
        pool, 
        authMiddleware, 
        adminGeralMiddleware, 
        permissionMiddleware,
        registrarLog, // Mantendo, caso você queira adicionar logs futuramente
        // Se precisar de io e getUser para notificar sobre novas tarefas, desestruture aqui também.
    } = dependencies;

    // ====================================================================================
    // --- ROTAS DE KANBAN (COLUNAS) ---
    // ====================================================================================

    // Rota para listar colunas (visível apenas para o criador ou admin geral)
    router.get('/kanban/colunas', authMiddleware, async (req, res) => {
        const { id: userId, perfil } = req.user;
        try {
            let sql;
            let params = [];

            if (perfil === 'admin_geral') {
                // Admin geral vê todas as colunas
                sql = 'SELECT c.*, u.nome as nome_criador FROM kanban_colunas c JOIN usuarios u ON c.criado_por = u.id ORDER BY c.criado_por, c.ordem ASC';
            } else {
                // Usuário comum vê suas próprias colunas e colunas de tarefas compartilhadas com ele
                sql = `
                    SELECT DISTINCT c.*, u.nome as nome_criador
                    FROM kanban_colunas c
                    JOIN usuarios u ON c.criado_por = u.id
                    LEFT JOIN tarefas t ON t.coluna_id = c.id
                    WHERE 
                        c.criado_por = ?
                        OR 
                        JSON_CONTAINS(t.usuarios_compartilhados, CAST(? AS JSON))
                    ORDER BY c.criado_por, c.ordem ASC
                `;
                params = [userId, JSON.stringify(userId)];
            }

            const [colunas] = await pool.execute(sql, params);
            res.json(colunas);
        } catch (error) {
            console.error("Falha ao buscar colunas do Kanban:", error);
            res.status(500).json({ error: "Falha ao buscar colunas." });
        }
    });

    // Rota para criar uma nova coluna
    router.post('/kanban/colunas', authMiddleware, async (req, res) => {
        const { titulo } = req.body;
        const criado_por = req.user.id;
        try {
            // Calcula a próxima ordem para o usuário criador
            const [[{ maxOrdem }]] = await pool.execute('SELECT MAX(ordem) as maxOrdem FROM kanban_colunas WHERE criado_por = ?', [criado_por]);
            const novaOrdem = (maxOrdem || 0) + 1;

            const [result] = await pool.execute(
                'INSERT INTO kanban_colunas (titulo, ordem, criado_por) VALUES (?, ?, ?)',
                [titulo, novaOrdem, criado_por]
            );
            res.status(201).json({ id: result.insertId, titulo, ordem: novaOrdem, criado_por });
        } catch (error) {
            console.error("Erro ao criar coluna:", error);
            res.status(500).json({ error: "Falha ao criar coluna." });
        }
    });

    // Rota para atualizar o título de uma coluna
    router.put('/kanban/colunas/:id', authMiddleware, async (req, res) => {
        const { id: colunaId } = req.params;
        const { titulo } = req.body;
        const { id: userId, perfil } = req.user;

        try {
            let sql = 'UPDATE kanban_colunas SET titulo = ? WHERE id = ?';
            const params = [titulo, colunaId];

            // Permite que apenas o criador ou admin geral editem
            if (perfil !== 'admin_geral') {
                sql += ' AND criado_por = ?';
                params.push(userId);
            }

            const [result] = await pool.execute(sql, params);

            if (result.affectedRows === 0) {
                return res.status(403).json({ error: "Você não tem permissão para editar esta coluna ou ela não foi encontrada." });
            }
            res.json({ message: "Coluna renomeada com sucesso." });
        } catch (error) {
            console.error("Erro ao renomear coluna:", error);
            res.status(500).json({ error: "Falha ao renomear a coluna." });
        }
    });

    // Rota para excluir uma coluna (e suas tarefas, se for admin geral)
    router.delete('/kanban/colunas/:id', authMiddleware, async (req, res) => {
        const { id: colunaId } = req.params;
        const { id: userId, perfil } = req.user;

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [tasks] = await connection.execute('SELECT id FROM tarefas WHERE coluna_id = ?', [colunaId]);
            
            if (tasks.length > 0) {
                // Se não for admin geral e houver tarefas, impede a exclusão
                if (perfil !== 'admin_geral') {
                    await connection.rollback();
                    return res.status(400).json({ error: "Não é possível excluir. Mova ou remova as tarefas desta coluna primeiro." });
                } else {
                    // Admin geral pode deletar as tarefas junto
                    await connection.execute('DELETE FROM tarefas WHERE coluna_id = ?', [colunaId]);
                }
            }

            let sql = 'DELETE FROM kanban_colunas WHERE id = ?';
            const params = [colunaId];

            if (perfil !== 'admin_geral') {
                sql += ' AND criado_por = ?';
                params.push(userId);
            }

            const [result] = await connection.execute(sql, params);

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(403).json({ error: "Você não tem permissão para excluir esta coluna ou ela não foi encontrada." });
            }

            await connection.commit();
            res.json({ message: "Coluna e suas tarefas foram excluídas com sucesso." });

        } catch (error) {
            await connection.rollback();
            console.error("ERRO AO EXCLUIR COLUNA:", error);
            res.status(500).json({ error: "Falha ao excluir a coluna." });
        } finally {
            connection.release();
        }
    });

    // ====================================================================================
    // --- ROTAS DE TAREFAS ---
    // ====================================================================================

    // Rota para listar todas as tarefas visíveis ao usuário
    router.get('/tarefas', authMiddleware, async (req, res) => {
        const { id: userId, perfil } = req.user;
        try {
            let sql;
            let params = [];

            if (perfil === 'admin_geral') {
                sql = 'SELECT t.*, u.nome as nome_criador FROM tarefas t JOIN usuarios u ON t.criado_por = u.id ORDER BY t.id DESC';
            } else {
                sql = `
                    SELECT t.*, u.nome as nome_criador FROM tarefas t
                    JOIN usuarios u ON t.criado_por = u.id
                    WHERE t.criado_por = ? OR JSON_CONTAINS(t.usuarios_compartilhados, ?)
                    ORDER BY t.id DESC
                `;
                params = [userId, JSON.stringify(userId)];
            }
            
            const [tarefas] = await pool.execute(sql, params);
            res.json(tarefas);
        } catch (error) {
            console.error("Erro ao buscar tarefas:", error);
            res.status(500).json({ error: "Falha ao buscar tarefas." });
        }
    });

    // Rota para criar uma nova tarefa
    router.post('/tarefas', authMiddleware, async (req, res) => {
        const { titulo, descricao, coluna_id, data_inicio, data_finalizacao, usuarios_compartilhados } = req.body;
        const criado_por = req.user.id;
        try {
            const sql = `
                INSERT INTO tarefas (titulo, descricao, coluna_id, data_inicio, data_finalizacao, criado_por, usuarios_compartilhados)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const [result] = await pool.execute(sql, [
                titulo, 
                descricao, 
                coluna_id, 
                data_inicio || null, 
                data_finalizacao || null, 
                criado_por, 
                JSON.stringify(usuarios_compartilhados || [])
            ]);
            res.status(201).json({ id: result.insertId });
        } catch (error) {
            console.error("Erro ao criar tarefa:", error);
            res.status(500).json({ error: "Falha ao criar tarefa." });
        }
    });

    // Rota para atualizar o status (coluna) da tarefa
    router.put('/tarefas/:id/status', authMiddleware, async (req, res) => {
        const { id } = req.params;
        const { coluna_id } = req.body;
        try {
            await pool.execute('UPDATE tarefas SET coluna_id = ? WHERE id = ?', [coluna_id, id]);
            res.json({ message: 'Coluna da tarefa atualizada com sucesso.' });
        } catch (error) {
            console.error("Erro ao atualizar status da tarefa:", error);
            res.status(500).json({ error: "Falha ao atualizar coluna da tarefa." });
        }
    });

    // Rota para atualizar todos os dados da tarefa (exceto coluna)
    router.put('/tarefas/:id', authMiddleware, async (req, res) => {
        const { id } = req.params;
        const { titulo, descricao, data_inicio, data_finalizacao, usuarios_compartilhados } = req.body;
        try {
            const sql = `
                UPDATE tarefas SET 
                titulo = ?, descricao = ?, data_inicio = ?, data_finalizacao = ?, usuarios_compartilhados = ?
                WHERE id = ?
            `;
            await pool.execute(sql, [
                titulo,
                descricao || null,
                data_inicio || null,
                data_finalizacao || null,
                JSON.stringify(usuarios_compartilhados || []),
                id
            ]);
            res.json({ message: 'Tarefa atualizada com sucesso.' });
        } catch (error) {
            console.error("Erro ao atualizar tarefa:", error);
            res.status(500).json({ error: "Falha ao atualizar tarefa." });
        }
    });

    // Rota para deletar uma tarefa
    router.delete('/tarefas/:id', authMiddleware, async (req, res) => {
        const { id: taskId } = req.params;
        const { id: userId, perfil } = req.user;
        try {
            if (perfil !== 'admin_geral') {
                // Garante que só o criador ou admin_geral podem excluir
                const [taskRows] = await pool.execute('SELECT criado_por FROM tarefas WHERE id = ?', [taskId]);
                if (taskRows.length === 0 || taskRows[0].criado_por !== userId) {
                    return res.status(403).json({ error: 'Você não tem permissão para excluir esta tarefa.' });
                }
            }
            // Primeiro deleta as notas (se houver) e depois a tarefa
            await pool.execute('DELETE FROM tarefa_notas WHERE tarefa_id = ?', [taskId]);
            await pool.execute('DELETE FROM tarefas WHERE id = ?', [taskId]);
            res.json({ message: 'Tarefa excluída com sucesso.' });
        } catch (error) {
            console.error("Erro ao excluir tarefa:", error);
            res.status(500).json({ error: "Falha ao excluir a tarefa." });
        }
    });

    // Rota para listar notas de uma tarefa
    router.get('/tarefas/:id/notas', authMiddleware, async (req, res) => {
        const { id } = req.params;
        try {
            const [notas] = await pool.execute('SELECT * FROM tarefa_notas WHERE tarefa_id = ? ORDER BY data_criacao ASC', [id]);
            res.json(notas);
        } catch (error) {
            console.error("Erro ao buscar notas da tarefa:", error);
            res.status(500).json({ error: "Falha ao buscar notas da tarefa." });
        }
    });

    // Rota para adicionar uma nota a uma tarefa
    router.post('/tarefas/:id/notas', authMiddleware, async (req, res) => {
        const { id: tarefa_id } = req.params;
        const { nota } = req.body;
        const { id: usuario_id, nome: usuario_nome } = req.user;
        try {
            const sql = 'INSERT INTO tarefa_notas (tarefa_id, usuario_id, usuario_nome, nota) VALUES (?, ?, ?, ?)';
            const [result] = await pool.execute(sql, [tarefa_id, usuario_id, usuario_nome, nota]);
            res.status(201).json({ id: result.insertId });
        } catch (error) {
            console.error("Erro ao adicionar nota:", error);
            res.status(500).json({ error: "Falha ao adicionar nota." });
        }
    });

    

    return router;
};
