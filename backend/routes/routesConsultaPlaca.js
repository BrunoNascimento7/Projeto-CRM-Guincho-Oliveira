// routes/routesConsultaPlaca.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

// **** IMPORTANTE: As chaves devem vir de variáveis de ambiente (process.env) ****
// Certifique-se de configurar estas variáveis no seu ambiente de execução (.env)
const APIBRASIL_DEVICE_TOKEN = process.env.APIBRASIL_DEVICE_TOKEN;
const APIBRASIL_BEARER_TOKEN = process.env.APIBRASIL_BEARER_TOKEN;
const APIBRASIL_URL = 'https://api.apibrasil.io/consulta-veicular/v1/placa'; // Confirme o endpoint

// Rota GET: /api/vehicles/consultar-placa
// Permissão: Não precisa de permissão específica, pois a rota é protegida pela API Key no server.
router.get('/consultar-placa', async (req, res) => {
    const { placa } = req.query;

    if (!placa) {
        return res.status(400).json({ error: 'A placa é obrigatória para a consulta.' });
    }

    // Validação de segurança para garantir que a consulta não seja chamada sem as chaves
    if (!APIBRASIL_BEARER_TOKEN || !APIBRASIL_DEVICE_TOKEN) {
        console.error('Chaves da APIBrasil ausentes nas variáveis de ambiente.');
        return res.status(500).json({ error: 'Configuração de API Key ausente no servidor.' });
    }

    try {
        const response = await axios.get(APIBRASIL_URL, {
            params: {
                placa: placa.toUpperCase().replace(/[^A-Z0-9]/g, ''), // Limpa a placa
            },
            headers: {
                // Autenticação segura via cabeçalhos
                'Authorization': `Bearer ${APIBRASIL_BEARER_TOKEN}`,
                'DeviceToken': APIBRASIL_DEVICE_TOKEN,
                'Content-Type': 'application/json',
            },
        });

        const veiculoData = response.data.data; 
        
        // Trata o caso de a API retornar sucesso, mas os dados veiculares não existirem
        if (!veiculoData) {
            return res.status(404).json({ error: 'Veículo não encontrado ou dados indisponíveis para esta placa.' });
        }
        
        // Mapeamento dos dados relevantes para o seu formulário
        const dadosMapeados = {
            marca: veiculoData.marca || 'Marca N/D',
            modelo: veiculoData.modelo || 'Modelo N/D',
            ano: veiculoData.anoFabricacao || '', 
            // Você pode mapear mais campos como cor, chassi, etc.
        };

        res.json(dadosMapeados);

    } catch (error) {
        console.error('Erro ao consultar APIBrasil:', error.response ? error.response.data : error.message);
        
        const errorMessage = error.response && error.response.data && error.response.data.message 
                           ? `Erro na API: ${error.response.data.message}`
                           : 'Erro desconhecido ao consultar a placa. Tente novamente.';
                           
        res.status(500).json({ error: errorMessage });
    }
});

module.exports = router;