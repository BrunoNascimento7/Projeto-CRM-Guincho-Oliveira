import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import api from '../services/api';
import { toast } from 'react-toastify';
import './SystemHubDashboard.css';
import { FaBuilding, FaUserFriends, FaToggleOn, FaChartLine, FaTachometerAlt } from 'react-icons/fa';

// Registra os componentes necessários do Chart.js
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// Sub-componente para os cards de KPI
const KpiCard = ({ icon, value, label, isLoading }) => (
    <div className="hub-kpi-card">
        <div className="hub-kpi-icon">{icon}</div>
        <div className="hub-kpi-info">
            {isLoading ? (
                <div className="skeleton-line" style={{ width: '50px', height: '30px' }}></div>
            ) : (
                <span className="hub-kpi-value">{value}</span>
            )}
            <span className="hub-kpi-label">{label}</span>
        </div>
    </div>
);

export default function SystemHubDashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const token = localStorage.getItem('token');
                const { data } = await api.get('/api/system-hub/dashboard-stats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setStats(data);
            } catch (error) {
                toast.error("Não foi possível carregar as estatísticas do sistema.");
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    const chartData = {
        labels: stats?.clientGrowth?.map(item => item.mes) || [],
        datasets: [
            {
                label: 'Novos Clientes por Mês',
                data: stats?.clientGrowth?.map(item => item.novos_clientes) || [],
                backgroundColor: '#101C5D',
                borderRadius: 5,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                text: 'Crescimento de Clientes (Últimos 12 Meses)',
                font: { size: 16, family: 'Poppins' },
                color: '#333'
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    stepSize: 1
                }
            }
        }
    };

    return (
        <div className="system-hub-container">
            <div className="hub-header">
                <h1><FaTachometerAlt /> Dashboard do Sistema</h1>
            </div>

            <div className="hub-kpi-grid">
                <KpiCard icon={<FaBuilding />} value={stats?.totalClients ?? 0} label="Total de Clientes" isLoading={loading} />
                <KpiCard icon={<FaToggleOn />} value={stats?.activeClients ?? 0} label="Clientes Ativos" isLoading={loading} />
                <KpiCard icon={<FaUserFriends />} value={stats?.totalUsers ?? 0} label="Total de Usuários" isLoading={loading} />
                <KpiCard icon={<FaChartLine />} value={stats?.monthlyGrowthRate ?? '0%'} label="Crescimento Mensal" isLoading={loading} />
            </div>

            <div className="hub-chart-container">
                {loading ? (
                    <p>Carregando gráfico...</p>
                ) : (
                    <Bar options={chartOptions} data={chartData} />
                )}
            </div>
        </div>
    );
}