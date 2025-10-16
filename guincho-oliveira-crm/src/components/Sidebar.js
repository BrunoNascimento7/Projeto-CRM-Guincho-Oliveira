import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './Sidebar.css';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from './SocketContext';
import logo from '../logo_guincho.png';
import {
    FaTachometerAlt, FaList, FaCalendarAlt, FaDollarSign, FaCalculator,
    FaFileAlt, FaTasks, FaChevronDown, FaBook,
    FaShieldAlt, FaHeadset, FaUserShield,
    FaRoute, FaCommentDots
} from 'react-icons/fa';

const MenuItem = ({ item, isCollapsed, openDropdown, toggleDropdown, handleLinkClick, location, supportNotification, perfil }) => {
    
    // Verifica a permissão do item principal
    const temPermissao = !item.permissionKey || item.permissionKey.includes(perfil);
    if (!temPermissao) return null;

    const isDropdownOpen = openDropdown === item.name;
    const isActive = item.isDropdown
        ? item.subItems.some(sub => location.pathname.startsWith(sub.path))
        : location.pathname === item.path;

    if (item.isDropdown) {
        return (
            <li className={`menu-item dropdown ${isActive ? 'active' : ''}`}>
                <div className="menu-link" onClick={() => toggleDropdown(item.name)}>
                    <span className="menu-icon">{item.icon}</span>
                    {!isCollapsed && <span className="menu-label">{item.label}</span>}
                    {item.notificationId === 'support' && supportNotification && !isCollapsed && (
                        <span className="sidebar-notification-dot"></span>
                    )}
                    {!isCollapsed && <FaChevronDown className={`chevron ${isDropdownOpen ? 'open' : ''}`} />}
                </div>
                {!isCollapsed && (
                    <ul className={`dropdown-menu ${isDropdownOpen ? 'open' : ''}`}>
                        {item.subItems.map((subItem) => {
                            // ALTERAÇÃO: Adicionada verificação de permissão para cada SUB-ITEM
                            const temPermissaoSubItem = !subItem.permissionKey || subItem.permissionKey.includes(perfil);
                            if (!temPermissaoSubItem) return null;

                            return (
                                <li key={subItem.path}>
                                    <NavLink to={subItem.path} className={({ isActive }) => isActive ? "subitem-active" : ""}>
                                        {subItem.label}
                                    </NavLink>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </li>
        );
    }

    return (
        <li className="menu-item">
            <NavLink to={item.path} className={({ isActive }) => `menu-link ${isActive ? "active" : ""}`} onClick={() => handleLinkClick(item.notificationId)}>
                <span className="menu-icon">{item.icon}</span>
                {!isCollapsed && <span className="menu-label">{item.label}</span>}
            </NavLink>
        </li>
    );
};


export default function Sidebar({ user, isCollapsed, setIsSidebarCollapsed }) {
    const { perfil } = useAuth();
    const location = useLocation();
    const [openDropdown, setOpenDropdown] = useState('');
    const [supportNotification, setSupportNotification] = useState(false);
    const socket = useSocket();

    const menuItems = useMemo(() => [
        { path: "/dashboard", label: "Dashboard", icon: <FaTachometerAlt />, name: 'dashboard' },
        {
            label: "Cadastro", icon: <FaList />, name: 'cadastro', isDropdown: true,
            subItems: [ { path: "/clientes", label: "Clientes" }, { 
            path: "/comunicacao", 
            label: "Comunicação", 
            permissionKey: ['admin_geral', 'admin', 'financeiro'] 
        }, { path: "/motoristas", label: "Motoristas" }, { path: "/veiculos", label: "Veículos" } ]
        },
        {
            label: "Agenda de Serviços", icon: <FaCalendarAlt />, name: 'agenda', isDropdown: true,
            subItems: [ { path: "/ordens/cadastro", label: "Cadastro de Ordens" }, { path: "/minhas-ordens", label: "Minhas Ordens" }, { path: "/ordens/fila", label: "Fila de Ordens" } ]
        },
        {
            label: "Controle Financeiro", icon: <FaDollarSign />, name: 'financeiro', isDropdown: true, permissionKey: ['admin_geral', 'admin', 'financeiro'],
            subItems: [ { path: "/financeiro/transacoes", label: "Transações" }, { path: "/financeiro/gastos", label: "Controle de Gastos" }, { path: "/financeiro/fluxo-caixa", label: "Fluxo de Caixa Projetado" }, { path: "/financeiro/rentabilidade-frota", label: "Rentabilidade da Frota" }, { path: "/financeiro/pagamentos", label: "Pagamentos" }, { path: "/financeiro/relatorios", label: "Relatórios Financeiros" }, { path: "/financeiro/conciliacao-bancaria", label: "Conciliação Bancária" } ]
        },
        { path: "/quadro-tarefas", label: "Quadro de Tarefas", icon: <FaTasks />, name: 'quadro-tarefas' },
        { path: "/simulador", label: "Simulador", icon: <FaCalculator />, name: 'simulador' },
        { path: "/relatorios", label: "Relatórios", icon: <FaFileAlt />, permissionKey: ['admin_geral', 'admin', 'operacional'], name: 'relatorios' },
        { path: "/base-conhecimento", label: "Base de Conhecimento", icon: <FaBook />, name: 'conhecimento' },
        
        {
            label: "Painel de Suporte", 
            icon: <FaHeadset />, 
            name: 'suporte-admin', 
            isDropdown: true, 
            permissionKey: ['admin_geral', 'admin', 'financeiro', 'operacional'],
            notificationId: 'support',
            subItems: [
                // Este item não tem permissionKey, então todos que veem o menu principal, verão ele.
                { path: "/suporte-admin/dashboard", label: "Painel de Chamados" },
                
                // ALTERAÇÃO: Adicionada permissionKey para os itens restritos
                { path: "/suporte-admin/relatorios", label: "Relatórios", permissionKey: ['admin_geral', 'admin'] },
                { path: "/suporte-admin/gmud", label: "Gestão de Mudanças", permissionKey: ['admin_geral', 'admin'] },
                { path: "/suporte-admin/configuracoes", label: "Configurações", permissionKey: ['admin_geral', 'admin'] }
            ]
        },
        {
            label: "Administração", icon: <FaUserShield />, name: 'administracao', isDropdown: true, permissionKey: ['admin_geral', 'admin'],
            subItems: [ { path: "/usuarios", label: "Gerenciar Usuários" }, { path: "/gestao-conteudo", label: "Gestão de Conteúdo" }, { path: "/logs", label: "Controle de Logs" },{ path: "/gestao-tags", label: "Gestão de Tags" }, { path: "/gestao-templates", label: "Gestão de Templates" } ]
        },
    ], []);

    const finalMenuItems = useMemo(() => {
        const items = [...menuItems];
        if (perfil === 'admin_geral') {
            items.push({
                label: "System Hub", icon: <FaShieldAlt />, name: 'system_hub', isDropdown: true,
                subItems: [ { path: "/system-hub/dashboard", label: "Visão Geral" }, { path: "/system-hub/clientes", label: "Gestão de Clientes" }, { path: "/system-hub/solicitacoes", label: "Solicitações de Licença" }, { path: "/system-hub/updates", label: "Novidades do Sistema" }, { path: "/system-hub/anuncios", label: "Anúncios Globais" }, { path: "/system-hub/configuracoes", label: "Configurações" } ]
            });
        }
        return items;
    }, [menuItems, perfil]);


    useEffect(() => {
        // Agora as notificações de suporte vão para todos os perfis de suporte
        if (socket && ['admin', 'admin_geral', 'financeiro', 'operacional'].includes(perfil)) {
            const handleSupportNotification = () => setSupportNotification(true);
            socket.on('support_notification', handleSupportNotification);
            return () => socket.off('support_notification', handleSupportNotification);
        }
    }, [socket, perfil]);

    const toggleDropdown = (name) => {
        if (isCollapsed) {
            setIsSidebarCollapsed(false);
        }
        setOpenDropdown(prev => (prev === name ? '' : name));
    };

    useEffect(() => {
        const activeParent = finalMenuItems.find(item =>
            item.isDropdown && item.subItems.some(sub => location.pathname.startsWith(sub.path))
        );
        if (activeParent && !isCollapsed) {
            setOpenDropdown(activeParent.name);
        } else if (isCollapsed) {
            setOpenDropdown('');
        }
    }, [location.pathname, finalMenuItems, isCollapsed]);
    
    const handleToggleSidebar = () => {
        setIsSidebarCollapsed(prevState => !prevState);
    };

    const handleLinkClick = (notificationId) => {
        if (notificationId === 'support') {
            setSupportNotification(false);
        }
    };

    return (
        <nav className={`sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`}>
            <div className="sidebar-header">
                <img src={user.logo_url || logo} alt={user.nome_empresa || "Guincho Oliveira"} className="sidebar-logo" />
                {!isCollapsed && <span className="sidebar-title">{user.nome_empresa || "Guincho Oliveira"}</span>}
            </div>

            <button onClick={handleToggleSidebar} className="sidebar-toggle">
                {isCollapsed ? '»' : '«'}
            </button>

            <ul className="sidebar-menu">
                {finalMenuItems.map((item) => (
                    <MenuItem
                        key={item.name}
                        item={item}
                        isCollapsed={isCollapsed}
                        openDropdown={openDropdown}
                        toggleDropdown={toggleDropdown}
                        handleLinkClick={handleLinkClick}
                        location={location}
                        supportNotification={supportNotification}
                        perfil={perfil}
                    />
                ))}
            </ul>
        </nav>
    );
}