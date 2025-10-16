// src/components/ControleGastos.js

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import './ControleGastos.css'; 
import { FaPlus, FaFileInvoiceDollar, FaCheck, FaTimes, FaDownload, FaEdit } from 'react-icons/fa';
import GastoModal from './GastoModal';
import AnexoViewerModal from './AnexoViewerModal';

// --- Componente Principal da Página ---
export default function ControleGastos() {
    const location = useLocation();
    const navigate = useNavigate();
    const highlightIdFromState = location.state?.highlightId;

    const [gastos, setGastos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGasto, setEditingGasto] = useState(null);
    const [categorias, setCategorias] = useState([]);
    const [veiculos, setVeiculos] = useState([]);
    const [activeHighlightId, setActiveHighlightId] = useState(null);
    const [anexoParaVer, setAnexoParaVer] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [gastosRes, categoriasRes, veiculosRes] = await Promise.all([
                api.get('/api/gastos'),
                api.get('/api/gastos/categorias'),
                api.get('/api/vehicles')
            ]);
            setGastos(gastosRes.data);
            setCategorias(categoriasRes.data);
            setVeiculos(veiculosRes.data.data || []);
        } catch (error) {
            toast.error("Falha ao carregar dados financeiros.");
        } finally {
            setLoading(false);
        }
    };

    // Efeito para buscar os dados iniciais (roda apenas uma vez)
    useEffect(() => {
        fetchData();
    }, []);

    // Efeito para lidar com o destaque e a rolagem (roda quando os dados chegam)
    useEffect(() => {
        if (highlightIdFromState && gastos.length > 0) {
            setActiveHighlightId(highlightIdFromState);

            const element = document.getElementById(`gasto-row-${highlightIdFromState}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [highlightIdFromState, gastos, navigate, location.pathname]);


    const handleSaveGasto = async (formData, gastoId) => {
        try {
            if (gastoId) {
                await api.post(`/api/gastos/${gastoId}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                toast.success("Gasto atualizado com sucesso!");
            } else {
                await api.post('/api/gastos', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                toast.success("Novo gasto registrado com sucesso!");
            }
            setIsModalOpen(false);
            setEditingGasto(null);
            fetchData();
        } catch (error) {
            toast.error("Erro ao salvar o gasto.");
            console.error(error.response?.data || error);
        }
    };

    const handleOpenAddModal = () => {
        setEditingGasto(null);
        setIsModalOpen(true);
    };
    
    const handleUpdateStatus = async (id, status) => {
        // Impede que o clique no botão de ação dispare o onClick da linha
        if (!window.confirm(`Tem certeza que deseja marcar este gasto como "${status}"?`)) return;
        try {
            await api.put(`/api/gastos/${id}/status`, { status });
            toast.success("Status atualizado!");
            fetchData();
        } catch (error) {
            toast.error("Falha ao atualizar o status.");
        }
    };

    const handleOpenEditModal = (gasto) => {
        setEditingGasto(gasto);
        setIsModalOpen(true);
    };
    
    const handleRowClick = (gastoId) => {
        if (gastoId === activeHighlightId) {
            setActiveHighlightId(null);
        }
    };

    const formatCurrency = (value) => {
        const num = parseFloat(value);
        if(isNaN(num)) return 'R$ 0,00';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
    };

    return (
        <div className="content-page">
            <div className="cg-header">
                <h1><FaFileInvoiceDollar /> Controle de Gastos</h1>
                <button className="cg-add-button" onClick={handleOpenAddModal}>
                    <FaPlus /> Adicionar Gasto
                </button>
            </div>
            
            <div className="table-container">
                <table className="custom-table">
                    <thead>
                        <tr>
                            <th>Vencimento</th>
                            <th>Descrição</th>
                            <th>Categoria</th>
                            <th>Centro de Custo</th>
                            <th>Valor</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="7" style={{ textAlign: 'center' }}>Carregando...</td></tr>
                        ) : (
                            gastos.map(gasto => (
                                <tr 
                                  key={gasto.id} 
                                  id={`gasto-row-${gasto.id}`}
                                  className={gasto.id === activeHighlightId ? 'highlight' : ''}
                                  onClick={() => handleRowClick(gasto.id)}
                                >
                                    <td>{new Date(gasto.data_vencimento).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</td>
                                    <td>
                                        <div className="descricao-cell">
                                            {gasto.descricao}
                                            {gasto.anexo_url && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setAnexoParaVer(gasto.anexo_url); }} 
                                                    className="anexo-button" 
                                                    title="Ver Anexo"
                                                >
                                                    <FaDownload />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td>{gasto.categoria_nome}</td>
                                    <td>{gasto.veiculo_placa || 'Geral'}</td>
                                    <td>{formatCurrency(gasto.valor)}</td>
                                    <td><span className={`status-badge status-${gasto.status.toLowerCase()}`}>{gasto.status}</span></td>
                                    <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                                        {gasto.status === 'Pendente' && (
                                            <>
                                                <button title="Aprovar Gasto" className="action-btn-approve" onClick={() => handleUpdateStatus(gasto.id, 'Aprovada')}><FaCheck /></button>
                                                <button title="Rejeitar Gasto" className="action-btn-reject" onClick={() => handleUpdateStatus(gasto.id, 'Rejeitada')}><FaTimes /></button>
                                            </>
                                        )}
                                        {gasto.status === 'Aprovada' && (
                                            <button title="Marcar como Paga" className="action-btn-pay" onClick={() => handleUpdateStatus(gasto.id, 'Paga')}><FaFileInvoiceDollar /></button>
                                        )}
                                        <button title="Editar Gasto" className="action-btn-edit" onClick={() => handleOpenEditModal(gasto)}><FaEdit /></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <GastoModal 
                    gasto={editingGasto}
                    onClose={() => { setIsModalOpen(false); setEditingGasto(null); }}
                    onSave={handleSaveGasto}
                    categorias={categorias}
                    veiculos={veiculos}
                />
            )}

            {anexoParaVer && (
                <AnexoViewerModal
                    anexoUrl={anexoParaVer}
                    onClose={() => setAnexoParaVer(null)}
                />
            )}
        </div>
    );
}