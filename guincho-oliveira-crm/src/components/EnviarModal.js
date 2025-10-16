// src/components/EnviarModal.js
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api'; // Importe sua instância do axios
import { FaSms, FaWhatsapp, FaEnvelope, FaPaperPlane } from 'react-icons/fa';
import './EnviarModal.css'; // Criaremos este arquivo de estilo

export default function EnviarModal({ isOpen, onClose, quoteData }) {
    const [telefone, setTelefone] = useState('');
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        // Preenche o telefone automaticamente se o cliente tiver um cadastrado
        if (quoteData && quoteData.cliente && quoteData.cliente.telefone) {
            setTelefone(quoteData.cliente.telefone);
        } else {
            setTelefone('');
        }
    }, [quoteData]);

    if (!isOpen) return null;

    const handleSendSms = async () => {
        if (!telefone) {
            toast.warn('Por favor, insira um número de telefone.');
            return;
        }
        setIsSending(true);
        try {
            const response = await api.post(`/api/orcamentos/${quoteData.id}/enviar-sms`, { telefone });
            toast.success(response.data.message);
            onClose(); // Fecha o modal após o sucesso
        } catch (error) {
            toast.error(error.response?.data?.error || 'Não foi possível enviar o SMS.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3>Enviar Cotação #{quoteData.uid}</h3>
                
                <div className="send-options-container">
                    {/* Opção de SMS */}
                    <div className="send-option-card sms-card">
                        <div className="card-header">
                            <FaSms />
                            <h4>Via SMS</h4>
                        </div>
                        <p>O cliente receberá um link para visualizar a cotação.</p>
                        <div className="form-group">
                            <label>Nº de Telefone (com DDD)</label>
                            <input 
                                type="text" 
                                value={telefone}
                                onChange={(e) => setTelefone(e.target.value)}
                                placeholder="(11) 99999-9999"
                            />
                        </div>
                        <button className="btn-send" onClick={handleSendSms} disabled={isSending}>
                            <FaPaperPlane /> {isSending ? 'Enviando...' : 'Enviar SMS'}
                        </button>
                    </div>

                    {/* Opção de WhatsApp */}
                    <div className="send-option-card disabled-card">
                         <div className="card-header">
                            <FaWhatsapp />
                            <h4>Via WhatsApp</h4>
                        </div>
                        <p>Em breve! Integração em desenvolvimento.</p>
                        <button className="btn-send" disabled>Indisponível</button>
                    </div>

                    {/* Opção de E-mail */}
                    <div className="send-option-card disabled-card">
                         <div className="card-header">
                            <FaEnvelope />
                            <h4>Via E-mail</h4>
                        </div>
                        <p>Em breve! Integração em desenvolvimento.</p>
                        <button className="btn-send" disabled>Indisponível</button>
                    </div>
                </div>
            </div>
        </div>
    );
}