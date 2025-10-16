// src/pages/ConciliacaoBancaria.js
import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaUpload, FaHandshake, FaSearch, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import './ConciliacaoBancaria.css';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const formatDate = (dateString) => new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

const ConciliacaoBancaria = () => {
    const [extratoFile, setExtratoFile] = useState(null);
    const [bankTransactions, setBankTransactions] = useState([]);
    const [systemTransactions, setSystemTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [selectedBankTx, setSelectedBankTx] = useState(null);
    const [selectedSystemTx, setSelectedSystemTx] = useState(null);

    // NOVO: Estados para filtros e sugestões
    const [filters, setFilters] = useState({ bank: '', system: '' });
    const [suggestedPairs, setSuggestedPairs] = useState([]);

    const handleFileChange = (e) => {
        setExtratoFile(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!extratoFile) {
            toast.warn('Por favor, selecione um arquivo de extrato (.ofx).');
            return;
        }
        setLoading(true);
        const formData = new FormData();
        formData.append('extrato', extratoFile);

        try {
            const response = await api.post('/api/financeiro/conciliacao/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            // Adiciona um ID único para cada transação do banco para controle no frontend
            const processedBankTxs = response.data.map((tx, index) => ({ ...tx, frontendId: `bank-${index}` }));
            setBankTransactions(processedBankTxs);
            toast.success('Extrato processado com sucesso!');
            
            if(response.data.length > 0){
                const inicio = response.data[0].data;
                const fim = response.data[response.data.length - 1].data;
                fetchSystemTransactions(inicio, fim);
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao processar o extrato.');
        } finally {
            setLoading(false);
        }
    };

    const fetchSystemTransactions = async (inicio, fim) => {
        setLoading(true);
        try {
            const response = await api.get(`/api/financeiro/conciliacao/transacoes-sistema?dataInicio=${inicio}&dataFim=${fim}`);
            setSystemTransactions(response.data);
        } catch (error) {
            toast.error('Falha ao buscar lançamentos do sistema.');
        } finally {
            setLoading(false);
        }
    }

    // NOVO: Efeito para encontrar pares automaticamente
    useEffect(() => {
        if (bankTransactions.length > 0 && systemTransactions.length > 0) {
            const findPairs = () => {
                const pairs = [];
                const availableSystemTxs = [...systemTransactions];

                bankTransactions.forEach(bankTx => {
                    const bestMatchIndex = availableSystemTxs.findIndex(sysTx => 
                        sysTx.data === bankTx.data && Math.abs(sysTx.valor) === Math.abs(bankTx.valor)
                    );

                    if (bestMatchIndex !== -1) {
                        const matchedSysTx = availableSystemTxs[bestMatchIndex];
                        pairs.push({ bankId: bankTx.frontendId, systemId: matchedSysTx.id });
                        availableSystemTxs.splice(bestMatchIndex, 1); // Remove para não parear novamente
                    }
                });
                setSuggestedPairs(pairs);
            };
            findPairs();
        }
    }, [bankTransactions, systemTransactions]);
    
    const handleConciliar = async (bankTxToConcile, systemTxToConcile) => {
        const bankTx = bankTxToConcile || selectedBankTx;
        const systemTx = systemTxToConcile || selectedSystemTx;

        if (!bankTx || !systemTx) {
            toast.warn('Selecione uma transação de cada lado para conciliar.');
            return;
        }
        
        if (Math.abs(bankTx.valor) !== Math.abs(systemTx.valor)) {
            if (!window.confirm(`Os valores são diferentes (${formatCurrency(bankTx.valor)} vs ${formatCurrency(systemTx.valor)}). Deseja conciliar mesmo assim?`)) {
                return;
            }
        }

        try {
            await api.post('/api/financeiro/conciliacao/confirmar', { financeiroId: systemTx.id });
            toast.success('Transação conciliada com sucesso!');
            
            setBankTransactions(prev => prev.filter(tx => tx.frontendId !== bankTx.frontendId));
            setSystemTransactions(prev => prev.filter(tx => tx.id !== systemTx.id));
            setSelectedBankTx(null);
            setSelectedSystemTx(null);
        } catch (error) {
            toast.error('Erro ao conciliar a transação.');
        }
    };

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    // NOVO: Memoização para performance dos filtros e KPIs
    const filteredBankTransactions = useMemo(() => bankTransactions.filter(tx => tx.descricao.toLowerCase().includes(filters.bank.toLowerCase())), [bankTransactions, filters.bank]);
    const filteredSystemTransactions = useMemo(() => systemTransactions.filter(tx => tx.descricao.toLowerCase().includes(filters.system.toLowerCase())), [systemTransactions, filters.system]);

    const bankKpis = useMemo(() => ({
        count: filteredBankTransactions.length,
        total: filteredBankTransactions.reduce((acc, tx) => acc + tx.valor, 0)
    }), [filteredBankTransactions]);

    const systemKpis = useMemo(() => ({
        count: filteredSystemTransactions.length,
        total: filteredSystemTransactions.reduce((acc, tx) => acc + (tx.tipo === 'Despesa' ? -tx.valor : tx.valor), 0)
    }), [filteredSystemTransactions]);

    const isSuggested = (txId, type) => {
        if (type === 'bank') return suggestedPairs.some(p => p.bankId === txId);
        return suggestedPairs.some(p => p.systemId === txId);
    };

    return (
        <div className="content-page conciliacao-page">
            <div className="page-header">
                <h1><FaHandshake /> Conciliação Bancária</h1>
            </div>

            <div className="conciliacao-controls">
                <label htmlFor="extrato-upload" className="custom-file-upload">
                    <FaUpload /> 
                    {extratoFile ? extratoFile.name : 'Escolher arquivo .ofx'}
                </label>
                <input type="file" id="extrato-upload" accept=".ofx" onChange={handleFileChange} />
                <button onClick={handleUpload} disabled={loading || !extratoFile} className="btn-enviar">
                    {loading ? 'Enviando...' : 'Enviar Extrato'}
                </button>
            </div>

            <div className="conciliacao-container">
                {/* Coluna da Esquerda: Transações do Banco */}
                <div className="conciliacao-column">
                    <div className="column-header">
                        <h2>Transações do Extrato</h2>
                        <div className="search-box">
                            <FaSearch />
                            <input type="text" placeholder="Filtrar..." name="bank" value={filters.bank} onChange={handleFilterChange} />
                        </div>
                    </div>
                    <div className="column-kpi">
                        <span>{bankKpis.count} transações</span>
                        <span className={bankKpis.total < 0 ? 'debit' : 'credit'}>{formatCurrency(bankKpis.total)}</span>
                    </div>
                    <div className="transaction-list">
                        {filteredBankTransactions.length === 0 ? <p className="empty-state">Nenhuma transação do extrato carregada.</p> :
                         filteredBankTransactions.map(tx => {
                            const pair = suggestedPairs.find(p => p.bankId === tx.frontendId);
                            const systemMatch = pair ? systemTransactions.find(s => s.id === pair.systemId) : null;
                            return (
                                <div 
                                    key={tx.frontendId} 
                                    className={`transaction-item bank ${selectedBankTx?.frontendId === tx.frontendId ? 'selected' : ''} ${isSuggested(tx.frontendId, 'bank') ? 'suggested' : ''}`}
                                    onClick={() => setSelectedBankTx(tx)}
                                >
                                    <span className="tx-date">{formatDate(tx.data)}</span>
                                    <span className="tx-desc">{tx.descricao}</span>
                                    <span className={`tx-value ${tx.valor < 0 ? 'debit' : 'credit'}`}>{formatCurrency(tx.valor)}</span>
                                    {systemMatch && <button className="btn-quick-concile" onClick={(e) => {e.stopPropagation(); handleConciliar(tx, systemMatch);}}><FaCheckCircle/></button>}
                                </div>
                            )
                         })}
                    </div>
                </div>

                {/* Botão de Ação Central */}
                <div className="conciliacao-actions">
                    <button onClick={() => handleConciliar()} disabled={!selectedBankTx || !selectedSystemTx} title="Conciliar Selecionados">
                        <FaHandshake />
                    </button>
                </div>

                {/* Coluna da Direita: Transações do Sistema */}
                <div className="conciliacao-column">
                    <div className="column-header">
                        <h2>Lançamentos do Sistema</h2>
                        <div className="search-box">
                            <FaSearch />
                            <input type="text" placeholder="Filtrar..." name="system" value={filters.system} onChange={handleFilterChange} />
                        </div>
                    </div>
                    <div className="column-kpi">
                        <span>{systemKpis.count} lançamentos</span>
                        <span className={systemKpis.total < 0 ? 'debit' : 'credit'}>{formatCurrency(systemKpis.total)}</span>
                    </div>
                    <div className="transaction-list">
                        {filteredSystemTransactions.length === 0 ? <p className="empty-state">Nenhum lançamento do sistema encontrado para este período.</p> : 
                         filteredSystemTransactions.map(tx => (
                            <div 
                                key={tx.id} 
                                className={`transaction-item system ${selectedSystemTx?.id === tx.id ? 'selected' : ''} ${isSuggested(tx.id, 'system') ? 'suggested' : ''}`}
                                onClick={() => setSelectedSystemTx(tx)}
                            >
                                <span className="tx-date">{formatDate(tx.data)}</span>
                                <span className="tx-desc">{tx.descricao}</span>
                                <span className={`tx-value ${tx.tipo === 'Despesa' ? 'debit' : 'credit'}`}>{formatCurrency(tx.tipo === 'Despesa' ? -tx.valor : tx.valor)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConciliacaoBancaria;