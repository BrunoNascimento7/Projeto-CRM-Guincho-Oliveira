// src/components/NotificationsDropdown.js (VERSÃO FINAL COM NOTIFICAÇÕES DE GMUD)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { 
    FaBell, FaThumbsUp, FaThumbsDown, FaKey, FaExternalLinkAlt,
    FaRegCommentDots, FaTasks, FaBullhorn, FaWrench 
} from 'react-icons/fa';
import api from '../services/api';
import { toast } from 'react-toastify';
import './NotificationsDropdown.css';
import { useDataRefresher } from '../hooks/useDataRefresher';
import { useSupport } from '../context/SupportContext';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- FUNÇÃO DE SOM ---
const playNotificationSound = () => {
    try {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(error => console.log("Navegador bloqueou a reprodução automática do som."));
    } catch(e) {
        console.error("Erro ao tentar tocar o som da notificação", e);
    }
};

const getNotificationIcon = (type) => {
    switch (type) {
        case 'despesa_pendente':
            return { icon: <FaWrench />, className: 'icon-despesa' };
        case 'aprovacao_kb':
        case 'decisao_kb':
            return { icon: <FaTasks />, className: 'icon-kb' };
        case 'solicitacao_licenca':
        case 'decisao_licenca':
            return { icon: <FaKey />, className: 'icon-licenca' };
        case 'anuncio':
        case 'anuncio_global':
            return { icon: <FaBullhorn />, className: 'icon-anuncio' };
        case 'suporte_resposta':
        case 'suporte_status_change':
            return { icon: <FaRegCommentDots />, className: 'icon-suporte' };
        
        // --- ALTERAÇÃO AQUI (1/2): ADICIONANDO ÍCONES PARA GMUD ---
        case 'gmud_aprovada':
            return { icon: <FaThumbsUp />, className: 'icon-gmud-approved' };
        case 'gmud_rejeitada':
            return { icon: <FaThumbsDown />, className: 'icon-gmud-rejected' };
        // --- FIM DA ALTERAÇÃO ---

        default:
            return { icon: <FaBell />, className: 'icon-default' };
    }
};

