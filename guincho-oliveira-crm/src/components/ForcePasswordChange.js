import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import './ForcePasswordChange.css'; // Vamos criar este CSS
import logo from '../logo_guincho.png';
import { toast } from 'react-toastify';

export default function ForcePasswordChange() {
    const navigate = useNavigate();
    const location = useLocation();
    const userId = location.state?.userId;

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    if (!userId) {
        // Se não houver ID, redireciona de volta para o login
        navigate('/');
        return null;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            toast.error("As senhas não coincidem.");
            return;
        }
        if (newPassword.length < 6) {
            toast.warn("A senha deve ter no mínimo 6 caracteres.");
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/api/usuarios/set-initial-password', {
                userId,
                newPassword
            });
            toast.success(response.data.message);
            navigate('/'); // Redireciona para a página de login
        } catch (error) {
            toast.error(error.response?.data?.error || "Falha ao atualizar a senha.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="force-change-background">
            <div className="force-change-box">
                <img src={logo} alt="Logo" className="force-change-logo" />
                <h3>Primeiro Acesso</h3>
                <p>Para sua segurança, por favor, defina uma nova senha para continuar.</p>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="newPassword">Nova Senha:</label>
                        <input
                            type="password"
                            id="newPassword"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirme a Nova Senha:</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="submit-button" disabled={loading}>
                        {loading ? 'Salvando...' : 'Definir Senha e Continuar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
