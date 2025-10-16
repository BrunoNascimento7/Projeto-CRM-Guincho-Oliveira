// Em: src/components/GmudDashboard.js (ou onde você o salvou)

import React, { useState, useEffect } from 'react';
// ALTERADO: Trocamos 'useHistory' por 'useNavigate'
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FaSpinner, FaTools, FaCheckCircle, FaExclamationCircle, FaPlayCircle, FaStopCircle, FaBan, FaHourglassHalf } from 'react-icons/fa';
import './GmudDashboard.css';

// O mapa de status permanece o mesmo
const statusMap = {
    Pendente: { icon: FaHourglassHalf, color: '#6c757d', text: 'Pendente' },
    Aprovada: { icon: FaCheckCircle, color: '#17a2b8', text: 'Aprovada' },
    'Em Execução': { icon: FaPlayCircle, color: '#007bff', text: 'Em Execução' },
    Concluída: { icon: FaCheckCircle, color: '#28a745', text: 'Concluída' },
    Rejeitada: { icon: FaBan, color: '#dc3545', text: 'Rejeitada' },
    Cancelada: { icon: FaStopCircle, color: '#ffc107', text: 'Cancelada' },
};

const GmudDashboard = () => {
    const [gmuds, setGmuds] = useState([]);
    const [loading, setLoading] = useState(true);
    // ALTERADO: Inicializamos o useNavigate
    const navigate = useNavigate();

    useEffect(() => {
        const fetchGmuds = async () => {
            try {
                const { data } = await api.get('/api/gmud');
                setGmuds(data);
            } catch (error) {
                toast.error('Falha ao carregar as Gestões de Mudança.');
            } finally {
                setLoading(false);
            }
        };
        fetchGmuds();
    }, []);

    const handleRowClick = (id) => {
        // ALTERADO: Usamos navigate() em vez de history.push()
        // O caminho também foi ajustado para corresponder exatamente ao definido no App.js
        navigate(`/suporte-admin/gmud/${id}`); 
    };

    if (loading) {
        return <div className="loading-view"><FaSpinner className="spinner" /> Carregando...</div>;
    }

    return (
        <div className="admin-dashboard-container">
            <header className="dashboard-header">
                <h1><FaTools /> Painel de Gestão de Mudanças (GMUD)</h1>
                {/* <button className="btn-primary">Nova GMUD Manual</button> */}
            </header>

            <div className="dashboard-content">
                <table className="main-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Título</th>
                            <th>Status</th>
                            <th>Tipo</th>
                            <th>Início da Janela</th>
                            <th>Fim da Janela</th>
                            <th>Solicitante</th>
                        </tr>
                    </thead>
                    <tbody>
                        {gmuds.length > 0 ? gmuds.map(gmud => {
                            const statusInfo = statusMap[gmud.status] || statusMap.Pendente;
                            return (
                                <tr key={gmud.id} onClick={() => handleRowClick(gmud.id)} style={{cursor: 'pointer'}}>
                                    <td>#{gmud.id}</td>
                                    <td>{gmud.titulo}</td>
                                    <td>
                                        <span className="status-badge" style={{ backgroundColor: statusInfo.color }}>
                                            <statusInfo.icon /> {statusInfo.text}
                                        </span>
                                    </td>
                                    <td>{gmud.tipo}</td>
                                    <td>{new Date(gmud.janela_inicio).toLocaleString('pt-BR')}</td>
                                    <td>{new Date(gmud.janela_fim).toLocaleString('pt-BR')}</td>
                                    <td>{gmud.solicitante_nome}</td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center' }}>Nenhuma GMUD registrada.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default GmudDashboard;