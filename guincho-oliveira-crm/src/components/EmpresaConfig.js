// src/components/EmpresaConfig.js
import React, { useState, useEffect } from 'react';
import './EmpresaConfig.css';

export default function EmpresaConfig({ onClose }) {
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    whatsapp: '',
    email: '',
    endereco: '',
    cnpj: ''
  });

  useEffect(() => {
    const storedInfo = localStorage.getItem('empresaInfo');
    if (storedInfo) {
      setFormData(JSON.parse(storedInfo));
    }
  }, []);

  function handleInputChange(e) {
    const { name, value } = e.target;
    setFormData(prevState => ({ ...prevState, [name]: value }));
  }

  function handleSave(e) {
    e.preventDefault();
    localStorage.setItem('empresaInfo', JSON.stringify(formData));
    alert('Informações da empresa salvas com sucesso!');
    onClose();
  }

  return (
    <div className="config-modal-overlay">
      <div className="config-modal-content">
        <button onClick={onClose} className="config-close-button">&times;</button>
        <h3>Configurações da Empresa</h3>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Nome:</label>
            <input type="text" name="nome" value={formData.nome} onChange={handleInputChange} required />
          </div>
          <div className="form-group">
            <label>Telefone:</label>
            <input type="text" name="telefone" value={formData.telefone} onChange={handleInputChange} />
          </div>
          <div className="form-group">
            <label>Whatsapp:</label>
            <input type="text" name="whatsapp" value={formData.whatsapp} onChange={handleInputChange} />
          </div>
          <div className="form-group">
            <label>Email:</label>
            <input type="email" name="email" value={formData.email} onChange={handleInputChange} />
          </div>
          <div className="form-group">
            <label>Endereço:</label>
            <input type="text" name="endereco" value={formData.endereco} onChange={handleInputChange} />
          </div>
          <div className="form-group">
            <label>CNPJ:</label>
            <input type="text" name="cnpj" value={formData.cnpj} onChange={handleInputChange} />
          </div>
          <button type="submit" className="submit-button">Salvar</button>
        </form>
      </div>
    </div>
  );
}