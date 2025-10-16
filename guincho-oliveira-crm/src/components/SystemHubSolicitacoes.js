// src/components/SystemHubSolicitacoes.js

import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
// Vamos reutilizar o CSS do SystemHubClientes para manter a consistência
import './SystemHubClientes.css'; 
import { FaKey, FaCheck, FaTimes, FaHistory } from 'react-icons/fa';

// O Modal de Decisão será importado de um novo componente
import LicenseApprovalModal from './LicenseApprovalModal';

export default function SystemHubSolicitacoes() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // State para controlar o modal
    const [selectedRequest, setSelectedRequest] = useState(null);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const { data } = await api.get('/api/system-hub/licensing-requests', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setRequests(data);
        } catch (error) {
            toast.error("Falha ao carregar a lista de solicitações.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, []);

    const handleDecisionSuccess = () => {
        setSelectedRequest(null); // Fecha o modal
        fetchRequests(); // Atualiza a lista
    };

    if (loading) {
        return <div className="loading-container">Carregando solicitações...</div>;
    }

    return (
        <div className="system-hub-container">
            <div className="hub-header">
                <h1><FaKey /> Solicitações de Licença</h1>
            </div>
            
            <div className="client-list-card">
                <table className="clients-table">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Solicitante</th>
                            <th>Data</th>
                            <th>Pedido</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.map(req => (
                            <tr key={req.id}>
                                <td>{req.nome_empresa}</td>
                                <td>{req.solicitante_nome}</td>
                                <td>{new Date(req.data_solicitacao).toLocaleDateString('pt-BR')}</td>
                                <td>{`+${req.licencas_solicitadas} (de ${req.licencas_atuais})`}</td>
                                <td>
                                    <span className={`status-badge status-${req.status}`}>
                                        {req.status}
                                    </span>
                                </td>
                                <td className="actions-cell">
                                    {req.status === 'pendente' ? (
                                        <button 
                                            title="Processar Solicitação" 
                                            onClick={() => setSelectedRequest(req)} 
                                            className="action-button process"
                                        >
                                            Processar
                                        </button>
                                    ) : (
                                        <span className="processed-by">
                                            {req.status === 'aprovada' ? <FaCheck /> : <FaTimes />}
                                            {new Date(req.data_decisao).toLocaleDateString('pt-BR')}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {requests.length === 0 && <p className="no-clients-message">Nenhuma solicitação de licença encontrada.</p>}
            </div>

            {selectedRequest && (
                <LicenseApprovalModal 
                    request={selectedRequest}
                    onClose={() => setSelectedRequest(null)}
                    onSuccess={handleDecisionSuccess}
                />
            )}
        </div>
    );
}