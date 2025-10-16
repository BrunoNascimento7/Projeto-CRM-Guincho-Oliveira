import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import './UserProfileHeader.css';

function UserProfileHeader({ user, onLogout, onThemeUpdate }) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Otimização: useCallback memoriza a função para que ela não seja recriada a cada renderização
    const handleClickOutside = useCallback((event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            setIsDropdownOpen(false);
        }
    }, []); // O array de dependências vazio significa que a função nunca muda

    useEffect(() => {
        // Adiciona o listener quando o componente monta
        document.addEventListener("mousedown", handleClickOutside);
        // Remove o listener quando o componente desmonta para evitar vazamentos de memória
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [handleClickOutside]); // A dependência agora é a função memorizada

    if (!user) {
        return <div className="user-profile-header-loading">A carregar...</div>;
    }

    const handleThemeToggle = async () => {
        const newTheme = user.tema === 'light' ? 'dark' : 'light';
        try {
            const token = localStorage.getItem('token');
            await api.put('/usuarios/me/tema', { tema: newTheme }, { headers: { 'Authorization': `Bearer ${token}` } });
            onThemeUpdate(newTheme);
        } catch (error) {
            console.error("Erro ao guardar o tema", error);
        }
    };

    const getInitials = (name) => {
        if (!name) return '';
        const names = name.split(' ');
        const initials = names.map(n => n[0]).join('');
        return initials.slice(0, 2).toUpperCase();
    }

    return (
        <div className="user-profile-header-container">
            <div className="user-profile-header" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                <img
                    src={user.foto_perfil || `https://ui-avatars.com/api/?name=${getInitials(user.nome)}&background=101C5D&color=fff&bold=true`}
                    alt="Foto do Perfil"
                    className="profile-avatar"
                />
                <span className="profile-name">{user.nome}</span>
                <span className={`dropdown-arrow ${isDropdownOpen ? 'open' : ''}`}>▼</span>
            </div>

            {isDropdownOpen && (
                <div className="profile-dropdown" ref={dropdownRef}>
                    <div className="dropdown-header">
                        <strong>{user.nome}</strong>
                        <span className="user-profile-role">{user.perfil}</span>
                    </div>
                    <hr className="dropdown-divider" />
                    <div className="dropdown-item theme-toggle">
                        <span>Modo Escuro</span>
                        <label className="theme-toggle-switch">
                            <input type="checkbox" checked={user.tema === 'dark'} onChange={handleThemeToggle} />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    <hr className="dropdown-divider" />
                    <div className="logout-button-wrapper">
                        <div className="logout-button" onClick={onLogout}>
                            Sair
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default UserProfileHeader;