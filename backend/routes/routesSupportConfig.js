const express = require('express');
const router = express.Router();
const { format } = require('date-fns');
const exceljs = require('exceljs'); 
const multer = require('multer'); 

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

module.exports = (pool, authMiddleware, permissionMiddleware) => {

    const PERMISSOES_ADMIN_SUPORTE = ['admin_geral', 'admin'];
    const PERMISSAO_APENAS_ADMIN_GERAL = ['admin_geral'];

    // ROTA PARA BUSCAR TODAS AS CATEGORIAS E SUBCATEGORIAS DE FORMA ESTRUTURADA
    router.get('/categorias', authMiddleware, permissionMiddleware(PERMISSOES_ADMIN_SUPORTE), async (req, res) => {
        try {
            const [categorias] = await pool.execute('SELECT * FROM suporte_categorias ORDER BY nome ASC');
            const [subcategorias] = await pool.execute('SELECT * FROM suporte_subcategorias ORDER BY nome ASC');

            // Estrutura os dados de forma aninhada para facilitar o uso no frontend
            const resultadoFinal = categorias.map(cat => ({
                ...cat,
                subcategorias: subcategorias.filter(sub => sub.categoria_id === cat.id)
            }));
            
            res.json(resultadoFinal);
        } catch (error) {
            console.error("Erro ao buscar categorias:", error.message);
            res.status(500).json({ error: 'Falha ao buscar dados de configuração.' });
        }
    });

    // --- ROTAS PARA GERENCIAR CATEGORIAS PRINCIPAIS ---
    router.post('/categorias', authMiddleware, permissionMiddleware(PERMISSOES_ADMIN_SUPORTE), async (req, res) => {
    // 1. Adicionado 'perfil_destino_padrao' na desestruturação
    const { nome, tipo_padrao, prioridade_padrao, perfil_destino_padrao } = req.body;
    if (!nome) return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
    try {
        // 2. Adicionado a nova coluna no INSERT
        const sql = 'INSERT INTO suporte_categorias (nome, tipo_padrao, prioridade_padrao, perfil_destino_padrao) VALUES (?, ?, ?, ?)';
        
        // 3. Adicionado o novo parâmetro, com fallback para NULL
        const [result] = await pool.execute(sql, [
            nome, 
            tipo_padrao || 'Incidente', 
            prioridade_padrao || 'Normal',
            perfil_destino_padrao || null 
        ]);
        res.status(201).json({ id: result.insertId, nome, tipo_padrao, prioridade_padrao, perfil_destino_padrao });
    } catch (error) {
        console.error("Erro ao criar categoria:", error.message);
        res.status(500).json({ error: 'Falha ao criar categoria.' });
    }
});

    router.put('/categorias/:id', authMiddleware, permissionMiddleware(PERMISSOES_ADMIN_SUPORTE), async (req, res) => {
    // 1. Adicionado 'perfil_destino_padrao' na desestruturação
    const { nome, tipo_padrao, prioridade_padrao, perfil_destino_padrao } = req.body;
    const { id } = req.params;
    if (!nome) return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
    try {
        // 2. Adicionado o novo campo no UPDATE
        const sql = 'UPDATE suporte_categorias SET nome = ?, tipo_padrao = ?, prioridade_padrao = ?, perfil_destino_padrao = ? WHERE id = ?';
        
        // 3. Adicionado o novo parâmetro, com fallback para NULL
        await pool.execute(sql, [
            nome, 
            tipo_padrao, 
            prioridade_padrao, 
            perfil_destino_padrao || null,
            id
        ]);
        res.status(200).json({ message: 'Categoria atualizada com sucesso.' });
    } catch (error) {
        console.error("Erro ao atualizar categoria:", error.message);
        res.status(500).json({ error: 'Falha ao atualizar categoria.' });
    }
});
    
    router.delete('/categorias/:id', authMiddleware, permissionMiddleware(PERMISSOES_ADMIN_SUPORTE), async (req, res) => {
        const { id } = req.params;
        try {
            // Graças ao 'ON DELETE CASCADE', as subcategorias serão removidas automaticamente
            await pool.execute('DELETE FROM suporte_categorias WHERE id = ?', [id]);
            res.status(200).json({ message: 'Categoria e suas subcategorias foram removidas.' });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao remover categoria.' });
        }
    });


    // --- ROTAS PARA GERENCIAR SUBCATEGORIAS ---
    router.post('/subcategorias', authMiddleware, permissionMiddleware(PERMISSOES_ADMIN_SUPORTE), async (req, res) => {
        const { nome, categoria_id } = req.body;
        if (!nome || !categoria_id) return res.status(400).json({ error: 'Nome e ID da categoria são obrigatórios.' });
        try {
            const [result] = await pool.execute('INSERT INTO suporte_subcategorias (nome, categoria_id) VALUES (?, ?)', [nome, categoria_id]);
            res.status(201).json({ id: result.insertId, nome, categoria_id });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao criar subcategoria.' });
        }
    });

    router.put('/subcategorias/:id', authMiddleware, permissionMiddleware(PERMISSOES_ADMIN_SUPORTE), async (req, res) => {
        const { nome } = req.body;
        const { id } = req.params;
        if (!nome) return res.status(400).json({ error: 'O nome da subcategoria é obrigatório.' });
        try {
            await pool.execute('UPDATE suporte_subcategorias SET nome = ? WHERE id = ?', [nome, id]);
            res.status(200).json({ message: 'Subcategoria atualizada com sucesso.' });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao atualizar subcategoria.' });
        }
    });

    router.delete('/subcategorias/:id', authMiddleware, permissionMiddleware(PERMISSOES_ADMIN_SUPORTE), async (req, res) => {
        const { id } = req.params;
        try {
            await pool.execute('DELETE FROM suporte_subcategorias WHERE id = ?', [id]);
            res.status(200).json({ message: 'Subcategoria removida.' });
        } catch (error) {
            res.status(500).json({ error: 'Falha ao remover subcategoria.' });
        }
    });


// --- NOVAS ROTAS PARA GERENCIAR POLÍTICAS DE SLA ---

// ROTA PARA BUSCAR TODAS AS POLÍTICAS DE SLA
router.get('/sla-politicas', authMiddleware, permissionMiddleware(PERMISSOES_ADMIN_SUPORTE), async (req, res) => {
    try {
        const [politicas] = await pool.execute('SELECT * FROM suporte_sla_politicas');
        res.json(politicas);
    } catch (error) {
        console.error("Erro ao buscar políticas de SLA:", error.message);
        res.status(500).json({ error: 'Falha ao buscar dados de SLA.' });
    }
});

// ROTA PARA SALVAR/ATUALIZAR AS POLÍTICAS DE SLA (TODAS DE UMA VEZ)
router.put('/sla-politicas', authMiddleware, permissionMiddleware(PERMISSOES_ADMIN_SUPORTE), async (req, res) => {
    const politicas = req.body; // Espera um array: [{ prioridade, tempo_primeira_resposta_minutos, ... }]
    if (!Array.isArray(politicas)) return res.status(400).json({ error: 'Formato de dados inválido.' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Usamos INSERT ... ON DUPLICATE KEY UPDATE para criar ou atualizar as regras.
        // Isso simplifica a lógica: não precisamos saber se a regra já existe ou não.
        const sql = `
            INSERT INTO suporte_sla_politicas (prioridade, tempo_primeira_resposta_minutos, tempo_resolucao_minutos) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                tempo_primeira_resposta_minutos = VALUES(tempo_primeira_resposta_minutos),
                tempo_resolucao_minutos = VALUES(tempo_resolucao_minutos)
        `;

        for (const politica of politicas) {
            await connection.execute(sql, [
                politica.prioridade,
                politica.tempo_primeira_resposta_minutos,
                politica.tempo_resolucao_minutos
            ]);
        }

        await connection.commit();
        res.status(200).json({ message: 'Políticas de SLA salvas com sucesso!' });
    } catch (error) {
        await connection.rollback();
        console.error("Erro ao salvar políticas de SLA:", error.message);
        res.status(500).json({ error: 'Falha ao salvar políticas de SLA.' });
    } finally {
        connection.release();
    }
});

// ROTA PARA BUSCAR DADOS CONSOLIDADOS PARA O DASHBOARD DE RELATÓRIOS
router.get('/reports/main-dashboard', authMiddleware, permissionMiddleware(PERMISSOES_ADMIN_SUPORTE), async (req, res) => {
    try {
        const connection = await pool.getConnection();

        // 1. KPI de Performance de SLA
        const [slaData] = await connection.execute(`
            SELECT
                COUNT(id) AS total_resolvidos,
                SUM(CASE WHEN data_resolucao <= sla_prazo_resolucao THEN 1 ELSE 0 END) AS dentro_do_prazo
            FROM suporte_chamados
            WHERE status IN ('Resolvido', 'Fechado') AND sla_prazo_resolucao IS NOT NULL;
        `);
        const slaPerformance = slaData[0].total_resolvidos > 0
            ? (slaData[0].dentro_do_prazo / slaData[0].total_resolvidos) * 100
            : 100; // Se não houver chamados, SLA é 100%

        // 2. KPI de Satisfação do Cliente (CSAT)
        const [csatData] = await connection.execute(`
            SELECT AVG(nota) as media_csat FROM suporte_avaliacoes;
        `);
        const csatScore = csatData[0].media_csat || 0;

        // 3. Gráfico de Volume: Abertos vs Resolvidos nos últimos 30 dias
        const [volumeData] = await connection.execute(`
            WITH RECURSIVE dates AS (
                SELECT CURDATE() - INTERVAL 29 DAY as a_date
                UNION ALL
                SELECT a_date + INTERVAL 1 DAY FROM dates WHERE a_date < CURDATE()
            )
            SELECT 
                d.a_date AS dia,
                COUNT(DISTINCT c_abertos.id) AS abertos,
                COUNT(DISTINCT c_resolvidos.id) AS resolvidos
            FROM dates d
            LEFT JOIN suporte_chamados c_abertos ON DATE(c_abertos.criado_em) = d.a_date
            LEFT JOIN suporte_chamados c_resolvidos ON DATE(c_resolvidos.data_resolucao) = d.a_date
            GROUP BY d.a_date
            ORDER BY d.a_date ASC;
        `);

        // 4. Gráfico de Top 5 Categorias
        const [topCategoriasData] = await connection.execute(`
            SELECT 
                scat.nome,
                COUNT(sch.id) as total
            FROM suporte_chamados sch
            JOIN suporte_categorias scat ON sch.categoria_id = scat.id
            GROUP BY sch.categoria_id, scat.nome
            ORDER BY total DESC
            LIMIT 5;
        `);
        
        connection.release();

        res.json({
            kpis: {
                sla_performance: parseFloat(slaPerformance.toFixed(1)),
                csat_score: parseFloat(csatScore.toFixed(2))
            },
            charts: {
                volume_ultimos_30dias: {
                    labels: volumeData.map(d => format(new Date(d.dia), 'dd/MM')), // Usando date-fns no backend
                    datasets: [
                        { label: 'Abertos', data: volumeData.map(d => d.abertos), backgroundColor: 'rgba(54, 162, 235, 0.6)' },
                        { label: 'Resolvidos', data: volumeData.map(d => d.resolvidos), backgroundColor: 'rgba(75, 192, 192, 0.6)' }
                    ]
                },
                top_categorias: {
                    labels: topCategoriasData.map(c => c.nome),
                    datasets: [{
                        label: 'Total de Chamados',
                        data: topCategoriasData.map(c => c.total),
                        backgroundColor: [
                            'rgba(255, 99, 132, 0.6)',
                            'rgba(54, 162, 235, 0.6)',
                            'rgba(255, 206, 86, 0.6)',
                            'rgba(75, 192, 192, 0.6)',
                            'rgba(153, 102, 255, 0.6)',
                        ]
                    }]
                }
            }
        });

    } catch (error) {
        console.error("Erro ao gerar dados de relatórios:", error.message);
        res.status(500).json({ error: 'Falha ao gerar dados para os relatórios.' });
    }
});

// ROTA PARA BAIXAR O MODELO DE IMPORTAÇÃO (APENAS ADMIN GERAL)
    router.get('/modelo-importacao', authMiddleware, permissionMiddleware(PERMISSAO_APENAS_ADMIN_GERAL), async (req, res) => {
        try {
            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('Modelo de Importação');

            // Definindo os cabeçalhos
            worksheet.columns = [
                { header: 'Categoria', key: 'categoria', width: 30 },
                { header: 'Subcategoria', key: 'subcategoria', width: 40 },
                { header: 'Tipo Padrão (Categoria)', key: 'tipo', width: 20 },
                { header: 'Prioridade Padrão (Categoria)', key: 'prioridade', width: 25 },
                { header: 'Perfil de Destino Padrão (Categoria)', key: 'perfil_destino', width: 30 }
            ];
            
            // Adicionando uma linha de exemplo para guiar o usuário
            worksheet.addRow([
                'Financeiro', 
                'Problema no Boleto', 
                'Solicitação', 
                'Normal', 
                'financeiro'
            ]);
            worksheet.addRow([
                'Financeiro', 
                'Nota Fiscal não recebida', 
                'Solicitação', 
                'Normal', 
                'financeiro'
            ]);
            worksheet.addRow([
                'Problemas Técnicos', 
                '', // Exemplo de categoria sem subcategoria
                'Incidente', 
                'Alta', 
                'suporte_ti'
            ]);

            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            res.setHeader(
                'Content-Disposition',
                'attachment; filename="modelo_importacao_categorias.xlsx"'
            );

            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error("Erro ao gerar modelo de importação:", error.message);
            res.status(500).json({ error: 'Falha ao gerar o arquivo modelo.' });
        }
    });


    // ROTA PARA EXPORTAR CATEGORIAS E SUBCATEGORIAS (APENAS ADMIN GERAL)
    router.get('/exportar', authMiddleware, permissionMiddleware(PERMISSAO_APENAS_ADMIN_GERAL), async (req, res) => {
        try {
            const [categorias] = await pool.execute('SELECT * FROM suporte_categorias ORDER BY nome ASC');
            const [subcategorias] = await pool.execute('SELECT * FROM suporte_subcategorias ORDER BY nome ASC');
            
            const categoryMap = new Map(categorias.map(cat => [cat.id, cat]));
            
            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('Categorias Exportadas');

            worksheet.columns = [
                { header: 'Categoria', key: 'categoria', width: 30 },
                { header: 'Subcategoria', key: 'subcategoria', width: 40 },
                { header: 'Tipo Padrão (Categoria)', key: 'tipo', width: 20 },
                { header: 'Prioridade Padrão (Categoria)', key: 'prioridade', width: 25 },
                { header: 'Perfil de Destino Padrão (Categoria)', key: 'perfil_destino', width: 30 }
            ];

            const addedCategories = new Set();

            // Adiciona linhas para categorias que têm subcategorias
            for (const sub of subcategorias) {
                const parentCat = categoryMap.get(sub.categoria_id);
                if (parentCat) {
                    worksheet.addRow([
                        parentCat.nome,
                        sub.nome,
                        parentCat.tipo_padrao,
                        parentCat.prioridade_padrao,
                        parentCat.perfil_destino_padrao
                    ]);
                    addedCategories.add(parentCat.id);
                }
            }
            
            // Adiciona linhas para categorias que NÃO têm subcategorias
            for(const cat of categorias) {
                if(!addedCategories.has(cat.id)) {
                    worksheet.addRow([
                        cat.nome,
                        '', // Subcategoria vazia
                        cat.tipo_padrao,
                        cat.prioridade_padrao,
                        cat.perfil_destino_padrao
                    ]);
                }
            }

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="export_categorias_suporte.xlsx"');
            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error("Erro ao exportar categorias:", error.message);
            res.status(500).json({ error: 'Falha ao exportar os dados.' });
        }
    });

    // ROTA PARA IMPORTAR CATEGORIAS E SUBCATEGORIAS (APENAS ADMIN GERAL)
    router.post('/importar', authMiddleware, permissionMiddleware(PERMISSAO_APENAS_ADMIN_GERAL), upload.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const workbook = new exceljs.Workbook();
            await workbook.xlsx.load(req.file.buffer);
            const worksheet = workbook.getWorksheet(1);
            
            let createdCategories = 0;
            let createdSubcategories = 0;
            const categoryCache = new Map(); // Cache para evitar SELECTs repetidos no DB

            // Itera pelas linhas (pula o cabeçalho)
            for (let i = 2; i <= worksheet.rowCount; i++) {
                const row = worksheet.getRow(i);
                const nomeCategoria = row.getCell(1).value?.toString().trim();
                const nomeSubcategoria = row.getCell(2).value?.toString().trim();
                const tipoPadrao = row.getCell(3).value?.toString().trim() || 'Incidente';
                const prioridadePadrao = row.getCell(4).value?.toString().trim() || 'Normal';
                const perfilDestino = row.getCell(5).value?.toString().trim() || null;

                if (!nomeCategoria) continue; // Pula linha se a categoria principal estiver vazia

                let categoriaId;

                // 1. Processa a Categoria Principal
                if (categoryCache.has(nomeCategoria.toLowerCase())) {
                    categoriaId = categoryCache.get(nomeCategoria.toLowerCase());
                } else {
                    const [existingCat] = await connection.execute('SELECT id FROM suporte_categorias WHERE LOWER(nome) = ?', [nomeCategoria.toLowerCase()]);
                    
                    if (existingCat.length > 0) {
                        categoriaId = existingCat[0].id;
                        // Opcional: Atualizar os dados da categoria se ela já existe
                        await connection.execute(
                            'UPDATE suporte_categorias SET tipo_padrao = ?, prioridade_padrao = ?, perfil_destino_padrao = ? WHERE id = ?',
                            [tipoPadrao, prioridadePadrao, perfilDestino, categoriaId]
                        );

                    } else {
                        const [result] = await connection.execute(
                            'INSERT INTO suporte_categorias (nome, tipo_padrao, prioridade_padrao, perfil_destino_padrao) VALUES (?, ?, ?, ?)',
                            [nomeCategoria, tipoPadrao, prioridadePadrao, perfilDestino]
                        );
                        categoriaId = result.insertId;
                        createdCategories++;
                    }
                    categoryCache.set(nomeCategoria.toLowerCase(), categoriaId);
                }

                // 2. Processa a Subcategoria (se houver)
                if (nomeSubcategoria) {
                    const [existingSub] = await connection.execute('SELECT id FROM suporte_subcategorias WHERE LOWER(nome) = ? AND categoria_id = ?', [nomeSubcategoria.toLowerCase(), categoriaId]);
                    
                    if (existingSub.length === 0) {
                        await connection.execute(
                            'INSERT INTO suporte_subcategorias (nome, categoria_id) VALUES (?, ?)',
                            [nomeSubcategoria, categoriaId]
                        );
                        createdSubcategories++;
                    }
                }
            }

            await connection.commit();
            res.status(200).json({ message: `Importação concluída! ${createdCategories} novas categorias e ${createdSubcategories} novas subcategorias foram criadas.` });

        } catch (error) {
            await connection.rollback();
            console.error("Erro ao importar categorias:", error.message);
            res.status(500).json({ error: 'Ocorreu um erro durante a importação. Nenhuma alteração foi salva.', details: error.message });
        } finally {
            connection.release();
        }
    });

    return router;
};