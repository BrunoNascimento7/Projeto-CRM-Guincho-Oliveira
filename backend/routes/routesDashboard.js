const express = require('express');
const router = express.Router();
const axios = require('axios');
const XLSX = require('xlsx');
const { eachDayOfInterval, format, parseISO } = require('date-fns');

// Este módulo exporta uma função que recebe as dependências e retorna o router configurado
module.exports = (pool, authMiddleware, permissionMiddleware) => {

// ROTA DE RESUMO DO DASHBOARD (SEGURA E OTIMIZADA)
router.get('/dashboard/resumo', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro', 'operacional']), async (req, res) => {
    const { periodo, dataInicio, dataFim } = req.query;
    
    let financeiroConditions = [];
    let despesasConditions = [];
    let osConditions = [];
    let params = [];
    let numParams = 0;

    // --- Lógica para determinar o filtro de data ---
    if (dataInicio && dataFim) {
        financeiroConditions.push('DATE(data) BETWEEN ? AND ?');
        despesasConditions.push('DATE(data_pagamento) BETWEEN ? AND ?');
        osConditions.push("DATE(data_conclusao) BETWEEN ? AND ?");
        params.push(dataInicio, dataFim, dataInicio, dataFim, dataInicio, dataFim);
        numParams = 6;
    } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        
        let filter = '';
        switch (periodo) {
            case 'hoje':
                filter = 'DATE(data) = CURDATE()';
                break;
            case 'semanal':
                filter = 'YEARWEEK(data, 1) = YEARWEEK(CURDATE(), 1)';
                break;
            case 'anual':
                filter = `YEAR(data) = ${year}`;
                break;
            case 'mensal':
            default:
                filter = `YEAR(data) = ${year} AND MONTH(data) = ${month}`;
                break;
        }
        financeiroConditions.push(filter);
        despesasConditions.push(filter.replace(/\bdata\b/g, 'data_pagamento'));
        osConditions.push(filter.replace(/\bdata\b/g, 'data_conclusao'));
    }

    try {
        // 1. Consulta Principal (Faturamento e Despesas da tabela 'financeiro')
        const mainQuery = `
            SELECT
                SUM(CASE WHEN UPPER(tipo) = 'RECEITA' THEN valor ELSE 0 END) AS faturamento,
                SUM(CASE WHEN UPPER(tipo) = 'DESPESA' THEN valor ELSE 0 END) AS despesas_financeiro
            FROM \`financeiro\`
            WHERE ${financeiroConditions.join(' AND ')}
        `;
        
        // 2. Consulta de Despesas Adicionais (da tabela 'despesas')
        const despesasAdicionaisQuery = `
            SELECT COALESCE(SUM(valor), 0) AS despesas_adicionais
            FROM \`despesas\`
            WHERE status = 'Paga' AND ${despesasConditions.join(' AND ')}
        `;
        
        // 3. Consulta de OS Concluídas (o ponto de falha no seu log)
        const osQuery = `
    SELECT COUNT(id) AS total 
    FROM \`ordens_servico\`
    WHERE UPPER(status) = 'CONCLUÍDO' 
    AND ${osConditions[0]}
`;
        
        const metaQuery = "SELECT valor FROM configuracoes WHERE chave = 'meta_lucro_mensal'";

        // Mapeia os parâmetros para as consultas na ordem correta
        const paramsMain = numParams === 6 ? [params[0], params[1]] : [];
        const paramsDespesas = numParams === 6 ? [params[2], params[3]] : [];
        const paramsOS = numParams === 6 ? [params[4], params[5]] : [];

        const [
            [mainResult],
            [despesasAdicionaisResult], 
            [osResult],
            [metaResult]
        ] = await Promise.all([
            pool.execute(mainQuery, paramsMain), 
            pool.execute(despesasAdicionaisQuery, paramsDespesas), 
            pool.execute(osQuery, paramsOS), 
            pool.execute(metaQuery)
        ]);

        const faturamento = parseFloat(mainResult[0].faturamento || 0);
        const despesasFinanceiro = parseFloat(mainResult[0].despesas_financeiro || 0);
        const despesasAdicionais = parseFloat(despesasAdicionaisResult[0].despesas_adicionais || 0);
        const despesasTotais = despesasFinanceiro + despesasAdicionais;
        
        res.json({
            faturamento,
            despesas: despesasTotais,
            lucro: faturamento - despesasTotais,
            servicosConcluidos: parseInt(osResult[0].total || 0),
            metaLucro: parseFloat(metaResult[0]?.valor || 10000),
        });
    } catch (err) {
        console.error("Erro na rota de resumo:", err);
        res.status(500).json({ error: 'Falha ao buscar dados do resumo.' });
    }
});

