import React, { useState, useEffect, useCallback, useRef } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import api from '../services/api';
import AnuncioModal from '../components/AnuncioModal';
import './Dashboard.css';

// Ícones
import { 
    WiDaySunny, WiNightClear, WiDayCloudy, WiNightAltCloudy, WiCloud, 
    WiCloudy, WiDayRain, WiNightAltRain, WiDayShowers, WiNightAltShowers, 
    WiDayThunderstorm, WiNightAltThunderstorm, WiSnow, WiFog 
} from 'react-icons/wi';
import { 
    FiTrendingUp, FiCheckSquare, FiDollarSign, FiSearch, FiActivity, FiMapPin
} from 'react-icons/fi';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

// --- Sub-componente do Card de Clima ---
const WeatherWidget = () => {
    const [weatherData, setWeatherData] = useState(null);
    const [cityInput, setCityInput] = useState(localStorage.getItem('userCity') || 'São José dos Campos');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [suggestions, setSuggestions] = useState([]);
    const [isSuggestionsVisible, setIsSuggestionsVisible] = useState(false);
    const weatherWidgetRef = useRef(null);

    // Função para buscar o clima. Aceita cidade (string) OU coordenadas ({ lat, lon }).
    const fetchWeather = useCallback(async (location) => {
        setLoading(true);
        setError('');
        setIsSuggestionsVisible(false);

        let endpoint = '';
        let cityToSave = '';

        try {
            if (typeof location === 'string') {
                // Busca por nome da cidade
                const cityNameOnly = location.split(',')[0].trim();
                endpoint = `/api/dashboard/weather?city=${cityNameOnly}`;
                cityToSave = location; 
            } else if (location && typeof location === 'object' && location.lat && location.lon) {
                // Busca por lat/lon (Geolocalização)
                endpoint = `/api/dashboard/weather?lat=${location.lat}&lon=${location.lon}`;
                cityToSave = ''; // A API retornará o nome da cidade real
            } else {
                throw new Error("Localização inválida.");
            }

            const { data } = await api.get(endpoint);
            setWeatherData(data);
            
            // Usa a cidade retornada pela API ou a cidade de busca original
            const resolvedCity = data.city || cityToSave; 
            setCityInput(resolvedCity);
            localStorage.setItem('userCity', resolvedCity);
            
        } catch (err) {
            console.error("Erro ao buscar clima:", err);
            setError(err.response?.data?.error || 'Erro ao buscar clima. Tente outra cidade.');
            setWeatherData(null);
            localStorage.removeItem('userCity');
        } finally {
            setLoading(false);
        }
    }, []);

    // Função para buscar a localização do navegador
    const fetchGeolocation = useCallback(() => {
        setLoading(true);
        setError('');

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // Sucesso: chama fetchWeather com as coordenadas
                    const { latitude, longitude } = position.coords;
                    fetchWeather({ lat: latitude, lon: longitude });
                },
                (err) => {
                    // Erro: geralmente por negação de permissão
                    console.warn(`ERRO GEOLOCALIZAÇÃO(${err.code}): ${err.message}`);
                    setError('Localização não permitida. Digite a cidade.');
                    
                    // Tenta buscar a cidade salva ou a padrão
                    const fallbackCity = localStorage.getItem('userCity') || 'São José dos Campos';
                    if (fallbackCity) {
                        fetchWeather(fallbackCity);
                    } else {
                        setLoading(false);
                    }
                }
            );
        } else {
            // Navegador não suporta geolocalização
            setError('Geolocalização não suportada.');
            fetchWeather(localStorage.getItem('userCity') || 'São José dos Campos');
        }
    }, [fetchWeather]);

    // Efeito inicial: Tenta a geolocalização primeiro!
    useEffect(() => {
        fetchGeolocation();
    }, [fetchGeolocation]); 
    
    // Efeito para sugestões de cidade (permanece inalterado)
    useEffect(() => {
        if (cityInput.length < 3) {
            setSuggestions([]);
            setIsSuggestionsVisible(false);
            return;
        }
        const fetchSuggestions = async () => {
            try {
                const { data } = await api.get(`/api/cities/autocomplete?query=${cityInput}`);
                setSuggestions(data);
                if (data.length > 0) {
                    setIsSuggestionsVisible(true);
                }
            } catch (error) {
                console.error("Erro ao buscar sugestões:", error);
                setSuggestions([]);
            }
        };
        const debounceTimer = setTimeout(() => {
            if (cityInput !== (localStorage.getItem('userCity') || '')) {
                fetchSuggestions();
            }
        }, 300);
        return () => clearTimeout(debounceTimer);
    }, [cityInput]);

    // Efeito para esconder sugestões ao clicar fora (permanece inalterado)
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (weatherWidgetRef.current && !weatherWidgetRef.current.contains(event.target)) {
                setIsSuggestionsVisible(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleSuggestionClick = (city) => { fetchWeather(city); };
    const handleFormSubmit = (e) => { e.preventDefault(); if (cityInput.trim()) { fetchWeather(cityInput.trim()); } };
    const handleClearInput = () => { setCityInput(''); setSuggestions([]); setIsSuggestionsVisible(false); };

    const getWeatherIcon = (iconCode) => {
        const iconMap = {
            '01d':<WiDaySunny/>,'01n':<WiNightClear/>,'02d':<WiDayCloudy/>,'02n':<WiNightAltCloudy/>,'03d':<WiCloud/>,'03n':<WiCloud/>,'04d':<WiCloudy/>,'04n':<WiCloudy/>,'09d':<WiDayShowers/>,'09n':<WiNightAltShowers/>,'10d':<WiDayRain/>,'10n':<WiNightAltRain/>,'11d':<WiDayThunderstorm/>,'11n':<WiNightAltThunderstorm/>,'13d':<WiSnow/>,'13n':<WiSnow/>,'50d':<WiFog/>,'50n':<WiFog/>,
        };
        return iconMap[iconCode] || <WiCloud/>;
    };

    return (
        <div className="weather-container" ref={weatherWidgetRef}>
            {loading ? ( <div className="weather-widget-placeholder">Carregando...</div> ) : weatherData ? (
            <div className="weather-widget">
                <div className="weather-icon">{getWeatherIcon(weatherData.icon)}</div>
                <div className="weather-info">
                    <span className="weather-temp">{weatherData.temp}°C</span>
                    <span className="weather-desc">{weatherData.description}</span>
                </div>
            </div>
            ) : null }
            <form onSubmit={handleFormSubmit} className="weather-form">
                <input 
                    type="text" 
                    value={cityInput} 
                    onChange={(e) => setCityInput(e.target.value)} 
                    onFocus={() => { if (suggestions.length > 0) setIsSuggestionsVisible(true); }} 
                    placeholder={error || "Digite uma cidade..."} 
                    className={error ? 'input-error' : ''} 
                    autoComplete="off" 
                />
                
                {/* NOVO BOTÃO DE LOCALIZAÇÃO */}
                <button 
                    type="button" 
                    className="location-button" 
                    onClick={fetchGeolocation} 
                    title="Buscar pela localização atual"
                >
                    <FiMapPin/>
                </button>
                
                {cityInput && (<button type="button" className="clear-button" onClick={handleClearInput}>&times;</button>)}
                <button type="submit" className="search-button"><FiSearch/></button>
                {isSuggestionsVisible && suggestions.length > 0 && (
                <ul className="suggestions-list">
                    {suggestions.map((city, index) => (<li key={index} onMouseDown={() => handleSuggestionClick(city)}>{city}</li>))}
                </ul>
                )}
            </form>
        </div>
    );
};

// --- Sub-componente do Slideshow (sem alterações) ---
const Slideshow = () => {
    const [images, setImages] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const fetchImages = async () => {
            try {
                const { data } = await api.get('/api/slideshow/images');
                setImages(data);
            } catch (error) {
                console.error("Erro ao carregar imagens do slideshow:", error);
            }
        };
        fetchImages();
    }, []);

    useEffect(() => {
        if (images.length > 1) {
            const timer = setInterval(() => {
                setCurrentIndex(prevIndex => (prevIndex + 1) % images.length);
            }, 5000);
            return () => clearInterval(timer);
        }
    }, [images]);

    if (images.length === 0) {
        return <div className="slideshow-container-placeholder">Nenhuma imagem para exibir.</div>;
    }

    return (
        <div className="slideshow-container">
            {images.map((image, index) => (
                <img
                    key={image.id}
                    src={image.image_url}
                    alt={`Slide ${index + 1}`}
                    className={`slideshow-image ${index === currentIndex ? 'active' : ''}`}
                />
            ))}
        </div>
    );
};

