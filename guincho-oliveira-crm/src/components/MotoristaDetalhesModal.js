import React, { useState, useEffect, useCallback } from 'react'; 
import api from '../services/api';
import { format, formatDistanceToNow } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import './MotoristaDetalhesModal.css';
import { FaTimes, FaDollarSign, FaChartBar, FaCheckCircle, FaStar, FaMoneyBillWave, FaListAlt } from 'react-icons/fa'; 

// Helper para formatar moeda
const formatCurrency = (value) => (parseFloat(value || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function MotoristaDetalhesModal({ driverId, onClose }) {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [userProfile, setUserProfile] = useState(null); // NOVO: Estado para perfil do usuário

    // --- FUNÇÕES DE DADOS E PERMISSÃO ---

    const fetchUserProfile = useCallback(async () => {
        try {
            const { data } = await api.get('/api/usuarios/me');
            setUserProfile(data.perfil);
        } catch (error) {
            console.error("Erro ao buscar perfil do usuário:", error);
        }
    }, []);

    const fetchDetails = useCallback(async () => {
        if (!data) setIsLoading(true);
        setError(null);
        try {
            const response = await api.get(`/api/drivers/${driverId}/details`);
            setData(response.data);
        } catch (err) {
            setError('Não foi possível carregar os detalhes do motorista.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [driverId, data]);

    useEffect(() => {
        if (!driverId) return;

        // Executa o fetch do perfil uma única vez
        fetchUserProfile(); 
        
        fetchDetails(); 

        const intervalId = setInterval(() => {
            console.log('Atualizando dados do motorista via Polling (1 minuto)...');
            fetchDetails();
        }, 60000);

        return () => clearInterval(intervalId);
    }, [driverId, fetchDetails, fetchUserProfile]);

    const renderContent = () => {
        if (isLoading) return <p className="loading-message">Carregando insights do motorista...</p>;
        if (error) return <p className="error-message">{error}</p>;
        if (!data) return null;

        const { details, stats, history } = data;
        const faturamentoGerado = parseFloat(stats.faturamento_gerado || 0);
        const valorTotalPago = parseFloat(stats.valor_total_pago || 0);
        const balancoFinanceiro = faturamentoGerado - valorTotalPago;

        // 1. CÁLCULO DA EFICIÊNCIA MÉDIA
        const eficiencia = stats.os_concluidas_total > 0 ? (faturamentoGerado / stats.os_concluidas_total) : 0;
        
        // 2. CÁLCULO DO RETORNO FINANCEIRO (Margem de Lucro Bruto)
        const margemLucro = faturamentoGerado - valorTotalPago;
        const retornoFinanceiro = faturamentoGerado > 0 ? (margemLucro / faturamentoGerado) * 100 : 0;
        
        // --- NOVO: LÓGICA DE ALERTA DE PERFORMANCE ---
        const isAdmin = userProfile === 'admin_geral' || userProfile === 'admin';
        const isLowPerformance = retornoFinanceiro < 90;

        // Classe CSS condicional: 'low-performance-alert' é aplicada se for admin E a margem for < 90%
        const performanceClass = isAdmin && isLowPerformance ? 'low-performance-alert' : '';
        // ---------------------------------------------
        
        // --- Variáveis de Exibição ---
        const balancoDisplay = {
            valor: balancoFinanceiro,
            label: balancoFinanceiro >= 0 ? "Balanço Positivo" : "Balanço Negativo",
            className: balancoFinanceiro >= 0 ? "profit" : "loss"
        };
        
        const mostUsedVehicle = stats.most_used_vehicle; 
        const { ranking_pos, total_motoristas } = stats; 
        
        const rankingDisplay = ranking_pos 
            ? `#${ranking_pos} de ${total_motoristas} Motoristas`
            : 'N/D';

        const renderDate = (dateString) => {
            if (!dateString) return 'Data indisponível';
            try {
                return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
            } catch (e) {
                return 'Data inválida';
            }
        };

        return (
            <>
                <div className="modal-header">
                    <h2>{details.nome}</h2>
                    <button onClick={onClose} className="close-button"><FaTimes /></button>
                </div>
                
                {/* --- PAINEL DE INSIGHTS PRINCIPAIS --- */}
                <div className="insights-grid">
                    <div className="insight-card"><h4><FaCheckCircle /> OS Concluídas</h4><span>{stats.os_concluidas_total || 0}</span></div>
                    <div className="insight-card"><h4><FaDollarSign /> Faturamento Gerado</h4><span>{formatCurrency(faturamentoGerado)}</span></div>
                    <div className="insight-card"><h4><FaMoneyBillWave /> Total Pago</h4><span>{formatCurrency(valorTotalPago)}</span></div>
                    <div className="insight-card">
                        <h4><FaChartBar /> Balanço Final</h4>
                        <span className={balancoDisplay.className}>{formatCurrency(balancoDisplay.valor)}</span>
                        <small>{balancoDisplay.label}</small>
                    </div>
                </div>

                {/* --- PAINEL DE PERFORMANCE COM 5 ITENS - LAYOUT 3x2 --- */}
                <h3 className="section-title"><FaStar/> Painel de Performance</h3>
                <div className="insights-grid surprise-grid three-by-two">
                    {/* Card 1: Eficiência Média (INALTERADO) */}
                    <div className="insight-card"><h4>1. Eficiência Média</h4><span>{formatCurrency(eficiencia)}</span><small>por serviço concluído</small></div>
                    
                    {/* Card 2: Retorno Financeiro (COM AVISO PISCANTE) */}
                    <div className={`insight-card ${performanceClass}`}>
                        <h4>2. Retorno Financeiro</h4>
                        <span>{retornoFinanceiro.toFixed(1)}%</span>
                        <small>Margem de Lucro Bruto</small>
                    </div>
                    
                    {/* Card 3: Última Atividade (INALTERADO) */}
                    <div className="insight-card">
                        <h4>3. Última Atividade</h4>
                        <span>{stats.ultima_atividade ? formatDistanceToNow(new Date(stats.ultima_atividade), { locale: ptBR, addSuffix: true }) : 'Nenhuma'}</span>
                        <small>{stats.ultima_atividade ? `Em: ${format(new Date(stats.ultima_atividade), 'dd/MM/yyyy')}` : 'Nenhuma OS concluída'}</small>
                    </div>
                    
                    {/* Card 4: Veículo Mais Utilizado (INALTERADO) */}
                    <div className="insight-card">
                        <h4>4. Veículo Mais Utilizado</h4>
                        {mostUsedVehicle && mostUsedVehicle.modelo ? (
                            <>
                                <span className="small-span">{mostUsedVehicle.modelo}</span>
                                <small>Placa: {mostUsedVehicle.placa || 'N/D'} ({mostUsedVehicle.total_os || 0} OS)</small>
                            </>
                        ) : (
                            <>
                                <span className="small-span">Nenhum Veículo</span>
                                <small>Baseado em OS concluídas</small>
                            </>
                        )}
                    </div>
                    
                    {/* Card 5: Ranking da Frota (INALTERADO) */}
                    <div className="insight-card">
                        <h4>5. Ranking da Frota</h4>
                        <span className="small-span">{rankingDisplay}</span>
                        <small>Baseado em faturamento</small>
                    </div>
                </div>

                {/* --- HISTÓRICOS (INALTERADO) --- */}
                <div className="modal-body-grid">
                    <div className="section">
                        <h3><FaListAlt /> Últimas Ordens de Serviço</h3>
                        <ul className="history-list">
                            {history.ordensDeServico.length > 0 ? history.ordensDeServico.map(os => (
                                <li key={`os-${os.id}`}>
                                    <span>OS #{os.id} - {formatCurrency(os.valor)}</span>
                                    <small>{renderDate(os.data_referencia)}</small>
                                </li>
                            )) : <p>Nenhuma OS concluída.</p>}
                        </ul>
                    </div>
                    <div className="section">
                        <h3><FaMoneyBillWave /> Últimos Pagamentos</h3>
                        <ul className="history-list">
                            {history.pagamentos.length > 0 ? history.pagamentos.map(pg => (
                                <li key={`pg-${pg.id}`}>
                                    <span>{pg.descricao} - {formatCurrency(pg.valor)}</span>
                                    <small>{renderDate(pg.data)}</small>
                                </li>
                            )) : <p>Nenhum pagamento registrado.</p>}
                        </ul>
                    </div>
                </div>
            </>
        );
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content large">
                {renderContent()}
            </div>
        </div>
    );
}