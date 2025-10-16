// src/components/VincularChamadoModal.js

import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './VincularChamadoModal.css'; // Criaremos este CSS
import { FaSpinner } from 'react-icons/fa';

const VincularChamadoModal = ({ gmudId, onClose, onVinculoAdicionado }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchChamados = async () => {
            if (searchTerm.length < 2) {
                setResults([]);
                return;
            }
            setLoading(true);
            try {
                const { data } = await api.get(`/api/gmud/busca/chamados-para-vincular?q=${searchTerm}`);
                setResults(data);
            } catch (error) {
                console.error("Falha ao buscar chamados", error);
            } finally {
                setLoading(false);
            }
        };

        const debounce = setTimeout(() => {
            fetchChamados();
        }, 500); // Espera 500ms após o usuário parar de digitar

        return () => clearTimeout(debounce);
    }, [searchTerm]);

    const handleVincular = async (chamadoId) => {
        try {
            await api.post(`/api/gmud/${gmudId}/vincular-chamado`, { chamado_id: chamadoId });
            onVinculoAdicionado(); // Avisa o componente pai para recarregar os dados
            onClose(); // Fecha o modal
        } catch (error) {
            console.error("Falha ao vincular chamado", error);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Vincular Incidente à GMUD #{gmudId}</h2>
                <input
                    type="text"
                    placeholder="Digite o ID ou título do chamado..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="search-input"
                />
                <div className="results-list">
                    {loading && <FaSpinner className="spinner" />}
                    {!loading && results.length === 0 && searchTerm.length > 1 && <p>Nenhum chamado encontrado.</p>}
                    {results.map(chamado => (
                        <div key={chamado.id} className="result-item">
                            <span>#{chamado.id} - {chamado.titulo}</span>
                            <button onClick={() => handleVincular(chamado.id)}>Vincular</button>
                        </div>
                    ))}
                </div>
                <button onClick={onClose} className="close-button">Fechar</button>
            </div>
        </div>
    );
};

export default VincularChamadoModal;