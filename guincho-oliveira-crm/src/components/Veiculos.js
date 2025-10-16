import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Veiculos.css';
import * as XLSX from 'xlsx';

// Importando todos os componentes filhos necessários
import VeiculoCard from './VeiculoCard'; 
import VeiculoDetalhesModal from './VeiculoDetalhesModal';
import VeiculoEditModal from './VeiculoEditModal';
import SuccessModal from './SuccessModal';

// Ícones
import { FaTruck, FaPlus, FaSearch, FaFileCsv, FaDownload, FaFileExport, FaFileImport, FaArrowLeft } from 'react-icons/fa';

export default function Veiculos() {
    const navigate = useNavigate();

    // --- ESTADOS DO COMPONENTE ---
    const [veiculos, setVeiculos] = useState([]);
    const [motoristas, setMotoristas] = useState([]);
    const [pagination, setPagination] = useState({ currentPage: 1, total: 0, perPage: 10 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [userProfile, setUserProfile] = useState('admin_geral'); // SIMULADO
    
    const [searchQuery, setSearchQuery] = useState('');
    
    // Estados para controlar qual modal está aberto
    const [selectedVeiculo, setSelectedVeiculo] = useState(null); 
    const [editingVeiculo, setEditingVeiculo] = useState(null); 
    
    // Estados para formulário de adição e modais de feedback
    const [formData, setFormData] = useState({ placa: '', modelo: '', marca: '', ano: '', status: 'Disponível', motorista_id: '' });
    // isConsultingPlaca será usado como loading para o botão da lupa
    const [isConsultingPlaca, setIsConsultingPlaca] = useState(false); 
    const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    
    // Refs e Estados para Importação
    const fileInputRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    
    // --- FUNÇÕES DE API ---
    
    // (Restante das funções fetchUserData, fetchVeiculos, fetchMotoristas inalteradas)
    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const { data } = await api.get('/api/usuarios/me');
                setUserProfile(data.perfil);
            } catch (error) {
                console.error("Erro ao buscar dados do usuário:", error);
            }
        };
        fetchUserData();
    }, []);

    const fetchVeiculos = useCallback(async (page = 1) => {
        setIsLoading(true);
        setError(null);
        try {
            const params = { page, limit: pagination.perPage, query: searchQuery };
            const response = await api.get('/api/vehicles', { params });

            setVeiculos(response.data.data || []); 
            setPagination(prev => ({ ...prev, ...response.data.pagination }));

        } catch (err) {
            setError('Falha ao carregar a frota. Tente novamente mais tarde.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [pagination.perPage, searchQuery]);

    useEffect(() => {
        const timer = setTimeout(() => { fetchVeiculos(1); }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, fetchVeiculos]);

    useEffect(() => {
        const fetchMotoristas = async () => {
            try {
                const response = await api.get('/api/drivers', { params: { limit: 1000 } });
                setMotoristas(response.data.data || []);
            } catch (error) {
                console.error('Erro ao buscar motoristas:', error);
            }
        };
        fetchMotoristas();
    }, []);

    // --- HANDLERS (Funções de Ação) ---
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        const finalValue = name === 'placa' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : value;
        setFormData(prevState => ({ ...prevState, [name]: finalValue }));
    };

    // FUNÇÃO CORRIGIDA E DETALHADA PARA CONSULTA DE PLACA
    const handleConsultaPlaca = async (e) => {
        e.preventDefault(); 
        
        if (!formData.placa) {
            alert("Por favor, digite a placa para consultar.");
            return;
        }

        setIsConsultingPlaca(true);

        try {
            // Chamando o endpoint proxy criado no seu backend
            const response = await api.get(`/api/vehicles/consultar-placa?placa=${formData.placa}`); 
            
            // O backend retorna os dados mapeados em data
            const dadosVeiculo = response.data;
            
            // Atualiza os campos do formulário com os dados retornados
            setFormData(prevState => ({ 
                ...prevState, 
                marca: dadosVeiculo.marca,
                modelo: dadosVeiculo.modelo,
                ano: dadosVeiculo.ano, 
                // A placa já está no formData, não precisa ser atualizada
            }));

            alert(`Dados do veículo ${formData.placa} preenchidos com sucesso!`);

        } catch (error) {
            const msg = error.response?.data?.error || "Erro desconhecido ao consultar. Verifique o console.";
            alert(`Falha na consulta: ${msg}`);
            
            // Opcional: Limpar campos em caso de erro para evitar dados parciais
            setFormData(prevState => ({ 
                ...prevState, 
                marca: '',
                modelo: '',
                ano: '', 
            }));
        } finally {
            setIsConsultingPlaca(false);
        }
    };
    // FIM DA FUNÇÃO CORRIGIDA

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/api/vehicles', formData);
            setSuccessMessage('Veículo cadastrado com sucesso!');
            setIsSuccessModalVisible(true);
            setFormData({ placa: '', modelo: '', marca: '', ano: '', status: 'Disponível', motorista_id: '' });
            fetchVeiculos(1);
        } catch (error) {
            alert('Erro ao cadastrar veículo.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir este veículo?')) {
            try {
                await api.delete(`/api/vehicles/${id}`);
                setSuccessMessage('Veículo excluído com sucesso!');
                setIsSuccessModalVisible(true);
                fetchVeiculos(pagination.currentPage);
            } catch (error) {
                alert('Erro ao excluir veículo.');
            }
        }
    };
    
    // --- FUNÇÕES DE IMPORTAÇÃO E EXPORTAÇÃO (INALTERADAS) ---
    const handleExport = async (format) => {
        try {
            const response = await api.get(`/api/vehicles/export?format=${format}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `frota_exportada.${format}`); 
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error(`Erro ao exportar para ${format}:`, error);
            alert('Erro ao exportar frota. Verifique as permissões.');
        }
    };
    
    const handleDownloadTemplate = (format) => {
        const header = ["placa", "modelo", "marca", "ano", "status", "motorista_id"];
        const exampleRow = ["ABC1234", "ARGO", "FIAT", "2023", "Disponível", ""];
        const fileName = `modelo_importacao_veiculos.${format}`;

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
            XLSX.utils.book_append_sheet(workbook, worksheet, "Veiculos");
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
            const response = await api.post('/api/vehicles/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setSuccessMessage(response.data.message);
            setIsSuccessModalVisible(true);
            fetchVeiculos(1);
        } catch (error) {
            console.error("Erro ao importar veículos:", error);
            alert(`Erro na importação: ${error.response?.data?.error || 'Verifique o formato do arquivo.'}`);
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };
    
    const canImportExport = userProfile === 'admin_geral';


    return (
        <div className="page-container">
            <div className="header-container">
                 <button onClick={() => navigate(-1)} className="back-button-new">
                    <FaArrowLeft /> Voltar
                </button>
                <h1 className="page-header">Gestão de Frota</h1>
                <div className="action-buttons-group">
                    {canImportExport && (
                        <>
                            <div className="dropdown">
                                <button className="action-button btn-modelo"><FaDownload /> Modelo</button>
                                <div className="dropdown-content">
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadTemplate('csv'); }}>Baixar .csv</a>
                                    <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadTemplate('xlsx'); }}>Baixar .xlsx</a>
                                </div>
                            </div>
                            
                            <button onClick={() => fileInputRef.current.click()} className="action-button btn-importar" disabled={isImporting}>
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
                                <button className="action-button btn-exportar"><FaFileExport /> Exportar</button>
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
                {/* Coluna do Formulário de Adição */}
                <div className="form-column">
                    <div className="card">
                        <h3 className="card-title"><FaPlus /> Adicionar Novo Veículo</h3>
                        <form onSubmit={handleAddSubmit}>
                            <div className="form-group">
                               <label>Placa</label>
                               <div className="input-group">
                                    <input 
                                        type="text" 
                                        name="placa" 
                                        value={formData.placa} 
                                        onChange={handleInputChange} 
                                        required 
                                        maxLength="7" 
                                    />
                                    {/* BOTÃO DA LUPA - VINCULADO À FUNÇÃO DE CONSULTA */}
                                    <button 
                                        type="button" 
                                        className="consulta-button" 
                                        onClick={handleConsultaPlaca} 
                                        disabled={isConsultingPlaca}
                                    >
                                        {isConsultingPlaca ? '...' : <FaSearch />}
                                    </button>
                               </div>
                            </div>
                            <div className="form-group"><label>Marca</label><input type="text" name="marca" value={formData.marca} onChange={handleInputChange} required /></div>
                            <div className="form-group"><label>Modelo</label><input type="text" name="modelo" value={formData.modelo} onChange={handleInputChange} required /></div>
                            <div className="form-group"><label>Ano</label><input type="number" name="ano" value={formData.ano} onChange={handleInputChange} required /></div>
                            <div className="form-group"><label>Status</label><select name="status" value={formData.status} onChange={handleInputChange}><option value="Disponível">Disponível</option><option value="Em Serviço">Em Serviço</option><option value="Manutenção">Manutenção</option></select></div>
                            <div className="form-group"><label>Motorista Responsável</label><select name="motorista_id" value={formData.motorista_id} onChange={handleInputChange}><option value="">Nenhum</option>{motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></div>
                            <div className="form-actions"><button type="submit" className="submit-button">Cadastrar Veículo</button></div>
                        </form>
                    </div>
                </div>

                {/* Coluna da Lista de Veículos */}
                <div className="list-column">
                    <div className="card">
                        <h3 className="card-title"><FaSearch /> Buscar na Frota</h3>
                        <div className="form-group">
                            <input type="text" placeholder="Digite a placa, modelo ou marca..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                    </div>
                    
                    <div className="card">
                        <h3 className="card-title"><FaTruck /> Frota Cadastrada ({pagination.total})</h3>
                        <div className="list-container">
                            {isLoading ? (
                                <p>Carregando frota...</p>
                            ) : error ? (
                                <p className="error-message">{error}</p>
                            ) : (
                                veiculos.length > 0 ? (
                                    veiculos.map(veiculo => (
                                        <VeiculoCard 
                                            key={veiculo.id} 
                                            veiculo={veiculo}
                                            onViewDetails={() => setSelectedVeiculo(veiculo)}
                                            onEdit={() => setEditingVeiculo(veiculo)}
                                            onDelete={() => handleDelete(veiculo.id)}
                                        />
                                    ))
                                ) : (
                                    <p className="empty-list-message">Nenhum veículo encontrado.</p>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {selectedVeiculo && (
                <VeiculoDetalhesModal
                    veiculo={selectedVeiculo}
                    onClose={() => setSelectedVeiculo(null)}
                />
            )}

            {editingVeiculo && (
                <VeiculoEditModal
                    veiculo={editingVeiculo}
                    motoristas={motoristas}
                    onClose={() => setEditingVeiculo(null)}
                    onSave={() => {
                        setEditingVeiculo(null);
                        fetchVeiculos(pagination.currentPage); 
                    }}
                />
            )}

            {isSuccessModalVisible && (
                <SuccessModal message={successMessage} onClose={() => setIsSuccessModalVisible(false)} />
            )}
        </div>
    );
}