export default function NotificationsDropdown({ onProcessLicenseRequest, onShowAnuncio, onShowGlobalAnuncio }) {
    const navigate = useNavigate();
    const { perfil } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [notificacoes, setNotificacoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const dropdownRef = useRef(null);
    const { refreshKey, refreshData } = useDataRefresher();
    const { openSupportTicket } = useSupport();
    const [lastUnreadCount, setLastUnreadCount] = useState(0);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => { document.removeEventListener("mousedown", handleClickOutside); };
    }, []);

    const fetchNotificacoes = useCallback(async (isInitialLoad = false) => {
        if (!isInitialLoad) setLoading(true);
        try {
            const { data } = await api.get('/notificacoes');
            const currentUnreadCount = data.filter(n => !n.lida).length;

            if (!isInitialLoad && currentUnreadCount > lastUnreadCount) {
                playNotificationSound();
            }
            
            setNotificacoes(data);
            if(isInitialLoad) {
                setLastUnreadCount(currentUnreadCount);
            }

        } catch (error) {
            if (error.response?.status !== 401) {
                console.error("Erro ao buscar notificações:", error);
            }
        } finally {
            setLoading(false);
        }
    }, [lastUnreadCount]);

    useEffect(() => {
        fetchNotificacoes(true); // Carga inicial
        const interval = setInterval(() => fetchNotificacoes(false), 20000); // Verifica a cada 20 segundos
        return () => clearInterval(interval);
    }, [fetchNotificacoes, refreshKey]); // Adicionado refreshKey para forçar atualização

    const handleItemClick = async (notificacao) => {
        setIsOpen(false); 

        if (notificacao.tipo === 'anuncio' && onShowAnuncio) {
            console.log('NOTIFICAÇÃO CLICADA:', notificacao);
            onShowAnuncio(notificacao);
            return;
        }
        if (notificacao.tipo === 'anuncio_global' && onShowGlobalAnuncio) {
            onShowGlobalAnuncio(notificacao);
            return;
        }

        switch (notificacao.tipo) {
            case 'despesa_pendente':
                console.log('CLICOU! Tentando navegar para /controle-de-gastos com o ID:', notificacao.link_id);
                navigate('/financeiro/gastos', { state: { highlightId: notificacao.link_id } });
                break;
            case 'suporte_resposta':
            case 'suporte_status_change':
                openSupportTicket(notificacao.link_id);
                break;
            case 'solicitacao_licenca':
                if (perfil === 'admin_geral') {
                    handleOpenApprovalModal({ stopPropagation: () => {} }, notificacao.link_id);
                }
                break;
            case 'decisao_kb':
            case 'aprovacao_kb':
                navigate('/base-conhecimento'); 
                break;

            // --- ALTERAÇÃO AQUI (2/2): ADICIONANDO AÇÃO DE CLIQUE PARA GMUD ---
            case 'gmud_aprovada':
            case 'gmud_rejeitada':
                // O link_id que salvamos no backend é o ID da GMUD
                navigate(`/suporte-admin/gmud/${notificacao.link_id}`);
                break;
            // --- FIM DA ALTERAÇÃO ---

            default:
                console.log("Ação não definida para este tipo de notificação.");
        }
        
        if (!notificacao.lida && typeof notificacao.id === 'number') {
            try {
                await api.post(`/api/notificacoes/${notificacao.id}/lida`);
                refreshData();
                fetchNotificacoes(true);
            } catch (err) {
                console.error("Falha ao marcar notificação como lida");
            }
        }
    };
    
    const handleKbDecision = async (event, artigoId, decisao) => {
        event.stopPropagation();
        let motivo = '';
        if (decisao === 'rejeitado') {
            motivo = prompt("Por favor, informe o motivo da rejeição:");
            if (motivo === null || motivo.trim() === '') {
                toast.warn("A rejeição foi cancelada pois o motivo é obrigatório.");
                return;
            }
        }
        try {
            const acao = decisao === 'aprovado' ? 'aprovado' : 'rejeitado';
            await api.put(`/api/notificacoes/kb/${artigoId}/decisao`, { decisao: acao, motivo });
            toast.success(`Artigo ${acao} com sucesso!`);
            refreshData();
        } catch (error) {
            toast.error("Falha ao processar a decisão.");
        }
    };
    
    const handleOpenApprovalModal = async (event, solicitacaoId) => {
        event.stopPropagation();
        try {
            const { data: requestDetails } = await api.get(`/api/system-hub/licensing-requests/${solicitacaoId}`);
            onProcessLicenseRequest(requestDetails);
            setIsOpen(false);
        } catch (error) {
            toast.error("Não foi possível carregar os detalhes da solicitação.");
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await api.post('/notificacoes/marcar-todas-lidas');
            setNotificacoes(prev => prev.map(n => ({...n, lida: true})));
            setLastUnreadCount(0); // Zera a contagem
            toast.info("Todas as notificações foram marcadas como lidas.");
            refreshData();
        } catch (error) {
            toast.error("Não foi possível marcar todas como lidas.");
        }
    };

    const unreadCount = notificacoes.filter(n => !n.lida).length;

    return (
        <div className="notifications-dropdown-container" ref={dropdownRef}>
            <button className="notifications-button" onClick={() => setIsOpen(prev => !prev)} aria-label="Abrir notificações">
                <FaBell className="fa-bell"/>
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
            </button>
            {isOpen && (
                <div className="notifications-dropdown">
                    <div className="notifications-header">
                        <strong>Notificações</strong>
                        {unreadCount > 0 && <button className="mark-all-read-btn" onClick={handleMarkAllAsRead}>Marcar todas como lidas</button>}
                    </div>
                    <div className="notifications-list">
                        {loading ? <p className="notification-item-empty">Carregando...</p> : 
                         notificacoes.length === 0 ? <p className="notification-item-empty">Nenhuma notificação por aqui.</p> :
                         notificacoes.map(n => {
                             const { icon, className } = getNotificationIcon(n.tipo);
                             return (
                                 <div key={`${n.tipo}-${n.id}`} className={`notification-item ${!n.lida ? 'unread' : ''}`} onClick={() => handleItemClick(n)}>
                                     <div className={`notification-icon-container ${className}`}>
                                         {icon}
                                     </div>
                                     <div className="notification-content">
                                         <p className="notification-message" dangerouslySetInnerHTML={{ __html: n.mensagem }}></p>
                                         <p className="notification-date">
                                             {formatDistanceToNow(parseISO(n.data_criacao), { addSuffix: true, locale: ptBR })}
                                         </p>
                                         
                                         {!n.lida && n.tipo === 'aprovacao_kb' && (
                                             <div className="notification-actions">
                                                 <button onClick={(e) => handleKbDecision(e, n.link_id, 'rejeitado')} className="action-reject"><FaThumbsDown /> Rejeitar</button>
                                                 <button onClick={(e) => handleKbDecision(e, n.link_id, 'aprovado')} className="action-approve"><FaThumbsUp /> Aprovar</button>
                                             </div>
                                         )}

                                         {!n.lida && perfil === 'admin_geral' && n.tipo === 'solicitacao_licenca' && (
                                             <div className="notification-actions license-actions">
                                                 <button onClick={(e) => handleOpenApprovalModal(e, n.link_id)} className="action-process">
                                                     <FaExternalLinkAlt /> Processar
                                                 </button>
                                             </div>
                                         )}
                                     </div>
                                 </div>
                               )
                         })
                        }
                    </div>
                </div>
            )}
        </div>
    );
}