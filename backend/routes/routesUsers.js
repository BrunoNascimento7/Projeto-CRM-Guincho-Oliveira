const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken'); 

// Esta função recebe as dependências do server.js e retorna o roteador configurado
module.exports = (dependencies) => {
    // 1. Desestruturamos todas as dependências que as rotas de usuário precisam
    const {
        pool,
        bcrypt,
        jwt,
        SECRET_KEY,
        authMiddleware,
        permissionMiddleware,
        adminGeralMiddleware,
        upload, // Multer para a foto de perfil
        registrarLog,
        enviarNotificacaoSenhaAlterada,
        sesClient,
        SendEmailCommand,
        crypto
    } = dependencies;

    const router = express.Router();

    // ===================================================
    // --- ROTAS DE AUTENTICAÇÃO E REGISTRO ---
    // (Prefixadas com /api/usuarios no server.js)
    // ===================================================

    router.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        // --- REMOVIDO: A verificação antiga de "modo_manutencao" foi removida daqui ---

        const [userRows] = await pool.execute(
            `SELECT u.*, cs.nome_empresa, cs.logo_url, cs.status as cliente_status, u.precisa_trocar_senha
             FROM usuarios u 
             LEFT JOIN clientes_sistema cs ON u.cliente_id = cs.id 
             WHERE u.email = ?`,
            [email]
        );
        const user = userRows[0];
        
        if (!user) {
            await registrarLog(null, `IP: ${req.ip}`, 'LOGIN_FALHA', `Tentativa com email inexistente: ${email}`);
            return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }

        // +++ ADICIONADO: Nova verificação de manutenção agendada (GMUD) +++
        // Verifica se há uma manutenção "em_andamento" para o cliente deste usuário ou uma global.
        const [[activeMaintenance]] = await pool.execute(
            `SELECT id, data_fim FROM manutencoes_agendadas 
             WHERE status = 'em_andamento' AND (cliente_id = ? OR cliente_id IS NULL)`,
            [user.cliente_id]
        );

        // Se encontrar uma manutenção ativa E o usuário não for o admin_geral, bloqueia o login.
        if (activeMaintenance && user.perfil !== 'admin_geral') {
            await registrarLog(user.id, user.nome, 'LOGIN_FALHA', 'Tentativa de login durante manutenção agendada.');
            return res.status(403).json({ 
                error: 'O sistema está em manutenção. Tente novamente mais tarde.',
                maintenance: true, 
                endDate: activeMaintenance.data_fim
            });
        }
        // --- FIM DA NOVA VERIFICAÇÃO ---
        
        // --- MANTIDO: Restante da sua lógica de login original ---
        if (user.perfil !== 'admin_geral' && user.cliente_status === 'suspenso') {
            return res.status(403).json({ error: 'A licença para sua empresa foi suspensa. Contate o suporte.' });
        }

        if (user.status === 'bloqueado') {
            await registrarLog(user.id, user.nome, 'LOGIN_FALHA', 'Tentativa de login por usuário bloqueado.');
            return res.status(403).json({ error: 'Este usuário está bloqueado. Contate o administrador.' });
        }
        
        const valid = await bcrypt.compare(senha, user.senha);
        if (!valid) {
            await registrarLog(user.id, user.nome, 'LOGIN_FALHA', 'Tentativa de login com senha incorreta.');
            return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }

        if (user.perfil !== 'admin_geral' && !user.licenca_chave_id) {
            await registrarLog(user.id, user.nome, 'LOGIN_FALHA', 'Tentativa de login sem licença de software atribuída.');
            return res.status(403).json({ error: 'Acesso negado. Nenhuma licença de software foi atribuída a este usuário.' });
        }

        if (user.regras_acesso && user.regras_acesso.dias && user.regras_acesso.dias.length > 0) {
            const now = new Date();
            const diaDaSemana = now.getDay();
            const horaAtual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            
            const temPermissaoDia = user.regras_acesso.dias.includes(diaDaSemana);
            const temPermissaoHora = horaAtual >= user.regras_acesso.inicio && horaAtual <= user.regras_acesso.fim;

            if (!temPermissaoDia || !temPermissaoHora) {
                await registrarLog(user.id, user.nome, 'LOGIN_FALHA', 'Tentativa de acesso fora do dia ou horário permitido.');
                return res.status(403).json({ error: 'Acesso negado. Você está tentando logar fora do seu horário de trabalho permitido.' });
            }
        }

        if (user.precisa_trocar_senha) {
            return res.json({
                needsPasswordChange: true,
                userId: user.id,
                message: 'Por favor, altere sua senha para continuar.'
            });
        }
        
        try {
            await pool.execute('UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?', [user.id]);
        } catch (updateError) {
            console.error("Falha ao atualizar 'ultimo_acesso':", updateError);
        }

        await pool.execute('UPDATE usuarios SET last_logout_at = NULL WHERE id = ?', [user.id]);
        await registrarLog(user.id, user.nome, 'LOGIN_SUCESSO');

        const [motoristaRows] = await pool.execute('SELECT id FROM motoristas WHERE email = ?', [email]);
        const motoristaId = motoristaRows.length > 0 ? motoristaRows[0].id : null;

        const token = jwt.sign(
            { id: user.id, perfil: user.perfil, motoristaId: motoristaId }, 
            SECRET_KEY, 
            { expiresIn: '8h' }
        );
        
        res.json({ 
            token, 
            id: user.id, 
            nome: user.nome, 
            perfil: user.perfil, 
            cliente_id: user.cliente_id,
            motoristaId: motoristaId,
            tema: user.tema,
            foto_perfil: user.foto_perfil,
            nome_empresa: user.nome_empresa, 
            logo_url: user.logo_url 
        });

    } catch (err) {
        console.error("Erro no login:", err.message);
        res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
    }
});

 // ===== ROTA FALTANDO ADICIONADA AQUI =====
    // ROTA PARA BUSCAR DADOS COMPLETOS COM STATS PARA A PÁGINA "MEU PERFIL"
    router.get('/perfil', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // Query 1: CORRIGIDA - Removido o campo 'data_criacao' que não existe.
        const userSql = 'SELECT id, nome, email, telefone, perfil, foto_perfil FROM usuarios WHERE id = ?';
        const [userRows] = await pool.execute(userSql, [userId]);

        if (userRows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        const perfilData = userRows[0];

        // Queries 2 e 3 de estatísticas (sem alterações)
        const osResolvidasSql = "SELECT COUNT(id) as total FROM ordens_servico WHERE status = 'Concluído' AND concluido_por_usuario_id = ?";
        const [osResolvidasRows] = await pool.execute(osResolvidasSql, [userId]);
        
        const osCriadasSql = "SELECT COUNT(id) as total FROM ordens_servico WHERE criado_por_usuario_id = ?";
        const [osCriadasRows] = await pool.execute(osCriadasSql, [userId]);

        // Montagem da resposta final
        const response = {
            ...perfilData,
            stats: {
                os_resolvidas: (osResolvidasRows[0] && osResolvidasRows[0].total) || 0,
                os_criadas: (osCriadasRows[0] && osCriadasRows[0].total) || 0,
            }
        };

        res.json(response);

    } catch (error) {
        console.error("Erro ao buscar dados do perfil:", error);
        res.status(500).json({ error: 'Falha ao buscar dados do perfil.' });
    }
});


    // ROTA PARA BUSCAR DADOS COMPLETOS DO PERFIL DO USUÁRIO LOGADO
    router.get('/me', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`[LOG] Rota /api/usuarios/me acessada para o usuário ID: ${userId}`);

        // A query original está boa, vamos mantê-la.
        const sql = `
            SELECT 
                u.id, u.nome, u.email, u.perfil, u.cliente_id, u.matricula, 
                u.cpf, u.filial, u.cargo, u.centroDeCusto, u.foto_perfil, u.tema, 
                cs.nome_empresa, cs.logo_url 
            FROM usuarios u
            LEFT JOIN clientes_sistema cs ON u.cliente_id = cs.id
            WHERE u.id = ?
        `;
        const [rows] = await pool.execute(sql, [userId]);
        
        if (rows.length === 0) {
            console.error(`[ERRO] Usuário com token válido (ID: ${userId}) não foi encontrado no banco de dados.`);
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        const user = rows[0];

        // Lógica de segurança: Garante que os campos sempre existam no objeto de resposta
        // Isso evita erros no frontend caso um admin_geral (sem cliente) faça login
        if (!user.nome_empresa) {
            user.nome_empresa = 'Administração Geral'; // Ou qualquer valor padrão
        }
        if (!user.logo_url) {
            user.logo_url = null; // Garante que seja nulo e não undefined
        }

        // Lógica para converter a imagem de perfil (mantida)
        if (user.foto_perfil && Buffer.isBuffer(user.foto_perfil)) {
            const base64Image = user.foto_perfil.toString('base64');
            user.foto_perfil = `data:image/jpeg;base64,${base64Image}`;
        }
        
        res.json(user);

    } catch (err) {
        console.error("[ERRO CRÍTICO] Falha na rota /api/usuarios/me:", err);
        res.status(500).json({ error: 'Falha grave ao buscar dados do perfil.' });
    }
});

    // ROTA PARA ATUALIZAR DADOS BÁSICOS (E-MAIL E TELEFONE)
    router.put('/perfil', authMiddleware, async (req, res) => {
        try {
            const userId = req.user.id;
            const { email, telefone } = req.body;

            if (!email) {
                return res.status(400).json({ error: 'O e-mail é obrigatório.' });
            }

            // Opcional: Verificar se o novo e-mail já não está em uso por outro usuário
            const [existingUser] = await pool.execute(
                'SELECT id FROM usuarios WHERE email = ? AND id != ?',
                [email, userId]
            );

            if (existingUser.length > 0) {
                return res.status(409).json({ error: 'Este e-mail já está em uso por outra conta.' });
            }

            const sql = 'UPDATE usuarios SET email = ?, telefone = ? WHERE id = ?';
            await pool.execute(sql, [email, telefone || null, userId]);

            res.json({ message: 'Perfil atualizado com sucesso!' });
        } catch (error) {
            console.error("Erro ao atualizar perfil:", error);
            res.status(500).json({ error: 'Falha ao atualizar o perfil.' });
        }
    });

    // ROTA SEGURA PARA ALTERAÇÃO DE SENHA
    router.put('/perfil/senha', authMiddleware, async (req, res) => {
        try {
            const userId = req.user.id;
            const { senhaAtual, novaSenha } = req.body;

            if (!senhaAtual || !novaSenha) {
                return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
            }

            // 1. Buscar a senha atual do usuário no banco
            const [userRows] = await pool.execute('SELECT senha FROM usuarios WHERE id = ?', [userId]);
            if (userRows.length === 0) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }
            const hashSenhaAtual = userRows[0].senha;

            // 2. Comparar a senha fornecida com a do banco
            const senhaValida = await bcrypt.compare(senhaAtual, hashSenhaAtual);
            if (!senhaValida) {
                return res.status(401).json({ error: 'A senha atual está incorreta.' });
            }

            // 3. Gerar o hash da nova senha
            const hashNovaSenha = await bcrypt.hash(novaSenha, 10);

            // 4. Atualizar a senha no banco
            await pool.execute('UPDATE usuarios SET senha = ? WHERE id = ?', [hashNovaSenha, userId]);

            res.json({ message: 'Senha alterada com sucesso!' });

        } catch (error) {
            console.error("Erro ao alterar senha:", error);
            res.status(500).json({ error: 'Falha ao alterar a senha.' });
        }
    });

    router.get('/teste-perfil', (req, res) => {
        console.log("!!! A ROTA DE TESTE FOI ACESSADA !!!");
        res.send('A rota de teste DENTRO de userRoutes funciona!');
    });

    // CORREÇÃO: Removido o prefixo '/api/usuarios'
    router.post('/set-initial-password', async (req, res) => {
        const { userId, newPassword } = req.body;

        if (!userId || !newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Dados inválidos. A senha deve ter no mínimo 6 caracteres.' });
        }

        try {
            const hash = await bcrypt.hash(newPassword, 10);
            await pool.execute(
                'UPDATE usuarios SET senha = ?, precisa_trocar_senha = FALSE WHERE id = ?',
                [hash, userId]
            );
            res.json({ message: 'Senha atualizada com sucesso! Por favor, faça o login novamente.' });
        } catch (error) {
            console.error("Erro ao definir senha inicial:", error);
            res.status(500).json({ error: 'Falha ao atualizar a senha.' });
        }
    });

    router.post('/logout', authMiddleware, async (req, res) => {
        await registrarLog(req.user.id, req.user.nome, 'LOGOUT');
        res.status(200).json({ message: 'Logout registrado com sucesso.' });
    });

    router.post('/register', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const { nome, email, senha, perfil, matricula, cpf, filial, cargo, centroDeCusto } = req.body;
        const { id: creatorId, nome: creatorNome, perfil: creatorPerfil, cliente_id: creatorClienteId } = req.user;
        
        let clienteIdParaNovoUsuario = null;
        if (perfil === 'admin_geral') {
            clienteIdParaNovoUsuario = null;
        } else if (creatorPerfil === 'admin_geral') {
            clienteIdParaNovoUsuario = req.body.cliente_id;
        } else {
            clienteIdParaNovoUsuario = creatorClienteId;
        }

        if (perfil !== 'admin_geral' && !clienteIdParaNovoUsuario) {
            return res.status(400).json({ error: 'ID do cliente não especificado para este perfil de usuário.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            if (perfil !== 'admin_geral') {
                const [[{ used }]] = await connection.execute('SELECT COUNT(id) as used FROM usuarios WHERE cliente_id = ? AND licenca_chave_id IS NOT NULL', [clienteIdParaNovoUsuario]);
                const [[{ max_licencas }]] = await connection.execute('SELECT max_licencas FROM clientes_sistema WHERE id = ?', [clienteIdParaNovoUsuario]);
                if (used >= max_licencas) {
                    await connection.rollback();
                    connection.release();
                    return res.status(403).json({ error: 'Limite de licenças atingido. Não é possível adicionar novos usuários.' });
                }
            }
            
            const hash = await bcrypt.hash(senha, 10);
            const sql = `INSERT INTO usuarios (nome, email, senha, perfil, matricula, cpf, filial, cargo, centroDeCusto, cliente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await connection.execute(sql, [nome, email, hash, perfil, matricula, cpf, filial, cargo, centroDeCusto, clienteIdParaNovoUsuario]);
            
            await connection.commit();
            
            await registrarLog(creatorId, creatorNome, 'USUARIO_CRIADO', `Novo usuário: ${nome} (ID: ${result.insertId}, Perfil: ${perfil})`);
            res.status(201).json({ id: result.insertId });

        } catch (err) {
            await connection.rollback();
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Este email já está cadastrado.' });
            }
            console.error("Erro ao registrar usuário:", err.message);
            res.status(500).json({ error: 'Falha ao registrar novo usuário.' });
        } finally {
            connection.release();
        }
    });

    // CORREÇÃO: Removido o prefixo '/api/usuarios'. Mantida a versão mais completa desta rota.
    router.post('/import', authMiddleware, adminGeralMiddleware, async (req, res) => {
        const { users, cliente_id } = req.body;
        
        if (!cliente_id) {
            return res.status(400).json({ error: 'É necessário especificar um cliente para importar os usuários.' });
        }

        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            const [availableKeys] = await connection.execute(
                'SELECT id FROM licenca_chaves WHERE cliente_id = ? AND usuario_id_alocado IS NULL ORDER BY id ASC',
                [cliente_id]
            );
            
            let keysToAllocate = availableKeys.map(k => k.id);

            for (const user of users) {
                try {
                    const [[{ used }]] = await connection.execute("SELECT COUNT(id) as used FROM usuarios WHERE cliente_id = ?", [cliente_id]);
                    const [[{ max_licencas }]] = await connection.execute('SELECT max_licencas FROM clientes_sistema WHERE id = ?', [cliente_id]);

                    if (used >= max_licencas) {
                        throw new Error('Limite máximo de licenças do cliente atingido.');
                    }

                    let senhaParaSalvar = user.Senha;
                    let precisaTrocarSenha = false;

                    if (!senhaParaSalvar) {
                        senhaParaSalvar = crypto.randomBytes(8).toString('hex');
                        precisaTrocarSenha = true;
                    }

                    const hash = await bcrypt.hash(senhaParaSalvar.toString(), 10);
                    
                    const sqlInsertUser = `INSERT INTO usuarios (nome, email, senha, perfil, matricula, cpf, filial, cargo, centroDeCusto, cliente_id, precisa_trocar_senha) 
                                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                    
                    const [result] = await connection.execute(sqlInsertUser, [
                        user.Nome, user.Email, hash, user.Perfil, user.Matrícula, user.CPF, 
                        user.Filial, user.Cargo, user['Centro de Custo'], cliente_id, precisaTrocarSenha
                    ]);

                    const newUserId = result.insertId;

                    if (keysToAllocate.length > 0) {
                        const keyIdToAllocate = keysToAllocate.shift();
                        await connection.execute(
                            'UPDATE licenca_chaves SET usuario_id_alocado = ?, data_alocacao = NOW() WHERE id = ?',
                            [newUserId, keyIdToAllocate]
                        );
                        await connection.execute(
                            'UPDATE usuarios SET licenca_chave_id = ? WHERE id = ?',
                            [keyIdToAllocate, newUserId]
                        );
                    }
                    
                    successCount++;

                } catch (err) {
                    errorCount++;
                    errors.push({ email: user.Email, reason: err.code === 'ER_DUP_ENTRY' ? 'Email já existe.' : err.message });
                }
            }
            
            await connection.commit();
            res.json({ successCount, errorCount, errors });

        } catch (e) {
            await connection.rollback();
            console.error("Erro crítico durante a importação:", e);
            res.status(500).json({ error: 'Ocorreu um erro crítico durante a importação.' });
        } finally {
            connection.release();
        }
    });

      // ROTA: Buscar usuários que podem ser aprovadores
    router.get('/aprovadores', authMiddleware, async (req, res) => {
        try {
            const [aprovadores] = await pool.execute("SELECT id, nome FROM usuarios WHERE perfil IN ('admin_geral', 'admin', 'conhecimento_manager')");
            res.json(aprovadores);
        } catch (error) {
            res.status(500).json({ error: 'Falha ao buscar aprovadores.' });
        }
    });

    // CORREÇÃO: Removido o prefixo '/api/usuarios'
    router.post('/logout-force/:id', authMiddleware, permissionMiddleware(['admin_geral']), async (req, res) => {
        const { id: targetUserId } = req.params;
        try {
            await pool.execute('UPDATE usuarios SET last_logout_at = UTC_TIMESTAMP() WHERE id = ?', [targetUserId]);
            
            const detalhes = `Logoff forçado para o usuário ID ${targetUserId}.`;
            await registrarLog(req.user.id, req.user.nome, 'LOGOFF_FORCADO', detalhes);

            res.json({ message: 'Logoff forçado com sucesso.' });
        } catch (err) {
            console.error("Erro ao forçar logoff:", err.message);
            res.status(500).json({ error: 'Falha ao forçar logoff.' });
        }
    });

    // ===================================================
    // --- ROTAS DE GERENCIAMENTO DE USUÁRIOS (CRUD) ---
    // ===================================================

    // CORREÇÃO: Removido o prefixo '/usuarios'. Agora é a rota raiz deste roteador.
    router.get('/', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional', 'financeiro']), async (req, res) => {
        const { query } = req.query;
        const { perfil, cliente_id } = req.user;

        try {
            let sql = 'SELECT u.id, u.nome, u.email, u.telefone, u.perfil, u.status, u.cpf, u.foto_perfil, u.matricula, u.filial, u.cargo, u.centroDeCusto, u.ultimo_acesso, u.licenca_chave_id, u.cliente_id FROM usuarios u';
            const params = [];
            let conditions = [];

            if (perfil === 'admin') {
                conditions.push("u.cliente_id = ?");
                params.push(cliente_id);
            }
            if (perfil !== 'admin_geral') {
                conditions.push("u.perfil != 'admin_geral'");
            }
            if (query) {
                conditions.push('(u.nome LIKE ? OR u.cpf LIKE ?)');
                params.push(`%${query}%`, `%${query}%`);
            }
            if (conditions.length > 0) {
                sql += ' WHERE ' + conditions.join(' AND ');
            }
            
            sql += ' ORDER BY u.nome ASC';

            const [rows] = await pool.execute(sql, params);
            const usersWithAvatars = rows.map(user => {
                if (user.foto_perfil && Buffer.isBuffer(user.foto_perfil)) {
                    const base64Image = user.foto_perfil.toString('base64');
                    user.foto_perfil = `data:image/jpeg;base64,${base64Image}`;
                }
                return user;
            });

            res.json(usersWithAvatars);

        } catch (err) {
            console.error("Erro ao buscar usuários:", err.message);
            res.status(500).json({ error: err.message });
        }
    });



