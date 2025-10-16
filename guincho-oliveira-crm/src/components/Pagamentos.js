import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Pagamentos.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Ícones
const ReceitaIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>;
const DespesaIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>;
const SaldoIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>;

// Função para formatar moeda
const formatCurrency = (value) => {
    const numericValue = typeof value === 'number' ? value : 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numericValue);
};

export default function Pagamentos() {
    const navigate = useNavigate();
    const [pagamentos, setPagamentos] = useState([]);
    const [motoristas, setMotoristas] = useState([]);
    const [resumo, setResumo] = useState({ receita: 0, despesa: 0, saldo: 0 });
    const [chartData, setChartData] = useState([]);
    const [formData, setFormData] = useState({ valor: '', motorista_id: '', data: '', descricao: '' });
    const [editFormData, setEditFormData] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    
    const [filters, setFilters] = useState({ data: '', descricao: '' });

    async function fetchData() {
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Bearer ${token}` } };

            // 1. Buscamos TODAS as transações e os motoristas
            const [transacoesRes, motoristasRes] = await Promise.all([
                api.get('/financeiro', config),
                api.get('/api/drivers', config)
            ]);

            // 2. Filtramos APENAS as despesas no frontend
            const todasTransacoes = transacoesRes.data || [];
            const despesasData = todasTransacoes.filter(t => t.tipo === 'Despesa');

            setPagamentos(despesasData); // A lista de pagamentos agora contém apenas despesas
            setMotoristas(motoristasRes.data.data || []);

            // 3. Calculamos o total de despesas a partir dos dados já filtrados
            const totalDespesa = despesasData.reduce((acc, despesa) => {
                return acc + (parseFloat(despesa.valor) || 0);
            }, 0);

            // 4. Atualizamos o resumo e o gráfico com os valores corretos para esta tela
            const receita = 0; // Receita é zero nesta tela
            const saldo = receita - totalDespesa;

            setResumo({ receita, despesa: totalDespesa, saldo });
            setChartData([
                // Mostra apenas a despesa no gráfico para maior clareza
                { name: 'Despesa Total', valor: totalDespesa }
            ]);

        } catch (error) {
            console.error('Erro ao buscar dados:', error);
        }
    }

    useEffect(() => {
        fetchData();
    }, []);

    const filteredPagamentos = useMemo(() => {
        return pagamentos.filter(p => {
            const filterDescricao = filters.descricao.toLowerCase();
            const itemDescricao = p.descricao ? p.descricao.toLowerCase() : '';
            const filterDate = filters.data;
            const itemDate = p.data ? p.data.split('T')[0] : '';

            const matchesDescricao = filterDescricao ? itemDescricao.includes(filterDescricao) : true;
            const matchesDate = filterDate ? itemDate === filterDate : true;

            return matchesDescricao && matchesDate;
        });
    }, [pagamentos, filters]);

    const handleInputChange = (e) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));
    const handleFilterChange = (e) => setFilters(p => ({ ...p, [e.target.name]: e.target.value }));
    
    const handleClearFilters = () => {
        setFilters({ data: '', descricao: '' });
    };

    async function handleSubmit(e) {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            // Ao registrar um novo pagamento, garantimos que o tipo é 'Despesa'
            const payload = { ...formData, tipo: 'Despesa', categoria_id: 2 }; // Assumindo categoria 2 para pagamentos diversos
            await api.post('/financeiro', payload, { headers: { Authorization: `Bearer ${token}` } });
            alert('Pagamento registrado com sucesso!');
            setFormData({ valor: '', motorista_id: '', data: '', descricao: '' });
            fetchData();
        } catch (error) {
            console.error('Erro ao adicionar pagamento:', error);
        }
    }
    
    const handleOpenEditModal = (pagamento) => {
        const dataFormatada = new Date(pagamento.data).toISOString().split('T')[0];
        setEditFormData({ ...pagamento, data: dataFormatada });
        setIsEditModalOpen(true);
    };

    const handleCloseEditModal = () => setIsEditModalOpen(false);
    const handleEditInputChange = (e) => setEditFormData(p => ({ ...p, [e.target.name]: e.target.value }));

    async function handleUpdate(e) {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            await api.put(`/financeiro/${editFormData.id}`, editFormData, { headers: { 'Authorization': `Bearer ${token}` } });
            alert('Pagamento atualizado com sucesso!');
            fetchData();
            handleCloseEditModal();
        } catch (error) {
            console.error('Erro ao atualizar pagamento:', error);
        }
    }

    async function handleExcluir(id) {
        if (window.confirm('Tem certeza que deseja excluir este pagamento?')) {
            try {
                const token = localStorage.getItem('token');
                await api.delete(`/financeiro/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
                fetchData();
            } catch (error) {
                console.error('Erro ao excluir pagamento:', error);
            }
        }
    }

    return (
        <div className="pagamentos-page-layout">
            <div className="pagamentos-sidebar-form">
                <button onClick={() => navigate(-1)} className="back-button">Voltar</button>
                <h1 className="pagamentos-header">Controle de Pagamentos</h1>
                <div className="pagamento-form-card">
                    <h3>Adicionar Novo Pagamento</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group"><label>Valor (R$):</label><input type="number" step="0.01" name="valor" value={formData.valor} onChange={handleInputChange} required /></div>
                        <div className="form-group"><label>Motorista (se aplicável):</label><select name="motorista_id" value={formData.motorista_id} onChange={handleInputChange}><option value="">Nenhum</option>{motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
                        <div className="form-group"><label>Data:</label><input type="date" name="data" value={formData.data} onChange={handleInputChange} required /></div>
                        <div className="form-group"><label>Descrição:</label><textarea name="descricao" value={formData.descricao} onChange={handleInputChange} required></textarea></div>
                        <button type="submit" className="submit-button">Registrar Pagamento</button>
                    </form>
                </div>
            </div>

            <div className="pagamentos-main-content">
                <div className="resumo-dashboard">
                    {/* Opcional: Removi os cards de Receita e Saldo para focar em Despesas */}
                    <div className="resumo-card despesa"><div className="resumo-icon"><DespesaIcon /></div><div className="resumo-content"><h4>Despesa Total</h4><span>{formatCurrency(resumo.despesa)}</span></div></div>
                </div>

                <div className="pagamentos-content-row">
                    <div className="historico-card">
                        <h3>Histórico de Pagamentos ({filteredPagamentos.length})</h3>
                        <div className="history-filters">
                            <input type="date" name="data" value={filters.data} onChange={handleFilterChange} className="filter-input"/>
                            <input type="text" name="descricao" value={filters.descricao} onChange={handleFilterChange} placeholder="Pesquisar por descrição..." className="filter-input"/>
                            <button onClick={handleClearFilters} className="reset-button">Limpar</button>
                        </div>
                        <div className="pagamento-list-wrapper">
                            <ul className="pagamento-list">
                                {filteredPagamentos.length > 0 ? filteredPagamentos.map(p => (
                                    <li key={p.id}>
                                        <div className="list-item-info">
                                            <span className="pagamento-valor">{formatCurrency(p.valor)}</span>
                                            <span className="pagamento-descricao">{p.descricao}</span>
                                            <span className="pagamento-meta">{new Date(p.data).toLocaleDateString('pt-BR', {timeZone: 'UTC'})} | {motoristas.find(m => m.id === p.motorista_id)?.nome || 'N/A'}</span>
                                        </div>
                                        <div className="list-item-actions">
                                            <button onClick={() => handleOpenEditModal(p)} className="edit-button">Editar</button>
                                            <button onClick={() => handleExcluir(p.id)} className="delete-button">Excluir</button>
                                        </div>
                                    </li>
                                )) : <p className="no-results">Nenhum pagamento encontrado.</p>}
                            </ul>
                        </div>
                    </div>

                    <div className="grafico-card">
                        <h3>Gráfico Financeiro</h3>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(tick) => formatCurrency(tick).replace(/\s/g, '')} />
                                    <Tooltip formatter={(value) => formatCurrency(value)} />
                                    <Legend />
                                    <Bar dataKey="valor" fill="#101C5D" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {isEditModalOpen && editFormData && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <button onClick={handleCloseEditModal} className="modal-close-button">&times;</button>
                        <h3>Editar Pagamento</h3>
                        <form onSubmit={handleUpdate}>
                            <div className="form-group"><label>Valor (R$):</label><input type="number" step="0.01" name="valor" value={editFormData.valor} onChange={handleEditInputChange} required /></div>
                            <div className="form-group"><label>Motorista (se aplicável):</label><select name="motorista_id" value={editFormData.motorista_id || ''} onChange={handleEditInputChange}><option value="">Nenhum</option>{motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
                            <div className="form-group"><label>Data:</label><input type="date" name="data" value={editFormData.data} onChange={handleEditInputChange} required /></div>
                            <div className="form-group"><label>Descrição:</label><textarea name="descricao" value={editFormData.descricao} onChange={handleEditInputChange} required></textarea></div>
                            <button type="submit" className="submit-button">Salvar Alterações</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}