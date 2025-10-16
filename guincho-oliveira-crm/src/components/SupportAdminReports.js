// src/components/SupportAdminReports.js

import React, { useState, useEffect } from 'react';
import api from '../services/api'; // Ajuste o caminho se necessário
import { toast } from 'react-toastify';
import { FaChartBar, FaCheckCircle, FaStar, FaSpinner } from 'react-icons/fa';
import './SupportAdminReports.css'; // Criaremos este arquivo

// Importações e configuração da Chart.js
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

const KpiCard = ({ title, value, icon, suffix = '' }) => (
    <div className="report-kpi-card">
        <div className="kpi-icon">{icon}</div>
        <div className="kpi-info">
            <span className="kpi-value">{value}{suffix}</span>
            <span className="kpi-title">{title}</span>
        </div>
    </div>
);

export default function SupportAdminReports() {
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const { data } = await api.get('/api/admin/suporte-config/reports/main-dashboard');
                setReportData(data);
            } catch (error) {
                toast.error('Não foi possível carregar os dados dos relatórios.');
            } finally {
                setLoading(false);
            }
        };
        fetchReports();
    }, []);

    if (loading) {
        return <div className="loading-view-fullpage"><FaSpinner className="spinner" /> Carregando relatórios...</div>;
    }

    if (!reportData) {
        return <div className="empty-state">Não há dados suficientes para gerar relatórios.</div>;
    }

    const chartOptions = {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            title: { display: true, font: { size: 16 } }
        }
    };

    return (
        <div className="reports-page-container">
            <header className="reports-header">
                <FaChartBar />
                <h1>Relatórios de Desempenho do Suporte</h1>
            </header>

            <div className="kpi-grid">
                <KpiCard 
                    title="SLA de Resolução Cumprido" 
                    value={reportData.kpis.sla_performance}
                    suffix="%"
                    icon={<FaCheckCircle />} 
                />
                <KpiCard 
                    title="Média de Satisfação (CSAT)" 
                    value={reportData.kpis.csat_score}
                    suffix="/5"
                    icon={<FaStar />}
                />
            </div>

            <div className="charts-grid">
                <div className="chart-card">
                    <Line 
                        options={{...chartOptions, plugins: {...chartOptions.plugins, title: {...chartOptions.plugins.title, text: 'Volume: Abertos vs. Resolvidos (Últimos 30 dias)'}}}}
                        data={reportData.charts.volume_ultimos_30dias}
                    />
                </div>
                <div className="chart-card">
                    <Bar 
                        options={{...chartOptions, plugins: {...chartOptions.plugins, title: {...chartOptions.plugins.title, text: 'Top 5 Categorias com Mais Chamados'}}}}
                        data={reportData.charts.top_categorias}
                    />
                </div>
            </div>
        </div>
    );
}