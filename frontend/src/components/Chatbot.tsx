import React, { useState, useRef, useEffect } from 'react';
import { Box, Paper, TextField, IconButton, Typography, CircularProgress, Button, Avatar, Tooltip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ArticleIcon from '@mui/icons-material/Article';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
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
      parts: [`¡Hola! Soy el asistente de ${businessName}. ¿En qué puedo ayudarte para agendar tu cita? Puedes usar el micrófono para hablar.`]
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const speak = async (text: string) => {
    if (!isTtsEnabled) return;
    setIsLoading(true);
    try {
        const response = await fetch(`${API_BASE_URL}/voice/text-to-speech`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ text })
        });
        if (!response.ok) throw new Error("No se pudo generar el audio de la respuesta.");
        
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
        audio.onended = () => setIsLoading(false);
    } catch (error) {
        console.error("Error al sintetizar la voz:", error);
        setIsLoading(false);
    }
  };

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim()) return;
    setIsLoading(true);

    const userMessage: ChatMessage = { role: 'user', parts: [messageText] };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      const response = await fetch(`${API_BASE_URL}/chatbot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ business_id: businessId, history: messages, message: messageText }),
      });

      if (!response.ok) throw new Error('El chatbot no está disponible en este momento.');
      
      const data = await response.json();
      const modelMessage: ChatMessage = { role: 'model', parts: [data.response], action: data.action, pdfUrl: data.pdf_url };
      setMessages(prev => [...prev, modelMessage]);
      await speak(data.response);
    } catch (error: any) {
      const errorMessageText = error.message || 'Lo siento, ocurrió un error.';
      const errorMessage: ChatMessage = { role: 'model', parts: [errorMessageText] };
      setMessages(prev => [...prev, errorMessage]);
      await speak(errorMessageText);
    }
  };
  
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm; codecs=opus' });
          const formData = new FormData();
          formData.append('audio_file', audioBlob);
          setIsLoading(true); // Muestra feedback mientras se transcribe

          try {
            const response = await fetch(`${API_BASE_URL}/voice/speech-to-text`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });
            const data = await response.json();
            if (data.transcript) {
              await sendMessage(data.transcript);
            } else {
              setIsLoading(false);
              await speak("No pude entender eso. ¿Puedes intentarlo de nuevo?");
            }
          } catch (error) {
            console.error("Error al transcribir:", error);
            setIsLoading(false);
            await speak("Hubo un error al procesar tu voz.");
          }
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error("Error al acceder al micrófono:", error);
        alert("No se pudo acceder al micrófono. Asegúrate de haberle dado permiso en el navegador.");
      }
    }
  };

  const handleDownloadPdf = async (pdfUrl: string) => {
    if (!token) {
      alert('Error: No se encontró tu token de autenticación.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}${pdfUrl}`, { headers: { Authorization: `Bearer ${token}` } });
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
        <Tooltip title={isTtsEnabled ? "Desactivar voz" : "Activar voz"}>
          <IconButton onClick={() => setIsTtsEnabled(!isTtsEnabled)} sx={{ color: 'white', ml: 'auto' }}>
            {isTtsEnabled ? <VolumeUpIcon /> : <VolumeOffIcon />}
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2, bgcolor: 'background.default' }}>
        <AnimatePresence>
          {messages.map((msg, index) => (
            <motion.div key={index} variants={messageVariants} initial="hidden" animate="visible" layout>
              <Box sx={{ mb: 2, display: 'flex', gap: 1.5, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                <Avatar sx={{ width: 32, height: 32, mt: 0.5 }} src={msg.role === 'user' ? (user?.profile_picture_url || undefined) : undefined}>
                  {msg.role === 'user' ? (user?.full_name || 'U')[0].toUpperCase() : <SmartToyIcon fontSize="small" />}
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
                      {msg.pdfUrl && <Button variant="outlined" size="small" startIcon={<ArticleIcon />} onClick={() => handleDownloadPdf(msg.pdfUrl!)}>Ver PDF</Button>}
                      <Button variant="contained" size="small" startIcon={<EventAvailableIcon />} onClick={() => navigateTo('appointments')}>Ir a Mis Citas</Button>
                    </Box>
                  )}
                </Box>
              </Box>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && <CircularProgress size={24} sx={{ my: 1, display: 'block', mx: 'auto' }} />}
        <div ref={messagesEndRef} />
      </Box>
      <Box component="form" onSubmit={handleFormSubmit} sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0, bgcolor: 'background.paper' }}>
        <TextField
          fullWidth
          variant="outlined"
          size="small"
          placeholder={isRecording ? "Grabando... presiona para enviar." : "Escribe o presiona el micrófono"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading || isRecording}
          autoComplete="off"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '50px', pr: 0.5 } }}
          InputProps={{
            startAdornment:(
                <Tooltip title={isRecording ? "Detener grabación" : "Grabar voz"}>
                    <IconButton onClick={toggleRecording} color={isRecording ? "error" : "primary"}>
                        {isRecording ? <MicOffIcon /> : <MicIcon />}
                    </IconButton>
                </Tooltip>
            ),
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