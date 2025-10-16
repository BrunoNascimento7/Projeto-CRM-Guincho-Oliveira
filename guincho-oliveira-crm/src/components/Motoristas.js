import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Motoristas.css';
import { FaUserPlus, FaUsers, FaSearch, FaArrowLeft, FaDownload, FaFileExport, FaFileImport } from 'react-icons/fa';
import * as XLSX from 'xlsx';
import MotoristaDetalhesModal from '../components/MotoristaDetalhesModal';
import SuccessModal from './SuccessModal'; // Mantido, pois estava no seu código original

export default function Motoristas() {
    const navigate = useNavigate();
    const [motoristas, setMotoristas] = useState([]);
    const [formData, setFormData] = useState({ nome: '', cnh_numero: '', categoria_cnh: '', telefone: '' });
    const [editingMotorista, setEditingMotorista] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Estados de controle da página
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    const [userProfile, setUserProfile] = useState(null);

    // Estados para o novo modal de visualização
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [viewingDriverId, setViewingDriverId] = useState(null);

    // Estados de importação e modal de sucesso
    const fileInputRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');


    // --- FUNÇÕES DE BUSCA E EFEITOS ---
    const fetchUserData = async () => {
        try {
            const { data } = await api.get('/api/usuarios/me');
            setUserProfile(data.perfil);
        } catch (error) {
            console.error("Erro ao buscar dados do usuário:", error);
        }
    };
    
    const fetchMotoristas = (page = 1) => {
        setIsLoading(true);
        setError(null);
        api.get('/api/drivers', { params: { query: searchQuery, page, limit: 10 } })
            .then(response => {
                setMotoristas(response.data.data);
                setPagination(response.data.pagination);
            })
            .catch(error => {
                console.error('Erro ao buscar motoristas:', error);
                setError('Falha ao carregar motoristas.');
            })
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        fetchUserData();
    }, []);
    
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => fetchMotoristas(1), 300);
        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    // --- FUNÇÕES DE MANIPULAÇÃO DOS MODAIS ---
    const handleOpenViewModal = (id) => { setViewingDriverId(id); setIsViewModalOpen(true); };
    const handleCloseViewModal = () => { setIsViewModalOpen(false); setViewingDriverId(null); };
    const handleOpenEditModal = (motorista) => { setEditingMotorista(motorista); setIsEditModalOpen(true); };
    const handleCloseEditModal = () => { setIsEditModalOpen(false); setEditingMotorista(null); };

    // --- FUNÇÕES CRUD E HANDLERS ---
    const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    const handleEditInputChange = (e) => setEditingMotorista({ ...editingMotorista, [e.target.name]: e.target.value });
    
    const handleDelete = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir este motorista?')) {
            try {
                await api.delete(`/api/drivers/${id}`);
                setSuccessMessage('Motorista excluído com sucesso!');
                setIsSuccessModalVisible(true);
                if (motoristas.length === 1 && pagination.page > 1) {
                    fetchMotoristas(pagination.page - 1);
                } else {
                    fetchMotoristas(pagination.page);
                }
            } catch (error) {
                alert(error.response?.data?.error || 'Erro ao excluir motorista.');
            }
        }
    };
    
    const handleAddSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/api/drivers', formData);
            setSuccessMessage('Motorista adicionado com sucesso!');
            setIsSuccessModalVisible(true);
            setFormData({ nome: '', cnh_numero: '', categoria_cnh: '', telefone: '' });
            fetchMotoristas(1);
        } catch (error) {
            alert('Erro ao cadastrar motorista.');
        }
    };

    const handleUpdateSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/api/drivers/${editingMotorista.id}`, editingMotorista);
            setSuccessMessage('Motorista atualizado com sucesso!');
            setIsSuccessModalVisible(true);
            handleCloseEditModal();
            fetchMotoristas(pagination.page);
        } catch (error) {
            alert('Erro ao atualizar motorista.');
        }
    };

    // --- FUNÇÕES DE IMPORTAÇÃO E EXPORTAÇÃO ---
    const handleExport = async (format) => {
        try {
            const response = await api.get(`/api/drivers/export?format=${format}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `motoristas_exportados.${format}`); 
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error(`Erro ao exportar para ${format}:`, error);
            alert('Erro ao exportar motoristas.');
        }
    };
    
    const handleDownloadTemplate = (format) => {
        const header = ["nome", "cnh_numero", "categoria_cnh", "telefone"];
        const exampleRow = ["João da Silva", "12345678900", "A/B", "11987654321"];
        const fileName = `modelo_importacao_motoristas.${format}`;

        if (format === 'csv') {
            const csvContent = [header.join(','), exampleRow.join(',')].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } else if (format === 'xlsx') {
            const worksheet = XLSX.utils.aoa_to_sheet([header, exampleRow]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Motoristas");
            XLSX.writeFile(workbook, fileName);
        }
    };
    
    const handleImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setIsImporting(true);
        try {
            const response = await api.post('/api/drivers/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setSuccessMessage(response.data.message);
            setIsSuccessModalVisible(true);
            fetchMotoristas(1);
        } catch (error) {
            console.error("Erro ao importar motoristas:", error);
            alert(`Erro na importação: ${error.response?.data?.error || 'Verifique o formato do arquivo.'}`);
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
            fetchMotoristas(newPage);
        }
    };

    // --- LÓGICA DE RENDERIZAÇÃO ---
    const renderContent = () => {
        if (isLoading) {
            return <p className="empty-list-message">Carregando motoristas...</p>;
        }
        if (error) {
            return <p className="empty-list-message error">{error}</p>;
        }
        if (!motoristas || motoristas.length === 0) {
            return <p className="empty-list-message">Nenhum motorista encontrado.</p>;
        }
        
        // CORREÇÃO AQUI: hasAdminPermission permite Editar/Excluir (admin_geral e admin)
        const hasAdminPermission = userProfile === 'admin_geral' || userProfile === 'admin';

        return (
            <ul className="list">
                {motoristas.map(motorista => (
                    <li key={motorista.id} className="list-item">
                        <div className="list-item-content">
                            <strong>{motorista.nome}</strong>
                            <span>CNH: {motorista.cnh_numero || 'Não informada'} | Categoria: {motorista.categoria_cnh}</span>
                            <span>Telefone: {motorista.telefone || 'Não informado'}</span>
                        </div>
                        <div className="list-item-actions">
                            <button onClick={() => handleOpenViewModal(motorista.id)} className="action-button view">Visualizar</button>
                            {hasAdminPermission && (
                                <>
                                    <button onClick={() => handleOpenEditModal(motorista)} className="action-button edit">Editar</button>
                                    <button onClick={() => handleDelete(motorista.id)} className="action-button delete">Excluir</button>
                                </>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        );
    };

    // CORREÇÃO AQUI: Criamos uma variável de controle específica para Importação/Exportação
    const canImportExport = userProfile === 'admin_geral';

    return (
        <div className="page-container">
            <div className="header-container">
                <button onClick={() => navigate(-1)} className="back-button-new">
                    <FaArrowLeft /> Voltar
                </button>
                <h1 className="page-header">Cadastro de Motoristas</h1>
                <div className="action-buttons-group">
                    {/* CORREÇÃO APLICADA AQUI: Apenas 'admin_geral' pode ver os botões de Modelo, Importar e Exportar */}
                    {canImportExport && (
                        <>
                            <div className="dropdown">
                                <button className="action-button download-template"><FaDownload /> Modelo</button>
                                <div className="dropdown-content">
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadTemplate('csv'); }}>Baixar .csv</a>
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadTemplate('xlsx'); }}>Baixar .xlsx</a>
                                </div>
                            </div>
                            
                            <button onClick={() => fileInputRef.current.click()} className="action-button import" disabled={isImporting}>
                                <FaFileImport /> {isImporting ? 'Importando...' : 'Importar'}
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleImport} 
                                style={{ display: 'none' }} 
                                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                            />

                            <div className="dropdown">
                                <button className="action-button export"><FaFileExport /> Exportar</button>
                                <div className="dropdown-content">
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleExport('csv'); }}>Exportar .csv</a>
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleExport('xlsx'); }}>Exportar .xlsx</a>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="page-grid">
                <div className="form-column">
                    <div className="card">
                        <h3 className="card-title"><FaUserPlus /> Adicionar Novo Motorista</h3>
                        <form onSubmit={handleAddSubmit}>
                            <div className="form-group"><label>Nome</label><input type="text" name="nome" value={formData.nome} onChange={handleInputChange} required /></div>
                            <div className="form-group"><label>CNH</label><input type="text" name="cnh_numero" value={formData.cnh_numero} onChange={handleInputChange} /></div>
                            <div className="form-group"><label>Categoria CNH</label><select name="categoria_cnh" value={formData.categoria_cnh} onChange={handleInputChange} required><option value="">Selecione...</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option><option value="E">E</option><option value="A/B">A/B</option><option value="A/C">A/C</option><option value="A/D">A/D</option><option value="A/E">A/E</option></select></div>
                            <div className="form-group"><label>Telefone</label><input type="text" name="telefone" value={formData.telefone} onChange={handleInputChange} /></div>
                            <div className="form-actions"><button type="submit" className="submit-button">Cadastrar Motorista</button></div>
                        </form>
                    </div>
                </div>

                <div className="list-column">
                    <div className="card">
                        <h3 className="card-title"><FaSearch /> Buscar Motorista</h3>
                        <div className="form-group"><input type="text" placeholder="Digite nome ou CNH..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
                    </div>
                    <div className="card">
                        <h3 className="card-title"><FaUsers /> Motoristas Cadastrados</h3>
                        <div className="list-scroll-container">
                            {renderContent()}
                        </div>
                        {!isLoading && !error && pagination && pagination.total > 0 && (
                            <div className="pagination-controls">
                                <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page <= 1}>Anterior</button>
                                <span>Página {pagination.page} de {pagination.totalPages}</span>
                                <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>Próxima</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {isEditModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <button onClick={handleCloseEditModal} className="modal-close-button">&times;</button>
                        <h3>Editar Motorista</h3>
                        <form onSubmit={handleUpdateSubmit}>
                            <div className="form-group"><label>Nome</label><input type="text" name="nome" value={editingMotorista.nome} onChange={handleEditInputChange} required /></div>
                            <div className="form-group"><label>CNH</label><input type="text" name="cnh_numero" value={editingMotorista.cnh_numero} onChange={handleEditInputChange} /></div>
                            <div className="form-group"><label>Categoria CNH</label><select name="categoria_cnh" value={editingMotorista.categoria_cnh} onChange={handleEditInputChange} required><option value="">Selecione...</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option><option value="E">E</option><option value="A/B">A/B</option><option value="A/C">A/C</option><option value="A/D">A/D</option><option value="A/E">A/E</option></select></div>
                            <div className="form-group"><label>Telefone</label><input type="text" name="telefone" value={editingMotorista.telefone} onChange={handleEditInputChange} /></div>
                            <div className="form-actions"><button type="submit" className="submit-button">Salvar Alterações</button></div>
                        </form>
                    </div>
                </div>
            )}

            {isViewModalOpen && (
                <MotoristaDetalhesModal 
                    driverId={viewingDriverId} 
                    onClose={handleCloseViewModal} 
                />
            )}
            
            {isSuccessModalVisible && (
                <SuccessModal message={successMessage} onClose={() => setIsSuccessModalVisible(false)} />
            )}
        </div>
    );
}