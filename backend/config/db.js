const mysql = require('mysql2/promise');
require('dotenv').config();
const fs = require('fs'); // Módulo para ler ficheiros
const path = require('path'); // Módulo para lidar com caminhos de ficheiros

// Constrói o caminho para o ficheiro ca.pem na raiz do projeto
const caPath = path.join(__dirname, '..', 'ca.pem');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, // Mantive o seu nome de variável
    port: process.env.DB_PORT || 4000, // Adicionado a porta do TiDB
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    
    // --- ADIÇÃO IMPORTANTE ---
    // Configuração de segurança (SSL) para o TiDB Cloud
    ssl: {
        // Lê o ficheiro de certificado que você descarregou
        ca: fs.readFileSync(caPath)
    }
});

module.exports = pool;