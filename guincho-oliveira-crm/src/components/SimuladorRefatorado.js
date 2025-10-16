import React, { useState, useEffect, useCallback } from 'react';
import Select from 'react-select';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './SimuladorRefatorado.css';
import L from 'leaflet';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import axios from 'axios';
import { FaCog, FaSave, FaFilePdf, FaPaperPlane, FaExchangeAlt, FaPlus, FaTrashAlt, FaUserPlus, FaEraser } from 'react-icons/fa';
import EnviarModal from './EnviarModal'; // Importação do modal de envio

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiYmxuYXNjaW1lbnRvMjQwMjk4IiwiYSI6ImNtZ2lnYnc1NTA5MmEycG9pM2M5M3IwcWMifQ.JcuK1f9M-yZdwCeTXDx20Q';


// --- SUB-COMPONENTES E ESTADOS INICIAIS ---
const PriceEditModal = ({ rule, onClose, onSave }) => {
    const [currentRule, setCurrentRule] = useState(rule);
    const handleChange = (e) => {
        const { name, value } = e.target;
        setCurrentRule(prev => ({ ...prev, [name]: value }));
    };
    const handleSave = () => { onSave(currentRule); };
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3>Editando Preço</h3>
                <h4>{rule.tipo_veiculo} - {rule.tipo_servico}</h4>
                <div className="form-group"><label>Valor Fixo (R$)</label><input type="number" name="valor_fixo" value={currentRule.valor_fixo} onChange={handleChange} /></div>
                <div className="form-group"><label>Valor por Km (R$)</label><input type="number" step="0.01" name="valor_km" value={currentRule.valor_km} onChange={handleChange} /></div>
                <div className="form-group"><label>Adicional Noturno (R$)</label><input type="number" name="valor_adicional_noturno" value={currentRule.valor_adicional_noturno} onChange={handleChange} /></div>
                <div className="modal-actions"><button type="button" onClick={onClose} className="btn-cancel">Cancelar</button><button type="button" onClick={handleSave} className="btn-save-modal">Salvar</button></div>
            </div>
        </div>
    );
};
const PriceManagerModal = ({ isOpen, onClose, precos, onEditRule }) => {
    const [selectedVehicleType, setSelectedVehicleType] = useState(precos.length > 0 ? precos[0].tipo_veiculo : null);
    const vehicleTypes = [...new Set(precos.map(p => p.tipo_veiculo))];
    if (!isOpen) return null;
    return (
        <div className="modal-overlay">
            <div className="modal-content modal-lg">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3>Gerenciador de Preços</h3>
                <div className="price-manager-container">
                    <div className="vehicle-list">
                        {vehicleTypes.map(type => (
                            <button key={type} className={`vehicle-list-item ${selectedVehicleType === type ? 'active' : ''}`} onClick={() => setSelectedVehicleType(type)}>
                                {type}
                            </button>
                        ))}
                    </div>
                    <div className="price-details">
                        {selectedVehicleType ? precos.filter(p => p.tipo_veiculo === selectedVehicleType).map(rule => (
                            <div key={rule.id} className="price-rule-item">
                                <div className="price-rule-info">
                                    <strong>{rule.tipo_servico}</strong>
                                    <span>Fixo: R$ {rule.valor_fixo} | Km: R$ {rule.valor_km} | Ad. Noturno: R$ {rule.valor_adicional_noturno}</span>
                                </div>
                                <button className="btn-edit-price" onClick={() => onEditRule(rule)}>Editar</button>
                            </div>
                        )) : <p>Selecione um tipo de veículo.</p>}
                    </div>
                </div>
                <div className="modal-actions">
                    <button onClick={onClose} className="btn-primary">Fechar</button>
                </div>
            </div>
        </div>
    );
};
const QuickClientModal = ({ onClose, onClientCreated }) => {
    const [newClient, setNewClient] = useState({ nome: '', telefone: '', email: '', endereco: '', cpf_cnpj: '' });
    const [isSaving, setIsSaving] = useState(false);
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewClient(prev => ({ ...prev, [name]: value }));
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newClient.nome || !newClient.telefone) {
            toast.warn('Nome e Telefone são obrigatórios.');
            return;
        }
        setIsSaving(true);
        try {
            const response = await api.post('/api/clients', newClient);
            const createdClientData = { ...newClient, id: response.data.id };
            toast.success('Cliente cadastrado com sucesso!');
            onClientCreated(createdClientData);
            onClose();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Não foi possível cadastrar o cliente.');
        } finally {
            setIsSaving(false);
        }
    };
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button onClick={onClose} className="modal-close-button">&times;</button>
                <h3><FaUserPlus /> Adicionar Novo Cliente</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group"><label>Nome</label><input type="text" name="nome" value={newClient.nome} onChange={handleInputChange} required /></div>
                    <div className="form-group"><label>Telefone</label><input type="text" name="telefone" value={newClient.telefone} onChange={handleInputChange} required /></div>
                    <div className="form-group"><label>Email</label><input type="email" name="email" value={newClient.email} onChange={handleInputChange} /></div>
                    <div className="form-group"><label>Endereço</label><input type="text" name="endereco" value={newClient.endereco} onChange={handleInputChange} /></div>
                    <div className="form-group"><label>CPF/CNPJ</label><input type="text" name="cpf_cnpj" value={newClient.cpf_cnpj} onChange={handleInputChange} /></div>
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-cancel">Cancelar</button>
                        <button type="submit" className="btn-save-modal" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Cadastrar Cliente'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const initialState = { partida: '', cepPartida: '', numeroPartida: '', chegada: '', cepChegada: '', numeroChegada: '', tipoVeiculo: 'Padrão', tipoServico: 'Dentro da Cidade', desconto: 0, addNoturno: false, valorFixoOutros: '', valorKmOutros: '' };
