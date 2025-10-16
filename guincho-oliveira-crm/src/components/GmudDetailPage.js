// src/components/GmudDetailPage.js

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { 
    FaSpinner, FaTools, FaCheckCircle, FaBan, FaHourglassHalf, 
    FaPlayCircle, FaStopCircle, FaChevronLeft, FaCalendarAlt, 
    FaFileMedicalAlt, FaExclamationTriangle, FaUndo, FaClipboardCheck,
    FaLink, FaUnlink
} from 'react-icons/fa';
import './GmudDetailPage.css';
import VincularChamadoModal from './VincularChamadoModal'; // Importando o novo componente

const statusMap = {
    Pendente: { icon: FaHourglassHalf, color: '#6c757d', text: 'Pendente de Aprovação' },
    Aprovada: { icon: FaCheckCircle, color: '#17a2b8', text: 'Aprovada' },
    'Em Execução': { icon: FaPlayCircle, color: '#007bff', text: 'Em Execução' },
    Concluída: { icon: FaCheckCircle, color: '#28a745', text: 'Concluída' },
    Rejeitada: { icon: FaBan, color: '#dc3545', text: 'Rejeitada' },
    Cancelada: { icon: FaStopCircle, color: '#ffc107', text: 'Cancelada' },
};

const GmudDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [gmud, setGmud] = useState(null);
    const [loading, setLoading] = useState(true);

    // States para as novas funcionalidades
    const [resultado, setResultado] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchGmud = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/api/gmud/${id}`);
            // Garantimos que chamados_vinculados sempre seja um array
            data.chamados_vinculados = data.chamados_vinculados || [];
            setGmud(data);
        } catch (error) {
            toast.error('Não foi possível carregar os detalhes da GMUD.');
            navigate('/suporte-admin/gmud');
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        fetchGmud();
    }, [fetchGmud]);

    const handleUpdateStatus = async (newStatus) => {
        const confirmAction = window.confirm(`Tem certeza que deseja "${newStatus}" esta GMUD?`);
        if (!confirmAction) return;

        setLoading(true);
        try {
            await api.put(`/api/gmud/${id}/status`, { status: newStatus });
            toast.success(`GMUD atualizada para "${newStatus}" com sucesso!`);
            fetchGmud();
        } catch (error) {
            toast.error('Falha ao atualizar o status da GMUD.');
            setLoading(false);
        }
    };

    const handleSalvarResultado = async (e) => {
        e.preventDefault();
        if (resultado.trim() === '') {
            toast.warn('Por favor, descreva o resultado da execução.');
            return;
        }
        setLoading(true);
        try {
            await api.post(`/api/gmud/${id}/finalizar`, { resultado });
            toast.success('Resultado salvo e GMUD finalizada com sucesso!');
            fetchGmud();
            setResultado('');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Falha ao salvar o resultado.');
            setLoading(false);
        }
    };
    
    const handleDesvincular = async (chamadoId) => {
        if (window.confirm(`Tem certeza que deseja desvincular o chamado #${chamadoId}?`)) {
            try {
                await api.delete(`/api/gmud/${id}/vincular-chamado/${chamadoId}`);
                toast.success('Vínculo removido!');
                fetchGmud();
            } catch (error) {
                toast.error('Falha ao remover vínculo.');
            }
        }
    };

    if (loading || !gmud) {
        return <div className="loading-view"><FaSpinner className="spinner" /> Carregando detalhes da GMUD...</div>;
    }

    const statusInfo = statusMap[gmud.status] || {};

    return (
        <div className="gmud-detail-page">
            <div className="gmud-detail-grid">
                
                {/* Card de Detalhes Principais - AGORA COM O NOVO CABEÇALHO DENTRO DELE */}
                <div className="detail-card">
                    <div className="card-header">
                        <h1><FaTools /> Detalhes da GMUD #{gmud.id}</h1>
                        <button onClick={() => navigate('/suporte-admin/gmud')} className="back-button">
                            <FaChevronLeft /> Voltar para o Painel
                        </button>
                    </div>
                    <h3>{gmud.titulo}</h3>
                    <p className="detail-description">{gmud.descricao}</p>
                    <div className="detail-meta">
                        <span><strong>Solicitante:</strong> {gmud.solicitante_nome}</span>
                        <span><strong>Tipo:</strong> {gmud.tipo}</span>
                        <span><strong>Criado em:</strong> {new Date(gmud.criado_em).toLocaleString('pt-BR')}</span>
                    </div>
                </div>

                {/* Card de Janela de Manutenção */}
                <div className="detail-card">
                    <h4><FaCalendarAlt /> Janela de Execução</h4>
                    <p><strong>Início:</strong> {new Date(gmud.janela_inicio).toLocaleString('pt-BR')}</p>
                    <p><strong>Fim:</strong> {new Date(gmud.janela_fim).toLocaleString('pt-BR')}</p>
                </div>

                {/* Card de Justificativa e Impacto */}
                <div className="detail-card full-width">
                    <h4><FaFileMedicalAlt /> Justificativa e Impacto</h4>
                    <p><strong>Justificativa:</strong> {gmud.justificativa}</p>
                    <p><strong>Impacto Esperado:</strong> {gmud.impacto}</p>
                </div>

                {/* Card de Plano de Rollback */}
                <div className="detail-card full-width">
                    <h4><FaUndo /> Plano de Rollback (Reversão)</h4>
                    <p>{gmud.plano_rollback}</p>
                </div>

                {/* Card de Chamados Vinculados (ITEM 3) */}
                <div className="detail-card full-width">
                    <h4><FaLink /> Chamados Vinculados</h4>
                    {gmud.chamados_vinculados.length > 0 ? (
                        <ul className="linked-tickets-list">
                            {gmud.chamados_vinculados.map(chamado => (
                                <li key={chamado.id}>
                                    <span>#{chamado.id} - {chamado.titulo}</span>
                                    <button onClick={() => handleDesvincular(chamado.id)} className="unlink-btn">
                                        <FaUnlink /> Desvincular
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>Nenhum chamado vinculado a esta GMUD.</p>
                    )}
                    <button className="btn-secondary" onClick={() => setIsModalOpen(true)}>
                        <FaLink /> Vincular Incidente
                    </button>
                </div>
                
                {/* Card de Resultado da Execução (ITEM 2) */}
                { (gmud.status === 'Aprovada' || gmud.status === 'Em Execução' || gmud.status === 'Concluída') && (
                    <div className="detail-card full-width">
                        <h4><FaClipboardCheck /> Resultado da Execução</h4>
                        { gmud.resultado_execucao ? (
                            <div>
                                <p className="result-text">{gmud.resultado_execucao}</p>
                                <div className="result-meta">
                                    Registrado por: <strong>{gmud.executado_por_nome || 'N/A'}</strong><br />
                                    Data: <strong>{new Date(gmud.data_real_conclusao).toLocaleString('pt-BR')}</strong>
                                </div>
                            </div>
                        ) : (
                            (gmud.status === 'Aprovada' || gmud.status === 'Em Execução') && (
                                <form onSubmit={handleSalvarResultado} className="result-form">
                                    <label htmlFor="resultado">Descreva o resultado da mudança (sucesso, falha, observações):</label>
                                    <textarea id="resultado" rows="5" value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="Ex: Mudança concluída com sucesso..." disabled={loading}></textarea>
                                    <button type="submit" className="btn-primary" disabled={loading}>
                                        {loading ? <><FaSpinner className="spinner-sm" /> Salvando...</> : 'Salvar Resultado e Concluir GMUD'}
                                    </button>
                                </form>
                            )
                        )}
                    </div>
                )}
                
                <div className="gmud-detail-footer-grid">
                    {/* Card de Status e Aprovação */}
                    <div className="detail-card status-card">
                        <h4>Status Atual</h4>
                        <div className="status-display" style={{ borderColor: statusInfo.color, backgroundColor: `${statusInfo.color}15` }}>
                            <statusInfo.icon style={{ color: statusInfo.color }} />
                            <span style={{ color: statusInfo.color }}>{statusInfo.text}</span>
                        </div>
                        {gmud.aprovador_nome && (
                            <div className="approval-info">
                                <strong>Aprovador/Rejeitor:</strong> {gmud.aprovador_nome}<br />
                                <strong>Data:</strong> {new Date(gmud.data_aprovacao).toLocaleString('pt-BR')}
                            </div>
                        )}
                    </div>

                    {/* Painel de Ações - SÓ APARECE SE ESTIVER PENDENTE */}
                    {gmud.status === 'Pendente' && (
                        <div className="detail-card action-panel">
                            <h4><FaExclamationTriangle /> Ações Pendentes</h4>
                            <p>Esta GMUD aguarda sua aprovação para ser agendada.</p>
                            <div className="action-buttons">
                                <button className="btn-success" onClick={() => handleUpdateStatus('Aprovada')} disabled={loading}>
                                    <FaCheckCircle /> Aprovar Mudança
                                </button>
                                <button className="btn-danger" onClick={() => handleUpdateStatus('Rejeitada')} disabled={loading}>
                                    <FaBan /> Rejeitar Mudança
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Renderização do Modal de Vinculação */}
            {isModalOpen && (
                <VincularChamadoModal
                    gmudId={id}
                    onClose={() => setIsModalOpen(false)}
                    onVinculoAdicionado={() => {
                        toast.success('Chamado vinculado com sucesso!');
                        fetchGmud(); // Recarrega os detalhes da GMUD
                    }}
                />
            )}
        </div>
    );
};

export default GmudDetailPage;