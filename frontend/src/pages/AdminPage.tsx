import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { API_BASE_URL } from '@/services/api';
import { UserResponse, CategoryRequest, Category } from '@/types';
import { LocationDisplay } from '@/components/LocationDisplay';
import {
  Box, Typography, Button, Paper, TextField, Select, MenuItem,
  FormControl, InputLabel, Stack, Alert, CircularProgress, Divider, Dialog,
  DialogTitle, DialogContent, DialogActions, Link as MuiLink, IconButton
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { iconMap } from '@/components/Icons';

interface UserWithMongoId extends UserResponse { _id?: string; }
interface CategoryRequestWithMongoId extends CategoryRequest { _id?: string; }

export const AdminCreateBusinessForm: React.FC<{ onUpdate: () => void }> = ({ onUpdate }) => {
  const { token } = useAuth();
  const [owners, setOwners] = useState<UserWithMongoId[]>([]);
  const [selectedOwner, setSelectedOwner] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchOwners = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/users/admin/owners`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) setOwners(await res.json());
      } catch {
        console.error("Failed to fetch owners");
      }
    };
    fetchOwners();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setIsLoading(true);
    if (!selectedOwner) {
      setError("Debes seleccionar un dueño.");
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/businesses/admin/assign-business?owner_id=${selectedOwner}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name, description, address })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "No se pudo crear el negocio.");
      }
      setSuccess(`¡Negocio '${name}' creado y asignado!`);
      setName(''); setDescription(''); setAddress(''); setSelectedOwner('');
      onUpdate();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" fontWeight="600" gutterBottom>Crear y Asignar Negocio</Typography>
      <form onSubmit={handleSubmit}>
        <Stack spacing={2} mt={2}>
          <FormControl fullWidth>
            <InputLabel id="owner-select-label">Asignar a Dueño</InputLabel>
            <Select labelId="owner-select-label" value={selectedOwner} label="Asignar a Dueño" onChange={e => setSelectedOwner(e.target.value)} required>
              {owners.map(owner => <MenuItem key={owner.id || owner._id} value={owner.id || owner._id}>{owner.full_name || owner.email}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Nombre del Negocio" value={name} onChange={e => setName(e.target.value)} required fullWidth />
          <TextField label="Dirección" value={address} onChange={e => setAddress(e.target.value)} required fullWidth />
          <TextField label="Descripción" value={description} multiline rows={3} onChange={e => setDescription(e.target.value)} fullWidth />
          <Button type="submit" variant="contained" disabled={isLoading}>{isLoading ? 'Creando...' : 'Crear Negocio'}</Button>
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mt: 1 }}>{success}</Alert>}
        </Stack>
      </form>
    </Paper>
  );
};

const AdminCreateCategoryForm: React.FC<{ onUpdate: () => void }> = ({ onUpdate }) => {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [iconSuggestions, setIconSuggestions] = useState<string[]>([]);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSuggestIcons = async () => {
    if (!name.trim()) {
      setError("Primero escribe un nombre para la categoría.");
      return;
    }
    setIsSuggesting(true);
    setError('');
    setIconSuggestions([]);
    setSelectedIcon(null);
    try {
      const res = await fetch(`${API_BASE_URL}/categories/suggest-icons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ category_name: name })
      });
      if (!res.ok) throw new Error("No se pudieron generar los iconos.");
      const iconNames = await res.json();
      setIconSuggestions(iconNames);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess(''); setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/categories/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name, icon_name: selectedIcon })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "No se pudo crear la categoría.");
      }
      setSuccess(`¡Categoría '${name}' creada con éxito!`);
      setName('');
      setIconSuggestions([]);
      setSelectedIcon(null);
      onUpdate();
    } catch (err:any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" fontWeight="600" gutterBottom>Crear Nueva Categoría</Typography>
      <form onSubmit={handleSubmit}>
        <Stack spacing={2} mt={2}>
          <TextField label="Nombre de la Categoría" value={name} onChange={e => setName(e.target.value)} required fullWidth />
          
          <Button 
            variant="outlined" 
            startIcon={<AutoAwesomeIcon />} 
            onClick={handleSuggestIcons}
            disabled={isSuggesting || !name.trim()}
          >
            {isSuggesting ? 'Generando iconos...' : 'Sugerir Iconos con IA'}
          </Button>

          {isSuggesting && <Box sx={{display: 'flex', justifyContent: 'center', my: 2}}><CircularProgress /></Box>}
          
          {iconSuggestions.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">Selecciona un icono:</Typography>
              <Stack direction="row" spacing={2} mt={1} sx={{overflowX: 'auto', pb: 1}}>
                {iconSuggestions.map((iconName, index) => {
                  const IconComponent = iconMap[iconName] || iconMap.default;
                  return (
                    <Paper
                      key={index}
                      onClick={() => setSelectedIcon(iconName)}
                      sx={{
                        minWidth: 100,
                        height: 100,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                        cursor: 'pointer',
                        border: selectedIcon === iconName ? '2px solid' : '2px solid transparent',
                        borderColor: 'primary.main',
                        position: 'relative',
                      }}
                    >
                      <IconComponent sx={{ fontSize: 48, color: 'primary.main' }} />
                      {selectedIcon === iconName && (
                        <CheckCircleIcon color="success" sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'white', borderRadius: '50%' }} />
                      )}
                    </Paper>
                  );
                })}
              </Stack>
            </Box>
          )}

          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? 'Creando...' : 'Crear Categoría'}
          </Button>
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mt: 1 }}>{success}</Alert>}
        </Stack>
      </form>
    </Paper>
  );
};

