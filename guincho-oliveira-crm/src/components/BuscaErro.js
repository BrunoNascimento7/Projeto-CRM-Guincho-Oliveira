import React, { useEffect, useState } from 'react';
import axios from 'axios'; // Importa o axios diretamente

// --- Lógica do api.js movida para cá para resolver o erro de compilação ---
// Em um ambiente de teste isolado, a importação de outros arquivos pode falhar.
// Esta versão é autossuficiente e funcionará quando você a adicionar ao seu projeto.
const api = axios.create({
  baseURL: 'http://localhost:3001',
});

// Adiciona o interceptor que anexa o token em todas as requisições
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
// --- Fim da lógica do api.js ---

function BuscaErro() {
  const [userData, setUserData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    console.log('[BuscaErro] Componente montado. Tentando buscar /usuarios/me...');

    const fetchUser = async () => {
      try {
        // Esta é a chamada CORRETA que queremos testar
        const response = await api.get('/usuarios/me');
        
        console.log('[BuscaErro] SUCESSO! Dados recebidos:', response.data);
        setUserData(response.data);
      } catch (err) {
        console.error('[BuscaErro] FALHA! Ocorreu um erro ao buscar /usuarios/me.', err);
        
        // Vamos inspecionar o erro em detalhes
        if (err.response) {
            console.error('[BuscaErro] Detalhes do Erro:', {
                status: err.response.status,
                data: err.response.data,
                headers: err.response.headers,
            });
            setError(`Erro ${err.response.status}: ${err.response.data.error || 'Ocorreu um erro.'}`);
        } else {
            setError('Não foi possível conectar ao servidor.');
        }
      }
    };

    fetchUser();
  }, []); // O array vazio garante que isso rode apenas uma vez

  return (
    <div style={{ 
        backgroundColor: '#ffc107', 
        color: '#333', 
        padding: '10px', 
        margin: '10px', 
        borderRadius: '5px',
        border: '2px solid #e0a800'
    }}>
      <h4 style={{marginTop: 0}}>--- Componente de Teste de API Ativo ---</h4>
      {error && <p><strong>Resultado do Teste:</strong> <span style={{color: 'red'}}>{error}</span></p>}
      {userData && <p><strong>Resultado do Teste:</strong> Sucesso! Usuário "{userData.nome}" carregado.</p>}
      <p>Verifique o console para mais detalhes (F12).</p>
    </div>
  );
}

export default BuscaErro;

