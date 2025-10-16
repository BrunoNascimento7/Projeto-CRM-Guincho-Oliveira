// src/pages/MeuPerfil.js (VERSÃO FINAL E CORRIGIDA)

import React, { useState, useEffect } from 'react';
import { FaUserEdit, FaSave, FaTimes, FaKey, FaCheckCircle, FaClipboardList } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../services/api';
import './MeuPerfil.css';

const StatCard = ({ icon, label, value }) => (
    <div className="stat-card">
        <div className="stat-icon">{icon}</div>
        <div className="stat-info">
            {/* Adicionamos uma verificação para exibir '0' se o valor não estiver pronto */}
            <span className="stat-value">{value !== undefined ? value : 0}</span>
            <span className="stat-label">{label}</span>
        </div>
    </div>
);

const PasswordChangeModal = ({ onClose, onPasswordChanged }) => {
    const [senhaAtual, setSenhaAtual] = useState('');
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmaNovaSenha, setConfirmaNovaSenha] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (novaSenha !== confirmaNovaSenha) {
            toast.error("As novas senhas não coincidem.");
            return;
        }
        if (novaSenha.length < 6) {
            toast.error("A nova senha deve ter no mínimo 6 caracteres.");
            return;
        }
        try {
            await api.put('/api/usuarios/perfil/senha', { senhaAtual, novaSenha });
            toast.success("Senha alterada com sucesso!");
            onPasswordChanged();
        } catch (error) {
            const errorMessage = error.response?.data?.error || "Não foi possível alterar a senha.";
            toast.error(errorMessage);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <form onSubmit={handleSubmit}>
                    <h2><FaKey /> Alterar Senha</h2>
                    <div className="form-group">
                        <label>Senha Atual</label>
                        <input type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Nova Senha</label>
                        <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Confirmar Nova Senha</label>
                        <input type="password" value={confirmaNovaSenha} onChange={e => setConfirmaNovaSenha(e.target.value)} required />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn-save">Salvar Senha</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function MeuPerfil() {
    const [perfil, setPerfil] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({ email: '', telefone: '' });
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

    useEffect(() => {
        const fetchPerfil = async () => {
            try {
                const { data } = await api.get('/api/usuarios/perfil');
                setPerfil(data);
                setFormData({ email: data.email, telefone: data.telefone || '' });
            } catch (error) {
                toast.error("Não foi possível carregar os dados do perfil.");
            } finally {
                setLoading(false);
            }
        };
        fetchPerfil();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        try {
            await api.put('/api/usuarios/perfil', formData);
            setPerfil(prev => ({ ...prev, ...formData }));
            toast.success("Perfil atualizado com sucesso!");
            setIsEditing(false);
        } catch (error) {
            const errorMessage = error.response?.data?.error || "Não foi possível salvar as alterações.";
            toast.error(errorMessage);
        }
    };

    if (loading) {
        return <div className="loading-container">Carregando perfil...</div>;
    }

    if (!perfil) {
        return <div className="loading-container">Não foi possível carregar o perfil.</div>;
    }

    return (
        <div className="perfil-container">
            <div className="perfil-card">
                <div className="perfil-sidebar">
                    <img
                        src={perfil.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(perfil.nome)}&background=101C5D&color=fff&size=128`}
                        alt="Foto de Perfil"
                        className="perfil-avatar"
                    />
                    <h1>{perfil.nome}</h1>
                    <span className="perfil-role">{perfil.perfil?.replace('_', ' ').toUpperCase()}</span>
                    {perfil.data_criacao && (
    <p className="perfil-membro-desde">
        Membro desde {new Date(perfil.data_criacao).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
    </p>
)}
                </div>

                <div className="perfil-main">
                    <div className="perfil-stats">
                        {/* ===== AQUI ESTÁ A CORREÇÃO PRINCIPAL ===== */}
                        {/* Usamos optional chaining (?.) para ler os valores de forma segura */}
                        <StatCard icon={<FaCheckCircle />} label="OS Resolvidas" value={perfil?.stats?.os_resolvidas} />
                        <StatCard icon={<FaClipboardList />} label="OS Criadas" value={perfil?.stats?.os_criadas} />
                    </div>
                    
                    <div className="perfil-details">
                        <h2>Detalhes da Conta</h2>
                        <div className="detail-item">
                            <label>E-mail</label>
                            {isEditing ? (
                                <input type="email" name="email" value={formData.email} onChange={handleInputChange} />
                            ) : (
                                <span>{perfil.email}</span>
                            )}
                        </div>
                        <div className="detail-item">
                            <label>Telefone</label>
                            {isEditing ? (
                                <input type="tel" name="telefone" value={formData.telefone} onChange={handleInputChange} placeholder="(XX) XXXXX-XXXX" />
                            ) : (
                                <span>{perfil.telefone || 'Não informado'}</span>
                            )}
                        </div>

                        <div className="perfil-actions">
                            {isEditing ? (
                                <>
                                    <button className="btn-cancel" onClick={() => setIsEditing(false)}><FaTimes /> Cancelar</button>
                                    <button className="btn-save" onClick={handleSave}><FaSave /> Salvar</button>
                                </>
                            ) : (
                                <button className="btn-edit" onClick={() => setIsEditing(true)}><FaUserEdit /> Editar Perfil</button>
                            )}
                        </div>
                    </div>

                    <div className="perfil-security">
                        <h2>Segurança</h2>
                        <div className="detail-item">
                            <label>Senha</label>
                            <span>********</span>
                        </div>
                        <button className="btn-secondary" onClick={() => setIsPasswordModalOpen(true)}>
                            <FaKey /> Alterar Senha
                        </button>
                    </div>
                </div>
            </div>
            {isPasswordModalOpen && <PasswordChangeModal onClose={() => setIsPasswordModalOpen(false)} onPasswordChanged={() => setIsPasswordModalOpen(false)} />}
        </div>
    );
}