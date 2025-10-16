// src/components/Login.js

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import './Login.css';
import { FaSpinner } from 'react-icons/fa';

import logoGuincho from '../logo_guincho.png';
import backgroundGuincho from '../guinchotr.jpg';

// --- INÍCIO DA MODIFICAÇÃO 1: Importar a página de manutenção ---
// (Ajuste o caminho se necessário)
import MaintenancePage from './MaintenancePage'; 
// --- FIM DA MODIFICAÇÃO 1 ---

const EyeIcon = ({ visible }) => ( <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> {visible ? ( <> <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /> <circle cx="12" cy="12" r="3" /> </> ) : ( <> <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /> <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /> <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /> <line x1="2" x2="22" y1="2" y2="22" /> </> )} </svg> );

const RecoveryModal = ({ currentStage, handlers, formData, messages, loading, timer }) => {
    const { handleFormChange, handleRequestSmsSubmit, handleVerifySmsSubmit, handleResetPasswordSubmit, handleBackToLogin } = handlers;
    const { telefone, cpf, token, newPassword, confirmPassword } = formData;
    const { error, success } = messages;

    const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

    return (
        <div className={`recovery-modal-overlay ${currentStage.startsWith('forgot-') ? 'open' : ''}`}>
            <div className="recovery-modal-content">
                <button onClick={handleBackToLogin} className="modal-close-button">&times;</button>

                {currentStage === 'forgot-request-sms' && (
                    <form onSubmit={handleRequestSmsSubmit}>
                        <h3>Recuperar Senha</h3>
                        <p className="info-text">Digite seu telefone e CPF cadastrados.</p>
                        <div className="form-group"> <label htmlFor="telefone">Telefone Celular:</label> <input type="tel" id="telefone" name="telefone" value={telefone} onChange={handleFormChange} placeholder="(99) 99999-9999" required /> </div>
                        <div className="form-group"> <label htmlFor="cpf">CPF:</label> <input type="text" id="cpf" name="cpf" value={cpf} onChange={handleFormChange} placeholder="000.000.000-00" required /> </div>
                        {error && <p className="error-message">{error}</p>}
                        <button type="submit" className="login-button" disabled={loading}> {loading ? <FaSpinner className="spinner" /> : 'Validar e Enviar Código'} </button>
                    </form>
                )}

                {currentStage === 'forgot-enter-token' && (
                       <form onSubmit={handleVerifySmsSubmit}>
                        <h3>Verificar Código</h3>
                        <p className="info-text">Digite o código de 6 dígitos que enviamos por SMS.</p>
                         <div className="form-group"> <label htmlFor="token">Código de 6 dígitos:</label> <input type="text" id="token" name="token" value={token} onChange={handleFormChange} maxLength="6" required /> </div>
                        {error && <p className="error-message">{error}</p>}
                        <button type="submit" className="login-button" disabled={loading}> {loading ? <FaSpinner className="spinner" /> : 'Verificar'} </button>
                        <div className="resend-timer">
                            {timer > 0 ? (
                                <span>Você pode pedir um novo código em {formatTime(timer)}</span>
                            ) : (
                                <button type="button" className="forgot-password-button" onClick={handleRequestSmsSubmit}> Reenviar Código </button>
                            )}
                        </div>
                    </form>
                )}
                
                {currentStage === 'forgot-set-new-password' && (
                    <form onSubmit={handleResetPasswordSubmit}>
                        <h3>Crie sua Nova Senha</h3>
                        <div className="password-policy">
                            <ul>
                                <li>Pelo menos 12 caracteres</li>
                                <li>Uma letra maiúscula</li>
                                <li>Uma letra minúscula</li>
                                <li>Um número</li>
                                <li>Um símbolo (@$!%*?&)</li>
                            </ul>
                        </div>
                        <div className="form-group"> <label htmlFor="newPassword">Nova Senha:</label> <input type="password" id="newPassword" name="newPassword" value={newPassword} onChange={handleFormChange} required /> </div>
                        <div className="form-group"> <label htmlFor="confirmPassword">Confirme a Nova Senha:</label> <input type="password" id="confirmPassword" name="confirmPassword" value={confirmPassword} onChange={handleFormChange} required /> </div>
                        {error && <p className="error-message">{error}</p>}
                        <button type="submit" className="login-button" disabled={loading}> {loading ? <FaSpinner className="spinner" /> : 'Salvar Nova Senha'} </button>
                    </form>
                )}

               {currentStage === 'forgot-success' && (
                    <div className="final-message-box">
                        <h3>Sucesso!</h3>
                        <p className="success-message">{success}</p>
                        <button type="button" className="login-button" onClick={handleBackToLogin}> Voltar para o Login </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default function Login({ onLoginSuccess }) {
    const [loginData, setLoginData] = useState({ email: '', senha: '' });
    const [showPassword, setShowPassword] = useState(false);
    const { slug } = useParams();
    const [customization, setCustomization] = useState({ nome_empresa: 'Guincho Oliveira', logo_url: logoGuincho, background_url: backgroundGuincho });
    const [isCustomizationLoading, setIsCustomizationLoading] = useState(true);
    const [recoveryData, setRecoveryData] = useState({ telefone: '', cpf: '', token: '', newPassword: '', confirmPassword: '' });
    const [messages, setMessages] = useState({ error: '', success: '' });
    const [loading, setLoading] = useState(false);
    const [currentStage, setCurrentStage] = useState('login');
    const [timer, setTimer] = useState(180);
    const [resetToken, setResetToken] = useState(null);
    const navigate = useNavigate();

    // --- INÍCIO DA MODIFICAÇÃO 2: Adicionar estado para a manutenção ---
    const [maintenanceInfo, setMaintenanceInfo] = useState({ isActive: false, endDate: null });
    // --- FIM DA MODIFICAÇÃO 2 ---

    useEffect(() => {
        const fetchCustomization = async () => {
            const effectiveSlug = slug || 'default';
            if (effectiveSlug === 'default') {
                setCustomization({
                    nome_empresa: 'Guincho Oliveira',
                    logo_url: logoGuincho,
                    background_url: backgroundGuincho
                });
                // Garante que a manutenção esteja desativada para o slug padrão
                setMaintenanceInfo({ isActive: false, endDate: null }); 
                setIsCustomizationLoading(false);
                return;
            }

            setIsCustomizationLoading(true);
            try {
                // --- INÍCIO DA MODIFICAÇÃO 3: Capturar os dados de manutenção da API ---
                const { data } = await api.get(`/api/system-hub/public/customize/${effectiveSlug}`);
                setCustomization({
                    nome_empresa: data.nome_empresa,
                    logo_url: data.login_config?.logo_url,
                    background_url: data.login_config?.background_url,
                });
                // Salva a informação de manutenção no estado
                if (data.maintenanceInfo) {
                    setMaintenanceInfo(data.maintenanceInfo);
                }
                // --- FIM DA MODIFICAÇÃO 3 ---
            } catch (error) {
                console.error("Falha ao buscar customização, usando o padrão.", error);
                setCustomization({
                    nome_empresa: 'Guincho Oliveira',
                    logo_url: logoGuincho,
                    background_url: backgroundGuincho
                });
                 // Garante que a manutenção esteja desativada em caso de erro na API
                setMaintenanceInfo({ isActive: false, endDate: null });
            } finally {
                setIsCustomizationLoading(false);
            }
        };
        fetchCustomization();
    }, [slug]);

    useEffect(() => {
        if (currentStage === 'forgot-enter-token' && timer > 0) {
            const interval = setInterval(() => {
                setTimer(prevTimer => prevTimer - 1);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [currentStage, timer]);

    const handleLoginChange = (e) => {
        const { id, value } = e.target;
        setLoginData(prev => ({ ...prev, [id]: value }));
    };
    
    const handleSubmitLogin = async (e) => {
        e.preventDefault();
        setMessages({ error: '', success: '' });
        setLoading(true);
        try {
            const response = await api.post('/api/usuarios/login', { email: loginData.email, senha: loginData.senha });
            if (response.data.needsPasswordChange) {
                navigate(`/definir-nova-senha/${response.data.userId}`);
                return; 
            }
            onLoginSuccess(response.data);
        } catch (err) {
            // A verificação de manutenção agora é feita proativamente, mas mantemos o erro genérico
            setMessages({ error: err.response?.data?.error || 'Não foi possível conectar ao servidor.' });
        } finally {
            setLoading(false);
        }
    };
    
    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setRecoveryData(prev => ({ ...prev, [name]: value }));
    };

    const handleRequestSmsSubmit = useCallback(async (e) => {
        if (e) e.preventDefault();
        setMessages({ error: '', success: '' });
        setLoading(true);
        try {
            await api.post('/api/usuarios/reset-password/request-sms', { telefone: recoveryData.telefone, cpf: recoveryData.cpf });
            setCurrentStage('forgot-enter-token');
            setTimer(180);
        } catch (err) {
            setMessages({ error: err.response?.data?.error || 'Ocorreu um erro.', success: '' });
        } finally {
            setLoading(false);
        }
    }, [recoveryData.cpf, recoveryData.telefone]);

    const handleVerifySmsSubmit = async (e) => {
        e.preventDefault();
        setMessages({ error: '', success: '' });
        setLoading(true);
        try {
            const { data } = await api.post('/api/usuarios/reset-password/verify-sms', { cpf: recoveryData.cpf, token: recoveryData.token });
            setResetToken(data.resetToken);
            setCurrentStage('forgot-set-new-password');
        } catch (err) {
            setMessages({ error: err.response?.data?.error || 'Ocorreu um erro.', success: '' });
        } finally {
            setLoading(false);
        }
    };
    
    const handleResetPasswordSubmit = async (e) => {
        e.preventDefault();
        if (recoveryData.newPassword !== recoveryData.confirmPassword) {
            setMessages({ error: 'As senhas não coincidem.', success: '' });
            return;
        }
        setMessages({ error: '', success: '' });
        setLoading(true);
        try {
            const { data } = await api.post('/api/usuarios/reset-password/set-new-password', {
                resetToken: resetToken,
                newPassword: recoveryData.newPassword
            });
            setMessages({ success: data.message, error: '' });
            setCurrentStage('forgot-success');
        } catch (err) {
            setMessages({ error: err.response?.data?.error || 'Ocorreu um erro.', success: '' });
        } finally {
            setLoading(false);
        }
    };

    const handleBackToLogin = () => {
        setCurrentStage('login');
        setMessages({ error: '', success: '' });
        setRecoveryData({ telefone: '', cpf: '', token: '', newPassword: '', confirmPassword: '' });
        setTimer(180);
        setResetToken(null);
    };
    
    const recoveryHandlers = { handleFormChange, handleRequestSmsSubmit, handleVerifySmsSubmit, handleResetPasswordSubmit, handleBackToLogin };
    const backgroundStyle = { backgroundImage: `linear-gradient(rgba(16, 28, 93, 0.7), rgba(16, 28, 93, 0.7)), url(${customization.background_url})` };

    if (isCustomizationLoading) { // Simplificado para mostrar spinner sempre que estiver carregando
        return (
            <div className="login-background" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FaSpinner className="spinner" size={50} color="#fff" />
            </div>
        );
    }
    
    // --- INÍCIO DA MODIFICAÇÃO 4: Renderização condicional ---
    // Se a API informou que a manutenção está ativa, mostramos a página de manutenção
    if (maintenanceInfo.isActive) {
        return <MaintenancePage endDate={maintenanceInfo.endDate} />;
    }
    // --- FIM DA MODIFICAÇÃO 4 ---

    // Se a manutenção não estiver ativa, o código abaixo é executado normalmente.
    return (
        <div className="login-background" style={backgroundStyle}>
            <div className="login-box">
                {customization.logo_url && <img src={customization.logo_url} alt={`${customization.nome_empresa} Logo`} className="login-logo" />}
                <h2 className="login-title">{customization.nome_empresa}</h2>
                <form onSubmit={handleSubmitLogin}>
                    <div className="form-group"> <label htmlFor="email">Email:</label> <input type="email" id="email" value={loginData.email} onChange={handleLoginChange} placeholder="seuemail@exemplo.com" required /> </div>
                    <div className="form-group password-wrapper">
                        <label htmlFor="senha">Senha:</label>
                        <input type={showPassword ? 'text' : 'password'} id="senha" value={loginData.senha} onChange={handleLoginChange} placeholder="********" required />
                        <span className="password-toggle-icon" onClick={() => setShowPassword(!showPassword)}> <EyeIcon visible={showPassword} /> </span>
                    </div>
                    {messages.error && currentStage === 'login' && <p className="error-message">{messages.error}</p>}
                    <button type="submit" className="login-button" disabled={loading}> {loading && currentStage === 'login' ? <FaSpinner className="spinner" /> : 'Entrar'} </button>
                    <button type="button" className="forgot-password-button" onClick={() => setCurrentStage('forgot-request-sms')}> Esqueci minha senha </button>
                </form>
            </div>
            <RecoveryModal currentStage={currentStage} handlers={recoveryHandlers} formData={recoveryData} messages={messages} loading={loading} timer={timer}/>
        </div>
    );
}