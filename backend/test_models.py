import google.generativeai as genai

# Pega esto en test_models.py
# Aquí ponemos la clave DIRECTAMENTE solo para esta prueba
api_key = "AIzaSyCOer_1PZSyzI-nllcJT8j0SOBMGQOnxaQ"

print(f"Probando con la clave: {api_key[:5]}...") # Muestra solo el inicio para verificar

try:
    genai.configure(api_key=api_key)
    print("--- CONEXIÓN EXITOSA ---")
    print("Listando modelos disponibles para 'generateContent':")
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"- {m.name}")
except Exception as e:
    print(f"Error grave: {e}")