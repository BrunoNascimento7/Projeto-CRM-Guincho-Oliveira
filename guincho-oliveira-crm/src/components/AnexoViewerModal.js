// src/components/AnexoViewerModal.js

import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './AnexoViewerModal.css';
import { FaSpinner, FaTimes, FaDownload } from 'react-icons/fa';

const AnexoViewerModal = ({ anexoUrl, onClose }) => {
    const [contentUrl, setContentUrl] = useState(null);
    const [fileType, setFileType] = useState(null);
    const [fileName, setFileName] = useState('anexo');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAnexo = async () => {
            if (!anexoUrl) return;

            try {
                // 1. Faz a requisição para a URL do anexo, esperando uma resposta do tipo 'blob'
                const response = await api.get(anexoUrl, { responseType: 'blob' });

                // 2. Cria uma URL temporária para o arquivo que foi baixado na memória do navegador
                const blobUrl = URL.createObjectURL(response.data);
                setContentUrl(blobUrl);

                // 3. Tenta descobrir o nome do arquivo a partir dos headers da resposta
                const disposition = response.headers['content-disposition'];
                if (disposition && disposition.indexOf('attachment') !== -1) {
                    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                    const matches = filenameRegex.exec(disposition);
                    if (matches != null && matches[1]) {
                        setFileName(matches[1].replace(/['"]/g, ''));
                    }
                }

                // 4. Determina o tipo do arquivo para saber como exibi-lo
                const contentType = response.headers['content-type'];
                if (contentType.startsWith('image/')) {
                    setFileType('image');
                } else if (contentType === 'application/pdf') {
                    setFileType('pdf');
                } else {
                    setFileType('download');
                }

            } catch (err) {
                setError('Não foi possível carregar o anexo.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchAnexo();

        // 5. Função de limpeza: revoga a URL temporária para liberar memória
        return () => {
            if (contentUrl) {
                URL.revokeObjectURL(contentUrl);
            }
        };
    }, [anexoUrl]); // O array de dependência vazio faz o useEffect rodar só uma vez

    const renderContent = () => {
        if (loading) return <div className="viewer-loading"><FaSpinner className="spinner" /> Carregando anexo...</div>;
        if (error) return <div className="viewer-error">{error}</div>;

        switch (fileType) {
            case 'image':
                return <img src={contentUrl} alt={fileName} className="viewer-image" />;
            case 'pdf':
                return <iframe src={contentUrl} title={fileName} className="viewer-pdf" />;
            case 'download':
            default:
                return (
                    <div className="viewer-download">
                        <p>Não é possível pré-visualizar este tipo de arquivo.</p>
                        <a href={contentUrl} download={fileName} className="download-button">
                            <FaDownload /> Baixar {fileName}
                        </a>
                    </div>
                );
        }
    };

    return (
        <div className="modal-overlay-viewer" onClick={onClose}>
            <div className="modal-content-viewer" onClick={e => e.stopPropagation()}>
                <button className="close-button-viewer" onClick={onClose}><FaTimes /></button>
                {renderContent()}
            </div>
        </div>
    );
};

export default AnexoViewerModal;