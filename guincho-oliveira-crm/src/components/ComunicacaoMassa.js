import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './ComunicacaoMassa.css';
import { FaPaperPlane, FaSpinner, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

export default function ComunicacaoMassa() {
    // --- TODOS OS HOOKS DEVEM ESTAR AQUI DENTRO ---
    const [clientes, setClientes] = useState([]);
    const [tagsDinamicas, setTagsDinamicas] = useState([]);
    const [templates, setTemplates] = useState([]); // Hook para os templates dinâmicos
    const [clientesSelecionados, setClientesSelecionados] = useState(new Set());
    const [mensagem, setMensagem] = useState('');
    const [termoBusca, setTermoBusca] = useState('');
    
    const [loading, setLoading] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState(null);

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                // Busca todos os dados necessários em paralelo
                const [clientesRes, tagsRes, templatesRes] = await Promise.all([
                    api.get('/api/clients/list-for-simulator'),
                    api.get('/api/tags'),
                    api.get('/api/templates')
                ]);
                setClientes(clientesRes.data);
                setTagsDinamicas(tagsRes.data);
                setTemplates(templatesRes.data);
            } catch (err) {
                console.error("Erro ao buscar dados iniciais:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const handleSelectCliente = (clienteId) => {
        const novaSelecao = new Set(clientesSelecionados);
        if (novaSelecao.has(clienteId)) {
            novaSelecao.delete(clienteId);
        } else {
            novaSelecao.add(clienteId);
        }
        setClientesSelecionados(novaSelecao);
    };

    const clientesFiltrados = clientes.filter(c =>
        c.nome.toLowerCase().includes(termoBusca.toLowerCase()) || c.telefone?.includes(termoBusca)
    );
    
    const selecionarTodos = () => setClientesSelecionados(new Set(clientesFiltrados.map(c => c.id)));
    const limparSelecao = () => setClientesSelecionados(new Set());
    const handleTemplateChange = (e) => setMensagem(e.target.value);

    const handleEnviarCampanha = async () => {
        if (clientesSelecionados.size === 0 || !mensagem.trim()) {
            alert('Selecione ao menos um cliente e escreva uma mensagem.');
            return;
        }
        if (!window.confirm(`Enviar campanha para ${clientesSelecionados.size} cliente(s)?`)) return;

        setEnviando(true);
        setResultado(null);
        try {
            const response = await api.post('/api/clients/send-sms-mass', {
                clientIds: Array.from(clientesSelecionados),
                mensagem: mensagem
            });
            setResultado({ sucesso: true, ...response.data });
        } catch (error) {
            setResultado({ sucesso: false, message: 'Erro ao conectar com o servidor.', ...error.response?.data });
        } finally {
            setEnviando(false);
        }
    };

    const charCount = mensagem.length;
    const smsCount = Math.ceil(charCount / 160);

    return (
        <div className="comunicacao-container">
            <h1 className="comunicacao-title">Central de Comunicação em Massa</h1>
            {resultado && (
                <div className={`resultado-banner ${resultado.sucesso ? 'sucesso' : 'erro'}`}>
                    {resultado.sucesso ? <FaCheckCircle/> : <FaExclamationTriangle/>}
                    <div>
                        <strong>{resultado.message}</strong>
                        {resultado.sucesso && <p>Enviados: {resultado.enviados} | Falhas: {resultado.falhas}</p>}
                        {resultado.error && <p>Detalhe: {resultado.error}</p>}
                    </div>
                </div>
            )}

            <div className="comunicacao-grid">
                <div className="painel-clientes">
                    <h2>1. Selecione os Destinatários</h2>
                    <input
                        type="text"
                        placeholder="Buscar por nome ou telefone..."
                        className="busca-cliente"
                        value={termoBusca}
                        onChange={e => setTermoBusca(e.target.value)}
                    />
                    <div className="botoes-selecao">
                        <button onClick={selecionarTodos}>Selecionar Todos (Visíveis)</button>
                        <button onClick={limparSelecao}>Limpar Seleção</button>
                    </div>
                    <div className="lista-clientes">
                        {loading ? <p>Carregando clientes...</p> : clientesFiltrados.map(cliente => (
                            <div key={cliente.id} className="item-cliente">
                                <input
                                    type="checkbox"
                                    id={`cliente-${cliente.id}`}
                                    checked={clientesSelecionados.has(cliente.id)}
                                    onChange={() => handleSelectCliente(cliente.id)}
                                />
                                <label htmlFor={`cliente-${cliente.id}`}>
                                    <strong>{cliente.nome}</strong>
                                    <span>{cliente.telefone || 'Sem telefone'}</span>
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="painel-mensagem">
                    <h2>2. Crie sua Mensagem</h2>
                    <label htmlFor="templates">Comece com um modelo (opcional):</label>
                    <select id="templates" onChange={handleTemplateChange} className="select-template">
                        <option value="">Selecione um template...</option>
                        {templates.map(t => <option key={t.id} value={t.texto}>{t.nome}</option>)}
                    </select>
                    <textarea
                        placeholder="Digite sua mensagem aqui..."
                        rows="10" value={mensagem} onChange={e => setMensagem(e.target.value)}
                    ></textarea>
                    
                    <div className="info-mensagem">
                        <div className="tags-disponiveis">
                            <strong>Tags:</strong>
                            <span className="tag" title="Primeiro nome do cliente">{'{{nome_cliente}}'}</span>
                            {tagsDinamicas.map(tag => (
                                <span key={tag.tag_nome} className="tag" title={tag.descricao}>
                                    {`{{${tag.tag_nome}}}`}
                                </span>
                            ))}
                        </div>
                        <span>{charCount} chars ({smsCount} SMS)</span>
                    </div>

                    <button className="botao-enviar" onClick={handleEnviarCampanha} disabled={enviando || clientesSelecionados.size === 0}>
                        {enviando ? <FaSpinner className="spinner" /> : <FaPaperPlane />}
                        Enviar para {clientesSelecionados.size} cliente(s)
                    </button>
                </div>
            </div>
        </div>
    );
}