const express = require('express');
const router = express.Router();

// Apenas admin_geral e admin podem gerenciar templates
const permissoesAdmin = ['admin_geral', 'admin'];

module.exports = (pool, authMiddleware, permissionMiddleware) => {

    // Rota para LISTAR todos os templates
    // Acessível para mais perfis, pois é usada na tela de comunicação
    router.get('/', authMiddleware, permissionMiddleware([...permissoesAdmin, 'financeiro']), async (req, res) => {
        try {
            const [templates] = await pool.execute('SELECT id, nome, texto FROM comunicacao_templates ORDER BY nome ASC');
            res.json(templates);
        } catch (error) {
            console.error("Erro ao buscar templates:", error);
            res.status(500).json({ error: 'Falha ao buscar templates.' });
        }
    });

    // Rota para CRIAR um novo template
    router.post('/', authMiddleware, permissionMiddleware(permissoesAdmin), async (req, res) => {
        const { nome, texto } = req.body;
        if (!nome || !texto) {
            return res.status(400).json({ error: 'Nome e texto do template são obrigatórios.' });
        }
        try {
            const sql = 'INSERT INTO comunicacao_templates (nome, texto) VALUES (?, ?)';
            const [result] = await pool.execute(sql, [nome, texto]);
            res.status(201).json({ id: result.insertId, nome, texto });
        } catch (error) {
            console.error("Erro ao criar template:", error);
            res.status(500).json({ error: 'Falha ao criar template.' });
        }
    });

    // Rota para ATUALIZAR um template
    router.put('/:id', authMiddleware, permissionMiddleware(permissoesAdmin), async (req, res) => {
        const { id } = req.params;
        const { nome, texto } = req.body;
        if (!nome || !texto) {
            return res.status(400).json({ error: 'Nome e texto do template são obrigatórios.' });
        }
        try {
            const sql = 'UPDATE comunicacao_templates SET nome = ?, texto = ? WHERE id = ?';
            const [result] = await pool.execute(sql, [nome, texto, id]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Template não encontrado.' });
            }
            res.status(200).json({ message: 'Template atualizado com sucesso!' });
        } catch (error) {
            console.error("Erro ao atualizar template:", error);
            res.status(500).json({ error: 'Falha ao atualizar template.' });
        }
    });

    // Rota para DELETAR um template
    router.delete('/:id', authMiddleware, permissionMiddleware(permissoesAdmin), async (req, res) => {
        const { id } = req.params;
        try {
            const sql = 'DELETE FROM comunicacao_templates WHERE id = ?';
            const [result] = await pool.execute(sql, [id]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Template não encontrado.' });
            }
            res.status(200).json({ message: 'Template excluído com sucesso!' });
        } catch (error) {
            console.error("Erro ao excluir template:", error);
            res.status(500).json({ error: 'Falha ao excluir template.' });
        }
    });

    return router;
};
