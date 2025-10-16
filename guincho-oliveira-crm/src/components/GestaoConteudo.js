import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import './GestaoConteudo.css';
import { 
    FaPlus, FaPen, FaTrash, FaToggleOn, FaToggleOff, 
    FaUsers, FaUserTag, FaGlobeAmericas, FaImage, FaBullhorn, FaImages 
} from 'react-icons/fa';

// --- Sub-componente: Modal de Anúncios ---
function AnuncioFormModal({ anuncio, onClose, onSave }) {
    const [formData, setFormData] = useState({
        titulo: '', mensagem: '', ativo: true, data_inicio: '', data_fim: '',
    });
    const [imagemFile, setImagemFile] = useState(null);
    const [imagemPreview, setImagemPreview] = useState(null);
    const [destinatarioTipo, setDestinatarioTipo] = useState('todos');
    const [selecaoPerfis, setSelecaoPerfis] = useState(new Set());
    const [selecaoUsuarios, setSelecaoUsuarios] = useState(new Set());
    const [usuariosDisponiveis, setUsuariosDisponiveis] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const perfisDisponiveis = ['admin', 'admin_geral', 'financeiro', 'operacional', 'motorista'];

    useEffect(() => {
        const fetchUsuarios = async () => {
            try {
                const token = localStorage.getItem('token');
                // =========================================================================
                // === CORREÇÃO APLICADA AQUI: Ajustando a URL para a rota correta      ====
                // =========================================================================
                // const { data } = await api.get('/api/usuarios/all-users', { headers: { Authorization: `Bearer ${token}` } }); // URL ANTIGA E INCORRETA
                const { data } = await api.get('/api/usuarios', { headers: { Authorization: `Bearer ${token}` } }); // <-- URL CORRETA
                
                setUsuariosDisponiveis(data.data || data); // Funciona se a API retornar {data: [...]} ou só [...]
            } catch (error) {
                console.error("Falha ao carregar a lista de usuários.", error);
                toast.error("Não foi possível carregar a lista de usuários.");
                onClose();
            } finally { setLoading(false); }
        };
        fetchUsuarios();
    }, [onClose]);

    useEffect(() => {
        if (anuncio) {
            setFormData({
                titulo: anuncio.titulo || '',
                mensagem: anuncio.mensagem || '',
                ativo: anuncio.ativo,
                data_inicio: anuncio.data_inicio ? new Date(anuncio.data_inicio).toISOString().split('T')[0] : '',
                data_fim: anuncio.data_fim ? new Date(anuncio.data_fim).toISOString().split('T')[0] : '',
            });
            setImagemPreview(anuncio.imagem_url || null);
            if (anuncio.dest_perfis && anuncio.dest_perfis.length > 0) {
                setDestinatarioTipo('perfis'); setSelecaoPerfis(new Set(anuncio.dest_perfis));
            } else if (anuncio.dest_usuarios_ids && anuncio.dest_usuarios_ids.length > 0) {
                setDestinatarioTipo('usuarios'); setSelecaoUsuarios(new Set(anuncio.dest_usuarios_ids));
            } else {
                setDestinatarioTipo('todos');
            }
        }
    }, [anuncio]);
    
    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) { setImagemFile(file); setImagemPreview(URL.createObjectURL(file)); }
    };

    const handlePerfisChange = (perfil) => setSelecaoPerfis(prev => { const newSet = new Set(prev); if (newSet.has(perfil)) newSet.delete(perfil); else newSet.add(perfil); return newSet; });
    const handleUsuariosChange = (usuarioId) => setSelecaoUsuarios(prev => { const newSet = new Set(prev); const id = Number(usuarioId); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); return newSet; });
    
    const handleSubmit = (e) => {
        e.preventDefault();
        const finalFormData = new FormData();
        if (anuncio) finalFormData.append('id', anuncio.id);
        Object.keys(formData).forEach(key => finalFormData.append(key, formData[key]));
        if (imagemFile) finalFormData.append('imagem', imagemFile);
        if (destinatarioTipo === 'perfis') {
            finalFormData.append('dest_perfis', JSON.stringify(Array.from(selecaoPerfis)));
            finalFormData.append('dest_usuarios_ids', JSON.stringify([]));
        } else if (destinatarioTipo === 'usuarios') {
            finalFormData.append('dest_perfis', JSON.stringify([]));
            finalFormData.append('dest_usuarios_ids', JSON.stringify(Array.from(selecaoUsuarios)));
        } else {
            finalFormData.append('dest_perfis', JSON.stringify([]));
            finalFormData.append('dest_usuarios_ids', JSON.stringify([]));
        }
        onSave(finalFormData, !!anuncio);
    };

    const usuariosFiltrados = useMemo(() => 
        usuariosDisponiveis.filter(user => 
            user.nome.toLowerCase().includes(searchTerm.toLowerCase())
        ), [usuariosDisponiveis, searchTerm]
    );

    return (
        <div className="modal-overlay">
            <div className="modal-content modal-lg">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3>{anuncio ? 'Editar Anúncio' : 'Criar Novo Anúncio'}</h3>
                {loading ? <div className="modal-loading"><p>Carregando dados...</p></div> : (
                    <form onSubmit={handleSubmit} className="anuncio-form">
                        <div className="form-body">
                            <div className="form-main-fields">
                                <div className="form-group"><label>Título</label><input type="text" name="titulo" value={formData.titulo} onChange={handleFormChange} required /></div>
                                <div className="form-group"><label>Mensagem</label><textarea name="mensagem" value={formData.mensagem} onChange={handleFormChange} required rows="5"></textarea></div>
                                <div className="form-row">
                                    <div className="form-group"><label>Publicar a partir de:</label><input type="date" name="data_inicio" value={formData.data_inicio} onChange={handleFormChange} /></div>
                                    <div className="form-group"><label>Publicar até:</label><input type="date" name="data_fim" value={formData.data_fim} onChange={handleFormChange} /></div>
                                </div>
                                <div className="form-group-inline"><label>Anúncio Ativo?</label><label className="switch"><input type="checkbox" name="ativo" checked={formData.ativo} onChange={handleFormChange} /><span className="slider round"></span></label></div>
                            </div>
                            <div className="form-side-fields">
                                <label>Imagem (Opcional)</label>
                                <div className="image-preview" onClick={() => document.getElementById('imageUpload').click()}>{imagemPreview ? <img src={imagemPreview} alt="Preview"/> : <span><FaImage /> Clique para selecionar</span>}</div>
                                <input id="imageUpload" type="file" accept="image/png, image/jpeg" onChange={handleImageChange} style={{display: 'none'}}/>
                            </div>
                        </div>
                        <div className="form-segmentacao">
                            <h4>Destinatários</h4>
                            <div className="radio-group">
                                <label><input type="radio" value="todos" checked={destinatarioTipo === 'todos'} onChange={e => setDestinatarioTipo(e.target.value)} /> Todos</label>
                                <label><input type="radio" value="perfis" checked={destinatarioTipo === 'perfis'} onChange={e => setDestinatarioTipo(e.target.value)} /> Perfis</label>
                                <label><input type="radio" value="usuarios" checked={destinatarioTipo === 'usuarios'} onChange={e => setDestinatarioTipo(e.target.value)} /> Usuários</label>
                            </div>
                            {destinatarioTipo === 'perfis' && (
                                <div className="checkbox-group-list scrollable">
                                    {perfisDisponiveis.map(perfil => 
                                        <label key={perfil} className="checkbox-item">
                                            <input type="checkbox" checked={selecaoPerfis.has(perfil)} onChange={() => handlePerfisChange(perfil)}/> 
                                            <span>{perfil.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                                        </label>
                                    )}
                                </div>
                            )}
                            {destinatarioTipo === 'usuarios' && (
                                <>
                                    <div className="search-container">
                                        <input type="text" placeholder="Pesquisar usuário..." className="search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                    </div>
                                    <div className="checkbox-group-list scrollable">
                                        {usuariosFiltrados.map(user => 
                                            <label key={user.id} className="checkbox-item">
                                                <input type="checkbox" checked={selecaoUsuarios.has(user.id)} onChange={() => handleUsuariosChange(user.id)}/>
                                                <span>{user.nome}</span>
                                            </label>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="form-actions"><button type="submit" className="submit-button">Salvar Anúncio</button></div>
                    </form>
                )}
            </div>
        </div>
    );
}

const renderDestinatarios = (anuncio) => {
    const perfis = anuncio.dest_perfis;
    const usuarios = anuncio.dest_usuarios_ids;
    if (perfis && perfis.length > 0) return <><FaUserTag title="Perfis" /> <span>{perfis.join(', ')}</span></>;
    if (usuarios && usuarios.length > 0) return <><FaUsers title="Usuários" /> <span>{usuarios.length} usuário(s)</span></>;
    return <><FaGlobeAmericas title="Todos" /> <span>Todos</span></>;
};

const SlideshowManager = () => {
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef(null);
    const MAX_IMAGES = 20;

    const fetchSlideshowImages = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const { data } = await api.get('/api/slideshow/manage/images', { headers: { Authorization: `Bearer ${token}` } });
            setImages(data);
        } catch (error) { toast.error("Falha ao carregar imagens do slideshow."); } 
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchSlideshowImages(); }, [fetchSlideshowImages]);

    const handleImageUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (images.length >= MAX_IMAGES) {
            toast.warn(`Você atingiu o limite de ${MAX_IMAGES} imagens.`);
            return;
        }
        const formData = new FormData();
        formData.append('image', file);
        try {
            const token = localStorage.getItem('token');
            await api.post('/api/slideshow/manage/images', formData, { headers: { Authorization: `Bearer ${token}` } });
            toast.success("Imagem adicionada com sucesso!");
            fetchSlideshowImages();
        } catch (error) { toast.error(error.response?.data?.error || "Erro ao enviar a imagem."); } 
        finally { if(fileInputRef.current) fileInputRef.current.value = ""; }
    };

    const handleDeleteImage = async (imageId) => {
        if (window.confirm("Tem certeza que deseja excluir esta imagem?")) {
            try {
                const token = localStorage.getItem('token');
                await api.delete(`/api/slideshow/manage/images/${imageId}`, { headers: { Authorization: `Bearer ${token}` } });
                toast.success("Imagem excluída com sucesso!");
                fetchSlideshowImages();
            } catch (error) { toast.error("Erro ao excluir a imagem."); }
        }
    };

    return (
        <div className="tab-content">
            <div className="card-header separate">
                <h3>Gerenciar Banners ({images.length}/{MAX_IMAGES})</h3>
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/png, image/jpeg, image/gif" style={{ display: 'none' }} />
                <button onClick={() => fileInputRef.current.click()} className="add-button" disabled={images.length >= MAX_IMAGES}>
                    <FaImage /> Nova Imagem
                </button>
            </div>
            {loading ? <p>Carregando...</p> : (
                <div className="slideshow-image-grid">
                    {images.length === 0 ? <p className="empty-list-message">Nenhuma imagem no slideshow.</p> : images.map(img => (
                        <div key={img.id} className="slideshow-image-item">
                            <img src={img.image_url} alt={`Slide ${img.id}`} />
                            <div className="image-overlay">
                                <span>Criado por: {img.criado_por_nome || 'N/A'}</span>
                                <button onClick={() => handleDeleteImage(img.id)}><FaTrash /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const AnunciosManager = ({ onOpenModal, anunciosKey }) => {
    const [anuncios, setAnuncios] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAnuncios = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const { data } = await api.get('/api/conteudo/anuncios', { headers: { Authorization: `Bearer ${token}` } });
            setAnuncios(data);
        } catch (error) { toast.error("Falha ao carregar anúncios."); } 
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchAnuncios(); }, [fetchAnuncios, anunciosKey]);
    
    const handleDeleteAnuncio = async (anuncioId) => {
        if (window.confirm("Tem certeza que deseja excluir este anúncio?")) {
            try {
                const token = localStorage.getItem('token');
                await api.delete(`/api/conteudo/anuncios/${anuncioId}`, { headers: { Authorization: `Bearer ${token}` } });
                toast.success("Anúncio excluído com sucesso!");
                fetchAnuncios();
            } catch (error) { toast.error("Erro ao excluir o anúncio."); }
        }
    };

    return (
        <div className="tab-content">
            <div className="card-header separate">
                <h3>Gerenciar Anúncios e Notificações</h3>
                <button onClick={() => onOpenModal()} className="add-button"><FaPlus /> Novo Anúncio</button>
            </div>
            {loading ? <p>Carregando anúncios...</p> : (
                <ul className="anuncios-list">
                    {anuncios.length === 0 ? <p className="empty-list-message">Nenhum anúncio criado.</p> : anuncios.map(anuncio => (
                        <li key={anuncio.id} className={!anuncio.ativo ? 'inativo' : ''}>
                            <div className="anuncio-info">
                                <strong>{anuncio.titulo}</strong>
                                <span className="destinatarios-info">{renderDestinatarios(anuncio)}</span>
                                <span>Criado por: {anuncio.criado_por_nome || 'N/A'} em {new Date(anuncio.data_criacao).toLocaleDateString('pt-BR')}</span>
                            </div>
                            <div className="anuncio-actions">
                                {anuncio.ativo ? <FaToggleOn className="status-icon active" title="Ativo" /> : <FaToggleOff className="status-icon inactive" title="Inativo" />}
                                <button onClick={() => onOpenModal(anuncio)} className="action-button edit" title="Editar"><FaPen /></button>
                                <button onClick={() => handleDeleteAnuncio(anuncio.id)} className="action-button delete" title="Excluir"><FaTrash /></button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// --- Componente Principal ---
export default function GestaoConteudo() {
    const [activeTab, setActiveTab] = useState('anuncios');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAnuncio, setEditingAnuncio] = useState(null);
    const [anunciosKey, setAnunciosKey] = useState(0); 

    const handleOpenModal = (anuncio = null) => {
        setEditingAnuncio(anuncio);
        setIsModalOpen(true);
    };

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setEditingAnuncio(null);
    }, []);

    const handleSaveAnuncio = useCallback(async (formData, isEditing) => {
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Bearer ${token}` } };
            if (isEditing) {
                const id = formData.get('id');
                await api.put(`/api/conteudo/anuncios/${id}`, formData, config);
                toast.success("Anúncio atualizado com sucesso!");
            } else {
                await api.post('/api/conteudo/anuncios', formData, config);
                toast.success("Anúncio criado com sucesso!");
            }
            handleCloseModal();
            setAnunciosKey(prevKey => prevKey + 1);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao salvar o anúncio.");
        }
    }, [handleCloseModal]);
    
    return (
        <div className="gestao-conteudo-container">
            <div className="content-card">
                <div className="tabs">
                    <button className={`tab-button ${activeTab === 'slideshow' ? 'active' : ''}`} onClick={() => setActiveTab('slideshow')}>
                        <FaImages /> Banners do Slideshow
                    </button>
                    <button className={`tab-button ${activeTab === 'anuncios' ? 'active' : ''}`} onClick={() => setActiveTab('anuncios')}>
                        <FaBullhorn /> Anúncios/Notificações
                    </button>
                </div>
                
                <div className="tab-content">
                  {activeTab === 'slideshow' && <SlideshowManager />}
                  {activeTab === 'anuncios' && <AnunciosManager key={anunciosKey} onOpenModal={handleOpenModal} />}
                </div>

            </div>
            {isModalOpen && <AnuncioFormModal anuncio={editingAnuncio} onClose={handleCloseModal} onSave={handleSaveAnuncio} />}
        </div>
    );
}