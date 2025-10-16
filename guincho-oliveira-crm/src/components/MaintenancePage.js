// src/components/MaintenancePage.js

import React, { useState, useEffect } from 'react';
import { FaTools } from 'react-icons/fa';
import './MaintenancePage.css'; // Crie ou use um arquivo CSS para estilização

// Componente interno para o contador
const CountdownTimer = ({ targetDate }) => {
    const calculateTimeLeft = () => {
        const difference = +new Date(targetDate) - +new Date();
        if (difference <= 0) {
            // Quando o tempo acabar, recarrega a página para o usuário poder logar
            window.location.reload();
            return 'O sistema já está disponível!';
        }

        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / 1000 / 60) % 60);
        const seconds = Math.floor((difference / 1000) % 60);

        // Monta a string de tempo restante de forma inteligente
        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);
        
        return parts.join(' ');
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        const timer = setTimeout(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearTimeout(timer);
    });

    return <span className="countdown-timer">{timeLeft}</span>;
};

export default function MaintenancePage({ endDate }) {
    return (
        <div className="maintenance-container">
            <div className="maintenance-box">
                <FaTools className="maintenance-icon" />
                <h1>Sistema em Manutenção</h1>
                <p>
                    Estamos realizando melhorias no sistema. <br />
                    Por favor, tente novamente mais tarde. Agradecemos a sua compreensão.
                </p>
                {/* O contador que você pediu */}
                {endDate && (
                    <div className="countdown-container">
                        <p>O sistema estará disponível em aproximadamente:</p>
                        <CountdownTimer targetDate={endDate} />
                    </div>
                )}
            </div>
        </div>
    );
}