// src/components/SystemHubConfiguracoes.js

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
// ALTERADO: Importando o arquivo CSS correto e específico para este componente
import './SystemHubConfiguracoes.css'; 
import { 
    FaTools, FaExclamationTriangle, FaCheckCircle, 
    FaCalendarPlus, FaTrash, FaSpinner, FaClock,
    FaRegCalendarAlt, FaUserCircle
} from 'react-icons/fa';

// Componente para exibir o status de manutenção de forma estilizada
const MaintenanceStatusCard = ({ isMaintenanceActive, handleToggleMaintenance, loading }) => (
    <div className="status-maintenance-card">
        <div className={`status-display ${isMaintenanceActive ? 'active' : 'inactive'}`}>
            <div className="status-icon-wrapper">
                {isMaintenanceActive ? <FaExclamationTriangle /> : <FaCheckCircle />}
            </div>
            <div className="status-info-content">
                <h4 className="status-title">Modo Manutenção Global</h4>
                <p className="status-description">
                    {isMaintenanceActive 
                        ? 'Atualmente ATIVADO. Apenas "Admin Geral" pode acessar o sistema.' 
                        : 'Atualmente DESATIVADO. O sistema opera normalmente.'}
                </p>
            </div>
        </div>
        <button 
            onClick={handleToggleMaintenance}
            className={`btn-action ${isMaintenanceActive ? 'btn-danger' : 'btn-primary'}`}
            disabled={loading}
        >
            {loading 
                ? <><FaSpinner className="icon-spin" /> Aguarde...</> 
                : (isMaintenanceActive ? 'Desativar Agora' : 'Ativar Manualmente')}
        </button>
    </div>
);

// Componente para formatar e exibir os agendamentos
const ScheduleListItem = ({ ag, clientes, handleCancelSchedule, loading }) => {
    const clienteNome = ag.cliente_id ? clientes.find(c => c.id === ag.cliente_id)?.nome_empresa : 'Global';
    const dataInicio = new Date(ag.data_inicio).toLocaleString('pt-BR');
    const dataFim = new Date(ag.data_fim).toLocaleString('pt-BR');

    return (
        <li key={ag.id} className="schedule-item"> 
            <div className="schedule-item-info">
                <span className="schedule-item-client">
                    <FaUserCircle className="icon-small" /> {clienteNome}
                </span>
                <small className="schedule-item-time"><FaClock /> Início: {dataInicio}</small>
                <small className="schedule-item-time"><FaClock /> Fim: {dataFim}</small>
            </div>
            <button 
                onClick={() => handleCancelSchedule(ag.id)} 
                className="btn-delete-schedule" 
                title="Cancelar Agendamento"
                disabled={loading}
            >
                <FaTrash />
            </button>
        </li>
    );
};

