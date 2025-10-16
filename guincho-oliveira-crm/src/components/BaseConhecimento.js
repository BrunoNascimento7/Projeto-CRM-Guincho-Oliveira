// src/pages/BaseConhecimento.js

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';

// --- Editor de Texto Rico (TipTap) ---
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';

// --- Nossos Componentes, Estilos e Ícones ---
import './BaseConhecimento.css';
import AnexoPreviewModal from './AnexoPreviewModal';
import { useDataRefresher } from '../hooks/useDataRefresher';
import {
    FaPlus, FaSearch, FaBook, FaEdit, FaTrash, FaPaperclip, FaTags, FaEye, FaCheckCircle,
    FaHourglassHalf, FaTimesCircle, FaSave, FaPaperPlane, FaUndo, FaDownload, FaCopy, FaLock,
    FaThumbsUp, FaThumbsDown
} from 'react-icons/fa';

// --- Sub-componente: Barra de Ferramentas do Editor ---
const EditorToolbar = ({ editor }) => {
    if (!editor) return null;
    return (
        <div className="editor-toolbar">
            <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''}><strong>B</strong></button>
            <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''}><em>I</em></button>
            <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? 'is-active' : ''}><s>S</s></button>
            <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'is-active' : ''}>Lista</button>
            <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? 'is-active' : ''}>Lista Num.</button>
            <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={editor.isActive('blockquote') ? 'is-active' : ''}>Citação</button>
        </div>
    );
};

// --- Sub-componente: Modal de Submissão para Aprovação ---
const SubmitModal = ({ onClose, onSubmeter }) => {
    const [aprovadores, setAprovadores] = useState([]);
    const [selectedAprovador, setSelectedAprovador] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/api/usuarios/aprovadores').then(response => {
            setAprovadores(response.data);
            if (response.data.length > 0) {
                setSelectedAprovador(response.data[0].id);
            }
        }).catch(err => {
            toast.error("Não foi possível carregar a lista de aprovadores.");
        }).finally(() => setLoading(false));
    }, []);

    const handleSubmit = () => {
        if (!selectedAprovador) {
            toast.warn("Por favor, selecione um aprovador.");
            return;
        }
        onSubmeter(selectedAprovador);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3>Submeter para Aprovação</h3>
                <p>Selecione o responsável que irá revisar e aprovar este artigo.</p>
                <div className="form-group">
                    <label>Aprovador:</label>
                    {loading ? <p>Carregando...</p> : (
                        <select value={selectedAprovador} onChange={e => setSelectedAprovador(e.target.value)}>
                            {aprovadores.map(aprovador => (
                                <option key={aprovador.id} value={aprovador.id}>{aprovador.nome}</option>
                            ))}
                        </select>
                    )}
                </div>
                <button onClick={handleSubmit} className="btn-salvar" disabled={loading}>
                    <FaPaperPlane /> Enviar para Aprovação
                </button>
            </div>
        </div>
    );
};