router.get('/dashboard/status-os', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT status, COUNT(*) as count 
            FROM ordens_servico 
            GROUP BY status
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Falha ao buscar status das OS.' });
    }
});

router.get('/dashboard/top-clientes', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT c.nome, SUM(os.valor) as total
            FROM ordens_servico os
            JOIN clientes c ON os.cliente_id = c.id
            WHERE os.status = 'Concluído'
            GROUP BY c.nome
            ORDER BY total DESC
            LIMIT 5;
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Falha ao buscar top clientes.' });
    }
});

router.get('/dashboard/faturamento-anual', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro', 'operacional']), async (req, res) => {
    try {
        const sql = `SELECT MONTH(data) AS mes, SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END) AS faturamento, SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END) AS despesas FROM financeiro WHERE YEAR(data) = YEAR(CURDATE()) GROUP BY MONTH(data) ORDER BY mes ASC;`;
        const [rows] = await pool.execute(sql);
        const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        const faturamentoData = Array(12).fill(0);
        const despesasData = Array(12).fill(0);
        rows.forEach(row => {
            const monthIndex = row.mes - 1;
            faturamentoData[monthIndex] = parseFloat(row.faturamento);
            despesasData[monthIndex] = parseFloat(row.despesas);
        });
        res.json({ labels, faturamentoData, despesasData });
    } catch (err) {
        res.status(500).json({ error: 'Falha ao buscar dados do gráfico.' });
    }
});

router.get('/dashboard/lucro-por-motorista', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    try {
        const sql = `SELECT m.nome AS nome_motorista, SUM(os.lucro) AS total_lucro FROM ordens_servico os JOIN motoristas m ON os.motorista_id = m.id WHERE os.status = 'Concluído' AND os.lucro > 0 GROUP BY m.id, m.nome ORDER BY total_lucro DESC;`;
        const [rows] = await pool.execute(sql);
        const labels = rows.map(row => row.nome_motorista);
        const data = rows.map(row => parseFloat(row.total_lucro));
        res.json({ labels, data });
    } catch (err) {
        res.status(500).json({ error: 'Falha ao buscar dados do gráfico.' });
    }
});

router.get('/dashboard/picos-faturamento', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    const { agruparPor } = req.query;
    try {
        let sql;
        const dataColuna = 'data_hora'; 

        if (agruparPor === 'dia') {
            sql = `SELECT DAYOFWEEK(${dataColuna}) as dia, SUM(valor) as faturamento_total FROM ordens_servico WHERE status = 'Concluído' AND YEAR(${dataColuna}) = YEAR(CURDATE()) GROUP BY dia ORDER BY dia ASC;`;
        } else {
            sql = `SELECT HOUR(${dataColuna}) as hora, SUM(valor) as faturamento_total FROM ordens_servico WHERE status = 'Concluído' AND ${dataColuna} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY hora ORDER BY hora ASC;`;
        }
        const [rows] = await pool.execute(sql);
        let labels;
        let dataMap = new Map();
        if (agruparPor === 'dia') {
            labels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
            rows.forEach(row => {
                dataMap.set(row.dia - 1, parseFloat(row.faturamento_total));
            });
        } else {
            labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
            rows.forEach(row => {
                dataMap.set(row.hora, parseFloat(row.faturamento_total));
            });
        }
        const data = labels.map((_, index) => dataMap.get(index) || 0);
        res.json({ labels, data });
    } catch (err) {
        res.status(500).json({ error: 'Falha ao buscar dados do gráfico.' });
    }
});

