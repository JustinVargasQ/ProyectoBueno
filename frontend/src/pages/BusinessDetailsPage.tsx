import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE_URL } from '@/services/api';
import { Business, Appointment, Employee } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { ExtendedPage } from '@/App';
import { LocationDisplay } from '@/components/LocationDisplay';
import { Chatbot } from '@/components/Chatbot';

// --- ICONOS ---
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import PersonIcon from '@mui/icons-material/Person';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StarIcon from '@mui/icons-material/Star';
import ReviewsIcon from '@mui/icons-material/Reviews';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import StorefrontIcon from '@mui/icons-material/Storefront';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';

// --- COMPONENTES UI ---
import {
  Box, Typography, Button, Paper, CircularProgress, Divider, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, MenuItem, Select,
  FormControl, Stack, Avatar, Rating, Chip,
  Grid, // Usamos Grid (que en tu versión parece ser la nueva Grid2)
  useTheme, useMediaQuery, Fade, Zoom
} from '@mui/material';
import { keyframes } from '@mui/system';
import type { SelectChangeEvent } from '@mui/material/Select';

// --- HELPERS ---
const safeId = (obj: { id?: string; _id?: string } | null | undefined) =>
  (obj?.id as string) || (obj?._id as string) || '';

const bizIdOf = (b?: { id?: string; _id?: string }) =>
  (b?.id as string) || (b?._id as string) || '';

// --- TIPOS ---
type ReviewReply = {
  text: string;
  role: 'owner' | 'admin';
  created_at: string;
};

type Review = {
  id?: string;
  _id?: string;
  business_id: string;
  user_id: string;
  rating: number;
  comment: string;
  created_at: string;
  reply?: ReviewReply;
};

type UserLite = {
  id?: string;
  _id?: string;
  full_name?: string;
  email?: string;
  profile_picture_url?: string;
  role?: 'usuario' | 'dueño' | 'admin';
};

