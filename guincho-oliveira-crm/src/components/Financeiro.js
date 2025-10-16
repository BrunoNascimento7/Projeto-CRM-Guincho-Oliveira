import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Financeiro.css';

// --- Ícones ---
const ReceitaIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>;
const DespesaIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>;
const SaldoIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>;
const FilterIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14 12v7.88c.04.3-.06.62-.29.83a.979.979 0 0 1-1.42-.22L11 18.22V12H4.22A.996.996 0 0 1 4 11V9c0-.55.45-1 1-1h14c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1h-6.78zM6 10h12v-.5a.5.5 0 0 0-.5-.5H6.5a.5.5 0 0 0-.5.5V10z"/></svg>;

// --- Função Auxiliar ---
const formatCurrency = (value) => {
    const numericValue = typeof value === 'number' ? value : 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numericValue);
};

// --- Componente Principal ---
export default function Financeiro() {
    const navigate = useNavigate();

    // Estados para dados da API
    const [transacoes, setTransacoes] = useState([]);
    const [motoristas, setMotoristas] = useState([]);
    const [categorias, setCategorias] = useState([]);
    
    // Estados para UI e formulários
    const [formData, setFormData] = useState({ tipo: 'Receita', categoria_id: '', descricao: '', valor: '', data: '', motorista_id: '' });
    const [editFormData, setEditFormData] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    
    // --- LÓGICA DO FILTRO ---
    const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '' });
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [tempFiltros, setTempFiltros] = useState({ dataInicio: '', dataFim: '' });

    // --- Funções de Busca de Dados ---
    const fetchData = useCallback(async (filtrosAtuais) => {
        try {
            const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
            
            const params = new URLSearchParams();
            if (filtrosAtuais.dataInicio) params.append('dataInicio', filtrosAtuais.dataInicio);
            if (filtrosAtuais.dataFim) params.append('dataFim', filtrosAtuais.dataFim);

            const [transacoesRes, motoristasRes, categoriasRes] = await Promise.all([
                api.get('/financeiro', { ...config, params }),
                api.get('/api/drivers', config), // CORRIGIDO: de /api/motoristas para /api/drivers
                api.get('/categorias-financeiras', config)
            ]);
            
            // CORREÇÃO APLICADA AQUI:
            setTransacoes(transacoesRes.data || []);
            setMotoristas(motoristasRes.data.data || []); // Extrai o array de motoristas da chave "data"
            setCategorias(categoriasRes.data || []);

        } catch (error) {
            console.error('Erro ao buscar dados:', error);
        }
    }, []);

    useEffect(() => {
        fetchData(filtros);
    }, [fetchData, filtros]);

    // --- CÁLCULO OTIMIZADO DO RESUMO ---
    const resumo = useMemo(() => {
        let receita = 0, despesa = 0;
        transacoes.forEach(t => {
            const valor = parseFloat(t.valor) || 0;
            if (t.tipo === 'Receita') {
                receita += valor;
            } else {
                despesa += valor;
            }
        });
        return { receita, despesa, saldo: receita - despesa };
    }, [transacoes]);


    // --- Handlers do Modal de Filtro ---
    const handleOpenFilterModal = () => {
        setTempFiltros(filtros);
        setIsFilterModalOpen(true);
    };
    const handleCloseFilterModal = () => setIsFilterModalOpen(false);
    const handleTempFilterChange = (e) => setTempFiltros(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleApplyFilters = () => {
        setFiltros(tempFiltros);
        handleCloseFilterModal();
    };
    const handleClearFilters = () => {
        const filtrosLimpados = { dataInicio: '', dataFim: '' };
        setTempFiltros(filtrosLimpados);
        setFiltros(filtrosLimpados);
        handleCloseFilterModal();
    };
    
    // --- Handlers de Formulários e Ações ---
    const categoriasFiltradasForm = useMemo(() => categorias.filter(c => c.tipo === formData.tipo), [categorias, formData.tipo]);
    const categoriasFiltradasModal = useMemo(() => editFormData ? categorias.filter(c => c.tipo === editFormData.tipo) : [], [categorias, editFormData]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(p => ({ ...p, [name]: value, ...(name === 'tipo' && { categoria_id: '' }) }));
    };
    
    async function handleSubmit(e) {
        e.preventDefault();
        if (!formData.categoria_id) {
            alert('Por favor, selecione uma categoria.');
            return;
        }
        try {
            await api.post('/financeiro', formData, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            alert('Transação registrada com sucesso!');
            setFormData({ tipo: 'Receita', categoria_id: '', descricao: '', valor: '', data: '', motorista_id: '' });
            fetchData(filtros);
        } catch (error) {
            console.error('Erro ao adicionar transação:', error);
        }
    }

    const handleEditInputChange = (e) => {
        const { name, value } = e.target;
        setEditFormData(p => ({ ...p, [name]: value, ...(name === 'tipo' && { categoria_id: '' }) }));
    };

    async function handleUpdate(e) {
        e.preventDefault();
        try {
            await api.put(`/financeiro/${editFormData.id}`, editFormData, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            alert('Transação atualizada com sucesso!');
            fetchData(filtros);
            handleCloseEditModal();
        } catch (error) {
            console.error('Erro ao atualizar transação:', error);
        }
    }

    const handleOpenEditModal = (transacao) => {
        const dataFormatada = new Date(transacao.data).toISOString().split('T')[0];
        setEditFormData({ ...transacao, data: dataFormatada });
        setIsEditModalOpen(true);
    };
    const handleCloseEditModal = () => {
        setIsEditModalOpen(false);
        setEditFormData(null);
    };

    async function handleExcluir(transacao) {
        let confirmMessage = 'Tem certeza que deseja excluir esta transação?';
        if (transacao.os_id) {
            confirmMessage += '\n\nATENÇÃO: Esta transação está vinculada a uma Ordem de Serviço. A exclusão irá remover este lançamento e atualizar o status da OS correspondente.';
        }

        if (window.confirm(confirmMessage)) {
            try {
                await api.delete(`/financeiro/${transacao.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
                fetchData(filtros);
            } catch (error) {
                console.error('Erro ao excluir transação:', error);
            }
        }
    }
    
    // --- Renderização do Componente ---
    return (
        <div className="financeiro-page-layout">
            <div className="financeiro-sidebar-form">
                <div className="sidebar-header">
                    <button onClick={() => navigate(-1)} className="back-button" title="Voltar">←</button>
                    <h1 className="financeiro-header">Financeiro</h1>
                </div>

                <form onSubmit={handleSubmit} className="transacao-form-card">
                    <h3>Registrar Nova Transação</h3>
                    <div className="form-group"><label>Tipo:</label><select name="tipo" value={formData.tipo} onChange={handleInputChange}><option value="Receita">Receita</option><option value="Despesa">Despesa</option></select></div>
                    <div className="form-group"><label>Categoria:</label><select name="categoria_id" value={formData.categoria_id} onChange={handleInputChange} required><option value="">Selecione...</option>{categoriasFiltradasForm.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                    <div className="form-group"><label>Valor (R$):</label><input type="number" step="0.01" name="valor" value={formData.valor} onChange={handleInputChange} required /></div>
                    <div className="form-group"><label>Motorista (opcional):</label><select name="motorista_id" value={formData.motorista_id} onChange={handleInputChange}><option value="">Nenhum</option>{motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
                    <div className="form-group"><label>Data:</label><input type="date" name="data" value={formData.data} onChange={handleInputChange} required /></div>
                    <div className="form-group"><label>Descrição:</label><textarea name="descricao" value={formData.descricao} onChange={handleInputChange}></textarea></div>
                    <button type="submit" className="submit-button">Registrar Transação</button>
                </form>
            </div>

            <main className="financeiro-main-content">
                <div className="resumo-dashboard">
                    <div className="resumo-card receita"><div className="resumo-icon"><ReceitaIcon /></div><div className="resumo-content"><h4>Receita Total</h4><span>{formatCurrency(resumo.receita)}</span></div></div>
                    <div className="resumo-card despesa"><div className="resumo-icon"><DespesaIcon /></div><div className="resumo-content"><h4>Despesa Total</h4><span>{formatCurrency(resumo.despesa)}</span></div></div>
                    <div className="resumo-card saldo"><div className="resumo-icon"><SaldoIcon /></div><div className="resumo-content"><h4>Saldo Líquido</h4><span>{formatCurrency(resumo.saldo)}</span></div></div>
                </div>
                
                <div className="transacao-list-card">
                    <div className="list-header">
                        <h3>Histórico de Transações ({transacoes.length})</h3>
                        <button className="filter-trigger-button" onClick={handleOpenFilterModal}>
                            <FilterIcon />
                            Filtrar Período
                        </button>
                    </div>

                    <div className="transacao-list-wrapper">
                        {transacoes.length > 0 ? transacoes.map(t => (
                            <div key={t.id} className={`transacao-item ${t.tipo === 'Despesa' ? 'despesa-item' : 'receita-item'}`}>
                                <div className="list-item-info">
                                    <span className={`transacao-tipo ${t.tipo === 'Despesa' ? 'despesa-item' : 'receita-item'}`}>{t.tipo}</span>
                                    <span className="transacao-descricao">{t.descricao}</span>
                                    <span className="transacao-meta">{new Date(t.data).toLocaleDateString('pt-BR', {timeZone: 'UTC'})} | {motoristas.find(m => m.id === t.motorista_id)?.nome || 'N/A'}</span>
                                </div>
                                <span className="transacao-valor">{formatCurrency(t.valor)}</span>
                                <div className="list-item-actions">
                                    <button onClick={() => handleOpenEditModal(t)} className="action-button edit-button">Editar</button>
                                    <button onClick={() => handleExcluir(t)} className="action-button delete-button">Excluir</button>
                                </div>
                            </div>
                        )) : ( <p className="no-results">Nenhuma transação encontrada para os filtros selecionados.</p> )}
                    </div>
                </div>
            </main>

            {isFilterModalOpen && (
                <div className="modal-overlay" onClick={handleCloseFilterModal}>
                    <div className="modal-content filter-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Filtrar por Período</h3>
                            <button onClick={handleCloseFilterModal} className="modal-close-button">&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group"><label>Data de Início:</label><input type="date" name="dataInicio" value={tempFiltros.dataInicio} onChange={handleTempFilterChange} /></div>
                            <div className="form-group"><label>Data de Fim:</label><input type="date" name="dataFim" value={tempFiltros.dataFim} onChange={handleTempFilterChange} /></div>
                            <div className="filter-modal-actions">
                                <button type="button" onClick={handleClearFilters} className="reset-button">Limpar Filtros</button>
                                <button type="button" onClick={handleApplyFilters} className="submit-button">Aplicar Filtros</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isEditModalOpen && editFormData && (
                <div className="modal-overlay" onClick={handleCloseEditModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Editar Transação</h3>
                            <button onClick={handleCloseEditModal} className="modal-close-button">&times;</button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleUpdate}>
                                <div className="form-group"><label>Tipo:</label><select name="tipo" value={editFormData.tipo} onChange={handleEditInputChange}><option value="Receita">Receita</option><option value="Despesa">Despesa</option></select></div>
                                <div className="form-group"><label>Categoria:</label><select name="categoria_id" value={editFormData.categoria_id} onChange={handleEditInputChange} required><option value="">Selecione...</option>{categoriasFiltradasModal.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                                <div className="form-group"><label>Valor (R$):</label><input type="number" step="0.01" name="valor" value={editFormData.valor} onChange={handleEditInputChange} required /></div>
                                <div className="form-group"><label>Motorista (opcional):</label><select name="motorista_id" value={editFormData.motorista_id || ''} onChange={handleEditInputChange}><option value="">Nenhum</option>{motoristas.map(m => (<option key={m.id} value={m.id}>{m.nome}</option>))}</select></div>
                                <div className="form-group"><label>Data:</label><input type="date" name="data" value={editFormData.data} onChange={handleEditInputChange} required /></div>
                                <div className="form-group"><label>Descrição:</label><textarea name="descricao" value={editFormData.descricao} onChange={handleEditInputChange}></textarea></div>
                                <button type="submit" className="submit-button">Salvar Alterações</button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}