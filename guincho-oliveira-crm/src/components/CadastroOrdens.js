import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './CadastroOrdens.css';

// --- Ícones em SVG para um design mais limpo e sem dependências externas ---
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const SteeringWheelIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="2" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="22"></line><line x1="2" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="22" y2="12"></line></svg>;
const TruckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>;
const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
const DollarSignIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>;
const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>;

export default function CadastroOrdens({ user }) {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [veiculosDisponiveis, setVeiculosDisponiveis] = useState([]);

  const [formData, setFormData] = useState({
    cliente_id: '',
    motorista_id: '',
    veiculo_id: '',
    local_atendimento: '',
    descricao: '',
    data_criacao: '',
    status: 'Na Fila',
    valor: '',
    forma_atendimento: ''
  });

  useEffect(() => {
    async function fetchDadosGerais() {
      try {
        const token = localStorage.getItem('token');
        const config = { headers: { 'Authorization': `Bearer ${token}` } };
        
        const [clientesRes, motoristasRes] = await Promise.all([
          api.get('/api/clients', config),
          api.get('/api/drivers', config)
        ]);
        
        // CORRIGIDO: Acessando a propriedade .data dentro da resposta
        setClientes(clientesRes.data.data || []);
        setMotoristas(motoristasRes.data.data || []);

      } catch (error) {
        console.error('Erro ao buscar clientes e motoristas:', error);
        setClientes([]); // Garante que seja um array em caso de erro
        setMotoristas([]); // Garante que seja um array em caso de erro
      }
    }

    async function fetchVeiculosDisponiveis() {
      try {
        const token = localStorage.getItem('token');
        const config = { 
          headers: { 'Authorization': `Bearer ${token}` },
          params: { status: 'Disponível' }
        };
        const veiculosRes = await api.get('/api/vehicles', config);
        
        // CORRIGIDO: Acessando a propriedade .data dentro da resposta
        setVeiculosDisponiveis(veiculosRes.data.data || []);

      } catch (error) {
        console.error('Erro ao buscar veículos disponíveis:', error);
        setVeiculosDisponiveis([]); // Garante que seja um array em caso de erro
      }
    }

    fetchDadosGerais();
    fetchVeiculosDisponiveis();
  }, []);

  function handleInputChange(e) {
    const { name, value } = e.target;
    setFormData(prevState => ({ ...prevState, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await api.post('/api/ordens', formData, { headers: { 'Authorization': `Bearer ${token}` } });
      alert('Ordem de serviço adicionada com sucesso!');
      navigate('/fila-ordens'); 
    } catch (error) {
      console.error('Erro ao adicionar ordem de serviço:', error.response?.data || error);
      alert(`Falha ao adicionar ordem de serviço: ${error.response?.data?.error || error.message}`);
    }
  }

  return (
    <div className="cadastro-ordens-container">
      <div className="header-container">
        <div>
            <h1 className="cadastro-ordens-header">Nova Ordem de Serviço</h1>
            <p className="cadastro-ordens-subheader">Preencha os detalhes abaixo para agendar um novo serviço.</p>
        </div>
        <button onClick={() => navigate(-1)} className="back-button">
            <ArrowLeftIcon /> Voltar
        </button>
      </div>
      
      <div className="ordem-form-card">
        <form onSubmit={handleSubmit}>
            
            <h2 className="form-section-title">Dados Principais</h2>
            <div className="form-grid">
                <div className="form-group">
                    <label htmlFor="cliente_id"><UserIcon /> Cliente</label>
                    <select id="cliente_id" name="cliente_id" value={formData.cliente_id} onChange={handleInputChange} required>
                        <option value="" disabled>Selecione um cliente...</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="motorista_id"><SteeringWheelIcon/> Motorista</label>
                    <select id="motorista_id" name="motorista_id" value={formData.motorista_id} onChange={handleInputChange} required>
                        <option value="" disabled>Selecione um motorista...</option>
                        {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="veiculo_id"><TruckIcon/> Veículo (Guincho)</label>
                    <select id="veiculo_id" name="veiculo_id" value={formData.veiculo_id} onChange={handleInputChange} required>
                        <option value="" disabled>Selecione um veículo disponível...</option>
                        {veiculosDisponiveis.map(v => <option key={v.id} value={v.id}>{v.placa} - {v.modelo}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="local_atendimento"><MapPinIcon/> Local de Atendimento</label>
                    <input type="text" id="local_atendimento" name="local_atendimento" placeholder="Ex: Av. Brasil, 123, São Paulo" value={formData.local_atendimento} onChange={handleInputChange} required />
                </div>
            </div>

            <hr className="form-divider" />

            <h2 className="form-section-title">Detalhes do Serviço</h2>
            <div className="form-grid">
                 <div className="form-group">
                    <label htmlFor="data_criacao"><CalendarIcon/> Data e Hora do Serviço</label>
                    <input type="datetime-local" id="data_criacao" name="data_criacao" value={formData.data_criacao} onChange={handleInputChange} required />
                </div>
                <div className="form-group">
                    <label htmlFor="valor"><DollarSignIcon/> Valor (R$)</label>
                    <input type="number" id="valor" name="valor" placeholder="150,00" value={formData.valor} onChange={handleInputChange} required step="0.01" />
                </div>
                <div className="form-group full-width">
                    <label htmlFor="descricao"><ClipboardIcon/> Descrição do Serviço</label>
                    <textarea id="descricao" name="descricao" placeholder="Detalhes importantes sobre o veículo, localidade ou tipo de serviço..." value={formData.descricao} onChange={handleInputChange} rows="4" required></textarea>
                </div>
            </div>
            
            <div className="form-actions">
              <button type="submit" className="submit-button">Agendar Serviço</button>
            </div>
        </form>
      </div>
    </div>
  );
}
