import axios from 'axios';
import { toast } from 'react-toastify'; // Vamos usar o mesmo sistema de notificação que você já tem no app

const api = axios.create({
  baseURL: 'http://localhost:3001', // O endereço do seu servidor backend (removi a barra final por padrão do axios)
});

// --- PASSO 1: Interceptador de REQUISIÇÕES ---
// Este código é executado ANTES de cada requisição ser enviada.
api.interceptors.request.use(
  (config) => {
    // Pega o token do localStorage
    const token = localStorage.getItem('token');
    
    // Se o token existir, adiciona ele no cabeçalho 'Authorization'
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Retorna a configuração modificada para que a requisição continue
    return config;
  },
  (error) => {
    // Se houver um erro na configuração da requisição, rejeita
    return Promise.reject(error);
  }
);


// --- PASSO 2: Interceptador de RESPOSTAS ---
// Este código é executado DEPOIS que uma resposta da API é recebida.
api.interceptors.response.use(
  // Se a resposta for de sucesso (status 2xx), apenas a retorna
  (response) => response,

  // Se a resposta for de erro...
  (error) => {
    // Verificamos se o erro é o 401 (Não Autorizado)
    if (error.response && error.response.status === 401) {
      // Pega a mensagem de erro específica que o seu backend enviou
      // Se não houver, usa uma mensagem padrão.
      const errorMessage = error.response.data?.error || 'Sua sessão expirou. Faça login novamente.';
      
      // Exibe a notificação (toast) para o usuário saber o que aconteceu
      toast.warn(errorMessage);

      // Limpa os dados de autenticação do navegador
      localStorage.removeItem('token');
      // Adicione aqui qualquer outro item que você salve no localStorage relacionado ao usuário
      // Ex: localStorage.removeItem('user');

      // Redireciona o usuário para a tela de login após um pequeno atraso
      // O atraso é importante para que o usuário tenha tempo de ler a notificação.
      setTimeout(() => {
        // window.location.href garante um recarregamento completo para o estado de "deslogado"
        window.location.href = '/login'; 
      }, 2500); // 2.5 segundos de espera
    }
    
    // Para qualquer outro tipo de erro, apenas repassa o erro para ser tratado onde a chamada foi feita
    return Promise.reject(error);
  }
);

export default api;