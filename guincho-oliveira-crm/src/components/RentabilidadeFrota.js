// src/pages/RentabilidadeFrota.js

import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { FaChartBar, FaMoneyBillWave, FaGasPump, FaTools } from 'react-icons/fa';
import './RentabilidadeFrota.css';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function RentabilidadeFrota() {
    const [dadosFrota, setDadosFrota] = useState([]);
    const [loading, setLoading] = useState(true);
    const [periodo, setPeriodo] = useState('mensal');

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/rentabilidade/frota?periodo=${periodo}`);
            setDadosFrota(res.data);
        } catch (error) {
            console.error("Erro ao buscar dados de rentabilidade:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [periodo]);

    // Dados para o Gráfico de Barras de Lucro
    const chartData = {
        labels: dadosFrota.map(v => v.placa),
        datasets: [
            {
                label: 'Lucro Líquido',
                data: dadosFrota.map(v => v.lucro_liquido),
                backgroundColor: dadosFrota.map(v => v.lucro_liquido >= 0 ? 'rgba(40, 167, 69, 0.7)' : 'rgba(220, 53, 69, 0.7)'),
                borderColor: dadosFrota.map(v => v.lucro_liquido >= 0 ? 'rgba(40, 167, 69, 1)' : 'rgba(220, 53, 69, 1)'),
                borderWidth: 1,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: `Lucro Líquido da Frota (${periodo})`,
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Lucro (R$)',
                },
                ticks: {
                    callback: function(value) {
                        return formatCurrency(value);
                    }
                }
            },
        },
    };

    return (
        <div className="content-page rentabilidade-page">
            <div className="page-header">
                <h1><FaChartBar /> Análise de Rentabilidade da Frota</h1>
            </div>

            <div className="period-selector">
                <button onClick={() => setPeriodo('mensal')} className={periodo === 'mensal' ? 'active' : ''}>Mês Atual</button>
                <button onClick={() => setPeriodo('semanal')} className={periodo === 'semanal' ? 'active' : ''}>Últimos 7 dias</button>
                <button onClick={() => setPeriodo('anual')} className={periodo === 'anual' ? 'active' : ''}>Ano Atual</button>
            </div>

            <div className="main-grid">
                <div className="chart-area card">
                    <Bar data={chartData} options={chartOptions} />
                </div>
                
                <div className="kpi-area card">
                    <h2>Métricas da Frota</h2>
                    <div className="kpi-list">
                        <div className="kpi-item">
                            <FaMoneyBillWave className="kpi-icon" />
                            <div className="kpi-content">
                                <h3>Total Faturado</h3>
                                <p>{formatCurrency(dadosFrota.reduce((acc, curr) => acc + curr.total_receita, 0))}</p>
                            </div>
                        </div>
                        <div className="kpi-item">
                            <FaGasPump className="kpi-icon" />
                            <div className="kpi-content">
                                <h3>Total de Despesas</h3>
                                <p>{formatCurrency(dadosFrota.reduce((acc, curr) => acc + curr.total_despesa, 0))}</p>
                            </div>
                        </div>
                        <div className="kpi-item">
                            <FaTools className="kpi-icon" />
                            <div className="kpi-content">
                                <h3>Lucro Total</h3>
                                <p>{formatCurrency(dadosFrota.reduce((acc, curr) => acc + curr.lucro_liquido, 0))}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="tabela-rentabilidade card">
                <h2>Detalhes por Veículo</h2>
                <table className="rentabilidade-table">
                    <thead>
                        <tr>
                            <th>Veículo</th>
                            <th>Placa</th>
                            <th>Faturamento</th>
                            <th>Despesas</th>
                            <th>Lucro Líquido</th>
                            <th>ROI (%)</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="7">Carregando...</td></tr>
                        ) : (
                            dadosFrota.map(veiculo => (
                                <tr key={veiculo.id} className={veiculo.lucro_liquido < 0 ? 'perda' : ''}>
                                    <td>{veiculo.modelo}</td>
                                    <td>{veiculo.placa}</td>
                                    <td>{formatCurrency(veiculo.total_receita)}</td>
                                    <td>{formatCurrency(veiculo.total_despesa)}</td>
                                    <td>{formatCurrency(veiculo.lucro_liquido)}</td>
                                    <td>{veiculo.roi.toFixed(2)}%</td>
                                    <td className={`status-cell ${veiculo.lucro_liquido >= 0 ? 'positivo' : 'negativo'}`}>
                                        {veiculo.lucro_liquido >= 0 ? 'Rentável' : 'Prejuízo'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}