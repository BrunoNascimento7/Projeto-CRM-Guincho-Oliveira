// src/utils/formatters.js

export const formatCurrency = (value) => {
    const numericValue = typeof value === 'number' ? value : 0;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(numericValue);
};