import React, { useState, useEffect } from 'react';
import api from '../services/api';
import TemplateModal from './TemplateModal'; // O modal para criar/editar
import './GestaoTemplates.css';
import { FaPlus, FaEdit, FaTrash, FaClipboardList } from 'react-icons/fa';

export default function GestaoTemplates() {
    const [templates, setTemplates] = useState([]);
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [templateAtual, setTemplateAtual] = useState(null); // Para edição

    const fetchTemplatesAndTags = async () => {
        try {
            setLoading(true);
            const [templatesRes, tagsRes] = await Promise.all([
                api.get('/api/templates'),
                api.get('/api/tags')
            ]);
            setTemplates(templatesRes.data);
            setTags(tagsRes.data);
        } catch (error) {
            console.error("Erro ao buscar dados:", error);
            alert("Não foi possível carregar os dados. Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplatesAndTags();
    }, []);

    const handleOpenModal = (template = null) => {
        setTemplateAtual(template);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setTemplateAtual(null);
    };

    const handleSaveTemplate = async (templateData) => {
        try {
            if (templateAtual) {
                // Atualizando
                await api.put(`/api/templates/${templateAtual.id}`, templateData);
                alert("Template atualizado com sucesso!");
            } else {
                // Criando
                await api.post('/api/templates', templateData);
                alert("Template criado com sucesso!");
            }
            fetchTemplatesAndTags(); // Recarrega a lista
            handleCloseModal();
        } catch (error) {
            console.error("Erro ao salvar template:", error);
            alert("Falha ao salvar o template.");
        }
    };

    const handleDeleteTemplate = async (id) => {
        if (window.confirm("Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.")) {
            try {
                await api.delete(`/api/templates/${id}`);
                alert("Template excluído com sucesso!");
                fetchTemplatesAndTags(); // Recarrega a lista
            } catch (error) {
                console.error("Erro ao excluir template:", error);
                alert("Falha ao excluir o template.");
            }
        }
    };

    return (
        <div className="gestao-templates-container">
            <div className="gestao-templates-header">
                <h1><FaClipboardList /> Gestão de Templates de Mensagem</h1>
                <button onClick={() => handleOpenModal()} className="new-template-btn">
                    <FaPlus /> Criar Novo Template
                </button>
            </div>

            {loading ? <p>Carregando...</p> : (
                <div className="templates-grid">
                    {templates.length > 0 ? templates.map(template => (
                        <div key={template.id} className="template-card">
                            <h3>{template.nome}</h3>
                            <p className="template-text-preview">{template.texto}</p>
                            <div className="template-card-actions">
                                <button onClick={() => handleOpenModal(template)} className="action-btn edit">
                                    <FaEdit /> Editar
                                </button>
                                <button onClick={() => handleDeleteTemplate(template.id)} className="action-btn delete">
                                    <FaTrash /> Excluir
                                </button>
                            </div>
                        </div>
                    )) : (
                        <p className="no-templates-message">Nenhum template cadastrado. Clique em "Criar Novo Template" para começar.</p>
                    )}
                </div>
            )}
            
            {isModalOpen && (
                <TemplateModal
                    onClose={handleCloseModal}
                    onSave={handleSaveTemplate}
                    template={templateAtual}
                    tagsDisponiveis={tags}
                />
            )}
        </div>
    );
}