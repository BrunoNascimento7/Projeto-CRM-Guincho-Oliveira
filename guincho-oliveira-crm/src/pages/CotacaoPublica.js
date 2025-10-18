// src/pages/CotacaoPublica.js

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import './CotacaoPublica.css';

// REMOVIDO: A linha de import do logo foi removida
// import logo from '../public/logo_guincho.png'; 

export default function CotacaoPublica() {
    const { uid } = useParams();
    const [cotacao, setCotacao] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCotacao = async () => {
            try {
                // Use a variável de ambiente para a URL da API, se tiver configurado
                const apiUrl = process.env.REACT_APP_API_URL || 'https://projeto-crm-guincho-oliveira.onrender.com'; // Ajuste a porta se o seu backend não for 3001
                const response = await axios.get(`${apiUrl}/api/public/cotacao/${uid}`);
                setCotacao(response.data);
            } catch (err) {
                setError('Cotação não encontrada ou expirada.');
            } finally {
                setLoading(false);
            }
        };

        if (uid) {
            fetchCotacao();
        }
    }, [uid]);

    if (loading) return <div className="public-page-container"><p>Carregando cotação...</p></div>;
    if (error) return <div className="public-page-container"><p className="error-message">{error}</p></div>;
    if (!cotacao) return <div className="public-page-container"><p className="error-message">Não foi possível carregar os dados da cotação.</p></div>;


    const { dados_cotacao, valor_total, criado_em, nome_cliente } = cotacao;
    const { formData, rotaInfo, calculoDetalhado } = dados_cotacao;

    return (
        <div className="public-page-container">
            <div className="public-card">
                <header className="public-header">
                    {/* ALTERADO: O caminho agora é direto para a raiz pública */}
                    <img src="/logo_guincho.png" alt="Logo da Empresa" className="public-logo" />
                    <h1>Orçamento de Serviço</h1>
                    <p>Cotação #{uid}</p>
                </header>

                <section>
                    <h2>Detalhes da Rota</h2>
                    <div className="detail-grid">
                        <span>Cliente:</span><strong>{nome_cliente || 'Cliente Avulso'}</strong>
                        <span>Data:</span><strong>{new Date(criado_em).toLocaleDateString('pt-BR')}</strong>
                        <span>Partida:</span><strong>{formData.partida}, {formData.numeroPartida}</strong>
                        <span>Chegada:</span><strong>{formData.chegada}, {formData.numeroChegada}</strong>
                        <span>Distância:</span><strong>{rotaInfo.distanciaKm} km</strong>
                    </div>
                </section>

                <section>
                    <h2>Detalhamento Financeiro</h2>
                    <div className="detail-grid finance-grid">
                        <span>Veículo / Serviço</span><strong>{formData.tipoVeiculo} / {formData.tipoServico}</strong>
                        <span>Valor Fixo:</span><strong>R$ {calculoDetalhado.valorFixo.toFixed(2)}</strong>
                        <span>Custo Distância:</span><strong>R$ {calculoDetalhado.custoKm.toFixed(2)}</strong>
                         {calculoDetalhado.adicionalNoturno > 0 && (
                           <><span>Adicional Noturno:</span><strong>R$ {calculoDetalhado.adicionalNoturno.toFixed(2)}</strong></>
                        )}
                         {calculoDetalhado.desconto > 0 && (
                           <><span>Desconto:</span><strong className="desconto">- R$ {calculoDetalhado.desconto.toFixed(2)}</strong></>
                        )}
                    </div>
                </section>
                
                <footer className="public-footer">
                    <span>TOTAL</span>
                    <span className="total-value">R$ {parseFloat(valor_total).toFixed(2)}</span>
                </footer>
            </div>
        </div>
    );
}