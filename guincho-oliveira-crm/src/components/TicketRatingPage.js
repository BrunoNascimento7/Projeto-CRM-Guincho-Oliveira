// src/components/TicketRatingPage.js

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api'; // Verifique se o caminho para 'api' está correto
import { FaStar, FaSpinner, FaRegSadTear, FaRegSmileBeam, FaRegCheckCircle } from 'react-icons/fa';
import './TicketRatingPage.css'; // Criaremos este arquivo a seguir
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function TicketRatingPage() {
    const { token } = useParams();
    const [ticketInfo, setTicketInfo] = useState(null);
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    useEffect(() => {
        const verifyToken = async () => {
            try {
                const { data } = await api.get(`/api/suporte/avaliacao/${token}`);
                setTicketInfo(data);
            } catch (err) {
                setError(err.response?.data?.error || 'Link de avaliação inválido ou expirado.');
            } finally {
                setIsLoading(false);
            }
        };
        verifyToken();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (rating === 0) {
            return toast.warn('Por favor, selecione uma nota de 1 a 5 estrelas.');
        }
        setIsSubmitting(true);
        try {
            await api.post(`/api/suporte/avaliacao/${token}`, {
                nota: rating,
                comentario: comment
            });
            setIsSubmitted(true);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Ocorreu um erro ao enviar sua avaliação.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="rating-page-container loading"><FaSpinner className="spinner" /> Verificando...</div>;
    }

    if (error) {
        return (
            <div className="rating-page-container feedback-view">
                <FaRegSadTear className="feedback-icon error" />
                <h1>Oops!</h1>
                <p>{error}</p>
                <Link to="/" className="btn-back-home">Voltar ao Início</Link>
            </div>
        );
    }
    
    if (isSubmitted) {
        return (
             <div className="rating-page-container feedback-view">
                <FaRegSmileBeam className="feedback-icon success" />
                <h1>Obrigado!</h1>
                <p>Seu feedback é muito importante e nos ajuda a melhorar sempre.</p>
                <Link to="/" className="btn-back-home">Voltar ao Início</Link>
            </div>
        );
    }

    return (
        <>
            <ToastContainer position="top-center" theme="colored" />
            <div className="rating-page-container">
                <div className="rating-card">
                    <FaRegCheckCircle className="card-icon" />
                    <h2>Avalie o Atendimento</h2>
                    <p>Chamado: <strong>#{ticketInfo.id.substring(0,8)} - {ticketInfo.assunto}</strong></p>
                    <p>Como você avalia o suporte que recebeu de <strong>{ticketInfo.criado_por_nome}</strong>?</p>
                    
                    <form onSubmit={handleSubmit}>
                        <div className="stars-container">
                            {[1, 2, 3, 4, 5].map(star => (
                                <FaStar
                                    key={star}
                                    className={`star ${hoverRating >= star || rating >= star ? 'active' : ''}`}
                                    onMouseEnter={() => setHoverRating(star)}
                                    onMouseLeave={() => setHoverRating(0)}
                                    onClick={() => setRating(star)}
                                />
                            ))}
                        </div>

                        <textarea
                            placeholder="Deixe um comentário (opcional)..."
                            rows="4"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                        />

                        <button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <FaSpinner className="spinner" /> : 'Enviar Avaliação'}
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}