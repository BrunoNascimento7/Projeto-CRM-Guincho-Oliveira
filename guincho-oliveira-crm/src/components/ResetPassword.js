import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import './ResetPassword.css';
import logo from '../logo_guincho.png';

const EyeIcon = ({ visible }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {visible ? (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </>
      )}
    </svg>
  );

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (newPassword.length < 6) {
            setError("A senha deve ter no mínimo 6 caracteres.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("As senhas não coincidem.");
            return;
        }
        
        setLoading(true);
        try {
            await api.post('/password-reset/update-password', { token, newPassword });
            setSuccess("Senha redefinida com sucesso! Você já pode fazer o login.");
        } catch (err) {
            setError(err.response?.data?.error || "Ocorreu um erro. O link pode ter expirado.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="reset-password-background">
            <div className="reset-password-box">
                <img src={logo} alt="Logo" className="logo"/>
                <h2>Criar Nova Senha</h2>
                
                {success ? (
                    <div className="success-container">
                        <p className="success-message">{success}</p>
                        <Link to="/login" className="login-button-link">Ir para o Login</Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <p>Digite e confirme sua nova senha abaixo.</p>
                        <div className="form-group password-wrapper">
                            <label htmlFor="newPassword">Nova Senha:</label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="newPassword"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                            <span className="password-toggle-icon" onClick={() => setShowPassword(!showPassword)}>
                                <EyeIcon visible={showPassword} />
                            </span>
                        </div>
                        <div className="form-group password-wrapper">
                            <label htmlFor="confirmPassword">Confirmar Senha:</label>
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                            <span className="password-toggle-icon" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                <EyeIcon visible={showConfirmPassword} />
                            </span>
                        </div>

                        {error && <p className="error-message">{error}</p>}
                        
                        <button type="submit" className="reset-button" disabled={loading}>
                            {loading ? 'A salvar...' : 'Salvar Nova Senha'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
