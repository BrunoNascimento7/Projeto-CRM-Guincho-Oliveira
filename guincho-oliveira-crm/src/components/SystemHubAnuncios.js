import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
import './SystemHubAnuncios.css'; // Criaremos este arquivo a seguir
import { FaPlus, FaPencilAlt, FaTrash, FaBullhorn } from 'react-icons/fa';

// --- Modal para Criar/Editar Anúncio ---
const AnuncioModal = ({ anuncio, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        titulo: anuncio?.titulo || '',
        mensagem: anuncio?.mensagem || '',
        status: anuncio?.status || 'ativo',
        publico_alvo: anuncio?.publico_alvo || 'todos',
        data_expiracao: anuncio?.data_expiracao?.split('T')[0] || ''
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Garante que a data vazia seja enviada como null
        const dataToSave = { ...formData, data_expiracao: formData.data_expiracao || null };
        onSave({ ...anuncio, ...dataToSave });
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3>{anuncio ? 'Editar Anúncio Global' : 'Novo Anúncio Global'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Título:</label>
                        <input type="text" name="titulo" value={formData.titulo} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                        <label>Mensagem:</label>
                        <textarea name="mensagem" value={formData.mensagem} onChange={handleChange} required rows="4"></textarea>
                    </div>
                    <div className="form-grid-half">
                        <div className="form-group">
                            <label>Status:</label>
                            <select name="status" value={formData.status} onChange={handleChange}>
                                <option value="ativo">Ativo</option>
                                <option value="inativo">Inativo</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Público-Alvo:</label>
                            <select name="publico_alvo" value={formData.publico_alvo} onChange={handleChange}>
                                <option value="todos">Todos os Usuários</option>
                                <option value="admins">Apenas Admins (Clientes)</option>
                                <option value="operacional">Apenas Operacional</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Data de Expiração (Opcional):</label>
                        <input type="date" name="data_expiracao" value={formData.data_expiracao} onChange={handleChange} />
                        <small>O anúncio deixará de ser exibido após esta data.</small>
                    </div>
                    <button type="submit" className="submit-button">
                        {anuncio ? 'Salvar Alterações' : 'Publicar Anúncio'}
                    </button>
                </form>
            </div>
        </div>
    );
};


// --- Componente Principal ---
export default function SystemHubAnuncios() {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentAnnouncement, setCurrentAnnouncement] = useState(null);

    const fetchAnnouncements = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const { data } = await api.get('/api/system-hub/announcements', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setAnnouncements(data);
        } catch (error) {
            toast.error("Falha ao carregar anúncios globais.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const handleSave = async (anuncioData) => {
        const token = localStorage.getItem('token');
        const config = { headers: { 'Authorization': `Bearer ${token}` } };
        try {
            if (anuncioData.id) {
                await api.put(`/api/system-hub/announcements/${anuncioData.id}`, anuncioData, config);
                toast.success("Anúncio atualizado com sucesso!");
            } else {
                await api.post('/api/system-hub/announcements', anuncioData, config);
                toast.success("Anúncio global criado com sucesso!");
            }
            fetchAnnouncements();
            setIsModalOpen(false);
        } catch (error) {
            toast.error("Erro ao salvar anúncio.");
        }
    };
    
    const handleDelete = async (id) => {
        if (window.confirm("Tem certeza que deseja excluir este anúncio global?")) {
            try {
                const token = localStorage.getItem('token');
                await api.delete(`/api/system-hub/announcements/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success("Anúncio excluído!");
                fetchAnnouncements();
            } catch (error) {
                toast.error("Falha ao excluir o anúncio.");
            }
        }
    };

    if (loading) return <div className="loading-container">Carregando anúncios...</div>;

    return (
        <div className="system-hub-container">
            <div className="hub-header">
                <h1><FaBullhorn /> Anúncios Globais</h1>
                <button onClick={() => { setCurrentAnnouncement(null); setIsModalOpen(true); }} className="add-client-button">
                    <FaPlus /> Novo Anúncio
                </button>
            </div>
            
            <div className="client-list-card">
                <table className="clients-table">
                    <thead>
                        <tr>
                            <th>Título</th>
                            <th>Status</th>
                            <th>Público-Alvo</th>
                            <th>Expira em</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {announcements.map(anuncio => (
                            <tr key={anuncio.id}>
                                <td>{anuncio.titulo}</td>
                                <td>
                                    <span className={`status-badge status-${anuncio.status}`}>
                                        {anuncio.status}
                                    </span>
                                </td>
                                <td>{anuncio.publico_alvo}</td>
                                <td>{anuncio.data_expiracao ? new Date(anuncio.data_expiracao).toLocaleDateString('pt-BR') : 'Nunca'}</td>
                                <td className="actions-cell">
                                    <button title="Editar Anúncio" onClick={() => { setCurrentAnnouncement(anuncio); setIsModalOpen(true); }} className="action-button edit">
                                        <FaPencilAlt />
                                    </button>
                                    <button title="Excluir Anúncio" onClick={() => handleDelete(anuncio.id)} className="action-button suspend">
                                        <FaTrash />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {announcements.length === 0 && <p className="no-clients-message">Nenhum anúncio global criado.</p>}
            </div>

            {isModalOpen && <AnuncioModal anuncio={currentAnnouncement} onClose={() => setIsModalOpen(false)} onSave={handleSave} />}
        </div>
    );
}