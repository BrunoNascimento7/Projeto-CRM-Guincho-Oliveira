import React, { createContext, useState, useContext } from 'react';

const UIContext = createContext();

export const UIProvider = ({ children }) => {
    const [showLayoutButtons, setShowLayoutButtons] = useState(true);

    return (
        <UIContext.Provider value={{ showLayoutButtons, setShowLayoutButtons }}>
            {children}
        </UIContext.Provider>
    );
};

export const useUI = () => useContext(UIContext);