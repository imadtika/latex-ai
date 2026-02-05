"""
Latexis - Intelligent Backend Server
By TIKA Imad - ENSA
National School of Applied Sciences

Features:
- Natural language to LaTeX conversion
- Conversation history for context
- PDF compilation (if pdflatex installed)
- Document improvement endpoint
- Multiple document types support
"""
from datetime import datetime
from flask import Flask, request, jsonify, send_file, send_from_directory, Response
from flask_cors import CORS
from groq import Groq
import os
import re
import subprocess
import tempfile
import shutil
import glob
import requests


# ============================================================================
# Flask App Initialization
# ============================================================================

# Get the frontend folder path (one level up from backend)
FRONTEND_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend')

app = Flask(__name__, static_folder=FRONTEND_FOLDER, static_url_path='')
CORS(app)


# ============================================================================
# pdflatex Path Detection (Windows TeX Live support)
# ============================================================================

def find_pdflatex():
    """
    Find pdflatex executable. First checks PATH, then common installation locations.
    Returns the full path to pdflatex or None if not found.
    """
    # First, check if it's in PATH
    pdflatex_path = shutil.which('pdflatex')
    if pdflatex_path:
        return pdflatex_path
    
    # Common installation paths on Windows
    common_paths = [
        # TeX Live (various years)
        r"C:\texlive\*\bin\windows\pdflatex.exe",
        r"C:\texlive\*\bin\win32\pdflatex.exe",
        # MiKTeX
        r"C:\Program Files\MiKTeX*\miktex\bin\x64\pdflatex.exe",
        r"C:\Program Files (x86)\MiKTeX*\miktex\bin\pdflatex.exe",
        r"C:\Users\*\AppData\Local\Programs\MiKTeX*\miktex\bin\x64\pdflatex.exe",
        # Program Files TeX Live
        r"C:\Program Files\texlive\*\bin\windows\pdflatex.exe",
    ]
    
    for pattern in common_paths:
        matches = glob.glob(pattern)
        if matches:
            # Return the most recent version (sorted descending)
            matches.sort(reverse=True)
            return matches[0]
    
    return None

# Cache the pdflatex path at startup
PDFLATEX_PATH = find_pdflatex()
if PDFLATEX_PATH:
    print(f"[INFO] Found pdflatex at: {PDFLATEX_PATH}")
else:
    print("[WARNING] pdflatex not found. PDF compilation will not be available.")

# Default Groq API Key (fallback - limited usage)
DEFAULT_GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

# Rate limiting for default key users (requests per IP per hour)
from collections import defaultdict
import time

rate_limits = defaultdict(list)  # IP -> list of timestamps
MAX_REQUESTS_PER_HOUR = 5  # Limit for users using the default API key
MAX_REQUESTS_CUSTOM_KEY = 100  # Higher limit for users with their own key

# Check if running on localhost (disable rate limiting for local development)
def is_localhost():
    """Check if running in local development mode"""
    return os.environ.get('RAILWAY_ENVIRONMENT') is None and os.environ.get('PORT') is None

def check_rate_limit(ip_address, using_custom_key=False, api_key=None):
    """
    Check if the user has exceeded rate limits.
    Returns (is_allowed, remaining_requests, reset_time_seconds)
    Disabled for localhost development.
    
    Users with custom keys get a separate rate limit bucket.
    """
    # Disable rate limiting for localhost
    if is_localhost():
        return True, 999, 0
    
    # Use different bucket for custom key users (IP + key prefix)
    if using_custom_key and api_key:
        # Use first 10 chars of key as identifier
        key_id = api_key[:10] if len(api_key) >= 10 else api_key
        bucket_key = f"{ip_address}:custom:{key_id}"
        max_requests = MAX_REQUESTS_CUSTOM_KEY
    else:
        bucket_key = f"{ip_address}:default"
        max_requests = MAX_REQUESTS_PER_HOUR
    
    current_time = time.time()
    hour_ago = current_time - 3600
    
    # Clean old timestamps
    rate_limits[bucket_key] = [ts for ts in rate_limits[bucket_key] if ts > hour_ago]
    
    remaining = max_requests - len(rate_limits[bucket_key])
    
    if remaining <= 0:
        # Calculate reset time
        oldest_request = min(rate_limits[bucket_key])
        reset_time = int(oldest_request + 3600 - current_time)
        return False, 0, reset_time
    
    return True, remaining, 0

def record_request(ip_address, using_custom_key=False, api_key=None):
    """Record a request timestamp for rate limiting"""
    if using_custom_key and api_key:
        key_id = api_key[:10] if len(api_key) >= 10 else api_key
        bucket_key = f"{ip_address}:custom:{key_id}"
    else:
        bucket_key = f"{ip_address}:default"
    rate_limits[bucket_key].append(time.time())

def get_groq_client(api_key=None):
    """Get a Groq client with the specified or default API key"""
    key = api_key if api_key else DEFAULT_GROQ_API_KEY
    return Groq(api_key=key)

# Conversation history storage (in production, use Redis or database)
conversations = {}

# ============================================================================
# System Prompt - The Brain of Latexis
# ============================================================================

