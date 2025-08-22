import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    Typography, Box, TextField, Button, Paper, InputAdornment, CircularProgress,
    Card, CardMedia, CardContent, CardActions, IconButton, Tooltip, Stack, Avatar
} from '@mui/material';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';

import { Search as SearchIcon } from '@mui/icons-material';
import MicIcon from '@mui/icons-material/Mic';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { motion, AnimatePresence, Variants } from 'framer-motion';

import CategoryCard from '../components/CategoryCard';
import ListingCard from '../components/ListingCard';
import { Business, Category } from '../types';
import { API_BASE_URL } from '../services/api';
import { ExtendedPage } from '../App';
import { useAuth } from '@/hooks/useAuth';


interface BusinessLocation {
    lat: number;
    lng: number;
    business: Business;
}

const mapContainerStyle = {
  width: '100%',
  height: '500px',
  borderRadius: '16px'
};

const costaRicaCenter = {
  lat: 9.934739,
  lng: -84.087502
};

const containerVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
const itemVariants: Variants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

interface AssistantMessage {
  role: 'user' | 'model';
  content: string;
}

const SearchAssistant: React.FC<{
  onClose: () => void;
  onResults: (businessIds: string[]) => void;
  onNavigate: (businessId: string) => void;
}> = ({ onClose, onResults, onNavigate }) => {
    const { token, user } = useAuth();
    const [history, setHistory] = useState<AssistantMessage[]>([{ role: 'model', content: '¡Pura vida! Soy tu asistente de búsqueda. ¿Qué andas buscando hoy?' }]);
    const [isLoading, setIsLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);
    
    const speak = async (text: string) => {
        if (!token) return;
        try {
            const response = await fetch(`${API_BASE_URL}/voice/text-to-speech`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ text })
            });
            if (!response.ok) throw new Error("No se pudo generar el audio.");
            
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
        } catch (error) { console.error("Error al sintetizar voz:", error); }
    };

    const sendMessage = async (messageText: string) => {
        if (!messageText.trim()) return;

        const newHistory: AssistantMessage[] = [...history, { role: 'user', content: messageText }];
        setHistory(newHistory);
        setIsLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/search/assistant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ history: newHistory }),
            });

            if (!response.ok) throw new Error("El asistente no está disponible.");
            
            const data = await response.json();
            let rawResponse = data.response;

            const navMatch = rawResponse.match(/\[NAVIGATE_TO: "(.*?)"\]/);
            if (navMatch && navMatch[1]) {
                onNavigate(navMatch[1]);
                return;
            }

            const idMatch = rawResponse.match(/\[IDs: (.*?)\]/);
            const ids: string[] = idMatch ? JSON.parse(`[${idMatch[1]}]`) : [];
            const cleanResponse = rawResponse.replace(/\[(IDs|NAVIGATE_TO): .*?\]/, '').trim();

            setHistory(prev => [...prev, { role: 'model', content: cleanResponse }]);
            await speak(cleanResponse);
            onResults(ids);

        } catch (error: any) {
            const errorMessage = { role: 'model', content: 'Diay, algo falló. ¿Intentamos de nuevo?' } as AssistantMessage;
            setHistory(prev => [...prev, errorMessage]);
            await speak(errorMessage.content);
        } finally { setIsLoading(false); }
    };
    
    const toggleRecording = async () => {
        if (isRecording) {
            mediaRecorderRef.current?.stop();
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
                audioChunksRef.current = [];
                mediaRecorderRef.current.ondataavailable = e => audioChunksRef.current.push(e.data);
                mediaRecorderRef.current.onstop = async () => {
                    setIsRecording(false);
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm; codecs=opus' });
                    const formData = new FormData();
                    formData.append('audio_file', audioBlob);
                    try {
                        const res = await fetch(`${API_BASE_URL}/voice/speech-to-text`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` },
                            body: formData,
                        });
                        const data = await res.json();
                        if (data.transcript) await sendMessage(data.transcript);
                    } catch (err) { console.error("Error al transcribir", err); }
                };
                mediaRecorderRef.current.start();
                setIsRecording(true);
            } catch (err) { console.error("Error al acceder al micrófono", err); }
        }
    };

    return (
        <Paper elevation={8} sx={{ position: 'fixed', bottom: 24, right: 24, width: {xs: '90%', sm: 380}, height: {xs: '70%', sm: 550}, zIndex: 1300, borderRadius: 4, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                <SmartToyIcon />
                <Typography fontWeight="bold">Asistente de Búsqueda</Typography>
                <IconButton onClick={onClose} sx={{ ml: 'auto', color: 'white' }}><CloseIcon /></IconButton>
            </Box>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2, bgcolor: 'background.default' }}>
                <Stack spacing={2}>
                    {history.map((msg, index) => (
                        <Box key={index} sx={{ display: 'flex', gap: 1.5, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                             <Avatar sx={{ width: 32, height: 32, mt: 0.5 }}>
                                {msg.role === 'user' ? (user?.full_name || 'U')[0].toUpperCase() : <SmartToyIcon fontSize="small" />}
                            </Avatar>
                            <Paper sx={{ p: 1.5, borderRadius: '16px', bgcolor: msg.role === 'user' ? 'primary.main' : 'background.paper', color: msg.role === 'user' ? 'white' : 'text.primary' }}>
                                <Typography variant="body2">{msg.content}</Typography>
                            </Paper>
                        </Box>
                    ))}
                    {isLoading && <CircularProgress size={24} sx={{ mx: 'auto' }} />}
                    <div ref={messagesEndRef} />
                </Stack>
            </Box>
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                <Tooltip title={isRecording ? "Detener grabación" : "Hablar con el asistente"}>
                    <IconButton onClick={toggleRecording} color={isRecording ? "error" : "primary"} size="large" sx={{ display: 'block', mx: 'auto' }}>
                        <MicIcon fontSize="large" />
                    </IconButton>
                </Tooltip>
            </Box>
        </Paper>
    );
};

export const HomePage: React.FC<{ navigateTo: (page: ExtendedPage, businessId?: string) => void; }> = ({ navigateTo }) => {
    const { token } = useAuth();
    const [allBusinesses, setAllBusinesses] = useState<Business[]>([]);
    const [filteredBusinesses, setFilteredBusinesses] = useState<Business[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [locations, setLocations] = useState<BusinessLocation[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<BusinessLocation | null>(null);
    const [isMapLoading, setIsMapLoading] = useState(true);

    const [mapCenter, setMapCenter] = useState(costaRicaCenter);
    const [mapZoom, setMapZoom] = useState(7.5);
    
    const [assistantOpen, setAssistantOpen] = useState(false);

    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [businessesResponse, categoriesResponse] = await Promise.all([
                    fetch(`${API_BASE_URL}/businesses/`),
                    fetch(`${API_BASE_URL}/categories/`)
                ]);
                if (!businessesResponse.ok) throw new Error('No se pudieron cargar los negocios.');
                if (!categoriesResponse.ok) throw new Error('No se pudieron cargar las categorías.');
                
                const businessesData = await businessesResponse.json();
                const categoriesData = await categoriesResponse.json();

                setAllBusinesses(businessesData);
                setFilteredBusinesses(businessesData);
                setCategories(categoriesData);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (allBusinesses.length > 0 && window.google) {
            setIsMapLoading(true);
            const geocoder = new window.google.maps.Geocoder();
            const geocodePromises = allBusinesses.map(business => 
                new Promise<BusinessLocation | null>((resolve) => {
                    geocoder.geocode({ address: business.address }, (results, status) => {
                        if (status === 'OK' && results?.[0]) {
                            resolve({
                                lat: results[0].geometry.location.lat(),
                                lng: results[0].geometry.location.lng(),
                                business: business
                            });
                        } else {
                            console.warn(`Geocoding fallido para "${business.address}": ${status}`);
                            resolve(null);
                        }
                    });
                })
            );
            
            Promise.all(geocodePromises).then(results => {
                setLocations(results.filter((r): r is BusinessLocation => r !== null));
                setIsMapLoading(false);
            });
        }
    }, [allBusinesses]);

    const handleSelectCategory = (categoryName: string) => {
        const newCategory = selectedCategory === categoryName ? null : categoryName;
        setSelectedCategory(newCategory);
        setSearchQuery(''); 

        if (newCategory) {
            setFilteredBusinesses(allBusinesses.filter(b => b.categories.includes(newCategory)));
        } else {
            setFilteredBusinesses(allBusinesses);
        }
        setMapCenter(costaRicaCenter);
        setMapZoom(7.5);
    };

    const handleSearch = async (query: string) => {
        setSelectedCategory(null);
        if (!query.trim()) {
            setFilteredBusinesses(allBusinesses);
            setMapCenter(costaRicaCenter);
            setMapZoom(7.5);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/businesses/ai-search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query })
            });
            if (!response.ok) throw new Error('La búsqueda inteligente falló.');
            
            const searchResults = await response.json();
            setFilteredBusinesses(searchResults);

            if (searchResults.length > 0) {
                const firstResult = searchResults[0];
                const geocoder = new window.google.maps.Geocoder();
                geocoder.geocode({ address: firstResult.address }, (results, status) => {
                    if (status === 'OK' && results?.[0]) {
                        const location = results[0].geometry.location;
                        const newCenter = { lat: location.lat(), lng: location.lng() };
                        
                        setMapCenter(newCenter);
                        setMapZoom(15); 
                        
                        setSelectedLocation({
                            lat: newCenter.lat,
                            lng: newCenter.lng,
                            business: firstResult
                        });
                    }
                });
            } else {
                setMapCenter(costaRicaCenter);
                setMapZoom(7.5);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSearch(searchQuery);
    };

    const handleAssistantResults = (businessIds: string[]) => {
        if (businessIds.length > 0) {
            const results = allBusinesses.filter(b => businessIds.includes((b.id || (b as any)._id) as string));
            setFilteredBusinesses(results);
            
            const firstResultLocation = locations.find(loc => loc.business.id === businessIds[0] || (loc.business as any)._id === businessIds[0]);
            if (firstResultLocation) {
                setMapCenter({ lat: firstResultLocation.lat, lng: firstResultLocation.lng });
                setMapZoom(15);
                setSelectedLocation(firstResultLocation);
            }
        } else {
            setFilteredBusinesses(allBusinesses);
        }
    };
    
    const handleAssistantNavigate = (businessId: string) => {
        setAssistantOpen(false);
        navigateTo('businessDetails', businessId);
    };
    
    const filteredLocations = useMemo(() => {
        const businessIds = new Set(filteredBusinesses.map(b => (b.id || (b as any)._id)));
        return locations.filter(loc => {
            const businessId = loc.business.id || (loc.business as any)._id;
            return businessId && businessIds.has(businessId);
        });
    }, [filteredBusinesses, locations]);

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {assistantOpen && (
                <SearchAssistant 
                    onClose={() => setAssistantOpen(false)}
                    onResults={handleAssistantResults}
                    onNavigate={handleAssistantNavigate}
                />
            )}

            <Box sx={{ maxWidth: '1280px', mx: 'auto', px: 2 }}>
                <motion.div variants={itemVariants}>
                    <Box sx={{ textAlign: 'center', my: { xs: 4, md: 8 } }}>
                        <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                            Encuentra y reserva
                        </Typography>
                        <Typography variant="h5" color="text.secondary" sx={{ maxWidth: '700px', mx: 'auto' }}>
                            Desde un corte de cabello hasta una cena especial, todo en un solo lugar.
                        </Typography>
                    </Box>
                </motion.div>
                
                <motion.div variants={itemVariants}>
                    <Paper 
                        component="form" 
                        onSubmit={handleFormSubmit}
                        elevation={3} 
                        sx={{ p: 1, display: 'flex', alignItems: 'center', maxWidth: '800px', mx: 'auto', borderRadius: '50px', mb: { xs: 6, md: 10 }, bgcolor: 'background.paper', gap: 1 }}
                    >
                        <TextField 
                            fullWidth 
                            variant="standard" 
                            placeholder="Busca por texto (ej: 'lavar la nave')"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            InputProps={{ 
                                disableUnderline: true, 
                                startAdornment: (
                                    <InputAdornment position="start" sx={{ pl: 2, display: 'flex', alignItems: 'center' }}>
                                        <SearchIcon color="action" />
                                        <Tooltip title="Hablar con el Asistente de Búsqueda">
                                            <IconButton onClick={() => setAssistantOpen(true)} color="primary" sx={{ ml: 1 }}>
                                                <MicIcon />
                                            </IconButton>
                                        </Tooltip>
                                    </InputAdornment>
                                ), 
                            }} 
                        />
                        <Button type="submit" variant="contained" size="large" sx={{ px: 4, py: 1.5 }}>Buscar</Button>
                    </Paper>
                </motion.div>
                
                <motion.div variants={itemVariants}>
                    <Box sx={{ my: 6 }}>
                        <Typography variant="h4" component="h2" sx={{ fontWeight: '600', mb: 3, color: 'text.primary' }}>
                            Explora en el Mapa
                        </Typography>
                        {isMapLoading ? <Box sx={{display: 'flex', justifyContent: 'center', my: 4}}><CircularProgress /></Box> : (
                            <Paper elevation={3} sx={{ borderRadius: 4, overflow: 'hidden' }}>
                                <GoogleMap
                                    mapContainerStyle={mapContainerStyle}
                                    center={mapCenter}
                                    zoom={mapZoom}
                                >
                                    {filteredLocations.map((loc) => (
                                        <Marker 
                                            key={loc.business.id || (loc.business as any)._id} 
                                            position={{ lat: loc.lat, lng: loc.lng }}
                                            onClick={() => setSelectedLocation(loc)}
                                        />
                                    ))}

                                    {selectedLocation && (
                                        <InfoWindow
                                            position={{ lat: selectedLocation.lat, lng: selectedLocation.lng }}
                                            onCloseClick={() => setSelectedLocation(null)}
                                        >
                                            <Card elevation={0} sx={{ maxWidth: 250, border: 'none' }}>
                                                <CardMedia
                                                    component="img"
                                                    height="100"
                                                    image={selectedLocation.business.logo_url || 'https://placehold.co/250x100?text=Negocio'}
                                                    alt={selectedLocation.business.name}
                                                />
                                                <CardContent sx={{ p: 1 }}>
                                                    <Typography gutterBottom variant="h6" component="div" sx={{ mb: 0, fontWeight: 'bold' }}>
                                                        {selectedLocation.business.name}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary" noWrap>
                                                        {selectedLocation.business.address}
                                                    </Typography>
                                                </CardContent>
                                                <CardActions sx={{ p: 1, pt: 0 }}>
                                                    <Button size="small" variant="contained" fullWidth onClick={() => {
                                                        const businessId = selectedLocation.business.id || (selectedLocation.business as any)._id;
                                                        if (businessId) {
                                                            navigateTo('businessDetails', businessId);
                                                        }
                                                    }}>
                                                        Ver Detalles
                                                    </Button>
                                                </CardActions>
                                            </Card>
                                        </InfoWindow>
                                    )}
                                </GoogleMap>
                            </Paper>
                        )}
                    </Box>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <Box sx={{ mb: 8 }}>
                         <Typography variant="h4" component="h2" gutterBottom color="text.primary" sx={{ fontWeight: '600', mb: 3 }}>
                            Explorar por categoría
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', mx: -1.5 }}>
                            {categories.map((cat) => (
                                <Box sx={{ p: 1.5, boxSizing: 'border-box', width: { xs: '50%', sm: '33.33%', md: '25%', lg: '20%' } }} key={cat.id || (cat as any)._id}>
                                    <CategoryCard
                                        category={cat}
                                        isSelected={selectedCategory === cat.name}
                                        onClick={() => handleSelectCategory(cat.name)}
                                    />
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </motion.div>
                
                <motion.div variants={itemVariants}>
                    <Box sx={{ mb: 8 }}>
                        <Typography variant="h4" component="h2" gutterBottom color="text.primary" sx={{ fontWeight: '600', mb: 3 }}>
                            {selectedCategory ? `Resultados para "${selectedCategory}"` : (filteredBusinesses.length < allBusinesses.length ? 'Resultados del Asistente' : 'Negocios Destacados')}
                        </Typography>
                        {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
                        {error && <Typography color="error" textAlign="center">{error}</Typography>}
                        {!isLoading && filteredBusinesses.length === 0 && (
                            <Box sx={{ textAlign: 'center', p: 4 }}>
                                <Typography>No se encontraron negocios.</Typography>
                                <Button variant="outlined" sx={{ mt: 2 }} onClick={() => setFilteredBusinesses(allBusinesses)}>
                                    Mostrar todos
                                </Button>
                            </Box>
                        )}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', mx: -1.5 }}>
                            <AnimatePresence>
                                {filteredBusinesses.map((business) => (
                                    <Box sx={{ p: 1.5, boxSizing: 'border-box', width: { xs: '100%', sm: '50%', md: '33.33%', lg: '25%' } }} key={business.id || (business as any)._id}>
                                        <ListingCard
                                            business={business}
                                            onViewDetails={() => navigateTo('businessDetails', business.id || (business as any)._id)}
                                        />
                                    </Box>
                                ))}
                            </AnimatePresence>
                        </Box>
                    </Box>
                </motion.div>
            </Box>
        </motion.div>
    );
};