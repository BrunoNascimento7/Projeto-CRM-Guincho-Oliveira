// src/components/SystemHubUpdates.js (VERSÃO FINAL REAL-TIME)

import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { FaPlus, FaEdit, FaTrash, FaRocket, FaWrench, FaBug } from 'react-icons/fa';
import { toast } from 'react-toastify';
import UpdateFormModal from './UpdateFormModal';
import './SystemHubUpdates.css';
import { useSocket } from '../components/SocketContext'; // 1. IMPORTAR O HOOK DO SOCKET.IO

const categoryConfig = {
    'NOVO': { icon: <FaRocket />, text: 'Novidade', color: '#0d6efd' },
    'MELHORIA': { icon: <FaWrench />, text: 'Melhoria', color: '#fd7e14' },
    'CORRECAO': { icon: <FaBug />, text: 'Correção', color: '#dc3545' },
};

const UpdateCard = ({ update, onEdit, onDelete }) => {
    // ... (O componente UpdateCard não muda)
    const config = categoryConfig[update.categoria] || categoryConfig['MELHORIA'];
    return (
        <div className="update-card" style={{ borderLeftColor: config.color }}>
            <div className="update-card-header">
                <div className="update-card-category">
                    <span className="icon">{config.icon}</span>
                    <span>{config.text} {update.versao && `(${update.versao})`}</span>
                </div>
                <div className="update-card-actions">
                    <button onClick={() => onEdit(update)} className="action-btn edit"><FaEdit /></button>
                    <button onClick={() => onDelete(update.id)} className="action-btn delete"><FaTrash /></button>
                </div>
            </div>
            <div className="update-card-body">
                <h4>{update.titulo}</h4>
                {update.imagem_url && <img src={update.imagem_url} alt={update.titulo} className="update-card-image" />}
                <div className="update-card-description" dangerouslySetInnerHTML={{ __html: update.descricao }} />
            </div>
            <div className="update-card-footer">
                <span>Publicado por: {update.publicado_por_nome || 'Admin'}</span>
                <span>{new Date(update.data_publicacao).toLocaleString('pt-BR')}</span>
            </div>
        </div>
    );
};

export default function SystemHubUpdates() {
    const [updates, setUpdates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUpdate, setEditingUpdate] = useState(null);
    const socket = useSocket(); // 2. OBTER A INSTÂNCIA DO SOCKET

    const fetchUpdates = useCallback(async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/api/system-hub/updates');
            setUpdates(data.filter(u => u.tipo === 'manual'));
        } catch (error) {
            toast.error("Falha ao buscar as publicações.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUpdates();
    }, [fetchUpdates]);

    // 3. EFEITO PARA "OUVIR" OS EVENTOS EM TEMPO REAL
    useEffect(() => {
        if (socket) {
            const handleNewUpdate = (newUpdateData) => {
                // Adiciona a nova publicação apenas se for do tipo 'manual'
                if (newUpdateData.tipo === 'manual') {
                    toast.info(`Nova publicação adicionada: "${newUpdateData.titulo}"`);
                    setUpdates(prevUpdates => [newUpdateData, ...prevUpdates]);
                }
            };
            
            socket.on('new_system_update', handleNewUpdate);

            // Função de limpeza: ESSENCIAL para evitar memory leaks
            return () => {
                socket.off('new_system_update', handleNewUpdate);
            };
        }
    }, [socket]); // Este efeito depende do socket estar pronto


    const handleOpenModal = (update = null) => {
        // ... (resto das funções não muda)
        setEditingUpdate(update);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingUpdate(null);
    };

    const handleSave = () => {
        // A função fetchUpdates() aqui não é mais estritamente necessária para o real-time,
        // mas é uma boa prática manter como fallback caso o socket falhe.
        // fetchUpdates(); 
        handleCloseModal();
    };

    const handleDelete = async (id) => {
        if (window.confirm("Tem certeza que deseja deletar esta publicação?")) {
            try {
                await api.delete(`/api/system-hub/updates/${id}`);
                toast.success("Publicação deletada com sucesso!");
                // Após deletar, removemos da lista localmente para efeito real-time
                setUpdates(prevUpdates => prevUpdates.filter(update => update.id !== id));
            } catch (error) {
                toast.error("Falha ao deletar a publicação.");
            }
        }
    };

    // ... (O JSX do return não muda)
    return (
        <div className="shu-container"> 
            <div className="shu-header">
                <h1>Novidades do Sistema</h1>
                <button className="shu-add-new-btn" onClick={() => handleOpenModal()}>
                    <FaPlus /> Nova Publicação
                </button>
            </div>
            <div className="shu-content-area">
                {loading ? (
                    <p>Carregando publicações...</p>
                ) : (
                    <>
                        {updates.length > 0 ? (
                            <div className="shu-updates-list">
                                {updates.map(update => (
                                    <UpdateCard key={update.id} update={update} onEdit={handleOpenModal} onDelete={handleDelete} />
                                ))}
                            </div>
                        ) : (
                            <div className="shu-empty-state">
                                <FaRocket size={50} />
                                <h2>Nenhuma Publicação Encontrada</h2>
                                <p>Seja o primeiro a compartilhar uma novidade. <br/>Clique em "+ Nova Publicação" para começar.</p>
                            </div>
                        )}
                    </>
                )}
            </div>
            {isModalOpen && (
                <UpdateFormModal 
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSave}
                    updateData={editingUpdate}
                />
            )}
        </div>
    );
}