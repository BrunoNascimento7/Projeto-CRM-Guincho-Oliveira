import React, { useState } from 'react';
import { FaSave, FaTimes, FaTags } from 'react-icons/fa';

export default function TemplateModal({ onClose, onSave, template, tagsDisponiveis }) {
    const [nome, setNome] = useState(template?.nome || '');
    const [texto, setTexto] = useState(template?.texto || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!nome.trim() || !texto.trim()) {
            alert("Nome e texto são obrigatórios.");
            return;
        }
        onSave({ nome, texto });
    };

    const handleInsertTag = (tagName) => {
        // Lógica para inserir a tag na posição atual do cursor, se possível
        // Por simplicidade, vamos adicionar ao final
        setTexto(prev => `${prev}{{${tagName}}}`);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{template ? 'Editar Template' : 'Criar Novo Template'}</h2>
                    <button onClick={onClose} className="close-button"><FaTimes /></button>
                </div>
                <form onSubmit={handleSubmit} className="template-form">
                    <div className="form-group">
                        <label htmlFor="template-nome">Nome do Template</label>
                        <input
                            id="template-nome"
                            type="text"
                            placeholder="Ex: Lembrete de Aniversário"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="template-texto">Texto da Mensagem</label>
                        <textarea
                            id="template-texto"
                            rows="8"
                            placeholder="Escreva sua mensagem aqui..."
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                        ></textarea>
                    </div>

                    <div className="available-tags">
                        <h4><FaTags /> Tags Disponíveis (clique para inserir)</h4>
                        <div className="tags-container">
                            <span className="tag" onClick={() => handleInsertTag('nome_cliente')}>nome_cliente</span>
                            {tagsDisponiveis.map(tag => (
                                <span key={tag.tag_nome} className="tag" onClick={() => handleInsertTag(tag.tag_nome)}>
                                    {tag.tag_nome}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-cancel">Cancelar</button>
                        <button type="submit" className="btn-save"><FaSave /> Salvar Template</button>
                    </div>
                </form>
            </div>
        </div>
    );
}