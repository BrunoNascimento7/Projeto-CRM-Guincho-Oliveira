// src/components/UpdatesPanel.js (CORRIGIDO)
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useSocket } from './SocketContext';
import { FaGift, FaTimes, FaTools, FaRocket, FaWrench, FaBug } from 'react-icons/fa'; // <-- 1. ÍCONES ADICIONADOS
import './UpdatesPanel.css';

export default function UpdatesPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [updates, setUpdates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasNewUpdate, setHasNewUpdate] = useState(false);
    const socket = useSocket();

    const fetchUpdates = useCallback(async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/api/system-hub/updates');
            setUpdates(data);
            const lastSeenUpdateId = localStorage.getItem('lastSeenUpdateId');
            if (data.length > 0 && data[0].id > parseInt(lastSeenUpdateId, 10)) {
                setHasNewUpdate(true);
            } else if (!lastSeenUpdateId && data.length > 0) {
                setHasNewUpdate(true);
            }
        } catch (error) {
            console.error("Erro ao carregar atualizações do sistema:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUpdates();
    }, [fetchUpdates]);

    useEffect(() => {
        if (socket) {
            socket.on('connect', () => {
                console.log(">>> [Socket.IO] UpdatesPanel CONECTADO com sucesso ao servidor! ID do Socket:", socket.id);
            });
            const handleNewUpdate = (updateData) => {
                setUpdates(prevUpdates => [updateData, ...prevUpdates]);
                setHasNewUpdate(true);
            };
            socket.on('new_system_update', handleNewUpdate);
            return () => socket.off('new_system_update', handleNewUpdate);
        }
    }, [socket]);

    const handleTogglePanel = () => {
        setIsOpen(!isOpen);
        if (!isOpen && hasNewUpdate) {
            setHasNewUpdate(false);
            if (updates.length > 0) {
                localStorage.setItem('lastSeenUpdateId', updates[0].id);
            }
        }
    };
    
    // 2. FUNÇÃO ATUALIZADA PARA USAR 'categoria'
    const getUpdateIcon = (update) => {
        switch (update.categoria) {
            case 'NOVO':
                return <FaRocket className="update-icon novo" />;
            case 'MELHORIA':
                return <FaWrench className="update-icon melhoria" />;
            case 'CORRECAO':
                return <FaBug className="update-icon correcao" />;
            default:
                if (update.tipo === 'gmud') {
                    return <FaTools className="update-icon gmud" />;
                }
                return <FaRocket className="update-icon manual" />;
        }
    };

    return (
        <>
            <div
                className={`updates-tab ${hasNewUpdate ? 'new' : ''}`}
                onClick={handleTogglePanel}
            >
                <FaGift />
                <span>Novidades</span>
            </div>

            <div className={`updates-panel ${isOpen ? 'open' : ''}`}>
                <div className="panel-header">
                    <h3>Novidades e Atualizações</h3>
                    <button onClick={handleTogglePanel} className="close-btn"><FaTimes /></button>
                </div>
                <div className="panel-content">
                    {loading ? (
                        <p>Carregando...</p>
                    ) : updates.length > 0 ? (
                        <ul>
                            {updates.map(update => (
                                <li key={update.id}>
                                    <div className="update-title">
                                        {getUpdateIcon(update)} {/* <-- 3. CHAMADA CORRIGIDA */}
                                        <div>
                                            <strong>{update.titulo} {update.versao && `(${update.versao})`}</strong>
                                            <small>{new Date(update.data_publicacao).toLocaleDateString('pt-BR')}</small>
                                        </div>
                                    </div>
                                    <p dangerouslySetInnerHTML={{ __html: update.descricao }}></p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>Nenhuma atualização recente.</p>
                    )}
                </div>
            </div>
        </>
    );
}