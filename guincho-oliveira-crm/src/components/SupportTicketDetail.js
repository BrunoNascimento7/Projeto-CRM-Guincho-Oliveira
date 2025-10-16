// src/components/SupportTicketDetail.js (VERSÃO FINAL COM CARD DE AVALIAÇÃO)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaPaperPlane, FaSpinner, FaChevronLeft, FaUser, FaBuilding, FaUserShield, FaDownload, FaTools, FaInfoCircle, FaUserCircle, FaStar } from 'react-icons/fa';
import { format, parseISO } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import { useSocket } from '../components/SocketContext';
import './SupportTicketDetail.css';
import SlaDetails from './SlaDetails'; 

const TimelineItem = ({ msg }) => {
    const getIcon = () => {
        switch (msg.remetente_tipo) {
            case 'user': return <FaUserCircle />;
            case 'support': return <FaUserShield />;
            default: return <FaInfoCircle />;
        }
    };

    return (
        <div className={`timeline-item ${msg.remetente_tipo}`}>
            <div className="timeline-icon">{getIcon()}</div>
            <div className="timeline-content">
                <div className="timeline-header">
                    <strong>{msg.remetente_nome}</strong>
                    <span className="timeline-timestamp">{format(parseISO(msg.criado_em), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}</span>
                </div>
                <p>{msg.texto}</p>
                {msg.anexo_url && (
                    <a href={msg.anexo_url} target="_blank" rel="noopener noreferrer" className="attachment-link">
                        <FaDownload /> {msg.anexo_nome || 'Baixar anexo'}
                    </a>
                )}
            </div>
        </div>
    );
};

export default function SupportTicketDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [agentes, setAgentes] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const timelineEndRef = useRef(null);
    const socket = useSocket();

    const fetchTicketData = useCallback(async () => {
        try {
            const { data } = await api.get(`/api/admin/suporte/chamados/${id}`);
            setTicket(data);
        } catch (error) {
            toast.error("Chamado não encontrado ou acesso negado.");
            navigate('/suporte-admin');
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        fetchTicketData();
        const fetchAgentes = async () => {
            try {
                const { data } = await api.get('/api/suporte/agentes');
                setAgentes(data);
            } catch {
                toast.warn("Não foi possível carregar a lista de agentes.");
            }
        };
        fetchAgentes();
    }, [fetchTicketData]);

    useEffect(() => {
        if (socket && id) {
            socket.emit('join_support_ticket', id);
            const handleNewMessage = (message) => {
                if (message.chamado_id === id) {
                    setTicket(prev => ({ ...prev, mensagens: [...prev.mensagens, message] }));
                }
            };
            const handleStatusChange = ({ chamadoId: changedTicketId, newStatus }) => {
                if (changedTicketId === id) {
                    setTicket(prev => ({ ...prev, status: newStatus }));
                }
            };
            socket.on('new_support_message', handleNewMessage);
            socket.on('support_ticket_status_changed', handleStatusChange);
            return () => {
                socket.emit('leave_support_ticket', id);
                socket.off('new_support_message', handleNewMessage);
                socket.off('support_ticket_status_changed', handleStatusChange);
            };
        }
    }, [socket, id]);

    useEffect(() => {
        timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [ticket?.mensagens]);
    
    const handleDetailChange = async (e) => {
        const { name, value } = e.target;
        try {
            await api.put(`/api/admin/suporte/chamados/${id}/details`, { [name]: value });
            toast.success("Chamado atualizado!");
        } catch (error) {
            toast.error("Falha ao atualizar o chamado.");
        }
    };
    
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        setIsSending(true);
        const formData = new FormData();
        formData.append('texto', newMessage);
        try {
            await api.post(`/api/suporte/chamados/${id}/mensagens`, formData);
            setNewMessage('');
        } catch (error) {
            toast.error("Falha ao enviar resposta.");
        } finally {
            setIsSending(false);
        }
    };

    if (loading || !ticket) {
        return <div className="loading-full-page"><FaSpinner className="spinner" /> Carregando detalhes do chamado...</div>;
    }

    return (
        <div className="ticket-detail-container">
            <header className="ticket-detail-header">
                <button onClick={() => navigate('/suporte-admin')} className="back-button-detail"><FaChevronLeft /> Voltar ao Painel</button>
                {/* CORREÇÃO AQUI: Exibe o ID completo */}
                <h1>Chamado #{ticket.id.toUpperCase()}</h1>
                <span className="header-subject">{ticket.assunto}</span>
            </header>

            <SlaDetails chamado={ticket} />

            <div className="ticket-detail-grid">
                <main className="timeline-main">
                    <div className="timeline-wrapper">
                        {ticket.mensagens.map(msg => <TimelineItem key={msg.id} msg={msg} />)}
                        <div ref={timelineEndRef} />
                    </div>
                    <form onSubmit={handleSendMessage} className="reply-form">
                        <textarea 
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            placeholder="Digite sua nota interna ou resposta para o cliente..."
                            rows="4"
                            disabled={isSending}
                        />
                        <button type="submit" disabled={isSending || !newMessage.trim()}>
                            {isSending ? <FaSpinner className="spinner" /> : <FaPaperPlane />}
                            {isSending ? 'Enviando...' : 'Enviar Resposta'}
                        </button>
                    </form>
                </main>

                <aside className="details-aside">
                    <div className="details-card">
                        <h3>Ações</h3>
                        <div className="form-group-detail">
                            <label>Status</label>
                            <select name="status" value={ticket.status} onChange={handleDetailChange}>
                                <option>Aberto</option>
                                <option>Aguardando Suporte</option>
                                <option>Aguardando Cliente</option>
                                <option>Resolvido</option>
                                <option>Fechado</option>
                            </select>
                        </div>
                        <div className="form-group-detail">
                            <label>Prioridade</label>
                            <select name="prioridade" value={ticket.prioridade} onChange={handleDetailChange}>
                                <option>Baixa</option>
                                <option>Normal</option>
                                <option>Alta</option>
                                <option>Urgente</option>
                            </select>
                        </div>
                        <div className="form-group-detail">
                            <label>Atribuído a</label>
                            <select name="atribuido_a_id" value={ticket.atribuido_a_id || ''} onChange={handleDetailChange}>
                                <option value="">Ninguém</option>
                                {agentes.map(agente => <option key={agente.id} value={agente.id}>{agente.nome}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    {/* --- NOVO: Card de Avaliação do Cliente --- */}
                    {ticket.avaliacao_nota && (
                        <div className="details-card rating-card-admin">
                            <h3>Avaliação do Cliente</h3>
                            <div className="admin-stars-container">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <FaStar key={star} className={ticket.avaliacao_nota >= star ? 'active' : ''} />
                                ))}
                                <span>({ticket.avaliacao_nota} de 5)</span>
                            </div>
                            {ticket.avaliacao_comentario && (
                                <div className="admin-comment">
                                    <p>"{ticket.avaliacao_comentario}"</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="details-card">
                        <h3>Solicitante</h3>
                        <div className="info-item"><FaUser /><span>{ticket.criado_por_nome}</span></div>
                        <div className="info-item"><FaBuilding /><span>{ticket.nome_empresa || 'Cliente não associado'}</span></div>
                        <div className="info-item"><FaUserShield /><span>{ticket.solicitante_perfil}</span></div>
                    </div>
                     <div className="details-card">
                        <h3>Logs Técnicos</h3>
                        <p className="logs-info">Os seguintes logs foram capturados no momento da abertura do chamado.</p>
                        <a className="logs-download-button" href={`data:text/plain;charset=utf-8,${encodeURIComponent(ticket.logs_console || 'Nenhum log de console disponível.')}`} download={`console-logs-${ticket.id}.txt`}>
                            <FaDownload /> Baixar Logs do Console
                        </a>
                     </div>
                </aside>
            </div>
        </div>
    );
}