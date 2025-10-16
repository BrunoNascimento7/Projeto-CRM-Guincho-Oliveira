import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './AnexoPreviewModal.css';
import { FaDownload, FaFileAlt, FaSpinner } from 'react-icons/fa';

export default function AnexoPreviewModal({ anexo, onClose, onDownload }) {
    const [previewUrl, setPreviewUrl] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(true);
    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        if (!anexo) return;

        const isImage = anexo.mimetype && anexo.mimetype.startsWith('image/');
        const isPdf = anexo.mimetype === 'application/pdf';

        if (isImage || isPdf) {
            setIsSupported(true);
            setLoadingPreview(true);

            let objectUrl = null;

            const fetchPreview = async () => {
                try {
                    // Busca o arquivo como um "blob" usando nossa API autenticada
                    const response = await api.get(`/api/anexos/${anexo.id}/view`, {
                        responseType: 'blob',
                    });
                    
                    // Cria uma URL temporária na memória do navegador para o arquivo
                    objectUrl = URL.createObjectURL(response.data);
                    setPreviewUrl(objectUrl);
                } catch (error) {
                    console.error("Falha ao carregar o preview do anexo:", error);
                } finally {
                    setLoadingPreview(false);
                }
            };

            fetchPreview();

            // Função de limpeza: revoga a URL da memória quando o componente é desmontado
            return () => {
                if (objectUrl) {
                    URL.revokeObjectURL(objectUrl);
                }
            };
        } else {
            setIsSupported(false);
            setLoadingPreview(false);
        }
    }, [anexo]);

    if (!anexo) return null;

    const renderPreview = () => {
        if (loadingPreview) {
            return (
                <div className="preview-fallback">
                    <FaSpinner className="fa-spin" />
                    <p>Carregando visualização...</p>
                </div>
            );
        }

        if (!isSupported) {
             return (
                <div className="preview-fallback">
                    <FaFileAlt />
                    <p>Visualização não disponível para este tipo de arquivo.</p>
                    <span>({anexo.nome_original})</span>
                </div>
            );
        }
        
        const isImage = anexo.mimetype.startsWith('image/');
        if (isImage) {
            return <img src={previewUrl} alt={anexo.nome_original} className="preview-content" />;
        }
        
        const isPdf = anexo.mimetype === 'application/pdf';
        if (isPdf) {
            return <iframe src={previewUrl} title={anexo.nome_original} className="preview-content"></iframe>;
        }

        // Fallback final, caso algo dê errado
        return <p>Não foi possível carregar a visualização.</p>;
    };

    return (
        <div className="modal-overlay preview-overlay" onClick={onClose}>
            <div className="modal-content preview-modal" onClick={e => e.stopPropagation()}>
                <div className="preview-header">
                    <h3>Visualizando: {anexo.nome_original}</h3>
                    <button onClick={onClose} className="modal-close-button">&times;</button>
                </div>
                <div className="preview-body">
                    {renderPreview()}
                </div>
                <div className="preview-footer">
                    <button className="btn-download" onClick={() => onDownload(anexo.id, anexo.nome_original)}>
                        <FaDownload /> Baixar Arquivo
                    </button>
                </div>
            </div>
        </div>
    );
}