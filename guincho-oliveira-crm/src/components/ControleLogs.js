// src/components/ControleLogs.js (Versão com Paginação)

import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import './ControleLogs.css';
import { FaFileCsv, FaChevronLeft, FaChevronRight } from 'react-icons/fa'; // Ícones para exportar e setas

export default function ControleLogs({ user }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Filtros
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');

    // --- NOVO: Estados para controle da paginação ---
    const [paginaAtual, setPaginaAtual] = useState(1);
    const [totalDePaginas, setTotalDePaginas] = useState(0);
    const [totalDeLogs, setTotalDeLogs] = useState(0);

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            
            const params = new URLSearchParams();
            if (dataInicio) params.append('dataInicio', dataInicio);
            if (dataFim) params.append('dataFim', dataFim);
            params.append('pagina', paginaAtual); // ALTERADO: Envia a página atual na requisição
            
            const { data } = await api.get(`/api/logs?${params.toString()}`);
            
            // ALTERADO: Processa a nova estrutura da resposta da API
            setLogs(data.logs);
            setTotalDeLogs(data.totalLogs);
            setTotalDePaginas(data.totalPages);
            setPaginaAtual(data.currentPage); // Garante que o estado esteja sincronizado com a resposta
            
            setError('');
        } catch (err) {
            console.error("Erro ao buscar logs:", err);
            setError('Falha ao carregar os logs. Você pode não ter permissão.');
            setLogs([]); // Limpa os logs em caso de erro
        } finally {
            setLoading(false);
        }
    }, [dataInicio, dataFim, paginaAtual]); // ALTERADO: Adiciona paginaAtual como dependência

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    // NOVO: Funções para navegar entre as páginas
    const irParaPaginaAnterior = () => {
        if (paginaAtual > 1) {
            setPaginaAtual(paginaAtual - 1);
        }
    };

    const irParaPaginaSeguinte = () => {
        if (paginaAtual < totalDePaginas) {
            setPaginaAtual(paginaAtual + 1);
        }
    };
    
    // NOVO: Função para o botão de filtrar que reseta a página para 1
    const handleFiltrar = () => {
        // Se já estiver na página 1, força a busca. Senão, apenas altera o estado que o useEffect já vai pegar.
        if (paginaAtual === 1) {
            fetchLogs();
        } else {
            setPaginaAtual(1);
        }
    };

    const handleExportar = async () => {
        // A função de exportar continua a mesma, pois o backend a trata separadamente
        try {
            const params = new URLSearchParams();
            if (dataInicio) params.append('dataInicio', dataInicio);
            if (dataFim) params.append('dataFim', dataFim);
            params.append('exportar', 'true');

            const response = await api.get(`/api/logs?${params.toString()}`, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const hoje = new Date().toISOString().slice(0, 10);
            link.setAttribute('download', `relatorio_logs_${hoje}.csv`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

        } catch (error) {
            console.error('Erro ao exportar logs:', error);
            alert('Não foi possível exportar os logs. Verifique se há dados no período selecionado.');
        }
    };
    
    const formatarData = (timestamp) => {
        return new Date(timestamp).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    return (
        <div className="logs-container">
            <div className="logs-header">
                <h1 className="logs-title">Controle de Logs do Sistema</h1>
            </div>
            
            <div className="logs-filters">
                <div className="filter-group">
                    <label htmlFor="dataInicio">Data de Início</label>
                    <input type="date" id="dataInicio" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                </div>
                <div className="filter-group">
                    <label htmlFor="dataFim">Data de Fim</label>
                    <input type="date" id="dataFim" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                </div>
                {/* ALTERADO: onClick agora chama handleFiltrar */}
                <button className="filter-button" onClick={handleFiltrar} disabled={loading}>
                    {loading ? 'Filtrando...' : 'Filtrar'}
                </button>
                <button className="export-button" onClick={handleExportar}>
                    <FaFileCsv /> Exportar CSV
                </button>
            </div>
            
            {loading && <p className="loading-message">Carregando logs...</p>}
            {error && <p className="logs-error">{error}</p>}
            
            {!loading && !error && (
                <>
                    <div className="logs-table-wrapper">
                        <table className="logs-table">
                            <thead>
                                <tr>
                                    <th>Data e Hora</th>
                                    <th>Usuário</th>
                                    <th>Ação</th>
                                    <th>Detalhes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length > 0 ? (
                                    logs.map(log => (
                                        <tr key={log.id}>
                                            <td>{formatarData(log.timestamp)}</td>
                                            <td>{log.usuario_nome || 'Sistema'}</td>
                                            <td>
                                                <span className={`log-acao-badge log-acao-${log.acao.toLowerCase().replace(/_/g, '-')}`}>
                                                    {log.acao}
                                                </span>
                                            </td>
                                            <td>{log.detalhes}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="no-logs-message">
                                            Nenhum log encontrado para os filtros selecionados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* --- NOVO: Componente de Paginação --- */}
                    {totalDePaginas > 0 && (
                        <div className="logs-pagination">
                            <span className="pagination-info">
                                Total de {totalDeLogs} logs
                            </span>
                            <div className="pagination-controls">
                                <button onClick={irParaPaginaAnterior} disabled={paginaAtual === 1} className="pagination-button">
                                    <FaChevronLeft /> Anterior
                                </button>
                                <span className="pagination-page-indicator">
                                    Página {paginaAtual} de {totalDePaginas}
                                </span>
                                <button onClick={irParaPaginaSeguinte} disabled={paginaAtual === totalDePaginas} className="pagination-button">
                                    Próximo <FaChevronRight />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}