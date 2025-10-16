import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './MinhasOrdens.css';
import { FaPlusCircle, FaCheckCircle, FaFilter, FaChartBar } from 'react-icons/fa';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const getMesAtual = () => {
    const date = new Date();
    const primeiroDia = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
    const ultimoDia = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { primeiroDia, ultimoDia };
};

const OrdemListItem = ({ ordem, dateField }) => {
    const dateValue = ordem[dateField];
    return (
        <li className={`os-list-item status-${ordem.status.replace(/\s/g, '').toLowerCase()}`}>
            <div className="os-item-info">
                <strong>OS #{ordem.id}</strong>
                <span>Cliente: {ordem.nome_cliente || 'N/A'}</span>
            </div>
            <div className="os-item-details">
                <span>{dateValue ? new Date(dateValue).toLocaleDateString('pt-BR') : 'Data Inválida'}</span>
                {/* O status badge só aparece se a OS estiver na lista de "Criadas" */}
                {dateField === 'data_criacao' && <span className="os-status-badge">{ordem.status}</span>}
            </div>
        </li>
    );
};

export default function MinhasOrdens() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ ordensCriadas: 0, ordensConcluidas: 0 });
    const [listas, setListas] = useState({ criadas: [], concluidas: [] });
    const [dadosGrafico, setDadosGrafico] = useState([]);
    const [loading, setLoading] = useState(true);
    const [periodo, setPeriodo] = useState(getMesAtual());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            // ======================= CORREÇÃO APLICADA AQUI =======================
            const response = await api.get('/api/produtividade/usuario', {
            // ======================================================================
                headers: { 'Authorization': `Bearer ${token}` },
                params: {
                    dataInicio: periodo.primeiroDia,
                    dataFim: periodo.ultimoDia
                }
            });
            setStats({
                ordensCriadas: response.data.ordensCriadas,
                ordensConcluidas: response.data.ordensConcluidas
            });

            // --- LÓGICA DE FILTRAGEM APLICADA AQUI ---
            const listaCriadasBruta = response.data.listaCriadas || [];
            const listaConcluidasBruta = response.data.listaConcluidas || [];
            
            // Filtra a lista de "Criadas" para exibir apenas as que NÃO foram concluídas.
            const criadasFiltradas = listaCriadasBruta.filter(os => os.status !== 'Concluído');

            setListas({
                criadas: criadasFiltradas,
                concluidas: listaConcluidasBruta
            });
            // --- FIM DA LÓGICA DE FILTRAGEM ---

            setDadosGrafico(response.data.dadosGrafico || []);
        } catch (error) {
            console.error('Erro ao carregar dados de produtividade:', error);
            alert('Não foi possível carregar os dados.');
        } finally {
            setLoading(false);
        }
    }, [periodo]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handlePeriodoChange = (e) => {
        const { name, value } = e.target;
        setPeriodo(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="minhas-ordens-container">
            <button onClick={() => navigate(-1)} className="back-button">Voltar</button>
            <h1 className="minhas-ordens-header">Minha Produtividade</h1>

            <div className="card">
                <h2 className="card-title"><FaFilter /> Filtrar Período de Análise</h2>
                <div className="filters-container">
                    <div className="filter-group">
                        <label htmlFor="primeiroDia">Data Início:</label>
                        <input
                            type="date" id="primeiroDia" name="primeiroDia"
                            className="filter-input" value={periodo.primeiroDia}
                            onChange={handlePeriodoChange}
                        />
                    </div>
                    <div className="filter-group">
                        <label htmlFor="ultimoDia">Data Fim:</label>
                        <input
                            type="date" id="ultimoDia" name="ultimoDia"
                            className="filter-input" value={periodo.ultimoDia}
                            onChange={handlePeriodoChange}
                        />
                    </div>
                    <button onClick={fetchData} className="submit-button" disabled={loading}>
                        {loading ? 'Buscando...' : 'Buscar'}
                    </button>
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <FaPlusCircle className="stat-icon created" />
                    <div className="stat-info">
                        <h2>{stats.ordensCriadas}</h2>
                        <p>Ordens Criadas por Mim</p>
                    </div>
                </div>
                <div className="stat-card">
                    <FaCheckCircle className="stat-icon completed" />
                    <div className="stat-info">
                        <h2>{stats.ordensConcluidas}</h2>
                        <p>Ordens Concluídas por Mim</p>
                    </div>
                </div>
            </div>
            
            <div className="card">
                <h2 className="card-title"><FaChartBar /> Desempenho Diário no Período</h2>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                            data={dadosGrafico}
                            margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                            <XAxis dataKey="dia" />
                            <YAxis allowDecimals={false} />
                            <Tooltip wrapperStyle={{ borderColor: '#ccc', boxShadow: '2px 2px 10px #eee' }}/>
                            <Legend />
                            <Bar dataKey="criadas" name="Criadas" fill="#007bff" />
                            <Bar dataKey="concluidas" name="Concluídas" fill="#28a745" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            
            <div className="ordens-grid-container">
                <div className="list-column list-column-criadas">
                    <h3>Criadas no Período ({listas.criadas.length})</h3>
                    <div className="os-list-container">
                        {loading ? <p className="os-list-empty">Carregando...</p> : listas.criadas.length > 0 ? (
                            <ul className="os-list">
                                {listas.criadas.map(os => <OrdemListItem key={`c-${os.id}`} ordem={os} dateField="data_criacao" />)}
                            </ul>
                        ) : <p className="os-list-empty">Nenhuma ordem criada ou pendente.</p>}
                    </div>
                </div>
                <div className="list-column list-column-concluidas">
                    <h3>Concluídas no Período ({listas.concluidas.length})</h3>
                     <div className="os-list-container">
                        {loading ? <p className="os-list-empty">Carregando...</p> : listas.concluidas.length > 0 ? (
                            <ul className="os-list">
                                {listas.concluidas.map(os => <OrdemListItem key={`f-${os.id}`} ordem={os} dateField="data_conclusao" />)}
                            </ul>
                        ) : <p className="os-list-empty">Nenhuma ordem concluída.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}