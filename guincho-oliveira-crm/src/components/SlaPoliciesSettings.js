// src/components/SlaPoliciesSettings.js

import React, { useState, useEffect } from 'react';
import axios from 'axios'; // ou a biblioteca que você usa para chamadas HTTP
import './SlaPoliciesSettings.css'; // Crie um CSS básico para ele

const PRIORIDADES = ['Urgente', 'Alta', 'Normal', 'Baixa'];

const SlaPoliciesSettings = () => {
    // Inicializa o estado com a estrutura esperada, com valores padrão
    const [politicas, setPoliticas] = useState(
        PRIORIDADES.map(p => ({
            prioridade: p,
            tempo_primeira_resposta_minutos: 0,
            tempo_resolucao_minutos: 0
        }))
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Efeito para buscar os dados da API quando o componente montar
    useEffect(() => {
        const fetchPoliticas = async () => {
            try {
                // Lembre-se de colocar a URL base da sua API em uma variável de ambiente!
                const response = await axios.get('/api/admin/suporte-config/sla-politicas');
                
                // Atualiza o estado com os dados do banco, mantendo as prioridades que não vieram
                const dadosDoBanco = response.data;
                const politicasAtualizadas = PRIORIDADES.map(p => {
                    const politicaDoBanco = dadosDoBanco.find(db => db.prioridade === p);
                    return politicaDoBanco || { prioridade: p, tempo_primeira_resposta_minutos: 0, tempo_resolucao_minutos: 0 };
                });

                setPoliticas(politicasAtualizadas);
            } catch (err) {
                console.error("Erro ao buscar políticas de SLA:", err);
                setError('Não foi possível carregar as políticas de SLA.');
            } finally {
                setLoading(false);
            }
        };

        fetchPoliticas();
    }, []); // Array vazio significa que executa apenas uma vez, na montagem

    // Função para atualizar o estado quando um input muda
    const handleInputChange = (prioridade, campo, valor) => {
        setPoliticas(politicasAtuais =>
            politicasAtuais.map(p =>
                p.prioridade === prioridade ? { ...p, [campo]: parseInt(valor, 10) || 0 } : p
            )
        );
    };

    // Função para salvar os dados na API
    const handleSavePolicies = async (e) => {
        e.preventDefault();
        try {
            await axios.put('/api/admin/suporte-config/sla-politicas', politicas);
            alert('Políticas de SLA salvas com sucesso!'); // Ou um componente de notificação mais elegante
        } catch (err) {
            console.error("Erro ao salvar políticas de SLA:", err);
            alert('Falha ao salvar as políticas de SLA.');
        }
    };

    if (loading) return <p>Carregando configurações de SLA...</p>;
    if (error) return <p style={{ color: 'red' }}>{error}</p>;

    return (
        <div className="sla-settings-card">
            <h3>Políticas de SLA por Prioridade</h3>
            <p>Defina os tempos máximos (em minutos) para a primeira resposta e para a resolução final de um chamado.</p>
            <form onSubmit={handleSavePolicies}>
                <div className="sla-table">
                    <div className="sla-table-header">
                        <div>Prioridade</div>
                        <div>Tempo de Resposta (min)</div>
                        <div>Tempo de Resolução (min)</div>
                    </div>
                    <div className="sla-table-body">
                        {politicas.map((politica) => (
                            <div className="sla-table-row" key={politica.prioridade}>
                                <div><strong>{politica.prioridade}</strong></div>
                                <div>
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={politica.tempo_primeira_resposta_minutos}
                                        onChange={(e) => handleInputChange(politica.prioridade, 'tempo_primeira_resposta_minutos', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={politica.tempo_resolucao_minutos}
                                        onChange={(e) => handleInputChange(politica.prioridade, 'tempo_resolucao_minutos', e.target.value)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <button type="submit" className="btn btn-primary mt-3">
                    Salvar Políticas de SLA
                </button>
            </form>
        </div>
    );
};

export default SlaPoliciesSettings;