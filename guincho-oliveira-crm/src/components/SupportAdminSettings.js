// src/components/SupportAdminSettings.js

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
import './SupportAdminSettings.css';
import { FaPlus, FaPencilAlt, FaTrash, FaSpinner, FaTimes, FaSave, FaFileExcel, FaUpload, FaDownload } from 'react-icons/fa';

//====================================================================
// COMPONENTE INTERNO PARA GERENCIAR AS POLÍTICAS DE SLA
//====================================================================
const SlaPoliciesSettings = () => {
    const PRIORIDADES = ['Urgente', 'Alta', 'Normal', 'Baixa'];

    const [politicas, setPoliticas] = useState(
        PRIORIDADES.map(p => ({
            prioridade: p,
            tempo_primeira_resposta_minutos: 0,
            tempo_resolucao_minutos: 0
        }))
    );
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPoliticas = async () => {
            try {
                const { data: dadosDoBanco } = await api.get('/api/admin/suporte-config/sla-politicas');
                
                const politicasAtualizadas = PRIORIDADES.map(p => {
                    const politicaDoBanco = dadosDoBanco.find(db => db.prioridade === p);
                    return politicaDoBanco || { prioridade: p, tempo_primeira_resposta_minutos: 0, tempo_resolucao_minutos: 0 };
                });

                setPoliticas(politicasAtualizadas);
            } catch (err) {
                toast.error('Não foi possível carregar as políticas de SLA.');
                console.error("Erro ao buscar políticas de SLA:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchPoliticas();
    }, []);

    const handleInputChange = (prioridade, campo, valor) => {
        setPoliticas(politicasAtuais =>
            politicasAtuais.map(p =>
                p.prioridade === prioridade ? { ...p, [campo]: parseInt(valor, 10) || 0 } : p
            )
        );
    };

    const handleSavePolicies = async (e) => {
        e.preventDefault();
        try {
            await api.put('/api/admin/suporte-config/sla-politicas', politicas);
            toast.success('Políticas de SLA salvas com sucesso!');
        } catch (err) {
            toast.error('Falha ao salvar as políticas de SLA.');
            console.error("Erro ao salvar políticas de SLA:", err);
        }
    };
    
    if (loading) return <div className="loading-view-sla"><FaSpinner className="spinner" /> Carregando Políticas de SLA...</div>;

    return (
        <div className="sla-settings-card">
            <header className="column-header">
                <h2>Políticas de SLA por Prioridade</h2>
            </header>
            <p className="settings-description">Defina os tempos máximos (em minutos) para a primeira resposta e para a resolução final de um chamado.</p>
            <form onSubmit={handleSavePolicies}>
                <div className="sla-table">
                    <div className="sla-table-header">
                        <div>Prioridade</div>
                        <div>Tempo de Resposta (min)</div>
                        <div>Tempo de Resolução (min)</div>
                    </div>
                    <div className="sla-table-body">
                        {politicas.map((politica) => (
                            <div className="sla-table-row" key={politica.prioridade}>
                                <div><strong>{politica.prioridade}</strong></div>
                                <div><input type="number" className="form-control" value={politica.tempo_primeira_resposta_minutos} onChange={(e) => handleInputChange(politica.prioridade, 'tempo_primeira_resposta_minutos', e.target.value)} /></div>
                                <div><input type="number" className="form-control" value={politica.tempo_resolucao_minutos} onChange={(e) => handleInputChange(politica.prioridade, 'tempo_resolucao_minutos', e.target.value)}/></div>
                            </div>
                        ))}
                    </div>
                </div>
                <button type="submit" className="btn-save-sla">
                    <FaSave /> Salvar Políticas de SLA
                </button>
            </form>
        </div>
    );
};


//====================================================================
// MODAL DE CATEGORIA
//====================================================================
const CategoryModal = ({ item, type, onSave, onCancel, parentCategories = [] }) => {
    const [name, setName] = useState(item?.nome || '');
    const [parentId, setParentId] = useState(item?.categoria_id || (parentCategories[0]?.id || ''));
    const [tipoPadrao, setTipoPadrao] = useState(item?.tipo_padrao || 'Incidente');
    const [prioridadePadrao, setPrioridadePadrao] = useState(item?.prioridade_padrao || 'Normal');
    const [perfilDestinoPadrao, setPerfilDestinoPadrao] = useState(item?.perfil_destino_padrao || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name) return toast.warn(`O nome para ${type} é obrigatório.`);
        if (type === 'Subcategoria' && !parentId) return toast.warn('É necessário selecionar uma categoria pai.');
        
        const dataToSave = type === 'Subcategoria'
            ? { nome: name, categoria_id: parentId, id: item?.id }
            : { nome: name, id: item?.id, tipo_padrao: tipoPadrao, prioridade_padrao: prioridadePadrao, perfil_destino_padrao: perfilDestinoPadrao };

        onSave(dataToSave);
    };
    
    const PERFIS_SUPORTE = ['financeiro', 'operacional', 'suporte_tecnico', 'admin'];

    return (
        <div className="modal-overlay-settings">
            <div className="modal-content-settings">
                <header className="modal-header-settings">
                    <h2>{item?.id ? 'Editar' : 'Nova'} {type}</h2>
                    <button onClick={onCancel} className="modal-close-button-settings"><FaTimes /></button>
                </header>
                <form onSubmit={handleSubmit}>
                    {type === 'Subcategoria' && (
                        <div className="form-group-settings">
                            <label>Categoria Pai</label>
                            <select value={parentId} onChange={e => setParentId(e.target.value)} required>{parentCategories.map(cat => (<option key={cat.id} value={cat.id}>{cat.nome}</option>))}</select>
                        </div>
                    )}
                    <div className="form-group-settings"><label>Nome da {type}</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={`Digite o nome`} autoFocus required /></div>
                    {type === 'Categoria' && (
                        <>
                            <div className="form-row-settings">
                                <div className="form-group-settings"><label>Tipo Padrão</label><select value={tipoPadrao} onChange={e => setTipoPadrao(e.target.value)}><option value="Incidente">Incidente</option><option value="Requisição">Requisição</option></select></div>
                                <div className="form-group-settings"><label>Prioridade Padrão</label><select value={prioridadePadrao} onChange={e => setPrioridadePadrao(e.target.value)}><option value="Baixa">Baixa</option><option value="Normal">Normal</option><option value="Alta">Alta</option><option value="Urgente">Urgente</option></select></div>
                            </div>
                            <div className="form-group-settings">
                                <label>Perfil de Destino Padrão</label>
                                <select value={perfilDestinoPadrao} onChange={e => setPerfilDestinoPadrao(e.target.value)} required>
                                    <option value="">Selecione o perfil</option>
                                    {PERFIS_SUPORTE.map(perfil => (<option key={perfil} value={perfil}>{perfil.charAt(0).toUpperCase() + perfil.slice(1)}</option>))}
                                </select>
                            </div>
                        </>
                    )}
                    <div className="modal-footer-settings"><button type="button" className="btn-cancel" onClick={onCancel}>Cancelar</button><button type="submit" className="btn-save">Salvar</button></div>
                </form>
            </div>
        </div>
    );
};