// --- DIÁLOGO DE CONFIRMACIÓN DE CITA ---
const ConfirmationDialog: React.FC<{
  appointment: Appointment;
  onClose: () => void;
  navigateTo: (page: ExtendedPage) => void;
}> = ({ appointment, onClose, navigateTo }) => {
  const { token, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const appointmentId = (appointment as any).id || (appointment as any)._id;

  const handleSendEmail = async () => {
    if (!token || !appointmentId) return;
    setIsLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/appointments/${appointmentId}/send-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email })
      });
      if (!res.ok) throw new Error('No se pudo enviar el correo.');
      const data = await res.json();
      setSuccess(data.message || `Comprobante enviado a ${email}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle fontWeight="bold">¡Reserva Confirmada!</DialogTitle>
      <DialogContent>
        <Typography>Tu cita ha sido agendada con éxito.</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
          Puedes ver y gestionar todas tus citas desde la sección "Mis Citas".
        </Typography>
        <Divider sx={{ my: 2 }} />
        <Typography sx={{ mb: 2 }}>
          Ingresa el correo electrónico al que deseas recibir el comprobante de la cita.
        </Typography>
        <TextField
          autoFocus
          label="Correo Electrónico"
          type="email"
          fullWidth
          variant="outlined"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!!success}
        />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Button onClick={() => navigateTo('appointments')}>Ir a Mis Citas</Button>
        <Box>
          <Button onClick={onClose} disabled={!!success}>Cerrar</Button>
          <Button variant="contained" onClick={handleSendEmail} disabled={isLoading || !!success || !email}>
            {isLoading ? 'Enviando...' : 'Enviar Correo'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

// --- MODAL DE RESERVA (CORREGIDO PARA TU VERSIÓN DE MUI) ---
const BookingModal: React.FC<{
  business: Business;
  onClose: () => void;
  onBookingSuccess: (appointment: Appointment) => void;
}> = ({ business, onClose, onBookingSuccess }) => {
  const { token } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const needEmployee = (business as any).appointment_mode === 'por_empleado';

  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };
  const handleEmployeeChange = (e: SelectChangeEvent<string>) => {
    setEmployeeId(e.target.value as string);
  };

  useEffect(() => {
    const fetchEmployees = async () => {
      if (!needEmployee) return;
      const bizId = bizIdOf(business as any);
      if (!bizId) return;
      try {
        const res = await fetch(`${API_BASE_URL}/employees/businesses/${bizId}/employees`);
        if (!res.ok) throw new Error('No se pudieron cargar los empleados.');
        const data = await res.json();
        setEmployees(data);
      } catch (e: any) {
        setEmployees([]);
      }
    };
    void fetchEmployees();
  }, [needEmployee, business]);

  useEffect(() => {
    const fetchSlots = async () => {
      const bizId = bizIdOf(business as any);
      if (!selectedDate || !bizId) return;
      if (needEmployee && !employeeId) {
        setAvailableSlots([]);
        return;
      }
      setIsLoadingSlots(true);
      setSelectedSlot(null);
      setError('');
      try {
        const query = new URLSearchParams({ date: selectedDate });
        if (needEmployee && employeeId) query.set('employee_id', employeeId);
        const res = await fetch(`${API_BASE_URL}/businesses/${bizId}/available-slots?${query.toString()}`);
        if (!res.ok) throw new Error('No se pudo cargar la disponibilidad.');

        const data = await res.json();
        // Limpiamos los datos para asegurarnos de tener solo strings
        const cleanData = Array.isArray(data) ? data.map((s: any) => typeof s === 'string' ? s : s.time) : [];
        setAvailableSlots(cleanData);

      } catch (err: any) {
        setAvailableSlots([]);
        setError(err.message);
      } finally {
        setIsLoadingSlots(false);
      }
    };
    void fetchSlots();
  }, [selectedDate, business, needEmployee, employeeId]);

  const handleBooking = async () => {
    if (!selectedSlot) { setError('Por favor, selecciona una hora.'); return; }
    if (needEmployee && !employeeId) { setError('Por favor, elige un empleado.'); return; }

    setIsLoading(true); setError('');
    try {
      const bizId = bizIdOf(business as any);
      const appointmentTime = `${selectedDate}T${selectedSlot}:00`;
      const body: any = { business_id: bizId, appointment_time: appointmentTime };
      if (needEmployee) body.employee_id = employeeId;

      const res = await fetch(`${API_BASE_URL}/appointments/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'No se pudo crear la cita.');
      }
      const responseData = await res.json();
      onBookingSuccess(responseData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedEmployeeName = employees.find(e => safeId(e as any) === employeeId) as any;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        elevation: 24,
        sx: { borderRadius: 4, overflow: 'hidden' }
      }}
    >
      <Grid container sx={{ height: isMobile ? 'auto' : '550px' }}>

        {/* COLUMNA IZQUIERDA: RESUMEN VISUAL (CORREGIDO: size={{...}} en lugar de item xs={...}) */}
        <Grid size={{ xs: 12, md: 4 }} sx={{
          bgcolor: 'primary.main',
          color: 'white',
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%)'
        }}>
          <Box>
            <Typography variant="overline" sx={{ opacity: 0.8, letterSpacing: 1 }}>
              RESERVANDO EN
            </Typography>
            <Typography variant="h5" fontWeight={800} sx={{ mb: 2, lineHeight: 1.2 }}>
              {(business as any).name}
            </Typography>
            <Divider sx={{ bgcolor: 'rgba(255,255,255,0.2)', mb: 3 }} />

            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>FECHA SELECCIONADA</Typography>
                <Typography variant="h6" fontWeight={600}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </Typography>
              </Box>

              {needEmployee && (
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>ESPECIALISTA</Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {selectedEmployeeName ? selectedEmployeeName.name : 'Sin seleccionar'}
                  </Typography>
                </Box>
              )}

              {selectedSlot && (
                <Fade in>
                  <Box sx={{ bgcolor: 'white', color: 'primary.main', p: 1.5, borderRadius: 2, textAlign: 'center' }}>
                    <Typography variant="caption" fontWeight="bold" display="block">HORA ELEGIDA</Typography>
                    <Typography variant="h4" fontWeight={800}>{selectedSlot}</Typography>
                  </Box>
                </Fade>
              )}
            </Stack>
          </Box>

          <Box sx={{ mt: 4, textAlign: 'center', opacity: 0.7 }}>
            <EventAvailableIcon sx={{ fontSize: 60 }} />
          </Box>
        </Grid>

        {/* COLUMNA DERECHA: FORMULARIO (CORREGIDO: size={{...}} en lugar de item xs={...}) */}
        <Grid size={{ xs: 12, md: 8 }} sx={{ p: { xs: 2, md: 4 }, overflowY: 'auto' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" fontWeight={700} color="text.primary">
              Configura tu Cita
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

          <Stack spacing={4}>
            {/* Paso 1: Fecha y Empleado */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Box flex={1}>
                <Typography fontWeight={600} gutterBottom>Fecha</Typography>
                <TextField
                  type="date"
                  value={selectedDate}
                  onChange={handleDateChange}
                  fullWidth
                  variant="outlined"
                  sx={{ '& input': { cursor: 'pointer' } }}
                />
              </Box>
              {needEmployee && (
                <Box flex={1}>
                  <Typography fontWeight={600} gutterBottom>Especialista</Typography>
                  <FormControl fullWidth>
                    <Select
                      value={employeeId}
                      onChange={handleEmployeeChange}
                      displayEmpty
                      renderValue={(selected) => {
                        if (!selected) return <Typography color="text.secondary">Selecciona...</Typography>;
                        const emp = employees.find(e => safeId(e as any) === selected);
                        return (emp as any)?.name;
                      }}
                    >
                      {employees.map((emp) => (
                        <MenuItem key={safeId(emp as any)} value={safeId(emp as any)}>
                          {(emp as any).name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              )}
            </Stack>

            {/* Paso 2: Horarios */}
            <Box>
              <Typography fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTimeIcon fontSize="small" color="action" /> Disponibilidad
              </Typography>

              <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f9fafb', borderRadius: 2, minHeight: 150 }}>
                {needEmployee && !employeeId ? (
                  <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" py={3}>
                    <PersonIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                    <Typography color="text.secondary">Selecciona un especialista primero</Typography>
                  </Box>
                ) : isLoadingSlots ? (
                  <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
                ) : availableSlots.length === 0 ? (
                  <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" py={3}>
                    <Typography color="text.secondary">No hay citas disponibles para esta fecha.</Typography>
                  </Box>
                ) : (
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(85px, 1fr))',
                    gap: 1.5
                  }}>
                    {availableSlots.map((slot) => (
                      <Zoom in key={slot}>
                        <Button
                          variant={selectedSlot === slot ? 'contained' : 'outlined'}
                          onClick={() => setSelectedSlot(slot)}
                          sx={{
                            borderRadius: 3,
                            py: 1,
                            border: selectedSlot === slot ? 'none' : '1px solid #e0e0e0',
                            bgcolor: selectedSlot === slot ? 'primary.main' : 'white',
                            color: selectedSlot === slot ? 'white' : 'text.primary',
                            boxShadow: selectedSlot === slot ? 4 : 0,
                            '&:hover': {
                              bgcolor: selectedSlot === slot ? 'primary.dark' : '#f0f0f0',
                              transform: 'translateY(-2px)',
                              boxShadow: 2
                            },
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {slot}
                        </Button>
                      </Zoom>
                    ))}
                  </Box>
                )}
              </Paper>
            </Box>
          </Stack>

          {/* Acciones */}
          <Box sx={{ mt: 5, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button onClick={onClose} color="inherit" sx={{ px: 3 }}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              size="large"
              onClick={handleBooking}
              disabled={isLoading || !selectedSlot || (needEmployee && !employeeId)}
              sx={{
                px: 4,
                borderRadius: 2,
                fontWeight: 'bold',
                boxShadow: '0 4px 14px 0 rgba(0,118,255,0.39)'
              }}
            >
              {isLoading ? 'Confirmando...' : 'CONFIRMAR CITA'}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Dialog>
  );
};

// --- SECCIÓN DE RESEÑAS ---
const glowingAnimation = keyframes`
  0% { box-shadow: 0 0 5px #007BFF, 0 0 10px #007BFF, 0 0 15px #007BFF; }
  50% { box-shadow: 0 0 10px #0056b3, 0 0 20px #0056b3, 0 0 30px #0056b3; }
  100% { box-shadow: 0 0 5px #007BFF, 0 0 10px #007BFF, 0 0 15px #007BFF; }
`;

const ReviewsSection: React.FC<{
  businessId: string;
}> = ({ businessId }) => {
  const { token, user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserLite>>({});
  const [rating, setRating] = useState<number | null>(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [canReview, setCanReview] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  const REVIEWS_LIST_URL = `${API_BASE_URL}/reviews/business/${businessId}`;
  const REVIEWS_CREATE_URL = `${API_BASE_URL}/reviews/`;

  const fetchJSON = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, init);
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { }
    if (!res.ok) {
      const detail = data?.detail ?? data?.message ?? text ?? 'Error';
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      throw new Error(msg);
    }
    return data;
  };

  const checkEligibility = useCallback(async () => {
    if (!token) {
      setCanReview(false);
      return;
    }
    if (user?.role === 'admin' || user?.role === 'dueño') {
      setCanReview(true);
      setAppointmentId(null);
      return;
    }
    try {
      const elig = await fetchJSON(`${API_BASE_URL}/reviews/eligibility/${businessId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCanReview(elig?.eligible || false);
      setAppointmentId(elig?.appointment_id || null);
    } catch {
      setCanReview(false);
      setAppointmentId(null);
    }
  }, [businessId, token, user?.role]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data: Review[] = await fetchJSON(REVIEWS_LIST_URL);
      setReviews(data);

      const uniqUserIds = Array.from(new Set(data.map(d => d.user_id)));
      const entries: Record<string, UserLite> = {};
      await Promise.all(uniqUserIds.map(async (uid) => {
        try {
          const ru = await fetch(`${API_BASE_URL}/users/${uid}`);
          if (ru.ok) {
            const u = await ru.json();
            entries[uid] = u as UserLite;
          }
        } catch { }
      }));
      setUsersMap(entries);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [REVIEWS_LIST_URL]);

  useEffect(() => {
    void load();
    void checkEligibility();
  }, [load, checkEligibility]);

  const avg = useMemo(() => {
    if (!reviews.length) return 0;
    const s = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    return Math.round((s / reviews.length) * 10) / 10;
  }, [reviews]);

  const submit = async () => {
    if (!token) return alert('Inicia sesión para opinar.');
    if (!rating || rating < 1) return alert('Selecciona una puntuación.');
    if (!comment.trim()) return alert('Escribe un comentario.');
    if (user?.role === 'usuario' && !appointmentId) {
      setError('No pudimos validar una cita elegible para este negocio.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await fetchJSON(REVIEWS_CREATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          business_id: businessId,
          appointment_id: appointmentId,
          rating,
          comment: comment.trim(),
        }),
      });
      setRating(5);
      setComment('');
      await load();
      await checkEligibility();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const RoleChip = ({ role }: { role: UserLite['role'] }) => {
    if (role === 'dueño') {
      return <Chip icon={<StorefrontIcon />} label="Dueño" size="small" color="info" variant="outlined" sx={{ ml: 1 }} />;
    }
    if (role === 'admin') {
      return <Chip icon={<VerifiedUserIcon />} label="Admin" size="small" color="success" variant="filled" sx={{ ml: 1 }} />;
    }
    return null;
  };

  return (
    <Paper variant="outlined" sx={{ mt: 4, p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <ReviewsIcon fontSize="small" />
        <Typography variant="h5" fontWeight={700}>Reseñas</Typography>
      </Stack>

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Rating value={avg} precision={0.1} readOnly />
        <Typography fontWeight={700}>{avg.toFixed(1)}</Typography>
        <Typography color="text.secondary">· {reviews.length} reseña{reviews.length !== 1 ? 's' : ''}</Typography>
      </Stack>

      {canReview && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Avatar
                src={user?.profile_picture_url ?? undefined}
                alt={user?.full_name || user?.email || 'Usuario'}
              >
                {(user?.full_name || user?.email || 'U').charAt(0).toUpperCase()}
              </Avatar>
              <Typography fontWeight={600}>{user?.full_name || user?.email || 'Tú'}</Typography>
              <RoleChip role={user?.role} />
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography>Puntuación:</Typography>
              <Rating
                value={rating}
                onChange={(_, v) => setRating(v)}
                icon={<StarIcon fontSize="inherit" />}
              />
            </Stack>
            <TextField
              multiline minRows={3}
              placeholder="Cuéntanos tu experiencia…"
              value={comment}
              onChange={e => setComment(e.target.value)}
              fullWidth
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="contained" onClick={submit} disabled={submitting}>Publicar reseña</Button>
              {error && <Alert severity="warning" sx={{ ml: 1 }}>{error}</Alert>}
            </Stack>
          </Stack>
        </Paper>
      )}

      {!canReview && user && user.role === 'usuario' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Solo puedes opinar si ya tuviste una cita completada con este negocio.
        </Alert>
      )}

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={22} /></Box>
      ) : reviews.length === 0 ? (
        <Typography color="text.secondary">Aún no hay reseñas.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {reviews.map(r => {
            const rid = (r.id || (r as any)._id) as string;
            const u = usersMap[r.user_id];
            const when = new Date(r.created_at);
            return (
              <Paper key={rid} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Stack direction="row" spacing={1.5}>
                  <Avatar
                    src={u?.profile_picture_url ?? undefined}
                    alt={u?.full_name || 'Usuario'}
                  >
                    {(u?.full_name || u?.email || 'U')?.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography fontWeight={700}>{u?.full_name || u?.email || 'Usuario'}</Typography>
                      <RoleChip role={u?.role} />
                      <Rating value={r.rating} readOnly size="small" />
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                        {when.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Typography>
                    </Stack>
                    <Typography sx={{ mt: .5 }}>{r.comment}</Typography>

                    {!!r.reply && (
                      <Paper
                        variant="outlined"
                        sx={{
                          mt: 1, p: 1, borderRadius: 2,
                          ...(r.reply.role === 'admin' && {
                            border: '1px solid',
                            borderColor: 'primary.main',
                            animation: `${glowingAnimation} 3s infinite ease-in-out`,
                            background: `linear-gradient(135deg, rgba(0, 123, 255, 0.1) 0%, rgba(0, 50, 100, 0.1) 100%)`
                          }),
                          ...(r.reply.role === 'owner' && {
                            bgcolor: 'action.hover',
                          })
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1}>
                          {r.reply.role === 'admin' && <VerifiedUserIcon color="primary" fontSize="small" />}
                          {r.reply.role === 'owner' && <StorefrontIcon color="action" fontSize="small" />}
                          <Typography variant="caption" fontWeight={700}>
                            {r.reply.role === 'admin' ? 'Respuesta del Administrador' : 'Respuesta del Propietario'}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ mt: .5, pl: 3.5 }}>
                          {r.reply.text}
                        </Typography>
                      </Paper>
                    )}
                  </Box>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
};

// --- PÁGINA PRINCIPAL: DETALLES DEL NEGOCIO ---
interface BusinessDetailsPageProps {
  businessId: string;
  navigateTo: (page: ExtendedPage) => void;
}

export const BusinessDetailsPage: React.FC<BusinessDetailsPageProps> = ({ businessId, navigateTo }) => {
  const { token } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showChatbot, setShowChatbot] = useState(false);

  const fetchDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const businessRes = await fetch(`${API_BASE_URL}/businesses/${businessId}`);
      if (!businessRes.ok) throw new Error('Negocio no encontrado');
      setBusiness(await businessRes.json());
    } catch (error) {
      console.error('Error al cargar detalles:', error);
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void fetchDetails(); }, [fetchDetails]);

  const handleBookingSuccess = (newAppointment: Appointment) => {
    setShowBookingModal(false);
    setConfirmedAppointment(newAppointment);
  };
  const handleCloseConfirmation = () => setConfirmedAppointment(null);

  const allImages = useMemo(() => {
    if (!business) return [];
    const b: any = business;
    const pics: string[] = Array.isArray(b.photos) ? b.photos : [];
    return Array.from(new Set([...(b.logo_url ? [b.logo_url] : []), ...pics]));
  }, [business]);

  const goToPrevious = () => setCurrentImageIndex(prev => (prev === 0 ? allImages.length - 1 : prev - 1));
  const goToNext = () => setCurrentImageIndex(prev => (prev === allImages.length - 1 ? 0 : prev + 1));

  if (isLoading) return <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>;
  if (!business) return <Box sx={{ textAlign: 'center', p: 4 }}><Typography>Negocio no encontrado.</Typography></Box>;

  const canBook = (business as any).status === 'published' && !!(business as any).schedule;

  return (
    <Box>
      {showBookingModal && (
        <BookingModal
          business={business}
          onClose={() => setShowBookingModal(false)}
          onBookingSuccess={handleBookingSuccess}
        />
      )}

      {confirmedAppointment && (
        <ConfirmationDialog
          appointment={confirmedAppointment}
          onClose={handleCloseConfirmation}
          navigateTo={navigateTo}
        />
      )}

      {/* Botón Flotante del Chatbot */}
      <IconButton
        color="primary"
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          bgcolor: 'primary.main',
          color: 'white',
          width: 64,
          height: 64,
          zIndex: 1200,
          '&:hover': { bgcolor: 'primary.dark', transform: 'scale(1.1)' },
          boxShadow: 6,
          transition: 'transform 0.2s ease-in-out'
        }}
        onClick={() => setShowChatbot(!showChatbot)}
        title="Asistente de Citas IA"
      >
        <AutoAwesomeIcon fontSize="large" />
      </IconButton>

      {showChatbot && token && (
        <Chatbot
          businessId={businessId}
          businessName={(business as any).name}
          navigateTo={navigateTo}
        />
      )}

      <Paper elevation={4} sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '3fr 4fr' },
        gap: { xs: 3, md: 4 },
        p: { xs: 2, md: 4 },
        borderRadius: 4
      }}>
        {/* Carrusel de Imágenes */}
        <Box sx={{ position: 'relative', width: '100%', height: { xs: 300, md: 450 }, borderRadius: 2, overflow: 'hidden' }}>
          {allImages.length > 1 && (
            <>
              <IconButton onClick={goToPrevious} sx={{ position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)', color: 'white', bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}>
                <ArrowBackIosNewIcon />
              </IconButton>
              <IconButton onClick={goToNext} sx={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', color: 'white', bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}>
                <ArrowForwardIosIcon />
              </IconButton>
            </>
          )}
          <img
            src={allImages[currentImageIndex] || 'https://placehold.co/600x400?text=Sin+Imagen'}
            alt={(business as any).name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Box>

        <Box>
          <Typography color="text.secondary" fontWeight="bold" textTransform="uppercase">
            {((business as any).categories || []).join(', ') || 'Sin Categoría'}
          </Typography>
          <Typography variant="h3" component="h1" fontWeight="bold" gutterBottom>
            {(business as any).name}
          </Typography>
          <Typography color="text.secondary" variant="h6" sx={{ mb: 2 }}>
            {(business as any).address}
          </Typography>

          <Button
            variant="contained"
            size="large"
            disabled={!canBook}
            title={!canBook ? 'Este negocio no ha configurado su horario de citas' : 'Reservar una cita'}
            sx={{
              py: 1.5, px: 4,
              borderRadius: 2,
              fontWeight: 'bold',
              fontSize: '1.1rem',
              boxShadow: 4
            }}
            onClick={() => {
              if (!token) {
                alert('Debes iniciar sesión para reservar.');
                navigateTo('login');
              } else {
                setShowBookingModal(true);
              }
            }}
          >
            {canBook ? 'Reservar ahora' : 'Reservas no disponibles'}
          </Button>

          <Divider sx={{ my: 3 }} />

          <Box mb={3}>
            <Typography variant="h5" fontWeight="600" gutterBottom>Descripción</Typography>
            <Typography color="text.secondary">{(business as any).description}</Typography>
          </Box>

          <Box>
            <Typography variant="h5" fontWeight="600" gutterBottom>Ubicación</Typography>
            <LocationDisplay address={(business as any).address} />
          </Box>
        </Box>
      </Paper>

      <ReviewsSection businessId={bizIdOf(business as any)} />
    </Box>
  );
};

export default BusinessDetailsPage;