// ROTA 1: Valida Telefone/CPF e envia o SMS
router.post('/reset-password/request-sms', async (req, res) => {
    const { telefone, cpf } = req.body;

    if (!telefone || !cpf) {
        return res.status(400).json({ error: 'Telefone e CPF são obrigatórios.' });
    }

    const cleanTelefone = telefone.replace(/\D/g, '');
    const cleanCpf = cpf.replace(/\D/g, '');

    try {
        const [users] = await pool.execute(
            'SELECT id FROM usuarios WHERE telefone = ? AND cpf = ?', 
            [cleanTelefone, cleanCpf]
        );

        // ALTERAÇÃO: Agora validamos se o usuário existe ANTES de continuar.
        if (users.length === 0) {
            // AVISO DE SEGURANÇA: Retornar este erro permite que um atacante
            // descubra quais CPFs/Telefones estão cadastrados no sistema.
            // Para sua necessidade de UX, estamos implementando assim.
            return res.status(404).json({ error: 'Nenhum usuário encontrado com os dados informados.' });
        }
        
        const user = users[0];
        const token = crypto.randomInt(100000, 999999).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min de validade para o token SMS

        await pool.execute(
            'UPDATE usuarios SET sms_reset_token = ?, sms_reset_expires = ? WHERE id = ?',
            [token, expires, user.id]
        );

        const comteleApiUrl = 'https://api.comtele.com.br/messages/sms/send';
        const payload = {
            receivers: [`55${cleanTelefone}`],
            message: `Seu código de verificação é: ${token}`,
            route: 17
        };
        const headers = {
            'x-api-key': process.env.COMTELE_API_KEY,
            'Content-Type': 'application/json'
        };

        await axios.post(comteleApiUrl, payload, { headers: headers });
        
        // Agora retorna um sucesso explícito
        res.status(200).json({ message: 'Código SMS enviado com sucesso.' });

    } catch (error) {
        console.error('Erro detalhado no processo de SMS:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Ocorreu um erro ao tentar enviar o SMS.' });
    }
});

