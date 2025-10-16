// src/components/Layout.js

import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ProfileDropdown from './ProfileDropdown';
import NotificationsDropdown from './NotificationsDropdown';
import LicenseApprovalModal from './LicenseApprovalModal';
import SupportModule from './SupportModule';
import AnuncioModal from './AnuncioModal';
import { useDataRefresher } from '../hooks/useDataRefresher';
import api from '../services/api';
import { FaTimes, FaBullhorn } from 'react-icons/fa';
import './Layout.css';

// Nossas novas adições:
import { useSocket } from './SocketContext'; // Hook para a conexão central
import UpdatesPanel from './UpdatesPanel';   // Nosso novo painel

const GlobalAnnouncementBanner = ({ announcement, onDismiss }) => {
    if (!announcement) return null;
    return (
        <div className="global-announcement-banner">
            <FaBullhorn className="banner-icon" />
            <div className="banner-content">
                <strong>{announcement.titulo}:</strong> {announcement.mensagem}
            </div>
            <button onClick={() => onDismiss(announcement.id)} className="banner-dismiss-button">
                <FaTimes />
            </button>
        </div>
    );
};

export default function Layout({ user, onLogout, onOpenConfig, onThemeUpdate, onNotificationClick }) {
    const [currentUser, setCurrentUser] = useState(user);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
    const { refreshKey, refreshData } = useDataRefresher();
    const [requestToProcess, setRequestToProcess] = useState(null);
    const [activeAnuncio, setActiveAnuncio] = useState(null);
    const [isAnuncioModalVisible, setIsAnuncioModalVisible] = useState(false);
    const [globalAnnouncement, setGlobalAnnouncement] = useState(null);

    // Usa o hook para pegar a conexão central de Socket.IO
    const socket = useSocket();

    // EFEITO CORRIGIDO: Agora usa o socket do contexto
    useEffect(() => {
        if (socket) {
            socket.emit("newUser", user.id, user.nome, user.foto_perfil);

            const handleNewNotification = (data) => {
                console.log('Nova notificação recebida via WebSocket!', data.message);
                refreshData();
            };

            socket.on('new_notification', handleNewNotification);

            // Função de limpeza para remover o listener quando o componente desmontar
            return () => {
                socket.off('new_notification', handleNewNotification);
            };
        }
    }, [socket, user.id, user.nome, user.foto_perfil, refreshData]);

    useEffect(() => {
        let isMounted = true;
        const fetchAnuncioLocal = async () => {
            try {
                const { data } = await api.get('/api/conteudo/anuncios-ativos');
                if (isMounted && data && data.length > 0) {
                    setActiveAnuncio(data[0]);
                    setIsAnuncioModalVisible(true);
                    try {
                        new Audio('/notification.mp3').play().catch(e => console.error("Erro ao tocar som:", e));
                    } catch (e) {
                        console.error("Não foi possível carregar o som de notificação.");
                    }
                }
            } catch (error) {
                console.error("Não foi possível buscar o anúncio local.", error);
            }
        };

        const fetchAnuncioGlobal = async () => {
            try {
                const { data } = await api.get('/api/announcements/global/active');
                if (isMounted && data) {
                    setGlobalAnnouncement(data);
                }
            } catch (error) {
                console.error("Não foi possível buscar o anúncio global.", error);
            }
        };

        fetchAnuncioLocal();
        fetchAnuncioGlobal();

        return () => { isMounted = false; };
    }, [user, refreshKey]);

    const handlePhotoUpdate = (newPhotoUrl) => {
        setCurrentUser(prevUser => ({ ...prevUser, foto_perfil: newPhotoUrl }));
    };
    const handleProcessRequest = (request) => {
        setRequestToProcess(request);
    };
    const handleModalClose = () => {
        setRequestToProcess(null);
        refreshData();
    };
    const handleCloseAnuncioModal = () => {
        setIsAnuncioModalVisible(false);
        setActiveAnuncio(null);
    };
    const handleShowAnuncio = (anuncio) => {
        setActiveAnuncio(anuncio);
        setIsAnuncioModalVisible(true);
    };
    
    const handleDismissGlobalAnnouncement = async (announcementId) => {
        setGlobalAnnouncement(null);
        try {
            await api.post(`/api/announcements/global/${announcementId}/dismiss`);
        } catch (error) {
            console.error("Erro ao marcar anúncio global como visto:", error);
        }
    };
    
    const handleShowGlobalAnuncio = (anuncio) => {
        setGlobalAnnouncement(anuncio);
    };

    return (
        <div className="layout-container">
            <Sidebar
                user={currentUser}
                onOpenConfig={onOpenConfig}
                isCollapsed={isSidebarCollapsed}
                setIsSidebarCollapsed={setIsSidebarCollapsed}
            />
            
            <main className={`main-content ${isSidebarCollapsed ? 'collapsed' : 'expanded'}`}>
                <GlobalAnnouncementBanner 
                    announcement={globalAnnouncement} 
                    onDismiss={handleDismissGlobalAnnouncement} 
                />

                <header className="main-header-container">
                    <div className="header-actions">
                        <NotificationsDropdown 
                            onNotificationClick={onNotificationClick}
                            onProcessLicenseRequest={handleProcessRequest}
                            onShowAnuncio={handleShowAnuncio}
                            onShowGlobalAnuncio={handleShowGlobalAnuncio}
                        />
                        <ProfileDropdown user={currentUser} onLogout={onLogout} onThemeUpdate={onThemeUpdate} onPhotoUpdate={handlePhotoUpdate} />
                    </div>
                </header>
                
                <div className="page-content-wrapper">
                    <Outlet context={{ user: currentUser }} />
                </div>
            </main>

            {currentUser && <SupportModule user={currentUser} />}

            <UpdatesPanel />
            
            {requestToProcess && (
                <LicenseApprovalModal
                    request={requestToProcess}
                    onClose={handleModalClose}
                    onSuccess={handleModalClose}
                />
            )}

            {activeAnuncio && (
                <AnuncioModal 
                    anuncio={activeAnuncio}
                    isVisible={isAnuncioModalVisible}
                    onClose={handleCloseAnuncioModal}
                />
            )}
        </div>
    );
}