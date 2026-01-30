"""
LaTeX AI - Intelligent Backend Server
By TIKA Imad - ENSA
National School of Applied Sciences

Features:
- Natural language to LaTeX conversion
- Conversation history for context
- PDF compilation (if pdflatex installed)
- Document improvement endpoint
- Multiple document types support
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from groq import Groq
import os
import re
import subprocess
import tempfile
import shutil
from datetime import datetime

# ============================================================================
# Flask App Initialization
# ============================================================================

app = Flask(__name__)
CORS(app)

# Initialize Groq client - Replace with your API key
GROQ_API_KEY = "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"
client = Groq(api_key=GROQ_API_KEY)

# Conversation history storage (in production, use Redis or database)
conversations = {}

# ============================================================================
# System Prompt - The Brain of LaTeX AI
# ============================================================================

def get_system_prompt():
    """Enhanced system prompt for intelligent LaTeX generation"""
    return """You are LaTeX AI, an expert LaTeX document generator created by TIKA Imad at the National School of Applied Sciences. You are highly skilled in creating professional, well-structured, and visually appealing LaTeX documents.

## Your Core Identity:
- You are a specialized AI that ONLY generates LaTeX code
- You understand natural language requests and convert them to professional LaTeX documents
- You have deep knowledge of LaTeX packages, document classes, and best practices

## Document Types You Excel At:
1. **CVs/Resumes** - Modern, professional designs using moderncv, awesome-cv, or custom TikZ
2. **Thesis/PFE Cover Pages** - University-style covers with logos, titles, supervisors
3. **Cover Letters** - Professional letters for job applications
4. **Technical Reports** - Well-structured reports with sections, figures, tables
5. **Beamer Presentations** - Beautiful slides with modern themes
6. **Academic Articles** - IEEE, ACM, or custom article formats
7. **Invoices/Formal Documents** - Clean, professional layouts

## STRICT Rules You MUST Follow:

### Output Format:
1. ALWAYS return ONLY valid, compilable LaTeX code
2. NEVER include any explanations, comments, or text outside the LaTeX code
3. NEVER use markdown code blocks (no ```latex, ```tex, or ```)
4. Start DIRECTLY with \\documentclass{...}
5. End with \\end{document}
6. Ensure the code compiles without errors

### Code Quality:
1. Use appropriate document class for each document type
2. Include ALL necessary packages at the beginning
3. Use UTF-8 encoding: \\usepackage[utf8]{inputenc}
4. For French documents: \\usepackage[french]{babel}
5. Use proper typography: \\usepackage[T1]{fontenc}
6. Ensure all environments and brackets are properly closed
7. Escape special LaTeX characters: #, $, %, &, _, {, }, ~, ^

### Visual Design:
1. Use colors tastefully with xcolor package
2. Add proper spacing and margins with geometry package
3. Use modern fonts when appropriate (helvet, palatino, etc.)
4. Include icons with fontawesome5 for CVs
5. Create visually appealing layouts with TikZ when needed

### Content Handling:
1. If specific information is not provided, use realistic placeholder text
2. For names: use [Your Name], [Company Name], etc.
3. For dates: use realistic date formats
4. For contact info: use placeholder email/phone
5. Always create COMPLETE documents, never partial code

## Package Recommendations by Document Type:

### For CVs:
\\usepackage{moderncv} OR custom with:
\\usepackage{tikz, fontawesome5, xcolor, geometry, hyperref}

### For Thesis Covers:
\\usepackage{tikz, graphicx, geometry, setspace, fontenc}

### For Reports:
\\usepackage{geometry, titlesec, tocloft, fancyhdr, graphicx, hyperref}

### For Presentations:
\\documentclass{beamer}
\\usetheme{Madrid/Berlin/Copenhagen} or custom

### For Letters:
\\documentclass{letter} OR \\usepackage{newlfm}

## Response Examples:

When asked "Create a CV for a software developer", respond with:
\\documentclass[11pt,a4paper]{moderncv}
... (complete LaTeX code)
\\end{document}

When asked "Make changes to add more skills", respond with the COMPLETE modified document, not just the changed parts.

## Remember:
- Quality over quantity
- Clean, readable code structure
- Professional appearance
- Complete, compilable documents
- No explanations, ONLY LaTeX code"""


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
        
        if not prompt:
            return jsonify({
                'success': False, 
                'error': 'No prompt provided. Please describe the document you want to create.'
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
        
        # Generate response using Groq
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.3,  # Lower = more consistent/deterministic
            max_tokens=8000,
            top_p=0.9,
        )
        
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
        if not shutil.which('pdflatex'):
            return jsonify({
                'success': False,
                'error': 'pdflatex is not installed on the server. Please use Overleaf for PDF compilation.'
            })
        
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
                        'pdflatex',
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
                error_log = result.stdout + "\n" + result.stderr
                
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
        
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.3,
            max_tokens=8000,
        )
        
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
    pdflatex_path = shutil.which('pdflatex')
    
    return jsonify({
        'status': 'healthy',
        'service': 'LaTeX AI Backend',
        'version': '1.0.0',
        'pdflatex_available': pdflatex_path is not None,
        'pdflatex_path': pdflatex_path,
        'active_sessions': len(conversations),
        'timestamp': datetime.now().isoformat()
    })


@app.route('/', methods=['GET'])
def index():
    """Root endpoint - API information"""
    return jsonify({
        'name': 'LaTeX AI Backend',
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

if __name__ == '__main__':
    print("")
    print("=" * 60)
    print("   LaTeX AI - Intelligent Backend Server")
    print("   By TIKA Imad - ENSA")
    print("=" * 60)
    print("")
    print(f"   🔧 pdflatex available: {shutil.which('pdflatex') is not None}")
    print(f"   🌐 Server starting on: http://localhost:5000")
    print(f"   📚 API documentation: http://localhost:5000/")
    print(f"   ❤️  Health check: http://localhost:5000/health")
    print("")
    print("=" * 60)
    print("   Ready to generate LaTeX documents!")
    print("=" * 60)
    print("")
    
    app.run(
        debug=True,
        host='0.0.0.0',
        port=5000,
        threaded=True
    )