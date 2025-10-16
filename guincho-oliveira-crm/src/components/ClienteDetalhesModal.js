// src/components/ClienteDetalhesModal.js
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { format } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import './ClienteDetalhesModal.css';
import { FaTimes, FaCalendarAlt, FaDollarSign, FaChartLine, FaHistory, FaCommentDots, FaEnvelope, FaSms, FaSpinner } from 'react-icons/fa';

export default function ClienteDetalhesModal({ clienteId, onClose }) {
    const [details, setDetails] = useState(null);
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- ALTERADO: Estados específicos para o formulário de comunicação ---
    const [tipoComunicacao, setTipoComunicacao] = useState('SMS');
    const [mensagem, setMensagem] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [feedback, setFeedback] = useState({ tipo: '', texto: '' }); // {tipo: 'sucesso' | 'erro', texto: '...'}

    useEffect(() => {
        if (!clienteId) return;
        
        const fetchDetails = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await api.get(`/api/clients/${clienteId}/details`);
                setDetails(response.data.details);
                setHistory(response.data.history);
            } catch (err) {
                setError('Não foi possível carregar os detalhes do cliente.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [clienteId]);

    // --- ALTERADO: Lógica de envio de comunicação aprimorada ---
    const handleComunicacaoSubmit = async (e) => {
        e.preventDefault();
        if (!mensagem.trim()) {
            setFeedback({ tipo: 'erro', texto: 'A mensagem não pode estar vazia.' });
            return;
        }

        setIsSending(true);
        setFeedback({ tipo: '', texto: '' }); // Limpa feedback anterior

        try {
            // Enviamos o tipo de comunicação selecionado e a mensagem
            await api.post(`/api/clients/${clienteId}/comunicacao`, {
                tipo: tipoComunicacao,
                mensagem: mensagem
            });
            
            setFeedback({ tipo: 'sucesso', texto: `${tipoComunicacao} enviado com sucesso!` });
            setMensagem(''); // Limpa o campo após o envio

        } catch (error) {
            // Tenta pegar a mensagem de erro específica do backend
            const errorMsg = error.response?.data?.error || `Falha ao enviar ${tipoComunicacao}.`;
            setFeedback({ tipo: 'erro', texto: errorMsg });
        } finally {
            setIsSending(false);
            // Faz o feedback sumir após 5 segundos
            setTimeout(() => setFeedback({ tipo: '', texto: '' }), 5000);
        }
    };

    const renderContent = () => {
        if (isLoading) return <div className="loading-spinner"><FaSpinner className="spinner" /></div>;
        if (error) return <p className="error-message">{error}</p>;
        if (!details) return null;

        const { nome, faturamento_total, lucro_total, percentual_lucro, total_servicos, primeiro_servico_data, dias_desde_ultimo_servico } = details;

        return (
            <>
                <div className="modal-header">
                    <h2>{nome}</h2>
                    <button onClick={onClose} className="close-button"><FaTimes /></button>
                </div>

                {/* PAINEL DE INSIGHTS */}
                <div className="insights-grid">
                    <div className="insight-card">
                        <h4><FaDollarSign /> Faturamento Total</h4>
                        <span>{parseFloat(faturamento_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                    <div className="insight-card">
                        <h4><FaChartLine /> Lucro Total</h4>
                        <span className={lucro_total >= 0 ? 'profit' : 'loss'}>{parseFloat(lucro_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        <small>{(percentual_lucro || 0).toFixed(2)}% de Margem</small>
                    </div>
                    <div className="insight-card">
                        <h4><FaHistory /> Total de Serviços</h4>
                        <span>{total_servicos}</span>
                    </div>
                    <div className={`insight-card ${dias_desde_ultimo_servico > 90 ? 'churn-risk' : ''}`}>
                        <h4><FaCalendarAlt /> Atividade</h4>
                        <span>{dias_desde_ultimo_servico === null ? 'Novo Cliente' : `${dias_desde_ultimo_servico} dias inativo`}</span>
                        <small>Desde: {primeiro_servico_data ? format(new Date(primeiro_servico_data), 'dd/MM/yyyy') : 'N/A'}</small>
                    </div>
                </div>

                <div className="modal-body-grid">
                    {/* HISTÓRICO DE SERVIÇOS */}
                    <div className="section">
                        <h3><FaHistory /> Histórico de Serviços</h3>
                        <ul className="history-list">
                            {history.length > 0 ? history.map(servico => (
                                <li key={servico.id}>
                                    <div className="history-item-header">
                                        <strong>OS #{servico.id} - {servico.descricao}</strong>
                                        <span>{format(new Date(servico.data_criacao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span>
                                    </div>
                                    <div className="history-item-body">
                                        <span>Status: <span className={`status-${servico.status?.toLowerCase()}`}>{servico.status}</span></span>
                                        <span>Valor: {parseFloat(servico.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                </li>
                            )) : <p>Nenhum serviço registrado.</p>}
                        </ul>
                    </div>

                    {/* CENTRAL DE COMUNICAÇÃO */}
                    <div className="section">
                        <h3><FaCommentDots /> Registrar Comunicação</h3>
                        <form onSubmit={handleComunicacaoSubmit}>
                            <div className="comunicacao-tipo">
                                <button type="button" className={tipoComunicacao === 'Email' ? 'active' : ''} onClick={() => setTipoComunicacao('Email')}><FaEnvelope/> Email</button>
                                <button type="button" className={tipoComunicacao === 'SMS' ? 'active' : ''} onClick={() => setTipoComunicacao('SMS')}><FaSms/> SMS</button>
                            </div>
                            <textarea
                                value={mensagem}
                                onChange={(e) => setMensagem(e.target.value)}
                                placeholder={`Digite a mensagem do ${tipoComunicacao} aqui...`}
                                rows="5"
                                disabled={isSending} // NOVO: Desabilita enquanto envia
                            ></textarea>
                            {/* NOVO: Feedback de sucesso ou erro */}
                            {feedback.texto && (
                                <p className={`feedback ${feedback.tipo}`}>{feedback.texto}</p>
                            )}
                            <button type="submit" className="submit-button" disabled={isSending}>
                                {/* NOVO: Texto dinâmico e ícone de loading */}
                                {isSending ? <><FaSpinner className="spinner"/> Enviando...</> : 'Registrar Contato'}
                            </button>
                        </form>
                    </div>
                </div>
            </>
        );
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content large" onClick={e => e.stopPropagation()}>
                {renderContent()}
            </div>
        </div>
    );
}