// --- Componente Principal ---
export default function BaseConhecimento() {
    const { user } = useOutletContext();
    const { refreshData } = useDataRefresher();
    const [artigos, setArtigos] = useState([]);
    const [artigoAtivo, setArtigoAtivo] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [termoBusca, setTermoBusca] = useState('');
    const [anexoParaVisualizar, setAnexoParaVisualizar] = useState(null);
    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
    const fileInputRef = useRef(null);

    // --- ESTADOS PARA ABAS E AÇÕES EM MASSA ---
    const [abaAtiva, setAbaAtiva] = useState('Aprovado');
    const [artigosSelecionados, setArtigosSelecionados] = useState([]);

    const PERFIS_DISPONIVEIS = ['operacional', 'financeiro', 'admin'];
    const STATUS_DISPONIVEIS = ['Rascunho', 'Pendente', 'Aprovado', 'Rejeitado'];
    const ABAS_DISPONIVEIS = ['Aprovado', 'Pendente', 'Rascunho', 'Rejeitado'];

    const editor = useEditor({
        extensions: [StarterKit, LinkExtension.configure({ openOnClick: false })],
        content: '',
        onUpdate: ({ editor }) => {
            setEditData(prev => ({ ...prev, conteudo: editor.getHTML() }));
        },
    });

    // Permissão para gerenciar (ver abas, fazer ações em massa)
    const canManage = useMemo(() => {
        if (!user || !user.perfil) return false;
        const perfilDoUsuario = user.perfil.toLowerCase();
        return ['admin_geral', 'admin'].includes(perfilDoUsuario);
    }, [user]);

    // Permissão para editar um artigo específico
    const canEdit = (artigo) => {
        if (!user || !user.perfil || !artigo) return false;
        const perfil = user.perfil.toLowerCase();
        if (['admin_geral', 'admin', 'conhecimento_manager'].includes(perfil)) {
            // Admins podem editar, exceto se estiver pendente de aprovação por outra pessoa
            if (artigo.status === 'Pendente' && artigo.aprovador_id !== user.id) {
                return false;
            }
            return true;
        }
        // O criador do artigo pode editar se for um rascunho ou se foi rejeitado
        return artigo.criado_por_id === user.id && ['Rascunho', 'Rejeitado'].includes(artigo.status);
    };

    const fetchArtigos = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/api/conhecimento');
            setArtigos(data);
        } catch (error) { 
            toast.error("Falha ao carregar artigos.");
            console.error("Erro ao carregar artigos:", error); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => {
        fetchArtigos();
    }, []);
    
    useEffect(() => {
        if (isEditing && editData && editor) {
            editor.commands.setContent(editData.conteudo || '');
        }
    }, [isEditing, editData, editor]);

    // Filtra os artigos baseado na aba ativa (para admins) e na busca
    const artigosFiltrados = useMemo(() => {
        const artigosDaAba = canManage 
            ? artigos.filter(a => a.status === abaAtiva)
            : artigos; // Usuário comum vê a lista completa (já filtrada pelo backend)

        const busca = termoBusca.toLowerCase();
        if (!busca) return artigosDaAba;

        return artigosDaAba.filter(a => 
            a.titulo.toLowerCase().includes(busca) || 
            a.categoria.toLowerCase().includes(busca) ||
            a.kb_id.toLowerCase().includes(busca)
        );
    }, [artigos, termoBusca, abaAtiva, canManage]);

    const artigosAgrupados = useMemo(() => {
        return artigosFiltrados.reduce((acc, artigo) => {
            (acc[artigo.categoria] = acc[artigo.categoria] || []).push(artigo);
            return acc;
        }, {});
    }, [artigosFiltrados]);

    const handleSelectArtigo = async (id) => {
        setIsEditing(false);
        setArtigoAtivo(null); // Limpa o artigo anterior para dar feedback de carregamento
        try {
            const { data } = await api.get(`/api/conhecimento/${id}`);
            setArtigoAtivo(data);
        } catch (error) { 
            toast.error("Não foi possível carregar o artigo selecionado.");
            console.error("Erro ao selecionar artigo:", error); 
        }
    };

    const handleNewArtigo = async () => {
        const titulo = prompt("Digite um título inicial para o novo artigo:");
        if (titulo && titulo.trim()) {
            try {
                const { data: novoArtigo } = await api.post('/api/conhecimento', { titulo: titulo.trim(), categoria: 'Geral' });
                await fetchArtigos(); 
                setArtigoAtivo(novoArtigo); 
                setEditData({
                    ...novoArtigo,
                    tags: novoArtigo.tags || [],
                    visibilidade: novoArtigo.visibilidade || [],
                });
                setIsEditing(true);
            } catch (error) { 
                toast.error('Falha ao criar rascunho do artigo.'); 
                console.error(error);
            }
        }
    };
    
    const handleEdit = () => {
        if (!artigoAtivo) return;
        setEditData({
            ...artigoAtivo,
            tags: Array.isArray(artigoAtivo.tags) ? artigoAtivo.tags : [],
            visibilidade: Array.isArray(artigoAtivo.visibilidade) ? artigoAtivo.visibilidade : [],
        });
        setIsEditing(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = {
                ...editData,
                tags: JSON.stringify(editData.tags || []),
                visibilidade: JSON.stringify(editData.visibilidade || []),
            };
            await api.put(`/api/conhecimento/${artigoAtivo.id}`, payload);
            toast.success("Artigo salvo com sucesso!");
            await fetchArtigos();
            await handleSelectArtigo(artigoAtivo.id);
        } catch (error) { 
            toast.error('Falha ao salvar o artigo.'); 
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmitForApproval = async (aprovador_id) => {
        try {
            await api.put(`/api/conhecimento/${artigoAtivo.id}/submeter`, { aprovador_id });
            toast.success("Artigo enviado para aprovação!");
            setIsSubmitModalOpen(false);
            await handleSelectArtigo(artigoAtivo.id);
            await fetchArtigos();
            refreshData(); // Atualiza notificações
        } catch (error) {
            toast.error("Falha ao submeter artigo.");
        }
    };

    const handleDecision = async (decisao) => {
        let motivo = '';
        if (decisao === 'rejeitado') {
            motivo = prompt("Por favor, informe o motivo da rejeição:");
            if (motivo === null || motivo.trim() === '') {
                toast.warn("A rejeição foi cancelada pois o motivo é obrigatório.");
                return;
            }
        }
        try {
            await api.put(`/api/notificacoes/kb/${artigoAtivo.id}/decisao`, { decisao, motivo });
            toast.success(`Artigo ${decisao} com sucesso!`);
            await handleSelectArtigo(artigoAtivo.id);
            await fetchArtigos();
            refreshData(); // Atualiza notificações
        } catch (error) {
            toast.error("Falha ao processar a decisão.");
        }
    };
    
    const handleDelete = async (artigoId, artigoKbId) => {
        if (window.confirm(`Tem certeza que deseja excluir permanentemente o artigo ${artigoKbId}? Esta ação não pode ser desfeita.`)) {
            try {
                await api.delete(`/api/conhecimento/${artigoId}`);
                toast.success("Artigo excluído com sucesso!");
                setArtigoAtivo(null);
                setArtigosSelecionados(prev => prev.filter(id => id !== artigoId));
                fetchArtigos();
                refreshData();
            } catch (error) {
                toast.error("Falha ao excluir o artigo.");
                console.error("Erro ao deletar artigo:", error);
            }
        }
    };

    const handleFileChange = async (event) => {
        if (event.target.files.length === 0) return;
        const files = event.target.files;
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('anexos', files[i]);
        }
        
        try {
            await api.post(`/api/conhecimento/${artigoAtivo.id}/anexos`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            await handleSelectArtigo(artigoAtivo.id); // Re-seleciona para atualizar a lista de anexos
        } catch (error) { 
            toast.error("Erro no upload do anexo."); 
        }
    };

    const handleDownload = async (anexoId, nomeOriginal) => {
        try {
            const response = await api.get(`/api/anexos/${anexoId}/download`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', nomeOriginal);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Erro no download do anexo:", error);
            toast.error("Não foi possível baixar o anexo.");
        }
    };

    const handleToggleSelecao = (artigoId) => {
        setArtigosSelecionados(prev =>
            prev.includes(artigoId)
                ? prev.filter(id => id !== artigoId)
                : [...prev, artigoId]
        );
    };

    const handleBulkAction = async (action) => {
        const total = artigosSelecionados.length;
        if (total === 0) return;

        const actionText = action === 'aprovar' ? 'aprovar' : 'excluir';
        if (!window.confirm(`Você tem certeza que deseja ${actionText} ${total} artigo(s) selecionado(s)?`)) return;

        try {
            await api.post('/api/conhecimento/bulk-actions', {
                artigoIds: artigosSelecionados,
                action: action
            });
            toast.success(`${total} artigo(s) foram processados com sucesso!`);
            setArtigosSelecionados([]);
            setArtigoAtivo(null);
            fetchArtigos();
            refreshData();
        } catch (error) {
            toast.error("Ocorreu um erro ao processar a ação em massa.");
            console.error("Erro em ação em massa:", error);
        }
    };
    
    return (
        <div className="base-conhecimento-container">
            <aside className="bc-sidebar">
                <div className="bc-sidebar-header">
                    <h3>Artigos</h3>
                    {canManage && <button className="btn-novo-artigo" onClick={handleNewArtigo}><FaPlus /> Novo Artigo</button>}
                </div>
                
                {canManage && (
                    <div className="bc-tabs-container">
                        {ABAS_DISPONIVEIS.map(aba => (
                            <div 
                                key={aba}
                                className={`bc-tab ${abaAtiva === aba ? 'active' : ''}`}
                                onClick={() => {
                                    setAbaAtiva(aba);
                                    setArtigoAtivo(null);
                                    setArtigosSelecionados([]);
                                }}
                            >
                                {aba}
                            </div>
                        ))}
                    </div>
                )}
                
                {canManage && artigosSelecionados.length > 0 && (
                    <div className="bc-bulk-actions-bar">
                        <span>{artigosSelecionados.length} selecionado(s)</span>
                        {['Pendente', 'Rascunho', 'Rejeitado'].includes(abaAtiva) && (
                           <button className="btn-aprovar-massa" onClick={() => handleBulkAction('aprovar')}>
                               <FaCheckCircle /> Aprovar
                           </button>
                        )}
                        <button className="btn-deletar-massa" onClick={() => handleBulkAction('deletar')}>
                           <FaTrash /> Excluir
                        </button>
                         <button className="btn-cancelar-selecao" onClick={() => setArtigosSelecionados([])}>
                           <FaTimesCircle /> Limpar
                        </button>
                    </div>
                )}

                <div className="bc-search-bar">
                    <FaSearch />
                    <input type="text" placeholder="Buscar por Título, Categoria ou ID..." value={termoBusca} onChange={e => setTermoBusca(e.target.value)} />
                </div>
                
                <div className="bc-artigos-lista">
                    {loading ? <p style={{textAlign: 'center', padding: '20px'}}>Carregando...</p> : Object.keys(artigosAgrupados).sort().map(categoria => (
                        <div key={categoria} className="categoria-grupo">
                            <h4>{categoria}</h4>
                            <ul>
                                {artigosAgrupados[categoria].map(artigo => (
                                    <li key={artigo.id} className={artigoAtivo?.id === artigo.id ? 'active' : ''}>
                                        <div className="artigo-lista-item">
                                            {canManage && (
                                                <input
                                                    type="checkbox"
                                                    checked={artigosSelecionados.includes(artigo.id)}
                                                    onChange={() => handleToggleSelecao(artigo.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            )}
                                            <div className="artigo-lista-content" onClick={() => handleSelectArtigo(artigo.id)}>
                                                <span className="artigo-lista-titulo">{artigo.kb_id} - {artigo.titulo}</span>
                                                <span className={`status-badge-lista status-${artigo.status.toLowerCase()}`}>{artigo.status}</span>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </aside>
            <main className="bc-main-content">
                {!artigoAtivo && (
                    <div className="placeholder-view">
                        <FaBook />
                        <h2>Bem-vindo à Base de Conhecimento</h2>
                        <p>Selecione um artigo na lista para ler ou crie um novo conhecimento.</p>
                    </div>
                )}
                {artigoAtivo && !isEditing && (
                    <div className="artigo-view-refatorado">
                        <div className={`status-bar-container status-bar-${artigoAtivo.status?.toLowerCase()}`}>
                            <span>Status: <strong>{artigoAtivo.status}</strong></span>
                            {canEdit(artigoAtivo) && (artigoAtivo.status === 'Rascunho' || artigoAtivo.status === 'Rejeitado') && <button onClick={() => setIsSubmitModalOpen(true)} className="btn-submit"><FaPaperPlane /> Submeter para Aprovação</button>}
                            {user?.id === artigoAtivo.aprovador_id && artigoAtivo.status === 'Pendente' && (
                                <div className="approval-actions">
                                    <button onClick={() => handleDecision('rejeitado')} className="action-reject"><FaThumbsDown /> Rejeitar</button>
                                    <button onClick={() => handleDecision('aprovado')} className="action-approve"><FaThumbsUp /> Aprovar</button>
                                </div>
                            )}
                        </div>
                        {artigoAtivo.status === 'Rejeitado' && (
                            <div className="rejection-reason"><strong>Motivo da Rejeição:</strong> {artigoAtivo.rejeicao_motivo}</div>
                        )}
                        <div className="view-header">
                            <div className="view-header-main">
                                <span className="kb-id">{artigoAtivo.kb_id}</span>
                                <h1>{artigoAtivo.titulo}</h1>
                            </div>
                            {canEdit(artigoAtivo) && (
                                <div className="view-header-actions">
                                    <button className="btn-editar" onClick={handleEdit}><FaEdit /> Editar</button>
                                    <button className="btn-deletar" onClick={() => handleDelete(artigoAtivo.id, artigoAtivo.kb_id)}><FaTrash /> Deletar</button>
                                </div>
                            )}
                        </div>
                        <div className="view-meta">
                            <span><strong>Categoria:</strong> {artigoAtivo.categoria}</span>
                            <span><FaTags /> <strong>Tags:</strong> {(Array.isArray(artigoAtivo.tags) && artigoAtivo.tags.length > 0) ? artigoAtivo.tags.join(', ') : 'Nenhuma'}</span>
                            <span><FaEye /> <strong>Visível para:</strong> {(Array.isArray(artigoAtivo.visibilidade) && artigoAtivo.visibilidade.length > 0) ? artigoAtivo.visibilidade.join(', ') : 'Todos'}</span>
                        </div>
                        <div className="view-conteudo" dangerouslySetInnerHTML={{ __html: artigoAtivo.conteudo || '<p><em>Este artigo ainda não tem conteúdo.</em></p>' }} />
                        <div className="view-anexos">
                            <h3><FaPaperclip /> Anexos ({artigoAtivo.anexos?.length || 0})</h3>
                            {artigoAtivo.anexos && artigoAtivo.anexos.length > 0 ? (
                                <ul>{artigoAtivo.anexos.map(anexo => (
                                    <li key={anexo.id}>
                                        <button className="anexo-download-button" onClick={() => setAnexoParaVisualizar(anexo)}>
                                            {anexo.nome_original} ({(anexo.tamanho_bytes / 1024).toFixed(1)} KB)
                                        </button>
                                    </li>
                                ))}</ul>
                            ) : <p>Nenhum anexo.</p>}
                        </div>
                    </div>
                )}
                {artigoAtivo && isEditing && (
                    <div className="artigo-edit-form">
                        <div className="edit-header">
                            <h3>Editando: {artigoAtivo.kb_id} - {editData.titulo}</h3>
                            <div className="edit-actions">
                                <button className="btn-cancelar" onClick={() => setIsEditing(false)}><FaUndo /> Cancelar</button>
                                <button className="btn-salvar" onClick={handleSave} disabled={isSaving}><FaSave /> {isSaving ? 'Salvando...' : 'Salvar Alterações'}</button>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Título</label>
                                <input type="text" value={editData.titulo} onChange={e => setEditData({...editData, titulo: e.target.value})} />
                            </div>
                            <div className="form-group">
                                <label>Categoria</label>
                                <input type="text" value={editData.categoria} onChange={e => setEditData({...editData, categoria: e.target.value})} />
                            </div>
                        </div>
                        <div className="form-row">
                             <div className="form-group">
                                <label>Status do Artigo</label>
                                <select 
                                    value={editData.status} 
                                    onChange={e => setEditData({...editData, status: e.target.value})}
                                >
                                    {STATUS_DISPONIVEIS.map(status => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </div>
                             <div className="form-group">
                                <label>Tags (separadas por vírgula)</label>
                                <input type="text" value={(editData.tags || []).join(', ')} onChange={e => setEditData({...editData, tags: e.target.value.split(',').map(t => t.trim())})} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Conteúdo</label>
                            <EditorToolbar editor={editor} />
                            <EditorContent editor={editor} className="tiptap-editor" />
                        </div>
                        <div className="form-group">
                            <label>Visibilidade (deixe em branco para todos)</label>
                            <div className="checkbox-group">
                                {PERFIS_DISPONIVEIS.map(perfil => (
                                    <label key={perfil}>
                                        <input type="checkbox" checked={(editData.visibilidade || []).includes(perfil)} onChange={() => {
                                            const newVis = (editData.visibilidade || []).includes(perfil) ? (editData.visibilidade || []).filter(p => p !== perfil) : [...(editData.visibilidade || []), perfil];
                                            setEditData({...editData, visibilidade: newVis});
                                        }} /> {perfil}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Anexos</label>
                            <div className="anexos-list">
                                {artigoAtivo.anexos && artigoAtivo.anexos.map(anexo => <div key={anexo.id}>- {anexo.nome_original}</div>)}
                            </div>
                            <input type="file" multiple ref={fileInputRef} style={{display: 'none'}} onChange={handleFileChange} />
                            <button type="button" className="btn-add-anexo" onClick={() => fileInputRef.current.click()}><FaPaperclip /> Adicionar Anexos</button>
                        </div>
                    </div>
                )}
            </main>
            {isSubmitModalOpen && <SubmitModal onClose={() => setIsSubmitModalOpen(false)} onSubmeter={handleSubmitForApproval} />}
            {anexoParaVisualizar && <AnexoPreviewModal anexo={anexoParaVisualizar} onClose={() => setAnexoParaVisualizar(null)} onDownload={handleDownload} />}
        </div>
    );
}