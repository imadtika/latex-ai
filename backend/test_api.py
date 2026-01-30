import google.generativeai as genai

# Mets ta clé API ici
API_KEY = "AIzaSyBC7m9GFFofaGmQYc1BYIHLQ3tJI0jPiO0"

genai.configure(api_key=API_KEY)

# Test simple
try:
    model = genai.GenerativeModel('gemini-2.0-flash')
    response = model.generate_content("Dis juste: Bonjour")
    print("✅ SUCCESS!")
    print(response.text)
except Exception as e:
    print("❌ ERREUR:")
    print(e)