const RequestDetailsModal: React.FC<{ user: UserWithMongoId; onClose: () => void; onApprove: (userId: string) => void; onReject: (userId: string) => void; }> = ({ user, onClose, onApprove, onReject }) => {
  if (!user.owner_request) return null;
  const { business_name, business_description, address, logo_url } = user.owner_request;
  const userId = user.id || user._id;

  return (
    <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle fontWeight="600">Detalles de la Solicitud</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">Solicitante</Typography>
            <Typography>{user.full_name || user.email}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Nombre del Negocio Propuesto</Typography>
            <Typography>{business_name}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Dirección Propuesta</Typography>
            <Typography>{address}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Descripción</Typography>
            <Typography>{business_description}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" display="block" color="text.secondary" mb={1}>Ubicación en el Mapa</Typography>
            <LocationDisplay address={address} />
          </Box>
          {logo_url && (
            <Box>
              <Typography variant="caption" color="text.secondary">Logo/Imagen Propuesta</Typography>
              <img src={logo_url} alt="Logo del negocio" style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px' }} />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cerrar</Button>
        <Button color="error" variant="outlined" onClick={() => userId && onReject(userId)}>Rechazar</Button>
        <Button color="success" variant="contained" onClick={() => userId && onApprove(userId)}>Aprobar</Button>
      </DialogActions>
    </Dialog>
  );
};

const ManageCategories: React.FC<{ onUpdate: () => void }> = ({ onUpdate }) => {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/categories/`);
        if (res.ok) setCategories(await res.json());
      } catch {
        console.error("Failed to fetch categories");
      }
      setIsLoading(false);
    };
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onUpdate]);

  const handleDelete = async (categoryId: string) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar esta categoría?")) return;
    try {
      await fetch(`${API_BASE_URL}/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      onUpdate();
    } catch {
      alert("Error al eliminar la categoría.");
    }
  };
  
  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" fontWeight="600" gutterBottom>Gestionar Categorías</Typography>
      {isLoading ? <CircularProgress /> : (
        <Stack spacing={2} mt={2}>
          {categories.map(cat => {
            const IconComponent = (cat.icon_name && iconMap[cat.icon_name]) || iconMap.default;
            const categoryId = cat.id || (cat as any)._id!;
            return (
              <Paper key={categoryId} variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <IconComponent sx={{ fontSize: 32, color: 'primary.main' }} />
                <Typography sx={{ flexGrow: 1 }}>{cat.name}</Typography>
                <IconButton onClick={() => setEditingCategory(cat)}><EditIcon /></IconButton>
                <IconButton onClick={() => handleDelete(categoryId)}><DeleteIcon color="error" /></IconButton>
              </Paper>
            );
          })}
        </Stack>
      )}
      {editingCategory && (
        <EditCategoryModal 
          category={editingCategory} 
          onClose={() => setEditingCategory(null)} 
          onSaved={() => {
            setEditingCategory(null);
            onUpdate();
          }}
        />
      )}
    </Paper>
  );
};