def get_system_prompt():
    """System prompt for LaTeX generation"""
    return r"""You are Latexis, an expert LaTeX document generator. You ONLY output valid, compilable LaTeX code.

ABSOLUTE RULES:
1. Output ONLY pure LaTeX code - NO explanations, NO markdown, NO text before or after
2. Start with \documentclass and end with \end{document}
3. NEVER use \includegraphics - use TikZ rectangles for image placeholders
4. ESCAPE special characters: \_ for underscore, \& for ampersand, \% for percent, \# for hash
5. Ensure ALL braces {} and environments are properly closed
6. Use ONLY packages that are standard in TeX Live

=== CV/RESUME TEMPLATE ===
Create a clean, modern, single-column CV with this exact structure:

\documentclass[a4paper,11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=0.75in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{xcolor}

% Define subtle color for section lines
\definecolor{headercolor}{RGB}{70,70,70}

% Section formatting - clean underline style
\titleformat{\section}{\large\bfseries\color{headercolor}}{}{0em}{}[\vspace{-0.5em}\rule{\textwidth}{0.5pt}\vspace{-0.5em}]
\titlespacing*{\section}{0pt}{1.5em}{1em}

\pagestyle{empty}
\setlength{\parindent}{0pt}

\begin{document}

% HEADER - Name centered, contact info below
\begin{center}
{\LARGE\textbf{[Your Full Name]}}\\[0.4cm]
[City, Country] \quad $\bullet$ \quad [your.email@example.com] \quad $\bullet$ \quad [+1 234 567 8900]\\[0.1cm]
\href{https://linkedin.com/in/yourprofile}{linkedin.com/in/yourprofile} \quad $\bullet$ \quad \href{https://github.com/yourusername}{github.com/yourusername}
\end{center}

\vspace{0.5cm}

% PROFESSIONAL SUMMARY
\section*{Professional Summary}
A brief 2-3 sentence summary highlighting your key qualifications, years of experience, and what value you bring. Focus on your strongest skills and career objectives.

% WORK EXPERIENCE
\section*{Work Experience}
\textbf{[Job Title]} \hfill [Start Date] -- [End Date]\\
\textit{[Company Name], [Location]}
\begin{itemize}[leftmargin=1.5em, itemsep=2pt, topsep=4pt]
\item Key accomplishment or responsibility with measurable impact
\item Another achievement demonstrating your skills and contributions
\item Additional responsibility showing leadership or technical expertise
\end{itemize}

\vspace{0.3cm}
\textbf{[Previous Job Title]} \hfill [Start Date] -- [End Date]\\
\textit{[Company Name], [Location]}
\begin{itemize}[leftmargin=1.5em, itemsep=2pt, topsep=4pt]
\item Description of responsibilities and achievements
\item Another key contribution to the organization
\end{itemize}

% EDUCATION
\section*{Education}
\textbf{[Degree Name]} \hfill [Graduation Year]\\
\textit{[University Name], [Location]}\\
Relevant coursework, honors, or GPA if applicable

% SKILLS
\section*{Skills}
\textbf{Technical:} [Skill 1], [Skill 2], [Skill 3], [Skill 4], [Skill 5]\\
\textbf{Tools:} [Tool 1], [Tool 2], [Tool 3], [Tool 4]\\
\textbf{Soft Skills:} [Communication], [Leadership], [Problem-solving]

% LANGUAGES
\section*{Languages}
[Language 1] (Native) \quad $\bullet$ \quad [Language 2] (Fluent) \quad $\bullet$ \quad [Language 3] (Intermediate)

\end{document}

KEY CV RULES:
- Single column layout only - NO two-column or sidebar designs
- Use \section*{} for section headers (no numbering)
- Clean horizontal rules under section titles
- Consistent spacing with \vspace and itemize options
- Use \hfill to align dates to the right
- Use \textbf for titles, \textit for company/institution names
- Use $\bullet$ as separator in contact info and languages
- Keep it minimal - no icons, no colors except subtle gray for headers

=== THESIS/PFE COVER TEMPLATE ===
\documentclass[12pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=1in]{geometry}
\usepackage{tikz}
\usepackage{setspace}
\usepackage{graphicx}

\begin{document}
\begin{titlepage}
\centering
\vspace*{1cm}
{\Large\textbf{[University Name]}}\\\vspace{0.3cm}
{\large [Faculty/Department Name]}\\\vspace{1.5cm}
\begin{tikzpicture}
\draw[fill=gray!20, rounded corners] (0,0) rectangle (4,3);
\node at (2,1.5) {University Logo};
\end{tikzpicture}\\\vspace{1.5cm}
{\LARGE\textbf{[Thesis Title]}}\\\vspace{0.5cm}
{\large [Subtitle if any]}\\\vspace{2cm}
{\large Presented by:}\\
{\Large\textbf{[Student Name]}}\\\vspace{1cm}
{\large Supervised by:}\\
{\large [Supervisor Name]}\\\vspace{1.5cm}
{\large Academic Year: [Year]}\\\vspace{0.5cm}
{\large Submitted: [Date]}
\end{titlepage}
\end{document}

=== TECHNICAL REPORT TEMPLATE ===
\documentclass[11pt,a4paper]{report}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=1in]{geometry}
\usepackage{fancyhdr}
\usepackage[hidelinks]{hyperref}
\usepackage{titlesec}
\usepackage{setspace}

\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\leftmark}
\fancyfoot[C]{\thepage}
\renewcommand{\headrulewidth}{0.4pt}

\titleformat{\chapter}[display]{\normalfont\huge\bfseries}{\chaptertitlename\ \thechapter}{20pt}{\Huge}

\begin{document}
\begin{titlepage}
\centering
\vspace*{2cm}
{\Huge\textbf{[Report Title]}}\\\vspace{1cm}
{\Large [Subtitle]}\\\vspace{2cm}
{\large Author: [Your Name]}\\\vspace{0.5cm}
{\large Organization: [Company/University]}\\\vspace{0.5cm}
{\large Date: \today}
\end{titlepage}
\tableofcontents
\newpage
\chapter{Introduction}
[Introduction content here]
\chapter{Methodology}
[Methodology content here]
\chapter{Results}
[Results content here]
\chapter{Conclusion}
[Conclusion content here]
\end{document}

=== BEAMER PRESENTATION TEMPLATE ===
\documentclass{beamer}
\usetheme{Madrid}
\usecolortheme{default}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}

\title{[Presentation Title]}
\subtitle{[Subtitle]}
\author{[Your Name]}
\institute{[Institution]}
\date{\today}

\begin{document}
\begin{frame}
\titlepage
\end{frame}
\begin{frame}{Outline}
\tableofcontents
\end{frame}
\section{Introduction}
\begin{frame}{Introduction}
\begin{itemize}
\item First point
\item Second point
\item Third point
\end{itemize}
\end{frame}
\section{Main Content}
\begin{frame}{Main Content}
Content goes here with bullet points or text.
\end{frame}
\section{Conclusion}
\begin{frame}{Conclusion}
\begin{itemize}
\item Summary point 1
\item Summary point 2
\end{itemize}
\end{frame}
\begin{frame}
\centering
{\Huge Thank You!}\\[1cm]
{\large Questions?}
\end{frame}
\end{document}

=== COVER LETTER TEMPLATE ===
\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=1in]{geometry}
\usepackage{parskip}

\begin{document}
\begin{flushleft}
[Your Name]\\
[Your Address]\\
[City, Country]\\
[Your Email]\\
[Your Phone]
\end{flushleft}
\vspace{1cm}
\today
\vspace{1cm}
\begin{flushleft}
[Recipient Name]\\
[Recipient Title]\\
[Company Name]\\
[Company Address]
\end{flushleft}
\vspace{0.5cm}
Dear [Recipient Name],

[Opening paragraph about the position and your interest.]

[Body paragraph about your qualifications and experience.]

[Closing paragraph with call to action.]

Sincerely,\\[1cm]
[Your Name]
\end{document}

CRITICAL RULES:
- Copy the exact template structure above for each document type
- Fill placeholders like [Your Name] with example content
- NEVER use fontawesome, fontawesome5, or any icon packages
- NEVER use \includegraphics with file paths
- Always escape: \_ \& \% \# in text
- Use $|$ for separator in CV headers (not plain |)
- Ensure all \begin{} have matching \end{}"""


