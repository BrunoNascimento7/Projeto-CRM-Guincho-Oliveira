// Arquivo: gerarHash.js
const bcrypt = require('bcrypt');

const senhaPlana = 'Project2025';
const saltRounds = 10; // O mesmo número de "rounds" que você usa na sua aplicação

bcrypt.hash(senhaPlana, saltRounds, function(err, hash) {
    if (err) {
        console.error("Erro ao gerar hash:", err);
        return;
    }
    console.log("Senha Plana:", senhaPlana);
    console.log("Hash Gerado (copie isso para o seu script SQL):");
    console.log(hash);
});