// ROTA 2: Verifica o token SMS (VERSÃO CORRIGIDA)
router.post('/reset-password/verify-sms', async (req, res) => {
    const { cpf, token } = req.body;
    if (!cpf || !token) {
        return res.status(400).json({ error: 'CPF e código são obrigatórios.' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    try {
        const [users] = await pool.execute(
            'SELECT * FROM usuarios WHERE cpf = ? AND sms_reset_token = ?',
            [cleanCpf, token]
        );

        if (users.length === 0) {
            return res.status(400).json({ error: 'Código de verificação inválido.' });
        }

        const user = users[0];
        if (new Date() > new Date(user.sms_reset_expires)) {
            return res.status(400).json({ error: 'Código de verificação expirado.' });
        }

        // CORREÇÃO AQUI: Usando a variável 'SECRET_KEY' que já existe no seu arquivo
        const resetToken = jwt.sign(
            { id: user.id, action: 'reset-password' },
            SECRET_KEY, // <--- TROCADO DE process.env.SECRET_KEY PARA SECRET_KEY
            { expiresIn: '3m' }
        );

        res.json({ resetToken, message: 'Código verificado com sucesso.' });

    } catch (error) {
        console.error('Erro ao verificar token SMS:', error);
        res.status(500).json({ error: 'Ocorreu um erro interno.' });
    }
});

// ROTA 3: Define a nova senha (VERSÃO CORRIGIDA)
router.post('/reset-password/set-new-password', async (req, res) => {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
        return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
    if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({ error: 'A senha não atende aos requisitos de segurança.' });
    }

    try {
        // CORREÇÃO AQUI: Usando a variável 'SECRET_KEY' que já existe no seu arquivo
        const decoded = jwt.verify(resetToken, SECRET_KEY); // <--- TROCADO DE process.env.SECRET_KEY PARA SECRET_KEY
        if (decoded.action !== 'reset-password') {
            return res.status(401).json({ error: 'Token inválido para esta ação.' });
        }

        const userId = decoded.id;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await pool.execute(
            'UPDATE usuarios SET senha = ?, precisa_trocar_senha = 0, sms_reset_token = NULL, sms_reset_expires = NULL WHERE id = ?',
            [hashedPassword, userId]
        );

        res.json({ message: 'Senha redefinida com sucesso!' });

    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ error: 'Sessão para troca de senha expirou. Por favor, comece novamente.' });
        }
        console.error('Erro ao redefinir senha:', error);
        res.status(500).json({ error: 'Ocorreu um erro interno ao redefinir a senha.' });
    }
});


    // CORREÇÃO: Removido o prefixo '/usuarios'
    router.get('/:id', authMiddleware, permissionMiddleware(['admin_geral']), async (req, res) => {
        try {
            const sql = `
    SELECT 
        u.id, u.nome, u.email, u.telefone, u.perfil, u.matricula, u.cpf, u.filial, 
        u.cargo, u.centroDeCusto, u.foto_perfil, u.status, u.regras_acesso,
        u.cliente_id 
    FROM usuarios u 
    WHERE u.id = ?
`;
            const [rows] = await pool.execute(sql, [req.params.id]);

            if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
            res.json(rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/bulk-actions', authMiddleware, permissionMiddleware(['admin_geral']), async (req, res) => {
    const { userIds, action } = req.body;
    const { id: adminId } = req.user; // ID do admin que está executando a ação

    // 1. Validação inicial
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'Nenhum usuário selecionado.' });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 2. Medida de Segurança: Impedir que o Admin Geral e o próprio usuário sejam afetados
        const [[adminGeral]] = await connection.execute("SELECT id FROM usuarios WHERE email = 'admin@guinchooliveira.com'");
        const adminGeralId = adminGeral ? adminGeral.id : null;

        const safeUserIds = userIds
            .map(id => parseInt(id, 10))
            .filter(id => 
                !isNaN(id) &&         // Garante que é um número
                id !== adminGeralId && // Impede que o Admin Geral seja modificado
                id !== adminId         // Impede que o admin modifique a si mesmo
            );

        if (safeUserIds.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Nenhum usuário válido para a operação (admins não podem ser modificados em massa).' });
        }

        const placeholders = safeUserIds.map(() => '?').join(',');
        let sql;
        let result;
        let successMessage = '';

        // 3. Executa a ação correta com base no 'action' enviado pelo frontend
        switch (action) {
            case 'force_logout':
                sql = `UPDATE usuarios SET last_logout_at = UTC_TIMESTAMP() WHERE id IN (${placeholders})`;
                [result] = await connection.execute(sql, safeUserIds);
                successMessage = `${result.affectedRows} usuário(s) tiveram seu logoff forçado.`;
                await registrarLog(adminId, req.user.nome, 'LOGOFF_MASSA_FORCADO', `Usuários afetados: ${safeUserIds.join(', ')}`);
                break;

            case 'block':
                sql = `UPDATE usuarios SET status = 'bloqueado' WHERE id IN (${placeholders})`;
                [result] = await connection.execute(sql, safeUserIds);
                successMessage = `${result.affectedRows} usuário(s) foram bloqueados.`;
                await registrarLog(adminId, req.user.nome, 'BLOQUEIO_MASSA', `Usuários afetados: ${safeUserIds.join(', ')}`);
                break;

            case 'unblock':
                sql = `UPDATE usuarios SET status = 'ativo' WHERE id IN (${placeholders})`;
                [result] = await connection.execute(sql, safeUserIds);
                successMessage = `${result.affectedRows} usuário(s) foram desbloqueados.`;
                await registrarLog(adminId, req.user.nome, 'DESBLOQUEIO_MASSA', `Usuários afetados: ${safeUserIds.join(', ')}`);
                break;
            
            case 'delete':
                // Para deletar, precisamos primeiro liberar as licenças
                const sqlReleaseLicenses = `UPDATE licenca_chaves SET usuario_id_alocado = NULL, data_alocacao = NULL WHERE usuario_id_alocado IN (${placeholders})`;
                await connection.execute(sqlReleaseLicenses, safeUserIds);
                
                // Agora, deletamos os usuários
                const sqlDeleteUsers = `DELETE FROM usuarios WHERE id IN (${placeholders})`;
                [result] = await connection.execute(sqlDeleteUsers, safeUserIds);
                successMessage = `${result.affectedRows} usuário(s) foram excluídos e suas licenças liberadas.`;
                await registrarLog(adminId, req.user.nome, 'EXCLUSAO_MASSA', `Usuários afetados: ${safeUserIds.join(', ')}`);
                break;

            default:
                await connection.rollback();
                connection.release();
                return res.status(400).json({ error: `Ação '${action}' não é suportada.` });
        }

        await connection.commit();
        res.json({ message: successMessage });

    } catch (err) {
        await connection.rollback();
        console.error("ERRO EM AÇÃO EM MASSA:", err);
        res.status(500).json({ error: 'Falha na execução da ação em massa. Verifique o console do servidor.' });
    } finally {
        if (connection) connection.release();
    }
});

    // CORREÇÃO: Removido o prefixo '/usuarios'
    router.put('/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    const { id } = req.params;
    const { perfil: perfilLogado } = req.user;
    
    try {
        // Medida de segurança para não alterar o admin principal
        const [userRows] = await pool.execute('SELECT email FROM usuarios WHERE id = ?', [id]);
        if (userRows.length > 0 && userRows[0].email === 'admin@guinchooliveira.com') {
            return res.status(403).json({ error: 'O Administrador Geral não pode ser modificado.' });
        }

        // Lógica de atualização baseada no perfil do usuário logado
        if (perfilLogado === 'admin_geral') {
            // Admin Geral pode editar mais campos
            const { 
                nome, 
                email, 
                telefone, // <--- CAMPO ADICIONADO AQUI
                perfil, 
                matricula = null, 
                cpf = null, 
                filial = null, 
                cargo = null, 
                centroDeCusto = null, 
                cliente_id = null 
            } = req.body;

            if (perfil === 'admin_geral') {
                return res.status(403).json({ error: 'Não é permitido promover um usuário a Administrador Geral.' });
            }
            
            // QUERY CORRIGIDA para incluir o telefone
            const sql = `UPDATE usuarios SET nome=?, email=?, telefone=?, perfil=?, matricula=?, cpf=?, filial=?, cargo=?, centroDeCusto=?, cliente_id=? WHERE id=?`;
            await pool.execute(sql, [nome, email, telefone, perfil, matricula, cpf, filial, cargo, centroDeCusto, cliente_id, id]);

        } else { // Lógica para o perfil 'admin'
            
            // Admin de cliente pode editar campos básicos
            const { nome, email, telefone, perfil } = req.body; // <--- CAMPO ADICIONADO AQUI

            if (perfil === 'admin_geral') {
                return res.status(403).json({ error: 'Ação não permitida.' });
            }

            // QUERY CORRIGIDA para incluir o telefone
            const sql = `UPDATE usuarios SET nome = ?, email = ?, telefone = ?, perfil = ? WHERE id = ?`;
            await pool.execute(sql, [nome, email, telefone, perfil, id]);
        }
        
        const detalhes = `Usuário ID ${id} foi atualizado.`;
        await registrarLog(req.user.id, req.user.nome, 'USUARIO_ATUALIZADO', detalhes);

        res.json({ message: 'Usuário atualizado com sucesso.' });

    } catch (err) {
        console.error("Erro ao atualizar usuário:", err)
        res.status(500).json({ error: 'Falha ao atualizar usuário.' });
    }
});

    // CORREÇÃO: Removido o prefixo '/usuarios'
    router.put('/:id/password', authMiddleware, permissionMiddleware(['admin_geral']), async (req, res) => {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
        }

        try {
            const hash = await bcrypt.hash(newPassword, 10);
            const sql = `UPDATE usuarios SET senha = ? WHERE id = ?`;
            await pool.execute(sql, [hash, id]);

            const [userRows] = await pool.execute('SELECT id, nome, email FROM usuarios WHERE id = ?', [id]);
            const usuario = userRows[0];

            await registrarLog(req.user.id, req.user.nome, 'USUARIO_SENHA_ALTERADA', `Senha do usuário ${usuario.nome} (ID: ${id}) alterada.`);
            await enviarNotificacaoSenhaAlterada(usuario.id, usuario.nome, usuario.email);

            res.json({ message: 'Senha alterada com sucesso.' });
        } catch (err) {
            console.error("Erro ao alterar senha:", err.message);
            res.status(500).json({ error: 'Falha ao alterar senha.' });
        }
    });

    // CORREÇÃO: Removido o prefixo '/usuarios'
    router.put('/:id/regras-acesso', authMiddleware, permissionMiddleware(['admin_geral']), async (req, res) => {
        const { id } = req.params;
        const { regras } = req.body;
        try {
            const [userRows] = await pool.execute('SELECT email FROM usuarios WHERE id = ?', [id]);
            if (userRows.length > 0 && userRows[0].email === 'admin@guinchooliveira.com') {
                return res.status(403).json({ error: 'Não é permitido definir regras de acesso para o Administrador Geral.' });
            }
            const sql = `UPDATE usuarios SET regras_acesso = ? WHERE id = ?`;
            await pool.execute(sql, [JSON.stringify(regras), id]);
            res.json({ message: 'Regras de acesso atualizadas com sucesso.' });
        } catch (err) {
            console.error("Erro ao salvar regras de acesso:", err.message);
            res.status(500).json({ error: 'Falha ao salvar regras de acesso.' });
        }
    });

    // CORREÇÃO: Removido o prefixo '/usuarios'
    router.delete('/:id', authMiddleware, permissionMiddleware(['admin_geral']), async (req, res) => {
        const { id: userIdToDelete } = req.params;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [userRows] = await connection.execute('SELECT nome, email FROM usuarios WHERE id = ?', [userIdToDelete]);
            if (userRows.length > 0 && userRows[0].email === 'admin@guinchooliveira.com') {
                await connection.rollback();
                connection.release();
                return res.status(403).json({ error: 'O Administrador Geral não pode ser excluído.' });
            }
            const nomeUsuarioExcluido = userRows.length > 0 ? userRows[0].nome : `ID ${userIdToDelete}`;

            await connection.execute(
                'UPDATE licenca_chaves SET usuario_id_alocado = NULL, data_alocacao = NULL WHERE usuario_id_alocado = ?',
                [userIdToDelete]
            );
            
            await connection.execute('DELETE FROM usuarios WHERE id = ?', [userIdToDelete]);
            
            await connection.commit();
            
            const detalhes = `Usuário ${nomeUsuarioExcluido} (ID: ${userIdToDelete}) foi excluído e sua licença foi liberada.`;
            await registrarLog(req.user.id, req.user.nome, 'USUARIO_EXCLUIDO', detalhes);

            res.json({ message: 'Usuário excluído e licença liberada com sucesso.' });
        } catch (err) {
            await connection.rollback();
            console.error("Erro ao excluir usuário:", err.message)
            res.status(500).json({ error: 'Falha ao excluir usuário.' });
        } finally {
            connection.release();
        }
    });

    // CORREÇÃO: Removido o prefixo '/usuarios'
    router.put('/:id/status', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
        const { status } = req.body;
        const { id: targetUserId } = req.params;
        if (req.user.id == targetUserId) {
            return res.status(403).json({ error: 'Você não pode alterar seu próprio status.' });
        }
        try {
            const [targetUserRows] = await pool.execute('SELECT perfil, email FROM usuarios WHERE id = ?', [targetUserId]);
            if (targetUserRows.length === 0) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }
            if (targetUserRows[0].email === 'admin@guinchooliveira.com') {
                return res.status(403).json({ error: 'O Administrador Geral não pode ser bloqueado.' });
            }
            if (req.user.perfil === 'admin' && targetUserRows[0].perfil === 'admin') {
                return res.status(403).json({ error: 'Administradores não podem bloquear outros administradores.' });
            }
            const sql = `UPDATE usuarios SET status = ? WHERE id = ?`;
            await pool.execute(sql, [status, targetUserId]);
            
            const acao = status === 'ativo' ? 'desbloqueado' : 'bloqueado';
            const detalhes = `O status do usuário ID ${targetUserId} foi alterado para ${status}.`;
            await registrarLog(req.user.id, req.user.nome, 'USUARIO_STATUS_ALTERADO', detalhes);

            res.json({ message: `Usuário ${acao} com sucesso.` });
        } catch (err) {
            res.status(500).json({ error: 'Falha ao alterar status do usuário.' });
        }
    });

    // ===================================================
    // --- ROTAS DO PRÓPRIO USUÁRIO (/me) ---
    // ===================================================

    // CORREÇÃO: Typo de '//me' para '/me'
    router.get('/me', authMiddleware, async (req, res) => {
        try {
            console.log(`[LOG] Rota /usuarios/me acessada para o usuário ID: ${req.user.id}`);

            const [rows] = await pool.execute(
              `SELECT u.id, u.nome, u.email, u.perfil, u.cliente_id, u.matricula, u.cpf, u.filial, u.cargo, u.centroDeCusto, u.foto_perfil, u.tema, cs.nome_empresa, cs.logo_url 
               FROM usuarios u
               LEFT JOIN clientes_sistema cs ON u.cliente_id = cs.id
               WHERE u.id = ?`, 
              [req.user.id]
            );
            
            if (rows.length === 0) {
                console.error("Erro: Usuário não encontrado no banco de dados para o ID:", req.user.id);
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }

            const user = rows[0];

            if (user.foto_perfil && Buffer.isBuffer(user.foto_perfil)) {
                const base64Image = user.foto_perfil.toString('base64');
                user.foto_perfil = `data:image/jpeg;base64,${base64Image}`;
            }
            
            res.json(user);

        } catch (err) {
            console.error("[ERRO] Falha na rota /usuarios/me:", err);
            res.status(500).json({ error: 'Falha ao buscar dados do perfil.' });
        }
    });

    router.put('/me/foto', authMiddleware, upload.single('foto_perfil'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo de imagem enviado.' });
        }
        try {
            const foto_perfil_url = `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}`;
            await pool.execute('UPDATE usuarios SET foto_perfil = ? WHERE id = ?', [foto_perfil_url, req.user.id]);
            await registrarLog(req.user.id, req.user.nome, 'FOTO_PERFIL_ATUALIZADA', `O usuário atualizou a própria foto de perfil.`);
            res.json({ message: 'Foto de perfil atualizada com sucesso.', foto_perfil_url: foto_perfil_url });
        } catch (err) {
            console.error("Erro ao atualizar a foto de perfil:", err);
            res.status(500).json({ error: 'Falha ao atualizar a foto de perfil.' });
        }
    });

    router.put('/me/tema', authMiddleware, async (req, res) => {
        const { tema } = req.body;
        if (!['light', 'dark'].includes(tema)) {
            return res.status(400).json({ error: 'Tema inválido.' });
        }
        try {
            await pool.execute('UPDATE usuarios SET tema = ? WHERE id = ?', [tema, req.user.id]);
            res.json({ message: 'Tema atualizado com sucesso.' });
        } catch (err) {
            res.status(500).json({ error: 'Falha ao atualizar o tema.' });
        }
    });

    // ===================================================
    // --- OUTRAS ROTAS ---
    // ===================================================


    
