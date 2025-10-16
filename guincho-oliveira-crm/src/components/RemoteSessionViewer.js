import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Peer from 'simple-peer';
import { useSocket } from '../components/SocketContext';
import { FaDesktop, FaWifi, FaExclamationTriangle, FaRegTimesCircle } from 'react-icons/fa';

export default function RemoteSessionViewer() {
    const { chamadoId, clienteSocketId } = useParams(); // Parâmetro agora é o socketId do cliente
    const socket = useSocket();
    const videoRef = useRef();
    const [status, setStatus] = useState({ text: 'Iniciando...', icon: <FaWifi/>, color: '#f0ad4e' });
    const peerRef = useRef();

    useEffect(() => {
        if (!socket) return;

        setStatus({ text: 'Aguardando sinal do cliente...', icon: <FaWifi/>, color: '#f0ad4e' });

        const peer = new Peer({ initiator: false, trickle: false });
        peerRef.current = peer;

        const handleSignal = ({ deSocketId, sinal }) => {
            peer.signal(sinal);
        };
        socket.on('webrtc:receber-sinal', handleSignal);

        peer.on('signal', (sinalResposta) => {
            socket.emit('webrtc:enviar-sinal', { paraSocketId: clienteSocketId, sinal: sinalResposta });
        });

        peer.on('stream', (stream) => {
            setStatus({ text: 'Conectado e recebendo imagem.', icon: <FaDesktop/>, color: '#5cb85c' });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        });

        const handleEndSession = () => {
            setStatus({ text: 'Sessão encerrada.', icon: <FaRegTimesCircle/>, color: '#6c757d' });
            if (peerRef.current) peerRef.current.destroy();
            window.close();
        };

        peer.on('close', handleEndSession);
        peer.on('error', (err) => setStatus({ text: `Erro de conexão.`, icon: <FaExclamationTriangle/>, color: '#d9534f' }));
        socket.on('remoto:notificar-encerramento', handleEndSession);

        return () => {
            socket.off('webrtc:receber-sinal', handleSignal);
            socket.off('remoto:notificar-encerramento');
            if (peerRef.current) peerRef.current.destroy();
        };
    }, [socket, clienteSocketId]);

    return (
        <div style={{ background: '#222', color: 'white', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <header style={{ padding: '10px 20px', background: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                    <h3>Sessão Remota - Chamado #{chamadoId.substring(0, 8).toUpperCase()}</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: status.color, fontWeight: 'bold' }}>
                    {status.icon} {status.text}
                </div>
            </header>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: 'auto', flexGrow: 1, background: '#000' }} />
        </div>
    );
}
