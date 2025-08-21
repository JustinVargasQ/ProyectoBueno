import React, { useState, useRef, useEffect } from 'react';
import { Box, Paper, TextField, IconButton, Typography, CircularProgress, Button, Avatar } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ArticleIcon from '@mui/icons-material/Article';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { useAuth } from '@/hooks/useAuth';
import { API_BASE_URL } from '@/services/api';
import { ExtendedPage } from '@/App';
import { motion, AnimatePresence, Variants } from 'framer-motion';

interface ChatMessage {
  role: 'user' | 'model';
  parts: string[];
  action?: 'BOOKING_SUCCESS';
  pdfUrl?: string;
}

interface ChatbotProps {
  businessId: string;
  businessName: string;
  navigateTo: (page: ExtendedPage) => void;
}

export const Chatbot: React.FC<ChatbotProps> = ({ businessId, businessName, navigateTo }) => {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      parts: [`¡Hola! Soy el asistente de ${businessName}. ¿En qué puedo ayudarte para agendar tu cita?`]
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', parts: [input] };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/chatbot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ business_id: businessId, history: messages, message: input })
      });

      if (!response.ok) throw new Error('El chatbot no está disponible en este momento.');
      
      const data = await response.json();
      const modelMessage: ChatMessage = { role: 'model', parts: [data.response], action: data.action, pdfUrl: data.pdf_url };
      setMessages(prev => [...prev, modelMessage]);

    } catch (error: any) {
      const errorMessage: ChatMessage = { role: 'model', parts: [error.message || 'Lo siento, ocurrió un error.'] };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPdf = async (pdfUrl: string) => {
    if (!token) { alert('Error: No se encontró tu token de autenticación.'); return; }
    try {
      const response = await fetch(`${API_BASE_URL}${pdfUrl}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) throw new Error('No se pudo descargar el PDF del comprobante.');
      const pdfBlob = await response.blob();
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (error: any) {
      console.error('Error al descargar el PDF:', error);
      alert(error.message);
    }
  };

  const messageVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  };

  return (
    <Paper elevation={8} sx={{ position: 'fixed', bottom: 24, right: 24, width: 360, height: 550, borderRadius: 4, display: 'flex', flexDirection: 'column', zIndex: 1300, overflow: 'hidden' }}>
      <Box sx={{ p: 2, bgcolor: 'primary.main', color: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16, display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
        <SmartToyIcon />
        <Typography fontWeight="bold">Asistente de {businessName}</Typography>
      </Box>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2, bgcolor: 'background.default' }}>
        <AnimatePresence>
          {messages.map((msg, index) => (
            <motion.div
              key={index}
              variants={messageVariants}
              initial="hidden"
              animate="visible"
              layout
            >
              <Box sx={{ mb: 2, display: 'flex', gap: 1.5, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                <Avatar 
                  sx={{ width: 32, height: 32, mt: 0.5 }}
                  // --- INICIO DE LA CORRECCIÓN ---
                  // Usamos '|| undefined' para asegurarnos de no pasar 'null' al prop 'src'
                  src={msg.role === 'user' ? (user?.profile_picture_url || undefined) : undefined}
                  // --- FIN DE LA CORRECCIÓN ---
                >
                  {msg.role === 'user' 
                    ? (user?.full_name || 'U')[0].toUpperCase() 
                    : <SmartToyIcon fontSize="small" />
                  }
                </Avatar>
                <Box>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      borderRadius: '16px',
                      bgcolor: msg.role === 'user' ? 'primary.main' : 'background.paper',
                      color: msg.role === 'user' ? 'white' : 'text.primary',
                      borderTopLeftRadius: msg.role === 'model' ? 2 : undefined,
                      borderTopRightRadius: msg.role === 'user' ? 2 : undefined,
                    }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{msg.parts.join('')}</Typography>
                  </Paper>
                  {msg.action === 'BOOKING_SUCCESS' && (
                    <Box sx={{ mt: 1.5, display: 'flex', gap: 1, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      {msg.pdfUrl && (
                        <Button variant="outlined" size="small" startIcon={<ArticleIcon />} onClick={() => handleDownloadPdf(msg.pdfUrl!)}>
                          Ver PDF
                        </Button>
                      )}
                      <Button variant="contained" size="small" startIcon={<EventAvailableIcon />} onClick={() => navigateTo('appointments')}>
                        Ir a Mis Citas
                      </Button>
                    </Box>
                  )}
                </Box>
              </Box>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && <CircularProgress size={24} sx={{ my: 1 }} />}
        <div ref={messagesEndRef} />
      </Box>
      <Box component="form" onSubmit={handleSendMessage} sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0, bgcolor: 'background.paper' }}>
        <TextField
          fullWidth
          variant="outlined"
          size="small"
          placeholder="Escribe tu mensaje..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          autoComplete="off"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '50px', pr: 0.5 } }}
          InputProps={{
            endAdornment: (
              <IconButton type="submit" color="primary" disabled={isLoading || !input.trim()} sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' }}}>
                <SendIcon />
              </IconButton>
            )
          }}
        />
      </Box>
    </Paper>
  );
};