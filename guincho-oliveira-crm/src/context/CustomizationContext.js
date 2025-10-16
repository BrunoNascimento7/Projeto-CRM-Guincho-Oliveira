// src/context/CustomizationContext.js

import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';
import logoPadrao from '../logo_guincho.png';
import bgPadrao from '../guinchotr.jpg';

const CustomizationContext = createContext();

// Configurações padrão caso o cliente não tenha personalização
const defaultConfig = {
    sidebar_config: { label: "Guincho Oliveira", logo_url: logoPadrao },
    dashboard_config: { title: "Sobre a Guincho Oliveira", text: "Dedicados a oferecer serviços de guincho e assistência rodoviária 24h com uma frota moderna e profissionais experientes, garantindo um atendimento rápido, seguro e eficiente.", slideshow_urls: [] },
    login_config: { logo_url: logoPadrao, background_url: bgPadrao }
};

export const CustomizationProvider = ({ children, user }) => {
    const [config, setConfig] = useState(defaultConfig);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchConfig = async () => {
            if (user) { // Só busca se houver um usuário logado
                try {
                    setLoading(true);
                    const { data } = await api.get('/api/customize/config');
                    // Mescla as configs recebidas com as padrão para evitar campos vazios
                    setConfig({
                        sidebar_config: { ...defaultConfig.sidebar_config, ...data.sidebar_config },
                        dashboard_config: { ...defaultConfig.dashboard_config, ...data.dashboard_config },
                        login_config: { ...defaultConfig.login_config, ...data.login_config },
                    });
                } catch (error) {
                    console.error("Falha ao carregar personalização, usando padrão.", error);
                    setConfig(defaultConfig);
                } finally {
                    setLoading(false);
                }
            } else {
                // Se não há usuário, usa config padrão e para de carregar
                setConfig(defaultConfig);
                setLoading(false);
            }
        };

        fetchConfig();
    }, [user]); // Roda sempre que o usuário mudar (login/logout)

    return (
        <CustomizationContext.Provider value={{ config, loading }}>
            {children}
        </CustomizationContext.Provider>
    );
};

// Hook customizado para facilitar o uso do contexto
export const useCustomization = () => useContext(CustomizationContext);