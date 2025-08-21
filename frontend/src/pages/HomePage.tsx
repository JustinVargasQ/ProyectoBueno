import React, { useState, useEffect, useMemo } from 'react';
import {
    Typography, Box, TextField, Button, Paper, InputAdornment, CircularProgress,
    Card, CardMedia, CardContent, CardActions
} from '@mui/material';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';

import { Search as SearchIcon } from '@mui/icons-material';
import { motion, AnimatePresence, Variants } from 'framer-motion';

import CategoryCard from '../components/CategoryCard';
import ListingCard from '../components/ListingCard';
import { Business, Category } from '../types';
import { API_BASE_URL } from '../services/api';
import { ExtendedPage } from '../App';


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


export const HomePage: React.FC<{ navigateTo: (page: ExtendedPage, businessId?: string) => void; }> = ({ navigateTo }) => {
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

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setSelectedCategory(null);
        if (!searchQuery.trim()) {
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
                body: JSON.stringify({ query: searchQuery })
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
    
    const filteredLocations = useMemo(() => {
        const businessIds = new Set(filteredBusinesses.map(b => (b.id || (b as any)._id)));
        return locations.filter(loc => {
            const businessId = loc.business.id || (loc.business as any)._id;
            return businessId && businessIds.has(businessId);
        });
    }, [filteredBusinesses, locations]);

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible">
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
                        onSubmit={handleSearch}
                        elevation={3} 
                        sx={{ p: 1, display: 'flex', alignItems: 'center', maxWidth: '800px', mx: 'auto', borderRadius: '50px', mb: { xs: 6, md: 10 }, bgcolor: 'background.paper', gap: 1 }}
                    >
                        <TextField 
                            fullWidth 
                            variant="standard" 
                            placeholder="Busca lo que necesitas, por ejemplo: 'corte de pelo para hombre'" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            InputProps={{ 
                                disableUnderline: true, 
                                startAdornment: (<InputAdornment position="start" sx={{ pl: 2 }}><SearchIcon color="action" /></InputAdornment>), 
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
                                            key={loc.business.id} 
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
                            {selectedCategory ? `Resultados para "${selectedCategory}"` : 'Negocios Destacados'}
                        </Typography>
                        {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
                        {error && <Typography color="error" textAlign="center">{error}</Typography>}
                        {!isLoading && filteredBusinesses.length === 0 && (
                            <Box sx={{ textAlign: 'center', p: 4 }}>
                                <Typography>No se encontraron negocios.</Typography>
                                {selectedCategory && (
                                    <Button variant="outlined" sx={{ mt: 2 }} onClick={() => handleSelectCategory(null)}>
                                        Mostrar todos
                                    </Button>
                                )}
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