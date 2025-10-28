const express = require('express');
const router = express.Router();
const axios = require('axios');
const XLSX = require('xlsx');
const { eachDayOfInterval, format, parseISO } = require('date-fns');

// Este módulo exporta uma função que recebe as dependências e retorna o router configurado
module.exports = (pool, authMiddleware, permissionMiddleware) => {

// ROTA DE RESUMO DO DASHBOARD (VERSÃO DEBUG E COM CORREÇÃO DE ERRO + PARÂMETROS)
router.get('/dashboard/resumo', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro', 'operacional']), async (req, res) => {
    const { periodo, dataInicio, dataFim } = req.query;
    
    // --- DEBUG 1 ---
    console.log(`[DEBUG /resumo] Requisição recebida. Período: ${periodo}, Início: ${dataInicio}, Fim: ${dataFim}`);
    
    let financeiroConditions = [];
    let osConditions = [];
    let paramsMain = [];
    let paramsOS = [];

    // Lógica de filtro (AGORA 100% PARAMETRIZADA)
    if (dataInicio && dataFim) {
        financeiroConditions.push("DATE(data) BETWEEN ? AND ?");
        paramsMain.push(dataInicio, dataFim);
        osConditions.push("DATE(data_resolucao) BETWEEN ? AND ?");
        paramsOS.push(dataInicio, dataFim);
    } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        
        // ############# INÍCIO DA CORREÇÃO DE PARÂMETROS #############
        // Removemos a injeção de string e usamos '?'
        switch (periodo) {
            case 'hoje': 
                financeiroConditions.push("DATE(data) = CURDATE()");
                osConditions.push("DATE(data_resolucao) = CURDATE()");
                // Não precisa de params
                break;
            case 'semanal': 
                financeiroConditions.push("YEARWEEK(data, 1) = YEARWEEK(CURDATE(), 1)");
                osConditions.push("YEARWEEK(data_resolucao, 1) = YEARWEEK(CURDATE(), 1)");
                // Não precisa de params
                break;
            case 'anual': 
                financeiroConditions.push("YEAR(data) = ?");
                paramsMain.push(year);
                osConditions.push("YEAR(data_resolucao) = ?");
                paramsOS.push(year);
                break;
            case 'mensal': 
            default: 
                financeiroConditions.push("YEAR(data) = ? AND MONTH(data) = ?");
                paramsMain.push(year, month);
                osConditions.push("YEAR(data_resolucao) = ? AND MONTH(data_resolucao) = ?");
                paramsOS.push(year, month);
                break;
        }
        // ############# FIM DA CORREÇÃO DE PARÂMETROS #############
    }

    try {
        const mainQuery = `
            SELECT
                SUM(CASE WHEN TRIM(UPPER(tipo)) = 'RECEITA' THEN valor ELSE 0 END) AS faturamento,
                SUM(CASE WHEN TRIM(UPPER(tipo)) = 'DESPESA' THEN valor ELSE 0 END) AS despesas_financeiro
            FROM \`financeiro\`
            WHERE ${financeiroConditions.join(' AND ')}
        `;
        
        // --- DEBUG 3 ---
        console.log(`[DEBUG /resumo] SQL Executada: ${mainQuery.replace(/\s+/g, ' ')}`);
        console.log(`[DEBUG /resumo] Params: ${JSON.stringify(paramsMain)}`); // Agora mostrará [2025, 10]

        const osQuery = `
            SELECT COUNT(id) AS total 
            FROM \`ordens_servico\`
            WHERE UPPER(status) = 'CONCLUÍDO' 
            AND ${osConditions.join(' AND ')}
        `;
        
        // Esta parte para isolar a meta (que fizemos antes) está CORRETA e mantida.
        const metaQuery = "SELECT valor FROM configuracoes WHERE chave = 'meta_lucro_mensal'";

        const [mainResultRows, osResultRows] = await Promise.all([
            pool.execute(mainQuery, paramsMain),
            pool.execute(osQuery, paramsOS) // Agora ambos são 'execute' válidos
        ]);

        const mainResult = mainResultRows[0][0];
        const osResult = osResultRows[0][0];

        // --- DEBUG 4 ---
        console.log(`[DEBUG /resumo] Resultado Bruto do Banco: ${JSON.stringify(mainResult)}`);

        let metaLucroValor = 10000; 
        try {
            const [metaResultRows] = await pool.execute(metaQuery); // 'execute' aqui é ok (sem params)
            if (metaResultRows && metaResultRows.length > 0) {
                metaLucroValor = metaResultRows[0].valor;
            }
        } catch (metaError) {
            console.warn(`[AVISO /resumo] Não foi possível buscar a meta_lucro_mensal. Usando valor padrão. Erro: ${metaError.message}`);
        }

        const faturamento = parseFloat(mainResult.faturamento || 0);
        const despesasTotais = parseFloat(mainResult.despesas_financeiro || 0);
        
        const dataToSend = {
            faturamento,
            despesas: despesasTotais,
            lucro: faturamento - despesasTotais,
            servicosConcluidos: parseInt(osResult.total || 0),
            metaLucro: parseFloat(metaLucroValor),
        };
        
        // --- DEBUG 5 ---
        console.log(`[DEBUG /resumo] Dados Enviados ao Frontend: ${JSON.stringify(dataToSend)}`);

        res.json(dataToSend);

    } catch (err) {
        console.error("!!! ERRO CRÍTICO NA ROTA DE RESUMO:", err);
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
        const { periodo, dataInicio, dataFim } = req.query;
        
        // --- CORREÇÃO DE LÓGICA: Padronizar o status ---
        let conditions = ["UPPER(os.status) = 'CONCLUÍDO'"]; // MUDANÇA AQUI
        
        let params = [];

        if (dataInicio && dataFim) {
            conditions.push('DATE(os.data_resolucao) BETWEEN ? AND ?');
            params.push(dataInicio, dataFim);
        } else {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            
            switch (periodo) {
                case 'hoje': 
                    conditions.push('DATE(os.data_resolucao) = CURDATE()'); 
                    break;
                case 'semanal': 
                    conditions.push('YEARWEEK(os.data_resolucao, 1) = YEARWEEK(CURDATE(), 1)'); 
                    break;
                case 'anual': 
                    conditions.push('YEAR(os.data_resolucao) = ?'); 
                    params.push(year);
                    break;
                case 'mensal': 
                default: 
                    conditions.push('YEAR(os.data_resolucao) = ? AND MONTH(os.data_resolucao) = ?'); 
                    params.push(year, month);
                    break;
            }
        }

        const [rows] = await pool.execute(`
            SELECT c.nome, SUM(os.valor) as total
            FROM ordens_servico os
            JOIN clientes c ON os.cliente_id = c.id
            WHERE ${conditions.join(' AND ')}
            GROUP BY c.nome
            ORDER BY total DESC
            LIMIT 5;
        `, params); 
        
        res.json(rows);
    } catch (err) {
        console.error("Erro na rota top-clientes:", err); 
        res.status(500).json({ error: 'Falha ao buscar top clientes.' });
    }
});

