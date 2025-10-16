import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Clientes.css';
import { FaUserPlus, FaUsers, FaSearch, FaFileImport, FaFileExport, FaDownload, FaTruck, FaCalendarCheck, FaArrowLeft } from 'react-icons/fa';
import { format } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import * as XLSX from 'xlsx'; // Importação para gerar modelos XLSX no frontend
import ClienteDetalhesModal from '../components/ClienteDetalhesModal';

export default function Clientes() {
    const navigate = useNavigate();
    const [clientes, setClientes] = useState([]);
    const [formData, setFormData] = useState({ nome: '', telefone: '', email: '', endereco: '', cpf_cnpj: '' });
    const [editingCliente, setEditingCliente] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Estados de controle da página
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Estados para o modal de visualização
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [viewingClientId, setViewingClientId] = useState(null);

    // Estados de permissão e importação
    const fileInputRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    const [userProfile, setUserProfile] = useState(null);

    // Busca de dados e permissões
    const fetchUserData = async () => {
        try {
            const { data: userData } = await api.get('/api/usuarios/me');
            setUserProfile(userData.perfil);
        } catch (error) {
            console.error("Erro ao buscar dados do usuário:", error);
        }
    };
    
    const fetchClientes = async (page = 1) => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const response = await api.get('/api/clients', {
                headers: { 'Authorization': `Bearer ${token}` },
                params: { query: searchQuery, page, limit: 10 }
            });
            setClientes(response.data.data);
            setPagination(response.data.pagination);
        } catch (error) {
            console.error("Erro ao buscar clientes:", error);
            setError("Falha ao carregar clientes. Tente novamente mais tarde.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUserData();
    }, []);

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            fetchClientes(1); 
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);
    
    // Funções de manipulação do modal de VISUALIZAÇÃO
    const handleOpenViewModal = (id) => {
        setViewingClientId(id);
        setIsViewModalOpen(true);
    };

    const handleCloseViewModal = () => {
        setIsViewModalOpen(false);
        setViewingClientId(null);
    };

    // Funções de manipulação do modal de EDIÇÃO
    const handleOpenEditModal = (cliente) => {
        setEditingCliente(cliente);
        setIsEditModalOpen(true);
    };

    const handleCloseEditModal = () => {
        setIsEditModalOpen(false);
        setEditingCliente(null);
    };

    // Funções CRUD
    const handleDelete = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir este cliente?')) {
            try {
                await api.delete(`/api/clients/${id}`);
                alert('Cliente excluído com sucesso!');
                if (clientes.length === 1 && pagination.page > 1) {
                    fetchClientes(pagination.page - 1);
                } else {
                    fetchClientes(pagination.page);
                }
            } catch (error) {
                alert('Erro ao excluir cliente.');
            }
        }
    };

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/api/clients', formData);
            alert('Cliente cadastrado com sucesso!');
            setFormData({ nome: '', telefone: '', email: '', endereco: '', cpf_cnpj: '' });
            fetchClientes(1);
        } catch (error) {
            alert('Erro ao cadastrar cliente.');
        }
    };
    
    const handleUpdateSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/api/clients/${editingCliente.id}`, editingCliente);
            alert('Cliente atualizado com sucesso!');
            handleCloseEditModal();
            fetchClientes(pagination.page);
        } catch (error) {
            alert('Erro ao atualizar cliente.');
        }
    };
    
    const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    const handleEditInputChange = (e) => setEditingCliente({ ...editingCliente, [e.target.name]: e.target.value });

    // Funções de Importação/Exportação atualizadas
    const handleExport = async (format) => {
        try {
            const response = await api.get(`/api/clients/export?format=${format}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `clientes_exportados.${format}`); 
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error(`Erro ao exportar para ${format}:`, error);
            alert('Erro ao exportar clientes.');
        }
    };
    
    const handleDownloadTemplate = (format) => {
        const header = [ "nome", "telefone", "email", "endereco", "cpf_cnpj" ];
        const exampleRow = [ "João da Silva", "11987654321", "joao@exemplo.com.br", "Rua das Flores, 123", "123.456.789-00" ];
        const fileName = `modelo_importacao_clientes.${format}`;

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
            XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");
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
            await api.post('/api/clients/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            alert('Importação enviada! A lista será atualizada em breve.');
            fetchClientes(1);
        } catch (error) {
            alert(`Erro na importação: ${error.response?.data?.error || 'Erro desconhecido.'}`);
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
            fetchClientes(newPage);
        }
    };
    
    // Lógica de Renderização
    const renderContent = () => {
        if (isLoading) return <p className="list-state-message">Carregando clientes...</p>;
        if (error) return <p className="list-state-message error">{error}</p>;
        if (clientes.length === 0) return <p className="list-state-message">Nenhum cliente encontrado.</p>;

        const hasAdminPermission = userProfile === 'admin_geral' || userProfile === 'admin';

        return (
            <ul className="list">
                {clientes.map(cliente => (
                    <li key={cliente.id} className="client-card">
                        <div className="client-card-header">
                            <strong>{cliente.nome}</strong>
                            <div className="list-item-actions">
                                <button onClick={() => handleOpenViewModal(cliente.id)} className="action-button view">Visualizar</button>
                                {hasAdminPermission && (
                                    <>
                                        <button onClick={() => handleOpenEditModal(cliente)} className="action-button edit">Editar</button>
                                        <button onClick={() => handleDelete(cliente.id)} className="action-button delete">Excluir</button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="client-card-body">
                            <p><strong>CPF/CNPJ:</strong> {cliente.cpf_cnpj || 'Não informado'}</p>
                            <p><strong>Telefone:</strong> {cliente.telefone || 'Não informado'}</p>
                        </div>
                        <div className="client-card-footer">
                            <span><FaTruck /> {cliente.total_servicos || 0} serviços</span>
                            <span>
                                <FaCalendarCheck /> 
                                {cliente.ultimo_servico ? `Último: ${format(new Date(cliente.ultimo_servico), 'dd/MM/yyyy', { locale: ptBR })}` : 'Nenhum serviço'}
                            </span>
                        </div>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <div className="page-container">
            <div className="header-container">
                <button onClick={() => navigate(-1)} className="back-button-new">
                    <FaArrowLeft />
                    Voltar
                </button>

                <h1 className="page-header">Cadastro de Clientes</h1>

                <div className="action-buttons-group">
                    {(userProfile === 'admin_geral') && (
                        <>
                            <div className="dropdown">
                                <button className="action-button download-template">
                                    <FaDownload /> Modelo
                                </button>
                                <div className="dropdown-content">
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadTemplate('csv'); }}>Baixar .csv</a>
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadTemplate('xlsx'); }}>Baixar .xlsx</a>
                                </div>
                            </div>

                            <button onClick={() => fileInputRef.current.click()} className="action-button import" disabled={isImporting}>
                                <FaFileImport /> {isImporting ? 'Importando...' : 'Importar'}
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleImport} style={{ display: 'none' }} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />

                            <div className="dropdown">
                                <button className="action-button export">
                                    <FaFileExport /> Exportar
                                </button>
                                <div className="dropdown-content">
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleExport('csv'); }}>Exportar para .csv</a>
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleExport('xlsx'); }}>Exportar para .xlsx</a>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
            
            {/* O restante do seu JSX continua aqui... */}
            <div className="page-grid">
                {/* ... Coluna do Formulário ... */}
                <div className="form-column">
                    <div className="card">
                        <h3 className="card-title"><FaUserPlus /> Adicionar Novo Cliente</h3>
                        <form onSubmit={handleAddSubmit}>
                            <div className="form-group"><label>Nome</label><input type="text" name="nome" value={formData.nome} onChange={handleInputChange} required /></div>
                            <div className="form-group"><label>Telefone</label><input type="text" name="telefone" value={formData.telefone} onChange={handleInputChange} /></div>
                            <div className="form-group"><label>Email</label><input type="email" name="email" value={formData.email} onChange={handleInputChange} /></div>
                            <div className="form-group"><label>Endereço</label><input type="text" name="endereco" value={formData.endereco} onChange={handleInputChange} /></div>
                            <div className="form-group"><label>CPF/CNPJ</label><input type="text" name="cpf_cnpj" value={formData.cpf_cnpj} onChange={handleInputChange} required /></div>
                            <div className="form-actions"><button type="submit" className="submit-button">Cadastrar Cliente</button></div>
                        </form>
                    </div>
                </div>

                {/* ... Coluna da Lista ... */}
                <div className="list-column">
                    <div className="card">
                        <h3 className="card-title"><FaSearch /> Buscar Cliente</h3>
                        <div className="form-group"><input type="text" placeholder="Digite nome, CPF/CNPJ ou telefone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
                    </div>
                    <div className="card">
                        <h3 className="card-title"><FaUsers /> Clientes Cadastrados</h3>
                        <div className="list-scroll-container">
                            {renderContent()}
                        </div>
                        {!isLoading && !error && pagination.total > 0 && (
                            <div className="pagination-controls">
                                <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page <= 1}>
                                    Anterior
                                </button>
                                <span>Página {pagination.page} de {pagination.totalPages} ({pagination.total} clientes)</span>
                                <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>
                                    Próxima
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isEditModalOpen && editingCliente && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <button onClick={handleCloseEditModal} className="modal-close-button">&times;</button>
                        <h3>Editar Cliente</h3>
                        <form onSubmit={handleUpdateSubmit}>
                            <div className="form-group"><label>Nome</label><input type="text" name="nome" value={editingCliente.nome} onChange={handleEditInputChange} required /></div>
                            <div className="form-group"><label>Telefone</label><input type="text" name="telefone" value={editingCliente.telefone} onChange={handleEditInputChange} /></div>
                            <div className="form-group"><label>Email</label><input type="email" name="email" value={editingCliente.email} onChange={handleEditInputChange} /></div>
                            <div className="form-group"><label>Endereço</label><input type="text" name="endereco" value={editingCliente.endereco} onChange={handleEditInputChange} /></div>
                            <div className="form-group"><label>CPF/CNPJ</label><input type="text" name="cpf_cnpj" value={editingCliente.cpf_cnpj} onChange={handleEditInputChange} required /></div>
                            <div className="form-actions"><button type="submit" className="submit-button">Salvar Alterações</button></div>
                        </form>
                    </div>
                </div>
            )}

            {isViewModalOpen && (
                <ClienteDetalhesModal 
                    clienteId={viewingClientId} 
                    onClose={handleCloseViewModal} 
                />
            )}
        </div>
    );
}