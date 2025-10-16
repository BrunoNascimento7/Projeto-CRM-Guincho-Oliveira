import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import 'react-tabs/style/react-tabs.css';
import api from '../services/api';
import './FilaOrdens.css';
import { useDataRefresher } from '../hooks/useDataRefresher';

// Componente para o ícone de clipe (SVG)
const ClipIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
    </svg>
);

export default function FilaOrdens({ user }) {
    const navigate = useNavigate();
    const { refreshKey, refreshData } = useDataRefresher();
    const [ordens, setOrdens] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [motoristas, setMotoristas] = useState([]);
    const [veiculos, setVeiculos] = useState([]);
    const [selectedTab, setSelectedTab] = useState('Na Fila');
    const [isOSModalOpen, setIsOSModalOpen] = useState(false);
    const [selectedOS, setSelectedOS] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [filterData, setFilterData] = useState({ motorista_id: '', data_criacao: '', data_resolucao: '' });
    
    const [notas, setNotas] = useState([]);
    const [novaNota, setNovaNota] = useState('');
    const [timer, setTimer] = useState({ text: '', color: '#000' });

    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
    const [rescheduleDateTime, setRescheduleDateTime] = useState('');
    const fileInputRef = useRef(null); 

    const statusOptions = ['Na Fila', 'Agendado', 'Em Andamento', 'Concluído', 'Cancelado', 'Lançamento Excluído'];

    const fetchOrdens = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'Authorization': `Bearer ${token}` } };
            // CORREÇÃO APLICADA
            const ordensRes = await api.get('/api/ordens', config);
            setOrdens(ordensRes.data);
        } catch (error) {
            console.error('Erro ao buscar ordens:', error);
        }
    }, []);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { 'Authorization': `Bearer ${token}` } };
                
                const [ordensRes, clientesRes, motoristasRes, veiculosRes] = await Promise.all([
                    api.get('/api/ordens', config),
                    api.get('/api/clients', config),    // <-- URL CORRIGIDA
                    api.get('/api/drivers', config),    // <-- URL CORRIGIDA
                    api.get('/api/vehicles', config)    // <-- URL CORRIGIDA
                ]);
                
                // --- TRATAMENTO CORRETO PARA CADA RESPOSTA ---

                // 'ordensRes.data' já é o array
                setOrdens(ordensRes.data || []); 
                
                // Para os outros, o array está dentro de 'res.data.data'
                setClientes(clientesRes.data.data || []); 
                setMotoristas(motoristasRes.data.data || []);
                setVeiculos(veiculosRes.data.data || []);

            } catch (error) {
                console.error('Erro ao buscar dados iniciais:', error);
                // Define como arrays vazios em caso de erro para não quebrar a tela
                setOrdens([]);
                setClientes([]);
                setMotoristas([]);
                setVeiculos([]);
            }
        };
        fetchInitialData();
    }, [refreshKey]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            console.log("🔄 Buscando novas ordens (polling)...");
            fetchOrdens();
        }, 60000);

        return () => clearInterval(intervalId);
    }, [fetchOrdens]);

    useEffect(() => {
        if (!selectedOS) return;
        if (selectedOS.status === 'Concluído' || selectedOS.status === 'Cancelado' || selectedOS.status === 'Lançamento Excluído') {
            setTimer({ text: 'Serviço Finalizado', color: '#6c757d' });
            return; 
        }
        let interval;
        const formatTime = (ms) => {
            const totalSeconds = Math.floor(Math.abs(ms) / 1000);
            const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const seconds = String(totalSeconds % 60).padStart(2, '0');
            return `${hours}:${minutes}:${seconds}`;
        };
        const updateTimer = () => {
            const now = new Date().getTime();
            const targetTime = new Date(selectedOS.data_criacao).getTime();
            const difference = targetTime - now;
            if (difference > 0) {
                setTimer({ text: `Faltam para o atendimento: ${formatTime(difference)}`, color: '#007bff' });
            } else {
                if (selectedOS.status === 'Em Andamento') {
                    setTimer({ text: `Em andamento há: ${formatTime(difference)}`, color: '#17a2b8' });
                } else {
                    setTimer({ text: `Atrasado por: ${formatTime(difference)}`, color: '#dc3545' });
                }
            }
        };
        updateTimer();
        interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [selectedOS]);

    async function fetchNotas(os_id) {
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'Authorization': `Bearer ${token}` } };
            // CORREÇÃO APLICADA
            const res = await api.get(`/api/ordens/${os_id}/notas`, config);
            setNotas(res.data);
        } catch (error) {
            console.error('Erro ao buscar notas:', error);
        }
    }

    function handleOpenOSModal(os) {
        setSelectedOS(os);
        fetchNotas(os.id);
        setIsOSModalOpen(true);
    }

    function handleCloseOSModal() {
        setIsOSModalOpen(false);
        setSelectedOS(null);
        setNovaNota('');
    }
    
    async function handleStatusChange(newStatus) {
        if (newStatus === 'Agendado') {
            setIsRescheduleModalOpen(true);
            return;
        }

        if (window.confirm(`Tem certeza que deseja alterar o status para "${newStatus}"?`)) {
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { 'Authorization': `Bearer ${token}` } };
                // CORREÇÃO APLICADA
                await api.put(`/api/ordens/${selectedOS.id}/status`, { status: newStatus }, config);
                
                alert(`Status da OS #${selectedOS.id} atualizado para "${newStatus}"!`);
                if (newStatus === 'Concluído') {
                    alert('Lançamento de receita criado no financeiro automaticamente! ✨');
                }
                
                refreshData();
                handleCloseOSModal();
            } catch (error) {
                const errorMessage = error.response?.data?.error || 'Erro ao atualizar o status da OS.';
                alert(errorMessage);
            }
        }
    }
    
    async function handleRescheduleSubmit() {
        if (!rescheduleDateTime) {
            alert('Por favor, selecione uma data e hora.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'Authorization': `Bearer ${token}` } };
            // CORREÇÃO APLICADA
            await api.put(`/api/ordens/${selectedOS.id}/reagendar`, { novaDataHora: rescheduleDateTime }, config);

            alert(`OS #${selectedOS.id} reagendada com sucesso!`);
            
            refreshData();
            setIsRescheduleModalOpen(false);
            setRescheduleDateTime('');
            handleCloseOSModal();
        } catch (error) {
            const errorMessage = error.response?.data?.error || 'Erro ao reagendar a OS.';
            alert(errorMessage);
        }
    }

    async function handleExcluirOS(osId) {
        if (window.confirm('Tem certeza que deseja excluir esta OS? Esta ação também excluirá o lançamento financeiro associado, se houver.')) {
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { 'Authorization': `Bearer ${token}` } };
                // CORREÇÃO APLICADA
                await api.delete(`/api/ordens/${osId}`, config);
                alert(`OS #${osId} excluída com sucesso!`);
                
                refreshData();
                
            } catch (error) {
                const errorMessage = error.response?.data?.error || 'Erro ao excluir a OS.';
                alert(errorMessage);
            }
        }
    }

    async function handleFaturarOS() {
        if (window.confirm(`Tem certeza que deseja faturar esta OS? O valor de R$ ${selectedOS.valor.toFixed(2)} será registrado como receita.`)) {
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { 'Authorization': `Bearer ${token}` } };
                // ESTA JÁ ESTAVA CORRETA
                await api.post(`/api/ordens/${selectedOS.id}/faturar`, {}, config);
                alert('OS faturada com sucesso! A receita foi registrada.');
                refreshData();
                handleCloseOSModal();
            } catch (error) {
                const errorMessage = error.response?.data?.error || 'Erro ao faturar a OS.';
                alert(errorMessage);
            }
        }
    }

    const renderActionButtons = () => {
        if (!selectedOS) return null;
        const status = selectedOS.status;
        switch (status) {
            case 'Na Fila':
                return (
                    <>
                        <button onClick={() => handleStatusChange('Em Andamento')} className="action-button-iniciar">Iniciar Atendimento</button>
                        <button onClick={() => handleStatusChange('Agendado')} className="action-button-agendar">Agendar</button>
                        <button onClick={() => handleStatusChange('Cancelado')} className="action-button-cancelar">Cancelar OS</button>
                    </>
                );
            case 'Agendado':
                return (<><button onClick={() => handleStatusChange('Em Andamento')} className="action-button-iniciar">Iniciar Atendimento</button><button onClick={() => handleStatusChange('Cancelado')} className="action-button-cancelar">Cancelar OS</button></>);
            case 'Em Andamento':
                return (<><button onClick={() => handleStatusChange('Agendado')} className="action-button-agendar">Reagendar</button><button onClick={() => handleStatusChange('Concluído')} className="action-button-finalizar">Finalizar Serviço</button></>);
            case 'Concluído':
                if (!selectedOS.faturada_em) {
                    return (
                        <button onClick={() => handleFaturarOS()} className="action-button-faturar">
                            Faturar OS
                        </button>
                    );
                }
                return <p className="status-final-text">Esta OS foi concluída e faturada.</p>;
            case 'Cancelado':
            case 'Lançamento Excluído':
                return <p className="status-final-text">Esta OS foi finalizada e não pode ser alterada.</p>;
            default:
                return null;
        }
    };

    async function handleAddNota() {
        if (novaNota.trim() === '') return;
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'Authorization': `Bearer ${token}` } };
            // CORREÇÃO APLICADA
            await api.post(`/api/ordens/${selectedOS.id}/notas`, { autor: user.nome || "Usuário", nota: novaNota }, config);
            setNovaNota('');
            fetchNotas(selectedOS.id);
        } catch (error) {
            alert('Erro ao adicionar a nota.');
        }
    }

    const handleAttachmentClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = async () => {
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { 'Authorization': `Bearer ${token}` } };
                const payload = {
                    autor: user.nome || "Usuário",
                    fileName: file.name,
                    fileData: reader.result
                };
                // ROTA SEM /api NO SERVIDOR, MANTIDA COMO ESTÁ
                await api.post(`/ordens/${selectedOS.id}/anexos`, payload, config);
                alert('Anexo enviado com sucesso!');
                fetchNotas(selectedOS.id);
            } catch (error) {
                alert('Erro ao enviar o anexo.');
            }
        };
    };

    const handleFilterChange = (e) => setFilterData(p => ({ ...p, [e.target.name]: e.target.value }));
    const handleApplyFilters = () => setIsFilterModalOpen(false);
    const handleClearFilters = () => {
        setFilterData({ motorista_id: '', data_criacao: '', data_resolucao: '' });
        setIsFilterModalOpen(false);
    }
    
    const ordensFiltradas = useMemo(() => {
        let filtered = ordens.filter(os => os.status === selectedTab);
        if (searchQuery) {
            const searchLower = searchQuery.toLowerCase();
            filtered = filtered.filter(os => {
                const clienteNome = clientes.find(c => c.id === os.cliente_id)?.nome.toLowerCase() || '';
                const motoristaNome = motoristas.find(m => m.id === os.motorista_id)?.nome.toLowerCase() || '';
                return (
                    os.id.toString().includes(searchLower) ||
                    os.descricao.toLowerCase().includes(searchLower) ||
                    os.local_atendimento.toLowerCase().includes(searchLower) ||
                    clienteNome.includes(searchLower) ||
                    motoristaNome.includes(searchLower)
                );
            });
        }
        if (filterData.motorista_id) filtered = filtered.filter(os => os.motorista_id === parseInt(filterData.motorista_id));
        if (filterData.data_criacao) filtered = filtered.filter(os => new Date(os.data_criacao).toISOString().split('T')[0] === filterData.data_criacao);
        if (filterData.data_resolucao) filtered = filtered.filter(os => os.data_resolucao && new Date(os.data_resolucao).toISOString().split('T')[0] === filterData.data_resolucao);
        return filtered;
    }, [ordens, selectedTab, searchQuery, filterData, clientes, motoristas]);

    return (
        <div className="fila-container">
            <button onClick={() => navigate(-1)} className="back-button">Voltar</button>
            <h1 className="fila-header">Fila de Ordens de Serviço</h1>

            <div className="fila-controls">
                <input type="text" className="search-input" placeholder="Pesquisar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                <button className="filter-button" onClick={() => setIsFilterModalOpen(true)}>Filtros</button>
            </div>

            <div className="fila-tabs">
                {statusOptions.map(status => (
                    <button key={status} className={`tab-button ${selectedTab === status ? 'active' : ''}`} onClick={() => setSelectedTab(status)}>
                        {status} ({ordens.filter(os => os.status === status).length})
                    </button>
                ))}
            </div>

            <div className="fila-content-card">
                <h3>{selectedTab} ({ordensFiltradas.length})</h3>
                <ul className="ordem-list">
                    {ordensFiltradas.length > 0 ? (
                        ordensFiltradas.map(os => (
                            <li key={os.id} className={`status-${os.status.replace(/\s/g, '').toLowerCase()}`}>
                                <div onClick={() => handleOpenOSModal(os)} className="os-list-item-content">
                                    <strong>OS #{os.id}</strong> | Cliente: {clientes.find(c => c.id === os.cliente_id)?.nome || 'N/A'} | Status: {os.status}
                                </div>
                                {user && user.perfil === 'admin_geral' && (
                                    <button onClick={() => handleExcluirOS(os.id)} className="delete-os-button">Excluir</button>
                                )}
                            </li>
                        ))
                    ) : (
                        <li>Nenhuma ordem de serviço neste status.</li>
                    )}
                </ul>
            </div>

           {isOSModalOpen && selectedOS && (
                <div className="modal-overlay">
                    <div className="modal-content-os">
                        <button onClick={handleCloseOSModal} className="modal-close-button">&times;</button>
                        <div className="os-details-layout">
                            <div className="os-details-column">
                                <div className="os-info-grid">
                                    <h3>Detalhes da OS #{selectedOS.id}</h3>
                                    <p><strong>Status:</strong> {selectedOS.status}</p>
                                    <p><strong>Data/Hora:</strong> {new Date(selectedOS.data_criacao).toLocaleString('pt-BR')}</p>
                                    <p><strong>Cliente:</strong> {clientes.find(c => c.id === selectedOS.cliente_id)?.nome || 'N/A'}</p>
                                    <p><strong>Motorista:</strong> {motoristas.find(m => m.id === selectedOS.motorista_id)?.nome || 'N/A'}</p>
                                    <p><strong>Veículo:</strong> {veiculos.find(v => v.id === selectedOS.veiculo_id)?.placa || 'N/A'}</p>
                                    <p><strong>Local:</strong> {selectedOS.local_atendimento}</p>
                                    <p><strong>Descrição:</strong> {selectedOS.descricao}</p>
                                    <p><strong>Valor:</strong> R$ {selectedOS.valor?.toFixed(2) || '0.00'}</p>
                                </div>
                                <div className="os-timer-display" style={{ color: timer.color }}>
                                    <p>{timer.text}</p>
                                </div>
                            </div>
                            
                            <div className="os-notes-column">
                                <h3>Notas e Interações</h3>
                                <div className="chat-messages">
                                    {notas.length > 0 ? (
                                        notas.map(n => (
                                            <div key={n.id} className="chat-bubble">
                                                <p><strong>{n.autor}</strong>: {n.nota}</p>
                                                {n.tipo === 'anexo' && (
                                                    <a href={n.url_anexo} target="_blank" rel="noopener noreferrer" className="attachment-link">
                                                        Ver Anexo: {n.nome_anexo}
                                                    </a>
                                                )}
                                                <span>{new Date(n.data_criacao).toLocaleString('pt-BR')}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p>Nenhuma nota ou anexo adicionado ainda.</p>
                                    )}
                                </div>
                                
                                {selectedOS.status !== 'Concluído' && selectedOS.status !== 'Cancelado' && selectedOS.status !== 'Lançamento Excluído' && (
                                    <div className="chat-form">
                                        <textarea placeholder="Adicione uma nota..." value={novaNota} onChange={(e) => setNovaNota(e.target.value)}></textarea>
                                        <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
                                        <button onClick={handleAttachmentClick} className="attach-button"><ClipIcon /></button>
                                        <button onClick={handleAddNota} className="add-note-button">+</button>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="os-footer-actions">
                            {renderActionButtons()}
                        </div>
                    </div>
                </div>
            )}

            {isRescheduleModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <button onClick={() => setIsRescheduleModalOpen(false)} className="modal-close-button">&times;</button>
                        <h3>Reagendar OS #{selectedOS.id}</h3>
                        <div className="form-group">
                            <label htmlFor="rescheduleDateTime">Nova Data e Hora:</label>
                            <input 
                                type="datetime-local" 
                                id="rescheduleDateTime"
                                value={rescheduleDateTime}
                                onChange={(e) => setRescheduleDateTime(e.target.value)}
                                className="reschedule-input"
                            />
                        </div>
                        <div className="form-group-button">
                            <button onClick={handleRescheduleSubmit} className="submit-button">Confirmar Agendamento</button>
                        </div>
                    </div>
                </div>
            )}

            {isFilterModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <button onClick={() => setIsFilterModalOpen(false)} className="modal-close-button">&times;</button>
                        <h3>Filtros Avançados</h3>
                        <form>
                            <div className="form-group">
                                <label>Motorista:</label>
                                <select name="motorista_id" value={filterData.motorista_id} onChange={handleFilterChange}>
                                    {/* CORREÇÃO APLICADA: Adicionada key única para a opção "Todos" (Linha 427) */}
                                    <option key="all_motoristas" value="">Todos</option>
                                    {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                </select>
                            </div>
                            <div className="form-group"><label>Data de Criação:</label><input type="date" name="data_criacao" value={filterData.data_criacao} onChange={handleFilterChange} /></div>
                            <div className="form-group"><label>Data de Resolução:</label><input type="date" name="data_resolucao" value={filterData.data_resolucao} onChange={handleFilterChange} /></div>
                            <div className="form-group-button"><button type="button" className="submit-button" onClick={handleApplyFilters}>Aplicar</button><button type="button" className="submit-button reset-button" onClick={handleClearFilters}>Limpar</button></div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}