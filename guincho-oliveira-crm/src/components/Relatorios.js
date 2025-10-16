import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Relatorios.css';
import { useAuth } from '../hooks/useAuth';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler, BarController, BarElement } from 'chart.js';
import Confetti from 'react-confetti';

// Registra todos os componentes necessários do Chart.js
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler, BarController, BarElement);

// --- COMPONENTES DE ANIMAÇÃO (SVG) ---
const RunningMan = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1" />
        <path d="M9 20l3-6 4 2-3 5" />
        <path d="M15 11l-3-3-3 4" />
    </svg>
);
const JumpingMan = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1" />
        <path d="M8 12l4-4 4 4" />
        <path d="M12 19V8" />
        <path d="M8 20h8" />
    </svg>
);
const ThumbsUpMan = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="1" />
        <path d="M18 13l-1.47-1.47a2 2 0 00-2.83 0L12 14" />
        <path d="M14 9l-2-2-2 2" />
        <path d="M7 13v-2a2 2 0 012-2h3l1 5-4 4-2-5a2 2 0 01-2-2z" />
    </svg>
);

// Componente para os cards de KPI
const KpiCard = ({ title, value, subtext }) => (
    <div className="kpi-card-new">
        <span className="kpi-title-new">{title}</span>
        <span className="kpi-value-new">{value}</span>
        <span className="kpi-subtext-new">{subtext}</span>
    </div>
);

