// src/components/SupportModule.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaHeadset, FaPlus, FaChevronLeft, FaPaperclip, FaSpinner, FaPaperPlane, FaUserCircle, FaUserShield, FaDownload, FaInfoCircle } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { format, parseISO } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import api from '../services/api';
import { useSocket } from '../components/SocketContext';
import './SupportModule.css';


// --- COMPONENTE DO FORMULÁRIO COM A LÓGICA DE AUTOMAÇÃO ---
const NewTicketForm = ({ user, onTicketCreated, onCancel }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [formData, setFormData] = useState({
        assunto: '',
        mensagem: '',
        prioridade: 'Normal',
        tipo: 'Incidente',
        categoria_id: '',
        subcategoria_id: '',
        perfil_destino: '' // Campo para o perfil de destino automático
    });
    
    const [opcoesPrioridade, setOpcoesPrioridade] = useState([]);
    
    const [categorias, setCategorias] = useState([]);
    const [subcategoriasFiltradas, setSubcategoriasFiltradas] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [attachment, setAttachment] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const { data } = await api.get('/api/suporte/categorias-ativas');
                setCategorias(data);
            } catch (error) {
                toast.error('Não foi possível carregar as opções de categoria.');
            } finally {
                setLoadingCategories(false);
            }
        };
        fetchCategories();
    }, []);

    useEffect(() => {
        let prioridadesFiltradas = [];
        if (formData.tipo === 'Incidente') {
            prioridadesFiltradas = [
                { value: 'Normal', label: 'Normal - Atrapalha meu trabalho' },
                { value: 'Alta', label: 'Alta - Estou parado por causa disso' },
                { value: 'Urgente', label: 'Urgente - Impacto crítico no sistema' }
            ];
        } else { // Requisição
            prioridadesFiltradas = [
                { value: 'Baixa', label: 'Baixa - Posso continuar trabalhando' },
                { value: 'Normal', label: 'Normal - Atrapalha meu trabalho' }
            ];
        }
        setOpcoesPrioridade(prioridadesFiltradas);
        if (!prioridadesFiltradas.some(p => p.value === formData.prioridade)) {
            setFormData(prev => ({ ...prev, prioridade: prioridadesFiltradas[0].value }));
        }
    }, [formData.tipo, formData.prioridade]);

    const handleCategoryChange = (catId) => {
        const numCatId = parseInt(catId, 10);
        const categoriaSelecionada = categorias.find(c => c.id === numCatId);
        
        setSubcategoriasFiltradas(categoriaSelecionada ? categoriaSelecionada.subcategorias : []);

        if (categoriaSelecionada) {
            setFormData(prev => ({
                ...prev,
                categoria_id: numCatId,
                subcategoria_id: '', // Reseta subcategoria
                tipo: categoriaSelecionada.tipo_padrao || 'Incidente',
                prioridade: categoriaSelecionada.prioridade_padrao || 'Normal',
                perfil_destino: categoriaSelecionada.perfil_destino_padrao || '' // Define o perfil automaticamente
            }));
        } else {
            setFormData(prev => ({ ...prev, categoria_id: '', subcategoria_id: '', perfil_destino: '' }));
        }
    };
    
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.size > 5 * 1024 * 1024) {
            toast.error("O arquivo é muito grande. O limite é de 5MB.");
            e.target.value = null;
            return;
        }
        setAttachment(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.assunto || !formData.mensagem || !formData.categoria_id || !formData.subcategoria_id) {
            return toast.warn('Por favor, preencha todos os campos obrigatórios.');
        }
        setIsSubmitting(true);

        const submissionData = new FormData();
        for (const key in formData) {
            submissionData.append(key, formData[key]);
        }
        
        submissionData.append('logs_console', localStorage.getItem('consoleLogs') || 'Nenhum log de console recente.');
        submissionData.append('logs_rede', JSON.stringify(window.performance.getEntriesByType("resource").slice(-50), null, 2));

        if (attachment) {
            submissionData.append('anexo', attachment);
        }

        try {
            const { data } = await api.post('/api/suporte/chamados', submissionData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Seu pedido de ajuda foi enviado com sucesso!');
            onTicketCreated(data.id);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Houve um erro ao enviar seu pedido.');
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="support-view">
            <header className="view-header">
                <button onClick={onCancel} className="back-button"><FaChevronLeft /> Voltar</button>
                <h1><FaPlus /> Pedido de Ajuda</h1>
            </header>
            <p className="view-subtitle">Descreva seu problema. Informações técnicas serão anexadas automaticamente.</p>
            <form onSubmit={handleSubmit} className="support-form">
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Tipo de Solicitação*</label>
                        <select name="tipo" value={formData.tipo} onChange={handleChange}>
                            <option value="Incidente">Incidente (Algo está quebrado)</option>
                            <option value="Requisição">Requisição (Preciso de algo)</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Qual o nível de urgência?*</label>
                        <select name="prioridade" value={formData.prioridade} onChange={handleChange}>
                            {opcoesPrioridade.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label>Categoria*</label>
                        <select name="categoria_id" value={formData.categoria_id} onChange={(e) => handleCategoryChange(e.target.value)} required disabled={loadingCategories}>
                            <option value="">{loadingCategories ? 'Carregando...' : 'Selecione uma categoria'}</option>
                            {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Subcategoria*</label>
                        <select name="subcategoria_id" value={formData.subcategoria_id} onChange={handleChange} required disabled={!formData.categoria_id}>
                            <option value="">Selecione uma subcategoria</option>
                            {subcategoriasFiltradas.map(sub => <option key={sub.id} value={sub.id}>{sub.nome}</option>)}
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label>Assunto*</label>
                    <input type="text" name="assunto" value={formData.assunto} onChange={handleChange} placeholder="Ex: Erro ao finalizar OS" required />
                </div>
                
                <div className="form-group">
                    <label>Descrição detalhada do problema*</label>
                    <textarea name="mensagem" rows="5" value={formData.mensagem} onChange={handleChange} placeholder="Tente descrever os passos que você tomou antes do erro acontecer." required />
                </div>

                <div className="form-group attachment-group">
                    <label>Anexar um arquivo (Opcional, máx 5MB)</label>
                    <button type="button" onClick={() => fileInputRef.current.click()} className="btn-attach">
                        <FaPaperclip /> {attachment ? attachment.name : 'Escolher arquivo (imagem, PDF, etc.)'}
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
                </div>
                
                <button type="submit" className="btn-send-support" disabled={isSubmitting}>
                    {isSubmitting ? <FaSpinner className="spinner" /> : <FaPaperPlane />}
                    {isSubmitting ? ' Enviando...' : ' Enviar Pedido de Ajuda'}
                </button>
            </form>
        </div>
    );
};


const TicketDetailView = ({ ticketId, onBack }) => {
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newMessage, setNewMessage] = useState('');
    const [attachment, setAttachment] = useState(null);
    const [isSending, setIsSending] = useState(false);
    const timelineEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const socket = useSocket();

    const fetchTicket = useCallback(async () => {
        try {
            const { data } = await api.get(`/api/suporte/chamados/${ticketId}`);
            setTicket(data);
        } catch (error) {
            toast.error("Não foi possível carregar os detalhes do chamado.");
        } finally {
            setLoading(false);
        }
    }, [ticketId]);

    useEffect(() => {
        fetchTicket();
    }, [fetchTicket]);

    useEffect(() => {
        if (socket && ticketId) {
            socket.emit('join_support_ticket', ticketId);

            const handleNewMessage = (message) => {
                if(message.chamado_id === ticketId) {
                    setTicket(prev => ({ ...prev, mensagens: [...prev.mensagens, message] }));
                }
            };
            const handleStatusChange = ({ chamadoId: changedTicketId, newStatus }) => {
                if (changedTicketId === ticketId) {
                    setTicket(prev => ({ ...prev, status: newStatus }));
                    toast.info(`O status do chamado foi atualizado para: ${newStatus}`);
                }
            };

            socket.on('new_support_message', handleNewMessage);
            socket.on('support_ticket_status_changed', handleStatusChange);

            return () => {
                socket.emit('leave_support_ticket', ticketId);
                socket.off('new_support_message', handleNewMessage);
                socket.off('support_ticket_status_changed', handleStatusChange);
            };
        }
    }, [socket, ticketId]);

    useEffect(() => {
        timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [ticket?.mensagens]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() && !attachment) return;
        setIsSending(true);

        const formData = new FormData();
        formData.append('texto', newMessage);
        if (attachment) {
            formData.append('anexo', attachment);
        }

        try {
            await api.post(`/api/suporte/chamados/${ticketId}/mensagens`, formData);
            setNewMessage('');
            setAttachment(null);
            if (fileInputRef.current) fileInputRef.current.value = null;
        } catch (error) {
            toast.error("Falha ao enviar mensagem.");
        } finally {
            setIsSending(false);
        }
    };
    
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.size > 5 * 1024 * 1024) {
            toast.error("O arquivo é muito grande. O limite é de 5MB.");
            e.target.value = null;
            return;
        }
        setAttachment(file);
    };

    const getStatusInfo = (status) => {
        const statuses = {
            'Aberto': { text: 'Aberto', color: '#007bff' },
            'Em Análise': { text: 'Em Análise', color: '#ffc107' },
            'Aguardando Suporte': { text: 'Aguardando Suporte', color: '#17a2b8' },
            'Aguardando Cliente': { text: 'Aguardando sua Resposta', color: '#fd7e14' },
            'Resolvido': { text: 'Resolvido', color: '#28a745' },
            'Fechado': { text: 'Fechado', color: '#6c757d' },
        };
        return statuses[status] || { text: status, color: '#6c757d' };
    };

    if (loading) return <div className="loading-view"><FaSpinner className="spinner" /> Carregando chamado...</div>;
    if (!ticket) return <div>Chamado não encontrado.</div>;
    
    const statusInfo = getStatusInfo(ticket.status);

    return (
        <div className="support-view">
            <header className="view-header">
                <button onClick={onBack} className="back-button"><FaChevronLeft /> Voltar</button>
                {/* CORREÇÃO AQUI: Exibe o ID completo */}
                <h1>#{ticket.id}</h1> 
                <span className="ticket-status-badge" style={{ backgroundColor: statusInfo.color }}>{statusInfo.text}</span>
            </header>
            <h2 className="ticket-subject">{ticket.assunto}</h2>
            
            <div className="timeline">
                {ticket.mensagens.map(msg => (
                    <div key={msg.id} className={`timeline-item ${msg.remetente_tipo}`}>
                        <div className="timeline-icon">
                            {msg.remetente_tipo === 'user' ? <FaUserCircle /> : (msg.remetente_tipo === 'support' ? <FaUserShield /> : <FaInfoCircle />)}
                        </div>
                        <div className="timeline-content">
                            <div className="timeline-header">
                                <strong>{msg.remetente_nome}</strong>
                                <span className="timeline-timestamp">
                                    {format(parseISO(msg.criado_em), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                                </span>
                            </div>
                            <p>{msg.texto}</p>
                            {msg.tipo_mensagem === 'anexo' && msg.anexo_url && (
                                <a href={msg.anexo_url} target="_blank" rel="noopener noreferrer" className="attachment-link">
                                    <FaDownload /> {msg.anexo_nome || 'Baixar anexo'}
                                </a>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={timelineEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="message-form">
                <button type="button" onClick={() => fileInputRef.current.click()} className="btn-attach-message" title="Anexar arquivo" disabled={isSending || ticket.status === 'Fechado'}>
                    <FaPaperclip />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} disabled={isSending || ticket.status === 'Fechado'}/>
                <input 
                    type="text" 
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder={attachment ? `Enviando "${attachment.name}"` : (ticket.status === 'Fechado' ? 'Este chamado está fechado.' : 'Digite sua mensagem...')}
                    disabled={isSending || ticket.status === 'Fechado'}
                />
                <button type="submit" disabled={isSending || (!newMessage.trim() && !attachment) || ticket.status === 'Fechado'}>
                    {isSending ? <FaSpinner className="spinner" /> : <FaPaperPlane />}
                </button>
            </form>
        </div>
    );
};

const TicketListView = ({ onSelectTicket, onNewTicket }) => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTickets = async () => {
            setLoading(true);
            try {
                const { data } = await api.get('/api/suporte/chamados');
                setTickets(data);
            } catch (error) {
                toast.error("Não foi possível carregar seus chamados.");
            } finally {
                setLoading(false);
            }
        };
        fetchTickets();
    }, []);

    return (
        <div className="support-view">
            <header className="view-header">
                <h1>Meus Chamados</h1>
                <button onClick={onNewTicket} className="btn-new-ticket"><FaPlus /> Abrir Chamado</button>
            </header>
            {loading ? (
                <div className="loading-view"><FaSpinner className="spinner" /> Carregando...</div>
            ) : tickets.length === 0 ? (
                <div className="empty-state">
                    <h3>Nenhum chamado aberto!</h3>
                    <p>Se precisar de ajuda, clique em "Abrir Chamado" para começar.</p>
                </div>
            ) : (
                <ul className="ticket-list">
                    {tickets.map(ticket => (
                        <li key={ticket.id} onClick={() => onSelectTicket(ticket.id)}>
                            <div className="ticket-info">
                                {/* CORREÇÃO AQUI: Remove o substring para exibir CRM-MMYY-NNNN completo */}
                                <span>#{ticket.id}</span>
                                <strong>{ticket.assunto}</strong>
                            </div>
                            <div className="ticket-meta">
                                <span>{ticket.status}</span>
                                <span>{format(parseISO(ticket.atualizado_em), 'dd/MM/yy', { locale: ptBR })}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default function SupportModule({ user }) {
    const [isOpen, setIsOpen] = useState(false);
    const [currentView, setCurrentView] = useState('list');
    const [selectedTicketId, setSelectedTicketId] = useState(null);
    const socket = useSocket();
    
    const [hasNotification, setHasNotification] = useState(false);

    useEffect(() => {
        if (socket) {
            const handleSupportNotification = ({ chamadoId }) => {
                if (!isOpen) {
                    setHasNotification(true);
                    try { new Audio('/notification.mp3').play(); } catch (e) {}
                }
            };
            socket.on('support_notification', handleSupportNotification);
            return () => {
                socket.off('support_notification', handleSupportNotification);
            };
        }
    }, [socket, isOpen]);

    const handleSelectTicket = (id) => {
        setSelectedTicketId(id);
        setCurrentView('detail');
    };
    
    const handleTicketCreated = (id) => {
        setSelectedTicketId(id);
        setCurrentView('detail');
    }

    const resetToListView = () => {
        setSelectedTicketId(null);
        setCurrentView('list');
    }
    
    const handleOpenModal = () => {
        setIsOpen(true);
        setHasNotification(false); 
    };

    const handleCloseModal = () => {
        setIsOpen(false);
        setTimeout(() => {
            resetToListView();
        }, 300);
    }
    
    return (
        <>
            <button className={`support-fab ${hasNotification ? 'has-notification' : ''}`} onClick={handleOpenModal} title="Suporte Técnico">
                <FaHeadset size={28} />
                {hasNotification && <span className="notification-dot"></span>}
            </button>
            
            {isOpen && (
                <div className="modal-overlay">
                    <div className="support-modal-content">
                        <button className="modal-close-button" onClick={handleCloseModal}>&times;</button>
                        {currentView === 'list' && <TicketListView onSelectTicket={handleSelectTicket} onNewTicket={() => setCurrentView('new')} />}
                        {currentView === 'detail' && <TicketDetailView ticketId={selectedTicketId} onBack={resetToListView} />}
                        {currentView === 'new' && <NewTicketForm user={user} onTicketCreated={handleTicketCreated} onCancel={resetToListView} />}
                    </div>
                </div>
            )}
        </>
    );
}