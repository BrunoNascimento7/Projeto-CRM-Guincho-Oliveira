console.log("--- INICIANDO SERVIDOR COM A VERSÃO MAIS RECENTE (TESTE CORS) ---");
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const app = express();
const port = process.env.PORT || 3001;
const XLSX = require('xlsx');
const { eachDayOfInterval, format, parseISO } = require('date-fns');
const http = require('http');
const { Server } = require("socket.io");
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cron = require('node-cron');
const { Parser } = require('json2csv');
const pool = require('./config/db');
const PERMISSAO_CLIENTES_CRUD = ['admin_geral', 'admin', 'operacional'];
const PERMISSAO_EDICAO_CONHECIMENTO = ['admin_geral', 'admin', 'conhecimento_manager'];
const PERMISSAO_FLUXO_CAIXA = ['admin_geral', 'admin', 'financeiro'];
const PERMISSAO_RENTABILIDADE_FROTA = ['admin_geral', 'admin', 'financeiro'];
const PERMISSAO_SUPORTE = ['admin_geral', 'admin', 'financeiro', 'operacional'];

require('dotenv').config();

const allowedOrigins = [
    'https://projeto-crm-guincho-oliveira.onrender.com', // Sua URL de produção
    'http://localhost:3000'                               // Sua URL de desenvolvimento
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem 'origin' (como apps mobile ou Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'A política de CORS para este site não permite acesso da Origem especificada.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const requiredEnvVars = ['AWS_SES_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'SENDER_EMAIL_ADDRESS'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error(`❌ Erro Crítico: As seguintes variáveis de ambiente da AWS não foram definidas no seu arquivo .env:`);
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    process.exit(1);
}

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static('/var/data/uploads'));

