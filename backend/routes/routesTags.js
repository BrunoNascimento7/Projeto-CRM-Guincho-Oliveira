// backend/routes/routesTags.js
const express = require('express');
const router = express.Router();

module.exports = (pool, authMiddleware, permissionMiddleware) => {

    // Rota para LISTAR todas as tags
    router.get('/', authMiddleware, async (req, res) => {
        try {
            const [tags] = await pool.execute('SELECT tag_nome, tag_valor, descricao FROM configuracao_tags ORDER BY tag_nome');
            res.json(tags);
        } catch (error) {
            res.status(500).json({ error: 'Falha ao buscar tags.' });
        }
    });

    // Rota para ATUALIZAR uma tag (ou criar se não existir)
    router.post('/', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const { tag_nome, tag_valor, descricao } = req.body;
        if (!tag_nome || !tag_valor) {
            return res.status(400).json({ error: 'Nome e valor da tag são obrigatórios.' });
        }

        try {
            const sql = `
                INSERT INTO configuracao_tags (tag_nome, tag_valor, descricao) 
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE tag_valor = VALUES(tag_valor), descricao = VALUES(descricao)
            `;
            await pool.execute(sql, [tag_nome, tag_valor, descricao]);
            res.status(200).json({ message: 'Tag salva com sucesso!' });
        } catch (error) {
            console.error("Erro ao salvar tag:", error);
            res.status(500).json({ error: 'Falha ao salvar tag.' });
        }
    });
    
    return router;
};