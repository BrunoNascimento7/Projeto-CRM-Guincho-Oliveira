import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaIdCard, FaPalette, FaExclamationTriangle, FaUpload, FaBuilding, FaLink } from 'react-icons/fa';

// --- Componente para Preview de Imagem ---
const ImagePreview = ({ file, existingUrl, onFileSelect, icon: Icon, label }) => {
    const [preview, setPreview] = useState(existingUrl);
    const inputRef = useRef(null);

    useEffect(() => {
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result);
            reader.readAsDataURL(file);
        } else {
            setPreview(existingUrl);
        }
    }, [file, existingUrl]);

    return (
        <div className="image-upload-box">
            <label>{label}</label>
            <div className="image-preview" onClick={() => inputRef.current.click()}>
                <input
                    type="file"
                    style={{ display: 'none' }}
                    ref={inputRef}
                    onChange={(e) => onFileSelect(e.target.files[0])}
                    accept="image/png, image/jpeg, image/gif"
                />
                {preview ? <img src={preview} alt={label} /> : <Icon />}
                <div className="upload-overlay"><FaUpload /> Alterar</div>
            </div>
        </div>
    );
};

// --- Componente Principal do Modal ---
export default function SettingsModal({ client, onClose, onSaveSuccess }) {
    const [activeTab, setActiveTab] = useState('personalizacao');
    const [isSaving, setIsSaving] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Estados para Licenciamento
    const [maxLicencas, setMaxLicencas] = useState(client.max_licencas);
    const [licencasAlocadas, setLicencasAlocadas] = useState([]);
    
    // Estados para Personalização
    const [nomeEmpresa, setNomeEmpresa] = useState(client.nome_empresa);
    const [slug, setSlug] = useState(client.slug || '');
    const [sidebarLabel, setSidebarLabel] = useState(client.sidebar_config?.label || client.nome_empresa);
    const [dashboardTitle, setDashboardTitle] = useState(client.dashboard_config?.title || '');
    const [dashboardText, setDashboardText] = useState(client.dashboard_config?.text || '');
    const [logoFile, setLogoFile] = useState(null);
    const [loginImageFile, setLoginImageFile] = useState(null);

    const licencaWarning = maxLicencas < client.licencas_em_uso;

    useEffect(() => {
        if (activeTab === 'licenciamento') {
            const fetchLicencas = async () => {
                try {
                    const token = localStorage.getItem('token');
                    const { data } = await api.get(`/api/usuarios/licencas/cliente/${client.id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    setLicencasAlocadas(data);
                } catch (error) {
                    toast.error('Falha ao carregar detalhes das licenças.');
                }
            };
            fetchLicencas();
        }
    }, [activeTab, client.id]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (licencaWarning) {
            toast.warn('Não é possível salvar com menos licenças do que as que estão em uso.');
            return;
        }
        setIsSaving(true);
        const token = localStorage.getItem('token');
        
        try {
            // Salva dados gerais, de licença e slug
            const generalDataConfig = { headers: { 'Authorization': `Bearer ${token}` } };
            await api.put(`/api/system-hub/clientes/${client.id}`, {
                nome_empresa: nomeEmpresa,
                slug: slug,
                max_licencas: maxLicencas,
            }, generalDataConfig);

            // Salva dados de personalização com arquivos
            const formData = new FormData();
            formData.append('sidebarLabel', sidebarLabel || nomeEmpresa);
            formData.append('dashboardTitle', dashboardTitle);
            formData.append('dashboardText', dashboardText);
            if (logoFile) formData.append('logo', logoFile);
            if (loginImageFile) formData.append('loginImage', loginImageFile);

            if (sidebarLabel || dashboardTitle || dashboardText || logoFile || loginImageFile) {
                 await api.post(`/api/system-hub/clientes/${client.id}/customize`, formData, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data' 
                    }
                });
            }

            toast.success(`Cliente "${nomeEmpresa}" atualizado com sucesso!`);
            onSaveSuccess();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Falha ao salvar as alterações.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleClientSuspend = async () => {
        const newStatus = client.status === 'ativo' ? 'suspenso' : 'ativo';
        const actionText = newStatus === 'suspenso' ? 'Suspender' : 'Reativar';
        
        if (window.confirm(`Tem certeza que deseja ${actionText.toLowerCase()} o cliente "${client.nome_empresa}"?`)) {
            setIsActionLoading(true);
            try {
                const token = localStorage.getItem('token');
                await api.put(`/api/system-hub/clientes/${client.id}`, { status: newStatus }, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success(`Cliente ${actionText.toLowerCase()} com sucesso!`);
                onSaveSuccess();
            } catch (error) {
                toast.error(`Falha ao alterar o status do cliente.`);
            } finally {
                setIsActionLoading(false);
            }
        }
    };
    
    const handleForceLogoutAll = async () => {
        const confirmation = prompt(`Atenção! Esta ação irá desconectar TODOS os usuários de "${client.nome_empresa}" imediatamente. Para confirmar, digite o nome da empresa:`);
        if (confirmation === client.nome_empresa) {
             setIsActionLoading(true);
            try {
                const token = localStorage.getItem('token');
                await api.post(`/api/system-hub/clientes/${client.id}/force-logout-all`, {}, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success(`Comando de desconexão enviado para todos os usuários.`);
                onSaveSuccess();
            } catch (error) {
                toast.error(error.response?.data?.error || `Falha ao derrubar sessões.`);
            } finally {
                setIsActionLoading(false);
            }
        } else if (confirmation !== null) {
            toast.warn('Nome da empresa incorreto. Ação cancelada.');
        }
    };

    const TabButton = ({ tabName, icon: Icon, label }) => (
        <button type="button" className={activeTab === tabName ? 'active' : ''} onClick={() => setActiveTab(tabName)}>
            <Icon /> {label}
        </button>
    );

    const handleSlugChange = (e) => {
        const value = e.target.value;
        const formattedSlug = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
        setSlug(formattedSlug);
    };

    return (
        <div className="modal-overlay">
            <div className="settings-modal-content">
                <div className="modal-header">
                    <h2>Gerenciar Cliente</h2>
                    <p>{client.nome_empresa}</p>
                    <button type="button" onClick={onClose} className="modal-close-button">&times;</button>
                </div>
                
                <form onSubmit={handleSave} className="modal-body-wrapper">
                    <div className="modal-body">
                        <div className="modal-tabs">
                            <TabButton tabName="licenciamento" icon={FaIdCard} label="Licenciamento" />
                            <TabButton tabName="personalizacao" icon={FaPalette} label="Personalização" />
                            <TabButton tabName="acoes" icon={FaExclamationTriangle} label="Ações Críticas" />
                        </div>

                        {activeTab === 'licenciamento' && (
                            <div className="tab-pane">
                                <p className="tab-description">Controle o total de licenças e visualize quem está utilizando cada uma.</p>
                                <div className="license-management-grid">
                                    <div className="license-info-card">
                                        <h4>Licenças em Uso</h4>
                                        <p className="license-count">{client.licencas_em_uso}</p>
                                        <span>Usuários com licença ativa no sistema.</span>
                                    </div>
                                    <div className="license-info-card">
                                        <h4>Total de Licenças</h4>
                                        <div className="license-input-wrapper">
                                            <button type="button" onClick={() => setMaxLicencas(Math.max(1, maxLicencas - 1))}>-</button>
                                            <input type="number" value={maxLicencas} onChange={e => setMaxLicencas(parseInt(e.target.value, 10) || 1)} />
                                            <button type="button" onClick={() => setMaxLicencas(maxLicencas + 1)}>+</button>
                                        </div>
                                         <span>Limite máximo de usuários ativos.</span>
                                    </div>
                                </div>
                                {licencaWarning && (
                                    <div className="license-warning">
                                        <FaExclamationTriangle />
                                        Você não pode definir um total de licenças menor que o número de licenças já em uso.
                                    </div>
                                )}
                                <h4 className='allocated-licenses-title'>Licenças Alocadas</h4>
                                <ul className='allocated-licenses-list'>
                                    {licencasAlocadas.map(lic => (
                                        <li key={lic.id} className={lic.usuario_id_alocado ? 'used' : 'available'}>
                                            <span className='license-key'>{lic.chave_licenca}</span>
                                            {lic.usuario_id_alocado ? (
                                                <div className='user-info'>
                                                    <span>{lic.usuario_nome}</span>
                                                    <small>{lic.usuario_email}</small>
                                                </div>
                                            ) : (
                                                <span className='available-text'>Disponível</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {activeTab === 'personalizacao' && (
                            <div className="tab-pane">
                                <p className="tab-description">Personalize a aparência e o acesso do sistema para este cliente.</p>
                                <div className="form-group">
                                    <label>Nome da Empresa (visível em relatórios e títulos)</label>
                                    <input type="text" value={nomeEmpresa} onChange={e => setNomeEmpresa(e.target.value)} required />
                                </div>
                                <div className="form-group">
                                    <label>Identificador de URL (slug)</label>
                                    <div className="input-with-helper">
                                        <span className="slug-prefix">{`${window.location.origin.replace(/:\d+$/, '')}/login/`}</span>
                                        <input type="text" value={slug} onChange={handleSlugChange} placeholder="nome-do-cliente" required />
                                    </div>
                                    <small>Usado para a URL de login personalizada. Apenas letras, números e hifens.</small>
                                </div>
                                <div className="personalizacao-grid">
                                    <ImagePreview file={logoFile} existingUrl={client.sidebar_config?.logo_url || client.login_config?.logo_url} onFileSelect={setLogoFile} icon={FaBuilding} label="Logo Principal (Login e Sidebar)" />
                                    <ImagePreview file={loginImageFile} existingUrl={client.login_config?.background_url} onFileSelect={setLoginImageFile} icon={FaPalette} label="Fundo da Tela de Login" />
                                </div>
                                <div className="form-group">
                                    <label>Título na Dashboard</label>
                                    <input type="text" value={dashboardTitle} onChange={e => setDashboardTitle(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Texto de Boas-Vindas na Dashboard</label>
                                    <textarea rows="4" value={dashboardText} onChange={e => setDashboardText(e.target.value)} />
                                </div>
                            </div>
                        )}

                        {activeTab === 'acoes' && (
                             <div className="tab-pane">
                                 <p className="tab-description">Execute ações administrativas que afetam todos os usuários deste cliente. Use com cuidado.</p>
                                 <div className="critical-actions-wrapper">
                                     <div className="critical-action-item">
                                         <div>
                                            <h4>{client.status === 'ativo' ? 'Suspender Cliente' : 'Reativar Cliente'}</h4>
                                            <p>Impede ou libera o login de todos os usuários. O acesso ao sistema será bloqueado/liberado imediatamente.</p>
                                         </div>
                                         <button type="button" onClick={handleClientSuspend} disabled={isActionLoading} className={`action-button ${client.status === 'ativo' ? 'suspend' : 'activate'}`}>
                                            {isActionLoading ? 'Aguarde...' : (client.status === 'ativo' ? 'Suspender' : 'Reativar')}
                                        </button>
                                     </div>
                                      <div className="critical-action-item">
                                         <div>
                                            <h4>Derrubar Todas as Sessões</h4>
                                            <p>Força o logout de todos os usuários deste cliente que estão atualmente logados no sistema.</p>
                                         </div>
                                         <button type="button" onClick={handleForceLogoutAll} disabled={isActionLoading} className="action-button suspend">
                                             {isActionLoading ? 'Aguarde...' : 'Derrubar Sessões'}
                                         </button>
                                     </div>
                                 </div>
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="cancel-button" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="submit-button" disabled={isSaving || licencaWarning}>
                            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}