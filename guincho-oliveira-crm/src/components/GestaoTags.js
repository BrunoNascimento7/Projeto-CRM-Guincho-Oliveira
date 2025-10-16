import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './GestaoTags.css';
import { FaSave, FaTags, FaPlusCircle } from 'react-icons/fa';

export default function GestaoTags() {
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Estados para o formulário de nova tag
    const [novaTag, setNovaTag] = useState({ tag_nome: '', tag_valor: '', descricao: '' });
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        fetchTags();
    }, []);

    const fetchTags = async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/api/tags');
            setTags(data);
            setError('');
        } catch (err) {
            setError('Falha ao carregar as tags.');
        } finally {
            setLoading(false);
        }
    };

    const handleValueChange = (index, value) => {
        const newTags = [...tags];
        newTags[index].tag_valor = value;
        setTags(newTags);
    };

    const handleSaveTag = async (tag) => {
        try {
            await api.post('/api/tags', tag);
            alert('Tag salva com sucesso!');
            fetchTags(); // Recarrega a lista
        } catch (err) {
            alert('Erro ao salvar a tag.');
        }
    };

    // Função para criar uma nova tag
    const handleCreateTag = async (e) => {
        e.preventDefault();
        if (!novaTag.tag_nome || !novaTag.tag_valor) {
            alert('O nome e o valor da tag são obrigatórios.');
            return;
        }
        // Remove espaços e caracteres especiais do nome da tag
        const nomeFormatado = novaTag.tag_nome.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

        try {
            await api.post('/api/tags', { ...novaTag, tag_nome: nomeFormatado });
            alert('Nova tag criada com sucesso!');
            setNovaTag({ tag_nome: '', tag_valor: '', descricao: '' }); // Limpa o formulário
            setShowForm(false); // Esconde o formulário
            fetchTags(); // Recarrega a lista
        } catch (err) {
            alert('Erro ao criar a tag. Verifique se o nome já existe.');
        }
    };

    return (
        <div className="gestao-tags-container">
            <div className="gestao-tags-header">
                <h1 className="gestao-tags-title"><FaTags /> Gestão de Tags Dinâmicas</h1>
                <button className="add-new-tag-btn" onClick={() => setShowForm(!showForm)}>
                    <FaPlusCircle /> {showForm ? 'Cancelar' : 'Adicionar Nova Tag'}
                </button>
            </div>
            <p className="gestao-tags-subtitle">
                Estas tags podem ser usadas nos templates de comunicação. Altere o valor e salve.
            </p>

            {/* Formulário de Criação de Tag */}
            {showForm && (
                <form onSubmit={handleCreateTag} className="new-tag-form">
                    <h3>Criar Nova Tag</h3>
                    <div className="form-grid">
                        <input
                            type="text"
                            placeholder="Nome da tag (ex: saudacao_dia)"
                            value={novaTag.tag_nome}
                            onChange={(e) => setNovaTag({ ...novaTag, tag_nome: e.target.value })}
                        />
                        <input
                            type="text"
                            placeholder="Descrição (ex: 'Bom dia', 'Boa tarde')"
                            value={novaTag.descricao}
                            onChange={(e) => setNovaTag({ ...novaTag, descricao: e.target.value })}
                        />
                    </div>
                    <textarea
                        placeholder="Valor da tag (o texto que será inserido)"
                        value={novaTag.tag_valor}
                        onChange={(e) => setNovaTag({ ...novaTag, tag_valor: e.target.value })}
                        rows="3"
                    />
                    <button type="submit"><FaSave /> Criar Tag</button>
                </form>
            )}

            {loading && <p>Carregando...</p>}
            {error && <p className="error-message">{error}</p>}

            {!loading && !error && tags.length > 0 ? (
                <div className="tags-list">
                    {tags.map((tag, index) => (
                        <div key={tag.tag_nome} className="tag-card">
                            <div className="tag-info">
                                <label htmlFor={`tag-${tag.tag_nome}`}><code>{'{{' + tag.tag_nome + '}}'}</code></label>
                                <small>{tag.descricao || 'Tag para uso geral'}</small>
                            </div>
                            <textarea
                                id={`tag-${tag.tag_nome}`}
                                value={tag.tag_valor}
                                onChange={(e) => handleValueChange(index, e.target.value)}
                                rows="2"
                            />
                            <button onClick={() => handleSaveTag(tag)}><FaSave /> Salvar</button>
                        </div>
                    ))}
                </div>
            ) : (
                !loading && <p className="no-tags-message">Nenhuma tag cadastrada. Clique em "Adicionar Nova Tag" para começar.</p>
            )}
        </div>
    );
}