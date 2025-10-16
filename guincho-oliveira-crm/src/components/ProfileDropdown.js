// src/components/ProfileDropdown.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FaSignOutAlt, FaCalculator, FaEnvelope, FaCamera, FaUserCircle, FaCog, FaBook } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../services/api';
import './ProfileDropdown.css';

// Hook para detectar cliques fora do componente (Mantido)
function useOnClickOutside(ref, handler) {
    useEffect(() => {
        const listener = (event) => {
            if (!ref.current || ref.current.contains(event.target)) return;
            handler(event);
        };
        document.addEventListener('mousedown', listener);
        document.addEventListener('touchstart', listener);
        return () => {
            document.removeEventListener('mousedown', listener);
            document.removeEventListener('touchstart', listener);
        };
    }, [ref, handler]);
}

// Sub-componente para a Calculadora (Mantido)
const Calculadora = ({ onClose }) => {
    const [display, setDisplay] = useState('0');
    const calculadoraRef = useRef(null);
    useOnClickOutside(calculadoraRef, onClose);
    const handleButtonClick = useCallback((value) => {
        setDisplay((prevDisplay) => {
            if (prevDisplay === 'Erro') return value === 'C' ? '0' : value;
            if (value === '=') {
                try {
                    const result = eval(prevDisplay.replace(/[^-()\d/*+.]/g, ''));
                    return String(result);
                } catch { return 'Erro'; }
            } else if (value === 'C') {
                return '0';
            } else if (prevDisplay === '0' && value !== '.') {
                return value;
            } else {
                return prevDisplay + value;
            }
        });
    }, []);
    useEffect(() => {
        const handleKeyPress = (event) => {
            const { key } = event;
            if (/[0-9+\-*/.=C]/.test(key)) {
                event.preventDefault();
                handleButtonClick(key === 'Enter' ? '=' : key);
            } else if (key === 'Escape') {
                onClose();
            } else if (key === 'Backspace') {
                setDisplay((prev) => (prev.length > 1 && prev !== 'Erro' ? prev.slice(0, -1) : '0'));
            }
        };
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [handleButtonClick, onClose]);
    const buttons = ['C', '+/-', '%', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '='];
    return (
        <div className="calculadora-modal-overlay">
            <div className="calculadora-modal" ref={calculadoraRef}>
                <div className="calculadora-display">{display}</div>
                <div className="calculadora-botoes">
                    {buttons.map(btn => (
                        <button key={btn} onClick={() => handleButtonClick(btn)} className={`calculadora-btn ${['/', '*', '-', '+', '=', 'C'].includes(btn) ? 'operador' : ''} ${btn === '0' ? 'zero' : ''} ${btn === '=' ? 'igual' : ''}`}>
                            {btn === '+/-' ? '±' : btn}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

// Componente Principal do Dropdown
export default function ProfileDropdown({ user, onLogout, onThemeUpdate, onPhotoUpdate }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isCalculadoraOpen, setIsCalculadoraOpen] = useState(false);
    const dropdownRef = useRef(null);
    const fileInputRef = useRef(null);
    useOnClickOutside(dropdownRef, () => setIsOpen(false));

    const handleThemeChange = (e) => {
        onThemeUpdate(e.target.checked ? 'dark' : 'light');
    };
    const handlePhotoUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('foto_perfil', file);
        try {
            const token = localStorage.getItem('token');
            const { data } = await api.put('/usuarios/me/foto', formData, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Foto de perfil atualizada!');
            onPhotoUpdate(data.foto_perfil_url);
            setIsOpen(false);
        } catch (error) {
            toast.error('Erro ao enviar a foto. Tente uma imagem com menos de 2MB.');
        }
    };
    const handleOpenCalculadora = useCallback((e) => {
        e.stopPropagation();
        setIsCalculadoraOpen(true);
        setIsOpen(false);
    }, []);

    return (
        <div className="profile-dropdown-container" ref={dropdownRef}>
            <div className="user-profile-header" onClick={() => setIsOpen(!isOpen)}>
                <img src={user.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nome)}&background=101C5D&color=fff`} alt="Avatar" className="profile-avatar" />
                <span className="profile-name-header">{user.nome.split(' ')[0]}</span>
                <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}>▼</span>
            </div>
            {isOpen && (
                <div className="profile-dropdown">
                    <div className="dropdown-profile-info">
                        <div className="dropdown-avatar-container">
                            <img src={user.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.nome)}&background=101C5D&color=fff&size=64`} alt="Avatar" className="profile-avatar-large" />
                            <button className="change-photo-overlay" onClick={() => fileInputRef.current.click()} title="Alterar foto"><FaCamera /></button>
                            <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} style={{ display: 'none' }} accept="image/png, image/jpeg" />
                        </div>
                        <div className="user-details">
                            <strong>{user.nome}</strong>
                            <span>{user.email}</span>
                        </div>
                    </div>
                    <div className="dropdown-section">
                        <Link to="/meu-perfil" className="dropdown-item" onClick={() => setIsOpen(false)}>
    <FaUserCircle /> <span>Meu Perfil</span>
</Link>
                    </div>
                    <div className="dropdown-section">
                        <div className="dropdown-section-title">Ferramentas Rápidas</div>
                        <div className="dropdown-item" onClick={handleOpenCalculadora}>
                            <FaCalculator /> <span>Calculadora</span>
                        </div>
                        <a href="https://mail.google.com/" target="_blank" rel="noopener noreferrer" className="dropdown-item">
                            <FaEnvelope /> <span>Acessar Webmail</span>
                        </a>
                        <Link to="/base-conhecimento" className="dropdown-item" onClick={() => setIsOpen(false)}>
                            <FaBook /> <span>Base de Conhecimento</span>
                        </Link>
                    </div>
                    <div className="dropdown-section">
                        <div className="dropdown-section-title">Configurações</div>
                        <div className="dropdown-item theme-item">
                            <FaCog /> <span>Modo Escuro</span>
                            <label className="theme-toggle-switch">
                                <input type="checkbox" checked={user.tema === 'dark'} onChange={handleThemeChange} />
                                <span className="slider round"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div className="logout-button-wrapper">
                        <div className="logout-button" onClick={onLogout}>
                            {/* ===== TEXTO ALTERADO AQUI ===== */}
                            <FaSignOutAlt /> <span>Sair</span>
                        </div>
                    </div>
                    
                    <div className="dropdown-footer">
                        <span className="system-version">Versão 1.0.0</span>
                    </div>
                </div>
            )}
            {isCalculadoraOpen && <Calculadora onClose={() => setIsCalculadoraOpen(false)} />}
        </div>
    );
}