router.get('/dashboard/export/xls', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    try {
        const connection = await pool.getConnection();

        const [[resumoRows]] = await connection.execute(`
            SELECT 
                (SELECT SUM(valor) FROM financeiro WHERE MONTH(data) = MONTH(CURDATE()) AND YEAR(data) = YEAR(CURDATE()) AND tipo = 'Receita') AS faturamento,
                (SELECT SUM(valor) FROM financeiro WHERE MONTH(data) = MONTH(CURDATE()) AND YEAR(data) = YEAR(CURDATE()) AND tipo = 'Despesa') AS despesas,
                (SELECT COUNT(id) FROM ordens_servico WHERE MONTH(data_conclusao) = MONTH(CURDATE()) AND YEAR(data_conclusao) = YEAR(CURDATE()) AND status = 'Concluído') AS servicosConcluidos
        `);
        const faturamento = resumoRows.faturamento || 0;
        const despesas = resumoRows.despesas || 0;
        const lucro = faturamento - despesas;

        const resumoData = [
            ["KPI (Mês Atual)", "Valor"],
            ["Faturamento", faturamento],
            ["Despesas", despesas],
            ["Lucro Líquido", lucro],
            ["Serviços Concluídos", resumoRows.servicosConcluidos]
        ];

        const sqlAnual = `SELECT MONTH(data) AS mes, SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END) AS faturamento, SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END) AS despesas FROM financeiro WHERE YEAR(data) = YEAR(CURDATE()) GROUP BY MONTH(data) ORDER BY mes ASC;`;
        const [anualRows] = await connection.execute(sqlAnual);
        const labelsAnual = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        const faturamentoAnualData = [["Mês", "Faturamento", "Despesas"]];
        labelsAnual.forEach((label, index) => {
            const row = anualRows.find(r => r.mes - 1 === index) || { faturamento: 0, despesas: 0 };
            faturamentoAnualData.push([label, parseFloat(row.faturamento) || 0, parseFloat(row.despesas) || 0]);
        });

        const sqlMotorista = `SELECT m.nome AS nome_motorista, SUM(os.lucro) AS total_lucro FROM ordens_servico os JOIN motoristas m ON os.motorista_id = m.id WHERE os.status = 'Concluído' AND os.lucro > 0 GROUP BY m.id, m.nome ORDER BY total_lucro DESC;`;
        const [motoristaRows] = await connection.execute(sqlMotorista);
        const lucroMotoristaData = [["Motorista", "Lucro Total"]];
        motoristaRows.forEach(row => {
            lucroMotoristaData.push([row.nome_motorista, parseFloat(row.total_lucro) || 0]);
        });

        connection.release();

        const wb = XLSX.utils.book_new();
        const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
        const wsAnual = XLSX.utils.aoa_to_sheet(faturamentoAnualData);
        const wsMotorista = XLSX.utils.aoa_to_sheet(lucroMotoristaData);

        XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo Mensal");
        XLSX.utils.book_append_sheet(wb, wsAnual, "Evolucao Anual");
        XLSX.utils.book_append_sheet(wb, wsMotorista, "Lucro por Motorista");

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_dashboard_${new Date().toISOString().slice(0,10)}.xlsx`);
        res.send(buffer);

    } catch (err) {
        console.error("Erro ao exportar XLS:", err.message);
        res.status(500).json({ error: 'Falha ao gerar o arquivo XLS.' });
    }
});

router.put('/dashboard/meta', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    const { novaMeta } = req.body;

    if (isNaN(novaMeta) || novaMeta < 0) {
        return res.status(400).json({ error: 'Valor da meta inválido.' });
    }

    try {
        const sql = `
            INSERT INTO configuracoes (chave, valor) 
            VALUES ('meta_lucro_mensal', ?) 
            ON DUPLICATE KEY UPDATE valor = ?
        `;
        await pool.execute(sql, [novaMeta, novaMeta]);
        
        res.json({ message: 'Meta atualizada com sucesso!' });
    } catch (err) {
        console.error("Erro ao atualizar a meta:", err);
        res.status(500).json({ error: 'Falha ao atualizar a meta no banco de dados.' });
    }
});

router.get('/cities/autocomplete', authMiddleware, async (req, res) => {
    const { query } = req.query;

    if (!query || query.length < 3) {
        return res.json([]);
    }

    try {
        const orsApiKey = process.env.ORS_API_KEY;
        const geocodeUrl = `https://api.openrouteservice.org/geocode/search`;

   const response = await axios.get(geocodeUrl, {
            params: {
                api_key: orsApiKey,
                text: query,
                layers: 'locality',
                'boundary.country': 'BRA'
            }
        });

        const features = response.data.features || [];
    
        const suggestionsSet = new Set();

        features.forEach(feature => {
            const name = feature.properties.name;
            const state = feature.properties.region;
            if (name) {
                suggestionsSet.add(`${name}, ${state}`);
            }
        });
        
        const suggestions = Array.from(suggestionsSet);

        res.json(suggestions.slice(0, 5));

    } catch (error) {
        console.error("[Autocomplete API Error]:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Falha ao buscar sugestões de cidades.' });
    }
});