# ============================================================================
# Helper Functions
# ============================================================================

def extract_latex_code(response_text):
    """Extract and clean LaTeX code from AI response"""
    text = response_text.strip()
    
    # Remove markdown code blocks if AI accidentally included them
    patterns = [
        r'```latex\s*([\s\S]*?)\s*```',
        r'```tex\s*([\s\S]*?)\s*```',
        r'```\s*([\s\S]*?)\s*```',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            text = match.group(1).strip()
            break
    
    # Remove any text before \documentclass
    if '\\documentclass' in text:
        start_idx = text.find('\\documentclass')
        text = text[start_idx:]
    
    # Remove any text after \end{document}
    if '\\end{document}' in text:
        end_idx = text.rfind('\\end{document}') + len('\\end{document}')
        text = text[:end_idx]
    
    # Clean up any remaining issues
    text = text.strip()
    
    return text


def generate_filename(prompt):
    """Generate appropriate filename based on prompt content"""
    prompt_lower = prompt.lower()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Document type detection
    type_mappings = [
        (['cv', 'resume', 'curriculum vitae'], 'cv'),
        (['thesis', 'pfe', 'dissertation', 'memoir', 'memoire'], 'thesis'),
        (['letter', 'cover letter', 'motivation', 'lettre'], 'letter'),
        (['report', 'technical', 'internship', 'rapport', 'stage'], 'report'),
        (['presentation', 'slides', 'beamer', 'powerpoint'], 'presentation'),
        (['article', 'paper', 'journal', 'publication'], 'article'),
        (['invoice', 'facture', 'bill', 'devis'], 'invoice'),
        (['certificate', 'certificat', 'diploma'], 'certificate'),
        (['poster', 'affiche'], 'poster'),
    ]
    
    for keywords, doc_type in type_mappings:
        if any(keyword in prompt_lower for keyword in keywords):
            return f"{doc_type}_{timestamp}"
    
    return f"document_{timestamp}"


def detect_language(prompt):
    """Detect if the prompt is in French or English"""
    french_words = ['créer', 'faire', 'pour', 'avec', 'une', 'dans', 'lettre', 'rapport', 'stage']
    prompt_lower = prompt.lower()
    
    french_count = sum(1 for word in french_words if word in prompt_lower)
    
    return 'french' if french_count >= 2 else 'english'


# ============================================================================
# API Endpoints
# ============================================================================

@app.route('/status', methods=['GET'])
def get_status():
    """
    Get API status and rate limit info for the current user
    """
    ip_address = request.remote_addr or 'unknown'
    is_allowed, remaining, reset_time = check_rate_limit(ip_address, using_custom_key=False, api_key=None)
    
    return jsonify({
        'success': True,
        'free_requests_remaining': remaining,
        'max_free_requests_per_hour': MAX_REQUESTS_PER_HOUR,
        'reset_in_seconds': reset_time if not is_allowed else 0,
        'pdflatex_available': PDFLATEX_PATH is not None
    })


@app.route('/validate-key', methods=['POST'])
def validate_api_key():
    """
    Validate a user's Groq API key
    """
    try:
        data = request.get_json()
        api_key = data.get('api_key', '').strip()
        
        if not api_key:
            return jsonify({
                'success': False,
                'valid': False,
                'error': 'No API key provided'
            })
        
        # Test the API key with a minimal request
        test_client = Groq(api_key=api_key)
        test_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=5
        )
        
        return jsonify({
            'success': True,
            'valid': True,
            'message': 'API key is valid!'
        })
        
    except Exception as e:
        error_msg = str(e).lower()
        if 'invalid' in error_msg or 'authentication' in error_msg or 'api key' in error_msg:
            return jsonify({
                'success': True,
                'valid': False,
                'error': 'Invalid API key. Please check and try again.'
            })
        else:
            return jsonify({
                'success': False,
                'valid': False,
                'error': f'Error validating key: {str(e)}'
            })


