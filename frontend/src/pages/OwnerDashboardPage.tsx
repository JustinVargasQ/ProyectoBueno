import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { API_BASE_URL } from '@/services/api';
import { Business, Category, Schedule, ScheduleDay } from '@/types';
import { LocationPicker } from '@/components/LocationPicker';
import { ExtendedPage } from '@/App';
import { StarIcon } from '@/components/Icons';

import {
  Box, Typography, Button, Paper, TextField, CircularProgress, Alert, Stack, Divider,
  Select, MenuItem, FormControl, InputLabel, IconButton, Chip, Checkbox, FormControlLabel, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText, ListItemAvatar, Avatar,
  Tabs, Tab // <-- Importamos Tabs y Tab
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import EditIcon from '@mui/icons-material/Edit';
import ScheduleIcon from '@mui/icons-material/Schedule';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PublishIcon from '@mui/icons-material/Publish';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import PeopleIcon from '@mui/icons-material/People';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import GroupIcon from '@mui/icons-material/Group';

type AppointmentMode = 'generico' | 'por_empleado';

interface IEmployee {
  id?: string; _id?: string;
  business_id: string; name: string; active: boolean;
  allowed_slots?: Record<string, string[]>;
}
const getId = (o: { id?: string; _id?: string } | null | undefined) =>
  (o?.id as string) || (o?._id as string) || '';
  
interface Booking {
    appointment_id: string;
    user_id: string;
    user_name: string;
    user_email: string;
}

interface DetailedSlot {
    time: string;
    total_capacity: number;
    booked_count: number;
    is_available: boolean;
    bookings: Booking[];
}

const BookingsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  slot: DetailedSlot | null;
}> = ({ open, onClose, slot }) => {
    if (!slot) return null;

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>Reservas para las {slot.time}</DialogTitle>
            <DialogContent dividers>
                {slot.bookings.length > 0 ? (
                    <List>
                        {slot.bookings.map(booking => (
                            <ListItem key={booking.appointment_id}>
                                <ListItemAvatar>
                                    <Avatar>{(booking.user_name || 'U').charAt(0)}</Avatar>
                                </ListItemAvatar>
                                <ListItemText 
                                    primary={booking.user_name}
                                    secondary={booking.user_email}
                                />
                            </ListItem>
                        ))}
                    </List>
                ) : (
                    <Typography>No hay reservas para este horario.</Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cerrar</Button>
            </DialogActions>
        </Dialog>
    );
};

// --- INICIO DE LA RECONSTRUCCIÓN DEL DIÁLOGO DE HORARIO DE EMPLEADOS ---
const EmployeeScheduleDialog: React.FC<{
  open: boolean; onClose: () => void; employee: IEmployee; businessId: string; onSaved: () => void;
}> = ({ open, onClose, employee, businessId, onSaved }) => {
  const { token } = useAuth();
  const [tab, setTab] = useState(0); // 0 para Asignar, 1 para Ver Ocupación

  // Estados para la pestaña "Asignar Horarios"
  const [assignLoading, setAssignLoading] = useState(true);
  const [slotsByDay, setSlotsByDay] = useState<Record<string, string[]>>({});
  const [selectedSlots, setSelectedSlots] = useState<Record<string, Set<string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  
  // Estados para la pestaña "Ver Ocupación"
  const [occupancyLoading, setOccupancyLoading] = useState(false);
  const [detailedSlots, setDetailedSlots] = useState<DetailedSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [viewingSlot, setViewingSlot] = useState<DetailedSlot | null>(null);

  const [error, setError] = useState('');

  const dayNames: Record<string, string> = {
    monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles',
    thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo'
  };

  // Cargar datos para la pestaña de "Asignar Horarios"
  useEffect(() => {
    if (tab === 0 && open) {
      const loadAssignableSlots = async () => {
        setAssignLoading(true);
        setError('');
        try {
          const res = await fetch(`${API_BASE_URL}/businesses/${businessId}`);
          if (!res.ok) throw new Error('No se pudo cargar el horario del negocio');
          const biz: Business = await res.json();

          const generatedSlots: Record<string, string[]> = {};
          const initialSelected: Record<string, Set<string>> = {};
          const days = Object.keys(dayNames) as (keyof Schedule)[];

          days.forEach((d) => {
            const daySchedule = biz.schedule?.[d];
            if (daySchedule?.is_active) {
              const slotsList: string[] = [];
              const [sH, sM] = daySchedule.open_time.split(':').map(Number);
              const [eH, eM] = daySchedule.close_time.split(':').map(Number);
              let current = new Date();
              current.setHours(sH, sM, 0, 0);
              const end = new Date();
              end.setHours(eH, eM, 0, 0);

              while (current < end) {
                slotsList.push(current.toTimeString().slice(0, 5));
                current.setMinutes(current.getMinutes() + daySchedule.slot_duration_minutes);
              }
              generatedSlots[d] = slotsList;
              initialSelected[d] = new Set(employee.allowed_slots?.[d] || []);
            }
          });
          setSlotsByDay(generatedSlots);
          setSelectedSlots(initialSelected);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setAssignLoading(false);
        }
      };
      void loadAssignableSlots();
    }
  }, [open, tab, businessId, employee.allowed_slots]);

  // Cargar datos para la pestaña "Ver Ocupación"
  useEffect(() => {
    if (tab === 1 && open) {
      const loadOccupancy = async () => {
        setOccupancyLoading(true);
        setError('');
        try {
          const res = await fetch(`${API_BASE_URL}/businesses/${businessId}/available-slots?date=${selectedDate}&employee_id=${getId(employee)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) throw new Error('No se pudo cargar la disponibilidad del empleado.');
          setDetailedSlots(await res.json());
        } catch (e: any) {
          setError(e.message);
        } finally {
          setOccupancyLoading(false);
        }
      };
      void loadOccupancy();
    }
  }, [open, tab, businessId, employee, selectedDate, token]);

  const handleToggleSlot = (day: string, time: string) => {
    setSelectedSlots(prev => {
      const newSelected = { ...prev };
      const daySet = new Set(newSelected[day] || []);
      if (daySet.has(time)) {
        daySet.delete(time);
      } else {
        daySet.add(time);
      }
      newSelected[day] = daySet;
      return newSelected;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        allowed_slots: Object.fromEntries(
          Object.entries(selectedSlots).map(([k, set]) => [k, Array.from(set).sort()])
        ),
      };
      const res = await fetch(`${API_BASE_URL}/employees/employees/${getId(employee)}/allowed-slots`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('No se pudo guardar el horario del empleado.');
      onSaved();
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <BookingsModal open={!!viewingSlot} onClose={() => setViewingSlot(null)} slot={viewingSlot} />
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Gestionar Horario de {employee.name}</DialogTitle>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)} centered>
                <Tab label="Asignar Horarios" />
                <Tab label="Ver Ocupación Diaria" />
            </Tabs>
        </Box>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          
          {tab === 0 && ( // Pestaña de Asignar Horarios
            assignLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}><CircularProgress /></Box>
            ) : (
              <Stack spacing={2} divider={<Divider />}>
                {Object.keys(slotsByDay).length === 0 && (
                  <Alert severity="info">El negocio no tiene días activos en su horario general. Actívalos primero para poder asignar turnos a los empleados.</Alert>
                )}
                {Object.entries(slotsByDay).map(([day, times]) => (
                  <Box key={day}>
                    <Typography fontWeight={700} sx={{ mb: 1 }}>{dayNames[day]}</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 1 }}>
                      {times.map((t) => (
                        <Button key={t} variant={selectedSlots[day]?.has(t) ? 'contained' : 'outlined'} onClick={() => handleToggleSlot(day, t)}>
                          {t}
                        </Button>
                      ))}
                    </Box>
                  </Box>
                ))}
              </Stack>
            )
          )}

          {tab === 1 && ( // Pestaña de Ver Ocupación
            <Stack spacing={2}>
              <TextField type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} label="Seleccionar fecha" fullWidth />
              {occupancyLoading ? (
                 <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}><CircularProgress /></Box>
              ) : detailedSlots.length === 0 ? (
                <Alert severity="info">No hay turnos asignados o disponibles para este empleado en la fecha seleccionada.</Alert>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 2 }}>
                  {detailedSlots.map(slot => (
                    <Paper key={slot.time} variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: slot.is_available ? 'background.paper' : '#ffebee' }}>
                      <Typography variant="h6" fontWeight="bold">{slot.time}</Typography>
                      <Chip icon={<GroupIcon />} label={`${slot.booked_count} / ${slot.total_capacity}`} color={slot.is_available ? 'success' : 'error'} size="small" sx={{ my: 1 }}/>
                      <Button size="small" variant="text" onClick={() => setViewingSlot(slot)} disabled={slot.booked_count === 0}>Ver Reservas</Button>
                    </Paper>
                  ))}
                </Box>
              )}
            </Stack>
          )}

        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cerrar</Button>
          {tab === 0 && (
            <Button variant="contained" onClick={handleSave} disabled={isSaving || assignLoading}>Guardar Cambios</Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};
// --- FIN DE LA RECONSTRUCCIÓN DEL DIÁLOGO ---


const EmployeeManager: React.FC<{ businessId: string }> = ({ businessId }) => {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<IEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedFor, setSchedFor] = useState<IEmployee | null>(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/employees/businesses/${businessId}/employees?include_inactive=true`);
      if (!res.ok) throw new Error('No se pudo cargar la lista de empleados.');
      const data: IEmployee[] = await res.json();
      data.sort((a, b) => Number(!!a.active) < Number(!!b.active) ? 1 : -1);
      setEmployees(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const createEmployee = async () => {
    if (!newName.trim()) return;
    setSavingNew(true);
    try {
      const res = await fetch(`${API_BASE_URL}/employees/businesses/${businessId}/employees`, {
        method: 'POST', headers, body: JSON.stringify({ business_id: businessId, name: newName.trim(), active: true })
      });
      if (!res.ok) throw new Error('No se pudo crear el empleado.');
      setNewName(''); void load();
    } catch (e: any) { alert(e.message); } finally { setSavingNew(false); }
  };

  const toggleActive = async (emp: IEmployee) => {
    const id = getId(emp); if (!id) return;
    try {
      await fetch(`${API_BASE_URL}/employees/employees/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ active: !emp.active }) });
      void load();
    } catch {  }
  };

  const remove = async (emp: IEmployee) => {
    const id = getId(emp); if (!id) return;
    if (!confirm(`¿Eliminar al empleado "${emp.name}"?`)) return;
    try {
      await fetch(`${API_BASE_URL}/employees/employees/${id}`, { method: 'DELETE', headers });
      void load();
    } catch {  }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>Empleados</Typography>
        <Chip label="Modo: por empleado" color="info" size="small" variant="outlined" />
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <TextField
          label="Nombre del empleado"
          value={newName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
          fullWidth size="small"
        />
        <Button variant="contained" onClick={createEmployee} disabled={savingNew}>
          {savingNew ? 'Agregando…' : 'Agregar'}
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}><CircularProgress size={24} /></Box>
      ) : (
        <Stack spacing={1}>
          {employees.map((emp) => {
            const id = getId(emp);
            return (
              <Paper key={id || emp.name} sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ flex: 1, minWidth: 180 }} fontWeight={600}>
                  {emp.name} {emp.active ? '' : <Chip label="Inactivo" size="small" sx={{ ml: 1 }} />}
                </Typography>
                <FormControlLabel
                  control={<Switch checked={!!emp.active} onChange={() => toggleActive(emp)} />}
                  label={emp.active ? 'Activo' : 'Inactivo'}
                />
                <Button size="small" variant="outlined" onClick={() => { setSchedFor(emp); setSchedOpen(true); }}>
                  Gestionar Horario
                </Button>
                <IconButton aria-label="Eliminar" onClick={() => remove(emp)} sx={{ color: '#c62828' }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Paper>
            );
          })}
        </Stack>
      )}

      {schedFor && (
        <EmployeeScheduleDialog
          open={schedOpen}
          onClose={() => setSchedOpen(false)}
          employee={schedFor}
          businessId={businessId}
          onSaved={() => void load()}
        />
      )}
    </Paper>
  );
};

const BusinessRegistrationForm: React.FC<{ onSave: () => void; onCancel: () => void; }> = ({ onSave, onCancel }) => {
  const { token } = useAuth();
  const [formData, setFormData] = useState({ name: '', description: '', address: ''});
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLocationSelect = (address: string) => {
    setFormData(prev => ({ ...prev, address }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.address) { alert("Por favor, selecciona una ubicación en el mapa."); return; }
    setError(''); setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/businesses/my-business`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      if (!response.ok) throw new Error((await response.json()).detail || "No se pudo registrar la empresa.");
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Paper sx={{ p: { xs: 2, md: 4 }, maxWidth: '700px', mx: 'auto', my: 4 }}>
      <Typography variant="h5" component="h2" fontWeight="600" gutterBottom>
        Registra un Nuevo Negocio
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Completa los datos de tu nuevo negocio para empezar.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <form onSubmit={handleSubmit}>
        <Stack spacing={3}>
          <TextField label="Nombre del Negocio" value={formData.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, name: e.target.value})} required fullWidth />
          <Box>
            <Typography fontWeight="600" gutterBottom>Dirección del Negocio</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{mb: 1.5}}>Haz clic en el mapa para seleccionar la ubicación.</Typography>
            <LocationPicker onLocationSelect={handleLocationSelect} />
            <TextField label="Dirección Seleccionada" value={formData.address} InputProps={{ readOnly: true }} fullWidth sx={{mt: 2}} />
          </Box>
          <TextField label="Descripción Corta" value={formData.description} multiline rows={4} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, description: e.target.value})} required fullWidth />
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button variant="outlined" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={isLoading}>
              {isLoading ? 'Registrando...' : 'Registrar Negocio'}
            </Button>
          </Stack>
        </Stack>
      </form>
    </Paper>
  );
};

const BusinessEditForm: React.FC<{ business: Business; onSave: () => void; onCancel: () => void; }> = ({ business, onSave, onCancel }) => {
  const { token } = useAuth();
  const [formData, setFormData] = useState<Business & { appointment_mode?: AppointmentMode }>(business as any);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredPhoto, setHoveredPhoto] = useState<string | null>(null);
  const [keywords, setKeywords] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const mode = (formData as any).appointment_mode as AppointmentMode || 'generico';
  const allBusinessPhotos = Array.from(new Set([...(formData.logo_url ? [formData.logo_url] : []), ...formData.photos]));

  const handleSetAsMain = (photoUrl: string) => {
    setFormData(prev => ({ ...prev, logo_url: photoUrl, photos: allBusinessPhotos.filter(p => p !== photoUrl) } as any));
  };

  const handleDeletePhoto = (photoUrl: string) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar esta foto?")) return;
    setFormData(prev => ({
      ...(prev as any),
      logo_url: prev.logo_url === photoUrl ? undefined : prev.logo_url,
      photos: prev.photos.filter(p => p !== photoUrl),
    } as any));
  };

  const handleAddPhoto = () => {
    if (newPhotoUrl && !allBusinessPhotos.includes(newPhotoUrl)) {
      if (!formData.logo_url) {
        setFormData({ ...(formData as any), logo_url: newPhotoUrl });
      } else {
        setFormData({ ...(formData as any), photos: [...formData.photos, newPhotoUrl] });
      }
      setNewPhotoUrl('');
    }
  };

  const handleLocationSelect = (address: string) => setFormData(prev => ({ ...(prev as any), address }));

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/categories/`);
        if (res.ok) setAllCategories(await res.json());
      } catch {  }
    };
    fetchCategories();
  }, []);

  const handleCategoryChange = (categoryName: string) => {
    const current = formData.categories || [];
    const newCategories = current.includes(categoryName)
      ? current.filter(c => c !== categoryName)
      : [...current, categoryName];
    setFormData({ ...(formData as any), categories: newCategories });
  };
  
  const handleGenerateDescription = async () => {
    setIsGenerating(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/businesses/generate-description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          categories: formData.categories || [],
          keywords: keywords,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'No se pudo generar la descripción.');
      }
      setFormData(prev => ({ ...(prev as any), description: data.description }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setIsLoading(true);
    try {
      const businessId = (business.id || (business as any)._id) as string;
      if (!businessId) throw new Error("ID del negocio no encontrado.");
      const updateData = {
        name: formData.name,
        description: formData.description,
        address: formData.address,
        photos: formData.photos,
        categories: formData.categories,
        logo_url: formData.logo_url,
        appointment_mode: mode,
      };
      const response = await fetch(`${API_BASE_URL}/businesses/my-business/${businessId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updateData)
      });
      if (!response.ok) throw new Error((await response.json()).detail || "No se pudieron guardar los cambios.");
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Paper sx={{ p: { xs: 2, md: 4 }, maxWidth: '900px', mx: 'auto', my: 4 }}>
      <Typography variant="h5" component="h2" fontWeight="600" gutterBottom>Editar {business.name}</Typography>
      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
      <form onSubmit={handleSubmit}>
        <Stack spacing={3} mt={3}>
          <TextField label="Nombre de la Empresa" value={formData.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, name: e.target.value} as any)} required fullWidth />
          <Box>
            <Typography fontWeight="600" gutterBottom>Dirección</Typography>
            <LocationPicker onLocationSelect={handleLocationSelect} initialAddress={formData.address} />
            <TextField label="Dirección Seleccionada" value={formData.address} InputProps={{readOnly: true}} fullWidth sx={{mt: 2}} />
          </Box>
          <FormControl fullWidth>
            <InputLabel id="mode-label">Modo de citas</InputLabel>
            <Select
              labelId="mode-label"
              value={mode}
              label="Modo de citas"
              onChange={(e: SelectChangeEvent<AppointmentMode>) => {
                const value = e.target.value as AppointmentMode;
                setFormData(prev => ({ ...(prev as any), appointment_mode: value }));
              }}
            >
              <MenuItem value="generico">Solo citas (sin elegir empleado)</MenuItem>
              <MenuItem value="por_empleado">Citas por empleado (cliente elige empleado)</MenuItem>
            </Select>
          </FormControl>
          
          <TextField label="Descripción" value={formData.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, description: e.target.value} as any)} required multiline rows={4} fullWidth />

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="body2" fontWeight="bold" gutterBottom>
              Asistente de IA
            </Typography>
            <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} alignItems="center">
              <TextField
                label="Palabras clave (opcional)"
                placeholder="Ej: familiar, elegante, moderno"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                fullWidth
                size="small"
                helperText="Ayuda a la IA a entender mejor tu negocio."
              />
              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                onClick={handleGenerateDescription}
                disabled={isGenerating || !formData.name}
                sx={{ flexShrink: 0 }}
              >
                {isGenerating ? 'Generando...' : 'Generar Descripción'}
              </Button>
            </Stack>
          </Paper>

          <Box>
            <Typography fontWeight="600" gutterBottom>Categorías</Typography>
            <Paper variant="outlined" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 2 }}>
              {allCategories.map(cat => (
                <FormControlLabel
                  key={(cat as any).id || (cat as any)._id}
                  control={<Checkbox checked={(formData.categories || []).includes(cat.name)} onChange={() => handleCategoryChange(cat.name)} />}
                  label={cat.name}
                />
              ))}
            </Paper>
          </Box>

          <Box>
            <Typography fontWeight="600" gutterBottom>Fotos del Negocio</Typography>
            <Stack direction="row" spacing={1}>
              <TextField label="Añadir URL de imagen" type="url" placeholder="https://ejemplo.com/foto.jpg" value={newPhotoUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPhotoUrl(e.target.value)} fullWidth size="small" />
              <Button variant="outlined" onClick={handleAddPhoto}>Añadir</Button>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 2, mt: 2 }}>
              {allBusinessPhotos.map((photo) => (
                <Box key={photo} onMouseEnter={() => setHoveredPhoto(photo)} onMouseLeave={() => setHoveredPhoto(null)} sx={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 2, overflow: 'hidden', border: photo === formData.logo_url ? '3px solid' : '1px solid', borderColor: photo === formData.logo_url ? 'primary.main' : 'divider' }}>
                  <img src={photo} alt="Foto del negocio" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {photo === formData.logo_url && <StarIcon sx={{ position: 'absolute', top: 4, left: 4, color: 'yellow', bgcolor: 'rgba(0,0,0,0.4)', borderRadius: '50%', p: '2px' }} />}
                  <Stack direction="row" sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', gap: 0.5, opacity: hoveredPhoto === photo ? 1 : 0, transition: 'opacity 0.2s' }}>
                    {photo !== formData.logo_url && <IconButton title="Poner como principal" sx={{ color: 'white' }} onClick={() => handleSetAsMain(photo)}><StarIcon /></IconButton>}
                    <IconButton title="Eliminar foto" sx={{ color: '#ffb2b2' }} onClick={() => handleDeletePhoto(photo)}><DeleteIcon /></IconButton>
                  </Stack>
                </Box>
              ))}
            </Box>
          </Box>

          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button variant="outlined" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar Cambios'}</Button>
          </Stack>
        </Stack>
      </form>
    </Paper>
  );
};

