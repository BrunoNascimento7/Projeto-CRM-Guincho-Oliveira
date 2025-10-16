// src/components/GastoModal.js

import React, { useState } from 'react';
import ReactDOM from 'react-dom';

const portalRoot = document.getElementById('modal-root');

// ESTE É O SEU COMPONENTE ORIGINAL, SEM NENHUMA ALTERAÇÃO NA LÓGICA
const GastoModal = ({ gasto, onClose, onSave, categorias, veiculos }) => {
    const [formData, setFormData] = useState({
        descricao: gasto?.descricao || '',
        valor: gasto?.valor || '',
        data_vencimento: gasto?.data_vencimento?.split('T')[0] || new Date().toISOString().split('T')[0],
        categoria_id: gasto?.categoria_id || '',
        veiculo_id: gasto?.veiculo_id || '',
        justificativa: gasto?.justificativa || '',
        status: gasto?.status || 'Pendente',
    });
    const [anexo, setAnexo] = useState(null);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        setAnexo(e.target.files[0]);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const data = new FormData();
        for (const key in formData) {
            data.append(key, formData[key]);
        }
        if (anexo) {
            data.append('anexo', anexo);
        } else if (gasto && gasto.anexo_url) {
            data.append('anexo_url', gasto.anexo_url);
        }
        
        onSave(data, gasto?.id);
    };

    // A única diferença é que o seu JSX agora é renderizado via Portal
    return ReactDOM.createPortal(
        <div className="modal-overlay">
            <div className="modal-content large">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3>{gasto ? 'Editar Gasto' : 'Registrar Novo Gasto'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group"><label>Descrição</label><input type="text" name="descricao" value={formData.descricao} onChange={handleInputChange} required /></div>
                    <div className="form-row">
                        <div className="form-group"><label>Valor (R$)</label><input type="number" name="valor" step="0.01" value={formData.valor} onChange={handleInputChange} required /></div>
                        <div className="form-group"><label>Data de Vencimento</label><input type="date" name="data_vencimento" value={formData.data_vencimento} onChange={handleInputChange} required /></div>
                    </div>
                    <div className="form-row">
                        <div className="form-group"><label>Categoria</label><select name="categoria_id" value={formData.categoria_id} onChange={handleInputChange} required><option value="">Selecione...</option>{categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}</select></div>
                        <div className="form-group"><label>Veículo (Centro de Custo)</label><select name="veiculo_id" value={formData.veiculo_id || ''} onChange={handleInputChange}><option value="">Nenhum / Despesa Geral</option>{(veiculos || []).map(v => <option key={v.id} value={v.id}>{v.placa} - {v.modelo}</option>)}</select></div>
                    </div>
                    <div className="form-group"><label>Justificativa / Observações</label><textarea name="justificativa" rows="3" value={formData.justificativa} onChange={handleInputChange}></textarea></div>
                    <div className="form-group"><label>Anexo (Nota Fiscal, Recibo)</label><input type="file" onChange={handleFileChange} /></div>
                    <div className="modal-footer">
                        <button type="button" className="btn-cancelar" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn-salvar">Salvar Gasto</button>
                    </div>
                </form>
            </div>
        </div>,
        portalRoot
    );
};

export default GastoModal;