const EditCategoryModal: React.FC<{ category: Category, onClose: () => void, onSaved: () => void }> = ({ category, onClose, onSaved }) => {
  const { token } = useAuth();
  const [name, setName] = useState(category.name);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(category.icon_name || null);
  const [iconSuggestions, setIconSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSuggestIcons = async () => {
    if (!name.trim()) return;
    setIsSuggesting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/categories/suggest-icons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ category_name: name })
      });
      if (!res.ok) throw new Error("No se pudieron generar los iconos.");
      setIconSuggestions(await res.json());
    } catch (err: any) { setError(err.message); } 
    finally { setIsSuggesting(false); }
  };
  
  const handleSave = async () => {
    setIsLoading(true); setError('');
    try {
      await fetch(`${API_BASE_URL}/categories/${(category as any).id || (category as any)._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name, icon_name: selectedIcon })
      });
      onSaved();
    } catch (err: any) { setError(err.message); } 
    finally { setIsLoading(false); }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Editar Categoría</DialogTitle>
      <DialogContent>
        <Stack spacing={3} mt={1}>
          <TextField label="Nombre de la Categoría" value={name} onChange={e => setName(e.target.value)} fullWidth />
          <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={handleSuggestIcons} disabled={isSuggesting || !name.trim()}>
            {isSuggesting ? 'Generando...' : 'Sugerir nuevos iconos'}
          </Button>
          {isSuggesting && <Box sx={{display: 'flex', justifyContent: 'center'}}><CircularProgress /></Box>}
          {iconSuggestions.length > 0 && (
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)' },
              }}
            >
              {iconSuggestions.map((iconName, index) => {
                const IconComponent = iconMap[iconName] || iconMap.default;
                return (
                  <Paper
                    key={index}
                    onClick={() => setSelectedIcon(iconName)}
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      cursor: 'pointer',
                      border: selectedIcon === iconName ? '2px solid' : '2px solid transparent',
                      borderColor: 'primary.main',
                      position: 'relative'
                    }}
                  >
                    <IconComponent sx={{ fontSize: 40, color: 'primary.main' }} />
                    {selectedIcon === iconName && <CheckCircleIcon color="success" sx={{ position: 'absolute', top: 4, right: 4 }} />}
                  </Paper>
                );
              })}
            </Box>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSave} variant="contained" disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar'}</Button>
      </DialogActions>
    </Dialog>
  );
};

export const AdminPage: React.FC = () => {
  const { token, isAdmin, logout } = useAuth();
  const [ownerRequests, setOwnerRequests] = useState<UserWithMongoId[]>([]);
  const [categoryRequests, setCategoryRequests] = useState<CategoryRequestWithMongoId[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [viewingRequest, setViewingRequest] = useState<UserWithMongoId | null>(null);

  const fetchAdminData = async () => {
    if (!token || !isAdmin) return;
    setIsLoading(true); setError(null);
    try {
      const [ownerReqRes, categoryReqRes] = await Promise.all([
        fetch(`${API_BASE_URL}/users/admin/owner-requests`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/users/admin/category-requests`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      if (ownerReqRes.status === 401 || categoryReqRes.status === 401) { logout(); throw new Error("Tu sesión ha expirado."); }
      if (ownerReqRes.ok) setOwnerRequests(await ownerReqRes.json());
      if (categoryReqRes.ok) setCategoryRequests(await categoryReqRes.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => { if (isAdmin) fetchAdminData(); }, [isAdmin, token, updateTrigger]);
  
  const handleAction = async (action: () => Promise<Response>, successMessage: string) => {
    setError(null); setSuccess(null);
    try {
      const response = await action();
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "La operación falló.");
      }
      setSuccess(successMessage);
      setUpdateTrigger(t => t + 1);
      setViewingRequest(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleApproveOwnerRequest = (userId: string | undefined) => {
    if (!userId) return;
    handleAction(() => fetch(`${API_BASE_URL}/users/admin/approve-owner/${userId}`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }), "¡Solicitud de dueño aprobada con éxito!");
  };
  const handleRejectOwnerRequest = (userId: string | undefined) => {
    if (!userId || !window.confirm("¿Estás seguro de que quieres rechazar esta solicitud?")) return;
    handleAction(() => fetch(`${API_BASE_URL}/users/admin/reject-owner/${userId}`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }), "Solicitud de dueño rechazada.");
  };
  const handleApproveCategoryRequest = (requestId: string | undefined) => {
    if (!requestId || !window.confirm("¿Aprobar y crear esta categoría?")) return;
    handleAction(() => fetch(`${API_BASE_URL}/users/admin/category-requests/${requestId}/approve`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }), "¡Categoría aprobada y creada con éxito!");
  };

  if (isLoading && !ownerRequests.length && !categoryRequests.length) return <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>;
  if (!isAdmin) return <Box sx={{ p: 4 }}><Alert severity="error">Acceso denegado.</Alert></Box>;
  
  return (
    <Box>
      {viewingRequest && ( <RequestDetailsModal user={viewingRequest} onClose={() => setViewingRequest(null)} onApprove={handleApproveOwnerRequest} onReject={handleRejectOwnerRequest} /> )}
      
      <Typography variant="h4" component="h1" fontWeight="600" gutterBottom>Panel de Administración</Typography>
      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ my: 2 }}>{success}</Alert>}

      {/* Layout responsive 2 columnas sin <Grid> */}
      <Box
        sx={{
          my: 2,
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        }}
      >
        <Box>
          <AdminCreateCategoryForm onUpdate={() => setUpdateTrigger(t => t + 1)} />
        </Box>
        <Box>
          <ManageCategories onUpdate={() => setUpdateTrigger(t => t + 1)} />
        </Box>
      </Box>

      <Divider sx={{ my: 4 }} />

      <Box component="section" mb={4}>
        <Typography variant="h5" component="h2" fontWeight="600" gutterBottom>Solicitudes Pendientes para ser Dueño</Typography>
        {ownerRequests.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">No hay solicitudes pendientes.</Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {ownerRequests.map(user => (
              <Paper key={user.id || user._id} sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                  <Typography fontWeight="bold">{user.owner_request?.business_name || "Nombre no disponible"}</Typography>
                  <Typography variant="body2" color="text.secondary">Usuario: {user.full_name || user.email}</Typography>
                </Box>
                <Button variant="outlined" size="small" onClick={() => setViewingRequest(user)}>Ver Detalles</Button>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>

      <Box component="section">
        <Typography variant="h5" component="h2" fontWeight="600" gutterBottom>Solicitudes de Nuevas Categorías</Typography>
        {categoryRequests.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">No hay solicitudes de categorías pendientes.</Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {categoryRequests.map(req => (
              <Paper key={req.id || req._id} sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                  <Typography fontWeight="bold">Categoría Propuesta: "{req.category_name}"</Typography>
                  <Typography variant="body2" color="text.secondary">Motivo: {req.reason}</Typography>
                  {req.evidence_url && <MuiLink href={req.evidence_url} target="_blank" rel="noopener noreferrer">Ver Evidencia</MuiLink>}
                </Box>
                <Button variant="contained" size="small" onClick={() => handleApproveCategoryRequest(req.id || req._id)}>Aprobar</Button>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
};