const initialRotaInfo = { distanciaKm: 0, tempoMinutos: 0, partidaCoords: null, chegadaCoords: null, polyline: [] };

export default function SimuladorRefatorado({ user }) {
    const navigate = useNavigate();
    const [clientes, setClientes] = useState([]);
    const [precos, setPrecos] = useState([]);
    const [historico, setHistorico] = useState([]);
    const [savedQuote, setSavedQuote] = useState(null);
    const [clienteSelecionado, setClienteSelecionado] = useState(null);
    const [formData, setFormData] = useState(initialState);
    const [rotaInfo, setRotaInfo] = useState(initialRotaInfo);
    const [calculoDetalhado, setCalculoDetalhado] = useState(null);
    const [isLoadingRoute, setIsLoadingRoute] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
    const [isClienteAvulso, setIsClienteAvulso] = useState(false);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const userIsAdmin = user && ['admin_geral', 'admin'].includes(user.perfil);
    const [logoBase64, setLogoBase64] = useState(null);
    const [logoDimensions, setLogoDimensions] = useState(null);

    useEffect(() => {
        const imageToBase64 = (url, callback) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL('image/png');
                callback(dataURL, { width: img.width, height: img.height });
            };
            img.onerror = () => {
                console.error("Erro ao carregar o logo. Verifique se 'logo_guincho.png' está na pasta /public.");
                callback(null, null);
            }
            img.src = '/logo_guincho.png';
        };
        
        imageToBase64('/logo_guincho.png', (base64, dims) => {
            setLogoBase64(base64);
            setLogoDimensions(dims);
        });
    }, []);

    const fetchHistorico = async () => {
        try {
            const res = await api.get('/api/orcamentos/historico');
            setHistorico(res.data);
        } catch (err) {
            toast.error("Falha ao atualizar o histórico de cotações.");
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [resClientes, resPrecos, resHistorico] = await Promise.all([
                    api.get('/api/clients/list-for-simulator'),
                    api.get('/api/orcamentos/precos'),
                    api.get('/api/orcamentos/historico'),
                ]);
                if (Array.isArray(resClientes.data)) {
                    setClientes(resClientes.data.map(c => ({ value: c.id, label: `${c.nome} (${c.cpf_cnpj || ''})`, ...c })));
                } else { setClientes([]); }
                setPrecos(resPrecos.data);
                setHistorico(resHistorico.data);
            } catch (err) { toast.error("Falha ao carregar dados da página."); }
        };
        fetchData();
    }, []);

    useEffect(() => {
        const calcular = () => {
            if (!formData.tipoVeiculo || !precos.length) return;
            let valorFixo = 0, custoPorKm = 0, adicionalNoturnoValor = 0;
            if (formData.tipoServico === 'Outros') {
                valorFixo = parseFloat(formData.valorFixoOutros) || 0;
                custoPorKm = parseFloat(formData.valorKmOutros) || 0;
                if (precos.length > 0) {
                    const precoRef = precos.find(p => p.tipo_veiculo === formData.tipoVeiculo && p.tipo_servico === 'Dentro da Cidade') || precos[0];
                    adicionalNoturnoValor = precoRef ? parseFloat(precoRef.valor_adicional_noturno) : 0;
                }
            } else {
                const precoRegra = precos.find(p => p.tipo_veiculo === formData.tipoVeiculo && p.tipo_servico === formData.tipoServico);
                if (!precoRegra) { setCalculoDetalhado(null); return; }
                valorFixo = parseFloat(precoRegra.valor_fixo);
                custoPorKm = parseFloat(precoRegra.valor_km);
                adicionalNoturnoValor = parseFloat(precoRegra.valor_adicional_noturno);
            }
            const custoKmTotal = (rotaInfo?.distanciaKm || 0) * custoPorKm;
            const adicionalNoturnoTotal = formData.addNoturno ? adicionalNoturnoValor : 0;
            const subtotal = valorFixo + custoKmTotal + adicionalNoturnoTotal;
            const desconto = parseFloat(formData.desconto) || 0;
            const total = subtotal - desconto;
            setCalculoDetalhado({ valorFixo, custoPorKm, distancia: rotaInfo?.distanciaKm || 0, custoKm: custoKmTotal, adicionalNoturno: adicionalNoturnoTotal, subtotal, desconto, total });
        };
        calcular();
    }, [formData, rotaInfo, precos]);
    
    const handleClienteAvulsoToggle = () => {
        const novoEstado = !isClienteAvulso;
        setIsClienteAvulso(novoEstado);
        if (novoEstado) setClienteSelecionado(null);
    };

    const handleClientCreated = (newClient) => {
        const formattedClient = { value: newClient.id, label: `${newClient.nome} (${newClient.cpf_cnpj || ''})`, ...newClient };
        setClientes(prev => [...prev, formattedClient].sort((a, b) => a.label.localeCompare(b.label)));
        setClienteSelecionado(formattedClient);
        setIsClienteAvulso(false);
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleBuscaCep = async (cep, campoEndereco) => {
        const cepLimpo = cep.replace(/\D/g, '');
        if (cepLimpo.length !== 8) { if (cepLimpo.length > 0) toast.warn('CEP inválido.'); return; }
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
            const data = await response.json();
            if (data.erro) {
                toast.error('CEP não encontrado.');
                setFormData(prev => ({ ...prev, [campoEndereco]: '' }));
            } else {
                const endereco = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;
                setFormData(prev => ({ ...prev, [campoEndereco]: endereco }));
                toast.success('Endereço preenchido!');
            }
        } catch (error) { toast.error('Falha ao buscar CEP.'); }
    };
    
    const buscarRota = useCallback(async () => {
        if (MAPBOX_ACCESS_TOKEN.includes('COPIE_E_COLE')) {
            toast.error("A chave (Access Token) da Mapbox não foi configurada no código.");
            return;
        }
        if (!formData.partida || !formData.chegada || !formData.numeroPartida || !formData.numeroChegada) {
            toast.error("Endereço de partida, chegada e os números são obrigatórios.");
            return;
        }
        setIsLoadingRoute(true);
        const montarEnderecoComPrecisao = (enderecoBase, numero) => {
            if (!enderecoBase || !enderecoBase.trim()) return '';
            const partes = enderecoBase.split(/,(.+)/);
            const logradouro = partes[0].trim();
            const restoDoEndereco = partes[1] ? partes[1].trim() : '';
            const enderecoFinal = `${logradouro}, ${numero}, ${restoDoEndereco}`;
            return enderecoFinal.replace(/, ,/g, ',').replace(/\s\s+/g, ' ');
        };
        const enderecoCompletoPartida = montarEnderecoComPrecisao(formData.partida, formData.numeroPartida);
        const enderecoCompletoChegada = montarEnderecoComPrecisao(formData.chegada, formData.numeroChegada);
        if (!enderecoCompletoPartida || !enderecoCompletoChegada) {
            toast.error("Os campos de endereço (rua/bairro/cidade) não podem estar vazios.");
            setIsLoadingRoute(false);
            return;
        }
        try {
            const geocodeUrl = (endereco) => `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(endereco)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&country=BR&language=pt`;
            const [resPartida, resChegada] = await Promise.all([
                axios.get(geocodeUrl(enderecoCompletoPartida)),
                axios.get(geocodeUrl(enderecoCompletoChegada))
            ]);
            if (resPartida.data.features.length === 0 || resChegada.data.features.length === 0) {
                toast.error("Um ou ambos os endereços não foram encontrados com precisão. Verifique os dados.");
                setIsLoadingRoute(false);
                return;
            }
            const partidaCoords = resPartida.data.features[0].center;
            const chegadaCoords = resChegada.data.features[0].center;
            const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${partidaCoords.join(',')};${chegadaCoords.join(',')}` + `?access_token=${MAPBOX_ACCESS_TOKEN}&geometries=geojson&language=pt`;
            const resRota = await axios.get(directionsUrl);
            const rota = resRota.data.routes[0];
            const distanciaMetros = rota.distance;
            const tempoSegundos = rota.duration;
            const polyline = rota.geometry.coordinates.map(p => [p[1], p[0]]);
            setRotaInfo({
                distanciaKm: parseFloat((distanciaMetros / 1000).toFixed(2)),
                tempoMinutos: Math.round(tempoSegundos / 60),
                partidaCoords: [partidaCoords[1], partidaCoords[0]],
                chegadaCoords: [chegadaCoords[1], chegadaCoords[0]],
                polyline,
            });
            toast.success("Rota calculada com precisão pela Mapbox!");
        } catch (error) {
            console.error("Erro ao buscar rota com Mapbox:", error);
            const errorMessage = error.response?.data?.message || "Falha ao calcular a rota.";
            toast.error(errorMessage);
            setRotaInfo(initialRotaInfo);
        } finally {
            setIsLoadingRoute(false);
        }
    }, [formData]);
    
    const handleNovaCotacao = () => {
        setFormData(initialState);
        setRotaInfo(initialRotaInfo);
        setCalculoDetalhado(null);
        setClienteSelecionado(null);
        setSavedQuote(null);
        setIsClienteAvulso(false);
        toast.info("Formulário limpo. Pronto para uma nova cotação!");
    };

    const handleCarregarHistorico = async (id) => {
        try {
            const response = await api.get(`/api/orcamentos/${id}`);
            const orcamento = response.data;
            const dados = JSON.parse(orcamento.dados_cotacao);
            setFormData(dados.formData);
            setRotaInfo(dados.rotaInfo);
            setCalculoDetalhado(dados.calculoDetalhado);
            setSavedQuote({ id: orcamento.id, uid: orcamento.orcamento_uid });
            if (orcamento.cliente_id) {
                const cliente = clientes.find(c => c.value === orcamento.cliente_id);
                setClienteSelecionado(cliente || null);
                setIsClienteAvulso(false);
            } else {
                setClienteSelecionado(null);
                setIsClienteAvulso(true);
            }
            toast.success(`Cotação #${orcamento.orcamento_uid} carregada.`);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            toast.error('Falha ao carregar cotação do histórico.');
        }
    };

    const handleSalvarCotacao = async () => {
        if (!calculoDetalhado) {
            toast.warn('Calcule uma rota antes de salvar.');
            return;
        }
        if (!isClienteAvulso && !clienteSelecionado) {
            toast.warn('Selecione um cliente ou marque como "Cliente Avulso".');
            return;
        }
        setIsSaving(true);
        const payload = {
            cliente_id: clienteSelecionado ? clienteSelecionado.value : null,
            dados_cotacao: JSON.stringify({ formData, rotaInfo, calculoDetalhado }),
            valor_total: calculoDetalhado.total,
        };
        try {
            const response = await api.post('/api/orcamentos', payload);
            setSavedQuote({ id: response.data.id, uid: response.data.uid });
            toast.success(`Cotação #${response.data.uid} salva com sucesso!`);
            fetchHistorico();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Falha ao salvar a cotação.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenSendModal = () => {
        if (!savedQuote) {
            toast.warn('Você precisa salvar a cotação antes de poder enviá-la.');
            return;
        }
        setIsSendModalOpen(true);
    };
    
    const handleGerarPDF = () => {
        if (!calculoDetalhado) return toast.warn('Calcule uma rota para gerar o PDF.');
        if (!logoBase64 || !logoDimensions) {
            return toast.error("O logo ainda não foi carregado. Tente novamente em 1 segundo.");
        }
        const doc = new jsPDF();
        const nomeEmpresa = "Guincho Oliveira", telEmpresa = "(12) 1234-5678", emailEmpresa = "comercial@guinchooliveira.com", endEmpresa = "Rua Exemplo, 123 - Cidade/UF";
        const primaryColor = '#101C5D', secondaryColor = '#FF8C00', textColor = '#333', lightTextColor = '#555';
        const margin = 14, pageWidth = doc.internal.pageSize.getWidth();
        const maxLogoWidth = 50;
        const maxLogoHeight = 20;
        const ratio = logoDimensions.width / logoDimensions.height;
        let finalLogoWidth = maxLogoWidth;
        let finalLogoHeight = maxLogoWidth / ratio;
        if (finalLogoHeight > maxLogoHeight) {
            finalLogoHeight = maxLogoHeight;
            finalLogoWidth = maxLogoHeight * ratio;
        }
        doc.addImage(logoBase64, 'PNG', margin, 12, finalLogoWidth, finalLogoHeight);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(textColor);
        doc.text(nomeEmpresa, pageWidth - margin, 15, { align: 'right' });
        doc.text(`Telefone: ${telEmpresa}`, pageWidth - margin, 20, { align: 'right' });
        doc.text(`Email: ${emailEmpresa}`, pageWidth - margin, 25, { align: 'right' });
        doc.text(`Endereço: ${endEmpresa}`, pageWidth - margin, 30, { align: 'right' });
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryColor);
        doc.text("ORÇAMENTO DE SERVIÇO", pageWidth / 2, 45, { align: 'center' });
        doc.setDrawColor(secondaryColor);
        doc.line(margin, 52, pageWidth - margin, 52);
        const clienteNome = clienteSelecionado ? `${clienteSelecionado.nome} (${clienteSelecionado.cpf_cnpj || 'N/A'})` : 'Cliente Avulso';
        const dataCotacao = new Date();
        const dataValidade = new Date();
        dataValidade.setDate(dataValidade.getDate() + 2);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(lightTextColor);
        doc.text(`Cliente: `, margin, 60);
        doc.text(`Data da Cotação: `, margin, 65);
        doc.setTextColor(textColor);
        doc.setFont('helvetica', 'bold');
        doc.text(clienteNome, margin + 15, 60);
        doc.text(dataCotacao.toLocaleDateString('pt-BR'), margin + 35, 65);
        const rightColStart = pageWidth - margin - 50;
        doc.setTextColor(lightTextColor);
        doc.setFont('helvetica', 'normal');
        doc.text(`Orçamento Nº:`, rightColStart, 60);
        doc.text(`Válido até:`, rightColStart, 65);
        doc.setTextColor(textColor);
        doc.setFont('helvetica', 'bold');
        doc.text(savedQuote?.uid || 'COT-TEMP-0001', pageWidth - margin, 60, { align: 'right' });
        doc.text(dataValidade.toLocaleDateString('pt-BR'), pageWidth - margin, 65, { align: 'right' });
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryColor);
        doc.text("Detalhes da Rota", margin, 80);
        autoTable(doc, {
            startY: 83,
            body: [['Local de Partida', formData.partida], ['Local de Chegada', formData.chegada], ['Distância Calculada', `${rotaInfo.distanciaKm.toFixed(2)} Km`], ['Tempo Estimado', `${rotaInfo.tempoMinutos} minutos`]],
            head: [['Descrição', 'Detalhe']],
            theme: 'grid',
            styles: { fillColor: '#FFFFFF', textColor, lineColor: [220, 220, 220], lineWidth: 0.1 },
            headStyles: { fillColor: '#F7F7F7', textColor: lightTextColor, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 50 } }
        });
        const finalYRota = doc.lastAutoTable.finalY;
        doc.setFontSize(12);
        doc.text("Detalhamento Financeiro", margin, finalYRota + 15);
        autoTable(doc, {
            startY: finalYRota + 18,
            head: [['Item', 'Descrição', 'Valor (R$)']],
            body: [['Valor Fixo', `${formData.tipoVeiculo} / ${formData.tipoServico}`, `R$ ${calculoDetalhado.valorFixo.toFixed(2)}`], ['Custo por Distância', `${calculoDetalhado.distancia.toFixed(2)} Km @ R$ ${calculoDetalhado.custoPorKm.toFixed(2)}/Km`, `R$ ${calculoDetalhado.custoKm.toFixed(2)}`], ['Desconto', '', `- R$ ${calculoDetalhado.desconto.toFixed(2)}`]],
            foot: [['TOTAL', '', `R$ ${calculoDetalhado.total.toFixed(2)}`]],
            theme: 'striped',
            headStyles: { fillColor: primaryColor, textColor: '#FFFFFF' },
            footStyles: { fillColor: secondaryColor, textColor: '#FFFFFF', fontStyle: 'bold' },
            columnStyles: { 2: { halign: 'right' } },
        });
        const finalYFinanceiro = doc.lastAutoTable.finalY;
        doc.setFontSize(9);
        doc.setTextColor(lightTextColor);
        doc.setFont('helvetica', 'bold');
        doc.text("Observações:", margin, finalYFinanceiro + 15);
        doc.setFont('helvetica', 'normal');
        doc.text("- Orçamento válido por 48 horas.", margin, finalYFinanceiro + 20);
        doc.text("- Valores sujeitos a alteração em caso de mudanças nas condições do serviço.", margin, finalYFinanceiro + 25);
        doc.save(`orcamento_${savedQuote?.uid || 'simulacao'}.pdf`);
    };

    const handleConverterOS = async () => {
        if (!savedQuote) {
            toast.error("Você precisa salvar a cotação antes de convertê-la em OS.");
            return;
        }
        let nomeClienteAvulso = null;
        if (isClienteAvulso) {
            nomeClienteAvulso = window.prompt("Digite o nome do cliente avulso para a OS:");
            if (!nomeClienteAvulso) {
                toast.warn("Conversão cancelada. Nome do cliente avulso é necessário.");
                return;
            }
        }
        try {
            const response = await api.post(`/api/orcamentos/${savedQuote.id}/converter-os`, { nome_cliente_avulso: nomeClienteAvulso });
            toast.success(response.data.message);
            handleNovaCotacao();
            fetchHistorico();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Falha ao converter cotação em OS.');
        }
    };

    const handleUpdatePriceRule = async (rule) => {
        try {
            await api.put(`/api/orcamentos/precos/${rule.id}`, rule);
            setPrecos(prev => prev.map(p => p.id === rule.id ? rule : p));
            toast.success('Regra de preço atualizada!');
            setEditingRule(null);
        } catch (error) {
            toast.error('Falha ao atualizar o preço.');
        }
    };

    const handleDeleteCotacao = async (e, id) => {
        e.stopPropagation();
        if (!window.confirm("Tem certeza que deseja excluir esta cotação? Se houver uma OS vinculada, ela também será removida.")) {
            return;
        }
        try {
            await api.delete(`/api/orcamentos/${id}`);
            setHistorico(prev => prev.filter(h => h.id !== id));
            toast.success("Cotação excluída com sucesso.");
        } catch (error) {
            toast.error(error.response?.data?.error || "Falha ao excluir a cotação.");
        }
    };

    if (!user) { return <div>Carregando...</div>; }

    return (
        <div className="simulador-container">
            {editingRule && <PriceEditModal rule={editingRule} onClose={() => setEditingRule(null)} onSave={handleUpdatePriceRule} />}
            <PriceManagerModal isOpen={isPriceModalOpen} onClose={() => setIsPriceModalOpen(false)} precos={precos} onEditRule={(rule) => { setIsPriceModalOpen(false); setEditingRule(rule); }} />
            {isClientModalOpen && <QuickClientModal onClose={() => setIsClientModalOpen(false)} onClientCreated={handleClientCreated} />}
            <EnviarModal 
                isOpen={isSendModalOpen}
                onClose={() => setIsSendModalOpen(false)}
                quoteData={{ 
                    id: savedQuote?.id, 
                    uid: savedQuote?.uid, 
                    cliente: clienteSelecionado 
                }}
            />
            <div className="coluna-esquerda">
                <div className="card">
                    <h3>1. Dados da Cotação</h3>
                    <div className="form-group-checkbox"><input type="checkbox" id="cliente_avulso" checked={isClienteAvulso} onChange={handleClienteAvulsoToggle} /><label htmlFor="cliente_avulso">Cliente Avulso</label></div>
                    <div className="form-group">
                        <div className="label-com-botao">
                            <label>Cliente</label>
                            {!isClienteAvulso && (<button className="btn-add-quick" onClick={() => setIsClientModalOpen(true)} title="Adicionar Novo Cliente"><FaUserPlus /> Rápido</button>)}
                        </div>
                        <Select options={clientes} onChange={setClienteSelecionado} value={clienteSelecionado} isSearchable placeholder="Digite para buscar..." isDisabled={isClienteAvulso} classNamePrefix="Select" />
                    </div>
                    <div className="form-group-endereco-completo">
                        <div className="cep-input"><label>CEP Partida</label><input type="text" name="cepPartida" value={formData.cepPartida} onChange={handleInputChange} onBlur={(e) => handleBuscaCep(e.target.value, 'partida')} maxLength="9" placeholder="00000-000" /></div>
                        <div className="endereco-input"><label>Local de Partida</label><input type="text" name="partida" value={formData.partida} onChange={handleInputChange} placeholder="Rua, Bairro..."/></div>
                        <div className="numero-input"><label>Número</label><input type="text" name="numeroPartida" value={formData.numeroPartida} onChange={handleInputChange} /></div>
                    </div>
                    <div className="form-group-endereco-completo">
                        <div className="cep-input"><label>CEP Chegada</label><input type="text" name="cepChegada" value={formData.cepChegada} onChange={handleInputChange} onBlur={(e) => handleBuscaCep(e.target.value, 'chegada')} maxLength="9" placeholder="00000-000"/></div>
                        <div className="endereco-input"><label>Local de Chegada</label><input type="text" name="chegada" value={formData.chegada} onChange={handleInputChange} placeholder="Rua, Bairro..."/></div>
                        <div className="numero-input"><label>Número</label><input type="text" name="numeroChegada" value={formData.numeroChegada} onChange={handleInputChange} /></div>
                    </div>
                    <div className="form-group"><button className="btn-primary-full" onClick={buscarRota} disabled={isLoadingRoute}>{isLoadingRoute ? 'Buscando...' : 'Buscar Rota e Calcular'}</button></div>
                    <div className="input-group">
                        <div className="form-group"><label>Tipo de Veículo</label><select name="tipoVeiculo" value={formData.tipoVeiculo} onChange={handleInputChange}><option>Padrão</option><option>SUV</option><option>Moto</option></select></div>
                        <div className="form-group"><label>Tipo de Serviço</label><select name="tipoServico" value={formData.tipoServico} onChange={handleInputChange}><option>Dentro da Cidade</option><option>Dentro do Estado</option><option>Interestadual</option><option>Outros</option></select></div>
                    </div>
                    {formData.tipoServico === 'Outros' && (
                        <div className="outros-personalizado-card">
                            <h4>Valores Personalizados</h4>
                            <div className="input-group">
                                <div className="form-group"><label>Valor Fixo (R$)</label><input type="number" name="valorFixoOutros" value={formData.valorFixoOutros} onChange={handleInputChange} /></div>
                                <div className="form-group"><label>Valor por Km (R$)</label><input type="number" name="valorKmOutros" value={formData.valorKmOutros} onChange={handleInputChange} /></div>
                            </div>
                        </div>
                    )}
                    <div className="form-group"><label><input type="checkbox" name="addNoturno" checked={formData.addNoturno} onChange={handleInputChange}/> Adicional Noturno</label></div>
                    <div className="botoes-rodape-form">
                        <button className="btn-secondary" onClick={handleNovaCotacao}><FaEraser /> Limpar Formulário</button>
                        {userIsAdmin && (<button className="btn-secondary" onClick={() => setIsPriceModalOpen(true)}><FaCog /> Gerenciar Preços</button>)}
                    </div>
                </div>
                {calculoDetalhado && (
                    <>
                        <div className="card">
                            <h3>3. Ações</h3>
                            <div className="actions-panel">
                                <button className="btn-primary" onClick={handleSalvarCotacao} disabled={isSaving || (!isClienteAvulso && !clienteSelecionado)}><FaSave /> {isSaving ? 'Salvando...' : 'Salvar'}</button>
                                <button className="btn-secondary" onClick={handleGerarPDF}><FaFilePdf /> PDF</button>
                                <button className="btn-secondary" onClick={handleOpenSendModal} disabled={!savedQuote}><FaPaperPlane /> Enviar</button>
                                <button className="btn-success" onClick={handleConverterOS} disabled={!savedQuote}><FaExchangeAlt /> Converter em OS</button>
                                <button className="btn-outline" onClick={handleNovaCotacao} style={{ gridColumn: '1 / -1' }}><FaPlus /> Nova Cotação</button>
                            </div>
                        </div>
                        <div className="card">
                            <h3>Últimas Cotações</h3>
                            <div className="lista-historico">{historico.map(h => (
                                <div key={h.id} className="historico-item" onClick={() => handleCarregarHistorico(h.id)}>
                                    <div className="historico-item-info"><strong>{h.orcamento_uid}</strong><span>{h.nome_cliente || 'Cliente Avulso'}</span><small>{new Date(h.criado_em).toLocaleDateString()}</small></div>
                                    <div className="historico-item-valor">
                                        <div style={{textAlign: 'right'}}>
                                            <strong>R$ {parseFloat(h.valor_total).toFixed(2)}</strong>
                                            <span className={`historico-status status-${h.status.toLowerCase()}`}>{h.status}</span>
                                        </div>
                                        {userIsAdmin && (<button className="btn-delete-cotacao" onClick={(e) => handleDeleteCotacao(e, h.id)}><FaTrashAlt /></button>)}
                                    </div>
                                </div>
                            ))}</div>
                        </div>
                    </>
                )}
            </div>
            <div className="coluna-direita">
                {!calculoDetalhado ? (
                    <div className="card placeholder-card"><h3>Aguardando Cálculo</h3><p>Preencha os dados e clique em "Buscar Rota" para ver os resultados.</p></div>
                ) : (
                    <>
                        <div className="card">
                            <h3>2. Rota e Custos</h3>
                            <div className="mapa-container">
                                <MapContainer center={rotaInfo.partidaCoords || [-14.23, -51.92]} zoom={13} style={{ height: '100%', width: '100%' }}>
                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                    {rotaInfo.partidaCoords && <Marker position={rotaInfo.partidaCoords} />}
                                    {rotaInfo.chegadaCoords && <Marker position={rotaInfo.chegadaCoords} />}
                                    {rotaInfo.polyline.length > 0 && <Polyline positions={rotaInfo.polyline} color="blue" />}
                                </MapContainer>
                            </div>
                        </div>
                        <div className="card">
                            <h3>Detalhamento Financeiro</h3>
                            <div className="detalhes-financeiros-item"><span>Valor Fixo</span> <span>R$ {calculoDetalhado.valorFixo.toFixed(2)}</span></div>
                            <div className="detalhes-financeiros-item"><span>Custo por Distância ({calculoDetalhado.distancia.toFixed(2)} Km)</span> <span>R$ {calculoDetalhado.custoKm.toFixed(2)}</span></div>
                            {calculoDetalhado.adicionalNoturno > 0 && <div className="detalhes-financeiros-item"><span>Adicional Noturno</span> <span>R$ {calculoDetalhado.adicionalNoturno.toFixed(2)}</span></div>}
                            <div className="detalhes-financeiros-item"><strong>Subtotal</strong> <strong>R$ {calculoDetalhado.subtotal.toFixed(2)}</strong></div>
                            <div className="form-group"><label>Desconto (R$)</label><input type="number" name="desconto" value={formData.desconto} onChange={handleInputChange} style={{textAlign: 'right'}} /></div>
                            <div className="detalhes-financeiros-item total"><span>TOTAL</span> <span>R$ {calculoDetalhado.total.toFixed(2)}</span></div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}