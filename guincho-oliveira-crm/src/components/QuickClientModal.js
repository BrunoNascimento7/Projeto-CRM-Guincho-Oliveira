// Arquivo: QuickClientModal.js
import React, { useState } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';
import './QuickClientModal.css'; // Criaremos este CSS simples

const api = axios.create({ baseURL: 'https://projeto-crm-guincho-oliveira.onrender.com' });

export default function QuickClientModal({ onClose, onClientCreated }) {
    const [newClient, setNewClient] = useState({
        nome: '',
        telefone: '',
        email: '',
        endereco: '',
        cpf_cnpj: ''
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewClient(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newClient.nome || !newClient.telefone) {
            toast.warn('Nome e Telefone são obrigatórios.');
            return;
        }

        setIsSaving(true);
        try {
            // Reutiliza a mesma rota que você já tem para criar clientes
            const token = localStorage.getItem('token');
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            const response = await api.post('/clientes', newClient);
            
            // Pega o ID retornado pelo backend e junta com os dados do formulário
            const createdClientData = { ...newClient, id: response.data.id };

            toast.success('Cliente cadastrado com sucesso!');
            onClientCreated(createdClientData); // Envia o novo cliente de volta para o Simulador
            onClose(); // Fecha o modal
        } catch (error) {
            toast.error(error.response?.data?.error || 'Não foi possível cadastrar o cliente.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3><i className="fa fa-user-plus"></i> Adicionar Novo Cliente</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Nome</label>
                        <input type="text" name="nome" value={newClient.nome} onChange={handleInputChange} required />
                    </div>
                    <div className="form-group">
                        <label>Telefone</label>
                        <input type="text" name="telefone" value={newClient.telefone} onChange={handleInputChange} required />
                    </div>
                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" name="email" value={newClient.email} onChange={handleInputChange} />
                    </div>
                    <div className="form-group">
                        <label>Endereço</label>
                        <input type="text" name="endereco" value={newClient.endereco} onChange={handleInputChange} />
                    </div>
                    <div className="form-group">
                        <label>CPF/CNPJ</label>
                        <input type="text" name="cpf_cnpj" value={newClient.cpf_cnpj} onChange={handleInputChange} />
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-cancel">Cancelar</button>
                        <button type="submit" className="btn-save-modal" disabled={isSaving}>
                            {isSaving ? 'Salvando...' : 'Cadastrar Cliente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}