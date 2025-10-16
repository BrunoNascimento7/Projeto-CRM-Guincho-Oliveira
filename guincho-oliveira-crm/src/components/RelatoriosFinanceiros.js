import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './RelatoriosFinanceiros.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';

// --- Ícones ---
const ReceitaIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>;
const DespesaIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>;
const SaldoIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>;
const DownloadIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>;
const FilterIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>;
const BackIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 5 5 12 12 19"></polyline></svg>;

// --- Componente de Item da Lista (reutilizável) ---
const TransacaoItem = ({ transacao, motoristas, onEdit, onDelete }) => {
    const formatCurrency = (value) => {
        if (typeof value !== 'number' || isNaN(value)) return 'R$ 0,00';
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    const motoristaNome = (motoristas || []).find(m => m.id === transacao.motorista_id)?.nome || 'N/A';
    const isDespesa = transacao.tipo === 'Despesa';

    return (
        <div className={`transacao-item ${isDespesa ? 'despesa-item' : 'receita-item'}`}>
            <div className="list-item-info">
                <span className="transacao-valor">{formatCurrency(transacao.valor)}</span>
                <span className="transacao-descricao">{transacao.descricao}</span>
                <span className="transacao-meta">{new Date(transacao.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} | {motoristaNome}</span>
            </div>
            <div className="list-item-actions">
                <button onClick={() => onEdit(transacao)} className="edit-button">Editar</button>
                <button onClick={() => onDelete(transacao)} className="delete-button">Excluir</button>
            </div>
        </div>
    );
};

export default function RelatoriosFinanceiros() {
    const navigate = useNavigate();
    const [transacoes, setTransacoes] = useState([]);
    const [motoristas, setMotoristas] = useState([]);
    const [editFormData, setEditFormData] = useState({});
    
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

    const [filterData, setFilterData] = useState({
        dataInicio: '', dataFim: '', tipo: 'Todos', motorista_id: ''
    });

    const formatCurrency = (value) => {
        if (typeof value !== 'number' || isNaN(value)) return 'R$ 0,00';
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    async function fetchAllData(filterParams = filterData) {
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'Authorization': `Bearer ${token}` } };
            
            const [transacoesRes, motoristasRes] = await Promise.all([
                api.get('/financeiro', { ...config, params: filterParams }),
                api.get('/api/drivers', config) // <<--- CORREÇÃO 1: URL ajustada
            ]);
            
            setTransacoes(transacoesRes.data || []);
            setMotoristas(motoristasRes.data.data || []); // <<--- CORREÇÃO 2: Extraindo da chave "data"
            
        } catch (error) { console.error('Erro ao buscar dados:', error); }
    }

    useEffect(() => { 
        fetchAllData(); 
    }, []);
    
    const resumo = useMemo(() => {
        return transacoes.reduce((acc, t) => {
            const valor = parseFloat(t.valor) || 0;
            if (t.tipo === 'Receita') {
                acc.receita += valor;
            } else {
                acc.despesa += valor;
            }
            acc.saldo = acc.receita - acc.despesa;
            return acc;
        }, { receita: 0, despesa: 0, saldo: 0 });
    }, [transacoes]);

    const { receitas, despesas } = useMemo(() => ({
        receitas: transacoes.filter(t => t.tipo === 'Receita'),
        despesas: transacoes.filter(t => t.tipo === 'Despesa'),
    }), [transacoes]);

    const handleFilterChange = (e) => setFilterData(p => ({ ...p, [e.target.name]: e.target.value }));
    
    const handleFiltrar = (e) => {
        e.preventDefault();
        fetchAllData(filterData);
        setIsFilterModalOpen(false);
    };
    
    const handleEditInputChange = (e) => {
        const { name, value } = e.target;
        setEditFormData(prevState => ({
            ...prevState,
            [name]: value
        }));
    };
    
    const handleOpenEditModal = (transacao) => {
        setEditFormData({
            ...transacao,
            data: new Date(transacao.data).toISOString().split('T')[0]
        });
        setIsEditModalOpen(true);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            await api.put(`/financeiro/${editFormData.id}`, editFormData, { headers: { 'Authorization': `Bearer ${token}` } });
            alert('Transação atualizada com sucesso!');
            fetchAllData(filterData);
            setIsEditModalOpen(false);
        } catch (error) { console.error('Erro ao atualizar transação:', error); }
    };
    
    const handleExcluir = async (transacao) => {
        let confirmMessage = `Tem certeza que deseja excluir esta ${transacao.tipo.toLowerCase()}?`;
        if (transacao.os_id) {
            confirmMessage += '\n\nATENÇÃO: Esta transação está vinculada a uma Ordem de Serviço e irá alterar o status da OS.';
        }
        if (window.confirm(confirmMessage)) {
            try {
                const token = localStorage.getItem('token');
                await api.delete(`/financeiro/${transacao.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
                fetchAllData(filterData);
            } catch (error) { console.error('Erro ao excluir transação:', error); }
        }
    };
    
    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.text("Relatório Financeiro", 14, 15);
        const tableColumn = ["Data", "Tipo", "Descrição", "Motorista", "Valor"];
        const tableRows = [];

        transacoes.forEach(t => {
            const motoristaNome = (motoristas || []).find(m => m.id === t.motorista_id)?.nome || 'N/A';
            const transacaoData = [
                new Date(t.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
                t.tipo,
                t.descricao,
                motoristaNome,
                formatCurrency(t.valor)
            ];
            tableRows.push(transacaoData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 20
        });
        
        const finalY = doc.lastAutoTable.finalY || 20;
        doc.text("Resumo do Período", 14, finalY + 15);
        doc.text(`Receita: ${formatCurrency(resumo.receita)}`, 14, finalY + 22);
        doc.text(`Despesa: ${formatCurrency(resumo.despesa)}`, 14, finalY + 29);
        doc.text(`Saldo: ${formatCurrency(resumo.saldo)}`, 14, finalY + 36);
        
        doc.save(`relatorio_financeiro_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
    };

    const handleExportCSV = () => {
        const csvData = transacoes.map(t => ({
            Data: new Date(t.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
            Tipo: t.tipo,
            Descrição: t.descricao,
            Motorista: (motoristas || []).find(m => m.id === t.motorista_id)?.nome || 'N/A',
            Valor: (t.valor || 0).toFixed(2).replace('.', ',')
        }));

        const csv = Papa.unparse(csvData, { delimiter: ';' });
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `relatorio_financeiro_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="relatorios-page-layout">
            <header className="relatorios-main-header">
                <div className="header-title-section">
                    <button onClick={() => navigate(-1)} className="back-button"><BackIcon /></button>
                    <h1>Relatórios Financeiros</h1>
                </div>
                <div className="header-actions">
                    <button onClick={() => setIsFilterModalOpen(true)} className="filter-trigger-button"><FilterIcon /> Filtrar</button>
                    <button onClick={() => setIsExportModalOpen(true)} className="export-button"><DownloadIcon /> Extrair Relatório</button>
                </div>
            </header>

            <main className="relatorios-main-content">
                <div className="resumo-dashboard">
                    <div className="resumo-card receita"><div className="resumo-icon"><ReceitaIcon /></div><div className="resumo-content"><h4>Receita do Período</h4><span>{formatCurrency(resumo.receita)}</span></div></div>
                    <div className="resumo-card despesa"><div className="resumo-icon"><DespesaIcon /></div><div className="resumo-content"><h4>Despesa do Período</h4><span>{formatCurrency(resumo.despesa)}</span></div></div>
                    <div className="resumo-card saldo"><div className="resumo-icon"><SaldoIcon /></div><div className="resumo-content"><h4>Saldo do Período</h4><span>{formatCurrency(resumo.saldo)}</span></div></div>
                </div>

                <div className="relatorios-colunas-wrapper">
                    <div className="coluna-card">
                        <div className="coluna-header">
                            <h3 className="receita">Receitas ({receitas.length})</h3>
                        </div>
                        <div className="transacao-list-wrapper">
                            {receitas.length > 0 ? receitas.map(t => (
                                <TransacaoItem key={t.id} transacao={t} motoristas={motoristas} onEdit={handleOpenEditModal} onDelete={handleExcluir} />
                            )) : <p className="no-results">Nenhuma receita encontrada.</p>}
                        </div>
                    </div>
                    <div className="coluna-card">
                        <div className="coluna-header">
                            <h3 className="despesa">Despesas ({despesas.length})</h3>
                        </div>
                        <div className="transacao-list-wrapper">
                            {despesas.length > 0 ? despesas.map(t => (
                                <TransacaoItem key={t.id} transacao={t} motoristas={motoristas} onEdit={handleOpenEditModal} onDelete={handleExcluir} />
                            )) : <p className="no-results">Nenhuma despesa encontrada.</p>}
                        </div>
                    </div>
                </div>
            </main>
            
            {isFilterModalOpen && (
                 <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Filtrar Transações</h3>
                            <button onClick={() => setIsFilterModalOpen(false)} className="modal-close-button">&times;</button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleFiltrar}>
                                <div className="form-group"><label>Data de Início:</label><input type="date" name="dataInicio" value={filterData.dataInicio} onChange={handleFilterChange} /></div>
                                <div className="form-group"><label>Data de Fim:</label><input type="date" name="dataFim" value={filterData.dataFim} onChange={handleFilterChange} /></div>
                                <div className="form-group"><label>Tipo:</label><select name="tipo" value={filterData.tipo} onChange={handleFilterChange}><option value="Todos">Todos</option><option value="Receita">Receita</option><option value="Despesa">Despesa</option></select></div>
                                <div className="form-group"><label>Motorista:</label><select name="motorista_id" value={filterData.motorista_id} onChange={handleFilterChange}><option value="">Todos</option>{motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
                                <button type="submit" className="submit-button">Aplicar Filtros</button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            
            {isExportModalOpen && (
                 <div className="modal-overlay">
                    <div className="modal-content">
                           <div className="modal-header">
                               <h3>Extrair Relatório</h3>
                               <button onClick={() => setIsExportModalOpen(false)} className="modal-close-button">&times;</button>
                           </div>
                           <div className="modal-body">
                               <p>Escolha o formato para baixar o relatório com os filtros atuais.</p>
                               <div className="preview-table-wrapper">
                                   <table className="preview-table">
                                       <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead>
                                       <tbody>
                                           {transacoes.slice(0, 5).map(t => (
                                                <tr key={t.id}>
                                                    <td>{new Date(t.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                                                    <td>{t.tipo}</td>
                                                    <td>{t.descricao}</td>
                                                    <td>{formatCurrency(t.valor)}</td>
                                                </tr>
                                           ))}
                                           {transacoes.length > 5 && <tr><td colSpan="4" style={{textAlign: 'center'}}>... e mais {transacoes.length - 5} registros.</td></tr>}
                                       </tbody>
                                   </table>
                               </div>
                               <div className="download-actions">
                                   <button onClick={handleExportPDF} className="download-button pdf">Baixar PDF</button>
                                   <button onClick={handleExportCSV} className="download-button csv">Baixar Planilha (CSV)</button>
                               </div>
                           </div>
                       </div>
                   </div>
            )}

            {isEditModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Editar Transação</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="modal-close-button">&times;</button>
                        </div>
                        <div className="modal-body">
                            <form onSubmit={handleUpdate}>
                                <div className="form-group"><label>Tipo:</label><select name="tipo" value={editFormData.tipo} onChange={handleEditInputChange}><option value="Receita">Receita</option><option value="Despesa">Despesa</option></select></div>
                                <div className="form-group"><label>Valor (R$):</label><input type="number" step="0.01" name="valor" value={editFormData.valor} onChange={handleEditInputChange} required /></div>
                                <div className="form-group"><label>Motorista (opcional):</label><select name="motorista_id" value={editFormData.motorista_id || ''} onChange={handleEditInputChange}><option value="">Nenhum</option>{motoristas.map(m => (<option key={m.id} value={m.id}>{m.nome}</option>))}</select></div>
                                <div className="form-group"><label>Data:</label><input type="date" name="data" value={editFormData.data} onChange={handleEditInputChange} required /></div>
                                <div className="form-group"><label>Descrição:</label><textarea name="descricao" value={editFormData.descricao} onChange={handleEditInputChange} required></textarea></div>
                                <button type="submit" className="submit-button">Salvar Alterações</button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}