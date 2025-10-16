// src/App.js

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import api from './services/api';

// Imports para Acesso Remoto
import Peer from 'simple-peer';
import { useSocket } from './components/SocketContext';
import RemoteAccessModal from './components/RemoteAccessModal';
import RemoteSessionViewer from './components/RemoteSessionViewer';

// Imports de bibliotecas e hooks
import { DataRefresherProvider } from './hooks/useDataRefresher';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { SocketProvider } from './components/SocketContext';
import { CustomizationProvider } from './context/CustomizationContext';
import { SupportProvider } from './context/SupportContext';

// Imports dos componentes e páginas
import Layout from './components/Layout';
import Financeiro from './components/Financeiro';
import ControleGastos from './components/ControleGastos';
import FluxoCaixaProjetado from './components/FluxoCaixaProjetado';
import RentabilidadeFrota from './components/RentabilidadeFrota';
import ErrorCollector from './components/ErrorCollector';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Clientes from './components/Clientes';
import Motoristas from './components/Motoristas';
import Veiculos from './components/Veiculos';
import Simulador from './components/SimuladorRefatorado';
import EmpresaConfig from './components/EmpresaConfig';
import Pagamentos from './components/Pagamentos';
import RelatoriosFinanceiros from './components/RelatoriosFinanceiros';
import Usuarios from './components/Usuarios';
import Relatorios from './components/Relatorios';
import MinhasOrdens from './components/MinhasOrdens';
import Chamado from './components/Chamado';
import FilaOrdens from './components/FilaOrdens';
import CadastroOrdens from './components/CadastroOrdens';
import ControleLogs from './components/ControleLogs';
import ChatWidget from './components/ChatWidget';
import ResetPassword from './components/ResetPassword';
import TaskBoard from './components/TaskBoard';
import GestaoConteudo from './components/GestaoConteudo';
import AnuncioModal from './components/AnuncioModal';
import BaseConhecimento from './components/BaseConhecimento';
import SystemHubClientes from './components/SystemHubClientes';
import SystemHubAnuncios from './components/SystemHubAnuncios';
import SystemHubConfiguracoes from './components/SystemHubConfiguracoes';
import SystemHubDashboard from './components/SystemHubDashboard';
import MaintenancePage from './components/MaintenancePage';
import SystemHubSolicitacoes from './components/SystemHubSolicitacoes';
import ForcePasswordChange from './components/ForcePasswordChange';
import SupportAdminDashboard from './components/SupportAdminDashboard';
import SupportTicketDetail from './components/SupportTicketDetail';
import ConciliacaoBancaria from './components/ConciliacaoBancaria';
import SupportAdminSettings from './components/SupportAdminSettings';
import TicketRatingPage from './components/TicketRatingPage';
import SupportAdminReports from './components/SupportAdminReports';
import GmudDashboard from './components/GmudDashboard'; 
import GmudDetailPage from './components/GmudDetailPage'; 
import MeuPerfil from './components/MeuPerfil';
import SystemHubUpdates from './components/SystemHubUpdates'; 
import ComunicacaoMassa from './components/ComunicacaoMassa';
import GestaoTags from './components/GestaoTags';
import GestaoTemplates from './components/GestaoTemplates';
import CotacaoPublica from './pages/CotacaoPublica';


import './DarkMode.css';

const ProtectedRoute = ({ children, roles, user }) => {
    if (!user) return <Navigate to="/login/default-client" replace />;
    if (roles && !roles.includes(user.perfil)) return <Navigate to="/dashboard" replace />;
    return children;
};

