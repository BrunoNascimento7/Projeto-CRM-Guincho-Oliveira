const axios = require('axios');

/**
 * Limpa e formata um número de telefone para o padrão E.164 (55DDNNNNNNNNN).
 * Remove caracteres não numéricos e garante que o '55' do Brasil esteja no início.
 * @param {string} telefone O número de telefone a ser formatado.
 * @returns {string|null} O número formatado ou nulo se a entrada for inválida.
 */
function formatarTelefone(telefone) {
    if (!telefone || typeof telefone !== 'string') {
        return null;
    }
    // Remove tudo que não for dígito
    const digitos = telefone.replace(/\D/g, '');

    // Se tiver menos de 10 dígitos (DDD + 8 dígitos), é inválido
    if (digitos.length < 10) {
        return null;
    }
    
    // Se já começar com 55 e tiver 12 ou 13 dígitos, está ok.
    if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
        return digitos;
    }

    // Se não começar com 55, adicionamos.
    return `55${digitos}`;
}

/**
 * Envia uma mensagem de SMS para um ou mais destinatários usando a API da Comtele.
 * @param {string[]} receiversArray Array de números de telefone já formatados.
 * @param {string} message A mensagem a ser enviada.
 * @returns {Promise<object>} A resposta da API da Comtele.
 */
async function enviarSms(receiversArray, message) {
    // Validação de entrada
    if (!receiversArray || receiversArray.length === 0 || !message) {
        throw new Error('Destinatários e mensagem são obrigatórios.');
    }

    const apiUrl = process.env.COMTELE_API_URL || 'https://api.comtele.com.br/messages/sms/send';
    const apiKey = process.env.COMTELE_API_KEY;

    if (!apiKey) {
        console.error("ERRO CRÍTICO: A variável de ambiente COMTELE_API_KEY não está definida.");
        throw new Error('A chave da API de SMS não está configurada no servidor.');
    }

    const payload = {
        receivers: receiversArray,
        message: message,
        route: 17 
    };

    const headers = {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
    };

    try {
        console.log(`Enviando SMS para ${receiversArray.length} destinatário(s)...`);
        const response = await axios.post(apiUrl, payload, { headers });
        console.log('Resposta da API Comtele:', response.data);
        return response.data;
    } catch (error) {
        console.error("Erro ao enviar SMS via Comtele:", error.response ? error.response.data : error.message);
        throw new Error('Falha ao se comunicar com o serviço de SMS.');
    }
}

module.exports = {
    enviarSms,
    formatarTelefone
};
