// src/components/SystemHubClientes.js

import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
import './SystemHubClientes.css'; // Seu CSS atual
import { FaPlus, FaUsers, FaPencilAlt } from 'react-icons/fa';

// Importe o novo Super Modal
import SettingsModal from './SettingsModal'; 

// O modal simples para criar um novo cliente pode ser mantido ou movido para seu próprio arquivo
const CreateClientModal = ({ onClose, onSave }) => {
    const [nomeEmpresa, setNomeEmpresa] = useState('');
    const [maxLicencas, setMaxLicencas] = useState(5);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ nome_empresa: nomeEmpresa, max_licencas: maxLicencas });
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3>Novo Cliente</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Nome da Empresa:</label>
                        <input type="text" value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Número de Licenças:</label>
                        <input type="number" min="1" value={maxLicencas} onChange={(e) => setMaxLicencas(parseInt(e.target.value, 10))} required />
                    </div>
                    <button type="submit" className="submit-button">Criar Cliente</button>
                </form>
            </div>
        </div>
    );
};


// --- Componente Principal ---
export default function SystemHubClientes() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);

    const fetchClients = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            // A API já foi corrigida, agora só precisamos consumir os dados corretos
            const { data } = await api.get('/api/system-hub/clientes', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setClients(data);
        } catch (error) {
            toast.error("Falha ao carregar a lista de clientes.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClients();
    }, []);

    const handleCreateClient = async (clientData) => {
        const token = localStorage.getItem('token');
        try {
            await api.post('/api/system-hub/clientes', clientData, { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            toast.success(`Cliente "${clientData.nome_empresa}" criado com sucesso!`);
            fetchClients();
            setIsCreateModalOpen(false);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Não foi possível criar o cliente.');
        }
    };
    
    const handleOpenSettings = (client) => {
        setSelectedClient(client);
        setIsSettingsModalOpen(true);
    };

    const handleCloseAndRefresh = () => {
        setIsSettingsModalOpen(false);
        setSelectedClient(null);
        fetchClients();
    };
    
    if (loading) {
        return <div className="loading-container">Carregando clientes...</div>;
    }

    return (
        <div className="system-hub-container">
            <div className="hub-header">
                <h1><FaUsers /> Gestão de Clientes</h1>
                <button onClick={() => setIsCreateModalOpen(true)} className="add-client-button">
                    <FaPlus /> Adicionar Novo Cliente
                </button>
            </div>
            
            <div className="client-list-card">
                <table className="clients-table">
                    <thead>
                        <tr>
                            <th>Empresa</th>
                            <th>Status</th>
                            <th>Licenças Utilizadas</th>
                            <th>Data de Cadastro</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map(client => {
                            // Lógica para cor da barra de progresso
                            const usagePercentage = (client.licencas_em_uso / client.max_licencas) * 100;
                            let barColorClass = '';
                            if (usagePercentage > 100) barColorClass = 'over';
                            else if (usagePercentage > 85) barColorClass = 'warning';

                            return (
                                <tr key={client.id}>
                                    <td>{client.nome_empresa}</td>
                                    <td>
                                        <span className={`status-badge status-${client.status}`}>
                                            {client.status === 'ativo' ? 'Ativo' : 'Suspenso'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="license-cell">
                                            <span>{client.licencas_em_uso} / {client.max_licencas}</span>
                                            <div className="license-bar">
                                                <div 
                                                    className={`license-bar-fill ${barColorClass}`}
                                                    style={{ width: `${Math.min(usagePercentage, 100)}%`}}
                                                ></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{new Date(client.data_criacao).toLocaleDateString('pt-BR')}</td>
                                    <td className="actions-cell">
                                        <button title="Gerenciar Cliente" onClick={() => handleOpenSettings(client)} className="action-button edit">
                                            <FaPencilAlt /> Gerenciar
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                {clients.length === 0 && <p className="no-clients-message">Nenhum cliente cadastrado ainda.</p>}
            </div>

            {isCreateModalOpen && <CreateClientModal onClose={() => setIsCreateModalOpen(false)} onSave={handleCreateClient} />}
            {isSettingsModalOpen && selectedClient && (
                <SettingsModal 
                    client={selectedClient} 
                    onClose={() => setIsSettingsModalOpen(false)} 
                    onSaveSuccess={handleCloseAndRefresh}
                />
            )}
        </div>
    );
}