// src/components/ProtectedRoute.js
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const ProtectedRoute = ({ allowedRoles }) => {
    const token = localStorage.getItem('token');

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    try {
        const decodedToken = jwtDecode(token);
        const userRole = decodedToken.perfil;
        const currentTime = Date.now() / 1000; // Tempo atual em segundos

        // 1. Verifica se o token expirou
        if (decodedToken.exp < currentTime) {
            console.error("Token expirado.");
            localStorage.removeItem('token'); // Limpa o token expirado
            return <Navigate to="/login" replace />;
        }

        // 2. Verifica se o perfil do usuário é permitido
        if (allowedRoles.includes(userRole)) {
            return <Outlet />;
        } else {
            alert('Você não tem permissão para acessar esta página.');
            return <Navigate to="/" replace />;
        }
    } catch (error) {
        console.error("Token inválido ou corrompido:", error);
        localStorage.removeItem('token'); // Limpa o token inválido
        return <Navigate to="/login" replace />;
    }
};

export default ProtectedRoute;