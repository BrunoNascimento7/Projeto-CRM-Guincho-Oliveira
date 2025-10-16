// backend/routes/routesClients.js
const express = require('express');
const router = express.Router();
const XLSX = require('xlsx'); // Precisamos do XLSX aqui agora
const { enviarSms, formatarTelefone } = require('../services/smsService'); 

// Esta função recebe as dependências e retorna o router configurado
module.exports = (dependencies) => {
    // Extrai as dependências que vamos usar
 const {
    pool,
    authMiddleware,
    permissionMiddleware,
    adminGeralMiddleware,
    registrarLog,
    Parser,
    uploadInMemory,
    PERMISSAO_CLIENTES_CRUD // <<-- ADICIONE ESTA LINHA
} = dependencies;

    // --- ROTAS DE CLIENTES ---

    // GET /api/clients/ -> Rota para LISTAR todos os clientes
    // 🚀 NOVA ROTA OTIMIZADA para LISTAR clientes com PAGINAÇÃO e mais DADOS
router.get('/', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional', 'financeiro']), async (req, res) => {
    // Garantimos que limit e offset são números inteiros seguros
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    
    const { query } = req.query;

    let params = [];
    let whereClause = '';

    if (query) {
        whereClause = 'WHERE c.nome LIKE ? OR c.cpf_cnpj LIKE ? OR c.telefone LIKE ?';
        const searchTerm = `%${query}%`;
        params = [searchTerm, searchTerm, searchTerm];
    }
    
    try {
        // --- Consulta de Contagem (não muda, já estava correta) ---
        const countSql = `SELECT COUNT(DISTINCT c.id) as total FROM clientes c LEFT JOIN ordens_servico os ON c.id = os.cliente_id ${whereClause}`;
        const [totalResult] = await pool.execute(countSql, params);
        const total = totalResult[0].total;

        // --- Consulta de Dados (COM A CORREÇÃO FINAL) ---
        const dataSql = `
            SELECT 
                c.id, c.nome, c.telefone, c.email, c.endereco, c.cpf_cnpj,
                COUNT(os.id) as total_servicos,
                MAX(os.data_conclusao) as ultimo_servico
            FROM clientes c
            LEFT JOIN ordens_servico os ON c.id = os.cliente_id
            ${whereClause}
            GROUP BY c.id, c.nome, c.telefone, c.email, c.endereco, c.cpf_cnpj
            ORDER BY c.nome ASC
            LIMIT ${limit} OFFSET ${offset} 
        `; // <<<<<<< A MUDANÇA CRÍTICA ESTÁ AQUI: Injetamos os números diretamente
        
        // Agora, os parâmetros são apenas os da cláusula WHERE
        const [rows] = await pool.execute(dataSql, params); 

        // Retorna a resposta
        res.json({
            data: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        console.error("ERRO FINAL:", err);
        res.status(500).json({ error: 'Falha ao buscar clientes.' });
    }
});

// GET /api/clients/list-for-simulator -> Rota para buscar TODOS os clientes para o dropdown
router.get('/list-for-simulator', authMiddleware, async (req, res) => {
    try {
        // Seleciona apenas os campos necessários, sem paginação.
        const sql = 'SELECT id, nome, cpf_cnpj, telefone FROM clientes ORDER BY nome ASC';
        const [clientes] = await pool.execute(sql);
        
        // Retorna a lista de clientes como um JSON array simples, que o front-end espera.
        res.json(clientes);

    } catch (error) {
        console.error("Erro ao buscar clientes para o simulador:", error.message);
        res.status(500).json({ error: 'Falha ao buscar a lista de clientes.' });
    }
});

    // POST /api/clients/ -> Rota para CRIAR um novo cliente
    router.post('/', authMiddleware, permissionMiddleware(PERMISSAO_CLIENTES_CRUD), async (req, res) => {
        const { nome, telefone, email, endereco, cpf_cnpj } = req.body;
        const sql = `INSERT INTO clientes (nome, telefone, email, endereco, cpf_cnpj) VALUES (?, ?, ?, ?, ?)`;
        try {
            const [result] = await pool.execute(sql, [nome, telefone, email, endereco, cpf_cnpj]);
            const detalhes = `Cliente: ${nome}, ID: ${result.insertId}`;
            await registrarLog(req.user.id, req.user.nome, 'CLIENTE_CRIADO', detalhes);
            res.status(201).json({ id: result.insertId, nome, message: 'Cliente criado com sucesso!' });
        } catch (err) {
            console.error("Erro ao criar cliente:", err.message);
            res.status(500).json({ error: 'Falha ao criar cliente.' });
        }
    });

    // PUT /api/clients/:id -> Rota para ATUALIZAR um cliente
    router.put('/:id', authMiddleware, permissionMiddleware(PERMISSAO_CLIENTES_CRUD), async (req, res) => {
        const { nome, telefone, email, endereco, cpf_cnpj } = req.body;
        const sql = `UPDATE clientes SET nome = ?, telefone = ?, email = ?, endereco = ?, cpf_cnpj = ? WHERE id = ?`;
        try {
            const [result] = await pool.execute(sql, [nome, telefone, email, endereco, cpf_cnpj, req.params.id]);
            const detalhes = `Cliente ID ${req.params.id} (${nome}) foi atualizado.`;
            await registrarLog(req.user.id, req.user.nome, 'CLIENTE_ATUALIZADO', detalhes);
            res.json({ updated: result.affectedRows > 0, message: 'Cliente atualizado com sucesso.' });
        } catch (err) {
            console.error("Erro ao atualizar cliente:", err.message);
            res.status(500).json({ error: 'Falha ao atualizar cliente.' });
        }
    });

    // DELETE /api/clients/:id -> Rota para DELETAR um cliente
    router.delete('/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        try {
            // Futuramente, verificar se o cliente não tem OS atreladas antes de excluir
            const [result] = await pool.execute('DELETE FROM clientes WHERE id = ?', [req.params.id]);
            if (result.affectedRows > 0) {
                const detalhes = `Cliente ID ${req.params.id} foi excluído.`;
                await registrarLog(req.user.id, req.user.nome, 'CLIENTE_EXCLUIDO', detalhes);
                res.json({ deleted: true, message: 'Cliente excluído com sucesso.' });
            } else {
                res.status(404).json({ error: 'Cliente não encontrado.' });
            }
        } catch (err) {
            console.error("Erro ao deletar cliente:", err.message);
            res.status(500).json({ error: 'Falha ao excluir cliente. Pode estar associado a outros registros.' });
        }
    });

    // GET /api/clients/export -> Rota para EXPORTAR clientes
    router.get('/export', authMiddleware, adminGeralMiddleware, async (req, res) => {
    const { format = 'csv' } = req.query; // Pega o formato da query, padrão para 'csv'

    try {
        // A busca no banco é a mesma para ambos os formatos
        const [clientes] = await pool.execute('SELECT nome, telefone, email, endereco, cpf_cnpj FROM clientes ORDER BY nome ASC');
        if (clientes.length === 0) {
            return res.status(404).json({ error: 'Nenhum cliente para exportar.' });
        }

        await registrarLog(req.user.id, req.user.nome, 'CLIENTES_EXPORTADOS', `${clientes.length} clientes exportados para ${format.toUpperCase()}.`);

        if (format === 'xlsx') {
            const worksheet = XLSX.utils.json_to_sheet(clientes);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');
            
            // Escreve o arquivo em um buffer na memória
            const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            
            res.setHeader('Content-Disposition', 'attachment; filename="clientes_exportados.xlsx"');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);

        } else { // O padrão é CSV
            const json2csvParser = new Parser({ fields: ['nome', 'telefone', 'email', 'endereco', 'cpf_cnpj'] });
            const csv = json2csvParser.parse(clientes);
            res.header('Content-Type', 'text/csv');
            res.attachment('clientes_exportados.csv');
            res.send(csv);
        }

    } catch (err) {
        console.error("Erro ao exportar clientes:", err);
        res.status(500).json({ error: 'Falha ao exportar clientes.' });
    }
});

    // POST /api/clients/import -> Rota para IMPORTAR clientes
    router.post('/import', authMiddleware, adminGeralMiddleware, uploadInMemory.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }
        const connection = await pool.getConnection();
        try {
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, {
                header: ['nome', 'telefone', 'email', 'endereco', 'cpf_cnpj'],
                range: 1,
                defval: null
            });
            if (data.length === 0) {
                return res.status(400).json({ error: 'O arquivo está vazio ou o formato está incorreto.' });
            }
            await connection.beginTransaction();
            const clientesParaInserir = data.map(row => [row.nome, row.telefone, row.email, row.endereco, row.cpf_cnpj]);
            const sql = `INSERT INTO clientes (nome, telefone, email, endereco, cpf_cnpj) VALUES ?`;
            const [result] = await connection.query(sql, [clientesParaInserir]);
            const insertedCount = result.affectedRows;
            await connection.commit();
            await registrarLog(req.user.id, req.user.nome, 'CLIENTES_IMPORTADOS', `${insertedCount} clientes importados via planilha.`);
            res.json({
                message: `Importação concluída. ${insertedCount} clientes inseridos.`,
                inserted: insertedCount,
                totalRecords: data.length
            });
        } catch (err) {
            await connection.rollback();
            console.error("Erro na importação de clientes:", err);
            res.status(500).json({ error: `Falha na importação. Verifique se as colunas estão corretas. Detalhe: ${err.message}` });
        } finally {
            connection.release();
        }
    });

    router.get('/:id/details', authMiddleware, async (req, res) => {
    const { id: clienteId } = req.params;

    try {
        // Precisamos fazer uma consulta SQL mais complexa para calcular tudo
        // Assumimos que a tabela `financeiro` tem uma coluna `os_id`
        // e que custos são lançados com `tipo = 'Despesa'`
        const sql = `
            SELECT
                c.*,
                COUNT(os.id) AS total_servicos,
                SUM(os.valor) AS faturamento_total,
                (
                    SELECT SUM(f.valor) 
                    FROM financeiro f 
                    WHERE f.os_id IN (SELECT id FROM ordens_servico WHERE cliente_id = c.id) 
                    AND f.tipo = 'Despesa'
                ) AS custo_total_servicos,
                MIN(os.data_criacao) AS primeiro_servico_data,
                MAX(os.data_criacao) AS ultimo_servico_data,
                DATEDIFF(NOW(), MAX(os.data_criacao)) AS dias_desde_ultimo_servico
            FROM
                clientes c
            LEFT JOIN
                ordens_servico os ON c.id = os.cliente_id
            WHERE
                c.id = ?
            GROUP BY
                c.id;
        `;

        const [detailsResult] = await pool.execute(sql, [clienteId]);

        if (detailsResult.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const details = detailsResult[0];

        // Calcular Lucro e Percentual no backend para entregar pronto
        const faturamento = parseFloat(details.faturamento_total || 0);
        const custo = parseFloat(details.custo_total_servicos || 0);
        const lucro = faturamento - custo;
        
        // Evita divisão por zero
        const percentual_lucro = faturamento > 0 ? (lucro / faturamento) * 100 : 0;

        // Adiciona os cálculos ao objeto de resposta
        details.lucro_total = lucro;
        details.percentual_lucro = percentual_lucro;

        // Bônus: Buscar o histórico de serviços separadamente para a lista
        const [historicoServicos] = await pool.execute(
            'SELECT id, descricao, status, valor, data_criacao FROM ordens_servico WHERE cliente_id = ? ORDER BY data_criacao DESC',
            [clienteId]
        );

        // Registrar o log de visualização
        await registrarLog(
            req.user.id,
            req.user.nome,
            'CLIENTE_VISUALIZADO',
            `Visualizou os detalhes do cliente ID ${clienteId} (${details.nome}).`
        );
        
        res.json({
            details,
            history: historicoServicos
        });

    } catch (error) {
        console.error("Erro ao buscar detalhes do cliente:", error);
        res.status(500).json({ error: 'Falha ao carregar detalhes do cliente.' });
    }
});

// SUBSTITUA a sua rota /:id/comunicacao por esta versão completa
router.post('/:id/comunicacao', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional', 'financeiro']), async (req, res) => {
    const { id: clienteId } = req.params;
    const { tipo, mensagem } = req.body;

    if (!tipo || !mensagem) {
        return res.status(400).json({ error: 'Tipo de comunicação e mensagem são obrigatórios.' });
    }
    
    if (tipo.toUpperCase() === 'SMS') {
        try {
            const [rows] = await pool.execute('SELECT nome, telefone FROM clientes WHERE id = ?', [clienteId]);
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Cliente não encontrado.' });
            }
            const cliente = rows[0];

            const telefoneFormatado = formatarTelefone(cliente.telefone);
            if (!telefoneFormatado) {
                return res.status(400).json({ error: 'O cliente não possui um número de telefone válido para envio de SMS.' });
            }

            await enviarSms([telefoneFormatado], mensagem);

            const detalhes = `SMS enviado para o cliente ${cliente.nome} (ID: ${clienteId}).`;
            await registrarLog(req.user.id, req.user.nome, 'COMUNICACAO_CLIENTE', detalhes);

            return res.status(200).json({ message: 'SMS enviado com sucesso!' });

        } catch (error) {
            console.error("Erro no processo de envio de SMS individual:", error.message);
            const detalhes = `Falha ao enviar SMS para o cliente ID ${clienteId}. Erro: ${error.message}`;
            await registrarLog(req.user.id, req.user.nome, 'ERRO_COMUNICACAO', detalhes);
            return res.status(500).json({ error: 'Falha ao enviar SMS.' });
        }
    }
    
    if (tipo.toUpperCase() === 'EMAIL') {
        return res.status(501).json({ message: 'Envio de e-mail ainda não implementado.' });
    }

    return res.status(400).json({ error: `Tipo de comunicação '${tipo}' não suportado.` });
});

