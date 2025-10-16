// src/components/LicenseApprovalModal.js

import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
import './LicenseApprovalModal.css';
import { FaInfoCircle } from 'react-icons/fa';

export default function LicenseApprovalModal({ request, onClose, onSuccess }) {
    const proposedTotal = request.licencas_atuais + request.licencas_solicitadas;
    const [newTotal, setNewTotal] = useState(proposedTotal);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleDecision = async (decisao) => {
        setIsSubmitting(true);
        try {
            let payload = { decisao };
            if (decisao === 'aprovada') {
                if (newTotal <= request.licencas_atuais) {
                    toast.warn('O novo total de licenças deve ser maior que o atual.');
                    setIsSubmitting(false);
                    return;
                }
                payload.novo_total_licencas = newTotal;
            } else { // 'rejeitada'
                if (!rejectionReason.trim()) {
                    toast.warn('O motivo da rejeição é obrigatório.');
                    setIsSubmitting(false);
                    return;
                }
                payload.motivo_rejeicao = rejectionReason;
            }

            const token = localStorage.getItem('token');
            await api.put(`/api/system-hub/licensing-requests/${request.id}/decide`, payload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            toast.success(`Solicitação ${decisao === 'aprovada' ? 'aprovada' : 'rejeitada'} com sucesso!`);
            onSuccess(); // Chama a função de sucesso para fechar o modal e recarregar a lista
        } catch (error) {
            toast.error("Falha ao processar a decisão.");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content modal-lg">
                <button onClick={onClose} className="modal-close-button" disabled={isSubmitting}>&times;</button>
                <h3>Processar Solicitação de Licença</h3>

                <div className="request-details-card">
                    <p><strong>Cliente:</strong> {request.nome_empresa}</p>
                    <p><strong>Solicitante:</strong> {request.solicitante_nome}</p>
                    <p><strong>Data:</strong> {new Date(request.data_solicitacao).toLocaleString('pt-BR')}</p>
                    <p><strong>Detalhes do Pedido:</strong> O cliente possui <strong>{request.licencas_atuais}</strong> licenças e solicitou mais <strong>{request.licencas_solicitadas}</strong>.</p>
                    {request.justificativa && <p><strong>Justificativa:</strong> <em>"{request.justificativa}"</em></p>}
                </div>

                <div className="decision-section">
                    <h4><FaInfoCircle /> Ação Requerida</h4>
                    <div className="approval-form">
                        <p>Total de licenças propostas: <strong>{proposedTotal}</strong>. Você pode alterar este valor.</p>
                        <div className="form-group">
                            <label>Definir Novo Total de Licenças:</label>
                            <input type="number" value={newTotal} onChange={(e) => setNewTotal(parseInt(e.target.value, 10))} />
                        </div>
                        <button className="decision-button approve" onClick={() => handleDecision('aprovada')} disabled={isSubmitting}>
                            Aprovar
                        </button>
                    </div>

                    <div className="rejection-form">
                        <p>Ou, se for rejeitar, preencha o motivo:</p>
                        <div className="form-group">
                            <label>Motivo da Rejeição (obrigatório):</label>
                            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows="3" />
                        </div>
                        <button className="decision-button reject" onClick={() => handleDecision('rejeitada')} disabled={isSubmitting}>
                            Rejeitar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}