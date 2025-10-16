const jwt = require('jsonwebtoken');
const pool = require('../config/db'); // Importa a conexão com o banco
const SECRET_KEY = 'guincho_oliveira_secret'; // Mantenha a chave aqui ou no .env

async function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Formato de token inválido.' });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const [userRows] = await pool.execute('SELECT nome, last_logout_at FROM usuarios WHERE id = ?', [decoded.id]);
        
        if (userRows.length === 0) {
            return res.status(401).json({ error: 'Usuário do token não encontrado.' });
        }
        
        const user = userRows[0];
        const tokenIssuedAt = new Date(decoded.iat * 1000); 
        const lastLogoutAt = user.last_logout_at ? new Date(user.last_logout_at) : null;
        
        if (lastLogoutAt && tokenIssuedAt < lastLogoutAt) {
            return res.status(401).json({ error: 'Sessão encerrada remotamente. Por favor, faça login novamente.' });
        }

        decoded.nome = user.nome;
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
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

module.exports = { authMiddleware, permissionMiddleware };