const SECRET_KEY = 'guincho_oliveira_secret';

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e7
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/perfil');
    },
    filename: function (req, file, cb) {
        cb(null, `user-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

const storageAnuncios = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/anuncios');
    },
    filename: function (req, file, cb) {
        cb(null, `anuncio-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const uploadAnuncio = multer({ storage: storageAnuncios });

const storageLogos = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/logos');
    },
    filename: function (req, file, cb) {
        const clienteId = req.params.id;
        cb(null, `cliente-${clienteId}-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const uploadLogo = multer({ storage: storageLogos });

const storageSlideshow = multer.diskStorage({
    destination: function (req, file, cb) {
        // O caminho completo para a pasta DENTRO do disco persistente
        const dir = '/var/data/uploads/slideshow'; 
        fs.mkdirSync(dir, { recursive: true }); // Garante que a subpasta 'slideshow' exista no disco
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, `slide-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const uploadSlideshow = multer({ 
    storage: storageSlideshow,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB por imagem
    fileFilter: (req, file, cb) => {
        if (file.mimetype == "image/png" || file.mimetype == "image/jpg" || file.mimetype == "image/jpeg" || file.mimetype == "image/gif") {
            cb(null, true);
        } else {
            cb(null, false);
            return cb(new Error('Apenas formatos .png, .jpg, .jpeg e .gif são permitidos!'));
        }
    }
});

const storageCustomize = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/customize';
        fs.mkdirSync(dir, { recursive: true }); // Cria o diretório se não existir
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const clienteId = req.params.id;
        cb(null, `${file.fieldname}-${clienteId}-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const uploadCustomize = multer({ storage: storageCustomize });

let onlineUsers = [];

const storageRecibos = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/manutencoes';
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `recibo-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const uploadRecibo = multer({ storage: storageRecibos });

const storageSuporte = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/suporte';
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
    // Usamos req.user.id, que deve existir se o authMiddleware passou.
    const usuarioId = req.user && req.user.id ? req.user.id : 'anon'; 
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Renomeado para usar o ID do usuário (ou 'anon')
    cb(null, `chamado-user-${usuarioId}-${uniqueSuffix}${path.extname(file.originalname)}`); 
}
});
const uploadSuporte = multer({ storage: storageSuporte });

const uploadInMemory = multer({ storage: multer.memoryStorage() });


const storageUpdates = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/updates';
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, `update-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const uploadUpdate = multer({ storage: storageUpdates });

// Array de permissões para os novos menus
const PERMISSAO_FINANCEIRO_AVANCADO = ['admin_geral', 'admin', 'financeiro'];

const addUser = (userId, name, socketId, avatar, perfil, clienteId) => { 
    
    let user = onlineUsers.find(u => u.userId === userId);

    if (user) {
        // Se o usuário já existe, apenas adiciona o novo socketId se ele não estiver lá
        if (!user.socketIds.includes(socketId)) {
            user.socketIds.push(socketId);
        }
        // Atualiza o perfil e clienteId se estiverem faltando (opcional, mas seguro)
        user.perfil = perfil;
        user.clienteId = clienteId; 
    } else {
        onlineUsers.push({ userId, name, socketIds: [socketId], avatar, perfil, clienteId }); 
    }
};

const removeUser = (socketId) => {
    // Encontra o usuário que possui este socketId
    const userIndex = onlineUsers.findIndex(u => u.socketIds.includes(socketId));

    if (userIndex !== -1) {

        onlineUsers[userIndex].socketIds = onlineUsers[userIndex].socketIds.filter(id => id !== socketId);

        // Se o usuário não tiver mais nenhum socketId (fechou todas as abas), remove ele da lista
        if (onlineUsers[userIndex].socketIds.length === 0) {
            onlineUsers.splice(userIndex, 1);
        }
    }
};

const getUser = (userId) => {
    return onlineUsers.find(user => user.userId === userId);
};

const storageManutencao = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'uploads/manutencoes';
        fs.mkdirSync(dir, { recursive: true }); // Cria o diretório se não existir
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const veiculoId = req.params.id;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `veiculo-${veiculoId}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const uploadManutencao = multer({ storage: storageManutencao });

io.on("connection", (socket) => {
    
    socket.on("newUser", async (userId) => { 
        if (!userId) return;

        // 1. Busca as informações cruciais do usuário no BD (usando o pool)
        let name = "Desconhecido", avatar = null, perfil = null, cliente_id = null;
        try {
            const [userRows] = await pool.execute('SELECT nome, foto_perfil, perfil, cliente_id FROM usuarios WHERE id = ?', [userId]);
            if (userRows.length > 0) {
                const dbUser = userRows[0];
                name = dbUser.nome;
                perfil = dbUser.perfil;
                cliente_id = dbUser.cliente_id;
                
                // Formata a foto se estiver em Buffer (como no seu /usuarios/me)
                if (dbUser.foto_perfil && Buffer.isBuffer(dbUser.foto_perfil)) {
                    avatar = `data:image/jpeg;base64,${dbUser.foto_perfil.toString('base64')}`;
                } else if (typeof dbUser.foto_perfil === 'string' && dbUser.foto_perfil.startsWith('http')) {
                    avatar = dbUser.foto_perfil; // Se for URL de imagem externa
                }
            }
        } catch (error) {
            console.error("Erro ao buscar dados do usuário para o chat:", error);
            // Continua, mas com dados parciais
        }

        // 2. Adiciona o usuário online com as informações obtidas
        addUser(userId, name, socket.id, avatar, perfil, cliente_id); 
        io.emit("getUsers", onlineUsers);
    });

    socket.on('join_support_ticket', (ticketId) => {
        socket.join(ticketId);
        console.log(`[Socket.io] Usuário ${socket.id} entrou na sala do chamado: ${ticketId}`);
    });

    // +++ ADICIONADO: Lógica para sair da sala do chamado +++
    socket.on('leave_support_ticket', (ticketId) => {
        socket.leave(ticketId);
        console.log(`[Socket.io] Usuário ${socket.id} saiu da sala do chamado: ${ticketId}`);
    });

    // ##########################################
    // # LISTENER DE ENVIO DE MENSAGEM
    // ##########################################
    socket.on("sendMessage", (messageData) => {
        const receiver = getUser(messageData.receiverId);
        // Acha o remetente pelo socket.id atual (usando o array socketIds)
        const sender = onlineUsers.find(user => user.socketIds.includes(socket.id)); 
        
        // Se o destinatário e o remetente foram encontrados online...
        if (receiver && sender) {
            // Envia a mensagem para CADA socketId que o destinatário tem ativo
            receiver.socketIds.forEach(socketId => {
                io.to(socketId).emit("getMessage", messageData);
            });

            // Envia a confirmação de entrega para o remetente.
            io.to(socket.id).emit("messageDelivered", { 
                messageId: messageData.id, 
                receiverId: receiver.userId 
            });
        }
    });

    // ##########################################
    // # LISTENER DE MARCAR COMO LIDA
    // ##########################################
    socket.on("markAsRead", async ({ conversationPartnerId }) => { // <<< ADICIONADO 'async'
    try {
        // Quem está lendo as mensagens? O usuário deste socket.
        const reader = onlineUsers.find(user => user.socketIds.includes(socket.id));
        if (!reader) return; // Se não encontrar o leitor, não faz nada

        // De quem são as mensagens que estão sendo lidas? Do "conversationPartnerId".
        const senderOfMessages = getUser(conversationPartnerId);

        // <<< INÍCIO DO CÓDIGO ADICIONADO >>>
        // 1. ATUALIZA O BANCO DE DADOS
        // Marca todas as mensagens enviadas pelo parceiro para o leitor como 'read'
        const myId = reader.userId;
        const partnerId = conversationPartnerId;

        console.log(`[Socket.io] Usuário ${myId} marcou como lidas as mensagens de ${partnerId}`);

        const sql = "UPDATE chat_messages SET status = 'read' WHERE sender_id = ? AND receiver_id = ? AND status != 'read'";
        await pool.execute(sql, [partnerId, myId]);
        // <<< FIM DO CÓDIGO ADICIONADO >>>

        // 2. NOTIFICA O REMETENTE EM TEMPO REAL (lógica que já existia)
        // Se o remetente original estiver online
        if (senderOfMessages) {
            // Envia uma notificação de volta para TODAS as conexões dele
            senderOfMessages.socketIds.forEach(socketId => {
                io.to(socketId).emit("messagesRead", { readerId: reader.userId });
            });
        }
    } catch (error) {
        console.error("❌ Erro no evento 'markAsRead' do Socket.io:", error);
    }
});
    
    // ##########################################
    // # LISTENERS DE DIGITANDO
    // ##########################################
    socket.on("startTyping", ({ receiverId }) => {
        const receiver = getUser(receiverId);
        const sender = onlineUsers.find(user => user.socketIds.includes(socket.id));
        if (receiver && sender) {
            // Envia para CADA socket do receptor
            receiver.socketIds.forEach(socketId => { 
                io.to(socketId).emit("typing", { senderId: sender.userId, isTyping: true });
            });
        }
    });

    socket.on("stopTyping", ({ receiverId }) => {
        const receiver = getUser(receiverId);
        const sender = onlineUsers.find(user => user.socketIds.includes(socket.id)); 
        if (receiver && sender) {
            // Envia para CADA socket do receptor
            receiver.socketIds.forEach(socketId => { 
                io.to(socketId).emit("typing", { senderId: sender.userId, isTyping: false });
            });
        }
    });

    // ##########################################
    // # LISTENER DE DESCONEXÃO 
    // ##########################################
    socket.on("disconnect", () => {
        removeUser(socket.id);
        io.emit("getUsers", onlineUsers);
    });

}); 

// ROTA PARA BUSCAR UM RESUMO DE MENSAGENS NÃO LIDAS
app.get('/api/chat/unread-summary', authMiddleware, async (req, res) => {
    try {
        const myId = req.user.id;
        const sql = `
            SELECT sender_id, COUNT(id) as unread_count
            FROM chat_messages
            WHERE receiver_id = ? AND status != 'read'
            GROUP BY sender_id
        `;
        const [rows] = await pool.execute(sql, [myId]);
        res.json(rows); // Retorna algo como: [{ sender_id: 12, unread_count: 5 }, ...]
    } catch (error) {
        console.error("Erro ao buscar resumo de não lidas:", error);
        res.status(500).json({ error: "Falha ao buscar resumo de mensagens." });
    }
});

cron.schedule('0 1 * * *', async () => {
    console.log('🕒 Executando rotina de limpeza de logs antigos...');
    try {
        const [result] = await pool.execute(
            "DELETE FROM logs_sistema WHERE timestamp < NOW() - INTERVAL 6 MONTH"
        );
        console.log(`✅ ${result.affectedRows} logs antigos foram removidos.`);
    } catch (err) {
        console.error("❌ Erro ao limpar logs antigos:", err.message);
    }
});

const sesClient = new SESv2Client({
    region: process.env.AWS_SES_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Middlewares (Funções de apoio)
async function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Formato de token inválido.' });

    try {
        const decoded = jwt.verify(token, SECRET_KEY); // Usa a constante SECRET_KEY

        const sql = `
            SELECT 
            u.id, u.nome, u.perfil, u.last_logout_at, u.cliente_id, 
            cs.status as cliente_status
            FROM usuarios u
            LEFT JOIN clientes_sistema cs ON u.cliente_id = cs.id
            WHERE u.id = ?
        `;
        const [userRows] = await pool.execute(sql, [decoded.id]);
        
        if (userRows.length === 0) {
            return res.status(401).json({ error: 'Usuário do token não encontrado.' });
        }
        
        const user = userRows[0];

        if (user.last_logout_at) {
            const tokenIssuedAt = decoded.iat * 1000;
            const forcedLogoutAt = new Date(user.last_logout_at).getTime();

            if (tokenIssuedAt < forcedLogoutAt) {
                console.warn(`[AUTH_BLOCK] Token rejeitado para o usuário ${user.id} devido a logoff forçado.`);
                return res.status(401).json({ error: 'Sua sessão foi encerrada por um administrador.' });
            }
        }

        if (user.perfil !== 'admin_geral' && user.cliente_status === 'suspenso') {
            return res.status(403).json({ error: 'A licença para sua empresa foi suspensa. Contate o suporte.' });
        }
        
        req.user = { 
            id: user.id, 
            nome: user.nome, 
            perfil: user.perfil,
            cliente_id: user.cliente_id,
            email: user.email
        };
        
        next();

    } catch (err) {
        console.error("[AUTH_ERROR] Falha na verificação do token:", err.message);
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

async function maintenanceMiddleware(req, res, next) {
    
    const PUBLIC_PATHS = ['/api/public/system-status', '/api/public/login-info', '/api/public/customize', '/api/login']; 
    
    // 1. Verifica se a rota atual é uma das rotas públicas
    if (PUBLIC_PATHS.some(path => req.path.startsWith(path))) {
        return next();
    }

    try {
        // 2. Busca o status de manutenção no banco
        const [[{ valor }]] = await pool.execute("SELECT valor FROM configuracoes_sistema WHERE chave = 'modo_manutencao'");
        const maintenanceMode = valor === 'true';

        if (maintenanceMode) {
            
            let isAdminGeral = false;
            const authHeader = req.headers['authorization'];
            if (authHeader) {
                const token = authHeader.split(' ')[1];
                if (token) {
                    try {
                        // CORRIGIDO: Usando a constante SECRET_KEY, eliminando o literal que causava a falha de rota
                        const decoded = require('jsonwebtoken').verify(token, SECRET_KEY); 
                        isAdminGeral = decoded.perfil === 'admin_geral';
                    } catch (err) {
                        isAdminGeral = false;
                    }
                }
            }

            if (!isAdminGeral) {
                return res.status(503).json({ 
                    error: 'O sistema está em manutenção. Tente novamente mais tarde.',
                    maintenance: true 
                });
            }
        }
        
        next();
    } catch (error) {
        console.error("Erro no middleware de manutenção:", error);
        next(); 
    }
}

function permissionMiddleware(allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.perfil)) {
            return res.status(403).json({ error: 'Você não tem permissão para acessar este recurso.' });
        }
        next();
    };
}

function adminGeralMiddleware(req, res, next) {
    if (!req.user || req.user.perfil !== 'admin_geral') {
        return res.status(403).json({ error: 'Acesso negado. Apenas o administrador geral pode realizar esta ação.' });
    }
    next();
}

async function registrarLog(usuario_id, usuario_nome, acao, detalhes = '') {
    try {
        const sql = 'INSERT INTO logs_sistema (usuario_id, usuario_nome, acao, detalhes) VALUES (?, ?, ?, ?)';
        await pool.execute(sql, [usuario_id, usuario_nome, acao, detalhes]);
    } catch (err) {
        console.error('Falha ao registrar log:', err.message);
    }
}

async function enviarNotificacaoSenhaAlterada(usuario_id, usuario_nome, email) {
    console.log(`[NOTIFICAÇÃO] Senha do usuário ${usuario_nome} (ID: ${usuario_id}, E-mail: ${email}) foi alterada. Disparar SMS/E-mail aqui.`);
}

/**
 * Gera o próximo ID sequencial para uma Ordem de Serviço (OS) baseado no mês e ano.
 * Ex: 0925-0001
 * @param {mysql.PoolConnection} connection - A conexão de banco de dados a ser usada (para transações).
 * @returns {Promise<string>} O próximo ID de OS formatado.
 */
async function gerarProximoOsId(connection) {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    const prefixo = `${mm}${yy}`;
    
    let proximoNumero = 1;
    const [lastOs] = await connection.execute(
        'SELECT id FROM ordens_servico WHERE id LIKE ? ORDER BY id DESC LIMIT 1',
        [`${prefixo}-%`]
    );

    if (lastOs.length > 0) {
        const lastNumber = parseInt(lastOs[0].id.split('-')[1]);
        proximoNumero = lastNumber + 1;
    }
    return `${prefixo}-${String(proximoNumero).padStart(4, '0')}`;
}

/**
 * Gera o próximo ID sequencial para um Orçamento (Cotação) baseado no mês e ano.
 * Ex: COT-0925-0001
 * @param {mysql.PoolConnection} [connection] - Conexão opcional para transações.
 * @returns {Promise<string>} O próximo UID de orçamento formatado.
 */
async function getNextOrcamentoUID(connection) {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    const prefixo = `COT-${mm}${yy}-`;

    const sql = 'SELECT orcamento_uid FROM orcamentos WHERE orcamento_uid LIKE ? ORDER BY orcamento_uid DESC LIMIT 1';
    const db = connection || pool; 
    const [lastRows] = await db.execute(sql, [`${prefixo}%`]);

    let proximoNumero = 1;
    if (lastRows.length > 0) {
        
        const lastNumber = parseInt(lastRows[0].orcamento_uid.split('-')[2]);
        proximoNumero = lastNumber + 1;
    }
    return `${prefixo}${String(proximoNumero).padStart(4, '0')}`;
}

const reportDependencies = { pool, authMiddleware };
const routeDependencies = {
    pool,
    bcrypt,
    jwt,
    SECRET_KEY,
    authMiddleware,
    permissionMiddleware,
    adminGeralMiddleware, 
    upload, 
    registrarLog,
    enviarNotificacaoSenhaAlterada,
    sesClient,
    SendEmailCommand,
    crypto
};

const clientDependencies = {
    pool,
    authMiddleware,
    permissionMiddleware,
    adminGeralMiddleware,
    registrarLog,
    Parser,
    uploadInMemory,
    PERMISSAO_CLIENTES_CRUD 
};

const driverDependencies = {
    pool,
    authMiddleware,
    permissionMiddleware,
    registrarLog,
    upload: uploadInMemory,
    XLSX
};

const vehicleDependencies = {
    pool,
    authMiddleware,
    permissionMiddleware,
    registrarLog,
    uploadManutencao 
};

const systemHubDependencies = {
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
};

const kanbanDependencies = {
    pool,
    authMiddleware,
    adminGeralMiddleware, // Incluído para rotas que o utilizam
    permissionMiddleware, 
    registrarLog
};

const supportRoutes = require('./routes/routesSupport');
const simulatorRoutes = require('./routes/routesSimulator');
const financialRoutes = require('./routes/routesFinancial');
const dashboardRoutes = require('./routes/routesDashboard');
const userRoutes = require('./routes/routesUsers');
const logsRoutes = require('./routes/routesLogs');
const clientRoutes = require('./routes/routesClients');
const reportRoutes = require('./routes/routesReports');
const driverRoutes = require('./routes/routesDrivers');
const vehicleRoutes = require('./routes/routesVehicles');
const systemHubRoutes = require('./routes/routesSystemHub');
const supportConfigRoutes = require('./routes/routesSupportConfig');
const routesGmud = require('./routes/routesGmud');
const knowledgeRoutes = require('./routes/routesKnowledge');
const kanbanRoutes = require('./routes/routesTasks');
const tagRoutes = require('./routes/routesTags');
const templateRoutes = require('./routes/routesTemplates');
const publicRoutes = require('./routes/publicRoutes');


// CORRIJA ESTA SEÇÃO NO SEU CÓDIGO

// Prefixo de financialRoutes corrigido para '/api'
app.use('/api', financialRoutes(pool, authMiddleware, permissionMiddleware, registrarLog, uploadRecibo, uploadInMemory));

// Chamadas de função padronizadas e prefixos corrigidos
app.use('/api', supportRoutes(pool, io, authMiddleware, permissionMiddleware, PERMISSAO_SUPORTE, uploadSuporte, onlineUsers, getUser));
app.use('/api', simulatorRoutes(pool, authMiddleware, permissionMiddleware, registrarLog, gerarProximoOsId, getNextOrcamentoUID));
app.use('/api/usuarios', userRoutes(routeDependencies));
app.use('/api/logs', logsRoutes(pool, authMiddleware, permissionMiddleware, Parser));
app.use('/api', dashboardRoutes(pool, authMiddleware, permissionMiddleware));
app.use('/api/clients', clientRoutes(clientDependencies));
app.use('/api/reports', reportRoutes(reportDependencies));
app.use('/api/drivers', driverRoutes(driverDependencies));
app.use('/api/vehicles', vehicleRoutes(vehicleDependencies));
app.use('/api/system-hub', systemHubRoutes(systemHubDependencies));
app.use('/api/admin/suporte-config', supportConfigRoutes(pool, authMiddleware, permissionMiddleware));
app.use('/api/gmud', routesGmud(pool, authMiddleware, adminGeralMiddleware, io));
app.use('/api', knowledgeRoutes(pool, authMiddleware, permissionMiddleware));
app.use('/api/tasks', kanbanRoutes(kanbanDependencies));
app.use('/api/tags', tagRoutes(pool, authMiddleware, permissionMiddleware));
app.use('/api/templates', templateRoutes(pool, authMiddleware, permissionMiddleware));
app.use('/api', publicRoutes(pool));

// --- ROTAS DE ORDENS DE SERVIÇO ---
app.get('/api/ordens', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional', 'financeiro']), async (req, res) => {
    const { status, query, motorista_id, data_criacao, data_conclusao } = req.query;
    let sql = 'SELECT * FROM ordens_servico';
    let params = [];
    let conditions = [];
    if (status) {
        conditions.push('status = ?');
        params.push(status);
    }
    if (query) {
        conditions.push('(descricao LIKE ? OR id LIKE ? OR local_atendimento LIKE ?)');
        params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    if (motorista_id) {
        conditions.push('motorista_id = ?');
        params.push(motorista_id);
    }
    if (data_criacao) {
        conditions.push('DATE(data_criacao) = ?');
        params.push(data_criacao);
    }
    if (data_conclusao) {
        conditions.push('DATE(data_conclusao) = ?');
        params.push(data_conclusao);
    }
    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    try {
        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ordens', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional']), async (req, res) => {
    const { cliente_id, motorista_id, veiculo_id, local_atendimento, descricao, data_criacao, valor } = req.body;
    const atendenteId = req.user.id;
    const statusInicial = 'Na Fila';
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    const prefixo = `${mm}${yy}`;
    let proximoNumero = 1;
    try {
        const [lastOs] = await pool.execute('SELECT id FROM ordens_servico WHERE id LIKE ? ORDER BY id DESC LIMIT 1', [`${prefixo}-%`]);
        if (lastOs.length > 0) {
            const lastNumber = parseInt(lastOs[0].id.split('-')[1]);
            proximoNumero = lastNumber + 1;
        }
    } catch (err) {
        return res.status(500).json({ error: 'Falha ao gerar ID da OS.' });
    }
    const novoId = `${prefixo}-${String(proximoNumero).padStart(4, '0')}`;
    const sql = `INSERT INTO ordens_servico (id, cliente_id, motorista_id, veiculo_id, local_atendimento, descricao, data_criacao, status, valor, criado_por_usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    try {
        const params = [novoId, cliente_id, motorista_id, veiculo_id, local_atendimento, descricao, data_criacao, statusInicial, valor, atendenteId];
        if (params.some(p => p === undefined)) {
            return res.status(400).json({ error: 'Um ou mais campos obrigatórios estão faltando.' });
        }
        await pool.execute(sql, params);
        
        const detalhes = `OS #${novoId} criada. Descrição: ${descricao}`;
        await registrarLog(req.user.id, req.user.nome, 'OS_CRIADA', detalhes);

        res.status(201).json({ id: novoId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/ordens/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional', 'financeiro']), async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.execute('SELECT * FROM ordens_servico WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Ordem de Serviço não encontrada.' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/ordens/:id/status', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional']), async (req, res) => {
    const { status: novoStatus } = req.body;
    const osId = req.params.id;
    const usuarioLogadoId = req.user.id;

    const regrasDeTransicao = {
        'Na Fila': ['Agendado', 'Cancelado', 'Em Andamento'],
        'Agendado': ['Em Andamento', 'Cancelado'],
        'Em Andamento': ['Concluído', 'Cancelado', 'Agendado'],
        'Concluído': [],
        'Cancelado': [],
        'Lançamento Excluído': []
    };

    try {
        const [osRows] = await pool.execute('SELECT status FROM ordens_servico WHERE id = ?', [osId]);
        if (osRows.length === 0) {
            return res.status(404).json({ error: 'Ordem de Serviço não encontrada.' });
        }
        const statusAtual = osRows[0].status;
        if (!regrasDeTransicao[statusAtual]?.includes(novoStatus)) {
            return res.status(400).json({ error: `Mudança de status inválida: de "${statusAtual}" para "${novoStatus}".` });
        }

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            let sqlUpdateOS = 'UPDATE ordens_servico SET status = ?';
            const paramsUpdateOS = [novoStatus];
            
            if (novoStatus === 'Concluído') {
                const dataConclusao = new Date().toISOString().slice(0, 19).replace('T', ' ');
                sqlUpdateOS += ', data_conclusao = ?, concluido_por_usuario_id = ?';
                paramsUpdateOS.push(dataConclusao, usuarioLogadoId);
            }
            
            sqlUpdateOS += ' WHERE id = ?';
            paramsUpdateOS.push(osId);

            console.log('--- DEBUG: ATUALIZANDO STATUS DA OS ---');
            console.log('SQL:', sqlUpdateOS);
            console.log('PARAMS:', paramsUpdateOS);
            console.log('-----------------------------------------');

            await connection.execute(sqlUpdateOS, paramsUpdateOS);

            if (novoStatus === 'Concluído') {
                const [ordemRows] = await connection.execute('SELECT valor, motorista_id FROM ordens_servico WHERE id = ?', [osId]);
                const ordemDeServico = ordemRows[0];
                if (ordemDeServico && ordemDeServico.valor > 0) {
                    const sqlInsertFinanceiro = `INSERT INTO financeiro (tipo, descricao, valor, data, os_id, motorista_id, categoria_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
                    const categoriaReceitaOS = 1;
                    const paramsFinanceiro = ['Receita', `Receita referente à OS #${osId}`, ordemDeServico.valor, new Date(), osId, ordemDeServico.motorista_id, categoriaReceitaOS];
                    await connection.execute(sqlInsertFinanceiro, paramsFinanceiro);
                }
            }

            const detalhes = `Status da OS #${osId} alterado para "${novoStatus}" pelo usuário ${req.user.nome}.`;
            await registrarLog(req.user.id, req.user.nome, 'OS_STATUS_ALTERADO', detalhes);

            await connection.commit();
            connection.release();
            res.json({ updated: true, message: 'Status da OS atualizado com sucesso.' });

        } catch (innerErr) {
            await connection.rollback();
            connection.release();
            throw innerErr;
        }
    } catch (err) {
        console.error("Erro ao atualizar status da OS:", err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Falha no processo de atualização.' });
        }
    }
});

app.put('/api/ordens/:id/reagendar', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional']), async (req, res) => {
    const { novaDataHora } = req.body;
    const osId = req.params.id;
    if (!novaDataHora) {
        return res.status(400).json({ error: 'A nova data e hora são obrigatórias.' });
    }
    const novaData = new Date(novaDataHora);
    if (novaData <= new Date()) {
        return res.status(400).json({ error: 'A data de reagendamento não pode ser no passado.' });
    }
    const sql = `UPDATE ordens_servico SET status = 'Agendado', data_criacao = ? WHERE id = ?`;
    try {
        const [result] = await pool.execute(sql, [novaData, osId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ordem de Serviço não encontrada.' });
        }
        res.json({ success: true, message: 'Ordem de Serviço reagendada com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: 'Falha ao reagendar a Ordem de Serviço.' });
    }
});

app.delete('/api/ordens/:id', authMiddleware, permissionMiddleware(['admin_geral']), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const osId = req.params.id;
        await connection.execute('DELETE FROM notas_chamado WHERE os_id = ?', [osId]);
        await connection.execute('DELETE FROM ordens_servico WHERE id = ?', [osId]);
        await connection.commit();
        connection.release();
        
        const detalhes = `Ordem de Serviço #${osId} foi excluída permanentemente.`;
        await registrarLog(req.user.id, req.user.nome, 'OS_EXCLUIDA', detalhes);

        res.json({ message: 'Ordem de serviço excluída com sucesso.' });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('Erro ao excluir ordem de serviço:', err.message);
        res.status(500).json({ error: 'Falha ao excluir ordem de serviço.' });
    }
});


app.get('/api/ordens/:id/notas', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional', 'financeiro']), async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.execute('SELECT * FROM notas_chamado WHERE os_id = ? ORDER BY data_criacao ASC', [id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ordens/:id/notas', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional']), async (req, res) => {
    const { autor, nota } = req.body;
    const { id: os_id } = req.params;

    console.log(`[LOG] Recebendo nova nota para OS #${os_id}. Autor: ${autor}, Nota: ${nota.substring(0,30)}...`);

    try {
        const sql = `INSERT INTO notas_chamado (os_id, autor, nota, data_criacao) VALUES (?, ?, ?, NOW())`;
        const [result] = await pool.execute(sql, [os_id, autor, nota]);

        const detalhes = `Nova nota adicionada à OS #${os_id}.`;
        await registrarLog(req.user.id, req.user.nome, 'OS_NOTA_ADICIONADA', detalhes);

        res.status(201).json({ id: result.insertId });
    } catch (err) {
        console.error(`[ERRO] Falha ao inserir nota na OS #${os_id}:`, err);
        res.status(500).json({ error: 'Falha ao salvar a nota no banco de dados. Verifique o console do servidor.' });
    }
});

app.get('/api/produtividade/usuario', authMiddleware, async (req, res) => {
    const { dataInicio, dataFim } = req.query;
    const usuarioId = req.user.id;

    if (!dataInicio || !dataFim) {
        return res.status(400).json({ error: 'As datas de início e fim são obrigatórias.' });
    }

    try {
        const endDate = `${dataFim} 23:59:59`;

        // CORREÇÃO: data_criacao -> data_hora
        const sqlCriadasCount = `SELECT COUNT(id) AS total FROM ordens_servico WHERE criado_por_usuario_id = ? AND data_hora BETWEEN ? AND ?`;
        const [criadasRows] = await pool.execute(sqlCriadasCount, [usuarioId, dataInicio, endDate]);
        
        // CORREÇÃO: data_conclusao -> data_resolucao
        const sqlConcluidasCount = `SELECT COUNT(id) AS total FROM ordens_servico WHERE concluido_por_usuario_id = ? AND data_resolucao BETWEEN ? AND ?`;
        const [concluidasRows] = await pool.execute(sqlConcluidasCount, [usuarioId, dataInicio, endDate]);
        
        // CORREÇÃO: data_criacao -> data_hora
        const sqlListaCriadas = `SELECT os.*, c.nome as nome_cliente FROM ordens_servico os LEFT JOIN clientes c ON os.cliente_id = c.id WHERE os.criado_por_usuario_id = ? AND os.data_hora BETWEEN ? AND ? ORDER BY os.data_hora DESC`;
        const [listaCriadas] = await pool.execute(sqlListaCriadas, [usuarioId, dataInicio, endDate]);
        
        // CORREÇÃO: data_conclusao -> data_resolucao
        const sqlListaConcluidas = `SELECT os.*, c.nome as nome_cliente FROM ordens_servico os LEFT JOIN clientes c ON os.cliente_id = c.id WHERE os.concluido_por_usuario_id = ? AND os.data_resolucao BETWEEN ? AND ? ORDER BY os.data_resolucao DESC`;
        const [listaConcluidas] = await pool.execute(sqlListaConcluidas, [usuarioId, dataInicio, endDate]);

        // CORREÇÃO: data_criacao -> data_hora | data_conclusao -> data_resolucao
        const sqlGrafico = `
            SELECT dia, SUM(criadas) as criadas, SUM(concluidas) as concluidas
            FROM (
                SELECT DATE_FORMAT(data_hora, '%Y-%m-%d') as dia, COUNT(id) as criadas, 0 as concluidas
                FROM ordens_servico
                WHERE criado_por_usuario_id = ? AND data_hora BETWEEN ? AND ?
                GROUP BY dia
                UNION ALL
                SELECT DATE_FORMAT(data_resolucao, '%Y-%m-%d') as dia, 0 as criadas, COUNT(id) as concluidas
                FROM ordens_servico
                WHERE concluido_por_usuario_id = ? AND data_resolucao BETWEEN ? AND ?
                GROUP BY dia
            ) as daily_stats
            WHERE dia IS NOT NULL
            GROUP BY dia
            ORDER BY dia;
        `;
        const [dadosGraficoBrutos] = await pool.execute(sqlGrafico, [usuarioId, dataInicio, endDate, usuarioId, dataInicio, endDate]);
        
        let dadosGraficoFinal = [];
        try {
            const diasNoIntervalo = eachDayOfInterval({ start: parseISO(dataInicio), end: parseISO(dataFim) });
            dadosGraficoFinal = diasNoIntervalo.map(date => {
                const diaFormatado = format(date, 'yyyy-MM-dd');
                const diaCurto = format(date, 'dd/MM');
                const dadosDoDia = dadosGraficoBrutos.find(d => d.dia === diaFormatado);
                return {
                    dia: diaCurto,
                    criadas: dadosDoDia ? parseInt(dadosDoDia.criadas) : 0,
                    concluidas: dadosDoDia ? parseInt(dadosDoDia.concluidas) : 0,
                };
            });
        } catch (dateError) {
             console.error("Erro ao processar o intervalo de datas:", dateError.message);
             dadosGraficoFinal = [];
        }

        res.json({
            ordensCriadas: criadasRows[0].total || 0,
            ordensConcluidas: concluidasRows[0].total || 0, 
            listaCriadas: listaCriadas,
            listaConcluidas: listaConcluidas,
            dadosGrafico: dadosGraficoFinal
        });

    } catch (err) {
        console.error("Erro ao buscar produtividade do usuário:", err.message);
        res.status(500).json({ error: 'Falha ao buscar dados de produtividade.' });
    }
});


app.get('/api/clientes-sistema/list', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    try {
        const sql = `
            SELECT
                cs.id, 
                cs.nome_empresa, 
                cs.max_licencas,
                (SELECT COUNT(*) 
                 FROM usuarios u 
                 WHERE u.cliente_id = cs.id AND u.licenca_chave_id IS NOT NULL) AS usuarios_ativos
            FROM 
                clientes_sistema cs
            ORDER BY 
                cs.nome_empresa ASC;
        `;
        const [clientes] = await pool.execute(sql);
        res.json(clientes);
    } catch (error) {
        console.error("Erro ao buscar lista de clientes do sistema:", error.message);
        res.status(500).json({ error: 'Falha ao buscar a lista de clientes.' });
    }
});



