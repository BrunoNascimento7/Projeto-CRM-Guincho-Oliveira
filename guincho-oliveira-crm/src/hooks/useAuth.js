import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

export const useAuth = () => {
    const [auth, setAuth] = useState({ token: null, perfil: null });

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const decodedToken = jwtDecode(token);
                setAuth({ token, perfil: decodedToken.perfil });
            } catch (error) {
                console.error("Token inválido ou expirado", error);
                setAuth({ token: null, perfil: null });
            }
        }
    }, []);

    return auth;
};