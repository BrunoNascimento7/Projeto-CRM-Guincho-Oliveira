// src/components/AnuncioModal.js (Versão Corrigida e Completa)

import React from 'react';
import { FaBullhorn } from 'react-icons/fa';
import api from '../services/api';
import { toast } from 'react-toastify';
import './AnuncioModal.css';

export default function AnuncioModal({ anuncio, onClose, isVisible }) {
    
    const handleMarkAsRead = async () => {
        try {
            const token = localStorage.getItem('token');
            // --- CORRIGIDO! ---
            // A API espera o ID na URL.
            await api.post(`/api/conteudo/anuncios/lido/${anuncio.id}`, {}, { 
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.info("Aviso marcado como lido.");
            onClose(); // Fecha o modal após marcar como lido
        } catch (error) {
            console.error("Erro ao marcar anúncio como lido", error);
            onClose(); // Fecha o modal mesmo se der erro
        }
    };

    return (
        // A classe 'visible' controla a exibição do modal via CSS
        <div className={`anuncio-modal-overlay ${isVisible ? 'visible' : ''}`} onClick={onClose}>
            <div className="anuncio-modal-content" onClick={e => e.stopPropagation()}>
                <div className="anuncio-header">
                    <FaBullhorn className="anuncio-icon" />
                    <h2>{anuncio.titulo}</h2>
                </div>
                
                {/* Verifica se a URL da imagem existe antes de renderizar a tag img */}
                {anuncio.imagem_url && (
                    <img 
                        src={anuncio.imagem_url} 
                        alt={anuncio.titulo || "Banner do anúncio"}
                        className="anuncio-imagem" 
                    />
                )}
                
                <p className="anuncio-mensagem">{anuncio.mensagem}</p>
                
                <div className="anuncio-actions">
                    <button className="anuncio-button close" onClick={onClose}>Fechar</button>
                    {/* Só mostra o botão de marcar como lido se o anúncio ainda não foi lido */}
                    {!anuncio.lida && (
                       <button className="anuncio-button read" onClick={handleMarkAsRead}>Entendi, marcar como lido</button>
                    )}
                </div>
            </div>
        </div>
    );
}