// ROTA PARA BUSCAR COMPROMISSOS (OS NA FILA E AGENDADAS) PARA O CALENDÁRIO DO DASHBOARD
app.get('/api/compromissos', authMiddleware, async (req, res) => {
    const { data } = req.query; 

    if (!data) {
        return res.status(400).json({ error: 'A data é um parâmetro obrigatório.' });
    }

    try {
        // CORREÇÃO: data_criacao -> data_hora
        const sql = `
            SELECT os.id, c.nome AS cliente_nome 
            FROM ordens_servico os
            LEFT JOIN clientes c ON os.cliente_id = c.id
            WHERE DATE(os.data_hora) = ? AND os.status IN ('Agendado', 'Na Fila')
            ORDER BY os.data_hora ASC
        `;
        const [compromissos] = await pool.execute(sql, [data]);
        res.json(compromissos);
    } catch (err) {
        console.error("Erro ao buscar compromissos:", err.message);
        res.status(500).json({ error: 'Falha ao buscar compromissos.' });
    }
});

// SUBSTITUA A ROTA /api/compromissos/mes PELA VERSÃO ABAIXO:
app.get('/api/compromissos/mes', authMiddleware, async (req, res) => {
    const { ano, mes } = req.query;

    if (!ano || !mes) {
        return res.status(400).json({ error: 'Ano e mês são obrigatórios.' });
    }

    try {
        // CORREÇÃO: data_criacao -> data_hora
        const sql = `
            SELECT DISTINCT DATE_FORMAT(data_hora, '%Y-%m-%d') AS dia
            FROM ordens_servico
            WHERE 
                YEAR(data_hora) = ? AND 
                MONTH(data_hora) = ? AND 
                status IN ('Agendado', 'Na Fila')
        `;
        const [rows] = await pool.execute(sql, [ano, mes]);
        const dias = rows.map(r => r.dia); 
        res.json(dias);
    } catch (err) {
        console.error("Erro ao buscar dias com compromissos:", err.message);
        res.status(500).json({ error: 'Falha ao buscar dados para o calendário.' });
    }
});


    // ✅ ROTA PÚBLICA PARA VERIFICAR O MODO MANUTENÇÃO
    // Rota: GET /api/public/system-status
    app.get('/api/public/system-status', async (req, res) => {
        try {
            const [[config]] = await pool.execute(
                "SELECT valor FROM configuracoes_sistema WHERE chave = 'modo_manutencao'"
            );

            if (!config) {
                console.warn("Aviso: Chave 'modo_manutencao' não encontrada no banco. Assumindo 'false'.");
                return res.json({ maintenanceMode: false });
            }

            res.json({ maintenanceMode: config.valor === 'true' });

        } catch (error) {
            console.error("Falha ao buscar status público de manutenção:", error.message);
            res.status(500).json({ 
                maintenanceMode: false, 
                error: "Falha ao verificar o status do servidor." 
            });
        }
    });

    // ✅ ROTA PÚBLICA PARA BUSCAR INFORMAÇÕES DE LOGIN PERSONALIZADO
    // Rota: GET /api/public/login-info/:identificador
    app.get('/api/public/login-info/:identificador', async (req, res) => {
        try {
            const { identificador } = req.params;
            
            const [rows] = await pool.execute(
                'SELECT nome_empresa, descricao, logo_url, login_image_url FROM clientes_sistema WHERE identificador = ? AND status = "ativo"',
                [identificador]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Cliente não encontrado ou inativo.' });
            }

            res.json(rows[0]);

        } catch (error) {
            console.error("Erro ao buscar informações públicas do cliente:", error.message);
            res.status(500).json({ error: 'Falha ao carregar informações de login.' });
        }
    });