@app.route('/generate', methods=['POST'])
def generate_latex():
    """
    Main endpoint: Generate LaTeX code from natural language prompt
    
    Request JSON:
    {
        "prompt": "Create a CV for a software developer...",
        "session_id": "optional-session-id"
    }
    
    Response JSON:
    {
        "success": true,
        "latex_code": "\\documentclass...",
        "filename": "cv_20240130_123456"
    }
    """
    try:
        data = request.get_json()
        prompt = data.get('prompt', '').strip()
        session_id = data.get('session_id', 'default')
        user_api_key = data.get('api_key', '').strip()  # User's custom API key
        
        if not prompt:
            return jsonify({
                'success': False, 
                'error': 'No prompt provided. Please describe the document you want to create.'
            })
        
        # Get client IP for rate limiting
        ip_address = request.remote_addr or 'unknown'
        using_custom_key = bool(user_api_key)
        
        # Check rate limits (separate buckets for default vs custom key users)
        is_allowed, remaining, reset_time = check_rate_limit(ip_address, using_custom_key, user_api_key)
        
        if not is_allowed:
            if using_custom_key:
                return jsonify({
                    'success': False,
                    'error': f'Rate limit exceeded for your API key. You have used your {MAX_REQUESTS_CUSTOM_KEY} requests this hour. Please wait {reset_time // 60} minutes.',
                    'rate_limited': True,
                    'reset_in_seconds': reset_time
                })
            else:
                return jsonify({
                    'success': False,
                    'error': f'Rate limit exceeded. You have used your {MAX_REQUESTS_PER_HOUR} free requests this hour. Please add your own Groq API key to continue, or wait {reset_time // 60} minutes.',
                    'rate_limited': True,
                    'reset_in_seconds': reset_time
                })
        
        # Initialize conversation history for this session
        if session_id not in conversations:
            conversations[session_id] = []
        
        # Build messages with conversation history for context
        messages = [{"role": "system", "content": get_system_prompt()}]
        
        # Add conversation history (last 10 messages for context)
        history = conversations[session_id][-10:]
        for msg in history:
            messages.append(msg)
        
        # Add current user prompt
        messages.append({"role": "user", "content": prompt})
        
        # Detect language and add hint if French
        language = detect_language(prompt)
        if language == 'french':
            messages[-1]["content"] += "\n\n[Note: The user is writing in French. Use French babel package and French content where appropriate.]"
        
        # Get Groq client with user's key or default
        client = get_groq_client(user_api_key if using_custom_key else None)
        
        # Generate response using Groq
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.3,  # Lower = more consistent/deterministic
            max_tokens=8000,
            top_p=0.9,
        )
        
        # Record the request for rate limiting
        record_request(ip_address, using_custom_key, user_api_key)
        
        # Extract and clean LaTeX code
        raw_response = response.choices[0].message.content
        latex_code = extract_latex_code(raw_response)
        
        # Validate that we got actual LaTeX code
        if not latex_code.startswith('\\documentclass'):
            return jsonify({
                'success': False,
                'error': 'Failed to generate valid LaTeX code. Please try rephrasing your request.'
            })
        
        # Generate appropriate filename
        filename = generate_filename(prompt)
        
        # Save to conversation history
        conversations[session_id].append({"role": "user", "content": prompt})
        conversations[session_id].append({"role": "assistant", "content": latex_code})
        
        # Keep conversation history manageable (last 20 messages)
        if len(conversations[session_id]) > 20:
            conversations[session_id] = conversations[session_id][-20:]
        
        return jsonify({
            'success': True,
            'latex_code': latex_code,
            'filename': filename
        })
        
    except Exception as e:
        print(f"[ERROR] Generate endpoint: {str(e)}")
        return jsonify({
            'success': False, 
            'error': f'Server error: {str(e)}'
        })


@app.route('/compile', methods=['POST'])
def compile_to_pdf():
    """
    Compile LaTeX code to PDF (requires pdflatex installed)
    
    Request JSON:
    {
        "latex_code": "\\documentclass...",
        "filename": "document"
    }
    
    Response: PDF file download or error JSON
    """
    try:
        data = request.get_json()
        latex_code = data.get('latex_code', '').strip()
        filename = data.get('filename', 'document')
        
        if not latex_code:
            return jsonify({
                'success': False, 
                'error': 'No LaTeX code provided'
            })
        
        # Check if pdflatex is available
        if not PDFLATEX_PATH:
            return jsonify({
                'success': False,
                'error': 'pdflatex is not installed on the server. Please use Overleaf for PDF compilation.'
            })
        
        # Sanitize Unicode characters that pdflatex can't handle
        unicode_replacements = {
            '≠': r'$\neq$',
            '≤': r'$\leq$',
            '≥': r'$\geq$',
            '→': r'$\rightarrow$',
            '←': r'$\leftarrow$',
            '↔': r'$\leftrightarrow$',
            '⇒': r'$\Rightarrow$',
            '⇐': r'$\Leftarrow$',
            '∞': r'$\infty$',
            '∑': r'$\sum$',
            '∏': r'$\prod$',
            '∫': r'$\int$',
            '√': r'$\sqrt{}$',
            '±': r'$\pm$',
            '×': r'$\times$',
            '÷': r'$\div$',
            '°': r'$^\circ$',
            '•': r'\textbullet{}',
            '–': '--',
            '—': '---',
            '"': "``",
            '"': "''",
            ''': "`",
            ''': "'",
            '…': '...',
            '©': r'\textcopyright{}',
            '®': r'\textregistered{}',
            '™': r'\texttrademark{}',
            '€': r'\texteuro{}',
            '£': r'\textsterling{}',
            '¥': r'\textyen{}',
            'α': r'$\alpha$',
            'β': r'$\beta$',
            'γ': r'$\gamma$',
            'δ': r'$\delta$',
            'π': r'$\pi$',
            'σ': r'$\sigma$',
            'μ': r'$\mu$',
            'λ': r'$\lambda$',
            'Ω': r'$\Omega$',
            '∈': r'$\in$',
            '∉': r'$\notin$',
            '⊂': r'$\subset$',
            '⊃': r'$\supset$',
            '∪': r'$\cup$',
            '∩': r'$\cap$',
            '∅': r'$\emptyset$',
            '∀': r'$\forall$',
            '∃': r'$\exists$',
            '¬': r'$\neg$',
            '∧': r'$\land$',
            '∨': r'$\lor$',
            '⊕': r'$\oplus$',
            '⊗': r'$\otimes$',
            '≈': r'$\approx$',
            '≡': r'$\equiv$',
            '∝': r'$\propto$',
            '∂': r'$\partial$',
            '∇': r'$\nabla$',
            '′': r"$'$",
            '″': r"$''$",
        }
        
        for char, replacement in unicode_replacements.items():
            latex_code = latex_code.replace(char, replacement)
        
        # Create temporary directory for compilation
        temp_dir = tempfile.mkdtemp()
        tex_path = os.path.join(temp_dir, f"{filename}.tex")
        pdf_path = os.path.join(temp_dir, f"{filename}.pdf")
        
        try:
            # Write LaTeX code to file
            with open(tex_path, 'w', encoding='utf-8') as f:
                f.write(latex_code)
            
            # Run pdflatex twice (for references, TOC, etc.)
            for i in range(2):
                result = subprocess.run(
                    [
                        PDFLATEX_PATH,
                        '-interaction=nonstopmode',
                        '-halt-on-error',
                        '-output-directory', temp_dir,
                        tex_path
                    ],
                    capture_output=True,
                    text=True,
                    timeout=120,  # 2 minute timeout
                    cwd=temp_dir
                )
            
            # Check if PDF was created
            if os.path.exists(pdf_path):
                return send_file(
                    pdf_path,
                    mimetype='application/pdf',
                    as_attachment=True,
                    download_name=f"{filename}.pdf"
                )
            else:
                # PDF not created - return error with log
                stdout = result.stdout or ''
                stderr = result.stderr or ''
                error_log = stdout + "\n" + stderr
                
                # Extract relevant error messages
                error_lines = []
                for line in error_log.split('\n'):
                    if any(x in line.lower() for x in ['error', '!', 'undefined', 'missing']):
                        error_lines.append(line)
                
                error_summary = '\n'.join(error_lines[-10:]) if error_lines else 'Unknown compilation error'
                
                return jsonify({
                    'success': False,
                    'error': 'LaTeX compilation failed',
                    'details': error_summary,
                    'log': error_log[-3000:]  # Last 3000 chars of log
                })
                
        finally:
            # Clean up temporary directory
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except:
                pass
            
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False, 
            'error': 'Compilation timed out. The document may be too complex.'
        })
    except Exception as e:
        print(f"[ERROR] Compile endpoint: {str(e)}")
        return jsonify({
            'success': False, 
            'error': f'Compilation error: {str(e)}'
        })