function AppContent() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const navigate = useNavigate();
    const [anuncioParaExibir, setAnuncioParaExibir] = useState(null);
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    
    const socket = useSocket();
    const [remoteAccessRequest, setRemoteAccessRequest] = useState(null);
    const peerRef = useRef();

    useEffect(() => {
        if (socket && user) {
            const handleRemoteRequest = (data) => setRemoteAccessRequest(data);
            socket.on('cliente:receber-solicitacao-acesso', handleRemoteRequest);

            const handleSignalResponse = ({ sinal }) => {
                if (peerRef.current) peerRef.current.signal(sinal);
            };
            socket.on('webrtc:receber-sinal', handleSignalResponse);

            return () => {
                socket.off('cliente:receber-solicitacao-acesso', handleRemoteRequest);
                socket.off('webrtc:receber-sinal', handleSignalResponse);
            };
        }
    }, [socket, user]);

    const handleAccessResponse = async (aceito) => {
        if (!remoteAccessRequest) return;
        socket.emit('cliente:responder-solicitacao-acesso', {
            aceito: aceito,
            adminSocketId: remoteAccessRequest.adminSocketId,
            chamadoId: remoteAccessRequest.chamadoId
        });
    
        if (aceito) {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false });
                toast.info("Compartilhamento de tela iniciado.");

                const peer = new Peer({ initiator: true, stream: stream, trickle: false });
                peerRef.current = peer;

                peer.on('signal', (sinal) => {
                    socket.emit('webrtc:enviar-sinal', { paraSocketId: remoteAccessRequest.adminSocketId, sinal: sinal });
                });
                
                stream.getVideoTracks()[0].onended = () => {
                    toast.warn("Compartilhamento de tela encerrado.");
                    socket.emit('remoto:sessao-encerrada', { paraSocketId: remoteAccessRequest.adminSocketId });
                    if(peerRef.current) peerRef.current.destroy();
                };
            } catch (err) {
                toast.error("Você precisa conceder permissão para compartilhar a tela.");
            }
        }
        setRemoteAccessRequest(null);
    };

    const handleLogout = useCallback(async () => {
        try {
            await api.post('/api/usuarios/logout');
        } catch (error) {
            console.error("Erro ao notificar o servidor sobre o logout:", error);
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            document.body.classList.remove('dark-mode');
            navigate('/login/default-client');
        }
    }, [navigate]);

    useEffect(() => {
        const performLogout = () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            document.body.classList.remove('dark-mode');
        };

        const initializeApp = async () => {
            try {
                const { data } = await api.get('/api/public/system-status');
                if (data.maintenanceMode) {
                    setMaintenanceMode(true);
                }
            } catch (error) {
                console.error("Falha ao verificar status de manutenção.");
            }

            const token = localStorage.getItem('token');
            if (token) {
                try {
                    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                    const { data } = await api.get('/api/usuarios/me');
                    if (data && data.id) {
                        setUser(data);
                    } else {
                        performLogout();
                    }
                } catch (error) {
                    console.error("Falha ao validar token, fazendo logout:", error.response?.data || error.message);
                    performLogout();
                }
            }
            setLoading(false);
        };
        
        initializeApp();
    }, [handleLogout]); 

    const handleLoginSuccess = (userData) => {
        if (userData && userData.token) {
            localStorage.setItem('token', userData.token);
            localStorage.setItem('user', JSON.stringify(userData));
            api.defaults.headers.common['Authorization'] = `Bearer ${userData.token}`;
            setUser(userData);
            
            if (maintenanceMode && userData.perfil !== 'admin_geral') {
                navigate('/maintenance');
            } else {
                navigate('/dashboard');
            }
        } else if (userData && userData.needsPasswordChange) {
            navigate('/definir-nova-senha', { state: { userId: userData.userId } });
        }
    };
    
    if (loading) return <div></div>;

    return (
        <DataRefresherProvider>
            <ToastContainer position="top-right" autoClose={4000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="colored" />
            <RemoteAccessModal request={remoteAccessRequest} onAccept={() => handleAccessResponse(true)} onDeny={() => handleAccessResponse(false)} />
            {user && <ChatWidget user={user} />}
            {anuncioParaExibir && <AnuncioModal anuncio={anuncioParaExibir} onClose={() => setAnuncioParaExibir(null)} isVisible={!!anuncioParaExibir} />}
            
            <Routes>
                {maintenanceMode && user?.perfil !== 'admin_geral' ? (
                    <>
                        <Route path="/login/:identificador" element={<Login onLoginSuccess={handleLoginSuccess} />} />
                        <Route path="/login" element={<Navigate to="/login/default-client" replace />} />
                        <Route path="/" element={<Navigate to="/login/default-client" replace />} />
                        <Route path="*" element={<MaintenancePage />} />
                    </>
                ) : (
                    <>
                        <Route path="/login/:identificador" element={!user ? <Login onLoginSuccess={handleLoginSuccess} /> : <Navigate to="/dashboard" />} />
                        <Route path="/login" element={<Navigate to="/login/default-client" replace />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/definir-nova-senha" element={<ForcePasswordChange />} />
                        <Route path="/remote-session/:chamadoId/:clienteSocketId" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin']}><RemoteSessionViewer /></ProtectedRoute>} />
                        <Route path="/avaliar-chamado/:token" element={<TicketRatingPage />} />
                        <Route path="/cotacao/:uid" element={<CotacaoPublica />} />
                        
                        {/* ROTA PRINCIPAL COM LAYOUT */}
                        <Route path="/" element={<ProtectedRoute user={user}><Layout user={user} onLogout={handleLogout} onOpenConfig={() => setIsConfigModalOpen(true)} onThemeUpdate={()=>{}} onNotificationClick={() => {}} /></ProtectedRoute>}>
                            <Route index element={<Navigate to="/dashboard" replace />} />
                            <Route path="dashboard" element={<Dashboard user={user} />} />
                            <Route path="meu-perfil" element={<MeuPerfil />} />
                            <Route path="clientes" element={<Clientes user={user} />} />
                            <Route path="comunicacao" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'financeiro']}><ComunicacaoMassa /></ProtectedRoute>} 
    />
                            <Route path="motoristas" element={<Motoristas user={user} />} />
                            <Route path="veiculos" element={<Veiculos user={user} />} />
                            <Route path="ordens/cadastro" element={<CadastroOrdens user={user} />} />
                            <Route path="ordens/fila" element={<FilaOrdens user={user} />} />
                            <Route path="simulador" element={<Simulador user={user} />} />
                            <Route path="minhas-ordens" element={<MinhasOrdens user={user} />} />
                            <Route path="chamado/:id" element={<Chamado user={user} />} />
                            <Route path="quadro-tarefas" element={<TaskBoard />} />
                            <Route path="base-conhecimento" element={<BaseConhecimento />} />
                            
                            {/* Rotas Financeiras */}
                            <Route path="financeiro/transacoes" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'financeiro']}><Financeiro /></ProtectedRoute>} />
                            <Route path="financeiro/pagamentos" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'financeiro']}><Pagamentos /></ProtectedRoute>} />
                            <Route path="financeiro/relatorios" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'financeiro']}><RelatoriosFinanceiros /></ProtectedRoute>} />
                            <Route path="financeiro/gastos" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'financeiro']}><ControleGastos /></ProtectedRoute>} />
                            <Route path="financeiro/fluxo-caixa" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'financeiro']}><FluxoCaixaProjetado /></ProtectedRoute>} />
                            <Route path="financeiro/rentabilidade-frota" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'financeiro']}><RentabilidadeFrota /></ProtectedRoute>} />
                            <Route path="financeiro/conciliacao-bancaria" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'financeiro']}><ConciliacaoBancaria /></ProtectedRoute>} />

                            {/* Rotas de Administração */}
                            <Route path="relatorios" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'operacional']}><Relatorios /></ProtectedRoute>} />
                            <Route path="usuarios" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin']}><Usuarios /></ProtectedRoute>} />
                            <Route path="logs" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin']}><ControleLogs onLogout={handleLogout} /></ProtectedRoute>} />
                            <Route path="gestao-conteudo" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin']}><GestaoConteudo /></ProtectedRoute>} />
                            <Route path="gestao-tags" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin']}><GestaoTags /></ProtectedRoute>} />
                            <Route path="gestao-templates" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin']}><GestaoTemplates /></ProtectedRoute>} />

                            
                            {/* Rotas do System Hub */}
                            <Route path="system-hub/dashboard" element={<ProtectedRoute user={user} roles={['admin_geral']}><SystemHubDashboard /></ProtectedRoute>} />
                            <Route path="system-hub/clientes" element={<ProtectedRoute user={user} roles={['admin_geral']}><SystemHubClientes /></ProtectedRoute>} />
                            <Route path="system-hub/solicitacoes" element={<ProtectedRoute user={user} roles={['admin_geral']}><SystemHubSolicitacoes /></ProtectedRoute>} />
                            <Route path="system-hub/updates" element={<ProtectedRoute user={user} roles={['admin_geral']}><SystemHubUpdates /></ProtectedRoute>} />
                            <Route path="system-hub/anuncios" element={<ProtectedRoute user={user} roles={['admin_geral']}><SystemHubAnuncios /></ProtectedRoute>} />
                            <Route path="system-hub/configuracoes" element={<ProtectedRoute user={user} roles={['admin_geral']}><SystemHubConfiguracoes /></ProtectedRoute>} />
                            
                            {/* Rotas de Suporte */}
                            <Route path="suporte-admin/dashboard" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'financeiro', 'operacional']}><SupportAdminDashboard /></ProtectedRoute>} />
                            <Route path="suporte-admin/chamado/:id" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin', 'financeiro', 'operacional']}><SupportTicketDetail /></ProtectedRoute>} />
                            <Route path="suporte-admin/configuracoes" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin']}><SupportAdminSettings /></ProtectedRoute>} />
                            <Route path="suporte-admin/relatorios" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin']}><SupportAdminReports /></ProtectedRoute>} />
                            
                            {/* Rotas GMUD */}
                            <Route path="suporte-admin/gmud" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin']}><GmudDashboard /></ProtectedRoute>} />
                            <Route path="suporte-admin/gmud/:id" element={<ProtectedRoute user={user} roles={['admin_geral', 'admin']}><GmudDetailPage /></ProtectedRoute>} />
                            
                            <Route path="*" element={<Navigate to="/dashboard" />} />
                        </Route>
                    </>
                )}
            </Routes>
        </DataRefresherProvider>
    );
}

function App() {
    return (
        <SocketProvider>
            <CustomizationProvider>
                <SupportProvider>
                    <ErrorCollector />
                    <Router>
                        <AppContent />
                    </Router>
                </SupportProvider>
            </CustomizationProvider>
        </SocketProvider>
    );
}

export default App;