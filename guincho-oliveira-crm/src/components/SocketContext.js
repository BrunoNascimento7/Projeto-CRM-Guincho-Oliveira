// src/components/SocketContext.js

import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

// --- MUDANÇA 1 (A mais importante) ---
// Criamos a instância do socket aqui fora, uma única vez.
// Usamos a opção `autoConnect: false` para que ele espere o login do usuário para se conectar.
const socketInstance = io("https://projeto-crm-guincho-oliveira.onrender.com", { autoConnect: false });

const SocketContext = createContext(null);

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const user = JSON.parse(localStorage.getItem('user'));

    useEffect(() => {
        // A lógica de só conectar se houver usuário foi 100% MANTIDA.
        if (user && user.id) {
            
            // --- MUDANÇA 2: Em vez de criar um novo socket, apenas conectamos a instância única ---
            socketInstance.connect();
            setSocket(socketInstance); // Colocamos a instância no estado para os componentes usarem

            const onConnectHandler = () => {
                const userData = {
                    userId: user.id,
                    nome: user.nome,
                    avatar: user.foto_perfil,
                    clienteId: user.cliente_id,
                    perfil: user.perfil
                };
                socketInstance.emit("newUser", userData);
                console.log("Socket.IO Conectado e usuário enviado:", userData.nome);
            };

            // A lógica de emitir 'newUser' ao conectar foi MANTIDA.
            socketInstance.on('connect', onConnectHandler);

            // A lógica de limpeza foi AJUSTADA para desconectar a instância única.
            return () => {
                console.log("Socket.IO Desconectando...");
                socketInstance.off('connect', onConnectHandler); // Remove o listener específico
                socketInstance.disconnect();
                setSocket(null); // Limpa o estado
            };
        } else {
            // Lógica para garantir que o socket fique nulo se não houver usuário MANTIDA.
            setSocket(null);
        }
        
    }, [user?.id]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};