@app.route('/improve', methods=['POST'])
def improve_document():
    """
    Improve or modify existing LaTeX document based on instructions
    
    Request JSON:
    {
        "latex_code": "\\documentclass...",
        "instruction": "Add more skills and change colors to blue"
    }
    
    Response JSON:
    {
        "success": true,
        "latex_code": "\\documentclass... (modified)"
    }
    """
    try:
        data = request.get_json()
        latex_code = data.get('latex_code', '').strip()
        instruction = data.get('instruction', '').strip()
        user_api_key = data.get('api_key', '').strip()  # User's custom API key
        
        if not latex_code:
            return jsonify({
                'success': False, 
                'error': 'No LaTeX code provided'
            })
        
        if not instruction:
            return jsonify({
                'success': False, 
                'error': 'No improvement instruction provided'
            })
        
        # Get client IP for rate limiting
        ip_address = request.remote_addr or 'unknown'
        using_custom_key = bool(user_api_key)
        
        # Check rate limits (separate buckets for default vs custom key users)
        is_allowed, remaining, reset_time = check_rate_limit(ip_address, using_custom_key, user_api_key)
        
        if not is_allowed:
            return jsonify({
                'success': False,
                'error': f'Rate limit exceeded. Please add your own Groq API key to continue, or wait {reset_time // 60} minutes.',
                'rate_limited': True,
                'reset_in_seconds': reset_time
            })
        
        # Create prompt for improvement
        prompt = f"""Here is the current LaTeX document:

{latex_code}

---

Please modify this document according to the following instruction:
{instruction}

IMPORTANT: 
- Return the COMPLETE modified LaTeX document
- Start with \\documentclass and end with \\end{{document}}
- Do NOT include any explanations, only the LaTeX code
- Make sure the document still compiles correctly"""

        messages = [
            {"role": "system", "content": get_system_prompt()},
            {"role": "user", "content": prompt}
        ]
        
        # Get Groq client with user's key or default
        client = get_groq_client(user_api_key if using_custom_key else None)
        
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.3,
            max_tokens=8000,
        )
        
        # Record the request for rate limiting (only for default key users)
        if not using_custom_key:
            record_request(ip_address)
        
        improved_code = extract_latex_code(response.choices[0].message.content)
        
        if not improved_code.startswith('\\documentclass'):
            return jsonify({
                'success': False,
                'error': 'Failed to generate improved document. Please try again.'
            })
        
        return jsonify({
            'success': True,
            'latex_code': improved_code
        })
        
    except Exception as e:
        print(f"[ERROR] Improve endpoint: {str(e)}")
        return jsonify({
            'success': False, 
            'error': f'Error improving document: {str(e)}'
        })