// Coloque o nome certo da rota aqui: /faturamento-anual ou /faturamento-anual-1
router.get('/dashboard/faturamento-anual', authMiddleware, permissionMiddleware(['admin_geral', 'admin', 'financeiro', 'operacional']), async (req, res) => {
    
    console.log(`[${new Date().toISOString()}] REQUISIÇÃO RECEBIDA em /faturamento-anual`);
    console.log('Query Params Recebidos:', req.query); 

    try {
        // Ignoramos 'periodo' pois esta rota é sempre anual
        const { dataInicio, dataFim, ano } = req.query; 
        let conditions = [];
        let params = [];

        if (dataInicio && dataFim) {
            conditions.push('DATE(data) BETWEEN ? AND ?');
            params.push(dataInicio, dataFim);
        } else {
            const yearToUse = ano || new Date().getFullYear(); 
            conditions.push('YEAR(data) = ?'); 
            params.push(yearToUse);
        }
        
        const sql = `
            SELECT 
                MONTH(data) AS mes, 
                SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END) AS faturamento, 
                SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END) AS despesas 
            FROM financeiro 
            WHERE ${conditions.join(' AND ')} 
            GROUP BY MONTH(data) 
            ORDER BY mes ASC;
        `;
        
        console.log('SQL Executado:', sql);
        console.log('Parâmetros:', params);

        const [rows] = await pool.execute(sql, params);
        
        const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        
        const faturamentoData = new Array(12).fill(0);
        const despesasData = new Array(12).fill(0);

        rows.forEach(row => {
            const mesIndex = row.mes - 1; 
            if (mesIndex >= 0 && mesIndex < 12) {
                faturamentoData[mesIndex] = parseFloat(row.faturamento);
                despesasData[mesIndex] = parseFloat(row.despesas);
            }
        });
        
        console.log('Dados enviados para o frontend com sucesso.'); 
        res.json({ labels, faturamentoData, despesasData });
    } catch (err) {
        console.error("!!! ERRO CRÍTICO na rota /faturamento-anual:", err); 
        res.status(500).json({ error: 'Falha ao buscar dados do gráfico.' });
    }
});

router.get('/dashboard/lucro-por-motorista', authMiddleware, permissionMiddleware(['admin_geral', 'admin']), async (req, res) => {
    try {
        const sql = `SELECT m.nome AS nome_motorista, SUM(os.lucro) AS total_lucro FROM ordens_servico os JOIN motoristas m ON os.motorista_id = m.id WHERE UPPER(os.status) = 'Concluído' AND os.lucro > 0 GROUP BY m.id, m.nome ORDER BY total_lucro DESC;`;
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
            sql = `SELECT DAYOFWEEK(${dataColuna}) as dia, SUM(valor) as faturamento_total FROM ordens_servico WHERE UPPER(status) = 'CONCLUÍDO' AND YEAR(${dataColuna}) = YEAR(CURDATE()) GROUP BY dia ORDER BY dia ASC;`;
        } else {
            sql = `SELECT HOUR(${dataColuna}) as hora, SUM(valor) as faturamento_total FROM ordens_servico WHERE UPPER(status) = 'CONCLUÍDO' AND ${dataColuna} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY hora ORDER BY hora ASC;`;
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
                (SELECT COUNT(id) FROM ordens_servico WHERE MONTH(data_resolucao) = MONTH(CURDATE()) AND YEAR(data_resolucao) = YEAR(CURDATE()) AND UPPER(status) = 'CONCLUÍDO') AS servicosConcluidos
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

        const sqlMotorista = `SELECT m.nome AS nome_motorista, SUM(os.lucro) AS total_lucro FROM ordens_servico os JOIN motoristas m ON os.motorista_id = m.id WHERE UPPER(os.status) = 'CONCLUÍDO' AND os.lucro > 0 GROUP BY m.id, m.nome ORDER BY total_lucro DESC;`;
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
        
        // --- CORREÇÃO DE MIXED CONTENT ---
        const secureImages = images.map(image => ({
            ...image,
            image_url: image.image_url ? image.image_url.replace('http://', 'https://') : null
        }));
        
        res.json(secureImages);
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