const ManageScheduleForm: React.FC<{ business: Business; onSave: () => void; onCancel: () => void; }> = ({ business, onSave, onCancel }) => {
  const { token } = useAuth();
  const [schedule, setSchedule] = useState<Schedule>(business.schedule || {
    monday: { is_active: false, open_time: '09:00', close_time: '17:00', slot_duration_minutes: 30, capacity_per_slot: 1 },
    tuesday: { is_active: false, open_time: '09:00', close_time: '17:00', slot_duration_minutes: 30, capacity_per_slot: 1 },
    wednesday: { is_active: false, open_time: '09:00', close_time: '17:00', slot_duration_minutes: 30, capacity_per_slot: 1 },
    thursday: { is_active: false, open_time: '09:00', close_time: '17:00', slot_duration_minutes: 30, capacity_per_slot: 1 },
    friday: { is_active: false, open_time: '09:00', close_time: '17:00', slot_duration_minutes: 30, capacity_per_slot: 1 },
    saturday: { is_active: false, open_time: '09:00', close_time: '17:00', slot_duration_minutes: 30, capacity_per_slot: 1 },
    sunday: { is_active: false, open_time: '09:00', close_time: '17:00', slot_duration_minutes: 30, capacity_per_slot: 1 },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDayChange = (day: keyof Schedule, field: keyof ScheduleDay, value: any) => {
    const numericFields = ['slot_duration_minutes', 'capacity_per_slot'];
    const finalValue = (numericFields as any).includes(field) ? parseInt(value, 10) || 1 : value;
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], [field]: finalValue } }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setError('');
    try {
      const businessId = (business.id || (business as any)._id) as string;
      const res = await fetch(`${API_BASE_URL}/businesses/my-business/${businessId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(schedule)
      });
      if (!res.ok) throw new Error((await res.json()).detail || "No se pudo guardar el horario.");
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const dayNames: { [key in keyof Schedule]: string } = { monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo' };

  return (
    <Paper sx={{ p: { xs: 2, md: 4 }, maxWidth: '900px', mx: 'auto', my: 4 }}>
      <Typography variant="h5" component="h2" fontWeight="600">Gestionar Horario de {business.name}</Typography>
      <Typography color="text.secondary" sx={{ my: 2 }}>Define los días y horas que tu negocio está abierto para recibir citas.</Typography>
      {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
      <form onSubmit={handleSubmit}>
        <Stack spacing={2} divider={<Divider />}>
          <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 2, px: 2 }}>
            <Typography variant="caption" color="text.secondary">Día</Typography>
            <Typography variant="caption" color="text.secondary">Apertura</Typography>
            <Typography variant="caption" color="text.secondary">Cierre</Typography>
            <Typography variant="caption" color="text.secondary">Duración (min)</Typography>
            <Typography variant="caption" color="text.secondary">Cupos</Typography>
          </Box>
          {Object.keys(dayNames).map((day) => {
            const dayKey = day as keyof Schedule;
            const row = schedule[dayKey];
            const isActive = row.is_active;
            return (
              <Box key={day} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '2fr 1fr 1fr 1fr 1fr' }, gap: 2, alignItems: 'center', py: 1 }}>
                <FormControlLabel
                  sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
                  control={<Switch checked={isActive} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleDayChange(dayKey, 'is_active', e.target.checked)} />}
                  label={<Typography fontWeight="bold">{dayNames[dayKey]}</Typography>}
                />
                <TextField label="Apertura" type="time" disabled={!isActive} value={row.open_time} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleDayChange(dayKey, 'open_time', e.target.value)} InputLabelProps={{ shrink: true }} size="small" />
                <TextField label="Cierre" type="time" disabled={!isActive} value={row.close_time} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleDayChange(dayKey, 'close_time', e.target.value)} InputLabelProps={{ shrink: true }} size="small" />
                <TextField label="Duración (min)" type="number" disabled={!isActive} value={row.slot_duration_minutes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleDayChange(dayKey, 'slot_duration_minutes', e.target.value)} size="small" />
                <TextField label="Cupos" type="number" disabled={!isActive} value={row.capacity_per_slot} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleDayChange(dayKey, 'capacity_per_slot', e.target.value)} size="small" />
              </Box>
            )
          })}
        </Stack>
        <Stack direction="row" spacing={2} justifyContent="flex-end" mt={3}>
          <Button variant="outlined" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar Horario'}</Button>
        </Stack>
      </form>
    </Paper>
  );
};

export const OwnerDashboardPage: React.FC<{navigateTo: (page: ExtendedPage, businessId?: string) => void;}> = ({ navigateTo }) => {
  const { token } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<Business | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [managingScheduleFor, setManagingScheduleFor] = useState<Business | null>(null);
  const [managingEmployeesFor, setManagingEmployeesFor] = useState<Business | null>(null);

  const fetchBusinesses = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/businesses/my-businesses`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        setBusinesses(await response.json());
      } else {
        setBusinesses([]);
      }
    } catch {
      setBusinesses([]);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { void fetchBusinesses(); }, [fetchBusinesses]);

  const handleLaunch = async (businessId?: string) => {
    if (!businessId || !window.confirm("¿Publicar este negocio? Revisa los datos antes de publicar.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/businesses/my-business/${businessId}/publish`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json()).detail || "No se pudo publicar.");
      void fetchBusinesses();
    } catch (err: any) { alert(`Error: ${err.message}`); }
  };

  const handleFormClose = () => {
    setIsEditing(null); setIsRegistering(false); setManagingScheduleFor(null); setManagingEmployeesFor(null);
    void fetchBusinesses();
  };

  if (isLoading) return <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>;
  if (isRegistering) return <BusinessRegistrationForm onSave={handleFormClose} onCancel={() => setIsRegistering(false)} />;
  if (isEditing) return <BusinessEditForm business={isEditing} onSave={handleFormClose} onCancel={() => setIsEditing(null)} />;
  if (managingScheduleFor) return <ManageScheduleForm business={managingScheduleFor} onSave={handleFormClose} onCancel={handleFormClose} />;
  if (managingEmployeesFor) return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', my: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Empleados — {(managingEmployeesFor as any).name}</Typography>
        <Button onClick={() => setManagingEmployeesFor(null)}>Volver</Button>
      </Stack>
      <EmployeeManager businessId={(managingEmployeesFor.id || (managingEmployeesFor as any)._id) as string} />
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" component="h1" fontWeight="600">Mis Negocios</Typography>
        <Button variant="contained" startIcon={<AddCircleOutlineIcon />} onClick={() => setIsRegistering(true)}>
          Registrar Nuevo Negocio
        </Button>
      </Box>

      {businesses.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'action.hover' }}>
          <Typography variant="h6" gutterBottom>Aún no tienes negocios registrados.</Typography>
          <Typography color="text.secondary">Cuando un administrador apruebe tu solicitud, tu negocio aparecerá aquí en modo "Borrador".</Typography>
        </Paper>
      ) : (
        <Stack spacing={3}>
          {businesses.map((business) => {
            const businessId = (business.id || (business as any)._id) as string;
            const mode: AppointmentMode = ((business as any).appointment_mode as AppointmentMode) || 'generico';
            return (
              <Paper key={businessId} elevation={2} sx={{ p: 2, borderRadius: 3 }}>
                <Stack direction={{xs: 'column', sm: 'row'}} spacing={2} alignItems="center">
                  <Box
                    component="img"
                    src={business.logo_url || business.photos?.[0] || 'https://placehold.co/100x100?text=Sin+Logo'}
                    alt="Logo"
                    sx={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                  />
                  <Box flexGrow={1}>
                    <Stack direction="row" spacing={1.5} alignItems="center" mb={1} flexWrap="wrap">
                      <Typography variant="h6" fontWeight="bold">{business.name}</Typography>
                      <Chip
                        label={business.status === 'published' ? 'Publicado' : 'Borrador'}
                        color={business.status === 'published' ? 'success' : 'warning'}
                        size="small"
                      />
                      <Chip
                        label={mode === 'por_empleado' ? 'Citas por empleado' : 'Solo citas'}
                        color={mode === 'por_empleado' ? 'info' : 'default'}
                        variant="outlined"
                        size="small"
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">{business.address}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{business.description}</Typography>
                  </Box>
                  <Stack direction={{xs: 'row', sm: 'column'}} spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => setIsEditing(business)}>Editar</Button>
                    <Button size="small" variant="outlined" startIcon={<ScheduleIcon />} onClick={() => setManagingScheduleFor(business)}>Horario</Button>
                    {mode === 'por_empleado' && (
                      <Button size="small" variant="outlined" startIcon={<PeopleIcon />} onClick={() => setManagingEmployeesFor(business)}>
                        Empleados
                      </Button>
                    )}
                    <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => navigateTo('ownerAppointments', businessId)}>Reservas</Button>
                    {business.status === 'draft' && (
                      <Button size="small" variant="contained" startIcon={<PublishIcon />} onClick={() => handleLaunch(businessId)}>
                        Publicar
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Paper>
            )
          })}
        </Stack>
      )}
    </Box>
  );
};