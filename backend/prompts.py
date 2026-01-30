"""
LaTeX Generator - Prompts Module
Developed by Imad Tika
National School of Applied Sciences
"""

SYSTEM_PROMPT = """You are a world-class LaTeX expert. You generate ONLY compilable LaTeX code.

STRICT RULES:
1) Always start with \\documentclass
2) Always include \\usepackage[utf8]{inputenc}
3) Complete structure: preamble + \\begin{document} + content + \\end{document}
4) NO explanatory text before or after the code
5) NO markdown code blocks (no ```latex or ```)
6) Raw LaTeX code only, ready to compile
7) Ensure the code compiles without errors with pdflatex
8) Use professional formatting and modern LaTeX practices
"""

PFE_EXAMPLE = r"""
=== PFE COVER PAGE EXAMPLE ===
\documentclass[12pt,a4paper]{report}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=2.5cm]{geometry}
\usepackage{xcolor}
\usepackage{hyperref}

\definecolor{maincolor}{RGB}{0, 83, 156}

\begin{document}
\begin{titlepage}
    \centering
    {\Large\textbf{UNIVERSITY NAME}}\\[1.5cm]
    \rule{\linewidth}{0.5mm}\\[0.4cm]
    {\Huge\textbf{\textcolor{maincolor}{FINAL YEAR PROJECT}}}\\
    \rule{\linewidth}{0.5mm}\\[1.5cm]
    {\LARGE\textbf{Project Title}}\\[2cm]
    \begin{minipage}{0.45\textwidth}
        \begin{flushleft}
            \textbf{Prepared by:}\\Student Name
        \end{flushleft}
    \end{minipage}
    \hfill
    \begin{minipage}{0.45\textwidth}
        \begin{flushright}
            \textbf{Supervised by:}\\Dr. Supervisor Name
        \end{flushright}
    \end{minipage}\\[2cm]
    {\large Academic Year: 2023 -- 2024}
\end{titlepage}
\end{document}
=== END EXAMPLE ===
"""

CV_EXAMPLE = r"""
=== CV EXAMPLE ===
\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=1.5cm]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage{hyperref}

\definecolor{headercolor}{RGB}{44, 62, 80}
\titleformat{\section}{\large\bfseries\color{headercolor}}{}{0em}{}[\titlerule]
\titlespacing{\section}{0pt}{12pt}{6pt}
\pagestyle{empty}
\setlength{\parindent}{0pt}

\begin{document}
\begin{center}
    {\Huge\textbf{John Doe}}\\[0.4cm]
    {\large Software Developer}\\[0.3cm]
    +1 234 567 890 | email@example.com | City, Country
\end{center}

\section{Professional Experience}
\textbf{Software Developer} \hfill 2022 -- Present\\
\textit{Company Name}
\begin{itemize}[noitemsep, topsep=3pt]
    \item Developed web applications using modern frameworks
    \item Collaborated with cross-functional teams
\end{itemize}

\section{Education}
\textbf{Master in Computer Science} \hfill 2020 -- 2022\\
\textit{University Name}

\section{Skills}
\textbf{Languages:} Python, JavaScript, Java\\
\textbf{Frameworks:} React, Node.js, Django
\end{document}
=== END EXAMPLE ===
"""

LETTER_EXAMPLE = r"""
=== COVER LETTER EXAMPLE ===
\documentclass[11pt,a4paper]{letter}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=2.5cm]{geometry}
\usepackage{hyperref}

\signature{John Doe}
\address{John Doe\\123 Main Street\\City, Country\\Phone: +1 234 567 890}
\date{\today}

\begin{document}
\begin{letter}{Hiring Manager\\Company Name\\456 Business Ave\\City, Country}

\opening{Dear Hiring Manager,}

I am writing to express my interest in the Software Developer position at your company.

With my background in computer science and experience in software development, I am confident in my ability to contribute to your team.

I look forward to discussing how I can contribute to your organization.

\closing{Sincerely,}

\end{letter}
\end{document}
=== END EXAMPLE ===
"""

REPORT_EXAMPLE = r"""
=== REPORT EXAMPLE ===
\documentclass[12pt,a4paper]{report}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=2.5cm]{geometry}
\usepackage{fancyhdr}
\usepackage{hyperref}

\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\leftmark}
\fancyhead[R]{\thepage}

\begin{document}
\begin{titlepage}
    \centering
    {\Large\textbf{TECHNICAL REPORT}}\\[2cm]
    {\Huge\textbf{Report Title}}\\[3cm]
    \textbf{Prepared by:} Author Name\\[0.5cm]
    {\large Date: \today}
\end{titlepage}

\tableofcontents
\newpage

\chapter{Introduction}
Introduction content here...

\chapter{Methodology}
Methodology content here...

\chapter{Results}
Results content here...

\chapter{Conclusion}
Conclusion content here...

\end{document}
=== END EXAMPLE ===
"""

PRESENTATION_EXAMPLE = r"""
=== BEAMER PRESENTATION EXAMPLE ===
\documentclass{beamer}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}

\usetheme{Madrid}
\usecolortheme{default}

\title{Presentation Title}
\author{Author Name}
\institute{Institution}
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

\section{Conclusion}
\begin{frame}{Conclusion}
    Thank you for your attention!
\end{frame}

\end{document}
=== END EXAMPLE ===
"""

# Document type configuration
DOCUMENT_TYPES = {
    "pfe": {
        "name": "Thesis/PFE Cover Page",
        "keywords": ["pfe", "thesis", "dissertation", "final year", "cover page", "title page", "memoir", "project"],
        "example": PFE_EXAMPLE
    },
    "cv": {
        "name": "CV / Resume",
        "keywords": ["cv", "curriculum", "vitae", "resume", "professional"],
        "example": CV_EXAMPLE
    },
    "letter": {
        "name": "Cover Letter",
        "keywords": ["letter", "cover", "motivation", "application", "candidature"],
        "example": LETTER_EXAMPLE
    },
    "report": {
        "name": "Report",
        "keywords": ["report", "technical", "internship", "stage", "documentation"],
        "example": REPORT_EXAMPLE
    },
    "presentation": {
        "name": "Presentation (Beamer)",
        "keywords": ["presentation", "beamer", "slides", "powerpoint", "talk"],
        "example": PRESENTATION_EXAMPLE
    }
}


def detect_document_type(user_request: str) -> str:
    """Detect document type from user request"""
    user_request_lower = user_request.lower()
    
    for doc_type, doc_info in DOCUMENT_TYPES.items():
        for keyword in doc_info["keywords"]:
            if keyword in user_request_lower:
                return doc_type
    
    # Default to report
    return "report"


def create_user_prompt(user_request: str) -> str:
    """Create the full prompt with example for the API"""
    doc_type = detect_document_type(user_request)
    doc_info = DOCUMENT_TYPES[doc_type]
    example = doc_info["example"]
    
    full_prompt = f"""
{example}

Based on the example above, generate a LaTeX document of type "{doc_info['name']}" for this request:

{user_request}

IMPORTANT: Return ONLY the LaTeX code. No explanations, no markdown, just raw LaTeX starting with \\documentclass.
"""
    return full_prompt