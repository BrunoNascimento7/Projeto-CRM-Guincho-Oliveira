import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { FaTasks, FaWrench } from 'react-icons/fa';
import './ChatWidget.css'; // Reutilizaremos alguns estilos

// Hook para "atrasar" a busca enquanto o usuário digita
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

export default function LinkTaskModal({ onClose, onLink }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    const searchItems = useCallback(async (query) => {
        if (query) {
            setIsLoading(true);
            try {
                const token = localStorage.getItem('token');
                const { data } = await api.get(`/api/search-linkables?query=${query}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setResults(data);
            } catch (error) {
                console.error("Erro na busca:", error);
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        } else {
            setResults([]);
        }
    }, []);

    useEffect(() => {
        searchItems(debouncedSearchTerm);
    }, [debouncedSearchTerm, searchItems]);

    return (
        <div className="link-modal-overlay" onClick={onClose}>
            <div className="link-modal-content" onClick={e => e.stopPropagation()}>
                <div className="link-modal-header">
                    <h3>Vincular Tarefa ou OS</h3>
                    <button onClick={onClose} className="close-modal-btn">&times;</button>
                </div>
                <div className="link-modal-body">
                    <input
                        type="text"
                        placeholder="Digite o nome da tarefa ou ID da OS..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="link-search-input"
                        autoFocus
                    />
                    <ul className="link-results-list">
                        {isLoading && <li className="result-item-loading">Buscando...</li>}
                        {!isLoading && results.length === 0 && searchTerm && <li>Nenhum resultado encontrado.</li>}
                        {results.map(item => (
                            <li key={item.id} className="result-item" onClick={() => onLink(item)}>
                                {item.tipo === 'Tarefa' ? <FaTasks className="result-icon task" /> : <FaWrench className="result-icon os" />}
                                <div className="result-info">
                                    <span className="result-title">{item.titulo}</span>
                                    <span className="result-type">{item.tipo}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}