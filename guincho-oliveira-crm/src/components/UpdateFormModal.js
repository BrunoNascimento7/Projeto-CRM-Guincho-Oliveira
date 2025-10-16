// src/components/UpdateFormModal.js (VERSÃO MELHORADA)

import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaRocket, FaWrench, FaBug, FaTimes, FaBold, FaItalic, FaListUl, FaCloudUploadAlt } from 'react-icons/fa';
import './UpdateFormModal.css'; // <<<--- IMPORTAR O NOVO CSS

const categories = [
    { id: 'NOVO', text: 'Novidade', icon: <FaRocket /> },
    { id: 'MELHORIA', text: 'Melhoria', icon: <FaWrench /> },
    { id: 'CORRECAO', text: 'Correção', icon: <FaBug /> },
];

const MenuBar = ({ editor }) => {
    if (!editor) return null;
    return (
        <div className="shu-modal__editor-menu">
            <button type="button" title="Negrito" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''}><FaBold /></button>
            <button type="button" title="Itálico" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''}><FaItalic /></button>
            <button type="button" title="Lista" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'is-active' : ''}><FaListUl /></button>
        </div>
    );
};

export default function UpdateFormModal({ isOpen, onClose, onSave, updateData }) {
    const [formData, setFormData] = useState({ categoria: 'MELHORIA', titulo: '', versao: '' });
    const [descricao, setDescricao] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const editor = useEditor({
        extensions: [StarterKit],
        content: descricao,
        onUpdate: ({ editor }) => { setDescricao(editor.getHTML()); },
    });

    useEffect(() => {
        setImageFile(null);
        if (updateData) {
            setFormData({ categoria: updateData.categoria || 'MELHORIA', titulo: updateData.titulo || '', versao: updateData.versao || '' });
            const initialDescription = updateData.descricao || '';
            setDescricao(initialDescription);
            if (editor) editor.commands.setContent(initialDescription);
            setImagePreview(updateData.imagem_url || null);
        } else {
            setFormData({ categoria: 'MELHORIA', titulo: '', versao: '' });
            const initialDescription = '';
            setDescricao(initialDescription);
            if (editor) editor.commands.setContent(initialDescription);
            setImagePreview(null);
        }
    }, [updateData, isOpen, editor]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => { setImagePreview(reader.result); };
            reader.readAsDataURL(file);
        }
    };

    const removeImage = () => {
        setImageFile(null);
        setImagePreview(null);
        // Se estivermos editando, precisamos garantir que o input de arquivo seja limpo
        const fileInput = document.getElementById('imagem-upload');
        if (fileInput) {
            fileInput.value = '';
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        const submissionData = new FormData();
        Object.keys(formData).forEach(key => { submissionData.append(key, formData[key]); });
        submissionData.append('descricao', descricao);
        
        if (imageFile) {
            submissionData.append('imagem', imageFile);
        } else if (updateData && imagePreview) {
            submissionData.append('imagem_url', imagePreview);
        } else {
             submissionData.append('imagem_url', ''); // Garante que a imagem seja removida se o usuário clicou no X
        }


        try {
            if (updateData) {
                await api.put(`/api/system-hub/updates/${updateData.id}`, submissionData, { headers: { 'Content-Type': 'multipart/form-data' } });
                toast.success("Publicação atualizada com sucesso!");
            } else {
                await api.post('/api/system-hub/updates', submissionData, { headers: { 'Content-Type': 'multipart/form-data' } });
                toast.success("Publicação criada com sucesso!");
            }
            onSave();
        } catch (error) {
            toast.error("Ocorreu um erro ao salvar.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="shu-modal__overlay">
            <div className="shu-modal__content">
                <form onSubmit={handleSubmit}>
                    <div className="shu-modal__header">
                        <h2>{updateData ? 'Editar Publicação' : 'Nova Publicação'}</h2>
                        <button type="button" onClick={onClose} className="shu-modal__close-button"><FaTimes /></button>
                    </div>

                    <div className="shu-modal__body">
                        {/* 1. SELEÇÃO DE CATEGORIA EM PILLS */}
                        <div className="shu-modal__form-group">
                            <label>Categoria</label>
                            <div className="shu-modal__category-selector">
                                {categories.map(cat => (
                                    <label key={cat.id} className={`shu-modal__category-option ${formData.categoria === cat.id ? 'selected' : ''}`}>
                                        <input type="radio" name="categoria" value={cat.id} checked={formData.categoria === cat.id} onChange={handleChange} />
                                        {cat.icon} {cat.text}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* 2. CAMPOS DE TEXTO */}
                        <div className="shu-modal__form-group">
                            <label htmlFor="titulo">Título</label>
                            <input type="text" id="titulo" name="titulo" value={formData.titulo} onChange={handleChange} required />
                        </div>
                        <div className="shu-modal__form-group">
                            <label htmlFor="versao">Versão (Opcional)</label>
                            <input type="text" id="versao" name="versao" value={formData.versao} onChange={handleChange} placeholder="Ex: v1.5.0" />
                        </div>
                        
                        {/* 3. EDITOR DE TEXTO INTEGRADO */}
                        <div className="shu-modal__form-group">
                            <label>Descrição</label>
                            <div className="shu-modal__editor-container">
                                <MenuBar editor={editor} />
                                <EditorContent editor={editor} />
                            </div>
                        </div>

                        {/* 4. NOVA ÁREA DE UPLOAD DE IMAGEM */}
                        <div className="shu-modal__form-group">
                             <label>Imagem ou GIF (Opcional)</label>
                             {imagePreview ? (
                                <div className="shu-modal__image-preview-container">
                                    <img src={imagePreview} alt="Preview" className="shu-modal__image-preview" />
                                    <button type="button" className="shu-modal__remove-image-btn" onClick={removeImage} title="Remover Imagem"><FaTimes/></button>
                                </div>
                             ) : (
                                <label htmlFor="imagem-upload" className="shu-modal__dropzone">
                                    <FaCloudUploadAlt />
                                    <span>Arraste e solte o arquivo aqui, ou clique para selecionar</span>
                                    <input id="imagem-upload" type="file" accept="image/*" onChange={handleFileChange} />
                                </label>
                             )}
                        </div>
                    </div>

                    {/* 5. BOTÕES COM HIERARQUIA VISUAL */}
                    <div className="shu-modal__footer">
                        <button type="button" className="shu-modal__btn-secondary" onClick={onClose} disabled={isSaving}>Cancelar</button>
                        <button type="submit" className="shu-modal__btn-primary" disabled={isSaving}>
                            {isSaving ? 'Salvando...' : 'Salvar Publicação'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}