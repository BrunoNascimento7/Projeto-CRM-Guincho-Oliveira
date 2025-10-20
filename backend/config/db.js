// backend/config/db.js

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); // Garante que ele ache o .env na pasta backend

// Constrói o caminho correto para o certificado, subindo duas pastas a partir de 'backend/config'
const caPath = path.join(__dirname, '..', '..', 'DigiCertGlobalRootG2.crt.pem');

// Verifica se o arquivo do certificado existe antes de tentar criar o pool
if (!fs.existsSync(caPath)) {
  console.error("❌ ERRO CRÍTICO: Certificado SSL não encontrado no caminho:", caPath);
  console.error("Verifique se o arquivo 'DigiCertGlobalRootG2.crt.pem' está na raiz do seu projeto.");
  process.exit(1); // Encerra a aplicação se não encontrar o certificado
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, // No seu .env está como DB_DATABASE
  port: 3306,
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  connectTimeout: 20000,
  
  // --- CONFIGURAÇÃO SSL CORRIGIDA E OBRIGATÓRIA PARA O AZURE ---
  ssl: {
    ca: fs.readFileSync(caPath)
  }
});

console.log('✅ Pool de conexões com o Banco de Dados Azure MySQL configurado com sucesso.');

module.exports = pool;