// ROTA DE GESTÃO: Usada pela tela de Gestão de Conteúdo para listar as imagens
app.get('/api/slideshow/manage/images', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    try {
        const sql = `
            SELECT si.id, si.image_url, u.nome as criado_por_nome 
            FROM slideshow_images si 
            LEFT JOIN usuarios u ON si.criado_por_id = u.id 
            ORDER BY si.data_criacao DESC
        `;
        const [images] = await pool.execute(sql);
        res.json(images);
    } catch (error) {
        console.error("Erro ao buscar imagens para gestão:", error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// ROTA DE GESTÃO: Para fazer upload de uma nova imagem
app.post('/api/slideshow/manage/images', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), uploadSlideshow.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo de imagem enviado.' });
    }

    const MAX_IMAGES = 20;

    try {
        const [[{ count }]] = await pool.execute('SELECT COUNT(id) as count FROM slideshow_images');
        if (count >= MAX_IMAGES) {
            return res.status(400).json({ error: `O limite de ${MAX_IMAGES} imagens foi atingido.` });
        }

        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/slideshow/${req.file.filename}`;
        const criado_por_id = req.user.id;

        await pool.execute('INSERT INTO slideshow_images (image_url, criado_por_id) VALUES (?, ?)', [imageUrl, criado_por_id]);
        
        await registrarLog(req.user.id, req.user.nome, 'SLIDESHOW_UPLOAD', `Nova imagem adicionada: ${req.file.filename}`);

        res.status(201).json({ message: 'Imagem adicionada com sucesso!', imageUrl });

    } catch (err) {
        console.error("Erro no upload da imagem do slideshow:", err);
        res.status(500).json({ error: 'Falha ao salvar a imagem.' });
    }
});

// ROTA DE GESTÃO: Para deletar uma imagem
app.delete('/api/slideshow/manage/images/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const [imageRows] = await pool.execute('SELECT image_url FROM slideshow_images WHERE id = ?', [id]);
        if (imageRows.length > 0) {
            const fileName = imageRows[0].image_url.split('/').pop();
            const filePath = path.join(__dirname, 'uploads', 'slideshow', fileName);
            const fs = require('fs/promises');
            try {
                await fs.unlink(filePath);
            } catch (fsError) {
                console.warn(`Aviso: Não foi possível deletar o arquivo ${filePath}. Ele pode já ter sido removido.`, fsError.message);
            }
        }

        await pool.execute('DELETE FROM slideshow_images WHERE id = ?', [id]);
        
        await registrarLog(req.user.id, req.user.nome, 'SLIDESHOW_DELETE', `Imagem ID ${id} foi excluída.`);

        res.status(200).json({ message: 'Imagem excluída com sucesso.' });
    } catch (err) {
        console.error("Erro ao deletar imagem do slideshow:", err);
        res.status(500).json({ error: 'Falha ao excluir a imagem.' });
    }
});

// ROTA PARA MARCAR UM ANÚNCIO ESPECÍFICO COMO LIDO
app.post('/api/conteudo/anuncios/lido/:id', authMiddleware, async (req, res) => {
    const { id: anuncioId } = req.params;
    const { id: usuarioId } = req.user;

    try {
        const sql = 'INSERT IGNORE INTO anuncios_lidos (usuario_id, anuncio_id) VALUES (?, ?)';
        await pool.execute(sql, [usuarioId, anuncioId]);
        
        res.status(200).json({ message: 'Anúncio marcado como lido.' });
    } catch (error) {
        console.error("Erro ao marcar anúncio como lido:", error);
        res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
    }
});



// ROTA DE TESTE RÁPIDO
app.get('/test', (req, res) => {
    console.log("A rota /test foi acessada!");
    res.send('O servidor está respondendo!');
});

// ROTA PARA GESTÃO: Buscar TODOS os anúncios
app.get('/api/conteudo/anuncios', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    try {
        const [anuncios] = await pool.execute('SELECT a.*, u.nome as criado_por_nome FROM anuncios a LEFT JOIN usuarios u ON a.criado_por_id = u.id ORDER BY a.data_criacao DESC');
        res.json(anuncios);
    } catch (error) {
        console.error("Erro ao buscar todos os anúncios:", error);
        res.status(500).json({ error: 'Erro ao buscar todos os anúncios.' });
    }
});

// ROTA PARA GESTÃO: Criar um novo anúncio
app.post('/api/conteudo/anuncios', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), uploadAnuncio.single('imagem'), async (req, res) => {
    const { titulo, mensagem, ativo, data_inicio, data_fim, dest_perfis, dest_usuarios_ids } = req.body;
    const criado_por_id = req.user.id;
    const imagem_url = req.file ? `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}` : null;
    try {
        const query = 'INSERT INTO anuncios (titulo, mensagem, imagem_url, ativo, criado_por_id, data_inicio, data_fim, dest_perfis, dest_usuarios_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await pool.execute(query, [titulo, mensagem, imagem_url, ativo === 'true', criado_por_id, data_inicio || null, data_fim || null, dest_perfis || null, dest_usuarios_ids || null]);
        await registrarLog(req.user.id, req.user.nome, 'CRIACAO_ANUNCIO', `Anúncio '${titulo}' (ID: ${result.insertId}) foi criado.`);
        const [newAnuncio] = await pool.execute('SELECT a.*, u.nome as criado_por_nome FROM anuncios a LEFT JOIN usuarios u ON a.criado_por_id = u.id WHERE a.id = ?', [result.insertId]);
        res.status(201).json(newAnuncio[0]);
    } catch (error) {
        console.error("Erro ao criar anúncio:", error);
        res.status(500).json({ error: 'Erro ao criar anúncio.' });
    }
});

// ROTA PARA GESTÃO: Atualizar um anúncio
app.put('/api/conteudo/anuncios/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), uploadAnuncio.single('imagem'), async (req, res) => {
    const { id } = req.params;
    const { titulo, mensagem, ativo, data_inicio, data_fim, dest_perfis, dest_usuarios_ids } = req.body;
    try {
        const [existingAnuncioRows] = await pool.execute('SELECT imagem_url FROM anuncios WHERE id = ?', [id]);
        if (existingAnuncioRows.length === 0) return res.status(404).json({ error: "Anúncio não encontrado." });
        const imagem_url = req.file ? `${req.protocol}://${req.get('host')}/${req.file.path.replace(/\\/g, "/")}` : existingAnuncioRows[0].imagem_url;
        const query = 'UPDATE anuncios SET titulo = ?, mensagem = ?, imagem_url = ?, ativo = ?, data_inicio = ?, data_fim = ?, dest_perfis = ?, dest_usuarios_ids = ? WHERE id = ?';
        await pool.execute(query, [titulo, mensagem, imagem_url, ativo === 'true', data_inicio || null, data_fim || null, dest_perfis || null, dest_usuarios_ids || null, id]);
        await registrarLog(req.user.id, req.user.nome, 'ATUALIZACAO_ANUNCIO', `Anúncio '${titulo}' (ID: ${id}) foi atualizado.`);
        const [updatedAnuncio] = await pool.execute('SELECT a.*, u.nome as criado_por_nome FROM anuncios a LEFT JOIN usuarios u ON a.criado_por_id = u.id WHERE a.id = ?', [id]);
        res.json(updatedAnuncio[0]);
    } catch (error) {
        console.error("Erro ao atualizar anúncio:", error);
        res.status(500).json({ error: 'Erro ao atualizar anúncio.' });
    }
});