@app.route('/preview', methods=['POST'])
def preview_latex_pdf():
    """
    Compile LaTeX code to PDF and stream it for inline preview.
    Uses local pdflatex if available, otherwise uses online LaTeX compiler.
    Request: { latex_code: "...", filename: "..." }
    """
    try:
        data = request.get_json()
        latex_code = data.get('latex_code', '').strip()
        filename = data.get('filename', 'preview')

        if not latex_code:
            return jsonify({'success': False, 'error': 'No LaTeX code provided'}), 400

        # Pre-process: Replace external image references with placeholders
        # This prevents errors from missing image files
        import re as regex_module
        
        # Pattern to match \includegraphics with various options
        img_pattern = r'\\includegraphics(\[[^\]]*\])?\{[^}]+\.(png|jpg|jpeg|pdf|eps|gif)\}'
        
        # Replace with a placeholder rule
        def replace_image(match):
            return r'\fbox{\parbox{4cm}{\centering\vspace{1cm}[Image Placeholder]\vspace{1cm}}}'
        
        latex_code_clean = regex_module.sub(img_pattern, replace_image, latex_code, flags=regex_module.IGNORECASE)
        
        # Sanitize Unicode characters that pdflatex can't handle
        unicode_replacements = {
            '≠': r'$\neq$',
            '≤': r'$\leq$',
            '≥': r'$\geq$',
            '→': r'$\rightarrow$',
            '←': r'$\leftarrow$',
            '↔': r'$\leftrightarrow$',
            '⇒': r'$\Rightarrow$',
            '⇐': r'$\Leftarrow$',
            '∞': r'$\infty$',
            '∑': r'$\sum$',
            '∏': r'$\prod$',
            '∫': r'$\int$',
            '√': r'$\sqrt{}$',
            '±': r'$\pm$',
            '×': r'$\times$',
            '÷': r'$\div$',
            '°': r'$^\circ$',
            '•': r'\textbullet{}',
            '–': '--',
            '—': '---',
            '"': "``",
            '"': "''",
            ''': "`",
            ''': "'",
            '…': '...',
            '©': r'\textcopyright{}',
            '®': r'\textregistered{}',
            '™': r'\texttrademark{}',
            '€': r'\texteuro{}',
            '£': r'\textsterling{}',
            '¥': r'\textyen{}',
            'α': r'$\alpha$',
            'β': r'$\beta$',
            'γ': r'$\gamma$',
            'δ': r'$\delta$',
            'π': r'$\pi$',
            'σ': r'$\sigma$',
            'μ': r'$\mu$',
            'λ': r'$\lambda$',
            'Ω': r'$\Omega$',
            '∈': r'$\in$',
            '∉': r'$\notin$',
            '⊂': r'$\subset$',
            '⊃': r'$\supset$',
            '∪': r'$\cup$',
            '∩': r'$\cap$',
            '∅': r'$\emptyset$',
            '∀': r'$\forall$',
            '∃': r'$\exists$',
            '¬': r'$\neg$',
            '∧': r'$\land$',
            '∨': r'$\lor$',
            '⊕': r'$\oplus$',
            '⊗': r'$\otimes$',
            '≈': r'$\approx$',
            '≡': r'$\equiv$',
            '∝': r'$\propto$',
            '∂': r'$\partial$',
            '∇': r'$\nabla$',
            '′': r"$'$",
            '″': r"$''$",
        }
        
        for char, replacement in unicode_replacements.items():
            latex_code_clean = latex_code_clean.replace(char, replacement)

        # Try local pdflatex first if available
        if PDFLATEX_PATH:
            temp_dir = tempfile.mkdtemp()
            tex_path = os.path.join(temp_dir, f"{filename}.tex")
            pdf_path = os.path.join(temp_dir, f"{filename}.pdf")
            try:
                with open(tex_path, 'w', encoding='utf-8') as f:
                    f.write(latex_code_clean)
                # Run pdflatex twice for correct PDF
                result = None
                for i in range(2):
                    result = subprocess.run(
                        [PDFLATEX_PATH,'-interaction=nonstopmode','-halt-on-error','-output-directory', temp_dir,tex_path],
                        capture_output=True, text=True, timeout=60, cwd=temp_dir
                    )
                if os.path.exists(pdf_path):
                    return send_file(pdf_path, mimetype='application/pdf')
                else:
                    error_msg = 'Failed to compile PDF locally.'
                    if result:
                        stdout = result.stdout or ''
                        stderr = result.stderr or ''
                        log_output = stdout + '\n' + stderr
                        error_lines = []
                        for line in log_output.split('\n'):
                            if any(x in line.lower() for x in ['error', '!', 'undefined', 'missing']):
                                error_lines.append(line.strip())
                        if error_lines:
                            error_msg = '; '.join(error_lines[-5:])
                    return jsonify({'success': False, 'error': error_msg}), 500
            finally:
                try: shutil.rmtree(temp_dir, ignore_errors=True)
                except: pass
        else:
            # Use online LaTeX compiler
            try:
                print("[INFO] Using online LaTeX compiler...")
                
                # Use latexonline.cc API (more reliable)
                import urllib.parse
                import base64
                
                # Method 1: Try latex.ytotech.com first
                try:
                    api_url = "https://latex.ytotech.com/builds/sync"
                    
                    payload = {
                        "compiler": "pdflatex",
                        "resources": [
                            {
                                "main": True,
                                "content": latex_code_clean
                            }
                        ]
                    }
                    
                    response = requests.post(
                        api_url,
                        json=payload,
                        headers={'Content-Type': 'application/json'},
                        timeout=60
                    )
                    
                    if response.status_code == 200:
                        content_type = response.headers.get('Content-Type', '')
                        if 'pdf' in content_type or response.content[:4] == b'%PDF':
                            return Response(
                                response.content,
                                mimetype='application/pdf',
                                headers={'Content-Disposition': f'inline; filename="{filename}.pdf"'}
                            )
                except Exception as e1:
                    print(f"[WARN] latex.ytotech.com failed: {e1}")
                
                # Method 2: Fallback to texlive.net/run API
                try:
                    api_url = "https://texlive.net/cgi-bin/latexcgi"
                    
                    # Prepare the form data
                    form_data = {
                        'filecontents[]': latex_code_clean,
                        'filename[]': 'document.tex',
                        'engine': 'pdflatex',
                        'return': 'pdf'
                    }
                    
                    response = requests.post(
                        api_url,
                        data=form_data,
                        timeout=90
                    )
                    
                    if response.status_code == 200:
                        content_type = response.headers.get('Content-Type', '')
                        if 'pdf' in content_type or response.content[:4] == b'%PDF':
                            return Response(
                                response.content,
                                mimetype='application/pdf',
                                headers={'Content-Disposition': f'inline; filename="{filename}.pdf"'}
                            )
                except Exception as e2:
                    print(f"[WARN] texlive.net failed: {e2}")
                
                # If both fail, return helpful error
                return jsonify({
                    'success': False, 
                    'error': 'Online PDF compilation is temporarily unavailable. Please use "Open in Overleaf" to compile your document.'
                }), 500
                    
            except requests.Timeout:
                return jsonify({'success': False, 'error': 'Online compilation timed out. Try "Open in Overleaf" for complex documents.'}), 500
            except Exception as e:
                return jsonify({'success': False, 'error': f'Preview unavailable. Please use "Open in Overleaf" to view your PDF.'}), 500
                    
            except requests.Timeout:
                return jsonify({'success': False, 'error': 'Online compilation timed out. Try "Open in Overleaf" for complex documents.'}), 500
            except requests.RequestException as e:
                return jsonify({'success': False, 'error': f'Online compiler unavailable. Try "Open in Overleaf".'}), 500
                
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/validate', methods=['POST'])
def validate_latex():
    """
    Validate LaTeX code syntax (basic validation)
    
    Request JSON:
    {
        "latex_code": "\\documentclass..."
    }
    
    Response JSON:
    {
        "success": true,
        "valid": true,
        "issues": []
    }
    """
    try:
        data = request.get_json()
        latex_code = data.get('latex_code', '').strip()
        
        if not latex_code:
            return jsonify({
                'success': False, 
                'error': 'No LaTeX code provided'
            })
        
        issues = []
        
        # Basic validation checks
        if not latex_code.startswith('\\documentclass'):
            issues.append('Document should start with \\documentclass')
        
        if '\\begin{document}' not in latex_code:
            issues.append('Missing \\begin{document}')
        
        if '\\end{document}' not in latex_code:
            issues.append('Missing \\end{document}')
        
        # Check for balanced braces
        open_braces = latex_code.count('{')
        close_braces = latex_code.count('}')
        if open_braces != close_braces:
            issues.append(f'Unbalanced braces: {open_braces} opening, {close_braces} closing')
        
        # Check for common environments
        environments = re.findall(r'\\begin\{(\w+)\}', latex_code)
        for env in environments:
            if f'\\end{{{env}}}' not in latex_code:
                issues.append(f'Missing \\end{{{env}}} for \\begin{{{env}}}')
        
        return jsonify({
            'success': True,
            'valid': len(issues) == 0,
            'issues': issues
        })
        
    except Exception as e:
        return jsonify({
            'success': False, 
            'error': str(e)
        })


@app.route('/clear-history', methods=['POST'])

