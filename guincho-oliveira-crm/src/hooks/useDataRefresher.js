import React, { createContext, useState, useContext, useCallback } from 'react';

const DataRefresherContext = createContext();

export function DataRefresherProvider({ children }) {
    // Funcionalidade existente
    const [refreshKey, setRefreshKey] = useState(0);
    const refreshData = useCallback(() => {
        setRefreshKey(prevKey => prevKey + 1);
    }, []);

    // --- NOVA FUNCIONALIDADE ---
    // Estado para guardar o anúncio que deve ser aberto por um clique externo
    const [anuncioParaAbrir, setAnuncioParaAbrir] = useState(null);

    // Função que outros componentes chamarão para pedir a abertura de um anúncio
    const abrirAnuncio = useCallback((anuncio) => {
        setAnuncioParaAbrir(anuncio);
    }, []);


    return (
        <DataRefresherContext.Provider value={{ 
            refreshKey, 
            refreshData,
            anuncioParaAbrir,
            abrirAnuncio,
            setAnuncioParaAbrir // Expondo o setter para o Dashboard limpar o estado
        }}>
            {children}
        </DataRefresherContext.Provider>
    );
}

export const useDataRefresher = () => {
    return useContext(DataRefresherContext);
};