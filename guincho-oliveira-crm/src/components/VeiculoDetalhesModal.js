// VeiculoDetalhesModal.js
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './Veiculos.css'; // Reutilizando estilos

export default function VeiculoDetalhesModal({ veiculo, onClose }) {
    const [details, setDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!veiculo?.id) return;

        const fetchDetails = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Endpoint de insights que criamos no backend!
                const response = await api.get(`/api/vehicles/${veiculo.id}/details`);
                setDetails(response.data);
            } catch (err) {
                setError('Não foi possível carregar os detalhes do veículo.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [veiculo?.id]);
    
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('pt-BR');
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="modal-close-button">&times;</button>
                
                {isLoading && <p>Carregando detalhes...</p>}
                {error && <p className="error-message">{error}</p>}
                
                {details && (
                    <>
                        <h3>Detalhes do Veículo: {details.dados_cadastrais.placa}</h3>
                        <div className="details-grid">
                            {/* Seção de KPIs */}
                            <div className="kpi-grid">
                                <div className="kpi-card">
                                    <h4>Faturamento Total</h4>
                                    <span>{formatCurrency(details.insights.faturamento_total)}</span>
                                </div>
                                <div className="kpi-card">
                                    <h4>Custo Operacional</h4>
                                    <span>{formatCurrency(details.insights.custo_operacional_total)}</span>
                                </div>
                                <div className="kpi-card profit">
                                    <h4>Lucro Total</h4>
                                    <span>{formatCurrency(details.insights.lucro_total)}</span>
                                </div>
                                <div className="kpi-card">
                                    <h4>Total de Serviços</h4>
                                    <span>{details.insights.total_servicos}</span>
                                </div>
                                <div className="kpi-card">
                                    <h4>Última Manutenção</h4>
                                    <span>{formatDate(details.insights.ultima_manutencao)}</span>
                                </div>
                            </div>

                            {/* Seção de Históricos */}
                            <div className="history-section">
                                <h4>Histórico de Serviços</h4>
                                <ul className="history-list">
                                    {details.historico_os.length > 0 ? details.historico_os.map(os => (
                                        <li key={os.id}>
                                            <span>OS #{os.id} - {formatDate(os.data_conclusao)}</span>
                                            <strong>{formatCurrency(os.valor)}</strong>
                                        </li>
                                    )) : <p>Nenhum serviço concluído.</p>}
                                </ul>
                            </div>
                            <div className="history-section">
                                <h4>Histórico de Manutenções</h4>
                                <ul className="history-list">
                                    {details.historico_manutencao.length > 0 ? details.historico_manutencao.map(man => (
                                        <li key={man.id}>
                                            <span>{man.tipo} - {formatDate(man.data)}</span>
                                            <strong>{formatCurrency(man.custo)}</strong>
                                        </li>
                                    )) : <p>Nenhuma manutenção registrada.</p>}
                                </ul>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}