def clear_history():
    """
    Clear conversation history for a session
    
    Request JSON:
    {
        "session_id": "session-id"
    }
    """
    try:
        data = request.get_json()
        session_id = data.get('session_id', 'default')
        
        if session_id in conversations:
            del conversations[session_id]
            return jsonify({
                'success': True, 
                'message': 'Conversation history cleared'
            })
        else:
            return jsonify({
                'success': True, 
                'message': 'No history found for this session'
            })
            
    except Exception as e:
        return jsonify({
            'success': False, 
            'error': str(e)
        })

# Pour extraction texte DOCX et PDF
try:
    import docx
except ImportError:
    docx = None
try:
    import PyPDF2
except ImportError:
    PyPDF2 = None

@app.route('/upload', methods=['POST'])
def upload_extract_text():
    """
    Upload a PDF, DOC/DOCX, or TXT: extract plain text
    Response: { success, extracted_text? }
    """
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded.'})
        f = request.files['file']
        filename = f.filename
        ext = os.path.splitext(filename)[1].lower()

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            f.save(tmp.name)
            tmp.flush()
            tmp_path = tmp.name

        extracted_text = None

        if ext == '.pdf' and PyPDF2:
            with open(tmp_path, "rb") as pdf_f:
                pdf = PyPDF2.PdfReader(pdf_f)
                text = []
                for page in pdf.pages:
                    content = page.extract_text() or ""
                    text.append(content)
                extracted_text = "\n\n".join(text)
        elif ext in ('.docx', '.doc') and docx:
            d = docx.Document(tmp_path)
            extracted_text = "\n".join([p.text for p in d.paragraphs])
        elif ext == '.txt':
            with open(tmp_path, encoding="utf-8") as txt_f:
                extracted_text = txt_f.read()
        else:
            extracted_text = None

        os.unlink(tmp_path)
        if not extracted_text:
            return jsonify({'success': False, 'error': 'Could not extract text or unsupported format.'})

        extracted_text = extracted_text[:5000]
        return jsonify({'success': True, 'extracted_text': extracted_text})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ============================================================================
# Document Summarization Endpoint
# ============================================================================

@app.route('/summarize', methods=['POST'])
def summarize_document():
    """
    Upload a document and generate a concise summary of key points.
    Request: multipart/form-data with 'file' field and optional 'summary_length' (short/medium/long)
    Response: { success, summary, key_points[], main_topics[] }
    """
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded.'})
        
        f = request.files['file']
        filename = f.filename
        ext = os.path.splitext(filename)[1].lower()
        user_api_key = request.form.get('api_key', '').strip()
        summary_length = request.form.get('summary_length', 'medium').strip().lower()
        
        # Validate summary length
        if summary_length not in ('short', 'medium', 'long'):
            summary_length = 'medium'

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            f.save(tmp.name)
            tmp.flush()
            tmp_path = tmp.name

        extracted_text = None

        if ext == '.pdf' and PyPDF2:
            with open(tmp_path, "rb") as pdf_f:
                pdf = PyPDF2.PdfReader(pdf_f)
                text = []
                for page in pdf.pages:
                    content = page.extract_text() or ""
                    text.append(content)
                extracted_text = "\n\n".join(text)
        elif ext in ('.docx', '.doc') and docx:
            d = docx.Document(tmp_path)
            extracted_text = "\n".join([p.text for p in d.paragraphs])
        elif ext == '.txt':
            with open(tmp_path, encoding="utf-8") as txt_f:
                extracted_text = txt_f.read()

        os.unlink(tmp_path)
        
        if not extracted_text or len(extracted_text.strip()) < 50:
            return jsonify({'success': False, 'error': 'Could not extract enough text from the document.'})

        # Limit text length for API
        extracted_text = extracted_text[:8000]

        # Generate summary using Groq
        client = get_groq_client(user_api_key if user_api_key else None)
        
        # Adjust summary instructions based on length preference
        length_instructions = {
            'short': "A brief 1 paragraph summary (50-80 words) focusing only on the absolute core message.",
            'medium': "A balanced 2-3 paragraph summary (150-250 words) covering the main ideas, objectives, and key conclusions.",
            'long': "A comprehensive 4-5 paragraph summary (400-600 words) providing detailed coverage of all major points, arguments, findings, and conclusions with supporting details."
        }
        
        key_points_count = {
            'short': 3,
            'medium': 5,
            'long': 8
        }
        
        summary_prompt = f"""Analyze this document and provide a {summary_length} summary.

DOCUMENT CONTENT:
---
{extracted_text}
---

Provide your response in the following JSON format ONLY (no other text):
{{
    "summary": "{length_instructions[summary_length]}",
    "key_points": ["List exactly {key_points_count[summary_length]} key points from the document"],
    "main_topics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4"],
    "document_type": "The type of document (e.g., Report, Essay, Article, Manual, Thesis, etc.)",
    "word_count_estimate": approximate_word_count_number
}}

IMPORTANT: The summary length should be {summary_length.upper()} - {length_instructions[summary_length]}

Output ONLY valid JSON, no explanations or markdown."""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a document analysis expert. Always respond with valid JSON only. Pay close attention to the requested summary length."},
                {"role": "user", "content": summary_prompt}
            ],
            temperature=0.3,
            max_tokens=2500
        )

        result_text = response.choices[0].message.content.strip()
        
        # Try to parse JSON response
        try:
            # Clean up potential markdown code blocks
            if result_text.startswith('```'):
                result_text = re.sub(r'^```(?:json)?\n?', '', result_text)
                result_text = re.sub(r'\n?```$', '', result_text)
            
            import json
            result = json.loads(result_text)
            
            return jsonify({
                'success': True,
                'summary': result.get('summary', ''),
                'key_points': result.get('key_points', []),
                'main_topics': result.get('main_topics', []),
                'document_type': result.get('document_type', 'Document'),
                'word_count': result.get('word_count_estimate', len(extracted_text.split())),
                'filename': filename,
                'summary_length': summary_length
            })
        except json.JSONDecodeError:
            # Fallback: return raw summary if JSON parsing fails
            return jsonify({
                'success': True,
                'summary': result_text,
                'key_points': [],
                'main_topics': [],
                'document_type': 'Document',
                'word_count': len(extracted_text.split()),
                'filename': filename,
                'summary_length': summary_length
            })

    except Exception as e:
        print(f"[ERROR] Summarize endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})


# ============================================================================
# Text Highlighting and Key Information Detection Endpoint
# ============================================================================

@app.route('/analyze-highlights', methods=['POST'])
def analyze_highlights():
    """
    Upload a document and detect key information for highlighting.
    Returns sections to highlight with categories and importance levels.
    Request: multipart/form-data with 'file' field
    Response: { success, highlights[], sections[], keywords[] }
    """
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded.'})
        
        f = request.files['file']
        filename = f.filename
        ext = os.path.splitext(filename)[1].lower()
        user_api_key = request.form.get('api_key', '').strip()

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            f.save(tmp.name)
            tmp.flush()
            tmp_path = tmp.name

        extracted_text = None

        if ext == '.pdf' and PyPDF2:
            with open(tmp_path, "rb") as pdf_f:
                pdf = PyPDF2.PdfReader(pdf_f)
                text = []
                for page in pdf.pages:
                    content = page.extract_text() or ""
                    text.append(content)
                extracted_text = "\n\n".join(text)
        elif ext in ('.docx', '.doc') and docx:
            d = docx.Document(tmp_path)
            extracted_text = "\n".join([p.text for p in d.paragraphs])
        elif ext == '.txt':
            with open(tmp_path, encoding="utf-8") as txt_f:
                extracted_text = txt_f.read()

        os.unlink(tmp_path)
        
        if not extracted_text or len(extracted_text.strip()) < 50:
            return jsonify({'success': False, 'error': 'Could not extract enough text from the document.'})

        # Limit text length for API
        extracted_text = extracted_text[:8000]

        # Analyze document for highlights using Groq
        client = get_groq_client(user_api_key if user_api_key else None)
        
        highlight_prompt = f"""Analyze this document and identify key information that should be highlighted.

DOCUMENT CONTENT:
---
{extracted_text}
---

Provide your response in the following JSON format ONLY (no other text):
{{
    "highlights": [
        {{
            "text": "The exact text to highlight (keep it short, max 100 chars)",
            "category": "definition|important|conclusion|statistic|quote|warning|example",
            "importance": "high|medium|low",
            "note": "Brief explanation of why this is important"
        }}
    ],
    "sections": [
        {{
            "title": "Section name or heading",
            "summary": "Brief summary of this section",
            "importance": "high|medium|low"
        }}
    ],
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "document_structure": {{
        "has_introduction": true,
        "has_conclusion": true,
        "main_themes": ["theme1", "theme2"]
    }}
}}

Rules:
- Include 5-15 highlights maximum
- Focus on definitions, key facts, conclusions, and important statements
- Include 3-8 sections if the document has clear structure
- Extract 5-10 important keywords
- Output ONLY valid JSON, no explanations or markdown."""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a document analysis expert specialized in identifying key information. Always respond with valid JSON only."},
                {"role": "user", "content": highlight_prompt}
            ],
            temperature=0.3,
            max_tokens=3000
        )

        result_text = response.choices[0].message.content.strip()
        
        # Try to parse JSON response
        try:
            # Clean up potential markdown code blocks
            if result_text.startswith('```'):
                result_text = re.sub(r'^```(?:json)?\n?', '', result_text)
                result_text = re.sub(r'\n?```$', '', result_text)
            
            import json
            result = json.loads(result_text)
            
            return jsonify({
                'success': True,
                'highlights': result.get('highlights', []),
                'sections': result.get('sections', []),
                'keywords': result.get('keywords', []),
                'document_structure': result.get('document_structure', {}),
                'original_text': extracted_text,
                'filename': filename
            })
        except json.JSONDecodeError:
            return jsonify({
                'success': False,
                'error': 'Failed to analyze document structure. Please try again.'
            })

    except Exception as e:
        print(f"[ERROR] Analyze highlights endpoint: {str(e)}")
        return jsonify({'success': False, 'error': str(e)})