// ROTA PARA GESTÃO: Deletar um anúncio
app.delete('/api/conteudo/anuncios/:id', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const [anuncioRows] = await pool.execute('SELECT titulo FROM anuncios WHERE id = ?', [id]);
        const titulo = anuncioRows.length > 0 ? anuncioRows[0].titulo : `ID ${id}`;
        
        await pool.execute('DELETE FROM anuncios_lidos WHERE anuncio_id = ?', [id]);
        await pool.execute('DELETE FROM anuncios WHERE id = ?', [id]);
        
        await registrarLog(req.user.id, req.user.nome, 'DELECAO_ANUNCIO', `Anúncio '${titulo}' (ID: ${id}) foi excluído.`);
        
        res.status(200).json({ message: 'Anúncio excluído com sucesso.' });
    } catch (error) {
        console.error("Erro ao excluir anúncio:", error);
        res.status(500).json({ error: 'Erro ao excluir anúncio.' });
    }
});


// LÓGICA DE FILTRAGEM - ROTA PARA DASHBOARD (MODAL)
app.get('/api/conteudo/anuncios-ativos', authMiddleware, async (req, res) => {
    const { id: usuarioId, perfil: usuarioPerfil } = req.user;
    try {
        const query = `
            SELECT * FROM (
                (
                    -- Busca Anúncios Locais não lidos
                    SELECT 
                        a.id, a.titulo, a.mensagem, a.imagem_url, 'anuncio' as tipo, a.data_criacao
                    FROM anuncios a
                    LEFT JOIN anuncios_lidos al ON a.id = al.anuncio_id AND al.usuario_id = ?
                    WHERE 
                        a.ativo = 1 
                        AND (a.data_inicio IS NULL OR CURDATE() >= a.data_inicio)
                        AND (a.data_fim IS NULL OR CURDATE() <= a.data_fim)
                        AND al.id IS NULL
                        AND (
                            ((a.dest_perfis IS NULL OR JSON_LENGTH(a.dest_perfis) = 0) AND (a.dest_usuarios_ids IS NULL OR JSON_LENGTH(a.dest_usuarios_ids) = 0))
                            OR (JSON_CONTAINS(a.dest_perfis, JSON_QUOTE(?)))
                            OR (JSON_CONTAINS(a.dest_usuarios_ids, CAST(? AS JSON)))
                        )
                )
                UNION ALL
                (
                    -- Busca Anúncios Globais não lidos
                    SELECT 
                        ag.id, ag.titulo, ag.mensagem, NULL as imagem_url, 'anuncio_global' as tipo, ag.criado_em as data_criacao
                    FROM anuncios_globais ag
                    LEFT JOIN anuncios_globais_vistos agv ON ag.id = agv.anuncio_id AND agv.usuario_id = ?
                    WHERE 
                        ag.status = 'ativo'
                        AND (ag.data_expiracao IS NULL OR ag.data_expiracao >= CURDATE())
                        AND (ag.publico_alvo = 'todos' OR ag.publico_alvo = ?)
                        AND agv.anuncio_id IS NULL
                )
            ) as all_announcements
            ORDER BY data_criacao DESC
            LIMIT 1;
        `;
        const params = [usuarioId, usuarioPerfil, usuarioId, usuarioId, usuarioPerfil];
        const [anuncios] = await pool.execute(query, params);
        res.json(anuncios);
    } catch (error) {
        console.error("Erro ao buscar anúncios ativos unificados:", error);
        res.status(500).json({ error: 'Erro ao buscar anúncios ativos.' });
    }
});

//ROTA PRINCIPAL PARA O SINO DE NOTIFICAÇÕES (VERSÃO CORRIGIDA E UNIFICADA)
app.get('/notificacoes', authMiddleware, async (req, res) => {
    const { id: usuarioId, perfil: usuarioPerfil } = req.user;
    try {
        const query = `
            (
                -- Parte 1: Anúncios Locais (por cliente)
                SELECT 
                    a.id, a.titulo, a.mensagem, a.imagem_url, 
                    'anuncio' as tipo, a.data_criacao, NULL as link_id,
                    (SELECT COUNT(*) FROM anuncios_lidos WHERE anuncio_id = a.id AND usuario_id = ?) > 0 as lida
                FROM anuncios a 
                WHERE a.ativo = 1
                AND (a.data_inicio IS NULL OR CURDATE() >= a.data_inicio)
                AND (a.data_fim IS NULL OR CURDATE() <= a.data_fim)
                AND (
                    ((a.dest_perfis IS NULL OR JSON_LENGTH(a.dest_perfis) = 0) AND (a.dest_usuarios_ids IS NULL OR JSON_LENGTH(a.dest_usuarios_ids) = 0))
                    OR (JSON_CONTAINS(a.dest_perfis, JSON_QUOTE(?)))
                    OR (JSON_CONTAINS(a.dest_usuarios_ids, CAST(? AS JSON)))
                )
            )
            UNION ALL
            (
                -- Parte 2: Notificações do Sistema (Licenças, KB, etc.)
                SELECT 
                    n.id,
                    CASE
                        WHEN n.tipo = 'aprovacao_kb' THEN 'Aprovação de Artigo Pendente'
                        WHEN n.tipo = 'decisao_kb' THEN 'Artigo Avaliado'
                        WHEN n.tipo = 'solicitacao_licenca' THEN 'Nova Solicitação de Licença'
                        WHEN n.tipo = 'decisao_licenca' THEN 'Resposta da Solicitação de Licença'
                        ELSE 'Notificação do Sistema'
                    END as titulo,
                    n.mensagem, NULL as imagem_url, n.tipo,
                    n.data_criacao, n.link_id, n.lida
                FROM notificacoes n
                WHERE n.usuario_id = ?
            )
            UNION ALL
            (
                -- Parte 3: Anúncios Globais (do SystemHub)
                SELECT
                    ag.id, ag.titulo, ag.mensagem, NULL as imagem_url,
                    'anuncio_global' as tipo, ag.criado_em as data_criacao, NULL as link_id,
                    (SELECT COUNT(*) FROM anuncios_globais_vistos WHERE anuncio_id = ag.id AND usuario_id = ?) > 0 as lida
                FROM anuncios_globais ag
                WHERE ag.status = 'ativo'
                AND (ag.data_expiracao IS NULL OR ag.data_expiracao >= CURDATE())
                AND (
                    ag.publico_alvo = 'todos'
                    OR ag.publico_alvo = ? 
                    OR (ag.publico_alvo = 'admins' AND ? IN ('admin_geral', 'admin')) -- <-- ALTERAÇÃO AQUI
                )
            )
            ORDER BY data_criacao DESC
            LIMIT 20;
        `;
        
        // A lista de parâmetros foi atualizada para incluir os da nova consulta
        const params = [
            usuarioId, usuarioPerfil, usuarioId, // Para Anúncios Locais
            usuarioId,                           // Para Notificações do Sistema
            usuarioId, usuarioPerfil, usuarioPerfil // Para Anúncios Globais
        ];
        
        const [notificacoes] = await pool.execute(query, params);
        const notificacoesFormatadas = notificacoes.map(n => ({...n, lida: !!n.lida}));
        
        res.json(notificacoesFormatadas);
        
    } catch (error) {
        console.error("Erro ao buscar notificações unificadas:", error);
        res.status(500).json({ error: 'Erro ao buscar notificações.' });
    }
});

