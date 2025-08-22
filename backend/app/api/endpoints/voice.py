from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from google.cloud import speech, texttospeech
from app.core.config import settings
import os
from pathlib import Path

router = APIRouter()

# Las credenciales se configuran en run.py
# No es necesario código de autenticación aquí.

@router.post("/speech-to-text")
async def speech_to_text(audio_file: UploadFile = File(...)):
    """
    Recibe un archivo de audio y lo transcribe usando la API de Google Cloud.
    """
    try:
        client = speech.SpeechClient()
        audio_content = await audio_file.read()
        
        audio = speech.RecognitionAudio(content=audio_content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            sample_rate_hertz=48000,
            language_code="es-ES",
        )
        response = client.recognize(config=config, audio=audio)

        transcript = ""
        if response.results and response.results[0].alternatives:
            transcript = response.results[0].alternatives[0].transcript
        
        return {"transcript": transcript}

    except Exception as e:
        print(f"Error en Speech-to-Text: {e}")
        raise HTTPException(status_code=500, detail=f"Error al procesar el audio: {e}")


@router.post("/text-to-speech")
async def text_to_speech(payload: dict):
    """
    Recibe texto y lo convierte en audio MP3 usando la API de Google Cloud.
    """
    text_to_speak = payload.get("text")
    if not text_to_speak:
        raise HTTPException(status_code=400, detail="No se proporcionó texto para sintetizar.")

    try:
        client = texttospeech.TextToSpeechClient()
        synthesis_input = texttospeech.SynthesisInput(text=text_to_speak)

        voice = texttospeech.VoiceSelectionParams(
            language_code="es-ES", ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )

        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )
        
        # --- ESTA ES LA CORRECCIÓN CLAVE ---
        # Devolvemos el contenido de audio directamente con el tipo de medio correcto,
        # evitando que FastAPI intente convertirlo a JSON.
        return Response(content=response.audio_content, media_type="audio/mpeg")

    except Exception as e:
        print(f"Error en Text-to-Speech: {e}")
        raise HTTPException(status_code=500, detail=f"Error al sintetizar la voz: {e}")