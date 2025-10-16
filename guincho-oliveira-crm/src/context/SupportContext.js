// src/context/SupportContext.js

import React, { createContext, useState, useContext } from 'react';

const SupportContext = createContext();

export const SupportProvider = ({ children }) => {
    const [modalState, setModalState] = useState({
        isOpen: false,
        ticketId: null,
    });

    // Usado pela notificação para abrir um ticket específico
    const openSupportTicket = (ticketId) => {
        setModalState({ isOpen: true, ticketId });
    };

    // Usado pelo botão FAB para abrir a lista de tickets
    const openSupportModal = () => {
        setModalState({ isOpen: true, ticketId: null });
    }

    // Usado para fechar o modal
    const closeSupportModal = () => {
        setModalState({ isOpen: false, ticketId: null });
    };

    return (
        <SupportContext.Provider value={{ ...modalState, openSupportTicket, closeSupportModal, openSupportModal }}>
            {children}
        </SupportContext.Provider>
    );
};

export const useSupport = () => useContext(SupportContext);