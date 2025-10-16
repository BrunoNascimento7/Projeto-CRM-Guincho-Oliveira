// src/pages/FluxoCaixaProjetado.js

import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js';
import { FaMoneyBillWave, FaChartLine, FaExclamationTriangle, FaPlusCircle, FaFileCsv } from 'react-icons/fa';
import './FluxoCaixaProjetado.css';

// Registra os componentes do ChartJS
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Função para formatar moeda
const formatCurrency = (value) => {
    if (typeof value !== 'number') {
        value = 0;
    }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function FluxoCaixaProjetado() {
    const [diasProjecao, setDiasProjecao] = useState(30);
    const [projecaoOriginal, setProjecaoOriginal] = useState(null); // Armazena a projeção base da API
    const [loading, setLoading] = useState(true);
    const [simulacoes, setSimulacoes] = useState([]);
    const [isSimulacaoModalOpen, setIsSimulacaoModalOpen] = useState(false);
    const [novaSimulacao, setNovaSimulacao] = useState({ tipo: 'despesa', descricao: '', valor: '', data: '' });

    // Busca os dados da API
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await api.get(`/api/fluxo-caixa/projetado?dias=${diasProjecao}`);
                setProjecaoOriginal(res.data);
            } catch (error) {
                console.error("Falha ao buscar dados da projeção:", error);
                setProjecaoOriginal(null);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [diasProjecao]);

    // Lógica de projeção otimizada com useMemo
    // Recalcula a projeção apenas quando os dados originais ou as simulações mudam
    const projecaoData = useMemo(() => {
        if (!projecaoOriginal?.dadosGrafico) return null;

        const dadosProjetadosMap = new Map(projecaoOriginal.dadosGrafico.map(d => [d.data, { ...d }]));

        simulacoes.forEach(sim => {
            if (dadosProjetadosMap.has(sim.data)) {
                const dia = dadosProjetadosMap.get(sim.data);
                const valorSimulacao = parseFloat(sim.valor);
                if (sim.tipo === 'despesa') {
                    dia.despesas += valorSimulacao;
                } else {
                    dia.receitas += valorSimulacao;
                }
            }
        });

        let saldoAcumulado = projecaoOriginal.saldoInicial;
        const dadosFinais = projecaoOriginal.dadosGrafico.map(d_original => {
            const diaModificado = dadosProjetadosMap.get(d_original.data);
            saldoAcumulado += (diaModificado.receitas - d_original.receitas) - (diaModificado.despesas - d_original.despesas);
            const saldoFinalDia = projecaoOriginal.saldoInicial + diaModificado.receitas - diaModificado.despesas;
            
            // Lógica corrigida para recalcular o saldo acumulado
            // Esta parte é complexa, uma abordagem mais simples é recalcular tudo do zero.
            return { ...diaModificado, saldo: 0 }; // Placeholder, será recalculado abaixo
        });

        // Recalculo completo e correto do saldo dia a dia
        let saldoCorrente = projecaoOriginal.saldoInicial;
        const dadosComSaldoCorreto = dadosFinais.map(dia => {
            saldoCorrente += dia.receitas - dia.despesas;
            return { ...dia, saldo: saldoCorrente };
        });


        return {
            saldoInicial: projecaoOriginal.saldoInicial,
            dadosGrafico: dadosComSaldoCorreto
        };

    }, [projecaoOriginal, simulacoes]);

    // KPIs calculados com useMemo para performance
    const kpis = useMemo(() => {
        if (!projecaoData) return { saldoMinimo: 0, dataSaldoMinimo: '-', saldoFinal: 0 };
        
        const saldos = projecaoData.dadosGrafico.map(d => d.saldo);
        if (saldos.length === 0) return { saldoMinimo: projecaoData.saldoInicial, dataSaldoMinimo: '-', saldoFinal: projecaoData.saldoInicial };
        
        const saldoMinimo = Math.min(...saldos);
        const diaSaldoMinimo = projecaoData.dadosGrafico.find(d => d.saldo === saldoMinimo);

        return {
            saldoMinimo: saldoMinimo,
            dataSaldoMinimo: diaSaldoMinimo ? new Date(diaSaldoMinimo.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-',
            saldoFinal: saldos.at(-1) || 0,
        };
    }, [projecaoData]);


    const handleAddSimulacao = () => {
        if (novaSimulacao.descricao && novaSimulacao.valor && novaSimulacao.data) {
            setSimulacoes(prev => [...prev, { ...novaSimulacao, valor: parseFloat(novaSimulacao.valor) }]);
            setIsSimulacaoModalOpen(false);
            setNovaSimulacao({ tipo: 'despesa', descricao: '', valor: '', data: '' });
        }
    };

    const handleRemoveSimulacao = (index) => {
        setSimulacoes(prev => prev.filter((_, i) => i !== index));
    };

    const handleExportCSV = () => {
        if (!projecaoData) return;
        const headers = "Data,Receitas,Despesas,Saldo";
        const rows = projecaoData.dadosGrafico.map(d => `${new Date(d.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })},"${formatCurrency(d.receitas)}","${formatCurrency(d.despesas)}","${formatCurrency(d.saldo)}"`);
        const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `projecao_fluxo_caixa_${diasProjecao}dias.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const data = {
        labels: projecaoData?.dadosGrafico.map(item => new Date(item.data).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', timeZone: 'UTC'})),
        datasets: [{
            label: 'Saldo Projetado',
            data: projecaoData?.dadosGrafico.map(item => item.saldo),
            segment: {
                borderColor: ctx => ctx.p0.raw < 0 || ctx.p1.raw < 0 ? '#dc3545' : 'rgb(53, 162, 235)',
            },
            tension: 0.3,
            fill: false,
        }],
    };
    
    const options = {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Projeção do Saldo de Caixa' },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return `Saldo: ${formatCurrency(context.parsed.y)}`;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: false,
                title: { display: true, text: 'Saldo (R$)' },
                ticks: {
                    callback: function(value) {
                        return formatCurrency(value);
                    }
                }
            }
        },
    };

    return (
        <div className="content-page fluxo-caixa-page">
            <div className="page-header">
                <h1><FaChartLine /> Fluxo de Caixa Projetado</h1>
            </div>

            <div className="cash-flow-cards">
                <div className="cash-flow-card">
                    <h3><FaMoneyBillWave /> Saldo Atual</h3>
                    <p className="kpi-value">{loading ? '...' : formatCurrency(projecaoData?.saldoInicial)}</p>
                </div>
                <div className="cash-flow-card">
                    <h3><FaExclamationTriangle /> Saldo Mínimo Projetado</h3>
                    <p className="kpi-value warning">{loading ? '...' : formatCurrency(kpis.saldoMinimo)}</p>
                    <p className="kpi-insight">Previsto para: {kpis.dataSaldoMinimo}</p>
                </div>
                <div className="cash-flow-card">
                    <h3><FaChartLine /> Saldo Final Projetado</h3>
                    <p className={`kpi-value ${kpis.saldoFinal >= 0 ? 'success' : 'warning'}`}>{loading ? '...' : formatCurrency(kpis.saldoFinal)}</p>
                </div>
            </div>

            <div className="main-content-area">
                <div className="chart-container">
                    {loading ? <p>Carregando projeção...</p> : projecaoData && <Line data={data} options={options} />}
                </div>

                <div className="side-panel">
                    <h3>Período de Projeção</h3>
                    <div className="period-buttons">
                        <button onClick={() => setDiasProjecao(30)} className={diasProjecao === 30 ? 'active' : ''}>30 dias</button>
                        <button onClick={() => setDiasProjecao(60)} className={diasProjecao === 60 ? 'active' : ''}>60 dias</button>
                        <button onClick={() => setDiasProjecao(90)} className={diasProjecao === 90 ? 'active' : ''}>90 dias</button>
                    </div>

                    <div className="simulacao-box">
                        <h4>Simulação de Cenários ("E se...")</h4>
                        <ul className="simulacao-list">
                            {simulacoes.length === 0 && <li className="simulacao-item-empty">Nenhuma simulação adicionada.</li>}
                            {simulacoes.map((sim, index) => (
                                <li key={index} className={`simulacao-item ${sim.tipo}`}>
                                    <span>{sim.descricao} - {formatCurrency(sim.valor)} ({new Date(sim.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })})</span>
                                    <button onClick={() => handleRemoveSimulacao(index)}>&times;</button>
                                </li>
                            ))}
                        </ul>
                        <button className="btn-add-simulacao" onClick={() => setIsSimulacaoModalOpen(true)}>
                            <FaPlusCircle /> Adicionar Simulação
                        </button>
                    </div>
                     <button className="btn-export-csv" onClick={handleExportCSV}>
                        <FaFileCsv /> Exportar CSV
                    </button>
                </div>
            </div>

            {isSimulacaoModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h4>Adicionar Simulação</h4>
                        <div className="form-group">
                            <label>Tipo</label>
                            <select name="tipo" value={novaSimulacao.tipo} onChange={(e) => setNovaSimulacao({ ...novaSimulacao, tipo: e.target.value })}>
                                <option value="despesa">Despesa</option>
                                <option value="receita">Receita</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Descrição</label>
                            <input type="text" name="descricao" value={novaSimulacao.descricao} onChange={(e) => setNovaSimulacao({ ...novaSimulacao, descricao: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Valor</label>
                            <input type="number" name="valor" step="0.01" value={novaSimulacao.valor} onChange={(e) => setNovaSimulacao({ ...novaSimulacao, valor: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Data</label>
                            <input type="date" name="data" value={novaSimulacao.data} onChange={(e) => setNovaSimulacao({ ...novaSimulacao, data: e.target.value })} />
                        </div>
                        <div className="modal-footer">
                            <button className="btn-cancelar" onClick={() => setIsSimulacaoModalOpen(false)}>Cancelar</button>
                            <button className="btn-salvar" onClick={handleAddSimulacao}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}