@app.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint - useful for monitoring
    
    Response JSON:
    {
        "status": "healthy",
        "pdflatex_available": true,
        "active_sessions": 5,
        "timestamp": "2024-01-30T12:00:00"
    }
    """
    return jsonify({
        'status': 'healthy',
        'service': 'Latexis Backend',
        'version': '1.0.0',
        'pdflatex_available': PDFLATEX_PATH is not None,
        'pdflatex_path': PDFLATEX_PATH,
        'active_sessions': len(conversations),
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api', methods=['GET'])
def api_info():
    """API information endpoint"""
    return jsonify({
        'name': 'Latexis Backend',
        'version': '1.0.0',
        'author': 'TIKA Imad',
        'description': 'Natural language to LaTeX conversion API',
        'endpoints': {
            '/generate': 'POST - Generate LaTeX from natural language',
            '/compile': 'POST - Compile LaTeX to PDF',
            '/improve': 'POST - Improve existing LaTeX document',
            '/validate': 'POST - Validate LaTeX syntax',
            '/clear-history': 'POST - Clear conversation history',
            '/health': 'GET - Health check'
        }
    })


# ============================================================================
# Error Handlers
# ============================================================================

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500


@app.errorhandler(Exception)
def handle_exception(e):
    print(f"[ERROR] Unhandled exception: {str(e)}")
    return jsonify({
        'success': False,
        'error': 'An unexpected error occurred'
    }), 500


# ============================================================================
# Main Entry Point
# ============================================================================

# Serve frontend index.html at root
@app.route('/')
def serve_frontend():
    return send_from_directory(FRONTEND_FOLDER, 'index.html')

# Serve other static files
@app.route('/<path:path>')
def serve_static(path):
    # Don't intercept API routes
    if path.startswith('api/') or path in ['generate', 'validate-key', 'preview', 'upload', 'summarize', 'analyze-highlights', 'health']:
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(FRONTEND_FOLDER, path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("")
    print("=" * 60)
    print("   Latexis - Intelligent Backend Server")
    print("   By TIKA Imad - ENSA")
    print("=" * 60)
    print("")
    print(f"   🔧 pdflatex available: {PDFLATEX_PATH is not None}")
    if PDFLATEX_PATH:
        print(f"   📍 pdflatex path: {PDFLATEX_PATH}")
    print(f"   🌐 Server starting on: http://localhost:{port}")
    print(f"   📚 API documentation: http://localhost:{port}/")
    print(f"   ❤️  Health check: http://localhost:{port}/health")
    print("")
    print("=" * 60)
    print("   Ready to generate LaTeX documents!")
    print("=" * 60)
    print("")
    
    app.run(
        debug=False,
        host='0.0.0.0',
        port=port,
        threaded=True
    )
