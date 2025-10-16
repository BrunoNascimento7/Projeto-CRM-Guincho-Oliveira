import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Usuarios.css';
import { useAuth } from '../hooks/useAuth';
import { 
    FaPlusCircle, FaKey, FaUserCheck, FaUserSlash, FaUserPlus, 
    FaFileDownload, FaFileUpload, FaFileExport, FaEdit, FaSignOutAlt, 
    FaLock, FaUnlock, FaTrash, FaUsersSlash 
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';

// ===============================================
// ===   SUB-COMPONENTES                     ===
// ===============================================
const LicenseStatus = ({ usuario }) => {
    if (usuario.licenca_chave_id) {
        return (
            <div className="license-status-cell allocated" title="Este usuário possui uma licença.">
                <FaUserCheck />
                <span>Licenciado</span>
            </div>
        );
    }
    return (
        <div className="license-status-cell not-allocated" title="Este usuário não possui uma licença.">
            <FaUserSlash />
            <span>Não Licenciado</span>
        </div>
    );
};

const LicenseManagementTab = ({ keys, users, onAllocate, onDeallocate }) => {
    const unassignedUsers = users.filter(u => !u.licenca_chave_id);
    const [selectedUsers, setSelectedUsers] = useState({});

    const handleAllocateClick = (keyId) => {
        const userIdToAssign = selectedUsers[keyId];
        if (!userIdToAssign) {
            toast.warn("Selecione um usuário para alocar a licença.");
            return;
        }
        onAllocate(userIdToAssign, keyId);
        setSelectedUsers(prev => ({ ...prev, [keyId]: '' }));
    };

    const handleSelectChange = (keyId, userId) => {
        setSelectedUsers(prev => ({ ...prev, [keyId]: userId }));
    };

    return (
        <div className="license-management-tab">
            {keys.map(key => (
                <div key={key.id} className={`license-card ${key.usuario_id_alocado ? 'allocated' : 'available'}`}>
                    <div className="license-card-header">
                        <FaKey />
                        <h4>Licença #{String(key.id).padStart(6, '0')}</h4>
                    </div>
                    <div className="license-card-body">
                        {key.usuario_id_alocado ? (
                            <div className="user-info-allocated">
                                <img src={key.usuario_foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(key.usuario_nome)}&background=101C5D&color=fff`} alt={key.usuario_nome} />
                                <div className="user-details">
                                    <strong>{key.usuario_nome}</strong>
                                    <span>Alocado em: {new Date(key.data_alocacao).toLocaleDateString('pt-BR')}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="license-available-info">
                                <p>Esta licença está disponível para uso.</p>
                                <div className="allocation-form">
                                    <select value={selectedUsers[key.id] || ''} onChange={e => handleSelectChange(key.id, e.target.value)}>
                                        <option value="">Selecione um usuário</option>
                                        {unassignedUsers.map(u => (<option key={u.id} value={u.id}>{u.nome}</option>))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="license-card-footer">
                        {key.usuario_id_alocado ? (
                            <button className="deallocate-btn" onClick={() => onDeallocate(key.id)}>Desalocar</button>
                        ) : (
                            <button className="allocate-btn" onClick={() => handleAllocateClick(key.id)} disabled={unassignedUsers.length === 0 || !selectedUsers[key.id]}>Alocar Licença</button>
                        )}
                    </div>
                </div>
            ))}
            {keys.length === 0 && <p className="no-content-message">Nenhuma licença encontrada para este cliente.</p>}
        </div>
    );
};

const LicenseRequestModal = ({ currentLicenses, clientName, onClose, onSubmit }) => {
    const [requestedAmount, setRequestedAmount] = useState(5);
    const [justification, setJustification] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onSubmit(requestedAmount, justification); };
    return (
        <div className="modal-overlay"><div className="modal-content"><button onClick={onClose} className="modal-close-button">&times;</button><h3>Solicitar Mais Licenças</h3><p>Cliente: <strong>{clientName}</strong></p><p>Licenças Atuais: <strong>{currentLicenses}</strong></p><form onSubmit={handleSubmit}><div className="form-group"><label>Quantas licenças ADICIONAIS você precisa?</label><input type="number" min="1" value={requestedAmount} onChange={(e) => setRequestedAmount(parseInt(e.target.value, 10))} required /></div><div className="form-group"><label>Justificativa (Opcional):</label><textarea rows="3" value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Ex: Contratação de novos funcionários..."></textarea></div><button type="submit" className="submit-button">Enviar Solicitação</button></form></div></div>
    );
};

function SimpleEditModal({ usuario, onClose, onUpdate }) {
    const [editData, setEditData] = useState(usuario);
    const handleChange = (e) => setEditData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            // ADICIONADO CAMPO TELEFONE AO PAYLOAD
            const payload = { nome: editData.nome, email: editData.email, perfil: editData.perfil, telefone: editData.telefone };
            await api.put(`/api/usuarios/${editData.id}`, payload);
            toast.success('Usuário atualizado com sucesso!');
            onUpdate();
            onClose();
        } catch (error) {
            toast.error(`Erro ao atualizar usuário: ${error.response?.data?.error || 'Tente novamente.'}`);
        }
    };
    const perfisDisponiveis = { 'operacional': 'Operacional', 'financeiro': 'Financeiro', 'conhecimento_manager': 'Gerente de Conhecimento', 'admin': 'Administrador' };
    return (
        <div className="modal-overlay"><div className="modal-content"><button onClick={onClose} className="modal-close-button">&times;</button><h3>Editar Usuário</h3><form onSubmit={handleUpdate}><div className="form-group"><label>Nome:</label><input type="text" name="nome" value={editData.nome} onChange={handleChange} required /></div><div className="form-group"><label>Email:</label><input type="email" name="email" value={editData.email} onChange={handleChange} required /></div>{/* ADICIONADO CAMPO TELEFONE NO FORMULÁRIO DE EDIÇÃO SIMPLES */}<div className="form-group"><label>Telefone:</label><input type="tel" name="telefone" value={editData.telefone || ''} onChange={handleChange} placeholder="(XX) XXXXX-XXXX" /></div><div className="form-group"><label>Perfil:</label><select name="perfil" value={editData.perfil} onChange={handleChange}>{Object.entries(perfisDisponiveis).map(([valor, texto]) => (<option key={valor} value={valor}>{texto}</option>))}</select></div><p className="modal-note">A senha e outros dados cadastrais não podem ser alterados aqui.</p><button type="submit" className="submit-button">Salvar Alterações</button></form></div></div>
    );
}

function EditModalAdminGeral({ usuarioId, onClose, onUpdate, allClients }) {
    const [activeTab, setActiveTab] = useState('dados');
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    useEffect(() => {
        const fetchUserData = async () => {
            setLoading(true);
            try {
                const response = await api.get(`/api/usuarios/${usuarioId}`);
                setUserData({ ...response.data, regras_acesso: response.data.regras_acesso || { dias: [], inicio: '08:00', fim: '18:00' } });
            } catch (error) {
                toast.error('Falha ao carregar dados do usuário.');
            } finally {
                setLoading(false);
            }
        };
        fetchUserData();
    }, [usuarioId]);
    const handleChange = (e) => setUserData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleRegrasChange = (e) => setUserData(prev => ({ ...prev, regras_acesso: { ...prev.regras_acesso, [e.target.name]: e.target.value } }));
    const handleDiaChange = (diaIndex) => {
        const dias = userData.regras_acesso.dias || [];
        const newDias = dias.includes(diaIndex) ? dias.filter(d => d !== diaIndex) : [...dias, diaIndex].sort();
        setUserData(prev => ({ ...prev, regras_acesso: { ...prev.regras_acesso, dias: newDias } }));
    };
    const saveDados = async () => {
        try {
            const { regras_acesso, ...dadosParaSalvar } = userData;
            await api.put(`/api/usuarios/${userData.id}`, dadosParaSalvar);
            toast.success('Dados cadastrais atualizados com sucesso!');
            onUpdate();
            onClose();
        } catch (error) { toast.error('Erro ao salvar dados cadastrais.'); }
    };
    const saveRegras = async () => {
        try {
            await api.put(`/api/usuarios/${userData.id}/regras-acesso`, { regras: userData.regras_acesso });
            toast.success('Regras de acesso atualizadas com sucesso!');
            onUpdate();
            onClose();
        } catch (error) { toast.error('Erro ao salvar regras de acesso.'); }
    };
    const savePassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) { toast.warn('As senhas não coincidem!'); return; }
        if (newPassword.length < 6) { toast.warn('A senha deve ter no mínimo 6 caracteres.'); return; }
        try {
            await api.put(`/api/usuarios/${userData.id}/password`, { newPassword });
            toast.success('Senha alterada com sucesso!');
            onUpdate();
            onClose();
        } catch (error) { toast.error('Erro ao alterar senha.'); }
    };
    if (loading || !userData) return <div className="modal-overlay"><div className="modal-content">Carregando...</div></div>;
    return (
        <div className="modal-overlay"><div className="modal-content modal-lg"><button onClick={onClose} className="modal-close-button">&times;</button><h3>Editando: {userData.nome}</h3><div className="modal-tabs"><button onClick={() => setActiveTab('dados')} className={activeTab === 'dados' ? 'active' : ''}>Dados Cadastrais</button><button onClick={() => setActiveTab('regras')} className={activeTab === 'regras' ? 'active' : ''}>Regras de Acesso</button><button onClick={() => setActiveTab('senha')} className={activeTab === 'senha' ? 'active' : ''}>Alterar Senha</button></div>{activeTab === 'dados' && (<div className="tab-content"><div className="form-grid"><div className="form-group"><label>Nome:</label><input type="text" name="nome" value={userData.nome} onChange={handleChange} /></div><div className="form-group"><label>Email:</label><input type="email" name="email" value={userData.email} onChange={handleChange} /></div>{/* ADICIONADO CAMPO TELEFONE NO FORMULÁRIO DE EDIÇÃO ADMIN GERAL */}<div className="form-group"><label>Telefone:</label><input type="tel" name="telefone" value={userData.telefone || ''} onChange={handleChange} /></div><div className="form-group"><label>Perfil:</label><select name="perfil" value={userData.perfil} onChange={handleChange}><option value="operacional">Operacional</option><option value="financeiro">Financeiro</option><option value="conhecimento_manager">Gerente de Conhecimento</option><option value="admin">Administrador</option></select></div><div className="form-group"><label>Cliente (Empresa):</label><select name="cliente_id" value={userData.cliente_id || ''} onChange={handleChange}><option value="">-- Sem Cliente --</option>{allClients.map(client => (<option key={client.id} value={client.id}>{client.nome_empresa}</option>))}</select></div><div className="form-group"><label>Matrícula:</label><input type="text" name="matricula" value={userData.matricula || ''} onChange={handleChange} /></div><div className="form-group"><label>CPF:</label><input type="text" name="cpf" value={userData.cpf || ''} onChange={handleChange} /></div><div className="form-group"><label>Filial:</label><input type="text" name="filial" value={userData.filial || ''} onChange={handleChange} /></div><div className="form-group"><label>Cargo:</label><input type="text" name="cargo" value={userData.cargo || ''} onChange={handleChange} /></div><div className="form-group full-width"><label>Centro de Custo:</label><input type="text" name="centroDeCusto" value={userData.centroDeCusto || ''} onChange={handleChange} /></div></div><button onClick={saveDados} className="submit-button">Salvar Dados Cadastrais</button></div>)}{activeTab === 'regras' && (<div className="tab-content"><h4>Definir Dias e Horários de Acesso</h4><div className="dias-semana">{['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((dia, index) => (<div key={dia} className="dia-checkbox"><input type="checkbox" id={`dia-${index}`} checked={userData.regras_acesso.dias.includes(index)} onChange={() => handleDiaChange(index)} /><label htmlFor={`dia-${index}`}>{dia}</label></div>))}</div><div className="horarios"><div className="form-group"><label>Horário de Início:</label><input type="time" name="inicio" value={userData.regras_acesso.inicio} onChange={handleRegrasChange} /></div><div className="form-group"><label>Horário de Fim:</label><input type="time" name="fim" value={userData.regras_acesso.fim} onChange={handleRegrasChange} /></div></div><button onClick={saveRegras} className="submit-button">Salvar Regras de Acesso</button></div>)}{activeTab === 'senha' && (<div className="tab-content"><h4>Alterar Senha</h4><form onSubmit={savePassword}><div className="form-group"><label>Nova Senha:</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength="6" /></div><div className="form-group"><label>Confirme a Senha:</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength="6" /></div><button type="submit" className="submit-button">Salvar Nova Senha</button></form></div>)}</div></div>
    );
}


// ===============================================
// ===     COMPONENTE PRINCIPAL (ATUALIZADO)   ===
// ===============================================

export default function Usuarios() {
    const navigate = useNavigate();
    const { perfil: perfilLogado, id: userIdLogado } = useAuth();
    const [usuarios, setUsuarios] = useState([]);
    // ADICIONADO CAMPO TELEFONE AO ESTADO INICIAL DO FORMULÁRIO
    const [formData, setFormData] = useState({ nome: '', email: '', senha: '', telefone: '', perfil: 'operacional', matricula: '', cpf: '', filial: '', cargo: '', centroDeCusto: '', cliente_id: '' });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('usuarios');
    const [allClients, setAllClients] = useState([]);
    const [licenseInfo, setLicenseInfo] = useState({ used: 0, total: 0, clientName: '' });
    const [keysOverview, setKeysOverview] = useState([]);
    const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const importInputRef = useRef(null);
    const [selectedClientForKeys, setSelectedClientForKeys] = useState('');
    const [selectedUsers, setSelectedUsers] = useState([]);

    const licensesAvailable = licenseInfo.total > 0 ? licenseInfo.total - licenseInfo.used : 0;
    const limitReached = licensesAvailable <= 0;
    const canWrite = perfilLogado === 'admin_geral' || perfilLogado === 'admin';

    const fetchData = useCallback(async (query = '') => {
        try {
            const userResponse = await api.get('/api/usuarios', { params: { query } });
            setUsuarios(userResponse.data);
            if (perfilLogado === 'admin_geral' || perfilLogado === 'admin') {
                const clientsResponse = await api.get('/api/clientes-sistema/list');
                setAllClients(clientsResponse.data);
            }
            if (perfilLogado === 'admin') {
                const licenseStatusRes = await api.get('/api/licensing/status');
                setLicenseInfo(licenseStatusRes.data);
            }
        } catch (error) {
            console.error('Erro ao buscar dados:', error);
            if (error.response?.status !== 403) {
                toast.error('Não foi possível carregar os dados da página.');
            }
        }
    }, [perfilLogado]);

    useEffect(() => {
        fetchData(searchQuery);
    }, [searchQuery, fetchData]);

    useEffect(() => {
        const fetchKeysForClient = async () => {
            const targetClientId = perfilLogado === 'admin_geral' 
                ? selectedClientForKeys 
                : allClients.find(c => c.nome_empresa === licenseInfo.clientName)?.id;
            if (targetClientId) {
                try {
                    const { data } = await api.get(`/api/usuarios/licencas/cliente/${targetClientId}`);
                    setKeysOverview(data);
                } catch (error) {
                    toast.error("Falha ao buscar licenças do cliente.");
                    setKeysOverview([]);
                }
            } else if (perfilLogado === 'admin_geral') {
                setKeysOverview([]);
            }
        };
        fetchKeysForClient();
    }, [selectedClientForKeys, perfilLogado, licenseInfo.clientName, allClients]);

    const handleBulkAction = async (action) => {
        if (selectedUsers.length === 0) {
            toast.warn("Selecione pelo menos um usuário.");
            return;
        }

        let confirmationMessage = '';
        switch(action) {
            case 'block': confirmationMessage = `Tem certeza que deseja bloquear ${selectedUsers.length} usuário(s)?`; break;
            case 'unblock': confirmationMessage = `Tem certeza que deseja desbloquear ${selectedUsers.length} usuário(s)?`; break;
            case 'force_logout': confirmationMessage = `Tem certeza que deseja forçar o logoff de ${selectedUsers.length} usuário(s)?`; break;
            case 'delete': confirmationMessage = `ATENÇÃO: Tem certeza que deseja EXCLUIR ${selectedUsers.length} usuário(s)? Esta ação é irreversível.`; break;
            default: return;
        }
        
        if (window.confirm(confirmationMessage)) {
            try {
                await api.put('/api/usuarios/bulk-actions', { userIds: selectedUsers, action });
                toast.success("Ação em massa executada com sucesso!");
                setSelectedUsers([]);
                fetchData(searchQuery);
            } catch (error) {
                toast.error(error.response?.data?.error || "Falha ao executar ação em massa.");
            }
        }
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const allUserIds = usuarios
                .filter(u => u.perfil !== 'admin_geral')
                .map(u => u.id);
            setSelectedUsers(allUserIds);
        } else {
            setSelectedUsers([]);
        }
    };

    const handleUserSelect = (userId) => {
        setSelectedUsers(prev => 
            prev.includes(userId) 
                ? prev.filter(id => id !== userId) 
                : [...prev, userId]
        );
    };

    const handleAllocateLicense = async (usuario_id, chave_id) => {
        try {
            await api.put('/api/licensing/allocate', { usuario_id, chave_id });
            toast.success("Licença alocada com sucesso!");
            fetchData(searchQuery); // Re-fetch all data to update UI
        } catch (error) {
            toast.error(error.response?.data?.error || "Não foi possível alocar a licença.");
        }
    };

    const handleDeallocateLicense = async (chave_id) => {
        if (window.confirm("Tem certeza que deseja desalocar esta licença? O usuário perderá o status de licenciado.")) {
            try {
                await api.put('/api/licensing/deallocate', { chave_id });
                toast.info("Licença desalocada com sucesso!");
                fetchData(searchQuery); // Re-fetch all data to update UI
            } catch (error) {
                toast.error(error.response?.data?.error || "Não foi possível desalocar a licença.");
            }
        }
    };
    
    const handleRequestMoreLicenses = async (requestedAmount, justification) => {
        try {
            await api.post('/api/licensing/request', {
                licencas_solicitadas: requestedAmount,
                justificativa: justification
            });
            toast.success("Sua solicitação foi enviada para o administrador do sistema!");
            setIsLicenseModalOpen(false);
        } catch (error) {
            toast.error(error.response?.data?.error || "Não foi possível enviar a solicitação.");
        }
    };

    const handleInputChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    async function handleSubmit(e) {
        e.preventDefault();
        if (perfilLogado === 'admin_geral' && formData.perfil !== 'admin_geral' && !formData.cliente_id) {
            return toast.warn("Por favor, selecione um cliente para o novo usuário.");
        }
        if (perfilLogado === 'admin' && limitReached) {
            return toast.error("Limite de licenças atingido. Não é possível cadastrar novos usuários.");
        }
        try {
            const registerResponse = await api.post('/api/usuarios/register', formData);
            const newUserId = registerResponse.data.id;
            toast.success(`Usuário ${formData.nome} adicionado com sucesso!`);

            if (perfilLogado === 'admin' || (perfilLogado === 'admin_geral' && formData.perfil !== 'admin_geral')) {
                try {
                    const clienteIdDoNovoUsuario = perfilLogado === 'admin' 
                        ? allClients.find(c => c.nome_empresa === licenseInfo.clientName)?.id 
                        : formData.cliente_id;

                    const { data: availableKeys } = await api.get(`/api/licensing/available-keys-for-client/${clienteIdDoNovoUsuario}`);
                    
                    if (availableKeys.length > 0) {
                        const keyToAllocate = availableKeys[0];
                        await api.put('/api/licensing/allocate', {
                            usuario_id: newUserId,
                            chave_id: keyToAllocate.id
                        });
                        toast.info(`Licença #${String(keyToAllocate.id).padStart(6, '0')} alocada automaticamente para ${formData.nome}.`);
                    } else {
                        toast.warn(`Usuário criado, mas não há licenças livres para alocar automaticamente.`);
                    }
                } catch (allocError) {
                    console.error("Falha na alocação automática de licença:", allocError);
                    toast.warn("Usuário criado, mas não foi possível alocar uma licença automaticamente. Faça isso manualmente na aba 'Gerenciar Licenças'.");
                }
            }
            
            // ADICIONADO CAMPO TELEFONE AO RESET DO FORMULÁRIO
            setFormData({ nome: '', email: '', senha: '', telefone: '', perfil: 'operacional', matricula: '', cpf: '', filial: '', cargo: '', centroDeCusto: '', cliente_id: '' });
            fetchData(searchQuery);
        } catch (error) {
            toast.error(`Erro ao adicionar usuário: ${error.response?.data?.error || 'Tente novamente.'}`);
        }
    }

    const handleOpenEditModal = (usuario) => { setEditingUser(usuario); setIsEditModalOpen(true); };
    const handleCloseEditModal = () => { setIsEditModalOpen(false); setEditingUser(null); fetchData(searchQuery); };

    async function handleDelete(usuarioId) {
        if (window.confirm('Tem certeza que deseja excluir este usuário? Sua licença será liberada.')) {
            try {
                await api.delete(`/api/usuarios/${usuarioId}`);
                toast.success('Usuário excluído com sucesso!');
                fetchData(searchQuery);
            } catch (error) {
                toast.error(`Erro ao excluir usuário: ${error.response?.data?.error || 'Tente novamente.'}`);
            }
        }
    }

    async function handleToggleBlock(usuario) {
        const novoStatus = usuario.status === 'ativo' ? 'bloqueado' : 'ativo';
        const acao = novoStatus === 'ativo' ? 'desbloquear' : 'bloquear';
        if (window.confirm(`Tem certeza que deseja ${acao} o usuário ${usuario.nome}?`)) {
            try {
                await api.put(`/api/usuarios/${usuario.id}/status`, { status: novoStatus });
                toast.info(`Usuário ${acao} com sucesso!`);
                fetchData(searchQuery);
            } catch (error) {
                toast.error(`Erro ao ${acao} usuário: ${error.response?.data?.error || 'Tente novamente.'}`);
            }
        }
    }

    async function handleForceLogoff(usuarioId) {
        if (window.confirm('Tem certeza que deseja forçar o logoff deste usuário?')) {
            try {
                await api.post(`/api/usuarios/logout-force/${usuarioId}`);
                toast.warn('Logoff forçado com sucesso!');
            } catch (error) {
                toast.error(`Erro ao forçar logoff: ${error.response?.data?.error || 'Tente novamente.'}`);
            }
        }
    }

    const canTakeAction = (targetUser) => {
        if (!targetUser || targetUser.perfil === 'admin_geral' || targetUser.id === userIdLogado) return false;
        if (perfilLogado === 'admin_geral') return true;
        if (perfilLogado === 'admin') return !['admin_geral', 'admin'].includes(targetUser.perfil);
        return false;
    };

    const handleExport = () => {
        if (usuarios.length === 0) {
            toast.warn("Não há usuários para exportar.");
            return;
        }
        // ADICIONADO CAMPO TELEFONE AOS CABEÇALHOS DE EXPORTAÇÃO
        const headers = ["Nome", "Email", "Telefone", "Perfil", "Matrícula", "CPF", "Filial", "Cargo", "Centro de Custo", "Status"];
        // ADICIONADO CAMPO TELEFONE AOS DADOS DE EXPORTAÇÃO
        const dataToExport = usuarios.map(user => [ user.nome, user.email, user.telefone || '', user.perfil, user.matricula || '', user.cpf || '', user.filial || '', user.cargo || '', user.centroDeCusto || '', user.status ]);
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataToExport]);
        // ADICIONADA LARGURA PARA A NOVA COLUNA
        worksheet['!cols'] = [ { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 10 } ];
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuarios');
        XLSX.writeFile(workbook, `export_usuarios_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`);
    };

    const handleImport = () => {
        const targetClientId = perfilLogado === 'admin' ? allClients.find(c => c.nome_empresa === licenseInfo.clientName)?.id : formData.cliente_id;
        if (perfilLogado === 'admin_geral' && !targetClientId) {
            toast.warn("Por favor, selecione um cliente no formulário antes de importar.");
            return;
        }
        importInputRef.current.click();
    };

    const processImportFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                if (json.length === 0) {
                    toast.error("O arquivo de importação está vazio ou em formato inválido.");
                    return;
                }
                toast.info(`Importando ${json.length} usuários...`);
                const cliente_id = perfilLogado === 'admin' ? allClients.find(c => c.nome_empresa === licenseInfo.clientName)?.id : formData.cliente_id;
                const response = await api.post('/api/usuarios/import', { users: json, cliente_id });
                const { successCount, errorCount, errors } = response.data;
                if (errorCount > 0) {
                    toast.warn(`${successCount} usuários importados, mas ${errorCount} falharam. Verifique o console.`);
                    console.error("Erros de importação:", errors);
                } else {
                    toast.success(`${successCount} usuários importados com sucesso!`);
                }
                fetchData();
            } catch (error) {
                console.error(error);
                toast.error(error.response?.data?.error || "Ocorreu um erro ao processar o arquivo.");
            } finally {
                e.target.value = ''; 
            }
        };
        reader.readAsArrayBuffer(file);
    };
    
    const handleDownloadTemplate = () => {
        // ADICIONADO CAMPO TELEFONE AO MODELO
        const headers = [['Nome', 'Email', 'Telefone', 'Perfil', 'Matrícula', 'CPF', 'Filial', 'Cargo', 'Centro de Custo', 'Senha']];
        // ADICIONADO CAMPO TELEFONE AO EXEMPLO
        const exampleRow = [['João da Silva', 'joao.silva@email.com', '(11) 99999-8888', 'operacional', '12345', '111.222.333-44', 'Matriz', 'Operador', 'Custo-01', 'senhaSegura123']];
        const data = [...headers, ...exampleRow];
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        // ADICIONADA LARGURA PARA A NOVA COLUNA
        worksheet['!cols'] = [ { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 } ];
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo');
        XLSX.writeFile(workbook, 'modelo_importacao_usuarios.xlsx');
    };

    return (
        <div className="usuarios-container">
            <button onClick={() => navigate(-1)} className="back-button">Voltar</button>
            <h1 className="usuarios-header">Gerenciamento de Usuários</h1>
            <div className="usuarios-main-content">
                {canWrite && (
                    <div className="coluna-form">
                        <div className="usuario-form-card">
                            <h3><FaUserPlus /> Adicionar Novo Usuário</h3>
                            <div className="form-container">
                                {perfilLogado === 'admin' && limitReached && (<div className="form-disabled-overlay"><p>Limite de licenças atingido!</p><span>Para adicionar novos usuários, solicite mais licenças.</span><button onClick={() => setIsLicenseModalOpen(true)} className="request-license-button-overlay">Solicitar Agora</button></div>)}
                                <form onSubmit={handleSubmit}>
                                    <fieldset className="form-grid" disabled={perfilLogado === 'admin' && limitReached}>
                                        {perfilLogado === 'admin_geral' && (
                                            <div className="form-group full-width">
                                                <label>Alocar Licença para o Cliente:</label>
                                                <select name="cliente_id" value={formData.cliente_id} onChange={handleInputChange}>
                                                    <option value="">-- Selecione um Cliente --</option>
                                                    {allClients.map(client => {
                                                        const userCountForClient = usuarios.filter(u => u.cliente_id === client.id).length;
                                                        return (
                                                            <option key={client.id} value={client.id}>
                                                                {client.nome_empresa} ({userCountForClient}/{client.max_licencas} licenças)
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </div>
                                        )}
                                        <div className="form-group"><label>Nome:</label><input type="text" name="nome" value={formData.nome} onChange={handleInputChange} required /></div>
                                        <div className="form-group"><label>Email:</label><input type="email" name="email" value={formData.email} onChange={handleInputChange} required /></div>
                                        {/* ADICIONADO CAMPO TELEFONE NO FORMULÁRIO DE CADASTRO */}
                                        <div className="form-group"><label>Telefone:</label><input type="tel" name="telefone" value={formData.telefone} onChange={handleInputChange} placeholder="(XX) XXXXX-XXXX" /></div>
                                        <div className="form-group"><label>Senha:</label><input type="password" name="senha" value={formData.senha} onChange={handleInputChange} required minLength="6" /></div>
                                        <div className="form-group">
                                            <label>Nível de Acesso:</label>
                                            <select name="perfil" value={formData.perfil} onChange={handleInputChange}>
                                                {perfilLogado === 'admin_geral' && <option value="admin_geral">Admin Geral</option>}
                                                <option value="admin">Administrador</option>
                                                <option value="operacional">Operacional</option>
                                                <option value="financeiro">Financeiro</option>
                                                <option value="conhecimento_manager">Ger. Conhecimento</option>
                                            </select>
                                        </div>
                                        {perfilLogado === 'admin_geral' && (
                                            <>
                                                <div className="form-group"><label>Matrícula:</label><input type="text" name="matricula" value={formData.matricula} onChange={handleInputChange} /></div>
                                                <div className="form-group"><label>CPF:</label><input type="text" name="cpf" value={formData.cpf} onChange={handleInputChange} /></div>
                                                <div className="form-group"><label>Filial:</label><input type="text" name="filial" value={formData.filial} onChange={handleInputChange} /></div>
                                                <div className="form-group"><label>Cargo:</label><input type="text" name="cargo" value={formData.cargo} onChange={handleInputChange} /></div>
                                                <div className="form-group"><label>Centro de Custo:</label><input type="text" name="centroDeCusto" value={formData.centroDeCusto} onChange={handleInputChange} /></div>
                                            </>
                                        )}
                                        <div className="form-group full-width">
                                            <button type="submit" className="submit-button" disabled={perfilLogado === 'admin' && limitReached}>Cadastrar Usuário</button>
                                        </div>
                                    </fieldset>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                <div className={canWrite ? "coluna-lista" : "coluna-lista-full"}>
                    <div className="usuario-list-card">
                        <div className="management-tabs">
                            <button className={`tab-button ${activeTab === 'usuarios' ? 'active' : ''}`} onClick={() => setActiveTab('usuarios')}>Usuários ({usuarios.length})</button>
                            {(perfilLogado === 'admin' || perfilLogado === 'admin_geral') && (<button className={`tab-button ${activeTab === 'licencas' ? 'active' : ''}`} onClick={() => setActiveTab('licencas')}>Gerenciar Licenças</button>)}
                        </div>

                        <div className="tab-content-wrapper">
                            {activeTab === 'usuarios' && (
                                <>
                                    <div className="list-header-controls">
                                        <input type="text" placeholder="Buscar por nome ou CPF..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
                                        {perfilLogado === 'admin_geral' && (
                                            <div className="io-actions-container">
                                                <input type="file" accept=".xlsx, .xls" onChange={processImportFile} style={{ display: 'none' }} ref={importInputRef} />
                                                <button onClick={handleImport} className="io-button import"><FaFileUpload /> Importar</button>
                                                <button onClick={handleExport} className="io-button export"><FaFileExport /> Exportar</button>
                                                <button onClick={handleDownloadTemplate} className="io-button template"><FaFileDownload /> Baixar Modelo</button>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {selectedUsers.length > 0 && perfilLogado === 'admin_geral' && (
                                        <div className="bulk-actions-bar">
                                            <span>{selectedUsers.length} selecionado(s)</span>
                                            <div className="bulk-actions-buttons">
                                                <button onClick={() => handleBulkAction('force_logout')} className="bulk-action-btn logout"><FaSignOutAlt /> Forçar Logoff</button>
                                                <button onClick={() => handleBulkAction('block')} className="bulk-action-btn block"><FaLock /> Bloquear</button>
                                                <button onClick={() => handleBulkAction('unblock')} className="bulk-action-btn unblock"><FaUnlock /> Desbloquear</button>
                                                <button onClick={() => handleBulkAction('delete')} className="bulk-action-btn delete"><FaUsersSlash /> Excluir</button>
                                            </div>
                                        </div>
                                    )}

                                    <ul className={`usuario-list profile-${perfilLogado}`}>
                                        {perfilLogado === 'admin_geral' && usuarios.length > 0 && (
                                            <li className="list-header">
                                                <div className="usuario-info-header">
                                                    <input 
                                                        type="checkbox" 
                                                        onChange={handleSelectAll}
                                                        checked={usuarios.length > 0 && selectedUsers.length === usuarios.filter(u => u.perfil !== 'admin_geral').length}
                                                    />
                                                    <span>Usuário</span>
                                                </div>
                                                <span className="license-header">Licença</span>
                                                <span className="actions-header">Ações</span>
                                            </li>
                                        )}

                                        {usuarios.map(usuario => (
                                            <li key={usuario.id} className={usuario.status === 'bloqueado' ? 'bloqueado' : ''}>
                                                <div className="usuario-info">
                                                    {perfilLogado === 'admin_geral' && usuario.perfil !== 'admin_geral' && (
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedUsers.includes(usuario.id)}
                                                            onChange={() => handleUserSelect(usuario.id)}
                                                            className="user-checkbox"
                                                        />
                                                    )}
                                                    {(perfilLogado !== 'admin_geral' || usuario.perfil === 'admin_geral') && <div className="checkbox-placeholder"></div>}

                                                    <img src={usuario.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(usuario.nome)}&background=101C5D&color=fff`} alt="Foto" className="user-avatar" />
                                                    <div>
                                                        <span><strong>{usuario.nome}</strong></span>
                                                        <span>{usuario.email}</span>
                                                        {/* ADICIONADO CAMPO TELEFONE NA LISTAGEM */}
                                                        <span className="usuario-telefone-info">{usuario.telefone || 'Telefone não informado'}</span>
                                                        <span className="usuario-cliente-info">{usuario.perfil === 'admin_geral' ? 'System' : allClients.find(c => c.id === usuario.cliente_id)?.nome_empresa || 'Sem Cliente'}</span>
                                                    </div>
                                                </div>
                                                
                                                {(perfilLogado === 'admin' || perfilLogado === 'admin_geral') && <LicenseStatus usuario={usuario} />}
                                                
                                                <div className="usuario-actions">
                                                    {canTakeAction(usuario) && (
                                                        <>
                                                            <button onClick={() => handleOpenEditModal(usuario)} className="action-button edit" title="Editar"><FaEdit /><span>Editar</span></button>
                                                            {perfilLogado === 'admin_geral' && <button onClick={() => handleForceLogoff(usuario.id)} className="action-button logout" title="Forçar Logoff"><FaSignOutAlt /><span>Logoff</span></button>}
                                                            <button onClick={() => handleToggleBlock(usuario)} className={`action-button ${usuario.status === 'ativo' ? 'block' : 'unblock'}`} title={usuario.status === 'ativo' ? 'Bloquear' : 'Desbloquear'}>
                                                                {usuario.status === 'ativo' ? <><FaLock /><span>Bloquear</span></> : <><FaUnlock /><span>Desbloquear</span></>}
                                                            </button>
                                                            {perfilLogado === 'admin_geral' && <button onClick={() => handleDelete(usuario.id)} className="action-button delete" title="Excluir"><FaTrash /><span>Excluir</span></button>}
                                                        </>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                            
                            {activeTab === 'licencas' && (
                                <>
                                    {perfilLogado === 'admin' && (<div className={`license-status-card ${limitReached ? 'limit-reached' : ''}`}><div className="license-info-details"><h4>Status da Assinatura: {licenseInfo.clientName}</h4><p>Licenças Utilizadas: <strong>{licenseInfo.used} / {licenseInfo.total}</strong>{limitReached && <span className="limit-tag">ESGOTADO</span>}</p><div className="license-bar"><div className="license-bar-fill" style={{ width: `${(licenseInfo.used / licenseInfo.total) * 100}%` }}></div></div></div><button className="request-license-button" onClick={() => setIsLicenseModalOpen(true)}><FaPlusCircle /> Solicitar Mais Licenças</button></div>)}
                                    {perfilLogado === 'admin_geral' && (
                                        <div className="admin-geral-license-selector">
                                            <label>Selecione um cliente para gerenciar suas licenças:</label>
                                            <select value={selectedClientForKeys} onChange={(e) => setSelectedClientForKeys(e.target.value)}>
                                                <option value="">-- Ver Licenças de --</option>
                                                {allClients.map(client => {
                                                    const userCountForClient = usuarios.filter(u => u.cliente_id === client.id).length;
                                                    return (
                                                        <option key={client.id} value={client.id}>
                                                            {client.nome_empresa} ({userCountForClient}/{client.max_licencas})
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>
                                    )}
                                    {(perfilLogado === 'admin' || (perfilLogado === 'admin_geral' && selectedClientForKeys)) && (
                                        <LicenseManagementTab
                                            keys={keysOverview}
                                            users={perfilLogado === 'admin' ? usuarios : usuarios.filter(u => u.cliente_id === parseInt(selectedClientForKeys, 10))}
                                            onAllocate={handleAllocateLicense}
                                            onDeallocate={handleDeallocateLicense}
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            {isLicenseModalOpen && (<LicenseRequestModal currentLicenses={licenseInfo.total} clientName={licenseInfo.clientName} onClose={() => setIsLicenseModalOpen(false)} onSubmit={handleRequestMoreLicenses} />)}
            {isEditModalOpen && (perfilLogado === 'admin_geral' ? <EditModalAdminGeral usuarioId={editingUser.id} onClose={handleCloseEditModal} onUpdate={() => fetchData(searchQuery)} allClients={allClients} /> : <SimpleEditModal usuario={editingUser} onClose={handleCloseEditModal} onUpdate={() => fetchData(searchQuery)} />)}
        </div>
    );
}