// src/components/SlaDetails.js

import React from 'react';
import { FaCheckCircle, FaExclamationTriangle, FaHourglassHalf, FaTimesCircle } from 'react-icons/fa';
import { format, parseISO, differenceInMinutes, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import './SlaDetails.css'; // Vamos criar este arquivo CSS

// A função getSlaStatus é muito útil, então vamos trazê-la para cá
const getSlaStatus = (chamado) => {
    if (!chamado.sla_prazo_resolucao) {
        return { text: 'N/A', type: 'default', percent: 0, tooltip: 'Sem política de SLA aplicada' };
    }

    const prazo = parseISO(chamado.sla_prazo_resolucao);
    const criacao = parseISO(chamado.criado_em);
    const agora = new Date();

    const tempoTotalSla = differenceInMinutes(prazo, criacao);

    if (chamado.data_resolucao) {
        const dataResolucao = parseISO(chamado.data_resolucao);
        const cumpriu = dataResolucao <= prazo;
        return {
            text: cumpriu ? 'Cumprido' : 'Violado',
            type: cumpriu ? 'ok' : 'violado',
            percent: 100,
            tooltip: cumpriu ? 'Resolvido dentro do prazo' : 'Resolvido fora do prazo'
        };
    }

    const tempoDecorrido = differenceInMinutes(agora, criacao);
    let percent = Math.max(0, Math.min(100, (tempoDecorrido / tempoTotalSla) * 100));
    
    const minutosRestantes = differenceInMinutes(prazo, agora);
    
    if (minutosRestantes < 0) {
        return { text: 'Atrasado', type: 'violado', percent: 100, tooltip: `Atrasado há ${formatDistanceToNowStrict(prazo, { locale: ptBR })}` };
    }
    if (percent >= 75) {
        return { text: 'Atenção', type: 'alerta', percent, tooltip: `Tempo restante: ${formatDistanceToNowStrict(prazo, { locale: ptBR })}` };
    }
    
    return { text: 'No Prazo', type: 'ok', percent, tooltip: `Tempo restante: ${formatDistanceToNowStrict(prazo, { locale: ptBR })}` };
};

const SlaDetails = ({ chamado }) => {
    const sla = getSlaStatus(chamado);

    const ICONS = {
        ok: <FaCheckCircle />,
        alerta: <FaExclamationTriangle />,
        violado: <FaTimesCircle />,
        default: <FaHourglassHalf />
    };

    if (sla.type === 'default') {
        return (
            <div className="sla-details-card sla-default">
                <div className="sla-header">
                    {ICONS.default}
                    <h4>Status do SLA</h4>
                </div>
                <p>Nenhuma política de SLA foi aplicada a este chamado.</p>
            </div>
        );
    }
    
    return (
        <div className={`sla-details-card sla-${sla.type}`}>
            <div className="sla-header">
                {ICONS[sla.type]}
                <h4>Status do SLA: {sla.text}</h4>
            </div>
            
            <div className="sla-progress-bar">
                <div 
                    className="sla-progress-fill" 
                    style={{ width: `${sla.percent}%` }}
                ></div>
            </div>

            <div className="sla-info">
                <span>Início: <strong>{format(parseISO(chamado.criado_em), 'dd/MM/yy HH:mm')}</strong></span>
                <span>Prazo Final: <strong>{format(parseISO(chamado.sla_prazo_resolucao), 'dd/MM/yy HH:mm')}</strong></span>
            </div>
             <p className="sla-tooltip">{sla.tooltip}</p>
        </div>
    );
};

export default SlaDetails;