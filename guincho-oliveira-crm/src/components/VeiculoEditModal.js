// src/components/VeiculoEditModal.js

import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import './VeiculoEditModal.css'; 
import { FaSave, FaPlus, FaTrash, FaDownload } from 'react-icons/fa';

export default function VeiculoEditModal({ veiculo, motoristas, onClose, onSave }) {
    // CORREÇÃO AQUI: Define 'dados' (Dados Cadastrais) como a aba ativa inicial
    const [activeTab, setActiveTab] = useState('dados'); 
    const [formData, setFormData] = useState({ ...veiculo });
    const [historicoManutencao, setHistoricoManutencao] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);

    const [newMaintenance, setNewMaintenance] = useState({ data: '', tipo: '', custo: '', descricao: '' });
    const [anexo, setAnexo] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // REATORAÇÃO 1: Centralizando a lógica de buscar dados em uma única função.
    const fetchMaintenanceHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const response = await api.get(`/api/vehicles/${veiculo.id}/details`);
            setHistoricoManutencao(response.data.historico_manutencao || []);
        } catch (error) {
            toast.error("Falha ao buscar histórico de manutenções.");
            console.error(error);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [veiculo.id]);

    useEffect(() => {
        fetchMaintenanceHistory();
    }, [fetchMaintenanceHistory]);

    const handleDataChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleMaintenanceChange = (e) => {
        setNewMaintenance({ ...newMaintenance, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e) => {
        setAnexo(e.target.files[0]);
    };

    const handleSaveGeneralData = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await api.put(`/api/vehicles/${formData.id}`, formData);
            toast.success("Dados do veículo salvos com sucesso!");
            onSave(); // Fecha o modal e atualiza a lista principal
        } catch (error) {
            toast.error('Falha ao salvar os dados do veículo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddMaintenance = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        const maintenanceFormData = new FormData();
        Object.keys(newMaintenance).forEach(key => maintenanceFormData.append(key, newMaintenance[key]));
        if (anexo) {
            maintenanceFormData.append('anexo', anexo);
        }

        try {
            await api.post(`/api/vehicles/${veiculo.id}/manutencoes`, maintenanceFormData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success("Manutenção adicionada com sucesso!");
            setNewMaintenance({ data: '', tipo: '', custo: '', descricao: '' });
            setAnexo(null);
            document.querySelector('input[name="anexo"]').value = ''; // Limpa o campo de arquivo

            // REATORAÇÃO 2: Reutilizando a função central para atualizar a lista.
            await fetchMaintenanceHistory();
            onSave(); // Avisa a página principal para atualizar o custo total no card.
        } catch (error) {
            toast.error('Falha ao adicionar manutenção.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteMaintenance = async (manutencaoId) => {
    // 1. A primeira confirmação que você já tem (a da sua imagem)
    if (window.confirm('Tem certeza que deseja excluir este registro?')) {
        try {
            // 2. Chama a rota do backend que apaga tudo em cascata
            await api.delete(`/api/vehicles/manutencoes/${manutencaoId}`);
            
            toast.success("Manutenção e débito financeiro associado foram excluídos!");
            
            // 3. Atualiza a lista na tela para refletir a exclusão
            await fetchMaintenanceHistory();
            onSave(); 
        } catch (error) {
            toast.error('Falha ao excluir manutenção.');
            console.error("Erro detalhado ao excluir:", error);
        }
    }
};

    return (
        <div className="modal-overlay">
            <div className="modal-content large management-modal">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3>Gerenciar Veículo: {veiculo.placa}</h3>

                <div className="modal-tabs">
                    <button className={activeTab === 'dados' ? 'active' : ''} onClick={() => setActiveTab('dados')}>Dados Cadastrais</button>
                    <button className={activeTab === 'manutencoes' ? 'active' : ''} onClick={() => setActiveTab('manutencoes')}>Manutenções</button>
                </div>

                <div className="modal-tab-content">
                    {activeTab === 'dados' && (
                        <form onSubmit={handleSaveGeneralData}>
                            <div className="form-grid">
                                <div className="form-group"><label>Placa</label><input type="text" name="placa" value={formData.placa} onChange={handleDataChange} required /></div>
                                <div className="form-group"><label>Marca</label><input type="text" name="marca" value={formData.marca} onChange={handleDataChange} /></div>
                                <div className="form-group"><label>Modelo</label><input type="text" name="modelo" value={formData.modelo} onChange={handleDataChange} /></div>
                                <div className="form-group"><label>Ano</label><input type="number" name="ano" value={formData.ano} onChange={handleDataChange} /></div>
                                <div className="form-group"><label>Status</label><select name="status" value={formData.status} onChange={handleDataChange}><option value="Disponível">Disponível</option><option value="Em Serviço">Em Serviço</option><option value="Manutenção">Manutenção</option></select></div>
                                <div className="form-group"><label>Motorista</label><select name="motorista_id" value={formData.motorista_id || ''} onChange={handleDataChange}><option value="">Nenhum</option>{motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
                            </div>
                            <div className="form-actions-modal">
                                <button type="submit" className="submit-button" disabled={isSubmitting}><FaSave /> Salvar Alterações</button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'manutencoes' && (
                        <div className="maintenance-section">
                            <div className="maintenance-form-card">
                                <h4><FaPlus /> Lançar Nova Manutenção</h4>
                                <form onSubmit={handleAddMaintenance}>
                                    <div className="form-grid">
                                        <div className="form-group"><label>Data</label><input type="date" name="data" value={newMaintenance.data} onChange={handleMaintenanceChange} required /></div>
                                        <div className="form-group"><label>Tipo de Serviço</label><input type="text" name="tipo" value={newMaintenance.tipo} onChange={handleMaintenanceChange} required placeholder="Ex: Troca de óleo, Pneus" /></div>
                                        <div className="form-group"><label>Custo (R$)</label><input type="number" step="0.01" name="custo" value={newMaintenance.custo} onChange={handleMaintenanceChange} required /></div>
                                        <div className="form-group"><label>Descrição</label><input type="text" name="descricao" value={newMaintenance.descricao} onChange={handleMaintenanceChange} /></div>
                                        <div className="form-group"><label>Anexo (NF, Recibo)</label><input type="file" name="anexo" onChange={handleFileChange} /></div>
                                    </div>
                                    <button type="submit" className="submit-button small" disabled={isSubmitting}>{isSubmitting ? 'Adicionando...' : 'Adicionar'}</button>
                                </form>
                            </div>
                            <div className="maintenance-history-card">
                                <h4>Histórico de Manutenções</h4>
                                {isLoadingHistory ? <p>Carregando...</p> : (
                                    <ul className="history-list">
                                        {historicoManutencao.length > 0 ? historicoManutencao.map(m => (
                                            <li key={m.id}>
                                                <div className="history-item-info">
                                                    <span>{new Date(m.data).toLocaleDateString('pt-BR', {timeZone: 'UTC'})} - <strong>{m.tipo}</strong></span>
                                                    <span>Custo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.custo)}</span>
                                                </div>
                                                <div className="history-item-actions">
                                                    {m.status_aprovacao && <span className={`status-badge-financeiro status-${m.status_aprovacao.toLowerCase()}`}>{m.status_aprovacao}</span>}
                                                    {m.anexo_path && <a href={`${api.defaults.baseURL}/${m.anexo_path.replace(/\\/g, '/')}`} target="_blank" rel="noopener noreferrer" className="action-link"><FaDownload /></a>}
                                                    <button onClick={() => handleDeleteMaintenance(m.id)} className="action-link delete"><FaTrash /></button>
                                                </div>
                                            </li>
                                        )) : <p>Nenhum registro encontrado.</p>}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}