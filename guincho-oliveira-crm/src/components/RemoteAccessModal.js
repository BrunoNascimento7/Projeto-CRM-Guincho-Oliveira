// src/components/RemoteAccessModal.js
import React from 'react';
import { FaUserShield } from 'react-icons/fa';
import './RemoteAccessModal.css';

export default function RemoteAccessModal({ request, onAccept, onDeny }) {
    if (!request) return null;

    return (
        <div className="remote-modal-overlay">
            <div className="remote-modal-content">
                <FaUserShield size={50} className="modal-icon" />
                <h2>Solicitação de Acesso Remoto</h2>
                <p>
                    O especialista <strong>{request.adminNome}</strong> está solicitando permissão para 
                    visualizar sua tela e ajudar a resolver o chamado <strong>#{request.chamadoId.substring(0, 8)}</strong>.
                </p>
                <p className="security-note">
                    Nenhuma ação será tomada sem sua permissão. Você pode encerrar a sessão a qualquer momento.
                </p>
                <div className="modal-actions">
                    <button className="btn-deny" onClick={onDeny}>Recusar</button>
                    <button className="btn-accept" onClick={onAccept}>Aceitar e Compartilhar Tela</button>
                </div>
            </div>
        </div>
    );
}