router.get('/licencas/cliente/:clienteId', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    const { clienteId } = req.params;

    try {
        // Esta é a consulta SQL final e correta, baseada na estrutura da sua tabela.
        const sql = `
            SELECT 
                lc.id,
                lc.chave_licenca,
                lc.data_alocacao,
                lc.usuario_id_alocado,
                u.nome as usuario_nome,
                u.email as usuario_email,
                u.foto_perfil as usuario_foto
            FROM 
                licenca_chaves lc
            LEFT JOIN 
                usuarios u ON lc.usuario_id_alocado = u.id
            WHERE 
                lc.cliente_id = ?
            ORDER BY
                lc.usuario_id_alocado DESC, lc.id ASC;
        `;

        const [licencas] = await pool.execute(sql, [clienteId]);
        
        res.json(licencas);

    } catch (err) {
        console.error("Erro ao buscar licenças do cliente:", err.message);
        res.status(500).json({ error: 'Falha ao buscar as licenças do cliente.' });
    }
});



    // ===================================================
    // --- ROTAS DE RECUPERAÇÃO DE SENHA ---
    // ===================================================

    router.post('/password-reset/request-email', async (req, res) => {
        const { email } = req.body;
        try {
            const [userRows] = await pool.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
            if (userRows.length === 0) {
                return res.status(404).json({ error: 'E-mail não encontrado em nossa base de dados.' });
            }
            res.status(200).json({ message: 'E-mail verificado com sucesso.' });
        } catch (err) {
            console.error("Erro ao verificar e-mail:", err.message);
            res.status(500).json({ error: 'Ocorreu um erro interno.' });
        }
    });

    router.post('/password-reset/request-validation', async (req, res) => {
        const { email, cpf, matricula } = req.body;
        try {
            const [userRows] = await pool.execute(
                'SELECT id, nome FROM usuarios WHERE email = ? AND cpf = ? AND matricula = ?',
                [email, cpf, matricula]
            );
            const user = userRows[0];
            if (!user) {
                return res.status(400).json({ error: 'CPF ou Matrícula inválidos para este e-mail.' });
            }

            const token = crypto.randomBytes(32).toString('hex');
            const expires = new Date(Date.now() + 3600000); // 1 hora

            await pool.execute(
                'UPDATE usuarios SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
                [token, expires, user.id]
            );

            const resetLink = `http://localhost:3000/reset-password?token=${token}`;
            
            const emailParams = {
                FromEmailAddress: process.env.SENDER_EMAIL_ADDRESS,
                Destination: { ToAddresses: [email] },
                Content: {
                    Simple: {
                        Subject: { Data: 'Recuperação de Senha - Guincho Oliveira' },
                        Body: {
                            Html: {
                                Data: `
                                    <h1>Olá, ${user.nome}!</h1>
                                    <p>Você solicitou a redefinição de sua senha. Clique no link abaixo para continuar:</p>
                                    <a href="${resetLink}" style="padding: 10px 15px; background-color: #FF8C00; color: white; text-decoration: none; border-radius: 5px;">
                                        Redefinir Minha Senha
                                    </a>
                                    <p>Este link é válido por 1 hora. Se você não solicitou isso, por favor, ignore este e-mail.</p>
                                `
                            }
                        }
                    }
                }
            };

            await sesClient.send(new SendEmailCommand(emailParams));
            res.status(200).json({ message: 'Link de recuperação enviado para o seu e-mail!' });

        } catch (err) {
            console.error("ERRO DETALHADO AO ENVIAR E-MAIL:", err);
            let errorMessage = 'Falha ao enviar e-mail de recuperação. Verifique o console do servidor para mais detalhes.';
            
            if (err.name === 'MessageRejected') {
                errorMessage = 'O e-mail foi rejeitado pela AWS. Verifique se o remetente está verificado e se a sua conta não está em modo "sandbox".';
            } else if (err.name === 'ConfigurationError' || (err.message && err.message.toLowerCase().includes('credentials'))) {
                errorMessage = 'Erro nas credenciais da AWS. Verifique se as chaves de acesso no arquivo .env estão corretas e válidas.';
            }

            res.status(500).json({ error: errorMessage });
        }
    });

    router.post('/password-reset/confirm', async (req, res) => {
        const { token, newPassword } = req.body;
        try {
            const [userRows] = await pool.execute(
                'SELECT id FROM usuarios WHERE reset_token = ? AND reset_token_expires > NOW()',
                [token]
            );
            const user = userRows[0];
            if (!user) {
                return res.status(400).json({ error: 'Token inválido ou expirado. Por favor, solicite um novo link.' });
            }

            const hash = await bcrypt.hash(newPassword, 10);
            await pool.execute(
                'UPDATE usuarios SET senha = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
                [hash, user.id]
            );

            res.status(200).json({ message: 'Senha redefinida com sucesso!' });
        } catch (err) {
            console.error("Erro ao redefinir senha:", err.message);
            res.status(500).json({ error: 'Ocorreu um erro interno.' });
        }
    });

    // Dentro de routes/routesUsers.js, dentro de module.exports = (dependencies) => { ... }

    return router;
}