// --- Sub-componente do Ticker de Notícias (sem alterações) ---
const NewsTicker = ({ dolar, news }) => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const tickerItems = [
        `GUINCHO OLIVEIRA | ${formattedDate} - ${formattedTime}`,
        ...(dolar ? [`DÓLAR: R$ ${dolar}`] : []),
        ...(news || [])
    ];

    if (tickerItems.length <= 1) {
        return <div className="news-ticker-placeholder">Carregando informações...</div>;
    }

    return (
        <div className="news-ticker">
            <div className="ticker-content">
                {tickerItems.map((item, index) => <span key={index} className="ticker-item">{item}</span>)}
                {tickerItems.map((item, index) => <span key={`dup-${index}`} className="ticker-item">{item}</span>)}
            </div>
        </div>
    );
};

// --- Sub-componente para os cards de KPI (sem alterações) ---
const KpiCard = ({ icon, title, value, isLoading, isCurrency = false, isVisible }) => {
    const formattedValue = !isLoading && value !== null && value !== undefined
        ? isCurrency
            ? (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : (value ?? 0)
        : null;

    return (
        <div className="kpi-card">
            <div className="kpi-icon">{icon}</div>
            <div className="kpi-info">
                {isLoading ? (
                    <>
                        <div className="skeleton-line" style={{ width: '60%', height: '28px', marginBottom: '8px' }}></div>
                        <div className="skeleton-line" style={{ width: '80%', height: '16px' }}></div>
                    </>
                ) : (
                    <>
                        <span className="kpi-value">{isVisible ? formattedValue : '●●●●●'}</span>
                        <span className="kpi-title">{title}</span>
                    </>
                )}
            </div>
        </div>
    );
};


// --- Componente Principal do Dashboard (sem alterações significativas no corpo) ---
export default function Dashboard({ user }) {
    const [autoAnuncio, setAutoAnuncio] = useState(null);
    const [compromissos, setCompromissos] = useState([]);
    const [dataSelecionada, setDataSelecionada] = useState(new Date());
    const [diasComCompromisso, setDiasComCompromisso] = useState([]);
    const [dataAtiva, setDataAtiva] = useState(new Date());
    const [dolar, setDolar] = useState(null);
    const [news, setNews] = useState([]);
    const [kpiData, setKpiData] = useState(null);
    const [loadingKpi, setLoadingKpi] = useState(true);
    const [errorKpi, setErrorKpi] = useState(null);
    const [valoresVisiveis, setValoresVisiveis] = useState(false);
    
    const toggleVisibilidade = () => setValoresVisiveis(!valoresVisiveis);

    useEffect(() => {
        const fetchAutoAnuncio = async () => {
            try {
                const { data } = await api.get('/api/conteudo/anuncios-ativos');
                if (data && data.length > 0) {
                    setAutoAnuncio(data[0]);
                }
            } catch (error) {
                console.error("Não foi possível buscar anúncio automático para o dashboard.", error);
            }
        };
        const timer = setTimeout(fetchAutoAnuncio, 1500);
        return () => clearTimeout(timer);
    }, []);

    const handleCloseAutoAnuncio = () => setAutoAnuncio(null);

    useEffect(() => {
        const fetchTickerData = async () => {
            try {
                const { data } = await api.get('/api/dashboard/ticker-data');
                setDolar(data.dolar);
                setNews(data.news || []);
            } catch (error) {
                console.error("Erro ao buscar dados do ticker:", error);
            }
        };
        fetchTickerData();
    }, []);

    useEffect(() => {
        const fetchAgendaData = async () => {
            const dataFormatada = dataSelecionada.toISOString().split('T')[0];
            const ano = dataAtiva.getFullYear();
            const mes = dataAtiva.getMonth() + 1;
            try {
                const [compromissosRes, diasRes] = await Promise.all([
                    api.get(`/api/compromissos?data=${dataFormatada}`),
                    api.get(`/api/compromissos/mes?ano=${ano}&mes=${mes}`),
                ]);
                setCompromissos(compromissosRes.data);
                setDiasComCompromisso(diasRes.data);
            } catch (error) {
                console.error("Erro ao buscar dados da agenda:", error);
            }
        };
        fetchAgendaData();
    }, [dataSelecionada, dataAtiva]);
    
    useEffect(() => {
        const fetchKpiData = async () => {
            try {
                if (loadingKpi === false) setLoadingKpi(true);
                const { data } = await api.get('/api/dashboard/resumo?periodo=mensal');
                setKpiData(data);
                setErrorKpi(null);
            } catch (err) {
                console.error("Erro ao buscar dados dos KPIs:", err);
                setErrorKpi("Não foi possível carregar os indicadores.");
            } finally {
                setLoadingKpi(false);
            }
        };
        fetchKpiData();
    }, []);

    const marcarDias = ({ date, view }) => {
        if (view === 'month') {
            const diaFormatado = date.toISOString().split('T')[0];
            if (diasComCompromisso.includes(diaFormatado)) {
                return <span className="compromisso-marcador"></span>;
            }
        }
        return null;
    };

    return (
        <div className="dashboard-container">
            {autoAnuncio && (
                <AnuncioModal
                    isVisible={true}
                    anuncio={autoAnuncio}
                    onClose={handleCloseAutoAnuncio}
                />
            )}

            <header className="dashboard-header">
                <div className="welcome-message">
                    <h1>Bem-vindo, {user?.nome?.split(' ')[0] || 'Admin'}!</h1>
                    <p>Aqui está o resumo do seu dia na Guincho Oliveira.</p>
                </div>
                <WeatherWidget />
            </header>

            {errorKpi && <div className="error-message">{errorKpi}</div>}
            
            <div className="kpi-grid-container">
                <button onClick={toggleVisibilidade} className="toggle-visibility-btn" title={valoresVisiveis ? 'Ocultar valores' : 'Mostrar valores'}>
                    {valoresVisiveis ? <FaEye /> : <FaEyeSlash />}
                </button>
                <section className="kpi-grid">
                    <KpiCard icon={<FiTrendingUp />} title="Faturamento (Mensal)" value={kpiData?.faturamento ?? 0} isLoading={loadingKpi} isCurrency={true} isVisible={valoresVisiveis} />
                    <KpiCard icon={<FiDollarSign />} title="Lucro (Mensal)" value={kpiData?.lucro ?? 0} isLoading={loadingKpi} isCurrency={true} isVisible={valoresVisiveis} />
                    <KpiCard icon={<FiCheckSquare />} title="Serviços Concluídos (Mensal)" value={kpiData?.servicosConcluidos ?? 0} isLoading={loadingKpi} isVisible={valoresVisiveis} />
                    <KpiCard icon={<FiActivity />} title="Despesas (Mensal)" value={kpiData?.despesas ?? 0} isLoading={loadingKpi} isCurrency={true} isVisible={valoresVisiveis} />
                </section>
            </div>
            
            <main className="dashboard-main-content">
                <div className="agenda-card">
                    <h2>Agenda de Compromissos</h2>
                    <Calendar
                        onChange={setDataSelecionada}
                        value={dataSelecionada}
                        className="react-calendar-custom"
                        tileContent={marcarDias}
                        onActiveStartDateChange={({ activeStartDate }) => setDataAtiva(activeStartDate)}
                    />
                    <div className="agenda-list-wrapper">
                        {compromissos.length > 0 ? (
                            <ul className="agenda-list">
                                {compromissos.map(os => (
                                    <li key={os.id}><strong>OS #{os.id}</strong> - <span>{os.cliente_nome}</span></li>
                                ))}
                            </ul>
                        ) : (
                            <p className="no-compromissos">Nenhum compromisso para o dia.</p>
                        )}
                    </div>
                </div>

                <div className="content-card">
                    <Slideshow />
                    <div className="about-section">
                        <h2>Sobre a Guincho Oliveira</h2>
                        <p>Dedicados a oferecer serviços de guincho e assistência rodoviária 24h com uma frota moderna e profissionais experientes, garantindo um atendimento rápido, seguro e eficiente.</p>
                    </div>
                </div>
            </main>
            
            <NewsTicker dolar={dolar} news={news} />
        </div>
    );
}