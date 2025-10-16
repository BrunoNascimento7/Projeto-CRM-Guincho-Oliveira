// routes/routesKnowledge.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Esta função exporta o router já configurado com as dependências do server.js
module.exports = (pool, authMiddleware, permissionMiddleware) => {
    // ------------------- DEPENDÊNCIAS E CONFIGURAÇÕES ESPECÍFICAS -------------------

    // Constante de permissão movida para cá para manter o módulo auto-contido
    const PERMISSAO_EDICAO_CONHECIMENTO = ['admin_geral', 'admin', 'conhecimento_manager'];

    // Configuração do Multer para anexos da Base de Conhecimento, agora local
    const anexoStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = 'uploads/conhecimento';
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s/g, '_'));
        }
    });
    const uploadAnexo = multer({ storage: anexoStorage });

    // Função auxiliar movida para cá
    async function getNextKbId() {
        const [rows] = await pool.execute("SELECT kb_id FROM kb_artigos ORDER BY id DESC LIMIT 1");
        if (rows.length === 0) return 'KB-0001';
        const lastNum = parseInt(rows[0].kb_id.split('-')[1]);
        return `KB-${String(lastNum + 1).padStart(4, '0')}`;
    }

    // ------------------- ROTAS DA BASE DE CONHECIMENTO -------------------

    // ROTA: LISTAR ARTIGOS
    router.get('/conhecimento', authMiddleware, async (req, res) => {
        try {
            const { perfil } = req.user;
            let sql = `
                SELECT a.id, a.kb_id, a.titulo, a.categoria, a.status, a.tags, a.atualizado_em, a.criado_por_nome, 
                       (SELECT COUNT(*) FROM kb_anexos WHERE artigo_id = a.id) as anexo_count
                FROM kb_artigos a
            `;
            const params = [];
            
            if (!PERMISSAO_EDICAO_CONHECIMENTO.includes(perfil)) {
                sql += ` WHERE a.status = 'Aprovado' AND (a.visibilidade IS NULL OR JSON_LENGTH(a.visibilidade) = 0 OR JSON_CONTAINS(a.visibilidade, JSON_QUOTE(?)))`;
                params.push(perfil);
            }
            
            sql += " ORDER BY a.atualizado_em DESC";
            
            const [artigos] = await pool.execute(sql, params);
            res.json(artigos);
        } catch (error) {
            console.error("Erro ao buscar artigos:", error);
            res.status(500).json({ error: 'Falha ao buscar artigos.' });
        }
    });

    // ROTA: BUSCAR UM ARTIGO COMPLETO
    router.get('/conhecimento/:id', authMiddleware, async (req, res) => {
        try {
            const { id } = req.params;
            const [artigos] = await pool.execute("SELECT * FROM kb_artigos WHERE id = ?", [id]);
            if (artigos.length === 0) return res.status(404).json({ error: 'Artigo não encontrado.' });
        
            const [anexos] = await pool.execute("SELECT id, nome_original, tamanho_bytes, path_servidor, mimetype FROM kb_anexos WHERE artigo_id = ?", [id]);
            
            res.json({ ...artigos[0], anexos });
        } catch (error) {
            console.error("Erro ao buscar artigo:", error);
            res.status(500).json({ error: 'Falha ao buscar o artigo.' });
        }
    });

    // ROTA: CRIAR NOVO ARTIGO
    router.post('/conhecimento', authMiddleware, permissionMiddleware(PERMISSAO_EDICAO_CONHECIMENTO), async (req, res) => {
        try {
            const { titulo, categoria } = req.body;
            const { id: criado_por_id, nome: criado_por_nome } = req.user;
            const kb_id = await getNextKbId();
            
            const artigoSQL = "INSERT INTO kb_artigos (kb_id, titulo, categoria, status, criado_por_id, criado_por_nome, atualizado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?)";
            const [result] = await pool.execute(artigoSQL, [kb_id, titulo, categoria, 'Rascunho', criado_por_id, criado_por_nome, criado_por_nome]);
            
            const newArticleId = result.insertId;
            const [artigoRows] = await pool.execute("SELECT * FROM kb_artigos WHERE id = ?", [newArticleId]);
            const novoArtigo = artigoRows[0];
            novoArtigo.anexos = [];

            res.status(201).json(novoArtigo);
        } catch (error) {
            console.error("Erro ao criar rascunho de artigo:", error);
            res.status(500).json({ error: 'Falha ao criar rascunho.' });
        }
    });

    // ROTA: ATUALIZAR UM ARTIGO
    router.put('/conhecimento/:id', authMiddleware, permissionMiddleware(PERMISSAO_EDICAO_CONHECIMENTO), async (req, res) => {
        try {
            const { id } = req.params;
            const { titulo, conteudo, categoria, tags, visibilidade, status } = req.body;
            const { nome: atualizado_por_nome } = req.user;
            
            const sql = "UPDATE kb_artigos SET titulo = ?, conteudo = ?, categoria = ?, tags = ?, visibilidade = ?, status = ?, atualizado_por_nome = ? WHERE id = ?";
            await pool.execute(sql, [titulo, conteudo, categoria, tags, visibilidade, status, atualizado_por_nome, id]);
            
            res.json({ message: 'Artigo atualizado com sucesso!' });
        } catch (error) {
            console.error("Erro ao atualizar artigo:", error);
            res.status(500).json({ error: 'Falha ao atualizar o artigo.' });
        }
    });

    // ROTA: DELETAR UM ARTIGO (e seus anexos)
    router.delete('/conhecimento/:id', authMiddleware, permissionMiddleware(PERMISSAO_EDICAO_CONHECIMENTO), async (req, res) => {
        try {
            const { id } = req.params;
            const [anexos] = await pool.execute("SELECT path_servidor FROM kb_anexos WHERE artigo_id = ?", [id]);
            for (const anexo of anexos) {
                fs.unlink(anexo.path_servidor, (err) => {
                    if (err) console.error(`Falha ao deletar anexo físico: ${anexo.path_servidor}`, err);
                });
            }
            await pool.execute("DELETE FROM kb_artigos WHERE id = ?", [id]);
            res.json({ message: 'Artigo deletado com sucesso.' });
        } catch (error) {
            console.error("Erro ao deletar artigo:", error);
            res.status(500).json({ error: 'Falha ao deletar o artigo.' });
        }
    });

    // ROTA: UPLOAD DE ANEXOS PARA UM ARTIGO
    router.post('/conhecimento/:id/anexos', authMiddleware, permissionMiddleware(PERMISSAO_EDICAO_CONHECIMENTO), uploadAnexo.array('anexos'), async (req, res) => {
        const { id: artigoId } = req.params;
        const connection = await pool.getConnection();

        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
            }

            await connection.beginTransaction();

            const anexoSQL = "INSERT INTO kb_anexos (artigo_id, nome_original, path_servidor, mimetype, tamanho_bytes) VALUES (?, ?, ?, ?, ?)";
            
            for (const file of req.files) {
                const values = [artigoId, file.originalname, file.path, file.mimetype, file.size];
                await connection.execute(anexoSQL, values);
            }

            await connection.commit();
            
            res.status(201).json({ message: 'Anexos enviados com sucesso!' });
        } catch (error) {
            await connection.rollback();
            console.error("Erro no upload de anexos:", error);
            res.status(500).json({ error: 'Falha no upload.' });
        } finally {
            connection.release();
        }
    });

    // ROTA: DOWNLOAD DE UM ANEXO
    router.get('/anexos/:id/download', authMiddleware, async (req, res) => {
        try {
            const { id } = req.params;
            const [anexos] = await pool.execute("SELECT * FROM kb_anexos WHERE id = ?", [id]);
            if (anexos.length === 0) return res.status(404).send('Anexo não encontrado.');
            
            const anexo = anexos[0];
            res.download(anexo.path_servidor, anexo.nome_original);
        } catch (error) {
            console.error("Erro no download de anexo:", error);
            res.status(500).send('Erro ao processar o download.');
        }
    });

    // ROTA: VISUALIZAR UM ANEXO
    router.get('/anexos/:id/view', authMiddleware, async (req, res) => {
        try {
            const { id } = req.params;
            const [anexos] = await pool.execute("SELECT path_servidor, mimetype FROM kb_anexos WHERE id = ?", [id]);
            if (anexos.length === 0) {
                return res.status(404).send('Anexo não encontrado.');
            }

            const anexo = anexos[0];
            res.setHeader('Content-Type', anexo.mimetype);
            res.sendFile(path.resolve(anexo.path_servidor));

        } catch (error) {
            console.error("Erro ao visualizar anexo:", error);
            res.status(500).send('Erro ao processar a visualização.');
        }
    });

    // ROTA: Submeter um artigo para aprovação
    router.put('/conhecimento/:id/submeter', authMiddleware, permissionMiddleware(PERMISSAO_EDICAO_CONHECIMENTO), async (req, res) => {
        const { id: artigoId } = req.params;
        const { aprovador_id } = req.body;
        const { nome: autorNome } = req.user;

        try {
            await pool.execute("UPDATE kb_artigos SET status = 'Pendente', aprovador_id = ? WHERE id = ?", [aprovador_id, artigoId]);
            
            const [artigo] = await pool.execute("SELECT kb_id FROM kb_artigos WHERE id = ?", [artigoId]);
            const mensagem = `${autorNome} submeteu o artigo "${artigo[0].kb_id}" para sua aprovação.`;
            await pool.execute("INSERT INTO notificacoes (usuario_id, tipo, mensagem, link_id) VALUES (?, ?, ?, ?)", [aprovador_id, 'aprovacao_kb', mensagem, artigoId]);
            
            res.json({ message: 'Artigo submetido para aprovação com sucesso!' });
        } catch (error) {
            console.error("Erro ao submeter artigo:", error);
            res.status(500).json({ error: 'Falha ao submeter artigo.' });
        }
    });
    
    // ROTA: Ações em massa
    router.post('/conhecimento/bulk-actions', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const { artigoIds, action } = req.body;

        if (!Array.isArray(artigoIds) || artigoIds.length === 0) {
            return res.status(400).json({ error: 'Nenhum artigo foi selecionado.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            if (action === 'aprovar') {
                const sql = "UPDATE kb_artigos SET status = 'Aprovado' WHERE id IN (?) AND status IN ('Pendente', 'Rascunho', 'Rejeitado')";
                await connection.query(sql, [artigoIds]);
            } else if (action === 'deletar') {
                await connection.query("DELETE FROM kb_anexos WHERE artigo_id IN (?)", [artigoIds]);
                await connection.query("DELETE FROM kb_artigos WHERE id IN (?)", [artigoIds]);
            } else {
                await connection.rollback();
                return res.status(400).json({ error: 'Ação desconhecida.' });
            }

            await connection.commit();
            res.json({ message: 'Ação em massa concluída com sucesso!' });

        } catch (error) {
            await connection.rollback();
            console.error("Erro na ação em massa da Base de Conhecimento:", error);
            res.status(500).json({ error: 'Falha ao processar a solicitação em massa.' });
        } finally {
            connection.release();
        }
    });

    // ROTA: Aprovar ou Rejeitar um artigo (via notificação)
    router.put('/notificacoes/kb/:id/decisao', authMiddleware, async (req, res) => {
        const { id: artigoId } = req.params;
        const { decisao, motivo } = req.body;
        const { id: userId, nome: aprovadorNome } = req.user;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [artigos] = await connection.execute("SELECT kb_id, aprovador_id, criado_por_id FROM kb_artigos WHERE id = ?", [artigoId]);
            if (artigos.length === 0 || artigos[0].aprovador_id !== userId) {
                return res.status(403).json({ error: 'Você não tem permissão para esta ação.' });
            }
            
            const artigo = artigos[0];
            const novoStatus = decisao === 'aprovado' ? 'Aprovado' : 'Rejeitado';
            await connection.execute("UPDATE kb_artigos SET status = ?, rejeicao_motivo = ? WHERE id = ?", [novoStatus, motivo || null, artigoId]);
            
            const mensagem = `Sua submissão do artigo "${artigo.kb_id}" foi ${novoStatus.toLowerCase()} por ${aprovadorNome}.`;
            await connection.execute("INSERT INTO notificacoes (usuario_id, tipo, mensagem, link_id) VALUES (?, ?, ?, ?)", [artigo.criado_por_id, 'decisao_kb', mensagem, artigoId]);

            await connection.execute("UPDATE notificacoes SET lida = 1 WHERE usuario_id = ? AND tipo = 'aprovacao_kb' AND link_id = ?", [userId, artigoId]);

            await connection.commit();
            res.json({ message: `Artigo ${novoStatus.toLowerCase()} com sucesso.` });

        } catch (error) {
            await connection.rollback();
            console.error("Erro na decisão do artigo:", error);
            res.status(500).json({ error: 'Falha ao processar decisão.' });
        } finally {
            connection.release();
        }
    });

    // Retorna o router configurado
    return router;
}