// *** NOVA ROTA *** PARA MARCAR TODAS AS NOTIFICAÇÕES COMO LIDAS
app.post('/notificacoes/marcar-todas-lidas', authMiddleware, async (req, res) => {
    const usuarioId = req.user.id;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // --- Parte 1: Marca os ANÚNCIOS como lidos (lógica antiga) ---
        const [anunciosNaoLidos] = await connection.execute(`
            SELECT a.id FROM anuncios a
            LEFT JOIN anuncios_lidos al ON a.id = al.anuncio_id AND al.usuario_id = ?
            WHERE a.ativo = 1 AND al.id IS NULL
        `, [usuarioId]);

        if (anunciosNaoLidos.length > 0) {
            const valoresParaInserir = anunciosNaoLidos.map(anuncio => [usuarioId, anuncio.id]);
            await connection.query('INSERT IGNORE INTO anuncios_lidos (usuario_id, anuncio_id) VALUES ?', [valoresParaInserir]);
        }
        // --- Parte 2 (ADICIONADA): Marca as NOTIFICAÇÕES como lidas ---
        await connection.execute(
            "UPDATE notificacoes SET lida = 1 WHERE usuario_id = ? AND lida = 0",
            [usuarioId]
        );

        await connection.commit();
        res.status(200).json({ message: 'Todas as notificações foram marcadas como lidas.' });

    } catch (error) {
        await connection.rollback();
        console.error("Erro ao marcar todas as notificações como lidas:", error);
        res.status(500).json({ error: 'Erro ao processar a solicitação.' });
    } finally {
        connection.release();
    }
});

// ROTA: Marcar notificação como lida
app.post('/api/notificacoes/:id/lida', authMiddleware, async (req, res) => {
    try {
        await pool.execute("UPDATE notificacoes SET lida = 1 WHERE id = ? AND usuario_id = ?", [req.params.id, req.user.id]);
        res.sendStatus(200);
    } catch (error) {
        res.status(500).json({ error: 'Falha ao marcar como lida.' });
    }
});

app.post('/ordens/:id/anexos', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'operacional']), async (req, res) => {
    const { autor, fileName, fileData } = req.body;
    const { id: os_id } = req.params;

    if (!fileName || !fileData) {
        return res.status(400).json({ error: 'Dados do anexo em falta.' });
    }
    const notaTexto = `Anexo adicionado: ${fileName}`;
    const sql = `INSERT INTO notas_chamado (os_id, autor, nota, tipo, nome_anexo, url_anexo, data_criacao) VALUES (?, ?, ?, 'anexo', ?, ?, NOW())`;
    
    try {
        const [result] = await pool.execute(sql, [os_id, autor, notaTexto, fileName, fileData]);
        
        const detalhes = `Anexo "${fileName}" adicionado à OS #${os_id}.`;
        await registrarLog(req.user.id, req.user.nome, 'OS_ANEXO_ADICIONADO', detalhes);

        res.status(201).json({ id: result.insertId, message: 'Anexo guardado com sucesso.' });
    } catch (err) {
        console.error("Erro ao guardar anexo:", err.message);
        res.status(500).json({ error: 'Falha ao guardar o anexo.' });
    }
});


app.get('/ordens/motorista/:id', authMiddleware, async (req, res) => {
    const { id: motoristaId } = req.params;
    try {
        const sql = 'SELECT * FROM ordens_servico WHERE motorista_id = ? ORDER BY data_criacao DESC';
        const [rows] = await pool.execute(sql, [motoristaId]);
        res.json(rows);
    } catch (err) {
        console.error("Erro ao buscar ordens do motorista:", err.message);
        res.status(500).json({ error: 'Falha ao buscar ordens.' });
    }
});

app.get('/dashboard/motorista/:id/produtividade', authMiddleware, async (req, res) => {
    const { id: motoristaId } = req.params;
    try {
        const sql = `
            SELECT 
                DATE_FORMAT(d.d, '%d/%m') AS dia,
                COUNT(os.id) AS concluidas
            FROM 
                (SELECT CURDATE() - INTERVAL (a.a + (10 * b.a) + (100 * c.a)) DAY AS d
                 FROM (SELECT 0 AS a UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) AS a
                 CROSS JOIN (SELECT 0 AS a UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) AS b
                 CROSS JOIN (SELECT 0 AS a UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) AS c
                ) AS d
            LEFT JOIN ordens_servico os ON DATE(os.data_conclusao) = d.d AND os.motorista_id = ? AND os.status = 'Concluído'
            WHERE d.d BETWEEN CURDATE() - INTERVAL 6 DAY AND CURDATE()
            GROUP BY d.d
            ORDER BY d.d ASC;
        `;
        const [rows] = await pool.execute(sql, [motoristaId]);
        res.json(rows);
    } catch (err) {
        console.error("Erro ao buscar produtividade do motorista:", err.message);
        res.status(500).json({ error: 'Falha ao buscar dados do gráfico.' });
    }
});

app.get('/api/search-linkables', authMiddleware, async (req, res) => {
    const { query } = req.query;
    if (!query || query.length < 2) {
        return res.json([]);
    }

    try {
        const searchQuery = `%${query}%`;

        const [tarefas] = await pool.execute(
            'SELECT id, titulo FROM tarefas WHERE titulo LIKE ? LIMIT 5',
            [searchQuery]
        );
        const tarefasResult = tarefas.map(t => ({ id: `tarefa-${t.id}`, titulo: t.titulo, tipo: 'Tarefa' }));

        const [ordens] = await pool.execute(
            'SELECT id, descricao FROM ordens_servico WHERE id LIKE ? OR descricao LIKE ? LIMIT 5',
            [searchQuery, searchQuery]
        );
        const ordensResult = ordens.map(os => ({ id: `os-${os.id}`, titulo: `#${os.id}: ${os.descricao.substring(0, 50)}...`, tipo: 'OS' }));

        res.json([...tarefasResult, ...ordensResult]);
    } catch (error) {
        console.error("Erro ao buscar itens para vincular:", error);
        res.status(500).json({ error: 'Falha ao buscar itens.' });
    }
});

// ====================================================================================
// --- ROTAS DE LICENCIAMENTO PARA ADMINS DE CLIENTES ---
// ====================================================================================

// Rota para o ADMIN DO CLIENTE ver o status de suas licenças
app.get('/api/licensing/status', authMiddleware, async (req, res) => {
    if (!req.user.cliente_id) {
        return res.status(400).json({ error: 'Usuário não está associado a um cliente.' });
    }
    try {
        // Busca os detalhes do cliente
        const [clienteRows] = await pool.execute(
            'SELECT nome_empresa, max_licencas FROM clientes_sistema WHERE id = ?',
            [req.user.cliente_id]
        );
        if (clienteRows.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }
        
        // Conta os usuários ativos para aquele cliente
        const [userCountRows] = await pool.execute(
            'SELECT COUNT(id) as used FROM usuarios WHERE cliente_id = ?',
            [req.user.cliente_id]
        );

        res.json({
            clientName: clienteRows[0].nome_empresa,
            used: userCountRows[0].used,
            total: clienteRows[0].max_licencas
        });

    } catch (error) {
        res.status(500).json({ error: 'Falha ao buscar status da licença.' });
    }
});

// --- ROTA PARA O ADMIN DO CLIENTE buscar as chaves de licença DISPONÍVEIS ---
app.get('/api/licensing/available-keys', authMiddleware, permissionMiddleware(['admin']), async (req, res) => {
    const { cliente_id } = req.user;
    try {
        const [keys] = await pool.execute(
            'SELECT id, chave_licenca FROM licenca_chaves WHERE cliente_id = ? AND usuario_id_alocado IS NULL',
            [cliente_id]
        );
        res.json(keys);
    } catch (error) {
        console.error("Erro ao buscar chaves disponíveis:", error.message);
        res.status(500).json({ error: 'Falha ao buscar chaves disponíveis.' });
    }
});