export default function SystemHubConfiguracoes() {
    const [isMaintenanceActive, setIsMaintenanceActive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [clientes, setClientes] = useState([]);
    const [agendamentos, setAgendamentos] = useState([]);
    
    const [newSchedule, setNewSchedule] = useState({
        data_inicio: '',
        data_fim: '',
        cliente_id: 'todos',
        motivo: ''
    });

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        try {
            const [
                { data: statusData }, 
                { data: clientesData }, 
                { data: agendamentosData }
            ] = await Promise.all([
                api.get('/api/system-hub/maintenance-status'),
                api.get('/api/system-hub/clientes'),
                api.get('/api/system-hub/maintenance/schedules')   
            ]);

            setIsMaintenanceActive(statusData.maintenanceMode);
            setClientes(clientesData);
            setAgendamentos(agendamentosData);

        } catch (error) {
            toast.error("Falha ao carregar dados de manutenção.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleToggleMaintenance = async () => {
        const newStatus = !isMaintenanceActive;
        const action = newStatus ? "ATIVAR" : "DESATIVAR";
        if (window.confirm(`Tem certeza que deseja ${action} o MODO MANUTENÇÃO GLOBAL imediatamente?`)) {
            setLoading(true);
            try {
                await api.put('/api/system-hub/settings/maintenance', { status: newStatus });
                setIsMaintenanceActive(newStatus);
                toast.success(`Modo Manutenção Global ${newStatus ? 'ativado' : 'desativado'} com sucesso!`);
            } catch (error) {
                toast.error("Falha ao alterar o modo manutenção global.");
            } finally {
                setLoading(false);
            }
        }
    };

    const handleScheduleChange = (e) => {
        setNewSchedule({ ...newSchedule, [e.target.name]: e.target.value });
    };

    const handleScheduleSubmit = async (e) => {
        e.preventDefault();
        if (!newSchedule.data_inicio || !newSchedule.data_fim || !newSchedule.motivo) {
            toast.warn("Por favor, preencha todos os campos, incluindo o motivo.");
            return;
        }
        if (new Date(newSchedule.data_fim) <= new Date(newSchedule.data_inicio)) {
            toast.warn("A data de fim deve ser posterior à data de início.");
            return;
        }

        setLoading(true);
        try {
            await api.post('/api/system-hub/maintenance/schedule', newSchedule);
            toast.success("Manutenção agendada e GMUD registrada com sucesso!");
            setNewSchedule({ data_inicio: '', data_fim: '', cliente_id: 'todos', motivo: '' });
            fetchStatus(); // Recarrega tudo para mostrar a nova GMUD na outra tela
        } catch (error) {
            toast.error(error.response?.data?.error || "Falha ao agendar manutenção.");
        } finally {
            setLoading(false);
        }
    };

    const handleCancelSchedule = async (scheduleId) => {
        if (window.confirm("Tem certeza que deseja cancelar este agendamento?")) {
            setLoading(true);
            try {
                await api.delete(`/api/system-hub/maintenance/schedule/${scheduleId}`);
                toast.success("Agendamento cancelado com sucesso.");
                fetchStatus();
            } catch (error) {
                toast.error("Falha ao cancelar o agendamento.");
            } finally {
                setLoading(false);
            }
        }
    };
    
    return (
        // ALTERADO: Classe principal para "escopar" o CSS e evitar conflitos
        <div className="system-hub-configuracoes-page">
            <div className="page-header">
                <h1><FaTools /> Gerenciamento de Manutenção</h1>
            </div>
            
            {/* Card de Status */}
            <div className="main-config-card status-container">
                <h3>Status Atual do Sistema</h3>
                <MaintenanceStatusCard 
                    isMaintenanceActive={isMaintenanceActive}
                    handleToggleMaintenance={handleToggleMaintenance}
                    loading={loading}
                />
            </div>

            {/* Card de Agendar Nova Manutenção */}
            <div className="main-config-card schedule-form-container">
                <h3><FaCalendarPlus /> Agendar Nova Manutenção</h3>
                <form onSubmit={handleScheduleSubmit} className="schedule-form">
                    <div className="form-group">
                        <label htmlFor="cliente_id">Cliente Alvo</label>
                        <select 
                            id="cliente_id"
                            name="cliente_id" 
                            value={newSchedule.cliente_id} 
                            onChange={handleScheduleChange} 
                            disabled={loading}
                        >
                            <option value="todos">Todos os Clientes (Global)</option>
                            {clientes.map(cliente => (
                                <option key={cliente.id} value={cliente.id}>{cliente.nome_empresa}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-date-row">
                        <div className="form-group">
                            <label htmlFor="data_inicio">Data e Hora de Início</label>
                            <input 
                                id="data_inicio"
                                type="datetime-local" 
                                name="data_inicio" 
                                value={newSchedule.data_inicio} 
                                onChange={handleScheduleChange} 
                                disabled={loading} 
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="data_fim">Data e Hora de Fim</label>
                            <input 
                                id="data_fim"
                                type="datetime-local" 
                                name="data_fim" 
                                value={newSchedule.data_fim} 
                                onChange={handleScheduleChange} 
                                disabled={loading} 
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="motivo">Motivo da Manutenção (será o título da GMUD)</label>
                        <input 
                            id="motivo"
                            type="text" 
                            name="motivo" 
                            value={newSchedule.motivo} 
                            onChange={handleScheduleChange} 
                            placeholder="Ex: Atualização do Servidor Principal"
                            required 
                            disabled={loading} 
                        />
                    </div>

                    <button type="submit" className="btn-action btn-success submit-btn" disabled={loading}>
                        {loading ? <><FaSpinner className="icon-spin" /> Agendando...</> : 'Agendar Manutenção'}
                    </button>
                </form>
            </div>
            
            {/* Card de Próximos Agendamentos */}
            <div className="main-config-card schedules-list-container">
                <h3>Próximos Agendamentos</h3>
                {loading && agendamentos.length === 0 ? (
                    <p className="loading-text"><FaSpinner className="icon-spin" /> Carregando agendamentos...</p>
                ) : (
                    <ul className="schedule-list">
                        {agendamentos.length > 0 ? agendamentos.map(ag => (
                            <ScheduleListItem key={ag.id} ag={ag} clientes={clientes} handleCancelSchedule={handleCancelSchedule} loading={loading} />
                        )) : (
                            <p className="no-schedules-message">Nenhuma manutenção agendada.</p>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
}