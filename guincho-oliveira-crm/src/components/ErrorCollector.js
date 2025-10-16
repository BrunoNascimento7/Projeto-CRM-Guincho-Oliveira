// src/components/ErrorCollector.js
import { useEffect } from 'react';

// --- Configuração ---
const MAX_LOGS = 100; // Define o número máximo de logs a serem mantidos

// --- Buffer de Logs em Memória ---
// Usamos um buffer para não acessar o localStorage a cada log, o que é mais performático.
let logBuffer = [];

// --- Função para Salvar os Logs no localStorage ---
const saveLogsToStorage = () => {
    try {
        const logString = JSON.stringify(logBuffer, null, 2);
        localStorage.setItem('consoleLogs', logString);
    } catch (e) {
        // Se mesmo assim falhar (pouco provável agora), loga um erro simples
        console.log('Falha ao salvar logs no storage:', e);
    }
};

// --- O Componente React ---
const ErrorCollector = () => {
    useEffect(() => {
        // Carrega os logs existentes ao iniciar o app
        const existingLogs = localStorage.getItem('consoleLogs');
        if (existingLogs) {
            try {
                logBuffer = JSON.parse(existingLogs);
            } catch {
                logBuffer = [];
            }
        }

        const originalConsoleError = console.error;
        const originalConsoleLog = console.log;

        const captureLog = (originalFunc, type, ...args) => {
            // Chama a função original para que o log ainda apareça no console do dev
            originalFunc.apply(console, args);

            // Formata a mensagem
            const timestamp = new Date().toISOString();
            const message = args.map(arg => {
                if (arg instanceof Error) return arg.stack;
                // Evita a circularidade em objetos complexos
                if (typeof arg === 'object' && arg !== null) {
                    try {
                        return JSON.stringify(arg);
                    } catch {
                        return '[Objeto Circular]';
                    }
                }
                return String(arg);
            }).join(' ');

            // Adiciona ao nosso buffer
            logBuffer.push(`[${type.toUpperCase()}] ${timestamp}: ${message}`);

            // Garante que o buffer não exceda o limite máximo
            if (logBuffer.length > MAX_LOGS) {
                // Remove o item mais antigo (do início do array)
                logBuffer.shift(); 
            }
            
            // Salva a versão atualizada no localStorage
            saveLogsToStorage();
        };

        // Sobrescreve as funções do console
        console.error = (...args) => captureLog(originalConsoleError, 'error', ...args);
        console.log = (...args) => captureLog(originalConsoleLog, 'log', ...args);

        // Limpeza: Restaura as funções originais se o componente for desmontado
        return () => {
            console.error = originalConsoleError;
            console.log = originalConsoleLog;
        };
    }, []);

    // Este componente não renderiza nada na tela
    return null; 
};

export default ErrorCollector;

