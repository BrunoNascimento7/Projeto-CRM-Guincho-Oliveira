// components/VeiculoCard.js (Exemplo)

import React from 'react';
import { FaEye, FaEdit, FaTrash, FaWrench, FaDollarSign } from 'react-icons/fa';
import './VeiculoCard.css'; // Crie ou adapte o CSS para este card

// Função para formatar moeda
const formatCurrency = (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
};

const VeiculoCard = ({ veiculo, onViewDetails, onEdit, onDelete }) => {
    return (
        <div className="veiculo-card">
            <div className="veiculo-card-header">
                <span className={`status-badge status-${veiculo.status?.toLowerCase()}`}>{veiculo.status}</span>
                <div className="veiculo-card-actions">
                    <button onClick={onViewDetails} title="Visualizar Detalhes"><FaEye /></button>
                    <button onClick={onEdit} title="Gerenciar Veículo"><FaEdit /></button>
                    <button onClick={onDelete} title="Excluir Veículo" className="delete-btn"><FaTrash /></button>
                </div>
            </div>
            <div className="veiculo-card-body">
                <h3 className="veiculo-placa">{veiculo.placa}</h3>
                <p className="veiculo-modelo">{veiculo.marca} {veiculo.modelo} - {veiculo.ano}</p>
            </div>
            <div className="veiculo-card-footer">
                <div className="footer-info">
                    <FaDollarSign />
                    <span>Custo Manutenções:</span>
                    {/* <<< AQUI ESTÁ A NOVA INFORMAÇÃO SENDO EXIBIDA >>> */}
                    <strong className="custo-valor">{formatCurrency(veiculo.custo_total_manutencoes)}</strong>
                </div>
            </div>
        </div>
    );
};

export default VeiculoCard;