// --- COMPONENTE REFATORADO: MetaCard ---
const MetaCard = ({ resumo, isAdmin, onSaveMeta }) => {
    const [isEditingMeta, setIsEditingMeta] = useState(false);
    const [novaMetaInput, setNovaMetaInput] = useState('');

    const formatCurrency = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const progresso = Math.min(((resumo.lucro || 0) / (resumo.metaLucro || 1)) * 100, 100);
    const metaAtingida = progresso >= 100;

    const handleEditMeta = () => {
        setNovaMetaInput(resumo.metaLucro.toString());
        setIsEditingMeta(true);
    };

    const handleSave = () => {
        onSaveMeta(novaMetaInput);
        setIsEditingMeta(false);
    };
    
    return (
        <div className="chart-card meta-card">
            <div className="meta-header">
                <h4>Meta de Lucro Mensal</h4>
                {isAdmin && !isEditingMeta && (
                    <button onClick={handleEditMeta} className="edit-meta-btn" title="Editar Meta">✏️</button>
                )}
            </div>
            <div className="meta-content">
                <div className="meta-atingido">{formatCurrency(resumo.lucro)}</div>
                <div className="meta-barra">
                    <div className={`meta-progresso ${metaAtingida ? 'meta-atingida-color' : ''}`} style={{ width: `${progresso}%` }}>
                        <div className="meta-icon" style={{ left: `${progresso}%` }}>
                            {metaAtingida ? <ThumbsUpMan /> : <RunningMan />}
                        </div>
                    </div>
                </div>
                <div className="meta-alvo">
                    <span>Meta:</span>
                    {isEditingMeta ? (
                        <div className="edit-meta-form">
                            <span>R$</span>
                            <input
                                type="number"
                                value={novaMetaInput}
                                onChange={(e) => setNovaMetaInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                autoFocus
                            />
                            <button onClick={handleSave} className="save-btn">✔</button>
                            <button onClick={() => setIsEditingMeta(false)} className="cancel-btn">✖</button>
                        </div>
                    ) : (
                        <span>{formatCurrency(resumo.metaLucro)}</span>
                    )}
                </div>
            </div>
        </div>
    );
};


export default function Relatorios() {
    const navigate = useNavigate();
    const { perfil } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dashboardData, setDashboardData] = useState(null);
    const [projecaoData, setProjecaoData] = useState(null);

    // --- Estados para os Filtros ---
    const [filterType, setFilterType] = useState('preset');
    const [periodo, setPeriodo] = useState('mensal');
    const [customDates, setCustomDates] = useState({
        inicio: new Date().toISOString().split('T')[0],
        fim: new Date().toISOString().split('T')[0],
    });
    
    // --- NOVO: Estados para a margem de projeção ---
    const [margemProjecao, setMargemProjecao] = useState(30); // Default 30%
    const [isEditingMargem, setIsEditingMargem] = useState(false);
    const [novaMargemInput, setNovaMargemInput] = useState('');
    
    // --- Estados para os Confetes ---
    const [showConfetti, setShowConfetti] = useState(false);
    const metaAtingidaAnterior = useRef(false);

    const isAdmin = perfil === 'admin' || perfil === 'admin_geral';

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            let params = {};
            if (filterType === 'preset') {
                params = { periodo };
            } else if (customDates.inicio && customDates.fim) {
                params = { dataInicio: customDates.inicio, dataFim: customDates.fim };
            }
            
            const config = { headers: { Authorization: `Bearer ${token}` }, params };

            const [resumoRes, lineChartRes, statusOsRes, topClientesRes, projecaoRes] = await Promise.all([
                api.get('/api/dashboard/resumo', config),
                api.get('/api/dashboard/faturamento-anual', config),
                api.get('/api/dashboard/status-os', config),
                api.get('/api/dashboard/top-clientes', config),
                api.get('/api/dashboard/projecao', config)
            ]);
            
            setDashboardData({
                resumo: resumoRes.data,
                lineChart: lineChartRes.data,
                statusOs: statusOsRes.data,
                topClientes: topClientesRes.data,
            });
            setProjecaoData(projecaoRes.data);
            
            // --- NOVO: Atualiza a margem com o valor do backend ---
            // Nota: projecaoRes.data.margemProjecao é um exemplo, ajuste conforme sua API retornar.
            if (projecaoRes.data && projecaoRes.data.margemProjecao) {
                setMargemProjecao(projecaoRes.data.margemProjecao);
            }

        } catch (err) {
            setError('Falha ao carregar dados do dashboard.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [periodo, customDates, filterType]);

    useEffect(() => { fetchData(); }, [fetchData]);
    
    // Efeito para disparar os confetes
    useEffect(() => {
        if (dashboardData?.resumo) {
            const { lucro, metaLucro } = dashboardData.resumo;
            const metaAtingidaAtual = lucro >= metaLucro && metaLucro > 0;
            if (metaAtingidaAtual && !metaAtingidaAnterior.current) {
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 8000);
            }
            metaAtingidaAnterior.current = metaAtingidaAtual;
        }
    }, [dashboardData]);

    const handleSaveMeta = async (novaMeta) => {
        try {
            const novaMetaNumerica = parseFloat(novaMeta);
            if (isNaN(novaMetaNumerica) || novaMetaNumerica < 0) {
                alert("Por favor, insira um valor válido para a meta.");
                return;
            }
            await api.put('/api/dashboard/meta', { novaMeta: novaMetaNumerica }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setDashboardData(prev => ({
                ...prev,
                resumo: { ...prev.resumo, metaLucro: novaMetaNumerica }
            }));
        } catch (err) {
            alert('Erro ao salvar a nova meta.');
            console.error(err);
        }
    };
    
    // --- NOVO: Função para salvar a nova margem de projeção ---
    const handleSaveMargem = async () => {
        try {
            const novaMargemNumerica = parseFloat(novaMargemInput);
            if (isNaN(novaMargemNumerica) || novaMargemNumerica < 0 || novaMargemNumerica > 100) {
                 alert("Por favor, insira uma margem válida entre 0 e 100.");
                 return;
            }
            // Você precisará criar esta rota no seu backend
            await api.put('/api/dashboard/configuracoes', { margemProjecao: novaMargemNumerica }, {
                 headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setIsEditingMargem(false);
            // Recarrega todos os dados para refletir a nova projeção calculada no backend
            fetchData(); 
        } catch (err) {
             alert('Erro ao salvar a nova margem.');
             console.error(err);
        }
    };
    
    const handleCustomDateChange = (e) => {
        setCustomDates(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const chartOptions = useMemo(() => ({
        line: { responsive: true, plugins: { legend: { position: 'top' }}},
        doughnut: { responsive: true, plugins: { legend: { position: 'top' }}},
        bar: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }}},
    }), []);


    if (loading) return <div className="loading-spinner"></div>;
    if (error) return <p className="error-message">{error}</p>;
    if (!dashboardData || !projecaoData) return null;

    const { resumo, lineChart, statusOs, topClientes } = dashboardData;
    const formatCurrency = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const formatDateForDisplay = (dateString) => {
        const [year, month, day] = dateString.split('-');
        return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
    };
    
    const periodoLabel = filterType === 'preset'
        ? { hoje: 'hoje', semanal: 'na semana', mensal: 'no mês', anual: 'no ano' }[periodo]
        : `de ${formatDateForDisplay(customDates.inicio)} a ${formatDateForDisplay(customDates.fim)}`;

    const lineChartData = {
        labels: lineChart?.labels || [],
        datasets: [
            { label: 'Faturamento', data: lineChart?.faturamentoData || [], borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.2)', fill: true, tension: 0.4 },
            { label: 'Despesas', data: lineChart?.despesasData || [], borderColor: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.2)', fill: true, tension: 0.4 },
        ],
    };
    const statusOsData = {
        labels: (statusOs || []).map(item => item.status),
        datasets: [{ data: (statusOs || []).map(item => item.count), backgroundColor: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#6B7280', '#8B5CF6'], borderColor: '#f0f2f5', borderWidth: 4 }],
    };
    const topClientesData = {
        labels: (topClientes || []).map(c => c.nome),
        datasets: [{ label: 'Faturamento', data: (topClientes || []).map(c => c.total), backgroundColor: '#3B82F6', borderWidth: 1, borderRadius: 5 }]
    };

    return (
        <div className="dashboard-page">
            {showConfetti && <Confetti recycle={false} numberOfPieces={500} gravity={0.2} />}
            <header className="dashboard-header">
                <h1>Dashboard de Performance</h1>
                <div className="filter-controls">
                    <div className="filter-toggle">
                        <button className={filterType === 'preset' ? 'active' : ''} onClick={() => setFilterType('preset')}>Períodos</button>
                        <button className={filterType === 'custom' ? 'active' : ''} onClick={() => setFilterType('custom')}>Personalizado</button>
                    </div>
                    {filterType === 'preset' ? (
                        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                            <option value="hoje">Hoje</option>
                            <option value="semanal">Esta Semana</option>
                            <option value="mensal">Este Mês</option>
                            <option value="anual">Este Ano</option>
                        </select>
                    ) : (
                        <div className="custom-date-filter">
                            <input type="date" name="inicio" value={customDates.inicio} onChange={handleCustomDateChange} />
                            <span>até</span>
                            <input type="date" name="fim" value={customDates.fim} onChange={handleCustomDateChange} />
                        </div>
                    )}
                </div>
            </header>
            
            <div className="projecao-bar">
                <div className="projecao-item">
                    <span className="projecao-label">Lucro Mês Anterior</span>
                    <span className="projecao-value">{formatCurrency(projecaoData.lucroMesAnterior)}</span>
                </div>
                <div className="projecao-separator"></div>
                <div className="projecao-item">
                    <span className="projecao-label">Custo Médio Mensal</span>
                    <span className="projecao-value">{formatCurrency(projecaoData.custoMedioMensal)}</span>
                </div>
                <div className="projecao-separator"></div>

                {/* --- ALTERADO: Lógica de Projeção com Margem Editável --- */}
                <div className="projecao-item target">
                     <span className="projecao-label">
                        Meta de Receita Projetada
                        <i title={`Meta de faturamento sugerida para cobrir o custo médio com a margem de lucro definida.`}>?</i>
                    </span>
                    <span className="projecao-value">{formatCurrency(projecaoData.metaProjetada)}</span>
                    
                    {/* --- NOVO: Formulário de edição da margem para Admins --- */}
                    {isAdmin && (
                        <div style={{ marginTop: '8px' }}>
                            {isEditingMargem ? (
                                <div className="edit-meta-form">
                                    <input
                                        type="number"
                                        value={novaMargemInput}
                                        onChange={(e) => setNovaMargemInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveMargem()}
                                        autoFocus
                                        style={{width: '60px'}}
                                    />
                                    <span>%</span>
                                    <button onClick={handleSaveMargem} className="save-btn" title="Salvar">✔</button>
                                    <button onClick={() => setIsEditingMargem(false)} className="cancel-btn" title="Cancelar">✖</button>
                                </div>
                            ) : (
                                <div className="meta-alvo" style={{ justifyContent: 'flex-start', gap: '8px' }}>
                                    <span style={{color: '#9ca3af'}}>Margem: {margemProjecao}%</span>
                                    <button 
                                        onClick={() => {
                                            setNovaMargemInput(margemProjecao.toString());
                                            setIsEditingMargem(true);
                                        }} 
                                        className="edit-meta-btn" 
                                        title="Editar Margem"
                                        style={{fontSize: '1em', opacity: '0.6'}}
                                    >
                                        ✏️
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="kpi-grid-new">
                <KpiCard title="Receita Bruta" value={formatCurrency(resumo.faturamento)} subtext={`Total ${periodoLabel}`} />
                <KpiCard title="Total Despesas" value={formatCurrency(resumo.despesas)} subtext={`Total ${periodoLabel}`} />
                <KpiCard title="Lucro Líquido" value={formatCurrency(resumo.lucro)} subtext={`Resultado ${periodoLabel}`} />
                <KpiCard title="Serviços Concluídos" value={resumo.servicosConcluidos.toString()} subtext={`Total ${periodoLabel}`} />
            </div>

            <div className="charts-grid-dynamic">
                <div className="chart-card">
                    <h4>Evolução Financeira Anual</h4>
                    <Line options={chartOptions.line} data={lineChartData} />
                </div>
                <div className="chart-card">
                    <h4>Status das Ordens de Serviço</h4>
                    <Doughnut options={chartOptions.doughnut} data={statusOsData} />
                </div>
                <div className="chart-card">
                    <h4>Top 5 Clientes por Receita (Anual)</h4>
                    <Bar options={chartOptions.bar} data={topClientesData} />
                </div>
                <MetaCard
                    resumo={resumo}
                    isAdmin={isAdmin}
                    onSaveMeta={handleSaveMeta}
                />
            </div>
        </div>
    );
}