// backend/routes/routesClients.js

// ATUALIZE a rota /send-sms-mass com este novo código
router.post('/send-sms-mass', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro']), async (req, res) => {
    const { clientIds, mensagem: mensagemTemplate } = req.body;

    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
        return res.status(400).json({ error: 'O campo "clientIds" deve ser uma lista de IDs de clientes.' });
    }
    if (!mensagemTemplate) {
        return res.status(400).json({ error: 'O campo "mensagem" é obrigatório.' });
    }

    let sucessos = 0, falhas = 0;
    const errosDetalhados = [];

    try {
        // 1. Buscar todas as tags dinâmicas do banco
        const [tagsResult] = await pool.execute('SELECT tag_nome, tag_valor FROM configuracao_tags');
        const tagsDinamicas = {};
        tagsResult.forEach(tag => {
            tagsDinamicas[tag.tag_nome] = tag.tag_valor;
        });

        // 2. Buscar informações dos clientes selecionados
        const sql = 'SELECT id, nome, telefone FROM clientes WHERE id IN (?)';
        const [clientes] = await pool.query(sql, [clientIds]);

        if (clientes.length === 0) {
            return res.status(404).json({ error: 'Nenhum cliente foi encontrado para os IDs fornecidos.' });
        }

        // 3. Loop de envio com substituição de MÚLTIPLAS tags
        for (const cliente of clientes) {
            const telefoneFormatado = formatarTelefone(cliente.telefone);
            if (telefoneFormatado) {
                try {
                    let mensagemPersonalizada = mensagemTemplate;
                    
                    // Substitui tags do cliente
                    mensagemPersonalizada = mensagemPersonalizada.replace(/{{nome_cliente}}/g, cliente.nome.split(' ')[0]);

                    // Substitui tags globais (da empresa, etc.)
                    for (const tagName in tagsDinamicas) {
                        const regex = new RegExp(`{{${tagName}}}`, 'g');
                        mensagemPersonalizada = mensagemPersonalizada.replace(regex, tagsDinamicas[tagName]);
                    }

                    await enviarSms([telefoneFormatado], mensagemPersonalizada);
                    sucessos++;
                } catch (error) {
                    falhas++;
                    errosDetalhados.push(`Cliente ID ${cliente.id}: ${error.message}`);
                }
            } else {
                falhas++;
                errosDetalhados.push(`Cliente ID ${cliente.id}: Telefone inválido ou ausente.`);
            }
        }
        
        const detalhes = `Campanha de SMS finalizada. ${sucessos} envios com sucesso, ${falhas} falhas.`;
        await registrarLog(req.user.id, req.user.nome, 'COMUNICACAO_EM_MASSA', detalhes);

        res.status(200).json({ message: 'Campanha processada.', enviados: sucessos, falhas, solicitados: clientIds.length, erros: errosDetalhados });

    } catch (error) {
        console.error("Erro crítico no envio em massa:", error.message);
        await registrarLog(req.user.id, req.user.nome, 'ERRO_COMUNICACAO_MASSA', `Erro: ${error.message}`);
        res.status(500).json({ error: 'Falha crítica ao processar a campanha de SMS.' });
    }
});

    return router;
};