router.get('/dashboard/weather', authMiddleware, async (req, res) => {
    const { city, lat, lon } = req.query;
    const weatherApiKey = process.env.WEATHER_API_KEY;
    let url = '';

    if (lat && lon) {
        // Se recebermos latitude e longitude, montamos a URL com elas
        url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=metric&lang=pt_br`;
    } else if (city) {
        // Se não, usamos a cidade (lógica que já existia)
        url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},BR&appid=${weatherApiKey}&units=metric&lang=pt_br`;
    } else {
        // Se não receber nem um nem outro, retorna um erro
        return res.status(400).json({ error: 'É necessário fornecer a cidade ou as coordenadas.' });
    }

    if (!weatherApiKey) {
        console.error("[Weather API Error] A variável WEATHER_API_KEY não está definida no arquivo .env");
        return res.status(500).json({ error: 'A chave da API de clima não está configurada no servidor.' });
    }

    try {
        const weatherRes = await axios.get(url);
        res.json({
            temp: Math.round(weatherRes.data.main.temp),
            description: weatherRes.data.weather[0].description,
            city: weatherRes.data.name,
            icon: weatherRes.data.weather[0].icon,
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return res.status(404).json({ error: 'Localização não encontrada.' });
        }
        console.error("[Weather API Error] Clima:", error.message);
        res.status(500).json({ error: 'Não foi possível buscar o clima.' });
    }
});

router.get('/dashboard/ticker-data', authMiddleware, async (req, res) => {
    try {
        const [dolarRes, newsRes] = await Promise.all([
            axios.get('https://economia.awesomeapi.com.br/last/USD-BRL').catch(e => {
                console.error("[Ticker API Error] Dólar:", e.message);
                return null;
            }),
            // Usei a API de notícias do IBGE (mais estável e sem chave)
            axios.get('https://servicodados.ibge.gov.br/api/v3/noticias/?qtd=20').catch(e => {
                console.error("[Ticker API Error] Notícias IBGE:", e.message);
                return null;
            })
        ]);
        
        const tickerData = {};

        if (dolarRes && dolarRes.data) {
            tickerData.dolar = parseFloat(dolarRes.data.USDBRL.bid).toFixed(2);
        }

        if (newsRes && newsRes.data) {
            tickerData.news = newsRes.data.items.map(article => article.titulo);
        }

        res.json(tickerData);

    } catch (error) {
        console.error("Erro geral ao buscar dados para o ticker:", error);
        res.status(500).json({ error: 'Falha ao buscar dados para o ticker.' });
    }
});

router.get('/dashboard/projecao', authMiddleware, async (req, res) => {
    try {
        const now = new Date();
        const anoAtual = now.getFullYear();
        const mesAtual = now.getMonth() + 1;

        let mesAnterior = mesAtual === 1 ? 12 : mesAtual - 1;
        let anoDoMesAnterior = mesAtual === 1 ? anoAtual - 1 : anoAtual;
        const sqlLucroMesAnterior = `
            SELECT
                (SELECT IFNULL(SUM(valor), 0) FROM financeiro WHERE tipo = 'Receita' AND YEAR(data) = ? AND MONTH(data) = ?) -
                (SELECT IFNULL(SUM(valor), 0) FROM financeiro WHERE tipo = 'Despesa' AND YEAR(data) = ? AND MONTH(data) = ?)
            AS lucro;
        `;
        const [resultadoMesAnterior] = await pool.execute(sqlLucroMesAnterior, [anoDoMesAnterior, mesAnterior, anoDoMesAnterior, mesAnterior]);
        const lucroMesAnterior = parseFloat(resultadoMesAnterior[0].lucro || 0);

        const [despesasPassadas] = await pool.execute(`
            SELECT SUM(valor) as totalDespesas, COUNT(DISTINCT MONTH(data)) as numMeses
            FROM financeiro
            WHERE YEAR(data) = ? AND MONTH(data) < ? AND tipo = 'Despesa'
        `, [anoAtual, mesAtual]);

        let custoMedioMensal = 0;
        const { totalDespesas, numMeses } = despesasPassadas[0];

        if (numMeses > 0) {
            custoMedioMensal = parseFloat(totalDespesas) / parseInt(numMeses);
        } else {
            const [despesasMesAtual] = await pool.execute(`
                SELECT SUM(valor) as total FROM financeiro WHERE YEAR(data) = ? AND MONTH(data) = ? AND tipo = 'Despesa'
            `, [anoAtual, mesAtual]);
            custoMedioMensal = parseFloat(despesasMesAtual[0].total || 0);
        }
        
        // --- ALTERAÇÃO 1: Buscar a margem do banco de dados ---
        let margemProjecao = 30; // Define um valor padrão de 30%
        try {
            const [configRows] = await pool.execute("SELECT valor FROM configuracoes_sistema WHERE chave = 'margem_projecao'");
            if (configRows.length > 0) {
                const valorDoBanco = parseFloat(configRows[0].valor);
                if (!isNaN(valorDoBanco)) {
                    margemProjecao = valorDoBanco;
                }
            }
        } catch (dbError) {
             console.error("Aviso: Não foi possível buscar a margem de projeção do banco. Usando valor padrão.", dbError.message);
        }
        
        // --- ALTERAÇÃO 2: Calcular a meta com base na margem dinâmica ---
        // Converte a margem (ex: 30) para decimal (ex: 0.30)
        const margemDecimal = margemProjecao / 100;
        // Calcula a meta projetada usando a fórmula correta de MARGEM de lucro
        // Evita divisão por zero se a margem for 100% ou mais
        const metaProjetada = margemDecimal < 1 ? (custoMedioMensal / (1 - margemDecimal)) : custoMedioMensal;

        res.json({
            lucroMesAnterior,
            custoMedioMensal,
            metaProjetada,
            margemProjecao // --- ALTERAÇÃO 3: Retorna a margem para o frontend ---
        });

    } catch (err) {
        console.error("Erro na rota de projeção:", err);
        res.status(500).json({ error: 'Falha ao calcular projeções.' });
    }
});

// ROTA PÚBLICA: Usada pelo Dashboard para exibir as imagens
router.get('/slideshow/images', async (req, res) => {
    try {
        const [images] = await pool.execute('SELECT id, image_url FROM slideshow_images ORDER BY data_criacao DESC');
        res.json(images);
    } catch (error) {
        console.error("Erro ao buscar imagens do slideshow:", error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

router.get('/customize/config', authMiddleware, async (req, res) => {
    // Se o usuário não tiver um cliente_id (ex: admin_geral), retorna uma config padrão
    if (!req.user.cliente_id) {
        return res.json({
            sidebar_config: { label: "Guincho Oliveira", logo_url: "/logo_guincho.png" },
            dashboard_config: { 
                title: "Sobre a Guincho Oliveira", 
                text: "Dedicados a oferecer serviços de guincho e assistência rodoviária 24h.", 
                slideshow_urls: [] 
            },
            login_config: { logo_url: "/logo_guincho.png", background_url: "/guinchotr.jpg" }
        });
    }

    try {
        const [[cliente]] = await pool.execute(
            'SELECT sidebar_config, dashboard_config, login_config FROM clientes_sistema WHERE id = ?',
            [req.user.cliente_id]
        );
        
        if (!cliente) {
            return res.status(404).json({ error: "Configurações do cliente não encontradas." });
        }
        
        // Retorna as configurações parseadas, garantindo que sejam objetos vazios se forem nulas
        res.json({
            sidebar_config: JSON.parse(cliente.sidebar_config || '{}'),
            dashboard_config: JSON.parse(cliente.dashboard_config || '{}'),
            login_config: JSON.parse(cliente.login_config || '{}')
        });

    } catch (error) {
        console.error("Erro ao buscar configurações de personalização:", error);
        res.status(500).json({ error: "Falha ao carregar configurações." });
    }
});


router.put('/dashboard/configuracoes', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    try {
        const { margemProjecao } = req.body;
        // Lógica para salvar o valor 'margemProjecao' no banco de dados
        // Ex: UPDATE configuracoes_sistema SET valor = ? WHERE chave = 'margem_projecao'
        await pool.execute("UPDATE configuracoes_sistema SET valor = ? WHERE chave = 'margem_projecao'", [margemProjecao]);
        res.status(200).json({ message: 'Configuração salva com sucesso.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Falha ao salvar configuração.' });
    }
});

return router;


}