app.put('/api/licensing/allocate', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    const { usuario_id, chave_id } = req.body;
    const { perfil: perfilLogado, cliente_id: clienteIdDoAdmin } = req.user;

    if (!usuario_id || !chave_id) {
        return res.status(400).json({ error: 'ID do usuário e da chave são obrigatórios.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Pega o cliente_id da chave para garantir a posse
        const [[keyData]] = await connection.execute(
            'SELECT cliente_id FROM licenca_chaves WHERE id = ? FOR UPDATE',
            [chave_id]
        );

        if (!keyData) {
            throw new Error('Chave de licença não encontrada.');
        }

        const targetClientId = keyData.cliente_id;

        // 2. Se o usuário logado for um admin (não geral), ele só pode alocar licenças do seu próprio cliente.
        if (perfilLogado === 'admin' && targetClientId !== clienteIdDoAdmin) {
            throw new Error('Você não tem permissão para alocar esta chave.');
        }

        // 3. Garante que a chave está disponível
        const [keyRows] = await connection.execute(
            'SELECT id FROM licenca_chaves WHERE id = ? AND usuario_id_alocado IS NULL FOR UPDATE',
            [chave_id]
        );
        if (keyRows.length === 0) {
            throw new Error('Chave de licença inválida ou já em uso.');
        }
        
        // 4. Garante que o usuário a receber a licença pertence ao mesmo cliente da chave
        const [[user]] = await connection.execute(
            'SELECT cliente_id FROM usuarios WHERE id = ?',
            [usuario_id]
        );
        if (!user || user.cliente_id !== targetClientId) {
             throw new Error('O usuário não pertence ao mesmo cliente desta licença.');
        }

        // 5. Desaloca qualquer licença antiga deste usuário, caso ele tenha uma
        await connection.execute(
            'UPDATE licenca_chaves SET usuario_id_alocado = NULL, data_alocacao = NULL WHERE usuario_id_alocado = ?',
            [usuario_id]
        );

        // 6. Aloca a nova chave ao usuário
        await connection.execute(
            'UPDATE licenca_chaves SET usuario_id_alocado = ?, data_alocacao = NOW() WHERE id = ?',
            [usuario_id, chave_id]
        );

        // 7. Atualiza a tabela de usuários com a referência da chave
        await connection.execute(
            'UPDATE usuarios SET licenca_chave_id = ? WHERE id = ?',
            [chave_id, usuario_id]
        );

        await connection.commit();
        
        await registrarLog(req.user.id, req.user.nome, 'LICENCA_ALOCADA', `Licença ID ${chave_id} alocada para usuário ID ${usuario_id}.`);

        res.json({ message: 'Licença alocada com sucesso!' });
    } catch (error) {
        await connection.rollback();
        console.error("Erro ao alocar licença:", error);
        res.status(400).json({ error: error.message || 'Falha ao alocar licença.' });
    } finally {
        connection.release();
    }
});

// Busca as licenças de um cliente. O Admin Geral informa o ID, o Admin de Cliente usa o seu próprio.
app.get('/api/licencas', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    const { perfil, cliente_id: clienteIdDoAdmin } = req.user;
    const { cliente_id: clienteIdQuery } = req.query; // Usado pelo admin_geral

    let targetClientId;

    if (perfil === 'admin_geral') {
        if (!clienteIdQuery) {
            // Se o admin_geral não especificar um cliente, retorna uma lista vazia.
            return res.json([]); 
        }
        targetClientId = clienteIdQuery;
    } else { // perfil === 'admin'
        targetClientId = clienteIdDoAdmin;
    }

    try {
        const sql = `
            SELECT 
                lc.id, 
                lc.chave_licenca,
                lc.data_alocacao,
                u.id as usuario_id_alocado,
                u.nome as usuario_nome,
                u.foto_perfil as usuario_foto
            FROM licenca_chaves lc
            LEFT JOIN usuarios u ON lc.usuario_id_alocado = u.id
            WHERE lc.cliente_id = ?
            ORDER BY lc.usuario_id_alocado DESC, lc.id ASC
        `;
        const [keys] = await pool.execute(sql, [targetClientId]);
        res.json(keys);
    } catch (error) {
        console.error("Erro ao buscar visão geral das chaves:", error.message);
        res.status(500).json({ error: 'Falha ao buscar as chaves de licença.' });
    }
});

// Para desalocar/liberar uma licença de um usuário
app.put('/api/licensing/deallocate', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    const { chave_id } = req.body;
    const { perfil, cliente_id } = req.user; // Pega o perfil do usuário logado
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Pega o ID do usuário atualmente alocado a essa chave
        const [[keyData]] = await connection.execute(
            'SELECT usuario_id_alocado, cliente_id FROM licenca_chaves WHERE id = ?',
            [chave_id]
        );

        if (!keyData) {
            throw new Error('Chave não encontrada.');
        }
        
        const usuarioIdAlocado = keyData.usuario_id_alocado;

        // 2. Adiciona a verificação de permissão:
        //    - Se o usuário for um 'admin', ele só pode desalocar licenças do seu próprio cliente.
        //    - Se for um 'admin_geral', esta verificação é ignorada.
        if (perfil === 'admin' && keyData.cliente_id !== cliente_id) {
            throw new Error('Você não tem permissão para desalocar esta licença.');
        }

        // 3. Libera a chave
        await connection.execute(
            'UPDATE licenca_chaves SET usuario_id_alocado = NULL, data_alocacao = NULL WHERE id = ?',
            [chave_id]
        );

        // 4. Se havia um usuário, remove a referência dele à chave
        if (usuarioIdAlocado) {
            await connection.execute(
                'UPDATE usuarios SET licenca_chave_id = NULL WHERE id = ?',
                [usuarioIdAlocado]
            );
        }

        await connection.commit();
        
        await registrarLog(req.user.id, req.user.nome, 'LICENCA_DESALOCADA', `Licença ID ${chave_id} foi desalocada.`);
        
        res.json({ message: 'Licença desalocada com sucesso!' });

    } catch (error) {
        await connection.rollback();
        console.error("Erro ao desalocar licença:", error);
        res.status(400).json({ error: error.message || 'Falha ao desalocar licença.' });
    } finally {
        connection.release();
    }
});



// --- ROTAS PARA SOLICITAÇÃO E APROVAÇÃO DE LICENÇAS ---

// Rota para o ADMIN DO CLIENTE criar uma nova solicitação de licença
app.post('/api/licensing/request', authMiddleware, async (req, res) => {
    // Apenas admins de clientes podem solicitar
    if (req.user.perfil !== 'admin') {
        return res.status(403).json({ error: 'Apenas administradores do cliente podem solicitar licenças.' });
    }

    const { licencas_solicitadas, justificativa } = req.body;
    const { id: solicitante_id, nome: solicitante_nome, cliente_id } = req.user;

    try {
        const connection = await pool.getConnection();

        // Pega as licenças atuais para registrar na solicitação
        const [[cliente]] = await connection.execute('SELECT max_licencas, nome_empresa FROM clientes_sistema WHERE id = ?', [cliente_id]);

        // Insere a solicitação
        const [result] = await connection.execute(
            `INSERT INTO solicitacoes_licenca (cliente_id, solicitante_id, solicitante_nome, licencas_atuais, licencas_solicitadas, justificativa) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [cliente_id, solicitante_id, solicitante_nome, cliente.max_licencas, licencas_solicitadas, justificativa]
        );
        const solicitacaoId = result.insertId;

        // CRIA A NOTIFICAÇÃO PARA O ADMIN GERAL
        const [adminsGerais] = await connection.execute("SELECT id FROM usuarios WHERE perfil = 'admin_geral'");

        console.log('[DEBUG] Usuários com perfil "admin_geral" encontrados:', adminsGerais);

        const mensagem = `${cliente.nome_empresa} solicitou ${licencas_solicitadas} novas licenças.`;
        
        for (const admin of adminsGerais) {
            await connection.execute(
                "INSERT INTO notificacoes (usuario_id, tipo, mensagem, link_id) VALUES (?, ?, ?, ?)",
                [admin.id, 'solicitacao_licenca', mensagem, solicitacaoId] // Usamos o ID da solicitação no link_id
            );
        }

        connection.release();
        res.status(201).json({ message: 'Solicitação enviada com sucesso!' });

    } catch (error) {
        console.error("Erro ao criar solicitação de licença:", error);
        res.status(500).json({ error: 'Falha ao processar a solicitação.' });
    }
});


// Rota para o ADMIN GERAL decidir sobre uma solicitação
app.put('/api/system-hub/licensing-requests/:id/decide', authMiddleware, adminGeralMiddleware, async (req, res) => {
    const { id: solicitacaoId } = req.params;
    const { decisao, novo_total_licencas, motivo_rejeicao } = req.body; // decisao = 'aprovada' ou 'rejeitada'
    const decisor_id = req.user.id;
    const connection = await pool.getConnection(); // Mova a conexão para o topo

    try {
        await connection.beginTransaction(); // Inicia a transação aqui

        const [[solicitacao]] = await connection.execute('SELECT * FROM solicitacoes_licenca WHERE id = ? FOR UPDATE', [solicitacaoId]);
        if (!solicitacao || solicitacao.status !== 'pendente') {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Solicitação não encontrada ou já processada.' });
        }

        let mensagemFeedback = '';

        if (decisao === 'aprovada') {
            // ATUALIZA O NÚMERO DE LICENÇAS DO CLIENTE
            await connection.execute(
                'UPDATE clientes_sistema SET max_licencas = ? WHERE id = ?',
                [novo_total_licencas, solicitacao.cliente_id]
            );

            // --- LÓGICA DE CRIAÇÃO DAS NOVAS CHAVES (ADICIONADO) ---
            const [[{ total_chaves }]] = await connection.execute(
                'SELECT COUNT(id) as total_chaves FROM licenca_chaves WHERE cliente_id = ?', 
                [solicitacao.cliente_id]
            );

            if (novo_total_licencas > total_chaves) {
                const chavesParaCriar = novo_total_licencas - total_chaves;
                for (let i = 0; i < chavesParaCriar; i++) {
                    const novaChave = `LIC-${solicitacao.cliente_id}-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
                    await connection.execute(
                        'INSERT INTO licenca_chaves (cliente_id, chave_licenca) VALUES (?, ?)',
                        [solicitacao.cliente_id, novaChave]
                    );
                }
            }
            // --- FIM DA LÓGICA DE CRIAÇÃO ---

            // ATUALIZA O STATUS DA SOLICITAÇÃO
            await connection.execute(
                "UPDATE solicitacoes_licenca SET status = 'aprovada', data_decisao = NOW(), decisor_id = ? WHERE id = ?",
                [decisor_id, solicitacaoId]
            );
            mensagemFeedback = `Sua solicitação de licenças foi APROVADA. Seu novo limite é de ${novo_total_licencas} usuários.`;

        } else { // Rejeitada
            await connection.execute(
                "UPDATE solicitacoes_licenca SET status = 'rejeitada', data_decisao = NOW(), decisor_id = ?, motivo_rejeicao = ? WHERE id = ?",
                [decisor_id, motivo_rejeicao, solicitacaoId]
            );
            mensagemFeedback = `Sua solicitação de licenças foi REJEITADA. Motivo: ${motivo_rejeicao}`;
        }

        // CRIA A NOTIFICAÇÃO DE FEEDBACK PARA O ADMIN DO CLIENTE
        await connection.execute(
            "INSERT INTO notificacoes (usuario_id, tipo, mensagem, link_id) VALUES (?, ?, ?, ?)",
            [solicitacao.solicitante_id, 'decisao_licenca', mensagemFeedback, solicitacao.cliente_id]
        );
        
        // Marca a notificação original do admin_geral como lida
        await connection.execute(
            "UPDATE notificacoes SET lida = 1 WHERE tipo = 'solicitacao_licenca' AND link_id = ?",
            [solicitacaoId]
        );

        const solicitanteOnline = getUser(solicitacao.solicitante_id);
        if (solicitanteOnline) {
            io.to(solicitanteOnline.socketId).emit('new_notification', {
                message: 'Você tem uma nova notificação!'
            });
            console.log(`[Socket.io] Notificação em tempo real enviada para o usuário ID: ${solicitacao.solicitante_id}`);
        }

        await connection.commit(); // Confirma a transação
        res.json({ message: `Solicitação ${decisao} com sucesso!` });

    } catch (error) {
        await connection.rollback(); // Desfaz em caso de erro
        console.error("Erro ao decidir sobre licença:", error);
        res.status(500).json({ error: 'Falha ao processar a decisão.' });
    } finally {
        connection.release();
    }
});