//====================================================================
// COMPONENTE PRINCIPAL DA PÁGINA
//====================================================================
export default function SupportAdminSettings() {
    const [categorias, setCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalInfo, setModalInfo] = useState({ isOpen: false, item: null, type: '' });
    const [isAdminGeral, setIsAdminGeral] = useState(false);
    const importFileInputRef = useRef(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/api/admin/suporte-config/categorias');
            setCategorias(data);
        } catch (error) {
            toast.error('Falha ao carregar as categorias.');
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        try {
            const storedUserString = localStorage.getItem('user'); 
            if (storedUserString) {
                const user = JSON.parse(storedUserString);
                setIsAdminGeral(user?.perfil === 'admin_geral');
            } else {
                setIsAdminGeral(false);
            }
        } catch (error) {
            console.error("Erro ao ler o perfil do usuário do localStorage:", error);
            setIsAdminGeral(false);
        }
    }, []);

    const handleSave = async (itemData) => {
        const { type } = modalInfo;
        const isEdit = !!itemData.id;
        const endpoint = type === 'Categoria' 
            ? (isEdit ? `/api/admin/suporte-config/categorias/${itemData.id}` : '/api/admin/suporte-config/categorias')
            : (isEdit ? `/api/admin/suporte-config/subcategorias/${itemData.id}` : '/api/admin/suporte-config/subcategorias');
        const method = isEdit ? 'put' : 'post';
        try {
            await api[method](endpoint, itemData);
            toast.success(`${type} salva com sucesso!`);
            setModalInfo({ isOpen: false, item: null, type: '' });
            fetchData();
        } catch (error) {
            toast.error(`Erro ao salvar ${type}.`);
            console.error(error);
        }
    };

    const handleDelete = async (item, type) => {
        if (!window.confirm(`Tem certeza que deseja excluir "${item.nome}"? ${type === 'Categoria' ? 'TODAS as subcategorias associadas também serão excluídas.' : ''}`)) return;
        const endpoint = type === 'Categoria'
            ? `/api/admin/suporte-config/categorias/${item.id}`
            : `/api/admin/suporte-config/subcategorias/${item.id}`;
        try {
            await api.delete(endpoint);
            toast.success(`${type} excluída com sucesso!`);
            fetchData();
        } catch (error) {
            toast.error(`Erro ao excluir ${type}.`);
            console.error(error);
        }
    };

    const handleDownloadModel = async () => {
        const toastId = toast.loading("Baixando arquivo modelo...");
        try {
            // Usamos o 'api.get' para que o token de autorização seja enviado
            const response = await api.get('/api/admin/suporte-config/modelo-importacao', {
                responseType: 'blob', // Isso é crucial para tratar a resposta como um arquivo
            });

            // Cria uma URL temporária para o arquivo recebido (blob)
            const url = window.URL.createObjectURL(new Blob([response.data]));
            
            // Cria um link <a> invisível
            const link = document.createElement('a');
            link.href = url;
            
            // Define o nome do arquivo que será baixado
            link.setAttribute('download', 'modelo_importacao_categorias.xlsx');
            
            // Adiciona o link ao corpo do documento, clica nele e depois o remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Limpa a URL temporária da memória
            window.URL.revokeObjectURL(url);
            toast.update(toastId, { render: "Download iniciado!", type: 'success', isLoading: false, autoClose: 3000 });

        } catch (error) {
            console.error("Erro ao baixar o modelo:", error);
            toast.update(toastId, { render: "Falha ao baixar o arquivo.", type: 'error', isLoading: false, autoClose: 5000 });
        }
    };

    const handleExport = async () => {
        const toastId = toast.loading("Exportando dados...");
        try {
            // A mesma lógica é aplicada aqui: usar o 'api.get' com responseType 'blob'
            const response = await api.get('/api/admin/suporte-config/exportar', {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'export_categorias_suporte.xlsx');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.update(toastId, { render: "Exportação iniciada!", type: 'success', isLoading: false, autoClose: 3000 });

        } catch (error) {
            console.error("Erro ao exportar dados:", error);
            toast.update(toastId, { render: "Não foi possível exportar os dados.", type: 'error', isLoading: false, autoClose: 5000 });
        }
    };

    const handleImportClick = () => {
        importFileInputRef.current.click();
    };

    const handleFileImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        const toastId = toast.loading("Importando arquivo... Por favor, aguarde.");
        try {
            const { data } = await api.post('/api/admin/suporte-config/importar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.update(toastId, { render: data.message, type: 'success', isLoading: false, autoClose: 5000 });
            fetchData();
        } catch (error) {
            const errorMessage = error.response?.data?.error || 'Falha ao importar o arquivo.';
            toast.update(toastId, { render: errorMessage, type: 'error', isLoading: false, autoClose: 5000 });
        } finally {
            event.target.value = null;
        }
    };

    return (
        <div className="support-settings-container">
            <input type="file" ref={importFileInputRef} onChange={handleFileImport} style={{ display: 'none' }} accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
            
            <header className="support-settings-header">
                <h1>Configurações de Suporte</h1>
                <p>Gerencie as categorias, subcategorias e políticas de SLA para organização dos chamados.</p>
            </header>

            {loading ? (
                <div className="loading-view"><FaSpinner className="spinner" /> Carregando...</div>
            ) : (
                <div className="categories-grid">
                    <div className="category-column">
                        <div className="column-header">
                            <h2>Categorias Principais</h2>
                            <div className="header-actions"> 
                                {isAdminGeral && (
                                    <div className="actions-container">
                                        <button onClick={handleDownloadModel} className="btn btn-modelo"><FaFileExcel /> Modelo</button>
                                        <button onClick={handleImportClick} className="btn btn-importar"><FaUpload /> Importar</button>
                                        <button onClick={handleExport} className="btn btn-exportar"><FaDownload /> Exportar</button>
                                    </div>
                                )}
                                <button className="btn-add" onClick={() => setModalInfo({ isOpen: true, item: null, type: 'Categoria' })}><FaPlus /> Nova Categoria</button>
                            </div>
                        </div>

                        <ul className="category-list">
                            {categorias.map(cat => (
                                <li key={cat.id}>
                                    <div className="category-main-line">
                                        <span className="category-name">{cat.nome}</span>
                                        <div className="category-actions">
                                            <button onClick={() => setModalInfo({ isOpen: true, item: cat, type: 'Categoria' })}><FaPencilAlt /></button>
                                            <button onClick={() => handleDelete(cat, 'Categoria')}><FaTrash /></button>
                                        </div>
                                    </div>
                                    
                                    <div className="subcategory-section">
                                        <div className="column-header-sub">
                                            <h3>Subcategorias</h3>
                                            <button className="btn-add-sub" onClick={() => setModalInfo({ isOpen: true, item: { categoria_id: cat.id }, type: 'Subcategoria' })}><FaPlus /></button>
                                        </div>
                                        <ul className="subcategory-list">
                                            {cat.subcategorias.length > 0 ? cat.subcategorias.map(sub => (
                                                <li key={sub.id}>
                                                    <span className="subcategory-name">{sub.nome}</span>
                                                    <div className="category-actions">
                                                        <button onClick={() => setModalInfo({ isOpen: true, item: sub, type: 'Subcategoria' })}><FaPencilAlt /></button>
                                                        <button onClick={() => handleDelete(sub, 'Subcategoria')}><FaTrash /></button>
                                                    </div>
                                                </li>
                                            )) : <p className="no-subcategories">Nenhuma subcategoria.</p>}
                                        </ul>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
            
            {modalInfo.isOpen && (<CategoryModal item={modalInfo.item} type={modalInfo.type} onSave={handleSave} onCancel={() => setModalInfo({ isOpen: false, item: null, type: '' })} parentCategories={categorias}/>)}
            
            <hr className="section-divider" />
            
            <SlaPoliciesSettings />
        </div>
    );
}