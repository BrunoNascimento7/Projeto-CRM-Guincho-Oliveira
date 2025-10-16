// src/components/Chamado.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';
import api from '../services/api';
import './Chamado.css';

export default function Chamado({ user }) {
    const navigate = useNavigate();
    const { id } = useParams();
    const [os, setOs] = useState(null);
    const [clientes, setClientes] = useState([]);
    const [motoristas, setMotoristas] = useState([]);
    const [veiculos, setVeiculos] = useState([]);
    const [editFormData, setEditFormData] = useState({});

    async function fetchAllData() {
        if (!id) return;

        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'Authorization': `Bearer ${token}` } };
            
            const [osRes, clientesRes, motoristasRes, veiculosRes] = await Promise.all([
                api.get(`/ordens/${id}`, config),
                api.get('/clientes', config),
                api.get('/motoristas', config),
                api.get('/veiculos', config)
            ]);
            
            setOs(osRes.data);
            setEditFormData({ status: osRes.data.status, forma_atendimento: osRes.data.forma_atendimento, notas: osRes.data.notas });
            setClientes(clientesRes.data);
            setMotoristas(motoristasRes.data);
            setVeiculos(veiculosRes.data);

        } catch (error) {
            console.error('Erro ao buscar dados do chamado:', error);
        }
    }

    useEffect(() => {
        fetchAllData();
    }, [id]);

    const handleEditInputChange = (e) => {
        const { name, value } = e.target;
        setEditFormData(prevState => ({ ...prevState, [name]: value }));
    };

    const handleUpdate = async () => {
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'Authorization': `Bearer ${token}` } };
            
            await api.put(`/ordens/${id}/update`, editFormData, config);
            
            alert('Chamado atualizado com sucesso!');
            fetchAllData(); // Atualiza os dados após a alteração
        } catch (error) {
            console.error('Erro ao atualizar o chamado:', error);
            alert('Erro ao atualizar o chamado.');
        }
    };
    
    if (!os) {
      return (
        <div className="chamado-container">
          <button onClick={() => navigate(-1)} className="back-button">Voltar</button>
          <h1 className="chamado-header">Carregando...</h1>
        </div>
      );
    }

    const cliente = clientes.find(c => c.id === os.cliente_id);
    const motorista = motoristas.find(m => m.id === os.motorista_id);
    const veiculo = veiculos.find(v => v.id === os.veiculo_id);


    return (
        <div className="chamado-container">
            <button onClick={() => navigate(-1)} className="back-button">Voltar</button>
            <h1 className="chamado-header">Detalhes do Chamado #{os.id}</h1>

            <div className="chamado-main-card">
              <Tabs>
                <TabList>
                  <Tab>Detalhes</Tab>
                  <Tab>Notas</Tab>
                </TabList>

                <TabPanel>
                  <div className="tab-details">
                    <p><strong>Status:</strong> {os.status}</p>
                    <p><strong>Data/Hora:</strong> {os.data_hora}</p>
                    <p><strong>Cliente:</strong> {cliente?.nome || 'N/A'}</p>
                    <p><strong>Motorista:</strong> {motorista?.nome || 'N/A'}</p>
                    <p><strong>Veículo:</strong> {veiculo?.placa || 'N/A'}</p>
                    <p><strong>Descrição:</strong> {os.descricao}</p>
                    <p><strong>Forma de Atendimento:</strong> {os.forma_atendimento || 'N/A'}</p>
                    <p><strong>Valor:</strong> R$ {os.valor?.toFixed(2) || '0.00'}</p>
                    <button onClick={() => navigate(`/ordens/fila`)} className="back-button">Voltar à Fila</button>
                  </div>
                </TabPanel>

                <TabPanel>
                    <div className="tab-notas">
                        <h3>Adicionar Notas e Alterar Status</h3>
                        <div className="form-group">
                            <label>Notas do Chamado:</label>
                            <textarea
                                name="notas"
                                value={editFormData.notas}
                                onChange={handleEditInputChange}
                                rows="5"
                            ></textarea>
                        </div>
                        <div className="form-group">
                            <label>Status:</label>
                            <select name="status" value={editFormData.status} onChange={handleEditInputChange}>
                                <option value="Na Fila">Na Fila</option>
                                <option value="Agendado">Agendado</option>
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Concluído">Concluído</option>
                                <option value="Cancelado">Cancelado</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Forma de Atendimento:</label>
                            <select name="forma_atendimento" value={editFormData.forma_atendimento} onChange={handleEditInputChange}>
                                <option value="">Selecione...</option>
                                <option value="Telefone">Telefone</option>
                                <option value="Presencial">Presencial</option>
                                <option value="Internamente">Internamente</option>
                            </select>
                        </div>
                        <button onClick={handleUpdate} className="submit-button">Atualizar Chamado</button>
                    </div>
                </TabPanel>
              </Tabs>
            </div>
        </div>
    );
}