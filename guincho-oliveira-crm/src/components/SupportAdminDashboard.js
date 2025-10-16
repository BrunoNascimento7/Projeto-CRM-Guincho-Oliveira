// src/pages/SupportAdminDashboard.js (VERSÃO COMPLETA E ATUALIZADA PARA FASE 2)

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaSpinner, FaFileAlt, FaClock, FaHeadset, FaCheckCircle } from 'react-icons/fa'; 
import './SupportAdminDashboard.css';
import { format, parseISO, differenceInMinutes, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TABS = ['Aberto', 'Aguardando Suporte', 'Aguardando Cliente', 'Resolvido', 'Fechado'];

// --- NOVA FUNÇÃO AUXILIAR PARA CALCULAR O STATUS DO SLA ---
const getSlaStatus = (chamado) => {
    // Se não há prazo de resolução, não há SLA a ser medido
    if (!chamado.sla_prazo_resolucao) {
        return { text: 'N/A', type: 'default', tooltip: 'Sem política de SLA aplicada' };
    }

    const prazo = parseISO(chamado.sla_prazo_resolucao);
    const agora = new Date();

    // Se o chamado já foi resolvido
    if (chamado.data_resolucao) {
        const dataResolucao = parseISO(chamado.data_resolucao);
        if (dataResolucao <= prazo) {
            return { text: 'Cumprido', type: 'ok', tooltip: 'Resolvido dentro do prazo' };
        } else {
            return { text: 'Violado', type: 'violado', tooltip: 'Resolvido fora do prazo' };
        }
    }

    // Se o chamado está aberto
    const minutosRestantes = differenceInMinutes(prazo, agora);

    if (minutosRestantes < 0) {
        const tempoAtraso = formatDistanceToNowStrict(prazo, { locale: ptBR });
        return { text: 'Atrasado', type: 'violado', tooltip: `Atrasado há ${tempoAtraso}` };
    }
    
    // ATENÇÃO: A lógica abaixo para o status "Atenção" precisa do campo `criado_em` vindo da API.
    // Se ele não estiver vindo, essa parte não funcionará como esperado.
    if (chamado.criado_em) {
        const dataCriacao = parseISO(chamado.criado_em);
        const tempoTotalSla = differenceInMinutes(prazo, dataCriacao);
        // Alerta quando faltar menos de 25% do tempo total do SLA
        if (minutosRestantes <= tempoTotalSla * 0.25) {
            const tempoRestante = formatDistanceToNowStrict(prazo, { locale: ptBR });
            return { text: 'Atenção', type: 'alerta', tooltip: `Menos de ${tempoRestante} restantes` };
        }
    }
    
    const tempoRestante = formatDistanceToNowStrict(prazo, { locale: ptBR });
    return { text: 'No Prazo', type: 'ok', tooltip: `Tempo restante: ${tempoRestante}` };
};

const StatCard = ({ title, value, icon, color }) => (
    <div className="support-stat-card" style={{ '--card-color': color }}>
        <div className="stat-icon" style={{ backgroundColor: color }}>
            {icon}
        </div>
        <div className="stat-info">
            <span className="stat-value">{value}</span>
            <span className="stat-title">{title}</span>
        </div>
    </div>
);

const Badge = ({ text, type, tooltip }) => (
    <span className={`badge badge-${type}`} title={tooltip}>{text || 'N/A'}</span>
);

export default function SupportAdminDashboard() {
    const [chamados, setChamados] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('Aberto');
    const navigate = useNavigate();

    const fetchStats = useCallback(async () => {
        try {
            const { data } = await api.get('/api/admin/suporte/chamados/stats');
            setStats(data);
        } catch (err) {
            toast.error('Falha ao carregar estatísticas.');
        }
    }, []);

    const fetchChamados = useCallback(async (status) => {
        setLoading(true);
        try {
            const { data } = await api.get(`/api/admin/suporte/chamados?status=${status}`);
            setChamados(data);
        } catch (err) {
            toast.error(`Falha ao carregar chamados: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        fetchChamados(activeTab);
    }, [activeTab, fetchChamados, fetchStats]);
    
    return (
        <div className="support-admin-container">
            <header className="support-header">
                <h1>Painel de Suporte</h1>
                <p>Gerencie todos os chamados de suporte abertos no sistema.</p>
            </header>

            {stats && (
                <div className="stats-grid">
                    <StatCard title="Chamados Abertos" value={stats['Aberto'] || 0} icon={<FaFileAlt />} color="#007bff" />
                    <StatCard title="Aguardando Suporte" value={stats['Aguardando Suporte'] || 0} icon={<FaHeadset />} color="#17a2b8" />
                    <StatCard title="Aguardando Cliente" value={stats['Aguardando Cliente'] || 0} icon={<FaClock />} color="#fd7e14" />
                    <StatCard title="Resolvidos" value={stats['Resolvido'] || 0} icon={<FaCheckCircle />} color="#28a745" />
                </div>
            )}

            <div className="chamados-list-section">
                <div className="tabs-container">
                    {TABS.map(tab => (
                        <button 
                            key={tab} 
                            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab.replace('_', ' ')}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="loading-view"><FaSpinner className="spinner" /> Carregando chamados...</div>
                ) : (
                    chamados.length > 0 ? (
                        <div className="table-wrapper">
                            <table className="chamados-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Assunto</th>
                                        <th>Categoria</th>
                                        <th>Solicitante</th>
                                        <th>Prioridade</th>
                                        <th>Status SLA</th>
                                        <th>Última Atualização</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {chamados.map(chamado => {
                                        const slaStatus = getSlaStatus(chamado);
                                        return (
                                            <tr key={chamado.id} onClick={() => navigate(`/suporte-admin/chamado/${chamado.id}`)}>
                                                {/* CORREÇÃO AQUI: Remove o substring para exibir o ID completo (CRM-MMYY-NNNN) */}
                                                <td>#{chamado.id.toUpperCase()}</td>
                                                <td>
                                                    <div className="assunto-cell">
                                                        {chamado.assunto}
                                                        <span className="tipo-chamado">{chamado.tipo}</span>
                                                    </div>
                                                </td>
                                                <td>{chamado.categoria_nome ? `${chamado.categoria_nome} / ${chamado.subcategoria_nome}`: 'N/A'}</td>
                                                <td>{chamado.criado_por_nome}</td>
                                                <td>
                                                    <Badge text={chamado.prioridade} type={chamado.prioridade?.toLowerCase()} />
                                                </td>
                                                <td>
                                                    <Badge text={slaStatus.text} type={`sla-${slaStatus.type}`} tooltip={slaStatus.tooltip} />
                                                </td>
                                                <td>{format(parseISO(chamado.atualizado_em), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p>Nenhum chamado encontrado para este status.</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}