// Rota para o ADMIN DO CLIENTE criar uma nova solicitação de licença
app.post('/api/licensing/request', authMiddleware, async (req, res) => {
    // Apenas admins de clientes podem solicitar
    if (req.user.perfil !== 'admin') {
        return res.status(403).json({ error: 'Apenas administradores do cliente podem solicitar licenças.' });
    }

    const { licencas_solicitadas, justificativa } = req.body;
    const { id: solicitante_id, nome: solicitante_nome, cliente_id } = req.user;

    try {
        const connection = await pool.getConnection();

        // Pega as licenças atuais para registrar na solicitação
        const [[cliente]] = await connection.execute('SELECT max_licencas, nome_empresa FROM clientes_sistema WHERE id = ?', [cliente_id]);

        // Insere a solicitação
        const [result] = await connection.execute(
            `INSERT INTO solicitacoes_licenca (cliente_id, solicitante_id, solicitante_nome, licencas_atuais, licencas_solicitadas, justificativa) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [cliente_id, solicitante_id, solicitante_nome, cliente.max_licencas, licencas_solicitadas, justificativa]
        );
        const solicitacaoId = result.insertId;

        // CRIA A NOTIFICAÇÃO PARA O ADMIN GERAL
        const [adminsGerais] = await connection.execute("SELECT id FROM usuarios WHERE perfil = 'admin_geral'");
        const mensagem = `${cliente.nome_empresa} solicitou ${licencas_solicitadas} novas licenças.`;
        
        for (const admin of adminsGerais) {
            await connection.execute(
                "INSERT INTO notificacoes (usuario_id, tipo, mensagem, link_id) VALUES (?, ?, ?, ?)",
                [admin.id, 'solicitacao_licenca', mensagem, solicitacaoId]
            );
        }

        connection.release();
        res.status(201).json({ message: 'Solicitação enviada com sucesso!' });

    } catch (error) {
        console.error("Erro ao criar solicitação de licença:", error);
        res.status(500).json({ error: 'Falha ao processar a solicitação.' });
    }
});


// Rota para buscar todos os usuários (exceto o próprio usuário logado)
app.get('/api/chat/users', authMiddleware, async (req, res) => {
    try {
        const sql = "SELECT id, nome, foto_perfil FROM usuarios WHERE id != ?";
        const [users] = await pool.execute(sql, [req.user.id]);
        res.json(users);
    } catch (error) {
        console.error("Erro ao buscar usuários do chat:", error);
        res.status(500).json({ error: "Falha ao buscar usuários." });
    }
});

// Rota para buscar o histórico de uma conversa entre dois usuários
app.get('/api/chat/conversation/:partnerId', authMiddleware, async (req, res) => {
    try {
        const myId = req.user.id;
        const partnerId = req.params.partnerId;
        
        const sql = `
            SELECT id, sender_id, receiver_id, message, timestamp, status 
            FROM chat_messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY timestamp ASC
        `;
        const [messages] = await pool.execute(sql, [myId, partnerId, partnerId, myId]);
        res.json(messages);
    } catch (error) {
        console.error("Erro ao buscar conversa:", error);
        res.status(500).json({ error: "Falha ao buscar histórico de mensagens." });
    }
});

// Rota para salvar uma nova mensagem no banco
app.post('/api/chat/messages', authMiddleware, async (req, res) => {
    const { receiverId, message } = req.body;
    const senderId = req.user.id;
    try {
        const sql = "INSERT INTO chat_messages (sender_id, receiver_id, message) VALUES (?, ?, ?)";
        const [result] = await pool.execute(sql, [senderId, receiverId, message]);
        
        const [newMessage] = await pool.execute("SELECT * FROM chat_messages WHERE id = ?", [result.insertId]);
        
        res.status(201).json(newMessage[0]);
    } catch (error) {
        console.error("Erro ao salvar mensagem:", error);
        res.status(500).json({ error: "Falha ao enviar mensagem." });
    }
});

// Rota para marcar mensagens como lidas
app.put('/api/chat/conversation/:partnerId/read', authMiddleware, async (req, res) => {
    try {
        const myId = req.user.id;
        const partnerId = req.params.partnerId;
        
        const sql = "UPDATE chat_messages SET status = 'read' WHERE sender_id = ? AND receiver_id = ? AND status != 'read'";
        await pool.execute(sql, [partnerId, myId]);

        res.sendStatus(200);
    } catch (error) {
        console.error("Erro ao marcar mensagens como lidas:", error);
        res.status(500).json({ error: "Falha ao atualizar status das mensagens." });
    }
});

app.get('/api/announcements/global/active', authMiddleware, async (req, res) => { 
    try { 
        const userId = req.user.id; 
        const userProfile = req.user.perfil; 

        const sql = ` 
            SELECT ag.* FROM anuncios_globais ag 
            LEFT JOIN anuncios_globais_vistos agv ON ag.id = agv.anuncio_id AND agv.usuario_id = ? 
            WHERE 
                ag.status = 'ativo' 
                AND (ag.data_expiracao IS NULL OR ag.data_expiracao >= CURDATE()) 
                AND (ag.publico_alvo = 'todos' OR ag.publico_alvo = ?) 
                AND agv.anuncio_id IS NULL 
            ORDER BY ag.criado_em DESC 
            LIMIT 1 
        `; 

        const [anuncios] = await pool.execute(sql, [userId, userProfile]); 
        res.json(anuncios[0] || null); 
    } catch (error) { 
        console.error("Erro ao buscar anúncio ativo:", error); 
        res.status(500).json({ error: 'Falha ao buscar anúncio ativo.' }); 
    } 
}); 

app.post('/api/announcements/global/:id/dismiss', authMiddleware, async (req, res) => { 
    try { 
        const { id: anuncioId } = req.params; 
        const userId = req.user.id; 
        
        // INSERT IGNORE previne erros caso o registro já exista 
        const sql = 'INSERT IGNORE INTO anuncios_globais_vistos (anuncio_id, usuario_id) VALUES (?, ?)'; 
        await pool.execute(sql, [anuncioId, userId]); 
        
        res.status(200).json({ message: 'Anúncio marcado como visto.' }); 
    } catch (error) { 
        console.error("Erro ao dispensar anúncio:", error); 
        res.status(500).json({ error: 'Falha ao processar a solicitação.' }); 
    } 
}); 


// ====================================================================================
// --- LÓGICA DE VERIFICAÇÃO (CRON JOB) ---
// ====================================================================================

// Esta tarefa roda a cada minuto para verificar se há manutenções para iniciar ou terminar.
cron.schedule('* * * * *', async () => {
    // Usamos o nome da função que criei na resposta anterior,
    // mas colocamos a lógica diretamente aqui para seguir seu padrão.
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // --- Parte 1: Inicia manutenções que chegaram na hora ---
        const [schedulesToStart] = await connection.execute(
            "SELECT id, cliente_id FROM manutencoes_agendadas WHERE status = 'agendada' AND NOW() >= data_inicio"
        );

        if (schedulesToStart.length > 0) {
            console.log(`[Scheduler] Encontradas ${schedulesToStart.length} manutenções para iniciar.`);
            for (const schedule of schedulesToStart) {
                // Força o logout dos usuários afetados (se cliente_id for NULL, afeta todos)
                const [updateResult] = await connection.execute(
                    `UPDATE usuarios SET last_logout_at = UTC_TIMESTAMP() 
                     WHERE (cliente_id = ? OR ? IS NULL) AND perfil != 'admin_geral'`,
                    [schedule.cliente_id, schedule.cliente_id]
                );

                console.log(`[Scheduler] Manutenção ID ${schedule.id}: Forçado logout de ${updateResult.affectedRows} usuários.`);
                
                // Emite evento de logout forçado para os usuários online
                onlineUsers.forEach(user => {
                    // Verifica se a manutenção é global (cliente_id is null) OU se o cliente do usuário é o alvo
                    const isAffected = !schedule.cliente_id || user.clienteId === schedule.cliente_id;
                    if (isAffected && user.perfil !== 'admin_geral') {
                        user.socketIds.forEach(socketId => {
                            io.to(socketId).emit('force_logout', { message: 'O sistema está entrando em manutenção programada.' });
                        });
                    }
                });
                
                // Atualiza o status do agendamento para 'em_andamento'
                await connection.execute(
                    "UPDATE manutencoes_agendadas SET status = 'em_andamento' WHERE id = ?",
                    [schedule.id]
                );
            }
        }
        
        // --- Parte 2: Finaliza manutenções cujo tempo acabou ---
        const [schedulesToEnd] = await connection.execute(
            "SELECT id FROM manutencoes_agendadas WHERE status = 'em_andamento' AND NOW() >= data_fim"
        );

        if (schedulesToEnd.length > 0) {
            console.log(`[Scheduler] Encontradas ${schedulesToEnd.length} manutenções para finalizar.`);
            const idsToEnd = schedulesToEnd.map(s => s.id);
            const placeholders = idsToEnd.map(() => '?').join(',');

            await connection.execute(
                `UPDATE manutencoes_agendadas SET status = 'concluida' WHERE id IN (${placeholders})`,
                idsToEnd
            );
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        console.error("❌ Erro no CRON de manutenção:", error);
    } finally {
        if (connection) connection.release();
    }
});

// 1. Servir os arquivos estáticos (CSS, JS, Imagens do frontend) da pasta build
app.use(express.static(path.join(__dirname, 'build')));

// 2. Rota "catch-all" para servir o index.html do React
// IMPORTANTE: Esta deve ser uma das ÚLTIMAS rotas, antes do server.listen
// Ela garante que qualquer rota que não seja uma API caia no seu app React.
app.get('/{*any}', (req, res) =>{
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Finalização do Servidor
server.listen(port, () => {
  console.log(`🚀 Servidor backend rodando em http://localhost:${port} e WebSocket pronto!`);
});